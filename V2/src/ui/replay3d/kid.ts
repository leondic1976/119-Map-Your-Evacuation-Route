/**
 * 3D 다시 보기의 나(대장 #186). 바깥 자산 없이 전부 코드로 짓는다.
 *
 * 몸은 관절로 이어져 있다 — 허리 · 어깨 · 팔꿈치 · 손목 · 엉덩이 · 무릎. 팔과 다리는 두 마디 IK 로
 * 손끝과 발끝을 원하는 자리에 놓는다. 그래서 집 안에서는 한 손으로 가까운 벽을 짚고 미끄러지듯 따라가고,
 * 다른 손으로는 손수건을 코와 입에 댄다. 밖에 나오면 손수건을 내리고 팔을 흔들며 걷는다.
 *
 * 질감도 코드로 굽는다. 피부는 가장자리가 따뜻하게 비치는 광택(sheen)을, 옷은 천의 결과 광택을,
 * 머리카락은 가닥 결을 가진다. 얼굴에는 눈(흰자 · 홍채 · 눈동자 · 반짝임) · 눈꺼풀과 속눈썹 · 눈썹 · 코 · 귀 · 볼 · 입이 있다.
 *
 * 얼굴과 손은 살아 움직인다(대장 #198). 눈을 깜박이고, 걱정스러울 때는 눈썹 안쪽이 올라가고, 기쁠 때는 입을 벌려 웃는다.
 * 손가락은 마디마다 굽는다 — 손수건을 누를 때, 벽을 짚을 때, 걸을 때, 손을 흔들 때의 손 모양이 다르다.
 */
import * as THREE from 'three';
import { LOOKS, type LookId } from '../../content/names';

/** 허리(엉덩이) 높이 — 윗몸은 여기를 축으로 앞으로 숙인다(대장 #177) */
export const KID_HIP = 0.2;
export const KID_HIP_LOW = 0.14;

const UPPER_ARM = 0.104;
const FORE_ARM = 0.1;
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
  head: THREE.Group;
  /** 팔과 같은 차례의 손 */
  hands: Hand[];
  face: Face;
  dispose: () => void;
}

/** 마디가 있는 손 — 손가락마다 뿌리 관절과 가운데 관절이 있다 */
export interface Hand {
  side: -1 | 1;
  fingers: { base: THREE.Group; mid: THREE.Group }[];
  thumb: { base: THREE.Group; mid: THREE.Group };
}

interface Face {
  /** 눈꺼풀 — 돌려서 감는다 */
  lids: THREE.Object3D[];
  brows: THREE.Mesh[];
  /** 홍채 · 눈동자 · 반짝임 묶음 — 옮겨서 보는 쪽을 바꾼다 */
  eyes: THREE.Group[];
  /** 벌려 웃는 입 */
  laugh: THREE.Group;
  /** 깜박임이 사람마다 어긋나게 하는 값 */
  seed: number;
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

/** 손가락 길이 — 둘째에서 새끼까지. 가운뎃손가락이 가장 길다 */
const FINGER_LEN = [0.93, 1, 0.94, 0.76];

/**
 * 손 — 손바닥과 마디가 있는 네 손가락, 엄지(대장 #198). 손끝은 -y 쪽, 손바닥은 +z 쪽이다.
 * 손가락은 뿌리 마디와 끝 마디로 나뉘어 굽고, 손등 쪽 끝에 손톱이 있다.
 */
function makeHand(skin: THREE.Material, nail: THREE.Material, side: -1 | 1): { group: THREE.Group; hand: Hand } {
  const group = new THREE.Group();
  const add = (mesh: THREE.Mesh, parent: THREE.Object3D): THREE.Mesh => {
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  // 손바닥 — 손목 쪽은 좁고 손가락 쪽은 넓다. 엄지 두덩이 불룩하다
  const palm = add(new THREE.Mesh(new THREE.SphereGeometry(0.024, 18, 12), skin), group);
  palm.scale.set(1.02, 1.12, 0.5);
  palm.position.y = -0.021;
  const mound = add(new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), skin), group);
  mound.scale.set(1, 1.3, 0.8);
  mound.position.set(-side * 0.013, -0.014, 0.006);
  const finger = (x: number, y: number, len: number, r: number): { base: THREE.Group; mid: THREE.Group } => {
    const base = new THREE.Group();
    base.position.set(x, y, 0.001);
    group.add(base);
    const a = 0.0155 * len;
    const b = 0.0165 * len;
    add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.08, 8, 6), skin), base);
    add(new THREE.Mesh(new THREE.CapsuleGeometry(r, a, 3, 8), skin), base).position.y = -a / 2;
    const mid = new THREE.Group();
    mid.position.y = -a;
    base.add(mid);
    add(new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.9, b, 3, 8), skin), mid).position.y = -b / 2;
    // 손톱 — 손등(-z) 쪽 끝에 얇게 붙는다
    const tip = add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.78, 8, 6), nail), mid);
    tip.scale.set(1, 1.15, 0.35);
    tip.position.set(0, -b + r * 0.25, -r * 0.72);
    tip.castShadow = false;
    return { base, mid };
  };
  const fingers = FINGER_LEN.map((len, i) => finger((i - 1.5) * 0.0118 * -side, -0.041 + Math.abs(i - 1.5) * 0.0035, len, 0.0061 - (i === 3 ? 0.0006 : 0)));
  const thumb = finger(-side * 0.02, -0.014, 0.82, 0.0068);
  thumb.base.position.z = 0.008;
  const hand: Hand = { side, fingers, thumb };
  poseHand(hand, 0.25, 0);
  return { group, hand };
}

/**
 * 손 모양을 잡는다. `curl` 은 손가락을 손바닥 쪽으로 굽히는 정도(0 폄 ~ 1 주먹), `spread` 는 벌리는 정도(0 ~ 1)다.
 * 새끼손가락 쪽이 조금 더 굽어 손이 자연스럽게 말린다.
 */
export function poseHand(hand: Hand, curl: number, spread: number): void {
  hand.fingers.forEach((f, i) => {
    const more = 1 + i * 0.09;
    f.base.rotation.set(-(0.06 + curl * 1.15 * more), 0, hand.side * (i - 1.5) * (0.02 + spread * 0.17));
    f.mid.rotation.set(-(0.08 + curl * 1.35 * more), 0, 0);
  });
  // 엄지는 옆으로 나와 있다가, 쥘 때 손바닥 앞으로 돌아 들어온다
  hand.thumb.base.rotation.set(0.35 + curl * 0.35, hand.side * curl * 0.5, -hand.side * (0.85 + spread * 0.3 - curl * 0.35));
  hand.thumb.mid.rotation.set(-(0.1 + curl * 0.7), 0, 0);
}

/**
 * 얼굴을 움직인다(대장 #198). `worry` 와 `joy` 는 0 ~ 1 이다. 걱정하면 눈썹 안쪽이 올라가고 눈이 조금 커지며,
 * 기쁘면 눈이 가늘어지고 입을 벌려 웃는다. `lookX` 는 눈동자가 옆을 보는 정도(-1 ~ 1)다. 눈은 저절로 깜박인다.
 */
export function animateFace(kid: Kid, time: number, worry: number, joy: number, lookX = 0, still = false): void {
  const f = kid.face;
  // 3~4초에 한 번, 0.16초 동안 감았다 뜬다
  const beat = (time + f.seed * 3.7) % (3.1 + f.seed);
  const blink = still ? 0 : Math.max(0, 1 - Math.abs(beat - 0.08) / 0.08);
  const open = -0.62 - worry * 0.16 + joy * 0.3;
  for (const lid of f.lids) lid.rotation.x = open + (0.92 - open) * blink;
  f.brows.forEach((b, i) => {
    const side = i ? 1 : -1;
    b.rotation.z = Math.PI / 2 + side * (0.15 - worry * 0.52 + joy * 0.1);
    b.position.y = 0.038 + worry * 0.005 + joy * 0.004;
  });
  f.eyes.forEach((eye) => {
    eye.position.x = lookX * 0.0045;
  });
  f.laugh.visible = joy > 0.5 && kid.smile.visible;
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
  const iris = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.2 });
  const pupil = new THREE.MeshStandardMaterial({ color: 0x120c08, roughness: 0.15 });
  const lash = new THREE.MeshStandardMaterial({ color: 0x2a1d16, roughness: 0.7 });
  const nailMat = new THREE.MeshPhysicalMaterial({ color: 0xfbe3d6, roughness: 0.3, clearcoat: 0.6 });
  const mouthIn = new THREE.MeshStandardMaterial({ color: 0x7a2f2a, roughness: 0.7 });
  const tooth = new THREE.MeshStandardMaterial({ color: 0xfdfbf5, roughness: 0.35 });
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
  const skull = put(new THREE.Mesh(new THREE.SphereGeometry(0.115, 48, 36), skin), 0, 0, 0, head);
  const lids: THREE.Object3D[] = [];
  const brows: THREE.Mesh[] = [];
  const eyes: THREE.Group[] = [];
  skull.scale.set(1, 1.02, 0.97);
  // 볼과 턱이 조금 통통하다
  const cheekFill = put(new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 14), skin), 0, -0.035, 0.03, head);
  cheekFill.scale.set(1.12, 0.8, 0.9);
  for (const side of [-1, 1]) {
    // 눈 — 흰자 위에 눈동자, 그 위에 빛 반짝임
    const eyeWhite = put(new THREE.Mesh(new THREE.SphereGeometry(0.019, 16, 12), white), side * 0.04, 0.008, 0.098, head);
    eyeWhite.scale.set(1, 1.1, 0.5);
    // 홍채 위에 검은 눈동자, 그 위에 큰 반짝임과 작은 반짝임 — 묶어서 보는 쪽으로 옮긴다
    const eye = new THREE.Group();
    head.add(eye);
    put(new THREE.Mesh(new THREE.SphereGeometry(0.0125, 20, 14), iris), side * 0.04, 0.006, 0.1075, eye).scale.set(1, 1.1, 0.45);
    put(new THREE.Mesh(new THREE.SphereGeometry(0.0066, 14, 10), pupil), side * 0.04, 0.006, 0.1112, eye).scale.set(1, 1.1, 0.4);
    put(new THREE.Mesh(new THREE.SphereGeometry(0.0034, 8, 6), shine), side * 0.04 + 0.0042, 0.0122, 0.1142, eye).castShadow = false;
    put(new THREE.Mesh(new THREE.SphereGeometry(0.0016, 6, 5), shine), side * 0.04 - 0.004, 0.0012, 0.1138, eye).castShadow = false;
    eyes.push(eye);
    // 눈꺼풀 — 눈을 덮는 반구를 돌려 감는다. 가장자리에 속눈썹이 붙는다
    const socket = new THREE.Group();
    socket.position.set(side * 0.04, 0.008, 0.098);
    socket.scale.set(1.04, 1.14, 0.56);
    head.add(socket);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0205, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), skin);
    const lashes = new THREE.Mesh(new THREE.TorusGeometry(0.0206, 0.0013, 5, 18, Math.PI), lash);
    lashes.rotation.x = Math.PI / 2;
    lid.add(lashes);
    lid.rotation.x = -0.62;
    socket.add(lid);
    lids.push(lid);
    const b = put(new THREE.Mesh(new THREE.CapsuleGeometry(0.004, 0.018, 2, 6), brow), side * 0.041, 0.038, 0.104, head);
    b.rotation.z = Math.PI / 2 + side * 0.15;
    brows.push(b);
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
  // 벌려 웃는 입 — 입 안과 윗니. 기쁠 때만 보인다
  const laugh = new THREE.Group();
  laugh.position.set(0, -0.043, 0.1075);
  laugh.rotation.x = 0.12;
  head.add(laugh);
  laugh.add(new THREE.Mesh(new THREE.CircleGeometry(0.0185, 20, Math.PI, Math.PI), mouthIn));
  const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.005, 0.002), tooth);
  teeth.position.set(0, -0.0028, 0.0012);
  laugh.add(teeth);
  laugh.visible = false;

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
  const hands: Hand[] = [];
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
    const made = makeHand(skin, nailMat, side);
    const end = made.group;
    end.position.y = -FORE_ARM;
    lower.add(end);
    hands.push(made.hand);
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
    head,
    hands,
    face: { lids, brows, eyes, laugh, seed: (look.charCodeAt(0) % 7) / 7 },
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
