/**
 * 저장 포맷 — docs/DESIGN-v1.1-changes.md §7.4 · §7.5 (v2).
 *
 * 이 제품은 서버가 없다. 이용자 파일을 뒤늦게 고쳐 줄 방법이 없으므로
 * 이행에 실패하면 조용히 덮어쓰지 않고 원본을 지킨다.
 */
import type { FloorPlan, RouteSet } from './plan';
import type { PlayerCharacter } from './guide';

export interface UserProfile {
  /** 1층·반지하 거주 여부. 침수 규칙 분기의 유일한 입력. 기본판에서도 계속 묻는다 */
  lowFloor: boolean;
  gradeMode: 'easy' | 'normal';
  blockStyle: 'kid' | 'blueprint';
  ttsEnabled: boolean;
  /** 소리(감지기·성공음·음성). 끌 수 있고 상태가 저장된다 (설계서 v1.2 §7.1 C1) */
  soundOn: boolean;
  /** 게임에서 내가 되는 캐릭터. 4종 중 고른다 (설계서 v1.2 §6.2) */
  playerCharacter: PlayerCharacter;
}

export function defaultProfile(): UserProfile {
  return { lowFloor: false, gradeMode: 'easy', blockStyle: 'kid', ttsEnabled: false, soundOn: true, playerCharacter: 'boy_cap' };
}

export const SCHEMA_VERSION = 2;

export interface GuardianMission {
  id: string;
  done: boolean;
}

export interface SaveProgress {
  attempts: number;
  successes: number;
  /** 얻은 잘한 점 id 집합. 겹치지 않게 쌓는다 */
  earnedGoodIds: string[];
  /** 아직 한 번도 풀지 못한 고칠 점 id */
  pendingFixIds: string[];
  guardianMissions: GuardianMission[];
  /** 온보딩·펼쳐 본 카드 등 지나온 단계 */
  completedSteps: string[];
  /** 가장 빠르게 나간 기록(틱). 없으면 아직 성공한 적이 없다 (설계서 v1.2 §4.1) */
  bestTicks?: number;
}

export function emptyProgress(): SaveProgress {
  return { attempts: 0, successes: 0, earnedGoodIds: [], pendingFixIds: [], guardianMissions: [], completedSteps: [] };
}

export interface SaveFile {
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  profile: UserProfile;
  plan: FloorPlan;
  routes: RouteSet;
  progress: SaveProgress;
}
