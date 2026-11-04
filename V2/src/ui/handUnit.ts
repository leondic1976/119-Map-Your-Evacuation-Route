/** 손 떨림이 지금 점 몇 칸에 해당하는지. 점이 촘촘할수록 크고, 지도를 크게 볼수록 작다 */
import { densityOf } from '../core/density';
import type { Plan } from '../core/types';
import { getApp } from '../store/app';

export function getHandUnit(plan: Plan): number {
  const scale = getApp().view?.scale ?? 1;
  return Math.max(1, densityOf(plan) / scale);
}
