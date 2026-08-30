# ElevenLabs 웹 TTS Playwright 자동화

`tools/elevenlabs_automation.py`는 ElevenLabs Text to Speech 입력창에 한 문장 또는 여러 대사를
차례로 넣는 Python 도구다. 계정 비밀번호를 받거나 현재 열려 있는 Chrome에 붙지 않는다. 별도의
Playwright 브라우저 프로필을 열고, 이용자가 그 창에서 직접 로그인한다.

기본 실행은 첫 대사를 입력한 뒤 멈추며 **Generate 단추를 누르지 않는다**. 크레딧을 쓰는 생성은
`--generate`와 터미널 확인 문구가 모두 있어야 시작된다. `--voice`를 지정하면 계정에서 그 이름의
목소리를 선택하고, `--download-dir`을 함께 지정하면 생성 직후 각 MP3를 정해진 이름으로 저장한다.

## 1. 설치

Windows PowerShell에서 Python 3.10 이상을 확인하고 Playwright와 전용 Chromium을 설치한다.

```powershell
py --version
py -m pip install --upgrade playwright
py -m playwright install chromium
```

macOS 또는 Linux에서는 `py` 대신 `python3`를 쓴다.

```bash
python3 -m pip install --upgrade playwright
python3 -m playwright install chromium
```

Linux에서 Chromium의 시스템 라이브러리까지 설치해야 한다면 다음 명령을 쓴다. 배포판에 따라
관리자 암호가 필요할 수 있다.

```bash
python3 -m playwright install --with-deps chromium
```

설치한 일반 Chrome을 쓰려면 실행 명령에 `--channel chrome`을 더할 수 있다. 이때도 현재 Chrome
창이나 개인 Chrome 프로필에 연결하지 않고 자동화 전용 프로필을 사용한다.

## 2. 최초 로그인과 프로필 재사용

다음 명령을 실행하면 자동화 전용 브라우저가 열린다.

```powershell
py tools/elevenlabs_automation.py --login
```

1. 열린 창에서 ElevenLabs에 직접 로그인한다. 비밀번호나 인증 코드를 터미널에 입력하지 않는다.
2. Text to Speech 화면이 보이면 터미널로 돌아와 Enter를 누른다.
3. 다음 실행부터 같은 프로필의 로그인이 재사용된다.

Windows의 기본 프로필 경로는
`%LOCALAPPDATA%\ElevenLabsPlaywright\browser-profile`이다. macOS와 Linux에서는 사용자 상태
폴더 아래에 저장된다. `--profile-dir`로 다른 경로를 지정할 수 있지만 저장소 안 경로는 스크립트가
거부한다. 프로필에는 로그인 쿠키가 있으므로 공유하거나 저장소에 복사하지 않는다.

## 3. 안전 모드로 한 문장 확인

다음 명령은 대사를 입력하기만 하고 Generate를 누르지 않는다. 열린 창에서 목소리, 모델, 설정과
입력문을 눈으로 확인한 뒤 터미널에서 Enter를 누르면 닫힌다.

```powershell
py tools/elevenlabs_automation.py --text "불이 났어! 침착하게 밖으로 나가자."
```

`--dry-run`을 명시해도 같은 안전 동작이다.

```powershell
py tools/elevenlabs_automation.py --dry-run --text "연기가 오면 몸을 낮추자."
```

## 4. 여러 항목 파일

UTF-8 텍스트 파일은 빈 줄을 제외한 한 줄을 한 항목으로 읽는다.

```powershell
py tools/elevenlabs_automation.py --input-file .\scripts.txt
```

여러 줄로 된 대사를 빈 줄 단위로 나누려면 `--input-format blocks`를 쓴다. JSON은 문자열 배열,
`{"name": ..., "text": ...}` 객체 배열, `items` 배열, 또는 `파일명: 대사` 객체를 지원한다.

```json
{
  "items": [
    {"name": "v-start.mp3", "text": "불이 났어! 침착하게 밖으로 나가자."},
    {"name": "v-crouch.mp3", "text": "연기가 오면 몸을 낮추고, 코와 입을 가리자."}
  ]
}
```

```powershell
py tools/elevenlabs_automation.py --input-file .\scripts.json
```

프로젝트의 MP3 여덟 문장은 `VOICE-SCRIPT.md`의 §4.3에서 이름과 대사를 자동으로 읽는다.

```powershell
py tools/elevenlabs_automation.py --input-file .\VOICE-SCRIPT.md --input-format voice-script
```

안전 모드에서는 여러 항목 중 첫 항목만 입력한다.

## 5. 실제 생성

먼저 안전 모드로 목소리와 모델, 대사를 확인한다. 이후 다음 명령을 실행한다.

```powershell
py tools/elevenlabs_automation.py --generate --voice Juwonmom --speed 1.0 --download-dir .\public\voice --input-file .\VOICE-SCRIPT.md --input-format voice-script
```

스크립트는 생성할 항목 수와 전체 글자 수를 보여 준 뒤 `GENERATE 8`처럼 정확한 확인 문구를
요구한다. 일치해야 각 대사를 입력하고 Generate를 누른다. 생성은 ElevenLabs 크레딧을 사용하며
계정 History를 변경한다. 각 결과는 `public/voice/`에 `v-start.mp3`부터 `v-meeting.mp3`까지
저장된다. 같은 이름의 파일이 있으면 안전하게 멈추며, 검수 후 교체할 때만 `--overwrite`를 더한다.
오류가 나면 History와 출력 폴더에서 실제 생성 건수를 확인한 뒤 재시도한다.

전체 176개처럼 긴 작업은 한 번에 실행하지 않고 25개씩 나눈다. 유효한 기존 MP3는 생성 전에
검사해 건너뛰므로 중간에 멈춰도 같은 대사에 크레딧을 다시 쓰지 않는다.

```powershell
py tools/elevenlabs_automation.py --cdp-url http://127.0.0.1:9334 --generate --yes --voice Juwonmom --speed 1.0 --download-dir .\public\voice --skip-existing --overwrite --limit 25 --input-file .\public\voice\manifest.json --input-format json
```

같은 명령을 반복하면 아직 없는 다음 25개가 이어진다. `--overwrite`는 헤더가 잘못된 기존 파일만
교체하고, `--skip-existing` 검사를 통과한 파일은 그대로 보존한다.

속도나 목소리를 바꿔 전체를 처음부터 다시 만들 때는 `--skip-existing`을 빼고 0, 25, 50처럼
`--offset`을 올린다. 다음은 26번째부터 50번째 항목을 확실히 덮어쓴다.

```powershell
py tools/elevenlabs_automation.py --cdp-url http://127.0.0.1:9334 --generate --yes --voice Juwonmom --speed 1.0 --download-dir .\public\voice --overwrite --offset 25 --limit 25 --input-file .\public\voice\manifest.json --input-format json
```

무인 실행이 꼭 필요하고 전체 크레딧 사용을 이미 승인했다면 다음처럼 `--yes`를 명시한다.

```powershell
py tools/elevenlabs_automation.py --generate --yes --headless --no-wait --voice Juwonmom --speed 1.0 --download-dir .\public\voice --input-file .\scripts.json
```

`--yes`는 `--generate` 없이 쓸 수 없다. 로그인은 화면이 필요한 `--login`으로 먼저 끝내야 한다.

자동 저장된 음원은 ElevenLabs History와 로컬 파일에서 직접 듣고 `VOICE-SCRIPT.md` §4의 기준으로
검수한다. 다운로드 메뉴가 있는 UI에서는 MP3 128kbps를 고르며, 바로 내려받는 UI에서는 제공되는
기본 MP3를 저장한다. 저장 파일은 1KB 이상이고 MP3 헤더가 있는지도 자동으로 확인한다.

## 6. UI 변경과 오류 진단

스크립트는 접근성 role, label, placeholder를 먼저 찾고 마지막에만 일반 `textarea`와
`contenteditable`을 찾는다. 기본 화면 요소 대기는 30초, 한 대사 생성 대기는 180초다.

```powershell
py tools/elevenlabs_automation.py --timeout-ms 60000 --generation-timeout-ms 300000 --text "확인 대사"
```

실패하면 화면 PNG, HTML, 오류 문장이 저장소 밖의 다음 폴더 아래에 저장된다.

```text
%LOCALAPPDATA%\ElevenLabsPlaywright\diagnostics\날짜-시간\
```

화면과 HTML에는 계정 정보나 입력 대사가 보일 수 있다. 문제를 해결한 뒤 진단 폴더를 지우고,
공유하거나 커밋하지 않는다. `--diagnostics-dir`도 저장소 안 경로는 거부된다.

화면 요소가 바뀌어 자동화가 실패하면 진단 화면으로 실제 접근성 이름을 확인한 뒤
`EDITOR_NAME`, `GENERATE_NAME`의 범위를 최소한으로 보완한다. 대사를 포함한 CSS 선택자나 계정별
내부 식별자를 하드코딩하지 않는다.

## 7. 크레딧을 쓰지 않는 로컬 검사

다음 세 명령은 ElevenLabs에 접속하거나 음성을 생성하지 않는다.

```powershell
py tools/elevenlabs_automation.py --help
py -m py_compile tools/elevenlabs_automation.py
py tools/elevenlabs_automation.py --self-test
```

자체 검사는 JSON, VOICE-SCRIPT 파서, 공백 정규화, 비밀 경로 분리를 확인한다.
