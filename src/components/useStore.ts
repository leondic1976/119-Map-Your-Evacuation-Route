'use client';

/** 저장소 구독 훅 · 파생 데이터 메모 */
import { useMemo, useSyncExternalStore } from 'react';
import { AppState, store } from '../lib/store';
import { Grid, buildGrid } from '../lib/grid';
import { WallModel, buildWalls } from '../lib/walls';
import { Plan, Pt } from '../lib/types';
import { SmokeField, simulate } from '../lib/firesim';

export function useApp(): AppState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

/** 평면이 바뀔 때만 벽체·격자를 다시 만든다 */
export function useModel(plan: Plan): { model: WallModel; grid: Grid } {
  return useMemo(() => {
    const model = buildWalls(plan);
    const grid = buildGrid(plan, 10, model);
    return { model, grid };
  }, [plan]);
}

/** 발화 지점·원인이 정해졌을 때만 확산을 해석한다 */
export function useField(
  plan: Plan,
  grid: Grid,
  origin: Pt | null,
  cause: string,
  closed?: string[],
): SmokeField | null {
  const key = closed ? closed.join(',') : '';
  return useMemo(() => {
    if (!origin) return null;
    if (plan.rooms.length === 0) return null;
    return simulate(plan, grid, origin, cause, closed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, grid, origin?.x, origin?.y, cause, key]);
}

export { store };
