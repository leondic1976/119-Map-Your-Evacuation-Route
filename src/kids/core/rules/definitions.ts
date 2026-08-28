/**
 * 규칙 정의 — plan2.md §5.3.2.
 *
 * 여기에는 판정 로직만 둔다. 문장은 content/ruleMessages.json 에서 ruleId 로 찾는다.
 *
 * 종점 판정의 단일 책임: 경로가 올바른 곳에서 끝났는지는 RULE-C-06 만 본다.
 * 재난별 규칙은 "무엇을 경유했는가"만 본다. 서로 반대 결론을 내면
 * 아이가 어떤 경로를 그려도 위반이 남아 막다른 골목에 빠진다(P3 위반).
 */
import type { Cell, PointBlock } from '../../types/plan';
import type { RuleContext, RuleDef } from '../../types/rules';
import { isOpening, isRoom, routeKey } from '../../types/plan';
import { analyze } from '../graph/analyze';
import { findEscape, openingsAlong, reachesGoal } from '../graph/pathfind';
import { goalNodeIds, openingBetween, roomLabel, startNodeId } from '../graph/build';
import { buildOccupancy, roomAt } from '../grid/occupancy';
import { cellKey, isAdjacent, sameCell, sideBetween } from '../grid/geometry';
import { fail, na, pass } from './engine';

/*
 * 출처 — 모두 1차 대조 전이다(sources.json 의 verified: false).
 * 배포 전 검증(validate strict)이 이것을 막는다.
 */
const SRC_COMMON = ['safekorea-fire'];
const SRC_FIRE = ['nfa-apt-fire', 'safekorea-fire'];
const SRC_REFUGE = ['local-apt-refuge', 'nfa-apt-fire'];
const SRC_QUAKE = ['safekorea-quake'];
const SRC_FLOOD = ['safekorea-flood'];
const SRC_GAS = ['safekorea-gas'];

/* ------------------------------------------------------------------ */
/* 작은 도우미                                                         */
/* ------------------------------------------------------------------ */

function points(ctx: RuleContext): PointBlock[] {
  return ctx.plan.blocks.filter((b): b is PointBlock => b.kind !== 'room' && b.kind !== 'opening');
}

function hasPoint(ctx: RuleContext, subKind: string): boolean {
  return points(ctx).some((p) => p.subKind === subKind);
}

function pointCells(ctx: RuleContext, subKinds: string[]): Cell[] {
  return points(ctx)
    .filter((p) => subKinds.includes(p.subKind))
    .map((p) => p.cell);
}

/** 그 셀이 목록의 어떤 셀과 붙어 있거나 같은가 */
function nearAny(c: Cell, list: Cell[]): boolean {
  return list.some((h) => sameCell(c, h) || isAdjacent(c, h));
}

function windowCells(ctx: RuleContext): Cell[] {
  return ctx.plan.blocks
    .filter(isOpening)
    .filter((o) => o.openingKind === 'window' || o.openingKind === 'balcony_window')
    .map((o) => o.cell);
}

function lastCell(ctx: RuleContext): Cell | null {
  const w = ctx.route?.waypoints ?? [];
  return w.length ? w[w.length - 1] : null;
}

/** 경로를 그리지 않았으면 평가할 수 없다 */
function needsRoute(ctx: RuleContext): boolean {
  return Boolean(ctx.route && ctx.route.waypoints.length >= 2);
}

/**
 * 위험원을 피해 갈 다른 길이 정말 있는가.
 * 없는데도 "피해 가라"고 말하면 아이는 풀 수 없는 요구를 받는다(P3 위반).
 */
function detourExists(ctx: RuleContext, hazardCells: Cell[]): boolean {
  const start = startNodeId(ctx.plan, ctx.graph);
  if (!start) return false;
  const esc = findEscape(ctx.graph, start, ctx.key, ctx.profile, ctx.route?.startCell);
  if (!esc.found) return false;
  return !esc.cells.some((c) => nearAny(c, hazardCells));
}

/** 승강기 앞 방의 셀 전부 */
function elevatorCells(ctx: RuleContext): Cell[] {
  return ctx.graph.nodes.filter((n) => n.kind === 'elevator').flatMap((n) => n.cells ?? []);
}

/* ------------------------------------------------------------------ */
/* 공통 — 전 재난                                                      */
/* ------------------------------------------------------------------ */

const ALL: RuleContext['disaster'][] = ['fire', 'earthquake', 'flood', 'gas'];

const C01: RuleDef = {
  id: 'RULE-C-01',
  title: '출발점 지정',
  disasters: ALL,
  severity: 'critical',
  sourceIds: SRC_COMMON,
  evaluate: (ctx) => {
    if (!ctx.route) return na('RULE-C-01');
    const room = roomAt(ctx.plan, ctx.route.startCell);
    return room
      ? pass('RULE-C-01', { roomName: roomLabel(room) })
      : fail('RULE-C-01', { cells: [ctx.route.startCell] });
  },
};

const C02: RuleDef = {
  id: 'RULE-C-02',
  title: '집 밖 만나는 곳 정하기',
  disasters: ALL,
  severity: 'important',
  sourceIds: SRC_COMMON,
  guardianMissionId: 'meeting_point',
  evaluate: (ctx) =>
    hasPoint(ctx, 'meeting_point') ? pass('RULE-C-02') : fail('RULE-C-02', { blockIds: [] }),
};

const C03: RuleDef = {
  id: 'RULE-C-03',
  title: '갇히는 방 없음',
  disasters: ALL,
  severity: 'critical',
  sourceIds: SRC_COMMON,
  evaluate: (ctx) => {
    if (ctx.plan.blocks.filter(isRoom).length < 2) return na('RULE-C-03');
    /*
     * 갇히는 방은 도면의 구조 문제다. 보조 경로 키(현관 막힘)로 보면
     * 현관 밖 복도·계단이 고립으로 잡히므로 늘 주 경로 키로 본다.
     */
    const a = analyze(ctx.graph, routeKey(ctx.disaster, 'primary'), ctx.profile);
    if (a.isolatedNodes.length === 0) return pass('RULE-C-03');
    const names = a.isolatedNodes.map((id) => ctx.graph.nodeById[id]?.label ?? '어떤 방').join(', ');
    return fail('RULE-C-03', { blockIds: a.isolatedNodes }, { roomName: names });
  },
};

const C04: RuleDef = {
  id: 'RULE-C-04',
  title: '길이 끊기지 않음',
  disasters: ALL,
  severity: 'critical',
  sourceIds: SRC_COMMON,
  evaluate: (ctx) => {
    if (!needsRoute(ctx)) return na('RULE-C-04');
    const w = ctx.route!.waypoints;
    for (let i = 0; i + 1 < w.length; i += 1) {
      if (!isAdjacent(w[i], w[i + 1])) return fail('RULE-C-04', { cells: [w[i], w[i + 1]] });
    }
    return pass('RULE-C-04');
  },
};

const C05: RuleDef = {
  id: 'RULE-C-05',
  title: '벽을 뚫고 가지 않음',
  disasters: ALL,
  severity: 'critical',
  sourceIds: SRC_COMMON,
  evaluate: (ctx) => {
    if (!needsRoute(ctx)) return na('RULE-C-05');
    const w = ctx.route!.waypoints;
    const occ = buildOccupancy(ctx.plan);
    for (let i = 0; i + 1 < w.length; i += 1) {
      const a = w[i];
      const b = w[i + 1];
      if (!isAdjacent(a, b)) continue;
      const ra = occ.get(cellKey(a));
      const rb = occ.get(cellKey(b));
      if (ra === rb) continue;
      const side = sideBetween(a, b);
      if (!side) continue;
      if (!openingBetween(ctx.plan, a, side)) return fail('RULE-C-05', { cells: [a, b] });
    }
    return pass('RULE-C-05');
  },
};

const C06: RuleDef = {
  id: 'RULE-C-06',
  title: '길이 안전한 곳에서 끝남',
  disasters: ALL,
  severity: 'critical',
  sourceIds: SRC_COMMON,
  evaluate: (ctx) => {
    if (!needsRoute(ctx)) return na('RULE-C-06');
    const last = lastCell(ctx);
    if (!last) return na('RULE-C-06');
    if (reachesGoal(ctx.graph, ctx.key, ctx.profile, last)) return pass('RULE-C-06');
    const goals = goalNodeIds(ctx.graph, ctx.key, ctx.profile);
    const goalCells = goals.flatMap((id) => ctx.graph.nodeById[id]?.cells ?? []);
    const anchors = ctx.graph.edges
      .filter((e) => (goals.includes(e.a) || goals.includes(e.b)) && e.passability[ctx.key] !== 'blocked')
      .map((e) => e.anchorCell)
      .filter((c): c is Cell => Boolean(c));
    return fail('RULE-C-06', { cells: [last, ...goalCells, ...anchors] });
  },
};

const C07: RuleDef = {
  id: 'RULE-C-07',
  title: '소화기 자리 알기',
  disasters: ALL,
  severity: 'tip',
  sourceIds: SRC_COMMON,
  guardianMissionId: 'extinguisher',
  evaluate: (ctx) => (hasPoint(ctx, 'extinguisher') ? pass('RULE-C-07') : fail('RULE-C-07')),
};

const C08: RuleDef = {
  id: 'RULE-C-08',
  title: '불 감지기 자리 알기',
  disasters: ALL,
  severity: 'tip',
  sourceIds: SRC_COMMON,
  guardianMissionId: 'detector',
  evaluate: (ctx) => (hasPoint(ctx, 'detector') ? pass('RULE-C-08') : fail('RULE-C-08')),
};

/* ------------------------------------------------------------------ */
/* 화재                                                                */
/* ------------------------------------------------------------------ */

const F01: RuleDef = {
  id: 'RULE-F-01',
  title: '현관문으로 나가기',
  disasters: ['fire'],
  scenarios: ['exit_available'],
  severity: 'important',
  sourceIds: SRC_FIRE,
  evaluate: (ctx) => {
    if (!needsRoute(ctx)) return na('RULE-F-01');
    const front = ctx.plan.blocks.filter(isOpening).filter((o) => o.openingKind === 'front_door');
    if (front.length === 0) return na('RULE-F-01');
    const used = openingsAlong(ctx.plan, ctx.route!.waypoints);
    return used.some((o) => o.openingKind === 'front_door')
      ? pass('RULE-F-01')
      : fail('RULE-F-01', { blockIds: front.map((o) => o.id), cells: front.map((o) => o.cell) });
  },
};

const F02: RuleDef = {
  id: 'RULE-F-02',
  title: '불붙기 쉬운 곳 비켜 가기',
  disasters: ['fire'],
  severity: 'important',
  sourceIds: SRC_FIRE,
  evaluate: (ctx) => {
    if (!needsRoute(ctx)) return na('RULE-F-02');
    const hazards = pointCells(ctx, ['gas_range', 'boiler']);
    if (hazards.length === 0) return na('RULE-F-02');
    const hit = ctx.route!.waypoints.filter((c) => nearAny(c, hazards));
    if (hit.length === 0) return pass('RULE-F-02');
    // 비켜 갈 길이 없으면 지적하지 않는다. 대신 주의 안내로 바꾼다
    if (!detourExists(ctx, hazards)) return pass('RULE-F-02', { unavoidable: '1' });
    return fail('RULE-F-02', { cells: hit });
  },
};

const F03: RuleDef = {
  id: 'RULE-F-03',
  title: '승강기 타지 않기',
  disasters: ['fire'],
  severity: 'critical',
  sourceIds: SRC_FIRE,
  evaluate: (ctx) => {
    if (!needsRoute(ctx)) return na('RULE-F-03');
    const ev = elevatorCells(ctx);
    if (ev.length === 0) return na('RULE-F-03');
    const hit = ctx.route!.waypoints.filter((c) => ev.some((e) => sameCell(c, e)));
    return hit.length === 0 ? pass('RULE-F-03') : fail('RULE-F-03', { cells: hit });
  },
};

const F04: RuleDef = {
  id: 'RULE-F-04',
  title: '또 다른 피난 길 갖추기',
  disasters: ['fire'],
  severity: 'important',
  sourceIds: SRC_REFUGE,
  guardianMissionId: 'secondary_escape',
  evaluate: (ctx) =>
    analyze(ctx.graph, ctx.key, ctx.profile).hasSecondaryEscape ? pass('RULE-F-04') : fail('RULE-F-04'),
};

const F05: RuleDef = {
  id: 'RULE-F-05',
  title: '못 나갈 때 쓸 곳 확인',
  disasters: ['fire'],
  scenarios: ['exit_blocked'],
  severity: 'important',
  sourceIds: SRC_REFUGE,
  evaluate: (ctx) => {
    if (!needsRoute(ctx)) return na('RULE-F-05');
    const last = lastCell(ctx);
    if (!last) return na('RULE-F-05');
    // 종점 유효성은 RULE-C-06 이 본다. 여기서는 무엇을 골랐는지만 확인한다
    const picked = points(ctx).find(
      (p) =>
        ['light_partition', 'refuge_area', 'descending_hatch', 'descent_device'].includes(p.subKind) &&
        sameCell(p.cell, last),
    );
    if (!picked) return fail('RULE-F-05', { cells: pointCells(ctx, ['light_partition', 'refuge_area', 'descending_hatch', 'descent_device']) });
    const name: Record<string, string> = {
      light_partition: '경량칸막이',
      refuge_area: '대피공간',
      descending_hatch: '하향식 피난구',
      descent_device: '완강기',
    };
    return pass('RULE-F-05', {
      facility: name[picked.subKind] ?? '피난설비',
      // 완강기는 아이 혼자 쓰지 않는다 — 문장에 이 값이 있으면 '어른과 함께'를 붙인다
      needsAdult: picked.subKind === 'descent_device' ? '1' : '',
    });
  },
};

const F06: RuleDef = {
  id: 'RULE-F-06',
  title: '너무 돌아가지 않기',
  disasters: ['fire'],
  severity: 'tip',
  sourceIds: SRC_FIRE,
  evaluate: (ctx) => {
    if (!needsRoute(ctx)) return na('RULE-F-06');
    const start = startNodeId(ctx.plan, ctx.graph);
    if (!start) return na('RULE-F-06');
    const esc = findEscape(ctx.graph, start, ctx.key, ctx.profile, ctx.route!.startCell);
    if (!esc.found || esc.cells.length === 0) return na('RULE-F-06');
    return ctx.route!.waypoints.length <= esc.cells.length * 1.5
      ? pass('RULE-F-06')
      : fail('RULE-F-06', { cells: esc.cells });
  },
};

const F07: RuleDef = {
  id: 'RULE-F-07',
  title: '발코니 알아 두기',
  disasters: ['fire'],
  scenarios: ['exit_blocked'],
  severity: 'tip',
  sourceIds: SRC_REFUGE,
  evaluate: (ctx) => {
    const balcony = ctx.plan.blocks.some((b) => isRoom(b) && b.roomKind === 'balcony');
    const gear = ['light_partition', 'refuge_area', 'descending_hatch'].some((k) => hasPoint(ctx, k));
    return balcony || gear ? pass('RULE-F-07') : fail('RULE-F-07');
  },
};

/**
 * 밖으로 나가는 곳 세 갈래 — 설계서 v1.2 §3.1.
 * 화재는 아래로 나가는 것이 원칙이다. 옥상은 아래가 막혔을 때만 옳고, 지하는 옳지 않다.
 */
const F08: RuleDef = {
  id: 'RULE-F-08',
  title: '평소에는 아래로 나가기',
  disasters: ['fire'],
  scenarios: ['exit_available'],
  severity: 'important',
  sourceIds: SRC_FIRE,
  evaluate: (ctx) => {
    if (!needsRoute(ctx)) return na('RULE-F-08');
    const roofs = pointCells(ctx, ['roof_exit']);
    if (roofs.length === 0) return na('RULE-F-08');
    const last = lastCell(ctx);
    if (!last) return na('RULE-F-08');
    return roofs.some((c) => sameCell(c, last)) ? fail('RULE-F-08', { cells: roofs }) : pass('RULE-F-08');
  },
};

const F09: RuleDef = {
  id: 'RULE-F-09',
  title: '지하로 내려가지 않기',
  disasters: ['fire'],
  severity: 'critical',
  sourceIds: SRC_FIRE,
  evaluate: (ctx) => {
    if (!needsRoute(ctx)) return na('RULE-F-09');
    const cellar = pointCells(ctx, ['basement_exit']);
    if (cellar.length === 0) return na('RULE-F-09');
    const hit = ctx.route!.waypoints.filter((c) => cellar.some((e) => sameCell(c, e)));
    return hit.length === 0 ? pass('RULE-F-09') : fail('RULE-F-09', { cells: hit });
  },
};

/* ------------------------------------------------------------------ */
/* 지진                                                                */
/* ------------------------------------------------------------------ */

const E01: RuleDef = {
  id: 'RULE-E-01',
  title: '먼저 숨을 곳 정하기',
  disasters: ['earthquake'],
  severity: 'critical',
  sourceIds: SRC_QUAKE,
  evaluate: (ctx) => {
    if (!ctx.route) return na('RULE-E-01');
    return ctx.route.primaryShelter ? pass('RULE-E-01') : fail('RULE-E-01');
  },
};

const E02: RuleDef = {
  id: 'RULE-E-02',
  title: '숨을 곳이 안전한가',
  disasters: ['earthquake'],
  severity: 'important',
  sourceIds: SRC_QUAKE,
  evaluate: (ctx) => {
    const s = ctx.route?.primaryShelter;
    if (!s) return na('RULE-E-02');
    const risky = pointCells(ctx, ['wardrobe', 'bookshelf', 'tv']);
    const glass = windowCells(ctx);
    return nearAny(s, risky) || nearAny(s, glass)
      ? fail('RULE-E-02', { cells: [s, ...risky, ...glass] })
      : pass('RULE-E-02');
  },
};

const E03: RuleDef = {
  id: 'RULE-E-03',
  title: '유리 옆을 오래 지나지 않기',
  disasters: ['earthquake'],
  severity: 'tip',
  sourceIds: SRC_QUAKE,
  evaluate: (ctx) => {
    if (!needsRoute(ctx)) return na('RULE-E-03');
    const glass = windowCells(ctx);
    if (glass.length === 0) return na('RULE-E-03');
    const w = ctx.route!.waypoints;
    const near = w.filter((c) => nearAny(c, glass));
    return near.length / w.length <= 0.4 ? pass('RULE-E-03') : fail('RULE-E-03', { cells: near });
  },
};

const E04: RuleDef = {
  id: 'RULE-E-04',
  title: '승강기 타지 않기',
  disasters: ['earthquake'],
  severity: 'critical',
  sourceIds: SRC_QUAKE,
  evaluate: (ctx) => {
    if (!needsRoute(ctx)) return na('RULE-E-04');
    const ev = elevatorCells(ctx);
    if (ev.length === 0) return na('RULE-E-04');
    const hit = ctx.route!.waypoints.filter((c) => ev.some((e) => sameCell(c, e)));
    return hit.length === 0 ? pass('RULE-E-04') : fail('RULE-E-04', { cells: hit });
  },
};

/* ------------------------------------------------------------------ */
/* 침수 — profile.lowFloor 에 따라 갈린다                              */
/* ------------------------------------------------------------------ */

const W01: RuleDef = {
  id: 'RULE-W-01',
  title: '위층으로 올라가기',
  disasters: ['flood'],
  severity: 'important',
  sourceIds: SRC_FLOOD,
  evaluate: (ctx) => {
    if (!ctx.profile.lowFloor) return na('RULE-W-01');
    if (!needsRoute(ctx)) return na('RULE-W-01');
    const stairs = ctx.graph.nodes.filter((n) => n.kind === 'stair').flatMap((n) => n.cells ?? []);
    if (stairs.length === 0) return na('RULE-W-01');
    const used = ctx.route!.waypoints.some((c) => stairs.some((s) => sameCell(c, s)));
    return used ? pass('RULE-W-01') : fail('RULE-W-01', { cells: stairs });
  },
};

const W02: RuleDef = {
  id: 'RULE-W-02',
  title: '물이 차기 전에 움직이기',
  disasters: ['flood'],
  severity: 'important',
  sourceIds: SRC_FLOOD,
  evaluate: (ctx) => {
    if (!ctx.profile.lowFloor) return na('RULE-W-02');
    return ctx.seenCardIds.includes('flood.early_move') ? pass('RULE-W-02') : fail('RULE-W-02');
  },
};

const W03: RuleDef = {
  id: 'RULE-W-03',
  title: '물과 전기 조심하기',
  disasters: ['flood'],
  severity: 'tip',
  sourceIds: SRC_FLOOD,
  evaluate: (ctx) => {
    if (!hasPoint(ctx, 'power_strip')) return na('RULE-W-03');
    return ctx.seenCardIds.includes('flood.electric') ? pass('RULE-W-03') : fail('RULE-W-03');
  },
};

/* ------------------------------------------------------------------ */
/* 가스                                                                */
/* ------------------------------------------------------------------ */

const G01: RuleDef = {
  id: 'RULE-G-01',
  title: '가스 중간밸브 표시',
  disasters: ['gas'],
  severity: 'important',
  sourceIds: SRC_GAS,
  guardianMissionId: 'gas_valve',
  evaluate: (ctx) => (hasPoint(ctx, 'gas_valve') ? pass('RULE-G-01') : fail('RULE-G-01')),
};

const G02: RuleDef = {
  id: 'RULE-G-02',
  title: '주방에 창문 표시',
  disasters: ['gas'],
  severity: 'important',
  sourceIds: SRC_GAS,
  evaluate: (ctx) => {
    const kitchen = ctx.plan.blocks.find((b) => isRoom(b) && b.roomKind === 'kitchen');
    if (!kitchen || !isRoom(kitchen)) return na('RULE-G-02');
    const node = ctx.graph.nodeById[kitchen.id];
    return node?.hasWindow ? pass('RULE-G-02') : fail('RULE-G-02', { blockIds: [kitchen.id] });
  },
};

const G03: RuleDef = {
  id: 'RULE-G-03',
  title: '가스레인지 옆 지나지 않기',
  disasters: ['gas'],
  severity: 'important',
  sourceIds: SRC_GAS,
  evaluate: (ctx) => {
    if (!needsRoute(ctx)) return na('RULE-G-03');
    const ranges = pointCells(ctx, ['gas_range']);
    if (ranges.length === 0) return na('RULE-G-03');
    const hit = ctx.route!.waypoints.filter((c) => nearAny(c, ranges));
    if (hit.length === 0) return pass('RULE-G-03');
    if (!detourExists(ctx, ranges)) return pass('RULE-G-03', { unavoidable: '1' });
    return fail('RULE-G-03', { cells: hit });
  },
};

const G04: RuleDef = {
  id: 'RULE-G-04',
  title: '스위치·환풍기 건드리지 않기',
  disasters: ['gas'],
  severity: 'critical',
  sourceIds: SRC_GAS,
  evaluate: (ctx) => (ctx.seenCardIds.includes('gas.no_switch') ? pass('RULE-G-04') : fail('RULE-G-04')),
};

/* ------------------------------------------------------------------ */

/** 기본판 규칙셋 — 공통 + 화재 (plan2-1.md §6.1b) */
export const RULES: RuleDef[] = [C01, C02, C03, C04, C05, C06, C07, C08, F01, F02, F03, F04, F05, F06, F07, F08, F09];

/**
 * 확장판 규칙 — 지진(E3)·침수(E2)·가스(E1)로 이월.
 * 기본판 규칙셋에는 넣지 않는다. 프리셋이 추가될 때 RULES 에 합친다.
 */
export const EXTENSION_RULES: RuleDef[] = [E01, E02, E03, E04, W01, W02, W03, G01, G02, G03, G04];

/** 보호자 미션으로 돌려주는 규칙들 — 못 채워도 진행을 막지 않는다 (P3) */
export const GUARDIAN_RULES = RULES.filter((r) => r.guardianMissionId);

