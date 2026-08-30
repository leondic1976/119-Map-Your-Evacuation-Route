/**
 * 브라우저 실조작 검증.
 *
 * 정적 내보내기(out/)를 임시 서버로 띄우고 Chromium 으로 실제 화면을 눌러 본다.
 * 온보딩 → 그리기 → 경로 → 대피 연습 → 리포트 → 3D 리플레이 → 인쇄까지 한 번에 가고,
 * 세로 스마트폰과 오프라인 배포본(file://)도 같은 길을 걷는다.
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
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(server.url, { waitUntil: 'networkidle' });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });

    await check('열면 바로 집 모양 고르기가 뜬다 — 고를 화면이 하나뿐이다', async () => {
      await page.waitForSelector('.k-app');
      await page.waitForSelector('.k-onboard');
      assert((await page.locator('.k-tmpl').count()) === 9, '시작 평면 8종 + 빈 도면 (설계서 v1.2 §1.2)');
      assert((await page.locator('.k-tabs').count()) === 0, '기본판에 재난 탭이 있다 (FR-2.1 개정)');
      assert((await page.locator('.k-ask input, textarea').count()) === 0, '자유 입력 UI 가 있다 (의견 3)');
    });

    await check('온보딩 5회 조작으로 게임 시작 — 집 모양·1층·내 방·나중에·시작 (§2.5)', async () => {
      await page.locator('[data-template="apt_2room"]').click(); // 1
      await page.waitForSelector('[data-lowfloor="no"]');
      await page.locator('[data-lowfloor="no"]').click(); // 2
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
      // 장전은 그대로다 — 겹치는 곳을 누르면 거부
      assert((await page.locator('[data-block-id="bedroom"]').getAttribute('aria-pressed')) === 'true', '놓은 뒤 장전이 풀렸다');
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

    await check('문 후보 — 맞댄 벽의 “문?”을 한 번 누르면 문이 놓인다 (FR-7.3)', async () => {
      await page.locator('[data-coach="kids-tool-select"]').click();
      const cands = await page.locator('.k-stage [data-door-candidate]').count();
      assert(cands >= 1, `문 후보 ${cands}개`);
      const before = (await kidsSave(page)).blocks;
      await page.locator('.k-stage [data-door-candidate]').first().click();
      await page.waitForTimeout(800);
      assert((await kidsSave(page)).blocks === before + 1, '문이 안 놓였다');
      assert((await page.locator('.k-stage [data-door-candidate]').count()) === cands - 1, '후보가 안 줄었다');
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

    await check('말풍선이 도면을 가리지 않는다 (설계서 v1.2 §6.1)', async () => {
      await page.locator('[data-coach="kids-help"]').click();
      await page.waitForSelector('.k-bubble');
      const overlap = await page.evaluate(() => {
        const b = document.querySelector('.k-bubble')?.getBoundingClientRect();
        const s = document.querySelector('svg.k-stage')?.getBoundingClientRect();
        if (!b || !s) return -1;
        const w = Math.min(b.right, s.right) - Math.max(b.left, s.left);
        const h = Math.min(b.bottom, s.bottom) - Math.max(b.top, s.top);
        return w > 0 && h > 0 ? Math.round(w * h) : 0;
      });
      assert(overlap === 0, `겹친 넓이 ${overlap}px2`);
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
      const cap = await page.locator('.k-replay-caption').innerText();
      assert(/초/.test(cap), `자막 없음: ${cap}`);
      /* WebGL 을 못 쓰는 기기에서는 2D 로 내려간다 (FR-11.7) */
      const has3d = (await page.locator('.k-replay-canvas').count()) === 1;
      const has2d = (await page.locator('[data-fallback="2d"]').count()) === 1;
      assert(has3d || has2d, '3D 도 2D 도 없다');
      assert((await page.locator('[data-view="first"]').getAttribute('aria-pressed')) === 'true', '1인칭이 기본이 아니다');
      await page.locator('[data-view="top"]').click();
      await page.waitForTimeout(300);
      assert((await page.locator('[data-view="top"]').getAttribute('aria-pressed')) === 'true', '시점이 안 바뀐다');
      /* 끌어서 둘러보기 — 시점이 움직이면 되돌리기 단추가 뜬다 */
      if (has3d) {
        const cv = await page.locator('.k-replay-canvas').boundingBox();
        if (cv) {
          await page.mouse.move(cv.x + cv.width / 2, cv.y + cv.height / 2);
          await page.mouse.down();
          await page.mouse.move(cv.x + cv.width / 2 + 140, cv.y + cv.height / 2 + 30, { steps: 6 });
          await page.mouse.up();
          await page.waitForTimeout(300);
          const back = page.locator('.k-replay-hint .k-tb', { hasText: '시점 되돌리기' });
          assert((await back.count()) === 1, '끌어도 시점이 안 돈다');
          await back.click();
          await page.waitForTimeout(200);
        }
      }
      await page.locator('[data-coach="kids-replay-play"]').click();
      await page.waitForTimeout(200);
      await page.locator('.k-replay-bar .k-tb', { hasText: '닫기' }).click();
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
      /* 내 방(안방) → 복도 → 현관 → 현관문 */
      for (const m of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowRight']) {
        await page.keyboard.press(m);
        await page.waitForTimeout(120);
      }
      await page.waitForTimeout(500);
      if ((await page.locator('.k-report-view').count()) === 0) await page.locator('[data-coach="kids-quit"]').click();
      await page.waitForSelector('.k-report-view');
      const head = await page.locator('.k-report-banner h2').innerText();
      assert(head.includes('무사히'), `성공하지 못했다: ${head}`);
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
      await page.waitForSelector('[data-lowfloor="no"]');
      await page.locator('[data-lowfloor="no"]').click();
      await page.waitForTimeout(500);
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'edit', '빈 도면인데 내 자리부터 묻는다');
      await page.locator('[data-block-id="bedroom"]').click();
      const p = await kidsCell(page, 8, 6);
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(900);
      assert((await kidsSave(page)).blocks === 1, '빈 도면에 방이 안 놓인다');
      assert((await page.locator('.k-app').getAttribute('data-step')) === 'mySpot', '첫 방 뒤에 내 자리를 안 묻는다');
    });

    /* 세로 스마트폰에서도 다 쓸 수 있는지 (설계서 v1.2 §13) */
    await check('세로 스마트폰(390x844)에서 가로로 넘치지 않고 다 쓸 수 있다', async () => {
      const mob = await browser!.newContext({
        viewport: { width: 390, height: 844 },
        locale: 'ko-KR',
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      });
      const m = await mob.newPage();
      const errs: string[] = [];
      m.on('pageerror', (e) => errs.push(e.message));
      await m.goto(server.url, { waitUntil: 'networkidle' });
      await m.evaluate(() => window.localStorage.clear());
      await m.reload({ waitUntil: 'networkidle' });
      await m.waitForSelector('.k-onboard');
      await m.locator('[data-template="apt_2room"]').click();
      await m.waitForSelector('[data-lowfloor="no"]');
      await m.locator('[data-lowfloor="no"]').click();
      await m.waitForTimeout(700);

      /*
       * 가로로 넘치면 아이가 화면 밖 단추를 못 찾는다.
       * 문서의 scrollWidth 만 보면 안 된다 — .k-app 이 overflow: hidden 이라
       * 넘친 것이 잘려 나가고 문서는 멀쩡해 보인다. 실제로 칸이 730px 로 벌어져
       * 도면과 팔레트 오른쪽이 잘린 적이 있다. 그래서 안쪽 상자를 따로 잰다.
       */
      const size = await m.evaluate(() => {
        const boxes: { name: string; over: number }[] = [];
        for (const sel of ['.k-app', '.k-top', '.k-work', '.k-center', '.k-palette', '.k-bottom']) {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (!el) continue;
          boxes.push({ name: sel, over: Math.round(el.scrollWidth - el.clientWidth) });
        }
        const stage = document.querySelector('svg.k-stage') as SVGElement | null;
        const r = stage?.getBoundingClientRect();
        return {
          over: document.documentElement.scrollWidth - window.innerWidth,
          boxes,
          app: Math.round((document.querySelector('.k-app') as HTMLElement).getBoundingClientRect().height),
          win: window.innerHeight,
          stage: r ? { x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) } : null,
        };
      });
      assert(size.over <= 0, `가로로 ${size.over}px 넘친다`);
      assert(Math.abs(size.app - size.win) <= 2, `앱 높이 ${size.app} / 화면 ${size.win}`);
      const spill = size.boxes.filter((b) => b.over > 1);
      assert(spill.length === 0, `잘려 나간 칸: ${spill.map((b) => `${b.name} +${b.over}px`).join(', ')}`);

      /* 도면이 화면 안에 있고, 볼 만한 크기여야 한다 */
      assert(size.stage !== null, '도면이 없다');
      assert(size.stage!.x >= -1 && size.stage!.right <= 391, `도면이 화면 밖에 있다 (x=${size.stage!.x} right=${size.stage!.right})`);
      assert(size.stage!.w >= 240 && size.stage!.h >= 140, `도면이 너무 작다 (${size.stage!.w}x${size.stage!.h})`);

      /* 상단바는 접히고 「더보기」 시트에 나머지가 들어 있다 */
      assert((await m.locator('[data-coach="kids-more"]').count()) === 1, '더보기 단추가 없다');
      assert((await m.locator('[data-coach="kids-template"]').isVisible()) === false, '집 모양 단추가 그대로 보인다');
      await m.locator('[data-coach="kids-more"]').click();
      await m.waitForSelector('.k-optsheet');
      const sheet = await m.locator('.k-optsheet').innerText();
      for (const label of ['집 모양', '내 캐릭터', '사용법', '처음부터']) {
        assert(sheet.includes(label), `시트에 ${label} 이 없다`);
      }
      await m.locator('.k-optsheet .k-x').click();
      await m.waitForTimeout(200);

      /* 누르는 것은 좁은 화면에서도 48x48 이상이다 */
      const small = (await hitTargets(m)).filter((t) => t.w < 48 || t.h < 48);
      assert(small.length === 0, `48px 미만 ${small.length}개: ${small.slice(0, 3).map((t) => `${t.w}x${t.h} ${t.name}`).join(' | ')}`);

      /* 게임에서는 팔레트가 사라져 도면이 넓어진다 */
      await m.locator('[data-coach="kids-start-game"]').click();
      await m.waitForTimeout(400);
      const anyway = m.locator('[data-coach="kids-start-anyway"]');
      if (await anyway.count()) await anyway.click();
      await m.waitForSelector('.k-game');
      await m.waitForTimeout(500);
      assert((await m.locator('.k-palette').isVisible()) === false, '게임 중에 팔레트가 남아 있다');
      assert((await m.locator('.k-dpad').isVisible()) === true, '방향키가 없다');
      const game = await m.evaluate(() => {
        const boxes: { name: string; over: number }[] = [];
        for (const sel of ['.k-app', '.k-work', '.k-center']) {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (el) boxes.push({ name: sel, over: Math.round(el.scrollWidth - el.clientWidth) });
        }
        return { over: document.documentElement.scrollWidth - window.innerWidth, boxes };
      });
      assert(game.over <= 0, `게임에서 가로로 ${game.over}px 넘친다`);
      const spill2 = game.boxes.filter((b) => b.over > 1);
      assert(spill2.length === 0, `게임에서 잘려 나간 칸: ${spill2.map((b) => `${b.name} +${b.over}px`).join(', ')}`);
      assert(errs.length === 0, errs.slice(0, 2).join(' | '));
      await mob.close();
    });

    await context.close();

    /* 오프라인 배포본이 있으면 file:// 에서 인터넷 없이 동작하는지 본다 */
    const standalone = path.join(root, 'dist', 'home-escape-map.html');
    if (fs.existsSync(standalone)) {
      await check('오프라인 배포본에서 온보딩부터 리포트까지 간다 (NFR-1)', async () => {
        const off = await browser!.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR', offline: true });
        const p3 = await off.newPage();
        const pageErrors: string[] = [];
        const outside: string[] = [];
        p3.on('pageerror', (e) => pageErrors.push(e.message));
        p3.on('request', (r) => {
          if (!r.url().startsWith('file:')) outside.push(r.url());
        });
        await p3.goto(`file:///${standalone.split(path.sep).join('/')}`);
        await p3.waitForSelector('.k-onboard', { timeout: 20000 });
        await p3.locator('[data-template="apt_2room"]').click();
        await p3.waitForSelector('[data-lowfloor="no"]');
        await p3.locator('[data-lowfloor="no"]').click();
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
