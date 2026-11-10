/**
 * 가구 놓기 — 아이가 고른 가구를 칸 안에 놓는다. 놓지 않아도 된다.
 * 가장 가까운 벽에 등을 대도록 저절로 돌려서, 돌리는 조작을 늘리지 않는다.
 * 집 밖 자리도 여기서 다룬다.
 */
import { analyze, cellIdAt, edgeKeys, edgeEnds, edgeMid } from './grid';
import { normalize } from './edit';
import type { Item, ItemKind, Layout, OutsideSide, Plan, Pt } from './types';

/** 놓은 자리에서 가장 가까운 벽을 등지는 방향(도). 0 은 앞이 아래쪽이다 */
export function facingAt(layout: Layout, p: Pt): number {
  let best = Infinity;
  let front: Pt = { x: 0, y: 1 };
  for (const key of edgeKeys(layout)) {
    const [a, b] = edgeEnds(key);
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy)));
    const cx = a.x + vx * t;
    const cy = a.y + vy * t;
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d > 1e-6 && d < best) {
      best = d;
      front = { x: (p.x - cx) / d, y: (p.y - cy) / d };
    }
  }
  return (Math.atan2(-front.x, front.y) * 180) / Math.PI + 0;
}

export type PlaceItemResult = { plan: Plan; ok: true } | { plan: Plan; ok: false; why: 'outside' | 'door' };

/** 문 앞에서 비울 거리(처음 네모 단위). 대피할 때 문이 막히면 안 된다 */
export const DOOR_CLEAR = 0.62;

/** 가구가 문 앞을 막지 않게 조금 밀어 준다. 밀 자리가 없으면 null 이다 */
export function clearOfDoors(plan: Plan, layout: Layout, at: Pt): Pt | null {
  const k = Math.max(1, plan.density ?? 1);
  const need = DOOR_CLEAR * k;
  const cell = cellIdAt(layout, at);
  let p = at;
  const doors = Object.entries(plan.openings).filter(([, o]) => o === 'door' || o === 'gap').map(([edge]) => edgeMid(edge));
  for (let round = 0; round < 3; round++) {
    let moved = false;
    for (const door of doors) {
      const dx = p.x - door.x;
      const dy = p.y - door.y;
      const d = Math.hypot(dx, dy);
      if (d >= need - 1e-6) continue;
      // 문 바로 위를 눌렀으면 칸 가운데 쪽으로 민다
      const c = layout.byId.get(cell ?? '');
      const fx = d > 1e-3 ? dx / d : (c ? c.anchor.x - door.x : 0);
      const fy = d > 1e-3 ? dy / d : (c ? c.anchor.y - door.y : 1);
      const len = Math.hypot(fx, fy) || 1;
      p = { x: door.x + (fx / len) * need, y: door.y + (fy / len) * need };
      moved = true;
    }
    if (!moved) break;
  }
  const blocked = doors.some((door) => Math.hypot(p.x - door.x, p.y - door.y) < need - 1e-6);
  return blocked || cellIdAt(layout, p) !== cell ? null : p;
}

export function placeItem(plan: Plan, layout: Layout, kind: ItemKind, at: Pt): PlaceItemResult {
  if (!cellIdAt(layout, at)) return { plan, ok: false, why: 'outside' };
  const spot = clearOfDoors(plan, layout, at);
  if (!spot) return { plan, ok: false, why: 'door' };
  const item: Item = { kind, x: spot.x, y: spot.y, angle: facingAt(layout, spot) };
  return { plan: { ...plan, items: [...(plan.items ?? []), item] }, ok: true };
}

/** 고를 수 있는 가구 크기. 1 이 제 크기다 */
export const ITEM_SIZES = [0.6, 0.8, 1, 1.25, 1.5, 1.8];

export const itemSize = (item: Item): number => item.size ?? 1;

/** 가구를 동서남북으로 돌린다. 한 번에 오른쪽으로 90도씩 돈다 */
export function turnItem(plan: Plan, index: number, quarter = 1): Plan {
  const items = plan.items ?? [];
  const item = items[index];
  if (!item) return plan;
  const snapped = Math.round(item.angle / 90) * 90;
  const angle = (((snapped + 90 * quarter) % 360) + 360) % 360;
  return { ...plan, items: items.map((it, i) => (i === index ? { ...it, angle, turned: true } : it)) };
}

/** 가구를 한 단계 키우거나 줄인다. 끝이면 그대로다 */
export function resizeItem(plan: Plan, index: number, step: 1 | -1): Plan {
  const items = plan.items ?? [];
  const item = items[index];
  if (!item) return plan;
  const now = ITEM_SIZES.reduce((best, s, i) => (Math.abs(s - itemSize(item)) < Math.abs(ITEM_SIZES[best]! - itemSize(item)) ? i : best), 0);
  const next = ITEM_SIZES[now + step];
  if (next === undefined) return plan;
  const resized: Item = { ...item };
  if (next === 1) delete resized.size;
  else resized.size = next;
  return { ...plan, items: items.map((it, i) => (i === index ? resized : it)) };
}

/** 가구 하나를 치운다 */
export function removeItem(plan: Plan, index: number): Plan {
  return { ...plan, items: (plan.items ?? []).filter((_, i) => i !== index) };
}

/** 누른 자리의 가구 번호. 없으면 -1 이다 */
export function itemIndexAt(plan: Plan, at: Pt, radius: number): number {
  let hit = -1;
  let best = radius;
  (plan.items ?? []).forEach((item, i) => {
    const d = Math.hypot(item.x - at.x, item.y - at.y);
    if (d < best) {
      best = d;
      hit = i;
    }
  });
  return hit;
}

/** 놓은 가구를 옮긴다. 다시 가장 가까운 벽을 등진다 */
export function moveItem(plan: Plan, layout: Layout, index: number, to: Pt): PlaceItemResult {
  const items = plan.items ?? [];
  const item = items[index];
  if (!item) return { plan, ok: false, why: 'outside' };
  if (!cellIdAt(layout, to)) return { plan, ok: false, why: 'outside' };
  const spot = clearOfDoors(plan, layout, to);
  if (!spot) return { plan, ok: false, why: 'door' };
  // 아이가 직접 돌린 가구는 옮겨도 그 방향을 지킨다
  const moved: Item = { ...item, x: spot.x, y: spot.y, angle: item.turned ? item.angle : facingAt(layout, spot) };
  return { plan: { ...plan, items: items.map((it, i) => (i === index ? moved : it)) }, ok: true };
}

/** 누른 자리 근처의 가구를 치운다. 없으면 그대로다 */
export function removeItemAt(plan: Plan, at: Pt, radius: number): Plan {
  const hit = itemIndexAt(plan, at, radius);
  if (hit < 0) return plan;
  return { ...plan, items: (plan.items ?? []).filter((_, i) => i !== hit) };
}

/** 칸 밖으로 나간 가구를 뺀다 */
export function itemsInside(plan: Plan, layout: Layout): Item[] | undefined {
  if (!plan.items?.length) return plan.items;
  return plan.items.filter((item) => cellIdAt(layout, item));
}

export const outsideOf = (plan: Plan): OutsideSide => plan.outside ?? 'bottom';

/** 집 밖 띠의 가운데 — 만나는 곳의 기본 자리다 */
export function outsideSpot(plan: Plan): Pt {
  const k = Math.max(1, plan.density ?? 1);
  const gap = 0.9 * k;
  switch (outsideOf(plan)) {
    case 'top':
      return { x: plan.cols / 2, y: -gap };
    case 'left':
      return { x: -gap, y: plan.rows / 2 };
    case 'right':
      return { x: plan.cols + gap, y: plan.rows / 2 };
    default:
      return { x: plan.cols / 2, y: plan.rows + gap };
  }
}

/** 집 밖 자리를 바꾼다. 만나는 곳도 함께 옮긴다 */
export function setOutside(plan: Plan, side: OutsideSide): Plan {
  if (outsideOf(plan) === side) return plan;
  const next: Plan = { ...plan, outside: side === 'bottom' ? undefined : side };
  const marks = { ...next.marks };
  if (marks.meet && !cellIdAt(analyze(next), outsideSpot(next))) marks.meet = outsideSpot(next);
  return normalize({ ...next, marks });
}
