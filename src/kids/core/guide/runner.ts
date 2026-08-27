/**
 * 가이드 러너 — plan2-1.md §4.3.
 *
 *   1. 트리거가 맞는 규칙을 모은다
 *   2. 쿨다운이 안 지난 것을 뺀다 (같은 말 반복 금지 — 잔소리 방지)
 *   3. priority 가 가장 높은 하나를 돌려준다
 *   4. 없으면 null — 캐릭터는 침묵한다. 할 말이 없으면 말하지 않는다
 */
import type { GuideBubble, GuideRule, GuideTrigger } from '../../types/guide';

export function matches(rule: GuideTrigger, ev: GuideTrigger): boolean {
  if (rule.on !== ev.on) return false;
  switch (rule.on) {
    case 'stepEnter':
      return ev.on === 'stepEnter' && rule.step === ev.step;
    case 'blockPlaced':
      return ev.on === 'blockPlaced' && rule.blockKind === ev.blockKind;
    case 'ruleFail':
      return ev.on === 'ruleFail' && rule.ruleId === ev.ruleId;
    case 'rulePass':
      return ev.on === 'rulePass' && rule.ruleId === ev.ruleId;
    case 'gameEvent':
      return ev.on === 'gameEvent' && rule.event === ev.event;
    case 'gameEnd':
      return ev.on === 'gameEnd' && rule.outcome === ev.outcome;
    case 'idle':
      return ev.on === 'idle' && ev.seconds >= rule.seconds;
    case 'helpRequested':
      return ev.on === 'helpRequested' && (rule.step === undefined || rule.step === ev.step);
    case 'gameStart':
    default:
      return true;
  }
}

export function selectGuide(
  rules: GuideRule[],
  event: GuideTrigger,
  history: Record<string, number>,
  now: number,
): GuideRule | null {
  const hits = rules.filter((r) => {
    if (!matches(r.trigger, event)) return false;
    const last = history[r.id];
    if (last === undefined) return true;
    if (r.cooldown === 0) return false;
    return now - last >= r.cooldown * 1000;
  });
  if (!hits.length) return null;
  hits.sort((a, b) => b.priority - a.priority);
  return hits[0];
}

export function toBubble(
  rule: GuideRule,
  gradeMode: 'easy' | 'normal',
  unverified: boolean,
  now: number,
  params: Record<string, string> = {},
): GuideBubble {
  const raw = gradeMode === 'easy' ? rule.text.easy : rule.text.normal;
  return {
    ruleId: rule.id,
    speaker: rule.speaker,
    emotion: rule.emotion,
    text: raw.replace(/\{(\w+)\}/g, (m, k: string) => params[k] ?? m),
    highlight: rule.highlight,
    cardId: rule.cardId,
    unverified,
    at: now,
  };
}

/** 읽어 주기용 — 기호를 걷어낸다 */
export function toTts(text: string): string {
  return text.replace(/[·…“”‘’"'`()[\]{}<>]/g, ' ').replace(/\s+/g, ' ').trim();
}
