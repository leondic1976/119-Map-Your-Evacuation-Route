/**
 * 문 후보 — FR-7.3.
 * 두 방이 변을 맞대고 그 사이에 개구부가 없으면, 맞댄 구간 한가운데에 문 자리를 내민다.
 * 아이는 클릭 한 번으로 문을 놓는다. 벽은 아이가 그리지 않는다 (FR-7.2).
 */
import type { Cell, FloorPlan, Side } from '../../types/plan';
import { isOpening, isRoom } from '../../types/plan';
import { step } from './geometry';

export interface DoorCandidate {
  cell: Cell;
  side: Side;
  roomA: string;
  roomB: string;
}

export function doorCandidates(plan: FloorPlan): DoorCandidate[] {
  const rooms = plan.blocks.filter(isRoom);
  const openings = plan.blocks.filter(isOpening);
  const hasOpening = (a: Cell, side: Side): boolean => {
    const nb = step(a, side);
    const opp: Side = side === 'N' ? 'S' : side === 'S' ? 'N' : side === 'E' ? 'W' : 'E';
    return openings.some(
      (o) =>
        (o.cell.x === a.x && o.cell.y === a.y && o.side === side) ||
        (o.cell.x === nb.x && o.cell.y === nb.y && o.side === opp),
    );
  };
  const out: DoorCandidate[] = [];
  for (let i = 0; i < rooms.length; i += 1) {
    for (let j = i + 1; j < rooms.length; j += 1) {
      const a = rooms[i].rect;
      const b = rooms[j].rect;
      // a 의 동쪽 벽 = b 의 서쪽 벽
      if (a.x + a.w === b.x || b.x + b.w === a.x) {
        const left = a.x + a.w === b.x ? a : b;
        const right = left === a ? b : a;
        const y0 = Math.max(a.y, b.y);
        const y1 = Math.min(a.y + a.h, b.y + b.h);
        if (y1 > y0) {
          const y = Math.floor((y0 + y1 - 1) / 2);
          const cell = { x: left.x + left.w - 1, y };
          if (!segmentHasOpening(y0, y1, (yy) => hasOpening({ x: left.x + left.w - 1, y: yy }, 'E'))) {
            out.push({ cell, side: 'E', roomA: rooms[left === a ? i : j].id, roomB: rooms[right === a ? i : j].id });
          }
        }
      }
      // a 의 남쪽 벽 = b 의 북쪽 벽
      if (a.y + a.h === b.y || b.y + b.h === a.y) {
        const top = a.y + a.h === b.y ? a : b;
        const bottom = top === a ? b : a;
        const x0 = Math.max(a.x, b.x);
        const x1 = Math.min(a.x + a.w, b.x + b.w);
        if (x1 > x0) {
          const x = Math.floor((x0 + x1 - 1) / 2);
          const cell = { x, y: top.y + top.h - 1 };
          if (!segmentHasOpening(x0, x1, (xx) => hasOpening({ x: xx, y: top.y + top.h - 1 }, 'S'))) {
            out.push({ cell, side: 'S', roomA: rooms[top === a ? i : j].id, roomB: rooms[bottom === a ? i : j].id });
          }
        }
      }
    }
  }
  return out;
}

function segmentHasOpening(from: number, to: number, test: (i: number) => boolean): boolean {
  for (let i = from; i < to; i += 1) if (test(i)) return true;
  return false;
}
