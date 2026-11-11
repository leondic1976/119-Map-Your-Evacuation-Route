/**
 * 6. 대피 연습 — 칸을 누르거나 방향키로 움직인다. 움직일 때 한 차례씩 위험이 번진다.
 * 길 위의 안전 행동을 주우면 칭찬 도장이 찍히고, 걸어간 자리에 발자국이 남는다(대장 #156).
 * 밖에 나오면 방향키로 만나는 곳까지 걸어간다(대장 #155). 점수와 시간제한은 없다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  closeLastDoor,
  drillMoves,
  finishMeet,
  finishRescue,
  isTrapped,
  moveTo,
  outsidePath,
  pickHere,
  setCrouch,
  startDrill,
  stepOutside,
  touchDoor,
  type DrillMove,
  type DrillState,
  type TokenId,
} from '../core/drill';
import { analyze, cellIdAt, edgeMid } from '../core/grid';
import { arrowMap, pointAlong, polylineLength, type ArrowDir } from '../core/path';
import { earnedStamps, stampSlots, type StampId } from '../core/report';
import { OUT, type Pt } from '../core/types';
import { BANDS } from '../content/bands';
import { FIRE } from '../content/fire';
import { cellLabel } from '../content/names';
import { STAMPS } from '../content/stamps';
import { host } from '../platform/host';
import { currentBand, enterStep, fillForDrill, finishDrill, getApp, say, useApp } from '../store/app';
import { Celebration } from './Celebration';
import { ArrowPad } from './ArrowPad';
import { IconClose, IconCrouch, IconDoor, IconHand, IconPencil, IconPhone, IconPlay, IconStand, KidFace, KidGlyph, StampGlyph } from './art';
import { PlanView, unitOf } from './PlanView';
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
  // 집 밖에서 걸어간 자리와, 만나는 곳에 닿았는가
  const [outWalk, setOutWalk] = useState<Pt[]>([]);
  const [met, setMet] = useState(false);
  // 방금 찍힌 도장 — 잠깐 크게 보여 준다
  const [fresh, setFresh] = useState<StampId | null>(null);
  const shown = useRef<StampId[]>([]);
  const raf = useRef(0);
  const tipGiven = useRef(false);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const begin = () => {
    fillForDrill();
    const app = getApp();
    const tokens = stampSlots(band).filter((id): id is TokenId => id === 'shout' || id === 'nose' || id === 'stairs');
    const next = startDrill(app.plan, app.drillSeed, config, tokens);
    if (!next) {
      say('draw-need-cell');
      return;
    }
    setState(next);
    setPos(next.pt);
    setOutWalk([]);
    setMet(false);
    shown.current = [];
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
    if (getApp().soundOn) host.step();
    animate(snap.walk, () => {
      if (next.phase === 'outside') {
        setCrouchNudge(false);
        setOutWalk([next.pt]);
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
    if (target === state.at) {
      // 지금 칸에 놓인 안전 행동은 눌러서 줍는다
      setState(pickHere(state));
      return;
    }
    // 같은 칸으로 가는 문이 여럿이면 지금 자리에서 가까운 문으로 간다
    const far = (m: DrillMove): number => Math.hypot(edgeMid(m.edge).x - state.pt.x, edgeMid(m.edge).y - state.pt.y);
    const mv = drillMoves(layout, state, config).filter((m) => m.to === target).sort((a, b) => far(a) - far(b))[0];
    if (!mv) {
      say('drill-no-door');
      return;
    }
    tryMove(state, mv);
  };

  // 방향키 — 집 안에서는 그 방향에 있는 문으로, 집 밖에서는 그쪽으로 한 걸음 간다. 화면의 방향키 판과 키보드가 같다
  const onArrow = (dir: ArrowDir) => {
    if (!state || walking || touch || callCard) return;
    if (state.phase === 'outside') {
      walkOutside(dir);
      return;
    }
    const mv = arrowMap(state.pt, drillMoves(layout, state, config))[dir];
    if (mv) tryMove(state, mv);
    else say('drill-no-door');
  };
  useArrowKeys(onArrow);

  const tryMove = (from: DrillState, mv: DrillMove) => {
    const state = from;
    if (state.knownHot.includes(mv.edge) || (mv.hot && !info.touchDoors)) {
      say('drill-hot');
      return;
    }
    // 문짝이 없는 트인 곳은 만져 볼 문이 없다. 건너편이 뜨거우면 눈에 보이므로 가지 않는다
    if (mv.open && mv.hot) {
      say('drill-hot');
      return;
    }
    const needTouch = info.touchDoors && !mv.open && !state.checked.includes(mv.edge) && (mv.hot || state.stats.doorsChecked === 0);
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

  const arrive = () => {
    setMet(true);
    setCallCard('meet');
    // 가족을 만났다 — 축포와 함께 알린다
    if (getApp().soundOn) host.cheer();
    say('drill-call');
  };

  // 만나는 곳까지 한 번에 — 집을 돌아서 걸어간다
  const goMeet = () => {
    if (!state || walking || met) return;
    const from = outWalk[outWalk.length - 1] ?? state.pt;
    const walk = outsidePath(plan, layout, from);
    setOutWalk([...(outWalk.length ? outWalk : [from]), ...walk.slice(1)]);
    if (walk.length > 1) animate(walk, arrive);
    else arrive();
  };

  // 집 밖에서 방향키로 한 걸음씩 걷는다
  const walkOutside = (dir: ArrowDir) => {
    if (!state || walking || met) return;
    if (!plan.marks.meet) {
      arrive();
      return;
    }
    const from = outWalk[outWalk.length - 1] ?? state.pt;
    const next = stepOutside(plan, layout, from, dir);
    if (!next) return;
    setOutWalk([...(outWalk.length ? outWalk : [from]), next.pt]);
    if (getApp().soundOn) host.step();
    animate([from, next.pt], () => {
      if (next.arrived) arrive();
    });
  };

  const call = () => {
    if (!state) return;
    const done = callCard === 'rescue' ? finishRescue(state) : finishMeet(plan, layout, state, outWalk);
    finishDrill(done);
  };

  // 도장이 새로 찍히면 소리와 함께 잠깐 크게 보여 준다
  const stamps = state ? earnedStamps(state, band, met) : [];
  const stampKey = stamps.join(' ');
  useEffect(() => {
    const added = stamps.filter((id) => !shown.current.includes(id));
    if (added.length === 0) return;
    shown.current = stamps;
    setFresh(added[added.length - 1]!);
    if (getApp().soundOn) host.stamp();
    const timer = window.setTimeout(() => setFresh(null), 3200);
    return () => window.clearTimeout(timer);
  }, [stampKey]);

  if (!state) {
    return (
      <>
        <aside className="tools" aria-label="연습 준비" data-empty={layout.cells.length === 0 ? '1' : '0'}>
          <h3 className="tools-head">연습 약속</h3>
          <ul className="promise">
            <li>진짜 불이 아니다.</li>
            <li>시간제한이 없다.</li>
          </ul>
        </aside>
        <section className="paper paper-center">
          <PlanView plan={plan} layout={layout} look={look} showRoute showLabels />
          {layout.cells.length === 0 ? (
            <div className="empty-note" data-testid="drill-empty">
              <p>아직 지도가 없어. 집을 먼저 그려 보자.</p>
              <button type="button" className="big-action" data-testid="go-draw" onClick={() => enterStep('draw')}>
                <IconPencil size={26} /> 집 그리러 가기
              </button>
            </div>
          ) : (
            <button type="button" className="big-start" data-testid="drill-start" onClick={begin}>
              <IconPlay size={30} /> 연습 시작
            </button>
          )}
        </section>
      </>
    );
  }

  const hazard: Record<string, 0 | 1 | 2 | 3> = {};
  for (const c of layout.cells) hazard[c.id] = levelOf(state.field[c.id] ?? 0);
  const moves = drillMoves(layout, state, config);
  const glow = walking || touch || callCard ? [] : moves.filter((m) => !state.knownHot.includes(m.edge)).map((m) => m.to);
  const outside = state.phase === 'outside';
  const busy = walking || Boolean(touch) || Boolean(callCard);
  const u = unitOf(plan);
  const density = plan.density ?? 1;

  // 방향키 판 — 갈 수 있는 쪽과 그쪽 이름
  const targets: Partial<Record<ArrowDir, string>> = {};
  if (!busy && !met) {
    if (outside) {
      const from = outWalk[outWalk.length - 1] ?? state.pt;
      for (const dir of ['up', 'down', 'left', 'right'] as const) {
        const next = plan.marks.meet ? stepOutside(plan, layout, from, dir) : null;
        if (next) targets[dir] = next.arrived ? '만나는 곳' : '집 밖';
      }
    } else {
      for (const [dir, mv] of Object.entries(arrowMap(state.pt, moves)) as [ArrowDir, DrillMove][]) {
        if (state.knownHot.includes(mv.edge)) continue;
        const cell = layout.byId.get(mv.to);
        targets[dir] = mv.to === OUT ? '집 밖' : (cell && cellLabel(cell.kind, cell.name)) || '옆 칸';
      }
    }
  }

  // 발자국 — 걸어온 자리에 반 칸마다 하나씩 남는다
  const trail = [...state.timeline.map((snap) => snap.walk), outWalk].filter((walk) => walk.length > 1);
  const prints = trail.flatMap((walk, w) => {
    const count = Math.max(1, Math.round(polylineLength(walk) / (0.5 * density)));
    return Array.from({ length: count }, (_, i) => {
      const a = pointAlong(walk, i / count);
      const b = pointAlong(walk, Math.min(1, (i + 0.5) / count));
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      return { key: `${w}-${i}`, x: a.x * u, y: a.y * u, angle, side: (w + i) % 2 ? 1 : -1 };
    });
  });

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
            setState(setCrouch(state, !state.crouch, config));
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
        <p className="tool-note" data-testid="drill-turn">{state.stats.moves}번 움직였어</p>
        <h3 className="tools-head">칭찬 도장</h3>
        <ul className="stamps" data-testid="stamps" data-earned={stampKey}>
          {stampSlots(band).map((id) => (
            <li key={id} className={stamps.includes(id) ? 'stamp on' : 'stamp'} data-testid={`stamp-${id}`} data-on={stamps.includes(id) ? '1' : '0'}>
              <span className="stamp-face"><StampGlyph id={id} /></span>
              <span className="stamp-name">{STAMPS[id].label}</span>
            </li>
          ))}
        </ul>
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
          heat={state.field}
          fire={{ cell: state.source, at: state.origin }}
          closedDoors={state.closed}
          onPointer={(kind, p) => {
            if (kind === 'up') tapAt(p);
          }}
          className="cursor-tap"
          zoomable
          ariaLabel="대피 연습 지도"
        >
          <g className="prints" data-testid="prints" data-count={prints.length}>
            {prints.map((p) => (
              <ellipse key={p.key} className="print" transform={`translate(${p.x} ${p.y}) rotate(${p.angle}) translate(0 ${p.side * 7})`} rx="9" ry="5" />
            ))}
          </g>
          {(state.tokens ?? []).map((token) => (
            <g key={token.id} className="token" transform={`translate(${token.pt.x * u} ${token.pt.y * u})`} data-testid={`token-${token.id}`}>
              <g className="token-bob">
                <circle r="25" />
                <g transform="translate(-16 -16)"><StampGlyph id={token.id} size={32} /></g>
              </g>
            </g>
          ))}
          {pos && (
            <g className={walking ? 'player walking' : 'player'} transform={`translate(${pos.x * u} ${pos.y * u}) scale(1.15)`} data-testid="player" data-at={state.at} data-phase={state.phase} data-met={met ? '1' : '0'}>
              <g className="player-hop">
                <KidGlyph look={look} crouch={state.crouch} />
              </g>
            </g>
          )}
        </PlanView>
        <ZoomControls plan={plan} />
        <ArrowPad targets={targets} onArrow={onArrow} label="방향키로 움직이기" center={<KidFace look={look} size={40} />} />
        {fresh && (
          <div className="stamp-toast" role="status" data-testid="stamp-toast" data-stamp={fresh}>
            <span className="stamp-face"><StampGlyph id={fresh} size={40} /></span>
            <span><b>도장 꽝!</b> {STAMPS[fresh].text}</span>
          </div>
        )}

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

        {callCard === 'meet' && <Celebration />}
        {callCard && (
          <div className={callCard === 'meet' ? 'card-over card-win' : 'card-over'} role="dialog" aria-modal="true" aria-label="119 전화">
            <h3>{callCard === 'meet' ? '가족을 만났어' : '문을 닫고 창가로'}</h3>
            <p>{callCard === 'meet' ? '119에 불이 났다고 말하고 우리 집 주소를 알려 주자.' : '대피공간이나 경량칸막이가 있으면 그쪽으로 가자. 없으면 불에서 먼 방의 문을 닫고 젖은 수건으로 틈을 막자. 그리고 119에 어디 있는지 알려 주자.'}</p>
            <button type="button" className="big-action" data-testid="drill-call" autoFocus onClick={call}>
              <IconPhone size={30} /> 119에 전화하기
            </button>
          </div>
        )}
      </section>
    </>
  );
}
