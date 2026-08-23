/**
 * 편집 상태 저장소.
 *
 * 외부 상태 관리 라이브러리를 쓰지 않고 useSyncExternalStore 로 구독한다.
 * 실행 취소 이력(80단계)과 자동 저장(600ms 디바운스)을 직접 제어하기 위함이다.
 */
import {
  Door,
  Facility,
  FacilityType,
  Note,
  Plan,
  Pt,
  Room,
  RoomKind,
  Route,
  RouteKind,
  Selection,
  Win,
  DoorKind,
  WalkerKind,
  emptyPlan,
  nid,
} from './types';
import { ScenarioSetup, ScenarioState } from './scenario';
import { SketchMode } from './sketch';
import { loadLevel, loadTutorialSeen, saveLevel, saveLocal, saveTutorialSeen } from './storage';

/**
 * 이용 수준.
 * 초등은 도화지에 그리듯 자유 그리기를 앞세우고 눈금을 굵게 잡는다.
 * 중·고등은 치수를 직접 다루는 정밀 도구를 기본으로 한다.
 */
export type LevelKey = 'elementary' | 'secondary';

export interface LevelDef {
  key: LevelKey;
  label: string;
  short: string;
  hint: string;
  /** 기본 스냅 간격(cm) */
  snap: number;
}

export const LEVELS: LevelDef[] = [
  {
    key: 'elementary',
    label: '초등학생',
    short: '초등',
    hint: '마우스로 쓱쓱 그리면 반듯한 도면이 된다.',
    snap: 10,
  },
  {
    key: 'secondary',
    label: '중·고등·일반',
    short: '중고·일반',
    hint: '치수를 직접 넣어 정확한 도면을 만든다.',
    snap: 5,
  },
];

export type ToolKey =
  | 'select'
  | 'sketch'
  | 'room'
  | 'door'
  | 'window'
  | 'facility'
  | 'route'
  | 'note'
  | 'measure'
  | 'pan';

export interface ToolDef {
  key: ToolKey;
  label: string;
  shortcut: string;
  hint: string;
}

export const TOOLS: ToolDef[] = [
  { key: 'select', label: '선택·이동', shortcut: 'V', hint: '요소를 고르고 옮기거나 크기를 바꾼다.' },
  {
    key: 'sketch',
    label: '자유 그리기',
    shortcut: 'S',
    hint: '도화지에 그리듯 끌면 손을 뗄 때 반듯한 직선으로 펴진다.',
  },
  { key: 'room', label: '실 작도', shortcut: 'R', hint: '드래그해 사각형 실을 만든다.' },
  { key: 'door', label: '개구부', shortcut: 'D', hint: '벽을 눌러 문을 놓는다.' },
  { key: 'window', label: '창호', shortcut: 'W', hint: '외벽을 눌러 창을 놓는다.' },
  { key: 'facility', label: '설비 기호', shortcut: 'F', hint: '소화기·피난설비를 놓는다.' },
  { key: 'route', label: '동선 작도', shortcut: 'L', hint: '클릭으로 꺾은선을 그린다. 더블클릭·Enter로 끝낸다.' },
  { key: 'note', label: '주기', shortcut: 'T', hint: '도면에 글자를 넣는다.' },
  { key: 'measure', label: '거리 측정', shortcut: 'M', hint: '두 점 사이 거리를 잰다.' },
  { key: 'pan', label: '화면 이동', shortcut: 'H', hint: '도면을 끌어 옮긴다. 스페이스로도 된다.' },
];

export interface StepDef {
  key: string;
  no: string;
  title: string;
  short: string;
  tool: ToolKey;
  guide: string;
}

export const STEPS: StepDef[] = [
  { key: 'plan', no: '01', title: '평면 작성', short: '평면', tool: 'room', guide: '표준 평면을 불러오거나, 도면 사진을 올려 자동 인식하거나, 직접 그린다.' },
  { key: 'meta', no: '02', title: '세대 정보', short: '세대', tool: 'select', guide: '동·호수와 사용승인 연도를 입력하면 우리 집 피난시설 유형을 안내한다.' },
  { key: 'opening', no: '03', title: '개구부', short: '개구부', tool: 'door', guide: '현관문과 실문·창호를 배치하고 유효 폭과 상시 개방 여부를 정한다.' },
  { key: 'facility', no: '04', title: '설비 표기', short: '설비', tool: 'facility', guide: '소화기와 대피공간·경량칸막이·하향식 피난구를 표기한다.' },
  { key: 'route', no: '05', title: '피난동선', short: '동선', tool: 'route', guide: '주 동선을 자동 생성하고, 대체 동선을 더한다. 구간별 거리와 소요시간을 확인한다.' },
  { key: 'sim', no: '06', title: '확산 해석', short: '해석', tool: 'select', guide: '발화 지점을 정하고 시간을 옮겨가며 연기가 어디를 먼저 막는지 본다.' },
  { key: 'drill', no: '07', title: '대피 훈련', short: '훈련', tool: 'select', guide: '상황을 정하고 행동을 골라 본다. 선택마다 시간이 흐르고 노출이 쌓인다.' },
  { key: 'check', no: '08', title: '자가 진단', short: '진단', tool: 'select', guide: '도면을 기준으로 점검하고, 집 안 위험요소를 확인한다.' },
  { key: 'output', no: '09', title: '산출물', short: '산출물', tool: 'select', guide: 'A4 피난안내도를 인쇄하고, 이미지·파일로 저장한다.' },
];

export interface Layers {
  background: boolean;
  trace: boolean;
  rooms: boolean;
  walls: boolean;
  labels: boolean;
  dims: boolean;
  doors: boolean;
  windows: boolean;
  facilities: boolean;
  routes: boolean;
  notes: boolean;
  smoke: boolean;
  grid: boolean;
}

export const DEFAULT_LAYERS: Layers = {
  background: true,
  trace: true,
  rooms: true,
  walls: true,
  labels: true,
  dims: false,
  doors: true,
  windows: true,
  facilities: true,
  routes: true,
  notes: true,
  smoke: false,
  grid: false,
};

export const LAYER_LABEL: Record<keyof Layers, string> = {
  background: '배경 도면',
  trace: '인식 벽선',
  rooms: '실 바탕',
  walls: '벽체',
  labels: '실 이름',
  dims: '치수',
  doors: '문',
  windows: '창호',
  facilities: '설비 기호',
  routes: '피난동선',
  notes: '주기',
  smoke: '연기 오버레이',
  grid: '보조 격자',
};

export interface ViewState {
  zoom: number;
  ox: number;
  oy: number;
}

export interface SimState {
  origin: Pt | null;
  cause: string;
  time: number;
  playing: boolean;
  speed: number;
  tMax: number;
}

export interface DrillState {
  setup: ScenarioSetup | null;
  state: ScenarioState | null;
}

/** 따라하기 안내 진행 상태 */
export interface TutorialState {
  active: boolean;
  index: number;
  /** 이미 끝까지 본 수준들 — 다시 뜨지 않게 한다 */
  seen: string[];
}

export interface ToolOptions {
  /** 자유 그리기 해석 방식 */
  sketchMode: SketchMode;
  /** 자유 그리기로 만들 개구부 종류 */
  sketchOpening: 'door' | 'window';
  roomKind: RoomKind;
  doorKind: DoorKind;
  doorWidth: number;
  windowWidth: number;
  facility: FacilityType;
  routeKind: RouteKind;
  noteSize: number;
}

export interface AppState {
  plan: Plan;
  level: LevelKey;
  step: number;
  tool: ToolKey;
  options: ToolOptions;
  selection: Selection | null;
  view: ViewState;
  layers: Layers;
  snap: boolean;
  snapSize: number;
  past: Plan[];
  future: Plan[];
  savedAt: number | null;
  saveError: boolean;
  sim: SimState;
  drill: DrillState;
  toast: { text: string; kind: 'info' | 'warn' } | null;
  tutorial: TutorialState;
  /** 도면 커서 좌표 (상태 표시줄) */
  cursor: Pt | null;
}

export const HISTORY_LIMIT = 80;
const AUTOSAVE_DEBOUNCE = 600;

function initialState(): AppState {
  return {
    plan: emptyPlan(),
    level: 'secondary',
    step: 0,
    tool: 'select',
    options: {
      sketchMode: 'auto',
      sketchOpening: 'door',
      roomKind: 'room',
      doorKind: 'room',
      doorWidth: 90,
      windowWidth: 150,
      facility: 'extinguisher',
      routeKind: 'primary',
      noteSize: 22,
    },
    selection: null,
    view: { zoom: 0.55, ox: 40, oy: 40 },
    layers: { ...DEFAULT_LAYERS },
    snap: true,
    snapSize: 5,
    past: [],
    future: [],
    savedAt: null,
    saveError: false,
    sim: { origin: null, cause: 'kitchen', time: 60, playing: false, speed: 4, tMax: 300 },
    drill: { setup: null, state: null },
    toast: null,
    tutorial: { active: false, index: 0, seen: [] },
    cursor: null,
  };
}

export class AppStore {
  private state: AppState = initialState();

  private listeners = new Set<() => void>();

  private txnBase: Plan | null = null;

  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private autosaveEnabled = true;

  getState = (): AppState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  private set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  setAutosave(on: boolean): void {
    this.autosaveEnabled = on;
  }

  /* ---------------- 계획 변경 ---------------- */

  private scheduleSave(): void {
    if (!this.autosaveEnabled) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const ok = saveLocal(this.state.plan);
      this.set({ savedAt: ok ? Date.now() : this.state.savedAt, saveError: !ok });
    }, AUTOSAVE_DEBOUNCE);
  }

  /** 이력에 남기며 계획을 바꾼다 */
  commit(next: Plan): void {
    const past = this.state.past.concat([this.state.plan]);
    if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
    this.state = { ...this.state, plan: next, past, future: [] };
    this.emit();
    this.scheduleSave();
  }

  update(fn: (plan: Plan) => Plan): void {
    this.commit(fn(this.state.plan));
  }

  /** 드래그처럼 연속 변경을 한 단계로 묶는다 */
  begin(): void {
    if (!this.txnBase) this.txnBase = this.state.plan;
  }

  /** 이력에 남기지 않고 계획을 바꾼다 (트랜잭션 중) */
  patch(next: Plan): void {
    this.state = { ...this.state, plan: next };
    this.emit();
  }

  patchWith(fn: (plan: Plan) => Plan): void {
    this.patch(fn(this.state.plan));
  }

  end(): void {
    if (!this.txnBase) return;
    const base = this.txnBase;
    this.txnBase = null;
    if (base === this.state.plan) return;
    const past = this.state.past.concat([base]);
    if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
    this.state = { ...this.state, past, future: [] };
    this.emit();
    this.scheduleSave();
  }

  cancel(): void {
    if (!this.txnBase) return;
    const base = this.txnBase;
    this.txnBase = null;
    this.set({ plan: base });
  }

  /** 파일 열기·표준 평면 호출 등 전체 교체 */
  replacePlan(plan: Plan, resetView = true): void {
    const past = this.state.past.concat([this.state.plan]);
    if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
    this.state = {
      ...this.state,
      plan,
      past,
      future: [],
      selection: null,
      drill: { setup: null, state: null },
      sim: { ...this.state.sim, origin: null },
      view: resetView ? { ...this.state.view } : this.state.view,
    };
    this.emit();
    this.scheduleSave();
  }

  /**
   * 처음부터 다시 — 그린 것을 모두 지우고 첫 단계로 돌아간다.
   * 실행 취소로 되살릴 수 있도록 이력에는 남긴다.
   */
  resetPlan(): void {
    const past = this.state.past.concat([this.state.plan]);
    if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
    this.state = {
      ...this.state,
      plan: emptyPlan(),
      past,
      future: [],
      step: 0,
      tool: this.state.level === 'elementary' ? 'sketch' : 'select',
      selection: null,
      sim: { origin: null, cause: 'kitchen', time: 60, playing: false, speed: 4, tMax: 300 },
      drill: { setup: null, state: null },
      toast: { text: '처음부터 다시 시작한다. 되돌리려면 Ctrl+Z 를 누른다.', kind: 'info' },
    };
    this.emit();
    this.scheduleSave();
  }

  undo(): void {
    const { past, future, plan } = this.state;
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    this.state = {
      ...this.state,
      plan: prev,
      past: past.slice(0, -1),
      future: [plan].concat(future).slice(0, HISTORY_LIMIT),
      selection: null,
    };
    this.emit();
    this.scheduleSave();
  }

  redo(): void {
    const { past, future, plan } = this.state;
    if (future.length === 0) return;
    const next = future[0];
    this.state = {
      ...this.state,
      plan: next,
      past: past.concat([plan]).slice(-HISTORY_LIMIT),
      future: future.slice(1),
      selection: null,
    };
    this.emit();
    this.scheduleSave();
  }

  canUndo(): boolean {
    return this.state.past.length > 0;
  }

  canRedo(): boolean {
    return this.state.future.length > 0;
  }

  markSaved(): void {
    this.set({ savedAt: Date.now(), saveError: false });
  }

  /* ---------------- 화면 상태 ---------------- */

  /** 단계 기본 도구 — 초등은 실 작도 대신 자유 그리기로 연다 */
  private toolForStep(def: StepDef): ToolKey {
    if (this.state.level === 'elementary' && def.tool === 'room') return 'sketch';
    return def.tool;
  }

  setStep(step: number): void {
    const s = Math.max(0, Math.min(STEPS.length - 1, step));
    const def = STEPS[s];
    const layers = { ...this.state.layers, smoke: def.key === 'sim' || def.key === 'drill' };
    this.set({ step: s, tool: this.toolForStep(def), layers, selection: null });
  }

  /** 이용 수준 변경 — 눈금 간격과 현재 도구를 함께 맞춘다 */
  setLevel(level: LevelKey): void {
    const def = LEVELS.find((l) => l.key === level) ?? LEVELS[1];
    const step = STEPS[this.state.step];
    const tool =
      level === 'elementary' && this.state.tool === 'room'
        ? 'sketch'
        : level === 'secondary' && this.state.tool === 'sketch' && step?.tool === 'room'
          ? 'room'
          : this.state.tool;
    this.state = { ...this.state, level, snapSize: def.snap, tool };
    this.emit();
    saveLevel(level);
  }

  /** 저장된 이용 수준 복원 (첫 진입 시 한 번) */
  restoreLevel(): void {
    const saved = loadLevel();
    if (saved && saved !== this.state.level) this.setLevel(saved);
  }

  /* ---------------- 따라하기 안내 ---------------- */

  /** 저장된 '이미 본' 기록을 복원하고, 처음이면 안내를 띄운다 */
  restoreTutorial(): void {
    const seen = loadTutorialSeen();
    const first = !seen.includes(this.state.level);
    this.set({ tutorial: { active: first, index: 0, seen } });
  }

  startTutorial(): void {
    this.set({ tutorial: { ...this.state.tutorial, active: true, index: 0 } });
  }

  /** 안내를 닫는다. 끝까지 봤으면 다시 뜨지 않도록 기록한다 */
  stopTutorial(completed = false): void {
    const t = this.state.tutorial;
    const seen = completed && !t.seen.includes(this.state.level) ? t.seen.concat([this.state.level]) : t.seen;
    if (seen !== t.seen) saveTutorialSeen(seen);
    this.set({ tutorial: { active: false, index: 0, seen } });
  }

  coachGoto(index: number): void {
    this.set({ tutorial: { ...this.state.tutorial, index: Math.max(0, index) } });
  }

  setTool(tool: ToolKey): void {
    this.set({ tool, selection: tool === 'select' ? this.state.selection : null });
  }

  setOptions(patch: Partial<ToolOptions>): void {
    this.set({ options: { ...this.state.options, ...patch } });
  }

  select(sel: Selection | null): void {
    this.set({ selection: sel });
  }

  setView(view: Partial<ViewState>): void {
    this.set({ view: { ...this.state.view, ...view } });
  }

  zoomBy(factor: number, center?: { x: number; y: number }): void {
    const v = this.state.view;
    const zoom = Math.max(0.12, Math.min(4, v.zoom * factor));
    if (!center) {
      this.set({ view: { ...v, zoom } });
      return;
    }
    const k = zoom / v.zoom;
    this.set({
      view: {
        zoom,
        ox: center.x - (center.x - v.ox) * k,
        oy: center.y - (center.y - v.oy) * k,
      },
    });
  }

  toggleLayer(key: keyof Layers): void {
    this.set({ layers: { ...this.state.layers, [key]: !this.state.layers[key] } });
  }

  setLayers(patch: Partial<Layers>): void {
    this.set({ layers: { ...this.state.layers, ...patch } });
  }

  setSnap(on: boolean, size?: number): void {
    this.set({ snap: on, snapSize: size ?? this.state.snapSize });
  }

  setCursor(p: Pt | null): void {
    const c = this.state.cursor;
    if (!p && !c) return;
    if (p && c && c.x === p.x && c.y === p.y) return;
    this.set({ cursor: p });
  }

  setSim(patch: Partial<SimState>): void {
    this.set({ sim: { ...this.state.sim, ...patch } });
  }

  setDrill(patch: Partial<DrillState>): void {
    this.set({ drill: { ...this.state.drill, ...patch } });
  }

  toast(text: string, kind: 'info' | 'warn' = 'info'): void {
    this.set({ toast: { text, kind } });
  }

  clearToast(): void {
    if (this.state.toast) this.set({ toast: null });
  }

  reset(): void {
    this.state = initialState();
    this.emit();
  }
}

export const store = new AppStore();

/* ------------------------------------------------------------------ */
/* 요소 조작 헬퍼 — 순수 함수                                          */
/* ------------------------------------------------------------------ */

export function addRoom(plan: Plan, room: Omit<Room, 'id'>): Plan {
  return { ...plan, rooms: plan.rooms.concat([{ ...room, id: nid('r') }]) };
}

export function updateRoom(plan: Plan, id: string, patch: Partial<Room>): Plan {
  return { ...plan, rooms: plan.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

export function addDoor(plan: Plan, door: Omit<Door, 'id'>): Plan {
  return { ...plan, doors: plan.doors.concat([{ ...door, id: nid('d') }]) };
}

export function updateDoor(plan: Plan, id: string, patch: Partial<Door>): Plan {
  return { ...plan, doors: plan.doors.map((d) => (d.id === id ? { ...d, ...patch } : d)) };
}

export function addWindow(plan: Plan, win: Omit<Win, 'id'>): Plan {
  return { ...plan, windows: plan.windows.concat([{ ...win, id: nid('w') }]) };
}

export function updateWindow(plan: Plan, id: string, patch: Partial<Win>): Plan {
  return { ...plan, windows: plan.windows.map((w) => (w.id === id ? { ...w, ...patch } : w)) };
}

export function addFacility(plan: Plan, f: Omit<Facility, 'id'>): Plan {
  return { ...plan, facilities: plan.facilities.concat([{ ...f, id: nid('f') }]) };
}

export function updateFacility(plan: Plan, id: string, patch: Partial<Facility>): Plan {
  return { ...plan, facilities: plan.facilities.map((f) => (f.id === id ? { ...f, ...patch } : f)) };
}

export function addRoute(plan: Plan, r: Omit<Route, 'id'>): Plan {
  return { ...plan, routes: plan.routes.concat([{ ...r, id: nid('rt') }]) };
}

export function updateRoute(plan: Plan, id: string, patch: Partial<Route>): Plan {
  return { ...plan, routes: plan.routes.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

export function addNote(plan: Plan, n: Omit<Note, 'id'>): Plan {
  return { ...plan, notes: plan.notes.concat([{ ...n, id: nid('n') }]) };
}

export function updateNote(plan: Plan, id: string, patch: Partial<Note>): Plan {
  return { ...plan, notes: plan.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
}

export function removeSelection(plan: Plan, sel: Selection): Plan {
  switch (sel.kind) {
    case 'room':
      return { ...plan, rooms: plan.rooms.filter((r) => r.id !== sel.id) };
    case 'door':
      return { ...plan, doors: plan.doors.filter((d) => d.id !== sel.id) };
    case 'window':
      return { ...plan, windows: plan.windows.filter((w) => w.id !== sel.id) };
    case 'facility':
      return { ...plan, facilities: plan.facilities.filter((f) => f.id !== sel.id) };
    case 'route':
      return { ...plan, routes: plan.routes.filter((r) => r.id !== sel.id) };
    case 'note':
      return { ...plan, notes: plan.notes.filter((n) => n.id !== sel.id) };
    default:
      return plan;
  }
}

export function setMeta(plan: Plan, patch: Partial<Plan['meta']>): Plan {
  return { ...plan, meta: { ...plan.meta, ...patch } };
}

export function setWalker(plan: Plan, walker: WalkerKind): Plan {
  return setMeta(plan, { walker });
}

/** 단계 완료 여부 — 스테퍼 체크 표시 */
export function stepDone(plan: Plan, step: number, drill: DrillState): boolean {
  switch (STEPS[step]?.key) {
    case 'plan':
      return plan.rooms.length >= 2;
    case 'meta':
      return Boolean(plan.meta.dong.trim() && plan.meta.ho.trim());
    case 'opening':
      return plan.doors.some((d) => d.kind === 'entrance');
    case 'facility':
      return plan.facilities.length > 0;
    case 'route':
      return plan.routes.length > 0;
    case 'sim':
      return true;
    case 'drill':
      return Boolean(drill.state && drill.state.outcome !== 'ongoing');
    case 'check':
      return plan.routes.length > 0 && plan.facilities.length > 0;
    case 'output':
      return false;
    default:
      return false;
  }
}
