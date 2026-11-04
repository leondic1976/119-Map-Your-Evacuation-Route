/**
 * 점 간격 — 네모 하나를 몇 칸으로 나눌지 정한다. 칸이 나뉘어도 집의 크기는 그대로다.
 *
 * 지도의 좌표는 언제나 지금 간격의 점 단위다. 간격을 좁히면 모든 좌표가 배로 늘고, 그림은 같은 크기로 그린다.
 * 그래서 칸·문·길 계산은 간격을 몰라도 그대로 돈다. 넓히려면 벽 끝이 모두 넓은 점 위에 있어야 한다.
 */
import { analyze, edgeMid, edgeEnds, pieceCenter, pieceKeyAt, segmentEdges } from './grid';
import { normalize } from './edit';
import { OUT, type MarkId, type Plan, type Pt } from './types';

export const DENSITIES = [1, 2, 4] as const;
export type Density = (typeof DENSITIES)[number];

export const densityOf = (plan: Plan): number => plan.density ?? 1;

/** 곧게 이어진 벽 조각들을 한 줄로 묶어 끝점만 돌려준다 */
export function straightRuns(walls: string[]): { a: Pt; b: Pt }[] {
  const dirOf = (a: Pt, b: Pt): string => `${b.x - a.x},${b.y - a.y}`;
  const starts = new Map<string, { a: Pt; b: Pt }>();
  const ends = new Set<string>();
  for (const wall of walls) {
    const [a, b] = edgeEnds(wall);
    const dir = dirOf(a, b);
    starts.set(`${a.x},${a.y}|${dir}`, { a, b });
    ends.add(`${b.x},${b.y}|${dir}`);
  }
  const runs: { a: Pt; b: Pt }[] = [];
  for (const [key, first] of starts) {
    if (ends.has(key)) continue;
    const dir = dirOf(first.a, first.b);
    let last = first;
    for (;;) {
      const next = starts.get(`${last.b.x},${last.b.y}|${dir}`);
      if (!next) break;
      last = next;
    }
    runs.push({ a: first.a, b: last.b });
  }
  return runs;
}

/** 이 간격으로 바꿀 수 있나. 좁히기는 늘 되고, 넓히기는 벽 끝이 넓은 점 위에 있을 때만 된다 */
export function canChangeDensity(plan: Plan, next: number): boolean {
  const current = densityOf(plan);
  if (next >= current) return true;
  const f = current / next;
  return straightRuns(plan.walls).every(({ a, b }) => [a.x, a.y, b.x, b.y].every((v) => v % f === 0));
}

const times = (p: Pt, r: number): Pt => ({ x: p.x * r, y: p.y * r });

/** 점 간격을 바꾼다. 벽·문·표지·표시·길이 같은 자리에 남는다 */
export function changeDensity(plan: Plan, next: number): Plan {
  const current = densityOf(plan);
  if (next === current || !canChangeDensity(plan, next)) return plan;
  const r = next / current;

  const walls = straightRuns(plan.walls).flatMap(({ a, b }) => segmentEdges(times(a, r), times(b, r)));

  const draft: Plan = {
    ...plan,
    cols: plan.cols * r,
    rows: plan.rows * r,
    density: next,
    walls,
    openings: {},
    tags: {},
    route: [],
    route2: [],
  };
  const fresh = analyze(draft);

  // 문과 창 — 있던 자리의 벽 조각에 단다
  const openings: Plan['openings'] = {};
  for (const [edge, kind] of Object.entries(plan.openings)) {
    const m = times(edgeMid(edge), r);
    const near = walls
      .map((wall) => ({ wall, d: Math.hypot(edgeMid(wall).x - m.x, edgeMid(wall).y - m.y) }))
      .sort((p, q) => p.d - q.d || (p.wall < q.wall ? -1 : 1))[0];
    if (near && !openings[near.wall]) openings[near.wall] = kind;
  }

  // 표지 — 조각 가운데가 든 새 네모에 붙인다
  const tags: Plan['tags'] = {};
  for (const [key, tag] of Object.entries(plan.tags)) {
    const c = times(pieceCenter(key), r);
    const hit = pieceKeyAt(fresh, c);
    tags[hit] = tag;
  }

  const marks: Plan['marks'] = {};
  for (const [id, at] of Object.entries(plan.marks) as [MarkId, Pt][]) marks[id] = times(at, r);

  const step = (s: string): string => (s === OUT ? OUT : pieceKeyAt(fresh, times(pieceCenter(s), r)));

  return normalize({ ...draft, openings, tags, marks, route: plan.route.map(step), route2: plan.route2.map(step) });
}
