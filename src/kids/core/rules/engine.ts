/**
 * 규칙 평가 러너 — plan2.md §5.3.1.
 *
 * 핵심 UX 규칙: 챗봇은 nextIssue 한 건만 말한다.
 * 위반 목록을 한 번에 쏟아 놓으면 아이가 압도된다(P5).
 */
import type { RuleContext, RuleDef, RuleReport, RuleResult, RuleSeverity } from '../../types/rules';

const ORDER: Record<RuleSeverity, number> = { critical: 0, important: 1, tip: 2 };

export function evaluate(defs: RuleDef[], ctx: RuleContext): RuleReport {
  const applicable = defs.filter(
    (d) =>
      d.disasters.includes(ctx.disaster) &&
      (!d.scenarios || !ctx.scenario || d.scenarios.includes(ctx.scenario)),
  );
  const byId = new Map(applicable.map((d) => [d.id, d]));
  const results = applicable.map((d) => d.evaluate(ctx));

  // 이용 수준이 쉬움이면 tip 은 말하지 않는다 (plan2.md §7.3)
  const visible = results.filter((r) => {
    if (r.status === 'na') return false;
    if (ctx.profile.gradeMode === 'easy' && byId.get(r.ruleId)?.severity === 'tip') return false;
    return true;
  });

  const failed = visible.filter((r) => r.status === 'fail');
  const passed = visible.filter((r) => r.status === 'pass');
  const sev = (r: RuleResult): number => ORDER[byId.get(r.ruleId)?.severity ?? 'tip'];
  failed.sort((a, b) => sev(a) - sev(b));

  return {
    disaster: ctx.disaster,
    scenario: ctx.scenario,
    passed,
    failed,
    nextIssue: failed[0],
    completeness: passed.length / (passed.length + failed.length || 1),
  };
}

export function severityOf(defs: RuleDef[], ruleId: string): RuleSeverity {
  return defs.find((d) => d.id === ruleId)?.severity ?? 'tip';
}

export function titleOf(defs: RuleDef[], ruleId: string): string {
  return defs.find((d) => d.id === ruleId)?.title ?? ruleId;
}

export function defOf(defs: RuleDef[], ruleId: string): RuleDef | undefined {
  return defs.find((d) => d.id === ruleId);
}

/** critical 위반이 남아 있는가 — 인쇄를 막지는 않지만 안내에 쓴다 */
export function hasCritical(defs: RuleDef[], report: RuleReport): boolean {
  return report.failed.some((f) => severityOf(defs, f.ruleId) === 'critical');
}

/* 규칙 구현이 결과를 짧게 쓰도록 돕는 것들 */

export function pass(ruleId: string, params: Record<string, string> = {}): RuleResult {
  return { ruleId, status: 'pass', targets: {}, params };
}

export function fail(
  ruleId: string,
  targets: RuleResult['targets'] = {},
  params: Record<string, string> = {},
): RuleResult {
  return { ruleId, status: 'fail', targets, params };
}

export function na(ruleId: string): RuleResult {
  return { ruleId, status: 'na', targets: {}, params: {} };
}
