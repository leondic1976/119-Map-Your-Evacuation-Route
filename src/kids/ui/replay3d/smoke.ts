'use client';

/**
 * 연기와 불의 반투명 판 — 설계서 v1.2 §8.4.
 *
 * 셀마다 카메라를 향한 판을 세 층(바닥 0.4m·허리 1.2m·천장 2.0m) 놓고 농도를 알파로 준다.
 * 위층이 먼저 짙어지므로 "연기가 위에서부터 내려온다"가 눈에 보인다.
 * 불은 세기에 따라 색이 오르는 판 두 장이다.
 */
import type { GridSpec } from '../../types/plan';

/** 한 줄 = 위치3 · 색3 · 알파1 */
export const SMOKE_STRIDE = 7;

/** 층 높이(칸 단위. 한 칸 = 60cm 이므로 4 = 2.4m) */
const LAYERS = [0.7, 2.0, 3.3];
/** 층마다 다른 농도 배분 — 위가 먼저 짙어진다 */
const LAYER_MIX = [0.35, 0.7, 1];

export interface HazardFrameView {
  primary: Uint8Array;
  secondary: Uint8Array;
  spent: Uint8Array;
}

/**
 * 카메라를 향해 세운 판을 만든다.
 * right·up 은 뷰 행렬에서 뽑은 화면 좌우·위 방향이다 (빌보드).
 */
export function buildHazardQuads(
  grid: GridSpec,
  frame: HazardFrameView,
  right: number[],
  up: number[],
  half = 0.62,
): Float32Array {
  const out: number[] = [];
  const push = (cx: number, cy: number, cz: number, color: number[], alpha: number, size: number): void => {
    const rx = right[0] * size;
    const ry = right[1] * size;
    const rz = right[2] * size;
    const ux = up[0] * size;
    const uy = up[1] * size;
    const uz = up[2] * size;
    const p = [
      [cx - rx - ux, cy - ry - uy, cz - rz - uz],
      [cx + rx - ux, cy + ry - uy, cz + rz - uz],
      [cx + rx + ux, cy + ry + uy, cz + rz + uz],
      [cx - rx + ux, cy - ry + uy, cz - rz + uz],
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      out.push(p[i][0], p[i][1], p[i][2], color[0], color[1], color[2], alpha);
    }
  };

  for (let i = 0; i < frame.secondary.length; i += 1) {
    const x = (i % grid.width) + 0.5;
    const z = Math.floor(i / grid.width) + 0.5;

    const smoke = frame.secondary[i] / 255;
    if (smoke > 0.05) {
      for (let l = 0; l < LAYERS.length; l += 1) {
        const a = Math.min(0.5, smoke * LAYER_MIX[l] * 0.62);
        if (a < 0.02) continue;
        const g = 0.42 - smoke * 0.16;
        push(x, LAYERS[l], z, [g, g + 0.02, g + 0.05], a, half);
      }
    }

    const fire = frame.primary[i] / 255;
    if (fire > 0.06) {
      /* 불은 아래에서 위로 색이 오른다 — 밑동은 밝은 노랑, 위는 붉다 */
      push(x, 0.45, z, [1, 0.86, 0.4], Math.min(0.9, fire), half * 0.9);
      push(x, 1.2 + fire * 0.8, z, [0.95, 0.42, 0.14], Math.min(0.8, fire * 0.9), half * 0.75);
    } else if (frame.spent[i]) {
      push(x, 0.06, z, [0.15, 0.15, 0.15], 0.5, half);
    }
  }
  return new Float32Array(out);
}

/** 그 칸이 얼마나 짙은가 — 자막에 쓴다 */
export function smokeAt(grid: GridSpec, frame: HazardFrameView, x: number, y: number): number {
  const i = y * grid.width + x;
  if (i < 0 || i >= frame.secondary.length) return 0;
  return frame.secondary[i] / 255;
}
