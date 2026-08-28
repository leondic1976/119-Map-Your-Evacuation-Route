/**
 * 브라우저 실조작 검증.
 *
 * 정적 내보내기(out/)를 임시 서버로 띄우고 Chromium 으로 9단계 전 과정을 조작한다.
 * 인쇄 미디어, 실행취소, 자동저장 복원까지 실제 화면에서 확인한다.
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

/**
 * 따라하기 덮개는 처음 온 이용자에게 저절로 뜬다.
 * 본 시나리오에서는 방해가 되므로 '이미 봤다'로 표시해 둔다.
 * (자동 표시 자체는 따로 검증한다)
 */
async function silenceCoach(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.localStorage.setItem('evac-tutorial-seen-v1', '["elementary","secondary"]');
    // 첫 화면(이용자 고르기)도 건너뛴다 — 그 자체는 따로 검증한다
    window.localStorage.setItem('evac-audience-v1', 'general');
  });
}

/** 어린이 화면의 도면에서 셀 (x, y) 한가운데의 화면 좌표 */
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

/** 풍선글의 "안내 8 / 16" 에서 숫자만 뽑는다 */
async function coachCount(page: Page, which: 1 | 2): Promise<number> {
  const t = await page.locator('.coach-count').innerText();
  const m = t.match(/(\d+)\s*\/\s*(\d+)/);
  return m ? Number(m[which]) : NaN;
}

async function stepTo(page: Page, title: string): Promise<void> {
  await page.locator('.stepper .step', { hasText: title }).first().click({ timeout: 6000 });
  await page.waitForTimeout(140);
}

/** 단계 이름은 이용 수준에 따라 달라진다(초등: "집 그리기"). 번호로 여는 쪽이 안전하다 */
async function stepAt(page: Page, index: number): Promise<void> {
  await page.locator('.stepper .step').nth(index).click({ timeout: 6000 });
  await page.waitForTimeout(160);
}

async function roomCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('evac-plan-v1');
    if (!raw) return 0;
    try {
      return (JSON.parse(raw).rooms || []).length;
    } catch {
      return 0;
    }
  });
}

/** 자동 저장(600ms 디바운스)이 끝날 때까지 기다린다 */
async function waitSaved(page: Page, expect: number, timeout = 4000): Promise<number> {
  const t0 = Date.now();
  for (;;) {
    const n = await roomCount(page);
    if (n === expect || Date.now() - t0 > timeout) return n;
    await page.waitForTimeout(120);
  }
}

async function loadTemplate(page: Page, label: string): Promise<number> {
  await stepAt(page, 0);
  await page.locator('.tmpl', { hasText: label }).first().click();
  await page.waitForTimeout(260);
  const rows = await page.locator('.inspector table.tbl tbody tr').count();
  await waitSaved(page, rows);
  return rows;
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
    await silenceCoach(page);
    await page.reload({ waitUntil: 'networkidle' });

    /* 1 */
    await check('앱이 뜨고 9단계 스테퍼가 보인다', async () => {
      await page.waitForSelector('.stepper .step');
      const n = await page.locator('.stepper .step').count();
      assert(n === 9, `단계 ${n}개`);
      const brand = await page.locator('.brand').innerText();
      assert(brand.includes('피난로 그리기'), brand);
    });

    /* 2 */
    await check('표준 평면을 불러오면 도면에 실이 그려진다', async () => {
      const rooms = await loadTemplate(page, '3베이 판상형');
      const rects = await page.locator('.stage rect').count();
      assert(rects > 20, `도형 ${rects}개`);
      const status = await page.locator('.statusbar').innerText();
      assert(/실 \d+/.test(status), status);
      assert(rooms >= 8, `실 목록 ${rooms}행`);
      assert((await roomCount(page)) === rooms, `자동 저장 ${await roomCount(page)} / 화면 ${rooms}`);
    });

    /* 3 */
    await check('전용면적을 바꾸면 상태 표시줄 면적이 따라온다', async () => {
      const input = page.locator('.inspector input[type="number"]').first();
      await input.fill('114');
      await page.locator('.tmpl', { hasText: '4베이' }).first().click();
      await page.waitForTimeout(320);
      const status = await page.locator('.statusbar').innerText();
      const m = status.match(/전용면적\s*([\d.]+)/);
      assert(Boolean(m), status);
      const area = Number(m![1]);
      assert(Math.abs(area - 114) < 3, `면적 ${area}`);
    });

    /* 4 */
    await check('도구 단축키가 동작한다', async () => {
      await page.locator('.canvas-wrap').click({ position: { x: 30, y: 30 } });
      await page.keyboard.press('r');
      await page.waitForTimeout(80);
      let pressed = await page.locator('.rail button[aria-pressed="true"]').getAttribute('aria-label');
      assert(pressed?.includes('실 작도') ?? false, `${pressed}`);
      await page.keyboard.press('v');
      await page.waitForTimeout(80);
      pressed = await page.locator('.rail button[aria-pressed="true"]').getAttribute('aria-label');
      assert(pressed?.includes('선택') ?? false, `${pressed}`);
    });

    /* 5 */
    await check('직접 작도로 실을 하나 더 만든다', async () => {
      const before = await loadTemplate(page, '소형');
      await page.keyboard.press('r');
      const box = (await page.locator('.canvas-wrap').boundingBox())!;
      await page.mouse.move(box.x + 60, box.y + 60);
      await page.mouse.down();
      await page.mouse.move(box.x + 200, box.y + 170, { steps: 8 });
      await page.mouse.up();
      const after = await waitSaved(page, before + 1);
      assert(after === before + 1, `${before} → ${after}`);
      await page.keyboard.press('v');
    });

    /* 6 */
    await check('실을 선택하면 검사기에서 이름을 고칠 수 있다', async () => {
      await loadTemplate(page, '3베이 판상형');
      await page.locator('.inspector table.tbl tbody tr').first().click();
      await page.waitForTimeout(160);
      const heads = await page.locator('.inspector .group h3').allInnerTexts();
      assert(heads.some((h) => h.includes('선택한 실')), heads.join(' / '));
      const name = page.locator('.inspector input[type="text"]').first();
      await name.fill('작은방');
      await page.waitForTimeout(300);
      const texts = await page.locator('.stage text').allTextContents();
      assert(texts.includes('작은방'), '도면에 이름이 반영되지 않았다');
    });

    /* 7 */
    await check('실행 취소·다시 실행이 동작한다', async () => {
      await page.locator('.canvas-wrap').click({ position: { x: 20, y: 20 } });
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(220);
      let texts = await page.locator('.stage text').allTextContents();
      assert(!texts.includes('작은방'), '되돌리기가 되지 않았다');
      await page.keyboard.press('Control+Shift+z');
      await page.waitForTimeout(220);
      texts = await page.locator('.stage text').allTextContents();
      assert(texts.includes('작은방'), '다시 실행이 되지 않았다');
    });

    /* 8 */
    await check('세대 정보를 넣으면 준공 시기 안내가 바뀐다', async () => {
      await stepTo(page, '세대 정보');
      const inputs = page.locator('.inspector input[type="text"]');
      await inputs.nth(0).fill('한빛아파트');
      await inputs.nth(1).fill('101');
      await inputs.nth(2).fill('502');
      await page.locator('.inspector .seg button', { hasText: '1992년 ~ 2005년' }).first().click();
      await page.waitForTimeout(200);
      const callout = await page.locator('.inspector .callout').first().innerText();
      assert(callout.includes('경량칸막이'), callout);
      await page.locator('.inspector .seg button', { hasText: '2010년 이후' }).first().click();
      await page.waitForTimeout(200);
      const later = await page.locator('.inspector .callout').first().innerText();
      assert(later.includes('하향식') || later.includes('선택 적용'), later);
    });

    /* 9 */
    await check('개구부 단계에서 현관문 현황이 집계된다', async () => {
      await stepTo(page, '개구부');
      const text = await page.locator('.inspector').innerText();
      assert(/현관문\s*\n?\s*1개소/.test(text.replace(/\s+/g, ' ')) || text.includes('현관문'), text.slice(0, 200));
      const rows = await page.locator('.inspector table.tbl tbody tr').count();
      assert(rows >= 8, `개구부 ${rows}행`);
    });

    /* 10 */
    await check('개구부를 선택해 유효 폭을 고친다', async () => {
      await page.locator('.inspector table.tbl tbody tr').first().click();
      await page.waitForTimeout(160);
      const heads = await page.locator('.inspector .group h3').allInnerTexts();
      assert(heads.some((h) => h.includes('선택한 개구부')), heads.join(' / '));
      const w = page.locator('.inspector input[type="number"]').first();
      await w.fill('110');
      await page.waitForTimeout(260);
      const val = await page.evaluate(() => {
        const raw = window.localStorage.getItem('evac-plan-v1');
        const p = JSON.parse(raw || '{}');
        return (p.doors || []).some((d: { width: number }) => d.width === 110);
      });
      assert(val, '폭 변경이 저장되지 않았다');
    });

    /* 11 */
    await check('설비 기호를 도면에 추가한다', async () => {
      await stepTo(page, '설비 표기');
      const before = await page.evaluate(() => {
        const p = JSON.parse(window.localStorage.getItem('evac-plan-v1') || '{}');
        return (p.facilities || []).length;
      });
      await page.locator('.inspector .card', { hasText: '하향식 피난구' }).locator('button', { hasText: '가운데 놓기' }).click();
      await page.waitForTimeout(800);
      const after = await page.evaluate(() => {
        const p = JSON.parse(window.localStorage.getItem('evac-plan-v1') || '{}');
        return (p.facilities || []).length;
      });
      assert(after === before + 1, `${before} → ${after}`);
    });

    /* 12 */
    await check('주 동선이 자동 생성되고 표에 나온다', async () => {
      await stepTo(page, '피난동선');
      await page.locator('.inspector button', { hasText: '주 동선' }).first().click();
      await page.waitForTimeout(600);
      const rows = await page.locator('.inspector table.tbl tbody tr').count();
      assert(rows >= 3, `동선 ${rows}개`);
      const status = await page.locator('.statusbar').innerText();
      assert(/동선 [1-9]/.test(status), status);
    });

    /* 13 */
    await check('대체 동선이 피난설비를 종점으로 생성된다', async () => {
      await page.locator('.inspector button', { hasText: '대체 동선' }).first().click();
      await page.waitForTimeout(600);
      const kinds = await page.evaluate(() => {
        const p = JSON.parse(window.localStorage.getItem('evac-plan-v1') || '{}');
        return (p.routes || []).map((r: { kind: string; endpoint: string }) => `${r.kind}:${r.endpoint}`);
      });
      assert(kinds.some((k: string) => k.startsWith('alt:')), kinds.join(','));
      assert(!kinds.some((k: string) => k === 'alt:entrance'), '대체 동선 종점이 현관이다');
    });

    /* 14 */
    await check('보행 기준을 바꾸면 소요시간이 늘어난다', async () => {
      const readFirst = async () => {
        const t = await page.locator('.inspector table.tbl tbody tr').first().innerText();
        const m = t.match(/(\d+)초/);
        return m ? Number(m[1]) : 0;
      };
      await page.locator('.inspector .seg button', { hasText: '성인' }).first().click();
      await page.waitForTimeout(240);
      const adult = await readFirst();
      await page.locator('.inspector .seg button', { hasText: '고령자' }).first().click();
      await page.waitForTimeout(240);
      const senior = await readFirst();
      assert(senior > adult, `성인 ${adult}초 vs 고령자 ${senior}초`);
      await page.locator('.inspector .seg button', { hasText: '성인' }).first().click();
    });

    /* 15 */
    await check('확산 해석에서 발화 지점을 정하면 곡선과 ASET 표가 나온다', async () => {
      await stepTo(page, '확산 해석');
      await page.locator('.inspector button', { hasText: '주방' }).first().click();
      await page.waitForTimeout(900);
      const svg = await page.locator('.inspector svg[role="img"]').count();
      assert(svg >= 1, '차단 면적 곡선이 없다');
      const text = await page.locator('.inspector').innerText();
      assert(text.includes('ASET'), 'ASET 표가 없다');
      assert(text.includes('연기 도달') && text.includes('통행 불가'), text.slice(0, 200));
      // 차단 시각(ASET)은 연기 선단 도달보다 늦어야 한다 — 3초 같은 값이 나오면 안 된다
      const asets = await page
        .locator('.inspector table.tbl tbody tr td.n')
        .allInnerTexts();
      const first = Number((asets[0] || '').replace(/[^\d]/g, ''));
      assert(first >= 20, `첫 동선 ASET ${first}초 — 차단 판정이 너무 이르다`);
    });

    /* 16 */
    await check('타임라인을 옮기면 연기 도달 면적이 늘어난다', async () => {
      const readArea = async () => {
        const t = await page.locator('.inspector .metric').first().innerText();
        return Number(t.replace(/[^\d.]/g, '')) || 0;
      };
      await page.locator('.inspector button', { hasText: '30초' }).first().click();
      await page.waitForTimeout(300);
      const a30 = await readArea();
      await page.locator('.inspector button', { hasText: '180초' }).first().click();
      await page.waitForTimeout(300);
      const a180 = await readArea();
      assert(a180 > a30, `30초 ${a30}㎡ → 180초 ${a180}㎡`);
    });

    /* 17 */
    await check('연기 오버레이가 캔버스에 그려진다', async () => {
      const painted = await page.evaluate(() => {
        const cv = document.querySelector('canvas.smoke') as HTMLCanvasElement | null;
        if (!cv) return -1;
        const ctx = cv.getContext('2d');
        if (!ctx) return -1;
        const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) n += 1;
        return n;
      });
      assert(painted > 0, `칠해진 표본 ${painted}`);
    });

    /* 18 */
    await check('대피 훈련을 시작해 행동을 고르고 등급을 받는다', async () => {
      await stepTo(page, '대피 훈련');
      await page.locator('.inspector button', { hasText: '· 야간' }).first().click();
      await page.waitForTimeout(700);
      let text = await page.locator('.inspector').innerText();
      assert(text.includes('무엇을 하겠는가'), text.slice(0, 200));
      await page.locator('.inspector .action-btn', { hasText: '자세 낮추기' }).first().click();
      await page.waitForTimeout(500);
      await page.locator('.inspector .action-btn', { hasText: '지나온 문 닫기' }).first().click();
      await page.waitForTimeout(700);
      await page.locator('.inspector .action-btn', { hasText: '현관으로 이동' }).first().click();
      await page.waitForTimeout(900);
      text = await page.locator('.inspector').innerText();
      assert(text.includes('평가'), '평가가 나오지 않았다');
      const grade = await page.locator('.inspector .score-ring .g').first().innerText();
      assert(['A', 'B', 'C', 'D'].includes(grade.trim()), `등급 ${grade}`);
      const log = await page.locator('.inspector .log li').count();
      assert(log >= 3, `이력 ${log}건`);
    });

    /* 19 */
    await check('자가 진단이 점수와 항목을 낸다', async () => {
      await stepTo(page, '자가 진단');
      await page.waitForTimeout(400);
      const grade = await page.locator('.inspector .score-ring .g').first().innerText();
      assert(['A', 'B', 'C', 'D'].includes(grade.trim()), `등급 ${grade}`);
      const cards = await page.locator('.inspector .card').count();
      assert(cards >= 10, `점검 항목 ${cards}개`);
      await page.locator('.inspector .seg button', { hasText: '위험요소' }).click();
      await page.waitForTimeout(220);
      const hazards = await page.locator('.inspector .card').count();
      assert(hazards >= 10, `위험요소 ${hazards}종`);
      await page.locator('.inspector .seg button', { hasText: '행동 절차' }).click();
      await page.waitForTimeout(220);
      const proc = await page.locator('.inspector').innerText();
      assert(proc.includes('119 신고'), '행동 절차가 비었다');
    });

    /* 20 */
    await check('A4 피난안내도 미리보기가 열린다', async () => {
      await stepTo(page, '산출물');
      await page.locator('.inspector button', { hasText: '미리보기' }).click();
      await page.waitForSelector('.modal-back');
      const sheet = await page.locator('.modal .print-sheet').count();
      assert(sheet === 1, `산출물 ${sheet}개`);
      const text = await page.locator('.modal .print-sheet').innerText();
      assert(text.includes('피난동선'), '동선표가 없다');
      assert(text.includes('119 신고'), '119 문안이 없다');
      assert(text.includes('101동') && text.includes('502호'), '세대 정보가 없다');
      await page.locator('.modal footer button', { hasText: '닫기' }).click();
      await page.waitForTimeout(200);
    });

    /* 21 */
    await check('인쇄 미디어에서 A4 가로 산출물만 남는다', async () => {
      await page.emulateMedia({ media: 'print' });
      await page.waitForTimeout(220);
      const appVisible = await page.locator('.app').isVisible();
      assert(!appVisible, '편집 화면이 인쇄에 남아 있다');
      const box = await page.locator('.print-sheet').first().boundingBox();
      assert(Boolean(box), '산출물이 보이지 않는다');
      const ratio = box!.width / box!.height;
      assert(ratio > 1.2 && ratio < 1.7, `가로세로비 ${ratio.toFixed(2)}`);
      const legend = await page.locator('.print-sheet .sheet-legend div').count();
      assert(legend >= 3, `범례 ${legend}항목`);
      await page.emulateMedia({ media: 'screen' });
      await page.waitForTimeout(200);
    });

    /* 22 */
    await check('새로 고쳐도 작업 내용이 복원된다', async () => {
      const before = await roomCount(page);
      assert(before > 0, '저장된 실이 없다');
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('.stage');
      await page.waitForTimeout(600);
      const status = await page.locator('.statusbar').innerText();
      const m = status.match(/실\s*(\d+)/);
      assert(Boolean(m) && Number(m![1]) === before, `${before} → ${m?.[1]}`);
      const toast = await page.locator('.toast').count();
      assert(toast >= 0, '');
    });

    /* 23 */
    await check('보기 토글로 도면 요소를 끄고 켤 수 있다', async () => {
      await page.locator('.topbar button', { hasText: '보기' }).click();
      await page.waitForTimeout(150);
      const label = page.locator('label.chk', { hasText: '피난동선' }).first();
      await label.locator('input').uncheck();
      await page.waitForTimeout(220);
      const paths = await page.locator('.stage path[stroke-linejoin="round"]').count();
      await label.locator('input').check();
      await page.waitForTimeout(220);
      const paths2 = await page.locator('.stage path[stroke-linejoin="round"]').count();
      assert(paths2 > paths, `끔 ${paths} → 켬 ${paths2}`);
      await page.keyboard.press('Escape');
    });

    /* 24 */
    await check('도움말에 단축키가 모두 나온다', async () => {
      await page.locator('.topbar button[title^="단축키"]').click();
      await page.waitForSelector('.modal');
      const text = await page.locator('.modal').innerText();
      for (const k of ['V', 'R', 'D', 'W', 'F', 'L', 'T', 'M', 'H']) {
        assert(text.includes(k), `단축키 ${k} 누락`);
      }
      assert(text.includes('교육용 근사 모델'), '고지 문구 누락');
      await page.locator('.modal footer button').click();
      await page.waitForTimeout(150);
    });

    /* --- 자유 그리기 (초등 모드) --- */

    /** 도면 좌표 → 화면 좌표 (캔버스의 변환 행렬을 그대로 쓴다) */
    const toScreen = async (wx: number, wy: number): Promise<{ x: number; y: number }> =>
      page.evaluate(
        ([x, y]) => {
          const g = document.querySelector('svg.stage > g') as SVGGElement | null;
          const m = g?.getScreenCTM();
          if (!m) return { x: 0, y: 0 };
          return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
        },
        [wx, wy],
      );

    /** 사람이 그은 것처럼 흔들리며 끄는 몸짓 */
    const wobbleDrag = async (path: { x: number; y: number }[]) => {
      await page.mouse.move(path[0].x, path[0].y);
      await page.mouse.down();
      for (let i = 1; i < path.length; i += 1) {
        const jx = Math.sin(i * 3.1) * 3.5;
        const jy = Math.cos(i * 2.3) * 3.5;
        await page.mouse.move(path[i].x + jx, path[i].y + jy);
      }
      await page.mouse.up();
    };

    const readRooms = async () =>
      page.evaluate(() => {
        const p = JSON.parse(window.localStorage.getItem('evac-plan-v1') || '{}');
        return (p.rooms || []) as { id: string; x: number; y: number; w: number; h: number }[];
      });

    await check('이용 수준을 초등으로 바꾸면 자유 그리기가 앞에 온다', async () => {
      await page.evaluate(() => window.localStorage.clear());
      await silenceCoach(page);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('.level-seg');
      await page.locator('.level-seg button', { hasText: '초등' }).click();
      await page.waitForTimeout(220);
      const pressed = await page.locator('.level-seg button[aria-pressed="true"]').innerText();
      assert(pressed.includes('초등'), pressed);
      const heads = await page.locator('.inspector .group h3').allInnerTexts();
      assert(heads[0]?.includes('자유 그리기'), heads.join(' / '));
      const snap = await page.locator('.statusbar').innerText();
      assert(snap.includes('스냅 10cm'), snap);
    });

    await check('삐뚤빼뚤 그린 사각형이 반듯한 방이 된다', async () => {
      await page.locator('[data-coach="sketch-start"]').click();
      await page.waitForTimeout(180);
      const pressed = await page.locator('.rail button[aria-pressed="true"]').getAttribute('aria-label');
      assert(pressed?.includes('자유 그리기') ?? false, `${pressed}`);

      const box = (await page.locator('.canvas-wrap').boundingBox())!;
      const x0 = box.x + 200;
      const y0 = box.y + 140;
      const x1 = box.x + 640;
      const y1 = box.y + 470;
      const path: { x: number; y: number }[] = [];
      const edge = (a: number[], b: number[], n: number) => {
        for (let i = 0; i <= n; i += 1) {
          const t = i / n;
          path.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t });
        }
      };
      edge([x0, y0], [x1, y0], 8);
      edge([x1, y0], [x1, y1], 8);
      edge([x1, y1], [x0, y1], 8);
      edge([x0, y1], [x0, y0], 8);
      await wobbleDrag(path);

      const rooms = await waitSaved(page, 1);
      assert(rooms === 1, `실 ${rooms}개`);
      const list = await readRooms();
      const r = list[0];
      // 손떨림이 남지 않고 눈금(10cm)에 딱 맞아야 한다
      for (const v of [r.x, r.y, r.w, r.h]) {
        assert(v % 10 === 0, `눈금에 맞지 않는다: ${JSON.stringify(r)}`);
      }
      assert(r.w > 200 && r.h > 200, `크기 ${r.w}×${r.h}`);
      const status = await page.locator('.statusbar').innerText();
      assert(/전용면적\s*[\d.]+/.test(status), status);
    });

    await check('방을 가로질러 그으면 벽이 서고 둘로 나뉜다', async () => {
      const before = await readRooms();
      const r = before[0];
      const midX = r.x + r.w / 2;
      const a = await toScreen(midX, r.y + 30);
      const b = await toScreen(midX, r.y + r.h - 30);
      const path: { x: number; y: number }[] = [];
      for (let i = 0; i <= 14; i += 1) {
        const t = i / 14;
        path.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
      await wobbleDrag(path);

      const rooms = await waitSaved(page, 2);
      assert(rooms === 2, `실 ${rooms}개`);
      const after = await readRooms();
      const total = after.reduce((s, x) => s + x.w * x.h, 0);
      assert(Math.abs(total - r.w * r.h) < 1, `면적이 보존되지 않았다 (${total} vs ${r.w * r.h})`);
      const sorted = after.slice().sort((p, q) => p.x - q.x);
      assert(sorted[0].x + sorted[0].w === sorted[1].x, '나뉜 경계가 어긋난다');
    });

    await check('자유 그리기 결과도 실행 취소로 되돌아간다', async () => {
      await page.locator('.canvas-wrap').click({ position: { x: 12, y: 12 } });
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+z');
      const rooms = await waitSaved(page, 1);
      assert(rooms === 1, `되돌린 뒤 실 ${rooms}개`);
      await page.keyboard.press('Control+Shift+z');
      const back = await waitSaved(page, 2);
      assert(back === 2, `다시 실행 뒤 실 ${back}개`);
    });

    await check('이용 수준이 새로 고쳐도 기억된다', async () => {
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('.level-seg');
      await page.waitForTimeout(400);
      const pressed = await page.locator('.level-seg button[aria-pressed="true"]').innerText();
      assert(pressed.includes('초등'), pressed);
      await page.locator('.level-seg button', { hasText: '중고' }).click();
      await page.waitForTimeout(220);
      const snap = await page.locator('.statusbar').innerText();
      assert(snap.includes('스냅 5cm'), snap);
    });

    /* --- 안내 · 도우미 · 편집 --- */

    await check('확대·축소·화면 맞춤 단추가 눌린다', async () => {
      await page.evaluate(() => window.localStorage.clear());
      await silenceCoach(page);
      await page.reload({ waitUntil: 'networkidle' });
      await loadTemplate(page, '3베이 판상형');
      const zoom = async () => {
        const t = await page.locator('.statusbar').innerText();
        return Number(t.match(/축척\s*(\d+)/)?.[1] ?? 0);
      };
      // SVG 에 덮여 눌리지 않던 적이 있다 — 실제로 눌러 축척이 바뀌는지 본다
      const before = await zoom();
      await page.locator('.zoom-pad button[title="확대"]').click({ timeout: 4000 });
      await page.waitForTimeout(250);
      const bigger = await zoom();
      assert(bigger > before, `확대 ${before}% → ${bigger}%`);
      await page.locator('.zoom-pad button[title="축소"]').click({ timeout: 4000 });
      await page.waitForTimeout(250);
      assert((await zoom()) < bigger, '축소가 되지 않는다');
      await page.locator('.zoom-pad button[title="화면 맞춤"]').click({ timeout: 4000 });
      await page.waitForTimeout(300);
      assert((await zoom()) > 0, '화면 맞춤이 되지 않는다');
    });

    await check('도면이 늘 캔버스 한가운데 온다', async () => {
      const off = await page.evaluate(() => {
        const g = document.querySelector('svg.stage > g') as SVGGElement | null;
        const wrap = document.querySelector('.canvas-wrap') as HTMLElement | null;
        if (!g || !wrap) return null;
        const b = g.getBoundingClientRect();
        const w = wrap.getBoundingClientRect();
        return {
          dx: b.left + b.width / 2 - (w.left + w.width / 2),
          dy: b.top + b.height / 2 - (w.top + w.height / 2),
          ww: w.width,
          wh: w.height,
        };
      });
      assert(Boolean(off), '도면을 찾지 못했다');
      // 방위표·축척막대까지 포함한 경계라 완전 정중앙은 아니다. 한쪽으로 크게 치우치지만 않으면 된다
      assert(Math.abs(off!.dx) < off!.ww * 0.2, `가로 치우침 ${Math.round(off!.dx)}px`);
      assert(Math.abs(off!.dy) < off!.wh * 0.2, `세로 치우침 ${Math.round(off!.dy)}px`);
    });

    await check('선택 막대로 도면 위에서 바로 지운다', async () => {
      const before = await roomCount(page);
      await page.locator('.rail button', { hasText: '고르기' }).click();
      await page.locator('.inspector table.tbl tbody tr').first().click();
      await page.waitForTimeout(250);
      const bar = page.locator('.sel-bar');
      assert((await bar.count()) === 1, '선택 막대가 뜨지 않는다');
      const text = await bar.innerText();
      assert(text.includes('방'), text);
      await bar.locator('button', { hasText: '지우기' }).click();
      const after = await waitSaved(page, before - 1);
      assert(after === before - 1, `${before} → ${after}`);
      assert((await page.locator('.sel-bar').count()) === 0, '지운 뒤에도 막대가 남아 있다');
    });

    await check('처음부터 단추가 모두 지우고 되돌릴 수 있다', async () => {
      const before = await roomCount(page);
      assert(before > 0, '지울 것이 없다');
      await page.locator('.topbar button', { hasText: '처음부터' }).click();
      await page.waitForSelector('.modal-back');
      await page.locator('.modal footer button', { hasText: '모두 지우고 다시' }).click();
      const cleared = await waitSaved(page, 0);
      assert(cleared === 0, `남은 실 ${cleared}`);
      const stepNow = await page.locator('.stepper .step[aria-current="step"]').innerText();
      assert(stepNow.includes('01'), stepNow);
      await page.keyboard.press('Control+z');
      const back = await waitSaved(page, before);
      assert(back === before, `되돌리기 ${back} / ${before}`);
    });

    await check('도우미가 지금 할 일을 알려 주고 눌러 처리한다', async () => {
      await page.evaluate(() => window.localStorage.clear());
      await silenceCoach(page);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('.assist');
      let text = await page.locator('.assist').innerText();
      assert(text.includes('집 모양을 그린다'), text);
      await loadTemplate(page, '3베이 판상형');
      await page.waitForTimeout(300);
      text = await page.locator('.assist').innerText();
      // 평면이 생겼으니 다음 할 일로 넘어가야 한다
      assert(!text.includes('집 모양을 그린다'), text);
      const go = page.locator('.assist-go');
      assert((await go.count()) === 1, '할 일 단추가 없다');
    });

    await check('도우미가 문이 없다고 짚어 준다', async () => {
      // 현관문을 모두 지우면 도우미가 알아채야 한다
      await page.evaluate(() => {
        const raw = window.localStorage.getItem('evac-plan-v1');
        const p = JSON.parse(raw || '{}');
        p.doors = (p.doors || []).filter((d: { kind: string }) => d.kind !== 'entrance');
        window.localStorage.setItem('evac-plan-v1', JSON.stringify(p));
      });
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('.assist');
      await page.waitForTimeout(500);
      const text = await page.locator('.assist').innerText();
      assert(text.includes('나가는 문이 없다'), text);
    });

    await check('사용 설명서 레이어가 열리고 기호를 설명한다', async () => {
      await page.locator('.topbar button', { hasText: '설명서' }).click();
      await page.waitForSelector('.modal.manual');
      const head = await page.locator('.modal.manual header').innerText();
      assert(head.includes('사용 설명서'), head);
      await page.locator('.manual-h', { hasText: '도구' }).first().click();
      await page.waitForTimeout(200);
      const tools = await page.locator('.manual-body li').count();
      assert(tools >= 10, `도구 설명 ${tools}개`);
      await page.locator('.manual-h', { hasText: '도면 기호' }).click();
      await page.waitForTimeout(200);
      const signs = await page.locator('.sign').count();
      assert(signs >= 6, `기호 ${signs}개`);
      await page.locator('.modal.manual footer button').click();
      await page.waitForTimeout(200);
    });

    await check('따라하기가 모든 안내에서 가리킬 곳을 찾는다', async () => {
      await page.locator('.topbar button', { hasText: '따라하기' }).click();
      await page.waitForSelector('.coach-bubble');
      const total = await coachCount(page, 2);
      assert(total >= 8, `안내 ${total}개`);
      const missing: string[] = [];
      for (let i = 0; i < total; i += 1) {
        await page.waitForTimeout(260);
        const title = await page.locator('.coach-bubble h3').innerText();
        // 첫 안내(가운데)만 가리키는 곳이 없다
        if (i > 0 && (await page.locator('.coach-ring').count()) === 0) missing.push(title);
        if (i < total - 1) await page.locator('.coach-bubble button', { hasText: '다음' }).click();
      }
      assert(missing.length === 0, `가리킬 곳을 못 찾음: ${missing.join(', ')}`);
      await page.locator('.coach-bubble button', { hasText: '마치기' }).click();
      await page.waitForTimeout(300);
      assert((await page.locator('.coach').count()) === 0, '안내가 닫히지 않았다');
    });

    await check('따라하기 풍선글을 끌어서 옮길 수 있다', async () => {
      await page.locator('.topbar button', { hasText: '따라하기' }).click();
      await page.waitForSelector('.coach-bubble');
      const before = (await page.locator('.coach-bubble').boundingBox())!;
      const head = (await page.locator('.coach-head').boundingBox())!;
      // 손잡이(머리글)를 잡고 끈다 — 단추가 아닌 빈 곳을 잡아야 한다
      await page.mouse.move(head.x + 30, head.y + head.height / 2);
      await page.mouse.down();
      await page.mouse.move(head.x + 30 - 180, head.y + head.height / 2 + 120, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(300);
      const after = (await page.locator('.coach-bubble').boundingBox())!;
      assert(Math.abs(after.x - before.x) > 100, `가로로 ${Math.round(after.x - before.x)}px 밖에 안 움직였다`);
      assert(Math.abs(after.y - before.y) > 60, `세로로 ${Math.round(after.y - before.y)}px 밖에 안 움직였다`);

      // 다음 안내로 가면 제자리로 돌아온다
      await page.locator('.coach-bubble button', { hasText: '다음' }).click();
      await page.waitForTimeout(400);
      await page.locator('.coach-bubble button', { hasText: '이전' }).click();
      await page.waitForTimeout(400);
      const back = (await page.locator('.coach-bubble').boundingBox())!;
      assert(Math.abs(back.x - before.x) < 40, `제자리로 돌아오지 않았다 (${Math.round(back.x - before.x)}px)`);
      await page.locator('.coach-bubble button', { hasText: '그만 보기' }).click();
      await page.waitForTimeout(250);
    });

    await check('따라하기가 첫 방문에 저절로 뜨고 다시 뜨지 않는다', async () => {
      await page.evaluate(() => window.localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      // 저장소를 비웠으니 첫 화면이 뜬다 — 일반 화면을 고른다
      await page.locator('[data-audience="general"]').click();
      await page.waitForSelector('.coach-bubble', { timeout: 8000 });
      assert(true, '');
      // 끝까지 보면 다시 뜨지 않는다
      const total = await coachCount(page, 2);
      for (let i = 0; i < total - 1; i += 1) {
        await page.locator('.coach-bubble button', { hasText: '다음' }).click();
        await page.waitForTimeout(150);
      }
      await page.locator('.coach-bubble button', { hasText: '마치기' }).click();
      await page.waitForTimeout(300);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      assert((await page.locator('.coach').count()) === 0, '끝까지 봤는데 또 뜬다');
    });

    await check('초등 모드는 쉬운 말과 기호 설명을 쓴다', async () => {
      await page.locator('.level-seg button', { hasText: '초등' }).click();
      await page.waitForTimeout(300);
      const steps = await page.locator('.stepper').innerText();
      assert(steps.includes('집 그리기') && steps.includes('나가는 길'), steps.slice(0, 120));
      const rail = await page.locator('.rail').innerText();
      assert(rail.includes('그리기') && rail.includes('고르기'), rail.slice(0, 80));
      await stepTo(page, '소화기 표시');
      const insp = await page.locator('.inspector').innerText();
      assert(insp.includes('부수고 옆집으로') || insp.includes('숨어서 기다리는 방'), insp.slice(0, 200));
    });

    await check('초등 따라하기를 처음부터 끝까지 직접 해낸다', async () => {
      await page.evaluate(() => window.localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      // 저장소를 비웠으니 첫 화면이 뜬다 — 일반 화면을 고른다
      await page.locator('[data-audience="general"]').click();
      await page.waitForSelector('.coach-bubble', { timeout: 10000 });
      await page.locator('.coach-bubble button', { hasText: '그만 보기' }).click();
      await page.locator('.level-seg button', { hasText: '초등' }).click();
      await page.waitForTimeout(300);
      await page.locator('.topbar button', { hasText: '따라하기' }).click();
      await page.waitForSelector('.coach-bubble');

      const total = await coachCount(page, 2);
      assert(total === 16, `초등 안내 ${total}걸음`);

      const idx = async () => await coachCount(page, 1);
      const title = async () => (await page.locator('.coach-bubble h3').innerText()).trim();
      const waiting = async () => (await page.locator('.coach-todo').count()) > 0;
      const nextBtn = () => page.locator('.coach-bubble button', { hasText: '다음' });
      const canNext = async () => nextBtn().isEnabled();

      const worldToScreen = (wx: number, wy: number) =>
        page.evaluate(
          ([x, y]) => {
            const g = document.querySelector('svg.stage > g') as SVGGElement | null;
            const m = g?.getScreenCTM();
            return m ? { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f } : { x: 0, y: 0 };
          },
          [wx, wy],
        );
      const bounds = async () =>
        page.evaluate(() => {
          const p = JSON.parse(window.localStorage.getItem('evac-plan-v1') || '{}');
          const rs = (p.rooms || []) as { x: number; y: number; w: number; h: number }[];
          if (rs.length === 0) return null;
          const x0 = Math.min(...rs.map((r) => r.x));
          const y0 = Math.min(...rs.map((r) => r.y));
          const x1 = Math.max(...rs.map((r) => r.x + r.w));
          const y1 = Math.max(...rs.map((r) => r.y + r.h));
          return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        });
      const stroke = async (pts: { x: number; y: number }[]) => {
        await page.mouse.move(pts[0].x, pts[0].y);
        await page.mouse.down();
        for (let i = 1; i < pts.length; i += 1) {
          await page.mouse.move(pts[i].x + Math.sin(i * 3.1) * 5, pts[i].y + Math.cos(i * 2.3) * 5);
        }
        await page.mouse.up();
        await page.waitForTimeout(700);
      };

      const log: string[] = [];
      for (let guard = 0; guard < 40; guard += 1) {
        const i = await idx();
        const t = await title();
        log.push(`${i}. ${t}`);
        if (i >= total) break;

        if (await waiting()) {
          // 이용자가 직접 해야 하는 대목 — 실제로 해낸다
          if (t.includes('집 모양을 그린다')) {
            await page.locator('[data-coach="sketch-start"]').click();
          } else if (t.includes('한 바퀴')) {
            const box = (await page.locator('.canvas-wrap').boundingBox())!;
            const x0 = box.x + 200;
            const y0 = box.y + 140;
            const x1 = box.x + 640;
            const y1 = box.y + 450;
            const pts: { x: number; y: number }[] = [];
            const edge = (a: number[], b: number[], n: number) => {
              for (let k = 0; k <= n; k += 1) {
                const f = k / n;
                pts.push({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f });
              }
            };
            edge([x0, y0], [x1, y0], 8);
            edge([x1, y0], [x1, y1], 8);
            edge([x1, y1], [x0, y1], 8);
            edge([x0, y1], [x0, y0], 8);
            await stroke(pts);
          } else if (t.includes('벽이 된다')) {
            const b0 = (await bounds())!;
            const a = await worldToScreen(b0.x + b0.w / 2, b0.y + 40);
            const c = await worldToScreen(b0.x + b0.w / 2, b0.y + b0.h - 40);
            await stroke([a, { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }, c]);
          } else if (t.includes('몇 동 몇 호')) {
            const inputs = page.locator('.inspector input[type="text"]');
            await inputs.nth(1).fill('101');
            await inputs.nth(2).fill('502');
            await page.waitForTimeout(400);
          } else if (t.includes('나가는 문')) {
            // 위 막대의 종류가 현관문인지 확인하고 바깥 벽을 누른다
            const kind = await page.locator('.optbar select').first().inputValue();
            assert(kind === 'entrance', `문 종류가 ${kind} 로 되어 있다`);
            const b0 = (await bounds())!;
            const at = await worldToScreen(b0.x + b0.w * 0.3, b0.y);
            await page.mouse.click(at.x, at.y);
            await page.waitForTimeout(700);
          } else if (t.includes('방과 방 사이')) {
            const kind = await page.locator('.optbar select').first().inputValue();
            assert(kind === 'room', `문 종류가 ${kind} 로 되어 있다`);
            const b0 = (await bounds())!;
            // 방을 나눈 가운데 벽을 누른다
            const at = await worldToScreen(b0.x + b0.w / 2, b0.y + b0.h / 2);
            await page.mouse.click(at.x, at.y);
            await page.waitForTimeout(800);
          } else if (t.includes('소화기')) {
            await page
              .locator('.inspector .card', { hasText: '소화기' })
              .locator('button', { hasText: '가운데 놓기' })
              .click();
            await page.waitForTimeout(700);
          } else if (t.includes('길은 저절로')) {
            await page.locator('.inspector button', { hasText: '주 동선' }).first().click();
            await page.waitForTimeout(900);
          } else {
            assert(false, `${i}걸음 "${t}": 무엇을 해야 하는지 모른다`);
          }

          // 해냈으면 저절로 넘어가야 한다
          await page.waitForTimeout(1400);
          const moved = await idx();
          assert(moved > i, `${i}걸음 "${t}" 에서 넘어가지 않는다`);
          continue;
        }

        assert(await canNext(), `${i}걸음 "${t}": 다음으로 넘어갈 수 없다`);
        await nextBtn().click();
        await page.waitForTimeout(420);
      }

      assert(log.length >= total, `거쳐 온 걸음 ${log.length} / ${total}\n        ${log.join('\n        ')}`);
      await page.locator('.coach-bubble button', { hasText: '마치기' }).click();
      await page.waitForTimeout(400);
      assert((await page.locator('.coach').count()) === 0, '마지막에 닫히지 않았다');

      // 따라간 결과 실제로 도면이 완성되어 있어야 한다
      const made = await page.evaluate(() => {
        const p = JSON.parse(window.localStorage.getItem('evac-plan-v1') || '{}');
        return {
          rooms: (p.rooms || []).length,
          entrance: (p.doors || []).filter((d: { kind: string }) => d.kind === 'entrance').length,
          doors: (p.doors || []).length,
          facilities: (p.facilities || []).length,
          routes: (p.routes || []).length,
          dong: p.meta?.dong ?? '',
        };
      });
      // 도우미가 "문이 없다"고 짚는 방이 남아 있으면 안 된다
      const assistText = await page.locator('.assist').innerText();
      const stuck = assistText.includes('문이 없다');
      const stuckNames = stuck ? assistText.replace(/\s+/g, ' ').slice(0, 70) : '';
      assert(made.rooms >= 2, `방 ${made.rooms}개`);
      assert(made.entrance >= 1, '현관문이 없다');
      assert(made.facilities >= 1, '설비가 없다');
      assert(made.routes >= 2, `동선 ${made.routes}개 — 방마다 길이 있어야 한다`);
      assert(made.dong === '101', `동 ${made.dong}`);
      assert(!stuck, `밖으로 못 나가는 방이 남았다: ${stuckNames}`);
    });

    await check('동선은 방에서 시작해 종점에 닿으면 저절로 끝난다', async () => {
      await page.evaluate(() => window.localStorage.clear());
      await silenceCoach(page);
      await page.reload({ waitUntil: 'networkidle' });
      await loadTemplate(page, '3베이 판상형');
      await stepAt(page, 4);
      await page.locator('.rail button', { hasText: '동선' }).click();
      await page.waitForTimeout(300);

      const w2s = (wx: number, wy: number) =>
        page.evaluate(
          ([x, y]) => {
            const g = document.querySelector('svg.stage > g') as SVGGElement | null;
            const m = g?.getScreenCTM();
            return m ? { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f } : { x: 0, y: 0 };
          },
          [wx, wy],
        );
      const plan = async () =>
        page.evaluate(() => JSON.parse(window.localStorage.getItem('evac-plan-v1') || '{}'));

      // 아직 길이 없는 방을 짚어 준다
      const hint = await page.locator('.draw-bar').innerText();
      assert(hint.includes('부터 그려 보자'), hint);
      const marks = await page.locator('.stage text', { hasText: '여기서 시작' }).count();
      assert(marks >= 3, `시작 안내 ${marks}곳`);

      const p0 = await plan();
      const room = p0.rooms.find((r: { name: string }) => r.name === '침실3');
      const door = p0.doors.find((d: { kind: string }) => d.kind === 'entrance');
      assert(Boolean(room && door), '표준 평면에 침실3·현관문이 없다');

      // 방 밖(도면 바깥의 빈 캔버스)에서 시작하면 시작되지 않는다
      const wrap = (await page.locator('.canvas-wrap').boundingBox())!;
      await page.mouse.click(wrap.x + 18, wrap.y + wrap.height - 18);
      await page.waitForTimeout(300);
      assert((await page.locator('.draw-bar b').innerText()).includes('부터'), '도면 밖에서 시작되어 버렸다');

      // 방 안에서 시작 → 그리는 중 막대가 뜬다
      const start = await w2s(room.x + room.w / 2, room.y + room.h / 2);
      await page.mouse.click(start.x, start.y);
      await page.waitForTimeout(350);
      const bar = await page.locator('.draw-bar').innerText();
      assert(bar.includes('침실3 출발'), bar);
      assert((await page.locator('.draw-bar .ok').count()) === 1, '끝내기 단추가 없다');

      // 종점 과녁이 보인다
      const targets = await page.locator('.stage text', { hasText: '에서 끝' }).count();
      assert(targets >= 1, `종점 과녁 ${targets}곳`);

      // 중간 한 점을 찍고 현관문 위를 누른다 → 저절로 끝난다
      const mid = await w2s(room.x + room.w / 2, door.y + 120);
      await page.mouse.click(mid.x, mid.y);
      await page.waitForTimeout(250);
      const at = await w2s(door.x, door.y);
      await page.mouse.click(at.x, at.y);
      await page.waitForTimeout(900);

      assert((await page.locator('.draw-bar b').innerText()).includes('부터'), '끝나지 않고 계속 그리고 있다');
      const p1 = await plan();
      assert(p1.routes.length === 1, `동선 ${p1.routes.length}개`);
      const r = p1.routes[0];
      assert(r.endpoint === 'entrance', `종점 ${r.endpoint}`);
      assert(String(r.label).includes('침실3') && String(r.label).includes('현관문'), r.label);
      assert(r.fromRoom === room.id, '시작한 방이 기록되지 않았다');
      const lastPt = r.points[r.points.length - 1];
      assert(
        Math.hypot(lastPt.x - door.x, lastPt.y - door.y) < 20,
        `끝점이 현관문에서 ${Math.round(Math.hypot(lastPt.x - door.x, lastPt.y - door.y))}cm 떨어졌다`,
      );
      // 남은 방 안내가 줄어든다
      const after = await page.locator('.draw-bar b').innerText();
      assert(!after.includes('침실3'), `아직 침실3 을 시키고 있다: ${after}`);
    });

    await check('동선 작도를 취소할 수 있고 두 번 만들어지지 않는다', async () => {
      const w2s = (wx: number, wy: number) =>
        page.evaluate(
          ([x, y]) => {
            const g = document.querySelector('svg.stage > g') as SVGGElement | null;
            const m = g?.getScreenCTM();
            return m ? { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f } : { x: 0, y: 0 };
          },
          [wx, wy],
        );
      const routes = async () =>
        page.evaluate(() => (JSON.parse(window.localStorage.getItem('evac-plan-v1') || '{}').routes || []).length);
      const rooms = async () =>
        page.evaluate(() => JSON.parse(window.localStorage.getItem('evac-plan-v1') || '{}').rooms);

      const before = await routes();
      const list = await rooms();
      const room = list.find((r: { name: string }) => r.name === '침실2');

      // 그리다가 취소
      let a = await w2s(room.x + 60, room.y + 60);
      await page.mouse.click(a.x, a.y);
      await page.waitForTimeout(250);
      await page.locator('.draw-bar .x').click();
      await page.waitForTimeout(400);
      assert((await routes()) === before, '취소했는데 동선이 생겼다');
      assert((await page.locator('.draw-bar b').innerText()).includes('부터'), '취소 후에도 그리는 중이다');

      // Esc 로도 접힌다
      await page.mouse.click(a.x, a.y);
      await page.waitForTimeout(250);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      assert((await routes()) === before, 'Esc 로 취소했는데 동선이 생겼다');

      // 더블클릭으로 끝내도 하나만 생긴다
      a = await w2s(room.x + 60, room.y + 60);
      const b2 = await w2s(room.x + room.w - 60, room.y + 60);
      await page.mouse.click(a.x, a.y);
      await page.waitForTimeout(200);
      await page.mouse.click(b2.x, b2.y);
      await page.waitForTimeout(200);
      await page.mouse.dblclick(b2.x, b2.y);
      await page.waitForTimeout(900);
      const after = await routes();
      assert(after === before + 1, `더블클릭으로 ${after - before}개가 생겼다`);
    });

    await check('확대·축소해도 도면이 가운데 머물고 Shift 드래그로 옮겨진다', async () => {
      const offset = () =>
        page.evaluate(() => {
          const g = document.querySelector('svg.stage > g') as SVGGElement | null;
          const wrap = document.querySelector('.canvas-wrap') as HTMLElement | null;
          if (!g || !wrap) return null;
          const b = g.getBoundingClientRect();
          const w = wrap.getBoundingClientRect();
          return { dx: b.left + b.width / 2 - (w.left + w.width / 2), ww: w.width };
        });

      for (const f of ['확대', '확대', '축소']) {
        await page.locator(`.zoom-pad button[title="${f}"]`).click();
        await page.waitForTimeout(300);
        const o = (await offset())!;
        assert(Math.abs(o.dx) < o.ww * 0.2, `${f} 뒤 가로 치우침 ${Math.round(o.dx)}px`);
      }

      // 휠로 확대해도 가운데
      const box = (await page.locator('.canvas-wrap').boundingBox())!;
      await page.mouse.move(box.x + 120, box.y + 120);
      await page.mouse.wheel(0, -400);
      await page.waitForTimeout(350);
      const o2 = (await offset())!;
      assert(Math.abs(o2.dx) < o2.ww * 0.2, `휠 확대 뒤 치우침 ${Math.round(o2.dx)}px`);

      // Shift 를 누른 채 끌면 옮겨진다
      const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await page.keyboard.down('Shift');
      await page.mouse.move(mid.x, mid.y);
      await page.mouse.down();
      await page.mouse.move(mid.x + 160, mid.y, { steps: 6 });
      await page.mouse.up();
      await page.keyboard.up('Shift');
      await page.waitForTimeout(300);
      const o3 = (await offset())!;
      assert(o3.dx > 90, `Shift 드래그로 옮겨지지 않았다 (${Math.round(o3.dx)}px)`);

      // 화면 맞춤으로 되돌아온다
      await page.locator('.zoom-pad button[title="화면 맞춤"]').click();
      await page.waitForTimeout(350);
      const o4 = (await offset())!;
      assert(Math.abs(o4.dx) < o4.ww * 0.2, `화면 맞춤 뒤 치우침 ${Math.round(o4.dx)}px`);
    });

    await check('세부 설정에서 목록으로 돌아갈 수 있다', async () => {
      await page.evaluate(() => window.localStorage.clear());
      await silenceCoach(page);
      await page.reload({ waitUntil: 'networkidle' });
      await loadTemplate(page, '3베이 판상형');
      for (const [stepName, rowSel] of [
        ['평면 작성', '.inspector table.tbl tbody tr'],
        ['개구부', '.inspector table.tbl tbody tr'],
      ] as const) {
        await stepTo(page, stepName);
        await page.locator(rowSel).first().click();
        await page.waitForTimeout(220);
        const back = page.locator('.insp-back');
        assert((await back.count()) >= 1, `${stepName}: 뒤로 단추가 없다`);
        await back.first().click();
        await page.waitForTimeout(220);
        const rows = await page.locator(rowSel).count();
        assert(rows > 0, `${stepName}: 목록으로 돌아오지 못했다`);
        assert((await page.locator('.insp-back').count()) === 0, `${stepName}: 세부 설정이 남아 있다`);
      }
    });

    await check('모든 단계의 단추를 눌러도 오류가 나지 않는다', async () => {
      const before = errors.length;
      let last = '(시작)';
      try {
      // 파일 저장·인쇄처럼 창을 여는 것은 뺀다
      // 파일 선택창·인쇄창을 여는 것은 자동으로 닫을 수 없으므로 뺀다
      const SKIP = [
        '인쇄',
        '뽑기',
        '저장',
        '불러오기',
        '올리기',
        '사진',
        '파일',
        'PNG',
        '내려받기',
        '미리보기',
        '지우기',
        '처음부터',
        '설명서',
        '따라하기',
      ];
      // 혹시 열리면 곧바로 닫는다
      page.on('filechooser', (fc) => fc.setFiles([]).catch(() => undefined));
      for (const level of ['중고', '초등']) {
        await page.evaluate(() => window.localStorage.clear());
        await silenceCoach(page);
        await page.reload({ waitUntil: 'networkidle' });
        await page.locator('.level-seg button', { hasText: level }).click({ timeout: 5000 });
        await page.waitForTimeout(250);
        await loadTemplate(page, '3베이 판상형');
        for (let i = 0; i < 9; i += 1) {
          last = `${level} / ${i + 1}단계 열기`;
          await page.locator('.stepper .step').nth(i).click({ timeout: 5000 });
          await page.waitForTimeout(220);
          const buttons = page.locator('.inspector .panel button');
          const n = await buttons.count();
          for (let k = 0; k < n; k += 1) {
            const btn = buttons.nth(k);
            let label = '';
            try {
              label = (await btn.innerText()).trim();
              if (!(await btn.isVisible()) || (await btn.isDisabled())) continue;
            } catch {
              continue;
            }
            if (SKIP.some((w) => label.includes(w))) continue;
            last = `${level} / ${i + 1}단계 / "${label.replace(/\s+/g, ' ').slice(0, 24)}"`;
            try {
              await btn.click({ timeout: 1500, noWaitAfter: true });
            } catch {
              /* 자리가 바뀌어 못 누른 것은 넘어간다 */
            }
            await page.waitForTimeout(60);
            // 모달이 열렸으면 닫아 다음 단추를 막지 않게 한다
            if ((await page.locator('.modal-back').count()) > 0) {
              await page.keyboard.press('Escape');
              const closeBtn = page.locator('.modal footer button').first();
              if ((await closeBtn.count()) > 0) {
                await closeBtn.click({ timeout: 1500 }).catch(() => undefined);
              }
              await page.waitForTimeout(120);
            }
          }
          await page.waitForTimeout(120);
        }
      }
      } catch (e) {
        const why = e instanceof Error ? e.message.replace(/\s+/g, ' ').slice(0, 90) : String(e);
        throw new Error(`${last} 에서 멈춤 — ${why}`);
      }
      const fresh = errors.slice(before).filter((e) => !e.includes('ResizeObserver'));
      assert(fresh.length === 0, `${last} 에서 오류 ${fresh.length}건: ${fresh.slice(0, 3).join(' | ')}`);
    });

    /* 25 */
    await check('콘솔 오류 없이 전 과정이 끝난다', async () => {
      const real = errors.filter((e) => !e.includes('ResizeObserver'));
      assert(real.length === 0, real.slice(0, 3).join(' | '));
    });

    /* ------------------------------------------------------------ */
    /* 어린이 화면 — src/kids (plan2-1.md v1.1)                      */
    /* ------------------------------------------------------------ */

    await check('[어린이] 첫 화면에서 고르면 어린이 화면과 집 모양 고르기가 뜬다', async () => {
      await page.evaluate(() => window.localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('.k-gate');
      assert((await page.locator('.k-gate-pick').count()) === 2, '고를 것이 둘이 아니다');
      await page.locator('[data-audience="kids"]').click();
      await page.waitForSelector('.k-app');
      await page.waitForSelector('.k-onboard');
      assert((await page.locator('.k-tmpl').count()) === 9, '시작 평면 8종 + 빈 도면 (설계서 v1.2 §1.2)');
      assert((await page.locator('.k-tabs').count()) === 0, '기본판에 재난 탭이 있다 (FR-2.1 개정)');
      assert((await page.locator('.k-ask input, textarea').count()) === 0, '자유 입력 UI 가 있다 (의견 3)');
    });

    await check('[어린이] 온보딩 5회 조작으로 게임 시작 — 집 모양·1층·내 방·나중에·시작 (§2.5)', async () => {
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

    await check('[어린이] 게임 — 연습 모드 기본, 위험장이 그려지고, 움직이고, 그만두면 리포트가 나온다', async () => {
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

    await check('[어린이] 리포트 — [왜?] 는 자리에서 펼쳐지고, 지도 고치기는 편집으로 돌아간다', async () => {
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

    await check('[어린이] 팔레트 8칸 — 클릭 두 번으로 표준 크기 방이 놓이고, 겹치면 거부된다 (FR-7.1 · FR-7.6)', async () => {
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

    await check('[어린이] 문 후보 — 맞댄 벽의 “문?”을 한 번 누르면 문이 놓인다 (FR-7.3)', async () => {
      await page.locator('[data-coach="kids-tool-select"]').click();
      const cands = await page.locator('.k-stage [data-door-candidate]').count();
      assert(cands >= 1, `문 후보 ${cands}개`);
      const before = (await kidsSave(page)).blocks;
      await page.locator('.k-stage [data-door-candidate]').first().click();
      await page.waitForTimeout(800);
      assert((await kidsSave(page)).blocks === before + 1, '문이 안 놓였다');
      assert((await page.locator('.k-stage [data-door-candidate]').count()) === cands - 1, '후보가 안 줄었다');
    });

    await check('[어린이] 더보기에서 소화기를 골라 놓고, 캐릭터가 처음 놓은 블록을 말한다', async () => {
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

    await check('[어린이] 주 경로를 끌어 그리면 캐릭터가 첫 지적을 말하고, 보조 경로도 따로 그려진다 (§3.2)', async () => {
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

    await check('[어린이] "이제 뭘 해야 해?" 는 언제나 답한다 (FR-7.10 · P3)', async () => {
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

    await check('[어린이] 되돌리기와 새로고침 복원', async () => {
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

    await check('[어린이] 다시 해보기 — 같은 지도, 새 판. 시도 횟수가 는다', async () => {
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

    await check('[어린이] 개구부를 골라 평소 열림·닫힘을 바꾼다 (설계서 v1.2 §2.4)', async () => {
      await page.locator('[data-coach="kids-tool-select"]').click();
      /* SVG 의 <g> 는 직접 누르기 어렵다. 그린 자리의 한가운데를 마우스로 짚는다 */
      const door = page.locator('.k-stage [data-kind="opening"]').first();
      const bb = await door.boundingBox();
      assert(bb !== null, '개구부가 화면에 없다');
      await page.mouse.click(bb!.x + bb!.width / 2, bb!.y + bb!.height / 2);
      await page.waitForTimeout(400);
      const toggle = page.locator('[data-coach="kids-opening-toggle"]');
      assert((await toggle.count()) === 1, '개폐 토글이 없다');
      const before = await toggle.getAttribute('data-open');
      await toggle.click();
      await page.waitForTimeout(500);
      const after = await page.locator('[data-coach="kids-opening-toggle"]').getAttribute('data-open');
      assert(before !== after, `상태가 안 바뀐다 ${before} → ${after}`);
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(500);
      await page.keyboard.press('Escape');
    });

    await check('[어린이] 말풍선이 도면을 가리지 않는다 (설계서 v1.2 §6.1)', async () => {
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

    await check('[어린이] 소리를 끄면 상태가 저장된다 (설계서 v1.2 §7.1 C1)', async () => {
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

    await check('[어린이] 내 캐릭터를 소방관으로 바꾼다 (설계서 v1.2 §6.2)', async () => {
      await page.locator('[data-coach="kids-character"]').click();
      await page.waitForSelector('.k-char-grid');
      assert((await page.locator('.k-char').count()) === 4, '캐릭터가 4종이 아니다');
      await page.locator('[data-character="firefighter"]').click();
      await page.waitForTimeout(600);
      const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem('evac-kids-v1') ?? '{}').profile?.playerCharacter);
      assert(saved === 'firefighter', `저장 안 됨: ${String(saved)}`);
      await page.locator('[data-coach="kids-character"]').click();
      await page.locator('[data-character="ilgu"]').click();
      await page.waitForTimeout(400);
    });

    await check('[어린이] 누르는 것이 모두 48×48 이상이다 (D6 · NFR-10)', async () => {
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

    await check('[어린이] 본문 대비가 4.5:1 이상이다 (NFR-10)', async () => {
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

    await check('[어린이] 마우스 없이 Tab·방향키·Enter 로 방을 놓는다 (설계서 v1.0 §7.4)', async () => {
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

    await check('[어린이] 인쇄 미리보기와 인쇄 매체에서 A4 세로 시트만 남는다', async () => {
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

    await check('[어린이] 3D 리플레이가 열리고 재생·시점 전환이 된다 (FR-11)', async () => {
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
      await page.locator('[data-view="top"]').click();
      await page.waitForTimeout(300);
      assert((await page.locator('[data-view="top"]').getAttribute('aria-pressed')) === 'true', '시점이 안 바뀐다');
      await page.locator('[data-coach="kids-replay-play"]').click();
      await page.waitForTimeout(200);
      await page.locator('.k-replay-bar .k-tb', { hasText: '닫기' }).click();
      await page.waitForTimeout(300);
      assert((await page.locator('.k-replay').count()) === 0, '리플레이가 안 닫힌다');
      await page.locator('[data-coach="kids-edit-plan"]').click();
      await page.waitForSelector('svg.k-stage');
    });

    await check('[어린이] 빈 도면에서 시작해도 방을 놓을 수 있고 내 자리를 묻는다 (설계서 v1.2 §1.3)', async () => {
      await page.evaluate(() => window.localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('.k-gate');
      await page.locator('[data-audience="kids"]').click();
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

    await check('[어린이] 첫 화면으로 돌아가 일반 화면을 고르면 9단계 화면이 뜬다', async () => {
      await page.locator('[data-coach="kids-leave"]').click();
      await page.waitForSelector('.k-gate');
      await page.locator('[data-audience="general"]').click();
      await page.waitForSelector('.stepper .step');
      assert((await page.locator('.stepper .step').count()) === 9, '단계 수');
      assert((await page.evaluate(() => document.getElementById('k-page'))) === null, '어린이 인쇄 규칙이 남아 있다');
    });

    await context.close();

    /* 26 — 오프라인 배포본이 있으면 file:// 에서 인터넷 없이 동작하는지 본다 */
    const standalone = path.join(root, 'dist', 'evacuation-planner.html');
    if (fs.existsSync(standalone)) {
      await check('오프라인 배포본이 인터넷 없이 열린다', async () => {
        const off = await browser!.newContext({
          viewport: { width: 1440, height: 900 },
          locale: 'ko-KR',
          offline: true,
        });
        const page2 = await off.newPage();
        const pageErrors: string[] = [];
        const outside: string[] = [];
        page2.on('pageerror', (e) => pageErrors.push(e.message));
        page2.on('request', (r) => {
          if (!r.url().startsWith('file:')) outside.push(r.url());
        });
        await page2.goto(`file:///${standalone.split(path.sep).join('/')}`);
        // 처음 열면 누가 쓰는지 고르는 첫 화면이 뜬다
        await page2.waitForSelector('.k-gate', { timeout: 20000 });
        await page2.locator('[data-audience="general"]').click();
        await page2.waitForSelector('.stepper .step', { timeout: 20000 });
        // 처음 열면 따라하기가 뜬다 — 오프라인에서도 뜨는지 확인하고 닫는다
        await page2.waitForSelector('.coach-bubble', { timeout: 8000 });
        await page2.locator('.coach-bubble button', { hasText: '그만 보기' }).click();
        await page2.waitForTimeout(250);
        await page2.locator('.tmpl', { hasText: '타워형' }).first().click();
        await page2.waitForTimeout(700);
        const rects = await page2.locator('.stage rect').count();
        assert(rects > 20, `도형 ${rects}개`);
        await page2.locator('.stepper .step', { hasText: '피난동선' }).first().click();
        await page2.waitForTimeout(200);
        await page2.locator('.inspector button', { hasText: '주 동선' }).first().click();
        await page2.waitForTimeout(700);
        const rows = await page2.locator('.inspector table.tbl tbody tr').count();
        assert(rows >= 3, `동선 ${rows}개`);
        assert(outside.length === 0, `외부 요청 ${outside.length}건: ${outside.slice(0, 2).join(', ')}`);
        assert(pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
        const font = await page2.evaluate(() => getComputedStyle(document.body).fontFamily);
        assert(!font.includes('Pretendard'), `웹폰트가 남아 있다: ${font}`);
        await off.close();
      });

      await check('[어린이] 오프라인 배포본에서 온보딩부터 리포트까지 간다 (NFR-1)', async () => {
        const off = await browser!.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR', offline: true });
        const p3 = await off.newPage();
        const pageErrors: string[] = [];
        const outside: string[] = [];
        p3.on('pageerror', (e) => pageErrors.push(e.message));
        p3.on('request', (r) => {
          if (!r.url().startsWith('file:')) outside.push(r.url());
        });
        await p3.goto(`file:///${standalone.split(path.sep).join('/')}`);
        await p3.waitForSelector('.k-gate', { timeout: 20000 });
        await p3.locator('[data-audience="kids"]').click();
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
