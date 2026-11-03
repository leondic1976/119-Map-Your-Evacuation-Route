/**
 * 음성 정본(`src/content/lines.ts`)에서 `public/voice/manifest.json` 과 `VOICE-SCRIPT.md` 를 만든다.
 * 해시가 달라진 대사는 MP3 를 다시 만들어야 한다는 뜻으로 `stale` 에 적힌다.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { LINES, LINE_IDS, type Line } from '../src/content/lines';

const root = process.cwd();
const dir = path.join(root, 'public', 'voice');
const speakerName = { ilgu: '일구', yeongi: '영이', ungi: '웅이' } as const;

export function spokenText(line: Line): string {
  return line.say ?? line.text;
}

export function textHash(line: Line): string {
  return createHash('sha256').update(spokenText(line)).digest('hex').slice(0, 16);
}

fs.mkdirSync(dir, { recursive: true });
const items = LINE_IDS.map((id) => {
  const line: Line = LINES[id];
  return { id, filename: `${id}.mp3`, speaker: line.speaker, text: spokenText(line), hash: textHash(line) };
});
fs.writeFileSync(
  path.join(dir, 'manifest.json'),
  `${JSON.stringify({ voice: 'Juwonmom', voiceId: 'oZLQ9kHPMuIyd7Ja0YNU', speed: 1.0, items }, null, 2)}\n`,
);

const script = [
  '# V2 음성 대본',
  '',
  '`src/content/lines.ts` 에서 `npm run voice:manifest` 로 만든 문서다. 손으로 고치지 않는다.',
  '목소리는 ElevenLabs `Juwonmom`, Speed `1.0` 이다.',
  '',
  '| 파일 | 말하는 이 | 대사 |',
  '|---|---|---|',
  ...items.map((i) => `| \`${i.filename}\` | ${speakerName[i.speaker]} | ${i.text} |`),
  '',
].join('\n');
fs.writeFileSync(path.join(root, 'VOICE-SCRIPT.md'), script);

const missing = items.filter((i) => !fs.existsSync(path.join(dir, i.filename)));
process.stdout.write(`음성 ${items.length}개, MP3 없음 ${missing.length}개\n`);
