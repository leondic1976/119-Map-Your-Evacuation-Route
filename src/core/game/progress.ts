/**
 * 반복 연습의 순수 계산 — 설계서 v1.15.
 * 점수나 순위를 만들지 않고 자동 난이도, 배지, 주간 도장만 계산한다.
 */
import type { PracticeDifficulty } from '../../types/game';
import type { PlayLog } from '../../types/report';
import type { PracticeRecord, SafetyBadgeId, SaveProgress } from '../../types/save';

export interface BadgeDefinition {
  id: SafetyBadgeId;
  label: string;
  easyHint: string;
  normalHint: string;
  symbol: 'map' | 'exit' | 'crouch' | 'hand' | 'door' | 'route' | 'repeat' | 'calendar';
}

export const SAFETY_BADGES: BadgeDefinition[] = [
  { id: 'first-practice', label: '첫 연습', easyHint: '대피 연습을 한 번 끝내 보자.', normalHint: '대피 연습을 한 번 완료한다.', symbol: 'map' },
  { id: 'first-escape', label: '무사 대피', easyHint: '나가는 곳까지 무사히 가 보자.', normalHint: '나가는 곳까지 무사히 도착한다.', symbol: 'exit' },
  { id: 'low-posture', label: '낮은 자세', easyHint: '연습 중에 몸을 낮춰 보자.', normalHint: '연습 중 낮은 자세를 사용한다.', symbol: 'crouch' },
  { id: 'door-check', label: '문 확인', easyHint: '문을 열기 전에 먼저 만져 보자.', normalHint: '문을 열기 전에 온도를 확인한다.', symbol: 'hand' },
  { id: 'door-close', label: '문 닫기', easyHint: '지나온 문을 닫아 보자.', normalHint: '통과한 문을 닫는다.', symbol: 'door' },
  { id: 'route-follow', label: '지도 따라가기', easyHint: '그린 길을 따라 밖으로 나가 보자.', normalHint: '그린 경로를 절반 이상 따라 대피한다.', symbol: 'route' },
  { id: 'keep-going', label: '다시 도전', easyHint: '세 번 연습해 보자.', normalHint: '대피 연습을 세 번 완료한다.', symbol: 'repeat' },
  { id: 'four-week', label: '네 주 약속', easyHint: '4주 안전 약속표를 모두 채워 보자.', normalHint: '한 4주 안전 약속표를 모두 채운다.', symbol: 'calendar' },
];

export interface DifficultyDefinition {
  id: PracticeDifficulty;
  label: string;
  easyDescription: string;
  normalDescription: string;
  targetMissionIds: Array<'crouch' | 'touch-door' | 'close-door' | 'reach-exit'>;
}

export const PRACTICE_DIFFICULTIES: Record<PracticeDifficulty, DifficultyDefinition> = {
  guided: {
    id: 'guided',
    label: '차근차근',
    easyDescription: '위험이 천천히 퍼져. 두 가지부터 해 보자.',
    normalDescription: '위험이 천천히 진행되고 목표 두 가지를 연습한다.',
    targetMissionIds: ['crouch', 'reach-exit'],
  },
  varied: {
    id: 'varied',
    label: '새로운 상황',
    easyDescription: '새로운 불의 위치에서 세 가지를 해 보자.',
    normalDescription: '새로운 발화 위치에서 목표 세 가지를 연습한다.',
    targetMissionIds: ['crouch', 'touch-door', 'reach-exit'],
  },
  challenge: {
    id: 'challenge',
    label: '안전 행동 도전',
    easyDescription: '할 수 있는 안전 행동을 모두 모아 보자.',
    normalDescription: '이용 가능한 안전 행동을 모두 연습한다.',
    targetMissionIds: ['crouch', 'touch-door', 'close-door', 'reach-exit'],
  },
};

export function recommendedDifficulty(progress: SaveProgress): PracticeDifficulty {
  const recent = progress.practiceRecords.slice(-2);
  const struggling = recent.length === 2 && recent.every((record) => record.outcome === 'fail');
  let difficulty: PracticeDifficulty = progress.successes === 0
    ? 'guided'
    : progress.successes >= 3 && progress.earnedBadgeIds.length >= 4
      ? 'challenge'
      : 'varied';
  if (struggling) difficulty = difficulty === 'challenge' ? 'varied' : 'guided';
  return difficulty;
}

/** YYYY-MM-DD가 든 주의 월요일. UTC 산술로 지역 시차의 흔들림을 없앤다. */
export function mondayOf(dateKey: string): string {
  const date = new Date(`${dateKey.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateKey.slice(0, 10);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.floor((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export interface PracticeCalendarSlot {
  weekOf: string;
  mission: string;
  stamped: boolean;
  current: boolean;
}

export interface PracticeCalendar {
  cycle: number;
  slots: PracticeCalendarSlot[];
  stampedCount: number;
  completed: boolean;
}

const WEEKLY_MISSIONS = ['지도 따라 나가기', '몸 낮춰 나가기', '문 먼저 확인하기', '안전 행동 모아 하기'];

/** 첫 도장 주를 기준으로 현재 4주짜리 일정표를 만든다. */
export function buildPracticeCalendar(weekKeys: string[], todayKey: string): PracticeCalendar {
  const currentWeek = mondayOf(todayKey);
  const normalized = Array.from(new Set(weekKeys.map(mondayOf))).sort();
  const anchor = normalized[0] ?? currentWeek;
  const cycle = Math.max(0, Math.floor(Math.max(0, daysBetween(anchor, currentWeek)) / 28));
  const cycleStart = addDays(anchor, cycle * 28);
  const slots = WEEKLY_MISSIONS.map((mission, index) => {
    const weekOf = addDays(cycleStart, index * 7);
    return { weekOf, mission, stamped: normalized.includes(weekOf), current: weekOf === currentWeek };
  });
  const stampedCount = slots.filter((slot) => slot.stamped).length;
  return { cycle: cycle + 1, slots, stampedCount, completed: stampedCount === 4 };
}

function hasCompletedStampCard(weekKeys: string[]): boolean {
  const normalized = Array.from(new Set(weekKeys.map(mondayOf))).sort();
  if (normalized.length < 4) return false;
  const anchor = normalized[0];
  const cycles = Math.floor(Math.max(...normalized.map((key) => daysBetween(anchor, key))) / 28) + 1;
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const start = addDays(anchor, cycle * 28);
    if ([0, 7, 14, 21].every((days) => normalized.includes(addDays(start, days)))) return true;
  }
  return false;
}

export interface CompletePracticeInput {
  practicedAt: string;
  dateKey: string;
  difficulty: PracticeDifficulty;
  outcome: 'success' | 'fail';
  missionIds: string[];
  seed: number;
  playLog: PlayLog;
}

export interface CompletePracticeResult {
  progress: SaveProgress;
  newBadgeIds: SafetyBadgeId[];
  newStamp: boolean;
}

/** 한 판 결과를 저장 진행 기록으로 합친다. 같은 배지와 같은 주 도장은 중복시키지 않는다. */
export function completePractice(progress: SaveProgress, input: CompletePracticeInput): CompletePracticeResult {
  const weekOf = mondayOf(input.dateKey);
  const newStamp = !progress.practiceWeekKeys.includes(weekOf);
  const practiceWeekKeys = newStamp ? progress.practiceWeekKeys.concat([weekOf]).sort() : progress.practiceWeekKeys.slice();
  const record: PracticeRecord = {
    id: `practice-${progress.attempts}`,
    practicedAt: input.practicedAt,
    weekOf,
    difficulty: input.difficulty,
    outcome: input.outcome,
    missionIds: Array.from(new Set(input.missionIds)),
    seed: input.seed,
  };
  const practiceRecords = progress.practiceRecords.concat([record]).slice(-40);
  const candidates: SafetyBadgeId[] = ['first-practice'];
  if (input.outcome === 'success') candidates.push('first-escape');
  if (input.missionIds.includes('crouch')) candidates.push('low-posture');
  if (input.missionIds.includes('touch-door')) candidates.push('door-check');
  if (input.missionIds.includes('close-door')) candidates.push('door-close');
  if (input.outcome === 'success' && input.playLog.events.matchedDrawnRoute >= 0.5) candidates.push('route-follow');
  if (progress.attempts >= 3) candidates.push('keep-going');
  if (hasCompletedStampCard(practiceWeekKeys)) candidates.push('four-week');
  const previous = new Set(progress.earnedBadgeIds);
  const newBadgeIds = Array.from(new Set(candidates)).filter((id) => !previous.has(id));
  return {
    progress: {
      ...progress,
      earnedBadgeIds: progress.earnedBadgeIds.concat(newBadgeIds),
      practiceWeekKeys,
      practiceRecords,
    },
    newBadgeIds,
    newStamp,
  };
}
