'use client';

/**
 * 도움 패널 — 도면 오른쪽 칸 (설계서 v2.0 §3).
 *
 *   지금 할 일   단계마다 무엇을 · 왜
 *   이게 뭐야?   팔레트에 올리거나 고른 물건의 설명 — 이게 뭐야 · 왜 그려 · 어떻게 놓아
 *   조작법       지금 도구에 맞는 손놀림
 *   어른과 함께  선생님·보호자가 옆에서 봐 줄 것 (지도감독)
 *
 * 챗봇이 아니다 — 고정된 문장을 지금 상태에 맞춰 고르기만 한다 (작업지침 §10-2).
 * 화면에만 보이고 읽지 않으므로 MP3 대상이 아니다.
 */
import React, { useEffect } from 'react';
import { BLOCKS, blockName } from '../content';
import { STEP_HELP, blockHelp } from '../content/blockHelp';
import { isOpening, isPoint, isRoom } from '../types/plan';
import { useKids } from '../store/kidsStore';

export default function HelpPanel({ onGuardian }: { onGuardian: () => void }) {
  const tool = useKids((s) => s.tool);
  const armed = useKids((s) => s.armed);
  const step = useKids((s) => s.step);
  const mode = useKids((s) => s.mode);
  const selection = useKids((s) => s.selection);
  const peek = useKids((s) => s.peekBlock);
  const plan = useKids((s) => s.plan);
  const easy = useKids((s) => s.profile.gradeMode === 'easy');
  const open = useKids((s) => s.howTo);
  const setOpen = useKids((s) => s.setHowTo);
  /* 좁은 창(1024 미만)으로 들어오거나 줄이면 한 번 접는다 — 도면이 먼저다. 펴면 서랍처럼 덮는다 */
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(max-width: 1023px)');
    const fold = () => {
      if (query.matches) useKids.getState().setHowTo(false);
    };
    fold();
    query.addEventListener('change', fold);
    return () => query.removeEventListener('change', fold);
  }, []);
  const g = easy ? 'easy' : 'normal';

  if (mode !== 'edit') return null;

  const stepKey = step in STEP_HELP ? step : 'edit';
  const stepHelp = STEP_HELP[stepKey];

  /* 설명할 물건 — 팔레트에 올린 것 > 장전한 것 > 도면에서 고른 것 */
  const sel = selection ? plan.blocks.find((b) => b.id === selection) : undefined;
  const focusId = peek ?? (armed ? (armed.roomMode === 'zone' && armed.id === 'kitchen' ? 'kitchen_open' : armed.id) : sel ? (isRoom(sel) ? (sel.wallMode === 'zone' && sel.roomKind === 'kitchen' ? 'kitchen_open' : sel.roomKind) : isOpening(sel) ? sel.openingKind : isPoint(sel) ? sel.subKind : null) : null);
  const focusDef = focusId === 'kitchen_open' ? BLOCKS.find((b) => b.id === 'kitchen') : focusId ? BLOCKS.find((b) => b.id === focusId) : undefined;
  const focusHelp = focusId && focusDef ? blockHelp(focusId, focusDef.category) : null;
  const focusName = focusId === 'kitchen_open' ? (easy ? '트인 주방' : '트인 주방(부엌)') : focusDef ? blockName(focusDef.id, easy ? 'easy' : 'normal') : '';
  const focusFrom = peek ? (easy ? '올려 둔 것' : '가리킨 항목') : armed ? (easy ? '고른 것' : '장전한 항목') : sel ? (easy ? '도면에서 고른 것' : '선택한 블록') : '';

  /* 조작법 — 도구와 고른 것에 맞는 손놀림 */
  const moves: { title: string; body: string }[] = [];
  if (tool === 'route') {
    moves.push({ title: easy ? '길 긋기' : '경로 작도', body: easy ? '내 자리에서 시작해 현관문까지 끌어서 이어. 뒤로 되짚으면 지워져.' : '출발 칸부터 종점까지 끌어서 잇는다. 되짚으면 지워진다.' });
  } else if (tool === 'erase') {
    moves.push({ title: easy ? '지우기' : '삭제', body: easy ? '지우고 싶은 것을 누르면 사라져. 잘못 지웠으면 되돌리기!' : '클릭한 블록이 삭제된다. Ctrl+Z 로 되돌린다.' });
  } else if (tool === 'place' && armed) {
    moves.push({ title: easy ? '놓기' : '배치', body: armed.category === 'room' ? (armed.roomMode === 'zone' ? (easy ? '거실 바닥에서 끌어 범위를 그려.' : '열린 바닥에서 드래그해 범위를 지정한다.') : easy ? '빈 곳을 누르면 놓여. 끌면 그 크기로.' : '클릭하면 표준 크기, 드래그하면 그 크기다.') : armed.category === 'opening' ? (easy ? '방의 벽을 눌러.' : '실 경계선을 클릭한다.') : easy ? '놓을 칸을 눌러.' : '칸을 클릭한다.' });
  } else {
    moves.push({ title: easy ? '옮기기' : '이동', body: easy ? '방 안쪽을 끌면 옮겨져. 문·창·가구도 함께 가.' : '실 내부를 드래그해 이동한다. 부속 블록이 함께 이동한다.' });
    moves.push({ title: easy ? '크기 바꾸기' : '크기 조정', body: easy ? '방을 누른 뒤 테두리 점을 끌어.' : '선택 후 8방향 손잡이를 드래그한다.' });
  }
  moves.push({ title: easy ? '문 여닫기' : '개폐', body: easy ? '문이나 창을 누르면 열리고, 또 누르면 닫혀.' : '개구부를 클릭할 때마다 평소 상태가 뒤집힌다.' });
  moves.push({ title: easy ? '여럿 고르기' : '다중 선택', body: easy ? 'Ctrl 을 누른 채 누르거나, 빈 곳에서 끌어 네모로 둘러.' : 'Ctrl+클릭 또는 빈 곳에서 드래그해 둘러 고른다.' });
  moves.push({ title: easy ? '되돌리기' : '실행 취소', body: easy ? 'Ctrl+Z. 위쪽 되돌리기 단추도 같아.' : 'Ctrl+Z · Ctrl+Shift+Z.' });
  moves.push({ title: easy ? '마우스 없이' : '키보드', body: easy ? 'Tab 으로 도면에 들어가 방향키로 칸을 옮기고 Enter.' : 'Tab 으로 도면 초점, 방향키 이동, Enter 선택.' });

  return (
    <aside className={`k-help${open ? '' : ' collapsed'}`} aria-label="도움" data-coach="kids-howto">
      <header>
        <b>{easy ? '도움' : '도움말'}</b>
        <button type="button" className="k-help-toggle" onClick={() => setOpen(!open)} aria-expanded={open} title={open ? '도움 패널 접기' : '도움 패널 펴기'}>
          {open ? '접기' : '펴기'}
        </button>
      </header>
      {open && (
        <div className="k-help-body">
          <section className="k-help-now" data-help-section="now">
            <h3>{easy ? '지금 할 일' : '현재 단계'}</h3>
            <b>{stepHelp.title[g]}</b>
            <p>{stepHelp.todo[g]}</p>
            <p className="k-help-why"><span>{easy ? '왜?' : '이유'}</span> {stepHelp.why[g]}</p>
          </section>

          <section className="k-help-what" data-help-section="what" aria-live="polite">
            <h3>{easy ? '이게 뭐야?' : '항목 설명'}</h3>
            {focusHelp ? (
              <>
                <b>
                  {focusName} <small>{focusFrom}</small>
                </b>
                <dl>
                  <dt>{easy ? '뭐야' : '정의'}</dt>
                  <dd>{focusHelp.what[g]}</dd>
                  <dt>{easy ? '왜 그려' : '이유'}</dt>
                  <dd>{focusHelp.why[g]}</dd>
                  <dt>{easy ? '어떻게' : '방법'}</dt>
                  <dd>{focusHelp.how[g]}</dd>
                </dl>
              </>
            ) : (
              <p className="k-help-empty">{easy ? '왼쪽 칸에 마우스를 올리면 그게 뭔지 알려 줄게.' : '팔레트 항목에 올리면 설명이 나온다.'}</p>
            )}
          </section>

          <details className="k-help-moves" data-help-section="moves">
            <summary>{easy ? '어떻게 해? 손놀림 보기' : '조작법 보기'}</summary>
            <ul>
              {moves.map((m) => (
                <li key={m.title}>
                  <b>{m.title}</b>
                  <span>{m.body}</span>
                </li>
              ))}
            </ul>
          </details>

          <details className="k-help-guardian" data-help-section="guardian">
            <summary>어른과 함께 볼 것</summary>
            <p>{stepHelp.guardian}</p>
            <button type="button" className="k-link" onClick={onGuardian} data-coach="kids-guardian-open">
              선생님·보호자 안내 전체 보기
            </button>
          </details>
        </div>
      )}
    </aside>
  );
}
