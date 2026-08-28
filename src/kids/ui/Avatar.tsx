'use client';

/**
 * 캐릭터 그림.
 *
 *   Avatar        말하는 캐릭터(영이·웅이·일구) — 소방청 공식 캐릭터 그림
 *   PlayerSprite  게임에서 내가 되는 캐릭터 — 어린이 10종(KidToken)
 *
 * 공식 캐릭터는 공공누리 제1유형으로 공개된 파일을 화면 크기로 줄여 담았다
 * (`content/artwork.ts`). 자세는 감정에 맞춰 고른다.
 */
import React from 'react';
import type { Emotion, PlayerCharacter, Speaker } from '../types/guide';
import { KIDS, KidToken, kidOf } from './KidCharacters';
import { SPEAKER_ART } from '../content/artwork';

export const SPEAKER_NAME: Record<Speaker, string> = { yeongi: '영이', ungi: '웅이', ilgu: '일구' };

/** 게임에서 내가 되는 캐릭터의 이름 (설계서 v1.2 §6.2 개정) */
export const PLAYER_NAME: Record<string, string> = Object.fromEntries(KIDS.map((k) => [k.id, k.name]));

/** 그 캐릭터의 대표 색 — 3D 리플레이의 옷 색으로도 쓴다 */
export function playerTone(id: string): string {
  return kidOf(id).top;
}

export function Avatar({ speaker, emotion, size = 48 }: { speaker: Speaker; emotion: Emotion; size?: number }) {
  const set = SPEAKER_ART[speaker];
  const src = set?.[emotion] ?? set?.normal;
  if (!src) return null;
  return (
    <img
      className="k-avatar"
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      style={{ objectFit: 'contain', display: 'block' }}
    />
  );
}

/**
 * 게임 말 — 어린이 10종을 그리는 KidToken 이 맡는다 (설계서 v1.2 §6.2 개정).
 * 늘 정면이고, 좌우 이동은 반전만, 낮은 자세는 납작하게 그린다.
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
  return <KidToken id={speaker} size={size} posture={posture} facing={facing} />;
}
