'use client';

/**
 * 불 — 설계서 v1.19 §4.1 (v1.2 §8.4 · v1.10 §5.3 보완).
 *
 * 불이 붙은 칸마다 카메라를 마주 보는 판 하나를 세우고(세로축은 그대로),
 * 그 위에 노이즈로 불꽃의 혀를 그린다. 아래는 밝은 노랑, 위로 갈수록 붉고 옅다.
 * 색은 HDR 로 내보내 블룸이 번지게 한다. 모양만 흐르고 **밝기를 깜빡이지 않는다** (작업지침 §10-10).
 * 움직임을 줄이라는 기기에서는 시간이 멈춘다.
 *
 * 불씨는 고급 화질에서만 오른다 — 점 입자가 위로 올라가며 사그라든다.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NOISE_GLSL } from './glsl';

export interface FireCell {
  x: number;
  z: number;
  /** 0..1 */
  heat: number;
  seed: number;
}

interface Props {
  cells: FireCell[];
  /** 자리를 미리 잡아 두는 최대 수 */
  max: number;
  octaves: number;
  reduced: boolean;
}

const dummy = new THREE.Object3D();

const FLAME_VERT = /* glsl */ `
attribute float aHeat;
attribute float aSeed;
varying vec2 vUv;
varying float vHeat;
varying float vSeed;
void main() {
  vUv = uv;
  vHeat = aHeat;
  vSeed = aSeed;
  vec4 c = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float sx = length(vec3(instanceMatrix[0]));
  float sy = length(vec3(instanceMatrix[1]));
  /* 세로축은 세운 채 카메라 쪽으로만 돈다 — 옆에서 봐도 종잇장이 되지 않는다 */
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 world = c.xyz + right * position.x * sx + vec3(0.0, (position.y + 0.5) * sy, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FLAME_FRAG = /* glsl */ `
uniform float uTime;
uniform int uOctaves;
varying vec2 vUv;
varying float vHeat;
varying float vSeed;
${NOISE_GLSL}
void main() {
  vec2 p = vec2((vUv.x - 0.5) * 2.0, vUv.y);
  float t = uTime * 1.25 + vSeed * 7.0;
  float n = fbm(vec2(p.x * 2.2 + vSeed * 3.0, p.y * 3.0 - t), uOctaves);
  float n2 = fbm(vec2(p.x * 4.0 - vSeed * 5.0, p.y * 5.5 - t * 1.6), uOctaves);
  /* 아래는 넓고 위로 갈수록 좁아지는 혀. 가장자리는 노이즈로 흔들린다 */
  float width = mix(0.95, 0.1, p.y) + (n - 0.5) * 0.6 * p.y;
  float x = abs(p.x) + (n2 - 0.5) * 0.35 * p.y;
  float edge = 1.0 - smoothstep(width * 0.42, width, x);
  float body = edge * (1.0 - smoothstep(0.55, 1.0, p.y + (n - 0.5) * 0.45));
  body *= smoothstep(0.0, 0.1, p.y);
  float core = body * (1.0 - p.y) * (1.0 - smoothstep(0.0, 0.5, abs(p.x)));
  vec3 col = mix(vec3(1.0, 0.22, 0.03), vec3(1.0, 0.6, 0.12), core);
  col = mix(col, vec3(1.0, 0.94, 0.62), core * core * 1.5);
  float a = body * (0.55 + 0.45 * vHeat);
  gl_FragColor = vec4(col * (1.35 + core * 1.8), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function Flames({ cells, max, octaves, reduced }: Props) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const heat = useMemo(() => new Float32Array(max), [max]);
  const seed = useMemo(() => new Float32Array(max), [max]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: FLAME_VERT,
        fragmentShader: FLAME_FRAG,
        uniforms: { uTime: { value: 0 }, uOctaves: { value: octaves } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    material.uniforms.uOctaves.value = octaves;
  }, [material, octaves]);
  useEffect(() => () => material.dispose(), [material]);

  /* 컷이 바뀔 때만 다시 채운다 — 매 프레임 돌 일이 아니다 */
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    let i = 0;
    for (const c of cells) {
      if (i >= max) break;
      /* 불꽃 두 겹 — 큰 혀와 그 앞의 작은 혀가 어긋나 깊이가 생긴다 */
      dummy.position.set(c.x, 0.02, c.z);
      dummy.scale.set(1.05 + c.heat * 0.35, 1.5 + c.heat * 0.9, 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      heat[i] = c.heat;
      seed[i] = c.seed;
      i += 1;
      if (i >= max) break;
      dummy.position.set(c.x + 0.14, 0.02, c.z - 0.1);
      dummy.scale.set(0.7 + c.heat * 0.2, 1.0 + c.heat * 0.6, 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      heat[i] = c.heat * 0.9;
      seed[i] = c.seed + 0.37;
      i += 1;
    }
    m.count = i;
    m.instanceMatrix.needsUpdate = true;
    const g = m.geometry;
    const heatAttr = g.getAttribute('aHeat');
    const seedAttr = g.getAttribute('aSeed');
    if (heatAttr) heatAttr.needsUpdate = true;
    if (seedAttr) seedAttr.needsUpdate = true;
  }, [cells, max, heat, seed]);

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = reduced ? 0 : clock.elapsedTime;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, material, max]} frustumCulled={false} renderOrder={9}>
      <planeGeometry args={[1, 1]}>
        <instancedBufferAttribute attach="attributes-aHeat" args={[heat, 1]} />
        <instancedBufferAttribute attach="attributes-aSeed" args={[seed, 1]} />
      </planeGeometry>
    </instancedMesh>
  );
}

const EMBER_VERT = /* glsl */ `
attribute vec3 aOrigin;
attribute float aSeed;
uniform float uTime;
uniform float uPixelRatio;
varying float vLife;
void main() {
  float life = fract(uTime * (0.3 + aSeed * 0.25) + aSeed * 13.1);
  vLife = life;
  float wob = uTime + aSeed * 9.0;
  vec3 p = aOrigin + vec3(sin(wob * 2.1) * 0.22 * life + (aSeed - 0.5) * 0.3, 0.5 + life * 2.4, cos(wob * 1.7) * 0.22 * life);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = (3.0 + aSeed * 3.0) * uPixelRatio * (9.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const EMBER_FRAG = /* glsl */ `
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.35, 1.0, d)) * (1.0 - vLife) * 0.9;
  gl_FragColor = vec4(vec3(1.0, 0.55, 0.18) * 2.4, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const EMBERS_PER_CELL = 7;

/** 불씨 — 불이 붙은 칸에서 점 입자가 위로 오른다. 고급 화질만 */
export function Embers({ cells, max, reduced }: Omit<Props, 'octaves'>) {
  const points = useRef<THREE.Points>(null);
  const capacity = Math.min(600, max * EMBERS_PER_CELL);
  const origin = useMemo(() => new Float32Array(capacity * 3), [capacity]);
  const seed = useMemo(() => {
    const s = new Float32Array(capacity);
    for (let i = 0; i < capacity; i += 1) s[i] = ((i * 7919) % 1000) / 1000;
    return s;
  }, [capacity]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: EMBER_VERT,
        fragmentShader: EMBER_FRAG,
        uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  useLayoutEffect(() => {
    const p = points.current;
    if (!p) return;
    let i = 0;
    for (const c of cells) {
      for (let k = 0; k < EMBERS_PER_CELL && i < capacity; k += 1) {
        origin[i * 3] = c.x;
        origin[i * 3 + 1] = 0.1;
        origin[i * 3 + 2] = c.z;
        i += 1;
      }
    }
    p.geometry.setDrawRange(0, i);
    const attr = p.geometry.getAttribute('aOrigin');
    if (attr) attr.needsUpdate = true;
  }, [cells, capacity, origin]);

  useFrame(({ clock, gl }) => {
    material.uniforms.uTime.value = reduced ? 0 : clock.elapsedTime;
    material.uniforms.uPixelRatio.value = gl.getPixelRatio();
  });

  return (
    <points ref={points} material={material} frustumCulled={false} renderOrder={10}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[origin, 3]} />
        <bufferAttribute attach="attributes-aOrigin" args={[origin, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[seed, 1]} />
      </bufferGeometry>
    </points>
  );
}
