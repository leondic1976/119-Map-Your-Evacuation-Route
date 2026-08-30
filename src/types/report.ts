/**
 * 결과 리포트 — docs/DESIGN-v1.1-changes.md §5.2.
 *
 * 정적 판정(규칙 엔진)과 동적 판정(플레이 로그)을 합쳐
 * [잘한 점] / [고칠 점] 으로 정리한다.
 */
import type { Cell } from './plan';

export type FailReason = 'exposure' | 'flame' | 'timeout' | 'trapped' | 'quit';

export interface PlayEvents {
  /** 문을 닫고 지나간 횟수 */
  closedDoorBehind: number;
  /** 위험 속에서 서 있던 틱 */
  stoodInHazard: number;
  /** 위험 속에서 낮은 자세였던 틱 */
  crouchedInHazard: number;
  usedElevator: boolean;
  /** 문 온도를 확인한 횟수 */
  checkedDoorHeat: number;
  openedHotDoor: boolean;
  /** 발원지 인접을 지나갔는가 */
  passedHazardSource: boolean;
  /** 그린 경로와 겹친 비율 0~1 */
  matchedDrawnRoute: number;
  /** 보조 경로(대체 피난수단)로 나갔는가 */
  usedAlternateRoute: boolean;
}

export interface PlayLog {
  seed: number;
  /** GameState.origin 과 같다. 리포트만 보고도 판을 재현할 수 있게 복사해 둔다 */
  origin: Cell;
  outcome: 'success' | 'fail';
  /** 어느 목표로 나갔는가. usedAlternateRoute 판정의 근거 */
  exitVia?: string;
  failReason?: FailReason;
  elapsedTicks: number;
  visited: Cell[];
  events: PlayEvents;
}

export type ReportPolarity = 'good' | 'fix';

export interface ReportItem {
  id: string;
  polarity: ReportPolarity;
  /** 아이에게 보이는 한 줄 */
  headline: { easy: string; normal: string };
  /** "왜?" 를 눌렀을 때 펼쳐지는 학습 카드 */
  cardId?: string;
  /** 캔버스에서 강조할 위치 */
  highlight?: { cells?: Cell[]; blockIds?: string[] };
  /** 정렬용. 큰 값이 위로 */
  weight: number;
  /** 이 항목을 고치러 가는 동작 */
  action?: { type: 'editPlan' } | { type: 'editRoute' } | { type: 'replay' };
  sourceIds: string[];
  /** 출처 검수 전인가 */
  unverified?: boolean;
}

export interface Report {
  outcome: 'success' | 'fail';
  good: ReportItem[];
  fix: ReportItem[];
  /** 3개 넘게 잡혀 감춘 고칠 점의 수 */
  hiddenFixCount: number;
  playLog: PlayLog;
  attemptNo: number;
}

/** 동적 판정 문장 — content/reportItems.json 한 줄 */
export interface ReportItemDef {
  id: string;
  polarity: ReportPolarity;
  headline: { easy: string; normal: string };
  cardId?: string;
  weight: number;
  action?: ReportItem['action'];
  sourceIds: string[];
}
