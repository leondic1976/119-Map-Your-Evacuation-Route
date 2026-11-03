/**
 * 대피 연습 — 움직일 때마다 한 차례 진행한다. 줄어드는 시계가 없다.
 * 진 판 없이 연습으로 끝나고, 점수를 만들지 않는다.
 */
import { analyze, cellIdAt, reachableFrom, shortestPath } from './grid';
import { stepField, type Field, type FieldEdge, type FieldParams } from './hazard';
import { hopPoints } from './path';
import { OUT, type Layout, type Plan, type Pt } from './types';

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
  return layout.links
    .filter((l) => l.b !== OUT)
    .map((l) => ({ a: l.a, b: l.b, closed: set.has(l.edge) }));
}

/** 난수 — 같은 시드면 같은 판이다 */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function startField(source: string, single: boolean, config: DrillConfig): Field {
  // 칸이 하나뿐이면 시작 때 값이 낮아야 나갈 시간이 있다
  return { [source]: single ? config.levels.light : config.params.max };
}

/** 가장 짧은 길로 가면 나갈 수 있는 판인가 */
export function canEscape(
  layout: Layout,
  start: string,
  source: string,
  grace: number,
  config: DrillConfig,
): boolean {
  const path = shortestPath(layout, start);
  if (!path) return false;
  let field = startField(source, layout.cells.length === 1, config);
  const edges = fieldEdges(layout, []);
  let turn = 0;
  for (const hop of path) {
    if (hop.to !== OUT && (field[hop.to] ?? 0) >= config.levels.hot) return false;
    turn += 1;
    if (turn > grace) field = stepField(field, edges, [source], config.params);
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
): { source: string; grace: number } {
  const random = seeded(seed + 1);
  const others = layout.cells.map((c) => c.id).filter((id) => id !== start);
  if (others.length === 0) return { source: start, grace: 0 };

  // 가스레인지가 있으면 그 칸을 자주 고른다
  const gas = plan.marks.gas;
  const gasCell = gas ? cellIdAt(layout, gas) : undefined;
  for (let grace = 0; grace <= 12; grace++) {
    const safe = others.filter((id) => canEscape(layout, start, id, grace, config));
    if (safe.length === 0) continue;
    if (gasCell && safe.includes(gasCell) && random() < 0.6) return { source: gasCell, grace };
    return { source: safe[Math.floor(random() * safe.length)]!, grace };
  }
  // 밖으로 이어지지 않는 지도라도 시작은 시킨다
  return { source: others[0]!, grace: 0 };
}

export function startDrill(plan: Plan, seed: number, config: DrillConfig): DrillState | null {
  const layout = analyze(plan);
  const me = plan.marks.me;
  if (!me) return null;
  const at = cellIdAt(layout, me);
  if (!at) return null;
  const { source, grace } = pickSource(plan, layout, at, seed, config);
  const field = startField(source, layout.cells.length === 1, config);
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
}

/** 지금 칸에서 갈 수 있는 곳 전부 */
export function drillMoves(layout: Layout, state: DrillState, config: DrillConfig): DrillMove[] {
  if (state.phase !== 'inside') return [];
  return reachableFrom(layout, state.at).map((n) => ({
    to: n.to,
    edge: n.edge,
    hot: n.to !== OUT && (state.field[n.to] ?? 0) >= config.levels.hot,
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
  const stats: DrillStats = {
    ...state.stats,
    moves: state.stats.moves + 1,
    doorsPassed: state.stats.doorsPassed + 1,
    crouchedInHazard: state.stats.crouchedInHazard + (inHazard && state.crouch ? 1 : 0),
    stoodInHazard: state.stats.stoodInHazard + (inHazard && !state.crouch ? 1 : 0),
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
    lastDoor: move.to === OUT ? null : move.edge,
    phase: move.to === OUT ? 'outside' : 'inside',
    timeline: [...state.timeline, snapshot],
  };
}

export function setCrouch(state: DrillState, crouch: boolean): DrillState {
  return { ...state, crouch };
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
  const routeIds = plan.route.map((s) => (s === OUT ? OUT : layout.cellAt.get(s)));
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
