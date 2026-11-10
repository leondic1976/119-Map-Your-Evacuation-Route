/** 손 떨림이 지금 점 몇 칸에 해당하는지. 점이 촘촘할수록 크고, 지도를 크게 볼수록 작다 */
import { densityOf } from '../core/density';
import type { Plan } from '../core/types';
import { getApp } from '../store/app';

export function getHandUnit(plan: Plan): number {
  const scale = getApp().view?.scale ?? 1;
  const unit = densityOf(plan) / scale;
  // 새 종이의 모눈(1.2 ~ 1.25배)은 처음 네모와 같은 손길로 그린다. 배로 촘촘해졌을 때부터 손 떨림을 더 봐준다.
  // 조금 촘촘하다고 너그러워지면 모서리를 돌던 손이 비스듬한 벽이 된다
  return unit < 1.5 ? 1 : unit;
}
