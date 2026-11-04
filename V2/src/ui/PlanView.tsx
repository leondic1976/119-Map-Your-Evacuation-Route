/**
 * 지도 그림 — 그리기·대피 연습·인쇄가 모두 이 SVG 하나를 쓴다.
 * 처음 네모 한 칸이 100 단위다. 점 간격을 좁혀도 그림 크기는 그대로이고 점 하나의 크기만 줄어든다.
 * 포인터는 지금 점 단위 좌표로 바꿔서 알려 준다.
 */
import { memo, useEffect, useId, useMemo, useRef, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { edgeAngle, edgeEnds, edgeKeys, edgeLength, edgeMid, edgeNormal, edgeSides, isSlanted } from '../core/grid';
import { routePoints } from '../core/path';
import { clampView, fullView, panBy, viewBoxOf, zoomAround, type Box } from '../core/zoom';
import { OUT, type Layout, type MarkId, type Piece, type Plan, type Pt } from '../core/types';
import { cellLabel, MARK_NAME, type LookId } from '../content/names';
import { getApp, setView, useApp } from '../store/app';
import { HandGlyph, MarkGlyph } from './art';

export const U = 100;
/** 지금 점 한 칸의 그림 크기 */
export const unitOf = (plan: Plan): number => U / (plan.density ?? 1);
/** 그림 둘레 여백 — 집 위나 옆으로 나가는 화살표가 잘리지 않을 만큼 둔다 */
const MARGIN = 84;
const STRIP_GAP = 34;
const STRIP_H = 112;

/** 그림 전체의 범위 */
export const planBox = (plan: Plan): Box => ({
  x: -MARGIN,
  y: -MARGIN,
  w: plan.cols * unitOf(plan) + MARGIN * 2,
  h: plan.rows * unitOf(plan) + STRIP_GAP + STRIP_H + MARGIN + 26,
});

/** 그리다가 손이 화면 가장자리에 이르면 종이가 따라 움직인다 */
const EDGE_PX = 44;
const EDGE_SPEED = 7;

export interface PlanViewProps {
  plan: Plan;
  layout: Layout;
  look?: LookId;
  showDots?: boolean;
  guide?: string[];
  /** 그리는 중인 획 */
  stroke?: Pt[];
  armed?: Pt | null;
  hotEdge?: string | null;
  /** 반짝이는 칸들 (칸 id · `out`) */
  glow?: string[];
  /** 손가락과 「여기를 눌러」를 띄울 곳 (칸 id · `out`) */
  hints?: string[];
  /** 살펴볼 칸 — 밖으로 이어지지 않은 칸 */
  warn?: string[];
  showRoute?: boolean;
  showLabels?: boolean;
  /** 대피 연습 위험 단계: 칸 id → 0 없음 · 1 옅음 · 2 짙음 · 3 막힘 */
  hazard?: Record<string, 0 | 1 | 2 | 3>;
  closedDoors?: string[];
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
  /** 크게 보고 옮길 수 있다 */
  zoomable?: boolean;
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
  const { plan, layout, showDots, guide, stroke, armed, hotEdge, glow, warn, showRoute, hazard, closedDoors } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  // 인쇄용 그림과 화면 그림이 한 문서에 있어 무늬 이름이 겹치면 숨긴 쪽을 가리키게 된다
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const pat = (name: string): string => `url(#${name}-${uid})`;
  const showLabels = props.showLabels !== false;

  const u = unitOf(plan);
  const k = plan.density ?? 1;
  const width = plan.cols * u;
  const height = plan.rows * u;
  const stripTop = height + STRIP_GAP;
  const stripH = STRIP_H;
  const box = planBox(plan);
  const stored = useApp((s) => s.view);
  const panMode = useApp((s) => s.panMode);
  const zoomable = Boolean(props.zoomable);
  const shown = zoomable && stored ? viewBoxOf(clampView(stored, box), box) : box;

  // 포인터 — 손가락 둘이면 그리지 않고 지도를 키우고 옮긴다
  const fingers = useRef(new Map<number, Pt>());
  const gesture = useRef<'pinch' | 'pan' | null>(null);
  const lastPan = useRef<Pt>({ x: 0, y: 0 });
  const lastPinch = useRef<{ dist: number; mid: Pt }>({ dist: 1, mid: { x: 0, y: 0 } });
  const edgeFrame = useRef(0);
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

  const handle = (kind: 'down' | 'move' | 'up' | 'cancel') => (e: RPointerEvent<SVGSVGElement>) => {
    if (!props.onPointer) return;
    const client = { x: e.clientX, y: e.clientY };
    if (kind === 'down') e.currentTarget.setPointerCapture(e.pointerId);
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

  // 점이 많아도 손을 움직일 때마다 다시 만들지 않는다. 처음 간격의 점은 크게 그려 자리를 잡기 쉽게 한다
  const dots = useMemo(() => {
    if (!showDots) return null;
    const small = k === 2 ? 6 : 4;
    return (
      <g className="dots">
        {Array.from({ length: plan.rows + 1 }, (_, y) =>
          Array.from({ length: plan.cols + 1 }, (_, x) => (
            <circle key={`${x},${y}`} cx={x * u} cy={y * u} r={x % k === 0 && y % k === 0 ? 10 : small} className="dot" />
          )),
        )}
      </g>
    );
  }, [showDots, plan.rows, plan.cols, u, k]);

  const route1 = useMemo(() => (showRoute ? routePoints(plan, layout, plan.route) : []), [showRoute, plan, layout]);
  const route2 = useMemo(() => (showRoute ? routePoints(plan, layout, plan.route2) : []), [showRoute, plan, layout]);
  const glowSet = new Set(glow ?? []);
  const warnSet = new Set(warn ?? []);
  const closedSet = new Set(closedDoors ?? []);

  return (
    <svg
      ref={svgRef}
      className={`plan ${zoomable && panMode ? 'cursor-move' : (props.className ?? '')}`}
      viewBox={`${shown.x} ${shown.y} ${shown.w} ${shown.h}`}
      preserveAspectRatio="xMidYMid meet"
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
      data-route={plan.route.join(' ')}
      data-route2={plan.route2.join(' ')}
      data-marks={Object.keys(plan.marks).sort().join(' ')}
      data-tagged={layout.cells.filter((c) => c.kind).length}
      onPointerDown={handle('down')}
      onPointerMove={handle('move')}
      onPointerUp={handle('up')}
      onPointerCancel={handle('cancel')}
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
        <pattern id={`crayon-out-${uid}`} width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
          <rect width="24" height="24" fill="#dcefcf" />
          <path d="M0 8h24M0 18h24" stroke="#bcdcA6" strokeWidth="3" opacity=".8" />
        </pattern>
      </defs>

      {/* 집 밖 띠 */}
      <g className={glowSet.has(OUT) ? 'strip glow-out' : 'strip'}>
        <rect x={-30} y={stripTop} width={width + 60} height={stripH} rx={18} fill={pat('crayon-out')} stroke={glowSet.has(OUT) ? '#2f7fbf' : '#9cc489'} strokeWidth={glowSet.has(OUT) ? 8 : 4} strokeDasharray={glowSet.has(OUT) ? undefined : '14 12'} />
        <text x={0} y={stripTop + 40} className="strip-label">집 밖</text>
      </g>

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
        if (lv === 0) return null;
        return (
          <g key={`h${cell.id}`} data-hazard={lv}>
            {cell.squares.map((s, i) => (
              <g key={s.key}>
                {s.whole ? (
                  <rect className="smoke-sq" x={s.x * u} y={s.y * u} width={u} height={u} fill="#5c5f66" opacity={lv === 1 ? 0.18 : lv === 2 ? 0.42 : 0.5} />
                ) : (
                  <polygon className="smoke-sq" points={piecePoints(s, u)} fill="#5c5f66" opacity={lv === 1 ? 0.18 : lv === 2 ? 0.42 : 0.5} />
                )}
                {/* 불꽃은 처음 네모마다 하나다 */}
                {lv === 3 && s.x % k === 0 && s.y % k === 0 && (
                  <g className="flame" style={{ animationDelay: `${(i % 4) * 0.25}s` }} transform={`translate(${s.center.x * u} ${s.center.y * u + 12})`}>
                    <path d="M0-44c17 17 24 30 17 43-3 6-10 9-17 9s-14-3-17-9c-6-12 4-22 9-28 2 7 4 9 7 9 2-7 2-15 1-24z" fill="#f59a23" />
                    <path d="M0-16c7 7 10 13 7 18-1 3-4 4-7 4s-6-1-7-4c-3-5 2-9 4-11 1 3 2 4 3 4 1-3 1-7 0-11z" fill="#ffe08a" />
                  </g>
                )}
              </g>
            ))}
          </g>
        );
      })}

      {/* 모눈 점 안내선 */}
      {guide && guide.filter((g) => !plan.walls.includes(g)).map((g) => {
        const [a, b] = edgeEnds(g);
        return <line key={`gd${g}`} className="guide-line" x1={a.x * u} y1={a.y * u} x2={b.x * u} y2={b.y * u} />;
      })}

      {/* 벽 */}
      <g className="walls">
        {edgeKeys(layout).map((key) => {
          const [a, b] = edgeEnds(key);
          return <path key={key} d={pencilPath(key, a, b, u)} className={key === hotEdge ? 'wall hot' : 'wall'} />;
        })}
      </g>

      {/* 문과 창 */}
      {Object.entries(plan.openings).map(([edge, kind]) => (
        <OpeningShape key={edge} edge={edge} kind={kind} layout={layout} closed={closedSet.has(edge)} hot={edge === hotEdge} u={u} density={k} />
      ))}

      {/* 그리는 중인 획 */}
      {stroke && stroke.length > 1 && (
        <polyline className="stroke-live" points={stroke.map((p) => `${p.x * u},${p.y * u}`).join(' ')} />
      )}

      {/* 칸 이름 */}
      {showLabels && layout.cells.filter((c) => c.kind).map((cell) => {
        const label = cellLabel(cell.kind, cell.name);
        return (
          <text
            key={`l${cell.id}`}
            className="cell-label"
            x={cell.anchor.x * u}
            y={cell.anchor.y * u}
            fontSize={label.length > 3 && cell.area < 2.5 ? 22 : 28}
          >
            {label}
          </text>
        );
      })}
      {showLabels && props.glow === undefined && props.showDots !== true && layout.cells.filter((c) => !c.kind).map((cell) => (
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

      {/* 표시 */}
      {(Object.entries(plan.marks) as [MarkId, Pt][]).map(([id, at]) => (
        <g key={id} transform={`translate(${at.x * u} ${at.y * u})`} data-mark={id} className="mark">
          <MarkGlyph id={id} look={props.look} />
          <text className="mark-label" y={48} fontSize={id === 'alarm' ? 20 : 22}>{MARK_NAME[id]}</text>
        </g>
      ))}

      {/* 눌러야 할 곳 */}
      {(props.hints ?? []).map((id) => {
        const cell = layout.byId.get(id);
        const x = cell ? cell.anchor.x * u : width * 0.28;
        // 칸 이름 바로 아래에 놓아 글자가 겹치지 않게 한다
        const y = cell ? cell.anchor.y * u + 58 : stripTop + 34;
        return (
          <g key={`hint${id}`} className="tap-hint" data-hint={id} transform={`translate(${x} ${y})`} pointerEvents="none">
            <g className="tap-hand"><HandGlyph scale={1.5} /></g>
            <text className="tap-word" x={0} y={-12}>여기를 눌러</text>
          </g>
        );
      })}

      {/* 점 */}
      {dots}
      {showDots && armed && <circle cx={armed.x * u} cy={armed.y * u} r={k === 1 ? 19 : 14} className="dot armed" />}

      {props.children}
    </svg>
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

/** 문과 창의 폭(처음 네모 단위). 점이 촘촘해 벽 토막이 짧아도 곧은 벽이 이어지면 제 크기로 낸다 */
function openingFit(edge: string, layout: Layout, density: number): number {
  if (density === 1) return Math.min(1, edgeLength(edge));
  const run = layout.runOf.get(edge);
  const m = edgeMid(edge);
  if (!run) return Math.min(1, edgeLength(edge) / density);
  const room = Math.min(Math.hypot(m.x - run.a.x, m.y - run.a.y), Math.hypot(m.x - run.b.x, m.y - run.b.y));
  return Math.min(1, Math.max(edgeLength(edge), room * 2) / density);
}

function OpeningShape({ edge, kind, layout, closed, hot, u, density }: { edge: string; kind: string; layout: Layout; closed: boolean; hot: boolean; u: number; density: number }) {
  const m = edgeMid(edge);
  const angle = edgeAngle(edge);
  const normal = edgeNormal(edge);
  // 문과 창을 가로 100 으로 그린 뒤 벽 가운데로 옮겨 돌린다. 긴 벽은 양옆에 벽이 남고, 벽보다 크면 줄인다
  const fit = openingFit(edge, layout, density);
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
  // 문짝은 방 쪽으로 열린다. 돌린 그림의 +y 가 q 쪽인지 p 쪽인지 재서 고른다
  const roomP = pCell ? layout.byId.get(pCell)?.kind === 'room' : false;
  const roomQ = qCell ? layout.byId.get(qCell)?.kind === 'room' : false;
  const toQ = exit ? Boolean(qCell) : roomQ || !roomP;
  const rad = (angle * Math.PI) / 180;
  const yIsQ = -Math.sin(rad) * normal.x + Math.cos(rad) * normal.y > 0;
  const swing = yIsQ === toQ ? 1 : -1;
  // 밖으로 나가는 쪽
  const toward = pCell ? 1 : -1;
  const nx = normal.x * toward;
  const ny = normal.y * toward;
  return (
    <g data-door={edge} data-exit={exit ? '1' : '0'}>
      <g transform={place}>
        <line x1={8} y1={0} x2={92} y2={0} stroke="#fffdf6" strokeWidth={16} />
        {closed ? (
          <line x1={10} y1={0} x2={90} y2={0} stroke={color} strokeWidth={15} strokeLinecap="round" />
        ) : (
          <>
            <path d={`M86 0A74 74 0 0 ${swing > 0 ? 1 : 0} 12 ${swing * 74}`} fill="none" stroke={color} strokeWidth={3.5} strokeDasharray="6 7" />
            <line x1={12} y1={0} x2={12} y2={swing * 74} stroke={color} strokeWidth={10} strokeLinecap="round" />
          </>
        )}
      </g>
      {exit && (
        <g transform={`translate(${m.x * u + nx * 36} ${m.y * u + ny * 36}) rotate(${(Math.atan2(ny, nx) * 180) / Math.PI})`}>
          <path d="M-14 0H10M2-12L18 0L2 12" fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </g>
  );
}

export const PlanView = memo(PlanViewBase);
