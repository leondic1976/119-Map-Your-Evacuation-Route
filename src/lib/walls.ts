/**
 * 벽체·개구부 기하 생성.
 *
 * 실 사각형의 경계선을 잘게 나누어 양쪽 점유 여부를 조사하고,
 * 양쪽 모두 실이면 내벽(110mm), 한쪽만 실이면 외벽(200mm)으로 두께를 준다.
 * 이어서 개구부 폭만큼 벽을 절개하고, 문짝·회전반경 기하를 만든다.
 */
import { Door, Plan, Room, Win } from './types';

export const INT_WALL = 11;
export const EXT_WALL = 20;
const EPS = 0.5;

export interface WallRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 벽 중심선 방향. 'v' = 세로 벽, 'h' = 가로 벽 */
  dir: 'h' | 'v';
  kind: 'ext' | 'int';
}

export interface DoorGeom {
  id: string;
  door: Door;
  dir: 'h' | 'v';
  /** 개구부 중심 */
  cx: number;
  cy: number;
  width: number;
  thickness: number;
  /** 문틀(문설주) 두 개의 사각형 */
  jambs: WallRect[];
  /** 문짝 선분 (닫힘 상태 기준 회전 시작선) */
  leaf: { x1: number; y1: number; x2: number; y2: number } | null;
  /** 회전반경(cm). 0 이면 미닫이 등 회전 없음 */
  radius: number;
  /** 회전 호 시작각·끝각 (도, 화면 좌표계) */
  arc: { cx: number; cy: number; r: number; a0: number; a1: number } | null;
}

export interface WinGeom {
  id: string;
  win: Win;
  dir: 'h' | 'v';
  cx: number;
  cy: number;
  width: number;
  thickness: number;
}

export interface WallModel {
  walls: WallRect[];
  doors: DoorGeom[];
  windows: WinGeom[];
}

function roomAtPoint(rooms: Room[], x: number, y: number): Room | null {
  for (let i = rooms.length - 1; i >= 0; i -= 1) {
    const r = rooms[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
  }
  return null;
}

function uniqSorted(vals: number[]): number[] {
  const out = vals.slice().sort((a, b) => a - b);
  const res: number[] = [];
  for (const v of out) {
    if (res.length === 0 || Math.abs(res[res.length - 1] - v) > EPS) res.push(v);
  }
  return res;
}

interface Seg {
  a: number;
  b: number;
  kind: 'ext' | 'int';
}

/** 한 축 좌표 line 위에서, 구간별 양쪽 점유를 조사해 벽 구간 목록을 만든다 */
function segmentsOnLine(
  rooms: Room[],
  line: number,
  dir: 'h' | 'v',
  breaks: number[],
): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < breaks.length - 1; i += 1) {
    const a = breaks[i];
    const b = breaks[i + 1];
    if (b - a < EPS) continue;
    const mid = (a + b) / 2;
    const p1 = dir === 'v' ? roomAtPoint(rooms, line - 2, mid) : roomAtPoint(rooms, mid, line - 2);
    const p2 = dir === 'v' ? roomAtPoint(rooms, line + 2, mid) : roomAtPoint(rooms, mid, line + 2);
    let kind: 'ext' | 'int' | null = null;
    if (p1 && p2) kind = 'int';
    else if (p1 || p2) kind = 'ext';
    if (!kind) continue;
    const last = out[out.length - 1];
    if (last && last.kind === kind && Math.abs(last.b - a) < EPS) last.b = b;
    else out.push({ a, b, kind });
  }
  return out;
}

function thickness(kind: 'ext' | 'int'): number {
  return kind === 'ext' ? EXT_WALL : INT_WALL;
}

/** 실 사각형에서 벽 중심선 구간을 추출한다 (개구부 절개 전) */
export function rawWallSegments(rooms: Room[]): { line: number; dir: 'h' | 'v'; seg: Seg }[] {
  const res: { line: number; dir: 'h' | 'v'; seg: Seg }[] = [];
  if (rooms.length === 0) return res;

  const xs = uniqSorted(rooms.flatMap((r) => [r.x, r.x + r.w]));
  const ys = uniqSorted(rooms.flatMap((r) => [r.y, r.y + r.h]));

  for (const x of xs) {
    const touching = rooms.filter((r) => Math.abs(r.x - x) < EPS || Math.abs(r.x + r.w - x) < EPS);
    if (touching.length === 0) continue;
    const yb = uniqSorted([
      ...ys.filter((y) => touching.some((r) => y >= r.y - EPS && y <= r.y + r.h + EPS)),
      ...touching.flatMap((r) => [r.y, r.y + r.h]),
    ]);
    for (const seg of segmentsOnLine(rooms, x, 'v', yb)) res.push({ line: x, dir: 'v', seg });
  }
  for (const y of ys) {
    const touching = rooms.filter((r) => Math.abs(r.y - y) < EPS || Math.abs(r.y + r.h - y) < EPS);
    if (touching.length === 0) continue;
    const xb = uniqSorted([
      ...xs.filter((x) => touching.some((r) => x >= r.x - EPS && x <= r.x + r.w + EPS)),
      ...touching.flatMap((r) => [r.x, r.x + r.w]),
    ]);
    for (const seg of segmentsOnLine(rooms, y, 'h', xb)) res.push({ line: y, dir: 'h', seg });
  }
  return res;
}

interface Cut {
  line: number;
  dir: 'h' | 'v';
  a: number;
  b: number;
}

function openingCuts(plan: Plan): Cut[] {
  const cuts: Cut[] = [];
  for (const d of plan.doors) {
    const line = d.dir === 'v' ? d.x : d.y;
    const c = d.dir === 'v' ? d.y : d.x;
    cuts.push({ line, dir: d.dir, a: c - d.width / 2, b: c + d.width / 2 });
  }
  for (const w of plan.windows) {
    const line = w.dir === 'v' ? w.x : w.y;
    const c = w.dir === 'v' ? w.y : w.x;
    cuts.push({ line, dir: w.dir, a: c - w.width / 2, b: c + w.width / 2 });
  }
  return cuts;
}

/** 구간에서 절개 구간들을 뺀 나머지 */
function subtract(a: number, b: number, cuts: { a: number; b: number }[]): { a: number; b: number }[] {
  let parts = [{ a, b }];
  for (const c of cuts) {
    const next: { a: number; b: number }[] = [];
    for (const p of parts) {
      if (c.b <= p.a + EPS || c.a >= p.b - EPS) {
        next.push(p);
        continue;
      }
      if (c.a > p.a + EPS) next.push({ a: p.a, b: Math.min(c.a, p.b) });
      if (c.b < p.b - EPS) next.push({ a: Math.max(c.b, p.a), b: p.b });
    }
    parts = next;
  }
  return parts.filter((p) => p.b - p.a > EPS);
}

/** 개구부 지점의 벽 두께 판정 */
export function thicknessAt(plan: Plan, line: number, dir: 'h' | 'v', c: number): number {
  const p1 = dir === 'v' ? roomAtPoint(plan.rooms, line - 2, c) : roomAtPoint(plan.rooms, c, line - 2);
  const p2 = dir === 'v' ? roomAtPoint(plan.rooms, line + 2, c) : roomAtPoint(plan.rooms, c, line + 2);
  if (p1 && p2) return INT_WALL;
  return EXT_WALL;
}

/** 문이 열리는 쪽 실의 여유 깊이 — 회전반경 제한에 사용 */
function swingDepth(plan: Plan, d: Door): number {
  const probe =
    d.dir === 'h'
      ? { x: d.x, y: d.y + d.swing * 6 }
      : { x: d.x + d.swing * 6, y: d.y };
  const r = roomAtPoint(plan.rooms, probe.x, probe.y);
  if (!r) return 0;
  if (d.dir === 'h') return d.swing > 0 ? r.y + r.h - d.y : d.y - r.y;
  return d.swing > 0 ? r.x + r.w - d.x : d.x - r.x;
}

function makeRect(line: number, dir: 'h' | 'v', a: number, b: number, t: number, kind: 'ext' | 'int'): WallRect {
  if (dir === 'v') {
    return { x: line - t / 2, y: a, w: t, h: b - a, dir, kind };
  }
  return { x: a, y: line - t / 2, w: b - a, h: t, dir, kind };
}

/**
 * 평면 → 벽체·개구부 기하.
 * 모서리 이음을 위해 각 벽 구간을 양 끝에서 EXT_WALL/2 만큼 늘린다.
 */
export function buildWalls(plan: Plan): WallModel {
  const segs = rawWallSegments(plan.rooms);
  const cuts = openingCuts(plan);
  const walls: WallRect[] = [];
  const grow = EXT_WALL / 2;

  for (const { line, dir, seg } of segs) {
    const mine = cuts.filter((c) => c.dir === dir && Math.abs(c.line - line) < EPS);
    const parts = subtract(seg.a, seg.b, mine);
    const t = thickness(seg.kind);
    for (const p of parts) {
      // 개구부에 잘리지 않은 원래 끝단만 모서리 이음을 위해 늘린다
      const atStart = Math.abs(p.a - seg.a) < EPS;
      const atEnd = Math.abs(p.b - seg.b) < EPS;
      const a = atStart ? p.a - grow : p.a;
      const b = atEnd ? p.b + grow : p.b;
      walls.push(makeRect(line, dir, a, b, t, seg.kind));
    }
  }

  const doors: DoorGeom[] = plan.doors.map((d) => {
    const line = d.dir === 'v' ? d.x : d.y;
    const c = d.dir === 'v' ? d.y : d.x;
    const t = thicknessAt(plan, line, d.dir, c);
    const jambW = 6;
    const jambs: WallRect[] = [
      makeRect(line, d.dir, c - d.width / 2 - jambW, c - d.width / 2, t, 'int'),
      makeRect(line, d.dir, c + d.width / 2, c + d.width / 2 + jambW, t, 'int'),
    ];

    const swings = d.kind === 'entrance' || d.kind === 'room';
    let radius = 0;
    let leaf: DoorGeom['leaf'] = null;
    let arc: DoorGeom['arc'] = null;

    if (swings && !d.alwaysOpen) {
      const depth = swingDepth(plan, d);
      radius = Math.max(20, Math.min(d.width, depth - 6));
      // 경첩 위치 (벽 중심선 위)
      const hx = d.dir === 'h' ? d.x + d.hinge * (d.width / 2) : d.x;
      const hy = d.dir === 'h' ? d.y : d.y + d.hinge * (d.width / 2);
      // 열린 상태 문짝: 경첩에서 swing 방향으로 radius
      const ex = d.dir === 'h' ? hx : hx + d.swing * radius;
      const ey = d.dir === 'h' ? hy + d.swing * radius : hy;
      leaf = { x1: hx, y1: hy, x2: ex, y2: ey };
      // 호: 열린 문짝 끝 → 닫힌 문짝 끝(반대편 문설주)
      const closedX = d.dir === 'h' ? hx - d.hinge * radius : hx;
      const closedY = d.dir === 'h' ? hy : hy - d.hinge * radius;
      const a0 = (Math.atan2(ey - hy, ex - hx) * 180) / Math.PI;
      const a1 = (Math.atan2(closedY - hy, closedX - hx) * 180) / Math.PI;
      arc = { cx: hx, cy: hy, r: radius, a0, a1 };
    } else if (d.kind === 'sliding' || d.kind === 'folding') {
      const hx = d.dir === 'h' ? d.x - d.width / 2 : d.x;
      const hy = d.dir === 'h' ? d.y : d.y - d.width / 2;
      const ex = d.dir === 'h' ? d.x + d.width / 2 : d.x;
      const ey = d.dir === 'h' ? d.y : d.y + d.width / 2;
      leaf = { x1: hx, y1: hy, x2: ex, y2: ey };
    }

    return {
      id: d.id,
      door: d,
      dir: d.dir,
      cx: d.x,
      cy: d.y,
      width: d.width,
      thickness: t,
      jambs,
      leaf,
      radius,
      arc,
    };
  });

  const windows: WinGeom[] = plan.windows.map((w) => {
    const line = w.dir === 'v' ? w.x : w.y;
    const c = w.dir === 'v' ? w.y : w.x;
    return {
      id: w.id,
      win: w,
      dir: w.dir,
      cx: w.x,
      cy: w.y,
      width: w.width,
      thickness: thicknessAt(plan, line, w.dir, c),
    };
  });

  return { walls, doors, windows };
}

export interface WallHit {
  line: number;
  dir: 'h' | 'v';
  a: number;
  b: number;
  kind: 'ext' | 'int';
  /** 벽 중심선까지의 거리(cm) */
  dist: number;
  /** 벽 위 투영 좌표 */
  pos: number;
}

/** 클릭 지점에서 가장 가까운 벽 중심선 구간 — 개구부 배치에 쓴다 */
export function nearestWallSegment(rooms: Room[], p: { x: number; y: number }, maxDist = 45): WallHit | null {
  let best: WallHit | null = null;
  for (const { line, dir, seg } of rawWallSegments(rooms)) {
    const along = dir === 'v' ? p.y : p.x;
    const across = dir === 'v' ? p.x : p.y;
    const pos = Math.max(seg.a, Math.min(seg.b, along));
    const d = Math.hypot(across - line, along - pos);
    if (d > maxDist) continue;
    if (!best || d < best.dist) best = { line, dir, a: seg.a, b: seg.b, kind: seg.kind, dist: d, pos };
  }
  return best;
}

/** 점이 벽 사각형 안에 있는지 */
export function inWall(walls: WallRect[], x: number, y: number): boolean {
  for (const w of walls) {
    if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
  }
  return false;
}

/** 벽 총 연장(m) — 진단·통계용 */
export function wallLength(walls: WallRect[]): number {
  return walls.reduce((s, w) => s + Math.max(w.w, w.h), 0) / 100;
}
