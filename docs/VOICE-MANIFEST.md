# 앱 전체 음성 매니페스트 설계

## 결론

앱이 실제로 읽는 문장은 핵심 MP3 여덟 개만이 아니다. 캐릭터 말풍선은
`src/content/guide/rules.json`의 규칙 84개를 이용 수준에 따라 쉬움 또는 보통 문장으로 읽는다.
따라서 논리적인 전체 대상은 **가이드 168개와 핵심 8개, 합계 176개·5,307자**다.

다만 가이드 네 문장은 `{roomName}` 또는 `{facility}`가 실행 중에 정해진다. 화면은 실제 이름을
보여 주고, 음성은 뜻이 같은 일반화 문장으로 만든다. ElevenLabs 생성 대상은 **가이드 168개와
핵심 8개, 합계 176개·5,277자**다.

기계가 읽는 전체 목록과 파일명은 `public/voice/manifest.json`에 있다. 다음 명령으로 정본에서
언제든 다시 만든다.

```powershell
py tools/elevenlabs_automation.py --export-project-manifest public/voice/manifest.json
```

## 실제 소비 지점

| 대상 | 호출 지점 | 논리 문장 | 정적 MP3 |
|---|---|---:|---:|
| 캐릭터 말풍선 | `GuideBubble.tsx`의 `speak(toTts(bubble.text))` | 84규칙 × 2수준 = 168 | 168 |
| 핵심 게임 안내 | `GameView.tsx`, `sound.ts`의 `playVoice` | 8 | 8 |
| 학습 카드 본문 | 화면에서만 읽는 참고 글 | 0 | 0 |
| 결과 리포트 문장 | 현재 자동 음성 호출 없음 | 0 | 0 |
| 합계 |  | 176 | 176 |

`VOICE-SCRIPT.md`에 학습 카드와 결과 문장이 정리되어 있어도 현재 앱이 자동으로 읽는 대상은
아니다. 실제 호출이 없는 문장까지 합성하면 크레딧과 파일 용량만 늘어난다.

## 파일명

- 가이드: `guide-{규칙-id}-{easy|normal}.mp3`
- 핵심: 기존 이름 `v-start.mp3`부터 `v-meeting.mp3`까지 유지한다.
- 규칙 id는 영문 소문자와 하이픈으로 정규화한다.
- 매니페스트 생성기는 중복 파일명이 있으면 즉시 실패한다.

예:

```text
guide-step-template-easy.mp3
guide-step-template-normal.mp3
guide-game-doorhot-easy.mp3
v-start.mp3
```

## 동적 문장

다음 네 변형은 이용자가 정한 방 이름 또는 실제 피난설비 이름이 들어가므로 정적 파일을 만들지
않는다.

| 규칙 | 수준 | 치환값 | 처리 |
|---|---|---|---|
| `fail.RULE-C-03` | 쉬움·보통 | `roomName` | 문이 없는 방이라는 일반 문장 MP3 |
| `pass.RULE-F-05` | 쉬움·보통 | `facility` | 피난설비로 가는 일반 문장 MP3 |

방 이름은 이용자가 바꿀 수 있어 가능한 조합을 미리 녹음할 수 없다. 문장을 앞뒤 조각으로 나눠
이어 붙이면 억양과 조사가 부자연스러우므로 쓰지 않고, 화면의 개인화는 유지하면서 음성만
자연스러운 일반 문장으로 만든다.

## 4MB 제한과 재생 전략

전체 5,307자를 한국어 약 4~6자/초로 읽으면 약 15~22분이다. MP3 128kbps는 대략
14~21MB이고 data URI로 넣으면 약 19~28MB가 된다. 현재 단일 HTML 자체가 약 2.6MB이므로
176개를 직접 내장하면 4MB 상한을 크게 넘는다. 48kbps로 줄여도 전체 원본이 약 5~8MB라
직접 내장은 불가능하다.

따라서 재생은 다음처럼 나눈다.

1. 웹 배포본은 가이드 정적 MP3 168개를 배포 자산으로 두고, 현재 수준과 규칙 id에 맞는 파일을
   먼저 재생한다.
2. 단일 HTML 오프라인 배포본은 핵심 8개만 지금처럼 data URI로 내장한다.
3. 가이드 파일이 없거나 재생이 실패하거나 오프라인 단일 HTML이면 기존 브라우저 TTS로 즉시
   대체한다.
4. 동적 네 변형은 화면에서만 이름을 치환하고 일반화된 MP3를 읽는다.
5. 소리 끔은 MP3와 브라우저 TTS를 모두 즉시 멈추는 현재 단일 기준을 유지한다.

이 구조는 웹에서 `Juwonmom` 음성을 충분히 제공하면서 USB용 단일 HTML의 4MB와 외부 참조 0건을
지킨다. 웹 자산이 없어도 글과 브라우저 TTS가 남으므로 교육 기능이 막히지 않는다.

## 생성 순서

전체 176개를 한 번에 생성하면 중간 실패 뒤 중복 크레딧을 쓰기 쉽다. 매니페스트 순서를 유지하되
다음 묶음으로 나눈다.

1. 핵심 8개를 먼저 만들어 발음·속도·음색을 검수한다.
2. `stepEnter`, `helpRequested`를 만든다.
3. `gameStart`, `gameEvent`, `gameEnd`를 만든다.
4. `blockPlaced`를 만든다.
5. `ruleFail`, `rulePass`, `idle`을 만든다.
6. 각 묶음 뒤 파일 수, MP3 헤더, 1KB 이상, 같은 화자 여부를 확인한다.

전체 생성 명령은 일반화된 네 문장을 포함한 176개 항목을 순서대로 읽는다.

```powershell
py tools/elevenlabs_automation.py --cdp-url http://127.0.0.1:9334 --generate --voice Juwonmom --speed 1.0 --download-dir public/voice --skip-existing --limit 25 --input-file public/voice/manifest.json --input-format json
```

실제 실행 전에는 항목 수 176개와 총 생성 글자 5,277자를 다시 보여 주고 명시 확인을 받는다.
