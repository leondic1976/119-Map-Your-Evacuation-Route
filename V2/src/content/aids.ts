/** 현관으로 못 나갈 때 쓰는 곳의 이름과 설명(대장 #188). 돌아보기와 OX 문제가 함께 쓴다 */
import type { AidId } from '../core/aids';

const APT = ['nfa-apt-fire'];

/** 지도에 그릴 수 있는 피난 시설의 이름과 한 줄 설명 */
export const AID_TEXT: Record<AidId, { label: string; tell: string }> = {
  refuge: { label: '대피공간', tell: '방화문을 닫고 들어가 구조를 기다리는 곳' },
  partition: { label: '경량칸막이', tell: '부수고 옆집으로 가는 얇은 벽' },
  hatch: { label: '아래층 문(하향식 피난구)', tell: '베란다에서 아래층으로 내려가는 곳' },
  vestibule: { label: '계단 앞 전실', tell: '계단 앞에서 방화문을 닫고 지나는 곳' },
};

export const AID_NOTE = {
  head: '현관으로 못 나갈 때',
  none: '우리 집에 대피공간이나 경량칸막이, 하향식 피난구가 있는지 어른과 찾아보고, 있으면 지도에 그려 두자.',
  some: '지도에 그려 둔 곳이야. 앞에 물건을 두지 말자.',
  sourceIds: APT,
};
