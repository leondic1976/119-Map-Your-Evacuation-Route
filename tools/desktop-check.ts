/**
 * 데스크톱 껍데기 실행 검증 (설계서 v1.18 §5.3 · 대장 #110).
 *
 * Playwright 의 Electron 구동으로 desktop/main.cjs 를 띄워 V2 가
 *   - 첫 화면부터 뜨고, 설치 안내로 가는 링크는 보이지 않으며
 *   - 그림·글꼴·음성이 실리고
 *   - 이름표를 지나 그리기까지 가서 저장이 남고
 *   - 바깥(file: 이 아닌) 요청이 0건인지
 * 본다. dist/home-escape-map.html 이 있어야 한다 (npm run build:standalone).
 *
 *   npm run desktop:check               개발용 — node_modules 의 electron 으로 desktop/main.cjs 를 띄운다
 *   npm run desktop:check -- --packaged  빌드본 — release/win-unpacked/HomeEscapeMap.exe 를 띄운다 (npm run desktop:build 뒤)
 */
import fs from 'node:fs';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';

const root = process.cwd();
const indexFile = path.join(root, 'dist', 'home-escape-map.html');
const packaged = process.argv.includes('--packaged') || Boolean(process.env.DESKTOP_EXE);
/* DESKTOP_EXE 로 다른 실행 파일을 줄 수 있다 — 공개 주소에서 받은 설치 파일을 풀어 그 안의 앱을 검증할 때 쓴다 */
const packagedExe = process.env.DESKTOP_EXE || path.join(root, 'release', 'win-unpacked', 'HomeEscapeMap.exe');

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const t = (id: string): string => `[data-testid="${id}"]`;

async function main(): Promise<void> {
  if (packaged && !fs.existsSync(packagedExe)) {
    process.stderr.write(`\n  ${packagedExe} 가 없다. 먼저 npm run desktop:build 를 돌리거나 DESKTOP_EXE 를 바로잡는다.\n\n`);
    process.exit(1);
  }
  if (!packaged && !fs.existsSync(indexFile)) {
    process.stderr.write('\n  dist/home-escape-map.html 이 없다. 먼저 npm run build:standalone 을 돌린다.\n\n');
    process.exit(1);
  }
  /* 검증 중에는 새 판 확인을 끈다 — 대화상자가 뜨면 멈춘다 (설계서 v2.0 §7) */
  const env = { ...process.env, HEM_NO_UPDATE: '1' };
  const app = packaged
    ? await electron.launch({ executablePath: packagedExe, args: ['--autoplay-policy=no-user-gesture-required'], cwd: root, env })
    : await electron.launch({ args: [path.join(root, 'desktop', 'main.cjs'), '--autoplay-policy=no-user-gesture-required'], cwd: root, env });
  try {
    const page = await app.firstWindow();
    const outside: string[] = [];
    const errors: string[] = [];
    page.on('request', (request) => {
      if (!/^(file|data|blob|devtools):/.test(request.url())) outside.push(request.url());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.waitForSelector(t('start'), { timeout: 30_000 });
    /* 지난 실행의 저장 자료가 Electron 프로필에 남아 있다 — 처음 켠 PC 처럼 비우고 다시 연다 */
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.reload();
    await page.waitForSelector(t('start'), { timeout: 30_000 });
    assert((await page.title()).includes('우리집 대피지도'), `창 제목이 다르다: ${await page.title()}`);
    assert((await page.locator(t('install-link')).count()) === 0, '데스크톱 앱에 설치 안내 링크가 보인다');
    const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    assert(size.w >= 1024, `창 너비가 ${size.w}px 다`);
    await page.waitForFunction(() => [...document.images].every((img) => img.complete));
    const broken = await page.evaluate(() => [...document.images].filter((img) => img.naturalWidth === 0).map((img) => img.src));
    assert(broken.length === 0, `그림이 깨졌다: ${broken.slice(0, 2).join(', ')}`);
    const font = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Jua' && f.status === 'loaded');
    });
    assert(font, 'Jua 글꼴이 실리지 않았다');
    await page.locator(t('start')).click();
    await page.locator(t('grade-3')).click();
    await page.locator(t('name')).fill('안전이');
    await page.locator(t('tag-done')).click();
    await page.waitForSelector('.studio', { timeout: 15_000 });
    await page.waitForFunction(() => ['playing', 'ended', 'failed'].includes(document.documentElement.dataset.voiceState ?? ''), undefined, { timeout: 10_000 });
    const voice = await page.evaluate(() => document.documentElement.dataset.voiceState);
    assert(voice === 'playing' || voice === 'ended', `음성 상태가 ${voice} 다`);
    await page.keyboard.press('Escape');
    /* 저장이 실제로 남는지 — 다시 열면 이어서 */
    await page.locator(t('help')).click();
    const walls = await page.locator('.stage svg.plan').first().getAttribute('data-walls');
    assert(Number(walls) > 0, '도와줘가 벽을 채우지 않았다');
    await page.reload();
    await page.waitForSelector(t('start'), { timeout: 15_000 });
    assert((await page.locator(t('start')).innerText()).includes('이어서'), '데스크톱 앱에서 저장이 남지 않는다');
    await page.locator(t('start')).click();
    await page.waitForSelector('.studio', { timeout: 15_000 });
    assert((await page.locator('.stage svg.plan').first().getAttribute('data-walls')) === walls, '그린 벽이 그대로 남지 않았다');
    const stored = await page.evaluate(() => Object.keys(window.localStorage));
    assert(stored.length === 1 && stored[0] === 'home-escape-map-v2:plan', `도면 말고 다른 것이 저장됐다: ${stored.join(', ')}`);
    assert(outside.length === 0, `바깥 요청 ${outside.length}건: ${outside.slice(0, 3).join(', ')}`);
    assert(errors.length === 0, `페이지 오류: ${errors.slice(0, 2).join(' | ')}`);
    process.stdout.write(`\n  데스크톱 ${packaged ? '빌드본' : '껍데기'} 검증 통과 — 첫 화면 · 그림 · 글꼴 · 음성 · 이름표 · 그리기 · 저장 · 바깥 요청 0건\n\n`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  process.stderr.write(`\n  실패: ${e instanceof Error ? e.message : String(e)}\n\n`);
  process.exit(1);
});
