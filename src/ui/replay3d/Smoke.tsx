'use client';

/**
 * 연기 — 설계서 v1.19 §4.1 (v1.2 §8.4 보완).
 *
 * 칸마다 세 층(아래·가운데·위)의 판을 띄우고 노이즈로 소용돌이를 그린다.
 * **위층이 먼저 짙어진다** — "연기가 위에서부터 내려온다"가 눈에 보여야 몸을 낮추라는 말이 와닿는다.
 * 판은 늘 카메라를 마주 보고, 아주 천천히 흐른다. 밝기를 깜빡이지 않는다.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NOISE_GLSL } from './glsl';

export interface SmokeCell {
  x: number;
  y: number;
  z: number;
  /** 0..1 — 그 층의 짙기 */
  density: number;
  seed: number;
}

interface Props {
  cells: SmokeCell[];
  max: number;
  octaves: number;
  reduced: boolean;
}

const dummy = new THREE.Object3D();

const SMOKE_VERT = /* glsl */ `
attribute float aDensity;
attribute float aSeed;
varying vec2 vUv;
varying float vDensity;
varying float vSeed;
void main() {
  vUv = uv;
  vDensity = aDensity;
  vSeed = aSeed;
  vec4 c = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float s = length(vec3(instanceMatrix[0]));
  /* 판마다 조금씩 다른 각도로 돌려 같은 무늬가 줄지어 보이지 않게 한다 */
  float ang = aSeed * 6.2831;
  vec2 r = vec2(cos(ang) * position.x - sin(ang) * position.y, sin(ang) * position.x + cos(ang) * position.y);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 world = c.xyz + right * r.x * s + up * r.y * s;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const SMOKE_FRAG = /* glsl */ `
uniform float uTime;
uniform int uOctaves;
varying vec2 vUv;
varying float vDensity;
varying float vSeed;
${NOISE_GLSL}
void main() {
  float r = length(vUv - 0.5) * 2.0;
  vec2 drift = vec2(uTime * 0.03, uTime * 0.05) + vSeed * 11.0;
  float n = fbm(vUv * 3.0 + drift, uOctaves);
  float n2 = fbm(vUv * 6.5 - drift * 1.3 + vSeed, uOctaves);
  float shape = 1.0 - smoothstep(0.3, 1.0, r + (n - 0.5) * 0.75);
  float a = shape * (0.3 + 0.6 * vDensity) * (0.55 + 0.45 * n2);
  vec3 light = vec3(0.64, 0.65, 0.68);
  vec3 dark = vec3(0.14, 0.15, 0.17);
  vec3 col = mix(light, dark, clamp(vDensity * 0.8 + n2 * 0.25, 0.0, 1.0));
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export default function Smoke({ cells, max, octaves, reduced }: Props) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const density = useMemo(() => new Float32Array(max), [max]);
  const seed = useMemo(() => new Float32Array(max), [max]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SMOKE_VERT,
        fragmentShader: SMOKE_FRAG,
        uniforms: { uTime: { value: 0 }, uOctaves: { value: octaves } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    material.uniforms.uOctaves.value = octaves;
  }, [material, octaves]);
  useEffect(() => () => material.dispose(), [material]);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    let i = 0;
    for (const c of cells) {
      if (i >= max) break;
      dummy.position.set(c.x, c.y, c.z);
      dummy.scale.setScalar(1.6 + c.density * 0.7);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      density[i] = c.density;
      seed[i] = c.seed;
      i += 1;
    }
    m.count = i;
    m.instanceMatrix.needsUpdate = true;
    const d = m.geometry.getAttribute('aDensity');
    const s = m.geometry.getAttribute('aSeed');
    if (d) d.needsUpdate = true;
    if (s) s.needsUpdate = true;
  }, [cells, max, density, seed]);

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = reduced ? 0 : clock.elapsedTime;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, material, max]} frustumCulled={false} renderOrder={8}>
      <planeGeometry args={[1, 1]}>
        <instancedBufferAttribute attach="attributes-aDensity" args={[density, 1]} />
        <instancedBufferAttribute attach="attributes-aSeed" args={[seed, 1]} />
      </planeGeometry>
    </instancedMesh>
  );
}
