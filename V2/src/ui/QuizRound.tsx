/**
 * OX 문제 한 판(대장 #188) — 5~6학년이 「OX 문제로 확인하기」를 누를 때 받는다.
 * 문제 글이 첫 묶음을 키우지 않게 돌아보기와 나누어 둔다.
 */
import { useMemo } from 'react';
import type { AidId } from '../core/aids';
import { pickQuiz } from '../core/quiz';
import { FIX_TOPIC, QUIZ } from '../content/quiz';
import { Quiz } from './Quiz';

interface Props {
  /** 몇 번째 판인가. 판마다 다른 문제가 나온다 */
  round: number;
  /** 이번 연습에서 「다음에 해 볼 것」 */
  fixes: string[];
  aids: AidId[];
  needSecond: boolean;
  onClose: () => void;
  onAgain: () => void;
}

export default function QuizRound({ round, fixes, aids, needSecond, onClose, onAgain }: Props) {
  const questions = useMemo(() => {
    const want = [...fixes.map((f) => FIX_TOPIC[f]!), 'aids', 'plan'];
    return pickQuiz(QUIZ, want, round).map((id) => QUIZ.find((q) => q.id === id)!);
  }, [fixes, round]);
  return <Quiz key={round} questions={questions} aids={aids} needSecond={needSecond} onClose={onClose} onAgain={onAgain} />;
}
