# 그리기 도면에서 

## 가구배치할때, 동서남북 방향전환, 크기변경도 가능하게 해주시고, 가구를 배치할때, 마우스포인터 그림을 해당 그림(해당 모양의 마우스 포인터)으로 바꾸도록 해주세요.

## 좌표점들이 너무 커요. 좀더 작게하시고 좀더 흐리게 하시고, 점들의 밀도 기본값을 좀더 높혀주세요. 점개수를 증가/감소 시키는 것보다 모눈종이에  모눈종이를 확대 축소하게 해서 모눈종이 점들을 잇게 하는게 어떤지요?(판단해서 결정하세요. 점으로 할꺼면 점 색상/크기 조절-색상 연하게, 크기 더 작게)

## 내자리 위치 놓을때로 마우스포인터를 내자리 모양의 마우스포인터 모양으로 변경

## 대피경로 그리기 할때, 벽 외의 뚤려있는 곳은 지나갈 수 있도록 하세요.(문은 당연히 열고 지나감) : 아주 중요

## 화재가 발생하는 곳은 가급적이면 화장실은 제외하고 램덤으로 위치하되, 가연물/전기를 사용하는 곳(주로 주방, 방)에서 주로 화재발생지점을 해주시고 천천히 화재가 확대되어 가도록 해주세요. 연기도 표현해 주시면 더욱 좋구요. : 3D 시뮬레이션도 그렇게 나오게 해주세요.

## 집밖으로 탈출해서 가족과 만나면 화려한 효과(예시, 축포)로 성공했다는 멋진 이미지 표현와 음향효과를 애니메이션(모션그래픽)으로 표현해주어서 감동받을 수 있도록 해주세요.


## 그 밖에 개선사항이 필요한지 검토해 보시고, 질문 있으면 질문하세요.

## 이 문장은 읽지 마세요 : $env:NODE\_TLS\_REJECT\_UNAUTHORIZED = "0"

# 임시 폴더에서 한 작업 (대장 #136 ~ #145)

G 드라이브가 쓰기를 거부해(읽기만 됨) 아래 임시 폴더에 저장소를 복제해 작업했다. 커밋·푸시·배포는 하지 않았다.

- 임시 폴더: `C:\Users\User\AppData\Local\Temp\claude\e4eb0796aebdf51b\38354584-4a6d-45c5-a690-c415d53bd31b\scratchpad\repo`
- 기준 커밋: `28ddda9` (origin/main 과 같은 판)
- 쓸 수 있는 저장소 사본은 `D:\Google_Drives\DEV\119-Map-Your-Evacuation-Route` 에 있다(VS Code 저장이 실제로 되는 곳). G 드라이브는 지금 쓰기가 막혀 있다.
- 임시 폴더에서 저장소의 같은 자리로 복사할 파일 31개:
  - `inst.md` (이 파일)
  - `CHANGELOG.md`
  - `package.json`
  - `docs\REQUESTS.md`
  - `V2\package.json`
  - `V2\README.md`
  - `V2\docs\DESIGN.md`
  - `V2\src\content\bands.ts`
  - `V2\src\content\fire.ts`
  - `V2\src\core\auto.ts`
  - `V2\src\core\drill.ts`
  - `V2\src\core\edit.ts`
  - `V2\src\core\furnish.ts`
  - `V2\src\core\grid.ts`
  - `V2\src\core\items.ts`
  - `V2\src\core\path.ts`
  - `V2\src\core\types.ts`
  - `V2\src\platform\host.ts`
  - `V2\src\store\app.ts`
  - `V2\src\ui\Celebration.tsx` (새 파일)
  - `V2\src\ui\CursorGhost.tsx` (새 파일)
  - `V2\src\ui\DrillStep.tsx`
  - `V2\src\ui\Layers.tsx`
  - `V2\src\ui\PlanView.tsx`
  - `V2\src\ui\WelcomeScene.tsx`
  - `V2\src\ui\app.css`
  - `V2\src\ui\handUnit.ts`
  - `V2\src\ui\replay3d\Replay3D.tsx`
  - `V2\src\ui\steps.tsx`
  - `V2\tools\logic-tests.ts`
  - `V2\tools\smoke.ts`
- `node_modules` · `dist` · `out` · `.next` · `.shots` · `.offline-build` · `offline` 같은 산출물과 `.git` 은 복사하지 않는다.
- `V2\VOICE-SCRIPT.md` 와 `V2\public\voice\manifest.json` 은 줄바꿈만 달라 보이는 것이라 복사하지 않는다. 소리 내어 읽는 대사는 바꾸지 않아 새 MP3 는 없다.
