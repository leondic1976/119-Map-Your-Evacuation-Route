/** 7. 돌아보기 — 잘한 점 · 고칠 점 · 3D 다시 보기 · 인쇄 · PDF 로 저장 */
import { lazy, Suspense, useMemo, useState } from 'react';
import { escapeAids } from '../core/aids';
import { hasOtherRoute } from '../core/auto';
import { analyze } from '../core/grid';
import { buildReport, earnedStamps } from '../core/report';
import { AID_NOTE, AID_TEXT } from '../content/aids';
import { FIX, NO_EXTINGUISHER, PRAISE } from '../content/report';
import { STAMPS } from '../content/stamps';
import { isVerified } from '../content/sources';
import { host } from '../platform/host';
import { currentBand, enterStep, fillForDrill, planGaps, retryDrill, say, STEP_LABEL, useApp } from '../store/app';
import { IconCheck, IconCube, IconHelp, IconOx, IconPdf, IconPencil, IconPlay, IconPrint, StampGlyph } from './art';
import { PlanView } from './PlanView';
import './quiz.css';

const Replay3D = lazy(() => import('./replay3d/Replay3D'));
/** OX 문제는 누를 때 받는다 — 문제 글이 첫 묶음을 키우지 않는다 */
const QuizRound = lazy(() => import('./QuizRound'));

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
  const name = useApp((s) => s.profile?.name ?? '');
  const [saving, setSaving] = useState(false);
  /** 인쇄 한 장을 PDF 파일로 내려 준다(대장 #190). 만들지 못하는 기기에서는 인쇄 창을 연다 — 거기서도 PDF 로 저장할 수 있다 */
  const savePdf = (): void => {
    const sheet = document.querySelector<HTMLElement>('.print-sheet');
    if (saving || !sheet) return;
    const title = name ? `${name}의 우리집 대피지도` : '우리집 대피지도';
    setSaving(true);
    // PDF 를 만드는 코드는 누를 때 받는다 — 첫 묶음을 키우지 않는다
    import('./sheet')
      .then(async (m) => host.saveFile(m.sheetFileName(title), await m.sheetPdf(sheet, { title, stamps, secondRoute: plan.route2.length > 0, noExtinguisher: Boolean(plan.noExtinguisher) })))
      .catch(() => host.print())
      .finally(() => setSaving(false));
  };
  const gaps = useMemo(() => planGaps(plan), [plan]);
  const empty = layout.cells.length === 0;
  // 5~6학년 — 연습 뒤에 OX 로 묻고, 지도에 그린 피난 시설을 알려 준다(대장 #188)
  const high = currentBand() === 'high';
  const aids = useMemo(() => escapeAids(plan, layout), [plan, layout]);
  const needSecond = high && plan.route2.length === 0 && hasOtherRoute(plan);
  const [quiz, setQuiz] = useState<number | null>(null);
  const [rounds, setRounds] = useState(0);

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
            <button type="button" className="tool tall" data-testid="save-pdf" aria-busy={saving} onClick={savePdf}>
              <IconPdf size={30} /> PDF로 저장하기
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
          {report && quiz !== null ? (
            <Suspense fallback={null}>
              <QuizRound round={quiz} fixes={report.fixes} aids={aids} needSecond={needSecond} onClose={() => setQuiz(null)} onAgain={() => { setQuiz(rounds); setRounds((n) => n + 1); }} />
            </Suspense>
          ) : report ? (
            <>
              {high && (
                <button type="button" className="big-action review-quiz" data-testid="review-quiz" onClick={() => { setQuiz(rounds); setRounds((n) => n + 1); }}>
                  <IconOx size={26} /> OX 문제로 확인하기
                </button>
              )}
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
              {high && (
                <>
                  <h3 className="note-head next">{AID_NOTE.head}</h3>
                  {aids.length > 0 ? (
                    <ul className="note-list" data-testid="review-aids">
                      {aids.map((id) => (
                        <li key={id}>
                          <IconCheck /> <span><b>{AID_TEXT[id].label}</b> — {AID_TEXT[id].tell}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="note-text" data-testid="review-no-aids">{AID_NOTE.none} <Unverified sourceIds={AID_NOTE.sourceIds} /></p>
                  )}
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
          {plan.noExtinguisher && !empty && (
            <p className="note-text home-task" data-testid="review-no-extinguisher">
              {NO_EXTINGUISHER.tell} <Unverified sourceIds={NO_EXTINGUISHER.sourceIds} />
            </p>
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
