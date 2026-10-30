/**
 * 바깥 세계와 닿는 단 하나의 자리 — 저장소와 파일 내보내기.
 *
 * 나머지 코드는 `localStorage`·`sessionStorage`·`document` 를 직접 부르지 않고 여기를 거친다.
 * 그래서 나중에 Electron 으로 감쌀 때 이 파일의 구현 하나만 갈아 끼우면 된다.
 * (앱을 띄우는 쪽에서 `setHost(desktopHost)` 를 한 번 부른다.)
 *
 *   웹      localStorage + sessionStorage + <a download>
 *   데스크톱 파일 시스템 + 저장 대화상자
 *
 * 어느 쪽이든 자료는 이용자 기기 밖으로 나가지 않는다 (CON-2 · CON-8).
 */

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

/**
 * 브라우저에 설치하기 — 서비스 워커와 설치 묻기 (설계서 v1.18 §5.1).
 * 바깥 세계(브라우저 API)에 닿는 일이라 여기서만 다룬다. UI 는 `host().installer` 만 부른다.
 */
export interface Installer {
  /** 서비스 워커를 등록하고, 새 판이 준비되면 알린다. file://·오프라인 HTML·개발 서버에서는 아무것도 하지 않는다 */
  registerOffline(onUpdate: () => void): void;
  /** 준비된 새 판으로 바꾼다 — 대기 중인 워커를 깨우고 다시 연다 */
  applyUpdate(): void;
  /** 손수 새 판을 확인한다 (설계서 v2.0 §7). 'ready' 면 새 판이 받아져 알림이 뜬다 */
  checkUpdate(): Promise<'ready' | 'none' | 'unavailable'>;
  /** 브라우저가 설치 묻기를 허락한 상태인가 */
  canInstall(): boolean;
  /** 허락 상태가 바뀔 때 알린다. 되돌려 주는 함수로 구독을 푼다 */
  onInstallAvailable(listener: (can: boolean) => void): () => void;
  /** 설치를 묻는다 */
  promptInstall(): Promise<InstallOutcome>;
  /** 이미 설치된 앱 창으로 열렸는가 */
  isStandalone(): boolean;
}

/**
 * 전체 화면 — 브라우저 API 라 여기서만 다룬다 (설계서 v1.19 §2.2).
 * UI 는 `host().screen` 만 부른다. 데스크톱 앱의 F11 은 껍데기가 따로 한다.
 */
export interface Screen {
  /** 이 환경이 전체 화면을 허락하는가 (iframe·일부 브라우저는 막는다) */
  canFullscreen(): boolean;
  isFullscreen(): boolean;
  /** 켜져 있으면 끄고, 꺼져 있으면 켠다. 막혀 있으면 조용히 그대로 둔다 */
  toggleFullscreen(): Promise<void>;
  /** 바뀔 때 알린다 (Esc 로 나가는 것도 포함). 되돌려 주는 함수로 구독을 푼다 */
  onChange(listener: (on: boolean) => void): () => void;
}

export interface Host {
  /** 어떤 껍데기 위에서 도는지 — 화면에 알릴 일은 없고 진단용이다 */
  readonly kind: 'web' | 'desktop';
  readonly installer: Installer;
  readonly screen: Screen;
  /** 없거나 읽지 못하면 null */
  read(key: string): string | null;
  /** 쓰지 못했으면 false — 시크릿 모드·용량 초과 */
  write(key: string, value: string): boolean;
  remove(key: string): void;
  /** 같은 탭을 쓰는 동안만 기억한다. 소개 화면처럼 새 탭마다 다시 보여 줄 때 쓴다 */
  readSession(key: string): string | null;
  writeSession(key: string, value: string): boolean;
  /** 이용자 기기에 파일로 내보낸다 */
  exportFile(data: Blob, filename: string): Promise<void>;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '');
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;
let registered = false;
let applying = false;
const installListeners = new Set<(can: boolean) => void>();

/* 설치 묻기 허락은 React 가 붙기 전에 올 수 있어 모듈이 읽히는 때부터 받아 둔다 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    installListeners.forEach((listener) => listener(true));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installListeners.forEach((listener) => listener(false));
  });
}

function canUseServiceWorker(): boolean {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
  if (window.location.protocol === 'file:') return false;
  if (process.env.NEXT_PUBLIC_OFFLINE === '1') return false;
  return process.env.NODE_ENV === 'production';
}

const webInstaller: Installer = {
  registerOffline(onUpdate) {
    if (registered || !canUseServiceWorker()) return;
    registered = true;
    const watch = (worker: ServiceWorker | null): void => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        /* 이미 돌고 있는 판이 있을 때 새 판이 설치되면 — 첫 설치는 알리지 않는다 */
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          waitingWorker = worker;
          onUpdate();
        }
      });
    };
    navigator.serviceWorker
      .register(`${basePath}/sw.js`)
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          waitingWorker = registration.waiting;
          onUpdate();
        }
        watch(registration.installing);
        registration.addEventListener('updatefound', () => watch(registration.installing));
      })
      .catch(() => {
        /* 설치하지 못해도 앱은 그대로 돈다 */
      });
    /* 새 판을 적용하라고 했을 때만 다시 연다. 첫 설치의 claim 으로는 화면을 흔들지 않는다 */
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (applying) window.location.reload();
    });
  },

  applyUpdate() {
    if (typeof window === 'undefined') return;
    applying = true;
    if (waitingWorker) waitingWorker.postMessage('skip-waiting');
    else window.location.reload();
  },

  async checkUpdate() {
    if (!canUseServiceWorker()) return 'unavailable';
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return 'unavailable';
    try {
      await registration.update();
    } catch {
      return 'unavailable';
    }
    if (registration.waiting) {
      waitingWorker = registration.waiting;
      return 'ready';
    }
    const installing = registration.installing;
    if (!installing) return 'none';
    /* 받는 중이면 설치가 끝날 때까지 기다린다 — 그때 registerOffline 의 감시가 알림을 띄운다 */
    return new Promise((resolve) => {
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed') resolve('ready');
        else if (installing.state === 'redundant') resolve('none');
      });
    });
  },

  canInstall() {
    return deferredPrompt !== null;
  },

  onInstallAvailable(listener) {
    installListeners.add(listener);
    return () => {
      installListeners.delete(listener);
    };
  },

  async promptInstall() {
    const event = deferredPrompt;
    if (!event) return 'unavailable';
    deferredPrompt = null;
    installListeners.forEach((listener) => listener(false));
    try {
      await event.prompt();
      const choice = await event.userChoice;
      return choice.outcome;
    } catch {
      return 'unavailable';
    }
  },

  isStandalone() {
    if (typeof window === 'undefined') return false;
    const nav = navigator as Navigator & { standalone?: boolean };
    return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
  },
};

const webScreen: Screen = {
  canFullscreen() {
    return typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);
  },
  isFullscreen() {
    return typeof document !== 'undefined' && Boolean(document.fullscreenElement);
  },
  async toggleFullscreen() {
    if (typeof document === 'undefined') return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      /* 브라우저가 막았다 — 창 그대로 쓴다 */
    }
  },
  onChange(listener) {
    if (typeof document === 'undefined') return () => {};
    const handler = () => listener(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  },
};

/**
 * 브라우저 구현.
 * 저장소가 막혀 있어도(시크릿 모드) 던지지 않는다 — 저장만 안 될 뿐 그리기는 이어져야 한다.
 */
export const webHost: Host = {
  kind: 'web',
  installer: webInstaller,
  screen: webScreen,

  read(key) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  write(key, value) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },

  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* 지우지 못해도 편집은 이어진다 */
    }
  },

  readSession(key) {
    try {
      if (typeof window === 'undefined' || !window.sessionStorage) return null;
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },

  writeSession(key, value) {
    try {
      if (typeof window === 'undefined' || !window.sessionStorage) return false;
      window.sessionStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },

  async exportFile(data, filename) {
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

let current: Host = webHost;

/** 앱을 띄우기 전에 한 번 부른다. Electron 껍데기가 쓰는 자리다 */
export function setHost(next: Host): void {
  current = next;
}

export function host(): Host {
  return current;
}
