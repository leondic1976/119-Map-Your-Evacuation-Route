import type { Metadata, Viewport } from 'next';
import React from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: '우리 아파트 피난로 그리기',
  description:
    '공동주택 세대의 평면을 그리고 소화기·피난시설과 피난동선을 표기해, 연기 확산을 시뮬레이션하고 A4 피난안내도로 인쇄하는 교육용 웹 시스템. 설치·회원가입 없이 브라우저에서 동작하며 어떤 정보도 서버로 보내지 않는다.',
  applicationName: '우리 아파트 피난로 그리기',
  authors: [{ name: '소방청 협력 안전교육 자료' }],
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
