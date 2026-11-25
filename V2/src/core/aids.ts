/**
 * 현관으로 못 나갈 때 쓰는 곳(대장 #188) — 지도에 그려 둔 것을 찾는다.
 * 대피공간과 피난 전실은 칸 이름이고, 경량칸막이와 아래층 문(하향식 피난구)은 놓는 것이다.
 */
import type { Layout, Plan } from './types';

export type AidId = 'refuge' | 'partition' | 'hatch' | 'vestibule';

export const AID_ORDER: AidId[] = ['refuge', 'partition', 'hatch', 'vestibule'];

export function escapeAids(plan: Plan, layout: Layout): AidId[] {
  const has: Record<AidId, boolean> = {
    refuge: layout.cells.some((c) => c.name === 'refuge'),
    vestibule: layout.cells.some((c) => c.name === 'vestibule'),
    partition: (plan.items ?? []).some((i) => i.kind === 'partition'),
    hatch: (plan.items ?? []).some((i) => i.kind === 'hatch'),
  };
  return AID_ORDER.filter((id) => has[id]);
}
