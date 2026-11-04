/** 6. 대피 연습 — 칸을 눌러 움직인다. 움직일 때 한 차례씩 위험이 번진다 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  closeLastDoor,
  drillMoves,
  finishMeet,
  finishRescue,
  isTrapped,
  moveTo,
  setCrouch,
  startDrill,
  touchDoor,
  type DrillMove,
  type DrillState,
} from '../core/drill';
import { analyze, cellIdAt } from '../core/grid';
import { pickByArrow, pointAlong, type ArrowDir } from '../core/path';
import { OUT, type Pt } from '../core/types';
import { BANDS } from '../content/bands';
import { FIRE } from '../content/fire';
import { host } from '../platform/host';
import { currentBand, fillForDrill, finishDrill, getApp, say, useApp } from '../store/app';
import { IconClose, IconCrouch, IconDoor, IconHand, IconPhone, IconPlay, IconStand, KidGlyph } from './art';
import { PlanView, U } from './PlanView';
import { ZoomControls } from './ZoomControls';
import { useArrowKeys } from './steps';

const STEP_MS = 620;

function levelOf(value: number): 0 | 1 | 2 | 3 {
  const l = FIRE.low.levels;
  if (value >= l.blocked) return 3;
  if (value >= l.hot) return 2;
  if (value >= l.light) return 1;
  return 0;
}

export function DrillStep() {
  const plan = useApp((s) => s.plan);
  const layout = useMemo(() => analyze(plan), [plan]);
  const look = useApp((s) => s.profile?.look ?? 'a');
  const band = currentBand();
  const info = BANDS[band];
  const config = FIRE[band];

  const [state, setState] = useState<DrillState | null>(null);
  const [pos, setPos] = useState<Pt | null>(null);
  const [walking, setWalking] = useState(false);
  const [touch, setTouch] = useState<DrillMove | null>(null);
  const [callCard, setCallCard] = useState<'meet' | 'rescue' | null>(null);
  const [crouchNudge, setCrouchNudge] = useState(false);
  const raf = useRef(0);
  const tipGiven = useRef(false);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const begin = () => {
    fillForDrill();
    const app = getApp();
    const next = startDrill(app.plan, app.drillSeed, config);
    if (!next) return;
    setState(next);
    setPos(next.pt);
    if (app.soundOn) host.alarm();
    say('drill-start', 'drill-how');
  };

  const animate = (points: Pt[], then: () => void) => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || points.length < 2) {
      setPos(points[points.length - 1] ?? pos);
      then();
      return;
    }
    setWalking(true);
    const t0 = performance.now();
    const dur = Math.max(STEP_MS, STEP_MS * 0.5 * points.length);
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      setPos(pointAlong(points, t));
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else {
        setWalking(false);
        then();
      }
    };
    raf.current = requestAnimationFrame(tick);
  };

  const perform = (from: DrillState, mv: DrillMove) => {
    const next = moveTo(plan, layout, from, mv, config);
    const snap = next.timeline[next.timeline.length - 1]!;
    setState(next);
    animate(snap.walk, () => {
      if (next.phase === 'outside') {
        setCrouchNudge(false);
        say('drill-outside');
        return;
      }
      if (isTrapped(layout, next, config)) {
        setCallCard('rescue');
        say('drill-rescue');
        return;
      }
      const inHazard = (next.field[next.at] ?? 0) >= config.levels.light;
      if (inHazard && !next.crouch) {
        setCrouchNudge(true);
        say('drill-smoke');
      } else if (info.closeDoors && next.lastDoor && !tipGiven.current) {
        tipGiven.current = true;
        say('drill-close-tip');
      }
    });
  };

  const tapAt = (p: Pt) => {
    if (!state || walking || touch || callCard) return;
    if (state.phase === 'outside') {
      goMeet();
      return;
    }
    const target = cellIdAt(layout, p) ?? OUT;
    if (target === state.at) return;
    const mv = drillMoves(layout, state, config).find((m) => m.to === target);
    if (!mv) {
      say('drill-no-door');
      return;
    }
    tryMove(state, mv);
  };

  // 화살표 키 — 지금 자리에서 그 방향에 있는 문으로 간다
  useArrowKeys((dir: ArrowDir) => {
    if (!state || walking || touch || callCard) return;
    if (state.phase === 'outside') {
      goMeet();
      return;
    }
    const mv = pickByArrow(state.pt, drillMoves(layout, state, config), dir);
    if (mv) tryMove(state, mv);
    else say('drill-no-door');
  });

  const tryMove = (from: DrillState, mv: DrillMove) => {
    const state = from;
    if (state.knownHot.includes(mv.edge) || (mv.hot && !info.touchDoors)) {
      say('drill-hot');
      return;
    }
    const needTouch = info.touchDoors && !state.checked.includes(mv.edge) && (mv.hot || state.stats.doorsChecked === 0);
    if (needTouch) {
      setTouch(mv);
      say('drill-touch');
      return;
    }
    perform(state, mv);
  };

  const doTouch = () => {
    if (!state || !touch) return;
    const next = touchDoor(state, touch);
    setState(next);
    const mv = touch;
    setTouch(null);
    if (mv.hot) {
      say('drill-hot');
      if (isTrapped(layout, next, config)) {
        setCallCard('rescue');
        say('drill-rescue');
      }
    } else {
      say('drill-cool');
      perform(next, mv);
    }
  };

  const goMeet = () => {
    if (!state || walking) return;
    const meet = plan.marks.meet;
    const finish = () => {
      setCallCard('meet');
      say('drill-call');
    };
    if (meet) animate([state.pt, meet], finish);
    else finish();
  };

  const call = () => {
    if (!state) return;
    const done = callCard === 'rescue' ? finishRescue(state) : finishMeet(plan, layout, state);
    finishDrill(done);
  };

  if (!state) {
    return (
      <>
        <aside className="tools" aria-label="연습 준비">
          <h3 className="tools-head">연습 약속</h3>
          <ul className="promise">
            <li>진짜 불이 아니다.</li>
            <li>시간제한이 없다.</li>
            <li>반짝이는 칸을 눌러 밖으로 나가자.</li>
            <li>화살표 키로도 움직여.</li>
          </ul>
        </aside>
        <section className="paper paper-center">
          <PlanView plan={plan} layout={layout} look={look} showRoute showLabels />
          <button type="button" className="big-start" data-testid="drill-start" onClick={begin}>
            <IconPlay size={30} /> 연습 시작
          </button>
        </section>
      </>
    );
  }

  const hazard: Record<string, 0 | 1 | 2 | 3> = {};
  for (const c of layout.cells) hazard[c.id] = levelOf(state.field[c.id] ?? 0);
  const moves = drillMoves(layout, state, config);
  const glow = walking || touch || callCard ? [] : moves.filter((m) => !state.knownHot.includes(m.edge)).map((m) => m.to);
  const outside = state.phase === 'outside';

  return (
    <>
      <aside className="tools" aria-label="연습 단추">
        <button
          type="button"
          className={`tool tall ${state.crouch ? 'on' : ''} ${crouchNudge ? 'nudge' : ''}`}
          data-testid="drill-crouch"
          aria-pressed={state.crouch}
          disabled={outside}
          onClick={() => {
            setState(setCrouch(state, !state.crouch));
            setCrouchNudge(false);
          }}
        >
          {state.crouch ? <IconCrouch size={34} /> : <IconStand size={34} />}
          {state.crouch ? '낮춘 자세' : '몸 낮추기'}
        </button>
        {info.closeDoors && (
          <button
            type="button"
            className="tool tall"
            data-testid="drill-close"
            disabled={!state.lastDoor || walking}
            onClick={() => {
              setState(closeLastDoor(state));
              say('drill-closed');
            }}
          >
            <IconDoor size={30} /> 문 닫기
          </button>
        )}
        {outside && (
          <button type="button" className="tool tall on" data-testid="drill-meet" disabled={walking} onClick={goMeet}>
            <IconPlay size={28} /> 만나는 곳으로
          </button>
        )}
        <p className="tool-note">{outside ? '만나는 곳으로 가자.' : '반짝이는 칸을 누르거나 화살표 키를 눌러 움직여.'}</p>
        <p className="tool-note" data-testid="drill-turn">{state.stats.moves}번 움직였어</p>
      </aside>
      <section className="paper">
        <PlanView
          plan={plan}
          layout={layout}
          look={look}
          showRoute
          glow={glow}
          hints={glow}
          hazard={hazard}
          closedDoors={state.closed}
          onPointer={(kind, p) => {
            if (kind === 'up') tapAt(p);
          }}
          className="cursor-tap"
          zoomable
          ariaLabel="대피 연습 지도"
        >
          {pos && (
            <g className="player" transform={`translate(${pos.x * U} ${pos.y * U}) scale(1.15)`} data-testid="player" data-at={state.at} data-phase={state.phase}>
              <KidGlyph look={look} crouch={state.crouch} />
            </g>
          )}
        </PlanView>
        <ZoomControls plan={plan} />

        {touch && (
          <div className="card-over" role="dialog" aria-modal="true" aria-label="문 만져 보기">
            <button type="button" className="x" aria-label="닫기" data-testid="card-close" onClick={() => setTouch(null)}><IconClose /></button>
            <h3>문을 열기 전에</h3>
            <p>손등으로 문을 살짝 만져 보자.</p>
            <button type="button" className="big-action" data-testid="drill-touch" autoFocus onClick={doTouch}>
              <IconHand size={30} /> 손등으로 만져 보기
            </button>
          </div>
        )}

        {callCard && (
          <div className="card-over" role="dialog" aria-modal="true" aria-label="119 전화">
            <h3>{callCard === 'meet' ? '가족을 만났어' : '문을 닫고 창가로'}</h3>
            <p>{callCard === 'meet' ? '119에 불이 났다고 말하고 우리 집 주소를 알려 주자.' : '나갈 길이 막혔어. 창가에서 119에 구조를 요청하자.'}</p>
            <button type="button" className="big-action" data-testid="drill-call" autoFocus onClick={call}>
              <IconPhone size={30} /> 119에 전화하기
            </button>
          </div>
        )}
      </section>
    </>
  );
}
