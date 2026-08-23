/**
 * 콘텐츠 · 자동 점검 규칙.
 *
 * 법령 인용, 통계, 위험요소 자료, 행동 절차 문안을 이 파일 한 곳에 모았다.
 * 법령이 개정되면 이 파일만 검토·갱신하면 되도록 화면 코드와 분리한다.
 * (연 1회 정기 검토 권장)
 */
import { Grid, cellAt, connected, nearestWalkable } from './grid';
import { exitPoints, routableRooms, routeMetric } from './routing';
import { Plan, Room, roomCenter } from './types';

/* ------------------------------------------------------------------ */
/* 통계·근거                                                           */
/* ------------------------------------------------------------------ */

export interface Fact {
  value: string;
  label: string;
  source: string;
}

export const FACTS: Fact[] = [
  {
    value: '77.9%',
    label: '공동주택 화재 사망자 중 연기·유독가스 관련 비율',
    source: '한국소방안전원, 「공동주택 화재로 인한 사망자의 인적특성」',
  },
  {
    value: '61.6%',
    label: '야간(19시–07시) 발생 사망 비율',
    source: '한국소방안전원, 같은 자료',
  },
  {
    value: '4.8%',
    label: '피난 중 추락 사망 비율',
    source: '한국소방안전원, 같은 자료',
  },
];

export const DISCLAIMER =
  '본 도면의 확산 해석은 소방 교육자료에서 통용되는 눈높이 수치를 채택한 교육용 근사 모델이며, 성능위주설계(FDS 등) 해석을 대체하지 않는다. 또한 법정 피난안내도를 대체하지 않는다.';

export const LAWS = [
  {
    title: '공동주택의 화재안전성능기준(NFPC 608)',
    body: '세대·공용부 소화기구, 세대 내 거실 연기감지기, 세대별 피난기구 설치 기준을 정한다.',
  },
  {
    title: '건축법 시행령 제46조',
    body: '아파트 4층 이상 세대의 대피공간, 경량구조 경계벽(경량칸막이), 하향식 피난구 등 대체 수단을 정한다.',
  },
];

/* ------------------------------------------------------------------ */
/* 사용승인 연도별 세대 피난시설                                        */
/* ------------------------------------------------------------------ */

export interface EraGuide {
  key: string;
  range: string;
  title: string;
  expected: ('partition' | 'refuge' | 'downladder' | 'none')[];
  body: string;
  caution: string;
}

export const ERA_GUIDES: EraGuide[] = [
  {
    key: 'pre1992',
    range: '~ 1992년',
    title: '세대 피난시설 규정 이전',
    expected: ['none'],
    body: '세대 내 별도 피난시설이 없을 가능성이 높다. 현관 단일 동선을 전제로 대피계획을 세우고, 현관이 막혔을 때 머무를 곳(외기에 접한 발코니 등)을 미리 정해 둔다.',
    caution: '완강기 등 공용 피난기구 위치를 관리사무소에 확인한다.',
  },
  {
    key: 'y1992',
    range: '1992년 ~ 2005년',
    title: '경량칸막이 시기',
    expected: ['partition'],
    body: '발코니 세대 경계벽이 파괴하기 쉬운 경량구조(경량칸막이)로 시공된 시기다. 옆 세대로 피난할 수 있다.',
    caution: '경량칸막이 앞에 붙박이장·수납장·에어컨 실외기를 두면 무용지물이 된다. 표시 스티커 위치를 확인한다.',
  },
  {
    key: 'y2005',
    range: '2005년 ~ 2010년',
    title: '대피공간 시기',
    expected: ['refuge', 'partition'],
    body: '발코니 확장이 허용되면서, 확장 세대는 2㎡ 이상의 대피공간(방화문·내화구조)을 두도록 했다.',
    caution: '대피공간이 창고로 쓰이면 피난이 불가능하다. 비워 두어야 한다.',
  },
  {
    key: 'y2010',
    range: '2010년 이후',
    title: '선택 적용 시기',
    expected: ['refuge', 'partition', 'downladder'],
    body: '대피공간·경량칸막이·하향식 피난구(발코니 바닥 피난구) 중 하나를 갖추도록 했다. 세대마다 다르므로 우리 집이 무엇인지 확인해야 한다.',
    caution: '하향식 피난구는 덮개 위에 물건을 올려 두면 열 수 없다. 사다리 작동을 한 번 확인해 둔다.',
  },
];

export function eraFor(year: number): EraGuide {
  if (year < 1992) return ERA_GUIDES[0];
  if (year < 2005) return ERA_GUIDES[1];
  if (year < 2010) return ERA_GUIDES[2];
  return ERA_GUIDES[3];
}

/* ------------------------------------------------------------------ */
/* 위험요소 자료실                                                     */
/* ------------------------------------------------------------------ */

export interface Hazard {
  id: string;
  title: string;
  where: string;
  why: string;
  fix: string;
  severity: 'high' | 'mid';
}

export const HAZARDS: Hazard[] = [
  {
    id: 'stack-corridor',
    title: '복도·계단 적치물',
    where: '공용 복도, 계단참, 피난계단 앞',
    why: '피난 폭이 좁아지고, 타면서 연기와 유독가스를 더한다. 어두운 복도에서는 걸려 넘어지는 원인이 된다.',
    fix: '자전거·유모차·폐가구를 지정 장소로 옮긴다. 소방시설 앞 1.5m 이내에는 아무것도 두지 않는다.',
    severity: 'high',
  },
  {
    id: 'firedoor-open',
    title: '방화문 상시 개방',
    where: '계단실 출입문, 세대 현관 앞 방화문',
    why: '방화문이 열려 있으면 계단실이 굴뚝이 되어 연기가 위층으로 빠르게 올라간다.',
    fix: '고임목·끈을 제거한다. 통풍이 필요하면 도어클로저에 연동된 자동 폐쇄 장치를 설치한다.',
    severity: 'high',
  },
  {
    id: 'battery',
    title: '리튬이온 배터리 실내 충전',
    where: '현관, 거실, 발코니',
    why: '열폭주가 시작되면 수십 초 만에 화염이 확대되고 소화기로 진화하기 어렵다. 피난로 위에서 발화하면 탈출로가 곧바로 막힌다.',
    fix: '충전은 현관 밖·전용 충전 구역에서, 취침 중 충전은 하지 않는다. 부풀거나 냄새가 나면 즉시 사용을 중지한다.',
    severity: 'high',
  },
  {
    id: 'outlet',
    title: '문어발 콘센트·손상된 전선',
    where: 'TV장 뒤, 침대 밑, 주방 후면',
    why: '접촉 불량과 과부하로 스파크가 생기고, 가구 뒤에서 발화하면 인지가 늦다.',
    fix: '멀티탭 직렬 연결을 없애고, 가구에 눌린 전선을 정리한다. 먼지를 주기적으로 닦는다.',
    severity: 'mid',
  },
  {
    id: 'oil-water',
    title: '식용유 화재에 물 붓기',
    where: '주방',
    why: '기름 온도가 물의 끓는점보다 훨씬 높아 순간적으로 수증기 폭발이 일어나 불길이 천장까지 솟는다.',
    fix: '뚜껑·젖은 행주로 덮어 산소를 차단하거나 K급 소화기를 쓴다. 주방에는 K급 소화기를 둔다.',
    severity: 'high',
  },
  {
    id: 'refuge-store',
    title: '대피공간의 창고화',
    where: '발코니 대피공간',
    why: '가장 안전해야 할 공간이 가연물 창고가 된다. 문이 열리지 않으면 대피 자체가 불가능하다.',
    fix: '대피공간은 항상 비워 둔다. 문 앞에 물건을 쌓지 않는다.',
    severity: 'high',
  },
  {
    id: 'partition-block',
    title: '경량칸막이 앞 가림',
    where: '발코니 세대 경계벽',
    why: '붙박이장·수납장·실외기에 가려 파괴 위치를 찾지 못하거나 접근하지 못한다.',
    fix: '표시 스티커 위치를 확인하고 앞을 비운다. 가족 모두에게 위치를 알린다.',
    severity: 'high',
  },
  {
    id: 'detector-off',
    title: '연기감지기 분리·건전지 제거',
    where: '거실, 침실 천장',
    why: '조리 연기 오작동을 이유로 떼어 두면 야간 화재를 알아채지 못한다. 야간 사망이 전체의 절반을 넘는다.',
    fix: '떼지 말고 위치를 옮긴다. 6개월마다 시험 버튼을 눌러 작동을 확인한다.',
    severity: 'high',
  },
  {
    id: 'ext-bad',
    title: '소화기 관리 불량',
    where: '세대 현관, 주방',
    why: '압력이 빠졌거나 노후한 소화기는 초기 진화에 실패한다. 어디 있는지 모르면 없는 것과 같다.',
    fix: '압력계 바늘이 녹색 범위인지 월 1회 확인하고, 10년이 지난 분말소화기는 교체한다. 가족 모두가 위치를 안다.',
    severity: 'mid',
  },
  {
    id: 'entry-block',
    title: '현관 앞 적치',
    where: '세대 현관 안팎',
    why: '유일한 주 피난로의 시작점이 좁아진다. 어두울 때 넘어지면 탈출 시간이 크게 늘어난다.',
    fix: '신발장 밖 물건을 정리하고 현관문 유효 폭을 확보한다.',
    severity: 'mid',
  },
];

/* ------------------------------------------------------------------ */
/* 피난 행동 절차                                                      */
/* ------------------------------------------------------------------ */

export interface ProcedureStep {
  no: number;
  title: string;
  body: string;
}

export const PROCEDURE: ProcedureStep[] = [
  { no: 1, title: '알린다', body: '“불이야” 외치고 비상벨을 누른다. 자고 있는 가족을 깨운다.' },
  { no: 2, title: '확인한다', body: '문을 열기 전 손등으로 문고리와 문틈의 열기를 확인한다. 뜨거우면 열지 않는다.' },
  { no: 3, title: '낮춘다', body: '연기는 천장부터 쌓인다. 자세를 낮추고 코와 입을 젖은 수건으로 막는다.' },
  { no: 4, title: '닫는다', body: '지나온 문을 닫는다. 문 하나가 연기 확산을 수십 초 늦춘다.' },
  { no: 5, title: '나간다', body: '계단으로 대피한다. 승강기는 절대 타지 않는다. 되돌아가지 않는다.' },
  { no: 6, title: '머문다', body: '대피로가 막혔으면 대피공간·경량칸막이·하향식 피난구를 이용하거나, 외기에 접한 곳에서 문틈을 막고 구조를 기다린다.' },
  { no: 7, title: '신고한다', body: '119에 단지명·동·호수와 갇힌 위치를 알린다. 대피하면서 신고해도 된다.' },
  { no: 8, title: '모인다', body: '미리 정한 집결지에서 가족 인원을 확인한다.' },
];

export const CALL_119_SCRIPT = [
  '“불이 났습니다.”',
  '단지명·동·호수와 층수를 말한다.',
  '불이 난 곳(주방·거실 등)과 연기 정도를 말한다.',
  '갇혀 있다면 지금 있는 방과 창문 방향을 말한다.',
  '가족 인원과 대피하지 못한 사람을 말한다.',
  '전화를 먼저 끊지 않는다.',
];

/* ------------------------------------------------------------------ */
/* 자동 점검                                                           */
/* ------------------------------------------------------------------ */

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  weight: number;
  detail: string;
  fix: string;
}

export interface Diagnosis {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  checks: CheckResult[];
  passed: number;
  failed: number;
  warned: number;
}

function nearRoomKind(plan: Plan, x: number, y: number, kinds: Room['kind'][]): boolean {
  for (const r of plan.rooms) {
    if (!kinds.includes(r.kind)) continue;
    if (x >= r.x - 60 && x <= r.x + r.w + 60 && y >= r.y - 60 && y <= r.y + r.h + 60) return true;
  }
  return false;
}

export function diagnose(plan: Plan, g?: Grid): Diagnosis {
  const checks: CheckResult[] = [];
  const push = (c: CheckResult) => checks.push(c);

  /* 1. 현관문 */
  const entrances = plan.doors.filter((d) => d.kind === 'entrance');
  push({
    id: 'entrance',
    label: '현관문 표기',
    weight: 12,
    status: entrances.length >= 1 ? 'pass' : 'fail',
    detail:
      entrances.length >= 1
        ? `현관문 ${entrances.length}개소가 표기되어 있다.`
        : '현관문이 표기되지 않아 주 피난로의 종점이 없다.',
    fix: '개구부 도구로 현관문을 배치한다.',
  });

  /* 2. 현관문 유효 폭 */
  const narrow = entrances.filter((d) => d.width < 80);
  push({
    id: 'entrance-width',
    label: '현관문 유효 폭',
    weight: 5,
    status: entrances.length === 0 ? 'warn' : narrow.length === 0 ? 'pass' : 'warn',
    detail:
      entrances.length === 0
        ? '현관문이 없어 판정할 수 없다.'
        : narrow.length === 0
          ? '현관문 유효 폭이 80cm 이상이다.'
          : `유효 폭 80cm 미만인 현관문이 ${narrow.length}개 있다.`,
    fix: '문 앞 적치물을 치워 실제 통과 폭을 확보한다.',
  });

  /* 3. 소화기 */
  const ext = plan.facilities.filter((f) => f.type === 'extinguisher');
  const extNearRisk = ext.some((f) => nearRoomKind(plan, f.x, f.y, ['entry', 'kitchen']));
  push({
    id: 'extinguisher',
    label: '소화기 배치',
    weight: 12,
    status: ext.length === 0 ? 'fail' : extNearRisk ? 'pass' : 'warn',
    detail:
      ext.length === 0
        ? '소화기가 표기되지 않았다.'
        : extNearRisk
          ? `소화기 ${ext.length}개가 현관 또는 주방 가까이에 있다.`
          : `소화기 ${ext.length}개가 있으나 현관·주방과 떨어져 있다.`,
    fix: '현관과 주방에 각각 1개씩 두고, 가족 모두가 위치를 알도록 한다. 주방에는 K급을 권장한다.',
  });

  /* 4. 연기감지기 */
  const det = plan.facilities.filter((f) => f.type === 'detector');
  push({
    id: 'detector',
    label: '연기감지기',
    weight: 10,
    status: det.length >= 1 ? 'pass' : 'warn',
    detail:
      det.length >= 1
        ? `연기감지기 ${det.length}개소가 표기되어 있다.`
        : '연기감지기가 표기되지 않았다. 야간 인지 지연이 사망의 주요 원인이다.',
    fix: '거실과 각 침실 천장의 감지기 위치를 확인해 표기한다. 떼어 두지 않는다.',
  });

  /* 5. 세대 피난시설 (준공연도 기준) */
  const era = eraFor(plan.meta.approvalYear);
  const facil = plan.facilities.filter(
    (f) => f.type === 'refuge' || f.type === 'partition' || f.type === 'downladder',
  );
  const expectsFacility = !era.expected.includes('none');
  push({
    id: 'refuge',
    label: '대체 피난수단',
    weight: 15,
    status: facil.length >= 1 ? 'pass' : expectsFacility ? 'fail' : 'warn',
    detail:
      facil.length >= 1
        ? `${facil.length}개소가 표기되어 있다. (사용승인 ${plan.meta.approvalYear}년 — ${era.title})`
        : expectsFacility
          ? `${era.range} 세대는 ${era.title}에 해당한다. 표기된 대체 피난수단이 없다.`
          : '해당 시기 세대는 별도 피난시설이 없을 수 있다. 머무를 곳을 미리 정해 둔다.',
    fix: era.caution,
  });

  /* 6. 동선 커버리지 */
  const targets = routableRooms(plan);
  const covered = new Set(plan.routes.map((r) => r.fromRoom).filter(Boolean) as string[]);
  const missing = targets.filter((r) => !covered.has(r.id));
  push({
    id: 'coverage',
    label: '실별 동선 확보',
    weight: 14,
    status: targets.length === 0 ? 'warn' : missing.length === 0 ? 'pass' : missing.length <= 1 ? 'warn' : 'fail',
    detail:
      targets.length === 0
        ? '동선을 낼 실이 없다.'
        : missing.length === 0
          ? `주요 실 ${targets.length}곳 모두에 동선이 있다.`
          : `동선이 없는 실: ${missing.map((r) => r.name).join(', ')}`,
    fix: '동선 단계에서 자동 생성을 실행하거나 직접 그린다.',
  });

  /* 7. 대체 동선 */
  const alts = plan.routes.filter((r) => r.kind === 'alt');
  push({
    id: 'alt-route',
    label: '대체 동선',
    weight: 10,
    status: alts.length >= 1 ? 'pass' : 'warn',
    detail:
      alts.length >= 1
        ? `대체 동선 ${alts.length}개가 있다.`
        : '현관이 막혔을 때의 대체 동선이 없다.',
    fix: '대피공간·경량칸막이·하향식 피난구를 종점으로 대체 동선을 추가한다.',
  });

  /* 8. 동선 길이 */
  const metrics = plan.routes.map((r) => routeMetric(r, plan.meta.walker));
  const longest = metrics.reduce((m, x) => Math.max(m, x.length), 0);
  push({
    id: 'route-length',
    label: '최장 동선 길이',
    weight: 6,
    status: metrics.length === 0 ? 'warn' : longest <= 25 ? 'pass' : 'warn',
    detail:
      metrics.length === 0
        ? '동선이 없어 판정할 수 없다.'
        : `최장 ${longest.toFixed(1)}m — 보행 ${Math.round((longest / 1.2) * 10) / 10}초(성인 기준)`,
    fix: '동선이 길면 중간에 문을 닫아 연기 확산을 늦추는 지점을 정해 둔다.',
  });

  /* 9. 고립 실 (격자 연결성) */
  if (g) {
    const exits = exitPoints(plan, g);
    const isolated: string[] = [];
    if (exits.length > 0) {
      for (const r of plan.rooms) {
        if (r.kind === 'balcony') continue;
        const c = roomCenter(r);
        const cell = nearestWalkable(g, c.x, c.y);
        if (cell < 0) {
          isolated.push(r.name);
          continue;
        }
        if (!exits.some((e) => connected(g, cell, e.cell))) isolated.push(r.name);
      }
    }
    push({
      id: 'isolation',
      label: '고립된 실',
      weight: 10,
      status: exits.length === 0 ? 'warn' : isolated.length === 0 ? 'pass' : 'fail',
      detail:
        exits.length === 0
          ? '종점이 없어 연결성을 판정할 수 없다.'
          : isolated.length === 0
            ? '모든 실이 피난 종점과 연결되어 있다.'
            : `종점과 이어지지 않는 실: ${isolated.join(', ')}`,
      fix: '해당 실의 출입문을 배치하거나 벽 사이 개구부를 확인한다.',
    });
  }

  /* 10. 집결지 */
  push({
    id: 'assembly',
    label: '집결지 지정',
    weight: 6,
    status: plan.meta.assembly.trim() ? 'pass' : 'warn',
    detail: plan.meta.assembly.trim()
      ? `집결지: ${plan.meta.assembly}`
      : '가족이 모일 집결지가 정해지지 않았다.',
    fix: '단지 안에서 눈에 잘 띄고 차량이 다니지 않는 곳을 정한다.',
  });

  /* 11. 세대 정보 */
  const hasInfo = Boolean(plan.meta.dong.trim() && plan.meta.ho.trim());
  push({
    id: 'meta',
    label: '동·호수 기입',
    weight: 5,
    status: hasInfo ? 'pass' : 'warn',
    detail: hasInfo ? `${plan.meta.dong}동 ${plan.meta.ho}호` : '동·호수가 비어 있다. 119 신고 시 가장 먼저 말해야 한다.',
    fix: '세대 정보 단계에서 동·호수와 층을 입력한다.',
  });

  /* 12. 발코니 등 외기 접점 */
  const balcony = plan.rooms.filter((r) => r.kind === 'balcony');
  push({
    id: 'balcony',
    label: '외기에 접한 대기 장소',
    weight: 5,
    status: balcony.length >= 1 ? 'pass' : 'warn',
    detail:
      balcony.length >= 1
        ? `발코니 ${balcony.length}곳이 있다. 대피로가 막혔을 때 머무를 수 있다.`
        : '발코니가 표기되지 않았다. 확장 세대는 창문 위치를 대신 확인한다.',
    fix: '발코니를 표기하고, 창을 열 수 있는지 확인한다.',
  });

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + c.weight * (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0), 0);
  const score = total ? Math.round((got / total) * 100) : 0;
  const grade: Diagnosis['grade'] = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D';

  return {
    score,
    grade,
    checks,
    passed: checks.filter((c) => c.status === 'pass').length,
    warned: checks.filter((c) => c.status === 'warn').length,
    failed: checks.filter((c) => c.status === 'fail').length,
  };
}

/** 격자 좌표계에서 특정 지점이 통행 가능한지 — 점검 보조 */
export function isWalkable(g: Grid, x: number, y: number): boolean {
  const i = cellAt(g, x, y);
  return i >= 0 && g.walk[i] === 1;
}
