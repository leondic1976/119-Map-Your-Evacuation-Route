import React from 'react';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** 없는 주소 — 첫 화면으로 가는 단추 하나뿐이다 (설계서 v1.18 §7) */
export default function NotFound() {
  return (
    <main className="k-pc-only" role="main" data-screen="not-found">
      <div className="k-pc-only-card">
        <span className="k-pc-only-icon" aria-hidden="true">
          <svg viewBox="0 0 64 64">
            <path d="M10 28 32 10l22 18v24H10Z" />
            <path d="M26 52V36h12v16M32 24v6M32 34h.01" />
          </svg>
        </span>
        <h1>이 주소에는 아무것도 없다</h1>
        <p>우리집 대피지도는 첫 화면에서 시작한다.</p>
        <a className="k-nf-home" href={`${basePath}/`}>
          첫 화면으로
        </a>
      </div>
    </main>
  );
}
