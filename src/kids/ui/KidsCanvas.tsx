'use client';

/**
 * 어린이 도면 편집기 — PlanSvg 위에 조작을 얹는다.
 *
 * 그리기 편의가 최우선이다 (plan2-1.md §2).
 *   D2  팔레트 클릭 → 도면 클릭이면 표준 크기로 놓인다. 끌기는 선택
 *   D3  맞댄 벽의 문 후보를 한 번 눌러 문을 놓는다
 *   D4  겹치는 배치는 시도부터 막는다
 *   FR-7.9 화면은 늘 내용에 맞춰 들어온다. 줌 조작이 없다
 * 게임 중에는 같은 SVG 위에 위험장을 그리고, 칸을 누르면 그 방향으로 한 칸 간다.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { Cell, Rect, RoomKind, Side } from '../types/plan';
import { isOpening, isPoint, isRoom } from '../types/plan';
import type { Direction } from '../types/game';
import { roomAt, canPlaceRoom } from '../core/grid/occupancy';
import { boundarySlots, lineCells, nearestSlot, rectFromDrag, sameCell, slotCenter } from '../core/grid/geometry';
import { doorCandidates } from '../core/grid/doors';
import { suggestedRoute, useKids } from '../store/kidsStore';
import { CS, PlanSvg, type GameLayer } from './PlanSvg';

type Handle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

type Drag =
  | { kind: 'room'; start: Cell; moved: boolean }
  | { kind: 'move'; id: string; start: Cell }
  | { kind: 'roomMove'; id: string; start: Cell }
  | { kind: 'resize'; id: string; handle: Handle; start: Cell; base: Rect }
  | { kind: 'route'; last: Cell };

interface Props {
  showHint: boolean;
  grayscale: boolean;
}

export default function KidsCanvas({ showHint, grayscale }: Props) {
  const plan = useKids((s) => s.plan);
  const routes = useKids((s) => s.routes);
  const hazardId = useKids((s) => s.hazardId);
  const routeSlot = useKids((s) => s.routeSlot);
  const tool = useKids((s) => s.tool);
  const armed = useKids((s) => s.armed);
  const selection = useKids((s) => s.selection);
  const drafting = useKids((s) => s.drafting);
  const highlight = useKids((s) => s.highlight);
  const profile = useKids((s) => s.profile);
  const step = useKids((s) => s.step);
  const mode = useKids((s) => s.mode);
  const game = useKids((s) => s.game);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<Rect | null>(null);
  const [ghost, setGhost] = useState<{ cell: Cell; side: Side } | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [movePreview, setMovePreview] = useState<{ id: string; cell: Cell } | null>(null);
  const [roomShift, setRoomShift] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [resizePreview, setResizePreview] = useState<Rect | null>(null);

  const pair = routes[hazardId];
  const inGame = mode === 'game' && game;
  const suggested = useMemo(
    () => (showHint && !inGame ? suggestedRoute({ plan, hazardId, routeSlot, profile, routes }) : null),
    [showHint, inGame, plan, hazardId, routeSlot, profile, routes],
  );
  const candidates = useMemo(() => (inGame ? [] : doorCandidates(plan)), [plan, inGame]);
  const slots = useMemo(() => plan.blocks.filter(isRoom).flatMap((r) => boundarySlots(r.rect)), [plan]);

  /* 화면 좌표 → 셀 좌표(실수) */
  const toPoint = useCallback((e: React.PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x / CS, y: p.y / CS };
  }, []);

  const toCell = useCallback(
    (p: { x: number; y: number }): Cell => ({
      x: Math.max(0, Math.min(plan.grid.width - 1, Math.floor(p.x))),
      y: Math.max(0, Math.min(plan.grid.height - 1, Math.floor(p.y))),
    }),
    [plan.grid.width, plan.grid.height],
  );

  /** 무엇을 눌렀나 — 물건 > 문·창 > 방 */
  const hitTest = useCallback(
    (p: { x: number; y: number }): string | null => {
      const c = toCell(p);
      const pt = plan.blocks.find((b) => isPoint(b) && sameCell(b.cell, c));
      if (pt) return pt.id;
      for (const b of plan.blocks) {
        if (!isOpening(b)) continue;
        const sc = slotCenter(b.cell, b.side);
        if ((sc.x - p.x) ** 2 + (sc.y - p.y) ** 2 < 0.16) return b.id;
      }
      return roomAt(plan, c)?.id ?? null;
    },
    [plan, toCell],
  );

  /** 문 후보를 눌렀나 */
  const candidateAt = (p: { x: number; y: number }) => {
    for (const d of candidates) {
      const sc = slotCenter(d.cell, d.side);
      if ((sc.x - p.x) ** 2 + (sc.y - p.y) ** 2 < 0.2) return d;
    }
    return null;
  };

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== undefined && e.button !== 0) return;
    const s = useKids.getState();
    const p = toPoint(e);
    const c = toCell(p);

    /* 게임 — 누른 칸 쪽으로 한 칸 */
    if (inGame && game) {
      const pc = game.state.player.cell;
      const dx = c.x - pc.x;
      const dy = c.y - pc.y;
      if (dx === 0 && dy === 0) return;
      const d: Direction = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      s.gameMove(d);
      return;
    }
    if (mode !== 'edit') return;

    /* 온보딩 — 방 누르기, 만나는 곳 누르기 */
    if (step === 'mySpot') {
      s.pickMyRoom(c);
      return;
    }
    if (step === 'meeting') {
      s.pickMeeting(c);
      return;
    }

    const target = e.target as Element;
    const handle = target.getAttribute?.('data-handle') as Handle | null;
    if (tool === 'select' && handle && selection) {
      const room = plan.blocks.find((b) => b.id === selection);
      if (room && isRoom(room)) {
        dragRef.current = { kind: 'resize', id: room.id, handle, start: c, base: room.rect };
        setResizePreview(room.rect);
        svgRef.current?.setPointerCapture(e.pointerId);
        return;
      }
    }

    /* 문 후보 — 어떤 도구든 한 번에 문이 놓인다 (FR-7.3) */
    if (tool !== 'route') {
      const cand = candidateAt(p);
      if (cand) {
        s.placeOpening('door', cand.cell, cand.side);
        return;
      }
    }

    if (tool === 'place' && armed) {
      if (armed.category === 'room') {
        dragRef.current = { kind: 'room', start: c, moved: false };
        setPreview(null);
      } else if (armed.category === 'opening') {
        const slot = nearestSlot(slots, p);
        if (slot) {
          const sc = slotCenter(slot.cell, slot.side);
          if ((sc.x - p.x) ** 2 + (sc.y - p.y) ** 2 < 0.5) s.placeOpening(armed.id as never, slot.cell, slot.side);
          else s.notify('문·창은 방의 벽 위에 놓는다. 벽 가까이를 눌러 보자.', 'warn');
        } else {
          s.notify('먼저 방을 만들어야 문·창을 놓을 수 있다.', 'warn');
        }
      } else {
        s.placePoint(armed.category, armed.id as never, c);
      }
    } else if (tool === 'select') {
      const id = hitTest(p);
      s.select(id);
      if (id) {
        const b = plan.blocks.find((x) => x.id === id);
        if (b && isPoint(b)) dragRef.current = { kind: 'move', id, start: c };
        else if (b && isRoom(b)) dragRef.current = { kind: 'roomMove', id, start: c };
      }
    } else if (tool === 'route') {
      s.startRoute(c);
      dragRef.current = { kind: 'route', last: c };
    } else if (tool === 'erase') {
      const id = hitTest(p);
      if (id) s.removeBlock(id);
    }
    if (dragRef.current) svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (inGame) return;
    const p = toPoint(e);
    const c = toCell(p);
    if (!hover || !sameCell(hover, c)) setHover(c);

    if (tool === 'place' && armed?.category === 'opening') {
      const slot = nearestSlot(slots, p);
      if (slot) {
        const sc = slotCenter(slot.cell, slot.side);
        setGhost((sc.x - p.x) ** 2 + (sc.y - p.y) ** 2 < 0.5 ? slot : null);
      } else setGhost(null);
    } else if (ghost) setGhost(null);

    const d = dragRef.current;
    if (!d) return;
    const s = useKids.getState();
    switch (d.kind) {
      case 'room':
        if (!sameCell(d.start, c)) d.moved = true;
        setPreview(rectFromDrag(d.start, c));
        break;
      case 'move':
        setMovePreview({ id: d.id, cell: c });
        break;
      case 'roomMove':
        setRoomShift({ id: d.id, dx: c.x - d.start.x, dy: c.y - d.start.y });
        break;
      case 'resize':
        setResizePreview(applyHandle(d.base, d.handle, c.x - d.start.x, c.y - d.start.y));
        break;
      case 'route':
        if (!sameCell(d.last, c)) {
          for (const stepCell of lineCells(d.last, c)) s.extendRoute(stepCell);
          d.last = c;
        }
        break;
      default:
        break;
    }
  };

  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* 이미 풀렸다 */
    }
    if (!d) return;
    const s = useKids.getState();
    switch (d.kind) {
      case 'room':
        /* 그냥 눌렀으면 표준 크기, 끌었으면 그 크기 (FR-7.1) */
        if (armed) s.placeRoom(armed.id as RoomKind, d.start, d.moved && preview ? preview : undefined);
        setPreview(null);
        break;
      case 'move':
        if (movePreview && !sameCell(movePreview.cell, d.start)) s.moveBlock(d.id, movePreview.cell);
        setMovePreview(null);
        break;
      case 'roomMove':
        if (roomShift && (roomShift.dx || roomShift.dy)) s.moveRoom(d.id, roomShift.dx, roomShift.dy);
        setRoomShift(null);
        break;
      case 'resize':
        if (resizePreview) s.resizeRoom(d.id, resizePreview);
        setResizePreview(null);
        break;
      case 'route':
        s.endRoute();
        break;
      default:
        break;
    }
  };

  const onLeave = () => {
    setHover(null);
    setGhost(null);
  };

  const selectedRoom = selection ? plan.blocks.find((b) => b.id === selection && isRoom(b)) : undefined;
  const cursor = inGame
    ? 'pointer'
    : step === 'mySpot' || step === 'meeting'
      ? 'pointer'
      : tool === 'route'
        ? 'crosshair'
        : tool === 'erase'
          ? 'not-allowed'
          : tool === 'place'
            ? 'copy'
            : 'default';

  const W = plan.grid.width * CS;
  const H = plan.grid.height * CS;

  const gameLayer: GameLayer | null =
    inGame && game
      ? {
          field: game.state.field,
          origin: game.state.origin,
          player: { ...game.state.player, character: profile.playerCharacter },
          doorState: game.state.doorState,
          goalCells: game.goalCells.map((g) => g.cell),
          visionRadius: game.state.player.visionRadius,
          fog: true,
        }
      : null;

  return (
    <div className={`k-canvas${grayscale ? ' k-gray' : ''}`} data-tool={tool} data-mode={mode} style={{ cursor }}>
      <div className="k-canvas-inner" style={{ aspectRatio: `${W} / ${H}` }}>
        <PlanSvg
          svgRef={svgRef}
          plan={plan}
          routePair={pair}
          showSlots={inGame ? ['primary'] : ['primary', 'alternate']}
          ghostRoutes={Boolean(inGame)}
          drafting={drafting}
          draftSlot={routeSlot}
          suggested={suggested}
          highlight={inGame ? null : highlight}
          selection={inGame ? null : selection}
          style={profile.blockStyle}
          gradeMode={profile.gradeMode}
          doorCandidates={mode === 'edit' && step !== 'mySpot' && step !== 'meeting' ? candidates : undefined}
          game={gameLayer}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onLeave}
          className="k-stage"
        >
          {preview && (
            <rect
              x={preview.x * CS}
              y={preview.y * CS}
              width={preview.w * CS}
              height={preview.h * CS}
              fill={canPlaceRoom(plan, preview) ? '#7ea6ce' : '#d92142'}
              fillOpacity={0.3}
              stroke={canPlaceRoom(plan, preview) ? '#0f3d68' : '#c8102e'}
              strokeWidth={3}
              strokeDasharray="6 4"
              style={{ pointerEvents: 'none' }}
            />
          )}
          {ghost && (
            <g
              transform={`translate(${slotCenter(ghost.cell, ghost.side).x * CS} ${slotCenter(ghost.cell, ghost.side).y * CS}) rotate(${
                ghost.side === 'N' ? 0 : ghost.side === 'S' ? 180 : ghost.side === 'W' ? -90 : 90
              })`}
              style={{ pointerEvents: 'none' }}
            >
              <rect x={-CS * 0.43} y={-6} width={CS * 0.86} height={12} rx={3} fill="#ffd166" fillOpacity={0.8} stroke="#e0a100" strokeWidth={2} />
            </g>
          )}
          {/* 표준 크기 미리보기 — 방을 장전하고 도면 위에 있을 때 */}
          {hover && !preview && !inGame && tool === 'place' && armed?.category === 'room' && (
            <RoomGhost plan={plan} at={hover} kind={armed.id} />
          )}
          {hover && !preview && !ghost && !inGame && (tool === 'route' || step === 'mySpot' || step === 'meeting' || (tool === 'place' && armed && armed.category !== 'room' && armed.category !== 'opening')) && (
            <rect x={hover.x * CS + 2} y={hover.y * CS + 2} width={CS - 4} height={CS - 4} rx={5} fill="#0f3d68" fillOpacity={0.12} stroke="#0f3d68" strokeWidth={2} strokeDasharray="4 3" style={{ pointerEvents: 'none' }} />
          )}
          {movePreview && (
            <rect x={movePreview.cell.x * CS + 2} y={movePreview.cell.y * CS + 2} width={CS - 4} height={CS - 4} rx={5} fill="#0f3d68" fillOpacity={0.2} stroke="#0f3d68" strokeWidth={2} style={{ pointerEvents: 'none' }} />
          )}
          {roomShift && selectedRoom && isRoom(selectedRoom) && (
            <rect
              x={(selectedRoom.rect.x + roomShift.dx) * CS}
              y={(selectedRoom.rect.y + roomShift.dy) * CS}
              width={selectedRoom.rect.w * CS}
              height={selectedRoom.rect.h * CS}
              fill="#7ea6ce"
              fillOpacity={0.25}
              stroke="#0f3d68"
              strokeWidth={3}
              strokeDasharray="6 4"
              style={{ pointerEvents: 'none' }}
            />
          )}
          {resizePreview && (
            <rect
              x={resizePreview.x * CS}
              y={resizePreview.y * CS}
              width={resizePreview.w * CS}
              height={resizePreview.h * CS}
              fill="none"
              stroke={canPlaceRoom(plan, resizePreview, selection ?? undefined) ? '#0f3d68' : '#c8102e'}
              strokeWidth={3}
              strokeDasharray="6 4"
              style={{ pointerEvents: 'none' }}
            />
          )}
          {!inGame && tool === 'select' && selectedRoom && isRoom(selectedRoom) && !roomShift && <ResizeHandles rect={selectedRoom.rect} />}
        </PlanSvg>
      </div>
    </div>
  );
}

/** 방을 놓기 전 표준 크기 미리보기 — 겹치면 붉게 (D4) */
function RoomGhost({ plan, at, kind }: { plan: Parameters<typeof canPlaceRoom>[0]; at: Cell; kind: string }) {
  const size = { bedroom: { w: 4, h: 4 }, living: { w: 6, h: 5 }, kitchen: { w: 4, h: 4 }, bath: { w: 3, h: 3 }, entry: { w: 3, h: 3 }, balcony: { w: 6, h: 2 }, utility: { w: 3, h: 2 }, corridor: { w: 5, h: 2 }, stair: { w: 3, h: 4 }, elevator_hall: { w: 3, h: 3 } }[kind] ?? { w: 4, h: 4 };
  const r = {
    x: Math.max(0, Math.min(plan.grid.width - size.w, at.x)),
    y: Math.max(0, Math.min(plan.grid.height - size.h, at.y)),
    w: size.w,
    h: size.h,
  };
  const ok = canPlaceRoom(plan, r);
  return (
    <rect
      x={r.x * CS}
      y={r.y * CS}
      width={r.w * CS}
      height={r.h * CS}
      fill={ok ? '#7ea6ce' : '#d92142'}
      fillOpacity={0.22}
      stroke={ok ? '#0f3d68' : '#c8102e'}
      strokeWidth={2.5}
      strokeDasharray="6 4"
      style={{ pointerEvents: 'none' }}
    />
  );
}

function ResizeHandles({ rect }: { rect: Rect }) {
  const x0 = rect.x * CS;
  const y0 = rect.y * CS;
  const x1 = (rect.x + rect.w) * CS;
  const y1 = (rect.y + rect.h) * CS;
  const xm = (x0 + x1) / 2;
  const ym = (y0 + y1) / 2;
  const hs: { h: Handle; x: number; y: number; cursor: string }[] = [
    { h: 'nw', x: x0, y: y0, cursor: 'nwse-resize' },
    { h: 'n', x: xm, y: y0, cursor: 'ns-resize' },
    { h: 'ne', x: x1, y: y0, cursor: 'nesw-resize' },
    { h: 'e', x: x1, y: ym, cursor: 'ew-resize' },
    { h: 'se', x: x1, y: y1, cursor: 'nwse-resize' },
    { h: 's', x: xm, y: y1, cursor: 'ns-resize' },
    { h: 'sw', x: x0, y: y1, cursor: 'nesw-resize' },
    { h: 'w', x: x0, y: ym, cursor: 'ew-resize' },
  ];
  const r = 8;
  return (
    <g>
      {hs.map((h) => (
        <rect key={h.h} data-handle={h.h} x={h.x - r} y={h.y - r} width={r * 2} height={r * 2} rx={2} fill="#ffffff" stroke="#0f3d68" strokeWidth={2} style={{ cursor: h.cursor }} />
      ))}
    </g>
  );
}

function applyHandle(base: Rect, handle: Handle, dx: number, dy: number): Rect {
  let { x, y, w, h } = base;
  if (handle.includes('n')) {
    const ny = Math.min(y + dy, y + h - 2);
    h += y - ny;
    y = ny;
  }
  if (handle.includes('s')) h = Math.max(2, h + dy);
  if (handle.includes('w')) {
    const nx = Math.min(x + dx, x + w - 2);
    w += x - nx;
    x = nx;
  }
  if (handle.includes('e')) w = Math.max(2, w + dx);
  return { x, y, w, h };
}
