/**
 * 돌아보기 — 잘한 점은 늘 하나 이상, 고칠 점은 세 개까지. 점수·등급을 만들지 않는다.
 * 여기서는 열쇠만 고르고 문장은 콘텐츠에 있다.
 */
import type { DrillState } from './drill';
import { findSecondRoute } from './auto';
import type { Band, Plan } from './types';

export type PraiseId =
  | 'tried'
  | 'escaped'
  | 'route'
  | 'crouch'
  | 'touch'
  | 'close'
  | 'meet'
  | 'rescue';

export type FixId = 'crouch' | 'touch' | 'close' | 'route' | 'second';

export function buildReport(state: DrillState, plan: Plan, band: Band): { praises: PraiseId[]; fixes: FixId[] } {
  const s = state.stats;
  const praises: PraiseId[] = [];
  if (state.end === 'meet') praises.push('escaped');
  if (state.end === 'rescue') praises.push('rescue');
  if (s.followedRoute) praises.push('route');
  if (s.crouchedInHazard > 0) praises.push('crouch');
  if (s.doorsChecked > 0) praises.push('touch');
  if (s.doorsClosed > 0) praises.push('close');
  if (state.end === 'meet') praises.push('meet');
  if (praises.length === 0) praises.push('tried');

  const fixes: FixId[] = [];
  if (s.stoodInHazard > 0) fixes.push('crouch');
  if (band !== 'low' && s.doorsChecked === 0) fixes.push('touch');
  if (band === 'high' && s.doorsClosed === 0) fixes.push('close');
  if (state.end === 'meet' && !s.followedRoute) fixes.push('route');
  if (band === 'high' && plan.route2.length === 0 && findSecondRoute(plan)) fixes.push('second');
  return { praises, fixes: fixes.slice(0, 3) };
}
