/** 연산 로직 — 화면 없이 돈다 */
import assert from 'node:assert/strict';
import { autoDoors, autoMarks, autoRoute, autoRoute2, autoTag, findSecondRoute } from '../src/core/auto';
import {
  closeLastDoor,
  drillMoves,
  finishMeet,
  isTrapped,
  moveTo,
  pickSource,
  setCrouch,
  startDrill,
  touchDoor,
  type DrillState,
} from '../src/core/drill';
import { addEdges, addStroke, emptyPlan, normalize, paintCell, placeMark, removeWall, routeCandidates, tapRoute, toggleOpening } from '../src/core/edit';
import { analyze, cellIdAt, dKey, edgeBetween, hKey, isExterior, isInterior, pieceCenter, pieceKeyAt, shortestPath, sqKey, uKey, unreachableCells, vKey } from '../src/core/grid';
import { stepField } from '../src/core/hazard';
import { arrowMap, pickByArrow, pointAlong, routePoints, type ArrowDir } from '../src/core/path';
import { buildReport } from '../src/core/report';
import { extendStroke, nearestDot, nearestEdge, wasDiagonalDrag } from '../src/core/stroke';
import { OUT, type Band, type Plan } from '../src/core/types';
import { BANDS, bandOfGrade } from '../src/content/bands';
import { FIRE } from '../src/content/fire';
import { segEdges, TEMPLATES, templatesFor, type Template } from '../src/content/templates';
import type { Check } from './test';

const box = (x1: number, y1: number, x2: number, y2: number): string[] =>
  segEdges([
    [x1, y1, x2, y1],
    [x1, y2, x2, y2],
    [x1, y1, x1, y2],
    [x2, y1, x2, y2],
  ]);

function fromTemplate(t: Template): Plan {
  const info = BANDS[t.band];
  return addEdges(emptyPlan(info.cols, info.rows), [...segEdges(t.outer), ...segEdges(t.inner)]);
}

/** 「도와줘」 만 눌러 완성한 지도 */
function autoAll(t: Template): Plan {
  return autoRoute(autoMarks(autoDoors(autoTag(fromTemplate(t), t.band)), t.band));
}

/** 가장 짧은 길로 끝까지 간다 */
function walkOut(plan: Plan, seed: number, band: Band): DrillState {
  const layout = analyze(plan);
  const config = FIRE[band];
  let state = startDrill(plan, seed, config)!;
  assert.ok(state, '연습이 시작되어야 한다');
  const path = shortestPath(layout, state.at)!;
  assert.ok(path, '밖까지 길이 있어야 한다');
  for (const hop of path) {
    const mv = drillMoves(layout, state, config).find((m) => m.to === hop.to);
    assert.ok(mv, `갈 수 있어야 한다: ${hop.to}`);
    assert.equal(mv.hot, false, `시드 ${seed}: 가장 짧은 길이 막히면 안 된다 (${hop.to})`);
    state = moveTo(plan, layout, state, mv, config);
  }
  assert.equal(state.phase, 'outside');
  return finishMeet(plan, layout, state);
}

export function runLogicTests(check: Check): void {
  check('[칸] 선으로 둘러싸면 칸이 하나 생긴다', () => {
    const plan = addEdges(emptyPlan(8, 6), box(1, 1, 3, 3));
    const layout = analyze(plan);
    assert.equal(layout.cells.length, 1);
    assert.equal(layout.cells[0]!.squares.length, 4);
  });

  check('[칸] 한 조각이 빠지면 칸이 아니다', () => {
    const edges = box(1, 1, 3, 3).filter((e) => e !== hKey(1, 1));
    assert.equal(analyze(addEdges(emptyPlan(8, 6), edges)).cells.length, 0);
  });

  check('[칸] 모눈 가장자리를 벽으로 쓸 수 있다', () => {
    assert.equal(analyze(addEdges(emptyPlan(8, 6), box(0, 0, 8, 6))).cells.length, 1);
  });

  check('[칸] 칸 안의 벽을 그으면 둘로 나뉘고 지우면 합쳐진다', () => {
    let plan = addEdges(emptyPlan(8, 6), box(0, 0, 4, 2));
    plan = addEdges(plan, segEdges([[2, 0, 2, 2]]));
    assert.equal(analyze(plan).cells.length, 2);
    plan = removeWall(plan, vKey(2, 0));
    assert.equal(analyze(plan).cells.length, 1);
  });

  check('[칸] 벽이 지워지면 문과 표지도 함께 정리된다', () => {
    let plan = addEdges(emptyPlan(8, 6), box(0, 0, 2, 2));
    const layout = analyze(plan);
    plan = paintCell(plan, layout, layout.cells[0]!.id, { kind: 'room', name: null });
    plan = toggleOpening(plan, analyze(plan), hKey(0, 2), 'door').plan;
    assert.equal(Object.keys(plan.openings).length, 1);
    plan = removeWall(plan, hKey(0, 2));
    assert.equal(Object.keys(plan.openings).length, 0);
    assert.equal(Object.keys(plan.tags).length, 0);
  });

  check('[획] 지나는 점마다 이어지고 되돌아가면 줄어든다', () => {
    let s = extendStroke([], { x: 1, y: 1 });
    s = extendStroke(s, { x: 2, y: 1 });
    s = extendStroke(s, { x: 2, y: 2 });
    assert.equal(s.length, 3);
    s = extendStroke(s, { x: 2, y: 1 });
    assert.equal(s.length, 2);
  });

  check('[획] 멀리 떨어진 점도 가로세로로만 이어진다', () => {
    const s = extendStroke([{ x: 0, y: 0 }], { x: 3, y: 2 });
    assert.equal(s.length, 6);
    for (let i = 1; i < s.length; i++) {
      assert.equal(Math.abs(s[i]!.x - s[i - 1]!.x) + Math.abs(s[i]!.y - s[i - 1]!.y), 1);
    }
    const plan = addStroke(emptyPlan(8, 6), s);
    assert.equal(plan.walls.length, 5);
  });

  check('[획] 포인터가 점에서 멀면 잡지 않는다', () => {
    const plan = emptyPlan(8, 6);
    assert.deepEqual(nearestDot(plan, { x: 1.1, y: 1.1 }), { x: 1, y: 1 });
    assert.equal(nearestDot(plan, { x: 1.5, y: 1.5 }, 0.42), null);
    assert.equal(nearestDot(plan, { x: 20, y: 1 }), null);
  });

  check('[획] 벽 조각 근처를 누르면 그 조각을 찾는다', () => {
    const walls = [hKey(2, 2), vKey(5, 1)];
    assert.equal(nearestEdge(walls, { x: 2.5, y: 2.1 }), hKey(2, 2));
    assert.equal(nearestEdge(walls, { x: 5.1, y: 1.5 }), vKey(5, 1));
    assert.equal(nearestEdge(walls, { x: 8, y: 8 }), null);
  });

  check('[문] 창문은 겉벽에만 달린다', () => {
    let plan = addEdges(emptyPlan(8, 6), [...box(0, 0, 4, 2), ...segEdges([[2, 0, 2, 2]])]);
    const layout = analyze(plan);
    assert.equal(toggleOpening(plan, layout, vKey(2, 0), 'window').ok, false);
    const res = toggleOpening(plan, layout, hKey(0, 0), 'window');
    assert.equal(res.ok, true);
    plan = res.plan;
    assert.equal(plan.openings[hKey(0, 0)], 'window');
  });

  check('[문] 같은 벽을 다시 누르면 뗀다', () => {
    let plan = addEdges(emptyPlan(8, 6), box(0, 0, 2, 2));
    plan = toggleOpening(plan, analyze(plan), hKey(0, 0), 'door').plan;
    plan = toggleOpening(plan, analyze(plan), hKey(0, 0), 'door').plan;
    assert.equal(Object.keys(plan.openings).length, 0);
  });

  check('[문] 겉벽의 문은 밖으로 이어진다', () => {
    let plan = addEdges(emptyPlan(8, 6), box(0, 0, 2, 2));
    plan = toggleOpening(plan, analyze(plan), hKey(0, 2), 'door').plan;
    const layout = analyze(plan);
    assert.equal(isExterior(layout, hKey(0, 2)), true);
    assert.equal(layout.links[0]!.b, OUT);
    assert.equal(unreachableCells(layout).length, 0);
  });

  check('[표시] 만나는 곳은 집 밖, 나머지는 집 안에만 놓인다', () => {
    const plan = addEdges(emptyPlan(8, 6), box(1, 1, 4, 4));
    const layout = analyze(plan);
    assert.equal(placeMark(plan, layout, 'meet', { x: 2, y: 2 }).ok, false);
    assert.equal(placeMark(plan, layout, 'meet', { x: 6, y: 5 }).ok, true);
    assert.equal(placeMark(plan, layout, 'me', { x: 6, y: 5 }).ok, false);
    assert.equal(placeMark(plan, layout, 'me', { x: 2.2, y: 2.7 }).ok, true);
  });

  check('[표시] 칸이 없어지면 표시도 사라진다', () => {
    let plan = addEdges(emptyPlan(8, 6), box(1, 1, 4, 4));
    plan = placeMark(plan, analyze(plan), 'me', { x: 2, y: 2 }).plan;
    assert.ok(plan.marks.me);
    plan = removeWall(plan, hKey(1, 1));
    assert.equal(plan.marks.me, undefined);
  });

  check('[길] 문이 있는 칸으로만 이어진다', () => {
    let plan = addEdges(emptyPlan(8, 6), [...box(0, 0, 4, 2), ...segEdges([[2, 0, 2, 2]])]);
    plan = placeMark(plan, analyze(plan), 'me', { x: 0.5, y: 0.5 }).plan;
    let layout = analyze(plan);
    assert.equal(tapRoute(plan, layout, 'route', '2,0').result, 'no-way');
    plan = toggleOpening(plan, layout, vKey(2, 0), 'door').plan;
    plan = toggleOpening(plan, analyze(plan), hKey(3, 2), 'door').plan;
    layout = analyze(plan);
    const a = tapRoute(plan, layout, 'route', '3,1');
    assert.equal(a.result, 'added');
    const b = tapRoute(a.plan, layout, 'route', OUT);
    assert.equal(b.result, 'done');
    assert.equal(b.plan.route[b.plan.route.length - 1], OUT);
    assert.deepEqual(routeCandidates(b.plan, layout, 'route'), []);
  });

  check('[길] 지나온 칸을 누르면 되돌아간다', () => {
    let plan = addEdges(emptyPlan(8, 6), [...box(0, 0, 4, 2), ...segEdges([[2, 0, 2, 2]])]);
    plan = placeMark(plan, analyze(plan), 'me', { x: 0.5, y: 0.5 }).plan;
    plan = toggleOpening(plan, analyze(plan), vKey(2, 0), 'door').plan;
    const layout = analyze(plan);
    const a = tapRoute(plan, layout, 'route', '2,0');
    const back = tapRoute(a.plan, layout, 'route', '0,0');
    assert.equal(back.result, 'start');
    assert.equal(back.plan.route.length, 1);
  });

  check('[길] 벽이 바뀌어 끊기면 끊긴 뒤를 버린다', () => {
    let plan = autoAll(TEMPLATES[0]!);
    assert.equal(plan.route[plan.route.length - 1], OUT);
    const edge = Object.keys(plan.openings)[0]!;
    plan = removeWall(plan, edge);
    assert.notEqual(plan.route[plan.route.length - 1], OUT);
  });

  check('[길] 그린 선은 벽을 뚫지 않는다', () => {
    for (const t of TEMPLATES) {
      const plan = autoAll(t);
      const layout = analyze(plan);
      const pts = routePoints(plan, layout, plan.route);
      assert.ok(pts.length >= 2, t.id);
      const solid = new Set(plan.walls.filter((w) => plan.openings[w] !== 'door'));
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        for (let r = 0.02; r < 1; r += 0.02) {
          const p = { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r };
          const near = nearestEdge(solid, p, 0.01);
          assert.equal(near, null, `${t.id}: ${JSON.stringify(p)} 가 벽 ${near} 을 지난다`);
        }
      }
    }
  });

  check('[화살표] 그 방향에 있는 문을 고르고, 없으면 고르지 않는다', () => {
    const from = { x: 2.5, y: 2.5 };
    const up = { edge: hKey(2, 1), to: 'a' };
    const right = { edge: vKey(4, 2), to: 'b' };
    assert.equal(pickByArrow(from, [up, right], 'up'), up);
    assert.equal(pickByArrow(from, [up, right], 'right'), right);
    assert.equal(pickByArrow(from, [up, right], 'down'), null);
    assert.equal(pickByArrow(from, [up, right], 'left'), null);
  });

  /** 네모 (x1,y1)-(x2,y2) 의 오른쪽 위 모서리를 대각선으로 깎은 집 */
  const cutHouse = (): string[] => [
    hKey(0, 0), hKey(1, 0), dKey(2, 0), vKey(3, 1), vKey(3, 2),
    hKey(0, 3), hKey(1, 3), hKey(2, 3), vKey(0, 0), vKey(0, 1), vKey(0, 2),
  ];

  check('[대각선] 두 점을 비스듬히 이으면 대각선 벽 조각이 된다', () => {
    assert.equal(edgeBetween({ x: 2, y: 1 }, { x: 3, y: 2 }), dKey(2, 1));
    assert.equal(edgeBetween({ x: 3, y: 2 }, { x: 2, y: 1 }), dKey(2, 1));
    assert.equal(edgeBetween({ x: 2, y: 2 }, { x: 3, y: 1 }), uKey(2, 1));
    assert.equal(edgeBetween({ x: 3, y: 1 }, { x: 2, y: 2 }), uKey(2, 1));
    assert.deepEqual(extendStroke([{ x: 0, y: 0 }], { x: 2, y: 2 }), [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]);
    assert.deepEqual(extendStroke([{ x: 0, y: 0 }], { x: 1, y: 1 }, false), [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]);
  });

  check('[대각선] 곧게 끈 손만 대각선이고 모서리를 돌던 손은 아니다', () => {
    const a = { x: 2, y: 1 };
    const b = { x: 3, y: 2 };
    assert.equal(wasDiagonalDrag(a, b, []), true);
    assert.equal(wasDiagonalDrag(a, b, [{ x: 2.4, y: 1.5 }, { x: 2.5, y: 1.4 }, { x: 2.7, y: 1.8 }]), true, '조금 흔들려도 대각선');
    assert.equal(wasDiagonalDrag(a, b, [{ x: 2.6, y: 1.2 }, { x: 2.9, y: 1.6 }]), false, '가로로 가다 내려오면 꺾임');
    assert.equal(wasDiagonalDrag(a, { x: 4, y: 2 }, []), false, '45도가 아니면 대각선이 아니다');
  });

  check('[대각선] 겉벽을 깎으면 안쪽 세모만 칸이고 바깥 세모는 집 밖이다', () => {
    const plan = addEdges(emptyPlan(5, 4), cutHouse());
    const layout = analyze(plan);
    assert.equal(layout.cells.length, 1);
    const cell = layout.cells[0]!;
    assert.equal(cell.squares.length, 9, '네모 8 + 세모 1');
    assert.ok(layout.cellAt.has('2,0:sw'), '안쪽 세모');
    assert.ok(!layout.cellAt.has('2,0:ne'), '바깥 세모');
    assert.ok(!layout.cellAt.has('2,0'), '나뉜 네모는 통째로 없다');
    assert.equal(cellIdAt(layout, { x: 2.8, y: 0.2 }), undefined);
    assert.equal(cellIdAt(layout, { x: 2.2, y: 0.8 }), cell.id);
    assert.ok(isExterior(layout, dKey(2, 0)));
  });

  check('[대각선] 네모 안 대각선이 칸을 둘로 나눈다', () => {
    const edges = [hKey(0, 0), hKey(0, 1), vKey(0, 0), vKey(1, 0), dKey(0, 0)];
    const layout = analyze(addEdges(emptyPlan(3, 3), edges));
    assert.equal(layout.cells.length, 2);
    assert.ok(isInterior(layout, dKey(0, 0)));
  });

  check('[대각선] 대각선 벽에 문을 달면 그 문으로 지나간다', () => {
    let plan = addEdges(emptyPlan(5, 4), cutHouse());
    let layout = analyze(plan);
    const window = toggleOpening(plan, layout, dKey(2, 0), 'window');
    assert.equal(window.ok, true, '겉벽 대각선에 창문');
    const door = toggleOpening(plan, layout, dKey(2, 0), 'door');
    assert.equal(door.ok, true);
    plan = door.plan;
    layout = analyze(plan);
    assert.deepEqual(layout.links.map((l) => l.b), [OUT], '밖으로 이어진다');
    plan = placeMark(plan, layout, 'me', { x: 0.5, y: 2.5 }).plan;
    layout = analyze(plan);
    const route = tapRoute(plan, layout, 'route', OUT);
    assert.equal(route.result, 'done');
    const points = routePoints(route.plan, layout, route.plan.route);
    assert.deepEqual(points[points.length - 2], { x: 2.5, y: 0.5 }, '대각선 가운데를 지난다');
    const end = points[points.length - 1]!;
    assert.equal(cellIdAt(layout, end), undefined, '문 밖 세모로 나선다');
    assert.ok(end.x > 2.5 && end.y < 0.5);
  });

  check('[대각선] 칸 안에서 걸어도 대각선 벽을 뚫지 않는다', () => {
    const edges = [...box(0, 0, 3, 3), dKey(1, 1)];
    let plan = addEdges(emptyPlan(4, 4), edges);
    plan = toggleOpening(plan, analyze(plan), hKey(2, 3), 'door').plan;
    plan = placeMark(plan, analyze(plan), 'me', { x: 1.8, y: 1.2 }).plan;
    const layout = analyze(plan);
    assert.equal(layout.cells.length, 1, '닫히지 않은 대각선은 칸을 나누지 않는다');
    assert.equal(pieceKeyAt(layout, plan.marks.me!), '1,1:ne');
    const route = tapRoute(plan, layout, 'route', OUT).plan;
    const points = routePoints(route, layout, route.route);
    for (let i = 1; i < points.length; i++) {
      for (let t = 0; t <= 1; t += 0.02) {
        const x = points[i - 1]!.x + (points[i]!.x - points[i - 1]!.x) * t;
        const y = points[i - 1]!.y + (points[i]!.y - points[i - 1]!.y) * t;
        const onWall = x > 1 && x < 2 && y > 1 && y < 2 && Math.abs(x - 1 - (y - 1)) < 0.001;
        assert.ok(!onWall, `대각선을 뚫었다: ${x},${y}`);
      }
    }
  });

  check('[대각선] 한 네모에 대각선은 하나 — 나중에 그은 쪽이 남는다', () => {
    let plan = addStroke(emptyPlan(4, 4), [{ x: 1, y: 1 }, { x: 2, y: 2 }]);
    assert.deepEqual(plan.walls, [dKey(1, 1)]);
    plan = addStroke(plan, [{ x: 1, y: 2 }, { x: 2, y: 1 }]);
    assert.deepEqual(plan.walls, [uKey(1, 1)]);
  });

  check('[대각선] 표시가 벽에 걸리지 않고, 표지가 대각선을 긋고 지워도 남는다', () => {
    let plan = addEdges(emptyPlan(4, 4), box(0, 0, 3, 3));
    plan = paintCell(plan, analyze(plan), analyze(plan).cells[0]!.id, { kind: 'room', name: null });
    plan = placeMark(plan, analyze(plan), 'me', { x: 1.5, y: 1.5 }).plan;
    plan = addStroke(plan, [{ x: 1, y: 1 }, { x: 2, y: 2 }]);
    const layout = analyze(plan);
    assert.notDeepEqual(plan.marks.me, { x: 1.5, y: 1.5 }, '대각선 위에 남지 않는다');
    assert.deepEqual(plan.marks.me, pieceCenter(pieceKeyAt(layout, plan.marks.me!)));
    assert.equal(layout.cells[0]!.kind, 'room', '칠한 것이 남는다');
    plan = removeWall(plan, dKey(1, 1));
    assert.equal(analyze(plan).cells[0]!.kind, 'room', '지워도 남는다');
  });

  check('[대각선] 학년 단계마다 비스듬한 집 본이 있고 칸이 닫힌다', () => {
    for (const id of ['low-cut', 'mid-cut', 'high-cut']) {
      const t = TEMPLATES.find((x) => x.id === id)!;
      const band = BANDS[t.band];
      const edges = segEdges(t.outer);
      assert.ok(edges.some((k) => k.startsWith('d:') || k.startsWith('u:')), `${id}: 대각선이 없다`);
      const layout = analyze(addEdges(emptyPlan(band.cols, band.rows), [...edges, ...segEdges(t.inner)]));
      assert.ok(layout.cells.length >= 3, `${id}: 칸 ${layout.cells.length}개`);
    }
  });

  check('[화살표] 같은 쪽에 문이 둘이면 밖으로 나가는 문이 먼저이고 다른 문도 닿는다', () => {
    const from = { x: 3.5, y: 2.5 };
    const near = { edge: hKey(3, 4), to: 'a' };
    const exit = { edge: hKey(5, 4), to: OUT };
    const map = arrowMap(from, [near, exit]);
    assert.ok(Object.values(map).includes(exit), '밖으로 나가는 문에 화살표가 있다');
    assert.ok(Object.values(map).includes(near), '다른 문도 화살표가 있다');
    // 정면이 겹치면 밖으로 나가는 문이 그 방향을 갖는다
    const under = { edge: hKey(3, 4), to: OUT };
    const also = { edge: hKey(4, 4), to: 'a' };
    assert.equal(arrowMap({ x: 3.5, y: 2.5 }, [also, under]).down, under);
  });

  check('[화살표] 시작 본 전종에서 화살표만으로 밖까지 나갈 수 있다', () => {
    const dirs: ArrowDir[] = ['up', 'down', 'left', 'right'];
    for (const t of TEMPLATES) {
      const plan = autoAll(t);
      const layout = analyze(plan);
      for (const seed of [0, 1, 2]) {
        const config = FIRE[t.band];
        let state = startDrill(plan, seed, config)!;
        for (const hop of shortestPath(layout, state.at)!) {
          const moves = drillMoves(layout, state, config);
          const target = moves.find((m) => m.to === hop.to)!;
          const dir = dirs.find((d) => pickByArrow(state.pt, moves, d)?.edge === target.edge);
          assert.ok(dir, `${t.id} seed ${seed}: ${hop.to} 로 가는 화살표가 없다`);
          state = moveTo(plan, layout, state, target, config);
        }
        assert.equal(state.phase, 'outside', t.id);
      }
    }
  });

  check('[길] 꺾은선을 비율로 읽는다', () => {
    const pts = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }];
    assert.deepEqual(pointAlong(pts, 0.25), { x: 1, y: 0 });
    assert.deepEqual(pointAlong(pts, 1), { x: 2, y: 2 });
  });

  check('[도와줘] 빈 곳만 채우고 해 둔 것을 지우지 않는다', () => {
    let plan = fromTemplate(templatesFor('mid')[0]!);
    const layout = analyze(plan);
    const first = layout.cells[0]!.id;
    plan = paintCell(plan, layout, first, { kind: 'pass', name: 'hall' });
    const after = analyze(autoTag(plan, 'mid'));
    assert.equal(after.byId.get(first)!.name, 'hall');
    assert.ok(after.cells.every((c) => c.kind));
  });

  check('[도와줘] 칸이 있으면 언제나 지나가는 곳이 생긴다', () => {
    for (const t of TEMPLATES.filter((x) => x.inner.length)) {
      const cells = analyze(autoTag(fromTemplate(t), t.band)).cells;
      assert.ok(cells.some((c) => c.kind === 'pass'), t.id);
      assert.ok(cells.some((c) => c.kind === 'room'), t.id);
    }
  });

  check('[본] 모든 본이 칸 2개 이상으로 닫힌다', () => {
    for (const t of TEMPLATES) {
      const cells = analyze(fromTemplate(t)).cells;
      assert.ok(cells.length >= 2, `${t.id}: 칸 ${cells.length}개`);
    }
  });

  check('[본] 겉모양만 그려도 칸 하나로 닫힌다', () => {
    for (const t of TEMPLATES) {
      const info = BANDS[t.band];
      assert.equal(analyze(addEdges(emptyPlan(info.cols, info.rows), segEdges(t.outer))).cells.length, 1, t.id);
    }
  });

  check('[본] 모눈 안에 들어간다', () => {
    for (const t of TEMPLATES) {
      const edges = [...segEdges(t.outer), ...segEdges(t.inner)];
      assert.equal(fromTemplate(t).walls.length, new Set(edges).size, t.id);
    }
  });

  check('[단계] 학년이 세 단계로 나뉜다', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(bandOfGrade), ['low', 'low', 'mid', 'mid', 'high', 'high']);
  });

  check('[단계] 높을수록 지도에 담는 것이 늘어난다', () => {
    assert.ok(BANDS.low.marks.length < BANDS.mid.marks.length);
    assert.ok(BANDS.mid.marks.length < BANDS.high.marks.length);
    assert.ok(BANDS.low.cols < BANDS.mid.cols && BANDS.mid.cols < BANDS.high.cols);
  });

  check('[대피] 시작 본 전종 × 시드 100 — 시작하자마자 이길 수 없는 판이 없다', () => {
    for (const t of TEMPLATES) {
      const plan = autoAll(t);
      for (let seed = 0; seed < 100; seed++) {
        const done = walkOut(plan, seed, t.band);
        assert.equal(done.end, 'meet', `${t.id} seed ${seed}`);
        assert.notEqual(done.source, analyze(plan).cellAt.get(sqKey(Math.floor(plan.marks.me!.x), Math.floor(plan.marks.me!.y))), `${t.id} seed ${seed}: 내 칸에서 시작하면 안 된다`);
      }
    }
  });

  check('[대피] 칸이 하나뿐인 집도 나갈 수 있다', () => {
    let plan = addEdges(emptyPlan(8, 6), box(1, 1, 4, 4));
    plan = autoRoute(autoMarks(autoDoors(autoTag(plan, 'low')), 'low'));
    const done = walkOut(plan, 3, 'low');
    assert.equal(done.end, 'meet');
  });

  check('[대피] 같은 시드는 같은 판이다', () => {
    const plan = autoAll(templatesFor('mid')[0]!);
    const layout = analyze(plan);
    const start = layout.cellAt.get(sqKey(Math.floor(plan.marks.me!.x), Math.floor(plan.marks.me!.y)))!;
    const config = FIRE.mid;
    assert.deepEqual(pickSource(plan, layout, start, 7, config), pickSource(plan, layout, start, 7, config));
  });

  check('[대피] 닫힌 문은 번짐을 늦춘다', () => {
    const p = FIRE.high.params;
    const open = stepField({ a: 100 }, [{ a: 'a', b: 'b', closed: false }], ['a'], p);
    const shut = stepField({ a: 100 }, [{ a: 'a', b: 'b', closed: true }], ['a'], p);
    assert.ok(open.b! > shut.b!);
  });

  check('[대피] 뜨거운 문을 만지면 기억하고 잘한 점에 남는다', () => {
    const plan = autoAll(templatesFor('mid')[0]!);
    const layout = analyze(plan);
    const config = FIRE.mid;
    let state = startDrill(plan, 1, config)!;
    const mv = drillMoves(layout, state, config)[0]!;
    state = touchDoor(state, { ...mv, hot: true });
    assert.deepEqual(state.knownHot, [mv.edge]);
    assert.equal(state.stats.hotAvoided, 1);
    state = { ...state, end: 'rescue', phase: 'over' };
    assert.ok(buildReport(state, plan, 'mid').praises.includes('touch'));
  });

  check('[대피] 갈 곳이 모두 막히면 구조 요청으로 끝난다', () => {
    const plan = autoAll(templatesFor('low')[0]!);
    const layout = analyze(plan);
    const config = FIRE.low;
    const state = startDrill(plan, 1, config)!;
    const field: Record<string, number> = {};
    for (const c of layout.cells) field[c.id] = 100;
    field[state.at] = 0;
    // 밖으로 바로 나가는 칸이면 막히지 않는다
    const direct = drillMoves(layout, state, config).some((m) => m.to === OUT);
    assert.equal(isTrapped(layout, { ...state, field }, config), !direct);
    assert.equal(isTrapped(layout, { ...state, field: { ...field, [state.at]: 100 } }, config), true);
  });

  check('[대피] 문을 닫으면 기록에 남고 지나가면 다시 열린다', () => {
    const plan = autoAll(templatesFor('high')[0]!);
    const layout = analyze(plan);
    const config = FIRE.high;
    let state = startDrill(plan, 2, config)!;
    const mv = drillMoves(layout, state, config).find((m) => !m.hot && m.to !== OUT)!;
    state = moveTo(plan, layout, state, mv, config);
    const door = state.lastDoor!;
    state = closeLastDoor(state);
    assert.ok(state.closed.includes(door));
    assert.ok(state.timeline[state.timeline.length - 1]!.closed.includes(door));
    assert.equal(state.stats.doorsClosed, 1);
    const back = drillMoves(layout, state, config).find((m) => m.edge === door)!;
    state = moveTo(plan, layout, state, { ...back, hot: false }, config);
    assert.ok(!state.closed.includes(door));
  });

  check('[대피] 낮춘 자세가 잘한 점과 고칠 점을 가른다', () => {
    const plan = autoAll(templatesFor('low')[0]!);
    const layout = analyze(plan);
    const config = FIRE.low;
    const hazy = (s: DrillState): DrillState => ({ ...s, field: Object.fromEntries(layout.cells.map((c) => [c.id, 30])) });
    const go = (crouch: boolean): DrillState => {
      let state = setCrouch(hazy(startDrill(plan, 4, config)!), crouch);
      const mv = drillMoves(layout, state, config).find((m) => m.to !== OUT)!;
      state = moveTo(plan, layout, state, mv, config);
      return { ...state, phase: 'over', end: 'meet' };
    };
    assert.ok(buildReport(go(true), plan, 'low').praises.includes('crouch'));
    assert.ok(buildReport(go(false), plan, 'low').fixes.includes('crouch'));
  });

  check('[돌아보기] 잘한 점은 하나 이상, 고칠 점은 세 개까지', () => {
    for (const band of ['low', 'mid', 'high'] as Band[]) {
      const plan = autoAll(templatesFor(band)[0]!);
      const state = startDrill(plan, 5, FIRE[band])!;
      const worst: DrillState = {
        ...state,
        end: 'rescue',
        phase: 'over',
        stats: { ...state.stats, stoodInHazard: 5 },
      };
      const r = buildReport(worst, plan, band);
      assert.ok(r.praises.length >= 1, band);
      assert.ok(r.fixes.length <= 3, band);
      const empty = buildReport({ ...state, end: null }, plan, band);
      assert.ok(empty.praises.length >= 1, band);
    }
  });

  check('[둘째 길] 첫째 길의 문을 쓰지 않고, 없으면 만들지 않는다', () => {
    let plan = autoAll(templatesFor('high')[0]!);
    const layout = analyze(plan);
    assert.equal(findSecondRoute(plan), null);
    // 내 자리 칸의 다른 벽에 밖으로 나가는 문을 하나 더 내면 둘째 길이 생긴다
    const me = plan.marks.me!;
    const myCell = layout.byId.get(layout.cellAt.get(sqKey(Math.floor(me.x), Math.floor(me.y)))!)!;
    const outer = plan.walls.find((e) => isExterior(layout, e) && !plan.openings[e] && (e.startsWith('h:') || e.startsWith('v:')) && edgeTouches(e, myCell.squares));
    assert.ok(outer, '내 칸에 겉벽이 있어야 한다');
    plan = toggleOpening(plan, layout, outer, 'door').plan;
    const withSecond = autoRoute2(plan);
    assert.equal(withSecond.route2[withSecond.route2.length - 1], OUT);
    assert.notDeepEqual(withSecond.route2, withSecond.route);
  });

  check('[저장] 고른 지도를 정리해도 그대로다', () => {
    for (const t of TEMPLATES) {
      const plan = autoAll(t);
      assert.deepEqual(normalize(plan), plan, t.id);
      assert.deepEqual(JSON.parse(JSON.stringify(plan)), plan, t.id);
    }
  });
}

function edgeTouches(edge: string, squares: { x: number; y: number }[]): boolean {
  const [o, xs, ys] = edge.split(':');
  const x = Number(xs);
  const y = Number(ys);
  return squares.some((s) =>
    o === 'h' ? s.x === x && (s.y === y || s.y === y - 1) : s.y === y && (s.x === x || s.x === x - 1),
  );
}
