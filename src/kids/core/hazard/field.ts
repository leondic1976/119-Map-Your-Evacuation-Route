/**
 * 위험장 틱 루프 — plan2-1.md §3.3.
 *
 * 이 파일은 재난 종류를 모른다. 프리셋 값을 읽고 특수 규칙 훅을 부를 뿐이다.
 * 확장은 프리셋 JSON 한 벌과 훅 함수 몇 개로 끝난다.
 * (검증 규칙: 이 파일에는 특정 재난의 이름이 등장하면 안 된다 — FR-8.16)
 */
import type { BlockId, Cell, FloorPlan } from '../../types/plan';
import { isRoom } from '../../types/plan';
import type { HazardCell, HazardField, HazardPreset } from '../../types/hazard';
import type { GameState } from '../../types/game';
import { cellsOf } from '../grid/geometry';
import { type FieldContext, cellOf, idx, inGrid, transfer } from './transfer';
import { SPECIAL_RULES } from './rules';

/** 블록 id 또는 종류 → 소진 자원(0~1). content/blocks.json 의 fuel 을 넘겨 준다 */
export type FuelLookup = (kind: string) => number;

export function createField(plan: FloorPlan, ctx: FieldContext, fuelOf: FuelLookup): HazardField {
  const n = plan.grid.width * plan.grid.height;
  const field: HazardField = Array.from({ length: n }, () => ({
    primary: 0,
    secondaryHigh: 0,
    secondaryLow: 0,
    fuel: 0,
    state: 'intact',
    isWall: true,
  }));
  /* 방 안은 걸을 수 있고, 방 종류에 따른 기본 자원을 갖는다 */
  for (const b of plan.blocks) {
    if (!isRoom(b)) continue;
    const base = fuelOf(b.roomKind);
    for (const c of cellsOf(b.rect)) {
      const cell = field[idx(plan.grid, c)];
      cell.isWall = false;
      cell.fuel = Math.max(cell.fuel, base);
    }
  }
  /* 물건이 놓인 칸은 그 물건의 자원을 더한다 */
  for (const b of plan.blocks) {
    if (b.kind === 'room' || b.kind === 'opening') continue;
    if (!inGrid(plan.grid, b.cell)) continue;
    const cell = field[idx(plan.grid, b.cell)];
    if (cell.isWall) continue;
    cell.fuel = Math.max(cell.fuel, fuelOf(b.subKind));
  }
  return field;
}

export function ignite(field: HazardField, ctx: FieldContext, origin: Cell): void {
  const c = field[idx(ctx.grid, origin)];
  c.primary = 1;
  c.state = 'active';
  c.secondaryHigh = 1;
}

export function neighbors4(ctx: FieldContext, c: Cell): Cell[] {
  const out: Cell[] = [];
  const cand = [
    { x: c.x + 1, y: c.y },
    { x: c.x - 1, y: c.y },
    { x: c.x, y: c.y + 1 },
    { x: c.x, y: c.y - 1 },
  ];
  for (const n of cand) if (inGrid(ctx.grid, n)) out.push(n);
  return out;
}

/**
 * 한 틱의 확산 — 주 위험 확산 → 부 위험(상부) 생성·확산 → 특수 규칙.
 * 사람의 상태 갱신과 승패 판정은 game/loop.ts 가 이어서 한다.
 */
export function spread(state: GameState, ctx: FieldContext): void {
  const { field, preset, doorState } = state;
  const n = field.length;

  /* 1. 주 위험 확산 */
  const primaryDelta = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const c = field[i];
    if (c.state !== 'active') continue;
    c.primary = Math.min(1, c.primary + preset.primaryGrowth);
    const cc = cellOf(ctx.grid, i);
    for (const nb of neighbors4(ctx, cc)) {
      const j = idx(ctx.grid, nb);
      const t = transfer(cc, nb, field, ctx, doorState, preset);
      if (t === 0) continue;
      primaryDelta[j] += preset.primarySpread * c.primary * t * field[j].fuel;
    }
    if (preset.fuelBurnRate > 0) {
      c.fuel = Math.max(0, c.fuel - preset.fuelBurnRate);
      if (c.fuel === 0) c.state = 'spent';
    }
  }
  for (let i = 0; i < n; i += 1) {
    if (primaryDelta[i] === 0) continue;
    const c = field[i];
    c.primary = Math.min(1, c.primary + primaryDelta[i]);
    if (c.primary > preset.ignitionThreshold && c.fuel > 0 && c.state === 'intact') c.state = 'active';
  }

  /* 2. 부 위험(상부) 생성과 확산 */
  for (let i = 0; i < n; i += 1) {
    const c = field[i];
    if (c.state === 'active') c.secondaryHigh = Math.min(1, c.secondaryHigh + preset.secondaryEmission);
  }
  diffuse(state, ctx, 'secondaryHigh', preset.secondarySpread);

  /* 3. 재난 고유 후처리 */
  for (const name of preset.specialRules) {
    const rule = SPECIAL_RULES[name];
    if (rule) rule(state, ctx);
  }
}

/** 한 값을 옆 칸으로 고르게 퍼뜨린다. 양은 보존되고 벽·닫힌 문이 흐름을 막는다 */
export function diffuse(
  state: GameState,
  ctx: FieldContext,
  key: 'primary' | 'secondaryHigh' | 'secondaryLow',
  rate: number,
): void {
  const { field, preset, doorState } = state;
  const n = field.length;
  const delta = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const c = field[i];
    if (c.isWall || c[key] <= 0) continue;
    const cc = cellOf(ctx.grid, i);
    for (const nb of neighbors4(ctx, cc)) {
      const j = idx(ctx.grid, nb);
      const diff = c[key] - field[j][key];
      if (diff <= 0) continue;
      const t = transfer(cc, nb, field, ctx, doorState, preset);
      if (t === 0) continue;
      const flow = (rate * t * diff) / 4;
      delta[j] += flow;
      delta[i] -= flow;
    }
  }
  for (let i = 0; i < n; i += 1) {
    if (delta[i] === 0) continue;
    field[i][key] = Math.max(0, Math.min(1, field[i][key] + delta[i]));
  }
}

/** 같은 도면에 다른 발원지를 넣어 미리 돌려 볼 때 쓰는 복사본 */
export function cloneField(field: HazardField): HazardField {
  return field.map((c) => ({ ...c }));
}

export function fieldCell(field: HazardField, ctx: FieldContext, c: Cell): HazardCell {
  return field[idx(ctx.grid, c)];
}

export function doorStateOf(state: Pick<GameState, 'doorState'>, id: BlockId): 'open' | 'closed' {
  return state.doorState[id] ?? 'open';
}
