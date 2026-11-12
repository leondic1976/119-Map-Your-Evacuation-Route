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
const MANUAL = ['safekorea-fire', 'mois-kids-fire'];

export const LINES = {
  'welcome': { speaker: 'ilgu', emotion: 'happy', text: '안녕! 나는 일구야. 우리 집 대피지도를 같이 그려 보자.', sourceIds: GUIDE },
  'nametag': { speaker: 'yeongi', emotion: 'happy', text: '몇 학년인지 골라 줘. 이름은 안 적어도 괜찮아.', sourceIds: GUIDE },

  'draw-low': { speaker: 'yeongi', emotion: 'normal', text: '점과 점을 이어서 우리 집을 그려 보자. 쭉 끌어도 되고, 점을 차례로 눌러도 돼.', sourceIds: GUIDE },
  'draw-mid': { speaker: 'yeongi', emotion: 'normal', text: '점을 이어서 집 테두리를 그리고, 벽을 그어서 칸을 나눠 보자.', sourceIds: GUIDE },
  'draw-high': { speaker: 'yeongi', emotion: 'normal', text: '점을 이어서 우리 집 테두리와 벽을 직접 그려 보자.', sourceIds: GUIDE },
  'draw-first-cell': { speaker: 'ungi', emotion: 'happy', text: '우와, 칸이 생겼어! 선으로 둘러싸면 칸이 되는 거야.', sourceIds: GUIDE },
  'draw-make-rooms': { speaker: 'yeongi', emotion: 'happy', text: '집 모양이 다 됐어! 이제 안에 선을 그어서 방을 만들어 보자.', sourceIds: GUIDE },
  'draw-rooms-done': { speaker: 'yeongi', emotion: 'happy', text: '방이 생겼어! 방을 다 만들었으면 다음을 눌러 칸을 칠해 보자.', sourceIds: GUIDE },
  'draw-armed': { speaker: 'ungi', emotion: 'normal', text: '파란 점에서 이어져. 다음 점을 누르고, 잘못 눌렀으면 파란 점을 다시 눌러.', sourceIds: GUIDE },
  'draw-dense': { speaker: 'ungi', emotion: 'thinking', text: '점이 아주 촘촘해. 손가락으로 그릴 때는 크게 보기를 누르면 쉬워.', sourceIds: GUIDE },
  'dots-lost-cell': { speaker: 'ungi', emotion: 'thinking', text: '점을 줄였더니 칸이 없어졌어. 되돌리기를 누르면 다시 돌아와.', sourceIds: GUIDE },
  'draw-need-cell': { speaker: 'ungi', emotion: 'thinking', text: '아직 칸이 없어. 선을 빙 둘러서 닫아 보자. 어려우면 도와줘를 눌러.', sourceIds: GUIDE },

  'sort-low': { speaker: 'yeongi', emotion: 'normal', text: '크레용을 고르고 칸을 눌러 칠해 보자. 문을 닫을 수 있는 곳은 노란색, 걸어서 지나가는 곳은 파란색이야.', sourceIds: GUIDE },
  'sort-more': { speaker: 'yeongi', emotion: 'normal', text: '크레용을 고르고 칸을 눌러 이름을 붙여 보자. 노란색은 문을 닫을 수 있는 곳, 파란색은 지나가는 곳이야.', sourceIds: GUIDE },
  'sort-why': { speaker: 'ilgu', emotion: 'normal', text: '방은 문을 닫으면 불과 연기가 늦게 들어와. 지나가는 곳은 밖으로 나갈 때 걸어가는 길이야.', sourceIds: APT },

  'sort-done': { speaker: 'yeongi', emotion: 'happy', text: '다 칠했어! 이제 다음을 눌러 문을 달아 보자.', sourceIds: GUIDE },

  'door-low': { speaker: 'yeongi', emotion: 'normal', text: '벽을 눌러 문을 달아 보자. 밖으로 나가는 문도 꼭 하나 달자.', sourceIds: GUIDE },
  'door-more': { speaker: 'yeongi', emotion: 'normal', text: '벽을 눌러 문을 달고, 바깥 벽에는 창문도 달아 보자. 밖으로 나가는 문도 꼭 하나 달자.', sourceIds: GUIDE },
  'door-no-exit': { speaker: 'ungi', emotion: 'thinking', text: '밖으로 나가는 문이 아직 없어. 바깥 벽을 눌러 문을 달자.', sourceIds: GUIDE },
  'door-stuck': { speaker: 'ungi', emotion: 'thinking', text: '밖으로 이어지지 않는 칸이 있어. 그 칸에도 문을 달아 주자.', sourceIds: GUIDE },
  'door-window-inside': { speaker: 'ungi', emotion: 'thinking', text: '창문은 바깥 벽에 달자.', sourceIds: GUIDE },

  'door-done': { speaker: 'yeongi', emotion: 'happy', text: '모든 칸이 밖까지 이어졌어! 이제 다음을 눌러 내 자리를 표시해 보자.', sourceIds: GUIDE },

  'mark-low': { speaker: 'yeongi', emotion: 'normal', text: '내가 자는 곳에 내 자리를 놓고, 집 밖에 가족이 만나는 곳을 정하자.', sourceIds: GUIDE },
  'mark-mid': { speaker: 'yeongi', emotion: 'normal', text: '내 자리와 만나는 곳을 정하고, 가스레인지와 소화기가 있는 곳도 표시하자.', sourceIds: GUIDE },
  'mark-high': { speaker: 'yeongi', emotion: 'normal', text: '내 자리와 만나는 곳을 정하고, 가스레인지, 소화기, 화재 감지기도 표시하자.', sourceIds: GUIDE },
  'mark-need-inside': { speaker: 'ungi', emotion: 'thinking', text: '이건 집 안의 칸에 놓자.', sourceIds: GUIDE },
  'item-door': { speaker: 'ungi', emotion: 'thinking', text: '문 앞은 비워 두자. 다른 자리에 놓아 보자.', sourceIds: APT },
  'mark-need-outside': { speaker: 'ungi', emotion: 'thinking', text: '만나는 곳은 집 밖에 정하자.', sourceIds: GUIDE },

  'mark-done': { speaker: 'yeongi', emotion: 'happy', text: '표시를 다 놓았어! 이제 다음을 눌러 나가는 길을 찾아 보자.', sourceIds: GUIDE },

  'route-start': { speaker: 'yeongi', emotion: 'normal', text: '내 자리에서 시작해. 방향키를 눌러 한 칸씩 밖까지 나가 보자.', sourceIds: GUIDE },
  'route-no-way': { speaker: 'ungi', emotion: 'thinking', text: '거기는 벽이야. 문이 있는 쪽으로 가 보자.', sourceIds: GUIDE },
  'route-done': { speaker: 'ilgu', emotion: 'happy', text: '나가는 길을 찾았어! 정말 잘했어.', sourceIds: GUIDE },
  'route-helped': { speaker: 'ilgu', emotion: 'normal', text: '길을 골라 놓았어. 빨간 길을 눈으로 따라가 보고, 다음을 눌러 연습해 보자.', sourceIds: GUIDE },
  'route-dead-end': { speaker: 'ungi', emotion: 'thinking', text: '여기서는 더 갈 곳이 없어. 방향키로 왔던 길을 돌아가 보자.', sourceIds: GUIDE },
  'route-same': { speaker: 'ungi', emotion: 'thinking', text: '첫째 길과 같은 길이야. 방향키로 돌아가서 다른 길로 가 보자.', sourceIds: GUIDE },
  'route-next': { speaker: 'ilgu', emotion: 'happy', text: '이제 다음을 눌러 대피 연습을 해 보자.', sourceIds: GUIDE },
  'route-second': { speaker: 'ilgu', emotion: 'thinking', text: '불이 첫째 길을 막으면 어떻게 할까? 다른 길도 찾아 보자.', sourceIds: GUIDE },
  'route-no-second': { speaker: 'ilgu', emotion: 'normal', text: '다른 길이 없다면 방문을 닫고 창가에서 119에 전화해 도와 달라고 하자.', say: '다른 길이 없다면 방문을 닫고 창가에서 일일구에 전화해 도와 달라고 하자.', sourceIds: APT },

  'drill-ready': { speaker: 'ilgu', emotion: 'normal', text: '이제 연습해 보자. 진짜 불이 아니니까 괜찮아. 시작을 눌러 줘.', sourceIds: GUIDE },
  'drill-start': { speaker: 'yeongi', emotion: 'alert', text: '불이 났어! 불이야 하고 크게 외치고, 밖으로 나가자.', sourceIds: MANUAL },
  'drill-smoke': { speaker: 'yeongi', emotion: 'alert', text: '연기야! 몸을 낮추고 코와 입을 가리자.', sourceIds: MANUAL },
  'drill-touch': { speaker: 'ungi', emotion: 'thinking', text: '문을 열기 전에 손등으로 문손잡이를 살짝 만져 보자.', sourceIds: MANUAL },
  'drill-hot': { speaker: 'yeongi', emotion: 'worried', text: '뜨거워! 이 문은 열지 말고 다른 길로 가자.', sourceIds: MANUAL },
  'drill-cool': { speaker: 'ungi', emotion: 'normal', text: '뜨겁지 않아. 지나가자.', sourceIds: MANUAL },
  'drill-close-tip': { speaker: 'ungi', emotion: 'normal', text: '지나온 문을 닫으면 불이 천천히 번져.', sourceIds: APT },
  'drill-closed': { speaker: 'ilgu', emotion: 'happy', text: '문을 닫았어! 아주 잘했어.', sourceIds: APT },
  'drill-no-door': { speaker: 'ungi', emotion: 'thinking', text: '거기로 가는 문이 없어. 문이 있는 쪽으로 가자.', sourceIds: GUIDE },
  'drill-outside': { speaker: 'ilgu', emotion: 'happy', text: '밖으로 나왔어! 이제 만나는 곳으로 가자.', sourceIds: GUIDE },
  'drill-call': { speaker: 'ilgu', emotion: 'normal', text: '가족을 만났어! 이제 119에 불이 났다고 말하고 우리 집 주소를 알려 주자.', say: '가족을 만났어! 이제 일일구에 불이 났다고 말하고 우리 집 주소를 알려 주자.', sourceIds: MANUAL },
  'drill-rescue': { speaker: 'ilgu', emotion: 'worried', text: '나갈 길이 막혔어. 대피공간이나 경량칸막이가 있으면 그쪽으로 가고, 없으면 문을 닫고 창가에서 119에 전화하자.', say: '나갈 길이 막혔어. 대피공간이나 경량칸막이가 있으면 그쪽으로 가고, 없으면 문을 닫고 창가에서 일일구에 전화하자.', sourceIds: APT },

  'review': { speaker: 'ilgu', emotion: 'happy', text: '끝까지 해냈어! 잘한 점을 보고, 3D로 다시 본 다음 지도를 인쇄해 보자.', say: '끝까지 해냈어! 잘한 점을 보고, 쓰리디로 다시 본 다음 지도를 인쇄해 보자.', sourceIds: GUIDE },
  'review-no-drill': { speaker: 'ilgu', emotion: 'normal', text: '지도를 인쇄할 수 있어. 대피 연습을 하면 잘한 점도 볼 수 있어.', sourceIds: GUIDE },
  'review-unfinished': { speaker: 'ungi', emotion: 'thinking', text: '아직 빠진 곳이 있어. 빠진 곳을 채우면 지도가 완성돼.', sourceIds: GUIDE },
  'replay': { speaker: 'ilgu', emotion: 'happy', text: '내가 나온 길을 다시 보자.', sourceIds: GUIDE },
  'drill-how': { speaker: 'ungi', emotion: 'normal', text: '내가 그린 길로 가기를 누르면 그린 길을 따라가. 방향키로 한 칸씩 갈 수도 있어.', sourceIds: GUIDE },

  'howto-draw': { speaker: 'yeongi', emotion: 'happy', text: '점을 누른 채로 다음 점까지 끌어 봐. 점을 하나씩 차례로 눌러도 돼. 먼 점까지 끌면 기울어진 벽도 돼. 빙 둘러 닫으면 칸이 생겨.', sourceIds: GUIDE },
  'howto-sort': { speaker: 'yeongi', emotion: 'happy', text: '크레용을 하나 고르고, 칠할 칸을 한 번 눌러 봐.', sourceIds: GUIDE },
  'howto-door': { speaker: 'yeongi', emotion: 'happy', text: '문을 달 벽을 한 번 눌러 봐. 다시 누르면 떼어져. 바깥 벽에 단 문은 밖으로 나가는 문이야.', sourceIds: GUIDE },
  'howto-mark': { speaker: 'yeongi', emotion: 'happy', text: '놓을 표시를 고르고, 지도에서 놓을 자리를 눌러 봐.', sourceIds: GUIDE },
  'howto-route': { speaker: 'yeongi', emotion: 'happy', text: '방향키를 눌러 봐. 누른 쪽으로 한 칸씩 가. 벽은 못 지나가고 문으로 지나가. 집 밖까지 가면 길이 완성돼.', sourceIds: GUIDE },
  'howto-drill': { speaker: 'ilgu', emotion: 'normal', text: '내가 그린 길로 가기를 누르면 그린 길을 따라가. 방향키로 한 칸씩 갈 수도 있어. 연기가 오면 몸 낮추기를 누르고, 집 밖까지 나가 보자.', sourceIds: GUIDE },
  'howto-drill-mid': { speaker: 'ilgu', emotion: 'normal', text: '내가 그린 길로 가기를 누르면 그린 길을 따라가. 방향키로 한 칸씩 갈 수도 있어. 연기가 오면 몸 낮추기를 누르고, 문 앞에서 물어보면 손등으로 만져 봐.', sourceIds: GUIDE },
  'howto-drill-high': { speaker: 'ilgu', emotion: 'normal', text: '내가 그린 길로 가기를 누르면 그린 길을 따라가. 방향키로 한 칸씩 갈 수도 있어. 연기가 오면 몸을 낮추고, 문 앞에서는 손등으로 만져 봐. 지나온 문은 문 닫기로 닫을 수 있어.', sourceIds: GUIDE },

  'help-fill': { speaker: 'ungi', emotion: 'thinking', text: '아직 빠진 게 있어. 내가 채워 줄까?', sourceIds: GUIDE },
} as const satisfies Record<string, Line>;

export type LineId = keyof typeof LINES;

export function lineOf(id: LineId): Line {
  return LINES[id];
}

export const LINE_IDS = Object.keys(LINES) as LineId[];
