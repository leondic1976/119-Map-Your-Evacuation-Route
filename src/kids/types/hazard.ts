/**
 * 위험장(Hazard Field) — plan2-1.md §3.3.
 *
 * 재난 4종을 하나의 엔진으로 표현한다. 기본판은 화재 프리셋만 싣지만
 * 구조는 4종을 담는다. 엔진은 재난 이름을 모르고 프리셋 값만 읽는다.
 */
import type { HazardKindId, ScenarioKey } from './plan';

export type { HazardKindId };

export interface HazardCell {
  /** 주 위험도 0~1. 화염 / 수위 / 가스농도 / 붕괴위험 */
  primary: number;
  /**
   * 부 위험은 두 층으로 관리한다 (상부 / 호흡 높이).
   * 이 두 값이 자세(서기·낮은 자세) 메커니즘의 유일한 근거다.
   */
  secondaryHigh: number;
  secondaryLow: number;
  /** 소진 자원 0~1. 화재의 연소하중. 다른 재난은 1 고정 */
  fuel: number;
  state: 'intact' | 'active' | 'spent';
  /** 벽·도면 밖. 확산도 이동도 막는다 */
  isWall: boolean;
}

/** 길이 = grid.width * grid.height */
export type HazardField = HazardCell[];

export interface HazardPreset {
  id: HazardKindId;
  label: string;
  /** 주 위험의 확산 속도 */
  primarySpread: number;
  /** 부 위험(상부)의 확산 속도. 화재는 이 값이 primary 보다 훨씬 크다 */
  secondarySpread: number;
  /** 활성 셀이 매 틱 스스로 강해지는 양 */
  primaryGrowth: number;
  /** 이 값을 넘으면 옆 셀이 활성화된다 */
  ignitionThreshold: number;
  /** 활성 셀이 매 틱 소모하는 fuel. 0 이면 무한 지속 */
  fuelBurnRate: number;
  /** 활성 셀이 매 틱 만들어 내는 secondaryHigh */
  secondaryEmission: number;
  /** secondaryHigh 가 이 값을 넘으면 아래로 내려오기 시작한다 */
  descendThreshold: number;
  /** 하강 비율 */
  descendRate: number;
  /** 노출량 누적 계수 */
  exposureRate: number;
  /** 위험 0 일 때의 시야 반경(셀) */
  visionBase: number;
  /** 닫힌 문을 지날 때의 감쇠 계수 */
  doorClosedFactor: number;
  /**
   * 닫힌 밀폐 개구부(현관 방화문·비상구)의 감쇠 계수. 일반 문보다 작다.
   * 없으면 doorClosedFactor 를 쓴다 (설계서 v1.2 §2.2)
   */
  sealedClosedFactor?: number;
  /** 닫힌 유리 개구부(창·발코니창)의 감쇠 계수 */
  glazedClosedFactor?: number;
  /** 열린 유리 개구부를 건널 때의 배율. 1 보다 크면 열린 창이 확산을 돕는다 */
  openGlazedBoost?: number;
  /** 낮은 자세일 때 노출 배율 */
  crouchFactor: number;
  /** 제한 시간(틱) */
  timeLimitTicks: number;
  /** 발원지 추첨 가중치. 블록 종류 → 가중치 */
  ignitionWeights: Record<string, number>;
  /** 이 재난이 쓰는 ScenarioKey 목록. 목표 집합은 goalNodeIds() 하나만 정한다 */
  scenarioKeys: ScenarioKey[];
  /** 재난 고유 규칙의 이름 목록 (core/hazard/rules) */
  specialRules: string[];
}
