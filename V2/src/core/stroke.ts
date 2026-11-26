/**
 * 점 잇기 — 포인터를 따라 점을 이어 간다.
 *
 * 벽의 두 끝은 언제나 점이고, 두 점을 곧게 잇는다. 각도는 정해져 있지 않다.
 * 끌 때는 손이 지나온 자리가 지금 잡힌 점까지 곧으면 한 줄로 보고, 곧지 않으면 거기서 꺾은 것으로 본다.
 * 그래서 비스듬한 벽을 그을 수 있으면서도 네모 집을 그리는 아이의 모서리가 깎이지 않는다.
 */
import { dotsBetween, edgeEnds } from './grid';
import type { Plan, Pt } from './types';

export const sameDot = (a: Pt, b: Pt): boolean => a.x === b.x && a.y === b.y;

/** 포인터 근처의 점. radius 안에 없으면 null */
export function nearestDot(plan: Pick<Plan, 'cols' | 'rows'>, p: Pt, radius = 0.5): Pt | null {
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  if (x < 0 || y < 0 || x > plan.cols || y > plan.rows) return null;
  return Math.hypot(p.x - x, p.y - y) <= radius ? { x, y } : null;
}

/** 획을 dot 까지 잇는다. straight 가 false 면 곧게 잇지 않고 가로세로로 꺾는다 */
export function extendStroke(stroke: Pt[], dot: Pt, straight = true): Pt[] {
  if (stroke.length === 0) return [dot];
  const last = stroke[stroke.length - 1]!;
  if (sameDot(last, dot)) return stroke;
  const before = stroke[stroke.length - 2];
  if (before && sameDot(before, dot)) return stroke.slice(0, -1);

  if (straight) return [...stroke, ...dotsBetween(last, dot).slice(1)];
  // 더 많이 움직인 쪽부터 간다
  const corner = Math.abs(dot.x - last.x) >= Math.abs(dot.y - last.y) ? { x: dot.x, y: last.y } : { x: last.x, y: dot.y };
  return [...stroke, ...dotsBetween(last, corner).slice(1), ...dotsBetween(corner, dot).slice(1)];
}

/** 끄는 동안 점을 잡는 거리. 얕은 각도로 지나갈 때 옆 점에 덜 끌린다 */
export const DRAG_RADIUS = 0.38;
/** 곧지 않게 온 점은 이만큼 가까이 와야 꺾은 것으로 본다. 비스듬히 스쳐 지나는 점에 꺾이지 않게 한다 */
const CORNER_RADIUS = 0.25;

/** 줄에서 이만큼(네모 단위) 벗어나면 곧게 끈 것이 아니다. 길수록 손이 더 흔들리므로 조금 너그럽다 */
const toleranceFor = (length: number): number => Math.min(0.4, 0.19 + 0.05 * length);

/**
 * 끌어 온 궤적이 from 에서 to 까지 곧았나. 잠깐 뒤로 갔다 온 손도 곧은 것이다.
 * unit 은 손 떨림이 지금 점 몇 칸에 해당하는지다. 점이 촘촘해도 손은 그대로 떨린다.
 */
export function wasStraightDrag(from: Pt, to: Pt, samples: Pt[], unit = 1): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return false;
  const limit = toleranceFor(length / unit) * unit;
  return samples.every((p) => Math.abs((p.x - from.x) * dy - (p.y - from.y) * dx) / length <= limit);
}

/** 끄는 중인 획 */
export interface DragStroke {
  /** 꺾기로 굳은 점들 */
  fixed: Pt[];
  /** 마지막 굳은 점에서 지금 뻗어 있는 끝 */
  tip: Pt | null;
  /** 마지막 굳은 점 뒤로 손이 지나온 자리 */
  trail: Pt[];
  /** 끝을 잡은 뒤로 손이 지나온 자리 — 거기서 꺾으면 새 궤적이 된다 */
  sinceTip: Pt[];
}

export function startDrag(dot: Pt): DragStroke {
  return { fixed: [dot], tip: null, trail: [], sinceTip: [] };
}

/** 촘촘한 점에서 손이 조금 흔들려도 가로세로 벽이 비스듬해지지 않게 한다 */
function snapAxis(anchor: Pt, dot: Pt, unit: number): Pt {
  if (unit <= 1) return dot;
  const dx = Math.abs(dot.x - anchor.x);
  const dy = Math.abs(dot.y - anchor.y);
  const room = 0.55 * unit;
  if (dy <= room && dx >= dy * 3) return { x: dot.x, y: anchor.y };
  if (dx <= room && dy >= dx * 3) return { x: anchor.x, y: dot.y };
  return dot;
}

/** 포인터가 p 로 옮겨 왔다. near 는 p 근처의 점이고 없으면 null 이다. unit 은 `wasStraightDrag` 와 같다 */
export function dragMove(live: DragStroke, p: Pt, near: Pt | null, unit = 1): DragStroke {
  const trail = [...live.trail, p];
  const sinceTip = [...live.sinceTip, p];
  const anchor = live.fixed[live.fixed.length - 1]!;
  if (!near) return { ...live, trail, sinceTip };
  const dot = snapAxis(anchor, near, unit);
  // 굳은 점 위 — 궤적을 새로 시작한다. 그 앞 점까지 돌아가면 꺾은 것을 무른다
  if (sameDot(dot, anchor)) return { ...live, tip: null, trail: [], sinceTip: [] };
  const before = live.fixed[live.fixed.length - 2];
  if (before && sameDot(dot, before)) return { fixed: live.fixed.slice(0, -1), tip: null, trail: [], sinceTip: [] };
  // 지금 끝 위에 머무는 동안은 궤적이 아니다
  if (live.tip && sameDot(dot, live.tip)) return { ...live, trail, sinceTip: [] };
  if (wasStraightDrag(anchor, dot, trail, unit)) return { ...live, tip: dot, trail, sinceTip: [] };
  // 곧지 않은데 스쳐 지나가는 중이면 아직 꺾은 것이 아니다
  if (Math.hypot(p.x - dot.x, p.y - dot.y) > CORNER_RADIUS * unit) return { ...live, trail, sinceTip };
  // 곧지 않다 — 끝에서 꺾었다
  if (live.tip) {
    const fixed = [...live.fixed, live.tip];
    const turned = snapAxis(live.tip, near, unit);
    if (wasStraightDrag(live.tip, turned, sinceTip, unit)) return { fixed, tip: turned, trail: sinceTip, sinceTip: [] };
    return { fixed: bridge(fixed, dot), tip: null, trail: [], sinceTip: [] };
  }
  // 끝도 없이 모서리를 돌아왔다 — 건너뛴 모서리를 채운다
  return { ...live, fixed: bridge(live.fixed, dot), tip: null, trail: [], sinceTip: [] };
}

/** 곧게 오지 않은 손 — 가로세로로 꺾어 dot 까지 잇는다 */
function bridge(fixed: Pt[], dot: Pt): Pt[] {
  const last = fixed[fixed.length - 1]!;
  const corner = Math.abs(dot.x - last.x) >= Math.abs(dot.y - last.y) ? { x: dot.x, y: last.y } : { x: last.x, y: dot.y };
  return sameDot(corner, last) || sameDot(corner, dot) ? [...fixed, dot] : [...fixed, corner, dot];
}

/** 끄는 중인 획이 지나는 점들 */
export function dragDots(live: DragStroke): Pt[] {
  const stops = live.tip ? [...live.fixed, live.tip] : live.fixed;
  return stops.reduce<Pt[]>((out, p) => (out.length ? [...out, ...dotsBetween(out[out.length - 1]!, p).slice(1)] : [p]), []);
}

/** 포인터 근처의 벽 토막. 문·창·지우개가 쓴다 */
export function nearestEdge(edges: Iterable<string>, p: Pt, radius = 0.42): string | null {
  let best: string | null = null;
  let bestD = radius;
  for (const key of edges) {
    // 토막의 끝까지 눌러도 맞게 토막 위 가장 가까운 점까지 잰다
    const [a, b] = edgeEnds(key);
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy)));
    const d = Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
    if (d < bestD) {
      bestD = d;
      best = key;
    }
  }
  return best;
}
