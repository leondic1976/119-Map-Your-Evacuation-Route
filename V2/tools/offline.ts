/**
 * 인터넷 없이 여는 판을 만든다 (설계서 §12).
 *
 * 브라우저는 file:// 에서 모듈 파일과 글꼴 파일을 따로 받지 못할 수 있다. 그래서 스크립트·스타일·글꼴을
 * HTML 한 장 안에 넣고, 그림과 음성만 옆 폴더에 둔다. 루트의 tools/standalone.ts 가 이 폴더로
 * 꾸러미 ZIP 과 윈도우 설치 파일을 만든다.
 *
 *   npm run build:offline  →  offline/home-escape-map.html · offline/art/ · offline/voice/
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const buildDir = path.join(root, '.offline-build');
const assetsDir = path.join(buildDir, 'assets');
const outDir = path.join(root, 'offline');
const MAX_BYTES = 4 * 1024 * 1024;

function fail(message: string): never {
  process.stderr.write(`\n  실패: ${message}\n\n`);
  process.exit(1);
}

const build = spawnSync('npx vite build --mode offline --logLevel warn', { stdio: 'inherit', shell: true });
if (build.status !== 0) fail('오프라인 묶음을 만들지 못했다.');

let html = fs.readFileSync(path.join(buildDir, 'index.html'), 'utf8');

const asset = (name: string): string => {
  const file = path.join(assetsDir, path.basename(name));
  if (!fs.existsSync(file)) fail(`자산을 찾지 못했다: ${name}`);
  return file;
};

/** 글꼴은 woff2 만 남겨 data URI 로 넣는다. 쓰는 브라우저는 모두 woff2 를 읽는다 */
function inlineFonts(css: string): string {
  return css
    .replace(/,\s*url\([^)]*\.woff\)\s*format\(["']?woff["']?\)/g, '')
    .replace(/url\(["']?([^)"']+\.woff2)["']?\)/g, (_all, name: string) => `url(data:font/woff2;base64,${fs.readFileSync(asset(name)).toString('base64')})`);
}

html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/assets\/([^"]+)"[^>]*>/g, (_all, name: string) => `<style>${inlineFonts(fs.readFileSync(asset(name), 'utf8'))}</style>`);

html = html.replace(/<script type="module"[^>]*src="\.\/assets\/([^"]+)"[^>]*><\/script>/g, (_all, name: string) => {
  const js = fs.readFileSync(asset(name), 'utf8').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
  return `<script type="module">${js}</script>`;
});

html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');

const icon = fs.readFileSync(path.join(root, 'public', 'art', 'icon.svg'));
html = html.replace(/href="\.\/art\/icon\.svg"/, `href="data:image/svg+xml;base64,${icon.toString('base64')}"`);

const leftover = /(?:src|href)="\.\/assets\/|<link[^>]*rel="modulepreload"|\.woff["')]/.exec(html);
if (leftover) fail(`HTML 밖을 가리키는 것이 남았다: ${leftover[0]}`);

const bytes = Buffer.byteLength(html, 'utf8');
if (bytes > MAX_BYTES) fail(`오프라인 HTML 이 ${(bytes / 1024 / 1024).toFixed(2)}MB 로 4MB 를 넘었다.`);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'home-escape-map.html'), html, 'utf8');
fs.cpSync(path.join(root, 'public', 'art'), path.join(outDir, 'art'), { recursive: true });
fs.cpSync(path.join(root, 'public', 'voice'), path.join(outDir, 'voice'), { recursive: true });
fs.rmSync(buildDir, { recursive: true, force: true });

const voices = fs.readdirSync(path.join(outDir, 'voice')).filter((f) => f.endsWith('.mp3')).length;
process.stdout.write(`\n  오프라인 판  offline/home-escape-map.html ${(bytes / 1024 / 1024).toFixed(2)}MB · 음성 ${voices}개\n\n`);
