/**
 * 소방 기호 — 밖에서 만나게 될 진짜 표지다. 모양을 바꾸지 않는다(설계서 v1.0 §6.2).
 *
 * 전부 벡터 자체 제작이며 이모지를 쓰지 않는다.
 * 좌표 단위는 도면과 같고, 각 기호는 원점(0,0)을 중심으로 그린다.
 * 쉬운 이름은 `content/blocks.json` 의 캡션이 함께 적어 준다.
 */
import React from 'react';

export const C_DANGER = '#c8102e';
export const C_SAFE = '#0e7c4f';

interface SymProps {
  /** 기호 한 변의 크기 */
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
