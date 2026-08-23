'use client';

/**
 * 따라하기 안내 덮개.
 *
 * 화면 전체를 어둡게 덮되 지금 눌러야 할 곳만 뚫어 두고, 그 옆에 풍선글을 띄운다.
 * 뚫린 자리는 그대로 눌러 쓸 수 있고, 나머지는 눌리지 않아 헤매지 않는다.
 * 이용자가 할 일을 마치면(방을 그리면, 문을 놓으면) 저절로 다음 안내로 넘어간다.
 */
import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { store, useApp, useModel } from './useStore';
import { CoachContext, CoachStep, canAdvance, isDone, tutorialFor } from '../lib/tutorial';
import { stuckRooms } from '../lib/assist';
import { IconCheck, IconChevron, IconClose } from './Icons';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 6;
const GAP = 14;

function rectOf(target: string): Rect | null {
  const el = document.querySelector(`[data-coach="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** 밝힐 곳들을 하나로 묶은 사각형 */
function measure(target?: string, also?: readonly string[]): Rect | null {
  if (!target) return null;
  const rects = [target, ...(also ?? [])].map(rectOf).filter((r): r is Rect => r !== null);
  if (rects.length === 0) return null;
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0 - PAD, y: y0 - PAD, w: x1 - x0 + PAD * 2, h: y1 - y0 + PAD * 2 };
}

export default function Coach() {
  const app = useApp();
  const { tutorial, level, plan, tool, step, drill } = app;
  const steps = tutorialFor(level);
  const index = Math.min(tutorial.index, steps.length - 1);
  const current: CoachStep | undefined = steps[index];
  const [rect, setRect] = useState<Rect | null>(null);
  const [vw, setVw] = useState(1280);
  const [vh, setVh] = useState(800);

  // 갇힌 방이 있는지는 격자를 봐야 안다. plan 이 바뀔 때만 다시 만든다.
  const { grid } = useModel(plan);
  const ctx: CoachContext = {
    plan,
    tool,
    step,
    drilled: Boolean(drill.state && drill.state.outcome !== 'ongoing'),
    stuck: tutorial.active ? stuckRooms(plan, grid).length : 0,
  };

  /*
   * 안내가 바뀌면 해당 작성 단계로 옮긴다.
   * 이미 그 단계에 있어도 다시 부른다 — 단계에 들어설 때 맞춰 주는 기본값
   * (예: 현관문이 생겼으니 다음 문은 실문)을 다시 적용하기 위해서다.
   */
  useEffect(() => {
    if (!tutorial.active || !current) return;
    if (current.goStep !== undefined) store.setStep(current.goStep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorial.active, index]);

  /* 가리킬 곳의 위치를 계속 따라간다 (패널이 바뀌면 자리도 바뀐다) */
  const alsoKey = (current?.also ?? []).join(',');
  const sync = useCallback(() => {
    setRect(measure(current?.target, current?.also));
    setVw(window.innerWidth);
    setVh(window.innerHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.target, alsoKey]);

  useLayoutEffect(() => {
    if (!tutorial.active) return;
    sync();
    const id = window.setInterval(sync, 240);
    window.addEventListener('resize', sync);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', sync);
    };
  }, [tutorial.active, sync]);

  const close = useCallback((completed: boolean) => store.stopTutorial(completed), []);

  const next = useCallback(() => {
    if (index >= steps.length - 1) close(true);
    else store.coachGoto(index + 1);
  }, [index, steps.length, close]);

  /*
   * 할 일을 마치면 잠깐 뒤 저절로 넘어간다.
   * 의존 목록 없이 매 렌더마다 타이머를 걸면, 위치를 따라가는 재렌더가
   * 타이머를 계속 취소해 영영 넘어가지 않는다. 그래서 '마쳤는지'만 본다.
   */
  const finished = Boolean(current?.wait) && current ? isDone(current, ctx) : false;
  useEffect(() => {
    if (!tutorial.active || !finished) return;
    const t = setTimeout(() => {
      if (store.getState().tutorial.active) next();
    }, 850);
    return () => clearTimeout(t);
  }, [tutorial.active, finished, index, next]);

  /* Esc 로 닫는다 */
  useEffect(() => {
    if (!tutorial.active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tutorial.active, close]);

  if (!tutorial.active || !current) return null;

  const done = finished || isDone(current, ctx);
  const blocked = current.wait ? !canAdvance(current, ctx) : false;
  const big = level === 'elementary';
  const width = big ? 380 : 336;
  const place = current.place ?? (rect ? 'bottom' : 'center');

  /* 풍선글 자리 잡기 */
  let bx = (vw - width) / 2;
  let by = vh / 2 - 110;
  let tail: React.CSSProperties | null = null;

  if (rect && place !== 'center') {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    if (place === 'bottom') {
      bx = cx - width / 2;
      by = rect.y + rect.h + GAP;
      tail = { top: -7, left: '50%', marginLeft: -7 };
    } else if (place === 'top') {
      bx = cx - width / 2;
      by = rect.y - GAP - 190;
      tail = { bottom: -7, left: '50%', marginLeft: -7 };
    } else if (place === 'left') {
      bx = rect.x - GAP - width;
      by = cy - 100;
      tail = { right: -7, top: 92 };
    } else {
      bx = rect.x + rect.w + GAP;
      by = cy - 100;
      tail = { left: -7, top: 92 };
    }
    bx = Math.max(14, Math.min(vw - width - 14, bx));
    by = Math.max(14, Math.min(vh - 230, by));
  }

  const band = (s: React.CSSProperties) => <div className="coach-band" style={s} />;

  return (
    <div className="coach" role="dialog" aria-modal="false" aria-label="따라하기 안내">
      {rect ? (
        <>
          {band({ left: 0, top: 0, width: vw, height: Math.max(0, rect.y) })}
          {band({ left: 0, top: rect.y + rect.h, width: vw, height: Math.max(0, vh - rect.y - rect.h) })}
          {band({ left: 0, top: rect.y, width: Math.max(0, rect.x), height: rect.h })}
          {band({
            left: rect.x + rect.w,
            top: rect.y,
            width: Math.max(0, vw - rect.x - rect.w),
            height: rect.h,
          })}
          <div
            className={`coach-ring${done ? ' done' : ''}`}
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
          />
        </>
      ) : (
        band({ inset: 0 })
      )}

      <div className={`coach-bubble${big ? ' big' : ''}`} style={{ left: bx, top: by, width }}>
        {tail && <i className="coach-tail" style={tail} />}

        <div className="coach-head">
          <span className="coach-count">
            {index + 1} / {steps.length}
          </span>
          <div className="coach-dots" aria-hidden="true">
            {steps.map((s, i) => (
              <i key={s.id} className={i === index ? 'on' : i < index ? 'past' : ''} />
            ))}
          </div>
          <button type="button" className="coach-x" onClick={() => close(false)} aria-label="안내 닫기">
            <IconClose size={14} />
          </button>
        </div>

        <h3>{current.title}</h3>
        <p>{current.body}</p>

        {current.wait && (
          <div className={`coach-todo${done ? ' done' : ''}`}>
            {done ? (
              <>
                <IconCheck size={14} /> 잘했다! 다음으로 넘어간다
              </>
            ) : (
              <>직접 해 보면 다음으로 넘어간다</>
            )}
          </div>
        )}

        <div className="coach-foot">
          <button type="button" className="btn sm" onClick={() => close(false)}>
            그만 보기
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn sm"
            onClick={() => store.coachGoto(index - 1)}
            disabled={index === 0}
          >
            이전
          </button>
          <button type="button" className="btn sm pri" onClick={next} disabled={blocked}>
            {index >= steps.length - 1 ? '마치기' : '다음'}
            {index < steps.length - 1 && <IconChevron size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
}
