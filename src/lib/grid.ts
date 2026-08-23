/**
 * 평면 → 격자.
 *
 * 동선 산출과 연기 확산 해석이 공유하는 통행 격자를 만든다.
 * 셀 한 변은 기본 10cm. 84㎡ 평면이면 약 1만 셀로, 전 시간대 해석에도 부담이 없다.
 */
import { Plan, Pt } from './types';
import { WallModel, buildWalls } from './walls';

export interface Grid {
  cell: number;
  ox: number;
  oy: number;
  cols: number;
  rows: number;
  /** 1 = 통행 가능 */
  walk: Uint8Array;
  /** 셀이 속한 실 인덱스 (-1 = 없음) */
  room: Int16Array;
  /** 셀이 속한 개구부 인덱스 (-1 = 없음) */
  door: Int16Array;
}

export const DEFAULT_CELL = 10;

export function gridIndex(g: Grid, c: number, r: number): number {
  return r * g.cols + c;
}

export function cellCenter(g: Grid, i: number): Pt {
  const c = i % g.cols;
  const r = Math.floor(i / g.cols);
  return { x: g.ox + (c + 0.5) * g.cell, y: g.oy + (r + 0.5) * g.cell };
}

export function cellAt(g: Grid, x: number, y: number): number {
  const c = Math.floor((x - g.ox) / g.cell);
  const r = Math.floor((y - g.oy) / g.cell);
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return -1;
  return r * g.cols + c;
}

export function buildGrid(plan: Plan, cell = DEFAULT_CELL, model?: WallModel): Grid {
  const wm = model ?? buildWalls(plan);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of plan.rooms) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  if (!isFinite(x0)) {
    x0 = 0;
    y0 = 0;
    x1 = 100;
    y1 = 100;
  }
  const pad = 30;
  const ox = Math.floor((x0 - pad) / cell) * cell;
  const oy = Math.floor((y0 - pad) / cell) * cell;
  const cols = Math.ceil((x1 + pad - ox) / cell);
  const rows = Math.ceil((y1 + pad - oy) / cell);
  const n = cols * rows;

  const g: Grid = {
    cell,
    ox,
    oy,
    cols,
    rows,
    walk: new Uint8Array(n),
    room: new Int16Array(n).fill(-1),
    door: new Int16Array(n).fill(-1),
  };

  const rooms = plan.rooms;
  const walls = wm.walls;

  for (let r = 0; r < rows; r += 1) {
    const y = oy + (r + 0.5) * cell;
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      const x = ox + (c + 0.5) * cell;
      let ri = -1;
      for (let k = rooms.length - 1; k >= 0; k -= 1) {
        const rm = rooms[k];
        if (x >= rm.x && x <= rm.x + rm.w && y >= rm.y && y <= rm.y + rm.h) {
          ri = k;
          break;
        }
      }
      if (ri < 0) continue;
      g.room[i] = ri;
      let blocked = false;
      for (const w of walls) {
        if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) {
          blocked = true;
          break;
        }
      }
      if (!blocked) g.walk[i] = 1;
    }
  }

  // 개구부 셀 표시 — 연기 확산의 문 폐쇄 지연 판정에 사용
  plan.doors.forEach((d, di) => {
    const half = d.width / 2;
    const across = cell * 1.5;
    const a0 = (d.dir === 'h' ? d.x : d.y) - half;
    const a1 = (d.dir === 'h' ? d.x : d.y) + half;
    const l0 = (d.dir === 'h' ? d.y : d.x) - across;
    const l1 = (d.dir === 'h' ? d.y : d.x) + across;
    const bx0 = d.dir === 'h' ? a0 : l0;
    const bx1 = d.dir === 'h' ? a1 : l1;
    const by0 = d.dir === 'h' ? l0 : a0;
    const by1 = d.dir === 'h' ? l1 : a1;
    const c0 = Math.max(0, Math.floor((bx0 - ox) / cell));
    const c1 = Math.min(cols - 1, Math.floor((bx1 - ox) / cell));
    const r0 = Math.max(0, Math.floor((by0 - oy) / cell));
    const r1 = Math.min(rows - 1, Math.floor((by1 - oy) / cell));
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const i = r * cols + c;
        if (g.walk[i]) g.door[i] = di;
      }
    }
  });

  return g;
}

/** 주어진 좌표에서 가장 가까운 통행 가능 셀 (없으면 -1) */
export function nearestWalkable(g: Grid, x: number, y: number, maxRing = 40): number {
  const c0 = Math.floor((x - g.ox) / g.cell);
  const r0 = Math.floor((y - g.oy) / g.cell);
  for (let ring = 0; ring <= maxRing; ring += 1) {
    for (let dr = -ring; dr <= ring; dr += 1) {
      for (let dc = -ring; dc <= ring; dc += 1) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) continue;
        const i = r * g.cols + c;
        if (g.walk[i]) return i;
      }
    }
  }
  return -1;
}

/** 벽에서 떨어진 정도 (셀 단위 BFS). 통로 중앙을 따르게 하는 가산비용의 근거 */
export function clearanceField(g: Grid): Int16Array {
  const n = g.cols * g.rows;
  const dist = new Int16Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i += 1) {
    if (!g.walk[i]) {
      dist[i] = 0;
      queue[tail] = i;
      tail += 1;
    }
  }
  while (head < tail) {
    const i = queue[head];
    head += 1;
    const c = i % g.cols;
    const r = (i - c) / g.cols;
    const d = dist[i] + 1;
    if (c > 0) {
      const j = i - 1;
      if (dist[j] < 0) {
        dist[j] = d;
        queue[tail] = j;
        tail += 1;
      }
    }
    if (c < g.cols - 1) {
      const j = i + 1;
      if (dist[j] < 0) {
        dist[j] = d;
        queue[tail] = j;
        tail += 1;
      }
    }
    if (r > 0) {
      const j = i - g.cols;
      if (dist[j] < 0) {
        dist[j] = d;
        queue[tail] = j;
        tail += 1;
      }
    }
    if (r < g.rows - 1) {
      const j = i + g.cols;
      if (dist[j] < 0) {
        dist[j] = d;
        queue[tail] = j;
        tail += 1;
      }
    }
  }
  return dist;
}

/** 통행 가능 셀 수 → 면적(㎡) */
export function walkableArea(g: Grid): number {
  let n = 0;
  for (let i = 0; i < g.walk.length; i += 1) if (g.walk[i]) n += 1;
  return (n * g.cell * g.cell) / 10000;
}

/** 두 셀이 연결되어 있는지 (BFS) — 진단용 */
export function connected(g: Grid, from: number, to: number): boolean {
  if (from < 0 || to < 0) return false;
  const seen = new Uint8Array(g.cols * g.rows);
  const queue = [from];
  seen[from] = 1;
  while (queue.length) {
    const i = queue.pop() as number;
    if (i === to) return true;
    const c = i % g.cols;
    const r = (i - c) / g.cols;
    const nb = [
      c > 0 ? i - 1 : -1,
      c < g.cols - 1 ? i + 1 : -1,
      r > 0 ? i - g.cols : -1,
      r < g.rows - 1 ? i + g.cols : -1,
    ];
    for (const j of nb) {
      if (j < 0 || seen[j] || !g.walk[j]) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return false;
}
