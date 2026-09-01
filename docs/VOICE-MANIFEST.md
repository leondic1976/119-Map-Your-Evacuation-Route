# 앱 전체 음성 매니페스트 설계

## 결론

앱이 실제로 읽는 문장은 `src/content/guide/rules.json`의 규칙 84개를 이용 수준에 따라 쉬움 또는
보통으로 바꾼 **가이드 168개**다. 이전 `GameView`가 별도로 호출하던 핵심 대사 8개는 같은 상황의
가이드와 겹치고 예전 멘트를 재생하므로 런타임 호출을 제거했다. 파일과 `VOICE_LINES`는 호환·제작
기록으로만 보관한다.

다만 가이드 네 문장은 `{roomName}` 또는 `{facility}`가 실행 중에 정해진다. 화면은 실제 이름을
보여 주고, 음성은 뜻이 같은 일반화 문장으로 만든다. 현재 실제 ElevenLabs 재생 대상은 **가이드
168개·5,079자**이며, 호환 보관 8개를 포함한 관리 파일은 **176개·5,277자**다.

기계가 읽는 전체 목록과 파일명은 `public/voice/manifest.json`에 있다. 다음 명령으로 정본에서
언제든 다시 만든다.

```powershell
py tools/elevenlabs_automation.py --export-project-manifest public/voice/manifest.json
```

## 실제 소비 지점

| 대상 | 호출 지점 | 논리 문장 | 정적 MP3 |
|---|---|---:|---:|
| 캐릭터 말풍선 | `GuideBubble.tsx`의 `playGuideVoice` | 84규칙 × 2수준 = 168 | 168 |
| 이전 핵심 게임 안내 | 호환·제작 기록만 보관, 런타임 호출 없음 | 0 | 8 |
| 학습 카드 본문 | 화면에서만 읽는 참고 글 | 0 | 0 |
| 결과 리포트 문장 | 현재 자동 음성 호출 없음 | 0 | 0 |
| 합계 |  | 168 | 176(호환 8 포함) |

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

전체 MP3를 data URI로 HTML에 직접 넣으면 4MB 상한을 크게 넘는다. 따라서 HTML과 음원을 같은
폴더 안의 별도 파일로 묶고, `file://`에서도 상대 경로로 읽는다.

따라서 재생은 다음처럼 나눈다.

1. 웹 배포본은 가이드 정적 MP3 168개를 배포 자산으로 두고, 현재 수준과 규칙 id에 맞는 파일만
   재생한다.
2. 오프라인 빌드는 `public/voice/` 전체를 `dist/voice/`에 복사한다. 배포할 때 HTML과 이 폴더를
   함께 옮긴다.
3. 파일이 없거나 재생에 실패해도 브라우저 TTS로 대체하지 않는다. 화면 글은 유지하고 음성만
   조용히 멈춘다.
4. 동적 네 변형은 화면에서만 이름을 치환하고 일반화된 MP3를 읽는다.
5. 소리 끔은 현재 MP3, 예약된 효과음, 이전 버전에서 브라우저에 남은 음성 큐까지 즉시 멈춘다.

이 구조는 웹과 오프라인 모두 `Juwonmom` 음색을 유지하면서 HTML 4MB와 외부 네트워크 참조 0건을
지킨다. 브라우저 기계음과 예전 중복 대사는 어떤 실패 경로에서도 나오지 않는다.

## 생성 순서

전체 176개를 한 번에 생성하면 중간 실패 뒤 중복 크레딧을 쓰기 쉽다. 매니페스트 순서를 유지하되
다음 묶음으로 나눈다.

1. 실제 발화인 `stepEnter`, `helpRequested`를 만든다.
2. `gameStart`, `gameEvent`, `gameEnd`를 만든다.
3. `blockPlaced`를 만든다.
4. `ruleFail`, `rulePass`, `idle`을 만든다.
5. 호환 보관 8개는 내용이 실제로 바뀌었을 때만 갱신한다.
6. 각 묶음 뒤 파일 수, ElevenLabs 제작 서명, MP3 헤더, 1KB 이상, 해독 가능 여부를 확인한다.

전체 생성 명령은 일반화된 네 문장을 포함한 176개 항목을 순서대로 읽는다.

```powershell
py tools/elevenlabs_automation.py --cdp-url http://127.0.0.1:9334 --generate --voice Juwonmom --speed 1.0 --download-dir public/voice --skip-existing --limit 25 --input-file public/voice/manifest.json --input-format json
```

실제 실행 전에는 항목 수 176개와 총 생성 글자 5,277자를 다시 보여 주고 명시 확인을 받는다.
