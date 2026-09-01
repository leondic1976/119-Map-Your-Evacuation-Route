# v1.12 변경 설계 — 최신 Juwonmom MP3 단일 재생

## 1. 문제와 원인

최신 캐릭터 가이드 MP3 168개가 있어도 3D 대피연습의 `GameView`가 예전 핵심 대사 8개를 별도로
호출했고, MP3 파일을 못 읽으면 `sound.ts`가 브라우저 `speechSynthesis`로 대체했다. 이 두 경로
때문에 최신 말풍선과 다른 예전 멘트 또는 PC 기계음이 들렸다.

## 2. 재생 규칙

1. 실제 발화는 `rules.json`의 84규칙 × 쉬움·보통, 총 168개뿐이다.
2. 한 가이드 이벤트는 `guide-{ruleId}-{easy|normal}.mp3` 하나만 재생한다.
3. `GameView`는 `v-start`, `v-crouch`, `v-close`, `v-success`를 따로 호출하지 않는다.
4. MP3가 없거나 재생이 막혀도 브라우저 음성합성으로 바꾸지 않는다. 글만 남기고 조용히 멈춘다.
5. `src/content/voice.ts`의 핵심 8개는 호환·제작 기록으로만 보관하며 런타임에서 호출하지 않는다.
6. 소리 끔은 현재 MP3와 효과음뿐 아니라 이전 버전에서 브라우저 큐에 남은 음성도 취소한다.

## 3. 웹·오프라인 배포

- 웹은 `public/voice/`의 MP3를 배포 기준 경로와 함께 읽는다.
- 오프라인 빌드는 `public/voice/` 전체를 `dist/voice/`에 복사하고 HTML에서는 상대 경로로 읽는다.
- 교실용 배포 단위는 `dist/home-escape-map.html`과 `dist/voice/` 폴더다.
- MP3는 ElevenLabs `Juwonmom`, Speed 1.0 제작본이어야 한다.

## 4. 항상 최신으로 유지하는 검증

`npm run verify`는 다음 중 하나라도 어긋나면 실패한다.

- `VOICE-SCRIPT.md`, `rules.json`, `manifest.json`의 항목·문장·파일명이 다르다.
- MP3가 176개보다 적거나 많고, 1KB 미만이거나 MP3 프레임·ElevenLabs 제작 서명이 없다.
- 런타임 코드에 `SpeechSynthesisUtterance`, `speechSynthesis.speak`, 예전 `playVoice` 호출이 남아 있다.
- 오프라인 빌더가 전체 음성 폴더를 복사하지 않는다.
- Chromium에서 파일 다운로드·해독·`play()`·`playing` 이벤트가 실패한다.

실제 발화 문장이 바뀌었을 때만 매니페스트를 다시 내보내고 해당 MP3를 ElevenLabs에서 생성한다.
화면 문구만 바뀌었거나 기존 MP3가 정본과 일치하면 재생성하지 않는다.
