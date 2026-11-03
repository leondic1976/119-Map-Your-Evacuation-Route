/** 빌드 마감 — 묶음 이름이 빌드마다 달라서 dist/sw.js 를 빌드 뒤에 만든다 (설계서 §12) */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

const all = walk(dist)
  .map((f) => path.relative(dist, f).split(path.sep).join('/'))
  .filter((f) => f !== 'sw.js');
// woff 는 woff2 를 못 읽는 옛 브라우저용이다. 쓰는 브라우저는 모두 woff2 를 읽는다
const shell = all.filter((f) => !f.endsWith('.mp3') && !f.endsWith('.woff') && f !== 'index.html');
const precache = ['./', ...shell.map((f) => `./${f}`)].sort();
const voice = all.filter((f) => f.endsWith('.mp3')).map((f) => `./${f}`).sort();

const hash = createHash('sha256');
for (const f of all) {
  hash.update(f);
  hash.update(fs.readFileSync(path.join(dist, f)));
}
const cacheName = `hem2-${hash.digest('hex').slice(0, 12)}`;

const sw = fs
  .readFileSync(path.join(root, 'tools', 'sw.template.js'), 'utf8')
  .replace('__CACHE_NAME__', cacheName)
  .replace('__PRECACHE__', JSON.stringify(precache))
  .replace('__VOICE__', JSON.stringify(voice));
fs.writeFileSync(path.join(dist, 'sw.js'), sw, 'utf8');
process.stdout.write(`\n  서비스 워커  저장 ${precache.length}개 · 음성 ${voice.length}개 · ${cacheName}\n\n`);
