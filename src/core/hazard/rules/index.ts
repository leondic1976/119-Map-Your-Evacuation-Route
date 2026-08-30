/**
 * 특수 규칙 훅 등록부 — docs/DESIGN-v1.1-changes.md §3.3 · §8.2.
 * 프리셋의 specialRules 이름이 여기 있는 키와 같아야 한다 (validate 가 검사한다).
 * 확장판(가스·침수·지진)은 여기에 훅을 더한다.
 */
import type { GameState } from '../../../types/game';
import type { FieldContext } from '../transfer';
import { smokeDescends } from './smokeDescends';
import { doorHeatCheck } from './doorHeatCheck';
import { elevatorLocked } from './elevatorLocked';

export type SpecialRule = (state: GameState, ctx: FieldContext) => void;

export const SPECIAL_RULES: Record<string, SpecialRule> = {
  smokeDescends,
  doorHeatCheck,
  elevatorLocked,
};
