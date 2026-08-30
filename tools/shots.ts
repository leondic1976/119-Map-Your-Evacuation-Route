/**
 * 화면 캡처 — 눈으로 확인하기 위한 도구. out/ 를 띄우고 몇 장 찍는다.
 *   npm run shots -- <출력 폴더>
 *
 * 화면 크기는 SHOT_VIEWPORT 로 준다. PC 전용이므로 너비 1024px 이상만 허용한다.
 * 내려받은 크로미움이 없는 곳에서는 SMOKE_CHROMIUM 으로 다른 실행 파일을 준다.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = process.cwd();
const outDir = path.join(root, 'out');
const dest = process.argv[2] ?? path.join(root, 'shots');
fs.mkdirSync(dest, { recursive: true });

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const raw = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(outDir, raw);
  if (raw.endsWith('/')) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const alt = `${file}.html`;
    if (fs.existsSync(alt)) file = alt;
    else {
      res.writeHead(404);
      res.end();
      return;
    }
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

async function main(): Promise<void> {
  const vp = /^(\d+)x(\d+)$/.exec(process.env.SHOT_VIEWPORT ?? '');
  const viewport = vp ? { width: Number(vp[1]), height: Number(vp[2]) } : { width: 1440, height: 900 };
  if (viewport.width < 1024) throw new Error('PC 전용 화면 캡처는 너비 1024px 이상이어야 한다.');
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  const url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/`;
  const browser = await chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.k-welcome');
  await page.screenshot({ path: path.join(dest, '0-welcome.png') });
  await page.locator('[data-coach="kids-welcome-start"]').click();
  await page.waitForSelector('.k-onboard');
  await page.screenshot({ path: path.join(dest, '1-start-methods.png') });
  await page.locator('[data-start-path="guided"]').click();
  await page.screenshot({ path: path.join(dest, '1a-bedroom-count.png') });
  await page.locator('[data-bedroom-count="2"]').click();
  await page.screenshot({ path: path.join(dest, '1b-layout.png') });
  await page.locator('[data-template="apt_2room"]').click();
  await page.screenshot({ path: path.join(dest, '1c-customize-open-kitchen.png') });
  await page.locator('[data-coach="kids-plan-start"]').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dest, '2-myspot.png') });
  const box = (await page.locator('svg.k-stage').boundingBox())!;
  const cs = box.width / 24;
  const cell = (x: number, y: number) => ({ x: box.x + (x + 0.5) * cs, y: box.y + (y + 0.5) * cs });
  await page.mouse.click(cell(10, 4).x, cell(10, 4).y);
  await page.waitForTimeout(300);
  await page.locator('[data-coach="kids-meeting-later"]').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dest, '3-ready.png') });
  /* 기본값과 다른 머리 모양이 3D에서도 보이게 하윤을 고른다. */
  await page.locator('[data-coach="kids-character"]').click();
  await page.locator('[data-character="girl_braid"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-coach="kids-start-game"]').click();
  await page.waitForSelector('.k-game');
  await page.waitForTimeout(3000);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(dest, '4-game.png') });
  await page.locator('[data-coach="kids-quit"]').click();
  await page.waitForSelector('.k-report-view');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dest, '5-report.png') });
  await page.locator('[data-coach="kids-replay3d-open"]').click();
  await page.waitForSelector('.k-replay-canvas[data-character="girl_braid"][data-character-style="braid"]');
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(dest, '5a-replay3d-character.png') });
  await page.locator('[data-view="follow"]').click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(dest, '5b-replay3d-character-close.png') });
  /* 짧은 기록은 캡처 중 끝 장면으로 넘어갈 수 있다. 현재 보이는 닫기 길을 직접 누른다. */
  const replayClose = page
    .getByRole('button', { name: '닫기', exact: true })
    .or(page.getByRole('button', { name: '결과로 돌아가기', exact: true }));
  await replayClose.last().click();
  await page.waitForSelector('[data-coach="kids-replay3d"]', { state: 'detached' });
  await page.waitForSelector('.k-report-view');
  await page.locator('[data-coach="kids-edit-plan"]').click();
  await page.waitForSelector('svg.k-stage');
  await page.waitForTimeout(500);
  await page.locator('[data-coach="kids-route-slot"] [data-slot="primary"]').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dest, '6-edit.png') });
  await page.locator('[data-coach="kids-print"]').click();
  await page.waitForSelector('.k-preview svg.k-sheet');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dest, '7-print.png') });
  const footer = await page.locator('.k-preview footer button').allInnerTexts();
  await page.locator('.k-preview footer button', { hasText: '닫기' }).click();
  await page.waitForSelector('.k-preview', { state: 'detached' });
  await page.locator('[data-coach="kids-template"]').click();
  await page.locator('[data-start-path="starter"]').click();
  await page.screenshot({ path: path.join(dest, '8-box-bedroom-count.png') });
  await page.locator('[data-bedroom-count="3"]').click();
  await page.screenshot({ path: path.join(dest, '8a-box-shells.png') });
  await page.locator('[data-shell="bend-left"]').click();
  await page.screenshot({ path: path.join(dest, '8b-box-room-sides.png') });
  await page.locator('[data-bedroom-side="E"]').click();
  await page.locator('[data-box-sides-next]').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dest, '8c-box-residual-preview.png') });
  process.stdout.write(`preview footer: ${footer.join(' | ')}
`);
  process.stdout.write(`errors: ${errors.length}\n${errors.slice(0, 5).join('\n')}\n`);
  await browser.close();
  server.close();
}

main().catch((e) => {
  process.stderr.write(String(e instanceof Error ? e.stack : e));
  process.exit(1);
});
