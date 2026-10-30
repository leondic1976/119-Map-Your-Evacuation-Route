'use client';

/**
 * 후처리 — 설계서 v1.4 §2.2 · v1.19 §4.1.
 *
 *   MSAA        모서리 계단을 없앤다 (고급·높음)
 *   N8AO        벽과 바닥이 만나는 구석에 접촉 그늘 — 포근한 느낌이 여기서 난다
 *   블룸        빛나는 길·불꽃·천장등이 번진다
 *   피사계 심도  집 전체 시점에서 위아래를 흐려 미니어처처럼 보인다 (고급만)
 *   비네트      가장자리를 살짝 어둡게 해 가운데로 눈이 모인다
 *
 * 가벼움 화질은 아무것도 걸지 않는다 — 기능은 같고 그림 비용만 없다 (FR-11.10).
 */
import React from 'react';
import { Bloom, EffectComposer, N8AO, TiltShift2, Vignette } from '@react-three/postprocessing';
import type { QualitySettings } from './quality';
import type { ViewMode } from './Scene';

interface Props {
  quality: QualitySettings;
  view: ViewMode;
}

export default function Effects({ quality, view }: Props) {
  if (!quality.postprocessing) return null;
  const effects = [
    <N8AO key="ao" intensity={quality.aoIntensity} aoRadius={1.6} distanceFalloff={1} quality={quality.detail === 'full' ? 'medium' : 'low'} />,
    /* 문턱을 1.5 로 — 햇빛 받은 흰 벽(1 안팎)이 번지면 화면이 통째로 하얗게 탄다. 불꽃·빛나는 길처럼 1.5 를 넘는 것만 번진다 */
    <Bloom key="bloom" intensity={quality.bloomIntensity} luminanceThreshold={1.5} luminanceSmoothing={0.35} mipmapBlur />,
  ];
  if (quality.dof && view === 'dollhouse') {
    /* 초점선은 화면 가운데를 가로지르는 수평선이다 — 위아래 가장자리로 갈수록 흐려져 미니어처처럼 보인다 */
    effects.push(<TiltShift2 key="tilt" blur={0.12} taper={0.6} start={[0, 0.5]} end={[1, 0.5]} samples={8} />);
  }
  effects.push(<Vignette key="vignette" offset={0.3} darkness={0.42} eskil={false} />);
  return (
    <EffectComposer enableNormalPass multisampling={quality.msaa}>
      {effects}
    </EffectComposer>
  );
}
