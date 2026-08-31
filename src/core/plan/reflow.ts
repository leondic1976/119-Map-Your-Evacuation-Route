/**
 * 외곽 우선 평면에서 독립실을 옮기거나 늘린 뒤 남은 공용 바닥을 다시 나눈다.
 *
 * 공용 바닥의 RoomBlock은 저장·그래프 호환용 투영일 뿐 실제 방 벽이 아니다. 따라서
 * 독립실이 그 구역으로 움직일 때 충돌로 막지 않고 `shell - closed rooms`를 다시 계산해야 한다.
 * 이 파일은 UI와 저장소에 의존하지 않는 순수 계산만 둔다.
 */
import type { Cell, FloorPlan, OpeningBlock, Rect, RoomBlock, Side } from '../../types/plan';
import { isOpening, isRoom } from '../../types/plan';
import { cellKey, cellsOf, step } from '../grid/geometry';
import { decomposeCells } from './residual';

const SIDES: Side[] = ['N', 'E', 'S', 'W'];

/** 외곽 안에 새 독립실을 넣고도 이어진 공용 바닥을 만들 수 있는가. */
export function canInsertShellRoom(plan: FloorPlan, nextRect: Rect): boolean {
  if (!plan.shell || nextRect.w < 2 || nextRect.h < 2) return false;
  const probe: RoomBlock = {
    kind: 'room',
    id: '__room_insert_probe__',
    layer: 'home',
    roomKind: 'bedroom',
    rect: nextRect,
    label: '',
    wallMode: 'closed',
  };
  return reflowShellFloor({ ...plan, blocks: plan.blocks.concat(probe) }) !== null;
}

/** 외곽의 남은 바닥 일부를 벽 없는 용도 구역으로 지정할 수 있는가. */
export function canDefineShellZone(plan: FloorPlan, nextRect: Rect): boolean {
  if (!plan.shell || nextRect.w < 2 || nextRect.h < 2) return false;
  const shell = new Set(plan.shell.cells.map(cellKey));
  const closed = new Set(
    plan.blocks
      .filter(isRoom)
      .filter((room) => room.wallMode !== 'zone')
      .flatMap((room) => cellsOf(room.rect))
      .map(cellKey),
  );
  const wanted = cellsOf(nextRect);
  return wanted.length > 0 && wanted.every((cell) => shell.has(cellKey(cell)) && !closed.has(cellKey(cell)));
}

/**
 * 남은 바닥에 벽 없는 용도 구역을 그린다. 같은 종류의 기존 구역은 거실로 되돌린 뒤 새 범위로
 * 교체하므로 `트인 주방 다시 그리기`가 위치·크기 조정 역할을 한다.
 */
export function defineShellZone(plan: FloorPlan, source: RoomBlock): FloorPlan | null {
  if (source.wallMode !== 'zone' || !canDefineShellZone(plan, source.rect)) return null;
  let hasVisibleLiving = plan.blocks
    .filter(isRoom)
    .some((room) => room.wallMode === 'zone' && room.roomKind === 'living' && room.showLabel !== false);
  const reset = plan.blocks.map((block) => {
    if (!isRoom(block) || block.wallMode !== 'zone' || block.roomKind !== source.roomKind) return block;
    const showLabel = !hasVisibleLiving;
    if (showLabel) hasVisibleLiving = true;
    return { ...block, roomKind: 'living' as const, label: showLabel ? '거실' : '', showLabel };
  });
  return reflowShellFloor({ ...plan, blocks: reset.concat({ ...source, wallMode: 'zone' }) });
}

/** 독립실의 다음 사각형으로 공용 바닥을 무리 없이 다시 만들 수 있는가. */
export function canReflowShellRoom(plan: FloorPlan, roomId: string, nextRect: Rect): boolean {
  if (!plan.shell) return false;
  const target = plan.blocks.find((block) => block.id === roomId && isRoom(block));
  if (!target || !isRoom(target) || target.wallMode === 'zone' || nextRect.w < 2 || nextRect.h < 2) return false;

  const shell = new Set(plan.shell.cells.map(cellKey));
  const wanted = cellsOf(nextRect);
  if (!wanted.length || wanted.some((cell) => !shell.has(cellKey(cell)))) return false;

  const closed = plan.blocks
    .filter(isRoom)
    .filter((room) => room.wallMode !== 'zone')
    .map((room) => (room.id === roomId ? { ...room, rect: nextRect } : room));
  const occupied = new Set<string>();
  for (const room of closed) {
    for (const cell of cellsOf(room.rect)) {
      const key = cellKey(cell);
      if (!shell.has(key) || occupied.has(key)) return false;
      occupied.add(key);
    }
  }
  return connected(new Set([...shell].filter((key) => !occupied.has(key))));
}

/**
 * 독립실을 nextRect로 바꾸고 공용 구역과 숨은 통로를 결정론적으로 다시 만든다.
 * 불가능하면 원본을 건드리지 않고 null을 돌려준다.
 */
export function reflowShellZones(plan: FloorPlan, roomId: string, nextRect: Rect): FloorPlan | null {
  if (!canReflowShellRoom(plan, roomId, nextRect)) return null;
  const changed: FloorPlan = {
    ...plan,
    blocks: plan.blocks.map((block) => block.id === roomId && isRoom(block) ? { ...block, rect: { ...nextRect } } : block),
  };
  return reflowShellFloor(changed);
}

/** 현재 독립실들을 기준으로 공용 바닥만 다시 만든다. 방 추가·삭제에도 쓴다. */
export function reflowShellFloor(plan: FloorPlan): FloorPlan | null {
  if (!plan.shell) return null;

  const oldZones = plan.blocks.filter(isRoom).filter((room) => room.wallMode === 'zone');
  const closedRooms = plan.blocks.filter(isRoom).filter((room) => room.wallMode !== 'zone');
  const shell = new Set(plan.shell.cells.map(cellKey));
  const occupied = new Set<string>();
  for (const room of closedRooms) {
    for (const cell of cellsOf(room.rect)) {
      const key = cellKey(cell);
      if (!shell.has(key) || occupied.has(key)) return null;
      occupied.add(key);
    }
  }
  const residual = new Set([...shell].filter((key) => !occupied.has(key)));
  if (!connected(residual)) return null;
  const zones = rebuildZones(residual, oldZones);
  const passages = publicPassages(zones);
  const kept = plan.blocks.filter((block) => {
    if (isRoom(block)) return false;
    return !(isOpening(block) && block.openingKind === 'open_passage');
  });
  return { ...plan, blocks: [...closedRooms, ...zones, ...kept, ...passages] };
}

function rebuildZones(residual: Set<string>, oldZones: RoomBlock[]): RoomBlock[] {
  const fallback: RoomBlock = {
    kind: 'room',
    id: 'zone_living',
    layer: 'home',
    roomKind: 'living',
    rect: { x: 0, y: 0, w: 1, h: 1 },
    label: '거실',
    showLabel: true,
    wallMode: 'zone',
  };
  const sources = oldZones.length ? oldZones : [fallback];
  const oldOwner = new Map<string, string>();
  const sourceCells = new Map<string, Cell[]>();
  for (const zone of sources) {
    const cells = cellsOf(zone.rect);
    sourceCells.set(zone.id, cells);
    for (const cell of cells) oldOwner.set(cellKey(cell), zone.id);
  }

  const groups = new Map<string, Set<string>>(sources.map((zone) => [zone.id, new Set<string>()]));
  for (const key of [...residual].sort(cellSort)) {
    const cell = parseCell(key);
    const direct = oldOwner.get(key);
    const owner = direct ?? nearestOwner(cell, sources, sourceCells);
    groups.get(owner)?.add(key);
  }

  const out: RoomBlock[] = [];
  const usedIds = new Set<string>();
  for (const source of sources) {
    const cells = groups.get(source.id);
    if (!cells?.size) continue;
    const rects = decomposeCells(cells).sort((a, b) => area(b) - area(a) || a.y - b.y || a.x - b.x);
    rects.forEach((rect, index) => {
      const preferred = index === 0 ? source.id : `${source.id}_part_${index + 1}`;
      const id = uniqueId(preferred, usedIds);
      usedIds.add(id);
      out.push({
        ...source,
        id,
        rect,
        wallMode: 'zone',
        showLabel: index === 0 ? source.showLabel : false,
        label: index === 0 ? source.label : '',
      });
    });
  }
  return out;
}

function nearestOwner(cell: Cell, sources: RoomBlock[], sourceCells: Map<string, Cell[]>): string {
  return sources
    .map((zone, index) => ({
      id: zone.id,
      index,
      living: zone.roomKind === 'living' ? 0 : 1,
      distance: Math.min(...(sourceCells.get(zone.id) ?? [cell]).map((other) => Math.abs(other.x - cell.x) + Math.abs(other.y - cell.y))),
    }))
    .sort((a, b) => a.distance - b.distance || a.living - b.living || a.index - b.index)[0].id;
}

function publicPassages(zones: RoomBlock[]): OpeningBlock[] {
  const owner = new Map<string, string>();
  for (const zone of zones) for (const cell of cellsOf(zone.rect)) owner.set(cellKey(cell), zone.id);
  const seen = new Set<string>();
  const out: OpeningBlock[] = [];
  for (const zone of zones) {
    for (const cell of cellsOf(zone.rect)) {
      for (const side of ['E', 'S'] as Side[]) {
        const otherCell = step(cell, side);
        const other = owner.get(cellKey(otherCell));
        if (!other || other === zone.id) continue;
        const edge = edgeKey(cell, otherCell);
        if (seen.has(edge)) continue;
        seen.add(edge);
        out.push({
          kind: 'opening',
          id: `zone_reflow_${out.length + 1}`,
          layer: zone.layer,
          openingKind: 'open_passage',
          cell: { ...cell },
          side,
          closedByDefault: false,
          hideInPlan: true,
        });
      }
    }
  }
  return out;
}

function connected(cells: Set<string>): boolean {
  if (cells.size === 0) return false;
  const first = cells.values().next().value as string;
  const seen = new Set<string>([first]);
  const queue: Cell[] = [parseCell(first)];
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

function parseCell(key: string): Cell {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

function cellSort(a: string, b: string): number {
  const ca = parseCell(a);
  const cb = parseCell(b);
  return ca.y - cb.y || ca.x - cb.x;
}

function edgeKey(a: Cell, b: Cell): string {
  const ka = cellKey(a);
  const kb = cellKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

function uniqueId(preferred: string, used: Set<string>): string {
  if (!used.has(preferred)) return preferred;
  let n = 2;
  while (used.has(`${preferred}_${n}`)) n += 1;
  return `${preferred}_${n}`;
}

function area(rect: Rect): number {
  return rect.w * rect.h;
}
