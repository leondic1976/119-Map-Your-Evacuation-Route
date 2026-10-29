import type { Metadata } from 'next';
import React from 'react';
import DownloadPage from '../../ui/DownloadPage';

export const metadata: Metadata = {
  title: 'PC에 설치하기 | 우리집 대피지도',
  description: '우리집 대피지도를 브라우저에 설치하거나, 오프라인 꾸러미와 윈도우 설치 파일로 내려받아 인터넷 없이 쓰는 방법.',
};

/** 설치 안내 — 앱 화면이 아니라 받는 곳이다 (설계서 v1.18 §6) */
export default function Page() {
  return <DownloadPage />;
}
