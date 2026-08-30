'use client';

/**
 * 블록 그림 — 전부 벡터 자체 제작(이모지 미사용).
 *
 * 소방 기호(소화기·대피공간·하향식 피난구·경량칸막이·집결지)는 밖에서 만나게 될
 * 진짜 표지이므로 기존 것을 그대로 쓰고 바꾸지 않는다.
 * 나머지 가구·위험원은 어린이 모드와 도면 모드 두 벌로 그린다.
 */
import React from 'react';
import {
  SymAssembly,
  SymDownLadder,
  SymExtinguisher,
  SymPartition,
  SymRefuge,
} from './FireSymbols';
import { KidToken } from './KidCharacters';

export type ArtStyle = 'kid' | 'blueprint';

export interface ArtProps {
  /** 그릴 상자의 크기(SVG 단위). 원점은 왼쪽 위 */
  w: number;
  h: number;
  style: ArtStyle;
}

const KID = {
  wood: '#d9a463',
  soft: '#f3d9b1',
  cloth: '#8fb8de',
  cool: '#cfe3f3',
  warm: '#f2a58c',
  hot: '#e2503f',
  ink: '#2a3038',
  metal: '#c3ccd6',
  green: '#0e7c4f',
};

const BP = {
  line: '#5a6472',
  fill: '#ffffff',
};

function box(style: ArtStyle): { stroke: string; fill: string; sw: number; rx: number } {
  return style === 'kid'
    ? { stroke: KID.ink, fill: KID.soft, sw: 2, rx: 5 }
    : { stroke: BP.line, fill: BP.fill, sw: 1.2, rx: 0 };
}

/* ------------------------------------------------------------------ */
/* 가구                                                                */
/* ------------------------------------------------------------------ */

function Bed({ w, h, style }: ArtProps) {
  const b = box(style);
  const head = Math.min(h * 0.28, 14);
  return (
    <g>
      <rect x={1} y={1} width={w - 2} height={h - 2} rx={b.rx} fill={style === 'kid' ? KID.wood : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
      <rect
        x={3}
        y={3}
        width={w - 6}
        height={h - head - 4}
        rx={b.rx}
        fill={style === 'kid' ? KID.cloth : b.fill}
        stroke={b.stroke}
        strokeWidth={b.sw}
        transform={`translate(0 ${head})`}
      />
      <rect x={5} y={4} width={w - 10} height={head - 2} rx={b.rx} fill={style === 'kid' ? '#ffffff' : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
    </g>
  );
}

function Sofa({ w, h, style }: ArtProps) {
  const b = box(style);
  return (
    <g>
      <rect x={1} y={h * 0.3} width={w - 2} height={h * 0.7 - 1} rx={b.rx} fill={style === 'kid' ? KID.cloth : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
      <rect x={1} y={1} width={w - 2} height={h * 0.35} rx={b.rx} fill={style === 'kid' ? '#7aa6d2' : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
      <rect x={1} y={h * 0.3} width={w * 0.12} height={h * 0.7 - 1} rx={b.rx} fill={style === 'kid' ? '#7aa6d2' : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
      <rect x={w - 1 - w * 0.12} y={h * 0.3} width={w * 0.12} height={h * 0.7 - 1} rx={b.rx} fill={style === 'kid' ? '#7aa6d2' : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
    </g>
  );
}

function Desk({ w, h, style }: ArtProps) {
  const b = box(style);
  return (
    <g>
      <rect x={1} y={1} width={w - 2} height={h - 2} rx={b.rx} fill={style === 'kid' ? KID.wood : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
      <path d={`M1 ${h * 0.62} H${w - 1}`} stroke={b.stroke} strokeWidth={b.sw} fill="none" />
    </g>
  );
}

function Wardrobe({ w, h, style }: ArtProps) {
  const b = box(style);
  return (
    <g>
      <rect x={1} y={1} width={w - 2} height={h - 2} rx={b.rx} fill={style === 'kid' ? '#b98150' : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
      <path d={`M${w / 2} 1 V${h - 1}`} stroke={b.stroke} strokeWidth={b.sw} />
      <circle cx={w / 2 - 4} cy={h / 2} r={1.6} fill={b.stroke} />
      <circle cx={w / 2 + 4} cy={h / 2} r={1.6} fill={b.stroke} />
    </g>
  );
}

function Bookshelf({ w, h, style }: ArtProps) {
  const b = box(style);
  const rows = 3;
  return (
    <g>
      <rect x={1} y={1} width={w - 2} height={h - 2} rx={b.rx} fill={style === 'kid' ? '#c98f5c' : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
      {Array.from({ length: rows - 1 }, (_, i) => (
        <path key={i} d={`M1 ${((i + 1) * (h - 2)) / rows + 1} H${w - 1}`} stroke={b.stroke} strokeWidth={b.sw} />
      ))}
    </g>
  );
}

function DiningTable({ w, h, style }: ArtProps) {
  const b = box(style);
  return (
    <g>
      <rect x={w * 0.15} y={h * 0.15} width={w * 0.7} height={h * 0.7} rx={b.rx} fill={style === 'kid' ? KID.wood : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
      {[
        [w * 0.5, h * 0.06],
        [w * 0.5, h * 0.94],
        [w * 0.06, h * 0.5],
        [w * 0.94, h * 0.5],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={Math.min(w, h) * 0.07} fill={style === 'kid' ? '#ffffff' : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
      ))}
    </g>
  );
}

function Fridge({ w, h, style }: ArtProps) {
  const b = box(style);
  return (
    <g>
      <rect x={2} y={2} width={w - 4} height={h - 4} rx={b.rx} fill={style === 'kid' ? KID.metal : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
      <path d={`M2 ${h * 0.38} H${w - 2}`} stroke={b.stroke} strokeWidth={b.sw} />
      <path d={`M${w - 8} ${h * 0.14} V${h * 0.3}`} stroke={b.stroke} strokeWidth={b.sw + 0.6} strokeLinecap="round" />
      <path d={`M${w - 8} ${h * 0.48} V${h * 0.72}`} stroke={b.stroke} strokeWidth={b.sw + 0.6} strokeLinecap="round" />
    </g>
  );
}

function Tv({ w, h, style }: ArtProps) {
  const b = box(style);
  return (
    <g>
      <rect x={2} y={h * 0.2} width={w - 4} height={h * 0.5} rx={b.rx} fill={style === 'kid' ? '#3a4453' : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
      <path d={`M${w / 2} ${h * 0.7} V${h * 0.84} M${w * 0.3} ${h * 0.84} H${w * 0.7}`} stroke={b.stroke} strokeWidth={b.sw + 0.4} fill="none" strokeLinecap="round" />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* 위험원 — 어린이 모드에서도 겁주지 않는다 (P5)                        */
/* ------------------------------------------------------------------ */

function GasRange({ w, h, style }: ArtProps) {
  const b = box(style);
  const r = Math.min(w, h) * 0.17;
  return (
    <g>
      <rect x={2} y={2} width={w - 4} height={h - 4} rx={b.rx} fill={style === 'kid' ? '#e8ebef' : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
      {[
        [w * 0.33, h * 0.36],
        [w * 0.67, h * 0.36],
        [w * 0.33, h * 0.68],
        [w * 0.67, h * 0.68],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={style === 'kid' ? KID.hot : b.stroke} strokeWidth={b.sw + 0.4} />
      ))}
    </g>
  );
}

function Boiler({ w, h, style }: ArtProps) {
  const b = box(style);
  return (
    <g>
      <rect x={3} y={3} width={w - 6} height={h - 6} rx={b.rx} fill={style === 'kid' ? '#dfe6ee' : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
      <circle cx={w * 0.5} cy={h * 0.42} r={Math.min(w, h) * 0.16} fill="none" stroke={style === 'kid' ? KID.hot : b.stroke} strokeWidth={b.sw + 0.4} />
      <path d={`M${w * 0.28} ${h * 0.72} H${w * 0.72}`} stroke={b.stroke} strokeWidth={b.sw} />
    </g>
  );
}

function PowerStrip({ w, h, style }: ArtProps) {
  const b = box(style);
  return (
    <g>
      <rect x={3} y={h * 0.35} width={w - 6} height={h * 0.3} rx={b.rx} fill={style === 'kid' ? '#f4f6f8' : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
      {[0.3, 0.5, 0.7].map((t, i) => (
        <g key={i}>
          <circle cx={w * t} cy={h * 0.44} r={1.5} fill={b.stroke} />
          <circle cx={w * t} cy={h * 0.56} r={1.5} fill={b.stroke} />
        </g>
      ))}
      <path
        d={`M${w - 3} ${h * 0.5} q6 0 6 ${h * 0.2}`}
        fill="none"
        stroke={style === 'kid' ? KID.hot : b.stroke}
        strokeWidth={b.sw + 0.4}
        strokeLinecap="round"
      />
    </g>
  );
}

function Heater({ w, h, style }: ArtProps) {
  const b = box(style);
  return (
    <g>
      <rect x={3} y={3} width={w - 6} height={h - 6} rx={b.rx} fill={style === 'kid' ? '#fbe6dc' : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
      {[0.32, 0.5, 0.68].map((t, i) => (
        <path
          key={i}
          d={`M${w * t} ${h * 0.28} V${h * 0.72}`}
          stroke={style === 'kid' ? KID.hot : b.stroke}
          strokeWidth={b.sw + 0.6}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

function Candle({ w, h, style }: ArtProps) {
  const b = box(style);
  return (
    <g>
      <rect x={w * 0.38} y={h * 0.38} width={w * 0.24} height={h * 0.44} rx={2} fill={style === 'kid' ? '#fff2cc' : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
      <path
        d={`M${w * 0.5} ${h * 0.16} q${w * 0.12} ${h * 0.14} 0 ${h * 0.22} q${-w * 0.12} ${-h * 0.08} 0 ${-h * 0.22}z`}
        fill={style === 'kid' ? '#f2a63b' : 'none'}
        stroke={b.stroke}
        strokeWidth={b.sw}
      />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* 설비 · 표시                                                          */
/* ------------------------------------------------------------------ */

/** 화재감지기 — 천장에 붙는 원형 */
function Detector({ w, h }: ArtProps) {
  const r = Math.min(w, h) * 0.36;
  return (
    <g transform={`translate(${w / 2} ${h / 2})`}>
      <circle r={r} fill="#ffffff" stroke={KID.ink} strokeWidth={2} />
      <circle r={r * 0.45} fill={KID.ink} />
      <g stroke={KID.ink} strokeWidth={1.6} strokeLinecap="round">
        <path d={`M${-r * 1.5} ${-r * 0.5} l${-r * 0.5} ${-r * 0.3}`} />
        <path d={`M${r * 1.5} ${-r * 0.5} l${r * 0.5} ${-r * 0.3}`} />
      </g>
    </g>
  );
}

/** 가스 중간밸브 — 배관 위 손잡이 */
function GasValve({ w, h }: ArtProps) {
  const s = Math.min(w, h);
  return (
    <g transform={`translate(${w / 2} ${h / 2})`}>
      <path d={`M${-s * 0.4} 0 H${s * 0.4}`} stroke={KID.ink} strokeWidth={s * 0.14} strokeLinecap="round" />
      <circle r={s * 0.2} fill="#ffd166" stroke={KID.ink} strokeWidth={1.8} />
      <path d={`M0 ${-s * 0.34} V${-s * 0.18}`} stroke={KID.ink} strokeWidth={s * 0.1} strokeLinecap="round" />
    </g>
  );
}

/** 완강기 — 벽걸이 도르래와 줄. 어른과 함께 쓰는 설비다 */
function DescentDevice({ w, h }: ArtProps) {
  const s = Math.min(w, h);
  return (
    <g transform={`translate(${w / 2} ${h / 2})`}>
      <rect x={-s * 0.38} y={-s * 0.38} width={s * 0.76} height={s * 0.76} rx={3} fill="#0e7c4f" />
      <circle cy={-s * 0.1} r={s * 0.14} fill="none" stroke="#fff" strokeWidth={2.2} />
      <path d={`M0 ${s * 0.04} V${s * 0.3}`} stroke="#fff" strokeWidth={2.2} strokeLinecap="round" />
      <path d={`M${-s * 0.12} ${s * 0.3} H${s * 0.12}`} stroke="#fff" strokeWidth={2.2} strokeLinecap="round" />
    </g>
  );
}

/** 내 자리 — 출발점 */
function MySpot({ w, h }: ArtProps) {
  const s = Math.min(w, h);
  return (
    <g transform={`translate(${w / 2} ${h / 2})`}>
      <circle r={s * 0.36} fill="#ffffff" stroke="#0f3d68" strokeWidth={2.4} />
      <circle cy={-s * 0.1} r={s * 0.11} fill="#0f3d68" />
      <path d={`M${-s * 0.16} ${s * 0.22} q${s * 0.16} ${-s * 0.2} ${s * 0.32} 0`} fill="none" stroke="#0f3d68" strokeWidth={2.2} strokeLinecap="round" />
    </g>
  );
}

/** 지상 출구 */
/**
 * 밖으로 나가는 곳 세 갈래 (설계서 v1.2 §3.1).
 * 화살표 방향으로 어디로 나가는지를 구분한다 — 색만으로 나누지 않는다 (P4).
 *   1층 밖 → 옆으로 · 옥상 → 위로 · 지하 → 아래로
 */
function GroundExit({ w, h, dir = 'side' }: ArtProps & { dir?: 'side' | 'up' | 'down' }) {
  const s = Math.min(w, h);
  const fill = dir === 'down' ? '#7a6a2f' : '#0e7c4f';
  const arrow =
    dir === 'up'
      ? `M0 ${s * 0.16} V${-s * 0.16} M${-s * 0.12} ${-s * 0.04} l${s * 0.12} ${-s * 0.12} l${s * 0.12} ${s * 0.12}`
      : dir === 'down'
        ? `M0 ${-s * 0.16} V${s * 0.16} M${-s * 0.12} ${s * 0.04} l${s * 0.12} ${s * 0.12} l${s * 0.12} ${-s * 0.12}`
        : `M${-s * 0.16} 0 H${s * 0.18} M${s * 0.06} ${-s * 0.12} l${s * 0.12} ${s * 0.12} l${-s * 0.12} ${s * 0.12}`;
  return (
    <g transform={`translate(${w / 2} ${h / 2})`}>
      <rect x={-s * 0.38} y={-s * 0.3} width={s * 0.76} height={s * 0.6} rx={3} fill={fill} />
      <path d={arrow} fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/** 싱크대 — 부엌의 표준 배치 */
function Sink({ w, h, style }: ArtProps) {
  const b = box(style);
  return (
    <g>
      <rect x={1} y={1} width={w - 2} height={h - 2} rx={b.rx} fill={style === 'kid' ? '#dfe6ea' : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
      <rect x={w * 0.18} y={h * 0.28} width={w * 0.44} height={h * 0.44} rx={3} fill="none" stroke={b.stroke} strokeWidth={b.sw} />
      <circle cx={w * 0.4} cy={h * 0.5} r={Math.max(1.2, w * 0.05)} fill={b.stroke} />
      <path d={`M${w * 0.76} ${h * 0.7} V${h * 0.32} h${-w * 0.12}`} fill="none" stroke={b.stroke} strokeWidth={b.sw} strokeLinecap="round" />
    </g>
  );
}

/** 컴퓨터 — 본체와 화면 */
function Computer({ w, h, style }: ArtProps) {
  const b = box(style);
  return (
    <g>
      <rect x={1} y={h * 0.18} width={w * 0.62} height={h * 0.46} rx={2} fill={style === 'kid' ? '#2f3a45' : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
      <path d={`M${w * 0.14} ${h * 0.64} h${w * 0.36} l${-w * 0.06} ${h * 0.14} h${-w * 0.24} z`} fill={style === 'kid' ? '#8b98a6' : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
      <rect x={w * 0.68} y={h * 0.2} width={w * 0.28} height={h * 0.62} rx={2} fill={style === 'kid' ? '#4a5561' : b.fill} stroke={b.stroke} strokeWidth={b.sw} />
      <circle cx={w * 0.82} cy={h * 0.32} r={Math.max(1, w * 0.035)} fill="#7ee2b8" />
    </g>
  );
}

/* ------------------------------------------------------------------ */

/** 기존 소방 기호는 원점 중심 좌표계다. 상자 가운데로 옮겨 그린다 */
function Centered({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  return <g transform={`translate(${w / 2} ${h / 2})`}>{children}</g>;
}

export function PointArt({ subKind, w, h, style }: ArtProps & { subKind: string }) {
  const s = Math.min(w, h);
  switch (subKind) {
    /* 소방 기호 — 그대로 쓴다 */
    case 'extinguisher':
      return (
        <Centered w={w} h={h}>
          <SymExtinguisher size={s * 0.82} />
        </Centered>
      );
    case 'refuge_area':
      return (
        <Centered w={w} h={h}>
          <SymRefuge size={s * 0.86} />
        </Centered>
      );
    case 'descending_hatch':
      return (
        <Centered w={w} h={h}>
          <SymDownLadder size={s * 0.86} />
        </Centered>
      );
    case 'light_partition':
      return (
        <Centered w={w} h={h}>
          <SymPartition size={w * 0.92} />
        </Centered>
      );
    case 'meeting_point':
      return (
        <Centered w={w} h={h}>
          <SymAssembly size={s * 0.86} />
        </Centered>
      );

    case 'descent_device':
      return <DescentDevice w={w} h={h} style={style} />;
    case 'detector':
      return <Detector w={w} h={h} style={style} />;
    case 'gas_valve':
      return <GasValve w={w} h={h} style={style} />;
    case 'my_spot':
      return <MySpot w={w} h={h} style={style} />;
    /*
     * 형·동생은 사람이다. 팔레트에서는 표본 캐릭터로 보이고,
     * 도면 위에서는 PlanSvg 가 내 캐릭터와 겹치지 않는 아이로 바꿔 그린다 (설계서 v1.5 §3).
     */
    case 'sibling_older':
      return <KidToken id="boy_sport" size={Math.min(w, h)} posture="stand" facing="left" />;
    case 'sibling_younger':
      return <KidToken id="girl_twin" size={Math.min(w, h)} posture="stand" facing="right" />;
    case 'ground_exit':
      return <GroundExit w={w} h={h} style={style} dir="side" />;
    case 'roof_exit':
      return <GroundExit w={w} h={h} style={style} dir="up" />;
    case 'basement_exit':
      return <GroundExit w={w} h={h} style={style} dir="down" />;

    case 'bed':
      return <Bed w={w} h={h} style={style} />;
    case 'sofa':
      return <Sofa w={w} h={h} style={style} />;
    case 'desk':
      return <Desk w={w} h={h} style={style} />;
    case 'wardrobe':
      return <Wardrobe w={w} h={h} style={style} />;
    case 'bookshelf':
      return <Bookshelf w={w} h={h} style={style} />;
    case 'dining_table':
      return <DiningTable w={w} h={h} style={style} />;
    case 'fridge':
      return <Fridge w={w} h={h} style={style} />;
    case 'tv':
      return <Tv w={w} h={h} style={style} />;
    case 'sink':
      return <Sink w={w} h={h} style={style} />;
    case 'computer':
      return <Computer w={w} h={h} style={style} />;

    case 'gas_range':
      return <GasRange w={w} h={h} style={style} />;
    case 'boiler':
      return <Boiler w={w} h={h} style={style} />;
    case 'power_strip':
      return <PowerStrip w={w} h={h} style={style} />;
    case 'heater':
      return <Heater w={w} h={h} style={style} />;
    case 'candle':
      return <Candle w={w} h={h} style={style} />;

    default:
      return <rect x={3} y={3} width={w - 6} height={h - 6} rx={4} fill="none" stroke={KID.ink} strokeWidth={1.6} />;
  }
}

/** 개구부 그림 — 벽 위 한 칸에 그린다 */
export function OpeningArt({
  kind,
  len,
  style,
  open,
}: {
  kind: string;
  len: number;
  style: ArtStyle;
  /** 지금 열려 있는가. 편집 화면에서는 '평소 상태'를 그린다 */
  open?: boolean;
}) {
  const t = 8;
  const stroke = style === 'kid' ? KID.ink : BP.line;
  const isOpen = open !== false;

  if (kind === 'open_passage') {
    /* 문짝·문틀·인방 없이 벽선만 완전히 지운다 (설계서 v1.6 §11.3). */
    return <rect x={-len / 2 - 1} y={-t / 2 - 2} width={len + 2} height={t + 4} fill="#ffffff" />;
  }

  if (kind === 'window' || kind === 'balcony_window') {
    const glass = style === 'kid' ? '#4c9ad4' : stroke;
    /*
     * 창은 벽을 끊고 흰 틀을 남긴다. 닫힘은 유리 두 줄이 틀을 메우고,
     * 열림은 한 짝이 옆으로 밀려 가운데가 비어 보인다 (설계서 v1.2 §2.3).
     */
    return (
      <g>
        <rect x={-len / 2} y={-t / 2} width={len} height={t} fill="#ffffff" stroke={stroke} strokeWidth={1.8} />
        {/* 창틀 양끝 */}
        <path d={`M${-len / 2} ${-t / 2 - 2} V${t / 2 + 2} M${len / 2} ${-t / 2 - 2} V${t / 2 + 2}`} stroke={stroke} strokeWidth={2.4} strokeLinecap="round" />
        {isOpen ? (
          <>
            <rect x={-len / 2 + 1} y={-2.6} width={len * 0.46} height={5.2} fill={glass} opacity={0.85} />
            <path d={`M${len * 0.06} ${-t / 2} V${t / 2}`} stroke={glass} strokeWidth={1.6} opacity={0.6} />
            <path d={`M${len * 0.14} 0 h${len * 0.2}`} stroke={glass} strokeWidth={1.6} strokeDasharray="2 2" opacity={0.7} />
          </>
        ) : (
          <>
            <path d={`M${-len / 2 + 2} -2 H${len / 2 - 2}`} stroke={glass} strokeWidth={2.4} />
            <path d={`M${-len / 2 + 2} 2 H${len / 2 - 2}`} stroke={glass} strokeWidth={2.4} />
          </>
        )}
      </g>
    );
  }

  /*
   * 문은 위에서 본 모습이다. 건축 도면 관례를 따르되 아이도 알아보게 굵게 그린다.
   *   닫힘 — 문짝이 문틀을 완전히 막는다. 손잡이가 보인다
   *   열림 — 문짝이 90도 돌아 안쪽으로 뻗고, 지나갈 자리는 비어 있다. 회전 호는 점선
   * 현관문은 더 굵고 초록이며, 바깥쪽에 문턱선을 하나 더 그어 다른 문과 구별한다.
   */
  const isFront = kind === 'front_door' || kind === 'emergency_exit';
  const leaf = len * 0.86;
  const hinge = -len / 2;
  const doorColor = isFront ? '#0b6b43' : style === 'kid' ? '#9c6239' : stroke;
  const thick = isFront ? 8 : 6.4;

  return (
    <g>
      {/* 벽을 끊은 자리 */}
      <rect x={-len / 2} y={-t / 2} width={len} height={t} fill="#ffffff" />
      {/* 문설주 — 양끝 기둥 */}
      <path
        d={`M${-len / 2} ${-t / 2 - 3} V${t / 2 + 3} M${len / 2} ${-t / 2 - 3} V${t / 2 + 3}`}
        stroke={stroke}
        strokeWidth={3.2}
        strokeLinecap="round"
      />
      {isFront && (
        /* 현관문 문턱 — 바깥쪽에 한 줄 더 */
        <path d={`M${-len / 2 - 2} ${-t / 2 - 4} H${len / 2 + 2}`} stroke={doorColor} strokeWidth={2.4} strokeLinecap="round" opacity={0.9} />
      )}
      {isOpen ? (
        <>
          {/* 열림 — 문짝이 안쪽으로 90도 돌아 서 있다 */}
          <path d={`M${hinge + leaf} 0 A ${leaf} ${leaf} 0 0 1 ${hinge} ${leaf}`} fill="none" stroke={doorColor} strokeWidth={1.4} strokeDasharray="4 3" opacity={0.6} />
          <path d={`M${hinge} 1 V${leaf}`} stroke={doorColor} strokeWidth={thick} strokeLinecap="round" />
          <path d={`M${hinge} 1 V${leaf}`} stroke="#ffffff" strokeWidth={1.6} strokeLinecap="round" opacity={0.45} />
          <circle cx={hinge} cy={0} r={3} fill={doorColor} />
        </>
      ) : (
        <>
          {/* 닫힘 — 문짝이 문틀을 가로막는다 */}
          <path d={`M${-len / 2 + 1.5} 0 H${len / 2 - 1.5}`} stroke={doorColor} strokeWidth={thick} strokeLinecap="round" />
          <path d={`M${-len / 2 + 1.5} 0 H${len / 2 - 1.5}`} stroke="#ffffff" strokeWidth={1.6} strokeLinecap="round" opacity={0.4} />
          <circle cx={len / 2 - 6} cy={0} r={2.3} fill="#ffffff" stroke={doorColor} strokeWidth={1.4} />
        </>
      )}
    </g>
  );
}
