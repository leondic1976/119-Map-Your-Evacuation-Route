/**
 * 브라우저 실조작 검증.
 *
 * 정적 내보내기(out/)를 임시 서버로 띄우고 Chromium 으로 실제 화면을 눌러 본다.
 * 소개 → 온보딩 → 그리기 → 경로 → 대피 연습 → 리포트 → 3D 리플레이 → 인쇄까지 한 번에 가고,
 * PC 화면과 오프라인 배포본(file://)도 같은 길을 걷는다.
 *
 *   npm run build && npm run smoke
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium, Browser, Page } from '@playwright/test';

const root = process.cwd();
const outDir = path.join(root, 'out');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function serve(dir: string): Promise<{ url: string; close: () => Promise<void>; setOffline: (on: boolean) => void }> {
  /*
   * 오프라인 흉내는 서버 쪽에서 한다. Playwright 의 context.setOffline 은 서비스 워커가 보내는
   * 요청에는 닿지 않아, 캐시가 비어 있어도 통과해 버린다. 서버가 503 을 돌려주면 워커도 못 받는다.
   */
  let offline = false;
  const server = http.createServer((req, res) => {
    if (offline) {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end('offline');
      return;
    }
    const raw = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.join(dir, raw);
    if (raw.endsWith('/')) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      const alt = `${file}.html`;
      if (fs.existsSync(alt)) file = alt;
      else {
        res.writeHead(404);
        res.end('not found');
        return;
      }
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/`,
        close: () => new Promise((r) => server.close(() => r())),
        setOffline: (on) => {
          offline = on;
        },
      });
    });
  });
}

/* ------------------------------------------------------------------ */

let passed = 0;
const failures: string[] = [];

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    process.stdout.write(`    OK  ${name}\n`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`${name}\n        ${msg}`);
    process.stdout.write(`    X   ${name}  — ${msg}\n`);
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

/* ------------------------------------------------------------------ */

/** 글 수준은 상단 설정 메뉴 안에 있다 (설계서 v2.0 §2.1). 집 모양 덮개가 떠 있을 때도 읽어야 하므로 화면 뿌리의 표지로 본다 */
async function gradeLabel(page: Page): Promise<string> {
  const mode = await page.locator('.k-app').getAttribute('data-grade-mode');
  return mode === 'normal' ? '보통' : '쉬움';
}

/** 도면에서 셀 (x, y) 한가운데의 화면 좌표 */
async function kidsCell(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await page.locator('svg.k-stage').boundingBox();
  if (!box) throw new Error('도면이 없다');
  const cs = box.width / 24;
  return { x: box.x + (x + 0.5) * cs, y: box.y + (y + 0.5) * cs };
}

interface BrowserRect { x: number; y: number; w: number; h: number }
interface BrowserBlock {
  id: string;
  kind: string;
  label?: string;
  subKind?: string;
  roomKind?: string;
  wallMode?: string;
  openingKind?: string;
  side?: 'N' | 'E' | 'S' | 'W';
  span?: number;
  size?: { w: number; h: number };
  cell?: { x: number; y: number };
  rect?: BrowserRect;
}
interface BrowserPlan {
  grid: { width: number; height: number };
  shell?: { cells: { x: number; y: number }[] };
  blocks: BrowserBlock[];
}

async function kidsPlan(page: Page): Promise<BrowserPlan> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('evac-kids-v1');
    if (!raw) throw new Error('저장된 도면이 없다');
    return JSON.parse(raw).plan;
  });
}

async function planPoint(page: Page, plan: BrowserPlan, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await page.locator('svg.k-stage').boundingBox();
  if (!box) throw new Error('도면이 없다');
  return { x: box.x + (x + 0.5) * (box.width / plan.grid.width), y: box.y + (y + 0.5) * (box.height / plan.grid.height) };
}

async function dragPlanCells(page: Page, plan: BrowserPlan, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const a = await planPoint(page, plan, from.x, from.y);
  const b = await planPoint(page, plan, to.x, to.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

/** 현재 게임 화면의 실제 시작점·목표와 저장 도면을 읽어 벽을 통과하지 않는 최단 조작을 만든다. */
async function gameShortestKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('evac-kids-v1');
    if (!raw) throw new Error('게임 도면이 저장되지 않았다');
    const plan = JSON.parse(raw).plan as {
      grid: { width: number; height: number };
      blocks: Array<{ kind: string; id: string; rect?: BrowserRect; cell?: { x: number; y: number }; side?: 'N' | 'E' | 'S' | 'W' }>;
    };
    const player = document.querySelector('.k-stage [data-player]');
    if (!player) throw new Error('게임 플레이어가 보이지 않는다');
    const playerMatch = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(player.getAttribute('transform') ?? '');
    if (!playerMatch) throw new Error(`플레이어 좌표를 읽을 수 없다: ${player.getAttribute('transform')}`);
    const playerX = Number(playerMatch[1]);
    const playerY = Number(playerMatch[2]);
    const start = { x: Math.round(playerX / 36), y: Math.round(playerY / 36) };
    const goals = new Set<string>();
    for (const element of Array.from(document.querySelectorAll('.k-stage [data-game-layer] > g.kids-hl'))) {
      const match = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(element.getAttribute('transform') ?? '');
      if (match) goals.add(`${Math.round(Number(match[1]) / 36 - 0.5)},${Math.round(Number(match[2]) / 36 - 0.5)}`);
    }
    if (!goals.size) throw new Error('현재 게임의 목표 칸이 보이지 않는다');

    const owner = new Map<string, string>();
    for (const block of plan.blocks) {
      if (block.kind !== 'room' || !block.rect) continue;
      for (let y = block.rect.y; y < block.rect.y + block.rect.h; y += 1) for (let x = block.rect.x; x < block.rect.x + block.rect.w; x += 1) owner.set(`${x},${y}`, block.id);
    }
    const boundaries = new Set<string>();
    for (const block of plan.blocks) {
      if (block.kind !== 'opening' || !block.cell || !block.side) continue;
      const dx = block.side === 'E' ? 1 : block.side === 'W' ? -1 : 0;
      const dy = block.side === 'S' ? 1 : block.side === 'N' ? -1 : 0;
      const a = `${block.cell.x},${block.cell.y}`;
      const b = `${block.cell.x + dx},${block.cell.y + dy}`;
      boundaries.add(a < b ? `${a}|${b}` : `${b}|${a}`);
    }
    const startKey = `${start.x},${start.y}`;
    const queue = [startKey];
    const previous = new Map<string, { from: string; key: string }>();
    const seen = new Set([startKey]);
    const directions: Array<[number, number, string]> = [[1, 0, 'ArrowRight'], [-1, 0, 'ArrowLeft'], [0, 1, 'ArrowDown'], [0, -1, 'ArrowUp']];
    let found: string | null = goals.has(startKey) ? startKey : null;
    while (queue.length && !found) {
      const current = queue.shift() as string;
      const [x, y] = current.split(',').map(Number);
      for (const [dx, dy, key] of directions) {
        const next = `${x + dx},${y + dy}`;
        if (seen.has(next) || !owner.has(next)) continue;
        const edge = current < next ? `${current}|${next}` : `${next}|${current}`;
        if (owner.get(current) !== owner.get(next) && !boundaries.has(edge)) continue;
        seen.add(next);
        previous.set(next, { from: current, key });
        if (goals.has(next)) {
          found = next;
          break;
        }
        queue.push(next);
      }
    }
    if (!found) throw new Error(`목표까지 걸을 길이 없다: ${[...goals].join(', ')}`);
    const keys: string[] = [];
    while (found !== startKey) {
      const item = previous.get(found);
      if (!item) throw new Error('게임 최단 길을 복원하지 못했다');
      keys.push(item.key);
      found = item.from;
    }
    return keys.reverse();
  });
}

function validShellRoomRect(plan: BrowserPlan, id: string, rect: BrowserRect): boolean {
  const shell = new Set((plan.shell?.cells ?? []).map((cell) => `${cell.x},${cell.y}`));
  if (!shell.size || rect.w < 2 || rect.h < 2) return false;
  const occupied = new Set<string>();
  for (const block of plan.blocks.filter((item) => item.kind === 'room' && item.wallMode !== 'zone')) {
    const r = block.id === id ? rect : block.rect;
    if (!r) return false;
    for (let y = r.y; y < r.y + r.h; y += 1) for (let x = r.x; x < r.x + r.w; x += 1) {
      const key = `${x},${y}`;
      if (!shell.has(key) || occupied.has(key)) return false;
      occupied.add(key);
    }
  }
  const residual = new Set([...shell].filter((key) => !occupied.has(key)));
  if (!residual.size) return false;
  const first = residual.values().next().value as string;
  const seen = new Set([first]);
  const queue = [first];
  while (queue.length) {
    const [x, y] = (queue.shift() as string).split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${x + dx},${y + dy}`;
      if (residual.has(key) && !seen.has(key)) {
        seen.add(key);
        queue.push(key);
      }
    }
  }
  return seen.size === residual.size;
}

function validShellInsertRect(plan: BrowserPlan, rect: BrowserRect): boolean {
  return validShellRoomRect(
    { ...plan, blocks: plan.blocks.concat([{ id: '__insert_probe__', kind: 'room', roomKind: 'bedroom', wallMode: 'closed', rect }]) },
    '__insert_probe__',
    rect,
  );
}

async function kidsSave(page: Page): Promise<{
  blocks: number;
  primary: number;
  alternate: number;
  attempts: number;
  schemaVersion: number;
  badges: number;
  stampWeeks: number;
  practiceRecords: number;
  lastSeeds: number[];
}> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('evac-kids-v1');
    if (!raw) return { blocks: 0, primary: 0, alternate: 0, attempts: 0, schemaVersion: 0, badges: 0, stampWeeks: 0, practiceRecords: 0, lastSeeds: [] };
    const f = JSON.parse(raw);
    const records = f.progress?.practiceRecords ?? [];
    return {
      blocks: (f.plan?.blocks ?? []).length as number,
      primary: (f.routes?.fire?.primary?.waypoints ?? []).length as number,
      alternate: (f.routes?.fire?.alternate?.waypoints ?? []).length as number,
      attempts: (f.progress?.attempts ?? 0) as number,
      schemaVersion: (f.schemaVersion ?? 0) as number,
      badges: (f.progress?.earnedBadgeIds ?? []).length as number,
      stampWeeks: (f.progress?.practiceWeekKeys ?? []).length as number,
      practiceRecords: records.length as number,
      lastSeeds: records.slice(-2).map((record: { seed?: number }) => Number(record.seed ?? -1)),
    };
  });
}

/**
 * 지금 화면에서 누를 수 있는 것들의 크기.
 * 라벨로 감싼 체크상자는 라벨 전체가 누르는 칸이므로 라벨을 잰다.
 */
async function hitTargets(page: Page): Promise<{ name: string; w: number; h: number }[]> {
  return page.evaluate(() => {
    const out: { name: string; w: number; h: number }[] = [];
    const sel = 'button, a[href], select, textarea, input, [role="button"], [tabindex]:not([tabindex="-1"])';
    for (const el of Array.from(document.querySelectorAll(sel))) {
      let target: Element = el;
      const type = (el.getAttribute('type') ?? '').toLowerCase();
      if (el.tagName === 'INPUT' && (type === 'checkbox' || type === 'radio')) {
        const lab = el.closest('label');
        if (lab) target = lab;
      }
      const r = target.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(target);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
      const name = ((el.getAttribute('aria-label') || el.textContent || el.getAttribute('class') || '') as string).trim().replace(/\s+/g, ' ').slice(0, 24);
      out.push({ name: name || el.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height) });
    }
    return out;
  });
}

/** 글자와 그 뒤 바탕의 색. 그러데이션·그림이 뒤에 있으면 판정하지 않고 뺀다 */
async function textOnBackground(page: Page): Promise<{ where: string; txt: string; fg: string; bg: string; fs: number; fw: number }[]> {
  return page.evaluate(() => {
    const out: { where: string; txt: string; fg: string; bg: string; fs: number; fw: number }[] = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      let hasText = false;
      for (const n of Array.from(el.childNodes)) if (n.nodeType === 3 && (n.textContent ?? '').trim()) hasText = true;
      if (!hasText) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.95) continue;
      let bg = '';
      let painted = false;
      let n2: Element | null = el;
      while (n2) {
        const s2 = getComputedStyle(n2);
        if (s2.backgroundImage && s2.backgroundImage !== 'none') {
          painted = true;
          break;
        }
        const m = s2.backgroundColor.match(/[\d.]+/g);
        if (m && (m.length < 4 || Number(m[3]) > 0.9)) {
          bg = s2.backgroundColor;
          break;
        }
        n2 = n2.parentElement;
      }
      if (painted) continue;
      out.push({
        where: `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').slice(0, 24)}`,
        txt: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 20),
        fg: cs.color,
        bg: bg || 'rgb(255, 255, 255)',
        fs: Number.parseFloat(cs.fontSize),
        fw: Number.parseInt(cs.fontWeight, 10) || 400,
      });
    }
    return out;
  });
}

/** WCAG 명도 대비 */
function contrastRatio(fg: string, bg: string): number {
  const lum = (s: string): number => {
    const m = s.match(/[\d.]+/g) ?? ['0', '0', '0'];
    const f = m.slice(0, 3).map((v) => {
      const x = Number(v) / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const a = lum(fg) + 0.05;
  const b = lum(bg) + 0.05;
  return a > b ? a / b : b / a;
}

/** 이 글자에 필요한 대비 — 큰 글자는 3:1, 나머지는 4.5:1 */
function neededContrast(fs: number, fw: number): number {
  return fs >= 24 || (fw >= 700 && fs >= 18.66) ? 3 : 4.5;
}

/** 저장된 도면을 통째로 견주기 위한 지문 — 시나리오가 뒤를 더럽히지 않았는지 본다 */
async function planPrint(page: Page): Promise<string> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('evac-kids-v1');
    if (!raw) return '';
    const blocks = (JSON.parse(raw).plan?.blocks ?? []) as Record<string, unknown>[];
    return JSON.stringify(
      blocks
        .map((b) => JSON.stringify({ k: b.kind, s: b.subKind ?? b.roomKind ?? b.openingKind, r: b.rect, c: b.cell }))
        .sort(),
    );
  });
}

/**
 * 눌러 보고, 안 눌리면 **무엇이 가리고 있는지** 말해 준다.
 * 배포 검증 기계에서만 나는 실패는 화면을 볼 수 없어 원인을 못 짚는다.
 */
async function clickOrExplain(page: Page, selector: string, timeout = 8000): Promise<void> {
  try {
    await page.locator(selector).click({ timeout });
  } catch (e) {
    const info = await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return { missing: true };
      const r = el.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      /* 이름 붙인 함수를 여기 두면 tsx 가 __name 을 끼워 넣어 브라우저에서 터진다 */
      return {
        missing: false,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        inView: r.x >= 0 && r.y >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
        stack: (document.elementsFromPoint(cx, cy) as Element[])
          .slice(0, 5)
          .map((n) => `${n.tagName.toLowerCase()}.${typeof n.className === 'string' ? n.className : 'svg'}`),
      };
    }, selector);
    throw new Error(`${selector} 를 못 눌렀다 — ${JSON.stringify(info)} :: ${String(e).slice(0, 80)}`);
  }
}

async function kidsDrag(page: Page, path: [number, number][]): Promise<void> {
  const first = await kidsCell(page, path[0][0], path[0][1]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const [x, y] of path.slice(1)) {
    const p = await kidsCell(page, x, y);
    await page.mouse.move(p.x, p.y, { steps: 2 });
  }
  await page.mouse.up();
}

async function main(): Promise<void> {
  if (!fs.existsSync(path.join(outDir, 'index.html'))) {
    process.stderr.write('\n  out/index.html 이 없다. 먼저 npm run build 를 실행한다.\n\n');
    process.exit(1);
  }
  const server = await serve(outDir);
  let browser: Browser | null = null;
  process.stdout.write(`\n  ${server.url} 에서 검증\n\n`);

  try {
    // 내려받은 크로미움이 없는 곳에서는 SMOKE_CHROMIUM 으로 다른 실행 파일을 준다
    browser = await chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM || undefined });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
    /* 실제 스피커 대신 호출을 기록한다. 켬/끔 검사는 버튼 상태만 보고 통과하면 안 된다. */
    await context.addInitScript({
      /* 콜백 안의 class 는 tsx가 붙인 이름 보존 helper가 브라우저에 없어 실행이 끊긴다. 순수 JS 문자열로 주입한다. */
      content: `(() => {
      const probe = {
        contextAttempts: 0,
        starts: 0,
        scheduledStops: 0,
        immediateStops: 0,
        resumes: 0,
        suspends: 0,
        speaks: 0,
        cancels: 0,
        successTones: 0,
        installCalls: 0,
        installErrors: 0,
        voicePlayCalls: 0,
        voicePlayResolves: 0,
        voicePlaying: 0,
        voiceEnded: 0,
        voiceErrors: 0,
      };
      Object.defineProperty(window, '__soundProbe', { configurable: true, value: probe });

      const nativeMediaPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        probe.voicePlayCalls += 1;
        this.addEventListener('playing', () => { probe.voicePlaying += 1; }, { once: true });
        this.addEventListener('ended', () => { probe.voiceEnded += 1; }, { once: true });
        this.addEventListener('error', () => { probe.voiceErrors += 1; }, { once: true });
        const result = nativeMediaPlay.call(this);
        result.then(() => { probe.voicePlayResolves += 1; }).catch(() => undefined);
        return result;
      };

      class FakeGain {
        gain = {
          setValueAtTime: () => undefined,
          linearRampToValueAtTime: () => undefined,
        };
        connect(target) {
          return target;
        }
        disconnect() {}
      }

      class FakeOscillator {
        type = 'sine';
        frequencyValue = 0;
        frequency = { setValueAtTime: (value) => { this.frequencyValue = value; } };
        onended = null;
        connect(target) {
          return target;
        }
        disconnect() {}
        start() {
          probe.starts += 1;
          if ([523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 2093].includes(this.frequencyValue)) {
            probe.successTones += 1;
          }
        }
        stop(when) {
          if (when === undefined) {
            probe.immediateStops += 1;
            this.onended?.();
          } else {
            probe.scheduledStops += 1;
          }
        }
      }

      class FakeAudioContext {
        state = 'suspended';
        currentTime = 0;
        destination = {};
        constructor() {
          probe.contextAttempts += 1;
          /* 첫 생성 실패 뒤 다음 조작에서 다시 시도하는지도 함께 검증한다 */
          if (probe.contextAttempts === 1) throw new Error('검사용 첫 AudioContext 생성 실패');
        }
        createGain() {
          return new FakeGain();
        }
        createOscillator() {
          return new FakeOscillator();
        }
        resume() {
          this.state = 'running';
          probe.resumes += 1;
          return Promise.resolve();
        }
        suspend() {
          this.state = 'suspended';
          probe.suspends += 1;
          return Promise.resolve();
        }
      }

      class FakeUtterance {
        voice = null;
        lang = '';
        pitch = 1;
        rate = 1;
        volume = 1;
        constructor(text) {
          this.text = text;
        }
      }

      const speech = {
        speaking: false,
        onvoiceschanged: null,
        getVoices: () => [{ lang: 'ko-KR', name: '검사용 한국어', voiceURI: 'test', default: true, localService: true }],
        speak: () => {
          probe.speaks += 1;
          speech.speaking = true;
        },
        cancel: () => {
          probe.cancels += 1;
          speech.speaking = false;
        },
      };

      const install = () => {
        probe.installCalls += 1;
        try {
          Object.defineProperty(window, 'AudioContext', { configurable: true, writable: true, value: FakeAudioContext });
          Object.defineProperty(window, 'webkitAudioContext', { configurable: true, writable: true, value: FakeAudioContext });
          Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, writable: true, value: FakeUtterance });
          Object.defineProperty(window, 'speechSynthesis', { configurable: true, writable: true, value: speech });
        } catch {
          probe.installErrors += 1;
        }
      };

      /* 일부 Chromium은 초기 스크립트 뒤에 Web API 전역을 다시 설치한다. 사용자 조작 전인 load 때 한 번 더 덮는다. */
      install();
      window.addEventListener('load', install, { once: true });
      })();`,
    });
    const page = await context.newPage();
    /*
     * 3D 리플레이는 소프트웨어 GL(CI 러너·그래픽 없는 PC)에서 한 컷에 몇 초씩 걸린다. 단추는 멀쩡히 눌리지만
     * Playwright 가 「안정된 요소」를 기다리는 30초 기본 제한에 걸릴 수 있어, 이 두 시나리오만 넉넉히 준다.
     * 앱의 느림이 아니라 소프트웨어 그리기의 느림이다 — 실제 GPU 에서는 한 컷이 수십 ms 다.
     */
    const slowGl = (fn: () => Promise<void>) => async (): Promise<void> => {
      page.setDefaultTimeout(120000);
      try {
        await fn();
      } finally {
        page.setDefaultTimeout(30000);
      }
    };
    const errors: string[] = [];
    const appVoiceResponses: Array<{ url: string; status: number; contentType: string }> = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (response) => {
      if (!/\/voice\/[^/?]+\.mp3(?:\?|$)/.test(response.url())) return;
      appVoiceResponses.push({
        url: response.url(),
        status: response.status(),
        contentType: response.headers()['content-type'] ?? '',
      });
    });
    await page.goto(server.url, { waitUntil: 'networkidle' });
    const fillProfile = async () => {
      await page.locator('[data-profile="name"]').fill('안전이');
      await page.locator('[data-profile="grade"] [data-grade="3"]').click();
      await page.locator('[data-coach="kids-profile-start"]').click();
    };
    const continueAfterWelcome = async (expected = '.k-app') => {
      const start = page.locator('[data-coach="kids-welcome-start"]');
      await start.waitFor({ state: 'visible' });
      /*
       * 정적 HTML이 먼저 보이고 React 이벤트가 한 박자 뒤에 붙는 느린 PC도 있다.
       * 버튼이 사라졌다는 사실이 아니라 실제 온보딩이 나타난 것까지 확인한다.
       */
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await start.click();
        try {
          await page.locator('.k-profile, .k-pc-only').waitFor({ state: 'visible', timeout: 5000 });
          if (expected === '.k-profile' || expected === '.k-pc-only') {
            await page.locator(expected).waitFor({ state: 'visible' });
            return;
          }
          if (await page.locator('.k-profile').isVisible()) await fillProfile();
          await page.locator(expected).waitFor({ state: 'visible', timeout: 5000 });
          return;
        } catch {
          if (!(await start.isVisible())) throw new Error(`소개 화면은 닫혔지만 ${expected} 화면이 나타나지 않았다`);
          await page.waitForTimeout(250);
        }
      }
      throw new Error(`소개 화면 시작 단추를 눌러도 ${expected} 화면으로 전환되지 않았다`);
    };
    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => window.localStorage.clear());

    await check('첫 소개 화면이 목적·공식 캐릭터·기관·큰 시작 단추를 보여 주고 PC 기본정보로 이어진다 (설계서 v1.9 §10)', async () => {
      await page.waitForSelector('.k-welcome');
      assert((await page.locator('.k-app').count()) === 0, '소개 전에 편집 앱이 실행됐다');
      assert((await page.locator('.k-welcome h1').innerText()).includes('우리집\n대피지도 그리기'), '소개 제목이 없다');
      const purpose = await page.locator('.k-welcome-purpose').innerText();
      assert(purpose.includes('화재') && purpose.includes('신속하게 대피'), `교육 목적이 빠졌다: ${purpose}`);
      assert((await page.locator('.k-welcome-missions li').count()) === 3, '배울 내용 세 가지가 아니다');
      const agency = await page.locator('.k-welcome-agency').innerText();
      assert(agency.includes('인천소방본부'), `기관 표기가 없다: ${agency}`);
      const images = await page.locator('.k-welcome img').evaluateAll((imgs) =>
        imgs.map((img) => ({ alt: img.getAttribute('alt'), loaded: (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0 })),
      );
      assert(images.length >= 2 && images.every((img) => img.loaded), `소개 그림을 못 읽었다: ${JSON.stringify(images)}`);
      assert(images.some((img) => img.alt?.includes('영이, 일구, 웅이')), '공식 캐릭터 대체 글이 없다');
      /* 그림 이야기 (설계서 v2.0 §10) — 3D 없이 SVG 네 장면. 카드와 겹치지 않고, 장면이 바뀌면 카드 단계도 같이 켜진다 */
      assert(((await page.locator('[data-coach="kids-welcome-hero"]').getAttribute('aria-label')) ?? '').includes('대피'), '그림 이야기 대체 글이 없다');
      assert((await page.locator('.k-welcome').getAttribute('data-hero')) === 'story', '첫 화면 배경이 그림 이야기가 아니다');
      assert((await page.locator('.k-welcome canvas').count()) === 0, '첫 화면에 3D 캔버스가 남아 있다');
      const storyBox = await page.locator('.k-story-paper').boundingBox();
      const cardBox = await page.locator('.k-welcome-card').boundingBox();
      assert(Boolean(storyBox && cardBox && storyBox.width > 300 && storyBox.x + storyBox.width <= cardBox.x + 4), `그림 이야기가 작거나 카드와 겹친다: ${JSON.stringify({ storyBox, cardBox })}`);
      await page.waitForSelector('.k-story[data-scene="1"]', { timeout: 5000 });
      assert((await page.locator('.k-story-caption b').innerText()) === '우리 집을 그린다', '첫 장면 자막이 아니다');
      await page.waitForSelector('.k-story[data-scene="2"]', { timeout: 12000 });
      assert((await page.locator('.k-story-caption b').innerText()) === '나가는 길을 그린다', '둘째 장면 자막이 아니다');
      assert((await page.locator('.k-welcome-missions li.on').innerText()).includes('나가는 길'), '장면과 카드 단계가 같은 박자로 켜지지 않는다');
      assert((await page.locator('[data-coach="kids-welcome-dashboard"], [href$="/dashboard/"]').count()) === 0, '소방서-학교 대시보드로 가는 길이 남아 있다 (설계서 v1.18 §2)');
      const installLink = page.locator('[data-coach="kids-welcome-install"]');
      const installLinkBox = await installLink.boundingBox();
      const installLinkHref = await installLink.getAttribute('href');
      const viewport = page.viewportSize();
      assert(Boolean(installLinkHref?.endsWith('/download/')), `첫 화면 설치 안내 주소가 아니다: ${installLinkHref}`);
      assert(Boolean(installLinkBox && viewport && installLinkBox.height >= 48 && installLinkBox.y <= 24 && installLinkBox.x + installLinkBox.width >= viewport.width - 48), `PC에 설치하기가 우측 상단에 있지 않다: ${JSON.stringify(installLinkBox)}`);
      const start = page.locator('[data-coach="kids-welcome-start"]');
      const box = await start.boundingBox();
      assert(box !== null && box.height >= 72 && box.width >= 300, `시작 단추가 작다: ${JSON.stringify(box)}`);
      await continueAfterWelcome('.k-profile');
    });

    await check('이름표는 이름과 학년만 묻고, 채우면 템플릿과 직접 그리기 두 갈래가 뜬다 (설계서 v1.18 §3)', async () => {
      assert((await page.locator('[data-profile]').count()) === 2, '이름·학년 두 입력이 아니다');
      assert((await page.locator('[data-profile="school"], [data-profile="class"]').count()) === 0, '학교·반 입력이 남아 있다');
      assert((await page.locator('[data-profile="grade"] [data-grade]').count()) === 6, '학년 단추가 여섯이 아니다');
      assert((await page.locator('.k-profile-privacy').innerText()).includes('인터넷으로 보내지 않고'), '브라우저 내부 사용 고지가 없다');
      const gradeBoxes = await page.locator('[data-profile="grade"] [data-grade]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
      assert(gradeBoxes.every((h) => h >= 48), `학년 단추가 48px 보다 작다: ${gradeBoxes.join(',')}`);
      await fillProfile();
      await page.waitForSelector('.k-app');
      assert((await page.locator('[data-coach="kids-name-tag"]').innerText()).includes('3학년 안전이'), '상단 이름표가 학년·이름을 보이지 않는다');
      assert((await gradeLabel(page)).includes('쉬움'), '3학년이 쉬움으로 시작하지 않는다');
      assert((await page.locator('[data-coach="kids-dashboard"], .k-top a[href$="/dashboard/"]').count()) === 0, '상단바에 대시보드가 남아 있다');
      await page.waitForSelector('.k-onboard');
      assert((await page.locator('[data-start-path]').count()) === 2, '시작 방법이 템플릿과 직접 그리기 두 가지가 아니다');
      assert((await page.locator('[data-start-path="template"]').count()) === 1, '템플릿 시작이 없다');
      assert((await page.locator('[data-start-path="starter"]').count()) === 1, '직접 그리기가 없다');
      assert((await page.locator('.k-tmpl').count()) === 0, '첫 화면에 많은 평면 카드가 한꺼번에 보인다');
      assert((await page.locator('.k-tabs').count()) === 0, '기본판에 재난 탭이 있다 (FR-2.1 개정)');
      assert((await page.locator('.k-ask input, textarea').count()) === 0, '자유 입력 UI 가 있다 (의견 3)');
    });

    await check('템플릿 시작은 준비된 집을 눈으로 보고 고쳐서 빠르게 시작한다', async () => {
      await page.locator('[data-start-path="template"]').click();
      const cards = page.locator('.k-tmpl');
      assert((await cards.count()) >= 8, `템플릿이 ${(await cards.count())}개뿐이다`);
      const names = await page.locator('.k-tmpl b').allInnerTexts();
      const adult = ['타워형', '복층', '다세대', '원룸', '단독주택'];
      const found = adult.filter((w) => names.some((n) => n.includes(w)));
      assert(found.length === 0, `어른 말이 남았다: ${found.join(', ')}`);
      await page.locator('[data-template="apt_2room"]').click();
      assert((await page.locator('[data-kitchen]').count()) === 3, '주방 형태 선택이 세 가지가 아니다');
      assert((await page.locator('[data-rotation]').count()) === 4, '평면 방향 선택이 네 가지가 아니다');
    });

    await check('트인 주방은 거실·복도 쪽 벽 전체가 실제 통로로 만들어진다 (설계서 v1.6 §11.3)', async () => {
      assert((await page.locator('[data-kitchen="open"]').getAttribute('aria-pressed')) === 'true', '트인 주방이 기본 선택이 아니다');
      assert((await page.locator('.k-customize-preview [data-opening-kind="open_passage"]').count()) === 14, '미리보기에서 공용 바닥 전체가 이어지지 않았다');
      assert((await page.locator('.k-customize-preview [data-plan-hidden="true"]').count()) === 14, '미리보기 공용 경계에 벽 틈 그림이 남았다');
      assert((await page.locator('.k-customize-preview [data-house-shell="true"]').count()) === 1, '미리보기에 하나의 집 외곽선이 없다');
      await page.locator('[data-rotation="90"]').click();
      assert((await page.locator('[data-rotation="90"]').getAttribute('aria-pressed')) === 'true', '회전 선택이 반영되지 않았다');
      await page.locator('[data-rotation="0"]').click();
      await page.locator('[data-coach="kids-plan-start"]').click();
      await page.waitForTimeout(500);
      const rooms = await page.locator('.k-stage [data-kind="room"]').count();
      assert(rooms === 8, `방 두 개 아파트가 안 실렸다 — 방 ${rooms}개`);
      assert((await page.locator('.k-stage [data-opening-kind="open_passage"]').count()) === 14, '도면에서 공용 바닥 전체가 이어지지 않았다');
      assert((await page.locator('.k-stage [data-plan-hidden="true"]').count()) === 14, '도면 공용 경계에 벽 틈 그림이 남았다');
      await page.evaluate(() => window.localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      /* 떠나는 화면이 저장을 다시 쓸 수 있으므로 새 문서에서도 한 번 더 지운다. */
      await page.evaluate(() => window.localStorage.clear());
      await continueAfterWelcome('.k-onboard');
      await page.waitForSelector('.k-onboard');
    });

    await check('직접 그리기 6단계에서 배치·크기를 함께 맞추고 내 위치·만나는 장소를 다시 옮긴다 (설계서 v1.9 §15)', async () => {
      await page.locator('[data-start-path="starter"]').click();
      assert((await page.locator('[data-direct-method]').count()) === 2, '준비된 집 모양과 외곽선 직접 그리기 두 방법이 없다');
      await page.locator('[data-direct-method="draw"]').click();
      const drawBoard = page.locator('[data-shell-draw]');
      const drawBox = await drawBoard.boundingBox();
      assert(Boolean(drawBox), '외곽선 그리기 격자가 없다');
      if (!drawBox) throw new Error('외곽선 그리기 격자가 없다');
      for (const [x, y] of [[2, 2], [20, 2], [20, 14], [2, 14]]) {
        await page.mouse.click(drawBox.x + (x / 24) * drawBox.width, drawBox.y + (y / 16) * drawBox.height);
      }
      assert((await page.locator('.k-shell-draw-board .draw-point').count()) === 4, '외곽 꼭짓점 네 곳이 찍히지 않았다');
      await page.locator('.k-onboard-back').click();
      await page.locator('[data-direct-method="shape"]').click();
      assert((await page.locator('[data-shell]').count()) === 8, '다양한 집 외곽 8가지가 보이지 않는다');
      await page.locator('[data-shell="wide"]').click();
      assert((await page.locator('.k-shell-preview [data-kind="room"]').count()) >= 1, '집 외곽의 열린 바닥 미리보기가 없다');
      assert((await page.locator('.k-shell-preview [data-wall-mode="closed"]').count()) === 0, '집 모양 단계에서 방이 미리 배치됐다');
      await page.locator('[data-shell-plan-start]').click();
      await page.waitForTimeout(750);
      assert((await page.locator('.k-onboard').count()) === 0, '안내가 안 닫혔다');
      /* 처음 들어오면 화면의 자리를 비춰 주는 안내가 뜬다 (설계서 v2.0 §9) — 다음·건너뛰기·다시 보기 */
      const tour = page.locator('[data-coach="kids-tour"]');
      assert((await tour.count()) === 1, '처음 안내 투어가 뜨지 않았다');
      assert((await tour.getAttribute('data-tour-step')) === '1', '투어가 1번부터 시작하지 않는다');
      await page.locator('[data-coach="kids-tour-next"]').click();
      await page.waitForTimeout(150);
      assert((await tour.getAttribute('data-tour-step')) === '2', '「다음」이 다음 안내로 가지 않는다');
      await page.locator('[data-coach="kids-tour-skip"]').click();
      await page.waitForTimeout(150);
      assert((await tour.count()) === 0, '「그냥 해 볼래」로 투어가 걷히지 않는다');
      await page.locator('[data-coach="kids-settings"]').click();
      await page.locator('[data-coach="kids-tour-again"]').click();
      await page.waitForTimeout(150);
      assert((await tour.count()) === 1, '설정의 「처음 안내 다시 보기」가 투어를 띄우지 않는다');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      assert((await tour.count()) === 0, 'Esc 로 투어가 닫히지 않는다');
      /* 로고를 누르면 첫 화면으로, 다시 시작하면 그리던 지도가 그대로다 */
      const blocksBeforeHome = (await kidsSave(page)).blocks;
      await page.locator('.k-top [data-coach="kids-home"]').click();
      await page.waitForSelector('.k-welcome');
      await page.locator('[data-coach="kids-welcome-start"]').click();
      await page.waitForSelector('.k-profile');
      assert((await page.locator('.k-profile [data-coach="kids-home"]').count()) === 1, '이름표 화면에 첫 화면으로 가는 단추가 없다');
      await page.locator('[data-coach="kids-profile-start"]').click();
      await page.waitForSelector('.k-app');
      await page.waitForTimeout(400);
      assert((await kidsSave(page)).blocks === blocksBeforeHome, '첫 화면에 다녀오니 그리던 지도가 달라졌다');
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'spaces', '집 모양 뒤 실·문·창 단계가 아니다');
      assert((await page.locator('.k-build-steps li').count()) === 6, '여섯 단계 만들기 순서가 보이지 않는다');
      assert((await page.locator('.k-stage [data-kind="furniture"], .k-stage [data-kind="safety"], .k-stage [data-kind="hazard"], .k-stage [data-kind="marker"]').count()) === 0, '구조 단계 전에 가구나 표시가 놓여 있다');
      assert((await page.locator('[data-palette-group]').count()) === 2, '실·문·창 단계의 방·문 팔레트가 아니다');
      assert((await page.locator('[data-block-id="kitchen_open"]').count()) === 1, '트인 주방 칸이 팔레트에 없다');
      /* 욕실·현관·발코니·트인 주방은 팔레트에서 바로 고른다 (설계서 v2.0 §11 — 막대의 빠른 추가는 겹쳐서 없앴다) */
      assert((await page.locator('[data-block-id="kitchen_open"]').innerText()).includes('트인 주방'), '트인 주방 표기가 빠졌다');
      for (const quick of [
        { id: 'bath', label: '욕실', x: 10, y: 3 },
        { id: 'entry', label: '현관', x: 16, y: 3 },
        { id: 'balcony', label: '발코니', x: 10, y: 10 },
      ] as const) {
        const button = page.locator(`[data-coach="kids-palette"] [data-block-id="${quick.id}"]`);
        await button.scrollIntoViewIfNeeded();
        await button.click();
        assert((await button.getAttribute('aria-pressed')) === 'true', `${quick.label} 바로 추가 단추가 선택되지 않았다`);
        assert((await page.locator('.k-build-copy').innerText()).includes('도면의 빈 곳을 눌러'), `${quick.label}을 어디에 놓는지 안내하지 않는다`);
        const point = await planPoint(page, await kidsPlan(page), quick.x, quick.y);
        await page.mouse.click(point.x, point.y);
        await page.waitForTimeout(800);
        const placedPlan = await kidsPlan(page);
        const placedRoom = placedPlan.blocks.find((block) => block.kind === 'room' && block.roomKind === quick.id && block.wallMode !== 'zone');
        assert(Boolean(placedRoom), `${quick.label}이 벽 있는 공간으로 놓이지 않았다`);
        assert((await button.getAttribute('aria-pressed')) === 'false', `${quick.label}을 한 번 놓은 뒤 추가 도구가 해제되지 않았다`);
        if (quick.id === 'entry' && placedRoom?.rect) {
          await page.locator(`.k-stage [data-block="${placedRoom.id}"]`).click();
          assert((await page.locator('[data-room-size-controls]').count()) === 0, '현관을 고르면 상단에 방 크기 조절부가 나타난다');
          assert((await page.locator('[data-handle]').count()) === 8, '현관을 골라도 도면에 8방향 크기 손잡이가 보이지 않는다');
        }
      }
      const kitchenButton = page.locator('[data-block-id="kitchen_open"]');
      await kitchenButton.scrollIntoViewIfNeeded();
      await kitchenButton.click();
      assert((await kitchenButton.getAttribute('aria-pressed')) === 'true', '트인 주방 단추가 선택되지 않았다');
      assert((await page.locator('.k-build-copy').innerText()).includes('끌어 주방(부엌) 크기'), '트인 주방(부엌) 범위를 그리는 방법을 안내하지 않는다');
      const kitchenPlan = await kidsPlan(page);
      await dragPlanCells(page, kitchenPlan, { x: 17, y: 8 }, { x: 20, y: 12 });
      await page.waitForTimeout(800);
      const zonedPlan = await kidsPlan(page);
      const kitchenZones = zonedPlan.blocks.filter((block) => block.kind === 'room' && block.roomKind === 'kitchen' && block.wallMode === 'zone' && block.rect);
      assert(kitchenZones.length >= 1, '트인 주방 범위를 그려도 주방 구역이 생기지 않았다');
      assert(zonedPlan.blocks.some((block) => block.openingKind === 'open_passage' && (block as BrowserBlock & { hideInPlan?: boolean }).hideInPlan), '트인 주방과 거실 사이 열린 통로가 없다');
      assert((await kitchenButton.getAttribute('aria-pressed')) === 'false', '트인 주방을 만든 뒤 도구가 풀리지 않았다');
      const closedKitchenButton = page.locator('[data-block-id="kitchen"]');
      assert((await closedKitchenButton.count()) === 1 && (await closedKitchenButton.innerText()).includes('주방(부엌)'), '벽 있는 독립 주방을 놓는 왼쪽 주방(부엌) 도구가 없다');
      const kitchenZoneId = kitchenZones[0].id;
      await page.locator(`.k-stage [data-block="${kitchenZoneId}"]`).click();
      const deleteZone = page.locator('[data-delete-selected]');
      assert(
        (await deleteZone.innerText()).includes('삭제하기')
          && (await deleteZone.getAttribute('aria-label')) === '공간 용도 삭제하기',
        '트인 공간을 고른 뒤 화면 삭제 단추가 없다',
      );
      await deleteZone.click();
      await page.waitForTimeout(700);
      const clearedKitchenPlan = await kidsPlan(page);
      assert(!clearedKitchenPlan.blocks.some((block) => block.kind === 'room' && block.roomKind === 'kitchen' && block.wallMode === 'zone'), '화면 삭제 단추로 트인 주방 용도가 지워지지 않았다');
      assert(clearedKitchenPlan.blocks.some((block) => block.kind === 'room' && block.roomKind === 'living' && block.wallMode === 'zone'), '트인 주방 삭제 뒤 거실 바닥이 남지 않았다');
      await kitchenButton.click();
      await dragPlanCells(page, await kidsPlan(page), { x: 17, y: 8 }, { x: 20, y: 12 });
      await page.waitForTimeout(700);
      assert((await kidsPlan(page)).blocks.some((block) => block.kind === 'room' && block.roomKind === 'kitchen' && block.wallMode === 'zone'), '삭제한 트인 주방을 다시 만들지 못했다');
      const emptyPlan = await kidsPlan(page);
      const roomCell = await planPoint(page, emptyPlan, 4, 4);
      await page.locator('[data-block-id="bedroom"]').click();
      await page.mouse.click(roomCell.x, roomCell.y);
      await page.waitForTimeout(750);
      const roomPlan = await kidsPlan(page);
      const newBedroom = roomPlan.blocks.find((block) => block.kind === 'room' && block.roomKind === 'bedroom' && block.wallMode !== 'zone' && block.rect);
      assert(Boolean(newBedroom?.rect), '빈 외곽에 침실을 놓지 못했다');
      await page.locator('.k-stage [data-wall-mode="closed"]').first().click();
      assert((await page.locator('[data-room-kind]').count()) === 7, '침실·욕실·현관·옷방·기타실을 고르는 단추가 없다');
      await page.locator('.k-stage [data-wall-mode="zone"]').first().click();
      assert((await page.locator('[data-zone-kind]').count()) === 5, '열린 공간 용도를 고르는 단추가 없다');

      const bedroomElement = page.locator(`.k-stage [data-block="${newBedroom?.id}"]`);
      const bedroomBox = await bedroomElement.boundingBox();
      assert(Boolean(bedroomBox), '침실 벽을 찾지 못했다');
      if (!bedroomBox) throw new Error('침실 벽을 찾지 못했다');
      await page.locator('[data-block-id="sliding_window"]').scrollIntoViewIfNeeded();
      await page.locator('[data-block-id="sliding_window"]').click();
      await page.mouse.click(bedroomBox.x + bedroomBox.width * 0.14, bedroomBox.y + 2);
      await page.waitForTimeout(700);
      assert((await page.locator('.k-stage [data-opening-kind="sliding_window"]').count()) === 1, '미닫이창이 놓이지 않았다');
      await page.locator('.k-stage [data-opening-kind="sliding_window"]').click();
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'spaces', '문·창 너비를 바꾸려고 별도 단계로 이동했다');
      assert((await page.locator('[data-opening-resize]').count()) === 2, '미닫이창을 고른 뒤 길이 줄이기·늘리기 단추가 없다');
      assert((await page.locator('[data-opening-length]').innerText()).includes('1칸'), '미닫이창의 현재 길이가 보이지 않는다');
      assert(await page.locator('[data-opening-resize="decrease"]').isDisabled(), '1칸 미닫이창에서 줄이기 단추가 켜져 있다');
      await page.locator('[data-opening-resize="increase"]').click();
      await page.locator('[data-opening-resize="increase"]').click();
      await page.waitForTimeout(700);
      const widePlan = await kidsPlan(page);
      assert(widePlan.blocks.some((block) => block.openingKind === 'sliding_window' && (block as BrowserBlock & { span?: number }).span === 3), '미닫이창이 늘리기 단추로 3칸 길이가 되지 않았다');
      await page.locator('[data-opening-resize="decrease"]').click();
      await page.waitForTimeout(750);
      assert((await kidsPlan(page)).blocks.some((block) => block.openingKind === 'sliding_window' && (block as BrowserBlock & { span?: number }).span === 2), '미닫이창이 줄이기 단추로 2칸 길이가 되지 않았다');
      /* 끝 손잡이를 벽을 따라 끌어도 너비가 바뀐다 — 방처럼 직접 늘린다 */
      const grip = page.locator('[data-opening-grip]');
      assert((await grip.count()) === 1, '고른 미닫이창에 끝 손잡이가 없다');
      const gripBox = await grip.boundingBox();
      if (!gripBox) throw new Error('미닫이창 끝 손잡이가 보이지 않는다');
      const cellPx = bedroomBox.width / (newBedroom?.rect?.w ?? 1);
      const gx = gripBox.x + gripBox.width / 2;
      const gy = gripBox.y + gripBox.height / 2;
      await page.mouse.move(gx, gy);
      await page.mouse.down();
      await page.mouse.move(gx + cellPx * 0.25, gy, { steps: 3 });
      await page.mouse.move(gx + cellPx * 0.5, gy, { steps: 3 });
      await page.mouse.up();
      await page.waitForTimeout(700);
      assert((await kidsPlan(page)).blocks.some((block) => block.openingKind === 'sliding_window' && (block as BrowserBlock & { span?: number }).span === 3), '미닫이창 끝 손잡이를 끌어도 3칸이 되지 않았다');
      await page.locator('[data-delete-selected]').click();
      await page.waitForTimeout(500);
      assert((await page.locator('.k-stage [data-opening-kind="sliding_window"]').count()) === 0, '화면 삭제 단추로 미닫이창이 지워지지 않았다');
      await page.locator('[data-block-id="sliding_window"]').click();
      await page.mouse.click(bedroomBox.x + bedroomBox.width * 0.14, bedroomBox.y + 2);
      await page.waitForTimeout(500);
      await page.locator('.k-stage [data-opening-kind="sliding_window"]').click();
      await page.keyboard.press('Delete');
      await page.waitForTimeout(500);
      assert((await page.locator('.k-stage [data-opening-kind="sliding_window"]').count()) === 0, 'Delete 키로 미닫이창이 지워지지 않았다');
      await page.locator(`.k-stage [data-block="${newBedroom?.id}"]`).click();
      assert((await page.locator('[data-handle]').count()) === 8, '실·문·창 단계 안에서 방 크기 손잡이가 보이지 않는다');
      for (const viewport of [
        { width: 900, height: 700 },
        { width: 1024, height: 768 },
        { width: 1440, height: 900 },
        { width: 1920, height: 1080 },
      ]) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(120);
        const layout = await page.evaluate(() => {
          const top = document.querySelector('.k-top')?.getBoundingClientRect();
          const bottom = document.querySelector('.k-bottom')?.getBoundingClientRect();
          const guide = document.querySelector('.k-guide-slot')?.getBoundingClientRect();
          const stage = document.querySelector('svg.k-stage')?.getBoundingClientRect();
          const howTo = document.querySelector('.k-help.collapsed')?.getBoundingClientRect();
          return {
            top: top?.height ?? 0,
            bottom: bottom?.height ?? 0,
            guide: guide?.height ?? 0,
            stageWidth: stage?.width ?? 0,
            stageHeight: stage?.height ?? 0,
            howTo: howTo?.width ?? 0,
            overflow: document.documentElement.scrollWidth - window.innerWidth,
          };
        });
        assert(layout.top <= 61 && layout.bottom <= 61, `${viewport.width}px 고정 막대가 크다: ${JSON.stringify(layout)}`);
        assert(layout.guide <= 93, `${viewport.width}px 캔버스 아래 해설 칸이 크다: ${JSON.stringify(layout)}`);
        assert(layout.howTo <= 61, `${viewport.width}px 접힌 사용법 칸이 크다: ${JSON.stringify(layout)}`);
        assert(layout.stageWidth >= viewport.width * 0.5 && layout.stageHeight >= viewport.height * 0.45, `${viewport.width}px 캔버스가 충분히 크지 않다: ${JSON.stringify(layout)}`);
        assert(layout.overflow <= 1, `${viewport.width}px 편집 화면에 가로 넘침 ${layout.overflow}px가 생겼다`);
      }
      /* 창을 키우면 틀은 그대로이고 도면만 커진다 (설계서 v1.19 §3) */
      const sizes: Record<number, { top: number; bottom: number; palette: number; howTo: number; stage: number; stageH: number }> = {};
      for (const width of [1280, 1920]) {
        await page.setViewportSize({ width, height: width === 1280 ? 800 : 1080 });
        await page.waitForTimeout(150);
        sizes[width] = await page.evaluate(() => ({
          top: document.querySelector('.k-top')?.getBoundingClientRect().height ?? 0,
          bottom: document.querySelector('.k-bottom')?.getBoundingClientRect().height ?? 0,
          palette: document.querySelector('.k-palette')?.getBoundingClientRect().width ?? 0,
          howTo: document.querySelector('.k-help')?.getBoundingClientRect().width ?? 0,
          stage: document.querySelector('svg.k-stage')?.getBoundingClientRect().width ?? 0,
          stageH: document.querySelector('svg.k-stage')?.getBoundingClientRect().height ?? 0,
        }));
      }
      assert(
        sizes[1280].top === sizes[1920].top && sizes[1280].bottom === sizes[1920].bottom && sizes[1280].palette === sizes[1920].palette && sizes[1280].howTo === sizes[1920].howTo,
        `창을 키우니 틀이 같이 커진다: ${JSON.stringify(sizes)}`,
      );
      assert(sizes[1920].stage >= sizes[1280].stage * 1.3 && sizes[1920].stageH >= sizes[1280].stageH * 1.25, `창을 키워도 도면이 그만큼 커지지 않는다: ${JSON.stringify(sizes)}`);
      await page.setViewportSize({ width: 1440, height: 900 });
    });

    await check('도면을 확대·축소·맞춤으로 키우고 Ctrl+휠·키로도 바꾼다, 전체 화면 단추가 있다 (설계서 v1.19 §2.1·§2.2)', async () => {
      const zoomBox = page.locator('[data-coach="kids-zoom"]');
      assert((await zoomBox.locator('button').count()) === 3, '확대 단추 묶음이 셋이 아니다');
      const before = await page.locator('svg.k-stage').boundingBox();
      await zoomBox.locator('[data-zoom="in"]').click();
      await page.waitForTimeout(150);
      const after = await page.locator('svg.k-stage').boundingBox();
      assert(Boolean(before && after && after.width > before.width * 1.2), `확대해도 도면이 커지지 않는다: ${JSON.stringify({ before, after })}`);
      assert((await page.locator('.k-canvas-inner').getAttribute('data-zoom')) === '1.25', '확대 배율이 1.25 가 아니다');
      await zoomBox.locator('[data-zoom="in"]').click();
      await page.waitForTimeout(150);
      const scroll = await page.evaluate(() => {
        const c = document.querySelector('.k-canvas') as HTMLElement;
        return { w: c.scrollWidth - c.clientWidth, h: c.scrollHeight - c.clientHeight };
      });
      assert(scroll.w > 10 || scroll.h > 10, `확대했는데 스크롤이 생기지 않는다: ${JSON.stringify(scroll)}`);
      await zoomBox.locator('[data-zoom="fit"]').click();
      await page.waitForTimeout(150);
      assert((await page.locator('.k-canvas-inner').getAttribute('data-zoom')) === '1', '맞춤이 1배로 돌아오지 않는다');
      const fit = await page.locator('svg.k-stage').boundingBox();
      assert(Boolean(before && fit && Math.abs(fit.width - before.width) < 2), '맞춤 크기가 처음과 다르다');
      /* Ctrl+휠 — 브라우저 확대가 아니라 도면 확대다 */
      const stageBox = await page.locator('svg.k-stage').boundingBox();
      if (!stageBox) throw new Error('도면이 없다');
      await page.mouse.move(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height / 2);
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, -120);
      await page.keyboard.up('Control');
      await page.waitForTimeout(150);
      assert((await page.locator('.k-canvas-inner').getAttribute('data-zoom')) === '1.25', 'Ctrl+휠로 확대되지 않는다');
      await page.keyboard.press('0');
      await page.waitForTimeout(150);
      assert((await page.locator('.k-canvas-inner').getAttribute('data-zoom')) === '1', '0 키로 맞춤이 되지 않는다');
      await page.keyboard.press('+');
      await page.waitForTimeout(150);
      assert((await page.locator('.k-canvas-inner').getAttribute('data-zoom')) === '1.25', '+ 키로 확대되지 않는다');
      await page.keyboard.press('-');
      await page.waitForTimeout(150);
      assert((await page.locator('.k-canvas-inner').getAttribute('data-zoom')) === '1', '- 키로 축소되지 않는다');
      /* 전체 화면 단추 — 헤드리스는 전체 화면을 못 하므로 있고 눌러도 깨지지 않는지만 본다 */
      const fullscreen = page.locator('[data-coach="kids-fullscreen"]');
      if (await fullscreen.count()) {
        const box = await fullscreen.boundingBox();
        assert(Boolean(box && box.height >= 48), '전체 화면 단추가 48px 미만이다');
        await fullscreen.click();
        await page.waitForTimeout(250);
        assert((await page.locator('.k-app').count()) === 1, '전체 화면 단추를 누르니 화면이 깨졌다');
        if (await page.evaluate(() => Boolean(document.fullscreenElement))) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(250);
        }
      }
    });

    await check('실·문·창·크기 다음은 가구 단계이고 가구 크기를 조절한다', async () => {
      await page.locator('[data-build-next]').click();
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'furniture', '실·문·창·크기 다음이 바로 가구 단계가 아니다');
      assert((await page.locator('[data-palette-group]').count()) === 2, '가구 단계에 가구·위험 묶음이 없다');
      /* 가구와 가전이 숨지 않고 전부 보인다 (설계서 v2.0 §2.2) */
      for (const id of ['sofa', 'desk', 'bed', 'fridge', 'tv', 'washing_machine', 'sink']) assert((await page.locator(`[data-block-id="${id}"]`).count()) === 1, `${id} 가 팔레트에 바로 보이지 않는다`);
      assert((await page.locator('[data-block-id="bed"][data-block-category="furniture"]').count()) === 1, '침대가 가구 갈래에 없다');
      assert((await page.locator('[data-block-id="gas_range"][data-block-category="furniture"]').count()) === 1, '가스불이 가구 갈래에 없다');
      const buildPlan = await kidsPlan(page);
      const bedroom = buildPlan.blocks.find((block) => block.kind === 'room' && block.roomKind === 'bedroom' && block.rect);
      assert(Boolean(bedroom?.rect), '침대를 놓을 침실이 없다');
      if (!bedroom?.rect) throw new Error('침실이 없다');
      await page.locator(`.k-stage [data-block="${bedroom.id}"]`).click();
      const roomName = page.locator('[aria-label="고른 공간 이름"]');
      await roomName.fill('창가 방');
      await roomName.press('Enter');
      await page.waitForTimeout(900);
      const namedPlan = await kidsPlan(page);
      assert(namedPlan.blocks.find((block) => block.id === bedroom.id)?.label === '창가 방', '가구 단계에서 방 이름을 바꿀 수 없다');
      const bedGridCell = { x: bedroom.rect.x + 1, y: bedroom.rect.y + 1 };
      const bedCell = await planPoint(page, namedPlan, bedGridCell.x, bedGridCell.y);
      await page.locator('[data-block-id="bed"]').click();
      await page.mouse.click(bedCell.x, bedCell.y);
      await page.waitForTimeout(650);
      assert((await page.locator('.k-stage [data-kind="furniture"]').count()) === 1, '가구 단계에서 침대가 놓이지 않았다');
      const bedElement = page.locator('.k-stage [data-point-kind="bed"]');
      assert((await bedElement.getAttribute('data-point-width')) === '2' && (await bedElement.getAttribute('data-point-height')) === '3', '침대가 2×3칸 비율로 보이지 않는다');
      await bedElement.click();
      assert((await page.locator('[data-furniture-size-controls][data-furniture-kind="bed"]').count()) === 1, '침대를 골라도 가로·세로 크기 조절부가 보이지 않는다');
      await page.locator('[data-size-control="furniture-width-increase"]').click();
      await page.waitForTimeout(650);
      assert((await bedElement.getAttribute('data-point-width')) === '3' && (await bedElement.getAttribute('data-point-height')) === '3', '침대 가로 늘리기 단추가 작동하지 않는다');
      const resizedBed = (await kidsPlan(page)).blocks.find((block) => block.subKind === 'bed');
      assert(resizedBed?.size?.w === 3 && resizedBed.size.h === 3, '바꾼 침대 크기가 저장되지 않았다');
      await page.locator('[data-size-control="furniture-width-decrease"]').click();
      await page.waitForTimeout(650);
      assert((await bedElement.getAttribute('data-point-width')) === '2', '침대 가로 줄이기 단추가 작동하지 않는다');
      const bedBeforeMove = await kidsPlan(page);
      const bedBlock = bedBeforeMove.blocks.find((block) => block.kind === 'furniture' && block.subKind === 'bed');
      assert(Boolean(bedBlock?.cell), '옮길 침대가 저장되지 않았다');
      if (!bedBlock?.cell) throw new Error('옮길 침대가 없다');
      const bedTarget = { x: bedroom.rect.x, y: bedroom.rect.y };
      await dragPlanCells(page, bedBeforeMove, bedBlock.cell, bedTarget);
      await page.waitForTimeout(650);
      const movedBed = (await kidsPlan(page)).blocks.find((block) => block.id === bedBlock.id);
      assert(movedBed?.cell?.x === bedTarget.x && movedBed.cell.y === bedTarget.y, '큰 침대를 잡아 끌어도 이동하지 않는다');

      const sinkPlan = await kidsPlan(page);
      await page.locator('[data-block-id="sink"]').click();
      const sinkCell = await planPoint(page, sinkPlan, 17, 9);
      await page.mouse.click(sinkCell.x, sinkCell.y);
      await page.waitForTimeout(350);
      const sinkElement = page.locator('.k-stage [data-point-kind="sink"]');
      assert((await sinkElement.getAttribute('data-point-width')) === '3' && (await sinkElement.getAttribute('data-point-height')) === '1', '싱크대가 3×1칸 비율로 보이지 않는다');
      await page.locator('[data-build-next]').click();
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'safety', '가구 다음이 소화기 단계가 아니다');
      assert((await page.locator('[data-palette-group]').count()) === 1, '소화기 단계에 안전설비 외 묶음이 보인다');
      assert((await page.locator('[data-block-id="extinguisher"]').count()) === 1, '소화기 단계에 소화기가 없다');
      assert((await page.locator('[data-block-id="detector"]').count()) === 0, '소화기 단계에 관계없는 안전설비가 보인다');
      const safetyPlan = await kidsPlan(page);
      await page.locator('[data-block-id="extinguisher"]').click();
      const extinguisherCell = await planPoint(page, safetyPlan, bedGridCell.x, bedGridCell.y + 1);
      await page.mouse.click(extinguisherCell.x, extinguisherCell.y);
      assert((await page.locator('.k-safety-check.done').count()) === 1, '소화기 위치를 놓아도 안전 확인에 반영되지 않았다');
      await page.locator('[data-build-next]').click();
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'mySpot', '소화기 다음이 내 방 단계가 아니다');
      const bubble = await page.locator('.k-bubble').innerText();
      assert(bubble.includes('네 방') || bubble.includes('자는 방'), `캐릭터 안내: ${bubble.slice(0, 40)}`);
      const beforeVoice = await page.evaluate(() => ({ ...(window as unknown as { __soundProbe: Record<string, number> }).__soundProbe }));
      const voiceResponsesBefore = appVoiceResponses.length;
      let afterVoice = beforeVoice;
      for (let attempt = 0; attempt < 3 && afterVoice.voicePlayCalls <= beforeVoice.voicePlayCalls; attempt += 1) {
        await page.locator('[data-coach="kids-voice-replay"]').click();
        await page.waitForTimeout(900);
        afterVoice = await page.evaluate(() => ({ ...(window as unknown as { __soundProbe: Record<string, number> }).__soundProbe }));
      }
      assert(afterVoice.voicePlayCalls > beforeVoice.voicePlayCalls, '다시 듣기를 눌러도 MP3 play()를 부르지 않았다');
      assert(afterVoice.voicePlayResolves > beforeVoice.voicePlayResolves, 'MP3 play() Promise가 성공하지 않았다');
      assert(afterVoice.voicePlaying > beforeVoice.voicePlaying, 'MP3가 실제 playing 상태가 되지 않았다');
      assert(afterVoice.voiceErrors === beforeVoice.voiceErrors, 'MP3 재생 중 오류가 났다');
      assert(appVoiceResponses.length > voiceResponsesBefore, '다시 듣기가 MP3 파일을 새로 요청하지 않았다');
      await page.mouse.click(bedCell.x, bedCell.y); // 침대와 같은 칸에 내 위치를 놓아 정확한 겹침 선택도 검사한다
      await page.waitForTimeout(300);
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'meeting', '만나는 곳 단계가 아니다');
      const outside = await kidsCell(page, 0, 0);
      await page.mouse.click(outside.x, outside.y);
      await page.waitForTimeout(300);
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'ready', '같이 모일 곳 뒤 준비 단계가 아니다');

      await page.waitForTimeout(750);
      const beforeMove = await kidsPlan(page);
      const spot = beforeMove.blocks.find((block) => block.kind === 'marker' && block.subKind === 'my_spot');
      const meeting = beforeMove.blocks.find((block) => block.kind === 'marker' && block.subKind === 'meeting_point');
      assert(Boolean(spot?.cell && meeting?.cell), '내 위치와 만나는 장소가 저장되지 않았다');
      if (!spot?.cell || !meeting?.cell) throw new Error('옮길 표시가 없다');
      const spotRoom = beforeMove.blocks.find((block) => block.kind === 'room' && block.rect && spot.cell!.x >= block.rect.x && spot.cell!.x < block.rect.x + block.rect.w && spot.cell!.y >= block.rect.y && spot.cell!.y < block.rect.y + block.rect.h);
      const spotTarget = spotRoom?.rect
        ? [
            { x: spot.cell.x + 1, y: spot.cell.y }, { x: spot.cell.x - 1, y: spot.cell.y },
            { x: spot.cell.x, y: spot.cell.y + 1 }, { x: spot.cell.x, y: spot.cell.y - 1 },
          ].find((cell) => cell.x >= spotRoom.rect!.x && cell.x < spotRoom.rect!.x + spotRoom.rect!.w && cell.y >= spotRoom.rect!.y && cell.y < spotRoom.rect!.y + spotRoom.rect!.h)
        : undefined;
      assert(Boolean(spotTarget), '내 위치를 옮길 같은 방의 이웃 칸이 없다');
      if (!spotTarget) throw new Error('내 위치 목표 칸이 없다');
      await dragPlanCells(page, beforeMove, spot.cell, spotTarget);
      await page.waitForTimeout(750);
      const afterSpot = await kidsPlan(page);
      const movedSpot = afterSpot.blocks.find((block) => block.id === spot.id);
      assert(movedSpot?.cell?.x === spotTarget.x && movedSpot.cell.y === spotTarget.y, '침대와 겹친 내 위치를 끌어도 이동하지 않았다');

      const meetingTarget = { x: meeting.cell.x + 1, y: meeting.cell.y };
      await dragPlanCells(page, afterSpot, meeting.cell, meetingTarget);
      await page.waitForTimeout(750);
      const afterMeeting = await kidsPlan(page);
      const movedMeeting = afterMeeting.blocks.find((block) => block.id === meeting.id);
      assert(movedMeeting?.cell?.x === meetingTarget.x && movedMeeting.cell.y === meetingTarget.y, '만나는 장소를 끌어도 이동하지 않았다');

      await page.locator('[data-coach="kids-start-game"]').click();
      const startAnyway = page.locator('[data-coach="kids-start-anyway"]');
      if (await startAnyway.isVisible({ timeout: 1500 }).catch(() => false)) await startAnyway.click();
      await page.waitForSelector('.k-game');
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'game', '게임이 시작되지 않았다');
      const rooms = await page.locator('.k-stage [data-kind="room"]').count();
      assert(rooms >= 2, `방 ${rooms}개`);
      assert((await page.locator('.k-game-missions [data-mission]').count()) === 4, '안전 행동 미션이 네 가지가 아니다');
      assert((await page.locator('.k-game-difficulty').getAttribute('data-difficulty')) === 'guided', '첫 연습이 차근차근 단계가 아니다');
      assert((await page.locator('.k-game-missions [data-target="true"]').count()) === 2, '첫 연습 목표가 두 가지가 아니다');
      assert((await page.locator('[data-mission="crouch"]').getAttribute('data-done')) === 'false', '시작 전에 몸 낮추기가 끝나 있다');
    });

    await check('게임 — 연습 모드 기본, 위험장이 그려지고, 움직이고, 그만두면 리포트가 나온다', async () => {
      const top = await page.locator('.k-game-top').innerText();
      assert(top.includes('연습'), `연습 모드가 아니다: ${top}`);
      await page.waitForTimeout(700);
      assert((await page.locator('.k-stage [data-game-layer]').count()) === 1, '게임 층이 없다');
      assert((await page.locator('.k-stage [data-player]').count()) === 1, '플레이어가 없다');
      assert((await page.locator('.k-stage [data-point-kind="my_spot"]').count()) === 0, '게임에서 고정 내 위치와 움직이는 플레이어가 함께 보여 두 명이다');
      const before = await page.locator('.k-stage [data-player]').getAttribute('transform');
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(150);
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(150);
      const after = await page.locator('.k-stage [data-player]').getAttribute('transform');
      assert(before !== after, '플레이어가 움직이지 않았다');
      await page.locator('[data-coach="kids-posture"]').click();
      const chip = await page.locator('.k-posture-chip').getAttribute('data-posture');
      assert(chip === 'crouch', `자세 ${chip}`);
      assert((await page.locator('[data-mission="crouch"]').getAttribute('data-done')) === 'true', '몸을 낮춰도 안전 미션에 반영되지 않는다');
      assert(!/점수|등급|순위/.test(await page.locator('.k-game').innerText()), '2D 안전 미션에 점수·등급이 있다');
      await page.locator('[data-coach="kids-quit"]').click();
      await page.waitForSelector('.k-report-view');
      const good = await page.locator('.k-report-col.good li').count();
      const fix = await page.locator('.k-report-col.fix li').count();
      assert(good >= 1, `잘한 점 ${good}개 (FR-10.3)`);
      assert(fix <= 3, `고칠 점 ${fix}개 (FR-10.4)`);
      const cols = await page.locator('.k-report-col').allInnerTexts();
      assert(cols[0].includes('잘한 점'), '잘한 점이 먼저 오지 않는다 (FR-10.5)');
      assert(!/점수|등급|순위/.test(await page.locator('.k-report-view').innerText()), '점수·등급이 있다 (FR-10.10)');
      assert((await page.locator('.k-report-reward .k-great-stamp').count()) >= 1, '결과 화면에 참 잘했어요 도장이 없다');
      assert((await page.locator('.k-report-reward').getAttribute('data-new-stamp')) === 'true', '첫 연습의 새 주간 도장이 기록되지 않았다');
      assert((await page.locator('.k-report-reward [data-badge][data-earned="true"]').count()) >= 1, '첫 연습 안전 배지가 보이지 않는다');
      await page.locator('[data-coach="kids-report-notebook"]').click();
      await page.waitForSelector('[data-coach="kids-safety-notebook"]');
      const notebook = page.locator('[data-coach="kids-safety-notebook"]');
      assert((await notebook.locator('.k-stamp-calendar [data-week]').count()) === 4, '4주 안전 약속표가 네 칸이 아니다');
      assert((await notebook.locator('.k-stamp-calendar [data-stamped="true"]').count()) === 1, '첫 주 도장이 일정표에 없다');
      assert((await notebook.locator('.k-badge-shelf:not(.compact) [data-badge]').count()) === 8, '안전 배지 도감이 여덟 칸이 아니다');
      assert(!/점수|등급|순위/.test(await notebook.innerText()), '안전 수첩에 경쟁 표현이 있다');
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-coach="kids-safety-notebook"]', { state: 'detached' });
      await page.waitForTimeout(300);
      const save = await kidsSave(page);
      assert(save.attempts === 1, `시도 기록 ${save.attempts}`);
      assert(save.schemaVersion === 4 && save.badges >= 2 && save.stampWeeks === 1 && save.practiceRecords === 1, `반복 연습 저장 v${save.schemaVersion}, 배지 ${save.badges}, 도장 ${save.stampWeeks}, 기록 ${save.practiceRecords}`);
    });

    await check('리포트 — [왜?] 는 자리에서 펼쳐지고, 지도 고치기는 편집으로 돌아간다', async () => {
      const why = page.locator('.k-report-view .k-link', { hasText: '왜?' });
      if ((await why.count()) > 0) {
        await why.first().click();
        await page.waitForTimeout(150);
        assert((await page.locator('.k-report-view .k-card-open').count()) === 1, '카드가 안 펼쳐졌다');
        assert((await page.locator('.k-report-view').count()) === 1, '화면이 바뀌었다');
      }
      await page.locator('[data-coach="kids-edit-plan"]').click();
      await page.waitForSelector('.k-palette');
      await page.waitForTimeout(200);
      assert((await page.locator('.k-report-view').count()) === 0, '리포트가 남아 있다');
      assert((await page.locator('svg.k-stage').count()) === 1, '도면이 없다');
    });

    await check('사용법에는 판 번호와 PC에 설치하기가 있고, 대시보드 페이지는 더 이상 없다 (설계서 v1.18 §2·§7)', async () => {
      await page.locator('[data-coach="kids-usage"]').click();
      const help = page.locator('.k-modal', { hasText: '사용법' }).or(page.locator('.k-modal', { hasText: '이렇게 하면 돼' }));
      await help.first().waitFor({ state: 'visible' });
      const version = await page.locator('[data-coach="kids-version"]').innerText();
      assert(/\d+\.\d+\.\d+/.test(version), `판 번호가 없다: ${version}`);
      const installHelp = page.locator('[data-coach="kids-help-install"]');
      assert((await installHelp.getAttribute('href'))?.endsWith('/download/') === true, '사용법의 설치 안내 주소가 아니다');
      const installHelpBox = await installHelp.boundingBox();
      assert(Boolean(installHelpBox && installHelpBox.height >= 48), '사용법의 설치 단추가 48px 보다 작다');
      assert(!/학교|반\b/.test(await help.first().innerText()), '사용법에 학교·반 문구가 남아 있다');
      await page.keyboard.press('Escape');
      await help.first().waitFor({ state: 'detached' });
      const gone = await page.request.get(new URL('dashboard/', page.url()).href);
      assert(gone.status() === 404, `/dashboard/ 가 아직 응답한다: ${gone.status()}`);

      /* 이하 공통 편집·경로·성공 리플레이 회귀 검사는 좌표가 고정된 방 두 개 템플릿에서 한다. */
      await page.locator('[data-coach="kids-settings"]').click();
      await page.locator('[data-coach="kids-template"]').click();
      await page.locator('[data-start-path="template"]').click();
      await page.locator('[data-template="apt_2room"]').click();
      await page.locator('[data-kitchen="closed"]').click();
      await page.locator('[data-coach="kids-plan-start"]').click();
      await page.waitForTimeout(800);
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'edit', '회귀 검사용 템플릿이 편집 단계로 열리지 않았다');
    });

    await check('팔레트에 전부 보이고 — 클릭 두 번으로 표준 크기 방이 놓이고, 겹치면 거부된다 (FR-7.1 · FR-7.6 · v2.0 §2.2)', async () => {
      const tiles = await page.locator('[data-coach="kids-palette"] [data-block-id]').count();
      assert(tiles >= 50, `팔레트 칸이 ${tiles}개뿐이다 — 더보기 없이 전부 보여야 한다`);
      assert((await page.locator('[data-block-id="more"]').count()) === 0, '더보기 단추가 남아 있다');
      assert((await page.locator('[data-palette-group]').count()) === 6, '묶음이 여섯이 아니다');
      const beforePlan = await kidsPlan(page);
      const before = (await kidsSave(page)).blocks;
      let insertRect: BrowserRect | null = null;
      for (let y = 0; y <= beforePlan.grid.height - 4 && !insertRect; y += 1) {
        for (let x = 0; x <= beforePlan.grid.width - 4; x += 1) {
          const candidate = { x, y, w: 4, h: 4 };
          if (validShellInsertRect(beforePlan, candidate)) {
            insertRect = candidate;
            break;
          }
        }
      }
      assert(Boolean(insertRect), '새 방을 놓을 수 있는 공용 바닥 자리가 없다');
      if (!insertRect) throw new Error('새 방 자리가 없다');
      await page.locator('[data-block-id="bedroom"]').click(); // 1
      const empty = await planPoint(page, beforePlan, insertRect.x, insertRect.y);
      await page.mouse.click(empty.x, empty.y); // 2 — 빈 곳
      await page.waitForTimeout(800);
      const afterPlan = await kidsPlan(page);
      const oldIds = new Set(beforePlan.blocks.map((block) => block.id));
      const newRoom = afterPlan.blocks.find((block) => block.kind === 'room' && block.wallMode !== 'zone' && !oldIds.has(block.id));
      assert(Boolean(newRoom?.rect), `방이 안 놓였다 ${before} → ${(await kidsSave(page)).blocks}`);
      if (!newRoom?.rect) throw new Error('새 방이 없다');
      const after = (await kidsSave(page)).blocks;
      assert((await page.locator('[data-door-candidate]').count()) === 0, '없앤 문 후보가 도면에 나타났다');
      const doorlessBubble = await page.locator('.k-bubble').innerText();
      assert(doorlessBubble.includes('문이 하나도 없는 방'), `문 없는 방 해설이 나오지 않았다: ${doorlessBubble.slice(0, 60)}`);
      assert((await page.locator('[data-block-id="door"]').getAttribute('class'))?.includes('k-hl') === true, '해설이 문 도구를 가리키지 않는다');
      assert((await page.locator('.k-stage .kids-hl').count()) >= 1, '문 없는 방을 도면에서 강조하지 않는다');
      /* 하나 놓으면 팔레트에서 손을 뗀다 — 도면을 누를 때마다 계속 놓이지 않는다 (설계서 v1.5 §4) */
      assert((await page.locator('[data-block-id="bedroom"]').getAttribute('aria-pressed')) !== 'true', '놓은 뒤에도 장전이 남아 있다');

      /* 캐릭터가 가리킨 문을 골라 벽을 누르면 문이 놓이고 누락 강조가 사라진다 */
      await page.locator('[data-block-id="door"]').click();
      const newRoomRect = page.locator(`.k-stage [data-block="${newRoom.id}"] rect[data-wall-mode]`);
      const newRoomBox = await newRoomRect.boundingBox();
      assert(Boolean(newRoomBox), '새 방의 벽을 찾지 못했다');
      if (!newRoomBox) throw new Error('새 방 벽이 없다');
      await page.mouse.click(newRoomBox.x + newRoomBox.width / (2 * newRoom.rect.w), newRoomBox.y);
      await page.waitForTimeout(800);
      assert((await kidsSave(page)).blocks === after + 1, '팔레트에서 고른 문이 놓이지 않았다');
      assert((await page.locator('[data-block-id="door"]').getAttribute('class'))?.includes('k-hl') !== true, '문을 놓은 뒤에도 누락 강조가 남았다');
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(500);

      /* 다시 골라야 또 놓인다. 이번엔 겹치는 곳이라 거부 */
      await page.locator('[data-block-id="bedroom"]').click();
      const overlap = await planPoint(page, afterPlan, newRoom.rect.x, newRoom.rect.y);
      await page.mouse.click(overlap.x, overlap.y);
      await page.waitForTimeout(800);
      assert((await kidsSave(page)).blocks === after, '겹치는 방을 받아 줬다');
      const toast = await page.locator('.k-toast').innerText().catch(() => '');
      assert(toast.includes('겹') || toast.includes('닫힌 방'), `안내 없음: ${toast}`);
      // 문 없는 방을 남겨 두면 뒤에서 "갇히는 방" 지적이 정당하게 잡힌다 — 되돌려 둔다
      await page.locator('[data-coach="kids-tool-select"]').click();
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(800);
      assert((await kidsSave(page)).blocks === before, '되돌리기가 안 됐다');
    });

    await check('방문 — 여닫이문과 미닫이문을 나란히 고르고, 미닫이문도 열고 닫는다', async () => {
      const hinged = page.locator('[data-block-id="door"]');
      const sliding = page.locator('[data-block-id="sliding_door"]');
      assert((await hinged.innerText()).includes('여닫이문'), '여닫이문 선택지가 없다');
      assert((await sliding.innerText()).includes('미닫이문'), '미닫이문 선택지가 없다');
      assert(Boolean((await sliding.getAttribute('title'))?.includes('옆으로 미는')), '어린이용 미닫이문 설명이 없다');
      const positions = await Promise.all([hinged, sliding].map(async (button) => (await button.boundingBox())?.y ?? -1));
      assert(Math.abs(positions[0] - positions[1]) < 4, `두 방문이 나란히 있지 않다: ${positions.join(', ')}`);

      const originalDoor = page.locator('.k-stage [data-opening-kind="door"]').first();
      const originalBox = await originalDoor.boundingBox();
      if (!originalBox) throw new Error('바꿀 여닫이문이 없다');
      await sliding.click();
      await page.mouse.click(originalBox.x + originalBox.width / 2, originalBox.y + originalBox.height / 2);
      await page.waitForTimeout(500);
      const placed = page.locator('.k-stage [data-opening-kind="sliding_door"]').first();
      assert((await placed.count()) === 1, '미닫이문이 벽에 놓이지 않았다');
      assert((await placed.getAttribute('data-opening-state')) === 'closed', '놓은 미닫이문의 기본 상태가 닫힘이 아니다');

      await page.locator('[data-coach="kids-tool-select"]').click();
      const placedBox = await placed.boundingBox();
      if (!placedBox) throw new Error('놓은 미닫이문 위치를 찾지 못했다');
      await page.mouse.click(placedBox.x + placedBox.width / 2, placedBox.y + placedBox.height / 2);
      await page.waitForTimeout(250);
      assert((await placed.getAttribute('data-opening-state')) === 'closed', '미닫이문을 고르기만 했는데 평소 상태가 바뀌었다');
      const lengthLabel = page.locator('.k-opening-length > span');
      if ((await lengthLabel.count()) === 0) {
        const debug = await page.evaluate(({ x, y }) => {
          const hit = document.elementFromPoint(x, y);
          const block = hit?.closest?.('[data-block]');
          return {
            step: document.querySelector('.k-app')?.getAttribute('data-step'),
            tool: document.querySelector('.k-canvas')?.getAttribute('data-tool'),
            hit: hit?.tagName,
            hitBlock: block?.getAttribute('data-block'),
            selectedOpenings: document.querySelectorAll('.k-stage [data-kind="opening"] rect[stroke="#0f3d68"]').length,
          };
        }, { x: placedBox.x + placedBox.width / 2, y: placedBox.y + placedBox.height / 2 });
        throw new Error(`일반 편집에서도 미닫이문 길이 조절기가 보이지 않는다: ${JSON.stringify(debug)}`);
      }
      assert((await lengthLabel.innerText()).includes('미닫이문 길이'), '일반 편집에서도 미닫이문 길이 조절기가 보이지 않는다');
      assert((await page.locator('[data-opening-resize]').count()) === 2, '미닫이문 길이 줄이기·늘리기 단추가 없다');
      assert((await page.locator('[data-delete-selected]').count()) === 1, '일반 편집에서 선택한 미닫이문 삭제 단추가 없다');
      const beforeMovePlan = await kidsPlan(page);
      const placedId = await placed.getAttribute('data-block');
      const beforeOpening = beforeMovePlan.blocks.find((block) => block.id === placedId);
      assert(Boolean(beforeOpening?.cell && beforeOpening.side), '옮길 미닫이문 좌표가 없다');
      if (!beforeOpening?.cell || !beforeOpening.side) throw new Error('옮길 미닫이문 좌표가 없다');
      const stageBox = await page.locator('svg.k-stage').boundingBox();
      assert(Boolean(stageBox), '문 이동용 도면이 없다');
      if (!stageBox) throw new Error('문 이동용 도면이 없다');
      const oneX = stageBox.width / beforeMovePlan.grid.width;
      const oneY = stageBox.height / beforeMovePlan.grid.height;
      const horizontalWall = beforeOpening.side === 'N' || beforeOpening.side === 'S';
      for (const direction of [1, -1] as const) {
        const box = await placed.boundingBox();
        if (!box) break;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + (horizontalWall ? oneX * direction : 0), box.y + box.height / 2 + (horizontalWall ? 0 : oneY * direction), { steps: 6 });
        await page.mouse.up();
        await page.waitForTimeout(750);
        const moved = (await kidsPlan(page)).blocks.find((block) => block.id === beforeOpening.id);
        if (moved?.cell && (moved.cell.x !== beforeOpening.cell.x || moved.cell.y !== beforeOpening.cell.y || moved.side !== beforeOpening.side)) break;
      }
      const afterMoveOpening = (await kidsPlan(page)).blocks.find((block) => block.id === beforeOpening.id);
      assert(Boolean(afterMoveOpening?.cell && (afterMoveOpening.cell.x !== beforeOpening.cell.x || afterMoveOpening.cell.y !== beforeOpening.cell.y || afterMoveOpening.side !== beforeOpening.side)), '미닫이문을 벽을 따라 끌어도 이동하지 않는다');
      await page.locator('button[data-opening-state]').click();
      await page.waitForTimeout(250);
      assert((await placed.getAttribute('data-opening-state')) === 'open', '미닫이문을 평소 상태 단추로 열지 못했다');
      await page.locator('button[data-opening-state]').click();
      await page.waitForTimeout(250);
      assert((await placed.getAttribute('data-opening-state')) === 'closed', '미닫이문을 평소 상태 단추로 다시 닫지 못했다');

      /* 교체·이동·열기·닫기 네 동작을 모두 되돌려 원래 여닫이문으로 복원한다. */
      for (let i = 0; i < 4; i += 1) {
        await page.keyboard.press('Control+z');
        await page.waitForTimeout(150);
      }
      assert((await page.locator('.k-stage [data-opening-kind="door"]').count()) > 0, '되돌린 뒤 여닫이문이 돌아오지 않았다');
    });

    /* 팔레트가 한 줄에 셋 이상 (설계서 v1.6 §1) */
    await check('팔레트 칸이 좁아져 한 줄에 셋 이상 보인다 (설계서 v1.6 §1)', async () => {
      const perRow = await page.evaluate(() => {
        const cells = Array.from(document.querySelectorAll('[data-palette-group="room"] .k-block')) as HTMLElement[];
        if (cells.length === 0) return 0;
        const top = Math.round(cells[0].getBoundingClientRect().top);
        return cells.filter((c) => Math.abs(Math.round(c.getBoundingClientRect().top) - top) < 4).length;
      });
      assert(perRow >= 3, `한 줄에 ${perRow}칸뿐이다`);
    });

    await check('고르기·나가는 길·지우개가 왼쪽 패널 한 줄에 보인다 (설계서 v1.6 §7)', async () => {
      const tools = await page.locator('.k-tools .k-tool').evaluateAll((buttons) =>
        buttons.map((button) => ({ text: button.textContent?.trim() ?? '', top: Math.round(button.getBoundingClientRect().top) })),
      );
      assert(tools.length === 3, `도구 ${tools.length}개`);
      assert(new Set(tools.map((tool) => tool.top)).size === 1, `도구가 여러 줄이다: ${JSON.stringify(tools)}`);
      for (const label of ['고르기', '나가는 길', '지우개']) assert(tools.some((tool) => tool.text.includes(label)), `${label}가 없다`);
    });

    /* 소리 켬/끔 (설계서 v1.6 §3) */
    await check('소리를 끄면 말도 멎는다 (설계서 v1.6 §3)', async () => {
      const readProbe = () =>
        page.evaluate(() => ({ ...(window as unknown as { __soundProbe: Record<string, number> }).__soundProbe }));
      const btn = page.locator('[data-coach="kids-sound"]');
      const wasOn = (await btn.getAttribute('aria-pressed')) === 'true';
      if (!wasOn) await btn.click();
      await page.waitForTimeout(200);
      const beforeOff = await readProbe();
      const soundEnvironment = await page.evaluate(() => ({
        audioContext: window.AudioContext?.name ?? '없음',
        webkitAudioContext:
          (window as unknown as { webkitAudioContext?: { name?: string } }).webkitAudioContext?.name ?? '없음',
        speechSynthesis: typeof window.speechSynthesis,
        utterance: window.SpeechSynthesisUtterance?.name ?? '없음',
      }));
      assert(
        beforeOff.contextAttempts >= 2 && beforeOff.starts > 0,
        `AudioContext 첫 실패 뒤 다시 시도하지 않았다: ${JSON.stringify(beforeOff)} / ${JSON.stringify(soundEnvironment)}`,
      );
      await btn.click(); // 끈다
      await page.waitForTimeout(300);
      assert((await btn.getAttribute('aria-pressed')) === 'false', '끄지 못했다');
      assert((await btn.innerText()).includes('꺼짐'), '단추가 현재 상태를 분명히 보여 주지 않는다');
      const speaking = await page.evaluate(() => window.speechSynthesis?.speaking ?? false);
      assert(speaking === false, '껐는데 아직 읽고 있다');
      const afterOff = await readProbe();
      assert(afterOff.speaks === beforeOff.speaks, '소리를 끄는 동안 브라우저 기계음이 호출됐다');
      assert(afterOff.cancels > beforeOff.cancels, '끄면서 읽던 말을 취소하지 않았다');
      assert(afterOff.suspends > beforeOff.suspends, '끄면서 AudioContext 를 멈추지 않았다');
      assert(afterOff.immediateStops > beforeOff.immediateStops, '현재·예약 효과음을 취소하지 않았다');

      /* 꺼진 동안 새 말과 효과음이 시작되면 안 된다 */
      const silentBase = await readProbe();
      await page.locator('[data-coach="kids-help"]').click();
      await page.waitForTimeout(200);
      const silentAfter = await readProbe();
      assert(silentAfter.starts === silentBase.starts, '꺼진 동안 효과음이 시작됐다');
      assert(silentAfter.speaks === silentBase.speaks, '꺼진 동안 새 말을 읽었다');
      /* 껐다는 사실이 곧바로 저장돼야 한다 — 600ms 뒤 저장은 창을 닫으면 날아간다 */
      const savedOff = await page.evaluate(() => JSON.parse(window.localStorage.getItem('evac-kids-v1') ?? '{}').profile?.soundOn);
      assert(savedOff === false, '끈 것이 곧바로 저장되지 않았다');

      /* 꺼진 동안 나온 최신 말은 소리를 켜는 바로 그 클릭에서 MP3로 다시 들려준다. */
      const voiceBeforeOn = await readProbe();
      await btn.click();
      await page.waitForTimeout(700);
      const voiceAfterOn = await readProbe();
      assert(voiceAfterOn.speaks === voiceBeforeOn.speaks, '최신 MP3 대신 브라우저 기계음이 호출됐다');
      assert(voiceAfterOn.voicePlayCalls > voiceBeforeOn.voicePlayCalls, '상단에서 소리를 켜도 최신 MP3를 부르지 않았다');
      assert(voiceAfterOn.voicePlayResolves > voiceBeforeOn.voicePlayResolves, '상단에서 다시 튼 MP3 play()가 실패했다');
      assert(voiceAfterOn.voicePlaying > voiceBeforeOn.voicePlaying, '상단에서 다시 튼 MP3가 playing 상태가 되지 않았다');
      await btn.click();
      await page.waitForTimeout(200);
      assert((await btn.getAttribute('aria-pressed')) === 'false', '재생 확인 뒤 소리를 다시 끄지 못했다');
      const savedOffAgain = await page.evaluate(() => JSON.parse(window.localStorage.getItem('evac-kids-v1') ?? '{}').profile?.soundOn);
      assert(savedOffAgain === false, '재생 확인 뒤 끈 상태가 저장되지 않았다');

      /* 껐으면 다시 열어도 꺼져 있어야 한다 (설계서 v1.6 §3) */
      await page.reload({ waitUntil: 'networkidle' });
      await continueAfterWelcome();
      await page.waitForSelector('.k-app');
      await page.waitForTimeout(900);
      const stillOff = await page.locator('[data-coach="kids-sound"]').getAttribute('aria-pressed');
      assert(stillOff === 'false', '다시 열었더니 소리가 켜져 있다');
      const speakingAgain = await page.evaluate(() => window.speechSynthesis?.speaking ?? false);
      assert(speakingAgain === false, '다시 열자마자 읽고 있다');

      const beforeOn = await readProbe();
      await page.locator('[data-coach="kids-sound"]').click(); // 다시 켠다
      await page.waitForTimeout(200);
      assert((await page.locator('[data-coach="kids-sound"]').getAttribute('aria-pressed')) === 'true', '다시 켜지지 않는다');
      assert((await page.locator('[data-coach="kids-sound"]').innerText()).includes('켜짐'), '켠 상태가 단추에 보이지 않는다');
      const afterOn = await readProbe();
      assert(afterOn.starts > beforeOn.starts, '다시 켰는데 확인음이 나지 않았다');
    });

    /* 여럿 고르기와 함께 옮기기 (설계서 v1.5 §1) */
    await check('끌어서 여럿 고르고, Ctrl 로 더하고, 다 같이 옮긴다 (FR-7.19)', async () => {
      await page.locator('[data-coach="kids-tool-select"]').click();
      await page.waitForTimeout(150);

      /* 도면을 눌러도 키보드 커서가 뜨지 않는다 (설계서 v1.5 §4) */
      const empty = await kidsCell(page, 1, 1);
      await page.mouse.click(empty.x, empty.y);
      await page.waitForTimeout(200);
      assert((await page.locator('[data-caret]').count()) === 0, '눌렀는데 키보드 커서가 떴다');

      const print0 = await planPrint(page);
      const before = await kidsSave(page);
      const picked = await page.evaluate(() => {
        const raw = window.localStorage.getItem('evac-kids-v1');
        const f = JSON.parse(raw ?? '{}');
        return (f.plan?.blocks ?? []).filter((b: { kind: string }) => b.kind === 'room').length as number;
      });
      assert(picked >= 2, `방이 ${picked}개뿐이다`);

      /* 도면 바깥 빈 칸에서 시작해 집 전체를 두른다 — 방 위에서 시작하면 그 방만 끌린다 */
      const a = await kidsCell(page, 1, 1);
      const b = await kidsCell(page, 22, 14);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(300);

      /* 고른 것 중 하나를 끌면 다 같이 간다 */
      const from = await kidsCell(page, 10, 4);
      /* 주변에 고정된 외부 문·창이 있으면 한 방향은 막힐 수 있다. 네 방향 가운데 실제로 안전한 쪽을 찾는다. */
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
        const to = await kidsCell(page, 10 + dx, 4 + dy);
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 6 });
        await page.mouse.up();
        await page.waitForTimeout(900);
        if ((await planPrint(page)) !== print0) break;
      }
      const after = await kidsSave(page);
      assert(after.blocks === before.blocks, `옮기다 블록이 사라졌다 ${before.blocks} → ${after.blocks}`);
      if ((await planPrint(page)) === print0) {
        const debug = await page.evaluate(() => ({
          toast: document.querySelector('.k-toast')?.textContent?.trim() ?? '',
          selected: Array.from(document.querySelectorAll('.k-stage [data-block]')).filter((element) =>
            Boolean(element.querySelector('[stroke-dasharray]')),
          ).map((element) => element.getAttribute('data-block')),
        }));
        throw new Error(`여럿을 골랐는데 아무것도 안 움직였다: ${JSON.stringify(debug)}`);
      }

      /* 되돌려 둔다 — 뒤 시나리오가 원래 도면을 그대로 봐야 한다 */
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(600);
      assert((await planPrint(page)) === print0, '되돌렸는데 도면이 원래대로 돌아오지 않았다');
      await page.mouse.click(empty.x, empty.y);
      await page.waitForTimeout(150);
    });

    /* 내 자리와 형·동생 (설계서 v1.5 §2 · §3) */
    await check('내 자리가 내 캐릭터로 그려지고, 형·동생을 놓을 수 있다 (FR-7.20 · FR-7.21)', async () => {
      /* 내 자리 칸 안에 캐릭터 그림(k-player)이 들어 있다 */
      const spot = page.locator('.k-stage [data-kind="marker"] .k-player');
      assert((await spot.count()) >= 1, '내 자리가 캐릭터로 그려지지 않았다');

      /* 「사람과 장소」 묶음까지 내려가 동생을 고른다 — 더보기가 없다 (설계서 v2.0 §2.2) */
      const younger = page.locator('[data-block-id="sibling_younger"]');
      await younger.scrollIntoViewIfNeeded();
      assert((await younger.count()) === 1, '동생 블록이 팔레트에 없다');
      await younger.click();
      await page.waitForTimeout(150);
      const print0 = await planPrint(page);
      const before = (await kidsSave(page)).blocks;
      const at = await kidsCell(page, 12, 4);
      await page.mouse.click(at.x, at.y);
      await page.waitForTimeout(800);
      assert((await kidsSave(page)).blocks === before + 1, '동생이 안 놓인다');

      /* 놓아 본 것은 도로 치운다 — 뒤 시나리오가 원래 도면을 봐야 한다 */
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(600);
      assert((await planPrint(page)) === print0, '되돌렸는데 동생이 남았다');
      await page.locator('[data-coach="kids-tool-select"]').click();
      await page.waitForTimeout(150);
    });

    await check('도면에는 “문?” 후보가 나타나지 않는다 (설계서 v1.6 §6)', async () => {
      assert((await page.locator('[data-door-candidate], .k-door-candidate').count()) === 0, '도면에 문 후보가 남아 있다');
      assert(!((await page.locator('.k-stage').textContent()) ?? '').includes('문?'), '도면에 “문?” 글자가 남아 있다');
    });

    await check('팔레트의 안전 묶음에서 감지기를 골라 놓고, 캐릭터가 처음 놓은 블록을 말한다', async () => {
      await page.locator('[data-block-id="detector"]').scrollIntoViewIfNeeded();
      await page.locator('[data-block-id="detector"]').click();
      const p = await kidsCell(page, 9, 5);
      const before = (await kidsSave(page)).blocks;
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(800);
      assert((await kidsSave(page)).blocks === before + 1, '감지기가 안 놓였다');
      const bubble = await page.locator('.k-bubble').innerText().catch(() => '');
      assert(bubble.includes('감지기'), `캐릭터 말: ${bubble.slice(0, 40)}`);
    });

    await check('대피경로가 없으면 출력하지 않고 나가는 길 그리기를 안내한다 (설계서 v1.11 §5)', async () => {
      const saved = await kidsSave(page);
      assert(saved.primary === 0 && saved.alternate === 0, '경로 없는 출력 차단을 검사하기 전에 길이 이미 있다');
      await page.locator('[data-coach="kids-print"]').click();
      await page.waitForTimeout(250);
      assert((await page.locator('.k-preview').count()) === 0, '대피경로가 없는데 인쇄 미리보기가 열렸다');
      const toast = await page.locator('.k-toast').innerText();
      assert(toast.includes('나가는 길') && toast.includes('뽑'), `경로 안내가 알맞지 않다: ${toast}`);
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'route', '출력 차단 뒤 주 경로 그리기로 이동하지 않았다');
      assert((await page.locator('.k-app').getAttribute('data-tool')) === null || (await page.locator('.k-canvas').getAttribute('data-tool')) === 'route', '출력 차단 뒤 나가는 길 도구가 켜지지 않았다');
    });

    await check('주 경로를 끌어 그리면 캐릭터가 첫 지적을 말하고, 보조 경로도 따로 그려진다 (§3.2)', async () => {
      await page.locator('[data-coach="kids-route-slot"] [data-slot="primary"]').click();
      await page.waitForTimeout(200);
      await kidsDrag(page, [
        [10, 4], [10, 5], [10, 6], [10, 7], [11, 7], [12, 7], [13, 7], [14, 7], [14, 8], [14, 9], [14, 10], [15, 10], [16, 10],
      ]);
      await page.waitForTimeout(900);
      let save = await kidsSave(page);
      assert(save.primary >= 12, `주 경로 ${save.primary}칸`);
      assert((await page.locator('.k-stage [data-route="primary"]').count()) === 1, '주 경로가 안 보인다');
      const bar = await page.locator('[data-coach="kids-report-bar"]').innerText();
      assert((await page.locator('[data-coach="kids-report-bar"] .k-sev.critical').count()) === 0, `critical 이 남았다: ${bar}`);
      await page.locator('[data-coach="kids-route-slot"] [data-slot="alternate"]').click();
      await page.waitForTimeout(200);
      await kidsDrag(page, [[10, 4], [10, 5], [10, 6], [10, 7], [10, 8], [10, 9], [10, 10], [10, 11], [10, 12], [10, 13], [11, 13]]);
      await page.waitForTimeout(900);
      save = await kidsSave(page);
      assert(save.alternate >= 10, `보조 경로 ${save.alternate}칸`);
      assert(save.primary >= 12, '보조를 그리자 주 경로가 사라졌다');
      assert((await page.locator('.k-stage [data-route="alternate"]').count()) === 1, '보조 경로가 안 보인다');
      const bubble = await page.locator('.k-bubble').innerText().catch(() => '');
      assert(bubble.length > 3, '캐릭터가 말이 없다');
    });

    await check('"이제 뭘 해야 해?" 는 언제나 답한다 (FR-7.10 · P3)', async () => {
      await page.locator('.k-bubble .k-tb', { hasText: '알겠어' }).click().catch(() => undefined);
      await page.waitForTimeout(100);
      await page.locator('[data-coach="kids-help"]').click();
      await page.waitForSelector('.k-bubble');
      const t = await page.locator('.k-bubble').innerText();
      assert(t.length > 5, '도움이 비었다');
      await page.locator('.k-bubble .k-tb', { hasText: '알겠어' }).click();
      await page.waitForTimeout(100);
      await page.locator('[data-coach="kids-help"]').click();
      await page.waitForSelector('.k-bubble');
      assert((await page.locator('.k-bubble').innerText()).length > 5, '두 번째 도움이 비었다 (쿨다운이 막았다)');
    });

    await check('되돌리기와 새로고침 복원', async () => {
      const before = (await kidsSave(page)).blocks;
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(800);
      const mid = await kidsSave(page);
      assert(mid.blocks < before || mid.alternate === 0, `되돌리기 안 됨 ${before} → ${mid.blocks}/${mid.alternate}`);
      await page.reload({ waitUntil: 'networkidle' });
      await continueAfterWelcome();
      await page.waitForSelector('.k-app');
      await page.waitForTimeout(400);
      assert((await page.locator('.k-onboard').count()) === 0, '복원했는데 안내가 또 떴다');
      assert((await page.locator('.k-stage [data-kind="room"]').count()) >= 8, '복원된 방이 적다');
    });

    await check('같은 상황 다시와 새로운 상황은 시드를 구분하고 시도 기록을 이어 간다', async () => {
      await page.locator('[data-coach="kids-start-game"]').click();
      await page.waitForSelector('.k-game');
      await page.waitForTimeout(500);
      await page.locator('[data-coach="kids-quit"]').click();
      await page.waitForSelector('.k-report-view');
      const beforeSame = await kidsSave(page);
      await page.locator('[data-coach="kids-replay"]').click();
      await page.waitForSelector('.k-game');
      await page.waitForTimeout(300);
      await page.locator('[data-coach="kids-quit"]').click();
      await page.waitForSelector('.k-report-view');
      await page.waitForTimeout(300);
      const afterSame = await kidsSave(page);
      assert(afterSame.lastSeeds.length === 2 && afterSame.lastSeeds[0] === afterSame.lastSeeds[1], `같은 상황 시드 ${afterSame.lastSeeds.join(',')}`);
      await page.locator('[data-coach="kids-new-situation"]').click();
      await page.waitForSelector('.k-game');
      await page.waitForTimeout(300);
      await page.locator('[data-coach="kids-quit"]').click();
      await page.waitForSelector('.k-report-view');
      const save = await kidsSave(page);
      assert(save.attempts >= beforeSame.attempts + 2, `시도 ${beforeSame.attempts} → ${save.attempts}`);
      assert(save.lastSeeds.length === 2 && save.lastSeeds[0] !== save.lastSeeds[1], `새로운 상황 시드 ${save.lastSeeds.join(',')}`);
      assert(save.stampWeeks === 1, `같은 주 도장이 ${save.stampWeeks}개다`);
      await page.locator('[data-coach="kids-edit-plan"]').click();
      await page.waitForSelector('svg.k-stage');
    });

    await check('말풍선이 나타나도 도면 크기가 그대로이고 서로 겹치지 않는다 (설계서 v1.6 §9)', async () => {
      const close = page.locator('.k-bubble .k-tb', { hasText: '알겠어' });
      if (await close.count()) await close.click();
      await page.waitForTimeout(150);
      const before = await page.locator('svg.k-stage').boundingBox();
      assert(before !== null, '말하기 전 도면을 재지 못했다');
      await page.locator('[data-coach="kids-help"]').click();
      await page.waitForSelector('.k-bubble');
      const during = await page.locator('svg.k-stage').boundingBox();
      assert(during !== null, '말하는 동안 도면을 재지 못했다');
      assert(
        Math.abs(during!.width - before!.width) <= 1 && Math.abs(during!.height - before!.height) <= 1,
        `도면 크기가 ${before!.width}x${before!.height} → ${during!.width}x${during!.height} 로 바뀌었다`,
      );
      const geometry = await page.evaluate(() => {
        const b = document.querySelector('.k-bubble')?.getBoundingClientRect();
        const s = document.querySelector('svg.k-stage')?.getBoundingClientRect();
        const slot = document.querySelector('.k-guide-slot')?.getBoundingClientRect();
        if (!b || !s || !slot) return { overlap: -1, contained: false };
        const w = Math.min(b.right, s.right) - Math.max(b.left, s.left);
        const h = Math.min(b.bottom, s.bottom) - Math.max(b.top, s.top);
        return {
          overlap: w > 0 && h > 0 ? Math.round(w * h) : 0,
          contained: b.top >= slot.top - 1 && b.bottom <= slot.bottom + 1,
        };
      });
      assert(geometry.overlap === 0, `겹친 넓이 ${geometry.overlap}px2`);
      assert(geometry.contained, '말풍선이 해설 전용 칸을 벗어났다');
    });

    await check('소리를 끄면 상태가 저장된다 (설계서 v1.2 §7.1 C1)', async () => {
      const btn = page.locator('[data-coach="kids-sound"]');
      assert((await btn.getAttribute('aria-pressed')) === 'true', '기본이 켬이 아니다');
      await btn.click();
      await page.waitForTimeout(700);
      assert((await btn.getAttribute('aria-pressed')) === 'false', '꺼지지 않았다');
      const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem('evac-kids-v1') ?? '{}').profile?.soundOn);
      assert(saved === false, `저장 안 됨: ${String(saved)}`);
      await btn.click();
      await page.waitForTimeout(500);
    });

    await check('내 캐릭터 10종에서 고른다 — 남학생 5 · 여학생 5 (설계서 v1.2 §6.2)', async () => {
      await page.locator('[data-coach="kids-character"]').click();
      await page.waitForSelector('.k-char-grid');
      const n = await page.locator('.k-char').count();
      assert(n === 10, `캐릭터가 ${n}종이다`);
      await page.locator('[data-character="girl_braid"]').click();
      await page.waitForTimeout(700);
      const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem('evac-kids-v1') ?? '{}').profile?.playerCharacter);
      assert(saved === 'girl_braid', `저장 안 됨: ${String(saved)}`);
      await page.locator('[data-coach="kids-character"]').click();
      await page.locator('[data-character="boy_cap"]').click();
      await page.waitForTimeout(500);
    });

    await check('문을 고르면 길이·안팎 방향·평소 상태를 화면 단추로 바꾼다 (설계서 v1.11 §3)', async () => {
      await page.locator('[data-coach="kids-tool-select"]').click();
      const door = page.locator('.k-stage [data-opening-kind="door"]').first();
      const id = await door.getAttribute('data-block');
      const state = async (): Promise<boolean> =>
        page.evaluate((blockId) => {
          const raw = window.localStorage.getItem('evac-kids-v1');
          if (!raw) return false;
          const f = JSON.parse(raw);
          const b = (f.plan?.blocks ?? []).find((x: { id: string }) => x.id === blockId);
          return Boolean(b?.closedByDefault);
        }, id);
      const before = await state();
      const bb = await door.boundingBox();
      assert(bb !== null, '개구부가 화면에 없다');
      await page.mouse.click(bb!.x + bb!.width / 2, bb!.y + bb!.height / 2);
      await page.waitForTimeout(250);
      assert((await page.locator('[data-opening-controls]').count()) === 1, '문을 골라도 조작부가 보이지 않는다');
      assert((await page.locator('[data-opening-resize]').count()) === 2, '여닫이문 줄이기·늘리기 단추가 없다');
      assert((await page.locator('[data-opening-length]').innerText()).includes('1칸'), '여닫이문의 현재 너비가 보이지 않는다');
      await page.locator('[data-opening-resize="increase"]').click();
      await page.locator('[data-opening-resize="increase"]').click();
      await page.waitForTimeout(450);
      assert((await door.getAttribute('data-opening-width')) === '3', '여닫이문 가로 길이가 3칸으로 늘어나지 않는다');
      await page.locator('button[data-opening-swing="outward"]').click();
      await page.waitForTimeout(300);
      assert((await door.getAttribute('data-opening-swing')) === 'outward', '문이 방 바깥쪽으로 열리게 바뀌지 않는다');
      await page.locator('button[data-opening-swing="inward"]').click();
      await page.waitForTimeout(250);
      assert((await door.getAttribute('data-opening-swing')) === 'inward', '문이 방 안쪽으로 다시 열리지 않는다');
      await page.locator('button[data-opening-state]').click();
      await page.waitForTimeout(650);
      const mid = await state();
      assert(mid !== before, '평소 상태 단추를 눌러도 열림·닫힘이 안 바뀐다');
      await page.locator('button[data-opening-state]').click();
      await page.waitForTimeout(650);
      assert((await state()) === before, '평소 상태 단추를 다시 눌러도 돌아오지 않는다');
      const frontDoor = page.locator('.k-stage [data-opening-kind="front_door"]').first();
      const frontBox = await frontDoor.boundingBox();
      assert(Boolean(frontBox), '현관문이 도면에 없다');
      await page.mouse.click(frontBox!.x + frontBox!.width / 2, frontBox!.y + frontBox!.height / 2);
      await page.waitForTimeout(250);
      assert((await page.locator('[data-opening-controls]').innerText()).includes('현관문 너비'), '현관문을 골라도 현관문 크기 조절이라고 알려 주지 않는다');
      const frontBefore = Number(await frontDoor.getAttribute('data-opening-width'));
      await page.locator('[data-opening-resize="increase"]').click();
      await page.waitForTimeout(450);
      assert(Number(await frontDoor.getAttribute('data-opening-width')) === frontBefore + 1, '현관문 너비 늘리기가 작동하지 않는다');
      await page.keyboard.press('Escape');
    });

    await check('도면 글자가 뒤집히지 않는다', async () => {
      const bad = await page.evaluate(() => {
        const out: string[] = [];
        for (const t of Array.from(document.querySelectorAll('svg.k-stage text'))) {
          const m = (t as SVGGraphicsElement).getScreenCTM();
          if (!m) continue;
          /* 뒤집히거나 세워진 글자 — 회전 성분이 남아 있으면 안 된다 */
          if (Math.abs(m.b) > 0.01 || Math.abs(m.c) > 0.01 || m.a <= 0 || m.d <= 0) {
            out.push((t.textContent ?? '').trim().slice(0, 12));
          }
        }
        return out;
      });
      assert(bad.length === 0, `돌아간 글자 ${bad.length}개: ${bad.slice(0, 4).join(', ')}`);
    });

    await check('누르는 것이 모두 48×48 이상이다 (D6 · NFR-10)', async () => {
      const small: string[] = [];
      const sweep = async (where: string) => {
        for (const t of await hitTargets(page)) {
          if (t.w < 48 || t.h < 48) small.push(`${where} ${t.w}x${t.h} "${t.name}"`);
        }
      };
      await sweep('편집');
      await page.locator('[data-coach="kids-usage"]').click();
      await page.waitForSelector('.k-modal');
      await sweep('사용법');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      await page.locator('[data-coach="kids-start-game"]').click();
      await page.waitForSelector('.k-game');
      await page.waitForTimeout(400);
      await sweep('게임');
      await page.locator('[data-coach="kids-quit"]').click();
      await page.waitForSelector('.k-report-view');
      await sweep('리포트');
      await page.locator('[data-coach="kids-edit-plan"]').click();
      await page.waitForSelector('svg.k-stage');
      assert(small.length === 0, `${small.length}개: ${small.slice(0, 4).join(' | ')}`);
    });

    await check('본문 대비가 4.5:1 이상이다 (NFR-10)', async () => {
      const bad: string[] = [];
      const sweep = async (where: string) => {
        for (const t of await textOnBackground(page)) {
          const need = neededContrast(t.fs, t.fw);
          const got = contrastRatio(t.fg, t.bg);
          if (got < need) bad.push(`${where} ${got.toFixed(2)}<${need} ${t.where} "${t.txt}"`);
        }
      };
      await sweep('편집');
      await page.locator('[data-coach="kids-start-game"]').click();
      await page.waitForSelector('.k-game');
      await page.waitForTimeout(400);
      await sweep('게임');
      await page.locator('[data-coach="kids-quit"]').click();
      await page.waitForSelector('.k-report-view');
      await sweep('리포트');
      await page.locator('[data-coach="kids-edit-plan"]').click();
      await page.waitForSelector('svg.k-stage');
      assert(bad.length === 0, `${bad.length}건: ${bad.slice(0, 3).join(' | ')}`);
    });

    await check('마우스 없이 Tab·방향키·Enter 로 방을 놓는다 (설계서 v1.0 §7.4)', async () => {
      const beforePlan = await kidsPlan(page);
      let insertRect: BrowserRect | null = null;
      for (let y = 0; y <= beforePlan.grid.height - 4 && !insertRect; y += 1) {
        for (let x = 0; x <= beforePlan.grid.width - 4; x += 1) {
          const candidate = { x, y, w: 4, h: 4 };
          if (validShellInsertRect(beforePlan, candidate)) {
            insertRect = candidate;
            break;
          }
        }
      }
      assert(Boolean(insertRect), '키보드로 놓을 수 있는 공용 바닥 자리가 없다');
      if (!insertRect) throw new Error('키보드용 새 방 자리가 없다');
      await page.locator('[data-coach="kids-tool-select"]').click();
      await page.locator('[data-block-id="bedroom"]').click();
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      // Tab 만으로 도면까지 갈 수 있어야 한다
      let reached = false;
      for (let i = 0; i < 60 && !reached; i += 1) {
        await page.keyboard.press('Tab');
        reached = await page.evaluate(() => document.activeElement?.classList.contains('k-stage') === true);
      }
      assert(reached, 'Tab 으로 도면에 닿지 못한다');
      const caret = async () => page.locator('svg.k-stage [data-caret]').getAttribute('x');
      assert((await caret()) !== null, '키보드 커서가 안 보인다');
      const cellOf = async (): Promise<{ x: number; y: number }> => {
        const el = page.locator('svg.k-stage [data-caret]');
        const x = Number(await el.getAttribute('x'));
        const y = Number(await el.getAttribute('y'));
        return { x: Math.round((x - 1) / 36), y: Math.round((y - 1) / 36) };
      };
      const from = await cellOf();
      const to = { x: insertRect.x, y: insertRect.y };
      for (let i = 0; i < Math.abs(to.x - from.x); i += 1) await page.keyboard.press(to.x > from.x ? 'ArrowRight' : 'ArrowLeft');
      for (let i = 0; i < Math.abs(to.y - from.y); i += 1) await page.keyboard.press(to.y > from.y ? 'ArrowDown' : 'ArrowUp');
      const now = await cellOf();
      assert(now.x === to.x && now.y === to.y, `커서가 ${now.x},${now.y} 에 있다`);
      const before = (await kidsSave(page)).blocks;
      await page.keyboard.press('Enter');
      await page.waitForTimeout(800);
      const afterPlan = await kidsPlan(page);
      const oldIds = new Set(beforePlan.blocks.map((block) => block.id));
      assert(afterPlan.blocks.some((block) => block.kind === 'room' && block.wallMode !== 'zone' && !oldIds.has(block.id)), `방이 안 놓였다 ${before} → ${(await kidsSave(page)).blocks}`);
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(700);
      assert((await kidsSave(page)).blocks === before, '되돌리기가 안 됐다');
    });

    await check('인쇄 미리보기와 인쇄 매체에서 A4 세로 시트만 남는다', async () => {
      await page.locator('[data-coach="kids-print"]').click();
      await page.waitForSelector('.k-preview svg.k-sheet');
      const txt = await page.locator('.k-preview').innerText();
      assert(txt.includes('가족'), '시트 문구 없음');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      await page.emulateMedia({ media: 'print' });
      const appShown = await page.locator('.k-app').evaluate((el) => getComputedStyle(el).display);
      const sheetShown = await page.locator('.k-print-root').evaluate((el) => getComputedStyle(el).display);
      await page.emulateMedia({ media: 'screen' });
      assert(appShown === 'none', `인쇄에 화면이 남는다: ${appShown}`);
      assert(sheetShown === 'block', `인쇄에 시트가 없다: ${sheetShown}`);
      const pageRule = await page.evaluate(() => document.getElementById('k-page')?.textContent ?? '');
      assert(pageRule.includes('portrait'), `세로 규칙 없음: ${pageRule}`);
    });

    await check('3D 리플레이가 열리고 재생·시점 전환이 된다 (FR-11)', slowGl(async () => {
      /* 기본값이 아닌 캐릭터를 골라 2D 선택이 3D 모델까지 이어지는지 본다. */
      await page.locator('[data-coach="kids-character"]').click();
      await page.locator('[data-character="girl_braid"]').click();
      await page.waitForTimeout(300);
      await page.locator('[data-coach="kids-start-game"]').click();
      await page.waitForTimeout(400);
      const anyway = page.locator('[data-coach="kids-start-anyway"]');
      if (await anyway.count()) await anyway.click();
      await page.waitForSelector('.k-game');
      for (let i = 0; i < 6; i += 1) {
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(110);
      }
      await page.locator('[data-coach="kids-quit"]').click();
      await page.waitForSelector('.k-report-view');
      await page.locator('[data-coach="kids-replay3d-open"]').click();
      await page.waitForSelector('.k-replay');
      await page.waitForTimeout(900);
      const cap = await page.locator('.k-r-caption').innerText();
      assert(/초/.test(cap), `자막 없음: ${cap}`);
      const replay = page.locator('.k-replay');
      assert((await page.locator('.k-r-topbar').count()) === 1, '상단 시점 조작부가 없다');
      assert((await page.locator('[data-view]').count()) === 3, '시점 선택이 세 가지가 아니다');
      assert((await page.locator('[data-look-direction]').count()) === 4, '상하좌우 방향 단추가 넷이 아니다');
      assert((await page.locator('[data-look-reset]').count()) === 1, '시점 정면 단추가 없다');
      assert((await page.locator('[data-quality]').count()) === 3, '화질 선택이 세 단계가 아니다');
      assert((await replay.getAttribute('data-player-count')) === '1', '3D 리플레이의 주인공 수가 한 명이 아니다');
      assert((await replay.getAttribute('data-player-representation')) === 'first-person-body', '1인칭에 연결된 한 사람 몸 대신 다른 주인공 표현이 함께 있다');
      assert(Number(await replay.getAttribute('data-source-my-spot-count')) <= 1, '3D 리플레이 입력에 내 위치가 여러 개 남았다');
      assert((await replay.getAttribute('data-replay-my-spot-count')) === '0', '3D 장면에 고정 내 위치 표시가 들어갔다');
      assert((await page.locator('[data-quality-badge]').count()) === 1, '3D 장면에 현재 화질 표시가 없다');
      const topbarBox = await page.locator('.k-r-topbar').boundingBox();
      const stageBox = await page.locator('.k-replay-stage').boundingBox();
      assert(Boolean(topbarBox && stageBox && topbarBox.y + topbarBox.height <= stageBox.y + 1), '상단 조작부가 3D 화면과 겹친다');
      /* WebGL 을 못 쓰는 기기에서는 2D 로 내려간다 */
      const has3d = (await page.locator('.k-replay-canvas').count()) === 1;
      const has2d = (await page.locator('[data-fallback="2d"]').count()) === 1;
      assert(has3d || has2d, '3D 도 2D 도 없다');
      if (has3d) {
        const replayCanvas = page.locator('.k-replay-canvas');
        assert((await replayCanvas.getAttribute('data-character')) === 'girl_braid', '고른 캐릭터가 3D로 넘어오지 않았다');
        assert((await replayCanvas.getAttribute('data-character-style')) === 'braid', '땋은 머리 모양이 3D로 넘어오지 않았다');
        assert(Boolean((await page.locator('.k-replay').getAttribute('aria-label'))?.includes('하윤')), '3D 화면이 고른 캐릭터를 알리지 않는다');
      }
      /* 기본은 1인칭 — 최신 3D 대피연습은 내가 걷는 느낌으로 시작한다 (설계서 v1.7 §1.4) */
      assert(
        (await page.locator('[data-view="first"]').getAttribute('aria-pressed')) === 'true',
        '내 눈으로 보기가 기본 시점이 아니다',
      );
      /* 1인칭에서도 마우스 좌우·상하가 모두 카메라 상태를 바꾼다. */
      if (has3d) {
        const yaw0 = await replay.getAttribute('data-camera-yaw');
        const pitch0 = await replay.getAttribute('data-camera-pitch');
        const cv = await page.locator('.k-replay-canvas').boundingBox();
        if (cv) {
          await page.mouse.move(cv.x + cv.width / 2, cv.y + cv.height / 2);
          await page.mouse.down();
          await page.mouse.move(cv.x + cv.width / 2 + 140, cv.y + cv.height / 2 + 30, { steps: 6 });
          await page.mouse.up();
          await page.waitForTimeout(300);
          assert((await replay.getAttribute('data-camera-yaw')) !== yaw0, '마우스 좌우로 시점이 안 돈다');
          assert((await replay.getAttribute('data-camera-pitch')) !== pitch0, '마우스 상하로 시점이 안 돈다');
          const back = page.locator('[data-look-reset]');
          assert((await back.isEnabled()) === true, '시점을 움직여도 정면 단추가 활성화되지 않는다');
          await back.click();
          await page.waitForTimeout(200);
          assert((await replay.getAttribute('data-camera-yaw')) === '0.000', '시점 좌우가 정면으로 돌아오지 않는다');
          assert((await replay.getAttribute('data-camera-pitch')) === '0.000', '시점 상하가 정면으로 돌아오지 않는다');
        }
      }
      await page.locator('[data-look-direction="left"]').click();
      await page.locator('[data-look-direction="up"]').click();
      assert((await replay.getAttribute('data-camera-yaw')) !== '0.000', '왼쪽 보기 단추가 작동하지 않는다');
      assert((await replay.getAttribute('data-camera-pitch')) !== '0.000', '위 보기 단추가 작동하지 않는다');
      await page.locator('[data-look-reset]').click();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowDown');
      assert((await replay.getAttribute('data-camera-yaw')) !== '0.000', '키보드 오른쪽 방향키가 작동하지 않는다');
      assert((await replay.getAttribute('data-camera-pitch')) !== '0.000', '키보드 아래 방향키가 작동하지 않는다');
      await page.locator('[data-look-reset]').click();
      await page.locator('[data-view="follow"]').click();
      await page.waitForTimeout(200);
      assert((await replay.getAttribute('data-camera-view')) === 'follow', '뒤에서 시점이 안 바뀐다');
      assert((await replay.getAttribute('data-player-representation')) === 'full-avatar', '뒤에서 보기에 전신 캐릭터 하나만 남지 않았다');
      await page.locator('[data-view="dollhouse"]').click();
      await page.waitForTimeout(300);
      assert((await page.locator('[data-view="dollhouse"]').getAttribute('aria-pressed')) === 'true', '집 전체 시점이 안 바뀐다');
      assert((await replay.getAttribute('data-player-representation')) === 'full-avatar', '집 전체 보기에 전신 캐릭터 하나만 남지 않았다');

      /* 가까이·멀리 단추와 패널 접기 (설계서 v1.19 §2.3) */
      assert((await page.locator('[data-look-zoom]').count()) === 2, '가까이·멀리 단추가 둘이 아니다');
      const zoom0 = await replay.getAttribute('data-camera-zoom');
      await page.locator('[data-look-zoom="in"]').click();
      await page.waitForTimeout(200);
      assert((await replay.getAttribute('data-camera-zoom')) !== zoom0, '가까이 단추가 작동하지 않는다');
      await page.locator('[data-look-zoom="out"]').click();
      await page.waitForTimeout(200);
      assert((await replay.getAttribute('data-camera-zoom')) === zoom0, '멀리 단추가 되돌리지 않는다');
      assert((await page.locator('.k-r-panel').count()) === 1, '설정 패널이 없다');
      await page.locator('[data-coach="kids-replay-panel-toggle"]').click();
      await page.waitForTimeout(200);
      assert((await page.locator('.k-r-panel').count()) === 0 && (await page.locator('.k-r-panel-open').count()) === 1, '패널이 접히지 않는다');
      await page.locator('[data-coach="kids-replay-panel-toggle"]').click();
      await page.waitForTimeout(200);
      assert((await page.locator('.k-r-panel').count()) === 1, '패널이 다시 펴지지 않는다');
      await page.locator('[data-coach="kids-replay-play"]').click();
      await page.waitForTimeout(200);

      /* 겹 켜고 끄기 — 끄면 사라지고 켜면 돌아온다 (설계서 v1.4 §3) */
      const layerBox = page.locator('[data-coach="kids-replay-layers"]');
      assert((await layerBox.locator('input[type="checkbox"]').count()) === 4, '보이기 항목이 넷이 아니다');
      /* 체크상자 자체는 눈에 보이지 않는다 — 라벨 전체가 누르는 칸이다 (D6) */
      const routeRow = layerBox.locator('label', { hasText: '내가 그린 길' });
      const routeToggle = routeRow.locator('input');
      assert((await routeToggle.isChecked()) === true, '길이 처음부터 꺼져 있다');
      await routeRow.click();
      await page.waitForTimeout(250);
      assert((await routeToggle.isChecked()) === false, '길을 못 끈다');
      await routeRow.click();
      await page.waitForTimeout(250);
      assert((await routeToggle.isChecked()) === true, '길이 다시 안 켜진다');

      /* 세 화질 단계가 장식 밀도와 함께 바뀌고, 낮춰도 화면은 살아 있다 (FR-11.10) */
      /* 고급 4096 그림자는 1024/1440 실화면 캡처와 로직 검사에서 확인한다. CI의 소프트웨어 WebGL에 강제하지 않는다. */
      if (!process.env.CI) {
        await page.locator('[data-quality="high"]').click();
        await page.waitForTimeout(350);
        assert((await replay.getAttribute('data-scene-detail')) === 'standard', '높음 화질 장식이 적용되지 않는다');
      } else {
        assert((await replay.getAttribute('data-scene-detail')) === 'minimal', '자동화 브라우저가 가벼움 화질로 시작하지 않는다');
      }
      await page.locator('[data-quality="low"]').click();
      await page.waitForTimeout(700);
      assert((await page.locator('[data-quality="low"]').getAttribute('aria-pressed')) === 'true', '화질이 안 바뀐다');
      assert((await replay.getAttribute('data-scene-detail')) === 'minimal', '가벼움 화질 장식이 적용되지 않는다');
      assert((await page.locator('.k-replay-canvas canvas').count()) === 1, '화질을 낮추니 그림이 사라졌다');

      /*
       * 닫기 단추가 정말 위에 있는지 먼저 확인한다 — 무엇에 덮여 있으면 여기서 잡힌다.
       * 실제로 누르는 것은 Esc 로 한다. 배포 검증 기계(소프트웨어 렌더링)에서는
       * 단추가 맨 위에 있고 화면 안에 있는데도 Playwright 의 누름이 시간을 넘긴다.
       * 사람이 못 누르는 것이 아니라 자동 조작 쪽 문제라, 같은 일을 하는 다른 길로 닫는다.
       * Esc 로 닫히는 것은 어차피 지켜야 하는 규칙이다 (작업지침 §5).
       */
      const onTop = await page.evaluate(() => {
        const el = document.querySelector('.k-r-topbar .k-x') as HTMLElement | null;
        if (!el) return 'none';
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return top && (top === el || el.contains(top)) ? 'ok' : `${top?.tagName}.${(top as HTMLElement)?.className}`;
      });
      assert(onTop === 'ok', `닫기 단추가 가려져 있다: ${onTop}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      assert((await page.locator('.k-replay').count()) === 0, '리플레이가 안 닫힌다');
      await page.locator('[data-coach="kids-edit-plan"]').click();
      await page.waitForSelector('svg.k-stage');
    }));

    await check('무사히 나오면 3D 마지막이 가족 장면으로 넘어간다 (설계서 v1.2 §8.6)', slowGl(async () => {
      await page.locator('[data-coach="kids-start-game"]').click();
      await page.waitForTimeout(400);
      const anyway = page.locator('[data-coach="kids-start-anyway"]');
      if (await anyway.count()) await anyway.click();
      await page.waitForSelector('.k-game');
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        (window as unknown as { __soundProbe: { successTones: number } }).__soundProbe.successTones = 0;
      });
      /* 매 판의 실제 목표가 달라도 벽·문을 지키는 가장 짧은 길로 몸을 낮춰 대피한다. */
      const successMoves = await gameShortestKeys(page);
      if ((await page.locator('.k-posture-chip').getAttribute('data-posture')) !== 'crouch') await page.locator('[data-coach="kids-posture"]').click();
      for (const m of successMoves) {
        await page.keyboard.press(m);
        await page.waitForTimeout(70);
      }
      await page.waitForTimeout(500);
      if ((await page.locator('.k-report-view').count()) === 0) await page.locator('[data-coach="kids-quit"]').click();
      await page.waitForSelector('.k-report-view');
      const head = await page.locator('.k-report-banner h2').innerText();
      assert(head.includes('무사히'), `성공하지 못했다: ${head}`);
      const successTones = await page.evaluate(
        () => (window as unknown as { __soundProbe: { successTones: number } }).__soundProbe.successTones,
      );
      /* 도·미·솔·높은 도의 두 겹, 모두 여덟 음. 실패 결과에는 이 화음이 없다. */
      assert(successTones >= 8, `성공 화음이 ${successTones}/8음만 시작됐다`);
      await page.locator('[data-coach="kids-replay3d-open"]').click();
      await page.waitForSelector('.k-replay');
      const max = Number((await page.locator('.k-replay-range').getAttribute('max')) ?? 0);
      await page.locator('.k-replay-range').fill(String(Math.max(0, max - 3)));
      await page.waitForTimeout(200);
      await page.locator('[data-coach="kids-replay-play"]').click();
      await page.waitForSelector('.k-ending', { timeout: 120000 });
      const txt = await page.locator('.k-ending-card').innerText();
      assert(txt.includes('무사히 나왔어'), `마지막 장면 문구: ${txt.slice(0, 30)}`);
      assert(/\d+초/.test(txt), '걸린 시간이 없다');
      await page.locator('.k-ending-actions .k-tb', { hasText: '결과로 돌아가기' }).click();
      await page.waitForTimeout(300);
      assert((await page.locator('.k-ending').count()) === 0, '마지막 장면이 안 닫힌다');
      await page.locator('[data-coach="kids-edit-plan"]').click();
      await page.waitForSelector('svg.k-stage');
    }));

    await check('집 외곽을 고른 뒤 같은 단계에서 독립실을 놓고 크기와 위치를 바꾼다 (설계서 v1.9 §15)', async () => {
      await page.evaluate(() => window.localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      await page.evaluate(() => window.localStorage.clear());
      await continueAfterWelcome('.k-onboard');
      await page.waitForSelector('.k-onboard');
      await page.locator('[data-start-path="starter"]').click();
      assert((await page.locator('[data-direct-method]').count()) === 2, '직접 그리기 두 방법이 없다');
      await page.locator('[data-direct-method="shape"]').click();
      assert((await page.locator('[data-shell]').count()) === 8, '집 테두리가 여덟 가지가 아니다');
      await page.locator('[data-shell="bend-left"]').click();
      assert((await page.locator('.k-shell-preview [data-wall-mode="closed"]').count()) === 0, '집 모양을 고를 때 방이 미리 생겼다');
      await page.locator('[data-shell-plan-start]').click();
      await page.waitForTimeout(800);
      assert((await page.locator('.k-stage [data-house-shell="true"]').count()) === 1, '캔버스의 집 외곽선이 하나가 아니다');
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'spaces', '집을 만든 뒤 공간 용도 설정 단계로 가지 않는다');
      assert((await page.locator('.k-stage [data-kind="furniture"], .k-stage [data-kind="marker"]').count()) === 0, '구조를 맞추기 전에 가구나 표시가 생겼다');
      const emptyPlan = await kidsPlan(page);
      const roomCell = await planPoint(page, emptyPlan, 4, 4);
      await page.locator('[data-block-id="bedroom"]').click();
      await page.mouse.click(roomCell.x, roomCell.y);
      await page.waitForTimeout(800);
      assert((await page.locator('.k-stage [data-wall-mode="closed"]').count()) === 1, '빈 집 안에 독립실을 놓지 못했다');
      assert((await page.locator('.k-stage [data-wall-mode="zone"]').count()) >= 1, '독립실을 놓은 뒤 남은 열린 바닥이 사라졌다');
      assert((await kidsSave(page)).blocks >= 2, '직접 만든 구조가 저장되지 않았다');
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'spaces', '방을 놓은 뒤 같은 실·문·창 단계에 머물지 않는다');

      await page.waitForTimeout(750);
      const before = await kidsPlan(page);
      let move: { room: BrowserBlock; rect: BrowserRect; dx: number; dy: number } | null = null;
      for (const room of before.blocks.filter((block) => block.kind === 'room' && block.wallMode !== 'zone' && block.rect)) {
        const base = room.rect as BrowserRect;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const rect = { ...base, x: base.x + dx, y: base.y + dy };
          if (validShellRoomRect(before, room.id, rect)) {
            move = { room, rect, dx, dy };
            break;
          }
        }
        if (move) break;
      }
      assert(Boolean(move), '실제로 한 칸 옮길 수 있는 독립실이 없다');
      if (!move || !move.room.rect) throw new Error('방 이동 후보가 없다');
      const from = { x: Math.floor(move.room.rect.x + move.room.rect.w / 2), y: Math.floor(move.room.rect.y + move.room.rect.h / 2) };
      await dragPlanCells(page, before, from, { x: from.x + move.dx, y: from.y + move.dy });
      await page.waitForTimeout(750);
      const afterMove = await kidsPlan(page);
      const movedRoom = afterMove.blocks.find((block) => block.id === move!.room.id);
      assert(Boolean(movedRoom?.rect && movedRoom.rect.x === move.rect.x && movedRoom.rect.y === move.rect.y), '방 안을 끌어도 방이 이동하지 않았다');

      const base = movedRoom?.rect;
      assert(Boolean(base), '옮긴 방의 사각형이 사라졌다');
      if (!base) throw new Error('옮긴 방이 없다');
      const resizeOptions = [
        { handle: 'e', dx: 1, dy: 0, rect: { ...base, w: base.w + 1 } },
        { handle: 'w', dx: -1, dy: 0, rect: { ...base, x: base.x - 1, w: base.w + 1 } },
        { handle: 's', dx: 0, dy: 1, rect: { ...base, h: base.h + 1 } },
        { handle: 'n', dx: 0, dy: -1, rect: { ...base, y: base.y - 1, h: base.h + 1 } },
      ];
      const resize = resizeOptions.find((candidate) => validShellRoomRect(afterMove, move!.room.id, candidate.rect));
      assert(Boolean(resize), '실제로 한 칸 늘릴 수 있는 독립실 방향이 없다');
      if (!resize) throw new Error('방 크기 후보가 없다');
      const handle = page.locator(`[data-handle="${resize.handle}"]`);
      await handle.waitFor({ state: 'visible' });
      const handleBox = await handle.boundingBox();
      const stageBox = await page.locator('svg.k-stage').boundingBox();
      assert(Boolean(handleBox && stageBox), '방 크기 손잡이나 도면이 보이지 않는다');
      if (!handleBox || !stageBox) throw new Error('방 크기 손잡이가 없다');
      const hx = handleBox.x + handleBox.width / 2;
      const hy = handleBox.y + handleBox.height / 2;
      await page.mouse.move(hx, hy);
      await page.mouse.down();
      await page.mouse.move(hx + resize.dx * (stageBox.width / afterMove.grid.width), hy + resize.dy * (stageBox.height / afterMove.grid.height), { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(750);
      const afterResize = await kidsPlan(page);
      const resizedRoom = afterResize.blocks.find((block) => block.id === move!.room.id);
      assert(Boolean(resizedRoom?.rect && JSON.stringify(resizedRoom.rect) === JSON.stringify(resize.rect)), '손잡이를 끌어도 방 크기가 바뀌지 않았다');
      const shell = new Set((afterResize.shell?.cells ?? []).map((cell) => `${cell.x},${cell.y}`));
      const floor = new Set<string>();
      let overlap = false;
      for (const room of afterResize.blocks.filter((block) => block.kind === 'room' && block.rect)) {
        const rect = room.rect as BrowserRect;
        for (let y = rect.y; y < rect.y + rect.h; y += 1) for (let x = rect.x; x < rect.x + rect.w; x += 1) {
          const key = `${x},${y}`;
          if (floor.has(key)) overlap = true;
          floor.add(key);
        }
      }
      assert(!overlap && shell.size === floor.size && [...shell].every((key) => floor.has(key)), '방 이동·크기 변경 뒤 외곽 바닥이 겹치거나 비었다');
      await page.locator('[data-build-next]').click();
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'furniture', '배치·크기를 마친 뒤 바로 가구 단계로 가지 않는다');
    });

    await check('Juwonmom MP3 176개를 Chromium이 실제 음성으로 모두 해독한다', async () => {
      assert(appVoiceResponses.length > 0, '앱 말풍선이 MP3 파일을 한 번도 요청하지 않았다');
      assert(
        appVoiceResponses.some((response) => response.status === 200 && response.contentType === 'audio/mpeg'),
        `앱 MP3 요청이 정상 응답하지 않았다: ${JSON.stringify(appVoiceResponses.slice(0, 3))}`,
      );
      const audioContext = await browser!.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' });
      const audioPage = await audioContext.newPage();
      await audioPage.goto(server.url, { waitUntil: 'networkidle' });
      const result = await audioPage.evaluate(async () => {
        const manifestResponse = await fetch('voice/manifest.json');
        if (!manifestResponse.ok) return { count: 0, failed: [`manifest HTTP ${manifestResponse.status}`], minDuration: 0 };
        const manifest = await manifestResponse.json() as { items: Array<{ filename: string }> };
        const decoder = new AudioContext();
        const failed: string[] = [];
        let minDuration = Number.POSITIVE_INFINITY;
        for (let start = 0; start < manifest.items.length; start += 8) {
          const batch = manifest.items.slice(start, start + 8);
          await Promise.all(batch.map(async ({ filename }) => {
            try {
              const response = await fetch(`voice/${filename}`);
              if (!response.ok || response.headers.get('content-type') !== 'audio/mpeg') throw new Error(`HTTP ${response.status}`);
              const decoded = await decoder.decodeAudioData(await response.arrayBuffer());
              if (!Number.isFinite(decoded.duration) || decoded.duration < 0.4) throw new Error(`길이 ${decoded.duration}`);
              minDuration = Math.min(minDuration, decoded.duration);
            } catch (error) {
              failed.push(`${filename}: ${error instanceof Error ? error.message : String(error)}`);
            }
          }));
        }
        await decoder.close();
        return { count: manifest.items.length, failed, minDuration };
      });
      await audioContext.close();
      assert(result.count === 176, `MP3 매니페스트가 ${result.count}/176개다`);
      assert(result.failed.length === 0, `해독 실패 ${result.failed.length}개: ${result.failed.slice(0, 3).join(' | ')}`);
      assert(result.minDuration >= 0.4, `가장 짧은 MP3가 ${result.minDuration}초다`);
    });

    await check('이름표를 비워도 시작되고, 6학년은 보통으로 시작하며, 다시 오면 이름표가 채워져 있다 (설계서 v1.18 §3)', async () => {
      const tagContext = await browser!.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
      const tagPage = await tagContext.newPage();
      const errors: string[] = [];
      tagPage.on('pageerror', (error) => errors.push(error.message));
      await tagPage.goto(server.url, { waitUntil: 'networkidle' });
      await tagPage.locator('[data-coach="kids-welcome-start"]').click();
      await tagPage.waitForSelector('.k-profile');
      /* 아무것도 적지 않고 시작 — 막지 않는다 */
      await tagPage.locator('[data-coach="kids-profile-start"]').click();
      await tagPage.waitForSelector('.k-app');
      assert((await tagPage.locator('[data-coach="kids-name-tag"]').innerText()).includes('3학년 나'), '빈 이름표가 `3학년 나`로 보이지 않는다');
      assert((await gradeLabel(tagPage)).includes('쉬움'), '학년을 안 고르면 쉬움으로 시작해야 한다');
      /* 지도를 하나 만들어 저장한 뒤 다시 온다 */
      await tagPage.locator('[data-start-path="template"]').click();
      await tagPage.locator('[data-template="apt_2room"]').click();
      await tagPage.locator('[data-coach="kids-plan-start"]').click();
      await tagPage.waitForTimeout(900);
      await tagPage.goto(server.url, { waitUntil: 'networkidle' });
      await tagPage.locator('[data-coach="kids-welcome-start"]').click();
      await tagPage.waitForSelector('.k-profile');
      await tagPage.waitForTimeout(200);
      assert((await tagPage.locator('[data-profile="grade"] [data-grade="3"]').getAttribute('aria-pressed')) === 'true', '지난번 학년이 미리 골라져 있지 않다');
      assert((await tagPage.locator('[data-coach="kids-profile-start"]').innerText()).includes('이어서'), '그리던 지도가 있는데 이어서 하기로 바뀌지 않았다');
      /* 6학년으로 바꾸고 이름을 적는다 — 저장된 수준(쉬움)은 그대로 둔다 */
      await tagPage.locator('[data-profile="name"]').fill('하늘이');
      await tagPage.locator('[data-profile="grade"] [data-grade="6"]').click();
      await tagPage.locator('[data-coach="kids-profile-start"]').click();
      await tagPage.waitForSelector('.k-app');
      assert((await tagPage.locator('[data-coach="kids-name-tag"]').innerText()).includes('6학년 하늘이'), '바꾼 이름표가 반영되지 않았다');
      assert((await gradeLabel(tagPage)).includes('쉬움'), '그리던 지도가 있으면 저장된 수준을 따라야 한다');
      assert((await tagPage.locator('svg.k-stage [data-wall-mode]').count()) > 0, '그리던 지도가 다시 열리지 않았다');
      /* 새 PC(저장 없음)에서 6학년은 보통으로 시작한다 */
      await tagPage.evaluate(() => window.localStorage.clear());
      await tagPage.goto(server.url, { waitUntil: 'networkidle' });
      await tagPage.locator('[data-coach="kids-welcome-start"]').click();
      await tagPage.waitForSelector('.k-profile');
      await tagPage.locator('[data-profile="grade"] [data-grade="6"]').click();
      await tagPage.locator('[data-coach="kids-profile-start"]').click();
      await tagPage.waitForSelector('.k-app');
      assert((await gradeLabel(tagPage)).includes('보통'), '6학년이 보통으로 시작하지 않는다');
      /* 자동 저장은 600ms 뒤에 쓴다 */
      await tagPage.waitForTimeout(900);
      const saved = await tagPage.evaluate(() => JSON.parse(window.localStorage.getItem('evac-kids-v1') ?? '{}')) as { schemaVersion?: number; profile?: Record<string, unknown> };
      assert(saved.schemaVersion === 4, `저장 형식이 v${saved.schemaVersion}다`);
      assert(saved.profile !== undefined && !('schoolName' in saved.profile) && !('className' in saved.profile), '저장 파일에 학교·반이 남아 있다');
      assert(errors.length === 0, errors.slice(0, 2).join(' | '));
      await tagContext.close();
    });

    await check('설치 안내 페이지 — 웹 바로 쓰기와 세 갈래가 있고 꾸러미·매니페스트·서비스 워커가 실제로 응답한다 (설계서 v1.18 §5·§6 · v1.20 §2)', async () => {
      const dlContext = await browser!.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
      const dl = await dlContext.newPage();
      const errors: string[] = [];
      dl.on('pageerror', (e) => errors.push(e.message));
      await dl.goto(new URL('download/', server.url).href, { waitUntil: 'networkidle' });
      await dl.waitForSelector('[data-screen="download"]');
      assert((await dl.locator('[data-download-card]').count()) === 2, '설치 갈래가 두 장이 아니다');
      assert((await dl.locator('[data-release]').count()) >= 3, '판 기록이 없다');
      assert((await dl.locator('[data-release].current').count()) === 1, '지금 판이 표시되지 않았다');
      const releasesRes = await dl.request.get(new URL('download/releases.json', server.url).href);
      assert(releasesRes.status() === 200, `판 기록 파일 ${releasesRes.status()}`);
      assert(((await releasesRes.json()) as { releases: unknown[] }).releases.length >= 3, '판 기록 파일이 비었다');
      /* 설치하지 않고 웹에서 바로 쓰는 길이 첫 줄에 있고, 주소는 지금 서버의 것이다 (설계서 v1.20 §2.1) */
      const webHref = await dl.locator('[data-coach="kids-download-web"]').getAttribute('href');
      assert(webHref === '/', `웹 바로 쓰기 주소가 첫 화면이 아니다: ${webHref}`);
      const address = (await dl.locator('[data-web-address]').innerText()).trim();
      assert(address === new URL('/', server.url).href, `웹 주소 표시가 지금 서버와 다르다: ${address}`);
      const text = await dl.locator('[data-screen="download"]').innerText();
      for (const word of ['설치하지 않아도 돼', '웹에서 바로 쓰기', '판 기록', '오프라인 꾸러미', '윈도우 설치 파일', '선생님·보호자께', '추가 정보']) assert(text.includes(word), `안내에 ${word}가 없다`);
      assert(!/점수|등급|순위|대시보드/.test(text), '안내에 점수·대시보드 문구가 있다');
      const zipHref = await dl.locator('[data-coach="kids-download-zip"]').getAttribute('href');
      assert(Boolean(zipHref?.endsWith('/download/home-escape-map-offline.zip')), `꾸러미 주소가 다르다: ${zipHref}`);
      if (fs.existsSync(path.join(root, 'dist', 'home-escape-map-offline.zip'))) {
        const zip = await dl.request.get(new URL(zipHref ?? '', dl.url()).href);
        assert(zip.status() === 200, `꾸러미가 응답하지 않는다: ${zip.status()}`);
        const body = await zip.body();
        assert(body.length > 3 * 1024 * 1024 && body.readUInt32LE(0) === 0x04034b50, `꾸러미가 ZIP 이 아니다: ${body.length}바이트`);
        assert(/\d+\.\d+MB/.test(text), '꾸러미 크기가 안내에 없다');
      } else {
        process.stdout.write('    --  꾸러미 응답 검사 건너뜀 (npm run build:standalone 을 먼저 실행한다)\n');
      }
      const manifestRes = await dl.request.get(new URL('manifest.webmanifest', server.url).href);
      assert(manifestRes.status() === 200, `매니페스트 ${manifestRes.status()}`);
      const manifest = (await manifestRes.json()) as { name: string; start_url: string; icons: Array<{ src: string }> };
      assert(manifest.name === '우리집 대피지도' && manifest.start_url === '/' && manifest.icons.length === 3, `매니페스트 내용이 다르다: ${JSON.stringify(manifest).slice(0, 80)}`);
      for (const icon of manifest.icons) assert((await dl.request.get(new URL(icon.src, server.url).href)).status() === 200, `아이콘이 없다: ${icon.src}`);
      const swRes = await dl.request.get(new URL('sw.js', server.url).href);
      assert(swRes.status() === 200 && (await swRes.text()).includes('const PRECACHE = ['), '서비스 워커가 없다');
      const manifestLink = await dl.locator('link[rel="manifest"]').getAttribute('href');
      assert(manifestLink === '/manifest.webmanifest', `매니페스트 링크가 다르다: ${manifestLink}`);
      /* 바깥 주소로 나가는 링크가 없다 — 설치 파일도 같은 사이트 안에서 받는다 */
      const outsideLinks = await dl.locator('[data-screen="download"] a[href^="http"]').count();
      assert(outsideLinks === 0, `안내 페이지에 바깥 링크가 ${outsideLinks}개 있다`);
      if ((await dl.locator('[data-desktop-state="ready"]').count()) === 1) {
        for (const [link, name] of [['kids-download-desktop', 'HomeEscapeMap-Setup-'], ['kids-download-portable', 'HomeEscapeMap-Portable-']] as const) {
          const href = await dl.locator(`[data-coach="${link}"]`).getAttribute('href');
          assert(Boolean(href?.includes(`/download/${name}`) && href.endsWith('.exe')), `${link} 주소가 다르다: ${href}`);
          const head = await dl.request.head(new URL(href ?? '', dl.url()).href);
          assert(head.status() === 200, `설치 파일이 응답하지 않는다: ${href} ${head.status()}`);
        }
        /* 새 판 안내 — 데스크톱 앱이 읽는 latest.json 은 판·설치판 이름·sha256 을 품는다 (설계서 v2.0 §7) */
        const latestRes = await dl.request.get(new URL('download/latest.json', server.url).href);
        assert(latestRes.status() === 200, `latest.json ${latestRes.status()}`);
        const latest = (await latestRes.json()) as { version: string; setup: { name: string; sha256: string; size: number } };
        assert(/^\d+\.\d+\.\d+$/.test(latest.version) && latest.setup?.name.includes(latest.version) && /^[0-9a-f]{64}$/.test(latest.setup.sha256) && latest.setup.size > 1024 * 1024, `latest.json 내용이 다르다: ${JSON.stringify(latest).slice(0, 120)}`);
      } else {
        assert((await dl.locator('[data-desktop-state="pending"]').count()) === 1, '설치 파일이 없는데 준비 중 안내도 없다');
        process.stdout.write('    --  설치 파일 링크 검사 건너뜀 (dist/desktop/ 에 설치 파일이 없다 — 배포 워크플로가 Release 에서 받는다)\n');
      }
      const small = (await hitTargets(dl)).filter((t) => t.w < 48 || t.h < 48);
      assert(small.length === 0, `48px 미만: ${small.slice(0, 4).map((t) => `${t.name}(${t.w}×${t.h})`).join(', ')}`);
      for (const width of [1024, 1280, 1440, 1920]) {
        await dl.setViewportSize({ width, height: 900 });
        await dl.waitForTimeout(80);
        const overflow = await dl.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert(overflow <= 1, `${width}px 안내 페이지에 가로 넘침 ${overflow}px`);
      }
      await dl.locator('[data-coach="kids-download-home"]').click();
      await dl.waitForSelector('.k-welcome');
      assert(errors.length === 0, errors.slice(0, 2).join(' | '));
      await dlContext.close();
    });

    await check('브라우저에 설치하면 인터넷 없이도 첫 화면·설치 안내·이름표가 열린다 (설계서 v1.18 §5.1)', async () => {
      const swContext = await browser!.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
      const sw = await swContext.newPage();
      const errors: string[] = [];
      sw.on('pageerror', (e) => errors.push(e.message));
      await sw.goto(server.url, { waitUntil: 'networkidle' });
      await sw.waitForSelector('.k-welcome');
      const state = await sw.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        const keys = await caches.keys();
        return { active: registration.active?.state ?? '', keys };
      });
      assert(state.active === 'activated' || state.active === 'activating', `서비스 워커 상태가 ${state.active}다`);
      assert(state.keys.some((key) => key.startsWith('hem-')), `앱 껍데기 캐시가 없다: ${state.keys.join(',')}`);
      /* 첫 방문 화면은 아직 워커가 제어하지 않을 수 있다 — 한 번 다시 연다 */
      await sw.reload({ waitUntil: 'networkidle' });
      await sw.waitForSelector('.k-welcome');
      await sw.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      assert((await sw.locator('[data-coach="kids-update"]').count()) === 0, '첫 설치인데 새 판 알림이 떴다');
      /* 서버가 503 만 돌려준다 — 브라우저 오프라인 흉내는 워커 요청에 닿지 않는다 */
      server.setOffline(true);
      try {
        assert((await sw.request.get(server.url)).status() === 503, '오프라인 흉내가 켜지지 않았다');
        await sw.reload();
        await sw.waitForSelector('.k-welcome', { timeout: 15000 });
        const images = await sw.locator('.k-welcome img').evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0));
        assert(images.length >= 2 && images.every(Boolean), '오프라인에서 소개 그림이 보이지 않는다');
        await sw.goto(new URL('download/', server.url).href);
        await sw.waitForSelector('[data-screen="download"]', { timeout: 15000 });
        await sw.goto(server.url);
        await sw.waitForSelector('.k-welcome', { timeout: 15000 });
        await sw.locator('[data-coach="kids-welcome-start"]').click();
        await sw.waitForSelector('.k-profile');
        await sw.locator('[data-profile="grade"] [data-grade="2"]').click();
        await sw.locator('[data-coach="kids-profile-start"]').click();
        await sw.waitForSelector('.k-app', { timeout: 15000 });
        await sw.waitForSelector('.k-onboard');
        /* 선캐시가 아닌 MP3 는 503 을 받아도 오류로 번지지 않아야 한다 — 글만 남고 조용히 멈춘다 */
        await sw.waitForTimeout(800);
      } finally {
        server.setOffline(false);
      }
      assert(errors.length === 0, errors.slice(0, 2).join(' | '));
      await swContext.close();
    });

    await check('창을 반쪽(900px)으로 붙여도 앱이 열리고, 800px 미만에서만 PC 안내가 막는다 (설계서 v2.0 §11)', async () => {
      const half = await browser!.newContext({ viewport: { width: 900, height: 760 }, locale: 'ko-KR' });
      const h = await half.newPage();
      await h.goto(server.url, { waitUntil: 'networkidle' });
      await h.locator('[data-coach="kids-welcome-start"]').click();
      await h.waitForSelector('.k-profile', { timeout: 8000 });
      assert((await h.locator('.k-pc-only').count()) === 0, '900px 창에서 PC 안내가 앱을 막았다');
      await half.close();
      const narrow = await browser!.newContext({ viewport: { width: 760, height: 844 }, locale: 'ko-KR' });
      const p = await narrow.newPage();
      const errs: string[] = [];
      p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(server.url, { waitUntil: 'networkidle' });
      await p.waitForSelector('.k-welcome');
      assert((await p.locator('.k-pc-only').count()) === 0, '소개 전에 PC 안내가 먼저 보인다');
      await p.locator('[data-coach="kids-welcome-start"]').click();
      await p.waitForSelector('.k-pc-only');
      assert((await p.locator('.k-app').count()) === 0, '좁은 화면에서 앱이 실행됐다');
      assert((await p.locator('.k-onboard').count()) === 0, '좁은 화면에서 온보딩이 실행됐다');
      assert((await p.locator('.k-pc-only').innerText()).includes('PC에서 이용해 주세요'), 'PC 안내 문구가 없다');
      assert(errs.length === 0, errs.slice(0, 2).join(' | '));
      await narrow.close();
    });

    await context.close();

    /* 오프라인 배포본이 있으면 file:// 에서 인터넷 없이 동작하는지 본다 */
    const standalone = path.join(root, 'dist', 'home-escape-map.html');
    if (fs.existsSync(standalone)) {
      await check('오프라인 배포본은 V2 이고 file:// 에서 바깥 요청 없이 열린다 (NFR-1 · 대장 #110)', async () => {
        const off = await browser!.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR', offline: true });
        const p3 = await off.newPage();
        const pageErrors: string[] = [];
        const outside: string[] = [];
        p3.on('pageerror', (e) => pageErrors.push(e.message));
        p3.on('request', (r) => {
          if (!/^(file|data|blob):/.test(r.url())) outside.push(r.url());
        });
        await p3.goto(`file:///${standalone.split(path.sep).join('/')}`);
        await p3.waitForSelector('[data-testid="start"]', { timeout: 20000 });
        await p3.waitForFunction(() => [...document.images].every((img) => img.complete));
        const images = await p3.locator('.welcome img').evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).naturalWidth > 0));
        assert(images.length >= 2 && images.every(Boolean), '오프라인 그림이 보이지 않는다');
        assert((await p3.locator('[data-testid="install-link"]').count()) === 0, '오프라인 HTML 에 설치 안내 링크가 보인다');
        await p3.locator('[data-testid="start"]').click();
        await p3.locator('[data-testid="grade-3"]').click();
        await p3.locator('[data-testid="tag-done"]').click();
        await p3.waitForSelector('.studio', { timeout: 20000 });
        assert(outside.length === 0, `외부 요청 ${outside.length}건: ${outside.slice(0, 2).join(', ')}`);
        assert(pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
        await off.close();
      });
    } else {
      process.stdout.write('    --  오프라인 배포본 검증 건너뜀 (npm run build:standalone 을 먼저 실행한다)\n');
    }
  } finally {
    if (browser) await browser.close();
    await server.close();
  }

  const total = passed + failures.length;
  process.stdout.write(`\n  ${passed}/${total} 시나리오 통과\n`);
  if (failures.length) {
    process.stdout.write(`\n실패 ${failures.length}건:\n${failures.map((f) => `  - ${f}`).join('\n')}\n\n`);
    process.exit(1);
  }
  process.stdout.write('\n  전 시나리오 통과\n\n');
}

main().catch((e) => {
  process.stderr.write(`\n  실행 오류: ${e instanceof Error ? e.stack : String(e)}\n\n`);
  process.exit(1);
});
