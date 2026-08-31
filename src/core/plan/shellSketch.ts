import type { Cell, FloorPlan } from '../../types/plan';
import { DEFAULT_GRID } from '../../types/plan';
import { cellKey, step } from '../grid/geometry';
import { shellCells, type ShellShape } from './residual';
import { reflowShellFloor } from './reflow';

export interface ShellVertex {
  x: number;
  y: number;
}

export interface ShellSketchResult {
  ok: boolean;
  message: string;
  vertices: ShellVertex[];
  cells: Cell[];
}

/** 준비된 외곽도 직접 그린 외곽과 똑같이 공용 바닥 하나에서 시작한다. */
export function preparedShellPlan(shape: ShellShape): FloorPlan {
  return shellOnlyPlan([...shellCells(shape)].map(parseCell));
}

export function shellOnlyPlan(cells: Cell[]): FloorPlan {
  const unique = [...new Map(cells.map((cell) => [cellKey(cell), { ...cell }])).values()]
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const base: FloorPlan = { grid: { ...DEFAULT_GRID }, shell: { cells: unique }, blocks: [] };
  const plan = reflowShellFloor(base);
  if (!plan) throw new Error('집 안쪽 바닥이 하나로 이어져야 합니다.');
  return plan;
}

/** 마지막 꼭짓점을 수평/수직 중 더 가까운 축에 맞춘다. */
export function orthogonalVertex(previous: ShellVertex | undefined, wanted: ShellVertex): ShellVertex {
  const point = { x: clamp(Math.round(wanted.x), 0, DEFAULT_GRID.width), y: clamp(Math.round(wanted.y), 0, DEFAULT_GRID.height) };
  if (!previous) return point;
  const dx = Math.abs(point.x - previous.x);
  const dy = Math.abs(point.y - previous.y);
  return dx >= dy ? { x: point.x, y: previous.y } : { x: previous.x, y: point.y };
}

/** 직각 꼭짓점을 닫힌 외곽과 내부 셀로 바꾸며 아이가 고칠 수 있는 한 문장 오류를 돌려준다. */
export function completeShellSketch(input: ShellVertex[]): ShellSketchResult {
  const points = dedupe(input);
  if (points.length < 4) return fail('모서리를 네 곳 이상 찍어 집 모양을 만들어 주세요.', points);

  const candidates = closingCandidates(points);
  for (const candidate of candidates) {
    const checked = validateClosed(candidate);
    if (checked.ok) return checked;
  }
  return validateClosed(candidates[0]);
}

function closingCandidates(points: ShellVertex[]): ShellVertex[][] {
  const first = points[0];
  const last = points[points.length - 1];
  if (same(first, last)) return [points];
  if (first.x === last.x || first.y === last.y) return [[...points, first]];
  return [
    [...points, { x: first.x, y: last.y }, first],
    [...points, { x: last.x, y: first.y }, first],
  ];
}

function validateClosed(points: ShellVertex[]): ShellSketchResult {
  if (points.length < 5 || !same(points[0], points[points.length - 1])) return fail('시작점까지 이어지는 닫힌 집 모양이 필요해요.', points);
  for (let i = 1; i < points.length; i += 1) {
    if (same(points[i - 1], points[i])) return fail('같은 점은 한 번만 찍어 주세요.', points);
    if (points[i - 1].x !== points[i].x && points[i - 1].y !== points[i].y) return fail('벽은 가로 또는 세로로 곧게 그려 주세요.', points);
  }
  if (selfIntersects(points)) return fail('벽선이 서로 가로지르지 않게 되돌려 고쳐 주세요.', points);

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  if (Math.max(...xs) - Math.min(...xs) < 4 || Math.max(...ys) - Math.min(...ys) < 4) return fail('집의 가로와 세로를 각각 네 칸 이상으로 그려 주세요.', points);

  const cells: Cell[] = [];
  for (let y = 0; y < DEFAULT_GRID.height; y += 1) {
    for (let x = 0; x < DEFAULT_GRID.width; x += 1) {
      if (insidePolygon({ x: x + 0.5, y: y + 0.5 }, points)) cells.push({ x, y });
    }
  }
  if (cells.length < 24) return fail('방을 놓을 수 있도록 집 안쪽을 조금 더 넓게 그려 주세요.', points);
  if (!connected(cells)) return fail('집 안쪽 바닥이 끊기지 않게 한 덩어리로 그려 주세요.', points);
  return { ok: true, message: '멋진 집 외곽이 완성됐어요.', vertices: points, cells };
}

function selfIntersects(points: ShellVertex[]): boolean {
  const segmentCount = points.length - 1;
  for (let a = 0; a < segmentCount; a += 1) {
    for (let b = a + 1; b < segmentCount; b += 1) {
      if (Math.abs(a - b) <= 1 || (a === 0 && b === segmentCount - 1)) continue;
      if (segmentsIntersect(points[a], points[a + 1], points[b], points[b + 1])) return true;
    }
  }
  return false;
}

function segmentsIntersect(a: ShellVertex, b: ShellVertex, c: ShellVertex, d: ShellVertex): boolean {
  const cross = (p: ShellVertex, q: ShellVertex, r: ShellVertex) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const between = (p: ShellVertex, q: ShellVertex, r: ShellVertex) => Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  const c1 = cross(a, b, c);
  const c2 = cross(a, b, d);
  const c3 = cross(c, d, a);
  const c4 = cross(c, d, b);
  if (c1 === 0 && between(a, b, c)) return true;
  if (c2 === 0 && between(a, b, d)) return true;
  if (c3 === 0 && between(c, d, a)) return true;
  if (c4 === 0 && between(c, d, b)) return true;
  return (c1 > 0) !== (c2 > 0) && (c3 > 0) !== (c4 > 0);
}

function insidePolygon(point: ShellVertex, polygon: ShellVertex[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function connected(cells: Cell[]): boolean {
  if (!cells.length) return false;
  const available = new Set(cells.map(cellKey));
  const seen = new Set<string>([cellKey(cells[0])]);
  const queue = [cells[0]];
  while (queue.length) {
    const cell = queue.shift() as Cell;
    for (const side of ['N', 'E', 'S', 'W'] as const) {
      const next = step(cell, side);
      const key = cellKey(next);
      if (!available.has(key) || seen.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return seen.size === available.size;
}

function dedupe(points: ShellVertex[]): ShellVertex[] {
  return points.filter((point, index) => index === 0 || !same(point, points[index - 1]));
}

function same(a: ShellVertex, b: ShellVertex): boolean { return a.x === b.x && a.y === b.y; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function parseCell(key: string): Cell { const [x, y] = key.split(',').map(Number); return { x, y }; }
function fail(message: string, vertices: ShellVertex[]): ShellSketchResult { return { ok: false, message, vertices, cells: [] }; }
