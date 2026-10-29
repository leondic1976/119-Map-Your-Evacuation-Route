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
import { OFFLINE_ZIP_NAME } from '../src/content/release';

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

/* 3. 서비스 워커 — 음성 폴더와 꾸러미(.zip)는 선캐시에서 뺀다. 설치 안내(download/index.html)는 넣는다 */
const files = walk(outDir).filter((file) => {
  const rel = path.relative(outDir, file).split(path.sep).join('/');
  if (rel === 'sw.js' || rel.startsWith('voice/') || rel.endsWith('.zip')) return false;
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
process.stdout.write(`    매니페스트  out/manifest.webmanifest\n`);
process.stdout.write(`    서비스 워커 out/sw.js · 선캐시 ${precache.length}개 · 배경 음성 ${voice.length}개 · ${cacheName}\n\n`);
