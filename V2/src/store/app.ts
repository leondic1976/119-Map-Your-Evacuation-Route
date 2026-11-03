/**
 * 앱 상태. 지도가 바뀌는 모든 일은 여기를 거쳐 되돌리기와 저장을 함께 탄다.
 */
import { useSyncExternalStore } from 'react';
import { autoDoors, autoMarks, autoRoute, autoTag } from '../core/auto';
import type { DrillState } from '../core/drill';
import { addEdges, emptyPlan, normalize } from '../core/edit';
import { analyze, unreachableCells } from '../core/grid';
import { OUT, type Band, type Plan } from '../core/types';
import { BANDS, bandOfGrade } from '../content/bands';
import type { LineId } from '../content/lines';
import type { LookId } from '../content/names';
import { segEdges, templateById, templatesFor } from '../content/templates';
import { host } from '../platform/host';

export type Screen = 'welcome' | 'nametag' | 'studio';
export const STEPS = ['draw', 'sort', 'door', 'mark', 'route', 'drill', 'review'] as const;
export type StepId = (typeof STEPS)[number];

export const STEP_LABEL: Record<StepId, string> = {
  draw: '집 그리기',
  sort: '칸 나누기',
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
  templateId: string | null;
  step: StepId;
  past: Plan[];
  soundOn: boolean;
  line: LineId;
  /** 빠진 것을 채울지 묻는 중인 단계 */
  asking: StepId | null;
  drill: DrillState | null;
  drillSeed: number;
}

interface Saved {
  profile: Profile | null;
  plan: Plan;
  templateId: string | null;
  step: StepId;
  soundOn: boolean;
}

const LOW = BANDS.low;

function initialState(): AppState {
  const saved = host.load<Saved>('app');
  const base: AppState = {
    screen: 'welcome',
    profile: null,
    plan: emptyPlan(LOW.cols, LOW.rows),
    templateId: null,
    step: 'draw',
    past: [],
    soundOn: true,
    line: 'welcome',
    asking: null,
    drill: null,
    drillSeed: Date.now() % 100000,
  };
  if (!saved?.plan || !Array.isArray(saved.plan.walls)) return base;
  return {
    ...base,
    profile: saved.profile,
    plan: normalize(saved.plan),
    templateId: saved.templateId,
    step: STEPS.includes(saved.step) && saved.step !== 'drill' && saved.step !== 'review' ? saved.step : 'draw',
    soundOn: saved.soundOn !== false,
  };
}

let state: AppState = initialState();
const listeners = new Set<() => void>();

function persist(): void {
  const saved: Saved = {
    profile: state.profile,
    plan: state.plan,
    templateId: state.templateId,
    step: state.step,
    soundOn: state.soundOn,
  };
  host.save('app', saved);
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

/** 말하기 — 글을 바꾸고 소리가 켜져 있으면 MP3 를 튼다 */
export function say(id: LineId): void {
  set({ line: id });
  if (state.soundOn) host.playVoice(id);
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

/** 첫 화면의 시작 단추 */
export function startApp(): void {
  if (state.profile) {
    set({ screen: 'studio' });
    enterStep(state.step);
  } else {
    set({ screen: 'nametag' });
    say('nametag');
  }
}

function defaultTemplateId(band: Band): string | null {
  return BANDS[band].guide === 'none' ? null : (templatesFor(band)[0]?.id ?? null);
}

/** 이름표 저장. 학년 단계가 바뀌면 모눈 크기가 달라져 새 종이로 시작한다 */
export function saveProfile(profile: Profile): void {
  const nextBand = bandOfGrade(profile.grade);
  const sameBand = state.profile && bandOfGrade(state.profile.grade) === nextBand;
  const info = BANDS[nextBand];
  const keep = sameBand || (state.profile === null && state.plan.cols === info.cols && state.plan.walls.length > 0);
  set({
    profile,
    screen: 'studio',
    ...(keep
      ? {}
      : {
          plan: emptyPlan(info.cols, info.rows),
          templateId: defaultTemplateId(nextBand),
          past: [],
          step: 'draw' as StepId,
          drill: null,
        }),
  });
  enterStep(state.step);
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
      return 'drill-ready';
    case 'review':
      return state.drill ? 'review' : 'review-no-drill';
  }
}

export function enterStep(step: StepId): void {
  set({ step, asking: null });
  say(stepLine(step, currentBand()));
}

/** 잘못 눌렀을 때 하는 말. 다음에 맞게 누르면 단계 안내로 돌아간다 */
const MISTAKE_LINES = new Set<LineId>([
  'draw-need-cell',
  'door-window-inside',
  'mark-need-inside',
  'mark-need-outside',
  'route-no-way',
]);

/** 지도 고치기. merge 면 되돌리기 한 번에 함께 묶인다 */
export function commit(plan: Plan, opts: { merge?: boolean } = {}): void {
  if (plan === state.plan) return;
  const past = opts.merge ? state.past : [...state.past, state.plan].slice(-60);
  const line = MISTAKE_LINES.has(state.line) ? stepLine(state.step, currentBand()) : state.line;
  set({ plan, past, line });
}

export function undo(): void {
  const prev = state.past[state.past.length - 1];
  if (!prev) return;
  set({ plan: prev, past: state.past.slice(0, -1) });
}

export function chooseTemplate(id: string | null): void {
  set({ templateId: id });
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

/** 「도와줘」 — 지금 단계의 빈 곳을 무난한 값으로 채운다 */
export function helpStep(step: StepId = state.step): void {
  const band = currentBand();
  const plan = state.plan;
  let next = plan;
  switch (step) {
    case 'draw': {
      const t = templateById(state.templateId) ?? templatesFor(band)[0];
      if (t) {
        next = addEdges(plan, [...segEdges(t.outer), ...segEdges(t.inner)]);
        if (!state.templateId) set({ templateId: t.id });
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
  commit(next);
  set({ asking: null });
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
  const band = currentBand();
  const info = BANDS[band];
  set({
    plan: emptyPlan(info.cols, info.rows),
    templateId: defaultTemplateId(band),
    past: [],
    drill: null,
  });
  enterStep('draw');
}
