/** 외곽 + 독립실 + 공용 바닥 생성기와 안전 미션의 순수 연산 시험 — 설계서 v1.9 §6. */
import { buildGraph } from '../src/core/graph/build';
import { openingBetween } from '../src/core/graph/build';
import { campaignScore } from '../src/core/campaign/score';
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
import { canDefineShellZone, canReflowShellRoom, clearShellZone, defineShellZone, reflowShellFloor, reflowShellZones } from '../src/core/plan/reflow';
import { completeShellSketch, preparedShellPlan } from '../src/core/plan/shellSketch';
import { canResizeOpening, fitOpeningSpan } from '../src/core/grid/occupancy';
import { CAMPAIGN_DEMO_RECORDS } from '../src/content/campaign-demo';
import { emptyCampaignFilters, filterCampaignRecords, summarizeCampaign } from '../src/core/campaign/dashboard';
import { isOpening, isPoint, isRoom, type EvacRoute, type FloorPlan, type Rect, type Side } from '../src/types/plan';
import { VN } from '../src/types/graph';
import { emptyProgress } from '../src/types/save';

type Check = (name: string, fn: () => void) => void;
type Assert = (condition: boolean, message: string) => void;

const SHELLS: ShellShape[] = ['wide', 'long', 'compact', 'bend-left', 'bend-right', 'step-left', 'step-right', 'notch'];
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
  check('준비된 외곽 8종은 방·가구 없이 이어진 공용 바닥에서 시작한다', () => {
    for (const shell of SHELLS) {
      const plan = preparedShellPlan(shell);
      assert(Boolean(plan.shell?.cells.length), `${shell} 외곽 칸이 없다.`);
      assert(plan.blocks.filter(isRoom).every((room) => room.wallMode === 'zone'), `${shell}에 미리 닫힌 방이 들어 있다.`);
      assert(!plan.blocks.some(isPoint), `${shell}에 가구나 표시가 미리 들어 있다.`);
    }
  });

  check('트인 주방은 남은 바닥 일부만 벽 없이 지정하고 다시 그리면 이전 범위를 거실로 되돌린다', () => {
    const base = preparedShellPlan('wide');
    const firstRect = { x: 12, y: 3, w: 4, h: 4 };
    assert(canDefineShellZone(base, firstRect), '첫 트인 주방 범위를 지정할 수 없다.');
    const first = defineShellZone(base, {
      kind: 'room', id: 'zone_kitchen_test_1', layer: 'home', roomKind: 'kitchen', rect: firstRect,
      label: '주방', showLabel: true, wallMode: 'zone',
    });
    assert(Boolean(first), '트인 주방을 만들지 못했다.');
    if (!first) return;
    const firstKitchen = new Set(first.blocks.filter(isRoom).filter((room) => room.wallMode === 'zone' && room.roomKind === 'kitchen').flatMap((room) => cellsOf(room.rect)).map(cellKey));
    assert(firstKitchen.size === 16 && cellsOf(firstRect).every((cell) => firstKitchen.has(cellKey(cell))), `주방 범위가 ${firstKitchen.size}/16칸이다.`);
    assert(first.blocks.some((block) => isRoom(block) && block.wallMode === 'zone' && block.roomKind === 'living'), '주방을 그린 뒤 남은 거실이 사라졌다.');
    assert(first.blocks.some((block) => isOpening(block) && block.openingKind === 'open_passage' && block.hideInPlan), '거실과 주방 사이 숨은 열린 통로가 없다.');

    const secondRect = { x: 16, y: 8, w: 4, h: 3 };
    const second = defineShellZone(first, {
      kind: 'room', id: 'zone_kitchen_test_2', layer: 'home', roomKind: 'kitchen', rect: secondRect,
      label: '주방', showLabel: true, wallMode: 'zone',
    });
    assert(Boolean(second), '트인 주방을 다시 그리지 못했다.');
    if (!second) return;
    const secondKitchen = new Set(second.blocks.filter(isRoom).filter((room) => room.wallMode === 'zone' && room.roomKind === 'kitchen').flatMap((room) => cellsOf(room.rect)).map(cellKey));
    assert(secondKitchen.size === 12 && cellsOf(secondRect).every((cell) => secondKitchen.has(cellKey(cell))), '다시 그린 주방 범위가 맞지 않는다.');
    assert(cellsOf(firstRect).some((cell) => !secondKitchen.has(cellKey(cell))), '이전 주방 범위가 그대로 남았다.');
    const kitchenRoom = second.blocks.find((block) => isRoom(block) && block.wallMode === 'zone' && block.roomKind === 'kitchen');
    assert(Boolean(kitchenRoom), '삭제할 트인 주방 구역이 없다.');
    if (!kitchenRoom || !isRoom(kitchenRoom)) return;
    const cleared = clearShellZone(second, kitchenRoom.id);
    assert(Boolean(cleared), '트인 주방 용도를 삭제하지 못했다.');
    if (!cleared) return;
    assert(!cleared.blocks.some((block) => isRoom(block) && block.wallMode === 'zone' && block.roomKind === 'kitchen'), '삭제한 트인 주방 용도가 남았다.');
    assert(cellsOf(secondRect).every((cell) => cleared.blocks.filter(isRoom).some((room) => room.wallMode === 'zone' && room.roomKind === 'living' && cellsOf(room.rect).some((owned) => cellKey(owned) === cellKey(cell)))), '삭제한 주방 범위가 거실 바닥으로 돌아오지 않았다.');

    const closed = {
      kind: 'room', id: 'closed-test', layer: 'home', roomKind: 'bath', rect: { x: 4, y: 4, w: 3, h: 3 },
      label: '욕실', showLabel: true, wallMode: 'closed',
    } as const;
    const withClosed = reflowShellFloor({ ...second, blocks: second.blocks.concat(closed) });
    assert(Boolean(withClosed), '주방 침범 검사용 욕실을 놓지 못했다.');
    if (!withClosed) return;
    assert(!canDefineShellZone(withClosed, { x: 5, y: 5, w: 3, h: 3 }), '트인 주방이 독립실을 침범한다.');
    assert(!canDefineShellZone(withClosed, { x: 0, y: 0, w: 3, h: 3 }), '트인 주방이 집 외곽을 벗어난다.');
  });

  check('직각 외곽선은 내부 칸으로 바꾸고 너무 작은 외곽은 고칠 말을 돌려준다', () => {
    const good = completeShellSketch([{ x: 2, y: 2 }, { x: 20, y: 2 }, { x: 20, y: 14 }, { x: 2, y: 14 }]);
    assert(good.ok && good.cells.length === 216, `직사각형 외곽 결과 ${good.message} / ${good.cells.length}칸`);
    const small = completeShellSketch([{ x: 2, y: 2 }, { x: 5, y: 2 }, { x: 5, y: 5 }, { x: 2, y: 5 }]);
    assert(!small.ok && small.message.includes('네 칸'), `작은 외곽 안내가 알맞지 않다: ${small.message}`);
  });

  check('미닫이문·미닫이창은 같은 곧은 벽에서 1~6칸 길이를 늘리고 줄이며 경계·충돌을 넘지 않는다', () => {
    const plan = preparedShellPlan('wide');
    const opening = { kind: 'opening', id: 'wide-window', layer: 'home', openingKind: 'sliding_window', cell: { x: 4, y: 2 }, side: 'N', span: 1, closedByDefault: true } as const;
    const withOpening = { ...plan, blocks: plan.blocks.concat(opening) } as FloorPlan;
    assert(canResizeOpening(withOpening, opening, 1), '1칸 창을 유지할 수 없다.');
    assert(canResizeOpening(withOpening, opening, 3), '3칸 창으로 늘릴 수 없다.');
    assert(canResizeOpening(withOpening, opening, 6), '6칸 미닫이창으로 늘릴 수 없다.');
    const slidingDoor = { ...opening, id: 'wide-sliding-door', openingKind: 'sliding_door' as const };
    const withSlidingDoor = { ...plan, blocks: plan.blocks.concat(slidingDoor) } as FloorPlan;
    assert(canResizeOpening(withSlidingDoor, slidingDoor, 6), '미닫이문을 6칸 길이로 늘릴 수 없다.');
    assert(canResizeOpening({ ...withSlidingDoor, blocks: withSlidingDoor.blocks.map((block) => block.id === slidingDoor.id ? { ...slidingDoor, span: 6 } : block) }, { ...slidingDoor, span: 6 }, 1), '미닫이문을 1칸 길이로 줄일 수 없다.');
    const blockerLeft = { ...opening, id: 'blocking-window-left', cell: { x: 3, y: 2 } };
    const blockerRight = { ...opening, id: 'blocking-window-right', cell: { x: 9, y: 2 } };
    const blocked = { ...plan, blocks: plan.blocks.concat([opening, blockerLeft, blockerRight]) } as FloorPlan;
    assert(!canResizeOpening(blocked, opening, 6), '다른 창과 겹치며 미닫이창이 늘어난다.');
    const edge = { ...opening, id: 'edge-window', cell: { x: 21, y: 2 } };
    const atEdge = { ...plan, blocks: plan.blocks.concat(edge) } as FloorPlan;
    const edgeFit = fitOpeningSpan(atEdge, edge, 2);
    assert(Boolean(edgeFit && edgeFit.cell.x === 20), '외곽 끝의 창이 반대쪽 빈 벽으로 늘어나지 않는다.');
  });

  check('캠페인 지역·학교·학급 필터와 요약은 같은 학생 집합을 사용한다', () => {
    const filters = { ...emptyCampaignFilters(), sidoCode: '28', sigunguCode: '28237', schoolId: 'demo-bupyeong-es', grade: '3학년', className: '2반' };
    const filtered = filterCampaignRecords(CAMPAIGN_DEMO_RECORDS, filters);
    assert(filtered.length > 0, '복합 필터 결과가 없다.');
    assert(filtered.every((record) => record.region.sidoCode === '28' && record.school.id === 'demo-bupyeong-es' && record.grade === '3학년' && record.className === '2반'), '복합 필터 밖의 학생이 섞였다.');
    const summary = summarizeCampaign(filtered);
    assert(summary.participants === filtered.length, '요약 참여 인원과 표의 인원이 다르다.');
    assert(summary.ready <= summary.participants, '준비 완료 인원이 참여 인원보다 많다.');
  });

  check('테두리 8종 × 방 수 × 주방 × 방 위치 512가지를 모두 만든다', () => {
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

  check('피난전실과 알파룸 선택 4가지도 모든 테두리·방 수·주방에서 독립실로 만든다', () => {
    for (const shell of SHELLS) {
      for (const bedrooms of [1, 2, 3, 4] as const) {
        for (const kitchenClosed of [false, true]) {
          for (const extras of [
            { includeRefugeLobby: false, includeAlphaRoom: false },
            { includeRefugeLobby: true, includeAlphaRoom: false },
            { includeRefugeLobby: false, includeAlphaRoom: true },
            { includeRefugeLobby: true, includeAlphaRoom: true },
          ]) {
            const request: ResidualPlanRequest = {
              shell,
              bedrooms,
              kitchenClosed,
              bedroomSides: normalizeBedroomSides(bedrooms, []),
              ...extras,
            };
            const { plan } = generateResidualPlan(request);
            const issues = validateResidualProjection(plan, request);
            assert(issues.length === 0, `${JSON.stringify(request)}: ${issues.join(' / ')}`);
          }
        }
      }
    }
  });

  check('외곽 칸은 바닥과 정확히 같고 공용 구역 경계는 화면에서 숨긴다', () => {
    for (const request of cases()) {
      const { plan } = generateResidualPlan(request);
      const shell = new Set((plan.shell?.cells ?? []).map(cellKey));
      const floor = new Set(plan.blocks.filter(isRoom).flatMap((room) => cellsOf(room.rect).map(cellKey)));
      assert(shell.size === floor.size && [...shell].every((key) => floor.has(key)), `${JSON.stringify(request)}: 외곽과 바닥이 다르다.`);
      for (const room of plan.blocks.filter(isRoom)) {
        assert(room.wallMode === (room.id.startsWith('zone_') ? 'zone' : 'closed'), `${room.id} 벽 성격이 잘못됐다.`);
      }
      for (const opening of plan.blocks.filter(isOpening).filter((item) => item.openingKind === 'open_passage')) {
        assert(opening.hideInPlan === true, `${opening.id}가 흰색 벽 틈으로 남는다.`);
      }
    }
  });

  check('시작 평면은 구조와 문만 만들고 가구·표시는 뒤 단계에 남겨 둔다', () => {
    for (const request of cases()) {
      const { plan } = generateResidualPlan(request);
      assert(!plan.blocks.some(isPoint), `${JSON.stringify(request)}: 구조 선택 전에 가구나 표시가 들어 있다.`);
    }
  });

  check('독립실을 공용 바닥 쪽으로 옮겨도 외곽 안 바닥이 빈틈없이 다시 채워진다', () => {
    const { plan } = generateResidualPlan({ bedrooms: 2, shell: 'wide', bedroomSides: ['NW', 'NE'], kitchenClosed: false });
    const room = plan.blocks.find((block) => isRoom(block) && block.wallMode === 'closed' && block.roomKind === 'bedroom');
    assert(Boolean(room), '옮길 침실이 없다.');
    if (!room || !isRoom(room)) return;
    const candidate = firstValidRect(plan, room.id, [
      { ...room.rect, x: room.rect.x + 1 },
      { ...room.rect, x: room.rect.x - 1 },
      { ...room.rect, y: room.rect.y + 1 },
      { ...room.rect, y: room.rect.y - 1 },
    ]);
    assert(Boolean(candidate), '공용 바닥 쪽으로 옮길 수 있는 후보가 없다.');
    if (!candidate) return;
    const moved = reflowShellZones(plan, room.id, candidate);
    assert(Boolean(moved), '방 이동 뒤 공용 바닥 재계산에 실패했다.');
    if (moved) assertShellProjection(moved, assert);
  });

  check('독립실 크기를 늘려도 공용 바닥을 다시 만들고 외곽·다른 방 침범은 막는다', () => {
    const { plan } = generateResidualPlan({ bedrooms: 2, shell: 'wide', bedroomSides: ['NW', 'NE'], kitchenClosed: false });
    const room = plan.blocks.find((block) => isRoom(block) && block.wallMode === 'closed' && block.roomKind === 'bedroom');
    assert(Boolean(room), '늘릴 침실이 없다.');
    if (!room || !isRoom(room)) return;
    const candidate = firstValidRect(plan, room.id, [
      { ...room.rect, w: room.rect.w + 1 },
      { ...room.rect, x: room.rect.x - 1, w: room.rect.w + 1 },
      { ...room.rect, h: room.rect.h + 1 },
      { ...room.rect, y: room.rect.y - 1, h: room.rect.h + 1 },
    ]);
    assert(Boolean(candidate), '공용 바닥 쪽으로 늘릴 수 있는 후보가 없다.');
    if (candidate) {
      const resized = reflowShellZones(plan, room.id, candidate);
      assert(Boolean(resized), '방 크기 변경 뒤 공용 바닥 재계산에 실패했다.');
      if (resized) assertShellProjection(resized, assert);
    }
    assert(!canReflowShellRoom(plan, room.id, { ...room.rect, x: -1 }), '집 외곽 밖 크기 변경을 허용했다.');
    const other = plan.blocks.find((block) => isRoom(block) && block.wallMode === 'closed' && block.id !== room.id);
    if (other && isRoom(other)) assert(!canReflowShellRoom(plan, room.id, other.rect), '다른 독립실과 완전히 겹치는 변경을 허용했다.');
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
          assert(Boolean(opening && isOpening(opening) && opening.openingKind === 'open_passage' && opening.hideInPlan), `${cellKey(cell)} ${side}가 숨은 공용 통로가 아니다.`);
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

  check('캠페인 안전 완성도는 구조 20·안전 25·경로 30·연습 25로만 합산한다', () => {
    const base = generateResidualPlan({ shell: 'wide', bedrooms: 2, bedroomSides: ['NW', 'NE'], kitchenClosed: false }).plan;
    const plan = {
      ...base,
      blocks: base.blocks.concat([
        { kind: 'safety', id: 'score_extinguisher', layer: 'home', subKind: 'extinguisher', cell: { x: 10, y: 8 }, rotation: 0 },
        { kind: 'safety', id: 'score_detector', layer: 'home', subKind: 'detector', cell: { x: 11, y: 8 }, rotation: 0 },
        { kind: 'marker', id: 'score_my_spot', layer: 'home', subKind: 'my_spot', cell: { x: 5, y: 4 }, rotation: 0 },
        { kind: 'marker', id: 'score_meeting', layer: 'home', subKind: 'meeting_point', cell: { x: 1, y: 1 }, rotation: 0 },
      ]),
    } as FloorPlan;
    const route: EvacRoute = { key: 'fire_exit_available', disaster: 'fire', scenario: 'exit_available', startCell: { x: 5, y: 4 }, waypoints: [{ x: 5, y: 4 }] };
    const score = campaignScore(
      plan,
      { fire: { primary: route, alternate: { ...route, key: 'fire_exit_blocked', scenario: 'exit_blocked' } } },
      { ...emptyProgress(), attempts: 1, successes: 1 },
    );
    assert(score.structure === 20, `구조 점수가 ${score.structure}/20이다.`);
    assert(score.safety === 25, `안전 위치 점수가 ${score.safety}/25이다.`);
    assert(score.routes === 30, `경로 점수가 ${score.routes}/30이다.`);
    assert(score.practice === 25 && score.total === 100, `연습/합계가 ${score.practice}/25, ${score.total}/100이다.`);
  });
}

function firstValidRect(plan: FloorPlan, roomId: string, candidates: Rect[]): Rect | null {
  return candidates.find((rect) => canReflowShellRoom(plan, roomId, rect)) ?? null;
}

function assertShellProjection(plan: FloorPlan, assert: Assert): void {
  const shell = new Set((plan.shell?.cells ?? []).map(cellKey));
  const floor = new Set<string>();
  for (const room of plan.blocks.filter(isRoom)) {
    for (const cell of cellsOf(room.rect)) {
      const key = cellKey(cell);
      assert(!floor.has(key), `재계산 뒤 ${key} 바닥이 겹친다.`);
      floor.add(key);
    }
  }
  assert(shell.size === floor.size, '재계산 뒤 외곽과 바닥 칸 수가 다르다.');
  assert([...shell].every((key) => floor.has(key)), '재계산 뒤 외곽 안에 빈 바닥이 있다.');
  for (const opening of plan.blocks.filter(isOpening).filter((item) => item.openingKind === 'open_passage')) {
    assert(opening.hideInPlan === true, `${opening.id} 공용 경계가 화면에 보인다.`);
  }
}
