'use client';

/**
 * 내 캐릭터 10종 — 남학생 5 · 여학생 5 (설계서 v1.2 §6.2 개정).
 *
 * 한 벌의 그리기 규칙으로 열 명을 만든다. 다르게 보이는 것은 머리 모양·머리 색·피부 톤·
 * 옷 색·소품(안경·모자·머리띠)이고, 얼굴 뼈대와 칠하는 방식은 같다.
 * 그래야 열 명이 한 가족처럼 보이면서도 자기 캐릭터를 알아볼 수 있다.
 *
 * 칠하는 규칙 — 밑칠 · 그늘 · 하이라이트 세 톤. 검은 굵은 외곽선을 두르지 않는다.
 * 세 가지 크기로 쓴다.
 *   portrait  고르는 화면 (64~96px). 얼굴이 주인공이다
 *   token     게임 말 (36px). 작아도 머리 모양과 옷 색으로 구분된다
 *   full      첫 화면 그림 (전신)
 *
 * 전부 벡터다. 비트맵·이모지를 쓰지 않는다 (CON-4 · N-06).
 */
import React from 'react';

export type KidId =
  | 'boy_cap'
  | 'boy_glasses'
  | 'boy_curly'
  | 'boy_sport'
  | 'boy_beanie'
  | 'girl_twin'
  | 'girl_bob'
  | 'girl_braid'
  | 'girl_pony'
  | 'girl_band';

export interface KidSpec {
  id: KidId;
  name: string;
  /** 화면에 곁들이는 한 줄 */
  note: string;
  skin: string;
  skinShade: string;
  hair: string;
  hairShade: string;
  /** 머리 모양 */
  style: 'cap' | 'short' | 'curly' | 'crop' | 'beanie' | 'twin' | 'bob' | 'braid' | 'pony' | 'band';
  top: string;
  topShade: string;
  bottom: string;
  /** 소품 */
  glasses?: boolean;
  accent?: string;
}

/* 피부 세 톤 — 사람은 여러 빛깔이다 */
const SKIN = {
  light: ['#f6d3b0', '#dcab84'],
  mid: ['#e8b78d', '#c8916a'],
  deep: ['#c58c62', '#a06c47'],
} as const;

export const KIDS: KidSpec[] = [
  {
    id: 'boy_cap', name: '준호', note: '모자를 좋아해',
    skin: SKIN.light[0], skinShade: SKIN.light[1],
    hair: '#2b1d16', hairShade: '#160f0b', style: 'cap',
    top: '#1f6f5c', topShade: '#14503f', bottom: '#2f3b4c', accent: '#f0b429',
  },
  {
    id: 'boy_glasses', name: '시우', note: '책을 많이 읽어',
    skin: SKIN.mid[0], skinShade: SKIN.mid[1],
    hair: '#1f1712', hairShade: '#0f0b08', style: 'short',
    top: '#c8623a', topShade: '#a04a2a', bottom: '#3b4657', glasses: true,
  },
  {
    id: 'boy_curly', name: '도윤', note: '웃음이 많아',
    skin: SKIN.deep[0], skinShade: SKIN.deep[1],
    hair: '#241611', hairShade: '#120a07', style: 'curly',
    top: '#3f6fb5', topShade: '#2c5290', bottom: '#26303e', accent: '#ffffff',
  },
  {
    id: 'boy_sport', name: '하준', note: '달리기가 빨라',
    skin: SKIN.light[0], skinShade: SKIN.light[1],
    hair: '#37241a', hairShade: '#1d130d', style: 'crop',
    top: '#c8102e', topShade: '#96091f', bottom: '#1f2a38', accent: '#ffffff',
  },
  {
    id: 'boy_beanie', name: '은우', note: '조용히 잘 챙겨',
    skin: SKIN.mid[0], skinShade: SKIN.mid[1],
    hair: '#2a1b13', hairShade: '#150d09', style: 'beanie',
    top: '#4a5568', topShade: '#333c4c', bottom: '#2b3342', accent: '#e2b04a',
  },
  {
    id: 'girl_twin', name: '서연', note: '노래를 잘해',
    skin: SKIN.light[0], skinShade: SKIN.light[1],
    hair: '#3a2318', hairShade: '#1e120c', style: 'twin',
    top: '#d76c8c', topShade: '#b04d6c', bottom: '#5b3b52', accent: '#ffd166',
  },
  {
    id: 'girl_bob', name: '지우', note: '그림을 잘 그려',
    skin: SKIN.mid[0], skinShade: SKIN.mid[1],
    hair: '#1c1410', hairShade: '#0d0907', style: 'bob',
    top: '#e0a92e', topShade: '#b8871d', bottom: '#39536b', accent: '#ffffff',
  },
  {
    id: 'girl_braid', name: '하윤', note: '동생을 잘 돌봐',
    skin: SKIN.deep[0], skinShade: SKIN.deep[1],
    hair: '#1a100b', hairShade: '#0b0706', style: 'braid',
    top: '#5f8f4e', topShade: '#456b39', bottom: '#3a4a3c', accent: '#f6efe0',
  },
  {
    id: 'girl_pony', name: '수아', note: '운동을 좋아해',
    skin: SKIN.light[0], skinShade: SKIN.light[1],
    hair: '#4a2c1b', hairShade: '#2a1810', style: 'pony',
    top: '#2f7fa8', topShade: '#215d7c', bottom: '#26313f', accent: '#ffffff',
  },
  {
    id: 'girl_band', name: '지아', note: '무엇이든 물어봐',
    skin: SKIN.mid[0], skinShade: SKIN.mid[1],
    hair: '#2f1c12', hairShade: '#18100a', style: 'band',
    top: '#8a6bb5', topShade: '#6a4f92', bottom: '#33384a', accent: '#ffe08a',
  },
];

export const KID_BY_ID: Record<string, KidSpec> = Object.fromEntries(KIDS.map((k) => [k.id, k]));

export function kidOf(id: string): KidSpec {
  return KID_BY_ID[id] ?? KIDS[0];
}

const INK = '#171d24';

/* ------------------------------------------------------------------ */
/* 얼굴 — portrait 와 full 이 함께 쓴다                                 */
/* ------------------------------------------------------------------ */

/** 머리 뒤로 넘어가는 부분 (땋은 머리·포니테일 등). 얼굴보다 먼저 그린다 */
function HairBack({ k }: { k: KidSpec }) {
  switch (k.style) {
    case 'twin':
      return (
        <g>
          <ellipse cx={-40} cy={12} rx={13} ry={26} fill={k.hair} />
          <ellipse cx={40} cy={12} rx={13} ry={26} fill={k.hair} />
          <ellipse cx={-40} cy={22} rx={11} ry={16} fill={k.hairShade} opacity={0.5} />
          <ellipse cx={40} cy={22} rx={11} ry={16} fill={k.hairShade} opacity={0.5} />
        </g>
      );
    case 'pony':
      return (
        <g>
          <path d="M28 -18 q34 6 34 44 q0 22 -14 26 q-10 2 -8 -10 q6 -22 -16 -46z" fill={k.hair} />
          <path d="M40 6 q14 12 12 34" stroke={k.hairShade} strokeWidth={4} fill="none" opacity={0.55} />
        </g>
      );
    case 'braid':
      return (
        <g>
          <path d="M-30 -6 q-22 12 -20 44 q2 16 12 14 q8 -2 4 -14 q-6 -20 8 -34z" fill={k.hair} />
          <path d="M30 -6 q22 12 20 44 q-2 16 -12 14 q-8 -2 -4 -14 q6 -20 -8 -34z" fill={k.hair} />
          {[16, 30, 44].map((y) => (
            <g key={y}>
              <path d={`M-34 ${y} q8 4 14 0`} stroke={k.hairShade} strokeWidth={3} fill="none" opacity={0.6} />
              <path d={`M20 ${y} q8 4 14 0`} stroke={k.hairShade} strokeWidth={3} fill="none" opacity={0.6} />
            </g>
          ))}
        </g>
      );
    case 'bob':
      return <path d="M-38 -8 q0 44 10 54 q28 8 56 0 q10 -10 10 -54z" fill={k.hair} />;
    case 'band':
      return <path d="M-36 -8 q-2 40 8 50 q28 8 56 0 q10 -10 8 -50z" fill={k.hair} />;
    default:
      return null;
  }
}

/** 이마 위로 오는 부분. 얼굴 뒤에 그린다 */
function HairFront({ k }: { k: KidSpec }) {
  const base = <path d="M-35 -8 q-2 -44 35 -44 q37 0 35 44 q-8 -26 -35 -26 q-27 0 -35 26z" fill={k.hair} />;
  switch (k.style) {
    case 'cap':
      return (
        <g>
          {base}
          {/* 야구모자 */}
          <path d="M-36 -12 q0 -42 36 -42 q36 0 36 42 q-36 -12 -72 0z" fill={k.top} />
          <path d="M-36 -12 q0 -42 36 -42 q-16 14 -18 42z" fill={k.topShade} />
          <path d="M-38 -12 q38 -11 76 0 q6 8 -4 10 q-34 -9 -68 0 q-10 -2 -4 -10z" fill={k.topShade} />
          <circle cx={0} cy={-50} r={4} fill={k.accent ?? '#fff'} />
        </g>
      );
    case 'beanie':
      return (
        <g>
          {base}
          <path d="M-36 -10 q0 -40 36 -40 q36 0 36 40 q-36 -10 -72 0z" fill={k.top} />
          <path d="M-40 -12 h80 v13 q-40 8 -80 0z" fill={k.topShade} />
          {[-24, -8, 8, 24].map((x) => (
            <path key={x} d={`M${x} -46 v34`} stroke={k.topShade} strokeWidth={2} opacity={0.45} />
          ))}
          <circle cx={0} cy={-52} r={7} fill={k.accent ?? '#fff'} />
        </g>
      );
    case 'curly':
      return (
        <g>
          {[-30, -14, 2, 18, 32].map((x, i) => (
            <circle key={x} cx={x} cy={-34 + (i % 2) * 8} r={16} fill={k.hair} />
          ))}
          <circle cx={-24} cy={-16} r={13} fill={k.hair} />
          <circle cx={26} cy={-16} r={13} fill={k.hair} />
          <circle cx={-16} cy={-38} r={8} fill={k.hairShade} opacity={0.45} />
        </g>
      );
    case 'crop':
      return (
        <g>
          <path d="M-34 -12 q-2 -42 34 -42 q36 0 34 42 q-10 -20 -34 -20 q-24 0 -34 20z" fill={k.hair} />
          <path d="M-14 -50 q10 12 30 10" stroke={k.hairShade} strokeWidth={4} fill="none" opacity={0.5} />
        </g>
      );
    case 'twin':
      return (
        <g>
          {base}
          <path d="M-34 -14 q14 -18 34 -12 q20 6 34 12 q-6 -34 -34 -34 q-28 0 -34 34z" fill={k.hairShade} opacity={0.4} />
        </g>
      );
    case 'band':
      return (
        <g>
          {base}
          <path d="M-37 -18 q37 -14 74 0 q2 8 -4 9 q-33 -12 -66 0 q-6 -1 -4 -9z" fill={k.accent ?? '#ffd166'} />
          <circle cx={-28} cy={-16} r={5} fill={k.accent ?? '#ffd166'} />
        </g>
      );
    case 'bob':
      return (
        <g>
          {base}
          <path d="M-36 -12 q16 -16 36 -14 q-14 -8 -22 -6 z" fill={k.hairShade} opacity={0.4} />
        </g>
      );
    default:
      return base;
  }
}

/** 얼굴 하나 — 반지름 40 기준 좌표계 (원점이 얼굴 가운데) */
export function KidFace({ k, mood = 'happy' }: { k: KidSpec; mood?: 'happy' | 'calm' }) {
  return (
    <g>
      <HairBack k={k} />
      {/* 얼굴 */}
      <path d="M-34 -4 q0 -42 34 -42 q34 0 34 42 q0 40 -34 46 q-34 -6 -34 -46z" fill={k.skin} />
      <path d="M-34 -4 q0 -42 34 -42 q-14 16 -16 42 q-2 28 6 46 q-24 -8 -24 -46z" fill={k.skinShade} opacity={0.5} />
      {/* 귀 */}
      <ellipse cx={-35} cy={4} rx={5} ry={8} fill={k.skin} />
      <ellipse cx={35} cy={4} rx={5} ry={8} fill={k.skin} />
      <HairFront k={k} />
      {/* 볼 */}
      <ellipse cx={-19} cy={16} rx={8.5} ry={5.5} fill="#e08a78" opacity={0.32} />
      <ellipse cx={19} cy={16} rx={8.5} ry={5.5} fill="#e08a78" opacity={0.32} />
      {/* 눈 */}
      <g>
        <ellipse cx={-14} cy={2} rx={6} ry={7.2} fill={INK} />
        <ellipse cx={14} cy={2} rx={6} ry={7.2} fill={INK} />
        <circle cx={-11.8} cy={-1.2} r={2.1} fill="#ffffff" />
        <circle cx={16.2} cy={-1.2} r={2.1} fill="#ffffff" />
        <circle cx={-15.6} cy={4.6} r={1} fill="#ffffff" opacity={0.6} />
        <circle cx={12.4} cy={4.6} r={1} fill="#ffffff" opacity={0.6} />
      </g>
      {/* 눈썹 */}
      <path d="M-22 -11 q8 -5 16 -1" stroke={k.hairShade} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <path d="M6 -12 q8 -4 16 1" stroke={k.hairShade} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      {/* 코·입 */}
      <path d="M0 8 q3 4 -1 6" stroke={k.skinShade} strokeWidth={2} fill="none" strokeLinecap="round" />
      {mood === 'happy' ? (
        <path d="M-8 22 q8 9 17 0" stroke={INK} strokeWidth={2.8} fill="none" strokeLinecap="round" />
      ) : (
        <path d="M-7 23 h15" stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      )}
      {/* 안경 */}
      {k.glasses && (
        <g stroke="#2f3a46" strokeWidth={2.6} fill="none">
          <circle cx={-14} cy={2} r={11} fill="#cfe3f3" fillOpacity={0.28} />
          <circle cx={14} cy={2} r={11} fill="#cfe3f3" fillOpacity={0.28} />
          <path d="M-3 2 h6 M-25 -1 l-9 -3 M25 -1 l9 -3" />
        </g>
      )}
    </g>
  );
}

/** 고르는 화면에 쓰는 얼굴 — 어깨까지 */
export function KidPortrait({ id, size = 84 }: { id: string; size?: number }) {
  const k = kidOf(id);
  return (
    <svg width={size} height={size} viewBox="-58 -74 116 116" aria-hidden="true">
      {/* 뒤 원 — 인물이 뜨게 한다 */}
      <circle cx={0} cy={-8} r={54} fill={k.top} opacity={0.14} />
      {/* 어깨 */}
      <path d="M-44 42 q6 -28 44 -28 q38 0 44 28z" fill={k.top} />
      <path d="M-44 42 q6 -28 44 -28 q-18 10 -22 28z" fill={k.topShade} />
      <path d="M-9 14 h18 v12 q-9 5 -18 0z" fill={k.skinShade} />
      <KidFace k={k} />
    </svg>
  );
}

/** 게임 말 — 36px 에서도 머리 모양과 옷 색으로 구분된다 */
export function KidToken({ id, size, posture, facing }: { id: string; size: number; posture: 'stand' | 'crouch'; facing: 'left' | 'right' }) {
  const k = kidOf(id);
  const sx = facing === 'left' ? -1 : 1;
  const sy = posture === 'crouch' ? 0.66 : 1;
  const r = size * 0.34;
  return (
    <g transform={`translate(${size / 2} ${size / 2}) scale(${sx} ${sy})`} className="k-player">
      <ellipse cy={r * 1.02} rx={r * 0.98} ry={r * 0.34} fill="#000" opacity={0.24} />
      {/* 어깨 */}
      <path d={`M${-r} ${r * 0.75} q${r * 0.2} ${-r * 0.7} ${r} ${-r * 0.7} q${r * 0.8} 0 ${r} ${r * 0.7}z`} fill={k.top} />
      {/* 머리 */}
      <circle r={r} fill={k.skin} />
      <path d={`M0 ${-r} a${r} ${r} 0 0 0 0 ${r * 2} z`} fill={k.skinShade} opacity={0.45} />
      {/* 머리 모양 — 위에서 봐도 알아볼 수 있게 크게 잡는다 */}
      {k.style === 'cap' || k.style === 'beanie' ? (
        <>
          <path d={`M${-r * 1.02} ${-r * 0.18} a${r * 1.02} ${r * 0.92} 0 0 1 ${r * 2.04} 0z`} fill={k.top} />
          {k.style === 'cap' && <path d={`M${-r * 1.16} ${-r * 0.18} h${r * 2.32} q0 ${r * 0.28} ${-r * 0.3} ${r * 0.28} h${-r * 1.72} q${-r * 0.3} 0 ${-r * 0.3} ${-r * 0.28}z`} fill={k.topShade} />}
        </>
      ) : (
        <path d={`M${-r * 1.02} ${-r * 0.1} a${r * 1.02} ${r} 0 0 1 ${r * 2.04} 0 q${-r * 0.5} ${-r * 0.5} ${-r * 1.02} ${-r * 0.5} q${-r * 0.52} 0 ${-r * 1.02} ${r * 0.5}z`} fill={k.hair} />
      )}
      {k.style === 'twin' && (
        <>
          <ellipse cx={-r * 1.06} cy={r * 0.1} rx={r * 0.3} ry={r * 0.5} fill={k.hair} />
          <ellipse cx={r * 1.06} cy={r * 0.1} rx={r * 0.3} ry={r * 0.5} fill={k.hair} />
        </>
      )}
      {k.style === 'pony' && <ellipse cx={r * 1.1} cy={r * 0.16} rx={r * 0.3} ry={r * 0.54} fill={k.hair} />}
      {k.style === 'braid' && (
        <>
          <ellipse cx={-r * 1.0} cy={r * 0.3} rx={r * 0.24} ry={r * 0.5} fill={k.hair} />
          <ellipse cx={r * 1.0} cy={r * 0.3} rx={r * 0.24} ry={r * 0.5} fill={k.hair} />
        </>
      )}
      {k.style === 'band' && <path d={`M${-r * 0.96} ${-r * 0.3} a${r} ${r} 0 0 1 ${r * 1.92} 0`} stroke={k.accent ?? '#ffd166'} strokeWidth={r * 0.22} fill="none" />}
      {/* 눈·입 */}
      <circle cx={-r * 0.34} cy={r * 0.1} r={r * 0.12} fill={INK} />
      <circle cx={r * 0.34} cy={r * 0.1} r={r * 0.12} fill={INK} />
      <path d={`M${-r * 0.22} ${r * 0.42} q${r * 0.22} ${r * 0.2} ${r * 0.44} 0`} stroke={INK} strokeWidth={r * 0.1} fill="none" strokeLinecap="round" />
      {k.glasses && (
        <g stroke="#2f3a46" strokeWidth={r * 0.08} fill="none">
          <circle cx={-r * 0.34} cy={r * 0.1} r={r * 0.26} />
          <circle cx={r * 0.34} cy={r * 0.1} r={r * 0.26} />
          <path d={`M${-r * 0.08} ${r * 0.1} h${r * 0.16}`} />
        </g>
      )}
    </g>
  );
}

/** 첫 화면 그림에 쓰는 전신. 원점은 발밑 가운데, 키 약 150 */
export function KidFull({ id, mood = 'happy', rim }: { id: string; mood?: 'happy' | 'calm'; rim?: string }) {
  const k = kidOf(id);
  return (
    <g>
      <ellipse cx={0} cy={2} rx={40} ry={9} fill="#000" opacity={0.32} />
      {/* 다리 */}
      <path d="M-15 -58 q-5 30 -10 50 q-2 8 6 8 q9 0 10 -8 l6 -46z" fill={k.bottom} />
      <path d="M15 -58 q7 28 14 48 q3 8 -6 9 q-9 1 -12 -7 l-10 -44z" fill={k.bottom} />
      <path d="M-24 0 q-9 1 -9 6 h26 q4 -6 -3 -8z" fill="#1a2430" />
      <path d="M20 1 q9 1 9 6 h-25 q-4 -6 3 -8z" fill="#1a2430" />
      {/* 몸 */}
      <path d="M-27 -128 q27 -11 54 0 l7 62 q-34 12 -68 0z" fill={k.top} />
      <path d="M-27 -128 q11 -5 17 -6 l-10 68 l-14 -1z" fill={k.topShade} />
      {/* 팔 */}
      <path d="M-27 -122 q-18 17 -22 41 q-2 9 8 11 q9 1 11 -9 q4 -17 14 -28z" fill={k.top} />
      <path d="M27 -122 q18 16 24 36 q4 9 -6 13 q-10 2 -14 -8 q-6 -15 -16 -25z" fill={k.top} />
      <circle cx={-41} cy={-71} r={9} fill={k.skin} />
      <circle cx={49} cy={-74} r={9} fill={k.skin} />
      {/* 목 */}
      <path d="M-9 -142 h18 v14 q-9 6 -18 0z" fill={k.skinShade} />
      {/* 머리 */}
      <g transform="translate(0 -172) scale(0.92)">
        <KidFace k={k} mood={mood} />
      </g>
      {rim && (
        <g stroke={rim} fill="none" strokeLinecap="round" opacity={0.85}>
          <path d="M30 -186 q4 -28 -12 -34" strokeWidth={2.8} />
          <path d="M32 -124 l7 52" strokeWidth={2.6} opacity={0.8} />
          <path d="M25 -152 q7 -8 7 -16" strokeWidth={2.2} opacity={0.6} />
        </g>
      )}
    </g>
  );
}
