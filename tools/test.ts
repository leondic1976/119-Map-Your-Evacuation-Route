/**
 * 연산 로직 검증.
 *
 * 화면 없이 순수 계층(lib/*)만 실행해 면적 정확도·동선 생성·확산 속도·
 * 문 폐쇄 효과·훈련 진행·도면 인식을 확인한다.
 *
 *   npm test
 */
import {
  FACILITY_LABEL,
  Plan,
  PlanTypeKey,
  ROOM_KIND_LABEL,
  Room,
  emptyPlan,
  planArea,
  planBounds,
  polylineLength,
  roomCenter,
} from '../src/lib/types';
import { TEMPLATES, buildFromTemplate, builtArea, getTemplate } from '../src/lib/templates';
import { EXT_WALL, INT_WALL, buildWalls, inWall } from '../src/lib/walls';
import { Grid, buildGrid, cellAt, cellCenter, connected, nearestWalkable, walkableArea } from '../src/lib/grid';
import {
  distanceField,
  exitNear,
  exitPoints,
  generateRoutes,
  orthogonalize,
  roomContaining,
  roomsMissingRoute,
  routableRooms,
  routeMetric,
  rset,
} from '../src/lib/routing';
import {
  BLOCK_LEVEL,
  DENSITY_RAMP,
  DOOR_DELAY_SMOKE,
  FIRE_CAUSES,
  areaCurve,
  blockTime,
  blockedArea,
  densityAt,
  reachedArea,
  routeASET,
  safetyMargin,
  sampleRoute,
  simulate,
} from '../src/lib/firesim';
import { ACTIONS, applyAction, availableActions, evaluate, startScenario } from '../src/lib/scenario';
import { otsu, scaleFromArea, scaleFromMeasure, trace } from '../src/lib/autotrace';
import { diagnose, eraFor, HAZARDS, PROCEDURE } from '../src/lib/risk';
import { migrate, parsePlan, serialize } from '../src/lib/storage';
import { kidsTests } from './kids-tests';
import {
  interpretStroke,
  looksClosed,
  polygonToRects,
  simplify,
  splitRoom,
  straighten,
  straightenLoop,
} from '../src/lib/sketch';
import { AppStore, HISTORY_LIMIT, STEPS, TOOLS, addRoom, removeSelection, stepDone } from '../src/lib/store';
import { COACH_TARGETS, manualSections, tutorialFor } from '../src/lib/tutorial';
import { assistFor, progress } from '../src/lib/assist';
import { FACILITY_CAPTION, FACILITY_EASY, FACILITY_WHY, ROOM_EASY, STEP_EASY } from '../src/lib/words';

/* ------------------------------------------------------------------ */
/* 아주 작은 검증 틀                                                    */
/* ------------------------------------------------------------------ */

let passed = 0;
const failures: string[] = [];
let group = '';

function section(name: string): void {
  group = name;
  process.stdout.write(`\n  ${name}\n`);
}

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    process.stdout.write(`    OK  ${name}\n`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`[${group}] ${name}\n        ${msg}`);
    process.stdout.write(`    X   ${name}  — ${msg}\n`);
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function near(actual: number, expected: number, tolerance: number, msg: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg} (기대 ${expected}±${tolerance}, 실제 ${actual})`);
  }
}

/* ------------------------------------------------------------------ */
/* 1. 표준 평면 · 면적                                                  */
/* ------------------------------------------------------------------ */

section('표준 평면 · 축척');

check('표준 평면 4종이 등록되어 있다', () => {
  assert(TEMPLATES.length === 4, `평면 수 ${TEMPLATES.length}`);
  const keys = TEMPLATES.map((t) => t.key).sort().join(',');
  assert(keys === 'bay3,bay4,small,tower', keys);
});

check('각 평면의 실이 서로 겹치지 않는다', () => {
  for (const t of TEMPLATES) {
    for (let i = 0; i < t.rooms.length; i += 1) {
      for (let j = i + 1; j < t.rooms.length; j += 1) {
        const a = t.rooms[i];
        const b = t.rooms[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        assert(ox <= 0 || oy <= 0, `${t.key}: ${a.name} 과 ${b.name} 이 겹친다`);
      }
    }
  }
});

check('각 평면이 빈틈 없이 채워진다', () => {
  for (const t of TEMPLATES) {
    const x1 = Math.max(...t.rooms.map((r) => r.x + r.w));
    const y1 = Math.max(...t.rooms.map((r) => r.y + r.h));
    const x0 = Math.min(...t.rooms.map((r) => r.x));
    const y0 = Math.min(...t.rooms.map((r) => r.y));
    let holes = 0;
    for (let y = y0 + 5; y < y1; y += 20) {
      for (let x = x0 + 5; x < x1; x += 20) {
        const hit = t.rooms.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
        if (!hit) holes += 1;
      }
    }
    assert(holes === 0, `${t.key}: 빈 지점 ${holes}곳`);
  }
});

check('전용면적 축척 오차가 2% 이내다', () => {
  const targets = [39, 59, 74, 84, 101, 114, 134];
  for (const t of TEMPLATES) {
    for (const target of targets) {
      const plan = buildFromTemplate(t.key, target);
      const got = builtArea(plan);
      const err = Math.abs(got - target) / target;
      assert(err <= 0.02, `${t.key} ${target}㎡ → ${got.toFixed(2)}㎡ (오차 ${(err * 100).toFixed(2)}%)`);
    }
  }
});

check('축척해도 실 사이 빈틈이 생기지 않는다', () => {
  const plan = buildFromTemplate('bay3', 101);
  const xs = new Set<number>();
  plan.rooms.forEach((r) => {
    xs.add(r.x);
    xs.add(r.x + r.w);
  });
  // 인접 실의 경계 좌표가 정확히 일치해야 한다
  const sorted = Array.from(xs).sort((a, b) => a - b);
  for (const r of plan.rooms) {
    assert(sorted.includes(r.x) && sorted.includes(r.x + r.w), '경계 좌표 불일치');
  }
  const area = builtArea(plan);
  near(area, 101, 2, '축척 후 면적');
});

check('실 이름·용도가 모두 채워져 있다', () => {
  for (const t of TEMPLATES) {
    for (const r of t.rooms) {
      assert(r.name.length > 0, `${t.key} 이름 없음`);
      assert(Boolean(ROOM_KIND_LABEL[r.kind]), `${t.key} 알 수 없는 용도 ${r.kind}`);
    }
  }
});

check('모든 평면에 현관문이 하나 이상 있다', () => {
  for (const t of TEMPLATES) {
    const plan = buildFromTemplate(t.key, t.defaultArea);
    assert(plan.doors.some((d) => d.kind === 'entrance'), `${t.key} 현관문 없음`);
  }
});

/* ------------------------------------------------------------------ */
/* 2. 벽체                                                              */
/* ------------------------------------------------------------------ */

section('벽체 생성');

const bay3 = buildFromTemplate('bay3', 84);
const bay3Walls = buildWalls(bay3);

check('벽체가 생성된다', () => {
  assert(bay3Walls.walls.length > 20, `벽 조각 ${bay3Walls.walls.length}`);
});

check('외벽 200mm · 내벽 110mm 두께가 부여된다', () => {
  const ext = bay3Walls.walls.filter((w) => w.kind === 'ext');
  const int = bay3Walls.walls.filter((w) => w.kind === 'int');
  assert(ext.length > 0 && int.length > 0, '외벽/내벽 구분 없음');
  for (const w of ext) {
    const t = w.dir === 'v' ? w.w : w.h;
    near(t, EXT_WALL, 0.01, '외벽 두께');
  }
  for (const w of int) {
    const t = w.dir === 'v' ? w.w : w.h;
    near(t, INT_WALL, 0.01, '내벽 두께');
  }
});

check('개구부 자리에는 벽이 없다', () => {
  for (const d of bay3.doors) {
    assert(!inWall(bay3Walls.walls, d.x, d.y), `문 ${d.kind} 자리에 벽이 남아 있다`);
  }
  for (const w of bay3.windows) {
    assert(!inWall(bay3Walls.walls, w.x, w.y), '창 자리에 벽이 남아 있다');
  }
});

check('문 회전반경이 열리는 쪽 실 깊이를 넘지 않는다', () => {
  for (const g of bay3Walls.doors) {
    if (!g.arc) continue;
    const d = g.door;
    const probe =
      d.dir === 'h'
        ? { x: d.x, y: d.y + d.swing * (g.radius + 4) }
        : { x: d.x + d.swing * (g.radius + 4), y: d.y };
    const inside = bay3.rooms.some(
      (r) => probe.x >= r.x - 1 && probe.x <= r.x + r.w + 1 && probe.y >= r.y - 1 && probe.y <= r.y + r.h + 1,
    );
    assert(inside, `회전반경 ${g.radius}cm 가 실 밖으로 나간다`);
  }
});

check('개구부마다 문틀 두 개가 생긴다', () => {
  for (const g of bay3Walls.doors) {
    assert(g.jambs.length === 2, `문틀 ${g.jambs.length}개`);
  }
});

check('모든 표준 평면에서 벽 생성이 실패하지 않는다', () => {
  for (const t of TEMPLATES) {
    const p = buildFromTemplate(t.key, t.defaultArea);
    const m = buildWalls(p);
    assert(m.walls.length > 10, `${t.key} 벽 ${m.walls.length}조각`);
    assert(m.doors.length === p.doors.length, `${t.key} 문 기하 누락`);
  }
});

/* ------------------------------------------------------------------ */
/* 3. 격자                                                              */
/* ------------------------------------------------------------------ */

section('통행 격자');

const bay3Grid = buildGrid(bay3, 10, bay3Walls);

check('통행 면적이 전용면적의 60% 이상이다', () => {
  const wa = walkableArea(bay3Grid);
  const total = planArea(bay3);
  assert(wa > total * 0.6, `통행 ${wa.toFixed(1)}㎡ / 전용 ${total.toFixed(1)}㎡`);
});

check('모든 실에 통행 가능한 셀이 있다', () => {
  for (const r of bay3.rooms) {
    const c = roomCenter(r);
    const i = nearestWalkable(bay3Grid, c.x, c.y, 6);
    assert(i >= 0, `${r.name} 에 통행 셀이 없다`);
  }
});

check('모든 실이 현관문과 연결된다', () => {
  const exits = exitPoints(bay3, bay3Grid);
  const ent = exits.find((e) => e.kind === 'entrance');
  assert(Boolean(ent), '현관 종점을 찾지 못했다');
  for (const r of bay3.rooms) {
    const c = roomCenter(r);
    const cell = nearestWalkable(bay3Grid, c.x, c.y);
    assert(cell >= 0, `${r.name} 셀 없음`);
    assert(connected(bay3Grid, cell, ent!.cell), `${r.name} 이 현관과 이어지지 않는다`);
  }
});

check('벽 안쪽은 통행 불가로 표시된다', () => {
  let blocked = 0;
  for (const w of bay3Walls.walls) {
    const cx = w.x + w.w / 2;
    const cy = w.y + w.h / 2;
    const i = cellAt(bay3Grid, cx, cy);
    if (i >= 0 && bay3Grid.walk[i] === 0) blocked += 1;
  }
  assert(blocked > bay3Walls.walls.length * 0.8, `벽 중심 차단 ${blocked}/${bay3Walls.walls.length}`);
});

check('개구부 셀이 문 인덱스로 표시된다', () => {
  let marked = 0;
  for (let i = 0; i < bay3Grid.door.length; i += 1) if (bay3Grid.door[i] >= 0) marked += 1;
  assert(marked > bay3.doors.length, `표시된 개구부 셀 ${marked}`);
});

check('격자 좌표 변환이 왕복한다', () => {
  for (let i = 0; i < bay3Grid.walk.length; i += 997) {
    const p = cellCenter(bay3Grid, i);
    assert(cellAt(bay3Grid, p.x, p.y) === i, `왕복 실패 ${i}`);
  }
});

/* ------------------------------------------------------------------ */
/* 4. 피난동선                                                          */
/* ------------------------------------------------------------------ */

section('피난동선');

const primary = generateRoutes(bay3, bay3Grid, { target: 'entrance' });

check('주요 실마다 주 동선이 생성된다', () => {
  const rooms = bay3.rooms.filter((r) => r.kind === 'room' || r.kind === 'living' || r.kind === 'kitchen');
  assert(primary.length === rooms.length, `동선 ${primary.length} / 실 ${rooms.length}`);
});

check('동선은 모두 직각 구간으로만 이루어진다', () => {
  for (const r of primary) {
    for (let i = 1; i < r.points.length; i += 1) {
      const a = r.points[i - 1];
      const b = r.points[i];
      assert(a.x === b.x || a.y === b.y, `${r.label}: 사선 구간 (${a.x},${a.y})→(${b.x},${b.y})`);
    }
  }
});

check('동선이 벽을 통과하지 않는다', () => {
  for (const r of primary) {
    for (let i = 1; i < r.points.length; i += 1) {
      const a = r.points[i - 1];
      const b = r.points[i];
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5);
      for (let k = 1; k < steps; k += 1) {
        const t = k / steps;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const cell = cellAt(bay3Grid, x, y);
        assert(cell >= 0 && bay3Grid.walk[cell] === 1, `${r.label}: (${Math.round(x)},${Math.round(y)}) 이 벽 안이다`);
      }
    }
  }
});

check('동선 종점이 현관문이다', () => {
  const ent = bay3.doors.find((d) => d.kind === 'entrance')!;
  for (const r of primary) {
    const last = r.points[r.points.length - 1];
    const d = Math.hypot(last.x - ent.x, last.y - ent.y);
    assert(d < 40, `${r.label}: 종점이 현관에서 ${Math.round(d)}cm 떨어져 있다`);
    assert(r.endpoint === 'entrance', `${r.label}: 종점 종류 ${r.endpoint}`);
  }
});

check('동선 길이가 직선거리 이상 · 3배 이하다', () => {
  const ent = bay3.doors.find((d) => d.kind === 'entrance')!;
  for (const r of primary) {
    const room = bay3.rooms.find((x) => x.id === r.fromRoom)!;
    const c = roomCenter(room);
    const straight = Math.hypot(c.x - ent.x, c.y - ent.y);
    const len = polylineLength(r.points);
    assert(len >= straight * 0.9, `${r.label}: ${len.toFixed(0)} < 직선 ${straight.toFixed(0)}`);
    assert(len <= straight * 3, `${r.label}: ${len.toFixed(0)} > 직선 3배`);
  }
});

check('꺾임 수가 과도하지 않다', () => {
  for (const r of primary) {
    const m = routeMetric(r, 'adult');
    assert(m.turns <= 6, `${r.label}: 꺾임 ${m.turns}회`);
  }
});

check('보행 기준별 소요시간이 성인 < 어린이 < 고령자 순이다', () => {
  const r = primary[0];
  const a = routeMetric(r, 'adult').walkTime;
  const c = routeMetric(r, 'child').walkTime;
  const s = routeMetric(r, 'senior').walkTime;
  assert(a < c && c < s, `성인 ${a.toFixed(1)} / 어린이 ${c.toFixed(1)} / 고령자 ${s.toFixed(1)}`);
});

check('RSET 은 인지 10초를 포함한다', () => {
  const r = primary[0];
  near(rset(r, 'adult') - routeMetric(r, 'adult').walkTime, 10, 0.001, '인지 시간');
});

check('대체 동선이 피난설비를 종점으로 생성된다', () => {
  const alt = generateRoutes(bay3, bay3Grid, { target: 'facility' });
  assert(alt.length > 0, '대체 동선이 생성되지 않았다');
  for (const r of alt) {
    assert(r.kind === 'alt', `종류 ${r.kind}`);
    assert(r.endpoint !== 'entrance', `종점 ${r.endpoint}`);
  }
});

check('모든 표준 평면에서 동선이 생성된다', () => {
  for (const t of TEMPLATES) {
    const p = buildFromTemplate(t.key, t.defaultArea);
    const g = buildGrid(p);
    const rs = generateRoutes(p, g, { target: 'entrance' });
    assert(rs.length > 0, `${t.key} 동선 없음`);
  }
});

check('종점 가까이 찍으면 그 종점을 집어낸다', () => {
  const exits = exitPoints(bay3, bay3Grid);
  const ent = exits.find((e) => e.kind === 'entrance')!;
  assert(Boolean(exitNear(exits, { x: ent.x + 20, y: ent.y + 20 }, 80)?.kind === 'entrance'), '가까운데 못 집는다');
  assert(exitNear(exits, { x: ent.x + 300, y: ent.y + 300 }, 80) === null, '먼데도 집는다');
  // 여럿이면 가장 가까운 것
  const near = exitNear(exits, { x: ent.x + 5, y: ent.y + 5 }, 400);
  assert(near?.id === ent.id, '가장 가까운 종점이 아니다');
});

check('점이 들어 있는 구획실을 찾는다', () => {
  const living = bay3.rooms.find((r) => r.kind === 'living')!;
  const c = roomCenter(living);
  assert(roomContaining(bay3, c)?.id === living.id, '실 안인데 못 찾는다');
  const b = planBounds(bay3);
  assert(roomContaining(bay3, { x: b.x - 200, y: b.y - 200 }) === null, '도면 밖인데 찾는다');
});

check('아직 동선이 없는 구획실을 짚어 준다', () => {
  const targets = routableRooms(bay3);
  assert(roomsMissingRoute(bay3).length === targets.length, '동선이 없는데 다 있다고 한다');

  // 자동 생성 동선은 fromRoom 으로 따진다
  const withAuto: Plan = { ...bay3, routes: primary };
  assert(roomsMissingRoute(withAuto).length === 0, '자동 동선을 못 알아본다');

  // 직접 그린 동선은 시작점이 든 실로 따진다
  const living = bay3.rooms.find((r) => r.kind === 'living')!;
  const c = roomCenter(living);
  const manual: Plan = {
    ...bay3,
    routes: [
      {
        id: 'm1',
        kind: 'primary',
        points: [c, { x: c.x, y: c.y - 200 }],
        endpoint: 'entrance',
        label: '직접',
        manual: true,
      },
    ],
  };
  const left = roomsMissingRoute(manual);
  assert(!left.some((r) => r.id === living.id), '직접 그린 동선의 시작 실을 못 알아본다');
  assert(left.length === targets.length - 1, `남은 실 ${left.length} / ${targets.length - 1}`);
});

check('수동 작도 자유선이 직각으로 정리된다', () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 60, y: 8 },
    { x: 130, y: 20 },
    { x: 140, y: 120 },
    { x: 260, y: 130 },
  ];
  const o = orthogonalize(pts);
  for (let i = 1; i < o.length; i += 1) {
    assert(o[i].x === o[i - 1].x || o[i].y === o[i - 1].y, '직각 정리 실패');
  }
  assert(o.length >= 3, `정리 결과 점 ${o.length}개`);
});

check('거리장은 종점에서 멀수록 커진다', () => {
  const exits = exitPoints(bay3, bay3Grid);
  const f = distanceField(bay3Grid, exits.filter((e) => e.kind === 'entrance').map((e) => e.cell));
  const ent = bay3.doors.find((d) => d.kind === 'entrance')!;
  const near1 = nearestWalkable(bay3Grid, ent.x, ent.y + 30);
  const far = nearestWalkable(bay3Grid, 150, 600);
  assert(f.cost[near1] < f.cost[far], `가까운 ${f.cost[near1]} vs 먼 ${f.cost[far]}`);
});

/* ------------------------------------------------------------------ */
/* 5. 연기 확산                                                         */
/* ------------------------------------------------------------------ */

section('연기·화염 확산');

const kitchen = bay3.rooms.find((r) => r.kind === 'kitchen')!;
const field = simulate(bay3, bay3Grid, roomCenter(kitchen), 'electric');

check('발화점의 도달 시각이 0 이다', () => {
  near(field.smoke[field.originCell], 0, 0.001, '발화점 도달 시각');
});

check('연기 확산 유효속도가 0.5~1.2 m/s 범위다', () => {
  // 발화실 내부(문을 지나지 않는 구간)에서 측정
  const o = field.origin;
  let best = -1;
  let bestD = 0;
  for (let i = 0; i < bay3Grid.walk.length; i += 1) {
    if (!bay3Grid.walk[i]) continue;
    if (bay3Grid.room[i] !== bay3.rooms.indexOf(kitchen)) continue;
    const p = cellCenter(bay3Grid, i);
    const d = Math.hypot(p.x - o.x, p.y - o.y);
    if (d > bestD) {
      bestD = d;
      best = i;
    }
  }
  const t = field.smoke[best];
  const v = bestD / 100 / t;
  assert(v >= 0.5 && v <= 1.2, `유효속도 ${v.toFixed(2)} m/s (거리 ${(bestD / 100).toFixed(1)}m, ${t.toFixed(1)}s)`);
});

check('닫힌 문 너머는 지연이 붙는다', () => {
  const bedroom = bay3.rooms.find((r) => r.name === '침실3')!;
  const c = roomCenter(bedroom);
  const cell = nearestWalkable(bay3Grid, c.x, c.y);
  const closedPlan: Plan = {
    ...bay3,
    doors: bay3.doors.map((d) => (d.kind === 'room' && d.dir === 'v' ? { ...d, alwaysOpen: false } : d)),
  };
  const openPlan: Plan = { ...bay3, doors: bay3.doors.map((d) => ({ ...d, alwaysOpen: true })) };
  const gA = buildGrid(closedPlan);
  const gB = buildGrid(openPlan);
  const fA = simulate(closedPlan, gA, roomCenter(kitchen), 'electric');
  const fB = simulate(openPlan, gB, roomCenter(kitchen), 'electric');
  const cellA = nearestWalkable(gA, c.x, c.y);
  const cellB = nearestWalkable(gB, c.x, c.y);
  assert(cell >= 0, '침실 셀 없음');
  assert(
    fA.smoke[cellA] > fB.smoke[cellB] + 30,
    `닫힘 ${fA.smoke[cellA].toFixed(0)}s vs 열림 ${fB.smoke[cellB].toFixed(0)}s`,
  );
});

check('이용자가 닫은 문은 지연이 더 커진다', () => {
  const roomDoor = bay3.doors.find((d) => d.kind === 'room' && !d.alwaysOpen)!;
  const base = simulate(bay3, bay3Grid, roomCenter(kitchen), 'electric');
  const shut = simulate(bay3, bay3Grid, roomCenter(kitchen), 'electric', [roomDoor.id]);
  const probe = cellAt(bay3Grid, roomDoor.x, roomDoor.y);
  let sumBase = 0;
  let sumShut = 0;
  let n = 0;
  for (let i = 0; i < bay3Grid.walk.length; i += 1) {
    if (!bay3Grid.walk[i]) continue;
    if (!isFinite(base.smoke[i]) || !isFinite(shut.smoke[i])) continue;
    sumBase += base.smoke[i];
    sumShut += shut.smoke[i];
    n += 1;
  }
  assert(probe >= 0, '문 셀 없음');
  assert(sumShut >= sumBase, `평균 도달시각이 늘지 않았다 (${sumBase / n} → ${sumShut / n})`);
});

check('발화 원인별 성장 배수가 확산 속도에 반영된다', () => {
  const slow = simulate(bay3, bay3Grid, roomCenter(kitchen), 'smoking');
  const fast = simulate(bay3, bay3Grid, roomCenter(kitchen), 'battery');
  const target = nearestWalkable(bay3Grid, 150, 600);
  assert(
    fast.smoke[target] < slow.smoke[target],
    `배터리 ${fast.smoke[target].toFixed(0)}s vs 담뱃불 ${slow.smoke[target].toFixed(0)}s`,
  );
});

check('화염은 연기보다 느리게 퍼진다', () => {
  let compared = 0;
  for (let i = 0; i < bay3Grid.walk.length; i += 37) {
    if (!bay3Grid.walk[i]) continue;
    if (!isFinite(field.smoke[i]) || !isFinite(field.flame[i])) continue;
    if (i === field.originCell) continue;
    assert(field.flame[i] >= field.smoke[i], `셀 ${i}: 화염 ${field.flame[i]} < 연기 ${field.smoke[i]}`);
    compared += 1;
  }
  assert(compared > 50, `비교 표본 ${compared}`);
});

check('차단 면적 곡선이 단조 증가한다', () => {
  const curve = areaCurve(field, bay3Grid, 300, 5);
  for (let i = 1; i < curve.length; i += 1) {
    assert(curve[i].blockedArea >= curve[i - 1].blockedArea - 1e-6, `t=${curve[i].t} 에서 감소`);
    assert(curve[i].reachedArea >= curve[i - 1].reachedArea - 1e-6, `t=${curve[i].t} 도달 면적 감소`);
    assert(curve[i].ratio <= 1.0001, `비율 ${curve[i].ratio}`);
  }
  assert(curve[curve.length - 1].blockedArea > curve[0].blockedArea, '면적이 늘지 않았다');
});

check('차단 면적은 언제나 연기 도달 면적 이하다', () => {
  const curve = areaCurve(field, bay3Grid, 300, 5);
  for (const c of curve) {
    assert(c.blockedArea <= c.reachedArea + 1e-6, `t=${c.t}: 차단 ${c.blockedArea} > 도달 ${c.reachedArea}`);
  }
  // 연기 선단이 나아가는 동안에는 도달 면적이 차단 면적보다 반드시 앞선다
  const lead = curve.filter((c) => c.reachedArea > c.blockedArea + 1);
  assert(lead.length > 0, '도달과 차단이 언제나 같다 — 지연이 반영되지 않았다');
  const early = curve.find((c) => c.t === 20)!;
  assert(early.reachedArea > early.blockedArea, `t=20: 도달 ${early.reachedArea} vs 차단 ${early.blockedArea}`);
});

check('시각 t 의 차단 면적과 곡선 값이 일치한다', () => {
  const curve = areaCurve(field, bay3Grid, 300, 5);
  for (const t of [30, 60, 120, 240]) {
    const direct = blockedArea(field, bay3Grid, t);
    const fromCurve = curve.find((c) => c.t === t)!;
    near(fromCurve.blockedArea, direct, 0.05, `t=${t} 면적`);
  }
});

check('연기 농도가 도달 전 0, 이후 상승해 1에서 멈춘다', () => {
  const i = nearestWalkable(bay3Grid, 150, 600);
  const a = field.smoke[i];
  assert(densityAt(field, i, a - 1) === 0, '도달 전 농도가 0이 아니다');
  assert(densityAt(field, i, a + 10) > 0, '도달 후 농도가 0이다');
  assert(densityAt(field, i, a + 1000) === 1, '농도 상한이 1이 아니다');
  near(densityAt(field, i, blockTime(field, i)), BLOCK_LEVEL, 1e-6, '차단 시각의 농도');
  near(blockTime(field, i) - a, DENSITY_RAMP * BLOCK_LEVEL, 1e-6, '도달에서 차단까지의 시간');
  assert(reachedArea(field, bay3Grid, 60) >= blockedArea(field, bay3Grid, 60), '차단 면적이 도달 면적보다 크다');
});

check('동선별 ASET·RSET 비교가 판정된다', () => {
  const r = primary[0];
  const aset = routeASET(field, bay3Grid, r);
  const m = safetyMargin(aset, rset(r, 'adult'));
  assert(['safe', 'tight', 'fail'].includes(m.verdict), `판정 ${m.verdict}`);
  near(m.margin, m.aset - m.rset, 0.001, '여유 시간');
  // 차단 시각은 연기 선단 도달 시각보다 반드시 늦다
  const cells = sampleRoute(r)
    .map((p) => cellAt(bay3Grid, p.x, p.y))
    .filter((i) => i >= 0 && bay3Grid.walk[i] === 1);
  const earliest = Math.min(...cells.map((i) => field.smoke[i]));
  assert(m.aset > earliest, `차단 ${m.aset} <= 도달 ${earliest}`);
});

check('84㎡ 평면 전 시간대 해석이 1초 이내다', () => {
  const t0 = performance.now();
  simulate(bay3, bay3Grid, roomCenter(kitchen), 'kitchen');
  const dt = performance.now() - t0;
  assert(dt < 1000, `${dt.toFixed(0)}ms`);
});

check('발화 원인 5종이 모두 해석된다', () => {
  for (const c of FIRE_CAUSES) {
    const f = simulate(bay3, bay3Grid, roomCenter(kitchen), c.key);
    assert(isFinite(f.smoke[f.originCell]), `${c.key} 해석 실패`);
    assert(f.growth > 0, `${c.key} 성장 배수 ${f.growth}`);
  }
  assert(DOOR_DELAY_SMOKE > 0, '문 지연 상수');
});

/* ------------------------------------------------------------------ */
/* 6. 대피 훈련                                                         */
/* ------------------------------------------------------------------ */

section('대피 훈련');

const bedroom = bay3.rooms.find((r) => r.name === '안방')!;
const setup = {
  origin: roomCenter(kitchen),
  cause: 'kitchen',
  startRoom: bedroom.id,
  walker: 'adult' as const,
  night: true,
};

check('훈련 시작 시 야간 인지 지연이 반영된다', () => {
  const s = startScenario(bay3, bay3Grid, setup);
  assert(s.t >= 55, `경과 ${s.t}s`);
  const day = startScenario(bay3, bay3Grid, { ...setup, night: false });
  assert(day.t < s.t, `주간 ${day.t} vs 야간 ${s.t}`);
});

check('행동 목록이 상태에 따라 달라진다', () => {
  let s = startScenario(bay3, bay3Grid, setup);
  const before = availableActions(bay3, s);
  assert(before.includes('lowPosture'), '자세 낮추기가 없다');
  s = applyAction(bay3, bay3Grid, s, 'lowPosture');
  const after = availableActions(bay3, s);
  assert(!after.includes('lowPosture'), '이미 한 행동이 남아 있다');
});

check('행동마다 시간이 흐른다', () => {
  let s = startScenario(bay3, bay3Grid, setup);
  const t0 = s.t;
  s = applyAction(bay3, bay3Grid, s, 'call119');
  assert(s.t > t0, `시간이 흐르지 않았다 (${t0} → ${s.t})`);
  assert(s.log.length === 1, `이력 ${s.log.length}`);
});

check('자세를 낮추면 노출이 줄어든다', () => {
  const base = startScenario(bay3, bay3Grid, setup);
  const upright = applyAction(bay3, bay3Grid, base, 'moveEntrance');
  const low = applyAction(bay3, bay3Grid, applyAction(bay3, bay3Grid, base, 'lowPosture'), 'moveEntrance');
  assert(low.dose < upright.dose, `낮은 자세 ${low.dose.toFixed(2)} vs 선 자세 ${upright.dose.toFixed(2)}`);
});

check('문을 닫으면 확산이 느려진다', () => {
  const base = startScenario(bay3, bay3Grid, setup);
  const shut = applyAction(bay3, bay3Grid, base, 'closeDoor');
  assert(shut.closedDoors.length === 1, `닫은 문 ${shut.closedDoors.length}`);
  let sumBase = 0;
  let sumShut = 0;
  let n = 0;
  for (let i = 0; i < bay3Grid.walk.length; i += 1) {
    if (!bay3Grid.walk[i]) continue;
    if (!isFinite(base.field.smoke[i]) || !isFinite(shut.field.smoke[i])) continue;
    sumBase += base.field.smoke[i];
    sumShut += shut.field.smoke[i];
    n += 1;
  }
  assert(n > 0 && sumShut >= sumBase, '평균 도달시각이 늘지 않았다');
});

check('현관으로 이동하면 훈련이 끝난다', () => {
  let s = startScenario(bay3, bay3Grid, { ...setup, night: false });
  s = applyAction(bay3, bay3Grid, s, 'lowPosture');
  s = applyAction(bay3, bay3Grid, s, 'moveEntrance');
  assert(s.outcome !== 'ongoing', `결과 ${s.outcome}`);
  assert(s.path.length > 2, `경로 점 ${s.path.length}`);
});

check('되돌아가면 판단 점수가 깎인다', () => {
  let good = startScenario(bay3, bay3Grid, { ...setup, night: false });
  good = applyAction(bay3, bay3Grid, good, 'lowPosture');
  good = applyAction(bay3, bay3Grid, good, 'moveEntrance');
  let bad = startScenario(bay3, bay3Grid, { ...setup, night: false });
  bad = applyAction(bay3, bay3Grid, bad, 'lowPosture');
  bad = applyAction(bay3, bay3Grid, bad, 'goBack');
  bad = applyAction(bay3, bay3Grid, bad, 'moveEntrance');
  assert(evaluate(bad).decisionScore < evaluate(good).decisionScore, '점수 차이가 없다');
});

check('권장 행동을 모두 하면 등급이 높다', () => {
  let s = startScenario(bay3, bay3Grid, { ...setup, night: false });
  for (const a of ['alertFamily', 'lowPosture', 'closeDoor', 'call119', 'moveEntrance'] as const) {
    s = applyAction(bay3, bay3Grid, s, a);
  }
  const ev = evaluate(s);
  assert(['A', 'B'].includes(ev.grade), `등급 ${ev.grade} (점수 ${ev.score})`);
  assert(ev.highlights.length >= 3, `잘한 점 ${ev.highlights.length}`);
});

check('아무 보호 행동 없이 오래 머물면 등급이 낮다', () => {
  let s = startScenario(bay3, bay3Grid, setup);
  for (let i = 0; i < 6 && s.outcome === 'ongoing'; i += 1) {
    s = applyAction(bay3, bay3Grid, s, 'assess');
  }
  s = applyAction(bay3, bay3Grid, s, 'moveEntrance');
  const ev = evaluate(s);
  assert(ev.grade === 'C' || ev.grade === 'D', `등급 ${ev.grade} (점수 ${ev.score})`);
  assert(ev.reviews.length > 0, '검토 사항이 없다');
});

check('행동 15종의 정의가 모두 갖춰져 있다', () => {
  assert(ACTIONS.length >= 15, `행동 ${ACTIONS.length}종`);
  for (const a of ACTIONS) {
    assert(a.label.length > 0 && a.detail.length > 0, `${a.key} 문안 누락`);
    assert(['인지', '보호', '이동', '종료'].includes(a.group), `${a.key} 분류 ${a.group}`);
  }
});

/* ------------------------------------------------------------------ */
/* 7. 도면 인식                                                         */
/* ------------------------------------------------------------------ */

section('도면 이미지 인식');

/** 2×2 격자 도면을 흉내낸 합성 이미지 */
function syntheticPlan(w = 400, h = 320, wall = 6): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    data[i * 4] = 255;
    data[i * 4 + 1] = 255;
    data[i * 4 + 2] = 255;
    data[i * 4 + 3] = 255;
  }
  const dark = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const o = (y * w + x) * 4;
    data[o] = 20;
    data[o + 1] = 20;
    data[o + 2] = 20;
  };
  const hLine = (y: number, x0: number, x1: number) => {
    for (let t = 0; t < wall; t += 1) for (let x = x0; x <= x1; x += 1) dark(x, y + t);
  };
  const vLine = (x: number, y0: number, y1: number) => {
    for (let t = 0; t < wall; t += 1) for (let y = y0; y <= y1; y += 1) dark(x + t, y);
  };
  hLine(20, 20, w - 20);
  hLine(h - 26, 20, w - 20);
  vLine(20, 20, h - 20);
  vLine(w - 26, 20, h - 20);
  hLine(160, 20, w - 20);
  vLine(200, 20, h - 20);
  return { width: w, height: h, data };
}

check('Otsu 임계값이 벽과 바탕을 갈라놓는다', () => {
  const img = syntheticPlan();
  const gray = new Uint8Array(img.width * img.height);
  for (let i = 0; i < gray.length; i += 1) gray[i] = img.data[i * 4];
  const t = otsu(gray);
  // 이진화는 threshold 이하를 벽으로 본다 — 벽(20)은 포함하고 바탕(255)은 제외해야 한다
  assert(t >= 20 && t < 255, `임계값 ${t}`);
  let ink = 0;
  for (let i = 0; i < gray.length; i += 1) if (gray[i] <= t) ink += 1;
  const ratio = ink / gray.length;
  assert(ratio > 0.02 && ratio < 0.4, `벽 비율 ${(ratio * 100).toFixed(1)}%`);
  // 중간 회색이 섞여도 두 무리 사이에서 임계값이 잡힌다
  const mixed = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i += 1) mixed[i] = gray[i] <= 128 ? 40 : 200;
  const t2 = otsu(mixed);
  assert(t2 >= 40 && t2 < 200, `혼합 임계값 ${t2}`);
});

check('합성 도면에서 실 4개를 인식한다', () => {
  const res = trace(syntheticPlan(), { minArea: 500 });
  assert(res.rooms.length === 4, `인식 ${res.rooms.length}개 (임계값 ${res.threshold})`);
  for (const r of res.rooms) {
    assert(r.fill > 0.8, `충실도 ${r.fill.toFixed(2)}`);
    assert(r.w > 50 && r.h > 50, `크기 ${r.w}×${r.h}`);
  }
});

check('최소 면적을 올리면 후보가 줄어든다', () => {
  const loose = trace(syntheticPlan(), { minArea: 500 });
  const strict = trace(syntheticPlan(), { minArea: 30000 });
  assert(strict.rooms.length < loose.rooms.length, `${strict.rooms.length} vs ${loose.rooms.length}`);
  assert(strict.rejected > 0, '폐기 수가 0이다');
});

check('벽선 후보가 추출된다', () => {
  const res = trace(syntheticPlan(), { minLine: 60 });
  assert(res.lines.length >= 4, `벽선 ${res.lines.length}개`);
  assert(res.lines.some((l) => l.dir === 'h') && res.lines.some((l) => l.dir === 'v'), '방향이 한쪽뿐이다');
});

check('큰 이미지는 축소해 처리한다', () => {
  const big = syntheticPlan(2400, 1800, 24);
  const t0 = performance.now();
  const res = trace(big, { minArea: 2000, maxSize: 800 });
  const dt = performance.now() - t0;
  assert(res.scale < 1, `축척 ${res.scale}`);
  assert(dt < 3000, `${dt.toFixed(0)}ms`);
  assert(res.rooms.length >= 3, `인식 ${res.rooms.length}개`);
});

check('총 면적으로부터 축척을 역산한다', () => {
  const res = trace(syntheticPlan(), { minArea: 500 });
  const cmPerPx = scaleFromArea(res.rooms, 84);
  const total = res.rooms.reduce((s, r) => s + (r.w * cmPerPx) * (r.h * cmPerPx), 0) / 10000;
  near(total, 84, 0.5, '역산 면적');
});

check('두 점 실측으로 축척을 구한다', () => {
  near(scaleFromMeasure(200, 600), 3, 0.001, '축척');
  near(scaleFromMeasure(0, 600), 1, 0.001, '0 나눗셈 보호');
});

/* ------------------------------------------------------------------ */
/* 8. 저장 · 이력                                                       */
/* ------------------------------------------------------------------ */

section('저장 · 실행취소');

check('직렬화·역직렬화가 왕복한다', () => {
  const p = buildFromTemplate('tower', 59);
  const back = parsePlan(serialize(p));
  assert(back.rooms.length === p.rooms.length, '실 수 불일치');
  assert(back.doors.length === p.doors.length, '문 수 불일치');
  near(builtArea(back), builtArea(p), 0.01, '면적 불일치');
});

check('구버전·손상 파일이 기본값으로 이행된다', () => {
  const a = migrate({ rooms: [{ id: 'x', kind: 'room', name: 'a', x: 0, y: 0, w: 100, h: 100 }] });
  assert(a.doors.length === 0 && a.facilities.length === 0, '기본 배열 누락');
  assert(a.meta.walker === 'adult', `보행 기준 ${a.meta.walker}`);
  const b = migrate(null);
  assert(b.rooms.length === 0, '빈 계획 이행 실패');
  const c = migrate({ meta: { dong: '101' } });
  assert(c.meta.dong === '101' && c.meta.area > 0, '메타 병합 실패');
});

check('실행 취소·다시 실행이 동작한다', () => {
  const s = new AppStore();
  s.setAutosave(false);
  const p0 = s.getState().plan;
  s.update((p) => addRoom(p, { kind: 'room', name: 'A', x: 0, y: 0, w: 300, h: 300 }));
  assert(s.getState().plan.rooms.length === 1, '추가 실패');
  s.undo();
  assert(s.getState().plan === p0, '되돌리기 실패');
  s.redo();
  assert(s.getState().plan.rooms.length === 1, '다시 실행 실패');
});

check('이력이 80단계로 제한된다', () => {
  const s = new AppStore();
  s.setAutosave(false);
  for (let i = 0; i < HISTORY_LIMIT + 30; i += 1) {
    s.update((p) => addRoom(p, { kind: 'room', name: `R${i}`, x: i, y: 0, w: 10, h: 10 }));
  }
  assert(s.getState().past.length === HISTORY_LIMIT, `이력 ${s.getState().past.length}`);
});

check('드래그 한 묶음이 이력 한 단계로 남는다', () => {
  const s = new AppStore();
  s.setAutosave(false);
  s.update((p) => addRoom(p, { kind: 'room', name: 'A', x: 0, y: 0, w: 300, h: 300 }));
  const depth = s.getState().past.length;
  s.begin();
  for (let i = 1; i <= 20; i += 1) {
    s.patchWith((p) => ({ ...p, rooms: p.rooms.map((r) => ({ ...r, x: i * 5 })) }));
  }
  s.end();
  assert(s.getState().past.length === depth + 1, `이력 증가 ${s.getState().past.length - depth}`);
  assert(s.getState().plan.rooms[0].x === 100, `최종 좌표 ${s.getState().plan.rooms[0].x}`);
});

check('선택 요소 삭제가 종류별로 동작한다', () => {
  let p: Plan = buildFromTemplate('small', 39);
  const roomId = p.rooms[0].id;
  p = removeSelection(p, { kind: 'room', id: roomId });
  assert(!p.rooms.some((r) => r.id === roomId), '실 삭제 실패');
  const doorId = p.doors[0].id;
  p = removeSelection(p, { kind: 'door', id: doorId });
  assert(!p.doors.some((d) => d.id === doorId), '문 삭제 실패');
});

check('단계 완료 판정이 계획 상태를 따른다', () => {
  const drill = { setup: null, state: null };
  assert(!stepDone(emptyPlan(), 0, drill), '빈 계획이 완료로 표시된다');
  const p = buildFromTemplate('bay3', 84);
  assert(stepDone(p, 0, drill), '평면 단계 미완료');
  assert(stepDone(p, 2, drill), '개구부 단계 미완료');
  assert(!stepDone(p, 4, drill), '동선 없이 완료로 표시된다');
  assert(STEPS.length === 9, `단계 ${STEPS.length}개`);
});

/* ------------------------------------------------------------------ */
/* 9. 자동 점검 · 콘텐츠                                                */
/* ------------------------------------------------------------------ */

section('자가 진단 · 콘텐츠');

check('사용승인 연도가 피난시설 시기로 매핑된다', () => {
  assert(eraFor(1988).key === 'pre1992', eraFor(1988).key);
  assert(eraFor(1999).key === 'y1992', eraFor(1999).key);
  assert(eraFor(2008).key === 'y2005', eraFor(2008).key);
  assert(eraFor(2021).key === 'y2010', eraFor(2021).key);
});

check('완성된 계획은 진단 점수가 높다', () => {
  const p: Plan = { ...bay3, routes: primary.concat(generateRoutes(bay3, bay3Grid, { target: 'facility' })) };
  p.meta = { ...p.meta, dong: '101', ho: '502', assembly: '놀이터' };
  const d = diagnose(p, bay3Grid);
  assert(d.score >= 85, `점수 ${d.score} (${d.checks.filter((c) => c.status !== 'pass').map((c) => c.id).join(',')})`);
  assert(d.grade === 'A' || d.grade === 'B', `등급 ${d.grade}`);
});

check('빈 계획은 진단에서 결함이 잡힌다', () => {
  const d = diagnose(emptyPlan());
  assert(d.score < 50, `점수 ${d.score}`);
  assert(d.failed >= 2, `결함 ${d.failed}건`);
  assert(d.checks.every((c) => c.fix.length > 0), '조치 문안 누락');
});

check('고립된 실이 진단에 잡힌다', () => {
  const p: Plan = {
    ...buildFromTemplate('small', 39),
  };
  // 침실1 의 문을 모두 없애 고립시킨다
  const bed = p.rooms.find((r) => r.name === '침실1')!;
  p.doors = p.doors.filter((d) => {
    const onLeft = Math.abs(d.x - bed.x) < 2 && d.y > bed.y && d.y < bed.y + bed.h;
    const onRight = Math.abs(d.x - (bed.x + bed.w)) < 2 && d.y > bed.y && d.y < bed.y + bed.h;
    const onTop = Math.abs(d.y - bed.y) < 2 && d.x > bed.x && d.x < bed.x + bed.w;
    const onBottom = Math.abs(d.y - (bed.y + bed.h)) < 2 && d.x > bed.x && d.x < bed.x + bed.w;
    return !(onLeft || onRight || onTop || onBottom);
  });
  const g = buildGrid(p);
  const d = diagnose(p, g);
  const iso = d.checks.find((c) => c.id === 'isolation')!;
  assert(iso.status === 'fail', `판정 ${iso.status} — ${iso.detail}`);
});

check('위험요소 자료 10종이 갖춰져 있다', () => {
  assert(HAZARDS.length >= 10, `자료 ${HAZARDS.length}종`);
  for (const h of HAZARDS) {
    assert(Boolean(h.title && h.where && h.why && h.fix), `${h.id} 문안 누락`);
    assert(['high', 'mid'].includes(h.severity), `${h.id} 등급 ${h.severity}`);
  }
  const ids = new Set(HAZARDS.map((h) => h.id));
  assert(ids.size === HAZARDS.length, '중복 id');
});

check('피난 행동 절차가 번호 순으로 이어진다', () => {
  assert(PROCEDURE.length >= 8, `절차 ${PROCEDURE.length}단계`);
  PROCEDURE.forEach((s, i) => {
    assert(s.no === i + 1, `${i + 1}번째 단계 번호 ${s.no}`);
    assert(s.body.length > 5, `${s.no} 본문 누락`);
  });
});

check('알 수 없는 표준 평면 키는 오류를 낸다', () => {
  let threw = false;
  try {
    getTemplate('nope' as PlanTypeKey);
  } catch {
    threw = true;
  }
  assert(threw, '오류가 발생하지 않았다');
});

/* ------------------------------------------------------------------ */
/* 10. 자유 그리기 보정                                                 */
/* ------------------------------------------------------------------ */

section('자유 그리기 보정');

/** 결정적 잔떨림 — 같은 입력이면 늘 같은 결과가 나오게 한다 */
function jitter(i: number, amp: number): number {
  const v = Math.sin(i * 12.9898) * 43758.5453;
  return (v - Math.floor(v) - 0.5) * 2 * amp;
}

/** 두 점 사이를 흔들리며 잇는 손그림 */
function wobble(
  a: { x: number; y: number },
  b: { x: number; y: number },
  n: number,
  amp: number,
  seed = 0,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    out.push({
      x: a.x + (b.x - a.x) * t + jitter(seed + i, amp),
      y: a.y + (b.y - a.y) * t + jitter(seed + i + 500, amp),
    });
  }
  return out;
}

/** 손으로 대충 두른 사각형 */
function wobbleRect(x: number, y: number, w: number, h: number, amp = 9) {
  return wobble({ x, y }, { x: x + w, y }, 10, amp, 1)
    .concat(wobble({ x: x + w, y }, { x: x + w, y: y + h }, 10, amp, 40))
    .concat(wobble({ x: x + w, y: y + h }, { x, y: y + h }, 10, amp, 80))
    .concat(wobble({ x, y: y + h }, { x, y }, 10, amp, 120));
}

check('잔떨림이 있는 직선이 두 점으로 줄어든다', () => {
  const raw = wobble({ x: 0, y: 0 }, { x: 400, y: 0 }, 40, 6);
  const simple = simplify(raw, 18);
  assert(simple.length === 2, `단순화 결과 ${simple.length}점`);
});

check('보정된 선은 수평·수직 구간만 남는다', () => {
  const raw = wobble({ x: 0, y: 0 }, { x: 300, y: 12 }, 30, 8).concat(
    wobble({ x: 300, y: 12 }, { x: 310, y: 260 }, 30, 8, 900),
  );
  const line = straighten(raw, { grid: 5 });
  assert(line.length >= 2, `점 ${line.length}개`);
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1];
    const b = line[i];
    assert(a.x === b.x || a.y === b.y, `사선 구간 (${a.x},${a.y})→(${b.x},${b.y})`);
  }
});

check('보정된 좌표가 눈금에 맞춰진다', () => {
  const raw = wobble({ x: 3, y: 7 }, { x: 297, y: 11 }, 30, 7);
  for (const grid of [5, 10, 25]) {
    const line = straighten(raw, { grid });
    for (const p of line) {
      assert(p.x % grid === 0 && p.y % grid === 0, `눈금 ${grid} 에 안 맞음 (${p.x},${p.y})`);
    }
  }
});

check('닫힌 모양과 열린 선을 구분한다', () => {
  assert(looksClosed(wobbleRect(0, 0, 400, 300)), '닫힌 모양을 못 알아본다');
  assert(!looksClosed(wobble({ x: 0, y: 0 }, { x: 400, y: 0 }, 20, 6)), '열린 선을 닫혔다고 본다');
  assert(!looksClosed(wobble({ x: 0, y: 0 }, { x: 20, y: 10 }, 5, 2)), '너무 작은 선');
});

check('손으로 두른 사각형이 네 꼭짓점으로 펴진다', () => {
  const poly = straightenLoop(wobbleRect(100, 100, 500, 400), { grid: 10 });
  assert(poly.length === 4, `꼭짓점 ${poly.length}개: ${JSON.stringify(poly)}`);
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  near(Math.min(...xs), 100, 20, '좌측');
  near(Math.max(...xs), 600, 20, '우측');
  near(Math.min(...ys), 100, 20, '상단');
  near(Math.max(...ys), 500, 20, '하단');
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    assert(a.x === b.x || a.y === b.y, '변이 축에 나란하지 않다');
  }
});

check('직사각형 다각형은 사각형 하나가 된다', () => {
  const rects = polygonToRects([
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 300 },
    { x: 0, y: 300 },
  ]);
  assert(rects.length === 1, `사각형 ${rects.length}개`);
  near(rects[0].w * rects[0].h, 400 * 300, 1, '면적');
});

check('ㄱ자 다각형이 사각형 두 개로 나뉜다', () => {
  const poly = [
    { x: 0, y: 0 },
    { x: 600, y: 0 },
    { x: 600, y: 200 },
    { x: 300, y: 200 },
    { x: 300, y: 500 },
    { x: 0, y: 500 },
  ];
  const rects = polygonToRects(poly);
  assert(rects.length === 2, `사각형 ${rects.length}개`);
  const area = rects.reduce((a, r) => a + r.w * r.h, 0);
  near(area, 600 * 200 + 300 * 300, 1, '합계 면적');
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      assert(ox <= 0 || oy <= 0, '나뉜 사각형이 겹친다');
    }
  }
});

check('이미 실이 있는 자리는 비켜 간다', () => {
  const poly = [
    { x: 0, y: 0 },
    { x: 600, y: 0 },
    { x: 600, y: 400 },
    { x: 0, y: 400 },
  ];
  const rects = polygonToRects(poly, [{ x: 0, y: 0, w: 300, h: 400 }]);
  const area = rects.reduce((a, r) => a + r.w * r.h, 0);
  near(area, 300 * 400, 1, '남은 면적');
  assert(rects.every((r) => r.x >= 300 - 0.5), '기존 실을 침범한다');
});

check('닫힌 손그림이 방으로 해석된다', () => {
  const res = interpretStroke(emptyPlan(), wobbleRect(0, 0, 700, 500), { grid: 10 });
  assert(res.kind === 'rooms', `해석 ${res.kind}`);
  if (res.kind !== 'rooms') return;
  assert(res.rects.length === 1, `사각형 ${res.rects.length}개`);
  near((res.rects[0].w * res.rects[0].h) / 10000, 35, 4, '면적(㎡)');
});

check('방을 가로지른 선이 벽으로 해석된다', () => {
  const living = bay3.rooms.find((r) => r.kind === 'living')!;
  const midX = Math.round(living.x + living.w / 2);
  const raw = wobble(
    { x: midX, y: living.y + 20 },
    { x: midX + 6, y: living.y + living.h - 20 },
    24,
    7,
  );
  const res = interpretStroke(bay3, raw, { grid: 10 });
  assert(res.kind === 'split', `해석 ${res.kind}`);
  if (res.kind !== 'split') return;
  assert(res.roomId === living.id, '다른 실을 골랐다');
  assert(res.axis === 'v', `축 ${res.axis}`);
  near(res.at, midX, 30, '벽 위치');
});

check('벽 위에 그은 선이 문으로 해석된다', () => {
  const raw = wobble({ x: 70, y: 3 }, { x: 160, y: -2 }, 16, 5);
  const res = interpretStroke(bay3, raw, { grid: 5 });
  assert(res.kind === 'opening', `해석 ${res.kind}`);
  if (res.kind !== 'opening') return;
  assert(res.dir === 'h', `방향 ${res.dir}`);
  near(res.y, 0, 6, '벽 위 위치');
  near(res.width, 90, 25, '문 폭');
});

check('나눈 방 둘이 원래 방을 빈틈없이 채운다', () => {
  const room = bay3.rooms.find((r) => r.kind === 'living')!;
  const out = splitRoom(room, 'v', room.x + 200)!;
  assert(Boolean(out), '분할 실패');
  const a = { ...room, ...out.keep };
  const b = out.create;
  near(a.w + b.w, room.w, 0.001, '폭 합계');
  assert(a.x + a.w === b.x, '경계가 어긋난다');
  assert(a.h === b.h && a.y === b.y, '높이가 다르다');
  assert(b.name !== room.name, '이름이 겹친다');
  assert(!splitRoom(room, 'v', room.x + 10), '가장자리 분할이 막히지 않는다');
});

check('여러 번 나눠도 방 이름이 겹치지 않는다', () => {
  let rooms: Room[] = [{ id: 'a', name: '침실', kind: 'room', x: 0, y: 0, w: 800, h: 600 }];
  for (let i = 0; i < 4; i += 1) {
    const target = rooms[0];
    const out = splitRoom(
      target,
      'v',
      target.x + Math.round(target.w / 2),
      rooms.map((r) => r.name),
    );
    assert(Boolean(out), `${i + 1}번째 분할 실패`);
    rooms = rooms
      .map((r) => (r.id === out!.keep.id ? { ...r, ...out!.keep } : r))
      .concat([{ ...out!.create, id: `n${i}` }]);
  }
  const names = rooms.map((r) => r.name);
  assert(new Set(names).size === names.length, `이름 중복: ${names.join(', ')}`);
  assert(rooms.length === 5, `방 ${rooms.length}개`);
});

check('해석할 수 없는 선은 까닭을 알려 준다', () => {
  const res = interpretStroke(emptyPlan(), wobble({ x: 0, y: 0 }, { x: 500, y: 4 }, 20, 5), { grid: 10 });
  assert(res.kind === 'none', `해석 ${res.kind}`);
  if (res.kind !== 'none') return;
  assert(res.reason.length > 10, '설명이 없다');
});

check('해석 방식을 직접 고르면 그대로 따른다', () => {
  const open = wobble({ x: 0, y: 0 }, { x: 600, y: 8 }, 20, 6).concat(
    wobble({ x: 600, y: 8 }, { x: 600, y: 400 }, 20, 6, 700),
  );
  const forced = interpretStroke(emptyPlan(), open, { grid: 10, mode: 'room' });
  assert(forced.kind === 'rooms', `방 강제 → ${forced.kind}`);
  const wall = interpretStroke(emptyPlan(), open, { grid: 10, mode: 'wall' });
  assert(wall.kind === 'none', `벽 강제(실 없음) → ${wall.kind}`);
});

check('그려 넣은 방으로도 벽·격자가 만들어진다', () => {
  const drawn = interpretStroke(emptyPlan(), wobbleRect(0, 0, 900, 700), { grid: 10 });
  assert(drawn.kind === 'rooms', '방 생성 실패');
  if (drawn.kind !== 'rooms') return;
  const plan: Plan = {
    ...emptyPlan(),
    rooms: drawn.rects.map((r, i) => ({
      id: `sk${i}`,
      kind: 'living' as const,
      name: `실${i + 1}`,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
    })),
  };
  const model = buildWalls(plan);
  assert(model.walls.length >= 4, `벽 ${model.walls.length}조각`);
  const g = buildGrid(plan, 10, model);
  assert(walkableArea(g) > 40, `통행 면적 ${walkableArea(g).toFixed(1)}㎡`);
});

/* ------------------------------------------------------------------ */
/* 11. 안내 · 도우미 · 낱말이 기능과 어긋나지 않는지                     */
/* ------------------------------------------------------------------ */

section('안내 · 도우미 · 낱말');

const LEVELS_ALL = ['elementary', 'secondary'] as const;

check('따라하기가 모든 작성 단계를 다룬다', () => {
  for (const level of LEVELS_ALL) {
    const covered = new Set(
      tutorialFor(level)
        .map((s) => s.goStep)
        .filter((v): v is number => v !== undefined),
    );
    const missing = STEPS.map((s, i) => (covered.has(i) ? null : `${s.no} ${s.title}`)).filter(Boolean);
    assert(missing.length === 0, `${level}: 안내에 없는 단계 — ${missing.join(', ')}`);
  }
});

check('따라하기가 가리키는 곳이 모두 정해진 이름이다', () => {
  for (const level of LEVELS_ALL) {
    for (const s of tutorialFor(level)) {
      if (!s.target) continue;
      assert(
        (COACH_TARGETS as readonly string[]).includes(s.target),
        `${level}/${s.id}: 알 수 없는 대상 ${s.target}`,
      );
    }
  }
});

check('따라하기 문안이 비어 있지 않고 id 가 겹치지 않는다', () => {
  for (const level of LEVELS_ALL) {
    const steps = tutorialFor(level);
    assert(steps.length >= 8, `${level}: 안내 ${steps.length}개`);
    const ids = new Set(steps.map((s) => s.id));
    assert(ids.size === steps.length, `${level}: id 중복`);
    for (const s of steps) {
      assert(s.title.length > 2, `${level}/${s.id}: 제목 없음`);
      assert(s.body.length > 15, `${level}/${s.id}: 본문이 너무 짧다`);
      if (s.goStep !== undefined) {
        assert(s.goStep >= 0 && s.goStep < STEPS.length, `${level}/${s.id}: 단계 ${s.goStep}`);
      }
      if (s.wait) assert(Boolean(s.done), `${level}/${s.id}: 기다리는데 끝 판정이 없다`);
    }
  }
});

check('설명서가 도구와 단계를 하나도 빠뜨리지 않는다', () => {
  for (const level of LEVELS_ALL) {
    const secs = manualSections(level);
    const text = JSON.stringify(secs);
    for (const s of STEPS) assert(text.includes(s.title), `${level}: 단계 "${s.title}" 누락`);
    for (const t of TOOLS) assert(text.includes(t.label), `${level}: 도구 "${t.label}" 누락`);
    const tools = secs.find((s) => s.id === 'tools')!;
    assert(tools.items.length === TOOLS.length, `${level}: 도구 설명 ${tools.items.length} / ${TOOLS.length}`);
  }
});

check('초등 낱말이 모든 항목에 갖춰져 있다', () => {
  assert(STEP_EASY.length === STEPS.length, `단계 낱말 ${STEP_EASY.length} / ${STEPS.length}`);
  STEP_EASY.forEach((s, i) => {
    assert(s.title.length > 1 && s.short.length > 0 && s.guide.length > 10, `${i}번째 단계 낱말 부족`);
  });
  for (const k of Object.keys(FACILITY_LABEL) as (keyof typeof FACILITY_LABEL)[]) {
    assert(Boolean(FACILITY_EASY[k]), `기호 "${k}" 쉬운 이름 없음`);
    assert(Boolean(FACILITY_CAPTION[k]), `기호 "${k}" 도면 캡션 없음`);
    assert(Boolean(FACILITY_WHY[k]), `기호 "${k}" 설명 없음`);
  }
  for (const k of Object.keys(ROOM_KIND_LABEL) as (keyof typeof ROOM_KIND_LABEL)[]) {
    assert(Boolean(ROOM_EASY[k]), `실 용도 "${k}" 쉬운 이름 없음`);
  }
});

check('설비 표기에 감지기가 남아 있지 않다', () => {
  assert(!('detector' in FACILITY_LABEL), '기호 목록에 감지기가 남아 있다');
  for (const t of TEMPLATES) {
    const p = buildFromTemplate(t.key, t.defaultArea);
    assert(
      p.facilities.every((f) => (f.type as string) !== 'detector'),
      `${t.key} 표준 평면에 감지기가 남아 있다`,
    );
  }
  const migrated = migrate({
    rooms: [],
    facilities: [
      { id: 'a', type: 'detector', x: 0, y: 0, rot: 0 },
      { id: 'b', type: 'extinguisher', x: 0, y: 0, rot: 0 },
    ],
  });
  assert(migrated.facilities.length === 1, '구버전 파일의 감지기가 걸러지지 않았다');
  assert(migrated.facilities[0].type === 'extinguisher', '엉뚱한 것이 걸러졌다');
});

check('도우미가 상황마다 다음 할 일을 알려 준다', () => {
  const empty = assistFor(emptyPlan(), 0);
  assert(empty[0].id === 'no-room', `빈 도면 → ${empty[0].id}`);
  assert(Boolean(empty[0].action), '할 일 단추가 없다');

  const oneRoom: Plan = {
    ...emptyPlan(),
    rooms: [{ id: 'a', kind: 'room', name: '방', x: 0, y: 0, w: 500, h: 400 }],
  };
  assert(assistFor(oneRoom, 0)[0].id === 'one-room', '방 하나일 때 안내가 다르다');

  const noDoor: Plan = { ...bay3, doors: bay3.doors.filter((d) => d.kind !== 'entrance') };
  const ids = assistFor(noDoor, 2).map((a) => a.id);
  assert(ids.includes('no-entrance'), `현관문 없음을 못 짚는다: ${ids.join(',')}`);

  const full: Plan = {
    ...bay3,
    routes: primary,
    meta: { ...bay3.meta, dong: '101', ho: '502' },
  };
  const done = assistFor(full, 8);
  assert(done.every((a) => a.tone !== 'warn'), `다 됐는데 경고가 남았다: ${done.map((a) => a.id).join(',')}`);
});

check('도우미가 모든 상황을 짚고 문안에 빈 곳이 없다', () => {
  const oneRoom: Plan = {
    ...emptyPlan(),
    rooms: [{ id: 'a', kind: 'room', name: '방', x: 0, y: 0, w: 500, h: 400 }],
  };
  const withAddr: Plan = { ...bay3, meta: { ...bay3.meta, dong: '101', ho: '502' } };
  const noExt: Plan = { ...withAddr, facilities: withAddr.facilities.filter((f) => f.type !== 'extinguisher') };
  const noEscape: Plan = {
    ...withAddr,
    facilities: withAddr.facilities.filter(
      (f) => f.type !== 'refuge' && f.type !== 'partition' && f.type !== 'downladder',
    ),
  };
  const onlyPrimary: Plan = { ...withAddr, routes: primary };
  const full: Plan = { ...withAddr, routes: primary.concat(generateRoutes(bay3, bay3Grid, { target: 'facility' })) };

  // 문을 모두 없애 갇힌 방을 만든다
  const smallPlan = buildFromTemplate('small', 39);
  const bed = smallPlan.rooms.find((r) => r.name === '침실1')!;
  const stuck: Plan = {
    ...smallPlan,
    doors: smallPlan.doors.filter((d) => {
      const onLeft = Math.abs(d.x - bed.x) < 2 && d.y > bed.y && d.y < bed.y + bed.h;
      const onRight = Math.abs(d.x - (bed.x + bed.w)) < 2 && d.y > bed.y && d.y < bed.y + bed.h;
      const onTop = Math.abs(d.y - bed.y) < 2 && d.x > bed.x && d.x < bed.x + bed.w;
      const onBottom = Math.abs(d.y - (bed.y + bed.h)) < 2 && d.x > bed.x && d.x < bed.x + bed.w;
      return !(onLeft || onRight || onTop || onBottom);
    }),
  };

  const cases: [Plan, Grid | undefined][] = [
    [emptyPlan(), undefined],
    [oneRoom, undefined],
    [bay3, bay3Grid],
    [{ ...bay3, doors: bay3.doors.filter((d) => d.kind !== 'entrance') }, bay3Grid],
    [noExt, bay3Grid],
    [noEscape, bay3Grid],
    [onlyPrimary, bay3Grid],
    [full, bay3Grid],
    [stuck, buildGrid(stuck)],
  ];

  const seen = new Set<string>();
  for (const [p, g] of cases) {
    for (let step = 0; step < STEPS.length; step += 1) {
      for (const a of assistFor(p, step, g)) {
        seen.add(a.id);
        assert(a.title.length > 2, `${a.id}: 제목 없음`);
        assert(a.body.length > 10, `${a.id}: 본문 없음`);
        assert(['todo', 'ok', 'warn', 'done'].includes(a.tone), `${a.id}: 말투 ${a.tone}`);
        if (a.action) {
          assert(a.action.label.length > 1, `${a.id}: 단추 이름 없음`);
          if (a.action.kind === 'step') {
            const v = Number(a.action.value);
            assert(v >= 0 && v < STEPS.length, `${a.id}: 단계 ${v}`);
          }
        }
      }
    }
  }

  const want = [
    'no-room',
    'one-room',
    'no-entrance',
    'stuck-room',
    'no-address',
    'no-ext',
    'no-escape',
    'no-route',
    'no-alt',
    'all-set',
  ];
  const missing = want.filter((id) => !seen.has(id));
  assert(missing.length === 0, `짚지 못한 상황: ${missing.join(', ')}`);
});

check('진행 정도가 0에서 1 사이로 늘어난다', () => {
  const a = progress(emptyPlan());
  near(a.value, 0, 0.001, '빈 도면 진행');
  const b = progress(bay3);
  assert(b.value > a.value, `${a.value} → ${b.value}`);
  const c = progress({ ...bay3, routes: primary, meta: { ...bay3.meta, dong: '1', ho: '2' } });
  near(c.value, 1, 0.001, '다 채운 진행');
  assert(c.label === '6 / 6', c.label);
});

check('초등은 대충 그려도 방으로 받아 준다', () => {
  // 시작점과 끝점이 한참 벌어진, 많이 흔들린 사각형
  const sloppy = wobble({ x: 0, y: 0 }, { x: 800, y: 0 }, 12, 26, 3)
    .concat(wobble({ x: 800, y: 0 }, { x: 800, y: 600 }, 12, 26, 60))
    .concat(wobble({ x: 800, y: 600 }, { x: 0, y: 600 }, 12, 26, 120))
    .concat(wobble({ x: 0, y: 600 }, { x: 60, y: 120 }, 8, 26, 180));

  const strict = interpretStroke(emptyPlan(), sloppy, { grid: 5 });
  const easy = interpretStroke(emptyPlan(), sloppy, { grid: 10, easy: true });
  assert(easy.kind === 'rooms', `초등 해석 ${easy.kind}`);
  if (easy.kind !== 'rooms') return;
  assert(easy.rects.length <= 2, `조각 ${easy.rects.length}개 — 너무 잘게 나뉜다`);
  const area = easy.rects.reduce((s, r) => s + r.w * r.h, 0) / 10000;
  assert(area > 30, `면적 ${area.toFixed(1)}㎡`);
  // 엄격 모드보다 초등 쪽이 조각이 적거나 같아야 한다
  if (strict.kind === 'rooms') {
    assert(easy.rects.length <= strict.rects.length, `초등 ${easy.rects.length} vs 일반 ${strict.rects.length}`);
  }
});

check('초등은 짧게 가로질러도 벽으로 받아 준다', () => {
  const living = bay3.rooms.find((r) => r.kind === 'living')!;
  const midX = Math.round(living.x + living.w / 2);
  // 방 높이의 40% 만 가로지른 짧은 선
  const short = wobble(
    { x: midX, y: living.y + living.h * 0.3 },
    { x: midX + 8, y: living.y + living.h * 0.7 },
    14,
    9,
  );
  const easy = interpretStroke(bay3, short, { grid: 10, easy: true });
  assert(easy.kind === 'split', `초등 해석 ${easy.kind}`);
});

/* ------------------------------------------------------------------ */
/* 어린이 화면 — src/kids                                              */
/* ------------------------------------------------------------------ */

kidsTests(check, assert);

/* ------------------------------------------------------------------ */

const total = passed + failures.length;
process.stdout.write(`\n  ${passed}/${total} 항목 통과\n`);
if (failures.length) {
  process.stdout.write(`\n실패 ${failures.length}건:\n${failures.map((f) => `  - ${f}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('\n  전 항목 통과\n\n');
