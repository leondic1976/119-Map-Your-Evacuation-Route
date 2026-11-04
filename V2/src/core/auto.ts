/**
 * 「도와줘」 — 모르는 아이를 막다른 길로 보내지 않는 무난한 기본값.
 * 이미 해 둔 것은 지우지 않고 빈 곳만 채운다.
 */
import { analyze, edgeKeys, edgeLength, edgeMid, edgeSides, isExterior, parseEdge, pieceKeyAt, reachableFrom, shortestPath, unreachableCells } from './grid';
import { normalize } from './edit';
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
    const order = [...layout.cells].sort(
      (a, b) => Number(b.kind === 'pass') - Number(a.kind === 'pass') || b.area - a.area,
    );
    for (const cell of order) {
      const edges = edgeKeys(layout).filter(
        (e) => !plan.openings[e] && isExterior(layout, e) && edgeSides(layout, e).some((s) => layout.cellAt.get(s) === cell.id),
      );
      if (edges.length) {
        // 아래쪽 겉벽을 먼저 쓴다 — 지도에서 「집 밖」이 아래에 있어 길이 곧게 이어진다
        const bottom = edges.filter((e) => e.startsWith('h:')).sort((a, b) => parseEdge(b).y - parseEdge(a).y);
        const lowY = bottom[0] ? parseEdge(bottom[0]).y : null;
        const pick = bottom.length ? middle(bottom.filter((e) => parseEdge(e).y === lowY)) : middle(edges);
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
    for (const cell of stuck) {
      const others = layout.cells.filter((c) => !stuckIds.has(c.id));
      // 지나가는 곳을 먼저 잇는다
      others.sort((a, b) => Number(b.kind === 'pass') - Number(a.kind === 'pass'));
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
  // 점 간격이 좁아도 표시가 겹치지 않게 예전 네모 한 칸만큼 떨어뜨린다
  const k = plan.density ?? 1;
  const used: Pt[] = Object.entries(marks)
    .filter(([id]) => id !== 'meet')
    .map(([, m]) => m!);
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
  if (!marks.meet) marks.meet = { x: plan.cols / 2, y: plan.rows + 0.9 * k };
  if (band !== 'low') {
    if (!marks.gas) {
      const p = free(byName('kitchen') ?? rooms[rooms.length - 1] ?? any);
      if (p) marks.gas = p;
    }
    if (!marks.extinguisher) {
      const p = free(byName('entry') ?? passes[0] ?? any);
      if (p) marks.extinguisher = p;
    }
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

export function findSecondRoute(plan: Plan): string[] | null {
  const me = plan.marks.me;
  if (!me) return null;
  const layout = analyze(plan);
  const startKey = pieceKeyAt(layout, me);
  const start = layout.cellAt.get(startKey);
  if (!start) return null;
  const ids = plan.route.map((s) => (s === OUT ? OUT : layout.cellAt.get(s)));
  const edges = new Set<string>();
  for (let i = 1; i < ids.length; i++) {
    const n = reachableFrom(layout, ids[i - 1]!).find((m) => m.to === ids[i]);
    if (n) edges.add(n.edge);
  }
  const path = shortestPath(layout, start, { edges });
  return path ? toSteps(startKey, path) : null;
}
