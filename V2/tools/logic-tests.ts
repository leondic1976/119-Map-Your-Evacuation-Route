/** 연산 로직 — 화면 없이 돈다 */
import assert from 'node:assert/strict';
import { autoDoors, autoMarks, autoRoute, autoRoute2, autoTag, findSecondRoute, splitLargestCell } from '../src/core/auto';
import {
  closeLastDoor,
  drillMoves,
  drillStep,
  finishMeet,
  followLeg,
  isTrapped,
  moveTo,
  pickSource,
  setCrouch,
  startDrill,
  touchDoor,
  type DrillState,
  outsidePath,
  stepOutside,
  walkInside,
  type TokenId,
} from '../src/core/drill';
import { addEdges, addExtinguisher, addStroke, arrowRoute, emptyPlan, eraseWall, normalize, paintCell, placeMark, removeWall, routeCandidates, resizeDoor, setNoExtinguisher, tapRoute, toggleOpening, turnDoor } from '../src/core/edit';
import { DOOR_SIZES, doorSize, doorSwing, doorTurn, nextDoorSize, openingWidth } from '../src/core/doors';
import { extinguishers, markDone, MAX_EXTINGUISHERS } from '../src/core/marks';
import { findRoomSpot, fitRoom, inRoom, moveRoom, resizeRoom, roomGapEdges, roomSize, roomStep, roomUnit, stampRoom, type RoomDraft } from '../src/core/rooms';
import { changeGrid, densityOf, straightRuns } from '../src/core/density';
import { clearOfDoors, DOOR_CLEAR, facingAt, ITEM_SIZES, itemHitAt, itemIndexAt, itemSize, moveItem, outsideSpot, placeItem, removeItem, removeItemAt, resizeItem, setOutside, turnItem } from '../src/core/items';
import { arrangeLabels, rectsOverlap } from '../src/core/labels';
import { hasOtherRoute } from '../src/core/auto';
import { fitFurniture } from '../src/core/furnish';
import { analyze, cellIdAt, dKey, edgeBetween, edgeKeys, hKey, isExterior, isInterior, isPassable, pieceCenter, pieceKeyAt, segmentEdges, shortestPath, sqKey, uKey, unreachableCells, vKey } from '../src/core/grid';
import { stepField } from '../src/core/hazard';
import { pointAlong, routeCursor, routePoints, squareStep, type ArrowDir } from '../src/core/path';
import { buildReport, earnedStamps, stampSlots } from '../src/core/report';
import { DRAG_RADIUS, dragDots, dragMove, extendStroke, nearestDot, nearestEdge, startDrag, wasStraightDrag } from '../src/core/stroke';
import { clampView, fullView, panBy, viewBoxOf, zoomAround, ZOOM_MAX } from '../src/core/zoom';
import { OUT, type Band, type Plan, type Pt } from '../src/core/types';
import { BANDS, bandOfGrade } from '../src/content/bands';
import { FIRE } from '../src/content/fire';
import { buildHome, HOMES } from '../src/content/homes';
import { ITEM_GROUPS, ITEMS } from '../src/content/items';
import { crayonsFor, MARK_NAME } from '../src/content/names';
import { canOpenSide, roomBaseSize, ROOM_SIZE } from '../src/content/rooms';
import { STAMPS } from '../src/content/stamps';
import { howToFor } from '../src/content/howto';
import { LINES } from '../src/content/lines';
import { PROMISES } from '../src/content/report';
import { SOURCES } from '../src/content/sources';
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
/** 한 줄로 이어지는 점과 겹친 점을 줄인다 — 걸은 자리와 그린 선을 견줄 때 쓴다 */
function simplifyPts(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-9 && Math.abs(last.y - p.y) < 1e-9) continue;
    const before = out[out.length - 2];
    if (last && before) {
      const cross = (last.x - before.x) * (p.y - before.y) - (last.y - before.y) * (p.x - before.x);
      const forward = (last.x - before.x) * (p.x - last.x) + (last.y - before.y) * (p.y - last.y) >= 0;
      if (Math.abs(cross) < 1e-6 && forward) out.pop();
    }
    out.push(p);
  }
  return out;
}

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

  check('[표시] 안전한 곳은 집 밖, 나머지는 집 안에만 놓인다', () => {
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

  check('[방향키] 누른 쪽으로 모눈 한 칸 가고, 벽은 막히며, 문과 틈과 트인 곳은 지나간다 (#160)', () => {
    // 방 둘 — 가운데 벽(x=4)에 문 하나, 아래 겉벽에 나가는 문 하나
    const base = addEdges(emptyPlan(8, 6), [...box(1, 1, 7, 5), ...segEdges([[4, 1, 4, 5]])]);
    const plan = normalize({ ...base, openings: { [vKey(4, 2)]: 'door', [hKey(5, 5)]: 'gap' }, marks: { me: { x: 1.5, y: 1.5 } } });
    const layout = analyze(plan);
    const left = layout.cellAt.get('1,1')!;
    const right = layout.cellAt.get('5,1')!;
    assert.deepEqual(squareStep(plan, layout, '1,1', 'right'), { kind: 'walk', piece: '2,1', pt: { x: 2.5, y: 1.5 } }, '칸 안에서는 그쪽으로 한 칸');
    assert.deepEqual(squareStep(plan, layout, '1,1', 'up'), { kind: 'blocked' }, '겉벽은 막힌다');
    assert.deepEqual(squareStep(plan, layout, '3,1', 'right'), { kind: 'blocked' }, '문이 없는 벽은 막힌다');
    const door = squareStep(plan, layout, '3,2', 'right');
    assert.ok(door.kind === 'cross' && door.to === right && door.edge === vKey(4, 2) && door.piece === '4,2' && !door.open, '문으로 옆 칸에 간다');
    assert.ok(door.kind === 'cross' && door.via.x === 4 && door.via.y === 2.5, '문 가운데를 지난다');
    const back = squareStep(plan, layout, '4,2', 'left');
    assert.ok(back.kind === 'cross' && back.to === left && back.piece === '3,2', '같은 문으로 돌아온다');
    const out = squareStep(plan, layout, '5,4', 'down');
    assert.ok(out.kind === 'cross' && out.to === OUT && out.piece === OUT && out.open, '틈으로 밖에 나간다');
    assert.equal(squareStep(plan, layout, '0,0', 'right').kind, 'blocked', '집 밖에서는 쓰지 않는다');
    // 트인 칸끼리 맞닿은 곳은 어느 토막으로든 지나간다
    const open = normalize({ ...base, tags: { '1,1': { kind: 'pass', name: 'living' }, '5,1': { kind: 'room', name: 'kitchen' } } });
    const openLayout = analyze(open);
    for (const y of [1, 2, 3, 4]) {
      const step = squareStep(open, openLayout, `3,${y}`, 'right');
      assert.ok(step.kind === 'cross' && step.open && step.piece === `4,${y}`, `트인 곳 ${y}`);
    }
    // 방향마다 갈 곳은 하나뿐이다 — 누른 쪽 그대로 간다
    for (const piece of [...layout.cellAt.keys()]) {
      for (const dir of ['up', 'down', 'left', 'right'] as ArrowDir[]) {
        const step = squareStep(plan, layout, piece, dir);
        if (step.kind === 'blocked' || step.piece === OUT) continue;
        const from = pieceCenter(piece);
        const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir] as [number, number];
        assert.deepEqual([step.pt.x - from.x, step.pt.y - from.y], v, `${piece} ${dir}`);
      }
    }
  });

  check('[방향키] 방향키로 그린 길은 지나간 자리 그대로이고, 돌아가면 지워지며, 벽은 넘지 못한다 (#160)', () => {
    const base = addEdges(emptyPlan(8, 6), [...box(1, 1, 7, 5), ...segEdges([[4, 1, 4, 5]])]);
    const start = normalize({ ...base, openings: { [vKey(4, 2)]: 'door', [hKey(5, 5)]: 'door' }, marks: { me: { x: 1.5, y: 1.5 }, meet: { x: 4, y: 5.9 } } });
    const layout = analyze(start);
    let plan = start;
    const press = (dir: ArrowDir): string => {
      const res = arrowRoute(plan, layout, 'route', dir);
      plan = res.plan;
      return res.result;
    };
    assert.equal(press('up'), 'no-way', '벽 쪽은 가지 않는다');
    assert.deepEqual(plan.route, [], '막히면 길이 바뀌지 않는다');
    assert.deepEqual(['right', 'right', 'down'].map((d) => press(d as ArrowDir)), ['added', 'added', 'added']);
    assert.deepEqual(plan.route, ['1,1', '2,1', '3,1', '3,2']);
    assert.deepEqual(routeCursor(plan, layout, plan.route), { piece: '3,2', pt: { x: 3.5, y: 2.5 } }, '길의 끝에 서 있다');
    assert.equal(press('up'), 'back', '왔던 쪽으로 가면 한 칸 지워진다');
    assert.deepEqual(plan.route, ['1,1', '2,1', '3,1']);
    assert.equal(press('right'), 'no-way', '문이 없는 벽');
    assert.deepEqual(['down', 'right', 'right', 'down', 'down'].map((d) => press(d as ArrowDir)), ['added', 'added', 'added', 'added', 'added']);
    assert.equal(press('down'), 'done');
    assert.deepEqual(plan.route, ['1,1', '2,1', '3,1', '3,2', '4,2', '5,2', '5,3', '5,4', OUT]);
    assert.equal(press('down'), 'no-way', '밖까지 간 길은 더 가지 않는다');
    assert.deepEqual(normalize(plan).route, plan.route, '정리해도 그대로다');
    // 그린 선은 눌러 간 네모의 가운데를 차례로 지난다
    const points = routePoints(plan, layout, plan.route);
    assert.deepEqual(points.slice(0, -1), [{ x: 1.5, y: 1.5 }, { x: 3.5, y: 1.5 }, { x: 3.5, y: 2.5 }, { x: 5.5, y: 2.5 }], '꺾이는 자리마다 점이 있다');
    assert.equal(points[points.length - 1]!.x, 5.5);
    assertNoCrossing(plan, '방향키로 그린 길', points);
    // 한 바퀴 돌아 지나온 자리에 닿으면 거기까지 지워진다
    let loop = { ...start, route: ['1,1', '2,1', '2,2', '1,2'] };
    loop = arrowRoute(loop, layout, 'route', 'up').plan;
    assert.deepEqual(loop.route, ['1,1']);
    // 「도와줘」가 고른 길(칸만 적힌 길) 뒤에도 이어서 그린다
    const helped = { ...start, route: ['1,1', layout.cellAt.get('5,1')!] };
    const cursor = routeCursor(helped, layout, helped.route)!;
    assert.equal(cursor.piece, '4,2', '문을 지나 선 자리');
    assert.equal(arrowRoute(helped, layout, 'route', 'right').result, 'added');
  });

  check('[방향키] 시작 본과 아파트 전종에서 방향키만으로 내 자리에서 밖까지 간다 (#160)', () => {
    const plans: [string, Plan, Band][] = TEMPLATES.map((t) => [t.id, autoAll(t), t.band]);
    for (const band of Object.values(BANDS)) {
      for (const home of HOMES) {
        const blank = emptyPlan(band.cols, band.rows);
        plans.push([`${band.id} ${home.id}`, autoRoute(autoMarks(autoDoors(autoTag(normalize({ ...blank, ...buildHome(home, blank.cols, blank.rows) }), band.id)), band.id)), band.id]);
      }
    }
    const dirs: ArrowDir[] = ['up', 'down', 'left', 'right'];
    for (const [id, plan, band] of plans) {
      const layout = analyze(plan);
      const startKey = pieceKeyAt(layout, plan.marks.me!);
      // 방향키로 닿는 조각을 넓혀 가며 밖까지의 누름 순서를 찾는다
      const prev = new Map<string, { from: string; dir: ArrowDir }>();
      const queue = [startKey];
      const seen = new Set([startKey]);
      while (queue.length) {
        const here = queue.shift()!;
        for (const dir of dirs) {
          const step = squareStep(plan, layout, here, dir);
          if (step.kind === 'blocked' || seen.has(step.piece)) continue;
          seen.add(step.piece);
          prev.set(step.piece, { from: here, dir });
          if (step.piece !== OUT) queue.push(step.piece);
        }
      }
      assert.ok(seen.has(OUT), `${id}: 방향키로 밖에 닿지 못한다`);
      // 문으로 이어진 칸은 모두 방향키로도 닿는다
      const cells = new Set([...seen].filter((k) => k !== OUT).map((k) => layout.cellAt.get(k)));
      const linked = new Set([layout.cellAt.get(startKey)!]);
      const stack = [...linked];
      while (stack.length) {
        const here = stack.pop()!;
        for (const l of layout.links) {
          const other = l.a === here ? l.b : l.b === here ? l.a : null;
          if (other === null || other === OUT || linked.has(other)) continue;
          linked.add(other);
          stack.push(other);
        }
      }
      for (const cell of linked) assert.ok(cells.has(cell), `${id}: ${cell} 칸에 방향키로 닿지 못한다`);
      const presses: ArrowDir[] = [];
      for (let at = OUT; at !== startKey; at = prev.get(at)!.from) presses.unshift(prev.get(at)!.dir);
      // 그 순서대로 길을 그리면 밖까지 이어진다
      let drawn: Plan = { ...plan, route: [] };
      for (const dir of presses) drawn = arrowRoute(drawn, layout, 'route', dir).plan;
      assert.equal(drawn.route[drawn.route.length - 1], OUT, `${id}: 그린 길이 밖까지 가지 않는다`);
      assertNoCrossing(drawn, `${id} 방향키 길`, routePoints(drawn, layout, drawn.route));
      // 대피 연습도 같은 누름으로 밖까지 간다. 불은 막지 않는다고 본다
      const config = FIRE[band];
      let state = startDrill(drawn, 1, config)!;
      for (const dir of presses) {
        const step = drillStep(drawn, layout, state, dir, config);
        assert.ok(step, `${id}: 연습에서 ${dir} 가 막혔다`);
        state = step.move ? moveTo(drawn, layout, state, { ...step.move, hot: false }, config, step.walk) : walkInside(drawn, state, step.walk);
      }
      assert.equal(state.phase, 'outside', id);
    }
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
  function assertNoCrossing(plan: Plan, label: string, points: Pt[]): void {
    const layout = analyze(plan);
    // 문과 틈, 트인 칸끼리 맞닿은 곳은 지나가도 된다
    const solid = edgeKeys(layout).filter((k) => !isPassable(plan, layout, k));
    for (let i = 1; i < points.length; i++) {
      for (let r = 0.01; r < 1; r += 0.01) {
        const p = { x: points[i - 1]!.x + (points[i]!.x - points[i - 1]!.x) * r, y: points[i - 1]!.y + (points[i]!.y - points[i - 1]!.y) * r };
        const near = nearestEdge(solid, p, 0.004);
        assert.equal(near, null, `${label}: ${JSON.stringify(p)} 가 벽 ${near} 을 지난다`);
      }
    }
  }

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

  /** 본을 점 간격 k 로 깐 지도 */
  const fineTemplate = (t: Template, k: number): Plan => {
    const info = BANDS[t.band];
    return addEdges(emptyPlan(info.cols, info.rows, k), [...segEdges(t.outer, k), ...segEdges(t.inner, k)]);
  };
  const fineAll = (t: Template, k: number): Plan => autoRoute(autoMarks(autoDoors(autoTag(fineTemplate(t, k), t.band)), t.band));

  check('[점 개수] 배로 늘리면 벽·칸·문·표시가 같은 자리에 남고, 되돌리면 처음과 같다', () => {
    for (const tpl of TEMPLATES) {
      const plan = autoAll(tpl);
      const base = analyze(plan);
      for (const k of [2, 4]) {
        const fine = changeGrid(plan, plan.cols * k, plan.rows * k);
        const layout = analyze(fine);
        assert.equal(densityOf(fine), k, tpl.id);
        assert.equal(layout.cells.length, base.cells.length, `${tpl.id}: 칸 수`);
        assert.ok(Math.abs(layout.cells.reduce((s, c) => s + c.area, 0) - base.cells.reduce((s, c) => s + c.area, 0) * k * k) < 1e-3, `${tpl.id}: 넓이`);
        assert.equal(Object.keys(fine.openings).length, Object.keys(plan.openings).length, `${tpl.id}: 문 수`);
        assert.equal(layout.links.length, base.links.length, `${tpl.id}: 문으로 이어진 수`);
        assert.equal(layout.cells.filter((c) => c.kind).length, base.cells.filter((c) => c.kind).length, `${tpl.id}: 칠한 칸`);
        assert.deepEqual(Object.keys(fine.marks).sort(), Object.keys(plan.marks).sort(), `${tpl.id}: 표시`);
        assert.ok(Math.hypot(fine.marks.me!.x / k - plan.marks.me!.x, fine.marks.me!.y / k - plan.marks.me!.y) < 0.6, `${tpl.id}: 내 자리가 멀리 가지 않는다`);
        assert.equal(fine.route[fine.route.length - 1], OUT, `${tpl.id}: 길이 남는다`);
        const back = changeGrid(fine, plan.cols, plan.rows);
        assert.deepEqual([...back.walls].sort(), [...plan.walls].sort(), `${tpl.id}: 돌아오면 벽이 같다`);
        assert.equal(analyze(back).cells.length, base.cells.length);
        assert.equal(densityOf(back), 1);
      }
    }
  });

  check('[점 개수] 학년 단계마다 점이 기본의 50% 안팎으로 줄고 늘어난다', () => {
    const dots = (c: number, r: number): number => (c + 1) * (r + 1);
    for (const band of Object.values(BANDS)) {
      const base = dots(band.cols, band.rows);
      assert.ok(band.grids.some(([c, r]) => c === band.cols && r === band.rows), `${band.id}: 기본이 있다`);
      const sizes = band.grids.map(([c, r]) => dots(c, r) / base);
      assert.deepEqual(sizes, [...sizes].sort((a, b) => a - b), `${band.id}: 차례대로`);
      assert.ok(sizes[0]! >= 0.45 && sizes[0]! <= 0.6, `${band.id}: 가장 적은 쪽 ${sizes[0]}`);
      const atBase = band.grids.findIndex(([c, r]) => c === band.cols && r === band.rows);
      assert.ok(sizes[atBase + 2]! >= 1.35 && sizes[atBase + 2]! <= 1.6, `${band.id}: 기본 위 둘째 ${sizes[atBase + 2]}`);
      for (const [c, r] of band.grids) {
        const blank = changeGrid(emptyPlan(band.cols, band.rows), c, r);
        assert.equal(blank.cols, c);
        assert.equal(blank.rows, r);
      }
    }
  });

  check('[점 개수] 어느 개수로 바꿔도 지도가 망가지지 않고 집은 집으로 남는다', () => {
    for (const tpl of TEMPLATES) {
      const plan = autoAll(tpl);
      for (const [c, r] of BANDS[tpl.band].grids) {
        const next = changeGrid(plan, c, r);
        const layout = analyze(next);
        assert.ok(layout.cells.length >= 1, `${tpl.id} ${c}×${r}: 칸이 남는다`);
        assert.ok(next.walls.every((w) => w.split('#').length === 1), `${tpl.id} ${c}×${r}`);
        assert.ok(next.marks.meet, `${tpl.id} ${c}×${r}: 안전한 곳이 남는다`);
        assert.equal(cellIdAt(layout, next.marks.meet!), undefined, `${tpl.id} ${c}×${r}: 안전한 곳은 밖`);
      }
    }
    assert.deepEqual(straightRuns(segEdges([[0, 0, 3, 0]])), [{ a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }], '곧은 벽은 한 줄이다');
  });

  /** 아파트 모양을 깔아 끝까지 채운 지도 */
  const homeAll = (homeId: string, band: Band, cols: number, rows: number): Plan => {
    const home = HOMES.find((h) => h.id === homeId)!;
    const info = BANDS[band];
    const paper: Plan = { ...emptyPlan(cols, rows), ...(cols === info.cols ? {} : { density: cols / info.cols }) };
    const { walls, tags } = buildHome(home, cols, rows);
    return autoRoute(autoMarks(autoDoors(autoTag(normalize({ ...paper, walls, tags }), band)), band));
  };

  check('[아파트] 모양마다 거실·주방·화장실·현관·베란다가 있고 방 수가 맞다', () => {
    const roomsOf: Record<string, number> = { 'home-2': 2, 'home-3': 3, 'home-3w': 3, 'home-4': 4, 'home-tower': 3, 'home-long': 3 };
    const bathsOf: Record<string, number> = { 'home-2': 1, 'home-3': 2, 'home-3w': 2, 'home-4': 2, 'home-tower': 1, 'home-long': 1 };
    for (const band of Object.values(BANDS)) {
      for (const home of HOMES) {
        for (const line of home.art) assert.equal(line.length, 12, home.id);
        assert.equal(home.art.length, 8, home.id);
        const layout = analyze(normalize({ ...emptyPlan(band.cols, band.rows), ...buildHome(home, band.cols, band.rows) }));
        const names = layout.cells.map((c) => c.name);
        for (const need of ['living', 'kitchen', 'bath', 'entry', 'veranda']) assert.ok(names.includes(need), `${band.id} ${home.id}: ${need} 없음`);
        const rooms = names.filter((n) => n === 'main' || n === 'myroom' || n === 'other').length;
        assert.equal(rooms, roomsOf[home.id], `${band.id} ${home.id}: 방 수`);
        assert.equal(names.filter((n) => n === 'bath').length, bathsOf[home.id], `${band.id} ${home.id}: 화장실 수`);
        assert.ok(layout.cells.every((c) => c.kind), `${band.id} ${home.id}: 빠진 칸 이름`);
      }
    }
  });

  check('[아파트] 현관으로 나가고, 중문이 있고, 베란다로는 나가지 않으며, 끝까지 대피할 수 있다', () => {
    for (const band of Object.values(BANDS)) {
      for (const home of HOMES) {
        for (const [c, r] of band.grids.filter(([gc]) => gc >= band.cols)) {
          if (c > band.cols * 2) continue;
          const plan = homeAll(home.id, band.id, c, r);
          const layout = analyze(plan);
          const label = `${band.id} ${home.id} ${c}×${r}`;
          const exits = layout.links.filter((l) => l.b === OUT).map((l) => layout.byId.get(l.a)!.name);
          assert.deepEqual(exits, ['entry'], `${label}: 밖으로 나가는 문`);
          const inner = layout.links.filter((l) => l.b !== OUT && [l.a, l.b].some((id) => layout.byId.get(id)?.name === 'entry'));
          // 현관은 거실처럼 트인 칸과 맞닿으면 문 없이 이어진다(대장 #137). 문을 달면 그 문이 중문이다
          assert.ok(inner.length >= 1, `${label}: 현관이 집 안으로 이어진다`);
          assert.equal(unreachableCells(layout).length, 0, `${label}: 모두 이어짐`);
          assert.equal(plan.route[plan.route.length - 1], OUT, `${label}: 길`);
          assertNoCrossing(plan, label, routePoints(plan, layout, plan.route));
        }
      }
    }
  });

  check('[아파트] 베란다는 모든 학년에서 고르고, 다용도실과 현관도 고른다', () => {
    for (const band of ['low', 'mid', 'high'] as Band[]) {
      assert.ok(crayonsFor(band).room.some((c) => c.name === 'veranda'), band);
    }
    for (const band of ['mid', 'high'] as Band[]) {
      assert.ok(crayonsFor(band).room.some((c) => c.name === 'utility'), band);
      assert.ok(crayonsFor(band).pass.some((c) => c.name === 'entry'), band);
    }
  });

  check('[도와줘] 집 모양만 있으면 그린 벽을 그대로 두고 방을 둘로 나눈다', () => {
    const plan = addEdges(emptyPlan(8, 6), box(1, 1, 7, 5));
    const split = splitLargestCell(plan);
    assert.equal(analyze(split).cells.length, 2);
    for (const wall of plan.walls) assert.ok(split.walls.includes(wall), wall);
    const tall = splitLargestCell(addEdges(emptyPlan(8, 6), box(3, 0, 5, 6)));
    assert.equal(analyze(tall).cells.length, 2, '세로로 긴 집은 가로로 자른다');
    const slanted = splitLargestCell(addEdges(emptyPlan(8, 6), [...segEdges([[1, 1, 7, 1], [7, 1, 7, 5]]), ...segmentEdges({ x: 7, y: 5 }, { x: 1, y: 1 })]));
    assert.ok(analyze(slanted).cells.length >= 2, '비스듬한 집도 나눈다');
  });

  check('[집 밖] 네 쪽 어디든 놓이고, 안전한 곳이 따라가며, 나가는 문이 그쪽을 향한다', () => {
    const base = addEdges(emptyPlan(8, 6), box(2, 1, 6, 4));
    const expect = { top: (m: Pt) => m.y < 0, bottom: (m: Pt) => m.y > 6, left: (m: Pt) => m.x < 0, right: (m: Pt) => m.x > 8 };
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      const moved = setOutside(autoMarks(autoTag(setOutside(base, 'top'), 'low'), 'low'), side);
      assert.ok(expect[side](moved.marks.meet!), `${side}: 안전한 곳`);
      const layout = analyze(moved);
      assert.equal(cellIdAt(layout, moved.marks.meet!), undefined, `${side}: 밖이다`);
      const doors = autoDoors(moved);
      const exit = analyze(doors).links.find((l) => l.b === OUT)!;
      const m = { x: (exit.edge.startsWith('h:') ? Number(exit.edge.split(':')[1]) + 0.5 : Number(exit.edge.split(':')[1])), y: (exit.edge.startsWith('h:') ? Number(exit.edge.split(':')[2]) : Number(exit.edge.split(':')[2]) + 0.5) };
      const faces = { top: m.y === 1, bottom: m.y === 4, left: m.x === 2, right: m.x === 6 };
      assert.ok(faces[side], `${side}: 문 ${exit.edge}`);
      const routed = autoRoute(doors);
      assert.equal(routed.route[routed.route.length - 1], OUT, `${side}: 길`);
      const end = outsideSpot(routed);
      assert.ok(expect[side](end), side);
    }
  });

  check('[가구] 칸 안에만 놓이고, 벽을 등지며, 치울 수 있고, 지도와 함께 움직인다', () => {
    let plan = addEdges(emptyPlan(8, 6), box(1, 1, 6, 5));
    let layout = analyze(plan);
    assert.equal(placeItem(plan, layout, 'bed', { x: 7.5, y: 5.5 }).ok, false, '집 밖에는 놓지 않는다');
    const placed = placeItem(plan, layout, 'bed', { x: 1.5, y: 3 });
    assert.equal(placed.ok, true);
    plan = placed.plan;
    assert.equal(plan.items!.length, 1);
    assert.equal(facingAt(layout, { x: 3, y: 1.2 }), 0, '위쪽 벽을 등지면 앞이 아래다');
    assert.equal(Math.round(plan.items![0]!.angle), -90, '왼쪽 벽을 등지면 앞이 오른쪽이다');
    const fine = changeGrid(plan, 16, 12);
    assert.deepEqual([fine.items![0]!.x, fine.items![0]!.y], [3, 6], '점을 늘려도 같은 자리다');
    assert.equal(removeItemAt(plan, { x: 5, y: 4 }, 0.6).items!.length, 1, '먼 자리는 치우지 않는다');
    assert.equal(removeItemAt(plan, { x: 1.6, y: 3.1 }, 0.6).items!.length, 0);
    plan = removeWall(plan, hKey(1, 1));
    layout = analyze(plan);
    assert.equal(layout.cells.length, 0);
    assert.equal(plan.items!.length, 0, '칸이 없어지면 가구도 없어진다');
    for (const group of ITEM_GROUPS) for (const kind of group.items) assert.ok(ITEMS[kind].parts.length > 0 && ITEMS[kind].label.length <= 5, kind);
  });

  check('[#133 가구] 문 앞은 밀어서 비우고, 밀 수 없으면 놓지 않으며, 끌어 옮길 수 있다', () => {
    let plan = addEdges(emptyPlan(8, 6), box(1, 1, 6, 5));
    const door = hKey(3, 1);
    plan = { ...plan, openings: { [door]: 'door' } };
    let layout = analyze(plan);
    const near = placeItem(plan, layout, 'bed', { x: 3.5, y: 1.1 });
    assert.equal(near.ok, true);
    const item = near.plan.items![0]!;
    assert.ok(Math.hypot(item.x - 3.5, item.y - 1) >= DOOR_CLEAR - 1e-6, '문 앞에서 밀려난다');
    const onDoor = clearOfDoors(plan, layout, { x: 3.5, y: 1 + 1e-4 });
    assert.ok(onDoor && Math.hypot(onDoor.x - 3.5, onDoor.y - 1) >= DOOR_CLEAR - 1e-6, '문 바로 위를 눌러도 칸 쪽으로 민다');
    // 작은 칸의 문 앞 — 밀 자리가 칸 안에 없으면 놓지 않는다
    const tiny = { ...addEdges(emptyPlan(8, 6), box(1, 1, 2, 2)), openings: { [hKey(1, 1)]: 'door' as const, [hKey(1, 2)]: 'door' as const } };
    const tinyLayout = analyze(tiny);
    const refused = placeItem(tiny, tinyLayout, 'bed', { x: 1.5, y: 1.5 });
    assert.equal(refused.ok, false);
    assert.equal(!refused.ok && refused.why, 'door');
    assert.equal(itemIndexAt(near.plan, { x: 9, y: 9 }, 0.4), -1);
    assert.equal(itemIndexAt(near.plan, { x: item.x + 0.1, y: item.y }, 0.4), 0);
    // 그림 어디를 잡아도 잡힌다(#158). 침대는 폭보다 깊이가 길다
    const dims = (kind: keyof typeof ITEMS) => ITEMS[kind];
    const bed = { ...plan, items: [{ kind: 'bed' as const, x: 3, y: 3, angle: 0 }] };
    assert.equal(itemHitAt(bed, { x: 3, y: 3 + ITEMS.bed.d / 2 - 0.05 }, dims, 0), 0, '발치를 잡아도 잡힌다');
    assert.equal(itemHitAt(bed, { x: 3 + ITEMS.bed.d / 2 - 0.05, y: 3 }, dims, 0), ITEMS.bed.w >= ITEMS.bed.d ? 0 : -1, '옆으로 벗어나면 잡히지 않는다');
    const turned = { ...bed, items: [{ ...bed.items[0]!, angle: 90 }] };
    assert.equal(itemHitAt(turned, { x: 3 + ITEMS.bed.d / 2 - 0.05, y: 3 }, dims, 0), 0, '돌리면 잡히는 자리도 함께 돈다');
    assert.equal(itemHitAt(bed, { x: 6, y: 1 }, dims, 0.1), -1);
    const big = { ...bed, items: [{ ...bed.items[0]!, size: 1.8 }] };
    assert.equal(itemHitAt(big, { x: 3, y: 3 + (ITEMS.bed.d * 1.8) / 2 - 0.05 }, dims, 0), 0, '키우면 넓게 잡힌다');
    const two = { ...bed, items: [...bed.items, { kind: 'plant' as const, x: 3, y: 3, angle: 0 }] };
    assert.equal(itemHitAt(two, { x: 3, y: 3 }, dims, 0), 1, '겹치면 위에 놓인 것을 잡는다');
    const moved = moveItem(near.plan, layout, 0, { x: 5, y: 4 });
    assert.equal(moved.ok, true);
    assert.deepEqual([moved.plan.items![0]!.x, moved.plan.items![0]!.y], [5, 4]);
    assert.equal(moveItem(near.plan, layout, 0, { x: 7.5, y: 5.5 }).ok, false, '집 밖으로는 옮기지 않는다');
    layout = analyze(moved.plan);
    assert.equal(layout.cells.length, 1);
  });

  check('[#134 촘촘한 점] 손 떨림으로 끝점이 한 점 어긋나도 가로 벽이 기울지 않고, 일부러 기울이면 기운다', () => {
    const unit = 2;
    let live = startDrag({ x: 4, y: 4 });
    live = dragMove(live, { x: 8, y: 4.4 }, { x: 8, y: 4 }, unit);
    live = dragMove(live, { x: 12, y: 4.9 }, { x: 12, y: 5 }, unit);
    assert.deepEqual(dragDots(live).map((p) => p.y), dragDots(live).map(() => 4), '한 점 어긋난 끝을 같은 줄로 잡는다');
    let slanted = startDrag({ x: 4, y: 4 });
    slanted = dragMove(slanted, { x: 7, y: 7 }, { x: 7, y: 7 }, unit);
    slanted = dragMove(slanted, { x: 10, y: 10 }, { x: 10, y: 10 }, unit);
    const end = dragDots(slanted)[dragDots(slanted).length - 1]!;
    assert.deepEqual(end, { x: 10, y: 10 }, '크게 기울인 벽은 그대로다');
    assert.deepEqual(nearestDot(emptyPlan(32, 24), { x: 5.5, y: 5.5 }), null, '기본 거리로는 점 사이를 잡지 않는다');
    assert.ok(nearestDot(emptyPlan(32, 24), { x: 5.5, y: 5.5 }, 0.75), '촘촘하면 점 사이를 눌러도 가까운 점을 잡는다');
  });

  check('[#133 글자] 글자끼리와 표시 그림에 겹치지 않게 비켜 놓는다', () => {
    const labels = [
      { id: 'a', x: 100, y: 100, w: 80, h: 26 },
      { id: 'b', x: 110, y: 104, w: 80, h: 26 },
      { id: 'c', x: 100, y: 100, w: 60, h: 26 },
      { id: 'd', x: 90, y: 96, w: 60, h: 26 },
    ];
    const glyph = { x: 100, y: 60, w: 70, h: 40 };
    const spots = arrangeLabels(labels, [glyph]);
    const rects = labels.map((l) => ({ ...l, ...spots.get(l.id)! }));
    for (const r of rects) assert.ok(!rectsOverlap(r, glyph), `${r.id} 이 그림과 겹친다`);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) assert.ok(!rectsOverlap(rects[i]!, rects[j]!), `${rects[i]!.id}·${rects[j]!.id}`);
    assert.deepEqual(spots.get('a'), { x: 100, y: 100 }, '겹치지 않으면 그 자리다');
  });

  check('[#133 연습] 안내를 듣고 낮추면 고칠 점이 없고, 낮추지 않으면 남으며, 둘이 함께 나오지 않는다', () => {
    const config = FIRE.mid;
    let plan = addEdges(emptyPlan(10, 7), [...box(1, 1, 4, 3), ...box(4, 1, 7, 3), ...box(1, 3, 7, 5)]);
    plan = autoTag(plan, 'mid');
    plan = autoRoute(autoMarks(autoDoors(plan), 'mid'));
    const layout = analyze(plan);
    const start = startDrill(plan, 3, config)!;
    assert.ok(start);
    const walkOut = (crouchWhenWarned: boolean, ignoreFirst = false): DrillState => {
      let s = start;
      let warned = 0;
      for (let guard = 0; guard < 30 && s.phase === 'inside'; guard++) {
        // 다음 칸에 연기가 있다고 가정해 모든 칸을 옅은 연기로 채운다 — 안내가 들어간 뒤에 나오는 상황이다
        s = { ...s, field: Object.fromEntries(layout.cells.map((c) => [c.id, config.levels.light])) };
        const path = shortestPath(layout, s.at)!;
        const move = drillMoves(layout, s, config).find((m) => m.to === path[0]!.to)!;
        if (guard > 0) {
          warned += 1;
          if (crouchWhenWarned && (!ignoreFirst || warned > 1)) s = setCrouch(s, true, config);
        }
        s = moveTo(plan, layout, s, { ...move, hot: false }, config);
      }
      return finishMeet(plan, layout, s);
    };
    const obeyed = buildReport(walkOut(true), plan, 'mid');
    assert.ok(obeyed.praises.includes('crouch'), '낮췄으니 잘한 점이다');
    assert.ok(!obeyed.fixes.includes('crouch'), '안내대로 했으면 고칠 점이 아니다');
    const late = buildReport(walkOut(true, true), plan, 'mid');
    assert.ok(!(late.praises.includes('crouch') && late.fixes.includes('crouch')), '같은 일을 칭찬하며 고치라고 하지 않는다');
    const ignored = buildReport(walkOut(false), plan, 'mid');
    assert.ok(ignored.fixes.includes('crouch') && !ignored.praises.includes('crouch'), '끝까지 서 있었으면 다음에 해 볼 것이다');
    const pressed = setCrouch({ ...start, field: { [start.at]: config.levels.light } }, true, config);
    assert.equal(pressed.stats.crouchedInHazard, 1, '연기 속에서 누른 것도 센다');
    assert.equal(setCrouch(start, true, config).stats.crouchedInHazard, 0, '연기가 없을 때는 세지 않는다');
  });

  check('[#134 연습] 일렬로 이어진 집도 어느 칸에서 불이 나든 나갈 수 있다', () => {
    // 방 → 지나가는 곳 → 밖. 내 자리에서 나가려면 불이 난 칸을 꼭 지난다
    const base = addEdges(emptyPlan(8, 6), [...box(1, 1, 3, 3), ...box(3, 1, 5, 3), ...box(5, 1, 7, 3)]);
    const links = { [vKey(3, 1)]: 'door' as const, [vKey(5, 1)]: 'door' as const, [vKey(7, 1)]: 'door' as const };
    const plan: Plan = { ...base, openings: links, marks: { me: { x: 1.5, y: 1.5 }, meet: { x: 4, y: 6.9 } } };
    const layout = analyze(plan);
    const startCell = cellIdAt(layout, plan.marks.me!)!;
    for (const band of ['low', 'mid', 'high'] as const) {
      for (let seed = 0; seed < 100; seed++) {
        const config = FIRE[band];
        const picked = pickSource(plan, layout, startCell, seed, config);
        // 불은 작게 시작한다(대장 #137). 나가는 길 위에서 나도 처음에는 뜨겁지 않아 몸을 낮추고 지나간다
        assert.notEqual(picked.source, startCell, '내 자리 칸에서는 시작하지 않는다');
        let s = startDrill(plan, seed, config)!;
        assert.ok(s.field[s.source]! < config.levels.hot, '처음에는 뜨겁지 않다');
        for (let guard = 0; guard < 10 && s.phase === 'inside'; guard++) {
          const path = shortestPath(layout, s.at)!;
          const move = drillMoves(layout, s, config).find((m) => m.to === path[0]!.to)!;
          assert.equal(move.hot, false, `${band} seed ${seed} 차례 ${guard}: 문이 뜨거우면 안 된다`);
          assert.equal(isTrapped(layout, s, config), false);
          s = moveTo(plan, layout, s, move, config);
        }
        assert.equal(s.phase, 'outside', `${band} seed ${seed}`);
      }
    }
  });

  check('[#134 아파트] 모든 모양 × 학년 × 시드에서 가장 짧은 길로 나갈 수 있고, 대피공간으로는 나가지 않는다', () => {
    for (const band of ['low', 'mid', 'high'] as const) {
      const info = BANDS[band];
      for (const home of HOMES) {
        const blank = emptyPlan(info.cols, info.rows);
        const built = buildHome(home, blank.cols, blank.rows);
        const plan = autoRoute(autoMarks(autoDoors(autoTag(normalize({ ...blank, ...built }), band)), band));
        const layout = analyze(plan);
        for (const link of layout.links.filter((l) => l.b === OUT)) {
          const name = layout.byId.get(link.a)?.name;
          assert.ok(name !== 'refuge' && name !== 'veranda', `${home.id}: ${name} 로 나가지 않는다`);
        }
        for (let seed = 0; seed < 30; seed++) {
          const config = FIRE[band];
          let s = startDrill(plan, seed, config)!;
          for (let guard = 0; guard < 30 && s.phase === 'inside'; guard++) {
            const path = shortestPath(layout, s.at)!;
            const move = drillMoves(layout, s, config).find((m) => m.to === path[0]!.to)!;
            assert.equal(move.hot, false, `${band} ${home.id} seed ${seed}`);
            s = moveTo(plan, layout, s, move, config);
          }
          assert.equal(s.phase, 'outside', `${band} ${home.id} seed ${seed}`);
        }
      }
    }
    const refuges = HOMES.filter((h) => h.art.some((row) => row.includes('A'))).map((h) => h.id);
    assert.deepEqual(refuges, ['home-3w', 'home-4'], '대피공간이 있는 평면');
  });

  check('[#133 길] 다른 길이 있는지 바르게 안다', () => {
    const base = addEdges(emptyPlan(8, 6), [...box(1, 1, 3, 3), ...box(3, 1, 5, 3)]);
    const one: Plan = { ...base, openings: { [vKey(3, 1)]: 'door', [vKey(5, 1)]: 'door' }, marks: { me: { x: 1.5, y: 1.5 } } };
    const routed = autoRoute(one);
    assert.equal(routed.route[routed.route.length - 1], OUT);
    assert.equal(hasOtherRoute(routed), false, '문이 한 줄뿐이면 다른 길이 없다');
    const two: Plan = { ...routed, openings: { ...routed.openings, [vKey(1, 1)]: 'door' } };
    assert.equal(hasOtherRoute(two), true, '문을 더 달면 다른 길이 있다');
    assert.equal(hasOtherRoute({ ...routed, marks: {} }), false, '내 자리가 없으면 길도 없다');
  });

  check('[#134 안전 문장] 모든 출처를 대조했고, 어려운 말과 예전 출처가 남지 않았다', () => {
    assert.ok(SOURCES.every((s) => s.verified), '모든 출처 대조');
    assert.ok(SOURCES.filter((s) => s.id !== 'app-guide').every((s) => s.url?.startsWith('https://')), '공식 자료 주소');
    assert.equal(SOURCES.some((s) => s.id === 'nfa-fire-manual'), false);
    const said = Object.values(LINES).map((l) => l.text).join(' ');
    for (const word of ['침착하게', '구조를 요청', '머무는 칸', '걸어가는 칸', '비스듬한']) assert.ok(!said.includes(word), word);
    const promises = PROMISES.map((p) => p.text).join(' ');
    for (const word of ['대피공간', '경량칸막이', '엘리베이터', '손등', '젖은 수건', '창문을 닫고']) assert.ok(promises.includes(word), word);
    assert.ok(crayonsFor('mid').room.some((c) => c.name === 'refuge') && crayonsFor('high').room.some((c) => c.name === 'refuge'));
    assert.ok(crayonsFor('mid').pass.some((c) => c.name === 'stairs'));
    for (const name of ['kitchen', 'bath']) assert.ok(crayonsFor('low').room.some((c) => c.name === name), name);
    assert.ok(crayonsFor('low').pass.some((c) => c.name === 'living'));
    assert.ok(ITEM_GROUPS.flatMap((g) => g.items).includes('partition'));
    for (const band of ['low', 'mid', 'high'] as const) assert.ok(LINES[howToFor('drill', band).line], band);
    assert.notEqual(howToFor('drill', 'low').line, howToFor('drill', 'high').line, '학년마다 할 일이 달라 듣는 말도 다르다');
  });

  check('[점 개수] 모든 모양을 어떤 배수로든 끝까지 해낼 수 있다', () => {
    for (const k of [2, 4]) {
      for (const t of TEMPLATES) {
        const plan = fineAll(t, k);
        const layout = analyze(plan);
        assert.equal(plan.route[plan.route.length - 1], OUT, `${t.id}×${k}: 길`);
        assert.equal(unreachableCells(layout).length, 0, `${t.id}×${k}: 이어짐`);
        const points = routePoints(plan, layout, plan.route);
        assertNoCrossing(plan, `${t.id}×${k}`, points);
        const marks = Object.entries(plan.marks).filter(([id]) => id !== 'meet').map(([, m]) => m!);
        marks.forEach((a, i) => marks.slice(i + 1).forEach((b) => assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 0.5 * k - 1e-6, `${t.id}×${k}: 표시가 겹친다`)));
        const state = walkOut(plan, 3, t.band);
        assert.equal(state.end, 'meet', `${t.id}×${k}: 연습`);
        assert.equal(cellIdAt(layout, plan.marks.meet!), undefined, `${t.id}×${k}: 안전한 곳은 밖`);
      }
    }
  });

  check('[점 개수] 촘촘한 점에서 손이 떨려도 가로세로 벽은 곧고, 모서리는 꺾이며, 비스듬한 벽도 그려진다', () => {
    const plan = emptyPlan(12, 8, 4);
    const fineDrag = (points: Pt[], unit = 4): string[] => {
      let live = startDrag(points[0]!);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]!;
        const b = points[i]!;
        const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.4);
        for (let s = 1; s <= n; s++) {
          const p = { x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n };
          live = dragMove(live, p, nearestDot(plan, p, 0.75), unit);
        }
      }
      return addStroke(plan, dragDots(live)).walls;
    };
    const wobble = fineDrag([{ x: 4, y: 4 }, { x: 12, y: 4.7 }, { x: 20, y: 3.4 }, { x: 28, y: 4.4 }]);
    assert.equal(wobble.filter((k) => /^[dus]:/.test(k)).length, 0, '떨려도 가로 벽이다');
    assert.equal(wobble.length, 24);
    const corner = fineDrag([{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 20, y: 16 }]);
    assert.deepEqual(corner, segEdges([[4, 4, 20, 4], [20, 4, 20, 16]]).sort(), '모서리에서 꺾인다');
    const slant = fineDrag([{ x: 4, y: 4 }, { x: 20, y: 12 }]);
    assert.equal(slant.filter((k) => /^[dus]:/.test(k)).length, slant.length, '비스듬한 벽이다');
    // 크게 보면 손 떨림이 작아져 한 칸짜리 턱도 그린다
    const step = fineDrag([{ x: 4, y: 4 }, { x: 8, y: 4 }, { x: 8, y: 5 }, { x: 12, y: 5 }], 1);
    assert.deepEqual(step, segEdges([[4, 4, 8, 4], [8, 4, 8, 5], [8, 5, 12, 5]]).sort());
    assert.equal(wasStraightDrag({ x: 0, y: 0 }, { x: 8, y: 0 }, [{ x: 4, y: 1 }], 4), true);
    assert.equal(wasStraightDrag({ x: 0, y: 0 }, { x: 8, y: 0 }, [{ x: 4, y: 1 }], 1), false);
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

  check('[점 개수] 가구는 점 개수와 상관없이 같은 크기로 벽을 뚫지 않고 들어간다', () => {
    const t = TEMPLATES.find((x) => x.id === 'high-roof')!;
    for (const k of [1, 2, 4]) {
      const plan = fineAll(t, k);
      const layout = analyze(plan);
      const line = routePoints(plan, layout, plan.route);
      for (const cell of layout.cells) {
        const spot = fitFurniture(plan, layout, cell, { w: 0.62, d: 0.9 }, { keepClear: [line], unit: k });
        assert.ok(spot, `×${k}: ${cell.id}`);
        assertFits(plan, cell.id, spot, 0.62 * k, 0.9 * k, `×${k}`);
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

  check('[그린 길] 연습에서 「내가 그린 길로 가기」는 그린 선을 그대로 걷는다 (#161)', () => {
    const flat = (points: Pt[]): string => points.map((p) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`).join(' ');
    /** 그린 길을 끝까지 따라가며 걸은 점을 모은다. 불은 막지 않는다고 본다 */
    const followAll = (plan: Plan, band: Band, label: string): { walked: Pt[]; state: DrillState } => {
      const layout = analyze(plan);
      const config = FIRE[band];
      let state = startDrill(plan, 2, config)!;
      const walked: Pt[] = [state.pt];
      for (let guard = 0; guard < 80 && state.phase === 'inside'; guard++) {
        const leg = followLeg(plan, layout, state, config);
        assert.ok(leg, `${label}: 따라갈 길이 없다`);
        walked.push(...leg.walk);
        if (!leg.move) {
          state = walkInside(plan, state, leg.walk);
          break;
        }
        state = moveTo(plan, layout, state, { ...leg.move, hot: false }, config, leg.walk);
      }
      return { walked, state };
    };
    // 방향키로 그린 길 — 일부러 돌아서 간다
    const base = addEdges(emptyPlan(8, 6), [...box(1, 1, 7, 5), ...segEdges([[4, 1, 4, 5]])]);
    let plan = normalize({ ...base, openings: { [vKey(4, 2)]: 'door', [hKey(5, 5)]: 'door' }, marks: { me: { x: 1.5, y: 1.5 }, meet: { x: 4, y: 5.9 } } });
    const layout = analyze(plan);
    for (const dir of ['down', 'down', 'right', 'right', 'up', 'right', 'right', 'right', 'down', 'down', 'left', 'down'] as ArrowDir[]) {
      const res = arrowRoute(plan, layout, 'route', dir);
      assert.ok(res.result === 'added' || res.result === 'done', `${dir}: ${res.result}`);
      plan = res.plan;
    }
    assert.equal(plan.route[plan.route.length - 1], OUT);
    const drawn = routePoints(plan, layout, plan.route);
    const run = followAll(plan, 'low', '돌아가는 길');
    assert.equal(run.state.phase, 'outside');
    assert.equal(flat(simplifyPts(run.walked)), flat(drawn), '걸은 자리가 그린 선과 같다');
    const done = finishMeet(plan, layout, run.state);
    assert.equal(done.stats.followedRoute, true, '그린 길을 따랐다고 센다');
    // 3D 다시 보기가 쓰는 기록도 같은 자리다
    const replay = simplifyPts(done.timeline.slice(0, -1).flatMap((snap, i) => (i === 0 ? snap.walk : snap.walk.slice(1))));
    assert.equal(flat(replay), flat(drawn), '기록에 남은 자리가 그린 선과 같다');
    // 가장 짧은 길이 아니어도 그린 길로 간다
    const shortest = shortestPath(layout, layout.cellAt.get('1,1')!)!.length;
    assert.equal(run.state.visited.length - 1, shortest, '지나는 칸 수는 같다');
    assert.ok(run.walked.some((p) => p.x === 6.5 && p.y === 2.5), '돌아간 자리를 지난다');
    // 「도와줘」가 고른 길도 그린 선 그대로 걷는다
    for (const t of TEMPLATES) {
      const auto = autoAll(t);
      const helped = followAll(auto, t.band, t.id);
      assert.equal(helped.state.phase, 'outside', t.id);
      assert.equal(flat(simplifyPts(helped.walked)), flat(routePoints(auto, analyze(auto), auto.route)), `${t.id}: 도와줘 길`);
    }
    // 그린 길에서 벗어난 칸에서는 따라갈 수 없고, 길 위의 칸으로 돌아오면 다시 따라간다
    const config = FIRE.low;
    let off = startDrill({ ...plan, route: ['1,1', '2,1'] }, 2, config)!;
    assert.equal(followLeg({ ...plan, route: ['1,1', '2,1'] }, layout, off, config)!.move, null, '칸 안에서 끝나는 길은 끝까지만 걷는다');
    const cross = drillStep(plan, layout, { ...off, pt: { x: 3.5, y: 2.5 } }, 'right', config)!;
    off = moveTo(plan, layout, { ...off, pt: { x: 3.5, y: 2.5 } }, cross.move!, config, cross.walk);
    assert.equal(followLeg({ ...plan, route: ['1,1', '2,1'] }, layout, off, config), null, '길에 없는 칸');
    const again = followLeg(plan, layout, off, config)!;
    assert.ok(again.move && again.move.to === OUT, '길 위의 칸에서는 이어서 간다');
    // 길 위의 문이 뜨거우면 그렇다고 알려 준다 — 화면이 멈추고 다른 길을 찾게 한다
    const hotState = { ...startDrill(plan, 2, config)!, field: { [layout.cellAt.get('5,1')!]: config.levels.hot } };
    assert.equal(followLeg(plan, layout, hotState, config)!.move!.hot, true);
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

  check('[문 방향] 누를 때마다 열리는 쪽과 경첩이 바뀌고 네 번이면 처음으로 돌아온다 (대장 #168)', () => {
    let plan = autoAll(TEMPLATES[0]!);
    const door = Object.keys(plan.openings).find((e) => plan.openings[e] === 'door')!;
    const first = doorSwing(plan, analyze(plan), door);
    assert.equal(doorTurn(plan, door), 0);
    assert.ok(first.hingeAtStart, '처음에는 첫 끝에 경첩이 있다');
    assert.ok(Math.abs(Math.hypot(first.toward.x, first.toward.y) - 1) < 1e-9, '열리는 쪽은 길이 1 인 방향이다');
    const seen: string[] = [];
    for (const expect of [
      { side: -first.side, start: true },
      { side: -first.side, start: false },
      { side: first.side, start: false },
      { side: first.side, start: true },
    ]) {
      plan = turnDoor(plan, door);
      const now = doorSwing(plan, analyze(plan), door);
      assert.equal(now.side, expect.side, '열리는 쪽');
      assert.equal(now.hingeAtStart, expect.start, '경첩 자리');
      assert.equal(now.toward.x * first.toward.x + now.toward.y * first.toward.y > 0, expect.side === first.side, '방향이 쪽을 따른다');
      seen.push(`${now.side}${now.hingeAtStart}`);
    }
    assert.equal(new Set(seen).size, 4, '네 가지가 모두 다르다');
    assert.equal(plan.doorTurns, undefined, '처음으로 돌아오면 적어 두지 않는다');
  });

  check('[문 방향] 문이 아니면 돌지 않고, 문을 떼면 방향도 사라지며, 점 개수를 바꿔도 남는다', () => {
    const base = autoAll(TEMPLATES[0]!);
    const door = Object.keys(base.openings).find((e) => base.openings[e] === 'door')!;
    const turned = turnDoor(base, door);
    assert.equal(doorTurn(turned, door), 1);
    // 문 아닌 벽
    const wall = turned.walls.find((w) => !turned.openings[w])!;
    assert.equal(turnDoor(turned, wall), turned, '벽은 그대로다');
    // 틈으로 바꾸면 방향이 사라진다
    const gap = toggleOpening(turned, analyze(turned), door, 'gap');
    assert.ok(gap.ok && gap.plan.doorTurns === undefined, '틈에는 문짝이 없다');
    // 뗐다가 다시 달면 처음 방향이다
    const off = toggleOpening(turned, analyze(turned), door, 'door');
    assert.ok(off.ok && off.plan.doorTurns === undefined, '문을 떼면 사라진다');
    const on = toggleOpening(off.plan, analyze(off.plan), door, 'door');
    assert.ok(on.ok && doorTurn(on.plan, door) === 0, '다시 달면 처음 방향이다');
    // 점을 배로 늘려도 돌린 문은 하나 그대로다
    const fine = changeGrid(turned, turned.cols * 2, turned.rows * 2);
    assert.deepEqual(Object.values(fine.doorTurns ?? {}), [1], '점 개수를 바꿔도 남는다');
    assert.ok(Object.keys(fine.doorTurns ?? {}).every((e) => fine.openings[e] === 'door'), '문에 붙어 있다');
    // 저장된 값이 이상해도 버린다
    assert.equal(normalize({ ...base, doorTurns: { [door]: 7, 'h:99:99': 1 } }).doorTurns, undefined);
  });

  check('[문 크기] 한 단계씩 커지고 작아지며, 곧게 이어진 벽을 넘지 않는다 (대장 #170)', () => {
    // 가로 6 칸짜리 벽 가운데에 문 하나
    const base = normalize({ ...addEdges(emptyPlan(10, 7), box(1, 1, 7, 4)), openings: { [hKey(3, 4)]: 'door' } });
    const door = hKey(3, 4);
    let plan = base;
    assert.equal(doorSize(plan, door), 1);
    assert.equal(openingWidth(plan, analyze(plan), door), 1, '처음 크기는 한 칸이다');
    const widths: number[] = [];
    for (;;) {
      const next = resizeDoor(plan, analyze(plan), door, 1);
      if (next === plan) break;
      plan = next;
      widths.push(openingWidth(plan, analyze(plan), door));
    }
    assert.deepEqual(widths, [1.3, 1.6, 2], '끝까지 커진다');
    assert.equal(nextDoorSize(plan, analyze(plan), door, 1), null, '더 커지지 않는다');
    for (let i = 0; i < DOOR_SIZES.length; i++) plan = resizeDoor(plan, analyze(plan), door, -1);
    assert.equal(doorSize(plan, door), DOOR_SIZES[0], '가장 작은 데서 멈춘다');
    assert.equal(openingWidth(plan, analyze(plan), door), 0.6);
    assert.equal(resizeDoor(plan, analyze(plan), door, -1), plan, '더 작아지지 않는다');
    // 벽 끝에 붙은 문은 벽을 넘지 않는다 — 문 가운데에서 가까운 벽 끝까지의 두 배가 끝이다
    const edge = normalize({ ...addEdges(emptyPlan(10, 7), box(1, 1, 7, 4)), openings: { [hKey(1, 4)]: 'door' } });
    assert.equal(nextDoorSize(edge, analyze(edge), hKey(1, 4), 1), null, '모서리 옆 문은 더 커지지 않는다');
    assert.equal(resizeDoor(edge, analyze(edge), hKey(1, 4), 1), edge);
    const second = normalize({ ...addEdges(emptyPlan(10, 7), box(1, 1, 7, 4)), openings: { [hKey(2, 4)]: 'door' } });
    let grown = second;
    for (let i = 0; i < 5; i++) grown = resizeDoor(grown, analyze(grown), hKey(2, 4), 1);
    assert.ok(openingWidth(grown, analyze(grown), hKey(2, 4)) <= 3 + 1e-9, '벽 끝을 넘지 않는다');
    // 창과 벽은 그대로다
    assert.equal(resizeDoor(base, analyze(base), hKey(4, 4), 1), base, '벽은 그대로다');
    // 문을 떼면 크기도 사라지고, 점 개수를 바꿔도 남으며, 이상한 값은 버린다
    const big = resizeDoor(base, analyze(base), door, 1);
    assert.deepEqual(big.doorSizes, { [door]: 1.3 });
    const off = toggleOpening(big, analyze(big), door, 'door');
    assert.ok(off.ok && off.plan.doorSizes === undefined);
    const fine = changeGrid(big, 20, 14);
    assert.deepEqual(Object.values(fine.doorSizes ?? {}), [1.3], '점 개수를 바꿔도 남는다');
    assert.ok(Math.abs(openingWidth(fine, analyze(fine), Object.keys(fine.doorSizes!)[0]!) - 1.3) < 1e-9, '촘촘한 모눈에서도 같은 크기다');
    assert.equal(normalize({ ...base, doorSizes: { [door]: 9, [hKey(4, 4)]: 1.3 } }).doorSizes, undefined);
    // 방향과 크기는 따로 바뀐다
    const both = turnDoor(big, door);
    assert.equal(doorTurn(both, door), 1);
    assert.equal(doorSize(both, door), 1.3);
  });

  check('[소화기] 여럿 놓고, 누르면 치우고, 빈 자리를 누르면 마지막 것을 옮긴다 (대장 #169)', () => {
    let plan = addEdges(emptyPlan(8, 6), box(1, 1, 6, 5));
    const at = (x: number, y: number): Pt => ({ x, y });
    const put = (p: Plan, pt: Pt): Plan => placeMark(p, analyze(p), 'extinguisher', pt).plan;
    const add = (p: Plan, pt: Pt) => addExtinguisher(p, analyze(p), pt);
    assert.equal(markDone(plan, 'extinguisher'), false);
    plan = put(plan, at(1.5, 1.5));
    assert.deepEqual(extinguishers(plan), [at(1.5, 1.5)]);
    assert.ok(markDone(plan, 'extinguisher'));
    // 그냥 누르면 더 놓이지 않고 옮겨진다
    plan = put(plan, at(2.5, 1.5));
    assert.deepEqual(extinguishers(plan), [at(2.5, 1.5)], '옮겨진다');
    // 하나 더
    let res = add(plan, at(4.5, 3.5));
    assert.ok(res.ok);
    plan = res.plan;
    assert.deepEqual(extinguishers(plan), [at(2.5, 1.5), at(4.5, 3.5)]);
    assert.equal(add(plan, at(4.5, 3.5)).plan, plan, '같은 자리에는 겹쳐 놓지 않는다');
    assert.equal(add(plan, at(7.5, 0.5)).ok, false, '집 밖에는 놓지 않는다');
    // 빈 자리를 누르면 마지막 것이 옮겨진다
    plan = put(plan, at(4.5, 4.5));
    assert.deepEqual(extinguishers(plan), [at(2.5, 1.5), at(4.5, 4.5)]);
    // 끝까지 채우면 더 놓이지 않는다
    for (const x of [1.5, 3.5, 5.5]) {
      res = add(plan, at(x, 2.5));
      if (res.ok) plan = res.plan;
    }
    assert.equal(extinguishers(plan).length, MAX_EXTINGUISHERS);
    const over = add(plan, at(5.5, 4.5));
    assert.ok(!over.ok && over.why === 'full', '끝을 넘지 않는다');
    // 첫째를 눌러 치우면 다음 것이 첫째가 된다
    plan = put(plan, at(2.5, 1.5));
    assert.equal(extinguishers(plan).length, MAX_EXTINGUISHERS - 1);
    assert.deepEqual(plan.marks.extinguisher, at(4.5, 4.5));
    // 다른 표시를 소화기 자리에 놓으면 그 소화기는 치워진다
    const me = placeMark(plan, analyze(plan), 'me', at(1.5, 2.5)).plan;
    assert.ok(!extinguishers(me).some((e) => e.x === 1.5 && e.y === 2.5), '한 조각에 표시 하나만');
    assert.deepEqual(me.marks.me, at(1.5, 2.5));
    // 점 개수를 바꿔도 수가 같다
    assert.equal(extinguishers(changeGrid(plan, 16, 12)).length, extinguishers(plan).length);
    // 칸이 없어지면 함께 사라진다
    assert.deepEqual(extinguishers(removeWall(plan, hKey(1, 1))), []);
  });

  check('[소화기] 「우리 집에 없어」는 놓은 것을 치우고, 놓으면 풀리며, 도와줘가 놓지 않는다 (대장 #169)', () => {
    let plan = autoTag(addEdges(emptyPlan(8, 6), box(1, 1, 6, 5)), 'low');
    plan = placeMark(plan, analyze(plan), 'extinguisher', { x: 2.5, y: 2.5 }).plan;
    plan = addExtinguisher(plan, analyze(plan), { x: 3.5, y: 2.5 }).plan;
    plan = setNoExtinguisher(plan, true);
    assert.deepEqual(extinguishers(plan), []);
    assert.equal(plan.noExtinguisher, true);
    assert.ok(markDone(plan, 'extinguisher'), '없다고 고른 것도 할 일을 마친 것이다');
    for (const band of ['low', 'mid', 'high'] as Band[]) {
      const helped = autoMarks(plan, band);
      assert.deepEqual(extinguishers(helped), [], `${band}: 없는 집에 놓지 않는다`);
      assert.equal(helped.noExtinguisher, true);
    }
    assert.equal(setNoExtinguisher(plan, false).noExtinguisher, undefined, '다시 누르면 풀린다');
    const placed = placeMark(plan, analyze(plan), 'extinguisher', { x: 2.5, y: 2.5 }).plan;
    assert.equal(placed.noExtinguisher, undefined, '놓으면 풀린다');
    assert.equal(extinguishers(placed).length, 1);
  });

  check('[소화기] 전 학년이 놓고, 도와줘가 하나를 놓는다 (대장 #169)', () => {
    for (const band of ['low', 'mid', 'high'] as Band[]) {
      assert.ok(BANDS[band].marks.includes('extinguisher'), `${band}: 소화기를 놓는다`);
      for (const t of templatesFor(band)) {
        const plan = autoAll(t);
        assert.equal(extinguishers(plan).length, 1, `${t.id}: 하나를 놓는다`);
        assert.ok(cellIdAt(analyze(plan), plan.marks.extinguisher!), `${t.id}: 집 안이다`);
        assert.ok(BANDS[band].marks.every((m) => markDone(plan, m)), `${t.id}: 표시를 다 놓는다`);
      }
    }
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

  check('[놀이] 안전 행동이 길 위에 놓이고, 지나가면 주워 도장이 된다', () => {
    for (const t of TEMPLATES) {
      const plan = autoAll(t);
      const layout = analyze(plan);
      const config = FIRE[t.band];
      const wanted = stampSlots(t.band).filter((id): id is TokenId => id === 'shout' || id === 'nose' || id === 'stairs');
      let state = startDrill(plan, 3, config, wanted)!;
      const start = state.at;
      assert.ok(state.tokens!.some((k) => k.id === 'shout' && k.cell === start), `${t.id}: 불이야는 내 자리 칸에 있다`);
      for (const token of state.tokens!) {
        if (token.cell === OUT) assert.equal(cellIdAt(layout, token.pt), undefined, `${t.id}: 계단은 집 밖에 있다`);
        else assert.equal(cellIdAt(layout, token.pt), token.cell, `${t.id}: ${token.id} 가 제 칸 안에 있다`);
      }
      assert.deepEqual(earnedStamps(state, t.band), [], '시작할 때는 도장이 없다');
      for (const hop of shortestPath(layout, state.at)!) {
        const mv = drillMoves(layout, state, config).find((m) => m.to === hop.to)!;
        state = moveTo(plan, layout, state, mv, config);
      }
      assert.deepEqual(state.tokens, [], `${t.id}: 가장 짧은 길로 가면 다 줍는다`);
      const done = finishMeet(plan, layout, state);
      const stamps = earnedStamps(done, t.band);
      for (const id of [...wanted, 'meet'] as const) assert.ok(stamps.includes(id), `${t.id}: ${id} 도장`);
      assert.ok(stamps.every((id) => stampSlots(t.band).includes(id)), '학년에 없는 도장은 찍히지 않는다');
    }
    // 예전 기록에는 주운 것이 없다. 그래도 도장을 고를 수 있다
    const old = walkOut(autoAll(TEMPLATES[0]!), 1, TEMPLATES[0]!.band);
    delete old.tokens;
    delete old.picked;
    assert.ok(earnedStamps(old, TEMPLATES[0]!.band).includes('meet'));
  });

  check('[놀이] 칸 안에서 걷다가 가까이 가면 안전 행동을 줍고, 차례는 넘어가지 않는다', () => {
    const plan = autoAll(TEMPLATES[0]!);
    const config = FIRE[TEMPLATES[0]!.band];
    const state = startDrill(plan, 1, config, ['shout'])!;
    const token = state.tokens![0]!;
    const far = walkInside(plan, state, [{ x: token.pt.x + 5, y: token.pt.y + 5 }]);
    assert.deepEqual(far.picked, [], '멀리서는 줍지 않는다');
    const next = walkInside(plan, state, [token.pt]);
    assert.deepEqual(next.picked, ['shout']);
    assert.deepEqual(next.tokens, []);
    assert.deepEqual(walkInside(plan, next, [token.pt]).picked, ['shout'], '두 번 줍지 않는다');
    assert.equal(next.turn, state.turn, '칸 안에서 걸어도 차례는 그대로다');
    assert.deepEqual(next.field, state.field, '위험이 번지지 않는다');
    assert.equal(next.timeline.length, state.timeline.length);
    assert.deepEqual(next.timeline[0]!.walk, [state.pt, token.pt], '걸은 자리는 기록에 남는다');
    assert.deepEqual(next.pt, token.pt);
  });

  check('[집 밖] 방향키로 한 걸음씩 걷고, 집 안으로 들어가지 않으며, 안전한 곳에 닿는다', () => {
    for (const t of TEMPLATES) {
      const plan = autoAll(t);
      const layout = analyze(plan);
      const done = walkOut(plan, 2, t.band);
      const walk = done.timeline[done.timeline.length - 1]!.walk;
      const meet = plan.marks.meet!;
      assert.deepEqual(walk[walk.length - 1], meet, `${t.id}: 안전한 곳에서 끝난다`);
      for (let i = 1; i < walk.length; i++) {
        const a = walk[i - 1]!;
        const b = walk[i]!;
        for (let k = 1; k < 8; k++) {
          const p = { x: a.x + ((b.x - a.x) * k) / 8, y: a.y + ((b.y - a.y) * k) / 8 };
          assert.equal(cellIdAt(layout, p), undefined, `${t.id}: 집 밖 길이 집을 뚫지 않는다`);
        }
      }
      // 한 걸음씩 걸어도 닿는다
      let at = walk[0]!;
      let arrived = false;
      for (let guard = 0; guard < 200 && !arrived; guard++) {
        const dirs = (['down', 'up', 'right', 'left'] as const)
          .map((dir) => ({ dir, next: stepOutside(plan, layout, at, dir) }))
          .filter((o) => o.next)
          .sort((p, q) => Math.hypot(p.next!.pt.x - meet.x, p.next!.pt.y - meet.y) - Math.hypot(q.next!.pt.x - meet.x, q.next!.pt.y - meet.y));
        assert.ok(dirs.length > 0, `${t.id}: 갈 수 있는 쪽이 있다`);
        at = dirs[0]!.next!.pt;
        arrived = dirs[0]!.next!.arrived;
        if (!arrived) assert.equal(cellIdAt(layout, at), undefined);
      }
      assert.ok(outsidePath(plan, layout, walk[0]!).length >= 2);
    }
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

  /* ───────────── 대장 #137 ───────────── */
  const twoRooms = (): Plan => addEdges(emptyPlan(8, 6), [...box(1, 1, 7, 5), ...segEdges([[4, 1, 4, 5]])]);

  check('[#137 틈] 지우개로 긴 벽을 한 칸만 지우면 문 없는 입구가 되고, 이어서 지우면 칸이 합쳐진다', () => {
    const base = twoRooms();
    assert.equal(analyze(base).cells.length, 2);
    const gap = eraseWall(base, vKey(4, 2));
    const layout = analyze(gap);
    assert.equal(gap.openings[vKey(4, 2)], 'gap', '틈이 된다');
    assert.equal(layout.cells.length, 2, '두 칸은 따로 남는다');
    assert.ok(layout.links.some((l) => l.open && l.b !== OUT), '틈으로 이어진다');
    const merged = eraseWall(gap, vKey(4, 3));
    assert.equal(analyze(merged).cells.length, 1, '옆까지 지우면 합쳐진다');
    assert.ok(!Object.values(merged.openings).includes('gap'), '틈도 함께 사라진다');
    assert.equal(analyze(eraseWall(gap, vKey(4, 2))).cells.length, 1, '틈을 다시 지우면 없어진다');
    // 겉벽에 낸 틈은 밖으로 나가는 곳이다
    const exit = analyze(eraseWall(base, hKey(2, 5)));
    assert.ok(exit.links.some((l) => l.b === OUT && l.open), '겉벽의 틈으로 나간다');
    assert.equal(exit.cells.length, 2, '집은 닫힌 채다');
    // 옆 벽이 지워져 허공에 남은 틈은 함께 지운다
    const loose = normalize({ ...gap, walls: gap.walls.filter((w) => w !== vKey(4, 1) && w !== vKey(4, 3) && w !== vKey(4, 4)) });
    assert.ok(!loose.walls.includes(vKey(4, 2)), '허공의 틈은 남지 않는다');
  });

  check('[#137 틈] 테두리에 입구를 남기고 그려도 집이 닫히고, 틈 위에 그으면 벽으로 메워진다', () => {
    const drawn = addStroke(emptyPlan(8, 6), [{ x: 1, y: 1 }, { x: 7, y: 1 }, { x: 7, y: 5 }, { x: 1, y: 5 }, { x: 1, y: 2 }]);
    const layout = analyze(drawn);
    assert.equal(drawn.openings[vKey(1, 1)], 'gap', '한 칸 빈 자리가 틈이 된다');
    assert.equal(layout.cells.length, 1, '집이 닫힌다');
    assert.ok(layout.links.some((l) => l.b === OUT && l.open), '틈이 나가는 곳이다');
    const filled = addStroke(drawn, [{ x: 1, y: 2 }, { x: 1, y: 1 }]);
    assert.equal(filled.openings[vKey(1, 1)], undefined, '그으면 메워진다');
    assert.equal(analyze(filled).links.length, 0);
    // 두 칸 넘게 빈 자리는 틈이 아니다
    const wide = addStroke(emptyPlan(8, 6), [{ x: 1, y: 1 }, { x: 7, y: 1 }, { x: 7, y: 5 }, { x: 1, y: 5 }, { x: 1, y: 3 }]);
    assert.equal(analyze(wide).cells.length, 0, '넓게 빈 테두리는 닫히지 않는다');
  });

  check('[#137 트인 곳] 문 달기의 트인 곳은 문짝 없이 지나가고, 다시 누르면 벽으로 돌아온다', () => {
    const base = twoRooms();
    const res = toggleOpening(base, analyze(base), vKey(4, 3), 'gap');
    assert.ok(res.ok);
    const layout = analyze(res.plan);
    const link = layout.links.find((l) => l.edge === vKey(4, 3));
    assert.ok(link?.open, '트인 곳으로 이어진다');
    const back = toggleOpening(res.plan, layout, vKey(4, 3), 'gap');
    assert.ok(back.ok && back.plan.walls.includes(vKey(4, 3)) && !back.plan.openings[vKey(4, 3)], '다시 누르면 벽이다');
  });

  check('[#137 트인 칸] 거실과 부엌처럼 트인 칸끼리는 문 없이 이어지고, 문을 달면 그 문을 쓴다', () => {
    const base = twoRooms();
    const tagged = (right: string, kind: 'room' | 'pass'): Plan =>
      normalize({ ...base, tags: { [sqKey(1, 1)]: { kind: 'pass', name: 'living' }, [sqKey(4, 1)]: { kind, name: right } } });
    const open = analyze(tagged('kitchen', 'room'));
    assert.equal(open.links.length, 1, '줄 하나에 이음 하나');
    assert.ok(open.links[0]!.auto && open.links[0]!.open);
    assert.equal(open.openEdges.length, 4, '맞닿은 토막이 모두 점선이다');
    assert.equal(unreachableCells(open).length, 2, '밖으로 나가는 문은 따로 달아야 한다');
    const closed = analyze(tagged('bath', 'room'));
    assert.equal(closed.links.length, 0, '화장실은 문이 있어야 한다');
    assert.equal(closed.openEdges.length, 0);
    const doored = analyze(normalize({ ...tagged('kitchen', 'room'), openings: { [vKey(4, 2)]: 'door' } }));
    assert.equal(doored.links.length, 1);
    assert.ok(!doored.links[0]!.auto, '문을 달면 그 문으로 다닌다');
    assert.equal(doored.openEdges.length, 0);
    // 도와줘는 트인 칸 사이에 문을 더 달지 않는다
    const helped = autoDoors(tagged('kitchen', 'room'));
    assert.equal(Object.values(helped.openings).filter((o) => o === 'door').length, 1, '나가는 문 하나면 된다');
    assert.equal(unreachableCells(analyze(helped)).length, 0);
  });

  check('[#137 가구] 동서남북으로 돌리고 크기를 바꾸며, 돌린 가구는 옮겨도 방향을 지킨다', () => {
    const base = twoRooms();
    const layout = analyze(base);
    const placed = placeItem(base, layout, 'bed', { x: 2.5, y: 2.5 });
    assert.ok(placed.ok);
    let plan = placed.plan;
    const seen = new Set<number>();
    for (let i = 0; i < 4; i++) {
      plan = turnItem(plan, 0);
      assert.equal(plan.items![0]!.angle % 90, 0, '직각으로만 돈다');
      seen.add(plan.items![0]!.angle);
    }
    assert.equal(seen.size, 4, '네 방향을 다 돈다');
    assert.equal(plan.items![0]!.turned, true);
    const moved = moveItem(plan, layout, 0, { x: 5.5, y: 3.5 });
    assert.ok(moved.ok && moved.plan.items![0]!.angle === plan.items![0]!.angle, '옮겨도 방향이 그대로다');
    assert.equal(itemSize(plan.items![0]!), 1);
    let big = plan;
    for (let i = 0; i < 10; i++) big = resizeItem(big, 0, 1);
    assert.equal(itemSize(big.items![0]!), ITEM_SIZES[ITEM_SIZES.length - 1], '가장 크게에서 멈춘다');
    let small = plan;
    for (let i = 0; i < 10; i++) small = resizeItem(small, 0, -1);
    assert.equal(itemSize(small.items![0]!), ITEM_SIZES[0], '가장 작게에서 멈춘다');
    assert.equal(resizeItem(resizeItem(plan, 0, 1), 0, -1).items![0]!.size, undefined, '제 크기는 적지 않는다');
    assert.equal(removeItem(plan, 0).items!.length, 0);
    assert.deepEqual(normalize(big).items, big.items, '정리해도 크기와 방향이 남는다');
  });

  check('[#137 불] 화장실과 대피공간에서는 시작하지 않고 부엌이 가장 잦으며, 작게 시작해 천천히 자란다', () => {
    for (const band of ['low', 'mid', 'high'] as const) {
      const config = FIRE[band];
      const plan = homeAll('home-3w', band, BANDS[band].start[0], BANDS[band].start[1]);
      const layout = analyze(plan);
      const startCell = cellIdAt(layout, plan.marks.me!)!;
      const counts = new Map<string, number>();
      for (let seed = 0; seed < 300; seed++) {
        const picked = pickSource(plan, layout, startCell, seed, config);
        const name = layout.byId.get(picked.source)!.name ?? '';
        counts.set(name, (counts.get(name) ?? 0) + 1);
        const state = startDrill(plan, seed, config)!;
        assert.ok(state.field[state.source]! <= config.start, `${band} ${seed}: 작게 시작한다`);
        assert.ok(state.field[state.source]! < config.levels.hot, `${band} ${seed}: 처음에는 뜨겁지 않다`);
        assert.equal(cellIdAt(layout, state.origin), state.source, `${band} ${seed}: 시작한 자리가 그 칸 안이다`);
        if (plan.marks.gas && cellIdAt(layout, plan.marks.gas) === state.source) assert.deepEqual(state.origin, plan.marks.gas, '가스레인지에서 시작한다');
      }
      assert.equal(counts.get('bath') ?? 0, 0, `${band}: 화장실에서는 시작하지 않는다`);
      assert.equal(counts.get('refuge') ?? 0, 0, `${band}: 대피공간에서는 시작하지 않는다`);
      const top = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
      assert.equal(top, 'kitchen', `${band}: 부엌이 가장 잦다 — ${JSON.stringify([...counts])}`);
      assert.ok(counts.size >= 3, `${band}: 여러 칸에서 고르게 난다`);
      // 한 차례에 다 타지 않는다. 뜨거워지기까지도, 막히기까지도 차례가 걸린다
      let field = { a: config.start };
      let turns = 0;
      while (field.a < config.params.max) {
        field = stepField(field, [], ['a'], config.params) as { a: number };
        turns += 1;
      }
      assert.ok(turns >= 2, `${band}: 막히기까지 ${turns}차례`);
      // 이웃 칸은 연기가 먼저 들고 한참 뒤에 막힌다
      let both: Record<string, number> = { a: config.start };
      let light = 0;
      let blocked = 0;
      for (let t = 1; t <= 40 && !blocked; t++) {
        both = stepField(both, [{ a: 'a', b: 'b', closed: false }], ['a'], config.params);
        if (!light && (both.b ?? 0) >= config.levels.light) light = t;
        if ((both.b ?? 0) >= config.levels.blocked) blocked = t;
      }
      assert.ok(light >= 1 && blocked >= light + 3, `${band}: 연기 ${light}차례, 막힘 ${blocked}차례`);
    }
  });

  check('[#137 모눈] 새 종이는 처음 네모보다 촘촘하고 고를 수 있는 개수 안에 있다', () => {
    for (const band of Object.values(BANDS)) {
      const [c, r] = band.start;
      assert.ok(c > band.cols && r > band.rows, `${band.id}: 더 촘촘하다`);
      assert.ok(band.grids.some(([gc, gr]) => gc === c && gr === r), `${band.id}: 점 개수 단추로 닿는다`);
      const plan = changeGrid(emptyPlan(band.cols, band.rows), c, r);
      assert.equal(plan.cols, c);
      assert.ok(densityOf(plan) > 1 && densityOf(plan) < 2);
      assert.equal(Math.round(plan.cols / densityOf(plan)), band.cols, `${band.id}: 학년 단계를 알아볼 수 있다`);
    }
  });

  check('[방 넣기] 방을 놓으면 벽 네 줄과 이름이 한 번에 생기고, 옮기고 키워도 지나간 자리에 벽이 남지 않는다 (대장 #175)', () => {
    const base = emptyPlan(8, 6);
    const draft: RoomDraft = { rect: { x: 1, y: 1, w: 3, h: 2 }, tag: { kind: 'room', name: 'kitchen' }, open: null };
    const placed = stampRoom(base, draft);
    assert.ok(placed.ok);
    const cell = analyze(placed.plan).cells;
    assert.equal(cell.length, 1, '칸이 하나 생긴다');
    assert.deepEqual([cell[0]!.kind, cell[0]!.name, cell[0]!.area], ['room', 'kitchen', 6]);
    assert.equal(placed.plan.walls.length, 10, '벽 네 줄');
    assert.deepEqual(base.walls, [], '받은 지도는 바꾸지 않는다');
    // 옮기고 키울 때마다 놓기 전 지도에서 다시 짓는다
    const moved = stampRoom(base, { ...draft, rect: moveRoom(base, draft.rect, 2, 1) });
    assert.ok(moved.ok);
    assert.equal(moved.plan.walls.length, 10, '옮긴 뒤에도 벽은 네 줄뿐이다');
    assert.ok(moved.plan.walls.includes(hKey(3, 2)) && !moved.plan.walls.includes(hKey(1, 1)), '옛 자리의 벽은 없다');
    const wider = resizeRoom(base, draft.rect, 'w', 1)!;
    assert.deepEqual(wider, { x: 1, y: 1, w: 4, h: 2 }, '오른쪽으로 는다');
    const grown = stampRoom(base, { ...draft, rect: wider });
    assert.ok(grown.ok);
    assert.equal(analyze(grown.plan).cells[0]!.area, 8);
    assert.equal(grown.plan.walls.length, 12);
    // 종이 끝에서는 멈추고, 끝에 붙은 방은 반대쪽으로 는다
    assert.deepEqual(moveRoom(base, draft.rect, 99, 99), { x: 5, y: 4, w: 3, h: 2 });
    assert.deepEqual(moveRoom(base, draft.rect, -99, -99), { x: 0, y: 0, w: 3, h: 2 });
    assert.deepEqual(resizeRoom(base, { x: 5, y: 1, w: 3, h: 2 }, 'w', 1), { x: 4, y: 1, w: 4, h: 2 });
    assert.deepEqual(resizeRoom(base, { x: 1, y: 4, w: 3, h: 2 }, 'h', 1), { x: 1, y: 3, w: 3, h: 3 });
    // 한 칸보다 작아지지 않고 종이보다 커지지 않는다
    assert.equal(resizeRoom(base, { x: 1, y: 1, w: 1, h: 2 }, 'w', -1), null);
    assert.equal(resizeRoom(base, { x: 0, y: 0, w: 8, h: 2 }, 'w', 1), null);
    assert.deepEqual(fitRoom(base, { x: -3, y: 9, w: 20, h: 0 }), { x: 0, y: 5, w: 8, h: 1 });
    // 점이 촘촘하면 처음 네모 한 칸이 가장 작은 방이고 반 칸씩 바뀐다
    const dense = changeGrid(emptyPlan(8, 6), 32, 24);
    assert.equal(roomUnit(dense), 4);
    assert.equal(roomStep(dense), 2);
    assert.deepEqual(roomSize(dense, [3, 2]), { w: 12, h: 8 });
    assert.equal(resizeRoom(dense, { x: 0, y: 0, w: 4, h: 4 }, 'w', -1), null, '한 칸 아래로는 줄지 않는다');
  });

  check('[방 넣기] 안쪽에 벽이 지나가는 자리에는 놓지 않고, 벽을 함께 쓰는 옆자리에는 놓는다 (대장 #175)', () => {
    const base = emptyPlan(8, 6);
    const living = stampRoom(base, { rect: { x: 1, y: 1, w: 3, h: 3 }, tag: { kind: 'pass', name: 'living' }, open: null });
    assert.ok(living.ok);
    const over = stampRoom(living.plan, { rect: { x: 3, y: 1, w: 3, h: 2 }, tag: { kind: 'room', name: 'kitchen' }, open: null });
    assert.deepEqual([over.ok, over.ok ? '' : over.why], [false, 'wall'], '겹치면 놓지 않는다');
    assert.equal(over.plan, living.plan, '지도는 그대로다');
    const out = stampRoom(living.plan, { rect: { x: 6, y: 4, w: 3, h: 3 }, tag: { kind: 'room', name: null }, open: null });
    assert.deepEqual([out.ok, out.ok ? '' : out.why], [false, 'out'], '종이 밖으로는 놓지 않는다');
    const half = stampRoom(living.plan, { rect: { x: 4.5, y: 1, w: 2, h: 2 }, tag: { kind: 'room', name: null }, open: null });
    assert.equal(half.ok, false, '점이 아닌 자리에는 놓지 않는다');
    // 벽을 함께 쓰는 옆자리 — 부엌과 거실은 트인 칸이라 맞닿은 벽이 점선이 되고 문 없이 지나간다
    const side = stampRoom(living.plan, { rect: { x: 4, y: 1, w: 2, h: 2 }, tag: { kind: 'room', name: 'kitchen' }, open: null });
    assert.ok(side.ok);
    const layout = analyze(side.plan);
    assert.equal(layout.cells.length, 2);
    assert.equal(side.plan.walls.length, 12 + 8 - 2, '맞닿은 벽은 하나다');
    assert.equal(layout.openEdges.length, 2, '트인 칸끼리 맞닿은 벽');
    assert.equal(layout.links.filter((l) => l.auto).length, 1, '문 없이 이어진다');
    // 같은 자리에 다시 놓으면 이름만 바뀐다
    const again = stampRoom(side.plan, { rect: { x: 4, y: 1, w: 2, h: 2 }, tag: { kind: 'room', name: 'bath' }, open: null });
    assert.ok(again.ok);
    assert.deepEqual(analyze(again.plan).cells.map((c) => c.name).sort(), ['bath', 'living']);
    assert.equal(again.plan.walls.length, side.plan.walls.length);
    // 집 테두리 안에 방을 놓으면 칸이 나뉘고, 큰 칸은 이름을 지킨다. 이름표가 방 자리에 있었어도 그렇다
    const house = addEdges(base, box(0, 0, 8, 6));
    const painted = paintCell(house, analyze(house), analyze(house).cells[0]!.id, { kind: 'pass', name: 'living' });
    for (const rect of [{ x: 0, y: 0, w: 3, h: 2 }, { x: 5, y: 4, w: 3, h: 2 }, { x: 2, y: 2, w: 2, h: 2 }]) {
      const inner = stampRoom(painted, { rect, tag: { kind: 'room', name: 'main' }, open: null });
      assert.ok(inner.ok);
      const cells = analyze(inner.plan).cells;
      assert.deepEqual(cells.map((c) => c.name).sort(), ['living', 'main'], `방 ${rect.x},${rect.y}: 두 칸 다 이름이 있다`);
      assert.equal(cells.find((c) => c.name === 'main')!.area, rect.w * rect.h);
    }
    // 가구와 표시는 방을 옆에 놓아도 그대로 남는다
    const marked = placeMark(living.plan, analyze(living.plan), 'me', { x: 2.5, y: 2.5 });
    assert.ok(marked.ok);
    const kept = stampRoom(marked.plan, { rect: { x: 4, y: 1, w: 2, h: 2 }, tag: { kind: 'room', name: 'main' }, open: null });
    assert.ok(kept.ok && kept.plan.marks.me, '내 자리가 남는다');
  });

  check('[방 넣기] 부엌의 트인 쪽은 가운데가 문 없는 입구가 되고, 쪽을 바꾸면 앞의 것은 사라진다 (대장 #176)', () => {
    assert.ok(canOpenSide('kitchen') && !canOpenSide('room') && !canOpenSide('living'), '트인 쪽은 부엌만 고른다');
    const base = emptyPlan(8, 6);
    const living = stampRoom(base, { rect: { x: 1, y: 1, w: 3, h: 3 }, tag: { kind: 'pass', name: 'living' }, open: null });
    assert.ok(living.ok);
    const kitchen: RoomDraft = { rect: { x: 4, y: 1, w: 3, h: 2 }, tag: { kind: 'room', name: 'kitchen' }, open: 'left' };
    const left = stampRoom(living.plan, kitchen);
    assert.ok(left.ok);
    assert.deepEqual(Object.entries(left.plan.openings), [[vKey(4, 1), 'gap']], '거실 쪽 벽의 가운데가 트인다');
    const joined = analyze(left.plan).links.filter((l) => l.b !== OUT);
    assert.equal(joined.length, 1);
    assert.ok(joined[0]!.open, '문짝이 없어 닫을 수 없다');
    // 다른 쪽으로 바꾸면 놓기 전 지도에서 다시 지으므로 앞의 틈은 없다. 겉벽의 틈은 밖으로 나가는 곳이다
    const top = stampRoom(living.plan, { ...kitchen, open: 'top' });
    assert.ok(top.ok);
    assert.deepEqual(Object.keys(top.plan.openings), [hKey(5, 1)], '가운데 조각 하나');
    assert.ok(analyze(top.plan).links.some((l) => l.edge === hKey(5, 1) && l.b === OUT));
    const none = stampRoom(living.plan, { ...kitchen, open: null });
    assert.ok(none.ok);
    assert.deepEqual(none.plan.openings, {}, '없음을 고르면 벽이다');
    for (const sideName of ['top', 'bottom', 'left', 'right'] as const) {
      const one = stampRoom(living.plan, { ...kitchen, open: sideName });
      assert.ok(one.ok);
      assert.equal(Object.values(one.plan.openings).filter((o) => o === 'gap').length, 1, `${sideName}: 틈 하나`);
      assert.equal(analyze(one.plan).cells.length, 2, `${sideName}: 칸은 그대로 둘이다`);
    }
    // 이미 문이 달린 자리는 문을 그대로 둔다
    const door = toggleOpening(living.plan, analyze(living.plan), vKey(4, 1), 'door');
    assert.ok(door.ok);
    const kept = stampRoom(door.plan, kitchen);
    assert.ok(kept.ok);
    assert.equal(kept.plan.openings[vKey(4, 1)], 'door');
    // 점이 촘촘하면 처음 네모 한 칸 폭만큼 이어서 트인다
    const dense = changeGrid(emptyPlan(8, 6), 16, 12);
    assert.deepEqual(roomGapEdges(dense, { x: 2, y: 2, w: 6, h: 4 }, 'bottom'), [hKey(4, 6), hKey(5, 6)]);
    const wide = stampRoom(dense, { rect: { x: 2, y: 2, w: 6, h: 4 }, tag: { kind: 'room', name: 'kitchen' }, open: 'bottom' });
    assert.ok(wide.ok);
    assert.equal(Object.values(wide.plan.openings).filter((o) => o === 'gap').length, 2);
    assert.equal(analyze(wide.plan).cells.length, 1);
  });

  check('[방 넣기] 크레용마다 처음 크기가 있고, 누른 자리에 들어가며, 좁으면 줄여 놓는다 (대장 #175)', () => {
    for (const band of Object.values(BANDS)) {
      const plan = changeGrid(emptyPlan(band.cols, band.rows), band.start[0], band.start[1]);
      const groups = crayonsFor(band.id);
      for (const crayon of [...groups.room, ...groups.pass]) {
        assert.ok(ROOM_SIZE[crayon.id], `${crayon.id}: 처음 크기`);
        const size = roomSize(plan, roomBaseSize(crayon.id));
        for (const at of [{ x: plan.cols / 2, y: plan.rows / 2 }, { x: 0.2, y: 0.2 }, { x: plan.cols + 3, y: plan.rows + 3 }, { x: -2, y: plan.rows / 2 }]) {
          const spot = findRoomSpot(plan, size, at);
          assert.ok(spot, `${band.id} ${crayon.id}: 빈 종이에는 어디든 놓인다`);
          assert.deepEqual([spot.w, spot.h], [size.w, size.h], '빈 종이에서는 줄지 않는다');
          const res = stampRoom(plan, { rect: spot, tag: { kind: crayon.kind, name: crayon.name }, open: null });
          assert.ok(res.ok);
          const cells = analyze(res.plan).cells;
          assert.equal(cells.length, 1);
          assert.deepEqual([cells[0]!.kind, cells[0]!.name], [crayon.kind, crayon.name], `${band.id} ${crayon.id}: 이름`);
        }
        // 누른 점이 방 안에 든다
        const at = { x: plan.cols / 2 + 0.3, y: plan.rows / 2 + 0.3 };
        assert.ok(inRoom(findRoomSpot(plan, size, at)!, at), `${band.id} ${crayon.id}: 누른 자리에 놓인다`);
      }
    }
    // 좁은 자리 — 거실 옆에 두 칸 폭만 남았으면 그 폭으로 줄여 놓는다
    const base = emptyPlan(8, 6);
    const living = stampRoom(base, { rect: { x: 0, y: 0, w: 6, h: 6 }, tag: { kind: 'pass', name: 'living' }, open: null });
    assert.ok(living.ok);
    const narrow = findRoomSpot(living.plan, { w: 3, h: 2 }, { x: 7, y: 3 });
    assert.ok(narrow && narrow.x >= 6 && narrow.w <= 2, `좁은 자리에 맞춘다: ${JSON.stringify(narrow)}`);
    assert.ok(stampRoom(living.plan, { rect: narrow, tag: { kind: 'room', name: 'bath' }, open: null }).ok);
    // 네모마다 비스듬한 벽이 지나가면 놓을 자리가 없다
    const full = addEdges(base, Array.from({ length: 8 * 6 }, (_, i) => dKey(i % 8, Math.floor(i / 8))));
    assert.equal(findRoomSpot(full, { w: 3, h: 2 }, { x: 4, y: 3 }), null);
  });

  check('[낱말] 집 밖에서 가족이 모이는 자리는 「안전한 곳」이다 (대장 #178)', () => {
    assert.equal(MARK_NAME.meet, '안전한 곳');
    assert.equal(STAMPS.meet.label, '안전한 곳');
    const words = [
      ...Object.values(LINES).flatMap((l) => [l.text, (l as { say?: string }).say ?? '']),
      ...Object.values(STAMPS).flatMap((st) => [st.label, st.text]),
      ...PROMISES.map((pr) => pr.text),
      ...(['low', 'mid', 'high'] as Band[]).flatMap((band) => howToFor('drill', band).steps),
    ];
    assert.deepEqual(words.filter((w) => w.includes('만나는 곳')), [], '옛 이름이 남아 있지 않다');
    assert.ok(LINES['mark-low'].text.includes('안전한 곳') && LINES['drill-outside'].text.includes('안전한 곳'));
    assert.ok(PROMISES.some((pr) => pr.text.includes('안전한 곳')));
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
