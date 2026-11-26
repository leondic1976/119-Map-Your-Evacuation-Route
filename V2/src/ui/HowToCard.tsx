/** 사용법 카드 — 손가락이 직접 눌러 보이는 움직이는 그림과 짧은 글 */
import { useEffect } from 'react';
import { howToFor, type HowToStep } from '../content/howto';
import { closeHowTo, currentBand } from '../store/app';
import { HandGlyph, IconClose } from './art';

/** 모눈종이 — 줄이 만나는 곳이 점이다(대장 #191) */
const Paper = ({ cols = 5, rows = 4 }: { cols?: number; rows?: number }) => (
  <path
    className="demo-grid"
    d={`${Array.from({ length: cols }, (_, x) => `M${60 + x * 50} 4V144`).join('')}${Array.from({ length: rows }, (_, y) => `M40 ${14 + y * 40}H280`).join('')}`}
  />
);

/** 방 둘 · 지나가는 곳 하나 · 집 밖 띠 */
function House({ paintA = true, door = true }: { paintA?: boolean; door?: boolean }) {
  return (
    <g>
      <rect x="10" y="140" width="300" height="28" rx="8" fill="#dcefcf" stroke="#9cc489" strokeWidth="2" strokeDasharray="6 5" />
      <text x="20" y="159" className="demo-word">집 밖</text>
      {paintA && <rect x="60" y="12" width="100" height="58" fill="#ffe3a3" />}
      <rect x="160" y="12" width="100" height="58" fill="#ffe3a3" />
      <rect x="60" y="70" width="200" height="60" fill="#c6e8f8" />
      <path d="M60 12H260V130H60ZM160 12V70M60 70H260" fill="none" stroke="#33363b" strokeWidth="5" strokeLinejoin="round" />
      {door && (
        <>
          <path d="M92 70H128" stroke="#fffdf6" strokeWidth="7" />
          <path d="M94 70V40" stroke="#9a5b2a" strokeWidth="5" strokeLinecap="round" />
          <path d="M182 130H218" stroke="#fffdf6" strokeWidth="7" />
          <path d="M184 130V100" stroke="#2e8b57" strokeWidth="5" strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

/** 작은 방향키 판 — 위·왼쪽·오른쪽·아래 */
function MiniPad() {
  const key = (x: number, y: number, d: string) => (
    <g transform={`translate(${x} ${y})`}>
      <rect width="18" height="18" rx="4" fill="#ffc94d" stroke="#33363b" strokeWidth="2" />
      <path d={d} fill="none" stroke="#33363b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
  return (
    <g>
      {key(20, 68, 'M9 14V4M5 8l4-4 4 4')}
      {key(2, 86, 'M14 9H4M8 5L4 9l4 4')}
      {key(38, 86, 'M4 9h10M10 5l4 4-4 4')}
      {key(20, 104, 'M9 4v10M5 10l4 4 4-4')}
    </g>
  );
}

function Kid({ className }: { className?: string }) {
  return (
    <g className={className}>
      <circle cx="0" cy="-4" r="9" fill="#f6d3b0" stroke="#33363b" strokeWidth="2.5" />
      <path d="M-9 13c0-7 4-9 9-9s9 2 9 9z" fill="#2f7fbf" stroke="#33363b" strokeWidth="2.5" />
    </g>
  );
}

function Demo({ step }: { step: HowToStep }) {
  switch (step) {
    case 'draw':
      return (
        <>
          <Paper />
          <path className="demo-line demo-draw-line" d="M60 14H260V134H60Z" />
          <g className="demo-hand demo-hand-draw"><HandGlyph /></g>
        </>
      );
    case 'sort':
      return (
        <>
          <House paintA={false} door={false} />
          <rect className="demo-fill" x="60" y="12" width="100" height="58" fill="#ffc94d" />
          <path d="M60 12H160V70H60Z" fill="none" stroke="#33363b" strokeWidth="5" />
          <g transform="translate(6 18)">
            <rect width="44" height="30" rx="8" fill="#fffdf6" stroke="#33363b" strokeWidth="3" />
            <circle cx="22" cy="15" r="9" fill="#fcc75f" stroke="#33363b" strokeWidth="2" />
          </g>
          <g className="demo-hand demo-hand-sort"><HandGlyph /></g>
        </>
      );
    case 'door':
      return (
        <>
          <House door={false} />
          <g className="demo-door">
            <path d="M92 70H128" stroke="#fffdf6" strokeWidth="7" />
            <path d="M94 70V40" stroke="#9a5b2a" strokeWidth="5" strokeLinecap="round" />
          </g>
          <g className="demo-hand demo-hand-door"><HandGlyph /></g>
        </>
      );
    case 'mark':
      return (
        <>
          <House />
          <g transform="translate(6 18)">
            <rect width="44" height="34" rx="8" fill="#ffd98a" stroke="#33363b" strokeWidth="3" />
            <g transform="translate(22 16) scale(.7)"><Kid /></g>
          </g>
          <g className="demo-fill" transform="translate(120 40)"><Kid /></g>
          <g className="demo-hand demo-hand-mark"><HandGlyph /></g>
        </>
      );
    case 'route':
      return (
        <>
          <House />
          <MiniPad />
          <rect className="demo-glow-a" x="20" y="104" width="18" height="18" rx="4" fill="#fff" />
          <rect className="demo-glow-b" x="38" y="86" width="18" height="18" rx="4" fill="#fff" />
          <path className="demo-seg-a" d="M110 40V100" stroke="#d6402f" strokeWidth="6" strokeLinecap="round" fill="none" />
          <path className="demo-seg-b" d="M110 100H200V154" stroke="#d6402f" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <g transform="translate(110 38)"><Kid /></g>
          <g className="demo-hand demo-hand-route"><HandGlyph /></g>
        </>
      );
    case 'drill':
      return (
        <>
          <House />
          <path d="M110 40V100H200V154" stroke="#d6402f" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".5" />
          <g transform="translate(6 82)">
            <rect width="46" height="34" rx="9" fill="#3e9d5d" stroke="#33363b" strokeWidth="3" />
            <path d="M18 9v16l14-8z" fill="#fff" />
          </g>
          <path d="M212 20c9 9 13 17 9 24-2 3-5 5-9 5s-7-2-9-5c-3-7 2-12 5-15 1 3 2 4 4 4 1-4 1-9 0-13z" fill="#f59a23" stroke="#33363b" strokeWidth="2" />
          <Kid className="demo-kid-drill" />
          <g className="demo-hand demo-hand-follow"><HandGlyph /></g>
        </>
      );
  }
}

export function HowToCard({ step }: { step: HowToStep }) {
  const info = howToFor(step, currentBand());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeHowTo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={info.title} data-testid="howto" data-howto={step}>
      <div className="sheet howto">
        <button type="button" className="x" aria-label="닫기" data-testid="howto-close" onClick={closeHowTo}><IconClose /></button>
        <h2>{info.title}</h2>
        <svg className="demo" viewBox="0 0 320 172" aria-hidden="true">
          <Demo step={step} />
        </svg>
        <ol className="howto-steps">
          {info.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
        <button type="button" className="big-action" data-testid="howto-ok" autoFocus onClick={closeHowTo}>알겠어!</button>
      </div>
    </div>
  );
}
