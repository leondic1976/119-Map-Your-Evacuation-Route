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
  // 2026-11-05 원문과 문장을 하나씩 대조했다(대장 #134). 소방 전문가의 검수를 대신하지는 않는다
  { id: 'nfa-apt-fire', title: '아파트 입주자 화재 피난행동요령', publisher: '소방청 등 관계부처 합동', url: 'https://www.incheon.go.kr/119/NE030101/2165632', verified: true },
  { id: 'safekorea-fire', title: '국민행동요령 — 화재', publisher: '행정안전부 국민안전24', url: 'https://www.safekorea.go.kr/safekorea-kor/acts/nacts/action-guide.do?category=fires&menuSn=4', verified: true },
  { id: 'mois-kids-fire', title: '안전 배움터 — 화재 발생 시 요령', publisher: '행정안전부 어린이 누리집', url: 'https://www.mois.go.kr/chd/sub/a06/fire/screen.do', verified: true },
  // 2026-11-16 「아파트와 기숙사를 뺀 모든 주택은 소화기와 주택용 화재경보기를 둔다」를 경기도 소방 안내와 대조했다(대장 #169)
  { id: 'fire-law-home', title: '주택에 설치하는 소방시설 — 소방시설 설치 및 관리에 관한 법률 제10조 안내', publisher: '경기도 · 소방청', url: 'https://www.gg.go.kr/myggd/vol189/3_3.php', verified: true },
];

export function isVerified(sourceIds: string[]): boolean {
  return sourceIds.every((id) => SOURCES.find((s) => s.id === id)?.verified === true);
}
