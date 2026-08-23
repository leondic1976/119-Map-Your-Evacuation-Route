'use client';

/**
 * 작도 캔버스.
 *
 * SVG 한 장 위에서 선택·이동·크기조절·개구부 배치·동선 작도·측정을 처리하고,
 * 연기 오버레이만 Canvas 2D 로 덧그린다(픽셀 단위 농도 표현).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PlanView from './PlanView';
import { store, useApp, useModel } from './useStore';
import {
  Plan,
  Pt,
  Room,
  Selection,
  emptyPlan,
  nid,
  planBounds,
  roomAt,
  ROOM_KIND_LABEL,
} from '../lib/types';
import {
  addDoor,
  addFacility,
  addNote,
  addRoute,
  addWindow,
  removeSelection,
  updateDoor,
  updateFacility,
  updateNote,
  updateRoom,
  updateRoute,
  updateWindow,
} from '../lib/store';
import { nearestWallSegment } from '../lib/walls';
import { orthogonalize } from '../lib/routing';
import { SmokeField, densityAt } from '../lib/firesim';
import { Grid, cellAt } from '../lib/grid';
import { C_ACCENT, C_DANGER } from './Symbols';
import { IconFit, IconMinus, IconPlus } from './Icons';

type Drag =
  | { type: 'none' }
  | { type: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { type: 'newroom'; from: Pt; to: Pt }
  | { type: 'move'; sel: Selection; from: Pt; orig: unknown }
  | { type: 'resize'; id: string; handle: string; orig: Room }
  | { type: 'movept'; routeId: string; index: number };

interface Props {
  field: SmokeField | null;
  grid: Grid;
  time: number;
  drillPath?: Pt[] | null;
  drillPos?: Pt | null;
  blocked?: { x: number; y: number; label: string }[];
  onPickIgnition?: (p: Pt) => void;
  pickMode?: boolean;
}

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

export default function Canvas({
  field,
  grid,
  time,
  drillPath,
  drillPos,
  blocked,
  onPickIgnition,
  pickMode,
}: Props) {
  const app = useApp();
  const { plan, view, tool, layers, selection, options, snap, snapSize } = app;
  const { model } = useModel(plan);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<Drag>({ type: 'none' });
  const [draft, setDraft] = useState<Pt[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);
  const [measure, setMeasure] = useState<Pt[]>([]);
  const [spaceDown, setSpaceDown] = useState(false);

  /* ---------- 좌표 변환 ---------- */

  const toWorld = useCallback(
    (e: { clientX: number; clientY: number }): Pt => {
      const el = svgRef.current;
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return {
        x: (e.clientX - r.left - view.ox) / view.zoom,
        y: (e.clientY - r.top - view.oy) / view.zoom,
      };
    },
    [view.ox, view.oy, view.zoom],
  );

  const snapVal = useCallback(
    (v: number) => (snap ? Math.round(v / snapSize) * snapSize : Math.round(v)),
    [snap, snapSize],
  );

  /** 주변 실 경계에 붙이기 */
  const snapPoint = useCallback(
    (p: Pt, ignoreId?: string): Pt => {
      const tol = 14 / view.zoom;
      let x = snapVal(p.x);
      let y = snapVal(p.y);
      if (snap) {
        for (const r of plan.rooms) {
          if (r.id === ignoreId) continue;
          for (const gx of [r.x, r.x + r.w]) if (Math.abs(p.x - gx) < tol) x = gx;
          for (const gy of [r.y, r.y + r.h]) if (Math.abs(p.y - gy) < tol) y = gy;
        }
      }
      return { x, y };
    },
    [plan.rooms, snap, snapVal, view.zoom],
  );

  /* ---------- 화면 맞춤 ---------- */

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const b = planBounds(plan);
    const pad = 90;
    const zoom = Math.min(
      (el.clientWidth - pad * 2) / Math.max(1, b.w),
      (el.clientHeight - pad * 2) / Math.max(1, b.h),
    );
    const z = Math.max(0.12, Math.min(3, zoom));
    store.setView({
      zoom: z,
      ox: (el.clientWidth - b.w * z) / 2 - b.x * z,
      oy: (el.clientHeight - b.h * z) / 2 - b.y * z,
    });
  }, [plan]);

  const fitRef = useRef(fit);
  fitRef.current = fit;
  const roomCount = plan.rooms.length;
  const didFit = useRef(false);
  useEffect(() => {
    if (roomCount > 0 && !didFit.current) {
      didFit.current = true;
      fitRef.current();
    }
    if (roomCount === 0) didFit.current = false;
  }, [roomCount]);

  useEffect(() => {
    const onFit = () => fitRef.current();
    window.addEventListener('evac:fit', onFit);
    return () => window.removeEventListener('evac:fit', onFit);
  }, []);

  /* ---------- 연기 오버레이 ---------- */

  useEffect(() => {
    const cv = canvasRef.current;
    const el = wrapRef.current;
    if (!cv || !el) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!field || !layers.smoke) return;

    const cell = grid.cell;
    const size = cell * view.zoom + 0.6;
    for (let r = 0; r < grid.rows; r += 1) {
      for (let c = 0; c < grid.cols; c += 1) {
        const i = r * grid.cols + c;
        if (!grid.walk[i]) continue;
        const d = densityAt(field, i, time);
        if (d <= 0.001) continue;
        const wx = grid.ox + c * cell;
        const wy = grid.oy + r * cell;
        const sx = wx * view.zoom + view.ox;
        const sy = wy * view.zoom + view.oy;
        if (sx < -size || sy < -size || sx > w || sy > h) continue;
        const flame = field.flame[i] <= time;
        if (flame) {
          ctx.fillStyle = `rgba(200,16,46,${0.32 + 0.4 * d})`;
        } else {
          const g = 88 - Math.round(38 * d);
          ctx.fillStyle = `rgba(${g},${g + 6},${g + 12},${0.16 + 0.62 * d})`;
        }
        ctx.fillRect(sx, sy, size, size);
      }
    }
  }, [field, time, view.zoom, view.ox, view.oy, grid, layers.smoke]);

  /* ---------- 키보드 ---------- */

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(true);
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === 'Escape') {
        setDraft([]);
        setMeasure([]);
        store.select(null);
      }
      if (e.key === 'Enter' && draft.length >= 2) finishRoute();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  /* ---------- 동선 작도 ---------- */

  const finishRoute = useCallback(() => {
    if (draft.length < 2) {
      setDraft([]);
      return;
    }
    const pts = orthogonalize(draft, 8);
    if (pts.length < 2) {
      setDraft([]);
      return;
    }
    store.update((p) =>
      addRoute(p, {
        kind: options.routeKind,
        points: pts,
        endpoint: 'custom',
        label: `직접 그린 ${options.routeKind === 'primary' ? '주' : '대체'} 동선`,
        manual: true,
      }),
    );
    setDraft([]);
    store.toast('동선을 추가했다.');
  }, [draft, options.routeKind]);

  /* ---------- 히트 테스트 ---------- */

  const hitTest = useCallback(
    (p: Pt): Selection | null => {
      const tol = 12 / view.zoom;
      for (const n of plan.notes) {
        if (Math.abs(p.x - n.x) < n.text.length * n.size * 0.6 && Math.abs(p.y - n.y + n.size / 2) < n.size) {
          return { kind: 'note', id: n.id };
        }
      }
      for (const f of plan.facilities) {
        const r = (f.size ?? 46) / 2 + 6;
        if (Math.abs(p.x - f.x) < r && Math.abs(p.y - f.y) < r) return { kind: 'facility', id: f.id };
      }
      for (const d of plan.doors) {
        const half = d.width / 2 + tol;
        const across = 18 + tol;
        const dx = Math.abs(p.x - d.x);
        const dy = Math.abs(p.y - d.y);
        if (d.dir === 'h' ? dx < half && dy < across : dy < half && dx < across) {
          return { kind: 'door', id: d.id };
        }
      }
      for (const w of plan.windows) {
        const half = w.width / 2 + tol;
        const across = 16 + tol;
        const dx = Math.abs(p.x - w.x);
        const dy = Math.abs(p.y - w.y);
        if (w.dir === 'h' ? dx < half && dy < across : dy < half && dx < across) {
          return { kind: 'window', id: w.id };
        }
      }
      for (const rt of plan.routes) {
        for (let i = 1; i < rt.points.length; i += 1) {
          if (distToSeg(p, rt.points[i - 1], rt.points[i]) < 14 / view.zoom + 5) {
            return { kind: 'route', id: rt.id };
          }
        }
      }
      const r = roomAt(plan, p);
      return r ? { kind: 'room', id: r.id } : null;
    },
    [plan, view.zoom],
  );

  /* ---------- 포인터 ---------- */

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 1 || spaceDown || tool === 'pan') {
      setDrag({ type: 'pan', sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy });
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const p = toWorld(e);

    if (pickMode && onPickIgnition) {
      onPickIgnition({ x: Math.round(p.x), y: Math.round(p.y) });
      return;
    }

    switch (tool) {
      case 'select': {
        const hit = hitTest(p);
        store.select(hit);
        if (hit) {
          store.begin();
          const orig =
            hit.kind === 'room'
              ? plan.rooms.find((r) => r.id === hit.id)
              : hit.kind === 'door'
                ? plan.doors.find((d) => d.id === hit.id)
                : hit.kind === 'window'
                  ? plan.windows.find((w) => w.id === hit.id)
                  : hit.kind === 'facility'
                    ? plan.facilities.find((f) => f.id === hit.id)
                    : hit.kind === 'note'
                      ? plan.notes.find((n) => n.id === hit.id)
                      : plan.routes.find((r) => r.id === hit.id);
          setDrag({ type: 'move', sel: hit, from: p, orig });
        }
        break;
      }
      case 'room': {
        const s = snapPoint(p);
        store.begin();
        setDrag({ type: 'newroom', from: s, to: s });
        break;
      }
      case 'door':
      case 'window': {
        const hit = nearestWallSegment(plan.rooms, p, 60);
        if (!hit) {
          store.toast('벽 위를 눌러 개구부를 놓는다.', 'warn');
          return;
        }
        const width = tool === 'door' ? options.doorWidth : options.windowWidth;
        const half = width / 2;
        const pos = Math.max(hit.a + half + 4, Math.min(hit.b - half - 4, hit.pos));
        if (hit.b - hit.a < width + 10) {
          store.toast('벽 구간이 개구부 폭보다 짧다.', 'warn');
          return;
        }
        const x = hit.dir === 'v' ? hit.line : pos;
        const y = hit.dir === 'v' ? pos : hit.line;
        if (tool === 'door') {
          const kind = options.doorKind;
          store.update((pl) =>
            addDoor(pl, {
              kind,
              x: Math.round(x),
              y: Math.round(y),
              dir: hit.dir,
              width,
              swing: 1,
              hinge: -1,
              alwaysOpen: kind === 'sliding',
            }),
          );
        } else {
          store.update((pl) =>
            addWindow(pl, {
              kind: 'window',
              x: Math.round(x),
              y: Math.round(y),
              dir: hit.dir,
              width,
            }),
          );
        }
        break;
      }
      case 'facility': {
        store.update((pl) =>
          addFacility(pl, {
            type: options.facility,
            x: Math.round(p.x),
            y: Math.round(p.y),
            rot: 0,
            size: options.facility === 'partition' ? 90 : undefined,
          }),
        );
        break;
      }
      case 'route': {
        const last = draft[draft.length - 1];
        const np = last ? axisSnap(last, p) : { x: Math.round(p.x), y: Math.round(p.y) };
        if (last && Math.abs(np.x - last.x) < 2 && Math.abs(np.y - last.y) < 2) {
          finishRoute();
          return;
        }
        setDraft(draft.concat([np]));
        break;
      }
      case 'note': {
        store.update((pl) =>
          addNote(pl, { x: Math.round(p.x), y: Math.round(p.y), text: '주기 내용', size: options.noteSize }),
        );
        store.toast('주기를 추가했다. 오른쪽에서 내용을 고친다.');
        break;
      }
      case 'measure': {
        if (measure.length >= 2) setMeasure([{ x: Math.round(p.x), y: Math.round(p.y) }]);
        else setMeasure(measure.concat([{ x: Math.round(p.x), y: Math.round(p.y) }]));
        break;
      }
      default:
        break;
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toWorld(e);
    setHover(p);
    store.setCursor({ x: Math.round(p.x), y: Math.round(p.y) });

    if (drag.type === 'pan') {
      store.setView({ ox: drag.ox + (e.clientX - drag.sx), oy: drag.oy + (e.clientY - drag.sy) });
      return;
    }
    if (drag.type === 'newroom') {
      setDrag({ ...drag, to: snapPoint(p) });
      return;
    }
    if (drag.type === 'resize') {
      const o = drag.orig;
      const s = snapPoint(p, o.id);
      let { x, y, w, h } = o;
      if (drag.handle.includes('w')) {
        const nx = Math.min(s.x, o.x + o.w - 40);
        w = o.x + o.w - nx;
        x = nx;
      }
      if (drag.handle.includes('e')) w = Math.max(40, s.x - o.x);
      if (drag.handle.includes('n')) {
        const ny = Math.min(s.y, o.y + o.h - 40);
        h = o.y + o.h - ny;
        y = ny;
      }
      if (drag.handle.includes('s')) h = Math.max(40, s.y - o.y);
      store.patchWith((pl) => updateRoom(pl, o.id, { x, y, w, h }));
      return;
    }
    if (drag.type === 'move') {
      const dx = p.x - drag.from.x;
      const dy = p.y - drag.from.y;
      const sel = drag.sel;
      if (sel.kind === 'room') {
        const o = drag.orig as Room;
        const np = snapPoint({ x: o.x + dx, y: o.y + dy }, o.id);
        store.patchWith((pl) => updateRoom(pl, sel.id, { x: np.x, y: np.y }));
      } else if (sel.kind === 'door') {
        const o = drag.orig as Plan['doors'][number];
        const hit = nearestWallSegment(plan.rooms, { x: o.x + dx, y: o.y + dy }, 80);
        if (hit) {
          const half = o.width / 2;
          const pos = Math.max(hit.a + half + 4, Math.min(hit.b - half - 4, hit.pos));
          const x = hit.dir === 'v' ? hit.line : pos;
          const y = hit.dir === 'v' ? pos : hit.line;
          store.patchWith((pl) => updateDoor(pl, sel.id, { x: Math.round(x), y: Math.round(y), dir: hit.dir }));
        }
      } else if (sel.kind === 'window') {
        const o = drag.orig as Plan['windows'][number];
        const hit = nearestWallSegment(plan.rooms, { x: o.x + dx, y: o.y + dy }, 80);
        if (hit) {
          const half = o.width / 2;
          const pos = Math.max(hit.a + half + 4, Math.min(hit.b - half - 4, hit.pos));
          const x = hit.dir === 'v' ? hit.line : pos;
          const y = hit.dir === 'v' ? pos : hit.line;
          store.patchWith((pl) => updateWindow(pl, sel.id, { x: Math.round(x), y: Math.round(y), dir: hit.dir }));
        }
      } else if (sel.kind === 'facility') {
        const o = drag.orig as Plan['facilities'][number];
        store.patchWith((pl) =>
          updateFacility(pl, sel.id, { x: Math.round(o.x + dx), y: Math.round(o.y + dy) }),
        );
      } else if (sel.kind === 'note') {
        const o = drag.orig as Plan['notes'][number];
        store.patchWith((pl) => updateNote(pl, sel.id, { x: Math.round(o.x + dx), y: Math.round(o.y + dy) }));
      } else if (sel.kind === 'route') {
        const o = drag.orig as Plan['routes'][number];
        store.patchWith((pl) =>
          updateRoute(pl, sel.id, {
            points: o.points.map((q) => ({ x: Math.round(q.x + dx), y: Math.round(q.y + dy) })),
          }),
        );
      }
    }
  };

  const onPointerUp = () => {
    if (drag.type === 'newroom') {
      const { from, to } = drag;
      const x = Math.min(from.x, to.x);
      const y = Math.min(from.y, to.y);
      const w = Math.abs(to.x - from.x);
      const h = Math.abs(to.y - from.y);
      store.cancel();
      if (w >= 50 && h >= 50) {
        const kind = options.roomKind;
        const same = plan.rooms.filter((r) => r.kind === kind).length;
        store.update((pl) => ({
          ...pl,
          rooms: pl.rooms.concat([
            {
              id: nid('r'),
              kind,
              name: same > 0 ? `${ROOM_KIND_LABEL[kind]}${same + 1}` : ROOM_KIND_LABEL[kind],
              x,
              y,
              w,
              h,
            },
          ]),
        }));
      }
    } else if (drag.type === 'move' || drag.type === 'resize') {
      store.end();
    }
    setDrag({ type: 'none' });
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const center = { x: e.clientX - r.left, y: e.clientY - r.top };
    store.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, center);
  };

  const startResize = (e: React.PointerEvent, room: Room, handle: string) => {
    e.stopPropagation();
    store.begin();
    setDrag({ type: 'resize', id: room.id, handle, orig: { ...room } });
  };

  /* ---------- 선택 표시 ---------- */

  const selRoom = selection?.kind === 'room' ? plan.rooms.find((r) => r.id === selection.id) : undefined;
  const hs = 9 / view.zoom;

  const selOutline = useMemo(() => {
    if (!selection) return null;
    const sw = 2 / view.zoom;
    if (selection.kind === 'room') {
      const r = plan.rooms.find((x) => x.id === selection.id);
      if (!r) return null;
      return <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={C_ACCENT} strokeWidth={sw * 1.6} />;
    }
    if (selection.kind === 'door' || selection.kind === 'window') {
      const o =
        selection.kind === 'door'
          ? plan.doors.find((d) => d.id === selection.id)
          : plan.windows.find((w) => w.id === selection.id);
      if (!o) return null;
      const half = o.width / 2;
      return o.dir === 'h' ? (
        <rect x={o.x - half} y={o.y - 16} width={o.width} height={32} fill="none" stroke={C_ACCENT} strokeWidth={sw * 1.6} />
      ) : (
        <rect x={o.x - 16} y={o.y - half} width={32} height={o.width} fill="none" stroke={C_ACCENT} strokeWidth={sw * 1.6} />
      );
    }
    if (selection.kind === 'facility') {
      const f = plan.facilities.find((x) => x.id === selection.id);
      if (!f) return null;
      const s = (f.size ?? 46) / 2 + 8;
      return <rect x={f.x - s} y={f.y - s} width={s * 2} height={s * 2} fill="none" stroke={C_ACCENT} strokeWidth={sw * 1.6} />;
    }
    if (selection.kind === 'route') {
      const r = plan.routes.find((x) => x.id === selection.id);
      if (!r) return null;
      return (
        <g>
          <path
            d={r.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
            fill="none"
            stroke={C_ACCENT}
            strokeWidth={16}
            opacity={0.28}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {r.points.map((p, i) => (
            <rect key={i} x={p.x - hs / 2} y={p.y - hs / 2} width={hs} height={hs} fill="#fff" stroke={C_ACCENT} strokeWidth={sw} />
          ))}
        </g>
      );
    }
    if (selection.kind === 'note') {
      const n = plan.notes.find((x) => x.id === selection.id);
      if (!n) return null;
      return (
        <rect
          x={n.x - 6}
          y={n.y - n.size}
          width={Math.max(60, n.text.length * n.size * 0.62)}
          height={n.size * 1.4}
          fill="none"
          stroke={C_ACCENT}
          strokeWidth={sw * 1.6}
        />
      );
    }
    return null;
  }, [selection, plan, view.zoom, hs]);

  const preview = drag.type === 'newroom' ? drag : null;
  const draftPreview = tool === 'route' && draft.length > 0 && hover ? axisSnap(draft[draft.length - 1], hover) : null;

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      {/* 연기는 실 바탕 위·선묘 아래에 놓는다 — 도면이 가려지지 않는다 */}
      <canvas className="smoke" ref={canvasRef} />
      <svg
        ref={svgRef}
        className={`stage tool-${tool}${drag.type === 'pan' ? ' panning' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          onPointerUp();
          store.setCursor(null);
        }}
        onWheel={onWheel}
        onDoubleClick={() => tool === 'route' && finishRoute()}
        role="application"
        aria-label="작도 캔버스"
      >
        <g transform={`translate(${view.ox} ${view.oy}) scale(${view.zoom})`}>
          {layers.grid && <GridLines view={view} wrap={wrapRef.current} />}
          <PlanView
            plan={plan}
            model={model}
            layers={layers}
            ignition={field ? field.origin : null}
            drillPath={drillPath}
            drillPos={drillPos}
            blocked={blocked}
            dimRooms={Boolean(field && layers.smoke)}
            showNorth
            showScaleBar
          />

          {selOutline}

          {selRoom &&
            HANDLES.map((h) => {
              const pos = handlePos(selRoom, h);
              return (
                <rect
                  key={h}
                  x={pos.x - hs / 2}
                  y={pos.y - hs / 2}
                  width={hs}
                  height={hs}
                  fill="#fff"
                  stroke={C_ACCENT}
                  strokeWidth={2 / view.zoom}
                  style={{ cursor: `${h}-resize` }}
                  onPointerDown={(e) => startResize(e, selRoom, h)}
                />
              );
            })}

          {preview && (
            <rect
              x={Math.min(preview.from.x, preview.to.x)}
              y={Math.min(preview.from.y, preview.to.y)}
              width={Math.abs(preview.to.x - preview.from.x)}
              height={Math.abs(preview.to.y - preview.from.y)}
              fill="rgba(15,61,104,0.12)"
              stroke={C_ACCENT}
              strokeWidth={2 / view.zoom}
              strokeDasharray={`${8 / view.zoom} ${5 / view.zoom}`}
            />
          )}

          {draft.length > 0 && (
            <g>
              <path
                d={draft
                  .concat(draftPreview ? [draftPreview] : [])
                  .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
                  .join(' ')}
                fill="none"
                stroke={options.routeKind === 'primary' ? '#0e7c4f' : C_ACCENT}
                strokeWidth={7}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="14 9"
              />
              {draft.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={7 / view.zoom + 2} fill="#fff" stroke={C_ACCENT} strokeWidth={2 / view.zoom} />
              ))}
            </g>
          )}

          {measure.length > 0 && (
            <MeasureOverlay pts={measure} hover={hover} zoom={view.zoom} />
          )}

          {pickMode && hover && (
            <g transform={`translate(${hover.x} ${hover.y})`} pointerEvents="none">
              <circle r={26} fill="none" stroke={C_DANGER} strokeWidth={3 / view.zoom} strokeDasharray="7 5" />
              <path d={`M${-34} 0h${68}M0 ${-34}v${68}`} stroke={C_DANGER} strokeWidth={1.6 / view.zoom} />
            </g>
          )}
        </g>
      </svg>

      {plan.rooms.length === 0 && (
        <div className="canvas-empty">
          <div>
            <strong>아직 평면이 없다</strong>
            오른쪽에서 표준 평면을 불러오거나, 도면 사진을 올려 자동 인식하거나,
            <br />
            실 작도 도구(<span className="kbd">R</span>)로 직접 그린다.
          </div>
        </div>
      )}

      <div className="zoom-pad">
        <button type="button" title="확대" aria-label="확대" onClick={() => store.zoomBy(1.2)}>
          <IconPlus size={16} />
        </button>
        <button type="button" title="축소" aria-label="축소" onClick={() => store.zoomBy(1 / 1.2)}>
          <IconMinus size={16} />
        </button>
        <button type="button" title="화면 맞춤" aria-label="화면 맞춤" onClick={fit}>
          <IconFit size={16} />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function handlePos(r: Room, h: string): Pt {
  const x = h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2;
  const y = h.includes('n') ? r.y : h.includes('s') ? r.y + r.h : r.y + r.h / 2;
  return { x, y };
}

function axisSnap(from: Pt, to: Pt): Pt {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  return dx >= dy ? { x: Math.round(to.x), y: from.y } : { x: from.x, y: Math.round(to.y) };
}

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function GridLines({ view, wrap }: { view: { zoom: number; ox: number; oy: number }; wrap: HTMLDivElement | null }) {
  const step = view.zoom > 1.1 ? 50 : view.zoom > 0.45 ? 100 : 300;
  const w = wrap?.clientWidth ?? 1200;
  const h = wrap?.clientHeight ?? 800;
  const x0 = Math.floor(-view.ox / view.zoom / step) * step;
  const y0 = Math.floor(-view.oy / view.zoom / step) * step;
  const x1 = x0 + w / view.zoom + step;
  const y1 = y0 + h / view.zoom + step;
  const lines: React.ReactElement[] = [];
  for (let x = x0; x <= x1; x += step) {
    lines.push(<line key={`x${x}`} x1={x} y1={y0} x2={x} y2={y1} stroke="#dbe1e8" strokeWidth={1 / view.zoom} />);
  }
  for (let y = y0; y <= y1; y += step) {
    lines.push(<line key={`y${y}`} x1={x0} y1={y} x2={x1} y2={y} stroke="#dbe1e8" strokeWidth={1 / view.zoom} />);
  }
  return <g pointerEvents="none">{lines}</g>;
}

function MeasureOverlay({ pts, hover, zoom }: { pts: Pt[]; hover: Pt | null; zoom: number }) {
  const a = pts[0];
  const b = pts[1] ?? hover;
  if (!b) return null;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return (
    <g pointerEvents="none">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={C_DANGER} strokeWidth={2.4 / zoom} />
      <circle cx={a.x} cy={a.y} r={5 / zoom} fill={C_DANGER} />
      <circle cx={b.x} cy={b.y} r={5 / zoom} fill={C_DANGER} />
      <rect
        x={mid.x - 46 / zoom}
        y={mid.y - 26 / zoom}
        width={92 / zoom}
        height={22 / zoom}
        rx={3 / zoom}
        fill="#fff"
        stroke={C_DANGER}
        strokeWidth={1.4 / zoom}
      />
      <text
        x={mid.x}
        y={mid.y - 10 / zoom}
        textAnchor="middle"
        fontSize={14 / zoom}
        fontWeight={700}
        fill={C_DANGER}
      >
        {(d / 100).toFixed(2)}m
      </text>
    </g>
  );
}

export { emptyPlan, removeSelection };
