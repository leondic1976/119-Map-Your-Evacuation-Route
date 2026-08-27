/**
 * 연결성 분석 — plan2.md §5.2.
 */
import type { ScenarioKey } from '../../types/plan';
import type { GraphEdge, PlanGraph } from '../../types/graph';
import type { UserProfile } from '../../types/save';
import { goalNodeIds } from './build';

export interface Analysis {
  /** 어떤 출구에도 닿지 못하는 방 */
  isolatedNodes: string[];
  /** 서로 다른 출구의 수. RULE-F-04 판정에 쓴다 */
  exitCount: number;
  /** 현관 말고 다른 피난수단이 있는가 */
  hasSecondaryEscape: boolean;
  /** 막히면 여러 방이 통째로 갇히는 길목 */
  articulationPoints: string[];
}

/** 대체 피난수단으로 인정하는 통로 */
const SECONDARY: GraphEdge['via'][] = [
  'light_partition',
  'descending_hatch',
  'descent_device',
  'emergency_exit',
  'balcony_window',
];

function passable(e: GraphEdge, key: ScenarioKey): boolean {
  return e.passability[key] !== 'blocked';
}

export function analyze(g: PlanGraph, key: ScenarioKey, profile: UserProfile): Analysis {
  const goals = new Set(goalNodeIds(g, key, profile));

  /* 목표에서 거꾸로 훑어 닿는 방을 모은다 */
  const reached = new Set<string>();
  const queue: string[] = [];
  for (const id of goals) {
    if (g.nodeById[id]) {
      reached.add(id);
      queue.push(id);
    }
  }
  while (queue.length) {
    const cur = queue.shift() as string;
    for (const e of g.adjacency[cur] ?? []) {
      // 고립 판정은 아이 혼자 지날 수 있는 통로만 센다. 창문·완강기(조건부)는 길이 아니다
      if (e.passability[key] !== 'open') continue;
      const next = e.a === cur ? e.b : e.a;
      if (reached.has(next)) continue;
      // 가상 노드를 지나 다른 방으로 건너뛰지 않는다
      if (g.nodeById[next]?.kind === 'virtual' && !goals.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }

  const real = g.nodes.filter((n) => n.kind !== 'virtual');
  const isolatedNodes = real.filter((n) => !reached.has(n.id)).map((n) => n.id);

  const exitEdges = g.edges.filter((e) => passable(e, key) && (goals.has(e.a) || goals.has(e.b)));
  const exitCount = exitEdges.length;
  const hasSecondaryEscape =
    g.edges.some((e) => SECONDARY.includes(e.via) && e.passability[key] !== 'blocked') ||
    g.nodes.some((n) => n.kind === 'refuge');

  return { isolatedNodes, exitCount, hasSecondaryEscape, articulationPoints: articulation(g, key) };
}

/** 표준 DFS 기반 단절점 탐색 */
function articulation(g: PlanGraph, key: ScenarioKey): string[] {
  const ids = g.nodes.filter((n) => n.kind !== 'virtual').map((n) => n.id);
  const idset = new Set(ids);
  const disc: Record<string, number> = {};
  const low: Record<string, number> = {};
  const parent: Record<string, string | null> = {};
  const out = new Set<string>();
  let timer = 0;

  const neighbours = (id: string): string[] =>
    (g.adjacency[id] ?? [])
      .filter((e) => passable(e, key))
      .map((e) => (e.a === id ? e.b : e.a))
      .filter((n) => idset.has(n));

  const dfs = (u: string): void => {
    timer += 1;
    disc[u] = timer;
    low[u] = timer;
    let children = 0;
    for (const v of neighbours(u)) {
      if (disc[v] === undefined) {
        children += 1;
        parent[v] = u;
        dfs(v);
        low[u] = Math.min(low[u], low[v]);
        if (parent[u] !== null && parent[u] !== undefined && low[v] >= disc[u]) out.add(u);
      } else if (v !== parent[u]) {
        low[u] = Math.min(low[u], disc[v]);
      }
    }
    if ((parent[u] === null || parent[u] === undefined) && children > 1) out.add(u);
  };

  for (const id of ids) {
    if (disc[id] === undefined) {
      parent[id] = null;
      dfs(id);
    }
  }
  return Array.from(out);
}
