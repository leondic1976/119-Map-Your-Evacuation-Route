/**
 * 음원 굽기 — `public/voice/v-*.mp3` 를 `src/content/voice.ts` 안에 data URI 로 박는다.
 *
 *   npm run voice
 *
 * 파일 참조로 두지 않는 이유는 오프라인 배포본이 외부 참조 0건이어야 하기 때문이다(NFR-1).
 * 굽고 나면 `npm run verify` 로 4MB 상한(NFR-3)을 확인한다.
 *
 * 음원이 하나도 없으면 아무것도 하지 않는다 — 음성합성이 그대로 대신 읽는다.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'public', 'voice');
const target = path.join(root, 'src', 'content', 'voice.ts');

const IDS = ['v-start', 'v-crouch', 'v-door', 'v-close', 'v-elevator', 'v-success', 'v-retry', 'v-meeting'];

/** 여덟 개를 합친 상한. 단일 HTML 4MB 안에 들어가야 한다 */
const MAX_TOTAL = 1024 * 1024;

function main(): void {
  if (!fs.existsSync(dir)) {
    process.stdout.write(`\n  ${path.relative(root, dir)} 가 없다. 음원을 넣은 뒤 다시 돌린다.\n`);
    process.stdout.write('  지금은 브라우저 음성합성이 대신 읽는다.\n\n');
    return;
  }

  const found: { id: string; b64: string; bytes: number }[] = [];
  const missing: string[] = [];
  for (const id of IDS) {
    const f = path.join(dir, `${id}.mp3`);
    if (!fs.existsSync(f)) {
      missing.push(id);
      continue;
    }
    const buf = fs.readFileSync(f);
    found.push({ id, b64: buf.toString('base64'), bytes: buf.length });
  }

  if (found.length === 0) {
    process.stdout.write('\n  구울 음원이 없다. 음성합성이 대신 읽는다.\n\n');
    return;
  }

  const total = found.reduce((s, x) => s + x.bytes, 0);
  const src = fs.readFileSync(target, 'utf8');
  const body = found.map((x) => `  '${x.id}': 'data:audio/mpeg;base64,${x.b64}',`).join('\n');
  const next = src.replace(
    /export const VOICE_CLIPS: Partial<Record<VoiceId, string>> = \{[\s\S]*?\};/,
    `export const VOICE_CLIPS: Partial<Record<VoiceId, string>> = {\n${body}\n};`,
  );
  if (next === src) {
    process.stderr.write('\n  실패: voice.ts 에서 VOICE_CLIPS 자리를 찾지 못했다.\n\n');
    process.exit(1);
  }
  fs.writeFileSync(target, next);

  const kb = (n: number): string => `${(n / 1024).toFixed(0)}KB`;
  process.stdout.write(`\n  음원 ${found.length}개를 구웠다 (${kb(total)})\n`);
  for (const x of found) process.stdout.write(`    ${x.id}  ${kb(x.bytes)}\n`);
  if (missing.length) process.stdout.write(`  아직 없는 것: ${missing.join(', ')}\n`);
  if (total > MAX_TOTAL) {
    process.stderr.write(`\n  실패: 합쳐 ${kb(total)} 다. 1MB 를 넘으면 단일 HTML 이 4MB 를 넘길 수 있다.\n\n`);
    process.exit(1);
  }
  process.stdout.write('\n  npm run verify 로 크기와 외부 참조를 확인한다.\n\n');
}

main();
