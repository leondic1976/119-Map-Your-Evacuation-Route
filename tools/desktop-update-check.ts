/**
 * 자동 업데이트 실행 검증 (대장 #131). windows 러너에서 `npm run desktop:build` 뒤에 돈다.
 *
 * 내 PC 의 설치본을 건드리지 않도록 손수 돌릴 때는 설치 단계를 건너뛴다(CI 에서만 설치한다).
 * 빌드본을 켜서 가짜 사이트의 latest.json 을 읽게 하고 다음을 본다.
 *   - 받은 파일이 사이트의 것과 다르면 설치하지 않는다
 *   - 무설치판은 창을 닫으면 새 파일로 스스로 바뀐다
 *   - 설치판은 묻지 않고 받아 두었다가 창을 닫으면 조용히 설치한다
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';
import { desktopAssetNames } from '../src/content/release';

const root = process.cwd();
const exe = path.join(root, 'release', 'win-unpacked', 'HomeEscapeMap.exe');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hem-update-check-'));

const sha = (data: Buffer): string => createHash('sha256').update(data).digest('hex');
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

async function until(what: string, ms: number, ok: () => boolean): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (ok()) return;
    await sleep(500);
  }
  throw new Error(`기다려도 되지 않았다: ${what}`);
}

const portableBytes = Buffer.from('새 무설치판');
const setupFile = path.join(root, 'release', desktopAssetNames(pkg.version).setup);
const setupBytes = fs.readFileSync(setupFile);
let latest: unknown = null;

const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname).slice(1);
  if (name === 'latest.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(latest));
  } else if (name === 'setup.exe') {
    res.writeHead(200).end(setupBytes);
  } else if (name === 'portable.exe') {
    res.writeHead(200).end(portableBytes);
  } else {
    res.writeHead(404).end();
  }
});

async function run(name: string, env: Record<string, string>, wait: string): Promise<string> {
  const log = path.join(tmp, `${name}.log`);
  const app = await electron.launch({
    executablePath: exe,
    cwd: root,
    env: { ...process.env, HEM_UPDATE_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}/`, HEM_UPDATE_LOG: log, ...env } as Record<string, string>,
  });
  const read = (): string => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '');
  try {
    await app.firstWindow();
    await until(`${name}: ${wait}`, 120_000, () => read().includes(wait));
  } finally {
    await app.close();
  }
  return read();
}

async function main(): Promise<void> {
  assert(fs.existsSync(exe), `${exe} 가 없다`);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const portable = { name: 'portable.exe', size: portableBytes.length, sha256: sha(portableBytes) };
  const setup = { name: 'setup.exe', size: setupBytes.length, sha256: sha(setupBytes) };

  // 받은 파일이 다르면 설치하지 않는다
  latest = { version: '99.0.0', setup: { ...setup, sha256: 'bad' }, portable };
  const bad = await run('bad-hash', {}, 'mismatch');
  assert(!bad.includes('ready') && !bad.includes('install'), `다른 파일을 설치하려 했다: ${bad}`);
  process.stdout.write('    OK  받은 파일이 사이트의 것과 다르면 설치하지 않는다\n');

  // 지금 판과 같으면 아무것도 하지 않는다
  latest = { version: pkg.version, setup, portable };
  const same = await run('same', {}, 'current');
  assert(!same.includes('ready'), `같은 판을 받았다: ${same}`);
  process.stdout.write('    OK  지금 판이 가장 새것이면 받지 않는다\n');

  // 무설치판 — 창을 닫으면 파일이 바뀐다
  latest = { version: '99.0.0', setup, portable };
  const old = path.join(tmp, '우리집 대피지도 무설치판.exe');
  fs.writeFileSync(old, 'old');
  await run('portable', { PORTABLE_EXECUTABLE_FILE: old }, 'ready');
  await until('무설치판 파일이 바뀐다', 60_000, () => fs.readFileSync(old).equals(portableBytes));
  process.stdout.write('    OK  무설치판은 창을 닫으면 새 파일로 바뀐다\n');

  // 설치판 — 실제로 설치되므로 CI 에서만 한다
  if (!process.env.CI) {
    process.stdout.write('    --  설치판 설치는 CI 에서만 본다 (이 PC 의 설치본을 건드리지 않는다)\n');
  } else {
    const programs = path.join(process.env.LOCALAPPDATA ?? '', 'Programs');
    const installed = (): string | null => {
      if (!fs.existsSync(programs)) return null;
      for (const dir of fs.readdirSync(programs)) {
        const file = path.join(programs, dir, 'HomeEscapeMap.exe');
        if (fs.existsSync(path.join(programs, dir, 'resources', 'app', 'home-escape-map.html')) && fs.existsSync(file)) return file;
      }
      return null;
    };
    assert(installed() === null, '이미 설치돼 있다');
    await run('setup', {}, 'ready');
    await until('설치판이 조용히 설치된다', 240_000, () => installed() !== null);
    process.stdout.write(`    OK  설치판은 묻지 않고 받아 창을 닫으면 조용히 설치된다 — ${installed()}\n`);
  }
  process.stdout.write('\n  자동 업데이트 검증 통과\n\n');
}

main()
  .catch((e) => {
    process.stderr.write(`\n  실패: ${e instanceof Error ? e.message : String(e)}\n\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
