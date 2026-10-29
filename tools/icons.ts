/**
 * 앱 아이콘 PNG 만들기 (설계서 v1.18 §5.1).
 *
 * 브라우저 설치(PWA)와 데스크톱 설치 파일은 PNG 아이콘이 필요하다. 그림은 코드로 그리고
 * Chromium 으로 찍어 저장소에 둔다 — 그래야 빌드가 밖에서 아무것도 받지 않는다.
 *
 *   npm run icons
 *   내려받은 크로미움이 없는 곳에서는 SMOKE_CHROMIUM 으로 다른 실행 파일을 준다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = process.cwd();
const iconDir = path.join(root, 'public', 'icons');
fs.mkdirSync(iconDir, { recursive: true });

/** 상단바 BrandMark 와 같은 집 모양 — 남색 바탕, 흰 집, 민트 문, 나가는 길 노란 화살표 */
export function iconSvg(size: number, maskable = false): string {
  const pad = maskable ? size * 0.14 : 0;
  const inner = size - pad * 2;
  const radius = maskable ? 0 : size * 0.22;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#0b2f51"/>
  <g transform="translate(${pad} ${pad}) scale(${inner / 32})" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 16.5 16 7l11 9.5" stroke="#ffffff" stroke-width="2.6"/>
    <path d="M8 15.5V26h16V15.5" stroke="#ffffff" stroke-width="2.6"/>
    <path d="M12.5 26v-6h5v6" stroke="#7ee2b8" stroke-width="2.6"/>
    <path d="M20 20.5h7.5M25 17.5l3 3-3 3" stroke="#ffd54a" stroke-width="2.6"/>
  </g>
</svg>`;
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });
  const jobs: Array<{ file: string; size: number; maskable: boolean }> = [
    { file: 'icon-192.png', size: 192, maskable: false },
    { file: 'icon-512.png', size: 512, maskable: false },
    { file: 'maskable-512.png', size: 512, maskable: true },
  ];
  for (const job of jobs) {
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${iconSvg(job.size, job.maskable)}</body></html>`);
    const svg = page.locator('svg');
    await svg.screenshot({ path: path.join(iconDir, job.file), omitBackground: true, type: 'png' });
    process.stdout.write(`  ${job.file}  ${job.size}×${job.size}\n`);
  }
  /* 데스크톱 설치 파일의 아이콘 — electron-builder 가 256px 이상 PNG 를 ico 로 바꾼다 */
  fs.copyFileSync(path.join(iconDir, 'icon-512.png'), path.join(root, 'desktop', 'icon.png'));
  process.stdout.write('  desktop/icon.png  512×512\n');
  await browser.close();
}

main().catch((e) => {
  process.stderr.write(String(e instanceof Error ? e.stack : e));
  process.exit(1);
});
