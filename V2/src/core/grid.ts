/**
 * 벽 조각에서 칸을 계산한다.
 *
 * 벽으로 막혀 모눈 바깥과 이어지지 않는 조각의 묶음이 칸이다. 칸은 저장하지 않고 벽에서 매번 계산한다.
 * 문과 창은 벽 위에 놓이므로 칸의 모양을 바꾸지 않는다.
 *
 * 벽의 두 끝은 언제나 점(정수 좌표)이다. 그래서 비스듬한 벽은 네모를 지날 때 네모를 끝까지 가로지르고,
 * 네모는 볼록한 조각들로 나뉜다. 조각의 열쇠는 이렇다.
 *   `3,2`            네모 전체
 *   `3,2:ne` · `:sw` ↘ 대각선 하나에 나뉜 세모
 *   `3,2:nw` · `:se` ↗ 대각선 하나에 나뉜 세모
 *   `3,2:c3333_6667` 그 밖의 조각 — 네모 안에서 조각 가운데의 자리(만분율)
 *
 * 벽끼리 엇갈리면 한 벽이 여러 토막이 된다. 토막의 열쇠는 벽 열쇠 뒤에 구간을 붙인다(`s:0:0:2:1#0.5-1`).
 * 엇갈리지 않은 벽은 벽 열쇠가 곧 토막 열쇠다. 문과 창은 토막에 달린다.
 */
import { OUT, type Cell, type CellTag, type EdgeInfo, type Layout, type Link, type Neighbor, type Piece, type Plan, type Pt } from './types';

export const hKey = (x: number, y: number): string => `h:${x}:${y}`;
export const vKey = (x: number, y: number): string => `v:${x}:${y}`;
/** ↘ (x,y) 에서 (x+1,y+1) 까지 */
export const dKey = (x: number, y: number): string => `d:${x}:${y}`;
/** ↗ (x,y+1) 에서 (x+1,y) 까지 */
export const uKey = (x: number, y: number): string => `u:${x}:${y}`;
export const sqKey = (x: number, y: number): string => `${x},${y}`;

const EPS = 1e-9;
/** 벽 양쪽을 살필 때 벽에서 떨어지는 거리 */
const SIDE_STEP = 1e-4;

/** 토막 열쇠에서 벽 열쇠만 */
export const wallOf = (key: string): string => key.split('#')[0]!;

/** 가로세로가 아닌 벽인가 */
export function isSlanted(key: string): boolean {
  return key.startsWith('d:') || key.startsWith('u:') || key.startsWith('s:');
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

/** 조각 열쇠에서 네모 자리를 읽는다 */
export function parseSq(key: string): Pt {
  const [x, y] = key.split(':')[0]!.split(',').map(Number);
  return { x: x!, y: y! };
}

const partOf = (key: string): string | undefined => key.split(':')[1];

/** 조각의 가운데 — 표시를 놓고 길이 지나는 자리다 */
export function pieceCenter(key: string): Pt {
  const s = parseSq(key);
  const part = partOf(key);
  if (!part) return { x: s.x + 0.5, y: s.y + 0.5 };
  if (part[0] === 'c') {
    const [fx, fy] = part.slice(1).split('_').map(Number);
    return { x: s.x + fx! / 10000, y: s.y + fy! / 10000 };
  }
  return { x: s.x + (part[1] === 'e' ? 2 / 3 : 1 / 3), y: s.y + (part[0] === 'n' ? 1 / 3 : 2 / 3) };
}

export function parseEdge(key: string): { o: 'h' | 'v' | 'd' | 'u' | 's'; x: number; y: number } {
  const [o, x, y] = wallOf(key).split(':');
  return { o: o as 'h' | 'v' | 'd' | 'u' | 's', x: Number(x), y: Number(y) };
}

/** 벽 조각의 두 끝 점. 왼쪽 끝이 먼저다 */
function wallEnds(key: string): [Pt, Pt] {
  const [o, a, b, c, d] = key.split(':');
  const x = Number(a);
  const y = Number(b);
  switch (o) {
    case 'h':
      return [{ x, y }, { x: x + 1, y }];
    case 'v':
      return [{ x, y }, { x, y: y + 1 }];
    case 'd':
      return [{ x, y }, { x: x + 1, y: y + 1 }];
    case 'u':
      return [{ x, y: y + 1 }, { x: x + 1, y }];
    default:
      return [{ x, y }, { x: Number(c), y: Number(d) }];
  }
}

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** 벽 또는 토막의 두 끝 점 */
export function edgeEnds(key: string): [Pt, Pt] {
  const [wall, span] = key.split('#');
  const [a, b] = wallEnds(wall!);
  if (!span) return [a, b];
  const [t0, t1] = span.split('-').map(Number);
  return [lerp(a, b, t0!), lerp(a, b, t1!)];
}

export function edgeMid(key: string): Pt {
  const [a, b] = edgeEnds(key);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function edgeLength(key: string): number {
  const [a, b] = edgeEnds(key);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** 벽의 기울기(도). 그림에서 문과 창을 돌리는 데 쓴다 */
export function edgeAngle(key: string): number {
  const [a, b] = edgeEnds(key);
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/** 벽에서 둘째 쪽(q)을 향하는 방향. 가로 벽은 아래, 세로 벽은 오른쪽이다 */
export function edgeNormal(key: string): Pt {
  const [a, b] = edgeEnds(key);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  if (a.x === b.x) return { x: 1, y: 0 };
  return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
}

/**
 * 사이에 다른 점이 없는 두 점을 잇는 벽 열쇠.
 * 사이에 점이 있으면 먼저 `segmentEdges` 로 나눈다.
 */
export function edgeBetween(a: Pt, b: Pt): string {
  if (a.y === b.y) return hKey(Math.min(a.x, b.x), a.y);
  if (a.x === b.x) return vKey(a.x, Math.min(a.y, b.y));
  const left = a.x < b.x ? a : b;
  const right = a.x < b.x ? b : a;
  if (right.x - left.x === 1 && Math.abs(right.y - left.y) === 1) {
    return left.y < right.y ? dKey(left.x, left.y) : uKey(left.x, right.y);
  }
  return `s:${left.x}:${left.y}:${right.x}:${right.y}`;
}

/** 두 점 사이의 줄이 지나는 점들. 양 끝을 포함한다 */
export function dotsBetween(a: Pt, b: Pt): Pt[] {
  const n = gcd(b.x - a.x, b.y - a.y);
  if (n === 0) return [a];
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
}

/** 두 점을 곧게 잇는 벽 조각들. 줄 위의 점마다 나뉜다 */
export function segmentEdges(a: Pt, b: Pt): string[] {
  const dots = dotsBetween(a, b);
  return dots.slice(1).map((d, i) => edgeBetween(dots[i]!, d));
}

const inGrid = (plan: Plan, s: Pt): boolean => s.x >= 0 && s.y >= 0 && s.x < plan.cols && s.y < plan.rows;

const cross = (a: Pt, b: Pt, p: Pt): number => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);

/** 볼록 다각형을 줄로 자른다. 줄이 가로지르지 않으면 그대로다 */
function splitConvex(poly: Pt[], a: Pt, b: Pt): Pt[][] {
  const sides = poly.map((p) => cross(a, b, p));
  if (!sides.some((s) => s > EPS) || !sides.some((s) => s < -EPS)) return [poly];
  const left: Pt[] = [];
  const right: Pt[] = [];
  poly.forEach((p, i) => {
    const s = sides[i]!;
    const nextS = sides[(i + 1) % poly.length]!;
    if (s >= -EPS) left.push(p);
    if (s <= EPS) right.push(p);
    if ((s > EPS && nextS < -EPS) || (s < -EPS && nextS > EPS)) {
      const hit = lerp(p, poly[(i + 1) % poly.length]!, s / (s - nextS));
      left.push(hit);
      right.push(hit);
    }
  });
  return [left, right];
}

function polygonArea(poly: Pt[]): number {
  let sum = 0;
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    sum += p.x * q.y - q.x * p.y;
  });
  return Math.abs(sum) / 2;
}

function polygonCentroid(poly: Pt[]): Pt {
  let x = 0;
  let y = 0;
  let twice = 0;
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    const c = p.x * q.y - q.x * p.y;
    x += (p.x + q.x) * c;
    y += (p.y + q.y) * c;
    twice += c;
  });
  return { x: x / (3 * twice), y: y / (3 * twice) };
}

/** 볼록 다각형 안의 점인가. 테두리도 안이다 */
export function inPolygon(poly: Pt[], p: Pt): boolean {
  let plus = false;
  let minus = false;
  poly.forEach((a, i) => {
    const s = cross(a, poly[(i + 1) % poly.length]!, p);
    if (s > EPS) plus = true;
    if (s < -EPS) minus = true;
  });
  return !(plus && minus);
}

/** 선분을 네모로 잘라 그 안에 든 구간을 돌려준다. 없으면 null */
export function clipSegment(a: Pt, b: Pt, x0: number, y0: number, x1: number, y1: number): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const pairs: [number, number][] = [[-dx, a.x - x0], [dx, x1 - a.x], [-dy, a.y - y0], [dy, y1 - a.y]];
  for (const [p, q] of pairs) {
    if (Math.abs(p) < EPS) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

/** 네모마다 그 네모를 가로지르는 줄들 */
function chordsBySquare(plan: Plan, walls: string[]): Map<string, { wall: string; a: Pt; b: Pt }[]> {
  const out = new Map<string, { wall: string; a: Pt; b: Pt }[]>();
  for (const wall of walls) {
    if (!isSlanted(wall)) continue;
    const [a, b] = wallEnds(wall);
    for (let x = Math.min(a.x, b.x); x < Math.max(a.x, b.x); x++) {
      for (let y = Math.min(a.y, b.y); y < Math.max(a.y, b.y); y++) {
        if (!inGrid(plan, { x, y })) continue;
        const span = clipSegment(a, b, x, y, x + 1, y + 1);
        if (!span || span[1] - span[0] < 1e-6) continue;
        const key = sqKey(x, y);
        if (!out.has(key)) out.set(key, []);
        out.get(key)!.push({ wall, a, b });
      }
    }
  }
  return out;
}

const digits4 = (v: number): string => String(Math.round(v * 10000));

function makePieces(plan: Plan, walls: string[]): Map<string, Piece[]> {
  const chords = chordsBySquare(plan, walls);
  const pieces = new Map<string, Piece[]>();
  for (let y = 0; y < plan.rows; y++) {
    for (let x = 0; x < plan.cols; x++) {
      const sq = sqKey(x, y);
      const square: Pt[] = [{ x, y }, { x: x + 1, y }, { x: x + 1, y: y + 1 }, { x, y: y + 1 }];
      const lines = chords.get(sq);
      if (!lines) {
        pieces.set(sq, [{ x, y, key: sq, whole: true, center: { x: x + 0.5, y: y + 0.5 }, polygon: square, area: 1 }]);
        continue;
      }
      let polys = [square];
      for (const { a, b } of lines) polys = polys.flatMap((poly) => splitConvex(poly, a, b));
      const only = lines.length === 1 ? lines[0]!.wall : '';
      const made = polys
        .map((polygon) => ({ polygon, area: polygonArea(polygon) }))
        .filter((p) => p.area > 1e-6)
        .map(({ polygon, area }): Piece => {
          const c = polygonCentroid(polygon);
          const fx = c.x - x;
          const fy = c.y - y;
          let key: string;
          if (only.startsWith('d:')) key = `${sq}:${fx > fy ? 'ne' : 'sw'}`;
          else if (only.startsWith('u:')) key = `${sq}:${fx + fy < 1 ? 'nw' : 'se'}`;
          else key = `${sq}:c${digits4(fx)}_${digits4(fy)}`;
          return { x, y, key, whole: false, center: pieceCenter(key), polygon, area };
        })
        .sort((p, q) => (p.key < q.key ? -1 : 1));
      pieces.set(sq, made);
    }
  }
  return pieces;
}

type Side = 'n' | 'e' | 's' | 'w';

/** 조각이 네모의 한 변에서 차지하는 구간 */
function sideSpan(piece: Piece, side: Side): [number, number] | null {
  const along = side === 'n' || side === 's' ? 'x' : 'y';
  const fixed = side === 'n' ? piece.y : side === 's' ? piece.y + 1 : side === 'w' ? piece.x : piece.x + 1;
  const across = side === 'n' || side === 's' ? 'y' : 'x';
  const on = piece.polygon.filter((p) => Math.abs(p[across] - fixed) < EPS).map((p) => p[along]);
  if (on.length < 2) return null;
  const lo = Math.min(...on);
  const hi = Math.max(...on);
  return hi - lo > 1e-6 ? [lo, hi] : null;
}

const OPPOSITE: Record<Side, Side> = { n: 's', s: 'n', e: 'w', w: 'e' };
const STEP: Record<Side, Pt> = { n: { x: 0, y: -1 }, s: { x: 0, y: 1 }, e: { x: 1, y: 0 }, w: { x: -1, y: 0 } };

function neighborsOf(piece: Piece, pieces: Map<string, Piece[]>): Neighbor[] {
  const out: Neighbor[] = [];
  for (const side of ['n', 'e', 's', 'w'] as Side[]) {
    const span = sideSpan(piece, side);
    if (!span) continue;
    const sq = { x: piece.x + STEP[side].x, y: piece.y + STEP[side].y };
    const edge = side === 'n' ? hKey(piece.x, piece.y) : side === 's' ? hKey(piece.x, piece.y + 1) : side === 'w' ? vKey(piece.x, piece.y) : vKey(piece.x + 1, piece.y);
    const fixed = side === 'n' ? piece.y : side === 's' ? piece.y + 1 : side === 'w' ? piece.x : piece.x + 1;
    const portal = (lo: number, hi: number): Pt => {
      const mid = (lo + hi) / 2;
      return side === 'n' || side === 's' ? { x: mid, y: fixed } : { x: fixed, y: mid };
    };
    const others = pieces.get(sqKey(sq.x, sq.y));
    if (!others) {
      out.push({ to: sqKey(sq.x, sq.y), sq, edge, portal: portal(span[0], span[1]) });
      continue;
    }
    for (const other of others) {
      const theirs = sideSpan(other, OPPOSITE[side]);
      if (!theirs) continue;
      const lo = Math.max(span[0], theirs[0]);
      const hi = Math.min(span[1], theirs[1]);
      if (hi - lo > 1e-6) out.push({ to: other.key, sq, edge, portal: portal(lo, hi) });
    }
  }
  return out;
}

/** 조각의 표지. 벽을 긋거나 지워 조각이 바뀌어도 표지를 잃지 않게 같은 네모의 옛 조각도 찾아본다 */
export function tagFor(tags: Plan['tags'], piece: { key: string; polygon: Pt[]; whole: boolean }): CellTag | undefined {
  const exact = tags[piece.key];
  if (exact) return exact;
  const sq = piece.key.split(':')[0]!;
  if (!piece.whole && tags[sq]) return tags[sq];
  const prefix = `${sq}:`;
  for (const key of Object.keys(tags)) {
    if (key.startsWith(prefix) && (piece.whole || inPolygon(piece.polygon, pieceCenter(key)))) return tags[key];
  }
  return undefined;
}

function locate(pieces: Map<string, Piece[]>, p: Pt): string {
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  const here = pieces.get(sqKey(x, y));
  if (!here) return sqKey(x, y);
  if (here.length === 1) return here[0]!.key;
  const hit = here.find((piece) => inPolygon(piece.polygon, p));
  if (hit) return hit.key;
  return here.reduce((best, piece) =>
    Math.hypot(piece.center.x - p.x, piece.center.y - p.y) < Math.hypot(best.center.x - p.x, best.center.y - p.y) ? piece : best,
  ).key;
}

/** 벽마다 다른 벽과 엇갈리는 자리(0~1) */
function crossings(walls: string[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const slanted = walls.filter(isSlanted);
  const add = (wall: string, t: number) => {
    if (!out.has(wall)) out.set(wall, []);
    out.get(wall)!.push(t);
  };
  for (const s of slanted) {
    const [a, b] = wallEnds(s);
    for (const other of walls) {
      if (other === s) continue;
      // 비스듬한 벽끼리는 한 번만 잰다
      if (isSlanted(other) && other < s) continue;
      const [c, d] = wallEnds(other);
      const denom = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
      if (Math.abs(denom) < EPS) continue;
      const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denom;
      const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / denom;
      if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) {
        add(s, t);
        add(other, u);
      }
    }
  }
  return out;
}

function sidesAt(pieces: Map<string, Piece[]>, mid: Pt, normal: Pt): [string, string] {
  return [
    locate(pieces, { x: mid.x - normal.x * SIDE_STEP, y: mid.y - normal.y * SIDE_STEP }),
    locate(pieces, { x: mid.x + normal.x * SIDE_STEP, y: mid.y + normal.y * SIDE_STEP }),
  ];
}

const fmtT = (t: number): string => String(Math.round(t * 10000) / 10000);

function makeEdges(walls: string[], pieces: Map<string, Piece[]>): Map<string, EdgeInfo> {
  const cuts = crossings(walls);
  const edges = new Map<string, EdgeInfo>();
  for (const wall of walls) {
    const [a, b] = wallEnds(wall);
    const ts = [...new Set(cuts.get(wall) ?? [])].sort((x, y) => x - y);
    const stops = [0, ...ts, 1];
    for (let i = 1; i < stops.length; i++) {
      const t0 = stops[i - 1]!;
      const t1 = stops[i]!;
      if (t1 - t0 < 1e-6) continue;
      const key = stops.length === 2 ? wall : `${wall}#${fmtT(t0)}-${fmtT(t1)}`;
      const from = lerp(a, b, t0);
      const to = lerp(a, b, t1);
      const mid = lerp(from, to, 0.5);
      edges.set(key, { key, wall, a: from, b: to, mid, sides: sidesAt(pieces, mid, edgeNormal(wall)), t0, t1, hidden: false });
    }
  }
  return edges;
}

export function analyze(plan: Plan): Layout {
  const walls = new Set(plan.walls);
  const pieces = makePieces(plan, plan.walls);
  const all = [...pieces.values()].flat();
  const adjacent = new Map<string, Neighbor[]>(all.map((p) => [p.key, neighborsOf(p, pieces)]));

  // 모눈 가장자리에서 벽이 없는 쪽은 바깥과 이어진다
  const outside = new Set<string>();
  const stack: string[] = [];
  for (const piece of all) {
    if (adjacent.get(piece.key)!.some((n) => !inGrid(plan, n.sq) && !walls.has(n.edge))) {
      outside.add(piece.key);
      stack.push(piece.key);
    }
  }
  while (stack.length) {
    const key = stack.pop()!;
    for (const n of adjacent.get(key)!) {
      if (!inGrid(plan, n.sq) || walls.has(n.edge) || outside.has(n.to)) continue;
      outside.add(n.to);
      stack.push(n.to);
    }
  }

  // 남은 조각을 묶어 칸으로 만든다
  const byKey = new Map(all.map((p) => [p.key, p]));
  const cells: Cell[] = [];
  const cellAt = new Map<string, string>();
  for (const first of all) {
    const start = first.key;
    if (outside.has(start) || cellAt.has(start)) continue;
    const keys: string[] = [];
    const queue = [start];
    cellAt.set(start, start);
    while (queue.length) {
      const key = queue.shift()!;
      keys.push(key);
      for (const n of adjacent.get(key)!) {
        if (!inGrid(plan, n.sq) || walls.has(n.edge) || cellAt.has(n.to)) continue;
        cellAt.set(n.to, start);
        queue.push(n.to);
      }
    }
    // 표지는 위에서 아래, 왼쪽에서 오른쪽으로 먼저 만나는 것을 쓴다
    const ordered = keys.map((k) => byKey.get(k)!).sort((p, q) => p.y - q.y || p.x - q.x || (p.key < q.key ? -1 : 1));
    const tagged = ordered.map((p) => tagFor(plan.tags, p)).find(Boolean) ?? null;
    const area = ordered.reduce((sum, p) => sum + p.area, 0);
    const cx = ordered.reduce((sum, p) => sum + p.center.x * p.area, 0) / area;
    const cy = ordered.reduce((sum, p) => sum + p.center.y * p.area, 0) / area;
    // 글자는 되도록 네모 전체에 놓는다. 작은 조각은 글자가 벽에 걸린다
    const whole = ordered.filter((p) => p.whole);
    const roomy = ordered.filter((p) => p.area >= 0.3);
    const choices = whole.length ? whole : roomy.length ? roomy : ordered;
    const anchor = choices.reduce((best, p) =>
      Math.hypot(p.center.x - cx, p.center.y - cy) < Math.hypot(best.center.x - cx, best.center.y - cy) ? p : best,
    );
    cells.push({ id: start, squares: ordered, anchor: anchor.center, area, kind: tagged?.kind ?? null, name: tagged?.name ?? null });
  }

  const edges = makeEdges(plan.walls, pieces);

  // 칸에 붙은 벽을 넘어 집 밖으로 삐져나온 꼬리는 벽이 아니다. 점이 벽 위에 없어 넘겨 그을 수밖에 없다
  for (const info of edges.values()) {
    if (cellAt.has(info.sides[0]) || cellAt.has(info.sides[1])) continue;
    const ends: Pt[] = [];
    if (info.t0 > 0) ends.push(info.a);
    if (info.t1 < 1) ends.push(info.b);
    info.hidden = ends.some((p) =>
      [0, 1, 2, 3, 4, 5, 6, 7].some((i) => {
        const angle = (i * Math.PI) / 4 + 0.2;
        return cellAt.has(locate(pieces, { x: p.x + Math.cos(angle) * 0.01, y: p.y + Math.sin(angle) * 0.01 }));
      }),
    );
  }

  const links: Link[] = [];
  for (const [edge, kind] of Object.entries(plan.openings)) {
    const info = edges.get(edge);
    if (kind !== 'door' || !info) continue;
    const [p, q] = info.sides;
    const a = cellAt.get(p) ?? OUT;
    const b = cellAt.get(q) ?? OUT;
    if (a === b) continue;
    links.push(a === OUT ? { edge, a: b, b: OUT } : { edge, a, b });
  }
  links.sort((l, m) => (l.edge < m.edge ? -1 : 1));

  return { cells, byId: new Map(cells.map((c) => [c.id, c])), cellAt, links, pieces, adjacent, edges };
}

/** 화면에 보이는 벽 토막 열쇠들 */
export function edgeKeys(layout: Layout): string[] {
  return [...layout.edges.values()].filter((e) => !e.hidden).map((e) => e.key);
}

/** 벽 토막 양쪽의 조각 열쇠. 모눈 밖일 수 있다 */
export function edgeSides(layout: Layout, key: string): [string, string] {
  return layout.edges.get(key)?.sides ?? sidesAt(layout.pieces, edgeMid(key), edgeNormal(key));
}

/** 지도 위 한 점이 속한 조각의 열쇠 */
export function pieceKeyAt(layout: Layout, p: Pt): string {
  return locate(layout.pieces, p);
}

/** 지도 위 한 점이 속한 칸의 id. 집 밖이면 없다 */
export function cellIdAt(layout: Layout, p: Pt): string | undefined {
  return layout.cellAt.get(pieceKeyAt(layout, p));
}

/** 칸 c 에서 문 하나로 갈 수 있는 곳 (칸 id 또는 `out`) */
export function reachableFrom(layout: Layout, id: string): { to: string; edge: string }[] {
  const out: { to: string; edge: string }[] = [];
  for (const l of layout.links) {
    if (l.a === id) out.push({ to: l.b, edge: l.edge });
    else if (l.b === id) out.push({ to: l.a, edge: l.edge });
  }
  return out;
}

/** 벽 토막이 집 겉벽인가 — 한쪽이 칸이고 다른 쪽이 바깥이다 */
export function isExterior(layout: Layout, edge: string): boolean {
  const [p, q] = edgeSides(layout, edge);
  return layout.cellAt.has(p) !== layout.cellAt.has(q);
}

/** 벽 토막이 두 칸 사이의 벽인가 */
export function isInterior(layout: Layout, edge: string): boolean {
  const [p, q] = edgeSides(layout, edge);
  const a = layout.cellAt.get(p);
  const b = layout.cellAt.get(q);
  return Boolean(a && b && a !== b);
}

/** 칸 id 에서 밖까지의 가장 짧은 길. 없으면 null. avoid 에 든 칸과 문은 지나지 않는다 */
export function shortestPath(
  layout: Layout,
  from: string,
  avoid: { cells?: Set<string>; edges?: Set<string> } = {},
): { to: string; edge: string }[] | null {
  const prev = new Map<string, { from: string; edge: string }>();
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length) {
    const here = queue.shift()!;
    for (const n of reachableFrom(layout, here)) {
      if (seen.has(n.to) || avoid.edges?.has(n.edge) || avoid.cells?.has(n.to)) continue;
      seen.add(n.to);
      prev.set(n.to, { from: here, edge: n.edge });
      if (n.to === OUT) {
        const path: { to: string; edge: string }[] = [];
        let at = OUT;
        while (at !== from) {
          const p = prev.get(at)!;
          path.unshift({ to: at, edge: p.edge });
          at = p.from;
        }
        return path;
      }
      queue.push(n.to);
    }
  }
  return null;
}

/** 아무 문으로도 밖까지 이어지지 않는 칸들 */
export function unreachableCells(layout: Layout): Cell[] {
  const seen = new Set<string>();
  const queue = layout.links.filter((l) => l.b === OUT).map((l) => l.a);
  queue.forEach((id) => seen.add(id));
  while (queue.length) {
    const here = queue.shift()!;
    for (const n of reachableFrom(layout, here)) {
      if (n.to === OUT || seen.has(n.to)) continue;
      seen.add(n.to);
      queue.push(n.to);
    }
  }
  return layout.cells.filter((c) => !seen.has(c.id));
}

/**
 * 칸 안의 조각을 따라 from 조각에서 to 조각까지 가는 점들.
 * 조각은 볼록하므로 가운데와 맞닿은 변의 가운데를 번갈아 지나면 벽을 뚫지 않는다.
 */
export function walkInCell(plan: Plan, layout: Layout, cellId: string, from: string, to: string): Pt[] {
  const walls = new Set(plan.walls);
  const prev = new Map<string, { key: string; portal: Pt }>();
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length) {
    const key = queue.shift()!;
    if (key === to) break;
    for (const n of layout.adjacent.get(key) ?? []) {
      if (seen.has(n.to) || walls.has(n.edge) || layout.cellAt.get(n.to) !== cellId) continue;
      seen.add(n.to);
      prev.set(n.to, { key, portal: n.portal });
      queue.push(n.to);
    }
  }
  const out: Pt[] = [];
  let at = to;
  for (;;) {
    out.unshift(pieceCenter(at));
    const step = prev.get(at);
    if (at === from || !step) break;
    out.unshift(step.portal);
    at = step.key;
  }
  return simplify(out);
}

/** 한 줄로 이어지는 점을 줄인다 */
export function simplify(points: Pt[]): Pt[] {
  if (points.length < 3) return points;
  const out: Pt[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1]!;
    const b = points[i]!;
    const c = points[i + 1]!;
    const forward = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) >= 0;
    if (!(Math.abs(cross(a, c, b)) < 1e-6 && forward)) out.push(b);
  }
  out.push(points[points.length - 1]!);
  return out;
}

/** 문 토막에서 칸 쪽 조각의 열쇠 */
export function doorSquareFor(layout: Layout, edge: string, cellId: string): string {
  const [p, q] = edgeSides(layout, edge);
  return layout.cellAt.get(p) === cellId ? p : q;
}

/** 벽 조각이 모눈 안에 드는가 */
export function edgeInGrid(plan: Plan, key: string): boolean {
  const [a, b] = wallEnds(wallOf(key));
  const ok = (p: Pt): boolean => p.x >= 0 && p.y >= 0 && p.x <= plan.cols && p.y <= plan.rows;
  return ok(a) && ok(b);
}
