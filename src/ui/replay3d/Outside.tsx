'use client';

/** 절차형 주택가 풍경 — 외부 파일 없이 잔디·보도·도로·수목·가로등을 만든다. */
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { QualitySettings } from './quality';

interface Props {
  extent: { minX: number; minZ: number; maxX: number; maxZ: number };
  scenery: boolean;
  detail: QualitySettings['detail'];
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function Tree({ at, scale, full }: { at: [number, number, number]; scale: number; full: boolean }) {
  return (
    <group position={at} scale={scale}>
      <mesh position={[0, 0.95, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.13, 0.22, 1.9, full ? 12 : 7]} />
        <meshStandardMaterial color="#6b4931" roughness={0.94} />
      </mesh>
      <mesh position={[0, 2.35, 0]} castShadow receiveShadow>
        <icosahedronGeometry args={[1.13, full ? 1 : 0]} />
        <meshStandardMaterial color="#38754a" roughness={0.97} flatShading={!full} />
      </mesh>
      <mesh position={[0.55, 2.03, 0.28]} castShadow receiveShadow>
        <icosahedronGeometry args={[0.72, full ? 1 : 0]} />
        <meshStandardMaterial color="#4b8d57" roughness={0.96} flatShading={!full} />
      </mesh>
      {full && (
        <mesh position={[-0.48, 2.18, -0.35]} castShadow receiveShadow>
          <icosahedronGeometry args={[0.68, 1]} />
          <meshStandardMaterial color="#2f6942" roughness={0.98} />
        </mesh>
      )}
    </group>
  );
}

function Bush({ at, scale = 1 }: { at: [number, number, number]; scale?: number }) {
  return (
    <group position={at} scale={scale}>
      <mesh position={[-0.35, 0.35, 0]} castShadow><dodecahedronGeometry args={[0.48, 1]} /><meshStandardMaterial color="#3c7449" roughness={1} /></mesh>
      <mesh position={[0.28, 0.38, 0.04]} castShadow><dodecahedronGeometry args={[0.55, 1]} /><meshStandardMaterial color="#4b8552" roughness={1} /></mesh>
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

/** Hology의 지형·커스텀 셰이더 표현을 참고한 코드형 잔디 지면이다. */
function Terrain({ at, width, depth, full }: { at: [number, number, number]; width: number; depth: number; full: boolean }) {
  return (
    <mesh position={at} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[width, depth, full ? 64 : 18, full ? 64 : 18]} />
      <shaderMaterial
        vertexShader={`
          varying vec2 vUv2;
          varying float vRise;
          void main(){
            vUv2=uv;
            vec3 p=position;
            float broad=sin(p.x*.23)*cos(p.y*.19)*.045;
            float fine=sin((p.x+p.y)*1.7)*.008;
            p.z+=broad+fine;
            vRise=broad;
            gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv2;
          varying float vRise;
          float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          void main(){
            float grain=hash(floor(vUv2*220.0));
            float bands=sin(vUv2.x*48.0+sin(vUv2.y*29.0))*.5+.5;
            vec3 low=vec3(.20,.36,.16);
            vec3 high=vec3(.38,.56,.25);
            vec3 color=mix(low,high,clamp(.38+grain*.32+bands*.12+vRise*2.2,0.,1.));
            gl_FragColor=vec4(color,1.0);
          }
        `}
      />
    </mesh>
  );
}

function NeighborHouse({ at, color, turned = false }: { at: [number, number, number]; color: string; turned?: boolean }) {
  return (
    <group position={at} rotation={[0, turned ? Math.PI / 2 : 0, 0]}>
      <mesh position={[0, 1.45, 0]} castShadow receiveShadow><boxGeometry args={[4.8, 2.9, 3.8]} /><meshStandardMaterial color={color} roughness={0.9} /></mesh>
      <mesh position={[0, 3.18, 0]} rotation={[0, 0, Math.PI / 4]} castShadow><boxGeometry args={[3.18, 3.18, 4.05]} /><meshStandardMaterial color="#5f493c" roughness={0.88} /></mesh>
      {[-1.35, 0, 1.35].map((x) => <mesh key={x} position={[x, 1.65, 1.92]}><boxGeometry args={[0.72, 0.88, 0.05]} /><meshStandardMaterial color="#9ed3e7" emissive="#6ba6bd" emissiveIntensity={0.12} roughness={0.22} metalness={0.08} /></mesh>)}
      <mesh position={[0, 0.85, 1.97]}><boxGeometry args={[0.78, 1.7, 0.08]} /><meshStandardMaterial color="#65462f" roughness={0.74} /></mesh>
    </group>
  );
}

function GrassTufts({ extent }: { extent: Props['extent'] }) {
  const tufts = useMemo(() => {
    const rnd = seeded(119091);
    return Array.from({ length: 54 }, (_, index) => {
      const side = index % 2;
      const x = side ? extent.minX - 2.1 - rnd() * 5.8 : extent.maxX + 2.1 + rnd() * 5.8;
      const z = extent.minZ - 5 + rnd() * (extent.maxZ - extent.minZ + 9);
      return { x, z, s: 0.16 + rnd() * 0.2, color: index % 3 === 0 ? '#8caf4f' : '#6f9b43' };
    });
  }, [extent]);
  return <group>{tufts.map((t, index) => <mesh key={index} position={[t.x, t.s * 0.55, t.z]} castShadow><coneGeometry args={[t.s, t.s * 1.1, 4]} /><meshStandardMaterial color={t.color} roughness={1} /></mesh>)}</group>;
}

export default function Outside({ extent, scenery, detail }: Props) {
  const w = extent.maxX - extent.minX;
  const d = extent.maxZ - extent.minZ;
  const cx = (extent.minX + extent.maxX) / 2;
  const cz = (extent.minZ + extent.maxZ) / 2;
  const groundW = w + 34;
  const groundD = d + 34;
  const roadZ = extent.maxZ + 8.2;
  const full = detail === 'full';

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
    <group>
      <Terrain at={[cx, -0.065, cz]} width={groundW} depth={groundD} full={full} />
      <mesh position={[cx, -0.035, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w + 3.2, d + 3.2]} />
        <meshStandardMaterial color="#c5c2b9" roughness={0.95} />
      </mesh>
      <mesh position={[cx, -0.025, roadZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[groundW, 7]} />
        <meshStandardMaterial color="#41474b" roughness={0.91} />
      </mesh>
      <mesh position={[cx, -0.012, extent.maxZ + 3.8]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[groundW, 1.4]} />
        <meshStandardMaterial color="#bab8b1" roughness={0.96} />
      </mesh>
      <mesh position={[cx, -0.004, extent.maxZ + 2.15]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1.8, 3.1]} />
        <meshStandardMaterial color="#d5d0c5" roughness={0.9} />
      </mesh>
      {scenery && Array.from({ length: 10 }, (_, i) => (
        <mesh key={`road-line-${i}`} position={[cx - groundW / 2 + 3 + i * 4.5, -0.005, roadZ]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.4, 0.12]} /><meshBasicMaterial color="#f4e9ba" />
        </mesh>
      ))}
      {trees.map((tree, i) => <Tree key={`tree-${i}`} at={tree.at} scale={tree.scale} full={full} />)}
      {bushes.map((at, i) => <Bush key={`bush-${i}`} at={at} scale={0.82 + (i % 3) * 0.08} />)}
      {scenery && full && (
        <>
          <GrassTufts extent={extent} />
          <NeighborHouse at={[extent.minX - 8.5, 0, extent.minZ + 1.5]} color="#c9b08b" turned />
          <NeighborHouse at={[extent.maxX + 8.5, 0, extent.minZ + 3.8]} color="#b7c5ca" turned />
          <NeighborHouse at={[extent.minX + 2.8, 0, extent.minZ - 10]} color="#d0b6aa" />
          <StreetLight at={[extent.minX - 3.3, 0, extent.maxZ + 4.1]} />
          <StreetLight at={[extent.maxX + 3.3, 0, extent.maxZ + 4.1]} />
        </>
      )}
    </group>
  );
}

/** 하늘은 큰 구 안쪽의 위·아래 색을 섞어 지평선이 검게 끊기지 않게 한다. */
export function Sky() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { top: { value: new THREE.Color('#5f9ed0') }, bottom: { value: new THREE.Color('#eef2ef') } },
    vertexShader: `varying float vY; void main(){vY=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform vec3 top;uniform vec3 bottom;varying float vY;void main(){gl_FragColor=vec4(mix(bottom,top,clamp(vY*.5+.5,0.,1.)),1.);}`,
  }), []);
  return <mesh material={mat} renderOrder={-1}><sphereGeometry args={[150, 32, 20]} /></mesh>;
}
