/** 안전 문장의 출처. `verified: false` 인 출처의 문장은 「검수 대기」를 함께 보인다 */
export interface Source {
  id: string;
  title: string;
  publisher: string;
  url?: string;
  verified: boolean;
}

export const SOURCES: Source[] = [
  { id: 'app-guide', title: '이 앱의 사용 안내 문장 (안전 지식이 아닌 조작 안내)', publisher: '우리집 대피지도', verified: true },
  { id: 'nfa-apt-fire', title: '아파트 화재 피난행동요령', publisher: '소방청', url: 'https://www.nfa.go.kr/', verified: false },
  { id: 'nfa-fire-manual', title: '화재 피난안전 매뉴얼', publisher: '소방청', url: 'https://www.nfa.go.kr/', verified: false },
  { id: 'safekorea-fire', title: '국민행동요령 — 화재', publisher: '행정안전부 국민재난안전포털', url: 'https://www.safekorea.go.kr/', verified: false },
];

export function isVerified(sourceIds: string[]): boolean {
  return sourceIds.every((id) => SOURCES.find((s) => s.id === id)?.verified === true);
}
