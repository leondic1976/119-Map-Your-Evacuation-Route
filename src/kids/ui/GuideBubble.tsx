'use client';

/**
 * 캐릭터 말풍선 — 캔버스 위에 떠오르는 덮개 (plan2-1.md §4.6).
 * 고정 패널이 아니다. 8초 뒤 저절로 사라지거나 아이가 닫는다.
 * [왜?] 를 누르면 학습 카드가 그 자리에서 펼쳐진다. 자유 입력은 없다 (FR-9.2).
 */
import React, { useEffect, useState } from 'react';
import { cardById, isVerified } from '../content';
import { toTts } from '../core/guide/runner';
import { useKids } from '../store/kidsStore';
import { Avatar, SPEAKER_NAME } from './Avatar';
import { CloseIcon } from './Onboarding';

const AUTO_HIDE_MS = 8000;

export default function GuideBubble() {
  const bubble = useKids((s) => s.bubble);
  const profile = useKids((s) => s.profile);
  const dismiss = useKids((s) => s.dismissBubble);
  const markCardSeen = useKids((s) => s.markCardSeen);
  const completeMission = useKids((s) => s.completeMission);
  const [openCard, setOpenCard] = useState<string | null>(null);

  useEffect(() => {
    setOpenCard(null);
  }, [bubble?.at]);

  /* 카드를 펼쳐 두면 사라지지 않는다 */
  useEffect(() => {
    if (!bubble || openCard) return;
    const t = setTimeout(() => dismiss(), AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [bubble, openCard, dismiss]);

  /* 읽어 주기 — 안 되면 조용히 넘어간다 (FR-9.5) */
  useEffect(() => {
    if (!bubble || !profile.ttsEnabled) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(toTts(bubble.text));
      u.lang = 'ko-KR';
      u.rate = 0.95;
      synth.speak(u);
    } catch {
      /* 음성 합성이 없는 기기 */
    }
  }, [bubble, profile.ttsEnabled]);

  if (!bubble) return null;
  const card = openCard ? cardById(openCard) : null;
  const easy = profile.gradeMode === 'easy';

  return (
    <div className={`k-bubble k-bubble-${bubble.speaker}`} role="status" aria-live="polite" data-coach="kids-bubble">
      <div className="k-bubble-avatar">
        <Avatar speaker={bubble.speaker} emotion={bubble.emotion} size={64} />
        <small>{SPEAKER_NAME[bubble.speaker]}</small>
      </div>
      <div className="k-bubble-body">
        <p className="k-bubble-text">
          {bubble.text}
          {bubble.unverified && (
            <span className="k-unverified" title="이 문장은 아직 소방청 1차 자료와 대조하지 않았다.">
              검수 대기
            </span>
          )}
        </p>
        {card && (
          <div className="k-card-open">
            <b>{card.title}</b>
            <p>{easy ? card.body.easy : card.body.normal}</p>
            {card.requiresGuardian && (
              <div className="k-mission">
                <span>어른께 여쭤보자.</span>
                <button type="button" className="k-link" onClick={() => completeMission(card.id, false)}>
                  나중에 할래요
                </button>
                <button type="button" className="k-link" onClick={() => completeMission(card.id, true)}>
                  알아냈어요
                </button>
              </div>
            )}
            {!isVerified(card.sourceIds) && <small className="k-unverified">검수 대기</small>}
          </div>
        )}
        <div className="k-bubble-actions">
          {bubble.cardId && !openCard && (
            <button
              type="button"
              className="k-tb sm"
              onClick={() => {
                setOpenCard(bubble.cardId!);
                markCardSeen(bubble.cardId!);
              }}
            >
              왜?
            </button>
          )}
          <button type="button" className="k-tb sm" onClick={dismiss} aria-label="닫기">
            <CloseIcon /> 알겠어
          </button>
        </div>
      </div>
    </div>
  );
}
