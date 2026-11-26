import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { countsFromRelease } from './tools/download-counts.mjs';
import { readReleases } from './tools/releases.mjs';

/** @type {import('next').NextConfig} */
const basePath = process.env.BASE_PATH || '';
/* 화면에 보이는 판 번호 — package.json 한 곳에서만 올린다 */
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
/* 설치 안내가 보여 주는 꾸러미 크기 — 오프라인 배포본을 먼저 만들었을 때만 안다 */
const zipPath = new URL('./dist/home-escape-map-offline.zip', import.meta.url);
const zipBytes = existsSync(zipPath) ? String(statSync(zipPath).size) : '';
/* 윈도우 설치 파일 크기 — 배포 워크플로가 Release 에서 받아 dist/desktop/ 에 두었을 때만 안다. 없으면 안내 페이지가 준비 중이라고 말한다 */
const sizeOf = (file) => {
  const p = new URL(`./dist/desktop/${file}`, import.meta.url);
  return existsSync(p) ? String(statSync(p).size) : '';
};
const desktopSetupBytes = sizeOf(`HomeEscapeMap-Setup-${version}.exe`);
const desktopPortableBytes = sizeOf(`HomeEscapeMap-Portable-${version}.exe`);
/* 안내 페이지의 판 기록 (대장 #130) */
const releases = readReleases(fileURLToPath(new URL('.', import.meta.url)), version);
/* 받은 횟수 (대장 #181) — 배포 워크플로가 받아 둔 Release 응답에서 읽는다. 로컬 빌드에는 없어 안내 페이지가 숫자를 보이지 않는다 */
let downloadCounts = '';
try {
  const counts = countsFromRelease(JSON.parse(readFileSync(new URL('./dist/desktop/release.json', import.meta.url), 'utf8')));
  if (counts) downloadCounts = JSON.stringify(counts);
} catch {
  /* 없으면 보이지 않는다 */
}

const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  productionBrowserSourceMaps: false,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_OFFLINE: process.env.NEXT_PUBLIC_OFFLINE || '',
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_OFFLINE_ZIP_BYTES: zipBytes,
    NEXT_PUBLIC_DESKTOP_SETUP_BYTES: desktopSetupBytes,
    NEXT_PUBLIC_DESKTOP_PORTABLE_BYTES: desktopPortableBytes,
    NEXT_PUBLIC_RELEASES: JSON.stringify(releases),
    NEXT_PUBLIC_DOWNLOAD_COUNTS: downloadCounts,
  },
};

export default nextConfig;
