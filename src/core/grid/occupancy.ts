/**
 * 셀 → 방 매핑과 충돌 검사.
 *
 * 방은 직사각형만 허용한다(docs/DESIGN-v1.0.md §4.2). L 자 방은 사각형 둘을 붙여 만든다.
 * 이 제약이 인접 판정을 결정론적으로 만들고 아이의 조작 난이도도 낮춘다.
 */
import type { Block, BlockId, Cell, FloorPlan, OpeningBlock, OpeningSpan, Rect, RoomBlock, Side } from '../../types/plan';
import { isRoom } from '../../types/plan';
import { cellKey, cellsOf, rectsOverlap } from './geometry';

export type Occupancy = Map<string, BlockId>;

export function buildOccupancy(plan: FloorPlan): Occupancy {
  const occ: Occupancy = new Map();
  for (const b of plan.blocks) {
    if (!isRoom(b)) continue;
    for (const c of cellsOf(b.rect)) occ.set(cellKey(c), b.id);
  }
  return occ;
}

export function roomIdAt(occ: Occupancy, c: Cell): BlockId | undefined {
  return occ.get(cellKey(c));
}

export function rooms(plan: FloorPlan): RoomBlock[] {
  return plan.blocks.filter(isRoom);
}

export function roomAt(plan: FloorPlan, c: Cell): RoomBlock | undefined {
  return rooms(plan).find((r) => c.x >= r.rect.x && c.x < r.rect.x + r.rect.w && c.y >= r.rect.y && c.y < r.rect.y + r.rect.h);
}

export function blockById(plan: FloorPlan, id: BlockId): Block | undefined {
  return plan.blocks.find((b) => b.id === id);
}

/**
 * 방을 놓을 수 있는가.
 * 다른 방과 겹치면 거부한다. 변을 맞대는 것은 허용한다.
 */
export function canPlaceRoom(plan: FloorPlan, rect: Rect, ignoreId?: BlockId): boolean {
  if (rect.w < 2 || rect.h < 2) return false;
  if (rect.x < 0 || rect.y < 0) return false;
  if (rect.x + rect.w > plan.grid.width || rect.y + rect.h > plan.grid.height) return false;
  return !rooms(plan).some((r) => r.id !== ignoreId && rectsOverlap(r.rect, rect));
}

/** 그 방을 지우면 함께 사라져야 할 블록들 — 조용히 지우지 않고 알린다 (P3) */
export function orphansOf(plan: FloorPlan, roomId: BlockId): BlockId[] {
  const room = plan.blocks.find((b) => b.id === roomId);
  if (!room || !isRoom(room)) return [];
  const inside = new Set(cellsOf(room.rect).map(cellKey));
  const out: BlockId[] = [];
  for (const b of plan.blocks) {
    if (b.id === roomId) continue;
    if (b.kind === 'opening' && inside.has(cellKey(b.cell))) out.push(b.id);
    else if (b.kind !== 'room' && inside.has(cellKey(b.cell))) out.push(b.id);
  }
  return out;
}

/** 같은 셀에 같은 종류를 두 번 놓지 않는다 */
export function pointOccupied(plan: FloorPlan, cell: Cell, subKind: string, ignoreId?: BlockId): boolean {
  return plan.blocks.some(
    (b) => b.kind !== 'room' && b.kind !== 'opening' && b.id !== ignoreId && b.subKind === subKind && b.cell.x === cell.x && b.cell.y === cell.y,
  );
}

/** 이미 그 (셀, 면)에 개구부가 있으면 그것을 돌려준다 — 새로 놓는 대신 갈아 끼운다 */
export function openingCells(opening: Pick<OpeningBlock, 'cell' | 'side' | 'span'>): Cell[] {
  const span = opening.span ?? 1;
  return Array.from({ length: span }, (_, index) => opening.side === 'N' || opening.side === 'S'
    ? { x: opening.cell.x + index, y: opening.cell.y }
    : { x: opening.cell.x, y: opening.cell.y + index });
}

export function openingAt(plan: FloorPlan, cell: Cell, side: string, ignoreId?: BlockId): BlockId | undefined {
  const hit = plan.blocks.find(
    (b) => b.kind === 'opening' && b.id !== ignoreId && b.side === side && openingCells(b).some((slot) => slot.x === cell.x && slot.y === cell.y),
  );
  return hit?.id;
}

/** 선택한 문·창을 같은 벽 방향으로 span칸 늘릴 수 있는지 확인한다. */
export function canResizeOpening(plan: FloorPlan, opening: OpeningBlock, span: OpeningSpan): boolean {
  const probe: OpeningBlock = { ...opening, span };
  const boundary = new Set<string>();
  for (const room of rooms(plan).filter((candidate) => candidate.wallMode !== 'zone')) {
    const r = room.rect;
    for (let x = r.x; x < r.x + r.w; x += 1) {
      boundary.add(`${x},${r.y},N`);
      boundary.add(`${x},${r.y + r.h - 1},S`);
    }
    for (let y = r.y; y < r.y + r.h; y += 1) {
      boundary.add(`${r.x},${y},W`);
      boundary.add(`${r.x + r.w - 1},${y},E`);
    }
  }
  if (plan.shell) {
    const shell = new Set(plan.shell.cells.map(cellKey));
    const delta: Record<Side, Cell> = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } };
    for (const cell of plan.shell.cells) {
      for (const sideName of ['N', 'E', 'S', 'W'] as Side[]) {
        const d = delta[sideName];
        if (!shell.has(cellKey({ x: cell.x + d.x, y: cell.y + d.y }))) boundary.add(`${cell.x},${cell.y},${sideName}`);
      }
    }
  }
  return openingCells(probe).every((cell) =>
    cell.x >= 0 && cell.y >= 0 && cell.x < plan.grid.width && cell.y < plan.grid.height
    && boundary.has(`${cell.x},${cell.y},${opening.side}`)
    && !openingAt(plan, cell, opening.side, opening.id));
}

let seq = 0;

/** 결정론적 ID — 시간·난수를 쓰지 않아 저장 파일 비교가 쉽다 */
export function newBlockId(prefix: string): BlockId {
  seq += 1;
  return `${prefix}_${seq.toString(36)}`;
}

/** 저장 파일을 불러온 뒤 ID 가 겹치지 않도록 카운터를 밀어 올린다 */
export function bumpBlockIdSeq(plan: FloorPlan): void {
  for (const b of plan.blocks) {
    const n = parseInt(b.id.split('_')[1] ?? '', 36);
    if (Number.isFinite(n) && n > seq) seq = n;
  }
}

/**
 * 네모 안에 든 블록들 — 끌어서 여럿 고르기에 쓴다 (설계서 v1.5 §1).
 *
 * 방은 **한 칸이라도 걸치면** 잡는다. 아이가 네모를 방에 딱 맞춰 두르기는 어렵다.
 * 문·창·물건은 그 칸이 네모 안에 있어야 잡는다.
 */
export function blocksInRect(plan: FloorPlan, r: Rect): BlockId[] {
  const out: BlockId[] = [];
  for (const b of plan.blocks) {
    if (isRoom(b)) {
      const hit = b.rect.x < r.x + r.w && r.x < b.rect.x + b.rect.w && b.rect.y < r.y + r.h && r.y < b.rect.y + b.rect.h;
      if (hit) out.push(b.id);
    } else {
      const c = b.cell;
      if (c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h) out.push(b.id);
    }
  }
  return out;
}
