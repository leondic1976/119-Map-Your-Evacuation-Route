/**
 * 가구 놓기 — 아이가 고른 가구를 칸 안에 놓는다. 놓지 않아도 된다.
 * 가장 가까운 벽에 등을 대도록 저절로 돌려서, 돌리는 조작을 늘리지 않는다.
 * 집 밖 자리도 여기서 다룬다.
 */
import { analyze, cellIdAt, edgeKeys, edgeEnds } from './grid';
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

export type PlaceItemResult = { plan: Plan; ok: true } | { plan: Plan; ok: false };

export function placeItem(plan: Plan, layout: Layout, kind: ItemKind, at: Pt): PlaceItemResult {
  if (!cellIdAt(layout, at)) return { plan, ok: false };
  const item: Item = { kind, x: at.x, y: at.y, angle: facingAt(layout, at) };
  return { plan: { ...plan, items: [...(plan.items ?? []), item] }, ok: true };
}

/** 누른 자리 근처의 가구를 치운다. 없으면 그대로다 */
export function removeItemAt(plan: Plan, at: Pt, radius: number): Plan {
  const items = plan.items ?? [];
  let hit = -1;
  let best = radius;
  items.forEach((item, i) => {
    const d = Math.hypot(item.x - at.x, item.y - at.y);
    if (d < best) {
      best = d;
      hit = i;
    }
  });
  if (hit < 0) return plan;
  return { ...plan, items: items.filter((_, i) => i !== hit) };
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
