/**
 * 지도 그림 — 그리기·대피 연습·인쇄가 모두 이 SVG 하나를 쓴다.
 * 처음 네모 한 칸이 100 단위다. 점 간격을 좁혀도 그림 크기는 그대로이고 점 하나의 크기만 줄어든다.
 * 포인터는 지금 점 단위 좌표로 바꿔서 알려 준다.
 */
import { memo, useEffect, useId, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { edgeAngle, edgeEnds, edgeKeys, edgeLength, edgeMid, edgeNormal, edgeSides, isSlanted, parseEdge } from '../core/grid';
import { arrangeLabels, type Label, type Rect } from '../core/labels';
import { doorSize, doorSwing, doorTurn, openingWidth, type DoorSwing } from '../core/doors';
import { outsidePath } from '../core/drill';
import { routePoints } from '../core/path';
import { clampView, fullView, panBy, viewBoxOf, zoomAround, type Box } from '../core/zoom';
import { OUT, type ItemKind, type Layout, type MarkId, type OutsideSide, type Piece, type Plan, type Pt } from '../core/types';
import { itemSize } from '../core/items';
import { ITEMS } from '../content/items';
import { cellLabel, MARK_NAME, type LookId } from '../content/names';
import { getApp, setView, useApp } from '../store/app';
import { MarkGlyph } from './art';

export const U = 100;
/** 지금 점 한 칸의 그림 크기 */
export const unitOf = (plan: Plan): number => U / (plan.density ?? 1);
/** 그림 둘레 여백 — 집 위나 옆으로 나가는 화살표가 잘리지 않을 만큼 둔다 */
const MARGIN = 84;
const STRIP_GAP = 34;
const STRIP_H = 112;

const STRIP_ROOM = STRIP_GAP + STRIP_H + MARGIN + 26;

/** 그림 전체의 범위 — 집 밖 띠가 놓이는 쪽으로 넓어진다 */
export const planBox = (plan: Plan): Box => {
  const w = plan.cols * unitOf(plan);
  const h = plan.rows * unitOf(plan);
  switch (plan.outside ?? 'bottom') {
    case 'top':
      return { x: -MARGIN, y: -STRIP_ROOM, w: w + MARGIN * 2, h: h + MARGIN + STRIP_ROOM };
    case 'left':
      return { x: -STRIP_ROOM, y: -MARGIN, w: w + MARGIN + STRIP_ROOM, h: h + MARGIN * 2 };
    case 'right':
      return { x: -MARGIN, y: -MARGIN, w: w + MARGIN + STRIP_ROOM, h: h + MARGIN * 2 };
    default:
      return { x: -MARGIN, y: -MARGIN, w: w + MARGIN * 2, h: h + MARGIN + STRIP_ROOM };
  }
};

/** 집 밖 띠의 자리 */
function stripRect(side: OutsideSide, w: number, h: number): { x: number; y: number; w: number; h: number } {
  switch (side) {
    case 'top':
      return { x: -30, y: -STRIP_GAP - STRIP_H, w: w + 60, h: STRIP_H };
    case 'left':
      return { x: -STRIP_GAP - STRIP_H, y: -30, w: STRIP_H, h: h + 60 };
    case 'right':
      return { x: w + STRIP_GAP, y: -30, w: STRIP_H, h: h + 60 };
    default:
      return { x: -30, y: h + STRIP_GAP, w: w + 60, h: STRIP_H };
  }
}

/** 그리다가 손이 화면 가장자리에 이르면 종이가 따라 움직인다 */
const EDGE_PX = 44;
const EDGE_SPEED = 7;

export interface PlanViewProps {
  plan: Plan;
  layout: Layout;
  look?: LookId;
  showDots?: boolean;
  /** 그리는 중인 획 */
  stroke?: Pt[];
  /** 획이 아직 그은 것이 아니라 미리 보이는 것이다 — 연하게 그린다 */
  strokeHint?: boolean;
  armed?: Pt | null;
  hotEdge?: string | null;
  /** 반짝이는 칸들 (칸 id · `out`) */
  glow?: string[];
  /** 살펴볼 칸 — 밖으로 이어지지 않은 칸 */
  warn?: string[];
  showRoute?: boolean;
  showLabels?: boolean;
  /** 이름 없는 칸의 물음표. 인쇄물에는 넣지 않는다 */
  showUnknown?: boolean;
  /** 대피 연습 위험 단계: 칸 id → 0 없음 · 1 옅음 · 2 짙음 · 3 막힘 */
  hazard?: Record<string, 0 | 1 | 2 | 3>;
  /** 위험 값(0~100). 있으면 연기가 값에 따라 서서히 짙어진다 */
  heat?: Record<string, number>;
  /** 위험이 시작된 칸과 자리. 불꽃이 여기서부터 넓어진다 */
  fire?: { cell: string; at: Pt };
  closedDoors?: string[];
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
  /** 크게 보고 옮길 수 있다 */
  zoomable?: boolean;
  /** 이쪽 아래에 방향키 판이 떠 있다. 지도를 반대쪽 위로 붙여 남는 자리를 판에 내준다 */
  padSide?: 'left' | 'right';
  /** 끄는 손이 가장자리에 이르면 종이가 따라온다 */
  edgePan?: boolean;
  onPointer?: (kind: 'down' | 'move' | 'up' | 'cancel', p: Pt) => void;
}

const wob = (s: string, n: number): number => {
  let h = n * 131;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * 7;
};

/** 연필로 그은 듯 살짝 휜 선 */
function pencilPath(key: string, a: Pt, b: Pt, u: number): string {
  const ax = a.x * u;
  const ay = a.y * u;
  const bx = b.x * u;
  const by = b.y * u;
  const mx = (ax + bx) / 2 + wob(key, 1);
  const my = (ay + by) / 2 + wob(key, 2);
  return `M${ax} ${ay}Q${mx} ${my} ${bx} ${by}`;
}

/** 비스듬한 벽에 나뉜 조각의 꼭짓점 */
const piecePoints = (s: Piece, u: number): string => s.polygon.map((p) => `${p.x * u},${p.y * u}`).join(' ');

function PlanViewBase(props: PlanViewProps) {
  const { plan, layout, showDots, stroke, armed, hotEdge, glow, warn, showRoute, hazard, closedDoors } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  // 인쇄용 그림과 화면 그림이 한 문서에 있어 무늬 이름이 겹치면 숨긴 쪽을 가리키게 된다
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const pat = (name: string): string => `url(#${name}-${uid})`;
  const showLabels = props.showLabels !== false;

  const u = unitOf(plan);
  const k = plan.density ?? 1;
  const width = plan.cols * u;
  const height = plan.rows * u;
  const side = plan.outside ?? 'bottom';
  const strip = stripRect(side, width, height);
  const box = planBox(plan);
  const stored = useApp((s) => s.view);
  const panMode = useApp((s) => s.panMode);
  const zoomable = Boolean(props.zoomable);
  const shown = zoomable && stored ? viewBoxOf(clampView(stored, box), box) : box;

  // 지도가 작게 그려져도 글자는 읽을 수 있어야 한다. 화면에서 지금 그림 1 단위가 몇 픽셀인지 재서 글자 크기를 정한다
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const r = svg.getBoundingClientRect();
      setSize((p) => (p.w === r.width && p.h === r.height ? p : { w: r.width, h: r.height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  const ppu = size.w > 0 && size.h > 0 ? Math.min(size.w / shown.w, size.h / shown.h) : 0;
  const fit = (units: number, minPx: number): number => (ppu > 0 ? Math.min(units * 3.4, Math.max(units, minPx / ppu)) : units);

  // 포인터 — 손가락 둘이면 그리지 않고 지도를 키우고 옮긴다
  const fingers = useRef(new Map<number, Pt>());
  const gesture = useRef<'pinch' | 'pan' | null>(null);
  const lastPan = useRef<Pt>({ x: 0, y: 0 });
  const lastPinch = useRef<{ dist: number; mid: Pt }>({ dist: 1, mid: { x: 0, y: 0 } });
  const edgeFrame = useRef(0);
  // 눌린 채인 손길. 떼는 신호를 놓치면 그 뒤의 움직임이 계속 그리기가 되어 엉뚱한 선이 생긴다(대장 #174)
  const pressed = useRef(new Set<number>());
  const latest = useRef({ box, onPointer: props.onPointer, edgePan: props.edgePan });
  latest.current = { box, onPointer: props.onPointer, edgePan: props.edgePan };

  /** 화면 좌표 → 그림 좌표 */
  const toSvg = (c: Pt): Pt => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const pt = new DOMPoint(c.x, c.y).matrixTransform(m.inverse());
    return { x: pt.x, y: pt.y };
  };
  const toPlan = (c: Pt): Pt => {
    const p = toSvg(c);
    return { x: p.x / u, y: p.y / u };
  };
  const unitsPerPx = (): number => 1 / (svgRef.current?.getScreenCTM()?.a || 1);
  const currentView = () => clampView(getApp().view ?? fullView(latest.current.box), latest.current.box);

  const pinchInfo = (): { dist: number; mid: Pt } => {
    const [a, b] = [...fingers.current.values()] as [Pt, Pt];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  /** 끄는 손이 가장자리에 머무는 동안 종이를 옮기고, 손 아래 자리가 바뀐 것을 알린다 */
  const runEdgePan = () => {
    edgeFrame.current = 0;
    const svg = svgRef.current;
    const finger = [...fingers.current.values()][0];
    if (!svg || !finger || fingers.current.size !== 1 || gesture.current || !latest.current.edgePan || !getApp().view) return;
    const r = svg.getBoundingClientRect();
    const dx = finger.x < r.left + EDGE_PX ? -1 : finger.x > r.right - EDGE_PX ? 1 : 0;
    const dy = finger.y < r.top + EDGE_PX ? -1 : finger.y > r.bottom - EDGE_PX ? 1 : 0;
    if (!dx && !dy) return;
    const view = currentView();
    const step = EDGE_SPEED / view.scale;
    setView(panBy(view, latest.current.box, dx * step * 1.6, dy * step * 1.6));
    latest.current.onPointer?.('move', toPlan(finger));
    edgeFrame.current = requestAnimationFrame(runEdgePan);
  };

  useEffect(() => () => cancelAnimationFrame(edgeFrame.current), []);

  /** 떼는 신호 없이 끝난 손길을 버린다 — 그리던 획은 벽이 되지 않는다 */
  const drop = (id: number, at: Pt) => {
    const had = pressed.current.delete(id);
    fingers.current.delete(id);
    if (fingers.current.size === 0) gesture.current = null;
    if (had) latest.current.onPointer?.('cancel', at);
  };
  // 창이 뒤로 가면 떼는 신호가 오지 않는다
  useEffect(() => {
    const onBlur = () => {
      for (const id of [...pressed.current, ...fingers.current.keys()]) drop(id, { x: 0, y: 0 });
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handle = (kind: 'down' | 'move' | 'up' | 'cancel') => (e: RPointerEvent<SVGSVGElement>) => {
    if (!props.onPointer) return;
    const client = { x: e.clientX, y: e.clientY };
    if (kind === 'down') {
      // 마우스 오른쪽 단추는 그리는 손이 아니다. 차림표가 뜨면 떼는 신호가 오지 않는다
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      pressed.current.add(e.pointerId);
    } else if (kind === 'move') {
      // 단추를 뗀 마우스인데 눌린 것으로 남아 있다 — 떼는 신호를 놓쳤다
      if (e.pointerType === 'mouse' && e.buttons === 0 && (pressed.current.has(e.pointerId) || fingers.current.has(e.pointerId))) drop(e.pointerId, toPlan(client));
    } else {
      pressed.current.delete(e.pointerId);
    }
    if (zoomable) {
      if (kind === 'down') {
        fingers.current.set(e.pointerId, client);
        if (fingers.current.size === 2) {
          // 그리던 획은 버린다 — 지도를 키우려던 손이다
          props.onPointer('cancel', toPlan(client));
          gesture.current = 'pinch';
          lastPinch.current = pinchInfo();
          return;
        }
        if (panMode || e.button === 1) {
          gesture.current = 'pan';
          lastPan.current = client;
          return;
        }
      } else if (kind === 'move') {
        if (fingers.current.has(e.pointerId)) fingers.current.set(e.pointerId, client);
        if (gesture.current === 'pinch' && fingers.current.size >= 2) {
          const now = pinchInfo();
          const view = currentView();
          const before = toSvg(lastPinch.current.mid);
          const zoomed = zoomAround(view, box, (view.scale * now.dist) / lastPinch.current.dist, toSvg(now.mid));
          setView(panBy(zoomed, box, before.x - toSvg(now.mid).x, before.y - toSvg(now.mid).y));
          lastPinch.current = now;
          return;
        }
        if (gesture.current === 'pan') {
          const scale = unitsPerPx();
          setView(panBy(currentView(), box, (lastPan.current.x - client.x) * scale, (lastPan.current.y - client.y) * scale));
          lastPan.current = client;
          return;
        }
        if (gesture.current) return;
        if (props.edgePan && fingers.current.size === 1 && !edgeFrame.current) edgeFrame.current = requestAnimationFrame(runEdgePan);
      } else {
        fingers.current.delete(e.pointerId);
        if (gesture.current) {
          if (fingers.current.size === 0) gesture.current = null;
          return;
        }
      }
    }
    props.onPointer(kind, toPlan(client));
  };

  // 휠 — 손 아래 점을 기준으로 키운다
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !zoomable) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const view = currentView();
      setView(zoomAround(view, latest.current.box, view.scale * Math.exp(-e.deltaY * 0.0015), toSvg({ x: e.clientX, y: e.clientY })));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomable]);

  // 모눈종이 — 연한 줄을 긋고 줄이 만나는 자리에 작은 점을 찍는다(대장 #137). 점이 많아도 손을 움직일 때마다 다시 만들지 않는다.
  // 배로 늘렸을 때는 처음 점과 처음 줄을 조금 진하게 그려 자리를 잡기 쉽게 한다
  const grid = useMemo(() => {
    if (!showDots) return null;
    const whole = Number.isInteger(k) && k > 1;
    const main = (n: number): boolean => whole && n % k === 0;
    const line = (key: string, d: string, strong: boolean) => <path key={key} d={d} className={strong ? 'grid-line strong' : 'grid-line'} />;
    return (
      <g className="grid" pointerEvents="none">
        <rect className="grid-sheet" x={-16} y={-16} width={width + 32} height={height + 32} rx={12} />
        {Array.from({ length: plan.rows + 1 }, (_, y) => line(`r${y}`, `M0 ${y * u}H${width}`, main(y)))}
        {Array.from({ length: plan.cols + 1 }, (_, x) => line(`c${x}`, `M${x * u} 0V${height}`, main(x)))}
      </g>
    );
  }, [showDots, plan.rows, plan.cols, u, k, width, height]);
  // 점은 칸 색칠과 벽 위에 찍는다. 집 안에서도 점이 보여야 안쪽 벽을 그린다
  const dots = useMemo(() => {
    if (!showDots) return null;
    const whole = Number.isInteger(k) && k > 1;
    const each = k >= 4 ? 3 : k > 1.6 ? 4 : 5;
    const main = (n: number): boolean => whole && n % k === 0;
    return (
      <g className="dots">
        {Array.from({ length: plan.rows + 1 }, (_, y) =>
          Array.from({ length: plan.cols + 1 }, (_, x) => (
            <circle key={`${x},${y}`} cx={x * u} cy={y * u} r={main(x) && main(y) ? each + 2 : each} className={main(x) && main(y) ? 'dot strong' : 'dot'} />
          )),
        )}
      </g>
    );
  }, [showDots, plan.rows, plan.cols, u, k]);

  // 밖까지 나온 길은 안전한 곳까지 이어 그린다 — 나가는 것으로 끝이 아니라 가족을 만나야 끝이다
  const toMeet = (steps: string[]): Pt[] => {
    const points = routePoints(plan, layout, steps);
    if (points.length < 2 || steps[steps.length - 1] !== OUT || !plan.marks.meet) return points;
    // 집을 돌아서 가고, 화살표가 깃발을 가리지 않게 조금 앞에서 멈춘다
    const walk = outsidePath(plan, layout, points[points.length - 1]!);
    const end = walk[walk.length - 1]!;
    const before = walk[walk.length - 2] ?? end;
    const len = Math.hypot(end.x - before.x, end.y - before.y);
    const gap = 0.6 * (plan.density ?? 1);
    const stop = len > gap * 1.5 ? { x: end.x - ((end.x - before.x) / len) * gap, y: end.y - ((end.y - before.y) / len) * gap } : end;
    return [...points, ...walk.slice(1, -1), stop];
  };
  const route1 = useMemo(() => (showRoute ? toMeet(plan.route) : []), [showRoute, plan, layout]);
  const route2 = useMemo(() => (showRoute ? toMeet(plan.route2) : []), [showRoute, plan, layout]);
  const glowSet = new Set(glow ?? []);
  const warnSet = new Set(warn ?? []);
  const closedSet = new Set(closedDoors ?? []);
  const openEdgeSet = useMemo(() => new Set(layout.openEdges), [layout]);

  // 글자 자리 — 표시 이름, 칸 이름, 가구 이름 순서로 잡아 서로와 표시 그림에 겹치지 않게 한다
  const labelInfo = useMemo(() => {
    const textW = (s: string, f: number): number => s.length * f * 0.98 + 8;
    const list: (Label & { text: string; size: number; cls: string })[] = [];
    const extras = plan.extraExtinguishers ?? [];
    const glyphs: Rect[] = [...(Object.values(plan.marks) as Pt[]), ...extras].map((m) => ({ x: m.x * u, y: m.y * u - 2, w: 70, h: 78 }));
    for (const [id, at] of Object.entries(plan.marks) as [MarkId, Pt][]) {
      const size = fit(id === 'alarm' ? 20 : 22, 14);
      list.push({ id: `m-${id}`, x: at.x * u, y: at.y * u + 40 + size * 0.6, w: textW(MARK_NAME[id], size), h: size * 1.15, text: MARK_NAME[id], size, cls: 'mark-label' });
    }
    extras.forEach((at, i) => {
      const size = fit(22, 14);
      list.push({ id: `x-${i}`, x: at.x * u, y: at.y * u + 40 + size * 0.6, w: textW(MARK_NAME.extinguisher, size), h: size * 1.15, text: MARK_NAME.extinguisher, size, cls: 'mark-label' });
    });
    if (showLabels) {
      for (const cell of layout.cells.filter((c) => c.kind)) {
        const text = cellLabel(cell.kind, cell.name);
        const size = fit(text.length > 3 && cell.area < 2.5 ? 22 : 28, 15);
        list.push({ id: `c-${cell.id}`, x: cell.anchor.x * u, y: cell.anchor.y * u, w: textW(text, size), h: size * 1.15, text, size, cls: 'cell-label' });
      }
    }
    (plan.items ?? []).forEach((item, i) => {
      const text = ITEMS[item.kind].label;
      const size = fit(18, 13);
      list.push({ id: `i-${i}`, x: item.x * u, y: item.y * u, w: textW(text, size), h: size * 1.15, text, size, cls: 'item-word' });
    });
    return { list, spots: arrangeLabels(list, glyphs) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, layout, showLabels, u, ppu]);
  const stripFont = fit(26, 15);

  return (
    <svg
      ref={svgRef}
      className={`plan ${zoomable && panMode ? 'cursor-move' : (props.className ?? '')}`}
      viewBox={`${shown.x} ${shown.y} ${shown.w} ${shown.h}`}
      preserveAspectRatio={props.padSide === 'right' ? 'xMinYMin meet' : props.padSide === 'left' ? 'xMaxYMin meet' : 'xMidYMid meet'}
      data-pad-side={props.padSide}
      role="img"
      aria-label={props.ariaLabel ?? '우리 집 지도'}
      data-density={k}
      data-cols={plan.cols}
      data-rows={plan.rows}
      data-cells={layout.cells.length}
      data-walls={plan.walls.length}
      data-diagonals={plan.walls.filter(isSlanted).length}
      data-scale={(box.w / shown.w).toFixed(2)}
      data-doors={Object.values(plan.openings).filter((o) => o === 'door').length}
      data-windows={Object.values(plan.openings).filter((o) => o === 'window').length}
      data-gaps={Object.values(plan.openings).filter((o) => o === 'gap').length}
      data-opens={layout.openEdges.length}
      data-links={layout.links.length}
      data-route={plan.route.join(' ')}
      data-route2={plan.route2.join(' ')}
      data-marks={Object.keys(plan.marks).sort().join(' ')}
      data-extinguishers={(plan.marks.extinguisher ? 1 : 0) + (plan.extraExtinguishers?.length ?? 0)}
      data-no-extinguisher={plan.noExtinguisher ? '1' : '0'}
      data-turned={Object.keys(plan.doorTurns ?? {}).length}
      data-resized={Object.keys(plan.doorSizes ?? {}).length}
      data-tagged={layout.cells.filter((c) => c.kind).length}
      onPointerDown={handle('down')}
      onPointerMove={handle('move')}
      onPointerUp={handle('up')}
      onPointerCancel={handle('cancel')}
      onLostPointerCapture={(e) => drop(e.pointerId, toPlan({ x: e.clientX, y: e.clientY }))}
      onContextMenu={(e) => {
        if (props.onPointer) e.preventDefault();
      }}
    >
      <defs>
        <pattern id={`crayon-room-${uid}`} width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
          <rect width="26" height="26" fill="#ffe3a3" />
          <path d="M0 6h26M0 15h26M0 23h26" stroke="#fcc75f" strokeWidth="3.5" opacity=".7" />
        </pattern>
        <pattern id={`crayon-pass-${uid}`} width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(-32)">
          <rect width="26" height="26" fill="#c6e8f8" />
          <path d="M0 6h26M0 15h26M0 23h26" stroke="#8cccec" strokeWidth="3.5" opacity=".7" />
        </pattern>
        <pattern id={`crayon-new-${uid}`} width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="20" height="20" fill="#f4efdc" />
          <path d="M0 10h20" stroke="#e4dcbd" strokeWidth="3" />
        </pattern>
        <radialGradient id={`smoke-${uid}`}>
          <stop offset="0" stopColor="#4d5057" stopOpacity=".85" />
          <stop offset=".6" stopColor="#5c5f66" stopOpacity=".45" />
          <stop offset="1" stopColor="#5c5f66" stopOpacity="0" />
        </radialGradient>
        <pattern id={`crayon-out-${uid}`} width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
          <rect width="24" height="24" fill="#dcefcf" />
          <path d="M0 8h24M0 18h24" stroke="#bcdcA6" strokeWidth="3" opacity=".8" />
        </pattern>
      </defs>

      {/* 집 밖 띠 */}
      <g className={glowSet.has(OUT) ? 'strip glow-out' : 'strip'} data-side={side}>
        <rect x={strip.x} y={strip.y} width={strip.w} height={strip.h} rx={18} fill={pat('crayon-out')} stroke={glowSet.has(OUT) ? '#2f7fbf' : '#9cc489'} strokeWidth={glowSet.has(OUT) ? 8 : 4} strokeDasharray={glowSet.has(OUT) ? undefined : '14 12'} />
        <text x={strip.x + 16} y={strip.y + 20 + stripFont / 2} className="strip-label" style={{ fontSize: stripFont }}>집 밖</text>
      </g>

      {/* 모눈종이 */}
      {grid}

      {/* 칸 색칠 */}
      {layout.cells.map((cell) => {
        const fill = cell.kind === 'room' ? pat('crayon-room') : cell.kind === 'pass' ? pat('crayon-pass') : pat('crayon-new');
        return (
          <g key={cell.id} data-cell={cell.id} data-kind={cell.kind ?? ''}>
            {cell.squares.map((s) =>
              s.whole ? (
                <rect key={s.key} data-piece={s.key} x={s.x * u - 0.5} y={s.y * u - 0.5} width={u + 1} height={u + 1} fill={fill} />
              ) : (
                <polygon key={s.key} data-piece={s.key} points={piecePoints(s, u)} fill={fill} stroke={fill} strokeWidth={1} />
              ),
            )}
          </g>
        );
      })}

      {/* 밖으로 이어지지 않은 칸 */}
      {layout.cells.filter((c) => warnSet.has(c.id)).map((cell) => (
        <g key={`w${cell.id}`} className="warn-cell">
          {cell.squares.map((s) =>
            s.whole ? (
              k === 1 ? (
                <rect key={s.key} x={s.x * u + 6} y={s.y * u + 6} width={u - 12} height={u - 12} rx={10} fill="none" stroke="#b5651d" strokeWidth={6} strokeDasharray="14 12" />
              ) : (
                <rect key={s.key} x={s.x * u - 0.5} y={s.y * u - 0.5} width={u + 1} height={u + 1} fill="#b5651d" opacity=".22" />
              )
            ) : (
              <polygon key={s.key} points={piecePoints(s, u)} fill="none" stroke="#b5651d" strokeWidth={6} strokeDasharray="14 12" />
            ),
          )}
        </g>
      ))}

      {/* 반짝이는 칸 */}
      {layout.cells.filter((c) => glowSet.has(c.id)).map((cell) => (
        <g key={`g${cell.id}`} className="glow-cell">
          {cell.squares.map((s) =>
            s.whole ? (
              <rect key={s.key} x={s.x * u} y={s.y * u} width={u} height={u} fill="#ffffff" opacity=".6" />
            ) : (
              <polygon key={s.key} points={piecePoints(s, u)} fill="#ffffff" opacity=".6" />
            ),
          )}
        </g>
      ))}

      {/* 위험 — 붉은 점멸 없이 천천히 번지는 모습만 보인다 */}
      {hazard && layout.cells.map((cell) => {
        const lv = hazard[cell.id] ?? 0;
        const v = props.heat?.[cell.id] ?? (lv === 3 ? 100 : lv === 2 ? 70 : lv === 1 ? 30 : 0);
        const fire = props.fire?.cell === cell.id ? props.fire : null;
        if (lv === 0 && !fire) return null;
        // 연기는 값에 따라 서서히 짙어진다
        const haze = lv === 0 ? 0 : Math.min(0.5, 0.1 + v * 0.004);
        // 불꽃과 연기 뭉치는 처음 네모마다 하나다
        const each = Math.max(1, Math.round(k));
        const spots = cell.squares.filter((s) => s.x % each === 0 && s.y % each === 0);
        const base = spots.length ? spots : cell.squares.slice(0, 1);
        // 불은 시작한 자리에서 작게 시작해 값이 오를수록 넓어진다. 다른 칸은 다 찼을 때 불이 붙는다
        const near = fire ? [...base].sort((a, b) => Math.hypot(a.center.x - fire.at.x, a.center.y - fire.at.y) - Math.hypot(b.center.x - fire.at.x, b.center.y - fire.at.y)) : base;
        const grown = Math.max(0, Math.min(1, (v - 45) / 55));
        const burning = fire ? near.slice(0, v >= 100 ? near.length : Math.max(1, Math.round(near.length * grown * 0.8))) : v >= 100 ? base : [];
        const flameSize = fire ? 0.55 + 0.45 * grown : 1;
        return (
          <g key={`h${cell.id}`} data-hazard={lv} data-heat={Math.round(v)} data-flames={burning.length} data-source={fire ? '1' : '0'}>
            {haze > 0 && cell.squares.map((s) =>
              s.whole ? (
                <rect key={s.key} className="smoke-sq" x={s.x * u} y={s.y * u} width={u} height={u} fill="#5c5f66" opacity={haze} />
              ) : (
                <polygon key={s.key} className="smoke-sq" points={piecePoints(s, u)} fill="#5c5f66" opacity={haze} />
              ),
            )}
            {haze > 0 && base.map((s, i) => (
              <circle key={`p${s.key}`} className="smoke-puff" style={{ animationDelay: `${-(i % 5) * 0.9}s` }} cx={s.center.x * u} cy={s.center.y * u} r={48} fill={pat('smoke')} opacity={Math.min(0.9, 0.25 + v * 0.007)} />
            ))}
            {burning.map((s, i) => {
              const at = fire && i === 0 ? fire.at : s.center;
              return (
                <g key={`f${s.key}`} transform={`translate(${at.x * u} ${at.y * u + 12}) scale(${flameSize})`}>
                  <g className="flame" style={{ animationDelay: `${(i % 4) * 0.25}s` }}>
                    <path d="M0-44c17 17 24 30 17 43-3 6-10 9-17 9s-14-3-17-9c-6-12 4-22 9-28 2 7 4 9 7 9 2-7 2-15 1-24z" fill="#f59a23" />
                    <path d="M0-16c7 7 10 13 7 18-1 3-4 4-7 4s-6-1-7-4c-3-5 2-9 4-11 1 3 2 4 3 4 1-3 1-7 0-11z" fill="#ffe08a" />
                  </g>
                </g>
              );
            })}
          </g>
        );
      })}

      {/* 벽 */}
      <g className="walls">
        {edgeKeys(layout).map((key) => {
          const [a, b] = edgeEnds(key);
          // 트인 칸끼리 맞닿은 곳은 벽이 없는 셈이라 연한 점선으로만 보인다. 틈은 틈 그림이 따로 그린다
          if (plan.openings[key] === 'gap') return null;
          const open = openEdgeSet.has(key);
          return <path key={key} d={open ? `M${a.x * u} ${a.y * u}L${b.x * u} ${b.y * u}` : pencilPath(key, a, b, u)} data-open={open ? '1' : undefined} className={key === hotEdge ? 'wall hot' : open ? 'wall open' : 'wall'} />;
        })}
      </g>

      {/* 문과 창 */}
      {Object.entries(plan.openings).map(([edge, kind]) => (
        <OpeningShape key={edge} edge={edge} kind={kind} layout={layout} closed={closedSet.has(edge)} hot={edge === hotEdge} u={u} density={k} wordSize={fit(18, 13)} swing={kind === 'door' ? doorSwing(plan, layout, edge) : null} turn={doorTurn(plan, edge)} size={doorSize(plan, edge)} fit={openingWidth(plan, layout, edge)} joined={kind === 'gap' ? gapJoins(plan, edge) : NO_JOIN} />
      ))}

      {/* 그리는 중인 획 */}
      {stroke && stroke.length > 1 && (
        <polyline className={props.strokeHint ? 'stroke-live hint' : 'stroke-live'} data-testid={props.strokeHint ? 'stroke-hint' : undefined} points={stroke.map((p) => `${p.x * u},${p.y * u}`).join(' ')} />
      )}

      {/* 이름을 아직 안 정한 칸 */}
      {showLabels && props.showUnknown !== false && props.glow === undefined && props.showDots !== true && layout.cells.filter((c) => !c.kind).map((cell) => (
        <text key={`q${cell.id}`} className="cell-unknown" x={cell.anchor.x * u} y={cell.anchor.y * u}>?</text>
      ))}

      {/* 나가는 길 */}
      {route2.length > 1 && (
        <polyline className="route route-2" points={route2.map((p) => `${p.x * u},${p.y * u}`).join(' ')} />
      )}
      {route1.length > 1 && (
        <polyline className="route route-1" markerEnd="" points={route1.map((p) => `${p.x * u},${p.y * u}`).join(' ')} />
      )}
      {route1.length > 1 && <RouteArrow points={route1} color="#d6402f" u={u} />}
      {route2.length > 1 && <RouteArrow points={route2} color="#c97a12" u={u} />}

      {/* 아이가 놓은 가구 */}
      {(plan.items ?? []).map((item, i) => (
        <g key={i} className="placed-item" data-item={item.kind} transform={`translate(${item.x * u} ${item.y * u})`} pointerEvents="none">
          <g transform={`rotate(${item.angle}) scale(${itemSize(item)})`} data-angle={Math.round(item.angle)} data-size={itemSize(item)}><ItemShape kind={item.kind} /></g>
        </g>
      ))}

      {/* 표시 */}
      {(Object.entries(plan.marks) as [MarkId, Pt][]).map(([id, at]) => (
        <g key={id} transform={`translate(${at.x * u} ${at.y * u})`} data-mark={id} className="mark">
          <MarkGlyph id={id} look={props.look} />
        </g>
      ))}
      {/* 둘째부터의 소화기 */}
      {(plan.extraExtinguishers ?? []).map((at, i) => (
        <g key={`x${i}`} transform={`translate(${at.x * u} ${at.y * u})`} data-mark="extinguisher" data-extra={i + 1} className="mark">
          <MarkGlyph id="extinguisher" />
        </g>
      ))}

      {/* 글자 — 길과 가구 위에 얹어 가려지지 않게 한다 */}
      <g className="labels" pointerEvents="none">
        {labelInfo.list.map((l) => {
          const spot = labelInfo.spots.get(l.id) ?? l;
          return <text key={l.id} className={l.cls} data-label={l.id} x={spot.x} y={spot.y} style={{ fontSize: l.size }}>{l.text}</text>;
        })}
      </g>

      {/* 점 */}
      {dots}
      {showDots && armed && <circle cx={armed.x * u} cy={armed.y * u} r={k <= 1.6 ? 15 : 11} className="dot armed" />}

      {props.children}
    </svg>
  );
}

/** 위에서 본 가구. 앞이 아래쪽이고 크기는 처음 네모 한 칸이 100 이다 */
export function ItemShape({ kind }: { kind: ItemKind }) {
  const spec = ITEMS[kind];
  const w = spec.w * U;
  const d = spec.d * U;
  const line = { fill: 'none', stroke: '#33363b', strokeWidth: 3, strokeLinecap: 'round' as const };
  return (
    <g>
      <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={kind === 'plant' || kind === 'toilet' ? 12 : 5} fill={spec.color} stroke="#33363b" strokeWidth={3.5} />
      {kind === 'bed' && <rect x={-w / 2 + 6} y={-d / 2 + 6} width={w - 12} height={d * 0.26} rx={6} fill="#8cb7d9" stroke="#33363b" strokeWidth={2.5} />}
      {kind === 'sofa' && <path d={`M${-w / 2} ${-d / 6}H${w / 2}`} {...line} />}
      {kind === 'tv' && <path d={`M${-w / 2 + 6} 0H${w / 2 - 6}`} stroke="#9fd0ea" strokeWidth={4} />}
      {(kind === 'closet' || kind === 'shoes') && <path d={`M0 ${-d / 2}V${d / 2}`} {...line} />}
      {(kind === 'fridge' || kind === 'washer') && <circle r={w * 0.26} {...line} />}
      {kind === 'sink' && <rect x={-w * 0.2} y={-d * 0.28} width={w * 0.4} height={d * 0.56} rx={5} {...line} />}
      {kind === 'toilet' && <ellipse cy={d * 0.08} rx={w * 0.3} ry={d * 0.28} {...line} />}
      {kind === 'basin' && <ellipse rx={w * 0.3} ry={d * 0.28} {...line} />}
      {kind === 'bathtub' && <rect x={-w * 0.32} y={-d * 0.38} width={w * 0.64} height={d * 0.76} rx={12} {...line} />}
      {kind === 'plant' && <circle r={w * 0.22} fill="#3e9d5d" />}
      {kind === 'partition' && <path d={`M${-w / 2 + 6} 0H${w / 2 - 6}`} stroke="#e0603f" strokeWidth={3} strokeDasharray="8 6" />}
      {kind === 'hatch' && <rect x={-w * 0.32} y={-d * 0.32} width={w * 0.64} height={d * 0.64} rx={4} fill="#e0603f" stroke="#33363b" strokeWidth={2.5} />}
    </g>
  );
}

function RouteArrow({ points, color, u }: { points: Pt[]; color: string; u: number }) {
  const b = points[points.length - 1]!;
  const a = points[points.length - 2]!;
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return (
    <g transform={`translate(${b.x * u} ${b.y * u}) rotate(${angle})`}>
      <path d="M-4-20 26 0-4 20z" fill={color} stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
    </g>
  );
}

const NO_JOIN: [number, number] = [0, 0];

/**
 * 가로세로 틈의 앞뒤로 곧게 이어진 틈의 수. 이어진 쪽에는 기둥을 그리지 않고 나가는 화살표도 가운데에 하나만 그려
 * 넓은 입구 하나로 보인다.
 */
function gapJoins(plan: Plan, edge: string): [number, number] {
  if (edge.includes('#')) return NO_JOIN;
  const { o, x, y } = parseEdge(edge);
  if (o !== 'h' && o !== 'v') return NO_JOIN;
  const at = (n: number): string => (o === 'h' ? `h:${x + n}:${y}` : `v:${x}:${y + n}`);
  let before = 0;
  let after = 0;
  while (plan.openings[at(-before - 1)] === 'gap') before += 1;
  while (plan.openings[at(after + 1)] === 'gap') after += 1;
  return [before, after];
}

function OpeningShape({ edge, kind, layout, closed, hot, u, density, wordSize, swing: door, turn, size, fit, joined }: { edge: string; kind: string; layout: Layout; closed: boolean; hot: boolean; u: number; density: number; wordSize: number; swing: DoorSwing | null; turn: number; size: number; fit: number; joined: [number, number] }) {
  const m = edgeMid(edge);
  const angle = edgeAngle(edge);
  const normal = edgeNormal(edge);
  // 문과 창을 가로 100 으로 그린 뒤 벽 가운데로 옮겨 돌린다. 긴 벽은 양옆에 벽이 남고, 벽보다 크면 줄인다
  const place = `translate(${m.x * u} ${m.y * u}) rotate(${angle}) scale(${fit}) translate(-50 0)`;
  if (kind === 'window') {
    const line = hot ? '#1d5f96' : '#2f7fbf';
    return (
      <g data-window={edge} transform={place}>
        <line x1={12} y1={0} x2={88} y2={0} stroke="#fff" strokeWidth={20} />
        <line x1={12} y1={0} x2={88} y2={0} stroke={line} strokeWidth={18} opacity=".3" />
        <path d="M12-9H88M12 9H88M12-9V9M88-9V9M50-9V9" fill="none" stroke={line} strokeWidth={4} />
      </g>
    );
  }
  const [p, q] = edgeSides(layout, edge);
  const pCell = layout.cellAt.get(p);
  const qCell = layout.cellAt.get(q);
  const exit = Boolean(pCell) !== Boolean(qCell);
  const color = hot ? '#2f7fbf' : exit ? '#2e8b57' : '#9a5b2a';
  if (kind === 'gap') {
    // 틈 — 문짝 없이 트인 입구다. 벽이 끊긴 자리를 양 끝의 짧은 기둥으로 보인다
    const len = (edgeLength(edge) / density) * 100;
    const out = pCell ? 1 : -1;
    // 이어진 틈들의 가운데 — 화살표는 거기에 하나만 그린다
    const run = joined[0] + joined[1] + 1;
    const middle = joined[0] === Math.floor((run - 1) / 2);
    const [ea, eb] = edgeEnds(edge);
    const along = run % 2 === 0 ? len / 2 / (Math.hypot(eb.x - ea.x, eb.y - ea.y) || 1) : 0;
    const ax = m.x * u + (eb.x - ea.x) * along;
    const ay = m.y * u + (eb.y - ea.y) * along;
    return (
      <g data-gap={edge} data-exit={exit ? '1' : '0'}>
        <g transform={`translate(${m.x * u} ${m.y * u}) rotate(${angle})`}>
          <line x1={-len / 2 + 5} y1={0} x2={len / 2 - 5} y2={0} stroke={hot ? '#2f7fbf' : '#aab5b9'} strokeWidth={4} strokeDasharray="3 11" strokeLinecap="round" />
          <path d={`${joined[0] ? '' : `M${-len / 2}-11V11`}${joined[1] ? '' : `M${len / 2}-11V11`}`} fill="none" stroke={hot ? '#2f7fbf' : '#33363b'} strokeWidth={8} strokeLinecap="round" />
        </g>
        {exit && middle && (
          <g className="gap-arrow" transform={`translate(${ax + normal.x * out * 36} ${ay + normal.y * out * 36}) rotate(${(Math.atan2(normal.y * out, normal.x * out) * 180) / Math.PI})`}>
            <path d="M-14 0H10M2-12L18 0L2 12" fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
      </g>
    );
  }
  // 현관과 집 안 사이의 문은 중문이다
  const inner = !exit && [pCell, qCell].some((id) => id && layout.byId.get(id)?.name === 'entry');
  // 문짝은 처음에 방 쪽으로 열리고, 「방향 바꾸기」로 열리는 쪽과 경첩 자리를 바꾼다(`core/doors.ts`)
  const swing = door?.side ?? 1;
  const hingeAtStart = door?.hingeAtStart ?? true;
  // 밖으로 나가는 쪽
  const toward = pCell ? 1 : -1;
  const nx = normal.x * toward;
  const ny = normal.y * toward;
  return (
    <g data-door={edge} data-exit={exit ? '1' : '0'} data-inner={inner ? '1' : '0'} data-turn={turn} data-size={size} data-width={fit.toFixed(2)} data-side={swing} data-hinge={hingeAtStart ? 'a' : 'b'}>
      <g transform={place}>
        <line x1={8} y1={0} x2={92} y2={0} stroke="#fffdf6" strokeWidth={16} />
        {closed ? (
          <line x1={10} y1={0} x2={90} y2={0} stroke={color} strokeWidth={15} strokeLinecap="round" />
        ) : (
          // 경첩이 반대쪽 끝이면 그림을 좌우로 뒤집는다
          <g className="door-leaf" transform={hingeAtStart ? undefined : 'translate(100 0) scale(-1 1)'}>
            <path d={`M86 0A74 74 0 0 ${swing > 0 ? 1 : 0} 12 ${swing * 74}`} fill="none" stroke={color} strokeWidth={3.5} strokeDasharray="6 7" />
            <line x1={12} y1={0} x2={12} y2={swing * 74} stroke={color} strokeWidth={10} strokeLinecap="round" />
          </g>
        )}
      </g>
      {inner && <text className="door-word" x={m.x * u} y={m.y * u - 6 - wordSize / 2} style={{ fontSize: wordSize }}>중문</text>}
      {exit && (
        <g transform={`translate(${m.x * u + nx * 36} ${m.y * u + ny * 36}) rotate(${(Math.atan2(ny, nx) * 180) / Math.PI})`}>
          <path d="M-14 0H10M2-12L18 0L2 12" fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </g>
  );
}

export const PlanView = memo(PlanViewBase);
