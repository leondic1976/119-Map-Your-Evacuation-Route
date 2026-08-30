/**
 * 결과 리포트 만들기 — docs/DESIGN-v1.1-changes.md §5.3.
 *
 *   1. 정적 항목: 규칙 평가 통과 → 잘한 점, 위반 → 고칠 점
 *   2. 동적 항목: 플레이 로그 판정표
 *   3. 잘한 점 최소 1개 보장 (P5)
 *   4. 고칠 점 최대 3개 (압도 방지)
 *   5. 잘한 점이 먼저
 */
import type { RuleDef, RuleMessages, RuleReport, RuleResult } from '../../types/rules';
import type { PlayLog, Report, ReportItem, ReportItemDef } from '../../types/report';
import type { UserProfile } from '../../types/save';
import { FALLBACK_FIRST, FALLBACK_TRIED, VERDICTS } from './verdicts';

const WEIGHT = { critical: 100, important: 70, tip: 40 } as const;

/** 경로를 고쳐야 풀리는 규칙. 나머지는 도면을 고친다 */
const ROUTE_RULES = new Set([
  'RULE-C-01', 'RULE-C-04', 'RULE-C-05', 'RULE-C-06',
  'RULE-F-01', 'RULE-F-02', 'RULE-F-03', 'RULE-F-05', 'RULE-F-06',
  'RULE-E-03', 'RULE-E-04', 'RULE-W-01', 'RULE-G-03',
]);

export interface BuildInput {
  ruleReports: RuleReport[];
  playLog: PlayLog;
  profile: UserProfile;
  attemptNo: number;
  defs: RuleDef[];
  messages: Record<string, RuleMessages>;
  items: ReportItemDef[];
  /** 출처 id → 1차 대조를 마쳤는가 */
  isVerified: (sourceIds: string[]) => boolean;
  /** 발원지 추첨이 20회 안에 생존 가능한 판을 찾지 못했다 — RULE-F-04 를 앞세운다 */
  unguaranteed?: boolean;
}

export function fill(text: string, params: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => params[k] ?? m);
}

export function buildReport(input: BuildInput): Report {
  const { ruleReports, playLog, attemptNo, defs, messages, items, isVerified } = input;
  const good: ReportItem[] = [];
  const fix: ReportItem[] = [];
  const seenFail = new Set<string>();
  const seenPass = new Set<string>();

  const defOf = (id: string): RuleDef | undefined => defs.find((d) => d.id === id);

  /* 1. 정적 — 위반을 먼저 모은다. 같은 규칙이 한 경로에서는 통과하고 다른 경로에서 어긋나면 위반으로 본다 */
  for (const rep of ruleReports) {
    for (const r of rep.failed) {
      if (seenFail.has(r.ruleId)) continue;
      seenFail.add(r.ruleId);
      const def = defOf(r.ruleId);
      const msg = messages[r.ruleId];
      if (!def || !msg) continue;
      let weight: number = WEIGHT[def.severity];
      if (input.unguaranteed && r.ruleId === 'RULE-F-04') weight = 130;
      fix.push({
        id: r.ruleId,
        polarity: 'fix',
        headline: { easy: fill(msg.reportHeadline.easy, r.params), normal: fill(msg.reportHeadline.normal, r.params) },
        cardId: msg.whyCardId,
        highlight: r.targets,
        weight,
        action: { type: ROUTE_RULES.has(r.ruleId) ? 'editRoute' : 'editPlan' },
        sourceIds: def.sourceIds,
        unverified: !isVerified(def.sourceIds),
      });
    }
  }
  for (const rep of ruleReports) {
    for (const r of rep.passed) {
      if (seenFail.has(r.ruleId) || seenPass.has(r.ruleId)) continue;
      seenPass.add(r.ruleId);
      const def = defOf(r.ruleId);
      const msg = messages[r.ruleId];
      if (!def || !msg) continue;
      // 비켜 갈 길이 없어 통과로 친 것은 칭찬하지 않는다 — 주의 안내는 가이드가 한다
      if (r.params.unavoidable) continue;
      good.push({
        id: r.ruleId,
        polarity: 'good',
        headline: { easy: fill(msg.praise.easy, r.params), normal: fill(msg.praise.normal, r.params) },
        cardId: msg.whyCardId,
        weight: WEIGHT[def.severity] - 10,
        sourceIds: def.sourceIds,
        unverified: !isVerified(def.sourceIds),
      });
    }
  }

  /* 2. 동적 */
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const v of VERDICTS) {
    if (!v.test(playLog)) continue;
    const def = byId.get(v.id);
    if (!def) continue;
    const item = toItem(def, isVerified);
    if (def.polarity === 'good') good.push(item);
    else fix.push(item);
  }

  /* 3. 잘한 점 최소 1개 (P5) */
  if (good.length === 0) {
    const id = attemptNo <= 1 ? FALLBACK_FIRST : FALLBACK_TRIED;
    const def = byId.get(id) ?? byId.get(FALLBACK_TRIED);
    if (def) good.push(toItem(def, isVerified));
    else {
      good.push({
        id: FALLBACK_TRIED,
        polarity: 'good',
        headline: { easy: '끝까지 포기하지 않고 해 봤어!', normal: '끝까지 포기하지 않고 대피를 시도했습니다.' },
        weight: 10,
        sourceIds: ['app-guide'],
      });
    }
  }

  /* 4·5. 정렬과 상한 */
  good.sort((a, b) => b.weight - a.weight);
  fix.sort((a, b) => b.weight - a.weight);
  const shown = fix.slice(0, 3);

  return {
    outcome: playLog.outcome,
    good,
    fix: shown,
    hiddenFixCount: fix.length - shown.length,
    playLog,
    attemptNo,
  };
}

function toItem(def: ReportItemDef, isVerified: (ids: string[]) => boolean): ReportItem {
  return {
    id: def.id,
    polarity: def.polarity,
    headline: def.headline,
    cardId: def.cardId,
    weight: def.weight,
    action: def.action,
    sourceIds: def.sourceIds,
    unverified: !isVerified(def.sourceIds),
  };
}

/** 리포트 결과 가운데 규칙 위반의 강조 대상을 모은다 — "지도 고치기"가 이 상태로 연다 */
export function highlightOf(report: Report): { cells: RuleResult['targets']['cells']; blockIds: string[] } {
  const cells: NonNullable<RuleResult['targets']['cells']> = [];
  const blockIds: string[] = [];
  for (const f of report.fix) {
    if (f.highlight?.cells) cells.push(...f.highlight.cells);
    if (f.highlight?.blockIds) blockIds.push(...f.highlight.blockIds);
  }
  return { cells, blockIds };
}
