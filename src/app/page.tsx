'use client';

/**
 * 진입 — 화면은 하나뿐이다. 초등학생용 「우리집 대피지도」.
 *
 * 고를 것이 없으므로 첫 화면(이용자 고르기)도 없다. 열면 바로 온보딩이 뜬다.
 */
import React, { useEffect, useState } from 'react';
import KidsShell from '../ui/KidsShell';

const PC_MIN_WIDTH = 1024;

export default function Page() {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${PC_MIN_WIDTH}px)`);
    const update = () => setDesktop(query.matches);
    update();
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

  return <KidsShell />;
}
