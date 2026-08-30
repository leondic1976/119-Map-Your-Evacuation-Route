'use client';

/**
 * 결과 리포트 — docs/DESIGN-v1.1-changes.md §5.4.
 *
 *   [결과 배너] → [잘한 점] → [고칠 점 (최대 3)] → [다시 해보기 · 지도 고치기 · 뽑기]
 *   잘한 점이 반드시 먼저, 반드시 하나 이상 (FR-10.3 · FR-10.5).
 *   점수·등급·순위는 없다 (FR-10.10).
 */
import React, { useState } from 'react';
import { cardById, presetById } from '../content';
import { useKids } from '../store/kidsStore';
import { Avatar } from './Avatar';
import Replay3D from './replay3d/Replay3D';

interface Props {
  onPrint: () => void;
}

export default function ReportView({ onPrint }: Props) {
  const report = useKids((s) => s.report);
  const profile = useKids((s) => s.profile);
  const progress = useKids((s) => s.progress);
  const replay = useKids((s) => s.replay);
  const editFromReport = useKids((s) => s.editFromReport);
  const markCardSeen = useKids((s) => s.markCardSeen);
  const [open, setOpen] = useState<string | null>(null);
  const [show3d, setShow3d] = useState(false);
  const plan = useKids((s) => s.plan);
  const game = useKids((s) => s.game);
  const hazardId = useKids((s) => s.hazardId);
  if (!report) return null;
  const frames = game?.frames ?? [];
  const tickSeconds = presetById(hazardId)?.tickSeconds ?? 1;
  const easy = profile.gradeMode === 'easy';
  const master = progress.successes >= 3 || progress.earnedGoodIds.length >= 5;
  const why = (id: string, cardId?: string) => {
    if (!cardId) return null;
    const isOpen = open === id;
    return (
      <button
        type="button"
        className="k-link"
        aria-expanded={isOpen}
        onClick={() => {
          setOpen(isOpen ? null : id);
          if (!isOpen) markCardSeen(cardId);
        }}
      >
        {isOpen ? '접기' : '왜?'}
      </button>
    );
  };
  const cardBody = (id: string, cardId?: string) => {
    if (open !== id || !cardId) return null;
    const c = cardById(cardId);
    if (!c) return null;
    return (
      <div className="k-card-open">
        <b>{c.title}</b>
        <p>{easy ? c.body.easy : c.body.normal}</p>
        {c.requiresGuardian && <small>어른께 여쭤보자.</small>}
      </div>
    );
  };

  return (
    <section className={`k-report-view ${report.outcome}`} aria-label="결과" data-coach="kids-report">
      <header className="k-report-banner">
        <Avatar speaker="ilgu" emotion={report.outcome === 'success' ? 'happy' : 'normal'} size={64} />
        <div>
          <h2>{report.outcome === 'success' ? (easy ? '무사히 나왔어!' : '무사히 대피했습니다') : easy ? '괜찮아, 다시 해 보자!' : '이번에는 어려웠습니다. 다시 해 봅시다.'}</h2>
          <small>
            {report.attemptNo}번째 연습 · {report.playLog.elapsedTicks}틱
            {report.playLog.failReason === 'quit' ? ' · 중간에 그만둠' : ''}
            {master && <span className="k-master"> 우리집 대피 박사</span>}
          </small>
        </div>
      </header>

      <div className="k-report-cols">
        <div className="k-report-col good">
          <h3>{easy ? '잘한 점' : '잘한 점'}</h3>
          <ul>
            {report.good.map((g) => (
              <li key={g.id} data-item={g.id}>
                <span>{easy ? g.headline.easy : g.headline.normal}</span>
                {g.unverified && <span className="k-unverified">검수 대기</span>}
                {why(g.id, g.cardId)}
                {cardBody(g.id, g.cardId)}
              </li>
            ))}
          </ul>
        </div>
        <div className="k-report-col fix">
          <h3>{easy ? '이렇게 하면 더 좋아' : '고칠 점'}</h3>
          {report.fix.length === 0 ? (
            <p className="k-note">{easy ? '고칠 곳이 안 보여. 너는 이미 준비된 사람이야.' : '고칠 점이 없습니다.'}</p>
          ) : (
            <ul>
              {report.fix.map((f) => (
                <li key={f.id} data-item={f.id}>
                  <span>{easy ? f.headline.easy : f.headline.normal}</span>
                  {f.unverified && <span className="k-unverified">검수 대기</span>}
                  {why(f.id, f.cardId)}
                  {cardBody(f.id, f.cardId)}
                </li>
              ))}
            </ul>
          )}
          {report.hiddenFixCount > 0 && <p className="k-note">{easy ? '다시 하면 또 알려줄게.' : `그 밖에 ${report.hiddenFixCount}건은 다음에 알려 줍니다.`}</p>}
        </div>
      </div>

      <footer className="k-report-actions">
        <button type="button" className="k-big" onClick={() => replay(false)} data-coach="kids-replay">
          다시 해보기
        </button>
        <button type="button" className="k-big" onClick={() => editFromReport(report.fix.some((f) => f.action?.type === 'editRoute') && !report.fix.some((f) => f.action?.type === 'editPlan') ? 'route' : 'plan')} data-coach="kids-edit-plan">
          지도 고치기
        </button>
        {frames.length > 1 && (
          <button type="button" className="k-big" onClick={() => setShow3d(true)} data-coach="kids-replay3d-open">
            {easy ? '3D 로 다시 보기' : '3D 리플레이'}
          </button>
        )}
        <button type="button" className="k-big" onClick={onPrint}>
          {easy ? '뽑기' : '인쇄'}
        </button>
      </footer>

      {show3d && frames.length > 1 && (
        <Replay3D
          plan={plan}
          frames={frames}
          character={profile.playerCharacter}
          tickSeconds={tickSeconds}
          outcome={report.outcome === 'success' ? 'success' : 'failed'}
          bestTicks={progress.bestTicks}
          onClose={() => setShow3d(false)}
        />
      )}
    </section>
  );
}
