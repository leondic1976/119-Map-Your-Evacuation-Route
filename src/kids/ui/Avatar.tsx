'use client';

/**
 * 캐릭터 자리표시 — 단색 벡터. 소방청 캐릭터로 바꿀 때 이 컴포넌트만 갈아 낀다 (CON-6).
 *
 * 게임 플레이어로도 쓴다 (plan2-1.md §4.5). 늘 정면이고, 좌우 이동은 반전만,
 * 낮은 자세는 납작하게 — 방향별 스프라이트를 요구하지 않는다.
 */
import React from 'react';
import type { Emotion, PlayerCharacter, Speaker } from '../types/guide';

export const SPEAKER_NAME: Record<Speaker, string> = { yeongi: '영이', ungi: '웅이', ilgu: '일구' };

/** 게임에서 내가 되는 캐릭터의 이름 (설계서 v1.2 §6.2) */
export const PLAYER_NAME: Record<PlayerCharacter, string> = { ...SPEAKER_NAME, firefighter: '소방관' };

export function Avatar({ speaker, emotion, size = 48 }: { speaker: Speaker; emotion: Emotion; size?: number }) {
  const mouth = (() => {
    switch (emotion) {
      case 'happy':
        return <path d="M-7 4 q7 8 14 0" fill="none" stroke="#2a3038" strokeWidth="2" strokeLinecap="round" />;
      case 'worried':
        return <path d="M-6 7 q6 -5 12 0" fill="none" stroke="#2a3038" strokeWidth="2" strokeLinecap="round" />;
      case 'alert':
        return <ellipse cy={6} rx={4} ry={5} fill="#2a3038" />;
      case 'thinking':
        return <path d="M-4 6 h8" fill="none" stroke="#2a3038" strokeWidth="2" strokeLinecap="round" />;
      default:
        return <path d="M-5 5 q5 4 10 0" fill="none" stroke="#2a3038" strokeWidth="2" strokeLinecap="round" />;
    }
  })();
  const brows =
    emotion === 'worried' || emotion === 'alert' ? (
      <g stroke="#2a3038" strokeWidth="2" strokeLinecap="round">
        <path d="M-12 -12 l6 3" />
        <path d="M12 -12 l-6 3" />
      </g>
    ) : null;

  if (speaker === 'ilgu') {
    return (
      <svg width={size} height={size} viewBox="-30 -30 60 60" aria-hidden="true" className="k-avatar">
        <ellipse cx={-18} cy={-8} rx={7} ry={13} fill="#8a5a3c" />
        <ellipse cx={18} cy={-8} rx={7} ry={13} fill="#8a5a3c" />
        <circle r={22} fill="#c48a5f" />
        <ellipse cy={6} rx={12} ry={9} fill="#f1d8c2" />
        <circle cx={-8} cy={-5} r={2.6} fill="#2a3038" />
        <circle cx={8} cy={-5} r={2.6} fill="#2a3038" />
        <ellipse cy={3} rx={4} ry={3} fill="#2a3038" />
        <g transform="translate(0 6)">{mouth}</g>
        <path d="M-20 16 q20 10 40 0 v6 q-20 8 -40 0z" fill="#c8102e" />
        {brows}
      </svg>
    );
  }
  const helmet = speaker === 'yeongi' ? '#c8102e' : '#0f3d68';
  const hair = speaker === 'yeongi' ? '#5b3a1e' : '#2a2a2a';
  return (
    <svg width={size} height={size} viewBox="-30 -30 60 60" aria-hidden="true" className="k-avatar">
      <circle r={22} fill="#ffe0b2" />
      <path d="M-22 -4 a22 22 0 0 1 44 0 v4 h-44z" fill={hair} />
      <path d="M-24 -6 a24 16 0 0 1 48 0 h-48z" fill={helmet} />
      <rect x={-26} y={-8} width={52} height={5} rx={2} fill={helmet} />
      <circle cx={-8} cy={-1} r={2.6} fill="#2a3038" />
      <circle cx={8} cy={-1} r={2.6} fill="#2a3038" />
      <g transform="translate(0 4)">{mouth}</g>
      {speaker === 'yeongi' && (
        <>
          <circle cx={-14} cy={6} r={3} fill="#f7a8b8" opacity={0.7} />
          <circle cx={14} cy={6} r={3} fill="#f7a8b8" opacity={0.7} />
        </>
      )}
      {brows}
    </svg>
  );
}

/**
 * 게임 플레이어 스프라이트 — SVG 도면 안에서 쓴다.
 * 정면 고정 + 좌우 반전 + 웅크림(납작) 두 자세 (스프라이트 2장 이내, §4.5).
 */
export function PlayerSprite({
  speaker,
  posture,
  facing,
  size,
}: {
  speaker: PlayerCharacter;
  posture: 'stand' | 'crouch';
  facing: 'left' | 'right';
  size: number;
}) {
  const sx = facing === 'left' ? -1 : 1;
  const sy = posture === 'crouch' ? 0.62 : 1;
  const body = speaker === 'ilgu' ? '#c48a5f' : '#ffe0b2';
  const hat = speaker === 'yeongi' ? '#c8102e' : speaker === 'ungi' ? '#0f3d68' : speaker === 'firefighter' ? '#f0b429' : '#8a5a3c';
  const r = size * 0.36;
  return (
    <g transform={`translate(${size / 2} ${size / 2}) scale(${sx} ${sy})`} className="k-player">
      <ellipse cy={r * 0.9} rx={r * 0.9} ry={r * 0.35} fill="#000" opacity={0.18} />
      <circle r={r} fill={body} stroke="#2a3038" strokeWidth={2} />
      {speaker === 'firefighter' ? (
        <>
          {/* 소방 헬멧 — 챙이 뒤로 길다 */}
          <path d={`M${-r * 1.1} ${-r * 0.18} a${r * 1.1} ${r * 0.8} 0 0 1 ${r * 2.2} 0z`} fill={hat} stroke="#2a3038" strokeWidth={1.4} />
          <path d={`M${-r * 1.25} ${-r * 0.18} H${r * 1.25}`} stroke="#2a3038" strokeWidth={2.2} strokeLinecap="round" />
          <path d={`M0 ${-r * 0.95} v${r * 0.6}`} stroke="#2a3038" strokeWidth={1.6} />
        </>
      ) : speaker === 'ilgu' ? (
        <>
          <ellipse cx={-r * 0.8} cy={-r * 0.3} rx={r * 0.3} ry={r * 0.55} fill={hat} />
          <ellipse cx={r * 0.8} cy={-r * 0.3} rx={r * 0.3} ry={r * 0.55} fill={hat} />
          <ellipse cy={r * 0.15} rx={r * 0.18} ry={r * 0.13} fill="#2a3038" />
        </>
      ) : (
        <path d={`M${-r * 1.05} ${-r * 0.25} a${r * 1.05} ${r * 0.7} 0 0 1 ${r * 2.1} 0z`} fill={hat} />
      )}
      <circle cx={-r * 0.35} cy={-r * 0.15} r={r * 0.11} fill="#2a3038" />
      <circle cx={r * 0.35} cy={-r * 0.15} r={r * 0.11} fill="#2a3038" />
      <path d={`M${-r * 0.25} ${r * 0.35} q${r * 0.25} ${r * 0.25} ${r * 0.5} 0`} fill="none" stroke="#2a3038" strokeWidth={1.6} strokeLinecap="round" />
    </g>
  );
}
