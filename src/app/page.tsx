'use client';

/**
 * 진입 — 화면은 하나뿐이다. 초등학생용 「우리집 대피지도」.
 *
 * 고를 것이 없으므로 첫 화면(이용자 고르기)도 없다. 열면 바로 온보딩이 뜬다.
 */
import React from 'react';
import KidsShell from '../ui/KidsShell';

export default function Page() {
  return <KidsShell />;
}
