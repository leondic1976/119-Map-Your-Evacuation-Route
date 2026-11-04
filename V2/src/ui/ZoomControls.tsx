/**
 * 지도 확대·축소 단추. 그리기가 손에 익지 않은 아이는 크게 보고 그리고, 익숙한 아이는 전체를 보고 그린다.
 * 잡아 둔 점이 있으면 그 점을 기준으로, 없으면 지금 보는 곳의 가운데를 기준으로 커진다.
 */
import { clampView, fullView, viewBoxOf, zoomAround, ZOOM_MAX, ZOOM_STEP } from '../core/zoom';
import type { Plan, Pt } from '../core/types';
import { setPanMode, setView, useApp } from '../store/app';
import { planBox, unitOf } from './PlanView';

const Glass = ({ plus }: { plus: boolean }) => (
  <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
    <circle cx="12" cy="12" r="8" fill="#fff" stroke="currentColor" strokeWidth="3" />
    <path d="M18 18l7 7" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    <path d={plus ? 'M8 12h8M12 8v8' : 'M8 12h8'} stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

const Whole = () => (
  <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
    <path d="M4 10V4h6M18 4h6v6M24 18v6h-6M10 24H4v-6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Move = () => (
  <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
    <path d="M14 3v22M3 14h22M14 3l-4 4M14 3l4 4M14 25l-4-4M14 25l4-4M3 14l4-4M3 14l4 4M25 14l-4-4M25 14l-4 4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function ZoomControls({ plan, focus }: { plan: Plan; focus?: Pt | null }) {
  const stored = useApp((s) => s.view);
  const panMode = useApp((s) => s.panMode);
  const box = planBox(plan);
  const view = stored ? clampView(stored, box) : fullView(box);
  const zoomed = view.scale > 1.001;

  const change = (scale: number) => {
    const shown = viewBoxOf(view, box);
    const at = focus ? { x: focus.x * unitOf(plan), y: focus.y * unitOf(plan) } : { x: shown.x + shown.w / 2, y: shown.y + shown.h / 2 };
    setView(zoomAround(view, box, scale, at));
  };

  return (
    <div className="zoom-bar" role="group" aria-label="지도 크기">
      <button type="button" className="zoom-btn" data-testid="zoom-in" aria-label="지도 크게 보기" disabled={view.scale >= ZOOM_MAX} onClick={() => change(view.scale * ZOOM_STEP)}>
        <Glass plus />
      </button>
      <button type="button" className="zoom-btn" data-testid="zoom-out" aria-label="지도 작게 보기" disabled={!zoomed} onClick={() => change(view.scale / ZOOM_STEP)}>
        <Glass plus={false} />
      </button>
      {zoomed && (
        <>
          <button type="button" className={panMode ? 'zoom-btn on' : 'zoom-btn'} data-testid="zoom-pan" aria-label="끌어서 종이 옮기기" aria-pressed={panMode} onClick={() => setPanMode(!panMode)}>
            <Move />
          </button>
          <button type="button" className="zoom-btn" data-testid="zoom-fit" aria-label="지도 전체 보기" onClick={() => setView(null)}>
            <Whole />
          </button>
        </>
      )}
    </div>
  );
}
