/** 배포 전 점검 — 소스와 산출물만 보고 판정한다 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { LINES, LINE_IDS, type Line } from '../src/content/lines';
import { BANDS } from '../src/content/bands';
import { crayonsFor, MARK_NAME } from '../src/content/names';
import { FIX, PRAISE, PROMISES } from '../src/content/report';
import { SOURCES } from '../src/content/sources';
import type { Check } from './test';

const root = process.cwd();

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const read = (p: string): string => fs.readFileSync(p, 'utf8');
const srcFiles = walk(path.join(root, 'src')).filter((f) => /\.(ts|tsx|css)$/.test(f));
const rel = (f: string): string => path.relative(root, f).replace(/\\/g, '/');
const under = (dir: string): string[] => srcFiles.filter((f) => rel(f).startsWith(`src/${dir}/`));
/** 주석을 뺀 코드 */
const code = (f: string): string => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

export function runQaTests(check: Check): void {
  check('[층] core 는 화면·저장·위 층을 부르지 않는다', () => {
    for (const f of under('core')) {
      const c = code(f);
      assert.ok(!/from '(react|three)/.test(c), `${rel(f)}: react·three`);
      // 'window' 는 창문 종류의 이름이기도 해서 속성을 부르는 꼴만 잡는다
      assert.ok(!/\b(document|window)\.|\blocalStorage\b/.test(c), `${rel(f)}: 브라우저 API`);
      assert.ok(!/from '\.\.\/(store|ui|platform|content)/.test(c), `${rel(f)}: 위 층`);
    }
  });

  check('[층] content 는 store·ui·platform 을 부르지 않는다', () => {
    for (const f of under('content')) {
      assert.ok(!/from '\.\.\/(store|ui|platform)/.test(code(f)), rel(f));
    }
  });

  check('[층] store 는 ui 를 부르지 않는다', () => {
    for (const f of under('store')) assert.ok(!/from '\.\.\/ui/.test(code(f)), rel(f));
  });

  check('[경계] 바깥 세계에는 platform 만 닿는다', () => {
    for (const f of srcFiles) {
      if (rel(f).startsWith('src/platform/')) continue;
      const c = code(f);
      for (const api of ['localStorage', 'window.print', 'new Audio', 'AudioContext', 'sessionStorage']) {
        assert.ok(!c.includes(api), `${rel(f)}: ${api}`);
      }
    }
  });

  check('[경계] three 는 ui/replay3d 안에서만 부른다', () => {
    for (const f of srcFiles) {
      if (rel(f).startsWith('src/ui/replay3d/')) continue;
      assert.ok(!/from 'three/.test(code(f)), rel(f));
    }
  });

  check('[경계] 3D 는 필요할 때만 받는다', () => {
    const review = read(path.join(root, 'src/ui/ReviewStep.tsx'));
    assert.ok(/lazy\(\(\) => import\('\.\/replay3d\/Replay3D'\)\)/.test(review));
  });

  check('[엔진] 위험장 엔진에 재난 이름이 없다', () => {
    const c = read(path.join(root, 'src/core/hazard.ts'));
    assert.ok(!/fire|smoke|화재|연기|불/i.test(c));
  });

  check('[음성] 브라우저 음성합성을 쓰지 않는다', () => {
    for (const f of srcFiles) {
      assert.ok(!/SpeechSynthesis|speechSynthesis/.test(code(f)), rel(f));
    }
  });

  check('[음성] 정본과 매니페스트가 맞는다', () => {
    const m = JSON.parse(read(path.join(root, 'public/voice/manifest.json'))) as { items: { id: string; text: string; hash: string }[] };
    assert.deepEqual(m.items.map((i) => i.id).sort(), [...LINE_IDS].sort());
    for (const item of m.items) {
      const line: Line = LINES[item.id as keyof typeof LINES];
      const spoken = line.say ?? line.text;
      assert.equal(item.text, spoken, item.id);
      assert.equal(item.hash, createHash('sha256').update(spoken).digest('hex').slice(0, 16), item.id);
    }
  });

  check('[음성] 모든 대사의 MP3 가 있고 음원 머리글이 맞으며 남는 파일이 없다', () => {
    const dir = path.join(root, 'public/voice');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mp3'));
    const missing = LINE_IDS.filter((id) => !files.includes(`${id}.mp3`));
    assert.deepEqual(missing, [], `없는 MP3: ${missing.join(', ')}`);
    const extra = files.filter((f) => !LINE_IDS.includes(f.replace('.mp3', '') as never));
    assert.deepEqual(extra, [], `남는 MP3: ${extra.join(', ')}`);
    for (const f of files) {
      const buf = fs.readFileSync(path.join(dir, f));
      assert.ok(buf.length > 2000, `${f}: 너무 작다`);
      const id3 = buf.toString('latin1', 0, 3) === 'ID3';
      const sync = buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0;
      assert.ok(id3 || sync, `${f}: MP3 머리글이 아니다`);
    }
    // 내려받기가 어긋나면 앞 대사가 다음 이름으로 저장된다. 같은 내용의 파일이 있으면 안 된다
    const seen = new Map<string, string>();
    for (const f of files) {
      const h = createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex');
      assert.ok(!seen.has(h), `${f} 와 ${seen.get(h)} 의 내용이 같다`);
      seen.set(h, f);
    }
  });

  check('[음성] 모든 대사가 실제로 쓰인다', () => {
    const uses = srcFiles.filter((f) => rel(f) !== 'src/content/lines.ts').map(read).join('\n');
    for (const id of LINE_IDS) assert.ok(uses.includes(`'${id}'`), `쓰이지 않는 대사: ${id}`);
  });

  check('[낱말] 화면과 음성에 어려운 낱말이 없다', () => {
    const banned = ['구획', '통로', '개구부', '격자', '집결', '피난', '경로', '점수', '등급', '순위'];
    const texts = [
      ...LINE_IDS.map((id) => LINES[id].text),
      ...Object.values(PRAISE).map((p) => p.text),
      ...Object.values(FIX).map((p) => p.text),
      ...PROMISES.map((p) => p.text),
      ...Object.values(MARK_NAME),
      ...(['low', 'mid', 'high'] as const).flatMap((b) => {
        const g = crayonsFor(b);
        return [...g.room, ...g.pass].map((c) => c.label);
      }),
    ];
    const uiText = under('ui')
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => code(f).match(/[가-힣][가-힣\s·,.!?]*/g)?.join(' ') ?? '');
    for (const word of banned) {
      for (const t of [...texts, ...uiText]) assert.ok(!t.includes(word), `「${word}」: ${t.slice(0, 40)}`);
    }
  });

  check('[낱말] 아이에게 하는 말에 존댓말이 없다', () => {
    for (const id of LINE_IDS) assert.ok(!/(습니다|세요|십시오)/.test(LINES[id].text), id);
  });

  check('[문장] 모든 문장의 출처가 대장에 있다', () => {
    const ids = new Set(SOURCES.map((s) => s.id));
    const all = [...LINE_IDS.map((id) => LINES[id]), ...Object.values(PRAISE), ...Object.values(FIX), ...PROMISES];
    for (const t of all) {
      assert.ok(t.sourceIds.length > 0, t.text);
      for (const s of t.sourceIds) assert.ok(ids.has(s), `${t.text}: ${s}`);
    }
  });

  check('[금지] 이모지가 없다', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const f of srcFiles) assert.ok(!emoji.test(read(f)), rel(f));
  });

  check('[금지] 입력은 이름 칸 하나뿐이다 — 대화 입력을 만들지 않는다', () => {
    const inputs = under('ui').flatMap((f) => read(f).match(/<(input|textarea)\b/g) ?? []);
    assert.equal(inputs.length, 1);
    assert.ok(!under('ui').some((f) => read(f).includes('<textarea')));
  });

  check('[금지] 생성형 AI·외부 전송을 부르지 않는다', () => {
    for (const f of srcFiles) {
      const c = code(f);
      assert.ok(!/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(c), rel(f));
    }
  });

  check('[금지] 바깥 자산을 받아 오지 않는다', () => {
    const urls = /https?:\/\/(?!www\.w3\.org)/;
    for (const f of srcFiles) {
      if (rel(f) === 'src/content/sources.ts') continue;
      assert.ok(!urls.test(code(f)), rel(f));
    }
    const html = read(path.join(root, 'index.html'));
    assert.ok(!/(src|href)="https?:/.test(html));
  });

  check('[금지] 붉은 점멸이 없다', () => {
    const css = read(path.join(root, 'src/ui/app.css'));
    assert.ok(!/@keyframes[^{]*(blink|flash)/.test(css));
  });

  check('[크기] 누르는 크기는 48 이상이고 한 곳에서 정한다', () => {
    const css = read(path.join(root, 'src/ui/app.css'));
    assert.ok(/--hit:\s*48px/.test(css));
    assert.equal((css.match(/--hit:/g) ?? []).length, 1);
  });

  check('[크기] 줄바꿈은 낱말 단위다', () => {
    assert.ok(read(path.join(root, 'src/ui/app.css')).includes('word-break: keep-all'));
  });

  check('[단계] 띠에 일곱 단계가 있고 각 단계에 화면이 있다', () => {
    const app = read(path.join(root, 'src/store/app.ts'));
    const studio = read(path.join(root, 'src/ui/Studio.tsx'));
    for (const s of ['draw', 'sort', 'door', 'mark', 'route', 'drill', 'review']) {
      assert.ok(app.includes(`'${s}'`), s);
      assert.ok(new RegExp(`${s}: \\w+Step`).test(studio), s);
    }
    assert.equal(Object.keys(BANDS).length, 3);
  });

  check('[배포] 기본 주소를 열면 V2 로 간다', () => {
    const page = read(path.join(root, 'root-redirect.html'));
    assert.ok(page.includes("location.replace('./V2/'") && page.includes('url=./V2/'), '넘기는 페이지가 V2 를 가리키지 않는다');
    const deploy = read(path.join(root, '..', '.github', 'workflows', 'deploy.yml'));
    assert.ok(deploy.includes('cp -r V2/dist out/V2') && deploy.includes('cp V2/root-redirect.html out/index.html'), '배포가 V2 를 첫 페이지로 잇지 않는다');
  });

  check('[산출물] 빌드가 상대 경로이고 3D 가 첫 묶음과 나뉜다', () => {
    const dist = path.join(root, 'dist');
    assert.ok(fs.existsSync(dist), '빌드를 먼저 돌린다');
    const html = read(path.join(dist, 'index.html'));
    assert.ok(!/(src|href)="\/[^/]/.test(html), '뿌리 절대 경로가 남았다');
    assert.ok(fs.existsSync(path.join(dist, 'voice', 'manifest.json')));
    const assets = walk(path.join(dist, 'assets'));
    const main = assets.find((f) => /index-.*\.js$/.test(f))!;
    assert.ok(fs.statSync(main).size < 400 * 1024, `첫 묶음이 ${fs.statSync(main).size} 바이트다`);
    assert.ok(!read(main).includes('WebGLRenderer'), '첫 묶음에 three 가 들어갔다');
  });
}
