/**
 * 배포 산출물 이름 — 화면(안내 페이지)과 빌드 도구가 같은 이름을 쓴다 (설계서 v1.18 §5).
 * 주소에 한글이 섞이지 않게 파일 이름은 영문이다. 사람이 읽는 이름은 화면이 따로 붙인다.
 *
 * 파일은 두 곳에 있다(대장 #180 · #181).
 *   - GitHub Release `desktop`  가장 새 판의 설치판 · 무설치판 · 꾸러미만 둔다. 안내 페이지의 받기 단추가 여기를 가리킨다.
 *                               GitHub 은 Release 파일을 받은 횟수를 세어 주고, 그 숫자를 안내 페이지에 보인다.
 *   - 같은 사이트의 `download/`  프로그램의 자동 업데이트가 받는 곳이고, GitHub 이 막힌 곳에서 손으로 받는 곳이다. 여기서 받은 것은 세지 않는다.
 */

/** 정적 페이지 `download/` 아래에 실리는 오프라인 꾸러미 */
export const OFFLINE_ZIP_NAME = 'home-escape-map-offline.zip';

/** 꾸러미 안 폴더 이름 */
export const OFFLINE_BUNDLE_DIR = '우리집 대피지도';

/** 윈도우 설치 파일을 덮어쓰며 올리는 GitHub Release 태그 — deploy.yml 이 여기서 받아 `dist/desktop/` 에 둔다 */
export const DESKTOP_RELEASE_TAG = 'desktop';

/** deploy.yml 이 받은 설치 파일을 두는 자리(`dist/` 아래). pack.ts 가 `out/download/` 로 옮긴다 */
export const DESKTOP_DIST_DIR = 'desktop';

/** 설치 파일이 올라가는 공개 저장소 */
export const RELEASE_REPO = 'leondic1976/119-Map-Your-Evacuation-Route';

/** Release `desktop` 에 올린 파일을 받는 주소 — 이 주소로 받아야 GitHub 이 횟수를 센다 */
export function releaseAssetUrl(name: string): string {
  return `https://github.com/${RELEASE_REPO}/releases/download/${DESKTOP_RELEASE_TAG}/${name}`;
}

/** 받은 횟수 — 배포할 때 Release 에서 읽어 적는다. 모르면 null */
export interface DownloadCounts {
  setup: number;
  portable: number;
  zip: number;
}

export function desktopAssetNames(version: string): { setup: string; portable: string } {
  return {
    setup: `HomeEscapeMap-Setup-${version}.exe`,
    portable: `HomeEscapeMap-Portable-${version}.exe`,
  };
}

/** 안내 페이지가 가리키는 같은 사이트 안의 설치 파일 주소 */
export function desktopDownloadPaths(basePath: string, version: string): { setup: string; portable: string } {
  const names = desktopAssetNames(version);
  const base = `${basePath.replace(/\/$/, '')}/download`;
  return { setup: `${base}/${names.setup}`, portable: `${base}/${names.portable}` };
}

/** 사람이 읽는 크기 — 20.3MB 꼴 */
export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
