/**
 * 우리집 대피지도 — 평면도·경로 타입.
 *
 * plan2.md §4.1 · §4.2 · §4.4 를 그대로 옮긴 것이다.
 * 이 파일은 다른 타입 파일을 부르지 않는다(순환 참조 방지).
 */

export type DisasterType = 'fire' | 'earthquake' | 'flood' | 'gas';

/** 위험장 프리셋 식별자 — 재난 종류와 같은 집합이다 (plan2-1.md §3.3) */
export type HazardKindId = DisasterType;

/** 화재 시나리오. 소방청 '상황별 대피' 지침을 따른다 (plan2.md §6.1) */
export type FireScenario = 'exit_available' | 'exit_blocked';

/**
 * 통행 가능성·경로 탐색·규칙 평가의 단일 기준 키.
 * 화재는 시나리오 2종의 통행 조건이 서로 다르므로
 * DisasterType 이 아니라 이 키로 모든 분기를 통일한다.
 */
export type ScenarioKey =
  | 'fire_exit_available'
  | 'fire_exit_blocked'
  | 'earthquake'
  | 'flood'
  | 'gas';

export const SCENARIO_KEYS: ScenarioKey[] = [
  'fire_exit_available',
  'fire_exit_blocked',
  'earthquake',
  'flood',
  'gas',
];

export function scenarioKey(d: DisasterType, sc?: FireScenario): ScenarioKey {
  if (d === 'fire') return sc === 'exit_blocked' ? 'fire_exit_blocked' : 'fire_exit_available';
  return d as ScenarioKey;
}

/** 반대 방향 — 키에서 재난과 시나리오를 되짚는다 */
export function splitKey(key: ScenarioKey): { disaster: DisasterType; scenario?: FireScenario } {
  if (key === 'fire_exit_available') return { disaster: 'fire', scenario: 'exit_available' };
  if (key === 'fire_exit_blocked') return { disaster: 'fire', scenario: 'exit_blocked' };
  return { disaster: key as DisasterType };
}

/** 집 안 / 현관 밖 공용부 */
export type LayerId = 'home' | 'common';
export type Side = 'N' | 'E' | 'S' | 'W';

export const SIDES: Side[] = ['N', 'E', 'S', 'W'];

export interface Cell {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridSpec {
  width: number;
  height: number;
}

export const DEFAULT_GRID: GridSpec = { width: 24, height: 16 };

/* ------------------------------------------------------------------ */
/* 블록                                                                */
/* ------------------------------------------------------------------ */

export type RoomKind =
  | 'bedroom'
  | 'living'
  | 'kitchen'
  | 'bath'
  | 'entry'
  | 'balcony'
  | 'utility'
  | 'corridor'
  | 'stair'
  | 'elevator_hall';

export type OpeningKind =
  | 'door'
  | 'front_door'
  | 'inner_door'
  | 'window'
  | 'balcony_window'
  | 'emergency_exit';

/** 피난설비. 대체 대피로의 근거가 되므로 그래프 엣지를 만든다 */
export type SafetyKind =
  | 'light_partition'
  | 'refuge_area'
  | 'descending_hatch'
  | 'descent_device'
  | 'extinguisher'
  | 'detector'
  | 'gas_valve';

export type FurnitureKind =
  | 'bed'
  | 'sofa'
  | 'desk'
  | 'wardrobe'
  | 'bookshelf'
  | 'dining_table'
  | 'fridge'
  | 'tv';

export type HazardKind = 'gas_range' | 'boiler' | 'power_strip' | 'heater' | 'candle';

export type MarkerKind = 'meeting_point' | 'my_spot' | 'ground_exit';

export type PointKind = SafetyKind | FurnitureKind | HazardKind | MarkerKind;

export type BlockId = string;

export interface RoomBlock {
  kind: 'room';
  id: BlockId;
  layer: LayerId;
  roomKind: RoomKind;
  rect: Rect;
  /** 이용자가 붙인 이름. 비면 roomKind 의 기본 이름을 쓴다 */
  label: string;
}

export interface OpeningBlock {
  kind: 'opening';
  id: BlockId;
  layer: LayerId;
  openingKind: OpeningKind;
  /** 개구부가 속한 셀 */
  cell: Cell;
  /** 그 셀의 어느 벽면인가 */
  side: Side;
  closedByDefault: boolean;
}

export interface PointBlock {
  kind: 'safety' | 'furniture' | 'hazard' | 'marker';
  id: BlockId;
  layer: LayerId;
  subKind: PointKind;
  cell: Cell;
  rotation: 0 | 90 | 180 | 270;
}

export type Block = RoomBlock | OpeningBlock | PointBlock;

export interface FloorPlan {
  grid: GridSpec;
  blocks: Block[];
}

export function emptyFloorPlan(): FloorPlan {
  return { grid: { ...DEFAULT_GRID }, blocks: [] };
}

/* ------------------------------------------------------------------ */
/* 대피경로                                                            */
/* ------------------------------------------------------------------ */

export interface EvacRoute {
  /**
   * 규칙 평가의 단일 기준 키 (plan2-1.md §3.2).
   * 주 경로는 fire_exit_available, 보조 경로는 fire_exit_blocked 로 고정된다.
   * 이 값이 있어야 RULE-F-01(①)과 RULE-F-05(②)가 서로를 부정하지 않는다.
   */
  key: ScenarioKey;
  disaster: DisasterType;
  /** disaster === 'fire' 일 때는 반드시 채운다. undefined 로 두면 시나리오 규칙이 전부 평가된다 */
  scenario?: FireScenario;
  /** 보통 '내 방' */
  startCell: Cell;
  /** 아이가 그린 경로. 연속된 인접 셀이어야 한다 */
  waypoints: Cell[];
  /** 지진 전용 — 흔들림이 멎을 때까지 머무는 1차 대피처 */
  primaryShelter?: Cell;
  meetingPointBlockId?: BlockId;
}

/** 주 경로 + 보조 경로 — 한 화면에 두 줄 (plan2-1.md §3.2) */
export interface RoutePair {
  /** key = scenarioKey(hazard, 'exit_available') */
  primary?: EvacRoute;
  /** key = scenarioKey(hazard, 'exit_blocked'). 화재에만 뜻이 있다 */
  alternate?: EvacRoute;
}

export type RouteSlot = 'primary' | 'alternate';

export type RouteSet = Partial<Record<HazardKindId, RoutePair>>;

/** 경로 자리 → 규칙 평가 키. 화재만 두 벌이고 나머지는 한 벌이다 */
export function routeKey(hazard: HazardKindId, slot: RouteSlot): ScenarioKey {
  if (hazard === 'fire') return slot === 'alternate' ? 'fire_exit_blocked' : 'fire_exit_available';
  return hazard as ScenarioKey;
}

export function emptyRoute(hazard: HazardKindId, slot: RouteSlot, startCell: Cell, waypoints: Cell[]): EvacRoute {
  const key = routeKey(hazard, slot);
  const { disaster, scenario } = splitKey(key);
  return { key, disaster, scenario, startCell, waypoints };
}

/* ------------------------------------------------------------------ */
/* 좁히기 도우미                                                       */
/* ------------------------------------------------------------------ */

export function isRoom(b: Block): b is RoomBlock {
  return b.kind === 'room';
}

export function isOpening(b: Block): b is OpeningBlock {
  return b.kind === 'opening';
}

export function isPoint(b: Block): b is PointBlock {
  return b.kind === 'safety' || b.kind === 'furniture' || b.kind === 'hazard' || b.kind === 'marker';
}
