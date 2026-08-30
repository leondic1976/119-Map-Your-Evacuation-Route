/**
 * 바깥 세계와 닿는 단 하나의 자리 — 저장소와 파일 내보내기.
 *
 * 나머지 코드는 `localStorage` 도 `document` 도 직접 부르지 않고 여기를 거친다.
 * 그래서 나중에 Electron 으로 감쌀 때 이 파일의 구현 하나만 갈아 끼우면 된다.
 * (앱을 띄우는 쪽에서 `setHost(desktopHost)` 를 한 번 부른다.)
 *
 *   웹      localStorage + <a download>
 *   데스크톱 파일 시스템 + 저장 대화상자
 *
 * 어느 쪽이든 자료는 이용자 기기 밖으로 나가지 않는다 (CON-2 · CON-8).
 */

export interface Host {
  /** 어떤 껍데기 위에서 도는지 — 화면에 알릴 일은 없고 진단용이다 */
  readonly kind: 'web' | 'desktop';
  /** 없거나 읽지 못하면 null */
  read(key: string): string | null;
  /** 쓰지 못했으면 false — 시크릿 모드·용량 초과 */
  write(key: string, value: string): boolean;
  remove(key: string): void;
  /** 이용자 기기에 파일로 내보낸다 */
  exportFile(data: Blob, filename: string): Promise<void>;
}

/**
 * 브라우저 구현.
 * 저장소가 막혀 있어도(시크릿 모드) 던지지 않는다 — 저장만 안 될 뿐 그리기는 이어져야 한다.
 */
export const webHost: Host = {
  kind: 'web',

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
