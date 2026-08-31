import type { Metadata, Viewport } from 'next';
import React from 'react';
import '../ui/base.css';
import '../ui/tailwind.css';
import '../ui/kids.css';
import '../ui/kids-game.css';
import '../ui/dashboard.css';

export const metadata: Metadata = {
  title: '우리집 대피지도',
  description:
    '우리 집 모양을 블록으로 만들고 대피할 길을 그린 뒤, 불이 난 집에서 직접 빠져나와 보는 초등학생용 재난안전 학습 웹 앱. 설치도 회원가입도 없이 브라우저에서 동작하며 어떤 정보도 서버로 보내지 않는다.',
  applicationName: '우리집 대피지도',
  authors: [{ name: '소방청 아동 재난안전교육 자료' }],
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b2f51',
};

/**
 * 오프라인 배포본에서는 웹폰트를 부르지 않는다.
 * HTML 에서 지우는 것만으로는 부족하다 — 수화 과정에서 React 가 다시 넣기 때문에,
 * 빌드 시점에 아예 렌더하지 않아야 한다.
 */
const offline = process.env.NEXT_PUBLIC_OFFLINE === '1';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {!offline && (
          <>
            <link rel="preconnect" href="https://cdn.jsdelivr.net" />
            <link
              rel="stylesheet"
              href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
            />
          </>
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
