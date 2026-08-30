'use client';

/**
 * 불과 연기 — 설계서 v1.2 §8.4 를 three 위에 다시 얹은 것.
 *
 * 칸마다 판을 세우는 대신 **인스턴스 하나**로 그린다. 큰 집에서 칸이 수백 개라
 * 판을 따로 만들면 그리기 호출이 그만큼 늘어난다.
 *
 * 판은 늘 카메라를 마주 봐야 한다(빌보드). 안 그러면 옆에서 볼 때 종잇장처럼 사라진다.
 * 모든 판이 같은 방향을 보므로 회전값 하나를 전부에 나눠 쓴다.
 *
 * 연기는 위층이 먼저 짙어진다 — "연기가 위에서부터 내려온다"가 눈에 보여야
 * 몸을 낮추라는 말이 와닿는다.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GridSpec } from '../../types/plan';
import { makePuffTexture } from './labels';

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
}

const dummy = new THREE.Object3D();
const tint = new THREE.Color();

export default function Hazard({ grid, frame }: Props) {
  const puff = useMemo(() => makePuffTexture(), []);
  const smokeRef = useRef<THREE.InstancedMesh>(null);
  const fireRef = useRef<THREE.InstancedMesh>(null);
  /** 마지막으로 채운 컷과 카메라 방향 — 둘 다 그대로면 다시 채우지 않는다 */
  const lastRef = useRef<{ frame: HazardFrameView | null; quat: THREE.Quaternion }>({
    frame: null,
    quat: new THREE.Quaternion(0, 0, 0, 0),
  });

  useEffect(() => () => puff.dispose(), [puff]);

  /* 최악의 경우까지 자리를 잡아 둔다 — 도중에 늘리면 다시 만들어야 한다 */
  const maxSmoke = grid.width * grid.height * LAYERS.length;
  const maxFire = grid.width * grid.height * 2;

  useFrame(({ camera }) => {
    const smoke = smokeRef.current;
    const fire = fireRef.current;
    if (!smoke || !fire) return;

    const last = lastRef.current;
    const turned = !last.quat.equals(camera.quaternion);
    if (last.frame === frame && !turned) return;
    last.frame = frame;
    last.quat.copy(camera.quaternion);

    /* 판을 전부 카메라 쪽으로 돌린다 */
    dummy.quaternion.copy(camera.quaternion);

    let s = 0;
    let f = 0;
    for (let i = 0; i < frame.secondary.length; i += 1) {
      const x = (i % grid.width) + 0.5;
      const z = Math.floor(i / grid.width) + 0.5;

      const density = frame.secondary[i] / 255;
      if (density > 0.05) {
        for (let l = 0; l < LAYERS.length; l += 1) {
          const a = Math.min(0.55, density * LAYER_MIX[l] * 0.7);
          if (a < 0.02) continue;
          dummy.position.set(x, LAYERS[l], z);
          dummy.scale.setScalar(1.5 + density * 0.5);
          dummy.updateMatrix();
          smoke.setMatrixAt(s, dummy.matrix);
          const g = 0.5 - density * 0.2;
          smoke.setColorAt(s, tint.setRGB(g, g + 0.02, g + 0.05));
          s += 1;
        }
      }

      const heat = frame.primary[i] / 255;
      if (heat > 0.06) {
        /* 밑동은 밝은 노랑 */
        dummy.position.set(x, 0.5, z);
        dummy.scale.setScalar(1.15);
        dummy.updateMatrix();
        fire.setMatrixAt(f, dummy.matrix);
        fire.setColorAt(f, tint.setRGB(1, 0.82, 0.35).multiplyScalar(Math.min(1.4, heat * 1.5)));
        f += 1;
        /* 그 위로 붉은 혀 */
        dummy.position.set(x, 1.3 + heat * 0.9, z);
        dummy.scale.setScalar(0.95);
        dummy.updateMatrix();
        fire.setMatrixAt(f, dummy.matrix);
        fire.setColorAt(f, tint.setRGB(0.98, 0.4, 0.13).multiplyScalar(Math.min(1.2, heat * 1.3)));
        f += 1;
      }
    }

    smoke.count = s;
    fire.count = f;
    smoke.instanceMatrix.needsUpdate = true;
    fire.instanceMatrix.needsUpdate = true;
    if (smoke.instanceColor) smoke.instanceColor.needsUpdate = true;
    if (fire.instanceColor) fire.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      {/* 연기 — 알파 혼합. 뒤가 비쳐야 길이 보인다 */}
      <instancedMesh ref={smokeRef} args={[undefined, undefined, maxSmoke]} renderOrder={8} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={puff} transparent opacity={0.5} depthWrite={false} vertexColors />
      </instancedMesh>
      {/* 불 — 가산 혼합이라 블룸이 물어 타오른다 */}
      <instancedMesh ref={fireRef} args={[undefined, undefined, maxFire]} renderOrder={9} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={puff} transparent depthWrite={false} blending={THREE.AdditiveBlending} vertexColors />
      </instancedMesh>
    </group>
  );
}

/** 그 칸이 얼마나 짙은가 — 자막에 쓴다 */
export function smokeAt(grid: GridSpec, frame: HazardFrameView, x: number, y: number): number {
  const i = y * grid.width + x;
  if (i < 0 || i >= frame.secondary.length) return 0;
  return frame.secondary[i] / 255;
}
