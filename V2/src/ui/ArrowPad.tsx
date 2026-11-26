/**
 * 방향키 판 — 지도 위에 떠 있고, 누르면 그쪽으로 모눈 한 칸 간다(대장 #148 · #155 · #160).
 * 나가는 길과 대피 연습이 함께 쓴다. 갈 수 있는 쪽만 켜지고, 손잡이를 누르면 반대쪽 아래로 옮겨 간다.
 * 누르고 있으면 이어서 간다. 키보드 방향키가 같은 일을 한다.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import type { ArrowDir } from '../core/path';
import { getApp } from '../store/app';

const PAD: { dir: ArrowDir; label: string; d: string }[] = [
  { dir: 'up', label: '위쪽', d: 'M14 23V5M6 13l8-8 8 8' },
  { dir: 'left', label: '왼쪽', d: 'M23 14H5M13 6l-8 8 8 8' },
  { dir: 'right', label: '오른쪽', d: 'M5 14h18M15 6l8 8-8 8' },
  { dir: 'down', label: '아래쪽', d: 'M14 5v18M6 15l8 8 8-8' },
];

/** 누르고 있을 때 이어서 가기까지 기다리는 시간과 되풀이하는 간격 */
const HOLD_MS = 420;
const REPEAT_MS = 170;

/** 화살표 키를 받는다. 사용법 카드나 설정이 떠 있으면 받지 않는다 */
export function useArrowKeys(onArrow: (dir: ArrowDir) => void, active = true): void {
  const latest = useRef(onArrow);
  latest.current = onArrow;
  useEffect(() => {
    if (!active) return;
    const names: Record<string, ArrowDir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    const onKey = (e: KeyboardEvent) => {
      const dir = names[e.key];
      if (!dir || getApp().howTo || document.querySelector('.overlay')) return;
      e.preventDefault();
      latest.current(dir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}

/** 누르고 있으면 되풀이하는 단추의 손잡이들 */
export function useHold(action: () => void): { onPointerDown: () => void; onPointerUp: () => void; onPointerLeave: () => void; onPointerCancel: () => void; onClick: () => void } {
  const latest = useRef(action);
  latest.current = action;
  const timer = useRef(0);
  const repeated = useRef(false);
  const stop = () => {
    window.clearTimeout(timer.current);
    window.clearInterval(timer.current);
    timer.current = 0;
  };
  useEffect(() => stop, []);
  return {
    onPointerDown: () => {
      stop();
      repeated.current = false;
      timer.current = window.setTimeout(() => {
        repeated.current = true;
        latest.current();
        timer.current = window.setInterval(() => latest.current(), REPEAT_MS);
      }, HOLD_MS);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    // 누르고 있어 이미 갔으면 손을 뗄 때 한 번 더 가지 않는다
    onClick: () => {
      if (repeated.current) repeated.current = false;
      else latest.current();
    },
  };
}

function PadKey({ dir, label, d, to, onArrow }: { dir: ArrowDir; label: string; d: string; to: string | undefined; onArrow: (dir: ArrowDir) => void }) {
  const hold = useHold(() => onArrow(dir));
  return (
    <button type="button" className={to ? 'pad-btn go' : 'pad-btn'} style={{ gridArea: dir }} data-testid={`pad-${dir}`} data-to={to ?? ''} aria-label={to ? `${label}: ${to} 쪽으로 가기` : `${label}: 갈 수 없음`} aria-disabled={!to} {...hold}>
      <svg viewBox="0 0 28 28" width="32" height="32" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );
}

interface Props {
  /** 갈 수 있는 쪽과 그쪽에 있는 곳의 이름 */
  targets: Partial<Record<ArrowDir, string>>;
  onArrow: (dir: ArrowDir) => void;
  label: string;
  /** 판 위에 적는 한 줄 */
  title: string;
  /** 가운데 단추 */
  center: { testid: string; label: string; icon: ReactNode; onClick: () => void; disabled?: boolean; strong?: boolean };
  /** 지도를 눌렀을 때 잠깐 흔들어 여기를 쓰라고 알린다 */
  nudge?: number;
  /** 판이 왼쪽 아래에 있는가. 지도는 판의 반대쪽으로 붙어 가려지지 않는다 */
  left: boolean;
  onSide: (left: boolean) => void;
}

export function ArrowPad({ targets, onArrow, label, title, center, nudge = 0, left, onSide }: Props) {
  return (
    <div className={left ? 'arrow-pad left' : 'arrow-pad'} role="group" aria-label={label} data-testid="arrow-pad" data-nudge={nudge}>
      <p className="pad-title">{title}</p>
      <div key={nudge} className={nudge ? 'pad-keys nudged' : 'pad-keys'}>
        <button type="button" className="pad-btn small" style={{ gridArea: 'move' }} data-testid="pad-move" aria-label="방향키를 다른 쪽으로 옮기기" onClick={() => onSide(!left)}>
          <svg viewBox="0 0 28 28" width="24" height="24" aria-hidden="true">{[9, 19].flatMap((x) => [7, 14, 21].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.4" fill="currentColor" />))}</svg>
        </button>
        {PAD.map((key) => <PadKey key={key.dir} {...key} to={targets[key.dir]} onArrow={onArrow} />)}
        <button type="button" className={center.strong ? 'pad-btn center strong' : 'pad-btn center'} style={{ gridArea: 'back' }} data-testid={center.testid} aria-label={center.label} title={center.label} disabled={center.disabled} onClick={center.onClick}>
          {center.icon}
        </button>
      </div>
    </div>
  );
}
