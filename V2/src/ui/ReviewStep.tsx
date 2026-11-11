/** 7. 돌아보기 — 잘한 점 · 고칠 점 · 3D 다시 보기 · 인쇄 */
import { lazy, Suspense, useMemo, useState } from 'react';
import { analyze } from '../core/grid';
import { buildReport, earnedStamps } from '../core/report';
import { FIX, PRAISE } from '../content/report';
import { STAMPS } from '../content/stamps';
import { isVerified } from '../content/sources';
import { host } from '../platform/host';
import { currentBand, enterStep, fillForDrill, planGaps, retryDrill, say, STEP_LABEL, useApp } from '../store/app';
import { IconCheck, IconCube, IconHelp, IconPencil, IconPlay, IconPrint, StampGlyph } from './art';
import { PlanView } from './PlanView';

const Replay3D = lazy(() => import('./replay3d/Replay3D'));

export function Unverified({ sourceIds }: { sourceIds: string[] }) {
  if (isVerified(sourceIds)) return null;
  return <small className="unverified">검수 대기</small>;
}

export function ReviewStep() {
  const plan = useApp((s) => s.plan);
  const look = useApp((s) => s.profile?.look ?? 'a');
  const drill = useApp((s) => s.drill);
  const layout = useMemo(() => analyze(plan), [plan]);
  const report = useMemo(() => (drill ? buildReport(drill, plan, currentBand()) : null), [drill, plan]);
  const stamps = useMemo(() => (drill ? earnedStamps(drill, currentBand()) : []), [drill]);
  const [replay, setReplay] = useState(false);
  const gaps = useMemo(() => planGaps(plan), [plan]);
  const empty = layout.cells.length === 0;

  return (
    <>
      <aside className="tools review-tools" aria-label="돌아보기 단추">
        {drill && (
          <button
            type="button"
            className="tool tall on"
            data-testid="open-replay"
            onClick={() => {
              setReplay(true);
              say('replay');
            }}
          >
            <IconCube size={30} /> 3D로 다시 보기
          </button>
        )}
        {!empty && (
          <>
            <button type="button" className="tool tall" data-testid="print" onClick={() => host.print()}>
              <IconPrint size={30} /> 지도 인쇄하기
            </button>
            <button type="button" className="tool tall" data-testid="retry" onClick={retryDrill}>
              <IconPlay size={28} /> {drill ? '다시 연습하기' : '연습하러 가기'}
            </button>
          </>
        )}
        <button type="button" className="tool tall" data-testid="edit-map" onClick={() => enterStep('draw')}>
          <IconPencil size={28} /> 지도 고치기
        </button>
      </aside>
      <section className="paper review-paper">
        <div className="review-map">
          <PlanView plan={plan} layout={layout} look={look} showRoute />
        </div>
        <div className="review-notes">
          {report ? (
            <>
              {stamps.length > 0 && (
                <>
                  <h3 className="note-head good">칭찬 도장</h3>
                  <ul className="stamp-row" data-testid="review-stamps">
                    {stamps.map((id) => (
                      <li key={id} className="stamp on" title={STAMPS[id].text}>
                        <span className="stamp-face"><StampGlyph id={id} /></span>
                        <span className="stamp-name">{STAMPS[id].label}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <h3 className="note-head good">잘한 점</h3>
              <ul className="note-list" data-testid="praises">
                {report.praises.map((p) => (
                  <li key={p}>
                    <IconCheck /> <span>{PRAISE[p].text}</span> <Unverified sourceIds={PRAISE[p].sourceIds} />
                  </li>
                ))}
              </ul>
              {report.fixes.length > 0 && (
                <>
                  <h3 className="note-head next">다음에 해 볼 것</h3>
                  <ul className="note-list" data-testid="fixes">
                    {report.fixes.map((f) => (
                      <li key={f}>
                        <span className="note-dot" aria-hidden="true" /> <span>{FIX[f].text}</span> <Unverified sourceIds={FIX[f].sourceIds} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : empty ? (
            <div className="review-done" data-testid="review-empty">
              <h3 className="note-head next">아직 지도가 없어</h3>
              <p className="note-text">집을 그리면 여기에서 지도를 볼 수 있어.</p>
              <button type="button" className="big-action" data-testid="go-draw" onClick={() => enterStep('draw')}>
                <IconPencil size={26} /> 집 그리러 가기
              </button>
            </div>
          ) : gaps.length > 0 ? (
            <div className="review-done" data-testid="review-gaps">
              <h3 className="note-head next">아직 빠진 곳이 있어</h3>
              <p className="note-text">눌러서 고치거나, 한 번에 채울 수 있어.</p>
              <div className="gap-list">
                {gaps.map((step) => (
                  <button type="button" key={step} className="tool wide" data-testid={`gap-${step}`} onClick={() => enterStep(step)}>{STEP_LABEL[step]}</button>
                ))}
              </div>
              <button type="button" className="big-action" data-testid="fill-gaps" onClick={() => { fillForDrill(); say('review-no-drill'); }}>
                <IconHelp /> 한 번에 채워 줘
              </button>
            </div>
          ) : (
            <>
              <div className="review-done" data-testid="review-complete">
                <span className="review-badge" aria-hidden="true"><IconCheck size={34} /></span>
                <h3 className="note-head good">지도가 완성됐어</h3>
                <p className="note-text">대피 연습을 해 보면 잘한 점을 볼 수 있어.</p>
                <button type="button" className="big-action" data-testid="go-drill" onClick={() => enterStep('drill')}>
                  <IconPlay size={26} /> 대피 연습 하러 가기
                </button>
              </div>
            </>
          )}
        </div>
      </section>
      {replay && drill && (
        <Suspense fallback={<div className="replay-loading" role="status">3D 그림을 준비하고 있어</div>}>
          <Replay3D plan={plan} drill={drill} look={look} onClose={() => setReplay(false)} />
        </Suspense>
      )}
    </>
  );
}
