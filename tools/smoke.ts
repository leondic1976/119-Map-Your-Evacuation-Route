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
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function serve(dir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
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

/** 도면에서 셀 (x, y) 한가운데의 화면 좌표 */
async function kidsCell(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await page.locator('svg.k-stage').boundingBox();
  if (!box) throw new Error('도면이 없다');
  const cs = box.width / 24;
  return { x: box.x + (x + 0.5) * cs, y: box.y + (y + 0.5) * cs };
}

async function kidsSave(page: Page): Promise<{ blocks: number; primary: number; alternate: number; attempts: number }> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('evac-kids-v1');
    if (!raw) return { blocks: 0, primary: 0, alternate: 0, attempts: 0 };
    const f = JSON.parse(raw);
    return {
      blocks: (f.plan?.blocks ?? []).length as number,
      primary: (f.routes?.fire?.primary?.waypoints ?? []).length as number,
      alternate: (f.routes?.fire?.alternate?.waypoints ?? []).length as number,
      attempts: (f.progress?.attempts ?? 0) as number,
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
      };
      Object.defineProperty(window, '__soundProbe', { configurable: true, value: probe });

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
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(server.url, { waitUntil: 'networkidle' });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });

    await check('첫 소개 화면이 목적·공식 캐릭터·기관·큰 시작 단추를 보여 주고 온보딩으로 이어진다 (설계서 v1.6 §8)', async () => {
      await page.waitForSelector('.k-welcome');
      assert((await page.locator('.k-app').count()) === 0, '소개 전에 편집 앱이 실행됐다');
      assert((await page.locator('.k-welcome h1').innerText()).includes('우리집\n대피지도 그리기'), '소개 제목이 없다');
      const purpose = await page.locator('.k-welcome-purpose').innerText();
      assert(purpose.includes('화재') && purpose.includes('신속하게 대피'), `교육 목적이 빠졌다: ${purpose}`);
      assert((await page.locator('.k-welcome-missions li').count()) === 3, '배울 내용 세 가지가 아니다');
      const agency = await page.locator('.k-welcome-agency').innerText();
      assert(agency.includes('부평소방서'), `기관 표기가 없다: ${agency}`);
      const images = await page.locator('.k-welcome img').evaluateAll((imgs) =>
        imgs.map((img) => ({ alt: img.getAttribute('alt'), loaded: (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0 })),
      );
      assert(images.length === 3 && images.every((img) => img.loaded), `소개 그림을 못 읽었다: ${JSON.stringify(images)}`);
      assert(images.some((img) => img.alt?.includes('영이, 일구, 웅이')), '공식 캐릭터 대체 글이 없다');
      const start = page.locator('[data-coach="kids-welcome-start"]');
      const box = await start.boundingBox();
      assert(box !== null && box.height >= 72 && box.width >= 300, `시작 단추가 작다: ${JSON.stringify(box)}`);
      await start.click();
      await page.waitForSelector('.k-onboard');
    });

    await check('소개 화면을 지나면 집 모양 고르기가 뜬다 — 고를 화면이 하나뿐이다', async () => {
      await page.waitForSelector('.k-app');
      await page.waitForSelector('.k-onboard');
      assert((await page.locator('.k-tmpl').count()) === 10, '시작 평면 8종 + 빈 도면 + 잘 모르겠어 (설계서 v1.3 §2.2)');
      assert((await page.locator('.k-tabs').count()) === 0, '기본판에 재난 탭이 있다 (FR-2.1 개정)');
      assert((await page.locator('.k-ask input, textarea').count()) === 0, '자유 입력 UI 가 있다 (의견 3)');
    });

    /*
     * 아이가 처음 만나는 화면이라 여기가 제일 쉬워야 한다.
     * 어른 말("타워형"·"복층"·"다세대")이 그대로 나오면 실패다.
     */
    await check('쉬움에서 집 모양 이름이 아이 말로 나온다 (FR-7.17)', async () => {
      const names = await page.locator('.k-tmpl b').allInnerTexts();
      const adult = ['타워형', '복층', '다세대', '원룸', '단독주택'];
      const found = adult.filter((w) => names.some((n) => n.includes(w)));
      assert(found.length === 0, `어른 말이 남았다: ${found.join(', ')}`);
      for (const want of ['방이 빙 둘러싼 아파트', '위아래 두 층인 집', '마당 있는 집', '방 하나인 집', '빌라']) {
        assert(names.includes(want), `"${want}" 카드가 없다 — ${names.join(' | ')}`);
      }
      /* 가운뎃점 든 짧은 말은 줄 끝에서 갈라진다 (작업지침 §5) */
      assert(!names.some((n) => n.includes('·')), `가운뎃점이 남았다: ${names.filter((n) => n.includes('·')).join(', ')}`);
    });

    await check('「잘 모르겠어」를 한 번 누르면 방 두 개 아파트로 시작한다 (FR-7.18)', async () => {
      const card = page.locator('[data-template="unsure"]');
      const blurb = await card.locator('small').innerText();
      assert(blurb.includes('어른') && blurb.includes('바꿀 수 있어'), `안심 문구가 없다: ${blurb}`);
      await card.click();
      /* 되묻지 않는다 — 바로 다음 물음(1층·반지하)으로 간다 */
      await page.waitForTimeout(700);
      const rooms = await page.locator('.k-stage [data-kind="room"]').count();
      assert(rooms === 8, `방 두 개 아파트가 안 실렸다 — 방 ${rooms}개`);
      /* 다음 시나리오가 처음부터 시작하도록 되돌린다 */
      await page.evaluate(() => window.localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('.k-onboard');
    });

    await check('온보딩 4회 조작으로 게임 시작 — 집 모양·내 방·나중에·시작 (설계서 v1.6 §2)', async () => {
      await page.locator('[data-template="apt_2room"]').click(); // 1
      await page.waitForTimeout(400);
      assert((await page.locator('.k-onboard').count()) === 0, '안내가 안 닫혔다');
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'mySpot', '내 방 단계가 아니다');
      const bubble = await page.locator('.k-bubble').innerText();
      assert(bubble.includes('네 방') || bubble.includes('자는 방'), `캐릭터 안내: ${bubble.slice(0, 40)}`);
      const room = await kidsCell(page, 10, 4); // 안방
      await page.mouse.click(room.x, room.y); // 3
      await page.waitForTimeout(300);
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'meeting', '만나는 곳 단계가 아니다');
      await page.locator('[data-coach="kids-meeting-later"]').click(); // 4
      await page.waitForTimeout(300);
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'ready', '준비 단계가 아니다');
      await page.locator('[data-coach="kids-start-game"]').click(); // 5
      await page.waitForSelector('.k-game');
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'game', '게임이 시작되지 않았다');
      const rooms = await page.locator('.k-stage [data-kind="room"]').count();
      assert(rooms === 8, `방 ${rooms}개`);
    });

    await check('게임 — 연습 모드 기본, 위험장이 그려지고, 움직이고, 그만두면 리포트가 나온다', async () => {
      const top = await page.locator('.k-game-top').innerText();
      assert(top.includes('연습'), `연습 모드가 아니다: ${top}`);
      await page.waitForTimeout(700);
      assert((await page.locator('.k-stage [data-game-layer]').count()) === 1, '게임 층이 없다');
      assert((await page.locator('.k-stage [data-player]').count()) === 1, '플레이어가 없다');
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
      await page.locator('[data-coach="kids-quit"]').click();
      await page.waitForSelector('.k-report-view');
      const good = await page.locator('.k-report-col.good li').count();
      const fix = await page.locator('.k-report-col.fix li').count();
      assert(good >= 1, `잘한 점 ${good}개 (FR-10.3)`);
      assert(fix <= 3, `고칠 점 ${fix}개 (FR-10.4)`);
      const cols = await page.locator('.k-report-col').allInnerTexts();
      assert(cols[0].includes('잘한 점'), '잘한 점이 먼저 오지 않는다 (FR-10.5)');
      assert(!/점수|등급|순위/.test(await page.locator('.k-report-view').innerText()), '점수·등급이 있다 (FR-10.10)');
      await page.waitForTimeout(300);
      const save = await kidsSave(page);
      assert(save.attempts === 1, `시도 기록 ${save.attempts}`);
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

    await check('팔레트 8칸 — 클릭 두 번으로 표준 크기 방이 놓이고, 겹치면 거부된다 (FR-7.1 · FR-7.6)', async () => {
      const basics = await page.locator('.k-blocks.k-basic .k-block').count();
      assert(basics === 8, `기본 팔레트 ${basics}칸`);
      const before = (await kidsSave(page)).blocks;
      await page.locator('[data-block-id="bedroom"]').click(); // 1
      const empty = await kidsCell(page, 18, 2);
      await page.mouse.click(empty.x, empty.y); // 2 — 빈 곳
      await page.waitForTimeout(800);
      const after = (await kidsSave(page)).blocks;
      assert(after === before + 1, `방이 안 놓였다 ${before} → ${after}`);
      const rooms = await page.locator('.k-stage [data-kind="room"]').count();
      assert(rooms === 9, `방 ${rooms}개`);
      assert((await page.locator('[data-door-candidate]').count()) === 0, '없앤 문 후보가 도면에 나타났다');
      const doorlessBubble = await page.locator('.k-bubble').innerText();
      assert(doorlessBubble.includes('문이 하나도 없는 방'), `문 없는 방 해설이 나오지 않았다: ${doorlessBubble.slice(0, 60)}`);
      assert((await page.locator('[data-block-id="door"]').getAttribute('class'))?.includes('k-hl') === true, '해설이 문 도구를 가리키지 않는다');
      assert((await page.locator('.k-stage .kids-hl').count()) >= 1, '문 없는 방을 도면에서 강조하지 않는다');
      /* 하나 놓으면 팔레트에서 손을 뗀다 — 도면을 누를 때마다 계속 놓이지 않는다 (설계서 v1.5 §4) */
      assert((await page.locator('[data-block-id="bedroom"]').getAttribute('aria-pressed')) !== 'true', '놓은 뒤에도 장전이 남아 있다');

      /* 캐릭터가 가리킨 문을 골라 벽을 누르면 문이 놓이고 누락 강조가 사라진다 */
      await page.locator('[data-block-id="door"]').click();
      const wall = await kidsCell(page, 19, 2);
      await page.mouse.click(wall.x, wall.y);
      await page.waitForTimeout(800);
      assert((await kidsSave(page)).blocks === after + 1, '팔레트에서 고른 문이 놓이지 않았다');
      assert((await page.locator('[data-block-id="door"]').getAttribute('class'))?.includes('k-hl') !== true, '문을 놓은 뒤에도 누락 강조가 남았다');
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(500);

      /* 다시 골라야 또 놓인다. 이번엔 겹치는 곳이라 거부 */
      await page.locator('[data-block-id="bedroom"]').click();
      const overlap = await kidsCell(page, 9, 10);
      await page.mouse.click(overlap.x, overlap.y);
      await page.waitForTimeout(800);
      assert((await kidsSave(page)).blocks === after, '겹치는 방을 받아 줬다');
      const toast = await page.locator('.k-toast').innerText().catch(() => '');
      assert(toast.includes('겹친'), `안내 없음: ${toast}`);
      // 문 없는 방을 남겨 두면 뒤에서 "갇히는 방" 지적이 정당하게 잡힌다 — 되돌려 둔다
      await page.locator('[data-coach="kids-tool-select"]').click();
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(800);
      assert((await kidsSave(page)).blocks === before, '되돌리기가 안 됐다');
    });

    /* 팔레트가 한 줄에 셋 이상 (설계서 v1.6 §1) */
    await check('팔레트 칸이 좁아져 한 줄에 셋 이상 보인다 (설계서 v1.6 §1)', async () => {
      const perRow = await page.evaluate(() => {
        const cells = Array.from(document.querySelectorAll('.k-blocks.k-basic .k-block')) as HTMLElement[];
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

      /* 껐으면 다시 열어도 꺼져 있어야 한다 (설계서 v1.6 §3) */
      await page.reload({ waitUntil: 'networkidle' });
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
      const to = await kidsCell(page, 10, 5);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(900);
      const after = await kidsSave(page);
      assert(after.blocks === before.blocks, `옮기다 블록이 사라졌다 ${before.blocks} → ${after.blocks}`);
      assert((await planPrint(page)) !== print0, '여럿을 골랐는데 아무것도 안 움직였다');

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

      /* 「더보기」를 펴고 「표시」 갈래에서 동생을 고른다 */
      const more = page.locator('[data-block-id="more"]');
      if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
      await page.waitForTimeout(250);
      const cat = page.locator('.k-cats button', { hasText: '표시' });
      await cat.first().click();
      await page.waitForTimeout(250);
      const younger = page.locator('[data-block-id="sibling_younger"]');
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

    await check('더보기에서 소화기를 골라 놓고, 캐릭터가 처음 놓은 블록을 말한다', async () => {
      // 캐릭터가 더보기 안 항목을 가리켰으면 이미 펼쳐져 있다 — 그때는 다시 누르면 접힌다
      const moreBtn = page.locator('[data-block-id="more"]');
      if ((await moreBtn.getAttribute('aria-expanded')) !== 'true') await moreBtn.click();
      await page.locator('.k-cat', { hasText: '안전' }).click();
      await page.locator('[data-block-id="detector"]').click();
      const p = await kidsCell(page, 9, 5);
      const before = (await kidsSave(page)).blocks;
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(800);
      assert((await kidsSave(page)).blocks === before + 1, '감지기가 안 놓였다');
      const bubble = await page.locator('.k-bubble').innerText().catch(() => '');
      assert(bubble.includes('감지기'), `캐릭터 말: ${bubble.slice(0, 40)}`);
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
      await page.waitForSelector('.k-app');
      await page.waitForTimeout(400);
      assert((await page.locator('.k-onboard').count()) === 0, '복원했는데 안내가 또 떴다');
      assert((await page.locator('.k-stage [data-kind="room"]').count()) >= 8, '복원된 방이 적다');
    });

    await check('다시 해보기 — 같은 지도, 새 판. 시도 횟수가 는다', async () => {
      await page.locator('[data-coach="kids-start-game"]').click();
      await page.waitForSelector('.k-game');
      await page.waitForTimeout(500);
      await page.locator('[data-coach="kids-quit"]').click();
      await page.waitForSelector('.k-report-view');
      await page.locator('[data-coach="kids-replay"]').click();
      await page.waitForSelector('.k-game');
      await page.waitForTimeout(300);
      await page.locator('[data-coach="kids-quit"]').click();
      await page.waitForSelector('.k-report-view');
      await page.waitForTimeout(300);
      const save = await kidsSave(page);
      assert(save.attempts >= 3, `시도 ${save.attempts}`);
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

    await check('문을 한 번 누르면 열리고 다시 누르면 닫힌다 (설계서 v1.2 §2.4)', async () => {
      await page.locator('[data-coach="kids-tool-select"]').click();
      const door = page.locator('.k-stage [data-kind="opening"]').first();
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
      await page.waitForTimeout(800);
      const mid = await state();
      assert(mid !== before, '한 번 눌렀는데 안 바뀐다');
      await page.mouse.click(bb!.x + bb!.width / 2, bb!.y + bb!.height / 2);
      await page.waitForTimeout(800);
      assert((await state()) === before, '다시 눌렀는데 안 돌아온다');
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
      await page.locator('.k-top .k-tb', { hasText: '사용법' }).click();
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
      const to = { x: 18, y: 2 }; // 빈 자리
      for (let i = 0; i < Math.abs(to.x - from.x); i += 1) await page.keyboard.press(to.x > from.x ? 'ArrowRight' : 'ArrowLeft');
      for (let i = 0; i < Math.abs(to.y - from.y); i += 1) await page.keyboard.press(to.y > from.y ? 'ArrowDown' : 'ArrowUp');
      const now = await cellOf();
      assert(now.x === to.x && now.y === to.y, `커서가 ${now.x},${now.y} 에 있다`);
      const before = (await kidsSave(page)).blocks;
      await page.keyboard.press('Enter');
      await page.waitForTimeout(800);
      const after = (await kidsSave(page)).blocks;
      assert(after === before + 1, `방이 안 놓였다 ${before} → ${after}`);
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

    await check('3D 리플레이가 열리고 재생·시점 전환이 된다 (FR-11)', async () => {
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
      /* WebGL 을 못 쓰는 기기에서는 2D 로 내려간다 */
      const has3d = (await page.locator('.k-replay-canvas').count()) === 1;
      const has2d = (await page.locator('[data-fallback="2d"]').count()) === 1;
      assert(has3d || has2d, '3D 도 2D 도 없다');
      /* 기본은 집 전체 — 처음 보는 아이가 방향을 잃지 않는다 (설계서 v1.4 §2.1) */
      assert(
        (await page.locator('[data-view="dollhouse"]').getAttribute('aria-pressed')) === 'true',
        '집 전체가 기본 시점이 아니다',
      );
      await page.locator('[data-view="first"]').click();
      await page.waitForTimeout(300);
      assert((await page.locator('[data-view="first"]').getAttribute('aria-pressed')) === 'true', '시점이 안 바뀐다');
      await page.locator('[data-view="dollhouse"]').click();
      await page.waitForTimeout(300);
      /* 끌어서 둘러보기 — 시점이 움직이면 되돌리기 단추가 뜬다 */
      if (has3d) {
        const cv = await page.locator('.k-replay-canvas').boundingBox();
        if (cv) {
          await page.mouse.move(cv.x + cv.width / 2, cv.y + cv.height / 2);
          await page.mouse.down();
          await page.mouse.move(cv.x + cv.width / 2 + 140, cv.y + cv.height / 2 + 30, { steps: 6 });
          await page.mouse.up();
          await page.waitForTimeout(300);
          const back = page.locator('.k-r-panel .k-tb', { hasText: '시점 되돌리기' });
          assert((await back.count()) === 1, '끌어도 시점이 안 돈다');
          await back.click();
          await page.waitForTimeout(200);
        }
      }
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

      /* 화질을 낮춰도 화면이 살아 있다 (FR-11.10) */
      await page.locator('[data-quality="low"]').click();
      await page.waitForTimeout(700);
      assert((await page.locator('[data-quality="low"]').getAttribute('aria-pressed')) === 'true', '화질이 안 바뀐다');
      assert((await page.locator('.k-replay-canvas canvas').count()) === 1, '화질을 낮추니 그림이 사라졌다');

      /*
       * 닫기 단추가 정말 위에 있는지 먼저 확인한다 — 무엇에 덮여 있으면 여기서 잡힌다.
       * 실제로 누르는 것은 Esc 로 한다. 배포 검증 기계(소프트웨어 렌더링)에서는
       * 단추가 맨 위에 있고 화면 안에 있는데도 Playwright 의 누름이 시간을 넘긴다.
       * 사람이 못 누르는 것이 아니라 자동 조작 쪽 문제라, 같은 일을 하는 다른 길로 닫는다.
       * Esc 로 닫히는 것은 어차피 지켜야 하는 규칙이다 (작업지침 §5).
       */
      const onTop = await page.evaluate(() => {
        const el = document.querySelector('.k-r-panel .k-x') as HTMLElement | null;
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
    });

    await check('무사히 나오면 3D 마지막이 가족 장면으로 넘어간다 (설계서 v1.2 §8.6)', async () => {
      await page.locator('[data-coach="kids-start-game"]').click();
      await page.waitForTimeout(400);
      const anyway = page.locator('[data-coach="kids-start-anyway"]');
      if (await anyway.count()) await anyway.click();
      await page.waitForSelector('.k-game');
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        (window as unknown as { __soundProbe: { successTones: number } }).__soundProbe.successTones = 0;
      });
      /* 내 방(안방) → 복도 → 현관 → 현관문 */
      const successMoves = ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowRight'];
      for (const m of successMoves) {
        await page.keyboard.press(m);
        await page.waitForTimeout(120);
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
      await page.waitForSelector('.k-ending', { timeout: 20000 });
      const txt = await page.locator('.k-ending-card').innerText();
      assert(txt.includes('무사히 나왔어'), `마지막 장면 문구: ${txt.slice(0, 30)}`);
      assert(/\d+초/.test(txt), '걸린 시간이 없다');
      await page.locator('.k-ending-actions .k-tb', { hasText: '결과로 돌아가기' }).click();
      await page.waitForTimeout(300);
      assert((await page.locator('.k-ending').count()) === 0, '마지막 장면이 안 닫힌다');
      await page.locator('[data-coach="kids-edit-plan"]').click();
      await page.waitForSelector('svg.k-stage');
    });

    await check('빈 도면에서 시작해도 방을 놓을 수 있고 내 자리를 묻는다 (설계서 v1.2 §1.3)', async () => {
      await page.evaluate(() => window.localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('.k-onboard');
      await page.locator('[data-template="blank"]').click();
      await page.waitForTimeout(500);
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'edit', '빈 도면인데 내 자리부터 묻는다');
      await page.locator('[data-block-id="bedroom"]').click();
      const p = await kidsCell(page, 8, 6);
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(900);
      assert((await kidsSave(page)).blocks === 1, '빈 도면에 방이 안 놓인다');
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'mySpot', '첫 방 뒤에 내 자리를 안 묻는다');
    });

    await check('1024px 미만 화면에서는 PC 안내만 보이고 앱이 실행되지 않는다', async () => {
      const narrow = await browser!.newContext({ viewport: { width: 900, height: 844 }, locale: 'ko-KR' });
      const p = await narrow.newPage();
      const errs: string[] = [];
      p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(server.url, { waitUntil: 'networkidle' });
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
      await check('오프라인 배포본에서 소개부터 리포트까지 간다 (NFR-1)', async () => {
        const off = await browser!.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR', offline: true });
        const p3 = await off.newPage();
        const pageErrors: string[] = [];
        const outside: string[] = [];
        p3.on('pageerror', (e) => pageErrors.push(e.message));
        p3.on('request', (r) => {
          if (!r.url().startsWith('file:')) outside.push(r.url());
        });
        await p3.goto(`file:///${standalone.split(path.sep).join('/')}`);
        await p3.waitForSelector('.k-welcome', { timeout: 20000 });
        const welcomeImages = await p3.locator('.k-welcome img').evaluateAll((imgs) =>
          imgs.map((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0),
        );
        assert(welcomeImages.length === 3 && welcomeImages.every(Boolean), '오프라인 소개 그림이 보이지 않는다');
        await p3.locator('[data-coach="kids-welcome-start"]').click();
        await p3.waitForSelector('.k-onboard', { timeout: 20000 });
        await p3.locator('[data-template="apt_2room"]').click();
        await p3.waitForTimeout(400);
        const box = await p3.locator('svg.k-stage').boundingBox();
        assert(box !== null, '도면이 없다');
        const cs = box!.width / 24;
        await p3.mouse.click(box!.x + 10.5 * cs, box!.y + 4.5 * cs); // 내 방
        await p3.waitForTimeout(300);
        await p3.locator('[data-coach="kids-meeting-later"]').click();
        await p3.waitForTimeout(300);
        await p3.locator('[data-coach="kids-start-game"]').click();
        await p3.waitForSelector('.k-game', { timeout: 20000 });
        await p3.waitForTimeout(600);
        assert((await p3.locator('.k-stage [data-game-layer]').count()) === 1, '위험장이 안 그려졌다');
        await p3.locator('[data-coach="kids-quit"]').click();
        await p3.waitForSelector('.k-report-view');
        assert((await p3.locator('.k-report-col.good li').count()) >= 1, '잘한 점이 없다');
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
