/**
 * OX 문제 고르기(대장 #188). 점수를 세지 않는다 — 어떤 문제를 낼지만 정한다.
 * 먼저 이번 연습에서 다시 볼 주제를 하나씩 넣고, 남는 자리는 판마다 돌아가며 채운다. 문장은 콘텐츠에 있다.
 */
export interface QuizMeta {
  id: string;
  topic: string;
}

export const QUIZ_COUNT = 6;

/** 틀린 문제에서 다시 볼 것 — 세 개까지 */
export const QUIZ_REVIEW_MAX = 3;

export function pickQuiz(all: QuizMeta[], want: string[], round: number, count = QUIZ_COUNT): string[] {
  const picked: string[] = [];
  if (all.length === 0) return picked;
  const take = (q: QuizMeta | undefined): void => {
    if (q && picked.length < count && !picked.includes(q.id)) picked.push(q.id);
  };
  const turn = Math.abs(Math.trunc(round));
  // 같은 주제의 문제가 여럿이면 판마다 다른 것을 낸다
  for (const topic of want) {
    const same = all.filter((q) => q.topic === topic);
    if (same.length > 0) take(same[turn % same.length]);
  }
  for (let i = 0; i < all.length; i++) take(all[(i * 5 + turn * 3) % all.length]);
  for (const q of all) take(q);
  return picked;
}
