/**
 * 콘텐츠 검증 게이트 — docs/DESIGN-v1.1-changes.md §8.3.
 *
 * 두 모드로 돈다.
 *   개발  — 출처 미검수는 경고. 구조 오류만 실패한다.
 *   배포  — 출처 미검수도 실패한다. 검수 전 문장이 배포에 섞이는 것을 구조로 막는다.
 */
import type { Block, FloorPlan, OpeningKind, RoomKind } from '../types/plan';
import { SCENARIO_KEYS, isOpening, isRoom } from '../types/plan';
import { RULES } from '../core/rules/definitions';
import { SPECIAL_RULES } from '../core/hazard/rules';
import { cellKey, cellsOf, rectsOverlap, step } from '../core/grid/geometry';
import {
  BANNED_PHRASES,
  BLOCKS,
  GUIDE_CARDS,
  GUIDE_RULES,
  HAZARD_PRESETS,
  PALETTE_BASIC,
  REPORT_ITEMS,
  RULE_MESSAGES,
  SOURCES,
  TEMPLATES,
} from './index';

export interface ValidationReport {
  errors: string[];
  warnings: string[];
}

const CATEGORIES = ['room', 'opening', 'safety', 'furniture', 'hazard', 'marker'];

const ROOM_KINDS: RoomKind[] = [
  'bedroom', 'living', 'kitchen', 'bath', 'entry',
  'balcony', 'utility', 'corridor', 'stair', 'elevator_hall',
];
const OPENING_KINDS: OpeningKind[] = [
  'door', 'front_door', 'inner_door', 'window', 'balcony_window', 'emergency_exit',
];

/** CT-3 — 초등용 문장 하나의 길이 상한 */
const EASY_MAX = 30;

/** 화면 단계 이름 — helpRequested 가 이 모두에 답해야 한다 (FR-9.7 · P3) */
export const ALL_STEPS = ['template', 'lowFloor', 'mySpot', 'meeting', 'ready', 'edit', 'route', 'routeAlt', 'game', 'report'];

export function validateContent(strict = false): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sourceIds = new Set(SOURCES.map((s) => s.id));
  const cardIds = new Set(GUIDE_CARDS.map((c) => c.id));
  const ruleIds = new Set(RULES.map((r) => r.id));

  const checkSources = (owner: string, ids: string[]): void => {
    if (ids.length === 0) errors.push(`${owner}: 출처가 없다 (P6)`);
    for (const sid of ids) {
      if (sid === 'TODO-VERIFY') {
        (strict ? errors : warnings).push(`${owner}: 출처가 TODO-VERIFY 로 남아 있다`);
      } else if (!sourceIds.has(sid)) {
        errors.push(`${owner}: 없는 출처를 가리킨다 — ${sid}`);
      } else if (strict && SOURCES.find((s) => s.id === sid)?.verified === false) {
        errors.push(`${owner}: 출처 ${sid} 가 아직 1차 대조 전이다`);
      }
    }
  };
  const checkBanned = (owner: string, texts: (string | undefined)[]): void => {
    for (const banned of BANNED_PHRASES) {
      for (const t of texts) if (t && t.includes(banned)) errors.push(`${owner}: 금지 표현 — "${banned}" (CT-9)`);
    }
  };
  const checkEasy = (owner: string, text: string): void => {
    for (const sentence of text.split(/[.!?]/).map((s) => s.trim()).filter(Boolean)) {
      if (sentence.length > EASY_MAX) warnings.push(`${owner}: easy 문장이 ${sentence.length}자다 (${EASY_MAX}자 권장) — "${sentence}"`);
    }
  };

  const unverified = SOURCES.filter((s) => !s.verified).length;
  if (!strict && unverified) warnings.push(`출처 ${unverified}건이 1차 대조 전이다 (배포 전 확인 필요)`);

  /* 1. 학습 카드 */
  if (GUIDE_CARDS.length < 40) warnings.push(`학습 카드가 ${GUIDE_CARDS.length}장이다 (40장 이상 권장)`);
  const seenCard = new Set<string>();
  for (const c of GUIDE_CARDS) {
    if (seenCard.has(c.id)) errors.push(`카드 id 가 겹친다 — ${c.id}`);
    seenCard.add(c.id);
    if (!c.title?.trim()) errors.push(`${c.id}: 제목이 없다`);
    if (!c.body?.easy?.trim()) errors.push(`${c.id}: easy 문장이 없다 (CT-2)`);
    if (!c.body?.normal?.trim()) errors.push(`${c.id}: normal 문장이 없다 (CT-2)`);
    checkSources(c.id, c.sourceIds);
    checkBanned(c.id, [c.body?.easy, c.body?.normal, c.title]);
    if (c.body?.easy) checkEasy(c.id, c.body.easy);
    for (const r of c.relatedRuleIds ?? []) {
      if (!ruleIds.has(r)) warnings.push(`${c.id}: 기본판에 없는 규칙을 가리킨다 — ${r}`);
    }
  }

  /* 2. 캐릭터 대사 */
  if (GUIDE_RULES.length < 60) warnings.push(`캐릭터 대사가 ${GUIDE_RULES.length}건이다 (60건 이상 권장)`);
  const seenRule = new Set<string>();
  for (const r of GUIDE_RULES) {
    if (seenRule.has(r.id)) errors.push(`대사 id 가 겹친다 — ${r.id}`);
    seenRule.add(r.id);
    if (!r.text?.easy?.trim() || !r.text?.normal?.trim()) errors.push(`${r.id}: easy·normal 문장이 모두 있어야 한다`);
    if (typeof r.cooldown !== 'number') errors.push(`${r.id}: cooldown 이 없다 (CT-8 개정)`);
    if (typeof r.priority !== 'number') errors.push(`${r.id}: priority 가 없다`);
    checkSources(r.id, r.sourceIds);
    checkBanned(r.id, [r.text?.easy, r.text?.normal]);
    if (r.cardId && !cardIds.has(r.cardId)) errors.push(`${r.id}: 없는 카드를 가리킨다 — ${r.cardId} (P3)`);
    if ((r.trigger.on === 'ruleFail' || r.trigger.on === 'rulePass') && !ruleIds.has(r.trigger.ruleId)) {
      errors.push(`${r.id}: 없는 규칙을 가리킨다 — ${r.trigger.ruleId}`);
    }
    const trig = r.trigger;
    if (trig.on === 'blockPlaced' && !BLOCKS.some((b) => b.id === trig.blockKind)) {
      errors.push(`${r.id}: 없는 블록을 가리킨다 — ${trig.blockKind}`);
    }
    const pal = r.highlight?.paletteItem;
    if (pal && !BLOCKS.some((b) => b.id === pal)) errors.push(`${r.id}: 없는 팔레트 항목을 강조한다 — ${pal}`);
    if (r.trigger.on === 'helpRequested' && r.trigger.step && !ALL_STEPS.includes(r.trigger.step)) {
      errors.push(`${r.id}: 없는 단계다 — ${r.trigger.step}`);
    }
    if (r.trigger.on === 'stepEnter' && !ALL_STEPS.includes(r.trigger.step)) errors.push(`${r.id}: 없는 단계다 — ${r.trigger.step}`);
  }
  /* 도움 요청은 모든 단계에서 답이 있어야 한다 */
  for (const step of ALL_STEPS) {
    const has = GUIDE_RULES.some((r) => r.trigger.on === 'helpRequested' && (r.trigger.step === undefined || r.trigger.step === step));
    if (!has) errors.push(`단계 ${step} 에서 "이제 뭘 해야 해?"에 답할 대사가 없다 (FR-9.7 · P3)`);
  }
  for (const r of RULES) {
    if (!GUIDE_RULES.some((g) => g.trigger.on === 'ruleFail' && g.trigger.ruleId === r.id)) {
      warnings.push(`${r.id}: 위반 때 할 캐릭터 대사가 없다`);
    }
  }

  /* 3. 동적 판정 문장 */
  const seenItem = new Set<string>();
  for (const i of REPORT_ITEMS) {
    if (seenItem.has(i.id)) errors.push(`판정 문장 id 가 겹친다 — ${i.id}`);
    seenItem.add(i.id);
    if (!i.headline?.easy?.trim() || !i.headline?.normal?.trim()) errors.push(`${i.id}: easy·normal 문장이 모두 있어야 한다`);
    if (typeof i.weight !== 'number') errors.push(`${i.id}: weight 가 없다`);
    if (i.polarity !== 'good' && i.polarity !== 'fix') errors.push(`${i.id}: polarity 가 이상하다`);
    checkSources(i.id, i.sourceIds);
    checkBanned(i.id, [i.headline?.easy, i.headline?.normal]);
    if (i.cardId && !cardIds.has(i.cardId)) errors.push(`${i.id}: 없는 카드를 가리킨다 — ${i.cardId} (P3)`);
  }
  for (const need of ['dyn.fallback.tried', 'dyn.fallback.first', 'dyn.success']) {
    if (!seenItem.has(need)) errors.push(`판정 문장 ${need} 가 없다 (FR-10.3)`);
  }

  /* 4. 규칙 문장 */
  for (const r of RULES) {
    checkSources(r.id, r.sourceIds);
    const m = RULE_MESSAGES.rules[r.id];
    if (!m) {
      errors.push(`${r.id}: ruleMessages.json 에 문장이 없다`);
      continue;
    }
    if (!m.reportHeadline?.easy?.trim() || !m.reportHeadline?.normal?.trim()) errors.push(`${r.id}: reportHeadline 이 비었다`);
    if (!m.praise?.easy?.trim() || !m.praise?.normal?.trim()) errors.push(`${r.id}: praise 가 비었다`);
    checkBanned(r.id, [m.reportHeadline?.easy, m.reportHeadline?.normal, m.praise?.easy, m.praise?.normal]);
    if (m.whyCardId && !cardIds.has(m.whyCardId)) errors.push(`${r.id}: 없는 카드를 가리킨다 — ${m.whyCardId}`);
    if (r.guardianMissionId && !RULE_MESSAGES.guardianMissions[r.guardianMissionId]) {
      errors.push(`${r.id}: 보호자 미션 문장이 없다 — ${r.guardianMissionId}`);
    }
  }
  for (const id of Object.keys(RULE_MESSAGES.rules)) {
    if (!ruleIds.has(id)) warnings.push(`ruleMessages.json 에 쓰이지 않는 규칙 문장 — ${id}`);
  }

  /* 5. 위험장 프리셋 */
  if (HAZARD_PRESETS.length < 1) errors.push('위험장 프리셋이 하나도 없다');
  for (const p of HAZARD_PRESETS) {
    for (const name of p.specialRules) {
      if (!SPECIAL_RULES[name]) errors.push(`프리셋 ${p.id}: 등록되지 않은 특수 규칙 — ${name}`);
    }
    for (const k of p.scenarioKeys) {
      if (!SCENARIO_KEYS.includes(k)) errors.push(`프리셋 ${p.id}: 이상한 ScenarioKey — ${k}`);
    }
    if (p.scenarioKeys.length === 0) errors.push(`프리셋 ${p.id}: scenarioKeys 가 비었다`);
    if (!(p.secondarySpread > p.primarySpread)) warnings.push(`프리셋 ${p.id}: 부 위험이 주 위험보다 빠르지 않다`);
    if (!p.ignitionWeights || Object.keys(p.ignitionWeights).length === 0) errors.push(`프리셋 ${p.id}: 발원지 가중치가 없다`);
    for (const k of Object.keys(p.ignitionWeights ?? {})) {
      if (!BLOCKS.some((b) => b.id === k)) errors.push(`프리셋 ${p.id}: 없는 블록에 가중치 — ${k}`);
    }
  }

  /* 6. 팔레트 */
  for (const b of BLOCKS) {
    if (!CATEGORIES.includes(b.category)) errors.push(`블록 ${b.id}: 갈래가 이상하다 — ${b.category}`);
    if (!b.easy?.trim()) errors.push(`블록 ${b.id}: 초등용 이름이 없다`);
    if (!b.label?.trim()) errors.push(`블록 ${b.id}: 이름이 없다`);
    if (b.size.w < 1 || b.size.h < 1) errors.push(`블록 ${b.id}: 크기가 이상하다`);
  }
  for (const k of ROOM_KINDS) {
    if (!BLOCKS.some((b) => b.category === 'room' && b.id === k)) errors.push(`팔레트에 방 종류가 빠졌다 — ${k}`);
  }
  for (const k of OPENING_KINDS) {
    if (!BLOCKS.some((b) => b.category === 'opening' && b.id === k)) errors.push(`팔레트에 개구부 종류가 빠졌다 — ${k}`);
  }
  for (const id of PALETTE_BASIC) {
    if (!BLOCKS.some((b) => b.id === id)) errors.push(`기본 팔레트에 없는 블록 — ${id}`);
  }
  if (PALETTE_BASIC.length + 1 !== 8) errors.push(`기본 팔레트는 7종 + 더보기 = 8칸이어야 한다 (FR-7.8), 지금 ${PALETTE_BASIC.length + 1}`);

  /* 7. 시작 평면 */
  if (TEMPLATES.length < 3) errors.push(`시작 평면이 ${TEMPLATES.length}종이다 (3종 이상, FR-1.4)`);
  for (const t of TEMPLATES) {
    errors.push(...validatePlan(t.plan).map((e) => `템플릿 ${t.id}: ${e}`));
    if (!t.label?.trim()) errors.push(`템플릿 ${t.id}: 이름이 없다`);
    if (!t.hint?.trim()) errors.push(`템플릿 ${t.id}: 안내 문구가 없다`);
  }

  return { errors, warnings };
}

/** 평면도 자체가 말이 되는가 — 템플릿과 불러온 파일에 함께 쓴다 */
export function validatePlan(plan: FloorPlan): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const b of plan.blocks) {
    if (ids.has(b.id)) errors.push(`블록 id 가 겹친다 — ${b.id}`);
    ids.add(b.id);
  }

  const rooms = plan.blocks.filter(isRoom);
  for (const r of rooms) {
    if (r.rect.w < 2 || r.rect.h < 2) errors.push(`${r.id}: 방이 2×2 보다 작다`);
    if (r.rect.x < 0 || r.rect.y < 0 || r.rect.x + r.rect.w > plan.grid.width || r.rect.y + r.rect.h > plan.grid.height) {
      errors.push(`${r.id}: 방이 도면 밖으로 나갔다`);
    }
  }
  for (let i = 0; i < rooms.length; i += 1) {
    for (let j = i + 1; j < rooms.length; j += 1) {
      if (rectsOverlap(rooms[i].rect, rooms[j].rect)) errors.push(`${rooms[i].id} 와 ${rooms[j].id} 가 겹친다`);
    }
  }

  const occ = new Map<string, string>();
  for (const r of rooms) for (const c of cellsOf(r.rect)) occ.set(cellKey(c), r.id);

  for (const b of plan.blocks) {
    if (isOpening(b)) {
      const host = occ.get(cellKey(b.cell));
      if (!host) {
        errors.push(`${b.id}: 개구부가 어느 방에도 붙어 있지 않다`);
        continue;
      }
      const across = occ.get(cellKey(step(b.cell, b.side)));
      if (across === host) errors.push(`${b.id}: 개구부가 같은 방 안쪽에 있다`);
    } else if (!isRoom(b)) {
      const p = b as Extract<Block, { cell: unknown }>;
      if (p.cell.x < 0 || p.cell.y < 0 || p.cell.x >= plan.grid.width || p.cell.y >= plan.grid.height) {
        errors.push(`${b.id}: 표시가 도면 밖에 있다`);
      }
    }
  }
  return errors;
}
