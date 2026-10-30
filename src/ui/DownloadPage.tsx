'use client';

/**
 * PC에 설치하기 — 받는 곳 (설계서 v1.18 §6 · v1.20 §2.1).
 *
 * 첫 줄은 설치 없이 웹에서 바로 쓰는 길이다. 주소는 하드코딩하지 않고 지금 열린 주소에서 만든다.
 * 그 아래 세 갈래를 한 화면에 둔다. 어느 것이든 인터넷 없이 돈다.
 *   브라우저에 설치     설치 묻기가 허락되면 그 자리에서 묻고, 아니면 주소창 절차를 알려 준다
 *   오프라인 꾸러미     ZIP 을 받아 압축을 풀고 HTML 을 두 번 누른다. USB 로 옮겨도 된다
 *   윈도우 설치 파일     Releases 의 설치판·무설치판
 *
 * 바깥으로 나가는 링크는 공개 저장소 하나다. 요청(fetch)은 보내지 않는다.
 */
import React, { useEffect, useState } from 'react';
import { host } from '../platform/host';
import { OFFLINE_BUNDLE_DIR, OFFLINE_ZIP_NAME, desktopDownloadPaths, humanBytes } from '../content/release';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '';
const zipBytes = Number(process.env.NEXT_PUBLIC_OFFLINE_ZIP_BYTES ?? '');
const zipSize = humanBytes(zipBytes) || '약 20MB';
/* 설치 파일은 배포 빌드가 Release 에서 받아 함께 실을 때만 안다. 없으면 받을 곳 대신 준비 중이라고 말한다 */
const desktop = desktopDownloadPaths(basePath, APP_VERSION);
const setupSize = humanBytes(Number(process.env.NEXT_PUBLIC_DESKTOP_SETUP_BYTES ?? ''));
const portableSize = humanBytes(Number(process.env.NEXT_PUBLIC_DESKTOP_PORTABLE_BYTES ?? ''));
const desktopReady = Boolean(setupSize && portableSize);

type InstallState = 'checking' | 'installed' | 'ready' | 'manual' | 'done';

export default function DownloadPage() {
  const [install, setInstall] = useState<InstallState>('checking');
  /* 웹에서 바로 쓰는 주소 — 지금 열린 페이지 주소에 기준 경로를 더한다. 다른 서버에 올려도 그 서버 주소가 나온다 */
  const [webAddress, setWebAddress] = useState('');

  useEffect(() => {
    setWebAddress(new URL(`${basePath}/`, window.location.href).href);
  }, []);

  useEffect(() => {
    const installer = host().installer;
    /* 설치 안내 페이지도 서비스 워커를 올려 둔다 — 여기서 설치해도 첫 화면이 바로 캐시된다 */
    installer.registerOffline(() => undefined);
    if (installer.isStandalone()) {
      setInstall('installed');
      return;
    }
    setInstall(installer.canInstall() ? 'ready' : 'manual');
    return installer.onInstallAvailable((can) => setInstall((current) => (current === 'installed' || current === 'done' ? current : can ? 'ready' : 'manual')));
  }, []);

  const promptInstall = async () => {
    const outcome = await host().installer.promptInstall();
    if (outcome === 'accepted') setInstall('done');
    else if (outcome === 'unavailable') setInstall('manual');
  };

  return (
    <main className="k-dl" data-screen="download" aria-labelledby="k-dl-title">
      <header className="k-dl-top">
        <a className="k-dl-brand" href={`${basePath}/`} aria-label="우리집 대피지도 첫 화면">
          <BrandIcon />
          <span>우리집 대피지도</span>
        </a>
        <a className="k-dl-home" href={`${basePath}/`} data-coach="kids-download-home">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H6M12 5l-7 7 7 7" /></svg>
          첫 화면으로
        </a>
      </header>

      <section className="k-dl-hero">
        <p className="k-dl-kicker">학교에서도 집에서도 · 인터넷 없이도</p>
        <h1 id="k-dl-title">웹에서 바로 쓰거나, PC에 설치하자</h1>
        <p>
          설치하지 않아도 웹 주소를 열면 바로 돼. 설치해 두면 바탕화면 아이콘으로 열고 인터넷이 없어도 열려.
          어느 쪽이든 그린 지도는 그 PC 안에만 저장돼.
        </p>

        <section className="k-dl-web" aria-labelledby="k-dl-web-title" data-coach="kids-download-web-strip">
          <span className="k-dl-web-icon" aria-hidden="true">
            <svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" /><path d="M5 16h22M16 5c-4.2 4-4.2 18 0 22M16 5c4.2 4 4.2 18 0 22" /></svg>
          </span>
          <div className="k-dl-web-text">
            <h2 id="k-dl-web-title">설치하지 않아도 돼</h2>
            <p>이 주소를 열면 바로 그릴 수 있어. 한 번 열어 두면 다음부터는 인터넷이 없어도 열려.</p>
            {webAddress && <p className="k-dl-web-address" data-web-address>{webAddress}</p>}
          </div>
          <a className="k-dl-action" href={`${basePath}/`} data-coach="kids-download-web">
            <PlayIcon /> 웹에서 바로 쓰기
          </a>
        </section>
      </section>

      <div className="k-dl-cards">
        <article className="k-dl-card recommended" data-download-card="pwa">
          <span className="k-dl-badge">가장 쉬워요</span>
          <span className="k-dl-icon" aria-hidden="true">
            <svg viewBox="0 0 32 32"><rect x="4" y="6" width="24" height="16" rx="3" /><path d="M12 27h8M16 22v5M16 10v7M12.5 14 16 17.5 19.5 14" /></svg>
          </span>
          <h2>브라우저에 설치</h2>
          <p>지금 보고 있는 이 브라우저(Chrome·Edge·Whale)에 앱으로 설치해. 바탕화면과 시작 메뉴에 아이콘이 생기고, 인터넷이 없어도 열려.</p>
          {install === 'installed' && <p className="k-dl-status ok" data-install-state="installed">이미 설치된 앱 창에서 보고 있어. 바탕화면의 「우리집 대피지도」 아이콘으로 열면 돼.</p>}
          {install === 'done' && <p className="k-dl-status ok" data-install-state="done">설치했어! 바탕화면이나 시작 메뉴에서 「우리집 대피지도」를 찾아 열어 봐.</p>}
          {install === 'ready' && (
            <button type="button" className="k-dl-action" data-coach="kids-download-pwa" data-install-state="ready" onClick={promptInstall}>
              <DownloadIcon /> 지금 설치하기
            </button>
          )}
          {(install === 'manual' || install === 'checking') && (
            <>
              <ol className="k-dl-steps" data-install-state="manual">
                <li><span>주소창 오른쪽 끝의 <b>설치 아이콘</b>(화면에 화살표가 그려진 모양)을 누른다.</span></li>
                <li><span>아이콘이 없으면 브라우저 메뉴(점 세 개) → <b>앱</b> → <b>우리집 대피지도 설치</b>를 누른다.</span></li>
                <li><span>「설치」를 누르면 끝. 다음부터는 바탕화면 아이콘으로 연다.</span></li>
              </ol>
              <a className="k-dl-action secondary" href={`${basePath}/`} data-coach="kids-download-pwa">
                <PlayIcon /> 먼저 한번 열어 보기
              </a>
            </>
          )}
          <p className="k-dl-note">캐릭터 목소리 176개는 설치한 뒤 뒤에서 조용히 받아 둬. 처음 몇 분은 인터넷이 켜져 있는 게 좋아.</p>
        </article>

        <article className="k-dl-card" data-download-card="zip">
          <span className="k-dl-icon" aria-hidden="true">
            <svg viewBox="0 0 32 32"><path d="M6 10h8l3 3h9v13H6z" /><path d="M14 16v6M11 19l3 3 3-3" /></svg>
          </span>
          <h2>오프라인 꾸러미 내려받기</h2>
          <p>HTML 한 장과 목소리 폴더가 든 꾸러미야. USB에 담아 인터넷이 없는 교실이나 다른 PC로 옮길 수 있어.</p>
          <ol className="k-dl-steps">
            <li><span>아래 단추로 <b>{OFFLINE_ZIP_NAME}</b>을 받는다.</span></li>
            <li><span>압축을 풀면 <b>{OFFLINE_BUNDLE_DIR}</b> 폴더가 생긴다. 폴더를 통째로 둔다.</span></li>
            <li><span>폴더 안 <b>home-escape-map.html</b>을 두 번 누른다. 목소리 폴더(voice)는 옆에 그대로 둔다.</span></li>
          </ol>
          <a className="k-dl-action secondary" href={`${basePath}/download/${OFFLINE_ZIP_NAME}`} download data-coach="kids-download-zip">
            <DownloadIcon /> 꾸러미 받기 <span className="k-dl-size">({zipSize})</span>
          </a>
          <p className="k-dl-note">폴더 안의 「읽어주세요.txt」에 같은 내용이 적혀 있어.</p>
        </article>

        <article className="k-dl-card" data-download-card="desktop">
          <span className="k-dl-icon" aria-hidden="true">
            <svg viewBox="0 0 32 32"><rect x="4" y="5" width="24" height="18" rx="3" /><path d="M4 11h24M11 27h10M16 23v4" /></svg>
          </span>
          <h2>윈도우 설치 파일</h2>
          <p>브라우저 없이 바로 켜지는 PC 프로그램이야. 설치판은 시작 메뉴에 등록되고, 무설치판은 USB에 넣고 바로 실행해.</p>
          <ol className="k-dl-steps">
            <li><span>아래에서 <b>설치판</b> 또는 <b>무설치판</b>을 받는다.</span></li>
            <li><span>처음 실행할 때 파란 경고 창이 뜨면 <b>추가 정보 → 실행</b>을 누른다. 서명 비용을 내지 않은 무료 프로그램이라 뜨는 창이야.</span></li>
            <li><span>설치판은 안내대로 「다음」을 누르면 바탕화면 아이콘이 생긴다.</span></li>
          </ol>
          {desktopReady ? (
            <div className="k-dl-actions" data-desktop-state="ready">
              <a className="k-dl-action secondary" href={desktop.setup} data-coach="kids-download-desktop">
                <DownloadIcon /> 설치판 받기 <span className="k-dl-size">({setupSize})</span>
              </a>
              <a className="k-dl-action ghost" href={desktop.portable} data-coach="kids-download-portable">
                무설치판 받기 <span className="k-dl-size">({portableSize})</span>
              </a>
            </div>
          ) : (
            <p className="k-dl-status" data-desktop-state="pending">
              설치 파일은 만드는 중이야. 조금 뒤 이 자리에서 받을 수 있어. 지금은 브라우저에 설치하거나 꾸러미를 받아 줘.
            </p>
          )}
          <p className="k-dl-note">윈도우 10·11 64비트 · 판 {APP_VERSION}</p>
        </article>
      </div>

      <section className="k-dl-guardian" aria-labelledby="k-dl-guardian-title">
        <h2 id="k-dl-guardian-title">선생님·보호자께</h2>
        <dl>
          <div>
            <dt>필요한 PC</dt>
            <dd>Chrome·Edge·Whale 최신 2개 판. 화면 너비 1024px 이상(1280×800 권장). 소리가 나면 좋지만 없어도 다 된다.</dd>
          </div>
          <div>
            <dt>자료가 가는 곳</dt>
            <dd>이름표·집 도면·연습 기록은 그 PC의 브라우저(또는 프로그램) 안에만 저장된다. 서버·로그인·전송이 없다.</dd>
          </div>
          <div>
            <dt>다른 PC로 옮기기</dt>
            <dd>화면 아래 「파일 저장」으로 .json 파일을 내려받고, 다른 PC에서 「불러오기」로 연다. 「뽑기」는 A4 한 장으로 인쇄한다.</dd>
          </div>
          <div>
            <dt>지우기</dt>
            <dd>브라우저 설치판은 앱 창 메뉴의 「우리집 대피지도 제거」, 윈도우 설치판은 「앱 및 기능」에서 지운다. 꾸러미는 폴더를 지우면 끝이다.</dd>
          </div>
          <div>
            <dt>문의</dt>
            <dd>부평소방서 어린이 화재안전교육. 이 페이지와 프로그램은 바깥 주소로 아무것도 보내지 않고, 받을 파일도 모두 이 사이트 안에 있다.</dd>
          </div>
        </dl>
      </section>

      <footer className="k-dl-foot">
        부평소방서 어린이 화재안전교육 · 우리집 대피지도 {APP_VERSION} · 이 프로그램은 법정 피난안내도를 대체하지 않는다.
      </footer>
    </main>
  );
}

function BrandIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0b2f51" />
      <g fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 16.5 16 8l10 8.5" />
        <path d="M9 15.5V25h14v-9.5" />
        <path d="M13 25v-5h4v5" stroke="#7ee2b8" />
      </g>
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" /></svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
  );
}
