/**
 * 캐릭터 지도 시스템 — plan2-1.md §4.2.
 *
 * 대화 엔진이 아니라 트리거 엔진이다. 아이가 묻지 않고, 캐릭터가 상황을 보고 먼저 말한다.
 * 결정론적이며 검색이 없으므로 P2(오답보다 모름이 낫다)가 구조로 보장된다.
 */
import type { Cell } from './plan';

export type Speaker = 'yeongi' | 'ungi' | 'ilgu';
export type Emotion = 'normal' | 'happy' | 'worried' | 'alert' | 'thinking';

export type GuideTrigger =
  /** 온보딩·화면 단계 진입 */
  | { on: 'stepEnter'; step: string }
  /** 특정 블록을 처음 놓았을 때 */
  | { on: 'blockPlaced'; blockKind: string }
  /** 검증 규칙 위반 */
  | { on: 'ruleFail'; ruleId: string }
  /** 규칙 통과 (칭찬) */
  | { on: 'rulePass'; ruleId: string }
  | { on: 'gameStart' }
  /** 'enteredSmoke' | 'usedElevator' | 'closedDoor' ... */
  | { on: 'gameEvent'; event: string }
  | { on: 'gameEnd'; outcome: 'success' | 'fail' }
  /** 일정 시간 조작 없음 */
  | { on: 'idle'; seconds: number }
  /** FR-7.10 "이제 뭘 해야 해?" — step 이 있으면 그 단계에서만 */
  | { on: 'helpRequested'; step?: string };

export interface GuideRule {
  id: string;
  trigger: GuideTrigger;
  /** 동시에 걸리면 큰 값이 이긴다 */
  priority: number;
  speaker: Speaker;
  emotion: Emotion;
  text: { easy: string; normal: string };
  /** 캔버스·팔레트에서 강조할 대상 */
  highlight?: { cells?: Cell[]; blockIds?: string[]; paletteItem?: string };
  /** 이 대사에 딸린 학습 카드 */
  cardId?: string;
  /** 같은 대사를 다시 하기까지의 최소 간격(초). 0 이면 한 번만 */
  cooldown: number;
  /** P6 */
  sourceIds: string[];
}

/** v1.0 KnowledgeEntry 를 대체한다. 검색 필드가 사라지고 표시 필드만 남는다 */
export interface GuideCard {
  id: string;
  /** "왜 엘리베이터를 타면 안 될까?" */
  title: string;
  body: { easy: string; normal: string };
  /** 결과 리포트·가이드 말풍선 양쪽에서 쓰인다 */
  relatedRuleIds?: string[];
  /** 보호자 미션 (FR-9.6) */
  requiresGuardian?: boolean;
  /** P6 */
  sourceIds: string[];
}

export interface Source {
  id: string;
  title: string;
  publisher: string;
  url?: string;
  /** ISO date */
  retrievedAt: string;
  /** 1차 출처 대조를 마쳤는가. false 면 화면에 '검수 대기'로 표시한다 */
  verified: boolean;
}

/** 화면에 띄울 말풍선 하나 */
export interface GuideBubble {
  ruleId: string;
  speaker: Speaker;
  emotion: Emotion;
  text: string;
  highlight?: GuideRule['highlight'];
  cardId?: string;
  /** 출처 검수가 끝나지 않은 문장인가 */
  unverified: boolean;
  /** 띄운 시각(ms) — 자동으로 사라지는 기준 */
  at: number;
}
