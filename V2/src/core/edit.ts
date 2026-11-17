/**
 * 지도 고치기. 어떤 조작이든 끝에 `normalize` 를 거쳐 앞뒤가 맞는 지도만 남긴다.
 * 모든 함수는 새 지도를 돌려주고 받은 지도를 바꾸지 않는다.
 */
import { analyze, cellIdAt, edgeEnds, edgeInGrid, edgeMid, hKey, isExterior, isInterior, isSlanted, parseEdge, pieceCenter, pieceKeyAt, reachableFrom, segmentEdges, sqKey, tagFor, vKey, wallOf } from './grid';
import { DOOR_SIZES, nextDoorSize } from './doors';
import { itemsInside } from './items';
import { extinguishers, MAX_EXTINGUISHERS } from './marks';
import { routeCursor, squareStep, type ArrowDir } from './path';
import { OUT, type CellTag, type Layout, type MarkId, type OpeningKind, type Plan, type Pt } from './types';

export function emptyPlan(cols: number, rows: number, density = 1): Plan {
  return { cols: cols * density, rows: rows * density, ...(density > 1 ? { density } : {}), walls: [], openings: {}, tags: {}, marks: {}, route: [], route2: [] };
}

/**
 * 문과 창을 벽 토막에 맞춘다. 다른 벽이 엇갈려 토막이 바뀌어도 있던 자리에 남는다.
 * 그 자리가 꼬리 토막이면 쓸 수 있는 옆 토막으로 옮긴다.
 */
function placeOpenings(openings: Plan['openings'], layout: Layout): { openings: Plan['openings']; moved: Map<string, string> } {
  const out: Plan['openings'] = {};
  // 있던 열쇠 → 옮겨 간 열쇠. 문짝 방향이 문을 따라가게 한다
  const moved = new Map<string, string>();
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
    if (!out[pick.key]) {
      out[pick.key] = kind;
      moved.set(edge, pick.key);
    }
  }
  return { openings: out, moved };
}

const dotKey = (p: Pt): string => `${p.x},${p.y}`;

/** 점마다 닿아 있는 벽 조각 수 */
function wallsAtDots(walls: Iterable<string>): Map<string, number> {
  const count = new Map<string, number>();
  for (const wall of walls) for (const p of edgeEnds(wall)) count.set(dotKey(p), (count.get(dotKey(p)) ?? 0) + 1);
  return count;
}

/**
 * 틈은 벽 줄이 끊긴 자리다. 양 끝이 다른 벽에 닿아 있어야 틈이고, 옆 벽이 지워져 허공에 남은 틈은 함께 지운다.
 */
function tidyGaps(walls: string[], openings: Plan['openings']): { walls: string[]; openings: Plan['openings'] } {
  let list = walls;
  const kept = { ...openings };
  for (;;) {
    const at = wallsAtDots(list);
    const loose = list.filter((wall) => kept[wall] === 'gap' && edgeEnds(wall).some((p) => (at.get(dotKey(p)) ?? 0) < 2));
    if (loose.length === 0) break;
    for (const wall of loose) delete kept[wall];
    list = list.filter((wall) => !loose.includes(wall));
  }
  return { walls: list, openings: kept };
}

/** 벽이 바뀌어도 어긋나지 않게 맞춘다 */
export function normalize(input: Plan): Plan {
  // 문짝 방향과 소화기는 아래에서 맞는 것만 다시 붙인다
  const { doorTurns: turned, doorSizes: sized, extraExtinguishers: spare, noExtinguisher: none, ...plan } = input;
  const tidy = tidyGaps([...new Set(plan.walls)].filter((k) => edgeInGrid(plan, k)).sort(), plan.openings);
  const walls = tidy.walls;
  const layout = analyze({ ...plan, walls, openings: {} });
  const { openings, moved } = placeOpenings(tidy.openings, layout);
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

  // 소화기 — 칸 안의 것만 남기고, 다른 표시나 서로와 한 조각에 겹치지 않게 한다. 첫째가 없으면 다음 것이 첫째가 된다
  const taken = new Set((Object.entries(marks) as [MarkId, Pt][]).filter(([id]) => id !== 'meet').map(([, m]) => dotKey(m)));
  const extras: Pt[] = [];
  for (const at of spare ?? []) {
    if (!cellIdAt(layout, at)) continue;
    const center = pieceCenter(pieceKeyAt(layout, at));
    if (taken.has(dotKey(center))) continue;
    taken.add(dotKey(center));
    extras.push(center);
  }
  if (!marks.extinguisher && extras.length > 0) marks.extinguisher = extras.shift();
  const more = extras.slice(0, MAX_EXTINGUISHERS - 1);

  // 문짝 방향 — 문이 남아 있는 토막의 것만 남긴다
  const doorTurns: Record<string, number> = {};
  for (const [edge, turn] of Object.entries(turned ?? {})) {
    const key = moved.get(edge) ?? edge;
    if (openings[key] === 'door' && Number.isInteger(turn) && turn >= 1 && turn <= 3) doorTurns[key] = turn;
  }
  // 문 크기도 문을 따라간다
  const doorSizes: Record<string, number> = {};
  for (const [edge, size] of Object.entries(sized ?? {})) {
    const key = moved.get(edge) ?? edge;
    if (openings[key] === 'door' && size !== 1 && (DOOR_SIZES as readonly number[]).includes(size)) doorSizes[key] = size;
  }

  const items = itemsInside(draft, layout);
  const clean: Plan = {
    ...draft,
    tags,
    marks,
    openings,
    ...(items ? { items } : {}),
    ...(Object.keys(doorTurns).length > 0 ? { doorTurns } : {}),
    ...(Object.keys(doorSizes).length > 0 ? { doorSizes } : {}),
    ...(more.length > 0 ? { extraExtinguishers: more } : {}),
    ...(none === true && !marks.extinguisher ? { noExtinguisher: true } : {}),
  };
  const fresh = analyze(clean);
  return {
    ...clean,
    route: trimRoute(clean, fresh, plan.route),
    route2: trimRoute(clean, fresh, plan.route2),
  };
}

/** 내 자리에서 시작해 문이나 트인 곳으로 이어진 데까지만 남긴다. 한 칸 안에서는 조각을 따라 자유롭게 간다 */
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
    } else if (id === at) {
      if (step === out[out.length - 1]) continue;
    } else if (!reachableFrom(layout, at).some((n) => n.to === id)) {
      break;
    }
    out.push(step);
    if (id === OUT) break;
    at = id;
  }
  return out;
}

/** 길이 지나는 칸의 나열. 한 칸 안에서 여러 조각을 지나도 한 번만 센다 */
export function routeCells(layout: Layout, route: string[]): string[] {
  const out: string[] = [];
  for (const step of route) {
    const id = step === OUT ? OUT : layout.cellAt.get(step);
    if (id && out[out.length - 1] !== id) out.push(id);
  }
  return out;
}

/** 틈으로 볼 만한 길이(점 칸 수) — 처음 네모 한 칸이다 */
const gapLimit = (plan: Plan): number => Math.max(1, Math.round(plan.density ?? 1));

const unitEdge = (o: 'h' | 'v', x: number, y: number): string => (o === 'h' ? hKey(x, y) : vKey(x, y));

/**
 * 벽을 그리다 만 틈을 문 없는 입구로 만든다. 한쪽 끝이 떠 있는 가로세로 벽이 곧게 한 칸만 더 가면
 * 다른 벽에 닿을 때, 그 사이를 틈으로 잇는다. 테두리에 입구를 남기고 그려도 집이 닫힌다.
 */
function closeGaps(plan: Plan): Plan {
  const have = new Set(plan.walls);
  const at = wallsAtDots(have);
  const limit = gapLimit(plan);
  const add: string[] = [];
  for (const wall of plan.walls) {
    if (isSlanted(wall) || plan.openings[wall] === 'gap') continue;
    const { o, x, y } = parseEdge(wall);
    const axis = o as 'h' | 'v';
    const [a, b] = edgeEnds(wall);
    for (const [end, dir] of [[a, -1], [b, 1]] as [Pt, number][]) {
      // 다른 벽에 닿지 않은 끝에서만 뻗는다
      if ((at.get(dotKey(end)) ?? 0) !== 1) continue;
      const fill: string[] = [];
      for (let n = 1; n <= limit; n++) {
        const sx = axis === 'h' ? x + dir * n : x;
        const sy = axis === 'v' ? y + dir * n : y;
        const edge = unitEdge(axis, sx, sy);
        if (!edgeInGrid(plan, edge) || have.has(edge)) break;
        fill.push(edge);
        const [p, q] = edgeEnds(edge);
        const far = dir > 0 ? q : p;
        if ((at.get(dotKey(far)) ?? 0) > 0) {
          add.push(...fill);
          break;
        }
      }
    }
  }
  if (add.length === 0) return plan;
  const openings = { ...plan.openings };
  for (const edge of add) openings[edge] = 'gap';
  return { ...plan, walls: [...new Set([...plan.walls, ...add])], openings };
}

/** 점을 잇는 획을 벽으로 더한다. 틈 위에 그으면 틈이 벽으로 메워진다 */
export function addStroke(plan: Plan, dots: Pt[]): Plan {
  const add: string[] = [];
  for (let i = 1; i < dots.length; i++) add.push(...segmentEdges(dots[i - 1]!, dots[i]!));
  const openings = { ...plan.openings };
  for (const edge of add) if (openings[edge] === 'gap') delete openings[edge];
  return normalize(closeGaps({ ...plan, walls: [...new Set([...plan.walls, ...add])], openings }));
}

/**
 * 지우개 — 벽 한 토막을 지운다. 긴 벽의 가운데를 한 칸만 지우면 벽이 아니라 문 없는 입구(틈)가 된다.
 * 이어서 옆 토막까지 지우면 틈도 함께 사라져 두 칸이 합쳐진다. 틈을 다시 지우면 그냥 없어진다.
 */
export function eraseWall(plan: Plan, edge: string): Plan {
  const wall = wallOf(edge);
  if (isSlanted(wall) || plan.openings[wall] === 'gap' || !plan.walls.includes(wall)) return removeWall(plan, edge);
  const { o, x, y } = parseEdge(wall);
  const axis = o as 'h' | 'v';
  const along = (n: number): string => unitEdge(axis, axis === 'h' ? x + n : x, axis === 'v' ? y + n : y);
  const have = new Set(plan.walls);
  const isGap = (k: string): boolean => have.has(k) && plan.openings[k] === 'gap';
  const isSolid = (k: string): boolean => have.has(k) && plan.openings[k] !== 'gap';
  let lo = 0;
  let hi = 0;
  while (isGap(along(lo - 1))) lo -= 1;
  while (isGap(along(hi + 1))) hi += 1;
  const run = Array.from({ length: hi - lo + 1 }, (_, i) => along(lo + i));
  const others = new Set(plan.walls.filter((k) => !run.includes(k)));
  const at = wallsAtDots(others);
  const first = edgeEnds(run[0]!)[0];
  const last = edgeEnds(run[run.length - 1]!)[1];
  const bounded = (at.get(dotKey(first)) ?? 0) > 0 && (at.get(dotKey(last)) ?? 0) > 0;
  const inLine = isSolid(along(lo - 1)) || isSolid(along(hi + 1));
  if (run.length <= gapLimit(plan) && bounded && inLine) {
    const openings = { ...plan.openings };
    for (const k of run) openings[k] = 'gap';
    return normalize({ ...plan, openings });
  }
  // 틈으로 보기에는 길다 — 벽도 옆의 틈도 지운다
  const openings = { ...plan.openings };
  for (const k of run) delete openings[k];
  return normalize({ ...plan, walls: plan.walls.filter((k) => !run.includes(k)), openings });
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

/**
 * 문짝 방향 바꾸기(대장 #168). 누를 때마다 반대쪽 → 경첩도 반대 → 처음 쪽에 경첩만 반대 → 처음으로 돈다.
 * 문이 아니면 그대로 둔다.
 */
export function turnDoor(plan: Plan, edge: string): Plan {
  if (plan.openings[edge] !== 'door') return plan;
  const doorTurns = { ...(plan.doorTurns ?? {}) };
  const next = ((doorTurns[edge] ?? 0) + 1) % 4;
  if (next) doorTurns[edge] = next;
  else delete doorTurns[edge];
  return normalize({ ...plan, doorTurns });
}

/** 문 크기 바꾸기(대장 #170). 더 커지거나 작아지지 않으면 그대로 둔다 */
export function resizeDoor(plan: Plan, layout: Layout, edge: string, dir: 1 | -1): Plan {
  if (plan.openings[edge] !== 'door') return plan;
  const next = nextDoorSize(plan, layout, edge, dir);
  if (next === null) return plan;
  return normalize({ ...plan, doorSizes: { ...(plan.doorSizes ?? {}), [edge]: next } });
}

export type MarkResult = { plan: Plan; ok: true } | { plan: Plan; ok: false; why: 'need-inside' | 'need-outside' | 'full' };

const samePt = (a: Pt, b: Pt): boolean => a.x === b.x && a.y === b.y;

/** 소화기 자리들을 지도에 적는다. 하나라도 놓이면 「우리 집에 없어」는 풀린다 */
function withExtinguishers(plan: Plan, marks: Plan['marks'], list: Pt[]): Plan {
  const next = { ...marks };
  if (list[0]) next.extinguisher = list[0];
  else delete next.extinguisher;
  return normalize({ ...plan, marks: next, extraExtinguishers: list.slice(1), noExtinguisher: list.length > 0 ? false : plan.noExtinguisher });
}

/** 그 자리에 있던 다른 표시를 치운다 — 한 조각에 표시 하나만 둔다 */
function clearSpot(marks: Plan['marks'], at: Pt, keep: MarkId): Plan['marks'] {
  const out = { ...marks };
  for (const other of Object.keys(out) as MarkId[]) {
    const m = out[other];
    if (other !== 'meet' && other !== keep && m && samePt(m, at)) delete out[other];
  }
  return out;
}

/** 소화기를 하나 더 놓는다(대장 #169). 이미 소화기가 있는 자리면 그대로 둔다 */
export function addExtinguisher(plan: Plan, layout: Layout, at: Pt): MarkResult {
  const key = pieceKeyAt(layout, at);
  if (!layout.cellAt.has(key)) return { plan, ok: false, why: 'need-inside' };
  const placed = pieceCenter(key);
  const all = extinguishers(plan);
  if (all.some((e) => samePt(e, placed))) return { plan, ok: true };
  if (all.length >= MAX_EXTINGUISHERS) return { plan, ok: false, why: 'full' };
  return { plan: withExtinguishers(plan, clearSpot(plan.marks, placed, 'extinguisher'), [...all, placed]), ok: true };
}

/** 「우리 집에 소화기가 없어」 — 놓았던 소화기를 치우고 없다고 적는다. 다시 누르면 푼다 */
export function setNoExtinguisher(plan: Plan, on: boolean): Plan {
  if (!on) return normalize({ ...plan, noExtinguisher: false });
  const marks = { ...plan.marks };
  delete marks.extinguisher;
  return normalize({ ...plan, marks, extraExtinguishers: [], noExtinguisher: true });
}

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
  if (id === 'extinguisher') {
    // 놓인 소화기를 누르면 그것을 치우고, 빈 자리를 누르면 마지막에 놓은 것을 옮긴다. 더 놓는 일은 `addExtinguisher` 가 한다
    const all = extinguishers(plan);
    const hit = all.findIndex((e) => samePt(e, placed));
    if (hit >= 0) return { plan: withExtinguishers(plan, plan.marks, all.filter((_, i) => i !== hit)), ok: true };
    return { plan: withExtinguishers(plan, clearSpot(plan.marks, placed, 'extinguisher'), [...all.slice(0, -1), placed]), ok: true };
  }
  let marks = { ...plan.marks };
  const old = marks[id];
  if (old && samePt(old, placed)) delete marks[id];
  else {
    // 한 조각에 표시 하나만 — 눌렀을 때 무엇을 고른 것인지 헷갈리지 않게 한다
    marks = clearSpot(marks, placed, id);
    marks[id] = placed;
  }
  // 그 자리에 둘째부터의 소화기가 있었으면 함께 치운다. 첫째를 치웠으면 다음 것이 첫째가 된다
  const extraExtinguishers = (plan.extraExtinguishers ?? []).filter((e) => !samePt(e, placed));
  const next: Plan = { ...plan, marks, extraExtinguishers };
  // 내 자리가 옮겨지면 시작이 달라지므로 길을 다시 고른다
  if (id === 'me') {
    next.route = [];
    next.route2 = [];
  }
  return { plan: normalize(next), ok: true };
}

export type RouteTap =
  | { plan: Plan; result: 'added' | 'done' | 'back' | 'start' | 'same' }
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

/**
 * 방향키로 길을 한 칸 긋는다(대장 #160). 누른 쪽으로 모눈 한 칸 가고, 벽에 막히면 `no-way` 다.
 * 지나온 자리로 돌아가면 거기까지 지워진다.
 */
export function arrowRoute(plan: Plan, layout: Layout, which: 'route' | 'route2', dir: ArrowDir): RouteTap {
  const me = plan.marks.me;
  if (!me) return { plan, result: 'no-start' };
  const startKey = pieceKeyAt(layout, me);
  if (!layout.cellAt.get(startKey)) return { plan, result: 'no-start' };
  const route = plan[which].length ? plan[which] : [startKey];
  const here = routeCursor(plan, layout, route);
  if (!here) return { plan, result: 'no-way' };
  const step = squareStep(plan, layout, here.piece, dir);
  if (step.kind === 'blocked') return { plan, result: 'no-way' };
  const seenAt = route.lastIndexOf(step.piece);
  if (seenAt >= 0) return { plan: { ...plan, [which]: route.slice(0, seenAt + 1) }, result: seenAt === 0 ? 'start' : 'back' };
  return { plan: { ...plan, [which]: [...route, step.piece] }, result: step.piece === OUT ? 'done' : 'added' };
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
