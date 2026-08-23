/**
 * 의사결정형 대피 훈련 상태 기계.
 *
 * 행동을 하나 고를 때마다 시간이 흐르고, 그 시각의 연기 농도 × 노출 시간이
 * 신체 상태에 누적된다. 자세 낮추기·호흡 보호·문 폐쇄의 보호 효과를 반영하고,
 * 종료 시 등급(A~D)과 판단 이력을 제시한다.
 */
import { Grid, cellAt, cellCenter, nearestWalkable } from './grid';
import { SmokeField, densityAt, getCause, simulate } from './firesim';
import { distanceField, exitPoints, simplifyPath, tracePath } from './routing';
import { Plan, Pt, WALK_SPEED, WalkerKind, roomCenter } from './types';

export type ActionKey =
  | 'assess'
  | 'alertFamily'
  | 'call119'
  | 'lowPosture'
  | 'coverMouth'
  | 'checkDoor'
  | 'closeDoor'
  | 'extinguish'
  | 'moveEntrance'
  | 'moveRefuge'
  | 'moveBalcony'
  | 'openWindow'
  | 'signal'
  | 'stayShelter'
  | 'goBack';

export interface ActionDef {
  key: ActionKey;
  label: string;
  detail: string;
  /** 기본 소요 시간(s) */
  seconds: number;
  /** 판단 점수 가중 (+ 권장, - 위험) */
  merit: number;
  group: '인지' | '보호' | '이동' | '종료';
}

export const ACTIONS: ActionDef[] = [
  { key: 'assess', label: '상황 확인', detail: '연기 냄새·경보의 원인을 눈으로 확인한다.', seconds: 12, merit: 2, group: '인지' },
  { key: 'alertFamily', label: '가족에게 알림', detail: '큰 소리로 불이 났음을 알려 함께 대피한다.', seconds: 8, merit: 8, group: '인지' },
  { key: 'call119', label: '119 신고', detail: '주소·동호수·상황을 알린다. 대피하면서 신고해도 된다.', seconds: 20, merit: 8, group: '인지' },
  { key: 'checkDoor', label: '문 손등으로 확인', detail: '문고리·문틈에 손등을 대어 열기를 확인한 뒤 연다.', seconds: 6, merit: 7, group: '보호' },
  { key: 'lowPosture', label: '자세 낮추기', detail: '연기는 위로 오른다. 낮은 자세는 노출을 크게 줄인다.', seconds: 3, merit: 10, group: '보호' },
  { key: 'coverMouth', label: '젖은 수건으로 호흡 보호', detail: '코·입을 막아 유독가스 흡입을 줄인다.', seconds: 14, merit: 7, group: '보호' },
  { key: 'closeDoor', label: '지나온 문 닫기', detail: '문 하나가 연기 확산을 크게 늦춘다.', seconds: 5, merit: 10, group: '보호' },
  { key: 'extinguish', label: '소화기로 초기 진화', detail: '초기(발화 1분 이내)·본인 대피로가 확보된 때만 시도한다.', seconds: 35, merit: 0, group: '보호' },
  { key: 'moveEntrance', label: '현관으로 이동', detail: '세대 밖으로 나가 계단으로 대피한다.', seconds: 0, merit: 6, group: '이동' },
  { key: 'moveRefuge', label: '대피공간·피난구로 이동', detail: '현관 방향이 막혔을 때의 대체 수단이다.', seconds: 0, merit: 6, group: '이동' },
  { key: 'moveBalcony', label: '발코니로 이동', detail: '문을 닫고 외기에 접한 곳에서 구조를 기다린다.', seconds: 0, merit: 4, group: '이동' },
  { key: 'openWindow', label: '창문 열어 신선한 공기 확보', detail: '연기가 유입되지 않는 쪽 창만 연다.', seconds: 8, merit: 3, group: '보호' },
  { key: 'signal', label: '구조 요청 신호', detail: '밝은 천을 흔들어 위치를 알린다.', seconds: 10, merit: 6, group: '종료' },
  { key: 'stayShelter', label: '이 자리에서 구조 대기', detail: '문을 닫고 틈을 막은 뒤 기다린다.', seconds: 0, merit: 0, group: '종료' },
  { key: 'goBack', label: '두고 온 물건 가지러 가기', detail: '어떤 경우에도 되돌아가지 않는다.', seconds: 0, merit: -25, group: '이동' },
];

export function actionDef(key: ActionKey): ActionDef {
  const a = ACTIONS.find((x) => x.key === key);
  if (!a) throw new Error(`알 수 없는 행동: ${key}`);
  return a;
}

export interface ScenarioSetup {
  /** 발화 지점 */
  origin: Pt;
  /** 발화 원인 키 */
  cause: string;
  /** 재실자 시작 실 id */
  startRoom: string;
  walker: WalkerKind;
  /** 야간 여부 — 인지 지연 */
  night: boolean;
}

export interface LogEntry {
  t: number;
  action: ActionKey;
  label: string;
  seconds: number;
  /** 이 행동 중 받은 노출량 */
  dose: number;
  note: string;
}

export type Outcome = 'escaped' | 'sheltered' | 'incapacitated' | 'timeout' | 'ongoing';

export interface ScenarioState {
  setup: ScenarioSetup;
  field: SmokeField;
  /** 경과 시각(s) */
  t: number;
  pos: Pt;
  /** 체력 0~100 */
  hp: number;
  dose: number;
  low: boolean;
  covered: boolean;
  closedDoors: string[];
  calledFire: boolean;
  alerted: boolean;
  checkedDoor: boolean;
  usedExtinguisher: boolean;
  wentBack: boolean;
  atShelter: boolean;
  path: Pt[];
  log: LogEntry[];
  outcome: Outcome;
  /** 마지막 안내 문구 */
  message: string;
}

/** 발화 인지까지 걸리는 시간 — 야간에는 크게 늘어난다 */
export function recognitionDelay(setup: ScenarioSetup): number {
  return setup.night ? 55 : 20;
}

const HP_PER_DOSE = 1.6;
/** 자세를 낮췄을 때의 보행속도 배수 */
export const LOW_POSTURE_SPEED = 0.7;
/** 자세 낮추기의 노출 저감 배수 */
export const LOW_POSTURE_FACTOR = 0.45;
/** 호흡 보호의 노출 저감 배수 */
export const COVER_FACTOR = 0.6;

function postureFactor(s: ScenarioState): number {
  let f = 1;
  if (s.low) f *= LOW_POSTURE_FACTOR;
  if (s.covered) f *= COVER_FACTOR;
  return f;
}

function densityAtPoint(field: SmokeField, g: Grid, p: Pt, t: number): number {
  const i = cellAt(g, p.x, p.y);
  if (i < 0 || !g.walk[i]) return 0;
  return densityAt(field, i, t);
}

export function startScenario(plan: Plan, g: Grid, setup: ScenarioSetup): ScenarioState {
  const field = simulate(plan, g, setup.origin, setup.cause);
  const room = plan.rooms.find((r) => r.id === setup.startRoom) ?? plan.rooms[0];
  const pos = room ? roomCenter(room) : { x: 0, y: 0 };
  const t = recognitionDelay(setup);
  const state: ScenarioState = {
    setup,
    field,
    t: 0,
    pos,
    hp: 100,
    dose: 0,
    low: false,
    covered: false,
    closedDoors: [],
    calledFire: false,
    alerted: false,
    checkedDoor: false,
    usedExtinguisher: false,
    wentBack: false,
    atShelter: false,
    path: [pos],
    log: [],
    outcome: 'ongoing',
    message: setup.night
      ? '한밤중 연기 냄새에 잠에서 깼다. 무엇부터 하겠는가?'
      : '연기감지기가 울린다. 무엇부터 하겠는가?',
  };
  // 인지 지연 동안의 노출을 먼저 반영한다
  applyExposure(state, g, t, '인지 지연');
  return state;
}

function applyExposure(s: ScenarioState, g: Grid, seconds: number, note: string): number {
  if (seconds <= 0) return 0;
  const steps = Math.max(1, Math.ceil(seconds / 2));
  let dose = 0;
  for (let k = 0; k < steps; k += 1) {
    const dt = seconds / steps;
    const tm = s.t + (k + 0.5) * dt;
    dose += densityAtPoint(s.field, g, s.pos, tm) * dt;
  }
  dose *= postureFactor(s);
  s.dose += dose;
  s.t += seconds;
  s.hp = Math.max(0, 100 - s.dose * HP_PER_DOSE);
  if (s.hp <= 0 && s.outcome === 'ongoing') {
    s.outcome = 'incapacitated';
    s.message = `${note} 중 유독가스 노출이 한계를 넘었다.`;
  }
  return dose;
}

/** 현재 위치에서 목표 지점까지 이동 — 경로를 따라가며 시간·노출을 누적 */
function moveTo(
  s: ScenarioState,
  plan: Plan,
  g: Grid,
  target: Pt,
): { ok: boolean; seconds: number; dose: number; pts: Pt[] } {
  const goal = nearestWalkable(g, target.x, target.y);
  const from = nearestWalkable(g, s.pos.x, s.pos.y);
  if (goal < 0 || from < 0) return { ok: false, seconds: 0, dose: 0, pts: [] };
  const field = distanceField(g, [goal]);
  const cells = tracePath(g, field, from);
  if (cells.length === 0) return { ok: false, seconds: 0, dose: 0, pts: [] };
  const pts = simplifyPath(g, cells);
  if (pts.length === 0) return { ok: false, seconds: 0, dose: 0, pts: [] };
  // 자세를 낮추면 느려지지만(0.7배), 노출 저감(0.45배)이 훨씬 커서 순효과는 이득이다
  const speed = WALK_SPEED[s.setup.walker] * (s.low ? LOW_POSTURE_SPEED : 1);
  let dose = 0;
  let seconds = 0;
  let prev = s.pos;
  const pf = postureFactor(s);
  for (const p of pts) {
    const dm = Math.hypot(p.x - prev.x, p.y - prev.y) / 100;
    const dt = dm / speed;
    const steps = Math.max(1, Math.ceil(dt / 2));
    for (let k = 0; k < steps; k += 1) {
      const f = (k + 0.5) / steps;
      const mid = { x: prev.x + (p.x - prev.x) * f, y: prev.y + (p.y - prev.y) * f };
      dose += densityAtPoint(s.field, g, mid, s.t + seconds + (dt * (k + 0.5)) / steps) * (dt / steps);
    }
    seconds += dt;
    prev = p;
  }
  dose *= pf;
  s.t += seconds;
  s.dose += dose;
  s.hp = Math.max(0, 100 - s.dose * HP_PER_DOSE);
  s.pos = pts[pts.length - 1];
  s.path = s.path.concat(pts);
  return { ok: true, seconds, dose, pts };
}

/** 현재 지점에서 가장 가까운 문 (닫기 대상) */
function nearestDoorId(plan: Plan, p: Pt): string | null {
  let best: string | null = null;
  let bd = Infinity;
  for (const d of plan.doors) {
    const dist = Math.hypot(d.x - p.x, d.y - p.y);
    if (dist < bd) {
      bd = dist;
      best = d.id;
    }
  }
  return bd < 400 ? best : null;
}

export function availableActions(plan: Plan, s: ScenarioState): ActionKey[] {
  if (s.outcome !== 'ongoing') return [];
  const out: ActionKey[] = [];
  if (!s.alerted) out.push('alertFamily');
  if (!s.calledFire) out.push('call119');
  if (s.log.length === 0) out.push('assess');
  if (!s.low) out.push('lowPosture');
  if (!s.covered) out.push('coverMouth');
  if (!s.checkedDoor) out.push('checkDoor');
  if (nearestDoorId(plan, s.pos)) out.push('closeDoor');
  if (!s.usedExtinguisher && s.t < 120) out.push('extinguish');
  out.push('moveEntrance');
  if (plan.facilities.some((f) => f.type === 'refuge' || f.type === 'partition' || f.type === 'downladder')) {
    out.push('moveRefuge');
  }
  if (plan.rooms.some((r) => r.kind === 'balcony')) out.push('moveBalcony');
  if (s.atShelter) {
    out.push('openWindow');
    out.push('signal');
    out.push('stayShelter');
  }
  out.push('goBack');
  return out;
}

export function applyAction(plan: Plan, g: Grid, prev: ScenarioState, key: ActionKey): ScenarioState {
  const s: ScenarioState = {
    ...prev,
    closedDoors: prev.closedDoors.slice(),
    path: prev.path.slice(),
    log: prev.log.slice(),
  };
  if (s.outcome !== 'ongoing') return s;
  const def = actionDef(key);
  const t0 = s.t;
  let note = '';
  let dose = 0;
  let seconds = def.seconds;

  switch (key) {
    case 'assess': {
      dose = applyExposure(s, g, def.seconds, '상황 확인');
      note = '발화 위치와 연기 방향을 확인했다.';
      break;
    }
    case 'alertFamily': {
      s.alerted = true;
      dose = applyExposure(s, g, def.seconds, '가족 알림');
      note = '가족이 함께 대피 준비를 시작했다.';
      break;
    }
    case 'call119': {
      s.calledFire = true;
      dose = applyExposure(s, g, def.seconds, '119 신고');
      note = '신고를 마쳤다. 대피를 계속하면서 통화해도 된다.';
      break;
    }
    case 'lowPosture': {
      s.low = true;
      dose = applyExposure(s, g, def.seconds, '자세 낮추기');
      note = '연기층 아래로 자세를 낮췄다. 노출이 크게 줄어든다.';
      break;
    }
    case 'coverMouth': {
      s.covered = true;
      dose = applyExposure(s, g, def.seconds, '호흡 보호');
      note = '젖은 수건으로 코와 입을 막았다.';
      break;
    }
    case 'checkDoor': {
      s.checkedDoor = true;
      dose = applyExposure(s, g, def.seconds, '문 확인');
      const near = nearestDoorId(plan, s.pos);
      const hot = near ? isDoorHot(s, g, plan, near) : false;
      note = hot
        ? '문이 뜨겁다. 이 문은 열지 말고 다른 경로를 찾아야 한다.'
        : '문이 차갑다. 조심히 열어 진행할 수 있다.';
      break;
    }
    case 'closeDoor': {
      const id = nearestDoorId(plan, s.pos);
      if (id && !s.closedDoors.includes(id)) {
        s.closedDoors.push(id);
        s.field = simulate(plan, g, s.setup.origin, s.setup.cause, s.closedDoors);
        note = '문을 닫아 연기 확산을 늦췄다.';
      } else {
        note = '닫을 문이 없다.';
      }
      dose = applyExposure(s, g, def.seconds, '문 닫기');
      break;
    }
    case 'extinguish': {
      s.usedExtinguisher = true;
      const near = distanceToOrigin(s);
      dose = applyExposure(s, g, def.seconds, '초기 진화');
      if (s.t - def.seconds < 90 && near < 600) {
        note = '초기라 진화에 성공했다. 그래도 119 신고와 환기가 필요하다.';
      } else {
        note = '이미 확대된 화재다. 진화에 실패하고 시간과 노출만 늘었다.';
      }
      break;
    }
    case 'moveEntrance':
    case 'moveRefuge':
    case 'moveBalcony': {
      const target = pickTarget(plan, g, s, key);
      if (!target) {
        note = '이동할 목표가 없다.';
        break;
      }
      const m = moveTo(s, plan, g, target);
      seconds = m.seconds;
      dose = m.dose;
      if (!m.ok) {
        note = '경로를 찾지 못했다.';
        break;
      }
      if (key === 'moveEntrance') {
        s.outcome = s.hp > 0 ? 'escaped' : 'incapacitated';
        note = s.hp > 0 ? '현관을 통해 세대 밖으로 나왔다. 계단으로 대피한다.' : '현관에 이르기 전 쓰러졌다.';
      } else {
        s.atShelter = true;
        note = key === 'moveRefuge' ? '피난설비가 있는 곳에 도착했다.' : '발코니로 이동했다.';
      }
      break;
    }
    case 'openWindow': {
      dose = applyExposure(s, g, def.seconds, '창문 개방');
      note = '연기가 들어오지 않는 쪽 창을 열어 공기를 확보했다.';
      break;
    }
    case 'signal': {
      dose = applyExposure(s, g, def.seconds, '구조 신호');
      note = '밝은 천을 흔들어 위치를 알렸다.';
      break;
    }
    case 'stayShelter': {
      s.outcome = s.hp > 0 ? 'sheltered' : 'incapacitated';
      note = '문을 닫고 틈을 막은 뒤 구조를 기다린다.';
      break;
    }
    case 'goBack': {
      s.wentBack = true;
      const room = plan.rooms.find((r) => r.id === s.setup.startRoom);
      if (room) {
        const m = moveTo(s, plan, g, roomCenter(room));
        seconds = m.seconds;
        dose = m.dose;
      }
      note = '되돌아갔다. 대피 시간이 늘고 노출이 커졌다.';
      break;
    }
    default:
      break;
  }

  if (s.hp <= 0 && s.outcome === 'ongoing') s.outcome = 'incapacitated';
  if (s.t > 900 && s.outcome === 'ongoing') s.outcome = 'timeout';

  s.log.push({
    t: Math.round(t0),
    action: key,
    label: def.label,
    seconds: Math.round(seconds),
    dose: Math.round(dose * 100) / 100,
    note,
  });
  s.message = note || def.detail;
  return s;
}

function distanceToOrigin(s: ScenarioState): number {
  return Math.hypot(s.pos.x - s.field.origin.x, s.pos.y - s.field.origin.y);
}

function isDoorHot(s: ScenarioState, g: Grid, plan: Plan, doorId: string): boolean {
  const d = plan.doors.find((x) => x.id === doorId);
  if (!d) return false;
  const i = cellAt(g, d.x, d.y);
  if (i < 0) return false;
  return s.field.flame[i] <= s.t + 60 || s.field.smoke[i] <= s.t - 30;
}

function pickTarget(plan: Plan, g: Grid, s: ScenarioState, key: ActionKey): Pt | null {
  if (key === 'moveEntrance') {
    const ex = exitPoints(plan, g).find((e) => e.kind === 'entrance');
    return ex ? { x: ex.x, y: ex.y } : null;
  }
  if (key === 'moveRefuge') {
    const ex = exitPoints(plan, g).filter((e) => e.kind !== 'entrance');
    if (ex.length === 0) return null;
    let best = ex[0];
    let bd = Infinity;
    for (const e of ex) {
      const d = Math.hypot(e.x - s.pos.x, e.y - s.pos.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return { x: best.x, y: best.y };
  }
  const balconies = plan.rooms.filter((r) => r.kind === 'balcony');
  if (balconies.length === 0) return null;
  let best = balconies[0];
  let bd = Infinity;
  for (const r of balconies) {
    const c = roomCenter(r);
    const d = Math.hypot(c.x - s.pos.x, c.y - s.pos.y);
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  return roomCenter(best);
}

export interface Evaluation {
  grade: 'A' | 'B' | 'C' | 'D';
  score: number;
  hpScore: number;
  timeScore: number;
  decisionScore: number;
  outcome: Outcome;
  outcomeLabel: string;
  highlights: string[];
  reviews: string[];
}

export function evaluate(s: ScenarioState): Evaluation {
  const hpScore = Math.max(0, Math.min(100, s.hp));
  const timeScore = Math.max(0, Math.min(100, 100 - Math.max(0, s.t - 90) / 3));
  let decision = 50;
  const highlights: string[] = [];
  const reviews: string[] = [];

  if (s.low) {
    decision += 12;
    highlights.push('자세를 낮춰 유독가스 노출을 줄였다.');
  } else {
    reviews.push('자세를 낮추지 않았다. 연기는 천장부터 쌓이므로 낮은 자세가 생존율을 크게 높인다.');
  }
  if (s.covered) {
    decision += 8;
    highlights.push('호흡을 보호했다.');
  } else {
    reviews.push('코와 입을 보호하지 않았다. 젖은 수건이 없으면 옷깃으로라도 막는다.');
  }
  if (s.closedDoors.length > 0) {
    decision += 12;
    highlights.push(`문 ${s.closedDoors.length}개를 닫아 연기 확산을 늦췄다.`);
  } else {
    reviews.push('지나온 문을 닫지 않았다. 문 하나가 연기 확산을 수십 초 늦춘다.');
  }
  if (s.calledFire) {
    decision += 10;
    highlights.push('119에 신고했다.');
  } else {
    reviews.push('119 신고를 하지 않았다. 대피하면서 신고해도 늦지 않다.');
  }
  if (s.alerted) {
    decision += 8;
    highlights.push('가족에게 화재를 알렸다.');
  } else {
    reviews.push('가족에게 알리지 않았다. 함께 사는 사람의 인지가 늦어진다.');
  }
  if (s.checkedDoor) {
    decision += 6;
    highlights.push('문을 열기 전 열기를 확인했다.');
  }
  if (s.wentBack) {
    decision -= 30;
    reviews.push('물건을 가지러 되돌아갔다. 어떤 경우에도 되돌아가지 않는다.');
  }
  if (s.usedExtinguisher && s.t > 150) {
    decision -= 10;
    reviews.push('확대된 화재에 소화기를 시도했다. 초기(1분 이내)가 아니면 즉시 대피가 우선이다.');
  }
  decision = Math.max(0, Math.min(100, decision));

  const outcomeLabel =
    s.outcome === 'escaped'
      ? '세대 밖 대피 성공'
      : s.outcome === 'sheltered'
        ? '세대 내 구조 대기'
        : s.outcome === 'incapacitated'
          ? '유독가스 노출로 행동 불능'
          : s.outcome === 'timeout'
            ? '시간 초과'
            : '진행 중';

  let score = hpScore * 0.4 + timeScore * 0.25 + decision * 0.35;
  if (s.outcome === 'incapacitated' || s.outcome === 'timeout') score = Math.min(score, 40);
  if (s.outcome === 'sheltered') score = Math.min(score, 88);

  const grade: Evaluation['grade'] = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D';

  if (s.outcome === 'escaped' && s.t <= 120) highlights.push(`발화 ${Math.round(s.t)}초 만에 세대를 벗어났다.`);
  if (s.outcome === 'incapacitated') reviews.push('노출 누적이 한계를 넘었다. 인지 직후 곧바로 낮은 자세로 이동해야 한다.');

  return {
    grade,
    score: Math.round(score),
    hpScore: Math.round(hpScore),
    timeScore: Math.round(timeScore),
    decisionScore: Math.round(decision),
    outcome: s.outcome,
    outcomeLabel,
    highlights,
    reviews,
  };
}

/** 훈련 요약 — 산출물·화면 공용 */
export function summarize(s: ScenarioState): string {
  const cause = getCause(s.setup.cause);
  return `${cause.label} 발화 · ${s.setup.night ? '야간' : '주간'} · 경과 ${Math.round(s.t)}초 · 체력 ${Math.round(s.hp)}`;
}

/** 훈련 경로의 셀 좌표 (도면 표시용) */
export function pathCells(g: Grid, s: ScenarioState): Pt[] {
  return s.path.map((p) => {
    const i = cellAt(g, p.x, p.y);
    return i >= 0 ? cellCenter(g, i) : p;
  });
}
