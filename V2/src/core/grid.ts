/**
 * 벽 조각에서 칸을 계산한다.
 *
 * 벽으로 막혀 모눈 바깥과 이어지지 않는 네모의 묶음이 칸이다. 칸은 저장하지 않고 벽에서 매번 계산한다.
 * 문과 창은 벽 위에 놓이므로 칸의 모양을 바꾸지 않는다.
 */
import { OUT, type Cell, type Layout, type Link, type Plan, type Pt } from './types';

export const hKey = (x: number, y: number): string => `h:${x}:${y}`;
export const vKey = (x: number, y: number): string => `v:${x}:${y}`;
export const sqKey = (x: number, y: number): string => `${x},${y}`;

export function parseSq(key: string): Pt {
  const [x, y] = key.split(',').map(Number);
  return { x: x!, y: y! };
}

export function parseEdge(key: string): { o: 'h' | 'v'; x: number; y: number } {
  const [o, x, y] = key.split(':');
  return { o: o as 'h' | 'v', x: Number(x), y: Number(y) };
}

/** 벽 조각의 두 끝 점 */
export function edgeEnds(key: string): [Pt, Pt] {
  const { o, x, y } = parseEdge(key);
  return o === 'h' ? [{ x, y }, { x: x + 1, y }] : [{ x, y }, { x, y: y + 1 }];
}

export function edgeMid(key: string): Pt {
  const [a, b] = edgeEnds(key);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** 벽 조각 양쪽의 네모. 모눈 밖 네모일 수 있다 */
export function edgeSides(key: string): [Pt, Pt] {
  const { o, x, y } = parseEdge(key);
  return o === 'h'
    ? [{ x, y: y - 1 }, { x, y }]
    : [{ x: x - 1, y }, { x, y }];
}

/** 두 이웃 점 사이의 벽 조각 */
export function edgeBetween(a: Pt, b: Pt): string {
  if (a.y === b.y) return hKey(Math.min(a.x, b.x), a.y);
  return vKey(a.x, Math.min(a.y, b.y));
}

const inGrid = (plan: Plan, s: Pt): boolean => s.x >= 0 && s.y >= 0 && s.x < plan.cols && s.y < plan.rows;

/** 네모 s 의 네 변 — 이웃 네모와 그 사이 벽 조각 */
function neighbors(s: Pt): { to: Pt; edge: string }[] {
  return [
    { to: { x: s.x, y: s.y - 1 }, edge: hKey(s.x, s.y) },
    { to: { x: s.x, y: s.y + 1 }, edge: hKey(s.x, s.y + 1) },
    { to: { x: s.x - 1, y: s.y }, edge: vKey(s.x, s.y) },
    { to: { x: s.x + 1, y: s.y }, edge: vKey(s.x + 1, s.y) },
  ];
}

export function analyze(plan: Plan): Layout {
  const walls = new Set(plan.walls);
  const outside = new Set<string>();
  const stack: Pt[] = [];

  // 모눈 가장자리에서 벽이 없는 쪽은 바깥과 이어진다
  for (let y = 0; y < plan.rows; y++) {
    for (let x = 0; x < plan.cols; x++) {
      const open = neighbors({ x, y }).some((n) => !inGrid(plan, n.to) && !walls.has(n.edge));
      if (open) {
        outside.add(sqKey(x, y));
        stack.push({ x, y });
      }
    }
  }
  while (stack.length) {
    const s = stack.pop()!;
    for (const n of neighbors(s)) {
      if (!inGrid(plan, n.to) || walls.has(n.edge)) continue;
      const k = sqKey(n.to.x, n.to.y);
      if (outside.has(k)) continue;
      outside.add(k);
      stack.push(n.to);
    }
  }

  // 남은 네모를 묶어 칸으로 만든다
  const cells: Cell[] = [];
  const cellAt = new Map<string, string>();
  for (let y = 0; y < plan.rows; y++) {
    for (let x = 0; x < plan.cols; x++) {
      const start = sqKey(x, y);
      if (outside.has(start) || cellAt.has(start)) continue;
      const squares: Pt[] = [];
      const queue: Pt[] = [{ x, y }];
      cellAt.set(start, start);
      while (queue.length) {
        const s = queue.shift()!;
        squares.push(s);
        for (const n of neighbors(s)) {
          if (!inGrid(plan, n.to) || walls.has(n.edge)) continue;
          const k = sqKey(n.to.x, n.to.y);
          if (cellAt.has(k)) continue;
          cellAt.set(k, start);
          queue.push(n.to);
        }
      }
      // 표지는 위에서 아래, 왼쪽에서 오른쪽으로 먼저 만나는 것을 쓴다
      const ordered = [...squares].sort((p, q) => p.y - q.y || p.x - q.x);
      const tagged = ordered.map((p) => plan.tags[sqKey(p.x, p.y)]).find(Boolean) ?? null;
      const cx = squares.reduce((sum, p) => sum + p.x, 0) / squares.length;
      const cy = squares.reduce((sum, p) => sum + p.y, 0) / squares.length;
      const anchor = ordered.reduce((best, p) =>
        Math.hypot(p.x - cx, p.y - cy) < Math.hypot(best.x - cx, best.y - cy) ? p : best,
      );
      cells.push({ id: start, squares: ordered, anchor, kind: tagged?.kind ?? null, name: tagged?.name ?? null });
    }
  }

  const links: Link[] = [];
  for (const [edge, kind] of Object.entries(plan.openings)) {
    if (kind !== 'door' || !walls.has(edge)) continue;
    const [p, q] = edgeSides(edge);
    const a = cellAt.get(sqKey(p.x, p.y)) ?? OUT;
    const b = cellAt.get(sqKey(q.x, q.y)) ?? OUT;
    if (a === b) continue;
    links.push(a === OUT ? { edge, a: b, b: OUT } : { edge, a, b });
  }
  links.sort((l, m) => (l.edge < m.edge ? -1 : 1));

  return { cells, byId: new Map(cells.map((c) => [c.id, c])), cellAt, links };
}

/** 칸 c 에서 문 하나로 갈 수 있는 곳 (칸 id 또는 `out`) */
export function reachableFrom(layout: Layout, id: string): { to: string; edge: string }[] {
  const out: { to: string; edge: string }[] = [];
  for (const l of layout.links) {
    if (l.a === id) out.push({ to: l.b, edge: l.edge });
    else if (l.b === id) out.push({ to: l.a, edge: l.edge });
  }
  return out;
}

/** 벽 조각이 집 겉벽인가 — 한쪽이 칸이고 다른 쪽이 바깥이다 */
export function isExterior(layout: Layout, edge: string): boolean {
  const [p, q] = edgeSides(edge);
  const a = layout.cellAt.has(sqKey(p.x, p.y));
  const b = layout.cellAt.has(sqKey(q.x, q.y));
  return a !== b;
}

/** 벽 조각이 두 칸 사이의 벽인가 */
export function isInterior(layout: Layout, edge: string): boolean {
  const [p, q] = edgeSides(edge);
  const a = layout.cellAt.get(sqKey(p.x, p.y));
  const b = layout.cellAt.get(sqKey(q.x, q.y));
  return Boolean(a && b && a !== b);
}

/** 칸 id 에서 밖까지의 가장 짧은 길. 없으면 null. avoid 에 든 칸과 문은 지나지 않는다 */
export function shortestPath(
  layout: Layout,
  from: string,
  avoid: { cells?: Set<string>; edges?: Set<string> } = {},
): { to: string; edge: string }[] | null {
  const prev = new Map<string, { from: string; edge: string }>();
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length) {
    const here = queue.shift()!;
    for (const n of reachableFrom(layout, here)) {
      if (seen.has(n.to) || avoid.edges?.has(n.edge) || avoid.cells?.has(n.to)) continue;
      seen.add(n.to);
      prev.set(n.to, { from: here, edge: n.edge });
      if (n.to === OUT) {
        const path: { to: string; edge: string }[] = [];
        let at = OUT;
        while (at !== from) {
          const p = prev.get(at)!;
          path.unshift({ to: at, edge: p.edge });
          at = p.from;
        }
        return path;
      }
      queue.push(n.to);
    }
  }
  return null;
}

/** 아무 문으로도 밖까지 이어지지 않는 칸들 */
export function unreachableCells(layout: Layout): Cell[] {
  const seen = new Set<string>();
  const queue = layout.links.filter((l) => l.b === OUT).map((l) => l.a);
  queue.forEach((id) => seen.add(id));
  while (queue.length) {
    const here = queue.shift()!;
    for (const n of reachableFrom(layout, here)) {
      if (n.to === OUT || seen.has(n.to)) continue;
      seen.add(n.to);
      queue.push(n.to);
    }
  }
  return layout.cells.filter((c) => !seen.has(c.id));
}

/** 칸 안의 네모를 따라 from 에서 to 까지 가는 네모 가운데 점들 */
export function walkInCell(plan: Plan, layout: Layout, cellId: string, from: Pt, to: Pt): Pt[] {
  const walls = new Set(plan.walls);
  const startKey = sqKey(from.x, from.y);
  const goalKey = sqKey(to.x, to.y);
  const prev = new Map<string, string>();
  const queue = [from];
  const seen = new Set([startKey]);
  while (queue.length) {
    const s = queue.shift()!;
    const k = sqKey(s.x, s.y);
    if (k === goalKey) break;
    for (const n of neighbors(s)) {
      const nk = sqKey(n.to.x, n.to.y);
      if (seen.has(nk) || walls.has(n.edge) || layout.cellAt.get(nk) !== cellId) continue;
      seen.add(nk);
      prev.set(nk, k);
      queue.push(n.to);
    }
  }
  const out: Pt[] = [];
  let at: string | undefined = goalKey;
  while (at) {
    const p = parseSq(at);
    out.unshift({ x: p.x + 0.5, y: p.y + 0.5 });
    if (at === startKey) break;
    at = prev.get(at);
  }
  return simplify(out);
}

/** 같은 방향으로 이어지는 점을 줄인다 */
export function simplify(points: Pt[]): Pt[] {
  if (points.length < 3) return points;
  const out: Pt[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1]!;
    const b = points[i]!;
    const c = points[i + 1]!;
    const same = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (!same) out.push(b);
  }
  out.push(points[points.length - 1]!);
  return out;
}

/** 문 조각에서 칸 쪽 네모와 바깥(또는 다른 칸) 쪽 네모 */
export function doorSquareFor(layout: Layout, edge: string, cellId: string): Pt {
  const [p, q] = edgeSides(edge);
  return layout.cellAt.get(sqKey(p.x, p.y)) === cellId ? p : q;
}

/** 격자 점을 도는 모든 벽 조각 후보 — 모눈 안에 드는지 판단할 때 쓴다 */
export function edgeInGrid(plan: Plan, key: string): boolean {
  const { o, x, y } = parseEdge(key);
  if (x < 0 || y < 0) return false;
  return o === 'h' ? x < plan.cols && y <= plan.rows : x <= plan.cols && y < plan.rows;
}
