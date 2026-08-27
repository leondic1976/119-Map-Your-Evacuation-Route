/**
 * 발원지 추첨과 플레이 가능성 보장 — plan2-1.md §3.5 · §3.10.
 *
 * 랜덤이되, 시작하자마자 이길 수 없는 판은 내지 않는다 (P3).
 * 같은 seed 면 같은 판이 나온다 (FR-8.15).
 */
import type { Cell, FloorPlan } from '../../types/plan';
import { isRoom } from '../../types/plan';
import type { HazardField, HazardPreset } from '../../types/hazard';
import type { GameState } from '../../types/game';
import type { PlanGraph } from '../../types/graph';
import type { UserProfile } from '../../types/save';
import { goalNodeIds } from '../graph/build';
import { cellKey, cellsOf, manhattan, sameCell } from '../grid/geometry';
import { cloneField, createField, ignite, neighbors4, spread, type FuelLookup } from './field';
import { type FieldContext, idx, walkable } from './transfer';
import { emptyLog } from '../game/playlog';

/** 결정론적 난수 — mulberry32 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 게임의 목표 집합 — 프리셋이 쓰는 ScenarioKey 들의 합집합 (plan2-1.md §3.10).
 * 게임 도중 현관이 막혀도 목표가 바뀌지 않는다.
 */
export function gameGoalIds(graph: PlanGraph, preset: HazardPreset, profile: UserProfile): Set<string> {
  const out = new Set<string>();
  for (const k of preset.scenarioKeys) for (const id of goalNodeIds(graph, k, profile)) out.add(id);
  return out;
}

/** 목표에 닿는 실제 셀 — 개구부·설비의 anchorCell 과 실노드 목표의 셀 */
export function gameGoalCells(graph: PlanGraph, preset: HazardPreset, profile: UserProfile): { cell: Cell; goalId: string }[] {
  const goals = gameGoalIds(graph, preset, profile);
  const out: { cell: Cell; goalId: string }[] = [];
  for (const e of graph.edges) {
    const goal = goals.has(e.b) ? e.b : goals.has(e.a) ? e.a : null;
    if (!goal || !e.anchorCell) continue;
    /*
     * 프리셋의 어느 키에서든 아이 혼자 지날 수 있는(open) 통로만 목표 칸이다.
     * 창문·완강기(conditional)는 어른과 함께여야 하므로 게임의 도착점으로 치지 않는다 —
     * 창가에 서서 "나왔다"가 되면 잘못된 것을 배운다.
     */
    if (!preset.scenarioKeys.some((k) => e.passability[k] === 'open')) continue;
    out.push({ cell: e.anchorCell, goalId: goal });
  }
  for (const id of goals) {
    const n = graph.nodeById[id];
    if (n?.cells) for (const c of n.cells) out.push({ cell: c, goalId: id });
  }
  return out;
}

/** 그 칸에 서면 어느 목표에 닿는가 */
export function goalAt(goalCells: { cell: Cell; goalId: string }[], c: Cell): string | null {
  const hit = goalCells.find((g) => sameCell(g.cell, c));
  return hit ? hit.goalId : null;
}

/** 지금 이 칸을 지나갈 수 있는가 — 주 위험이 임계 아래이고 숨 쉴 만해야 한다 */
export function passable(field: HazardField, ctx: FieldContext, c: Cell, preset: HazardPreset): boolean {
  const cell = field[idx(ctx.grid, c)];
  if (cell.isWall) return false;
  if (cell.primary >= preset.ignitionThreshold) return false;
  if (cell.secondaryLow >= 0.85) return false;
  return true;
}

/**
 * 셀 격자 위 BFS — 시작 칸에서 어떤 목표 칸이든 닿을 수 있는가.
 * 그래프가 아니라 실제 칸 위에서 본다. 문은 열 수 있는 것으로 친다.
 */
export function hasSurvivablePath(
  field: HazardField,
  ctx: FieldContext,
  start: Cell,
  goalCells: { cell: Cell; goalId: string }[],
  preset: HazardPreset,
): boolean {
  if (!passable(field, ctx, start, preset)) return false;
  const goalSet = new Set(goalCells.map((g) => cellKey(g.cell)));
  const seen = new Set<string>([cellKey(start)]);
  const queue: Cell[] = [start];
  while (queue.length) {
    const cur = queue.shift() as Cell;
    if (goalSet.has(cellKey(cur))) return true;
    for (const nb of neighbors4(ctx, cur)) {
      const k = cellKey(nb);
      if (seen.has(k)) continue;
      if (walkable(cur, nb, field, ctx) === false) continue;
      if (!passable(field, ctx, nb, preset)) continue;
      seen.add(k);
      queue.push(nb);
    }
  }
  return false;
}

/** 시작 칸에서 가장 가까운 목표 칸까지의 걸음 수 — 벽·문만 보고 위험은 보지 않는다 */
export function cellDistance(
  field: HazardField,
  ctx: FieldContext,
  start: Cell,
  goalCells: { cell: Cell; goalId: string }[],
): number | null {
  const goals = new Set(goalCells.map((g) => cellKey(g.cell)));
  const dist = new Map<string, number>([[cellKey(start), 0]]);
  const queue: Cell[] = [start];
  while (queue.length) {
    const cur = queue.shift() as Cell;
    const d = dist.get(cellKey(cur)) ?? 0;
    if (goals.has(cellKey(cur))) return d;
    for (const nb of neighbors4(ctx, cur)) {
      const k = cellKey(nb);
      if (dist.has(k)) continue;
      if (walkable(cur, nb, field, ctx) === false) continue;
      dist.set(k, d + 1);
      queue.push(nb);
    }
  }
  return null;
}

/** 한 칸 가는 데 잡는 틱 — 아이가 천천히 눌러도 이만큼이면 간다 */
const TICKS_PER_MOVE = 4;

/**
 * 미리 돌려 볼 지평.
 * plan2-1.md §3.5 는 제한 시간의 40% 를 말하지만, 프리셋 확산 속도로는 그 안에 작은 집이
 * 통째로 타 버려 어떤 발화점도 통과하지 못한다. "시작하자마자 이길 수 없는 판"을 걸러 내는
 * 것이 목적이므로, 목표까지 걸어가는 데 드는 시간(여유 포함)을 지평으로 잡되 40% 를 넘기지 않는다.
 */
export function aheadTicks(field: HazardField, ctx: FieldContext, start: Cell, goalCells: { cell: Cell; goalId: string }[], preset: HazardPreset): number {
  const d = cellDistance(field, ctx, start, goalCells) ?? 20;
  return Math.max(24, Math.min(Math.round(preset.timeLimitTicks * 0.4), d * TICKS_PER_MOVE));
}

/** 발원지 후보 — 가중치가 있는 물건. 하나도 없으면 자원이 있는 방 칸 */
function candidates(plan: FloorPlan, preset: HazardPreset, fuelOf: FuelLookup): { cell: Cell; w: number }[] {
  const out: { cell: Cell; w: number }[] = [];
  for (const b of plan.blocks) {
    if (b.kind === 'room' || b.kind === 'opening') continue;
    const w = preset.ignitionWeights[b.subKind];
    if (w && w > 0) out.push({ cell: b.cell, w });
  }
  if (out.length) return out;
  for (const b of plan.blocks) {
    if (!isRoom(b)) continue;
    const w = fuelOf(b.roomKind);
    if (w <= 0) continue;
    for (const c of cellsOf(b.rect)) out.push({ cell: c, w });
  }
  return out;
}

function weightedPick(list: { cell: Cell; w: number }[], r: number): Cell {
  const total = list.reduce((s, x) => s + x.w, 0);
  let t = r * total;
  for (const x of list) {
    t -= x.w;
    if (t <= 0) return x.cell;
  }
  return list[list.length - 1].cell;
}

/** 발원지를 넣고 얼마간 미리 돌려 본 위험장 */
export function simulateAhead(
  plan: FloorPlan,
  ctx: FieldContext,
  preset: HazardPreset,
  origin: Cell,
  ticks: number,
  fuelOf: FuelLookup,
  base?: HazardField,
): HazardField {
  const field = base ? cloneField(base) : createField(plan, ctx, fuelOf);
  ignite(field, ctx, origin);
  const state = probeState(field, preset, origin);
  for (let i = 0; i < ticks; i += 1) spread(state, ctx);
  return state.field;
}

/** 확산만 돌릴 때 쓰는 최소 상태 — 사람은 없다 */
function probeState(field: HazardField, preset: HazardPreset, origin: Cell): GameState {
  return {
    tick: 0,
    config: { hazardId: preset.id, seed: 0, timed: false, gradeMode: 'normal' },
    preset,
    field,
    doorState: {},
    doorHeat: {},
    origin,
    player: { cell: origin, posture: 'stand', facing: 'right', exposure: 0, visionRadius: preset.visionBase, stuckUntil: 0 },
    status: 'ready',
    events: [],
    log: emptyLog(0, origin),
  };
}

export interface IgnitionPick {
  cell: Cell;
  attempts: number;
  /** 20회 안에 생존 가능한 판을 찾았는가. false 면 구조적으로 출구가 하나뿐인 집이다 */
  guaranteed: boolean;
}

export function pickIgnition(
  plan: FloorPlan,
  ctx: FieldContext,
  preset: HazardPreset,
  profile: UserProfile,
  seed: number,
  startCell: Cell,
  fuelOf: FuelLookup,
): IgnitionPick {
  const list = candidates(plan, preset, fuelOf).filter((c) => !sameCell(c.cell, startCell));
  if (list.length === 0) return { cell: startCell, attempts: 0, guaranteed: false };
  const goalCells = gameGoalCells(ctx.graph, preset, profile);
  const base = createField(plan, ctx, fuelOf);
  const ahead = aheadTicks(base, ctx, startCell, goalCells, preset);
  const random = rng(seed);
  let last = list[0].cell;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const cell = weightedPick(list, random());
    last = cell;
    const field = simulateAhead(plan, ctx, preset, cell, ahead, fuelOf, base);
    if (hasSurvivablePath(field, ctx, startCell, goalCells, preset)) return { cell, attempts: attempt, guaranteed: true };
  }
  /* 20회 실패 — 시작점에서 가장 먼 후보로 둔다 */
  const far = list.slice().sort((a, b) => manhattan(b.cell, startCell) - manhattan(a.cell, startCell))[0];
  return { cell: far?.cell ?? last, attempts: 20, guaranteed: false };
}
