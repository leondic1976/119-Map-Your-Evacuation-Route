/**
 * 대피 연습 — 움직일 때마다 한 차례 진행한다. 줄어드는 시계가 없다.
 * 진 판 없이 연습으로 끝나고, 점수를 만들지 않는다.
 */
import { routeCells } from './edit';
import { analyze, cellIdAt, reachableFrom, shortestPath } from './grid';
import { stepField, type Field, type FieldEdge, type FieldParams } from './hazard';
import { hopPoints } from './path';
import { OUT, type ItemKind, type Layout, type Plan, type Pt } from './types';

export interface DrillLevels {
  /** 이 값부터 옅은 위험 — 몸을 낮춘다 */
  light: number;
  /** 이 값부터 문이 뜨겁다 — 지나가지 않는다 */
  hot: number;
  /** 이 값부터 칸이 막힌다 */
  blocked: number;
}

export interface DrillConfig {
  params: FieldParams;
  levels: DrillLevels;
  /** 위험이 시작되는 칸의 처음 값. 작게 시작해 차례마다 자란다 */
  start: number;
  /** 칸 이름(없으면 종류)마다 위험이 시작될 무게. 0 이면 다른 칸이 없을 때만 고른다. `*` 는 그 밖의 칸이다 */
  ignite: Record<string, number>;
  /** 조심할 곳 표시가 있는 칸에 더하는 무게 */
  igniteMark: number;
  /** 이 가구가 있으면 그 자리에서 시작한다 */
  sparks: ItemKind[];
}

export type DrillEnd = 'meet' | 'rescue';

export interface DrillStats {
  moves: number;
  crouchedInHazard: number;
  stoodInHazard: number;
  doorsChecked: number;
  hotAvoided: number;
  doorsClosed: number;
  doorsPassed: number;
  called: boolean;
  followedRoute: boolean;
}

export interface Snapshot {
  turn: number;
  at: string;
  crouch: boolean;
  field: Field;
  closed: string[];
  /** 이번 차례에 걸어간 점들 (이전 자리에서 지금 자리까지) */
  walk: Pt[];
}

export interface DrillState {
  turn: number;
  at: string;
  pt: Pt;
  crouch: boolean;
  field: Field;
  closed: string[];
  checked: string[];
  /** 만져 보고 뜨거웠던 문 */
  knownHot: string[];
  source: string;
  /** 위험이 시작된 자리. 여기서부터 퍼져 보인다 */
  origin: Pt;
  grace: number;
  phase: 'inside' | 'outside' | 'over';
  end: DrillEnd | null;
  stats: DrillStats;
  /** 지나온 칸 나열 */
  visited: string[];
  /** 방금 지나온 문 — 닫을 수 있다 */
  lastDoor: string | null;
  timeline: Snapshot[];
}

export function fieldEdges(layout: Layout, closed: string[]): FieldEdge[] {
  const set = new Set(closed);
  const out: FieldEdge[] = [];
  // 트인 곳은 닫을 수 없고, 같은 두 칸 사이에 여러 토막이 트여 있어도 한 번만 번진다
  const openPairs = new Set<string>();
  for (const l of layout.links) {
    if (l.b === OUT) continue;
    if (l.open) {
      const pair = l.a < l.b ? `${l.a}|${l.b}` : `${l.b}|${l.a}`;
      if (openPairs.has(pair)) continue;
      openPairs.add(pair);
      out.push({ a: l.a, b: l.b, closed: false });
    } else out.push({ a: l.a, b: l.b, closed: set.has(l.edge) });
  }
  return out;
}

/** 난수 — 같은 시드면 같은 판이다 */
export function seeded(seed: number): () => number {
  // 시드를 먼저 섞는다. 작은 시드를 그대로 쓰면 첫 값이 늘 0 에 가까워 같은 칸만 고르게 된다
  let s = Math.imul((seed >>> 0) + 0x9e3779b9, 2654435761) >>> 0 || 1;
  const next = (): number => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  next();
  next();
  return next;
}

function startField(source: string, soft: boolean, config: DrillConfig): Field {
  // 칸이 하나뿐이거나 나가는 길 위에서만 불이 날 수 있으면 옅은 연기로 시작해야 나갈 시간이 있다
  return { [source]: soft ? config.levels.light : config.start };
}

/** 가장 짧은 길로 가면 나갈 수 있는 판인가 */
export function canEscape(
  layout: Layout,
  start: string,
  source: string,
  grace: number,
  config: DrillConfig,
  soft = false,
): boolean {
  const path = shortestPath(layout, start);
  if (!path) return false;
  let field = startField(source, soft || layout.cells.length === 1, config);
  const edges = fieldEdges(layout, []);
  let turn = 0;
  for (const hop of path) {
    if (hop.to !== OUT && (field[hop.to] ?? 0) >= config.levels.hot) return false;
    turn += 1;
    if (turn > grace) field = stepField(field, edges, [source], config.params);
    // 움직이면 위험도 함께 번진다. 도착했을 때 칸이 막혀 있으면 나갈 수 없다
    if (hop.to !== OUT && (field[hop.to] ?? 0) >= config.levels.blocked) return false;
  }
  return true;
}

/** 불이 시작될 칸을 고른다 — 내 자리가 아니고, 나갈 수 있는 칸만 */
export function pickSource(
  plan: Plan,
  layout: Layout,
  start: string,
  seed: number,
  config: DrillConfig,
): { source: string; grace: number; soft?: boolean } {
  const random = seeded(seed + 1);
  const others = layout.cells.map((c) => c.id).filter((id) => id !== start);
  if (others.length === 0) return { source: start, grace: 0 };

  // 칸마다 무게가 다르다. 조심할 곳 표시가 있는 칸은 더 자주 고르고, 무게가 0 인 칸은 다른 칸이 없을 때만 고른다
  const gas = plan.marks.gas;
  const gasCell = gas ? cellIdAt(layout, gas) : undefined;
  const weight = (id: string): number => {
    const cell = layout.byId.get(id);
    const key = cell?.name ?? cell?.kind ?? '';
    return (config.ignite[key] ?? config.ignite['*'] ?? 1) + (id === gasCell ? config.igniteMark : 0);
  };
  const pick = (ids: string[]): string => {
    const total = ids.reduce((sum, id) => sum + weight(id), 0);
    if (total <= 0) return ids[Math.floor(random() * ids.length)]!;
    let r = random() * total;
    for (const id of ids) {
      r -= weight(id);
      if (r < 0) return id;
    }
    return ids[ids.length - 1]!;
  };
  // 칸마다 나갈 수 있게 되는 가장 짧은 뜸(불이 번지기 전의 차례 수)을 잰다. 뜸을 주면 나갈 수 있는 칸은 모두 후보다 —
  // 뜸이 0 인 칸만 고르면 불이 늘 같은 두어 칸에서만 난다
  const graceFor = (id: string, soft: boolean): number | null => {
    for (let grace = 0; grace <= 12; grace++) if (canEscape(layout, start, id, grace, config, soft)) return grace;
    return null;
  };
  for (const soft of [false, true]) {
    // 둘째 바퀴 — 일렬로 이어진 집처럼 그래도 나갈 수 없으면 더 옅은 연기로 시작해 몸을 낮추고 지나가게 한다
    const grace = new Map<string, number>();
    for (const id of others) {
      const g = graceFor(id, soft);
      if (g !== null) grace.set(id, g);
    }
    if (grace.size === 0) continue;
    const source = pick([...grace.keys()]);
    return soft ? { source, grace: grace.get(source)!, soft: true } : { source, grace: grace.get(source)! };
  }
  // 밖으로 이어지지 않는 지도라도 시작은 시킨다
  return { source: others[0]!, grace: 0 };
}

/** 위험이 시작되는 자리 — 조심할 곳 표시, 그런 가구, 없으면 칸 안의 아무 자리다 */
export function originIn(plan: Plan, layout: Layout, source: string, seed: number, config: DrillConfig): Pt {
  const random = seeded(seed + 7);
  const gas = plan.marks.gas;
  if (gas && cellIdAt(layout, gas) === source) return gas;
  const things = (plan.items ?? []).filter((item) => config.sparks.includes(item.kind) && cellIdAt(layout, item) === source);
  if (things.length) {
    const thing = things[Math.floor(random() * things.length)]!;
    return { x: thing.x, y: thing.y };
  }
  const cell = layout.byId.get(source);
  if (!cell) return { x: 0, y: 0 };
  const roomy = cell.squares.filter((s) => s.area >= 0.5);
  const list = roomy.length ? roomy : cell.squares;
  return list[Math.floor(random() * list.length)]!.center;
}

export function startDrill(plan: Plan, seed: number, config: DrillConfig): DrillState | null {
  const layout = analyze(plan);
  const me = plan.marks.me;
  if (!me) return null;
  const at = cellIdAt(layout, me);
  if (!at) return null;
  const { source, grace, soft } = pickSource(plan, layout, at, seed, config);
  const field = startField(source, Boolean(soft) || layout.cells.length === 1, config);
  const first: Snapshot = { turn: 0, at, crouch: false, field, closed: [], walk: [me] };
  return {
    turn: 0,
    at,
    pt: me,
    crouch: false,
    field,
    closed: [],
    checked: [],
    knownHot: [],
    source,
    origin: originIn(plan, layout, source, seed, config),
    grace,
    phase: 'inside',
    end: null,
    stats: {
      moves: 0,
      crouchedInHazard: 0,
      stoodInHazard: 0,
      doorsChecked: 0,
      hotAvoided: 0,
      doorsClosed: 0,
      doorsPassed: 0,
      called: false,
      followedRoute: false,
    },
    visited: [at],
    lastDoor: null,
    timeline: [first],
  };
}

export interface DrillMove {
  to: string;
  edge: string;
  /** 문 건너편이 뜨겁다 */
  hot: boolean;
  /** 문짝이 없는 트인 곳이다. 만져 볼 문도, 닫을 문도 없다 */
  open?: boolean;
}

/** 지금 칸에서 갈 수 있는 곳 전부 */
export function drillMoves(layout: Layout, state: DrillState, config: DrillConfig): DrillMove[] {
  if (state.phase !== 'inside') return [];
  return reachableFrom(layout, state.at).map((n) => ({
    to: n.to,
    edge: n.edge,
    hot: n.to !== OUT && (state.field[n.to] ?? 0) >= config.levels.hot,
    ...(n.open ? { open: true } : {}),
  }));
}

/** 나갈 수 있는 문이 남았는가 */
export function hasOpenWay(layout: Layout, state: DrillState, config: DrillConfig): boolean {
  return drillMoves(layout, state, config).some((m) => !m.hot);
}

export function isTrapped(layout: Layout, state: DrillState, config: DrillConfig): boolean {
  if (state.phase !== 'inside') return false;
  if ((state.field[state.at] ?? 0) >= config.levels.blocked) return true;
  return !hasOpenWay(layout, state, config);
}

function advance(state: DrillState, layout: Layout, config: DrillConfig): Field {
  const nextTurn = state.turn + 1;
  if (nextTurn <= state.grace) return state.field;
  return stepField(state.field, fieldEdges(layout, state.closed), [state.source], config.params);
}

/** 문을 지나 옮긴다 */
export function moveTo(
  plan: Plan,
  layout: Layout,
  state: DrillState,
  move: DrillMove,
  config: DrillConfig,
): DrillState {
  const hop = hopPoints(plan, layout, state.at, state.pt, move.to, move.edge);
  const field = advance(state, layout, config);
  const pt = hop[hop.length - 1] ?? state.pt;
  const closed = state.closed.filter((e) => e !== move.edge);
  const level = move.to === OUT ? 0 : (field[move.to] ?? 0);
  const inHazard = level >= config.levels.light;
  // 연기 안내는 연기에 들어간 뒤에 나온다. 안내를 들은 뒤에도 서서 움직였을 때만 서 있었다고 센다
  const wasInHazard = (state.field[state.at] ?? 0) >= config.levels.light;
  const stats: DrillStats = {
    ...state.stats,
    moves: state.stats.moves + 1,
    doorsPassed: state.stats.doorsPassed + 1,
    crouchedInHazard: state.stats.crouchedInHazard + ((inHazard || wasInHazard) && state.crouch ? 1 : 0),
    stoodInHazard: state.stats.stoodInHazard + (wasInHazard && !state.crouch ? 1 : 0),
  };
  const visited = [...state.visited, move.to];
  const walk = [state.pt, ...hop];
  const snapshot: Snapshot = {
    turn: state.turn + 1,
    at: move.to,
    crouch: state.crouch,
    field,
    closed,
    walk,
  };
  return {
    ...state,
    turn: state.turn + 1,
    at: move.to,
    pt,
    field,
    closed,
    stats,
    visited,
    lastDoor: move.to === OUT || move.open ? null : move.edge,
    phase: move.to === OUT ? 'outside' : 'inside',
    timeline: [...state.timeline, snapshot],
  };
}

/** 몸을 낮추거나 일으킨다. 연기 속에서 낮추면 잘한 일로 센다 */
export function setCrouch(state: DrillState, crouch: boolean, config?: DrillConfig): DrillState {
  const counts = crouch && !state.crouch && config && (state.field[state.at] ?? 0) >= config.levels.light;
  return { ...state, crouch, stats: counts ? { ...state.stats, crouchedInHazard: state.stats.crouchedInHazard + 1 } : state.stats };
}

/** 문을 만져 본다. 뜨거우면 기억한다 */
export function touchDoor(state: DrillState, move: DrillMove): DrillState {
  const stats = {
    ...state.stats,
    doorsChecked: state.stats.doorsChecked + 1,
    hotAvoided: state.stats.hotAvoided + (move.hot ? 1 : 0),
  };
  return {
    ...state,
    stats,
    checked: state.checked.includes(move.edge) ? state.checked : [...state.checked, move.edge],
    knownHot: move.hot && !state.knownHot.includes(move.edge) ? [...state.knownHot, move.edge] : state.knownHot,
  };
}

/** 방금 지나온 문을 닫는다 */
export function closeLastDoor(state: DrillState): DrillState {
  if (!state.lastDoor) return state;
  const closed = state.closed.includes(state.lastDoor) ? state.closed : [...state.closed, state.lastDoor];
  const last = state.timeline[state.timeline.length - 1]!;
  return {
    ...state,
    closed,
    lastDoor: null,
    stats: { ...state.stats, doorsClosed: state.stats.doorsClosed + 1 },
    timeline: [...state.timeline.slice(0, -1), { ...last, closed }],
  };
}

/** 칸이 막혀 나갈 수 없을 때 — 문을 닫고 구조를 요청한다 */
export function finishRescue(state: DrillState): DrillState {
  return { ...state, phase: 'over', end: 'rescue', stats: { ...state.stats, called: true } };
}

/** 만나는 곳에 닿고 119 까지 전화했다 */
export function finishMeet(plan: Plan, layout: Layout, state: DrillState): DrillState {
  const meet = plan.marks.meet;
  const timeline = meet
    ? [
        ...state.timeline,
        {
          turn: state.turn + 1,
          at: OUT,
          crouch: false,
          field: state.field,
          closed: state.closed,
          walk: [state.pt, meet],
        },
      ]
    : state.timeline;
  const routeIds = routeCells(layout, plan.route);
  const followed = routeIds.length > 1 && routeIds.join('|') === state.visited.join('|');
  return {
    ...state,
    pt: meet ?? state.pt,
    phase: 'over',
    end: 'meet',
    timeline,
    stats: { ...state.stats, called: true, followedRoute: followed },
  };
}
