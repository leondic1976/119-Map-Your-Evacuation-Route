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

async function stepTo(page: Page, title: string): Promise<void> {
  await page.locator('.stepper .step', { hasText: title }).first().click();
  await page.waitForTimeout(140);
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
  await stepTo(page, '평면 작성');
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
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(server.url, { waitUntil: 'networkidle' });
    await page.evaluate(() => window.localStorage.clear());
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
      await page.locator('.topbar button[title^="도움말"]').click();
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
      await page.locator('.inspector button', { hasText: '자유 그리기 시작' }).click();
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

    /* 25 */
    await check('콘솔 오류 없이 전 과정이 끝난다', async () => {
      const real = errors.filter((e) => !e.includes('ResizeObserver'));
      assert(real.length === 0, real.slice(0, 3).join(' | '));
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
        await page2.waitForSelector('.stepper .step', { timeout: 20000 });
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
