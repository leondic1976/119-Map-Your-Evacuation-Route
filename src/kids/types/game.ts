/**
 * 게임 상태 — plan2-1.md §7.3.
 */
import type { BlockId, Cell, HazardKindId } from './plan';
import type { HazardCell, HazardPreset } from './hazard';
import type { PlayLog } from './report';

export type GameStatus = 'ready' | 'running' | 'paused' | 'success' | 'failed';
export type Posture = 'stand' | 'crouch';
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface PlayerState {
  cell: Cell;
  posture: Posture;
  /** 스프라이트 좌우 반전용 (plan2-1.md §4.5) */
  facing: 'left' | 'right';
  /** 0~1. 1 이면 실패 */
  exposure: number;
  visionRadius: number;
  /** 이 틱까지는 움직이지 못한다 (승강기 등) */
  stuckUntil: number;
  /** 방금 지나온 문. "닫고 갈래?" 제안의 대상 */
  lastDoorId?: BlockId;
}

export interface GameConfig {
  /** 기본판은 'fire' */
  hazardId: HazardKindId;
  seed: number;
  /** false = 연습 모드 (기본값, FR-8.2) */
  timed: boolean;
  gradeMode: 'easy' | 'normal';
}

/**
 * 리플레이 한 컷 — 설계서 v1.2 §8.5.
 * 셀당 1바이트로 줄여 담는다. 저장 파일에는 넣지 않는다 (메모리 전용).
 */
export interface ReplayFrame {
  tick: number;
  cell: Cell;
  posture: Posture;
  facing: 'left' | 'right';
  /** 주 위험 0~255 */
  primary: Uint8Array;
  /** 부 위험(상부) 0~255 */
  secondary: Uint8Array;
  /** 다 탄 칸 표시 */
  spent: Uint8Array;
  doorState: Record<BlockId, 'open' | 'closed'>;
  events: string[];
}

export interface GameState {
  tick: number;
  config: GameConfig;
  preset: HazardPreset;
  /** width*height */
  field: HazardCell[];
  doorState: Record<BlockId, 'open' | 'closed'>;
  /** 문 너머 주 위험의 세기 — 만져보기 판정에 쓴다 */
  doorHeat: Record<BlockId, number>;
  /** 발원지 */
  origin: Cell;
  player: PlayerState;
  status: GameStatus;
  failReason?: PlayLog['failReason'];
  /** 확장판 지진 전용. 기본판에서는 늘 undefined */
  phase?: 'shaking' | 'still' | 'aftershock';
  /** 이 틱에 일어난 일 — 가이드 트리거와 화면 연출이 읽고 비운다 */
  events: string[];
  log: PlayLog;
}
