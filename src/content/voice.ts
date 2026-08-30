/**
 * 사람 목소리 — `VOICE-SCRIPT.md` §4.
 *
 * 브라우저 음성합성은 기계 소리라 어린이에게 친근하지 않고, 한국어 음성이 없는 기기에서는
 * 아예 나지 않는다. 아래 여덟 개만 사람(또는 어린이) 목소리로 넣어도 체감이 크게 달라진다.
 *
 * **여기 값은 비어 있는 것이 정상이다.** 음원을 넣는 방법은 이렇다.
 *
 *   1. mp3 여덟 개를 `content/voice/` 에 아래 파일 이름 그대로 둔다
 *      (48kbps 모노 22.05kHz, 한 파일 15KB 안팎, 합쳐 1MB 이내 — 단일 HTML 4MB 상한 때문이다)
 *   2. `npm run voice` 를 돌린다. 이 파일이 data URI 로 다시 쓰인다
 *   3. `npm run verify` 로 크기와 외부 참조 0건을 확인한다
 *
 * 파일로 두지 않고 data URI 로 굽는 이유는 오프라인 배포본이 외부 참조 0건이어야 하기
 * 때문이다 (NFR-1). 음원이 없으면 지금처럼 음성합성이 대신 읽고, 그것도 없으면 조용히 넘어간다.
 */

export type VoiceId =
  | 'v-start'
  | 'v-crouch'
  | 'v-door'
  | 'v-close'
  | 'v-elevator'
  | 'v-success'
  | 'v-retry'
  | 'v-meeting';

/** 녹음할 대사 — 음원이 없을 때 음성합성이 읽을 글이기도 하다 */
export const VOICE_LINES: Record<VoiceId, string> = {
  'v-start': '불이 났어! 침착하게 밖으로 나가자.',
  'v-crouch': '연기가 오면 몸을 낮추고, 코와 입을 가리자.',
  'v-door': '문을 열기 전에 손등으로 손잡이를 살짝 만져 보자. 뜨거우면 열지 마.',
  'v-close': '지나온 문은 닫고 가자. 잠그지는 마.',
  'v-elevator': '엘리베이터는 타지 말고, 계단으로 가자.',
  'v-success': '무사히 나왔어! 정말 잘했어.',
  'v-retry': '괜찮아. 무엇이 어려웠는지 보고, 다시 해 보자.',
  'v-meeting': '밖으로 나온 뒤, 가족이 정한 만나는 곳으로 가자.',
};

/**
 * id → data URI. `npm run voice` 가 채운다.
 * 비어 있으면 음성합성으로 넘어간다.
 */
export const VOICE_CLIPS: Partial<Record<VoiceId, string>> = {};

export function hasVoiceClips(): boolean {
  return Object.keys(VOICE_CLIPS).length > 0;
}
