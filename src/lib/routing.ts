/**
 * 피난동선 산출.
 *
 * 종점(현관문·세대 피난설비)에서 출발하는 거리장을 4방향 다익스트라로 구한다.
 * 벽면에 붙은 셀에는 가산 비용을 두어 통로 중앙을 따르게 하고,
 * 각 실 중심에서 내리막을 추적한 뒤 ㄱ자 연결 검사로 꺾임을 최소화한다.
 */
import { Grid, cellAt, cellCenter, clearanceField, nearestWalkable } from './grid';
import { MinHeap } from './heap';
import {
  Plan,
  Pt,
  Room,
  Route,
  WALK_SPEED,
  WalkerKind,
  nid,
  polylineLength,
  roomCenter,
} from './types';

export interface ExitPoint {
  id: string;
  kind: 'entrance' | 'refuge' | 'partition' | 'downladder';
  label: string;
  x: number;
  y: number;
  /** 격자 상 진입 셀 */
  cell: number;
  /** 개구부가 놓인 벽의 방향 — 종점 진입을 벽에 직교시키는 데 쓴다 */
  dir?: 'h' | 'v';
}

/** 벽면 인접 가산비용 — 통로 중앙 선호 */
function clearancePenalty(clear: number): number {
  if (clear <= 1) return 1.1;
  if (clear === 2) return 0.45;
  if (clear === 3) return 0.12;
  return 0;
}

/** 종점 목록 — 현관문과 세대 피난설비 */
export function exitPoints(plan: Plan, g: Grid): ExitPoint[] {
  const out: ExitPoint[] = [];
  for (const d of plan.doors) {
    if (d.kind !== 'entrance') continue;
    // 세대 안쪽으로 한 셀 들어온 지점을 진입 셀로 삼는다
    const inward = d.dir === 'h' ? { x: d.x, y: d.y + d.swing * g.cell } : { x: d.x + d.swing * g.cell, y: d.y };
    let cell = cellAt(g, inward.x, inward.y);
    if (cell < 0 || !g.walk[cell]) cell = nearestWalkable(g, d.x, d.y);
    if (cell < 0) continue;
    out.push({ id: d.id, kind: 'entrance', label: '현관문', x: d.x, y: d.y, cell, dir: d.dir });
  }
  for (const f of plan.facilities) {
    if (f.type !== 'refuge' && f.type !== 'partition' && f.type !== 'downladder') continue;
    const cell = nearestWalkable(g, f.x, f.y);
    if (cell < 0) continue;
    const label = f.type === 'refuge' ? '대피공간' : f.type === 'partition' ? '경량칸막이' : '하향식 피난구';
    out.push({ id: f.id, kind: f.type, label, x: f.x, y: f.y, cell });
  }
  return out;
}

/** 종점 가까이에 찍었는지 — 수동 작도를 여기서 끝맺게 한다 */
export function exitNear(exits: ExitPoint[], p: Pt, tol = 70): ExitPoint | null {
  let best: ExitPoint | null = null;
  let bd = tol;
  for (const e of exits) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d <= bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/** 아직 동선이 없는 구획실 — 하나씩 그려 나가도록 짚어 준다 */
export function roomsMissingRoute(plan: Plan): Room[] {
  const covered = new Set<string>();
  for (const r of plan.routes) {
    if (r.fromRoom) covered.add(r.fromRoom);
  }
  // 직접 그린 동선은 시작점이 어느 실 안인지로 따진다
  for (const r of plan.routes) {
    if (r.fromRoom || r.points.length === 0) continue;
    const s = r.points[0];
    const room = plan.rooms.find(
      (x) => s.x >= x.x && s.x <= x.x + x.w && s.y >= x.y && s.y <= x.y + x.h,
    );
    if (room) covered.add(room.id);
  }
  return routableRooms(plan).filter((r) => !covered.has(r.id));
}

/** 점이 들어 있는 구획실 */
export function roomContaining(plan: Plan, p: Pt): Room | null {
  for (let i = plan.rooms.length - 1; i >= 0; i -= 1) {
    const r = plan.rooms[i];
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return r;
  }
  return null;
}

export interface DistField {
  /** Float64 — 다익스트라 재방문 판정에서 반올림 오차가 생기지 않도록 배정밀도를 쓴다 */
  cost: Float64Array;
  /** 각 셀이 어느 종점에 속하는지 (exits 배열 인덱스) */
  owner: Int16Array;
}

/** 다중 종점 거리장. cost 단위는 cm(가산비용 포함) */
export function distanceField(g: Grid, sources: number[], clear?: Int16Array): DistField {
  const n = g.cols * g.rows;
  const cost = new Float64Array(n).fill(Infinity);
  const owner = new Int16Array(n).fill(-1);
  const cl = clear ?? clearanceField(g);
  const heap = new MinHeap(Math.max(64, n >> 3));
  sources.forEach((s, si) => {
    if (s < 0 || !g.walk[s]) return;
    if (cost[s] > 0) {
      cost[s] = 0;
      owner[s] = si;
      heap.push(0, s);
    }
  });
  const step = g.cell;
  for (;;) {
    const top = heap.pop();
    if (!top) break;
    const i = top.val;
    if (top.key > cost[i]) continue;
    const c = i % g.cols;
    const r = (i - c) / g.cols;
    const nb = [
      c > 0 ? i - 1 : -1,
      c < g.cols - 1 ? i + 1 : -1,
      r > 0 ? i - g.cols : -1,
      r < g.rows - 1 ? i + g.cols : -1,
    ];
    for (const j of nb) {
      if (j < 0 || !g.walk[j]) continue;
      const w = step * (1 + clearancePenalty(cl[j]));
      const nc = cost[i] + w;
      if (nc < cost[j]) {
        cost[j] = nc;
        owner[j] = owner[i];
        heap.push(nc, j);
      }
    }
  }
  return { cost, owner };
}

/** 거리장 내리막 추적 — 시작 셀에서 종점까지의 셀 경로 */
export function tracePath(g: Grid, field: DistField, start: number): number[] {
  if (start < 0 || !isFinite(field.cost[start])) return [];
  const path: number[] = [start];
  let cur = start;
  const guard = g.cols * g.rows;
  for (let k = 0; k < guard; k += 1) {
    if (field.cost[cur] === 0) break;
    const c = cur % g.cols;
    const r = (cur - c) / g.cols;
    const nb = [
      c > 0 ? cur - 1 : -1,
      c < g.cols - 1 ? cur + 1 : -1,
      r > 0 ? cur - g.cols : -1,
      r < g.rows - 1 ? cur + g.cols : -1,
    ];
    let best = -1;
    let bestCost = field.cost[cur];
    for (const j of nb) {
      if (j < 0 || !g.walk[j]) continue;
      if (field.cost[j] < bestCost - 1e-6) {
        bestCost = field.cost[j];
        best = j;
      }
    }
    if (best < 0) break;
    path.push(best);
    cur = best;
  }
  return path;
}

/** 축에 평행한 두 점 사이가 통행 가능한지 */
function segClear(g: Grid, a: Pt, b: Pt): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (g.cell * 0.5)) + 1;
  for (let k = 0; k <= steps; k += 1) {
    const t = k / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const i = cellAt(g, x, y);
    if (i < 0 || !g.walk[i]) return false;
  }
  return true;
}

function lClear(g: Grid, a: Pt, b: Pt, viaX: boolean): Pt | null {
  const corner: Pt = viaX ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  if (segClear(g, a, corner) && segClear(g, corner, b)) return corner;
  return null;
}

/**
 * 셀 경로 → 직각 꺾은선.
 * 같은 방향 구간을 병합한 뒤, 앞선 점에서 가능한 한 먼 점까지 ㄱ자(또는 직선)로 잇는다.
 */
export function simplifyPath(g: Grid, cells: number[]): Pt[] {
  if (cells.length === 0) return [];
  const raw = cells.map((i) => cellCenter(g, i));
  // 방향 전환 지점만 남기기
  const turns: Pt[] = [raw[0]];
  for (let i = 1; i < raw.length - 1; i += 1) {
    const p = raw[i - 1];
    const q = raw[i];
    const s = raw[i + 1];
    const d1x = Math.sign(q.x - p.x);
    const d1y = Math.sign(q.y - p.y);
    const d2x = Math.sign(s.x - q.x);
    const d2y = Math.sign(s.y - q.y);
    if (d1x !== d2x || d1y !== d2y) turns.push(q);
  }
  if (raw.length > 1) turns.push(raw[raw.length - 1]);

  // ㄱ자 연결로 꺾임 최소화
  const out: Pt[] = [turns[0]];
  let i = 0;
  let guard = 0;
  while (i < turns.length - 1 && guard < 500) {
    guard += 1;
    let chosen = i + 1;
    let corner: Pt | null = null;
    for (let j = turns.length - 1; j > i; j -= 1) {
      const a = out[out.length - 1];
      const b = turns[j];
      if (Math.abs(a.x - b.x) < 1 || Math.abs(a.y - b.y) < 1) {
        if (segClear(g, a, b)) {
          chosen = j;
          corner = null;
          break;
        }
      }
      const c1 = lClear(g, a, b, true);
      if (c1) {
        chosen = j;
        corner = c1;
        break;
      }
      const c2 = lClear(g, a, b, false);
      if (c2) {
        chosen = j;
        corner = c2;
        break;
      }
    }
    if (corner) out.push(corner);
    out.push(turns[chosen]);
    i = chosen;
  }
  return dedupe(out);
}

function dedupe(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 1 && Math.abs(last.y - p.y) < 1) continue;
    out.push({ x: Math.round(p.x), y: Math.round(p.y) });
  }
  // 3점 연속 직선이면 중간점 제거
  const res: Pt[] = [];
  for (let i = 0; i < out.length; i += 1) {
    if (i > 0 && i < out.length - 1) {
      const a = out[i - 1];
      const b = out[i];
      const c = out[i + 1];
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) continue;
    }
    res.push(out[i]);
  }
  return res;
}

/**
 * 동선 끝을 종점(문 중심·설비)까지 직각으로 잇는다.
 * 문은 벽에 직교해 통과해야 하므로, 벽 방향을 알면 그에 맞춰 진입 방향을 정한다.
 */
export function appendExit(pts: Pt[], ex: Pt, wallDir?: 'h' | 'v'): Pt[] {
  if (pts.length === 0) return [{ x: Math.round(ex.x), y: Math.round(ex.y) }];
  const out = pts.slice();
  const last = out[out.length - 1];
  const dx = Math.abs(last.x - ex.x);
  const dy = Math.abs(last.y - ex.y);
  if (dx < 1 && dy < 1) return dedupe(out);
  if (dx < 1) {
    out.push({ x: last.x, y: Math.round(ex.y) });
    return dedupe(out);
  }
  if (dy < 1) {
    out.push({ x: Math.round(ex.x), y: last.y });
    return dedupe(out);
  }
  let vertical: boolean;
  if (wallDir) {
    // 가로 벽은 세로로, 세로 벽은 가로로 통과한다
    vertical = wallDir === 'h';
  } else {
    const prev = out.length >= 2 ? out[out.length - 2] : null;
    vertical = prev ? Math.abs(prev.y - last.y) >= 1 : dy >= dx;
  }
  const corner: Pt = vertical
    ? { x: Math.round(ex.x), y: last.y }
    : { x: last.x, y: Math.round(ex.y) };
  out.push(corner);
  out.push({ x: Math.round(ex.x), y: Math.round(ex.y) });
  return dedupe(out);
}

/** 자유 곡선 → 직각 정리 (수동 작도 보정) */
export function orthogonalize(pts: Pt[], tol = 25): Pt[] {
  if (pts.length < 2) return pts.slice();
  const out: Pt[] = [{ x: Math.round(pts[0].x), y: Math.round(pts[0].y) }];
  for (let i = 1; i < pts.length; i += 1) {
    const prev = out[out.length - 1];
    const p = pts[i];
    const dx = Math.abs(p.x - prev.x);
    const dy = Math.abs(p.y - prev.y);
    if (dx < tol && dy < tol) continue;
    if (dx >= dy) {
      out.push({ x: Math.round(p.x), y: prev.y });
      if (dy >= tol) out.push({ x: Math.round(p.x), y: Math.round(p.y) });
    } else {
      out.push({ x: prev.x, y: Math.round(p.y) });
      if (dx >= tol) out.push({ x: Math.round(p.x), y: Math.round(p.y) });
    }
  }
  return dedupe(out);
}

/** 자동 동선 생성 대상 실 */
export function routableRooms(plan: Plan): Room[] {
  return plan.rooms.filter((r) => r.kind === 'room' || r.kind === 'living' || r.kind === 'kitchen');
}

export interface GenerateOptions {
  /** 'entrance' = 현관 종점 주 동선, 'facility' = 피난설비 종점 대체 동선 */
  target: 'entrance' | 'facility';
}

export function generateRoutes(plan: Plan, g: Grid, opts: GenerateOptions): Route[] {
  const all = exitPoints(plan, g);
  const exits = all.filter((e) => (opts.target === 'entrance' ? e.kind === 'entrance' : e.kind !== 'entrance'));
  if (exits.length === 0) return [];
  const clear = clearanceField(g);
  const field = distanceField(
    g,
    exits.map((e) => e.cell),
    clear,
  );
  const routes: Route[] = [];
  for (const room of routableRooms(plan)) {
    const ctr = roomCenter(room);
    const start = nearestWalkable(g, ctr.x, ctr.y);
    if (start < 0 || !isFinite(field.cost[start])) continue;
    const cells = tracePath(g, field, start);
    if (cells.length < 2) continue;
    const pts = simplifyPath(g, cells);
    if (pts.length < 2) continue;
    const ex = exits[Math.max(0, field.owner[start])];
    // 종점을 실제 개구부·설비 좌표에 직각으로 잇는다
    const withExit = appendExit(pts, { x: ex.x, y: ex.y }, ex.dir);
    if (withExit.length < 2) continue;
    routes.push({
      id: nid('rt'),
      kind: opts.target === 'entrance' ? 'primary' : 'alt',
      points: withExit,
      fromRoom: room.id,
      endpoint: ex.kind,
      label: `${room.name} → ${ex.label}`,
    });
  }
  return routes;
}

export interface SegmentMetric {
  from: Pt;
  to: Pt;
  /** m */
  length: number;
  /** s */
  time: number;
  dir: '동' | '서' | '남' | '북' | '사선';
}

export interface RouteMetric {
  routeId: string;
  /** m */
  length: number;
  /** s — 보행 시간만 (인지 시간 제외) */
  walkTime: number;
  segments: SegmentMetric[];
  turns: number;
}

function dirOf(a: Pt, b: Pt): SegmentMetric['dir'] {
  if (a.x === b.x) return b.y > a.y ? '남' : '북';
  if (a.y === b.y) return b.x > a.x ? '동' : '서';
  return '사선';
}

export function routeMetric(route: Route, walker: WalkerKind): RouteMetric {
  const speed = WALK_SPEED[walker];
  const segments: SegmentMetric[] = [];
  let turns = 0;
  for (let i = 1; i < route.points.length; i += 1) {
    const a = route.points[i - 1];
    const b = route.points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y) / 100;
    segments.push({ from: a, to: b, length: len, time: len / speed, dir: dirOf(a, b) });
    if (i >= 2) {
      const p = route.points[i - 2];
      const d1 = dirOf(p, a);
      const d2 = dirOf(a, b);
      if (d1 !== d2) turns += 1;
    }
  }
  const length = polylineLength(route.points) / 100;
  return { routeId: route.id, length, walkTime: length / speed, segments, turns };
}

/** 인지 시간 10초 + 보행 시간 = RSET 근사 */
export const RECOGNITION_TIME = 10;

export function rset(route: Route, walker: WalkerKind): number {
  return RECOGNITION_TIME + routeMetric(route, walker).walkTime;
}
