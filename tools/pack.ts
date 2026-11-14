/**
 * 내보내기 마감 — `next build` 뒤에 돈다 (설계서 v1.18 §5).
 *
 *   1. dist/ 의 오프라인 꾸러미 ZIP 을 out/download/ 로 복사한다 (없으면 알리고 지나간다)
 *   2. out/manifest.webmanifest 를 기준 경로를 넣어 만든다
 *   3. out/sw.js 를 tools/sw.template.js 에서 만든다 — 선캐시는 앱 껍데기, 음성은 배경 캐시 목록
 *
 * 기준 경로는 next build 와 같은 BASE_PATH 를 읽는다. 그래서 `npm run build` 가 둘을 한 번에 돈다.
 *
 *   npm run pack        (npm run build 가 자동으로 부른다)
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DESKTOP_DIST_DIR, OFFLINE_ZIP_NAME, desktopAssetNames } from '../src/content/release';
import { readReleases } from './releases.mjs';

const root = process.cwd();
const outDir = path.join(root, 'out');
const distDir = path.join(root, 'dist');
const basePath = (process.env.BASE_PATH || '').replace(/\/$/, '');
const scope = `${basePath}/`;
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string };

/** 선캐시에 넣는 파일 종류 — 음성·꾸러미·RSC 페이로드(.txt)는 뺀다 */
const PRECACHE_EXT = new Set(['.html', '.css', '.js', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff2', '.webmanifest']);

function fail(msg: string): never {
  process.stderr.write(`\n  실패: ${msg}\n\n`);
  process.exit(1);
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function toUrl(file: string): string {
  const rel = path.relative(outDir, file).split(path.sep).join('/');
  if (rel === 'index.html') return scope;
  if (rel.endsWith('/index.html')) return `${scope}${rel.slice(0, -'index.html'.length)}`;
  return `${scope}${rel}`;
}

function bytes(n: number): string {
  return n < 1024 * 1024 ? `${(n / 1024).toFixed(0)}KB` : `${(n / 1024 / 1024).toFixed(2)}MB`;
}

if (!fs.existsSync(path.join(outDir, 'index.html'))) fail('out/index.html 이 없다. 먼저 next build 를 돌린다.');

/* 1. 오프라인 꾸러미 */
const zipSource = path.join(distDir, OFFLINE_ZIP_NAME);
let zipNote = '없음 — npm run build:standalone 을 먼저 돌리면 함께 실린다';
if (fs.existsSync(zipSource)) {
  const downloadDir = path.join(outDir, 'download');
  fs.mkdirSync(downloadDir, { recursive: true });
  fs.copyFileSync(zipSource, path.join(downloadDir, OFFLINE_ZIP_NAME));
  zipNote = `${bytes(fs.statSync(zipSource).size)} → out/download/${OFFLINE_ZIP_NAME}`;
}

/*
 * 1b. 윈도우 설치 파일 — deploy.yml 이 Release `desktop` 에서 받아 dist/desktop/ 에 둔 것을 같은 사이트에 싣는다.
 * 받는 곳을 같은 사이트 안에 두려는 것이다(저장소는 대장 #167 에서 공개로 바꿨다). 둘 다 있을 때만 싣는다(안내 페이지가 준비 중/받기를 가른다).
 */
const assetNames = desktopAssetNames(pkg.version);
const desktopFiles = [assetNames.setup, assetNames.portable].map((name) => path.join(distDir, DESKTOP_DIST_DIR, name));
let desktopNote = '없음 — 안내 페이지는 준비 중이라고 말한다';
if (desktopFiles.every((file) => fs.existsSync(file))) {
  const downloadDir = path.join(outDir, 'download');
  fs.mkdirSync(downloadDir, { recursive: true });
  for (const file of desktopFiles) fs.copyFileSync(file, path.join(downloadDir, path.basename(file)));
  desktopNote = desktopFiles.map((file) => `${path.basename(file)} ${bytes(fs.statSync(file).size)}`).join(' · ');
  /*
   * 1c. 새 판 안내 latest.json (설계서 v2.0 §7) — 데스크톱 앱이 켤 때 읽어 판을 견준다.
   * 설치판의 크기와 sha256 을 함께 적어 받은 파일이 사이트의 것과 같은지 맞춘다. 바뀐 것은 CHANGELOG 맨 위 항목이다.
   */
  const describe = (file: string) => ({
    name: path.basename(file),
    size: fs.statSync(file).size,
    sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  });
  const latest = {
    version: pkg.version,
    publishedAt: new Date().toISOString(),
    notes: changelogTop(),
    setup: describe(desktopFiles[0]),
    portable: describe(desktopFiles[1]),
  };
  fs.writeFileSync(path.join(downloadDir, 'latest.json'), JSON.stringify(latest, null, 2), 'utf8');
  desktopNote += ` · latest.json ${pkg.version}`;
}

/*
 * 1d. 판 기록 (대장 #130) — 무엇이 바뀌었는지와 받을 수 있는 설치판을 download/releases.json 에 적는다.
 * 지난 판의 설치판도 함께 실어 안내 페이지에서 받을 수 있게 한다.
 */
const releaseList = readReleases(root, pkg.version);
{
  const downloadDir = path.join(outDir, 'download');
  fs.mkdirSync(downloadDir, { recursive: true });
  const listed = releaseList.map((entry) => {
    if (!entry.setup) return entry;
    const source = path.join(distDir, DESKTOP_DIST_DIR, entry.setup.name);
    if (!fs.existsSync(path.join(downloadDir, entry.setup.name))) fs.copyFileSync(source, path.join(downloadDir, entry.setup.name));
    return { ...entry, setup: { ...entry.setup, sha256: createHash('sha256').update(fs.readFileSync(source)).digest('hex') } };
  });
  fs.writeFileSync(path.join(downloadDir, 'releases.json'), JSON.stringify({ current: pkg.version, releases: listed }, null, 2), 'utf8');
}

/** CHANGELOG.md 맨 위 판의 글머리 줄들 — 새 판 대화상자에 그대로 실린다 */
function changelogTop(): string {
  const file = path.join(root, 'CHANGELOG.md');
  if (!fs.existsSync(file)) return '';
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith('## '));
  if (start < 0) return '';
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    if (line.startsWith('- ')) out.push(line);
  }
  return out.slice(0, 8).join('\n');
}

/* 2. 매니페스트 */
const manifest = {
  id: scope,
  name: '우리집 대피지도',
  short_name: '대피지도',
  description: '우리 집을 그리고 나가는 길을 찾아 불이 난 집에서 직접 빠져나와 보는 초등학생용 대피 연습 프로그램',
  lang: 'ko',
  dir: 'ltr',
  start_url: scope,
  scope,
  display: 'standalone',
  orientation: 'landscape',
  background_color: '#eef3f7',
  theme_color: '#0b2f51',
  categories: ['education', 'kids'],
  icons: [
    { src: `${scope}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `${scope}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: `${scope}icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
for (const icon of manifest.icons) {
  const file = path.join(outDir, icon.src.slice(scope.length));
  if (!fs.existsSync(file)) fail(`아이콘이 없다: ${icon.src} — npm run icons 로 만든다`);
}
fs.writeFileSync(path.join(outDir, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2), 'utf8');

/* 3. 서비스 워커 — 음성 폴더와 꾸러미(.zip)·설치 파일(.exe)은 선캐시에서 뺀다. 설치 안내(download/index.html)는 넣는다 */
const files = walk(outDir).filter((file) => {
  const rel = path.relative(outDir, file).split(path.sep).join('/');
  /* latest.json 은 늘 새것을 읽어야 하므로 선캐시하지 않는다 */
  if (rel === 'sw.js' || rel.startsWith('voice/') || rel.endsWith('.zip') || rel.endsWith('.exe') || rel === 'download/latest.json') return false;
  return PRECACHE_EXT.has(path.extname(rel).toLowerCase());
});
const precache = Array.from(new Set(files.map(toUrl))).sort();
/* 음성 매니페스트만은 선캐시에 넣는다 — 배경 캐시가 끊겨도 말풍선 다시 듣기 목록은 있어야 한다 */
precache.push(`${scope}voice/manifest.json`);
const voiceManifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'voice', 'manifest.json'), 'utf8')) as { items: Array<{ filename: string }> };
const voice = voiceManifest.items.map((item) => `${scope}voice/${item.filename}`);

const digest = createHash('sha1');
for (const file of files) digest.update(fs.readFileSync(file));
digest.update(JSON.stringify(precache));
const cacheName = `hem-${pkg.version}-${digest.digest('hex').slice(0, 10)}`;

const template = fs.readFileSync(path.join(root, 'tools', 'sw.template.js'), 'utf8');
const sw = template
  .replace('__CACHE_NAME__', cacheName)
  .replace('__SCOPE__', scope)
  .replace('__PRECACHE__', JSON.stringify(precache))
  .replace('__VOICE__', JSON.stringify(voice));
fs.writeFileSync(path.join(outDir, 'sw.js'), sw, 'utf8');

process.stdout.write('\n  내보내기 마감\n');
process.stdout.write(`    기준 경로   ${scope}\n`);
process.stdout.write(`    꾸러미      ${zipNote}\n`);
process.stdout.write(`    설치 파일   ${desktopNote}\n`);
process.stdout.write(`    판 기록     download/releases.json · ${releaseList.length}개 판 · 받을 수 있는 설치판 ${releaseList.filter((r) => r.setup).length}개\n`);
process.stdout.write(`    매니페스트  out/manifest.webmanifest\n`);
process.stdout.write(`    서비스 워커 out/sw.js · 선캐시 ${precache.length}개 · 배경 음성 ${voice.length}개 · ${cacheName}\n\n`);
