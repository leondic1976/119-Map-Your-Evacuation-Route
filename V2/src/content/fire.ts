/**
 * 화재 수치 — 위험장 엔진에 넣는 값. 저학년일수록 천천히 번진다.
 * 값은 0~100 이고 100 에서 칸이 막힌다.
 *
 * 불은 작게 시작해 차례마다 자란다(대장 #137). 처음에는 그 칸에 들어갈 수도 있고, 두세 차례 뒤에 뜨거워진다.
 * 연기는 문과 트인 곳으로 먼저 번지고, 불은 그 뒤를 따라 천천히 온다.
 */
import type { DrillConfig } from '../core/drill';
import type { Band, ItemKind } from '../core/types';

const levels = { light: 20, hot: 60, blocked: 100 };

/** 처음 값 — 연기가 보이고 이웃으로 번지기 시작하지만 아직 뜨겁지는 않다 */
const start = 45;

/**
 * 불이 시작되는 칸의 무게. 불을 쓰는 부엌이 가장 잦고, 전기와 탈 것이 많은 방과 거실이 그다음이다.
 * 화장실과 대피공간은 다른 칸이 없을 때만 고른다.
 */
const ignite: Record<string, number> = {
  kitchen: 6,
  myroom: 3,
  main: 3,
  other: 3,
  room: 3,
  living: 2,
  utility: 2,
  veranda: 1,
  entry: 0.5,
  hall: 0.5,
  stairs: 0.3,
  pass: 0.5,
  bath: 0,
  refuge: 0,
  '*': 1,
};

/** 가스레인지 표시가 있는 칸에 더하는 무게 */
const igniteMark = 5;

/** 전기를 쓰거나 불을 쓰는 가구 — 놓여 있으면 그 자리에서 시작한다 */
const sparks: ItemKind[] = ['sink', 'fridge', 'tv', 'washer', 'desk'];

const shared = { levels, start, ignite, igniteMark, sparks };

export const FIRE: Record<Band, DrillConfig> = {
  low: {
    ...shared,
    params: { growth: 20, spreadOpen: 14, spreadClosed: 4, spreadFrom: 40, max: 100 },
  },
  mid: {
    ...shared,
    params: { growth: 25, spreadOpen: 18, spreadClosed: 5, spreadFrom: 40, max: 100 },
  },
  high: {
    ...shared,
    params: { growth: 30, spreadOpen: 22, spreadClosed: 6, spreadFrom: 40, max: 100 },
  },
};
