/**
 * 앱 상태. 지도가 바뀌는 모든 일은 여기를 거쳐 되돌리기와 저장을 함께 탄다.
 */
import { useSyncExternalStore } from 'react';
import { autoDoors, autoMarks, autoRoute, autoTag, splitLargestCell } from '../core/auto';
import type { DrillState } from '../core/drill';
import { changeGrid, densityOf } from '../core/density';
import { addEdges, emptyPlan, normalize } from '../core/edit';
import { analyze, unreachableCells } from '../core/grid';
import { OUT, type Band, type Plan } from '../core/types';
import type { View } from '../core/zoom';
import { BANDS, bandOfGrade } from '../content/bands';
import { howToFor, type HowToStep } from '../content/howto';
import type { LineId } from '../content/lines';
import type { LookId } from '../content/names';
import { buildHome, homeById } from '../content/homes';
import { segEdges, templateById, templatesFor } from '../content/templates';
import { host } from '../platform/host';

export type Screen = 'welcome' | 'nametag' | 'studio';
export const STEPS = ['draw', 'sort', 'door', 'mark', 'route', 'drill', 'review'] as const;
export type StepId = (typeof STEPS)[number];

export const STEP_LABEL: Record<StepId, string> = {
  draw: '집 그리기',
  sort: '칸 칠하기',
  door: '문 달기',
  mark: '표시하기',
  route: '나가는 길',
  drill: '대피 연습',
  review: '돌아보기',
};

export interface Profile {
  name: string;
  grade: number;
  look: LookId;
}

export interface AppState {
  screen: Screen;
  profile: Profile | null;
  plan: Plan;
  step: StepId;
  past: Plan[];
  soundOn: boolean;
  line: LineId;
  /** 빠진 것을 채울지 묻는 중인 단계 */
  asking: StepId | null;
  drill: DrillState | null;
  drillSeed: number;
  /** 떠 있는 사용법 카드 */
  howTo: HowToStep | null;
  /** 이미 본 사용법 */
  seenHowTo: StepId[];
  /** 지도를 얼마나 크게 어디를 보는지. 없으면 전체 보기다. 저장하지 않는다 */
  view: View | null;
  /** 끌면 그리는 대신 종이를 옮긴다 */
  panMode: boolean;
  /** 저장된 도면만 있고 이름표가 없다. 이어서 그리기 전에 이름표를 다시 받는다 */
  retag: boolean;
}

/**
 * 기기에 오래 남는 것은 도면뿐이다(대장 #132). 나머지는 탭을 닫으면 사라진다.
 * 다시 열면 도면의 칸 수로 학년 단계를 알아내 이어서 그린다.
 */
interface Session {
  profile: Profile | null;
  step: StepId;
  soundOn: boolean;
}

/** 저장된 도면의 학년 단계에 맞는 이름표 */
function profileFromPlan(plan: Plan): Profile | null {
  if (plan.walls.length === 0) return null;
  const base = Math.round(plan.cols / (plan.density ?? 1));
  const grade = base === BANDS.high.cols ? 5 : base === BANDS.mid.cols ? 3 : 1;
  return { name: '', grade, look: 'a' };
}

const LOW = BANDS.low;

function initialState(): AppState {
  // 예전 판은 이름표까지 함께 저장했다. 도면만 옮기고 나머지는 지운다
  const legacy = host.load<{ plan?: Plan }>('app');
  const savedPlan = host.load<Plan>('plan') ?? legacy?.plan ?? null;
  host.remove('app');
  host.remove('howto');
  const session = host.loadSession<Session>('app');
  const base: AppState = {
    screen: 'welcome',
    profile: null,
    plan: emptyPlan(LOW.cols, LOW.rows),
    step: 'draw',
    past: [],
    soundOn: true,
    line: 'welcome',
    asking: null,
    drill: null,
    drillSeed: Date.now() % 100000,
    howTo: null,
    seenHowTo: host.loadSession<StepId[]>('howto') ?? [],
    view: null,
    panMode: false,
    retag: false,
  };
  const plan = savedPlan && Array.isArray(savedPlan.walls) ? normalize(savedPlan) : null;
  const step = session?.step;
  return {
    ...base,
    ...(plan ? { plan } : {}),
    profile: session?.profile ?? (plan ? profileFromPlan(plan) : null),
    step: step && STEPS.includes(step) && step !== 'drill' && step !== 'review' ? step : 'draw',
    soundOn: session?.soundOn !== false,
    retag: !session?.profile && Boolean(plan && plan.walls.length > 0),
  };
}

let state: AppState = initialState();
const listeners = new Set<() => void>();

function persist(): void {
  host.save('plan', state.plan);
  const session: Session = { profile: state.profile, step: state.step, soundOn: state.soundOn };
  host.saveSession('app', session);
}

function set(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  persist();
  listeners.forEach((l) => l());
}

export function useApp<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}

export const getApp = (): AppState => state;

export function currentBand(): Band {
  return state.profile ? bandOfGrade(state.profile.grade) : 'low';
}

/** 말하기 — 글을 바꾸고 소리가 켜져 있으면 MP3 를 튼다. after 는 이 말이 끝나고 다른 말이 없으면 이어서 한다 */
export function say(id: LineId, after?: LineId): void {
  set({ line: id });
  const next = after
    ? () => {
        if (state.line === id) say(after);
      }
    : undefined;
  if (state.soundOn) host.playVoice(id, next);
  else if (next) setTimeout(next, 3500);
}

/** 보는 자리는 저장하지 않으므로 손을 움직일 때마다 저장소를 건드리지 않는다 */
function setQuiet(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function setView(view: View | null): void {
  const next = view && view.scale > 1.001 ? view : null;
  setQuiet({ view: next, panMode: next ? state.panMode : false });
}

export function setPanMode(on: boolean): void {
  setQuiet({ panMode: on });
}

export function repeatLine(): void {
  if (state.soundOn) host.playVoice(state.line);
}

export function setSound(on: boolean): void {
  if (!on) host.stopVoice();
  set({ soundOn: on });
}

export function goto(screen: Screen): void {
  set({ screen });
}

/** 처음 화면으로 돌아간다. 그린 지도와 이름표는 그대로 남아 이어서 할 수 있다 */
export function goHome(): void {
  host.stopVoice();
  set({ screen: 'welcome', howTo: null, asking: null });
}

/** 첫 화면의 「처음부터 다시 하기」 — 이름표는 남기고 종이만 새로 깐다 */
export function startOver(): void {
  set({ screen: 'studio' });
  resetPlan();
  if (state.retag) {
    set({ screen: 'nametag', howTo: null });
    say('nametag');
  }
}

/** 첫 화면의 시작 단추 */
export function startApp(): void {
  if (state.retag) {
    set({ screen: 'nametag' });
    say('nametag');
  } else if (state.profile) {
    set({ screen: 'studio' });
    enterStep(state.step);
  } else {
    set({ screen: 'nametag' });
    say('nametag');
  }
}

/** 이름표 저장. 학년 단계가 바뀌면 모눈 크기가 달라져 새 종이로 시작한다 */
export function saveProfile(profile: Profile): void {
  const nextBand = bandOfGrade(profile.grade);
  const sameBand = state.profile && bandOfGrade(state.profile.grade) === nextBand;
  const info = BANDS[nextBand];
  const wasRetag = state.retag;
  const keep = sameBand || (state.profile === null && Math.round(state.plan.cols / densityOf(state.plan)) === info.cols && state.plan.walls.length > 0);
  set({
    profile,
    screen: 'studio',
    retag: false,
    ...(keep
      ? {}
      : {
          plan: emptyPlan(info.cols, info.rows),
          past: [],
          step: 'draw' as StepId,
          drill: null,
        }),
  });
  // 도면으로 이어 가는 길이다. 할 일이 남은 단계로 가고, 지나온 단계의 사용법은 다시 띄우지 않는다
  if (wasRetag && keep) {
    const step = resumeStep(state.plan, nextBand);
    const seenHowTo = [...new Set<StepId>([...state.seenHowTo, ...STEPS.slice(0, STEPS.indexOf(step)).filter(hasHowTo)])];
    host.saveSession('howto', seenHowTo);
    state = { ...state, seenHowTo };
    enterStep(step);
    return;
  }
  enterStep(state.step);
}

/** 이어서 그릴 때 갈 단계 — 앞에서부터 할 일이 남은 첫 단계다. 다 끝났으면 대피 연습이다 */
export function resumeStep(plan: Plan, band: Band): StepId {
  const layout = analyze(plan);
  if (layout.cells.length < 2) return 'draw';
  if (layout.cells.some((c) => !c.kind)) return 'sort';
  if (!layout.links.some((l) => l.b === OUT) || unreachableCells(layout).length > 0) return 'door';
  if (!BANDS[band].marks.every((m) => plan.marks[m])) return 'mark';
  if (plan.route[plan.route.length - 1] !== OUT) return 'route';
  return 'drill';
}

/** 단계에 들어설 때 할 말 */
export function stepLine(step: StepId, band: Band): LineId {
  switch (step) {
    case 'draw':
      return band === 'low' ? 'draw-low' : band === 'mid' ? 'draw-mid' : 'draw-high';
    case 'sort':
      return band === 'low' ? 'sort-low' : 'sort-more';
    case 'door':
      return BANDS[band].windows ? 'door-more' : 'door-low';
    case 'mark':
      return band === 'low' ? 'mark-low' : band === 'mid' ? 'mark-mid' : 'mark-high';
    case 'route':
      return 'route-start';
    case 'drill':
      return analyze(state.plan).cells.length === 0 ? 'draw-need-cell' : 'drill-ready';
    case 'review':
      if (state.drill) return 'review';
      if (analyze(state.plan).cells.length === 0) return 'draw-need-cell';
      return planGaps().length > 0 ? 'review-unfinished' : 'review-no-drill';
  }
}

function hasHowTo(step: StepId): step is HowToStep {
  return step !== 'review';
}

/** 지도에서 아직 빠진 단계들. 돌아보기에서 무엇이 남았는지 알려 준다 */
export function planGaps(plan: Plan = state.plan): StepId[] {
  const gaps: StepId[] = [];
  const layout = analyze(plan);
  if (layout.cells.length === 0) return ['draw'];
  if (layout.cells.some((c) => !c.kind)) gaps.push('sort');
  if (!layout.links.some((l) => l.b === OUT) || unreachableCells(layout).length > 0) gaps.push('door');
  if (!plan.marks.me || !plan.marks.meet) gaps.push('mark');
  if (plan.route[plan.route.length - 1] !== OUT) gaps.push('route');
  return gaps;
}

export function enterStep(step: StepId): void {
  set({ step, asking: null, howTo: null });
  // 빈 종이에서는 연습하는 법을 알려도 할 수가 없다. 집을 그리자는 말을 먼저 한다
  const blocked = step === 'drill' && analyze(state.plan).cells.length === 0;
  if (hasHowTo(step) && !state.seenHowTo.includes(step) && !blocked) openHowTo();
  else say(stepLine(step, currentBand()));
}

/** 사용법 카드를 연다 */
export function openHowTo(): void {
  const step = state.step;
  if (!hasHowTo(step)) return;
  set({ howTo: step });
  say(howToFor(step, currentBand()).line);
}

/** 사용법 카드를 닫고 단계 안내로 돌아간다 */
export function closeHowTo(): void {
  const step = state.step;
  const seenHowTo = state.seenHowTo.includes(step) ? state.seenHowTo : [...state.seenHowTo, step];
  host.saveSession('howto', seenHowTo);
  set({ howTo: null, seenHowTo });
  say(stepLine(step, currentBand()));
}

/** 잘못 눌렀을 때 하는 말. 다음에 맞게 누르면 단계 안내로 돌아간다 */
const MISTAKE_LINES = new Set<LineId>([
  'draw-need-cell',
  'door-window-inside',
  'mark-need-inside',
  'mark-need-outside',
  'route-no-way',
  'draw-armed',
  'route-dead-end',
  'route-same',
  'item-door',
  'dots-lost-cell',
]);

/** 지도 고치기. merge 면 되돌리기 한 번에 함께 묶인다 */
export function commit(plan: Plan, opts: { merge?: boolean } = {}): void {
  if (plan === state.plan) return;
  const past = opts.merge ? state.past : [...state.past, state.plan].slice(-60);
  // 실수를 고쳤을 때 이미 할 일을 다 했으면 처음 말이 아니라 다음에 할 일을 다시 보인다
  const done = DONE_LINES[state.step];
  const line = MISTAKE_LINES.has(state.line) ? (done && stepReady(state.step, plan) ? (done[1] ?? done[0]) : stepLine(state.step, currentBand())) : state.line;
  set({ plan, past, line });
}

export function undo(): void {
  const prev = state.past[state.past.length - 1];
  if (!prev) return;
  set({ plan: prev, past: state.past.slice(0, -1) });
}

/** 처음 네모 수 기준으로 지금 종이가 몇 배인가 */
function ratioOf(plan: Plan): { rx: number; ry: number } {
  const info = BANDS[currentBand()];
  return { rx: plan.cols / info.cols, ry: plan.rows / info.rows };
}

/** 아파트 모양을 깐다. 점이 너무 적으면 작은 칸이 사라지므로 기본 개수까지 늘린다. 되돌리기로 돌아갈 수 있다 */
export function applyHome(id: string): void {
  const home = homeById(id);
  if (!home) return;
  const info = BANDS[currentBand()];
  const blank = changeGrid({ ...state.plan, walls: [], openings: {}, tags: {}, marks: {}, route: [], route2: [], items: [] }, Math.max(state.plan.cols, info.cols), Math.max(state.plan.rows, info.rows));
  const { walls, tags } = buildHome(home, blank.cols, blank.rows);
  commit(normalize({ ...blank, walls, tags }));
}

/** 다른 모양을 깐다. 지금 그린 선은 지운다 */
export function applyTemplate(id: string): void {
  const t = templateById(id);
  if (!t) return;
  const blank: Plan = { ...state.plan, walls: [], openings: {}, tags: {}, marks: {}, route: [], route2: [], items: [] };
  const { rx, ry } = ratioOf(blank);
  commit(addEdges(blank, [...segEdges(t.outer, rx, ry), ...segEdges(t.inner, rx, ry)]));
}

/** 점 개수를 바꾼다. 벽은 가장 가까운 점으로 옮겨 가고, 되돌리기로 돌아갈 수 있다 */
export function setGrid(cols: number, rows: number): void {
  const before = analyze(state.plan).cells.length;
  const prevCols = state.plan.cols;
  const next = changeGrid(state.plan, cols, rows);
  commit(next);
  if (analyze(next).cells.length < before) say('dots-lost-cell');
  else if (densityOf(next) >= 2 && cols > prevCols) say('draw-dense');
}

export function clearRoute(which: 'route' | 'route2'): void {
  commit({ ...state.plan, [which]: [] });
}

/** 지금 단계에서 빠진 것이 있나 */
export function missing(step: StepId, plan: Plan = state.plan): boolean {
  const layout = analyze(plan);
  switch (step) {
    case 'draw':
      return layout.cells.length === 0;
    case 'sort':
      return layout.cells.some((c) => !c.kind);
    case 'door':
      return unreachableCells(layout).length > 0;
    case 'mark':
      return !plan.marks.me || !plan.marks.meet;
    case 'route':
      return plan.route[plan.route.length - 1] !== OUT;
    default:
      return false;
  }
}

/** 이 단계에서 할 일을 다 했나. 다 했으면 다음으로 가자고 알려 준다 */
export function stepReady(step: StepId, plan: Plan = state.plan): boolean {
  const layout = analyze(plan);
  if (layout.cells.length === 0) return false;
  switch (step) {
    case 'draw':
      return layout.cells.length >= 2;
    case 'sort':
      return layout.cells.every((c) => c.kind);
    case 'door':
      return layout.links.some((l) => l.b === OUT) && unreachableCells(layout).length === 0;
    case 'mark':
      return BANDS[currentBand()].marks.every((m) => plan.marks[m]);
    case 'route':
      return plan.route[plan.route.length - 1] === OUT;
    default:
      return false;
  }
}

const DONE_LINES: Partial<Record<StepId, [LineId, LineId?]>> = {
  draw: ['draw-rooms-done'],
  sort: ['sort-why', 'sort-done'],
  door: ['door-done'],
  mark: ['mark-done'],
  route: ['route-done', 'route-next'],
};

/** 단계를 막 끝냈을 때 하는 말. 길 찾기는 눌렀을 때 이미 알맞은 말을 했으면 끊지 않는다 */
export function announceDone(step: StepId): void {
  if (step === 'route' && ['route-done', 'route-second', 'route-no-second', 'route-helped'].includes(state.line)) return;
  const done = DONE_LINES[step];
  if (done) say(done[0], done[1]);
}

/** 「도와줘」 — 지금 단계의 빈 곳을 무난한 값으로 채운다 */
export function helpStep(step: StepId = state.step): void {
  const band = currentBand();
  const plan = state.plan;
  let next = plan;
  switch (step) {
    case 'draw': {
      // 그린 것을 덮어쓰지 않는다. 칸이 없으면 기본 집을 깔고, 집 모양만 있으면 방을 나눈다. 방이 있으면 그대로 둔다
      const cells = analyze(plan).cells.length;
      const t = templatesFor(band)[0];
      if (cells === 0 && t) {
        const { rx, ry } = ratioOf(plan);
        next = addEdges(plan, [...segEdges(t.outer, rx, ry), ...segEdges(t.inner, rx, ry)]);
      } else if (cells === 1) {
        next = splitLargestCell(plan);
      }
      break;
    }
    case 'sort':
      next = autoTag(plan, band);
      break;
    case 'door':
      next = autoDoors(autoTag(plan, band));
      break;
    case 'mark':
      next = autoMarks(plan, band);
      break;
    case 'route':
      next = autoRoute(autoMarks(autoDoors(autoTag(plan, band)), band));
      break;
    default:
      break;
  }
  // 도와줘가 고른 길은 아이가 찾은 길이 아니다. 칭찬하지 않고 따라가 보자고 한다
  const helpedRoute = step === 'route' && plan.route[plan.route.length - 1] !== OUT && next.route[next.route.length - 1] === OUT;
  commit(next);
  set({ asking: null });
  if (helpedRoute) say('route-helped');
}

/** 앞 단계들에서 빠진 것을 모두 채운다 — 연습을 막지 않으려는 마지막 안전망 */
export function fillForDrill(): void {
  const band = currentBand();
  let plan = state.plan;
  if (analyze(plan).cells.length === 0) return;
  plan = autoTag(plan, band);
  plan = autoDoors(plan);
  plan = autoMarks(plan, band);
  if (plan.route[plan.route.length - 1] !== OUT) plan = autoRoute(plan);
  commit(plan);
}

/** 「다음」 — 빠진 것이 있으면 한 번만 묻는다 */
export function nextStep(force = false): void {
  const step = state.step;
  const i = STEPS.indexOf(step);
  const target = STEPS[i + 1];
  if (!target) return;
  if (step === 'draw' && missing('draw')) {
    say('draw-need-cell');
    return;
  }
  if (!force && missing(step)) {
    set({ asking: step });
    say('help-fill');
    return;
  }
  enterStep(target);
}

export function cancelAsk(): void {
  set({ asking: null });
}

export function finishDrill(drill: DrillState): void {
  set({ drill, drillSeed: state.drillSeed + 1 });
  enterStep('review');
}

export function retryDrill(): void {
  set({ drill: null });
  enterStep('drill');
}

/** 처음부터 — 이름표는 남기고 종이만 새로 깐다 */
export function resetPlan(): void {
  const density = densityOf(state.plan);
  set({
    plan: { ...emptyPlan(state.plan.cols, state.plan.rows), ...(density !== 1 ? { density } : {}), ...(state.plan.outside ? { outside: state.plan.outside } : {}) },
    past: [],
    drill: null,
    view: null,
    panMode: false,
  });
  enterStep('draw');
}
