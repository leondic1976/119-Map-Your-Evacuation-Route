/**
 * 플레이 로그 — docs/DESIGN-v1.1-changes.md §5.2.
 * 게임 중 일어난 일을 모아 두고, 끝날 때 리포트가 읽을 값을 마무리한다.
 */
import type { Cell, EvacRoute } from '../../types/plan';
import type { GameState } from '../../types/game';
import type { PlayLog } from '../../types/report';
import { isAdjacent, sameCell } from '../grid/geometry';

export function emptyLog(seed: number, origin: Cell): PlayLog {
  return {
    seed,
    origin,
    outcome: 'fail',
    elapsedTicks: 0,
    visited: [],
    events: {
      closedDoorBehind: 0,
      stoodInHazard: 0,
      crouchedInHazard: 0,
      usedElevator: false,
      checkedDoorHeat: 0,
      openedHotDoor: false,
      passedHazardSource: false,
      matchedDrawnRoute: 0,
      usedAlternateRoute: false,
    },
  };
}

/** 게임이 끝났을 때 — 지나온 길을 그린 경로와 견주고 판정값을 채운다 */
export function finalizeLog(
  state: GameState,
  drawn: EvacRoute | undefined,
  primaryGoalIds: Set<string>,
  alternateGoalIds: Set<string>,
): PlayLog {
  const log = state.log;
  log.elapsedTicks = state.tick;
  log.outcome = state.status === 'success' ? 'success' : 'fail';
  log.failReason = state.status === 'success' ? undefined : state.failReason;

  const visited = log.visited;
  log.events.passedHazardSource = visited.some((c) => isAdjacent(c, state.origin) || sameCell(c, state.origin));

  if (drawn && drawn.waypoints.length) {
    const hit = drawn.waypoints.filter((w) => visited.some((v) => sameCell(v, w))).length;
    log.events.matchedDrawnRoute = hit / drawn.waypoints.length;
  } else {
    log.events.matchedDrawnRoute = 0;
  }

  if (log.exitVia) {
    log.events.usedAlternateRoute = alternateGoalIds.has(log.exitVia) && !primaryGoalIds.has(log.exitVia);
  }
  return log;
}
