/**
 * 도면 확대 단계 — 설계서 v1.19 §2.1 (FR-7.12).
 *
 * 맞춤(1배)에서 시작해 여섯 단계만 오르내린다. 배율은 맞춤 크기에 곱하므로
 * 창을 키우면 같은 배율이라도 도면이 그만큼 커진다.
 * 화면 없이 도는 순수 계산이라 `tools/logic-tests.ts` 가 바로 부른다.
 */
export const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5, 3] as const;
export const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1];

export type ZoomDirection = 'in' | 'out' | 'fit';

/** 지금 배율에서 가장 가까운 단계의 번호 */
export function nearestZoomIndex(zoom: number): number {
  let best = 0;
  for (let i = 1; i < ZOOM_STEPS.length; i += 1) {
    if (Math.abs(ZOOM_STEPS[i] - zoom) < Math.abs(ZOOM_STEPS[best] - zoom)) best = i;
  }
  return best;
}

/** 한 단계 키우거나 줄이거나 맞춤으로 돌아온다. 끝에서는 그대로다 */
export function nextZoom(current: number, direction: ZoomDirection): number {
  if (direction === 'fit') return 1;
  const i = nearestZoomIndex(current);
  const j = Math.max(0, Math.min(ZOOM_STEPS.length - 1, i + (direction === 'in' ? 1 : -1)));
  return ZOOM_STEPS[j];
}

export function zoomPercent(zoom: number): number {
  return Math.round(zoom * 100);
}
