/**
 * 점수 없는 2D 대피 미션 진행판 — 설계서 v1.8 §5.1.
 * 게임 규칙을 바꾸지 않고 이미 기록된 행동을 어린이가 알아보기 쉽게 정리한다.
 */
import type { Game } from './loop';
import { isDoorKind } from '../hazard/transfer';
import { PRACTICE_DIFFICULTIES } from './progress';

export type SafetyMissionId = 'crouch' | 'touch-door' | 'close-door' | 'reach-exit';

export interface SafetyMission {
  id: SafetyMissionId;
  label: string;
  done: boolean;
  available: boolean;
  sourceIds: string[];
  /** 이번 자동 난이도에서 먼저 해 볼 목표. 나머지도 언제든 할 수 있다. */
  target: boolean;
}

export function safetyMissions(game: Game, easy: boolean): SafetyMission[] {
  const hasDoor = [...game.ctx.boundaries.values()].some((boundary) => isDoorKind(boundary.openingKind));
  const crouched = game.state.player.posture === 'crouch' || game.frames.some((frame) => frame.posture === 'crouch');
  const checkedDoor = game.state.log.events.checkedDoorHeat > 0;
  const closedDoor = game.state.log.events.closedDoorBehind > 0;
  const escaped = game.state.status === 'success';
  const targetIds = new Set(PRACTICE_DIFFICULTIES[game.state.config?.difficulty ?? 'challenge'].targetMissionIds);

  return [
    {
      id: 'crouch',
      label: crouched ? (easy ? '몸 낮추기 해냈어' : '낮은 자세 완료') : easy ? '몸 낮추기' : '낮은 자세로 이동',
      done: crouched,
      available: true,
      sourceIds: ['nfa-fire-manual'],
      target: targetIds.has('crouch'),
    },
    {
      id: 'touch-door',
      label: !hasDoor ? (easy ? '만질 문이 없어' : '확인할 문 없음') : checkedDoor ? (easy ? '문 확인 해냈어' : '문 온도 확인 완료') : easy ? '문 먼저 만지기' : '문 열기 전 확인',
      done: checkedDoor,
      available: hasDoor,
      sourceIds: ['safekorea-fire'],
      target: targetIds.has('touch-door'),
    },
    {
      id: 'close-door',
      label: !hasDoor ? (easy ? '닫을 문이 없어' : '닫을 문 없음') : closedDoor ? (easy ? '문 닫기 해냈어' : '지나온 문 닫기 완료') : easy ? '지나온 문 닫기' : '통과한 문 닫기',
      done: closedDoor,
      available: hasDoor,
      sourceIds: ['nfa-fire-manual'],
      target: targetIds.has('close-door'),
    },
    {
      id: 'reach-exit',
      label: escaped ? (easy ? '밖으로 나왔어' : '대피 완료') : easy ? '나가는 곳 찾기' : '나가는 곳 도착',
      done: escaped,
      available: true,
      sourceIds: ['nfa-fire-manual'],
      target: targetIds.has('reach-exit'),
    },
  ];
}
