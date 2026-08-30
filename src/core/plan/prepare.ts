/**
 * 시작 평면 준비 — 설계서 v1.6 §11.4.
 *
 * 원본 템플릿을 건드리지 않고 방만 남기기, 개방형 주방 만들기, 평면 회전을
 * 순서대로 적용한다. UI와 저장소 어느 쪽에도 좌표 계산을 흩뜨리지 않는다.
 */
import type { Block, Cell, FloorPlan, OpeningBlock, Rect, RoomBlock, Side } from '../../types/plan';
import { isOpening, isRoom } from '../../types/plan';
import { cellKey, cellsOf, step } from '../grid/geometry';

export type PlanRotation = 0 | 90 | 180 | 270;

export interface PreparePlanOptions {
  roomsOnly?: boolean;
  openKitchen?: boolean;
  rotation?: PlanRotation;
}

export function bedroomCount(plan: FloorPlan): number {
  return plan.blocks.filter((block) => isRoom(block) && block.roomKind === 'bedroom').length;
}

export function preparePlan(source: FloorPlan, options: PreparePlanOptions = {}): FloorPlan {
  let plan = JSON.parse(JSON.stringify(source)) as FloorPlan;
  if (options.roomsOnly) plan = { ...plan, blocks: plan.blocks.filter(isRoom) };
  if (options.openKitchen && !options.roomsOnly) plan = openKitchenWalls(plan);
  plan = shellFirstPlan(plan, Boolean(options.openKitchen && !options.roomsOnly));
  if (options.roomsOnly) plan = { ...plan, blocks: plan.blocks.filter(isRoom) };
  return rotatePlan(plan, options.rotation ?? 0);
}

/**
 * 새로 고른 시작 평면은 외곽을 한 번만 그리고 거실·복도를 하나의 열린 바닥으로 만든다.
 * 원본 템플릿과 예전 저장 파일은 바꾸지 않고, 온보딩을 통해 새로 시작할 때만 적용한다.
 */
export function shellFirstPlan(source: FloorPlan, openKitchen: boolean): FloorPlan {
  const rooms = source.blocks.filter(isRoom);
  const homeRooms = rooms.filter((room) => room.layer === 'home');
  if (homeRooms.length === 0) return source;
  const zoneIds = new Set(
    homeRooms
      .filter((room) => room.roomKind === 'living' || room.roomKind === 'corridor' || (openKitchen && room.roomKind === 'kitchen'))
      .map((room) => room.id),
  );
  const projectedRooms = rooms.map((room): RoomBlock => ({
    ...room,
    wallMode: zoneIds.has(room.id) ? 'zone' : 'closed',
  }));
  const owner = new Map<string, string>();
  for (const room of projectedRooms) for (const cell of cellsOf(room.rect)) owner.set(cellKey(cell), room.id);

  const slots: { cell: Cell; side: Side }[] = [];
  for (const room of projectedRooms.filter((item) => zoneIds.has(item.id))) {
    for (const cell of cellsOf(room.rect)) {
      for (const side of ['E', 'S'] as Side[]) {
        const other = owner.get(cellKey(step(cell, side)));
        if (other && other !== room.id && zoneIds.has(other)) slots.push({ cell, side });
      }
    }
  }
  const boundaryKeys = new Set(slots.map((slot) => boundaryKey(slot.cell, step(slot.cell, slot.side))));
  const kept = source.blocks.filter((block) => {
    if (isRoom(block)) return false;
    if (!isOpening(block)) return true;
    return !boundaryKeys.has(boundaryKey(block.cell, step(block.cell, block.side)));
  });
  const passages: OpeningBlock[] = slots.map((slot, index) => ({
    kind: 'opening',
    id: `zone_passage_${index + 1}`,
    layer: 'home',
    openingKind: 'open_passage',
    cell: { ...slot.cell },
    side: slot.side,
    closedByDefault: false,
    hideInPlan: true,
  }));
  const shellCells = new Map<string, Cell>();
  for (const room of homeRooms) for (const cell of cellsOf(room.rect)) shellCells.set(cellKey(cell), cell);
  const shell = [...shellCells.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  return { ...source, shell: { cells: shell }, blocks: [...projectedRooms, ...kept, ...passages] };
}

/** 주방과 거실·복도의 맞닿은 벽 전체를 트인 통로로 바꾼다. */
export function openKitchenWalls(source: FloorPlan): FloorPlan {
  const rooms = source.blocks.filter(isRoom);
  const kitchens = rooms.filter((room) => room.roomKind === 'kitchen');
  const targets = rooms.filter((room) => room.roomKind === 'living' || room.roomKind === 'corridor');
  const slots: { cell: Cell; side: Side; layer: RoomBlock['layer'] }[] = [];

  for (const kitchen of kitchens) {
    for (const target of targets) {
      slots.push(...sharedWall(kitchen, target).map((slot) => ({ ...slot, layer: kitchen.layer })));
    }
  }
  if (slots.length === 0) return source;

  const keys = new Set(slots.map((slot) => boundaryKey(slot.cell, step(slot.cell, slot.side))));
  const kept = source.blocks.filter(
    (block) => !isOpening(block) || !keys.has(boundaryKey(block.cell, step(block.cell, block.side))),
  );
  const passages: OpeningBlock[] = slots.map((slot, index) => ({
    kind: 'opening',
    id: `open_kitchen_${index + 1}`,
    layer: slot.layer,
    openingKind: 'open_passage',
    cell: slot.cell,
    side: slot.side,
    closedByDefault: false,
  }));
  return { ...source, blocks: kept.concat(passages) };
}

function sharedWall(a: RoomBlock, b: RoomBlock): { cell: Cell; side: Side }[] {
  const out: { cell: Cell; side: Side }[] = [];
  const x0 = Math.max(a.rect.x, b.rect.x);
  const x1 = Math.min(a.rect.x + a.rect.w, b.rect.x + b.rect.w);
  const y0 = Math.max(a.rect.y, b.rect.y);
  const y1 = Math.min(a.rect.y + a.rect.h, b.rect.y + b.rect.h);

  if (a.rect.y + a.rect.h === b.rect.y) {
    for (let x = x0; x < x1; x += 1) out.push({ cell: { x, y: a.rect.y + a.rect.h - 1 }, side: 'S' });
  } else if (b.rect.y + b.rect.h === a.rect.y) {
    for (let x = x0; x < x1; x += 1) out.push({ cell: { x, y: a.rect.y }, side: 'N' });
  } else if (a.rect.x + a.rect.w === b.rect.x) {
    for (let y = y0; y < y1; y += 1) out.push({ cell: { x: a.rect.x + a.rect.w - 1, y }, side: 'E' });
  } else if (b.rect.x + b.rect.w === a.rect.x) {
    for (let y = y0; y < y1; y += 1) out.push({ cell: { x: a.rect.x, y }, side: 'W' });
  }
  return out;
}

function boundaryKey(a: Cell, b: Cell): string {
  const ka = `${a.x},${a.y}`;
  const kb = `${b.x},${b.y}`;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

export function rotatePlan(source: FloorPlan, rotation: PlanRotation): FloorPlan {
  if (rotation === 0) return source;
  const turns = rotation / 90;
  let grid = { ...source.grid };
  let blocks: Block[] = source.blocks.map((block) => JSON.parse(JSON.stringify(block)) as Block);
  let shell = source.shell ? { cells: source.shell.cells.map((cell) => ({ ...cell })) } : undefined;

  for (let turn = 0; turn < turns; turn += 1) {
    const old = grid;
    blocks = blocks.map((block): Block => {
      if (isRoom(block)) return { ...block, rect: rotateRect90(block.rect, old.height) };
      if (isOpening(block)) {
        return {
          ...block,
          cell: rotateCell90(block.cell, old.height),
          side: rotateSide90(block.side),
        };
      }
      return {
        ...block,
        cell: rotateCell90(block.cell, old.height),
        rotation: ((block.rotation + 90) % 360) as 0 | 90 | 180 | 270,
      };
    });
    if (shell) shell = { cells: shell.cells.map((cell) => rotateCell90(cell, old.height)) };
    grid = { width: old.height, height: old.width };
  }
  return { grid, blocks, ...(shell ? { shell } : {}) };
}

function rotateCell90(cell: Cell, oldHeight: number): Cell {
  return { x: oldHeight - 1 - cell.y, y: cell.x };
}

function rotateRect90(rect: Rect, oldHeight: number): Rect {
  return { x: oldHeight - rect.y - rect.h, y: rect.x, w: rect.h, h: rect.w };
}

function rotateSide90(side: Side): Side {
  const next: Record<Side, Side> = { N: 'E', E: 'S', S: 'W', W: 'N' };
  return next[side];
}
