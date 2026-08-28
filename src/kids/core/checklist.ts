/**
 * 필수 물건 점검 — 설계서 v1.2 §1.4.
 *
 * 대피계획에 없으면 안 되는 것이 도면에 있는지만 본다. 없다고 막지 않는다 (D5).
 * 「대피 연습 시작!」을 누를 때 한 번 물어보는 데 쓰고, 팔레트에는 채움 표시로 보인다.
 */
import type { Block, FloorPlan } from '../types/plan';

export interface ChecklistItem {
  /** blocks.json 의 id */
  id: string;
  present: boolean;
}

/** 블록 하나가 어떤 종류인지 — 방·개구부·점 물건을 하나의 문자열로 본다 */
export function kindOf(b: Block): string {
  if (b.kind === 'room') return b.roomKind;
  if (b.kind === 'opening') return b.openingKind;
  return b.subKind;
}

/** 필수 목록을 도면과 맞춰 본다. 순서는 준 그대로 지킨다 */
export function checklist(plan: FloorPlan, requiredIds: string[]): ChecklistItem[] {
  const have = new Set(plan.blocks.map(kindOf));
  return requiredIds.map((id) => ({ id, present: have.has(id) }));
}

export function missingOf(items: ChecklistItem[]): string[] {
  return items.filter((i) => !i.present).map((i) => i.id);
}
