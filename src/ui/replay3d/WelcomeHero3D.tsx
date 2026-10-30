'use client';

/**
 * 첫 화면 3D — 「빛으로 그린 대피 경로」 (설계서 v2.1 §1).
 *
 * 대기업 신제품 공개 화면처럼 상징 하나에 집중한다.
 *   공간       깊은 남색 밤, 거울처럼 비치는 바닥, 떠다니는 빛 먼지
 *   유리 집    우리 집 평면이 유리 벽으로 서고, 방의 경계는 빛나는 설계선이다. 위에는 집 지붕 모양의 빛 윤곽이 떠 있다
 *   불씨       부엌에 주황 불씨가 일렁인다 — 「불이 났을 때」
 *   빛의 길    내 방에서 문 밖까지 빨강 → 초록으로 바뀌는 빛의 길이 그려지고, 그 위로 빛 알갱이가 흐른다 — 「나가는 길」
 *   안전 원    길 끝 초록 원 위에서 소방복의 일구·웅이·영이가 손을 흔든다 — 「모두 무사히」
 *
 * 렌더링: 코드로 만든 반사광(RoomEnvironment) · 거울 바닥(MeshReflectorMaterial) · 유리(투과) · 빛번짐 · 구석 그늘 · 비네트.
 * 자산 파일은 없다(작업지침 §10-13). 움직임 줄이기면 다 그린 장면에서 멈춘다. 붉은 점멸은 없다(§10-10).
 * 느린 PC 는 유리 투과·거울·후처리를 끄고 같은 장면을 그린다.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, MeshReflectorMaterial } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TEMPLATES } from '../../content';
import { preparePlan } from '../../core/plan/prepare';
import { suggestedRoute } from '../../store/kidsStore';
import { defaultProfile } from '../../types/save';
import { isRoom, type Cell, type FloorPlan } from '../../types/plan';
import { interleavedGeometry } from './bridge';
import { buildHouse, planExtent } from './geometry';
import { guessQuality, prefersReducedMotion } from './quality';

interface Props {
  /** 첫 장면이 그려지면 부른다 — 화면이 그림 배경에서 3D 로 부드럽게 넘어간다 */
  onReady?: () => void;
}

const CAMERA_YAW = -0.55;
const NIGHT_TOP = '#1d3c70';
const NIGHT_BOTTOM = '#07122a';
const WALL_SCALE = 0.42;

/* ------------------------------------------------------------ 장면 자료 */

function useScene() {
  return useMemo(() => {
    const template = TEMPLATES.find((t) => t.id === 'apt_2room') ?? TEMPLATES[0];
    const plan = preparePlan(template.plan, { openKitchen: true });
    const route = suggestedRoute({ plan, hazardId: 'fire', routeSlot: 'primary', profile: defaultProfile(), routes: {} });
    const extent = planExtent(plan);
    const kitchen = plan.blocks.find((b) => isRoom(b) && b.roomKind === 'kitchen');
    const fire = kitchen && isRoom(kitchen) ? { x: kitchen.rect.x + kitchen.rect.w * 0.35, z: kitchen.rect.y + kitchen.rect.h * 0.4 } : null;
    return { plan, route, extent, fire };
  }, []);
}

/** 칸 목록 → 부드러운 빛의 길. 마지막은 문 밖 안전 원까지 */
function lightPath(route: Cell[], safe: THREE.Vector3): THREE.CurvePath<THREE.Vector3> | null {
  if (route.length < 2) return null;
  const pts = route.map((c) => new THREE.Vector3(c.x + 0.5, 0.3, c.y + 0.5));
  const simple: THREE.Vector3[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i += 1) {
    const d1 = pts[i].clone().sub(simple[simple.length - 1]).normalize();
    const d2 = pts[i + 1].clone().sub(pts[i]).normalize();
    if (d1.dot(d2) < 0.999) simple.push(pts[i]);
  }
  simple.push(pts[pts.length - 1]);
  const path = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 0; i < simple.length - 1; i += 1) path.add(new THREE.LineCurve3(simple[i], simple[i + 1]));
  /* 문 밖에서는 부드러운 곡선으로 안전 원까지 */
  const door = simple[simple.length - 1];
  const prev = simple[simple.length - 2];
  const out = door.clone().add(door.clone().sub(prev).normalize().multiplyScalar(3));
  path.add(new THREE.CubicBezierCurve3(door, out, new THREE.Vector3(safe.x, 0.3, (out.z + safe.z) / 2), new THREE.Vector3(safe.x, 0.3, safe.z)));
  return path;
}

/* ------------------------------------------------------------ 공간 */

function StudioLight({ intensity }: { intensity: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const target = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      target.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, intensity]);
  return null;
}

function NightBackdrop() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color(NIGHT_TOP) }, bottom: { value: new THREE.Color(NIGHT_BOTTOM) } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float t = smoothstep(-0.15, 0.6, vP.y); vec3 c = mix(bottom, top, t); float glow = pow(max(0.0, 1.0 - length(vP.xz - vec2(-0.35, -0.6)) * 0.9), 3.0) * 0.18; gl_FragColor = vec4(c + vec3(0.35, 0.5, 0.9) * glow, 1.0); }',
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh material={mat} renderOrder={-1}>
      <sphereGeometry args={[500, 32, 20]} />
    </mesh>
  );
}

function MirrorFloor({ cx, cz, rich }: { cx: number; cz: number; rich: boolean }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.02, cz]} receiveShadow>
      <planeGeometry args={[320, 320]} />
      {rich ? (
        <MeshReflectorMaterial
          blur={[420, 120]}
          resolution={1024}
          mixBlur={1}
          mixStrength={22}
          roughness={0.85}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.3}
          color="#0b1a36"
          metalness={0.6}
          mirror={0.6}
        />
      ) : (
        <meshStandardMaterial color="#0b1a36" roughness={0.6} metalness={0.3} />
      )}
    </mesh>
  );
}

function Dust({ cx, cz, span, reduced }: { cx: number; cz: number; span: number; reduced: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const n = 220;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      const a = (i * 2.399963) % (Math.PI * 2);
      const r = span * 0.3 + (((i * 37) % 100) / 100) * span * 1.6;
      pos[i * 3] = cx + Math.cos(a) * r;
      pos[i * 3 + 1] = 0.5 + (((i * 53) % 100) / 100) * span * 0.8;
      pos[i * 3 + 2] = cz + Math.sin(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [cx, cz, span]);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame(({ clock }) => {
    if (!ref.current || reduced) return;
    ref.current.rotation.y = clock.elapsedTime * 0.01;
    ref.current.position.y = Math.sin(clock.elapsedTime * 0.25) * 0.5;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial color="#cfe4ff" size={0.16} sizeAttenuation transparent opacity={0.7} depthWrite={false} />
    </points>
  );
}

/* ------------------------------------------------------------ 유리 집 */

/** 방의 경계 — 바닥 위 빛나는 설계선. 두께가 있어 빛번짐을 받는다 */
function Blueprint({ plan }: { plan: FloorPlan }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const edges = useMemo(() => {
    const out: { x: number; z: number; len: number; rot: number }[] = [];
    for (const b of plan.blocks) {
      if (!isRoom(b) || b.wallMode === 'zone') continue;
      const { x, y, w, h } = b.rect;
      out.push({ x: x + w / 2, z: y, len: w, rot: 0 }, { x: x + w / 2, z: y + h, len: w, rot: 0 });
      out.push({ x, z: y + h / 2, len: h, rot: Math.PI / 2 }, { x: x + w, z: y + h / 2, len: h, rot: Math.PI / 2 });
    }
    return out;
  }, [plan]);
  useEffect(() => {
    if (!mesh.current) return;
    const o = new THREE.Object3D();
    edges.forEach((e, i) => {
      o.position.set(e.x, 0.05, e.z);
      o.rotation.set(0, e.rot, 0);
      o.scale.set(e.len, 1, 1);
      o.updateMatrix();
      mesh.current?.setMatrixAt(i, o.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [edges]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, edges.length]}>
      <boxGeometry args={[1, 0.05, 0.09]} />
      <meshBasicMaterial color="#7fd0ff" toneMapped={false} />
    </instancedMesh>
  );
}

function GlassHouse({ plan, extent, rich }: { plan: FloorPlan; extent: { minX: number; maxX: number; minZ: number; maxZ: number }; rich: boolean }) {
  const parts = useMemo(() => buildHouse(plan), [plan]);
  const walls = useMemo(() => interleavedGeometry(parts.walls), [parts]);
  const furniture = useMemo(() => interleavedGeometry(parts.furniture), [parts]);
  useEffect(() => () => [walls, furniture].forEach((g) => g.dispose()), [walls, furniture]);
  const w = extent.maxX - extent.minX;
  const d = extent.maxZ - extent.minZ;
  const cx = (extent.minX + extent.maxX) / 2;
  const cz = (extent.minZ + extent.maxZ) / 2;
  return (
    <group>
      {/* 유리 받침 */}
      <mesh position={[cx, -0.01, cz]} receiveShadow>
        <boxGeometry args={[w + 1.6, 0.08, d + 1.6]} />
        <meshPhysicalMaterial color="#9fc6ff" roughness={0.15} transmission={rich ? 0.9 : 0} transparent opacity={rich ? 1 : 0.5} thickness={0.5} ior={1.4} />
      </mesh>
      <group scale={[1, WALL_SCALE, 1]}>
        <mesh geometry={walls} castShadow>
          {rich ? (
            <meshPhysicalMaterial color="#dbeaff" roughness={0.08} transmission={0.92} thickness={0.6} ior={1.45} clearcoat={1} clearcoatRoughness={0.05} attenuationColor="#a8cfff" attenuationDistance={4} />
          ) : (
            <meshPhysicalMaterial color="#cfe2ff" roughness={0.15} transparent opacity={0.45} clearcoat={1} />
          )}
        </mesh>
        <mesh geometry={furniture} castShadow>
          <meshStandardMaterial color="#e9f2ff" roughness={0.35} metalness={0.1} transparent opacity={0.85} envMapIntensity={1.2} />
        </mesh>
      </group>
      <Blueprint plan={plan} />
    </group>
  );
}

/** 집 위에 떠 있는 지붕 모양의 빛 윤곽 — 「우리 집」의 상징 */
function RoofHalo({ extent, reduced }: { extent: { minX: number; maxX: number; minZ: number; maxZ: number }; reduced: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const cx = (extent.minX + extent.maxX) / 2;
  const cz = (extent.minZ + extent.maxZ) / 2;
  const w = extent.maxX - extent.minX;
  const geo = useMemo(() => {
    const half = w / 2 + 0.8;
    const h = w * 0.2;
    const curve = new THREE.CurvePath<THREE.Vector3>();
    curve.add(new THREE.LineCurve3(new THREE.Vector3(-half, 0, 0), new THREE.Vector3(0, h, 0)));
    curve.add(new THREE.LineCurve3(new THREE.Vector3(0, h, 0), new THREE.Vector3(half, 0, 0)));
    return new THREE.TubeGeometry(curve as unknown as THREE.Curve<THREE.Vector3>, 64, 0.12, 12, false);
  }, [w]);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame(({ clock }) => {
    if (ref.current && !reduced) ref.current.position.y = 2.6 + Math.sin(clock.elapsedTime * 0.8) * 0.2;
  });
  return (
    <group ref={ref} position={[cx, 2.6, cz]} rotation={[0, CAMERA_YAW, 0]}>
      <mesh geometry={geo}>
        <meshStandardMaterial color="#ffffff" emissive="#9fd4ff" emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** 부엌의 불씨 — 일렁이지만 깜빡이지 않는다 */
function Ember({ at, reduced }: { at: { x: number; z: number }; reduced: boolean }) {
  const core = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const t = reduced ? 0 : clock.elapsedTime;
    const s = 1 + Math.sin(t * 6.1) * 0.08 + Math.sin(t * 9.7) * 0.05;
    core.current?.scale.set(1, s, 1);
    if (light.current) light.current.intensity = 14 + Math.sin(t * 5.3) * 2.5;
  });
  return (
    <group position={[at.x, 0.05, at.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[1.6, 40]} />
        <meshBasicMaterial color="#ff6a1a" transparent opacity={0.28} toneMapped={false} />
      </mesh>
      <mesh ref={core} position={[0, 0.6, 0]}>
        <coneGeometry args={[0.42, 1.2, 28]} />
        <meshStandardMaterial color="#ff8a2a" emissive="#ff5a00" emissiveIntensity={4} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <coneGeometry args={[0.22, 0.7, 24]} />
        <meshStandardMaterial color="#ffe7a8" emissive="#ffd060" emissiveIntensity={5} toneMapped={false} />
      </mesh>
      <pointLight ref={light} color="#ff7a2a" intensity={14} distance={9} decay={2} position={[0, 1.2, 0]} />
    </group>
  );
}

/* ------------------------------------------------------------ 빛의 길 · 흐르는 빛 · 안전 원 */

const DRAW_SECONDS = 5;
const HOLD_SECONDS = 3.4;
const RED = new THREE.Color('#ff3b3b');
const AMBER = new THREE.Color('#ffb03a');
const GREEN = new THREE.Color('#22e08a');

function gradientAt(u: number): THREE.Color {
  return u < 0.55 ? RED.clone().lerp(AMBER, u / 0.55) : AMBER.clone().lerp(GREEN, (u - 0.55) / 0.45);
}

function LightPath({ path, reduced }: { path: THREE.CurvePath<THREE.Vector3>; reduced: boolean }) {
  const tube = useMemo(() => {
    const segments = 400;
    const radial = 12;
    const geo = new THREE.TubeGeometry(path as unknown as THREE.Curve<THREE.Vector3>, segments, 0.2, radial, false);
    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const ring = Math.floor(i / (radial + 1));
      const c = gradientAt(ring / segments);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { geo, segments, radial };
  }, [path]);
  useEffect(() => () => tube.geo.dispose(), [tube]);
  const N = 26;
  const sparks = useRef<THREE.InstancedMesh>(null);
  const head = useRef<THREE.Mesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const t0 = useRef<number | null>(null);
  useEffect(() => {
    if (!sparks.current) return;
    for (let i = 0; i < N; i += 1) sparks.current.setColorAt(i, gradientAt(i / N).multiplyScalar(1.6));
    if (sparks.current.instanceColor) sparks.current.instanceColor.needsUpdate = true;
  }, []);

  useFrame(({ clock }) => {
    if (t0.current === null) t0.current = clock.elapsedTime;
    const cycle = DRAW_SECONDS + HOLD_SECONDS;
    const t = reduced ? DRAW_SECONDS + 1 : (clock.elapsedTime - t0.current) % cycle;
    const k = Math.min(1, t / DRAW_SECONDS);
    const eased = 1 - Math.pow(1 - k, 3);
    tube.geo.setDrawRange(0, Math.floor(eased * tube.segments) * tube.radial * 6);
    const p = path.getPointAt(Math.max(0.0005, Math.min(0.9995, eased)));
    if (head.current) {
      head.current.position.copy(p);
      head.current.visible = k < 1;
      (head.current.material as THREE.MeshStandardMaterial).emissive.copy(gradientAt(eased));
    }
    if (sparks.current) {
      for (let i = 0; i < N; i += 1) {
        const u = ((i / N) + (reduced ? 0 : clock.elapsedTime * 0.06)) % 1;
        const show = u < eased;
        const q = path.getPointAt(Math.min(0.999, u));
        dummy.position.set(q.x, q.y + 0.05, q.z);
        dummy.scale.setScalar(show ? 0.9 + Math.sin(u * 40 + clock.elapsedTime * 3) * 0.15 : 0.0001);
        dummy.updateMatrix();
        sparks.current.setMatrixAt(i, dummy.matrix);
        sparks.current.setColorAt(i, gradientAt(u).multiplyScalar(1.8));
      }
      sparks.current.instanceMatrix.needsUpdate = true;
      if (sparks.current.instanceColor) sparks.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      <mesh geometry={tube.geo}>
        <meshStandardMaterial vertexColors emissive="#ffffff" emissiveIntensity={0.0} roughness={0.3} toneMapped={false} />
      </mesh>
      {/* 길 아래로 번지는 옅은 빛 */}
      <mesh geometry={tube.geo} scale={[1, 0.2, 1]} position={[0, -0.24, 0]}>
        <meshBasicMaterial vertexColors transparent opacity={0.35} toneMapped={false} />
      </mesh>
      <instancedMesh ref={sparks} args={[undefined, undefined, N]}>
        <sphereGeometry args={[0.2, 14, 12]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <mesh ref={head}>
        <sphereGeometry args={[0.42, 24, 18]} />
        <meshStandardMaterial color="#ffffff" emissive="#ff3b3b" emissiveIntensity={4} toneMapped={false} />
      </mesh>
    </group>
  );
}

function SafeCircle({ at, reduced }: { at: THREE.Vector3; reduced: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  const pulse = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (reduced) return;
    if (ring.current) ring.current.rotation.z = clock.elapsedTime * 0.35;
    if (pulse.current) {
      const k = (clock.elapsedTime * 0.5) % 1;
      pulse.current.scale.setScalar(1 + k * 0.6);
      (pulse.current.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - k);
    }
  });
  return (
    <group position={[at.x, 0.02, at.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.8, 64]} />
        <meshStandardMaterial color="#0f3a2c" emissive="#0d6b45" emissiveIntensity={0.55} roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[3.8, 4.1, 96, 1, 0, Math.PI * 1.8]} />
        <meshBasicMaterial color="#3cf0a0" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={pulse} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[3.8, 3.95, 96]} />
        <meshBasicMaterial color="#3cf0a0" transparent opacity={0.4} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <pointLight color="#3cf0a0" intensity={10} distance={10} decay={2} position={[0, 3, 0]} />
      <Html position={[0, 0.2, 4.9]} center distanceFactor={30} zIndexRange={[2, 0]} className="k-hero-tag safe">
        모두 무사히
      </Html>
    </group>
  );
}

/* ------------------------------------------------------------ 소방 친구들 (일구·웅이·영이) */

type BuddyKind = 'ilgu' | 'young' | 'woong';
type BuddyAction = 'wave' | 'point' | 'hop';

const C = {
  uniform: '#d8bd86',
  uniformShade: '#b89a63',
  reflectY: '#f4d23b',
  reflectS: '#e3e7ec',
  helmet: '#1b2230',
  boot: '#171a20',
  glove: '#f4c430',
  belt: '#2a2e36',
  gold: '#e9b52f',
};

function Band({ y, r, h, color, glow = 0 }: { y: number; r: number; h: number; color: string; glow?: number }) {
  return (
    <mesh position={[0, y, 0]}>
      <cylinderGeometry args={[r, r, h, 36, 1, true]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} roughness={0.35} metalness={0.1} side={THREE.DoubleSide} />
    </mesh>
  );
}

function FireBuddy({ kind, action, position, reduced, phase, patch }: { kind: BuddyKind; action: BuddyAction; position: [number, number, number]; reduced: boolean; phase: number; patch: THREE.Texture }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const skin = kind === 'woong' ? '#f2dfbf' : '#ffd9c2';
  const hair = kind === 'young' ? '#5a3422' : '#1e1a1a';

  useFrame(({ clock }) => {
    const t = reduced ? 0 : clock.elapsedTime + phase;
    const hop = action === 'hop' ? Math.max(0, Math.sin(t * 3.4)) : 0;
    if (root.current) root.current.position.y = position[1] + hop * 0.9;
    if (body.current) body.current.scale.set(1, 1 + Math.sin(t * 2.2) * 0.012 - hop * 0.04, 1);
    if (armR.current) {
      if (action === 'wave') armR.current.rotation.z = -2.45 + Math.sin(t * 6.5) * 0.32;
      else if (action === 'point') {
        armR.current.rotation.z = -1.25;
        armR.current.rotation.y = -0.55 + Math.sin(t * 1.4) * 0.06;
      } else armR.current.rotation.z = -0.45 - hop * 1.7;
    }
    if (armL.current) armL.current.rotation.z = action === 'hop' ? 0.45 + hop * 1.7 : 0.22 + Math.sin(t * 2.2) * 0.04;
    if (head.current) {
      head.current.rotation.z = Math.sin(t * 1.25) * 0.07;
      head.current.rotation.x = -0.28;
      head.current.rotation.y = Math.sin(t * 0.7) * 0.12;
    }
    if (eyes.current) eyes.current.scale.y = t % 4.3 < 0.13 ? 0.12 : 1;
  });

  const fabric = <meshPhysicalMaterial color={C.uniform} roughness={0.78} sheen={0.6} sheenColor="#fff2d6" sheenRoughness={0.6} />;
  const skinMat = <meshPhysicalMaterial color={skin} roughness={0.52} sheen={0.35} sheenColor="#ffd8d0" clearcoat={0.08} />;
  const gloss = (color: string) => <meshPhysicalMaterial color={color} roughness={0.22} clearcoat={1} clearcoatRoughness={0.12} metalness={0.05} />;

  return (
    <group ref={root} position={position} rotation={[0, CAMERA_YAW, 0]} scale={1.3}>
      <group ref={body}>
        {[-0.22, 0.22].map((x) => (
          <mesh key={`b${x}`} position={[x, 0.13, 0.05]} scale={[1, 0.62, 1.35]} castShadow>
            <sphereGeometry args={[0.21, 28, 20]} />
            {gloss(C.boot)}
          </mesh>
        ))}
        {[-0.22, 0.22].map((x) => (
          <group key={`l${x}`} position={[x, 0, 0]}>
            <mesh position={[0, 0.44, 0]} castShadow>
              <capsuleGeometry args={[0.16, 0.3, 8, 24]} />
              {fabric}
            </mesh>
            <group position={[0, 0.36, 0]}>
              <Band y={0} r={0.165} h={0.05} color={C.reflectY} glow={0.25} />
              <Band y={0.05} r={0.166} h={0.03} color={C.reflectS} glow={0.35} />
            </group>
          </group>
        ))}
        <group position={[0, 1.12, 0]} scale={[1, 1, 0.86]}>
          <mesh castShadow>
            <capsuleGeometry args={[0.43, 0.4, 12, 32]} />
            {fabric}
          </mesh>
          <Band y={-0.12} r={0.437} h={0.07} color={C.reflectY} glow={0.25} />
          <Band y={-0.065} r={0.438} h={0.035} color={C.reflectS} glow={0.4} />
          <Band y={-0.01} r={0.437} h={0.07} color={C.reflectY} glow={0.25} />
          <Band y={-0.3} r={0.44} h={0.1} color={C.belt} />
        </group>
        <mesh position={[0, 0.82, 0.39]} castShadow>
          <boxGeometry args={[0.16, 0.1, 0.05]} />
          <meshStandardMaterial color={C.gold} metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[0, 1.33, 0.385]}>
          <planeGeometry args={[0.44, 0.22]} />
          <meshStandardMaterial map={patch} transparent roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.6, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.24, 0.07, 14, 32]} />
          <meshPhysicalMaterial color={C.uniformShade} roughness={0.8} sheen={0.5} />
        </mesh>
        {([['R', armR, 1], ['L', armL, -1]] as const).map(([key, ref, side]) => (
          <group key={key} ref={ref} position={[0.44 * side, 1.46, 0]} rotation={[0, 0, side === 1 ? -0.3 : 0.22]}>
            <mesh position={[0.3 * side, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <capsuleGeometry args={[0.125, 0.36, 8, 20]} />
              {fabric}
            </mesh>
            <group position={[0.46 * side, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <Band y={0} r={0.13} h={0.05} color={C.reflectY} glow={0.25} />
            </group>
            <mesh position={[0.62 * side, 0, 0]} castShadow>
              <sphereGeometry args={[0.15, 24, 18]} />
              <meshPhysicalMaterial color={C.glove} roughness={0.55} sheen={0.4} />
            </mesh>
          </group>
        ))}
      </group>

      <group ref={head} position={[0, 2.08, 0]}>
        <mesh scale={[1, 0.95, 0.94]} castShadow>
          <sphereGeometry args={[0.6, 56, 40]} />
          {skinMat}
        </mesh>
        {kind === 'woong' && (
          <>
            {[-0.56, 0.56].map((x) => (
              <group key={x} position={[x, 0.22, -0.02]}>
                <mesh castShadow>
                  <sphereGeometry args={[0.19, 24, 18]} />
                  <meshPhysicalMaterial color="#c98f5d" roughness={0.7} sheen={0.6} />
                </mesh>
                <mesh position={[0, 0, 0.08]} scale={[1, 1, 0.5]}>
                  <sphereGeometry args={[0.11, 18, 14]} />
                  <meshStandardMaterial color="#f3b2a6" roughness={0.8} />
                </mesh>
              </group>
            ))}
            <mesh position={[0, -0.14, 0.44]} scale={[1.15, 0.8, 0.7]}>
              <sphereGeometry args={[0.22, 28, 20]} />
              <meshPhysicalMaterial color="#fff4e3" roughness={0.6} sheen={0.4} />
            </mesh>
            <mesh position={[0, -0.06, 0.6]} scale={[1.2, 0.85, 0.8]}>
              <sphereGeometry args={[0.065, 18, 14]} />
              {gloss('#2a1d1a')}
            </mesh>
          </>
        )}
        {kind === 'young' && (
          <>
            {[-0.62, 0.62].map((x) => (
              <group key={x} position={[x, -0.04, -0.12]}>
                <mesh castShadow>
                  <sphereGeometry args={[0.2, 24, 18]} />
                  <meshPhysicalMaterial color={hair} roughness={0.45} sheen={0.8} sheenColor="#a0684a" />
                </mesh>
                <mesh position={[0, 0.16, 0.02]} rotation={[0.3, 0, 0]}>
                  <torusGeometry args={[0.08, 0.035, 12, 24]} />
                  <meshStandardMaterial color="#ff4f6d" roughness={0.5} />
                </mesh>
              </group>
            ))}
            <mesh position={[0, 0.2, 0.33]} scale={[1.25, 0.42, 0.6]}>
              <sphereGeometry args={[0.36, 28, 18]} />
              <meshPhysicalMaterial color={hair} roughness={0.45} sheen={0.8} sheenColor="#a0684a" />
            </mesh>
          </>
        )}
        {kind === 'ilgu' && (
          <mesh position={[0, 0.2, 0.33]} scale={[1.2, 0.36, 0.6]}>
            <sphereGeometry args={[0.36, 28, 18]} />
            <meshPhysicalMaterial color={hair} roughness={0.5} sheen={0.6} />
          </mesh>
        )}
        <group ref={eyes} position={[0, 0.02, 0]}>
          {[-0.2, 0.2].map((x) => (
            <group key={x} position={[x, 0, 0.53]}>
              <mesh scale={[0.09, 0.125, 0.05]}>
                <sphereGeometry args={[1, 24, 18]} />
                {gloss('#16161c')}
              </mesh>
              <mesh position={[0.03, 0.05, 0.045]}>
                <sphereGeometry args={[0.032, 12, 10]} />
                <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.9} />
              </mesh>
              <mesh position={[-0.025, -0.045, 0.043]}>
                <sphereGeometry args={[0.014, 10, 8]} />
                <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.9} />
              </mesh>
            </group>
          ))}
        </group>
        {kind !== 'woong' &&
          [-0.2, 0.2].map((x) => (
            <mesh key={`eb${x}`} position={[x, 0.2, 0.55]} rotation={[0, 0, x < 0 ? 0.18 : -0.18]}>
              <capsuleGeometry args={[0.018, 0.09, 4, 8]} />
              <meshStandardMaterial color={hair} roughness={0.6} />
            </mesh>
          ))}
        {kind !== 'woong' && (
          <mesh position={[0, -0.08, 0.585]}>
            <sphereGeometry args={[0.035, 12, 10]} />
            <meshStandardMaterial color="#f2b49a" roughness={0.6} />
          </mesh>
        )}
        {[-0.34, 0.34].map((x) => (
          <mesh key={`c${x}`} position={[x, -0.12, 0.47]} scale={[1, 0.62, 0.3]}>
            <sphereGeometry args={[0.1, 16, 12]} />
            <meshStandardMaterial color="#ff8fa0" transparent opacity={0.7} roughness={0.8} />
          </mesh>
        ))}
        <group position={[0, -0.2, kind === 'woong' ? 0.6 : 0.565]}>
          <mesh rotation={[0, 0, Math.PI]}>
            <circleGeometry args={[0.085, 24, 0, Math.PI]} />
            <meshStandardMaterial color="#8c1f2c" roughness={0.6} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, -0.045, 0.002]} scale={[1, 0.55, 1]} rotation={[0, 0, Math.PI]}>
            <circleGeometry args={[0.05, 20, 0, Math.PI]} />
            <meshStandardMaterial color="#ff7d8c" roughness={0.6} side={THREE.DoubleSide} />
          </mesh>
        </group>
        {/* 헬멧 — 둥근 몸체, 뒤가 긴 챙, 반사띠, 금색 표장 */}
        <group position={[0, 0.16, -0.02]}>
          <mesh castShadow>
            <sphereGeometry args={[0.64, 56, 28, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
            {gloss(C.helmet)}
          </mesh>
          <mesh position={[0, 0.01, -0.1]} scale={[1, 1, 1.16]} castShadow>
            <cylinderGeometry args={[0.7, 0.72, 0.05, 56]} />
            {gloss(C.helmet)}
          </mesh>
          <Band y={0.09} r={0.628} h={0.07} color={C.reflectY} glow={0.35} />
          <mesh position={[0, 0.32, 0.55]} rotation={[-0.62, 0, 0]}>
            <cylinderGeometry args={[0.16, 0.16, 0.04, 6]} />
            <meshStandardMaterial color={C.gold} metalness={0.85} roughness={0.22} />
          </mesh>
          <mesh position={[0, 0.34, 0.58]} rotation={[-0.62, 0, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.045, 24]} />
            <meshStandardMaterial color="#c8102e" metalness={0.3} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.58, -0.02]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 0.5]}>
            <torusGeometry args={[0.32, 0.05, 12, 36, Math.PI]} />
            {gloss('#262e3d')}
          </mesh>
        </group>
      </group>
      <Html position={[0, 3.25, 0]} center distanceFactor={26} zIndexRange={[2, 0]} className="k-hero-tag">
        {kind === 'ilgu' ? '일구' : kind === 'young' ? '영이' : '웅이'}
      </Html>
    </group>
  );
}


/* ------------------------------------------------------------ 텍스처 (가슴의 119 표장) */

function patchTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#d7262e';
  g.beginPath();
  g.roundRect(6, 6, 244, 116, 30);
  g.fill();
  g.strokeStyle = '#f6d23a';
  g.lineWidth = 8;
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = '900 78px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('119', 128, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------ 카메라 */

function CameraRig({ look, span, reduced }: { look: THREE.Vector3; span: number; reduced: boolean }) {
  const { camera, size, pointer } = useThree();
  /* 카드가 오른쪽이라 장면은 화면 왼쪽 가운데에 온다 */
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const shift = size.width > 1100 ? 0.19 : 0.13;
    camera.setViewOffset(size.width, size.height, size.width * shift, size.height * 0.04, size.width, size.height);
    camera.updateProjectionMatrix();
    return () => camera.clearViewOffset();
  }, [camera, size.width, size.height]);
  useFrame(({ clock }) => {
    const t = reduced ? 0 : clock.elapsedTime;
    const dist = span * 1.6 + 12;
    const yaw = CAMERA_YAW + Math.sin(t * 0.14) * 0.09 + (reduced ? 0 : pointer.x * 0.06);
    const pitch = 0.43 + Math.sin(t * 0.1) * 0.02 + (reduced ? 0 : pointer.y * 0.03);
    camera.position.set(look.x + Math.sin(yaw) * Math.cos(pitch) * dist, look.y + Math.sin(pitch) * dist, look.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(look);
  });
  return null;
}

/* ------------------------------------------------------------ 장면 */

function Scene({ reduced, rich }: { reduced: boolean; rich: boolean }) {
  const { plan, route, extent, fire } = useScene();
  const cx = (extent.minX + extent.maxX) / 2;
  const cz = (extent.minZ + extent.maxZ) / 2;
  const w = extent.maxX - extent.minX;
  const d = extent.maxZ - extent.minZ;
  const span = Math.max(w, d);
  const patch = useMemo(() => patchTexture(), []);
  useEffect(() => () => patch.dispose(), [patch]);

  /* 안전 원 — 집에서 카메라 쪽 앞, 조금 왼쪽. 친구들이 이쪽을 보고 선다 */
  const { safe, buddies, look } = useMemo(() => {
    const toCam = new THREE.Vector2(Math.sin(CAMERA_YAW), Math.cos(CAMERA_YAW));
    const side = new THREE.Vector2(toCam.y, -toCam.x);
    const s2 = new THREE.Vector2(cx, cz).add(toCam.clone().multiplyScalar(span * 0.42 + 5)).add(side.clone().multiplyScalar(-span * 0.5));
    const safeV = new THREE.Vector3(s2.x, 0, s2.y);
    const list: { kind: BuddyKind; action: BuddyAction; phase: number; along: number; depth: number }[] = [
      { kind: 'ilgu', action: 'wave', phase: 0, along: -2.1, depth: -0.2 },
      { kind: 'woong', action: 'hop', phase: 0.8, along: 0, depth: 0.5 },
      { kind: 'young', action: 'wave', phase: 1.6, along: 2.1, depth: -0.2 },
    ];
    const bs = list.map((b) => {
      const p = s2.clone().add(side.clone().multiplyScalar(b.along)).add(toCam.clone().multiplyScalar(b.depth));
      return { ...b, position: [p.x, 0.03, p.y] as [number, number, number] };
    });
    const lookAt = new THREE.Vector3(cx * 0.62 + safeV.x * 0.38, 1.4, cz * 0.62 + safeV.z * 0.38);
    return { safe: safeV, buddies: bs, look: lookAt };
  }, [cx, cz, span]);
  const path = useMemo(() => lightPath(route, safe), [route, safe]);

  return (
    <>
      <NightBackdrop />
      <fog attach="fog" args={[NIGHT_BOTTOM, span * 2.6, span * 7]} />
      <StudioLight intensity={0.28} />
      <ambientLight intensity={0.12} color="#9fbfff" />
      {/* 달빛 같은 차가운 주광 */}
      <directionalLight
        position={[cx - span * 0.7, span * 1.4, cz - span * 0.9]}
        intensity={0.9}
        color="#b9d4ff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-span * 1.4}
        shadow-camera-right={span * 1.4}
        shadow-camera-top={span * 1.4}
        shadow-camera-bottom={-span * 1.4}
        shadow-camera-near={1}
        shadow-camera-far={span * 6}
        shadow-bias={-0.0003}
      />
      {/* 친구들을 비추는 따뜻한 조명 */}
      <spotLight position={[safe.x + 6, 16, safe.z + 10]} target-position={[safe.x, 0, safe.z]} angle={0.42} penumbra={0.9} intensity={420} distance={40} color="#fff1dc" castShadow />
      <directionalLight position={[cx + span, span * 0.5, cz + span]} intensity={0.35} color="#ffd9b0" />

      <MirrorFloor cx={cx} cz={cz} rich={rich} />
      <GlassHouse plan={plan} extent={extent} rich={rich} />
      <RoofHalo extent={extent} reduced={reduced} />
      {fire && <Ember at={fire} reduced={reduced} />}
      {path && <LightPath path={path} reduced={reduced} />}
      <SafeCircle at={safe} reduced={reduced} />
      {buddies.map((b) => (
        <FireBuddy key={b.kind} kind={b.kind} action={b.action} position={b.position} reduced={reduced} phase={b.phase} patch={patch} />
      ))}
      <Dust cx={cx} cz={cz} span={span} reduced={reduced} />
      <CameraRig look={look} span={span} reduced={reduced} />

      {rich && (
        <EffectComposer multisampling={4}>
          <N8AO aoRadius={1.2} intensity={1.6} distanceFalloff={0.8} quality="medium" />
          <Bloom luminanceThreshold={0.7} luminanceSmoothing={0.25} intensity={1.1} mipmapBlur radius={0.75} />
          <Vignette offset={0.28} darkness={0.55} eskil={false} />
        </EffectComposer>
      )}
    </>
  );
}

export default function WelcomeHero3D({ onReady }: Props) {
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const quality = useMemo(() => guessQuality(), []);
  const rich = quality !== 'low';
  return (
    <Canvas
      className="k-hero-canvas"
      shadows={rich ? 'soft' : 'percentage'}
      dpr={rich ? [1, 1.75] : 1}
      frameloop={reduced ? 'demand' : 'always'}
      camera={{ fov: 30, near: 0.5, far: 1200, position: [20, 18, 24] }}
      gl={{ antialias: !rich, powerPreference: 'high-performance', alpha: false, stencil: false }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.AgXToneMapping;
        gl.toneMappingExposure = 1.15;
        requestAnimationFrame(() => requestAnimationFrame(() => onReady?.()));
      }}
    >
      <Scene reduced={reduced} rich={rich} />
    </Canvas>
  );
}
