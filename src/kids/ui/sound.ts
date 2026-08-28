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
 * 음원 파일을 싣지 않는다. 오프라인 배포본이 4MB 를 넘을 수 없기 때문이다(NFR-3).
 * 감지기 소리는 Web Audio 로 합성하고, 말은 브라우저 음성합성에 맡긴다.
 * 둘 다 없으면 조용히 아무 일도 하지 않는다.
 */

let ctx: AudioContext | null = null;
let unlocked = false;

/** 자동 재생 제한 — 이용자가 한 번 누른 뒤에야 소리를 낼 수 있다 */
export function unlockAudio(): void {
  if (unlocked) return;
  unlocked = true;
  try {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function audio(): AudioContext | null {
  if (!ctx) return null;
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** 짧은 음 하나. gain 은 -18dBFS 언저리로 낮춰 둔다 */
function beep(at: number, freq: number, dur: number, gain = 0.12, type: OscillatorType = 'square'): void {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const amp = a.createGain();
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

/**
 * 주거용 감지기의 T-3 경보 — 0.5초 울림 세 번 뒤 쉼.
 * 진짜 소리를 알아듣게 하는 것이 목적이므로 주파수(3.1kHz)는 실물을 따르되,
 * 한 묶음만 내고 끝낸다 (C2). 놀라지 않게 음량을 낮추고 부드럽게 연다.
 */
export function playDetector(on: boolean): void {
  if (!on) return;
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + 0.05;
  for (let i = 0; i < 3; i += 1) {
    const at = t0 + i * 0.55;
    beep(at, 3100, 0.3, 0.1);
    beep(at + 0.005, 3150, 0.3, 0.05, 'triangle');
  }
}

/** 성공했을 때의 짧은 화음. 지는 순간에는 아무 소리도 내지 않는다 (C3) */
export function playSuccess(on: boolean): void {
  if (!on) return;
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + 0.03;
  const notes = [523.25, 659.25, 783.99];
  notes.forEach((f, i) => beep(t0 + i * 0.11, f, 0.22, 0.08, 'sine'));
}

/** 놓았을 때·눌렀을 때의 아주 짧은 확인음 */
export function playTap(on: boolean): void {
  if (!on) return;
  const a = audio();
  if (!a) return;
  beep(a.currentTime + 0.01, 880, 0.06, 0.05, 'sine');
}

/* ------------------------------------------------------------------ */
/* 말                                                                  */
/* ------------------------------------------------------------------ */

let voice: SpeechSynthesisVoice | null = null;
let voiceChecked = false;

/** 한국어 음성을 찾는다. 없으면 말하지 않는다 (v1.0 §7.4 — TTS 는 부가 기능) */
function pickVoice(): SpeechSynthesisVoice | null {
  if (voiceChecked) return voice;
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const list = window.speechSynthesis.getVoices();
  if (list.length === 0) return null; // 아직 안 왔다. 다음에 다시 본다
  voiceChecked = true;
  voice = list.find((v) => v.lang.startsWith('ko')) ?? null;
  return voice;
}

/**
 * 캐릭터의 말을 읽어 준다. 피치를 올려 어린이에게 친근한 소리로 만든다.
 * 한국어 음성이 없으면 조용히 그만둔다 — 소리가 없어도 화면에 글이 그대로 있다.
 */
export function speak(text: string, on: boolean): void {
  if (!on || !text) return;
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const v = pickVoice();
  if (!v) return;
  try {
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

export function stopSpeaking(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* 무시 */
  }
}
