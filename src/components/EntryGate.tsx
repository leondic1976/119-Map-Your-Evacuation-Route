'use client';

/**
 * 첫 화면 — 누가 쓰는지 고른다.
 *
 *   초등학생 이하 → 어린이 화면(src/kids)
 *   중고생·일반   → 지금까지의 작성 화면(AppShell)
 *
 * 고른 것은 브라우저에 남겨 다음에는 바로 들어간다. 두 화면 모두 "첫 화면" 단추로 돌아온다.
 */
import React, { useEffect } from 'react';

export type Audience = 'kids' | 'general';

export const AUDIENCE_KEY = 'evac-audience-v1';

export function loadAudience(): Audience | null {
  try {
    const v = window.localStorage.getItem(AUDIENCE_KEY);
    return v === 'kids' || v === 'general' ? v : null;
  } catch {
    return null;
  }
}

export function saveAudience(a: Audience | null): void {
  try {
    if (a) window.localStorage.setItem(AUDIENCE_KEY, a);
    else window.localStorage.removeItem(AUDIENCE_KEY);
  } catch {
    /* 시크릿 모드 — 이번만 기억 못 한다 */
  }
}

export default function EntryGate({ onPick }: { onPick: (a: Audience) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '1') onPick('kids');
      if (e.key === '2') onPick('general');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPick]);

  return (
    <div className="k-gate" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="k-gate-box">
        <h1 id="gate-title">누가 쓰나요?</h1>
        <p>맞는 쪽을 고르면 그에 맞는 화면이 열린다. 나중에 첫 화면으로 돌아와 바꿀 수 있다.</p>
        <div className="k-gate-grid">
          <button type="button" className="k-gate-pick" data-audience="kids" onClick={() => onPick('kids')} autoFocus>
            <svg className="k-gate-art" viewBox="0 0 200 72" aria-hidden="true">
              <rect x="10" y="14" width="80" height="48" rx="6" fill="#fff3d6" stroke="#2a3038" strokeWidth="3" />
              <rect x="90" y="14" width="60" height="48" rx="6" fill="#e8f4e2" stroke="#2a3038" strokeWidth="3" />
              <path d="M40 40 H100 V62 H172" fill="none" stroke="#c8102e" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="40" cy="40" r="9" fill="#fff" stroke="#c8102e" strokeWidth="3" />
              <text x="40" y="44" textAnchor="middle" fontSize="11" fontWeight="800" fill="#c8102e">1</text>
              <circle cx="176" cy="36" r="14" fill="#c48a5f" />
              <circle cx="171" cy="34" r="1.8" fill="#2a3038" />
              <circle cx="181" cy="34" r="1.8" fill="#2a3038" />
              <ellipse cx="176" cy="40" rx="3" ry="2" fill="#2a3038" />
            </svg>
            <b>초등학생 이하</b>
            <span>블록을 놓아 우리 집을 만들고, 소방청 친구들과 이야기하며 길을 그린다. 한 장으로 뽑는다.</span>
          </button>
          <button type="button" className="k-gate-pick" data-audience="general" onClick={() => onPick('general')}>
            <svg className="k-gate-art" viewBox="0 0 200 72" aria-hidden="true">
              <rect x="10" y="10" width="180" height="52" fill="#fff" stroke="#2a3038" strokeWidth="2.5" />
              <path d="M70 10 V62 M130 10 V62 M10 40 H70" stroke="#2a3038" strokeWidth="2" />
              <path d="M40 52 H100 V22 H176" fill="none" stroke="#c8102e" strokeWidth="3" strokeDasharray="8 4" />
              <text x="20" y="24" fontSize="9" fill="#47525f">3,600</text>
              <text x="138" y="24" fontSize="9" fill="#47525f">2,400</text>
              <path d="M150 50 h30 M150 46 v8 M180 46 v8" stroke="#0f3d68" strokeWidth="1.5" />
            </svg>
            <b>중고생 · 일반</b>
            <span>치수를 넣어 정확한 평면을 그리고, 연기 확산 해석과 대피 훈련을 거쳐 피난안내도를 만든다.</span>
          </button>
        </div>
      </div>
    </div>
  );
}
