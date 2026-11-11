/** 그림 모음 — 전부 벡터다. 이모지를 쓰지 않는다 */
import type { CSSProperties, ReactNode } from 'react';
import type { Emotion, Speaker } from '../content/lines';
import { LOOKS, type LookId } from '../content/names';
import type { MarkId } from '../core/types';

export function GuideAvatar({ speaker, emotion, size = 92 }: { speaker: Speaker; emotion: Emotion; size?: number }) {
  // 서 있는 자세만 쓴다. 공식 그림의 보통 자세는 침대에 누운 모습이고 생각 자세는 책상 앞이라 안내에 맞지 않는다
  const pose = emotion === 'alert' ? 'alert' : emotion === 'thinking' || emotion === 'worried' ? 'worried' : 'happy';
  const file = speaker === 'ilgu' ? 'ilgu_happy' : `${speaker}_${pose}`;
  return <img className={`guide-avatar ${speaker}`} src={`./art/${file}.webp`} alt="" height={size} style={{ height: size }} />;
}

function Svg({ size, children, style }: { size: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={style} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export const IconPencil = ({ size = 26 }: { size?: number }) => (
  <Svg size={size}><path d="M4 20l1.2-4.8L16.5 3.9a2 2 0 0 1 2.8 0l.8.8a2 2 0 0 1 0 2.8L8.8 18.8z" /><path d="M14.5 6l3.5 3.5" /></Svg>
);
export const IconEraser = ({ size = 26 }: { size?: number }) => (
  <Svg size={size}><path d="M8 20h12" /><path d="M5.5 15.5l9-10a2 2 0 0 1 2.9 0l2.1 2.1a2 2 0 0 1 0 2.8L12 18.5H8.5z" /></Svg>
);
export const IconUndo = ({ size = 26 }: { size?: number }) => (
  <Svg size={size}><path d="M8 5L3.5 9.5 8 14" /><path d="M4 9.5h10a6 6 0 0 1 0 12h-3" /></Svg>
);
export const IconHelp = ({ size = 26 }: { size?: number }) => (
  <Svg size={size}><path d="M12 21s-7.5-4.5-7.5-10.2A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 7.5 2.8C19.5 16.5 12 21 12 21z" /></Svg>
);
export const IconNext = ({ size = 26 }: { size?: number }) => (
  <Svg size={size}><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></Svg>
);
export const IconClose = ({ size = 24 }: { size?: number }) => (
  <Svg size={size}><path d="M6 6l12 12M18 6L6 18" /></Svg>
);
export const IconMenu = ({ size = 26 }: { size?: number }) => (
  <Svg size={size}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>
);
export const IconDoor = ({ size = 26 }: { size?: number }) => (
  <Svg size={size}><path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" /><path d="M3 21h18" /><circle cx="14.5" cy="12" r="1" fill="currentColor" /></Svg>
);
export const IconWindow = ({ size = 26 }: { size?: number }) => (
  <Svg size={size}><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M12 4v16M4 12h16" /></Svg>
);
export const IconQuestion = ({ size = 26 }: { size?: number }) => (
  <Svg size={size}><circle cx="12" cy="12" r="9.5" /><path d="M9.2 9.3a2.9 2.9 0 1 1 4.6 2.4c-1 .7-1.8 1.3-1.8 2.6" /><circle cx="12" cy="17.4" r=".7" fill="currentColor" /></Svg>
);
export const IconHome = ({ size = 26 }: { size?: number }) => (
  <Svg size={size}><path d="M3.5 11.5 12 4l8.5 7.5" /><path d="M6 10v10h12V10" /><path d="M10 20v-6h4v6" /></Svg>
);
export const IconCheck = ({ size = 22 }: { size?: number }) => (
  <Svg size={size}><path d="M5 12.5l4.5 4.5L19 7" /></Svg>
);
export const IconDot = ({ size = 22 }: { size?: number }) => (
  <Svg size={size}><circle cx="12" cy="12" r="6" /></Svg>
);
export const IconSpeaker = ({ size = 26, on = true }: { size?: number; on?: boolean }) => (
  <Svg size={size}>
    <path d="M4 10v4h3.5L12 18V6L7.5 10z" />
    {on ? <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
  </Svg>
);
export const IconPrint = ({ size = 26 }: { size?: number }) => (
  <Svg size={size}><path d="M7 8V3h10v5" /><rect x="3" y="8" width="18" height="9" rx="2" /><path d="M7 14h10v7H7z" /></Svg>
);
export const IconPlay = ({ size = 26 }: { size?: number }) => (
  <Svg size={size}><path d="M7 4.5v15l12-7.5z" /></Svg>
);
export const IconCube = ({ size = 26 }: { size?: number }) => (
  <Svg size={size}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></Svg>
);
export const IconPhone = ({ size = 26 }: { size?: number }) => (
  <Svg size={size}><path d="M6 3h3l1.8 5-2.3 1.6a12 12 0 0 0 5.9 5.9L16 13.2l5 1.8v3a3 3 0 0 1-3.3 3C10 20.2 3.8 14 3 6.3A3 3 0 0 1 6 3z" /></Svg>
);
export const IconCrouch = ({ size = 26 }: { size?: number }) => (
  <Svg size={size}><circle cx="17" cy="9" r="2.5" /><path d="M4 18c3-4 6-6 10-6" /><path d="M9 21l2-6 5 1 1 5" /></Svg>
);
export const IconStand = ({ size = 26 }: { size?: number }) => (
  <Svg size={size}><circle cx="12" cy="5" r="2.5" /><path d="M12 8v7M8 11h8M12 15l-3 6M12 15l3 6" /></Svg>
);
export const IconHand = ({ size = 26 }: { size?: number }) => (
  <Svg size={size}><path d="M8 13V6a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v8" /><path d="M8 11l-1.5-1.5a1.5 1.5 0 0 0-2.2 2L8.5 18a5 5 0 0 0 4 2h1a4 4 0 0 0 4-4v-3" /></Svg>
);

/** 칭찬 도장과 길 위의 안전 행동 그림. 선으로만 그린다 */
export function StampGlyph({ id, size = 26 }: { id: string; size?: number }) {
  const d: Record<string, string> = {
    // 외치는 입과 소리
    shout: 'M4 10v4l6 3V7zM14 9a4 4 0 0 1 0 6M17 6a8 8 0 0 1 0 12',
    // 코와 입을 가린 수건
    nose: 'M5 9h14v6a7 7 0 0 1-14 0zM5 9l-2-2M19 9l2-2M9 13h6',
    // 낮춘 몸
    crouch: 'M17 9a2.5 2.5 0 1 0 0-.01M4 18c3-4 6-6 10-6M9 21l2-6 5 1 1 5',
    // 문에 댄 손
    touch: 'M6 3h9v18H6zM13 12h.01M18 9v6M21 10v4',
    // 닫힌 문
    close: 'M5 21V3h11v18M3 21h18M13 12h.01',
    // 계단
    stairs: 'M3 20h5v-4h4v-4h4V8h5',
    // 깃발
    meet: 'M6 21V3M6 4l12 3.5L6 11',
  };
  return <Svg size={size}><path d={d[id] ?? d.meet} /></Svg>;
}

/** 누르는 손가락 — (0,0) 이 손가락 끝이다 */
export function HandGlyph({ scale = 1 }: { scale?: number }) {
  return (
    <g transform={`scale(${scale})`}>
      <path
        d="M0 0c2-1 4 0 4 3v12l1-1c2-1 4 0 4 2 2-1 4 0 4 2 2-1 4 0 4 2v8c0 6-4 10-10 10H6c-4 0-6-2-8-5L-10 21c-1-2 0-4 2-4 1 0 2 0 3 1l1 2V3c0-2 2-3 4-3z"
        fill="#fff"
        stroke="#33363b"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** 지도 위 표시 — 100 단위 칸에 맞춘 벡터. (0,0) 이 가운데다 */
export function MarkGlyph({ id, look }: { id: MarkId; look?: LookId }) {
  switch (id) {
    case 'me':
      return <KidGlyph look={look ?? 'a'} />;
    case 'meet':
      return (
        <g>
          <path d="M-12 26V-26" stroke="#33363b" strokeWidth="6" strokeLinecap="round" />
          <path d="M-10-26 24-15-10-3z" fill="#3e9d5d" stroke="#33363b" strokeWidth="4" strokeLinejoin="round" />
          <ellipse cx="-12" cy="28" rx="18" ry="5" fill="#33363b" opacity=".25" />
        </g>
      );
    case 'gas':
      return (
        <g>
          <rect x="-24" y="4" width="48" height="20" rx="4" fill="#fff" stroke="#33363b" strokeWidth="4" />
          <path d="M-16 4h32" stroke="#33363b" strokeWidth="4" />
          <path d="M0-26c10 10 13 17 9 24-2 3-5 5-9 5s-8-2-9-5c-3-7 2-12 5-15 1 4 2 5 4 5 1-4 1-9 0-14z" fill="#f59a23" stroke="#33363b" strokeWidth="3.5" strokeLinejoin="round" />
        </g>
      );
    case 'extinguisher':
      return (
        <g>
          <rect x="-12" y="-14" width="24" height="42" rx="9" fill="#d6402f" stroke="#33363b" strokeWidth="4" />
          <path d="M-4-14v-8h8v8M4-22h13l6 6" fill="none" stroke="#33363b" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="-7" y="0" width="14" height="10" rx="2" fill="#fff" />
        </g>
      );
    case 'alarm':
      return (
        <g>
          <circle r="22" fill="#fff" stroke="#33363b" strokeWidth="4" />
          <circle r="7" fill="#d6402f" />
          <path d="M-13 0a13 13 0 0 1 13-13M13 0a13 13 0 0 1-13 13" fill="none" stroke="#33363b" strokeWidth="3" strokeLinecap="round" />
        </g>
      );
  }
}

/** 아이 얼굴 — 지도 위 말과 이름표가 함께 쓴다 */
export function KidGlyph({ look, crouch = false }: { look: LookId; crouch?: boolean }) {
  const spec = LOOKS.find((l) => l.id === look) ?? LOOKS[0];
  return (
    <g transform={crouch ? 'translate(0 8) scale(1 .72)' : undefined}>
      <ellipse cx="0" cy="33" rx="20" ry="5" fill="#33363b" opacity=".22" />
      <path d="M-18 33c0-15 8-22 18-22s18 7 18 22z" fill={spec.shirt} stroke="#33363b" strokeWidth="3.5" strokeLinejoin="round" />
      <circle cx="0" cy="-6" r="20" fill="#f6d3b0" stroke="#33363b" strokeWidth="3.5" />
      {hair(spec.style, spec.hair)}
      <circle cx="-7" cy="-5" r="2.6" fill="#33363b" />
      <circle cx="7" cy="-5" r="2.6" fill="#33363b" />
      <path d="M-5 4c3 3 7 3 10 0" fill="none" stroke="#33363b" strokeWidth="2.6" strokeLinecap="round" />
    </g>
  );
}

function hair(style: string, color: string) {
  const common = { fill: color, stroke: '#33363b', strokeWidth: 3, strokeLinejoin: 'round' as const };
  switch (style) {
    case 'long':
      return <path d="M-21-6c-3 16 0 24 4 28l4-18V-14c8 4 18 4 26 0v18l4 18c4-4 7-12 4-28-3-26-39-26-42 0z" {...common} />;
    case 'curly':
      return <path d="M-19-10c-6-8 2-14 7-14 2-6 12-8 16-3 7-2 13 3 11 9 5 3 4 9 1 12-8-8-26-8-35-4z" {...common} />;
    case 'pony':
      return (
        <g>
          <path d="M16-14c13-2 15 13 8 22-1-9-4-15-11-16z" {...common} />
          <path d="M-20-8c-2-22 40-22 40 0-12-6-28-6-40 0z" {...common} />
        </g>
      );
    case 'cap':
      return (
        <g>
          <path d="M-20-10c0-20 40-20 40 0z" fill="#e0603f" stroke="#33363b" strokeWidth="3" strokeLinejoin="round" />
          <path d="M-20-10h46" stroke="#33363b" strokeWidth="5" strokeLinecap="round" />
        </g>
      );
    case 'twin':
      return (
        <g>
          <circle cx="-23" cy="-8" r="8" {...common} />
          <circle cx="23" cy="-8" r="8" {...common} />
          <path d="M-20-8c-2-22 40-22 40 0-12-6-28-6-40 0z" {...common} />
        </g>
      );
    default:
      return <path d="M-20-8c-3-22 43-22 40 0-6-5-12-6-18-3-7-3-14-1-22 3z" {...common} />;
  }
}

export function KidFace({ look, size = 72 }: { look: LookId; size?: number }) {
  return (
    <svg viewBox="-36 -36 72 76" width={size} height={size} aria-hidden="true">
      <KidGlyph look={look} />
    </svg>
  );
}
