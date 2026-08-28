import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from '@playwright/test';
const outDir = path.join(process.cwd(), 'out');
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
function serve(dir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const raw = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.join(dir, raw);
    if (raw.endsWith('/')) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      const alt = `${file}.html`;
      if (fs.existsSync(alt)) file = alt; else { res.writeHead(404); res.end('x'); return; }
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => {
    const a = server.address(); const p = typeof a === 'object' && a ? a.port : 0;
    r({ url: `http://127.0.0.1:${p}/`, close: () => new Promise((x) => server.close(() => x())) });
  }));
}
async function main() {
  const s = await serve(outDir);
  const b = await chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM || undefined });
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
  const page = await c.newPage();
  const dir = process.argv[2];
  fs.mkdirSync(dir, { recursive: true });
  await page.goto(s.url);
  await page.waitForSelector('.k-gate');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${dir}/gate.png` });
  await page.locator('[data-audience="kids"]').click();
  await page.waitForSelector('.k-app');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/onboard.png` });
  await page.locator('[data-template="apt_tower"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-lowfloor="no"]').click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${dir}/edit.png` });
  const box = (await page.locator('svg.k-stage').boundingBox())!;
  const cs = box.width / 24;
  await page.mouse.click(box.x + 6.5 * cs, box.y + 4.5 * cs);
  await page.waitForTimeout(300);
  await page.locator('[data-coach="kids-meeting-later"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-coach="kids-start-game"]').click();
  await page.waitForTimeout(400);
  const anyway = page.locator('[data-coach="kids-start-anyway"]');
  if (await anyway.count()) { await page.screenshot({ path: `${dir}/missing.png` }); await anyway.click(); }
  await page.waitForSelector('.k-game');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${dir}/game.png` });
  await b.close(); await s.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
