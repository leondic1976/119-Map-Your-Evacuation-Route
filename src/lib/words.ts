/**
 * 낱말 — 이용 수준별 용어.
 *
 * 초등학생에게 "전용면적", "개구부", "세대 피난시설"은 알아들을 수 없는 말이다.
 * 그렇다고 도면 기호까지 바꾸지는 않는다. 소방 기호는 실제로 밖에서 만나게 될
 * 그림이므로 그대로 두되, 옆에 무슨 뜻인지 쉬운 말로 적어 준다.
 *
 * 새 용어가 생기면 여기에 함께 넣는다. 화면 코드에 한국어를 직접 박지 않는다.
 */
import { FacilityType, RoomKind } from './types';

export type LevelKey = 'elementary' | 'secondary';

/* ------------------------------------------------------------------ */
/* 일반 용어                                                           */
/* ------------------------------------------------------------------ */

export type TermKey =
  | 'room'
  | 'rooms'
  | 'opening'
  | 'route'
  | 'routes'
  | 'facility'
  | 'area'
  | 'household'
  | 'evacuate'
  | 'plan'
  | 'walkTime'
  | 'distance'
  | 'ignition'
  | 'smoke'
  | 'blocked'
  | 'assembly'
  | 'diagnosis'
  | 'output';

const HARD: Record<TermKey, string> = {
  room: '실',
  rooms: '실',
  opening: '개구부',
  route: '피난동선',
  routes: '피난동선',
  facility: '설비',
  area: '전용면적',
  household: '세대',
  evacuate: '피난',
  plan: '평면',
  walkTime: '보행 시간',
  distance: '보행거리',
  ignition: '발화 지점',
  smoke: '연기 확산',
  blocked: '통행 불가',
  assembly: '집결지',
  diagnosis: '자가 진단',
  output: '산출물',
};

const EASY: Record<TermKey, string> = {
  room: '방',
  rooms: '방',
  opening: '문·창',
  route: '나가는 길',
  routes: '나가는 길',
  facility: '표시',
  area: '집 넓이',
  household: '우리 집',
  evacuate: '대피',
  plan: '집 모양',
  walkTime: '걸리는 시간',
  distance: '걸어가는 거리',
  ignition: '불난 곳',
  smoke: '연기 퍼짐',
  blocked: '지나갈 수 없음',
  assembly: '모이는 곳',
  diagnosis: '빠진 것 찾기',
  output: '뽑기',
};

export function term(level: LevelKey, key: TermKey): string {
  return level === 'elementary' ? EASY[key] : HARD[key];
}

/* ------------------------------------------------------------------ */
/* 도면 기호 이름                                                      */
/* ------------------------------------------------------------------ */

/** 초등용 기호 이름 — 기호 그림은 그대로 두고 이름만 쉽게 */
export const FACILITY_EASY: Record<FacilityType, string> = {
  extinguisher: '소화기',
  refuge: '숨어서 기다리는 방',
  partition: '부수고 옆집으로',
  downladder: '아래층으로 사다리',
  exit: '나가는 문',
  assembly: '가족이 모일 곳',
};

/** 도면 위 기호 밑에 적어 줄 아주 짧은 말 */
export const FACILITY_CAPTION: Record<FacilityType, string> = {
  extinguisher: '소화기',
  refuge: '숨는 방',
  partition: '부수는 벽',
  downladder: '내려가는 사다리',
  exit: '나가는 곳',
  assembly: '모이는 곳',
};

/** 왜 필요한지 한 줄 — 초등용 설비 안내 */
export const FACILITY_WHY: Record<FacilityType, string> = {
  extinguisher: '불이 작을 때 끄는 것. 어디 있는지 알아 두자.',
  refuge: '발코니에 있는 작은 방. 문을 닫고 구조를 기다린다.',
  partition: '옆집과 사이의 얇은 벽. 두드리면 통통 소리가 난다. 부수고 넘어갈 수 있다.',
  downladder: '발코니 바닥의 네모 뚜껑. 열면 아래층으로 내려가는 사다리가 나온다.',
  exit: '집 밖으로 나가는 현관문.',
  assembly: '밖으로 나온 다음 가족이 만나기로 한 곳.',
};

export function facilityName(level: LevelKey, type: FacilityType, hard: string): string {
  return level === 'elementary' ? FACILITY_EASY[type] : hard;
}

/* ------------------------------------------------------------------ */
/* 실 이름                                                             */
/* ------------------------------------------------------------------ */

/** 초등용 실 용도 이름 */
export const ROOM_EASY: Record<RoomKind, string> = {
  living: '거실',
  room: '방',
  kitchen: '부엌',
  bath: '화장실',
  entry: '현관',
  hall: '복도',
  balcony: '발코니',
  utility: '다용도실',
  dress: '옷방',
  store: '창고',
};

export function roomName(level: LevelKey, kind: RoomKind, hard: string): string {
  return level === 'elementary' ? ROOM_EASY[kind] : hard;
}

/* ------------------------------------------------------------------ */
/* 단계 이름                                                           */
/* ------------------------------------------------------------------ */

/** 초등용 단계 제목·안내. store 의 STEPS 와 순서가 같다 */
export const STEP_EASY: { title: string; short: string; guide: string; required: boolean }[] = [
  {
    title: '집 그리기',
    short: '집',
    guide: '마우스로 끌어서 우리 집 모양을 그린다. 삐뚤빼뚤해도 손을 떼면 반듯해진다.',
    required: true,
  },
  {
    title: '우리 집 정보',
    short: '정보',
    guide: '몇 동 몇 호인지 적는다. 119에 신고할 때 가장 먼저 말해야 하는 것이다.',
    required: true,
  },
  {
    title: '문 만들기',
    short: '문',
    guide: '벽을 따라 짧게 그으면 문이 생긴다. 밖으로 나가는 문은 "현관문"으로 바꾼다.',
    required: true,
  },
  {
    title: '소화기 표시',
    short: '표시',
    guide: '소화기가 어디 있는지 표시한다. 발코니에 피난 사다리가 있으면 그것도 표시한다.',
    required: true,
  },
  {
    title: '나가는 길',
    short: '길',
    guide: '단추를 누르면 방마다 밖으로 나가는 길이 저절로 그려진다.',
    required: true,
  },
  {
    title: '연기 보기',
    short: '연기',
    guide: '불이 난 곳을 고르면 연기가 어떻게 퍼지는지 볼 수 있다. 해 보면 좋지만 안 해도 된다.',
    required: false,
  },
  {
    title: '대피 연습',
    short: '연습',
    guide: '무엇부터 할지 골라 본다. 마지막에 점수가 나온다. 해 보면 좋지만 안 해도 된다.',
    required: false,
  },
  {
    title: '빠진 것 찾기',
    short: '점검',
    guide: '우리 집 지도에 모자란 것이 없는지 봐 준다.',
    required: false,
  },
  {
    title: '뽑아서 붙이기',
    short: '뽑기',
    guide: '한 장으로 뽑아서 냉장고나 현관에 붙인다.',
    required: true,
  },
];

/** 초등에서 꼭 해야 하는 단계인지 */
export function stepRequired(level: LevelKey, index: number): boolean {
  if (level !== 'elementary') return true;
  return STEP_EASY[index]?.required ?? true;
}

export function stepTitle(level: LevelKey, index: number, hard: string): string {
  return level === 'elementary' ? (STEP_EASY[index]?.title ?? hard) : hard;
}

export function stepShort(level: LevelKey, index: number, hard: string): string {
  return level === 'elementary' ? (STEP_EASY[index]?.short ?? hard) : hard;
}

export function stepGuide(level: LevelKey, index: number, hard: string): string {
  return level === 'elementary' ? (STEP_EASY[index]?.guide ?? hard) : hard;
}
