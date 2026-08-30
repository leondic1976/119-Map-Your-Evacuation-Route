/**
 * 동적 판정표 — docs/DESIGN-v1.1-changes.md §5.3.
 * 플레이 로그를 보고 어떤 항목이 성립하는지만 정한다. 문장은 content/reportItems.json 에 있다.
 */
import type { PlayLog } from '../../types/report';

export interface Verdict {
  /** content/reportItems.json 의 id 와 같다 */
  id: string;
  test: (log: PlayLog) => boolean;
}

export const VERDICTS: Verdict[] = [
  { id: 'dyn.usedElevator', test: (l) => l.events.usedElevator },
  { id: 'dyn.openedHotDoor', test: (l) => l.events.openedHotDoor },
  { id: 'dyn.stoodInHazard', test: (l) => l.events.stoodInHazard > l.events.crouchedInHazard && l.events.stoodInHazard > 0 },
  { id: 'dyn.passedHazardSource', test: (l) => l.events.passedHazardSource },
  { id: 'dyn.trapped', test: (l) => l.failReason === 'trapped' },
  { id: 'dyn.offRoute', test: (l) => l.events.matchedDrawnRoute < 0.5 && l.visited.length > 3 },
  { id: 'dyn.closedDoor', test: (l) => l.events.closedDoorBehind > 0 },
  { id: 'dyn.crouched', test: (l) => l.events.crouchedInHazard > l.events.stoodInHazard && l.events.crouchedInHazard > 0 },
  { id: 'dyn.checkedDoor', test: (l) => l.events.checkedDoorHeat > 0 },
  { id: 'dyn.usedAlternate', test: (l) => l.events.usedAlternateRoute },
  { id: 'dyn.success', test: (l) => l.outcome === 'success' },
];

/** 잘한 점이 하나도 없을 때 넣는 폴백 — 실패한 아이에게 칭찬 없는 화면을 보이지 않는다 (P5) */
export const FALLBACK_TRIED = 'dyn.fallback.tried';
export const FALLBACK_FIRST = 'dyn.fallback.first';

export const ALL_FAIL_REASONS: NonNullable<PlayLog['failReason']>[] = ['exposure', 'flame', 'timeout', 'trapped', 'quit'];
