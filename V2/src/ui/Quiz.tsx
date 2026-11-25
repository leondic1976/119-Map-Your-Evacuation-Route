/**
 * 5~6학년 OX 문제(대장 #188). 돌아보기의 오른쪽 칸에 뜬다.
 * 점수와 등급을 만들지 않는다 — 문제마다 까닭을 알려 주고, 끝에 다시 볼 것을 세 개까지 보인 뒤
 * 대피지도를 다시 그리러 가게 한다.
 */
import { useState } from 'react';
import type { AidId } from '../core/aids';
import { QUIZ_REVIEW_MAX } from '../core/quiz';
import { AID_NOTE, AID_TEXT, type QuizItem } from '../content/quiz';
import { isVerified } from '../content/sources';
import { enterStep, retryDrill } from '../store/app';
import './quiz.css';

const line = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const };

export const IconO = ({ size = 44 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="15" {...line} strokeWidth={6} /></svg>
);
export const IconX = ({ size = 44 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true"><path d="M9 9l26 26M35 9L9 35" {...line} strokeWidth={6} /></svg>
);
export const IconOx = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true">
    <circle cx="13" cy="22" r="9" {...line} strokeWidth={4.5} />
    <path d="M27 14l14 16M41 14L27 30" {...line} strokeWidth={4.5} />
  </svg>
);

interface Props {
  questions: QuizItem[];
  aids: AidId[];
  needSecond: boolean;
  onClose: () => void;
  onAgain: () => void;
}

export function Quiz({ questions, aids, needSecond, onClose, onAgain }: Props) {
  const [at, setAt] = useState(0);
  const [said, setSaid] = useState<boolean | null>(null);
  const [missed, setMissed] = useState<string[]>([]);
  const q = questions[at];

  if (!q) {
    const again = questions.filter((item) => missed.includes(item.id)).slice(0, QUIZ_REVIEW_MAX);
    return (
      <div className="quiz" data-testid="quiz-end">
        <h3 className="note-head good">문제를 다 풀었어</h3>
        {again.length > 0 ? (
          <>
            <h3 className="note-head next">다시 볼 것</h3>
            <ul className="note-list" data-testid="quiz-again-list">
              {again.map((item) => (
                <li key={item.id}>
                  <span className="note-dot" aria-hidden="true" /> <span>{item.why}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="note-text">대피할 때 할 일을 잘 알고 있어.</p>
        )}
        <h3 className="note-head next">지도에 더 그려 보자</h3>
        <ul className="note-list" data-testid="quiz-map">
          {needSecond && (
            <li><span className="note-dot" aria-hidden="true" /> <span>나가는 길을 하나 더 그려 두자.</span></li>
          )}
          {aids.length === 0 ? (
            <li><span className="note-dot" aria-hidden="true" /> <span>{AID_NOTE.none}</span></li>
          ) : (
            <li><span className="note-dot" aria-hidden="true" /> <span>{aids.map((id) => AID_TEXT[id].label).join(', ')} 자리가 우리 집과 같은지 어른과 확인하자.</span></li>
          )}
        </ul>
        <button type="button" className="big-action" data-testid="quiz-redraw" onClick={() => enterStep('draw')}>대피지도 다시 그리기</button>
        <div className="quiz-row">
          <button type="button" className="tool" data-testid="quiz-retry" onClick={retryDrill}>다시 연습하기</button>
          <button type="button" className="tool" data-testid="quiz-more" onClick={onAgain}>다른 문제 풀기</button>
          <button type="button" className="tool" data-testid="quiz-close" onClick={onClose}>돌아보기로</button>
        </div>
      </div>
    );
  }

  const right = said === q.answer;
  return (
    <div className="quiz" data-testid="quiz" data-at={at} data-id={q.id} data-answer={q.answer ? 'o' : 'x'}>
      <h3 className="note-head next">OX 문제 {at + 1} / {questions.length}</h3>
      <p className="quiz-text" data-testid="quiz-text">{q.text}</p>
      {said === null ? (
        <div className="quiz-ox" role="group" aria-label="맞으면 O, 틀리면 X">
          <button type="button" className="ox-btn o" data-testid="quiz-o" aria-label="맞다 O" onClick={() => answer(true)}><IconO /> 맞다</button>
          <button type="button" className="ox-btn x" data-testid="quiz-x" aria-label="아니다 X" onClick={() => answer(false)}><IconX /> 아니다</button>
        </div>
      ) : (
        <div className="quiz-why" data-testid="quiz-why" data-right={right ? '1' : '0'} role="status">
          <b>{right ? '맞았어!' : `아쉬워. 답은 ${q.answer ? 'O' : 'X'} 야.`}</b>
          <span>{q.why}</span>
          {!isVerified(q.sourceIds) && <small className="unverified">검수 대기</small>}
          <button type="button" className="big-action" data-testid="quiz-next" autoFocus onClick={() => { setSaid(null); setAt(at + 1); }}>
            {at + 1 < questions.length ? '다음 문제' : '다 풀었어'}
          </button>
        </div>
      )}
      <button type="button" className="tool quiz-stop" data-testid="quiz-stop" onClick={onClose}>그만 풀기</button>
    </div>
  );

  function answer(value: boolean): void {
    setSaid(value);
    if (value !== q!.answer) setMissed((list) => [...list, q!.id]);
  }
}
