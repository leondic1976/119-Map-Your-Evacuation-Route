/**
 * 지도 그림 — 그리기·대피 연습·인쇄가 모두 이 SVG 하나를 쓴다.
 * 네모 한 칸이 100 단위다. 포인터는 네모 단위 좌표로 바꿔서 알려 준다.
 */
import { memo, useId, useMemo, useRef, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { edgeEnds, edgeMid, edgeSides, parseEdge, sqKey } from '../core/grid';
import { routePoints } from '../core/path';
import { OUT, type Layout, type MarkId, type Plan, type Pt } from '../core/types';
import { cellLabel, MARK_NAME, type LookId } from '../content/names';
import { HandGlyph, MarkGlyph } from './art';

export const U = 100;
/** 그림 둘레 여백 — 집 위나 옆으로 나가는 화살표가 잘리지 않을 만큼 둔다 */
const MARGIN = 84;

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
  onPointer?: (kind: 'down' | 'move' | 'up' | 'cancel', p: Pt, e: RPointerEvent<SVGSVGElement>) => void;
}

const wob = (s: string, n: number): number => {
  let h = n * 131;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * 7;
};

/** 연필로 그은 듯 살짝 휜 선 */
function pencilPath(key: string, a: Pt, b: Pt): string {
  const ax = a.x * U;
  const ay = a.y * U;
  const bx = b.x * U;
  const by = b.y * U;
  const mx = (ax + bx) / 2 + wob(key, 1);
  const my = (ay + by) / 2 + wob(key, 2);
  return `M${ax} ${ay}Q${mx} ${my} ${bx} ${by}`;
}

function PlanViewBase(props: PlanViewProps) {
  const { plan, layout, showDots, guide, stroke, armed, hotEdge, glow, warn, showRoute, hazard, closedDoors } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  // 인쇄용 그림과 화면 그림이 한 문서에 있어 무늬 이름이 겹치면 숨긴 쪽을 가리키게 된다
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const pat = (name: string): string => `url(#${name}-${uid})`;
  const showLabels = props.showLabels !== false;

  const width = plan.cols * U;
  const height = plan.rows * U;
  const stripTop = height + 34;
  const stripH = 112;

  const toPlan = (e: RPointerEvent<SVGSVGElement>): Pt => {
    const svg = svgRef.current!;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: pt.x / U, y: pt.y / U };
  };
  const handle = (kind: 'down' | 'move' | 'up' | 'cancel') => (e: RPointerEvent<SVGSVGElement>) => {
    if (!props.onPointer) return;
    if (kind === 'down') e.currentTarget.setPointerCapture(e.pointerId);
    props.onPointer(kind, toPlan(e), e);
  };

  const route1 = useMemo(() => (showRoute ? routePoints(plan, layout, plan.route) : []), [showRoute, plan, layout]);
  const route2 = useMemo(() => (showRoute ? routePoints(plan, layout, plan.route2) : []), [showRoute, plan, layout]);
  const glowSet = new Set(glow ?? []);
  const warnSet = new Set(warn ?? []);
  const closedSet = new Set(closedDoors ?? []);

  return (
    <svg
      ref={svgRef}
      className={`plan ${props.className ?? ''}`}
      viewBox={`${-MARGIN} ${-MARGIN} ${width + MARGIN * 2} ${stripTop + stripH + MARGIN + 26}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={props.ariaLabel ?? '우리 집 지도'}
      data-cols={plan.cols}
      data-rows={plan.rows}
      data-cells={layout.cells.length}
      data-walls={plan.walls.length}
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
            {cell.squares.map((s) => (
              <rect key={`${s.x},${s.y}`} x={s.x * U - 0.5} y={s.y * U - 0.5} width={U + 1} height={U + 1} fill={fill} />
            ))}
          </g>
        );
      })}

      {/* 밖으로 이어지지 않은 칸 */}
      {layout.cells.filter((c) => warnSet.has(c.id)).map((cell) => (
        <g key={`w${cell.id}`} className="warn-cell">
          {cell.squares.map((s) => (
            <rect key={`${s.x},${s.y}`} x={s.x * U + 6} y={s.y * U + 6} width={U - 12} height={U - 12} rx={10} fill="none" stroke="#b5651d" strokeWidth={6} strokeDasharray="14 12" />
          ))}
        </g>
      ))}

      {/* 반짝이는 칸 */}
      {layout.cells.filter((c) => glowSet.has(c.id)).map((cell) => (
        <g key={`g${cell.id}`} className="glow-cell">
          {cell.squares.map((s) => (
            <rect key={`${s.x},${s.y}`} x={s.x * U} y={s.y * U} width={U} height={U} fill="#ffffff" opacity=".6" />
          ))}
        </g>
      ))}

      {/* 위험 — 붉은 점멸 없이 천천히 번지는 모습만 보인다 */}
      {hazard && layout.cells.map((cell) => {
        const lv = hazard[cell.id] ?? 0;
        if (lv === 0) return null;
        return (
          <g key={`h${cell.id}`} data-hazard={lv}>
            {cell.squares.map((s, i) => (
              <g key={`${s.x},${s.y}`}>
                <rect className="smoke-sq" x={s.x * U} y={s.y * U} width={U} height={U} fill="#5c5f66" opacity={lv === 1 ? 0.18 : lv === 2 ? 0.42 : 0.5} />
                {lv === 3 && (
                  <g className="flame" style={{ animationDelay: `${(i % 4) * 0.25}s` }} transform={`translate(${s.x * U + 50} ${s.y * U + 62})`}>
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
      {guide && guide.filter((k) => !plan.walls.includes(k)).map((k) => {
        const [a, b] = edgeEnds(k);
        return <line key={`gd${k}`} className="guide-line" x1={a.x * U} y1={a.y * U} x2={b.x * U} y2={b.y * U} />;
      })}

      {/* 벽 */}
      <g className="walls">
        {plan.walls.map((k) => {
          const [a, b] = edgeEnds(k);
          return <path key={k} d={pencilPath(k, a, b)} className={k === hotEdge ? 'wall hot' : 'wall'} />;
        })}
      </g>

      {/* 문과 창 */}
      {Object.entries(plan.openings).map(([edge, kind]) => (
        <OpeningShape key={edge} edge={edge} kind={kind} layout={layout} closed={closedSet.has(edge)} hot={edge === hotEdge} />
      ))}

      {/* 그리는 중인 획 */}
      {stroke && stroke.length > 1 && (
        <polyline className="stroke-live" points={stroke.map((p) => `${p.x * U},${p.y * U}`).join(' ')} />
      )}

      {/* 칸 이름 */}
      {showLabels && layout.cells.filter((c) => c.kind).map((cell) => {
        const label = cellLabel(cell.kind, cell.name);
        return (
          <text
            key={`l${cell.id}`}
            className="cell-label"
            x={(cell.anchor.x + 0.5) * U}
            y={(cell.anchor.y + 0.5) * U}
            fontSize={label.length > 3 && cell.squares.length < 3 ? 22 : 28}
          >
            {label}
          </text>
        );
      })}
      {showLabels && props.glow === undefined && props.showDots !== true && layout.cells.filter((c) => !c.kind).map((cell) => (
        <text key={`q${cell.id}`} className="cell-unknown" x={(cell.anchor.x + 0.5) * U} y={(cell.anchor.y + 0.5) * U}>?</text>
      ))}

      {/* 나가는 길 */}
      {route2.length > 1 && (
        <polyline className="route route-2" points={route2.map((p) => `${p.x * U},${p.y * U}`).join(' ')} />
      )}
      {route1.length > 1 && (
        <polyline className="route route-1" markerEnd="" points={route1.map((p) => `${p.x * U},${p.y * U}`).join(' ')} />
      )}
      {route1.length > 1 && <RouteArrow points={route1} color="#d6402f" />}
      {route2.length > 1 && <RouteArrow points={route2} color="#c97a12" />}

      {/* 표시 */}
      {(Object.entries(plan.marks) as [MarkId, Pt][]).map(([id, at]) => (
        <g key={id} transform={`translate(${at.x * U} ${at.y * U})`} data-mark={id} className="mark">
          <MarkGlyph id={id} look={props.look} />
          <text className="mark-label" y={48} fontSize={id === 'alarm' ? 20 : 22}>{MARK_NAME[id]}</text>
        </g>
      ))}

      {/* 눌러야 할 곳 */}
      {(props.hints ?? []).map((id) => {
        const cell = layout.byId.get(id);
        const x = cell ? (cell.anchor.x + 0.5) * U : width * 0.28;
        // 칸 이름 바로 아래에 놓아 글자가 겹치지 않게 한다
        const y = cell ? (cell.anchor.y + 0.5) * U + 58 : stripTop + 34;
        return (
          <g key={`hint${id}`} className="tap-hint" data-hint={id} transform={`translate(${x} ${y})`} pointerEvents="none">
            <g className="tap-hand"><HandGlyph scale={1.5} /></g>
            <text className="tap-word" x={0} y={-12}>여기를 눌러</text>
          </g>
        );
      })}

      {/* 점 */}
      {showDots && (
        <g className="dots">
          {Array.from({ length: plan.rows + 1 }, (_, y) =>
            Array.from({ length: plan.cols + 1 }, (_, x) => (
              <circle key={`${x},${y}`} cx={x * U} cy={y * U} r={armed && armed.x === x && armed.y === y ? 19 : 10} className={armed && armed.x === x && armed.y === y ? 'dot armed' : 'dot'} />
            )),
          )}
        </g>
      )}

      {props.children}
    </svg>
  );
}

function RouteArrow({ points, color }: { points: Pt[]; color: string }) {
  const b = points[points.length - 1]!;
  const a = points[points.length - 2]!;
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return (
    <g transform={`translate(${b.x * U} ${b.y * U}) rotate(${angle})`}>
      <path d="M-4-20 26 0-4 20z" fill={color} stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
    </g>
  );
}

function OpeningShape({ edge, kind, layout, closed, hot }: { edge: string; kind: string; layout: Layout; closed: boolean; hot: boolean }) {
  const [a] = edgeEnds(edge);
  const { o } = parseEdge(edge);
  const m = edgeMid(edge);
  // 벽 조각을 가로 100 으로 놓고 그린 뒤 돌린다
  const place = `translate(${a.x * U} ${a.y * U}) rotate(${o === 'v' ? 90 : 0})`;
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
  const [p, q] = edgeSides(edge);
  const pCell = layout.cellAt.get(sqKey(p.x, p.y));
  const qCell = layout.cellAt.get(sqKey(q.x, q.y));
  const exit = Boolean(pCell) !== Boolean(qCell);
  const color = hot ? '#2f7fbf' : exit ? '#2e8b57' : '#9a5b2a';
  // 문짝은 방 쪽으로 열린다. 가로 벽은 그림 +y 가 q 쪽이고, 세로 벽은 돌아가면서 +y 가 p 쪽이 된다
  const roomP = pCell ? layout.byId.get(pCell)?.kind === 'room' : false;
  const roomQ = qCell ? layout.byId.get(qCell)?.kind === 'room' : false;
  const toQ = exit ? Boolean(qCell) : roomQ || !roomP;
  const swing = (o === 'h' ? toQ : !toQ) ? 1 : -1;
  const nx = o === 'v' ? (pCell ? 1 : -1) : 0;
  const ny = o === 'h' ? (pCell ? 1 : -1) : 0;
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
        <g transform={`translate(${m.x * U + nx * 36} ${m.y * U + ny * 36})`}>
          <path d={o === 'v' ? `M${-nx * 14} 0H${nx * 10}M${nx * 2} -12L${nx * 18} 0L${nx * 2} 12` : `M0 ${-ny * 14}V${ny * 10}M-12 ${ny * 2}L0 ${ny * 18}L12 ${ny * 2}`} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </g>
  );
}

export const PlanView = memo(PlanViewBase);
