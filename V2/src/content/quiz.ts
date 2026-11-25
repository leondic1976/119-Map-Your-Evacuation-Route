/**
 * 5~6학년 OX 문제(대장 #188). 화면 글이라 MP3 대상이 아니다.
 * 문장은 관계부처 합동 「아파트 입주자 화재 피난행동요령」 원문과 2026-11-25 에 하나씩 대조했다.
 * `topic` 은 돌아보기의 「다음에 해 볼 것」과 지도에 그린 것에 맞춰 문제를 고르는 데 쓴다.
 */
import type { AidId } from '../core/aids';

export type QuizTopic = 'tell' | 'crouch' | 'touch' | 'close' | 'lift' | 'route' | 'aids' | 'stay' | 'call' | 'plan';

export interface QuizItem {
  id: string;
  topic: QuizTopic;
  text: string;
  answer: boolean;
  why: string;
  sourceIds: string[];
}

const APT = ['nfa-apt-fire'];

export const QUIZ: QuizItem[] = [
  { id: 'tell', topic: 'tell', answer: false, text: '불을 보면 다른 사람이 놀라지 않게 혼자 조용히 먼저 나간다.', why: '먼저 집에 있는 사람 모두에게 불이 났다고 알린다. 자고 있으면 불이 난 줄 모른다.', sourceIds: APT },
  { id: 'crouch', topic: 'crouch', answer: true, text: '연기가 있으면 낮은 자세로 간다. 뜨겁고 나쁜 연기는 위쪽에 모이기 때문이다.', why: '낮은 자세를 지키면 위쪽의 유독가스를 덜 마신다. 계단으로 땅이나 옥상까지 낮은 자세로 간다.', sourceIds: APT },
  { id: 'touch', topic: 'touch', answer: true, text: '문을 열기 전에 손등으로 문이 뜨거운지 먼저 확인한다.', why: '문이 뜨거우면 건너편에 불길이 있을 수 있다. 그 문은 열지 않고 다른 길을 찾는다.', sourceIds: APT },
  { id: 'close-open', topic: 'close', answer: false, text: '대피할 때 현관문은 열어 두고 나가야 다른 사람이 따라 나오기 쉽다.', why: '문은 반드시 닫고 나간다. 불이 난 집의 문이 열려 있으면 연기가 계단을 타고 위층으로 빠르게 올라간다.', sourceIds: APT },
  { id: 'close-firedoor', topic: 'close', answer: true, text: '대피할 때는 현관문뿐 아니라 계단 앞의 방화문도 닫고 간다.', why: '현관문과 방문, 방화문을 닫고 간다. 열어 두면 연기가 계단으로 퍼진다.', sourceIds: APT },
  { id: 'lift', topic: 'lift', answer: false, text: '불이 나면 엘리베이터를 타고 빨리 내려가는 것이 가장 안전하다.', why: '엘리베이터는 타지 않는다. 뜨거운 연기가 엘리베이터 길을 타고 올라와 안으로 들어오고, 전기가 끊기면 갇힌다. 계단으로 간다.', sourceIds: APT },
  { id: 'roof', topic: 'route', answer: true, text: '땅으로 내려가기 어려우면 계단으로 옥상에 올라가 대피할 수 있다.', why: '계단으로 땅이나 옥상 같은 안전한 곳으로 간다. 땅으로 내려가기 어려울 때는 옥상으로 간다.', sourceIds: APT },
  { id: 'two-stairs', topic: 'route', answer: true, text: '계단이 양쪽에 있는 아파트에서 가까운 계단에 연기가 있으면 반대쪽 계단으로 간다.', why: '가까운 계단을 먼저 쓰고, 그 계단에 불이나 연기가 있으면 반대쪽 계단으로 간다. 그래서 길을 둘 알아 둔다.', sourceIds: APT },
  { id: 'smoke-stairs', topic: 'route', answer: false, text: '복도와 계단에 연기가 가득해도 무조건 밖으로 뛰어나가야 한다.', why: '나가기 전에 복도와 계단에 연기나 불이 없는지 먼저 살핀다. 연기가 가득하면 집 안의 안전한 곳에서 119에 구조를 요청한다.', sourceIds: APT },
  { id: 'partition', topic: 'aids', answer: true, text: '경량칸막이는 베란다에 있는 얇은 벽(약 9mm 석고보드)이라, 불이 나면 부수고 옆집으로 갈 수 있다.', why: '경량칸막이는 얇은 판으로 되어 있어 쉽게 부수고 옆집으로 피한다. 우리 집에 있는지 어른과 찾아 두자.', sourceIds: APT },
  { id: 'partition-stuff', topic: 'aids', answer: false, text: '경량칸막이 앞은 잘 안 쓰는 곳이니 짐을 쌓아 두어도 괜찮다.', why: '경량칸막이 앞에는 물건을 두지 않는다. 막혀 있으면 불이 났을 때 부수고 지나갈 수 없다.', sourceIds: APT },
  { id: 'hatch', topic: 'aids', answer: false, text: '하향식 피난구는 위층으로 올라가는 문이다.', why: '하향식 피난구는 베란다에서 아래층으로 내려가는 곳이다. 덮개를 열면 경보가 울린다.', sourceIds: APT },
  { id: 'refuge', topic: 'aids', answer: true, text: '대피공간은 문이 방화문으로 된 작은 방으로, 현관으로 나갈 수 없을 때 들어가 구조를 요청하는 곳이다.', why: '대피공간에 들어가면 불과 연기를 얼마 동안 피할 수 있다. 거기서 119에 어디 있는지 알린다.', sourceIds: APT },
  { id: 'refuge-stuff', topic: 'aids', answer: false, text: '대피공간은 평소에 창고처럼 물건을 넣어 두어도 된다.', why: '대피공간에는 물건을 쌓아 두지 않는다. 불이 났을 때 사람이 들어갈 자리가 있어야 한다.', sourceIds: APT },
  { id: 'no-aid', topic: 'aids', answer: true, text: '현관으로 못 나가는데 대피공간도 없으면, 불에서 먼 곳으로 가서 문을 닫고 젖은 수건으로 문틈을 막는다.', why: '불과 연기에서 멀리 가서 문을 닫고, 젖은 수건이나 테이프로 틈을 막아 연기가 들어오지 못하게 한 뒤 119에 구조를 요청한다.', sourceIds: APT },
  { id: 'stay', topic: 'stay', answer: true, text: '다른 집에서 불이 났는데 우리 집에 불과 연기가 들어오지 않으면, 창문을 닫고 집에서 기다리며 안내방송을 듣는다.', why: '아파트의 불은 대부분 불이 난 층을 넘지 않고, 연기 찬 계단으로 무리하게 나가다 다치는 일이 많다. 연기가 들어오기 시작하면 바로 움직인다.', sourceIds: APT },
  { id: 'call', topic: 'call', answer: false, text: '119에 전화하면 「불이야!」라고만 말하고 바로 끊는다.', why: '아파트 이름과 동, 호수를 말하고 어디에 불이 났는지, 나갈 수 있는지, 다친 사람이 있는지를 알린 뒤 안내를 따른다.', sourceIds: APT },
  { id: 'plan-all', topic: 'plan', answer: false, text: '대피 지도에는 나가는 길을 하나만 그려 두면 충분하다.', why: '밖으로 나가는 길을 모두 그리고 어느 길을 먼저 쓸지 정한다. 대피공간과 경량칸막이, 하향식 피난구가 어디 있는지도 그려 둔다.', sourceIds: APT },
  { id: 'plan-twice', topic: 'plan', answer: false, text: '가족 대피 연습은 한 번만 해 보면 다시 할 필요가 없다.', why: '가족이 모두 함께 한 해에 두 번 넘게 연습하고, 끝나면 고칠 점을 이야기한다.', sourceIds: APT },
];

/** 「다음에 해 볼 것」에서 이어지는 주제 */
export const FIX_TOPIC: Record<string, QuizTopic> = { crouch: 'crouch', touch: 'touch', close: 'close', route: 'route', second: 'plan' };

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
