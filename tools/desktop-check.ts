/**
 * 데스크톱 껍데기 실행 검증 (설계서 v1.18 §5.3).
 *
 * Playwright 의 Electron 구동으로 desktop/main.cjs 를 띄워
 *   - 소개 화면이 뜨고, 설치 안내로 가는 링크는 보이지 않으며
 *   - 이름표를 지나 편집 화면까지 가고
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

async function main(): Promise<void> {
  if (packaged && !fs.existsSync(packagedExe)) {
    process.stderr.write(`\n  ${packagedExe} 가 없다. 먼저 npm run desktop:build 를 돌리거나 DESKTOP_EXE 를 바로잡는다.\n\n`);
    process.exit(1);
  }
  if (!packaged && !fs.existsSync(indexFile)) {
    process.stderr.write('\n  dist/home-escape-map.html 이 없다. 먼저 npm run build:standalone 을 돌린다.\n\n');
    process.exit(1);
  }
  const app = packaged
    ? await electron.launch({ executablePath: packagedExe, args: [], cwd: root })
    : await electron.launch({ args: [path.join(root, 'desktop', 'main.cjs')], cwd: root });
  try {
    const page = await app.firstWindow();
    const outside: string[] = [];
    const errors: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith('file:') && !request.url().startsWith('devtools:')) outside.push(request.url());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.waitForSelector('.k-welcome', { timeout: 30_000 });
    /* 지난 실행의 저장 자료가 Electron 프로필에 남아 있다 — 처음 켠 PC 처럼 비우고 다시 연다 */
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.waitForSelector('.k-welcome', { timeout: 30_000 });
    assert((await page.title()).includes('우리집 대피지도'), `창 제목이 다르다: ${await page.title()}`);
    assert((await page.locator('[data-coach="kids-welcome-install"]').count()) === 0, '데스크톱 앱에 설치 안내 링크가 보인다');
    const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    assert(size.w >= 1024, `창 너비가 ${size.w}px 다`);
    await page.locator('[data-coach="kids-welcome-start"]').click();
    await page.waitForSelector('.k-profile', { timeout: 15_000 });
    await page.locator('[data-profile="name"]').fill('안전이');
    await page.locator('[data-profile="grade"] [data-grade="3"]').click();
    await page.locator('[data-coach="kids-profile-start"]').click();
    await page.waitForSelector('.k-app', { timeout: 15_000 });
    await page.waitForSelector('.k-onboard', { timeout: 15_000 });
    assert((await page.locator('[data-coach="kids-name-tag"]').innerText()).includes('3학년 안전이'), '이름표가 반영되지 않았다');
    /* 저장이 실제로 남는지 — 다시 열면 이어서 */
    await page.locator('[data-start-path="template"]').click();
    await page.locator('[data-template="apt_2room"]').click();
    await page.locator('[data-coach="kids-plan-start"]').click();
    await page.waitForTimeout(900);
    const saved = await page.evaluate(() => window.localStorage.getItem('evac-kids-v1'));
    assert(Boolean(saved && saved.includes('"schemaVersion":4')), '데스크톱 앱에서 저장이 남지 않는다');
    assert(outside.length === 0, `바깥 요청 ${outside.length}건: ${outside.slice(0, 3).join(', ')}`);
    assert(errors.length === 0, `페이지 오류: ${errors.slice(0, 2).join(' | ')}`);
    process.stdout.write(`\n  데스크톱 ${packaged ? '빌드본' : '껍데기'} 검증 통과 — 소개 · 이름표 · 편집 · 저장 · 바깥 요청 0건\n\n`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  process.stderr.write(`\n  실패: ${e instanceof Error ? e.message : String(e)}\n\n`);
  process.exit(1);
});
