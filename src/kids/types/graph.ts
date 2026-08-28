/**
 * 그래프 타입 — plan2.md §4.3.
 *
 * 시나리오 ①②를 별도 그래프로 만들지 않는다.
 * 하나의 그래프에 다섯 시나리오의 통행 가능성을 함께 담고 조회 키만 바꾼다.
 */
import type { Cell, ExitKind, LayerId, OpeningKind, BlockId, RoomKind, ScenarioKey } from './plan';

export type NodeKind = 'room' | 'refuge' | 'stair' | 'elevator' | 'virtual';

/** 평면도에 그려지지 않는 도달 목표. 셀을 갖지 않는다 */
export type VirtualId = 'outdoor' | 'neighbor' | 'below' | 'upstairs';

export const VN = {
  outdoor: 'VN_outdoor',
  neighbor: 'VN_neighbor',
  below: 'VN_below',
  upstairs: 'VN_upstairs',
} as const;

export type VirtualNodeId = (typeof VN)[keyof typeof VN];

export interface GraphNode {
  /** 실노드는 BlockId, 가상노드는 'VN_outdoor' 등 */
  id: string;
  kind: NodeKind;
  label: string;
  /** kind === 'virtual' 일 때만 있다 */
  virtualId?: VirtualId;
  /** kind !== 'virtual' 일 때만 있다 */
  layer?: LayerId;
  roomBlockId?: BlockId;
  /** 방 노드일 때의 용도. 욕실을 마지막 기댈 곳으로 삼는 판정에 쓴다 */
  roomKind?: RoomKind;
  cells?: Cell[];
  centroid?: Cell;
  /** 이 공간에 있는 위험원 */
  hazards: string[];
  hasWindow: boolean;
  /** 지상으로 바로 이어지는가. stair 노드의 목표 판정에 쓴다 */
  reachesGround?: boolean;
  /** 이 공간에 놓인 밖으로 나가는 곳의 갈래 (설계서 v1.2 §3.1) */
  exitKind?: ExitKind;
}

export type EdgeVia =
  | OpeningKind
  | 'light_partition'
  | 'descending_hatch'
  | 'descent_device'
  | 'stair_up'
  /** 개구부 없이 붙어 있음 = 벽. 통행 불가 */
  | 'adjacent';

export type Passability = 'open' | 'conditional' | 'blocked';

export interface GraphEdge {
  id: string;
  /** 항상 실노드 쪽 */
  a: string;
  /** 가상 노드일 수 있다 */
  b: string;
  via: EdgeVia;
  cost: number;
  /** DisasterType 이 아니라 ScenarioKey 로 키를 잡는다 */
  passability: Record<ScenarioKey, Passability>;
  /**
   * 가상 노드 도달 판정의 근거.
   * 이 엣지를 지나기 직전에 서 있어야 하는 실제 셀(개구부·설비가 놓인 셀)이다.
   * 가상 노드에는 cells 가 없으므로 이 필드가 유일한 판정 수단이다.
   */
  anchorCell?: Cell;
  /** conditional 일 때 조건 설명 키 */
  conditionKey?: string;
}

export interface PlanGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeById: Record<string, GraphNode>;
  adjacency: Record<string, GraphEdge[]>;
  /** 그래프를 세우며 발견한 문제 — 조용히 버리지 않는다 (P3) */
  warnings: string[];
}

const O: Passability = 'open';
const C: Passability = 'conditional';
const X: Passability = 'blocked';

function row(
  fireOk: Passability,
  fireBlocked: Passability,
  quake: Passability,
  flood: Passability,
  gas: Passability,
): Record<ScenarioKey, Passability> {
  return {
    fire_exit_available: fireOk,
    fire_exit_blocked: fireBlocked,
    earthquake: quake,
    flood,
    gas,
  };
}

/**
 * 엣지 통행 가능성 기본값 — plan2.md §4.3 의 표를 그대로 옮긴 것이다.
 *
 * 시나리오 ②에서 front_door 가 막히므로, 남는 목표는 대피공간·경량칸막이·
 * 하향식 피난구뿐이 된다. §6.1 의 지침이 그래프 구조로 저절로 구현된다.
 */
export const DEFAULT_PASSABILITY: Record<EdgeVia, Record<ScenarioKey, Passability>> = {
  door: row(O, O, O, O, O),
  inner_door: row(O, O, O, O, O),
  front_door: row(O, X, O, O, O),
  window: row(C, C, C, C, O),
  balcony_window: row(O, O, O, O, O),
  emergency_exit: row(O, O, O, O, O),
  light_partition: row(X, O, X, X, X),
  descending_hatch: row(X, O, X, X, X),
  /** 완강기는 아이 혼자 쓰기에 맞지 않다. ②에서도 conditional 로 둔다 */
  descent_device: row(X, C, X, X, X),
  stair_up: row(X, X, X, O, X),
  adjacent: row(X, X, X, X, X),
};

/** conditional 엣지에 붙일 조건 설명 키 */
export const CONDITION_KEY: Partial<Record<EdgeVia, string>> = {
  window: 'window.adult',
  descent_device: 'descent_device.adult',
};
