/**
 * 돌아보기 — 잘한 점은 늘 하나 이상, 고칠 점은 세 개까지. 점수·등급을 만들지 않는다.
 * 여기서는 열쇠만 고르고 문장은 콘텐츠에 있다.
 */
import type { DrillState } from './drill';
import { hasOtherRoute } from './auto';
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

/** 칭찬 도장 — 안전 행동을 할 때마다 하나씩 찍힌다. 수를 세거나 등급을 매기지 않는다 */
export type StampId = 'shout' | 'nose' | 'crouch' | 'touch' | 'close' | 'stairs' | 'meet';

/** 학년 단계마다 찍을 수 있는 도장 */
export function stampSlots(band: Band): StampId[] {
  if (band === 'low') return ['shout', 'crouch', 'stairs', 'meet'];
  if (band === 'mid') return ['shout', 'nose', 'crouch', 'touch', 'stairs', 'meet'];
  return ['shout', 'nose', 'crouch', 'touch', 'close', 'stairs', 'meet'];
}

/** 지금까지 찍힌 도장. `met` 은 안전한 곳에 닿았는가다 */
export function earnedStamps(state: DrillState, band: Band, met = state.end === 'meet'): StampId[] {
  const s = state.stats;
  const picked = state.picked ?? [];
  const has: Record<StampId, boolean> = {
    shout: picked.includes('shout'),
    nose: picked.includes('nose'),
    crouch: s.crouchedInHazard > 0,
    touch: s.doorsChecked > 0,
    close: s.doorsClosed > 0,
    stairs: picked.includes('stairs'),
    meet: met,
  };
  return stampSlots(band).filter((id) => has[id]);
}

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
  // 안내를 듣고 몸을 낮췄다면 잘한 점이다. 한 번도 낮추지 않았을 때만 다음에 해 볼 것으로 남긴다
  if (s.stoodInHazard > 0 && s.crouchedInHazard === 0) fixes.push('crouch');
  if (band !== 'low' && s.doorsChecked === 0) fixes.push('touch');
  if (band === 'high' && s.doorsClosed === 0) fixes.push('close');
  if (state.end === 'meet' && !s.followedRoute) fixes.push('route');
  if (band === 'high' && plan.route2.length === 0 && hasOtherRoute(plan)) fixes.push('second');
  return { praises, fixes: fixes.slice(0, 3) };
}
