/**
 * 벽 조각에서 칸을 계산한다.
 *
 * 벽으로 막혀 모눈 바깥과 이어지지 않는 조각의 묶음이 칸이다. 칸은 저장하지 않고 벽에서 매번 계산한다.
 * 문과 창은 벽 위에 놓이므로 칸의 모양을 바꾸지 않는다.
 *
 * 조각은 보통 네모 하나다. 대각선 벽이 지나는 네모는 세모 두 개로 나뉘고, 열쇠에 어느 쪽인지 붙는다.
 *   `3,2`     네모 전체
 *   `3,2:ne`  ↘ 대각선의 오른쪽 위 세모 (짝은 `:sw`)
 *   `3,2:nw`  ↗ 대각선의 왼쪽 위 세모 (짝은 `:se`)
 * 한 네모에 대각선은 하나만 있다(`normalize` 가 맞춘다).
 */
import { OUT, type Cell, type CellTag, type Layout, type Link, type Piece, type Plan, type Pt } from './types';

export const hKey = (x: number, y: number): string => `h:${x}:${y}`;
export const vKey = (x: number, y: number): string => `v:${x}:${y}`;
/** ↘ (x,y) 에서 (x+1,y+1) 까지 */
export const dKey = (x: number, y: number): string => `d:${x}:${y}`;
/** ↗ (x,y+1) 에서 (x+1,y) 까지 */
export const uKey = (x: number, y: number): string => `u:${x}:${y}`;
export const sqKey = (x: number, y: number): string => `${x},${y}`;

export const isDiagonal = (key: string): boolean => key.startsWith('d:') || key.startsWith('u:');

type Side = 'n' | 'e' | 's' | 'w';
const ALL_SIDES: Side[] = ['n', 'e', 's', 'w'];
const PARTS = ['ne', 'sw', 'nw', 'se'] as const;

/** 조각 열쇠에서 네모 자리를 읽는다 */
export function parseSq(key: string): Pt {
  const [x, y] = key.split(':')[0]!.split(',').map(Number);
  return { x: x!, y: y! };
}

const partOf = (key: string): string | undefined => key.split(':')[1];

/** 조각의 가운데 — 표시를 놓고 길이 지나는 자리다 */
export function pieceCenter(key: string): Pt {
  const s = parseSq(key);
  const part = partOf(key);
  if (!part) return { x: s.x + 0.5, y: s.y + 0.5 };
  return { x: s.x + (part[1] === 'e' ? 2 / 3 : 1 / 3), y: s.y + (part[0] === 'n' ? 1 / 3 : 2 / 3) };
}

/** 조각의 꼭짓점들 */
export function piecePolygon(key: string): Pt[] {
  const { x, y } = parseSq(key);
  const nw = { x, y };
  const ne = { x: x + 1, y };
  const se = { x: x + 1, y: y + 1 };
  const sw = { x, y: y + 1 };
  switch (partOf(key)) {
    case 'ne':
      return [nw, ne, se];
    case 'sw':
      return [nw, se, sw];
    case 'nw':
      return [nw, ne, sw];
    case 'se':
      return [ne, se, sw];
    default:
      return [nw, ne, se, sw];
  }
}

export function parseEdge(key: string): { o: 'h' | 'v' | 'd' | 'u'; x: number; y: number } {
  const [o, x, y] = key.split(':');
  return { o: o as 'h' | 'v' | 'd' | 'u', x: Number(x), y: Number(y) };
}

/** 벽 조각의 두 끝 점 */
export function edgeEnds(key: string): [Pt, Pt] {
  const { o, x, y } = parseEdge(key);
  switch (o) {
    case 'h':
      return [{ x, y }, { x: x + 1, y }];
    case 'v':
      return [{ x, y }, { x, y: y + 1 }];
    case 'd':
      return [{ x, y }, { x: x + 1, y: y + 1 }];
    default:
      return [{ x, y: y + 1 }, { x: x + 1, y }];
  }
}

export function edgeMid(key: string): Pt {
  const [a, b] = edgeEnds(key);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** 이웃한 두 점 사이의 벽 조각. 대각선 이웃도 된다 */
export function edgeBetween(a: Pt, b: Pt): string {
  if (a.y === b.y) return hKey(Math.min(a.x, b.x), a.y);
  if (a.x === b.x) return vKey(a.x, Math.min(a.y, b.y));
  const left = a.x < b.x ? a : b;
  const right = a.x < b.x ? b : a;
  return left.y < right.y ? dKey(left.x, left.y) : uKey(left.x, right.y);
}

const inGrid = (plan: Plan, s: Pt): boolean => s.x >= 0 && s.y >= 0 && s.x < plan.cols && s.y < plan.rows;

/** 네모 (x,y) 의 한 변이 속한 조각 */
function pieceKey(diagonals: Set<string>, x: number, y: number, side: Side): string {
  const sq = sqKey(x, y);
  if (diagonals.has(dKey(x, y))) return `${sq}:${side === 'n' || side === 'e' ? 'ne' : 'sw'}`;
  if (diagonals.has(uKey(x, y))) return `${sq}:${side === 'n' || side === 'w' ? 'nw' : 'se'}`;
  return sq;
}

function sidesOf(key: string): Side[] {
  const part = partOf(key);
  return part ? ([...part] as Side[]) : ALL_SIDES;
}

/** 조각의 변 너머 — 이웃 조각과 그 사이 벽 조각 */
function neighbors(diagonals: Set<string>, key: string): { to: string; sq: Pt; edge: string }[] {
  const { x, y } = parseSq(key);
  return sidesOf(key).map((side) => {
    switch (side) {
      case 'n':
        return { to: pieceKey(diagonals, x, y - 1, 's'), sq: { x, y: y - 1 }, edge: hKey(x, y) };
      case 's':
        return { to: pieceKey(diagonals, x, y + 1, 'n'), sq: { x, y: y + 1 }, edge: hKey(x, y + 1) };
      case 'w':
        return { to: pieceKey(diagonals, x - 1, y, 'e'), sq: { x: x - 1, y }, edge: vKey(x, y) };
      default:
        return { to: pieceKey(diagonals, x + 1, y, 'w'), sq: { x: x + 1, y }, edge: vKey(x + 1, y) };
    }
  });
}

function sidesOfEdge(diagonals: Set<string>, key: string): [string, string] {
  const { o, x, y } = parseEdge(key);
  switch (o) {
    case 'h':
      return [pieceKey(diagonals, x, y - 1, 's'), pieceKey(diagonals, x, y, 'n')];
    case 'v':
      return [pieceKey(diagonals, x - 1, y, 'e'), pieceKey(diagonals, x, y, 'w')];
    case 'd':
      return [`${sqKey(x, y)}:ne`, `${sqKey(x, y)}:sw`];
    default:
      return [`${sqKey(x, y)}:nw`, `${sqKey(x, y)}:se`];
  }
}

/** 벽 조각 양쪽의 조각 열쇠. 모눈 밖일 수 있다 */
export function edgeSides(layout: Layout, key: string): [string, string] {
  return sidesOfEdge(layout.diagonals, key);
}

/** 조각의 표지. 대각선을 긋거나 지워 조각이 바뀌어도 표지를 잃지 않게 네모 쪽도 찾아본다 */
export function tagFor(tags: Plan['tags'], key: string): CellTag | undefined {
  const exact = tags[key];
  if (exact) return exact;
  const sq = key.split(':')[0]!;
  if (partOf(key)) return tags[sq];
  for (const part of PARTS) {
    const tag = tags[`${sq}:${part}`];
    if (tag) return tag;
  }
  return undefined;
}

export function analyze(plan: Plan): Layout {
  const walls = new Set(plan.walls);
  const diagonals = new Set(plan.walls.filter(isDiagonal));
  const outside = new Set<string>();
  const stack: string[] = [];

  const pieces: string[] = [];
  for (let y = 0; y < plan.rows; y++) {
    for (let x = 0; x < plan.cols; x++) {
      const a = pieceKey(diagonals, x, y, 'n');
      const b = pieceKey(diagonals, x, y, 's');
      pieces.push(a);
      if (b !== a) pieces.push(b);
    }
  }

  // 모눈 가장자리에서 벽이 없는 쪽은 바깥과 이어진다
  for (const key of pieces) {
    const open = neighbors(diagonals, key).some((n) => !inGrid(plan, n.sq) && !walls.has(n.edge));
    if (open) {
      outside.add(key);
      stack.push(key);
    }
  }
  while (stack.length) {
    const key = stack.pop()!;
    for (const n of neighbors(diagonals, key)) {
      if (!inGrid(plan, n.sq) || walls.has(n.edge) || outside.has(n.to)) continue;
      outside.add(n.to);
      stack.push(n.to);
    }
  }

  // 남은 조각을 묶어 칸으로 만든다
  const cells: Cell[] = [];
  const cellAt = new Map<string, string>();
  for (const start of pieces) {
    if (outside.has(start) || cellAt.has(start)) continue;
    const keys: string[] = [];
    const queue = [start];
    cellAt.set(start, start);
    while (queue.length) {
      const key = queue.shift()!;
      keys.push(key);
      for (const n of neighbors(diagonals, key)) {
        if (!inGrid(plan, n.sq) || walls.has(n.edge) || cellAt.has(n.to)) continue;
        cellAt.set(n.to, start);
        queue.push(n.to);
      }
    }
    const squares: Piece[] = keys.map((key) => {
      const s = parseSq(key);
      return { x: s.x, y: s.y, key, whole: !partOf(key), center: pieceCenter(key) };
    });
    // 표지는 위에서 아래, 왼쪽에서 오른쪽으로 먼저 만나는 것을 쓴다
    const ordered = [...squares].sort((p, q) => p.y - q.y || p.x - q.x || (p.key < q.key ? -1 : 1));
    const tagged = ordered.map((p) => tagFor(plan.tags, p.key)).find(Boolean) ?? null;
    const cx = squares.reduce((sum, p) => sum + p.center.x, 0) / squares.length;
    const cy = squares.reduce((sum, p) => sum + p.center.y, 0) / squares.length;
    // 글자는 되도록 네모 전체에 놓는다. 세모 조각은 글자가 벽에 걸린다
    const roomy = ordered.filter((p) => p.whole);
    const anchor = (roomy.length ? roomy : ordered).reduce((best, p) =>
      Math.hypot(p.center.x - cx, p.center.y - cy) < Math.hypot(best.center.x - cx, best.center.y - cy) ? p : best,
    );
    cells.push({ id: start, squares: ordered, anchor: anchor.center, kind: tagged?.kind ?? null, name: tagged?.name ?? null });
  }

  const links: Link[] = [];
  for (const [edge, kind] of Object.entries(plan.openings)) {
    if (kind !== 'door' || !walls.has(edge)) continue;
    const [p, q] = sidesOfEdge(diagonals, edge);
    const a = cellAt.get(p) ?? OUT;
    const b = cellAt.get(q) ?? OUT;
    if (a === b) continue;
    links.push(a === OUT ? { edge, a: b, b: OUT } : { edge, a, b });
  }
  links.sort((l, m) => (l.edge < m.edge ? -1 : 1));

  return { cells, byId: new Map(cells.map((c) => [c.id, c])), cellAt, links, diagonals };
}

/** 지도 위 한 점이 속한 조각의 열쇠 */
export function pieceKeyAt(layout: Layout, p: Pt): string {
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  const dx = p.x - x - 0.5;
  const dy = p.y - y - 0.5;
  const side: Side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n';
  return pieceKey(layout.diagonals, x, y, side);
}

/** 지도 위 한 점이 속한 칸의 id. 집 밖이면 없다 */
export function cellIdAt(layout: Layout, p: Pt): string | undefined {
  return layout.cellAt.get(pieceKeyAt(layout, p));
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
  const [p, q] = edgeSides(layout, edge);
  return layout.cellAt.has(p) !== layout.cellAt.has(q);
}

/** 벽 조각이 두 칸 사이의 벽인가 */
export function isInterior(layout: Layout, edge: string): boolean {
  const [p, q] = edgeSides(layout, edge);
  const a = layout.cellAt.get(p);
  const b = layout.cellAt.get(q);
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

/** 칸 안의 조각을 따라 from 조각에서 to 조각까지 가는 가운데 점들 */
export function walkInCell(plan: Plan, layout: Layout, cellId: string, from: string, to: string): Pt[] {
  const walls = new Set(plan.walls);
  const prev = new Map<string, string>();
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length) {
    const key = queue.shift()!;
    if (key === to) break;
    for (const n of neighbors(layout.diagonals, key)) {
      if (seen.has(n.to) || walls.has(n.edge) || layout.cellAt.get(n.to) !== cellId) continue;
      seen.add(n.to);
      prev.set(n.to, key);
      queue.push(n.to);
    }
  }
  const out: Pt[] = [];
  let at: string | undefined = to;
  while (at) {
    out.unshift(pieceCenter(at));
    if (at === from) break;
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

/** 문 조각에서 칸 쪽 조각의 열쇠 */
export function doorSquareFor(layout: Layout, edge: string, cellId: string): string {
  const [p, q] = edgeSides(layout, edge);
  return layout.cellAt.get(p) === cellId ? p : q;
}

/** 벽 조각이 모눈 안에 드는가 */
export function edgeInGrid(plan: Plan, key: string): boolean {
  const { o, x, y } = parseEdge(key);
  if (x < 0 || y < 0) return false;
  if (o === 'h') return x < plan.cols && y <= plan.rows;
  if (o === 'v') return x <= plan.cols && y < plan.rows;
  return x < plan.cols && y < plan.rows;
}
