# 우리집 대피지도 변경 명세 v1.18

작성일: 2026-10-29

대상: 제품화 — 소방서-학교 플랫폼 제거, 내려받아 설치하는 배포 형태, 프로덕션 빌드

우선순위: 이 문서가 v1.17(방 크기 조절 화면 단순화)보다 뒤의 결정이며 충돌하면 v1.18이 이긴다. v1.9 §11·§13(캠페인 대시보드),
`PLAN-campaign-dashboard.md`, `RESEARCH-campaign-dashboard.md`, 요청 대장 #64·#68·#83·#84·#86의
구현은 이 문서로 **폐기**한다.

## 1. 목적과 경계

이 앱은 한 아이가 자기 집 대피지도를 만들고 연습하는 **개인용 학습 도구**다. 기관이 학생을 모아 보는
포털이 아니다. 그래서 다음을 뺀다.

- `/dashboard/` 통합 캠페인 포털과 그 자료(가상 학생 기록, 지역·학교·학급 필터, 안전 완성도 점수).
- 학교 이름·반 입력. 이름표에는 **이름(선택)과 학년**만 남긴다.
- `부평초등학교 / 1학년 / 119반 / 자동화` 특수 입력으로 켜지던 40초 자동 시연.
- 안전 완성도 100점 계산(`core/campaign/score.ts`). 점수·등급·순위를 만들지 않는다는 원칙(작업지침 §10-9)과도 맞지 않았다.

다음은 그대로 둔다.

- 화면은 하나다. 소개 → PC 판정 → 이름표 → 지도 만들기(작업지침 §10-14). `/download/`는 앱 화면이 아니라
  **설치 안내 페이지**다.
- 소방청 공식 캐릭터·심벌과 소개 화면의 `부평소방서 어린이 화재안전교육` 표기. 만든 곳을 적는 것이지
  기관 기능이 아니다.
- 모든 자료는 이용자 기기 밖으로 나가지 않는다(CON-2·CON-8). 서버·로그인·전송은 계속 없다.

## 2. 지우는 것

| 갈래 | 파일 |
|---|---|
| 화면 | `src/app/dashboard/`, `src/ui/CampaignDashboardPage.tsx`, `src/ui/dashboard.css`, `src/ui/SchoolAutomation.tsx` |
| 연산·자료 | `src/core/campaign/`, `src/core/schoolAutomation.ts`, `src/platform/campaign.ts`, `src/content/campaign-demo.ts` |
| 자산 | `public/images/dashboard-campaign-hero.png` |
| 문서 | `docs/PLAN-campaign-dashboard.md`, `docs/RESEARCH-campaign-dashboard.md` → `docs/archive/`로 옮기고 머리에 폐기 사유를 적는다 |
| 검증 | 대시보드·자동화 로직 3항목, Chromium 2시나리오, 화면 캡처 2장 |

소개 화면 우측 상단 `대시보드 바로가기`, 편집기 상단바 `대시보드`, 사용법의 학교·반 문구, `kids.css`의
대시보드·자동화 규칙도 함께 지운다. `npm test`의 죽은 CSS 검사가 남은 규칙을 잡는다.

`npm test`에 **플랫폼 잔재 0건** 검사를 더한다. `src/**`에 `dashboard`, `campaign`, `schoolAutomation`,
`부평초등학교`가 다시 나타나면 실패한다. 중고생용 화면을 되살리지 않는 것과 같은 성격의 방지선이다.

## 3. 입장 절차와 이름표

```text
소개 화면 → (1024px 미만이면 PC 안내) → 이름표 → 지도 만들기
```

- 이름표 화면 제목은 `내 이름표를 만들자`다. 입력은 **이름(선택, 12자)** 과 **학년(1~6, 큰 단추)** 둘뿐이다.
- 이름을 비우면 막지 않는다. 비우면 상단바와 인쇄물에 `나`로 표시한다(작업지침 §4 막지 않는다).
- 학년은 이용 수준의 **무난한 기본값**을 정한다. 1~3학년은 `쉬움`, 4~6학년은 `보통`으로 시작하고,
  상단바의 쉬움/보통으로 언제든 바꾼다. 저장된 지도가 있으면 저장된 수준을 따른다.
- 개인정보 고지는 유지한다. `적은 이름은 인터넷으로 보내지 않고 이 PC 안에서만 쓴다.`
- 상단바 이름표는 `3학년 안전이` 꼴이다.

## 4. 저장 형식 v4

`SCHEMA_VERSION`을 4로 올린다. `UserProfile`에서 `schoolName`·`className`을 지우고 `schoolGrade`·`studentName`은
그대로 둔다(키 이름을 바꾸지 않아 이행이 단순하다).

- 3 → 4 이행: `profile.schoolName`, `profile.className`을 버린다. 나머지는 그대로다.
- `fillDefaults`는 알 수 없는 프로필 키를 더 이상 실어 나르지 않는다. 프로필은 정의된 키만 남긴다.
- 로직 검증은 v1·v2·v3 파일을 모두 v4로 읽고, 학교 키가 사라졌는지와 지도·진행 기록이 보존되는지를 본다.

## 5. 배포 형태 셋

정적 페이지 한 곳에서 세 가지를 모두 내려받는다. 어느 것이든 **인터넷 없이** 돈다.

### 5.1 브라우저에 설치 (PWA)

- `out/manifest.webmanifest`와 `out/sw.js`는 `next build` 뒤에 `tools/pack.ts`가 만든다. 기준 경로(`BASE_PATH`)를
  그 자리에서 넣어야 하므로 `public/`에 고정 파일로 두지 않는다.
- 선캐시는 **앱 껍데기**(HTML·CSS·JS·아이콘·소개 그림·음성 매니페스트)다. MP3 176개는 설치 때 받지 않고,
  서비스 워커가 활성화된 뒤 배경에서 4개씩 차례로 받아 둔다. 중간에 끊겨도 설치는 실패하지 않고, 처음 재생하는
  MP3는 그때 캐시한다(캐시 우선).
- 오프라인 꾸러미 ZIP은 캐시하지 않는다.
- 문서 요청은 캐시 우선·배경 갱신이다. 새 서비스 워커가 설치되면 화면 아래 `새 판이 준비됐어 · 다시 열기`
  알림을 띄운다. 붉은 점멸은 쓰지 않는다.
- `file://`(오프라인 HTML·데스크톱 앱)과 개발 서버에서는 등록하지 않는다.
- 등록·설치 묻기(`beforeinstallprompt`)는 바깥 세계에 닿으므로 `platform/host.ts`의 `Host`에 `installer`를
  더해 거기서만 다룬다. UI는 `host().installer`만 부른다.
- 아이콘은 `public/icons/`의 PNG 192·512·maskable 512다. `tools/icons.ts`가 `src/app/icon.svg`와 같은 그림을 Chromium으로
  그려 만든다. 한 번 만들어 저장소에 둔다.

### 5.2 오프라인 꾸러미 ZIP

- `tools/standalone.ts`가 `dist/home-escape-map.html`과 `dist/voice/`를 만든 뒤 `dist/home-escape-map-offline.zip`도 만든다.
  안에는 `우리집 대피지도/home-escape-map.html`, `우리집 대피지도/voice/*.mp3`, `우리집 대피지도/읽어주세요.txt`가 들어간다.
- ZIP은 외부 패키지 없이 `tools/zip.ts`가 쓴다(`node:zlib`의 deflateRaw·crc32, UTF-8 파일명 깃발).
  로직 검증이 만든 ZIP을 다시 풀어 내용이 같은지 확인한다.
- `tools/pack.ts`가 `dist/`의 ZIP을 `out/download/`로 복사한다. 그래서 워크플로 순서는 그대로
  **오프라인 배포본 → 내보내기 → 검증 → 배포용 내보내기 → Pages 업로드**다.
- 단일 HTML 4MB 상한(NFR-3)은 HTML에만 걸린다. ZIP은 음성 때문에 20MB 안팎이다.

### 5.3 윈도우 설치 파일 (Electron)

요청 대장 #2b의 미룸을 해제한다. 인터넷에서 잘 도는 것이 먼저라는 조건이 충족됐다.

- `desktop/main.cjs` 하나다. 오프라인 HTML(`dist/home-escape-map.html`)과 `dist/voice/`를 `extraResources`로 싣고
  `loadFile`로 연다. 앱은 이미 `file://`에서 네트워크 없이 도는 것이 검증돼 있으므로 `Host`를 갈아 끼우지 않는다.
  `localStorage`는 Electron 프로필 폴더에 남는다.
- 창은 1280×800으로 열고 최소 1024×700이다. 메뉴 막대는 없고 `F11` 전체 화면, `Ctrl+P` 인쇄는 브라우저와 같다.
  파일 저장(`<a download>`)은 `will-download`에서 저장 대화상자를 띄운다. 바깥 주소로의 이동과 새 창은 막는다.
- `electron-builder`로 NSIS 설치 파일과 무설치 실행 파일을 만든다. 산출물 이름은
  `우리집-대피지도-설치-<버전>.exe`, `우리집-대피지도-무설치-<버전>.exe`다.
- 코드 서명은 없다. 안내 페이지에 SmartScreen `추가 정보 → 실행` 절차를 적는다.
- 빌드는 별도 워크플로 `.github/workflows/desktop.yml`(windows 러너)이 맡고 GitHub Releases의 `desktop` 태그에
  **덮어쓰기**로 올린다. Pages 배포를 막지 않는다.
- `electron`·`electron-builder`는 개발 의존성이다. 런타임 의존성 목록(v1.4 §1.1)은 바뀌지 않는다.
- 검증: Playwright `_electron`으로 패키징 전 앱을 띄워 소개 화면이 뜨고 바깥 요청이 0건인지 본다(`npm run desktop:check`).

## 6. `/download/` 안내 페이지

- 소개 화면 우측 상단의 단추가 `PC에 설치하기`로 바뀌어 이 페이지로 간다. 편집기 사용법(`?`)에서도 연다.
- 세 장의 카드: `브라우저에 설치`(설치 단추가 가능하면 그 자리에서 묻고, 아니면 주소창 설치 절차 안내),
  `오프라인 꾸러미 내려받기`(ZIP 크기·압축 풀기·`home-escape-map.html` 두 번 누르기·USB 안내),
  `윈도우 설치 파일`(Releases 링크·SmartScreen 안내).
- 아래에 `선생님·보호자께`: 필요한 PC(Chrome·Edge·Whale 최신 2판, 1024px 이상, 소리), 저장 위치(이 PC 안),
  지우는 법, 인쇄 안내.
- 오프라인 HTML·데스크톱 앱에서는 이 페이지로 가는 링크를 보이지 않는다(받을 곳이 없다).
- 바깥으로 나가는 링크는 GitHub 저장소 하나뿐이다. `npm test`의 외부 주소 허용 목록에 저장소 주소를 더한다.
  요청이 아니라 이동이며, `fetch`는 여전히 0건이다.
- 모든 단추·링크는 48px 이상이고 키보드로 닿는다.

## 7. 프로덕션 마감

- `package.json` 버전을 `2.0.0`으로 올리고 사용법 모달과 안내 페이지에 표시한다.
- `KidsShell`을 오류 경계로 감싼다. 화면이 깨져도 `다시 열기`와 `지금 지도 파일로 저장`을 제공한다.
  자동 저장은 이미 600ms마다 하므로 자료를 잃지 않는다.
- `not-found` 페이지를 둔다. 첫 화면으로 가는 단추 하나다.
- 메타데이터: `manifest` 링크, `apple-touch-icon`, Open Graph 제목·설명.
- README는 제품 안내로 다시 쓴다. 로컬 작업 경로와 플랫폼 설명을 지우고 설치 세 갈래를 앞에 둔다.

## 8. 검증

| 자리 | 더하는 것 |
|---|---|
| `tools/logic-tests.ts` | v3→v4 이행, 학년→기본 수준, ZIP 쓰기·되읽기 |
| `tools/qa-tests.ts` | 플랫폼 잔재 0건, `platform/host.ts` 밖의 서비스 워커·설치 API 호출 0건, `public/sw.js` 외부 주소 0건, 안내 페이지 `fetch` 0건 |
| `tools/smoke.ts` | 소개 `PC에 설치하기` 단추, 이름표 2입력·빈 이름 통과, `/download/` 카드 3장·ZIP HEAD 200·manifest/sw 200, 서비스 워커 활성화 뒤 오프라인 재접속에서 소개 화면 |
| `tools/desktop-check.ts` | Electron 실행·소개 화면·바깥 요청 0건 |
| `tools/shots.ts` | 대시보드·자동화 캡처 제거, 이름표·안내 페이지 캡처 추가 |

## 9. 음성

실제 캐릭터 발화는 바뀌지 않는다. 이름표·안내 페이지·알림 문구는 화면 전용이다. `VOICE-SCRIPT.md`와 MP3 176개는
그대로이며 ElevenLabs 자동화를 돌리지 않는다.
