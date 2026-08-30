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
 * 감지기·조작 효과는 Web Audio 로 합성한다. 캐릭터 말은 웹 배포본에서 Juwonmom MP3를
 * 우선 쓰고, 파일이 없거나 단일 HTML이면 브라우저 음성합성으로 대체한다.
 * 둘 다 없으면 조용히 아무 일도 하지 않는다.
 */

import { guideVoiceFilename, VOICE_CLIPS, VOICE_LINES, type VoiceGradeMode, type VoiceId } from '../content/voice';

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

/** 성공 화음과 칭찬을 한 묶음으로 낸다. 화면이 곧 리포트로 바뀌어도 빠지지 않는다. */
export function playSuccessCue(): void {
  if (!enabled || typeof window === 'undefined') return;
  const epoch = soundEpoch;
  playSuccess();
  const timer = window.setTimeout(() => {
    pendingSoundTimers.delete(timer);
    if (enabled && epoch === soundEpoch) playVoice('v-success');
  }, 900);
  pendingSoundTimers.add(timer);
}

/** 놓았을 때·눌렀을 때의 아주 짧은 확인음 */
export function playTap(): void {
  withAudio((a) => beep(a, a.currentTime + 0.01, 880, 0.06, 0.06, 'sine'));
}

/* ------------------------------------------------------------------ */
/* 말                                                                  */
/* ------------------------------------------------------------------ */

let voice: SpeechSynthesisVoice | null = null;
let voiceChecked = false;
let pendingSpeech: string | null = null;

/** 한국어 음성을 찾는다. 없으면 말하지 않는다 (v1.0 §7.4 — TTS 는 부가 기능) */
function pickVoice(): SpeechSynthesisVoice | null {
  if (voiceChecked) return voice;
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const list = window.speechSynthesis.getVoices();
  if (list.length === 0) return null; // 아직 안 왔다. onvoiceschanged 뒤에 다시 본다
  voiceChecked = true;
  voice = list.find((v) => v.lang.startsWith('ko')) ?? null;
  return voice;
}

/**
 * 캐릭터의 말을 읽어 준다. 피치를 올려 어린이에게 친근한 소리로 만든다.
 * 한국어 음성이 없으면 조용히 그만둔다 — 소리가 없어도 화면에 글이 그대로 있다.
 */
export function speak(text: string): void {
  if (!enabled || !text) return;
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const v = pickVoice();
  if (!v) {
    /* 음성 목록이 늦게 도착하면 가장 최근 문장을 그때 한 번 읽는다 */
    pendingSpeech = text;
    return;
  }
  try {
    pendingSpeech = null;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = v;
    u.lang = v.lang;
    u.pitch = 1.35;
    u.rate = 0.95;
    u.volume = 0.9;
    window.speechSynthesis.speak(u);
  } catch {
    /* 브라우저가 막으면 그냥 넘어간다 */
  }
}

/** 음성 목록은 늦게 오는 브라우저가 있다. 오면 다시 찾아본다 */
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    voiceChecked = false;
    pickVoice();
    const text = pendingSpeech;
    if (text && enabled) speak(text);
  };
}

/**
 * 사람 목소리를 먼저 틀고, 없으면 음성합성으로 넘어간다 (VOICE-SCRIPT.md §4).
 * 둘 다 없으면 조용히 넘어간다 — 소리가 없어도 화면에 글이 그대로 있다.
 */
export function playVoice(id: VoiceId): void {
  if (!enabled) return;
  const clip = VOICE_CLIPS[id];
  if (!clip) {
    speak(VOICE_LINES[id]);
    return;
  }
  playAudioClip(clip, VOICE_LINES[id]);
}

/**
 * 캐릭터 말풍선의 웹 MP3를 우선 재생한다. 단일 HTML은 외부 파일을 가질 수 없으므로
 * 브라우저 TTS를 쓰고, 웹에서도 파일 누락·재생 실패 시 같은 문장 TTS로 되돌아간다.
 */
export function playGuideVoice(ruleId: string, gradeMode: VoiceGradeMode, fallbackText: string): void {
  if (!fallbackText) return;
  /* 꺼진 동안에도 최신 대사를 기억해, 소리를 켜는 클릭에서 곧바로 다시 들려준다. */
  lastGuideVoice = { ruleId, gradeMode, fallbackText };
  if (!enabled) return;
  if (process.env.NEXT_PUBLIC_OFFLINE === '1') {
    speak(fallbackText);
    return;
  }
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '');
  playAudioClip(`${basePath}/voice/${guideVoiceFilename(ruleId, gradeMode)}`, fallbackText);
}

let current: HTMLAudioElement | null = null;
let lastGuideVoice: { ruleId: string; gradeMode: VoiceGradeMode; fallbackText: string } | null = null;

/** 상단 소리 단추로 다시 켤 때 가장 최근 말풍선 MP3를 사용자 클릭 안에서 재생한다. */
export function replayLastGuideVoice(): void {
  if (!lastGuideVoice) return;
  playGuideVoice(lastGuideVoice.ruleId, lastGuideVoice.gradeMode, lastGuideVoice.fallbackText);
}

function playAudioClip(source: string, fallbackText: string): void {
  if (!enabled) return;
  try {
    stopSpeaking();
    stopVoice();
    const audio = new Audio(source);
    let fellBack = false;
    const fallback = (): void => {
      if (fellBack || !enabled) return;
      fellBack = true;
      if (current === audio) current = null;
      speak(fallbackText);
    };
    audio.volume = 0.9;
    audio.onerror = fallback;
    audio.onended = () => {
      if (current === audio) current = null;
    };
    current = audio;
    void audio.play().catch(fallback);
  } catch {
    speak(fallbackText);
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
 * `speechSynthesis` 는 탭이 아니라 **브라우저가 쥐고 있는 기능**이다. 읽을 말이 큐에
 * 남은 채로 탭을 닫으면 창이 사라진 뒤에도 계속 읽는다 — 실제로 "브라우저를 닫았는데
 * 소리가 난다"는 지적을 받았다. 떠나기 전에 반드시 비운다.
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
  pendingSpeech = null;
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* 무시 */
  }
}
