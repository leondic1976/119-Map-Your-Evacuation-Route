'use client';

/**
 * 집 밖 풍경 — 설계서 v1.4 §2.5 · v1.10 §5.2 · v1.19 §4.2.
 *
 * 잔디·보도·도로·진입로·나무·관목·울타리·가로등·이웃집을 전부 코드로 만든다.
 * 배치는 같은 seed 라 늘 같은 동네다. 저화질은 나무를 빼고 색만 깐다.
 */
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { QualitySettings } from './quality';
import { repeatSurface, type Surface, type Surfaces } from './textures';

interface Props {
  extent: { minX: number; minZ: number; maxX: number; maxZ: number };
  scenery: boolean;
  detail: QualitySettings['detail'];
  surfaces: Surfaces | null;
  shadows: boolean;
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/* 3D 값 노이즈 — 잎 뭉치를 울퉁불퉁하게 만든다. 같은 자리는 같은 값이라 겹친 정점이 갈라지지 않는다 */
function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const s = (t: number) => t * t * (3 - 2 * t);
  const fx = s(x - xi);
  const fy = s(y - yi);
  const fz = s(z - zi);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c00 = lerp(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), fx);
  const c10 = lerp(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), fx);
  const c01 = lerp(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), fx);
  const c11 = lerp(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), fx);
  return lerp(lerp(c00, c10, fy), lerp(c01, c11, fy), fz);
}

/** 잎 뭉치 — 구를 노이즈로 밀고 당기고, 정점마다 잎 색을 섞는다 */
function canopyGeometry(detail: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const dark = new THREE.Color('#2f6a3f');
  const light = new THREE.Color('#79b24e');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = noise3(x * 2.3 + seed, y * 2.3 + seed * 3, z * 2.3 + seed * 7);
    const n2 = noise3(x * 5 + seed * 11, y * 5, z * 5);
    const d = 0.82 + n * 0.36 + (n2 - 0.5) * 0.12;
    pos.setXYZ(i, x * d, y * d * 0.92, z * d);
    tmp.copy(dark).lerp(light, Math.min(1, Math.max(0, (y + 1) * 0.35 + n2 * 0.5)));
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function Tree({ at, scale, canopy, full }: { at: [number, number, number]; scale: number; canopy: THREE.BufferGeometry; full: boolean }) {
  const lean = ((at[0] * 7 + at[2] * 3) % 10) / 100;
  return (
    <group position={at} scale={scale} rotation={[0, (at[0] + at[2]) % 6, 0]}>
      <mesh position={[0, 1.05, 0]} rotation={[lean, 0, -lean]} castShadow receiveShadow>
        <cylinderGeometry args={[0.12, 0.24, 2.1, full ? 10 : 6]} />
        <meshStandardMaterial color="#5b4130" roughness={0.96} />
      </mesh>
      <mesh geometry={canopy} position={[0, 2.55, 0]} scale={1.2} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.94} />
      </mesh>
      <mesh geometry={canopy} position={[0.62, 2.1, 0.3]} scale={0.78} rotation={[0.4, 1.1, 0.2]} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.94} />
      </mesh>
      {full && (
        <mesh geometry={canopy} position={[-0.55, 2.25, -0.38]} scale={0.72} rotation={[-0.3, 2.3, 0.5]} castShadow receiveShadow>
          <meshStandardMaterial vertexColors roughness={0.94} />
        </mesh>
      )}
    </group>
  );
}

function Bush({ at, scale = 1, canopy }: { at: [number, number, number]; scale?: number; canopy: THREE.BufferGeometry }) {
  return (
    <group position={at} scale={scale}>
      <mesh geometry={canopy} position={[-0.3, 0.38, 0]} scale={[0.52, 0.42, 0.5]} rotation={[0, 1.3, 0]} castShadow><meshStandardMaterial vertexColors roughness={1} /></mesh>
      <mesh geometry={canopy} position={[0.3, 0.42, 0.04]} scale={[0.58, 0.46, 0.55]} rotation={[0, 0.4, 0]} castShadow><meshStandardMaterial vertexColors roughness={1} /></mesh>
    </group>
  );
}

function StreetLight({ at }: { at: [number, number, number] }) {
  return (
    <group position={at}>
      <mesh position={[0, 1.8, 0]} castShadow><cylinderGeometry args={[0.055, 0.09, 3.6, 10]} /><meshStandardMaterial color="#343a40" metalness={0.72} roughness={0.38} /></mesh>
      <mesh position={[0, 3.52, 0]} castShadow><cylinderGeometry args={[0.26, 0.16, 0.18, 14]} /><meshStandardMaterial color="#23282d" metalness={0.7} roughness={0.35} /></mesh>
      <mesh position={[0, 3.4, 0]}><sphereGeometry args={[0.13, 12, 8]} /><meshStandardMaterial color="#fff2c7" emissive="#ffd27a" emissiveIntensity={1.1} /></mesh>
    </group>
  );
}

/** 낮은 울타리 — 뒷마당 경계. 널 하나하나가 인스턴스다 */
function Fence({ from, to, z }: { from: number; to: number; z: number }) {
  const count = Math.max(2, Math.floor((to - from) / 0.42));
  const ref = React.useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i += 1) {
      dummy.position.set(from + 0.21 + i * 0.42, 0.55, z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [count, from, z]);
  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow receiveShadow>
        <boxGeometry args={[0.16, 1.1, 0.05]} />
        <meshStandardMaterial color="#d9d2c3" roughness={0.85} />
      </instancedMesh>
      {[0.35, 0.85].map((y) => (
        <mesh key={y} position={[(from + to) / 2, y, z - 0.04]} castShadow>
          <boxGeometry args={[to - from, 0.08, 0.04]} />
          <meshStandardMaterial color="#cbc3b2" roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function NeighborHouse({ at, color, turned = false, roof }: { at: [number, number, number]; color: string; turned?: boolean; roof: Surface | null }) {
  return (
    <group position={at} rotation={[0, turned ? Math.PI / 2 : 0, 0]}>
      <mesh position={[0, 1.45, 0]} castShadow receiveShadow><boxGeometry args={[4.8, 2.9, 3.8]} /><meshStandardMaterial color={color} roughness={0.9} /></mesh>
      {/* 박공지붕 — 두 장의 경사판과 삼각 박공 */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, 3.55, side * 1.05]} rotation={[side * -0.62, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[5.2, 0.12, 2.5]} />
          {roof ? (
            <meshStandardMaterial map={roof.map} normalMap={roof.normalMap} roughnessMap={roof.roughnessMap} roughness={1} />
          ) : (
            <meshStandardMaterial color="#5f493c" roughness={0.88} />
          )}
        </mesh>
      ))}
      <mesh position={[0, 3.3, 0]} castShadow>
        <cylinderGeometry args={[0, 2.1, 1.35, 4, 1]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[1.4, 3.9, -0.6]} castShadow><boxGeometry args={[0.5, 1.1, 0.5]} /><meshStandardMaterial color="#8c6b5b" roughness={0.9} /></mesh>
      {[-1.35, 0, 1.35].map((x) => (
        <group key={x} position={[x, 1.65, 1.92]}>
          <mesh><boxGeometry args={[0.84, 1, 0.04]} /><meshStandardMaterial color="#f1ede4" roughness={0.6} /></mesh>
          <mesh position={[0, 0, 0.03]}><boxGeometry args={[0.68, 0.84, 0.03]} /><meshPhysicalMaterial color="#a9d2e6" roughness={0.08} metalness={0} clearcoat={1} envMapIntensity={1.2} /></mesh>
        </group>
      ))}
      <mesh position={[0, 0.85, 1.97]}><boxGeometry args={[0.78, 1.7, 0.08]} /><meshStandardMaterial color="#65462f" roughness={0.74} /></mesh>
    </group>
  );
}

/** 바닥 한 장 — 재질이 있으면 되풀이 수를 칸 수에 맞춘다 */
function Ground({
  at,
  width,
  depth,
  surface,
  color,
  period,
  shadows,
  roughness = 0.95,
}: {
  at: [number, number, number];
  width: number;
  depth: number;
  surface: Surface | null;
  color: string;
  /** 한 무늬가 몇 칸인지 */
  period: number;
  shadows: boolean;
  roughness?: number;
}) {
  useEffect(() => {
    if (surface) repeatSurface(surface, width / period, depth / period);
  }, [surface, width, depth, period]);
  return (
    <mesh position={at} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadows}>
      <planeGeometry args={[width, depth]} />
      {surface ? (
        <meshStandardMaterial map={surface.map} normalMap={surface.normalMap} normalScale={[0.8, 0.8]} roughnessMap={surface.roughnessMap} roughness={1} envMapIntensity={0.4} />
      ) : (
        <meshStandardMaterial color={color} roughness={roughness} />
      )}
    </mesh>
  );
}

export default function Outside({ extent, scenery, detail, surfaces, shadows }: Props) {
  const w = extent.maxX - extent.minX;
  const d = extent.maxZ - extent.minZ;
  const cx = (extent.minX + extent.maxX) / 2;
  const cz = (extent.minZ + extent.maxZ) / 2;
  const groundW = w + 34;
  const groundD = d + 34;
  const roadZ = extent.maxZ + 8.2;
  const full = detail === 'full';

  const canopy = useMemo(() => canopyGeometry(full ? 2 : 1, 3), [full]);
  const bushCanopy = useMemo(() => canopyGeometry(1, 11), []);
  useEffect(() => () => canopy.dispose(), [canopy]);
  useEffect(() => () => bushCanopy.dispose(), [bushCanopy]);

  const trees = useMemo(() => {
    if (!scenery) return [];
    const rnd = seeded(1192026);
    const count = full ? 18 : 11;
    const out: { at: [number, number, number]; scale: number }[] = [];
    for (let i = 0; i < count; i += 1) {
      const side = Math.floor(rnd() * 3);
      const along = rnd();
      const away = 4.3 + rnd() * 7.5;
      let x: number;
      let z: number;
      if (side === 0) { x = extent.minX + along * w; z = extent.minZ - away; }
      else if (side === 1) { x = extent.minX - away; z = extent.minZ + along * d; }
      else { x = extent.maxX + away; z = extent.minZ + along * d; }
      out.push({ at: [x, 0, z], scale: 0.72 + rnd() * 0.58 });
    }
    return out;
  }, [d, extent, full, scenery, w]);

  const bushes = useMemo(() => {
    if (!scenery || !full) return [];
    const out: [number, number, number][] = [];
    for (let i = 0; i < 8; i += 1) {
      const x = extent.minX + 1.1 + (i * Math.max(1, w - 2.2)) / 7;
      out.push([x, 0, extent.minZ - 1.25]);
    }
    return out;
  }, [extent, full, scenery, w]);

  return (
    <group key={surfaces ? surfaces.id : 'plain'}>
      {/* 잔디 */}
      <Ground at={[cx, -0.065, cz]} width={groundW} depth={groundD} surface={surfaces?.grass ?? null} color="#4f7d35" period={6} shadows={shadows} />
      {/* 집 둘레 보도 블록 */}
      <Ground at={[cx, -0.035, cz]} width={w + 3.2} depth={d + 3.2} surface={surfaces?.pavers ?? null} color="#c5c2b9" period={2} shadows={shadows} />
      {/* 도로 */}
      <Ground at={[cx, -0.025, roadZ]} width={groundW} depth={7} surface={surfaces?.asphalt ?? null} color="#41474b" period={6} shadows={shadows} roughness={0.91} />
      {/* 길가 보도 */}
      <Ground at={[cx, -0.012, extent.maxZ + 3.8]} width={groundW} depth={1.4} surface={surfaces?.pavers ?? null} color="#bab8b1" period={2} shadows={shadows} />
      {/* 현관 앞 진입로 */}
      <mesh position={[cx, -0.004, extent.maxZ + 2.15]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadows}>
        <planeGeometry args={[1.8, 3.1]} />
        <meshStandardMaterial color="#d5d0c5" roughness={0.9} />
      </mesh>
      {/* 연석 */}
      <mesh position={[cx, 0.05, roadZ - 3.55]} receiveShadow={shadows}>
        <boxGeometry args={[groundW, 0.12, 0.3]} />
        <meshStandardMaterial color="#b9b5ab" roughness={0.9} />
      </mesh>
      {scenery && Array.from({ length: 10 }, (_, i) => (
        <mesh key={`road-line-${i}`} position={[cx - groundW / 2 + 3 + i * 4.5, -0.005, roadZ]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.4, 0.12]} /><meshStandardMaterial color="#f4e9ba" roughness={0.7} />
        </mesh>
      ))}
      {trees.map((tree, i) => <Tree key={`tree-${i}`} at={tree.at} scale={tree.scale} canopy={canopy} full={full} />)}
      {bushes.map((at, i) => <Bush key={`bush-${i}`} at={at} scale={0.82 + (i % 3) * 0.08} canopy={bushCanopy} />)}
      {scenery && full && (
        <>
          <Fence from={extent.minX - 2.4} to={extent.maxX + 2.4} z={extent.minZ - 2.6} />
          <NeighborHouse at={[extent.minX - 8.5, 0, extent.minZ + 1.5]} color="#c9b08b" turned roof={surfaces?.roof ?? null} />
          <NeighborHouse at={[extent.maxX + 8.5, 0, extent.minZ + 3.8]} color="#b7c5ca" turned roof={surfaces?.roof ?? null} />
          <NeighborHouse at={[extent.minX + 2.8, 0, extent.minZ - 10]} color="#d0b6aa" roof={surfaces?.roof ?? null} />
          <StreetLight at={[extent.minX - 3.3, 0, extent.maxZ + 4.1]} />
          <StreetLight at={[extent.maxX + 3.3, 0, extent.maxZ + 4.1]} />
        </>
      )}
    </group>
  );
}
