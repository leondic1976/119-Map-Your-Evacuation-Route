/**
 * 확산 감쇠 계수와 틱 컨텍스트 — docs/DESIGN-v1.1-changes.md §3.3.
 *
 * 셀 배열만으로는 "이 두 셀 사이에 벽이 있는가, 문이 있는가"를 알 수 없다.
 * 매 틱 평면도를 다시 뒤지면 느리므로 게임 시작 때 한 번 미리 계산해 둔다.
 */
import type { BlockId, Cell, FloorPlan, GridSpec, OpeningKind } from '../../types/plan';
import { isOpening, isRoom } from '../../types/plan';
import type { PlanGraph } from '../../types/graph';
import type { HazardField } from '../../types/hazard';
import { cellKey, cellsOf, step } from '../grid/geometry';

export interface Boundary {
  openingId?: BlockId;
  openingKind?: OpeningKind;
}

/** 매 틱 변하지 않는 참조들 */
export interface FieldContext {
  grid: GridSpec;
  /** 셀 경계 → 개구부 정보. 키는 boundaryKey() */
  boundaries: Map<string, Boundary>;
  /** 셀 → 소속 노드 id */
  cellToNode: Map<string, string>;
  graph: PlanGraph;
}

const DOOR_KINDS: OpeningKind[] = ['door', 'sliding_door', 'front_door', 'inner_door', 'emergency_exit'];

export function isDoorKind(kind: OpeningKind | undefined): boolean {
  return Boolean(kind && DOOR_KINDS.includes(kind));
}

/** 두 셀 사이 경계의 키 — 순서와 무관하게 같다 */
export function boundaryKey(a: Cell, b: Cell): string {
  const ka = `${a.x},${a.y}`;
  const kb = `${b.x},${b.y}`;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

export function idx(grid: GridSpec, c: Cell): number {
  return c.y * grid.width + c.x;
}

export function cellOf(grid: GridSpec, i: number): Cell {
  return { x: i % grid.width, y: Math.floor(i / grid.width) };
}

export function inGrid(grid: GridSpec, c: Cell): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < grid.width && c.y < grid.height;
}

export function buildContext(plan: FloorPlan, graph: PlanGraph): FieldContext {
  const boundaries = new Map<string, Boundary>();
  const cellToNode = new Map<string, string>();
  for (const b of plan.blocks) {
    if (isRoom(b)) for (const c of cellsOf(b.rect)) cellToNode.set(cellKey(c), b.id);
  }
  for (const b of plan.blocks) {
    if (!isOpening(b)) continue;
    boundaries.set(boundaryKey(b.cell, step(b.cell, b.side)), { openingId: b.id, openingKind: b.openingKind });
  }
  return { grid: plan.grid, boundaries, cellToNode, graph };
}

export function nodeAt(ctx: FieldContext, c: Cell): string | undefined {
  return ctx.cellToNode.get(cellKey(c));
}

/** 유리로 막힌 개구부 — 닫으면 연기를 막고, 열면 오히려 길을 터 준다 */
const GLAZED_KINDS: OpeningKind[] = ['window', 'sliding_window', 'balcony_window'];

/** 밀폐 성능이 높은 개구부 — 현관 방화문·비상구 */
const SEALED_KINDS: OpeningKind[] = ['front_door', 'emergency_exit'];

/** 확산 감쇠에 쓰는 계수 묶음. 프리셋이 그대로 들어온다 (설계서 v1.2 §2.2) */
export interface TransferFactors {
  doorClosedFactor: number;
  sealedClosedFactor?: number;
  glazedClosedFactor?: number;
  openGlazedBoost?: number;
}

/**
 * a → b 로 위험이 얼마나 건너가는가.
 *   벽·도면 밖                  → 0
 *   방 경계인데 개구부 없음      → 0
 *   닫힌 여닫이문·미닫이문·중문   → doorClosedFactor
 *   닫힌 현관 방화문·비상구       → sealedClosedFactor (더 잘 막는다)
 *   닫힌 창·발코니창             → glazedClosedFactor
 *   열린 창·발코니창             → openGlazedBoost (1 보다 크면 확산을 돕는다)
 *   그 밖(열린 문·같은 방)        → 1
 */
export function transfer(
  a: Cell,
  b: Cell,
  field: HazardField,
  ctx: FieldContext,
  doorState: Record<BlockId, 'open' | 'closed'>,
  factors: TransferFactors,
): number {
  if (!inGrid(ctx.grid, b)) return 0;
  if (field[idx(ctx.grid, b)].isWall) return 0;
  const na = nodeAt(ctx, a);
  const nb = nodeAt(ctx, b);
  if (na === nb) return 1;
  const bd = ctx.boundaries.get(boundaryKey(a, b));
  if (!bd) return 0;
  const kind = bd.openingKind;
  const closed = Boolean(bd.openingId && doorState[bd.openingId] === 'closed');
  if (kind && GLAZED_KINDS.includes(kind)) {
    if (closed) return factors.glazedClosedFactor ?? factors.doorClosedFactor;
    return factors.openGlazedBoost ?? 1;
  }
  if (!closed) return 1;
  if (kind && SEALED_KINDS.includes(kind)) return factors.sealedClosedFactor ?? factors.doorClosedFactor;
  if (isDoorKind(kind)) return factors.doorClosedFactor;
  return 1;
}

/** 사람이 a 에서 b 로 걸어갈 수 있는가 — 벽은 못 지나고, 문·창은 지난다 */
export function walkable(a: Cell, b: Cell, field: HazardField, ctx: FieldContext): Boundary | null | false {
  if (!inGrid(ctx.grid, b)) return false;
  if (field[idx(ctx.grid, b)].isWall) return false;
  const na = nodeAt(ctx, a);
  const nb = nodeAt(ctx, b);
  if (na === nb) return null;
  const bd = ctx.boundaries.get(boundaryKey(a, b));
  return bd ?? false;
}
