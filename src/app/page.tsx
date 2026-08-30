'use client';

/**
 * 진입 — 화면은 하나뿐이다. 초등학생용 「우리집 대피지도」.
 *
 * 이용자 유형을 고르지는 않는다. 새 탭에서는 교육 목적을 소개한 뒤 온보딩으로 간다 (v1.6 §8).
 */
import React, { useEffect, useState } from 'react';
import KidsShell from '../ui/KidsShell';
import WelcomeScreen from '../ui/WelcomeScreen';
import { host } from '../platform/host';

const PC_MIN_WIDTH = 1024;
const WELCOME_SESSION_KEY = 'evac-welcome-seen';

export default function Page() {
  const [desktop, setDesktop] = useState(false);
  const [welcome, setWelcome] = useState(true);

  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${PC_MIN_WIDTH}px)`);
    const update = () => setDesktop(query.matches);
    update();
    setWelcome(host().readSession(WELCOME_SESSION_KEY) !== '1');
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  if (!desktop) {
    return (
      <main className="k-pc-only" role="main">
        <div className="k-pc-only-card">
          <span className="k-pc-only-icon" aria-hidden="true">
            <svg viewBox="0 0 64 64">
              <rect x="8" y="10" width="48" height="34" rx="4" />
              <path d="M24 54h16M32 44v10" />
            </svg>
          </span>
          <h1>PC에서 이용해 주세요</h1>
          <p>우리집 대피지도는 큰 화면과 키보드·마우스를 사용하는 PC 전용 프로그램입니다.</p>
          <small>브라우저 창을 1024px 이상으로 넓혀 주세요.</small>
        </div>
      </main>
    );
  }

  if (welcome) {
    return (
      <WelcomeScreen
        onStart={() => {
          host().writeSession(WELCOME_SESSION_KEY, '1');
          setWelcome(false);
        }}
      />
    );
  }

  return <KidsShell />;
}
