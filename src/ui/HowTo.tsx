'use client';

/**
 * 그리기 사용법 — 도면 오른쪽 칸.
 *
 * 도면 위에 띠로 띄우던 선택 안내("골랐어. 끌어서 옮기고…")를 걷어내고 이리로 옮겼다.
 * 도면을 가리지 않고, 글자가 크고, 지금 고른 도구에 맞는 것만 보인다.
 * 챗봇이 아니다 — 고정된 문장을 지금 상태에 맞춰 고르기만 한다 (CLAUDE.md §9-2).
 */
import React from 'react';
import { blockName } from '../content';
import { isOpening, isRoom } from '../types/plan';
import { useKids } from '../store/kidsStore';

interface Row {
  title: string;
  body: string;
}

export default function HowTo() {
  const tool = useKids((s) => s.tool);
  const armed = useKids((s) => s.armed);
  const step = useKids((s) => s.step);
  const mode = useKids((s) => s.mode);
  const selection = useKids((s) => s.selection);
  const plan = useKids((s) => s.plan);
  const easy = useKids((s) => s.profile.gradeMode === 'easy');
  const open = useKids((s) => s.howTo);
  const setOpen = useKids((s) => s.setHowTo);

  if (mode !== 'edit') return null;

  const sel = selection ? plan.blocks.find((b) => b.id === selection) : undefined;
  const rows: Row[] = [];

  if (step === 'mySpot') {
    rows.push({ title: easy ? '네 방을 눌러 줘' : '내 자리 정하기', body: easy ? '네가 잠자는 방 안을 한 번 누르면 돼.' : '취침하는 방 안의 칸을 누른다.' });
  } else if (step === 'meeting') {
    rows.push({ title: easy ? '만나는 곳을 놓자' : '집결지 정하기', body: easy ? '집 밖 빈 곳을 눌러. 나중에 정해도 돼.' : '도면 밖 빈 칸을 누른다. 건너뛸 수 있다.' });
  } else if (tool === 'place' && armed) {
    const name = blockName(armed.id, easy ? 'easy' : 'normal');
    rows.push(
      armed.category === 'room'
        ? { title: `${name} 놓기`, body: easy ? '도면을 한 번 누르면 놓여. 끌면 크기를 정할 수 있어.' : '클릭하면 표준 크기로, 드래그하면 그 크기로 놓인다.' }
        : armed.category === 'opening'
          ? { title: `${name} 놓기`, body: easy ? '방의 벽을 눌러. 벽 가까이여야 해.' : '방 경계선(벽면) 위에만 놓인다.' }
          : { title: `${name} 놓기`, body: easy ? '놓고 싶은 칸을 한 번 누르자.' : '셀 가운데에 놓인다.' },
    );
  } else if (tool === 'route') {
    rows.push({ title: easy ? '나가는 길 긋기' : '피난경로 작도', body: easy ? '네 방에서 시작해 현관까지 끌어서 이어 줘.' : '출발 칸부터 종점까지 끌어서 잇는다. 되짚으면 지워진다.' });
  } else if (tool === 'erase') {
    rows.push({ title: easy ? '지우개' : '삭제', body: easy ? '지우고 싶은 것을 누르면 사라져.' : '클릭한 블록이 삭제된다.' });
  } else {
    rows.push({ title: easy ? '고르기' : '선택', body: easy ? '방을 끌어 옮기고, 모서리를 끌어 크기를 바꿔.' : '드래그로 이동, 모서리 핸들로 크기 변경.' });
  }

  /* 문·창은 누를 때마다 여닫힌다 — 늘 알려 준다 */
  rows.push({
    title: easy ? '문 여닫기' : '개구부 개폐',
    body: easy ? '문이나 창을 누르면 열리고, 또 누르면 닫혀.' : '개구부를 클릭할 때마다 평소 상태가 뒤집힌다.',
  });

  if (sel && isRoom(sel)) {
    rows.push({ title: easy ? '고른 방' : '선택한 방', body: easy ? '끌어서 옮기고, Delete 로 지운다.' : '드래그로 이동, Delete 로 삭제.' });
  } else if (sel && isOpening(sel)) {
    rows.push(
      sel.openingKind === 'open_passage'
        ? { title: easy ? '고른 트인 곳' : '선택한 트인 통로', body: easy ? '문이 아니라 벽이 없는 곳이야. 언제나 지나갈 수 있어.' : '문짝과 개폐 상태가 없는 상시 개방 통로다.' }
        : { title: easy ? '고른 문' : '선택한 개구부', body: sel.closedByDefault ? (easy ? '지금은 평소 닫아 두는 문이야.' : '평소 닫힘 상태다.') : easy ? '지금은 평소 열어 두는 문이야.' : '평소 열림 상태다.' },
    );
  }

  rows.push({ title: easy ? '되돌리기' : '실행 취소', body: 'Ctrl+Z · 마우스가 없으면 Tab 으로 도면에 들어가 방향키와 Enter 를 쓴다.' });

  return (
    <aside className={`k-howto${open ? '' : ' collapsed'}`} aria-label="그리기 사용법" data-coach="kids-howto">
      <header>
        <b>{easy ? '어떻게 해?' : '그리기 사용법'}</b>
        <button type="button" className="k-tb sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? '접기' : '펴기'}
        </button>
      </header>
      {open && (
        <ul>
          {rows.map((r) => (
            <li key={r.title}>
              <b>{r.title}</b>
              <span>{r.body}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
