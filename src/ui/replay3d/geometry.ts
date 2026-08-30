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
/** 한 줄 = 위치3 · 법선3 · 색3 */
export const STRIDE = 9;

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

/*
 * 방마다 다른 바닥 색. 3D 에서 조명을 받으면 옅은 색은 죄다 흰색으로 보여
 * 방이 구분되지 않는다. 그래서 도면보다 조금 진하게 잡는다 (설계서 v1.4 §2.2).
 */
const ROOM_TINT: Record<RoomBlock['roomKind'], number[]> = {
  bedroom: [0.97, 0.88, 0.68],
  living: [0.82, 0.92, 0.78],
  kitchen: [1, 0.83, 0.66],
  bath: [0.74, 0.87, 1],
  entry: [0.88, 0.82, 0.96],
  balcony: [0.79, 0.94, 0.91],
  utility: [0.88, 0.88, 0.88],
  corridor: [0.95, 0.93, 0.8],
  stair: [0.79, 0.85, 0.93],
  refuge_lobby: [0.78, 0.91, 0.82],
  elevator_hall: [0.93, 0.8, 0.8],
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

  /* 가구·설비 — 종류마다 다른 모양으로 세운다. 상자 하나로는 무엇인지 알 수 없다 */
  for (const p of points) {
    if (!isPoint(p)) continue;
    if (p.kind === 'marker') continue;
    const host = rooms.find((r) => inRect(r.rect, p.cell));
    if (!host) continue;
    furniture(b, p.subKind, p.cell, p.rotation);
  }

  return b.toArray();
}

/* 가구 색 — 나무·천·금속·백색가전·화면 */
const M = {
  wood: [0.69, 0.48, 0.29],
  woodDark: [0.5, 0.33, 0.2],
  cloth: [0.44, 0.56, 0.72],
  clothDark: [0.32, 0.42, 0.56],
  metal: [0.78, 0.82, 0.86],
  white: [0.93, 0.95, 0.97],
  screen: [0.16, 0.19, 0.23],
  warm: [0.86, 0.62, 0.36],
  safe: [0.16, 0.52, 0.36],
  red: [0.78, 0.12, 0.2],
  ceramic: [0.95, 0.96, 0.97],
};

/**
 * 물건 하나를 세운다. 칸 한 변이 60cm 이므로 높이 1.0 = 60cm 다.
 * 회전값(0·90·180·270)에 맞춰 가로세로를 바꾼다.
 */
function furniture(b: Builder, kind: string, cell: Cell, rotation: number): void {
  const turned = rotation === 90 || rotation === 270;
  /* 칸 안의 상자 하나 — (동서 폭, 남북 깊이, 높이) 를 회전에 맞춰 놓는다 */
  const put = (ox: number, oz: number, w: number, d: number, y0: number, y1: number, col: number[], top?: number[]): void => {
    const [cx, cz, cw, cd] = turned ? [oz, ox, d, w] : [ox, oz, w, d];
    b.box(cell.x + cx, y0, cell.y + cz, cell.x + cx + cw, y1, cell.y + cz + cd, col, top);
  };

  switch (kind) {
    case 'bed':
      put(0.06, 0.06, 0.88, 0.88, 0.05, 0.42, M.wood, M.wood);
      put(0.1, 0.16, 0.8, 0.78, 0.42, 0.62, M.cloth, [0.55, 0.66, 0.8]);
      put(0.16, 0.08, 0.68, 0.2, 0.42, 0.72, M.white, M.white); // 베개
      put(0.04, 0.02, 0.92, 0.08, 0.05, 0.95, M.woodDark, M.woodDark); // 머리판
      break;
    case 'sofa':
      put(0.06, 0.2, 0.88, 0.7, 0.05, 0.5, M.cloth, [0.5, 0.62, 0.78]);
      put(0.06, 0.68, 0.88, 0.24, 0.05, 1.05, M.clothDark, M.clothDark); // 등받이
      put(0.02, 0.2, 0.12, 0.72, 0.05, 0.75, M.clothDark, M.clothDark);
      put(0.86, 0.2, 0.12, 0.72, 0.05, 0.75, M.clothDark, M.clothDark);
      break;
    case 'desk':
      put(0.06, 0.16, 0.88, 0.66, 1.05, 1.2, M.wood, [0.78, 0.57, 0.36]);
      put(0.08, 0.18, 0.08, 0.08, 0.02, 1.05, M.woodDark);
      put(0.84, 0.18, 0.08, 0.08, 0.02, 1.05, M.woodDark);
      put(0.08, 0.74, 0.08, 0.08, 0.02, 1.05, M.woodDark);
      put(0.84, 0.74, 0.08, 0.08, 0.02, 1.05, M.woodDark);
      break;
    case 'computer':
      put(0.06, 0.16, 0.88, 0.66, 1.05, 1.2, M.wood, [0.78, 0.57, 0.36]);
      put(0.2, 0.3, 0.6, 0.06, 1.2, 1.72, M.screen, M.screen); // 화면
      put(0.42, 0.28, 0.16, 0.12, 1.2, 1.26, [0.35, 0.4, 0.46]);
      put(0.24, 0.6, 0.5, 0.16, 1.2, 1.26, [0.82, 0.85, 0.88]); // 자판
      break;
    case 'wardrobe':
      put(0.05, 0.3, 0.9, 0.6, 0.02, 3.3, M.woodDark, [0.58, 0.4, 0.25]);
      put(0.48, 0.28, 0.04, 0.04, 0.02, 3.3, [0.3, 0.2, 0.13]);
      break;
    case 'bookshelf':
      put(0.05, 0.34, 0.9, 0.5, 0.02, 3.0, M.woodDark, [0.58, 0.4, 0.25]);
      for (const y of [0.9, 1.6, 2.3]) put(0.1, 0.3, 0.8, 0.06, y, y + 0.55, [0.72, 0.3, 0.26]); // 책
      break;
    case 'dining_table':
      put(0.08, 0.08, 0.84, 0.84, 1.05, 1.2, M.wood, [0.8, 0.6, 0.38]);
      for (const [ox, oz] of [[0.12, 0.12], [0.78, 0.12], [0.12, 0.78], [0.78, 0.78]]) put(ox, oz, 0.1, 0.1, 0.02, 1.05, M.woodDark);
      break;
    case 'fridge':
      put(0.08, 0.24, 0.84, 0.66, 0.02, 3.0, M.white, [0.86, 0.89, 0.92]);
      put(0.08, 0.22, 0.84, 0.03, 1.9, 1.96, [0.6, 0.65, 0.7]); // 문 사이 홈
      put(0.78, 0.2, 0.05, 0.05, 1.2, 1.8, M.metal); // 손잡이
      put(0.78, 0.2, 0.05, 0.05, 2.1, 2.7, M.metal);
      break;
    case 'tv':
      put(0.14, 0.32, 0.72, 0.5, 0.02, 0.62, M.woodDark, M.woodDark); // 받침장
      put(0.08, 0.44, 0.84, 0.07, 0.7, 1.72, M.screen, M.screen);
      put(0.1, 0.45, 0.8, 0.02, 0.75, 1.66, [0.1, 0.13, 0.17]);
      put(0.44, 0.46, 0.12, 0.06, 0.62, 0.7, [0.3, 0.34, 0.4]);
      break;
    case 'sink':
      put(0.06, 0.28, 0.88, 0.6, 0.02, 1.45, M.white, M.metal);
      put(0.18, 0.38, 0.44, 0.4, 1.3, 1.46, [0.72, 0.77, 0.82]); // 개수통
      put(0.7, 0.4, 0.06, 0.06, 1.45, 1.85, M.metal); // 수전
      put(0.62, 0.4, 0.14, 0.06, 1.78, 1.85, M.metal);
      break;
    case 'gas_range':
      put(0.06, 0.28, 0.88, 0.6, 0.02, 1.45, [0.22, 0.24, 0.27], [0.16, 0.18, 0.2]);
      for (const [ox, oz] of [[0.22, 0.4], [0.58, 0.4]]) put(ox, oz, 0.2, 0.2, 1.45, 1.5, [0.45, 0.47, 0.5]);
      put(0.1, 0.24, 0.76, 0.05, 1.1, 1.2, [0.6, 0.62, 0.66]); // 손잡이 줄
      break;
    case 'boiler':
      put(0.16, 0.5, 0.68, 0.36, 1.2, 2.4, M.white, [0.86, 0.89, 0.92]);
      put(0.3, 0.46, 0.4, 0.05, 1.6, 1.9, [0.35, 0.5, 0.66]);
      break;
    case 'heater':
      put(0.2, 0.34, 0.6, 0.34, 0.02, 0.95, M.metal, [0.86, 0.89, 0.92]);
      put(0.24, 0.32, 0.52, 0.04, 0.15, 0.85, [0.85, 0.35, 0.2]);
      break;
    case 'power_strip':
      put(0.2, 0.42, 0.6, 0.18, 0.02, 0.14, M.white, M.white);
      break;
    case 'candle':
      put(0.42, 0.42, 0.16, 0.16, 0.02, 0.42, M.ceramic, M.ceramic);
      put(0.46, 0.46, 0.08, 0.08, 0.42, 0.52, [1, 0.72, 0.3], [1, 0.85, 0.5]);
      break;
    case 'extinguisher':
      put(0.36, 0.36, 0.28, 0.28, 0.02, 0.95, M.red, [0.9, 0.2, 0.24]);
      put(0.4, 0.4, 0.2, 0.2, 0.95, 1.12, [0.25, 0.27, 0.3]);
      break;
    case 'detector':
      put(0.32, 0.32, 0.36, 0.36, 3.78, 3.92, M.white, M.white); // 천장에 붙는다
      break;
    case 'gas_valve':
      put(0.4, 0.42, 0.2, 0.16, 0.55, 0.78, [0.9, 0.72, 0.2], [1, 0.82, 0.3]);
      break;
    case 'light_partition':
      put(0.04, 0.44, 0.92, 0.12, 0.02, 3.4, [0.88, 0.9, 0.86], [0.8, 0.83, 0.8]);
      break;
    case 'refuge_area':
      put(0.06, 0.06, 0.88, 0.88, 0.03, 0.08, M.safe, [0.2, 0.62, 0.44]);
      break;
    case 'descending_hatch':
      put(0.12, 0.12, 0.76, 0.76, 0.02, 0.1, [0.75, 0.55, 0.15], [0.85, 0.65, 0.2]);
      break;
    case 'descent_device':
      put(0.3, 0.3, 0.4, 0.4, 0.02, 0.5, M.metal, M.metal);
      break;
    default:
      put(0.18, 0.18, 0.64, 0.64, 0.02, 0.8, M.wood, M.wood);
      break;
  }
}

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

  const lo = horizontal ? x0 : z0;
  const hi = horizontal ? x1 : z1;

  /*
   * 칸 경계에서 아주 조금 겹치게 늘인다.
   * 벽은 칸마다 상자 하나다. 이웃한 상자와 딱 맞대면 마구리 면 둘이 같은 자리에 겹쳐
   * 깊이 다툼(z-fighting)이 일어나 벽에 세로 줄무늬가 생긴다. 6mm 만 밀어 넣으면
   * 마구리가 이웃 상자 **안쪽**으로 들어가 다툴 일이 없다.
   * 문·창 쪽 끝은 늘이지 않는다 — 늘이면 열린 자리를 갉아먹는다.
   */
  const EPS = 0.006;

  const put = (from: number, to: number, yLo: number, yHi: number, color: number[]): void => {
    if (to - from <= 0.001 || yHi - yLo <= 0.001) return;
    const f = from === lo ? from - EPS : from;
    const t2 = to === hi ? to + EPS : to;
    if (horizontal) b.box(f, yLo, at - t / 2, t2, yHi, at + t / 2, color, color);
    else b.box(at - t / 2, yLo, f, at + t / 2, yHi, t2, color, color);
  };

  if (!op) {
    put(lo, hi, 0, WALL_H, col);
    return;
  }

  /* 트인 통로는 문틀과 인방도 없는 완전한 벽 제거다. */
  if (op.openingKind === 'open_passage') return;

  /* 문·창이 좁아 보인다는 지적을 받아 칸의 대부분을 비운다. 0.62 → 0.88 */
  const gapW = op.openingKind === 'window' || op.openingKind === 'balcony_window' ? 0.9 : 0.88;
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
    put(gLo, gHi, 3.35, WALL_H, col); // 인방 — 문은 2m 높이다
    /* 문틀 — 아주 얇은 기둥 둘 */
    put(gLo, gLo + 0.04, 0, 3.35, COLOR.frame);
    put(gHi - 0.04, gHi, 0, 3.35, COLOR.frame);
    put(gLo, gHi, 3.3, 3.35, COLOR.frame);
  }
}

/** 문짝 — 열림/닫힘이 매 컷 바뀌므로 따로 만든다 */
export function buildDoors(plan: FloorPlan, doorState: Record<string, 'open' | 'closed'>): Float32Array {
  const b = new Builder();
  for (const o of plan.blocks) {
    if (!isOpening(o)) continue;
    if (o.openingKind === 'window' || o.openingKind === 'balcony_window' || o.openingKind === 'open_passage') continue;
    const closed = doorState[o.id] === 'closed';
    if (!closed) continue; // 열린 문은 벽에 붙어 보이지 않게 둔다
    const horizontal = o.side === 'N' || o.side === 'S';
    const at = o.side === 'N' ? o.cell.y : o.side === 'S' ? o.cell.y + 1 : o.side === 'W' ? o.cell.x : o.cell.x + 1;
    const lo = (horizontal ? o.cell.x : o.cell.y) + 0.06;
    const hi = lo + 0.88;
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

/**
 * 천장 — 1인칭에서만 그린다. 위에서 볼 때는 집 안이 보여야 하므로 빼고,
 * 눈높이에서 볼 때는 있어야 실내로 읽힌다.
 */
export function buildCeiling(plan: FloorPlan): Float32Array {
  const b = new Builder();
  for (const r of plan.blocks) {
    if (!isRoom(r)) continue;
    const c = [0.86, 0.87, 0.89];
    b.quad(
      [r.rect.x, WALL_H, r.rect.y + r.rect.h],
      [r.rect.x + r.rect.w, WALL_H, r.rect.y + r.rect.h],
      [r.rect.x + r.rect.w, WALL_H, r.rect.y],
      [r.rect.x, WALL_H, r.rect.y],
      c,
    );
  }
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
