'use client';

/**
 * 첫 화면 그림 — 설계서 v1.2 §11.
 *
 * 구도를 세로로 잡았다. 첫 화면은 왼쪽에 글판, 오른쪽에 그림을 두는 두 칸이고
 * 그림 칸은 화면이 높을수록 세로로 길어진다. 가로로 긴 그림을 억지로 채우면
 * 인물의 얼굴이 잘려 나간다 — 그래서 세로 900×1000 안에 다시 앉혔다.
 *
 * 그리는 규칙
 *   - 광원은 하나다. 위쪽 창의 불이 따뜻한 주광, 저녁 하늘이 찬 보조광이다
 *   - 원경(도시)·중경(아파트)·근경(인물)을 흐림과 대비로 나눈다
 *   - 불은 창 하나로만 암시한다. 불길·연기 속 인물을 그리지 않는다 (P5).
 *     아이들은 이미 안전한 쪽에 있다 — "너는 이미 준비된 사람"이 이 그림의 뜻이다
 *   - 인물은 소방청 공식 캐릭터(영이·웅이·일구)다. 나머지는 전부 벡터다
 */
import React from 'react';
import { gate_ilgu, gate_ungi, gate_yeongi } from '../kids/content/artwork';

const C = {
  skyTop: '#08182c',
  skyMid: '#123a5e',
  skyLow: '#2d6088',
  far: '#12293f',
  tower: '#173c5a',
  ground: '#0d2135',
  danger: '#c8102e',
};

export default function GateScene() {
  return (
    <svg
      className="k-gate-scene"
      viewBox="0 0 900 1000"
      preserveAspectRatio="xMidYMax slice"
      role="img"
      aria-label="저녁 아파트 단지 그림. 소방청 캐릭터 영이·웅이·일구가 우리집 대피지도 옆에 서 있고, 위층 창 하나에 불이 나 있다"
    >
      <defs>
        <linearGradient id="gsSky" x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0%" stopColor={C.skyTop} />
          <stop offset="42%" stopColor={C.skyMid} />
          <stop offset="76%" stopColor={C.skyLow} />
          <stop offset="100%" stopColor="#7d6d78" />
        </linearGradient>
        <linearGradient id="gsGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#17364f" />
          <stop offset="60%" stopColor={C.ground} />
          <stop offset="100%" stopColor="#06121f" />
        </linearGradient>
        <linearGradient id="gsTower" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#12314b" />
          <stop offset="55%" stopColor={C.tower} />
          <stop offset="100%" stopColor="#2b6087" />
        </linearGradient>
        <linearGradient id="gsWindowLit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f6ead0" />
          <stop offset="100%" stopColor="#c9b489" />
        </linearGradient>
        <linearGradient id="gsFire" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe6a3" />
          <stop offset="52%" stopColor="#ff9d3c" />
          <stop offset="100%" stopColor="#d9432a" />
        </linearGradient>
        <radialGradient id="gsGlow">
          <stop offset="0%" stopColor="#ffc266" stopOpacity="0.8" />
          <stop offset="45%" stopColor="#ff9b3d" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ff8a2b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="gsLamp">
          <stop offset="0%" stopColor="#ffe9bd" stopOpacity="0.62" />
          <stop offset="100%" stopColor="#ffe9bd" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="gsMoon">
          <stop offset="0%" stopColor="#f2f6ff" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#dce8ff" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#dce8ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="gsPaper" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e6edf4" />
        </linearGradient>
        <filter id="gsFar" x="-10%" y="-10%" width="120%" height="130%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id="gsSoft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id="gsPuff" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>

      {/* 하늘 */}
      <rect x="0" y="0" width="900" height="1000" fill="url(#gsSky)" />
      <circle cx="130" cy="120" r="120" fill="url(#gsMoon)" />
      <circle cx="130" cy="120" r="27" fill="#f4f8ff" opacity="0.92" />
      <circle cx="119" cy="111" r="27" fill={C.skyTop} opacity="0.6" />
      <g fill="#ffffff">
        {STARS.map(([x, y, r, o], i) => (
          <circle key={i} cx={x} cy={y} r={r} opacity={o} />
        ))}
      </g>
      <g filter="url(#gsSoft)" opacity="0.24">
        <ellipse cx="300" cy="230" rx="240" ry="16" fill="#8fb3d2" />
        <ellipse cx="640" cy="150" rx="200" ry="13" fill="#8fb3d2" />
      </g>

      {/* 원경 도시 */}
      <g filter="url(#gsFar)" opacity="0.4">
        {FAR_CITY.map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} fill={C.far} />
        ))}
      </g>

      {/* 중경 아파트 두 동 */}
      <g opacity="0.66">
        <Block x={40} y={470} w={140} h={300} cols={4} rows={9} />
        <Block x={196} y={540} w={112} h={230} cols={3} rows={7} />
      </g>

      {/* 우리 동 */}
      <g>
        <rect x="470" y="120" width="410" height="650" fill="url(#gsTower)" />
        <rect x="470" y="104" width="410" height="18" fill="#25506f" />
        <rect x="524" y="66" width="60" height="38" rx="3" fill="#1d4460" />
        <rect x="534" y="52" width="40" height="16" rx="2" fill="#25506f" />
        <path d="M812 104 V48" stroke="#2d5c7c" strokeWidth="5" />
        <circle cx="812" cy="48" r="6" fill={C.danger} opacity="0.9" />
        <circle cx="812" cy="48" r="16" fill={C.danger} opacity="0.24" filter="url(#gsSoft)" />
        {[540, 640, 740].map((x) => (
          <rect key={x} x={x} y="120" width="7" height="650" fill="#0e2b44" opacity="0.5" />
        ))}

        {WINDOWS.map(({ x, y, fire, lit }, i) => (
          <g key={i}>
            <rect x={x} y={y} width={62} height={42} rx={2} fill={fire ? 'url(#gsFire)' : lit ? 'url(#gsWindowLit)' : '#11304a'} />
            <path d={`M${x + 31} ${y} v42 M${x} ${y + 21} h62`} stroke="#0c2740" strokeWidth="1.8" opacity={fire ? 0.3 : 0.5} />
            <rect x={x - 5} y={y + 38} width={72} height={11} rx={2} fill="#1a4060" opacity="0.92" />
            <path d={`M${x - 3} ${y + 40} h68`} stroke="#2f6288" strokeWidth="1.4" opacity="0.75" />
            {lit && !fire && <rect x={x + 3} y={y + 3} width={56} height={13} fill="#fff6dd" opacity="0.3" />}
          </g>
        ))}

        <circle cx="700" cy="286" r="190" fill="url(#gsGlow)" />
        <path
          d="M676 278 c-5 -15 8 -23 8 -35 c10 10 13 18 15 27 c5 -7 5 -15 4 -22 c11 11 16 22 16 32 c0 15 -12 25 -22 25 c-11 0 -22 -10 -21 -27z"
          fill="url(#gsFire)"
        />
        <g className="k-gate-smoke" filter="url(#gsPuff)">
          <ellipse cx="712" cy="232" rx="40" ry="28" fill="#c6d2dc" opacity="0.4" />
          <ellipse cx="730" cy="168" rx="54" ry="36" fill="#c6d2dc" opacity="0.28" />
          <ellipse cx="756" cy="98" rx="70" ry="44" fill="#c6d2dc" opacity="0.17" />
        </g>
      </g>

      {/* 땅 */}
      <path d="M0 770 H900 V1000 H0z" fill="url(#gsGround)" />
      <path d="M0 770 H900" stroke="#4a83ad" strokeWidth="2" opacity="0.45" />
      <g opacity="0.5" filter="url(#gsSoft)">
        <ellipse cx="700" cy="820" rx="200" ry="30" fill="#e0872f" opacity="0.5" />
      </g>
      <ellipse cx="470" cy="880" rx="330" ry="60" fill="#2c5f86" opacity="0.45" filter="url(#gsSoft)" />

      {/* 가로등 */}
      <g transform="translate(120 0)">
        <path d="M0 790 V520 q0 -18 18 -18 h30" fill="none" stroke="#123246" strokeWidth="8" strokeLinecap="round" />
        <ellipse cx="52" cy="506" rx="16" ry="8" fill="#ffe9bd" opacity="0.95" />
        <circle cx="52" cy="508" r="64" fill="url(#gsLamp)" />
        <ellipse cx="0" cy="792" rx="22" ry="6" fill="#000" opacity="0.35" />
      </g>

      {/* 가족이 만나는 곳 */}
      <g transform="translate(806 640)">
        <rect x="-6" y="28" width="12" height="142" rx="3" fill="#123246" />
        <rect x="-6" y="28" width="5" height="142" fill="#1d4a63" />
        <rect x="-92" y="-46" width="184" height="80" rx="12" fill="#0d6f47" />
        <rect x="-92" y="-46" width="184" height="80" rx="12" fill="none" stroke="#12905c" strokeWidth="2" />
        <g transform="translate(-52 -6) scale(0.92)" fill="#ffffff">
          <circle cx="0" cy="-22" r="7" />
          <path d="M-4 -14 l10 4 l6 14 l-6 2 l-5 -9 l-3 12 l9 12 l-4 4 l-12 -13 l-2 -16z" />
          <path d="M-6 5 l-9 12 l5 4 l10 -12z" />
        </g>
        <text x="22" y="4" textAnchor="middle" fontSize="24" fontWeight="800" fill="#eaf7ef">
          만나는 곳
        </text>
        <ellipse cx="0" cy="172" rx="30" ry="7" fill="#000" opacity="0.35" />
      </g>

      {/* 우리집 대피지도 */}
      <g transform="translate(58 520)">
        <path d="M44 300 L104 150 M292 300 L232 150 M82 258 H254" stroke="#3a2b22" strokeWidth="10" strokeLinecap="round" />
        <path d="M44 300 L104 150 M292 300 L232 150" stroke="#5c4635" strokeWidth="3.4" strokeLinecap="round" />
        <ellipse cx="168" cy="302" rx="130" ry="14" fill="#000" opacity="0.34" />
        <g transform="rotate(-2.5 168 130)">
          <rect x="18" y="8" width="286" height="220" rx="9" fill="#000" opacity="0.35" filter="url(#gsSoft)" />
          <rect x="14" y="0" width="286" height="218" rx="9" fill="url(#gsPaper)" />
          <rect x="14" y="0" width="286" height="36" rx="9" fill="#0f3d68" />
          <rect x="14" y="26" width="286" height="10" fill="#0f3d68" />
          <text x="32" y="26" fontSize="18" fontWeight="800" fill="#ffffff">
            우리집 대피 지도
          </text>
          <circle cx="284" cy="18" r="7" fill="#7ee2b8" opacity="0.8" />
          <g stroke="#2a3038" strokeWidth="2.4">
            <rect x="32" y="54" width="88" height="60" fill="#fff3d6" />
            <rect x="120" y="54" width="70" height="60" fill="#fff3d6" />
            <rect x="190" y="54" width="80" height="60" fill="#dcefff" />
            <rect x="32" y="114" width="238" height="34" fill="#f6f6ee" />
            <rect x="32" y="148" width="118" height="50" fill="#e8f4e2" />
            <rect x="150" y="148" width="120" height="50" fill="#efe9f7" />
          </g>
          <g fill="#d9a463" stroke="#2a3038" strokeWidth="1.4">
            <rect x="42" y="62" width="28" height="18" rx="2" />
            <rect x="52" y="160" width="36" height="16" rx="2" fill="#8fb8de" />
          </g>
          <path d="M66 80 V130 H218 V172 H262" fill="none" stroke={C.danger} strokeWidth="5.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="66" cy="80" r="12" fill="#ffffff" stroke={C.danger} strokeWidth="3.4" />
          <text x="66" y="85" textAnchor="middle" fontSize="13" fontWeight="800" fill={C.danger}>
            1
          </text>
          <circle cx="262" cy="172" r="7" fill={C.danger} />
          <path d="M66 80 V130 H90 V190" fill="none" stroke="#9f5700" strokeWidth="4.2" strokeDasharray="9 6" strokeLinecap="round" />
        </g>
      </g>

      {/* 인물 — 소방청 공식 캐릭터 */}
      <g>
        <ellipse cx="404" cy="898" rx="96" ry="17" fill="#000" opacity="0.34" />
        <ellipse cx="574" cy="900" rx="76" ry="14" fill="#000" opacity="0.32" />
        <ellipse cx="716" cy="898" rx="92" ry="16" fill="#000" opacity="0.34" />
        <image href={gate_yeongi} x="304" y="558" height="342" preserveAspectRatio="xMidYMax meet" />
        <image href={gate_ilgu} x="504" y="620" height="282" preserveAspectRatio="xMidYMax meet" />
        <image href={gate_ungi} x="620" y="556" height="344" preserveAspectRatio="xMidYMax meet" />
      </g>

      {/* 근경 */}
      <g filter="url(#gsSoft)" opacity="0.85">
        <path d="M-20 1000 q70 -60 150 -32 q46 -38 110 -8 L300 1000z" fill="#05101c" />
        <path d="M700 1000 q80 -64 170 -28 L920 1000z" fill="#05101c" />
      </g>
    </svg>
  );
}

const STARS: [number, number, number, number][] = [
  [60, 60, 1.7, 0.8],
  [210, 40, 1.3, 0.55],
  [330, 96, 1.8, 0.7],
  [430, 44, 1.2, 0.5],
  [560, 82, 1.6, 0.62],
  [690, 36, 1.3, 0.48],
  [820, 92, 1.7, 0.66],
  [880, 168, 1.2, 0.42],
  [140, 190, 1.1, 0.36],
  [380, 240, 1, 0.3],
  [270, 330, 1.1, 0.32],
  [60, 300, 1.2, 0.34],
];

const FAR_CITY: [number, number, number, number][] = [
  [0, 600, 80, 170],
  [76, 560, 54, 210],
  [140, 630, 70, 140],
  [216, 590, 48, 180],
  [280, 640, 76, 130],
  [360, 604, 56, 166],
  [430, 646, 62, 124],
  [850, 616, 60, 154],
];

/** 중경 아파트 — 창을 격자로 찍는다 */
function Block({ x, y, w, h, cols, rows }: { x: number; y: number; w: number; h: number; cols: number; rows: number }) {
  const cw = (w - 16) / cols;
  const ch = (h - 18) / rows;
  const cells: React.ReactNode[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lit = (r * cols + c * 3) % 5 < 2;
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={x + 8 + c * cw + 2}
          y={y + 10 + r * ch + 2}
          width={cw - 6}
          height={ch - 7}
          fill={lit ? '#e8d7ac' : '#0e2740'}
          opacity={lit ? 0.6 : 0.85}
        />,
      );
    }
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={C.far} />
      <rect x={x} y={y} width={w} height={7} fill="#1d4058" />
      {cells}
    </g>
  );
}

const WINDOWS: { x: number; y: number; fire: boolean; lit: boolean }[] = (() => {
  const out: { x: number; y: number; fire: boolean; lit: boolean }[] = [];
  for (let r = 0; r < 11; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      const x = 486 + c * 100;
      const y = 144 + r * 56;
      const fire = r === 2 && c === 2;
      out.push({ fire, x, y, lit: !fire && (r * 4 + c * 3) % 5 < 3 });
    }
  }
  return out;
})();
