'use client';

/**
 * 처음 안내 투어 — 편집 화면에 처음 들어온 아이에게 화면의 자리를 하나씩 비춰 준다 (설계서 v2.0 §9).
 *
 *   비추기   그 자리에 밝은 테두리, 나머지는 어둡게. 어두운 곳은 눌러도 되고, 누르면 안내가 걷힌다 — 해 보는 것이 먼저다.
 *   카드     한 줄 제목 · 두 줄 설명 · 「다음」 · 「건너뛰기」. Enter·→ 다음, Esc 닫기.
 *   자리     data-coach 표지(또는 선택자)로 찾는다. 지금 화면에 없는 자리는 건너뛴다.
 *   언제     이름표·집 모양을 고른 뒤 편집 화면에 처음 들어왔을 때 한 번. 설정 메뉴·사용법의 「처음 안내 다시 보기」로 언제든.
 *
 * 챗봇이 아니다 — 고정된 문장이다. 화면 글이라 MP3 대상이 아니다.
 */
import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';

export interface TourStep {
  /** data-coach 값 또는 CSS 선택자(점·대괄호로 시작) */
  target: string;
  title: { easy: string; normal: string };
  body: { easy: string; normal: string };
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: 'kids-palette',
    title: { easy: '놓을 것은 전부 여기', normal: '팔레트' },
    body: { easy: '방, 문과 창, 가구와 가전, 안전 물건이 다 있어. 누르면 골라지고, 도면을 누르면 놓여.', normal: '방·개구부·가구·안전설비를 고른다. 클릭해 장전하고 도면을 클릭해 놓는다.' },
  },
  {
    target: '.k-tools',
    title: { easy: '세 가지 도구', normal: '도구' },
    body: { easy: '고르기로 옮기고 크기를 바꿔. 나가는 길로 길을 긋고, 지우개로 지워.', normal: '선택·이동·크기, 피난경로 작도, 삭제.' },
  },
  {
    target: '.k-canvas-wrap',
    title: { easy: '여기가 우리 집', normal: '도면' },
    body: { easy: '고른 것을 여기 눌러 놓아. 방은 안쪽을 끌어 옮기고, 테두리 점을 끌면 크기가 바뀌어. 잘못하면 되돌리기!', normal: '클릭해 놓고, 드래그로 이동하고, 손잡이로 크기를 바꾼다. Ctrl+Z 로 되돌린다.' },
  },
  {
    target: 'kids-howto',
    title: { easy: '모르면 여기를 봐', normal: '도움 패널' },
    body: { easy: '지금 할 일이 적혀 있어. 왼쪽 칸에 마우스를 올리면 그게 뭔지, 왜 그리는지, 어떻게 놓는지 알려 줘.', normal: '현재 단계·항목 설명·조작법·보호자 지도 포인트가 늘 보인다.' },
  },
  {
    target: 'kids-help',
    title: { easy: '뭘 해야 할지 모르겠으면', normal: '다음 할 일' },
    body: { easy: '이 단추를 누르면 캐릭터가 지금 할 일을 말로 알려 줘.', normal: '캐릭터가 현재 단계의 할 일을 음성으로 안내한다.' },
  },
  {
    target: 'kids-start-game',
    title: { easy: '지도가 다 되면', normal: '대피 연습' },
    body: { easy: '불이 난 집에서 나가는 연습을 해 봐. 끝나면 잘한 점과 고칠 점을 알려 주고, 3D 로 다시 볼 수 있어.', normal: '시뮬레이션을 시작한다. 결과와 3D 리플레이가 이어진다.' },
  },
  {
    target: 'kids-settings',
    title: { easy: '설정은 여기', normal: '설정' },
    body: { easy: '글 수준, 집 모양 바꾸기, 처음부터 다시, 이 안내 다시 보기가 여기 있어.', normal: '이용 수준·게임 방식·도면 모양·평면 변경·초기화·안내 다시 보기.' },
  },
];

interface Props {
  easy: boolean;
  onClose: () => void;
}

function find(target: string): HTMLElement | null {
  const selector = /^[.\[#]/.test(target) ? target : `[data-coach="${target}"]`;
  const el = document.querySelector(selector);
  return el instanceof HTMLElement ? el : null;
}

export default function CoachTour({ easy, onClose }: Props) {
  /* 지금 화면에 있는 자리만 */
  const [steps] = useState(() => TOUR_STEPS.filter((s) => find(s.target)));
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[index];
  const g = easy ? 'easy' : 'normal';

  const measure = useCallback(() => {
    if (!step) return;
    const el = find(step.target);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    setRect(el.getBoundingClientRect());
  }, [step]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const next = useCallback(() => {
    if (index + 1 >= steps.length) onClose();
    else setIndex(index + 1);
  }, [index, steps.length, onClose]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  /* Enter·→ 다음, ← 이전, Esc 닫기. 카드 밖을 누르면 — 해 보려는 것이니 걷힌다 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('[data-coach="kids-tour"]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, [next, back, onClose]);

  if (!step || steps.length === 0) return null;

  const pad = 6;
  const spot = rect
    ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : { left: window.innerWidth / 2 - 10, top: window.innerHeight / 2 - 10, width: 20, height: 20 };
  /* 카드 자리 — 오른쪽에 자리가 있으면 오른쪽, 아니면 아래, 그래도 없으면 위 */
  const cardW = 360;
  const cardH = 230;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = spot.left + spot.width + 14;
  let top = spot.top;
  if (left + cardW > vw - 12) {
    left = Math.min(Math.max(12, spot.left), vw - cardW - 12);
    top = spot.top + spot.height + 14;
    if (top + cardH > vh - 12) top = Math.max(12, spot.top - cardH - 14);
  }
  top = Math.min(Math.max(12, top), Math.max(12, vh - cardH - 12));

  return (
    <div className="k-tour" role="dialog" aria-modal="false" aria-labelledby="k-tour-title" data-coach="kids-tour" data-tour-step={index + 1}>
      <div className="k-tour-spot" style={spot} aria-hidden="true" />
      <div className="k-tour-card" style={{ left, top, width: cardW }}>
        <p className="k-tour-count">
          {easy ? '처음 안내' : '화면 안내'} {index + 1} / {steps.length}
        </p>
        <h2 id="k-tour-title">{step.title[g]}</h2>
        <p>{step.body[g]}</p>
        <div className="k-tour-actions">
          <button type="button" className="k-tour-skip" onClick={onClose} data-coach="kids-tour-skip">
            {easy ? '그냥 해 볼래' : '건너뛰기'}
          </button>
          {index > 0 && (
            <button type="button" className="k-tour-back" onClick={back} aria-label="이전 안내">
              이전
            </button>
          )}
          <button type="button" className="k-tour-next" onClick={next} data-coach="kids-tour-next" autoFocus>
            {index + 1 >= steps.length ? (easy ? '시작하자!' : '시작') : '다음'}
          </button>
        </div>
        <ol className="k-tour-dots" aria-hidden="true">
          {steps.map((s, i) => (
            <li key={s.target} className={i === index ? 'on' : i < index ? 'done' : ''} />
          ))}
        </ol>
      </div>
    </div>
  );
}
