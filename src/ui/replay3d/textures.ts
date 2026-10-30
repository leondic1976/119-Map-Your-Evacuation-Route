'use client';

/**
 * 절차형 PBR 재질 — 설계서 v1.19 §4.1.
 *
 * 색·법선·거칠기 세 장을 값 노이즈로 픽셀마다 굽는다. 바깥에서 받아오는 그림은 없다
 * (FR-11.2 · NFR-1). 높이는 색을 정할 때 함께 적고, 법선은 높이의 기울기에서 구한다.
 * 그래서 나무결은 홈이 파이고 타일 줄눈은 꺼져 보이며, 빛이 비스듬히 들면 결이 드러난다.
 *
 * 노이즈는 옥타브마다 격자값을 미리 굽고 픽셀에서는 넷을 섞기만 한다 — 1024² 한 장이 100ms 대다.
 * 한 벌은 한 장씩 프레임을 양보하며 굽는다(`makeSurfacesAsync`). 그동안은 정점 색으로 보인다.
 * 모든 무늬는 같은 seed 에서 같은 모양으로 나온다 — 화질을 바꿔도 집이 달라 보이지 않는다.
 */
import * as THREE from 'three';

export type SurfaceKind = 'wood' | 'tile' | 'terrazzo' | 'plaster' | 'furniture' | 'grass' | 'asphalt' | 'pavers' | 'rug' | 'roof';

export interface Surface {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  dispose(): void;
}

export type Surfaces = Record<SurfaceKind, Surface> & { id: string; dispose(): void };

/* ------------------------------------------------------------ 노이즈 */

function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * 되풀이되는 값 노이즈 한 옥타브. 가로 nx · 세로 ny 칸의 격자값을 미리 굽는다.
 * u·v 가 0..1 을 한 바퀴 돌면 격자도 한 바퀴라 이어 붙여도 이음새가 없다.
 */
class Lattice {
  private readonly nx: number;
  private readonly ny: number;
  private readonly v: Float32Array;

  constructor(fx: number, fy: number, seed: number) {
    this.nx = Math.max(1, Math.round(fx));
    this.ny = Math.max(1, Math.round(fy));
    this.v = new Float32Array(this.nx * this.ny);
    for (let y = 0; y < this.ny; y += 1) {
      for (let x = 0; x < this.nx; x += 1) this.v[y * this.nx + x] = hash2(x + seed * 1013, y + seed * 7919);
    }
  }

  at(u: number, w: number): number {
    const x = u * this.nx;
    const y = w * this.ny;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = smooth(x - xi);
    const fy = smooth(y - yi);
    const x0 = ((xi % this.nx) + this.nx) % this.nx;
    const y0 = ((yi % this.ny) + this.ny) % this.ny;
    const x1 = (x0 + 1) % this.nx;
    const y1 = (y0 + 1) % this.ny;
    const row0 = y0 * this.nx;
    const row1 = y1 * this.nx;
    const a = this.v[row0 + x0];
    const b = this.v[row0 + x1];
    const c = this.v[row1 + x0];
    const d = this.v[row1 + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
}

/** 여러 옥타브를 겹친 노이즈. fx·fy 는 한 변에 몇 칸인지다 */
class Fbm {
  private readonly layers: Lattice[] = [];

  constructor(fx: number, fy: number, octaves: number, seed: number) {
    let ax = fx;
    let ay = fy;
    for (let i = 0; i < octaves; i += 1) {
      this.layers.push(new Lattice(ax, ay, seed + i * 31));
      ax *= 2;
      ay *= 2;
    }
  }

  at(u: number, v: number): number {
    let sum = 0;
    let amp = 0.5;
    let total = 0;
    for (const layer of this.layers) {
      sum += layer.at(u, v) * amp;
      total += amp;
      amp *= 0.5;
    }
    return sum / total;
  }
}

/* ------------------------------------------------------------ 픽셀 규칙 */

interface Pixel {
  r: number;
  g: number;
  b: number;
  /** 0..1 — 법선 맵을 만드는 높이 */
  h: number;
  /** 0..1 — 거칠기. 1 이면 무광 */
  rough: number;
}

type Painter = (u: number, v: number, out: Pixel) => void;

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function tint(out: Pixel, base: [number, number, number], k: number): void {
  out.r = base[0] * k;
  out.g = base[1] * k;
  out.b = base[2] * k;
}

function fract(x: number): number {
  return x - Math.floor(x);
}

/** 나무 널빤지 — 결·널 사이 홈. fine 은 가구·문짝용 잔결 */
function wood(fine: boolean): Painter {
  const base = fine ? hex('#a9793f') : hex('#b98d5e');
  const rows = fine ? 10 : 6;
  /* 결 — 가로로 길게 늘어진 노이즈를 띠로 만든다 */
  const grain = new Fbm(fine ? 4 : 3, fine ? 48 : 30, 3, 1);
  return (u, v, out) => {
    const row = Math.floor(v * rows);
    const rowSeed = hash2(row, 7);
    const plankTone = 0.9 + rowSeed * 0.2;
    const g = grain.at(u + rowSeed, v);
    const ring = fract(g * (fine ? 5 : 3.4) + u * 1.5);
    const stripe = 0.82 + 0.18 * smooth(Math.abs(ring - 0.5) * 2);
    /* 널 끝 이음매는 줄마다 어긋난다 */
    const along = fract(u * 2 + rowSeed);
    const endSeam = fine ? 0 : along < 0.012 || along > 0.988 ? 1 : 0;
    const vInRow = fract(v * rows);
    const sideSeam = vInRow < 0.03 || vInRow > 0.97 ? 1 : 0;
    const seam = Math.max(endSeam, sideSeam);
    tint(out, base, plankTone * stripe * (1 - seam * 0.45));
    out.h = (1 - seam) * (0.6 + 0.4 * stripe);
    out.rough = 0.5 + 0.22 * (1 - stripe) + seam * 0.3;
  };
}

/** 정사각 타일과 줄눈 */
function tile(): Painter {
  const face = hex('#dcd8cd');
  const grout = hex('#8f8d86');
  const n = 5;
  const speckle = new Fbm(160, 160, 2, 3);
  const groutGrit = new Fbm(80, 80, 2, 4);
  return (u, v, out) => {
    const gw = 0.035;
    const fu = fract(u * n);
    const fv = fract(v * n);
    const inGrout = fu < gw || fu > 1 - gw || fv < gw || fv > 1 - gw;
    if (inGrout) {
      tint(out, grout, 0.9 + 0.2 * groutGrit.at(u, v));
      out.h = 0.15;
      out.rough = 0.92;
      return;
    }
    const cell = hash2(Math.floor(u * n), Math.floor(v * n));
    const speck = speckle.at(u, v);
    tint(out, face, 0.95 + cell * 0.08 + (speck - 0.5) * 0.08);
    out.h = 0.85 + speck * 0.08;
    out.rough = 0.32 + speck * 0.12;
  };
}

/** 테라조 — 회색 바탕에 돌조각 */
function terrazzo(): Painter {
  const base = hex('#b3b1ac');
  const chips: [number, number, number][] = [hex('#eae5da'), hex('#6d7378'), hex('#c58c72'), hex('#3f4b56')];
  const cells = 22;
  const grain = new Fbm(120, 120, 2, 5);
  return (u, v, out) => {
    const cx = Math.floor(u * cells);
    const cy = Math.floor(v * cells);
    let chip = -1;
    let edge = 0;
    for (let dy = -1; dy <= 1 && chip < 0; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const gx = (cx + dx + cells) % cells;
        const gy = (cy + dy + cells) % cells;
        const ox = hash2(gx, gy * 3 + 1);
        const oy = hash2(gx * 5 + 2, gy);
        const r = (0.12 + hash2(gx * 7, gy * 11) * 0.22) / cells;
        const px = (cx + dx + ox) / cells;
        const py = (cy + dy + oy) / cells;
        const d = Math.hypot(u - px, (v - py) * (0.8 + hash2(gx, gy) * 0.4));
        if (d < r) {
          chip = Math.floor(hash2(gx * 13, gy * 17) * chips.length);
          edge = d / r;
          break;
        }
      }
    }
    const g = grain.at(u, v);
    if (chip >= 0) {
      tint(out, chips[chip], 0.92 + g * 0.12);
      out.h = 0.62 + (1 - edge) * 0.1;
      out.rough = 0.42;
      return;
    }
    tint(out, base, 0.94 + g * 0.1);
    out.h = 0.6;
    out.rough = 0.55;
  };
}

/** 석고 벽 — 미세한 울퉁불퉁함 */
function plaster(): Painter {
  const base = hex('#ece9e3');
  const bump = new Fbm(24, 24, 3, 9);
  return (u, v, out) => {
    const n = bump.at(u, v);
    tint(out, base, 0.95 + (n - 0.5) * 0.08);
    out.h = 0.5 + (n - 0.5) * 0.5;
    out.rough = 0.9;
  };
}

/** 잔디 — 줄기 결과 흙 자국 */
function grass(): Painter {
  const low = hex('#3f6d2a');
  const high = hex('#86ad4b');
  const dirt = hex('#7b6a4a');
  const patch = new Fbm(5, 5, 3, 21);
  /* 줄기 — 세로로 긴 격자라 결이 위아래로 선다 */
  const blade = new Fbm(90, 7, 2, 22);
  const soil = new Fbm(3, 3, 2, 23);
  return (u, v, out) => {
    const p = patch.at(u, v);
    const b = blade.at(u, v);
    const k = Math.min(1, Math.max(0, p * 0.7 + b * 0.5 - 0.1));
    let r = low[0] + (high[0] - low[0]) * k;
    let g = low[1] + (high[1] - low[1]) * k;
    let bl = low[2] + (high[2] - low[2]) * k;
    const dirtiness = Math.max(0, (soil.at(u, v) - 0.62) * 3);
    r += (dirt[0] - r) * dirtiness;
    g += (dirt[1] - g) * dirtiness;
    bl += (dirt[2] - bl) * dirtiness;
    out.r = r;
    out.g = g;
    out.b = bl;
    out.h = 0.5 + (b - 0.5) * 0.8 + (p - 0.5) * 0.3;
    out.rough = 0.96;
  };
}

/** 아스팔트 — 잔 알갱이 */
function asphalt(): Painter {
  const base = hex('#454a4f');
  const grit = new Fbm(220, 220, 2, 31);
  const wear = new Fbm(6, 6, 2, 32);
  return (u, v, out) => {
    const g = grit.at(u, v);
    tint(out, base, 0.78 + g * 0.4 + (wear.at(u, v) - 0.5) * 0.12);
    out.h = 0.5 + (g - 0.5) * 0.9;
    out.rough = 0.86;
  };
}

/** 보도 블록 — 줄마다 어긋난 직사각형 */
function pavers(): Painter {
  const base = hex('#bcb6aa');
  const grout = hex('#8a857b');
  const cols = 4;
  const rows = 8;
  const grit = new Fbm(180, 180, 2, 41);
  return (u, v, out) => {
    const row = Math.floor(v * rows);
    const shift = row % 2 ? 0.5 : 0;
    const fu = fract(u * cols + shift);
    const fv = fract(v * rows);
    const gw = 0.04;
    const inGrout = fu < gw || fu > 1 - gw || fv < gw * 2 || fv > 1 - gw * 2;
    const g = grit.at(u, v);
    if (inGrout) {
      tint(out, grout, 0.9 + g * 0.2);
      out.h = 0.2;
      out.rough = 0.9;
      return;
    }
    const cell = hash2(Math.floor(u * cols + shift) + row * 31, row);
    tint(out, base, 0.92 + cell * 0.12 + (g - 0.5) * 0.1);
    out.h = 0.8 + (g - 0.5) * 0.15;
    out.rough = 0.8;
  };
}

/** 러그 — 직조 결과 테두리. 색은 재질 쪽에서 입힌다 */
function rug(): Painter {
  return (u, v, out) => {
    const weave = 0.86 + 0.14 * Math.abs(Math.sin(u * Math.PI * 160) * Math.sin(v * Math.PI * 160));
    const border = u < 0.06 || u > 0.94 || v < 0.08 || v > 0.92 ? 0.72 : 1;
    const inner = u < 0.1 || u > 0.9 || v < 0.13 || v > 0.87 ? 0.9 : 1;
    const k = weave * border * inner;
    out.r = k;
    out.g = k;
    out.b = k;
    out.h = 0.5 + (weave - 0.93) * 3;
    out.rough = 0.98;
  };
}

/** 지붕 기와 — 줄마다 어긋난 널 */
function roof(): Painter {
  const base = hex('#6b4f3f');
  const rows = 10;
  const cols = 6;
  const grit = new Fbm(90, 90, 2, 51);
  return (u, v, out) => {
    const row = Math.floor(v * rows);
    const shift = row % 2 ? 0.5 : 0;
    const fv = fract(v * rows);
    const fu = fract(u * cols + shift);
    const cell = hash2(Math.floor(u * cols + shift) + row * 17, row * 3);
    const edge = fv < 0.08 ? 1 : 0;
    const gap = fu < 0.03 ? 1 : 0;
    const g = grit.at(u, v);
    tint(out, base, (0.86 + cell * 0.2 + (g - 0.5) * 0.1) * (1 - edge * 0.45 - gap * 0.25));
    out.h = 1 - fv * 0.3 - edge * 0.4 - gap * 0.3;
    out.rough = 0.88;
  };
}

/* ------------------------------------------------------------ 굽기 */

const NORMAL_STRENGTH: Record<SurfaceKind, number> = {
  wood: 1.4,
  tile: 2.2,
  terrazzo: 0.9,
  plaster: 0.7,
  furniture: 0.9,
  grass: 1.6,
  asphalt: 1.1,
  pavers: 2.2,
  rug: 0.9,
  roof: 2.2,
};

const PAINTERS: Record<SurfaceKind, () => Painter> = {
  wood: () => wood(false),
  tile,
  terrazzo,
  plaster,
  furniture: () => wood(true),
  grass,
  asphalt,
  pavers,
  rug,
  roof,
};

function textureOf(canvas: HTMLCanvasElement, color: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** 한 종류를 세 장(색·법선·거칠기)으로 굽는다 */
export function makeSurface(kind: SurfaceKind, size: number): Surface {
  const paint = PAINTERS[kind]();
  const n = size * size;
  const color = new Uint8ClampedArray(n * 4);
  const rough = new Uint8ClampedArray(n * 4);
  const height = new Float32Array(n);
  const px: Pixel = { r: 0, g: 0, b: 0, h: 0.5, rough: 0.8 };
  const inv = 1 / size;

  for (let y = 0; y < size; y += 1) {
    const v = y * inv;
    for (let x = 0; x < size; x += 1) {
      paint(x * inv, v, px);
      const i = y * size + x;
      const o = i * 4;
      color[o] = px.r * 255;
      color[o + 1] = px.g * 255;
      color[o + 2] = px.b * 255;
      color[o + 3] = 255;
      const rg = px.rough * 255;
      rough[o] = rg;
      rough[o + 1] = rg;
      rough[o + 2] = rg;
      rough[o + 3] = 255;
      height[i] = px.h;
    }
  }

  /* 법선 — 높이의 가운데 차분. 가장자리는 반대쪽으로 이어진다 (되풀이 무늬) */
  const normal = new Uint8ClampedArray(n * 4);
  const strength = NORMAL_STRENGTH[kind] * (size / 512);
  for (let y = 0; y < size; y += 1) {
    const ym = ((y - 1 + size) % size) * size;
    const yp = ((y + 1) % size) * size;
    const row = y * size;
    for (let x = 0; x < size; x += 1) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dx = (height[row + xp] - height[row + xm]) * strength;
      const dy = (height[yp + x] - height[ym + x]) * strength;
      const len = Math.hypot(dx, dy, 1);
      const o = (row + x) * 4;
      normal[o] = (-dx / len) * 127.5 + 127.5;
      /* three 의 법선 맵은 +Y 가 위다 (OpenGL 규약) */
      normal[o + 1] = (dy / len) * 127.5 + 127.5;
      normal[o + 2] = (1 / len) * 127.5 + 127.5;
      normal[o + 3] = 255;
    }
  }

  const put = (data: Uint8ClampedArray): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.putImageData(new ImageData(data, size, size), 0, 0);
    return canvas;
  };

  const map = textureOf(put(color), true);
  const normalMap = textureOf(put(normal), false);
  const roughnessMap = textureOf(put(rough), false);
  return {
    map,
    normalMap,
    roughnessMap,
    dispose() {
      map.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
    },
  };
}

/** 바닥 셋은 주어진 크기로, 나머지는 512 까지만 — 결이 거칠어 더 커도 티가 나지 않고 굽는 시간만 든다 */
function sizesFor(size: 512 | 1024): [SurfaceKind, number][] {
  const small = Math.min(512, size);
  return [
    ['wood', size],
    ['tile', size],
    ['terrazzo', size],
    ['plaster', small],
    ['furniture', small],
    ['grass', small],
    ['pavers', small],
    ['asphalt', small],
    ['rug', small],
    ['roof', small],
  ];
}

function bundle(made: Record<SurfaceKind, Surface>, size: number): Surfaces {
  return {
    ...made,
    id: `surfaces-${size}`,
    dispose() {
      for (const s of Object.values(made)) s.dispose();
    },
  };
}

/** 한 화질에 쓰는 재질 한 벌을 한 번에 굽는다 — 검증과 측정용. 화면은 아래 비동기 판을 쓴다 */
export function makeSurfaces(size: 512 | 1024): Surfaces {
  const made = {} as Record<SurfaceKind, Surface>;
  for (const [kind, s] of sizesFor(size)) made[kind] = makeSurface(kind, s);
  return bundle(made, size);
}

const yieldFrame = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * 한 장 굽고 한 프레임 쉰다 — 3D 가 열리는 순간 화면이 멎지 않게.
 * 중간에 그만두라고 하면(화질 전환·닫기) 구운 것을 치우고 null 을 돌려준다.
 */
export async function makeSurfacesAsync(size: 512 | 1024, cancelled: () => boolean): Promise<Surfaces | null> {
  const made: Partial<Record<SurfaceKind, Surface>> = {};
  for (const [kind, s] of sizesFor(size)) {
    await yieldFrame();
    if (cancelled()) break;
    made[kind] = makeSurface(kind, s);
  }
  if (cancelled() || Object.keys(made).length < sizesFor(size).length) {
    for (const s of Object.values(made)) s?.dispose();
    return null;
  }
  return bundle(made as Record<SurfaceKind, Surface>, size);
}

/** 세 장의 되풀이 수를 한꺼번에 맞춘다 */
export function repeatSurface(s: Surface, x: number, y = x): void {
  s.map.repeat.set(x, y);
  s.normalMap.repeat.set(x, y);
  s.roughnessMap.repeat.set(x, y);
}
