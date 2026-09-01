/**
 * 게임 진행 — docs/DESIGN-v1.1-changes.md §3.
 *
 * 시작: 컨텍스트·위험장·발원지·플레이어를 세운다.
 * 틱:   확산 → 특수 규칙 → 플레이어 → 승패.
 * 학년 easy 는 제한 시간 1.5배, 확산 0.7배 (FR-8.5).
 */
import type { Cell, EvacRoute, FloorPlan } from '../../types/plan';
import type { HazardPreset } from '../../types/hazard';
import type { GameConfig, GameState, PracticeDifficulty, ReplayFrame } from '../../types/game';
import type { PlanGraph } from '../../types/graph';
import type { UserProfile } from '../../types/save';
import { goalNodeIds } from '../graph/build';
import { cellKey } from '../grid/geometry';
import { createField, ignite, neighbors4, spread, type FuelLookup } from '../hazard/field';
import { gameGoalCells, goalAt, hasSurvivablePath, passable, pickIgnition } from '../hazard/ignition';
import { buildContext, idx, walkable, type FieldContext } from '../hazard/transfer';
import { emptyLog, finalizeLog } from './playlog';
import { updatePlayer } from './player';

export interface GameSetup {
  plan: FloorPlan;
  graph: PlanGraph;
  profile: UserProfile;
  config: GameConfig;
  preset: HazardPreset;
  startCell: Cell;
  fuelOf: FuelLookup;
}

export interface Game {
  state: GameState;
  ctx: FieldContext;
  goalCells: { cell: Cell; goalId: string }[];
  /** 20회 안에 생존 가능한 판을 찾지 못했다 — 리포트가 RULE-F-04 를 앞세운다 */
  unguaranteed: boolean;
  /**
   * 리플레이용 기록 (설계서 v1.2 §8.5). 매 틱 한 컷씩 쌓는다.
   * 셀당 2바이트라 24×16 평면 300틱이면 230KB 다. 저장하지 않고 메모리에만 둔다.
   */
  frames: ReplayFrame[];
}

/** 지금 판을 한 컷으로 담는다 */
export function snapshotFrame(game: Game): ReplayFrame {
  const { state } = game;
  const n = state.field.length;
  const primary = new Uint8Array(n);
  const secondary = new Uint8Array(n);
  const spent = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const c = state.field[i];
    primary[i] = Math.round(Math.min(1, c.primary) * 255);
    secondary[i] = Math.round(Math.min(1, Math.max(c.secondaryHigh, c.secondaryLow)) * 255);
    spent[i] = c.state === 'spent' ? 1 : 0;
  }
  return {
    tick: state.tick,
    cell: { ...state.player.cell },
    posture: state.player.posture,
    facing: state.player.facing,
    primary,
    secondary,
    spent,
    doorState: { ...state.doorState },
    events: state.events.slice(),
  };
}

/** 학년과 자동 연습 단계에 맞춘 프리셋 사본. 연습 단계는 경쟁 등급이 아니다. */
export function effectivePreset(
  preset: HazardPreset,
  gradeMode: 'easy' | 'normal',
  difficulty: PracticeDifficulty = 'challenge',
): HazardPreset {
  const gradeFactor = gradeMode === 'easy' ? 0.7 : 1;
  const difficultyFactor = difficulty === 'guided' ? 0.65 : difficulty === 'varied' ? 0.84 : 1;
  const exposureFactor = difficulty === 'guided' ? 0.72 : difficulty === 'varied' ? 0.88 : 1;
  const visionFactor = difficulty === 'guided' ? 1.3 : difficulty === 'varied' ? 1.12 : 1;
  const timeFactor = (gradeMode === 'easy' ? 1.5 : 1) * (difficulty === 'guided' ? 1.35 : difficulty === 'varied' ? 1.15 : 1);
  return {
    ...preset,
    primarySpread: preset.primarySpread * gradeFactor * difficultyFactor,
    secondarySpread: preset.secondarySpread * gradeFactor * difficultyFactor,
    primaryGrowth: preset.primaryGrowth * gradeFactor * difficultyFactor,
    secondaryEmission: preset.secondaryEmission * gradeFactor * difficultyFactor,
    exposureRate: preset.exposureRate * exposureFactor,
    visionBase: preset.visionBase * visionFactor,
    timeLimitTicks: Math.round(preset.timeLimitTicks * timeFactor),
  };
}

export function startGame(setup: GameSetup): Game {
  const preset = effectivePreset(setup.preset, setup.config.gradeMode, setup.config.difficulty ?? 'challenge');
  const ctx = buildContext(setup.plan, setup.graph);
  const pick = pickIgnition(setup.plan, ctx, preset, setup.profile, setup.config.seed, setup.startCell, setup.fuelOf);
  const field = createField(setup.plan, ctx, setup.fuelOf);
  ignite(field, ctx, pick.cell);

  /* 문은 closedByDefault 대로 시작한다 */
  const doorState: GameState['doorState'] = {};
  for (const b of setup.plan.blocks) {
    if (b.kind === 'opening' && b.closedByDefault) doorState[b.id] = 'closed';
  }

  const state: GameState = {
    tick: 0,
    config: setup.config,
    preset,
    field,
    doorState,
    doorHeat: {},
    origin: pick.cell,
    player: {
      cell: setup.startCell,
      posture: 'stand',
      facing: 'right',
      exposure: 0,
      visionRadius: preset.visionBase,
      stuckUntil: 0,
    },
    status: 'running',
    events: [],
    log: emptyLog(setup.config.seed, pick.cell),
  };
  state.log.visited.push(setup.startCell);
  const game: Game = {
    state,
    ctx,
    goalCells: gameGoalCells(setup.graph, preset, setup.profile),
    unguaranteed: !pick.guaranteed,
    frames: [],
  };
  game.frames.push(snapshotFrame(game));
  return game;
}

/** 한 틱 */
export function tick(game: Game): void {
  const { state, ctx } = game;
  if (state.status !== 'running') return;
  state.events = [];
  spread(state, ctx);
  updatePlayer(state, ctx);
  state.tick += 1;
  checkStatus(game);
  /* 리플레이 기록 — 끝난 틱까지 담는다 */
  game.frames.push(snapshotFrame(game));
}

/** 갇혔는지는 여덟 틱마다 본다 */
const TRAP_EVERY = 8;

export function checkStatus(game: Game): void {
  const { state, ctx, goalCells } = game;
  if (state.status !== 'running') return;
  const p = state.player;

  const goal = goalAt(goalCells, p.cell);
  if (goal) {
    state.status = 'success';
    state.log.exitVia = goal;
    state.events.push('reachedGoal');
    return;
  }
  if (p.exposure >= 1) {
    state.status = 'failed';
    state.failReason = 'exposure';
    return;
  }
  if (state.field[idx(ctx.grid, p.cell)].primary >= state.preset.ignitionThreshold) {
    state.status = 'failed';
    state.failReason = 'flame';
    return;
  }
  if (state.config.timed && state.tick >= state.preset.timeLimitTicks) {
    state.status = 'failed';
    state.failReason = 'timeout';
    return;
  }
  if (state.tick % TRAP_EVERY === 0 && !hasSurvivablePath(state.field, ctx, p.cell, goalCells, state.preset)) {
    /* 지금 선 칸은 괜찮은데 나갈 길이 모두 막혔다 */
    state.status = 'failed';
    state.failReason = 'trapped';
  }
}

export function pauseGame(state: GameState): void {
  if (state.status === 'running') state.status = 'paused';
}

export function resumeGame(state: GameState): void {
  if (state.status === 'paused') state.status = 'running';
}

/** 그만두기 — 실패로 치되 그때까지의 결과로 리포트를 낸다 (FR-8.6) */
export function quitGame(state: GameState): void {
  if (state.status === 'running' || state.status === 'paused') {
    state.status = 'failed';
    state.failReason = 'quit';
  }
}

/** 끝난 게임의 로그를 마무리한다 */
export function finishGame(game: Game, drawn: EvacRoute | undefined, profile: UserProfile) {
  const primary = new Set(goalNodeIds(game.ctx.graph, game.state.preset.scenarioKeys[0], profile));
  const alt = new Set(
    game.state.preset.scenarioKeys.slice(1).flatMap((k) => goalNodeIds(game.ctx.graph, k, profile)),
  );
  return finalizeLog(game.state, drawn, primary, alt);
}

/** 시야 안의 칸 — 화면이 가림막을 그릴 때 쓴다 */
export function visibleCells(state: GameState, ctx: FieldContext): Set<string> {
  const out = new Set<string>();
  const r = state.player.visionRadius;
  const p = state.player.cell;
  for (let y = 0; y < ctx.grid.height; y += 1) {
    for (let x = 0; x < ctx.grid.width; x += 1) {
      const d = Math.hypot(x - p.x, y - p.y);
      if (d <= r) out.add(cellKey({ x, y }));
    }
  }
  return out;
}

/** 지금 서 있는 칸에서 목표까지 남은 칸 수 — 안내용 */
export function distanceToGoal(game: Game): number | null {
  const { state, ctx, goalCells } = game;
  const start = state.player.cell;
  const goals = new Set(goalCells.map((g) => cellKey(g.cell)));
  const dist = new Map<string, number>([[cellKey(start), 0]]);
  const queue: Cell[] = [start];
  while (queue.length) {
    const cur = queue.shift() as Cell;
    const d = dist.get(cellKey(cur)) ?? 0;
    if (goals.has(cellKey(cur))) return d;
    for (const nb of neighbors4(ctx, cur)) {
      const k = cellKey(nb);
      if (dist.has(k)) continue;
      if (walkable(cur, nb, state.field, ctx) === false) continue;
      if (!passable(state.field, ctx, nb, state.preset)) continue;
      dist.set(k, d + 1);
      queue.push(nb);
    }
  }
  return null;
}
