/**
 * 캐릭터가 소리 내어 말하는 문장의 정본. 문장 하나가 MP3 하나다(`public/voice/<id>.mp3`).
 * `say` 는 글과 읽는 소리가 다를 때만 적는다. 고치면 `npm run voice:manifest` 뒤 MP3 를 다시 만든다.
 */
export type Speaker = 'ilgu' | 'yeongi' | 'ungi';
export type Emotion = 'normal' | 'happy' | 'thinking' | 'worried' | 'alert';

export interface Line {
  speaker: Speaker;
  emotion: Emotion;
  text: string;
  say?: string;
  sourceIds: string[];
}

const GUIDE = ['app-guide'];
const APT = ['nfa-apt-fire', 'safekorea-fire'];
const MANUAL = ['nfa-fire-manual', 'safekorea-fire'];

export const LINES = {
  'welcome': { speaker: 'ilgu', emotion: 'happy', text: '안녕! 나는 일구야. 우리 집 대피지도를 같이 그려 보자.', sourceIds: GUIDE },
  'nametag': { speaker: 'yeongi', emotion: 'happy', text: '몇 학년인지 골라 줘. 이름은 안 적어도 괜찮아.', sourceIds: GUIDE },

  'draw-low': { speaker: 'yeongi', emotion: 'normal', text: '연한 선을 따라 점과 점을 이어 보자. 쭉 끌어도 되고, 점을 차례로 눌러도 돼.', sourceIds: GUIDE },
  'draw-mid': { speaker: 'yeongi', emotion: 'normal', text: '연한 선을 따라 집 테두리를 그리고, 벽을 그어서 칸을 나눠 보자.', sourceIds: GUIDE },
  'draw-high': { speaker: 'yeongi', emotion: 'normal', text: '점을 이어서 우리 집 테두리와 벽을 직접 그려 보자.', sourceIds: GUIDE },
  'draw-first-cell': { speaker: 'ungi', emotion: 'happy', text: '우와, 칸이 생겼어! 선으로 둘러싸면 칸이 되는 거야.', sourceIds: GUIDE },
  'draw-need-cell': { speaker: 'ungi', emotion: 'thinking', text: '아직 칸이 없어. 선을 빙 둘러서 닫아 보자. 어려우면 도와줘를 눌러.', sourceIds: GUIDE },

  'sort-low': { speaker: 'yeongi', emotion: 'normal', text: '크레용을 고르고 칸을 눌러 칠해 보자. 머무는 칸은 방, 걸어가는 칸은 지나가는 곳이야.', sourceIds: GUIDE },
  'sort-more': { speaker: 'yeongi', emotion: 'normal', text: '크레용을 고르고 칸을 눌러 이름을 붙여 보자. 노란색은 방, 파란색은 지나가는 곳이야.', sourceIds: GUIDE },
  'sort-why': { speaker: 'ilgu', emotion: 'normal', text: '방은 문을 닫으면 불과 연기를 막아 줘. 지나가는 곳은 밖으로 나갈 때 걸어가는 길이야.', sourceIds: APT },

  'door-low': { speaker: 'yeongi', emotion: 'normal', text: '벽을 눌러 문을 달아 보자. 밖으로 나가는 문도 꼭 하나 달자.', sourceIds: GUIDE },
  'door-more': { speaker: 'yeongi', emotion: 'normal', text: '벽을 눌러 문을 달고, 바깥 벽에는 창문도 달아 보자. 밖으로 나가는 문도 꼭 하나 달자.', sourceIds: GUIDE },
  'door-no-exit': { speaker: 'ungi', emotion: 'thinking', text: '밖으로 나가는 문이 아직 없어. 바깥 벽을 눌러 문을 달자.', sourceIds: GUIDE },
  'door-stuck': { speaker: 'ungi', emotion: 'thinking', text: '밖으로 이어지지 않는 칸이 있어. 그 칸에도 문을 달아 주자.', sourceIds: GUIDE },
  'door-window-inside': { speaker: 'ungi', emotion: 'thinking', text: '창문은 바깥 벽에 달자.', sourceIds: GUIDE },

  'mark-low': { speaker: 'yeongi', emotion: 'normal', text: '내가 자는 곳에 내 자리를 놓고, 집 밖에 가족이 만나는 곳을 정하자.', sourceIds: GUIDE },
  'mark-mid': { speaker: 'yeongi', emotion: 'normal', text: '내 자리와 만나는 곳을 정하고, 가스레인지와 소화기가 있는 곳도 표시하자.', sourceIds: GUIDE },
  'mark-high': { speaker: 'yeongi', emotion: 'normal', text: '내 자리와 만나는 곳을 정하고, 가스레인지, 소화기, 화재 감지기도 표시하자.', sourceIds: GUIDE },
  'mark-need-inside': { speaker: 'ungi', emotion: 'thinking', text: '이건 집 안의 칸에 놓자.', sourceIds: GUIDE },
  'mark-need-outside': { speaker: 'ungi', emotion: 'thinking', text: '만나는 곳은 집 밖에 정하자.', sourceIds: GUIDE },

  'route-start': { speaker: 'yeongi', emotion: 'normal', text: '내 자리에서 시작해. 반짝이는 칸을 차례로 눌러 밖까지 나가 보자.', sourceIds: GUIDE },
  'route-no-way': { speaker: 'ungi', emotion: 'thinking', text: '거기로 가는 문이 없어. 반짝이는 곳을 눌러 보자.', sourceIds: GUIDE },
  'route-done': { speaker: 'ilgu', emotion: 'happy', text: '나가는 길을 찾았어! 정말 잘했어.', sourceIds: GUIDE },
  'route-second': { speaker: 'ilgu', emotion: 'thinking', text: '불이 첫째 길을 막으면 어떻게 할까? 다른 길도 찾아 보자.', sourceIds: GUIDE },
  'route-no-second': { speaker: 'ilgu', emotion: 'normal', text: '다른 길이 없다면 방문을 닫고 창가에서 119에 구조를 요청하자.', say: '다른 길이 없다면 방문을 닫고 창가에서 일일구에 구조를 요청하자.', sourceIds: APT },

  'drill-ready': { speaker: 'ilgu', emotion: 'normal', text: '이제 연습해 보자. 진짜 불이 아니니까 괜찮아. 시작을 눌러 줘.', sourceIds: GUIDE },
  'drill-start': { speaker: 'yeongi', emotion: 'alert', text: '불이 났어! 불이야 하고 크게 외치고, 침착하게 밖으로 나가자.', sourceIds: MANUAL },
  'drill-smoke': { speaker: 'yeongi', emotion: 'alert', text: '연기야! 몸을 낮추고 코와 입을 가리자.', sourceIds: MANUAL },
  'drill-touch': { speaker: 'ungi', emotion: 'thinking', text: '문을 열기 전에 손등으로 살짝 만져 보자.', sourceIds: MANUAL },
  'drill-hot': { speaker: 'yeongi', emotion: 'worried', text: '뜨거워! 이 문은 열지 말고 다른 길로 가자.', sourceIds: MANUAL },
  'drill-cool': { speaker: 'ungi', emotion: 'normal', text: '뜨겁지 않아. 지나가자.', sourceIds: MANUAL },
  'drill-close-tip': { speaker: 'ungi', emotion: 'normal', text: '지나온 문을 닫으면 불이 천천히 번져.', sourceIds: APT },
  'drill-closed': { speaker: 'ilgu', emotion: 'happy', text: '문을 닫았어! 아주 잘했어.', sourceIds: APT },
  'drill-no-door': { speaker: 'ungi', emotion: 'thinking', text: '거기로 가는 문이 없어. 문이 있는 쪽으로 가자.', sourceIds: GUIDE },
  'drill-outside': { speaker: 'ilgu', emotion: 'happy', text: '밖으로 나왔어! 이제 만나는 곳으로 가자.', sourceIds: GUIDE },
  'drill-call': { speaker: 'ilgu', emotion: 'normal', text: '가족을 만났어! 이제 119에 불이 났다고 말하고 우리 집 주소를 알려 주자.', say: '가족을 만났어! 이제 일일구에 불이 났다고 말하고 우리 집 주소를 알려 주자.', sourceIds: MANUAL },
  'drill-rescue': { speaker: 'ilgu', emotion: 'worried', text: '나갈 길이 막혔어. 문을 닫고 창가에서 119에 구조를 요청하자.', say: '나갈 길이 막혔어. 문을 닫고 창가에서 일일구에 구조를 요청하자.', sourceIds: APT },

  'review': { speaker: 'ilgu', emotion: 'happy', text: '끝까지 해냈어! 잘한 점을 보고, 3D로 다시 본 다음 지도를 인쇄해 보자.', say: '끝까지 해냈어! 잘한 점을 보고, 쓰리디로 다시 본 다음 지도를 인쇄해 보자.', sourceIds: GUIDE },
  'review-no-drill': { speaker: 'ilgu', emotion: 'normal', text: '지도를 인쇄할 수 있어. 대피 연습을 하면 잘한 점도 볼 수 있어.', sourceIds: GUIDE },
  'replay': { speaker: 'ilgu', emotion: 'happy', text: '내가 나온 길을 다시 보자.', sourceIds: GUIDE },
  'help-fill': { speaker: 'ungi', emotion: 'thinking', text: '아직 빠진 게 있어. 내가 채워 줄까?', sourceIds: GUIDE },
} as const satisfies Record<string, Line>;

export type LineId = keyof typeof LINES;

export function lineOf(id: LineId): Line {
  return LINES[id];
}

export const LINE_IDS = Object.keys(LINES) as LineId[];
