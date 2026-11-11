/**
 * 방향키 판 — 지도 위에 떠 있고, 누르면 그쪽으로 한 칸 간다(대장 #148 · #155).
 * 나가는 길과 대피 연습이 함께 쓴다. 갈 수 있는 쪽만 켜지고, 손잡이를 누르면 반대쪽 아래로 옮겨 간다.
 */
import { useState, type ReactNode } from 'react';
import type { ArrowDir } from '../core/path';
import { IconUndo } from './art';

const PAD: { dir: ArrowDir; label: string; d: string }[] = [
  { dir: 'up', label: '위쪽', d: 'M14 23V5M6 13l8-8 8 8' },
  { dir: 'left', label: '왼쪽', d: 'M23 14H5M13 6l-8 8 8 8' },
  { dir: 'right', label: '오른쪽', d: 'M5 14h18M15 6l8 8-8 8' },
  { dir: 'down', label: '아래쪽', d: 'M14 5v18M6 15l8 8 8-8' },
];

interface Props {
  /** 갈 수 있는 쪽과 그쪽에 있는 곳의 이름 */
  targets: Partial<Record<ArrowDir, string>>;
  onArrow: (dir: ArrowDir) => void;
  label: string;
  /** 가운데 단추 — 한 칸 뒤로. 없으면 `center` 를 그린다 */
  onBack?: () => void;
  backDisabled?: boolean;
  center?: ReactNode;
}

export function ArrowPad({ targets, onArrow, label, onBack, backDisabled, center }: Props) {
  const [left, setLeft] = useState(false);
  return (
    <div className={left ? 'arrow-pad left' : 'arrow-pad'} role="group" aria-label={label} data-testid="arrow-pad">
      <button type="button" className="pad-btn small" style={{ gridArea: 'move' }} data-testid="pad-move" aria-label="방향키를 다른 쪽으로 옮기기" onClick={() => setLeft((v) => !v)}>
        <svg viewBox="0 0 28 28" width="24" height="24" aria-hidden="true">{[9, 19].flatMap((x) => [7, 14, 21].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.4" fill="currentColor" />))}</svg>
      </button>
      {PAD.map((key) => {
        const to = targets[key.dir];
        return (
          <button key={key.dir} type="button" className={to ? 'pad-btn go' : 'pad-btn'} style={{ gridArea: key.dir }} data-testid={`pad-${key.dir}`} data-to={to ?? ''} aria-label={to ? `${key.label}: ${to} 쪽으로 가기` : `${key.label}: 갈 수 없음`} aria-disabled={!to} onClick={() => onArrow(key.dir)}>
            <svg viewBox="0 0 28 28" width="32" height="32" aria-hidden="true"><path d={key.d} fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        );
      })}
      {onBack ? (
        <button type="button" className="pad-btn small" style={{ gridArea: 'back' }} data-testid="pad-back" aria-label="한 칸 뒤로" disabled={backDisabled} onClick={onBack}>
          <IconUndo size={24} />
        </button>
      ) : (
        <span className="pad-center" style={{ gridArea: 'back' }} aria-hidden="true">{center}</span>
      )}
    </div>
  );
}
