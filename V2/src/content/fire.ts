/**
 * 화재 수치 — 위험장 엔진에 넣는 값. 저학년일수록 천천히 번진다.
 * 값은 0~100 이고 100 에서 칸이 막힌다.
 */
import type { DrillConfig } from '../core/drill';
import type { Band } from '../core/types';

const levels = { light: 20, hot: 60, blocked: 100 };

export const FIRE: Record<Band, DrillConfig> = {
  low: {
    levels,
    params: { growth: 100, spreadOpen: 22, spreadClosed: 6, spreadFrom: 40, max: 100 },
  },
  mid: {
    levels,
    params: { growth: 100, spreadOpen: 28, spreadClosed: 7, spreadFrom: 40, max: 100 },
  },
  high: {
    levels,
    params: { growth: 100, spreadOpen: 34, spreadClosed: 8, spreadFrom: 40, max: 100 },
  },
};
