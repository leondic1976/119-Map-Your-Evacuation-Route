/**
 * 방별 문 누락 검사 — 설계서 v1.6 §6.
 *
 * 예전의 반투명 문 후보는 도면을 어지럽히고 문 배치 조작을 두 갈래로 만들었다.
 * 이제 계산 층은 문이 하나도 없는 방만 찾아 캐릭터 해설에 넘긴다.
 */
import type { Cell, FloorPlan, OpeningKind, Rect, RoomBlock } from '../../types/plan';
import { isOpening, isRoom } from '../../types/plan';
import { step } from './geometry';

const DOOR_KINDS = new Set<OpeningKind>(['door', 'front_door', 'inner_door', 'open_passage', 'balcony_window', 'emergency_exit']);

function contains(rect: Rect, cell: Cell): boolean {
  return cell.x >= rect.x && cell.x < rect.x + rect.w && cell.y >= rect.y && cell.y < rect.y + rect.h;
}

/** 공유 벽의 문은 양쪽 방 모두의 문으로 센다. 창문은 세지 않는다. */
export function doorlessRooms(plan: FloorPlan): RoomBlock[] {
  const doors = plan.blocks.filter(isOpening).filter((opening) => DOOR_KINDS.has(opening.openingKind));
  return plan.blocks.filter(isRoom).filter(
    (room) => !doors.some((door) => contains(room.rect, door.cell) || contains(room.rect, step(door.cell, door.side))),
  );
}
