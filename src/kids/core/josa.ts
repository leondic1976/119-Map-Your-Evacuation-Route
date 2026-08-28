/**
 * 조사 고르기 — "아파트을(를)" 처럼 괄호를 붙여 놓던 것을 없앤다.
 *
 * 앞 글자에 받침이 있는지로 갈린다. 한글 음절은 0xAC00 부터 28 개씩 묶여 있어
 * (코드 - 0xAC00) % 28 이 0 이면 받침이 없다.
 *
 * 한글이 아닌 글자(숫자·영문)로 끝나면 받침을 알 수 없다. 이 앱의 이름표는 모두
 * 한글이라 실제로 걸리지 않지만, 그런 때는 받침이 없는 쪽을 쓴다.
 * 화면 무관 순수 함수다 (CLAUDE.md §9-4).
 */

/** 마지막 글자에 받침이 있는가 */
export function hasFinalConsonant(word: string): boolean {
  const ch = word.trim().slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/** 받침에 맞는 조사를 고른다. `withFinal` 은 받침이 있을 때 쓸 것이다 */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  return hasFinalConsonant(word) ? withFinal : withoutFinal;
}

/** 낱말 뒤에 조사를 붙여 돌려준다 — `eul('아파트')` → `'아파트를'` */
export function eul(word: string): string {
  return `${word}${josa(word, '을', '를')}`;
}

/** `i('소화기')` → `'소화기가'` */
export function i(word: string): string {
  return `${word}${josa(word, '이', '가')}`;
}

/** `eun('현관문')` → `'현관문은'` */
export function eun(word: string): string {
  return `${word}${josa(word, '은', '는')}`;
}
