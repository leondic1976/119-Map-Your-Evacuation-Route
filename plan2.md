# 우리집 대피지도 (가칭) — 개발 설계서

**소방청 아동 재난안전교육 웹 애플리케이션**

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.0 |
| 작성일 | 2026-08-27 |
| 대상 독자 | 개발자 1인 + Claude Code CLI |
| 산출물 형태 | 브라우저 단독 실행 웹 애플리케이션 (오프라인 지원) |
| 배포 주체 | 소방청 → 전국 초등학교 → 각 가정 |

---

## 0. 이 문서 사용법

### 0.1 문서의 성격

이 문서는 **읽고 이해하기 위한 기획서가 아니라, Claude Code CLI가 실행할 수 있는 명세서**다. 따라서 다음 원칙으로 작성되었다.

- 모든 요구사항에 **고유 ID**가 있다. 구현 지시 시 ID로 지목한다.
  - `P-` 제품 원칙(§1.4) · `FR-` 기능 요구 · `NFR-` 비기능 요구 · `CON-` 제약
  - `RULE-` 검증 규칙(§5.3.2) · `CT-` 콘텐츠 규칙(§6.2) · `RT-` 챗봇 라우팅 계층(§5.4.1)
  - `R-` 리스크(§10.1) · `O-` 미결 사항(§10.2)
- 데이터 모델은 **TypeScript 타입 정의 전문**으로 제공한다. 그대로 `src/types/`에 복사해 쓴다.
- 알고리즘은 **의사코드 또는 실제 코드**로 제공한다. 자연어 설명만 있는 항목은 없다.
- 각 마일스톤에 **완료 조건(DoD, Definition of Done)** 이 있다. 이걸 만족하지 못하면 다음 마일스톤으로 넘어가지 않는다.

### 0.2 Claude Code에 지시하는 방법

1. 저장소 루트에 이 문서를 `docs/DESIGN.md`로 둔다.
2. **부록 B의 `CLAUDE.md` 초안**을 저장소 루트에 `CLAUDE.md`로 저장한다. Claude Code가 매 세션 자동으로 읽는다.
3. 작업은 **마일스톤 단위로만** 지시한다. "전부 만들어줘"는 금지 — 컨텍스트를 넘겨 품질이 무너진다.
4. 각 마일스톤 지시에는 부록 C의 프롬프트 템플릿을 사용한다.
5. 마일스톤이 끝날 때마다 **DoD를 직접 확인**하고 커밋한다.

### 0.3 문서 갱신 규칙

구현 중 설계와 어긋나는 결정을 하면, **코드가 아니라 이 문서를 먼저 고친다.** 문서와 코드가 갈라지는 순간 Claude Code의 산출물 품질이 급격히 떨어진다.

---

## 1. 프로젝트 개요

### 1.1 배경

기존 오프라인 활동인 "우리집 대피경로 그리기"를 디지털화하되, 단순 이식이 아니라 **대화형 지도(챗봇)** 와 **체험형 검증(3D 화재 시뮬레이션)** 을 결합한다.

기존 활동의 한계:

- 아이가 그린 대피경로가 **맞는지 틀린지 아무도 검증해주지 않는다.** 교사가 전부 확인할 수 없고, 가정에서는 더욱 불가능하다.
- 아이가 그리는 도중 막혔을 때 물어볼 대상이 없다.
- 종이 결과물은 그리는 순간 끝나고, "그래서 실제로 불이 나면 어떻게 되는가"를 경험할 수 없다.

본 프로젝트는 이 세 가지를 각각 **규칙 엔진 검증 / 챗봇 / 화재 시뮬레이션**으로 해결한다.

### 1.2 대상 사용자

| 구분 | 설명 |
|---|---|
| 주 사용자 | 초등학생 1~6학년 |
| 사용 환경 | **가정, 보호자 동반 없이 아동 단독 사용 가능** |
| 부 사용자 | 보호자 (일부 정보 확인, 인쇄물 활용) |
| 기기 | 가정용 PC, 노트북, 태블릿 (저사양 포함) |

> **설계상 가장 중요한 전제**: 교사가 옆에 없다. 아이가 막히면 도와줄 사람이 없다. 따라서 **막다른 골목이 발생하지 않는 UI**가 최우선 설계 목표다.

### 1.3 핵심 3축

```
┌─────────────┐   평면도 데이터   ┌─────────────┐
│  ① 그리기    │ ────────────────▶ │  ② 챗봇     │
│  (에디터)    │ ◀──────────────── │  (검증·안내) │
└─────────────┘   수정 유도        └─────────────┘
       │                                  ▲
       │ 동일 격자 데이터                  │ 실패 원인 설명
       ▼                                  │
┌────────────────────────────────────────┴──┐
│  ③ 화재 대피 시뮬레이션 (3D)                │
│  자기가 그린 자기 집이 불탄다 → 경로 검증     │
└────────────────────────────────────────────┘
                     │
                     ▼
              ④ 피난안내도 인쇄
```

세 기능은 **하나의 격자 데이터 모델을 공유**한다. 이것이 아키텍처의 핵심이며, 데이터 모델(4장)을 먼저 확정해야 하는 이유다.

### 1.4 제품 원칙 (비타협 항목)

구현 중 트레이드오프가 발생하면 아래 원칙이 승리한다.

| ID | 원칙 | 근거 |
|---|---|---|
| **P1** | **런타임에 생성형 AI를 사용하지 않는다.** 모든 답변은 사전 검수된 고정 문장이다. | 소방청 명의 배포물. 답변 책임 소재, 로컬 배포로 인한 회수 불가, 아동 개인정보 |
| **P2** | **오답보다 "모름"이 낫다.** 신뢰도 임계값 미달 시 절대 추측 답변을 하지 않는다. | 아동 안전 정보 |
| **P3** | **아이가 막다른 골목에 빠지지 않는다.** 항상 다음에 누를 것이 화면에 있다. | 가정 단독 사용 |
| **P4** | **색만으로 정보를 전달하지 않는다.** 모든 색 구분은 형태·선종류·번호와 이중 부호화한다. | 흑백 인쇄, 색각 이상 |
| **P5** | **겁주지 않는다.** 사실적 화재 묘사를 지양하고 "준비된 사람" 프레이밍을 유지한다. | 아동 심리, 안전교육의 목적은 공포가 아닌 행동 습득 |
| **P6** | **모든 안전 콘텐츠에 출처가 있다.** 출처 필드가 빈 콘텐츠는 빌드 시 에러로 처리한다. | 공공 배포물 검수 |

---

## 2. 요구사항 명세

### 2.1 기능 요구사항

#### FR-1. 평면도 에디터

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-1.1 | 좌측 팔레트에서 블록을 드래그하여 캔버스에 배치할 수 있다 | 필수 |
| FR-1.2 | 배치된 블록은 격자에 스냅된다. 방 블록은 크기 조절이 가능하다 | 필수 |
| FR-1.3 | 문·창문 등 개구부는 방 경계선(벽면)에만 배치된다 | 필수 |
| FR-1.4 | 시작 시 기본 평면도 템플릿 3종 이상 중 선택하거나 빈 캔버스로 시작할 수 있다 | 필수 |
| FR-1.5 | 배치된 블록을 선택·이동·삭제할 수 있다. 회전은 `PointBlock`(가구·설비·위험원)에만 적용된다 — 방은 리사이즈로, 개구부는 벽면 스냅으로 방향이 결정되므로 회전 개념이 없다 | 필수 |
| FR-1.6 | 실행 취소/다시 실행(Undo/Redo)을 최소 30단계 지원한다 | 필수 |
| FR-1.7 | 방에 이름을 지정할 수 있다 (프리셋 + 직접 입력) | 필수 |
| FR-1.8 | 블록 외형을 **어린이 모드(친근한 도형)** 와 **도면 모드(건축 기호)** 로 전환할 수 있다 | 필수 |
| FR-1.9 | 레이어 2(현관 밖 공용부: 복도·계단·엘리베이터·비상구·지상출구)를 선택적으로 편집할 수 있다 | 권장 |
| FR-1.10 | 캔버스 확대/축소/이동(pan)을 지원한다 | 필수 |

#### FR-2. 대피경로 작도

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-2.1 | 재난 종류(화재/지진/침수/가스)를 탭으로 전환할 수 있다 | 필수 |
| FR-2.2 | 재난별로 **각각 다른 대피경로**를 그릴 수 있다 | 필수 |
| FR-2.3 | 경로는 시작점(내 방 등)에서 격자 셀을 이어 그리는 방식이다 | 필수 |
| FR-2.4 | 집 밖 가족 집결 장소를 지정할 수 있다 | 필수 |
| FR-2.5 | 지진 시나리오는 경로 중간에 **1차 대피처**(탁자 밑 등) 노드를 지정할 수 있다 | 필수 (RULE-E-01이 critical이므로) |
| FR-2.6 | 그려진 경로는 재난별로 색 + 선종류 + 번호로 구분 표시된다 (P4) | 필수 |
| FR-2.7 | **화재 탭은 시나리오 2종을 각각 작도한다**: ① 현관으로 나갈 수 있을 때 ② 현관으로 못 나갈 때 (§6.1 참조) | 필수 |
| FR-2.8 | 시나리오 ②는 대피공간·경량칸막이·하향식피난구 등 대체 피난설비를 목적지로 인정한다 | 필수 |

#### FR-3. 검증 엔진

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-3.1 | 평면도를 그래프로 변환한다 (방=노드, 개구부=엣지) | 필수 |
| FR-3.2 | 정의된 규칙셋(RULE-*)을 평가하여 위반 항목과 통과 항목을 산출한다 | 필수 |
| FR-3.3 | 규칙 평가는 재난 종류별로 다른 규칙셋을 적용한다 | 필수 |
| FR-3.4 | 최단 대피경로를 계산하여 아이가 그린 경로와 비교한다 | 필수 |
| FR-3.5 | 도달 불가능한 공간(고립 노드)을 탐지한다 | 필수 |
| FR-3.6 | 규칙 위반 시 힌트 → 힌트 → 정답의 3단계 피드백을 제공한다 | 필수 |
| FR-3.7 | 규칙 통과 시 칭찬 피드백을 제공한다 | 필수 |
| FR-3.8 | 평면도 변경 시 실시간(디바운스 300ms)으로 재평가한다 | 권장 |

#### FR-4. 챗봇

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-4.1 | 소방청 캐릭터(영이/웅이/일구)가 화자로 표시된다 | 필수 |
| FR-4.2 | **버튼 카드가 주 입력 수단**이며, 항상 2~4개의 다음 질문 카드가 제시된다 (P3) | 필수 |
| FR-4.3 | 자유 텍스트 입력을 보조 수단으로 지원한다 | 필수 |
| FR-4.4 | 자유 입력은 개념 사전 기반 의미 매칭으로 답변을 검색한다 | 필수 |
| FR-4.5 | 신뢰도 임계값 미달 시 추측하지 않고 후보 카드를 제시한다 (P2) | 필수 |
| FR-4.6 | **현재형 위험 표현을 최우선으로 감지**하여 119 안내로 분기한다 | 필수 |
| FR-4.7 | 평면도 대상 질문("내 대피경로 괜찮아?")은 검증 엔진으로 라우팅한다 | 필수 |
| FR-4.8 | 답변은 쉬움/보통 두 난이도로 전환할 수 있다 | 필수 |
| FR-4.9 | 답변을 음성으로 읽어줄 수 있다 (Web Speech API) | 권장 |
| FR-4.10 | 아이 혼자 알 수 없는 정보는 "보호자에게 여쭤보기" 미션 카드로 전환한다 | 필수 |
| FR-4.11 | 챗봇 패널은 접을 수 있으며, 접힌 상태에서도 캐릭터 말풍선 알림이 가능하다 | 권장 |

#### FR-5. 3D 화재 대피 시뮬레이션

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-5.1 | 아이가 그린 2D 평면도를 3D로 변환하여 표시한다 | 필수 |
| FR-5.2 | 화점(발화 지점)을 임의 또는 지정으로 설정할 수 있다 | 필수 |
| FR-5.3 | 화재와 연기가 격자 기반으로 시간에 따라 확산된다 | 필수 |
| FR-5.4 | **연기는 화재보다 빠르게 확산된다** (교육 목적) | 필수 |
| FR-5.5 | 플레이어 캐릭터를 조작하여 대피할 수 있다 | 필수 |
| FR-5.6 | 자세(서기/낮은 자세)에 따라 연기 노출량과 시야가 달라진다 | 필수 |
| FR-5.7 | 문을 만져 온도를 확인하는 액션이 있으며, 뜨거운 문을 열면 불리하게 작동한다 | 권장 |
| FR-5.8 | 엘리베이터는 화재 시 작동하지 않는다 | 필수 |
| FR-5.9 | 닫힌 문은 화재·연기 확산을 크게 지연시킨다 | 필수 |
| FR-5.10 | 성공/실패 결과와 원인을 챗봇이 설명하고, 실패 시 그리기 단계로 돌아가도록 유도한다 | 필수 |
| FR-5.11 | 저사양 모드(그림자·파티클 축소)를 제공한다 | 필수 |

#### FR-6. 인쇄 및 저장

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-6.1 | A4 세로 1장 종합형 피난안내도를 인쇄할 수 있다 | 필수 |
| FR-6.2 | 인쇄물은 **흑백 인쇄에서도 모든 정보가 판독 가능**해야 한다 (P4) | 필수 |
| FR-6.3 | 인쇄물에 손글씨 기입란(가족 집결 장소, 보호자 연락처)을 포함한다 | 필수 |
| FR-6.4 | PNG 이미지로 내보낼 수 있다 | 필수 |
| FR-6.5 | 작업 상태를 localStorage에 자동 저장한다 | 필수 |
| FR-6.6 | 작업 상태를 JSON 파일로 내보내고 불러올 수 있다 | 필수 |
| FR-6.7 | 저장 데이터에 스키마 버전을 포함하고 마이그레이션을 지원한다 | 필수 |

### 2.2 비기능 요구사항

| ID | 요구사항 | 측정 기준 |
|---|---|---|
| NFR-1 | **오프라인 완전 동작** | 네트워크 차단 상태에서 전 기능 정상 동작 |
| NFR-2 | **단일 HTML 파일 배포 가능** | 빌드 산출물이 외부 파일 참조 없는 `.html` 1개 |
| NFR-3 | 단일 파일 크기 | 8MB 이하 (목표 5MB) |
| NFR-4 | 최초 로딩 시간 | 로컬 파일 기준 3초 이내 (중급 사양 PC) |
| NFR-5 | 3D 시뮬레이션 프레임레이트 | 통합 그래픽 노트북에서 30fps 이상 (저사양 모드) |
| NFR-6 | 에디터 조작 응답 | 드래그·배치 반응 16ms 이내 |
| NFR-7 | **외부 네트워크 통신 없음** | 코드 내 `fetch`/`XMLHttpRequest`의 외부 호출 0건 |
| NFR-8 | 브라우저 지원 | Chrome/Edge 최신 2개 버전, Safari 16+, Firefox 최신 |
| NFR-9 | 터치 지원 | 태블릿에서 드래그·핀치줌 동작 |
| NFR-10 | 접근성 | 최소 터치 타겟 44×44px, 본문 대비비 4.5:1 이상 |
| NFR-11 | 순수 로직 테스트 커버리지 | 그래프·규칙엔진·검색기·시뮬레이션 코어 80% 이상 |

### 2.3 제약사항

| ID | 제약 | 영향 |
|---|---|---|
| **CON-1** | 런타임 생성형 AI 사용 금지 (P1) | 챗봇은 정적 지식베이스 + 결정론적 검색 |
| **CON-2** | 서버 없음. 백엔드 API 없음 | 모든 상태는 클라이언트에 존재 |
| **CON-3** | `file://` 프로토콜에서 동작해야 함 | ES 모듈 동적 로딩·`fetch` 사용 불가 → **모든 자원 인라인 필수** |
| **CON-4** | 3D 에셋(모델·텍스처) 사용 불가 | 3D 지오메트리는 **코드로 절차적 생성** |
| **CON-5** | 소방청 캐릭터는 2D 이미지로만 제공됨 | 캐릭터는 2D 스프라이트로 표현, 3D 캐릭터 없음 |
| **CON-6** | 캐릭터 이미지 사용은 소방청 허가 필요 | 개발 중에는 **플레이스홀더 사용**, 배포 전 교체 |
| **CON-7** | 개발 인력 1인 | 마일스톤 단위 점진 개발 필수, 동시 진행 금지 |
| **CON-8** | 아동 개인정보 수집 금지 | 이름·연락처·주소를 앱에 저장하지 않음. 인쇄물 손글씨란으로 대체 |

### 2.4 범위 제외 (Out of Scope)

명시적으로 만들지 않는 것. Claude Code가 임의로 추가하지 않도록 한다.

- 사용자 계정, 로그인, 회원가입
- 서버 저장, 클라우드 동기화, 학급 관리 기능
- 다국어 지원
- 학생 활동 데이터 수집·분석·전송
- 실시간 멀티플레이
- 화재 외 재난의 3D 시뮬레이션 (지진·침수·가스는 2D 검증까지만) — 3단계 이후 검토
- 실제 건축 도면 파일(DWG/DXF) 입출력

---
## 3. 아키텍처

### 3.1 기술 스택

| 영역 | 선택 | 근거 |
|---|---|---|
| 언어 | **TypeScript 5.x (strict)** | 데이터 모델이 세 모듈에 공유되므로 타입 안정성이 필수. Claude Code의 산출물 품질도 타입이 있을 때 크게 올라간다 |
| 빌드 | **Vite 5.x** | 단일 파일 번들 플러그인 생태계, 빠른 HMR |
| 단일 파일 | **vite-plugin-singlefile** | NFR-2/CON-3 충족. JS·CSS·에셋을 하나의 HTML에 인라인 |
| UI | **React 18** | 에디터·챗봇 UI가 상태 주도적. Claude Code 학습량이 가장 많아 산출물이 안정적 |
| 상태 | **Zustand** | 평면도 상태를 React UI와 Three.js 렌더 루프가 **함께** 구독해야 함. Context보다 렌더 루프 친화적 |
| 평면도 렌더 | **SVG (React 엘리먼트)** | ① 인쇄 시 벡터 → 선명 ② 요소별 이벤트 핸들링이 쉬움 ③ PNG 변환 용이. Canvas보다 이 프로젝트에 적합 |
| 3D | **Three.js r16x** | 절차적 지오메트리만 사용 (CON-4). react-three-fiber는 **사용하지 않음** — 시뮬레이션 루프를 직접 제어해야 함 |
| 테스트 | **Vitest** | Vite와 동일 설정 공유. core 순수 함수 대상 |
| 품질 | ESLint + Prettier | — |

**의존성 최소화 원칙**: 위 목록 외의 런타임 의존성 추가는 금지한다. UI 컴포넌트 라이브러리, 아이콘 패키지, 애니메이션 라이브러리, 상태 관리 추가 도입 모두 불가 (NFR-3, 단일 파일 크기).

> 파일 크기가 NFR-3을 넘으면 첫 번째 대응은 `react`/`react-dom`을 `preact/compat`으로 alias 하는 것이다 (약 40KB 절감). 이는 최적화 단계(M10)에서만 검토한다.

### 3.2 시스템 구성

```
┌──────────────────────────────────────────────────────────┐
│                        UI Layer (React)                   │
│  ┌──────────┐ ┌────────┐ ┌──────────┐ ┌─────────┐        │
│  │ Editor   │ │ Chat   │ │ Sim3D    │ │ Print   │        │
│  │ (SVG)    │ │ Panel  │ │ (Three)  │ │ (SVG)   │        │
│  └────┬─────┘ └───┬────┘ └────┬─────┘ └────┬────┘        │
└───────┼───────────┼───────────┼────────────┼─────────────┘
        │           │           │            │
┌───────▼───────────▼───────────▼────────────▼─────────────┐
│                   Store (Zustand)                         │
│   planStore · routeStore · chatStore · simStore · uiStore │
└───────┬───────────┬───────────┬────────────┬─────────────┘
        │           │           │            │
┌───────▼───────────▼───────────▼────────────▼─────────────┐
│              Core (순수 함수 — DOM/React 의존 없음)        │
│  graph/  rules/  chat/  sim/  grid/                       │
└───────────────────────────┬───────────────────────────────┘
                            │ 읽기 전용
┌───────────────────────────▼───────────────────────────────┐
│              Content (정적 JSON — 코드 아님)               │
│  knowledge · concepts · rules messages · blocks · templates│
└───────────────────────────────────────────────────────────┘
```

### 3.3 의존 방향 규칙 (엄수)

```
UI  →  Store  →  Core  →  Content
```

- **`src/core/**` 안에서 `react`, `three`, `zustand`, `document`, `window`를 import 하는 것을 금지한다.** ESLint 규칙으로 강제한다.
- Core는 입력을 받아 결과를 반환하는 순수 함수만 노출한다. 이 규칙이 지켜져야 NFR-11(테스트 커버리지)이 달성 가능하다.
- Content는 JSON 데이터일 뿐 로직을 포함하지 않는다. 유일한 예외는 빌드 시 검증 스크립트(`content/validate.ts`).

### 3.4 디렉터리 구조

```
evacmap/
├── CLAUDE.md                    # Claude Code 상시 지침 (부록 B)
├── docs/
│   ├── DESIGN.md                # 이 문서
│   └── CONTENT_SOURCES.md       # 콘텐츠 출처 원장
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── .eslintrc.cjs
├── assets/
│   └── characters/              # 소방청 캐릭터 PNG (빌드 시 base64 인라인)
│       ├── yeongi_*.png
│       ├── ungi_*.png
│       └── ilgu_*.png
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── types/                   # ★ 4장의 타입 정의를 그대로 배치
│   │   ├── plan.ts
│   │   ├── graph.ts
│   │   ├── rules.ts
│   │   ├── knowledge.ts
│   │   ├── sim.ts
│   │   ├── chat.ts              # ChatResponse, ChatCard (§5.4.5)
│   │   ├── save.ts
│   │   └── index.ts             # 배럴. plan.ts는 아무것도 import 하지 않는다
│   ├── core/                    # ★ 순수 로직 (테스트 대상)
│   │   ├── grid/
│   │   │   ├── geometry.ts      # 사각형 인접, 셀 순회, 스냅
│   │   │   └── occupancy.ts     # 셀→방 매핑, 충돌 검사
│   │   ├── graph/
│   │   │   ├── build.ts         # 평면도 → 그래프
│   │   │   ├── pathfind.ts      # BFS/다익스트라
│   │   │   └── analyze.ts       # 연결성, 고립, 다중경로
│   │   ├── rules/
│   │   │   ├── engine.ts        # 규칙 평가 러너
│   │   │   └── definitions/     # RULE-* 개별 정의
│   │   ├── chat/
│   │   │   ├── normalize.ts     # 한글 정규화, 자모 분해
│   │   │   ├── invertedIndex.ts
│   │   │   ├── search.ts        # 점수 계산
│   │   │   ├── emergency.ts     # RT0 위험 감지
│   │   │   ├── constants.ts     # 검색 임계값 (§5.4.4)
│   │   │   └── router.ts        # 의도 라우팅
│   │   └── sim/
│   │       ├── automaton.ts     # 화재·연기 확산
│   │       ├── player.ts        # 이동·자세·노출
│   │       └── scoring.ts       # 성공/실패 판정과 원인
│   ├── content/                 # ★ 정적 데이터
│   │   ├── concepts.json
│   │   ├── knowledge/
│   │   │   ├── fire.json
│   │   │   ├── earthquake.json
│   │   │   ├── flood.json
│   │   │   ├── gas.json
│   │   │   └── general.json
│   │   ├── emergency.json
│   │   ├── bannedPhrases.json   # CT-9 금지 표현
│   │   ├── sources.json
│   │   ├── blocks.json          # 팔레트 정의
│   │   ├── ruleMessages.json
│   │   ├── templates/           # 기본 평면도 3종
│   │   └── validate.ts          # 빌드 전 검증 (P6 강제)
│   ├── store/
│   │   ├── planStore.ts
│   │   ├── routeStore.ts
│   │   ├── chatStore.ts
│   │   ├── simStore.ts
│   │   ├── migrate.ts           # 저장 스키마 마이그레이션 (§4.8)
│   │   └── uiStore.ts
│   ├── ui/
│   │   ├── editor/
│   │   ├── chat/
│   │   ├── sim3d/
│   │   ├── print/
│   │   └── common/
│   └── styles/
└── tests/
    ├── graph.test.ts
    ├── rules.test.ts
    ├── search.test.ts
    └── sim.test.ts
```

### 3.5 빌드 및 배포

**빌드 산출물 2종:**

| 산출물 | 명령 | 용도 |
|---|---|---|
| `dist/index.html` (단일 파일) | `npm run build:single` | 다운로드 배포. 더블클릭으로 실행 |
| `dist/` (PWA) | `npm run build:web` | 소방청 웹사이트 게시. 오프라인 캐시 + 업데이트 가능 |

**`vite.config.ts` 핵심 설정:**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

const single = process.env.BUILD_TARGET === 'single'

export default defineConfig({
  plugins: [react(), ...(single ? [viteSingleFile()] : [])],
  build: {
    assetsInlineLimit: single ? 100_000_000 : 4096, // 단일 파일 시 모든 에셋 인라인
    cssCodeSplit: !single,
    rollupOptions: { output: { inlineDynamicImports: single } },
  },
})
```

**CON-3 검증 절차 (M0에서 반드시 수행):**

1. `npm run build:single`
2. `dist/index.html`을 다른 폴더로 복사
3. **파일 탐색기에서 더블클릭**하여 실행 (`file://`)
4. 콘솔 에러 0건, 전 기능 동작 확인

> 이 검증을 M0에서 통과시키지 않으면, 개발 후반에 "로컬에서 안 열린다"는 문제로 아키텍처를 갈아엎게 된다. **최우선 과제다.**

### 3.6 콘텐츠 검증 게이트 (P6 강제)

검증은 **두 모드**로 동작한다. 개발 중 콘텐츠가 미완성이어도 빌드가 막히지 않게 하기 위함이다.

| 명령 | 모드 | `TODO-VERIFY` | 사용 시점 |
|---|---|---|---|
| `npm run validate` | 개발 | **경고** (개수 출력) | M3~M8 개발 중 |
| `npm run validate:strict` | 배포 | **실패** | `build:single` / `build:web` 이 자동 실행 |

구조적 오류(깨진 링크, 누락 필드 등)는 **두 모드 모두에서 실패**한다. 아래를 검사한다.

- 모든 `KnowledgeEntry.sourceIds`가 비어 있지 않고, `sources.json`에 존재하는 ID인가
- 모든 `RuleDef.sourceIds`가 유효한가
- `answer.easy`와 `answer.normal`이 모두 존재하는가
- `concepts.json`의 surface에 중복이 있는가 (충돌 시 검색 정확도 하락)
- `related`/`followUpCards`가 존재하는 엔트리 ID를 가리키는가 (깨진 링크 = P3 위반)
- 모든 `disaster` 값이 4종 중 하나인가
- `bannedPhrases.json`의 금지 표현이 답변 문장에 포함되어 있는가 (CT-9)
- `sourceIds`에 `TODO-VERIFY`가 남아 있는가 (strict 모드에서만 실패)

---

## 4. 데이터 모델

아래 타입 정의는 **그대로 `src/types/`에 배치한다.** 구현 중 변경이 필요하면 이 문서를 먼저 수정한다.

> **파일 간 참조 규칙**: 타입은 파일을 넘나들어 참조된다 (`graph.ts`는 `plan.ts`의 `OpeningKind`·`Cell`·`DisasterType`을, `rules.ts`는 `save.ts`의 `UserProfile`을 사용한다). 각 파일에서 `import type { ... } from './plan'` 형태로 명시적으로 import 한다. 배럴 파일(`types/index.ts`)을 만들어 재수출하되, **순환 참조가 생기지 않도록 `plan.ts`는 다른 타입 파일을 import 하지 않는다.**

### 4.1 공통 (`types/plan.ts`)

```ts
export type DisasterType = 'fire' | 'earthquake' | 'flood' | 'gas'

/** 화재 시나리오. 소방청 '상황별 대피' 지침 반영 (§6.1) */
export type FireScenario = 'exit_available' | 'exit_blocked'

/**
 * 통행 가능성·경로 탐색·규칙 평가의 **단일 기준 키**.
 * 화재는 시나리오 2종이 서로 다른 통행 조건을 갖기 때문에
 * DisasterType이 아니라 이 키로 모든 분기를 통일한다.
 */
export type ScenarioKey =
  | 'fire_exit_available'
  | 'fire_exit_blocked'
  | 'earthquake'
  | 'flood'
  | 'gas'

export function scenarioKey(d: DisasterType, sc?: FireScenario): ScenarioKey {
  if (d === 'fire') return sc === 'exit_blocked'
    ? 'fire_exit_blocked' : 'fire_exit_available'
  return d as ScenarioKey
}

export type LayerId = 'home' | 'common'   // 집 내부 / 현관 밖 공용부
export type Side = 'N' | 'E' | 'S' | 'W'

export interface Cell { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export interface GridSpec {
  width: number    // 기본 24
  height: number   // 기본 16
}
```

### 4.2 블록 (`types/plan.ts`)

```ts
export type RoomKind =
  | 'bedroom' | 'living' | 'kitchen' | 'bath' | 'entry'
  | 'balcony' | 'utility' | 'corridor' | 'stair' | 'elevator_hall'

export type OpeningKind =
  | 'door'            // 방문
  | 'front_door'      // 현관문
  | 'inner_door'      // 중문
  | 'window'          // 창문
  | 'balcony_window'  // 발코니 창
  | 'emergency_exit'  // 비상구 (공용부)

/** 피난설비. 대체 대피로의 근거가 되므로 그래프 엣지를 만든다 */
export type SafetyKind =
  | 'light_partition'    // 경량칸막이
  | 'refuge_area'        // 대피공간
  | 'descending_hatch'   // 하향식 피난구
  | 'descent_device'     // 완강기
  | 'extinguisher'       // 소화기
  | 'detector'           // 감지기
  | 'gas_valve'          // 가스 중간밸브

export type FurnitureKind =
  | 'bed' | 'sofa' | 'desk' | 'wardrobe' | 'bookshelf'
  | 'dining_table' | 'fridge' | 'tv'

export type HazardKind =
  | 'gas_range' | 'boiler' | 'power_strip' | 'heater' | 'candle'

export type MarkerKind = 'meeting_point' | 'my_spot' | 'ground_exit'

export type BlockId = string

export interface RoomBlock {
  kind: 'room'
  id: BlockId
  layer: LayerId
  roomKind: RoomKind
  rect: Rect
  label: string          // 사용자 지정 이름 ("내 방")
}

export interface OpeningBlock {
  kind: 'opening'
  id: BlockId
  layer: LayerId
  openingKind: OpeningKind
  cell: Cell             // 개구부가 속한 셀
  side: Side             // 그 셀의 어느 벽면인가
  closedByDefault: boolean
}

export interface PointBlock {
  kind: 'safety' | 'furniture' | 'hazard' | 'marker'
  id: BlockId
  layer: LayerId
  subKind: SafetyKind | FurnitureKind | HazardKind | MarkerKind
  cell: Cell
  rotation: 0 | 90 | 180 | 270
}

export type Block = RoomBlock | OpeningBlock | PointBlock

export interface FloorPlan {
  grid: GridSpec
  blocks: Block[]
}
```

**설계 주석**

- 방은 **직사각형만** 허용한다. L자 방은 직사각형 2개를 붙여 표현한다. 이 제약이 인접 판정을 결정론적으로 만들고, 초등학생의 조작 난이도도 낮춘다.
- 개구부는 `(cell, side)`로 정의된다. 그 셀이 속한 방과, 반대편 셀이 속한 방을 잇는 엣지가 된다. 반대편이 어떤 방에도 속하지 않으면 **집 밖(outdoor)** 노드로 연결된다.
- 경량칸막이·하향식피난구는 `PointBlock`이지만 **그래프에서 특수 엣지를 생성**한다 (§4.3).

### 4.3 그래프 (`types/graph.ts`)

```ts
export type NodeKind = 'room' | 'refuge' | 'stair' | 'elevator' | 'virtual'

/** 평면도에 그려지지 않는 도달 목표. 셀을 갖지 않는다 */
export type VirtualId = 'outdoor' | 'neighbor' | 'below' | 'upstairs'

export interface GraphNode {
  id: string                // 실노드는 BlockId, 가상노드는 'VN_outdoor' 등
  kind: NodeKind
  label: string
  /** kind === 'virtual' 일 때만 존재 */
  virtualId?: VirtualId
  /** kind !== 'virtual' 일 때만 존재 */
  layer?: LayerId
  roomBlockId?: BlockId
  cells?: Cell[]
  centroid?: Cell
  hazards: HazardKind[]     // 이 공간에 있는 위험원
  hasWindow: boolean
  /** 지상으로 직접 연결되는가. stair 노드의 목표 판정에 사용 */
  reachesGround?: boolean
}

export type EdgeVia =
  | OpeningKind
  | 'light_partition'
  | 'descending_hatch'
  | 'descent_device'
  | 'stair_up'              // 계단 → 위층 (침수 시 상향 대피)
  | 'adjacent'              // 개구부 없이 붙어 있음 (=벽. 통행 불가)

/** 재난별 통행 가능성 */
export type Passability = 'open' | 'conditional' | 'blocked'

export interface GraphEdge {
  id: string
  a: string                 // GraphNode.id (항상 실노드 쪽)
  b: string                 // 가상 노드일 수 있음
  via: EdgeVia
  cost: number              // 격자 거리 기반
  /** ★ DisasterType이 아니라 ScenarioKey로 키를 잡는다 (치명 이슈 해소) */
  passability: Record<ScenarioKey, Passability>
  /**
   * ★ 가상 노드 도달 판정의 근거.
   * 이 엣지를 통과하기 직전에 서 있어야 하는 실제 셀(개구부/설비가 놓인 셀).
   * `EvacRoute.waypoints`의 마지막 셀이 이 값과 같고 해당 엣지가 통행 가능하면
   * "그 노드에 도달했다"고 판정한다. 가상 노드에는 cells가 없으므로 이 필드가 유일한 판정 수단이다.
   */
  anchorCell?: Cell
  /** conditional인 경우 조건 설명 키. content/ruleMessages.json 의 `conditions` 섹션을 참조 */
  conditionKey?: string
}

/** 재난/시나리오별 도달 목표 집합. 규칙과 경로탐색이 **이 함수 하나만** 참조한다 */
export function goalNodeIds(
  g: PlanGraph, key: ScenarioKey, profile: UserProfile,
): string[]

export interface PlanGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  nodeById: Record<string, GraphNode>
  adjacency: Record<string, GraphEdge[]>
}
```

**엣지 통행 가능성 기본값 표** (`DEFAULT_PASSABILITY: Record<EdgeVia, Record<ScenarioKey, Passability>>`)

| via | fire ① 나갈 수 있음 | fire ② 못 나감 | earthquake | flood | gas |
|---|---|---|---|---|---|
| `door` / `inner_door` | open | open | open | open | open |
| `front_door` | open | **blocked** | open | open | open |
| `window` | conditional | conditional | conditional | conditional | open |
| `balcony_window` | open | open | open | open | open |
| `emergency_exit` | open | open | open | open | open |
| `light_partition` | blocked | **open** | blocked | blocked | blocked |
| `descending_hatch` | blocked | **open** | blocked | blocked | blocked |
| `descent_device` | blocked | **conditional** | blocked | blocked | blocked |
| `stair_up` | blocked | blocked | blocked | **open** | blocked |
| `adjacent` | blocked | blocked | blocked | blocked | blocked |

**핵심 설계**: 시나리오 ①과 ②를 별도 그래프로 만들지 않는다. **하나의 그래프에 두 벌의 통행 가능성을 함께 담고**, 평가 시 `ScenarioKey`로 조회한다. 이 때문에 `buildGraph`는 시나리오 인자를 받지 않아도 되며, 탭 전환이 그래프 재생성 없이 즉시 반영된다.

- 대피공간(`refuge_area`)으로 향하는 엣지는 `via: 'door'`(방화문)이므로 두 시나리오 모두 open이다. 시나리오 ②에서 `front_door`가 막히면 남는 목표가 대피공간·경량칸막이·하향식피난구뿐이 된다 — §6.1 지침이 그래프 구조로 자동 구현되는 셈이다.
- `descent_device`(완강기)가 ②에서도 `conditional`인 이유: 아동 단독 사용이 부적합하기 때문이다. 이 엣지가 채택되면 챗봇은 반드시 "어른과 함께" 문구를 포함해야 한다 (`conditionKey`).
- `conditional` 엣지는 최단경로 계산에서 **기본 제외**하고, 정상 경로가 없을 때만 포함하여 재탐색한다.

**목표 노드 집합** (`goalNodeIds` — 규칙과 경로탐색의 유일한 기준)

| ScenarioKey | 목표 |
|---|---|
| `fire_exit_available` | `VN_outdoor` + `reachesGround === true` 인 `stair` |
| `fire_exit_blocked` | `refuge` 노드 + `VN_neighbor` + `VN_below` |
| `earthquake` | `VN_outdoor` + `reachesGround` `stair` |
| `flood` (`lowFloor === true`) | `VN_upstairs` |
| `flood` (`lowFloor === false`) | `VN_outdoor` + `reachesGround` `stair` |
| `gas` | `VN_outdoor` + `reachesGround` `stair` |

> `reachesGround`: `stair` 노드가 `ground_exit` 마커를 포함하거나 `VN_outdoor`와 직접 연결되면 `true`. **레이어 2(FR-1.9)를 사용하지 않으면 `stair` 노드 자체가 존재하지 않으며, 이때는 `VN_outdoor`만이 목표가 된다.** 규칙은 이 경우에도 정상 동작해야 한다.

### 4.4 대피경로 (`types/plan.ts`)

```ts
export interface EvacRoute {
  disaster: DisasterType
  scenario?: FireScenario      // disaster === 'fire' 일 때만
  startCell: Cell              // 보통 '내 방'
  waypoints: Cell[]            // 아이가 그린 경로 (연속된 인접 셀)
  /** 지진 전용: 흔들림이 멈출 때까지 머무는 1차 대피처 */
  primaryShelter?: Cell
  meetingPointBlockId?: BlockId
}

export interface RouteSet {
  fire_exit_available?: EvacRoute
  fire_exit_blocked?: EvacRoute
  earthquake?: EvacRoute
  flood?: EvacRoute
  gas?: EvacRoute
}
```

### 4.5 규칙 엔진 (`types/rules.ts`)

```ts
export type RuleSeverity = 'critical' | 'important' | 'tip'

export interface RuleContext {
  plan: FloorPlan
  graph: PlanGraph
  route?: EvacRoute
  /** ★ 평가의 단일 기준. disaster/scenario는 여기서 파생된다 */
  key: ScenarioKey
  disaster: DisasterType
  scenario?: FireScenario
  profile: UserProfile      // types/save.ts
}

export interface RuleResult {
  ruleId: string
  status: 'pass' | 'fail' | 'na'    // na = 평가 조건 미충족 (예: 경로 미작성)
  /** 하이라이트할 대상. 에디터가 이 셀/블록을 강조 표시한다 */
  targets: { cells?: Cell[]; blockIds?: BlockId[] }
  /** 메시지 템플릿에 치환할 값. 예: { roomName: '화장실' } */
  params: Record<string, string>
}

export interface RuleMessages {
  hint1: string      // 1단계: 스스로 보게 하는 질문
  hint2: string      // 2단계: 좁혀주는 질문
  answer: string     // 3단계: 정답 공개
  praise: string     // 통과 시
}

export interface RuleDef {
  id: string                         // 'RULE-F-01'
  title: string
  disasters: DisasterType[]
  scenarios?: FireScenario[]
  severity: RuleSeverity
  evaluate: (ctx: RuleContext) => RuleResult
  sourceIds: string[]                // P6: 비어 있으면 빌드 실패
}

export interface RuleReport {
  disaster: DisasterType
  scenario?: FireScenario
  passed: RuleResult[]
  failed: RuleResult[]
  /** 심각도 순 정렬된 다음 지적 대상 1건. 챗봇이 한 번에 하나씩만 말한다 */
  nextIssue?: RuleResult
  completeness: number               // 0~1. 인쇄 버튼 활성화 판단용
}
```

**메시지와 로직의 분리**: `RuleDef`는 로직만 갖고, 문장은 `content/ruleMessages.json`에서 `ruleId`로 조회한다. 문장 수정이 코드 수정을 유발하지 않게 하기 위함이다(콘텐츠 검수 단계에서 중요).

### 4.6 지식베이스 (`types/knowledge.ts`)

```ts
export type ConceptId = string

export interface Concept {
  id: ConceptId               // 'fire', 'elevator', 'smoke'
  label: string               // '화재'
  /** 이 개념으로 정규화될 표면형. 오타·구어체·줄임말 포함 */
  surfaces: string[]
  /** 희소할수록 변별력이 높다. 미지정 시 코퍼스에서 자동 계산 */
  idf?: number
}

export interface Source {
  id: string                  // 'nfa-apt-manual'
  title: string
  publisher: string           // '소방청'
  url?: string
  retrievedAt: string         // ISO date
}

export interface KnowledgeEntry {
  id: string
  concepts: ConceptId[]
  disasters: DisasterType[]
  /** 버튼 카드에 표시될 대표 질문 */
  question: string
  answer: { easy: string; normal: string }
  /** 답변 후 제시할 후속 질문 카드 (P3: 항상 1개 이상) */
  followUpCards: string[]
  /** 보호자에게 물어봐야 하는 항목인가 (FR-4.10) */
  requiresGuardian?: boolean
  /** 답변과 함께 에디터에서 강조할 블록 종류 */
  highlightBlocks?: string[]
  sourceIds: string[]         // P6
}

export interface EmergencyPattern {
  id: string
  /** 현재형 위험 표현. 재현율 우선 — 오탐은 허용, 미탐은 불가 */
  surfaces: string[]
}

export interface SearchContext {
  currentDisaster: DisasterType
  gradeMode: 'easy' | 'normal'
}

export type SearchResult =
  | { type: 'answer'; entry: KnowledgeEntry; score: number }
  | { type: 'candidates'; entries: KnowledgeEntry[] }
  | { type: 'fallback' }

export interface InvertedIndex {
  /** conceptId → 해당 개념을 가진 엔트리 ID 목록 */
  byConcept: Record<ConceptId, string[]>
  /** 표면형 → conceptId (정규화 후 완전일치용) */
  surfaceToConcept: Record<string, ConceptId>
  /** 음절 2-gram → 엔트리 ID 목록 (오타 대응 보조) */
  byBigram: Record<string, string[]>
  /** 엔트리 ID → 그 엔트리의 2-gram 집합. 점수 계산의 분자에 필요 */
  entryBigrams: Record<string, string[]>
  entries: Record<string, KnowledgeEntry>
  idf: Record<ConceptId, number>
}
```

### 4.7 시뮬레이션 (`types/sim.ts`)

```ts
export interface SimCell {
  /** 연소하중 0~1. 가구·용도에 따라 결정 */
  fuel: number
  temp: number          // 0~1 정규화
  state: 'intact' | 'burning' | 'burnt'
  /** 하부(호흡 높이) 연기 농도 0~1 */
  smokeLow: number
  /** 상부(천장) 연기 농도 0~1. 항상 smokeLow보다 먼저 찬다 */
  smokeHigh: number
  /** 벽 여부. 벽은 연소·확산을 차단 */
  isWall: boolean
}

export type Posture = 'stand' | 'crouch'

export interface PlayerState {
  cell: Cell
  posture: Posture
  /** 누적 연기 노출량 0~1. 1이면 실패 */
  exposure: number
  /** 남은 시야 반경 (셀). 연기 농도에 반비례 */
  visionRadius: number
}

export type SimStatus = 'ready' | 'running' | 'success' | 'failed'
export type FailReason = 'smoke' | 'flame' | 'timeout' | 'trapped'

export interface SimState {
  tick: number
  cells: SimCell[]                     // width*height 1차원 배열
  doorState: Record<BlockId, 'open' | 'closed'>
  ignitionCell: Cell
  player: PlayerState
  status: SimStatus
  failReason?: FailReason
  /** 플레이어가 실제로 지나온 셀. matchedDrawnRoute 계산에 필요 */
  visited: Cell[]
  /** 결과 설명에 사용할 근거. 챗봇이 이 값으로 메시지를 고른다 */
  postMortem: {
    passedThroughHazard: boolean
    usedElevator: boolean
    leftDoorOpen: boolean
    stoodInSmoke: boolean
    matchedDrawnRoute: boolean
    /** 시작 시점에 이미 모든 출구가 화염·연기로 막혀 있었는가 */
    trappedFromStart: boolean
  }
}

export interface SimConfig {
  tickMs: number              // 기본 250
  fireSpreadRate: number      // 기본 0.06
  smokeSpreadRate: number     // 기본 0.22  ← 화재의 약 3.7배 (FR-5.4)
  doorClosedFactor: number    // 기본 0.08  ← 닫힌 문 통과 시 확산 계수
  crouchExposureFactor: number// 기본 0.35
  timeLimitTicks: number      // 기본 480 (=2분)
  /** 결정론적 재현용. pickIgnition의 가중 추첨은 이 시드만을 난수원으로 쓴다 */
  seed: number
}
```

### 4.8 저장 포맷 (`types/save.ts`)

```ts
export interface UserProfile {
  /** 1층 또는 반지하 거주 여부. 침수 규칙 분기의 유일한 입력 */
  lowFloor: boolean
  gradeMode: 'easy' | 'normal'
  blockStyle: 'kid' | 'blueprint'
  lowPerformanceMode: boolean
  ttsEnabled: boolean
}

export const SCHEMA_VERSION = 1

export interface SaveFile {
  schemaVersion: number
  createdAt: string
  updatedAt: string
  profile: UserProfile
  plan: FloorPlan
  routes: RouteSet
  progress: {
    completedSteps: string[]
    guardianMissions: { id: string; done: boolean }[]
    simAttempts: number
    simCleared: boolean
  }
}
```

**마이그레이션 규칙 (FR-6.7)**

```ts
// src/store/migrate.ts
const migrations: Record<number, (data: any) => any> = {
  // 1 → 2 예시
  // 1: (d) => ({ ...d, schemaVersion: 2, profile: { ...d.profile, newField: false } }),
}

export class SaveIncompatibleError extends Error {
  constructor(readonly foundVersion: number, readonly rawText: string) {
    super(`지원하지 않는 저장 형식입니다 (v${foundVersion})`)
  }
}

export function migrate(raw: any, rawText: string): SaveFile {
  if (typeof raw?.schemaVersion !== 'number')
    throw new SaveIncompatibleError(-1, rawText)
  // 미래 버전 파일 — 조용히 통과시키지 않는다
  if (raw.schemaVersion > SCHEMA_VERSION)
    throw new SaveIncompatibleError(raw.schemaVersion, rawText)
  let d = raw
  while (d.schemaVersion < SCHEMA_VERSION) {
    const fn = migrations[d.schemaVersion]
    if (!fn) throw new SaveIncompatibleError(d.schemaVersion, rawText)
    d = fn(d)
  }
  return d as SaveFile
}
```

`SaveIncompatibleError`가 발생하면 UI는 원본 텍스트(`rawText`)를 그대로 다시 내려받을 수 있는 버튼과 함께 안내를 표시한다. **현재 작업 상태를 덮어쓰지 않는다.**

> 스키마를 바꿀 때마다 `SCHEMA_VERSION`을 올리고 마이그레이션 함수를 추가한다. **로컬 배포 제품은 사용자 데이터를 서버에서 고쳐줄 수 없으므로**, 마이그레이션 실패 시 "이전 버전 파일입니다" 안내와 함께 원본을 보존해야 한다. 절대 조용히 덮어쓰지 않는다.

---
## 5. 모듈별 기능 명세

### 5.1 에디터 (`ui/editor/`)

#### 5.1.1 배치 상호작용

| 블록 종류 | 스냅 규칙 | 충돌 처리 |
|---|---|---|
| `RoomBlock` | 격자 셀 단위. 최소 2×2 | 다른 방과 **겹치면 배치 거부** (붉은 미리보기). 변을 맞대는 것은 허용 |
| `OpeningBlock` | 방 경계선(벽면)에만 스냅. 드래그 중 가장 가까운 벽면 하이라이트 | 같은 `(cell, side)`에 이미 있으면 교체 |
| `PointBlock` | 셀 중심 스냅 | 같은 셀에 동종 블록 중복 배치 거부 |

**방 크기 조절**: 선택 시 8개 핸들 표시. 드래그하면 격자 단위로 리사이즈. 리사이즈로 다른 방과 겹치게 되면 그 방향 확장을 차단한다.

**개구부 자동 유지**: 방을 이동/리사이즈하면 그 방 경계에 붙어 있던 개구부는 상대 위치를 유지하려 시도하고, 유지 불가능하면 삭제하며 챗봇이 알린다 (조용한 삭제 금지 — P3).

#### 5.1.2 블록 외형 (FR-1.8)

`blocks.json`에 종류별로 두 벌의 SVG path를 정의한다.

```json
{
  "id": "bed",
  "category": "furniture",
  "label": "침대",
  "size": { "w": 2, "h": 3 },
  "shapes": {
    "kid": "M4 8 h24 a4 4 0 0 1 4 4 v14 h-32 v-14 a4 4 0 0 1 4-4z ...",
    "blueprint": "M0 0 h32 v40 h-32z M0 10 h32"
  },
  "fuel": 0.9,
  "tags": ["combustible"]
}
```

- `kid`: 둥근 모서리, 굵은 외곽선, 채도 높은 색, 픽토그램 수준의 단순화
- `blueprint`: 얇은 선, 건축 도면 관례 기호, 무채색
- **전환은 `shapes` 키만 바꾸는 것이며 좌표계·크기·데이터는 동일하다.** 즉 외형 전환이 데이터에 영향을 주지 않는다.

#### 5.1.3 시작 템플릿 (FR-1.4)

`content/templates/`에 최소 3종:

| ID | 구성 |
|---|---|
| `apt_2room` | 현관·거실·주방·방2·욕실·발코니 |
| `apt_3room` | 위 + 방1 추가, 중문 포함 |
| `house_1f` | 단독주택 1층: 현관·거실·주방·방2·욕실·마당 출구 |

템플릿 선택 후 즉시 편집 가능 상태가 되며, 챗봇이 첫 미션(`"네 방은 어디야? 눌러서 알려줘"`)을 띄운다.

---

### 5.2 그래프 빌더 (`core/graph/build.ts`)

```
buildGraph(plan: FloorPlan, profile: UserProfile): PlanGraph

1) 점유 맵 생성
   occupancy: Map<"x,y", BlockId>
   for room of plan.blocks.filter(kind==='room'):
     for cell in cellsOf(room.rect): occupancy.set(key(cell), room.id)

2) 노드 생성
   for room: node = {
     id: room.id,
     kind: room.roomKind==='stair' ? 'stair'
         : room.roomKind==='elevator_hall' ? 'elevator'
         : 'room',
     cells, centroid, label,
     hazards: 해당 셀 위의 HazardKind 목록,
     hasWindow: 해당 방 경계에 window|balcony_window 존재 여부
   }
   가상 노드 추가 (kind: 'virtual', cells 없음):
     'VN_outdoor'      집 밖 / 지상
     'VN_neighbor'     인접 세대 (경량칸막이 너머)
     'VN_below'        아래층 (하향식 피난구 / 완강기)
     'VN_upstairs'     위층 (침수 시 상향 대피 목표)
   ※ refuge_area 블록이 있으면 그 셀 기준 kind:'refuge' 노드를 별도 생성한다.
   ※ stair 노드는 ground_exit 마커 포함 또는 VN_outdoor 직결 시 reachesGround=true

3) 개구부 엣지
   for op of openings:
     a = occupancy.get(key(op.cell))
     nb = step(op.cell, op.side)
     b = occupancy.get(key(nb)) ?? 'VN_outdoor'
     if (!a || a === b) → 경고 발행 후 skip
     edges.push({ a, b, via: op.openingKind, cost: 1,
                  passability: DEFAULT_PASSABILITY[op.openingKind],
                  anchorCell: op.cell })      // ★ 가상노드 도달 판정의 근거

4) 피난설비 특수 엣지  (anchorCell = 그 설비 블록이 놓인 셀)
   light_partition   → edge(room, 'VN_neighbor', via 'light_partition')
   descending_hatch  → edge(room, 'VN_below',    via 'descending_hatch')
   descent_device    → edge(room, 'VN_below',    via 'descent_device')
   refuge_area       → edge(room, refugeNode,    via 'door')   // 방화문
   stair(reachesGround 무관) → edge(stair, 'VN_upstairs', via 'stair_up')

5) 인접(벽) 엣지
   경계를 공유하지만 그 구간에 개구부가 없는 방 쌍 → via 'adjacent' (전 재난 blocked)
   ※ 통행용이 아니라 §5.3.2 RULE-C-05(벽 통과 검사)와 챗봇의 "여기는 벽이야" 안내에 사용한다.
     화재 확산 계산은 그래프가 아니라 셀·개구부를 직접 본다(§5.5.3).

6) 시나리오 오버라이드는 **불필요하다.**
   §4.3 DEFAULT_PASSABILITY 표가 ScenarioKey 5종의 값을 모두 담고 있으므로,
   탭 전환은 조회 키만 바꾸면 되고 그래프를 다시 만들지 않는다.
   profile.lowFloor 는 buildGraph 가 아니라 goalNodeIds() 에서만 사용한다.

7) 인덱스 구축 후 반환
```

#### 경로 탐색 (`core/graph/pathfind.ts`)

```ts
export interface EscapeResult {
  path: string[]            // node id 시퀀스
  cells: Cell[]             // 셀 단위 경로 (에디터 표시용). 길이 비교의 기준
  cost: number
  usedConditional: boolean  // 최후수단 설비를 사용했는가
  goalNodeId?: string
  found: boolean
}

export function findEscape(
  graph: PlanGraph,
  startNodeId: string,
  key: ScenarioKey,          // ★ DisasterType 아님
  profile: UserProfile,
): EscapeResult
```

절차:

1. `goals = goalNodeIds(graph, key, profile)` — §4.3의 표를 구현한 **단 하나의 함수**를 호출한다. 목표 집합을 다른 곳에서 다시 정의하지 않는다.
2. `passability[key] === 'open'` 인 엣지만으로 다익스트라 실행
3. 도달 실패 시 `conditional` 엣지를 포함하여 재실행하고 `usedConditional = true`
4. 그래도 실패하면 `found = false` → RULE-C-03 위반으로 처리

**가상 노드 도달의 셀 단위 판정** (모든 종점 규칙이 이 함수를 쓴다)

```ts
export function reachesGoal(
  g: PlanGraph, key: ScenarioKey, profile: UserProfile, lastCell: Cell,
): boolean {
  const goals = new Set(goalNodeIds(g, key, profile))
  for (const e of g.edges) {
    if (!goals.has(e.b)) continue
    if (e.passability[key] === 'blocked') continue
    if (e.anchorCell && sameCell(e.anchorCell, lastCell)) return true
  }
  // 목표가 실노드(refuge/stair)인 경우: 그 노드의 cells 안에 있으면 도달
  return goalNodeIds(g, key, profile)
    .some(id => g.nodeById[id]?.cells?.some(c => sameCell(c, lastCell)))
}
```

#### 연결성 분석 (`core/graph/analyze.ts`)

```ts
export interface Analysis {
  isolatedNodes: string[]        // 어떤 출구에도 도달 못 하는 노드
  exitCount: number              // 서로 다른 출구 경로 수. RULE-F-04 판정에 사용
  hasSecondaryEscape: boolean    // 현관 외 대체 피난수단 존재 여부
  articulationPoints: string[]   // 막히면 전체가 고립되는 병목 지점
}
```

`articulationPoints`(단절점)는 표준 DFS 기반 알고리즘으로 구한다. 챗봇이 `"거실이 막히면 방 세 개가 전부 갇혀. 다른 길이 있을까?"` 같은 고급 지적을 할 때 쓴다 (5~6학년 대상).

---

### 5.3 검증 규칙 엔진 (`core/rules/`)

#### 5.3.1 러너

```ts
export function evaluate(
  defs: RuleDef[],
  ctx: RuleContext,
): RuleReport {
  const applicable = defs.filter(d =>
    d.disasters.includes(ctx.disaster) &&
    (!d.scenarios || !ctx.scenario || d.scenarios.includes(ctx.scenario))
  )
  // 평가 조건이 갖춰지지 않은 규칙은 status:'na'를 반환하며 report에서 제외된다
  const results = applicable.map(d => d.evaluate(ctx))
  const byId = new Map(applicable.map(d => [d.id, d]))
  const failed = results.filter(r => r.status === 'fail')
  const passed = results.filter(r => r.status === 'pass')
  const order = { critical: 0, important: 1, tip: 2 }
  const sev = (r: RuleResult) => order[byId.get(r.ruleId)!.severity]
  failed.sort((a, b) => sev(a) - sev(b))
  return {
    disaster: ctx.disaster, scenario: ctx.scenario,
    passed, failed,
    nextIssue: failed[0],
    completeness: passed.length / (passed.length + failed.length || 1),
  }
}
```

**핵심 UX 규칙**: 챗봇은 `nextIssue` **한 건만** 말한다. 위반 목록을 한 번에 쏟아내면 아이가 압도된다 (P5). 하나 고치면 재평가되어 다음 것이 나온다.

#### 5.3.2 규칙 목록

각 규칙은 `core/rules/definitions/<id>.ts` 파일 하나로 구현하고, 문장은 `content/ruleMessages.json`에서 조회한다.

**공통 (전 재난)**

| ID | 제목 | 심각도 | 판정 |
|---|---|---|---|
| RULE-C-01 | 출발점 지정 | critical | `route.startCell`이 방 안에 있는가 |
| RULE-C-02 | 집 밖 집결 장소 지정 | important | `meeting_point` 마커 존재 |
| RULE-C-03 | 고립된 공간 없음 | critical | `analyze().isolatedNodes.length === 0` |
| RULE-C-04 | 경로 연속성 | critical | `waypoints`의 모든 인접 쌍이 상하좌우 인접인가 |
| RULE-C-05 | 벽 통과 없음 | critical | 인접한 두 waypoint가 서로 다른 방이면 그 경계에 개구부가 있는가 |
| RULE-C-06 | 경로 종점 유효 | critical | `reachesGoal(graph, ctx.key, profile, lastCell)` — §5.2의 함수를 그대로 사용한다. **종점 판정은 이 규칙 하나만 담당한다** |
| RULE-C-07 | 소화기 위치 파악 | tip | `extinguisher` 블록 존재. 미배치 시 **보호자 미션**으로 전환 |
| RULE-C-08 | 화재감지기 위치 파악 | tip | `detector` 블록 존재. 동일 |

**화재**

| ID | 제목 | 시나리오 | 심각도 | 판정 |
|---|---|---|---|---|
| RULE-F-01 | 현관문 경유 확인 | ① | important | 경로가 `front_door` 엣지를 실제로 통과하는가. **종점 판정은 RULE-C-06이 하므로 중복하지 않는다** |
| RULE-F-02 | 위험원 통과 회피 | ①② | important | 경로 셀에 `gas_range`/`boiler` 인접 셀 포함 여부. **단, 우회 경로가 실제로 존재할 때만 fail** |
| RULE-F-03 | 엘리베이터 미사용 | ①② | critical | 경로에 `elevator` 노드 미포함 |
| RULE-F-04 | 대체 피난수단 확보 | ①② | important | `hasSecondaryEscape === true` |
| RULE-F-05 | 시나리오② 대체 수단 안내 | ② | important | 채택된 대체 수단이 무엇인지 확인하고 사용법을 안내한다. **종점 유효성은 판정하지 않는다**(RULE-C-06 담당). 완강기(`descent_device`)가 쓰였으면 "어른과 함께" 문구 필수 |
| RULE-F-06 | 경로 효율 | ①② | tip | `route.waypoints.length <= findEscape(...).cells.length * 1.5` (최단경로 `found === true`일 때만 평가, 아니면 `na`) |
| RULE-F-07 | 발코니 활용 인지 | ② | tip | `balcony` 방 또는 피난설비 블록 존재 |

**지진**

| ID | 제목 | 심각도 | 판정 |
|---|---|---|---|
| RULE-E-01 | 1차 대피처 지정 | critical | `route.primaryShelter` 존재 |
| RULE-E-02 | 1차 대피처 안전성 | important | 해당 셀이 `wardrobe`/`bookshelf`/`tv`/창문 인접이 아닌가 |
| RULE-E-03 | 유리 밀집 구간 최소화 | tip | 경로 셀 중 창문 인접 셀 비율 |
| RULE-E-04 | 엘리베이터 미사용 | critical | 동일 |

**침수** (`profile.lowFloor`에 따라 분기)

| ID | 제목 | 조건 | 심각도 | 판정 |
|---|---|---|---|---|
| RULE-W-01 | 상향 대피 | `lowFloor === true` | important | 경로가 `stair_up` 엣지를 통과하는가. **종점 판정은 RULE-C-06(`goalNodeIds` = `VN_upstairs`)이 담당** |
| RULE-W-02 | 조기 이동 인지 | `lowFloor === true` | important | 지식 카드 노출 여부 (수위 상승 전 이동) |
| RULE-W-03 | 전기 위험 인지 | 전체 | tip | `power_strip` 블록 존재 시 관련 카드 노출 |

**가스**

| ID | 제목 | 심각도 | 판정 |
|---|---|---|---|
| RULE-G-01 | 중간밸브 위치 표시 | important | `gas_valve` 블록 존재. 미배치 시 보호자 미션 |
| RULE-G-02 | 환기 창문 표시 | important | 주방에 `window` 존재 |
| RULE-G-03 | 가스레인지 인접 통과 회피 | important | 경로가 `gas_range` 인접 셀 미포함 |
| RULE-G-04 | 전기 조작 금지 인지 | critical | 관련 지식 카드 확인 여부 (스위치·환풍기 조작 금지) |

> **종점 판정의 단일 책임**: 경로가 올바른 곳에서 끝났는가는 **RULE-C-06만** 판정하고, 목표 집합은 **`goalNodeIds()` 한 함수만** 정의한다. 재난별·시나리오별 규칙이 종점을 각자 판정하면 서로 반대 결론을 내어 아이가 어떤 경로를 그려도 critical 위반이 남는 상태에 빠진다(P3 위반). 개별 규칙은 "경로가 무엇을 경유했는가"만 본다.

> **RULE-F-02의 "우회 경로가 존재할 때만 fail" 조건은 반드시 지킨다.** 원룸이나 주방을 지나야만 현관에 닿는 구조에서 "주방을 피해라"라고 말하면 아이는 해결할 수 없는 요구를 받게 되고, 이는 P3 위반이다. 우회로가 없으면 대신 **주의 안내**로 전환한다: `"이 집은 주방을 지나야만 현관에 갈 수 있구나. 그러면 낮은 자세로 빠르게 지나가는 게 중요해."`

#### 5.3.3 3단계 피드백 상태 기계

```
issue 발생
   │
   ├─ 1회차 안내 → hint1   (스스로 보게 하는 질문)
   ├─ 2회차 안내 → hint2   (범위를 좁혀주는 질문)
   └─ 3회차 안내 → answer  (정답 공개 + 대상 하이라이트)

* "모르겠어" 버튼을 누르면 즉시 다음 단계로 건너뛴다.
* 규칙이 pass로 바뀌면 카운터를 리셋하고 praise를 출력한다.
* 카운터는 ruleId별로 유지되며 저장 파일에 포함하지 않는다(세션 한정).
```

---

### 5.4 챗봇 (`core/chat/`)

#### 5.4.1 라우팅 우선순위

```
handleInput(raw, ctx):
  RT0 detectEmergency(raw)        → EMERGENCY 응답, 즉시 종료
  RT1 detectCommand(raw)          → 지우기 / 처음부터 / 인쇄 / 저장 / 3D보기
  RT2 isAboutMyPlan(raw)          → 검증 엔진 결과로 응답
  RT3 searchKnowledge(raw)        → 점수 기반 응답
  RT4 fallback                    → 주제 카드 4종 제시
```

**RT2 판정**: 지시 표현

> 라우팅 계층은 `RT0~RT4`로 표기한다. 제품 원칙 `P1~P6`(§1.4)과 ID가 겹치지 않게 하기 위함이다.(`내`, `제`, `우리`, `이거`, `여기`, `이 길`, `내가 그린`) + 평면도 개념(`경로`, `길`, `대피`, `집`, `방`) 조합, 또는 검증 관련 개념(`맞아`, `괜찮아`, `잘했어`, `틀렸`)이 감지되면 P2로 라우팅한다.

#### 5.4.2 응급 감지 (RT0, FR-4.6)

```ts
// core/chat/emergency.ts
export function detectEmergency(raw: string): EmergencyPattern | null
```

- `content/emergency.json`의 surface를 **정규화 후 부분문자열 매칭**한다.
- **재현율 우선**: 오탐(연습인데 응급으로 분류)은 허용, 미탐은 절대 불가.
- 현재형 어미(`나요`, `났어`, `났어요`, `있어요`, `해요`, `못`)와 결합되면 가중치를 높인다.
- 매칭 시 다른 모든 처리를 중단하고 아래 고정 응답을 출력한다.

```
🚨 지금 진짜 위험한 거면 이 앱을 끄고 바로 119에 전화해.
   어른한테 큰 소리로 알리고, 밖으로 나가.

   [ 연습이에요 ]   ← 이 버튼을 눌러야만 정상 흐름으로 복귀
```

응급 응답 중에는 다른 카드·입력을 비활성화한다. "연습이에요"를 누르기 전에는 진행할 수 없다.

수집해야 할 surface 예시 (콘텐츠 단계에서 확장):
`불났어`, `불이나요`, `불나요`, `연기나요`, `연기가나`, `타는냄새`, `가스냄새나요`, `숨이막혀`, `못나가겠어`, `문이안열려`, `갇혔어`, `도와주세요`, `살려주세요`, `엄마가안일어나`, `피가나`, `무너졌어`, `물이차올라`

#### 5.4.3 한글 정규화 (`core/chat/normalize.ts`)

```ts
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s.,!?~"'`()[\]{}<>·…\-_/\\]/g, '')   // 공백·문장부호 제거
    .replace(/(.)\1{2,}/g, '$1$1')                   // 3회 이상 반복 → 2회 ("불이이이"→"불이이")
}

/** 초성 추출. 오타·부분입력 매칭 보조 */
export function chosung(s: string): string
/** 자모 분해. 편집거리 계산에 사용 */
export function decompose(s: string): string
/** 자모 단위 편집거리 */
export function jamoDistance(a: string, b: string): number
```

> **주의**: 한글은 음절 단위 편집거리가 부정확하다. `"엘베"`와 `"엘리베이터"`는 음절 거리로 멀지만 실제로는 동의어이므로, 이런 케이스는 **편집거리가 아니라 개념 사전의 surface에 직접 등록**해서 해결한다. 편집거리는 단순 오타(`화제`→`화재`) 보정용으로만 쓴다.

#### 5.4.4 검색 알고리즘 (`core/chat/search.ts`)

```
searchKnowledge(raw: string, ctx: SearchContext, idx: InvertedIndex) -> SearchResult

1) s = normalize(raw)
2) 개념 추출
   a. surfaceToConcept에 대해 최장 일치 우선 스캔 (문자열 위를 왼→오 진행)
   b. 미매칭 구간의 어절에 대해:
      - 길이 ≥ 3: jamoDistance ≤ 2 인 surface 탐색 → 매칭
      - 길이 2: 초성 완전 일치 surface 탐색 → 매칭
   → concepts: Set<ConceptId>
3) bigrams = 음절 2-gram 집합
4) 후보 수집: byConcept[c] ∪ byBigram[g]  (합집합)
5) 점수 계산
   conceptScore = Σ idf(c ∈ E.concepts ∩ concepts) / Σ idf(c ∈ E.concepts)
   bigramScore  = |idx.entryBigrams[E.id] ∩ bigrams| / max(|bigrams|, 1)
   contextBonus = (E.disasters includes ctx.currentDisaster) ? 0.10 : 0
   score = 0.75*conceptScore + 0.25*bigramScore + contextBonus
6) 임계값 분기
   best.score ≥ 0.55           → { type:'answer', entry: best }
   0.30 ≤ best.score < 0.55    → { type:'candidates', entries: top3 }
   best.score < 0.30           → { type:'fallback' }
```

**임계값은 상수로 분리**하여 `core/chat/constants.ts`에 두고, 콘텐츠가 채워진 뒤 실제 질문 샘플로 튜닝한다.

**IDF 계산**: 빌드 시 전체 엔트리에서 `idf(c) = ln(N / df(c))`로 산출하여 인덱스에 굽는다. 런타임 계산 금지(NFR-4).

#### 5.4.5 응답 렌더링

모든 챗봇 응답은 아래 형태를 갖는다.

```ts
export interface ChatResponse {
  speaker: 'yeongi' | 'ungi' | 'ilgu'
  emotion: 'normal' | 'happy' | 'worried' | 'alert' | 'thinking'
  text: string                       // gradeMode에 따라 easy/normal 선택
  cards: ChatCard[]                  // P3: 항상 1개 이상
  highlight?: { cells?: Cell[]; blockIds?: BlockId[] }
  ttsText?: string                   // 이모지·기호 제거된 음성용 문자열
}

export interface ChatCard {
  id: string
  label: string
  action:
    | { type: 'ask'; entryId: string }
    | { type: 'command'; name: string }
    | { type: 'dontKnow' }
    | { type: 'guardianMission'; missionId: string }
}
```

**화자 배정 규칙**

| 상황 | 화자 |
|---|---|
| 안내·설명·지식 답변 | 영이 / 웅이 (교대) |
| 평면도 탐색 유도, 위험 발견 | **일구** (구조견 — "킁킁, 여기 뭔가 있어!") |
| 칭찬 | 일구 |
| 응급 분기 | 웅이 (`alert`) |

> 일구를 탐색·발견 담당으로 두면 지적이 잔소리가 아니라 **놀이**가 된다 (P5).

#### 5.4.6 보호자 미션 (FR-4.10)

아이가 혼자 알 수 없는 항목(`소화기 위치`, `가스 중간밸브`, `경량칸막이 유무`, `집 밖 집결 장소`)은 정답을 요구하지 않고 미션 카드로 전환한다.

```
📋 보호자에게 여쭤보기
   "우리 집 소화기는 어디에 있어요?"
   알아내면 여기에 표시해줘!
   [ 나중에 할래요 ]  [ 알아냈어요! ]
```

- 미완료 미션이 있어도 **인쇄와 진행을 막지 않는다** (P3).
- 미완료 미션은 인쇄물 하단에 "가족과 함께 확인할 것" 항목으로 출력된다.

---

### 5.5 3D 화재 시뮬레이션 (`core/sim/`, `ui/sim3d/`)

#### 5.5.1 셀 초기화

```
initCells(plan) -> SimCell[]
  각 셀에 대해:
    isWall = 방에 속하지 않으면서 방 경계에 인접 → true
    fuel   = clamp(baseFuel(방 종류) + Σ furnitureFuel(그 셀 위 블록), 0, 1)
    나머지 0으로 초기화
```

> `clamp`를 빠뜨리면 침실(0.5)+침대(0.9)=1.4가 되어 확산 배율이 정의역을 벗어난다. **`fuel`은 항상 0~1이다.**

**연소하중 기준표** (교육용 상대값이며 실측치가 아니다. 문서에 명시할 것)

| 대상 | fuel |
|---|---|
| 침대 · 소파 · 옷장 · 책장 | 0.9 |
| 책상 · 식탁 · TV | 0.6 |
| 방 기본값 (침실·거실) | 0.5 |
| 주방 기본값 | 0.7 |
| 냉장고 | 0.3 |
| 다용도실 기본값 | 0.6 |
| 현관 · 복도 · 계단 · 엘리베이터홀 | 0.2 |
| 욕실 · 발코니 | 0.15 |
| 벽 | 0 |

표에 없는 종류는 **0.3**을 기본값으로 한다. 값은 모두 합산 후 0~1로 클램프된다.

#### 5.5.2 발화점 선택 (FR-5.2)

```
pickIgnition(plan, mode):
  mode==='manual' → 사용자 지정 셀
  mode==='random' → 가중 추첨
     gas_range     40%
     power_strip   20%
     heater/candle 15%
     기타 가연 가구 셀 25%
```

> 이 가중치는 **교육적 개연성**을 위한 값이며 실제 화재 통계가 아니다. 통계 기반으로 바꾸려면 소방청 화재통계연감을 근거로 재설정하고 `sources.json`에 등록한다.

#### 5.5.3 확산 틱 (`automaton.ts`)

```
tick(state, cfg):
  // 1. 화염 확산
  for c in cells where state==='burning':
    c.temp = min(1, c.temp + 0.05)
    for n in neighbors4(c):
      f = transferFactor(c, n)
      n.temp += cfg.fireSpreadRate * c.temp * f * n.fuel
      if n.temp > 0.6 && n.fuel > 0 && n.state === 'intact':
        n.state = 'burning'
    c.fuel -= 0.010
    if c.fuel <= 0: c.state = 'burnt'

  // 2. 연기 생성 및 상부 확산  ← 화재보다 훨씬 빠르다 (FR-5.4)
  for c in cells where state==='burning':
    c.smokeHigh = min(1, c.smokeHigh + 0.15)
  diffuse(field='smokeHigh', rate=cfg.smokeSpreadRate, transferFactor)

  // 3. 연기 하강 (상부가 포화되면 호흡 높이로 내려온다)
  for c in cells:
    if c.smokeHigh > 0.6:
      c.smokeLow = min(1, c.smokeLow + (c.smokeHigh - 0.6) * 0.10)

  // 4. 플레이어 갱신
  updatePlayer(state, cfg)

  // 5. 종료 판정
  checkStatus(state, cfg)


transferFactor(a, b):
  b.isWall                         → 0
  두 셀 사이에 개구부 없음(벽)      → 0
  개구부가 닫힌 문                 → cfg.doorClosedFactor  (0.08)
  개구부가 열린 문 / 같은 방        → 1.0
```

**교육 설계의 핵심 두 가지**

1. `smokeSpreadRate(0.22)`가 `fireSpreadRate(0.06)`의 약 3.7배다. 아이는 *"불은 저기 있는데 여기가 벌써 안 보여"* 를 경험한다.
2. `doorClosedFactor = 0.08`. 문을 닫고 나가면 확산이 극적으로 느려진다. 설명이 아니라 **결과로** 배운다.

#### 5.5.4 플레이어

```
updatePlayer(s, cfg):
  cell = cellAt(s.player.cell)
  breathed = s.player.posture === 'crouch'
           ? cell.smokeLow
           : max(cell.smokeLow, cell.smokeHigh * 0.8)
  s.player.exposure += breathed * (s.player.posture === 'crouch'
                                   ? cfg.crouchExposureFactor : 1) * 0.01
  s.player.visionRadius = clamp(8 - breathed * 7, 1, 8)

  if s.player.exposure >= 1        → failed('smoke')
  if cell.state === 'burning'      → failed('flame')
  if s.tick > cfg.timeLimitTicks   → failed('timeout')
  if noReachableGoal(s)            → failed('trapped')   // 모든 목표가 화염·연기로 차단
  if atGoal(s.player.cell)         → success
  s.visited.push(s.player.cell)
```

**조작**: 방향키/터치 스와이프로 이동, 스페이스/버튼으로 자세 전환, 문 앞에서 `문 만져보기` 액션(문 너머 온도가 높으면 경고 표시 후 열기 선택 가능 — 열면 확산 가속).

**엘리베이터(FR-5.8)**: `elevator` 노드에 진입하면 `"엘리베이터가 움직이지 않아!"` 메시지만 출력하고 이동 불가. 시간만 소모된다.

#### 5.5.5 결과 분석 (`scoring.ts`)

`postMortem` 플래그를 채워 챗봇에 전달한다. 챗봇은 **실패 원인 1개만** 설명하고 그리기 단계로 돌려보낸다.

| 플래그 | 챗봇 메시지 방향 |
|---|---|
| `usedElevator` | 엘리베이터가 왜 안 되는지 |
| `stoodInSmoke` | 낮은 자세의 효과 |
| `leftDoorOpen` | 문 닫기의 위력 → 재도전 유도 |
| `passedThroughHazard` | 경로 재설계 유도 |
| `matchedDrawnRoute === false` | "네가 그린 길이랑 다르게 갔네?" |
| `trappedFromStart` | 출구가 하나뿐인 구조 → RULE-F-04로 연결 |

#### 5.5.6 3D 렌더링 (`ui/sim3d/`)

- **지오메트리는 전부 코드로 생성한다** (CON-4). 벽은 `BoxGeometry` + `InstancedMesh`, 바닥은 `PlaneGeometry`, 가구는 박스 조합.
- **불**: 발광 셀에 `emissive` 머티리얼 + `Points`로 스파크. 사실적 불꽃 렌더링은 하지 않는다 (P5, NFR-5).
- **연기**: 셀당 반투명 박스 `InstancedMesh`, `opacity = smokeHigh`. 볼류메트릭 렌더링은 사용하지 않는다.
- **카메라**: 아이소메트릭 각도 고정 궤도. 상하 회전 범위를 제한하여 아이가 방향을 잃지 않게 한다.
- **저사양 모드(FR-5.11)**: 그림자 비활성, `pixelRatio = 1`, 파티클 수 1/4, 연기 인스턴스 갱신 주기 2틱마다.
- 시뮬레이션 로직(`core/sim`)과 렌더링(`ui/sim3d`)을 분리한다. **`core/sim`은 Three.js를 import 하지 않는다** (§3.3).

---

### 5.6 인쇄 (`ui/print/`)

#### 레이아웃 (A4 세로 210×297mm)

```
┌────────────────────────────────────────────┐
│  우리집 대피 지도            [소방청 로고]   │  25mm
│  ─────────────────────────────────────────  │
│                                            │
│         메인 평면도 (화재 시나리오 ①)       │  120mm
│         굵은 화살표 + 번호 ①②③             │
│                                            │
│  ─────────────────────────────────────────  │
│  🔥못나갈때  🌏지진   💧침수   💨가스        │
│  [미니맵]  [미니맵] [미니맵] [미니맵]        │  60mm
│  한 줄 요령 한 줄 요령 …                    │
│  ─────────────────────────────────────────  │
│  우리 가족 만나는 곳: ________________      │
│  보호자 연락처: ______________________      │  50mm
│  🚨 화재·구조·구급 119                      │
│  ─────────────────────────────────────────  │
│  가족과 함께 확인할 것: (미완료 미션 목록)   │  20mm
└────────────────────────────────────────────┘
```

#### 구현 규칙

- 인쇄 대상은 **에디터와 동일한 SVG 컴포넌트를 `printMode` prop으로 재사용**한다. 별도 렌더러를 만들지 않는다.
- `@media print`에서 UI 크롬(팔레트·챗봇·툴바)을 `display:none`.
- `@page { size: A4 portrait; margin: 10mm }`
- **흑백 판독성(FR-6.2, P4)**
  - 경로: 색 + 선종류(실선/파선/점선/일점쇄선) + 순번 마커 동시 사용
  - 방 채움: 색 대신 **패턴(해칭)** 을 병행
  - 최소 선 두께 0.4mm, 최소 글자 크기 8pt
  - 개발 중 확인 방법: `filter: grayscale(1)` 프리뷰 토글 제공
- **PNG 내보내기(FR-6.4)**: SVG 직렬화 → `Blob` → `Image` → `canvas.drawImage` → `toBlob('image/png')`. 해상도는 300dpi 상당(2480×3508)으로 스케일.
  - 외부 라이브러리(html2canvas 등) 사용 금지 — 크기·정확도 모두 불리하다.
  - **주의**: SVG 안에 `<img>`나 외부 폰트가 있으면 canvas가 오염되거나 렌더가 깨진다. 인쇄용 SVG에는 캐릭터 이미지를 넣지 않고, 폰트는 시스템 폰트만 사용한다.

---
## 6. 콘텐츠 명세

### 6.1 ⚠️ 화재 대피 원칙 — 프로젝트 전제의 수정

**이 절은 설계서에서 가장 중요한 내용이다. 구현 전에 반드시 읽는다.**

기존 "우리집 대피경로 그리기" 활동은 암묵적으로 **"불이 나면 무조건 밖으로 나간다"** 를 전제한다. 그러나 현재 국내 아파트 화재 대피 지침은 **"상황별 대피"** 이며, 무조건 대피가 아니다. 자료 조사 결과 확인된 내용은 다음과 같다.

**① 자기 집에서 불이 난 경우**

- 현관으로 나갈 수 있으면 → 낮은 자세로 지상층 또는 옥상으로 대피
- 현관으로 나갈 수 없으면 → **대피공간 · 경량칸막이 · 하향식 피난구**를 이용하거나, 욕실로 이동해 수도를 틀고 구조를 요청

**② 다른 세대에서 불이 난 경우**

- 우리 집으로 불길·연기가 들어오지 않으면 → **집 안에서 대기**
- 들어오면 → 대피 가능 시 지상·옥상으로, 불가능하면 문을 닫고 젖은 수건으로 틈새를 막은 뒤 구조 대기

**아파트 피난설비 3종**

| 설비 | 설치 대상 | 형태 |
|---|---|---|
| 경량칸막이 | 1992~2005년 건축 공동주택 | 발코니 벽면의 약 1cm 석고보드. 부수고 옆집으로 |
| 대피공간 | 발코니 확장형 아파트 | 2㎡ 이상 내화구조 + 방화문. 약 1시간 보호 |
| 하향식 피난구 | 해당 설계 아파트 | 발코니 바닥 지름 60cm 이상 간이사다리. 경보 시 자동 잠금해제 |

**설계에 미치는 영향**

1. **FR-2.7 (화재 시나리오 2종 작도)의 근거가 이것이다.** 화재 경로를 하나만 그리게 하면 지침과 어긋나는 교육이 된다.
2. `light_partition` / `refuge_area` / `descending_hatch` 블록이 팔레트에 필수로 포함되어야 하고, 그래프에서 특수 엣지를 만들어야 한다 (§4.3, §5.2).
3. 규칙 RULE-F-05가 시나리오 ②의 핵심 판정이다.
4. 챗봇은 *"불나면 무조건 밖으로 나가"* 라고 말해서는 안 된다. 이 문장을 콘텐츠에서 **금지 표현**으로 등록한다.

> **⚠️ 검증 필요**: 위 내용은 언론 보도와 지자체 안내 자료를 통해 확인한 것이며, **소방청·국민재난안전포털 1차 자료로 재확인이 필요하다.** 특히 경량칸막이 설치 의무 연도 범위, 대피공간 면적·내화 기준, 하향식 피난구 규격은 법령 개정 이력이 있을 수 있다. 콘텐츠 확정 전 §부록 A의 1차 출처를 직접 확인하고 `sources.json`에 등록한다. **미확인 상태로 배포해서는 안 된다.**

### 6.2 콘텐츠 저작 규칙

| ID | 규칙 |
|---|---|
| CT-1 | 모든 엔트리는 `sourceIds`를 가진다. 비면 빌드 실패 (P6) |
| CT-2 | `easy`(1~3학년)와 `normal`(4~6학년) 두 문장을 모두 작성한다 |
| CT-3 | `easy`는 한 문장 25자 이내, 한자어 최소화, 종결어미 `~해`, `~하자` |
| CT-4 | `normal`은 2~3문장, 이유를 포함, 종결어미 `~합니다`, `~하세요` |
| CT-5 | 공포·자극 표현 금지 (P5). "죽을 수도 있어", "타 죽어" 등 사용 불가 |
| CT-6 | 확정적 단정 금지. 상황 분기가 있는 내용은 반드시 조건을 함께 제시 (§6.1) |
| CT-7 | 아이 혼자 할 수 없는 행동을 지시하지 않는다. 해당 항목은 `requiresGuardian: true` |
| CT-8 | 모든 엔트리는 `followUpCards`를 1개 이상 갖는다 (P3) |
| CT-9 | 금지 표현 목록을 `content/bannedPhrases.json`에 관리하고 빌드 시 검사한다 |

**금지 표현 초기 목록** (`bannedPhrases.json`)

```json
["무조건 밖으로", "무조건 대피", "죽", "타 죽", "질식사", "시체", "무섭", "끔찍"]
```

### 6.3 개념 사전 구축 지침

개념 사전(`concepts.json`)의 품질이 챗봇 체감 성능을 결정한다.

**개념 하나당 수집할 표면형 유형**

| 유형 | 예시 (`fire` 개념) |
|---|---|
| 표준어 | 화재, 불 |
| 활용형 | 불이, 불나면, 불났을때, 불이나면, 화재가 |
| 구어체 | 불 뿜어, 불붙어, 불타 |
| 아동 표현 | 우리집탈것같아, 뜨거워졌어 |
| 오타 | 화제, 붏, 불ㄴ나면 |
| 줄임말/은어 | — |

**작성 절차**

1. 개념 목록을 먼저 확정한다 (아래 초기 목록).
2. 개념별로 표면형을 **최소 8개** 작성한다.
3. `validate.ts`가 표면형 중복을 검사한다 — 한 표면형이 두 개념에 속하면 검색이 불안정해진다.
4. 배포 후 실제 사용에서 미매칭이 발견되면 표면형을 추가한다. **콘텐츠만 고치면 되고 코드는 손대지 않는다.**

**초기 개념 목록 (최소 40개)**

```
재난:      fire, earthquake, flood, gas_leak
장소:      home, room, kitchen, bathroom, living, balcony, entrance,
          corridor, stairs, elevator, outdoor, meeting_point
행동:      evacuate, stay, crouch, cover_mouth, close_door, open_door,
          call_119, shout, wait_rescue, turn_off_valve, go_up, go_down
사물:      smoke, flame, door, window, extinguisher, detector,
          light_partition, refuge_area, descending_hatch, gas_valve,
          wet_towel, elevator_button, power_switch
평면도:    route, my_plan, correct, wrong, start_point, exit
메타:      what, how, why, where, when, dont_know, help
```

### 6.4 지식 엔트리 샘플

```json
{
  "id": "fire.elevator.forbidden",
  "concepts": ["fire", "elevator", "evacuate"],
  "disasters": ["fire"],
  "question": "불나면 엘리베이터 타도 돼요?",
  "answer": {
    "easy": "안 돼! 불이 나면 엘리베이터는 절대 타면 안 돼. 계단으로 내려가자.",
    "normal": "화재가 발생하면 엘리베이터는 전기가 끊겨 멈출 수 있고, 통로를 따라 연기가 들어와 매우 위험합니다. 반드시 계단을 이용하세요."
  },
  "followUpCards": ["fire.stairs.howto", "fire.smoke.posture"],
  "highlightBlocks": ["elevator_hall", "stair"],
  "sourceIds": ["TODO-VERIFY"]
}
```

```json
{
  "id": "fire.apt.exit_blocked",
  "concepts": ["fire", "evacuate", "entrance", "refuge_area", "light_partition"],
  "disasters": ["fire"],
  "question": "현관으로 못 나가면 어떻게 해요?",
  "answer": {
    "easy": "현관으로 못 나가면 밖으로 무리해서 나가지 마. 대피공간이나 경량칸막이가 있는 곳으로 가고, 없으면 욕실에서 물을 틀고 도와달라고 알려야 해.",
    "normal": "현관으로 대피할 수 없을 때는 무리하게 나가지 않습니다. 대피공간, 경량칸막이, 하향식 피난구가 있으면 그곳을 이용하고, 없다면 욕실로 이동해 수도를 틀고 구조를 요청하세요."
  },
  "followUpCards": ["fire.light_partition.what", "fire.refuge_area.what"],
  "requiresGuardian": true,
  "highlightBlocks": ["light_partition", "refuge_area", "descending_hatch", "bath"],
  "sourceIds": ["TODO-VERIFY"]
}
```

> `"TODO-VERIFY"` 는 `validate.ts`가 **빌드를 실패시키는 예약어**로 처리한다. 검수 전 콘텐츠가 배포에 섞이는 것을 구조적으로 막는다.

### 6.5 콘텐츠 분량 목표

| 항목 | 최소 | 권장 |
|---|---|---|
| 지식 엔트리 | 80 | 150 |
| 개념 | 40 | 60 |
| 개념당 표면형 | 8 | 15 |
| 응급 표현 | 20 | 40 |
| 규칙 메시지 세트 | 규칙 수 × 4문장 | 동일 |
| 출처 | 10 | 20 |

### 6.6 검수 절차

```
1차: 작성 (AI 보조 초안 생성 가능 — 런타임이 아닌 제작 단계이므로 P1과 무관)
2차: 1차 출처 대조 — 모든 문장을 원문과 대조하고 sourceIds 확정
3차: 소방 전문가 검수 — 소방청 담당 부서 또는 지역 소방서
4차: 아동 가독성 검토 — 초등 교사 또는 실제 아동 대상 시험 사용
5차: TODO-VERIFY 잔여 0건 확인 후 빌드
```

---

## 7. UI/UX 명세

### 7.1 레이아웃

**데스크톱 (≥1280px)**

```
┌──────────────────────────────────────────────────────────┐
│ 상단바: [재난 탭] 화재①  화재②  지진  침수  가스   [학년] │ 56px
├────────┬─────────────────────────────────┬───────────────┤
│ 팔레트 │                                 │  챗봇 패널     │
│        │          캔버스 (SVG)           │               │
│ 200px  │            flex: 1              │    400px      │
│        │                                 │  (접기 가능)   │
│ 카테고리│                                 │  캐릭터+대화   │
│ 탭 세로 │                                 │  +버튼 카드    │
├────────┴─────────────────────────────────┴───────────────┤
│ 하단바: [3D로 보기] [인쇄] [저장]        진행률 ▓▓▓░░ 60% │ 48px
└──────────────────────────────────────────────────────────┘
```

> **챗봇 패널 폭에 대한 설계 결정**: 초기 요구는 10~15%였으나 **400px 고정(접었을 때 64px)** 으로 한다. 근거 — 버튼 카드가 주 입력 수단(FR-4.2)이므로 카드 2~4개가 한 줄에 읽혀야 하고, 캐릭터 이미지와 말풍선이 동시에 들어가야 한다. 1920px 기준 약 21%다. 캔버스가 좁다고 느끼면 접기 버튼으로 64px까지 줄이고, 이때 캐릭터 아이콘만 남으며 할 말이 생기면 말풍선이 캔버스 위에 떠오른다.

**태블릿 가로 (≥1024px)**: 팔레트 160px, 챗봇 320px

**태블릿 세로 / 좁은 화면 (<1024px)**: 챗봇을 하단 시트로 전환. 기본 높이 40%, 손잡이 드래그로 확장/축소. 팔레트는 하단 가로 스크롤 바.

### 7.2 캐릭터 사용 (CON-5, CON-6)

- 캐릭터당 표정 5종(`normal`, `happy`, `worried`, `alert`, `thinking`)의 PNG를 준비한다. **총 15장.**
- 크기: 표시 기준 최대 160×160px. `@2x`(320×320) 한 벌만 준비하고 CSS로 축소한다. 파일 크기 관리를 위해 PNG-8 또는 최적화된 PNG-24를 사용한다 (NFR-3).
- 애니메이션은 CSS로만 처리한다 (등장 시 살짝 튀어오름, 말할 때 상하 미세 이동). 스프라이트 시트 애니메이션은 만들지 않는다.
- **개발 중에는 반드시 플레이스홀더 이미지를 사용한다** (CON-6). `assets/characters/`에 동일한 파일명으로 단색 실루엣을 두고, 소방청 사용 허가 후 파일만 교체한다. 코드는 수정하지 않는다.

### 7.3 학년 대응 (전 학년 공용)

| 요소 | `easy` (1~3학년) | `normal` (4~6학년) |
|---|---|---|
| 답변 문장 | `answer.easy` | `answer.normal` |
| 블록 외형 기본값 | `kid` | `kid` (전환 자유 — FR-1.8은 학년과 무관) |
| 규칙 심각도 | `critical` + `important`만 노출 | 전체 노출 (`tip` 포함) |
| 고급 지적 | 비활성 | `articulationPoints` 기반 지적 활성 |
| TTS | 기본 켜짐 | 기본 꺼짐 |
| 시뮬레이션 난이도 | 제한시간 720틱, 확산 0.7배 | 기본값 |

전환은 상단바 토글 한 번이며, **언제든 바꿀 수 있고 데이터는 유지된다.**

### 7.4 접근성 (NFR-10)

- 모든 인터랙티브 요소 최소 44×44px
- 본문 대비비 4.5:1, 큰 텍스트 3:1 이상
- **색만으로 정보를 전달하는 곳이 없어야 한다** (P4). 개발 중 `grayscale` 프리뷰 토글로 상시 확인
- 키보드 조작: Tab 순회, Enter 실행, 방향키로 캔버스 커서 이동
- `prefers-reduced-motion` 존중 — 애니메이션 축소
- TTS는 Web Speech API(`speechSynthesis`) 사용
  > **주의**: 일부 브라우저/OS는 음성 합성에 온라인 음성을 사용한다. 오프라인 환경에서 동작하지 않을 수 있으므로 **TTS는 부가 기능으로만 취급하고, 실패 시 조용히 비활성화**한다. TTS 없이도 모든 기능이 완결되어야 한다 (NFR-1).

### 7.5 톤앤매너 (P5)

| 하지 않을 것 | 대신 할 것 |
|---|---|
| "틀렸어요" | "여기 한번 다시 볼까?" |
| "위험해요! 큰일나요!" | "이 길은 조금 더 안전하게 바꿀 수 있어" |
| 사실적 불꽃·시신·연기 속 공포 연출 | 스타일라이즈드 로우폴리, 밝은 조명 |
| 실패 시 붉은 화면 + 경고음 | 일구가 다가와 "다시 해보자!" + 원인 1개 설명 |
| 진행 강요 | 언제든 저장하고 나갈 수 있음 |

핵심 프레이밍: **"너는 이미 준비된 사람"**. 아이가 앱을 끄고 나서 남아야 할 감정은 공포가 아니라 자신감이다.

---

## 8. 구현 로드맵

**1인 개발이므로 마일스톤을 병렬 진행하지 않는다 (CON-7).** 각 마일스톤의 DoD를 만족한 뒤 커밋하고 다음으로 넘어간다.

### M0 — 프로젝트 셋업 및 단일 파일 빌드 검증 ⭐최우선

가장 먼저, 반드시 단독으로 수행한다.

- Vite + React + TS + Zustand + Three.js 설치
- `vite.config.ts` 단일 파일 빌드 구성 (§3.5)
- 최소 화면(빈 SVG 캔버스 + Three.js 큐브 1개 + 인라인 PNG 1장) 구현
- ESLint 규칙: `src/core/**`에서 `react`/`three`/DOM import 금지

**DoD**
- [ ] `npm run build:single` 산출물이 `dist/index.html` **단 하나**
- [ ] `npm run validate` / `npm run validate:strict` 두 명령이 존재하고 동작 (§3.6)
- [ ] 그 파일을 다른 폴더로 옮겨 **더블클릭으로 실행** 시 콘솔 에러 0건
- [ ] Three.js 큐브가 렌더되고 인라인 PNG가 표시됨
- [ ] `npm test` 통과 (더미 테스트 1건)

> 이 DoD를 통과하지 못한 상태로 M1 이상 진행 금지. CON-3은 후반에 발견하면 아키텍처 전면 수정을 유발한다.

### M1 — 데이터 모델 및 에디터 기초

- §4의 타입 전체를 `src/types/`에 배치
- `core/grid/` 구현 + 테스트
- 팔레트 UI, 드래그 배치, 격자 스냅, 선택/이동/삭제
- Undo/Redo (커맨드 패턴 또는 상태 스냅샷 30단계)
- `blocks.json` 최소 15종 (kid 외형만)
- **localStorage 자동 저장/복원 (FR-6.5)** — 이후 모든 마일스톤이 이것에 의존하므로 여기서 만든다

**DoD**
- [ ] 방·문·창문·가구를 배치하고 저장 후 새로고침해도 복원됨
- [ ] 방 겹침 배치가 거부됨
- [ ] Undo/Redo 30단계 동작
- [ ] `core/grid` 테스트 커버리지 80% 이상

### M2 — 그래프 빌더 + 검증 엔진

- `core/graph/` 전체 (build, pathfind, analyze, `goalNodeIds`, `reachesGoal`)
- `core/rules/engine.ts`
- **경로가 필요 없는 구조 규칙만**: RULE-C-02, C-03, C-07, C-08, F-04, G-01, G-02
- 규칙 위반 대상 하이라이트 UI

> **경로에 의존하는 규칙(C-01, C-04~06, F-01~03, F-05, F-06, E-*, W-01)은 M4에서 구현한다.** `EvacRoute`를 만드는 UI가 M4에 있기 때문이다. M2에서는 `ctx.route`가 `undefined`이며, 해당 규칙들은 `status: 'na'`를 반환한다.

**DoD**
- [ ] 고립된 방이 있는 평면도에서 RULE-C-03이 정확히 감지
- [ ] `findEscape`로 계산한 최단경로가 시각적으로 표시됨
- [ ] `ScenarioKey` 5종에 대해 `goalNodeIds`가 §4.3 표대로 다른 집합을 반환 (단위 테스트)
- [ ] `fire_exit_blocked`에서 `front_door` 엣지가 blocked, `light_partition` 엣지가 open으로 조회됨
- [ ] 가상 노드가 `cells` 없이 생성되고 `reachesGoal`이 `anchorCell` 기반으로 동작
- [ ] `core/graph`, `core/rules` 테스트 커버리지 80% 이상
- [ ] 평면도 픽스처 5종에 대한 회귀 테스트 존재

### M3 — 챗봇 엔진 + UI

- `core/chat/` 전체 (normalize, index, search, emergency, router)
- 챗봇 패널 UI, 캐릭터(플레이스홀더), 버튼 카드, 3단계 힌트
- 지식 엔트리 30건으로 동작 검증

**DoD**
- [ ] 응급 표현 20종 전부 RT0로 감지 (테스트)
- [ ] 임계값 미달 시 추측 답변이 나오지 않음 (P2 테스트)
- [ ] 모든 응답에 카드가 1개 이상 존재 (P3 테스트 — 전 엔트리 순회 검사)
- [ ] 평면도 질문이 검증 엔진으로 라우팅됨
- [ ] `core/chat` 테스트 커버리지 80% 이상

### M4 — 경로 작도 + 재난 탭

- 재난 탭 5종(= `ScenarioKey` 5종: 화재①②·지진·침수·가스)
- 셀 경로 그리기, 1차 대피처, 집결 장소
- **경로 의존 규칙 전체**: RULE-C-01, C-04, C-05, C-06, F-01, F-02, F-03, F-05, F-06, F-07, E-01~04, W-01~03, G-03, G-04
- 3단계 힌트 상태 기계(§5.3.3) 연동
- `profile.lowFloor` 온보딩 질문

**DoD**
- [ ] 재난 탭 전환 시 경로·규칙·챗봇 답변이 모두 바뀜
- [ ] **§6.1 지침대로 시나리오 ②에서 대피공간으로 향하는 경로를 그리면 critical 위반이 0건이 된다** (C-06 ↔ F-05 충돌 부재 회귀 테스트)
- [ ] `lowFloor` 값에 따라 침수 목표 노드가 `VN_upstairs` ↔ `VN_outdoor`로 바뀜
- [ ] 재난별 경로가 독립적으로 저장·복원됨
- [ ] 픽스처 5종 각각에서 "critical 위반을 모두 해소할 수 있는 경로가 실제로 존재"함을 검증 (P3)

### M5 — 인쇄 + 저장/불러오기

- A4 1장 레이아웃, 흑백 판독성 확보
- PNG 내보내기
- JSON 내보내기/불러오기, 마이그레이션

**DoD**
- [ ] 실제 프린터 **흑백 인쇄** 후 모든 경로가 구분 판독됨
- [ ] `grayscale` 프리뷰에서 정보 손실 없음
- [ ] PNG 2480×3508 출력 확인
- [ ] 구버전 스키마 JSON 불러오기 시 마이그레이션 동작, 실패 시 원본 보존

### M6 — 3D 뷰 (정적)

- 평면도 → 3D 압출, 아이소메트릭 카메라
- 가구 절차적 지오메트리
- 저사양 모드 토글

**DoD**
- [ ] 평면도 변경이 3D에 반영됨
- [ ] 통합 그래픽 노트북에서 60fps (정적 상태)
- [ ] 단일 파일 크기가 여전히 NFR-3 이내

### M7 — 화재 시뮬레이션

- `core/sim/` 전체
- 발화점 선택, 확산, 플레이어 조작, 연기 시야
- 결과 분석 → 챗봇 연동

**DoD**
- [ ] 연기가 화염보다 명확히 빠르게 확산됨 (시각 확인 + 단위 테스트)
- [ ] 문을 닫으면 확산이 눈에 띄게 느려짐
- [ ] 5종 픽스처 평면도에서 시뮬레이션이 결정론적으로 재현됨 (시드 고정)
- [ ] 실패 시 원인 1개만 설명하고 그리기로 복귀
- [ ] 저사양 모드에서 30fps 이상 (NFR-5)

### M8 — 게임화 및 통합 흐름

- 온보딩 → 그리기 → 검증 → 시뮬레이션 → 인쇄 전체 플로우 연결
- 진행률, 미션, 재도전 루프
- 보호자 미션 UI

**DoD**
- [ ] 처음부터 끝까지 **어른의 도움 없이** 완주 가능 (실제 아동 시험 사용 1회 이상)
- [ ] 어느 화면에서도 다음에 누를 것이 존재 (P3 전수 점검)

### M9 — 콘텐츠 완성 및 검수

- 지식 엔트리 150건, 개념 60종, 응급 40종
- 1차 출처 대조 및 `sources.json` 확정
- `TODO-VERIFY` 전량 제거

**DoD**
- [ ] `validate.ts` 통과 (TODO-VERIFY 0건, 출처 누락 0건, 깨진 링크 0건)
- [ ] 금지 표현 검사 통과
- [ ] 소방 전문가 검수 완료 서명

### M10 — 최적화 · 접근성 · QA

- 번들 크기 최적화, 성능 프로파일링
- 접근성 전수 점검
- 브라우저·기기 매트릭스 테스트

**DoD**
- [ ] NFR 전 항목 충족 확인
- [ ] Chrome/Edge/Safari/Firefox + 태블릿 실기기 테스트 통과
- [ ] 네트워크 완전 차단 상태에서 전 기능 동작 (NFR-1)
- [ ] 코드 내 외부 도메인 호출 0건 (NFR-7, 정적 검사)

---

## 9. 테스트 전략

| 계층 | 도구 | 대상 |
|---|---|---|
| 단위 | Vitest | `core/**` 전체 (NFR-11) |
| 픽스처 회귀 | Vitest | 평면도 5종 × (그래프·규칙·시뮬레이션) 결과 스냅샷 |
| 콘텐츠 검증 | `validate.ts` | 빌드 게이트 (§3.6) |
| 정책 테스트 | Vitest | P2·P3·P6를 코드로 검사 |
| 수동 | 체크리스트 | 인쇄, 3D 성능, 실기기, 아동 시험 사용 |

**정책 테스트 예시 (반드시 구현)**

```ts
// P3: 모든 지식 엔트리는 후속 카드를 가진다
test('every entry has at least one follow-up card', () => {
  for (const e of allEntries) expect(e.followUpCards.length).toBeGreaterThan(0)
})

// P3: 후속 카드가 존재하는 엔트리를 가리킨다 (막다른 골목 방지)
test('no broken follow-up links', () => {
  for (const e of allEntries)
    for (const id of e.followUpCards) expect(byId[id]).toBeDefined()
})

// P2: 임계값 미달 입력에 답변을 반환하지 않는다
test('does not answer below threshold', () => {
  const r = searchKnowledge('오늘 저녁 뭐 먹지', ctx)
  expect(r.type).not.toBe('answer')
})

// P6: 출처 없는 콘텐츠 없음
test('every entry has a verified source', () => {
  for (const e of allEntries) {
    expect(e.sourceIds.length).toBeGreaterThan(0)
    expect(e.sourceIds).not.toContain('TODO-VERIFY')
  }
})
```

**픽스처 평면도 5종** (`tests/fixtures/`)

| ID | 특징 | 검증 목적 |
|---|---|---|
| `f1_normal` | 방3 아파트, 출구 2개 | 정상 경로 |
| `f2_isolated` | 욕실에 문 없음 | RULE-C-03 |
| `f3_single_exit` | 현관만 존재 | RULE-F-04 |
| `f4_kitchen_only` | 주방을 지나야만 현관 | RULE-F-02 예외 처리 |
| `f5_lowfloor` | 반지하 구조 | RULE-W-01 |

---

## 10. 리스크 및 미결 사항

### 10.1 리스크

| ID | 리스크 | 영향 | 대응 |
|---|---|---|---|
| R1 | **평면도 그리기 자체의 난이도** — 저학년이 자기 집을 위에서 본 형태로 그리기 어려움 | 앱 전체 미사용 | 템플릿 3종 제공(FR-1.4), 챗봇 단계별 유도, 직사각형 방 제약 |
| R2 | 소방청 캐릭터 사용 허가 지연 | 배포 불가 | 플레이스홀더로 개발 진행(CON-6), 파일 교체만으로 반영되는 구조 |
| R3 | 단일 파일 크기 초과 | NFR-3 위반 | 3D 절차적 생성, 에셋 최소화, preact alias 예비안 |
| R4 | 콘텐츠 검수 일정 지연 | 배포 지연 | M9를 독립 마일스톤으로 분리. 코드는 M8에서 완성되어 대기 |
| R5 | 저사양 기기 3D 성능 | 핵심 기능 사용 불가 | 저사양 모드 필수 구현(FR-5.11), 3D 없이도 2D 검증만으로 완결되는 구조 유지 |
| R6 | **1인 개발의 범위 초과** | 미완성 | M5까지가 **독립적으로 배포 가능한 완성품**. M6 이후는 증분 |
| R7 | 화재 대피 지침의 법령 개정 | 잘못된 교육 | `sources.json`에 `retrievedAt` 기록, 연 1회 재확인 절차 문서화 |

> **R6이 가장 중요하다.** M5까지 완료하면 "그리기 + 챗봇 + 검증 + 인쇄"가 완결된 제품이 되어 배포할 수 있다. 3D 시뮬레이션은 그 위의 증분이다. 일정이 부족하면 M6 이후를 2차 사업으로 분리한다.
>
> **단, M5 산출물을 그대로 배포할 수는 없다.** 온보딩·전체 플로우 연결·보호자 미션 UI·P3 전수 점검이 M8 범위이고, 콘텐츠 검수가 M9다. 3D를 잘라내는 경우의 최소 배포 구성은 **M0~M5 + M8(3D 관련 항목 제외) + M9 + M10** 이다. 인쇄 레이아웃(§5.6)의 "가족과 함께 확인할 것" 영역은 보호자 미션 UI에 의존하므로, M8을 건너뛴다면 그 영역을 고정 문구로 대체한다.

### 10.2 미결 사항 (착수 전 결정 필요)

| ID | 항목 | 필요한 결정 |
|---|---|---|
| O1 | 소방청 캐릭터 사용 허가 및 파일 사양 | 담당 부서 확인. 표정 변형 제작 가능 여부 |
| O2 | 화재 대피 지침 1차 출처 확정 | §6.1의 내용을 소방청 원문으로 재확인 |
| O3 | 배포 채널 | 소방청 웹사이트 게시 / 학교 배포 / QR 중 무엇인가 |
| O4 | 개인정보 영향평가 필요 여부 | 서버 없음·수집 없음이나 공공사업 절차상 확인 필요 |
| O5 | 접근성 인증(WA 인증) 요구 여부 | 공공기관 배포물 요건 확인 |
| O6 | 지진·침수·가스 3D 시뮬레이션 포함 여부 | 현재 범위 제외(§2.4). 2차 사업 여부 |
| O7 | 레이어 2(공용부) 필수/선택 | 현재 선택(FR-1.9). 아파트 대피 교육 완결성을 위해 필수화 검토 |

---

## 부록 A. 콘텐츠 1차 출처 후보

콘텐츠 작성 시 **반드시 아래 1차 자료를 직접 확인**하고 `sources.json`에 등록한다. 언론 보도는 1차 출처가 아니다.

| 기관 | 자료 | 비고 |
|---|---|---|
| 소방청 | 공지사항 「아파트 화재 피난행동요령 / 화재 피난안전 매뉴얼」 | §6.1의 1차 근거 |
| 소방청 | 기관소개 > 상징소개 > 캐릭터 | 캐릭터 사양·이용 안내 |
| 행정안전부 | 국민재난안전포털 국민행동요령 (화재·지진·풍수해·가스) | 재난 4종 기본 |
| 행정안전부 | 「지진·지진해일·화산재 행동요령 연령별 통합교재」 | **연령별 문장**이 있어 `easy`/`normal` 작성에 직접 활용 가능 |
| 행정안전부 | 유아~성인 맞춤형 지진 교육자료 | 동일 |
| 시·도 소방본부 | 아파트 화재안전 안내 (예: 부산소방재난본부) | 경량칸막이·대피공간·하향식피난구 상세 |
| 소방청 | 화재통계연감 | 발화 원인 가중치를 통계 기반으로 바꿀 경우 |

---

## 부록 B. `CLAUDE.md` 초안

저장소 루트에 아래 내용을 `CLAUDE.md`로 저장한다. Claude Code가 매 세션 자동으로 읽는다.

````markdown
# 우리집 대피지도 — 개발 지침

## 프로젝트
소방청 아동 재난안전교육 웹앱. 초등학생이 **가정에서 혼자** 사용한다.
전체 설계는 `docs/DESIGN.md`에 있다. **작업 전 반드시 해당 마일스톤 절을 읽는다.**

## 절대 규칙
1. **런타임에 생성형 AI를 호출하지 않는다.** 외부 API 호출 코드를 작성하지 않는다.
2. **`src/core/**` 에서 `react`, `three`, `zustand`, `document`, `window`를 import 하지 않는다.**
   core는 순수 함수만 포함하며 Vitest로 테스트된다.
3. **모든 안전 콘텐츠에 `sourceIds`가 있어야 한다.** 출처를 지어내지 않는다.
   확인되지 않은 내용은 `"TODO-VERIFY"`로 표기한다 (빌드가 실패하도록 설계됨).
4. **`docs/DESIGN.md`의 타입 정의를 임의로 변경하지 않는다.**
   변경이 필요하면 먼저 문서 수정을 제안하고 승인을 받는다.
5. **범위 제외 항목(DESIGN.md §2.4)을 구현하지 않는다.** 계정·서버·분석·다국어 등.
6. **런타임 의존성을 추가하지 않는다.** 단일 파일 크기 제약이 있다(8MB).
   UI 라이브러리, 아이콘 패키지, 애니메이션 라이브러리 모두 불가.

## 아동 안전 관련
- 챗봇이 확실하지 않은 답을 추측해서 말하게 하지 않는다. 임계값 미달이면 후보 카드를 제시한다.
- 모든 챗봇 응답은 후속 카드를 1개 이상 포함해야 한다 (막다른 골목 금지).
- 공포·자극적 표현을 쓰지 않는다.
- 화재 대피는 **"무조건 밖으로"가 아니다.** 상황별 대피 지침을 따른다 (DESIGN.md §6.1).

## 작업 방식
- 한 번에 하나의 마일스톤만 작업한다.
- 새 파일을 만들기 전에 `docs/DESIGN.md` §3.4의 디렉터리 구조를 따른다.
- `core/` 로직을 작성하면 같은 커밋에 테스트를 작성한다.
- 완료 시 해당 마일스톤의 DoD 체크리스트를 확인하고 결과를 보고한다.

## 명령
- `npm run dev` 개발 서버
- `npm run build:single` 단일 HTML 빌드
- `npm test` 단위 테스트
- `npm run validate` 콘텐츠 검증
````

---

## 부록 C. Claude Code 프롬프트 템플릿

### C.1 마일스톤 착수

```
docs/DESIGN.md 를 읽고 M<N> (<제목>) 을 구현해줘.

범위:
- DESIGN.md §<해당 절> 의 명세를 그대로 따를 것
- 타입은 §4의 정의를 변경 없이 사용할 것
- 구현 대상 요구사항: FR-x.x, FR-x.x

제약:
- CLAUDE.md 의 절대 규칙을 지킬 것
- core/ 에 작성하는 로직은 같은 작업에서 Vitest 테스트도 작성할 것
- 이번 마일스톤 범위 밖의 기능은 만들지 말 것

완료 후:
- §8 M<N> 의 DoD 체크리스트를 항목별로 확인하고 결과를 보고할 것
- 통과하지 못한 항목이 있으면 완료라고 하지 말 것
```

### C.2 규칙 추가

```
DESIGN.md §5.3.2 의 <RULE-ID> 를 구현해줘.

- 파일: src/core/rules/definitions/<rule-id>.ts
- RuleDef 인터페이스(§4.5)를 따를 것
- 메시지는 코드에 넣지 말고 content/ruleMessages.json 에 ruleId 키로 추가할 것
- hint1 / hint2 / answer / praise 네 문장을 모두 작성할 것
- 판정 로직에 대한 단위 테스트를 tests/rules.test.ts 에 추가할 것
- 픽스처는 tests/fixtures/ 의 기존 평면도를 사용할 것
```

### C.3 콘텐츠 추가

```
<재난/주제> 관련 지식 엔트리를 <N>건 추가해줘.

- 파일: src/content/knowledge/<file>.json
- KnowledgeEntry 인터페이스(§4.6)를 따를 것
- easy / normal 두 버전을 모두 작성 (§6.2 CT-3, CT-4)
- followUpCards 를 1개 이상, 반드시 존재하는 엔트리 ID로 (§6.2 CT-8)
- **출처를 지어내지 말 것.** 확인된 출처가 없으면 sourceIds: ["TODO-VERIFY"]
- 사용된 개념이 concepts.json 에 없으면 함께 추가하고, 표면형을 8개 이상 작성할 것
- 추가 후 npm run validate 를 실행해 통과 여부를 보고할 것
```

### C.4 리뷰 요청

```
방금 작성한 코드를 DESIGN.md 기준으로 검토해줘.

확인 항목:
1. core/ 에 react/three/DOM 의존이 들어갔는가
2. §4 타입 정의와 어긋나는 곳이 있는가
3. §2.4 범위 제외 항목을 건드렸는가
4. 런타임 의존성이 추가됐는가
5. 아동 안전 관련 규칙(P2, P3, P5)을 위반하는 문장이나 흐름이 있는가

문제를 발견하면 수정 전에 목록으로 먼저 보고할 것.
```

---

**문서 끝.**