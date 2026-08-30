/**
 * 격자 기하 — 셀 순회·인접·스냅.
 *
 * 이 파일은 react·DOM·저장소를 부르지 않는 순수 함수만 담는다 (docs/DESIGN-v1.0.md §3.3).
 */
import type { Cell, GridSpec, Rect, Side } from '../../types/plan';
import { SIDES } from '../../types/plan';

export function cellKey(c: Cell): string {
  return `${c.x},${c.y}`;
}

export function parseCellKey(k: string): Cell {
  const [x, y] = k.split(',').map(Number);
  return { x, y };
}

export function sameCell(a: Cell | undefined, b: Cell | undefined): boolean {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

/** 상하좌우로 맞닿아 있는가 (대각선은 아니다) */
export function isAdjacent(a: Cell, b: Cell): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx + dy === 1;
}

export function manhattan(a: Cell, b: Cell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** 그 셀의 어느 벽면 너머 셀인가 */
export function step(c: Cell, side: Side): Cell {
  switch (side) {
    case 'N':
      return { x: c.x, y: c.y - 1 };
    case 'S':
      return { x: c.x, y: c.y + 1 };
    case 'W':
      return { x: c.x - 1, y: c.y };
    case 'E':
    default:
      return { x: c.x + 1, y: c.y };
  }
}

export function opposite(side: Side): Side {
  return side === 'N' ? 'S' : side === 'S' ? 'N' : side === 'E' ? 'W' : 'E';
}

/** 두 셀이 맞닿았다면 a 에서 b 를 바라보는 면 */
export function sideBetween(a: Cell, b: Cell): Side | null {
  for (const s of SIDES) if (sameCell(step(a, s), b)) return s;
  return null;
}

export function cellsOf(r: Rect): Cell[] {
  const out: Cell[] = [];
  for (let y = r.y; y < r.y + r.h; y += 1) for (let x = r.x; x < r.x + r.w; x += 1) out.push({ x, y });
  return out;
}

export function rectContains(r: Rect, c: Cell): boolean {
  return c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h;
}

/** 변을 맞대는 것은 겹침이 아니다 */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function rectCentroid(r: Rect): Cell {
  return { x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) };
}

export function rectArea(r: Rect): number {
  return r.w * r.h;
}

/** 두 격자점을 잡아끌어 만든 사각형. 최소 크기를 지킨다 */
export function rectFromDrag(a: Cell, b: Cell, min = 2): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.max(min, Math.abs(a.x - b.x) + 1);
  const h = Math.max(min, Math.abs(a.y - b.y) + 1);
  return { x, y, w, h };
}

export function inGrid(g: GridSpec, c: Cell): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < g.width && c.y < g.height;
}

export function clampCell(g: GridSpec, c: Cell): Cell {
  return {
    x: Math.max(0, Math.min(g.width - 1, c.x)),
    y: Math.max(0, Math.min(g.height - 1, c.y)),
  };
}

/** 도면 밖으로 나가지 않게 사각형을 밀어 넣는다 */
export function clampRect(g: GridSpec, r: Rect): Rect {
  const w = Math.min(r.w, g.width);
  const h = Math.min(r.h, g.height);
  return {
    x: Math.max(0, Math.min(g.width - w, r.x)),
    y: Math.max(0, Math.min(g.height - h, r.y)),
    w,
    h,
  };
}

/** 사각형의 바깥 테두리를 이루는 (셀, 면) 목록 — 개구부가 붙을 자리다 */
export function boundarySlots(r: Rect): { cell: Cell; side: Side }[] {
  const out: { cell: Cell; side: Side }[] = [];
  for (let x = r.x; x < r.x + r.w; x += 1) {
    out.push({ cell: { x, y: r.y }, side: 'N' });
    out.push({ cell: { x, y: r.y + r.h - 1 }, side: 'S' });
  }
  for (let y = r.y; y < r.y + r.h; y += 1) {
    out.push({ cell: { x: r.x, y }, side: 'W' });
    out.push({ cell: { x: r.x + r.w - 1, y }, side: 'E' });
  }
  return out;
}

/**
 * 벽면 한 칸의 한가운데 좌표(셀 단위 실수).
 * 개구부를 어디에 그릴지, 어느 벽이 가장 가까운지 재는 데 쓴다.
 */
export function slotCenter(cell: Cell, side: Side): { x: number; y: number } {
  const cx = cell.x + 0.5;
  const cy = cell.y + 0.5;
  switch (side) {
    case 'N':
      return { x: cx, y: cell.y };
    case 'S':
      return { x: cx, y: cell.y + 1 };
    case 'W':
      return { x: cell.x, y: cy };
    case 'E':
    default:
      return { x: cell.x + 1, y: cy };
  }
}

/** 후보 중 점 p 에 가장 가까운 벽면 자리 */
export function nearestSlot(
  slots: { cell: Cell; side: Side }[],
  p: { x: number; y: number },
): { cell: Cell; side: Side } | null {
  let best: { cell: Cell; side: Side } | null = null;
  let bestD = Infinity;
  for (const s of slots) {
    const c = slotCenter(s.cell, s.side);
    const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** 두 점 사이를 상하좌우로만 이어 붙인 셀 열 (경로 그리기 보조) */
export function lineCells(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = [];
  let { x, y } = a;
  while (x !== b.x) {
    x += b.x > x ? 1 : -1;
    out.push({ x, y });
  }
  while (y !== b.y) {
    y += b.y > y ? 1 : -1;
    out.push({ x, y });
  }
  return out;
}

/** 같은 셀이 잇달아 나오는 것을 걷어낸다 */
export function dedupeRun(cells: Cell[]): Cell[] {
  const out: Cell[] = [];
  for (const c of cells) {
    const last = out[out.length - 1];
    if (!last || !sameCell(last, c)) out.push(c);
  }
  return out;
}
