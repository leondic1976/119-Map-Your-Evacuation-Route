/** 돌아보기와 인쇄물의 문장. 화면 글이라 MP3 대상이 아니다 */
import type { FixId, PraiseId } from '../core/report';

const APT = ['nfa-apt-fire', 'safekorea-fire'];
const MANUAL = ['safekorea-fire', 'mois-kids-fire'];
const GUIDE = ['app-guide'];

export const PRAISE: Record<PraiseId, { text: string; sourceIds: string[] }> = {
  tried: { text: '끝까지 연습했어.', sourceIds: GUIDE },
  escaped: { text: '밖까지 무사히 나왔어.', sourceIds: GUIDE },
  route: { text: '정해 둔 길로 그대로 나왔어.', sourceIds: GUIDE },
  crouch: { text: '연기가 있을 때 몸을 낮췄어.', sourceIds: MANUAL },
  touch: { text: '문을 열기 전에 손등으로 문손잡이를 만져 봤어.', sourceIds: MANUAL },
  close: { text: '지나온 문을 닫아 불이 번지는 것을 늦췄어.', sourceIds: APT },
  meet: { text: '만나는 곳에 가서 119에 알렸어.', sourceIds: MANUAL },
  rescue: { text: '길이 막혔을 때 문을 닫고 119에 도와 달라고 했어.', sourceIds: APT },
};

export const FIX: Record<FixId, { text: string; sourceIds: string[] }> = {
  crouch: { text: '연기 속에서는 몸을 낮추자.', sourceIds: MANUAL },
  touch: { text: '문을 열기 전에 손등으로 문손잡이를 먼저 만져 보자.', sourceIds: MANUAL },
  close: { text: '지나온 문을 닫고 가자.', sourceIds: APT },
  route: { text: '정해 둔 길과 다르게 나왔어. 어느 길이 더 좋을지 생각해 보자.', sourceIds: GUIDE },
  second: { text: '다른 길도 하나 더 찾아 두자.', sourceIds: GUIDE },
};

/** 인쇄물의 「우리 집 약속」 */
export const PROMISES: { text: string; sourceIds: string[] }[] = [
  { text: '불이 나면 「불이야!」 하고 크게 외친다.', sourceIds: MANUAL },
  { text: '연기가 있으면 몸을 낮추고 코와 입을 가린다.', sourceIds: MANUAL },
  { text: '문을 열기 전에 손등으로 문손잡이를 만져 본다. 뜨거우면 열지 않는다.', sourceIds: MANUAL },
  { text: '나갈 때 문을 닫는다. 엘리베이터를 타지 않고 계단으로 땅이나 옥상으로 간다.', sourceIds: APT },
  { text: '현관으로 못 나가면 대피공간이나 경량칸막이로 간다. 어디 있는지 어른과 미리 찾아 둔다.', sourceIds: APT },
  { text: '그것도 없으면 불에서 먼 방의 문을 닫고 젖은 수건으로 틈을 막은 뒤 119에 전화한다.', sourceIds: APT },
  { text: '다른 집에 불이 났는데 우리 집에 불과 연기가 안 들어오면 창문을 닫고 집에서 안내를 듣는다.', sourceIds: APT },
  { text: '밖으로 나오면 만나는 곳에 모여 119에 전화한다.', sourceIds: APT },
];
