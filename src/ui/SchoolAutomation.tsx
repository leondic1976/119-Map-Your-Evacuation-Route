'use client';

import React, { useEffect, useRef, useState } from 'react';
import { preparedShellPlan } from '../core/plan/shellSketch';
import { isSchoolAutomationProfile, SCHOOL_AUTOMATION_DURATION_MS } from '../core/schoolAutomation';
import { suggestedRoute, useKids } from '../store/kidsStore';
import type { Cell, OpeningKind, PointKind, RouteSlot, Side } from '../types/plan';
import type { StudentInfo } from './ProfileSetup';

interface Props {
  studentInfo?: StudentInfo;
  ready: boolean;
  onStart: () => void;
}

type RoutineMode = 'running' | 'done' | 'error';

interface RoutineView {
  mode: RoutineMode;
  phase: number;
  elapsed: number;
  title: string;
  detail: string;
}

interface OpeningPlacement {
  kind: OpeningKind;
  cell: Cell;
  side: Side;
}

interface PointPlacement {
  category: 'furniture' | 'safety';
  kind: PointKind;
  cell: Cell;
}

const PHASE_COUNT = 10;

/* 방 사이 연결과 외부 출구를 모두 갖춘 검증된 방 두 개 평면의 개구부다. */
const OPENINGS: OpeningPlacement[] = [
  { kind: 'door', cell: { x: 5, y: 6 }, side: 'S' },
  { kind: 'door', cell: { x: 10, y: 6 }, side: 'S' },
  { kind: 'door', cell: { x: 14, y: 6 }, side: 'S' },
  { kind: 'door', cell: { x: 5, y: 9 }, side: 'N' },
  { kind: 'door', cell: { x: 10, y: 9 }, side: 'N' },
  { kind: 'inner_door', cell: { x: 14, y: 9 }, side: 'N' },
  { kind: 'front_door', cell: { x: 16, y: 10 }, side: 'E' },
  { kind: 'balcony_window', cell: { x: 10, y: 12 }, side: 'S' },
  { kind: 'balcony_window', cell: { x: 5, y: 12 }, side: 'S' },
  { kind: 'window', cell: { x: 5, y: 3 }, side: 'N' },
  { kind: 'window', cell: { x: 10, y: 3 }, side: 'N' },
  { kind: 'window', cell: { x: 14, y: 3 }, side: 'N' },
];

const FURNITURE: PointPlacement[] = [
  { category: 'furniture', kind: 'bed', cell: { x: 4, y: 4 } },
  { category: 'furniture', kind: 'desk', cell: { x: 4, y: 3 } },
  { category: 'furniture', kind: 'wardrobe', cell: { x: 9, y: 3 } },
  { category: 'furniture', kind: 'sofa', cell: { x: 9, y: 11 } },
  { category: 'furniture', kind: 'tv', cell: { x: 10, y: 9 } },
  { category: 'furniture', kind: 'fridge', cell: { x: 7, y: 10 } },
  { category: 'furniture', kind: 'dining_table', cell: { x: 4, y: 10 } },
  { category: 'furniture', kind: 'sink', cell: { x: 3, y: 9 } },
  { category: 'furniture', kind: 'gas_range', cell: { x: 3, y: 11 } },
];

const SAFETY: PointPlacement[] = [
  { category: 'safety', kind: 'extinguisher', cell: { x: 15, y: 11 } },
  { category: 'safety', kind: 'detector', cell: { x: 11, y: 10 } },
  { category: 'safety', kind: 'gas_valve', cell: { x: 4, y: 11 } },
  { category: 'safety', kind: 'light_partition', cell: { x: 11, y: 13 } },
];

const INITIAL_VIEW: RoutineView = {
  mode: 'running',
  phase: 0,
  elapsed: 0,
  title: '40초 자동 설계를 준비하고 있어',
  detail: '집 그림부터 두 갈래 대피경로까지 차례대로 완성한다.',
};

/** 특수 학교 프로필에서만 한 번 실행되는 수업 시연용 자동 설계 컨트롤러다. */
export default function SchoolAutomation({ studentInfo, ready, onStart }: Props) {
  const [view, setView] = useState<RoutineView | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current || !isSchoolAutomationProfile(studentInfo)) return;
    started.current = true;
    onStart();

    const timers: ReturnType<typeof setTimeout>[] = [];
    const startedAt = Date.now();
    let stopped = false;
    let tick: ReturnType<typeof setInterval> | undefined;

    const later = (delay: number, action: () => void): void => {
      const timer = setTimeout(() => {
        if (stopped) return;
        try {
          action();
        } catch (error) {
          stopped = true;
          if (tick) clearInterval(tick);
          const message = error instanceof Error ? error.message : String(error);
          setView((current) => current ? {
            ...current,
            mode: 'error',
            title: '자동 설계를 멈췄어',
            detail: `현재 지도는 그대로 남아 있다. ${message}`,
          } : current);
        }
      }, delay);
      timers.push(timer);
    };

    const show = (phase: number, title: string, detail: string): void => {
      setView((current) => ({
        mode: 'running',
        phase,
        elapsed: current?.elapsed ?? Math.min(Date.now() - startedAt, SCHOOL_AUTOMATION_DURATION_MS),
        title,
        detail,
      }));
    };

    const animateRoute = (slot: RouteSlot, duration: number): void => {
      const state = useKids.getState();
      state.setStep(slot === 'primary' ? 'route' : 'routeAlt');
      const cells = suggestedRoute(useKids.getState());
      if (cells.length < 2) throw new Error(slot === 'primary' ? '주 대피경로를 찾지 못했다.' : '보조 대피경로를 찾지 못했다.');
      state.startRoute(cells[0]);
      const interval = duration / cells.length;
      cells.slice(1).forEach((cell, index) => {
        later(interval * (index + 1), () => useKids.getState().extendRoute(cell));
      });
      later(duration, () => useKids.getState().endRoute());
    };

    setView(INITIAL_VIEW);
    const state = useKids.getState();
    state.resetAll();
    state.setStep('template');

    later(2_500, () => {
      show(1, '집 모양을 골랐어', '가로로 넓은 집 외곽을 도면에 놓고 있어.');
      const shell = preparedShellPlan('wide').shell?.cells ?? [];
      useKids.getState().loadShellPlan(shell);
    });

    later(6_500, () => {
      show(2, '내부 구조를 만들고 있어', '방 두 개, 욕실, 거실, 주방, 현관과 발코니를 나누고 있어.');
      useKids.getState().loadTemplate('apt_2room', { roomsOnly: true });
      useKids.getState().setStep('spaces');
    });

    later(10_500, () => {
      show(3, '문과 창문을 연결하고 있어', '방문, 현관문, 창문과 발코니 창을 알맞은 벽에 놓고 있어.');
      const current = useKids.getState();
      for (const opening of OPENINGS) current.placeOpening(opening.kind, opening.cell, opening.side);
      current.setStep('structure');
    });

    later(14_500, () => {
      show(4, '방 크기를 조절하고 있어', '가구와 이동 통로가 잘 보이도록 내 방의 폭을 다듬고 있어.');
      const current = useKids.getState();
      current.setStep('spaces');
      current.resizeRoom('r1', { x: 3, y: 3, w: 4, h: 4 });
      current.select('r1');
    });

    later(18_500, () => {
      show(5, '여러 가지 가구를 놓고 있어', '침대, 책상, 옷장, 소파, 식탁과 주방 가구를 배치하고 있어.');
      const current = useKids.getState();
      current.setStep('furniture');
      for (const point of FURNITURE) current.placePoint(point.category, point.kind, point.cell);
    });

    later(23_500, () => {
      show(6, '가구 크기를 맞추고 있어', '침대를 방 크기에 맞게 넓히고 이동 공간을 확인하고 있어.');
      const current = useKids.getState();
      const bed = current.plan.blocks.find((block) => block.kind === 'furniture' && block.subKind === 'bed');
      if (!bed) throw new Error('크기를 조절할 침대를 찾지 못했다.');
      current.resizePoint(bed.id, { w: 3, h: 3 });
      current.select(bed.id);
    });

    later(27_000, () => {
      show(7, '안전설비를 표시하고 있어', '소화기, 감지기, 가스 손잡이와 경량 칸막이를 확인하고 있어.');
      const current = useKids.getState();
      current.setStep('safety');
      for (const point of SAFETY) current.placePoint(point.category, point.kind, point.cell);
    });

    later(30_000, () => {
      show(8, '내 위치와 만나는 곳을 정했어', '내 방 안에 현재 위치를, 집 밖에는 가족이 만날 곳을 놓고 있어.');
      const current = useKids.getState();
      current.setStep('mySpot');
      if (!current.pickMyRoom({ x: 5, y: 5 })) throw new Error('내 위치를 방 안에 놓지 못했다.');
      current.pickMeeting({ x: 19, y: 10 });
    });

    later(32_000, () => {
      show(9, '주 대피경로를 그리고 있어', '내 방에서 현관문을 지나 집 밖으로 나가는 첫 번째 길이다.');
      animateRoute('primary', 3_000);
    });

    later(36_000, () => {
      show(10, '보조 대피경로를 그리고 있어', '현관 쪽이 막혔을 때 이용할 두 번째 길을 완성하고 있어.');
      animateRoute('alternate', 3_000);
    });

    later(SCHOOL_AUTOMATION_DURATION_MS, () => {
      const current = useKids.getState();
      const pair = current.routes[current.hazardId];
      if (!pair?.primary || !pair.alternate) throw new Error('두 갈래 대피경로가 모두 저장되지 않았다.');
      current.setStep('routeAlt');
      current.select(null);
      current.notify('40초 자동 설계가 완성되었다. 주 경로와 보조 경로를 확인해 보자.');
      stopped = true;
      if (tick) clearInterval(tick);
      setView({
        mode: 'done',
        phase: PHASE_COUNT,
        elapsed: SCHOOL_AUTOMATION_DURATION_MS,
        title: '40초 자동 설계 완성',
        detail: '집 그림과 가구, 내 위치, 주 경로와 보조 경로가 모두 저장되었다.',
      });
    });

    tick = setInterval(() => {
      if (stopped) return;
      setView((current) => current?.mode === 'running'
        ? { ...current, elapsed: Math.min(Date.now() - startedAt, SCHOOL_AUTOMATION_DURATION_MS) }
        : current);
    }, 200);

    return () => {
      stopped = true;
      if (tick) clearInterval(tick);
      for (const timer of timers) clearTimeout(timer);
    };
  }, [onStart, ready, studentInfo]);

  if (!view) return null;
  const percent = view.mode === 'done' ? 100 : Math.min(99, Math.round((view.elapsed / SCHOOL_AUTOMATION_DURATION_MS) * 100));
  const remaining = Math.max(0, Math.ceil((SCHOOL_AUTOMATION_DURATION_MS - view.elapsed) / 1000));

  return (
    <aside
      className={`k-school-automation ${view.mode}`}
      data-automation-state={view.mode}
      data-automation-phase={view.phase}
      aria-live="polite"
      aria-atomic="true"
    >
      <section className="k-school-automation-card" role="status">
        <div className="k-school-automation-head">
          <span aria-hidden="true"><AutomationMark done={view.mode === 'done'} /></span>
          <div>
            <small>부평초등학교 1학년 119반 자동 시연</small>
            <b>{view.title}</b>
          </div>
          <strong>{view.mode === 'done' ? '완료' : view.mode === 'error' ? '중단' : `${remaining}초`}</strong>
        </div>
        <p>{view.detail}</p>
        <div className="k-school-automation-progress" role="progressbar" aria-label="자동 설계 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <i style={{ width: `${percent}%` }} />
        </div>
        <div className="k-school-automation-foot">
          <span>{view.mode === 'done' ? '모든 과정 완료' : view.mode === 'error' ? '현재 도면 유지' : `${view.phase}/${PHASE_COUNT}단계`}</span>
          <span>{percent}%</span>
        </div>
      </section>
    </aside>
  );
}

function AutomationMark({ done }: { done: boolean }) {
  return done
    ? <svg viewBox="0 0 32 32"><path d="m8 16 5 5L24 10" /></svg>
    : <svg viewBox="0 0 32 32"><path d="M16 5v4m0 14v4M5 16h4m14 0h4M8.2 8.2l2.8 2.8m10 10 2.8 2.8M23.8 8.2 21 11M11 21l-2.8 2.8" /><circle cx="16" cy="16" r="4" /></svg>;
}
