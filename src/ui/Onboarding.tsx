'use client';

/**
 * 시작 안내 — docs/DESIGN-v1.1-changes.md §2.5 의 1·2단계 (집 모양 고르기, 1층·반지하 물음).
 * 3~5단계(내 방 누르기, 만나는 곳, 시작)는 도면 위에서 캐릭터가 이끈다.
 * 어느 화면에서도 나가는 길이 있어야 한다 (P3). 닫기와 Esc 를 둔다.
 */
import React, { useEffect, useState } from 'react';
import { FALLBACK_TEMPLATE_ID, TEMPLATES, templateName } from '../content';
import { useKids } from '../store/kidsStore';
import { PlanSvg } from './PlanSvg';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function Onboarding({ open, onClose }: Props) {
  const step = useKids((s) => s.step);
  const onboarded = useKids((s) => s.onboarded);
  const hasPlan = useKids((s) => s.plan.blocks.length > 0);
  const profile = useKids((s) => s.profile);
  const loadTemplate = useKids((s) => s.loadTemplate);
  const finishOnboarding = useKids((s) => s.finishOnboarding);
  const resetAll = useKids((s) => s.resetAll);
  const setStep = useKids((s) => s.setStep);
  const [page] = useState<'template'>('template');
  const easy = profile.gradeMode === 'easy';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  /*
   * 집 모양을 고르면 곧바로 시작한다.
   * 1층·반지하 물음은 침수 규칙에만 쓰였는데 기본판이 화재 한 종이라 지웠다
   * (설계서 v1.6 §2). 온보딩이 한 걸음 짧아진다.
   */
  const pick = (id: string | null) => {
    if (id) loadTemplate(id);
    else {
      if (hasPlan) resetAll();
      if (!onboarded) finishOnboarding(false);
    }
    onClose();
  };

  return (
    <div className="k-modal-back" onClick={onClose} role="presentation">
      <div className="k-modal k-onboard" role="dialog" aria-modal="true" aria-labelledby="k-onboard-title" onClick={(e) => e.stopPropagation()}>
        {page === 'template' ? (
          <>
            <header>
              <h2 id="k-onboard-title">{easy ? '너희 집이랑 제일 비슷한 걸 골라볼래?' : '시작할 평면을 고른다'}</h2>
              <button type="button" className="k-x" onClick={onClose} aria-label="닫기">
                <CloseIcon />
              </button>
            </header>
            {/* 「잘 모르겠어」는 맨 뒤라 스크롤해야 보인다. 여기서 한 번 짚어 준다 (설계서 v1.3 §2.2) */}
            <p className="k-note">
              {easy
                ? '고른 다음에 방을 옮기고 늘리면서 우리 집처럼 바꾸면 돼. 잘 모르겠으면 맨 아래 「잘 모르겠어」를 눌러.'
                : '고른 뒤 방을 옮기고 크기를 바꿔 우리 집에 맞춘다. 모르겠으면 맨 아래 「모르겠다」를 고른다.'}
            </p>
            <div className="k-tmpl-grid">
              {TEMPLATES.map((t) => (
                <button key={t.id} type="button" className="k-tmpl" data-template={t.id} onClick={() => pick(t.id)}>
                  <span className="k-tmpl-art">
                    <PlanSvg plan={t.plan} routePair={undefined} showSlots={[]} style="kid" gradeMode={profile.gradeMode} showGrid={false} />
                  </span>
                  <b>{templateName(t, profile.gradeMode)}</b>
                  <small>{t.hint}</small>
                </button>
              ))}
              <button type="button" className="k-tmpl empty" data-template="blank" onClick={() => pick(null)}>
                <span className="k-tmpl-art">
                  <svg viewBox="0 0 120 80" width="100%" height="100%" aria-hidden="true">
                    <rect x={4} y={4} width={112} height={72} rx={6} fill="#fbfbf7" stroke="#c8d0da" strokeDasharray="6 4" strokeWidth={2} />
                    <path d="M60 26 v28 M46 40 h28" stroke="#98a4b3" strokeWidth={4} strokeLinecap="round" />
                  </svg>
                </span>
                <b>{easy ? '직접 그릴래요' : '빈 도면'}</b>
                <small>{easy ? '처음부터 내가 그릴래.' : '방부터 직접 그린다.'}</small>
              </button>
              {/*
               * 모르는 아이를 백지로 보내지 않는다 (설계서 v1.3 §2.2).
               * 되묻지 않고 가장 흔한 모양을 실어 준다 — 한 번 누르면 끝난다.
               * 맨 뒤에 두는 것도 규칙이다. 앞에 두면 맞는 것을 찾아보지도 않고 누른다.
               */}
              <button type="button" className="k-tmpl empty" data-template="unsure" onClick={() => pick(FALLBACK_TEMPLATE_ID)}>
                <span className="k-tmpl-art">
                  <svg viewBox="0 0 120 80" width="100%" height="100%" aria-hidden="true">
                    <rect x={4} y={4} width={112} height={72} rx={6} fill="#fbfbf7" stroke="#c8d0da" strokeDasharray="6 4" strokeWidth={2} />
                    <path
                      d="M52 34a8 8 0 1 1 11 7.5c-2 1-3 2.5-3 4.5v2"
                      fill="none"
                      stroke="#98a4b3"
                      strokeWidth={4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx={60} cy={55} r={2.6} fill="#98a4b3" />
                  </svg>
                </span>
                <b>{easy ? '잘 모르겠어' : '모르겠다'}</b>
                <small>
                  {easy
                    ? '제일 흔한 모양으로 시작할게. 나중에 바꿀 수 있어. 집에 가서 어른께 여쭤봐도 돼.'
                    : '가장 흔한 방 두 개 아파트로 시작한다. 나중에 바꿀 수 있다.'}
                </small>
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
