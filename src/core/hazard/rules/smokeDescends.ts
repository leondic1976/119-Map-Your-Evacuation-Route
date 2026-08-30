/**
 * 특수 규칙 — 연기 하강 (화재).
 *
 * 천장(secondaryHigh)에 연기가 차면 호흡 높이(secondaryLow)로 내려온다.
 * 서 있으면 상부의 영향을 크게 받고, 낮은 자세면 호흡 높이 값만 마신다.
 * 이것이 "낮은 자세"의 효과를 몸으로 배우게 하는 장치다.
 */
import type { GameState } from '../../../types/game';
import type { FieldContext } from '../transfer';

export function smokeDescends(state: GameState, _ctx: FieldContext): void {
  const { field, preset } = state;
  for (let i = 0; i < field.length; i += 1) {
    const c = field[i];
    if (c.isWall) continue;
    if (c.secondaryHigh > preset.descendThreshold) {
      const d = preset.descendRate * (c.secondaryHigh - preset.descendThreshold);
      c.secondaryLow = Math.min(1, c.secondaryLow + d);
      c.secondaryHigh = Math.max(0, c.secondaryHigh - d * 0.5);
    }
  }
}
