/**
 * 3D 다시 보기 — 연습 기록을 종이 모형 같은 집에서 다시 튼다.
 * 바깥 자산 없이 전부 코드로 만든다. `three` 는 이 폴더 밖에서 부르지 않는다.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { DrillState, Snapshot } from '../../core/drill';
import { fitFurniture, type Footprint } from '../../core/furnish';
import { doorSize, doorSwing } from '../../core/doors';
import { analyze, cellIdAt, edgeSides } from '../../core/grid';
import { pointAlong, polylineLength, routePoints } from '../../core/path';
import { OUT, type Cell, type Layout, type Plan, type Pt } from '../../core/types';
import { ITEMS } from '../../content/items';
import { FIRE } from '../../content/fire';
import type { LookId } from '../../content/names';
import { host as platform } from '../../platform/host';
import { getApp } from '../../store/app';
import { IconClose, IconPlay } from '../art';
import { KID_ANKLE, KID_HIP, KID_HIP_LOW, PALM_AT_MOUTH, applyPose, blendPose, handFacing, makeKid, newPose, solveLimb, swingArm, waveCloth } from './kid';

/**
 * 벽과 문의 높이(대장 #177). 아이 키(0.68)가 벽의 절반쯤, 어른(0.87)이 문보다 조금 작게 보이도록
 * 진짜 집의 비율(천장 2.3m · 문 2m · 초등학생 1.2~1.4m)에 맞췄다. 예전 벽은 0.72 로 아이 키와 비슷했다.
 */
const WALL_H = 1.3;
const DOOR_H = 1.08;
const WALL_T = 0.09;
/** 한 칸 걷는 데 걸리는 초. 아이 눈높이에서 무엇이 지나가는지 볼 수 있을 만큼 천천히 걷는다 */
const SEG_SECONDS = 1.05;
/** 가족 앞에서 멈출 거리. 더 다가가면 얼굴이 화면 밖으로 나가고 몸통만 보인다 */
const FAMILY_STOP = 1.3;
/** 끝 장면에 머무는 초 — 가족 앞에 서서 축포를 본다(대장 #159) */
const END_HOLD = 6.6;
/** 가족 앞에 선 지 1초 뒤부터 축포가 터진다 */
const PARTY_SECONDS = END_HOLD - 1;
/** 축포 한 송이가 솟아올라 터지고 사라지기까지의 초, 그 가운데 솟아오르는 초 */
const BURST_PERIOD = 3.2;
const BURST_RISE = 0.5;

interface Props {
  plan: Plan;
  drill: DrillState;
  look: LookId;
  onClose: () => void;
}

interface Timed {
  snap: Snapshot;
  from: number;
  to: number;
  length: number;
}

/** 기록을 시간표로 바꾼다 */
function buildTimes(timeline: Snapshot[]): { list: Timed[]; total: number } {
  let t = 1;
  const list: Timed[] = [];
  for (const snap of timeline) {
    const length = polylineLength(snap.walk);
    const dur = snap.walk.length < 2 ? 0.2 : Math.max(1.2, length * SEG_SECONDS);
    list.push({ snap, from: t, to: t + dur, length });
    t += dur;
  }
  return { list, total: t + END_HOLD };
}

function material(color: number, roughness = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** 색칠한 종이 결 — 코드로 굽는다 */
function crayonTexture(base: string, stripe: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = stripe;
  g.lineWidth = 6;
  g.globalAlpha = 0.55;
  for (let i = -128; i < 256; i += 20) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 80, 128);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 조각들의 바닥을 한 덩어리로 만든다. 조각은 볼록해서 부채꼴로 나누면 된다. 점이 촘촘해도 그리기 부담이 늘지 않는다 */
function piecesFloor(polygons: Pt[][]): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  for (const polygon of polygons) {
    const first = polygon[0]!;
    for (let i = 1; i < polygon.length - 1; i++) {
      for (const p of [first, polygon[i + 1]!, polygon[i]!]) {
        positions.push(p.x, 0, p.y);
        uvs.push(p.x, p.y);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** 열린 문짝이 벽과 이루는 각도. 내 시점에서 앞을 막지 않게 벽에 거의 수직으로 활짝 연다 */
const DOOR_OPEN = 1.5;

/** 가구 한 벌. 등이 -z 이고 앞이 +z 이며, 가운데가 원점이다 */
interface FurnitureSet extends Footprint {
  /** [폭, 높이, 깊이, 색, 거칠기, x, y, z] */
  parts: [number, number, number, number, number, number, number, number][];
}

const BED: FurnitureSet = {
  w: 0.62,
  d: 0.9,
  parts: [
    [0.62, 0.2, 0.85, 0xf4f0e4, 0.85, 0, 0.12, 0.025],
    [0.62, 0.1, 0.34, 0x8cb7d9, 0.85, 0, 0.26, -0.195],
    [0.62, 0.3, 0.05, 0x9a7a55, 0.85, 0, 0.17, -0.425],
  ],
};

/** 칸 이름 → 넓은 칸의 가구, 좁은 칸의 가구 */
const FURNITURE: Record<string, FurnitureSet[]> = {
  bed: [BED],
  kitchen: [
    {
      w: 0.8,
      d: 0.95,
      parts: [
        [0.8, 0.42, 0.34, 0xe8e2d0, 0.85, 0, 0.21, -0.305],
        [0.6, 0.3, 0.6, 0xb98a5e, 0.85, 0, 0.15, 0.175],
      ],
    },
    { w: 0.8, d: 0.34, parts: [[0.8, 0.42, 0.34, 0xe8e2d0, 0.85, 0, 0.21, 0]] },
  ],
  bath: [{ w: 0.3, d: 0.42, parts: [[0.3, 0.3, 0.42, 0xffffff, 0.4, 0, 0.15, 0]] }],
  living: [
    {
      w: 0.85,
      d: 0.78,
      parts: [
        [0.85, 0.22, 0.34, 0x7fa3c7, 0.85, 0, 0.11, -0.18],
        [0.85, 0.34, 0.1, 0x6f93b6, 0.85, 0, 0.17, -0.34],
        [0.46, 0.14, 0.3, 0xb98a5e, 0.85, 0, 0.07, 0.24],
      ],
    },
    {
      w: 0.85,
      d: 0.38,
      parts: [
        [0.85, 0.22, 0.34, 0x7fa3c7, 0.85, 0, 0.11, 0.02],
        [0.85, 0.34, 0.1, 0x6f93b6, 0.85, 0, 0.17, -0.14],
      ],
    },
  ],
  veranda: [{ w: 0.3, d: 0.3, parts: [[0.3, 0.3, 0.3, 0x6aa76a, 0.85, 0, 0.15, 0]] }],
};

const FURNITURE_OF: Record<string, string> = { main: 'bed', myroom: 'bed', other: 'bed', kitchen: 'kitchen', bath: 'bath', living: 'living', veranda: 'veranda', utility: 'veranda' };

/**
 * 칸 이름에 맞는 가구를 저절로 놓는다. 아이가 고를 일을 늘리지 않는다.
 * 칸 모양에 맞춰 등을 벽에 대고 크기를 줄이므로 세모 칸에도 들어간다. 지나는 길은 비운다.
 */
function furnish(group: THREE.Group, plan: Plan, layout: Layout, cell: Cell, keepClear: Pt[][]): boolean {
  const unit = plan.density ?? 1;
  const name = cell.name ?? (cell.kind === 'room' ? 'main' : null);
  const sets = name ? FURNITURE[FURNITURE_OF[name] ?? ''] : undefined;
  if (!sets) return false;
  for (const [i, set] of sets.entries()) {
    // 작은 한 벌이 남아 있으면 큰 한 벌은 너무 줄이지 않는다
    const scales = i < sets.length - 1 ? [1, 0.85, 0.7] : [1, 0.85, 0.7, 0.55, 0.45];
    const spot = fitFurniture(plan, layout, cell, set, { keepClear, scales, unit });
    if (!spot) continue;
    const piece = new THREE.Group();
    piece.position.set(spot.x / unit, 0, spot.y / unit);
    piece.rotation.y = Math.atan2(spot.front.x, spot.front.y) + (spot.sideways ? Math.PI / 2 : 0);
    piece.scale.setScalar(spot.scale);
    for (const [w, h, d, color, rough, x, y, z] of set.parts) piece.add(box(w, h, d, material(color, rough), x, y, z));
    group.add(piece);
    return true;
  }
  return false;
}

/** 불꽃 — 노이즈 셰이더로 흔들린다 */
function makeFlameMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uSeed: { value: Math.random() * 10 } },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime; uniform float uSeed;
      float n(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float sm(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(n(i), n(i + vec2(1, 0)), f.x), mix(n(i + vec2(0, 1)), n(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec2 uv = vUv;
        float wob = sm(vec2(uv.x * 3.0 + uSeed, uv.y * 3.0 - uTime * 1.4)) - 0.5;
        float x = (uv.x - 0.5) + wob * 0.32 * uv.y;
        // 아래가 둥글고 위로 갈수록 가늘어지는 눈물방울
        float width = min(0.42, 0.42 * sqrt(max(uv.y, 0.0) * 5.0) * pow(max(1.0 - uv.y, 0.0), 1.1));
        float shape = 1.0 - smoothstep(width * 0.55, width + 0.02, abs(x));
        shape *= smoothstep(0.0, 0.05, uv.y);
        vec3 outer = vec3(0.97, 0.45, 0.10);
        vec3 inner = vec3(1.0, 0.86, 0.38);
        float core = 1.0 - smoothstep(0.0, width * 0.75 + 0.01, abs(x));
        vec3 col = mix(outer, inner, core * (1.0 - uv.y * 0.45));
        gl_FragColor = vec4(col, shape);
      }
    `,
  });
}

function smokeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, 'rgba(70,72,78,.85)');
  r.addColorStop(1, 'rgba(70,72,78,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** 축포의 불씨 — 가운데가 밝고 가장자리가 흐린 동그라미 */
function sparkTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,.9)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** 아이 키 — 어른(0.87)보다 한 뼘 넘게 작다. 눈은 머리 가운데쯤이다 */
const KID_SCALE = 1.05;
const KID_EYE = 0.56;
/** 집 안에서는 허리를 숙이고 가므로 눈이 조금 낮다. 몸을 낮추면 더 낮다 */
const KID_EYE_BENT = 0.5;
const KID_EYE_LOW = 0.34;
/** 숙이는 각도(라디안) — 집 안에서 걸을 때와, 연기 속에서 몸을 낮췄을 때 */
const KID_BEND = 0.6;
const KID_BEND_LOW = 0.95;
/** 뒤에서 보는 자리 — 아이 바로 뒤, 눈높이에서 어깨 너머로 본다 */
const CAM_BACK = 0.8;
const CAM_SIDE = 0.22;
/** 가족 앞에서 내가 멈추는 거리. 뒤에서 보는 눈과 가족 사이에 선다 */
const KID_STOP = 0.75;
/** 벽 짚기(대장 #186) — 옆으로 이만큼 안에 벽이 있으면 짚으러 간다. 벽에서 이만큼 떨어져 걷고, 붙는 거리는 이만큼까지다 */
const HUG_LOOK = 0.8;
const HUG_GAP = 0.28;
const HUG_MAX = 0.25;
/** 낮은 가구와 몸 사이에 남기는 틈 · 손이 닿는 거리 */
const KID_CLEAR = 0.17;
const HUG_REACH = 0.36;
const CAM_RISE = 0.08;

export default function Replay3D({ plan, drill, look, onClose }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [caption, setCaption] = useState('내 자리에서 시작');
  const [ended, setEnded] = useState(false);
  // 기본은 내 바로 뒤에서 내 눈높이로 보고, 위쪽 단추를 누르면 위에서 집 전체를 본다
  const [fromAbove, setFromAbove] = useState(false);
  const aboveRef = useRef(false);
  const restart = useRef<() => void>(() => undefined);

  const applyView = useRef<(above: boolean) => void>(() => undefined);
  useEffect(() => {
    aboveRef.current = fromAbove;
    applyView.current(fromAbove);
  }, [fromAbove]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const mount = host.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      setFailed(true);
      return;
    }
    const layout = analyze(plan);
    // 그림은 처음 네모 단위로 짓는다. 점 간격을 좁혀도 집과 가구의 크기는 그대로다
    const density = plan.density ?? 1;
    const world = (p: Pt): Pt => ({ x: p.x / density, y: p.y / density });
    const planCols = plan.cols / density;
    const planRows = plan.rows / density;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 크레용 색이 탁해지지 않게 색을 그대로 낸다
    renderer.toneMapping = THREE.NoToneMapping;
    mount.appendChild(renderer.domElement);
    renderer.domElement.dataset.testid = 'replay-canvas';

    const scene = new THREE.Scene();
    // 하늘 — 낮 하늘이다가, 가족을 만나 축포가 터질 때 천천히 저녁 하늘로 어두워져 머문다(번쩍이지 않는다)
    const skyDay = new THREE.Color(0xcfe6f3);
    const skyDusk = new THREE.Color(0x1c2b4f);
    const sky = skyDay.clone();
    scene.background = sky;
    const fog = new THREE.Fog(0xcfe6f3, 22, 48);
    scene.fog = fog;

    const cx = planCols / 2;
    const cz = planRows / 2;
    const camera = new THREE.PerspectiveCamera(42, 1, 0.03, 100);
    // 벽이 높아 비스듬히 보면 방 안이 가려진다. 위에서 보기는 더 높이 올라가 내려다본다
    const home = new THREE.Vector3(cx, Math.max(planCols, planRows) * 1.1, cz + Math.max(planCols, planRows) * 0.55);
    camera.position.copy(home);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cx, 0, cz + 0.9);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.minDistance = 3;
    controls.maxDistance = 30;

    const hemi = new THREE.HemisphereLight(0xffffff, 0xdfe8cf, 1.75);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.5);
    sun.position.set(cx - 6, 14, cz + 5);
    sun.target.position.set(cx, 0, cz);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const span = Math.max(planCols, planRows) + 4;
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 40 });
    sun.shadow.radius = 4;
    scene.add(sun, sun.target);

    // 마당
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), material(0xa9d48c, 1));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(cx, -0.03, cz);
    grass.receiveShadow = true;
    scene.add(grass);

    // 바닥
    const roomTex = crayonTexture('#ffe3a3', '#fcc75f');
    const passTex = crayonTexture('#c6e8f8', '#8cccec');
    const newTex = crayonTexture('#f4efdc', '#e4dcbd');
    const floorMat = {
      room: new THREE.MeshStandardMaterial({ map: roomTex, roughness: 0.95 }),
      pass: new THREE.MeshStandardMaterial({ map: passTex, roughness: 0.95 }),
      none: new THREE.MeshStandardMaterial({ map: newTex, roughness: 0.95 }),
    };
    for (const kind of ['room', 'pass', 'none'] as const) {
      const polygons = layout.cells
        .filter((cell) => (cell.kind ?? 'none') === kind)
        .flatMap((cell) => cell.squares.map((s) => s.polygon.map(world)));
      if (polygons.length === 0) continue;
      const m = new THREE.Mesh(piecesFloor(polygons), floorMat[kind]);
      m.receiveShadow = true;
      scene.add(m);
    }

    // 벽 · 문 · 창
    const wallMat = material(0xfbf7ea, 0.9);
    const trimMat = material(0x33363b, 0.8);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd0ea, transparent: true, opacity: 0.45, roughness: 0.15 });
    const doorPanels = new Map<string, THREE.Object3D>();
    // 문마다 열린 각도. 지도에서 바꾼 문짝 방향을 그대로 따른다(대장 #168)
    const doorAngles = new Map<string, number>();
    const doorMat = material(0x9a5b2a);
    const exitMat = material(0x2e8b57);
    const walls = new THREE.Group();
    scene.add(walls);
    const openSet = new Set(layout.openEdges);
    for (const run of layout.runs) {
      const a = world(run.a);
      const b = world(run.b);
      // 벽을 가로로 놓고 만든 뒤 제 방향으로 돌린다
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const wall = new THREE.Group();
      wall.position.set((a.x + b.x) / 2, 0, (a.y + b.y) / 2);
      wall.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
      walls.add(wall);
      const piece = (len: number, h: number, y: number, off: number, mat: THREE.Material) => box(len, h, WALL_T, mat, off, y, 0);
      // 위쪽 테두리는 벽이 있는 데에만 얹는다. 트인 곳 위에는 아무것도 없다
      const trim = (start: number, end: number) => {
        if (end - start > 0.001) wall.add(piece(end - start + WALL_T, 0.03, WALL_H + 0.015, (start + end) / 2, trimMat));
      };

      // 줄 위의 문과 창, 틈, 트인 칸끼리 맞닿은 곳. 앞 구멍과 줄 끝을 넘지 않게 폭을 맞춘다. 자리는 줄 가운데에서 잰다
      const openings = run.edges
        .filter((e) => plan.openings[e.key] || openSet.has(e.key))
        .map((e) => {
          const m = world(e.mid);
          const ea = world(e.a);
          const eb = world(e.b);
          return { edge: e.key, kind: (plan.openings[e.key] ?? 'gap') as string, at: Math.hypot(m.x - a.x, m.y - a.y) - length / 2, len: Math.hypot(eb.x - ea.x, eb.y - ea.y) };
        })
        .sort((p, q) => p.at - q.at);
      let cursor = -length / 2;
      const solid = (start: number, end: number) => {
        if (end - start > 0.001) {
          wall.add(piece(end - start + WALL_T, WALL_H, WALL_H / 2, (start + end) / 2, wallMat));
          trim(start, end);
        }
      };
      openings.forEach((o, i) => {
        const next = openings[i + 1];
        if (o.kind === 'gap') {
          // 문짝도 벽도 없이 토막 전체가 트여 있다
          const start = Math.max(cursor, o.at - o.len / 2);
          const end = Math.min(length / 2, o.at + o.len / 2);
          solid(cursor, start);
          cursor = Math.max(cursor, end);
          return;
        }
        const wanted = o.kind === 'door' ? 0.76 * doorSize(plan, o.edge) : 0.7;
        const left = Math.max(0.03, o.at - cursor - 0.06);
        const right = Math.max(0.03, Math.min(length / 2 - o.at - 0.06, next ? (next.at - o.at) / 2 - 0.03 : Infinity));
        const half = Math.min(wanted / 2, left, right);
        const start = o.at - half;
        const end = o.at + half;
        solid(cursor, start);
        cursor = end;
        const width = end - start;
        trim(start, end);
        if (o.kind === 'window') {
          // 창 — 아이 가슴 높이의 턱 위에 유리가 있고, 문 높이에서 천장까지는 벽이다
          wall.add(piece(width, 0.5, 0.25, o.at, wallMat));
          wall.add(piece(width, WALL_H - DOOR_H + 0.08, (WALL_H + DOOR_H - 0.08) / 2, o.at, wallMat));
          wall.add(piece(width, DOOR_H - 0.58, (DOOR_H + 0.42) / 2, o.at, glassMat));
        } else {
          // 문 위는 천장까지 벽이다
          wall.add(piece(width, WALL_H - DOOR_H, (WALL_H + DOOR_H) / 2, o.at, wallMat));
          const [p, q] = edgeSides(layout, o.edge);
          const isExit = layout.cellAt.has(p) !== layout.cellAt.has(q);
          // 경첩을 축으로 도는 문짝. 경첩이 어느 끝인지와 어느 쪽으로 열리는지는 지도와 같다
          const sw = doorSwing(plan, layout, o.edge);
          const hinge = world(sw.hinge);
          const hingeAt = ((hinge.x - a.x) * (b.x - a.x) + (hinge.y - a.y) * (b.y - a.y)) / length - length / 2;
          const atStart = Math.abs(hingeAt - start) <= Math.abs(hingeAt - end);
          // 벽 틀의 +z 는 줄이 가는 쪽의 오른쪽이다
          const zSide = -(b.y - a.y) * sw.toward.x + (b.x - a.x) * sw.toward.y >= 0 ? 1 : -1;
          const open = -DOOR_OPEN * zSide * (atStart ? 1 : -1);
          const pivot = new THREE.Group();
          pivot.position.set(atStart ? start : end, 0, 0);
          pivot.add(box(width, DOOR_H - 0.02, 0.05, isExit ? exitMat : doorMat, (atStart ? 1 : -1) * (width / 2), (DOOR_H - 0.02) / 2, 0));
          pivot.rotation.y = open;
          doorAngles.set(o.edge, open);
          wall.add(pivot);
          doorPanels.set(o.edge, pivot);
        }
      });
      solid(cursor, length / 2);
    }

    // 나가는 길
    const pathPoints = routePoints(plan, layout, plan.route);

    // 가구 — 걸어간 길과 나가는 길을 비운다
    const furniture = new THREE.Group();
    scene.add(furniture);
    const keepClear = [pathPoints, ...drill.timeline.map((snap) => snap.walk)];
    // 아이가 놓은 가구를 그대로 짓는다. 아무것도 놓지 않은 칸만 저절로 채운다
    const placedCells = new Set<string>();
    for (const item of plan.items ?? []) {
      const here = cellIdAt(layout, item);
      if (here) placedCells.add(here);
      const spec = ITEMS[item.kind];
      const at = world(item);
      const piece = new THREE.Group();
      piece.position.set(at.x, 0, at.y);
      piece.rotation.y = (-item.angle * Math.PI) / 180;
      piece.scale.setScalar(item.size ?? 1);
      for (const [w, h, d, color, x, y, z] of spec.parts) piece.add(box(w, h, d, material(color), x, y, z));
      furniture.add(piece);
    }
    mount.dataset.placed = String(plan.items?.length ?? 0);
    mount.dataset.wallH = String(WALL_H);
    mount.dataset.doorH = String(DOOR_H);
    const furnished = layout.cells.filter((cell) => placedCells.has(cell.id) || furnish(furniture, plan, layout, cell, keepClear)).length;
    mount.dataset.furnished = String(furnished);

    if (pathPoints.length > 1) {
      const ribbon = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0xd6402f, roughness: 0.7, emissive: 0x6a1a10, emissiveIntensity: 0.25 });
      for (let i = 1; i < pathPoints.length; i++) {
        const a = world(pathPoints[i - 1]!);
        const b = world(pathPoints[i]!);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 0.001) continue;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, 0.012, 0.1), mat);
        seg.position.set((a.x + b.x) / 2, 0.012, (a.y + b.y) / 2);
        seg.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
        ribbon.add(seg);
      }
      scene.add(ribbon);
    }

    // 안전한 곳 깃발과 가족
    const meet = plan.marks.meet ? world(plan.marks.meet) : null;
    const adults: THREE.Group[] = [];
    const family = meet ? new THREE.Vector3(meet.x + 0.57, 0.66, meet.y - 0.04) : null;
    if (meet) {
      const flag = new THREE.Group();
      flag.position.set(meet.x, 0, meet.y);
      flag.add(box(0.04, 1, 0.04, material(0x33363b), -0.55, 0.5, -0.1));
      flag.add(box(0.36, 0.22, 0.02, material(0x3e9d5d), -0.37, 0.86, -0.1));
      for (let i = 0; i < 2; i++) {
        const adult = new THREE.Group();
        adult.position.set(0.42 + i * 0.3, 0, -0.1 + i * 0.12);
        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.3, 4, 10), material(i ? 0x7b6fb0 : 0x4f8fa8));
        torso.position.y = 0.42;
        torso.castShadow = true;
        const face = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), material(0xf1c9a5));
        face.position.y = 0.76;
        face.castShadow = true;
        const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.116, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), material(i ? 0x4a2d2d : 0x2b211b));
        hairCap.position.y = 0.77;
        // 내 쪽을 바라보는 얼굴과 흔드는 손
        const eyeMat = material(0x2b211b);
        for (const side of [-1, 1]) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), eyeMat);
          eye.position.set(side * 0.04, 0.78, 0.102);
          adult.add(eye);
        }
        const smile = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI), material(0x8a3b2a));
        smile.position.set(0, 0.74, 0.104);
        smile.rotation.z = Math.PI;
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.26, 4, 8), material(i ? 0x7b6fb0 : 0x4f8fa8));
        arm.position.set(0.15, 0.68, 0);
        arm.rotation.z = -0.5;
        adult.add(torso, face, hairCap, smile, arm);
        adults.push(adult);
        flag.add(adult);
      }
      scene.add(flag);
    }

    // 나
    const kid = makeKid(look, KID_SCALE);
    scene.add(kid.root);
    // 자세 계산에 쓰는 것 — 매 장면 새로 만들지 않는다
    const swingPose = [newPose(), newPose()];
    const mouthPose = [newPose(), newPose()];
    const wallPose = [newPose(), newPose()];
    const mixPose = [newPose(), newPose()];
    const legPose = [newPose(), newPose()];
    const mouthW = [0, 0];
    const wallW = [0, 0];
    let clothShow = 0;
    // 벽 쪽으로 붙는 거리(아이의 왼쪽이 +) · 짚는 쪽(-1 · 1)
    let hug = 0;
    let wallSide: -1 | 1 = -1;
    let wallSeen = false;
    const sideRay = new THREE.Raycaster();
    const rayO = new THREE.Vector3();
    const rayD = new THREE.Vector3();
    const touch = new THREE.Vector3();
    const tmpV = new THREE.Vector3();
    const toWall = new THREE.Vector3();
    const pole = new THREE.Vector3();
    const fingers = new THREE.Vector3();
    const palm = new THREE.Vector3();
    const endQ = new THREE.Quaternion();
    const bodyInv = new THREE.Quaternion();
    const flatQ = new THREE.Quaternion();
    const hipAt = new THREE.Vector3();
    const footAt = new THREE.Vector3();
    const knee = new THREE.Vector3(0, 0, 1);
    /** 옆으로 쏜 줄이 처음 닿는 거리. 닿지 않으면 Infinity */
    const sideHit = (x: number, z: number, y: number, dx: number, dz: number, targets: THREE.Object3D[]): number => {
      rayO.set(x, y, z);
      rayD.set(dx, 0, dz);
      sideRay.set(rayO, rayD);
      sideRay.far = HUG_LOOK;
      return sideRay.intersectObjects(targets, true)[0]?.distance ?? Infinity;
    };

    // 불과 연기
    const flameMats: THREE.ShaderMaterial[] = [];
    const flames = new Map<string, THREE.Group>();
    // 불이 시작된 칸의 불꽃 — 시작한 자리에서 가까운 순서다. 값이 오를수록 하나씩 늘고 커진다
    const sourceFlames: THREE.Mesh[] = [];
    const origin = world(drill.origin ?? drill.pt);
    const smokes = new Map<string, { mat: THREE.SpriteMaterial; sprites: { s: THREE.Sprite; x: number; z: number; ph: number }[] }>();
    const smokeTex = smokeTexture();
    const flameGeo = new THREE.PlaneGeometry(0.8, 1);
    const flameMeshes: THREE.Mesh[] = [];
    for (const cell of layout.cells) {
      const fg = new THREE.Group();
      fg.visible = false;
      // 점 간격을 좁혀도 불꽃과 연기는 처음 네모마다 하나다
      const each = Math.max(1, Math.round(density));
      const spots = cell.squares.filter((s) => s.x % each === 0 && s.y % each === 0).map((s) => world(s.center));
      if (spots.length === 0) spots.push(world(cell.anchor));
      const isSource = cell.id === drill.source;
      if (isSource) spots.sort((p, q) => Math.hypot(p.x - origin.x, p.y - origin.y) - Math.hypot(q.x - origin.x, q.y - origin.y));
      spots.forEach((c, i) => {
        const mat = makeFlameMaterial();
        flameMats.push(mat);
        const flame = new THREE.Mesh(flameGeo, mat);
        const at = isSource && i === 0 ? origin : c;
        flame.position.set(at.x, 0.5, at.y);
        flameMeshes.push(flame);
        if (isSource) sourceFlames.push(flame);
        fg.add(flame);
      });
      scene.add(fg);
      flames.set(cell.id, fg);

      const sm = new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0, depthWrite: false });
      const sprites = spots.flatMap((c) =>
        [0, 1].map((i) => {
          const sprite = new THREE.Sprite(sm);
          const x = c.x - 0.2 + Math.random() * 0.4;
          const z = c.y - 0.2 + Math.random() * 0.4;
          sprite.scale.setScalar(1.1);
          scene.add(sprite);
          return { s: sprite, x, z, ph: i * 1.7 + Math.random() * 3 };
        }),
      );
      smokes.set(cell.id, { mat: sm, sprites });
    }

    const { list, total } = buildTimes(drill.timeline.map((snap) => ({ ...snap, walk: snap.walk.map(world) })));
    const finalPt: Pt = world(drill.pt);
    const levels = FIRE.low.levels;
    const clock = new THREE.Clock();
    let time = 0;
    let lastCaption = '';
    let raf = 0;
    let disposed = false;
    // 축포 — 가족을 만나면 가족 뒤 하늘 가득 터진다(대장 #142 · #159). 점 뭉치를 코드로 움직인다.
    // 폭죽이 땅에서 솟아올라 두 겹으로 터지고(둥근 꽃 · 고리 · 버들), 가족 양옆에서 불꽃 분수가 솟고, 색종이가 내린다
    const BURST_COLORS = [0xf59a23, 0x3e9d5d, 0x2f7fbf, 0xe3a62a, 0xd9558c, 0x8a5fc4, 0x4fb7c9, 0xff7f6e];
    const sparkTex = sparkTexture();
    const sparkCloud = (count: number, color: number, size: number, glow = true): THREE.Points => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
      // 불씨는 빛을 더해 어두운 하늘에서 환하게 빛난다. 색종이는 종이라 빛나지 않는다
      const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color, map: sparkTex, size, transparent: true, opacity: 0, depthWrite: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending }));
      points.visible = false;
      points.frustumCulled = false;
      scene.add(points);
      return points;
    };
    const bursts: { points: THREE.Points; inner: THREE.Points; trail: THREE.Points; dirs: Float32Array; at: THREE.Vector3; delay: number; reach: number; drop: number }[] = [];
    const fountains: { points: THREE.Points; seeds: Float32Array; at: THREE.Vector3 }[] = [];
    let confetti: { points: THREE.Points; seeds: Float32Array; at: THREE.Vector3 } | null = null;
    let cheered = false;
    let party = 0;
    if (drill.end === 'meet' && family && meet) {
      const lastStart = drill.timeline[drill.timeline.length - 1]?.walk[0];
      const from = lastStart ? world(lastStart) : { x: meet.x, y: meet.y - 1 };
      const bx = family.x - from.x;
      const bz = family.z - from.y;
      const bl = Math.hypot(bx, bz) || 1;
      // 가족에서 뒤로 `back`, 옆으로 `side` 떨어진 자리
      const spot = (back: number, side: number, y: number): THREE.Vector3 => new THREE.Vector3(family.x + (bx / bl) * back - (bz / bl) * side, y, family.z + (bz / bl) * back + (bx / bl) * side);
      const BURSTS = 18;
      for (let i = 0; i < BURSTS; i++) {
        const count = 230;
        const shape = i % 3;
        const dirs = new Float32Array(count * 3);
        for (let n = 0; n < count; n++) {
          const th = Math.random() * Math.PI * 2;
          const ph = Math.acos(2 * Math.random() - 1);
          // 고리는 납작하게, 버들은 고르게 퍼져 길게 늘어진다
          const sp = shape === 1 ? 1 : 0.7 + Math.random() * 0.4;
          dirs[n * 3] = Math.sin(ph) * Math.cos(th) * sp;
          dirs[n * 3 + 1] = Math.cos(ph) * sp * (shape === 1 ? 0.18 : 1);
          dirs[n * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
        }
        const color = BURST_COLORS[i % BURST_COLORS.length]!;
        const side = (((i * 0.618) % 1) - 0.5) * 7.5;
        const at = spot(1.6 + (i % 4) * 1.15, side, 1.7 + (i % 5) * 0.42 + (i % 2) * 0.2);
        bursts.push({
          points: sparkCloud(count, color, 0.22),
          inner: sparkCloud(90, 0xfff3c4, 0.14),
          trail: sparkCloud(12, 0xffe9a8, 0.09),
          dirs,
          at,
          delay: i * 0.26,
          reach: 1.05 + (i % 3) * 0.28,
          drop: shape === 2 ? 0.5 : 0.22,
        });
      }
      // 불꽃 분수 — 가족 양옆 땅에서 솟는다
      for (const side of [-1.5, 1.5]) {
        const count = 150;
        const seeds = new Float32Array(count * 4);
        for (let n = 0; n < count; n++) {
          seeds[n * 4] = (Math.random() - 0.5) * 0.9;
          seeds[n * 4 + 1] = 1.9 + Math.random() * 0.9;
          seeds[n * 4 + 2] = (Math.random() - 0.5) * 0.9;
          seeds[n * 4 + 3] = Math.random();
        }
        fountains.push({ points: sparkCloud(count, 0xffd76a, 0.09), seeds, at: spot(0.5, side, 0.02) });
      }
      // 색종이 — 가족 머리 위에서 천천히 내린다
      const papers = 320;
      const seeds = new Float32Array(papers * 4);
      const colors = new Float32Array(papers * 3);
      const tint = new THREE.Color();
      for (let n = 0; n < papers; n++) {
        seeds[n * 4] = (Math.random() - 0.5) * 7;
        seeds[n * 4 + 1] = Math.random();
        seeds[n * 4 + 2] = (Math.random() - 0.5) * 5;
        seeds[n * 4 + 3] = Math.random() * Math.PI * 2;
        tint.setHex(BURST_COLORS[n % BURST_COLORS.length]!);
        colors.set([tint.r, tint.g, tint.b], n * 3);
      }
      const paper = sparkCloud(papers, 0xffffff, 0.085, false);
      paper.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      (paper.material as THREE.PointsMaterial).vertexColors = true;
      confetti = { points: paper, seeds, at: spot(0.4, 0, 0) };
      mount.dataset.bursts = String(BURSTS);
    }
    // 가족 앞에서 멈춘 자리
    let held: Pt | null = null;
    restart.current = () => {
      time = 0;
      held = null;
      party = 0;
      cheered = false;
      setEnded(false);
    };

    const resize = () => {
      const w = mount.clientWidth || 800;
      const h = mount.clientHeight || 600;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    // 시점 — 내 바로 뒤, 아이 눈높이에서 가는 쪽을 본다. 위에서 보기는 손으로 돌려 볼 수 있다
    const lookAhead = new THREE.Vector3();
    // 뒤에 벽이 있으면 벽 앞까지만 물러난다. 벽 너머에서 보면 내가 가려진다
    const ray = new THREE.Raycaster();
    const rayFrom = new THREE.Vector3();
    const rayDir = new THREE.Vector3();
    let back = CAM_BACK;
    let heading = 0;
    let lastAbove = aboveRef.current;
    const firstWalk = list.find((e) => e.snap.walk.length >= 2)?.snap.walk;
    if (firstWalk) {
      const start = pointAlong(firstWalk, 0);
      const next = pointAlong(firstWalk, 0.1);
      heading = Math.atan2(next.x - start.x, next.y - start.y);
    }
    const eyeFov = 72;
    const familyDir = new THREE.Vector3();
    const familyNdc = new THREE.Vector3();
    const lastWalk = list[list.length - 1]?.snap.walk;
    // 가족에게 다가오는 쪽 — 마지막에 이쪽에서 멈춘다
    // 집 밖에서 돌아서 왔으면 마지막으로 걸어온 쪽이다
    const cameFrom = lastWalk ? (lastWalk[lastWalk.length - 2] ?? lastWalk[0]!) : null;
    const approach = cameFrom && family ? { x: cameFrom.x - family.x, y: cameFrom.y - family.z } : { x: 0, y: 1 };
    const approachLen = Math.hypot(approach.x, approach.y) || 1;
    const setMode = (above: boolean) => {
      controls.enabled = above;
      camera.fov = above ? 42 : eyeFov;
      camera.updateProjectionMatrix();
      mount.dataset.view = above ? 'above' : 'behind';
      if (above) {
        camera.position.copy(home);
        controls.target.set(cx, 0, cz + 0.9);
      }
      lastAbove = above;
    };
    setMode(lastAbove);
    applyView.current = setMode;

    // 느린 기기 — 처음 몇 장면을 재 보고 느리면 그림자와 해상도를 낮춘다
    let frames = 0;
    let measured = 0;
    let lowered = false;

    const render = () => {
      if (disposed) return;
      raf = requestAnimationFrame(render);
      const raw = clock.getDelta();
      if (!lowered && frames >= 3) {
        measured += raw;
        if (frames === 15 && measured / 12 > 0.05) {
          lowered = true;
          sun.castShadow = false;
          renderer.setPixelRatio(1);
          resize();
          mount.dataset.quality = 'low';
        }
      }
      frames += 1;
      // 느린 기기에서도 제 속도로 흐른다. 탭을 떠났다 돌아온 때처럼 크게 뛰는 것만 막는다
      const dt = Math.min(0.5, raw);
      if (time < total) time += dt;
      else setEnded(true);

      // 지금 구간
      let idx = list.findIndex((e) => time < e.to);
      if (idx < 0) idx = list.length - 1;
      const seg = list[idx]!;
      const r = Math.max(0, Math.min(1, (time - seg.from) / (seg.to - seg.from)));
      let pos = seg.snap.walk.length >= 2 ? pointAlong(seg.snap.walk, r) : (seg.snap.walk[0] ?? finalPt);
      // 가족 앞에 다다르면 거기 선다. 더 걸어가면 가족을 지나친다
      const nearFamily = drill.end === 'meet' && family && idx === list.length - 1 && seg.snap.at === OUT && Math.hypot(pos.x - family.x, pos.y - family.z) < KID_STOP;
      if (nearFamily) {
        held ??= pos;
        pos = held;
      }
      const moving = r > 0 && r < 1 && seg.snap.walk.length >= 2 && !nearFamily;

      if (seg.snap.walk.length >= 2 && !nearFamily) {
        const ahead = pointAlong(seg.snap.walk, Math.min(1, r + 0.03));
        if (Math.hypot(ahead.x - pos.x, ahead.y - pos.y) > 0.001) {
          kid.root.rotation.y = Math.atan2(ahead.x - pos.x, ahead.y - pos.y);
        }
      }
      // 집 안에서는 허리를 숙이고 간다. 몸을 낮추면 더 깊이 숙이고 무릎을 굽힌다(대장 #177).
      // 한 손으로는 손수건을 코와 입에 대고, 다른 손으로는 가까운 벽을 짚으며 간다(대장 #186). 밖에 나오면 허리를 펴고 손수건을 내린다
      const indoors = seg.snap.at !== OUT;
      const crouch = seg.snap.crouch && indoors;
      const ease = reduced ? 1 : 0.18;
      const blend = reduced ? 1 : Math.min(1, dt * 5);
      const yaw = kid.root.rotation.y;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      // 아이의 +x 쪽을 세상 방향으로 — 쪽 s 의 옆 방향은 s·(rx, rz) 다
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      // 벽 쪽으로 붙는다 — 길은 칸 가운데를 지나므로 옆 벽이 손에 닿게 조금 다가간다. 낮은 가구가 있으면 그 앞에서 멈춘다
      let reach = Infinity;
      const shoulderY = KID_HIP * KID_SCALE + 0.22;
      if (indoors && !nearFamily) {
        const dist = ([-1, 1] as const).map((s) => sideHit(pos.x, pos.y, shoulderY, s * rx, s * rz, [walls]));
        const near: -1 | 1 = dist[0]! <= dist[1]! ? -1 : 1;
        // 짚는 쪽은 쉽게 바꾸지 않는다 — 지금 쪽에 벽이 없거나 반대쪽이 확실히 가까울 때만 바꾼다
        const cur = dist[wallSide < 0 ? 0 : 1]!;
        const other = dist[near < 0 ? 0 : 1]!;
        if (near !== wallSide && (cur === Infinity || other < cur - 0.12)) wallSide = near;
        const d = dist[wallSide < 0 ? 0 : 1]!;
        let want = 0;
        if (d < HUG_LOOK) {
          const low = sideHit(pos.x, pos.y, 0.12, wallSide * rx, wallSide * rz, [walls, furniture]);
          want = Math.max(0, Math.min(HUG_MAX, d - HUG_GAP, low - KID_CLEAR));
          // 벽에 닿는 자리 — 어깨보다 조금 높이, 조금 앞
          touch.set(pos.x + wallSide * rx * (d - 0.014) + fx * 0.05, shoulderY + 0.05, pos.y + wallSide * rz * (d - 0.014) + fz * 0.05);
        }
        hug += (want * wallSide - hug) * (reduced ? 1 : Math.min(1, dt * 3));
        reach = d - hug * wallSide;
      } else {
        hug += (0 - hug) * (reduced ? 1 : Math.min(1, dt * 3));
      }
      pos = { x: pos.x + rx * hug, y: pos.y + rz * hug };
      kid.root.position.set(pos.x, 0, pos.y);
      const hip = crouch ? KID_HIP_LOW : KID_HIP;
      kid.body.rotation.x += ((crouch ? KID_BEND_LOW : indoors ? KID_BEND : 0) - kid.body.rotation.x) * ease;
      kid.body.position.y += (hip - kid.body.position.y) * ease;
      kid.root.updateMatrixWorld(true);
      kid.body.getWorldQuaternion(bodyInv).invert();
      const phase = time * 14;
      const swing = moving && !reduced ? Math.sin(phase) * 0.5 : 0;

      // 다리 — 발은 바닥에 두고 걸음마다 앞뒤로 옮긴다. 무릎은 앞으로 굽는다
      kid.legs.forEach((leg, i) => {
        const s = i ? -1 : 1;
        leg.upper.position.y = kid.body.position.y;
        hipAt.copy(leg.upper.position);
        const stride = moving && !reduced ? Math.sin(phase) * s * (crouch ? 0.03 : 0.042) : 0;
        const lift = moving && !reduced ? Math.max(0, Math.cos(phase) * s) * 0.024 : 0;
        footAt.set(leg.side * 0.052, KID_ANKLE + lift, stride + (crouch ? 0.02 : 0));
        solveLimb(leg, hipAt, footAt, knee, flatQ, legPose[i]!);
        applyPose(leg, legPose[i]!);
      });

      // 팔 — 흔드는 팔에서 손수건 든 손과 벽 짚는 손으로 섞는다
      const mouthSide = -wallSide;
      const clothWant = indoors ? 1 : 0;
      clothShow += (clothWant - clothShow) * (reduced ? 1 : Math.min(1, dt * 4));
      kid.arms.forEach((arm, i) => {
        swingArm(arm, arm.side < 0 ? -swing * 0.8 : swing * 0.8, swingPose[i]!);
        const isMouth = arm.side === mouthSide;
        const isWall = arm.side === wallSide && reach <= HUG_REACH;
        mouthW[i] = mouthW[i]! + ((isMouth ? clothWant : 0) - mouthW[i]!) * blend;
        wallW[i] = wallW[i]! + ((isWall ? 1 : 0) - wallW[i]!) * blend;
        blendPose(swingPose[i]!, swingPose[i]!, 0, mixPose[i]!);
        if (mouthW[i]! > 0.001) {
          // 손바닥으로 손수건을 누른다. 손끝은 위로, 몸 가운데 쪽으로 기운다
          fingers.set(-arm.side * 0.55, 0.83, 0.1).normalize();
          palm.set(0, 0, -1);
          handFacing(fingers, palm, endQ);
          tmpV.copy(PALM_AT_MOUTH).addScaledVector(fingers, -0.024);
          tmpV.x += arm.side * 0.012;
          pole.set(arm.side * 0.6, -1, -0.2);
          solveLimb(arm, arm.upper.position, tmpV, pole, endQ, mouthPose[i]!);
          blendPose(mixPose[i]!, mouthPose[i]!, mouthW[i]!, mixPose[i]!);
        }
        if (wallW[i]! > 0.001) {
          // 벽을 짚는 손 — 손바닥이 벽을 보고 손끝은 위로 간다. 자리는 세상에서 재어 윗몸 공간으로 옮긴다
          tmpV.copy(touch);
          kid.body.worldToLocal(tmpV);
          toWall.set(arm.side * rx, 0, arm.side * rz).applyQuaternion(bodyInv);
          fingers.set(0, 1, 0).applyQuaternion(bodyInv).addScaledVector(toWall, 0.15).normalize();
          palm.copy(toWall);
          handFacing(fingers, palm, endQ);
          tmpV.addScaledVector(fingers, -0.026);
          pole.set(0, -1, -0.5);
          solveLimb(arm, arm.upper.position, tmpV, pole, endQ, wallPose[i]!);
          blendPose(mixPose[i]!, wallPose[i]!, wallW[i]!, mixPose[i]!);
        }
        applyPose(arm, mixPose[i]!);
      });
      waveCloth(kid.cloth, time, moving && !reduced, clothShow);
      kid.smile.visible = clothShow < 0.5;
      const touching = wallW.some((w) => w > 0.5);
      if (touching) wallSeen = true;
      mount.dataset.kidBend = kid.body.rotation.x.toFixed(2);
      mount.dataset.kidCloth = clothShow > 0.5 ? '1' : '0';
      mount.dataset.kidWall = touching ? '1' : '0';
      mount.dataset.kidWallSeen = wallSeen ? '1' : '0';
      mount.dataset.kidHug = Math.abs(hug).toFixed(2);

      // 위험 — 이전 차례 값에서 지금 값으로 서서히 옮겨 간다
      const prev = list[Math.max(0, idx - 1)]!.snap.field;
      const curr = seg.snap.field;
      for (const cell of layout.cells) {
        const a = prev[cell.id] ?? 0;
        const b = curr[cell.id] ?? 0;
        const v = a + (b - a) * r;
        const flame = flames.get(cell.id)!;
        if (cell.id === drill.source) {
          // 불은 시작한 자리에서 작게 시작해 값이 오를수록 넓어지고 커진다
          const grown = Math.max(0, Math.min(1, (v - 45) / 55));
          const count = v >= levels.blocked - 1 ? sourceFlames.length : v >= levels.light ? Math.max(1, Math.round(sourceFlames.length * grown * 0.8)) : 0;
          const size = 0.4 + 0.6 * grown;
          flame.visible = count > 0;
          sourceFlames.forEach((mesh, i) => {
            mesh.visible = i < count;
            mesh.scale.setScalar(size);
            mesh.position.y = 0.5 * size;
          });
          mount.dataset.flames = String(count);
        } else {
          flame.visible = v >= levels.blocked - 1;
        }
        const smoke = smokes.get(cell.id)!;
        const target = v < levels.light ? 0 : Math.min(0.7, 0.14 + (v / 100) * 0.56);
        smoke.mat.opacity += (target - smoke.mat.opacity) * 0.08;
        smoke.sprites.forEach((sp) => {
          // 연기는 짙어질수록 크게 피어올라 천장 아래에 깔린다
          const lift = reduced ? 0.4 : ((time * 0.14 + sp.ph) % 1) * 0.6;
          sp.s.position.set(sp.x + (reduced ? 0 : Math.sin(time * 0.5 + sp.ph) * 0.08), WALL_H * 0.55 + lift, sp.z);
          sp.s.scale.setScalar(1.05 + smoke.mat.opacity * 1.5);
          sp.s.visible = smoke.mat.opacity > 0.01;
        });
      }
      flameMats.forEach((m) => {
        m.uniforms.uTime!.value = time;
      });
      // 불꽃 그림은 늘 카메라를 향한다
      flameMeshes.forEach((f) => {
        f.rotation.y = Math.atan2(camera.position.x - f.position.x, camera.position.z - f.position.z);
      });

      // 문 — 닫혔으면 돌아와 닫힌다
      const closedNow = new Set(seg.snap.closed);
      doorPanels.forEach((pivot, edge) => {
        const goal = closedNow.has(edge) ? 0 : (doorAngles.get(edge) ?? DOOR_OPEN);
        pivot.rotation.y += (goal - pivot.rotation.y) * 0.14;
      });

      // 축포 — 끝 장면에서 차례로 솟아올라 터지고 되풀이한다
      const clouds = [...bursts.flatMap((b) => [b.points, b.inner, b.trail]), ...fountains.map((f) => f.points), ...(confetti ? [confetti.points] : [])];
      // 축포가 터지는 동안 하늘이 천천히 어두워진다
      const dusk = bursts.length && time >= total - PARTY_SECONDS ? (reduced ? 1 : Math.min(1, party / 1.6)) : 0;
      sky.copy(skyDay).lerp(skyDusk, dusk);
      fog.color.copy(sky);
      hemi.intensity = 1.75 - 0.55 * dusk;
      sun.intensity = 1.5 - 0.6 * dusk;
      mount.dataset.dusk = dusk.toFixed(2);
      if (bursts.length && time >= total - PARTY_SECONDS) {
        party += dt;
        if (!cheered) {
          cheered = true;
          mount.dataset.fireworks = '1';
          if (getApp().soundOn) platform.cheer();
        }
        const spread = (cloud: THREE.Points, b: (typeof bursts)[number], reach: number, drop: number, opacity: number): void => {
          const pos = cloud.geometry.getAttribute('position') as THREE.BufferAttribute;
          for (let n = 0; n < pos.count; n++) pos.setXYZ(n, b.at.x + b.dirs[n * 3]! * reach, b.at.y + b.dirs[n * 3 + 1]! * reach - drop, b.at.z + b.dirs[n * 3 + 2]! * reach);
          pos.needsUpdate = true;
          (cloud.material as THREE.PointsMaterial).opacity = opacity;
          cloud.visible = true;
        };
        for (const b of bursts) {
          // 움직임 줄이기에서는 다 터진 모습 한 장이다
          const life = reduced ? BURST_RISE + 0.7 : (((party - b.delay) % BURST_PERIOD) + BURST_PERIOD) % BURST_PERIOD;
          const started = reduced || party >= b.delay;
          const rising = started && !reduced && life < BURST_RISE;
          const open = life - BURST_RISE;
          const bloom = started && !rising && open < 2.2;
          b.trail.visible = rising;
          b.points.visible = bloom;
          b.inner.visible = bloom;
          if (rising) {
            // 땅에서 솟아오르는 꼬리
            const top = life / BURST_RISE;
            const pos = b.trail.geometry.getAttribute('position') as THREE.BufferAttribute;
            for (let n = 0; n < pos.count; n++) pos.setXYZ(n, b.at.x, b.at.y * Math.max(0, top - n * 0.035), b.at.z);
            pos.needsUpdate = true;
            (b.trail.material as THREE.PointsMaterial).opacity = 0.9;
          }
          if (bloom) {
            const grow = 1 - Math.exp(-3.2 * open);
            const fade = Math.max(0, Math.min(1, open * 7)) * Math.max(0, 1 - Math.max(0, open - 1.1) / 1.1);
            spread(b.points, b, b.reach * grow, b.drop * open * open, fade);
            spread(b.inner, b, b.reach * 0.5 * grow, b.drop * open * open, fade);
          }
        }
        for (const f of fountains) {
          const pos = f.points.geometry.getAttribute('position') as THREE.BufferAttribute;
          for (let n = 0; n < pos.count; n++) {
            const t = reduced ? f.seeds[n * 4 + 3]! : (party * 0.8 + f.seeds[n * 4 + 3]!) % 1;
            pos.setXYZ(n, f.at.x + f.seeds[n * 4]! * t, f.at.y + f.seeds[n * 4 + 1]! * t - 1.7 * t * t, f.at.z + f.seeds[n * 4 + 2]! * t);
          }
          pos.needsUpdate = true;
          (f.points.material as THREE.PointsMaterial).opacity = Math.min(1, party * 2);
          f.points.visible = true;
        }
        if (confetti) {
          const pos = confetti.points.geometry.getAttribute('position') as THREE.BufferAttribute;
          for (let n = 0; n < pos.count; n++) {
            const t = reduced ? confetti.seeds[n * 4 + 1]! : (party * 0.16 + confetti.seeds[n * 4 + 1]!) % 1;
            const sway = reduced ? 0 : Math.sin(party * 2.2 + confetti.seeds[n * 4 + 3]!) * 0.22;
            pos.setXYZ(n, confetti.at.x + confetti.seeds[n * 4]! + sway, 3.4 * (1 - t), confetti.at.z + confetti.seeds[n * 4 + 2]!);
          }
          pos.needsUpdate = true;
          (confetti.points.material as THREE.PointsMaterial).opacity = Math.min(0.95, party * 1.5);
          confetti.points.visible = true;
        }
      } else if (bursts.length) {
        for (const cloud of clouds) cloud.visible = false;
      }

      const words = captionFor(seg.snap, drill, list.length, idx, time >= total - PARTY_SECONDS, levels.light);
      if (words !== lastCaption) {
        lastCaption = words;
        setCaption(words);
      }

      // 시점
      if (aboveRef.current) {
        controls.update();
      } else {
        if (seg.snap.walk.length >= 2) {
          const ahead = pointAlong(seg.snap.walk, Math.min(1, r + 0.04));
          if (Math.hypot(ahead.x - pos.x, ahead.y - pos.y) > 0.001) {
            const want = Math.atan2(ahead.x - pos.x, ahead.y - pos.y);
            const turn = Math.atan2(Math.sin(want - heading), Math.cos(want - heading));
            heading += turn * Math.min(1, dt * 6);
          }
        }
        const eye = (crouch ? KID_EYE_LOW : indoors ? KID_EYE_BENT : KID_EYE) + CAM_RISE;
        const bob = moving && !reduced ? Math.sin(time * 14) * 0.008 : 0;
        const toFamily = drill.end === 'meet' && family && idx === list.length - 1 && seg.snap.at === OUT;
        if (toFamily) {
          // 안전한 곳 — 가족 앞에서 멈추고 가족을 바라본다
          const gap = Math.hypot(pos.x - family.x, pos.y - family.z);
          const stop = gap < FAMILY_STOP;
          // 내 어깨 너머로 가족이 보이게 옆으로 조금 비켜 선다
          const ax = approach.x / approachLen;
          const az = approach.y / approachLen;
          const cx2 = stop ? family.x + ax * FAMILY_STOP - az * CAM_SIDE * 1.6 : pos.x;
          const cz2 = stop ? family.z + az * FAMILY_STOP + ax * CAM_SIDE * 1.6 : pos.y;
          const ease = Math.min(1, dt * 5);
          camera.position.set(camera.position.x + (cx2 - camera.position.x) * ease, eye + bob, camera.position.z + (cz2 - camera.position.z) * ease);
          const want = Math.atan2(family.x - camera.position.x, family.z - camera.position.z);
          const turn = Math.atan2(Math.sin(want - heading), Math.cos(want - heading));
          heading += turn * Math.min(1, dt * 4);
          // 나도 가족을 바라본다
          if (stop) kid.root.rotation.y = Math.atan2(family.x - pos.x, family.z - pos.y);
          const far = Math.max(0.3, Math.hypot(family.x - camera.position.x, family.z - camera.position.z));
          lookAhead.set(camera.position.x + Math.sin(heading), eye + bob + (family.y - eye) / far, camera.position.z + Math.cos(heading));
          camera.lookAt(lookAhead);
          camera.updateMatrixWorld();
          familyNdc.copy(family).project(camera);
          mount.dataset.familyInView = familyNdc.z < 1 && Math.abs(familyNdc.x) < 0.9 && Math.abs(familyNdc.y) < 0.9 ? '1' : '0';
          mount.dataset.familyDist = camera.position.distanceTo(familyDir.set(family.x, camera.position.y, family.z)).toFixed(2);
        } else {
          const fx = Math.sin(heading);
          const fz = Math.cos(heading);
          // 어깨 너머 자리 — 뒤로 물러나고 옆으로 조금 비켜 앞이 보이게 한다
          const wantX = -fx * CAM_BACK - fz * CAM_SIDE;
          const wantZ = -fz * CAM_BACK + fx * CAM_SIDE;
          const wantLen = Math.hypot(wantX, wantZ);
          rayFrom.set(pos.x, eye, pos.y);
          rayDir.set(wantX / wantLen, 0, wantZ / wantLen);
          ray.set(rayFrom, rayDir);
          ray.far = wantLen + 0.12;
          const hit = ray.intersectObject(walls, true)[0];
          const room = hit ? Math.max(0.16, hit.distance - 0.12) / wantLen : 1;
          // 벽이 가까우면 곧바로 당기고, 넓어지면 천천히 물러난다
          const goal = Math.min(1, room) * CAM_BACK;
          back = goal < back ? goal : back + (goal - back) * Math.min(1, dt * 4);
          const k = back / CAM_BACK;
          camera.position.set(pos.x + wantX * k, eye + bob, pos.y + wantZ * k);
          lookAhead.set(pos.x + fx * 1.4, eye + bob - 0.1, pos.y + fz * 1.4);
          camera.lookAt(lookAhead);
          mount.dataset.camBack = Math.hypot(camera.position.x - pos.x, camera.position.z - pos.y).toFixed(2);
        }
        mount.dataset.camY = camera.position.y.toFixed(2);
      }
      // 가족은 나를 바라본다
      adults.forEach((adult) => {
        adult.getWorldPosition(familyDir);
        adult.rotation.y = Math.atan2(camera.position.x - familyDir.x, camera.position.z - familyDir.z);
      });
      renderer.render(scene, camera);
    };
    render();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose?.();
      });
      [roomTex, passTex, newTex, smokeTex, sparkTex].forEach((t) => t.dispose());
      kid.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [plan, drill, look]);
  // 이 효과 안의 시점은 fromAbove 가 바뀔 때 applyView 로 옮긴다

  return (
    <div className="replay" role="dialog" aria-modal="true" aria-label="3D 다시 보기" data-testid="replay">
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <div className="replay-top">
        <button type="button" className="btn" data-testid="replay-close" onClick={onClose}><IconClose /> 닫기</button>
        <button type="button" className="btn" data-testid="replay-view" aria-pressed={fromAbove} onClick={() => setFromAbove((f) => !f)}>
          {fromAbove ? '뒤에서 보기' : '위에서 보기'}
        </button>
        <button type="button" className={ended ? 'btn primary' : 'btn'} data-testid="replay-again" onClick={() => restart.current()}>
          <IconPlay /> 처음부터
        </button>
      </div>
      {failed ? (
        <div className="replay-fallback">이 기기에서는 3D 그림을 그릴 수 없어. 지도와 잘한 점은 그대로 볼 수 있어.</div>
      ) : (
        <div className="replay-caption" data-testid="replay-caption" data-ended={ended ? '1' : '0'}>{caption}</div>
      )}
    </div>
  );
}

function captionFor(snap: Snapshot, drill: DrillState, count: number, idx: number, ending: boolean, light: number): string {
  if (ending) return drill.end === 'rescue' ? '문을 닫고 119에 알렸어' : '대피 성공! 가족과 만났어';
  if (idx === 0) return '내 자리에서 시작';
  if (idx === count - 1 && drill.end === 'meet') return '안전한 곳으로 가는 중';
  if (snap.at === OUT) return '밖으로 나왔어';
  const here = snap.field[snap.at] ?? 0;
  if (here >= light) return snap.crouch ? '몸을 낮추고 지나가는 중' : '연기 속을 지나가는 중';
  return '나가는 길을 따라가는 중';
}
