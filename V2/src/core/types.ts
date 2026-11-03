/** V2 의 자료 모양. 계산만 하고 화면을 모른다. */

/** 학년 단계 — 1~2 · 3~4 · 5~6 */
export type Band = 'low' | 'mid' | 'high';

export interface Pt {
  x: number;
  y: number;
}

/** 칸의 종류 — 방(머무는 칸) · 지나가는 곳(걸어가는 칸) */
export type CellKind = 'room' | 'pass';

export interface CellTag {
  kind: CellKind;
  /** 이름 열쇠. 없으면 종류 이름만 보인다 */
  name: string | null;
}

export type OpeningKind = 'door' | 'window';

export type MarkId = 'me' | 'meet' | 'gas' | 'extinguisher' | 'alarm';

export interface Plan {
  cols: number;
  rows: number;
  /** 벽 조각 열쇠 (`h:x:y` · `v:x:y` · 대각선 `d:x:y` · `u:x:y`) */
  walls: string[];
  /** 벽 조각 열쇠 → 문·창 */
  openings: Record<string, OpeningKind>;
  /** 조각 열쇠(`x,y` · `x,y:ne`) → 칸 표지 */
  tags: Record<string, CellTag>;
  /** 표시. 만나는 곳만 집 밖의 자유 좌표이고 나머지는 조각 가운데에 놓인다 */
  marks: Partial<Record<MarkId, Pt>>;
  /** 첫째 길 — 조각 열쇠 나열, 끝이 `out` 이면 밖까지 이어진 것이다 */
  route: string[];
  /** 둘째 길 (5~6학년) */
  route2: string[];
}

export const OUT = 'out';

/** 칸을 이루는 조각 — 네모 하나이거나, 대각선에 나뉜 세모 하나다 */
export interface Piece extends Pt {
  key: string;
  whole: boolean;
  center: Pt;
}

export interface Cell {
  /** 칸의 대표 조각 열쇠. 벽이 바뀌면 달라질 수 있어 저장하지 않는다 */
  id: string;
  squares: Piece[];
  /** 글자를 놓을 자리 — 무게 중심에 가장 가까운 조각의 가운데 */
  anchor: Pt;
  kind: CellKind | null;
  name: string | null;
}

/** 문으로 이어진 두 칸 또는 칸과 바깥 */
export interface Link {
  edge: string;
  a: string;
  b: string;
}

export interface Layout {
  cells: Cell[];
  byId: Map<string, Cell>;
  /** 조각 열쇠 → 칸 id. 칸이 아닌 조각은 없다 */
  cellAt: Map<string, string>;
  links: Link[];
  /** 대각선 벽 조각들 */
  diagonals: Set<string>;
}
