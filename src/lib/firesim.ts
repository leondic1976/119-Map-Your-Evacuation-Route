/**
 * 연기·화염 확산 해석 (교육용 근사 모델).
 *
 * 매 프레임 물리 연산을 하는 대신, 발화점에서 각 셀까지의 **도달 시각**을
 * 다익스트라로 한 번만 계산한다. 덕분에 타임라인을 임의 시각으로 즉시 옮길 수 있고,
 * 84㎡ 평면 기준 전 시간대 해석이 1초 안에 끝난다.
 *
 * 성능위주설계(FDS 등) 해석이 아니며, 소방 교육자료에서 통용되는 눈높이 수치를
 * 채택한 근사값이다.
 */
import { Grid, cellAt, cellCenter } from './grid';
import { MinHeap } from './heap';
import { Door, Plan, Pt, Route } from './types';

export interface FireCause {
  key: string;
  label: string;
  /** 성장 배수 — 확산 속도와 문 지연에 함께 작용 */
  growth: number;
  note: string;
}

export const FIRE_CAUSES: FireCause[] = [
  { key: 'kitchen', label: '주방 조리기구(식용유)', growth: 1.35, note: '유증기 착화로 초기 확산이 빠르다. 물을 부으면 급격히 확대된다.' },
  { key: 'electric', label: '전기 배선·콘센트', growth: 1.0, note: '벽체 내부에서 훈소하다 확대되는 경우가 많다.' },
  { key: 'battery', label: '리튬이온 배터리', growth: 1.8, note: '열폭주로 순식간에 확산하고 유독가스가 많다. 소화기로 진화가 어렵다.' },
  { key: 'smoking', label: '담뱃불·침구', growth: 0.75, note: '오래 훈소하다 발화한다. 야간 인지가 늦다.' },
  { key: 'heater', label: '난방기기·전열기구', growth: 1.1, note: '가연물 접촉 발화. 겨울철 사고가 집중된다.' },
];

export function getCause(key: string): FireCause {
  return FIRE_CAUSES.find((c) => c.key === key) ?? FIRE_CAUSES[1];
}

/** 열린 공간 연기 수평 확산 속도 (m/s) */
export const SMOKE_SPEED = 0.9;
/**
 * 화염 확산 속도 (m/s).
 * 연기가 세대를 채우는 동안 화염은 발화실 주변에 머문다 — 분당 1.5m 정도로 본다.
 */
export const FLAME_SPEED = 0.025;
/** 닫힌 문 통과 지연 (s) */
export const DOOR_DELAY_SMOKE = 80;
export const DOOR_DELAY_FLAME = 300;
/**
 * 연기 도달 후 농도가 위험 수준까지 오르는 데 걸리는 시간 (s).
 *
 * 0.9m/s 는 천장 아래를 달리는 연기 '선단'의 속도다. 선단이 지나갔다고 곧바로
 * 지나갈 수 없게 되는 것은 아니며, 연기층이 내려와 시야와 호흡을 막기까지
 * 시간이 걸린다. 그 시간을 이 상수로 근사한다.
 */
export const DENSITY_RAMP = 60;

/** 통행 불가로 보는 농도 — 이 값을 넘긴 시각이 그 지점의 차단 시각이다 */
export const BLOCK_LEVEL = 0.5;

export interface SmokeField {
  /** 셀별 연기 도달 시각(s). 미도달 = Infinity */
  smoke: Float64Array;
  /** 셀별 화염 도달 시각(s) */
  flame: Float64Array;
  originCell: number;
  origin: Pt;
  cause: string;
  growth: number;
  /** 통행 가능 총 면적(㎡) */
  totalArea: number;
  /** 해석 소요 시간(ms) */
  elapsedMs: number;
}

function doorMap(plan: Plan): Door[] {
  return plan.doors;
}

function spread(
  g: Grid,
  doors: Door[],
  origin: number,
  speed: number,
  doorDelay: number,
  growth: number,
  closed?: Set<string>,
): Float64Array {
  const n = g.cols * g.rows;
  // Float64 — 반올림으로 힙 재방문 판정이 어긋나면 확산이 멈춘다
  const t = new Float64Array(n).fill(Infinity);
  if (origin < 0 || !g.walk[origin]) return t;
  const stepM = g.cell / 100;
  const base = stepM / (speed * growth);
  const delay = doorDelay / growth;
  const heap = new MinHeap(Math.max(64, n >> 3));
  t[origin] = 0;
  heap.push(0, origin);
  for (;;) {
    const top = heap.pop();
    if (!top) break;
    const i = top.val;
    if (top.key > t[i]) continue;
    const c = i % g.cols;
    const r = (i - c) / g.cols;
    const left = c > 0 && g.walk[i - 1] === 1;
    const right = c < g.cols - 1 && g.walk[i + 1] === 1;
    const up = r > 0 && g.walk[i - g.cols] === 1;
    const down = r < g.rows - 1 && g.walk[i + g.cols] === 1;
    // 8방향 — 4방향만 쓰면 확산 경계가 마름모꼴로 보인다.
    // 대각선은 양옆이 모두 열려 있을 때만 허용한다(벽 모서리 관통 금지).
    const nb: [number, number][] = [];
    if (left) nb.push([i - 1, 1]);
    if (right) nb.push([i + 1, 1]);
    if (up) nb.push([i - g.cols, 1]);
    if (down) nb.push([i + g.cols, 1]);
    if (left && up && g.walk[i - g.cols - 1]) nb.push([i - g.cols - 1, Math.SQRT2]);
    if (right && up && g.walk[i - g.cols + 1]) nb.push([i - g.cols + 1, Math.SQRT2]);
    if (left && down && g.walk[i + g.cols - 1]) nb.push([i + g.cols - 1, Math.SQRT2]);
    if (right && down && g.walk[i + g.cols + 1]) nb.push([i + g.cols + 1, Math.SQRT2]);
    for (const [j, k] of nb) {
      if (j < 0 || !g.walk[j]) continue;
      let w = base * k;
      const dj = g.door[j];
      if (dj >= 0 && g.door[i] !== dj) {
        const d = doors[dj];
        if (d) {
          // 이용자가 대피 중 닫은 문은 추가 지연을 준다
          if (closed && closed.has(d.id)) w += delay * 2;
          else if (!d.alwaysOpen) w += delay;
        }
      }
      const nt = t[i] + w;
      if (nt < t[j]) {
        t[j] = nt;
        heap.push(nt, j);
      }
    }
  }
  return t;
}

export function simulate(
  plan: Plan,
  g: Grid,
  origin: Pt,
  causeKey: string,
  closedDoorIds?: string[],
): SmokeField {
  const started = typeof performance !== 'undefined' ? performance.now() : 0;
  const cause = getCause(causeKey);
  const doors = doorMap(plan);
  let cell = cellAt(g, origin.x, origin.y);
  if (cell < 0 || !g.walk[cell]) {
    // 발화점이 벽·실 밖이면 가장 가까운 통행 셀로 보정
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < g.walk.length; i += 1) {
      if (!g.walk[i]) continue;
      const p = cellCenter(g, i);
      const d = (p.x - origin.x) ** 2 + (p.y - origin.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    cell = best;
  }
  const closed = closedDoorIds && closedDoorIds.length ? new Set(closedDoorIds) : undefined;
  const smoke = spread(g, doors, cell, SMOKE_SPEED, DOOR_DELAY_SMOKE, cause.growth, closed);
  const flame = spread(g, doors, cell, FLAME_SPEED, DOOR_DELAY_FLAME, cause.growth, closed);
  let cells = 0;
  for (let i = 0; i < g.walk.length; i += 1) if (g.walk[i]) cells += 1;
  const ended = typeof performance !== 'undefined' ? performance.now() : 0;
  return {
    smoke,
    flame,
    originCell: cell,
    origin: cell >= 0 ? cellCenter(g, cell) : origin,
    cause: cause.key,
    growth: cause.growth,
    totalArea: (cells * g.cell * g.cell) / 10000,
    elapsedMs: ended - started,
  };
}

/** 시각 t 에서의 연기 농도 (0~1) */
export function densityAt(field: SmokeField, i: number, t: number): number {
  const a = field.smoke[i];
  if (!isFinite(a) || t < a) return 0;
  return Math.min(1, (t - a) / DENSITY_RAMP);
}

/** 그 셀이 통행 불가가 되는 시각(s) — 연기 도달 후 농도가 차오르는 시간을 더한다 */
export function blockTime(field: SmokeField, i: number): number {
  const a = field.smoke[i];
  if (!isFinite(a)) return Infinity;
  return a + DENSITY_RAMP * BLOCK_LEVEL;
}

/** 시각 t 에서 연기가 도달한 면적(㎡) */
export function reachedArea(field: SmokeField, g: Grid, t: number): number {
  let n = 0;
  for (let i = 0; i < g.walk.length; i += 1) {
    if (!g.walk[i]) continue;
    if (field.smoke[i] <= t) n += 1;
  }
  return (n * g.cell * g.cell) / 10000;
}

/** 시각 t 에서 통행이 불가능해진 면적(㎡) */
export function blockedArea(field: SmokeField, g: Grid, t: number): number {
  let n = 0;
  for (let i = 0; i < g.walk.length; i += 1) {
    if (!g.walk[i]) continue;
    if (blockTime(field, i) <= t) n += 1;
  }
  return (n * g.cell * g.cell) / 10000;
}

export interface CurvePoint {
  t: number;
  /** 연기 선단이 도달한 면적(㎡) */
  reachedArea: number;
  /** 통행이 불가능해진 면적(㎡) */
  blockedArea: number;
  /** 화염 도달 면적(㎡) */
  flameArea: number;
  /** 차단 비율(0~1) */
  ratio: number;
}

/** 차단 면적 곡선 */
export function areaCurve(field: SmokeField, g: Grid, tMax = 300, step = 5): CurvePoint[] {
  const bins = Math.ceil(tMax / step) + 1;
  const reachCount = new Int32Array(bins);
  const blockCount = new Int32Array(bins);
  const flameCount = new Int32Array(bins);
  let total = 0;
  for (let i = 0; i < g.walk.length; i += 1) {
    if (!g.walk[i]) continue;
    total += 1;
    // 구간 b 는 ((b-1)·step, b·step] 을 담는다 — 누적하면 t=b·step 시점의 값이 된다
    const bin = (v: number) => Math.min(bins - 1, Math.ceil(v / step));
    const s = field.smoke[i];
    if (isFinite(s) && s <= tMax) reachCount[bin(s)] += 1;
    const bt = blockTime(field, i);
    if (isFinite(bt) && bt <= tMax) blockCount[bin(bt)] += 1;
    const f = field.flame[i];
    if (isFinite(f) && f <= tMax) flameCount[bin(f)] += 1;
  }
  const cellArea = (g.cell * g.cell) / 10000;
  const out: CurvePoint[] = [];
  let rAcc = 0;
  let bAcc = 0;
  let fAcc = 0;
  for (let b = 0; b < bins; b += 1) {
    rAcc += reachCount[b];
    bAcc += blockCount[b];
    fAcc += flameCount[b];
    out.push({
      t: b * step,
      reachedArea: rAcc * cellArea,
      blockedArea: bAcc * cellArea,
      flameArea: fAcc * cellArea,
      ratio: total ? bAcc / total : 0,
    });
  }
  return out;
}

/** 동선 위 샘플 점들 */
export function sampleRoute(route: Route, stepCm = 20): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i < route.points.length; i += 1) {
    const a = route.points[i - 1];
    const b = route.points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / stepCm));
    for (let k = 0; k <= steps; k += 1) {
      const t = k / steps;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  if (out.length === 0 && route.points.length) out.push(route.points[0]);
  return out;
}

export interface AsetResult {
  routeId: string;
  /** 동선이 연기로 차단되는 시각(s). Infinity = 해석 시간 내 미차단 */
  aset: number;
  /** 차단 지점 */
  at: Pt | null;
  /** 화염 도달 시각 */
  flameAt: number;
}

/** 동선별 ASET — 동선 위에서 가장 먼저 통행 불가가 되는 시각 */
export function routeASET(field: SmokeField, g: Grid, route: Route): AsetResult {
  let aset = Infinity;
  let at: Pt | null = null;
  let flameAt = Infinity;
  for (const p of sampleRoute(route)) {
    const i = cellAt(g, p.x, p.y);
    if (i < 0 || !g.walk[i]) continue;
    const s = blockTime(field, i);
    if (s < aset) {
      aset = s;
      at = p;
    }
    const f = field.flame[i];
    if (f < flameAt) flameAt = f;
  }
  return { routeId: route.id, aset, at, flameAt };
}

export interface SafetyMargin extends AsetResult {
  rset: number;
  margin: number;
  verdict: 'safe' | 'tight' | 'fail';
}

export function safetyMargin(aset: AsetResult, rsetSeconds: number): SafetyMargin {
  const margin = aset.aset - rsetSeconds;
  let verdict: SafetyMargin['verdict'] = 'safe';
  if (!isFinite(aset.aset)) verdict = 'safe';
  else if (margin < 0) verdict = 'fail';
  else if (margin < 30) verdict = 'tight';
  return { ...aset, rset: rsetSeconds, margin, verdict };
}

/** 발화점 후보 — 실별 중심 (훈련·해석 기본값 제시용) */
export function ignitionCandidates(plan: Plan): { roomId: string; name: string; x: number; y: number }[] {
  return plan.rooms
    .filter((r) => r.kind !== 'balcony')
    .map((r) => ({ roomId: r.id, name: r.name, x: r.x + r.w / 2, y: r.y + r.h / 2 }));
}

/** 해석 결과 요약 문구 */
export function describeField(field: SmokeField, g: Grid): string {
  const half = field.totalArea / 2;
  const curve = areaCurve(field, g, 600, 5);
  const reach = curve.find((c) => c.reachedArea >= half);
  const block = curve.find((c) => c.blockedArea >= half);
  if (!block) return '해석 시간(10분) 안에 세대 절반이 통행 불가에 이르지는 않는다.';
  const r = reach ? `연기 선단은 약 ${Math.round(reach.t)}초에 세대 절반에 닿고, ` : '';
  return `${r}약 ${Math.round(block.t)}초에는 통행면적의 절반을 지나갈 수 없게 된다.`;
}
