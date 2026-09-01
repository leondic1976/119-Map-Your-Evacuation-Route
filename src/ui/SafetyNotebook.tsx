'use client';

import React, { useEffect } from 'react';
import { buildPracticeCalendar, PRACTICE_DIFFICULTIES, recommendedDifficulty, SAFETY_BADGES } from '../core/game/progress';
import type { SafetyBadgeId, SaveProgress } from '../types/save';

function localDateKey(): string {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

function shortDate(dateKey: string): string {
  const [, month, day] = dateKey.split('-');
  return `${Number(month)}월 ${Number(day)}일 주`;
}

export function GreatJobStamp({ small = false }: { small?: boolean }) {
  const size = small ? 62 : 84;
  return (
    <svg className="k-great-stamp" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="참 잘했어요 도장">
      <circle cx="50" cy="50" r="45" />
      <circle cx="50" cy="50" r="38" strokeDasharray="3 4" />
      <path d="M30 31c6-7 13-10 20-10s14 3 20 10M27 68c8 8 15 11 23 11s16-3 23-11" />
      <text x="50" y="49" textAnchor="middle">참 잘했어요</text>
      <path d="M34 58l10 8 22-22" />
    </svg>
  );
}

export function BadgeSymbol({ id, earned = true }: { id: SafetyBadgeId; earned?: boolean }) {
  const badge = SAFETY_BADGES.find((item) => item.id === id);
  const symbol = badge?.symbol ?? 'map';
  return (
    <svg className="k-badge-symbol" viewBox="0 0 64 64" aria-hidden="true" data-earned={earned}>
      <path className="medal" d="M21 42l-3 17 14-7 14 7-3-17" />
      <circle className="face" cx="32" cy="28" r="23" />
      {symbol === 'map' && <><path d="M17 20l10-4 10 4 10-4v25l-10 4-10-4-10 4z" /><path d="M27 16v25m10-21v25" /></>}
      {symbol === 'exit' && <><path d="M21 43V15h20v28" /><path d="M31 29h17m-6-6 6 6-6 6" /><circle cx="27" cy="29" r="1.5" /></>}
      {symbol === 'crouch' && <><circle cx="25" cy="19" r="4" /><path d="M27 24l8 8-5 8m5-8 9 1m-14 7-10 2m7-18-7 8" /></>}
      {symbol === 'hand' && <><path d="M22 40V25c0-3 4-3 4 0v7-13c0-3 4-3 4 0v12-15c0-3 4-3 4 0v15-12c0-3 4-3 4 0v15l4-5c2-2 5 0 4 3l-6 10c-2 3-5 5-9 5-5 0-9-2-9-7z" /></>}
      {symbol === 'door' && <><path d="M20 46V13h25v33M27 17v29" /><circle cx="31" cy="31" r="1.5" /></>}
      {symbol === 'route' && <><circle cx="18" cy="42" r="4" /><circle cx="46" cy="18" r="4" /><path d="M22 42c18 0 6-20 20-23" strokeDasharray="4 3" /><path d="M38 17l5 2-2 5" /></>}
      {symbol === 'repeat' && <><path d="M18 25c3-8 13-12 22-8l5 3" /><path d="M40 14l6 6-7 5M46 35c-3 8-13 12-22 8l-5-3" /><path d="M24 46l-6-6 7-5" /></>}
      {symbol === 'calendar' && <><rect x="17" y="17" width="30" height="28" rx="3" /><path d="M17 25h30M24 13v8m16-8v8M23 32l5 5 12-10" /></>}
    </svg>
  );
}

export function BadgeShelf({ progress, easy, compact = false }: { progress: SaveProgress; easy: boolean; compact?: boolean }) {
  const earned = new Set(progress.earnedBadgeIds);
  const badges = compact ? SAFETY_BADGES.filter((badge) => earned.has(badge.id)).slice(-4) : SAFETY_BADGES;
  return (
    <ul className={`k-badge-shelf${compact ? ' compact' : ''}`} aria-label="안전 배지 도감">
      {badges.map((badge) => {
        const has = earned.has(badge.id);
        return (
          <li key={badge.id} className={has ? 'earned' : 'locked'} data-badge={badge.id} data-earned={has}>
            <BadgeSymbol id={badge.id} earned={has} />
            <span><b>{has ? badge.label : '아직 빈자리'}</b>{!compact && <small>{has ? '안전 행동을 기억했어.' : easy ? badge.easyHint : badge.normalHint}</small>}</span>
          </li>
        );
      })}
      {compact && badges.length === 0 && <li className="empty">첫 연습을 마치면 배지가 생겨.</li>}
    </ul>
  );
}

export function ScheduleStrip({ progress, compact = false }: { progress: SaveProgress; compact?: boolean }) {
  const calendar = buildPracticeCalendar(progress.practiceWeekKeys, localDateKey());
  return (
    <ol className={`k-stamp-calendar${compact ? ' compact' : ''}`} aria-label="4주 안전 약속표" data-stamps={calendar.stampedCount}>
      {calendar.slots.map((slot, index) => (
        <li key={slot.weekOf} className={`${slot.stamped ? 'stamped' : ''}${slot.current ? ' current' : ''}`} data-week={slot.weekOf} data-stamped={slot.stamped}>
          <small>{index + 1}주 · {shortDate(slot.weekOf)}</small>
          <b>{slot.mission}</b>
          {slot.stamped ? <GreatJobStamp small /> : <span className="k-stamp-space">도장 자리</span>}
        </li>
      ))}
    </ol>
  );
}

export default function SafetyNotebook({ progress, easy, onClose }: { progress: SaveProgress; easy: boolean; onClose: () => void }) {
  const difficulty = PRACTICE_DIFFICULTIES[recommendedDifficulty(progress)];
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="k-notebook-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="k-notebook" role="dialog" aria-modal="true" aria-labelledby="safety-notebook-title" data-coach="kids-safety-notebook">
        <header>
          <div className="k-notebook-mark"><BookIcon /></div>
          <div>
            <p>나의 반복 연습 기록</p>
            <h2 id="safety-notebook-title">119 안전 수첩</h2>
          </div>
          <button type="button" className="k-x" onClick={onClose} aria-label="안전 수첩 닫기">×</button>
        </header>

        <div className="k-notebook-summary">
          <div><span>연습</span><b>{progress.attempts}번</b></div>
          <div><span>무사 대피</span><b>{progress.successes}번</b></div>
          <div><span>모은 배지</span><b>{progress.earnedBadgeIds.length}개</b></div>
          <div className="difficulty"><span>다음 연습</span><b>{difficulty.label}</b><small>{easy ? difficulty.easyDescription : difficulty.normalDescription}</small></div>
        </div>

        <section className="k-notebook-section">
          <div className="k-notebook-heading">
            <div><p>한 주에 한 번씩 천천히</p><h3>4주 안전 약속표</h3></div>
            <span>같은 주에 더 연습해도 배지는 계속 모을 수 있어.</span>
          </div>
          <ScheduleStrip progress={progress} />
        </section>

        <section className="k-notebook-section badges">
          <div className="k-notebook-heading">
            <div><p>안전 행동을 해낼 때마다</p><h3>안전 배지 도감</h3></div>
            <span>비어 있는 배지를 눌러야 할 필요는 없어. 연습하면 저절로 채워져.</span>
          </div>
          <BadgeShelf progress={progress} easy={easy} />
        </section>
      </section>
    </div>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M7 9h13c3 0 4 2 4 5v27c0-3-2-5-5-5H7z" />
      <path d="M41 9H28c-3 0-4 2-4 5v27c0-3 2-5 5-5h12z" />
      <path d="M12 16h7m-7 6h7m10-6h7m-7 6h7" />
    </svg>
  );
}
