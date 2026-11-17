/**
 * 방 넣기(대장 #175 · #176) — 네모난 방을 통째로 놓는다. 벽 네 줄과 칸 이름을 한 번에 넣는 것이다.
 *
 * 놓는 동안에는 놓기 전 지도(`base`)에서 매번 다시 지어, 옮기고 크기를 바꿔도 지나간 자리에 벽이 남지 않는다.
 * 「다 됐어」 뒤에는 보통 벽과 같아서 연필과 지우개로 고친다. 자리와 크기는 지금 점 단위의 정수다.
 */
import { analyze, clipSegment, edgeEnds, hKey, parseSq, sqKey, tagFor, vKey } from './grid';
import { normalize } from './edit';
import type { CellTag, Plan } from './types';

export interface RoomRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RoomSide = 'top' | 'bottom' | 'left' | 'right';

/** 놓는 중인 방. `open` 은 문짝 없이 트인 쪽이다(부엌) */
export interface RoomDraft {
  rect: RoomRect;
  tag: CellTag;
  open: RoomSide | null;
}

/** 처음 네모 한 칸이 지금 점 몇 칸인가 — 방의 가장 작은 크기이고 트인 곳의 폭이다 */
export const roomUnit = (plan: Plan): number => Math.max(1, Math.round(plan.density ?? 1));

/** 크기를 한 번 바꿀 때 늘고 주는 칸 수. 점이 촘촘하면 반 칸씩이다 */
export const roomStep = (plan: Plan): number => Math.max(1, Math.round((plan.density ?? 1) / 2));

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** 종이 안에 들어오게 맞춘다. 크기가 먼저이고 자리는 그다음이다 */
export function fitRoom(plan: Plan, rect: RoomRect): RoomRect {
  const min = roomUnit(plan);
  const w = clamp(Math.round(rect.w), Math.min(min, plan.cols), plan.cols);
  const h = clamp(Math.round(rect.h), Math.min(min, plan.rows), plan.rows);
  return { x: clamp(Math.round(rect.x), 0, plan.cols - w), y: clamp(Math.round(rect.y), 0, plan.rows - h), w, h };
}

/** 처음 네모로 센 크기(가로 · 세로)를 지금 점 단위로 바꾼다 */
export function roomSize(plan: Plan, base: readonly [number, number]): { w: number; h: number } {
  const k = plan.density ?? 1;
  const { w, h } = fitRoom(plan, { x: 0, y: 0, w: base[0] * k, h: base[1] * k });
  return { w, h };
}

export const sameRoom = (a: RoomRect, b: RoomRect): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

export const inRoom = (rect: RoomRect, p: { x: number; y: number }, pad = 0): boolean =>
  p.x >= rect.x - pad && p.x <= rect.x + rect.w + pad && p.y >= rect.y - pad && p.y <= rect.y + rect.h + pad;

/** 방을 옮긴다. 종이 끝에서는 멈춘다 */
export function moveRoom(plan: Plan, rect: RoomRect, dx: number, dy: number): RoomRect {
  return fitRoom(plan, { ...rect, x: rect.x + dx, y: rect.y + dy });
}

/** 방을 키우거나 줄인다. 오른쪽과 아래로 늘고, 종이 끝에 닿아 있으면 반대쪽으로 는다. 더 바뀌지 않으면 null */
export function resizeRoom(plan: Plan, rect: RoomRect, axis: 'w' | 'h', dir: 1 | -1): RoomRect | null {
  const next = fitRoom(plan, { ...rect, [axis]: rect[axis] + dir * roomStep(plan) });
  // 종이 끝에 닿아 있던 방은 그 끝에 붙은 채로 는다
  if (axis === 'w' && rect.x + rect.w === plan.cols) next.x = plan.cols - next.w;
  if (axis === 'h' && rect.y + rect.h === plan.rows) next.y = plan.rows - next.h;
  return sameRoom(next, rect) ? null : next;
}

/** 방 네 쪽의 벽 조각 */
export function roomEdges(rect: RoomRect): Record<RoomSide, string[]> {
  const across = Array.from({ length: rect.w }, (_, i) => rect.x + i);
  const down = Array.from({ length: rect.h }, (_, i) => rect.y + i);
  return {
    top: across.map((x) => hKey(x, rect.y)),
    bottom: across.map((x) => hKey(x, rect.y + rect.h)),
    left: down.map((y) => vKey(rect.x, y)),
    right: down.map((y) => vKey(rect.x + rect.w, y)),
  };
}

/** 트인 쪽의 가운데 — 처음 네모 한 칸 폭만큼 벽을 비운다 */
export function roomGapEdges(plan: Plan, rect: RoomRect, side: RoomSide): string[] {
  const edges = roomEdges(rect)[side];
  const count = Math.min(edges.length, roomUnit(plan));
  const from = Math.floor((edges.length - count) / 2);
  return edges.slice(from, from + count);
}

/** 놓을 자리 안쪽을 지나는 벽이 있나. 테두리에 겹치는 벽은 함께 쓰는 벽이라 괜찮다 */
export function roomBlocked(plan: Plan, rect: RoomRect): boolean {
  const e = 1e-6;
  return plan.walls.some((wall) => {
    const [a, b] = edgeEnds(wall);
    const cut = clipSegment(a, b, rect.x + e, rect.y + e, rect.x + rect.w - e, rect.y + rect.h - e);
    return cut !== null && cut[1] - cut[0] > 1e-9;
  });
}

/**
 * 누른 자리에 방이 들어갈 곳을 찾는다. 누른 점을 품으면서 가운데가 가장 가까운 자리를 고르고,
 * 처음 크기로 안 들어가면 들어가는 크기까지 줄인다. 어디에도 못 놓으면 null 이다.
 */
export function findRoomSpot(plan: Plan, size: { w: number; h: number }, at: { x: number; y: number }): RoomRect | null {
  const min = roomUnit(plan);
  const px = clamp(at.x, 0.001, plan.cols - 0.001);
  const py = clamp(at.y, 0.001, plan.rows - 0.001);
  const tried = new Set<string>();
  for (const scale of [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0]) {
    const { w, h } = fitRoom(plan, { x: 0, y: 0, w: Math.max(min, size.w * scale), h: Math.max(min, size.h * scale) });
    if (tried.has(`${w}x${h}`)) continue;
    tried.add(`${w}x${h}`);
    let best: RoomRect | null = null;
    let bestD = Infinity;
    for (let x = Math.max(0, Math.floor(px) - w + 1); x <= Math.min(plan.cols - w, Math.floor(px)); x++) {
      for (let y = Math.max(0, Math.floor(py) - h + 1); y <= Math.min(plan.rows - h, Math.floor(py)); y++) {
        const d = Math.hypot(x + w / 2 - px, y + h / 2 - py);
        if (d >= bestD) continue;
        const rect = { x, y, w, h };
        if (roomBlocked(plan, rect)) continue;
        best = rect;
        bestD = d;
      }
    }
    if (best) return best;
  }
  return null;
}

export type RoomResult = { plan: Plan; ok: true } | { plan: Plan; ok: false; why: 'out' | 'wall' };

/**
 * 방을 놓는다. `base` 는 이 방을 놓기 전의 지도다.
 * 안쪽에 다른 벽이 지나가면 놓지 않는다 — 방이 조각나서 어느 칸이 무엇인지 알 수 없게 된다.
 */
export function stampRoom(base: Plan, draft: RoomDraft): RoomResult {
  const rect = draft.rect;
  const whole = [rect.x, rect.y, rect.w, rect.h].every(Number.isInteger);
  if (!whole || rect.w < 1 || rect.h < 1 || rect.x < 0 || rect.y < 0 || rect.x + rect.w > base.cols || rect.y + rect.h > base.rows) return { plan: base, ok: false, why: 'out' };
  if (roomBlocked(base, rect)) return { plan: base, ok: false, why: 'wall' };

  const sides = roomEdges(rect);
  const walls = [...new Set([...base.walls, ...sides.top, ...sides.bottom, ...sides.left, ...sides.right])];

  // 방 안에 있던 칸 이름은 걷어 낸다. 이름표가 방 안에 놓였던 큰 칸은 방 밖의 조각으로 이름을 옮긴다
  const inside = (key: string): boolean => {
    const s = parseSq(key);
    return s.x >= rect.x && s.x < rect.x + rect.w && s.y >= rect.y && s.y < rect.y + rect.h;
  };
  const tags: Plan['tags'] = {};
  for (const [key, tag] of Object.entries(base.tags)) if (!inside(key)) tags[key] = tag;
  for (const cell of analyze(base).cells) {
    if (!cell.kind) continue;
    const rest = cell.squares.filter((s) => !inside(s.key));
    if (rest.length === 0 || rest.length === cell.squares.length || rest.some((s) => tagFor(tags, s))) continue;
    tags[rest[0]!.key] = { kind: cell.kind, name: cell.name };
  }
  tags[sqKey(rect.x, rect.y)] = draft.tag;

  // 트인 쪽 — 이미 문이나 창이 달린 자리는 그대로 둔다
  const openings = { ...base.openings };
  if (draft.open) for (const edge of roomGapEdges(base, rect, draft.open)) if (!openings[edge]) openings[edge] = 'gap';

  return { plan: normalize({ ...base, walls, tags, openings }), ok: true };
}
