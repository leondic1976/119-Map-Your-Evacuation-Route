/**
 * 지도 글자 자리 — 글자끼리, 표시 그림과 겹치지 않게 조금씩 비켜 놓는다.
 * 계산만 한다. 좌표 단위는 부른 쪽이 정한다.
 */
export interface Rect {
  /** 가운데 */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Label extends Rect {
  id: string;
}

export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;

/** 앞에 있는 글자부터 자리를 잡는다. 비킬 자리가 없으면 처음 자리에 둔다 */
export function arrangeLabels(labels: Label[], obstacles: Rect[] = []): Map<string, { x: number; y: number }> {
  const placed: Rect[] = [...obstacles];
  const out = new Map<string, { x: number; y: number }>();
  for (const label of labels) {
    const { w, h } = label;
    const tries: [number, number][] = [
      [0, 0], [0, h], [0, -h], [0, h * 2], [0, -h * 2],
      [w * 0.7, 0], [-w * 0.7, 0], [w * 0.7, h], [-w * 0.7, h], [w * 0.7, -h], [-w * 0.7, -h],
      [0, h * 3], [0, -h * 3],
    ];
    const pick = tries.map(([dx, dy]) => ({ x: label.x + dx, y: label.y + dy, w, h })).find((r) => !placed.some((o) => rectsOverlap(r, o)));
    const spot = pick ?? { x: label.x, y: label.y, w, h };
    placed.push(spot);
    out.set(label.id, { x: spot.x, y: spot.y });
  }
  return out;
}
