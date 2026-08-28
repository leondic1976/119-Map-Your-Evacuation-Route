'use client';

/**
 * 무사히 나왔을 때의 마지막 장면 — 설계서 v1.2 §8.6(신규).
 *
 * 리플레이가 끝까지 가면 3D 화면이 이 장면으로 넘어간다. 밖으로 나온 순간
 * 카메라가 집 밖에 서서 아무것도 없는 화면을 비추던 문제를 이것으로 대신한다.
 * **성공했을 때만** 나온다. 실패하면 마지막 장면 없이 그대로 멈춘다 (P5 · FR-10).
 *
 * 그림은 전부 벡터이고 인물만 소방청 공식 캐릭터다.
 */
import React from 'react';
import { gate_ilgu, gate_ungi, gate_yeongi } from '../../content/artwork';
import { KidFull } from '../KidCharacters';

interface Props {
  character: string;
  seconds: number;
  /** 자기 최고 기록(초). 없으면 첫 성공이다 */
  bestSeconds?: number;
  onReplay: () => void;
  onClose: () => void;
}

export default function EndingScene({ character, seconds, bestSeconds, onReplay, onClose }: Props) {
  const faster = bestSeconds !== undefined && seconds < bestSeconds;
  return (
    <div className="k-ending" role="dialog" aria-modal="true" aria-label="무사히 나왔다" data-coach="kids-ending">
      <svg className="k-ending-art" viewBox="0 0 1200 620" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <defs>
          <linearGradient id="edSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d2f4f" />
            <stop offset="46%" stopColor="#2a6f9e" />
            <stop offset="82%" stopColor="#7fb4d8" />
            <stop offset="100%" stopColor="#f3d3a6" />
          </linearGradient>
          <linearGradient id="edGround" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2c4a3a" />
            <stop offset="100%" stopColor="#16302a" />
          </linearGradient>
          <radialGradient id="edSun">
            <stop offset="0%" stopColor="#ffe9b8" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#ffd07a" stopOpacity="0" />
          </radialGradient>
          <filter id="edSoft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>

        <rect x="0" y="0" width="1200" height="620" fill="url(#edSky)" />
        {/* 동트는 빛 — 밤이 지나갔다 */}
        <circle cx="930" cy="410" r="230" fill="url(#edSun)" />

        {/* 멀리 아파트 단지 — 이제 조용하다 */}
        <g opacity="0.4">
          {[
            [60, 214, 110, 212],
            [180, 264, 84, 162],
            [286, 234, 96, 192],
            [980, 244, 100, 182],
            [1090, 284, 80, 142],
          ].map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} fill="#1a4262" />
          ))}
        </g>

        {/* 땅과 잔디 */}
        <path d="M0 424 H1200 V620 H0z" fill="url(#edGround)" />
        <path d="M0 424 H1200" stroke="#5e8f6a" strokeWidth="3" opacity="0.5" />

        {/* 가족이 만나는 곳 표지 */}
        <g transform="translate(268 300)">
          <rect x="-6" y="26" width="12" height="128" rx="3" fill="#123246" />
          <rect x="-86" y="-44" width="172" height="74" rx="11" fill="#0d6f47" />
          <rect x="-86" y="-44" width="172" height="74" rx="11" fill="none" stroke="#12905c" strokeWidth="2" />
          <g transform="translate(-48 -6) scale(0.86)" fill="#ffffff">
            <circle cx="0" cy="-22" r="7" />
            <path d="M-4 -14 l10 4 l6 14 l-6 2 l-5 -9 l-3 12 l9 12 l-4 4 l-12 -13 l-2 -16z" />
            <path d="M-6 5 l-9 12 l5 4 l10 -12z" />
          </g>
          <text x="20" y="2" textAnchor="middle" fontSize="22" fontWeight="800" fill="#eaf7ef">
            만나는 곳
          </text>
        </g>

        {/* 반가움의 빛 */}
        <ellipse cx="600" cy="492" rx="360" ry="60" fill="#ffe1a8" opacity="0.3" filter="url(#edSoft)" />

        {/* 가족 — 손을 흔든다 */}
        <g>
          <ellipse cx="430" cy="500" rx="62" ry="11" fill="#000" opacity="0.28" />
          <ellipse cx="560" cy="504" rx="54" ry="10" fill="#000" opacity="0.26" />
          <ellipse cx="690" cy="500" rx="62" ry="11" fill="#000" opacity="0.28" />
          <Grownup x={430} coat="#3f6fb5" hair="#2b1d16" wave />
          <Grownup x={690} coat="#c8623a" hair="#3a2318" wave={false} skirt />
          <g transform="translate(560 504) scale(0.95)">
            <KidFull id={character} mood="happy" />
          </g>
          {/* 일구도 가족 곁에 */}
          <image href={gate_ilgu} x="770" y="392" height="112" preserveAspectRatio="xMidYMax meet" />
        </g>

        {/* 소방청 캐릭터가 배웅한다 */}
        <g>
          <ellipse cx="905" cy="502" rx="54" ry="10" fill="#000" opacity="0.26" />
          <ellipse cx="1005" cy="502" rx="54" ry="10" fill="#000" opacity="0.26" />
          <image href={gate_ungi} x="852" y="330" height="172" preserveAspectRatio="xMidYMax meet" />
          <image href={gate_yeongi} x="952" y="330" height="172" preserveAspectRatio="xMidYMax meet" />
        </g>

        {/* 색종이 — 조용한 축하 */}
        <g className="k-ending-confetti">
          {CONFETTI.map(([x, y, r, c], i) => (
            <rect key={i} x={x} y={y} width={9} height={13} rx={2} fill={String(c)} transform={`rotate(${r} ${x} ${y})`} opacity={0.85} />
          ))}
        </g>
      </svg>

      <div className="k-ending-card">
        <p className="k-ending-eyebrow">대피 연습 끝</p>
        <h2>무사히 나왔어!</h2>
        <p className="k-ending-lede">
          가족이 만나는 곳에서 다 같이 만났다. 나가는 데 <b className="num">{seconds}초</b> 걸렸다.
          {faster ? ' 지난번보다 빨랐어!' : bestSeconds !== undefined ? ` 가장 빨랐을 때는 ${bestSeconds}초야.` : ' 이게 첫 기록이야.'}
        </p>
        <div className="k-ending-actions">
          <button type="button" className="k-tb primary" onClick={onReplay} data-coach="kids-ending-again">
            처음부터 다시 보기
          </button>
          <button type="button" className="k-tb" onClick={onClose}>
            결과로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}

const CONFETTI: [number, number, number, string][] = [
  [220, 120, 20, '#ffd166'],
  [340, 78, -35, '#7ee2b8'],
  [452, 150, 12, '#f4809a'],
  [560, 62, -18, '#8fb8de'],
  [676, 128, 40, '#ffd166'],
  [800, 84, -28, '#7ee2b8'],
  [908, 150, 16, '#f4809a'],
  [1024, 96, -40, '#8fb8de'],
  [280, 210, 30, '#ffd166'],
  [980, 216, -22, '#7ee2b8'],
];

/** 어른 하나 — 단순한 실루엣. 한 사람은 손을 흔든다 */
function Grownup({ x, coat, hair, wave, skirt }: { x: number; coat: string; hair: string; wave: boolean; skirt?: boolean }) {
  return (
    <g transform={`translate(${x} 502)`}>
      <path d="M-18 -104 q-6 46 -12 76 q-3 12 8 13 q11 1 13 -11 l8 -62z" fill="#2f3b4c" />
      <path d="M18 -104 q9 44 17 74 q4 12 -7 14 q-12 1 -15 -11 l-13 -60z" fill="#3a475b" />
      <path d="M-28 -12 q-11 2 -11 7 h30 q5 -7 -3 -9z" fill="#1a2430" />
      <path d="M24 -10 q11 2 11 7 h-29 q-5 -7 3 -9z" fill="#1a2430" />
      {skirt ? (
        <path d="M-30 -190 q30 -12 60 0 l12 88 q-42 14 -84 0z" fill={coat} />
      ) : (
        <path d="M-28 -190 q28 -12 56 0 l8 92 q-36 12 -72 0z" fill={coat} />
      )}
      <path d="M-28 -190 q12 -6 18 -7 l-10 96 l-16 -1z" fill="#000" opacity="0.14" />
      {wave ? (
        <path d="M28 -182 q26 -22 32 -54 q3 -12 -8 -14 q-11 -2 -14 9 q-5 22 -22 36z" fill={coat} />
      ) : (
        <path d="M28 -182 q20 18 26 42 q3 11 -8 13 q-11 2 -14 -9 q-5 -18 -18 -30z" fill={coat} />
      )}
      <circle cx={wave ? 58 : 50} cy={wave ? -244 : -122} r={11} fill="#f2c9a2" />
      <path d="M-28 -182 q-20 18 -26 42 q-3 11 8 13 q11 2 14 -9 q5 -18 18 -30z" fill={coat} />
      <circle cx={-50} cy={-122} r={11} fill="#f2c9a2" />
      <path d="M-11 -212 h22 v16 q-11 7 -22 0z" fill="#dcab84" />
      <path d="M-30 -244 q0 -38 30 -38 q30 0 30 38 q0 34 -30 40 q-30 -6 -30 -40z" fill="#f2c9a2" />
      <path d="M-31 -246 q-2 -40 31 -40 q33 0 31 40 q-8 -22 -31 -22 q-23 0 -31 22z" fill={hair} />
      <circle cx={-11} cy={-236} r={4.4} fill="#171d24" />
      <circle cx={11} cy={-236} r={4.4} fill="#171d24" />
      <path d="M-8 -222 q8 9 16 0" stroke="#171d24" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </g>
  );
}
