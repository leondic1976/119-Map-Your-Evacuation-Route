import { existsSync, readFileSync, statSync } from 'node:fs';

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
  },
};

export default nextConfig;
