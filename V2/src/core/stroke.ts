/**
 * 점 잇기 — 포인터를 따라 점을 이어 간다.
 *
 * 끌면 지나는 점마다 선이 늘어나고, 방금 지나온 점으로 돌아가면 줄어든다.
 * 멀리 떨어진 점을 바로 누르면 가로 또는 세로로 먼저 간 뒤 꺾어 이어 준다.
 * 벽은 가로와 세로뿐이라 삐뚤게 그려질 일이 없다.
 */
import { edgeMid, parseEdge } from './grid';
import type { Plan, Pt } from './types';

export const sameDot = (a: Pt, b: Pt): boolean => a.x === b.x && a.y === b.y;

/** 포인터 근처의 점. radius 안에 없으면 null */
export function nearestDot(plan: Plan, p: Pt, radius = 0.5): Pt | null {
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  if (x < 0 || y < 0 || x > plan.cols || y > plan.rows) return null;
  return Math.hypot(p.x - x, p.y - y) <= radius ? { x, y } : null;
}

/** 획을 dot 까지 잇는다 */
export function extendStroke(stroke: Pt[], dot: Pt): Pt[] {
  if (stroke.length === 0) return [dot];
  const last = stroke[stroke.length - 1]!;
  if (sameDot(last, dot)) return stroke;
  const before = stroke[stroke.length - 2];
  if (before && sameDot(before, dot)) return stroke.slice(0, -1);

  const out = [...stroke];
  let at = last;
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

/** 포인터 근처의 벽 조각. 문·창·지우개가 쓴다 */
export function nearestEdge(edges: Iterable<string>, p: Pt, radius = 0.42): string | null {
  let best: string | null = null;
  let bestD = radius;
  for (const key of edges) {
    const { o } = parseEdge(key);
    const m = edgeMid(key);
    // 조각의 끝까지 눌러도 맞게 조각 위 가장 가까운 점까지 잰다
    const dx = o === 'h' ? Math.max(0, Math.abs(p.x - m.x) - 0.5) : Math.abs(p.x - m.x);
    const dy = o === 'v' ? Math.max(0, Math.abs(p.y - m.y) - 0.5) : Math.abs(p.y - m.y);
    const d = Math.hypot(dx, dy);
    if (d < bestD) {
      bestD = d;
      best = key;
    }
  }
  return best;
}
