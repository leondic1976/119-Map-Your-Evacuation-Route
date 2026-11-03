/**
 * 바깥 세계에 닿는 유일한 자리 — 저장 · 인쇄 · 소리.
 * 다른 층은 `localStorage`·`Audio`·`window.print` 를 직접 부르지 않는다.
 */
export interface Host {
  load<T>(key: string): T | null;
  save(key: string, value: unknown): void;
  remove(key: string): void;
  print(): void;
  /** 음성 MP3 재생. 실패하면 조용히 멈춘다. onDone 은 끝나거나 실패했을 때 한 번 부른다 */
  playVoice(id: string, onDone?: () => void): void;
  stopVoice(): void;
  /** 시작 때 한 번, 2초 안에 끝나는 경보음 */
  alarm(): void;
  /** 웹에서 연 판을 다음에 인터넷 없이도 열 수 있게 저장해 둔다 */
  keepForOffline(): void;
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

  keepForOffline(): void {
    if (!isWebBuild() || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('./sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => registration.active?.postMessage('warm-voice'))
      .catch(() => {
        /* 저장하지 못해도 앱은 돈다 */
      });
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
