/**
 * 지도 고치기. 어떤 조작이든 끝에 `normalize` 를 거쳐 앞뒤가 맞는 지도만 남긴다.
 * 모든 함수는 새 지도를 돌려주고 받은 지도를 바꾸지 않는다.
 */
import { analyze, cellIdAt, edgeEnds, edgeInGrid, edgeMid, isExterior, isInterior, pieceCenter, pieceKeyAt, reachableFrom, segmentEdges, sqKey, tagFor, wallOf } from './grid';
import { itemsInside } from './items';
import { OUT, type CellTag, type Layout, type MarkId, type OpeningKind, type Plan, type Pt } from './types';

export function emptyPlan(cols: number, rows: number, density = 1): Plan {
  return { cols: cols * density, rows: rows * density, ...(density > 1 ? { density } : {}), walls: [], openings: {}, tags: {}, marks: {}, route: [], route2: [] };
}

/**
 * 문과 창을 벽 토막에 맞춘다. 다른 벽이 엇갈려 토막이 바뀌어도 있던 자리에 남는다.
 * 그 자리가 꼬리 토막이면 쓸 수 있는 옆 토막으로 옮긴다.
 */
function placeOpenings(openings: Plan['openings'], layout: Layout): Plan['openings'] {
  const out: Plan['openings'] = {};
  const usable = (key: string): boolean => isExterior(layout, key) || isInterior(layout, key);
  for (const [edge, kind] of Object.entries(openings)) {
    const wall = wallOf(edge);
    const pieces = [...layout.edges.values()].filter((e) => e.wall === wall);
    if (pieces.length === 0) continue;
    const [a, b] = edgeEnds(wall);
    const m = edgeMid(edge);
    const span = Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? (m.x - a.x) / (b.x - a.x) : (m.y - a.y) / (b.y - a.y);
    const near = pieces.filter((e) => e.t0 - 1e-3 <= span && span <= e.t1 + 1e-3);
    const pick = near.find((e) => usable(e.key)) ?? pieces.find((e) => usable(e.key)) ?? near[0] ?? pieces[0]!;
    if (!out[pick.key]) out[pick.key] = kind;
  }
  return out;
}

/** 벽이 바뀌어도 어긋나지 않게 맞춘다 */
export function normalize(plan: Plan): Plan {
  const walls = [...new Set(plan.walls)].filter((k) => edgeInGrid(plan, k)).sort();
  const layout = analyze({ ...plan, walls, openings: {} });
  const openings = placeOpenings(plan.openings, layout);
  const draft: Plan = { ...plan, walls, openings };

  // 표지 — 칸마다 하나만 남기고, 칸이 아닌 네모의 표지는 지운다
  const tags: Plan['tags'] = {};
  for (const cell of layout.cells) {
    for (const s of cell.squares) {
      const tag = tagFor(plan.tags, s);
      if (tag) {
        tags[s.key] = tag;
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
      if (!cellIdAt(layout, at)) marks.meet = at;
    } else if (cellIdAt(layout, at)) {
      // 비스듬한 벽이 지나가도 표시가 벽에 걸리지 않게 조각 가운데로 옮긴다
      marks[id] = pieceCenter(pieceKeyAt(layout, at));
    }
  }

  const items = itemsInside(draft, layout);
  const clean: Plan = { ...draft, tags, marks, openings, ...(items ? { items } : {}) };
  const fresh = analyze(clean);
  return {
    ...clean,
    route: trimRoute(clean, fresh, plan.route),
    route2: trimRoute(clean, fresh, plan.route2),
  };
}

/** 내 자리에서 시작해 문으로 이어진 데까지만 남긴다 */
export function trimRoute(plan: Plan, layout: Layout, route: string[]): string[] {
  const me = plan.marks.me;
  if (!me || route.length === 0) return [];
  const startCell = cellIdAt(layout, me);
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
  for (let i = 1; i < dots.length; i++) add.push(...segmentEdges(dots[i - 1]!, dots[i]!));
  return normalize({ ...plan, walls: [...plan.walls, ...add] });
}

export function addEdges(plan: Plan, edges: string[]): Plan {
  return normalize({ ...plan, walls: [...plan.walls, ...edges] });
}

export function removeWall(plan: Plan, edge: string): Plan {
  const wall = wallOf(edge);
  return normalize({ ...plan, walls: plan.walls.filter((k) => k !== wall) });
}

/** 칠하기. 같은 크레용으로 다시 누르면 지운다 */
export function paintCell(plan: Plan, layout: Layout, cellId: string, tag: CellTag): Plan {
  const cell = layout.byId.get(cellId);
  if (!cell) return plan;
  const tags = { ...plan.tags };
  const same = cell.kind === tag.kind && cell.name === tag.name;
  for (const s of cell.squares) {
    delete tags[s.key];
    delete tags[sqKey(s.x, s.y)];
  }
  if (!same) tags[cell.id] = tag;
  return normalize({ ...plan, tags });
}

export type OpeningResult = { plan: Plan; ok: true } | { plan: Plan; ok: false; why: 'no-wall' | 'window-inside' };

/** 문·창 달기. 같은 것을 다시 누르면 뗀다 */
export function toggleOpening(plan: Plan, layout: Layout, edge: string, kind: OpeningKind): OpeningResult {
  if (!layout.edges.has(edge)) return { plan, ok: false, why: 'no-wall' };
  if (kind === 'window' && !isExterior(layout, edge)) return { plan, ok: false, why: 'window-inside' };
  const openings = { ...plan.openings };
  if (openings[edge] === kind) delete openings[edge];
  else openings[edge] = kind;
  return { plan: normalize({ ...plan, openings }), ok: true };
}

export type MarkResult = { plan: Plan; ok: true } | { plan: Plan; ok: false; why: 'need-inside' | 'need-outside' };

/** 표시 놓기. 같은 자리를 다시 누르면 치운다 */
export function placeMark(plan: Plan, layout: Layout, id: MarkId, at: Pt): MarkResult {
  const key = pieceKeyAt(layout, at);
  const inside = layout.cellAt.has(key);
  if (id === 'meet') {
    if (inside) return { plan, ok: false, why: 'need-outside' };
    return { plan: normalize({ ...plan, marks: { ...plan.marks, meet: at } }), ok: true };
  }
  if (!inside) return { plan, ok: false, why: 'need-inside' };
  const placed = pieceCenter(key);
  const marks = { ...plan.marks };
  const old = marks[id];
  if (old && old.x === placed.x && old.y === placed.y) delete marks[id];
  else {
    // 한 조각에 표시 하나만 — 눌렀을 때 무엇을 고른 것인지 헷갈리지 않게 한다
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
 * 나가는 길에 칸을 더한다. `target` 은 조각 열쇠 또는 `out`.
 * 이미 지나온 칸을 누르면 거기까지 되돌아간다.
 */
export function tapRoute(plan: Plan, layout: Layout, which: 'route' | 'route2', target: string): RouteTap {
  const me = plan.marks.me;
  if (!me) return { plan, result: 'no-start' };
  const startKey = pieceKeyAt(layout, me);
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
  const startKey = pieceKeyAt(layout, me);
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
