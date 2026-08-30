'use client';

/**
 * 바닥에 흐르는 빛나는 길 — 설계서 v1.4 §2.3 · FR-11.7.
 *
 * 아이가 그린 경로를 바닥 위에 띠로 깐다. 목표 그림의 핵심이고,
 * "내가 그린 길"과 "내가 실제로 간 길"을 견줘 보게 하는 장치이기도 하다.
 *
 * 화살표는 천천히 흐른다. 다만 움직임을 줄여 달라고 한 기기에서는 멈춘다 —
 * 붉은 점멸이 아니어도 끊임없이 움직이는 것은 누군가에게 괴롭다 (작업지침 §9-10 의 뜻).
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Cell } from '../../types/plan';
import { makeArrowTexture } from './labels';
import { prefersReducedMotion } from './quality';

/** 바닥에서 띄우는 높이. 0 이면 바닥과 다퉈 얼룩진다 */
const LIFT = 0.03;
const WIDTH = 0.5;

interface Props {
  waypoints: Cell[];
  color: string;
  /** 보조 경로는 옅게 */
  faint?: boolean;
  /** 화살표를 흐르게 할지 */
  animate?: boolean;
}

/**
 * 칸 목록을 띠 하나로 잇는다.
 * 모퉁이에서 벌어지지 않게 각 칸의 한가운데를 지나는 사각형을 이어 붙인다.
 */
function ribbonGeometry(waypoints: Cell[]): { geo: THREE.BufferGeometry; length: number } | null {
  if (waypoints.length < 2) return null;
  const pts = waypoints.map((c) => new THREE.Vector3(c.x + 0.5, LIFT, c.y + 0.5));

  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let run = 0;

  for (let i = 0; i < pts.length; i += 1) {
    const prev = pts[i - 1] ?? pts[i];
    const next = pts[i + 1] ?? pts[i];
    /* 진행 방향의 평균 — 모퉁이에서 띠가 부드럽게 꺾인다 */
    const dir = new THREE.Vector3().subVectors(next, prev);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    /* 바닥 위에서 진행 방향의 왼쪽 */
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(WIDTH / 2);
    if (i > 0) run += pts[i].distanceTo(pts[i - 1]);

    pos.push(pts[i].x + side.x, LIFT, pts[i].z + side.z);
    pos.push(pts[i].x - side.x, LIFT, pts[i].z - side.z);
    uv.push(0, run, 1, run);

    if (i < pts.length - 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, length: run };
}

export default function RoutePath({ waypoints, color, faint = false, animate = true }: Props) {
  const built = useMemo(() => ribbonGeometry(waypoints), [waypoints]);
  const arrowTex = useMemo(() => makeArrowTexture(), []);
  const arrowRef = useRef<THREE.MeshBasicMaterial>(null);
  const flowing = animate && !prefersReducedMotion();

  useEffect(() => {
    if (!built) return;
    /* 길이에 맞춰 화살표를 되풀이한다 — 짧은 길에 화살표가 늘어지지 않게 */
    arrowTex.repeat.set(1, Math.max(1, Math.round(built.length / 1.6)));
    arrowTex.needsUpdate = true;
  }, [built, arrowTex]);

  useEffect(() => () => {
    built?.geo.dispose();
    arrowTex.dispose();
  }, [built, arrowTex]);

  useFrame((_, delta) => {
    if (!flowing || !arrowRef.current) return;
    /* 진행 방향으로 흐른다. 느리게 — 눈이 따라가기 편한 속도다 */
    arrowTex.offset.y -= delta * 0.35;
  });

  if (!built) return null;

  return (
    <group>
      {/*
        * 띠는 두 겹이다. 밝은 바닥 위에서 가산 혼합만 쓰면 하얗게 날아가 버려
        * 초록으로 보이지 않는다. 먼저 제 색으로 깔고, 그 위에 가산으로 빛을 얹는다.
        */}
      <mesh geometry={built.geo} renderOrder={2}>
        <meshBasicMaterial color={color} transparent opacity={faint ? 0.42 : 0.8} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={built.geo} renderOrder={2} position={[0, 0.002, 0]}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={faint ? 0.2 : 0.45}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* 그 위에 흐르는 화살표 */}
      <mesh geometry={built.geo} renderOrder={3} position={[0, 0.004, 0]}>
        <meshBasicMaterial
          ref={arrowRef}
          map={arrowTex}
          color="#eafff1"
          transparent
          opacity={faint ? 0.4 : 1}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * 실제로 지나온 자취 — 그린 길과 견주라고 뒤에 옅게 남긴다 (설계서 v1.4 §2.3).
 * 같은 칸을 여러 번 밟아도 한 번만 그린다.
 */
export function TrailPath({ cells }: { cells: Cell[] }) {
  const unique = useMemo(() => {
    const seen = new Set<string>();
    const out: Cell[] = [];
    for (const c of cells) {
      const k = `${c.x},${c.y}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
    return out;
  }, [cells]);

  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.34, 0.34);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);

  useEffect(() => () => geo.dispose(), [geo]);
  if (unique.length === 0) return null;

  return (
    <group>
      {unique.map((c) => (
        <mesh key={`${c.x},${c.y}`} geometry={geo} position={[c.x + 0.5, 0.02, c.y + 0.5]} renderOrder={1}>
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.24} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
