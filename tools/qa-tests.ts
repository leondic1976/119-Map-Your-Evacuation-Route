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
import type { FloorPlan } from '../src/types/plan';
import { BLOCKS, GUIDE_CARDS, GUIDE_RULES, HAZARD_PRESETS, REPORT_ITEMS, RULE_MESSAGES, TEMPLATES, fuelOf } from '../src/content';
import { guideVoiceFilename, VOICE_LINES } from '../src/content/voice';
import { buildGraph } from '../src/core/graph/build';
import { buildContext } from '../src/core/hazard/transfer';
import { simulateAhead } from '../src/core/hazard/ignition';

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
  /* Windows 체크아웃의 CRLF도 문서 정본 비교에서는 같은 줄바꿈으로 본다. */
  return fs.readFileSync(p, 'utf8').replace(/\r\n?/g, '\n');
}

const rel = (p: string): string => path.relative(root, p).split(path.sep).join('/');

/** 낱말과 기호 사이에 낀 진짜 이모지만 잡는다. 한글·한자·괘선 문자는 아니다 */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

/** ID3 뒤의 실제 MPEG-1 Layer III 프레임을 연속해서 읽을 수 있는지 확인한다. */
function mp3AudioOffset(data: Buffer): number {
  if (data.subarray(0, 3).toString('ascii') !== 'ID3') return 0;
  const tagSize = ((data[6] & 0x7f) << 21) | ((data[7] & 0x7f) << 14) | ((data[8] & 0x7f) << 7) | (data[9] & 0x7f);
  return 10 + tagSize;
}

function mp3FrameLength(data: Buffer, offset: number): number {
  const b1 = data[offset + 1] ?? 0;
  const b2 = data[offset + 2] ?? 0;
  if (data[offset] !== 0xff || (b1 & 0xe0) !== 0xe0) return 0;
  if (((b1 >> 3) & 0x03) !== 0x03 || ((b1 >> 1) & 0x03) !== 0x01) return 0;
  const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const sampleRates = [44100, 48000, 32000];
  const bitrate = bitrates[(b2 >> 4) & 0x0f] ?? 0;
  const sampleRate = sampleRates[(b2 >> 2) & 0x03] ?? 0;
  if (!bitrate || !sampleRate) return 0;
  return Math.floor((144 * bitrate * 1000) / sampleRate) + ((b2 >> 1) & 0x01);
}

export function qaTests(check: Check, assert: Assert): void {
  check('[점검] inst.md의 크기 조절·가구 분류·한 명 리플레이가 소스와 콘텐츠에 모두 연결됐다', () => {
    const shell = read(path.join(root, 'src/ui/KidsShell.tsx'));
    const canvas = read(path.join(root, 'src/ui/KidsCanvas.tsx'));
    const store = read(path.join(root, 'src/store/kidsStore.ts'));
    const replay = read(path.join(root, 'src/ui/replay3d/Replay3D.tsx'));
    const scene = read(path.join(root, 'src/ui/replay3d/Scene.tsx'));
    const avatar = read(path.join(root, 'src/ui/replay3d/Avatar3D.tsx'));
    const furniture = BLOCKS.filter((block) => block.category === 'furniture');
    assert(furniture.every((block) => Boolean(block.minSize && block.maxSize)), '크기 조절 범위가 없는 가구가 있다');
    assert(BLOCKS.find((block) => block.id === 'gas_range')?.category === 'furniture', '가스불이 가구 갈래가 아니다');
    assert(shell.includes('data-furniture-size-controls'), '가구 크기 조절 화면이 없다');
    assert(!shell.includes('data-room-size-controls') && canvas.includes('data-handle={h.h}'), '상단 방 크기 조절부를 없애고 도면 손잡이를 유지하지 않았다');
    assert(store.includes('howTo: false'), '캔버스를 넓히는 기본 접힌 사용법 설정이 없다');
    assert(shell.includes('data-opening-resize="decrease"') && shell.includes('data-opening-resize="increase"') && shell.includes("'현관문 너비'"), '문·현관문 너비 조절 화면이 없다');
    assert(store.includes('resizePoint: (id, footprint) =>') && store.includes("block.subKind === 'gas_range' ? 'furniture'"), '가구 크기 저장 또는 이전 가스불 이동 경로가 없다');
    assert(replay.includes("block.subKind === 'my_spot'" ) && replay.includes('data-replay-my-spot-count="0"'), '3D 리플레이에서 고정 내 위치를 제거하지 않는다');
    assert(replay.includes('data-player-representation=') && scene.includes("view === 'first' ? (") && !scene.includes("visible={view !== 'first'}"), '3D 시점마다 주인공 표현을 하나만 생성하지 않는다');
    assert(avatar.includes("representation: 'first-person-body'") && avatar.includes('어깨와 상체가 양팔을 하나의 주인공으로 연결한다'), '1인칭 양팔이 한 사람의 몸으로 연결되지 않았다');
  });

  const srcFiles = sourceFiles(path.join(root, 'src'), ['.ts', '.tsx', '.css', '.json']);

  /* -------------------------------------------------- 음성 대본 정본 */

  check('[점검] VOICE-SCRIPT.md가 실제 콘텐츠와 ElevenLabs 제작본에 맞는다', () => {
    const script = read(path.join(root, 'VOICE-SCRIPT.md'));
    const section = (from: string, to: string): string => {
      const start = script.indexOf(from);
      const end = script.indexOf(to, start + from.length);
      assert(start >= 0 && end > start, `${from} 또는 ${to} 절을 찾을 수 없다`);
      return script.slice(start, end);
    };

    const guide = section('## 1. 캐릭터 대사', '## 2. 학습 카드');
    const speakers = { ilgu: '일구', yeongi: '영이', ungi: '웅이' } as const;
    const guideRows = guide.split('\n').filter((line) => /^\| `[^`]+` \|/.test(line));
    assert(guideRows.length === GUIDE_RULES.length, `캐릭터 대사 문서 ${guideRows.length}건 · 앱 ${GUIDE_RULES.length}건`);
    for (const rule of GUIDE_RULES) {
      const row = `| \`${rule.id}\` | ${speakers[rule.speaker]} | ${rule.text.easy} | ${rule.text.normal} |`;
      assert(guide.includes(row), `캐릭터 대사 불일치: ${rule.id}`);
    }

    const cards = section('## 2. 학습 카드', '## 3. 결과 리포트 문장');
    const cardHeadings = cards.match(/^### /gm) ?? [];
    assert(cardHeadings.length === GUIDE_CARDS.length, `학습 카드 문서 ${cardHeadings.length}장 · 앱 ${GUIDE_CARDS.length}장`);
    for (const card of GUIDE_CARDS) {
      const block = `### ${card.title}\n\n- **쉬움** — ${card.body.easy}\n- **보통** — ${card.body.normal}`;
      assert(cards.includes(block), `학습 카드 불일치: ${card.id}`);
    }

    const reportRules = section('### 3.1 규칙별 지적·칭찬', '### 3.2 플레이 판정 문장');
    const reportRuleRows = reportRules.split('\n').filter((line) => /^\| `RULE-/.test(line));
    assert(reportRuleRows.length === Object.keys(RULE_MESSAGES.rules).length, `규칙별 문장 수 불일치`);
    for (const [id, messages] of Object.entries(RULE_MESSAGES.rules)) {
      const row = `| \`${id}\` | ${messages.reportHeadline.easy} | ${messages.praise.easy} |`;
      assert(reportRules.includes(row), `규칙별 문장 불일치: ${id}`);
    }

    const reportItems = section('### 3.2 플레이 판정 문장', '## 4. ElevenLabs 전달용 최종 지시문');
    const reportItemRows = reportItems.split('\n').filter((line) => /^\| `dyn\./.test(line));
    assert(reportItemRows.length === REPORT_ITEMS.length, `플레이 판정 문서 ${reportItemRows.length}건 · 앱 ${REPORT_ITEMS.length}건`);
    for (const item of REPORT_ITEMS) {
      const row = `| \`${item.id}\` |  | ${item.headline.easy} |`;
      assert(reportItems.includes(row), `플레이 판정 문장 불일치: ${item.id}`);
    }

    const elevenLabs = section('## 4. ElevenLabs 전달용 최종 지시문', '## 5. 소리 효과');
    assert(elevenLabs.includes('https://elevenlabs.io/app/speech-synthesis/text-to-speech'), `실제 Text to Speech 작업 주소가 없다`);
    assert(elevenLabs.includes('이 절 전체를 Text to Speech 입력창에 붙여 넣지 않는다'), `작업 설명을 음성으로 읽지 않게 하는 경고가 없다`);
    for (const preset of ['Eleven Multilingual v2', 'Stability', '50%', 'Similarity', '75%', 'Style Exaggeration', '0%', 'Speaker Boost', 'Speed', '1.0']) {
      assert(elevenLabs.includes(preset), `ElevenLabs 공통 설정이 빠졌다: ${preset}`);
    }
    assert(elevenLabs.includes('`Enhance`는 누르지 않는다'), `대사를 자동 수정하지 말라는 지시가 없다`);
    assert(elevenLabs.includes('같은 목소리 하나'), `음성 일관성 지시가 없다`);
    assert(elevenLabs.includes('파일명·번호·설명·백틱은 넣지 않는다'), `안내 문구를 읽지 말라는 지시가 없다`);
    assert(elevenLabs.includes('배경음악·화재경보음·효과음·다른 목소리는 넣지 않는다'), `불필요한 소리를 금지하는 지시가 없다`);
    assert(elevenLabs.includes('`MP3 (128kbps)`'), `웹 화면에서 실제로 받을 MP3 형식이 없다`);
    assert(!elevenLabs.includes('MP3 48kbps'), `웹 화면에서 고를 수 없는 MP3 48kbps를 지시한다`);
    const voiceBlocks = elevenLabs.match(/^#### \d+\. `v-[^`]+\.mp3`$/gm) ?? [];
    assert(voiceBlocks.length === Object.keys(VOICE_LINES).length, `ElevenLabs 지시문 ${voiceBlocks.length}개 · 앱 ${Object.keys(VOICE_LINES).length}개`);
    for (const [id, line] of Object.entries(VOICE_LINES)) {
      assert(elevenLabs.includes(`#### ${Object.keys(VOICE_LINES).indexOf(id) + 1}. \`${id}.mp3\``), `ElevenLabs 파일 순서 불일치: ${id}`);
      assert(elevenLabs.includes(`\`\`\`text\n${line}\n\`\`\``), `ElevenLabs 입력 대사 불일치: ${id}`);
    }
    assert(elevenLabs.includes('public/voice/') && elevenLabs.includes('npm run voice') && elevenLabs.includes('npm run verify'), `납품·굽기·검증 절차가 없다`);

    const baker = read(path.join(root, 'tools', 'voice-bake.ts'));
    const idsSource = baker.match(/const IDS = \[([^\]]+)\]/)?.[1] ?? '';
    const bakedIds = [...idsSource.matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
    const voiceIds = Object.keys(VOICE_LINES).sort();
    assert(JSON.stringify(bakedIds) === JSON.stringify(voiceIds), `MP3 굽기 목록이 음성 정본과 다르다`);
  });

  check('[점검] Juwonmom 실제 MP3 176개와 웹·오프라인 재생 경로가 맞다', () => {
    const voiceDir = path.join(root, 'public', 'voice');
    const manifestPath = path.join(voiceDir, 'manifest.json');
    assert(fs.existsSync(manifestPath), 'public/voice/manifest.json 이 없다');
    const manifest = JSON.parse(read(manifestPath)) as {
      voice: string;
      speed: number;
      summary: Record<string, number>;
      items: Array<{
        id: string;
        filename: string;
        ruleId?: string;
        gradeMode?: 'easy' | 'normal';
        text: string;
        generate: boolean;
      }>;
    };
    assert(manifest.voice === 'Juwonmom', `음성 이름이 다르다: ${manifest.voice}`);
    assert(manifest.speed === 1, `음성 속도가 중간값 1.0이 아니다: ${manifest.speed}`);
    assert(manifest.summary.guideRules === GUIDE_RULES.length, `가이드 규칙 수 ${manifest.summary.guideRules}`);
    assert(manifest.summary.guideVariants === GUIDE_RULES.length * 2, `가이드 변형 수 ${manifest.summary.guideVariants}`);
    assert(manifest.summary.criticalClips === Object.keys(VOICE_LINES).length, `핵심 음성 수 ${manifest.summary.criticalClips}`);
    assert(manifest.summary.logicalItems === 176 && manifest.summary.generatedItems === 176, `전체 음성 수가 176이 아니다`);
    assert(manifest.summary.generalizedDynamicItems === 4, `일반화한 동적 문장 수 ${manifest.summary.generalizedDynamicItems}`);
    assert(manifest.summary.totalDisplayCharacters === 5307, `화면 대사 글자 수 ${manifest.summary.totalDisplayCharacters}`);
    assert(manifest.summary.generationCharacters === 5277, `생성 대사 글자 수 ${manifest.summary.generationCharacters}`);
    assert(manifest.items.length === 176, `매니페스트 항목 ${manifest.items.length}개`);

    const byId = new Map(manifest.items.map((item) => [item.id, item]));
    for (const rule of GUIDE_RULES) {
      for (const gradeMode of ['easy', 'normal'] as const) {
        const item = byId.get(`guide:${rule.id}:${gradeMode}`);
        assert(item !== undefined, `가이드 음성 누락: ${rule.id}.${gradeMode}`);
        assert(item?.filename === guideVoiceFilename(rule.id, gradeMode), `가이드 파일명 불일치: ${rule.id}.${gradeMode}`);
        assert(item?.generate === true, `생성 제외된 가이드: ${rule.id}.${gradeMode}`);
        if (!/[{}]/.test(rule.text[gradeMode])) assert(item?.text === rule.text[gradeMode], `가이드 대사 불일치: ${rule.id}.${gradeMode}`);
      }
    }
    for (const [voiceId, text] of Object.entries(VOICE_LINES)) {
      const item = byId.get(`critical:${voiceId}`);
      assert(item?.filename === `${voiceId}.mp3`, `핵심 파일명 불일치: ${voiceId}`);
      assert(item?.text === text, `핵심 대사 불일치: ${voiceId}`);
    }

    const expectedFiles = manifest.items.map((item) => item.filename).sort();
    assert(new Set(expectedFiles).size === expectedFiles.length, '매니페스트 파일명이 중복됐다');
    const actualFiles = fs
      .readdirSync(voiceDir)
      .filter((name) => name.toLowerCase().endsWith('.mp3'))
      .sort();
    assert(JSON.stringify(actualFiles) === JSON.stringify(expectedFiles), `MP3 ${actualFiles.length}/176 — 누락·초과 파일이 있다`);
    for (const filename of actualFiles) {
      const data = fs.readFileSync(path.join(voiceDir, filename));
      let frameOffset = mp3AudioOffset(data);
      let frameCount = 0;
      for (; frameCount < 3; frameCount += 1) {
        const length = mp3FrameLength(data, frameOffset);
        if (!length) break;
        frameOffset += length;
      }
      assert(data.length > 1024, `MP3가 너무 작다: ${filename} ${data.length}바이트`);
      assert(frameCount === 3, `실제 MP3 음성 프레임을 읽을 수 없다: ${filename}`);
      assert(data.subarray(0, Math.min(data.length, 4096)).includes(Buffer.from('Eleven Labs Inc.')), `ElevenLabs 제작 서명이 없다: ${filename}`);
      assert(!data.subarray(0, 32).toString('utf8').toLowerCase().includes('<html'), `HTML이 MP3로 저장됐다: ${filename}`);
    }

    const sound = read(path.join(root, 'src', 'ui', 'sound.ts'));
    const gameView = read(path.join(root, 'src', 'ui', 'GameView.tsx'));
    const bubble = read(path.join(root, 'src', 'ui', 'GuideBubble.tsx'));
    const baker = read(path.join(root, 'tools', 'voice-bake.ts'));
    assert(sound.includes('NEXT_PUBLIC_BASE_PATH') && sound.includes('/voice/'), '웹 음성 BASE_PATH 경로가 없다');
    assert(sound.includes("NEXT_PUBLIC_OFFLINE === '1'") && sound.includes('`voice/${filename}`'), '오프라인 MP3 상대 경로가 없다');
    assert(!sound.includes('new SpeechSynthesisUtterance') && !sound.includes('speechSynthesis.speak'), '브라우저 기계음 폴백이 남아 있다');
    assert(!sound.includes('export function playVoice') && !gameView.includes('playVoice('), '예전 핵심 대사 중복 재생 경로가 남아 있다');
    assert(sound.includes('audio.onerror = failed') && sound.includes('stopVoice()'), 'MP3 실패·음소거 중단 처리가 없다');
    assert(sound.includes('replayLastGuideVoice'), '최근 MP3를 다시 듣는 재생 경로가 없다');
    assert(bubble.includes('playGuideVoice(bubble.ruleId, profile.gradeMode'), '말풍선이 규칙·수준별 MP3를 쓰지 않는다');
    assert(bubble.includes('data-coach="kids-voice-replay"'), '말풍선에 MP3 다시 듣기 단추가 없다');
    assert(/path\.join\(root, 'public', 'voice'\)/.test(baker), '핵심 음원 굽기가 public/voice를 읽지 않는다');
    const standalone = read(path.join(root, 'tools', 'standalone.ts'));
    assert(standalone.includes("path.join(root, 'public', 'voice')") && standalone.includes('fs.cpSync(voiceSource, voiceTarget'), '오프라인 Juwonmom MP3 복사가 없다');
    const workflow = read(path.join(root, '.github', 'workflows', 'deploy.yml'));
    assert(/name: offline-classroom-bundle[\s\S]*?path: dist\//.test(workflow), '배포 산출물이 오프라인 음성 폴더를 빠뜨린다');
  });

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
    const f = path.join(root, 'dist', 'home-escape-map.html');
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

  check('[점검] 자유 대화 입력은 없고 학생정보·공간 이름만 제한적으로 받는다', () => {
    const bad: string[] = [];
    for (const f of sourceFiles(path.join(root, 'src'), ['.tsx'])) {
      const src = read(f);
      for (const m of src.matchAll(/<(input|textarea)\b[^>]*/g)) {
        const tag = m[0];
        if (tag.startsWith('<textarea')) {
          bad.push(`${rel(f)} textarea`);
          continue;
        }
        // 파일 고르기·체크상자, 이용자가 명시 요청한 학생 이름표·공간 이름은 자유 대화가 아니다
        if (!/type=["'](file|checkbox|radio|range)["']/.test(tag) && !/data-allowed-free-text=["'](student-profile|room-name|dashboard-search)["']/.test(tag)) bad.push(`${rel(f)} ${tag.slice(0, 40)}`);
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

  /* -------------------------------------------------- 설계서와 코드 */

  /**
   * 코드 주석이 가리키는 설계서의 절이 실제로 있어야 한다.
   * `설계서 v1.2 §11`·`§12`·`§13` 을 가리키면서 문서에는 그 절이 없던 적이 있다.
   * 코드보다 설계서를 먼저 고친다는 원칙(작업지침 §9)이 지켜졌는지를 기계로 본다.
   */
  check('[점검] 코드가 가리키는 설계서 절이 실제로 있다 (작업지침 §9)', () => {
    const docs: Record<string, string> = {
      'v1.0': read(path.join(root, 'docs/DESIGN-v1.0.md')),
      'v1.1': read(path.join(root, 'docs/DESIGN-v1.1-changes.md')),
      'v1.2': read(path.join(root, 'docs/DESIGN-v1.2-changes.md')),
      'v1.3': read(path.join(root, 'docs/DESIGN-v1.3-changes.md')),
      'v1.4': read(path.join(root, 'docs/DESIGN-v1.4-changes.md')),
      'v1.5': read(path.join(root, 'docs/DESIGN-v1.5-changes.md')),
      'v1.6': read(path.join(root, 'docs/DESIGN-v1.6-changes.md')),
    };
    /* 문서마다 있는 절 번호를 모은다 — 제목 줄의 "## 8.2" 같은 것 */
    const heads: Record<string, Set<string>> = {};
    for (const [v, src] of Object.entries(docs)) {
      const set = new Set<string>();
      for (const m of src.matchAll(/^#{2,4}\s+(\d+(?:\.\d+)*)/gm)) set.add(m[1]);
      heads[v] = set;
    }
    const bad: string[] = [];
    for (const f of sourceFiles(path.join(root, 'src'), ['.ts', '.tsx', '.css'])) {
      const src = read(f);
      for (const m of src.matchAll(/설계서\s+(v1\.[0123456])\s+§(\d+(?:\.\d+)*)/g)) {
        const [, ver, sec] = m;
        if (heads[ver]?.has(sec)) continue;
        bad.push(`${rel(f)}:${src.slice(0, m.index ?? 0).split('\n').length} ${ver} §${sec}`);
      }
    }
    assert(bad.length === 0, `없는 절을 가리킨다: ${bad.slice(0, 4).join(' | ')}`);
  });

  /**
   * 설계서가 적어 둔 규칙 id 가 실제로 구현돼 있어야 한다.
   * 설계서는 RULE-F-06·07 로 적었는데 그 번호가 이미 쓰이고 있어 F-08·09 로 나간 적이 있다.
   */
  check('[점검] 설계서가 적은 규칙 id 가 코드에 있다 (작업지침 §9)', () => {
    const defs = read(path.join(root, 'src/core/rules/definitions.ts'));
    const known = new Set<string>();
    for (const m of defs.matchAll(/id:\s*'(RULE-[A-Z]-\d+)'/g)) known.add(m[1]);
    assert(known.size > 0, '규칙 id 를 하나도 못 찾았다');
    const bad: string[] = [];
    for (const d of ['docs/DESIGN-v1.1-changes.md', 'docs/DESIGN-v1.2-changes.md', 'docs/DESIGN-v1.3-changes.md', 'docs/DESIGN-v1.4-changes.md', 'docs/DESIGN-v1.5-changes.md', 'docs/DESIGN-v1.6-changes.md']) {
      const src = read(path.join(root, d));
      for (const m of src.matchAll(/RULE-[A-Z]-\d+/g)) {
        if (known.has(m[0])) continue;
        bad.push(`${d}:${src.slice(0, m.index ?? 0).split('\n').length} ${m[0]}`);
      }
    }
    assert(bad.length === 0, `설계서에만 있는 규칙: ${bad.slice(0, 4).join(' | ')}`);
  });

  /* -------------------------------------------------- 괄호 조사 */

  check('[점검] 화면 문구에 "을(를)" 같은 괄호 조사가 없다 (작업지침 §8)', () => {
    const bad: string[] = [];
    for (const f of sourceFiles(path.join(root, 'src'), ['.ts', '.tsx', '.json'])) {
      // 조사를 고르는 당사자는 뺀다 — 주석에서 고쳐야 할 예로 그 꼴을 든다
      if (rel(f).endsWith('core/josa.ts')) continue;
      const src = read(f);
      const m = /을\(를\)|이\(가\)|은\(는\)|와\(과\)|로\(으로\)/.exec(src);
      if (m) bad.push(`${rel(f)}:${src.slice(0, m.index).split('\n').length} ${m[0]}`);
    }
    assert(bad.length === 0, `괄호 조사 ${bad.slice(0, 3).join(' | ')} — core/josa.ts 를 쓴다`);
  });

  /* -------------------------------------------------- 누르는 것의 크기 */

  check('[점검] 히트박스 기준이 48px 한 곳에서 정해진다 (D6 · NFR-10)', () => {
    const css = read(path.join(root, 'src/ui/kids.css'));
    const m = css.match(/--k-hit:\s*(\d+)px/);
    assert(m !== null, '--k-hit 이 없다');
    assert(Number(m![1]) >= 48, `--k-hit 이 ${m![1]}px 이다`);
    // 기준보다 작은 값을 따로 박아 넣은 규칙이 없어야 한다
    const bad: string[] = [];
    for (const f of ['src/ui/kids.css', 'src/ui/kids-game.css']) {
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

  /* -------------------------------------------------- 층 나누기 */

  /**
   * `core/**` 는 순수 계산만 한다 (작업지침 §9-4).
   * react·zustand 를 들이면 화면 없이 돌릴 수 없어 tools/logic-tests.ts 가 못 부르고,
   * document·window 를 부르면 Electron 의 주 프로세스에서도 못 쓴다.
   */
  check('[점검] core 가 react·zustand·three·document·window 를 부르지 않는다 (작업지침 §9-4)', () => {
    const bad: string[] = [];
    for (const f of sourceFiles(path.join(root, 'src', 'core'), ['.ts', '.tsx'])) {
      const src = read(f);
      for (const m of src.matchAll(/from\s+['"](react|zustand|three|@react-three\/[a-z]+)['"]|\b(document|window)\s*\./g)) {
        /* 주석 줄은 뺀다 — 무엇을 부르지 않는지 적어 둔 곳이 있다 */
        const line = src.slice(0, m.index ?? 0).split('\n').pop() ?? '';
        if (/^\s*(\*|\/\/)/.test(line)) continue;
        bad.push(`${rel(f)}:${src.slice(0, m.index ?? 0).split('\n').length} ${m[0]}`);
      }
    }
    assert(bad.length === 0, `순수하지 않다: ${bad.slice(0, 4).join(' | ')}`);
  });

  /**
   * 영구·탭 저장소와 파일 내려받기는 `platform/**` 한 곳만 만진다.
   * Electron 으로 감쌀 때 갈아 끼울 자리를 하나로 묶어 두기 위해서다 — 다른 데로
   * 새면 껍데기를 바꿀 때마다 온 코드를 뒤져야 한다.
   */
  check('[점검] 브라우저 저장소·파일 내려받기가 platform 밖으로 새지 않는다', () => {
    const bad: string[] = [];
    for (const f of sourceFiles(path.join(root, 'src'), ['.ts', '.tsx'])) {
      if (rel(f).startsWith('src/platform/')) continue;
      const src = read(f);
      for (const m of src.matchAll(/(?:local|session)Storage|createObjectURL|\.download\s*=/g)) {
        const line = src.slice(0, m.index ?? 0).split('\n').pop() ?? '';
        if (/^\s*(\*|\/\/)/.test(line)) continue;
        bad.push(`${rel(f)}:${src.slice(0, m.index ?? 0).split('\n').length} ${m[0]}`);
      }
    }
    assert(bad.length === 0, `platform 밖에서 만진다: ${bad.slice(0, 4).join(' | ')} — platform/host.ts 를 쓴다`);
  });

  /* -------------------------------------------------- 죽은 CSS */

  check('[점검] 쓰지 않는 CSS 규칙이 남아 있지 않다', () => {
    const css = [
      read(path.join(root, 'src/ui/base.css')),
      read(path.join(root, 'src/ui/kids.css')),
      read(path.join(root, 'src/ui/kids-game.css')),
    ].join('\n');
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
    const f = path.join(root, 'dist', 'home-escape-map.html');
    if (!fs.existsSync(f)) {
      // 아직 만들지 않았으면 건너뛴다 — npm run verify 는 만든 뒤에 부른다
      return;
    }
    const mb = fs.statSync(f).size / (1024 * 1024);
    assert(mb <= 4, `${mb.toFixed(2)}MB`);
  });

  /**
   * 런타임 의존성 목록의 정본은 설계서 v1.4 §1.1 이다.
   * 여기 없는 것을 더하면 실패한다 — 늘리려면 설계서를 먼저 고친다 (작업지침 §9-12).
   */
  const RUNTIME_DEPS = [
    '@react-three/drei',
    '@react-three/fiber',
    '@react-three/postprocessing',
    'lucide-react',
    'next',
    'react',
    'react-dom',
    'three',
    'three-pathfinding',
    'zustand',
  ];

  check('[점검] 런타임 의존성이 설계서 v1.4 §1.1 의 목록과 같다', () => {
    const pkg = JSON.parse(read(path.join(root, 'package.json')));
    const deps = Object.keys(pkg.dependencies ?? {}).sort();
    const added = deps.filter((d) => !RUNTIME_DEPS.includes(d));
    const gone = RUNTIME_DEPS.filter((d) => !deps.includes(d));
    assert(added.length === 0, `설계서에 없는 의존성: ${added.join(', ')} — 설계서를 먼저 고친다`);
    assert(gone.length === 0, `설계서에 있는데 없는 의존성: ${gone.join(', ')}`);
  });

  /**
   * 3D 라이브러리가 오프라인 규칙을 깨는 두 통로를 막는다 (설계서 v1.4 §1.2).
   * 둘 다 화면에서는 멀쩡히 보이고 인터넷이 끊긴 교실에서만 깨진다 — 눈으로는 못 잡는다.
   */
  check('[점검] drei 의 Environment preset·Text 를 쓰지 않는다 (NFR-1)', () => {
    const bad: string[] = [];
    for (const f of sourceFiles(path.join(root, 'src'), ['.ts', '.tsx'])) {
      const src = read(f);
      const line = (i: number): number => src.slice(0, i).split('\n').length;
      for (const m of src.matchAll(/<Environment\b[^>]*\bpreset\s*=/g)) {
        bad.push(`${rel(f)}:${line(m.index ?? 0)} Environment preset — HDRI 를 CDN 에서 받아온다`);
      }
      /* drei 의 Text·Text3D 는 troika 가 글꼴을 받아온다 */
      for (const m of src.matchAll(/from\s+['"]@react-three\/drei['"]/g)) {
        const imported = src.slice(Math.max(0, (m.index ?? 0) - 400), m.index ?? 0);
        if (/\b(Text3D|Text)\s*[,}]/.test(imported)) {
          bad.push(`${rel(f)}:${line(m.index ?? 0)} drei 의 Text — 글꼴을 CDN 에서 받아온다`);
        }
      }
    }
    assert(bad.length === 0, bad.slice(0, 3).join(' | '));
  });

  /**
   * 3D 는 리플레이에만 있다 (작업지침 §9-3).
   * 에디터·게임·인쇄는 SVG 하나로 간다 — 인쇄물이 3D 가 되면 흑백에서 읽히지 않는다.
   */
  check('[점검] three 를 ui/replay3d 밖에서 부르지 않는다 (작업지침 §9-3)', () => {
    const bad: string[] = [];
    for (const f of sourceFiles(path.join(root, 'src'), ['.ts', '.tsx'])) {
      const r = rel(f);
      if (r.startsWith('src/ui/replay3d/')) continue;
      const src = read(f);
      for (const m of src.matchAll(/from\s+['"](three|@react-three\/[a-z]+|three-pathfinding)['"]/g)) {
        bad.push(`${r}:${src.slice(0, m.index ?? 0).split('\n').length} ${m[1]}`);
      }
    }
    assert(bad.length === 0, `리플레이 밖에서 3D 를 부른다: ${bad.slice(0, 3).join(' | ')}`);
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
