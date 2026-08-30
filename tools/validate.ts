/**
 * 어린이 화면 콘텐츠 검증 게이트 — docs/DESIGN-v1.0.md §3.6.
 *
 *   npm run validate          개발 모드. 출처 미검수는 경고, 구조 오류만 실패
 *   npm run validate:strict   배포 모드. 출처 미검수도 실패
 *
 * 배포 워크플로는 아직 개발 모드로 돈다. 소방청 1차 자료 대조가 끝나
 * sources.json 의 verified 가 모두 true 가 되면 strict 로 바꾼다.
 */
import { validateContent } from '../src/content/validate';

const strict = process.argv.includes('--strict');
const r = validateContent(strict);

process.stdout.write(`\n  콘텐츠 검증 (${strict ? '배포' : '개발'} 모드)\n\n`);
for (const w of r.warnings) process.stdout.write(`    경고  ${w}\n`);
for (const e of r.errors) process.stdout.write(`    오류  ${e}\n`);
process.stdout.write(`\n  오류 ${r.errors.length}건 · 경고 ${r.warnings.length}건\n\n`);

if (r.errors.length) process.exit(1);
