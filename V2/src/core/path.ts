/**
 * 칸의 나열을 그림 위 점의 나열로 바꾼다. 벽을 뚫지 않고 문 가운데를 지난다.
 * 지도 · 대피 연습 · 3D 가 같은 계산을 쓴다.
 */
import { doorSquareFor, edgeMid, edgeNormal, edgeSides, isPassable, isSlanted, parseSq, pieceCenter, pieceKeyAt, reachableFrom, simplify, walkInCell } from './grid';
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

/**
 * 두 조각 사이에 놓인 지나갈 수 있는 벽 토막. `b` 가 `out` 이면 `a` 에서 밖으로 나가는 토막이다.
 * 여럿이면 `near` 에 가까운 것을 고른다. 없으면 null 이다.
 */
export function passBetween(plan: Plan, layout: Layout, a: string, b: string, near: Pt): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const e of layout.edges.values()) {
    if (e.hidden) continue;
    const other = e.sides[0] === a ? e.sides[1] : e.sides[1] === a ? e.sides[0] : null;
    if (other === null) continue;
    if (b === OUT ? layout.cellAt.has(other) : other !== b) continue;
    if (!isPassable(plan, layout, e.key)) continue;
    const d = dist(e.mid, near);
    if (d < bestD) {
      bestD = d;
      best = e.key;
    }
  }
  return best;
}

/** 길의 한 걸음 — `index` 번째 자리까지 가는 점들이다. 다른 칸으로 넘어가면 `cross` 에 지나는 문이 있다 */
export interface RouteLeg {
  index: number;
  points: Pt[];
  cross?: { edge: string; to: string };
}

/**
 * 길을 걸음마다 나눈다. `start` 번째 자리의 `from` 에서 시작한다(기본은 내 자리).
 * 방향키로 그린 길은 이웃한 조각을 차례로 지나므로 지나간 자리 그대로 나온다(대장 #160 · #161).
 * 「도와줘」가 고른 길처럼 칸만 적힌 길은 문까지 걸어가서 넘어간다.
 */
export function routeLegs(plan: Plan, layout: Layout, route: string[], start = 0, from: Pt | undefined = plan.marks.me): RouteLeg[] {
  const first = route[start];
  if (!from || first === undefined || first === OUT) return [];
  let at = layout.cellAt.get(pieceKeyAt(layout, from)) ?? layout.cellAt.get(first);
  if (!at) return [];
  let pt: Pt = from;
  const legs: RouteLeg[] = [];
  for (let i = start + 1; i < route.length; i++) {
    const step = route[i]!;
    const to = step === OUT ? OUT : layout.cellAt.get(step);
    if (!to) break;
    const here = pieceKeyAt(layout, pt);
    if (to === at) {
      // 같은 칸 안 — 조각을 따라 지난다
      const walk = walkInCell(plan, layout, at, here, step).slice(1);
      legs.push({ index: i, points: walk });
      pt = walk[walk.length - 1] ?? pt;
      continue;
    }
    const direct = passBetween(plan, layout, here, step, pt);
    if (direct) {
      const end = to === OUT ? exitPoint(layout, direct, plan.density ?? 1) : pieceCenter(step);
      legs.push({ index: i, points: [edgeMid(direct), end], cross: { edge: direct, to } });
      pt = end;
    } else {
      const via = reachableFrom(layout, at)
        .filter((n) => n.to === to)
        .sort((a, b) => dist(edgeMid(a.edge), pt) - dist(edgeMid(b.edge), pt))[0];
      if (!via) break;
      const hop = hopPoints(plan, layout, at, pt, to, via.edge);
      legs.push({ index: i, points: hop, cross: { edge: via.edge, to } });
      pt = hop[hop.length - 1]!;
    }
    if (to === OUT) break;
    at = to;
  }
  return legs;
}

/** 길 전체의 점. 시작은 내 자리다. 끝이 `out` 이면 문 밖 한 칸까지 간다 */
export function routePoints(plan: Plan, layout: Layout, route: string[]): Pt[] {
  const me = plan.marks.me;
  if (!me || route.length === 0) return [];
  if (route[0] === OUT || !layout.cellAt.get(route[0]!)) return [];
  return simplify([me, ...routeLegs(plan, layout, route).flatMap((leg) => leg.points)]);
}

/** 길의 끝 — 지금 서 있는 조각과 자리다. 길이 없으면 내 자리이고, 밖까지 갔으면 null 이다 */
export function routeCursor(plan: Plan, layout: Layout, route: string[]): { piece: string; pt: Pt } | null {
  const me = plan.marks.me;
  if (!me) return null;
  const start = pieceKeyAt(layout, me);
  if (!layout.cellAt.has(start)) return null;
  if (route.length <= 1) return { piece: start, pt: me };
  if (route[route.length - 1] === OUT) return null;
  const legs = routeLegs(plan, layout, route);
  const last = legs[legs.length - 1];
  const pt = last?.points[last.points.length - 1] ?? me;
  return { piece: pieceKeyAt(layout, pt), pt };
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

export type ArrowDir = 'left' | 'right' | 'up' | 'down';

export const ARROW: Record<ArrowDir, Pt> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

/** 방향키 한 번 — 같은 칸 안에서 걷거나(`walk`), 문이나 트인 곳을 지나 다른 칸이나 밖으로 가거나(`cross`), 벽에 막힌다 */
export type SquareStep =
  | { kind: 'walk'; piece: string; pt: Pt }
  | { kind: 'cross'; piece: string; pt: Pt; edge: string; to: string; open: boolean; via: Pt }
  | { kind: 'blocked' };

/** 벽 조각 위의 한 점이 놓인 토막의 열쇠 */
function edgeAt(layout: Layout, wall: string, at: Pt): string | null {
  if (layout.edges.has(wall)) return wall;
  for (const e of layout.edges.values()) {
    if (e.wall !== wall) continue;
    if (Math.abs(dist(e.a, at) + dist(at, e.b) - dist(e.a, e.b)) < 1e-6) return e.key;
  }
  return null;
}

/**
 * 조각 `from` 에서 방향키 쪽으로 모눈 한 칸 간다(대장 #160). 누른 쪽 그대로 가므로 어디로 갈지 헷갈리지 않는다.
 * 벽은 막고, 문 · 틈 · 트인 칸끼리 맞닿은 곳은 지나간다. 비스듬한 벽의 문은 그쪽으로 기운 방향키로 지난다.
 */
export function squareStep(plan: Plan, layout: Layout, from: string, dir: ArrowDir): SquareStep {
  const cell = layout.cellAt.get(from);
  if (!cell) return { kind: 'blocked' };
  const v = ARROW[dir];
  const sq = parseSq(from);
  const c = pieceCenter(from);
  const walls = new Set(plan.walls);
  const cross = (edge: string, other: string, via: Pt): SquareStep => {
    const to = layout.cellAt.get(other) ?? OUT;
    if (to === cell) return { kind: 'walk', piece: other, pt: pieceCenter(other) };
    const open = plan.openings[edge] !== 'door';
    if (to === OUT) return { kind: 'cross', piece: OUT, pt: exitPoint(layout, edge, plan.density ?? 1), edge, to, open, via };
    return { kind: 'cross', piece: other, pt: pieceCenter(other), edge, to, open, via };
  };
  // 누른 쪽 변에 맞닿은 조각. 여럿이면 곧장 앞에 있는 것부터 본다
  const off = (p: Pt): number => Math.abs((p.x - c.x) * v.y - (p.y - c.y) * v.x);
  const ahead = (layout.adjacent.get(from) ?? [])
    .filter((n) => n.sq.x - sq.x === v.x && n.sq.y - sq.y === v.y)
    .sort((a, b) => off(a.portal) - off(b.portal));
  for (const n of ahead) {
    if (!walls.has(n.edge)) {
      if (layout.cellAt.get(n.to) === cell) return { kind: 'walk', piece: n.to, pt: pieceCenter(n.to) };
      continue;
    }
    const edge = edgeAt(layout, n.edge, n.portal);
    if (edge && isPassable(plan, layout, edge)) return cross(edge, n.to, n.portal);
  }
  // 비스듬한 벽에 난 문 — 한 네모 안의 건너편 조각으로 간다
  for (const e of layout.edges.values()) {
    if (e.hidden || !isSlanted(e.wall)) continue;
    const other = e.sides[0] === from ? e.sides[1] : e.sides[1] === from ? e.sides[0] : null;
    if (other === null || !isPassable(plan, layout, e.key)) continue;
    const len = dist(e.mid, c) || 1;
    if (((e.mid.x - c.x) * v.x + (e.mid.y - c.y) * v.y) / len < 0.5) continue;
    return cross(e.key, other, e.mid);
  }
  return { kind: 'blocked' };
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
