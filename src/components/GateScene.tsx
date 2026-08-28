'use client';

/**
 * 첫 화면 그림 — 설계서 v1.2 §11.
 *
 * 담는 것: 소방 캐릭터(영웅이·일구를 참고해 새로 그린 벡터)와 손잡고 걸어가는 아이들,
 * 우리집 대피지도 한 장, 불이 난 창 하나, 그리고 가족이 만나는 곳.
 *
 * 그리는 규칙
 *   - 광원은 하나다. 오른쪽 위 창의 불이 따뜻한 주광이고, 저녁 하늘이 찬 보조광이다.
 *     모든 인물의 오른쪽 모서리에 주황 림라이트가, 왼쪽 면에 푸른 그림자가 진다.
 *   - 원경(도시)·중경(아파트)·근경(인물)을 흐림 정도와 대비로 나눈다.
 *   - 인물은 밑칠 · 그늘 · 하이라이트 세 톤으로 칠한다. 검은 굵은 외곽선을 두르지 않는다.
 *   - 불은 창 하나로만 암시한다. 불길·연기 속 인물을 그리지 않는다 (P5).
 *     아이들은 이미 안전한 쪽에 있다 — "너는 이미 준비된 사람"이 이 그림의 뜻이다.
 *   - 전부 벡터다. 이모지·비트맵을 쓰지 않는다 (N-06 · CON-4).
 *   - 소방청 캐릭터를 그대로 옮기지 않았다. 사용 허가(O-1a)가 나면 이 파일만 갈아 끼운다.
 */
import React from 'react';
import { KidFull } from '../kids/ui/KidCharacters';

/* 팔레트 — 저녁 하늘(찬 기운)과 불빛(따뜻한 기운)의 두 축 */
const C = {
  skyTop: '#0a1c33',
  skyMid: '#123a5e',
  skyLow: '#2a5c7f',
  horizon: '#7f6a72',
  far: '#16324e',
  mid: '#12293f',
  tower: '#1a3a58',
  towerLit: '#24506f',
  ground: '#0d2135',
  groundWarm: '#3a2f33',
  fireCore: '#ffe6a3',
  fireMid: '#ff9d3c',
  fireDeep: '#d9432a',
  rim: '#ffb066',
  cool: '#2b5c86',
  ink: '#111a24',
  paper: '#f7f9fb',
  safe: '#0e7c4f',
  danger: '#c8102e',
};

export default function GateScene() {
  return (
    <svg
      className="k-gate-scene"
      viewBox="0 0 1600 520"
      preserveAspectRatio="xMidYMax slice"
      role="img"
      aria-label="저녁 아파트 단지 그림. 소방관 캐릭터가 우리집 대피지도를 가리키고, 아이 둘과 강아지가 가족이 만나는 곳으로 걸어간다"
    >
      <defs>
        <linearGradient id="gsSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.skyTop} />
          <stop offset="46%" stopColor={C.skyMid} />
          <stop offset="78%" stopColor={C.skyLow} />
          <stop offset="100%" stopColor={C.horizon} />
        </linearGradient>
        <linearGradient id="gsGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16324b" />
          <stop offset="55%" stopColor={C.ground} />
          <stop offset="100%" stopColor="#081726" />
        </linearGradient>
        <linearGradient id="gsTower" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={C.tower} />
          <stop offset="62%" stopColor={C.towerLit} />
          <stop offset="100%" stopColor="#2f6288" />
        </linearGradient>
        <linearGradient id="gsWindowLit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f3e6c8" />
          <stop offset="100%" stopColor="#c9b489" />
        </linearGradient>
        <linearGradient id="gsFire" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.fireCore} />
          <stop offset="52%" stopColor={C.fireMid} />
          <stop offset="100%" stopColor={C.fireDeep} />
        </linearGradient>
        <radialGradient id="gsGlow">
          <stop offset="0%" stopColor="#ffc266" stopOpacity="0.85" />
          <stop offset="45%" stopColor="#ff9b3d" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#ff8a2b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="gsLamp">
          <stop offset="0%" stopColor="#ffe9bd" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#ffe9bd" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="gsMoon">
          <stop offset="0%" stopColor="#f2f6ff" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#dce8ff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#dce8ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="gsSmoke" x1="0" y1="1" x2="0.4" y2="0">
          <stop offset="0%" stopColor="#c9d4de" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#c9d4de" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gsPaper" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e6edf4" />
        </linearGradient>
        <linearGradient id="gsCoat" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#16324f" />
          <stop offset="70%" stopColor="#25537d" />
          <stop offset="100%" stopColor="#33668f" />
        </linearGradient>
        <linearGradient id="gsHelmet" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0%" stopColor="#d59a17" />
          <stop offset="55%" stopColor="#f5c243" />
          <stop offset="100%" stopColor="#ffe08a" />
        </linearGradient>

        {/* 원경은 흐리게 — 공기 원근 */}
        <filter id="gsFar" x="-10%" y="-10%" width="120%" height="130%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        <filter id="gsSoft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <filter id="gsBloom" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <filter id="gsPuff" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="11" />
        </filter>
      </defs>

      {/* ---------------------------------------------------------- 하늘 */}
      <rect x="0" y="0" width="1600" height="520" fill="url(#gsSky)" />
      <circle cx="250" cy="96" r="120" fill="url(#gsMoon)" />
      <circle cx="250" cy="96" r="26" fill="#f4f8ff" opacity="0.9" />
      <circle cx="240" cy="88" r="26" fill={C.skyTop} opacity="0.55" />
      <g fill="#ffffff">
        {STARS.map(([x, y, r, o], i) => (
          <circle key={i} cx={x} cy={y} r={r} opacity={o} />
        ))}
      </g>
      {/* 얇은 구름 띠 */}
      <g filter="url(#gsSoft)" opacity="0.3">
        <ellipse cx="520" cy="150" rx="260" ry="16" fill="#7fa6c8" />
        <ellipse cx="1180" cy="104" rx="210" ry="12" fill="#7fa6c8" />
        <ellipse cx="880" cy="196" rx="320" ry="14" fill="#8fb3d2" opacity="0.7" />
      </g>

      {/* ------------------------------------------------- 원경 도시 (흐림) */}
      <g filter="url(#gsFar)" opacity="0.42">
        {FAR_CITY.map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} fill={C.far} />
        ))}
      </g>

      {/* ------------------------------------------------- 중경 아파트 단지 */}
      <g opacity="0.72">
        <Block x={120} y={244} w={150} h={176} cols={4} rows={7} tint={C.mid} />
        <Block x={300} y={276} w={124} h={144} cols={3} rows={5} tint={C.mid} />
        <Block x={640} y={258} w={140} h={162} cols={4} rows={6} tint={C.mid} />
      </g>

      {/* ------------------------------------------------- 우리 동 (주인공 건물) */}
      <g>
        {/* 몸통 */}
        <rect x="1088" y="66" width="352" height="352" fill="url(#gsTower)" />
        {/* 옥상 구조물 */}
        <rect x="1088" y="52" width="352" height="16" fill="#28536f" />
        <rect x="1132" y="20" width="52" height="34" rx="3" fill="#204864" />
        <rect x="1140" y="8" width="36" height="14" rx="2" fill="#28536f" />
        <path d="M1372 52 V6" stroke="#2d5c7c" strokeWidth="4" />
        <circle cx="1372" cy="6" r="5" fill={C.danger} opacity="0.9" />
        <circle cx="1372" cy="6" r="13" fill={C.danger} opacity="0.22" filter="url(#gsSoft)" />

        {/* 세로 몰딩 — 판상형 아파트의 결 */}
        {[1150, 1236, 1322].map((x) => (
          <rect key={x} x={x} y="66" width="6" height="352" fill="#0f2c46" opacity="0.55" />
        ))}

        {/* 창과 발코니 */}
        {WINDOWS.map(({ x, y, fire, lit }, i) => (
          <g key={i}>
            <rect x={x} y={y} width={54} height={38} rx={2} fill={fire ? 'url(#gsFire)' : lit ? 'url(#gsWindowLit)' : '#12314b'} opacity={fire ? 1 : lit ? 0.92 : 1} />
            {/* 창살 */}
            <path d={`M${x + 27} ${y} v38 M${x} ${y + 19} h54`} stroke="#0d2740" strokeWidth="1.6" opacity={fire ? 0.35 : 0.55} />
            {/* 발코니 난간 */}
            <rect x={x - 4} y={y + 34} width={62} height={10} rx={2} fill="#1b4160" opacity="0.9" />
            <path
              d={`M${x - 2} ${y + 36} h58`}
              stroke="#2f6288"
              strokeWidth="1.4"
              opacity="0.8"
            />
            {lit && !fire && <rect x={x + 2} y={y + 2} width={50} height={12} fill="#fff6dd" opacity="0.35" />}
          </g>
        ))}

        {/* 불이 난 세대 — 창 밖으로 번지는 빛 */}
        <circle cx="1290" cy="196" r="150" fill="url(#gsGlow)" />
        <g filter="url(#gsBloom)" opacity="0.75">
          <ellipse cx="1290" cy="196" rx="54" ry="34" fill="#ffb04a" />
        </g>
        {/* 창턱 위로 살짝 넘실대는 불꽃 — 크게 그리지 않는다 */}
        <path
          d="M1272 190 c-4 -12 6 -18 6 -28 c8 8 10 14 12 22 c4 -6 4 -12 3 -18 c9 9 13 18 13 26 c0 12 -10 20 -18 20 c-9 0 -18 -8 -16 -22z"
          fill="url(#gsFire)"
          opacity="0.95"
        />
      </g>

      {/* 연기 기둥 — 여러 겹으로 옅어지며 오른쪽으로 흐른다 */}
      <g className="k-gate-smoke" filter="url(#gsPuff)">
        <ellipse cx="1300" cy="150" rx="34" ry="24" fill="#c6d2dc" opacity="0.42" />
        <ellipse cx="1318" cy="104" rx="46" ry="32" fill="#c6d2dc" opacity="0.3" />
        <ellipse cx="1344" cy="56" rx="60" ry="40" fill="#c6d2dc" opacity="0.2" />
        <ellipse cx="1382" cy="14" rx="74" ry="44" fill="#c6d2dc" opacity="0.12" />
      </g>
      <path d="M1288 178 C1300 132 1290 104 1316 62 C1336 30 1330 16 1352 -6" fill="none" stroke="#dbe4ec" strokeWidth="2" opacity="0.16" />

      {/* 불티 몇 점 */}
      <g fill="#ffc266" className="k-gate-embers">
        {EMBERS.map(([x, y, r, o], i) => (
          <circle key={i} cx={x} cy={y} r={r} opacity={o} />
        ))}
      </g>

      {/* ---------------------------------------------------------- 땅 */}
      <path d="M0 418 H1600 V520 H0z" fill="url(#gsGround)" />
      <path d="M0 418 H1600" stroke="#3f7399" strokeWidth="2" opacity="0.5" />
      {/* 인물이 서는 자리만 밝혀 발이 어둠에 묻히지 않게 한다 */}
      <ellipse cx="700" cy="432" rx="330" ry="26" fill="#2c5f86" opacity="0.5" filter="url(#gsSoft)" />
      {/* 젖은 바닥의 반사 — 불빛과 가로등이 길게 번진다 */}
      <g opacity="0.5" filter="url(#gsSoft)">
        <ellipse cx="1290" cy="452" rx="180" ry="26" fill="#e0872f" opacity="0.55" />
        <ellipse cx="470" cy="470" rx="130" ry="18" fill="#ffe3ac" opacity="0.3" />
      </g>

      {/* 가로등 둘 */}
      <Lamp x={468} />
      <Lamp x={1512} />

      {/* 낮은 화단 — 근경으로 넘어가는 다리 */}
      <g opacity="0.9">
        <path d="M760 424 q40 -22 84 -2 q34 -18 70 4 v14 H760z" fill="#12303f" />
        <path d="M1392 426 q46 -24 92 0 v12 h-92z" fill="#12303f" />
      </g>

      {/* ------------------------------------------------- 가족이 만나는 곳 */}
      <g transform="translate(1052 296)">
        <rect x="-5" y="24" width="10" height="120" rx="3" fill="#123246" />
        <rect x="-5" y="24" width="4" height="120" fill="#1d4a63" />
        <g>
          <rect x="-82" y="-42" width="164" height="72" rx="10" fill="#0d6f47" />
          <rect x="-82" y="-42" width="164" height="72" rx="10" fill="none" stroke="#12905c" strokeWidth="2" />
          <rect x="-76" y="-36" width="152" height="26" rx="6" fill="#ffffff" opacity="0.08" />
          {/* 달려가는 사람 표지 — 실제 피난 표지의 형태를 따른다 */}
          <g transform="translate(-44 -8) scale(0.8)" fill="#ffffff">
            <circle cx="0" cy="-22" r="7" />
            <path d="M-4 -14 l10 4 l6 14 l-6 2 l-5 -9 l-3 12 l9 12 l-4 4 l-12 -13 l-2 -16z" />
            <path d="M-6 5 l-9 12 l5 4 l10 -12z" />
          </g>
          <text x="18" y="4" textAnchor="middle" fontSize="20" fontWeight="800" fill="#eaf7ef" letterSpacing="0.5">
            만나는 곳
          </text>
        </g>
        <ellipse cx="0" cy="146" rx="26" ry="6" fill="#000" opacity="0.35" />
      </g>

      {/* ------------------------------------------------- 우리집 대피지도 */}
      <g transform="translate(150 166)">
        {/* 이젤 다리 */}
        <path d="M40 250 L96 118 M262 250 L206 118 M74 214 H228" stroke="#3a2b22" strokeWidth="9" strokeLinecap="round" />
        <path d="M40 250 L96 118 M262 250 L206 118" stroke="#5c4635" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="150" cy="252" rx="120" ry="12" fill="#000" opacity="0.32" />
        {/* 종이 */}
        <g transform="rotate(-2.5 150 110)">
          <rect x="14" y="6" width="272" height="212" rx="8" fill="#000" opacity="0.35" filter="url(#gsSoft)" />
          <rect x="10" y="0" width="272" height="210" rx="8" fill="url(#gsPaper)" />
          <rect x="10" y="0" width="272" height="34" rx="8" fill="#0f3d68" />
          <rect x="10" y="24" width="272" height="10" fill="#0f3d68" />
          <text x="26" y="24" fontSize="17" fontWeight="800" fill="#ffffff">
            우리집 대피 지도
          </text>
          <circle cx="266" cy="17" r="7" fill="#7ee2b8" opacity="0.8" />

          {/* 방 */}
          <g stroke="#2a3038" strokeWidth="2.4">
            <rect x="28" y="52" width="84" height="58" fill="#fff3d6" />
            <rect x="112" y="52" width="66" height="58" fill="#fff3d6" />
            <rect x="178" y="52" width="76" height="58" fill="#dcefff" />
            <rect x="28" y="110" width="226" height="32" fill="#f6f6ee" />
            <rect x="28" y="142" width="112" height="48" fill="#e8f4e2" />
            <rect x="140" y="142" width="114" height="48" fill="#efe9f7" />
          </g>
          {/* 가구 몇 점 */}
          <g fill="#d9a463" stroke="#2a3038" strokeWidth="1.4">
            <rect x="38" y="60" width="26" height="18" rx="2" />
            <rect x="120" y="60" width="24" height="18" rx="2" />
            <rect x="46" y="154" width="34" height="16" rx="2" fill="#8fb8de" />
          </g>
          {/* 주 경로 */}
          <path d="M62 78 V126 H206 V166 H248" fill="none" stroke={C.danger} strokeWidth="5.4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="62" cy="78" r="12" fill="#ffffff" stroke={C.danger} strokeWidth="3.4" />
          <text x="62" y="83" textAnchor="middle" fontSize="13" fontWeight="800" fill={C.danger}>
            1
          </text>
          <circle cx="248" cy="166" r="6.5" fill={C.danger} />
          {/* 보조 경로 */}
          <path d="M62 78 V126 H84 V182" fill="none" stroke="#9f5700" strokeWidth="4.2" strokeDasharray="9 6" strokeLinecap="round" />
          <circle cx="84" cy="182" r="10" fill="#ffffff" stroke="#9f5700" strokeWidth="3" />
          <text x="84" y="187" textAnchor="middle" fontSize="12" fontWeight="800" fill="#9f5700">
            2
          </text>
        </g>
      </g>

      {/*
        인물 — 발밑이 땅선(y=418)에 닿게 세운다. 앞서 허리가 땅에 묻혀 보였다.
        아이는 '내 캐릭터' 10종에서 그대로 데려온다 — 고르는 화면과 같은 얼굴이다.
      */}
      <Firefighter x={470} y={182} />
      <g transform="translate(740 428) scale(1.06)">
        <KidFull id="girl_twin" rim={C.rim} />
      </g>
      <g transform="translate(848 424) scale(1.06)">
        <KidFull id="boy_cap" rim={C.rim} />
      </g>
      {/* 맞잡은 손 */}
      <path d="M786 358 q28 14 58 -4" fill="none" stroke="#f0c9a4" strokeWidth="9" strokeLinecap="round" />
      <path d="M786 358 q28 14 58 -4" fill="none" stroke={C.rim} strokeWidth="2.6" strokeLinecap="round" opacity="0.55" />

      <Dog x={942} y={392} />

      {/* 근경 — 아래 가장자리의 어두운 수풀. 깊이를 만든다 */}
      <g filter="url(#gsSoft)" opacity="0.85">
        <path d="M-20 520 q60 -54 130 -30 q40 -34 96 -6 q40 -28 84 4 L316 520z" fill="#061422" />
        <path d="M1320 520 q70 -60 148 -26 q52 -36 160 -8 L1620 520z" fill="#061422" />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* 배경 조각                                                            */
/* ------------------------------------------------------------------ */

const STARS: [number, number, number, number][] = [
  [90, 52, 1.6, 0.8], [172, 118, 1.2, 0.55], [332, 44, 1.8, 0.7], [430, 96, 1.1, 0.5],
  [566, 36, 1.5, 0.65], [688, 88, 1.2, 0.45], [812, 30, 1.7, 0.72], [944, 74, 1.2, 0.5],
  [1052, 26, 1.4, 0.6], [1462, 52, 1.5, 0.62], [1536, 118, 1.2, 0.44], [1580, 30, 1.6, 0.6],
  [252, 168, 1, 0.35], [742, 148, 1, 0.32], [1150, 132, 1, 0.3],
];

const FAR_CITY: [number, number, number, number][] = [
  [0, 322, 96, 98], [96, 296, 62, 124], [176, 336, 84, 84], [268, 310, 54, 110],
  [340, 340, 96, 80], [452, 318, 66, 102], [536, 344, 78, 76], [828, 330, 70, 90],
  [906, 306, 58, 114], [976, 338, 88, 82], [1470, 300, 74, 120], [1552, 330, 68, 90],
];

/** 중경 아파트 — 창을 격자로 찍는다 */
function Block({ x, y, w, h, cols, rows, tint }: { x: number; y: number; w: number; h: number; cols: number; rows: number; tint: string }) {
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
          opacity={lit ? 0.62 : 0.85}
        />,
      );
    }
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={tint} />
      <rect x={x} y={y} width={w} height={6} fill="#1d4058" />
      {cells}
    </g>
  );
}

/** 가로등 — 기둥과 빛무리, 바닥에 번지는 빛 */
function Lamp({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <path d="M0 424 V206 q0 -16 16 -16 h26" fill="none" stroke="#123246" strokeWidth="7" strokeLinecap="round" />
      <path d="M2 424 V208" stroke="#1d4a63" strokeWidth="2.4" />
      <ellipse cx="46" cy="194" rx="15" ry="7" fill="#ffe9bd" opacity="0.95" />
      <circle cx="46" cy="196" r="54" fill="url(#gsLamp)" />
      <path d="M32 200 L4 424 L88 424z" fill="#ffe9bd" opacity="0.07" />
      <ellipse cx="0" cy="426" rx="20" ry="5" fill="#000" opacity="0.35" />
    </g>
  );
}

const WINDOWS: { x: number; y: number; fire: boolean; lit: boolean }[] = (() => {
  const out: { x: number; y: number; fire: boolean; lit: boolean }[] = [];
  for (let r = 0; r < 7; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      const x = 1104 + c * 86;
      const y = 84 + r * 46;
      const fire = r === 2 && c === 2;
      out.push({ fire, x, y, lit: !fire && (r * 4 + c * 3) % 5 < 3 });
    }
  }
  return out;
})();

const EMBERS: [number, number, number, number][] = [
  [1266, 160, 2.2, 0.85], [1308, 132, 1.6, 0.7], [1286, 108, 1.9, 0.55],
  [1330, 88, 1.4, 0.45], [1258, 128, 1.5, 0.6], [1348, 148, 1.7, 0.5],
  [1304, 64, 1.3, 0.35], [1240, 178, 1.8, 0.6],
];

/* ------------------------------------------------------------------ */
/* 인물 — 밑칠 · 그늘 · 림라이트 세 톤                                  */
/* ------------------------------------------------------------------ */

const SKIN = '#f2c9a2';
const SKIN_SHADE = '#d29d78';

/**
 * 소방관 캐릭터 — 소방청 영웅이를 참고해 새로 그린 벡터다.
 * 한쪽 무릎을 꿇고 대피지도를 가리킨다. 어른이 아이 눈높이로 내려온 자세다.
 */
function Firefighter({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="34" cy="236" rx="82" ry="15" fill="#000" opacity="0.34" />

      {/* 뒤쪽 다리 — 무릎을 꿇었다 */}
      <path d="M4 148 q-30 40 -26 76 q2 18 26 16 l52 -4 q10 -14 -6 -20 l-34 -2 q6 -26 20 -44z" fill="#16324f" />
      <path d="M-22 224 q-14 4 -14 12 q0 8 16 8 h44 q10 -8 -2 -14z" fill="#101d2b" />
      {/* 앞쪽 다리 — 세운 무릎 */}
      <path d="M52 146 q30 26 34 62 q2 22 -14 24 q-16 2 -20 -16 q-4 -24 -22 -40z" fill="url(#gsCoat)" />
      <path d="M60 224 q22 2 26 10 q4 10 -12 10 h-30 q-10 -10 2 -18z" fill="#101d2b" />

      {/* 방화복 몸통 */}
      <path
        d="M-6 62 q40 -18 78 0 q16 6 16 24 l-4 56 q-2 20 -20 22 l-62 2 q-18 -2 -20 -22 l-4 -58 q0 -18 16 -24z"
        fill="url(#gsCoat)"
      />
      {/* 옷의 그늘(왼쪽)과 반사띠 */}
      <path d="M-6 62 q14 -6 22 -8 l-6 100 l-14 -2 q-18 -2 -20 -22z" fill="#0e2540" opacity="0.55" />
      <path d="M-22 112 h108" stroke="#f4d98a" strokeWidth="9" opacity="0.95" />
      <path d="M-22 112 h108" stroke="#cfe6f2" strokeWidth="3.4" opacity="0.9" />
      <path d="M-20 128 h104" stroke="#f4d98a" strokeWidth="5" opacity="0.65" />
      {/* 앞섶 */}
      <path d="M34 56 V158" stroke="#0e2540" strokeWidth="3" opacity="0.7" />
      {/* 어깨 반사띠 */}
      <path d="M6 66 q28 -12 58 0" fill="none" stroke="#f4d98a" strokeWidth="5" opacity="0.8" />

      {/* 왼팔 — 지도를 가리킨다 */}
      <path d="M-2 76 q-46 18 -74 46 q-10 12 2 20 q12 8 22 -4 q22 -26 56 -34z" fill="url(#gsCoat)" />
      <path d="M-58 128 q-16 6 -20 14" stroke="#f4d98a" strokeWidth="5" fill="none" opacity="0.7" />
      <g transform="translate(-84 138)">
        <path d="M0 0 q-16 4 -22 12 q-4 8 6 10 q10 2 18 -6 q6 -6 10 -8z" fill={SKIN} />
        <path d="M-22 12 q-10 2 -14 -2 q10 -8 16 -8z" fill={SKIN_SHADE} opacity="0.7" />
      </g>
      {/* 오른팔 — 무릎에 얹음 */}
      <path d="M74 78 q30 16 40 44 q6 14 -8 20 q-14 4 -20 -10 q-8 -20 -26 -32z" fill="url(#gsCoat)" />
      <path d="M100 142 q12 6 12 14 q0 8 -12 6 q-10 -2 -12 -10z" fill={SKIN} />

      {/* 목 */}
      <path d="M20 44 h30 v22 q-16 8 -30 0z" fill={SKIN_SHADE} />
      {/* 얼굴 */}
      <g>
        <path d="M-4 -2 q0 -44 40 -44 q40 0 40 44 q0 40 -40 46 q-40 -6 -40 -46z" fill={SKIN} />
        <path d="M-4 -2 q0 -44 40 -44 q-16 16 -18 44 q-2 28 6 44 q-28 -8 -28 -44z" fill={SKIN_SHADE} opacity="0.55" />
        {/* 볼 */}
        <ellipse cx="12" cy="18" rx="9" ry="6" fill="#e59a86" opacity="0.4" />
        <ellipse cx="60" cy="16" rx="9" ry="6" fill="#e59a86" opacity="0.4" />
        {/* 눈 */}
        <g>
          <ellipse cx="20" cy="2" rx="6.4" ry="7.4" fill={C.ink} />
          <ellipse cx="52" cy="0" rx="6.4" ry="7.4" fill={C.ink} />
          <circle cx="22.4" cy="-1.6" r="2.2" fill="#ffffff" />
          <circle cx="54.4" cy="-3.6" r="2.2" fill="#ffffff" />
        </g>
        {/* 눈썹 */}
        <path d="M12 -12 q8 -5 16 -1" stroke={C.ink} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M44 -14 q8 -4 16 1" stroke={C.ink} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        {/* 입 — 편안한 웃음 */}
        <path d="M26 24 q10 10 22 1" stroke={C.ink} strokeWidth="2.8" fill="none" strokeLinecap="round" />
      </g>

      {/* 헬멧 */}
      <g>
        <path d="M-14 -6 q2 -56 50 -56 q48 0 50 56 q-50 -14 -100 0z" fill="url(#gsHelmet)" />
        <path d="M-14 -6 q2 -56 50 -56 q-24 18 -28 58z" fill="#c98d12" opacity="0.5" />
        {/* 챙 */}
        <path d="M-26 -6 q62 -16 124 0 q4 10 -8 12 q-54 -12 -108 0 q-12 -2 -8 -12z" fill="#e0aa26" />
        <path d="M-26 -6 q62 -16 124 0" fill="none" stroke="#fff0c0" strokeWidth="2" opacity="0.7" />
        {/* 정수리 능선 */}
        <path d="M36 -62 v34" stroke="#c98d12" strokeWidth="3" opacity="0.7" />
        {/* 앞면 방패 */}
        <g transform="translate(36 -34)">
          <path d="M0 -16 l16 5 v11 q0 12 -16 18 q-16 -6 -16 -18 v-11z" fill="#c8102e" stroke="#8d0a20" strokeWidth="1.6" />
          <path d="M0 -10 c-4 6 3 8 0 14 c8 -2 9 -9 6 -13 c1 5 -3 6 -6 -1z" fill="#ffd166" />
        </g>
      </g>

      {/* 림라이트 — 불빛이 있는 오른쪽 모서리 */}
      <g stroke={C.rim} fill="none" strokeLinecap="round" opacity="0.85">
        <path d="M86 -6 q2 -50 -34 -56" strokeWidth="3.2" />
        <path d="M92 74 q16 8 22 28" strokeWidth="3" />
        <path d="M88 90 l-4 62" strokeWidth="2.6" opacity="0.7" />
        <path d="M74 24 q10 -10 10 -26" strokeWidth="2.4" opacity="0.6" />
      </g>
    </g>
  );
}

/** 아이 하나 — 6등신에 가깝게. 표정은 편안하다 */
function Child({ x, y, cap, coat, hair, skirt, name }: { x: number; y: number; cap: string; coat: string; hair: string; skirt?: boolean; name: string }) {
  return (
    <g transform={`translate(${x} ${y})`} aria-label={name}>
      <ellipse cx="0" cy="150" rx="46" ry="10" fill="#000" opacity="0.32" />
      {/* 다리 */}
      <path d="M-16 92 q-6 30 -12 48 q-4 12 8 14 q10 2 12 -10 l8 -40z" fill="#2c3a4a" />
      <path d="M16 92 q10 28 18 46 q6 12 -6 16 q-12 2 -16 -10 l-14 -38z" fill="#37475a" />
      <path d="M-24 150 q-10 2 -10 8 q0 6 12 6 h18 q6 -8 -2 -12z" fill="#1a2430" />
      <path d="M22 154 q10 2 10 8 q0 6 -12 6 h-16 q-6 -8 2 -12z" fill="#1a2430" />
      {/* 옷 */}
      {skirt ? (
        <path d="M-30 40 q30 -12 60 0 l10 46 q-40 14 -80 0z" fill={coat} />
      ) : (
        <path d="M-28 40 q28 -12 56 0 l6 54 q-34 12 -68 0z" fill={coat} />
      )}
      <path d="M-28 40 q12 -6 18 -7 l-10 62 l-14 -1z" fill="#000" opacity="0.12" />
      {/* 팔 */}
      <path d="M-28 48 q-18 18 -22 42 q-2 10 8 12 q10 0 12 -10 q4 -18 14 -30z" fill={coat} />
      <path d="M28 48 q18 16 24 36 q4 10 -6 14 q-10 2 -14 -8 q-6 -16 -16 -26z" fill={coat} />
      <circle cx="-42" cy="104" r="9" fill={SKIN} />
      <circle cx="48" cy="100" r="9" fill={SKIN} />
      {/* 목·얼굴 */}
      <path d="M-9 22 h18 v14 q-9 6 -18 0z" fill={SKIN_SHADE} />
      <path d="M-30 -8 q0 -38 30 -38 q30 0 30 38 q0 34 -30 40 q-30 -6 -30 -40z" fill={SKIN} />
      <path d="M-30 -8 q0 -38 30 -38 q-14 14 -16 38 q-2 24 6 40 q-20 -8 -20 -40z" fill={SKIN_SHADE} opacity="0.5" />
      {/* 머리카락 */}
      <path d="M-31 -12 q-2 -40 31 -40 q33 0 31 40 q-6 -22 -31 -22 q-25 0 -31 22z" fill={hair} />
      {skirt && <path d="M-32 -14 q-10 26 -4 44 q10 -18 6 -40z" fill={hair} />}
      {/* 모자 */}
      <path d="M-30 -12 q0 -34 30 -34 q30 0 30 34 q-30 -10 -60 0z" fill={cap} />
      <path d="M-30 -12 q0 -34 30 -34 q-14 12 -16 34z" fill="#000" opacity="0.16" />
      <path d="M-38 -12 q38 -10 76 0 q2 8 -6 9 q-32 -8 -64 0 q-8 -1 -6 -9z" fill={cap} />
      <path d="M-38 -12 q38 -10 76 0" fill="none" stroke="#ffffff" strokeWidth="1.6" opacity="0.35" />
      {/* 눈·입 */}
      <ellipse cx="-11" cy="-2" rx="4.6" ry="5.6" fill={C.ink} />
      <ellipse cx="13" cy="-3" rx="4.6" ry="5.6" fill={C.ink} />
      <circle cx="-9.4" cy="-4" r="1.7" fill="#ffffff" />
      <circle cx="14.6" cy="-5" r="1.7" fill="#ffffff" />
      <ellipse cx="-18" cy="10" rx="6" ry="4" fill="#e59a86" opacity="0.35" />
      <ellipse cx="20" cy="9" rx="6" ry="4" fill="#e59a86" opacity="0.35" />
      <path d="M-6 12 q6 7 13 0" stroke={C.ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      {/* 림라이트 */}
      <g stroke={C.rim} fill="none" strokeLinecap="round" opacity="0.8">
        <path d="M30 -14 q2 -30 -14 -32" strokeWidth="2.6" />
        <path d="M34 44 l6 44" strokeWidth="2.4" opacity="0.75" />
        <path d="M24 -2 q6 -8 6 -14" strokeWidth="2" opacity="0.6" />
      </g>
    </g>
  );
}

/**
 * 강아지 대원 — 소방청 일구를 참고해 새로 그린 벡터다.
 * 진돗개 같은 선 굵은 실루엣에 119 구조대 조끼를 입혔다.
 */
function Dog({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(0.82)`}>
      <ellipse cx="6" cy="86" rx="54" ry="9" fill="#000" opacity="0.3" />
      {/* 뒷다리·앞다리 */}
      <path d="M32 46 q10 22 8 36 q-2 8 -10 6 q-8 -2 -6 -10 l2 -28z" fill="#c08a54" />
      <path d="M-28 44 q-8 22 -6 36 q2 8 10 6 q8 -2 6 -10 l-2 -28z" fill="#c08a54" />
      <path d="M12 50 q6 22 4 34 q-2 8 -10 6 q-8 -2 -6 -10 l2 -26z" fill="#d79f66" />
      <path d="M-10 48 q-4 22 -2 34 q2 8 10 6 q8 -2 6 -10 l-2 -26z" fill="#d79f66" />
      {/* 몸통 */}
      <path d="M-36 22 q6 -22 34 -22 h20 q28 0 34 22 q6 22 -12 30 q-32 10 -64 0 q-18 -8 -12 -30z" fill="#d79f66" />
      <path d="M-36 22 q6 -22 34 -22 q-14 14 -16 30 q-2 14 4 22 q-18 -8 -22 -30z" fill="#b87f49" opacity="0.55" />
      {/* 꼬리 */}
      <path d="M40 22 q26 -10 26 -34 q-2 -10 -10 -6 q-6 4 -6 14 q0 12 -14 18z" fill="#d79f66" />
      {/* 조끼 */}
      <path d="M-24 14 q26 -12 54 0 l4 24 q-30 10 -62 0z" fill="#c8102e" />
      <path d="M-24 24 h62" stroke="#f4d98a" strokeWidth="5" opacity="0.9" />
      <path d="M-6 12 v30" stroke="#8d0a20" strokeWidth="2" opacity="0.6" />
      <g transform="translate(18 32)">
        <rect x="-13" y="-9" width="26" height="17" rx="4" fill="#ffffff" opacity="0.94" />
        <text x="0" y="4" textAnchor="middle" fontSize="11" fontWeight="800" fill="#c8102e">
          119
        </text>
      </g>
      {/* 머리 */}
      <g transform="translate(-46 -6)">
        <path d="M-22 8 q-2 -30 24 -30 q26 0 24 30 q-2 26 -24 30 q-22 -4 -24 -30z" fill="#d79f66" />
        <path d="M-22 8 q-2 -30 24 -30 q-14 12 -16 30 q-2 18 6 30 q-12 -6 -14 -30z" fill="#b87f49" opacity="0.5" />
        {/* 귀 */}
        <path d="M-20 -14 q-8 -22 2 -30 q10 -6 16 14z" fill="#a86f3d" />
        <path d="M22 -16 q8 -22 -2 -30 q-10 -6 -16 14z" fill="#b87f49" />
        {/* 주둥이 */}
        <ellipse cx="2" cy="20" rx="16" ry="12" fill="#f0dcc0" />
        <ellipse cx="2" cy="12" rx="6" ry="4.6" fill={C.ink} />
        <path d="M2 16 v5 M2 21 q-6 5 -11 1 M2 21 q6 5 11 1" stroke={C.ink} strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* 눈 */}
        <ellipse cx="-9" cy="-2" rx="4.6" ry="5.4" fill={C.ink} />
        <ellipse cx="13" cy="-3" rx="4.6" ry="5.4" fill={C.ink} />
        <circle cx="-7.4" cy="-4" r="1.7" fill="#ffffff" />
        <circle cx="14.6" cy="-5" r="1.7" fill="#ffffff" />
        {/* 눈썹 점 */}
        <ellipse cx="-10" cy="-13" rx="3" ry="2" fill="#b87f49" opacity="0.8" />
        <ellipse cx="14" cy="-14" rx="3" ry="2" fill="#b87f49" opacity="0.8" />
      </g>
      {/* 림라이트 */}
      <g stroke={C.rim} fill="none" strokeLinecap="round" opacity="0.8">
        <path d="M50 6 q14 -12 16 -30" strokeWidth="2.4" />
        <path d="M44 34 q8 -12 6 -24" strokeWidth="2.2" opacity="0.7" />
      </g>
    </g>
  );
}
