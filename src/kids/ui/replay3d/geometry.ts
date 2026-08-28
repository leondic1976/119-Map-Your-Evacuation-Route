'use client';

/**
 * 평면도 → 3차원 정점 — 설계서 v1.2 §8.4.
 *
 * 따로 만든 모델을 쓰지 않는다 (FR-11.2). 방 사각형의 둘레에서 벽 선분을 뽑아 세우고,
 * 개구부 자리는 문틀만 남기고 잘라 낸다. 에디터의 벽 생성과 같은 규칙이다.
 *
 * 좌표: x 는 도면의 x, z 는 도면의 y, y 가 높이다. 한 칸 = 1.0
 */
import type { Cell, FloorPlan, OpeningBlock, Rect, RoomBlock, Side } from '../../types/plan';
import { isOpening, isPoint, isRoom } from '../../types/plan';
import { STRIDE } from './gl';

/** 벽 높이(칸 단위). 한 칸을 60cm 로 보면 2.4m 다 */
export const WALL_H = 4;
const WALL_T = 0.16;

const COLOR = {
  floor: [0.9, 0.9, 0.86],
  wallOut: [0.82, 0.83, 0.85],
  wallIn: [0.9, 0.9, 0.9],
  frame: [0.45, 0.35, 0.24],
  glass: [0.55, 0.75, 0.9],
  door: [0.62, 0.44, 0.28],
  furniture: [0.72, 0.62, 0.5],
  hazard: [0.85, 0.55, 0.35],
  safety: [0.2, 0.55, 0.4],
};

const ROOM_TINT: Record<RoomBlock['roomKind'], number[]> = {
  bedroom: [0.99, 0.94, 0.82],
  living: [0.9, 0.95, 0.87],
  kitchen: [1, 0.9, 0.8],
  bath: [0.85, 0.92, 1],
  entry: [0.93, 0.9, 0.97],
  balcony: [0.89, 0.96, 0.95],
  utility: [0.93, 0.93, 0.93],
  corridor: [0.96, 0.96, 0.9],
  stair: [0.87, 0.9, 0.94],
  refuge_lobby: [0.87, 0.93, 0.88],
  elevator_hall: [0.95, 0.88, 0.88],
};

/** 한 줄 = 위치3 · 법선3 · 색3 */
class Builder {
  data: number[] = [];

  tri(a: number[], b: number[], c: number[], color: number[]): void {
    const n = normal(a, b, c);
    for (const p of [a, b, c]) this.data.push(p[0], p[1], p[2], n[0], n[1], n[2], color[0], color[1], color[2]);
  }

  quad(a: number[], b: number[], c: number[], d: number[], color: number[]): void {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  /** 축에 정렬된 상자 하나 */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number[], top?: number[]): void {
    const t = top ?? color;
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], t); // 위
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], color); // 아래
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], color);
    this.quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], color);
    this.quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], color);
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], color);
  }

  toArray(): Float32Array {
    return new Float32Array(this.data);
  }
}

function normal(a: number[], b: number[], c: number[]): number[] {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

/** 개구부가 어느 셀 경계에 있는가 — 벽을 자를 때 쓴다 */
function openingKey(cell: Cell, side: Side): string {
  return `${cell.x},${cell.y},${side}`;
}

/** 그 셀·면에 개구부가 있으면 돌려준다 (반대쪽에서 놓은 것도 찾는다) */
function openingAt(openings: OpeningBlock[], cell: Cell, side: Side): OpeningBlock | undefined {
  const opp: Side = side === 'N' ? 'S' : side === 'S' ? 'N' : side === 'E' ? 'W' : 'E';
  const nb =
    side === 'N' ? { x: cell.x, y: cell.y - 1 } : side === 'S' ? { x: cell.x, y: cell.y + 1 } : side === 'E' ? { x: cell.x + 1, y: cell.y } : { x: cell.x - 1, y: cell.y };
  return openings.find(
    (o) => openingKey(o.cell, o.side) === openingKey(cell, side) || openingKey(o.cell, o.side) === openingKey(nb, opp),
  );
}

function inRect(r: Rect, c: Cell): boolean {
  return c.x >= r.x && c.y >= r.y && c.x < r.x + r.w && c.y < r.y + r.h;
}

/**
 * 집을 세운다. 바닥·벽·문틀·창·가구 상자를 한 벌의 정점 배열로 낸다.
 * 반투명한 것(연기·불)은 여기 넣지 않는다 — 그리는 차례가 다르다.
 */
export function buildHouse(plan: FloorPlan): Float32Array {
  const b = new Builder();
  const rooms = plan.blocks.filter(isRoom);
  const openings = plan.blocks.filter(isOpening);
  const points = plan.blocks.filter(isPoint);

  /* 바닥 — 방마다 옅은 색을 깐다 */
  for (const r of rooms) {
    const tint = ROOM_TINT[r.roomKind] ?? COLOR.floor;
    b.quad(
      [r.rect.x, 0, r.rect.y],
      [r.rect.x + r.rect.w, 0, r.rect.y],
      [r.rect.x + r.rect.w, 0, r.rect.y + r.rect.h],
      [r.rect.x, 0, r.rect.y + r.rect.h],
      tint,
    );
  }

  /* 벽 — 방 둘레의 셀 면 가운데 이웃 방이 없는 쪽에 세운다 */
  const occupied = new Map<string, RoomBlock>();
  for (const r of rooms) {
    for (let y = r.rect.y; y < r.rect.y + r.rect.h; y += 1) {
      for (let x = r.rect.x; x < r.rect.x + r.rect.w; x += 1) occupied.set(`${x},${y}`, r);
    }
  }

  const seen = new Set<string>();
  for (const r of rooms) {
    for (let y = r.rect.y; y < r.rect.y + r.rect.h; y += 1) {
      for (let x = r.rect.x; x < r.rect.x + r.rect.w; x += 1) {
        const here = { x, y };
        const sides: [Side, Cell][] = [
          ['N', { x, y: y - 1 }],
          ['S', { x, y: y + 1 }],
          ['W', { x: x - 1, y }],
          ['E', { x: x + 1, y }],
        ];
        for (const [side, nb] of sides) {
          const other = occupied.get(`${nb.x},${nb.y}`);
          if (other === r) continue; // 같은 방 안쪽
          /* 두 방 사이 벽은 한 번만 세운다 */
          const key = [`${x},${y},${side}`, `${nb.x},${nb.y},${side === 'N' ? 'S' : side === 'S' ? 'N' : side === 'E' ? 'W' : 'E'}`]
            .sort()
            .join('|');
          if (seen.has(key)) continue;
          seen.add(key);
          const outer = !other;
          const op = openingAt(openings, here, side);
          wallSegment(b, here, side, outer, op);
        }
      }
    }
  }

  /* 가구·설비 — 낮은 상자로 세운다. 무엇인지는 색과 높이로만 구분한다 */
  for (const p of points) {
    if (!isPoint(p)) continue;
    const host = rooms.find((r) => inRect(r.rect, p.cell));
    if (!host) continue;
    const h = FURNITURE_H[p.subKind] ?? 0.9;
    const col = p.kind === 'hazard' ? COLOR.hazard : p.kind === 'safety' ? COLOR.safety : COLOR.furniture;
    if (p.kind === 'marker') continue;
    b.box(p.cell.x + 0.16, 0.02, p.cell.y + 0.16, p.cell.x + 0.84, h, p.cell.y + 0.84, col, col.map((v) => Math.min(1, v * 1.15)));
  }

  return b.toArray();
}

const FURNITURE_H: Record<string, number> = {
  bed: 0.7,
  sofa: 0.75,
  desk: 1.2,
  wardrobe: 2.6,
  bookshelf: 2.4,
  dining_table: 1.1,
  fridge: 2.6,
  tv: 1.4,
  sink: 1.4,
  computer: 1.3,
  gas_range: 1.3,
  boiler: 1.6,
  power_strip: 0.2,
  heater: 0.9,
  candle: 0.4,
  extinguisher: 1.0,
  detector: 0.2,
  gas_valve: 0.6,
};

/**
 * 셀 한 면의 벽. 개구부가 있으면 가운데를 비우고 문틀만 남긴다.
 *   문   — 아래는 뚫리고 위에 인방(상인방)만 남는다
 *   창   — 아래 허리벽 + 위 인방, 가운데에 유리 판
 */
function wallSegment(b: Builder, cell: Cell, side: Side, outer: boolean, op?: OpeningBlock): void {
  const t = outer ? WALL_T * 1.6 : WALL_T;
  const col = outer ? COLOR.wallOut : COLOR.wallIn;
  /* 면의 두 끝점 (도면 좌표) */
  const x0 = cell.x;
  const x1 = cell.x + 1;
  const z0 = cell.y;
  const z1 = cell.y + 1;
  const horizontal = side === 'N' || side === 'S';
  const at = side === 'N' ? z0 : side === 'S' ? z1 : side === 'W' ? x0 : x1;

  const put = (from: number, to: number, yLo: number, yHi: number, color: number[]): void => {
    if (to - from <= 0.001 || yHi - yLo <= 0.001) return;
    if (horizontal) b.box(from, yLo, at - t / 2, to, yHi, at + t / 2, color, color);
    else b.box(at - t / 2, yLo, from, at + t / 2, yHi, to, color, color);
  };

  const lo = horizontal ? x0 : z0;
  const hi = horizontal ? x1 : z1;

  if (!op) {
    put(lo, hi, 0, WALL_H, col);
    return;
  }

  const gapW = 0.62;
  const mid = (lo + hi) / 2;
  const gLo = mid - gapW / 2;
  const gHi = mid + gapW / 2;
  /* 좌우 남는 벽 */
  put(lo, gLo, 0, WALL_H, col);
  put(gHi, hi, 0, WALL_H, col);

  const glazed = op.openingKind === 'window' || op.openingKind === 'balcony_window';
  if (glazed) {
    put(gLo, gHi, 0, 1.5, col); // 허리벽
    put(gLo, gHi, 3.2, WALL_H, col); // 인방
    put(gLo, gHi, 1.5, 3.2, COLOR.glass); // 유리
  } else {
    put(gLo, gHi, 3.1, WALL_H, col); // 인방
    /* 문틀 — 얇은 기둥 둘 */
    put(gLo, gLo + 0.06, 0, 3.1, COLOR.frame);
    put(gHi - 0.06, gHi, 0, 3.1, COLOR.frame);
  }
}

/** 문짝 — 열림/닫힘이 매 컷 바뀌므로 따로 만든다 */
export function buildDoors(plan: FloorPlan, doorState: Record<string, 'open' | 'closed'>): Float32Array {
  const b = new Builder();
  for (const o of plan.blocks) {
    if (!isOpening(o)) continue;
    if (o.openingKind === 'window' || o.openingKind === 'balcony_window') continue;
    const closed = doorState[o.id] === 'closed';
    if (!closed) continue; // 열린 문은 벽에 붙어 보이지 않게 둔다
    const horizontal = o.side === 'N' || o.side === 'S';
    const at = o.side === 'N' ? o.cell.y : o.side === 'S' ? o.cell.y + 1 : o.side === 'W' ? o.cell.x : o.cell.x + 1;
    const lo = (horizontal ? o.cell.x : o.cell.y) + 0.19;
    const hi = lo + 0.62;
    const col = o.openingKind === 'front_door' || o.openingKind === 'emergency_exit' ? [0.16, 0.48, 0.31] : COLOR.door;
    if (horizontal) b.box(lo, 0.02, at - 0.05, hi, 3.05, at + 0.05, col, col);
    else b.box(at - 0.05, 0.02, lo, at + 0.05, 3.05, hi, col, col);
  }
  return b.toArray();
}

/** 사람 — 세 개의 상자로 만든 아주 단순한 형상. 낮은 자세면 납작해진다 */
export function buildPerson(cell: Cell, crouch: boolean, tone: number[]): Float32Array {
  const b = new Builder();
  const cx = cell.x + 0.5;
  const cz = cell.y + 0.5;
  /* 발밑 고리와 머리 위 기둥 — 어디 있는지 한눈에 찾게 한다 */
  b.box(cx - 0.46, 0.03, cz - 0.46, cx + 0.46, 0.07, cz + 0.46, [0.1, 0.55, 0.36], [0.15, 0.8, 0.52]);
  b.box(cx - 0.07, 2.6, cz - 0.07, cx + 0.07, WALL_H + 1.1, cz + 0.07, [0.15, 0.8, 0.52], [0.3, 0.95, 0.65]);
  const scale = crouch ? 0.55 : 1;
  const bodyH = 1.7 * scale;
  const headR = 0.24;
  b.box(cx - 0.2, 0.02, cz - 0.15, cx + 0.2, bodyH, cz + 0.15, tone, tone);
  b.box(cx - headR, bodyH, cz - headR, cx + headR, bodyH + headR * 2, cz + headR, [0.98, 0.86, 0.7], [0.98, 0.86, 0.7]);
  /* 모자 — 캐릭터 색 */
  b.box(cx - headR - 0.03, bodyH + headR * 2 - 0.06, cz - headR - 0.03, cx + headR + 0.03, bodyH + headR * 2 + 0.14, cz + headR + 0.03, tone, tone);
  return b.toArray();
}

/** 도면의 크기 — 카메라를 앉힐 때 쓴다 */
export function planExtent(plan: FloorPlan): { minX: number; minZ: number; maxX: number; maxZ: number } {
  let minX = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = 0;
  let maxZ = 0;
  for (const r of plan.blocks) {
    if (!isRoom(r)) continue;
    minX = Math.min(minX, r.rect.x);
    minZ = Math.min(minZ, r.rect.y);
    maxX = Math.max(maxX, r.rect.x + r.rect.w);
    maxZ = Math.max(maxZ, r.rect.y + r.rect.h);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minZ: 0, maxX: plan.grid.width, maxZ: plan.grid.height };
  return { minX, minZ, maxX, maxZ };
}

export { STRIDE };
