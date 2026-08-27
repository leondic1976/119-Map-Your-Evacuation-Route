# 개발 설계서 v1.1 — 변경 명세

**v1.0 대비 변경된 부분만 기술한다. 이 문서에 언급되지 않은 v1.0의 내용은 그대로 유효하다.**

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.1 (변경 명세) |
| 기준 문서 | `docs/DESIGN.md` v1.0 |
| 작성일 | 2026-08-27 |
| 변경 사유 | 지도교수 검토 의견 4건 |
| 적용 방법 | 이 문서의 지시대로 v1.0을 수정한 뒤 `docs/DESIGN.md` v1.1로 갱신한다 |

---

## 0. 변경 배경

지도교수 검토 의견 4건:

| # | 의견 | 성격 |
|---|---|---|
| 1 | **그리기가 편해야 한다** | 최우선 과제 격상 |
| 2 | **2D 상태에서 화재가 랜덤 발생하는 대피 게임, 시간제한** | 3D → 2D 전환 + 게임 중심화 |
| 3 | **챗봇을 제거하라** | 모듈 삭제 |
| 4 | **결과를 잘한 점 / 잘못한 점으로 정리하고 다시 할 수 있게** | 신규 모듈 |

추가 결정사항 (협의 결과):

| # | 결정 | 영향 |
|---|---|---|
| 5 | 지식 콘텐츠는 **소방청 캐릭터가 지도하는 방식**으로 전달 | 챗봇 대신 캐릭터 가이드 |
| 6 | **화재가 기본. 지진·침수·가스는 확장판** | 엔진은 4종을 담게 일반화, 구현은 화재부터 |
| 7 | 캐릭터를 **게임 플레이어 캐릭터로도 사용** | 스프라이트 요구사항 발생 |

### 0.1 변경의 성격 — 축소가 아니라 재배치

이 변경은 기능을 덜어내는 것이 아니라 **무게중심을 옮기는 것**이다.

```
v1.0의 3축:   그리기  ─  챗봇(검증·지식)  ─  3D 화재 시뮬레이션
                              ↓
v1.1의 3축:   그리기  ─  2D 재난 대피 게임  ─  결과 리포트(캐릭터 지도)
```

- **검증 규칙 엔진은 사라지지 않는다.** 의견 4번의 "잘한 점 / 잘못한 점"이 곧 규칙 엔진의 산출물이다. 전달 매체가 챗봇 대화에서 결과 리포트 화면으로 바뀔 뿐이다.
- **지식 콘텐츠도 사라지지 않는다.** 캐릭터가 지도하는 방식으로 전환된다(결정 5).
- **실제로 삭제되는 것은 "대화 엔진"뿐이다** — 자유 텍스트 입력, 의미 검색, 개념 사전, 역색인, 응급 감지, 의도 라우터.

### 0.2 3D → 2D 전환의 평가

**이 변경은 손실이 아니라 개선이다.** 근거:

1. **인지 부담 제거** — 아이가 그린 평면도와 게임 화면이 완전히 동일한 뷰가 된다. 3D에서는 "내가 그린 게 이거 맞나?"를 매번 다시 매핑해야 했다.
2. **성능 제약 해소** — NFR-5(3D 30fps)가 사라진다. 저사양 기기 리스크(v1.0 R5)가 소멸한다.
3. **번들 크기 여유** — Three.js 제거로 약 150KB(gzip) 절감. 캐릭터 스프라이트 추가 여유가 생긴다.
4. **개발 기간 단축** — 3D 지오메트리·카메라·렌더 최적화 작업이 통째로 사라진다. 1인 개발(CON-7)에서 결정적이다.
5. **인쇄물과의 일관성** — 게임 화면·에디터·인쇄물이 모두 같은 SVG 렌더러를 공유한다.

### 0.3 기본판과 확장판의 분리

**화재가 기본이고, 지진·침수·가스는 확장판이다** (결정 6). 이 구분은 리스크 관리의 핵심이다.

| | 범위 | 상태 |
|---|---|---|
| **기본판** | 그리기 + **화재** 대피 게임 + 결과 리포트 + 인쇄 | 이번 개발 범위. 단독으로 완결된 제품 |
| **확장판** | 지진 · 침수 · 가스 게임 추가 | 2차. 기본판 배포 후 |

**단, 엔진은 처음부터 4종을 담을 수 있게 일반화해서 설계한다.** 화재 전용으로 만들어두면 확장 시 전면 재작성이 필요하다. 반대로 처음부터 「위험장(Hazard Field)」이라는 일반 개념으로 만들면, 확장은 **JSON 프리셋 한 벌 추가 + 소수의 특수 규칙**으로 끝난다.

이 방침의 실효는 다음과 같다.

- 기본판 개발량: 화재 게임 1종. v1.0의 3D 시뮬레이션보다 **적다**
- 확장 1종당 추가 개발량: 전체의 약 10~15% (지진만 예외 — §3.6)
- **엔진 일반화 자체의 추가 비용은 거의 없다.** 상수를 프리셋 파일로 빼는 수준이다

> **원칙**: 확장판 3종을 지금 구현하지 않는다. 그러나 **지금 구현하는 화재 게임이 4종 중 하나로 보이도록** 코드를 쓴다. `FireSim`이 아니라 `HazardSim`이고, `fireSpreadRate`가 아니라 `preset.spreadRate`다.

---

## 1. 변경 총괄표

### 1.1 삭제

| 대상 | v1.0 위치 | 사유 |
|---|---|---|
| 챗봇 대화 엔진 전체 | §5.4, `core/chat/` | 의견 3 |
| ├ 자유 텍스트 입력 | FR-4.3 | 〃 |
| ├ 의미 검색 (역색인·개념사전·IDF) | §5.4.4, §4.6 `InvertedIndex`, `Concept` | 〃 |
| ├ 한글 정규화·자모 편집거리 | §5.4.3 | 〃 |
| ├ 응급 표현 감지 (RT0) | §5.4.2, `emergency.json` | 자유 입력이 없으면 감지 대상 자체가 없다 |
| └ 의도 라우터 (RT0~RT4) | §5.4.1 | 〃 |
| 3D 렌더링 전체 | §5.5.6, `ui/sim3d/` | 의견 2 |
| Three.js 의존성 | §3.1 | 〃 |
| 3단계 힌트 대화 상태 기계 | §5.3.3 | 대화가 없으므로 리포트 형식으로 대체 (§5) |
| NFR-5 (3D 프레임레이트) | §2.2 | 3D 없음 |
| FR-4.3~4.7, FR-4.9, FR-4.11 | §2.1 | 챗봇 전용 요구사항 |
| FR-5.1 (3D 변환), FR-5.11 (저사양 모드) | §2.1 | 3D 없음 |
| 리스크 R5 (저사양 3D 성능) | §10.1 | 소멸 |

### 1.2 유지 (변경 없음)

- 평면도 데이터 모델 (§4.1, §4.2) — `RoomBlock` / `OpeningBlock` / `PointBlock`
- 그래프 모델과 빌더 (§4.3, §5.2) — `ScenarioKey`, `goalNodeIds`, `reachesGoal`, `anchorCell`
- 검증 규칙 엔진과 규칙 목록 (§4.5, §5.3.1, §5.3.2) — **전량 유지**
- 인쇄 사양 (§5.6) — A4 1장, 흑백 판독성, 손글씨란. **단 레이아웃 중단부는 개정 (§6.8)**
- 저장 포맷·마이그레이션 (§4.8)
- 화재 상황별 대피 원칙 (§6.1) — **오히려 게임이 이를 자동으로 구현한다 (§3.6)**
- 제품 원칙 P1~P6 (§1.4)
- 제약 CON-1~CON-3, CON-6~CON-8 (§2.3). **CON-4·CON-5는 §6.5에서 개정**

### 1.3 전환 (없어지지 않고 형태만 바뀜)

| v1.0 | → | v1.1 |
|---|---|---|
| 챗봇 답변 (`KnowledgeEntry`) | → | 캐릭터 지도 카드 (`GuideCard`) — §4 |
| 챗봇 3단계 힌트 | → | 결과 리포트의 "고칠 점" 항목 — §5 |
| 챗봇 후속 질문 카드 | → | 캐릭터 트리거 대사 — §4.3 |
| 보호자 미션 (FR-4.10) | → | 유지. 캐릭터가 전달 |
| 3D 화재 시뮬레이션 | → | 2D 재난 대피 게임 — §3 |
| `SimState` (화재 전용) | → | `GameState` + `HazardField` (4종 공용) — §7 |

### 1.4 신규

| 대상 | 절 |
|---|---|
| 그리기 편의성 요구사항 (FR-7.*) | §2 |
| 위험장 엔진 (`core/hazard/`) | §3 |
| 재난 4종 게임 규칙 | §3.3~3.6 |
| 캐릭터 가이드 시스템 (`core/guide/`) | §4 |
| 결과 리포트 (`ui/report/`) | §5 |
| 재도전 루프 | §5.4 |
| 캐릭터 스프라이트 사양 | §4.5 |

---

## 2. 쟁점 1 — 그리기 편의성 (최우선)

> **v1.0 §10.1 R1에서 "가장 큰 리스크"로 지목했던 항목이 최우선 요구사항으로 격상되었다.** 이 절의 요구사항은 다른 모든 기능보다 우선한다.

### 2.1 목표 지표

구현의 성패를 말이 아니라 숫자로 판정한다.

| 지표 | 목표 |
|---|---|
| **초등 3학년이 평면도를 완성하는 시간** | **5분 이내** |
| 완성까지 필요한 최소 조작 수 | **20회 이내** (템플릿 사용 시) |
| 게임을 시작할 수 있는 최소 상태 도달 조작 수 | **5회 이내** |
| 잘못 눌러서 되돌려야 하는 비율 | 조작의 10% 이하 |

**측정 방법**: 앱에 조작 카운터와 경과 시간을 개발 모드에서 표시한다. M1 DoD에 포함한다.

### 2.2 설계 원칙

| ID | 원칙 | 설명 |
|---|---|---|
| **D1** | **백지에서 시작하지 않는다** | 항상 템플릿에서 출발. 빈 캔버스는 "직접 그릴래요"를 고른 경우에만 |
| **D2** | **드래그보다 클릭** | 팔레트 클릭 → 캔버스 클릭 2회로 배치 완료. 드래그도 지원하되 필수가 아니다 |
| **D3** | **자동으로 되는 것은 묻지 않는다** | 벽 생성, 문 후보 제시, 방 이름 프리셋, 크기 기본값 |
| **D4** | **실수를 막는다** | 겹침 배치 자체를 불가능하게. 되돌리기보다 애초에 못 하게 |
| **D5** | **미완성이어도 진행 가능** | 문이 없어도 게임을 시작할 수 있다. 게임이 그걸 알려준다 |
| **D6** | **모든 것을 크게** | 최소 히트박스 48×48px (NFR-10의 44px보다 상향) |

### 2.3 신규 기능 요구사항

| ID | 요구사항 | 우선순위 |
|---|---|---|
| **FR-7.1** | 팔레트 항목을 클릭한 뒤 캔버스를 클릭하면 **표준 크기로 즉시 배치**된다. 드래그는 선택 사항이다 (D2) | 필수 |
| **FR-7.2** | 방을 배치하면 **외벽이 자동 생성**된다. 사용자가 벽을 그리지 않는다 (D3) | 필수 |
| **FR-7.3** | 두 방이 변을 맞대면 그 경계에 **문 후보가 반투명으로 표시**되고, 클릭 한 번으로 문이 놓인다 (D3) | 필수 |
| **FR-7.4** | 방 배치 시 이름이 **자동으로 부여**된다 (`방 1`, `방 2`…). 이름 변경은 프리셋 버튼 또는 직접 입력 | 필수 |
| **FR-7.5** | 방을 드래그하면 인접 방·격자에 **자석 스냅**된다. 1칸 이내 오차는 자동 정렬 | 필수 |
| **FR-7.6** | 겹치는 배치는 **시도 자체가 차단**된다. 배치 후 겹침을 해소하게 하지 않는다 (D4) | 필수 |
| **FR-7.7** | 방을 이동·리사이즈하면 그 방에 붙은 문·창문·가구가 **함께 따라간다** | 필수 |
| **FR-7.8** | 팔레트는 **자주 쓰는 8종을 기본 노출**하고 나머지는 "더보기"에 둔다 | 필수 |
| **FR-7.9** | 캔버스는 **자동으로 내용에 맞춰 확대/축소**된다. 아이가 줌을 조작할 필요가 없다 | 필수 |
| **FR-7.10** | 어떤 상태에서든 **"이제 뭘 해야 해?" 버튼**이 있고, 누르면 캐릭터가 다음 한 단계를 알려주고 해당 팔레트 항목을 강조한다 (P3) | 필수 |
| **FR-7.11** | 개발 모드에서 조작 횟수·경과 시간이 표시된다 (§2.1 측정용) | 필수 |
| **FR-7.12** | 방은 직사각형만 허용한다 (v1.0 §4.2 유지). L자 방은 직사각형 2개로 표현하며, 두 방이 맞닿으면 자동으로 통로로 간주한다 | 필수 |

### 2.4 팔레트 기본 8종 (FR-7.8)

```
[ 방 ]  [ 문 ]  [ 현관문 ]  [ 창문 ]
[ 침대 ]  [ 주방(가스레인지) ]  [ 소파 ]  [ 더보기 ▾ ]
```

"더보기"에 들어가는 것: 중문, 발코니창, 비상구, 경량칸막이, 대피공간, 하향식피난구, 소화기, 감지기, 가스밸브, 책상·옷장·책장·냉장고·TV·식탁, 계단, 엘리베이터, 집결장소 마커

### 2.5 온보딩 흐름 (5회 조작으로 게임 시작)

```
1. "너희 집이랑 제일 비슷한 걸 골라볼래?"
   [방2 아파트] [방3 아파트] [단독주택] [직접 그릴래요]     ← 1회

2. "너희 집은 1층이나 반지하야?"  (침수 규칙 분기, v1.0 profile.lowFloor)
   [응] [아니야]                                              ← 2회

3. "네 방은 어디야? 눌러줘"
   (템플릿의 방 중 하나 클릭)                                 ← 3회

4. "가족들이 만나는 곳은 어디야?"  또는  [나중에 정할래]      ← 4회

5. [ 대피 연습 시작! ]                                        ← 5회
```

이 시점에 평면도가 완벽하지 않아도 게임이 시작된다(D5). 부족한 부분은 게임 결과 리포트가 알려주고, 아이는 고쳐서 다시 한다. **"완성해야 시작할 수 있다"가 아니라 "해보면서 완성한다"** 로 흐름을 뒤집는다.

---
## 3. 쟁점 2 — 2D 재난 대피 게임

### 3.1 전체 흐름

```
평면도 그리기 ──▶ 대피경로 그리기 ──▶ 🎮 게임 ──▶ 결과 리포트 ──┐
      ▲                  ▲                                      │
      │                  └──────── [다시 하기] ──────────────────┤
      └──────────────────────────── [평면도 고치기] ─────────────┘
```

**핵심 교육 장치**: 화재는 **랜덤으로 발생**한다(의견 2). 따라서 **아이가 그린 경로가 막힐 수 있다.** 이것이 실수가 아니라 이 게임의 목적이다.

> 아이는 "내가 그린 길이 항상 통하는 건 아니구나 → 그래서 두 번째 길이 필요하구나"를 **설명이 아니라 실패로** 배운다. 이 한 문장이 v1.0 §6.1(소방청 상황별 대피 지침)이 요구하던 교육을 게임 메커니즘만으로 달성한다.

### 3.2 경로 작도 방식의 단순화 (v1.0 FR-2.7 대체)

v1.0은 화재 시나리오 ①/②를 **탭 2개로 각각 그리게** 했다. 게임이 상황을 만들어주므로 이 방식은 불필요해졌고, 쟁점 1(그리기 편의)에도 불리하다.

| v1.0 | v1.1 |
|---|---|
| 화재① 탭 · 화재② 탭 (각각 경로 작도) | **주 경로** + **보조 경로** (한 화면) |
| 아이가 "현관이 막힌 상황"을 상상해야 함 | 게임이 실제로 막아줌 |
| 탭 5개 | 탭 1개(화재) + 경로 2줄 |

- **주 경로**: 평소 생각하는 대피로 (보통 현관)
- **보조 경로**: 주 경로가 막혔을 때의 길 (발코니·대피공간·경량칸막이 등). **선택 사항이며, 게임에서 주 경로가 막힌 뒤 리포트가 권한다.**

#### ★ `ScenarioKey`와의 연결 (반드시 이대로 구현할 것)

`ScenarioKey`(v1.0 §4.1)는 그대로 유지된다. **주/보조 경로는 각각 고정된 `ScenarioKey`를 갖는다.**

```ts
export interface RoutePair {
  /** key = scenarioKey(hazard, 'exit_available') */
  primary?: EvacRoute
  /** key = scenarioKey(hazard, 'exit_blocked'). 화재에만 의미가 있다 */
  alternate?: EvacRoute
}
export type RouteSet = Partial<Record<HazardKindId, RoutePair>>
```

`EvacRoute`(v1.0 §4.4)에 **필드 하나를 추가한다.** 이것이 정적 판정을 성립시키는 유일한 연결고리다.

```ts
export interface EvacRoute {
  key: ScenarioKey          // ★ 신규 필수 필드
  disaster: DisasterType
  scenario?: FireScenario
  startCell: Cell
  waypoints: Cell[]
  primaryShelter?: Cell     // 확장판 지진 전용
  meetingPointBlockId?: BlockId
}
```

**규칙 평가는 경로마다 한 번씩, 총 2회 수행한다.**

```ts
const reports = [routes.fire?.primary, routes.fire?.alternate]
  .filter(Boolean)
  .map(route => evaluate(RULES, {
    plan, graph, route,
    key: route.key,                      // ★ 'fire_exit_available' | 'fire_exit_blocked'
    disaster: route.disaster,
    scenario: route.scenario,            // ★ undefined 금지 (화재의 경우)
    profile,
  }))
```

> **`ctx.scenario`를 절대 `undefined`로 두지 않는다.** v1.0 §5.3.1의 러너 필터는 `!ctx.scenario`일 때 시나리오 한정 규칙을 **전부 통과**시키므로, RULE-F-01(①: 현관 경유)과 RULE-F-05(②: 대체 수단)가 동시에 평가되어 서로를 부정한다. v1.0 §5.3.2가 경고한 P3 위반 상태가 바로 이것이다.

**보조 경로가 없으면** `alternate` 평가를 건너뛰고, RULE-F-04(대체 피난수단 확보)가 `fail`로 잡혀 리포트의 "고칠 점"에 오른다. 이것이 정상 동작이다.

**게임 중의 `ScenarioKey`**는 승리 판정에만 쓰이며 §3.5·§5의 규칙 평가와는 별개다 — §3.10 참조.

즉 v1.0의 통행 가능성 표(§4.3)와 `goalNodeIds()`는 **한 줄도 바뀌지 않고** 그대로 쓰인다.

### 3.3 위험장(Hazard Field) 엔진 — 일반 모델

4종 재난을 하나의 엔진으로 표현한다. **기본판에서는 `fire` 프리셋만 구현하되, 구조는 4종을 담는다.**

```ts
// types/hazard.ts
export type HazardKindId = 'fire' | 'earthquake' | 'flood' | 'gas'

export interface HazardCell {
  /** 주 위험도 0~1. 화염 / 수위 / 가스농도 / 붕괴위험 */
  primary: number
  /**
   * ★ 부 위험은 **2층**으로 관리한다 (상부 / 호흡 높이).
   * 이 두 값이 자세(서기·낮은자세) 메커니즘의 유일한 근거다.
   * 화재 = 연기, 확장판 가스 = 농도(무거운 가스는 low가 먼저 찬다),
   * 확장판 침수 = 미사용, 확장판 지진 = 낙하물(low만 사용)
   */
  secondaryHigh: number
  secondaryLow: number
  /** 소진 자원 0~1. 화재의 연소하중. 다른 재난은 1 고정 */
  fuel: number
  state: 'intact' | 'active' | 'spent'
  isWall: boolean
}

/** §1.3 전환표의 이름. GameState.field 의 실체 */
export type HazardField = HazardCell[]      // 길이 = grid.width * grid.height

export interface HazardPreset {
  id: HazardKindId
  label: string
  /** 주 위험의 확산 속도 */
  primarySpread: number
  /** 부 위험(상부)의 확산 속도. 화재는 이 값이 primary보다 훨씬 크다 */
  secondarySpread: number
  /** 활성 셀이 매 틱 자체적으로 강해지는 양 */
  primaryGrowth: number
  /** 이 값을 넘으면 인접 셀이 활성화된다 */
  ignitionThreshold: number
  /** 활성 셀이 매 틱 소모하는 fuel. 0이면 무한 지속(침수·가스) */
  fuelBurnRate: number
  /** 활성 셀이 매 틱 생성하는 secondaryHigh */
  secondaryEmission: number
  /** secondaryHigh가 이 값을 넘으면 low로 내려오기 시작한다 */
  descendThreshold: number
  /** 하강 비율 */
  descendRate: number
  /** 노출량 누적 계수 */
  exposureRate: number
  /** 위험 0일 때의 시야 반경(셀) */
  visionBase: number
  /** 닫힌 문을 통과할 때의 감쇠 계수 */
  doorClosedFactor: number
  /** 낮은 자세일 때 노출 배율 */
  crouchFactor: number
  /** 제한 시간 (틱) */
  timeLimitTicks: number
  /** 발원지 선택 가중치. 블록 종류 → 가중치 */
  ignitionWeights: Record<string, number>
  /** 이 재난이 사용하는 ScenarioKey 목록. 목표 집합은 goalNodeIds() 하나만 결정한다 */
  scenarioKeys: ScenarioKey[]
  /** 재난 고유 규칙의 식별자 목록 (§3.4~3.7) */
  specialRules: string[]
}
```

프리셋은 `content/hazards/*.json`에 둔다. **기본판에서는 `fire.json` 하나만 존재하면 된다.**

#### 공통 틱 루프 (`core/hazard/field.ts`)

확산 계산에는 평면도·그래프·문 상태가 필요하므로, 틱 함수는 이를 담은 컨텍스트를 받는다.

```ts
/** 매 틱 변하지 않는 참조들. 게임 시작 시 1회 구성한다 */
export interface FieldContext {
  grid: GridSpec
  /** 셀 경계 → 개구부 정보. buildTransferMap(plan)으로 사전 계산 */
  boundaries: Map<string, { openingId?: BlockId; openingKind?: OpeningKind }>
  /** 셀 → 소속 노드 id. elevatorLocked 등 노드 기반 규칙이 사용 */
  cellToNode: Map<string, string>
  graph: PlanGraph
}

export function tick(state: GameState, ctx: FieldContext): void
```

```
tick(state, ctx):
  const { field, preset, doorState, player } = state
  1. 주 위험 확산
     for c in field where state === 'active':
       c.primary = min(1, c.primary + preset.primaryGrowth)
       for n in neighbors4(c):
         n.primary += preset.primarySpread * c.primary * transfer(c,n,ctx,doorState) * n.fuel
         if n.primary > preset.ignitionThreshold && n.fuel > 0 && n.state === 'intact':
           n.state = 'active'
       c.fuel = max(0, c.fuel - preset.fuelBurnRate)
       if c.fuel === 0 && preset.fuelBurnRate > 0: c.state = 'spent'
  2. 부 위험(상부) 생성 및 확산
     for c in field where state === 'active':
       c.secondaryHigh = min(1, c.secondaryHigh + preset.secondaryEmission)
     diffuse('secondaryHigh', preset.secondarySpread, transfer)
  3. 재난 고유 후처리 — 여기서 secondaryHigh → secondaryLow 하강이 일어난다
     for rule of preset.specialRules: SPECIAL_RULES[rule](state, ctx)
  4. updatePlayer(state, ctx)
  5. checkStatus(state, ctx)

transfer(a, b, ctx, doorState):
  b.isWall                                      → 0
  ctx.boundaries 에 개구부 없음 (방 경계=벽)      → 0
  개구부가 문이고 doorState[id] === 'closed'     → preset.doorClosedFactor
  그 외 (열린 문 / 창 / 같은 방)                  → 1.0
```

> **`FieldContext`를 두는 이유**: `HazardCell[]`만으로는 "이 두 셀 사이에 벽이 있는가, 문이 있는가"를 알 수 없다. 매 틱 평면도를 다시 조회하면 느리므로 시작 시 1회 사전 계산한다.

**핵심**: `tick()`은 재난 종류를 모른다. 프리셋 값과 `specialRules` 호출만 한다. 확장은 프리셋 JSON 추가 + 특수 규칙 함수 추가로 끝난다.

### 3.4 화재 프리셋 (기본판 — 이번 구현 대상)

```json
{
  "id": "fire",
  "label": "불이 났어요",
  "primarySpread": 0.06,
  "secondarySpread": 0.22,
  "primaryGrowth": 0.05,
  "ignitionThreshold": 0.6,
  "fuelBurnRate": 0.010,
  "secondaryEmission": 0.15,
  "descendThreshold": 0.6,
  "descendRate": 0.10,
  "exposureRate": 0.01,
  "visionBase": 8,
  "doorClosedFactor": 0.08,
  "crouchFactor": 0.35,
  "timeLimitTicks": 480,
  "ignitionWeights": {
    "gas_range": 40, "power_strip": 20, "heater": 8, "candle": 7,
    "bed": 6, "sofa": 6, "bookshelf": 5, "wardrobe": 4, "tv": 4
  },
  "scenarioKeys": ["fire_exit_available", "fire_exit_blocked"],
  "specialRules": ["smokeDescends", "doorHeatCheck", "elevatorLocked"]
}
```

**특수 규칙 3종**

| 규칙 | 내용 | 교육 목적 |
|---|---|---|
| `smokeDescends` | `secondary`(연기)가 천장에 차면 호흡 높이로 하강. 서 있으면 `max(low, high*0.8)`, 낮은 자세면 `low`만 흡입 | 낮은 자세의 효과를 체감 |
| `doorHeatCheck` | 문 앞에서 "만져보기" 액션. 문 너머 `primary`가 임계 이상이면 경고. 무시하고 열면 확산 가속 | 문 손잡이 확인 습관 |
| `elevatorLocked` | `elevator` 노드 진입 시 이동 불가, 시간만 소모 | 엘리베이터 금지를 결과로 학습 |

**연기가 불보다 3.7배 빠르다**(`0.22` vs `0.06`). 이 비율이 이 게임의 가장 중요한 교육 장치다 — 아이는 *"불은 저기 있는데 여기가 벌써 안 보여"* 를 경험한다.

### 3.5 발화점 랜덤화와 **플레이 가능성 보장** (필수)

의견 2의 "랜덤 발생"을 그대로 구현하되, **시작하자마자 이길 수 없는 판이 나오면 안 된다** (P3).

```
pickIgnition(plan, graph, preset, seed):
  for attempt in 1..20:
    cell = weightedRandom(preset.ignitionWeights, seed + attempt)
    field = simulateAhead(cell, ticks = preset.timeLimitTicks * 0.4)
    // 발화 후 40% 시점까지 시뮬레이션했을 때
    // 시작 지점에서 도달 가능한 목표가 하나라도 남아 있는가?
    if hasSurvivablePath(field, startCell, graph) → return cell
  return safestFallbackCell(plan)     // 20회 실패 시 가장 먼 가연 셀
```

- `hasSurvivablePath`는 그래프가 아니라 **셀 격자 위에서 BFS**로 확인한다. 위험도가 임계 이상인 셀은 통과 불가로 본다.
- `seed`는 `GameConfig.seed`에 저장되어 **같은 판을 재현**할 수 있다(테스트·디버깅·"이 판 다시" 기능).
- 20회 실패는 곧 "이 평면도는 출구가 하나뿐이라 구조적으로 위험하다"는 뜻이다. 이 경우 리포트가 **RULE-F-04(대체 피난수단 확보)** 를 최우선 항목으로 올린다.

### 3.6 확장판 프리셋 (설계만. 이번 구현 대상 아님)

> 아래는 **엔진이 담을 수 있음을 보이기 위한 설계**다. 기본판에서는 구현하지 않는다. 다만 `HazardPreset` 타입과 `specialRules` 훅이 이 3종을 수용할 수 있는지는 **M-G1에서 검토만 한다.**

| 재난 | primary | secondary | 목표 | 특수 규칙 | 난이도 |
|---|---|---|---|---|---|
| **침수** `flood` | 수위 (외부·저층에서 균일 상승 + 개구부 유입) | — | `lowFloor ? VN_upstairs : VN_outdoor` | `waterPressureDoor`(수위 임계 초과 시 문 안 열림), `slowMovement`, `electricShock`(전기 블록 접촉) | 낮음 — 확산 로직이 단순 |
| **가스** `gas` | 가스 농도 (밸브·레인지에서 확산) | — | `VN_outdoor` | `sparkIgnition`(전기 스위치·환풍기 조작 시 즉시 실패), `ventilation`(창문 열면 농도 감소), `valveShutoff` | 낮음 — 화재 확산 로직 재사용 |
| **지진** `earthquake` | 낙하·붕괴 위험 (가구 주변 정적 고위험) | 흔들림 강도 (시간축) | 흔들림 중: 저위험 셀 / 정지 후: `VN_outdoor` | `shakePhase`(**시간축 페이즈 — 흔들림 중 이동 시 페널티**), `fallingObjects`, `aftershock` | **높음 — 유일하게 구조가 다르다** |

**지진이 특수한 이유**: 다른 3종은 "위험이 공간으로 퍼진다"이지만 지진은 "위험이 시간으로 온다"이다. 페이즈 시스템(흔들림 → 정지 → 여진)이 필요하며, 이는 `specialRules` 훅만으로는 부족해 `GameState`에 `phase` 필드를 추가해야 한다.

> **확장 시 권장 순서: 가스 → 침수 → 지진.** 가스는 화재 확산 로직을 거의 그대로 쓰고, 침수는 확산이 더 단순하며, 지진은 마지막에 별도 설계를 붙인다.

### 3.7 시간제한 (의견 2) — 아동 불안 완화 필수

시간제한은 게임성에 필요하지만, **초등 저학년에게 카운트다운은 상당한 스트레스**다. P5(겁주지 않는다)와 충돌하지 않도록 다음을 반드시 지킨다.

| ID | 요구사항 |
|---|---|
| **FR-8.1** | 시간은 **숫자 카운트다운이 아니라 게이지**로 표시한다. 초록 → 노랑 → 빨강 |
| **FR-8.2** | **연습 모드**(시간 무제한)를 제공하고 **기본값으로 한다.** 시간제한은 "도전 모드"에서 켠다 |
| **FR-8.3** | 시간 초과 시 실패 연출을 하지 않는다. 화면 정지 후 곧바로 결과 리포트로 전환한다 |
| **FR-8.4** | 경고음·심장박동음·붉은 점멸을 사용하지 않는다 |
| **FR-8.5** | 학년 `easy`에서는 제한 시간이 1.5배, 확산 속도가 0.7배 |
| **FR-8.6** | 언제든 일시정지·중단할 수 있고, 중단해도 그때까지의 결과로 리포트를 볼 수 있다 |

> **FR-8.2가 특히 중요하다.** 첫 플레이는 반드시 시간 무제한이어야 한다. 아이가 규칙을 이해하기도 전에 시간에 쫓기면, 배우는 것은 대피 요령이 아니라 불안이다.

### 3.10 게임 중 승리 판정 (N-3 대응)

게임 도중 현관이 막히면 `ScenarioKey`가 뒤집히는데, 이때 목표 집합을 **교체하면 안 된다.** `fire_exit_blocked`의 목표에는 `VN_outdoor`가 없으므로, 발코니창으로 지상에 나가려던 아이의 목표가 갑자기 사라진다.

**게임의 승리 조건은 두 키의 합집합으로 고정한다.**

```ts
const GAME_GOALS = new Set([
  ...goalNodeIds(graph, 'fire_exit_available', profile),
  ...goalNodeIds(graph, 'fire_exit_blocked',   profile),
])
```

- 승리 판정: v1.0 §5.2의 `reachesGoal()`을 쓰되 목표 집합만 위 합집합으로 교체한다
- `hasSurvivablePath`(§3.5)도 **같은 합집합의 `anchorCell` 들을 BFS 목적지로** 사용한다. 보장 판정과 승리 판정의 기준이 하나여야 M4 DoD의 100회 시행 검증이 의미를 갖는다
- 실제로 어느 쪽으로 나갔는지는 `PlayLog.exitVia`에 기록하여 리포트가 `usedAlternateRoute`를 판정한다

### 3.8 조작

| 조작 | 방법 |
|---|---|
| 이동 | 방향키 / 화면 터치(탭한 방향으로 한 칸) / 드래그 경로 |
| 자세 전환 | 스페이스 / 화면 하단 큰 버튼 (서기 ↔ 낮은 자세) |
| 문 만져보기 | 문 앞에서 확인 버튼 |
| 문 닫기 | 통과 직후 자동 제안 (한 번 클릭) |
| 일시정지 | 우상단 |

- 조작 버튼은 최소 **56×56px** (게임 중은 D6보다 더 크게)
- 이동은 격자 단위 이산 이동이다. 픽셀 단위 자유 이동은 하지 않는다 — 구현이 단순하고 판정이 명확하다

### 3.9 렌더링

**게임 화면은 에디터와 동일한 SVG 렌더러를 재사용한다.** 별도 렌더러를 만들지 않는다.

```
<PlanCanvas mode="edit" | "game" | "print" />
```

- 위험 표현: 셀 위에 반투명 오버레이 `<rect>` — 화염은 주황 계열, 연기는 회색 계열의 불투명도로
- **P4 준수**: 위험도를 색만으로 표현하지 않는다. 화염 셀에는 사선 해칭, 연기 셀에는 점 패턴을 함께 적용한다
- 시야 제한: 플레이어 중심 원형 `<mask>` + 반경은 `visionRadius`
- 애니메이션: CSS transition. requestAnimationFrame 루프는 틱 갱신에만 사용
- 성능: 24×16 = 384셀. SVG로 충분하며 별도 최적화가 필요 없다

---

## 4. 쟁점 3 — 챗봇 제거 → 캐릭터 지도 시스템

### 4.1 무엇이 삭제되고 무엇이 남는가

```
❌ 삭제: 자유 텍스트 입력 · 의미 검색 · 개념 사전 · 역색인 · IDF
        한글 정규화 · 자모 편집거리 · 응급 감지 · 의도 라우터
        → core/chat/ 디렉터리 전체 삭제. 코드량 약 1/5로 감소

✅ 존치: 지식 콘텐츠(문장·출처) · 캐릭터 · 학년별 두 버전 · 보호자 미션
        → core/guide/ 로 이관. 전달 방식만 바뀜
```

**대화 엔진이 아니라 트리거 엔진이다.** 아이가 묻지 않고, 캐릭터가 상황을 보고 먼저 말한다. 결정론적이며 검색이 없으므로 P2(오답보다 모름이 낫다)가 구조적으로 보장된다.

### 4.2 데이터 모델

```ts
// types/guide.ts
export type Speaker = 'yeongi' | 'ungi' | 'ilgu'
export type Emotion = 'normal' | 'happy' | 'worried' | 'alert' | 'thinking'

export type GuideTrigger =
  | { on: 'stepEnter'; step: string }              // 온보딩 단계 진입
  | { on: 'blockPlaced'; blockKind: string }       // 특정 블록을 처음 놓았을 때
  | { on: 'ruleFail'; ruleId: string }             // 검증 규칙 위반
  | { on: 'rulePass'; ruleId: string }             // 규칙 통과 (칭찬)
  | { on: 'gameStart' }
  | { on: 'gameEvent'; event: string }             // 'enteredSmoke' | 'usedElevator' | 'closedDoor' ...
  | { on: 'gameEnd'; outcome: 'success' | 'fail' }
  | { on: 'idle'; seconds: number }                // 일정 시간 조작 없음
  | { on: 'helpRequested' }                        // FR-7.10 "이제 뭘 해야 해?"

export interface GuideRule {
  id: string
  trigger: GuideTrigger
  priority: number                  // 동시 발동 시 큰 값이 이긴다
  speaker: Speaker
  emotion: Emotion
  text: { easy: string; normal: string }
  /** 캔버스에서 강조할 대상 */
  highlight?: { cells?: Cell[]; blockIds?: string[]; paletteItem?: string }
  /** 이 대사에 딸린 학습 카드 (지식 콘텐츠) */
  cardId?: string
  /** 같은 대사를 다시 하기까지의 최소 간격(초). 0이면 1회만 */
  cooldown: number
  sourceIds: string[]               // P6 유지
}

/** v1.0 KnowledgeEntry를 대체. 검색 필드가 사라지고 표시 필드만 남는다 */
export interface GuideCard {
  id: string
  title: string                     // "왜 엘리베이터를 타면 안 될까?"
  body: { easy: string; normal: string }
  /** 결과 리포트·가이드 말풍선 양쪽에서 쓰인다 */
  relatedRuleIds?: string[]
  requiresGuardian?: boolean        // 보호자 미션 (v1.0 FR-4.10 유지)
  sourceIds: string[]               // P6
}
```

**v1.0 `KnowledgeEntry`에서 제거되는 필드**: `concepts`, `disasters`, `question`, `followUpCards`, `highlightBlocks`
**추가되는 것**: 없음. 순수하게 단순해진다.

### 4.3 가이드 러너 (`core/guide/runner.ts`)

```ts
export function selectGuide(
  rules: GuideRule[],
  event: GuideTrigger,
  history: Record<string, number>,   // ruleId → 마지막 발동 시각
  now: number,
): GuideRule | null
```

1. `trigger`가 일치하는 규칙을 모은다
2. 쿨다운이 지나지 않은 것을 제외한다 (같은 말 반복 금지 — 잔소리 방지)
3. `priority`가 가장 높은 하나를 반환한다
4. 없으면 `null` — 캐릭터는 침묵한다. **할 말이 없으면 말하지 않는다**

> **한 번에 하나만 말한다.** v1.0 §5.3.1의 `nextIssue` 원칙을 그대로 유지한다.

### 4.4 캐릭터 역할 분담

| 캐릭터 | 역할 |
|---|---|
| **영이 · 웅이** | 소방관. 설명·지도·안전 지식. 온보딩과 결과 리포트의 화자 |
| **일구** | 119 구조견. **발견과 격려.** "킁킁, 여기 뭔가 이상해!" / "잘했어!" / 게임 중 동행 |

**일구를 지적 담당으로 둔다.** 잘못된 부분을 소방관이 지적하면 잔소리가 되지만, 강아지가 킁킁거리며 찾아내면 놀이가 된다 (P5).

### 4.5 캐릭터 스프라이트 사양 (결정 7)

> **⚠️ 실무상 가장 주의할 항목이다.** 소방청은 캐릭터를 **일러스트·이미지 파일**로 제공하며, 게임용 방향별 스프라이트는 제공하지 않을 가능성이 높다.

**해법: 방향별 스프라이트를 요구하지 않는 표현 방식을 택한다.**

| 필요 | 방식 |
|---|---|
| 상하좌우 이동 | 캐릭터는 **항상 정면 고정**. 좌우 이동은 CSS `transform: scaleX(-1)` 반전만 |
| 낮은 자세 | **별도 1장** (웅크린 정면) |
| 걷기 애니메이션 | 스프라이트 시트 대신 **CSS 상하 미세 이동 + 약간의 기울임** |
| 표정 | 가이드 말풍선 전용. 게임 중에는 사용하지 않음 |

**최종 필요 에셋**

| 용도 | 장수 |
|---|---|
| 가이드 말풍선용 표정 | 3캐릭터 × 5표정 = 15 |
| 게임 플레이어용 | 선택 가능한 캐릭터 × 2자세 (정면 / 웅크림) = **최대 6** |
| **합계** | **최대 21장** |

- 게임 플레이어를 1종으로 고정하면 게임용은 **2장**으로 줄어든다. 아이가 캐릭터를 고르게 할지는 §11 **O-10**에서 결정한다.
- 표시 크기는 게임 내 1셀(약 40~48px). **원본은 96×96 한 벌로 충분하다.** 고해상도 원본을 그대로 넣으면 NFR-3(파일 크기)에 불리하다.
- **개발 중에는 플레이스홀더를 사용한다** (v1.0 CON-6 유지). 소방청 허가 후 파일명만 교체하고 코드는 수정하지 않는다.

### 4.6 UI 배치 변경

챗봇 패널(v1.0 §7.1, 400px)이 사라진다.

```
┌──────────────────────────────────────────────────────────┐
│ 상단바: 우리집 대피 지도        [학년 쉬움/보통] [연습/도전]│
├────────┬─────────────────────────────────────────────────┤
│ 팔레트 │                                                 │
│        │              캔버스 (SVG)                        │
│ 200px  │         에디터 / 게임 공용 렌더러                 │
│        │                                                 │
│ 8종+   │      ┌──────────────────────────┐               │
│ 더보기 │      │ 🐕 일구: "문을 닫고 가자!" │ ← 캐릭터 말풍선│
│        │      └──────────────────────────┘   (캔버스 위) │
├────────┴─────────────────────────────────────────────────┤
│ [이제 뭘 해야 해?]  [대피 연습 시작!]  [인쇄]   ▓▓▓░ 60%  │
└──────────────────────────────────────────────────────────┘
```

- 캐릭터 말풍선은 **고정 패널이 아니라 캔버스 위에 떠오르는 오버레이**다. 화면을 상시 점유하지 않는다.
- 말풍선은 자동으로 사라지거나(8초), 아이가 닫는다.
- **캔버스가 훨씬 넓어진다** — 쟁점 1(그리기 편의)에 직접 기여한다.
- `highlight`가 있으면 말풍선과 함께 캔버스·팔레트의 해당 대상이 강조된다.

---

## 5. 쟁점 4 — 결과 리포트와 재도전

### 5.1 두 개의 판정 소스

```
정적 판정 (규칙 엔진)          동적 판정 (게임 플레이)
평면도·경로가 올바른가          실제로 어떻게 행동했는가
RuleReport (v1.0 §4.5)         PlayLog (신규)
        └───────────┬───────────┘
                    ▼
              ReportItem[]
      [잘한 점] / [고칠 점] 으로 분류
```

**v1.0의 규칙 엔진(§5.3)은 그대로 쓴다.** 여기에 게임 플레이 로그 판정을 더할 뿐이다.

### 5.2 데이터 모델

```ts
// types/report.ts
export interface PlayLog {
  seed: number
  /** GameState.origin 과 동일. 리포트만 보고도 판을 재현할 수 있도록 복사 저장 */
  origin: Cell
  outcome: 'success' | 'fail'
  /** 어느 목표로 나갔는가. usedAlternateRoute 판정의 근거 (§3.10) */
  exitVia?: string
  failReason?: 'exposure' | 'flame' | 'timeout' | 'trapped' | 'quit'
  elapsedTicks: number
  visited: Cell[]
  /** 게임 중 발생한 판정 이벤트 */
  events: {
    closedDoorBehind: number      // 문을 닫고 지나간 횟수
    stoodInHazard: number         // 위험 속에서 서 있던 틱
    crouchedInHazard: number      // 위험 속에서 낮은 자세였던 틱
    usedElevator: boolean
    checkedDoorHeat: number       // 문 온도를 확인한 횟수
    openedHotDoor: boolean
    passedHazardSource: boolean   // 발화원 인접을 통과
    matchedDrawnRoute: number     // 그린 경로와 일치한 비율 0~1
    usedAlternateRoute: boolean   // 보조 경로를 사용
  }
}

export type ReportPolarity = 'good' | 'fix'

export interface ReportItem {
  id: string
  polarity: ReportPolarity
  /** 아이에게 보이는 한 줄 */
  headline: { easy: string; normal: string }
  /** "왜?"를 눌렀을 때 펼쳐지는 학습 카드 */
  cardId?: string
  /** 캔버스에서 강조할 위치 */
  highlight?: { cells?: Cell[]; blockIds?: string[] }
  /** 정렬용. 큰 값이 위로 */
  weight: number
  /** 이 항목을 고치러 가는 동작 */
  action?: { type: 'editPlan' } | { type: 'editRoute' } | { type: 'replay' }
  sourceIds: string[]
}

export interface Report {
  outcome: 'success' | 'fail'
  good: ReportItem[]
  fix: ReportItem[]
  playLog: PlayLog
  attemptNo: number
}
```

### 5.3 리포트 생성 규칙

**정적 항목의 문장 출처**: `content/ruleMessages.json`의 스키마를 아래로 개정한다 (v1.0 §4.5 `RuleMessages` 대체).

```ts
export interface RuleMessages {
  /** 고칠 점 한 줄. ReportItem.headline 이 된다 */
  reportHeadline: { easy: string; normal: string }
  /** 통과 시 잘한 점 한 줄 */
  praise: { easy: string; normal: string }
  /** [왜?]로 펼칠 학습 카드 */
  whyCardId?: string
}
```
> v1.0의 `hint1` / `hint2` / `answer`는 3단계 대화가 사라지면서 소비처가 없어졌다. **`answer` 문장을 `reportHeadline`으로 옮기고 나머지는 폐기한다.**

```
buildReport(ruleReport, playLog, profile) -> Report

1. 정적 항목 수집
   ruleReport.passed → polarity 'good',  headline = messages[id].praise
   ruleReport.failed → polarity 'fix',   headline = messages[id].reportHeadline
   weight = { critical: 100, important: 70, tip: 40 }[severity]
   ※ 동적 항목의 weight(60~120, §5.3 판정표)와 같은 척도다. 함께 정렬된다

2. 동적 항목 수집 (아래 판정표)

3. ★ 잘한 점 최소 1개 보장 (P5)
   good이 비어 있으면 폴백 항목을 넣는다:
     - 실패했더라도: "끝까지 포기하지 않고 대피를 시도했어!"
     - 첫 시도라면:  "처음인데 우리 집 지도를 다 그렸구나!"
   실패한 아이에게 칭찬 없는 결과 화면을 보여주지 않는다.

4. ★ 고칠 점 최대 3개 (압도 방지)
   weight 내림차순 정렬 후 상위 3개만 표시.
   나머지는 "다시 하면 또 알려줄게"로 감춘다.

5. 순서: [결과 배너] → [잘한 점] → [고칠 점] → [버튼]
   잘한 점이 반드시 먼저 온다.
```

**동적 판정표**

| 조건 | 극성 | 한 줄 (easy) | 학습 카드 | weight |
|---|---|---|---|---|
| `usedElevator` | fix | "엘리베이터를 탔네. 불이 나면 멈출 수 있어" | `fire.elevator.forbidden` | 100 |
| `openedHotDoor` | fix | "뜨거운 문을 열었어. 열기 전에 만져보자" | `fire.door.heatcheck` | 95 |
| `stoodInHazard > crouchedInHazard` | fix | "연기 속에서 서서 걸었어. 낮은 자세가 훨씬 안전해" | `fire.smoke.posture` | 90 |
| `passedHazardSource` | fix | "불이 시작된 곳 가까이를 지나갔어" | `fire.route.hazard` | 80 |
| `failReason === 'trapped'` | fix | "나갈 길이 하나뿐이었어. 다른 길도 만들어 두자" | `fire.secondexit` | 100 |
| `matchedDrawnRoute < 0.5` | fix | "네가 그린 길이랑 다르게 갔네. 왜 그랬을까?" | — | 60 |
| `closedDoorBehind > 0` | **good** | "문을 닫고 나왔어! 불이 훨씬 천천히 번져" | `fire.door.close` | 90 |
| `crouchedInHazard > stoodInHazard` | **good** | "낮은 자세로 잘 지나갔어!" | `fire.smoke.posture` | 85 |
| `checkedDoorHeat > 0` | **good** | "문을 만져보고 확인했구나. 소방관처럼 했어!" | `fire.door.heatcheck` | 85 |
| `usedAlternateRoute` | **good** | "첫 번째 길이 막히니까 다른 길을 찾았어!" | `fire.secondexit` | 95 |
| `outcome === 'success'` | **good** | "무사히 밖으로 나왔어!" | — | 120 |

> **`closedDoorBehind`와 `usedAlternateRoute`를 good으로 크게 배점한 이유**: 이 둘이 이 교육의 최종 목표 행동이다. 아이가 이 두 가지를 하게 되면 프로그램은 성공한 것이다.

### 5.4 재도전 루프

```
┌─────────────────── 결과 리포트 ───────────────────┐
│                                                   │
│   🐕 "이번엔 어땠는지 같이 볼까?"                  │
│                                                   │
│   ✅ 잘한 점                                       │
│      • 문을 닫고 나왔어! 불이 훨씬 천천히 번져 [왜?]│
│      • 낮은 자세로 잘 지나갔어!              [왜?]│
│                                                   │
│   🔧 이렇게 하면 더 좋아                            │
│      • 엘리베이터를 탔네. 불이 나면 멈출 수 있어[왜?]│
│      • 나갈 길이 하나뿐이었어                 [왜?]│
│                                                   │
│   [ 🔄 다시 해보기 ]  [ ✏️ 지도 고치기 ]  [ 🖨 인쇄 ]│
└───────────────────────────────────────────────────┘
```

| 버튼 | 동작 |
|---|---|
| **다시 해보기** | 같은 평면도, **새로운 랜덤 발화점**. 시도 횟수 +1 |
| **지도 고치기** | 에디터로 이동. **지적된 대상이 강조된 상태**로 열린다. 캐릭터가 첫 항목을 안내 |
| **인쇄** | 언제든 가능 (P3). 완료 조건을 걸지 않는다 |
| **[왜?]** | 그 자리에서 `GuideCard` 본문이 펼쳐진다. 화면 전환 없음 |

**진행 기록** (v1.0 `SaveFile.progress` 확장)

```ts
progress: {
  attempts: number
  successes: number
  /** 획득한 good 항목 ID 집합. 중복 없이 누적 */
  earnedGoodIds: string[]
  /** 아직 한 번도 해결하지 못한 fix 항목 ID */
  pendingFixIds: string[]
  guardianMissions: { id: string; done: boolean }[]
}
```

- 같은 지적이 반복되면 캐릭터의 안내가 더 구체적으로 바뀐다 (2회차부터 `highlight` 강제 표시)
- **성공 3회 또는 주요 good 항목 5종 획득 시** "우리집 대피 박사" 표시. 점수·등급·순위는 만들지 않는다 (P5 — 경쟁이 목적이 아니다)

---
## 6. 요구사항 변경

### 6.1 삭제되는 요구사항

| ID | 내용 | 사유 |
|---|---|---|
| FR-2.7, FR-2.8 | 화재 시나리오 2종 각각 작도 | §3.2 주/보조 경로로 대체 |
| FR-4.2 | 챗봇 버튼 카드 (항상 2~4개) | 삭제. P3 보장은 FR-9.7·FR-9.8·FR-10.9가 승계 |
| FR-4.2~4.7 | 챗봇 카드·자유입력·의미검색·응급감지·라우팅 | 의견 3 |
| FR-4.9 | 챗봇 답변 음성 읽기 | 챗봇 없음. TTS는 FR-9.5로 이관 |
| FR-4.11 | 챗봇 패널 접기 | 패널 자체가 없음 |
| FR-5.1 | 평면도 → 3D 변환 | 의견 2 |
| FR-5.11 | 저사양 모드 | 3D 없음 |
| NFR-5 | 3D 프레임레이트 | 3D 없음 |
| R5 | 저사양 기기 3D 성능 리스크 | 소멸 |

### 6.1b ★ 개정되는 v1.0 요구사항 (누락 방지)

**v1.0의 아래 요구사항은 "필수"로 남아 있으나 v1.1 구조와 충돌한다. 반드시 아래대로 개정한다.**

| v1.0 ID | v1.0 내용 | v1.1 개정 |
|---|---|---|
| **FR-2.1** | 재난 4종을 탭으로 전환 | **개정** — "재난 탭은 구현된 `HazardPreset` 수만큼 표시된다. **기본판은 화재 1종이므로 탭 UI를 표시하지 않는다.** 확장 프리셋이 추가되면 자동으로 탭이 늘어난다" |
| **FR-2.2** | 재난별로 각각 다른 대피경로 | **개정** — "재난별로 `RoutePair`(주/보조)를 갖는다. `RouteSet = Partial<Record<HazardKindId, RoutePair>>`" (§3.2) |
| **FR-2.5** | 지진 1차 대피처 지정 (필수) | **확장판 E3로 이월.** 기본판에서 우선순위 "해당 없음". `EvacRoute.primaryShelter` 필드는 남기되 채우는 UI를 만들지 않는다 |
| **FR-2.6** | 재난별 색+선종류+번호 구분 | **개정** — "**주 경로와 보조 경로**를 색 + 선종류 + 번호로 구분한다 (P4). 확장 시 재난별 구분이 추가된다" |
| **FR-3.6** | 규칙 위반 시 힌트→힌트→정답 3단계 | **개정** — "규칙 위반은 결과 리포트의 '고칠 점' 한 줄로 제시하고, `[왜?]`를 누르면 학습 카드가 펼쳐지는 **2단계**로 한다" (§5.4) |
| **RULE-E-01~04** | 지진 규칙 (critical 포함) | **확장판 E3로 이월.** 기본판 규칙셋에서 제외 |
| **RULE-W-01~03** | 침수 규칙 | **확장판 E2로 이월** |
| **RULE-G-01~04** | 가스 규칙 | **확장판 E1로 이월** |
| **CT-8** | 모든 엔트리는 `followUpCards` 1개 이상 | **개정** — "모든 `GuideRule`은 `cooldown`을 명시하고, 모든 `ReportItem`은 `weight`를 갖는다. `followUpCards` 조항은 삭제" |
| **v1.0 §6.3** | 개념 사전 구축 지침 | **절 전체 삭제** (검색 없음) |
| **v1.0 §6.5** | 콘텐츠 분량 목표 | **개정** — 아래 §6.6 |
| **v1.0 §9** | 정책 테스트 4건 | **개정** — 아래 §6.7 |
| **v1.0 §3.6** | validate 검사 항목 | **개정** — §8.3 |
| **v1.0 부록 C.2** | 규칙 프롬프트 (hint1/hint2/answer/praise 4문장) | **개정** — `reportHeadline` / `praise` / `whyCardId` 3필드 (§5.3) |

> `profile.lowFloor`(v1.0)는 **기본판에서도 계속 수집한다.** 침수 규칙은 확장판으로 이월되지만, 온보딩 2번 질문(§2.5)을 나중에 끼워 넣으면 저장 스키마를 또 바꿔야 한다.

### 6.2 존치·이관되는 요구사항

| v1.0 ID | v1.1 ID | 변경 내용 |
|---|---|---|
| FR-4.1 | **FR-9.1** | 캐릭터가 화자로 표시된다 → 말풍선 오버레이로 |
| FR-4.8 | **FR-9.4** | 쉬움/보통 난이도 전환 (변경 없음) |
| FR-4.10 | **FR-9.6** | 보호자 미션 (변경 없음) |
| FR-5.2 | **FR-8.7** | 발화점 랜덤 지정 → **플레이 가능성 보장 조건 추가**(§3.5) |
| FR-5.3~5.4 | **FR-8.8** | 위험·연기 확산, 연기가 더 빠름 |
| FR-5.5~5.6 | **FR-8.9** | 플레이어 조작, 자세에 따른 노출·시야 |
| FR-5.7 | **FR-8.10** | 문 온도 확인 |
| FR-5.8 | **FR-8.11** | 엘리베이터 미작동 |
| FR-5.9 | **FR-8.12** | 닫힌 문의 확산 지연 |
| FR-5.10 | **FR-10.*** | 결과 설명 + 재도전 → 결과 리포트로 확대 |

### 6.3 신규 요구사항

#### FR-7. 그리기 편의성 — §2.3에 정의 (FR-7.1 ~ FR-7.12)

#### FR-8. 2D 재난 대피 게임

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-8.1 | 시간을 숫자가 아닌 **게이지**로 표시 (초록→노랑→빨강) | 필수 |
| FR-8.2 | **연습 모드(무제한)를 기본값**으로, 도전 모드에서 시간제한 | 필수 |
| FR-8.3 | 시간 초과 시 실패 연출 없이 결과 리포트로 전환 | 필수 |
| FR-8.4 | 경고음·심장박동음·붉은 점멸 사용 금지 | 필수 |
| FR-8.5 | `easy` 학년에서 제한시간 1.5배, 확산 0.7배 | 필수 |
| FR-8.6 | 언제든 일시정지·중단 가능. 중단해도 리포트 제공 | 필수 |
| FR-8.7 | 발화점은 랜덤이며, **시작 시점에 생존 가능한 경로가 존재함을 보장**한다 | 필수 |
| FR-8.8 | 위험과 연기가 격자 기반으로 확산되며 연기가 더 빠르다 | 필수 |
| FR-8.9 | 플레이어 조작, 자세(서기/낮은 자세)에 따른 노출량·시야 변화 | 필수 |
| FR-8.10 | 문 온도 확인 액션. 뜨거운 문을 열면 불리하게 작동 | 필수 |
| FR-8.11 | 엘리베이터 진입 시 이동 불가, 시간만 소모 | 필수 |
| FR-8.12 | 닫힌 문은 확산을 크게 지연시킨다 | 필수 |
| FR-8.13 | 게임 화면은 **에디터와 동일한 SVG 렌더러**를 재사용한다 | 필수 |
| FR-8.14 | 위험 표현은 색 + 패턴(해칭·점)으로 이중 부호화한다 (P4) | 필수 |
| FR-8.15 | 같은 `seed`로 동일한 판을 재현할 수 있다 | 필수 |
| FR-8.16 | 위험장 엔진은 재난 종류를 **프리셋 JSON으로 받는다.** 화재 전용 하드코딩 금지 | 필수 |
| FR-8.17 | 지진·침수·가스 프리셋을 추가할 수 있는 확장점(`specialRules` 훅)을 갖는다 | 필수 |

#### FR-9. 캐릭터 지도 시스템

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-9.1 | 소방청 캐릭터가 화자로 표시된다 (말풍선 오버레이) | 필수 |
| FR-9.2 | 캐릭터 대사는 **트리거 기반**으로 발동한다. 자유 입력은 없다 | 필수 |
| FR-9.3 | 같은 대사는 쿨다운 내에 반복되지 않는다 | 필수 |
| FR-9.4 | 답변은 쉬움/보통 두 난이도로 전환된다 | 필수 |
| FR-9.5 | 대사를 음성으로 읽어줄 수 있다 (실패 시 조용히 비활성화) | 권장 |
| FR-9.6 | 아이 혼자 알 수 없는 항목은 보호자 미션으로 전환한다 | 필수 |
| FR-9.7 | **"이제 뭘 해야 해?"** 요청 시 다음 한 단계를 안내하고 대상을 강조한다 | 필수 |
| FR-9.8 | 할 말이 없으면 캐릭터는 침묵한다 | 필수 |
| FR-9.9 | 캐릭터를 게임 플레이어로 사용한다. **방향별 스프라이트를 요구하지 않는 표현**을 쓴다 (§4.5) | 필수 |

#### FR-10. 결과 리포트

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-10.1 | 게임 종료 시 **잘한 점 / 고칠 점** 으로 정리된 리포트를 표시한다 | 필수 |
| FR-10.2 | 정적 판정(규칙 엔진)과 동적 판정(플레이 로그)을 통합한다 | 필수 |
| FR-10.3 | **잘한 점이 항상 1개 이상 존재한다.** 실패해도 예외 없다 (P5) | 필수 |
| FR-10.4 | **고칠 점은 최대 3개**만 표시한다 | 필수 |
| FR-10.5 | 잘한 점이 고칠 점보다 먼저 표시된다 | 필수 |
| FR-10.6 | 각 항목의 `[왜?]`를 누르면 학습 카드가 그 자리에서 펼쳐진다 | 필수 |
| FR-10.7 | **다시 해보기** — 같은 평면도, 새 랜덤 발화점 | 필수 |
| FR-10.8 | **지도 고치기** — 지적 대상이 강조된 상태로 에디터 진입 | 필수 |
| FR-10.9 | 인쇄는 언제든 가능하다. 완료 조건을 걸지 않는다 (P3) | 필수 |
| FR-10.10 | 점수·등급·순위를 만들지 않는다 (P5) | 필수 |
| FR-10.11 | 시도 이력을 누적 저장한다 | 필수 |

### 6.4 비기능 요구사항 변경

| ID | 변경 |
|---|---|
| NFR-3 | 단일 파일 크기 **8MB → 4MB** (Three.js 제거로 여유. 목표 3MB) |
| NFR-5 | **삭제** |
| **NFR-12** | **신규** — 초등 3학년이 평면도를 5분 이내, 20회 조작 이내에 완성 (§2.1) |
| **NFR-13** | **신규** — 게임 화면 60fps (SVG 384셀 기준. 저사양 기기 포함) |
| NFR-11 | 커버리지 대상 변경: `core/grid`, `core/graph`, `core/rules`, `core/hazard`, `core/game`, `core/report`, `core/guide` |

### 6.5 제약 변경

| ID | 변경 |
|---|---|
| CON-4 | "3D 에셋 사용 불가" → **"게임·에디터 그래픽은 SVG로 코드 생성한다. 비트맵 에셋은 캐릭터에 한한다"** |
| CON-5 | "캐릭터는 2D 이미지로만 제공" → 유지. **§4.5의 스프라이트 회피 설계가 이 제약의 대응이다** |
| CON-1 | 유지. **챗봇이 사라져 이 제약의 준수가 구조적으로 자명해졌다** |

### 6.6 콘텐츠 분량 목표 개정 (v1.0 §6.5 대체)

| 항목 | v1.0 | v1.1 |
|---|---|---|
| 지식 엔트리 → **GuideCard** | 80~150 | **40~60** |
| 개념 / 표면형 / 응급표현 | 40 / 8 / 20 | **삭제 (0)** |
| **GuideRule** (캐릭터 대사) | — | **60~100** |
| 규칙 메시지 세트 | 규칙 수 × 4문장 | 규칙 수 × **2문장** (`reportHeadline`, `praise`) |
| **ReportItem** 동적 판정 문장 | — | **11종** (§5.3 판정표) |
| 출처 | 10~20 | 10~20 (유지) |

**총 분량은 v1.0 대비 약 40% 감소한다.**

### 6.7 정책 테스트 개정 (v1.0 §9 대체)

v1.0의 4건 중 3건이 삭제된 타입을 참조한다. 아래로 교체한다.

```ts
// ❌ 삭제 — followUpCards / searchKnowledge 참조 테스트 3건

// ✅ P6 유지 (수정 없음): 출처 없는 콘텐츠 없음
test('every guide card has a verified source', () => {
  for (const c of allCards) {
    expect(c.sourceIds.length).toBeGreaterThan(0)
    expect(c.sourceIds).not.toContain('TODO-VERIFY')
  }
})

// ✅ 신규 P3: 깨진 카드 링크 없음
test('no broken card links', () => {
  for (const r of allGuideRules) if (r.cardId) expect(cardById[r.cardId]).toBeDefined()
  for (const i of allReportItems) if (i.cardId) expect(cardById[i.cardId]).toBeDefined()
})

// ✅ 신규 P3: 도움 요청은 항상 응답한다 (FR-9.7)
test('helpRequested always yields a guide', () => {
  for (const step of ALL_STEPS)
    expect(selectGuide(rules, { on: 'helpRequested' }, {}, 0, step)).not.toBeNull()
})

// ✅ 신규 P5: 실패해도 잘한 점이 있다 (FR-10.3)
test('every failure still produces at least one good item', () => {
  for (const reason of ALL_FAIL_REASONS) {
    const r = buildReport(emptyRuleReport, failLog(reason), profile)
    expect(r.good.length).toBeGreaterThanOrEqual(1)
    expect(r.fix.length).toBeLessThanOrEqual(3)
  }
})

// ✅ 신규 FR-8.16: 위험장 엔진에 재난 하드코딩 없음
test('hazard field engine is disaster-agnostic', () => {
  const src = readFileSync('src/core/hazard/field.ts', 'utf8')
  expect(src).not.toMatch(/'fire'|"fire"|smoke|화재|연기/)
})

// ✅ 신규 FR-8.7: 랜덤 발화가 이길 수 없는 판을 만들지 않는다
test('100 random ignitions all leave a survivable path', () => {
  for (const fx of FIXTURES) for (let seed = 0; seed < 100; seed++)
    expect(hasSurvivablePath(simulateAhead(pickIgnition(fx, seed)), fx)).toBe(true)
})
```

### 6.8 인쇄 레이아웃 개정 (v1.0 §5.6 중단부 대체)

v1.0의 중단부는 "화재② · 지진 · 침수 · 가스" **미니맵 4칸**이었다. 기본판은 화재 전용이므로 데이터 소스가 없다. 아래로 교체한다.

```
┌────────────────────────────────────────────┐
│  우리집 대피 지도            [소방청 로고]   │  25mm
├────────────────────────────────────────────┤
│         메인 지도 — 주 경로                 │
│         굵은 실선 화살표 + 번호 ①②③        │  115mm
│         (보조 경로는 같은 지도에 파선으로)   │
├──────────────────┬─────────────────────────┤
│  🚪 못 나갈 때    │  ✅ 우리 가족 약속       │  55mm
│  [보조 경로 미니맵]│  □ 문을 닫고 나가기     │
│  한 줄 요령       │  □ 낮은 자세로 이동     │
│                  │  □ 엘리베이터 안 타기   │
│                  │  □ 만나는 곳으로 모이기 │
├──────────────────┴─────────────────────────┤
│  우리 가족 만나는 곳: ________________      │
│  보호자 연락처: ______________________      │  50mm
│  🚨 화재·구조·구급 119                      │
├────────────────────────────────────────────┤
│  가족과 함께 확인할 것: (미완료 보호자 미션) │  20mm
└────────────────────────────────────────────┘
```

- 확장판이 추가되면 우측 체크리스트 영역을 **재난별 미니맵 행**으로 교체한다. 레이아웃 골격은 그대로다.
- 보조 경로가 없으면 좌하단 칸에 *"못 나갈 때 갈 곳을 아직 안 정했어요"* 를 표시하고 빈 칸으로 인쇄한다. 이것도 교육 효과가 있다.
- 나머지 규칙(흑백 판독성, 이중 부호화, 손글씨란, PNG 300dpi 내보내기)은 v1.0 §5.6 그대로 유지한다.

---

## 7. 데이터 모델 변경

### 7.1 삭제되는 타입

```ts
// types/knowledge.ts — 파일 전체 삭제
Concept, InvertedIndex, EmergencyPattern, SearchContext, SearchResult
KnowledgeEntry            → GuideCard 로 대체 (§4.2)
Source                    → types/guide.ts 로 이동 (유지)

// types/chat.ts — 파일 전체 삭제
ChatResponse, ChatCard

// types/sim.ts — 파일 전체를 types/hazard.ts 로 대체
SimCell, SimState, SimConfig, PlayerState, SimStatus, FailReason
```

### 7.2 신규 타입 파일

| 파일 | 내용 |
|---|---|
| `types/hazard.ts` | `HazardKindId`, `HazardCell`, `HazardPreset`, `HazardField` (§3.3) |
| `types/game.ts` | `GameState`, `PlayerState`, `GameConfig`, `GameStatus` |
| `types/guide.ts` | `Speaker`, `Emotion`, `GuideTrigger`, `GuideRule`, `GuideCard`, `Source` (§4.2) |
| `types/report.ts` | `PlayLog`, `ReportItem`, `Report` (§5.2) |

### 7.3 `GameState` (v1.0 `SimState` 대체)

```ts
// types/game.ts
export type GameStatus = 'ready' | 'running' | 'paused' | 'success' | 'failed'
export type Posture = 'stand' | 'crouch'

export interface PlayerState {
  cell: Cell
  posture: Posture
  facing: 'left' | 'right'      // 스프라이트 좌우 반전용 (§4.5)
  exposure: number              // 0~1
  visionRadius: number
}

export interface GameConfig {
  hazardId: HazardKindId        // 기본판은 'fire'
  seed: number
  timed: boolean                // false = 연습 모드 (기본값, FR-8.2)
  gradeMode: 'easy' | 'normal'
}

export interface GameState {
  tick: number
  config: GameConfig
  preset: HazardPreset
  field: HazardCell[]           // width*height
  doorState: Record<BlockId, 'open' | 'closed'>
  origin: Cell                  // 발원지
  player: PlayerState
  status: GameStatus
  failReason?: PlayLog['failReason']
  /** 확장판 지진 전용. 기본판에서는 항상 undefined */
  phase?: 'shaking' | 'still' | 'aftershock'
  log: PlayLog
}
```

> `phase` 필드를 지금 넣어 두는 이유: 확장판 지진(§3.6)이 유일하게 시간축 구조를 요구하기 때문이다. 나중에 추가하면 `GameState`를 쓰는 모든 코드를 손봐야 한다. **지금은 `undefined`로 두고 아무도 읽지 않는다.**

### 7.4 `SaveFile` 변경

```ts
export const SCHEMA_VERSION = 2      // 1 → 2

export interface SaveFile {
  schemaVersion: number
  createdAt: string
  updatedAt: string
  profile: UserProfile
  plan: FloorPlan
  routes: RouteSet                   // ★ 구조 변경 (아래)
  progress: {
    attempts: number
    successes: number
    earnedGoodIds: string[]
    pendingFixIds: string[]
    guardianMissions: { id: string; done: boolean }[]
    completedSteps: string[]
  }
}

/** v1.0의 5개 키(fire_exit_available/blocked/earthquake/flood/gas) → 주·보조 2개 */
export interface RouteSet {
  primary?: EvacRoute
  alternate?: EvacRoute
}
```

**마이그레이션 1 → 2** (v1.0 §4.8 규약에 따라 추가)

```ts
migrations[1] = (d) => ({
  ...d,
  schemaVersion: 2,
  routes: {
    primary: d.routes?.fire_exit_available ?? d.routes?.earthquake,
    alternate: d.routes?.fire_exit_blocked,
  },
  progress: {
    attempts: 0, successes: 0, earnedGoodIds: [], pendingFixIds: [],
    guardianMissions: d.progress?.guardianMissions ?? [],
    completedSteps: d.progress?.completedSteps ?? [],
  },
})
```

### 7.5 `UserProfile` 변경

```ts
export interface UserProfile {
  lowFloor: boolean
  gradeMode: 'easy' | 'normal'
  blockStyle: 'kid' | 'blueprint'
  ttsEnabled: boolean
  lowPerformanceMode: boolean       // ❌ 삭제 (3D 없음)
  /** ✅ 신규 — 게임 플레이어 캐릭터. O-10이 "1종 고정"으로 결정되면 값이 항상 같을 뿐
      필드는 유지한다. 나중에 선택제로 바꿔도 스키마 변경이 없다 (§11 O-10) */
  playerCharacter: Speaker
}
```

### 7.6 유지되는 타입 (변경 없음)

`Cell`, `Rect`, `GridSpec`, `RoomBlock`, `OpeningBlock`, `PointBlock`, `FloorPlan`,
`GraphNode`, `GraphEdge`, `PlanGraph`, `EdgeVia`, `Passability`, `VirtualId`,
`ScenarioKey`, `scenarioKey()`, `goalNodeIds()`, `reachesGoal()`, `EscapeResult`,
`RuleDef`, `RuleContext`, `RuleResult`, `RuleReport`, `RuleMessages`, `EvacRoute`

> **v1.0에서 정합성을 맞추느라 가장 공들였던 그래프·규칙 계층이 그대로 살아남는다.** 이번 변경은 그 위에 얹힌 전달 계층(챗봇·3D)만 교체한다.

---

## 8. 아키텍처 변경

### 8.1 기술 스택

| 항목 | v1.0 | v1.1 |
|---|---|---|
| 3D | Three.js r16x | **삭제** |
| 렌더링 | SVG(에디터) + WebGL(게임) | **SVG 단일** |
| 그 외 | TypeScript, Vite, React 18, Zustand, Vitest | 변경 없음 |

**런타임 의존성이 4개(react, react-dom, zustand + 빌드도구)로 줄어든다.** v1.0 §3.1의 "의존성 최소화 원칙"이 더 쉽게 지켜진다.

### 8.2 디렉터리 변경

```
src/
├── types/
│   ├── plan.ts            (유지)
│   ├── graph.ts           (유지)
│   ├── rules.ts           (유지)
│   ├── save.ts            (변경 §7.4)
│   ├── knowledge.ts       ❌ 삭제
│   ├── chat.ts            ❌ 삭제
│   ├── sim.ts             ❌ 삭제
│   ├── hazard.ts          ✅ 신규
│   ├── game.ts            ✅ 신규
│   ├── guide.ts           ✅ 신규
│   ├── report.ts          ✅ 신규
│   └── index.ts           (유지)
├── core/
│   ├── grid/              (유지)
│   ├── graph/             (유지 — 전량)
│   ├── rules/             (유지 — 전량)
│   ├── chat/              ❌ 디렉터리 전체 삭제
│   ├── sim/               ❌ 삭제 → hazard/ 로 대체
│   ├── hazard/            ✅ 신규
│   │   ├── field.ts           틱 루프 (재난 무관)
│   │   ├── ignition.ts        발화점 추첨 + 플레이 가능성 보장
│   │   ├── transfer.ts        확산 감쇠 계수
│   │   └── rules/             특수 규칙 훅
│   │       ├── smokeDescends.ts
│   │       ├── doorHeatCheck.ts
│   │       ├── elevatorLocked.ts
│   │       └── index.ts        // 확장 시 여기에 등록
│   ├── game/              ✅ 신규
│   │   ├── loop.ts            게임 진행
│   │   ├── player.ts          이동·자세·노출
│   │   └── playlog.ts         이벤트 수집
│   ├── report/            ✅ 신규
│   │   ├── build.ts           정적+동적 통합
│   │   └── verdicts.ts        동적 판정표 (§5.3)
│   └── guide/             ✅ 신규
│       └── runner.ts          트리거 매칭 + 쿨다운
├── content/
│   ├── concepts.json      ❌ 삭제
│   ├── emergency.json     ❌ 삭제
│   ├── knowledge/         ❌ 삭제
│   ├── guide/             ✅ 신규
│   │   ├── rules.json         GuideRule 목록
│   │   └── cards.json         GuideCard 목록
│   ├── hazards/           ✅ 신규
│   │   └── fire.json          기본판. 확장 시 gas/flood/earthquake 추가
│   ├── reportItems.json   ✅ 신규 (동적 판정 문장)
│   ├── ruleMessages.json  (유지)
│   ├── blocks.json        (유지)
│   ├── bannedPhrases.json (유지)
│   ├── sources.json       (유지)
│   ├── templates/         (유지)
│   └── validate.ts        (검사 항목 변경 §8.3)
└── ui/
    ├── editor/            (대폭 강화 — FR-7.*)
    ├── canvas/            ✅ 신규 — 에디터·게임·인쇄 공용 SVG 렌더러
    ├── game/              ✅ 신규 (v1.0 sim3d/ 대체)
    ├── guide/             ✅ 신규 (v1.0 chat/ 대체, 규모 1/5)
    ├── report/            ✅ 신규
    ├── print/             (유지)
    └── common/            (유지)
```

**`ui/canvas/`를 신설하는 것이 이번 아키텍처 변경의 핵심이다.** 에디터·게임·인쇄가 하나의 SVG 렌더러를 `mode` prop으로 공유한다.

```tsx
<PlanCanvas
  plan={plan}
  mode="edit" | "game" | "print"
  field={gameState?.field}          // game 모드에서만
  route={routes.primary}
  highlight={guide?.highlight}
/>
```

### 8.3 콘텐츠 검증 게이트 변경 (v1.0 §3.6)

```
❌ 제거: 개념 표면형 중복 검사, followUpCards 링크 검사
✅ 추가: - 모든 GuideRule.sourceIds 유효성
        - 모든 GuideCard.sourceIds 유효성
        - GuideRule.cardId 가 존재하는 카드를 가리키는가
        - ReportItem.cardId 가 존재하는 카드를 가리키는가
        - GuideRule.trigger 의 ruleId 가 존재하는 RuleDef 를 가리키는가
        - HazardPreset.specialRules 가 등록된 훅 이름인가
        - HazardPreset.scenarioKeys 가 유효한 ScenarioKey 인가
        - RuleMessages 에 reportHeadline 이 존재하는가 (§5.3)
(유지) TODO-VERIFY 검사, 금지 표현 검사, easy/normal 양쪽 존재 검사
```

### 8.4 `CLAUDE.md` 변경 (v1.0 부록 B)

```diff
 ## 절대 규칙
 1. 런타임에 생성형 AI를 호출하지 않는다.
 2. src/core/** 에서 react, zustand, document, window 를 import 하지 않는다.
-   (three 언급 삭제)
 3. 모든 안전 콘텐츠에 sourceIds 가 있어야 한다.
 ...
+7. 3D를 만들지 않는다. 모든 그래픽은 SVG다.
+8. 챗봇·자유 텍스트 입력·검색 기능을 만들지 않는다.
+   캐릭터 대사는 트리거 기반 정적 데이터다.
+9. 위험장 엔진에 재난 종류를 하드코딩하지 않는다.
+   'fire' 문자열이 core/hazard/field.ts 에 등장하면 안 된다.
+10. 그리기 편의성(FR-7.*)이 다른 모든 기능보다 우선한다.
+    조작을 늘리는 방향의 구현은 거부하고 대안을 제안한다.

 ## 절대 규칙 6
-6. 런타임 의존성을 추가하지 않는다. 단일 파일 크기 제약이 있다(8MB).
+6. 런타임 의존성을 추가하지 않는다. 단일 파일 크기 제약이 있다(4MB).
```

---

## 9. 마일스톤 재편

### 9.1 기본판 (이번 개발 범위)

| 마일스톤 | v1.0 대비 | 내용 |
|---|---|---|
| **M0** 셋업 | 축소 | Vite+React+TS+Zustand. **Three.js 없음.** 단일 파일 빌드 검증 |
| **M1** 에디터 + **그리기 편의** | **대폭 강화** | 데이터 모델, `ui/canvas/`, FR-7.1~7.12 전량, localStorage 자동저장 |
| **M2** 그래프 + 구조 규칙 | 변경 없음 | `core/graph/` 전량, 경로 불필요 규칙 |
| **M3** 경로 작도 + 경로 규칙 | 축소 | **주/보조 2줄**로 단순화. 탭 5개 → 없음 |
| **M4** 위험장 엔진 + 화재 게임 | **신규** | `core/hazard/`, `core/game/`, `ui/game/` |
| **M5** 결과 리포트 + 재도전 | **신규** | `core/report/`, `ui/report/` |
| **M6** 캐릭터 가이드 + 온보딩 | 대체 | `core/guide/`, `ui/guide/`. v1.0 M3(챗봇)의 1/5 규모 |
| **M7** 인쇄 + 저장/불러오기 | 변경 없음 | |
| **M8** 통합 · 아동 시험 사용 | 변경 없음 | |
| **M9** 콘텐츠 + 검수 | 축소 | 개념사전·응급표현 불필요. **분량 약 40% 감소** |
| **M10** 최적화 · 접근성 · QA | 축소 | 3D 성능 항목 삭제 |

### 9.2 확장판 (2차)

| 마일스톤 | 내용 | 예상 규모 |
|---|---|---|
| **E1** 가스 | `gas.json` + `sparkIgnition`, `ventilation`, `valveShutoff` | 전체의 약 10% |
| **E2** 침수 | `flood.json` + `waterPressureDoor`, `slowMovement`, `electricShock` | 약 12% |
| **E3** 지진 | `earthquake.json` + `phase` 시스템, `fallingObjects`, `aftershock` | 약 20% (구조 상이) |

### 9.3 변경되는 DoD

**M0 (셋업)** — v1.0 DoD에서 아래를 교체한다.

- [ ] ~~Three.js 큐브가 렌더되고~~ → **SVG 격자가 렌더되고** 인라인 PNG가 표시됨
- [ ] `package.json`에 `three`가 **없다**
- [ ] 나머지 항목은 v1.0 그대로

**M1 (그리기 편의) — 가장 중요한 DoD**

> **C-3 대응**: M1에는 게임도 캐릭터도 없다. 온보딩 조작 수 측정은 **평면도 완성까지**로 한정하고, `[대피 연습 시작!]` 버튼은 스텁이다. 온보딩 전체 흐름의 5회 조작 검증은 **M6 DoD**에서 한다. FR-7.10("이제 뭘 해야 해?")도 M1에서는 **정적 텍스트 힌트**로 구현하고, 캐릭터 연동은 M6다.

- [ ] 템플릿 선택 → 평면도 완성까지 **20회 조작 이내** (§2.1)
- [ ] **초등 3학년 1명 이상이 5분 이내에 완성** — 실제 시험 사용으로 확인
- [ ] 팔레트 클릭 → 캔버스 클릭으로 배치 완료 (드래그 불필요, FR-7.1)
- [ ] 두 방을 맞대면 문 후보가 자동 표시되고 클릭 1회로 배치 (FR-7.3)
- [ ] 겹치는 배치 시도가 차단됨 (FR-7.6)
- [ ] 조작 카운터·타이머가 개발 모드에서 표시됨 (FR-7.11)
- [ ] "이제 뭘 해야 해?"가 정적 텍스트로라도 항상 유효한 다음 단계를 반환
- [ ] 저장 후 새로고침 복원

> **이 DoD를 통과하지 못하면 M2로 넘어가지 않는다.** 지도교수 의견 1번이 최우선이며, 그리기가 불편하면 뒤의 게임·리포트가 아무리 좋아도 아이에게 도달하지 못한다.

**M4 (화재 게임)**

- [ ] `core/hazard/field.ts` 에 `'fire'` 문자열이 **등장하지 않는다** (FR-8.16 검증)
- [ ] 프리셋 JSON의 `primarySpread`를 바꾸면 확산 속도가 실제로 변한다
- [ ] 연기가 화염보다 명확히 빠르게 확산 (단위 테스트로 검증)
- [ ] 닫힌 문이 확산을 눈에 띄게 지연
- [ ] **랜덤 발화 100회 시행에서 "시작 즉시 생존 불가" 판이 0건** (FR-8.7)
- [ ] 같은 seed로 동일한 판이 재현됨 (FR-8.15)
- [ ] 연습 모드가 기본값 (FR-8.2)
- [ ] 픽스처 5종에서 게임이 정상 진행

**M5 (결과 리포트)**

- [ ] **실패한 플레이에서도 잘한 점이 반드시 1개 이상 표시** (FR-10.3 — 전 실패 유형에 대한 테스트)
- [ ] 고칠 점이 3개를 넘지 않음 (FR-10.4)
- [ ] 잘한 점이 고칠 점보다 먼저 렌더됨 (FR-10.5)
- [ ] `[왜?]` 확장 시 화면 전환 없음
- [ ] "지도 고치기"가 지적 대상이 강조된 에디터로 진입
- [ ] 점수·등급·순위 UI가 존재하지 않음 (FR-10.10)

**M6 (캐릭터 가이드)**

- [ ] 자유 텍스트 입력 UI가 **존재하지 않음** (의견 3 검증)
- [ ] 같은 대사가 쿨다운 내 반복되지 않음
- [ ] "이제 뭘 해야 해?"가 모든 화면에서 유효한 다음 단계를 반환 (P3 전수 테스트)
- [ ] 할 말이 없을 때 캐릭터가 침묵함
- [ ] 게임 중 캐릭터가 좌우 반전만으로 이동 표현 (스프라이트 2장 이내, §4.5)
- [ ] **온보딩 5회 조작으로 게임 시작 가능 상태 도달** (§2.5 — M1에서 이월된 항목)
- [ ] 초등 3학년 1명 이상이 온보딩+평면도를 **5분 이내** 완성 (§2.1, NFR-12)

---

## 10. 리스크 재평가

| ID | 리스크 | v1.0 | v1.1 | 비고 |
|---|---|---|---|---|
| R1 | 평면도 그리기 난이도 | 높음 | **높음(유지)** | 최우선 과제로 격상. §2 전체가 대응책 |
| R2 | 캐릭터 사용 허가 | 중간 | **상승** | 게임 플레이어로도 쓰므로 필요 에셋이 늘었다. §4.5가 최소화 설계 |
| R3 | 단일 파일 크기 | 중간 | **하락** | Three.js 제거로 여유. 목표 8MB → 4MB |
| R4 | 콘텐츠 검수 지연 | 중간 | **하락** | 분량 40% 감소 |
| R5 | 저사양 3D 성능 | 높음 | **소멸** | — |
| R6 | 1인 개발 범위 초과 | 높음 | **하락** | 3D 제거 + 확장판 분리 |
| R7 | 지침 법령 개정 | 낮음 | 낮음(유지) | |
| **R8** | **시간제한이 아동 불안을 유발** | — | **신규 · 중간** | FR-8.1~8.6이 대응. 특히 연습 모드 기본값(FR-8.2) |
| **R9** | **랜덤 발화가 이길 수 없는 판을 만듦** | — | **신규 · 높음** | FR-8.7 플레이 가능성 보장. M4 DoD에서 100회 시행 검증 |
| **R10** | **게임이 재미없으면 반복하지 않음** | — | **신규 · 중간** | 재도전 루프(§5.4)와 랜덤성이 대응. M8 아동 시험 사용에서 확인 |

### 10.1 배포 가능 최소 구성

```
M0 → M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M9 → M10
                                                    └─ 여기까지가 기본판 배포
확장: E1(가스) → E2(침수) → E3(지진)
```

**v1.0과 달리 중간 절단 지점이 없다.** 게임(M4)과 리포트(M5)가 지도교수 의견의 핵심이므로 생략할 수 없고, 가이드(M6) 없이는 아이가 혼자 진행할 수 없기 때문이다. 다만 **전체 규모가 v1.0보다 작아졌으므로** 이는 문제가 되지 않는다.

---

## 11. 확인이 필요한 사항

### 11.1 지도교수 확인

| ID | 사항 | 배경 |
|---|---|---|
| **O-8** | **경로 작도를 화재 시나리오 2탭에서 주/보조 2줄로 단순화하는 것**을 승인하는가? | 게임이 "현관 막힘" 상황을 실제로 만들어주므로 아이가 상상해서 두 번 그릴 필요가 없다. 쟁점 1(그리기 편의)에도 유리하다 (§3.2) |
| **O-9** | **연습 모드(시간 무제한)를 기본값으로 하는 것**을 승인하는가? | 의견 2는 "시간제한"이었으나, 초등 저학년에게 첫 플레이부터 카운트다운은 학습이 아니라 불안을 만든다. 시간제한은 "도전 모드"로 제공한다 (§3.7, FR-8.2) |
| **O-10** | 게임 플레이어 캐릭터를 **아이가 고르게** 할 것인가, **1종 고정**인가? | 고정하면 필요 에셋이 2장, 선택제면 6장이다 (§4.5) |
| **O-11** | 지식 콘텐츠를 **결과 리포트 학습 카드로만** 제공해도 충분한가? 별도 "배우기" 메뉴가 필요한가? | 챗봇이 담당하던 지식 전달 경로가 리포트로 좁아졌다 |
| **O-12** | 확장판(가스·침수·지진)의 **개발 시점과 범위** | 기본판 배포 후 2차인지, 논문·과제 일정상 함께 필요한지 |

### 11.2 소방청 확인 (v1.0 O-1 갱신)

| ID | 사항 |
|---|---|
| **O-1a** | 캐릭터 이미지 사용 허가 및 제공 형식 (해상도, 배경 투명 여부) |
| **O-1b** | **캐릭터의 웅크린 자세·측면 등 변형 제작이 가능한가**, 아니면 제공된 이미지 그대로만 사용해야 하는가 |
| **O-1c** | 캐릭터를 게임 플레이어로 사용하는 것에 대한 별도 조건이 있는가 |
| **O-2** | 화재 대피 지침 1차 출처 확정 (v1.0 §6.1 재확인 — **여전히 미해결**) |

### 11.3 v1.0에서 이월되는 미결 사항

O-3(배포 채널), O-4(개인정보 영향평가), O-5(접근성 인증), O-7(공용부 레이어 필수화) — 변경 없이 유효하다.
**O-6(지진·침수·가스 3D 시뮬레이션 포함 여부)은 O-12로 대체되어 종료한다.**

---

## 12. 요약

```
지도교수 의견 4건 → 프로젝트가 더 단순해지고 실현 가능성이 올라갔다.

  ❌ 삭제:  챗봇 대화 엔진, 3D 렌더링          (코드량 큰 폭 감소)
  ✅ 유지:  평면도·그래프·검증 규칙 엔진        (v1.0의 핵심 자산 그대로)
  🔄 전환:  챗봇 → 캐릭터 트리거 가이드
           3D 시뮬 → 2D 게임 (SVG 공용 렌더러)
  🆕 신규:  그리기 편의성 요구사항 12건 (최우선)
           위험장 엔진 (화재 기본 + 3종 확장 가능)
           결과 리포트 (잘한 점 / 고칠 점) + 재도전 루프

가장 중요한 세 가지:
  1. M1 DoD — 초등 3학년이 5분 안에 그릴 수 있는가. 통과 못 하면 진행 금지
  2. FR-8.7 — 랜덤 발화가 이길 수 없는 판을 만들지 않도록 보장
  3. FR-10.3 — 실패해도 잘한 점이 반드시 하나는 있어야 한다
```

**문서 끝.**