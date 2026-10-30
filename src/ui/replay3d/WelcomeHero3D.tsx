'use client';

/**
 * 첫 화면 3D — 「우리 집 대피지도」를 한 장면의 상징으로 (설계서 v2.1 §1).
 *
 * 제품 광고 렌더처럼 정갈하게 간다. 잡동사니 없이 다섯 가지만 둔다.
 *   받침       은은한 그라데이션 공간에 떠 있는 흰 받침과 모눈종이 — 「지도를 그린다」
 *   집 모형    흰 건축 모형 같은 우리 집 — 「우리 집」
 *   대피 경로  크레용 한 자루가 내 방에서 현관까지 빛나는 빨간 길을 긋고, 문 밖 초록 「만나는 곳」에서 멈춘다 — 「나가는 길」
 *   불빛       부엌의 작은 불꽃 — 「불이 났을 때」
 *   친구들     소방복의 일구·웅이·영이가 앞자리에서 손을 흔들고, 뛰고, 길을 가리킨다 — 「어린이가 함께」
 *
 * 렌더링: 코드로 만든 스튜디오 반사광(RoomEnvironment) · 부드러운 그림자(PCSS) · 구석 그늘(AO) · 빛번짐 ·
 * 미니어처 초점 흐림 · 비네트 · 떠다니는 빛 알갱이. 자산 파일은 없다(작업지침 §10-13).
 * 움직임 줄이기면 다 그린 장면에서 멈춘다. 붉은 점멸은 없다(§10-10). 느린 PC 는 후처리를 끄고 같은 장면을 그린다.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, RoundedBox, SoftShadows } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TEMPLATES } from '../../content';
import { preparePlan } from '../../core/plan/prepare';
import { suggestedRoute } from '../../store/kidsStore';
import { defaultProfile } from '../../types/save';
import { isRoom, type Cell } from '../../types/plan';
import { interleavedGeometry } from './bridge';
import { buildHouse, planExtent } from './geometry';
import { guessQuality, prefersReducedMotion } from './quality';

interface Props {
  /** 첫 장면이 그려지면 부른다 — 화면이 그림 배경에서 3D 로 부드럽게 넘어간다 */
  onReady?: () => void;
}

const CAMERA_YAW = -0.6;
const BG_TOP = '#bcd8ef';
const BG_BOTTOM = '#efe8dd';

/* ------------------------------------------------------------ 장면 자료 */

function useDiorama() {
  return useMemo(() => {
    const template = TEMPLATES.find((t) => t.id === 'apt_2room') ?? TEMPLATES[0];
    const plan = preparePlan(template.plan, { openKitchen: true });
    const route = suggestedRoute({ plan, hazardId: 'fire', routeSlot: 'primary', profile: defaultProfile(), routes: {} });
    const extent = planExtent(plan);
    const kitchen = plan.blocks.find((b) => isRoom(b) && b.roomKind === 'kitchen');
    const fire = kitchen && isRoom(kitchen) ? { x: kitchen.rect.x + kitchen.rect.w * 0.3, z: kitchen.rect.y + kitchen.rect.h * 0.35 } : null;
    return { plan, route, extent, fire };
  }, []);
}

/** 칸 목록 → 꺾인 길. 같은 방향 점은 합치고, 마지막은 문 밖 「만나는 곳」까지 */
function routeCurve(route: Cell[], lift: number): { path: THREE.CurvePath<THREE.Vector3>; end: THREE.Vector3 } | null {
  if (route.length < 2) return null;
  const pts = route.map((c) => new THREE.Vector3(c.x + 0.5, lift, c.y + 0.5));
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  const out = b.clone().add(b.clone().sub(a).normalize().multiplyScalar(3.6));
  pts.push(out);
  const simple: THREE.Vector3[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i += 1) {
    const d1 = pts[i].clone().sub(simple[simple.length - 1]).normalize();
    const d2 = pts[i + 1].clone().sub(pts[i]).normalize();
    if (d1.dot(d2) < 0.999) simple.push(pts[i]);
  }
  simple.push(out);
  const path = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 0; i < simple.length - 1; i += 1) path.add(new THREE.LineCurve3(simple[i], simple[i + 1]));
  return { path, end: out };
}

/* ------------------------------------------------------------ 텍스처 */

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d') as CanvasRenderingContext2D);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function gridPaperTexture(): THREE.CanvasTexture {
  const t = canvasTexture(1024, 1024, (g) => {
    g.fillStyle = '#fdfdfc';
    g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i <= 32; i += 1) {
      const major = i % 4 === 0;
      g.strokeStyle = major ? 'rgba(96, 150, 196, 0.42)' : 'rgba(130, 175, 214, 0.2)';
      g.lineWidth = major ? 2.6 : 1.2;
      g.beginPath();
      g.moveTo(i * 32, 0);
      g.lineTo(i * 32, 1024);
      g.moveTo(0, i * 32);
      g.lineTo(1024, i * 32);
      g.stroke();
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

function patchTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 128, (g) => {
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
  });
}

function crayonLabelTexture(color: string): THREE.CanvasTexture {
  return canvasTexture(256, 64, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(0, 8, 256, 3);
    g.fillRect(0, 53, 256, 3);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = 0; x < 256; x += 32) {
      g.beginPath();
      g.ellipse(x + 16, 32, 9, 15, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/* ------------------------------------------------------------ 스튜디오 — 반사광 · 배경 · 바닥 */

function StudioLight({ intensity }: { intensity: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
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

function GradientBackdrop() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color(BG_TOP) }, bottom: { value: new THREE.Color(BG_BOTTOM) } },
        vertexShader: 'varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float vY; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.55, vY)), 1.0); }',
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh material={mat} renderOrder={-1}>
      <sphereGeometry args={[400, 32, 20]} />
    </mesh>
  );
}

/** 바닥은 배경색과 같아 끝이 보이지 않고, 그림자만 받는다 */
function StudioFloor({ cx, cz }: { cx: number; cz: number }) {
  return (
    <group position={[cx, -1.2, cz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[300, 64]} />
        <meshBasicMaterial color={BG_BOTTOM} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <circleGeometry args={[120, 64]} />
        <shadowMaterial transparent opacity={0.2} />
      </mesh>
    </group>
  );
}

/** 떠다니는 빛 알갱이 — 아주 느리게 */
function Motes({ cx, cz, span, reduced }: { cx: number; cz: number; span: number; reduced: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const n = 120;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      const a = (i * 2.399963) % (Math.PI * 2);
      const r = span * 0.4 + ((i * 37) % 100) / 100 * span * 1.1;
      pos[i * 3] = cx + Math.cos(a) * r;
      pos[i * 3 + 1] = 1 + ((i * 53) % 100) / 100 * span * 0.7;
      pos[i * 3 + 2] = cz + Math.sin(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [cx, cz, span]);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame(({ clock }) => {
    if (!ref.current || reduced) return;
    ref.current.rotation.y = clock.elapsedTime * 0.012;
    ref.current.position.y = Math.sin(clock.elapsedTime * 0.3) * 0.4;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial color="#fff6dc" size={0.22} sizeAttenuation transparent opacity={0.75} depthWrite={false} />
    </points>
  );
}

/* ------------------------------------------------------------ 받침 · 모눈종이 · 집 */

function Plinth({ cx, cz, w, d }: { cx: number; cz: number; w: number; d: number }) {
  const tex = useMemo(() => {
    const t = gridPaperTexture();
    t.repeat.set((w + 5) / 16, (d + 5) / 16);
    return t;
  }, [w, d]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group position={[cx, 0, cz]}>
      <RoundedBox args={[w + 8, 1.1, d + 8]} radius={0.5} smoothness={6} position={[0, -0.62, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color="#e9edf2" roughness={0.42} clearcoat={0.4} clearcoatRoughness={0.3} />
      </RoundedBox>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.055, 0]} receiveShadow>
        <planeGeometry args={[w + 5, d + 5]} />
        <meshStandardMaterial map={tex} roughness={0.9} envMapIntensity={0.35} />
      </mesh>
    </group>
  );
}

function HouseModel({ plan }: { plan: ReturnType<typeof useDiorama>['plan'] }) {
  const parts = useMemo(() => buildHouse(plan), [plan]);
  const walls = useMemo(() => interleavedGeometry(parts.walls), [parts]);
  const furniture = useMemo(() => interleavedGeometry(parts.furniture), [parts]);
  const glass = useMemo(() => interleavedGeometry(parts.glass), [parts]);
  useEffect(() => () => [walls, furniture, glass].forEach((g) => g.dispose()), [walls, furniture, glass]);
  return (
    <group scale={[1, 0.3, 1]}>
      <mesh geometry={walls} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.86} envMapIntensity={0.75} />
      </mesh>
      <mesh geometry={furniture} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.6} envMapIntensity={0.8} />
      </mesh>
      <mesh geometry={glass}>
        <meshPhysicalMaterial color="#d6eeff" transparent opacity={0.45} roughness={0.05} clearcoat={1} />
      </mesh>
    </group>
  );
}

/** 부엌의 작은 불꽃 — 일렁이지만 깜빡이지 않는다 */
function KitchenFlame({ at, reduced }: { at: { x: number; z: number }; reduced: boolean }) {
  const outer = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = reduced ? 0 : clock.elapsedTime;
    outer.current?.scale.set(1, 1 + Math.sin(t * 7.3) * 0.07 + Math.sin(t * 11.1) * 0.04, 1);
    inner.current?.scale.set(1, 1 + Math.sin(t * 9.4 + 1) * 0.08, 1);
  });
  return (
    <group position={[at.x, 0.15, at.z]}>
      <mesh ref={outer} position={[0, 0.7, 0]}>
        <coneGeometry args={[0.5, 1.4, 28]} />
        <meshStandardMaterial color="#ff7a1a" emissive="#ff6a00" emissiveIntensity={2.6} transparent opacity={0.92} />
      </mesh>
      <mesh ref={inner} position={[0, 0.5, 0.05]}>
        <coneGeometry args={[0.26, 0.85, 24]} />
        <meshStandardMaterial color="#ffe6a0" emissive="#ffd25c" emissiveIntensity={3.2} />
      </mesh>
      <pointLight color="#ff8a3d" intensity={7} distance={7} decay={2} position={[0, 1, 0]} />
    </group>
  );
}

/* ------------------------------------------------------------ 크레용 · 그려지는 길 · 만나는 곳 */

function Crayon({ color, length = 5.2, radius = 0.44 }: { color: string; length?: number; radius?: number }) {
  const label = useMemo(() => crayonLabelTexture(color), [color]);
  useEffect(() => () => label.dispose(), [label]);
  return (
    <group>
      <mesh position={[0, length * 0.5, 0]} castShadow>
        <cylinderGeometry args={[radius, radius, length, 32]} />
        <meshPhysicalMaterial color={color} roughness={0.3} clearcoat={0.5} clearcoatRoughness={0.3} />
      </mesh>
      <mesh position={[0, length * 0.48, 0]}>
        <cylinderGeometry args={[radius + 0.015, radius + 0.015, length * 0.6, 32, 1, true]} />
        <meshStandardMaterial map={label} roughness={0.75} />
      </mesh>
      <mesh position={[0, length + 0.34, 0]} castShadow>
        <cylinderGeometry args={[radius * 0.32, radius, 0.68, 32]} />
        <meshPhysicalMaterial color={color} roughness={0.28} clearcoat={0.6} />
      </mesh>
    </group>
  );
}

const DRAW_SECONDS = 5.6;
const HOLD_SECONDS = 3;

function DrawnRoute({ route, reduced }: { route: Cell[]; reduced: boolean }) {
  const curve = useMemo(() => routeCurve(route, 0.34), [route]);
  const tube = useMemo(() => {
    if (!curve) return null;
    const segments = 360;
    const radial = 16;
    const geo = new THREE.TubeGeometry(curve.path as unknown as THREE.Curve<THREE.Vector3>, segments, 0.25, radial, false);
    return { geo, segments, radial };
  }, [curve]);
  const arrows = useMemo(() => {
    if (!curve) return [];
    const n = Math.max(4, Math.floor(curve.path.getLength() / 2.8));
    return Array.from({ length: n }, (_, i) => (i + 0.5) / n);
  }, [curve]);
  useEffect(() => () => tube?.geo.dispose(), [tube]);
  const crayon = useRef<THREE.Group>(null);
  const head = useRef<THREE.Mesh>(null);
  const flag = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const arrowRefs = useRef<(THREE.Mesh | null)[]>([]);
  const t0 = useRef<number | null>(null);

  useFrame(({ clock }) => {
    if (!tube || !curve) return;
    if (t0.current === null) t0.current = clock.elapsedTime;
    const cycle = DRAW_SECONDS + HOLD_SECONDS;
    const t = reduced ? DRAW_SECONDS + 1 : (clock.elapsedTime - t0.current) % cycle;
    const k = Math.min(1, t / DRAW_SECONDS);
    const eased = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    tube.geo.setDrawRange(0, Math.floor(eased * tube.segments) * tube.radial * 6);
    const p = curve.path.getPointAt(Math.max(0.0005, Math.min(0.9995, eased)));
    if (crayon.current) {
      const lift = k >= 1 ? Math.min(1, (t - DRAW_SECONDS) * 1.6) : 0;
      crayon.current.position.set(p.x, p.y + lift * 1.6, p.z);
    }
    if (head.current) {
      head.current.position.set(p.x, p.y + 0.02, p.z);
      head.current.visible = k < 1;
    }
    arrowRefs.current.forEach((m, i) => {
      if (!m) return;
      const flow = k >= 1 && !reduced ? (clock.elapsedTime * 0.07) % (1 / arrows.length) : 0;
      const u = Math.min(0.999, arrows[i] + flow);
      m.visible = u < eased - 0.02;
      if (!m.visible) return;
      const q = curve.path.getPointAt(u);
      const tan = curve.path.getTangentAt(u);
      m.position.set(q.x, q.y + 0.22, q.z);
      m.rotation.set(Math.PI / 2, 0, -Math.atan2(tan.x, tan.z) + Math.PI);
    });
    if (flag.current) {
      const show = Math.max(0, Math.min(1, (eased - 0.9) / 0.1));
      flag.current.scale.setScalar(0.001 + show);
    }
    if (ring.current && !reduced) ring.current.rotation.z = clock.elapsedTime * 0.5;
  });

  if (!tube || !curve) return null;
  return (
    <group>
      <mesh geometry={tube.geo} castShadow>
        <meshPhysicalMaterial color="#ff2f3d" emissive="#ff2a2a" emissiveIntensity={0.7} roughness={0.3} clearcoat={0.9} clearcoatRoughness={0.2} />
      </mesh>
      {arrows.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            arrowRefs.current[i] = m;
          }}
        >
          <coneGeometry args={[0.17, 0.36, 3]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.7} />
        </mesh>
      ))}
      <mesh ref={head}>
        <sphereGeometry args={[0.36, 24, 18]} />
        <meshStandardMaterial color="#ffd2c9" emissive="#ff5a4a" emissiveIntensity={2.4} transparent opacity={0.85} />
      </mesh>
      {/* 길을 긋는 크레용 */}
      <group ref={crayon}>
        <group rotation={[0.2, -0.6, -0.6]}>
          <group rotation={[0, 0, Math.PI]} position={[0, 0.9, 0]}>
            <Crayon color="#ec2d38" />
          </group>
        </group>
      </group>
      {/* 만나는 곳 */}
      <group ref={flag} position={[curve.end.x, 0, curve.end.z]}>
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
          <ringGeometry args={[1.05, 1.38, 56, 1, 0, Math.PI * 1.75]} />
          <meshStandardMaterial color="#22b573" emissive="#1fbf6f" emissiveIntensity={1.1} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <circleGeometry args={[0.98, 48]} />
          <meshStandardMaterial color="#e4f8ed" roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.6, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 3.2, 14]} />
          <meshStandardMaterial color="#eef1f4" metalness={0.75} roughness={0.22} />
        </mesh>
        <mesh position={[0, 3.25, 0]}>
          <sphereGeometry args={[0.14, 16, 12]} />
          <meshStandardMaterial color="#ffd23f" metalness={0.6} roughness={0.25} />
        </mesh>
        <mesh position={[0.64, 2.75, 0]} castShadow>
          <boxGeometry args={[1.24, 0.8, 0.05]} />
          <meshStandardMaterial color="#1fa865" roughness={0.5} />
        </mesh>
        <Html position={[0, 3.9, 0]} center distanceFactor={26} zIndexRange={[2, 0]} className="k-hero-tag safe">
          만나는 곳
        </Html>
      </group>
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
    <group ref={root} position={position} rotation={[0, CAMERA_YAW, 0]} scale={1.9}>
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

/* ------------------------------------------------------------ 카메라 */

function CameraRig({ center, span, reduced }: { center: THREE.Vector3; span: number; reduced: boolean }) {
  const { camera, size, pointer } = useThree();
  const look = useMemo(() => center.clone().add(new THREE.Vector3(0, 0.6, 0)), [center]);
  /* 카드가 오른쪽이라 장면은 화면 왼쪽 가운데에 온다 */
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const shift = size.width > 1100 ? 0.19 : 0.13;
    camera.setViewOffset(size.width, size.height, size.width * shift, size.height * 0.08, size.width, size.height);
    camera.updateProjectionMatrix();
    return () => camera.clearViewOffset();
  }, [camera, size.width, size.height]);
  useFrame(({ clock }) => {
    const t = reduced ? 0 : clock.elapsedTime;
    const dist = span * 1.9 + 16;
    const yaw = CAMERA_YAW + Math.sin(t * 0.16) * 0.1 + (reduced ? 0 : pointer.x * 0.07);
    const pitch = 0.44 + Math.sin(t * 0.11) * 0.02 + (reduced ? 0 : pointer.y * 0.03);
    camera.position.set(look.x + Math.sin(yaw) * Math.cos(pitch) * dist, look.y + Math.sin(pitch) * dist, look.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(look);
  });
  return null;
}

/* ------------------------------------------------------------ 장면 */

function Scene({ reduced, rich }: { reduced: boolean; rich: boolean }) {
  const { plan, route, extent, fire } = useDiorama();
  const cx = (extent.minX + extent.maxX) / 2;
  const cz = (extent.minZ + extent.maxZ) / 2;
  const w = extent.maxX - extent.minX;
  const d = extent.maxZ - extent.minZ;
  const span = Math.max(w, d);
  const center = useMemo(() => new THREE.Vector3(cx, 0, cz), [cx, cz]);
  const patch = useMemo(() => patchTexture(), []);
  useEffect(() => () => patch.dispose(), [patch]);

  /* 친구들 — 받침 앞 바닥, 집의 왼쪽 앞에 나란히 서서 이쪽을 본다 */
  const buddies = useMemo(() => {
    const toCam = new THREE.Vector2(Math.sin(CAMERA_YAW), Math.cos(CAMERA_YAW));
    const side = new THREE.Vector2(toCam.y, -toCam.x);
    const anchor = new THREE.Vector2(cx, cz).add(toCam.clone().multiplyScalar(span * 0.5 + 7.5)).add(side.clone().multiplyScalar(-span * 0.08));
    const list: { kind: BuddyKind; action: BuddyAction; phase: number; along: number; depth: number }[] = [
      { kind: 'ilgu', action: 'wave', phase: 0, along: -3.6, depth: 0 },
      { kind: 'woong', action: 'hop', phase: 0.8, along: 0, depth: 1.3 },
      { kind: 'young', action: 'point', phase: 1.6, along: 3.6, depth: 0.1 },
    ];
    return list.map((b) => {
      const p = anchor.clone().add(side.clone().multiplyScalar(b.along)).add(toCam.clone().multiplyScalar(b.depth));
      return { ...b, position: [p.x, -1.2, p.y] as [number, number, number] };
    });
  }, [cx, cz, span]);

  return (
    <>
      <GradientBackdrop />
      <fog attach="fog" args={[BG_BOTTOM, span * 3, span * 9]} />
      <StudioLight intensity={0.32} />
      {rich && <SoftShadows size={24} samples={16} focus={0.7} />}
      <hemisphereLight args={['#ffffff', '#e9dcc5', 0.35]} />
      <directionalLight
        position={[cx - span * 0.8, span * 1.5, cz - span * 0.6]}
        intensity={1.9}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-span * 1.4}
        shadow-camera-right={span * 1.4}
        shadow-camera-top={span * 1.4}
        shadow-camera-bottom={-span * 1.4}
        shadow-camera-near={1}
        shadow-camera-far={span * 6}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[cx + span, span * 0.6, cz + span]} intensity={0.5} color="#d9e9ff" />
      <directionalLight position={[cx + span * 0.5, span * 0.7, cz - span * 1.5]} intensity={0.9} color="#ffe6c8" />

      <StudioFloor cx={cx} cz={cz} />
      <Plinth cx={cx} cz={cz} w={w} d={d} />
      <HouseModel plan={plan} />
      {fire && <KitchenFlame at={fire} reduced={reduced} />}
      <DrawnRoute route={route} reduced={reduced} />
      {buddies.map((b) => (
        <FireBuddy key={b.kind} kind={b.kind} action={b.action} position={b.position} reduced={reduced} phase={b.phase} patch={patch} />
      ))}
      <Motes cx={cx} cz={cz} span={span} reduced={reduced} />
      <CameraRig center={center} span={span} reduced={reduced} />

      {rich && (
        <EffectComposer multisampling={4}>
          <N8AO aoRadius={1.4} intensity={2} distanceFalloff={0.8} quality="medium" />
          <Bloom luminanceThreshold={1.0} luminanceSmoothing={0.2} intensity={0.45} mipmapBlur />
          <Vignette offset={0.34} darkness={0.32} eskil={false} />
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
      camera={{ fov: 30, near: 0.5, far: 900, position: [20, 18, 24] }}
      gl={{ antialias: !rich, powerPreference: 'high-performance', alpha: false, stencil: false }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.AgXToneMapping;
        gl.toneMappingExposure = 0.92;
        requestAnimationFrame(() => requestAnimationFrame(() => onReady?.()));
      }}
    >
      <Scene reduced={reduced} rich={rich} />
    </Canvas>
  );
}
