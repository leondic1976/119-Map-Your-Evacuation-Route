/**
 * 연산 검증 — tools/test.ts 가 부른다.
 *
 * docs/DESIGN-v1.1-changes.md §6.7 의 정책 테스트와 §9.3 의 DoD 를 화면 없이 확인한다.
 *   P3  모든 시작 평면 × 주·보조 경로에 critical 을 다 푸는 길이 실제로 있다
 *   P5  실패해도 잘한 점이 하나는 있다
 *   P6  출처 없는 콘텐츠가 없다
 *   FR-8.7   랜덤 발화 100회가 이길 수 없는 판을 만들지 않는다
 *   FR-8.15  같은 seed 는 같은 판
 *   FR-8.16  위험장 엔진에 재난 이름이 없다
 *   FR-9.7   "이제 뭘 해야 해?"는 모든 단계에서 답한다
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Cell, FloorPlan, RouteSlot } from '../src/types/plan';
import { EXIT_KINDS, SCENARIO_KEYS, emptyFloorPlan, emptyRoute, hasDrawableRoute, pointFootprint, routeKey, scenarioKey, splitKey } from '../src/types/plan';
import { DEFAULT_PASSABILITY, VN } from '../src/types/graph';
import { defaultProfile, emptyProgress, type SafetyBadgeId, type UserProfile } from '../src/types/save';
import type { PlayLog } from '../src/types/report';
import type { GuideRule } from '../src/types/guide';
import { buildGraph, goalNodeIds, startNodeId } from '../src/core/graph/build';
import { findEscape, reachesGoal } from '../src/core/graph/pathfind';
import { analyze } from '../src/core/graph/analyze';
import { evaluate, severityOf } from '../src/core/rules/engine';
import { EXTENSION_RULES, RULES } from '../src/core/rules/definitions';
import { canPlaceRoom, fitOpeningSpan } from '../src/core/grid/occupancy';
import { isAdjacent, step } from '../src/core/grid/geometry';
import { doorlessRooms } from '../src/core/grid/doors';
import { bedroomCount, preparePlan, rotatePlan } from '../src/core/plan/prepare';
import { buildContext, isDoorKind, transfer, walkable } from '../src/core/hazard/transfer';
import { createField, ignite, spread } from '../src/core/hazard/field';
import { aheadTicks, gameGoalCells, hasSurvivablePath, pickIgnition, rng, simulateAhead } from '../src/core/hazard/ignition';
import { effectivePreset, finishGame, startGame, tick, tick as gameTick } from '../src/core/game/loop';
import { buildPracticeCalendar, completePractice, recommendedDifficulty } from '../src/core/game/progress';
import { closeDoorBehind, move, togglePosture } from '../src/core/game/player';
import { emptyLog } from '../src/core/game/playlog';
import { buildReport } from '../src/core/report/build';
import { ALL_FAIL_REASONS } from '../src/core/report/verdicts';
import { selectGuide } from '../src/core/guide/runner';
import { BLOCKS, GUIDE_CARDS, GUIDE_RULES, HAZARD_PRESETS, PALETTE_BASIC, REPORT_ITEMS, REQUIRED_BLOCKS, RULE_MESSAGES, TEMPLATES, fuelOf, isVerified } from '../src/content';
import { checklist, missingOf } from '../src/core/checklist';
import { eul, eun, i } from '../src/core/josa';
import { ALL_STEPS, validateContent, validatePlan } from '../src/content/validate';
import { SaveIncompatibleError, parseSave } from '../src/store/migrate';
import { emptySave, serializeSave } from '../src/store/storage';
import { normalizeEditablePlan, ruleReportsFor, useKids } from '../src/store/kidsStore';
import { KIDS } from '../src/ui/KidCharacters';
import { avatar3dIdentity, CHILD_BODY_SCALE, CHILD_HEAD_SCALE, CHILD_NAME_MARK_Y } from '../src/ui/replay3d/Avatar3D';
import { CHILD_EYE_CROUCH, CHILD_EYE_STAND } from '../src/ui/replay3d/Scene';
import { buildDoors } from '../src/ui/replay3d/geometry';
import { lowerQuality, settingsFor } from '../src/ui/replay3d/quality';
import { gradeModeForGrade, displayName } from '../src/types/save';
import { desktopAssetNames, desktopDownloadPaths, humanBytes } from '../src/content/release';
import { unzipBuffer, zipBuffer } from './zip';

type Check = (name: string, fn: () => void) => void;
type Assert = (cond: boolean, msg: string) => void;

const P: UserProfile = { ...defaultProfile(), gradeMode: 'normal' };
const FIRE = HAZARD_PRESETS[0];

function template(id: string): FloorPlan {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`템플릿 없음 ${id}`);
  return JSON.parse(JSON.stringify(t.plan)) as FloorPlan;
}

function ctxFor(plan: FloorPlan, slot: RouteSlot, profile: UserProfile, waypoints?: Cell[], seen: string[] = []) {
  const graph = buildGraph(plan);
  const key = routeKey('fire', slot);
  const { disaster, scenario } = splitKey(key);
  return {
    plan,
    graph,
    key,
    disaster,
    scenario,
    profile,
    seenCardIds: seen,
    route: waypoints ? emptyRoute('fire', slot, waypoints[0], waypoints) : undefined,
  };
}

function failLog(reason: PlayLog['failReason']): PlayLog {
  const log = emptyLog(1, { x: 3, y: 10 });
  log.outcome = 'fail';
  log.failReason = reason;
  log.elapsedTicks = 40;
  log.visited = [{ x: 5, y: 5 }, { x: 5, y: 6 }];
  return log;
}

function myCell(plan: FloorPlan): Cell {
  const spot = plan.blocks.find((b) => b.kind === 'marker' && b.subKind === 'my_spot');
  if (spot && spot.kind !== 'room' && spot.kind !== 'opening') return spot.cell;
  throw new Error('내 자리 없음');
}

export function logicTests(check: Check, assert: Assert): void {
  /* ---------------------------------------------------------- 콘텐츠 */

  check('이름표 — 1~3학년은 쉬움, 4~6학년은 보통으로 시작하고 빈 이름은 `나`다 (설계서 v1.18 §3)', () => {
    assert(gradeModeForGrade(1) === 'easy' && gradeModeForGrade(3) === 'easy', '저학년이 쉬움으로 시작하지 않는다');
    assert(gradeModeForGrade(4) === 'normal' && gradeModeForGrade(6) === 'normal', '고학년이 보통으로 시작하지 않는다');
    assert(displayName({ studentName: '' }) === '나' && displayName({ studentName: '  ' }) === '나', '빈 이름이 `나`로 보이지 않는다');
    assert(displayName({ studentName: ' 안전이 ' }) === '안전이', '이름 앞뒤 공백이 남는다');
    const keys = Object.keys(defaultProfile());
    assert(!keys.includes('schoolName') && !keys.includes('className'), '프로필에 학교·반이 남아 있다');
  });

  check('콘텐츠 검증 — 개발 모드 오류 0건', () => {
    const r = validateContent(false);
    assert(r.errors.length === 0, r.errors.slice(0, 4).join(' | '));
  });

  check('콘텐츠 검증 — 배포 모드는 출처 미검수를 막는다 (P6)', () => {
    const r = validateContent(true);
    assert(r.errors.length > 0, '미검수 출처가 있는데 배포 모드가 통과했다');
    assert(r.errors.every((e) => e.includes('1차 대조') || e.includes('TODO-VERIFY')), `출처 말고 다른 오류: ${r.errors.find((e) => !e.includes('1차 대조'))}`);
  });

  check('콘텐츠 분량 — 카드 40장 이상, 대사 60건 이상, 판정 문장 11종 이상 (§6.6)', () => {
    assert(GUIDE_CARDS.length >= 30, `카드 ${GUIDE_CARDS.length}장`);
    /* 기본판은 화재 한 종이다 — 지진·침수 카드는 확장판으로 옮겼다 (설계서 v1.6 §2) */
    const offTopic = GUIDE_CARDS.filter((c) => c.id.startsWith('quake.') || c.id.startsWith('flood.'));
    assert(offTopic.length === 0, `기본판에 확장판 카드가 남았다: ${offTopic.map((c) => c.id).join(', ')}`);
    assert(GUIDE_RULES.length >= 60, `대사 ${GUIDE_RULES.length}건`);
    assert(REPORT_ITEMS.length >= 11, `판정 문장 ${REPORT_ITEMS.length}종`);
    for (const c of GUIDE_CARDS) {
      assert(c.sourceIds.length > 0 && !c.sourceIds.includes('TODO-VERIFY'), `${c.id} 출처`);
    }
  });

  check('깨진 카드 링크 없음 (P3)', () => {
    const ids = new Set(GUIDE_CARDS.map((c) => c.id));
    for (const r of GUIDE_RULES) if (r.cardId) assert(ids.has(r.cardId), `${r.id} → ${r.cardId}`);
    for (const i of REPORT_ITEMS) if (i.cardId) assert(ids.has(i.cardId), `${i.id} → ${i.cardId}`);
    for (const id of Object.keys(RULE_MESSAGES.rules)) {
      const w = RULE_MESSAGES.rules[id].whyCardId;
      if (w) assert(ids.has(w), `${id} → ${w}`);
    }
  });

  check('팔레트 기본 8칸 (FR-7.8) · 기본판 규칙셋은 공통+화재', () => {
    assert(PALETTE_BASIC.length === 7, `기본 ${PALETTE_BASIC.length}종 + 더보기`);
    assert(RULES.every((r) => r.id.startsWith('RULE-C') || r.id.startsWith('RULE-F')), '기본판에 확장 규칙이 섞였다');
    assert(EXTENSION_RULES.every((r) => /^RULE-[EWG]/.test(r.id)), '확장 규칙 목록');
    assert(RULES.length === 17, `기본 규칙 ${RULES.length}개`);
  });

  /* ---------------------------------------------------------- 격자·그래프 */

  check('방은 겹치면 놓지 못하고 변을 맞대는 것은 된다 (FR-7.6)', () => {
    const plan = template('apt_2room');
    assert(!canPlaceRoom(plan, { x: 4, y: 4, w: 3, h: 3 }), '겹치는데 허용');
    assert(canPlaceRoom(plan, { x: 17, y: 3, w: 3, h: 3 }), '맞대는데 거부');
    assert(!canPlaceRoom(plan, { x: 0, y: 0, w: 1, h: 3 }), '2×2 보다 작은데 허용');
  });

  check('문이 없는 방을 모두 찾고, 공유 문은 양쪽 방의 문으로 센다 (FR-7.3)', () => {
    const plan: FloorPlan = {
      ...emptyFloorPlan(),
      blocks: [
        { kind: 'room', id: 'a', layer: 'home', roomKind: 'bedroom', rect: { x: 2, y: 2, w: 4, h: 4 }, label: '' },
        { kind: 'room', id: 'b', layer: 'home', roomKind: 'living', rect: { x: 6, y: 2, w: 4, h: 4 }, label: '' },
        { kind: 'room', id: 'c', layer: 'home', roomKind: 'bath', rect: { x: 12, y: 2, w: 3, h: 3 }, label: '' },
      ],
    };
    assert(doorlessRooms(plan).map((room) => room.id).join(',') === 'a,b,c', '문 없는 방 셋을 찾지 못했다');
    const withSharedDoor: FloorPlan = {
      ...plan,
      blocks: plan.blocks.concat([
        { kind: 'opening', id: 'd1', layer: 'home', openingKind: 'door', cell: { x: 5, y: 3 }, side: 'E', closedByDefault: true },
      ]),
    };
    assert(doorlessRooms(withSharedDoor).map((room) => room.id).join(',') === 'c', '공유 문을 양쪽 방에서 세지 못했다');
    const withWindow: FloorPlan = {
      ...withSharedDoor,
      blocks: withSharedDoor.blocks.concat([
        { kind: 'opening', id: 'w1', layer: 'home', openingKind: 'window', cell: { x: 12, y: 2 }, side: 'N', closedByDefault: true },
      ]),
    };
    assert(doorlessRooms(withWindow).map((room) => room.id).join(',') === 'c', '창문을 문으로 잘못 셌다');
    const complete: FloorPlan = {
      ...withWindow,
      blocks: withWindow.blocks.concat([
        { kind: 'opening', id: 'd2', layer: 'home', openingKind: 'balcony_window', cell: { x: 12, y: 3 }, side: 'W', closedByDefault: true },
      ]),
    };
    assert(doorlessRooms(complete).length === 0, '통로인 발코니 창을 놓았는데 문 없는 방으로 남았다');
  });

  check('여닫이문·미닫이문을 고르고, 미닫이문도 배치·그래프·위험장·게임·3D에서 같은 문으로 쓴다', () => {
    const hinged = BLOCKS.find((block) => block.id === 'door');
    const sliding = BLOCKS.find((block) => block.id === 'sliding_door');
    assert(hinged?.easy === '여닫이문', `여닫이문 이름: ${hinged?.easy ?? '없음'}`);
    assert(sliding?.category === 'opening' && sliding.easy === '미닫이문', '미닫이문 콘텐츠가 없다');
    assert(PALETTE_BASIC.indexOf('sliding_door') === PALETTE_BASIC.indexOf('door') + 1, '두 방문이 기본 팔레트에서 나란하지 않다');
    assert(isDoorKind('sliding_door'), '위험장 엔진이 미닫이문을 문으로 보지 않는다');
    assert(Object.values(DEFAULT_PASSABILITY.sliding_door).every((value) => value === 'open'), '미닫이문 그래프 통행표가 열려 있지 않다');

    const plan: FloorPlan = {
      ...emptyFloorPlan(),
      blocks: [
        { kind: 'room', id: 'left', layer: 'home', roomKind: 'bedroom', rect: { x: 2, y: 2, w: 4, h: 4 }, label: '' },
        { kind: 'room', id: 'right', layer: 'home', roomKind: 'living', rect: { x: 6, y: 2, w: 4, h: 4 }, label: '' },
        { kind: 'opening', id: 'slide', layer: 'home', openingKind: 'sliding_door', cell: { x: 5, y: 3 }, side: 'E', closedByDefault: true },
      ],
    };
    assert(doorlessRooms(plan).length === 0, '미닫이문을 놓아도 문 없는 방으로 남는다');
    assert(checklist(plan, ['door'])[0].present, '필수 방문을 미닫이문으로 대신하지 못한다');
    const graph = buildGraph(plan);
    assert(graph.edges.some((edge) => edge.via === 'sliding_door'), '미닫이문 그래프 엣지가 없다');
    assert(graph.warnings.length === 0, `미닫이문 그래프 경고: ${graph.warnings.join(' | ')}`);
    const context = buildContext(plan, graph);
    const field = createField(plan, context, fuelOf);
    const a = { x: 5, y: 3 };
    const b = { x: 6, y: 3 };
    const closedTransfer = transfer(a, b, field, context, { slide: 'closed' }, FIRE);
    const openTransfer = transfer(a, b, field, context, { slide: 'open' }, FIRE);
    assert(closedTransfer === FIRE.doorClosedFactor && openTransfer === 1, `위험 전달 닫힘 ${closedTransfer}, 열림 ${openTransfer}`);

    const closedGeometry = buildDoors(plan, { slide: 'closed' });
    const openGeometry = buildDoors(plan, { slide: 'open' });
    assert(closedGeometry.length > 0 && openGeometry.length > 0, '3D 미닫이문 문짝이 열림 또는 닫힘에서 사라진다');
    assert(closedGeometry.some((value, index) => Math.abs(value - openGeometry[index]) > 0.001), '3D 미닫이문이 옆으로 움직이지 않는다');

    const gamePlan = template('apt_2room');
    const gameDoor = gamePlan.blocks.find((block) => block.kind === 'opening' && block.openingKind === 'door');
    if (!gameDoor || gameDoor.kind !== 'opening') throw new Error('게임용 방문이 없다');
    gameDoor.openingKind = 'sliding_door';
    const gameGraph = buildGraph(gamePlan);
    const game = startGame({ plan: gamePlan, graph: gameGraph, profile: P, config: { hazardId: 'fire', seed: 3, timed: false, gradeMode: 'normal' }, preset: FIRE, startCell: gameDoor.cell, fuelOf });
    const direction = ({ N: 'up', S: 'down', W: 'left', E: 'right' } as const)[gameDoor.side];
    assert(game.state.doorState[gameDoor.id] === 'closed', '미닫이문 게임 시작 상태가 닫힘이 아니다');
    assert(move(game.state, game.ctx, direction), '게임에서 닫힌 미닫이문을 지나지 못한다');
    assert(game.state.doorState[gameDoor.id] === 'open', '게임에서 지나간 미닫이문이 열리지 않는다');
    assert(closeDoorBehind(game.state), '지나온 미닫이문을 닫지 못한다');
  });

  check('가구 표준 크기와 내 위치 한 명 원칙을 이전 저장자료에도 채운다 (설계서 v1.11 §2·§4)', () => {
    const plan = normalizeEditablePlan({
      ...emptyFloorPlan(),
      blocks: [
        { kind: 'furniture', id: 'bed-old', layer: 'home', subKind: 'bed', cell: { x: 2, y: 2 }, rotation: 0 },
        { kind: 'furniture', id: 'sink-old', layer: 'home', subKind: 'sink', cell: { x: 6, y: 2 }, rotation: 0 },
        { kind: 'hazard', id: 'gas-old', layer: 'home', subKind: 'gas_range', cell: { x: 10, y: 2 }, rotation: 0 },
        { kind: 'marker', id: 'mine-old', layer: 'home', subKind: 'my_spot', cell: { x: 3, y: 3 }, rotation: 0 },
        { kind: 'marker', id: 'mine-new', layer: 'home', subKind: 'my_spot', cell: { x: 4, y: 4 }, rotation: 0 },
      ],
    });
    const bed = plan.blocks.find((block) => block.id === 'bed-old');
    const sink = plan.blocks.find((block) => block.id === 'sink-old');
    const gas = plan.blocks.find((block) => block.id === 'gas-old');
    assert(Boolean(bed && bed.kind === 'furniture' && pointFootprint(bed).w === 2 && pointFootprint(bed).h === 3), '침대가 2×3칸이 아니다');
    assert(Boolean(sink && sink.kind === 'furniture' && pointFootprint(sink).w === 3 && pointFootprint(sink).h === 1), '싱크대가 3×1칸이 아니다');
    assert(Boolean(gas && gas.kind === 'furniture' && gas.subKind === 'gas_range'), '예전 가스불이 가구 갈래로 옮겨지지 않았다');
    const mine = plan.blocks.filter((block) => block.kind === 'marker' && block.subKind === 'my_spot');
    assert(mine.length === 1 && mine[0].id === 'mine-new', `내 위치가 ${mine.map((block) => block.id).join(',')}로 남았다`);
  });

  check('모든 가구에 사실적인 조절 범위가 있고 선택한 가구·현관 크기를 실제로 바꾼다 (설계서 v1.13 §2·§3)', () => {
    const furniture = BLOCKS.filter((block) => block.category === 'furniture');
    assert(furniture.length >= 13, `가구가 ${furniture.length}종뿐이다`);
    assert(furniture.every((block) => Boolean(block.minSize && block.maxSize)), '크기 조절 범위가 없는 가구가 있다');
    assert(BLOCKS.find((block) => block.id === 'gas_range')?.category === 'furniture', '가스불이 가구 갈래가 아니다');

    const plan: FloorPlan = {
      ...emptyFloorPlan(),
      blocks: [
        { kind: 'room', id: 'entry', layer: 'home', roomKind: 'entry', rect: { x: 1, y: 1, w: 3, h: 3 }, label: '현관' },
        { kind: 'room', id: 'bedroom', layer: 'home', roomKind: 'bedroom', rect: { x: 5, y: 1, w: 8, h: 8 }, label: '내 방' },
        { kind: 'furniture', id: 'bed', layer: 'home', subKind: 'bed', cell: { x: 6, y: 2 }, size: { w: 2, h: 3 }, rotation: 0 },
      ],
    };
    useKids.setState({ plan, past: [], future: [], selection: 'bed', multi: ['bed'] });
    useKids.getState().resizePoint('bed', { w: 3, h: 4 });
    const grownBed = useKids.getState().plan.blocks.find((block) => block.id === 'bed');
    assert(Boolean(grownBed && grownBed.kind === 'furniture' && pointFootprint(grownBed).w === 3 && pointFootprint(grownBed).h === 4), '침대 가로·세로가 바뀌지 않았다');
    useKids.getState().resizePoint('bed', { w: 5, h: 7 });
    const rejectedBed = useKids.getState().plan.blocks.find((block) => block.id === 'bed');
    assert(Boolean(rejectedBed && rejectedBed.kind === 'furniture' && pointFootprint(rejectedBed).w === 3 && pointFootprint(rejectedBed).h === 4), '침대 최대 범위를 넘어 늘어났다');

    useKids.getState().resizeRoom('entry', { x: 1, y: 1, w: 4, h: 3 });
    const entry = useKids.getState().plan.blocks.find((block) => block.id === 'entry');
    assert(Boolean(entry && entry.kind === 'room' && entry.rect.w === 4 && entry.rect.h === 3), '현관 공간 가로 크기가 바뀌지 않았다');
  });

  check('벽 끝의 문도 반대쪽 빈 벽을 찾아 3칸으로 늘리고 안팎 열림을 3D에 반영한다 (설계서 v1.11 §3)', () => {
    const plan: FloorPlan = {
      ...emptyFloorPlan(),
      blocks: [
        { kind: 'room', id: 'room', layer: 'home', roomKind: 'bedroom', rect: { x: 2, y: 2, w: 4, h: 4 }, label: '' },
        { kind: 'opening', id: 'door-end', layer: 'home', openingKind: 'door', cell: { x: 5, y: 2 }, side: 'N', span: 1, swing: 'inward', closedByDefault: true },
      ],
    };
    const door = plan.blocks[1];
    if (door.kind !== 'opening') throw new Error('문이 없다');
    const fitted = fitOpeningSpan(plan, door, 3);
    assert(Boolean(fitted && fitted.cell.x === 3 && fitted.span === 3), `3칸 문 기준점이 ${fitted?.cell.x ?? '없음'}이다`);
    const inward = buildDoors(plan, { 'door-end': 'open' });
    const outward = buildDoors({ ...plan, blocks: plan.blocks.map((block) => block.id === 'door-end' && block.kind === 'opening' ? { ...block, swing: 'outward' } : block) }, { 'door-end': 'open' });
    assert(inward.length > 0 && outward.length > 0, '열린 여닫이문 문짝이 3D에서 사라진다');
    assert(inward.some((value, index) => Math.abs(value - outward[index]) > 0.001), '3D 문이 안팎 방향을 구분하지 않는다');
  });

  check('대피경로가 한 줄도 없으면 출력할 수 없고 한 줄을 그리면 출력할 수 있다 (설계서 v1.11 §5)', () => {
    assert(!hasDrawableRoute(undefined) && !hasDrawableRoute({}), '빈 경로를 출력 가능으로 보았다');
    const short = emptyRoute('fire', 'primary', { x: 2, y: 2 }, [{ x: 2, y: 2 }]);
    assert(!hasDrawableRoute({ primary: short }), '점 하나를 대피경로로 보았다');
    const route = emptyRoute('fire', 'primary', { x: 2, y: 2 }, [{ x: 2, y: 2 }, { x: 3, y: 2 }]);
    assert(hasDrawableRoute({ primary: route }), '이어진 대피경로를 출력 불가로 보았다');
  });

  check('개방형 주방은 거실·복도 쪽 벽 전체가 트인 통로가 된다 (설계서 v1.6 §11.3)', () => {
    const plan = preparePlan(template('apt_2room'), { openKitchen: true });
    const passages = plan.blocks.filter((block) => block.kind === 'opening' && block.openingKind === 'open_passage');
    assert(passages.length === 14, `방 두 개 평면의 열린 공용 경계가 14칸이어야 하는데 ${passages.length}칸이다`);
    assert(passages.every((passage) => passage.kind === 'opening' && passage.closedByDefault === false), '트인 통로가 닫힌 상태다');
    assert(passages.every((passage) => passage.kind === 'opening' && passage.hideInPlan === true), '공용 경계가 2D에서 벽 틈으로 보인다');
    assert(Boolean(plan.shell?.cells.length), '집 외곽 칸이 만들어지지 않았다');
    assert(!doorlessRooms(plan).some((room) => room.roomKind === 'kitchen'), '트인 주방을 문 없는 방으로 잘못 안내한다');
    const graph = buildGraph(plan);
    assert(graph.edges.filter((edge) => edge.via === 'open_passage').length === 14, '열린 공용 바닥이 통행 그래프에 이어지지 않았다');
    assert(Object.values(DEFAULT_PASSABILITY.open_passage).every((value) => value === 'open'), '트인 통로가 모든 상황에서 항상 열려 있지 않다');
    assert(graph.warnings.length === 0, `트인 주방 그래프 경고: ${graph.warnings.join(' | ')}`);
    const passage = plan.blocks.find((block) => block.kind === 'opening' && block.openingKind === 'open_passage');
    if (!passage || passage.kind !== 'opening') throw new Error('트인 통로가 없다');
    const context = buildContext(plan, graph);
    const field = createField(plan, context, fuelOf);
    const otherSide = step(passage.cell, passage.side);
    assert(Boolean(walkable(passage.cell, otherSide, field, context)), '트인 벽을 사람이 지나갈 수 없다');
    assert(transfer(passage.cell, otherSide, field, context, { [passage.id]: 'closed' }, FIRE) === 1, '트인 벽에서 연기 흐름을 막는다');
  });

  check('질문형 시작의 방만 놓기·회전이 평면 경계를 지킨다 (설계서 v1.6 §11.4)', () => {
    const source = template('apt_2room');
    const roomsOnly = preparePlan(source, { roomsOnly: true });
    assert(roomsOnly.blocks.every((block) => block.kind === 'room'), '방만 놓기에 문이나 물건이 섞였다');
    assert(bedroomCount(roomsOnly) === 2, '방만 놓기에서 침실 수가 달라졌다');
    for (const rotation of [0, 90, 180, 270] as const) {
      const plan = preparePlan(source, { openKitchen: true, rotation });
      assert(validatePlan(plan).length === 0, `${rotation}도 회전 평면이 도면 밖으로 나갔다: ${validatePlan(plan).join(' | ')}`);
      assert(bedroomCount(plan) === 2, `${rotation}도 회전에서 침실 수가 달라졌다`);
    }
    const turned = rotatePlan(source, 90);
    assert(turned.grid.width === source.grid.height && turned.grid.height === source.grid.width, '90도 회전에서 도면 가로·세로가 바뀌지 않았다');
  });

  check('시작 평면 8종이 모두 말이 되고 고립된 방이 없다 (설계서 v1.2 §1.2)', () => {
    assert(TEMPLATES.length === 8, `템플릿 ${TEMPLATES.length}종`);
    for (const t of TEMPLATES) {
      const errs = validatePlan(t.plan);
      assert(errs.length === 0, `${t.id}: ${errs.join(' | ')}`);
      const g = buildGraph(t.plan);
      assert(g.warnings.length === 0, `${t.id}: ${g.warnings.join(' | ')}`);
      assert(analyze(g, 'fire_exit_available', P).isolatedNodes.length === 0, `${t.id}: 고립`);
    }
  });

  check('통행 가능성 표 — 화재 ②에서 현관문은 막히고 경량칸막이는 열린다', () => {
    assert(DEFAULT_PASSABILITY.front_door.fire_exit_blocked === 'blocked', '현관문 ②');
    assert(DEFAULT_PASSABILITY.front_door.fire_exit_available === 'open', '현관문 ①');
    assert(DEFAULT_PASSABILITY.light_partition.fire_exit_blocked === 'open', '경량칸막이 ②');
    assert(DEFAULT_PASSABILITY.light_partition.fire_exit_available === 'blocked', '경량칸막이 ①');
    assert(DEFAULT_PASSABILITY.descent_device.fire_exit_blocked === 'conditional', '완강기는 조건부');
    assert(SCENARIO_KEYS.every((k) => DEFAULT_PASSABILITY.adjacent[k] === 'blocked'), '벽은 늘 막힌다');
  });

  check('goalNodeIds — 키마다 다른 목표, 가상 노드는 셀이 없다', () => {
    const g = buildGraph(template('apt_3room'));
    const ok = goalNodeIds(g, 'fire_exit_available', P);
    assert(ok.includes(VN.outdoor) && ok.includes('c2'), `① ${ok.join(',')}`);
    const blocked = goalNodeIds(g, 'fire_exit_blocked', P);
    assert(!blocked.includes(VN.outdoor) && blocked.includes(VN.neighbor) && blocked.some((id) => id.startsWith('refuge_')), `② ${blocked.join(',')}`);
    const low = goalNodeIds(g, 'flood', { ...P, lowFloor: true });
    assert(low.length === 1 && low[0] === VN.upstairs, `침수(저층) ${low.join(',')}`);
    for (const id of Object.values(VN)) assert(g.nodeById[id] && g.nodeById[id].cells === undefined, `${id}`);
    assert(reachesGoal(buildGraph(template('apt_2room')), 'fire_exit_available', P, { x: 16, y: 10 }), '현관문 anchorCell');
    assert(!reachesGoal(buildGraph(template('apt_2room')), 'fire_exit_blocked', P, { x: 16, y: 10 }), '②인데 현관문이 도달');
  });

  check('routeKey / scenarioKey — 주·보조가 고정된 키를 갖는다 (§3.2)', () => {
    assert(routeKey('fire', 'primary') === 'fire_exit_available', '주');
    assert(routeKey('fire', 'alternate') === 'fire_exit_blocked', '보조');
    assert(routeKey('gas', 'primary') === 'gas' && routeKey('gas', 'alternate') === 'gas', '확장');
    for (const k of SCENARIO_KEYS) {
      const { disaster, scenario } = splitKey(k);
      assert(scenarioKey(disaster, scenario) === k, k);
    }
    const r = emptyRoute('fire', 'alternate', { x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
    assert(r.key === 'fire_exit_blocked' && r.scenario === 'exit_blocked', 'emptyRoute');
  });

  /* ---------------------------------------------------------- 규칙 */

  check('규칙 평가 — ctx.scenario 가 undefined 로 가지 않는다 (§3.2 필수)', () => {
    const plan = template('apt_2room');
    const reports = ruleReportsFor({ plan, routes: {}, hazardId: 'fire', profile: P, seenCardIds: [] });
    assert(reports.length === 1, `리포트 ${reports.length}건`);
    assert(reports[0].scenario === 'exit_available', `scenario ${reports[0].scenario}`);
    const both = ruleReportsFor({
      plan,
      routes: { fire: { primary: emptyRoute('fire', 'primary', { x: 5, y: 5 }, [{ x: 5, y: 5 }, { x: 5, y: 6 }]), alternate: emptyRoute('fire', 'alternate', { x: 5, y: 5 }, [{ x: 5, y: 5 }, { x: 5, y: 6 }]) } },
      hazardId: 'fire',
      profile: P,
      seenCardIds: [],
    });
    assert(both.length === 2 && both[1].scenario === 'exit_blocked', '보조 경로 평가');
    const f01InAlt = both[1].passed.concat(both[1].failed).some((r) => r.ruleId === 'RULE-F-01');
    assert(!f01InAlt, 'F-01(①)이 보조 경로에서 평가됐다');
    const f05InPrimary = both[0].passed.concat(both[0].failed).some((r) => r.ruleId === 'RULE-F-05');
    assert(!f05InPrimary, 'F-05(②)가 주 경로에서 평가됐다');
  });

  check('RULE-C-03 — 문 없는 방을 고립으로 잡는다', () => {
    const plan = template('apt_2room');
    plan.blocks = plan.blocks.filter((b) => b.id !== 'o2');
    const rep = evaluate(RULES, ctxFor(plan, 'primary', P));
    const c03 = rep.failed.find((f) => f.ruleId === 'RULE-C-03');
    assert(Boolean(c03) && c03!.targets.blockIds?.includes('r2') === true && c03!.params.roomName.includes('안방'), 'C-03');
  });

  check('RULE-C-05 — 문 없는 벽을 지나면 잡고, 문을 지나면 통과', () => {
    const plan = template('apt_2room');
    assert(evaluate(RULES, ctxFor(plan, 'primary', P, [{ x: 4, y: 5 }, { x: 4, y: 6 }, { x: 4, y: 7 }])).failed.some((f) => f.ruleId === 'RULE-C-05'), 'C-05 통과');
    assert(!evaluate(RULES, ctxFor(plan, 'primary', P, [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 5, y: 7 }])).failed.some((f) => f.ruleId === 'RULE-C-05'), '문을 지났는데 위반');
  });

  check('RULE-F-02 — 비켜 갈 길이 없으면 지적 대신 주의로 (P3)', () => {
    const plan: FloorPlan = {
      ...emptyFloorPlan(),
      blocks: [
        { kind: 'room', id: 'a', layer: 'home', roomKind: 'living', rect: { x: 2, y: 2, w: 4, h: 3 }, label: '' },
        { kind: 'opening', id: 'd', layer: 'home', openingKind: 'front_door', cell: { x: 5, y: 3 }, side: 'E', closedByDefault: true },
        { kind: 'furniture', id: 'h', layer: 'home', subKind: 'gas_range', cell: { x: 5, y: 2 }, rotation: 0 },
        { kind: 'marker', id: 'm', layer: 'home', subKind: 'my_spot', cell: { x: 2, y: 3 }, rotation: 0 },
      ],
    };
    const rep = evaluate(RULES, ctxFor(plan, 'primary', P, [{ x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 }]));
    const f02 = rep.passed.find((r) => r.ruleId === 'RULE-F-02');
    assert(Boolean(f02) && f02!.params.unavoidable === '1', 'F-02 가 풀 수 없는 요구를 했다');
  });

  check('쉬움 수준은 tip 을 말하지 않는다', () => {
    const plan = template('apt_2room');
    plan.blocks = plan.blocks.filter((b) => b.id !== 's1');
    assert(!evaluate(RULES, ctxFor(plan, 'primary', { ...P, gradeMode: 'easy' })).failed.some((f) => f.ruleId === 'RULE-C-07'), '쉬움인데 tip');
    assert(evaluate(RULES, ctxFor(plan, 'primary', P)).failed.some((f) => f.ruleId === 'RULE-C-07'), '보통인데 tip 없음');
  });

  check('모든 시작 평면 × 주·보조 경로에 critical 을 다 푸는 길이 실제로 있다 (P3)', () => {
    for (const t of TEMPLATES) {
      for (const slot of ['primary', 'alternate'] as const) {
        const plan = template(t.id);
        const g = buildGraph(plan);
        const esc = findEscape(g, startNodeId(plan, g)!, routeKey('fire', slot), P, myCell(plan));
        assert(esc.found && esc.cells.length >= 2, `${t.id}/${slot}: 길 없음`);
        for (let i = 0; i + 1 < esc.cells.length; i += 1) assert(isAdjacent(esc.cells[i], esc.cells[i + 1]), `${t.id}/${slot}: 셀 ${i} 끊김`);
        const rep = evaluate(RULES, ctxFor(plan, slot, P, esc.cells));
        const crit = rep.failed.filter((f) => severityOf(RULES, f.ruleId) === 'critical').map((f) => f.ruleId);
        assert(crit.length === 0, `${t.id}/${slot}: critical ${crit.join(',')}`);
        if (slot === 'alternate' && t.id === 'apt_3room') {
          const f05 = rep.passed.find((r) => r.ruleId === 'RULE-F-05');
          assert(Boolean(f05) && f05!.params.facility === '대피공간', `F-05 ${f05?.params.facility}`);
        }
      }
    }
  });

  check('보조 경로가 없으면 RULE-F-04 가 잡히고 리포트의 고칠 점에 오른다', () => {
    const plan = template('house_1f');
    const reports = ruleReportsFor({ plan, routes: {}, hazardId: 'fire', profile: P, seenCardIds: [] });
    assert(reports[0].failed.some((f) => f.ruleId === 'RULE-F-04'), 'F-04 통과');
    const report = buildReport({ ruleReports: reports, playLog: failLog('trapped'), profile: P, attemptNo: 1, defs: RULES, messages: RULE_MESSAGES.rules, items: REPORT_ITEMS, isVerified, unguaranteed: true });
    assert(report.fix[0]?.id === 'RULE-F-04', `첫 고칠 점 ${report.fix[0]?.id}`);
  });

  /* ---------------------------------------------------------- 캐릭터 가이드 */

  check('"이제 뭘 해야 해?"는 모든 단계에서 답한다 (FR-9.7 · P3)', () => {
    for (const step of ALL_STEPS) {
      const r = selectGuide(GUIDE_RULES, { on: 'helpRequested', step }, {}, 0);
      assert(r !== null, `단계 ${step} 에 답이 없다`);
    }
    assert(selectGuide(GUIDE_RULES, { on: 'helpRequested' }, {}, 0) !== null, '단계 없는 도움 요청');
  });

  check('가이드 러너 — 쿨다운 안에는 같은 말을 안 하고, 할 말이 없으면 침묵한다 (FR-9.3 · FR-9.8)', () => {
    const rules: GuideRule[] = [
      { id: 'a', trigger: { on: 'gameEvent', event: 'x' }, priority: 1, speaker: 'ilgu', emotion: 'normal', text: { easy: 'a', normal: 'a' }, cooldown: 10, sourceIds: ['app-guide'] },
      { id: 'b', trigger: { on: 'gameEvent', event: 'x' }, priority: 5, speaker: 'ilgu', emotion: 'normal', text: { easy: 'b', normal: 'b' }, cooldown: 0, sourceIds: ['app-guide'] },
    ];
    const first = selectGuide(rules, { on: 'gameEvent', event: 'x' }, {}, 0);
    assert(first?.id === 'b', `우선순위 ${first?.id}`);
    const second = selectGuide(rules, { on: 'gameEvent', event: 'x' }, { b: 0 }, 1000);
    assert(second?.id === 'a', `한 번만 말하는 b 가 또 나왔다: ${second?.id}`);
    const third = selectGuide(rules, { on: 'gameEvent', event: 'x' }, { a: 1000, b: 0 }, 5000);
    assert(third === null, '쿨다운 안인데 말했다');
    const fourth = selectGuide(rules, { on: 'gameEvent', event: 'x' }, { a: 1000, b: 0 }, 12000);
    assert(fourth?.id === 'a', '쿨다운이 지났는데 침묵');
    assert(selectGuide(rules, { on: 'gameEvent', event: 'y' }, {}, 0) === null, '없는 사건에 말했다');
  });

  /* ---------------------------------------------------------- 말 */

  check('조사가 받침에 맞게 붙는다 — 화면에 "을(를)" 이 남지 않는다', () => {
    /* 받침 없음 → 를·가·는 */
    assert(eul('아파트') === '아파트를', eul('아파트'));
    assert(i('소화기') === '소화기가', i('소화기'));
    assert(eun('베란다') === '베란다는', eun('베란다'));
    /* 받침 있음 → 을·이·은 */
    assert(eul('현관문') === '현관문을', eul('현관문'));
    assert(i('창문') === '창문이', i('창문'));
    assert(eun('방문') === '방문은', eun('방문'));
    /* 여럿을 이어 붙이면 마지막 낱말을 본다 */
    assert(i('소화기 · 감지기') === '소화기 · 감지기가', i('소화기 · 감지기'));
    assert(i('감지기 · 현관문') === '감지기 · 현관문이', i('감지기 · 현관문'));
    /* 한글이 아닌 것으로 끝나면 받침 없는 쪽 */
    assert(eul('TV') === 'TV를', eul('TV'));
  });

  /* ---------------------------------------------------------- 위험장 */

  check('위험장 엔진에 재난 이름이 없다 (FR-8.16)', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/core/hazard/field.ts'), 'utf8');
    assert(!/'fire'|"fire"|smoke|화재|연기/.test(src), 'field.ts 에 재난 이름이 있다');
  });

  check('연기가 불보다 빠르고, 프리셋 값을 바꾸면 확산이 바뀐다', () => {
    assert(FIRE.secondarySpread > FIRE.primarySpread * 3, `${FIRE.secondarySpread} vs ${FIRE.primarySpread}`);
    const plan = template('apt_2room');
    const ctx = buildContext(plan, buildGraph(plan));
    const origin = { x: 3, y: 10 };
    const run = (preset: typeof FIRE, ticks: number) => {
      const field = simulateAhead(plan, ctx, preset, origin, ticks, fuelOf);
      const burning = field.filter((c) => c.state === 'active' || c.state === 'spent').length;
      const smoky = field.filter((c) => c.secondaryHigh > 0.05).length;
      return { burning, smoky };
    };
    const a = run(FIRE, 60);
    assert(a.smoky > a.burning, `연기 ${a.smoky} vs 불 ${a.burning}`);
    const fast = run({ ...FIRE, primarySpread: FIRE.primarySpread * 3 }, 60);
    assert(fast.burning > a.burning, `빠른 프리셋 ${fast.burning} vs ${a.burning}`);
  });

  check('닫힌 문은 확산을 크게 늦춘다 (FR-8.12)', () => {
    const plan = template('apt_2room');
    const g = buildGraph(plan);
    const ctx = buildContext(plan, g);
    const origin = { x: 3, y: 10 }; // 주방
    const probe = (doorsClosed: boolean) => {
      const field = createField(plan, ctx, fuelOf);
      ignite(field, ctx, origin);
      const doorState: Record<string, 'open' | 'closed'> = {};
      if (doorsClosed) for (const b of plan.blocks) if (b.kind === 'opening') doorState[b.id] = 'closed';
      const state = { tick: 0, config: { hazardId: 'fire' as const, seed: 0, timed: false, gradeMode: 'normal' as const }, preset: FIRE, field, doorState, doorHeat: {}, origin, player: { cell: origin, posture: 'stand' as const, facing: 'right' as const, exposure: 0, visionRadius: 8, stuckUntil: 0 }, status: 'ready' as const, events: [], log: emptyLog(0, origin) };
      for (let i = 0; i < 80; i += 1) spread(state, ctx);
      // 거실(r6) 안의 연기 합
      const cells = [];
      for (let y = 9; y < 13; y += 1) for (let x = 8; x < 13; x += 1) cells.push(field[y * plan.grid.width + x].secondaryHigh);
      return cells.reduce((s, v) => s + v, 0);
    };
    const open = probe(false);
    const closed = probe(true);
    assert(closed < open * 0.5, `닫힘 ${closed.toFixed(2)} vs 열림 ${open.toFixed(2)}`);
  });

  check('랜덤 발화 100회 × 시작 평면 전종 — 시작 즉시 생존 불가 판이 0건 (FR-8.7)', () => {
    for (const t of TEMPLATES) {
      const plan = template(t.id);
      const g = buildGraph(plan);
      const ctx = buildContext(plan, g);
      const start = myCell(plan);
      const goals = gameGoalCells(g, FIRE, P);
      assert(goals.length > 0, `${t.id}: 목표 칸 없음`);
      const base = createField(plan, ctx, fuelOf);
      const horizon = aheadTicks(base, ctx, start, goals, FIRE);
      assert(horizon >= 24, `${t.id}: 지평 ${horizon}`);
      let unguaranteed = 0;
      for (let seed = 0; seed < 100; seed += 1) {
        const pick = pickIgnition(plan, ctx, FIRE, P, seed, start, fuelOf);
        if (!pick.guaranteed) unguaranteed += 1;
        const field = simulateAhead(plan, ctx, FIRE, pick.cell, horizon, fuelOf);
        assert(hasSurvivablePath(field, ctx, start, goals, FIRE), `${t.id} seed ${seed}: 발화 ${pick.cell.x},${pick.cell.y} 에서 생존 불가`);
      }
      assert(unguaranteed === 0, `${t.id}: 보장 못 한 판 ${unguaranteed}건`);
    }
  });

  check('같은 seed 는 같은 판 (FR-8.15) · 난수는 결정론적', () => {
    const r1 = rng(42);
    const r2 = rng(42);
    for (let i = 0; i < 5; i += 1) assert(r1() === r2(), '난수 다름');
    const plan = template('apt_3room');
    const ctx = buildContext(plan, buildGraph(plan));
    const a = pickIgnition(plan, ctx, FIRE, P, 7, myCell(plan), fuelOf);
    const b = pickIgnition(plan, ctx, FIRE, P, 7, myCell(plan), fuelOf);
    assert(a.cell.x === b.cell.x && a.cell.y === b.cell.y, '같은 seed 인데 발화점이 다르다');
    const seeds = new Set<string>();
    for (let s = 0; s < 30; s += 1) {
      const p = pickIgnition(plan, ctx, FIRE, P, s, myCell(plan), fuelOf);
      seeds.add(`${p.cell.x},${p.cell.y}`);
    }
    assert(seeds.size >= 3, `발화점이 ${seeds.size}곳뿐 — 랜덤이 아니다`);
  });

  check('게임 — 연습 모드가 기본이고, 목표 칸에 서면 성공하며, 로그가 채워진다', () => {
    const plan = template('apt_2room');
    const g = buildGraph(plan);
    const game = startGame({ plan, graph: g, profile: P, config: { hazardId: 'fire', seed: 3, timed: false, gradeMode: 'normal' }, preset: FIRE, startCell: myCell(plan), fuelOf });
    assert(game.state.config.timed === false, '연습 모드');
    assert(game.state.status === 'running', '시작 상태');
    // 내 방(5,5) → 문(5,6) → 복도 → 현관 → 현관문(16,10)
    const path: [string, number][] = [['down', 2], ['right', 9], ['down', 3], ['right', 2]];
    let moved = 0;
    for (const [d, n] of path) {
      for (let i = 0; i < n; i += 1) {
        if (move(game.state, game.ctx, d as never)) moved += 1;
        tick(game);
        if (game.state.status !== 'running') break;
      }
      if (game.state.status !== 'running') break;
    }
    assert(moved >= 10, `이동 ${moved}칸`);
    assert(game.state.status === 'success', `상태 ${game.state.status} (${game.state.failReason ?? ''}) at ${game.state.player.cell.x},${game.state.player.cell.y}`);
    const log = finishGame(game, undefined, P);
    assert(log.outcome === 'success' && log.exitVia === VN.outdoor, `exitVia ${log.exitVia}`);
    assert(log.visited.length >= 11, `방문 ${log.visited.length}`);
  });

  check('게임 — 문을 닫고 자세를 낮추면 로그에 남고, 시간제한은 도전 모드에서만', () => {
    const plan = template('apt_2room');
    const g = buildGraph(plan);
    const game = startGame({ plan, graph: g, profile: P, config: { hazardId: 'fire', seed: 5, timed: true, gradeMode: 'normal' }, preset: FIRE, startCell: myCell(plan), fuelOf });
    move(game.state, game.ctx, 'down');
    move(game.state, game.ctx, 'down');
    assert(closeDoorBehind(game.state), '문을 못 닫았다');
    assert(game.state.log.events.closedDoorBehind === 1, '닫은 횟수');
    togglePosture(game.state);
    assert(game.state.player.posture === 'crouch', '자세');
    for (let i = 0; i < FIRE.timeLimitTicks + 5 && game.state.status === 'running'; i += 1) tick(game);
    assert(game.state.status === 'failed', `상태 ${game.state.status}`);
    assert(['timeout', 'exposure', 'trapped', 'flame'].includes(game.state.failReason ?? ''), `이유 ${game.state.failReason}`);
    const easyPreset = startGame({ plan, graph: g, profile: { ...P, gradeMode: 'easy' }, config: { hazardId: 'fire', seed: 5, timed: true, gradeMode: 'easy' }, preset: FIRE, startCell: myCell(plan), fuelOf });
    assert(easyPreset.state.preset.timeLimitTicks === Math.round(FIRE.timeLimitTicks * 1.5), '쉬움 제한 시간 1.5배');
    assert(easyPreset.state.preset.primarySpread < FIRE.primarySpread, '쉬움 확산 0.7배');
  });

  /* ---------------------------------------------------------- 리포트 */

  check('실패 유형 전부에서 잘한 점이 1개 이상, 고칠 점은 3개 이하 (FR-10.3 · FR-10.4)', () => {
    const plan = template('apt_2room');
    plan.blocks = plan.blocks.filter((b) => b.id !== 'o2' && b.id !== 's1');
    const reports = ruleReportsFor({ plan, routes: {}, hazardId: 'fire', profile: P, seenCardIds: [] });
    for (const reason of ALL_FAIL_REASONS) {
      const log = failLog(reason);
      log.events.usedElevator = true;
      log.events.openedHotDoor = true;
      log.events.stoodInHazard = 5;
      const r = buildReport({ ruleReports: reports, playLog: log, profile: P, attemptNo: 1, defs: RULES, messages: RULE_MESSAGES.rules, items: REPORT_ITEMS, isVerified });
      assert(r.good.length >= 1, `${reason}: 잘한 점 0개`);
      assert(r.fix.length <= 3, `${reason}: 고칠 점 ${r.fix.length}개`);
      assert(r.hiddenFixCount >= 1, `${reason}: 감춘 것이 없다`);
      for (let i = 0; i + 1 < r.fix.length; i += 1) assert(r.fix[i].weight >= r.fix[i + 1].weight, `${reason}: 정렬`);
      assert(r.good.every((i) => !i.headline.easy.includes('{')), '치환 안 된 자리');
    }
  });

  check('리포트 — 성공·문 닫기·낮은 자세는 잘한 점, 승강기·뜨거운 문은 고칠 점', () => {
    const plan = template('apt_2room');
    const reports = ruleReportsFor({ plan, routes: {}, hazardId: 'fire', profile: P, seenCardIds: [] });
    const log = emptyLog(1, { x: 3, y: 10 });
    log.outcome = 'success';
    log.events.closedDoorBehind = 2;
    log.events.crouchedInHazard = 9;
    log.events.stoodInHazard = 1;
    log.events.usedElevator = true;
    log.events.openedHotDoor = true;
    const r = buildReport({ ruleReports: reports, playLog: log, profile: P, attemptNo: 2, defs: RULES, messages: RULE_MESSAGES.rules, items: REPORT_ITEMS, isVerified });
    const goodIds = r.good.map((i) => i.id);
    assert(goodIds.includes('dyn.success') && goodIds.includes('dyn.closedDoor') && goodIds.includes('dyn.crouched'), goodIds.join(','));
    assert(r.good[0].id === 'dyn.success', `가장 큰 잘한 점 ${r.good[0].id}`);
    const fixIds = r.fix.map((i) => i.id);
    assert(fixIds.includes('dyn.usedElevator') && fixIds.includes('dyn.openedHotDoor'), fixIds.join(','));
    assert(!goodIds.includes('dyn.fallback.tried'), '폴백이 필요 없는데 들어갔다');
  });

  /* ---------------------------------------------------------- 저장 */

  check('저장 이행 — v1 파일의 다섯 키 경로가 주·보조 쌍으로 옮겨진다 (§7.4)', () => {
    const v1 = {
      schemaVersion: 1,
      createdAt: 'x',
      updatedAt: 'x',
      profile: { lowFloor: true, gradeMode: 'easy', blockStyle: 'kid', ttsEnabled: false },
      plan: template('apt_2room'),
      routes: {
        fire_exit_available: { disaster: 'fire', scenario: 'exit_available', startCell: { x: 5, y: 5 }, waypoints: [{ x: 5, y: 5 }, { x: 5, y: 6 }] },
        fire_exit_blocked: { disaster: 'fire', scenario: 'exit_blocked', startCell: { x: 5, y: 5 }, waypoints: [{ x: 5, y: 5 }, { x: 5, y: 6 }] },
        gas: { disaster: 'gas', startCell: { x: 5, y: 5 }, waypoints: [{ x: 5, y: 5 }, { x: 5, y: 6 }] },
      },
      progress: { completedSteps: ['a'], guardianMissions: [{ id: 'extinguisher', done: false }], simAttempts: 2, simCleared: false },
    };
    const f = parseSave(JSON.stringify(v1));
    assert(f.schemaVersion === 4, `판 ${f.schemaVersion}`);
    assert(f.routes.fire?.primary?.key === 'fire_exit_available', '주 경로 키');
    assert(f.routes.fire?.alternate?.key === 'fire_exit_blocked', '보조 경로 키');
    assert(f.routes.gas?.primary?.key === 'gas', '확장 경로');
    assert(f.profile.playerCharacter === 'boy_cap' && f.profile.lowFloor === true, '프로필');
    assert(f.progress.attempts === 0 && f.progress.guardianMissions.length === 1, '진행');
    assert(f.progress.earnedBadgeIds.length === 0 && f.progress.practiceWeekKeys.length === 0 && f.progress.practiceRecords.length === 0, 'v3 반복 연습 기본값');

    /* 3 → 4: 학교·반은 버리고 학년·이름·지도·진행은 그대로다 (설계서 v1.18 §4) */
    const v3 = {
      schemaVersion: 3,
      createdAt: 'x',
      updatedAt: 'x',
      profile: { ...defaultProfile(), schoolName: '부평초', schoolGrade: 5, className: '2반', studentName: '안전이', gradeMode: 'normal', soundOn: false },
      plan: template('apt_3room'),
      routes: {},
      progress: { ...emptyProgress(), attempts: 2, successes: 1, earnedBadgeIds: ['first-practice'], practiceWeekKeys: ['2026-09-01'] },
    };
    const g = parseSave(JSON.stringify(v3));
    assert(g.schemaVersion === 4, `v3 → ${g.schemaVersion}`);
    assert(!('schoolName' in g.profile) && !('className' in g.profile), '학교·반 키가 남아 있다');
    assert(g.profile.schoolGrade === 5 && g.profile.studentName === '안전이' && g.profile.gradeMode === 'normal' && g.profile.soundOn === false, '학년·이름·수준·소리가 보존되지 않았다');
    assert(g.plan.blocks.length === v3.plan.blocks.length && g.progress.attempts === 2 && g.progress.earnedBadgeIds[0] === 'first-practice', '지도·진행 기록이 보존되지 않았다');
    const h = parseSave(JSON.stringify({ ...v3, schemaVersion: 4, profile: { ...v3.profile, extraKey: 1 } }));
    assert(!('extraKey' in h.profile) && !('schoolName' in h.profile), 'v4 파일의 알 수 없는 프로필 키가 실려 다닌다');
  });

  /* ---------------------------------------------------------- 오프라인 꾸러미 */

  check('ZIP 쓰기·되읽기 — 한글 이름, 압축·저장 혼용, CRC 검사 (설계서 v1.18 §5.2)', () => {
    const text = Buffer.from('우리집 대피지도 '.repeat(2000), 'utf8');
    const binary = Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 7919) % 256));
    const entries = [
      { name: '우리집 대피지도/읽어주세요.txt', data: text },
      { name: '우리집 대피지도/voice/guide-step-edit-easy.mp3', data: binary, store: true },
      { name: '우리집 대피지도/home-escape-map.html', data: Buffer.from('<!doctype html><title>x</title>', 'utf8') },
    ];
    const zip = zipBuffer(entries);
    assert(zip.readUInt32LE(0) === 0x04034b50 && zip.readUInt32LE(zip.length - 22) === 0x06054b50, 'ZIP 서명이 없다');
    assert(zip.length < text.length, '글이 압축되지 않았다');
    const back = unzipBuffer(zip);
    assert(back.length === 3, `되읽은 항목이 ${back.length}개다`);
    for (const entry of entries) {
      const found = back.find((item) => item.name === entry.name);
      assert(found !== undefined, `항목이 없다: ${entry.name}`);
      assert(found!.data.equals(entry.data), `내용이 다르다: ${entry.name}`);
      assert(found!.method === (entry.store ? 0 : 8), `압축 방식이 다르다: ${entry.name}`);
    }
    const broken = Buffer.from(zip);
    broken[30 + Buffer.byteLength(entries[0].name) + 3] ^= 0xff;
    let threw = false;
    try {
      unzipBuffer(broken);
    } catch {
      threw = true;
    }
    assert(threw, '깨진 항목을 통과시킨다');
    let dup = false;
    try {
      zipBuffer([entries[0], entries[0]]);
    } catch {
      dup = true;
    }
    assert(dup, '겹친 이름을 받아들인다');
  });

  check('배포 산출물 이름은 영문이고 설치 파일은 같은 사이트의 download/ 아래를 가리킨다 (설계서 v1.18 §5.3)', () => {
    const names = desktopAssetNames('2.0.0');
    assert(names.setup === 'HomeEscapeMap-Setup-2.0.0.exe' && names.portable === 'HomeEscapeMap-Portable-2.0.0.exe', `이름이 다르다: ${JSON.stringify(names)}`);
    const paths = desktopDownloadPaths('/119-Map-Your-Evacuation-Route', '2.0.0');
    assert(paths.setup === '/119-Map-Your-Evacuation-Route/download/HomeEscapeMap-Setup-2.0.0.exe', `설치판 주소: ${paths.setup}`);
    assert(desktopDownloadPaths('', '2.0.0').portable === '/download/HomeEscapeMap-Portable-2.0.0.exe', '기준 경로가 없을 때의 주소가 다르다');
    assert(/^[\x20-\x7e]+$/.test(paths.setup + paths.portable), '주소에 영문 밖 글자가 섞였다');
    assert(humanBytes(20.3 * 1024 * 1024) === '20.3MB' && humanBytes(900 * 1024) === '900KB' && humanBytes(0) === '', '크기 표기가 다르다');

    const s = emptySave();
    s.plan = template('apt_2room');
    assert(parseSave(serializeSave(s)).plan.blocks.length === s.plan.blocks.length, '되읽기');
    let threw: unknown = null;
    try {
      parseSave(JSON.stringify({ ...s, schemaVersion: 99 }));
    } catch (e) {
      threw = e;
    }
    assert(threw instanceof SaveIncompatibleError && (threw as SaveIncompatibleError).rawText.includes('99'), '미래 판·원본 보존');
    let threw2: unknown = null;
    try {
      parseSave('not json');
    } catch (e) {
      threw2 = e;
    }
    assert(threw2 instanceof SaveIncompatibleError, '깨진 JSON');
  });

  check('자동 난이도는 성공 경험으로 천천히 오르고 최근 두 판이 어려우면 한 단계 내려간다 (v1.15 §3)', () => {
    const empty = emptyProgress();
    assert(recommendedDifficulty(empty) === 'guided', '첫 판이 차근차근이 아니다');
    const varied = { ...empty, attempts: 1, successes: 1 };
    assert(recommendedDifficulty(varied) === 'varied', '첫 성공 뒤 새로운 상황으로 가지 않는다');
    const challenge = { ...varied, attempts: 5, successes: 3, earnedBadgeIds: ['first-practice', 'first-escape', 'low-posture', 'door-check'] as SafetyBadgeId[] };
    assert(recommendedDifficulty(challenge) === 'challenge', '충분히 연습해도 안전 행동 도전으로 가지 않는다');
    const struggling = {
      ...challenge,
      practiceRecords: [
        { id: 'a', practicedAt: '2026-08-31T00:00:00.000Z', weekOf: '2026-08-31', difficulty: 'challenge' as const, outcome: 'fail' as const, missionIds: [], seed: 1 },
        { id: 'b', practicedAt: '2026-09-01T00:00:00.000Z', weekOf: '2026-08-31', difficulty: 'challenge' as const, outcome: 'fail' as const, missionIds: [], seed: 2 },
      ],
    };
    assert(recommendedDifficulty(struggling) === 'varied', '연속으로 어려워해도 한 단계 내려가지 않는다');

    const guidedPreset = effectivePreset(FIRE, 'normal', 'guided');
    const variedPreset = effectivePreset(FIRE, 'normal', 'varied');
    const challengePreset = effectivePreset(FIRE, 'normal', 'challenge');
    assert(guidedPreset.primarySpread < variedPreset.primarySpread && variedPreset.primarySpread < challengePreset.primarySpread, '단계별 확산이 오르지 않는다');
    assert(guidedPreset.visionBase > variedPreset.visionBase && variedPreset.visionBase > challengePreset.visionBase, '차근차근의 시야가 더 넓지 않다');
  });

  check('참 잘했어요 도장은 같은 주에 한 번만 찍고 4주 일정과 안전 배지를 채운다 (v1.15 §4·§5)', () => {
    const log = emptyLog(7, { x: 1, y: 1 });
    log.outcome = 'success';
    log.events.matchedDrawnRoute = 0.7;
    let progress = emptyProgress();
    const dates = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'];
    for (let index = 0; index < dates.length; index += 1) {
      const base = { ...progress, attempts: progress.attempts + 1, successes: progress.successes + 1 };
      const result = completePractice(base, {
        practicedAt: `${dates[index]}T09:00:00.000Z`, dateKey: dates[index], difficulty: index === 0 ? 'guided' : 'varied', outcome: 'success',
        missionIds: ['crouch', 'touch-door', 'close-door', 'reach-exit'], seed: index + 1, playLog: log,
      });
      assert(result.newStamp, `${index + 1}주 도장이 찍히지 않았다`);
      progress = result.progress;
    }
    const calendar = buildPracticeCalendar(progress.practiceWeekKeys, '2026-09-22');
    assert(calendar.completed && calendar.stampedCount === 4, `4주 일정 ${calendar.stampedCount}/4`);
    assert(progress.earnedBadgeIds.includes('four-week'), '네 주 약속 배지가 없다');
    for (const id of ['first-practice', 'first-escape', 'low-posture', 'door-check', 'door-close', 'route-follow', 'keep-going']) {
      assert(progress.earnedBadgeIds.includes(id as never), `${id} 배지가 없다`);
    }
    const sameWeek = completePractice({ ...progress, attempts: progress.attempts + 1 }, {
      practicedAt: '2026-09-24T09:00:00.000Z', dateKey: '2026-09-24', difficulty: 'challenge', outcome: 'success',
      missionIds: ['reach-exit'], seed: 99, playLog: log,
    });
    assert(!sameWeek.newStamp && sameWeek.progress.practiceWeekKeys.length === 4, '같은 주에 도장이 중복됐다');
    assert(new Set(sameWeek.progress.earnedBadgeIds).size === sameWeek.progress.earnedBadgeIds.length, '배지가 중복됐다');
  });

  check('최근 연습 기록은 오래 반복해도 40판까지만 저장한다 (v1.15 §6)', () => {
    const log = emptyLog(1, { x: 1, y: 1 });
    let progress = emptyProgress();
    for (let index = 0; index < 45; index += 1) {
      const base = { ...progress, attempts: progress.attempts + 1 };
      progress = completePractice(base, {
        practicedAt: `2026-09-${String((index % 28) + 1).padStart(2, '0')}T09:00:00.000Z`,
        dateKey: `2026-09-${String((index % 28) + 1).padStart(2, '0')}`,
        difficulty: 'guided', outcome: 'fail', missionIds: [], seed: index, playLog: log,
      }).progress;
    }
    assert(progress.practiceRecords.length === 40, `최근 기록 ${progress.practiceRecords.length}/40`);
    assert(progress.practiceRecords[0].seed === 5 && progress.practiceRecords[39].seed === 44, '오래된 기록을 앞에서 버리지 않았다');
  });

  /* ---------------------------------------------------------- 설계서 v1.2 */

  check('3D 주인공 열 명이 2D 캐릭터의 피부·머리·옷·소품을 그대로 쓴다 (설계서 v1.7 §1)', () => {
    assert(KIDS.length === 10, `캐릭터가 ${KIDS.length}명이다`);
    for (const k of KIDS) {
      const a = avatar3dIdentity(k.id);
      assert(a.id === k.id && a.style === k.style, `${k.id}: 머리 모양이 다르다`);
      assert(a.skin === k.skin && a.hair === k.hair, `${k.id}: 피부·머리 색이 다르다`);
      assert(a.top === k.top && a.bottom === k.bottom, `${k.id}: 옷 색이 다르다`);
      assert(Boolean(a.glasses) === Boolean(k.glasses) && a.accent === k.accent, `${k.id}: 소품이 다르다`);
    }
  });

  check('3D 주인공은 문보다 충분히 작고 머리가 큰 초등학생 체형과 낮은 눈높이를 쓴다 (v1.16)', () => {
    assert(CHILD_BODY_SCALE >= 0.78 && CHILD_BODY_SCALE <= 0.82, `전신 배율 ${CHILD_BODY_SCALE}`);
    assert(CHILD_HEAD_SCALE > 1 && CHILD_HEAD_SCALE <= 1.12, `머리 배율 ${CHILD_HEAD_SCALE}`);
    assert(CHILD_NAME_MARK_Y < 2.4, `이름표 높이 ${CHILD_NAME_MARK_Y}`);
    assert(CHILD_EYE_STAND >= 1.6 && CHILD_EYE_STAND <= 1.8, `선 눈높이 ${CHILD_EYE_STAND}`);
    assert(CHILD_EYE_CROUCH < 1 && CHILD_EYE_CROUCH < CHILD_EYE_STAND * 0.6, `낮춘 눈높이 ${CHILD_EYE_CROUCH}`);
  });

  check('3D 화질 세 단계는 해상도·그림자·장식을 함께 조절하고 한 단계씩만 낮춘다 (설계서 v1.10 §4)', () => {
    const ultra = settingsFor('ultra');
    const high = settingsFor('high');
    const low = settingsFor('low');
    assert(ultra.dpr[1] > high.dpr[1] && high.dpr[1] > low.dpr[1], '화질별 화면 배율 상한이 내려가지 않는다');
    assert(ultra.shadowMapSize > high.shadowMapSize && high.shadowMapSize > low.shadowMapSize, '그림자 해상도가 내려가지 않는다');
    assert(ultra.detail === 'full' && high.detail === 'standard' && low.detail === 'minimal', '장식 단계가 맞지 않는다');
    assert(ultra.textureSize > high.textureSize && high.textureSize > low.textureSize, '절차형 재질 크기가 내려가지 않는다');
    assert(ultra.dpr[1] >= 2.5 && ultra.textureSize >= 1024, '고급 화질이 v1.11 고해상도 기준에 못 미친다');
    assert(lowerQuality('ultra') === 'high' && lowerQuality('high') === 'low' && lowerQuality('low') === 'low', '자동 화질 하향 순서가 다르다');
  });

  check('닫힌 창은 확산을 늦추고, 열린 창은 돕는다 (설계서 v1.2 §2.2)', () => {
    const plan = template('apt_2room');
    const g = buildGraph(plan);
    const ctx = buildContext(plan, g);
    const origin = { x: 5, y: 10 }; // 부엌
    const probe = (windowsClosed: boolean): number => {
      const field = createField(plan, ctx, fuelOf);
      ignite(field, ctx, origin);
      const doorState: Record<string, 'open' | 'closed'> = {};
      for (const b of plan.blocks) {
        if (b.kind !== 'opening') continue;
        const glazed = b.openingKind === 'window' || b.openingKind === 'balcony_window';
        if (glazed ? windowsClosed : b.closedByDefault) doorState[b.id] = 'closed';
      }
      const state = {
        tick: 0,
        config: { hazardId: 'fire' as const, seed: 0, timed: false, gradeMode: 'normal' as const },
        preset: FIRE,
        field,
        doorState,
        doorHeat: {},
        origin,
        player: { cell: origin, posture: 'stand' as const, facing: 'right' as const, exposure: 0, visionRadius: 8, stuckUntil: 0 },
        status: 'ready' as const,
        events: [],
        log: emptyLog(0, origin),
      };
      for (let i = 0; i < 70; i += 1) spread(state, ctx);
      /* 발코니(창 너머)로 얼마나 넘어갔나 */
      let sum = 0;
      for (let y = 13; y < 15; y += 1) for (let x = 3; x < 13; x += 1) sum += field[y * plan.grid.width + x].secondaryHigh;
      return sum;
    };
    const closed = probe(true);
    const open = probe(false);
    assert(closed < open, `닫힘 ${closed.toFixed(2)} 이 열림 ${open.toFixed(2)} 보다 크다`);
  });

  check('방화문 닫힘이 방문 닫힘보다 더 막는다 (설계서 v1.2 §2.2)', () => {
    assert((FIRE.sealedClosedFactor ?? 1) < FIRE.doorClosedFactor, '방화문 계수가 방문보다 작지 않다');
    assert((FIRE.glazedClosedFactor ?? 1) < FIRE.doorClosedFactor, '닫힌 창 계수가 방문보다 작지 않다');
    assert((FIRE.openGlazedBoost ?? 1) > 1, '열린 창이 확산을 돕지 않는다');
  });

  check('필수 물건 목록이 blocks.json 과 어긋나지 않는다 (설계서 v1.2 §1.4)', () => {
    assert(REQUIRED_BLOCKS.length >= 4, `필수 ${REQUIRED_BLOCKS.length}종`);
    for (const id of REQUIRED_BLOCKS) {
      const def = BLOCKS.find((b) => b.id === id);
      assert(Boolean(def), `없는 블록이 필수다 — ${id}`);
      assert(def!.required === true, `${id} 의 required 가 꺼져 있다`);
    }
    /* 시작 평면은 필수를 웬만큼 갖추고 있어야 한다 — 아이가 처음부터 다 놓게 하지 않는다 */
    for (const t of TEMPLATES) {
      const gaps = missingOf(checklist(t.plan, REQUIRED_BLOCKS));
      assert(gaps.length <= 2, `${t.id}: 빠진 필수 ${gaps.join(', ')}`);
    }
  });

  check('밖으로 나가는 곳 세 갈래가 규칙으로 갈린다 (설계서 v1.2 §3.1)', () => {
    assert(RULES.some((r) => r.id === 'RULE-F-08'), '옥상 규칙이 없다');
    assert(RULES.some((r) => r.id === 'RULE-F-09'), '지하 규칙이 없다');
    assert(EXIT_KINDS.length === 3, `출구 ${EXIT_KINDS.length}종`);
    for (const k of EXIT_KINDS) assert(BLOCKS.some((b) => b.id === k), `팔레트에 ${k} 가 없다`);
  });

  check('리플레이 기록이 매 틱 쌓이고 저장 파일에는 들어가지 않는다 (설계서 v1.2 §8.5)', () => {
    const plan = template('apt_2room');
    const g = buildGraph(plan);
    const game = startGame({ plan, graph: g, profile: P, config: { hazardId: 'fire', seed: 3, timed: false, gradeMode: 'normal' }, preset: FIRE, startCell: myCell(plan), fuelOf });
    assert(game.frames.length === 1, `시작 컷 ${game.frames.length}`);
    for (let i = 0; i < 5; i += 1) gameTick(game);
    assert(game.frames.length === 6, `틱 뒤 ${game.frames.length} 컷`);
    const f = game.frames[3];
    assert(f.primary.length === plan.grid.width * plan.grid.height, '컷 크기');
    assert(f.tick === 3, `틱 번호 ${f.tick}`);
    /* 저장 파일 타입에 frames 가 없다 — 새로고침하면 리플레이는 사라진다 */
    const keys = Object.keys(game.state.log);
    assert(!keys.includes('frames'), '로그에 프레임이 섞였다');
  });
}
