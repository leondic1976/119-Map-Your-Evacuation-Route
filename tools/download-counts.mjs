/**
 * 받은 횟수 (대장 #181) — GitHub 은 Release 에 올린 파일마다 받은 횟수를 센다. 그 숫자를 읽어 안내 페이지에 보인다.
 *
 * Release `desktop` 에는 가장 새 판의 파일만 둔다(대장 #180). 파일을 갈면 GitHub 의 숫자는 0 으로 돌아가므로,
 * 갈기 전에 그때까지의 숫자를 Release 글 안의 장부에 옮겨 적는다. 장부는 사람 눈에 보이지 않는 주석 한 줄이다.
 *
 *   <!-- hem-downloads {"base":{"setup":12,"portable":3,"zip":5},"folded":{"757105273":4}} -->
 *
 *   base    지금까지 옮겨 적은 횟수
 *   folded  옮겨 적을 때 그 파일의 숫자. 파일이 아직 남아 있어도 같은 횟수를 두 번 세지 않는다
 *
 *   합계 = base + Σ(지금 파일의 숫자 − folded 에 적힌 숫자)
 *
 * 프로그램이 스스로 새 판을 받는 것은 Pages 의 파일을 받으므로 여기에 들지 않는다. 사람이 받은 횟수만 센다.
 *
 *   node tools/download-counts.mjs notes <판>   Release 를 읽어 장부를 옮겨 적은 새 글을 내놓는다 (desktop.yml)
 *   node tools/download-counts.mjs show         지금 합계를 보인다
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const RELEASE_TAG = 'desktop';
export const OFFLINE_ZIP = 'home-escape-map-offline.zip';
const MARK = 'hem-downloads';
const KINDS = ['setup', 'portable', 'zip'];

const zero = () => ({ setup: 0, portable: 0, zip: 0 });
const whole = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 0);

/** 파일 이름 → 갈래. 세지 않는 파일은 null */
export function kindOfAsset(name) {
  if (/^HomeEscapeMap-Setup-\d+\.\d+\.\d+\.exe$/.test(name)) return 'setup';
  if (/^HomeEscapeMap-Portable-\d+\.\d+\.\d+\.exe$/.test(name)) return 'portable';
  if (name === OFFLINE_ZIP) return 'zip';
  return null;
}

/** Release 글에서 장부를 읽는다. 없거나 깨졌으면 빈 장부다 */
export function readLedger(body) {
  const ledger = { base: zero(), folded: {} };
  const m = new RegExp(`<!--\\s*${MARK}\\s+(\\{.*?\\})\\s*-->`, 's').exec(String(body ?? ''));
  if (!m) return ledger;
  try {
    const raw = JSON.parse(m[1]);
    for (const kind of KINDS) ledger.base[kind] = whole(raw?.base?.[kind]);
    for (const [id, count] of Object.entries(raw?.folded ?? {})) if (/^\d+$/.test(id)) ledger.folded[id] = whole(count);
  } catch {
    /* 깨진 장부는 버린다 — 지금 파일의 숫자부터 다시 센다 */
  }
  return ledger;
}

/** 합계 — 옮겨 적은 횟수에 지금 파일들의 아직 옮기지 않은 횟수를 더한다 */
export function totalCounts(ledger, assets) {
  const total = { ...ledger.base };
  for (const asset of assets ?? []) {
    const kind = kindOfAsset(asset.name);
    if (!kind) continue;
    total[kind] += Math.max(0, whole(asset.download_count) - whole(ledger.folded[String(asset.id)]));
  }
  return total;
}

/** 지금 있는 파일들의 숫자를 장부로 옮긴다. 파일을 갈거나 지우기 바로 앞에 부른다. 두 번 불러도 두 번 세지 않는다 */
export function foldAssets(ledger, assets) {
  const folded = {};
  for (const asset of assets ?? []) if (kindOfAsset(asset.name)) folded[String(asset.id)] = whole(asset.download_count);
  return { base: totalCounts(ledger, assets), folded };
}

/** 사람이 읽는 Release 글에 장부 한 줄을 붙인다 */
export function releaseNotes(version, ledger) {
  const { setup, portable, zip } = ledger.base;
  return [
    `설치판 HomeEscapeMap-Setup-${version}.exe 와 무설치판 HomeEscapeMap-Portable-${version}.exe, 오프라인 꾸러미 ${OFFLINE_ZIP} 이다. 언제나 가장 새 판의 파일만 둔다.`,
    '',
    '처음 실행할 때 SmartScreen 경고가 뜨면 「추가 정보 → 실행」을 누른다. 서명 비용을 내지 않은 무료 프로그램이라 뜨는 창이다.',
    '',
    '이 프로그램은 인터넷에 아무것도 보내지 않는다. 그린 지도는 이 PC 안에만 저장된다.',
    '',
    `앞선 파일까지 받은 횟수 — 설치판 ${setup} · 무설치판 ${portable} · 꾸러미 ${zip}. 파일을 새 판으로 갈아도 이어서 센다.`,
    '',
    `<!-- ${MARK} ${JSON.stringify(ledger)} -->`,
    '',
  ].join('\n');
}

/** deploy.yml 이 받아 둔 Release 응답(`gh api .../releases/tags/desktop`)으로 합계를 낸다. 읽지 못하면 null */
export function countsFromRelease(release) {
  if (!release || !Array.isArray(release.assets)) return null;
  return totalCounts(readLedger(release.body), release.assets);
}

function fetchRelease() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('GITHUB_REPOSITORY 가 없다');
  try {
    return JSON.parse(execFileSync('gh', ['api', `repos/${repo}/releases/tags/${RELEASE_TAG}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (e) {
    // 첫 배포에는 Release 가 없다
    if (/HTTP 404|Not Found/.test(String(e?.stderr ?? e))) return null;
    throw e;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, version] = process.argv.slice(2);
  const release = fetchRelease();
  const ledger = readLedger(release?.body);
  if (command === 'notes') {
    if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('판 번호를 준다: notes 2.16.0');
    process.stdout.write(releaseNotes(version, foldAssets(ledger, release?.assets)));
  } else if (command === 'show') {
    process.stdout.write(`${JSON.stringify(totalCounts(ledger, release?.assets))}\n`);
  } else {
    throw new Error('notes <판> 또는 show');
  }
}
