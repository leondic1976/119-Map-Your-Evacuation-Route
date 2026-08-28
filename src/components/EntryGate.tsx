'use client';

/**
 * 첫 화면 — 누가 쓰는지 고른다.
 *
 *   초등학생 이하 → 어린이 화면(src/kids)
 *   중고생·일반   → 지금까지의 작성 화면(AppShell)
 *
 * 고른 것은 브라우저에 남겨 다음에는 바로 들어간다. 두 화면 모두 "첫 화면" 단추로 돌아온다.
 *
 * 판의 짜임 — 위에서 아래로 한 번에 읽힌다.
 *   배지(누가 만든 것인가) → 제목(무엇을 하는가) → 네 걸음(어떻게 되는가)
 *   → 고르는 카드 둘(어디로 갈 것인가) → 안심 문구(무엇을 가져가지 않는가)
 * 카드는 그림·이름·나이·한 줄 설명·특징 셋·화살표까지 갖춘 한 벌이다.
 */
import React, { useEffect } from 'react';
import GateScene from './GateScene';
import { KidToken } from '../kids/ui/KidCharacters';

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

const STEPS: [string, string][] = [
  ['우리 집을 그린다', '평면 8종에서 골라 고친다'],
  ['나가는 길을 정한다', '주 경로와 못 나갈 때의 길'],
  ['연습해 본다', '불나는 곳은 매번 다르다'],
  ['한 장으로 뽑는다', 'A4 한 장을 붙여 둔다'],
];

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
      <GateScene />

      <div className="k-gate-box">
        <div className="k-gate-rule" aria-hidden="true" />

        <p className="k-gate-eyebrow">
          <span className="k-gate-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="M12 2.6 l7.4 2.6 v6.1 c0 4.6 -3.1 8.2 -7.4 10.1 c-4.3 -1.9 -7.4 -5.5 -7.4 -10.1 V5.2z" fill="#0f3d68" />
              <path d="M12 7.2 c-2 3 1.6 4.1 0 7 c4 -1 4.4 -4.6 3 -6.5 c.5 2.4 -1.5 3 -3 -.5z" fill="#ffd166" />
            </svg>
          </span>
          소방청 「우리 아파트 대피계획 세우기」 연계 · 교육용
        </p>

        <h1 id="gate-title">우리집 불나면 어디로 나갈까?</h1>
        <p className="k-gate-lede">
          우리 집 평면을 그리고, 나가는 길을 정하고, 불이 난 집에서 연습해 본다. 마지막에는 A4 한 장으로 뽑아
          잘 보이는 곳에 붙인다.
        </p>

        <ol className="k-gate-flow" aria-label="네 걸음">
          {STEPS.map(([title, sub], i) => (
            <li key={title}>
              <span className="k-gate-step-no">{i + 1}</span>
              <b>{title}</b>
              <small>{sub}</small>
            </li>
          ))}
        </ol>

        <p className="k-gate-ask" id="gate-ask">
          누가 쓰나요?
        </p>

        <div className="k-gate-grid" role="group" aria-labelledby="gate-ask">
          <button type="button" className="k-gate-pick kids" data-audience="kids" onClick={() => onPick('kids')} autoFocus>
            <span className="k-gate-art">
              <KidsThumb />
            </span>
            <span className="k-gate-head">
              <b>초등학생 이하</b>
              <span className="k-gate-age">만 8~12세</span>
            </span>
            <span className="k-gate-desc">블록을 놓아 우리 집을 만들고, 소방 친구들과 이야기하며 나가는 길을 그린다.</span>
            <span className="k-gate-tags">
              <i>블록으로 그리기</i>
              <i>대피 연습 게임</i>
              <i>3D 로 다시 보기</i>
            </span>
            <span className="k-gate-go">
              <span className="k-gate-kbd">1</span>
              <span className="k-gate-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h13M12 5l7 7-7 7" />
                </svg>
              </span>
            </span>
          </button>

          <button type="button" className="k-gate-pick general" data-audience="general" onClick={() => onPick('general')}>
            <span className="k-gate-art">
              <GeneralThumb />
            </span>
            <span className="k-gate-head">
              <b>중고생 · 일반</b>
              <span className="k-gate-age">만 13세 이상</span>
            </span>
            <span className="k-gate-desc">치수를 넣어 정확한 평면을 그리고, 연기 확산 해석과 대피 훈련을 거쳐 피난안내도를 만든다.</span>
            <span className="k-gate-tags">
              <i>9단계 작성</i>
              <i>연기 확산 해석</i>
              <i>A4 피난안내도</i>
            </span>
            <span className="k-gate-go">
              <span className="k-gate-kbd">2</span>
              <span className="k-gate-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h13M12 5l7 7-7 7" />
                </svg>
              </span>
            </span>
          </button>
        </div>

        <p className="k-gate-trust">
          <TrustMark />
          <span>
            설치도 회원가입도 없다. 그린 것은 <b>내 기기 안에만</b> 남고 어디로도 보내지 않는다. 나중에 첫 화면으로
            돌아와 바꿀 수 있다.
          </span>
        </p>

        <footer className="k-gate-org">
          <StationMark />
          <span className="k-gate-org-name">
            <b>부평소방서</b>
            <small>BUPYEONG FIRE STATION</small>
          </span>
          <span className="k-gate-org-note">교육용 자료 · 법정 피난안내도를 대체하지 않는다</span>
        </footer>
      </div>
    </div>
  );
}

/** 어린이 화면 미리보기 — 블록 평면 + 주·보조 경로 + 내 캐릭터 */
function KidsThumb() {
  return (
    <svg viewBox="0 0 260 116" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id="gtKidBg" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#eef5fb" />
          <stop offset="100%" stopColor="#dde9f3" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="260" height="116" fill="url(#gtKidBg)" />
      <g transform="translate(26 14)">
        <g stroke="#2a3038" strokeWidth="2.4">
          <rect x="0" y="0" width="72" height="42" fill="#fff3d6" />
          <rect x="72" y="0" width="56" height="42" fill="#fff3d6" />
          <rect x="128" y="0" width="60" height="42" fill="#dcefff" />
          <rect x="0" y="42" width="188" height="22" fill="#f6f6ee" />
          <rect x="0" y="64" width="102" height="24" fill="#e8f4e2" />
          <rect x="102" y="64" width="86" height="24" fill="#efe9f7" />
        </g>
        <rect x="8" y="8" width="22" height="14" rx="2" fill="#d9a463" stroke="#2a3038" strokeWidth="1.4" />
        <rect x="110" y="70" width="20" height="12" rx="2" fill="#8fb8de" stroke="#2a3038" strokeWidth="1.4" />
        <path d="M22 24 V53 H148 V76 H182" fill="none" stroke="#c8102e" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="22" cy="24" r="10" fill="#ffffff" stroke="#c8102e" strokeWidth="3" />
        <text x="22" y="28" textAnchor="middle" fontSize="11" fontWeight="800" fill="#c8102e">
          1
        </text>
        <circle cx="182" cy="76" r="5.4" fill="#c8102e" />
        <path d="M22 24 V53 H44 V84" fill="none" stroke="#9f5700" strokeWidth="3.4" strokeDasharray="8 5" strokeLinecap="round" />
      </g>
      <g transform="translate(212 62)">
        <KidToken id="girl_twin" size={40} posture="stand" facing="left" />
      </g>
    </svg>
  );
}

/** 일반 화면 미리보기 — 치수선이 있는 도면 + 연기 확산 */
function GeneralThumb() {
  return (
    <svg viewBox="0 0 260 116" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id="gtGenBg" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#f7f9fc" />
          <stop offset="100%" stopColor="#e6ebf2" />
        </linearGradient>
        <radialGradient id="gtSmoke">
          <stop offset="0%" stopColor="#5b6672" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#5b6672" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="260" height="116" fill="url(#gtGenBg)" />
      <g stroke="#c8d0da" strokeWidth="0.6" opacity="0.75">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <path key={`v${i}`} d={`M${20 + i * 30} 12 V100`} />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <path key={`h${i}`} d={`M20 ${20 + i * 26} H230`} />
        ))}
      </g>
      <g fill="#2a3038">
        <rect x="26" y="20" width="182" height="4" />
        <rect x="26" y="86" width="182" height="4" />
        <rect x="26" y="20" width="4" height="70" />
        <rect x="204" y="20" width="4" height="70" />
        <rect x="104" y="20" width="4" height="34" />
        <rect x="104" y="52" width="104" height="4" />
      </g>
      <circle cx="70" cy="70" r="40" fill="url(#gtSmoke)" />
      <circle cx="70" cy="70" r="5" fill="#c8102e" />
      <path d="M150 38 V68 H196" fill="none" stroke="#c8102e" strokeWidth="3" strokeDasharray="9 5" strokeLinecap="round" />
      <g stroke="#0f3d68" strokeWidth="1.2">
        <path d="M26 98 H208" />
        <path d="M26 94 v8 M208 94 v8" />
      </g>
      <text x="117" y="112" textAnchor="middle" fontSize="9" fill="#0f3d68" fontWeight="700">
        3,600
      </text>
      <text x="34" y="34" fontSize="9" fill="#606c7a" fontWeight="700">
        84.1㎡
      </text>
    </svg>
  );
}

/**
 * 부평소방서 표지 — 방패 · 불꽃 · 119.
 * 공식 엠블럼을 그대로 옮긴 것이 아니라 자리표시로 새로 그린 벡터다.
 * 원본 이미지를 받으면 이 컴포넌트만 갈아 끼운다.
 */
function StationMark() {
  return (
    <svg className="k-gate-org-mark" viewBox="0 0 64 64" width="46" height="46" aria-label="부평소방서 표지">
      <defs>
        <linearGradient id="gtOrgShield" x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#1b5590" />
          <stop offset="100%" stopColor="#0d3157" />
        </linearGradient>
        <linearGradient id="gtOrgFlame" x1="0" y1="1" x2="0.3" y2="0">
          <stop offset="0%" stopColor="#c8102e" />
          <stop offset="55%" stopColor="#ff8b2b" />
          <stop offset="100%" stopColor="#ffd166" />
        </linearGradient>
      </defs>
      <path d="M32 3 L58 11.5 v20.6 C58 46.4 47.2 56.6 32 61 C16.8 56.6 6 46.4 6 32.1 V11.5z" fill="url(#gtOrgShield)" />
      <path
        d="M32 6.6 L54.6 14 v18.1 c0 12.4 -9.4 21.4 -22.6 25.3 C18.8 53.5 9.4 44.5 9.4 32.1 V14z"
        fill="none"
        stroke="#7fb4e4"
        strokeWidth="1.4"
        opacity="0.6"
      />
      {/* 불꽃 */}
      <path
        d="M32 16 c-5 7.4 2.6 10.6 -.6 17.4 c8.2 -1.6 9.6 -10.4 6.4 -15 c1.6 5.6 -3.6 6.8 -5.8 -2.4z"
        fill="url(#gtOrgFlame)"
      />
      {/* 119 */}
      <text x="32" y="48" textAnchor="middle" fontSize="13" fontWeight="800" fill="#ffffff" letterSpacing="0.6">
        119
      </text>
    </svg>
  );
}

function TrustMark() {
  return (
    <svg className="k-gate-trust-mark" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      <path d="M12 2.8 l7 2.4 v5.9 c0 4.4 -2.9 7.9 -7 9.7 c-4.1 -1.8 -7 -5.3 -7 -9.7 V5.2z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.6 12.2 l2.4 2.4 l4.4 -4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
