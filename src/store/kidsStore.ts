/**
 * 어린이 화면 상태 — docs/DESIGN-v1.1-changes.md §3 · §4 · §5.
 *
 *   편집(edit) → 게임(game) → 리포트(report) → 다시 하기 / 지도 고치기
 *
 * 평면도 상태를 React UI 와 게임 틱이 함께 구독하므로 zustand 를 쓴다.
 * 실행 취소는 30단계(FR-1.6), 자동 저장은 600ms 뒤에 한 번 한다(FR-6.5).
 */
'use client';

import { create } from 'zustand';
import type {
  Block,
  BlockId,
  Cell,
  EvacRoute,
  FloorPlan,
  HazardKindId,
  LayerId,
  OpeningKind,
  PointKind,
  RoomKind,
  RoutePair,
  RouteSet,
  RouteSlot,
  Side,
} from '../types/plan';
import { emptyFloorPlan, emptyRoute, isOpening, isRoom, routeKey, splitKey } from '../types/plan';
import type { GuideBubble, GuideTrigger } from '../types/guide';
import type { Report } from '../types/report';
import type { RuleReport, RuleResult } from '../types/rules';
import type { GuardianMission, SaveFile, SaveProgress, UserProfile } from '../types/save';
import { SCHEMA_VERSION, defaultProfile, emptyProgress } from '../types/save';
import type { Direction } from '../types/game';

import { buildGraph, startNodeId } from '../core/graph/build';
import { findEscape } from '../core/graph/pathfind';
import { evaluate } from '../core/rules/engine';
import { RULES } from '../core/rules/definitions';
import { selectGuide, toBubble } from '../core/guide/runner';
import { buildReport, highlightOf } from '../core/report/build';
import { type Game, finishGame, pauseGame, quitGame, resumeGame, startGame, tick as gameTick } from '../core/game/loop';
import { closeDoorBehind, move, togglePosture, touchDoor } from '../core/game/player';
import { GUIDE_RULES, REPORT_ITEMS, RULE_MESSAGES, TEMPLATES, blockDef, fuelOf, isVerified, presetById, templateName } from '../content';
import { bumpBlockIdSeq, canPlaceRoom, newBlockId, openingAt, pointOccupied, roomAt } from '../core/grid/occupancy';
import { eul } from '../core/josa';
import { clampRect, dedupeRun, isAdjacent, rectCentroid, sameCell } from '../core/grid/geometry';
import { loadKids, saveKids } from './storage';
import { playDoor, playTap, setSoundEnabled } from '../ui/sound';

const HISTORY = 30;
const AUTOSAVE_MS = 600;

/** 팔레트에서 고른 것 */
export interface Armed {
  category: 'room' | 'opening' | 'safety' | 'furniture' | 'hazard' | 'marker';
  id: string;
}

export type KidsTool = 'place' | 'select' | 'route' | 'erase';
export type Mode = 'edit' | 'game' | 'report';
export type Step = 'template' | 'mySpot' | 'meeting' | 'ready' | 'edit' | 'route' | 'routeAlt' | 'game' | 'report';

export interface Highlight {
  cells?: Cell[];
  blockIds?: BlockId[];
  paletteItem?: string;
}

interface Snapshot {
  plan: FloorPlan;
  routes: RouteSet;
}

export interface KidsState {
  ready: boolean;
  profile: UserProfile;
  plan: FloorPlan;
  routes: RouteSet;
  /** 기본판은 'fire'. 확장 프리셋이 늘면 탭이 생긴다 */
  hazardId: HazardKindId;
  routeSlot: RouteSlot;
  mode: Mode;
  step: Step;
  tool: KidsTool;
  armed: Armed | null;
  selection: BlockId | null;
  /**
   * 고른 것 전부. 하나만 골랐어도 여기 담긴다 — 늘 `multi[0] === selection` 이다.
   * 여럿 고르기는 Ctrl+누르기와 빈 곳 끌기로 한다 (설계서 v1.5 §1).
   */
  multi: BlockId[];
  /** 지금 그리는 중인 경로 셀 */
  drafting: Cell[] | null;
  layer: LayerId;
  highlight: Highlight | null;

  bubble: GuideBubble | null;
  /** 대사 id → 마지막 발동 시각(ms). 세션에만 둔다 */
  guideHistory: Record<string, number>;
  /** 펼쳐 본 학습 카드 */
  seenCardIds: string[];
  /** 한 번이라도 놓아 본 블록 종류 — 처음 놓았을 때만 말한다 */
  placedKinds: string[];
  missions: GuardianMission[];
  progress: SaveProgress;

  game: Game | null;
  report: Report | null;
  /** 도전 모드(시간제한). 기본은 연습 모드 (FR-8.2) */
  timed: boolean;

  past: Snapshot[];
  future: Snapshot[];
  savedAt: number | null;
  saveError: boolean;
  toast: { text: string; kind: 'info' | 'warn' } | null;
  onboarded: boolean;
  createdAt: string;

  /** 오른쪽 사용법 상자를 펴 두었는가 */
  howTo: boolean;

  /** 조작 횟수·시작 시각 — 개발 모드 측정 (FR-7.11) */
  ops: number;
  startedAt: number;
  lastOpAt: number;
}

export interface KidsActions {
  boot: () => void;
  setProfile: (patch: Partial<UserProfile>) => void;
  /** lowFloor 는 침수 확장판에서만 쓴다. 기본판은 묻지 않고 false 로 둔다 (설계서 v1.6 §2) */
  finishOnboarding: (lowFloor: boolean) => void;
  setStep: (step: Step) => void;
  setMode: (mode: Mode) => void;

  setTool: (t: KidsTool) => void;
  arm: (a: Armed | null) => void;
  select: (id: BlockId | null) => void;
  /** Ctrl+누르기 — 있으면 빼고 없으면 더한다 */
  toggleSelect: (id: BlockId) => void;
  /** 끌어서 두른 것들을 한꺼번에 고른다 */
  selectMany: (ids: BlockId[]) => void;
  /** 고른 것 전부를 함께 옮긴다. 하나라도 갈 수 없으면 아무것도 옮기지 않는다 */
  moveSelection: (dx: number, dy: number) => void;
  setHighlight: (h: Highlight | null) => void;
  setRouteSlot: (slot: RouteSlot) => void;
  setTimed: (on: boolean) => void;
  setHowTo: (on: boolean) => void;

  loadTemplate: (id: string) => void;
  /** 표준 크기로 즉시 놓는다 (FR-7.1). rect 를 주면 끌어 만든 크기 */
  placeRoom: (roomKind: RoomKind, at: Cell, rect?: { x: number; y: number; w: number; h: number }) => boolean;
  placeOpening: (kind: OpeningKind, cell: Cell, side: Side) => boolean;
  placePoint: (category: Armed['category'], subKind: PointKind, cell: Cell) => boolean;
  moveBlock: (id: BlockId, cell: Cell) => void;
  moveRoom: (id: BlockId, dx: number, dy: number) => void;
  resizeRoom: (id: BlockId, rect: { x: number; y: number; w: number; h: number }) => void;
  renameRoom: (id: BlockId, label: string) => void;
  /** 개구부의 평소 상태를 뒤집는다 — 열어 둠 ↔ 닫아 둠 (설계서 v1.2 §2.4) */
  toggleOpening: (id: BlockId) => void;
  removeBlock: (id: BlockId) => void;
  /** 온보딩 — 방을 눌러 내 자리를 정한다 */
  pickMyRoom: (cell: Cell) => boolean;
  /** 온보딩 — 만나는 곳을 놓거나 건너뛴다 */
  pickMeeting: (cell: Cell | null) => void;

  startRoute: (cell: Cell) => void;
  extendRoute: (cell: Cell) => void;
  endRoute: () => void;
  clearRoute: (slot?: RouteSlot) => void;

  undo: () => void;
  redo: () => void;
  resetAll: () => void;
  replace: (file: SaveFile) => void;
  toSaveFile: () => SaveFile;

  /** 캐릭터 대사 발동. 말할 것이 있었으면 true */
  fire: (ev: GuideTrigger, params?: Record<string, string>) => boolean;
  help: () => void;
  dismissBubble: () => void;
  markCardSeen: (id: string) => void;
  completeMission: (id: string, done: boolean) => void;
  /** 규칙을 다시 평가해 첫 지적을 말한다 */
  runChecks: (speak?: boolean) => RuleReport[];

  startGameNow: (seed?: number) => void;
  gameTickNow: () => void;
  gameMove: (d: Direction) => void;
  gameToggle: () => void;
  gameTouch: () => void;
  gameCloseDoor: () => void;
  gamePause: () => void;
  gameResume: () => void;
  gameQuit: () => void;
  replay: (sameSeed?: boolean) => void;
  editFromReport: (which: 'plan' | 'route') => void;

  notify: (text: string, kind?: 'info' | 'warn') => void;
  clearToast: () => void;
  countOp: () => void;
}

export type KidsStore = KidsState & KidsActions;

function initialState(): KidsState {
  const now = new Date().toISOString();
  return {
    ready: false,
    profile: defaultProfile(),
    plan: emptyFloorPlan(),
    routes: {},
    hazardId: 'fire',
    routeSlot: 'primary',
    mode: 'edit',
    step: 'template',
    tool: 'select',
    armed: null,
    selection: null,
    multi: [],
    drafting: null,
    layer: 'home',
    highlight: null,
    bubble: null,
    guideHistory: {},
    seenCardIds: [],
    placedKinds: [],
    missions: [],
    progress: emptyProgress(),
    game: null,
    report: null,
    timed: false,
    past: [],
    future: [],
    savedAt: null,
    saveError: false,
    toast: null,
    onboarded: false,
    howTo: true,
    createdAt: now,
    ops: 0,
    startedAt: 0,
    lastOpAt: 0,
  };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** 방에 붙일 자동 이름 — '방 1', '방 2' … (FR-7.4) */
function autoLabel(plan: FloorPlan, roomKind: RoomKind): string {
  if (roomKind !== 'bedroom') return '';
  const n = plan.blocks.filter((b) => isRoom(b) && b.roomKind === 'bedroom').length + 1;
  return `방 ${n}`;
}

export const useKids = create<KidsStore>()((set, get) => {
  const snapshot = (): Snapshot => ({ plan: get().plan, routes: get().routes });

  const scheduleSave = (): void => {
    if (typeof window === 'undefined') return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const ok = saveKids(get().toSaveFile());
      set({ savedAt: ok ? Date.now() : get().savedAt, saveError: !ok });
    }, AUTOSAVE_MS);
  };

  /** 이력에 남기며 바꾼다 */
  const commit = (patch: Partial<Snapshot>): void => {
    const past = get().past.concat([snapshot()]).slice(-HISTORY);
    set({ ...patch, past, future: [] });
    scheduleSave();
  };

  /** 처음 놓는 종류면 캐릭터가 한마디 한다 */
  const firstPlaced = (kind: string): void => {
    const s = get();
    if (s.placedKinds.includes(kind)) return;
    set({ placedKinds: s.placedKinds.concat([kind]) });
    get().fire({ on: 'blockPlaced', blockKind: kind });
  };

  const addBlock = (b: Block): void => {
    const hadRoom = get().plan.blocks.some(isRoom);
    commit({ plan: { ...get().plan, blocks: get().plan.blocks.concat([b]) } });
    firstPlaced(isRoom(b) ? b.roomKind : b.kind === 'opening' ? b.openingKind : b.subKind);
    get().countOp();
    playTap(get().profile.soundOn);
    /*
     * 빈 도면에서 시작했으면 온보딩이 mySpot 을 건너뛰고 여기서 기다린다 (설계서 v1.2 §1.3).
     * 첫 방이 놓이는 순간 "네 방은 어디야?"로 넘어간다.
     */
    if (!hadRoom && isRoom(b) && get().step === 'edit' && !get().progress.completedSteps.includes('mySpot')) {
      get().setStep('mySpot');
    }
  };

  const pairOf = (): RoutePair => get().routes[get().hazardId] ?? {};

  const setPair = (pair: RoutePair): void => {
    commit({ routes: { ...get().routes, [get().hazardId]: pair } });
  };

  const currentRoute = (): EvacRoute | undefined => pairOf()[get().routeSlot];

  const drainEvents = (g: Game): void => {
    for (const ev of g.state.events.splice(0)) {
      if (get().fire({ on: 'gameEvent', event: ev })) break;
    }
  };

  /** 게임이 끝났다 — 로그를 마무리하고 리포트를 만든다 */
  const finish = (): void => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const pair = s.routes[s.hazardId] ?? {};
    const log = finishGame(g, pair.primary, s.profile);
    const attemptNo = s.progress.attempts + 1;
    const report = buildReport({
      ruleReports: ruleReportsFor(s),
      playLog: log,
      profile: s.profile,
      attemptNo,
      defs: RULES,
      messages: RULE_MESSAGES.rules,
      items: REPORT_ITEMS,
      isVerified,
      unguaranteed: g.unguaranteed,
    });
    /*
     * 성공했으면 걸린 시간을 남긴다. 등수가 아니라 자기 기록이다 (설계서 v1.2 §4.1).
     * 리포트는 이 값으로 "지난번보다 몇 초 빨랐어"만 말한다.
     */
    const best =
      log.outcome === 'success'
        ? Math.min(s.progress.bestTicks ?? Number.POSITIVE_INFINITY, g.state.tick)
        : s.progress.bestTicks;
    const progress: SaveProgress = {
      ...s.progress,
      attempts: attemptNo,
      successes: s.progress.successes + (log.outcome === 'success' ? 1 : 0),
      earnedGoodIds: Array.from(new Set(s.progress.earnedGoodIds.concat(report.good.map((i) => i.id)))),
      pendingFixIds: report.fix.map((i) => i.id),
      bestTicks: Number.isFinite(best) ? best : undefined,
    };
    set({ report, progress, mode: 'report', game: { ...g } });
    /* 시도 기록은 바로 남긴다 — 결과 화면에서 창을 닫아도 잃지 않게 */
    const ok = saveKids(get().toSaveFile());
    set({ savedAt: ok ? Date.now() : get().savedAt, saveError: !ok });
    get().setStep('report');
    get().fire({ on: 'gameEnd', outcome: log.outcome });
  };

  return {
    ...initialState(),

    /* -------------------------------------------------- 시작 */

    boot: () => {
      const saved = loadKids();
      const now = Date.now();
      /*
       * 말풍선을 띄우기 전에 소리부터 맞춘다.
       * 뒤에 맞추면 첫 대사가 이미 소리를 내 버려, 껐던 아이가 앱을 열자마자 듣는다.
       */
      setSoundEnabled(saved ? saved.profile.soundOn : defaultProfile().soundOn);
      if (saved && saved.plan.blocks.length > 0) {
        bumpBlockIdSeq(saved.plan);
        const seen = saved.progress.completedSteps.filter((s) => s.startsWith('card:')).map((s) => s.slice(5));
        const placed = saved.progress.completedSteps.filter((s) => s.startsWith('placed:')).map((s) => s.slice(7));
        set({
          ready: true,
          profile: saved.profile,
          plan: saved.plan,
          routes: saved.routes,
          progress: saved.progress,
          missions: saved.progress.guardianMissions,
          seenCardIds: seen,
          placedKinds: placed,
          createdAt: saved.createdAt,
          onboarded: true,
          step: 'edit',
          startedAt: now,
          lastOpAt: now,
        });
        get().notify('그리던 지도를 다시 불러왔다.');
        get().fire({ on: 'stepEnter', step: 'edit' });
      } else {
        set({ ready: true, startedAt: now, lastOpAt: now, step: 'template' });
        get().fire({ on: 'stepEnter', step: 'template' });
      }
    },

    setProfile: (patch) => {
      set({ profile: { ...get().profile, ...patch } });
      /* 켬/끔은 저장뿐 아니라 소리 모듈에도 곧바로 알린다 (설계서 v1.6 §3) */
      if (patch.soundOn !== undefined) {
        setSoundEnabled(patch.soundOn);
        /* 끄자마자 창을 닫으면 600ms 뒤의 저장이 날아간다. 켬/끔만은 즉시 저장한다 */
        saveKids(get().toSaveFile());
        set({ savedAt: Date.now() });
        return;
      }
      scheduleSave();
    },

    finishOnboarding: (lowFloor) => {
      set({ profile: { ...get().profile, lowFloor }, onboarded: true });
      scheduleSave();
      get().countOp();
      /*
       * 빈 도면으로 시작했으면 누를 방이 없다. mySpot 으로 보내면 "방 안을 눌러 줘"만
       * 되풀이되고 팔레트도 먹지 않는다 (설계서 v1.2 §1.3). 먼저 방을 놓게 한다.
       */
      if (!get().plan.blocks.some(isRoom)) {
        get().setStep('edit');
        get().fire({ on: 'helpRequested', step: 'edit' });
        return;
      }
      get().setStep('mySpot');
    },

    setStep: (step) => {
      const s = get();
      const done = s.progress.completedSteps.includes(step) ? s.progress.completedSteps : s.progress.completedSteps.concat([step]);
      set({ step, progress: { ...s.progress, completedSteps: done } });
      /* 단계마다 알맞은 도구 */
      if (step === 'route' || step === 'routeAlt') set({ tool: 'route', armed: null, routeSlot: step === 'routeAlt' ? 'alternate' : 'primary' });
      else if (step === 'mySpot' || step === 'meeting') set({ tool: 'select', armed: null });
      else if (step === 'edit' || step === 'ready') set({ tool: 'select', armed: null });
      get().fire({ on: 'stepEnter', step });
    },

    setMode: (mode) => set({ mode }),

    setHowTo: (on) => set({ howTo: on }),

    /* -------------------------------------------------- 화면 */

    setTool: (tool) =>
      set({ tool, drafting: tool === 'route' ? get().drafting : null, armed: tool === 'place' ? get().armed : null }),

    arm: (armed) => set({ armed, tool: armed ? 'place' : 'select', selection: null, multi: [] }),

    select: (selection) => set({ selection, multi: selection ? [selection] : [] }),

    toggleSelect: (id) => {
      const multi = get().multi;
      const next = multi.includes(id) ? multi.filter((x) => x !== id) : multi.concat(id);
      set({ multi: next, selection: next[0] ?? null });
    },

    selectMany: (ids) => set({ multi: ids, selection: ids[0] ?? null }),

    /**
     * 고른 것 전부를 함께 옮긴다.
     * 방은 붙어 있는 문·창·물건까지 데려간다. 한 칸이라도 겹치거나 도면 밖으로 나가면
     * **아무것도 옮기지 않는다** — 반만 옮겨 놓으면 아이가 되돌리기 어렵다.
     */
    moveSelection: (dx, dy) => {
      if (dx === 0 && dy === 0) return;
      const { plan, multi } = get();
      if (multi.length === 0) return;
      const chosen = new Set(multi);
      const rooms = plan.blocks.filter((b) => chosen.has(b.id) && isRoom(b));

      /* 고른 방 안에 있는 것은 방을 따라간다. 따로 또 옮기지 않는다 */
      const carried = new Set<BlockId>();
      for (const r of rooms) {
        if (!isRoom(r)) continue;
        for (const b of plan.blocks) {
          if (isRoom(b)) continue;
          const c = b.cell;
          if (c.x >= r.rect.x && c.x < r.rect.x + r.rect.w && c.y >= r.rect.y && c.y < r.rect.y + r.rect.h) carried.add(b.id);
        }
      }

      const moving = new Set<BlockId>([...chosen, ...carried]);

      /* 옮긴 뒤의 도면을 미리 만들어 놓고 한꺼번에 따져 본다 */
      const nextBlocks = plan.blocks.map((b) => {
        if (!moving.has(b.id)) return b;
        if (isRoom(b)) return { ...b, rect: { ...b.rect, x: b.rect.x + dx, y: b.rect.y + dy } };
        return { ...b, cell: { x: b.cell.x + dx, y: b.cell.y + dy } };
      });

      /*
       * 겹침은 옮긴 뒤의 도면끼리 곧바로 따진다.
       * canPlaceRoom 은 한 번에 방 하나만 비켜 줄 수 있어서, 여럿이 함께 움직이면
       * 서로를 장애물로 보고 늘 막는다. 여기서는 다 옮겨 놓고 나서 본다.
       */
      const g = plan.grid;
      const nextRooms = nextBlocks.filter(isRoom);
      for (const b of nextBlocks) {
        if (!moving.has(b.id)) continue;
        if (isRoom(b)) {
          if (b.rect.x < 0 || b.rect.y < 0 || b.rect.x + b.rect.w > g.width || b.rect.y + b.rect.h > g.height) {
            get().notify('도면 밖으로는 못 나간다.', 'warn');
            return;
          }
          const hit = nextRooms.some(
            (o) =>
              o.id !== b.id &&
              b.rect.x < o.rect.x + o.rect.w &&
              o.rect.x < b.rect.x + b.rect.w &&
              b.rect.y < o.rect.y + o.rect.h &&
              o.rect.y < b.rect.y + b.rect.h,
          );
          if (hit) {
            get().notify('그쪽으로는 옮길 수 없다. 다른 방과 겹친다.', 'warn');
            return;
          }
        } else if (b.cell.x < 0 || b.cell.y < 0 || b.cell.x >= g.width || b.cell.y >= g.height) {
          get().notify('도면 밖으로는 못 나간다.', 'warn');
          return;
        }
      }

      commit({ plan: { ...plan, blocks: nextBlocks } });
      get().countOp();
    },

    setHighlight: (highlight) => set({ highlight }),

    setRouteSlot: (routeSlot) => set({ routeSlot, drafting: null }),

    setTimed: (timed) => set({ timed }),

    notify: (text, kind = 'info') => set({ toast: { text, kind } }),

    clearToast: () => set({ toast: null }),

    countOp: () => set({ ops: get().ops + 1, lastOpAt: Date.now() }),

    /* -------------------------------------------------- 평면 */

    loadTemplate: (id) => {
      const t = TEMPLATES.find((x) => x.id === id);
      if (!t) return;
      const plan: FloorPlan = JSON.parse(JSON.stringify(t.plan)) as FloorPlan;
      bumpBlockIdSeq(plan);
      commit({ plan, routes: {} });
      set({ selection: null, multi: [], drafting: null, armed: null, tool: 'select', report: null, game: null, mode: 'edit' });
      get().countOp();
      get().notify(`${eul(templateName(t, get().profile.gradeMode))} 불러왔다. 우리 집에 맞게 고쳐 보자.`);
      /* 화재 한 종만 다루므로 1층·반지하를 묻지 않는다 (설계서 v1.6 §2) */
      if (!get().onboarded) get().finishOnboarding(false);
    },

    placeRoom: (roomKind, at, rect) => {
      const plan = get().plan;
      const def = blockDef(roomKind);
      const size = def?.size ?? { w: 4, h: 4 };
      const want = rect ?? { x: at.x, y: at.y, w: size.w, h: size.h };
      const r = clampRect(plan.grid, want);
      if (!canPlaceRoom(plan, r)) {
        get().notify('여기는 다른 방과 겹친다. 빈 곳을 눌러 보자.', 'warn');
        return false;
      }
      addBlock({ kind: 'room', id: newBlockId('r'), layer: get().layer, roomKind, rect: r, label: autoLabel(plan, roomKind) });
      return true;
    },

    placeOpening: (kind, cell, side) => {
      const plan = get().plan;
      const existing = openingAt(plan, cell, side);
      const blocks = existing ? plan.blocks.filter((b) => b.id !== existing) : plan.blocks;
      const b: Block = {
        kind: 'opening',
        id: newBlockId('o'),
        layer: get().layer,
        openingKind: kind,
        cell,
        side,
        closedByDefault: kind !== 'inner_door',
      };
      commit({ plan: { ...plan, blocks: blocks.concat([b]) } });
      firstPlaced(kind);
      get().countOp();
      return true;
    },

    placePoint: (category, subKind, cell) => {
      const plan = get().plan;
      if (pointOccupied(plan, cell, subKind)) {
        get().notify('여기에는 이미 같은 것이 있다.', 'warn');
        return false;
      }
      /* 내 자리와 만나는 곳은 하나뿐이다 — 새로 놓으면 옮긴다 */
      const single = subKind === 'my_spot' || subKind === 'meeting_point';
      const blocks = single
        ? plan.blocks.filter((b) => b.kind === 'room' || b.kind === 'opening' || b.subKind !== subKind)
        : plan.blocks;
      const b: Block = {
        kind: category as 'safety' | 'furniture' | 'hazard' | 'marker',
        id: newBlockId('p'),
        layer: get().layer,
        subKind,
        cell,
        rotation: 0,
      };
      commit({ plan: { ...plan, blocks: blocks.concat([b]) } });
      firstPlaced(subKind);
      get().countOp();
      return true;
    },

    moveBlock: (id, cell) => {
      const plan = get().plan;
      const b = plan.blocks.find((x) => x.id === id);
      if (!b || isRoom(b)) return;
      commit({ plan: { ...plan, blocks: plan.blocks.map((x) => (x.id === id ? { ...x, cell } : x)) } });
      get().countOp();
    },

    moveRoom: (id, dx, dy) => {
      const plan = get().plan;
      const room = plan.blocks.find((b) => b.id === id);
      if (!room || !isRoom(room) || (dx === 0 && dy === 0)) return;
      const rect = { ...room.rect, x: room.rect.x + dx, y: room.rect.y + dy };
      if (!canPlaceRoom(plan, rect, id)) {
        get().notify('그쪽으로는 옮길 수 없다. 다른 방과 겹친다.', 'warn');
        return;
      }
      const inside = (c: Cell): boolean =>
        c.x >= room.rect.x && c.x < room.rect.x + room.rect.w && c.y >= room.rect.y && c.y < room.rect.y + room.rect.h;
      /* 방에 붙은 문·창·물건도 함께 간다 (FR-7.7) */
      commit({
        plan: {
          ...plan,
          blocks: plan.blocks.map((b) => {
            if (b.id === id && isRoom(b)) return { ...b, rect };
            if (!isRoom(b) && inside(b.cell)) return { ...b, cell: { x: b.cell.x + dx, y: b.cell.y + dy } };
            return b;
          }),
        },
      });
      get().countOp();
    },

    resizeRoom: (id, rect) => {
      const plan = get().plan;
      const room = plan.blocks.find((b) => b.id === id);
      if (!room || !isRoom(room)) return;
      const r = clampRect(plan.grid, rect);
      if (r.w < 2 || r.h < 2) return;
      if (!canPlaceRoom(plan, r, id)) return;
      const wasInside = (c: Cell): boolean =>
        c.x >= room.rect.x && c.x < room.rect.x + room.rect.w && c.y >= room.rect.y && c.y < room.rect.y + room.rect.h;
      const nowInside = (c: Cell): boolean => c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h;
      let dropped = 0;
      const blocks = plan.blocks.filter((b) => {
        if (b.id === id || isRoom(b)) return true;
        if (!wasInside(b.cell)) return true;
        if (!nowInside(b.cell)) {
          dropped += 1;
          return false;
        }
        if (b.kind === 'opening') {
          const across = {
            x: b.cell.x + (b.side === 'E' ? 1 : b.side === 'W' ? -1 : 0),
            y: b.cell.y + (b.side === 'S' ? 1 : b.side === 'N' ? -1 : 0),
          };
          if (nowInside(across)) {
            dropped += 1;
            return false;
          }
        }
        return true;
      });
      commit({ plan: { ...plan, blocks: blocks.map((b) => (b.id === id && isRoom(b) ? { ...b, rect: r } : b)) } });
      if (dropped) get().notify(`방 크기를 바꾸면서 벽에 붙어 있던 ${dropped}개를 지웠다. 되돌리기로 되살릴 수 있다.`, 'warn');
      get().countOp();
    },

    renameRoom: (id, label) => {
      const plan = get().plan;
      commit({ plan: { ...plan, blocks: plan.blocks.map((b) => (b.id === id && isRoom(b) ? { ...b, label } : b)) } });
    },

    toggleOpening: (id) => {
      const plan = get().plan;
      const target = plan.blocks.find((b) => b.id === id);
      if (!target || !isOpening(target)) return;
      commit({
        plan: {
          ...plan,
          blocks: plan.blocks.map((b) => (b.id === id && isOpening(b) ? { ...b, closedByDefault: !b.closedByDefault } : b)),
        },
      });
      get().countOp();
      playDoor(get().profile.soundOn, !target.closedByDefault);
      get().notify(target.closedByDefault ? '평소 열어 두는 것으로 바꿨다.' : '평소 닫아 두는 것으로 바꿨다.');
    },

    removeBlock: (id) => {
      const plan = get().plan;
      const b = plan.blocks.find((x) => x.id === id);
      if (!b) return;
      let blocks = plan.blocks.filter((x) => x.id !== id);
      if (isRoom(b)) {
        const inside = (c: Cell): boolean =>
          c.x >= b.rect.x && c.x < b.rect.x + b.rect.w && c.y >= b.rect.y && c.y < b.rect.y + b.rect.h;
        const gone = blocks.filter((x) => !isRoom(x) && inside(x.cell));
        if (gone.length) {
          blocks = blocks.filter((x) => !gone.includes(x));
          get().notify(`방을 지우면서 그 안의 ${gone.length}개도 함께 지웠다. 되돌리려면 되돌리기를 누르자.`, 'warn');
        }
      }
      commit({ plan: { ...plan, blocks } });
      set({ selection: null, multi: [] });
      get().countOp();
    },

    pickMyRoom: (cell) => {
      const room = roomAt(get().plan, cell);
      if (!room) {
        get().notify('방 안을 눌러 줘.', 'warn');
        return false;
      }
      get().placePoint('marker', 'my_spot', cell);
      get().setStep('meeting');
      return true;
    },

    pickMeeting: (cell) => {
      if (cell) {
        if (roomAt(get().plan, cell)) {
          get().notify('만나는 곳은 집 밖 빈 곳에 놓자.', 'warn');
          return;
        }
        get().placePoint('marker', 'meeting_point', cell);
      } else {
        get().countOp();
      }
      get().setStep('ready');
    },

    /* -------------------------------------------------- 경로 */

    startRoute: (cell) => set({ drafting: [cell], tool: 'route' }),

    extendRoute: (cell) => {
      const d = get().drafting;
      if (!d) return;
      const last = d[d.length - 1];
      if (sameCell(last, cell)) return;
      /* 뒤로 되짚으면 지운다 — 아이가 실수를 스스로 되돌릴 수 있게 */
      if (d.length >= 2 && sameCell(d[d.length - 2], cell)) {
        set({ drafting: d.slice(0, -1) });
        return;
      }
      if (!isAdjacent(last, cell)) return;
      set({ drafting: dedupeRun(d.concat([cell])) });
    },

    endRoute: () => {
      const d = get().drafting;
      if (!d || d.length < 2) {
        set({ drafting: null });
        return;
      }
      const s = get();
      const prev = currentRoute();
      const r = emptyRoute(s.hazardId, s.routeSlot, d[0], d);
      r.primaryShelter = prev?.primaryShelter;
      setPair({ ...pairOf(), [s.routeSlot]: r });
      set({ drafting: null });
      get().countOp();
      get().runChecks(true);
    },

    clearRoute: (slot) => {
      const which = slot ?? get().routeSlot;
      const pair = { ...pairOf() };
      delete pair[which];
      setPair(pair);
      set({ drafting: null });
      get().countOp();
    },

    /* -------------------------------------------------- 이력 */

    undo: () => {
      const { past, future } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      set({ ...prev, past: past.slice(0, -1), future: [snapshot()].concat(future).slice(0, HISTORY), selection: null, multi: [], drafting: null });
      scheduleSave();
      get().countOp();
    },

    redo: () => {
      const { past, future } = get();
      if (!future.length) return;
      const next = future[0];
      set({ ...next, past: past.concat([snapshot()]).slice(-HISTORY), future: future.slice(1), selection: null, multi: [], drafting: null });
      scheduleSave();
      get().countOp();
    },

    resetAll: () => {
      commit({ plan: emptyFloorPlan(), routes: {} });
      set({ selection: null, multi: [], drafting: null, armed: null, highlight: null, missions: [], report: null, game: null, mode: 'edit', placedKinds: [] });
      get().notify('처음부터 다시 시작한다. 되돌리기를 누르면 되살릴 수 있다.');
    },

    replace: (file) => {
      bumpBlockIdSeq(file.plan);
      commit({ plan: file.plan, routes: file.routes });
      set({
        profile: file.profile,
        progress: file.progress,
        missions: file.progress.guardianMissions,
        seenCardIds: file.progress.completedSteps.filter((s) => s.startsWith('card:')).map((s) => s.slice(5)),
        selection: null,
        multi: [],
        drafting: null,
        onboarded: true,
        mode: 'edit',
        report: null,
        game: null,
        step: 'edit',
      });
      get().notify('저장한 지도를 불러왔다.');
    },

    toSaveFile: () => {
      const s = get();
      const steps = s.progress.completedSteps.filter((x) => !x.startsWith('card:') && !x.startsWith('placed:'));
      return {
        schemaVersion: SCHEMA_VERSION,
        createdAt: s.createdAt,
        updatedAt: new Date().toISOString(),
        profile: s.profile,
        plan: s.plan,
        routes: s.routes,
        progress: {
          ...s.progress,
          guardianMissions: s.missions,
          completedSteps: steps.concat(s.seenCardIds.map((c) => `card:${c}`), s.placedKinds.map((k) => `placed:${k}`)),
        },
      };
    },

    /* -------------------------------------------------- 캐릭터 가이드 */

    fire: (ev, params = {}) => {
      const s = get();
      const now = Date.now();
      const rule = selectGuide(GUIDE_RULES, ev, s.guideHistory, now);
      if (!rule) return false;
      const bubble = toBubble(rule, s.profile.gradeMode, !isVerified(rule.sourceIds), now, params);
      set({
        bubble,
        guideHistory: { ...s.guideHistory, [rule.id]: now },
        highlight: rule.highlight ? { ...rule.highlight } : s.highlight,
      });
      return true;
    },

    help: () => {
      const s = get();
      /* 도움 요청은 늘 답한다 — 쿨다운을 무시한다 (FR-9.7 · P3) */
      const rule = selectGuide(GUIDE_RULES, { on: 'helpRequested', step: s.step }, {}, Date.now());
      if (!rule) return;
      const now = Date.now();
      set({
        bubble: toBubble(rule, s.profile.gradeMode, !isVerified(rule.sourceIds), now),
        guideHistory: { ...s.guideHistory, [rule.id]: now },
        highlight: rule.highlight ? { ...rule.highlight } : s.highlight,
      });
      get().countOp();
    },

    /* 말풍선을 닫으면 팔레트 강조도 끈다. 도면 위 강조(칸·블록)는 고칠 때까지 남긴다 */
    dismissBubble: () => {
      const h = get().highlight;
      set({ bubble: null, highlight: h && (h.cells?.length || h.blockIds?.length) ? { cells: h.cells, blockIds: h.blockIds } : null });
    },

    markCardSeen: (id) => {
      const s = get();
      if (s.seenCardIds.includes(id)) return;
      set({ seenCardIds: s.seenCardIds.concat([id]) });
      scheduleSave();
    },

    completeMission: (id, done) => {
      const s = get();
      const has = s.missions.some((m) => m.id === id);
      const missions = has ? s.missions.map((m) => (m.id === id ? { ...m, done } : m)) : s.missions.concat([{ id, done }]);
      set({ missions });
      scheduleSave();
    },

    runChecks: (speak = false) => {
      const s = get();
      const reports = ruleReportsFor(s);
      if (speak) {
        const issue = firstIssue(reports);
        if (issue) {
          set({ highlight: issue.targets });
          get().fire({ on: 'ruleFail', ruleId: issue.ruleId }, issue.params);
        } else {
          const passed = reports.flatMap((r) => r.passed).find((p) => p.ruleId === 'RULE-F-05' || p.ruleId === 'RULE-C-06');
          if (passed) get().fire({ on: 'rulePass', ruleId: passed.ruleId }, passed.params);
          set({ highlight: null });
        }
      }
      return reports;
    },

    /* -------------------------------------------------- 게임 */

    startGameNow: (seed) => {
      const s = get();
      const preset = presetById(s.hazardId);
      if (!preset || s.plan.blocks.length === 0) return;
      const graph = buildGraph(s.plan);
      const startId = startNodeId(s.plan, graph);
      if (!startId) {
        get().notify('먼저 방을 하나 만들자.', 'warn');
        return;
      }
      const startCell = myCell(s.plan) ?? graph.nodeById[startId].centroid ?? { x: 0, y: 0 };
      const game = startGame({
        plan: s.plan,
        graph,
        profile: s.profile,
        config: { hazardId: s.hazardId, seed: seed ?? Math.floor(Math.random() * 1e9), timed: s.timed, gradeMode: s.profile.gradeMode },
        preset,
        startCell,
        fuelOf,
      });
      set({ game, mode: 'game', report: null, drafting: null, armed: null, selection: null, multi: [], highlight: null, bubble: null });
      get().setStep('game');
      get().fire({ on: 'gameStart' });
      get().countOp();
    },

    gameTickNow: () => {
      const g = get().game;
      if (!g || g.state.status !== 'running') return;
      gameTick(g);
      set({ game: { ...g } });
      drainEvents(g);
      const status: string = g.state.status;
      if (status === 'success' || status === 'failed') finish();
    },

    gameMove: (d) => {
      const g = get().game;
      if (!g) return;
      if (move(g.state, g.ctx, d)) {
        set({ game: { ...g } });
        drainEvents(g);
        get().gameTickNow();
      }
    },

    gameToggle: () => {
      const g = get().game;
      if (!g) return;
      togglePosture(g.state);
      set({ game: { ...g } });
      drainEvents(g);
    },

    gameTouch: () => {
      const g = get().game;
      if (!g) return;
      const r = touchDoor(g.state, g.ctx);
      set({ game: { ...g } });
      if (!r) {
        get().notify('옆에 만져 볼 문이 없다.');
        return;
      }
      drainEvents(g);
    },

    gameCloseDoor: () => {
      const g = get().game;
      if (!g) return;
      if (closeDoorBehind(g.state)) {
        set({ game: { ...g } });
        drainEvents(g);
      }
    },

    gamePause: () => {
      const g = get().game;
      if (!g) return;
      pauseGame(g.state);
      set({ game: { ...g } });
    },

    gameResume: () => {
      const g = get().game;
      if (!g) return;
      resumeGame(g.state);
      set({ game: { ...g } });
    },

    gameQuit: () => {
      const g = get().game;
      if (!g) return;
      quitGame(g.state);
      set({ game: { ...g } });
      finish();
    },

    replay: (sameSeed = false) => {
      const seed = sameSeed ? get().game?.state.config.seed : undefined;
      get().startGameNow(seed);
    },

    editFromReport: (which) => {
      const s = get();
      const hl = s.report ? highlightOf(s.report) : { cells: [], blockIds: [] };
      set({ mode: 'edit', highlight: hl, game: null });
      get().setStep(which === 'route' ? 'route' : 'edit');
      const first = s.report?.fix.find((f) => f.id.startsWith('RULE-'));
      if (first) get().fire({ on: 'ruleFail', ruleId: first.id });
      get().countOp();
    },
  };
});

/* ------------------------------------------------------------------ */
/* 파생값 — 화면과 테스트가 함께 쓴다                                    */
/* ------------------------------------------------------------------ */

/**
 * 규칙 평가 — 주 경로와 보조 경로를 각각 한 번씩 (docs/DESIGN-v1.1-changes.md §3.2).
 * 경로가 없어도 구조 규칙은 평가한다. ctx.scenario 는 절대 undefined 로 두지 않는다.
 */
export function ruleReportsFor(
  s: Pick<KidsState, 'plan' | 'routes' | 'hazardId' | 'profile' | 'seenCardIds'>,
): RuleReport[] {
  if (s.plan.blocks.length === 0) return [];
  const graph = buildGraph(s.plan);
  const pair = s.routes[s.hazardId] ?? {};
  const make = (slot: RouteSlot, route?: EvacRoute): RuleReport => {
    const key = route?.key ?? routeKey(s.hazardId, slot);
    const { disaster, scenario } = splitKey(key);
    return evaluate(RULES, { plan: s.plan, graph, route, key, disaster, scenario, profile: s.profile, seenCardIds: s.seenCardIds });
  };
  const out = [make('primary', pair.primary)];
  if (pair.alternate) out.push(make('alternate', pair.alternate));
  return out;
}

/** 첫 지적 — 심각도 순 */
export function firstIssue(reports: RuleReport[]): RuleResult | undefined {
  return reports.flatMap((r) => (r.nextIssue ? [r.nextIssue] : []))[0];
}

/** 최단 대피경로 — 아이가 그린 길과 견줘 보여 준다 */
export function suggestedRoute(
  s: Pick<KidsState, 'plan' | 'hazardId' | 'routeSlot' | 'profile' | 'routes'>,
): Cell[] {
  const graph = buildGraph(s.plan);
  const start = startNodeId(s.plan, graph);
  if (!start) return [];
  const key = routeKey(s.hazardId, s.routeSlot);
  const startCell = s.routes[s.hazardId]?.[s.routeSlot]?.startCell ?? myCell(s.plan) ?? undefined;
  const esc = findEscape(graph, start, key, s.profile, startCell);
  return esc.found ? esc.cells : [];
}

/** 내 자리 표시가 있으면 그 칸, 없으면 첫 침실 가운데 */
export function myCell(plan: FloorPlan): Cell | null {
  const spot = plan.blocks.find((b) => b.kind === 'marker' && b.subKind === 'my_spot');
  if (spot && spot.kind !== 'room' && spot.kind !== 'opening') return spot.cell;
  const bed = plan.blocks.find((b) => isRoom(b) && b.roomKind === 'bedroom');
  if (bed && isRoom(bed)) return rectCentroid(bed.rect);
  return null;
}
