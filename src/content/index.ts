/**
 * 콘텐츠 적재 — docs/DESIGN-v1.1-changes.md §8.2.
 *
 * 모든 콘텐츠는 JSON 으로 두고 빌드 때 함께 묶는다.
 * file:// 에서도 열려야 하므로 실행 중에 불러오지 않는다 (CON-3).
 */
import type { FloorPlan } from '../types/plan';
import type { HazardPreset } from '../types/hazard';
import type { GuideCard, GuideRule, Source } from '../types/guide';
import type { ReportItemDef } from '../types/report';
import type { RuleMessages } from '../types/rules';

import sourcesJson from './sources.json';
import bannedJson from './bannedPhrases.json';
import ruleMessagesJson from './ruleMessages.json';
import blocksJson from './blocks.json';
import reportItemsJson from './reportItems.json';
import guideRulesJson from './guide/rules.json';
import guideCardsJson from './guide/cards.json';
import fireJson from './hazards/fire.json';
import apt2Json from './templates/apt_2room.json';
import apt3Json from './templates/apt_3room.json';
import apt4Json from './templates/apt_4room.json';
import towerJson from './templates/apt_tower.json';
import houseJson from './templates/house_1f.json';
import villaJson from './templates/villa.json';
import studioJson from './templates/studio.json';
import duplexJson from './templates/duplex.json';

export type BlockCategory = 'room' | 'opening' | 'safety' | 'furniture' | 'hazard' | 'marker';

export interface BlockDef {
  id: string;
  category: BlockCategory;
  /** 도면 모드 이름 */
  label: string;
  /** 초등용 쉬운 이름 */
  easy: string;
  size: { w: number; h: number };
  /** 이용자가 화면에서 줄일 수 있는 가장 작은 크기. 가구에만 둔다. */
  minSize?: { w: number; h: number };
  /** 이용자가 화면에서 늘릴 수 있는 가장 큰 크기. 가구에만 둔다. */
  maxSize?: { w: number; h: number };
  /** 연소하중 0~1 */
  fuel: number;
  tags: string[];
  /** 대피계획에 없으면 안 되는 것 (설계서 v1.2 §1.4) */
  required: boolean;
}

/** 필수 항목 — 시작 전에 빠진 것을 한 번 알려 준다 */
export const REQUIRED_BLOCKS: string[] = (blocksJson as unknown as BlockDef[]).filter((b) => b.required).map((b) => b.id);

export interface TemplateDef {
  id: string;
  label: string;
  /** 쉬움에서 쓰는 이름 — "타워형 아파트" 가 아니라 "방이 빙 둘러싼 아파트" (설계서 v1.3 §2.1) */
  easy: string;
  hint: string;
  plan: FloorPlan;
}

export interface RuleMessagesFile {
  rules: Record<string, RuleMessages>;
  conditions: Record<string, string>;
  guardianMissions: Record<string, { title: string; ask: string }>;
  /** 비켜 갈 길이 없을 때 지적 대신 내보내는 주의 안내 */
  unavoidable: Record<string, string>;
}

export const SOURCES = sourcesJson as Source[];
export const BANNED_PHRASES = bannedJson as string[];
export const RULE_MESSAGES = ruleMessagesJson as unknown as RuleMessagesFile;
export const BLOCKS = blocksJson as unknown as BlockDef[];
export const REPORT_ITEMS = reportItemsJson as unknown as ReportItemDef[];
export const GUIDE_RULES = guideRulesJson as unknown as GuideRule[];
export const GUIDE_CARDS = guideCardsJson as unknown as GuideCard[];

/** 기본판은 화재 하나. 확장판은 여기에 더한다 — 재난 탭은 이 수만큼 생긴다 (FR-2.1 개정) */
export const HAZARD_PRESETS: HazardPreset[] = [fireJson as unknown as HazardPreset];

/** 시작 평면 8종 (설계서 v1.2 §1.2). 흔한 것부터 늘어놓는다 */
export const TEMPLATES = [
  apt2Json as unknown as TemplateDef,
  apt3Json as unknown as TemplateDef,
  apt4Json as unknown as TemplateDef,
  towerJson as unknown as TemplateDef,
  studioJson as unknown as TemplateDef,
  villaJson as unknown as TemplateDef,
  houseJson as unknown as TemplateDef,
  duplexJson as unknown as TemplateDef,
];

/** 팔레트 기본 8종 (FR-7.8). 나머지는 "더보기" */

export function blockDef(id: string): BlockDef | undefined {
  return BLOCKS.find((b) => b.id === id);
}

/** 이용 수준에 맞는 이름 */
export function blockName(id: string, gradeMode: 'easy' | 'normal'): string {
  const d = blockDef(id);
  if (!d) return id;
  return gradeMode === 'easy' ? d.easy : d.label;
}

/** 시작 평면도 같은 방식으로 고른다 (설계서 v1.3 §2.1) */
export function templateName(t: TemplateDef, gradeMode: 'easy' | 'normal'): string {
  return gradeMode === 'easy' ? t.easy : t.label;
}

/** 「잘 모르겠어」를 눌렀을 때 실어 주는 평면 — 가장 흔한 모양 (설계서 v1.3 §2.2) */
export const FALLBACK_TEMPLATE_ID = 'apt_2room';

/** 위험장 엔진에 넘기는 연소하중 조회 */
export function fuelOf(kind: string): number {
  return blockDef(kind)?.fuel ?? 0;
}

export function presetById(id: string): HazardPreset | undefined {
  return HAZARD_PRESETS.find((p) => p.id === id);
}

export function cardById(id: string): GuideCard | undefined {
  return GUIDE_CARDS.find((c) => c.id === id);
}

export function sourceById(id: string): Source | undefined {
  return SOURCES.find((s) => s.id === id);
}

/** 인용한 출처가 모두 1차 대조를 마쳤는가 */
export function isVerified(sourceIds: string[]): boolean {
  return sourceIds.length > 0 && sourceIds.every((id) => sourceById(id)?.verified === true);
}
