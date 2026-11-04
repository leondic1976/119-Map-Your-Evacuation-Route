/**
 * 3D 다시 보기 — 연습 기록을 종이 모형 같은 집에서 다시 튼다.
 * 바깥 자산 없이 전부 코드로 만든다. `three` 는 이 폴더 밖에서 부르지 않는다.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { DrillState, Snapshot } from '../../core/drill';
import { fitFurniture, type Footprint } from '../../core/furnish';
import { analyze, cellIdAt, edgeSides, parseEdge } from '../../core/grid';
import { pointAlong, polylineLength, routePoints } from '../../core/path';
import { OUT, type Cell, type Layout, type Plan, type Pt } from '../../core/types';
import { ITEMS } from '../../content/items';
import { FIRE } from '../../content/fire';
import { LOOKS, type LookId } from '../../content/names';
import { IconClose, IconPlay } from '../art';

const WALL_H = 0.72;
const WALL_T = 0.09;
const SEG_SECONDS = 0.55;

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
  let t = 0.6;
  const list: Timed[] = [];
  for (const snap of timeline) {
    const length = polylineLength(snap.walk);
    const dur = snap.walk.length < 2 ? 0.2 : Math.max(0.5, length * SEG_SECONDS);
    list.push({ snap, from: t, to: t + dur, length });
    t += dur;
  }
  return { list, total: t + 1.6 };
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

/** 열린 문짝의 각도. 벽을 가로로 놓은 틀 안에서 돈다. 내 시점에서 앞을 막지 않게 벽에 거의 수직으로 활짝 연다 */
const doorOpenAngle = (edge: string): number => (parseEdge(edge).o === 'h' ? -1.5 : 1.5);

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

function hexOf(css: string): number {
  return new THREE.Color(css).getHex();
}

function makeKid(look: LookId): { root: THREE.Group; body: THREE.Group; legs: THREE.Mesh[] } {
  const spec = LOOKS.find((l) => l.id === look) ?? LOOKS[0];
  const root = new THREE.Group();
  root.scale.setScalar(1.25);
  const body = new THREE.Group();
  root.add(body);
  const shirt = material(hexOf(spec.shirt));
  const skin = material(0xf6d3b0);
  const hair = material(hexOf(spec.hair));
  const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.14, 4, 10), shirt);
  trunk.position.y = 0.3;
  trunk.castShadow = true;
  body.add(trunk);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 18, 14), skin);
  head.position.y = 0.53;
  head.castShadow = true;
  body.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.122, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), hair);
  cap.position.y = 0.54;
  body.add(cap);
  const legs: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.12, 3, 6), material(0x37455a));
    leg.position.set(side * 0.05, 0.1, 0);
    leg.castShadow = true;
    root.add(leg);
    legs.push(leg);
  }
  return { root, body, legs };
}

export default function Replay3D({ plan, drill, look, onClose }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [caption, setCaption] = useState('내 자리에서 시작');
  const [ended, setEnded] = useState(false);
  // 기본은 내 눈으로 보고, 위쪽 단추를 누르면 위에서 집 전체를 본다
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
    scene.background = new THREE.Color(0xcfe6f3);
    scene.fog = new THREE.Fog(0xcfe6f3, 22, 48);

    const cx = planCols / 2;
    const cz = planRows / 2;
    const camera = new THREE.PerspectiveCamera(42, 1, 0.03, 100);
    const home = new THREE.Vector3(cx, Math.max(planCols, planRows) * 0.95, cz + Math.max(planCols, planRows) * 0.78);
    camera.position.copy(home);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cx, 0, cz + 0.4);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.minDistance = 3;
    controls.maxDistance = 30;

    scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe8cf, 1.75));
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
    const doorMat = material(0x9a5b2a);
    const exitMat = material(0x2e8b57);
    const walls = new THREE.Group();
    scene.add(walls);
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
      const full = length + WALL_T;
      wall.add(piece(full, 0.03, WALL_H + 0.015, 0, trimMat));

      // 줄 위의 문과 창. 앞 구멍과 줄 끝을 넘지 않게 폭을 맞춘다. 자리는 줄 가운데에서 잰다
      const openings = run.edges
        .filter((e) => plan.openings[e.key])
        .map((e) => {
          const m = world(e.mid);
          return { edge: e.key, kind: plan.openings[e.key]!, at: Math.hypot(m.x - a.x, m.y - a.y) - length / 2 };
        })
        .sort((p, q) => p.at - q.at);
      let cursor = -length / 2;
      const solid = (start: number, end: number) => {
        if (end - start > 0.001) wall.add(piece(end - start + WALL_T, WALL_H, WALL_H / 2, (start + end) / 2, wallMat));
      };
      openings.forEach((o, i) => {
        const next = openings[i + 1];
        const wanted = o.kind === 'door' ? 0.76 : 0.7;
        const left = Math.max(0.03, o.at - cursor - 0.06);
        const right = Math.max(0.03, Math.min(length / 2 - o.at - 0.06, next ? (next.at - o.at) / 2 - 0.03 : Infinity));
        const half = Math.min(wanted / 2, left, right);
        const start = o.at - half;
        const end = o.at + half;
        solid(cursor, start);
        cursor = end;
        const width = end - start;
        if (o.kind === 'window') {
          wall.add(piece(width, 0.4, 0.2, o.at, wallMat));
          wall.add(piece(width, 0.14, WALL_H - 0.07, o.at, wallMat));
          wall.add(piece(width, 0.42, 0.61, o.at, glassMat));
        } else {
          wall.add(piece(width, 0.14, WALL_H - 0.07, o.at, wallMat));
          const [p, q] = edgeSides(layout, o.edge);
          const isExit = layout.cellAt.has(p) !== layout.cellAt.has(q);
          // 경첩을 축으로 도는 문짝
          const pivot = new THREE.Group();
          pivot.position.set(start, 0, 0);
          pivot.add(box(width, WALL_H - 0.16, 0.05, isExit ? exitMat : doorMat, width / 2, (WALL_H - 0.16) / 2, 0));
          pivot.rotation.y = doorOpenAngle(o.edge);
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
      for (const [w, h, d, color, x, y, z] of spec.parts) piece.add(box(w, h, d, material(color), x, y, z));
      furniture.add(piece);
    }
    mount.dataset.placed = String(plan.items?.length ?? 0);
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

    // 만나는 곳 깃발과 가족
    const meet = plan.marks.meet ? world(plan.marks.meet) : null;
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
        adult.add(torso, face, hairCap);
        flag.add(adult);
      }
      scene.add(flag);
    }

    // 나
    const kid = makeKid(look);
    scene.add(kid.root);

    // 불과 연기
    const flameMats: THREE.ShaderMaterial[] = [];
    const flames = new Map<string, THREE.Group>();
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
      for (const c of spots) {
        const mat = makeFlameMaterial();
        flameMats.push(mat);
        const flame = new THREE.Mesh(flameGeo, mat);
        flame.position.set(c.x, 0.5, c.y);
        flameMeshes.push(flame);
        fg.add(flame);
      }
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
    restart.current = () => {
      time = 0;
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

    // 시점 — 내 눈 높이에서 가는 쪽을 본다. 위에서 보기는 손으로 돌려 볼 수 있다
    const lookAhead = new THREE.Vector3();
    let heading = 0;
    let lastAbove = aboveRef.current;
    const firstWalk = list.find((e) => e.snap.walk.length >= 2)?.snap.walk;
    if (firstWalk) {
      const start = pointAlong(firstWalk, 0);
      const next = pointAlong(firstWalk, 0.1);
      heading = Math.atan2(next.x - start.x, next.y - start.y);
    }
    const eyeFov = 72;
    const setMode = (above: boolean) => {
      controls.enabled = above;
      kid.root.visible = above;
      camera.fov = above ? 42 : eyeFov;
      camera.updateProjectionMatrix();
      mount.dataset.view = above ? 'above' : 'eye';
      if (above) {
        camera.position.copy(home);
        controls.target.set(cx, 0, cz + 0.4);
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
      const pos = seg.snap.walk.length >= 2 ? pointAlong(seg.snap.walk, r) : (seg.snap.walk[0] ?? finalPt);
      const moving = r > 0 && r < 1 && seg.snap.walk.length >= 2;

      kid.root.position.set(pos.x, 0, pos.y);
      if (seg.snap.walk.length >= 2) {
        const ahead = pointAlong(seg.snap.walk, Math.min(1, r + 0.03));
        if (Math.hypot(ahead.x - pos.x, ahead.y - pos.y) > 0.001) {
          kid.root.rotation.y = Math.atan2(ahead.x - pos.x, ahead.y - pos.y);
        }
      }
      const crouch = seg.snap.crouch && seg.snap.at !== OUT;
      kid.body.scale.y += ((crouch ? 0.6 : 1) - kid.body.scale.y) * 0.18;
      const swing = moving && !reduced ? Math.sin(time * 14) * 0.5 : 0;
      kid.legs[0]!.rotation.x = swing;
      kid.legs[1]!.rotation.x = -swing;

      // 위험 — 이전 차례 값에서 지금 값으로 서서히 옮겨 간다
      const prev = list[Math.max(0, idx - 1)]!.snap.field;
      const curr = seg.snap.field;
      for (const cell of layout.cells) {
        const a = prev[cell.id] ?? 0;
        const b = curr[cell.id] ?? 0;
        const v = a + (b - a) * r;
        const flame = flames.get(cell.id)!;
        flame.visible = v >= levels.blocked - 1;
        const smoke = smokes.get(cell.id)!;
        const target = v < levels.light ? 0 : Math.min(0.62, 0.14 + (v / 100) * 0.5);
        smoke.mat.opacity += (target - smoke.mat.opacity) * 0.08;
        smoke.sprites.forEach((sp) => {
          const lift = reduced ? 0.4 : ((time * 0.14 + sp.ph) % 1) * 0.5;
          sp.s.position.set(sp.x, WALL_H * 0.7 + lift, sp.z);
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
        const goal = closedNow.has(edge) ? 0 : doorOpenAngle(edge);
        pivot.rotation.y += (goal - pivot.rotation.y) * 0.14;
      });

      const words = captionFor(seg.snap, drill, list.length, idx, time >= total - 1.2, levels.light);
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
        const eye = seg.snap.crouch && seg.snap.at !== OUT ? 0.34 : 0.56;
        const bob = moving && !reduced ? Math.sin(time * 14) * 0.008 : 0;
        camera.position.set(pos.x, eye + bob, pos.y);
        lookAhead.set(pos.x + Math.sin(heading), eye + bob - 0.04, pos.y + Math.cos(heading));
        camera.lookAt(lookAhead);
      }
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
      [roomTex, passTex, newTex, smokeTex].forEach((t) => t.dispose());
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
          {fromAbove ? '내 눈으로 보기' : '위에서 보기'}
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
  if (ending) return drill.end === 'rescue' ? '문을 닫고 구조를 요청했어' : '가족과 만났어';
  if (idx === 0) return '내 자리에서 시작';
  if (idx === count - 1 && drill.end === 'meet') return '만나는 곳으로 가는 중';
  if (snap.at === OUT) return '밖으로 나왔어';
  const here = snap.field[snap.at] ?? 0;
  if (here >= light) return snap.crouch ? '몸을 낮추고 지나가는 중' : '연기 속을 지나가는 중';
  return '나가는 길을 따라가는 중';
}
