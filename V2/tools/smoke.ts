/**
 * Chromium 실조작 — 세 학년 단계를 마우스와 터치로 끝까지 눌러 본다.
 * `dist/` 를 띄워서 돌리므로 빌드 뒤에 부른다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { preview } from 'vite';

const PORT = 4179;
const URL_BASE = `http://localhost:${PORT}/`;
const SHOTS = path.join(process.cwd(), '.shots');
fs.mkdirSync(SHOTS, { recursive: true });

let passed = 0;
const failures: string[] = [];

async function scenario(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    process.stdout.write(`  통과  ${name}\n`);
  } catch (err) {
    failures.push(`${name}\n    ${err instanceof Error ? err.message : String(err)}`);
    process.stdout.write(`  실패  ${name}\n`);
  }
}

const t = (id: string): string => `[data-testid="${id}"]`;

/** 지도 좌표(네모 단위) → 화면 좌표 */
async function toScreen(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([px, py]) => {
      const svg = document.querySelector('.stage svg.plan') as SVGSVGElement;
      const u = 100 / Number(svg.getAttribute('data-density') ?? 1);
      const p = new DOMPoint(px! * u, py! * u).matrixTransform(svg.getScreenCTM()!);
      return { x: p.x, y: p.y };
    },
    [x, y],
  );
}

async function clickAt(page: Page, x: number, y: number): Promise<void> {
  const p = await toScreen(page, x, y);
  await page.mouse.click(p.x, p.y);
}

async function tapAt(page: Page, x: number, y: number): Promise<void> {
  const p = await toScreen(page, x, y);
  await page.touchscreen.tap(p.x, p.y);
}

/** 점들을 지나 끈다 */
async function dragThrough(page: Page, dots: [number, number][]): Promise<void> {
  const first = await toScreen(page, dots[0]![0], dots[0]![1]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (let i = 1; i < dots.length; i++) {
    const p = await toScreen(page, dots[i]![0], dots[i]![1]);
    await page.mouse.move(p.x, p.y, { steps: 12 });
  }
  await page.mouse.up();
}

const attr = (page: Page, name: string): Promise<string | null> => page.locator('.stage svg.plan').first().getAttribute(`data-${name}`);
const num = async (page: Page, name: string): Promise<number> => Number(await attr(page, name));

async function fresh(browser: Browser, opts: Parameters<Browser['newContext']>[0], seenHowTo = true, url = URL_BASE): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  // 서비스 워커는 따로 시험한다. 워커가 답하면 page.route 가 요청을 보지 못한다
  const ctx = await browser.newContext({ locale: 'ko-KR', serviceWorkers: 'block', ...opts });
  const page = await ctx.newPage();
  // tsx 가 함수 이름을 보존하려고 넣는 도우미를 브라우저에도 둔다
  await page.addInitScript('window.__name = (f) => f');
  // 불이 시작되는 칸은 시각에서 고른다. 어디서 돌려도 같은 판이 되도록 시각을 고정한다
  await page.addInitScript('Date.now = () => 1700000000000');
  // 사용법 카드는 따로 시험한다. 다른 시나리오에서는 이미 본 것으로 둔다
  if (seenHowTo) await page.addInitScript(`localStorage.setItem('home-escape-map-v2:howto', '${JSON.stringify(['draw', 'sort', 'door', 'mark', 'route', 'drill'])}')`);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${m.text()} ${m.location().url}`);
  });
  await page.goto(url);
  return { ctx, page, errors };
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

/** 실제 사이트처럼 뿌리와 /V2/ 를 내주고, 인터넷이 끊긴 상황을 흉내 낸다 */
async function startSite(port: number): Promise<{ url: string; pages: Map<string, string>; setDown: (down: boolean) => void; close: () => void }> {
  const dist = path.join(process.cwd(), 'dist');
  const pages = new Map<string, string>();
  let down = false;
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (down) {
      res.writeHead(503).end();
      return;
    }
    const page = pages.get(pathname);
    if (page !== undefined) {
      res.writeHead(200, { 'Content-Type': pathname.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }).end(page);
      return;
    }
    const rel = pathname.startsWith('/V2/') ? pathname.slice(4) || 'index.html' : '';
    const file = path.join(dist, rel);
    if (!rel || !file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${port}/`, pages, setDown: (v) => (down = v), close: () => server.close() };
}

const VOICE_COUNT = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/voice/manifest.json'), 'utf8')).items.length as number;

/** 워커가 음성까지 다 받아 둘 때까지 기다린다 */
async function waitForOfflineCopy(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  // waitForFunction 은 비동기 조건의 Promise 를 참으로 볼 수 있어 직접 되묻는다
  const until = Date.now() + 60000;
  let saved = 0;
  while (Date.now() < until) {
    saved = await page.evaluate(async () => {
      let most = 0;
      for (const key of await caches.keys()) {
        if (!key.startsWith('hem2-')) continue;
        const items = await (await caches.open(key)).keys();
        most = Math.max(most, items.filter((r) => r.url.endsWith('.mp3')).length);
      }
      return most;
    });
    if (saved === VOICE_COUNT) return;
    await page.waitForTimeout(300);
  }
  assert.fail(`음성 저장 ${saved}/${VOICE_COUNT}`);
}

async function voicePlays(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const s = document.documentElement.dataset.voiceState;
      return s === 'playing' || s === 'ended' || s === 'failed';
    },
    undefined,
    { timeout: 10000 },
  );
  const state = await page.evaluate(() => document.documentElement.dataset.voiceState);
  assert.ok(state === 'playing' || state === 'ended', `음성 상태: ${state}`);
}

async function checkInstallLink(page: Page): Promise<void> {
  const box = await page.locator(t('install-link')).boundingBox();
  assert.ok(box && box.width >= 48 && box.height >= 48, `설치 안내 링크 크기: ${box?.width}x${box?.height}`);
}

async function imagesLoaded(page: Page): Promise<void> {
  await page.waitForFunction(() => [...document.images].every((img) => img.complete));
  const broken = await page.evaluate(() => [...document.images].filter((img) => img.naturalWidth === 0).map((img) => img.src));
  assert.deepEqual(broken, [], '그림이 깨졌다');
}

async function fontLoaded(page: Page): Promise<void> {
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  const ok = await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Jua' && f.status === 'loaded'));
  assert.ok(ok, 'Jua 글꼴이 실리지 않았다');
}

async function startAs(page: Page, grade: number): Promise<void> {
  await page.click(t('start'));
  await page.click(t(`grade-${grade}`));
  await page.click(t('tag-done'));
  await page.waitForSelector('.studio');
}

async function checkTargets(page: Page, label: string): Promise<void> {
  const small = await page.evaluate(() => {
    const out: string[] = [];
    // 덮개가 떠 있으면 그 뒤의 단추는 가려진 것이 맞으므로 맨 위 화면만 잰다
    const top = document.querySelector('.replay') ?? document.querySelector('.overlay') ?? document.querySelector('.studio')!;
    for (const el of top.querySelectorAll<HTMLElement>('button')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.width < 48 || r.height < 48) out.push(`${el.dataset.testid ?? el.textContent} ${Math.round(r.width)}x${Math.round(r.height)}`);
      // 잘리거나 가려져서 눌리지 않는 단추도 잡는다
      for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.92], [0.5, 0.08]] as const) {
        const hit = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
        if (!hit || !(el === hit || el.contains(hit))) {
          out.push(`${el.dataset.testid ?? el.textContent} 가려짐`);
          break;
        }
      }
    }
    return out;
  });
  assert.deepEqual(small, [], `${label}: 48 아래 단추`);
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(scroll <= 0, `${label}: 가로 스크롤 ${scroll}`);
  const spacing = await page.evaluate(() => {
    const svg = document.querySelector('.stage svg.plan') as SVGSVGElement | null;
    if (!svg) return 999;
    const a = new DOMPoint(0, 0).matrixTransform(svg.getScreenCTM()!);
    const b = new DOMPoint(100, 0).matrixTransform(svg.getScreenCTM()!);
    return b.x - a.x;
  });
  assert.ok(spacing >= 48, `${label}: 모눈 간격 ${spacing.toFixed(1)}px`);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

/** 탈출까지 칸을 눌러 간다. 만지기 카드가 뜨면 만져 본다 */
async function playToEnd(page: Page, tap: (x: number, y: number) => Promise<void>): Promise<void> {
  for (let guard = 0; guard < 60; guard++) {
    if (await page.locator(t('drill-call')).count()) break;
    if (await page.locator(t('drill-touch')).count()) {
      await page.click(t('drill-touch'));
      await page.waitForTimeout(100);
      continue;
    }
    const phase = await page.locator(t('player')).getAttribute('data-phase');
    if (phase === 'outside') {
      await page.click(t('drill-meet'));
      await page.waitForSelector(t('drill-call'), { timeout: 8000 });
      break;
    }
    // 그려 둔 길의 다음 칸을 누른다
    const next = await page.evaluate(() => {
      const svg = document.querySelector('.stage svg.plan') as SVGElement;
      const at = document.querySelector('[data-testid="player"]')!.getAttribute('data-at')!;
      const route = (svg.getAttribute('data-route') ?? '').split(' ');
      const cellOf = (k: string) => document.querySelector(`.stage [data-cell] [data-piece="${k}"]`)?.closest('[data-cell]')?.getAttribute('data-cell') ?? null;
      const ids = route.map((s) => (s === 'out' ? 'out' : cellOf(s)));
      return { next: route[ids.indexOf(at) + 1] ?? null, rows: 0 };
    });
    assert.ok(next.next, '길의 다음 칸이 있어야 한다');
    if (next.next === 'out') {
      const cols = await num(page, 'cols');
      const rows = await num(page, 'rows');
      await tap(cols / 2, rows + 0.9);
    } else {
      const [sq, part] = next.next.split(':');
      const [x, y] = sq!.split(',').map(Number);
      // 비스듬한 벽에 나뉜 조각은 네모 가운데를 누르면 벽 위가 될 수 있어 조각 가운데를 누른다
      let fx = 0.5;
      let fy = 0.5;
      if (part?.startsWith('c')) {
        const [cx, cy] = part.slice(1).split('_').map(Number);
        fx = cx! / 10000;
        fy = cy! / 10000;
      } else if (part) {
        fx = part[1] === 'e' ? 0.7 : 0.3;
        fy = part[0] === 'n' ? 0.3 : 0.7;
      }
      await tap(x! + fx, y! + fy);
    }
    await page.waitForFunction(() => document.querySelectorAll('.glow-cell, .glow-out').length > 0 || document.querySelector('[data-testid="drill-touch"], [data-testid="drill-call"]') !== null || document.querySelector('[data-testid="player"]')?.getAttribute('data-phase') === 'outside', undefined, { timeout: 5000 });
    await page.waitForTimeout(900);
  }
}

async function main(): Promise<void> {
  const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'silent' });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  process.stdout.write('\n  브라우저 시나리오\n');

  await scenario('1~2학년: 마우스로 끌어 집을 그리고 연습·3D·인쇄까지 간다', async () => {
    const { ctx, page, errors } = await fresh(browser, { viewport: { width: 1366, height: 768 } });
    await page.waitForTimeout(4900);
    await shot(page, '01-welcome');
    await startAs(page, 1);
    await shot(page, '02-draw-start');
    await checkTargets(page, '그리기');

    // 네모 집 본(1,0)-(7,6) 테두리를 한 번에 끈다
    await dragThrough(page, [[1, 0], [7, 0], [7, 6], [1, 6], [1, 0]]);
    assert.equal(await num(page, 'cells'), 1, '테두리를 닫으면 칸이 하나');
    assert.equal(await page.locator(t('bubble')).getAttribute('data-line'), 'draw-first-cell');
    await dragThrough(page, [[1, 3], [7, 3]]);
    assert.equal(await num(page, 'cells'), 2);

    // 점을 차례로 눌러도 그려진다
    await clickAt(page, 4, 0);
    await clickAt(page, 4, 3);
    assert.equal(await num(page, 'cells'), 3, '점을 차례로 눌러 칸을 나눈다');
    await clickAt(page, 4, 3); // 고른 점을 풀어 둔다
    await shot(page, '03-draw-done');

    // 지우개와 되돌리기
    const before = await num(page, 'walls');
    await page.click(t('tool-eraser'));
    await clickAt(page, 4, 0.5);
    assert.equal(await num(page, 'walls'), before - 1, '지우개');
    await page.click(t('undo'));
    assert.equal(await num(page, 'walls'), before, '되돌리기');
    await page.click(t('tool-pencil'));

    await page.click(t('next'));
    // 칸 나누기
    await checkTargets(page, '칸 나누기');
    assert.equal(await num(page, 'tagged'), 0);
    await clickAt(page, 2.5, 1.5);
    await clickAt(page, 5.5, 1.5);
    await page.click(t('crayon-pass'));
    await clickAt(page, 4, 4.5);
    assert.equal(await num(page, 'tagged'), 3);
    await shot(page, '04-sort');
    await page.click(t('next'));

    // 문 달기
    await checkTargets(page, '문 달기');
    assert.equal(await page.locator(t('check-exit')).getAttribute('class'), '');
    await clickAt(page, 2.5, 3); // 왼쪽 방 ↔ 지나가는 곳
    await clickAt(page, 5.5, 3); // 오른쪽 방 ↔ 지나가는 곳
    await clickAt(page, 4.5, 6); // 밖으로 나가는 문
    assert.equal(await num(page, 'doors'), 3);
    assert.equal(await page.locator(t('check-exit')).getAttribute('class'), 'done');
    assert.equal(await page.locator(t('check-linked')).getAttribute('class'), 'done');
    await shot(page, '05-door');
    await page.click(t('next'));

    // 표시 — 안쪽에 만나는 곳을 놓으려 하면 말로 알려 준다
    await checkTargets(page, '표시하기');
    await clickAt(page, 2.5, 1.5);
    assert.ok((await attr(page, 'marks'))!.includes('me'));
    await clickAt(page, 2.5, 1.5);
    assert.equal(await page.locator(t('bubble')).getAttribute('data-line'), 'mark-need-outside');
    await clickAt(page, 6, 6.9);
    assert.equal(await attr(page, 'marks'), 'me meet');
    await shot(page, '06-mark');
    await page.click(t('next'));

    // 나가는 길 — 문이 없는 칸을 누르면 막아 주고, 칸을 차례로 누르면 이어진다
    await checkTargets(page, '나가는 길');
    await clickAt(page, 5.5, 1.5);
    assert.equal(await page.locator(t('bubble')).getAttribute('data-line'), 'route-no-way');
    await clickAt(page, 4, 4.5);
    assert.equal(await page.locator(t('bubble')).getAttribute('data-line'), 'route-start', '맞게 누르면 단계 안내로 돌아간다');
    await clickAt(page, 4, 6.9);
    assert.equal(await page.locator(t('bubble')).getAttribute('data-line'), 'route-done');
    assert.ok((await attr(page, 'route'))!.endsWith('out'));
    await shot(page, '07-route');
    await page.click(t('next'));

    // 대피 연습
    await page.waitForSelector(t('drill-start'));
    await page.click(t('drill-start'));
    await page.waitForTimeout(400);
    await shot(page, '08-drill-start');
    await checkTargets(page, '대피 연습');
    assert.equal(await page.locator(t('drill-crouch')).getAttribute('aria-pressed'), 'false');
    await page.click(t('drill-crouch'));
    assert.equal(await page.locator(t('drill-crouch')).getAttribute('aria-pressed'), 'true');
    await playToEnd(page, (x, y) => clickAt(page, x, y));
    await shot(page, '09-drill-end');
    await page.click(t('drill-call'));

    // 돌아보기
    await page.waitForSelector(t('praises'));
    assert.ok((await page.locator(`${t('praises')} li`).count()) >= 1, '잘한 점은 하나 이상');
    assert.ok((await page.locator(`${t('fixes')} li`).count()) <= 3, '고칠 점은 셋까지');
    await shot(page, '10-review');
    await checkTargets(page, '돌아보기');

    // 인쇄물
    await page.emulateMedia({ media: 'print' });
    assert.ok(await page.locator('.print-sheet').isVisible(), '인쇄 때 지도가 보인다');
    assert.equal(await page.locator('.guide-bar').isVisible(), false);
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.screenshot({ path: path.join(SHOTS, '11-print.png') });
    await page.setViewportSize(size);
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    fs.writeFileSync(path.join(SHOTS, '11-print.pdf'), pdf);
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    assert.equal(pages, 1, `인쇄는 한 장이어야 한다: ${pages}장`);
    await page.emulateMedia({ media: 'screen' });

    // 3D
    await page.click(t('open-replay'));
    await page.waitForSelector(t('replay-canvas'), { timeout: 20000 });
    await page.waitForTimeout(1200);
    await shot(page, '12-replay');
    await checkTargets(page, '3D');
    const lit = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="replay-canvas"]') as HTMLCanvasElement;
      const g = c.getContext('webgl2') ?? c.getContext('webgl');
      if (!g) return -1;
      const px = new Uint8Array(4 * 100);
      g.readPixels(c.width / 2 - 5, c.height / 2 - 5, 10, 10, g.RGBA, g.UNSIGNED_BYTE, px);
      return new Set(px).size;
    });
    assert.ok(lit > 1, `3D 가 그려져야 한다: ${lit}`);
    const stage3d = page.locator(`${t('replay')} > div`).first();
    assert.equal(await stage3d.getAttribute('data-view'), 'eye', '기본은 내 시점이다');
    assert.match(await page.locator(t('replay-view')).innerText(), /위에서 보기/);
    await shot(page, '12b-replay-eye');
    await page.click(t('replay-view'));
    assert.equal(await stage3d.getAttribute('data-view'), 'above', '위에서 본다');
    assert.match(await page.locator(t('replay-view')).innerText(), /내 눈으로 보기/);
    await page.waitForFunction(() => document.querySelector('[data-testid="replay-caption"]')?.getAttribute('data-ended') === '1', undefined, { timeout: 180000 });
    await shot(page, '13-replay-end');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator(t('replay')).count(), 0, 'Esc 로 닫힌다');

    assert.deepEqual(errors, [], '콘솔 오류');
    await ctx.close();
  });

  await scenario('3~4학년: 태블릿 터치로 점을 눌러 그리고 도와줘로 끝까지 간다', async () => {
    const { ctx, page, errors } = await fresh(browser, { viewport: { width: 768, height: 1024 }, hasTouch: true });
    await startAs(page, 3);
    await checkTargets(page, '세로 태블릿 그리기');
    await shot(page, '20-mid-draw');

    // 터치로 점을 차례로 눌러 칸 하나를 만든다
    for (const [x, y] of [[1, 0], [9, 0], [9, 7], [1, 7], [1, 0]] as [number, number][]) await tapAt(page, x, y);
    assert.equal(await num(page, 'cells'), 1);
    await page.click(t('help'));
    assert.equal(await num(page, 'cells'), 2, '집 모양만 있으면 도와줘가 방을 나눈다');
    const walled = await num(page, 'walls');
    await page.click(t('help'));
    assert.equal(await num(page, 'walls'), walled, '방이 있으면 그린 것을 덮어쓰지 않는다');
    // 터치로 벽을 더 그어 방을 늘린다
    for (const [x, y] of [[1, 3], [9, 3]] as [number, number][]) await tapAt(page, x, y);
    assert.equal(await num(page, 'cells'), 4, '방이 넷이 된다');
    await page.click(t('next'));

    // 빠진 것이 있으면 한 번만 묻고, 이대로 갈래도 된다
    await page.click(t('next'));
    await page.waitForSelector(t('ask'));
    await shot(page, '21-mid-ask');
    await page.click(t('ask-stay'));
    await page.click(t('help'));
    assert.equal(await num(page, 'tagged'), await num(page, 'cells'));
    await page.click(t('next'));
    await checkTargets(page, '세로 태블릿 문');

    await page.click(t('tool-window'));
    await tapAt(page, 1.5, 0);
    assert.equal(await num(page, 'windows'), 1, '겉벽 창문');
    await page.click(t('tool-door'));
    await page.click(t('help'));
    assert.ok((await num(page, 'doors')) >= 3);
    await page.click(t('next'));
    await page.click(t('help'));
    assert.equal(await attr(page, 'marks'), 'extinguisher gas me meet');
    await shot(page, '22-mid-marks');
    await page.click(t('next'));
    await page.click(t('help'));
    assert.ok((await attr(page, 'route'))!.endsWith('out'));
    await page.click(t('next'));
    await page.click(t('drill-start'));
    await page.waitForTimeout(300);
    await checkTargets(page, '세로 태블릿 연습');
    await playToEnd(page, (x, y) => tapAt(page, x, y));
    await shot(page, '23-mid-drill');
    await page.click(t('drill-call'));
    await page.waitForSelector(t('praises'));
    const praise = await page.locator(t('praises')).innerText();
    assert.ok(praise.includes('손등'), `3~4학년은 문을 만져 본다: ${praise}`);
    await shot(page, '24-mid-review');
    assert.deepEqual(errors, [], '콘솔 오류');
    await ctx.close();
  });

  await scenario('5~6학년: 빈 모눈에서 둘째 길을 찾고 문을 닫는다', async () => {
    const { ctx, page, errors } = await fresh(browser, { viewport: { width: 1024, height: 768 } });
    await startAs(page, 6);
    await checkTargets(page, '가로 태블릿 그리기');
    assert.equal(await num(page, 'walls'), 0, '5~6학년은 빈 모눈에서 시작한다');
    await page.click(t('help'));
    await shot(page, '30-high-draw');
    await page.click(t('next'));
    await page.click(t('help'));
    await shot(page, '31-high-sort');
    await page.click(t('next'));
    await page.click(t('help'));
    await page.click(t('next'));
    await page.click(t('help'));
    assert.equal(await attr(page, 'marks'), 'alarm extinguisher gas me meet');
    await page.click(t('next'));
    await page.click(t('help'));
    assert.ok((await attr(page, 'route'))!.endsWith('out'));
    await shot(page, '32-high-route');

    // 둘째 길 — 문을 하나 더 달고 찾는다
    await page.click(t('step-door'));
    const me = await page.locator('.stage [data-mark="me"]').getAttribute('transform');
    const m = /translate\(([\d.]+) ([\d.]+)\)/.exec(me!)!;
    const mx = Number(m[1]) / 100;
    const my = Number(m[2]) / 100;
    const myCell = await page.evaluate(([x, y]) => {
      const cells = [...document.querySelectorAll('.stage [data-cell]')];
      for (const c of cells) {
        const rects = [...c.querySelectorAll('rect')].map((r) => ({ x: Number(r.getAttribute('x')) + 0.5, y: Number(r.getAttribute('y')) + 0.5 }));
        if (rects.some((r) => r.x === Math.floor(x!) * 100 && r.y === Math.floor(y!) * 100)) return rects;
      }
      return [];
    }, [mx, my]);
    const topY = Math.min(...myCell.map((r) => r.y)) / 100;
    assert.equal(topY, 0, '내 방은 위쪽 겉벽에 닿는다');
    const onTop = myCell.find((r) => r.y === 0)!;
    await clickAt(page, onTop.x / 100 + 0.5, 0);
    await page.click(t('step-route'));
    await page.click(t('route-second'));
    assert.equal(await page.locator(t('route-second')).getAttribute('aria-pressed'), 'true');
    // 집 밖을 누르면 내 방에서 곧장 나간다
    await clickAt(page, 6, 8.9);
    assert.ok((await attr(page, 'route2'))!.endsWith('out'), '둘째 길이 밖까지 간다');
    await shot(page, '33-high-route2');
    await page.click(t('next'));

    await page.click(t('drill-start'));
    await page.waitForTimeout(300);
    await shot(page, '34-high-drill');
    // 첫 칸으로 간 뒤 문을 닫아 본다
    const route = (await attr(page, 'route'))!.split(' ');
    const [nx, ny] = route[1]!.split(',').map(Number);
    await clickAt(page, nx! + 0.5, ny! + 0.5);
    await page.waitForSelector(t('drill-touch'));
    await page.click(t('drill-touch'));
    // 걷는 동안에는 꺼져 있다. 느린 기계에서도 걸음이 끝날 때까지 기다린다
    await page.waitForSelector(`${t('drill-close')}:not([disabled])`, { timeout: 15000 });
    await page.click(t('drill-close'));
    assert.equal(await page.locator(t('bubble')).getAttribute('data-line'), 'drill-closed');
    await playToEnd(page, (x, y) => clickAt(page, x, y));
    await page.click(t('drill-call'));
    await page.waitForSelector(t('praises'));
    const praise = await page.locator(t('praises')).innerText();
    assert.ok(praise.includes('문을 닫아'), praise);
    await shot(page, '35-high-review');
    assert.deepEqual(errors, [], '콘솔 오류');
    await ctx.close();
  });

  await scenario('나가는 길: 설정의 닫기·Esc, 소리 끔, 저장 후 이어 하기', async () => {
    const { ctx, page } = await fresh(browser, { viewport: { width: 1280, height: 800 } });
    await startAs(page, 2);
    await page.click(t('help'));
    const walls = await num(page, 'walls');
    await page.click(t('menu'));
    await checkTargets(page, '설정');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator(t('menu-close')).count(), 0, 'Esc 로 닫힌다');
    await page.click(t('menu'));
    await page.click(t('sound-toggle'));
    assert.equal(await page.locator(t('sound-toggle')).getAttribute('aria-pressed'), 'false');
    await page.click(t('menu-close'));
    await page.reload();
    await page.click(t('start'));
    await page.waitForSelector('.studio');
    assert.equal(await num(page, 'walls'), walls, '새로고침해도 지도가 남는다');
    // 소리를 꺼 두면 다시 틀지 않는다
    await page.evaluate(() => delete document.documentElement.dataset.voiceLast);
    await page.click(t('repeat'));
    assert.equal(await page.evaluate(() => document.documentElement.dataset.voiceLast ?? null), null, '소리를 끄면 재생하지 않는다');
    await page.click(t('menu'));
    await page.click(t('reset'));
    await page.click(t('reset-no'));
    assert.equal(await num(page, 'walls'), walls, '그대로 두기는 지우지 않는다');
    await page.click(t('reset'));
    await page.click(t('reset-yes'));
    assert.equal(await num(page, 'walls'), 0, '새로 그리기');
    await ctx.close();
  });

  await scenario('막지 않기: 빈 지도로 연습 단계에 곧장 가도 안내가 있고, 채우면 시작한다', async () => {
    const { ctx, page, errors } = await fresh(browser, { viewport: { width: 1280, height: 800 } });
    await startAs(page, 1);
    await page.click(t('next'));
    assert.equal(await page.locator(t('bubble')).getAttribute('data-line'), 'draw-need-cell', '칸이 없으면 안내한다');
    await page.click(t('help'));
    await page.click(t('step-drill'));
    await page.click(t('drill-start'));
    await page.waitForSelector(t('player'));
    assert.ok((await attr(page, 'route'))!.endsWith('out'), '빠진 것을 채워 시작한다');
    assert.deepEqual(errors, [], '콘솔 오류');
    await ctx.close();
  });

  await scenario('음성: 실제 MP3 가 재생되고 파일이 없어도 조용히 넘어간다', async () => {
    const { ctx, page } = await fresh(browser, { viewport: { width: 1280, height: 800 } });
    await startAs(page, 1);
    await page.waitForFunction(() => {
      const s = document.documentElement.dataset.voiceState;
      return s === 'playing' || s === 'ended' || s === 'failed';
    }, undefined, { timeout: 8000 });
    const state = await page.evaluate(() => document.documentElement.dataset.voiceState);
    assert.ok(state === 'playing' || state === 'ended', `MP3 재생 상태: ${state}`);

    // 모든 MP3 를 실제로 해독하고, 말 길이가 대사 길이에 맞는지 본다 — 다른 대사가 저장되면 여기서 걸린다
    const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/voice/manifest.json'), 'utf8')) as { items: { filename: string; text: string }[] };
    const decoded = await page.evaluate(async (items) => {
      const ctx = new OfflineAudioContext(1, 44100, 44100);
      const out: { filename: string; chars: number; seconds: number }[] = [];
      for (const item of items) {
        const res = await window.fetch(`./voice/${item.filename}`);
        const audio = await ctx.decodeAudioData(await res.arrayBuffer());
        out.push({ filename: item.filename, chars: item.text.replace(/\s/g, '').length, seconds: audio.duration });
      }
      return out;
    }, manifest.items);
    assert.equal(decoded.length, manifest.items.length);
    for (const d of decoded) {
      const perChar = d.seconds / d.chars;
      assert.ok(perChar > 0.08 && perChar < 0.45, `${d.filename}: ${d.chars}자에 ${d.seconds.toFixed(1)}초`);
    }
    // 파일 실패 때도 글은 남는다
    await page.route('**/voice/*.mp3', (r) => r.abort());
    await page.click(t('repeat'));
    await page.waitForFunction(() => document.documentElement.dataset.voiceState === 'failed', undefined, { timeout: 5000 });
    assert.ok((await page.locator(t('bubble')).innerText()).length > 5, '글은 남는다');
    await ctx.close();
  });

  await scenario('사용법: 단계마다 처음 한 번 뜨고 다시 볼 수 있으며, 화살표로 길과 연습을 끝낸다', async () => {
    const { ctx, page, errors } = await fresh(browser, { viewport: { width: 1366, height: 768 } }, false);
    await startAs(page, 1);
    await page.waitForSelector('[data-howto="draw"]');
    assert.equal(await page.locator(t('bubble')).getAttribute('data-line'), 'howto-draw');
    await page.waitForTimeout(1800);
    await shot(page, '40-howto-draw');
    await checkTargets(page, '사용법 카드');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator(t('howto')).count(), 0, 'Esc 로 닫힌다');
    assert.equal(await page.locator(t('bubble')).getAttribute('data-line'), 'draw-low');
    // 다시 보기
    await page.click(t('how'));
    await page.waitForSelector('[data-howto="draw"]');
    await page.click(t('howto-ok'));
    await page.click(t('help'));
    await page.click(t('next'));
    await page.waitForSelector('[data-howto="sort"]');
    await shot(page, '41-howto-sort');
    await page.click(t('howto-close'));
    await page.click(t('help'));
    await page.click(t('next'));
    await page.waitForSelector('[data-howto="door"]');
    await page.click(t('howto-ok'));
    await page.click(t('help'));
    await page.click(t('next'));
    await page.waitForSelector('[data-howto="mark"]');
    await page.click(t('howto-ok'));
    await page.click(t('help'));
    await page.click(t('next'));
    await page.waitForSelector('[data-howto="route"]');
    await page.waitForTimeout(2200);
    await shot(page, '42-howto-route');
    const howText = await page.locator(t('howto')).innerText();
    assert.ok(howText.includes('눌러') && howText.includes('화살표'), howText);
    // 카드가 떠 있을 때는 화살표가 길을 고르지 않는다
    await page.keyboard.press('ArrowDown');
    assert.equal(await attr(page, 'route'), '');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator(t('howto')).count(), 0, 'Enter 로 닫힌다');
    // 눌러야 할 곳이 지도에 보인다
    assert.ok((await page.locator('.stage .tap-hint').count()) >= 1, '여기를 눌러 표시');
    await shot(page, '43-route-hint');
    // 네모 집: 내 방은 왼쪽 위, 문은 아래 — 위는 없고 아래는 있다
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.locator(t('bubble')).getAttribute('data-line'), 'route-no-way');
    await page.keyboard.press('ArrowDown');
    assert.ok((await attr(page, 'route'))!.split(' ').length >= 2, '화살표로 다음 칸');
    for (const key of ['ArrowDown', 'ArrowRight', 'ArrowLeft'] as const) {
      if ((await attr(page, 'route'))!.endsWith('out')) break;
      await page.keyboard.press(key);
    }
    assert.ok((await attr(page, 'route'))!.endsWith('out'), `화살표로 밖까지: ${await attr(page, 'route')}`);
    await page.click(t('next'));

    // 대피 연습
    await page.waitForSelector('[data-howto="drill"]');
    await shot(page, '44-howto-drill');
    await page.click(t('howto-ok'));
    await page.click(t('drill-start'));
    await page.waitForSelector(t('player'));
    assert.equal(await page.locator(t('bubble')).getAttribute('data-line'), 'drill-start');
    await page.waitForFunction(() => document.querySelector('[data-testid="bubble"]')?.getAttribute('data-line') === 'drill-how', undefined, { timeout: 15000 });
    assert.ok((await page.locator('.stage .tap-hint').count()) >= 1, '연습에도 표시');
    await shot(page, '45-drill-hint');
    const route = (await attr(page, 'route'))!.split(' ');
    for (let i = 0; i < route.length + 4; i++) {
      if ((await page.locator(t('player')).getAttribute('data-phase')) === 'outside') break;
      for (const key of ['ArrowDown', 'ArrowRight', 'ArrowLeft', 'ArrowUp'] as const) {
        const before = await page.locator(t('player')).getAttribute('data-at');
        await page.keyboard.press(key);
        await page.waitForTimeout(150);
        if ((await page.locator(t('player')).getAttribute('data-at')) !== before) break;
      }
      await page.waitForTimeout(1700);
    }
    assert.equal(await page.locator(t('player')).getAttribute('data-phase'), 'outside', '화살표로 밖까지 나간다');
    await page.keyboard.press('ArrowDown');
    await page.waitForSelector(t('drill-call'), { timeout: 8000 });
    await page.keyboard.press('Enter');
    await page.waitForSelector(t('praises'), { timeout: 8000 });

    // 두 번째부터는 뜨지 않는다
    await page.click(t('step-route'));
    assert.equal(await page.locator(t('howto')).count(), 0, '본 사용법은 다시 뜨지 않는다');
    assert.deepEqual(errors, [], '콘솔 오류');
    await ctx.close();
  });

  await scenario('처음 화면으로 돌아가도 지도가 남고, 이어서 그릴 수 있다', async () => {
    const { ctx, page, errors } = await fresh(browser, { viewport: { width: 1024, height: 768 } });
    await startAs(page, 2);
    await page.click(t('help'));
    const walls = await num(page, 'walls');
    assert.ok(walls > 0);
    await page.click(t('home'));
    await page.waitForSelector(t('start'));
    assert.equal((await page.locator(t('start')).innerText()).includes('이어서'), true);
    await page.click(t('start'));
    await page.waitForSelector('.studio');
    assert.equal(await num(page, 'walls'), walls, '지도가 그대로 있다');
    await page.click(t('menu'));
    await page.click(t('menu-home'));
    await page.waitForSelector(t('start'));
    assert.equal(await page.locator('.overlay').count(), 0, '설정이 닫혀 있다');
    assert.deepEqual(errors, [], '콘솔 오류');
    await ctx.close();
  });

  await scenario('대각선: 끌면 비스듬한 벽이 되고, 모서리를 돌던 손은 꺾이며, 문·연습·인쇄·3D 까지 간다', async () => {
    const { ctx, page, errors } = await fresh(browser, { viewport: { width: 1366, height: 768 } });
    await startAs(page, 6);
    assert.equal(await num(page, 'diagonals'), 0);

    // 세모 집 — 마지막 줄이 대각선이다
    await dragThrough(page, [[2, 1], [6, 1], [6, 5], [2, 1]]);
    assert.equal(await num(page, 'cells'), 1, '대각선으로 닫으면 칸이 생긴다');
    assert.equal(await num(page, 'diagonals'), 4, '대각선 네 조각');
    await shot(page, '50-diag-triangle');
    const walls = await num(page, 'walls');

    // 모서리를 둥글게 돌며 점을 건너뛴 손 — 깎지 않고 ㄱ자로 꺾는다
    const start = await toScreen(page, 8, 2);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (const [x, y] of [[8.3, 2.05], [8.6, 2.2], [8.8, 2.4], [8.95, 2.7], [9, 3]] as [number, number][]) {
      const p = await toScreen(page, x, y);
      await page.mouse.move(p.x, p.y);
    }
    await page.mouse.up();
    assert.equal(await num(page, 'diagonals'), 4, '모서리를 돌던 손은 대각선이 아니다');
    assert.equal(await num(page, 'walls'), walls + 2, '모서리를 돌면 두 조각');

    // 점을 차례로 눌러도 대각선이 된다
    await clickAt(page, 10, 4);
    await clickAt(page, 11, 5);
    assert.equal(await num(page, 'diagonals'), 5, '비스듬한 옆 점을 누르면 대각선');
    // 지우개
    await page.click(t('tool-eraser'));
    await clickAt(page, 10.5, 4.5);
    assert.equal(await num(page, 'diagonals'), 4, '지우개로 대각선을 지운다');
    await page.click(t('tool-pencil'));

    // 비스듬한 집 본으로 끝까지 — 본을 골라도 그려 둔 선은 남으므로 먼저 종이를 비운다
    await page.click(t('menu'));
    await page.click(t('reset'));
    await page.click(t('reset-yes'));
    if (await page.locator(t('menu-close')).count()) await page.click(t('menu-close'));
    await page.click(t('layer-home'));
    await page.click(t('tpl-high-cut'));
    await page.click(t('help'));
    assert.equal(await num(page, 'diagonals'), 4, '본의 대각선을 채운다');
    await shot(page, '51-diag-draw');
    await page.click(t('next'));
    await page.click(t('help'));
    assert.equal(await num(page, 'tagged'), await num(page, 'cells'));
    await shot(page, '52-diag-sort');
    await page.click(t('next'));
    // 대각선 벽에 창문과 문을 단다
    await page.click(t('tool-window'));
    await clickAt(page, 9.5, 0.5);
    assert.equal(await num(page, 'windows'), 1, '대각선 벽에 창문');
    await page.click(t('tool-door'));
    await clickAt(page, 10.5, 1.5);
    assert.equal(await num(page, 'doors'), 1, '대각선 벽에 문');
    assert.equal(await page.locator('.stage [data-door^="d:"]').getAttribute('data-exit'), '1', '밖으로 나가는 문');
    await page.click(t('help'));
    await shot(page, '53-diag-door');
    await page.click(t('next'));
    await page.click(t('help'));
    await shot(page, '54-diag-marks');
    await page.click(t('next'));
    await page.click(t('help'));
    assert.ok((await attr(page, 'route'))!.endsWith('out'));
    await shot(page, '55-diag-route');
    await page.click(t('next'));
    await page.click(t('drill-start'));
    await page.waitForSelector(t('player'));
    await playToEnd(page, (x, y) => clickAt(page, x, y));
    await shot(page, '56-diag-drill');
    await page.click(t('drill-call'));
    await page.waitForSelector(t('praises'));
    await page.emulateMedia({ media: 'print' });
    assert.ok(await page.locator('.print-sheet').isVisible(), '인쇄에도 나온다');
    await page.emulateMedia({ media: 'screen' });
    await page.click(t('open-replay'));
    await page.waitForSelector(t('replay-canvas'), { timeout: 20000 });
    await page.waitForTimeout(1500);
    await shot(page, '57-diag-replay');
    await page.keyboard.press('Escape');
    // 다시 열어도 대각선이 남는다
    await page.reload();
    await page.click(t('start'));
    await page.waitForSelector('.studio');
    assert.equal(await num(page, 'diagonals'), 4, '저장이 남는다');
    assert.deepEqual(errors, [], '콘솔 오류');
    await ctx.close();
  });

  await scenario('각도: 먼 점까지 곧게 끌면 한 줄이고, 뾰족한 집이 연습과 3D 가구까지 간다', async () => {
    const { ctx, page, errors } = await fresh(browser, { viewport: { width: 1366, height: 768 } });
    await startAs(page, 6);
    // 얕은 각도로 끈다 — 지나는 점에 끌리지 않는다
    await dragThrough(page, [[2, 1], [7, 3]]);
    assert.equal(await num(page, 'walls'), 1, '한 줄');
    assert.equal(await num(page, 'diagonals'), 1);
    await dragThrough(page, [[7, 3], [2, 5], [2, 1]]);
    assert.equal(await num(page, 'cells'), 1, '비스듬한 벽으로 칸이 닫힌다');
    await shot(page, '60-angle-draw');
    // 점을 차례로 눌러도 곧게 잇는다
    await clickAt(page, 9, 1);
    await clickAt(page, 11, 4);
    assert.equal(await num(page, 'diagonals'), 3);
    // 지우개
    await page.click(t('tool-eraser'));
    await clickAt(page, 10, 2.5);
    assert.equal(await num(page, 'diagonals'), 2, '지우개로 지운다');
    await page.click(t('tool-pencil'));

    await page.click(t('menu'));
    await page.click(t('reset'));
    await page.click(t('reset-yes'));
    if (await page.locator(t('menu-close')).count()) await page.click(t('menu-close'));
    await page.click(t('layer-home'));
    await page.click(t('tpl-high-roof'));
    await page.click(t('help'));
    assert.ok((await num(page, 'diagonals')) >= 2, '본의 비스듬한 벽을 채운다');
    await shot(page, '61-roof-draw');
    for (const name of ['sort', 'door', 'mark']) {
      await page.click(t('next'));
      await page.click(t('help'));
      await shot(page, `62-roof-${name}`);
    }
    await page.click(t('next'));
    await page.click(t('help'));
    assert.ok((await attr(page, 'route'))!.endsWith('out'));
    await shot(page, '63-roof-route');
    await page.click(t('next'));
    await page.click(t('drill-start'));
    await page.waitForSelector(t('player'));
    await playToEnd(page, (x, y) => clickAt(page, x, y));
    await page.click(t('drill-call'));
    await page.waitForSelector(t('praises'));
    await page.click(t('open-replay'));
    await page.waitForSelector(t('replay-canvas'), { timeout: 20000 });
    await page.waitForTimeout(1500);
    await shot(page, '64-roof-replay');
    const furnished = await page.locator(`${t('replay')} > div`).first().getAttribute('data-furnished');
    assert.ok(Number(furnished) >= 4, `가구가 놓인다: ${furnished}`);
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, [], '콘솔 오류');
    await ctx.close();
  });

  await scenario('세모 칸 3D: 세모뿐인 방에도 가구가 놓인다', async () => {
    const { ctx, page, errors } = await fresh(browser, { viewport: { width: 1366, height: 768 } });
    await startAs(page, 6);
    await dragThrough(page, [[2, 1], [7, 1], [7, 6], [2, 1]]);
    assert.equal(await num(page, 'cells'), 1);
    await page.click(t('next'));
    await page.click(t('help'));
    await page.click(t('next'));
    await page.click(t('help'));
    await page.click(t('next'));
    await page.click(t('help'));
    await page.click(t('next'));
    await page.click(t('help'));
    await page.click(t('next'));
    await page.click(t('drill-start'));
    await page.waitForSelector(t('player'));
    await playToEnd(page, (x, y) => clickAt(page, x, y));
    await page.click(t('drill-call'));
    await page.waitForSelector(t('praises'));
    await page.click(t('open-replay'));
    await page.waitForSelector(t('replay-canvas'), { timeout: 20000 });
    await page.waitForTimeout(1500);
    await shot(page, '65-triangle-replay');
    assert.equal(await page.locator(`${t('replay')} > div`).first().getAttribute('data-furnished'), '1', '세모 방에 가구');
    await page.click(t('replay-view'));
    await page.waitForTimeout(600);
    await shot(page, '65b-triangle-above');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, [], '콘솔 오류');
    await ctx.close();
  });

  await scenario('확대: 크게 보고 그려도 점에 맞고, 옮기기와 가장자리 따라가기·손가락 둘·전체 보기가 된다', async () => {
    const { ctx, page, errors } = await fresh(browser, { viewport: { width: 1366, height: 768 } });
    await startAs(page, 1);
    const scale = async () => Number(await attr(page, 'scale'));
    const gap = async () => (await toScreen(page, 1, 0)).x - (await toScreen(page, 0, 0)).x;
    assert.equal(await scale(), 1);
    assert.equal(await page.locator(t('zoom-out')).isDisabled(), true, '전체 보기보다 작아지지 않는다');
    assert.equal(await page.locator(t('zoom-fit')).count(), 0);
    const before = await gap();

    // 잡아 둔 점을 기준으로 커진다
    await clickAt(page, 3, 2);
    const held = await toScreen(page, 3, 2);
    await page.click(t('zoom-in'));
    await page.click(t('zoom-in'));
    assert.ok((await scale()) > 1.9, '크게 보인다');
    assert.ok((await gap()) > before * 1.9, '점 사이가 넓어진다');
    const after = await toScreen(page, 3, 2);
    assert.ok(Math.hypot(after.x - held.x, after.y - held.y) < 2, '잡아 둔 점이 제자리에 있다');
    await shot(page, '70-zoom-big');
    await checkTargets(page, '확대');

    // 크게 본 채로 끌어 그려도 같은 점에 맞는다
    await clickAt(page, 3, 2);
    await dragThrough(page, [[2, 1], [4, 1], [4, 3], [2, 3], [2, 1]]);
    assert.equal(await num(page, 'cells'), 1, '확대해 그려도 칸이 닫힌다');
    const walls = await num(page, 'walls');

    // 옮기기 — 끌어도 그려지지 않는다
    await page.click(t('zoom-pan'));
    const p0 = await toScreen(page, 2, 1);
    await page.mouse.move(p0.x, p0.y);
    await page.mouse.down();
    await page.mouse.move(p0.x + 120, p0.y + 40, { steps: 6 });
    await page.mouse.up();
    const p1 = await toScreen(page, 2, 1);
    assert.ok(Math.abs(p1.x - p0.x - 120) < 3 && Math.abs(p1.y - p0.y - 40) < 3, '종이가 손을 따라온다');
    assert.equal(await num(page, 'walls'), walls, '옮기는 동안 그려지지 않는다');
    await page.click(t('zoom-pan'));

    // 휠 — 손 아래 점이 제자리에 있다
    const w0 = await toScreen(page, 3, 2);
    await page.mouse.move(w0.x, w0.y);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(100);
    const w1 = await toScreen(page, 3, 2);
    assert.ok(Math.hypot(w1.x - w0.x, w1.y - w0.y) < 3, '휠은 손 아래 점을 기준으로 커진다');

    // 다음 단계에서도 크기가 유지되고 칸을 누를 수 있다
    await page.click(t('next'));
    await page.click(t('crayon-room')).catch(() => undefined);
    assert.ok((await scale()) > 1.9, '단계를 넘어도 크기가 그대로다');
    await clickAt(page, 3, 2);
    assert.equal(await num(page, 'tagged'), 1, '크게 본 채 칸을 칠한다');

    // 전체 보기
    await page.click(t('zoom-fit'));
    assert.equal(await scale(), 1);
    assert.equal(await page.locator(t('zoom-fit')).count(), 0);
    assert.deepEqual(errors, [], '콘솔 오류');
    await ctx.close();

    // 가장자리 — 끄는 손을 끝에 두면 종이가 따라온다
    const edge = await fresh(browser, { viewport: { width: 1366, height: 768 } });
    await startAs(edge.page, 1);
    await edge.page.click(t('zoom-in'));
    await edge.page.click(t('zoom-in'));
    const box = (await edge.page.locator('.stage svg.plan').boundingBox())!;
    const from = await toScreen(edge.page, 4, 3);
    await edge.page.mouse.move(from.x, from.y);
    await edge.page.mouse.down();
    await edge.page.mouse.move(box.x + box.width - 6, from.y, { steps: 8 });
    await edge.page.waitForTimeout(600);
    const moved = await toScreen(edge.page, 4, 3);
    assert.ok(moved.x < from.x - 20, `가장자리에서 종이가 따라온다: ${from.x} → ${moved.x}`);
    await edge.page.mouse.up();
    assert.ok((await num(edge.page, 'walls')) >= 1, '끌던 획이 남는다');
    await edge.ctx.close();

    // 손가락 둘 — 그리지 않고 키운다. 앱에 터치 두 개를 직접 넣는다
    const touch = await fresh(browser, { viewport: { width: 1180, height: 820 }, hasTouch: true });
    await startAs(touch.page, 1);
    const c = await toScreen(touch.page, 4, 3);
    const cdp = await touch.ctx.newCDPSession(touch.page);
    const send = (type: string, points: { x: number; y: number; id: number }[]) => cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: points });
    await send('touchStart', [{ x: c.x - 40, y: c.y, id: 1 }]);
    await send('touchStart', [{ x: c.x - 40, y: c.y, id: 1 }, { x: c.x + 40, y: c.y, id: 2 }]);
    for (let i = 1; i <= 6; i++) await send('touchMove', [{ x: c.x - 40 - i * 15, y: c.y, id: 1 }, { x: c.x + 40 + i * 15, y: c.y, id: 2 }]);
    await send('touchEnd', []);
    await touch.page.waitForTimeout(100);
    assert.ok(Number(await attr(touch.page, 'scale')) > 1.5, `손가락을 벌리면 커진다: ${await attr(touch.page, 'scale')}`);
    assert.equal(await num(touch.page, 'walls'), 0, '손가락 둘은 그리지 않는다');
    assert.deepEqual(touch.errors, [], '터치 콘솔 오류');
    await touch.ctx.close();
  });

  await scenario('첫 화면: 배경과 캐릭터가 움직이고, 시작 단추는 제자리이며, 움직임 줄이기에서는 멈춘다', async () => {
    const { ctx, page, errors } = await fresh(browser, { viewport: { width: 1366, height: 768 } });
    await page.waitForSelector(t('start'));
    await page.waitForTimeout(1200);
    const running = () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    assert.ok((await running()) > 20, `움직임이 돈다: ${await running()}개`);
    const where = (selector: string) => page.locator(selector).first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y };
    });
    const truck = await where('.sc-truck');
    const cloud = await where('.sc-cloud.c1');
    const button = await where(t('start'));
    await page.waitForTimeout(1500);
    assert.ok((await where('.sc-truck')).x > truck.x + 20, '소방차가 지나간다');
    assert.ok((await where('.sc-cloud.c1')).x > cloud.x + 5, '구름이 흐른다');
    assert.deepEqual(await where(t('start')), button, '시작 단추는 제자리다');
    const far = await page.locator('.sc-near').evaluate((el) => getComputedStyle(el).transform);
    await page.mouse.move(40, 40);
    await page.mouse.move(1300, 600, { steps: 3 });
    await page.waitForTimeout(700);
    assert.notEqual(await page.locator('.sc-near').evaluate((el) => getComputedStyle(el).transform), far, '손을 따라 배경이 움직인다');
    await page.waitForTimeout(6000);
    await shot(page, '02b-welcome-motion');
    const blocked = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.welcome button, .welcome a')].filter((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return r.height < 48 || !hit || !(el === hit || el.contains(hit));
      }).map((el) => el.textContent),
    );
    assert.deepEqual(blocked, [], '배경이 단추를 가리지 않고 크기가 충분하다');
    const covered = await page.evaluate(() => {
      const foot = document.querySelector('.welcome-foot')!.getBoundingClientRect();
      const road = document.querySelector('.sc-lane')!.getBoundingClientRect();
      return road.bottom > foot.top;
    });
    assert.equal(covered, false, '아래 문구가 길을 가리지 않는다');
    await page.click(t('start'));
    assert.deepEqual(errors, [], '콘솔 오류');
    await ctx.close();

    const still = await fresh(browser, { viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
    await still.page.waitForSelector(t('start'));
    await still.page.waitForTimeout(300);
    const state = await still.page.evaluate(() => ({
      loops: document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity).length,
      route: getComputedStyle(document.querySelector('.cv-route')!).strokeDashoffset,
      word: getComputedStyle(document.querySelector('.cv-word text')!).opacity,
      whole: getComputedStyle(document.querySelector('.cv-all')!).opacity,
    }));
    assert.equal(state.loops, 0, '움직임 줄이기에서는 되풀이하지 않는다');
    assert.equal(state.whole, '1', '그림이 보인다');
    assert.equal(state.word, '1', '글자가 보인다');
    assert.equal(parseFloat(state.route), 152, '길이 끝까지 그려져 있다');
    await shot(still.page, '02c-welcome-still');
    await still.ctx.close();
  });

  await scenario('이어 가기: 집을 닫으면 방을 만들자고 하고, 단계를 끝내면 다음을 알려 주며, 처음부터 다시 할 수 있다', async () => {
    const { ctx, page, errors } = await fresh(browser, { viewport: { width: 1366, height: 768 } });
    await startAs(page, 1);
    const lineIs = async (id: string) => {
      await page.waitForFunction((want) => document.querySelector('[data-testid="bubble"]')?.getAttribute('data-line') === want, id, { timeout: 15000 });
    };
    const ready = () => page.locator(t('next')).getAttribute('data-ready');
    assert.equal(await ready(), '0');
    await dragThrough(page, [[1, 0], [7, 0], [7, 6], [1, 6], [1, 0]]);
    await lineIs('draw-make-rooms');
    assert.equal(await ready(), '0', '방을 만들기 전에는 재촉하지 않는다');
    await dragThrough(page, [[4, 0], [4, 6]]);
    await lineIs('draw-rooms-done');
    assert.equal(await ready(), '1', '방이 생기면 다음이 눈에 띈다');
    await shot(page, '03-next-ready');
    await page.click(t('next'));
    await page.click(t('help'));
    await lineIs('sort-done');
    await page.click(t('next'));
    await page.click(t('help'));
    await lineIs('door-done');
    await page.click(t('next'));
    await page.click(t('help'));
    await lineIs('mark-done');
    await page.click(t('next'));
    await page.click(t('help'));
    await lineIs('route-next');
    // 끝난 단계에 돌아가도 다시 재촉하지 않는다
    await page.click(t('step-door'));
    await page.waitForTimeout(200);
    assert.equal(await page.locator(t('bubble')).getAttribute('data-line'), 'door-low');

    // 처음 화면에서 처음부터 다시 하기
    await page.click(t('home'));
    await page.waitForSelector(t('start'));
    assert.match(await page.locator(t('start')).innerText(), /이어서 그리기/);
    await page.click(t('start-over'));
    await shot(page, '04-start-over');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator(t('start')).count(), 1, 'Esc 는 지우지 않는다');
    await page.click(t('start-over'));
    await page.click(t('start-over-no'));
    await page.click(t('start'));
    await page.waitForSelector('.studio');
    assert.ok((await num(page, 'walls')) > 0, '그대로 두면 지도가 남는다');
    await page.click(t('home'));
    await page.click(t('start-over'));
    await page.click(t('start-over-yes'));
    await page.waitForSelector('.studio');
    assert.equal(await num(page, 'walls'), 0, '종이가 새것이다');
    assert.equal(await page.locator('.studio').getAttribute('data-step'), 'draw');
    assert.deepEqual(errors, [], '콘솔 오류');
    await ctx.close();

    // 처음 온 아이에게는 다시 하기가 없다
    const first = await fresh(browser, { viewport: { width: 1366, height: 768 } });
    await first.page.waitForSelector(t('start'));
    assert.equal(await first.page.locator(t('start-over')).count(), 0);
    await first.ctx.close();
  });

  await scenario('점 개수: 학년마다 늘리고 줄이며, 그린 집이 남고, 작은 점에 그려 연습·3D·인쇄까지 가며, 저장된다', async () => {
    const { ctx, page, errors } = await fresh(browser, { viewport: { width: 1366, height: 768 } });
    await startAs(page, 6);
    const count = () => page.locator(t('dots-count')).innerText();
    assert.equal(await count(), '117개', '5~6학년 기본');
    await checkTargets(page, '점 개수');
    const panel = await page.locator('.tools').first().boundingBox();
    assert.ok(panel!.width <= 112, `왼쪽 패널이 좁다: ${panel!.width}`);
    assert.equal(await page.locator('.guide-line').count(), 0, '연한 점선이 없다');

    // 줄이면 점이 적어지고, 늘리면 많아진다
    await page.click(t('dots-less'));
    await page.click(t('dots-less'));
    assert.equal(await count(), '63개', '50% 안팎으로 준다');
    assert.equal(await page.locator(t('dots-less')).isDisabled(), true, '더 줄지 않는다');
    await shot(page, '80-dots-few');
    await dragThrough(page, [[1, 1], [5, 1], [5, 4], [1, 4], [1, 1]]);
    assert.equal(await num(page, 'cells'), 1);
    const size = await page.locator('.stage svg.plan').first().evaluate((el) => (el as SVGSVGElement).viewBox.baseVal.width);
    await page.click(t('dots-more'));
    await page.click(t('dots-more'));
    await page.click(t('dots-more'));
    await page.click(t('dots-more'));
    assert.equal(await count(), '176개', '50% 안팎으로 는다');
    assert.equal(await num(page, 'cells'), 1, '칸이 남는다');
    assert.equal(await page.locator('.stage svg.plan').first().evaluate((el) => (el as SVGSVGElement).viewBox.baseVal.width), size, '그림 너비는 그대로다');
    await shot(page, '81-dots-many');
    await page.click(t('undo'));
    assert.equal(await count(), '140개', '되돌리기로 돌아간다');
    await page.click(t('dots-more'));

    // 더 촘촘하게
    await page.click(t('dots-more'));
    assert.equal(await num(page, 'cols'), 24);
    const before = await num(page, 'cells');
    await dragThrough(page, [[11, 4], [11, 12]]);
    assert.ok((await num(page, 'cells')) >= before, '작은 점으로 벽을 긋는다');
    await page.click(t('zoom-in'));
    await page.click(t('zoom-in'));
    await shot(page, '82-dots-zoom');
    await page.click(t('zoom-fit'));

    await page.click(t('next'));
    await page.click(t('help'));
    await page.click(t('next'));
    await page.click(t('help'));
    assert.ok((await num(page, 'doors')) >= 1);
    await page.click(t('next'));
    await page.click(t('help'));
    await page.click(t('next'));
    await page.click(t('help'));
    assert.ok((await attr(page, 'route'))!.endsWith('out'));
    await shot(page, '86-dots-route');
    await page.click(t('next'));
    await page.click(t('drill-start'));
    await page.waitForSelector(t('player'));
    await playToEnd(page, (x, y) => clickAt(page, x, y));
    await page.click(t('drill-call'));
    await page.waitForSelector(t('praises'));
    await page.emulateMedia({ media: 'print' });
    assert.ok(await page.locator('.print-sheet').isVisible());
    await page.emulateMedia({ media: 'screen' });
    await page.click(t('open-replay'));
    await page.waitForSelector(t('replay-canvas'), { timeout: 20000 });
    await page.waitForTimeout(2000);
    await shot(page, '88-dots-replay');
    assert.ok(Number(await page.locator(`${t('replay')} > div`).first().getAttribute('data-furnished')) >= 1, '가구가 놓인다');
    await page.keyboard.press('Escape');

    // 다시 열어도 남고, 새 종이도 같은 개수다
    await page.reload();
    await page.click(t('start'));
    await page.waitForSelector('.studio');
    assert.equal(await num(page, 'cols'), 24, '저장이 남는다');
    await page.click(t('step-draw'));
    await page.click(t('menu'));
    await page.click(t('reset'));
    await page.click(t('reset-yes'));
    if (await page.locator(t('menu-close')).count()) await page.click(t('menu-close'));
    assert.equal(await num(page, 'cols'), 24, '새 종이도 고른 개수다');
    assert.equal(await num(page, 'walls'), 0);
    await page.click(t('layer-home'));
    await page.click(t('tpl-high-roof'));
    assert.equal(await num(page, 'cells'), 6, '다른 모양도 개수에 맞는다');
    assert.deepEqual(errors, [], '콘솔 오류');
    await ctx.close();
  });

  await scenario('아파트: 모양과 베란다를 고르고, 가구를 놓고 치우며, 현관과 중문으로 나가 3D 내 시점까지 간다', async () => {
    const { ctx, page, errors } = await fresh(browser, { viewport: { width: 1366, height: 768 } });
    await startAs(page, 1);
    assert.equal(await page.locator('.layer').count(), 0, '레이어는 필요할 때만 열린다');
    assert.equal(await page.locator('[data-testid^="tpl-"]').count(), 0, '패널에 본이 없다');

    // 고르지 않아도 끝까지 간다 — 다른 시나리오가 본다. 여기서는 고른다
    await page.click(t('layer-home'));
    await shot(page, '90-layer-home');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.layer').count(), 0, 'Esc 로 닫힌다');
    await page.click(t('layer-home'));
    await page.click(t('home-home-3'));
    assert.ok((await num(page, 'cells')) >= 8, '방·거실·주방·화장실·현관·베란다');
    assert.equal(await num(page, 'tagged'), await num(page, 'cells'), '칸 이름이 함께 깔린다');
    await shot(page, '91-home-draw');

    // 가구
    await page.click(t('layer-items'));
    await shot(page, '92-layer-items');
    await page.click(t('item-bed'));
    const walls = await num(page, 'walls');
    const placed = () => page.locator('.stage [data-item]').count();
    await clickAt(page, 1, 5.5);
    assert.equal(await placed(), 1, '가구를 놓는다');
    assert.equal(await num(page, 'walls'), walls, '놓는 동안 그려지지 않는다');
    await clickAt(page, -0.5, 7);
    assert.equal(await placed(), 1, '집 밖에는 놓지 않는다');
    await page.click(t('placing-stop'));
    await page.click(t('layer-items'));
    await page.click(t('item-sofa'));
    await clickAt(page, 4, 3.6);
    await page.click(t('placing-stop'));
    assert.equal(await placed(), 2);
    await page.click(t('layer-items'));
    await page.click(t('item-remove'));
    await clickAt(page, 4, 3.6);
    assert.equal(await placed(), 1, '놓은 것을 치운다');
    await page.click(t('placing-stop'));
    await shot(page, '93-items-placed');
    await checkTargets(page, '아파트 그리기');

    // 베란다 크레용 · 다음 단계들
    await page.click(t('next'));
    await page.waitForSelector(t('crayon-veranda'));
    await shot(page, '94-home-sort');
    await page.click(t('next'));
    await page.click(t('help'));
    assert.equal(await page.locator('.stage [data-door][data-exit="1"]').count(), 1, '밖으로 나가는 문은 하나');
    assert.ok((await page.locator('.stage [data-door][data-inner="1"]').count()) >= 1, '중문이 있다');
    await shot(page, '95-home-door');
    await page.click(t('next'));
    await page.click(t('help'));
    await page.click(t('next'));
    await page.click(t('help'));
    assert.ok((await attr(page, 'route'))!.endsWith('out'));
    await shot(page, '96-home-route');

    // 연습 전 돌아보기 — 가운데에 모인다
    await page.click(t('step-review'));
    await page.waitForSelector(t('go-drill'));
    const notes = (await page.locator('.review-notes').boundingBox())!;
    const go = (await page.locator(t('go-drill')).boundingBox())!;
    assert.ok(Math.abs(go.x + go.width / 2 - (notes.x + notes.width / 2)) < 3, '단추가 가운데에 있다');
    assert.ok(Math.abs(go.y + go.height / 2 - (notes.y + notes.height / 2)) < notes.height * 0.3, '위아래로도 치우치지 않는다');
    await shot(page, '97-review-done');
    await page.click(t('go-drill'));
    await page.click(t('drill-start'));
    await page.waitForSelector(t('player'));
    await playToEnd(page, (x, y) => clickAt(page, x, y));
    await page.click(t('drill-call'));
    await page.waitForSelector(t('praises'));
    await shot(page, '98-review-praises');
    await page.click(t('open-replay'));
    await page.waitForSelector(t('replay-canvas'), { timeout: 20000 });
    await page.waitForTimeout(1800);
    await shot(page, '99-home-eye');
    const stage3d = page.locator(`${t('replay')} > div`).first();
    assert.equal(await stage3d.getAttribute('data-view'), 'eye');
    assert.equal(await stage3d.getAttribute('data-placed'), '1', '놓은 가구가 3D 에 나온다');
    await page.click(t('replay-view'));
    await page.waitForTimeout(700);
    await shot(page, '99b-home-above');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, [], '콘솔 오류');
    await ctx.close();
  });

  await scenario('집 밖: 위·아래·왼쪽·오른쪽을 고르면 띠와 만나는 곳이 옮겨 가고 나가는 길이 이어진다', async () => {
    const { ctx, page, errors } = await fresh(browser, { viewport: { width: 1366, height: 768 } });
    await startAs(page, 3);
    await page.click(t('help'));
    for (const name of ['sort', 'door', 'mark']) {
      await page.click(t('next'));
      await page.click(t('help'));
      assert.ok(name);
    }
    await page.click(t('step-draw'));
    const stripSide = () => page.locator('.stage .strip').getAttribute('data-side');
    for (const side of ['top', 'left', 'right', 'bottom']) {
      await page.click(t(`outside-${side}`));
      assert.equal(await stripSide(), side);
      assert.equal(await page.locator(t(`outside-${side}`)).getAttribute('aria-pressed'), 'true');
      const inside = await page.evaluate(() => {
        const svg = document.querySelector('.stage svg.plan') as SVGSVGElement;
        const strip = svg.querySelector('.strip rect') as SVGRectElement;
        const mark = svg.querySelector('[data-mark="meet"]') as SVGGElement;
        const a = strip.getBoundingClientRect();
        const b = mark.getBoundingClientRect();
        const cx = b.left + b.width / 2;
        const cy = b.top + b.height / 2;
        return cx >= a.left && cx <= a.right && cy >= a.top && cy <= a.bottom;
      });
      assert.ok(inside, `${side}: 만나는 곳이 띠 안에 있다`);
      await shot(page, `9a-outside-${side}`);
    }
    await page.click(t('outside-right'));
    await page.click(t('step-route'));
    await page.click(t('help'));
    assert.ok((await attr(page, 'route'))!.endsWith('out'), '길이 집 밖까지 간다');
    await shot(page, '9b-outside-route');
    assert.deepEqual(errors, [], '콘솔 오류');
    await ctx.close();
  });

  await scenario('첫 화면 배치: 움직여도 캐릭터가 서로와 그림, 글, 단추에 겹치지 않고 일구가 잘리지 않는다', async () => {
    for (const viewport of [{ width: 1366, height: 768 }, { width: 1180, height: 820 }, { width: 1920, height: 1080 }, { width: 1024, height: 700 }]) {
      const { ctx, page } = await fresh(browser, { viewport });
      await page.waitForSelector(t('start'));
      await page.waitForTimeout(800);
      const label = `${viewport.width}×${viewport.height}`;
      assert.equal(await page.locator('.welcome-foot small').count(), 0, '작은 문구가 없다');
      for (let i = 0; i < 12; i++) {
        const hits = await page.evaluate(() => {
          const box = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].map((el) => el.getBoundingClientRect());
          const meets = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
          const chars = box('.welcome-chars img');
          const out: string[] = [];
          chars.forEach((a, j) => chars.slice(j + 1).forEach((b) => {
            if (meets(a, b)) out.push('캐릭터끼리');
          }));
          const others: [string, string][] = [['표지', '.cover-art'], ['글', '.welcome-text h1'], ['단추', '[data-testid="start"]'], ['아래 문구', '.welcome-foot']];
          for (const [name, sel] of others) for (const o of box(sel)) for (const c of chars) if (meets(c, o)) out.push(name);
          const foot = box('.welcome-foot')[0]!;
          if (foot.bottom > innerHeight + 0.5) out.push('아래 문구가 화면 밖');
          return out;
        });
        assert.deepEqual(hits, [], `${label} ${i}`);
        await page.waitForTimeout(320);
      }
      const clipped = await page.locator('.welcome-chars img').nth(1).evaluate((el) => getComputedStyle(el).clipPath);
      assert.equal(clipped, 'none', '일구를 자르지 않는다');
      await shot(page, `02d-welcome-${viewport.width}`);
      await ctx.close();
    }
  });

  await scenario('작은 화면은 안내만 보인다', async () => {
    const { ctx, page } = await fresh(browser, { viewport: { width: 390, height: 844 } });
    assert.ok(await page.locator('.too-small').isVisible());
    assert.equal(await page.locator(t('start')).isVisible(), false);
    await ctx.close();
  });

  await scenario('오프라인 HTML: 두 번 눌러 열어 바깥 요청 없이 연습과 3D 까지 가고 저장이 남는다', async () => {
    const file = path.join(process.cwd(), 'offline', 'home-escape-map.html');
    const { ctx, page, errors } = await fresh(browser, { viewport: { width: 1280, height: 800 }, offline: true, serviceWorkers: 'allow' }, true, pathToFileURL(file).href);
    const outside: string[] = [];
    page.on('request', (r) => {
      if (!/^(file|data|blob):/.test(r.url())) outside.push(r.url());
    });
    await page.waitForSelector(t('start'));
    await imagesLoaded(page);
    await fontLoaded(page);
    assert.equal(await page.locator(t('install-link')).count(), 0, '오프라인 판에는 설치 안내가 없다');
    await startAs(page, 1);
    await voicePlays(page);
    await page.click(t('help'));
    await page.click(t('step-drill'));
    await page.click(t('drill-start'));
    await page.waitForSelector(t('player'));
    await playToEnd(page, (x, y) => clickAt(page, x, y));
    await page.click(t('drill-call'));
    await page.waitForSelector(t('praises'));
    await page.click(t('open-replay'));
    await page.waitForSelector(t('replay-canvas'), { timeout: 30000 });
    await page.keyboard.press('Escape');
    const walls = await num(page, 'walls');
    await page.reload();
    assert.ok((await page.locator(t('start')).innerText()).includes('이어서'), '다시 열면 이어서 그린다');
    await page.click(t('start'));
    await page.waitForSelector('.studio');
    assert.equal(await num(page, 'walls'), walls, '저장이 남는다');
    assert.deepEqual(outside, [], '바깥 요청');
    assert.deepEqual(errors, [], '콘솔 오류');
    await ctx.close();
  });

  await scenario('웹: 한 번 열면 인터넷이 끊겨도 글꼴·그림·음성·3D 와 함께 열린다', async () => {
    const site = await startSite(4190);
    try {
      const { ctx, page, errors } = await fresh(browser, { viewport: { width: 1280, height: 800 }, serviceWorkers: 'allow' }, true, `${site.url}V2/`);
      await page.waitForSelector(t('start'));
      assert.equal(await page.locator(t('install-link')).getAttribute('href'), '../download/');
      await checkInstallLink(page);
      await waitForOfflineCopy(page);
      assert.equal((await ctx.request.get(`${site.url}V2/manifest.webmanifest`)).status(), 200);

      site.setDown(true);
      assert.equal((await ctx.request.get(`${site.url}V2/`)).status(), 503, '끊김 흉내가 켜지지 않았다');
      await page.reload();
      await page.waitForSelector(t('start'), { timeout: 15000 });
      await imagesLoaded(page);
      await fontLoaded(page);
      await startAs(page, 3);
      await voicePlays(page);
      await page.click(t('help'));
      assert.ok((await num(page, 'walls')) > 0, '끊긴 채로 그린다');
      const chunk = fs.readdirSync(path.join(process.cwd(), 'dist', 'assets')).find((f) => /^Replay3D.*\.js$/.test(f))!;
      const status = await page.evaluate(async (name) => (await window.fetch(`./assets/${name}`)).status, chunk);
      assert.equal(status, 200, '3D 묶음을 저장본에서 받는다');
      assert.deepEqual(errors, [], '콘솔 오류');
      await ctx.close();
    } finally {
      site.close();
    }
  });

  await scenario('전환: 이전 판 워커가 남은 브라우저도 바로 V2 로 가고, 끊겨도 기본 주소가 열린다', async () => {
    const site = await startSite(4191);
    try {
      // 옛 워커 — 첫 페이지를 저장본에서 내주고, 새 판이 와도 스스로 넘어가지 않는다
      site.pages.set('/', '<!doctype html><title>이전 판</title><h1 id="old">이전 판</h1><script>navigator.serviceWorker.register("./sw.js")</script>');
      site.pages.set('/sw.js', `
        self.addEventListener('install', (e) => e.waitUntil(caches.open('hem-2.1.6').then((c) => c.add('./'))));
        self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
        self.addEventListener('fetch', (e) => { if (e.request.mode === 'navigate') e.respondWith(caches.match('./')); });
      `);
      const ctx = await browser.newContext({ locale: 'ko-KR', viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      await page.goto(site.url);
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      await page.reload();
      assert.equal(await page.locator('#old').count(), 1, '옛 저장본이 뜬다');

      // 새 배포
      site.pages.set('/', fs.readFileSync(path.join(process.cwd(), 'root-redirect.html'), 'utf8'));
      site.pages.set('/sw.js', fs.readFileSync(path.join(process.cwd(), 'root-sw.js'), 'utf8'));
      await page.goto(site.url);
      await page.waitForURL(`${site.url}V2/`, { timeout: 30000 });
      await page.waitForSelector(t('start'));
      await waitForOfflineCopy(page);
      const keys = await page.evaluate(() => caches.keys());
      assert.ok(!keys.includes('hem-2.1.6'), `옛 저장본이 지워져야 한다: ${keys.join(', ')}`);

      site.setDown(true);
      await page.goto(site.url);
      await page.waitForURL(`${site.url}V2/`, { timeout: 15000 });
      await page.waitForSelector(t('start'), { timeout: 15000 });
      await ctx.close();
    } finally {
      site.close();
    }
  });

  await browser.close();
  server.httpServer.close();

  process.stdout.write(`\n  시나리오 통과 ${passed} · 실패 ${failures.length}\n`);
  for (const f of failures) process.stdout.write(`\n  실패: ${f}\n`);
  process.exit(failures.length ? 1 : 0);
}

void main();
