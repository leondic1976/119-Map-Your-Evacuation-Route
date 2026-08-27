/**
 * 플레이어 — 이동·자세·노출·시야 (plan2-1.md §3.8, FR-8.9 ~ FR-8.12).
 *
 * 이동은 격자 단위다. 벽은 못 지나고, 닫힌 문은 지나면서 열린다.
 * 뜨거운 문을 열면 위험이 왈칵 들어온다.
 */
import type { Cell } from '../../types/plan';
import type { Direction, GameState } from '../../types/game';
import { HOT_DOOR } from '../hazard/rules/doorHeatCheck';
import { type FieldContext, idx, isDoorKind, walkable } from '../hazard/transfer';

/** 부 위험이 이만큼이면 "위험 속"으로 센다 */
const IN_HAZARD_LOW = 0.15;
const IN_HAZARD_HIGH = 0.4;

export function stepCell(c: Cell, d: Direction): Cell {
  switch (d) {
    case 'up':
      return { x: c.x, y: c.y - 1 };
    case 'down':
      return { x: c.x, y: c.y + 1 };
    case 'left':
      return { x: c.x - 1, y: c.y };
    case 'right':
    default:
      return { x: c.x + 1, y: c.y };
  }
}

/** 한 칸 움직인다. 움직였으면 true */
export function move(state: GameState, ctx: FieldContext, d: Direction): boolean {
  if (state.status !== 'running') return false;
  const p = state.player;
  if (state.tick < p.stuckUntil) return false;
  const to = stepCell(p.cell, d);
  const bd = walkable(p.cell, to, state.field, ctx);
  if (bd === false) return false;

  if (d === 'left') p.facing = 'left';
  if (d === 'right') p.facing = 'right';

  if (bd && bd.openingId && isDoorKind(bd.openingKind)) {
    const id = bd.openingId;
    const heat = state.doorHeat[id] ?? 0;
    if (state.doorState[id] === 'closed') {
      state.doorState[id] = 'open';
      if (heat >= HOT_DOOR) {
        /* 뜨거운 문을 열었다 — 위험이 이쪽으로 들이닥친다 */
        state.log.events.openedHotDoor = true;
        state.events.push('openedHotDoor');
        const here = state.field[idx(ctx.grid, p.cell)];
        const there = state.field[idx(ctx.grid, to)];
        here.secondaryHigh = Math.min(1, here.secondaryHigh + 0.4);
        here.secondaryLow = Math.min(1, here.secondaryLow + 0.2);
        here.primary = Math.min(1, here.primary + 0.25 * there.primary);
      }
    }
    p.lastDoorId = id;
    state.events.push('passedDoor');
  } else if (bd && bd.openingId) {
    state.events.push('passedWindow');
    p.lastDoorId = undefined;
  } else {
    p.lastDoorId = undefined;
  }

  p.cell = to;
  state.log.visited.push(to);
  return true;
}

export function togglePosture(state: GameState): void {
  if (state.status !== 'running') return;
  state.player.posture = state.player.posture === 'stand' ? 'crouch' : 'stand';
  state.events.push(state.player.posture === 'crouch' ? 'crouched' : 'stood');
}

/** 옆 문을 만져 본다. 어느 문인지와 뜨거운지 돌려준다 */
export function touchDoor(state: GameState, ctx: FieldContext): { doorId: string; hot: boolean } | null {
  if (state.status !== 'running') return null;
  const p = state.player;
  const dirs: Direction[] = ['up', 'down', 'left', 'right'];
  for (const d of dirs) {
    const to = stepCell(p.cell, d);
    const bd = walkable(p.cell, to, state.field, ctx);
    if (!bd || !bd.openingId || !isDoorKind(bd.openingKind)) continue;
    const hot = (state.doorHeat[bd.openingId] ?? 0) >= HOT_DOOR;
    state.log.events.checkedDoorHeat += 1;
    state.events.push(hot ? 'doorHot' : 'doorCool');
    return { doorId: bd.openingId, hot };
  }
  return null;
}

/** 옆에 만져 볼 문이 있는가 — 단추를 보일지 정한다 */
export function adjacentDoor(state: GameState, ctx: FieldContext): string | null {
  const p = state.player;
  const dirs: Direction[] = ['up', 'down', 'left', 'right'];
  for (const d of dirs) {
    const to = stepCell(p.cell, d);
    const bd = walkable(p.cell, to, state.field, ctx);
    if (bd && bd.openingId && isDoorKind(bd.openingKind)) return bd.openingId;
  }
  return null;
}

/** 방금 지나온 문을 닫는다 */
export function closeDoorBehind(state: GameState): boolean {
  const id = state.player.lastDoorId;
  if (!id || state.status !== 'running') return false;
  if (state.doorState[id] === 'closed') return false;
  state.doorState[id] = 'closed';
  state.log.events.closedDoorBehind += 1;
  state.player.lastDoorId = undefined;
  state.events.push('closedDoor');
  return true;
}

/** 매 틱 — 들이마신 양을 노출에 더하고 시야를 줄인다 */
export function updatePlayer(state: GameState, ctx: FieldContext): void {
  const p = state.player;
  const c = state.field[idx(ctx.grid, p.cell)];
  const crouch = p.posture === 'crouch';
  const dose = crouch ? c.secondaryLow : Math.max(c.secondaryLow, c.secondaryHigh * 0.8);
  const inHazard = c.secondaryLow > IN_HAZARD_LOW || c.secondaryHigh > IN_HAZARD_HIGH;
  if (inHazard) {
    if (crouch) state.log.events.crouchedInHazard += 1;
    else state.log.events.stoodInHazard += 1;
    if (!state.events.includes('inHazard')) state.events.push('inHazard');
  }
  p.exposure = Math.min(1, p.exposure + dose * state.preset.exposureRate * (crouch ? state.preset.crouchFactor : 1));
  p.visionRadius = Math.max(1.5, state.preset.visionBase * (1 - dose * 0.85));
}
