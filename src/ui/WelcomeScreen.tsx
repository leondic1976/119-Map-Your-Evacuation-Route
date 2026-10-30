'use client';

/**
 * 첫 화면 — 설계서 v2.1 §1 (전면 개편).
 *
 *   배경   3D 디오라마(ui/replay3d/WelcomeHero3D): 모눈종이 위 우리 집 모형, 크레용이 대피 경로를 그려 나가고
 *          소방복 친구 일구·영이·웅이가 옆에서 움직인다. 3D 를 못 쓰는 PC·자동 검사에서는 그림 배경이 그대로 남는다.
 *   위 띠  기관(인천소방본부 심벌) · PC에 설치하기 — 카드와 겹치지 않는 제 자리
 *   카드   유리 질감. 한 줄 소개 → 제목 → 세 단계(이어진 줄) → 시작 단추(빛이 스친다) → 먼저 보기
 */
import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const WelcomeHero3D = dynamic(() => import('./replay3d/WelcomeHero3D'), { ssr: false });

interface Props {
  onStart: () => void;
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
/* 오프라인 HTML·데스크톱 앱에서는 받을 곳이 없으므로 설치 안내로 가는 길을 보이지 않는다 (설계서 v1.18 §6) */
const installAvailable = process.env.NEXT_PUBLIC_OFFLINE !== '1';
const welcomeAssets = {
  background: `${basePath}/images/welcome-evacuation.jpg`,
  symbol: `${basePath}/images/incheon-fire-symbol.png`,
} as const;

/** WebGL 이 되고 자동 검사가 아닐 때만 3D 를 띄운다. `?hero=3d` 면 검사에서도 띄운다 */
function canShow3d(): boolean {
  if (typeof window === 'undefined') return false;
  const forced = window.location.search.includes('hero=3d');
  if (navigator.webdriver && !forced) return false;
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export default function WelcomeScreen({ onStart }: Props) {
  const [guide, setGuide] = useState(false);
  const [show3d, setShow3d] = useState(false);
  const [ready3d, setReady3d] = useState(false);

  useEffect(() => {
    setShow3d(canShow3d());
  }, []);

  useEffect(() => {
    if (!guide) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGuide(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guide]);

  return (
    <main className={`k-welcome${ready3d ? ' hero-on' : ''}`} data-screen="welcome" data-hero={show3d ? (ready3d ? '3d' : 'loading') : 'image'} aria-labelledby="k-welcome-title">
      <img className="k-welcome-bg" src={welcomeAssets.background} alt="" aria-hidden="true" fetchPriority="high" />
      <div
        className="k-welcome-hero"
        role="img"
        aria-label="소방청 공식 캐릭터 영이, 일구, 웅이가 모눈종이 위 우리 집 모형에서 크레용으로 대피 경로를 그리는 장면"
        data-coach="kids-welcome-hero"
      >
        {show3d && <WelcomeHero3D onReady={() => setReady3d(true)} />}
      </div>
      <div className="k-welcome-shade" aria-hidden="true" />

      <header className="k-welcome-top">
        <div className="k-welcome-agency">
          <img src={welcomeAssets.symbol} alt="인천소방본부 심벌" />
          <span>
            <strong>인천소방본부</strong>
            <small>어린이 화재안전교육</small>
          </span>
        </div>
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
      </header>

      <section className="k-welcome-card">
        <p className="k-welcome-kicker">
          <i aria-hidden="true" />
          우리 가족의 안전 미션
        </p>
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

        <ol className="k-welcome-missions" aria-label="배울 내용">
          <li>
            <span className="k-mission-icon"><HomeMissionIcon /></span>
            <b>1</b>
            <span>우리 집 그리기</span>
          </li>
          <li>
            <span className="k-mission-icon"><RouteMissionIcon /></span>
            <b>2</b>
            <span>나가는 길 찾기</span>
          </li>
          <li>
            <span className="k-mission-icon"><PracticeMissionIcon /></span>
            <b>3</b>
            <span>화재 대피 연습</span>
          </li>
        </ol>

        <button type="button" className="k-welcome-start" data-coach="kids-welcome-start" onClick={onStart}>
          <span className="k-welcome-start-label">우리집 대피지도 그리기</span>
          <span className="k-welcome-start-arrow" aria-hidden="true">
            <svg viewBox="0 0 28 28">
              <path d="M5 14h17M16 7l7 7-7 7" />
            </svg>
          </span>
        </button>
        <button type="button" className="k-welcome-guide-open" data-coach="kids-welcome-guide" onClick={() => setGuide(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M10 8.5l5 3.5-5 3.5z" />
          </svg>
          어떻게 하는지 먼저 보기
        </button>
        <p className="k-welcome-foot">인터넷 없이도 되고, 그린 지도는 이 PC 안에만 저장돼.</p>
      </section>

      {guide && (
        <div className="k-modal-back" onClick={() => setGuide(false)} role="presentation">
          <div className="k-modal k-welcome-guide" role="dialog" aria-modal="true" aria-labelledby="k-welcome-guide-title" onClick={(e) => e.stopPropagation()} data-coach="kids-welcome-guide-modal">
            <header>
              <h2 id="k-welcome-guide-title">이렇게 하면 돼</h2>
              <button type="button" className="k-x" onClick={() => setGuide(false)} aria-label="닫기">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </header>
            <ol className="k-welcome-guide-steps">
              <li>
                <i><HomeMissionIcon /></i>
                <b>1. 우리 집 그리기</b>
                <span>
                  비슷한 집 모양을 고르고, 방과 문과 가구를 눌러서 놓아.
                  <br />
                  똑같지 않아도 돼. 화면이 하나하나 알려 줘.
                </span>
              </li>
              <li>
                <i><RouteMissionIcon /></i>
                <b>2. 나가는 길 찾기</b>
                <span>
                  내 자리에서 현관문까지 끌어서 길을 그어.
                  <br />
                  못 나갈 때 갈 두 번째 길도 그려 두자.
                </span>
              </li>
              <li>
                <i><PracticeMissionIcon /></i>
                <b>3. 화재 대피 연습</b>
                <span>
                  불이 난 집에서 방향키로 움직여 밖으로 나가. 연기가 오면 낮게!
                  <br />
                  끝나면 잘한 점을 알려 주고, 3D 로 다시 볼 수 있어.
                </span>
              </li>
            </ol>
            <p className="k-welcome-guide-note">
              처음 들어가면 화면의 자리를 하나씩 비춰 주는 안내가 나와.
              <br />
              모르면 언제든 아래 「뭘 해야 해?」를 누르면 캐릭터가 말해 줘.
            </p>
            <footer>
              <button type="button" className="k-tb" onClick={() => setGuide(false)}>
                닫기
              </button>
              <button type="button" className="k-tb primary" onClick={onStart}>
                바로 시작하기
              </button>
            </footer>
          </div>
        </div>
      )}
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
