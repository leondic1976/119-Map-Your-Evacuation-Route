/**
 * 오프라인 배포본 빌더 (대장 #110 · V2/docs/DESIGN.md §12).
 *
 * V2 를 오프라인 판으로 묶어(`V2/tools/offline.ts`) dist/ 에 옮기고 꾸러미 ZIP 을 만든다.
 * 윈도우 설치 파일도 이 dist/ 를 싣는다. 인터넷이 없는 교실에서 더블클릭으로 열린다.
 *
 *   npm run build:standalone  →  dist/home-escape-map.html · dist/art/ · dist/voice/ · dist/home-escape-map-offline.zip
 *
 * V2/node_modules 가 있어야 한다(`cd V2 && npm ci`).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { OFFLINE_BUNDLE_DIR, OFFLINE_ZIP_NAME } from '../src/content/release';
import { zipBuffer, type ZipEntry } from './zip';

const root = path.resolve(process.cwd());
const v2Dir = path.join(root, 'V2');
const v2Offline = path.join(v2Dir, 'offline');
const distDir = path.join(root, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string };

function fail(msg: string): never {
  process.stderr.write(`\n  실패: ${msg}\n\n`);
  process.exit(1);
}

function bytes(n: number): string {
  return n < 1024 * 1024 ? `${(n / 1024).toFixed(0)}KB` : `${(n / 1024 / 1024).toFixed(2)}MB`;
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
}

if (!fs.existsSync(path.join(v2Dir, 'node_modules'))) fail('V2/node_modules 가 없다. 먼저 cd V2 && npm ci 를 돌린다.');
const build = spawnSync('npm run build:offline', { stdio: 'inherit', shell: true, cwd: v2Dir });
if (build.status !== 0) fail('V2 오프라인 판을 만들지 못했다.');

/* 지난 산출물을 치운다. 이전 판의 음성이 섞이면 안 된다. dist/desktop/ 은 배포가 쓰므로 둔다 */
fs.mkdirSync(distDir, { recursive: true });
for (const name of ['home-escape-map.html', 'art', 'voice', OFFLINE_ZIP_NAME]) fs.rmSync(path.join(distDir, name), { recursive: true, force: true });
fs.cpSync(v2Offline, distDir, { recursive: true });

/*
 * 내려받아 쓰는 오프라인 꾸러미 ZIP (설계서 v1.18 §5.2).
 * 읽어주세요.txt 는 메모장에서 바로 읽히게 BOM 과 CRLF 로 쓴다.
 */
const readme = [
  '우리집 대피지도 - 오프라인 꾸러미',
  '================================',
  '',
  `1. 이 폴더(${OFFLINE_BUNDLE_DIR})를 통째로 둔다. home-escape-map.html 옆에 art 폴더와 voice 폴더가 있어야 그림과 목소리가 나온다.`,
  '2. home-escape-map.html 을 두 번 누르면 Chrome, Edge, Whale 에서 열린다. 인터넷이 없어도 된다.',
  '3. PC나 태블릿 화면에서 쓴다. 소리는 설정에서 끄고 켠다.',
  '4. 그린 지도는 이 기기의 브라우저 안에만 저장된다. 서버로 보내지 않는다. 다른 기기로 옮기는 기능은 없다.',
  '5. 마지막 단계의 [지도 인쇄하기]로 A4 한 장을 뽑는다.',
  '',
  'USB 에 이 폴더를 복사해 다른 PC 에서 열어도 된다.',
  '이 폴더를 통째로 웹 서버에 올리고 home-escape-map.html 주소를 열어도 된다. 바깥에서 받아오는 것이 없다.',
  '',
  `판: ${pkg.version} · 만든 곳: 인천소방본부 어린이 화재안전교육`,
  '',
].join('\r\n');

const entries: ZipEntry[] = [{ name: `${OFFLINE_BUNDLE_DIR}/읽어주세요.txt`, data: Buffer.from(`﻿${readme}`, 'utf8') }];
for (const file of walk(v2Offline).sort()) {
  const rel = path.relative(v2Offline, file).split(path.sep).join('/');
  entries.push({ name: `${OFFLINE_BUNDLE_DIR}/${rel}`, data: fs.readFileSync(file), store: /\.(mp3|webp|png)$/i.test(rel) });
}
const zipTarget = path.join(distDir, OFFLINE_ZIP_NAME);
const zip = zipBuffer(entries);
fs.writeFileSync(zipTarget, zip);

const html = fs.statSync(path.join(distDir, 'home-escape-map.html')).size;
process.stdout.write('\n  오프라인 배포본 생성 (V2)\n');
process.stdout.write(`    HTML    dist/home-escape-map.html  ${bytes(html)}\n`);
process.stdout.write(`    꾸러미  ${path.relative(root, zipTarget)}  ${bytes(zip.length)} · ${entries.length}개 파일\n\n`);
