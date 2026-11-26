'use client';

/**
 * PC에 설치하기 — 받는 곳 (설계서 v1.18 §6 · v1.20 §2.1).
 *
 * 첫 줄은 설치 없이 웹에서 바로 쓰는 길이다. 주소는 하드코딩하지 않고 지금 열린 주소에서 만든다.
 * 웹은 저장본을 남기지 않아 인터넷이 있어야 열린다(대장 #132). 인터넷 없이 쓰는 길은 두 갈래다.
 *   윈도우 프로그램     설치판·무설치판. 새 판이 나오면 업데이트한다고 알리고 스스로 바뀐다(대장 #182)
 *   오프라인 꾸러미     ZIP 을 받아 압축을 풀고 HTML 을 두 번 누른다. USB 로 옮겨도 된다
 * 아래에 판 기록을 두어 어느 판에서 무엇이 바뀌었는지 본다(대장 #130). 받을 수 있는 것은 언제나 가장 새 판뿐이다(대장 #180).
 *
 * 받기 단추는 공개 저장소의 Release 파일을 가리킨다 — GitHub 이 그 파일을 받은 횟수를 세어 주고, 배포할 때 읽은
 * 그 숫자를 단추 아래에 보인다(대장 #181). GitHub 이 막힌 곳을 위해 같은 사이트 안의 파일도 함께 둔다.
 * 이 페이지가 스스로 보내는 요청(fetch)은 없다. 바깥 주소는 `content/release.ts` 한 곳에서 만든다.
 */
import React, { useEffect, useState } from 'react';
import { OFFLINE_BUNDLE_DIR, OFFLINE_ZIP_NAME, desktopAssetNames, desktopDownloadPaths, humanBytes, releaseAssetUrl, type DownloadCounts } from '../content/release';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '';
const zipBytes = Number(process.env.NEXT_PUBLIC_OFFLINE_ZIP_BYTES ?? '');
const zipSize = humanBytes(zipBytes) || '약 5MB';
/* 설치 파일은 배포 빌드가 Release 에서 받아 함께 실을 때만 안다. 없으면 받을 곳 대신 준비 중이라고 말한다 */
const desktop = desktopDownloadPaths(basePath, APP_VERSION);
const setupSize = humanBytes(Number(process.env.NEXT_PUBLIC_DESKTOP_SETUP_BYTES ?? ''));
const portableSize = humanBytes(Number(process.env.NEXT_PUBLIC_DESKTOP_PORTABLE_BYTES ?? ''));
const desktopReady = Boolean(setupSize && portableSize);
const assetNames = desktopAssetNames(APP_VERSION);
/* 받은 횟수 — 배포할 때 Release 에서 읽은 숫자다. 로컬 빌드에는 없어 보이지 않는다 */
const counts = ((): DownloadCounts | null => {
  try {
    const raw = JSON.parse(process.env.NEXT_PUBLIC_DOWNLOAD_COUNTS || 'null') as DownloadCounts | null;
    return raw && [raw.setup, raw.portable, raw.zip].every((n) => Number.isFinite(n)) ? raw : null;
  } catch {
    return null;
  }
})();
const times = (n: number): string => `${n.toLocaleString('ko-KR')}번`;

interface ReleaseEntry {
  version: string;
  notes: string[];
  current: boolean;
  date: string | null;
  setup: { name: string; size: number } | null;
}
const releases = JSON.parse(process.env.NEXT_PUBLIC_RELEASES || '[]') as ReleaseEntry[];

export default function DownloadPage() {
  /* 웹에서 바로 쓰는 주소 — 지금 열린 페이지 주소에 기준 경로를 더한다. 다른 서버에 올려도 그 서버 주소가 나온다 */
  const [webAddress, setWebAddress] = useState('');

  useEffect(() => {
    setWebAddress(new URL(`${basePath}/`, window.location.href).href);
  }, []);

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
        <p className="k-dl-kicker">학교에서도 집에서도</p>
        <h1 id="k-dl-title">웹에서 바로 쓰거나, PC에 설치하자</h1>
        <p>
          설치하지 않아도 웹 주소를 열면 바로 돼. 인터넷이 없는 곳에서는 프로그램이나 꾸러미를 받아 써.
          어느 쪽이든 그린 지도는 그 PC 안에만 저장돼.
        </p>

        <section className="k-dl-web" aria-labelledby="k-dl-web-title" data-coach="kids-download-web-strip">
          <span className="k-dl-web-icon" aria-hidden="true">
            <svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" /><path d="M5 16h22M16 5c-4.2 4-4.2 18 0 22M16 5c4.2 4 4.2 18 0 22" /></svg>
          </span>
          <div className="k-dl-web-text">
            <h2 id="k-dl-web-title">설치하지 않아도 돼</h2>
            <p>이 주소를 열면 언제나 가장 새 판으로 바로 그릴 수 있어. 인터넷이 있어야 열려.</p>
            {webAddress && <p className="k-dl-web-address" data-web-address>{webAddress}</p>}
          </div>
          <a className="k-dl-action" href={`${basePath}/`} data-coach="kids-download-web">
            <PlayIcon /> 웹에서 바로 쓰기
          </a>
        </section>
      </section>

      <div className="k-dl-cards">
        <article className="k-dl-card" data-download-card="zip">
          <span className="k-dl-icon" aria-hidden="true">
            <svg viewBox="0 0 32 32"><path d="M6 10h8l3 3h9v13H6z" /><path d="M14 16v6M11 19l3 3 3-3" /></svg>
          </span>
          <h2>오프라인 꾸러미 내려받기</h2>
          <p>HTML 한 장과 그림·목소리 폴더가 든 꾸러미야. USB에 담아 인터넷이 없는 교실이나 다른 PC로 옮길 수 있어.</p>
          <ol className="k-dl-steps">
            <li><span>아래 단추로 <b>{OFFLINE_ZIP_NAME}</b>을 받는다.</span></li>
            <li><span>압축을 풀면 <b>{OFFLINE_BUNDLE_DIR}</b> 폴더가 생긴다. 폴더를 통째로 둔다.</span></li>
            <li><span>폴더 안 <b>home-escape-map.html</b>을 두 번 누른다. 그림 폴더(art)와 목소리 폴더(voice)는 옆에 그대로 둔다.</span></li>
          </ol>
          <a className="k-dl-action secondary" href={desktopReady ? releaseAssetUrl(OFFLINE_ZIP_NAME) : `${basePath}/download/${OFFLINE_ZIP_NAME}`} download data-coach="kids-download-zip">
            <DownloadIcon /> 꾸러미 받기 <span className="k-dl-size">({zipSize})</span>
          </a>
          {counts && (
            <p className="k-dl-count" data-download-count="zip" data-count={counts.zip}>지금까지 {times(counts.zip)} 받았어.</p>
          )}
          {desktopReady && (
            <a className="k-dl-fallback" href={`${basePath}/download/${OFFLINE_ZIP_NAME}`} download data-coach="kids-download-zip-here">받아지지 않으면 여기서 받기</a>
          )}
          <p className="k-dl-note">폴더 안의 「읽어주세요.txt」에 같은 내용이 적혀 있어. 꾸러미는 스스로 새 판이 되지 않으니 가끔 다시 받아 줘.</p>
        </article>

        <article className="k-dl-card recommended" data-download-card="desktop">
          <span className="k-dl-badge">새 판으로 스스로</span>
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
            <>
              <div className="k-dl-actions" data-desktop-state="ready">
                <a className="k-dl-action secondary" href={releaseAssetUrl(assetNames.setup)} data-coach="kids-download-desktop">
                  <DownloadIcon /> 설치판 받기 <span className="k-dl-size">({setupSize})</span>
                </a>
                <a className="k-dl-action ghost" href={releaseAssetUrl(assetNames.portable)} data-coach="kids-download-portable">
                  무설치판 받기 <span className="k-dl-size">({portableSize})</span>
                </a>
              </div>
              {counts && (
                <p className="k-dl-count" data-download-count="desktop" data-count={counts.setup + counts.portable}>
                  지금까지 설치판 {times(counts.setup)}, 무설치판 {times(counts.portable)} 받았어.
                </p>
              )}
              <p className="k-dl-fallbacks">
                받아지지 않으면 여기서 받기
                <a className="k-dl-fallback" href={desktop.setup} data-coach="kids-download-desktop-here">설치판</a>
                <a className="k-dl-fallback" href={desktop.portable} data-coach="kids-download-portable-here">무설치판</a>
              </p>
            </>
          ) : (
            <p className="k-dl-status" data-desktop-state="pending">
              설치 파일은 만드는 중이야. 조금 뒤 이 자리에서 받을 수 있어. 지금은 꾸러미를 받아 줘.
            </p>
          )}
          <p className="k-dl-note">윈도우 10·11 64비트 · 판 {APP_VERSION} · 새 판이 나오면 프로그램이 「새 판으로 업데이트한다」고 알려 주고 스스로 바뀌어. 그린 지도는 그대로 남아.</p>
        </article>
      </div>

      <section className="k-dl-releases" aria-labelledby="k-dl-releases-title" data-releases>
        <h2 id="k-dl-releases-title">판 기록</h2>
        <p>지금 판은 {APP_VERSION} 이야. 받을 수 있는 것은 언제나 가장 새 판 하나야. 프로그램은 스스로 새 판이 되니까 지난 판의 파일은 두지 않아.</p>
        <ul>
          {releases.map((release) => (
            <li key={release.version} data-release={release.version} className={release.current ? 'current' : ''}>
              <details open={release.current}>
                <summary>
                  <b>{release.version}</b>
                  {release.current && <span className="k-dl-size">지금 판</span>}
                  {release.date && <span className="k-dl-size">{release.date}</span>}
                </summary>
                <ul className="k-dl-release-notes">
                  {release.notes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section className="k-dl-guardian" aria-labelledby="k-dl-guardian-title">
        <h2 id="k-dl-guardian-title">선생님·보호자께</h2>
        <dl>
          <div>
            <dt>필요한 PC</dt>
            <dd>Chrome·Edge·Whale 최신 2개 판이 든 PC나 태블릿. 소리가 나면 좋지만 없어도 다 된다.</dd>
          </div>
          <div>
            <dt>자료가 가는 곳</dt>
            <dd>기기에 오래 남는 것은 그린 지도뿐이고 그 PC 안에만 있다. 이름표는 창이나 탭을 닫으면 사라진다. 서버·로그인·전송이 없다. 화면 저장본은 남기지 않는다.</dd>
          </div>
          <div>
            <dt>인쇄와 옮기기</dt>
            <dd>마지막 단계의 「지도 인쇄하기」로 A4 한 장을 뽑는다. 그린 지도를 다른 기기로 옮기는 기능은 없다.</dd>
          </div>
          <div>
            <dt>지우기</dt>
            <dd>윈도우 설치판은 「앱 및 기능」에서 지운다. 꾸러미는 폴더를 지우면 끝이다.</dd>
          </div>
          <div>
            <dt>문의</dt>
            <dd>인천소방본부 어린이 화재안전교육. 이 페이지와 프로그램은 이용자의 것을 바깥으로 보내지 않는다. 프로그램은 새 판을 확인하고 받으려고 이 사이트만 읽는다.</dd>
          </div>
          <div>
            <dt>받는 곳과 받은 횟수</dt>
            <dd>
              받기 단추는 이 사이트를 싣고 있는 GitHub 의 공개 저장소에서 파일을 받는다. GitHub 이 그 파일을 받은 횟수를 세어 주고, 이 페이지는 하루에 한 번 그 숫자를 옮겨 적는다.
              누가 받았는지는 세지 않는다. 프로그램이 스스로 새 판을 받는 것과 「여기서 받기」로 받은 것은 횟수에 들지 않는다.
            </dd>
          </div>
        </dl>
      </section>

      <footer className="k-dl-foot">
        인천소방본부 어린이 화재안전교육 · 우리집 대피지도 {APP_VERSION} · 이 프로그램은 법정 피난안내도를 대체하지 않는다.
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
