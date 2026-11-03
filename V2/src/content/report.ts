/** 돌아보기와 인쇄물의 문장. 화면 글이라 MP3 대상이 아니다 */
import type { FixId, PraiseId } from '../core/report';

const APT = ['nfa-apt-fire', 'safekorea-fire'];
const MANUAL = ['nfa-fire-manual', 'safekorea-fire'];
const GUIDE = ['app-guide'];

export const PRAISE: Record<PraiseId, { text: string; sourceIds: string[] }> = {
  tried: { text: '끝까지 연습했어.', sourceIds: GUIDE },
  escaped: { text: '밖까지 무사히 나왔어.', sourceIds: GUIDE },
  route: { text: '내가 그린 길로 그대로 나왔어.', sourceIds: GUIDE },
  crouch: { text: '연기가 있을 때 몸을 낮췄어.', sourceIds: MANUAL },
  touch: { text: '문을 열기 전에 손등으로 만져 봤어.', sourceIds: MANUAL },
  close: { text: '지나온 문을 닫아 불이 번지는 것을 늦췄어.', sourceIds: APT },
  meet: { text: '만나는 곳에 가서 119에 알렸어.', sourceIds: MANUAL },
  rescue: { text: '길이 막혔을 때 문을 닫고 구조를 요청했어.', sourceIds: APT },
};

export const FIX: Record<FixId, { text: string; sourceIds: string[] }> = {
  crouch: { text: '연기 속에서는 몸을 낮추자.', sourceIds: MANUAL },
  touch: { text: '문을 열기 전에 손등으로 먼저 만져 보자.', sourceIds: MANUAL },
  close: { text: '지나온 문을 닫고 가자.', sourceIds: APT },
  route: { text: '그린 길과 다르게 나왔어. 어느 길이 더 좋을지 생각해 보자.', sourceIds: GUIDE },
  second: { text: '다른 길도 하나 더 찾아 두자.', sourceIds: GUIDE },
};

/** 인쇄물의 「우리 집 약속」 */
export const PROMISES: { text: string; sourceIds: string[] }[] = [
  { text: '불이 나면 「불이야!」 하고 크게 외친다.', sourceIds: MANUAL },
  { text: '연기가 있으면 몸을 낮추고 코와 입을 가린다.', sourceIds: MANUAL },
  { text: '문을 열기 전에 손등으로 만져 본다. 뜨거우면 열지 않는다.', sourceIds: MANUAL },
  { text: '승강기를 타지 않고 계단으로 내려간다.', sourceIds: APT },
  { text: '길이 막히면 방문을 닫고 창가에서 119에 구조를 요청한다.', sourceIds: APT },
  { text: '밖으로 나오면 만나는 곳에 모여 119에 전화한다.', sourceIds: MANUAL },
];
