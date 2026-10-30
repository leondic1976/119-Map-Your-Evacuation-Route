'use client';

/**
 * 게임 조작 덮개 — docs/DESIGN-v1.1-changes.md §3.7 · §3.8 · v2.0 §8 (게임 프로그램처럼).
 *
 * 캔버스는 KidsCanvas 가 그린다. 여기는 그 위에 얹는 막대·미션·단추·안내다.
 *   시작 브리핑   무슨 일이 났고 이번에 할 일이 무엇인지 카드 한 장. 읽는 동안은 시간이 멈춰 있고(틱만), 「시작!」이나 첫 조작으로 걷힌다
 *   게임 막대     숨 게이지 · 시계 · 이번 연습 · 미션 · 자세 · 멈춤 · 그만하기 (어두운 띠)
 *   멈춤 카드     이어서 · 조작법 · 그만하기
 *   숨 흐림       숨이 줄수록 가장자리가 어두워진다 — 점멸은 없다 (FR-8.4)
 *   시간은 숫자가 아니라 게이지 (FR-8.1). 연습 모드가 기본 (FR-8.2). 언제든 멈추고 그만둘 수 있다 (FR-8.6). 단추는 56×56 이상 (§3.8)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { adjacentDoor } from '../core/game/player';
import { safetyMissions } from '../core/game/missions';
import { PRACTICE_DIFFICULTIES } from '../core/game/progress';
import { useKids } from '../store/kidsStore';
import { playCrouch, playDetector, playDoor, playIntro, playStep, unlockAudio } from './sound';

const TICK_MS = 250;

/** 초를 '분 초'로 — 숫자가 늘어나는 시계다. 줄어드는 제한이 아니다 (설계서 v1.2 §4.1) */
export function clockText(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}분 ${String(s).padStart(2, '0')}초` : `${s}초`;
}

export default function GameView() {
  const game = useKids((s) => s.game);
  const easy = useKids((s) => s.profile.gradeMode === 'easy');
  const tick = useKids((s) => s.gameTickNow);
  const moveRaw = useKids((s) => s.gameMove);
  const toggleRaw = useKids((s) => s.gameToggle);
  const touch = useKids((s) => s.gameTouch);
  const closeDoorRaw = useKids((s) => s.gameCloseDoor);
  const pause = useKids((s) => s.gamePause);
  const resume = useKids((s) => s.gameResume);
  const quit = useKids((s) => s.gameQuit);

  const soundOn = useKids((s) => s.profile.soundOn);
  const best = useKids((s) => s.progress.bestTicks);
  const status = game?.state.status;
  /* 시작 브리핑 — 읽는 동안 시간이 흐르지 않는다. 첫 조작이나 「시작!」으로 걷힌다 */
  const [briefing, setBriefing] = useState(true);
  const go = useCallback(() => setBriefing(false), []);
  /* 조작마다 아주 짧은 소리를 붙인다. 실패에는 아무 소리도 내지 않는다 (설계서 v1.2 §7.1 C3) */
  const moveTo = useCallback(
    (d: Parameters<typeof moveRaw>[0]) => {
      setBriefing(false);
      moveRaw(d);
      playStep();
    },
    [moveRaw],
  );
  const toggle = useCallback(() => {
    setBriefing(false);
    const was = useKids.getState().game?.state.player.posture;
    toggleRaw();
    playCrouch(was !== 'crouch');
  }, [toggleRaw]);
  const closeDoor = useCallback(() => {
    closeDoorRaw();
    playDoor(true);
  }, [closeDoorRaw]);
  const rang = useRef(false);

  /* 감지기 소리 — 시작 때 한 벌만 (설계서 v1.2 §7.1 C2) */
  useEffect(() => {
    if (status !== 'running' || rang.current) return;
    rang.current = true;
    unlockAudio();
    playIntro();
    const detectorTimer = window.setTimeout(() => playDetector(), 480);
    return () => {
      window.clearTimeout(detectorTimer);
    };
  }, [status, soundOn]);

  /* 틱 — 브리핑을 읽는 동안은 멈춰 있다 */
  useEffect(() => {
    if (status !== 'running' || briefing) return;
    const t = setInterval(() => tick(), TICK_MS);
    return () => clearInterval(t);
  }, [status, tick, briefing]);

  /* 키보드 — 방향키·WASD 이동, 스페이스 자세, T 만져보기, C 문 닫기, P 멈춤, Enter 시작 */
  useEffect(() => {
    if (!game) return;
    /* 틱마다 다시 걸지 않도록 저장소에서 바로 읽는다 */
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      const s = useKids.getState();
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') {
        s.gameMove('up');
        playStep();
      } else if (k === 'arrowdown' || k === 's') {
        s.gameMove('down');
        playStep();
      } else if (k === 'arrowleft' || k === 'a') {
        s.gameMove('left');
        playStep();
      } else if (k === 'arrowright' || k === 'd') {
        s.gameMove('right');
        playStep();
      } else if (k === ' ') {
        const was = s.game?.state.player.posture;
        s.gameToggle();
        playCrouch(was !== 'crouch');
      } else if (k === 't') s.gameTouch();
      else if (k === 'c') {
        s.gameCloseDoor();
        playDoor(true);
      } else if (k === 'p') {
        if (s.game?.state.status === 'running') s.gamePause();
        else s.gameResume();
      } else if (k === 'enter') {
        /* 브리핑의 「시작!」 */
      } else return;
      setBriefing(false);
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(game)]);

  if (!game) return null;
  const st = game.state;
  const p = st.player;
  const breath = 1 - p.exposure;
  const timeLeft = st.config.timed ? Math.max(0, 1 - st.tick / st.preset.timeLimitTicks) : 1;
  const elapsed = Math.round(st.tick * (st.preset.tickSeconds ?? 1));
  const level = (v: number): string => (v > 0.5 ? 'ok' : v > 0.25 ? 'warn' : 'low');
  const doorNear = adjacentDoor(st, game.ctx);
  const canClose = Boolean(p.lastDoorId && st.doorState[p.lastDoorId] !== 'closed');
  const stuck = st.tick < p.stuckUntil;
  const missions = safetyMissions(game, easy);
  const difficulty = PRACTICE_DIFFICULTIES[st.config.difficulty ?? 'challenge'];
  const targets = missions.filter((mission) => mission.available && mission.target);
  const targetCount = targets.length;
  /* 숨이 줄수록 가장자리가 어두워진다 — 서서히, 점멸 없이 */
  const dim = Math.max(0, Math.min(0.85, (0.6 - breath) * 1.4));

  return (
    <div className="k-game" data-coach="kids-game" data-status={st.status} data-briefing={briefing && st.status === 'running' ? 'true' : undefined}>
      <div className="k-game-vignette" aria-hidden="true" style={{ opacity: dim }} />

      <div className="k-game-top">
        <div className="k-gauge" title="숨 — 연기를 마실수록 줄어든다. 몸을 낮추면 덜 마신다">
          <BreathIcon />
          <span>{easy ? '숨' : '노출'}</span>
          <i className={`k-gauge-bar ${level(breath)}`}>
            <b style={{ width: `${Math.round(breath * 100)}%` }} />
          </i>
        </div>
        {st.config.timed ? (
          <div className="k-gauge" title="남은 시간">
            <ClockIcon />
            <span>시간</span>
            <i className={`k-gauge-bar ${level(timeLeft)}`}>
              <b style={{ width: `${Math.round(timeLeft * 100)}%` }} />
            </i>
          </div>
        ) : (
          <div className="k-gauge k-practice" title="시간제한이 없다. 넘겨도 지지 않는다">
            <span>{easy ? '연습 모드' : '시간제한 없는 연습'}</span>
          </div>
        )}
        {/* 우리집 시계 — 늘어나는 시각이다. 넘겨도 지지 않는다 */}
        <div className="k-clock" data-coach="kids-clock" title="집을 나가기까지 걸린 시간. 넘겨도 지지 않는다">
          <ClockIcon />
          <b className="num">{clockText(elapsed)}</b>
          {best !== undefined && (
            <small>
              {easy ? '가장 빨랐을 때 ' : '최고 '}
              {clockText(Math.round(best * (st.preset.tickSeconds ?? 1)))}
            </small>
          )}
        </div>
        <div className="k-game-difficulty" data-difficulty={difficulty.id} title={easy ? difficulty.easyDescription : difficulty.normalDescription}>
          <span>이번 연습</span><b>{difficulty.label}</b><small>먼저 할 목표 {targetCount}개</small>
        </div>
        <ol className="k-game-missions" aria-label={easy ? '이번 대피 연습에서 해 볼 것' : '안전 행동 미션'}>
          {missions.map((mission) => (
            <li key={mission.id} className={`${mission.done ? 'done' : mission.available ? '' : 'not-needed'}${mission.target ? ' target' : ' extra'}`} data-mission={mission.id} data-done={mission.done} data-target={mission.target}>
              <MissionMark done={mission.done} available={mission.available} />
              <span>{mission.label}{mission.target && <small>이번 목표</small>}</span>
            </li>
          ))}
        </ol>
        <span className="k-spacer" />
        <span className="k-posture-chip" data-posture={p.posture} title="스페이스로 바꾼다">
          <PostureIcon crouch={p.posture === 'crouch'} />
          {p.posture === 'crouch' ? (easy ? '낮게' : '낮은 자세') : easy ? '서 있음' : '선 자세'}
        </span>
        {status === 'running' ? (
          <button type="button" className="k-gb" onClick={pause} data-coach="kids-pause" title="멈춤 (P)">
            <PauseIcon /> 멈춤
          </button>
        ) : status === 'paused' ? (
          <button type="button" className="k-gb primary" onClick={resume} title="이어서 (P)">
            <PlayIcon /> 이어서
          </button>
        ) : null}
        <button type="button" className="k-gb quit" onClick={quit} data-coach="kids-quit" title="여기까지 하고 결과를 본다">
          그만하기
        </button>
      </div>

      {/* 시작 브리핑 — 무슨 일이 났고, 이번에 무엇을 해 볼지 */}
      {briefing && status === 'running' && (
        <div className="k-game-brief" role="dialog" aria-labelledby="k-brief-title" data-coach="kids-briefing">
          <p className="k-brief-eyebrow">대피 연습 · {difficulty.label}</p>
          <h2 id="k-brief-title">{easy ? '불이 났어! 침착하게 밖으로 나가자.' : '화재 발생 — 침착하게 대피한다.'}</h2>
          <p className="k-brief-lede">{easy ? difficulty.easyDescription : difficulty.normalDescription}</p>
          <ol className="k-brief-targets" aria-label="이번 목표">
            {targets.map((mission, index) => (
              <li key={mission.id}>
                <i>{index + 1}</i>
                <span>{mission.label}</span>
              </li>
            ))}
          </ol>
          <ul className="k-brief-keys" aria-label="조작법">
            <li><kbd>↑↓←→</kbd> 움직이기</li>
            <li><kbd>Space</kbd> {easy ? '낮게 / 일어서기' : '자세 바꾸기'}</li>
            <li><kbd>T</kbd> 문 만져보기</li>
            <li><kbd>C</kbd> 문 닫기</li>
            <li><kbd>P</kbd> 멈춤</li>
          </ul>
          <button type="button" className="k-brief-go" onClick={go} autoFocus data-coach="kids-briefing-go">
            <PlayIcon /> 시작!
          </button>
          <small>{easy ? '읽는 동안은 시간이 멈춰 있어. 움직이면 바로 시작돼.' : '읽는 동안 시간은 멈춰 있다. 조작하면 시작된다.'}</small>
        </div>
      )}

      {status === 'paused' && (
        <div className="k-game-pause-card" role="dialog" aria-labelledby="k-pause-title">
          <h2 id="k-pause-title">잠깐 멈췄어</h2>
          <p>{easy ? '준비되면 「이어서」를 누르자. 불은 기다려 주지만 진짜 불은 기다려 주지 않아.' : '준비되면 이어서를 누른다.'}</p>
          <ul className="k-brief-keys" aria-label="조작법">
            <li><kbd>↑↓←→</kbd> 움직이기</li>
            <li><kbd>Space</kbd> {easy ? '낮게 / 일어서기' : '자세'}</li>
            <li><kbd>T</kbd> 문 만져보기</li>
            <li><kbd>C</kbd> 문 닫기</li>
          </ul>
          <div className="k-pause-actions">
            <button type="button" className="k-brief-go" onClick={resume} autoFocus>
              <PlayIcon /> 이어서
            </button>
            <button type="button" className="k-gb quit light" onClick={quit}>
              그만하기
            </button>
          </div>
        </div>
      )}
      {stuck && status === 'running' && (
        <div className="k-game-pause" role="status">
          승강기가 움직이지 않는다… 시간만 간다.
        </div>
      )}

      <div className="k-game-bottom">
        <div className="k-dpad" role="group" aria-label="이동">
          <button type="button" className="k-dp up" onClick={() => moveTo('up')} aria-label="위로">
            <Arrow rot={0} />
          </button>
          <button type="button" className="k-dp left" onClick={() => moveTo('left')} aria-label="왼쪽으로">
            <Arrow rot={-90} />
          </button>
          <span className="k-dp-center" aria-hidden="true" />
          <button type="button" className="k-dp right" onClick={() => moveTo('right')} aria-label="오른쪽으로">
            <Arrow rot={90} />
          </button>
          <button type="button" className="k-dp down" onClick={() => moveTo('down')} aria-label="아래로">
            <Arrow rot={180} />
          </button>
        </div>
        <div className="k-game-actions">
          <button type="button" className={`k-act${p.posture === 'crouch' ? ' on' : ''}`} onClick={toggle} data-coach="kids-posture" title="연기는 위에 모인다. 낮게 가면 덜 마신다 (Space)">
            <PostureIcon crouch={p.posture !== 'crouch'} />
            <span>{p.posture === 'crouch' ? (easy ? '일어서기' : '서기') : easy ? '낮게!' : '낮은 자세'}</span>
          </button>
          <button type="button" className="k-act" onClick={touch} disabled={!doorNear} title="문을 열기 전에 손등으로 만져 본다. 뜨거우면 열지 않는다 (T)">
            <HandIcon />
            <span>문 만져보기</span>
          </button>
          <button type="button" className="k-act" onClick={closeDoor} disabled={!canClose} title="방금 지나온 문을 닫으면 연기가 늦게 따라온다 (C)">
            <DoorIcon />
            <span>문 닫기</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function BreathIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v9" />
      <path d="M9 9c-3 0-5 2.5-5 6s2 5 4 5 3-1.5 3-4v-3M15 9c3 0 5 2.5 5 6s-2 5-4 5-3-1.5-3-4v-3" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 4l12 8-12 8z" />
    </svg>
  );
}

function PostureIcon({ crouch }: { crouch: boolean }) {
  return crouch ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M5 20l3-6 5 1 3 5M8 14l2-3 5 1" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="5" r="2.5" />
      <path d="M12 8v7M9 21l3-6 3 6M8 12l4-2 4 2" />
    </svg>
  );
}

function HandIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 13V6a1.5 1.5 0 0 1 3 0v6M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v8" />
      <path d="M8 13l-2-2.5a1.6 1.6 0 0 0-2.6 1.8L7 18c1.2 2 3 3 5.5 3 3.6 0 5.5-2.4 5.5-5.6V14" />
    </svg>
  );
}

function DoorIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

function MissionMark({ done, available }: { done: boolean; available: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      {done ? <path d="M7.8 12.2l2.7 2.8 5.8-6" /> : available ? <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" /> : <path d="M8 12h8" />}
    </svg>
  );
}

function Arrow({ rot }: { rot: number }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M12 20V5" />
      <path d="M6 11l6-6 6 6" />
    </svg>
  );
}
