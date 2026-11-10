/**
 * 손 아래 그림 — 지도 위에서 마우스 화살표 대신 지금 놓을 것의 모양이 따라다닌다(대장 #137).
 * 지도와 같은 크기로 보여서 놓였을 때의 크기를 미리 안다. 손가락으로 누르는 기기에서는 보이지 않는다.
 * 손을 움직일 때마다 화면을 다시 그리지 않도록 자리만 직접 옮긴다.
 */
import { useEffect, useRef, type ReactNode } from 'react';

/** 그림 좌표로 이만큼(처음 네모 한 칸이 100)까지 그린다 */
const REACH = 130;

export function CursorGhost({ children, name }: { children: ReactNode; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const hide = () => {
      if (ref.current) ref.current.style.display = 'none';
    };
    const move = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const target = e.target instanceof Element ? e.target.closest('svg.plan') : null;
      if (!(target instanceof SVGSVGElement) || e.pointerType === 'touch') {
        hide();
        return;
      }
      const scale = target.getScreenCTM()?.a ?? 1;
      el.style.display = 'block';
      el.style.transform = `translate(${e.clientX}px, ${e.clientY}px) scale(${scale})`;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', move);
    window.addEventListener('blur', hide);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', move);
      window.removeEventListener('blur', hide);
    };
  }, []);
  return (
    <div ref={ref} className="ghost" data-testid="cursor-ghost" data-ghost={name} aria-hidden="true" style={{ display: 'none' }}>
      <svg viewBox={`${-REACH} ${-REACH} ${REACH * 2} ${REACH * 2}`} width={REACH * 2} height={REACH * 2} style={{ position: 'absolute', left: -REACH, top: -REACH, overflow: 'visible' }}>
        {children}
      </svg>
    </div>
  );
}
