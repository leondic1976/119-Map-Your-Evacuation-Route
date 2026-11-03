/**
 * 윈도우 설치 파일 빌드 (설계서 v1.18 §5.3).
 *
 * electron-builder 로 NSIS 설치판과 무설치판을 만들고, 이름과 크기를 확인한다.
 * dist/home-escape-map.html 과 dist/voice/ 가 있어야 한다 (npm run build:standalone).
 *
 *   npm run desktop:build            → release/HomeEscapeMap-Setup-<판>.exe · HomeEscapeMap-Portable-<판>.exe
 *   npm run desktop:build -- --dir   → release/win-unpacked/ 만 (빠른 확인용)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { desktopAssetNames } from '../src/content/release';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string };
const dirOnly = process.argv.includes('--dir');

function fail(msg: string): never {
  process.stderr.write(`\n  실패: ${msg}\n\n`);
  process.exit(1);
}

function bytes(n: number): string {
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

if (!fs.existsSync(path.join(root, 'dist', 'home-escape-map.html'))) fail('dist/home-escape-map.html 이 없다. 먼저 npm run build:standalone 을 돌린다.');
if (!fs.existsSync(path.join(root, 'dist', 'voice', 'manifest.json'))) fail('dist/voice/ 가 없다.');
if (!fs.existsSync(path.join(root, 'dist', 'art'))) fail('dist/art/ 가 없다.');
const expectedVoices = (JSON.parse(fs.readFileSync(path.join(root, 'V2', 'public', 'voice', 'manifest.json'), 'utf8')) as { items: unknown[] }).items.length;
if (!fs.existsSync(path.join(root, 'desktop', 'icon.png'))) fail('desktop/icon.png 이 없다. npm run icons 로 만든다.');

const args = dirOnly ? 'npx electron-builder --win --dir --publish never' : 'npx electron-builder --win nsis portable --publish never';
process.stdout.write(`\n  ${args}\n\n`);
const result = spawnSync(args, { stdio: 'inherit', shell: true, env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } });
if (result.status !== 0) fail('electron-builder 가 실패했다.');

const unpacked = path.join(root, 'release', 'win-unpacked');
const resources = path.join(unpacked, 'resources', 'app');
if (!fs.existsSync(path.join(resources, 'home-escape-map.html'))) fail('패키지에 오프라인 HTML 이 실리지 않았다.');
const voiceCount = fs.readdirSync(path.join(resources, 'voice')).filter((name) => name.endsWith('.mp3')).length;
if (voiceCount !== expectedVoices) fail(`패키지의 음성이 ${voiceCount}/${expectedVoices} 개다.`);
if (!fs.existsSync(path.join(resources, 'art', 'ilgu_happy.webp'))) fail('패키지에 그림이 실리지 않았다.');
const asar = path.join(unpacked, 'resources', 'app.asar');
const asarBytes = fs.existsSync(asar) ? fs.statSync(asar).size : 0;
/* 런타임 의존성(next·three…)이 딸려 들어가면 수십 MB 가 된다. 껍데기 하나면 1MB 안쪽이다 */
if (asarBytes > 2 * 1024 * 1024) fail(`app.asar 가 ${bytes(asarBytes)} 다 — node_modules 가 섞였다.`);

process.stdout.write('\n  데스크톱 빌드\n');
process.stdout.write(`    껍데기  app.asar ${bytes(asarBytes)} · 음성 ${voiceCount}개 · HTML 포함\n`);
if (!dirOnly) {
  const names = desktopAssetNames(pkg.version);
  for (const name of [names.setup, names.portable]) {
    const file = path.join(root, 'release', name);
    if (!fs.existsSync(file)) fail(`산출물이 없다: release/${name}`);
    process.stdout.write(`    산출물  release/${name}  ${bytes(fs.statSync(file).size)}\n`);
  }
}
process.stdout.write('\n');
