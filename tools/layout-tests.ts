/** 상자 + 잔여공간 생성기와 안전 미션의 순수 연산 시험 — 설계서 v1.8 §6.1. */
import { buildGraph } from '../src/core/graph/build';
import { openingBetween } from '../src/core/graph/build';
import { safetyMissions } from '../src/core/game/missions';
import type { Game } from '../src/core/game/loop';
import { cellKey, cellsOf, step } from '../src/core/grid/geometry';
import {
  decomposeCells,
  generateResidualPlan,
  normalizeBedroomSides,
  shellCells,
  type ResidualPlanRequest,
  type ShellShape,
  type Side8,
  validateResidualProjection,
} from '../src/core/plan/residual';
import { isOpening, isRoom, type Side } from '../src/types/plan';
import { VN } from '../src/types/graph';

type Check = (name: string, fn: () => void) => void;
type Assert = (condition: boolean, message: string) => void;

const SHELLS: ShellShape[] = ['wide', 'long', 'bend-left', 'bend-right'];
const SIDES: Side8[] = ['NW', 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W'];
const CARDINAL: Side[] = ['N', 'E', 'S', 'W'];

function cases(): ResidualPlanRequest[] {
  const out: ResidualPlanRequest[] = [];
  for (const shell of SHELLS) {
    for (const bedrooms of [1, 2, 3, 4] as const) {
      for (const kitchenClosed of [false, true]) {
        for (let offset = 0; offset < SIDES.length; offset += 1) {
          const bedroomSides = Array.from({ length: bedrooms }, (_, index) => SIDES[(offset + index * 2) % SIDES.length]);
          out.push({ shell, bedrooms, kitchenClosed, bedroomSides });
        }
      }
    }
  }
  return out;
}

export function layoutTests(check: Check, assert: Assert): void {
  check('테두리 4종 × 방 수 × 주방 × 방 위치 256가지를 모두 만든다', () => {
    for (const request of cases()) {
      const { plan } = generateResidualPlan(request);
      const issues = validateResidualProjection(plan, request);
      assert(issues.length === 0, `${JSON.stringify(request)}: ${issues.join(' / ')}`);
    }
  });

  check('같은 상자 입력은 블록과 id까지 완전히 같은 결과를 만든다', () => {
    for (const shell of SHELLS) {
      for (const bedrooms of [1, 2, 3, 4] as const) {
        for (const kitchenClosed of [false, true]) {
          const request: ResidualPlanRequest = { shell, bedrooms, kitchenClosed, bedroomSides: SIDES.slice(0, bedrooms) };
          const a = JSON.stringify(generateResidualPlan(request).plan);
          const b = JSON.stringify(generateResidualPlan(request).plan);
          assert(a === b, `${shell} 방 ${bedrooms}개 결과가 결정론적이지 않다.`);
        }
      }
    }
  });

  check('현관문에서 생성된 모든 침실까지 통행 그래프가 이어진다', () => {
    for (const request of cases()) {
      const { plan } = generateResidualPlan(request);
      const graph = buildGraph(plan);
      const seen = new Set<string>([VN.outdoor]);
      const queue: string[] = [VN.outdoor];
      while (queue.length) {
        const here = queue.shift() as string;
        for (const edge of graph.adjacency[here] ?? []) {
          if (edge.via === 'adjacent' || edge.via === 'window') continue;
          const next = edge.a === here ? edge.b : edge.a;
          if (seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
      }
      const missing = graph.nodes.filter((node) => node.roomKind === 'bedroom' && !seen.has(node.id));
      assert(missing.length === 0, `${JSON.stringify(request)}: 현관에서 ${missing.map((node) => node.id).join(', ')}에 못 간다.`);
    }
  });

  check('문 없는 주방과 다른 잔여공간의 공유 벽은 전부 트여 있다', () => {
    for (const request of cases().filter((item) => !item.kitchenClosed)) {
      const { plan } = generateResidualPlan(request);
      const rooms = plan.blocks.filter(isRoom);
      const kitchen = rooms.find((room) => room.id === 'zone_kitchen');
      assert(Boolean(kitchen), `${JSON.stringify(request)}: 트인 주방이 없다.`);
      if (!kitchen) continue;
      const owner = new Map<string, string>();
      for (const room of rooms) for (const cell of cellsOf(room.rect)) owner.set(cellKey(cell), room.id);
      let shared = 0;
      for (const cell of cellsOf(kitchen.rect)) {
        for (const side of CARDINAL) {
          const other = owner.get(cellKey(step(cell, side)));
          if (!other || other === kitchen.id || !other.startsWith('zone_')) continue;
          shared += 1;
          const openingId = openingBetween(plan, cell, side);
          const opening = plan.blocks.find((block) => block.id === openingId);
          assert(Boolean(opening && isOpening(opening) && opening.openingKind === 'open_passage'), `${cellKey(cell)} ${side}가 트인 통로가 아니다.`);
        }
      }
      assert(shared > 0, `${JSON.stringify(request)}: 주방이 공용부와 맞닿지 않는다.`);
    }
  });

  check('테두리 분해는 원래 칸을 빠짐없이 한 번씩 덮는다', () => {
    for (const shell of SHELLS) {
      const source = shellCells(shell);
      const rects = decomposeCells(source);
      const projected = new Set<string>();
      for (const rect of rects) {
        for (const cell of cellsOf(rect)) {
          const key = cellKey(cell);
          assert(!projected.has(key), `${shell} ${key}가 두 번 덮였다.`);
          projected.add(key);
        }
      }
      assert(projected.size === source.size, `${shell}에서 분해 뒤 칸 수가 달라졌다.`);
      assert([...source].every((key) => projected.has(key)), `${shell}에서 빠진 칸이 있다.`);
    }
  });

  check('방 위치를 덜 고르면 겹치지 않는 무난한 기본 위치로 채운다', () => {
    for (const bedrooms of [1, 2, 3, 4] as const) {
      const normalized = normalizeBedroomSides(bedrooms, ['NW', 'NW']);
      assert(normalized.length === bedrooms, `방 ${bedrooms}개 기본 위치 수가 맞지 않다.`);
      assert(new Set(normalized).size === normalized.length, `방 ${bedrooms}개 기본 위치가 겹친다.`);
    }
  });

  check('2D 안전 미션은 해낸 행동과 이 판에 없는 문을 구분한다', () => {
    const withDoor = {
      ctx: { boundaries: new Map([['a|b', { openingKind: 'door' }]]) },
      state: {
        player: { posture: 'stand' },
        status: 'running',
        log: { events: { checkedDoorHeat: 1, closedDoorBehind: 1 } },
      },
      frames: [{ posture: 'crouch' }],
    } as unknown as Game;
    const done = safetyMissions(withDoor, true);
    assert(done.find((mission) => mission.id === 'crouch')?.done === true, '몸 낮추기 완료를 찾지 못했다.');
    assert(done.find((mission) => mission.id === 'touch-door')?.done === true, '문 확인 완료를 찾지 못했다.');
    assert(done.find((mission) => mission.id === 'close-door')?.done === true, '문 닫기 완료를 찾지 못했다.');

    const noDoor = {
      ctx: { boundaries: new Map() },
      state: {
        player: { posture: 'stand' },
        status: 'running',
        log: { events: { checkedDoorHeat: 0, closedDoorBehind: 0 } },
      },
      frames: [],
    } as unknown as Game;
    const optional = safetyMissions(noDoor, true);
    assert(optional.find((mission) => mission.id === 'touch-door')?.available === false, '문 없는 판에서 문 확인을 요구한다.');
    assert(optional.find((mission) => mission.id === 'close-door')?.available === false, '문 없는 판에서 문 닫기를 요구한다.');
  });
}
