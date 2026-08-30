'use client';

/**
 * 집 밖 — 설계서 v1.4 §2.5 · FR-11.9.
 *
 * 검은 빈 공간에 집만 떠 있으면 어디인지 알 수 없다. 잔디와 보도를 깔고 나무를 몇 그루 세운다.
 * 전부 코드로 만든 단순한 형태다 — 모델 파일을 두지 않는다 (FR-11.2 유지).
 * 저화질 단에서는 나무를 세우지 않는다 (§1.3).
 */
import React, { useMemo } from 'react';
import * as THREE from 'three';

interface Props {
  /** 도면이 차지하는 칸 범위 */
  extent: { minX: number; minZ: number; maxX: number; maxZ: number };
  /** 나무를 세울지 */
  scenery: boolean;
}

/** 씨앗을 고정한 난수 — 볼 때마다 나무가 옮겨 다니면 산만하다 */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function Tree({ at, scale }: { at: [number, number, number]; scale: number }) {
  return (
    <group position={at} scale={scale}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.2, 1.8, 6]} />
        <meshStandardMaterial color="#7a5a3a" />
      </mesh>
      <mesh position={[0, 2.5, 0]} castShadow>
        <icosahedronGeometry args={[1.25, 0]} />
        <meshStandardMaterial color="#3f8f52" flatShading />
      </mesh>
      <mesh position={[0.5, 1.9, 0.3]} castShadow>
        <icosahedronGeometry args={[0.8, 0]} />
        <meshStandardMaterial color="#4e9e5e" flatShading />
      </mesh>
    </group>
  );
}

export default function Outside({ extent, scenery }: Props) {
  const w = extent.maxX - extent.minX;
  const d = extent.maxZ - extent.minZ;
  const cx = (extent.minX + extent.maxX) / 2;
  const cz = (extent.minZ + extent.maxZ) / 2;
  /* 집을 넉넉히 둘러쌀 만큼 */
  const groundW = w + 28;
  const groundD = d + 28;

  const trees = useMemo(() => {
    if (!scenery) return [];
    const rnd = seeded(1234);
    const out: { at: [number, number, number]; scale: number }[] = [];
    for (let i = 0; i < 14; i += 1) {
      /* 집 둘레 띠 안에만 — 집 위에 나무가 서면 안 된다 */
      const side = Math.floor(rnd() * 4);
      const along = rnd();
      const away = 3.5 + rnd() * 8;
      let x = 0;
      let z = 0;
      if (side === 0) {
        x = extent.minX + along * w;
        z = extent.minZ - away;
      } else if (side === 1) {
        x = extent.minX + along * w;
        z = extent.maxZ + away;
      } else if (side === 2) {
        x = extent.minX - away;
        z = extent.minZ + along * d;
      } else {
        x = extent.maxX + away;
        z = extent.minZ + along * d;
      }
      out.push({ at: [x, 0, z], scale: 0.75 + rnd() * 0.6 });
    }
    return out;
  }, [extent, scenery, w, d]);

  return (
    <group>
      {/* 잔디 */}
      <mesh position={[cx, -0.02, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[groundW, groundD]} />
        <meshStandardMaterial color="#6f9f5c" />
      </mesh>
      {/* 집 둘레의 보도 — 집이 땅에 놓인 느낌을 준다 */}
      <mesh position={[cx, -0.01, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w + 3.2, d + 3.2]} />
        <meshStandardMaterial color="#c9c6bd" />
      </mesh>
      {trees.map((t, i) => (
        <Tree key={i} at={t.at} scale={t.scale} />
      ))}
    </group>
  );
}

/** 하늘 — 위는 파랗고 아래는 옅다. 큰 구 안쪽에 칠한다 */
export function Sky() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color('#7fb4dd') },
          bottom: { value: new THREE.Color('#e8eef2') },
        },
        vertexShader: `
          varying float vY;
          void main() {
            vY = normalize(position).y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 top;
          uniform vec3 bottom;
          varying float vY;
          void main() {
            gl_FragColor = vec4(mix(bottom, top, clamp(vY * 0.5 + 0.5, 0.0, 1.0)), 1.0);
          }
        `,
      }),
    [],
  );
  return (
    <mesh material={mat} renderOrder={-1}>
      <sphereGeometry args={[140, 16, 12]} />
    </mesh>
  );
}
