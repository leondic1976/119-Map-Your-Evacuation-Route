/** 단계별 사용법 카드 — 처음 들어갈 때 한 번 뜨고 「어떻게 해?」로 다시 본다 (설계서 §5.1) */
import type { Band } from '../core/types';
import type { LineId } from './lines';

export type HowToStep = 'draw' | 'sort' | 'door' | 'mark' | 'route' | 'drill';

export interface HowTo {
  title: string;
  steps: string[];
  line: LineId;
}

export function howToFor(step: HowToStep, band: Band): HowTo {
  switch (step) {
    case 'draw':
      return {
        title: '집은 이렇게 그려',
        steps: ['점을 누른 채로 다음 점까지 끌어.', '점을 하나씩 차례로 눌러도 돼.', '먼 점까지 끌면 기울어진 벽도 돼.', '빙 둘러 닫으면 칸이 생겨.', '「방 넣기」에서 방을 골라 놓아도 돼.'],
        line: 'howto-draw',
      };
    case 'sort':
      return {
        title: '칸은 이렇게 칠해',
        steps: ['크레용을 하나 골라.', '칠할 칸을 한 번 눌러.'],
        line: 'howto-sort',
      };
    case 'door':
      return {
        title: '문은 이렇게 달아',
        steps: ['문을 달 벽을 한 번 눌러.', '잘못 달았으면 다시 누르면 떼어져.', '「문 고치기」를 고르고 문을 누르면 열리는 쪽과 크기를 바꿀 수 있어.', '바깥 벽에 단 문은 밖으로 나가는 문이야.'],
        line: 'howto-door',
      };
    case 'mark':
      return {
        title: '표시는 이렇게 놓아',
        steps: ['놓을 표시를 골라.', '지도에서 놓을 자리를 눌러.'],
        line: 'howto-mark',
      };
    case 'route':
      return {
        title: '나가는 길은 방향키로 그려',
        steps: ['방향키를 눌러. 누른 쪽으로 한 칸씩 가.', '키보드가 없으면 화면의 방향키 판을 눌러.', '벽은 못 지나가. 문으로 지나가.', '집 밖까지 가면 길이 완성돼.'],
        line: 'howto-route',
      };
    case 'drill': {
      const steps = ['「내가 그린 길로 가기」를 누르면 그린 길을 따라가. 방향키로 한 칸씩 갈 수도 있어.', '연기가 오면 몸 낮추기 단추를 눌러.'];
      if (band !== 'low') steps.push('문 앞에서 물어보면 손등으로 만져 봐.');
      if (band === 'high') steps.push('지나온 문은 문 닫기 단추로 닫을 수 있어.');
      steps.push('집 밖으로 나가서 안전한 곳까지 가면 끝이야.');
      return { title: '대피 연습은 이렇게 해', steps, line: band === 'low' ? 'howto-drill' : band === 'mid' ? 'howto-drill-mid' : 'howto-drill-high' };
    }
  }
}
