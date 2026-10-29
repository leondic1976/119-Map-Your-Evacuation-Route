import type { Metadata, Viewport } from 'next';
import React from 'react';
import '../ui/base.css';
import '../ui/tailwind.css';
import '../ui/kids.css';
import '../ui/kids-game.css';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/**
 * 오프라인 배포본에서는 웹폰트·매니페스트·공유용 메타를 넣지 않는다.
 * HTML 에서 지우는 것만으로는 부족하다 — 수화 과정에서 React 가 다시 넣기 때문에,
 * 빌드 시점에 아예 렌더하지 않아야 한다. 공유용 그림(og:image)은 단일 HTML 에서
 * 배경 그림을 네 번 더 실어 4MB 상한(NFR-3)을 넘기므로 특히 그렇다.
 */
const offline = process.env.NEXT_PUBLIC_OFFLINE === '1';

export const metadata: Metadata = {
  title: '우리집 대피지도',
  description:
    '우리 집 모양을 블록으로 만들고 대피할 길을 그린 뒤, 불이 난 집에서 직접 빠져나와 보는 초등학생용 재난안전 학습 프로그램. 브라우저에 설치하거나 PC에 내려받아 인터넷 없이 쓸 수 있고 어떤 정보도 서버로 보내지 않는다.',
  applicationName: '우리집 대피지도',
  authors: [{ name: '부평소방서 어린이 화재안전교육' }],
  robots: { index: true, follow: true },
  ...(offline
    ? {}
    : {
        metadataBase: new URL('https://leondic1976.github.io'),
        openGraph: {
          title: '우리집 대피지도',
          description: '우리 집을 그리고, 나가는 길을 찾고, 불이 난 집에서 직접 빠져나와 보는 초등학생용 대피 연습 프로그램.',
          type: 'website',
          locale: 'ko_KR',
          images: [{ url: `${basePath}/images/welcome-evacuation.jpg`, width: 1600, height: 900, alt: '대피지도를 함께 보는 어린이들' }],
        },
        icons: {
          apple: `${basePath}/icons/icon-192.png`,
        },
      }),
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b2f51',
};

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
            {/* 브라우저 설치용 매니페스트 — tools/pack.ts 가 기준 경로를 넣어 out/ 에 만든다 (설계서 v1.18 §5.1) */}
            <link rel="manifest" href={`${basePath}/manifest.webmanifest`} />
          </>
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
