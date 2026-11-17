/** 표시 가운데 여럿 놓일 수 있는 소화기를 한데 모아 다룬다(대장 #169). 계산만 한다. */
import type { MarkId, Plan, Pt } from './types';

/** 지도 한 장에 놓는 소화기 수의 끝. 표시가 지도를 덮지 않을 만큼만 둔다 */
export const MAX_EXTINGUISHERS = 4;

/** 놓인 소화기 자리 전부 — 첫째와 그 뒤의 것들 */
export function extinguishers(plan: Plan): Pt[] {
  const first = plan.marks.extinguisher;
  return first ? [first, ...(plan.extraExtinguishers ?? [])] : [];
}

/** 이 표시의 할 일을 마쳤나. 소화기는 놓았거나 「우리 집에 없어」를 골랐으면 마친 것이다 */
export function markDone(plan: Plan, id: MarkId): boolean {
  if (id === 'extinguisher') return Boolean(plan.marks.extinguisher) || plan.noExtinguisher === true;
  return Boolean(plan.marks[id]);
}
