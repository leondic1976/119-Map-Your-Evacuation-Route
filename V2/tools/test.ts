/** 검증 틀 — 로직과 배포 전 점검을 차례로 돌린다 */
import { runLogicTests } from './logic-tests';
import { runQaTests } from './qa-tests';

let passed = 0;
const failures: string[] = [];

export type Check = (name: string, fn: () => void) => void;

const check: Check = (name, fn) => {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failures.push(`${name}\n    ${err instanceof Error ? err.message : String(err)}`);
  }
};

runLogicTests(check);
runQaTests(check);

process.stdout.write(`\n  통과 ${passed} · 실패 ${failures.length}\n`);
for (const f of failures) process.stdout.write(`\n  실패: ${f}\n`);
if (failures.length) process.exit(1);
