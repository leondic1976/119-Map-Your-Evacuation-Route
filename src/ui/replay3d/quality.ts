'use client';

/**
 * 화질 두 단 — 설계서 v1.4 §1.3 · FR-11.10.
 *
 * 교실 PC 는 대개 느리다. 블룸과 그림자를 켠 채로는 프레임이 떨어지는데,
 * 아이는 "느리다"고 말하지 못하고 그냥 재미없어한다. 그래서 자동으로 내려간다.
 *
 * 내려가도 **기능은 다 된다.** 길·표지·불·연기·자막이 그대로 있고 후처리만 꺼진다.
 */

export type Quality = 'high' | 'low';

/** 기기만 보고 첫 화질을 고른다. 재어 보기 전의 짐작이다 */
export function guessQuality(): Quality {
  if (typeof navigator === 'undefined') return 'high';
  const cores = navigator.hardwareConcurrency ?? 8;
  if (cores <= 4) return 'low';
  /* 움직임을 줄여 달라고 한 기기에서는 후처리도 덜어 준다 */
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return 'low';
  return 'high';
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 프레임을 재다가 느리면 한 번만 내려간다.
 * 올라가지는 않는다 — 오르내리기를 반복하면 화면이 깜빡여 더 거슬린다.
 */
export class FrameWatch {
  private frames = 0;
  private first = 0;
  private started = 0;
  private done = false;

  constructor(
    /** 재기 전에 흘려보낼 시간 — 셰이더를 엮고 텍스처를 올리는 동안은 느린 것이 정상이다 */
    private readonly warmupMs = 1500,
    private readonly windowMs = 2500,
    private readonly minFps = 24,
  ) {}

  /** 매 프레임 부른다. 내려가야 하면 true 를 한 번만 돌려준다 */
  tick(nowMs: number): boolean {
    if (this.done) return false;
    if (this.first === 0) {
      this.first = nowMs;
      return false;
    }
    /* 처음 몇 프레임은 세지 않는다 */
    if (nowMs - this.first < this.warmupMs) return false;
    if (this.started === 0) {
      this.started = nowMs;
      return false;
    }
    this.frames += 1;
    const elapsed = nowMs - this.started;
    if (elapsed < this.windowMs) return false;
    this.done = true;
    const fps = (this.frames * 1000) / elapsed;
    return fps < this.minFps;
  }
}

export interface QualitySettings {
  /** 그림자 맵을 쓰는가 */
  shadows: boolean;
  /** 블룸·앰비언트 오클루전을 거는가 */
  postprocessing: boolean;
  /** 집 밖 나무를 세우는가 */
  scenery: boolean;
  /** 화면 배율 상한 */
  dpr: [number, number];
}

export function settingsFor(q: Quality): QualitySettings {
  return q === 'high'
    ? { shadows: true, postprocessing: true, scenery: true, dpr: [1, 1.8] }
    : { shadows: false, postprocessing: false, scenery: false, dpr: [1, 1] };
}
