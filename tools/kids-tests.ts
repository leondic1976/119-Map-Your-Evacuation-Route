/**
 * 어린이 화면(src/kids) 연산 검증 — tools/test.ts 가 부른다.
 *
 * plan2-1.md §6.7 의 정책 테스트와 §9.3 의 DoD 를 화면 없이 확인한다.
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
import type { Cell, FloorPlan, RouteSlot } from '../src/kids/types/plan';
import { EXIT_KINDS, SCENARIO_KEYS, emptyFloorPlan, emptyRoute, routeKey, scenarioKey, splitKey } from '../src/kids/types/plan';
import { DEFAULT_PASSABILITY, VN } from '../src/kids/types/graph';
import { defaultProfile, type UserProfile } from '../src/kids/types/save';
import type { PlayLog } from '../src/kids/types/report';
import type { GuideRule } from '../src/kids/types/guide';
import { buildGraph, goalNodeIds, startNodeId } from '../src/kids/core/graph/build';
import { findEscape, reachesGoal } from '../src/kids/core/graph/pathfind';
import { analyze } from '../src/kids/core/graph/analyze';
import { evaluate, severityOf } from '../src/kids/core/rules/engine';
import { EXTENSION_RULES, RULES } from '../src/kids/core/rules/definitions';
import { canPlaceRoom } from '../src/kids/core/grid/occupancy';
import { isAdjacent } from '../src/kids/core/grid/geometry';
import { doorCandidates } from '../src/kids/core/grid/doors';
import { buildContext } from '../src/kids/core/hazard/transfer';
import { createField, ignite, spread } from '../src/kids/core/hazard/field';
import { aheadTicks, gameGoalCells, hasSurvivablePath, pickIgnition, rng, simulateAhead } from '../src/kids/core/hazard/ignition';
import { finishGame, startGame, tick, tick as gameTick } from '../src/kids/core/game/loop';
import { closeDoorBehind, move, togglePosture } from '../src/kids/core/game/player';
import { emptyLog } from '../src/kids/core/game/playlog';
import { buildReport } from '../src/kids/core/report/build';
import { ALL_FAIL_REASONS } from '../src/kids/core/report/verdicts';
import { selectGuide } from '../src/kids/core/guide/runner';
import { BLOCKS, GUIDE_CARDS, GUIDE_RULES, HAZARD_PRESETS, PALETTE_BASIC, REPORT_ITEMS, REQUIRED_BLOCKS, RULE_MESSAGES, TEMPLATES, fuelOf, isVerified } from '../src/kids/content';
import { checklist, missingOf } from '../src/kids/core/checklist';
import { eul, eun, i } from '../src/kids/core/josa';
import { ALL_STEPS, validateContent, validatePlan } from '../src/kids/content/validate';
import { SaveIncompatibleError, parseSave } from '../src/kids/store/migrate';
import { emptySave, serializeSave } from '../src/kids/store/storage';
import { ruleReportsFor } from '../src/kids/store/kidsStore';

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

export function kidsTests(check: Check, assert: Assert): void {
  /* ---------------------------------------------------------- 콘텐츠 */

  check('[어린이] 콘텐츠 검증 — 개발 모드 오류 0건', () => {
    const r = validateContent(false);
    assert(r.errors.length === 0, r.errors.slice(0, 4).join(' | '));
  });

  check('[어린이] 콘텐츠 검증 — 배포 모드는 출처 미검수를 막는다 (P6)', () => {
    const r = validateContent(true);
    assert(r.errors.length > 0, '미검수 출처가 있는데 배포 모드가 통과했다');
    assert(r.errors.every((e) => e.includes('1차 대조') || e.includes('TODO-VERIFY')), `출처 말고 다른 오류: ${r.errors.find((e) => !e.includes('1차 대조'))}`);
  });

  check('[어린이] 콘텐츠 분량 — 카드 40장 이상, 대사 60건 이상, 판정 문장 11종 이상 (§6.6)', () => {
    assert(GUIDE_CARDS.length >= 40, `카드 ${GUIDE_CARDS.length}장`);
    assert(GUIDE_RULES.length >= 60, `대사 ${GUIDE_RULES.length}건`);
    assert(REPORT_ITEMS.length >= 11, `판정 문장 ${REPORT_ITEMS.length}종`);
    for (const c of GUIDE_CARDS) {
      assert(c.sourceIds.length > 0 && !c.sourceIds.includes('TODO-VERIFY'), `${c.id} 출처`);
    }
  });

  check('[어린이] 깨진 카드 링크 없음 (P3)', () => {
    const ids = new Set(GUIDE_CARDS.map((c) => c.id));
    for (const r of GUIDE_RULES) if (r.cardId) assert(ids.has(r.cardId), `${r.id} → ${r.cardId}`);
    for (const i of REPORT_ITEMS) if (i.cardId) assert(ids.has(i.cardId), `${i.id} → ${i.cardId}`);
    for (const id of Object.keys(RULE_MESSAGES.rules)) {
      const w = RULE_MESSAGES.rules[id].whyCardId;
      if (w) assert(ids.has(w), `${id} → ${w}`);
    }
  });

  check('[어린이] 팔레트 기본 8칸 (FR-7.8) · 기본판 규칙셋은 공통+화재', () => {
    assert(PALETTE_BASIC.length === 7, `기본 ${PALETTE_BASIC.length}종 + 더보기`);
    assert(RULES.every((r) => r.id.startsWith('RULE-C') || r.id.startsWith('RULE-F')), '기본판에 확장 규칙이 섞였다');
    assert(EXTENSION_RULES.every((r) => /^RULE-[EWG]/.test(r.id)), '확장 규칙 목록');
    assert(RULES.length === 17, `기본 규칙 ${RULES.length}개`);
  });

  /* ---------------------------------------------------------- 격자·그래프 */

  check('[어린이] 방은 겹치면 놓지 못하고 변을 맞대는 것은 된다 (FR-7.6)', () => {
    const plan = template('apt_2room');
    assert(!canPlaceRoom(plan, { x: 4, y: 4, w: 3, h: 3 }), '겹치는데 허용');
    assert(canPlaceRoom(plan, { x: 17, y: 3, w: 3, h: 3 }), '맞대는데 거부');
    assert(!canPlaceRoom(plan, { x: 0, y: 0, w: 1, h: 3 }), '2×2 보다 작은데 허용');
  });

  check('[어린이] 맞댄 벽에 문 후보가 생기고, 문이 있으면 사라진다 (FR-7.3)', () => {
    const plan: FloorPlan = {
      ...emptyFloorPlan(),
      blocks: [
        { kind: 'room', id: 'a', layer: 'home', roomKind: 'bedroom', rect: { x: 2, y: 2, w: 4, h: 4 }, label: '' },
        { kind: 'room', id: 'b', layer: 'home', roomKind: 'living', rect: { x: 6, y: 2, w: 4, h: 4 }, label: '' },
        { kind: 'room', id: 'c', layer: 'home', roomKind: 'bath', rect: { x: 12, y: 2, w: 3, h: 3 }, label: '' },
      ],
    };
    const cands = doorCandidates(plan);
    assert(cands.length === 1, `후보 ${cands.length}개`);
    assert(cands[0].side === 'E' && cands[0].cell.x === 5, `후보 자리 ${cands[0].cell.x},${cands[0].cell.y} ${cands[0].side}`);
    const withDoor: FloorPlan = { ...plan, blocks: plan.blocks.concat([{ kind: 'opening', id: 'd', layer: 'home', openingKind: 'door', cell: cands[0].cell, side: 'E', closedByDefault: true }]) };
    assert(doorCandidates(withDoor).length === 0, '문을 놓았는데 후보가 남았다');
  });

  check('[어린이] 시작 평면 8종이 모두 말이 되고 고립된 방이 없다 (설계서 v1.2 §1.2)', () => {
    assert(TEMPLATES.length === 8, `템플릿 ${TEMPLATES.length}종`);
    for (const t of TEMPLATES) {
      const errs = validatePlan(t.plan);
      assert(errs.length === 0, `${t.id}: ${errs.join(' | ')}`);
      const g = buildGraph(t.plan);
      assert(g.warnings.length === 0, `${t.id}: ${g.warnings.join(' | ')}`);
      assert(analyze(g, 'fire_exit_available', P).isolatedNodes.length === 0, `${t.id}: 고립`);
    }
  });

  check('[어린이] 통행 가능성 표 — 화재 ②에서 현관문은 막히고 경량칸막이는 열린다', () => {
    assert(DEFAULT_PASSABILITY.front_door.fire_exit_blocked === 'blocked', '현관문 ②');
    assert(DEFAULT_PASSABILITY.front_door.fire_exit_available === 'open', '현관문 ①');
    assert(DEFAULT_PASSABILITY.light_partition.fire_exit_blocked === 'open', '경량칸막이 ②');
    assert(DEFAULT_PASSABILITY.light_partition.fire_exit_available === 'blocked', '경량칸막이 ①');
    assert(DEFAULT_PASSABILITY.descent_device.fire_exit_blocked === 'conditional', '완강기는 조건부');
    assert(SCENARIO_KEYS.every((k) => DEFAULT_PASSABILITY.adjacent[k] === 'blocked'), '벽은 늘 막힌다');
  });

  check('[어린이] goalNodeIds — 키마다 다른 목표, 가상 노드는 셀이 없다', () => {
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

  check('[어린이] routeKey / scenarioKey — 주·보조가 고정된 키를 갖는다 (§3.2)', () => {
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

  check('[어린이] 규칙 평가 — ctx.scenario 가 undefined 로 가지 않는다 (§3.2 필수)', () => {
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

  check('[어린이] RULE-C-03 — 문 없는 방을 고립으로 잡는다', () => {
    const plan = template('apt_2room');
    plan.blocks = plan.blocks.filter((b) => b.id !== 'o2');
    const rep = evaluate(RULES, ctxFor(plan, 'primary', P));
    const c03 = rep.failed.find((f) => f.ruleId === 'RULE-C-03');
    assert(Boolean(c03) && c03!.targets.blockIds?.includes('r2') === true && c03!.params.roomName.includes('안방'), 'C-03');
  });

  check('[어린이] RULE-C-05 — 문 없는 벽을 지나면 잡고, 문을 지나면 통과', () => {
    const plan = template('apt_2room');
    assert(evaluate(RULES, ctxFor(plan, 'primary', P, [{ x: 4, y: 5 }, { x: 4, y: 6 }, { x: 4, y: 7 }])).failed.some((f) => f.ruleId === 'RULE-C-05'), 'C-05 통과');
    assert(!evaluate(RULES, ctxFor(plan, 'primary', P, [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 5, y: 7 }])).failed.some((f) => f.ruleId === 'RULE-C-05'), '문을 지났는데 위반');
  });

  check('[어린이] RULE-F-02 — 비켜 갈 길이 없으면 지적 대신 주의로 (P3)', () => {
    const plan: FloorPlan = {
      ...emptyFloorPlan(),
      blocks: [
        { kind: 'room', id: 'a', layer: 'home', roomKind: 'living', rect: { x: 2, y: 2, w: 4, h: 3 }, label: '' },
        { kind: 'opening', id: 'd', layer: 'home', openingKind: 'front_door', cell: { x: 5, y: 3 }, side: 'E', closedByDefault: true },
        { kind: 'hazard', id: 'h', layer: 'home', subKind: 'gas_range', cell: { x: 5, y: 2 }, rotation: 0 },
        { kind: 'marker', id: 'm', layer: 'home', subKind: 'my_spot', cell: { x: 2, y: 3 }, rotation: 0 },
      ],
    };
    const rep = evaluate(RULES, ctxFor(plan, 'primary', P, [{ x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 }]));
    const f02 = rep.passed.find((r) => r.ruleId === 'RULE-F-02');
    assert(Boolean(f02) && f02!.params.unavoidable === '1', 'F-02 가 풀 수 없는 요구를 했다');
  });

  check('[어린이] 쉬움 수준은 tip 을 말하지 않는다', () => {
    const plan = template('apt_2room');
    plan.blocks = plan.blocks.filter((b) => b.id !== 's1');
    assert(!evaluate(RULES, ctxFor(plan, 'primary', { ...P, gradeMode: 'easy' })).failed.some((f) => f.ruleId === 'RULE-C-07'), '쉬움인데 tip');
    assert(evaluate(RULES, ctxFor(plan, 'primary', P)).failed.some((f) => f.ruleId === 'RULE-C-07'), '보통인데 tip 없음');
  });

  check('[어린이] 모든 시작 평면 × 주·보조 경로에 critical 을 다 푸는 길이 실제로 있다 (P3)', () => {
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

  check('[어린이] 보조 경로가 없으면 RULE-F-04 가 잡히고 리포트의 고칠 점에 오른다', () => {
    const plan = template('house_1f');
    const reports = ruleReportsFor({ plan, routes: {}, hazardId: 'fire', profile: P, seenCardIds: [] });
    assert(reports[0].failed.some((f) => f.ruleId === 'RULE-F-04'), 'F-04 통과');
    const report = buildReport({ ruleReports: reports, playLog: failLog('trapped'), profile: P, attemptNo: 1, defs: RULES, messages: RULE_MESSAGES.rules, items: REPORT_ITEMS, isVerified, unguaranteed: true });
    assert(report.fix[0]?.id === 'RULE-F-04', `첫 고칠 점 ${report.fix[0]?.id}`);
  });

  /* ---------------------------------------------------------- 캐릭터 가이드 */

  check('[어린이] "이제 뭘 해야 해?"는 모든 단계에서 답한다 (FR-9.7 · P3)', () => {
    for (const step of ALL_STEPS) {
      const r = selectGuide(GUIDE_RULES, { on: 'helpRequested', step }, {}, 0);
      assert(r !== null, `단계 ${step} 에 답이 없다`);
    }
    assert(selectGuide(GUIDE_RULES, { on: 'helpRequested' }, {}, 0) !== null, '단계 없는 도움 요청');
  });

  check('[어린이] 가이드 러너 — 쿨다운 안에는 같은 말을 안 하고, 할 말이 없으면 침묵한다 (FR-9.3 · FR-9.8)', () => {
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

  check('[어린이] 조사가 받침에 맞게 붙는다 — 화면에 "을(를)" 이 남지 않는다', () => {
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

  check('[어린이] 위험장 엔진에 재난 이름이 없다 (FR-8.16)', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/kids/core/hazard/field.ts'), 'utf8');
    assert(!/'fire'|"fire"|smoke|화재|연기/.test(src), 'field.ts 에 재난 이름이 있다');
  });

  check('[어린이] 연기가 불보다 빠르고, 프리셋 값을 바꾸면 확산이 바뀐다', () => {
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

  check('[어린이] 닫힌 문은 확산을 크게 늦춘다 (FR-8.12)', () => {
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

  check('[어린이] 랜덤 발화 100회 × 시작 평면 전종 — 시작 즉시 생존 불가 판이 0건 (FR-8.7)', () => {
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

  check('[어린이] 같은 seed 는 같은 판 (FR-8.15) · 난수는 결정론적', () => {
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

  check('[어린이] 게임 — 연습 모드가 기본이고, 목표 칸에 서면 성공하며, 로그가 채워진다', () => {
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

  check('[어린이] 게임 — 문을 닫고 자세를 낮추면 로그에 남고, 시간제한은 도전 모드에서만', () => {
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

  check('[어린이] 실패 유형 전부에서 잘한 점이 1개 이상, 고칠 점은 3개 이하 (FR-10.3 · FR-10.4)', () => {
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

  check('[어린이] 리포트 — 성공·문 닫기·낮은 자세는 잘한 점, 승강기·뜨거운 문은 고칠 점', () => {
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

  check('[어린이] 저장 이행 — v1 파일의 다섯 키 경로가 주·보조 쌍으로 옮겨진다 (§7.4)', () => {
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
    assert(f.schemaVersion === 2, `판 ${f.schemaVersion}`);
    assert(f.routes.fire?.primary?.key === 'fire_exit_available', '주 경로 키');
    assert(f.routes.fire?.alternate?.key === 'fire_exit_blocked', '보조 경로 키');
    assert(f.routes.gas?.primary?.key === 'gas', '확장 경로');
    assert(f.profile.playerCharacter === 'boy_cap' && f.profile.lowFloor === true, '프로필');
    assert(f.progress.attempts === 0 && f.progress.guardianMissions.length === 1, '진행');

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

  /* ---------------------------------------------------------- 설계서 v1.2 */

  check('[어린이] 닫힌 창은 확산을 늦추고, 열린 창은 돕는다 (설계서 v1.2 §2.2)', () => {
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

  check('[어린이] 방화문 닫힘이 방문 닫힘보다 더 막는다 (설계서 v1.2 §2.2)', () => {
    assert((FIRE.sealedClosedFactor ?? 1) < FIRE.doorClosedFactor, '방화문 계수가 방문보다 작지 않다');
    assert((FIRE.glazedClosedFactor ?? 1) < FIRE.doorClosedFactor, '닫힌 창 계수가 방문보다 작지 않다');
    assert((FIRE.openGlazedBoost ?? 1) > 1, '열린 창이 확산을 돕지 않는다');
  });

  check('[어린이] 필수 물건 목록이 blocks.json 과 어긋나지 않는다 (설계서 v1.2 §1.4)', () => {
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

  check('[어린이] 밖으로 나가는 곳 세 갈래가 규칙으로 갈린다 (설계서 v1.2 §3.1)', () => {
    assert(RULES.some((r) => r.id === 'RULE-F-08'), '옥상 규칙이 없다');
    assert(RULES.some((r) => r.id === 'RULE-F-09'), '지하 규칙이 없다');
    assert(EXIT_KINDS.length === 3, `출구 ${EXIT_KINDS.length}종`);
    for (const k of EXIT_KINDS) assert(BLOCKS.some((b) => b.id === k), `팔레트에 ${k} 가 없다`);
  });

  check('[어린이] 리플레이 기록이 매 틱 쌓이고 저장 파일에는 들어가지 않는다 (설계서 v1.2 §8.5)', () => {
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
