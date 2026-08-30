'use client';

/**
 * 시작 안내 — docs/DESIGN-v1.1-changes.md §2.5 의 1·2단계 (집 모양 고르기, 1층·반지하 물음).
 * 3~5단계(내 방 누르기, 만나는 곳, 시작)는 도면 위에서 캐릭터가 이끈다.
 * 어느 화면에서도 나가는 길이 있어야 한다 (P3). 닫기와 Esc 를 둔다.
 */
import React, { useEffect, useState } from 'react';
import { TEMPLATES } from '../content';
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
  const [page, setPage] = useState<'template' | 'floor'>('template');
  const easy = profile.gradeMode === 'easy';

  useEffect(() => {
    if (open) setPage(step === 'lowFloor' ? 'floor' : 'template');
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pick = (id: string | null) => {
    if (id) loadTemplate(id);
    else {
      if (hasPlan) resetAll();
      if (!onboarded) setStep('lowFloor');
    }
    if (onboarded) onClose();
    else setPage('floor');
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
            <p className="k-note">{easy ? '고른 다음에 방을 옮기고 늘리면서 우리 집처럼 바꾸면 돼. 백지에서 시작하지 않아도 돼.' : '고른 뒤 방을 옮기고 크기를 바꿔 우리 집에 맞춘다.'}</p>
            <div className="k-tmpl-grid">
              {TEMPLATES.map((t) => (
                <button key={t.id} type="button" className="k-tmpl" data-template={t.id} onClick={() => pick(t.id)}>
                  <span className="k-tmpl-art">
                    <PlanSvg plan={t.plan} routePair={undefined} showSlots={[]} style="kid" gradeMode={profile.gradeMode} showGrid={false} />
                  </span>
                  <b>{t.label}</b>
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
            </div>
          </>
        ) : (
          <>
            <header>
              <h2 id="k-onboard-title">{easy ? '너희 집은 1층이나 반지하야?' : '1층 또는 반지하에 사는가?'}</h2>
              <button type="button" className="k-x" onClick={onClose} aria-label="닫기">
                <CloseIcon />
              </button>
            </header>
            <p className="k-note">{easy ? '물이 찰 때 어디로 가야 하는지가 달라져. 잘 모르면 어른께 여쭤봐도 돼.' : '침수 때 대피 방향이 달라진다. 이 값만 침수 규칙 분기에 쓰인다.'}</p>
            <div className="k-choice">
              <button
                type="button"
                className="k-big"
                data-lowfloor="yes"
                onClick={() => {
                  finishOnboarding(true);
                  onClose();
                }}
              >
                {easy ? '응' : '예 — 1층·반지하'}
              </button>
              <button
                type="button"
                className="k-big"
                data-lowfloor="no"
                onClick={() => {
                  finishOnboarding(false);
                  onClose();
                }}
              >
                {easy ? '아니야' : '아니오 — 2층 이상'}
              </button>
            </div>
            <button type="button" className="k-link" onClick={() => setPage('template')}>
              {easy ? '← 다른 모양 고르기' : '← 평면 다시 고르기'}
            </button>
          </>
        )}
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
