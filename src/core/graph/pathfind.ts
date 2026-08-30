/**
 * 경로 탐색 — docs/DESIGN-v1.0.md §5.2.
 *
 * 목표 집합은 goalNodeIds() 하나만 참조한다. 여기서 다시 정의하지 않는다.
 */
import type { Cell, FloorPlan, OpeningBlock, ScenarioKey } from '../../types/plan';
import { isOpening } from '../../types/plan';
import type { GraphEdge, GraphNode, PlanGraph } from '../../types/graph';
import type { UserProfile } from '../../types/save';
import { goalNodeIds } from './build';
import { isAdjacent, lineCells, sameCell, sideBetween, step } from '../grid/geometry';

export interface EscapeResult {
  /** 노드 id 시퀀스 */
  path: string[];
  /** 셀 단위 경로. 에디터 표시와 길이 비교의 기준이다 */
  cells: Cell[];
  cost: number;
  /** 최후수단 설비를 썼는가 */
  usedConditional: boolean;
  goalNodeId?: string;
  found: boolean;
  /** conditional 엣지를 썼을 때 붙일 조건 설명 키 */
  conditionKeys: string[];
}

const NOT_FOUND: EscapeResult = {
  path: [],
  cells: [],
  cost: 0,
  usedConditional: false,
  found: false,
  conditionKeys: [],
};

/** 승강기 앞을 지나는 길은 되도록 피한다 — 화재·지진 규칙과 어긋나지 않게 */
const ELEVATOR_PENALTY = 50;

function avoidsElevator(key: ScenarioKey): boolean {
  return key === 'fire_exit_available' || key === 'fire_exit_blocked' || key === 'earthquake';
}

function contains(cells: Cell[] | undefined, c: Cell): boolean {
  return Boolean(cells?.some((x) => sameCell(x, c)));
}

function neighbourIn(cells: Cell[] | undefined, c: Cell): Cell | null {
  if (!cells) return null;
  return cells.find((x) => isAdjacent(x, c)) ?? null;
}

/** 엣지를 건널 때 어느 셀에서 나가 어느 셀로 들어서는가 */
function crossing(g: PlanGraph, e: GraphEdge, from: string): { exit: Cell | null; enter: Cell | null } {
  if (!e.anchorCell) return { exit: null, enter: null };
  const otherId = from === e.a ? e.b : e.a;
  const other = g.nodeById[otherId];
  const self = g.nodeById[from];
  if (from === e.a) {
    const exit = e.anchorCell;
    if (!other?.cells) return { exit, enter: null };
    if (contains(other.cells, exit)) return { exit, enter: exit };
    return { exit, enter: neighbourIn(other.cells, exit) };
  }
  const enter = e.anchorCell;
  if (!self?.cells) return { exit: null, enter };
  if (contains(self.cells, enter)) return { exit: enter, enter };
  return { exit: neighbourIn(self.cells, enter), enter };
}

export function findEscape(
  g: PlanGraph,
  startNodeId: string,
  key: ScenarioKey,
  profile: UserProfile,
  startCell?: Cell,
): EscapeResult {
  const goals = new Set(goalNodeIds(g, key, profile));
  if (!g.nodeById[startNodeId]) return NOT_FOUND;

  const strict = dijkstra(g, startNodeId, goals, key, false);
  if (strict.found) return materialise(g, strict, startNodeId, startCell, false);
  const loose = dijkstra(g, startNodeId, goals, key, true);
  if (loose.found) return materialise(g, loose, startNodeId, startCell, true);
  return NOT_FOUND;
}

interface Raw {
  found: boolean;
  nodes: string[];
  edges: GraphEdge[];
  cost: number;
  goalNodeId?: string;
}

function dijkstra(
  g: PlanGraph,
  start: string,
  goals: Set<string>,
  key: ScenarioKey,
  allowConditional: boolean,
): Raw {
  const dist: Record<string, number> = { [start]: 0 };
  const prev: Record<string, { node: string; edge: GraphEdge }> = {};
  const done = new Set<string>();
  const avoid = avoidsElevator(key);

  for (;;) {
    let cur: string | null = null;
    let best = Infinity;
    for (const id of Object.keys(dist)) {
      if (done.has(id)) continue;
      if (dist[id] < best) {
        best = dist[id];
        cur = id;
      }
    }
    if (!cur) break;
    done.add(cur);
    if (goals.has(cur)) {
      const t = trace(prev, start, cur);
      return { found: true, nodes: t.nodes, edges: t.edges, cost: dist[cur], goalNodeId: cur };
    }

    const node: GraphNode | undefined = g.nodeById[cur];
    // 가상 노드는 종점이다. 여기를 거쳐 다른 곳으로 가지 않는다
    if (node?.kind === 'virtual') continue;

    for (const e of g.adjacency[cur] ?? []) {
      const p = e.passability[key];
      if (p === 'blocked') continue;
      if (p === 'conditional' && !allowConditional) continue;
      const next: string = e.a === cur ? e.b : e.a;
      if (next === cur) continue;
      const penalty = avoid && g.nodeById[next]?.kind === 'elevator' ? ELEVATOR_PENALTY : 0;
      const nd = dist[cur] + e.cost + penalty + (p === 'conditional' ? 5 : 0);
      if (dist[next] === undefined || nd < dist[next]) {
        dist[next] = nd;
        prev[next] = { node: cur, edge: e };
      }
    }
  }
  return { found: false, nodes: [], edges: [], cost: 0 };
}

function trace(
  prev: Record<string, { node: string; edge: GraphEdge }>,
  start: string,
  goal: string,
): { nodes: string[]; edges: GraphEdge[] } {
  const nodes: string[] = [goal];
  const edges: GraphEdge[] = [];
  let cur = goal;
  while (cur !== start) {
    const p = prev[cur];
    if (!p) break;
    edges.unshift(p.edge);
    nodes.unshift(p.node);
    cur = p.node;
  }
  return { nodes, edges };
}

function materialise(
  g: PlanGraph,
  raw: Raw,
  startNodeId: string,
  startCell: Cell | undefined,
  usedConditional: boolean,
): EscapeResult {
  const first = g.nodeById[startNodeId];
  let cur: Cell | null = startCell ?? first?.centroid ?? null;
  const cells: Cell[] = cur ? [cur] : [];
  const conditionKeys: string[] = [];

  for (let i = 0; i < raw.edges.length; i += 1) {
    const e = raw.edges[i];
    const from = raw.nodes[i];
    const { exit, enter } = crossing(g, e, from);
    if (exit) {
      if (cur && !sameCell(cur, exit)) {
        cells.push(...lineCells(cur, exit));
      } else if (!cur) {
        cells.push(exit);
      }
      cur = exit;
    }
    if (enter && cur && !sameCell(cur, enter)) {
      cells.push(enter);
      cur = enter;
    }
    if (e.conditionKey) conditionKeys.push(e.conditionKey);
  }

  return {
    path: raw.nodes,
    cells,
    cost: raw.cost,
    usedConditional,
    goalNodeId: raw.goalNodeId,
    found: true,
    conditionKeys: usedConditional ? conditionKeys : [],
  };
}

/**
 * 가상 노드 도달의 셀 단위 판정 — docs/DESIGN-v1.0.md §5.2.
 * 종점을 따지는 규칙은 모두 이 함수만 쓴다.
 */
export function reachesGoal(g: PlanGraph, key: ScenarioKey, profile: UserProfile, lastCell: Cell): boolean {
  const ids = goalNodeIds(g, key, profile);
  const goals = new Set(ids);
  for (const e of g.edges) {
    if (!goals.has(e.b) && !goals.has(e.a)) continue;
    if (e.passability[key] === 'blocked') continue;
    if (e.anchorCell && sameCell(e.anchorCell, lastCell)) return true;
  }
  // 목표가 실노드(대피공간·계단)인 경우 — 그 노드의 셀 안에 서 있으면 도달이다
  return ids.some((id) => g.nodeById[id]?.cells?.some((c) => sameCell(c, lastCell)));
}

/** 그 셀에서 목표로 건너갈 때 붙는 조건 설명 키 */
export function goalConditionKeys(
  g: PlanGraph,
  key: ScenarioKey,
  profile: UserProfile,
  lastCell: Cell,
): string[] {
  const goals = new Set(goalNodeIds(g, key, profile));
  const out: string[] = [];
  for (const e of g.edges) {
    if (!goals.has(e.b) && !goals.has(e.a)) continue;
    if (e.passability[key] === 'blocked') continue;
    if (e.anchorCell && sameCell(e.anchorCell, lastCell) && e.conditionKey) out.push(e.conditionKey);
  }
  return out;
}

/**
 * 아이가 그린 경로가 실제로 지나간 개구부들.
 * 규칙(RULE-F-01 현관문 경유 등)이 "무엇을 경유했는가"를 볼 때 쓴다.
 */
export function openingsAlong(plan: FloorPlan, waypoints: Cell[]): OpeningBlock[] {
  const ops = plan.blocks.filter(isOpening);
  const out: OpeningBlock[] = [];
  for (let i = 0; i + 1 < waypoints.length; i += 1) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const side = sideBetween(a, b);
    if (!side) continue;
    for (const o of ops) {
      const fromA = sameCell(o.cell, a) && o.side === side;
      const fromB = sameCell(o.cell, b) && sameCell(step(b, o.side), a);
      if ((fromA || fromB) && !out.includes(o)) out.push(o);
    }
  }
  return out;
}
