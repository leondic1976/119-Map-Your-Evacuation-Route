/**
 * 규칙 엔진 타입 — plan2.md §4.5.
 *
 * RuleDef 는 로직만 갖고 문장은 content/ruleMessages.json 에서 조회한다.
 * 문장 고치는 일이 코드 고치는 일로 번지지 않게 하기 위함이다.
 */
import type { BlockId, Cell, DisasterType, FireScenario, FloorPlan, EvacRoute, ScenarioKey } from './plan';
import type { PlanGraph } from './graph';
import type { UserProfile } from './save';

export type RuleSeverity = 'critical' | 'important' | 'tip';

export interface RuleContext {
  plan: FloorPlan;
  graph: PlanGraph;
  route?: EvacRoute;
  /** 평가의 단일 기준. disaster·scenario 는 여기서 파생된다 */
  key: ScenarioKey;
  disaster: DisasterType;
  scenario?: FireScenario;
  profile: UserProfile;
  /**
   * 이미 펼쳐 본 학습 카드의 id 목록.
   * "그 내용을 알고 있는가"를 묻는 확장판 규칙(RULE-W-02·G-04)이 본다.
   */
  seenCardIds: string[];
}

export interface RuleResult {
  ruleId: string;
  /** na = 평가 조건 미충족 (예: 경로 미작성) */
  status: 'pass' | 'fail' | 'na';
  /** 강조할 대상. 에디터가 이 셀·블록을 밝힌다 */
  targets: { cells?: Cell[]; blockIds?: BlockId[] };
  /** 메시지 템플릿에 갈아 넣을 값 */
  params: Record<string, string>;
}

/**
 * 규칙 문장 — plan2-1.md §5.3.
 * 3단계 대화가 사라지면서 hint1·hint2 는 없어졌다. 리포트 한 줄과 칭찬 한 줄이다.
 */
export interface RuleMessages {
  /** 고칠 점 한 줄. ReportItem.headline 이 된다 */
  reportHeadline: { easy: string; normal: string };
  /** 통과했을 때 잘한 점 한 줄 */
  praise: { easy: string; normal: string };
  /** [왜?] 로 펼칠 학습 카드 */
  whyCardId?: string;
}

export interface RuleDef {
  id: string;
  title: string;
  disasters: DisasterType[];
  scenarios?: FireScenario[];
  severity: RuleSeverity;
  evaluate: (ctx: RuleContext) => RuleResult;
  /** P6 — 비어 있으면 검증에서 걸린다 */
  sourceIds: string[];
  /** 아이 혼자 알 수 없는 항목은 보호자 미션으로 돌린다 (FR-4.10) */
  guardianMissionId?: string;
}

export interface RuleReport {
  disaster: DisasterType;
  scenario?: FireScenario;
  passed: RuleResult[];
  failed: RuleResult[];
  /** 심각도 순으로 고른 다음 지적 1건. 챗봇은 한 번에 하나만 말한다 */
  nextIssue?: RuleResult;
  /** 0~1 */
  completeness: number;
}
