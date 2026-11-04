/**
 * 지도 확대·축소 — 어느 점을 기준으로 얼마나 크게 볼지 계산한다.
 * 그림 좌표로만 일하고 화면을 모른다. 전체가 보이는 1배보다 작아지지 않고, 지도 밖으로 밀려나지 않는다.
 */
import type { Pt } from './types';

export interface View {
  /** 1 이 전체 보기다 */
  scale: number;
  /** 화면 가운데에 오는 그림 좌표 */
  cx: number;
  cy: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
/** 단추 한 번에 커지는 배율 */
export const ZOOM_STEP = 1.4;

export const fullView = (box: Box): View => ({ scale: 1, cx: box.x + box.w / 2, cy: box.y + box.h / 2 });

/** 범위 안으로 맞춘다 */
export function clampView(view: View, box: Box): View {
  const scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, view.scale));
  const halfW = box.w / scale / 2;
  const halfH = box.h / scale / 2;
  return {
    scale,
    cx: Math.max(box.x + halfW, Math.min(box.x + box.w - halfW, view.cx)),
    cy: Math.max(box.y + halfH, Math.min(box.y + box.h - halfH, view.cy)),
  };
}

export function viewBoxOf(view: View, box: Box): Box {
  const w = box.w / view.scale;
  const h = box.h / view.scale;
  return { x: view.cx - w / 2, y: view.cy - h / 2, w, h };
}

/** 그림 좌표 at 이 화면에서 제자리에 있도록 하고 배율을 바꾼다 */
export function zoomAround(view: View, box: Box, scale: number, at: Pt): View {
  const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scale));
  const keep = view.scale / next;
  return clampView({ scale: next, cx: at.x + (view.cx - at.x) * keep, cy: at.y + (view.cy - at.y) * keep }, box);
}

/** 화면 가운데를 그림 좌표로 dx·dy 만큼 옮긴다 */
export function panBy(view: View, box: Box, dx: number, dy: number): View {
  return clampView({ ...view, cx: view.cx + dx, cy: view.cy + dy }, box);
}
