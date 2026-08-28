/**
 * 어린이 화면 캡처 — 눈으로 확인하기 위한 도구. out/ 를 띄우고 몇 장 찍는다.
 *   npx tsx tools/shot-kids.ts <출력 폴더>
 *
 * 화면 크기는 KIDS_SHOT_VIEWPORT 로 준다 (`390x844` 처럼). 기본은 1440x900 이다.
 * 좁은 화면(767px 이하)일 때는 「더보기」 시트도 한 장 찍는다 (설계서 v1.2 §13).
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
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  const url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/`;
  const browser = await chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM || undefined });
  const vp = /^(\d+)x(\d+)$/.exec(process.env.KIDS_SHOT_VIEWPORT ?? '');
  const viewport = vp ? { width: Number(vp[1]), height: Number(vp[2]) } : { width: 1440, height: 900 };
  const narrow = viewport.width <= 767;
  const page = await browser.newPage({ viewport, isMobile: narrow, hasTouch: narrow, deviceScaleFactor: narrow ? 2 : 1 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(dest, '1-gate.png') });
  await page.locator('[data-audience="kids"]').click();
  await page.waitForSelector('.k-onboard');
  await page.screenshot({ path: path.join(dest, '2-template.png') });
  await page.locator('[data-template="apt_2room"]').click();
  await page.waitForSelector('[data-lowfloor="no"]');
  await page.locator('[data-lowfloor="no"]').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dest, '3-myspot.png') });
  const box = (await page.locator('svg.k-stage').boundingBox())!;
  const cs = box.width / 24;
  const cell = (x: number, y: number) => ({ x: box.x + (x + 0.5) * cs, y: box.y + (y + 0.5) * cs });
  await page.mouse.click(cell(10, 4).x, cell(10, 4).y);
  await page.waitForTimeout(300);
  await page.locator('[data-coach="kids-meeting-later"]').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dest, '4-ready.png') });
  if (narrow) {
    /* 좁은 화면에서는 상단바 단추가 여기로 모인다 */
    await page.locator('[data-coach="kids-more"]').click();
    await page.waitForSelector('.k-optsheet');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(dest, '4b-sheet.png') });
    await page.locator('.k-optsheet .k-x').click();
    await page.waitForTimeout(300);
  }
  await page.locator('[data-coach="kids-start-game"]').click();
  await page.waitForSelector('.k-game');
  await page.waitForTimeout(3000);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(dest, '5-game.png') });
  await page.locator('[data-coach="kids-quit"]').click();
  await page.waitForSelector('.k-report-view');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dest, '6-report.png') });
  await page.locator('[data-coach="kids-edit-plan"]').click();
  await page.waitForSelector('svg.k-stage');
  await page.waitForTimeout(500);
  await page.locator('[data-coach="kids-route-slot"] [data-slot="primary"]').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dest, '7-edit.png') });
  await page.locator('[data-coach="kids-print"]').click();
  await page.waitForSelector('.k-preview svg.k-sheet');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dest, '8-print.png') });
  const footer = await page.locator('.k-preview footer button').allInnerTexts();
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
