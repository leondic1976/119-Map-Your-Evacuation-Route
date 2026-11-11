/**
 * 칸의 나열을 그림 위 점의 나열로 바꾼다. 벽을 뚫지 않고 문 가운데를 지난다.
 * 지도 · 대피 연습 · 3D 가 같은 계산을 쓴다.
 */
import { doorSquareFor, edgeMid, edgeNormal, edgeSides, pieceCenter, pieceKeyAt, reachableFrom, simplify, walkInCell } from './grid';
import { OUT, type Layout, type Plan, type Pt } from './types';

/** 문 밖으로 나선 자리. 점 간격이 좁아도 예전 네모 반 칸만큼 나선다 */
export function exitPoint(layout: Layout, edge: string, density = 1): Pt {
  const [p, q] = edgeSides(layout, edge);
  const near = pieceCenter(layout.cellAt.has(p) ? q : p);
  if (density <= 1) return near;
  const m = edgeMid(edge);
  const n = edgeNormal(edge);
  const toward = layout.cellAt.has(p) ? 1 : -1;
  const far = { x: m.x + n.x * toward * 0.5 * density, y: m.y + n.y * toward * 0.5 * density };
  return layout.cellAt.has(pieceKeyAt(layout, far)) ? near : far;
}

/** from 칸의 from 점에서 to 칸으로 넘어가는 점들. 첫 점은 넣지 않는다 */
export function hopPoints(
  plan: Plan,
  layout: Layout,
  fromCell: string,
  fromPt: Pt,
  toCell: string,
  edge: string,
): Pt[] {
  const inside = walkInCell(plan, layout, fromCell, pieceKeyAt(layout, fromPt), doorSquareFor(layout, edge, fromCell)).slice(1);
  const mid = edgeMid(edge);
  if (toCell === OUT) return [...inside, mid, exitPoint(layout, edge, plan.density ?? 1)];
  return [...inside, mid, pieceCenter(doorSquareFor(layout, edge, toCell))];
}

/** 길 전체의 점. 시작은 내 자리다. 끝이 `out` 이면 문 밖 한 칸까지 간다 */
export function routePoints(plan: Plan, layout: Layout, route: string[]): Pt[] {
  const me = plan.marks.me;
  if (!me || route.length === 0) return [];
  let at = route[0] === OUT ? null : layout.cellAt.get(route[0]!);
  if (!at) return [];
  let pt: Pt = me;
  const out: Pt[] = [pt];
  for (let i = 1; i < route.length; i++) {
    const step = route[i]!;
    const to = step === OUT ? OUT : layout.cellAt.get(step);
    if (!to) break;
    if (to === at) {
      // 같은 칸 안 — 끌어서 그은 자리를 조각을 따라 지난다
      const walk = walkInCell(plan, layout, at, pieceKeyAt(layout, pt), step).slice(1);
      out.push(...walk);
      pt = walk[walk.length - 1] ?? pt;
      continue;
    }
    const via = reachableFrom(layout, at)
      .filter((n) => n.to === to)
      .sort((a, b) => dist(edgeMid(a.edge), pt) - dist(edgeMid(b.edge), pt))[0];
    if (!via) break;
    const hop = hopPoints(plan, layout, at, pt, to, via.edge);
    out.push(...hop);
    pt = hop[hop.length - 1]!;
    if (to === OUT) break;
    at = to;
  }
  return simplify(out);
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

export type ArrowDir = 'left' | 'right' | 'up' | 'down';

export const ARROW: Record<ArrowDir, Pt> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

const ARROW_DIRS = Object.keys(ARROW) as ArrowDir[];

/**
 * 문마다 화살표를 하나씩 배정한다. 같은 쪽에 문이 둘이면 먼 문이 영영 눌리지 않기 때문이다.
 * 밖으로 나가는 문을 먼저 배정하고, 나머지는 방향이 잘 맞는 순서로 배정한다.
 * 맞는 방향이 이미 찼으면 비어 있는 옆 방향을 쓴다.
 */
export function arrowMap<T extends { edge: string; to: string }>(from: Pt, options: T[]): Partial<Record<ArrowDir, T>> {
  const score = (option: T, dir: ArrowDir): number => {
    const d = ARROW[dir];
    const m = edgeMid(option.edge);
    const vx = m.x - from.x;
    const vy = m.y - from.y;
    const len = Math.hypot(vx, vy) || 1;
    // 방향이 맞을수록, 같으면 가까울수록 앞선다
    return (vx * d.x + vy * d.y) / len - len * 0.001;
  };
  const out: Partial<Record<ArrowDir, T>> = {};
  const placed = new Set<T>();
  const assign = (list: T[], least: number): void => {
    const pairs = list.flatMap((option) => ARROW_DIRS.map((dir) => ({ option, dir, s: score(option, dir) })));
    pairs.sort((a, b) => b.s - a.s);
    for (const p of pairs) {
      if (p.s < least || out[p.dir] || placed.has(p.option)) continue;
      out[p.dir] = p.option;
      placed.add(p.option);
    }
  };
  assign(options.filter((o) => o.to === OUT), 0.35);
  assign(options, 0.35);
  // 남은 문은 빈 방향으로 — 정면이 찼어도 키보드로 닿게 한다
  assign(options, -1);
  return out;
}

/** 지금 자리에서 그 방향에 배정된 문. 없으면 null */
export function pickByArrow<T extends { edge: string; to: string }>(from: Pt, options: T[], dir: ArrowDir): T | null {
  return arrowMap(from, options)[dir] ?? null;
}

/** 꺾은선 전체 길이 */
export function polylineLength(points: Pt[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += dist(points[i - 1]!, points[i]!);
  return sum;
}

/** 꺾은선을 0~1 비율 위치로 읽는다 */
export function pointAlong(points: Pt[], t: number): Pt {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0]!;
  const total = polylineLength(points);
  let left = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const d = dist(a, b);
    if (left <= d && d > 0) {
      const r = left / d;
      return { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r };
    }
    left -= d;
  }
  return points[points.length - 1]!;
}
