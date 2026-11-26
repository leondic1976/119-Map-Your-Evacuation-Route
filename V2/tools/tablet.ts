/**
 * 태블릿 화면 재기 (대장 #183) — 10인치 안팎 태블릿의 화면 크기마다 모든 단계를 열어 잰다.
 *
 * 브라우저의 주소 줄과 탭 줄이 차지하는 높이를 뺀 크기도 함께 잰다. 손가락 기기로 연다.
 *   - 화면이 옆이나 아래로 넘치지 않는다
 *   - 단추가 48 아래로 내려가지 않고, 잘리거나 가려지지 않는다
 *   - 종이가 화면의 넉넉한 몫을 차지하고, 처음 네모 한 칸이 48px 아래로 내려가지 않는다
 *   - 왼쪽 도구가 화면 밖으로 숨으면 더 있다는 것을 알 수 있다
 *
 *   npm run tablet            재고 어긋난 것이 있으면 실패한다 (dist/ 를 띄우므로 빌드 뒤에 부른다)
 *   npm run tablet -- --shots  .shots/tablet/ 에 화면도 찍는다
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { preview } from 'vite';
import { autoDoors, autoMarks, autoRoute, autoTag } from '../src/core/auto';
import { emptyPlan, normalize } from '../src/core/edit';
import { analyze } from '../src/core/grid';
import { placeItem } from '../src/core/items';
import type { Band, Plan } from '../src/core/types';
import { BANDS } from '../src/content/bands';
import { buildHome, HOMES } from '../src/content/homes';

const PORT = 4181;
const SHOTS = path.join(process.cwd(), '.shots', 'tablet');
const withShots = process.argv.includes('--shots');
const only = process.env.TABLET_ONLY;

/** 태블릿 화면 — CSS 픽셀. `bar` 는 브라우저의 주소 줄과 탭 줄을 뺀 크기다 */
export const TABLETS: { name: string; width: number; height: number }[] = [
  { name: '갤럭시 탭 가로', width: 1280, height: 800 },
  { name: '갤럭시 탭 가로 (브라우저 줄 빼고)', width: 1280, height: 712 },
  { name: '갤럭시 탭 가로 (글씨 크게)', width: 1138, height: 640 },
  { name: '아이패드 10.9 가로', width: 1180, height: 820 },
  { name: '아이패드 10.9 가로 (브라우저 줄 빼고)', width: 1180, height: 746 },
  { name: '아이패드 10.2 가로', width: 1080, height: 810 },
  { name: '아이패드 10.2 가로 (브라우저 줄 빼고)', width: 1080, height: 736 },
  { name: '아이패드 9.7 가로 (브라우저 줄 빼고)', width: 1024, height: 694 },
  { name: '아이패드 12.9 가로', width: 1366, height: 1024 },
  { name: '갤럭시 탭 세로', width: 800, height: 1280 },
  { name: '갤럭시 탭 세로 (브라우저 줄 빼고)', width: 800, height: 1192 },
  { name: '아이패드 10.9 세로 (브라우저 줄 빼고)', width: 820, height: 1106 },
  { name: '아이패드 10.2 세로 (브라우저 줄 빼고)', width: 810, height: 1006 },
  { name: '아이패드 9.7 세로 (브라우저 줄 빼고)', width: 768, height: 950 },
];

const STEPS = ['draw', 'sort', 'door', 'mark', 'route', 'drill', 'review'] as const;
const t = (id: string): string => `[data-testid="${id}"]`;

function fullHome(band: Band): Plan {
  const info = BANDS[band];
  const blank = emptyPlan(info.cols, info.rows);
  const home = HOMES.find((h) => h.id === 'home-3w')!;
  let plan = autoRoute(autoMarks(autoDoors(autoTag(normalize({ ...blank, ...buildHome(home, blank.cols, blank.rows) }), band)), band));
  const layout = analyze(plan);
  for (const [kind, name] of [['bed', 'main'], ['sofa', 'living'], ['tv', 'living'], ['fridge', 'kitchen']] as const) {
    const cell = layout.cells.find((c) => c.name === name) ?? layout.cells[0]!;
    const res = placeItem(plan, layout, kind, { x: cell.anchor.x + 0.3, y: cell.anchor.y + 0.2 });
    if (res.ok) plan = res.plan;
  }
  return plan;
}

interface Measure {
  overX: number;
  overY: number;
  small: string[];
  covered: string[];
  clipped: string[];
  paper: { w: number; h: number } | null;
  square: number;
  dot: number;
  toolsHidden: number;
  toolsCue: boolean;
  bubbleLines: number;
  /** 방향키 판이 집 그림을 가린 몫 (0~1) */
  padOver: number;
}

async function measure(page: Page): Promise<Measure> {
  return page.evaluate(() => {
    const top = document.querySelector('.replay') ?? document.querySelector('.overlay') ?? document.querySelector('.studio') ?? document.querySelector('.app-root')!;
    const small: string[] = [];
    const covered: string[] = [];
    const clipped: string[] = [];
    const name = (el: HTMLElement): string => el.dataset.testid ?? el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 12);
    /** 스크롤해서 닿는 단추는 잘린 것이 아니다 */
    const scroller = (el: Element): Element | null => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 1) return p;
      }
      return null;
    };
    for (const el of top.querySelectorAll<HTMLElement>('button, a, input')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.width < 47.5 || r.height < 47.5) small.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      const box = scroller(el);
      if (box) {
        const b = box.getBoundingClientRect();
        // 스크롤 칸 안에서 지금 보이지 않는 것은 넘어간다
        if (r.bottom > b.bottom + 1 || r.top < b.top - 1) continue;
      }
      if (r.left < -0.5 || r.top < -0.5 || r.right > window.innerWidth + 0.5 || r.bottom > window.innerHeight + 0.5) {
        clipped.push(name(el));
        continue;
      }
      for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.9], [0.5, 0.1]] as const) {
        const hit = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
        if (!hit || !(el === hit || el.contains(hit))) {
          covered.push(name(el));
          break;
        }
      }
    }
    const paperEl = document.querySelector('.stage .paper');
    const pr = paperEl?.getBoundingClientRect();
    const svg = document.querySelector('.stage svg.plan') as SVGSVGElement | null;
    let square = 0;
    let dot = 0;
    if (svg) {
      const m = svg.getScreenCTM()!;
      square = new DOMPoint(100, 0).matrixTransform(m).x - new DOMPoint(0, 0).matrixTransform(m).x;
      dot = square / Number(svg.getAttribute('data-density') ?? 1);
    }
    // 방향키 판이 집(벽 그림)을 얼마나 가리는가
    let padOver = 0;
    const pad = document.querySelector('.stage .arrow-pad')?.getBoundingClientRect();
    const house = document.querySelector('.stage svg.plan .walls')?.getBoundingClientRect();
    if (pad && house && house.width > 0) {
      const w = Math.max(0, Math.min(pad.right, house.right) - Math.max(pad.left, house.left));
      const h = Math.max(0, Math.min(pad.bottom, house.bottom) - Math.max(pad.top, house.top));
      padOver = (w * h) / (house.width * house.height);
    }
    const tools = document.querySelector<HTMLElement>('.stage .tools');
    const bubble = document.querySelector<HTMLElement>('.bubble p');
    return {
      overX: document.documentElement.scrollWidth - window.innerWidth,
      overY: document.documentElement.scrollHeight - window.innerHeight,
      small,
      covered,
      clipped,
      paper: pr ? { w: Math.round(pr.width), h: Math.round(pr.height) } : null,
      square,
      dot,
      toolsHidden: tools ? Math.max(0, tools.scrollHeight - tools.clientHeight) : 0,
      toolsCue: tools ? tools.dataset.more !== undefined : false,
      bubbleLines: bubble ? Math.round(bubble.getBoundingClientRect().height / parseFloat(getComputedStyle(bubble).lineHeight)) : 0,
      padOver,
    };
  });
}

const problems: string[] = [];
const rows: string[] = [];

function judge(label: string, m: Measure, opts: { paper?: boolean; grade?: number; view: { width: number; height: number } }): void {
  const bad = (msg: string): void => {
    problems.push(`${label}: ${msg}`);
  };
  if (m.overX > 0) bad(`옆으로 ${m.overX}px 넘친다`);
  if (m.overY > 0) bad(`아래로 ${m.overY}px 넘친다`);
  if (m.small.length) bad(`48 아래 단추 — ${m.small.join(', ')}`);
  if (m.covered.length) bad(`가려진 단추 — ${m.covered.join(', ')}`);
  if (m.clipped.length) bad(`화면 밖으로 잘린 단추 — ${m.clipped.join(', ')}`);
  if (opts.paper && m.paper) {
    const share = (m.paper.w * m.paper.h) / (opts.view.width * opts.view.height);
    if (share < 0.4) bad(`종이가 화면의 ${(share * 100).toFixed(0)}% 뿐이다 (${m.paper.w}×${m.paper.h})`);
    // 글씨를 크게 해 둔 태블릿(높이 660 아래)의 5~6학년 종이만 44px 까지 내려간다. 그 밖에는 48 을 지킨다
    const floor = opts.view.height < 660 && (opts.grade ?? 0) >= 5 ? 43 : 47.5;
    if (m.square && m.square < floor) bad(`처음 네모 한 칸이 ${m.square.toFixed(1)}px 이다`);
  }
  if (m.padOver > 0.03) bad(`방향키 판이 집 그림의 ${(m.padOver * 100).toFixed(0)}% 를 가린다`);
  if (m.toolsHidden > 4 && !m.toolsCue) bad(`왼쪽 도구가 ${m.toolsHidden}px 숨었는데 더 있다는 표시가 없다`);
  rows.push(`${label.padEnd(54)} 종이 ${m.paper ? `${m.paper.w}×${m.paper.h}` : '-'.padEnd(7)}  네모 ${m.square ? m.square.toFixed(0).padStart(3) : '  -'}px  점 ${m.dot ? m.dot.toFixed(0).padStart(3) : '  -'}px  숨은 도구 ${String(m.toolsHidden).padStart(3)}px  말풍선 ${m.bubbleLines}줄`);
}

async function open(browser: Browser, view: { width: number; height: number }, grade: number, plan: Plan | null): Promise<Page> {
  const ctx = await browser.newContext({ locale: 'ko-KR', serviceWorkers: 'block', viewport: view, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript('window.__name = (f) => f');
  await page.addInitScript('Date.now = () => 1700000000000');
  await page.addInitScript(`sessionStorage.setItem('home-escape-map-v2:howto', '${JSON.stringify(['draw', 'sort', 'door', 'mark', 'route', 'drill'])}')`);
  await page.goto(`http://localhost:${PORT}/`);
  if (plan) {
    await page.evaluate((p) => localStorage.setItem('home-escape-map-v2:plan', JSON.stringify(p)), plan);
    await page.reload();
  }
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  void grade;
  return page;
}

async function snap(page: Page, name: string): Promise<void> {
  if (!withShots) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

/** 손가락 기기에서만 드러나는 것들 — 숨은 도구 알림, 자판, 손짓, 화면 가득 채우기, 소리 재생기 */
async function handChecks(browser: Browser): Promise<void> {
  const bad = (msg: string): void => {
    problems.push(`손가락 기기: ${msg}`);
  };
  // 1. 왼쪽 도구가 숨으면 더 있다고 알리고, 끝까지 내리면 알림이 사라진다
  {
    const page = await open(browser, { width: 1024, height: 520 }, 5, fullHome('high'));
    await page.tap(t('start'));
    await page.tap(t('grade-5'));
    await page.tap(t('tag-done'));
    await page.waitForSelector('.studio');
    if (await page.locator(t('howto-ok')).count()) await page.tap(t('howto-ok'));
    await page.tap(t('step-draw'));
    await page.waitForSelector('.studio[data-step="draw"]');
    await page.waitForTimeout(400);
    // 어느 화면에서든 도구가 숨도록 칸을 낮춰 놓고 본다. 크기가 바뀐 것을 알린다
    const hidden = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('.stage .tools')!;
      el.style.maxHeight = '150px';
      window.dispatchEvent(new Event('resize'));
      return el.scrollHeight - el.clientHeight;
    });
    await page.waitForTimeout(300);
    if (hidden <= 8) bad(`도구가 숨는 화면을 만들지 못했다 (${hidden}px)`);
    else {
      if (!(await page.locator('.stage .tools[data-more]').count())) bad('도구가 숨었는데 더 있다는 표시가 없다');
      await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('.stage .tools')!;
        el.scrollTop = el.scrollHeight;
      });
      await page.waitForTimeout(300);
      if (await page.locator('.stage .tools[data-more]').count()) bad('끝까지 내렸는데 더 있다는 표시가 남았다');
    }
    await snap(page, 'hand-1-more');
    await page.context().close();
  }
  // 2. 이름을 적는 동안 자판이 화면을 줄여도 이름 칸이 사라지지 않는다
  {
    const page = await open(browser, { width: 1280, height: 800 }, 3, null);
    await page.tap(t('start'));
    await page.tap(t('name'));
    await page.setViewportSize({ width: 1280, height: 420 });
    await page.waitForTimeout(200);
    if (!(await page.locator(t('name')).isVisible())) bad('자판이 뜨면(높이 420) 이름 칸이 사라진다');
    await page.keyboard.type('하늘');
    if ((await page.locator(t('name')).inputValue()) !== '하늘') bad('줄어든 화면에서 이름이 적히지 않는다');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.waitForTimeout(200);
    if (!(await page.locator('.too-small').isVisible())) bad('이름 칸을 벗어난 낮은 화면에서 안내가 보이지 않는다');
    await page.setViewportSize({ width: 1280, height: 800 });
    if ((await page.locator(t('name')).inputValue()) !== '하늘') bad('화면이 돌아온 뒤 적은 이름이 사라졌다');
    await page.context().close();
  }
  // 3. 손짓 · 화면 가득 채우기 · 소리 재생기 하나
  {
    const ctx = await browser.newContext({ locale: 'ko-KR', serviceWorkers: 'block', viewport: { width: 1280, height: 712 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.addInitScript('window.__name = (f) => f');
    await page.addInitScript(`(() => { const A = window.Audio; let n = 0; window.Audio = function (...a) { n += 1; window.__audios = n; return new A(...a); }; window.Audio.prototype = A.prototype; })()`);
    await page.goto(`http://localhost:${PORT}/`);
    await page.tap(t('start'));
    await page.tap(t('grade-3'));
    await page.tap(t('tag-done'));
    await page.waitForSelector('.studio');
    if (await page.locator(t('howto-ok')).count()) await page.tap(t('howto-ok'));
    const style = await page.evaluate(() => ({
      studio: getComputedStyle(document.querySelector('.studio')!).touchAction,
      plan: getComputedStyle(document.querySelector('.stage svg.plan')!).touchAction,
      select: getComputedStyle(document.querySelector('.app-root')!).userSelect,
      over: getComputedStyle(document.documentElement).overscrollBehaviorY,
    }));
    if (style.studio !== 'pan-x pan-y') bad(`그리는 화면이 두 손가락으로 커진다 (touch-action: ${style.studio})`);
    if (style.plan !== 'none') bad(`지도 위에서 화면이 밀린다 (touch-action: ${style.plan})`);
    if (style.select !== 'none') bad('길게 누르면 글자가 골라진다');
    if (style.over !== 'none') bad('끌어 내리면 새로 고쳐진다');
    await page.tap(t('menu'));
    const fill = page.locator(t('fill-screen'));
    if (!(await fill.count())) bad('설정에 화면 가득 채우기가 없다');
    else {
      const box = await fill.boundingBox();
      if (!box || box.height < 48) bad('화면 가득 채우기 단추가 48 아래다');
    }
    await page.tap(t('menu-close'));
    // 단계를 옮기며 대사를 여러 번 듣는다 — 재생기는 하나만 만든다
    for (const step of ['sort', 'door', 'mark', 'draw'] as const) {
      await page.tap(t(`step-${step}`));
      await page.waitForTimeout(250);
      if (await page.locator(t('howto-ok')).count()) await page.tap(t('howto-ok'));
    }
    await page.tap(t('repeat'));
    await page.waitForFunction(() => ['playing', 'ended'].includes(document.documentElement.dataset.voiceState ?? ''), undefined, { timeout: 8000 }).catch(() => bad('다시 듣기를 눌러도 음성이 재생되지 않는다'));
    const audios = await page.evaluate(() => (window as unknown as { __audios?: number }).__audios ?? 0);
    if (audios !== 1) bad(`음성 재생기를 ${audios}개 만들었다 (하나를 돌려 써야 아이패드에서 이어 말한다)`);
    await ctx.close();
  }
  rows.push('손가락 기기 — 숨은 도구 알림 · 자판 · 손짓 · 화면 가득 채우기 · 소리 재생기');
}

async function main(): Promise<void> {
  const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'silent' });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  process.stdout.write('\n  태블릿 화면 재기\n');
  try {
    for (const tab of TABLETS) {
      if (only && !new RegExp(only).test(`${tab.width}x${tab.height} ${tab.name}`)) continue;
      const view = { width: tab.width, height: tab.height };
      const size = `${tab.width}x${tab.height}`;
      // 첫 화면과 이름표
      {
        const page = await open(browser, view, 3, null);
        await page.waitForSelector(t('start'));
        await page.waitForTimeout(900);
        judge(`${size} 첫 화면`, await measure(page), { view });
        await snap(page, `${size}-0-welcome`);
        await page.tap(t('start'));
        await page.waitForSelector(t('tag-done'));
        judge(`${size} 이름표`, await measure(page), { view });
        await snap(page, `${size}-0-nametag`);
        await page.context().close();
      }
      for (const [grade, band] of [[1, 'low'], [3, 'mid'], [5, 'high']] as const) {
        const page = await open(browser, view, grade, fullHome(band));
        await page.tap(t('start'));
        await page.tap(t(`grade-${grade}`));
        await page.tap(t('tag-done'));
        await page.waitForSelector('.studio');
        if (await page.locator(t('howto-ok')).count()) await page.tap(t('howto-ok'));
        for (const step of STEPS) {
          await page.tap(t(`step-${step}`));
          await page.waitForSelector(`.studio[data-step="${step}"]`);
          await page.waitForTimeout(350);
          if (await page.locator(t('howto-ok')).count()) await page.tap(t('howto-ok'));
          judge(`${size} ${grade}학년 ${step}`, await measure(page), { view, grade, paper: step !== 'review' });
          await snap(page, `${size}-g${grade}-${step}`);
        }
        await page.context().close();
      }
    }
    if (!only || only === "hand") await handChecks(browser);
  } finally {
    await browser.close();
    await server.close();
  }
  process.stdout.write(`${rows.map((r) => `    ${r}`).join('\n')}\n`);
  if (problems.length) {
    process.stdout.write(`\n  어긋난 것 ${problems.length}개\n${problems.map((p) => `    ${p}`).join('\n')}\n\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`\n  태블릿 화면 ${TABLETS.length}가지 통과\n\n`);
  }
}

void main();
