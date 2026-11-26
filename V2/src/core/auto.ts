/**
 * 「도와줘」 — 모르는 아이를 막다른 길로 보내지 않는 무난한 기본값.
 * 이미 해 둔 것은 지우지 않고 빈 곳만 채운다.
 */
import { analyze, cellIdAt, edgeKeys, edgeLength, edgeMid, edgeSides, hKey, vKey, isExterior, parseEdge, pieceKeyAt, reachableFrom, shortestPath, unreachableCells } from './grid';
import { normalize, routeCells } from './edit';
import { outsideOf, outsideSpot } from './items';
import { OUT, type Band, type Cell, type Layout, type Plan, type Pt } from './types';

/** 칸마다 맞닿은 다른 칸의 수 */
function neighborCounts(layout: Layout): Map<string, number> {
  const seen = new Map<string, Set<string>>();
  for (const edge of edgeKeys(layout)) {
    const [p, q] = edgeSides(layout, edge);
    const a = layout.cellAt.get(p);
    const b = layout.cellAt.get(q);
    if (!a || !b || a === b) continue;
    if (!seen.has(a)) seen.set(a, new Set());
    if (!seen.has(b)) seen.set(b, new Set());
    seen.get(a)!.add(b);
    seen.get(b)!.add(a);
  }
  return new Map([...seen].map(([k, v]) => [k, v.size]));
}

/** 칸 표지 채우기 — 다른 칸과 가장 많이 닿은 큰 칸이 지나가는 곳이다 */
export function autoTag(plan: Plan, band: Band): Plan {
  const layout = analyze(plan);
  const counts = neighborCounts(layout);
  const tags = { ...plan.tags };
  const named = band !== 'low';

  const hasPass = layout.cells.some((c) => c.kind === 'pass');
  const empty = layout.cells.filter((c) => !c.kind);
  const hub = hasPass
    ? null
    : [...layout.cells].sort(
        (a, b) =>
          (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) ||
          b.area - a.area ||
          (a.id < b.id ? -1 : 1),
      )[0];

  const roomNames = ['main', 'myroom', 'kitchen', 'bath', 'other', 'other', 'other'];
  // 이름이 붙지 않는 학년도 지나가는 칸은 그대로 고른다
  const used = new Set(layout.cells.map((c) => c.name).filter(Boolean) as string[]);
  const free = roomNames.filter((n) => n === 'other' || !used.has(n));
  const bigFirst = [...empty].sort((a, b) => b.area - a.area || (a.id < b.id ? -1 : 1));

  for (const cell of bigFirst) {
    if (layout.cells.length > 1 && hub && cell.id === hub.id) {
      tags[cell.id] = { kind: 'pass', name: named ? 'living' : null };
    } else {
      tags[cell.id] = { kind: 'room', name: named ? (free.shift() ?? 'other') : null };
    }
  }
  return normalize({ ...plan, tags });
}

/**
 * 칸 하나를 가운데에서 둘로 나누는 벽. 집 모양만 있고 방이 없을 때 「도와줘」가 쓴다.
 * 더 긴 쪽을 자른다. 그 줄의 양옆이 같은 칸인 곳에만 벽을 놓는다.
 */
export function splitLargestCell(plan: Plan): Plan {
  const layout = analyze(plan);
  const cell = [...layout.cells].sort((a, b) => b.area - a.area)[0];
  if (!cell) return plan;
  const xs = cell.squares.map((s) => s.x);
  const ys = cell.squares.map((s) => s.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs) + 1;
  const top = Math.min(...ys);
  const bottom = Math.max(...ys) + 1;
  // 양옆이 같은 칸인 자리에 벽을 놓는다. 비스듬한 벽에 걸친 네모도 어느 한 곳이 양쪽 다 칸이면 넘겨 긋는다
  const both = (a: Pt, b: Pt): boolean => cellIdAt(layout, a) === cell.id && cellIdAt(layout, b) === cell.id;
  const add: string[] = [];
  if (right - left >= bottom - top) {
    const x = Math.round((left + right) / 2);
    for (let y = top; y < bottom; y++) {
      if ([0.1, 0.5, 0.9].some((f) => both({ x: x - 0.01, y: y + f }, { x: x + 0.01, y: y + f }))) add.push(vKey(x, y));
    }
  } else {
    const y = Math.round((top + bottom) / 2);
    for (let x = left; x < right; x++) {
      if ([0.1, 0.5, 0.9].some((f) => both({ x: x + f, y: y - 0.01 }, { x: x + f, y: y + 0.01 }))) add.push(hKey(x, y));
    }
  }
  return normalize({ ...plan, walls: [...plan.walls, ...add] });
}

/** 두 칸이 맞닿은 벽 조각들 */
function sharedEdges(layout: Layout, a: string, b: string): string[] {
  return edgeKeys(layout).filter((edge) => {
    const [p, q] = edgeSides(layout, edge);
    const x = layout.cellAt.get(p);
    const y = layout.cellAt.get(q);
    return (x === a && y === b) || (x === b && y === a);
  });
}

/** 가운데 벽을 고른다. 문이 들어갈 만큼 긴 토막이 있으면 그중에서 고른다 */
const middle = (items: string[]): string => {
  const roomy = items.filter((e) => edgeLength(e) >= 0.6);
  const list = [...(roomy.length ? roomy : items)].sort((a, b) => edgeMid(a).x - edgeMid(b).x || edgeMid(a).y - edgeMid(b).y);
  return list[Math.floor((list.length - 1) / 2)]!;
};

/** 문 채우기 — 모든 칸이 밖까지 이어지게 문을 단다 */
export function autoDoors(input: Plan): Plan {
  let plan = input;
  // 밖으로 나가는 문 — 지나가는 곳 겉벽 가운데에 먼저 단다
  let layout = analyze(plan);
  if (layout.cells.length === 0) return plan;
  if (!layout.links.some((l) => l.b === OUT)) {
    // 현관이 있으면 현관으로 나간다. 베란다로는 나가지 않는다
    const rank = (c: Cell): number => (c.name === 'entry' ? 0 : c.name === 'veranda' || c.name === 'refuge' ? 3 : c.kind === 'pass' ? 1 : 2);
    const order = [...layout.cells].sort((a, b) => rank(a) - rank(b) || b.area - a.area);
    for (const cell of order) {
      const edges = edgeKeys(layout).filter(
        (e) => !plan.openings[e] && isExterior(layout, e) && edgeSides(layout, e).some((s) => layout.cellAt.get(s) === cell.id),
      );
      if (edges.length) {
        // 「집 밖」쪽 겉벽을 먼저 쓴다 — 길이 곧게 이어진다. 현관은 있는 자리의 겉벽을 그대로 쓴다
        const side = outsideOf(plan);
        const axis = side === 'top' || side === 'bottom' ? 'h:' : 'v:';
        const far = side === 'bottom' || side === 'right' ? 1 : -1;
        const pos = (e: string): number => (axis === 'h:' ? parseEdge(e).y : parseEdge(e).x) * far;
        const facing = edges.filter((e) => e.startsWith(axis)).sort((a, b) => pos(b) - pos(a));
        const line = facing[0] ? pos(facing[0]) : null;
        const pick = facing.length ? middle(facing.filter((e) => pos(e) === line)) : middle(edges);
        plan = normalize({ ...plan, openings: { ...plan.openings, [pick]: 'door' } });
        break;
      }
    }
  }

  // 아직 이어지지 않은 칸은 이어진 칸 쪽으로 문을 낸다
  for (let guard = 0; guard < 80; guard++) {
    layout = analyze(plan);
    const stuck = unreachableCells(layout);
    if (stuck.length === 0) break;
    const stuckIds = new Set(stuck.map((c) => c.id));
    let picked: string | null = null;
    // 거실처럼 지나가는 곳부터 잇는다. 그래야 방이 거실로 이어지고 현관으로 몰리지 않는다
    const firstPass = [...stuck].sort((a, b) => Number(b.kind === 'pass') - Number(a.kind === 'pass'));
    for (const cell of firstPass) {
      const others = layout.cells.filter((c) => !stuckIds.has(c.id));
      // 거실과 복도처럼 지나가는 곳을 먼저 잇는다. 현관으로는 다른 길이 없을 때만 낸다 — 중문은 하나면 된다
      const reach = (c: Cell): number => (c.name === 'entry' ? 2 : c.kind === 'pass' ? 0 : 1);
      others.sort((a, b) => reach(a) - reach(b));
      for (const other of others) {
        const shared = sharedEdges(layout, cell.id, other.id).filter((e) => !plan.openings[e]);
        if (shared.length) {
          picked = middle(shared);
          break;
        }
      }
      if (picked) break;
    }
    if (!picked) {
      // 이어진 칸과 닿지 않는 섬 — 겉벽에 문을 낸다
      const island = stuck[0]!;
      const edges = edgeKeys(layout).filter(
        (e) => !plan.openings[e] && isExterior(layout, e) && edgeSides(layout, e).some((s) => layout.cellAt.get(s) === island.id),
      );
      if (!edges.length) {
        // 다른 섬과만 닿아 있다
        const inner = edgeKeys(layout).filter((e) => {
          const [p, q] = edgeSides(layout, e);
          const x = layout.cellAt.get(p);
          const y = layout.cellAt.get(q);
          return !plan.openings[e] && x && y && x !== y && (x === island.id || y === island.id);
        });
        if (!inner.length) break;
        picked = middle(inner);
      } else {
        picked = middle(edges);
      }
    }
    plan = normalize({ ...plan, openings: { ...plan.openings, [picked]: 'door' } });
  }
  return plan;
}

/** 표시 채우기 */
export function autoMarks(input: Plan, band: Band): Plan {
  const plan = input;
  const layout = analyze(plan);
  if (layout.cells.length === 0) return plan;
  const marks = { ...plan.marks };
  // 점이 많아도 표시가 겹치지 않게 처음 네모 한 칸만큼 떨어뜨린다
  const k = Math.max(1, plan.density ?? 1);
  const used: Pt[] = [
    ...Object.entries(marks)
      .filter(([id]) => id !== 'meet')
      .map(([, m]) => m!),
    ...(plan.extraExtinguishers ?? []),
    ...(plan.extraAlarms ?? []),
  ];
  const clear = (p: Pt, gap: number): boolean => used.every((u) => Math.hypot(u.x - p.x, u.y - p.y) >= gap);

  const free = (cell: Cell): Pt | null => {
    // 표시가 벽에 걸리지 않게 너무 작은 조각은 피한다
    const roomy = cell.squares.filter((s) => s.area >= 0.2);
    const near = [...(roomy.length ? roomy : cell.squares)].sort(
      (a, b) => Math.hypot(a.center.x - cell.anchor.x, a.center.y - cell.anchor.y) - Math.hypot(b.center.x - cell.anchor.x, b.center.y - cell.anchor.y),
    );
    // 글자가 놓이는 가운데 조각을 피한다
    const around = near.filter((s) => k === 1 || Math.hypot(s.center.x - cell.anchor.x, s.center.y - cell.anchor.y) >= k * 0.9);
    const order = k === 1 ? [...near.slice(1), near[0]!] : [...around, ...near];
    for (const gap of k === 1 ? [0.001] : [k * 0.9, 0.001]) {
      for (const s of order) {
        if (clear(s.center, gap)) {
          used.push(s.center);
          return s.center;
        }
      }
    }
    return null;
  };
  const byName = (name: string): Cell | undefined => layout.cells.find((c) => c.name === name);
  const rooms = layout.cells.filter((c) => c.kind === 'room');
  const passes = layout.cells.filter((c) => c.kind === 'pass');
  const any = layout.cells[0]!;

  if (!marks.me) {
    const home = byName('myroom') ?? [...rooms].sort((a, b) => a.area - b.area)[0] ?? any;
    const p = free(home);
    if (p) marks.me = p;
  }
  if (!marks.meet) marks.meet = outsideSpot(plan);
  if (band !== 'low' && !marks.gas) {
    const p = free(byName('kitchen') ?? rooms[rooms.length - 1] ?? any);
    if (p) marks.gas = p;
  }
  // 소화기는 전 학년이 놓는다(대장 #169). 「우리 집에 없어」를 골랐으면 놓지 않는다
  if (!marks.extinguisher && !plan.noExtinguisher) {
    const p = free(byName('entry') ?? passes[0] ?? any);
    if (p) marks.extinguisher = p;
  }
  if (band === 'high' && !marks.alarm) {
    const p = free(byName('living') ?? passes[0] ?? any);
    if (p) marks.alarm = p;
  }
  return normalize({ ...plan, marks });
}

/** 칸 id 의 대표 조각으로 된 길을 만든다 */
function toSteps(start: string, path: { to: string }[]): string[] {
  return [start, ...path.map((p) => p.to)];
}

/** 첫째 길 채우기 */
export function autoRoute(input: Plan): Plan {
  const plan = input;
  const me = plan.marks.me;
  if (!me) return plan;
  const layout = analyze(plan);
  const startKey = pieceKeyAt(layout, me);
  const start = layout.cellAt.get(startKey);
  if (!start) return plan;
  const path = shortestPath(layout, start);
  if (!path) return plan;
  return { ...plan, route: [startKey, ...path.map((p) => p.to)] };
}

/** 둘째 길 찾기 — 첫째 길의 문을 쓰지 않는 다른 길. 없으면 지도 그대로 */
export function autoRoute2(input: Plan): Plan {
  const second = findSecondRoute(input);
  return second ? { ...input, route2: second } : input;
}

/** 첫째 길과 다른 길이 하나라도 있나. 지나온 칸을 다시 지나지 않는 길만 센다 */
export function hasOtherRoute(plan: Plan): boolean {
  const me = plan.marks.me;
  if (!me) return false;
  const layout = analyze(plan);
  const start = layout.cellAt.get(pieceKeyAt(layout, me));
  if (!start) return false;
  const first = routeCells(layout, plan.route).join('|');
  let budget = 20000;
  const walk = (at: string, seen: string[]): boolean => {
    if (budget-- <= 0) return false;
    for (const n of reachableFrom(layout, at)) {
      if (n.to === OUT) {
        if ([...seen, OUT].join('|') !== first) return true;
      } else if (!seen.includes(n.to) && walk(n.to, [...seen, n.to])) return true;
    }
    return false;
  };
  return walk(start, [start]);
}

export function findSecondRoute(plan: Plan): string[] | null {
  const me = plan.marks.me;
  if (!me) return null;
  const layout = analyze(plan);
  const startKey = pieceKeyAt(layout, me);
  const start = layout.cellAt.get(startKey);
  if (!start) return null;
  const ids = routeCells(layout, plan.route);
  const edges = new Set<string>();
  for (let i = 1; i < ids.length; i++) {
    const n = reachableFrom(layout, ids[i - 1]!).find((m) => m.to === ids[i]);
    if (n) edges.add(n.edge);
  }
  const path = shortestPath(layout, start, { edges });
  return path ? toSteps(startKey, path) : null;
}
