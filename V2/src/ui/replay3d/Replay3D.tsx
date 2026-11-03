/**
 * 3D 다시 보기 — 연습 기록을 종이 모형 같은 집에서 다시 튼다.
 * 바깥 자산 없이 전부 코드로 만든다. `three` 는 이 폴더 밖에서 부르지 않는다.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { DrillState, Snapshot } from '../../core/drill';
import { analyze, edgeEnds, edgeSides, parseEdge, piecePolygon, sqKey } from '../../core/grid';
import { pointAlong, polylineLength, routePoints } from '../../core/path';
import { OUT, type Cell, type Plan, type Pt } from '../../core/types';
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

/** 대각선에 나뉜 세모 바닥 */
function triangleFloor(key: string): THREE.BufferGeometry {
  const [a, b, c] = piecePolygon(key) as [Pt, Pt, Pt];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([a.x, 0, a.y, c.x, 0, c.y, b.x, 0, b.y], 3));
  const ox = Math.min(a.x, b.x, c.x);
  const oy = Math.min(a.y, b.y, c.y);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([a.x - ox, a.y - oy, c.x - ox, c.y - oy, b.x - ox, b.y - oy], 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** 열린 문짝의 각도. 벽을 가로로 놓은 틀 안에서 돈다 */
const doorOpenAngle = (edge: string): number => (parseEdge(edge).o === 'h' ? -1.25 : 1.25);

/** 칸 이름에 맞는 가구를 저절로 놓는다. 아이가 고를 일을 늘리지 않는다 */
function furnish(group: THREE.Group, cell: Cell, avoid: Set<string>): void {
  // 가구는 네모 전체에만 놓는다. 세모 조각에는 벽을 뚫고 나간다
  const free = cell.squares.filter((s) => s.whole && !avoid.has(sqKey(s.x, s.y)));
  const spot = free[0] ?? null;
  if (!spot) return;
  const x = spot.x + 0.5;
  const z = spot.y + 0.5;
  const add = (m: THREE.Mesh) => group.add(m);
  switch (cell.name ?? (cell.kind === 'room' ? 'main' : null)) {
    case 'main':
    case 'myroom':
    case 'other':
      add(box(0.62, 0.2, 0.85, material(0xf4f0e4), x, 0.12, z));
      add(box(0.62, 0.1, 0.34, material(0x8cb7d9), x, 0.26, z - 0.22));
      add(box(0.62, 0.3, 0.05, material(0x9a7a55), x, 0.17, z - 0.45));
      break;
    case 'kitchen':
      add(box(0.8, 0.42, 0.34, material(0xe8e2d0), x, 0.21, z - 0.2));
      add(box(0.6, 0.3, 0.6, material(0xb98a5e), x, 0.15, z + 0.28));
      break;
    case 'bath':
      add(box(0.3, 0.3, 0.42, material(0xffffff, 0.4), x, 0.15, z));
      break;
    case 'living':
      add(box(0.85, 0.22, 0.34, material(0x7fa3c7), x, 0.11, z - 0.22));
      add(box(0.85, 0.34, 0.1, material(0x6f93b6), x, 0.17, z - 0.38));
      add(box(0.46, 0.14, 0.3, material(0xb98a5e), x, 0.07, z + 0.2));
      break;
    case 'veranda':
      add(box(0.3, 0.3, 0.3, material(0x6aa76a), x, 0.15, z));
      break;
    default:
      break;
  }
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
  const [follow, setFollow] = useState(false);
  const followRef = useRef(false);
  const restart = useRef<() => void>(() => undefined);

  useEffect(() => {
    followRef.current = follow;
  }, [follow]);

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

    const cx = plan.cols / 2;
    const cz = plan.rows / 2;
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const home = new THREE.Vector3(cx, Math.max(plan.cols, plan.rows) * 0.95, cz + Math.max(plan.cols, plan.rows) * 0.78);
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
    const span = Math.max(plan.cols, plan.rows) + 4;
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
    const floorGeo = new THREE.PlaneGeometry(1, 1);
    for (const cell of layout.cells) {
      const mat = cell.kind === 'room' ? floorMat.room : cell.kind === 'pass' ? floorMat.pass : floorMat.none;
      for (const s of cell.squares) {
        const m = s.whole ? new THREE.Mesh(floorGeo, mat) : new THREE.Mesh(triangleFloor(s.key), mat);
        if (s.whole) {
          m.rotation.x = -Math.PI / 2;
          m.position.set(s.x + 0.5, 0, s.y + 0.5);
        }
        m.receiveShadow = true;
        scene.add(m);
      }
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
    for (const edge of plan.walls) {
      const [a, b] = edgeEnds(edge);
      const kind = plan.openings[edge];
      // 벽을 가로로 놓고 만든 뒤 제 방향으로 돌린다. 대각선 벽은 √2 배 길다
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const wall = new THREE.Group();
      wall.position.set((a.x + b.x) / 2, 0, (a.y + b.y) / 2);
      wall.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
      walls.add(wall);
      const piece = (len: number, h: number, y: number, off: number, mat: THREE.Material) => box(len, h, WALL_T, mat, off, y, 0);
      const full = length + WALL_T;
      if (!kind) {
        wall.add(piece(full, WALL_H, WALL_H / 2, 0, wallMat));
        wall.add(piece(full, 0.03, WALL_H + 0.015, 0, trimMat));
      } else if (kind === 'window') {
        const side = length - 0.7;
        wall.add(piece(full, 0.4, 0.2, 0, wallMat));
        wall.add(piece(full, 0.14, WALL_H - 0.07, 0, wallMat));
        wall.add(piece(side / 2 + WALL_T, WALL_H, WALL_H / 2, -(0.35 + side / 4), wallMat));
        wall.add(piece(side / 2 + WALL_T, WALL_H, WALL_H / 2, 0.35 + side / 4, wallMat));
        wall.add(piece(0.7, 0.42, 0.61, 0, glassMat));
        wall.add(piece(full, 0.03, WALL_H + 0.015, 0, trimMat));
      } else {
        const side = length - 0.76;
        wall.add(piece(side / 2 + WALL_T, WALL_H, WALL_H / 2, -(0.38 + side / 4), wallMat));
        wall.add(piece(side / 2 + WALL_T, WALL_H, WALL_H / 2, 0.38 + side / 4, wallMat));
        wall.add(piece(full, 0.14, WALL_H - 0.07, 0, wallMat));
        wall.add(piece(full, 0.03, WALL_H + 0.015, 0, trimMat));
        const [p, q] = edgeSides(layout, edge);
        const isExit = layout.cellAt.has(p) !== layout.cellAt.has(q);
        // 경첩을 축으로 도는 문짝
        const pivot = new THREE.Group();
        pivot.position.set(-0.38, 0, 0);
        pivot.add(box(0.76, WALL_H - 0.16, 0.05, isExit ? exitMat : doorMat, 0.38, (WALL_H - 0.16) / 2, 0));
        pivot.rotation.y = doorOpenAngle(edge);
        wall.add(pivot);
        doorPanels.set(edge, pivot);
      }
    }

    // 가구 — 지나는 길을 비운다
    const routeSquares = new Set<string>();
    for (const snap of drill.timeline) {
      for (const p of snap.walk) routeSquares.add(sqKey(Math.floor(p.x), Math.floor(p.y)));
    }
    const furniture = new THREE.Group();
    scene.add(furniture);
    for (const cell of layout.cells) furnish(furniture, cell, routeSquares);

    // 나가는 길 띠
    const pathPoints = routePoints(plan, layout, plan.route);
    if (pathPoints.length > 1) {
      const ribbon = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0xd6402f, roughness: 0.7, emissive: 0x6a1a10, emissiveIntensity: 0.25 });
      for (let i = 1; i < pathPoints.length; i++) {
        const a = pathPoints[i - 1]!;
        const b = pathPoints[i]!;
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
    const meet = plan.marks.meet;
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
      for (const s of cell.squares) {
        const mat = makeFlameMaterial();
        flameMats.push(mat);
        const flame = new THREE.Mesh(flameGeo, mat);
        flame.position.set(s.center.x, 0.5, s.center.y);
        flameMeshes.push(flame);
        fg.add(flame);
      }
      scene.add(fg);
      flames.set(cell.id, fg);

      const sm = new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0, depthWrite: false });
      const sprites = cell.squares.flatMap((s) =>
        [0, 1].map((i) => {
          const sprite = new THREE.Sprite(sm);
          const x = s.center.x - 0.2 + Math.random() * 0.4;
          const z = s.center.y - 0.2 + Math.random() * 0.4;
          sprite.scale.setScalar(1.1);
          scene.add(sprite);
          return { s: sprite, x, z, ph: i * 1.7 + Math.random() * 3 };
        }),
      );
      smokes.set(cell.id, { mat: sm, sprites });
    }

    const { list, total } = buildTimes(drill.timeline);
    const finalPt: Pt = drill.pt;
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

    const lookAtTmp = new THREE.Vector3();
    const camGoal = new THREE.Vector3();

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
      if (followRef.current) {
        const back = kid.root.rotation.y;
        camGoal.set(pos.x - Math.sin(back) * 2.8, 3.1, pos.y - Math.cos(back) * 2.8);
        camera.position.lerp(camGoal, 0.05);
        lookAtTmp.set(pos.x, 0.4, pos.y);
        controls.target.lerp(lookAtTmp, 0.1);
      }
      controls.update();
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

  return (
    <div className="replay" role="dialog" aria-modal="true" aria-label="3D 다시 보기" data-testid="replay">
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <div className="replay-top">
        <button type="button" className="btn" data-testid="replay-close" onClick={onClose}><IconClose /> 닫기</button>
        <button type="button" className="btn" data-testid="replay-view" aria-pressed={follow} onClick={() => setFollow((f) => !f)}>
          {follow ? '집 전체 보기' : '나를 따라가기'}
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
