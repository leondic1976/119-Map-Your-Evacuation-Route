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
import { fitFurniture } from '../src/core/furnish';
import { analyze, cellIdAt, dKey, edgeBetween, edgeKeys, hKey, isExterior, isInterior, pieceCenter, pieceKeyAt, segmentEdges, shortestPath, sqKey, uKey, unreachableCells, vKey } from '../src/core/grid';
import { stepField } from '../src/core/hazard';
import { arrowMap, pickByArrow, pointAlong, routePoints, type ArrowDir } from '../src/core/path';
import { buildReport } from '../src/core/report';
import { DRAG_RADIUS, dragDots, dragMove, extendStroke, nearestDot, nearestEdge, startDrag, wasStraightDrag } from '../src/core/stroke';
import { clampView, fullView, panBy, viewBoxOf, zoomAround, ZOOM_MAX } from '../src/core/zoom';
import { OUT, type Band, type Plan, type Pt } from '../src/core/types';
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

  check('[획] 곧지 않게 온 손은 가로세로로 꺾어 잇는다', () => {
    const s = extendStroke([{ x: 0, y: 0 }], { x: 3, y: 2 }, false);
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
    assert.deepEqual(extendStroke([{ x: 0, y: 0 }], { x: 3, y: 2 }), [{ x: 0, y: 0 }, { x: 3, y: 2 }], '먼 점은 곧게 잇는다');
  });

  check('[대각선] 곧게 끈 손만 대각선이고 모서리를 돌던 손은 아니다', () => {
    const a = { x: 2, y: 1 };
    const b = { x: 3, y: 2 };
    assert.equal(wasStraightDrag(a, b, []), true);
    assert.equal(wasStraightDrag(a, b, [{ x: 2.4, y: 1.5 }, { x: 2.5, y: 1.4 }, { x: 2.7, y: 1.8 }]), true, '조금 흔들려도 대각선');
    assert.equal(wasStraightDrag(a, b, [{ x: 2.6, y: 1.2 }, { x: 2.9, y: 1.6 }]), false, '가로로 가다 내려오면 꺾임');
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
    const end = points[points.length - 1]!;
    const last = points[points.length - 2]!;
    const across = (end.x - last.x) * (0.5 - last.y) - (end.y - last.y) * (2.5 - last.x);
    assert.ok(Math.abs(across) < 1e-6, '대각선 가운데를 지난다');
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

  check('[대각선] 한 네모에 X 자로 그으면 네 조각으로 나뉜다', () => {
    let plan = addEdges(emptyPlan(4, 4), [hKey(1, 1), hKey(1, 2), vKey(1, 1), vKey(2, 1)]);
    plan = addStroke(plan, [{ x: 1, y: 1 }, { x: 2, y: 2 }]);
    plan = addStroke(plan, [{ x: 1, y: 2 }, { x: 2, y: 1 }]);
    assert.ok(plan.walls.includes(dKey(1, 1)) && plan.walls.includes(uKey(1, 1)), '둘 다 남는다');
    const layout = analyze(plan);
    assert.equal(layout.cells.length, 4);
    assert.ok(layout.cells.every((c) => Math.abs(c.area - 0.25) < 1e-6));
  });

  /** 조각 넓이의 합 */
  const areaOf = (plan: Plan): number => analyze(plan).cells.reduce((sum, c) => sum + c.area, 0);

  /** 꺾은선이 벽을 뚫지 않는가. 문은 지나갈 수 있다 */
  const assertNoCrossing = (plan: Plan, label: string, points: Pt[]): void => {
    const layout = analyze(plan);
    const solid = edgeKeys(layout).filter((k) => plan.openings[k] !== 'door');
    for (let i = 1; i < points.length; i++) {
      for (let r = 0.01; r < 1; r += 0.01) {
        const p = { x: points[i - 1]!.x + (points[i]!.x - points[i - 1]!.x) * r, y: points[i - 1]!.y + (points[i]!.y - points[i - 1]!.y) * r };
        const near = nearestEdge(solid, p, 0.004);
        assert.equal(near, null, `${label}: ${JSON.stringify(p)} 가 벽 ${near} 을 지난다`);
      }
    }
  };

  check('[각도] 어떤 두 점이든 곧게 이어진다', () => {
    assert.equal(edgeBetween({ x: 0, y: 0 }, { x: 2, y: 1 }), 's:0:0:2:1');
    assert.equal(edgeBetween({ x: 2, y: 1 }, { x: 0, y: 0 }), 's:0:0:2:1', '방향과 상관없다');
    assert.deepEqual(segmentEdges({ x: 0, y: 0 }, { x: 4, y: 2 }), ['s:0:0:2:1', 's:2:1:4:2'], '줄 위의 점에서 나뉜다');
    assert.deepEqual(segmentEdges({ x: 0, y: 0 }, { x: 2, y: 2 }), [dKey(0, 0), dKey(1, 1)], '45도는 지금 열쇠 그대로다');
    assert.deepEqual(segmentEdges({ x: 0, y: 0 }, { x: 3, y: 0 }), [hKey(0, 0), hKey(1, 0), hKey(2, 0)]);
    assert.deepEqual(addStroke(emptyPlan(8, 6), [{ x: 1, y: 1 }, { x: 4, y: 3 }]).walls, ['s:1:1:4:3']);
  });

  check('[각도] 비스듬한 벽으로 닫으면 넓이가 정확한 칸이 된다', () => {
    // 밑변 3 · 높이 2 인 직각 세모 — 넓이 3
    const plan = addEdges(emptyPlan(5, 4), [...segEdges([[0, 0, 3, 0], [0, 0, 0, 2]]), ...segmentEdges({ x: 3, y: 0 }, { x: 0, y: 2 })]);
    const layout = analyze(plan);
    assert.equal(layout.cells.length, 1);
    assert.ok(Math.abs(layout.cells[0]!.area - 3) < 1e-6, String(layout.cells[0]!.area));
    assert.equal(cellIdAt(layout, { x: 0.5, y: 0.5 }), layout.cells[0]!.id);
    assert.equal(cellIdAt(layout, { x: 2.5, y: 1.5 }), undefined, '빗변 바깥');
    assert.equal(cellIdAt(layout, { x: 1.5, y: 0.5 }), layout.cells[0]!.id, '빗변 안쪽');
    assert.ok(isExterior(layout, 's:0:2:3:0'));
    for (const c of layout.cells) for (const s of c.squares) assert.ok(pieceKeyAt(layout, s.center) === s.key, s.key);
  });

  check('[각도] 칸은 점이 닿은 자리로 새지 않고, 벽 틈으로만 샌다', () => {
    const open = addEdges(emptyPlan(5, 4), [...segEdges([[0, 0, 3, 0]]), ...segmentEdges({ x: 3, y: 0 }, { x: 0, y: 2 })]);
    assert.equal(analyze(open).cells.length, 0, '한 변이 비면 칸이 아니다');
  });

  check('[각도] 문을 달고 칸 안을 걸어도 비스듬한 벽을 뚫지 않는다', () => {
    let plan = addEdges(emptyPlan(8, 6), [...box(0, 0, 6, 4), ...segmentEdges({ x: 1, y: 0 }, { x: 4, y: 2 })]);
    assert.equal(analyze(plan).cells.length, 1, '닫지 않은 벽은 나누지 않는다');
    plan = toggleOpening(plan, analyze(plan), hKey(5, 4), 'door').plan;
    plan = placeMark(plan, analyze(plan), 'me', { x: 3, y: 0.5 }).plan;
    const layout = analyze(plan);
    const route = tapRoute(plan, layout, 'route', OUT);
    assert.equal(route.result, 'done');
    assertNoCrossing(route.plan, '칸 안', routePoints(route.plan, layout, route.plan.route));
  });

  check('[각도] 비스듬한 벽에 문을 달면 지나가고 밖으로 나선다', () => {
    let plan = addEdges(emptyPlan(6, 5), [...segEdges([[0, 0, 3, 0], [0, 0, 0, 3], [0, 3, 2, 3]]), ...segmentEdges({ x: 3, y: 0 }, { x: 2, y: 3 })]);
    const layout = analyze(plan);
    assert.equal(layout.cells.length, 1);
    plan = toggleOpening(plan, layout, 's:2:3:3:0', 'door').plan;
    assert.deepEqual(analyze(plan).links.map((l) => l.b), [OUT]);
    assert.ok(toggleOpening(plan, analyze(plan), hKey(0, 3), 'window').ok);
    plan = placeMark(plan, analyze(plan), 'me', { x: 0.5, y: 0.5 }).plan;
    const next = analyze(plan);
    const route = tapRoute(plan, next, 'route', OUT).plan;
    const points = routePoints(route, next, route.route);
    assert.equal(cellIdAt(next, points[points.length - 1]!), undefined, '밖에서 끝난다');
    assertNoCrossing(route, '문으로', points);
  });

  check('[각도] 엇갈린 벽은 토막마다 따로 문을 달고, 칸 넷으로 나뉜다', () => {
    let plan = addEdges(emptyPlan(4, 4), box(0, 0, 3, 3));
    plan = addEdges(plan, [...segmentEdges({ x: 0, y: 1 }, { x: 3, y: 2 }), ...segmentEdges({ x: 1, y: 0 }, { x: 2, y: 3 })]);
    const layout = analyze(plan);
    assert.equal(layout.cells.length, 4);
    const pieces = edgeKeys(layout).filter((k) => k.startsWith('s:'));
    assert.equal(pieces.length, 4, '두 벽이 두 토막씩');
    assert.ok(Math.abs(layout.cells.reduce((sum, c) => sum + c.area, 0) - 9) < 1e-6);
    const first = toggleOpening(plan, layout, pieces[0]!, 'door');
    assert.equal(first.ok, true);
    assert.deepEqual(Object.keys(first.plan.openings), [pieces[0]], '토막 하나에만 달린다');
    assert.equal(analyze(first.plan).links.length, 1);
    const erased = removeWall(first.plan, pieces[0]!);
    assert.equal(Object.keys(erased.openings).length, 0, '벽을 지우면 문도 지운다');
    assert.equal(analyze(erased).cells.length, 2);
  });

  check('[각도] 집 밖으로 삐져나온 꼬리는 그리지 않고 문도 달리지 않는다', () => {
    // 비스듬한 지붕 아래 칸을 세로 벽으로 나눈다. 점이 지붕 위에 없어 넘겨 긋는다
    const roof = [...segEdges([[0, 1, 0, 3], [0, 3, 2, 3], [2, 3, 2, 0]]), ...segmentEdges({ x: 0, y: 1 }, { x: 2, y: 0 })];
    const plan = addEdges(emptyPlan(4, 4), [...roof, ...segEdges([[1, 3, 1, 0]])]);
    const layout = analyze(plan);
    assert.equal(layout.cells.length, 2, '넘겨 그어도 칸이 나뉜다');
    const tail = [...layout.edges.values()].find((e) => e.hidden);
    assert.ok(tail, '지붕 위 꼬리');
    assert.ok(tail.mid.y < 0.5);
    assert.ok(!edgeKeys(layout).includes(tail.key));
    const stem = [...layout.edges.values()].find((e) => e.wall === vKey(1, 0) && !e.hidden)!;
    assert.ok(isInterior(layout, stem.key));
    const placed = toggleOpening(plan, layout, stem.key, 'door').plan;
    assert.equal(analyze(placed).links.length, 1, '남은 토막에 문을 단다');
  });

  check('[각도] 벽이 나중에 엇갈려도 문이 자리를 지킨다', () => {
    let plan = addEdges(emptyPlan(5, 5), box(0, 0, 3, 3));
    plan = addEdges(plan, segmentEdges({ x: 0, y: 1 }, { x: 3, y: 2 }));
    assert.equal(analyze(plan).cells.length, 2);
    const wall = 's:0:1:3:2';
    plan = toggleOpening(plan, analyze(plan), wall, 'door').plan;
    assert.equal(analyze(plan).links.length, 1);
    // 문 바로 옆을 지나지 않는 자리에서 엇갈리게 긋는다
    plan = addEdges(plan, segmentEdges({ x: 1, y: 0 }, { x: 2, y: 3 }));
    const layout = analyze(plan);
    assert.equal(Object.keys(plan.openings).length, 1, '문이 남는다');
    assert.ok(layout.edges.has(Object.keys(plan.openings)[0]!), '토막에 맞춰진다');
    assert.equal(layout.links.length, 1);
  });

  check('[각도] 표시와 표지가 옛 조각에서 새 조각으로 옮겨 간다', () => {
    let plan = addEdges(emptyPlan(5, 5), box(0, 0, 4, 4));
    plan = paintCell(plan, analyze(plan), analyze(plan).cells[0]!.id, { kind: 'room', name: null });
    plan = placeMark(plan, analyze(plan), 'me', { x: 0.5, y: 0.5 }).plan;
    // 칠한 네모를 지나지만 칸을 나누지는 않는 벽
    plan = addEdges(plan, segmentEdges({ x: 0, y: 0 }, { x: 2, y: 1 }));
    let layout = analyze(plan);
    assert.equal(layout.cells.length, 1);
    assert.equal(layout.cells[0]!.kind, 'room', '칠한 것이 남는다');
    assert.ok(cellIdAt(layout, plan.marks.me!), '표시가 칸 안에 남는다');
    assert.deepEqual(plan.marks.me, pieceCenter(pieceKeyAt(layout, plan.marks.me!)));
    assert.ok(Math.abs(areaOf(plan) - 16) < 1e-6, '넓이는 그대로다');
    plan = removeWall(plan, 's:0:0:2:1');
    layout = analyze(plan);
    assert.equal(layout.cells[0]!.kind, 'room', '지워도 남는다');
    assert.ok(layout.cellAt.has('0,0'), '다시 네모 하나다');
  });

  /** 끌기 흉내 — 점과 점 사이를 촘촘히 지나간다 */
  const drag = (plan: Plan, points: Pt[], step = 0.1): Pt[] => {
    let live = startDrag(points[0]!);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step);
      for (let k = 1; k <= n; k++) {
        const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
        live = dragMove(live, p, nearestDot(plan, p, DRAG_RADIUS));
      }
    }
    return dragDots(live);
  };

  check('[끌기] 곧게 끌면 어느 각도든 한 줄이다', () => {
    const plan = emptyPlan(12, 8);
    const start = { x: 2, y: 2 };
    for (const to of [{ x: 4, y: 3 }, { x: 5, y: 3 }, { x: 6, y: 3 }, { x: 3, y: 5 }, { x: 3, y: 6 }, { x: 5, y: 4 }, { x: 7, y: 4 }, { x: 0, y: 5 }, { x: 8, y: 0 }]) {
      const walls = addStroke(plan, drag(plan, [start, to])).walls;
      assert.deepEqual(walls, [...segmentEdges(start, to)].sort(), `${to.x},${to.y}`);
    }
  });

  check('[끌기] 모서리에서 꺾으면 두 줄이고, 옆으로 조금 흔들려도 곧다', () => {
    const plan = emptyPlan(12, 8);
    const corner = drag(plan, [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 4 }]);
    assert.deepEqual(addStroke(plan, corner).walls, [...segEdges([[1, 1, 5, 1], [5, 1, 5, 4]])].sort());
    const wobble = drag(plan, [{ x: 1, y: 1 }, { x: 2.5, y: 1.15 }, { x: 4, y: 0.9 }, { x: 6, y: 1 }]);
    assert.deepEqual(addStroke(plan, wobble).walls, [...segEdges([[1, 1, 6, 1]])].sort(), '가로 벽은 비스듬해지지 않는다');
    const house = drag(plan, [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 4 }, { x: 1, y: 4 }, { x: 1, y: 1 }]);
    assert.equal(analyze(addStroke(plan, house)).cells.length, 1);
    assert.equal(addStroke(plan, house).walls.filter((k) => /^[dus]:/.test(k)).length, 0, '네모 집은 네모다');
  });

  check('[끌기] 모서리를 둥글게 돌아도 깎이지 않고, 되돌아가면 줄어든다', () => {
    const plan = emptyPlan(12, 8);
    const rounded = drag(plan, [{ x: 8, y: 2 }, { x: 8.3, y: 2.05 }, { x: 8.6, y: 2.2 }, { x: 8.8, y: 2.4 }, { x: 8.95, y: 2.7 }, { x: 9, y: 3 }], 0.5);
    assert.equal(addStroke(plan, rounded).walls.filter((k) => /^[dus]:/.test(k)).length, 0);
    const back = drag(plan, [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 3, y: 1 }]);
    assert.deepEqual(back[back.length - 1], { x: 3, y: 1 }, '곧게 되돌아가면 짧아진다');
    const undo = drag(plan, [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 3 }, { x: 4, y: 1 }]);
    assert.equal(undo.length, 4, '꺾은 쪽을 되돌아오면 무른다');
    const whole = drag(plan, [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 3 }, { x: 4, y: 1 }, { x: 1, y: 1 }]);
    assert.equal(whole.length, 1, '시작점까지 돌아오면 아무것도 없다');
  });

  /** 가구 네모의 네 귀 */
  const cornersOf = (spot: { x: number; y: number; front: Pt }, hw: number, hd: number): Pt[] => {
    const side = { x: spot.front.y, y: -spot.front.x };
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({
      x: spot.x + side.x * a! * hw + spot.front.x * b! * hd,
      y: spot.y + side.y * a! * hw + spot.front.y * b! * hd,
    }));
  };

  const assertFits = (plan: Plan, cellId: string, spot: NonNullable<ReturnType<typeof fitFurniture>>, w: number, d: number, label: string): void => {
    const layout = analyze(plan);
    const hw = ((spot.sideways ? d : w) * spot.scale) / 2;
    const hd = ((spot.sideways ? w : d) * spot.scale) / 2;
    const corners = cornersOf(spot, hw, hd);
    for (const c of corners) assert.equal(cellIdAt(layout, c), cellId, `${label}: 귀가 칸 밖 ${JSON.stringify(c)}`);
    corners.forEach((c, i) => {
      const next = corners[(i + 1) % 4]!;
      for (let r = 0; r <= 1; r += 0.05) {
        const p = { x: c.x + (next.x - c.x) * r, y: c.y + (next.y - c.y) * r };
        assert.equal(nearestEdge(edgeKeys(layout), p, 0.03), null, `${label}: 벽에 닿는다`);
      }
    });
  };

  check('[가구] 세모 칸에도 벽을 뚫지 않고 들어간다', () => {
    const shapes: [string, string[]][] = [
      ['대각선 한 네모', [hKey(0, 0), vKey(1, 0), dKey(0, 0)]],
      ['작은 세모', segEdges([[0, 0, 2, 0], [0, 0, 0, 2]]).concat(segmentEdges({ x: 2, y: 0 }, { x: 0, y: 2 }))],
      ['얕은 세모', segEdges([[0, 0, 3, 0], [0, 0, 0, 2]]).concat(segmentEdges({ x: 3, y: 0 }, { x: 0, y: 2 }))],
      ['큰 세모', segEdges([[2, 1, 6, 1], [6, 1, 6, 5]]).concat(segmentEdges({ x: 2, y: 1 }, { x: 6, y: 5 }))],
    ];
    for (const [label, edges] of shapes) {
      const plan = addEdges(emptyPlan(8, 6), edges);
      const layout = analyze(plan);
      const cell = layout.cells.find((c) => c.area <= 8)!;
      assert.ok(cell, label);
      for (const size of [{ w: 0.62, d: 0.9 }, { w: 0.8, d: 0.34 }, { w: 0.3, d: 0.42 }]) {
        const spot = fitFurniture(plan, layout, cell, size);
        assert.ok(spot, `${label}: ${size.w}×${size.d} 자리가 없다`);
        assertFits(plan, cell.id, spot, size.w, size.d, label);
      }
    }
  });

  check('[가구] 큰 칸에는 줄이지 않고 놓고, 비스듬한 벽에 등을 댄다', () => {
    const plan = addEdges(emptyPlan(8, 6), segEdges([[0, 0, 4, 0], [0, 0, 0, 4]]).concat(segmentEdges({ x: 4, y: 0 }, { x: 0, y: 4 })));
    const layout = analyze(plan);
    const spot = fitFurniture(plan, layout, layout.cells[0]!, { w: 0.62, d: 0.9 })!;
    assert.equal(spot.scale, 1);
    assert.ok(Math.abs(spot.front.x) > 0.1 && Math.abs(spot.front.y) > 0.1, '가장 긴 빗변에 등을 대고 비스듬히 놓인다');
  });

  check('[가구] 지나는 길과 문 앞을 비우고, 자리가 없으면 놓지 않는다', () => {
    let plan = addEdges(emptyPlan(8, 6), box(0, 0, 3, 3));
    plan = toggleOpening(plan, analyze(plan), hKey(1, 3), 'door').plan;
    const layout = analyze(plan);
    const cell = layout.cells[0]!;
    const line: Pt[] = [{ x: 0.5, y: 0.5 }, { x: 2.5, y: 0.5 }, { x: 2.5, y: 2.5 }, { x: 1.5, y: 2.5 }, { x: 1.5, y: 3 }];
    const spot = fitFurniture(plan, layout, cell, { w: 0.62, d: 0.9 }, { keepClear: [line] })!;
    assert.ok(spot, '자리가 있다');
    const corners = cornersOf(spot, ((spot.sideways ? 0.9 : 0.62) * spot.scale) / 2, ((spot.sideways ? 0.62 : 0.9) * spot.scale) / 2);
    for (const c of corners) {
      const near = line.slice(1).some((p, i) => {
        const a = line[i]!;
        const vx = p.x - a.x;
        const vy = p.y - a.y;
        const t = Math.max(0, Math.min(1, ((c.x - a.x) * vx + (c.y - a.y) * vy) / (vx * vx + vy * vy)));
        return Math.hypot(c.x - a.x - vx * t, c.y - a.y - vy * t) < 0.1;
      });
      assert.ok(!near, '길에 걸린다');
    }
    assert.ok(Math.hypot(spot.x - 1.5, spot.y - 3) > 0.32, '문 앞을 비운다');
    const tiny = addEdges(emptyPlan(4, 4), [hKey(0, 0), vKey(1, 0), dKey(0, 0)]);
    assert.equal(fitFurniture(tiny, analyze(tiny), analyze(tiny).cells[0]!, { w: 5, d: 5 }), null, '너무 크면 놓지 않는다');
  });

  check('[가구] 모든 본의 모든 방에 가구 자리가 있다', () => {
    for (const t of TEMPLATES) {
      const plan = autoAll(t);
      const layout = analyze(plan);
      const line = routePoints(plan, layout, plan.route);
      for (const cell of layout.cells) {
        const spot = fitFurniture(plan, layout, cell, { w: 0.3, d: 0.42 }, { keepClear: [line] });
        assert.ok(spot, `${t.id}: ${cell.id} 자리가 없다`);
        assertFits(plan, cell.id, spot, 0.3, 0.42, t.id);
      }
    }
  });

  const zoomBox = { x: -84, y: -84, w: 968, h: 900 };

  check('[확대] 기준 점이 화면에서 제자리에 있다', () => {
    const at = { x: 300, y: 200 };
    const before = fullView(zoomBox);
    const after = zoomAround(before, zoomBox, 2, at);
    assert.equal(after.scale, 2);
    const fraction = (v: typeof before): Pt => {
      const b = viewBoxOf(v, zoomBox);
      return { x: (at.x - b.x) / b.w, y: (at.y - b.y) / b.h };
    };
    assert.ok(Math.abs(fraction(before).x - fraction(after).x) < 1e-9);
    assert.ok(Math.abs(fraction(before).y - fraction(after).y) < 1e-9);
  });

  check('[확대] 1배보다 작아지지 않고 4배를 넘지 않으며 지도 밖으로 밀리지 않는다', () => {
    const full = fullView(zoomBox);
    assert.equal(zoomAround(full, zoomBox, 0.2, { x: 0, y: 0 }).scale, 1);
    assert.deepEqual(zoomAround(full, zoomBox, 0.5, { x: 0, y: 0 }), full, '전체 보기는 가운데다');
    assert.equal(zoomAround(full, zoomBox, 40, { x: 0, y: 0 }).scale, ZOOM_MAX);
    const far = panBy({ scale: 2, cx: 0, cy: 0 }, zoomBox, 99999, -99999);
    const b = viewBoxOf(far, zoomBox);
    assert.ok(b.x + b.w <= zoomBox.x + zoomBox.w + 1e-9, '오른쪽 끝');
    assert.ok(b.y >= zoomBox.y - 1e-9, '위쪽 끝');
    assert.deepEqual(clampView({ scale: 0.5, cx: 7, cy: 7 }, zoomBox), full);
  });

  check('[확대] 가운데 점으로 커졌다 작아지면 제자리로 돌아온다', () => {
    const start = fullView(zoomBox);
    const at = { x: start.cx, y: start.cy };
    const big = zoomAround(start, zoomBox, 3, at);
    assert.ok(Math.abs(big.cx - start.cx) < 1e-9);
    assert.deepEqual(zoomAround(big, zoomBox, 1, at), start);
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

  const layoutCellsOk = (cols: number, rows: number, outer: string[], inner: Template['inner']): boolean =>
    analyze(addEdges(emptyPlan(cols, rows), [...outer, ...segEdges(inner)])).cells.length >= 3;

  check('[각도] 학년 단계마다 뾰족한 집 본이 있고 45도가 아닌 벽으로 닫힌다', () => {
    for (const id of ['low-roof', 'mid-roof', 'high-roof']) {
      const t = TEMPLATES.find((x) => x.id === id)!;
      const band = BANDS[t.band];
      const edges = segEdges(t.outer);
      assert.ok(edges.some((k) => k.startsWith('s:')), `${id}: 다른 각도 벽이 없다`);
      assert.ok(layoutCellsOk(band.cols, band.rows, edges, t.inner), `${id}: 칸이 모자란다`);
      const layout = analyze(addEdges(emptyPlan(band.cols, band.rows), [...edges, ...segEdges(t.inner)]));
      assert.ok([...layout.edges.keys()].every((k) => !k.includes('#')), `${id}: 본의 벽끼리 엇갈린다`);
    }
  });

  check('[대각선] 학년 단계마다 비스듬한 집 본이 있고 칸이 닫힌다', () => {
    for (const id of ['low-cut', 'mid-cut', 'high-cut']) {
      const t = TEMPLATES.find((x) => x.id === id)!;
      const band = BANDS[t.band];
      const edges = segEdges(t.outer);
      assert.ok(edges.some((k) => k.startsWith('d:') || k.startsWith('u:')), `${id}: 대각선이 없다`);
      assert.ok(layoutCellsOk(band.cols, band.rows, edges, t.inner), id);
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
