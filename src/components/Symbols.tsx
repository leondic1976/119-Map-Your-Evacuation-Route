/**
 * 도면 기호 — 전부 벡터 자체 제작(이모지 미사용).
 * 좌표 단위는 도면과 같은 cm 이며, 각 기호는 원점(0,0)을 중심으로 그린다.
 */
import React from 'react';
import { FacilityType } from '../lib/types';

export const C_DANGER = '#c8102e';
export const C_SAFE = '#0e7c4f';
export const C_ACCENT = '#0f3d68';
export const C_INK = '#2a3038';

interface SymProps {
  /** 기호 한 변의 크기(cm) */
  size?: number;
}

/** 소화기 — 적색 바탕에 흰 소화기 실루엣 */
export function SymExtinguisher({ size = 44 }: SymProps) {
  const s = size / 44;
  return (
    <g transform={`scale(${s})`}>
      <rect x={-22} y={-22} width={44} height={44} rx={5} fill={C_DANGER} />
      <g fill="#fff">
        <rect x={-3} y={-17} width={6} height={4} rx={1} />
        <path d="M-2 -13h4v2h-4z" />
        <path d="M2 -12h7a1.5 1.5 0 0 1 0 3H4z" />
        <path d="M-8 -9h16a4 4 0 0 1 4 4v18a3 3 0 0 1-3 3h-18a3 3 0 0 1-3-3V-5a4 4 0 0 1 4-4z" />
      </g>
      <rect x={-6} y={-2} width={12} height={8} rx={1} fill={C_DANGER} />
    </g>
  );
}

/** 연기감지기 — 원 안 파형 */
export function SymDetector({ size = 38 }: SymProps) {
  const s = size / 38;
  return (
    <g transform={`scale(${s})`}>
      <circle r={18} fill="#fff" stroke={C_ACCENT} strokeWidth={3} />
      <circle r={5} fill={C_ACCENT} />
      <path
        d="M-12 -6c3 -3 6 -3 9 0M-12 7c3 3 6 3 9 0M12 -6c-3 -3 -6 -3 -9 0M12 7c-3 3 -6 3 -9 0"
        fill="none"
        stroke={C_ACCENT}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </g>
  );
}

/** 피난 방향 인물 (피난구 유도등 계열 기호에 공통으로 쓰는 실루엣) */
function RunningFigure({ color = '#fff' }: { color?: string }) {
  return (
    <g fill={color}>
      <circle cx={-2} cy={-11} r={3.4} />
      <path d="M-4.6 -7.4l5.4 1.6 3.6 4.4-2.6 2-2.8-3.2-1 3.6 4 4.6.8 7.2-3.2.4-.8-6-5.2-5.2 1-8.4-3.6 2.2-1.4 4.6-3-1 1.8-6z" />
      <path d="M-8.4 6.2l-4.6 5.6 2.6 2 5-5.4z" />
    </g>
  );
}

/** 대피공간 — 녹색 바탕, 문과 인물 */
export function SymRefuge({ size = 46 }: SymProps) {
  const s = size / 46;
  return (
    <g transform={`scale(${s})`}>
      <rect x={-23} y={-23} width={46} height={46} rx={4} fill={C_SAFE} />
      <rect x={7} y={-15} width={11} height={30} fill="none" stroke="#fff" strokeWidth={2.6} />
      <circle cx={9.6} cy={0} r={1.4} fill="#fff" />
      <g transform="translate(-5 0) scale(1.05)">
        <RunningFigure />
      </g>
    </g>
  );
}

/** 하향식 피난구 — 녹색 바탕, 아래로 내리는 사다리 */
export function SymDownLadder({ size = 46 }: SymProps) {
  const s = size / 46;
  return (
    <g transform={`scale(${s})`}>
      <rect x={-23} y={-23} width={46} height={46} rx={4} fill={C_SAFE} />
      <g stroke="#fff" strokeWidth={2.6} strokeLinecap="round" fill="none">
        <path d="M-9 -14v24M9 -14v24" />
        <path d="M-9 -8h18M-9 -1h18M-9 6h18" />
        <path d="M0 12v7M-5 15l5 5 5-5" />
      </g>
    </g>
  );
}

/** 경량칸막이 — 파괴 가능한 세대 경계벽. 길이 방향 기호 */
export function SymPartition({ size = 90 }: SymProps) {
  const len = size;
  return (
    <g>
      <rect x={-len / 2} y={-7} width={len} height={14} fill="#fff" stroke={C_SAFE} strokeWidth={2.4} />
      <path
        d={`M${-len / 2 + 4} 5 L${-len / 6} -5 L${len / 6} 5 L${len / 2 - 4} -5`}
        fill="none"
        stroke={C_DANGER}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** 집결지 — 네 방향에서 모이는 표시 */
export function SymAssembly({ size = 46 }: SymProps) {
  const s = size / 46;
  return (
    <g transform={`scale(${s})`}>
      <rect x={-23} y={-23} width={46} height={46} rx={4} fill={C_SAFE} />
      <g stroke="#fff" strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M-17 -17l7 7M-10 -17h-7v7" />
        <path d="M17 -17l-7 7M10 -17h7v7" />
        <path d="M-17 17l7-7M-10 17h-7v-7" />
        <path d="M17 17l-7-7M10 17h7v-7" />
      </g>
      <circle r={5.5} fill="#fff" />
    </g>
  );
}

/** 피난 종점(현관문) 표시 */
export function SymExit({ size = 44 }: SymProps) {
  const s = size / 44;
  return (
    <g transform={`scale(${s})`}>
      <rect x={-22} y={-14} width={44} height={28} rx={3} fill={C_SAFE} />
      <g transform="translate(-8 0) scale(0.9)">
        <RunningFigure />
      </g>
      <path d="M4 -6h10v12H4z" fill="none" stroke="#fff" strokeWidth={2.2} />
      <path d="M16 0h6M18.5 -3l3.5 3-3.5 3" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/** 발화점 */
export function SymIgnition({ size = 50 }: SymProps) {
  const s = size / 50;
  return (
    <g transform={`scale(${s})`}>
      <circle r={24} fill="#fff" fillOpacity={0.85} stroke={C_DANGER} strokeWidth={2} strokeDasharray="5 4" />
      <path
        d="M0 -18c0 0 11 8 11 18a11 11 0 0 1-22 0c0-4 2-7 2-7s1.3 3.3 3.7 3.3C-1.9 -3.7 -2.4 -10.5 0 -18z"
        fill={C_DANGER}
      />
      <path d="M0 -6c0 0 4.5 3.6 4.5 8A4.5 4.5 0 0 1 0 6.5 4.5 4.5 0 0 1-4.5 2c0-4.4 4.5-8 4.5-8z" fill="#ffd166" />
    </g>
  );
}

export function FacilitySymbol({ type, size }: { type: FacilityType; size?: number }) {
  switch (type) {
    case 'extinguisher':
      return <SymExtinguisher size={size} />;
    case 'detector':
      return <SymDetector size={size} />;
    case 'refuge':
      return <SymRefuge size={size} />;
    case 'downladder':
      return <SymDownLadder size={size} />;
    case 'partition':
      return <SymPartition size={size} />;
    case 'assembly':
      return <SymAssembly size={size} />;
    case 'exit':
      return <SymExit size={size} />;
    default:
      return null;
  }
}

/** 방위표 — 북쪽 */
export function NorthArrow({ size = 90 }: SymProps) {
  const s = size / 90;
  return (
    <g transform={`scale(${s})`}>
      <circle r={34} fill="#fff" fillOpacity={0.9} stroke={C_INK} strokeWidth={1.6} />
      <path d="M0 -28L9 6 0 0 -9 6z" fill={C_INK} />
      <path d="M0 -28L9 6 0 0z" fill="#fff" stroke={C_INK} strokeWidth={1.2} />
      <text
        x={0}
        y={22}
        textAnchor="middle"
        fontSize={16}
        fontWeight={700}
        fill={C_INK}
        style={{ fontFamily: 'inherit' }}
      >
        N
      </text>
    </g>
  );
}

/** 축척 막대 — 도면 좌표계(cm)에서 1m 눈금 */
export function ScaleBar({ meters = 3, unit = 100 }: { meters?: number; unit?: number }) {
  const w = meters * unit;
  return (
    <g>
      <rect x={0} y={-6} width={w} height={7} fill="#fff" stroke={C_INK} strokeWidth={1.2} />
      {Array.from({ length: meters }).map((_, i) => (
        <rect
          key={i}
          x={i * unit}
          y={-6}
          width={unit}
          height={7}
          fill={i % 2 === 0 ? C_INK : '#fff'}
          stroke={C_INK}
          strokeWidth={1.2}
        />
      ))}
      <text x={0} y={16} fontSize={16} fill={C_INK} textAnchor="middle" style={{ fontFamily: 'inherit' }}>
        0
      </text>
      <text x={w} y={16} fontSize={16} fill={C_INK} textAnchor="middle" style={{ fontFamily: 'inherit' }}>
        {meters}m
      </text>
    </g>
  );
}

/** 범례용 축소 기호 (24×24 상자 안) */
export function LegendMark({ kind }: { kind: FacilityType | 'primary' | 'alt' | 'ignition' }) {
  const box = 18;
  if (kind === 'primary' || kind === 'alt') {
    const color = kind === 'primary' ? C_SAFE : C_ACCENT;
    return (
      <svg width={box} height={box} viewBox="-24 -24 48 48" aria-hidden="true">
        <path
          d="M-20 10H0V-10h16"
          fill="none"
          stroke={color}
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={kind === 'alt' ? '14 9' : undefined}
        />
        <path d="M10 -18l10 8-10 8z" fill={color} />
      </svg>
    );
  }
  if (kind === 'ignition') {
    return (
      <svg width={box} height={box} viewBox="-28 -28 56 56" aria-hidden="true">
        <SymIgnition size={50} />
      </svg>
    );
  }
  return (
    <svg width={box} height={box} viewBox="-26 -26 52 52" aria-hidden="true">
      <FacilitySymbol type={kind} size={kind === 'partition' ? 46 : 44} />
    </svg>
  );
}
