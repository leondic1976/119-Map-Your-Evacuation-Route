'use client';

/**
 * 게임 조작 덮개 — docs/DESIGN-v1.1-changes.md §3.7 · §3.8.
 *
 * 캔버스는 KidsCanvas 가 그린다. 여기는 그 위에 얹는 단추와 게이지다.
 *   시간은 숫자가 아니라 게이지 (FR-8.1). 연습 모드가 기본 (FR-8.2)
 *   경고음·붉은 점멸 없음 (FR-8.4). 언제든 멈추고 그만둘 수 있다 (FR-8.6)
 *   단추는 56×56 이상 (§3.8)
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { adjacentDoor } from '../core/game/player';
import { useKids } from '../store/kidsStore';
import { playCrouch, playDetector, playDoor, playIntro, playStep, playSuccess, playVoice, unlockAudio } from './sound';

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
  /* 조작마다 아주 짧은 소리를 붙인다. 실패에는 아무 소리도 내지 않는다 (설계서 v1.2 §7.1 C3) */
  const soundRef = useRef(true);
  const moveTo = useCallback(
    (d: Parameters<typeof moveRaw>[0]) => {
      moveRaw(d);
      playStep(soundRef.current);
    },
    [moveRaw],
  );
  const toggle = useCallback(() => {
    const was = useKids.getState().game?.state.player.posture;
    toggleRaw();
    playCrouch(soundRef.current, was !== 'crouch');
    /* 몸을 낮출 때만 말해 준다 — 일어설 때까지 말하면 잔소리가 된다 */
    if (was !== 'crouch') playVoice('v-crouch', soundRef.current);
  }, [toggleRaw]);
  const closeDoor = useCallback(() => {
    closeDoorRaw();
    playDoor(soundRef.current, true);
    playVoice('v-close', soundRef.current);
  }, [closeDoorRaw]);
  const rang = useRef(false);

  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  /* 감지기 소리 — 시작 때 한 벌만 (설계서 v1.2 §7.1 C2) */
  useEffect(() => {
    if (status !== 'running' || rang.current) return;
    rang.current = true;
    unlockAudio();
    playIntro(soundOn);
    window.setTimeout(() => playDetector(soundOn), 480);
    /* 감지기가 울린 뒤에 말한다 — 겹치면 둘 다 안 들린다 */
    window.setTimeout(() => playVoice('v-start', soundRef.current), 2600);
  }, [status, soundOn]);

  /* 성공했을 때만 소리로 알린다. 실패에는 아무 소리도 내지 않는다 (C3) */
  useEffect(() => {
    if (status === 'success') {
      playSuccess(soundOn);
      window.setTimeout(() => playVoice('v-success', soundRef.current), 900);
    }
  }, [status, soundOn]);

  /* 틱 */
  useEffect(() => {
    if (status !== 'running') return;
    const t = setInterval(() => tick(), TICK_MS);
    return () => clearInterval(t);
  }, [status, tick]);

  /* 키보드 — 방향키·WASD 이동, 스페이스 자세, T 만져보기, C 문 닫기, P 멈춤 */
  useEffect(() => {
    if (!game) return;
    /* 틱마다 다시 걸지 않도록 저장소에서 바로 읽는다 */
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      const s = useKids.getState();
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') s.gameMove('up');
      else if (k === 'arrowdown' || k === 's') s.gameMove('down');
      else if (k === 'arrowleft' || k === 'a') s.gameMove('left');
      else if (k === 'arrowright' || k === 'd') s.gameMove('right');
      else if (k === ' ') s.gameToggle();
      else if (k === 't') s.gameTouch();
      else if (k === 'c') s.gameCloseDoor();
      else if (k === 'p') {
        if (s.game?.state.status === 'running') s.gamePause();
        else s.gameResume();
      } else return;
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

  return (
    <div className="k-game" data-coach="kids-game" data-status={st.status}>
      <div className="k-game-top">
        <div className="k-gauge" title="숨 — 연기를 마실수록 줄어든다">
          <span>{easy ? '숨' : '노출'}</span>
          <i className={`k-gauge-bar ${level(breath)}`}>
            <b style={{ width: `${Math.round(breath * 100)}%` }} />
          </i>
        </div>
        {st.config.timed ? (
          <div className="k-gauge" title="남은 시간">
            <span>시간</span>
            <i className={`k-gauge-bar ${level(timeLeft)}`}>
              <b style={{ width: `${Math.round(timeLeft * 100)}%` }} />
            </i>
          </div>
        ) : (
          <div className="k-gauge k-practice">
            <span>{easy ? '연습 모드 — 천천히 해도 돼' : '연습 모드 (시간제한 없음)'}</span>
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
        <span className="k-spacer" />
        <span className="k-posture-chip" data-posture={p.posture}>
          {p.posture === 'crouch' ? (easy ? '낮게' : '낮은 자세') : easy ? '서 있음' : '선 자세'}
        </span>
        {status === 'running' ? (
          <button type="button" className="k-tb sm" onClick={pause} data-coach="kids-pause">
            멈춤
          </button>
        ) : status === 'paused' ? (
          <button type="button" className="k-tb sm primary" onClick={resume}>
            이어서
          </button>
        ) : null}
        <button type="button" className="k-tb sm" onClick={quit} data-coach="kids-quit">
          그만하기
        </button>
      </div>

      {status === 'paused' && (
        <div className="k-game-pause" role="status">
          잠깐 멈췄어. 준비되면 “이어서”를 누르자.
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
          <button type="button" className="k-dp right" onClick={() => moveTo('right')} aria-label="오른쪽으로">
            <Arrow rot={90} />
          </button>
          <button type="button" className="k-dp down" onClick={() => moveTo('down')} aria-label="아래로">
            <Arrow rot={180} />
          </button>
        </div>
        <div className="k-game-actions">
          <button type="button" className={`k-act${p.posture === 'crouch' ? ' on' : ''}`} onClick={toggle} data-coach="kids-posture">
            {p.posture === 'crouch' ? (easy ? '일어서기' : '서기') : easy ? '낮게!' : '낮은 자세'}
          </button>
          <button type="button" className="k-act" onClick={touch} disabled={!doorNear} title="문을 열기 전에 손등으로 만져 본다">
            문 만져보기
          </button>
          <button type="button" className="k-act" onClick={closeDoor} disabled={!canClose} title="방금 지나온 문을 닫는다">
            문 닫기
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

function Arrow({ rot }: { rot: number }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M12 20V5" />
      <path d="M6 11l6-6 6 6" />
    </svg>
  );
}
