/**
 * 바깥 세계에 닿는 유일한 자리 — 저장 · 인쇄 · 소리.
 * 다른 층은 `localStorage`·`Audio`·`window.print` 를 직접 부르지 않는다.
 */
export interface Host {
  /** 기기에 오래 남는 저장. 도면만 여기에 둔다 */
  load<T>(key: string): T | null;
  save(key: string, value: unknown): void;
  remove(key: string): void;
  /** 탭을 닫으면 사라지는 저장. 이름표와 소리, 사용법을 본 기록을 둔다 */
  loadSession<T>(key: string): T | null;
  saveSession(key: string, value: unknown): void;
  print(): void;
  /** 음성 MP3 재생. 실패하면 조용히 멈춘다. onDone 은 끝나거나 실패했을 때 한 번 부른다 */
  playVoice(id: string, onDone?: () => void): void;
  stopVoice(): void;
  /** 시작 때 한 번, 2초 안에 끝나는 경보음 */
  alarm(): void;
  /** 대피에 성공했을 때 한 번 — 축포 터지는 소리와 짧은 팡파르. 파일 없이 코드로 낸다 */
  cheer(): void;
  /** 한 칸 걸을 때 나는 작은 발소리 */
  step(): void;
  /** 칭찬 도장이 찍힐 때 나는 맑은 소리 */
  stamp(): void;
  /** 예전 판이 브라우저에 남긴 서비스 워커와 저장본을 지운다. 화면을 저장해 두지 않는다 */
  forgetOldCopies(): void;
  /** 설치 안내 주소. 이미 설치했거나 오프라인 판이면 null */
  installGuide(): string | null;
}

const PREFIX = 'home-escape-map-v2:';

/** 사이트에서 연 웹 판인가. 오프라인 HTML 과 윈도우 프로그램, 개발 서버는 아니다 */
const isWebBuild = (): boolean => import.meta.env.PROD && import.meta.env.MODE !== 'offline' && window.location.protocol.startsWith('http');

class WebHost implements Host {
  private audio: HTMLAudioElement | null = null;

  load<T>(key: string): T | null {
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  save(key: string, value: unknown): void {
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* 저장이 막혀도 앱은 돈다 */
    }
  }

  remove(key: string): void {
    try {
      window.localStorage.removeItem(PREFIX + key);
    } catch {
      /* 저장이 막혀도 앱은 돈다 */
    }
  }

  loadSession<T>(key: string): T | null {
    try {
      const raw = window.sessionStorage.getItem(PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  saveSession(key: string, value: unknown): void {
    try {
      window.sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* 저장이 막혀도 앱은 돈다 */
    }
  }

  print(): void {
    window.print();
  }

  playVoice(id: string, onDone?: () => void): void {
    this.stopVoice();
    const root = document.documentElement;
    const audio = new Audio(`./voice/${id}.mp3`);
    this.audio = audio;
    root.dataset.voiceLast = id;
    root.dataset.voiceState = 'loading';
    audio.addEventListener('playing', () => {
      if (this.audio === audio) root.dataset.voiceState = 'playing';
    });
    audio.addEventListener('ended', () => {
      if (this.audio === audio) {
        root.dataset.voiceState = 'ended';
        onDone?.();
      }
    });
    const failed = (): void => {
      if (this.audio !== audio || root.dataset.voiceState === 'failed') return;
      root.dataset.voiceState = 'failed';
      onDone?.();
    };
    audio.addEventListener('error', failed);
    audio.play().catch(failed);
  }

  stopVoice(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
  }

  alarm(): void {
    try {
      const Ctx = window.AudioContext;
      const ctx = new Ctx();
      const gain = ctx.createGain();
      gain.gain.value = 0.05;
      gain.connect(ctx.destination);
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = i % 2 ? 660 : 880;
        osc.connect(gain);
        osc.start(ctx.currentTime + i * 0.5);
        osc.stop(ctx.currentTime + i * 0.5 + 0.4);
      }
      window.setTimeout(() => void ctx.close(), 2200);
    } catch {
      /* 소리가 없어도 다 된다 */
    }
  }

  cheer(): void {
    try {
      const ctx = new window.AudioContext();
      const out = ctx.createGain();
      out.gain.value = 0.16;
      out.connect(ctx.destination);
      const t0 = ctx.currentTime + 0.05;
      // 팡파르 — 도 미 솔 도, 그리고 길게 끄는 화음
      const note = (freq: number, at: number, len: number, type: OscillatorType, vol: number): void => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t0 + at);
        g.gain.linearRampToValueAtTime(vol, t0 + at + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + at + len);
        osc.connect(g);
        g.connect(out);
        osc.start(t0 + at);
        osc.stop(t0 + at + len + 0.05);
      };
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, i * 0.16, 0.5, 'triangle', 0.5));
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f) => note(f, 0.72, 1.7, 'triangle', 0.26));
      [1568, 2093, 2637, 2093, 3136].forEach((f, i) => note(f, 1 + i * 0.13, 0.3, 'sine', 0.14));
      // 축포 — 올라가는 휘파람과 터지는 소리
      const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
      [0, 0.5, 1, 1.6, 2.1, 2.6, 3].forEach((at, i) => {
        const rise = ctx.createOscillator();
        const rg = ctx.createGain();
        rise.type = 'sine';
        rise.frequency.setValueAtTime(500 + i * 60, t0 + at);
        rise.frequency.exponentialRampToValueAtTime(1500 + i * 90, t0 + at + 0.22);
        rg.gain.setValueAtTime(0.05, t0 + at);
        rg.gain.exponentialRampToValueAtTime(0.001, t0 + at + 0.24);
        rise.connect(rg);
        rg.connect(out);
        rise.start(t0 + at);
        rise.stop(t0 + at + 0.26);
        const pop = ctx.createBufferSource();
        pop.buffer = noise;
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 900 + (i % 3) * 500;
        band.Q.value = 0.7;
        const pg = ctx.createGain();
        pg.gain.value = 0.55;
        pop.connect(band);
        band.connect(pg);
        pg.connect(out);
        pop.start(t0 + at + 0.24);
      });
      document.documentElement.dataset.cheer = String(Number(document.documentElement.dataset.cheer ?? 0) + 1);
      window.setTimeout(() => void ctx.close(), 5200);
    } catch {
      /* 소리가 없어도 다 된다 */
    }
  }

  /** 짧은 소리 몇 개를 차례로 낸다. 소리가 없어도 다 된다 */
  private blip(notes: [number, number, number][], type: OscillatorType, volume: number): void {
    try {
      const ctx = new window.AudioContext();
      const t0 = ctx.currentTime + 0.01;
      let end = 0;
      for (const [freq, at, len] of notes) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t0 + at);
        g.gain.linearRampToValueAtTime(volume, t0 + at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + at + len);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t0 + at);
        osc.stop(t0 + at + len + 0.02);
        end = Math.max(end, at + len);
      }
      window.setTimeout(() => void ctx.close(), end * 1000 + 300);
    } catch {
      /* 소리가 없어도 다 된다 */
    }
  }

  step(): void {
    this.blip([[330, 0, 0.07], [392, 0.16, 0.07]], 'sine', 0.05);
  }

  stamp(): void {
    this.blip([[784, 0, 0.14], [1175, 0.1, 0.3]], 'triangle', 0.09);
    document.documentElement.dataset.stamp = String(Number(document.documentElement.dataset.stamp ?? 0) + 1);
  }

  forgetOldCopies(): void {
    if (!isWebBuild()) return;
    // 같은 주소를 쓰는 다른 사이트의 것을 건드리지 않게 이 사이트 아래의 것만 지운다
    const site = new URL('../', window.location.href).href;
    navigator.serviceWorker
      ?.getRegistrations()
      .then((list) => Promise.all(list.filter((r) => r.scope.startsWith(site)).map((r) => r.unregister())))
      .catch(() => undefined);
    window.caches
      ?.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('hem')).map((key) => window.caches.delete(key))))
      .catch(() => undefined);
  }

  installGuide(): string | null {
    if (!isWebBuild() || window.matchMedia('(display-mode: standalone)').matches) return null;
    return '../download/';
  }
}

export let host: Host = new WebHost();

export function setHost(next: Host): void {
  host = next;
}
