/**
 * 배포 전 점검(M10) — tools/test.ts 가 부른다.
 *
 * 화면을 띄우지 않고 소스와 산출물만 보고 판정할 수 있는 것들이다.
 *   NFR-1·NFR-7  인터넷에 아무것도 보내지 않는다 — 외부 주소 호출이 없다
 *   NFR-3        오프라인 배포본이 4MB 를 넘지 않는다
 *   NFR-10       누르는 것의 최소 크기가 한 곳(--k-hit)에서 정해진다
 *   NFR-13       위험장 한 판 계산이 한 프레임(16ms) 안에 끝난다
 *   CON-1        런타임에 생성형 AI 를 부르지 않는다
 *   작업지침 §5   화면·도면·문서 어디에도 이모지를 넣지 않는다
 *   작업지침 §9-2 챗봇·자유 텍스트 입력을 만들지 않는다
 *
 * 죽은 CSS(쓰지 않는 규칙)도 여기서 잡는다. 챗봇을 걷어내면서 남은 잔재가
 * 실제로 있었다 — 규칙이 남아 있으면 다음 사람이 그 화면이 아직 있는 줄 안다.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { FloorPlan } from '../src/kids/types/plan';
import { HAZARD_PRESETS, TEMPLATES, fuelOf } from '../src/kids/content';
import { buildGraph } from '../src/kids/core/graph/build';
import { buildContext } from '../src/kids/core/hazard/transfer';
import { simulateAhead } from '../src/kids/core/hazard/ignition';

type Check = (name: string, fn: () => void) => void;
type Assert = (cond: boolean, msg: string) => void;

const root = process.cwd();

/** 소스 파일을 전부 모은다 (node_modules·산출물 제외) */
function sourceFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (['node_modules', '.next', 'out', 'dist', '.git'].includes(e.name)) continue;
        walk(p);
      } else if (exts.includes(path.extname(e.name))) out.push(p);
    }
  };
  walk(dir);
  return out;
}

function read(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

const rel = (p: string): string => path.relative(root, p).split(path.sep).join('/');

/** 낱말과 기호 사이에 낀 진짜 이모지만 잡는다. 한글·한자·괘선 문자는 아니다 */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

export function qaTests(check: Check, assert: Assert): void {
  const srcFiles = sourceFiles(path.join(root, 'src'), ['.ts', '.tsx', '.css', '.json']);

  /* -------------------------------------------------- 인터넷에 보내지 않는다 */

  /**
   * 밖으로 나가도 되는 주소는 이 둘뿐이다. 여기에 없는 주소가 코드에 생기면 실패한다.
   *   - XML 이름공간 — 요청이 아니라 SVG 문법이다
   *   - 웹폰트 — 정적 웹 배포본에서만 부르고, 오프라인 배포본은 layout.tsx 가 아예 렌더하지 않는다
   *     (tools/standalone.ts 가 NEXT_PUBLIC_OFFLINE=1 로 다시 내보낸다)
   */
  const ALLOWED_URLS = [/^https?:\/\/(www\.)?w3\.org\//, /^https:\/\/cdn\.jsdelivr\.net(\/gh\/orioncactus\/pretendard|$)/];

  check('[점검] 코드가 이용자의 것을 밖으로 보내지 않는다 (NFR-1 · NFR-7)', () => {
    const bad: string[] = [];
    for (const f of srcFiles.filter((f) => /\.tsx?$/.test(f))) {
      const src = read(f);
      for (const m of src.matchAll(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|sendBeacon)\s*\(/g)) {
        const line = src.slice(0, m.index ?? 0).split('\n').length;
        bad.push(`${rel(f)}:${line} ${m[1]}`);
      }
      for (const m of src.matchAll(/["'`](https?:\/\/(?!127\.0\.0\.1|localhost)[^"'`]+)/g)) {
        if (ALLOWED_URLS.some((re) => re.test(m[1]))) continue;
        const line = src.slice(0, m.index ?? 0).split('\n').length;
        bad.push(`${rel(f)}:${line} ${m[1].slice(0, 48)}`);
      }
    }
    assert(bad.length === 0, `외부 호출 ${bad.length}건: ${bad.slice(0, 3).join(' | ')}`);
  });

  check('[점검] 오프라인 배포본은 웹폰트도 부르지 않는다 (NFR-1)', () => {
    const layout = read(path.join(root, 'src/app/layout.tsx'));
    assert(/NEXT_PUBLIC_OFFLINE/.test(layout), 'layout.tsx 에 오프라인 분기가 없다');
    const f = path.join(root, 'dist', 'evacuation-planner.html');
    if (!fs.existsSync(f)) return;
    const html = read(f);
    // 글 속의 출처 주소(sources.json)는 그냥 글자다. 실제로 받아오는 자리만 본다
    const fetched = [
      ...html.matchAll(/<(?:script|img|iframe)\b[^>]*\bsrc\s*=\s*["']https?:/gi),
      ...html.matchAll(/<link\b[^>]*\bhref\s*=\s*["']https?:/gi),
      ...html.matchAll(/@import[^;]*https?:/gi),
      // CSS 의 url() 만. 자바스크립트의 new URL(...) 은 요청이 아니다
      ...html.matchAll(/(?<![\w.$])url\(\s*["']?https?:/g),
    ];
    assert(fetched.length === 0, `배포본이 밖에서 받아오는 것 ${fetched.length}건`);
  });

  check('[점검] 웹폰트·이미지도 밖에서 받아오지 않는다 (NFR-1)', () => {
    const bad: string[] = [];
    for (const f of srcFiles.filter((f) => f.endsWith('.css'))) {
      const src = read(f);
      for (const m of src.matchAll(/url\(\s*["']?(https?:)?\/\//g)) {
        bad.push(`${rel(f)}:${src.slice(0, m.index ?? 0).split('\n').length}`);
      }
      for (const m of src.matchAll(/@import\s+(url\()?["']https?:/g)) {
        bad.push(`${rel(f)}:${src.slice(0, m.index ?? 0).split('\n').length}`);
      }
    }
    assert(bad.length === 0, `외부 자원 ${bad.join(', ')}`);
  });

  check('[점검] 런타임에 생성형 AI 를 부르지 않는다 (CON-1)', () => {
    const bad: string[] = [];
    for (const f of srcFiles.filter((f) => /\.tsx?$/.test(f))) {
      if (/\b(openai|anthropic|generativelanguage|api\.cohere|gemini-pro)\b/i.test(read(f))) bad.push(rel(f));
    }
    assert(bad.length === 0, `생성형 AI 흔적: ${bad.join(', ')}`);
  });

  /* -------------------------------------------------- 챗봇을 만들지 않는다 */

  check('[점검] 어린이 화면에 자유 텍스트 입력이 없다 (설계서 v1.1 의견 3)', () => {
    const bad: string[] = [];
    for (const f of sourceFiles(path.join(root, 'src', 'kids'), ['.tsx'])) {
      const src = read(f);
      for (const m of src.matchAll(/<(input|textarea)\b[^>]*/g)) {
        const tag = m[0];
        if (tag.startsWith('<textarea')) {
          bad.push(`${rel(f)} textarea`);
          continue;
        }
        // 파일 고르기·체크상자는 자유 입력이 아니다
        if (!/type=["'](file|checkbox|radio|range)["']/.test(tag)) bad.push(`${rel(f)} ${tag.slice(0, 40)}`);
      }
    }
    assert(bad.length === 0, `자유 입력 ${bad.join(' | ')}`);
  });

  /* -------------------------------------------------- 이모지 금지 */

  check('[점검] 화면 코드와 콘텐츠에 이모지가 없다 (작업지침 §5)', () => {
    const bad: string[] = [];
    for (const f of srcFiles) {
      const src = read(f);
      const m = EMOJI.exec(src);
      if (m) bad.push(`${rel(f)}:${src.slice(0, m.index).split('\n').length} ${m[0]}`);
    }
    assert(bad.length === 0, `이모지 ${bad.slice(0, 3).join(' | ')}`);
  });

  /* -------------------------------------------------- 괄호 조사 */

  check('[점검] 화면 문구에 "을(를)" 같은 괄호 조사가 없다 (작업지침 §8)', () => {
    const bad: string[] = [];
    for (const f of sourceFiles(path.join(root, 'src', 'kids'), ['.ts', '.tsx', '.json'])) {
      // 조사를 고르는 당사자는 뺀다 — 주석에서 고쳐야 할 예로 그 꼴을 든다
      if (rel(f).endsWith('core/josa.ts')) continue;
      const src = read(f);
      const m = /을\(를\)|이\(가\)|은\(는\)|와\(과\)|로\(으로\)/.exec(src);
      if (m) bad.push(`${rel(f)}:${src.slice(0, m.index).split('\n').length} ${m[0]}`);
    }
    assert(bad.length === 0, `괄호 조사 ${bad.slice(0, 3).join(' | ')} — core/josa.ts 를 쓴다`);
  });

  /* -------------------------------------------------- 누르는 것의 크기 */

  check('[점검] 어린이 화면의 히트박스 기준이 48px 한 곳에서 정해진다 (D6 · NFR-10)', () => {
    const css = read(path.join(root, 'src/kids/ui/kids.css'));
    const m = css.match(/--k-hit:\s*(\d+)px/);
    assert(m !== null, '--k-hit 이 없다');
    assert(Number(m![1]) >= 48, `--k-hit 이 ${m![1]}px 이다`);
    // 기준보다 작은 값을 따로 박아 넣은 규칙이 없어야 한다
    const bad: string[] = [];
    for (const f of ['src/kids/ui/kids.css', 'src/kids/ui/kids-game.css']) {
      const src = read(path.join(root, f));
      for (const hit of src.matchAll(/min-(?:height|width):\s*(\d+)px/g)) {
        const px = Number(hit[1]);
        if (px === 0 || px >= 48) continue;
        const line = src.slice(0, hit.index ?? 0).split('\n').length;
        // 선언이 어떤 규칙 안에 있는지 본다 — 단추가 아닌 것(칸·막대)은 뺀다
        const head = src.slice(0, hit.index ?? 0).lastIndexOf('{');
        const sel = src.slice(src.lastIndexOf('}', head) + 1, head).trim();
        if (/button|\.k-tb|\.k-cat|\.k-chk|\.k-link|\.k-x|\.k-act|\.k-big|\.k-tool\b/.test(sel)) bad.push(`${f}:${line} ${sel} ${px}px`);
      }
    }
    assert(bad.length === 0, `48px 미만 규칙: ${bad.join(' | ')}`);
  });

  /* -------------------------------------------------- 죽은 CSS */

  check('[점검] 어린이 화면에 쓰지 않는 CSS 규칙이 남아 있지 않다', () => {
    const css = [read(path.join(root, 'src/kids/ui/kids.css')), read(path.join(root, 'src/kids/ui/kids-game.css'))].join('\n');
    const code = sourceFiles(path.join(root, 'src'), ['.ts', '.tsx'])
      .map(read)
      .join('\n');
    const classes = new Set<string>();
    for (const m of css.matchAll(/\.(k-[a-z0-9-]+)/g)) classes.add(m[1]);
    // 코드가 이어 붙여 만드는 이름 (`k-bubble-${speaker}` 처럼)
    const composed = ['k-bubble-yeongi', 'k-bubble-ungi', 'k-bubble-ilgu'];
    const unused = [...classes].filter((c) => !composed.includes(c) && !code.includes(c));
    assert(unused.length === 0, `쓰지 않는 규칙 ${unused.length}개: ${unused.slice(0, 6).join(', ')}`);
  });

  /* -------------------------------------------------- 오프라인 배포본 */

  check('[점검] 오프라인 배포본이 4MB 를 넘지 않는다 (NFR-3)', () => {
    const f = path.join(root, 'dist', 'evacuation-planner.html');
    if (!fs.existsSync(f)) {
      // 아직 만들지 않았으면 건너뛴다 — npm run verify 는 만든 뒤에 부른다
      return;
    }
    const mb = fs.statSync(f).size / (1024 * 1024);
    assert(mb <= 4, `${mb.toFixed(2)}MB`);
  });

  check('[점검] 런타임 의존성은 react·react-dom·zustand·next 뿐이다', () => {
    const pkg = JSON.parse(read(path.join(root, 'package.json')));
    const deps = Object.keys(pkg.dependencies ?? {}).sort();
    assert(deps.join(',') === 'next,react,react-dom,zustand', `의존성: ${deps.join(', ')}`);
  });

  /* -------------------------------------------------- 성능 */

  check('[점검] 위험장 한 걸음 계산이 한 프레임(16ms) 안에 끝난다 (NFR-13)', () => {
    const preset = HAZARD_PRESETS[0];
    const TICKS = 120;
    let worst = 0;
    let worstOn = '';
    for (const tpl of TEMPLATES) {
      const plan = JSON.parse(JSON.stringify(tpl.plan)) as FloorPlan;
      const ctx = buildContext(plan, buildGraph(plan));
      const origin = { x: Math.floor(plan.grid.width / 2), y: Math.floor(plan.grid.height / 2) };
      const t0 = performance.now();
      simulateAhead(plan, ctx, preset, origin, TICKS, fuelOf);
      const per = (performance.now() - t0) / TICKS;
      if (per > worst) {
        worst = per;
        worstOn = tpl.id;
      }
    }
    assert(worst < 16, `${worstOn} 한 걸음 ${worst.toFixed(2)}ms`);
  });
}
