/**
 * 위험장 엔진 — 칸 그래프 위로 값이 번지는 계산만 한다.
 * 어떤 재난인지 모른다. 수치와 이름은 콘텐츠에서 들어온다.
 */

export interface FieldParams {
  /** 근원 칸이 한 차례에 오르는 값 */
  growth: number;
  /** 열린 연결로 건너가는 값 */
  spreadOpen: number;
  /** 닫힌 연결로 건너가는 값 */
  spreadClosed: number;
  /** 이 값이 넘은 칸부터 이웃으로 번진다 */
  spreadFrom: number;
  /** 값의 끝 */
  max: number;
}

export interface FieldEdge {
  a: string;
  b: string;
  closed: boolean;
}

export type Field = Record<string, number>;

/** 한 차례 번진다. 동시에 번지도록 이전 값으로 계산한다 */
export function stepField(field: Field, edges: FieldEdge[], sources: string[], p: FieldParams): Field {
  const next: Field = { ...field };
  for (const s of sources) next[s] = Math.min(p.max, (next[s] ?? 0) + p.growth);
  for (const e of edges) {
    const rate = e.closed ? p.spreadClosed : p.spreadOpen;
    const va = field[e.a] ?? 0;
    const vb = field[e.b] ?? 0;
    if (va >= p.spreadFrom) next[e.b] = Math.min(p.max, (next[e.b] ?? 0) + rate);
    if (vb >= p.spreadFrom) next[e.a] = Math.min(p.max, (next[e.a] ?? 0) + rate);
  }
  return next;
}
