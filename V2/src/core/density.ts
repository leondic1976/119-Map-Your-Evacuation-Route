/**
 * 모눈의 촘촘함 — 같은 크기의 종이에 네모를 몇 칸이나 그릴지 정한다.
 *
 * 지도의 좌표는 언제나 지금 점 단위다. `plan.density` 는 처음 네모 한 칸이 지금 몇 칸인지이고 소수일 수 있다.
 * 그림은 같은 크기로 그리므로 칸·문·길 계산은 이 값을 몰라도 그대로 돈다.
 *
 * 배로 늘리면 벽이 같은 자리에 그대로 남는다. 그 밖의 개수는 벽 끝을 가장 가까운 점으로 옮긴다.
 *
 * 아이는 촘촘함을 고르지 않는다(대장 #191). 지도를 크게 보면 모눈이 반 칸으로 나뉘어 보이고,
 * 그 반 칸에 벽을 그은 때에만 종이가 배로 촘촘해진다(`plan.fine`).
 */
import { analyze, edgeEnds, edgeMid, pieceCenter, pieceKeyAt, segmentEdges, simplify } from './grid';
import { addStroke, normalize } from './edit';
import { OUT, type MarkId, type Plan, type Pt } from './types';

export const densityOf = (plan: Plan): number => plan.density ?? 1;

/** 모눈 한 칸이 지금 점 몇 칸인가 */
export const fineOf = (plan: Plan): number => plan.fine ?? 1;
/** 이 배율부터 모눈이 반 칸으로 나뉘어 보인다. 크게 보기 단추 두 번이다 */
export const FINE_ZOOM = 1.9;
/** 반 칸으로 나눌 수 있는 가장 큰 종이 */
const FINE_COLS = 48;
const FINE_ROWS = 36;
/** 크게 보면 반 칸 모눈에 그릴 수 있는가 */
export const hasHalf = (plan: Plan): boolean => fineOf(plan) > 1 || (plan.cols * 2 <= FINE_COLS && plan.rows * 2 <= FINE_ROWS);

/** 종이를 배로 촘촘하게 한다. 벽은 제자리에 남는다 */
export function refine(plan: Plan): Plan {
  if (fineOf(plan) > 1) return plan;
  return { ...changeGrid(plan, plan.cols * 2, plan.rows * 2), fine: 2 };
}

/**
 * 반 칸 단위로 센 점들을 이어 벽을 긋는다. 반 칸 자리를 지나는 꺾임이 없으면 종이를 그대로 두고,
 * 있으면 종이를 배로 촘촘하게 한 뒤 긋는다. 나눌 수 없는 종이는 그대로 돌려준다.
 */
export function addHalfStroke(plan: Plan, halves: Pt[]): Plan {
  if (fineOf(plan) > 1) return addStroke(plan, halves);
  const stops = simplify(halves);
  if (stops.every((p) => p.x % 2 === 0 && p.y % 2 === 0)) return addStroke(plan, stops.map((p) => ({ x: p.x / 2, y: p.y / 2 })));
  return hasHalf(plan) ? addStroke(refine(plan), halves) : plan;
}

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

/** 네모 수를 cols×rows 로 바꾼다. 벽·문·표지·표시·가구·길이 비슷한 자리에 남는다 */
export function changeGrid(plan: Plan, cols: number, rows: number): Plan {
  if (cols === plan.cols && rows === plan.rows) return plan;
  const rx = cols / plan.cols;
  const ry = rows / plan.rows;
  const free = (p: Pt): Pt => ({ x: p.x * rx, y: p.y * ry });
  const dot = (p: Pt): Pt => ({ x: Math.round(p.x * rx), y: Math.round(p.y * ry) });

  const walls = [...new Set(straightRuns(plan.walls).flatMap(({ a, b }) => {
    const from = dot(a);
    const to = dot(b);
    return from.x === to.x && from.y === to.y ? [] : segmentEdges(from, to);
  }))];

  const density = densityOf(plan) * rx;
  const draft: Plan = {
    ...plan,
    cols,
    rows,
    density: Math.abs(density - 1) < 1e-9 ? undefined : density,
    walls,
    openings: {},
    tags: {},
    route: [],
    route2: [],
  };
  const fresh = analyze(draft);

  // 문과 창 — 있던 자리에 가장 가까운 벽 조각에 단다
  const openings: Plan['openings'] = {};
  const doorTurns: Record<string, number> = {};
  const doorSizes: Record<string, number> = {};
  const doorSlides: Record<string, true> = {};
  for (const [edge, kind] of Object.entries(plan.openings)) {
    const m = free(edgeMid(edge));
    const near = walls
      .map((wall) => ({ wall, d: Math.hypot(edgeMid(wall).x - m.x, edgeMid(wall).y - m.y) }))
      .sort((p, q) => p.d - q.d || (p.wall < q.wall ? -1 : 1))[0];
    if (near && !openings[near.wall]) {
      openings[near.wall] = kind;
      const turn = plan.doorTurns?.[edge];
      if (turn) doorTurns[near.wall] = turn;
      const size = plan.doorSizes?.[edge];
      if (size) doorSizes[near.wall] = size;
      if (plan.doorSlides?.[edge]) doorSlides[near.wall] = true;
    }
  }

  // 표지 — 조각 가운데가 든 새 조각에 붙인다
  const tags: Plan['tags'] = {};
  for (const [key, tag] of Object.entries(plan.tags)) tags[pieceKeyAt(fresh, free(pieceCenter(key)))] = tag;

  const marks: Plan['marks'] = {};
  for (const [id, at] of Object.entries(plan.marks) as [MarkId, Pt][]) marks[id] = free(at);

  const step = (s: string): string => (s === OUT ? OUT : pieceKeyAt(fresh, free(pieceCenter(s))));
  const items = plan.items?.map((item) => ({ ...item, ...free(item) }));

  const extraExtinguishers = plan.extraExtinguishers?.map(free);
  const extraAlarms = plan.extraAlarms?.map(free);

  return normalize({ ...draft, openings, doorTurns, doorSizes, doorSlides, tags, marks, extraExtinguishers, extraAlarms, items, route: plan.route.map(step), route2: plan.route2.map(step) });
}
