/**
 * 3D 다시 보기의 나(대장 #186). 바깥 자산 없이 전부 코드로 짓는다.
 *
 * 몸은 관절로 이어져 있다 — 허리 · 어깨 · 팔꿈치 · 손목 · 엉덩이 · 무릎. 팔과 다리는 두 마디 IK 로
 * 손끝과 발끝을 원하는 자리에 놓는다. 그래서 집 안에서는 한 손으로 가까운 벽을 짚고 미끄러지듯 따라가고,
 * 다른 손으로는 손수건을 코와 입에 댄다. 밖에 나오면 손수건을 내리고 팔을 흔들며 걷는다.
 *
 * 질감도 코드로 굽는다. 피부는 가장자리가 따뜻하게 비치는 광택(sheen)을, 옷은 천의 결과 광택을,
 * 머리카락은 가닥 결을 가진다. 얼굴에는 눈(흰자 · 눈동자 · 반짝임) · 눈썹 · 코 · 귀 · 볼이 있다.
 */
import * as THREE from 'three';
import { LOOKS, type LookId } from '../../content/names';

/** 허리(엉덩이) 높이 — 윗몸은 여기를 축으로 앞으로 숙인다(대장 #177) */
export const KID_HIP = 0.2;
export const KID_HIP_LOW = 0.14;

const UPPER_ARM = 0.096;
const FORE_ARM = 0.09;
const THIGH = 0.098;
const SHIN = 0.092;
const ANKLE = 0.024;
/** 어깨 자리(허리에서 잰 높이) */
const SHOULDER_Y = 0.405 - KID_HIP;
const SHOULDER_X = 0.112;
const HIP_X = 0.05;
/** 손수건 가운데 자리(허리에서 잰 높이) — 위 끝이 눈 바로 아래, 코와 입을 덮고 턱 밑으로 늘어진다 */
const MOUTH = new THREE.Vector3(0, 0.463 - KID_HIP, 0.128);
/** 손수건을 누르는 손바닥 가운데 — 코와 입 앞 */
const PALM_AT = new THREE.Vector3(0, 0.48 - KID_HIP, 0.142);

export interface Kid {
  root: THREE.Group;
  body: THREE.Group;
  /** 왼쪽(-1)과 오른쪽(+1) 팔 — 어깨 · 팔꿈치 · 손목 */
  arms: Limb[];
  legs: Limb[];
  cloth: THREE.Mesh;
  smile: THREE.Mesh;
  dispose: () => void;
}

interface Limb {
  side: -1 | 1;
  /** 어깨(엉덩이) 관절 — 부모 공간에서 자리가 정해져 있다 */
  upper: THREE.Group;
  /** 팔꿈치(무릎) 관절 */
  lower: THREE.Group;
  /** 손목(발목) */
  end: THREE.Group;
  a: number;
  b: number;
}

/** 손 · 발 · 몸에 쓰는 결 — 캔버스에 그려 굽는다 */
function canvas(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  return c;
}

/** 높이 그림을 결(normal) 그림으로 바꾼다 */
function normalFrom(height: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const s = height.width;
  const src = height.getContext('2d')!.getImageData(0, 0, s, s).data;
  const out = document.createElement('canvas');
  out.width = out.height = s;
  const g = out.getContext('2d')!;
  const img = g.createImageData(s, s);
  const h = (x: number, y: number) => src[(((y + s) % s) * s + ((x + s) % s)) * 4]! / 255;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * s + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** 천의 짜임 — 씨실과 날실이 엇갈린다 */
function weave(): THREE.CanvasTexture {
  const tex = normalFrom(
    canvas(64, (g, s) => {
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const over = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
          const u = (x % 4) / 4;
          const v = (y % 4) / 4;
          const bump = over ? Math.sin(u * Math.PI) : Math.sin(v * Math.PI);
          const c = Math.round(110 + bump * 120);
          g.fillStyle = `rgb(${c},${c},${c})`;
          g.fillRect(x, y, 1, 1);
        }
      }
    }),
    2.2,
  );
  tex.repeat.set(10, 10);
  return tex;
}

/** 머리카락 결 — 위에서 아래로 흐르는 가닥. 색은 재질 색이 정하고 이 그림은 밝기만 준다 */
function strands(): THREE.CanvasTexture {
  const c = canvas(128, (g, s) => {
    g.fillStyle = '#d8d8d8';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 220; i++) {
      const x = (i * 37.7) % s;
      const shade = 150 + ((i * 53) % 105);
      g.strokeStyle = `rgb(${shade},${shade},${shade})`;
      g.lineWidth = 0.6 + ((i * 7) % 3) * 0.5;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + 4, s * 0.3, x - 4, s * 0.7, x + 2, s);
      g.stroke();
    }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 손수건 무늬 — 연한 하늘색 바탕에 흰 줄과 테두리 */
function hankyPattern(): THREE.CanvasTexture {
  const c = canvas(64, (g, s) => {
    g.fillStyle = '#cfe7f5';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#ffffff';
    for (let i = 4; i < s; i += 12) {
      g.fillRect(i, 0, 3, s);
      g.fillRect(0, i, s, 3);
    }
    g.strokeStyle = '#5aa7d6';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, s - 3, s - 3);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hexOf(css: string): number {
  return Number.parseInt(css.replace('#', ''), 16);
}

/** 윗몸 — 엉덩이에서 어깨까지 둥글게 이어지는 아이 몸통. 반지름을 높이마다 정해 돌려 만든다 */
function torsoGeometry(): THREE.BufferGeometry {
  const profile: [number, number][] = [
    [0.0, 0.0],
    [0.07, 0.004],
    [0.088, 0.03],
    [0.09, 0.07],
    [0.086, 0.11],
    [0.092, 0.16],
    [0.098, 0.2],
    [0.09, 0.222],
    [0.06, 0.236],
    [0.03, 0.242],
    [0.0, 0.244],
  ];
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  // 앞뒤로 조금 납작하게 — 아이 몸은 옆으로 더 넓다
  geo.scale(1, 1, 0.78);
  geo.computeVertexNormals();
  return geo;
}

/** 손 — 손바닥과 네 손가락, 엄지. 손끝은 -y 쪽, 손바닥은 +z 쪽이다 */
function makeHand(skin: THREE.Material, side: -1 | 1): THREE.Group {
  const hand = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 10), skin);
  palm.scale.set(1, 1.15, 0.55);
  palm.position.y = -0.022;
  palm.castShadow = true;
  hand.add(palm);
  const fingerGeo = new THREE.CapsuleGeometry(0.0062, 0.022, 3, 8);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(fingerGeo, skin);
    f.position.set((i - 1.5) * 0.0118, -0.054 + Math.abs(i - 1.5) * 0.004, 0.002);
    // 손가락이 손바닥(+z) 쪽으로 살짝 굽는다
    f.rotation.x = -0.28;
    f.castShadow = true;
    hand.add(f);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0068, 0.018, 3, 8), skin);
  thumb.position.set(-side * 0.021, -0.022, 0.01);
  thumb.rotation.set(0.5, 0, -side * 0.75);
  thumb.castShadow = true;
  hand.add(thumb);
  return hand;
}

/** 이름표에서 고른 내 모습을 3D 로 짓는다. 머리 모양과 머리색, 옷 색이 지도 위 그림과 같다 */
export function makeKid(look: LookId, scale: number): Kid {
  const spec = LOOKS.find((l) => l.id === look) ?? LOOKS[0];
  const textures: THREE.Texture[] = [];
  const keep = <T extends THREE.Texture>(t: T): T => {
    textures.push(t);
    return t;
  };
  const fabric = keep(weave());
  const hairTex = keep(strands());

  const skin = new THREE.MeshPhysicalMaterial({ color: 0xf4cfac, roughness: 0.62, sheen: 0.7, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xff9c7a) });
  const shirt = new THREE.MeshPhysicalMaterial({ color: hexOf(spec.shirt), roughness: 0.82, normalMap: fabric, normalScale: new THREE.Vector2(0.22, 0.22), sheen: 1, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffffff).lerp(new THREE.Color(hexOf(spec.shirt)), 0.5) });
  const pants = new THREE.MeshPhysicalMaterial({ color: 0x37455a, roughness: 0.86, normalMap: fabric, normalScale: new THREE.Vector2(0.25, 0.25), sheen: 0.8, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x8796b0) });
  const hair = new THREE.MeshPhysicalMaterial({ color: hexOf(spec.hair), map: hairTex, roughness: 0.5, sheen: 0.6, sheenRoughness: 0.35, sheenColor: new THREE.Color(0xffffff).lerp(new THREE.Color(hexOf(spec.hair)), 0.6) });
  const shoe = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.55 });
  const sole = new THREE.MeshStandardMaterial({ color: 0x8a93a0, roughness: 0.9 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 });
  const iris = new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.2 });
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const brow = new THREE.MeshStandardMaterial({ color: hexOf(spec.hair), roughness: 0.8 });
  const blush = new THREE.MeshStandardMaterial({ color: 0xf29a8a, roughness: 0.9, transparent: true, opacity: 0.45, depthWrite: false });
  const lip = new THREE.MeshStandardMaterial({ color: 0xb8574a, roughness: 0.6 });
  const capMat = new THREE.MeshPhysicalMaterial({ color: 0xe0603f, roughness: 0.7, normalMap: fabric, normalScale: new THREE.Vector2(0.4, 0.4), sheen: 0.8 });
  const hankyMat = new THREE.MeshPhysicalMaterial({ map: keep(hankyPattern()), roughness: 0.9, side: THREE.DoubleSide, sheen: 1, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xffffff) });

  const root = new THREE.Group();
  root.scale.setScalar(scale);
  // 윗몸 — 허리를 축으로 숙인다. 안의 것은 허리에서 잰 높이에 놓는다
  const body = new THREE.Group();
  body.position.y = KID_HIP;
  root.add(body);
  const put = (mesh: THREE.Mesh, x: number, y: number, z: number, parent: THREE.Object3D = body): THREE.Mesh => {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // 몸통과 바지 허리, 목
  put(new THREE.Mesh(torsoGeometry(), shirt), 0, 0.17 - KID_HIP, 0);
  const waist = put(new THREE.Mesh(new THREE.SphereGeometry(0.085, 24, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), pants), 0, 0.2 - KID_HIP, 0);
  waist.scale.set(1, 0.5, 0.7);
  const collar = put(new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.009, 8, 20), shirt), 0, 0.41 - KID_HIP, 0);
  collar.rotation.x = Math.PI / 2;
  put(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.05, 14), skin), 0, 0.43 - KID_HIP, 0);

  // 머리 — 얼굴은 가는 쪽(+z)을 본다
  const head = new THREE.Group();
  head.position.set(0, 0.53 - KID_HIP, 0);
  body.add(head);
  const skull = put(new THREE.Mesh(new THREE.SphereGeometry(0.115, 32, 24), skin), 0, 0, 0, head);
  skull.scale.set(1, 1.02, 0.97);
  // 볼과 턱이 조금 통통하다
  const cheekFill = put(new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 14), skin), 0, -0.035, 0.03, head);
  cheekFill.scale.set(1.12, 0.8, 0.9);
  for (const side of [-1, 1]) {
    // 눈 — 흰자 위에 눈동자, 그 위에 빛 반짝임
    const eyeWhite = put(new THREE.Mesh(new THREE.SphereGeometry(0.019, 16, 12), white), side * 0.04, 0.008, 0.098, head);
    eyeWhite.scale.set(1, 1.1, 0.5);
    put(new THREE.Mesh(new THREE.SphereGeometry(0.0125, 14, 10), iris), side * 0.04, 0.006, 0.1075, head).scale.set(1, 1.1, 0.45);
    put(new THREE.Mesh(new THREE.SphereGeometry(0.0036, 8, 6), shine), side * 0.04 + 0.004, 0.012, 0.113, head);
    const b = put(new THREE.Mesh(new THREE.CapsuleGeometry(0.004, 0.018, 2, 6), brow), side * 0.041, 0.038, 0.104, head);
    b.rotation.z = Math.PI / 2 + side * 0.15;
    // 귀
    const ear = put(new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), skin), side * 0.113, -0.004, 0, head);
    ear.scale.set(0.45, 1, 0.8);
    // 볼
    const cheek = put(new THREE.Mesh(new THREE.CircleGeometry(0.016, 16), blush), side * 0.063, -0.027, 0.098, head);
    cheek.rotation.y = side * 0.55;
    cheek.castShadow = false;
  }
  put(new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 10), skin), 0, -0.016, 0.115, head).scale.set(1, 0.85, 0.8);
  const smile = put(new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0045, 8, 16, Math.PI), lip), 0, -0.043, 0.108, head);
  smile.rotation.z = Math.PI;

  // 머리카락 — 귀 뒤에서 목덜미까지 덮는 뒷머리와 정수리, 그 위에 모양마다 다른 것을 얹는다
  put(new THREE.Mesh(new THREE.SphereGeometry(0.121, 28, 20, Math.PI + 0.3, Math.PI - 0.6, 0, Math.PI * 0.86), hair), 0, 0.004, -0.01, head);
  const top = new THREE.SphereGeometry(0.124, 30, 14, 0, Math.PI * 2, 0, Math.PI / 2.1);
  if (spec.style === 'cap') {
    put(new THREE.Mesh(top, capMat), 0, 0.015, 0, head);
    const brim = put(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.078, 0.012, 24), capMat), 0, 0.03, 0.122, head);
    brim.scale.x = 1.2;
    brim.rotation.x = 0.12;
    put(new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), capMat), 0, 0.137, 0, head);
  } else {
    put(new THREE.Mesh(top, hair), 0, 0.01, 0, head);
  }
  if (spec.style === 'long') {
    const fall = put(new THREE.Mesh(new THREE.CapsuleGeometry(0.108, 0.14, 6, 20), hair), 0, -0.09, -0.052, head);
    fall.scale.z = 0.5;
    for (const side of [-1, 1]) {
      const strand = put(new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.11, 4, 10), hair), side * 0.1, -0.06, 0.005, head);
      strand.scale.z = 0.6;
    }
  } else if (spec.style === 'curly') {
    for (let ring = 0; ring < 2; ring++) {
      const n = ring ? 8 : 11;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.3;
        const r = ring ? 0.06 : 0.1;
        put(new THREE.Mesh(new THREE.SphereGeometry(0.046 - ring * 0.006, 14, 10), hair), Math.sin(a) * r, 0.07 + ring * 0.04, Math.cos(a) * r - 0.014, head);
      }
    }
  } else if (spec.style === 'pony') {
    put(new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.008, 8, 16), capMat), 0, 0.06, -0.122, head).rotation.x = 0.4;
    const tail = put(new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.13, 6, 12), hair), 0, -0.03, -0.165, head);
    tail.rotation.x = -0.3;
  } else if (spec.style === 'twin') {
    for (const side of [-1, 1]) {
      put(new THREE.Mesh(new THREE.SphereGeometry(0.05, 18, 14), hair), side * 0.135, 0.035, -0.025, head);
      put(new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.007, 8, 14), capMat), side * 0.1, 0.04, -0.03, head).rotation.y = Math.PI / 2;
    }
  }

  // 팔 — 어깨 · 팔꿈치 · 손목. 기본 자세에서 팔은 아래(-y)로 내려간다
  const arms: Limb[] = [];
  for (const side of [-1, 1] as const) {
    const upper = new THREE.Group();
    upper.position.set(side * SHOULDER_X, SHOULDER_Y, 0.008);
    body.add(upper);
    put(new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 12), shirt), 0, 0, 0, upper);
    const sleeve = put(new THREE.Mesh(new THREE.CapsuleGeometry(0.03, UPPER_ARM - 0.03, 4, 14), shirt), 0, -UPPER_ARM / 2, 0, upper);
    sleeve.scale.z = 0.92;
    const lower = new THREE.Group();
    lower.position.y = -UPPER_ARM;
    upper.add(lower);
    put(new THREE.Mesh(new THREE.CapsuleGeometry(0.022, FORE_ARM - 0.026, 4, 12), skin), 0, -FORE_ARM / 2, 0, lower);
    const end = makeHand(skin, side);
    end.position.y = -FORE_ARM;
    lower.add(end);
    arms.push({ side, upper, lower, end, a: UPPER_ARM, b: FORE_ARM });
  }

  // 다리 — 엉덩이 · 무릎 · 발목. 발은 늘 바닥과 나란하다
  const legs: Limb[] = [];
  for (const side of [-1, 1] as const) {
    const upper = new THREE.Group();
    upper.position.set(side * HIP_X, KID_HIP, 0);
    root.add(upper);
    put(new THREE.Mesh(new THREE.CapsuleGeometry(0.042, THIGH - 0.03, 4, 14), pants), 0, -THIGH / 2, 0, upper);
    const lower = new THREE.Group();
    lower.position.y = -THIGH;
    upper.add(lower);
    put(new THREE.Mesh(new THREE.CapsuleGeometry(0.035, SHIN - 0.03, 4, 14), pants), 0, -SHIN / 2, 0, lower);
    const end = new THREE.Group();
    end.position.y = -SHIN;
    lower.add(end);
    const top = put(new THREE.Mesh(new THREE.CapsuleGeometry(0.029, 0.05, 4, 12), shoe), 0, -0.006, 0.02, end);
    top.rotation.x = Math.PI / 2;
    top.scale.set(1, 1, 0.75);
    const bottom = put(new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.008, 0.106), sole), 0, -ANKLE + 0.004, 0.02, end);
    bottom.receiveShadow = true;
    legs.push({ side, upper, lower, end, a: THIGH, b: SHIN });
  }

  // 손수건 — 코와 입을 덮고 아래가 턱 밑으로 늘어진다. 얼굴을 따라 둥글게 휜다
  const clothGeo = new THREE.PlaneGeometry(0.15, 0.13, 8, 8);
  const rest = Float32Array.from(clothGeo.attributes.position!.array as ArrayLike<number>);
  const cloth = new THREE.Mesh(clothGeo, hankyMat);
  cloth.position.copy(MOUTH);
  cloth.castShadow = true;
  cloth.userData.rest = rest;
  body.add(cloth);

  return {
    root,
    body,
    arms,
    legs,
    cloth,
    smile,
    dispose: () => textures.forEach((t) => t.dispose()),
  };
}

// ─── 자세 ────────────────────────────────────────────────────────────

const DOWN = new THREE.Vector3(0, -1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const qInv = new THREE.Quaternion();
const basis = new THREE.Matrix4();

export interface LimbPose {
  upper: THREE.Quaternion;
  lower: THREE.Quaternion;
  end: THREE.Quaternion;
}

export const newPose = (): LimbPose => ({ upper: new THREE.Quaternion(), lower: new THREE.Quaternion(), end: new THREE.Quaternion() });

/**
 * 두 마디 IK — 관절 자리 `from` 에서 `target` 까지 닿게 두 마디를 굽힌다. `pole` 은 가운데 관절(팔꿈치 · 무릎)이
 * 향할 쪽이다. 끝(손 · 발)은 부모 공간에서 `endQ` 방향을 가진다. 모든 값은 관절의 부모 공간에서 잰다.
 */
export function solveLimb(limb: Limb, from: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, endQ: THREE.Quaternion, out: LimbPose): void {
  const { a, b } = limb;
  const reach = tmpA.subVectors(target, from);
  const d = Math.max(Math.abs(a - b) + 0.002, Math.min(a + b - 0.0015, reach.length()));
  const dir = reach.normalize();
  // 어깨에서 팔꿈치까지의 각(코사인 법칙)
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
  // 팔꿈치가 나갈 쪽 — pole 에서 dir 성분을 빼고 남은 쪽
  const bend = tmpB.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1).addScaledVector(dir, -dir.z);
  bend.normalize();
  const elbowDir = tmpC.copy(dir).multiplyScalar(Math.cos(alpha)).addScaledVector(bend, Math.sin(alpha)).normalize();
  out.upper.setFromUnitVectors(DOWN, elbowDir);
  // 팔꿈치에서 손까지 — 부모 공간의 방향을 윗마디 공간으로 옮긴다
  const elbow = tmpB.copy(from).addScaledVector(elbowDir, a);
  const foreDir = tmpC.copy(from).addScaledVector(dir, d).sub(elbow).normalize();
  qA.setFromUnitVectors(DOWN, foreDir);
  qInv.copy(out.upper).invert();
  out.lower.copy(qInv).multiply(qA);
  // 끝 — 부모 공간에서 원하는 방향을 아랫마디 공간으로 옮긴다
  qB.copy(out.upper).multiply(out.lower).invert();
  out.end.copy(qB).multiply(endQ);
}

/** 손끝 방향(fingers)과 손바닥 방향(palm)으로 손의 방향을 만든다. 손끝은 -y, 손바닥은 +z 다 */
export function handFacing(fingers: THREE.Vector3, palm: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  const y = tmpA.copy(fingers).normalize().negate();
  const z = tmpB.copy(palm).addScaledVector(y, -palm.dot(y)).normalize();
  const x = tmpC.crossVectors(y, z).normalize();
  basis.makeBasis(x, y, z);
  return out.setFromRotationMatrix(basis);
}

/** 두 자세 사이를 w 만큼 섞는다 */
export function blendPose(from: LimbPose, to: LimbPose, w: number, out: LimbPose): void {
  out.upper.copy(from.upper).slerp(to.upper, w);
  out.lower.copy(from.lower).slerp(to.lower, w);
  out.end.copy(from.end).slerp(to.end, w);
}

export function applyPose(limb: Limb, pose: LimbPose): void {
  limb.upper.quaternion.copy(pose.upper);
  limb.lower.quaternion.copy(pose.lower);
  limb.end.quaternion.copy(pose.end);
}

/** 걸을 때 흔드는 팔 — 어깨에서 앞뒤로, 팔꿈치는 살짝 굽힌다 */
export function swingArm(limb: Limb, swing: number, out: LimbPose): void {
  out.upper.setFromEuler(new THREE.Euler(swing, 0, -limb.side * 0.12));
  out.lower.setFromEuler(new THREE.Euler(0.25 + Math.max(0, swing) * 0.5, 0, 0));
  // 손바닥(+z)이 몸 쪽을 본다
  out.end.setFromEuler(new THREE.Euler(0, -limb.side * 1.35, 0));
}

export const shoulderOf = (limb: Limb, out: THREE.Vector3): THREE.Vector3 => out.copy(limb.upper.position);
export const PALM_AT_MOUTH = PALM_AT;
export { ANKLE as KID_ANKLE };

/**
 * 손수건을 흔든다 — 얼굴을 따라 둥글게 휘고, 아랫자락이 걸음에 맞춰 살랑인다.
 * `show` 가 0 이면 접혀서 사라지고 1 이면 다 펼쳐진다.
 */
export function waveCloth(cloth: THREE.Mesh, time: number, moving: boolean, show: number): void {
  const pos = cloth.geometry.attributes.position as THREE.BufferAttribute;
  const rest = cloth.userData.rest as Float32Array;
  const R = 0.12;
  for (let i = 0; i < pos.count; i++) {
    const x = rest[i * 3]!;
    const y = rest[i * 3 + 1]!;
    // 얼굴을 감싸는 원기둥에 붙인다
    const a = x / R;
    let px = Math.sin(a) * R;
    let pz = (Math.cos(a) - 1) * R;
    // 아랫자락(턱 아래)은 앞으로 조금 떨어지고 걸음에 맞춰 흔들린다
    const hang = Math.max(0, -y - 0.01) / 0.055;
    const flutter = moving ? Math.sin(time * 9 + x * 40) * 0.006 * hang : Math.sin(time * 2 + x * 30) * 0.002 * hang;
    pz += hang * 0.012 + flutter;
    px *= 1 - hang * 0.12;
    pos.setXYZ(i, px, y - hang * 0.006, pz);
  }
  pos.needsUpdate = true;
  cloth.geometry.computeVertexNormals();
  cloth.scale.setScalar(Math.max(0.001, show));
  cloth.visible = show > 0.02;
}
