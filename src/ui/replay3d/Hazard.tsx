'use client';

/**
 * 불과 연기 — 설계서 v1.2 §8.4 · v1.19 §4.1.
 *
 * 리플레이 컷(칸마다 불 세기·연기 농도)을 불꽃·연기·불씨 입력으로 바꾼다.
 * 그림은 `Fire.tsx`·`Smoke.tsx` 가 셰이더로 그린다. 여기는 컷이 바뀔 때만 다시 계산한다.
 */
import React, { useMemo } from 'react';
import type { GridSpec } from '../../types/plan';
import { Embers, Flames, type FireCell } from './Fire';
import Smoke, { type SmokeCell } from './Smoke';
import type { QualitySettings } from './quality';

/** 연기 층 높이(칸 단위. 한 칸 60cm 이므로 4 = 2.4m) */
const LAYERS = [0.7, 2.0, 3.3];
/** 층마다 다른 농도 배분 — 위가 먼저 짙어진다 */
const LAYER_MIX = [0.35, 0.7, 1];

export interface HazardFrameView {
  primary: Uint8Array;
  secondary: Uint8Array;
  spent: Uint8Array;
}

interface Props {
  grid: GridSpec;
  frame: HazardFrameView;
  quality: QualitySettings;
  reduced: boolean;
}

function seedOf(i: number): number {
  return ((i * 2654435761) >>> 0) % 1000 / 1000;
}

export default function Hazard({ grid, frame, quality, reduced }: Props) {
  /* 최악의 경우까지 자리를 잡아 둔다 — 도중에 늘리면 다시 만들어야 한다 */
  const maxSmoke = grid.width * grid.height * LAYERS.length;
  const maxFire = grid.width * grid.height * 2;

  const { fire, smoke } = useMemo(() => {
    const fire: FireCell[] = [];
    const smoke: SmokeCell[] = [];
    for (let i = 0; i < frame.secondary.length; i += 1) {
      const x = (i % grid.width) + 0.5;
      const z = Math.floor(i / grid.width) + 0.5;
      const density = frame.secondary[i] / 255;
      if (density > 0.05) {
        for (let l = 0; l < LAYERS.length; l += 1) {
          const a = Math.min(0.55, density * LAYER_MIX[l] * 0.7);
          if (a < 0.02) continue;
          smoke.push({ x, y: LAYERS[l], z, density: a / 0.55, seed: seedOf(i * 3 + l) });
        }
      }
      const heat = frame.primary[i] / 255;
      if (heat > 0.06) fire.push({ x, z, heat: Math.min(1, heat), seed: seedOf(i) });
    }
    return { fire, smoke };
  }, [frame, grid.width]);

  return (
    <group>
      <Smoke cells={smoke} max={maxSmoke} octaves={quality.fireOctaves} reduced={reduced} />
      <Flames cells={fire} max={maxFire} octaves={quality.fireOctaves} reduced={reduced} />
      {quality.embers && <Embers cells={fire} max={maxFire / 2} reduced={reduced} />}
    </group>
  );
}

/** 그 칸이 얼마나 짙은가 — 자막에 쓴다 */
export function smokeAt(grid: GridSpec, frame: HazardFrameView, x: number, y: number): number {
  const i = y * grid.width + x;
  if (i < 0 || i >= frame.secondary.length) return 0;
  return frame.secondary[i] / 255;
}
