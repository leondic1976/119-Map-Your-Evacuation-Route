/**
 * 표준 평면 4종.
 *
 * 각 평면은 격자선 좌표(cm)로 정의된 실 사각형의 모음이며, 서로 빈틈·중복 없이
 * 맞물린다. 이용자가 입력한 전용면적에 맞추어 등비(√) 축척하여 호출한다.
 */
import {
  Door,
  DoorKind,
  Facility,
  FacilityType,
  Plan,
  PlanTypeKey,
  Room,
  RoomKind,
  Win,
  WindowKind,
  emptyPlan,
  nid,
  roomArea,
} from './types';

interface RoomSpec {
  kind: RoomKind;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DoorSpec {
  kind: DoorKind;
  x: number;
  y: number;
  dir: 'h' | 'v';
  width: number;
  swing?: -1 | 1;
  hinge?: -1 | 1;
  open?: boolean;
}

interface WinSpec {
  kind: WindowKind;
  x: number;
  y: number;
  dir: 'h' | 'v';
  width: number;
}

interface FacSpec {
  type: FacilityType;
  x: number;
  y: number;
  rot?: number;
  size?: number;
}

export interface TemplateSpec {
  key: PlanTypeKey;
  label: string;
  summary: string;
  /** 기준 전용면적(㎡) — 정의 좌표 그대로의 면적 */
  refArea: number;
  /** 이용자에게 처음 제시할 전용면적 */
  defaultArea: number;
  rooms: RoomSpec[];
  doors: DoorSpec[];
  windows: WinSpec[];
  facilities: FacSpec[];
}

/* ------------------------------------------------------------------ */
/* 3베이 판상형                                                        */
/* ------------------------------------------------------------------ */
const BAY3: TemplateSpec = {
  key: 'bay3',
  label: '3베이 판상형',
  summary: '남향 3면(침실·거실·안방) 배치. 국내 84㎡ 표준형에 가장 가깝다.',
  refArea: 0,
  defaultArea: 84,
  rooms: [
    { kind: 'room', name: '침실3', x: 0, y: 0, w: 300, h: 420 },
    { kind: 'bath', name: '욕실', x: 300, y: 0, w: 160, h: 200 },
    { kind: 'entry', name: '현관', x: 460, y: 0, w: 160, h: 200 },
    { kind: 'balcony', name: '후면 발코니', x: 620, y: 0, w: 540, h: 100 },
    { kind: 'kitchen', name: '주방·식당', x: 620, y: 100, w: 540, h: 320 },
    { kind: 'hall', name: '복도', x: 300, y: 200, w: 320, h: 220 },
    { kind: 'room', name: '침실2', x: 0, y: 420, w: 300, h: 340 },
    { kind: 'living', name: '거실', x: 300, y: 420, w: 440, h: 340 },
    { kind: 'room', name: '안방', x: 740, y: 420, w: 420, h: 340 },
    { kind: 'balcony', name: '전면 발코니', x: 0, y: 760, w: 1160, h: 120 },
  ],
  doors: [
    { kind: 'entrance', x: 540, y: 0, dir: 'h', width: 95, swing: 1, hinge: -1 },
    { kind: 'room', x: 540, y: 200, dir: 'h', width: 120, open: true },
    { kind: 'room', x: 380, y: 200, dir: 'h', width: 80, swing: -1, hinge: 1 },
    { kind: 'room', x: 300, y: 320, dir: 'v', width: 90, swing: -1, hinge: -1 },
    { kind: 'room', x: 450, y: 420, dir: 'h', width: 170, open: true },
    { kind: 'room', x: 620, y: 320, dir: 'v', width: 110, open: true },
    { kind: 'room', x: 680, y: 420, dir: 'h', width: 110, open: true },
    { kind: 'room', x: 300, y: 520, dir: 'v', width: 90, swing: 1, hinge: -1 },
    { kind: 'room', x: 740, y: 520, dir: 'v', width: 90, swing: -1, hinge: -1 },
    { kind: 'sliding', x: 700, y: 100, dir: 'h', width: 90 },
    { kind: 'sliding', x: 150, y: 760, dir: 'h', width: 150 },
    { kind: 'sliding', x: 520, y: 760, dir: 'h', width: 220 },
    { kind: 'sliding', x: 950, y: 760, dir: 'h', width: 180 },
  ],
  windows: [
    { kind: 'window', x: 150, y: 0, dir: 'h', width: 150 },
    { kind: 'window', x: 380, y: 0, dir: 'h', width: 60 },
    { kind: 'window', x: 900, y: 0, dir: 'h', width: 180 },
    { kind: 'sliding-window', x: 150, y: 880, dir: 'h', width: 220 },
    { kind: 'sliding-window', x: 520, y: 880, dir: 'h', width: 320 },
    { kind: 'sliding-window', x: 950, y: 880, dir: 'h', width: 260 },
  ],
  facilities: [
    { type: 'extinguisher', x: 570, y: 150 },
    { type: 'detector', x: 520, y: 560 },
    { type: 'partition', x: 1160, y: 820, rot: 90, size: 90 },
  ],
};

/* ------------------------------------------------------------------ */
/* 4베이 판상형                                                        */
/* ------------------------------------------------------------------ */
const BAY4: TemplateSpec = {
  key: 'bay4',
  label: '4베이 판상형',
  summary: '남향 4면 배치의 중대형 평면. 전면 발코니가 전 실에 접한다.',
  refArea: 0,
  defaultArea: 114,
  rooms: [
    { kind: 'room', name: '침실4', x: 0, y: 0, w: 300, h: 420 },
    { kind: 'bath', name: '욕실1', x: 300, y: 0, w: 180, h: 200 },
    { kind: 'entry', name: '현관', x: 480, y: 0, w: 180, h: 200 },
    { kind: 'utility', name: '다용도실', x: 660, y: 0, w: 280, h: 200 },
    { kind: 'balcony', name: '후면 발코니', x: 940, y: 0, w: 500, h: 100 },
    { kind: 'kitchen', name: '주방·식당', x: 940, y: 100, w: 500, h: 320 },
    { kind: 'hall', name: '복도', x: 300, y: 200, w: 640, h: 220 },
    { kind: 'room', name: '침실3', x: 0, y: 420, w: 340, h: 380 },
    { kind: 'room', name: '침실2', x: 340, y: 420, w: 340, h: 380 },
    { kind: 'living', name: '거실', x: 680, y: 420, w: 440, h: 380 },
    { kind: 'room', name: '안방', x: 1120, y: 420, w: 320, h: 380 },
    { kind: 'balcony', name: '전면 발코니', x: 0, y: 800, w: 1440, h: 120 },
  ],
  doors: [
    { kind: 'entrance', x: 570, y: 0, dir: 'h', width: 95, swing: 1, hinge: -1 },
    { kind: 'room', x: 570, y: 200, dir: 'h', width: 130, open: true },
    { kind: 'room', x: 390, y: 200, dir: 'h', width: 80, swing: -1, hinge: 1 },
    { kind: 'room', x: 790, y: 200, dir: 'h', width: 80, swing: -1, hinge: -1 },
    { kind: 'room', x: 300, y: 320, dir: 'v', width: 90, swing: -1, hinge: -1 },
    { kind: 'room', x: 940, y: 320, dir: 'v', width: 150, open: true },
    { kind: 'room', x: 830, y: 420, dir: 'h', width: 180, open: true },
    { kind: 'room', x: 200, y: 420, dir: 'h', width: 90, swing: 1, hinge: -1 },
    { kind: 'room', x: 480, y: 420, dir: 'h', width: 90, swing: 1, hinge: -1 },
    { kind: 'room', x: 1120, y: 520, dir: 'v', width: 90, swing: -1, hinge: -1 },
    { kind: 'sliding', x: 1050, y: 100, dir: 'h', width: 90 },
    { kind: 'sliding', x: 170, y: 800, dir: 'h', width: 160 },
    { kind: 'sliding', x: 510, y: 800, dir: 'h', width: 160 },
    { kind: 'sliding', x: 900, y: 800, dir: 'h', width: 240 },
    { kind: 'sliding', x: 1280, y: 800, dir: 'h', width: 160 },
  ],
  windows: [
    { kind: 'window', x: 150, y: 0, dir: 'h', width: 150 },
    { kind: 'window', x: 390, y: 0, dir: 'h', width: 60 },
    { kind: 'window', x: 800, y: 0, dir: 'h', width: 120 },
    { kind: 'sliding-window', x: 170, y: 920, dir: 'h', width: 240 },
    { kind: 'sliding-window', x: 510, y: 920, dir: 'h', width: 240 },
    { kind: 'sliding-window', x: 900, y: 920, dir: 'h', width: 340 },
    { kind: 'sliding-window', x: 1280, y: 920, dir: 'h', width: 240 },
  ],
  facilities: [
    { type: 'extinguisher', x: 610, y: 150 },
    { type: 'detector', x: 900, y: 600 },
    { type: 'refuge', x: 1330, y: 860, rot: 0 },
  ],
};

/* ------------------------------------------------------------------ */
/* 타워형                                                              */
/* ------------------------------------------------------------------ */
const TOWER: TemplateSpec = {
  key: 'tower',
  label: '타워형',
  summary: '중앙 코어형 소·중형 평면. 거실이 깊게 이어지고 현관이 측벽에 있다.',
  refArea: 0,
  defaultArea: 59,
  rooms: [
    { kind: 'entry', name: '현관', x: 0, y: 0, w: 180, h: 180 },
    { kind: 'bath', name: '욕실', x: 180, y: 0, w: 200, h: 180 },
    { kind: 'kitchen', name: '주방', x: 380, y: 0, w: 260, h: 180 },
    { kind: 'balcony', name: '후면 발코니', x: 640, y: 0, w: 260, h: 180 },
    { kind: 'hall', name: '복도', x: 0, y: 180, w: 180, h: 250 },
    { kind: 'room', name: '침실2', x: 180, y: 180, w: 300, h: 250 },
    { kind: 'living', name: '거실', x: 480, y: 180, w: 420, h: 500 },
    { kind: 'room', name: '침실1', x: 0, y: 430, w: 480, h: 250 },
    { kind: 'balcony', name: '전면 발코니', x: 0, y: 680, w: 900, h: 120 },
  ],
  doors: [
    { kind: 'entrance', x: 0, y: 90, dir: 'v', width: 95, swing: 1, hinge: -1 },
    { kind: 'room', x: 90, y: 180, dir: 'h', width: 110, open: true },
    { kind: 'room', x: 280, y: 180, dir: 'h', width: 80, swing: 1, hinge: -1 },
    { kind: 'room', x: 180, y: 300, dir: 'v', width: 90, swing: 1, hinge: -1 },
    { kind: 'room', x: 480, y: 300, dir: 'v', width: 140, open: true },
    { kind: 'room', x: 480, y: 550, dir: 'v', width: 90, swing: -1, hinge: -1 },
    { kind: 'room', x: 300, y: 430, dir: 'h', width: 90, swing: -1, hinge: -1 },
    { kind: 'room', x: 510, y: 180, dir: 'h', width: 120, open: true },
    { kind: 'sliding', x: 770, y: 180, dir: 'h', width: 90 },
    { kind: 'sliding', x: 240, y: 680, dir: 'h', width: 160 },
    { kind: 'sliding', x: 690, y: 680, dir: 'h', width: 220 },
  ],
  windows: [
    { kind: 'window', x: 280, y: 0, dir: 'h', width: 60 },
    { kind: 'window', x: 900, y: 430, dir: 'v', width: 120 },
    { kind: 'sliding-window', x: 240, y: 800, dir: 'h', width: 260 },
    { kind: 'sliding-window', x: 690, y: 800, dir: 'h', width: 320 },
  ],
  facilities: [
    { type: 'extinguisher', x: 130, y: 130 },
    { type: 'detector', x: 690, y: 430 },
    { type: 'downladder', x: 820, y: 740, rot: 0 },
  ],
};

/* ------------------------------------------------------------------ */
/* 소형                                                                */
/* ------------------------------------------------------------------ */
const SMALL: TemplateSpec = {
  key: 'small',
  label: '소형(도시형)',
  summary: '전용 40㎡ 내외 소형 평면. 현관에서 거실까지 동선이 짧다.',
  refArea: 0,
  defaultArea: 39,
  rooms: [
    { kind: 'entry', name: '현관', x: 0, y: 0, w: 150, h: 150 },
    { kind: 'bath', name: '욕실', x: 150, y: 0, w: 190, h: 150 },
    { kind: 'kitchen', name: '주방', x: 340, y: 0, w: 360, h: 150 },
    { kind: 'room', name: '침실1', x: 0, y: 150, w: 340, h: 250 },
    { kind: 'living', name: '거실', x: 340, y: 150, w: 360, h: 490 },
    { kind: 'room', name: '침실2', x: 0, y: 400, w: 340, h: 240 },
    { kind: 'balcony', name: '발코니', x: 0, y: 640, w: 700, h: 120 },
  ],
  doors: [
    { kind: 'entrance', x: 0, y: 75, dir: 'v', width: 95, swing: 1, hinge: -1 },
    { kind: 'room', x: 150, y: 75, dir: 'v', width: 100, open: true },
    { kind: 'room', x: 245, y: 150, dir: 'h', width: 80, swing: 1, hinge: -1 },
    { kind: 'room', x: 340, y: 75, dir: 'v', width: 110, open: true },
    { kind: 'room', x: 340, y: 270, dir: 'v', width: 90, swing: 1, hinge: -1 },
    { kind: 'room', x: 340, y: 520, dir: 'v', width: 90, swing: 1, hinge: -1 },
    { kind: 'sliding', x: 170, y: 640, dir: 'h', width: 150 },
    { kind: 'sliding', x: 520, y: 640, dir: 'h', width: 200 },
  ],
  windows: [
    { kind: 'window', x: 245, y: 0, dir: 'h', width: 60 },
    { kind: 'window', x: 520, y: 0, dir: 'h', width: 150 },
    { kind: 'sliding-window', x: 170, y: 760, dir: 'h', width: 240 },
    { kind: 'sliding-window', x: 520, y: 760, dir: 'h', width: 280 },
  ],
  facilities: [
    { type: 'extinguisher', x: 105, y: 105 },
    { type: 'detector', x: 520, y: 380 },
    { type: 'partition', x: 700, y: 700, rot: 90, size: 90 },
  ],
};

function computeRefArea(spec: TemplateSpec): number {
  return spec.rooms
    .filter((r) => r.kind !== 'balcony')
    .reduce((s, r) => s + (r.w * r.h) / 10000, 0);
}

export const TEMPLATES: TemplateSpec[] = [BAY3, BAY4, TOWER, SMALL].map((t) => ({
  ...t,
  refArea: Math.round(computeRefArea(t) * 100) / 100,
}));

export function getTemplate(key: PlanTypeKey): TemplateSpec {
  const t = TEMPLATES.find((x) => x.key === key);
  if (!t) throw new Error(`알 수 없는 표준 평면: ${key}`);
  return t;
}

/** 목표 전용면적에 맞춘 등비 축척 계수 */
export function scaleFor(spec: TemplateSpec, targetArea: number): number {
  if (!(targetArea > 0)) return 1;
  return Math.sqrt(targetArea / spec.refArea);
}

const round = (v: number) => Math.round(v);
const clampWidth = (v: number) => Math.max(60, Math.min(280, Math.round(v / 5) * 5));

/**
 * 표준 평면을 목표 전용면적으로 축척해 Plan 으로 변환한다.
 * 실 좌표는 등비 축척하고, 개구부 폭은 60~280cm 로 제한해 현실 치수를 유지한다.
 */
export function buildFromTemplate(key: PlanTypeKey, targetArea: number): Plan {
  const spec = getTemplate(key);
  const s = scaleFor(spec, targetArea);
  const plan = emptyPlan();
  plan.meta.area = Math.round(targetArea * 100) / 100;
  plan.meta.template = key;

  plan.rooms = spec.rooms.map<Room>((r) => ({
    id: nid('r'),
    kind: r.kind,
    name: r.name,
    x: round(r.x * s),
    y: round(r.y * s),
    w: round((r.x + r.w) * s) - round(r.x * s),
    h: round((r.y + r.h) * s) - round(r.y * s),
  }));

  plan.doors = spec.doors.map<Door>((d) => ({
    id: nid('d'),
    kind: d.kind,
    x: round(d.x * s),
    y: round(d.y * s),
    dir: d.dir,
    width: clampWidth(d.width * s),
    swing: d.swing ?? 1,
    hinge: d.hinge ?? -1,
    alwaysOpen: d.open ?? d.kind === 'sliding',
  }));

  plan.windows = spec.windows.map<Win>((w) => ({
    id: nid('w'),
    kind: w.kind,
    x: round(w.x * s),
    y: round(w.y * s),
    dir: w.dir,
    width: clampWidth(w.width * s),
  }));

  plan.facilities = spec.facilities.map<Facility>((f) => ({
    id: nid('f'),
    type: f.type,
    x: round(f.x * s),
    y: round(f.y * s),
    rot: f.rot ?? 0,
    size: f.size ? round(f.size * s) : undefined,
  }));

  return plan;
}

/** 축척 후 실제 전용면적 (검증용) */
export function builtArea(plan: Plan): number {
  return plan.rooms
    .filter((r) => r.kind !== 'balcony')
    .reduce((s, r) => s + roomArea(r), 0);
}
