/**
 * 오프라인 배포본 빌더.
 *
 * 정적 내보내기(out/)의 CSS·JS 를 HTML 한 파일 안으로 끌어들여,
 * 인터넷이 없는 교육장에서도 더블클릭으로 열리는 단일 HTML 을 만든다.
 * 웹폰트(CDN)만 시스템 글꼴로 대체한다.
 *
 *   npm run build:standalone
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { OFFLINE_BUNDLE_DIR, OFFLINE_ZIP_NAME } from '../src/content/release';
import { zipBuffer, type ZipEntry } from './zip';

const root = path.resolve(process.cwd());
const outDir = path.join(root, 'out');
const distDir = path.join(root, 'dist');
const target = path.join(distDir, 'home-escape-map.html');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string };

function fail(msg: string): never {
  process.stderr.write(`\n  실패: ${msg}\n\n`);
  process.exit(1);
}

function readAsset(url: string): string {
  // /_next/static/... → out/_next/static/...
  const clean = url.split('?')[0].replace(/^\.?\//, '');
  const p = path.join(outDir, clean);
  if (!fs.existsSync(p)) fail(`자산을 찾지 못했다: ${url}`);
  return fs.readFileSync(p, 'utf8');
}

function bytes(n: number): string {
  return n < 1024 * 1024 ? `${(n / 1024).toFixed(0)}KB` : `${(n / 1024 / 1024).toFixed(2)}MB`;
}

/**
 * 웹폰트를 부르지 않는 상태로 다시 내보낸다.
 * HTML 에서 <link> 를 지우는 것만으로는 수화 시 React 가 다시 넣어 버린다.
 */
process.stdout.write('\n  오프라인 모드로 정적 내보내기…\n');
// 인자를 문자열 하나로 넘긴다 — 윈도우의 npx.cmd 는 셸을 거쳐야 하고,
// 배열 인자와 shell 을 함께 쓰면 Node 가 경고를 낸다.
const build = spawnSync('npx next build', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NEXT_PUBLIC_OFFLINE: '1' },
});
if (build.status !== 0) fail('정적 내보내기에 실패했다.');

const indexPath = path.join(outDir, 'index.html');
if (!fs.existsSync(indexPath)) fail('out/index.html 이 없다.');

let html = fs.readFileSync(indexPath, 'utf8');
let css = 0;
let js = 0;
let images = 0;

/* 1. 웹폰트 CDN 제거 — 시스템 글꼴로 대체 */
html = html.replace(/<link[^>]+cdn\.jsdelivr\.net[^>]*>/g, '');
html = html.replace(/<link[^>]+rel="preconnect"[^>]*>/g, '');

/* 2. 미리 불러오기 지시는 의미가 없으므로 제거 */
html = html.replace(/<link[^>]+rel="preload"[^>]+>/g, '');
html = html.replace(/<link[^>]+rel="prefetch"[^>]+>/g, '');

/* 3. 스타일시트 인라인 */
const cssUrls = new Map<string, string>();
html = html.replace(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (m, href: string) => {
  if (!href.includes('_next')) return m;
  const body = readAsset(href);
  css += body.length;
  cssUrls.set(href, body);
  return `<style data-inlined="${path.basename(href)}">${body}</style>`;
});

/* 4. 스크립트 인라인 (문서 순서 유지) */
html = html.replace(/<script([^>]*)src="([^"]+)"([^>]*)><\/script>/g, (m, pre: string, src: string, post: string) => {
  if (!src.includes('_next')) return m;
  const body = readAsset(src);
  js += body.length;
  const type = /type="module"/.test(pre + post) ? ' type="module"' : '';
  return `<script${type} data-inlined="${path.basename(src)}">${body}</script>`;
});

/* 5. 시스템 글꼴 대체 안내 주석 */
html = html.replace(
  '</head>',
  `<style>/* 오프라인 배포본 — 웹폰트 대신 시스템 글꼴을 쓴다 */
:root{--font-sans:"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo","Noto Sans KR",sans-serif}</style></head>`,
);

/**
 * 6. 스트리밍 페이로드 안의 자산 경로를 data URL 로 바꾼다.
 *
 * HTML 의 <link> 를 <style> 로 바꿔도, 수화 과정에서 React 가 페이로드에 적힌
 * 스타일시트를 다시 넣는다. 그대로 두면 오프라인에서 404 가 나므로, 그 경로를
 * 내용이 담긴 data URL 로 치환해 네트워크 요청 자체를 없앤다.
 * encodeURIComponent 결과에는 따옴표·역슬래시·줄바꿈이 없어 페이로드 문자열 안에
 * 그대로 넣어도 안전하다.
 */
for (const [href, body] of cssUrls) {
  const dataUrl = `data:text/css;charset=utf-8,${encodeURIComponent(body)}`;
  html = html.split(href).join(dataUrl);
}

/* 7. 소개 화면 등 public/images 자산도 단일 HTML 안에 넣는다 */
const imageDir = path.join(root, 'public', 'images');
const imageMime: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};
if (fs.existsSync(imageDir)) {
  for (const entry of fs.readdirSync(imageDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    const mime = imageMime[ext];
    if (!mime) continue;
    const file = path.join(imageDir, entry.name);
    const body = fs.readFileSync(file);
    const url = `/images/${entry.name}`;
    if (!html.includes(url)) continue;
    html = html.split(url).join(`data:${mime};base64,${body.toString('base64')}`);
    images += body.length;
  }
}

/* 8. 남은 외부 참조 점검 */
const leftovers = Array.from(html.matchAll(/["'(](\/(?:_next|images)\/[^"')\\]+)/g)).map((m) => m[1]);
if (leftovers.length) {
  process.stdout.write(`\n  경고: 인라인되지 않은 참조 ${leftovers.length}건\n`);
  Array.from(new Set(leftovers))
    .slice(0, 8)
    .forEach((l) => process.stdout.write(`    ${l}\n`));
}

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(target, html, 'utf8');

/* 9. 브라우저 기계음 대신 최신 Juwonmom MP3를 쓰도록 오프라인 음성 묶음을 함께 복사한다. */
const voiceSource = path.join(root, 'public', 'voice');
const voiceTarget = path.join(distDir, 'voice');
if (!fs.existsSync(voiceSource)) fail('Juwonmom 음성 폴더를 찾지 못했다: public/voice');
fs.cpSync(voiceSource, voiceTarget, { recursive: true, force: true });

/*
 * 10. 내려받아 쓰는 오프라인 꾸러미 ZIP (설계서 v1.18 §5.2).
 * HTML 과 음성 폴더를 한 폴더에 담는다. 아이가 압축을 풀고 HTML 을 두 번 누르면 끝이다.
 * 읽어주세요.txt 는 메모장에서 바로 읽히게 BOM 과 CRLF 로 쓴다.
 */
const readme = [
  '우리집 대피지도 - 오프라인 꾸러미',
  '================================',
  '',
  `1. 이 폴더(${OFFLINE_BUNDLE_DIR})를 통째로 둔다. home-escape-map.html 과 voice 폴더가 같은 곳에 있어야 캐릭터 목소리가 난다.`,
  '2. home-escape-map.html 을 두 번 누르면 Chrome, Edge, Whale 에서 열린다. 인터넷이 없어도 된다.',
  '3. PC 화면(너비 1024px 이상)에서 쓴다. 소리는 화면 위의 소리 단추로 켜고 끈다.',
  '4. 그린 지도는 이 PC 의 브라우저 안에만 저장된다. 서버로 보내지 않는다.',
  '   다른 PC 로 옮기려면 화면 아래 [파일 저장]으로 .json 파일을 내려받고, 그 PC 에서 [불러오기]로 연다.',
  '5. A4 한 장으로 뽑으려면 [뽑기]를 누른다.',
  '',
  'USB 에 이 폴더를 복사해 다른 PC 에서 열어도 된다.',
  '이 폴더를 통째로 웹 서버에 올리고 home-escape-map.html 주소를 열어도 된다. 바깥에서 받아오는 것이 없다.',
  '',
  `판: ${pkg.version} · 만든 곳: 부평소방서 어린이 화재안전교육`,
  '',
].join('\r\n');
const bundleEntries: ZipEntry[] = [
  { name: `${OFFLINE_BUNDLE_DIR}/읽어주세요.txt`, data: Buffer.from(`﻿${readme}`, 'utf8') },
  { name: `${OFFLINE_BUNDLE_DIR}/home-escape-map.html`, data: Buffer.from(html, 'utf8') },
];
for (const name of fs.readdirSync(voiceSource).sort()) {
  if (!/\.(mp3|json)$/i.test(name)) continue;
  bundleEntries.push({ name: `${OFFLINE_BUNDLE_DIR}/voice/${name}`, data: fs.readFileSync(path.join(voiceSource, name)), store: /\.mp3$/i.test(name) });
}
const zipTarget = path.join(distDir, OFFLINE_ZIP_NAME);
const zip = zipBuffer(bundleEntries);
fs.writeFileSync(zipTarget, zip);

const size = Buffer.byteLength(html, 'utf8');
process.stdout.write('\n  오프라인 배포본 생성\n');
process.stdout.write(`    파일    ${path.relative(root, target)}\n`);
process.stdout.write(`    크기    ${bytes(size)}  (CSS ${bytes(css)} · JS ${bytes(js)} · 그림 ${bytes(images)})\n`);
process.stdout.write(`    외부 참조 ${leftovers.length}건\n`);
process.stdout.write('    음성    dist/voice/ Juwonmom MP3 전체\n');
process.stdout.write(`    꾸러미  ${path.relative(root, zipTarget)}  ${bytes(zip.length)} · ${bundleEntries.length}개 파일\n`);

/*
 * 상한은 4MB 다 (docs/DESIGN-v1.1-changes.md NFR-3). 여기서 바로 실패시킨다 — npm test 는 이 단계보다
 * 먼저 돌아 지난 배포본만 재기 때문이다. 넘었다면 그림이 몇 번 실렸는지부터 본다(og:image 처럼
 * 같은 그림을 여러 자리에 넣는 메타가 가장 흔한 원인이다).
 */
if (size > 4 * 1024 * 1024) {
  fail(`오프라인 배포본이 ${bytes(size)} 로 4MB 를 넘었다. 배경 이미지나 큰 자산이 여러 번 섞이지 않았는지 확인한다.`);
}
process.stdout.write('    4MB 미만 — 배포 기준 충족\n');
process.stdout.write('\n  USB 로 복사해 브라우저에서 더블클릭하면 열린다.\n\n');
