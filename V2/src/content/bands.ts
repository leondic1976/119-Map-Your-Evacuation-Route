/** 학년 단계 — 높을수록 지도에 담기는 것이 늘어난다 (설계서 §4) */
import type { Band, MarkId } from '../core/types';

export interface BandInfo {
  id: Band;
  label: string;
  cols: number;
  rows: number;
  /** 새 종이의 네모 수. `cols`×`rows` 보다 촘촘하다(대장 #137) */
  start: [number, number];
  windows: boolean;
  marks: MarkId[];
  secondRoute: boolean;
  touchDoors: boolean;
  closeDoors: boolean;
}

export const BANDS: Record<Band, BandInfo> = {
  low: {
    id: 'low',
    label: '1~2학년',
    cols: 8,
    rows: 6,
    start: [10, 7],
    windows: false,
    marks: ['me', 'meet', 'extinguisher'],
    secondRoute: false,
    touchDoors: false,
    closeDoors: false,
  },
  mid: {
    id: 'mid',
    label: '3~4학년',
    cols: 10,
    rows: 7,
    start: [12, 9],
    windows: true,
    marks: ['me', 'meet', 'gas', 'extinguisher'],
    secondRoute: false,
    touchDoors: true,
    closeDoors: false,
  },
  high: {
    id: 'high',
    label: '5~6학년',
    cols: 12,
    rows: 8,
    start: [15, 10],
    windows: true,
    marks: ['me', 'meet', 'gas', 'extinguisher', 'alarm'],
    secondRoute: true,
    touchDoors: true,
    closeDoors: true,
  },
};

export function bandOfGrade(grade: number): Band {
  if (grade <= 2) return 'low';
  if (grade <= 4) return 'mid';
  return 'high';
}
