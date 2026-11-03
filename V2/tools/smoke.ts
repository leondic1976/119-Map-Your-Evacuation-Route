/**
 * Chromium 실조작 — 세 학년 단계를 마우스와 터치로 끝까지 눌러 본다.
 * `dist/` 를 띄워서 돌리므로 빌드 뒤에 부른다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
      const p = new DOMPoint(px! * 100, py! * 100).matrixTransform(svg.getScreenCTM()!);
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

async function fresh(browser: Browser, opts: Parameters<Browser['newContext']>[0]): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const ctx = await browser.newContext({ locale: 'ko-KR', ...opts });
  const page = await ctx.newPage();
  // tsx 가 함수 이름을 보존하려고 넣는 도우미를 브라우저에도 둔다
  await page.addInitScript('window.__name = (f) => f');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(URL_BASE);
  return { ctx, page, errors };
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
      const cells = [...document.querySelectorAll('.stage [data-cell]')];
      const cellOf = (k: string) => {
        const [x, y] = k.split(',').map(Number);
        for (const c of cells) {
          for (const r of c.querySelectorAll('rect')) {
            if (Number(r.getAttribute('x')) === x! * 100 - 0.5 && Number(r.getAttribute('y')) === y! * 100 - 0.5) return c.getAttribute('data-cell');
          }
        }
        return null;
      };
      const ids = route.map((s) => (s === 'out' ? 'out' : cellOf(s)));
      return { next: route[ids.indexOf(at) + 1] ?? null, rows: 0 };
    });
    assert.ok(next.next, '길의 다음 칸이 있어야 한다');
    if (next.next === 'out') {
      const cols = await num(page, 'cols');
      const rows = await num(page, 'rows');
      await tap(cols / 2, rows + 0.9);
    } else {
      const [x, y] = next.next.split(',').map(Number);
      await tap(x! + 0.5, y! + 0.5);
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
    await page.click(t('replay-view'));
    await page.waitForFunction(() => document.querySelector('[data-testid="replay-caption"]')?.getAttribute('data-ended') === '1', undefined, { timeout: 60000 });
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
    assert.ok((await num(page, 'cells')) >= 4, '도와줘가 벽을 채운다');
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
    await page.click(t('tpl-high-square'));
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
    await page.waitForTimeout(1500);
    assert.equal(await page.locator(t('drill-close')).isEnabled(), true, '지나온 문을 닫을 수 있다');
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

  await scenario('작은 화면은 안내만 보인다', async () => {
    const { ctx, page } = await fresh(browser, { viewport: { width: 390, height: 844 } });
    assert.ok(await page.locator('.too-small').isVisible());
    assert.equal(await page.locator(t('start')).isVisible(), false);
    await ctx.close();
  });

  await browser.close();
  server.httpServer.close();

  process.stdout.write(`\n  시나리오 통과 ${passed} · 실패 ${failures.length}\n`);
  for (const f of failures) process.stdout.write(`\n  실패: ${f}\n`);
  process.exit(failures.length ? 1 : 0);
}

void main();
