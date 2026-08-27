/**
 * 특수 규칙 — 승강기 멈춤.
 * 승강기 앞에 들어서면 얼마간 움직이지 못한다. 시간만 흐른다.
 * 엘리베이터 금지를 말이 아니라 결과로 배운다.
 */
import type { GameState } from '../../../types/game';
import { type FieldContext, nodeAt } from '../transfer';

const LOCK_TICKS = 12;

export function elevatorLocked(state: GameState, ctx: FieldContext): void {
  const id = nodeAt(ctx, state.player.cell);
  if (!id) return;
  const node = ctx.graph.nodeById[id];
  if (node?.kind !== 'elevator') return;
  if (state.log.events.usedElevator) return;
  state.log.events.usedElevator = true;
  state.player.stuckUntil = state.tick + LOCK_TICKS;
  state.events.push('usedElevator');
}
