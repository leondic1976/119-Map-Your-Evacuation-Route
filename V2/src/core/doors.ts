/** 문짝이 어느 쪽으로 열리는가(대장 #168). 지도 그림과 3D 가 같은 계산을 쓴다. */
import { edgeEnds, edgeLength, edgeMid, edgeNormal, edgeSides } from './grid';
import type { Layout, Plan, Pt } from './types';

export interface DoorSwing {
  /** 벽을 첫 끝에서 둘째 끝으로 눕혔을 때 문짝이 열리는 쪽. 1 은 그 방향의 오른쪽(그림에서 +y)이다 */
  side: 1 | -1;
  /** 경첩이 벽 토막의 첫 끝 쪽에 있다 */
  hingeAtStart: boolean;
  /** 경첩이 달린 끝 */
  hinge: Pt;
  /** 문짝이 열리는 쪽을 가리키는 길이 1 인 방향 */
  toward: Pt;
}

/** 고를 수 있는 문 폭 배율(대장 #170). 1 이 처음 크기다 */
export const DOOR_SIZES = [0.6, 0.8, 1, 1.3, 1.6, 2] as const;

/** 아이가 고른 문 폭 배율 */
export function doorSize(plan: Plan, edge: string): number {
  const s = plan.doorSizes?.[edge];
  return s !== undefined && (DOOR_SIZES as readonly number[]).includes(s) ? s : 1;
}

/**
 * 문과 창의 폭(처음 네모 단위). 점이 촘촘해 벽 토막이 짧아도 곧은 벽이 이어지면 제 크기로 낸다.
 * 키운 문도 곧게 이어진 벽을 넘지 않는다.
 */
export function openingWidth(plan: Plan, layout: Layout, edge: string): number {
  const density = plan.density ?? 1;
  const size = plan.openings[edge] === 'door' ? doorSize(plan, edge) : 1;
  const own = edgeLength(edge) / density;
  const run = layout.runOf.get(edge);
  const m = edgeMid(edge);
  const room = run ? (2 * Math.min(Math.hypot(m.x - run.a.x, m.y - run.a.y), Math.hypot(m.x - run.b.x, m.y - run.b.y))) / density : own;
  // 처음 크기까지는 예전과 같다 — 성긴 모눈에서는 제 토막 안에 낸다
  const limit = density <= 1 && size <= 1 ? own : Math.max(own, room);
  return Math.min(size, limit);
}

/** 한 단계 키우거나 줄인 배율. 더 갈 데가 없거나 벽이 짧아 더 커지지 않으면 null 이다 */
export function nextDoorSize(plan: Plan, layout: Layout, edge: string, dir: 1 | -1): number | null {
  const at = (DOOR_SIZES as readonly number[]).indexOf(doorSize(plan, edge));
  const next = DOOR_SIZES[at + dir];
  if (next === undefined) return null;
  const now = openingWidth(plan, layout, edge);
  const then = openingWidth({ ...plan, doorSizes: { ...(plan.doorSizes ?? {}), [edge]: next } }, layout, edge);
  return Math.abs(then - now) > 1e-6 ? next : null;
}

/** 방향을 바꾼 횟수 — 0 처음 · 1 반대쪽 · 2 반대쪽에 경첩도 반대 · 3 경첩만 반대 */
export function doorTurn(plan: Plan, edge: string): number {
  const t = plan.doorTurns?.[edge] ?? 0;
  return t >= 1 && t <= 3 ? Math.round(t) : 0;
}

export function doorSwing(plan: Plan, layout: Layout, edge: string): DoorSwing {
  const [a, b] = edgeEnds(edge);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  // 눕힌 벽에서 +y 가 가리키는 쪽
  const right: Pt = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  const normal = edgeNormal(edge);
  const [p, q] = edgeSides(layout, edge);
  const pCell = layout.cellAt.get(p);
  const qCell = layout.cellAt.get(q);
  const exit = Boolean(pCell) !== Boolean(qCell);
  // 처음에는 방 쪽으로 열리고, 밖으로 나가는 문은 집 안쪽으로 열린다
  const roomP = pCell ? layout.byId.get(pCell)?.kind === 'room' : false;
  const roomQ = qCell ? layout.byId.get(qCell)?.kind === 'room' : false;
  const toQ = exit ? Boolean(qCell) : roomQ || !roomP;
  const rightIsQ = right.x * normal.x + right.y * normal.y > 0;
  const turn = doorTurn(plan, edge);
  const base: 1 | -1 = rightIsQ === toQ ? 1 : -1;
  const side: 1 | -1 = turn === 1 || turn === 2 ? (base === 1 ? -1 : 1) : base;
  const hingeAtStart = !(turn === 2 || turn === 3);
  return { side, hingeAtStart, hinge: hingeAtStart ? a : b, toward: { x: right.x * side, y: right.y * side } };
}
