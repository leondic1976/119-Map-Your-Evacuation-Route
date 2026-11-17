/** 칭찬 도장과 길 위의 안전 행동. 화면 글이라 MP3 대상이 아니다 */
import type { StampId } from '../core/report';

const APT = ['nfa-apt-fire', 'safekorea-fire'];
const MANUAL = ['safekorea-fire', 'mois-kids-fire'];

export const STAMPS: Record<StampId, { label: string; text: string; sourceIds: string[] }> = {
  shout: { label: '불이야!', text: '「불이야!」 하고 크게 외쳐 알렸어.', sourceIds: MANUAL },
  nose: { label: '코와 입', text: '코와 입을 가리고 지나갔어.', sourceIds: MANUAL },
  crouch: { label: '몸 낮추기', text: '연기가 있을 때 몸을 낮췄어.', sourceIds: MANUAL },
  touch: { label: '문 만지기', text: '문을 열기 전에 손등으로 만져 봤어.', sourceIds: MANUAL },
  close: { label: '문 닫기', text: '지나온 문을 닫았어.', sourceIds: APT },
  stairs: { label: '계단으로', text: '엘리베이터를 타지 않고 계단으로 나왔어.', sourceIds: APT },
  meet: { label: '안전한 곳', text: '안전한 곳에서 가족을 만났어.', sourceIds: APT },
};
