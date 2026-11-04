/**
 * 집 모양. 겉모양(outer)과 안쪽 벽(inner)을 선으로 적는다.
 * 「도와줘」가 첫째 모양의 빠진 선을 채우고, 「아파트 모양」 레이어의 「다른 모양」에서도 고른다.
 */
import { segmentEdges } from '../core/grid';
import type { Band } from '../core/types';

/** [x1, y1, x2, y2] — 두 점을 곧게 잇는 한 줄 */
type Seg = [number, number, number, number];

export interface Template {
  id: string;
  name: string;
  band: Band;
  outer: Seg[];
  inner: Seg[];
}

const rect = (x1: number, y1: number, x2: number, y2: number): Seg[] => [
  [x1, y1, x2, y1],
  [x1, y2, x2, y2],
  [x1, y1, x1, y2],
  [x2, y1, x2, y2],
];

/** ㄱ자 — 오른쪽 아래가 비었다 */
const ell = (x1: number, y1: number, x2: number, y2: number, xm: number, ym: number): Seg[] => [
  [x1, y1, x2, y1],
  [x2, y1, x2, ym],
  [xm, ym, x2, ym],
  [xm, ym, xm, y2],
  [x1, y2, xm, y2],
  [x1, y1, x1, y2],
];

/** 점들을 차례로 이어 닫은 모양 */
const loop = (...dots: [number, number][]): Seg[] =>
  dots.map(([x, y], i) => {
    const [nx, ny] = dots[(i + 1) % dots.length]!;
    return [x, y, nx, ny];
  });

export const TEMPLATES: Template[] = [
  // 1~2학년 8×6
  {
    id: 'low-square', band: 'low', name: '네모 집',
    outer: rect(1, 0, 7, 6),
    inner: [[4, 0, 4, 3], [1, 3, 7, 3]],
  },
  {
    id: 'low-long', band: 'low', name: '긴 집',
    outer: rect(0, 1, 8, 5),
    inner: [[3, 1, 3, 5], [5, 1, 5, 5]],
  },
  {
    id: 'low-ell', band: 'low', name: '꺾인 집',
    outer: ell(1, 0, 7, 6, 4, 3),
    inner: [[4, 0, 4, 3], [1, 3, 4, 3]],
  },
  {
    id: 'low-cut', band: 'low', name: '비스듬한 집',
    outer: loop([1, 0], [5, 0], [7, 2], [7, 6], [1, 6]),
    inner: [[4, 0, 4, 3], [1, 3, 7, 3]],
  },
  {
    id: 'low-roof', band: 'low', name: '뾰족한 집',
    outer: loop([1, 2], [4, 0], [7, 2], [7, 6], [1, 6]),
    inner: [[4, 0, 4, 3], [1, 3, 7, 3]],
  },
  // 3~4학년 10×7
  {
    id: 'mid-square', band: 'mid', name: '네모 집',
    outer: rect(1, 0, 9, 7),
    inner: [[4, 0, 4, 3], [7, 0, 7, 3], [1, 3, 9, 3], [6, 5, 9, 5], [6, 5, 6, 7]],
  },
  {
    id: 'mid-long', band: 'mid', name: '긴 집',
    outer: rect(0, 1, 10, 6),
    inner: [[3, 1, 3, 6], [7, 1, 7, 6], [3, 4, 7, 4], [7, 3, 10, 3]],
  },
  {
    id: 'mid-ell', band: 'mid', name: '꺾인 집',
    outer: ell(0, 0, 10, 7, 5, 4),
    inner: [[3, 0, 3, 4], [6, 0, 6, 4], [0, 4, 5, 4], [3, 4, 3, 7]],
  },
  {
    id: 'mid-cut', band: 'mid', name: '비스듬한 집',
    outer: loop([1, 0], [7, 0], [9, 2], [9, 7], [1, 7]),
    inner: [[4, 0, 4, 3], [7, 0, 7, 3], [1, 3, 9, 3], [6, 5, 9, 5], [6, 5, 6, 7]],
  },
  {
    id: 'mid-roof', band: 'mid', name: '뾰족한 집',
    outer: loop([1, 3], [5, 0], [9, 3], [9, 7], [1, 7]),
    inner: [[5, 0, 5, 4], [1, 4, 9, 4], [6, 4, 6, 7]],
  },
  // 5~6학년 12×8
  {
    id: 'high-square', band: 'high', name: '네모 집',
    outer: rect(1, 0, 11, 8),
    inner: [[4, 0, 4, 3], [8, 0, 8, 3], [1, 3, 11, 3], [1, 5, 4, 5], [4, 5, 4, 8], [8, 5, 11, 5], [8, 5, 8, 8]],
  },
  {
    id: 'high-long', band: 'high', name: '긴 집',
    outer: rect(0, 1, 12, 7),
    inner: [[3, 1, 3, 7], [6, 1, 6, 4], [9, 1, 9, 7], [3, 4, 9, 4], [9, 4, 12, 4]],
  },
  {
    id: 'high-ell', band: 'high', name: '꺾인 집',
    outer: ell(0, 0, 12, 8, 6, 4),
    inner: [[3, 0, 3, 4], [6, 0, 6, 2], [9, 0, 9, 2], [3, 2, 12, 2], [0, 4, 6, 4], [3, 4, 3, 8]],
  },
  {
    id: 'high-cut', band: 'high', name: '비스듬한 집',
    outer: loop([3, 0], [9, 0], [11, 2], [11, 8], [1, 8], [1, 2]),
    inner: [[4, 0, 4, 3], [8, 0, 8, 3], [1, 3, 11, 3], [1, 5, 4, 5], [4, 5, 4, 8], [8, 5, 11, 5], [8, 5, 8, 8]],
  },
  {
    id: 'high-roof', band: 'high', name: '뾰족한 집',
    outer: loop([1, 3], [3, 0], [9, 0], [11, 3], [11, 8], [1, 8]),
    inner: [[4, 0, 4, 3], [8, 0, 8, 3], [1, 3, 11, 3], [1, 5, 4, 5], [4, 5, 4, 8], [8, 5, 11, 5], [8, 5, 8, 8]],
  },
];

/** 줄을 벽 조각으로 바꾼다. rx · ry 는 처음 네모 한 칸이 지금 몇 칸인지이고, 가장 가까운 점으로 옮긴다 */
export function segEdges(segs: Seg[], rx = 1, ry = rx): string[] {
  return segs.flatMap(([x1, y1, x2, y2]) => segmentEdges({ x: Math.round(x1 * rx), y: Math.round(y1 * ry) }, { x: Math.round(x2 * rx), y: Math.round(y2 * ry) }));
}

export function templatesFor(band: Band): Template[] {
  return TEMPLATES.filter((t) => t.band === band);
}

export function templateById(id: string | null): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
