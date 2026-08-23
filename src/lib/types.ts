/**
 * 데이터 모델 — 좌표 단위는 cm, 원점은 도면 좌상단.
 * 화면·인쇄·연산 계층이 모두 이 모델 하나만 참조한다.
 */

export type ID = string;

export interface Pt {
  x: number;
  y: number;
}

/** 실 용도 — 도면 바탕색·자동 점검 규칙·기본 명칭에 사용 */
export type RoomKind =
  | 'living'
  | 'room'
  | 'kitchen'
  | 'bath'
  | 'entry'
  | 'hall'
  | 'balcony'
  | 'utility'
  | 'dress'
  | 'store';

export const ROOM_KIND_LABEL: Record<RoomKind, string> = {
  living: '거실',
  room: '침실',
  kitchen: '주방',
  bath: '욕실',
  entry: '현관',
  hall: '복도',
  balcony: '발코니',
  utility: '다용도실',
  dress: '드레스룸',
  store: '창고',
};

/** 실 — 축에 정렬된 사각형. 벽 중심선을 기준으로 한다. */
export interface Room {
  id: ID;
  kind: RoomKind;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type DoorKind = 'entrance' | 'room' | 'sliding' | 'folding';

export const DOOR_KIND_LABEL: Record<DoorKind, string> = {
  entrance: '현관문',
  room: '실문(여닫이)',
  sliding: '미닫이문',
  folding: '접이문',
};

/** 개구부(문) — 벽 중심선 위의 한 점을 중심으로 width 만큼 벽을 절개한다. */
export interface Door {
  id: ID;
  kind: DoorKind;
  /** 개구부 중심 좌표 (벽 중심선 위) */
  x: number;
  y: number;
  /** 벽의 방향. 'h' = 가로 벽(개구부가 x축으로 벌어짐), 'v' = 세로 벽 */
  dir: 'h' | 'v';
  /** 유효 개구 폭(cm) */
  width: number;
  /** 열리는 쪽. 'h' 벽이면 -1 = 위쪽(y 감소), 'v' 벽이면 -1 = 왼쪽(x 감소) */
  swing: -1 | 1;
  /** 경첩 위치. -1 = 좌/상단, 1 = 우/하단 */
  hinge: -1 | 1;
  /** 상시 개방 여부 — 연기 확산 해석에서 지연 없음 */
  alwaysOpen: boolean;
}

export type WindowKind = 'window' | 'sliding-window' | 'fixed';

/** 창호 — 피난에는 쓰이지 않으나 연기 배출·도면 표현에 필요 */
export interface Win {
  id: ID;
  kind: WindowKind;
  x: number;
  y: number;
  dir: 'h' | 'v';
  width: number;
}

/** 세대 피난시설 및 소방설비 기호 */
export type FacilityType =
  | 'extinguisher'
  | 'refuge'
  | 'partition'
  | 'downladder'
  | 'exit'
  | 'assembly';

export const FACILITY_LABEL: Record<FacilityType, string> = {
  extinguisher: '소화기',
  refuge: '대피공간',
  partition: '경량칸막이',
  downladder: '하향식 피난구',
  exit: '피난 종점',
  assembly: '집결지',
};

/** 피난 종점이 될 수 있는 설비 — 동선 산출의 목적지 */
export const EXIT_FACILITIES: FacilityType[] = ['refuge', 'partition', 'downladder'];

export interface Facility {
  id: ID;
  type: FacilityType;
  x: number;
  y: number;
  /** 회전각(도). 경량칸막이·대피공간 등 방향성 있는 기호에 사용 */
  rot: number;
  /** 경량칸막이 등 폭이 있는 기호의 길이(cm) */
  size?: number;
  note?: string;
}

export type RouteKind = 'primary' | 'alt';

export interface Route {
  id: ID;
  kind: RouteKind;
  /** 직각 정리된 꺾은선. cm 좌표 */
  points: Pt[];
  /** 출발 실 id (자동 생성 시) */
  fromRoom?: ID;
  /** 종점 종류 */
  endpoint: 'entrance' | 'refuge' | 'partition' | 'downladder' | 'custom';
  label: string;
  /** 사용자가 직접 그린 동선인지 */
  manual?: boolean;
}

/** 자유 배치 텍스트 주기 */
export interface Note {
  id: ID;
  x: number;
  y: number;
  text: string;
  size: number;
}

/** 업로드 도면 배경 */
export interface Background {
  /** dataURL */
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
}

/** 자동 인식으로 얻은 벽선 후보 */
export interface TraceLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type WalkerKind = 'adult' | 'child' | 'senior';

export const WALKER_LABEL: Record<WalkerKind, string> = {
  adult: '성인',
  child: '어린이',
  senior: '고령자',
};

/** 보행속도 (m/s) — 소방 교육자료 통용 눈높이 수치 */
export const WALK_SPEED: Record<WalkerKind, number> = {
  adult: 1.2,
  child: 0.9,
  senior: 0.7,
};

export type PlanTypeKey = 'bay3' | 'bay4' | 'tower' | 'small';

export interface PlanMeta {
  title: string;
  /** 단지·동·호 */
  complex: string;
  dong: string;
  ho: string;
  floor: number;
  /** 전용면적 (㎡) */
  area: number;
  /** 사용승인 연도 */
  approvalYear: number;
  /** 재실 인원 구성 */
  occupants: Record<WalkerKind, number>;
  /** 대표 보행 기준 */
  walker: WalkerKind;
  /** 외부 집결지 */
  assembly: string;
  /** 비상 연락 메모 */
  contact: string;
  /** 작성일 (YYYY-MM-DD) */
  madeOn: string;
  /** 사용한 표준 평면 */
  template?: PlanTypeKey;
}

export interface Plan {
  /** 파일 형식 버전 */
  version: number;
  meta: PlanMeta;
  rooms: Room[];
  doors: Door[];
  windows: Win[];
  facilities: Facility[];
  routes: Route[];
  notes: Note[];
  background: Background | null;
  traceLines: TraceLine[];
}

export const PLAN_VERSION = 3;

export type SelKind = 'room' | 'door' | 'window' | 'facility' | 'route' | 'note';

export interface Selection {
  kind: SelKind;
  id: ID;
}

let seq = 0;
/** 결정적 id 생성 — 저장 파일 diff 안정성을 위해 순번 기반 */
export function nid(prefix: string): ID {
  seq += 1;
  return `${prefix}${seq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function resetIdSeq(v = 0): void {
  seq = v;
}

export function emptyMeta(): PlanMeta {
  return {
    title: '우리 집 피난안내도',
    complex: '',
    dong: '',
    ho: '',
    floor: 5,
    area: 84,
    approvalYear: 2015,
    occupants: { adult: 2, child: 1, senior: 0 },
    walker: 'adult',
    assembly: '단지 내 놀이터',
    contact: '',
    madeOn: '',
    template: undefined,
  };
}

export function emptyPlan(): Plan {
  return {
    version: PLAN_VERSION,
    meta: emptyMeta(),
    rooms: [],
    doors: [],
    windows: [],
    facilities: [],
    routes: [],
    notes: [],
    background: null,
    traceLines: [],
  };
}

/** 실 면적 (㎡) */
export function roomArea(r: Room): number {
  return (r.w * r.h) / 10000;
}

/** 발코니를 제외한 전용면적 근사 (㎡) */
export function planArea(plan: Plan): number {
  return plan.rooms
    .filter((r) => r.kind !== 'balcony')
    .reduce((s, r) => s + roomArea(r), 0);
}

export function roomCenter(r: Room): Pt {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function planBounds(plan: Plan): { x: number; y: number; w: number; h: number } {
  if (plan.rooms.length === 0) return { x: 0, y: 0, w: 1200, h: 900 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of plan.rooms) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function pointInRoom(r: Room, p: Pt): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function roomAt(plan: Plan, p: Pt): Room | null {
  for (let i = plan.rooms.length - 1; i >= 0; i -= 1) {
    const r = plan.rooms[i];
    if (pointInRoom(r, p)) return r;
  }
  return null;
}

export function polylineLength(pts: Pt[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i += 1) {
    d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return d;
}
