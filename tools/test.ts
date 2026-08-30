/**
 * 연산 로직 검증 — 화면을 띄우지 않고 도는 것 전부.
 *
 * 이 파일은 틀만 갖고 있고, 실제 항목은 두 묶음에 있다.
 *   logic-tests.ts  콘텐츠·그래프·규칙·위험장·게임·리포트 (설계서 §6.7 정책 시험, §9.3 DoD)
 *   qa-tests.ts     배포 전 점검 — 외부 호출·크기·이모지·죽은 CSS·성능 (M10)
 *
 * 화면까지 눌러 보는 것은 tools/smoke.ts 가 맡는다.
 *
 *   npm test
 */
import { logicTests } from './logic-tests';
import { layoutTests } from './layout-tests';
import { qaTests } from './qa-tests';

/* ------------------------------------------------------------------ */
/* 아주 작은 검증 틀                                                    */
/* ------------------------------------------------------------------ */

let passed = 0;
const failures: string[] = [];
let group = '';

function section(name: string): void {
  group = name;
  process.stdout.write(`\n  ${name}\n`);
}

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    process.stdout.write(`    OK  ${name}\n`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`[${group}] ${name}\n        ${msg}`);
    process.stdout.write(`    X   ${name}  — ${msg}\n`);
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

/* ------------------------------------------------------------------ */

section('연산 로직');
logicTests(check, assert);

section('외곽과 독립실');
layoutTests(check, assert);

section('배포 전 점검');
qaTests(check, assert);

/* ------------------------------------------------------------------ */

const total = passed + failures.length;
process.stdout.write(`\n  ${passed}/${total} 항목 통과\n`);
if (failures.length) {
  process.stdout.write(`\n실패 ${failures.length}건:\n${failures.map((f) => `  - ${f}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('\n  전 항목 통과\n\n');
