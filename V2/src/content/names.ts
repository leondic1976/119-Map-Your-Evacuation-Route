/** 칸 이름과 표시 이름 — 화면에 보이는 낱말은 여기서만 정한다 */
import type { Band, CellKind, MarkId } from '../core/types';

export const KIND_NAME: Record<CellKind, string> = { room: '방', pass: '지나가는 곳' };

export interface Crayon {
  id: string;
  kind: CellKind;
  name: string | null;
  label: string;
}

const ROOM: Crayon = { id: 'room', kind: 'room', name: null, label: '방' };
const PASS: Crayon = { id: 'pass', kind: 'pass', name: null, label: '지나가는 곳' };

/** 아파트에 흔한 베란다는 어느 학년이든 고른다 */
const VERANDA: Crayon = { id: 'veranda', kind: 'room', name: 'veranda', label: '베란다' };
const KITCHEN: Crayon = { id: 'kitchen', kind: 'room', name: 'kitchen', label: '부엌' };
const BATH: Crayon = { id: 'bath', kind: 'room', name: 'bath', label: '화장실' };
const LIVING: Crayon = { id: 'living', kind: 'pass', name: 'living', label: '거실' };

const NAMED_ROOMS: Crayon[] = [
  { id: 'myroom', kind: 'room', name: 'myroom', label: '내 방' },
  { id: 'main', kind: 'room', name: 'main', label: '안방' },
  { id: 'other', kind: 'room', name: 'other', label: '다른 방' },
  KITCHEN,
  BATH,
  { id: 'utility', kind: 'room', name: 'utility', label: '다용도실' },
  VERANDA,
  { id: 'refuge', kind: 'room', name: 'refuge', label: '대피공간' },
];
const NAMED_PASS: Crayon[] = [
  LIVING,
  { id: 'entry', kind: 'pass', name: 'entry', label: '현관' },
  { id: 'stairs', kind: 'pass', name: 'stairs', label: '계단' },
];
const HIGH_PASS: Crayon[] = [{ id: 'hall', kind: 'pass', name: 'hall', label: '복도' }];

export function crayonsFor(band: Band): { room: Crayon[]; pass: Crayon[] } {
  if (band === 'low') return { room: [ROOM, KITCHEN, BATH, VERANDA], pass: [PASS, LIVING] };
  if (band === 'mid') return { room: NAMED_ROOMS, pass: NAMED_PASS };
  return { room: NAMED_ROOMS, pass: [...NAMED_PASS, ...HIGH_PASS] };
}

const ALL = [ROOM, PASS, ...NAMED_ROOMS, ...NAMED_PASS, ...HIGH_PASS];

export function cellLabel(kind: CellKind | null, name: string | null): string {
  if (name) return ALL.find((c) => c.name === name)?.label ?? KIND_NAME[kind ?? 'room'];
  return kind ? KIND_NAME[kind] : '';
}

export const MARK_NAME: Record<MarkId, string> = {
  me: '내 자리',
  meet: '만나는 곳',
  gas: '가스레인지',
  extinguisher: '소화기',
  alarm: '화재 감지기',
};

export const MARK_HINT: Record<MarkId, string> = {
  me: '내가 자는 곳',
  meet: '집 밖에 정한다',
  gas: '불 조심할 곳',
  extinguisher: '불을 끄는 통',
  alarm: '불이 나면 울린다',
};

export const GRADES = [1, 2, 3, 4, 5, 6] as const;

/** 내 모습 — 그림은 ui/KidFace.tsx 가 그린다 */
export const LOOKS = [
  { id: 'a', hair: '#3a2a1e', shirt: '#2f7fbf', style: 'short' },
  { id: 'b', hair: '#1f1a17', shirt: '#e0603f', style: 'long' },
  { id: 'c', hair: '#6a3f21', shirt: '#3e9d5d', style: 'curly' },
  { id: 'd', hair: '#1f1a17', shirt: '#8a5fc4', style: 'pony' },
  { id: 'e', hair: '#3a2a1e', shirt: '#e3a62a', style: 'cap' },
  { id: 'f', hair: '#4a2d2d', shirt: '#d9558c', style: 'twin' },
] as const;

export type LookId = (typeof LOOKS)[number]['id'];
