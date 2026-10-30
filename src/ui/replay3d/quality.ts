'use client';

/**
 * 화질 세 단 — 설계서 v1.10 §4 · v1.19 §4.1 · FR-11.10.
 *
 * 교실 PC 는 대개 느리다. 블룸과 그림자를 켠 채로는 프레임이 떨어지는데,
 * 아이는 "느리다"고 말하지 못하고 그냥 재미없어한다. 그래서 자동으로 내려간다.
 *
 * 내려가도 **기능은 다 된다.** 길·표지·불·연기·자막이 그대로 있고 그림 비용만 준다.
 */

export type Quality = 'ultra' | 'high' | 'low';

/** 기기만 보고 첫 화질을 고른다. 재어 보기 전의 짐작이다 */
export function guessQuality(): Quality {
  if (typeof navigator === 'undefined') return 'high';
  /* GPU가 없는 Playwright/CI는 CPU 코어 수가 많아도 소프트웨어 렌더러다. */
  if (navigator.webdriver) return 'low';
  const cores = navigator.hardwareConcurrency ?? 8;
  /* 움직임을 줄여 달라고 한 기기에서는 후처리도 덜어 준다 */
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return 'low';
  if (cores <= 4) return 'low';
  return cores >= 8 ? 'ultra' : 'high';
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
  /** 멀수록 번지는 PCSS 부드러운 그림자 — 고급만 (설계서 v1.19 §4.1) */
  softShadows: boolean;
  /** 블룸·앰비언트 오클루전·비네트를 거는가 */
  postprocessing: boolean;
  /** 집 전체 시점의 미니어처 피사계 심도 — 고급만 */
  dof: boolean;
  /** MSAA 표본 수. 0 이면 끈다 */
  msaa: 0 | 4;
  /** 산란을 계산하는 물리 하늘인가, 두 색 하늘인가 */
  sky: 'physical' | 'gradient';
  /** 불꽃·연기 노이즈 옥타브 — 많을수록 결이 곱고 무겁다 */
  fireOctaves: 2 | 3 | 4;
  /** 불에서 오르는 불씨 입자 */
  embers: boolean;
  /** 집 밖 나무를 세우는가 */
  scenery: boolean;
  /** 바닥 무늬·몰딩·러그 수준 */
  detail: 'full' | 'standard' | 'minimal';
  /** 주요 공간의 천장등과 실내 채움광 */
  interiorLights: boolean;
  /** 절차형 재질(색·법선·거칠기) 한 변의 픽셀 수. 0이면 정점 색만 쓴다 */
  textureSize: 0 | 512 | 1024;
  /** 태양 그림자 맵 한 변 */
  shadowMapSize: 1024 | 2048 | 4096;
  /** 화면 공간 접촉 그림자 세기 */
  aoIntensity: number;
  /** 안전 길·불빛의 번짐 세기 */
  bloomIntensity: number;
  /** 화면 배율 상한 */
  dpr: [number, number];
}

export function settingsFor(q: Quality): QualitySettings {
  if (q === 'ultra') {
    return {
      shadows: true,
      softShadows: true,
      postprocessing: true,
      dof: true,
      msaa: 4,
      sky: 'physical',
      fireOctaves: 4,
      embers: true,
      scenery: true,
      detail: 'full',
      interiorLights: true,
      textureSize: 1024,
      shadowMapSize: 4096,
      aoIntensity: 1.6,
      bloomIntensity: 0.7,
      dpr: [1.5, 2.5],
    };
  }
  if (q === 'high') {
    return {
      shadows: true,
      softShadows: false,
      postprocessing: true,
      dof: false,
      msaa: 4,
      sky: 'physical',
      fireOctaves: 3,
      embers: false,
      scenery: true,
      detail: 'standard',
      interiorLights: true,
      textureSize: 512,
      shadowMapSize: 2048,
      aoIntensity: 1.2,
      bloomIntensity: 0.5,
      dpr: [1, 1.75],
    };
  }
  return {
    shadows: false,
    softShadows: false,
    postprocessing: false,
    dof: false,
    msaa: 0,
    sky: 'gradient',
    fireOctaves: 2,
    embers: false,
    scenery: false,
    detail: 'minimal',
    interiorLights: false,
    textureSize: 0,
    shadowMapSize: 1024,
    aoIntensity: 0,
    bloomIntensity: 0,
    dpr: [1, 1.15],
  };
}

/** 느린 장치에서 기능은 그대로 두고 그림 비용만 한 단계 내린다. */
export function lowerQuality(q: Quality): Quality {
  return q === 'ultra' ? 'high' : 'low';
}
