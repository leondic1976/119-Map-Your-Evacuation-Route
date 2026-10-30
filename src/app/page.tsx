'use client';

/**
 * 진입 — 화면은 하나뿐이다. 초등학생용 「우리집 대피지도」.
 *
 * 이용자 유형을 고르지는 않는다. 접속할 때 교육 목적을 소개한 뒤 온보딩으로 간다 (v1.6 §8).
 */
import React, { useEffect, useState } from 'react';
import AppUpdates from '../ui/AppUpdates';
import ErrorBoundary from '../ui/ErrorBoundary';
import KidsShell from '../ui/KidsShell';
import ProfileSetup, { type StudentInfo } from '../ui/ProfileSetup';
import WelcomeScreen from '../ui/WelcomeScreen';

const PC_MIN_WIDTH = 1024;

export default function Page() {
  const [desktop, setDesktop] = useState<boolean | null>(null);
  const [screen, setScreen] = useState<'welcome' | 'profile' | 'app'>('welcome');
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);

  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${PC_MIN_WIDTH}px)`);
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  /* 첫 배경 소개를 본 뒤에만 PC 해상도를 판정한 결과를 보여 준다 (v1.9 §10). */
  if (screen === 'welcome') {
    return (
      <>
        <WelcomeScreen onStart={() => setScreen('profile')} />
        <AppUpdates />
      </>
    );
  }

  if (desktop !== true) {
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

  if (screen === 'profile') {
    return <ProfileSetup onHome={() => setScreen('welcome')} onComplete={(info) => { setStudentInfo(info); setScreen('app'); }} />;
  }

  /* 화면이 깨져도 흰 화면으로 끝내지 않는다 (설계서 v1.18 §7) */
  return (
    <ErrorBoundary>
      <KidsShell studentInfo={studentInfo ?? undefined} onHome={() => setScreen('welcome')} />
      <AppUpdates />
    </ErrorBoundary>
  );
}
