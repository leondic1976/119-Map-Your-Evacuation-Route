'use client';

/**
 * 첫 소개 화면 — 설계서 v1.6 §8.
 * 이용자 유형을 고르는 화면이 아니다. 교육 목적을 읽고 한 번 누르면 기존 온보딩으로 간다.
 */
import React from 'react';

interface Props {
  onStart: () => void;
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
/* 오프라인 HTML·데스크톱 앱에서는 받을 곳이 없으므로 설치 안내로 가는 길을 보이지 않는다 (설계서 v1.18 §6) */
const installAvailable = process.env.NEXT_PUBLIC_OFFLINE !== '1';
const welcomeAssets = {
  background: `${basePath}/images/welcome-evacuation.jpg`,
  characters: `${basePath}/images/nfa-characters.png`,
  symbol: `${basePath}/images/nfa-symbol.png`,
} as const;

export default function WelcomeScreen({ onStart }: Props) {
  return (
    <main className="k-welcome" data-screen="welcome" aria-labelledby="k-welcome-title">
      <img
        className="k-welcome-bg"
        src={welcomeAssets.background}
        alt=""
        aria-hidden="true"
        fetchPriority="high"
      />
      <div className="k-welcome-shade" aria-hidden="true" />

      {installAvailable && (
        <a className="k-welcome-install" href={`${basePath}/download/`} data-coach="kids-welcome-install" title="브라우저에 설치하거나 PC에 내려받아 인터넷 없이 쓴다">
          <span aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 3v11M7.5 9.5 12 14l4.5-4.5" />
              <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
            </svg>
          </span>
          PC에 설치하기
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h13M13 6l6 6-6 6" />
          </svg>
        </a>
      )}

      <section className="k-welcome-card">
        <img
          className="k-welcome-characters"
          src={welcomeAssets.characters}
          alt="소방청 공식 캐릭터 영이, 일구, 웅이"
        />

        <p className="k-welcome-kicker">우리 가족의 안전 미션</p>
        <h1 id="k-welcome-title">
          <span>우리집</span>
          대피지도 그리기
        </h1>
        <p className="k-welcome-lead">우리 집에서 빠르게 나갈 길을 미리 찾아보자.</p>
        <p className="k-welcome-purpose">
          방과 문을 직접 그리고 나가는 길을 찾아보면서,
          <br />
          화재가 났을 때 신속하게 대피하는 방법을 연습한다.
        </p>

        <ul className="k-welcome-missions" aria-label="배울 내용">
          <li>
            <HomeMissionIcon />
            <span>우리 집 그리기</span>
          </li>
          <li>
            <RouteMissionIcon />
            <span>나가는 길 찾기</span>
          </li>
          <li>
            <PracticeMissionIcon />
            <span>화재 대피 연습</span>
          </li>
        </ul>

        <button type="button" className="k-welcome-start" data-coach="kids-welcome-start" onClick={onStart} autoFocus>
          우리집 대피지도 그리기
          <span aria-hidden="true">
            <svg viewBox="0 0 28 28">
              <path d="M5 14h17M16 7l7 7-7 7" />
            </svg>
          </span>
        </button>

        <footer className="k-welcome-agency">
          <img src={welcomeAssets.symbol} alt="소방 심벌" />
          <span>
            <strong>부평소방서</strong>
            <small>어린이 화재안전교육</small>
          </span>
        </footer>
      </section>
    </main>
  );
}

function HomeMissionIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M7 23 24 8l17 15v17H7Z" />
      <path d="M18 40V28h12v12M14 20h20" />
    </svg>
  );
}

function RouteMissionIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="11" cy="35" r="5" />
      <path d="M16 35h8c8 0 4-20 13-20h4M35 9l6 6-6 6" />
    </svg>
  );
}

function PracticeMissionIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="19" cy="11" r="5" />
      <path d="m17 18 8 5 7-2M23 23l-5 9-9 6M21 29l8 3 7 8" />
      <path d="M37 8v10M32 13h10" />
    </svg>
  );
}
