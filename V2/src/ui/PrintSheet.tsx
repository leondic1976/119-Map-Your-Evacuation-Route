/** 인쇄 한 장 — 화면에는 보이지 않고 인쇄할 때만 나온다 */
import { useMemo } from 'react';
import { analyze } from '../core/grid';
import { NO_EXTINGUISHER, PROMISES } from '../content/report';
import { STAMPS } from '../content/stamps';
import { earnedStamps } from '../core/report';
import { currentBand, useApp } from '../store/app';
import { PlanView } from './PlanView';
import { Unverified } from './ReviewStep';
import { StampGlyph } from './art';

export function PrintSheet() {
  const plan = useApp((s) => s.plan);
  const profile = useApp((s) => s.profile);
  const layout = useMemo(() => analyze(plan), [plan]);
  const drill = useApp((s) => s.drill);
  const stamps = drill ? earnedStamps(drill, currentBand()) : [];
  return (
    <div className="print-sheet" aria-hidden="true">
      <h1>{profile?.name ? `${profile.name}의 우리집 대피지도` : '우리집 대피지도'}</h1>
      <div className="print-map">
        <PlanView plan={plan} layout={layout} look={profile?.look ?? 'a'} showRoute showUnknown={false} />
      </div>
      <div className="print-legend">
        <span><i className="sw room" /> 방</span>
        <span><i className="sw pass" /> 지나가는 곳</span>
        <span><i className="sw route" /> 나가는 길</span>
        {plan.route2.length > 0 && <span><i className="sw route2" /> 둘째 길</span>}
      </div>
      {stamps.length > 0 && (
        <>
          <h2>대피 연습에서 받은 칭찬 도장</h2>
          <ul className="stamp-row" data-testid="print-stamps">
            {stamps.map((id) => (
              <li key={id} className="stamp on">
                <span className="stamp-face"><StampGlyph id={id} /></span>
                <span className="stamp-name">{STAMPS[id].label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <h2>우리 집 약속</h2>
      <ol>
        {PROMISES.map((p) => (
          <li key={p.text}>
            {p.text} <Unverified sourceIds={p.sourceIds} />
          </li>
        ))}
      </ol>
      {plan.noExtinguisher && (
        <p className="print-task" data-testid="print-no-extinguisher">
          어른과 할 일 — {NO_EXTINGUISHER.print} <Unverified sourceIds={NO_EXTINGUISHER.sourceIds} />
        </p>
      )}
      <p className="print-foot">불이 나면 119 · 소방청 캐릭터 영이·일구·웅이(공공누리 제1유형)</p>
    </div>
  );
}
