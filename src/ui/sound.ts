'use client';

/**
 * 소리 — 설계서 v1.2 §7.
 *
 * 다섯 조건 아래에서만 낸다.
 *   C1 끌 수 있다 (profile.soundOn)
 *   C2 감지기 소리는 시작 때 한 번, 2초 이내
 *   C3 실패를 소리로 알리지 않는다 — 이 파일에 실패 소리가 없다
 *   C4 붉은 점멸은 여전히 금지 (화면 쪽 규칙)
 *   C5 소리는 부가 기능이다. 나지 않아도 모든 기능이 완결된다
 *
 * 감지기·조작 효과는 Web Audio 로 합성한다. 캐릭터 말은 웹·오프라인 모두
 * ElevenLabs Juwonmom MP3만 사용하며 브라우저 기계음으로 바꾸지 않는다.
 */

import { guideVoiceFilename, type VoiceGradeMode } from '../content/voice';

let ctx: AudioContext | null = null;
let soundEpoch = 0;
const activeTones = new Set<{ osc: OscillatorNode; amp: GainNode }>();
const pendingSoundTimers = new Set<number>();

function clearScheduledSounds(): void {
  if (typeof window === 'undefined') return;
  for (const timer of pendingSoundTimers) window.clearTimeout(timer);
  pendingSoundTimers.clear();
}

/**
 * 소리 켬/끔의 **단 하나의 기준**.
 *
 * 예전에는 부르는 쪽이 저마다 `profile.soundOn` 을 들고 다녔다. 그러다 보니
 *   - 말풍선은 `soundOn || ttsEnabled` 로 봐서 소리를 꺼도 계속 읽었고
 *   - 이미 예약해 둔 감지기 경보는 끄는 순간에도 끝까지 울렸다.
 * 이제 여기 한 곳에서 잠근다. 끄면 예약된 것까지 즉시 멎는다 (설계서 v1.2 §7.1 C1).
 */
/*
 * 처음에는 **꺼 둔다.** 저장해 둔 설정을 읽기 전에는 아무 소리도 내지 않는다 —
 * 켜 두면 껐던 아이가 앱을 다시 열자마자 소리를 듣는다. 소리를 켜는 것은
 * 저장을 읽은 뒤 `boot()` 가 한 번, 그리고 아이가 단추를 누를 때 한 번뿐이다.
 */
let enabled = false;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  soundEpoch += 1;
  if (!on) {
    stopSpeaking();
    stopVoice();
    clearScheduledSounds();
    stopEffectSounds();
    /* 예약음을 취소한 다음 문맥도 멈춘다. 다시 켜도 예전 경보가 이어지지 않는다. */
    try {
      if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
    } catch {
      /* 무시 */
    }
    return;
  }
  try {
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  } catch {
    /* 무시 */
  }
}

export function soundEnabled(): boolean {
  return enabled;
}

function getAudioContext(): AudioContext | null {
  if (ctx && ctx.state !== 'closed') return ctx;
  try {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  } catch {
    ctx = null;
    return null;
  }
}

/** 자동 재생 제한 — 이용자가 누를 때마다 잠금 해제를 재시도할 수 있어야 한다 */
export function unlockAudio(): void {
  if (typeof window === 'undefined') return;
  const a = getAudioContext();
  if (!a || !enabled || a.state !== 'suspended') return;
  try {
    void a.resume().catch(() => undefined);
  } catch {
    /* 다음 조작에서 다시 시도한다 */
  }
}

/**
 * 소리를 낼 준비가 되면 시킨 일을 한다.
 * AudioContext 를 만들자마자 예약하면 아직 suspended 라 소리가 통째로 사라진다 —
 * 실제로 "소리가 전혀 안 난다"는 지적의 원인이었다. resume 이 끝난 뒤에 예약한다.
 */
function withAudio(job: (a: AudioContext) => void): void {
  if (!enabled) return;
  const epoch = soundEpoch;
  const a = getAudioContext();
  if (!a) return;
  const run = (): void => {
    if (enabled && epoch === soundEpoch && a.state === 'running') job(a);
  };
  if (a.state === 'running') {
    run();
    return;
  }
  void a
    .resume()
    .then(run)
    .catch(() => {
      /* 브라우저가 막으면 조용히 넘어간다 */
    });
}

/** 짧은 음 하나. gain 은 -18dBFS 언저리로 낮춰 둔다 */
function beep(a: AudioContext, at: number, freq: number, dur: number, gain = 0.12, type: OscillatorType = 'square'): void {
  const osc = a.createOscillator();
  const amp = a.createGain();
  const tone = { osc, amp };
  activeTones.add(tone);
  osc.onended = () => {
    activeTones.delete(tone);
    try {
      osc.disconnect();
      amp.disconnect();
    } catch {
      /* 이미 끊긴 노드 */
    }
  };
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  /* 딸깍 소리가 나지 않게 앞뒤를 부드럽게 여닫는다 */
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(gain, at + 0.012);
  amp.gain.setValueAtTime(gain, at + dur - 0.02);
  amp.gain.linearRampToValueAtTime(0, at + dur);
  osc.connect(amp).connect(a.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** 현재 재생 중이거나 미래 시각에 예약된 효과음을 모두 취소한다 */
function stopEffectSounds(): void {
  for (const { osc, amp } of activeTones) {
    try {
      osc.stop();
    } catch {
      /* 이미 끝난 노드 */
    }
    try {
      osc.disconnect();
      amp.disconnect();
    } catch {
      /* 이미 끊긴 노드 */
    }
  }
  activeTones.clear();
}

/**
 * 주거용 감지기의 T-3 경보 — 0.5초 울림 세 번 뒤 쉼.
 * 진짜 소리를 알아듣게 하는 것이 목적이므로 주파수(3.1kHz)는 실물을 따르되,
 * 한 묶음만 내고 끝낸다 (C2). 놀라지 않게 음량을 낮추고 부드럽게 연다.
 */
export function playDetector(): void {
  withAudio((a) => {
    const t0 = a.currentTime + 0.08;
    for (let i = 0; i < 3; i += 1) {
      const at = t0 + i * 0.55;
      beep(a, at, 3100, 0.3, 0.16);
      beep(a, at + 0.005, 3150, 0.3, 0.08, 'triangle');
    }
  });
}

/** 게임이 열릴 때의 짧은 신호음 세 마디 — 겁주지 않게 낮고 부드럽게 */
export function playIntro(): void {
  withAudio((a) => {
    const t0 = a.currentTime + 0.02;
    [392, 523.25, 659.25].forEach((f, i) => beep(a, t0 + i * 0.13, f, 0.26, 0.07, 'sine'));
  });
}

/** 문을 여닫는 소리 — 아주 짧은 나무 소리 */
export function playDoor(closing: boolean): void {
  withAudio((a) => {
    const t = a.currentTime + 0.01;
    beep(a, t, closing ? 190 : 260, 0.09, 0.09, 'triangle');
    beep(a, t + 0.05, closing ? 130 : 320, 0.07, 0.05, 'sine');
  });
}

/** 한 칸 걸음 — 아주 작게. 연달아 나도 시끄럽지 않다 */
export function playStep(): void {
  withAudio((a) => {
    beep(a, a.currentTime + 0.005, 150 + Math.random() * 40, 0.05, 0.035, 'triangle');
  });
}

/** 자세를 낮출 때 */
export function playCrouch(down: boolean): void {
  withAudio((a) => {
    const t = a.currentTime + 0.01;
    beep(a, t, down ? 330 : 440, 0.1, 0.05, 'sine');
    beep(a, t + 0.06, down ? 247 : 587, 0.1, 0.04, 'sine');
  });
}

/** 성공했을 때의 짧은 화음. 지는 순간에는 아무 소리도 내지 않는다 (C3) */
export function playSuccess(): void {
  withAudio((a) => {
    const t0 = a.currentTime + 0.03;
    /* 도-미-솔-도 — 짧은 팡파르 */
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      beep(a, t0 + i * 0.1, f, 0.24, 0.09, 'sine');
      beep(a, t0 + i * 0.1, f * 2, 0.18, 0.03, 'triangle');
    });
  });
}

/** 성공 화음만 낸다. 칭찬 대사는 현재 가이드 이벤트의 Juwonmom MP3가 맡는다. */
export function playSuccessCue(): void {
  if (!enabled || typeof window === 'undefined') return;
  playSuccess();
}

/** 놓았을 때·눌렀을 때의 아주 짧은 확인음 */
export function playTap(): void {
  withAudio((a) => beep(a, a.currentTime + 0.01, 880, 0.06, 0.06, 'sine'));
}

/* ------------------------------------------------------------------ */
/* 말                                                                  */
/* ------------------------------------------------------------------ */

/**
 * 캐릭터 말풍선은 웹과 오프라인에서 모두 Juwonmom MP3만 재생한다.
 * 파일이 빠졌거나 브라우저가 재생을 막으면 화면 글은 남기고 조용히 멈춘다.
 */
export function playGuideVoice(ruleId: string, gradeMode: VoiceGradeMode, fallbackText: string): void {
  if (!fallbackText) return;
  /* 꺼진 동안에도 최신 대사를 기억해, 소리를 켜는 클릭에서 곧바로 다시 들려준다. */
  lastGuideVoice = { ruleId, gradeMode, fallbackText };
  if (!enabled) return;
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '');
  const filename = guideVoiceFilename(ruleId, gradeMode);
  const source = process.env.NEXT_PUBLIC_OFFLINE === '1' ? `voice/${filename}` : `${basePath}/voice/${filename}`;
  playAudioClip(source);
}

let current: HTMLAudioElement | null = null;
let lastGuideVoice: { ruleId: string; gradeMode: VoiceGradeMode; fallbackText: string } | null = null;

/** 상단 소리 단추로 다시 켤 때 가장 최근 말풍선 MP3를 사용자 클릭 안에서 재생한다. */
export function replayLastGuideVoice(): void {
  if (!lastGuideVoice) return;
  playGuideVoice(lastGuideVoice.ruleId, lastGuideVoice.gradeMode, lastGuideVoice.fallbackText);
}

function playAudioClip(source: string): void {
  if (!enabled) return;
  try {
    stopSpeaking();
    stopVoice();
    const audio = new Audio(source);
    const failed = (): void => {
      if (current === audio) current = null;
    };
    audio.volume = 0.9;
    audio.onerror = failed;
    audio.onended = () => {
      if (current === audio) current = null;
    };
    current = audio;
    void audio.play().catch(failed);
  } catch {
    /* MP3를 재생할 수 없어도 브라우저 기계음으로 바꾸지 않는다. */
  }
}

export function stopVoice(): void {
  try {
    if (current) {
      current.onerror = null;
      current.onended = null;
      current.pause();
    }
  } catch {
    /* 무시 */
  }
  current = null;
}

/**
 * 화면을 떠나면 소리를 끊는다.
 *
 * 현재 앱은 브라우저 음성합성을 재생하지 않지만, 이전 버전에서 남은 브라우저 큐까지
 * 확실히 끊기도록 떠나기 전에 `speechSynthesis.cancel()`도 호출한다.
 *
 * 탭을 숨겼을 때도 멈춘다. 안 보이는 화면이 소리를 내면 어디서 나는지 알 수 없다.
 */
if (typeof window !== 'undefined') {
  const hush = (): void => {
    stopSpeaking();
    stopVoice();
    clearScheduledSounds();
    stopEffectSounds();
    try {
      if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
    } catch {
      /* 무시 */
    }
  };
  window.addEventListener('pagehide', hush);
  window.addEventListener('beforeunload', hush);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) hush();
      else if (enabled && ctx?.state === 'suspended') void ctx.resume().catch(() => undefined);
    });
  }
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* 무시 */
  }
}
