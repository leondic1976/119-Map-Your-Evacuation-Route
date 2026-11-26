/**
 * 판 기록 — 안내 페이지(next.config.mjs)와 내보내기 마감(pack.ts)이 같은 목록을 쓴다 (대장 #130).
 *
 * 무엇이 바뀌었는지는 CHANGELOG.md 에서, 받을 수 있는 파일은 dist/desktop/ 에서 읽는다.
 * dist/desktop/ 은 deploy.yml 이 Release `desktop` 에서 지금 판을 받아 둔 곳이다. Release 에는 가장 새 판의 파일만 있다(대장 #180).
 * 지난 판은 무엇이 바뀌었는지만 보인다.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** 안내 페이지에 보이는 판 수 */
const SHOWN = 12;

export function readReleases(root, currentVersion) {
  const file = path.join(root, 'CHANGELOG.md');
  if (!existsSync(file)) return [];
  const list = [];
  let entry = null;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const head = /^## (\d+\.\d+\.\d+)\s*$/.exec(line);
    if (head) {
      entry = { version: head[1], notes: [] };
      list.push(entry);
    } else if (entry && line.startsWith('- ')) {
      entry.notes.push(line.slice(2));
    }
  }
  const dir = path.join(root, 'dist', 'desktop');
  let assets = {};
  try {
    assets = Object.fromEntries(JSON.parse(readFileSync(path.join(dir, 'release.json'), 'utf8')).assets.map((a) => [a.name, a.created_at]));
  } catch {
    /* 로컬 빌드에는 없다 — 날짜 없이 보인다 */
  }
  return list.slice(0, SHOWN).map((item) => {
    const name = `HomeEscapeMap-Setup-${item.version}.exe`;
    const setup = path.join(dir, name);
    return {
      version: item.version,
      notes: item.notes,
      current: item.version === currentVersion,
      date: assets[name] ? String(assets[name]).slice(0, 10) : null,
      // 지난 판의 파일은 두지 않는다. 지난 빌드가 남긴 파일이 폴더에 있어도 싣지 않는다
      setup: item.version === currentVersion && existsSync(setup) ? { name, size: statSync(setup).size } : null,
    };
  });
}
