/**
 * 상자 + 잔여공간 시작 평면 생성기 — 설계서 v1.8 §2~§4.
 *
 * 어린이는 닫힌 방의 위치만 고른다. 거실·복도·개방형 주방은 집 테두리에서
 * 상자를 뺀 나머지로 계산한다. 현재 저장 스키마와 호환되도록 연결 영역을
 * 직사각형 RoomBlock 여러 개와 그 사이 open_passage로 투영한다.
 *
 * 순수 계산만 하며 시간·난수·브라우저 API를 쓰지 않는다.
 */
import type { Block, Cell, FloorPlan, OpeningBlock, PointBlock, Rect, RoomBlock, Side } from '../../types/plan';
import { DEFAULT_GRID, isOpening, isRoom } from '../../types/plan';
import { cellKey, cellsOf, step } from '../grid/geometry';

export type ShellShape = 'wide' | 'long' | 'bend-left' | 'bend-right';
export type Side8 = 'NW' | 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W';

export interface ResidualPlanRequest {
  bedrooms: 1 | 2 | 3 | 4;
  shell: ShellShape;
  bedroomSides: Side8[];
  kitchenClosed: boolean;
}

export interface ResidualPlanSummary {
  shellCells: number;
  residualCells: number;
  closedBoxes: number;
  residualParts: number;
}

export interface ResidualPlanResult {
  plan: FloorPlan;
  summary: ResidualPlanSummary;
}

interface BoxDraft {
  id: string;
  roomKind: RoomBlock['roomKind'];
  label: string;
  rect: Rect;
}

interface BoundarySlot {
  cell: Cell;
  side: Side;
}

const SIDES: Side[] = ['N', 'E', 'S', 'W'];
const DEFAULT_SIDES: Record<ResidualPlanRequest['bedrooms'], Side8[]> = {
  1: ['NW'],
  2: ['NW', 'NE'],
  3: ['NW', 'N', 'NE'],
  4: ['NW', 'NE', 'SW', 'SE'],
};

/** 이용자가 자리를 덜 골라도 막지 않고 서로 떨어진 무난한 기본값으로 채운다. */
export function normalizeBedroomSides(count: ResidualPlanRequest['bedrooms'], selected: Side8[]): Side8[] {
  const unique = selected.filter((side, index) => selected.indexOf(side) === index).slice(-count);
  for (const fallback of DEFAULT_SIDES[count]) {
    if (unique.length >= count) break;
    if (!unique.includes(fallback)) unique.push(fallback);
  }
  return unique.slice(0, count);
}

/** 네 가지 테두리를 격자 칸 집합으로 만든다. */
export function shellCells(shape: ShellShape): Set<string> {
  const cells = new Set<string>();
  const add = (rect: Rect): void => {
    for (const cell of cellsOf(rect)) cells.add(cellKey(cell));
  };
  if (shape === 'wide') add({ x: 2, y: 2, w: 20, h: 12 });
  else if (shape === 'long') add({ x: 5, y: 1, w: 14, h: 14 });
  else if (shape === 'bend-left') {
    add({ x: 2, y: 2, w: 20, h: 7 });
    add({ x: 2, y: 9, w: 12, h: 5 });
  } else {
    add({ x: 2, y: 2, w: 20, h: 7 });
    add({ x: 10, y: 9, w: 12, h: 5 });
  }
  return cells;
}

export function generateResidualPlan(request: ResidualPlanRequest): ResidualPlanResult {
  const shell = shellCells(request.shell);
  const occupied = new Set<string>();
  const boxes: BoxDraft[] = [];
  let bedroomNo = 0;

  for (const side of normalizeBedroomSides(request.bedrooms, request.bedroomSides)) {
    bedroomNo += 1;
    const rect = findBox(shell, occupied, side, 5, 4, true) ?? findBox(shell, occupied, side, 4, 4, true);
    if (!rect) throw new Error(`방 ${bedroomNo}을 놓을 자리를 찾지 못했다.`);
    const box: BoxDraft = { id: `box_bed_${bedroomNo}`, roomKind: 'bedroom', label: `방 ${bedroomNo}`, rect };
    boxes.push(box);
    addRect(occupied, rect);
  }

  const bathRect = findBox(shell, occupied, 'E', 3, 3, false) ?? findBox(shell, occupied, 'S', 3, 2, false);
  if (bathRect) {
    boxes.push({ id: 'box_bath', roomKind: 'bath', label: '', rect: bathRect });
    addRect(occupied, bathRect);
  }

  if (request.kitchenClosed) {
    const kitchenRect = findBox(shell, occupied, 'SW', 4, 3, true) ?? findBox(shell, occupied, 'S', 3, 3, false);
    if (kitchenRect) {
      boxes.push({ id: 'box_kitchen', roomKind: 'kitchen', label: '문 있는 주방', rect: kitchenRect });
      addRect(occupied, kitchenRect);
    }
  }

  let residual = subtract(shell, occupied);
  if (!connected(residual)) throw new Error('남은 공용공간이 이어지지 않는다.');

  let openKitchenRect: Rect | null = null;
  if (!request.kitchenClosed) {
    openKitchenRect = reserveZone(residual, 'SW', 4, 3) ?? reserveZone(residual, 'S', 3, 3);
    if (openKitchenRect) residual = subtract(residual, keysOf(openKitchenRect));
  }

  const residualRects = decomposeCells(residual);
  if (residualRects.length === 0) throw new Error('거실과 복도로 쓸 남은 자리가 없다.');
  const livingIndex = residualRects.reduce((best, rect, index, all) => area(rect) > area(all[best]) ? index : best, 0);
  const residualRooms: RoomBlock[] = residualRects.map((rect, index) => ({
    kind: 'room',
    id: `zone_${index + 1}`,
    layer: 'home',
    roomKind: index === livingIndex ? 'living' : 'corridor',
    rect,
    label: index === livingIndex ? '거실' : '',
    showLabel: index === livingIndex,
  }));
  if (openKitchenRect) {
    residualRooms.push({
      kind: 'room',
      id: 'zone_kitchen',
      layer: 'home',
      roomKind: 'kitchen',
      rect: openKitchenRect,
      label: '트인 주방',
      showLabel: true,
    });
  }

  const boxRooms: RoomBlock[] = boxes.map((box) => ({
    kind: 'room',
    id: box.id,
    layer: 'home',
    roomKind: box.roomKind,
    rect: box.rect,
    label: box.label,
  }));
  const rooms = boxRooms.concat(residualRooms);
  const owner = ownerMap(rooms);
  const residualIds = new Set(residualRooms.map((room) => room.id));
  const openings: OpeningBlock[] = [];

  /* 잔여공간을 나눈 직사각형 사이는 실제 벽이 아니다. 공유 벽 전부를 튼다. */
  const openedBoundary = new Set<string>();
  for (const room of residualRooms) {
    for (const cell of cellsOf(room.rect)) {
      for (const side of ['E', 'S'] as Side[]) {
        const other = owner.get(cellKey(step(cell, side)));
        if (!other || other === room.id || !residualIds.has(other)) continue;
        const key = edgeKey(cell, side);
        if (openedBoundary.has(key)) continue;
        openedBoundary.add(key);
        openings.push(makeOpening(`open_${openings.length + 1}`, 'open_passage', cell, side, false));
      }
    }
  }

  /* 닫힌 상자는 잔여공간과 맞닿은 가장 알맞은 벽에 자동 문 하나를 둔다. */
  for (const room of boxRooms) {
    const candidates = boundaryToOwners(room.rect, owner, residualIds);
    if (candidates.length === 0) continue;
    const chosen = nearestToRectCenter(candidates, room.rect);
    openings.push(makeOpening(`door_${room.id}`, 'door', chosen.cell, chosen.side, true));
  }

  /* 현관은 남은 자리의 바깥 경계 중 아래쪽 중앙에 가장 가까운 곳이다. */
  const frontCandidates = residualRooms.flatMap((room) => exteriorBoundary(room.rect, shell));
  const front = frontCandidates.sort((a, b) => frontScore(a) - frontScore(b))[0];
  if (front) openings.push(makeOpening('front_door', 'front_door', front.cell, front.side, true));

  /* 침실마다 외벽 창문 하나를 둔다. */
  for (const room of boxRooms.filter((room) => room.roomKind === 'bedroom')) {
    const candidates = exteriorBoundary(room.rect, shell);
    if (!candidates.length) continue;
    const chosen = nearestToRectCenter(candidates, room.rect);
    openings.push(makeOpening(`window_${room.id}`, 'window', chosen.cell, chosen.side, false));
  }

  const points = starterPoints(boxRooms, residualRooms);
  const plan: FloorPlan = { grid: { ...DEFAULT_GRID }, blocks: [...rooms, ...openings, ...points] };
  const issues = validateResidualProjection(plan, request);
  if (issues.length) throw new Error(issues.join(' '));

  return {
    plan,
    summary: {
      shellCells: shell.size,
      residualCells: residualRooms.reduce((sum, room) => sum + area(room.rect), 0),
      closedBoxes: boxRooms.length,
      residualParts: residualRooms.length,
    },
  };
}

/** 생성 결과의 구조 불변조건. UI 없이 시험에서 그대로 쓴다. */
export function validateResidualProjection(plan: FloorPlan, request: ResidualPlanRequest): string[] {
  const issues: string[] = [];
  const rooms = plan.blocks.filter(isRoom);
  const occupied = new Set<string>();
  for (const room of rooms) {
    for (const cell of cellsOf(room.rect)) {
      if (cell.x < 0 || cell.y < 0 || cell.x >= plan.grid.width || cell.y >= plan.grid.height) issues.push(`${room.id}가 격자 밖에 있다.`);
      const key = cellKey(cell);
      if (occupied.has(key)) issues.push(`${key}에서 방이 겹친다.`);
      occupied.add(key);
    }
  }
  const beds = rooms.filter((room) => room.roomKind === 'bedroom');
  if (beds.length !== request.bedrooms) issues.push(`침실이 ${request.bedrooms}개가 아니다.`);

  const openings = plan.blocks.filter(isOpening);
  const owner = ownerMap(rooms);
  const residualIds = new Set(rooms.filter((room) => room.id.startsWith('zone_')).map((room) => room.id));
  for (const room of rooms.filter((room) => room.id.startsWith('box_'))) {
    const hasDoor = openings.some((opening) => {
      if (opening.openingKind !== 'door') return false;
      const a = owner.get(cellKey(opening.cell));
      const b = owner.get(cellKey(step(opening.cell, opening.side)));
      return (a === room.id && Boolean(b && residualIds.has(b))) || (b === room.id && Boolean(a && residualIds.has(a)));
    });
    if (!hasDoor) issues.push(`${room.label || room.roomKind}에 자동 문이 없다.`);
  }
  if (!openings.some((opening) => opening.openingKind === 'front_door')) issues.push('현관문이 없다.');
  if (!request.kitchenClosed) {
    const kitchen = rooms.find((room) => room.id === 'zone_kitchen');
    if (!kitchen) issues.push('트인 주방이 없다.');
    else if (!openings.some((opening) => {
      if (opening.openingKind !== 'open_passage') return false;
      const a = owner.get(cellKey(opening.cell));
      const b = owner.get(cellKey(step(opening.cell, opening.side)));
      return a === kitchen.id || b === kitchen.id;
    })) {
      issues.push('트인 주방의 공유 벽이 열려 있지 않다.');
    }
  }
  return Array.from(new Set(issues));
}

function starterPoints(boxes: RoomBlock[], residual: RoomBlock[]): PointBlock[] {
  const points: PointBlock[] = [];
  const add = (id: string, kind: PointBlock['kind'], subKind: PointBlock['subKind'], cell: Cell): void => {
    points.push({ kind, id, layer: 'home', subKind, cell, rotation: 0 });
  };
  for (const room of boxes.filter((room) => room.roomKind === 'bedroom')) {
    add(`bed_${room.id}`, 'furniture', 'bed', { x: room.rect.x + 1, y: room.rect.y + 1 });
  }
  const living = residual.find((room) => room.roomKind === 'living') ?? residual[0];
  if (living) {
    add('starter_detector', 'safety', 'detector', centerCell(living.rect));
    add('starter_sofa', 'furniture', 'sofa', { x: living.rect.x, y: living.rect.y });
  }
  const kitchen = boxes.concat(residual).find((room) => room.roomKind === 'kitchen');
  if (kitchen) {
    const cells = cellsOf(kitchen.rect);
    if (cells[0]) add('starter_range', 'hazard', 'gas_range', cells[0]);
    if (cells[1]) add('starter_sink', 'furniture', 'sink', cells[1]);
    if (cells[2]) add('starter_fridge', 'furniture', 'fridge', cells[2]);
  }
  return points;
}

function findBox(
  shell: Set<string>,
  occupied: Set<string>,
  targetSide: Side8,
  width: number,
  height: number,
  requireExterior: boolean,
): Rect | null {
  const bounds = boundsOf(shell);
  const target = targetPoint(bounds, targetSide);
  const choices: { rect: Rect; score: number }[] = [];
  for (let y = bounds.y; y <= bounds.y + bounds.h - height; y += 1) {
    for (let x = bounds.x; x <= bounds.x + bounds.w - width; x += 1) {
      const rect = { x, y, w: width, h: height };
      const keys = keysOf(rect);
      if ([...keys].some((key) => !shell.has(key) || occupied.has(key))) continue;
      const exterior = exteriorBoundary(rect, shell).length;
      if (requireExterior && exterior === 0) continue;
      const blocked = new Set([...occupied, ...keys]);
      const remain = subtract(shell, blocked);
      if (!connected(remain)) continue;
      const center = { x: x + width / 2, y: y + height / 2 };
      const distance = Math.hypot(center.x - target.x, center.y - target.y);
      const thin = [...remain].filter((key) => neighborCount(remain, parseCell(key)) <= 1).length;
      choices.push({ rect, score: distance * 20 - exterior * 1.5 + thin * 8 + y * 0.001 + x * 0.0001 });
    }
  }
  choices.sort((a, b) => a.score - b.score);
  return choices[0]?.rect ?? null;
}

function reserveZone(cells: Set<string>, targetSide: Side8, width: number, height: number): Rect | null {
  const bounds = boundsOf(cells);
  const target = targetPoint(bounds, targetSide);
  const choices: { rect: Rect; score: number }[] = [];
  for (let y = bounds.y; y <= bounds.y + bounds.h - height; y += 1) {
    for (let x = bounds.x; x <= bounds.x + bounds.w - width; x += 1) {
      const rect = { x, y, w: width, h: height };
      const keys = keysOf(rect);
      if ([...keys].some((key) => !cells.has(key))) continue;
      const remain = subtract(cells, keys);
      if (!connected(remain)) continue;
      const center = { x: x + width / 2, y: y + height / 2 };
      const distance = Math.hypot(center.x - target.x, center.y - target.y);
      choices.push({ rect, score: distance + y * 0.0001 + x * 0.00001 });
    }
  }
  choices.sort((a, b) => a.score - b.score);
  return choices[0]?.rect ?? null;
}

/** 연결 칸을 겹치지 않는 직사각형으로 결정론적으로 분해한다. */
export function decomposeCells(source: Set<string>): Rect[] {
  const remaining = new Set(source);
  const out: Rect[] = [];
  while (remaining.size) {
    const start = [...remaining].map(parseCell).sort((a, b) => a.y - b.y || a.x - b.x)[0];
    let width = 1;
    while (remaining.has(cellKey({ x: start.x + width, y: start.y }))) width += 1;
    let height = 1;
    while (true) {
      const nextY = start.y + height;
      let full = true;
      for (let dx = 0; dx < width; dx += 1) {
        if (!remaining.has(cellKey({ x: start.x + dx, y: nextY }))) {
          full = false;
          break;
        }
      }
      if (!full) break;
      height += 1;
    }
    const rect = { x: start.x, y: start.y, w: width, h: height };
    for (const key of keysOf(rect)) remaining.delete(key);
    out.push(rect);
  }
  return out;
}

function connected(cells: Set<string>): boolean {
  if (cells.size === 0) return false;
  const first = cells.values().next().value as string;
  const seen = new Set<string>([first]);
  const queue = [parseCell(first)];
  while (queue.length) {
    const cell = queue.shift() as Cell;
    for (const side of SIDES) {
      const key = cellKey(step(cell, side));
      if (!cells.has(key) || seen.has(key)) continue;
      seen.add(key);
      queue.push(parseCell(key));
    }
  }
  return seen.size === cells.size;
}

function boundaryToOwners(rect: Rect, owner: Map<string, string>, targetIds: Set<string>): BoundarySlot[] {
  const out: BoundarySlot[] = [];
  for (const cell of cellsOf(rect)) {
    for (const side of SIDES) {
      const other = owner.get(cellKey(step(cell, side)));
      if (other && targetIds.has(other)) out.push({ cell, side });
    }
  }
  return out;
}

function exteriorBoundary(rect: Rect, shell: Set<string>): BoundarySlot[] {
  const out: BoundarySlot[] = [];
  for (const cell of cellsOf(rect)) {
    for (const side of SIDES) {
      if (!shell.has(cellKey(step(cell, side)))) out.push({ cell, side });
    }
  }
  return out;
}

function nearestToRectCenter(slots: BoundarySlot[], rect: Rect): BoundarySlot {
  const center = centerCell(rect);
  return slots.slice().sort((a, b) => {
    const da = Math.hypot(a.cell.x - center.x, a.cell.y - center.y);
    const db = Math.hypot(b.cell.x - center.x, b.cell.y - center.y);
    return da - db || SIDES.indexOf(a.side) - SIDES.indexOf(b.side) || a.cell.y - b.cell.y || a.cell.x - b.cell.x;
  })[0];
}

function frontScore(slot: BoundarySlot): number {
  const sidePenalty = slot.side === 'S' ? 0 : slot.side === 'E' ? 20 : slot.side === 'W' ? 30 : 40;
  return sidePenalty + Math.abs(slot.cell.x - DEFAULT_GRID.width * 0.62) + Math.abs(slot.cell.y - DEFAULT_GRID.height);
}

function makeOpening(id: string, kind: OpeningBlock['openingKind'], cell: Cell, side: Side, closed: boolean): OpeningBlock {
  return { kind: 'opening', id, layer: 'home', openingKind: kind, cell: { ...cell }, side, closedByDefault: closed };
}

function ownerMap(rooms: RoomBlock[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const room of rooms) for (const cell of cellsOf(room.rect)) map.set(cellKey(cell), room.id);
  return map;
}

function edgeKey(cell: Cell, side: Side): string {
  const other = step(cell, side);
  const a = cellKey(cell);
  const b = cellKey(other);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function addRect(target: Set<string>, rect: Rect): void {
  for (const cell of cellsOf(rect)) target.add(cellKey(cell));
}

function keysOf(rect: Rect): Set<string> {
  return new Set(cellsOf(rect).map(cellKey));
}

function subtract(source: Set<string>, removed: Set<string>): Set<string> {
  return new Set([...source].filter((key) => !removed.has(key)));
}

function boundsOf(cells: Set<string>): Rect {
  const parsed = [...cells].map(parseCell);
  const minX = Math.min(...parsed.map((cell) => cell.x));
  const minY = Math.min(...parsed.map((cell) => cell.y));
  const maxX = Math.max(...parsed.map((cell) => cell.x));
  const maxY = Math.max(...parsed.map((cell) => cell.y));
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function targetPoint(bounds: Rect, side: Side8): { x: number; y: number } {
  const x = side.includes('W') ? bounds.x : side.includes('E') ? bounds.x + bounds.w : bounds.x + bounds.w / 2;
  const y = side.includes('N') ? bounds.y : side.includes('S') ? bounds.y + bounds.h : bounds.y + bounds.h / 2;
  return { x, y };
}

function parseCell(key: string): Cell {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

function neighborCount(cells: Set<string>, cell: Cell): number {
  return SIDES.filter((side) => cells.has(cellKey(step(cell, side)))).length;
}

function centerCell(rect: Rect): Cell {
  return { x: Math.floor(rect.x + rect.w / 2), y: Math.floor(rect.y + rect.h / 2) };
}

function area(rect: Rect): number {
  return rect.w * rect.h;
}
