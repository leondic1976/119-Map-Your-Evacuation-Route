/**
 * 점 잇기 — 포인터를 따라 점을 이어 간다.
 *
 * 끌면 지나는 점마다 선이 늘어나고, 방금 지나온 점으로 돌아가면 줄어든다.
 * 멀리 떨어진 점을 바로 누르면 가로 또는 세로로 먼저 간 뒤 꺾어 이어 준다.
 * 가로와 세로의 거리가 같으면 대각선으로 곧게 잇는다. 그 밖의 비스듬한 각도는 없어서 삐뚤게 그려질 일이 없다.
 */
import { edgeEnds } from './grid';
import type { Plan, Pt } from './types';

export const sameDot = (a: Pt, b: Pt): boolean => a.x === b.x && a.y === b.y;

/** 포인터 근처의 점. radius 안에 없으면 null */
export function nearestDot(plan: Plan, p: Pt, radius = 0.5): Pt | null {
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  if (x < 0 || y < 0 || x > plan.cols || y > plan.rows) return null;
  return Math.hypot(p.x - x, p.y - y) <= radius ? { x, y } : null;
}

/** 획을 dot 까지 잇는다. diagonal 이 false 면 대각선으로 잇지 않고 꺾는다 */
export function extendStroke(stroke: Pt[], dot: Pt, diagonal = true): Pt[] {
  if (stroke.length === 0) return [dot];
  const last = stroke[stroke.length - 1]!;
  if (sameDot(last, dot)) return stroke;
  const before = stroke[stroke.length - 2];
  if (before && sameDot(before, dot)) return stroke.slice(0, -1);

  const out = [...stroke];
  let at = last;
  if (diagonal && Math.abs(dot.x - at.x) === Math.abs(dot.y - at.y)) {
    while (!sameDot(at, dot)) {
      at = { x: at.x + Math.sign(dot.x - at.x), y: at.y + Math.sign(dot.y - at.y) };
      out.push(at);
    }
    return out;
  }
  // 더 많이 움직인 쪽부터 간다
  const xFirst = Math.abs(dot.x - at.x) >= Math.abs(dot.y - at.y);
  const stepX = (): void => {
    while (at.x !== dot.x) {
      at = { x: at.x + Math.sign(dot.x - at.x), y: at.y };
      out.push(at);
    }
  };
  const stepY = (): void => {
    while (at.y !== dot.y) {
      at = { x: at.x, y: at.y + Math.sign(dot.y - at.y) };
      out.push(at);
    }
  };
  if (xFirst) {
    stepX();
    stepY();
  } else {
    stepY();
    stepX();
  }
  return out;
}

/** 대각선 줄에서 이만큼(네모 단위) 벗어나면 대각선을 그으려던 것이 아니다 */
const DIAGONAL_TOLERANCE = 0.25;

/**
 * 끌어 온 궤적이 정말 대각선이었나. 모서리를 둥글게 돌다 점을 건너뛴 손을 대각선으로 읽지 않으려고 본다.
 * 아이가 네모 집을 그리는 중에 모서리가 깎이면 안 된다.
 */
export function wasDiagonalDrag(from: Pt, to: Pt, samples: Pt[]): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) !== Math.abs(dy) || dx === 0) return false;
  const length = Math.hypot(dx, dy);
  return samples.every((p) => Math.abs((p.x - from.x) * dy - (p.y - from.y) * dx) / length <= DIAGONAL_TOLERANCE);
}

/** 포인터 근처의 벽 조각. 문·창·지우개가 쓴다 */
export function nearestEdge(edges: Iterable<string>, p: Pt, radius = 0.42): string | null {
  let best: string | null = null;
  let bestD = radius;
  for (const key of edges) {
    // 조각의 끝까지 눌러도 맞게 조각 위 가장 가까운 점까지 잰다
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
