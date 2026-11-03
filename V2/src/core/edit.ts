/**
 * 지도 고치기. 어떤 조작이든 끝에 `normalize` 를 거쳐 앞뒤가 맞는 지도만 남긴다.
 * 모든 함수는 새 지도를 돌려주고 받은 지도를 바꾸지 않는다.
 */
import { analyze, edgeBetween, edgeInGrid, isExterior, isInterior, reachableFrom, sqKey } from './grid';
import { OUT, type CellTag, type Layout, type MarkId, type OpeningKind, type Plan, type Pt } from './types';

export function emptyPlan(cols: number, rows: number): Plan {
  return { cols, rows, walls: [], openings: {}, tags: {}, marks: {}, route: [], route2: [] };
}

/** 벽이 바뀌어도 어긋나지 않게 맞춘다 */
export function normalize(plan: Plan): Plan {
  const walls = [...new Set(plan.walls)].filter((k) => edgeInGrid(plan, k)).sort();
  const wallSet = new Set(walls);
  const openings: Plan['openings'] = {};
  for (const [edge, kind] of Object.entries(plan.openings)) if (wallSet.has(edge)) openings[edge] = kind;

  const draft: Plan = { ...plan, walls, openings };
  const layout = analyze(draft);

  // 표지 — 칸마다 하나만 남기고, 칸이 아닌 네모의 표지는 지운다
  const tags: Plan['tags'] = {};
  for (const cell of layout.cells) {
    for (const s of cell.squares) {
      const k = sqKey(s.x, s.y);
      const tag = plan.tags[k];
      if (tag) {
        tags[k] = tag;
        break;
      }
    }
  }

  // 창은 겉벽에만 있다
  for (const [edge, kind] of Object.entries(openings)) {
    if (kind === 'window' && !isExterior(layout, edge)) delete openings[edge];
    if (kind === 'door' && !isExterior(layout, edge) && !isInterior(layout, edge)) delete openings[edge];
  }

  const marks: Plan['marks'] = {};
  for (const [id, at] of Object.entries(plan.marks) as [MarkId, Pt][]) {
    if (id === 'meet') {
      if (!insideAnyCell(layout, at)) marks.meet = at;
    } else if (layout.cellAt.has(sqKey(Math.floor(at.x), Math.floor(at.y)))) {
      marks[id] = at;
    }
  }

  const clean: Plan = { ...draft, tags, marks, openings };
  const fresh = analyze(clean);
  return {
    ...clean,
    route: trimRoute(clean, fresh, plan.route),
    route2: trimRoute(clean, fresh, plan.route2),
  };
}

function insideAnyCell(layout: Layout, at: Pt): boolean {
  return layout.cellAt.has(sqKey(Math.floor(at.x), Math.floor(at.y)));
}

/** 내 자리에서 시작해 문으로 이어진 데까지만 남긴다 */
export function trimRoute(plan: Plan, layout: Layout, route: string[]): string[] {
  const me = plan.marks.me;
  if (!me || route.length === 0) return [];
  const startCell = layout.cellAt.get(sqKey(Math.floor(me.x), Math.floor(me.y)));
  if (!startCell) return [];
  const out: string[] = [];
  let at: string | null = null;
  for (const step of route) {
    const id = step === OUT ? OUT : layout.cellAt.get(step);
    if (!id) break;
    if (at === null) {
      if (id !== startCell) break;
    } else if (!reachableFrom(layout, at).some((n) => n.to === id)) {
      break;
    }
    out.push(step);
    if (id === OUT) break;
    at = id;
  }
  return out;
}

/** 점을 잇는 획을 벽으로 더한다 */
export function addStroke(plan: Plan, dots: Pt[]): Plan {
  const add: string[] = [];
  for (let i = 1; i < dots.length; i++) add.push(edgeBetween(dots[i - 1]!, dots[i]!));
  return normalize({ ...plan, walls: [...plan.walls, ...add] });
}

export function addEdges(plan: Plan, edges: string[]): Plan {
  return normalize({ ...plan, walls: [...plan.walls, ...edges] });
}

export function removeWall(plan: Plan, edge: string): Plan {
  return normalize({ ...plan, walls: plan.walls.filter((k) => k !== edge) });
}

/** 칠하기. 같은 크레용으로 다시 누르면 지운다 */
export function paintCell(plan: Plan, layout: Layout, cellId: string, tag: CellTag): Plan {
  const cell = layout.byId.get(cellId);
  if (!cell) return plan;
  const tags = { ...plan.tags };
  const same = cell.kind === tag.kind && cell.name === tag.name;
  for (const s of cell.squares) delete tags[sqKey(s.x, s.y)];
  if (!same) tags[cell.id] = tag;
  return normalize({ ...plan, tags });
}

export type OpeningResult = { plan: Plan; ok: true } | { plan: Plan; ok: false; why: 'no-wall' | 'window-inside' };

/** 문·창 달기. 같은 것을 다시 누르면 뗀다 */
export function toggleOpening(plan: Plan, layout: Layout, edge: string, kind: OpeningKind): OpeningResult {
  if (!plan.walls.includes(edge)) return { plan, ok: false, why: 'no-wall' };
  if (kind === 'window' && !isExterior(layout, edge)) return { plan, ok: false, why: 'window-inside' };
  const openings = { ...plan.openings };
  if (openings[edge] === kind) delete openings[edge];
  else openings[edge] = kind;
  return { plan: normalize({ ...plan, openings }), ok: true };
}

export type MarkResult = { plan: Plan; ok: true } | { plan: Plan; ok: false; why: 'need-inside' | 'need-outside' };

/** 표시 놓기. 같은 자리를 다시 누르면 치운다 */
export function placeMark(plan: Plan, layout: Layout, id: MarkId, at: Pt): MarkResult {
  const key = sqKey(Math.floor(at.x), Math.floor(at.y));
  const inside = layout.cellAt.has(key);
  if (id === 'meet') {
    if (inside) return { plan, ok: false, why: 'need-outside' };
    return { plan: normalize({ ...plan, marks: { ...plan.marks, meet: at } }), ok: true };
  }
  if (!inside) return { plan, ok: false, why: 'need-inside' };
  const placed = { x: Math.floor(at.x) + 0.5, y: Math.floor(at.y) + 0.5 };
  const marks = { ...plan.marks };
  const old = marks[id];
  if (old && old.x === placed.x && old.y === placed.y) delete marks[id];
  else {
    // 한 네모에 표시 하나만 — 눌렀을 때 무엇을 고른 것인지 헷갈리지 않게 한다
    for (const other of Object.keys(marks) as MarkId[]) {
      const m = marks[other];
      if (other !== 'meet' && m && m.x === placed.x && m.y === placed.y) delete marks[other];
    }
    marks[id] = placed;
  }
  const next: Plan = { ...plan, marks };
  // 내 자리가 옮겨지면 시작이 달라지므로 길을 다시 고른다
  if (id === 'me') {
    next.route = [];
    next.route2 = [];
  }
  return { plan: normalize(next), ok: true };
}

export type RouteTap =
  | { plan: Plan; result: 'added' | 'done' | 'back' | 'start' }
  | { plan: Plan; result: 'no-way' | 'no-start' };

/**
 * 나가는 길에 칸을 더한다. `target` 은 네모 열쇠 또는 `out`.
 * 이미 지나온 칸을 누르면 거기까지 되돌아간다.
 */
export function tapRoute(plan: Plan, layout: Layout, which: 'route' | 'route2', target: string): RouteTap {
  const me = plan.marks.me;
  if (!me) return { plan, result: 'no-start' };
  const startKey = sqKey(Math.floor(me.x), Math.floor(me.y));
  const startCell = layout.cellAt.get(startKey);
  if (!startCell) return { plan, result: 'no-start' };

  const route = plan[which].length ? plan[which] : [startKey];
  const idOf = (step: string): string | undefined => (step === OUT ? OUT : layout.cellAt.get(step));
  const targetId = idOf(target);
  if (!targetId) return { plan, result: 'no-way' };

  const seenAt = route.findIndex((s) => idOf(s) === targetId);
  if (seenAt >= 0) {
    return { plan: { ...plan, [which]: route.slice(0, seenAt + 1) }, result: seenAt === 0 ? 'start' : 'back' };
  }
  const last = route[route.length - 1]!;
  if (last === OUT) return { plan, result: 'no-way' };
  const lastId = idOf(last)!;
  if (!reachableFrom(layout, lastId).some((n) => n.to === targetId)) return { plan, result: 'no-way' };
  return {
    plan: { ...plan, [which]: [...route, target] },
    result: target === OUT ? 'done' : 'added',
  };
}

/** 길이 다음에 갈 수 있는 곳 */
export function routeCandidates(plan: Plan, layout: Layout, which: 'route' | 'route2'): string[] {
  const me = plan.marks.me;
  if (!me) return [];
  const startKey = sqKey(Math.floor(me.x), Math.floor(me.y));
  const route = plan[which].length ? plan[which] : [startKey];
  const last = route[route.length - 1]!;
  if (last === OUT) return [];
  const lastId = layout.cellAt.get(last);
  if (!lastId) return [];
  const seen = new Set(route.map((s) => (s === OUT ? OUT : layout.cellAt.get(s))));
  return reachableFrom(layout, lastId)
    .map((n) => n.to)
    .filter((id) => !seen.has(id));
}
