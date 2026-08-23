/**
 * 도면 이미지 자동 인식.
 *
 * Otsu 이진화로 벽선을 분리하고, 흰 영역을 연결요소로 묶어 실 후보를 얻는다.
 * 완전 자동은 목표가 아니며, 이용자가 임계값·최소 면적을 조절해 보정하는
 * 반자동 절차를 전제로 한다. 인식이 실패해도 배경으로만 쓰는 우회 경로가 있다.
 */

export interface Bitmap {
  width: number;
  height: number;
  /** RGBA */
  data: Uint8ClampedArray | Uint8Array;
}

export interface TraceOptions {
  /** 0 = Otsu 자동. 1~254 = 수동 임계값 */
  threshold?: number;
  /** 벽선 두께 보정 — 끊어진 벽을 잇는다 (px) */
  closeGap?: number;
  /** 실로 인정할 최소 면적 (px²) */
  minArea?: number;
  /** 사각형 충실도 하한 (면적/외접사각형 면적) */
  minFill?: number;
  /** 긴 변 인식 최소 길이 (px) */
  minLine?: number;
  /** 처리 해상도 상한 (긴 변 px) */
  maxSize?: number;
}

export interface DetectedRoom {
  /** 원본 이미지 픽셀 좌표 */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 연결요소 면적(px²) */
  area: number;
  /** 외접사각형 대비 충실도 0~1 */
  fill: number;
}

export interface DetectedLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dir: 'h' | 'v';
}

export interface TraceResult {
  threshold: number;
  scale: number;
  width: number;
  height: number;
  rooms: DetectedRoom[];
  lines: DetectedLine[];
  /** 벽(어두운 픽셀) 비율 */
  inkRatio: number;
  /** 폐기된 후보 수 */
  rejected: number;
}

const DEFAULTS: Required<TraceOptions> = {
  threshold: 0,
  closeGap: 2,
  minArea: 900,
  minFill: 0.55,
  minLine: 40,
  maxSize: 1000,
};

/** RGBA → 8bit 그레이스케일 (필요 시 축소) */
export function toGray(img: Bitmap, maxSize: number): { gray: Uint8Array; w: number; h: number; scale: number } {
  const long = Math.max(img.width, img.height);
  const scale = long > maxSize ? maxSize / long : 1;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const gray = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(img.height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(img.width - 1, Math.floor(x / scale));
      const o = (sy * img.width + sx) * 4;
      const r = img.data[o];
      const g = img.data[o + 1];
      const b = img.data[o + 2];
      const a = img.data[o + 3];
      // 투명 픽셀은 흰 배경으로 간주
      const v = a < 16 ? 255 : (r * 299 + g * 587 + b * 114) / 1000;
      gray[y * w + x] = v;
    }
  }
  return { gray, w, h, scale };
}

/** Otsu 임계값 */
export function otsu(gray: Uint8Array): number {
  const hist = new Int32Array(256);
  for (let i = 0; i < gray.length; i += 1) hist[gray[i]] += 1;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestVar = -1;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = t;
    }
  }
  return best;
}

/** 어두운 픽셀(벽) = 1 */
function binarize(gray: Uint8Array, threshold: number): Uint8Array {
  const bin = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i += 1) bin[i] = gray[i] <= threshold ? 1 : 0;
  return bin;
}

/** 벽 팽창 — 끊긴 선을 잇는다 */
function dilate(bin: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  if (radius <= 0) return bin;
  let cur = bin;
  for (let step = 0; step < radius; step += 1) {
    const next = new Uint8Array(cur.length);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        if (cur[i]) {
          next[i] = 1;
          continue;
        }
        if (
          (x > 0 && cur[i - 1]) ||
          (x < w - 1 && cur[i + 1]) ||
          (y > 0 && cur[i - w]) ||
          (y < h - 1 && cur[i + w])
        ) {
          next[i] = 1;
        }
      }
    }
    cur = next;
  }
  return cur;
}

interface Component {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
  touchesBorder: boolean;
}

/** 흰 영역 연결요소 (4-이웃) */
function components(bin: Uint8Array, w: number, h: number): Component[] {
  const seen = new Uint8Array(bin.length);
  const stack = new Int32Array(bin.length);
  const out: Component[] = [];
  for (let s = 0; s < bin.length; s += 1) {
    if (bin[s] || seen[s]) continue;
    let sp = 0;
    stack[sp] = s;
    sp += 1;
    seen[s] = 1;
    const comp: Component = {
      minX: w,
      minY: h,
      maxX: -1,
      maxY: -1,
      area: 0,
      touchesBorder: false,
    };
    while (sp > 0) {
      sp -= 1;
      const i = stack[sp];
      const x = i % w;
      const y = (i - x) / w;
      comp.area += 1;
      if (x < comp.minX) comp.minX = x;
      if (y < comp.minY) comp.minY = y;
      if (x > comp.maxX) comp.maxX = x;
      if (y > comp.maxY) comp.maxY = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) comp.touchesBorder = true;
      if (x > 0 && !bin[i - 1] && !seen[i - 1]) {
        seen[i - 1] = 1;
        stack[sp] = i - 1;
        sp += 1;
      }
      if (x < w - 1 && !bin[i + 1] && !seen[i + 1]) {
        seen[i + 1] = 1;
        stack[sp] = i + 1;
        sp += 1;
      }
      if (y > 0 && !bin[i - w] && !seen[i - w]) {
        seen[i - w] = 1;
        stack[sp] = i - w;
        sp += 1;
      }
      if (y < h - 1 && !bin[i + w] && !seen[i + w]) {
        seen[i + w] = 1;
        stack[sp] = i + w;
        sp += 1;
      }
    }
    out.push(comp);
  }
  return out;
}

/** 긴 수평·수직 벽선 추출 */
function longLines(bin: Uint8Array, w: number, h: number, minLen: number): DetectedLine[] {
  const out: DetectedLine[] = [];
  const rowStep = 2;
  for (let y = 0; y < h; y += rowStep) {
    let run = 0;
    for (let x = 0; x <= w; x += 1) {
      const on = x < w && bin[y * w + x] === 1;
      if (on) {
        run += 1;
      } else {
        if (run >= minLen) out.push({ x1: x - run, y1: y, x2: x - 1, y2: y, dir: 'h' });
        run = 0;
      }
    }
  }
  for (let x = 0; x < w; x += rowStep) {
    let run = 0;
    for (let y = 0; y <= h; y += 1) {
      const on = y < h && bin[y * w + x] === 1;
      if (on) {
        run += 1;
      } else {
        if (run >= minLen) out.push({ x1: x, y1: y - run, x2: x, y2: y - 1, dir: 'v' });
        run = 0;
      }
    }
  }
  return mergeLines(out);
}

/** 인접한 같은 방향 선을 하나로 합친다 */
function mergeLines(lines: DetectedLine[]): DetectedLine[] {
  const out: DetectedLine[] = [];
  const used = new Uint8Array(lines.length);
  for (let i = 0; i < lines.length; i += 1) {
    if (used[i]) continue;
    const a = { ...lines[i] };
    used[i] = 1;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (used[j]) continue;
      const b = lines[j];
      if (b.dir !== a.dir) continue;
      if (a.dir === 'h') {
        if (Math.abs(b.y1 - a.y1) <= 6 && b.x1 <= a.x2 + 8 && b.x2 >= a.x1 - 8) {
          a.x1 = Math.min(a.x1, b.x1);
          a.x2 = Math.max(a.x2, b.x2);
          used[j] = 1;
        }
      } else if (Math.abs(b.x1 - a.x1) <= 6 && b.y1 <= a.y2 + 8 && b.y2 >= a.y1 - 8) {
        a.y1 = Math.min(a.y1, b.y1);
        a.y2 = Math.max(a.y2, b.y2);
        used[j] = 1;
      }
    }
    out.push(a);
  }
  return out;
}

/** 도면 이미지 → 실 후보·벽선 */
export function trace(img: Bitmap, options: TraceOptions = {}): TraceResult {
  const o = { ...DEFAULTS, ...options };
  const { gray, w, h, scale } = toGray(img, o.maxSize);
  const threshold = o.threshold > 0 ? o.threshold : otsu(gray);
  const raw = binarize(gray, threshold);
  let ink = 0;
  for (let i = 0; i < raw.length; i += 1) ink += raw[i];
  const bin = dilate(raw, w, h, Math.max(0, Math.round(o.closeGap)));

  const comps = components(bin, w, h);
  const rooms: DetectedRoom[] = [];
  let rejected = 0;
  for (const c of comps) {
    if (c.touchesBorder) {
      rejected += 1;
      continue;
    }
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    const fill = c.area / (bw * bh);
    if (c.area < o.minArea || fill < o.minFill || bw < 12 || bh < 12) {
      rejected += 1;
      continue;
    }
    rooms.push({
      x: c.minX / scale,
      y: c.minY / scale,
      w: bw / scale,
      h: bh / scale,
      area: c.area / (scale * scale),
      fill,
    });
  }
  rooms.sort((a, b) => b.area - a.area);

  const lines = longLines(bin, w, h, o.minLine).map((l) => ({
    x1: l.x1 / scale,
    y1: l.y1 / scale,
    x2: l.x2 / scale,
    y2: l.y2 / scale,
    dir: l.dir,
  }));

  return {
    threshold,
    scale,
    width: img.width,
    height: img.height,
    rooms,
    lines,
    inkRatio: ink / raw.length,
    rejected,
  };
}

/**
 * 인식 결과의 총 면적이 목표 전용면적이 되도록 하는 축척(cm/px)을 구한다.
 * 이용자가 벽 두 점을 찍어 실측 보정하는 방법도 함께 제공한다.
 */
export function scaleFromArea(rooms: DetectedRoom[], targetAreaM2: number): number {
  const px2 = rooms.reduce((s, r) => s + r.w * r.h, 0);
  if (px2 <= 0 || targetAreaM2 <= 0) return 1;
  // targetArea(m2) = px2 * (cmPerPx^2) / 10000
  return Math.sqrt((targetAreaM2 * 10000) / px2);
}

/** 두 점 사이 실측 거리(cm)로부터 축척(cm/px) */
export function scaleFromMeasure(pxDistance: number, cmDistance: number): number {
  if (pxDistance <= 0) return 1;
  return cmDistance / pxDistance;
}
