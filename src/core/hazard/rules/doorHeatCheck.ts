/**
 * 특수 규칙 — 문 온도 (화재).
 *
 * 문마다 양쪽 칸의 주 위험 가운데 큰 값을 doorHeat 에 적어 둔다.
 * "만져보기" 동작과 "뜨거운 문을 열었다" 판정이 이 값을 읽는다.
 */
import type { GameState } from '../../../types/game';
import { isDoorKind, type FieldContext, idx } from '../transfer';

export const HOT_DOOR = 0.35;

export function doorHeatCheck(state: GameState, ctx: FieldContext): void {
  const heat: Record<string, number> = {};
  for (const [key, bd] of ctx.boundaries) {
    if (!bd.openingId || !isDoorKind(bd.openingKind)) continue;
    const [a, b] = key.split('|').map((s) => {
      const [x, y] = s.split(',').map(Number);
      return { x, y };
    });
    const pa = state.field[idx(ctx.grid, a)].primary;
    const pb = state.field[idx(ctx.grid, b)].primary;
    heat[bd.openingId] = Math.max(pa, pb);
  }
  state.doorHeat = heat;
}
