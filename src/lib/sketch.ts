/**
 * 자유 그리기 보정.
 *
 * 마우스로 삐뚤삐뚤 그린 선을 건축 도면다운 직선으로 편다.
 * 도화지에 집을 그리듯 그리게 하되, 손을 떼는 순간 반듯해지는 것이 목표다.
 *
 *   1) 닫힌 모양      → 방 (ㄱ자·ㄷ자도 사각형 여러 개로 나눠 받는다)
 *   2) 방을 가로지른 선 → 벽 (그 방을 둘로 나눈다)
 *   3) 벽 위에 그은 선  → 문·창 (선 길이가 개구부 폭이 된다)
 *
 * 화면과 무관한 순수 계층이라 그대로 검증할 수 있다.
 */
import { Plan, Pt, Room, RoomKind } from './types';
import { nearestWallSegment } from './walls';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StraightenOptions {
  /** 좌표를 맞출 격자 간격(cm) */
  grid?: number;
  /** 이보다 짧은 구간은 앞 구간에 흡수한다(cm) */
  minSeg?: number;
  /** 꼭짓점 단순화 허용 오차(cm) */
  tolerance?: number;
}

const DEFAULTS: Required<StraightenOptions> = {
  grid: 5,
  minSeg: 25,
  tolerance: 18,
};

/* ------------------------------------------------------------------ */
/* 1. 단순화                                                           */
/* ------------------------------------------------------------------ */

function perpDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ramer–Douglas–Peucker — 손떨림으로 생긴 잔점을 걷어낸다 */
export function simplify(points: Pt[], tolerance: number): Pt[] {
  if (points.length <= 2) return points.slice();
  let worst = 0;
  let index = 0;
  const a = points[0];
  const b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = perpDistance(points[i], a, b);
    if (d > worst) {
      worst = d;
      index = i;
    }
  }
  if (worst <= tolerance) return [a, b];
  const left = simplify(points.slice(0, index + 1), tolerance);
  const right = simplify(points.slice(index), tolerance);
  return left.slice(0, -1).concat(right);
}

/* ------------------------------------------------------------------ */
/* 2. 직선 보정                                                        */
/* ------------------------------------------------------------------ */

const snapTo = (v: number, g: number) => (g > 0 ? Math.round(v / g) * g : Math.round(v));

/**
 * 자유 곡선 → 수평·수직 구간만으로 이루어진 꺾은선.
 * 구간마다 긴 축을 골라 붙이고, 같은 축이 이어지면 하나로 합친다.
 */
export function straighten(raw: Pt[], options: StraightenOptions = {}): Pt[] {
  const o = { ...DEFAULTS, ...options };
  if (raw.length < 2) return raw.map((p) => ({ x: snapTo(p.x, o.grid), y: snapTo(p.y, o.grid) }));

  const pts = simplify(raw, o.tolerance);
  const out: Pt[] = [{ x: snapTo(pts[0].x, o.grid), y: snapTo(pts[0].y, o.grid) }];
  let lastAxis: 'h' | 'v' | null = null;

  for (let i = 1; i < pts.length; i += 1) {
    const prev = out[out.length - 1];
    const p = pts[i];
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    const axis: 'h' | 'v' = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    const next: Pt =
      axis === 'h' ? { x: snapTo(p.x, o.grid), y: prev.y } : { x: prev.x, y: snapTo(p.y, o.grid) };
    if (Math.abs(next.x - prev.x) < 1 && Math.abs(next.y - prev.y) < 1) continue;
    if (axis === lastAxis) out[out.length - 1] = next;
    else {
      out.push(next);
      lastAxis = axis;
    }
  }

  return dropShortSegments(out, o.minSeg);
}

/** 짧은 구간을 앞뒤로 흡수해 삐죽한 계단을 없앤다 */
function dropShortSegments(pts: Pt[], minSeg: number): Pt[] {
  if (pts.length <= 2) return pts;
  let cur = pts.slice();
  for (let guard = 0; guard < 40; guard += 1) {
    let removed = false;
    for (let i = 1; i < cur.length - 1; i += 1) {
      const a = cur[i - 1];
      const b = cur[i];
      const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      if (len >= minSeg) continue;
      // 짧은 구간의 끝점을 앞 점에 맞춰 없앤다
      const next = cur[i + 1];
      const merged: Pt = { x: a.x === b.x ? a.x : next.x, y: a.y === b.y ? a.y : next.y };
      cur = cur.slice(0, i).concat([{ x: a.x, y: a.y }], cur.slice(i + 1));
      cur[i] = { x: a.x === b.x ? a.x : merged.x, y: a.y === b.y ? a.y : merged.y };
      removed = true;
      break;
    }
    if (!removed) break;
  }
  return collapse(cur);
}

function collapse(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 1 && Math.abs(last.y - p.y) < 1) continue;
    out.push(p);
  }
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

/** 시작점과 끝점이 가까우면 닫힌 모양으로 본다 */
export function looksClosed(raw: Pt[]): boolean {
  if (raw.length < 4) return false;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of raw) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const diag = Math.hypot(x1 - x0, y1 - y0);
  if (diag < 80) return false;
  const gap = Math.hypot(raw[0].x - raw[raw.length - 1].x, raw[0].y - raw[raw.length - 1].y);
  return gap < Math.max(60, diag * 0.28);
}

/**
 * 닫힌 자유 곡선 → 직각 다각형.
 * 끝을 시작점에 정확히 물리고, 수평·수직이 번갈아 나오도록 정리한다.
 */
export function straightenLoop(raw: Pt[], options: StraightenOptions = {}): Pt[] {
  const o = { ...DEFAULTS, ...options };
  const open = straighten(raw, o);
  if (open.length < 3) return [];
  const poly = open.slice();
  const first = poly[0];
  const last = poly[poly.length - 1];
  if (Math.abs(last.x - first.x) > 0.5 || Math.abs(last.y - first.y) > 0.5) {
    const prev = poly[poly.length - 2];
    const lastAxis: 'h' | 'v' = Math.abs(prev.y - last.y) < 0.5 ? 'h' : 'v';
    // 마지막 구간과 다른 축으로 한 번 꺾어 시작점에 붙인다
    if (lastAxis === 'h') {
      if (Math.abs(last.x - first.x) > 0.5) poly.push({ x: last.x, y: first.y });
      poly.push({ x: first.x, y: first.y });
    } else {
      if (Math.abs(last.y - first.y) > 0.5) poly.push({ x: first.x, y: last.y });
      poly.push({ x: first.x, y: first.y });
    }
  }
  const closed = collapse(poly);
  // 마지막 점은 시작점과 같으므로 뺀다
  if (
    closed.length > 1 &&
    Math.abs(closed[0].x - closed[closed.length - 1].x) < 1 &&
    Math.abs(closed[0].y - closed[closed.length - 1].y) < 1
  ) {
    closed.pop();
  }
  return closed.length >= 4 ? closed : [];
}

/* ------------------------------------------------------------------ */
/* 3. 직각 다각형 → 사각형 여러 개                                      */
/* ------------------------------------------------------------------ */

export function pointInPolygon(poly: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function uniq(values: number[]): number[] {
  const sorted = values.slice().sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) if (out.length === 0 || Math.abs(out[out.length - 1] - v) > 0.5) out.push(v);
  return out;
}

/**
 * 격자선으로 잘라 낸 칸 가운데 조건을 만족하는 것들을 최대 사각형으로 묶는다.
 * 다각형 분해와 기존 실 피하기에 모두 쓴다.
 */
export function decompose(
  xs: number[],
  ys: number[],
  inside: (cx: number, cy: number) => boolean,
  minSize = 40,
): Rect[] {
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  if (cols < 1 || rows < 1) return [];
  const cell = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cx = (xs[c] + xs[c + 1]) / 2;
      const cy = (ys[r] + ys[r + 1]) / 2;
      if (inside(cx, cy)) cell[r * cols + c] = 1;
    }
  }
  const used = new Uint8Array(cols * rows);
  const out: Rect[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      if (!cell[i] || used[i]) continue;
      // 오른쪽으로 최대한 늘린다
      let c2 = c;
      while (c2 + 1 < cols && cell[r * cols + c2 + 1] && !used[r * cols + c2 + 1]) c2 += 1;
      // 그 폭 그대로 아래로 최대한 늘린다
      let r2 = r;
      for (;;) {
        const nr = r2 + 1;
        if (nr >= rows) break;
        let ok = true;
        for (let cc = c; cc <= c2; cc += 1) {
          if (!cell[nr * cols + cc] || used[nr * cols + cc]) {
            ok = false;
            break;
          }
        }
        if (!ok) break;
        r2 = nr;
      }
      for (let rr = r; rr <= r2; rr += 1) for (let cc = c; cc <= c2; cc += 1) used[rr * cols + cc] = 1;
      const rect = { x: xs[c], y: ys[r], w: xs[c2 + 1] - xs[c], h: ys[r2 + 1] - ys[r] };
      if (rect.w >= minSize && rect.h >= minSize) out.push(rect);
    }
  }
  return out;
}

/** 직각 다각형을 사각형들로 나눈다. 기존 실과 겹치는 부분은 뺀다. */
export function polygonToRects(poly: Pt[], avoid: Rect[] = [], minSize = 40): Rect[] {
  if (poly.length < 4) return [];
  const xs = uniq(poly.map((p) => p.x).concat(avoid.flatMap((r) => [r.x, r.x + r.w])));
  const ys = uniq(poly.map((p) => p.y).concat(avoid.flatMap((r) => [r.y, r.y + r.h])));
  const x0 = Math.min(...poly.map((p) => p.x));
  const x1 = Math.max(...poly.map((p) => p.x));
  const y0 = Math.min(...poly.map((p) => p.y));
  const y1 = Math.max(...poly.map((p) => p.y));
  const bx = xs.filter((v) => v >= x0 - 0.5 && v <= x1 + 0.5);
  const by = ys.filter((v) => v >= y0 - 0.5 && v <= y1 + 0.5);
  return decompose(
    bx,
    by,
    (cx, cy) =>
      pointInPolygon(poly, cx, cy) &&
      !avoid.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h),
    minSize,
  );
}

/* ------------------------------------------------------------------ */
/* 4. 그린 선의 뜻 해석                                                */
/* ------------------------------------------------------------------ */

export type SketchMode = 'auto' | 'room' | 'wall' | 'opening';

export interface SketchOptions extends StraightenOptions {
  mode?: SketchMode;
  /** 개구부로 볼 최소·최대 길이(cm) */
  openingRange?: [number, number];
}

export type SketchResult =
  | { kind: 'rooms'; outline: Pt[]; rects: Rect[] }
  | { kind: 'split'; outline: Pt[]; roomId: string; axis: 'h' | 'v'; at: number }
  | { kind: 'opening'; outline: Pt[]; x: number; y: number; dir: 'h' | 'v'; width: number }
  | { kind: 'none'; outline: Pt[]; reason: string };

function boundsOf(pts: Pt[]): Rect {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function roomRects(plan: Plan): Rect[] {
  return plan.rooms.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
}

/** 곧게 편 선 전체가 한 벽 위에 놓여 있으면 개구부로 본다 */
function asOpening(plan: Plan, line: Pt[], range: [number, number]): SketchResult | null {
  if (line.length !== 2 || plan.rooms.length === 0) return null;
  const [a, b] = line;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < range[0] || len > range[1]) return null;
  const dir: 'h' | 'v' = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'h' : 'v';
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const hit = nearestWallSegment(plan.rooms, mid, 40);
  if (!hit || hit.dir !== dir) return null;
  // 양 끝도 같은 벽 위에 있어야 한다 (방을 가로지른 선과 구분)
  for (const p of [a, b, mid]) {
    const across = dir === 'h' ? Math.abs(p.y - hit.line) : Math.abs(p.x - hit.line);
    if (across > 40) return null;
  }
  const along = dir === 'h' ? mid.x : mid.y;
  if (along < hit.a + len / 2 - 1 || along > hit.b - len / 2 + 1) return null;
  const width = Math.max(range[0], Math.min(range[1], Math.round(len / 5) * 5));
  return {
    kind: 'opening',
    outline: line,
    x: Math.round(dir === 'h' ? along : hit.line),
    y: Math.round(dir === 'h' ? hit.line : along),
    dir,
    width,
  };
}

/** 방을 가로지른 선이면 그 방을 둘로 나눈다 */
function asSplit(plan: Plan, line: Pt[]): SketchResult | null {
  if (line.length < 2) return null;
  const a = line[0];
  const b = line[line.length - 1];
  const dir: 'h' | 'v' = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'h' : 'v';
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const room = plan.rooms.find(
    (r) => mid.x > r.x && mid.x < r.x + r.w && mid.y > r.y && mid.y < r.y + r.h,
  );
  if (!room) return null;
  const margin = 40;
  if (dir === 'h') {
    // 가로선 → 위아래로 나눈다
    const at = Math.round((a.y + b.y) / 2);
    if (at < room.y + margin || at > room.y + room.h - margin) return null;
    const span = Math.abs(b.x - a.x);
    if (span < room.w * 0.5) return null;
    return { kind: 'split', outline: line, roomId: room.id, axis: 'h', at };
  }
  const at = Math.round((a.x + b.x) / 2);
  if (at < room.x + margin || at > room.x + room.w - margin) return null;
  const span = Math.abs(b.y - a.y);
  if (span < room.h * 0.5) return null;
  return { kind: 'split', outline: line, roomId: room.id, axis: 'v', at };
}

/**
 * 그린 선 하나를 해석한다.
 * 개구부 → 방 → 벽 순으로 본다. 개구부를 먼저 보는 것은,
 * 벽 위에 짧게 그은 선이 방 분할로 오해받지 않게 하기 위함이다.
 */
export function interpretStroke(plan: Plan, raw: Pt[], options: SketchOptions = {}): SketchResult {
  const o = { ...DEFAULTS, ...options };
  const mode: SketchMode = options.mode ?? 'auto';
  const range: [number, number] = options.openingRange ?? [60, 280];

  if (raw.length < 2) return { kind: 'none', outline: [], reason: '너무 짧게 그렸다.' };

  const closed = mode === 'room' || (mode === 'auto' && looksClosed(raw));

  if (closed) {
    const poly = straightenLoop(raw, o);
    if (poly.length >= 4) {
      const b = boundsOf(poly);
      if (b.w >= 60 && b.h >= 60) {
        const rects = polygonToRects(poly, roomRects(plan), Math.max(40, o.grid * 4));
        if (rects.length > 0) return { kind: 'rooms', outline: poly.concat([poly[0]]), rects };
        return { kind: 'none', outline: poly.concat([poly[0]]), reason: '이미 방이 있는 자리다.' };
      }
    }
    if (mode === 'room') return { kind: 'none', outline: [], reason: '방으로 보기에는 너무 작다.' };
  }

  const line = straighten(raw, o);
  if (line.length < 2) return { kind: 'none', outline: line, reason: '너무 짧게 그렸다.' };

  // 여러 번 꺾인 선은 가장 긴 구간만 쓴다
  const single = longestSegment(line);

  if (mode === 'opening') {
    const op = asOpening(plan, single, range);
    return op ?? { kind: 'none', outline: single, reason: '벽 위에 그어야 문·창이 된다.' };
  }
  if (mode === 'wall') {
    const sp = asSplit(plan, single);
    return sp ?? { kind: 'none', outline: single, reason: '방을 가로지르도록 그어야 벽이 된다.' };
  }

  const opening = asOpening(plan, single, range);
  if (opening) return opening;
  const split = asSplit(plan, single);
  if (split) return split;

  return {
    kind: 'none',
    outline: single,
    reason: '닫힌 모양으로 그리면 방이, 방을 가로지르면 벽이, 벽 위에 그으면 문이 된다.',
  };
}

function longestSegment(line: Pt[]): Pt[] {
  if (line.length <= 2) return line;
  let best: Pt[] = [line[0], line[1]];
  let bestLen = 0;
  for (let i = 1; i < line.length; i += 1) {
    const len = Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y);
    if (len > bestLen) {
      bestLen = len;
      best = [line[i - 1], line[i]];
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* 5. 해석 결과를 계획에 반영                                          */
/* ------------------------------------------------------------------ */

/** 실 분할 결과 (id 는 호출하는 쪽에서 채운다) */
export interface SplitOutcome {
  keep: Partial<Room> & { id: string };
  create: Omit<Room, 'id'>;
}

/**
 * 방을 둘로 나눈다.
 * taken 에 이미 쓰이는 이름을 넘기면 겹치지 않는 새 이름을 붙인다.
 */
export function splitRoom(
  room: Room,
  axis: 'h' | 'v',
  at: number,
  taken: string[] = [],
): SplitOutcome | null {
  const name = nextName(room.name, taken);
  if (axis === 'v') {
    const left = at - room.x;
    const right = room.x + room.w - at;
    if (left < 40 || right < 40) return null;
    return {
      keep: { id: room.id, w: left },
      create: { kind: room.kind, name, x: at, y: room.y, w: right, h: room.h },
    };
  }
  const top = at - room.y;
  const bottom = room.y + room.h - at;
  if (top < 40 || bottom < 40) return null;
  return {
    keep: { id: room.id, h: top },
    create: { kind: room.kind, name, x: room.x, y: at, w: room.w, h: bottom },
  };
}

/** 뒤 숫자를 올리되, 이미 쓰이는 이름이면 빈 번호를 찾을 때까지 올린다 */
export function nextName(name: string, taken: string[] = []): string {
  const m = name.match(/^(.*?)(\d+)$/);
  const base = m ? m[1] : name;
  let n = m ? Number(m[2]) + 1 : 2;
  const used = new Set(taken);
  while (used.has(`${base}${n}`) && n < 200) n += 1;
  return `${base}${n}`;
}

/** 새로 만든 사각형에 붙일 기본 이름 — 이미 쓰이는 이름은 피한다 */
export function nameForNewRoom(existing: Room[], kind: RoomKind, label: string): string {
  const used = new Set(existing.map((r) => r.name));
  if (!used.has(label)) return label;
  let n = 2;
  while (used.has(`${label}${n}`) && n < 200) n += 1;
  return `${label}${n}`;
}
