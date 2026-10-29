/**
 * 배포 산출물 이름 — 화면(안내 페이지)과 빌드 도구가 같은 이름을 쓴다 (설계서 v1.18 §5).
 * 주소에 한글이 섞이지 않게 파일 이름은 영문이다. 사람이 읽는 이름은 화면이 따로 붙인다.
 */

/** 공개 저장소 — 설치 파일 Releases 와 오류 신고의 자리. 이동 링크일 뿐 요청은 보내지 않는다 */
export const REPO_URL = 'https://github.com/leondic1976/119-Map-Your-Evacuation-Route';

/** 정적 페이지 `download/` 아래에 실리는 오프라인 꾸러미 */
export const OFFLINE_ZIP_NAME = 'home-escape-map-offline.zip';

/** 꾸러미 안 폴더 이름 */
export const OFFLINE_BUNDLE_DIR = '우리집 대피지도';

/** 윈도우 설치 파일을 덮어쓰며 올리는 GitHub Release 태그 */
export const DESKTOP_RELEASE_TAG = 'desktop';

export function desktopAssetNames(version: string): { setup: string; portable: string } {
  return {
    setup: `HomeEscapeMap-Setup-${version}.exe`,
    portable: `HomeEscapeMap-Portable-${version}.exe`,
  };
}

export function desktopAssetUrls(version: string): { setup: string; portable: string; releases: string } {
  const names = desktopAssetNames(version);
  const base = `${REPO_URL}/releases/download/${DESKTOP_RELEASE_TAG}`;
  return {
    setup: `${base}/${names.setup}`,
    portable: `${base}/${names.portable}`,
    releases: `${REPO_URL}/releases/tag/${DESKTOP_RELEASE_TAG}`,
  };
}

/** 사람이 읽는 크기 — 20.3MB 꼴 */
export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
