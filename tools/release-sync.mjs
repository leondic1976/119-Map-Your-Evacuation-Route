/**
 * 판 맞춤 확인 (대장 #184) — 코드를 올리면 서버 접속용 화면(PC · 태블릿이 같은 화면이다)과 윈도우 프로그램이
 * 같은 판으로 함께 올라가야 한다. 올리기 전(out/ 폴더)과 올린 뒤(공개 주소)에 같은 것을 본다.
 *
 *   - 웹 화면(V2/)에 적힌 판이 package.json 과 같다
 *   - 프로그램이 새 판을 알아채는 download/latest.json 이 같은 판이고, 설치판과 무설치판을 가리킨다
 *   - 판 기록(download/releases.json)의 지금 판이 같다
 *   - CHANGELOG.md 맨 위가 같은 판이다
 *   - 폴더를 볼 때는 설치 파일이 실제로 있고 크기와 sha256 이 latest.json 과 같다
 *
 *   node tools/release-sync.mjs out
 *   node tools/release-sync.mjs https://leondic1976.github.io/119-Map-Your-Evacuation-Route/
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) {
  process.stderr.write('\n  실패: 볼 곳을 준다 — out 폴더나 공개 주소\n\n');
  process.exit(1);
}
const remote = /^https?:\/\//.test(target);
const root = process.cwd();
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readText(rel) {
  if (!remote) {
    const file = path.join(root, target, rel.endsWith('/') ? `${rel}index.html` : rel);
    if (!fs.existsSync(file)) throw new Error(`${rel} 이 없다`);
    return fs.readFileSync(file, 'utf8');
  }
  // 방금 올린 것이 퍼지는 동안의 옛 응답을 피한다
  const url = new URL(rel, target.endsWith('/') ? target : `${target}/`);
  url.searchParams.set('t', String(Date.now()));
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${rel} HTTP ${res.status}`);
  return res.text();
}

async function check() {
  const problems = [];
  const expect = (ok, message) => {
    if (!ok) problems.push(message);
  };
  const safe = async (rel, parse) => {
    try {
      return parse(await readText(rel));
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e));
      return null;
    }
  };

  const top = /^## (\d+\.\d+\.\d+)\s*$/m.exec(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'))?.[1];
  expect(top === version, `CHANGELOG.md 맨 위는 ${top} 인데 package.json 은 ${version} 이다`);

  const web = await safe('V2/', (html) => /<meta name="app-version" content="([^"]+)"/.exec(html)?.[1] ?? '(없음)');
  if (web !== null) expect(web === version, `웹 화면(V2)의 판은 ${web} 인데 ${version} 이어야 한다`);

  const latest = await safe('download/latest.json', JSON.parse);
  if (latest) {
    expect(latest.version === version, `download/latest.json 의 판은 ${latest.version} 인데 ${version} 이어야 한다 — 깔린 프로그램이 새 판을 알아채지 못한다`);
    for (const kind of ['setup', 'portable']) {
      const asset = latest[kind];
      expect(Boolean(asset?.name?.includes(`-${version}.exe`)) && /^[0-9a-f]{64}$/.test(asset?.sha256 ?? '') && asset?.size > 1024 * 1024, `latest.json 의 ${kind} 가 ${version} 판의 파일이 아니다`);
      if (!remote && asset?.name) {
        const file = path.join(root, target, 'download', asset.name);
        if (!fs.existsSync(file)) problems.push(`download/${asset.name} 이 없다`);
        else {
          expect(fs.statSync(file).size === asset.size, `download/${asset.name} 의 크기가 latest.json 과 다르다`);
          expect(createHash('sha256').update(fs.readFileSync(file)).digest('hex') === asset.sha256, `download/${asset.name} 의 sha256 이 latest.json 과 다르다`);
        }
      }
    }
  }

  const releases = await safe('download/releases.json', JSON.parse);
  if (releases) expect(releases.current === version, `판 기록의 지금 판은 ${releases.current} 인데 ${version} 이어야 한다`);

  const guide = await safe('download/', (html) => html);
  if (guide) expect(guide.includes(`HomeEscapeMap-Setup-${version}.exe`), `설치 안내가 ${version} 판의 설치 파일을 가리키지 않는다`);

  return problems;
}

// 공개 주소는 올린 것이 퍼질 때까지 몇 번 다시 본다
const tries = remote ? 16 : 1;
let problems = [];
for (let i = 1; i <= tries; i += 1) {
  problems = await check();
  if (problems.length === 0) break;
  if (i < tries) {
    process.stdout.write(`    ${i}번째: 아직 맞지 않는다 (${problems[0]}) — 15초 뒤 다시 본다\n`);
    await sleep(15000);
  }
}
if (problems.length) {
  process.stderr.write(`\n  실패: 판이 서로 맞지 않는다 (${target})\n${problems.map((p) => `    - ${p}`).join('\n')}\n\n`);
  process.exit(1);
}
process.stdout.write(`\n  판 맞춤 확인 — ${target}\n    웹 화면 · 프로그램 안내 · 판 기록 · 바뀐 것이 모두 ${version} 이다\n\n`);
