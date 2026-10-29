/**
 * 배포 산출물 이름 — 화면(안내 페이지)과 빌드 도구가 같은 이름을 쓴다 (설계서 v1.18 §5).
 * 주소에 한글이 섞이지 않게 파일 이름은 영문이다. 사람이 읽는 이름은 화면이 따로 붙인다.
 *
 * 윈도우 설치 파일은 GitHub Release `desktop` 태그에 올라가지만, 저장소가 비공개라 그 주소는 공개 링크가 아니다.
 * 그래서 Pages 배포(deploy.yml)가 Release 의 산출물을 받아 `download/` 아래에 함께 싣고, 안내 페이지는
 * 같은 사이트 안의 그 파일을 가리킨다. 바깥 주소로 나가는 링크는 없다.
 */

/** 정적 페이지 `download/` 아래에 실리는 오프라인 꾸러미 */
export const OFFLINE_ZIP_NAME = 'home-escape-map-offline.zip';

/** 꾸러미 안 폴더 이름 */
export const OFFLINE_BUNDLE_DIR = '우리집 대피지도';

/** 윈도우 설치 파일을 덮어쓰며 올리는 GitHub Release 태그 — deploy.yml 이 여기서 받아 `dist/desktop/` 에 둔다 */
export const DESKTOP_RELEASE_TAG = 'desktop';

/** deploy.yml 이 받은 설치 파일을 두는 자리(`dist/` 아래). pack.ts 가 `out/download/` 로 옮긴다 */
export const DESKTOP_DIST_DIR = 'desktop';

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
