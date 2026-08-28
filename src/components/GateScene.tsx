'use client';

/**
 * 첫 화면 그림 — 설계서 v1.2 §11(첫 화면).
 *
 * 담는 것: 소방청 캐릭터(영이·웅이·일구)와 소방관, 우리집 대피지도 한 장,
 * 불이 난 창 하나, 그리고 손잡고 만나는 곳으로 걸어가는 아이들.
 *
 * 어린이에게 다가가되 유치하지 않게 그린다.
 *   - 색은 제품 팔레트 그대로다 — 남색·소방적색·피난녹색 + 저녁 하늘
 *   - 불은 창 하나로만 암시한다. 불길·연기 속 인물을 그리지 않는다 (P5)
 *   - 아이들은 이미 안전한 쪽에 있다. "너는 이미 준비된 사람"이 이 그림의 뜻이다
 *   - 전부 벡터다. 이모지·비트맵을 쓰지 않는다 (N-06 · CON-4)
 *   - 움직임은 연기 한 줄기뿐이고 prefers-reduced-motion 이면 멈춘다
 */
import React from 'react';

export default function GateScene() {
  return (
    <svg className="k-gate-scene" viewBox="0 0 1200 340" preserveAspectRatio="xMidYMax meet" role="img" aria-label="소방청 캐릭터와 아이들이 우리집 대피지도를 들고 만나는 곳으로 걸어가는 그림">
      <defs>
        <linearGradient id="gsSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b2f51" />
          <stop offset="62%" stopColor="#1d5488" />
          <stop offset="100%" stopColor="#2f6ea3" />
        </linearGradient>
        <linearGradient id="gsGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#123f66" />
          <stop offset="100%" stopColor="#0c2c4a" />
        </linearGradient>
        <linearGradient id="gsGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd166" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#e2503f" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id="gsWarm">
          <stop offset="0%" stopColor="#ffb347" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffb347" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="gsSheet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#eef3f8" />
        </linearGradient>
      </defs>

      {/* 하늘과 땅 */}
      <rect x="0" y="0" width="1200" height="340" fill="url(#gsSky)" />
      <g opacity="0.5">
        {[
          [120, 44],
          [300, 28],
          [520, 56],
          [760, 34],
          [980, 62],
          [1120, 30],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={1.6} fill="#ffffff" />
        ))}
      </g>
      <rect x="0" y="268" width="1200" height="72" fill="url(#gsGround)" />
      <path d="M0 268 H1200" stroke="#4d86b8" strokeWidth="1.5" opacity="0.5" />

      {/* 아파트 단지 — 뒤에서 앞으로 세 동 */}
      <g opacity="0.45">
        <rect x="60" y="96" width="120" height="172" fill="#0e3455" />
        <rect x="1010" y="112" width="120" height="156" fill="#0e3455" />
      </g>
      <g>
        <rect x="770" y="58" width="212" height="210" rx="4" fill="#153f63" stroke="#2c6491" strokeWidth="2" />
        {/* 창 — 대부분 잔잔한 불빛, 한 칸만 불이 났다 */}
        {Array.from({ length: 6 }, (_, r) =>
          Array.from({ length: 5 }, (_, c) => {
            const x = 790 + c * 38;
            const y = 76 + r * 32;
            const fire = r === 2 && c === 3;
            const lit = (r * 5 + c) % 3 !== 1;
            return (
              <rect
                key={`${r}-${c}`}
                x={x}
                y={y}
                width={24}
                height={20}
                rx={2}
                fill={fire ? 'url(#gsGlow)' : lit ? '#cfe3f3' : '#0f3252'}
                opacity={fire ? 1 : lit ? 0.75 : 0.9}
              />
            );
          }),
        )}
        {/* 불이 난 창 둘레의 따뜻한 빛 — 불길을 크게 그리지 않는다 */}
        <circle cx="916" cy="150" r="62" fill="url(#gsWarm)" />
        {/* 연기 한 줄기 */}
        <g className="k-gate-smoke" opacity="0.5">
          <ellipse cx="924" cy="118" rx="16" ry="11" fill="#c8d3dd" opacity="0.5" />
          <ellipse cx="934" cy="94" rx="21" ry="14" fill="#c8d3dd" opacity="0.36" />
          <ellipse cx="946" cy="66" rx="27" ry="18" fill="#c8d3dd" opacity="0.24" />
        </g>
      </g>

      {/* 만나는 곳 표지 — 아이들이 향하는 안전한 쪽 */}
      <g transform="translate(1084 196)">
        <rect x="-4" y="0" width="8" height="72" rx="2" fill="#12405f" />
        <rect x="-42" y="-46" width="84" height="52" rx="8" fill="#0e7c4f" />
        <g transform="translate(0 -20)" stroke="#ffffff" strokeWidth="3" fill="none" strokeLinecap="round">
          <circle cx="-13" cy="-12" r="4.5" fill="#ffffff" stroke="none" />
          <path d="M-13 -6 v10 M-19 8 l6 -6 6 6" />
          <circle cx="9" cy="-10" r="5.5" fill="#ffffff" stroke="none" />
          <path d="M9 -3 v11 M2 10 l7 -7 7 7" />
        </g>
        <text x="0" y="22" textAnchor="middle" fontSize="13" fontWeight="800" fill="#eaf5ef">
          만나는 곳
        </text>
      </g>

      {/* 우리집 대피지도 한 장 — 이 앱이 만들어 주는 것 */}
      <g transform="translate(96 92) rotate(-4)">
        <rect x="0" y="0" width="212" height="164" rx="8" fill="url(#gsSheet)" stroke="#c8d0da" strokeWidth="2" />
        <rect x="0" y="0" width="212" height="26" rx="8" fill="#0f3d68" />
        <rect x="0" y="18" width="212" height="8" fill="#0f3d68" />
        <text x="14" y="18" fontSize="13" fontWeight="800" fill="#ffffff">
          우리집 대피 지도
        </text>
        {/* 방 네 칸 */}
        <g stroke="#2a3038" strokeWidth="2" fill="none">
          <rect x="16" y="40" width="66" height="46" fill="#fff3d6" />
          <rect x="82" y="40" width="52" height="46" fill="#fff3d6" />
          <rect x="134" y="40" width="60" height="46" fill="#dcefff" />
          <rect x="16" y="86" width="178" height="26" fill="#f6f6ee" />
          <rect x="16" y="112" width="88" height="36" fill="#e8f4e2" />
          <rect x="104" y="112" width="90" height="36" fill="#efe9f7" />
        </g>
        {/* 주 경로 — 굵은 실선 + 번호 */}
        <path d="M46 62 V99 H160 V130 H190" fill="none" stroke="#c8102e" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="46" cy="62" r="10" fill="#ffffff" stroke="#c8102e" strokeWidth="3" />
        <text x="46" y="66" textAnchor="middle" fontSize="11" fontWeight="800" fill="#c8102e">
          1
        </text>
        <circle cx="190" cy="130" r="5.5" fill="#c8102e" />
        {/* 보조 경로 — 파선 */}
        <path d="M46 62 V99 H60 V140" fill="none" stroke="#9f5700" strokeWidth="3.5" strokeDasharray="8 5" strokeLinecap="round" />
      </g>

      {/* 소방관 — 지도를 가리켜 준다 */}
      <g transform="translate(352 152)">
        <ellipse cx="0" cy="118" rx="34" ry="8" fill="#000" opacity="0.22" />
        <rect x="-25" y="34" width="50" height="76" rx="16" fill="#1f4f77" stroke="#0b2c46" strokeWidth="2.5" />
        <rect x="-25" y="66" width="50" height="9" fill="#ffd166" opacity="0.9" />
        <path d="M-25 52 L-58 22" stroke="#1f4f77" strokeWidth="13" strokeLinecap="round" />
        <path d="M25 52 L52 40" stroke="#1f4f77" strokeWidth="13" strokeLinecap="round" />
        <circle cx="-62" cy="18" r="8" fill="#ffe0b2" />
        <circle cx="56" cy="38" r="8" fill="#ffe0b2" />
        <circle cx="0" cy="6" r="26" fill="#ffe0b2" stroke="#0b2c46" strokeWidth="2.5" />
        <path d="M-29 -2 a29 20 0 0 1 58 0z" fill="#f0b429" stroke="#0b2c46" strokeWidth="2.5" />
        <path d="M-34 -2 H34" stroke="#0b2c46" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M0 -25 v13" stroke="#0b2c46" strokeWidth="2.5" />
        <circle cx="-9" cy="10" r="2.8" fill="#2a3038" />
        <circle cx="9" cy="10" r="2.8" fill="#2a3038" />
        <path d="M-7 20 q7 6 14 0" fill="none" stroke="#2a3038" strokeWidth="2.4" strokeLinecap="round" />
      </g>

      {/* 아이 둘 — 손을 잡고 만나는 곳으로 간다. 이미 안전한 쪽이다 */}
      <Kid x={560} skin="#ffe0b2" cap="#c8102e" coat="#e2e9f0" name="영이" />
      <Kid x={646} skin="#ffe0b2" cap="#0f3d68" coat="#dfeae2" name="웅이" />
      <path d="M596 232 q26 12 52 0" fill="none" stroke="#ffe0b2" strokeWidth="7" strokeLinecap="round" />

      {/* 일구 — 강아지 대원 */}
      <g transform="translate(724 232)">
        <ellipse cx="0" cy="34" rx="26" ry="7" fill="#000" opacity="0.22" />
        <rect x="-22" y="0" width="44" height="26" rx="12" fill="#c48a5f" stroke="#7a4a26" strokeWidth="2.5" />
        <rect x="-14" y="6" width="28" height="8" rx="4" fill="#c8102e" />
        <circle cx="-26" cy="-8" r="17" fill="#c48a5f" stroke="#7a4a26" strokeWidth="2.5" />
        <ellipse cx="-38" cy="-14" rx="6" ry="10" fill="#8a5a3c" />
        <ellipse cx="-14" cy="-14" rx="6" ry="10" fill="#8a5a3c" />
        <circle cx="-31" cy="-10" r="2.4" fill="#2a3038" />
        <circle cx="-21" cy="-10" r="2.4" fill="#2a3038" />
        <ellipse cx="-26" cy="-3" rx="3.4" ry="2.6" fill="#2a3038" />
        <path d="M22 8 q14 -8 10 -20" fill="none" stroke="#c48a5f" strokeWidth="7" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** 아이 하나 — 정면, 단순한 실루엣. 표정은 편안하다 */
function Kid({ x, skin, cap, coat, name }: { x: number; skin: string; cap: string; coat: string; name: string }) {
  return (
    <g transform={`translate(${x} 168)`} aria-label={name}>
      <ellipse cx="0" cy="102" rx="27" ry="7" fill="#000" opacity="0.22" />
      <rect x="-20" y="38" width="40" height="60" rx="14" fill={coat} stroke="#2a3038" strokeWidth="2.5" />
      <path d="M-20 54 L-40 68" stroke={coat} strokeWidth="11" strokeLinecap="round" />
      <path d="M20 54 L40 66" stroke={coat} strokeWidth="11" strokeLinecap="round" />
      <circle cx="-43" cy="70" r="6.5" fill={skin} />
      <circle cx="43" cy="68" r="6.5" fill={skin} />
      <circle cx="0" cy="14" r="23" fill={skin} stroke="#2a3038" strokeWidth="2.5" />
      <path d="M-25 8 a25 18 0 0 1 50 0z" fill={cap} stroke="#2a3038" strokeWidth="2.5" />
      <path d="M-29 8 H29" stroke="#2a3038" strokeWidth="3" strokeLinecap="round" />
      <circle cx="-8" cy="17" r="2.6" fill="#2a3038" />
      <circle cx="8" cy="17" r="2.6" fill="#2a3038" />
      <path d="M-6 26 q6 6 12 0" fill="none" stroke="#2a3038" strokeWidth="2.2" strokeLinecap="round" />
    </g>
  );
}
