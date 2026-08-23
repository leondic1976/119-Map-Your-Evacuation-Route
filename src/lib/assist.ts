/**
 * 그리기 도우미.
 *
 * 지금 도면 상태를 보고 "다음에 무엇을 하면 되는지"를 한 줄로 알려 준다.
 * 자가 진단(risk.ts)이 다 만든 도면을 평가하는 것이라면, 이쪽은 만드는 도중에
 * 옆에서 거드는 쪽이다. 그래서 말투가 쉽고, 누르면 바로 그 일을 하는 단추가 붙는다.
 *
 * 기능이 늘면 여기에도 항목을 더한다. tools/test.ts 가 단계마다 도우미 문구가
 * 있는지 검사한다.
 */
import { Grid, connected, nearestWalkable } from './grid';
import { exitPoints } from './routing';
import { Plan, roomCenter } from './types';

export type AssistTone = 'todo' | 'ok' | 'warn' | 'done';

export interface AssistAction {
  label: string;
  /** tool = 도구 바꾸기, step = 단계 이동, route = 동선 자동 생성 */
  kind: 'tool' | 'step' | 'route';
  value: string | number;
}

export interface Assist {
  id: string;
  tone: AssistTone;
  /** 짧은 제목 */
  title: string;
  /** 무엇을 어떻게 하면 되는지 */
  body: string;
  action?: AssistAction;
}

/** 밖으로 나갈 수 없는 방 이름들 — 문을 빠뜨렸는지 본다 */
export function stuckRooms(plan: Plan, grid: Grid): string[] {
  const exits = exitPoints(plan, grid);
  if (exits.length === 0) return [];
  const out: string[] = [];
  for (const r of plan.rooms) {
    if (r.kind === 'balcony') continue;
    const c = roomCenter(r);
    const cell = nearestWalkable(grid, c.x, c.y);
    if (cell < 0) continue;
    if (!exits.some((e) => connected(grid, cell, e.cell))) out.push(r.name);
  }
  return out;
}

/** 이 단계에서 볼 도우미 — 앞에 있는 것이 지금 할 일이다 */
export function assistFor(plan: Plan, step: number, grid?: Grid): Assist[] {
  const out: Assist[] = [];
  const roomCount = plan.rooms.length;
  const entrances = plan.doors.filter((d) => d.kind === 'entrance');
  const facilities = plan.facilities;
  const escapeKit = facilities.filter(
    (f) => f.type === 'refuge' || f.type === 'partition' || f.type === 'downladder',
  );

  /* ── 01 평면 ─────────────────────────────────────────────── */
  if (roomCount === 0) {
    out.push({
      id: 'no-room',
      tone: 'todo',
      title: '먼저 집 모양을 그린다',
      body: '도면 위에서 마우스를 끌어 네모나게 한 바퀴 돌리면 방이 된다. 삐뚤빼뚤해도 괜찮다.',
      action: { label: '그리기 시작', kind: 'tool', value: 'sketch' },
    });
    return out;
  }

  if (roomCount === 1) {
    out.push({
      id: 'one-room',
      tone: 'todo',
      title: '방을 나눠 보자',
      body: '방 한가운데를 가로질러 쭉 그으면 그 자리에 벽이 서고 방이 둘로 나뉜다.',
      action: { label: '그리기 계속', kind: 'tool', value: 'sketch' },
    });
  }

  /* ── 03 개구부 ───────────────────────────────────────────── */
  if (entrances.length === 0) {
    out.push({
      id: 'no-entrance',
      tone: 'warn',
      title: '밖으로 나가는 문이 없다',
      body: '바깥 벽을 따라 짧게 그으면 문이 생긴다. 그 문을 눌러 종류를 "현관문"으로 바꾼다. 현관문이 있어야 피난 길을 그릴 수 있다.',
      action: { label: '문 만들러 가기', kind: 'step', value: 2 },
    });
  }

  /* 문이 없어 갇힌 방 찾기 */
  if (grid && entrances.length > 0) {
    const stuck = stuckRooms(plan, grid);
    if (stuck.length > 0) {
      out.push({
        id: 'stuck-room',
        tone: 'warn',
        title: `${stuck.slice(0, 2).join(', ')}${stuck.length > 2 ? ' 외' : ''}에 문이 없다`,
        body: '이 방에서는 밖으로 나갈 수가 없다. 방과 방 사이 벽에 문을 그려 길을 이어 준다.',
        action: { label: '문 만들러 가기', kind: 'step', value: 2 },
      });
    }
  }

  /* ── 02 세대 정보 ────────────────────────────────────────── */
  if (!plan.meta.dong.trim() || !plan.meta.ho.trim()) {
    out.push({
      id: 'no-address',
      tone: 'todo',
      title: '몇 동 몇 호인지 적는다',
      body: '119에 신고할 때 가장 먼저 말해야 하는 것이다. 안내도에도 크게 들어간다.',
      action: { label: '적으러 가기', kind: 'step', value: 1 },
    });
  }

  /* ── 04 설비 ─────────────────────────────────────────────── */
  if (facilities.filter((f) => f.type === 'extinguisher').length === 0) {
    out.push({
      id: 'no-ext',
      tone: 'todo',
      title: '소화기 위치를 표시한다',
      body: '우리 집 소화기가 어디 있는지 찾아본다. 어디 있는지 모르면 없는 것과 같다.',
      action: { label: '표시하러 가기', kind: 'step', value: 3 },
    });
  }

  if (escapeKit.length === 0) {
    out.push({
      id: 'no-escape',
      tone: 'todo',
      title: '현관이 막히면 어디로 갈까',
      body: '발코니에 대피공간·경량칸막이·피난 사다리가 있는지 확인해 표시한다. 아무것도 없으면 발코니를 기다릴 곳으로 정한다.',
      action: { label: '표시하러 가기', kind: 'step', value: 3 },
    });
  }

  /* ── 05 동선 ─────────────────────────────────────────────── */
  if (plan.routes.length === 0 && entrances.length > 0) {
    out.push({
      id: 'no-route',
      tone: 'todo',
      title: '피난 길을 그린다',
      body: '단추 하나만 누르면 방마다 현관까지 가는 길이 저절로 그려진다.',
      action: { label: '길 그리기', kind: 'route', value: 'entrance' },
    });
  } else if (plan.routes.length > 0 && plan.routes.every((r) => r.kind !== 'alt') && escapeKit.length > 0) {
    out.push({
      id: 'no-alt',
      tone: 'todo',
      title: '돌아가는 길도 그려 둔다',
      body: '현관이 막혔을 때 쓸 길이다. 대피공간이나 피난 사다리 쪽으로 가는 길을 하나 더 만든다.',
      action: { label: '대체 길 그리기', kind: 'route', value: 'facility' },
    });
  }

  /* ── 다 됐을 때 ──────────────────────────────────────────── */
  if (out.length === 0) {
    out.push({
      id: 'all-set',
      tone: 'done',
      title: '다 됐다!',
      body: '연기가 어떻게 퍼지는지 보고, 대피 연습을 해 본 다음, 한 장으로 뽑아서 집에 붙인다.',
      action: { label: step >= 8 ? '인쇄하러 가기' : '다음으로', kind: 'step', value: step >= 8 ? 8 : Math.min(8, step + 1) },
    });
  }

  return out;
}

/** 지금 당장 할 일 하나 */
export function nextTask(plan: Plan, step: number, grid?: Grid): Assist {
  return assistFor(plan, step, grid)[0];
}

/** 완성까지 얼마나 왔는지 (0~1) — 초등 화면의 진행 막대 */
export function progress(plan: Plan): { value: number; label: string } {
  const checks = [
    plan.rooms.length >= 1,
    plan.rooms.length >= 2,
    Boolean(plan.meta.dong.trim() && plan.meta.ho.trim()),
    plan.doors.some((d) => d.kind === 'entrance'),
    plan.facilities.length > 0,
    plan.routes.length > 0,
  ];
  const n = checks.filter(Boolean).length;
  return { value: n / checks.length, label: `${n} / ${checks.length}` };
}
