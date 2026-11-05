/**
 * 아파트 형태 — 고르면 벽과 칸 이름이 함께 깔린다. 고르지 않아도 된다.
 *
 * 12×8 칸에 글자로 그린다. 위가 복도나 계단 쪽(현관)이고 아래가 앞쪽(베란다)이다.
 * 어떤 점 개수에서든 칸 하나하나가 어느 글자에 드는지 보고 짓기 때문에, 점 개수가 달라져도 모양이 그대로다.
 *
 * 구성은 우리나라 아파트의 흔한 평면을 따른다.
 * 작은 집(방 2 · 화장실 1), 전용 59㎡ 안팎(방 3 · 화장실 2 · 3베이), 전용 84㎡ 안팎(방 3 · 화장실 2 · 4베이),
 * 큰 집(방 4 · 화장실 2), 타워형(꺾인 모양 · 두 쪽으로 창), 복도식(앞뒤로 긴 모양).
 */
import { hKey, sqKey, vKey } from '../core/grid';
import type { CellKind, CellTag, Plan } from '../core/types';

export interface Home {
  id: string;
  name: string;
  /** 짧은 풀이 */
  note: string;
  art: string[];
}

export const HOMES: Home[] = [
  {
    id: 'home-2',
    name: '방 2개',
    note: '작은 집. 거실과 부엌도 있어',
    art: [
      'RRRRBBEEKKUU',
      'RRRRBBEEKKUU',
      'LLLLLLLLLLLL',
      'LLLLLLLLLLLL',
      'MMMMMMLLLLLL',
      'MMMMMMLLLLLL',
      'MMMMMMLLLLLL',
      'VVVVVVVVVVVV',
    ],
  },
  {
    id: 'home-3',
    name: '방 3개',
    note: '방이 앞뒤로. 화장실이 둘',
    art: [
      'OOOOBBEEKKKU',
      'OOOOBBEEKKKU',
      'LLLLLLLLLLLL',
      'LLLLLLLLLLLL',
      'MMbbLLLLRRRR',
      'MMMMLLLLRRRR',
      'MMMMLLLLRRRR',
      'VVVVVVVVVVVV',
    ],
  },
  {
    id: 'home-3w',
    name: '방 3개 넓게',
    note: '방이 앞쪽에. 대피공간도 있어',
    art: [
      'bbBBEEKKKKUU',
      'bbBBEEKKKKUU',
      'LLLLLLLLLLLL',
      'LLLLLLLLLLLL',
      'OOORRRLLLMMM',
      'OOORRRLLLMMM',
      'OOORRRLLLMMM',
      'VVVVVVVVVVAA',
    ],
  },
  {
    id: 'home-4',
    name: '방 4개',
    note: '큰 집. 대피공간도 있어',
    art: [
      'PPPbBBEEKKKU',
      'PPPbBBEEKKKU',
      'LLLLLLLLLLLL',
      'LLLLLLLLLLLL',
      'OOORRRLLLMMM',
      'OOORRRLLLMMM',
      'OOORRRLLLMMM',
      'VVVVVVVVVVAA',
    ],
  },
  {
    id: 'home-tower',
    name: '꺾인 집',
    note: '창이 두 쪽. 거실과 부엌도 있어',
    art: [
      'EEBBOOOO....',
      'EEBBOOOO....',
      'LLLLLLLL....',
      'LLLLLLLLKKUU',
      'LLLLLLLLKKUU',
      'MMMMMLLLLRRR',
      'MMMMMLLLLRRR',
      'VVVVVVVVVVVV',
    ],
  },
  {
    id: 'home-long',
    name: '긴 집',
    note: '앞뒤로 창. 복도도 있어',
    art: [
      'EEBBKKKKKKUU',
      'EEBBKKKKKKUU',
      'LLLLLLLLHHHH',
      'LLLLLLLLHHHH',
      'LLLLLLLLRROO',
      'MMMMMMLLRROO',
      'MMMMMMLLRROO',
      'VVVVVVVVVVVV',
    ],
  },
];

const SPACE: Record<string, { kind: CellKind; name: string }> = {
  M: { kind: 'room', name: 'main' },
  R: { kind: 'room', name: 'myroom' },
  O: { kind: 'room', name: 'other' },
  P: { kind: 'room', name: 'other' },
  K: { kind: 'room', name: 'kitchen' },
  U: { kind: 'room', name: 'utility' },
  B: { kind: 'room', name: 'bath' },
  b: { kind: 'room', name: 'bath' },
  V: { kind: 'room', name: 'veranda' },
  A: { kind: 'room', name: 'refuge' },
  L: { kind: 'pass', name: 'living' },
  E: { kind: 'pass', name: 'entry' },
  H: { kind: 'pass', name: 'hall' },
};

export const homeById = (id: string): Home | undefined => HOMES.find((h) => h.id === id);

/** 이 형태를 cols×rows 칸 종이에 지은 벽과 칸 이름 */
export function buildHome(home: Home, cols: number, rows: number): Pick<Plan, 'walls' | 'tags'> {
  const at = (x: number, y: number): string => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return '.';
    return home.art[Math.floor(((y + 0.5) * home.art.length) / rows)]![Math.floor(((x + 0.5) * home.art[0]!.length) / cols)]!;
  };
  const walls: string[] = [];
  const tags: Record<string, CellTag> = {};
  const named = new Set<string>();
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x <= cols; x++) {
      if (x < cols && at(x, y - 1) !== at(x, y)) walls.push(hKey(x, y));
      if (y < rows && at(x - 1, y) !== at(x, y)) walls.push(vKey(x, y));
      const here = at(x, y);
      if (here !== '.' && !named.has(here)) {
        named.add(here);
        tags[sqKey(x, y)] = SPACE[here]!;
      }
    }
  }
  return { walls, tags };
}
