/**
 * 따라하기 안내와 사용 설명서.
 *
 * 화면 위에 덮개를 띄우고, 지금 눌러야 할 곳만 뚫어 보여 주면서 풍선글로 알려 준다.
 * 초등은 손을 잡고 끝까지 가고, 중·고등·일반은 요점만 짚는다.
 *
 * ── 지켜야 할 규칙 ────────────────────────────────────────────────
 * 기능과 안내는 언제나 같아야 한다. 단계(STEPS)나 도구(TOOLS)를 고치면
 * 이 파일도 함께 고친다. 설명서는 STEPS·TOOLS 에서 직접 만들어 내므로 저절로
 * 따라오지만, 따라하기 안내는 사람이 써야 한다. tools/test.ts 가
 * "모든 단계와 도구가 안내에 나오는지"를 검사해 빠뜨리면 실패한다.
 * ──────────────────────────────────────────────────────────────────
 */
import { STEPS, TOOLS } from './store';
import { Plan } from './types';

export type LevelKey = 'elementary' | 'secondary';

/** 풍선글을 붙일 방향 */
export type Place = 'top' | 'bottom' | 'left' | 'right' | 'center';

/**
 * 뚫어서 보여 줄 수 있는 자리.
 * 화면 쪽에 `data-coach="..."` 로 같은 이름을 달아 둔다.
 */
export const COACH_TARGETS = [
  'stepper',
  'rail',
  'optbar',
  'canvas',
  'inspector',
  'sketch-start',
  'print',
  'manual',
  'reset',
  'level',
] as const;

export type CoachTarget = (typeof COACH_TARGETS)[number];

export interface CoachContext {
  plan: Plan;
  tool: string;
  step: number;
  /** 훈련을 끝냈는지 */
  drilled: boolean;
  /** 문이 없어 밖으로 나갈 수 없는 방의 수 */
  stuck: number;
}

export interface CoachStep {
  id: string;
  target?: CoachTarget;
  /**
   * 함께 밝혀 둘 곳.
   * 이용자가 직접 해야 하는 안내(wait)에서는 손이 닿아야 할 곳을 모두 밝힌다.
   * 옵션 막대만 밝히고 도면을 어둡게 두면 어디에 그어야 할지 알 수 없다.
   */
  also?: CoachTarget[];
  title: string;
  body: string;
  /** 이 안내로 올 때 맞출 작성 단계 (0~8) */
  goStep?: number;
  place?: Place;
  /** 할 일을 마쳤는지. 참이 되면 저절로 다음으로 넘어간다 */
  done?: (c: CoachContext) => boolean;
  /** 마쳐야만 넘어갈 수 있는 안내 */
  wait?: boolean;
}

const rooms = (c: CoachContext) => c.plan.rooms.length;
const hasEntrance = (c: CoachContext) => c.plan.doors.some((d) => d.kind === 'entrance');
const hasInfo = (c: CoachContext) => Boolean(c.plan.meta.dong.trim() && c.plan.meta.ho.trim());

/* ------------------------------------------------------------------ */
/* 초등학생용 — 그리는 재미를 먼저, 말은 짧게                           */
/* ------------------------------------------------------------------ */

const ELEMENTARY: CoachStep[] = [
  {
    id: 'welcome',
    title: '우리 집 피난로를 그려 보자',
    body: '불이 났을 때 어디로 나갈지 미리 정해 두는 지도를 만든다. 아홉 걸음이면 끝난다. 다 만들면 종이로 뽑아서 집에 붙여 두자.',
    place: 'center',
  },
  {
    id: 'stepper',
    target: 'stepper',
    title: '01부터 09까지 차례대로',
    body: '위에 있는 번호가 걸음이다. 하나씩 따라가면 된다. 다 한 걸음에는 체크 표시가 붙는다. 아무 번호나 눌러 오갈 수도 있다.',
    place: 'bottom',
  },
  {
    id: 'sketch-start',
    target: 'sketch-start',
    goStep: 0,
    title: '먼저 집 모양을 그린다',
    body: '이 단추를 누르면 도화지처럼 그릴 수 있다. 눌러 보자.',
    place: 'left',
    wait: true,
    done: (c) => c.tool === 'sketch',
  },
  {
    id: 'draw-room',
    target: 'canvas',
    title: '집 모양을 한 바퀴 쓱',
    body: '마우스를 누른 채로 네모나게 한 바퀴 돌린다. 삐뚤빼뚤해도 괜찮다. 손을 떼면 저절로 반듯해진다.',
    place: 'right',
    wait: true,
    done: (c) => rooms(c) >= 1,
  },
  {
    id: 'draw-wall',
    target: 'canvas',
    title: '가로질러 그으면 벽이 된다',
    body: '방 한가운데를 쭉 긋는다. 그 자리에 벽이 서고 방이 둘로 나뉜다. 방을 여러 개 만들어 보자.',
    place: 'right',
    wait: true,
    done: (c) => rooms(c) >= 2,
  },
  {
    id: 'fix',
    target: 'canvas',
    title: '잘못 그렸으면 지운다',
    body: '고르기 도구로 무엇이든 한 번 누르면 도면 위에 이름표가 뜬다. 거기 있는 "지우기"를 누르면 없어진다. Ctrl+Z 로 되돌릴 수도 있다.',
    place: 'right',
  },
  {
    id: 'meta',
    target: 'inspector',
    goStep: 1,
    title: '우리 집이 몇 동 몇 호일까',
    place: 'left',
    body: '동과 호수를 적는다. 119에 신고할 때 가장 먼저 말해야 하는 것이다. 지은 해를 넣으면 우리 집에 어떤 피난시설이 있는지도 알려 준다.',
    wait: true,
    done: hasInfo,
  },
  {
    id: 'draw-door',
    target: 'optbar',
    also: ['canvas'],
    goStep: 2,
    title: '이제 밖으로 나가는 문을 만든다',
    body: '위 막대에 종류가 "현관문"으로 되어 있는지 보고, 집 바깥쪽 벽을 한 번 누른다. 그 자리에 현관문이 생긴다.',
    place: 'bottom',
    wait: true,
    done: hasEntrance,
  },
  {
    id: 'inner-door',
    target: 'canvas',
    also: ['optbar'],
    goStep: 2,
    title: '방과 방 사이에도 문이 필요하다',
    body: '문이 없으면 그 방에서는 나올 수가 없다. 위 막대의 종류가 "실문"으로 바뀌어 있다. 방과 방 사이 벽을 한 번 누른다.',
    place: 'bottom',
    wait: true,
    done: (c) => c.stuck === 0,
  },
  {
    id: 'facility',
    target: 'inspector',
    also: ['canvas'],
    goStep: 3,
    title: '소화기는 어디 있지?',
    body: '"가운데 놓기"를 누르면 도면에 소화기가 놓인다. 끌어서 실제 자리로 옮긴다. 발코니에 피난 사다리가 있으면 그것도 함께 표시한다.',
    place: 'left',
    wait: true,
    done: (c) => c.plan.facilities.length > 0,
  },
  {
    id: 'route',
    target: 'inspector',
    also: ['canvas'],
    goStep: 4,
    title: '길은 저절로 그려진다',
    body: '"주 동선" 단추를 누르면 방마다 현관까지 가는 길이 그려진다. 몇 미터인지, 몇 초 걸리는지도 나온다.',
    place: 'left',
    wait: true,
    done: (c) => c.plan.routes.length > 0,
  },
  {
    id: 'sim',
    target: 'inspector',
    goStep: 5,
    title: '연기가 어떻게 퍼지는지 보자',
    body: '불이 난 곳을 고르고 시간을 옮겨 보면, 연기가 어디를 먼저 막는지 보인다. 생각보다 아주 빠르다.',
    place: 'left',
  },
  {
    id: 'drill',
    target: 'inspector',
    goStep: 6,
    title: '연습해 보자',
    body: '한밤중에 불이 났다면 무엇부터 할까? 고를 때마다 시간이 흐르고 연기를 마신다. 마지막에 점수가 나온다.',
    place: 'left',
  },
  {
    id: 'check',
    target: 'inspector',
    goStep: 7,
    title: '빠뜨린 것이 없는지 본다',
    body: '우리 집 지도에 모자란 것을 찾아 준다. 집 안에서 눈으로 확인할 위험한 것들도 함께 알려 준다.',
    place: 'left',
  },
  {
    id: 'print',
    target: 'print',
    goStep: 8,
    title: '다 됐다! 뽑아서 붙이자',
    body: '이 단추를 누르면 A4 한 장으로 나온다. 냉장고나 현관 안쪽에 붙여 두고 가족과 함께 본다.',
    place: 'bottom',
  },
  {
    id: 'again',
    target: 'reset',
    title: '다시 그리고 싶으면',
    body: '"처음부터"를 누르면 싹 지우고 새로 시작한다. 설명이 다시 보고 싶으면 옆에 있는 "따라하기"를 누른다.',
    place: 'bottom',
  },
];

/* ------------------------------------------------------------------ */
/* 중·고등·일반 — 요점만                                                */
/* ------------------------------------------------------------------ */

const SECONDARY: CoachStep[] = [
  {
    id: 'welcome',
    title: '9단계로 세대 피난계획을 만든다',
    body: '평면을 작성하고 피난시설과 동선을 표기한 뒤, 연기 확산을 해석해 A4 피난안내도로 출력한다. 입력한 내용은 서버로 보내지 않는다.',
    place: 'center',
  },
  {
    id: 'stepper',
    target: 'stepper',
    title: '단계 스테퍼',
    body: '01부터 09까지 순서대로 가되, 아무 단계나 눌러 오갈 수 있다. 완료 조건을 채운 단계에는 체크가 붙는다.',
    place: 'bottom',
  },
  {
    id: 'start',
    target: 'inspector',
    goStep: 0,
    title: '시작하는 세 가지 방법',
    body: '표준 평면 4종을 전용면적에 맞춰 불러오거나, 도면 사진을 올려 자동 인식하거나, 자유 그리기로 직접 그린다. 손그림은 손을 떼면 직선으로 펴진다.',
    place: 'left',
  },
  {
    id: 'tools',
    target: 'rail',
    title: '도구와 단축키',
    body: '도구마다 단축키가 있다. 고르기 V, 그리기 S, 방 R, 문 D, 창 W, 설비 F, 동선 L. 스페이스를 누른 채 끌면 화면이 움직인다.',
    place: 'right',
  },
  {
    id: 'meta',
    target: 'inspector',
    goStep: 1,
    title: '사용승인 연도가 중요하다',
    body: '1992·2005·2010년을 기준으로 세대 피난시설(경량칸막이·대피공간·하향식 피난구)이 달라진다. 연도를 넣으면 우리 집이 어디에 해당하는지 안내한다.',
    place: 'left',
  },
  {
    id: 'opening',
    target: 'optbar',
    goStep: 2,
    title: '문은 상시 개방 여부가 중요하다',
    body: '닫힌 문은 연기가 넘어오는 데 약 80초를 벌어 준다. 평소 열어 두는 문을 상시 개방으로 표시해야 해석이 현실과 가까워진다.',
    place: 'bottom',
  },
  {
    id: 'facility',
    target: 'inspector',
    goStep: 3,
    title: '대체 피난수단을 반드시 넣는다',
    body: '현관이 막혔을 때 갈 곳이다. 발코니에서 실제 시설을 눈으로 확인해 표기한다. 아무것도 없다면 외기에 접한 발코니를 대기 장소로 정한다.',
    place: 'left',
  },
  {
    id: 'route',
    target: 'inspector',
    goStep: 4,
    title: '동선은 자동 생성 후 손본다',
    body: '벽에서 떨어진 통로 중앙을 따라 직각으로 이어진다. 보행 기준(성인·어린이·고령자)을 바꾸면 소요시간이 함께 바뀐다.',
    place: 'left',
  },
  {
    id: 'sim',
    target: 'inspector',
    goStep: 5,
    title: 'ASET 과 RSET 을 비교한다',
    body: '연기 선단은 0.9m/s 로 퍼지지만, 지나갈 수 없게 되는 것은 농도가 차오른 뒤다. 그 시각이 ASET, 인지 10초에 보행 시간을 더한 값이 RSET 이다.',
    place: 'left',
  },
  {
    id: 'drill',
    target: 'inspector',
    goStep: 6,
    title: '의사결정형 훈련',
    body: '행동을 고를 때마다 시간이 흐르고 그 시각의 연기 농도만큼 노출이 쌓인다. 자세 낮추기·문 닫기의 효과를 수치로 확인한다.',
    place: 'left',
  },
  {
    id: 'check',
    target: 'inspector',
    goStep: 7,
    title: '도면 기준 자동 점검',
    body: '현관문·소화기·대체 피난수단·동선 커버리지 등을 점수로 낸다. 도면으로 알 수 없는 것은 위험요소 자료 10종에서 눈으로 확인한다.',
    place: 'left',
  },
  {
    id: 'print',
    target: 'print',
    goStep: 8,
    title: 'A4 가로 1매로 출력한다',
    body: '도면·범례·동선표·집결지·행동절차·119 문안이 한 장에 들어간다. PNG 와 JSON 으로도 저장된다.',
    place: 'bottom',
  },
  {
    id: 'manual',
    target: 'manual',
    title: '막히면 설명서를 본다',
    body: '"설명서"를 누르면 도구와 단계 설명이 한 화면에 정리되어 나온다. "따라하기"를 누르면 이 안내가 다시 시작된다.',
    place: 'bottom',
  },
];

export const TUTORIALS: Record<LevelKey, CoachStep[]> = {
  elementary: ELEMENTARY,
  secondary: SECONDARY,
};

export function tutorialFor(level: LevelKey): CoachStep[] {
  return TUTORIALS[level] ?? SECONDARY;
}

/** 이 안내가 이미 할 일을 마친 상태인지 */
export function isDone(s: CoachStep, c: CoachContext): boolean {
  return s.done ? s.done(c) : false;
}

/** 넘어갈 수 있는지 — 손을 잡아 주는 대목은 마쳐야 넘어간다 */
export function canAdvance(s: CoachStep, c: CoachContext): boolean {
  if (!s.wait) return true;
  return isDone(s, c);
}

/* ------------------------------------------------------------------ */
/* 사용 설명서 — 단계·도구 목록에서 직접 만들어 낸다                     */
/* ------------------------------------------------------------------ */

export interface ManualItem {
  label: string;
  text: string;
  /** 단축키 */
  key?: string;
}

export interface ManualSection {
  id: string;
  title: string;
  intro?: string;
  items: ManualItem[];
}

/** 자유 그리기 몸짓 — 화면의 안내 그림과 같은 내용 */
export const GESTURES: ManualItem[] = [
  { label: '닫힌 모양을 그리면', text: '방이 된다. ㄱ자·ㄷ자로 그려도 사각형 여러 개로 나눠 받는다.' },
  { label: '방을 가로질러 그으면', text: '그 자리에 벽이 서고 방이 둘로 나뉜다.' },
  { label: '벽을 따라 짧게 그으면', text: '문이나 창이 된다. 그은 길이가 그대로 폭이 된다.' },
];

export const SHORTCUTS: ManualItem[] = [
  { label: '실행 취소', text: '잘못했으면 언제든 되돌린다. 80번까지 된다.', key: 'Ctrl+Z' },
  { label: '다시 실행', text: '되돌린 것을 다시 한다.', key: 'Ctrl+Shift+Z' },
  { label: '지우기', text: '고른 것을 지운다. 도면 위 "지우기" 단추와 같다.', key: 'Delete' },
  { label: '화면 이동', text: '스페이스를 누른 채 끌면 도면이 따라 움직인다.', key: 'Space' },
  { label: '확대·축소', text: '마우스 휠을 굴린다. 오른쪽 아래 +, − 단추와 같다.', key: '휠' },
  { label: '도면 전체 보기', text: '도면을 화면 한가운데 꽉 차게 맞춘다.', key: '0' },
  { label: '이전·다음 단계', text: '단계를 앞뒤로 옮긴다.', key: '[  ]' },
  { label: '인쇄', text: 'A4 피난안내도를 뽑는다.', key: 'Ctrl+P' },
];

/**
 * 설명서 내용.
 * 도구와 단계는 실제 목록에서 만들어 내므로, 기능이 바뀌면 설명서도 함께 바뀐다.
 */
export function manualSections(level: LevelKey): ManualSection[] {
  const easy = level === 'elementary';
  return [
    {
      id: 'what',
      title: easy ? '무엇을 하는 곳인가' : '이 도구가 하는 일',
      intro: easy
        ? '불이 났을 때 우리 집에서 어디로 어떻게 나갈지 그려 보는 곳이다. 다 그리면 종이 한 장으로 뽑아서 집에 붙여 둔다.'
        : '공동주택 세대의 평면을 작성하고 피난시설·동선을 표기한 뒤, 연기 확산을 해석해 A4 피난안내도로 출력한다. 모든 처리는 이 컴퓨터 안에서만 이뤄지며 서버로 전송하지 않는다.',
      items: [],
    },
    {
      id: 'steps',
      title: `${STEPS.length}단계로 진행한다`,
      intro: easy ? '위쪽 번호를 왼쪽부터 차례로 누르면 된다.' : undefined,
      items: STEPS.map((s) => ({ label: `${s.no} ${s.title}`, text: s.guide })),
    },
    {
      id: 'sketch',
      title: '자유 그리기 — 삐뚤빼뚤 그려도 반듯해진다',
      intro: '마우스로 끄는 동안에는 손그림 그대로 보이다가, 손을 떼는 순간 반듯한 직선으로 펴진다.',
      items: GESTURES,
    },
    {
      id: 'tools',
      title: '도구',
      intro: easy ? '왼쪽에 있는 단추들이다.' : '왼쪽 도구 막대. 괄호 안은 단축키다.',
      items: TOOLS.map((t) => ({ label: t.label, text: t.hint, key: t.shortcut })),
    },
    {
      id: 'fix',
      title: '고치고 지우기',
      items: [
        { label: '고르기', text: '고르기 도구로 무엇이든 한 번 누른다. 도면 위에 무엇을 골랐는지 이름표가 뜬다.' },
        { label: '지우기', text: '이름표에 있는 "지우기"를 누르거나 Delete 키를 누른다.', key: 'Delete' },
        { label: '옮기기', text: '고른 것을 그대로 끌면 옮겨진다. 방은 모서리를 끌어 크기를 바꾼다.' },
        { label: '되돌리기', text: '무엇을 하든 되돌릴 수 있으니 마음껏 해 본다.', key: 'Ctrl+Z' },
        { label: '처음부터', text: '위쪽 "처음부터"를 누르면 싹 지우고 새로 시작한다.' },
      ],
    },
    {
      id: 'keys',
      title: '단축키',
      items: SHORTCUTS,
    },
    {
      id: 'safe',
      title: '알아 둘 것',
      items: [
        {
          label: '교육용 근사 모델',
          text: '연기 확산 해석은 소방 교육자료의 눈높이 수치를 쓴 근사값이다. 실제 화재 예측이 아니며 법정 피난안내도를 대신하지 않는다.',
        },
        {
          label: '개인정보',
          text: '동·호수, 올린 도면, 작성한 계획은 이 컴퓨터 밖으로 나가지 않는다. 공용 컴퓨터라면 09단계에서 저장 내용을 지운다.',
        },
      ],
    },
  ];
}
