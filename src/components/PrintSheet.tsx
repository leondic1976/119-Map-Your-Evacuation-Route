'use client';

/**
 * A4 가로 1매 피난안내도.
 * 화면 미리보기와 인쇄가 같은 마크업을 쓴다(인쇄용 CSS 는 globals.css 참조).
 */
import React from 'react';
import PlanView, { legendItems } from './PlanView';
import { LegendMark } from './Symbols';
import { DEFAULT_LAYERS } from '../lib/store';
import { Plan, planArea, planBounds } from '../lib/types';
import { WallModel } from '../lib/walls';
import { PROCEDURE, eraFor } from '../lib/risk';
import { routeMetric } from '../lib/routing';

interface Props {
  plan: Plan;
  model: WallModel;
  /** 도면에 표시할 발화 지점(선택) */
  showDims?: boolean;
}

export const PRINT_FIGURE_ID = 'print-figure';

export default function PrintSheet({ plan, model, showDims }: Props) {
  const b = planBounds(plan);
  // 오른쪽은 방위표, 아래쪽은 축척 막대 자리를 남긴다
  const padL = 46;
  const padT = 46;
  const padR = 170;
  const padB = 128;
  const vb = `${b.x - padL} ${b.y - padT} ${b.w + padL + padR} ${b.h + padT + padB}`;
  const era = eraFor(plan.meta.approvalYear);
  const routeNo: Record<string, number> = {};
  plan.routes.forEach((r, i) => {
    routeNo[r.id] = i + 1;
  });
  const legend = legendItems(plan);
  const today = plan.meta.madeOn || new Date().toISOString().slice(0, 10);

  const layers = {
    ...DEFAULT_LAYERS,
    dims: Boolean(showDims),
    smoke: false,
    grid: false,
    trace: false,
    background: false,
  };

  return (
    <div className="print-sheet">
      <div className="sheet">
        <header className="sheet-head">
          <h1>{plan.meta.title || '우리 집 피난안내도'}</h1>
          <div className="who">
            {plan.meta.complex && `${plan.meta.complex} `}
            {plan.meta.dong && `${plan.meta.dong}동 `}
            {plan.meta.ho && `${plan.meta.ho}호`}
            {plan.meta.floor ? ` (${plan.meta.floor}층)` : ''}
          </div>
          <div className="meta">
            전용 {plan.meta.area}㎡ · 작도 {planArea(plan).toFixed(1)}㎡ · 사용승인 {plan.meta.approvalYear}년
            <br />
            작성 {today} · 우리 아파트 피난로 그리기
          </div>
        </header>

        <div className="sheet-figure">
          <svg id={PRINT_FIGURE_ID} viewBox={vb} preserveAspectRatio="xMidYMid meet" role="img" aria-label="세대 평면과 피난동선">
            <rect x={b.x - padL} y={b.y - padT} width={b.w + padL + padR} height={b.h + padT + padB} fill="#fff" />
            <PlanView plan={plan} model={model} layers={layers} routeNo={routeNo} showNorth showScaleBar print />
          </svg>
        </div>

        <aside className="sheet-side">
          <div className="sheet-box">
            <h4>피난동선</h4>
            {plan.routes.length === 0 ? (
              <div style={{ fontSize: '6.8pt', color: '#666' }}>동선이 표기되지 않았다.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '9%' }}>번호</th>
                    <th>경로</th>
                    <th className="n">거리</th>
                    <th className="n">시간</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.routes.map((r) => {
                    const m = routeMetric(r, plan.meta.walker);
                    return (
                      <tr key={r.id}>
                        <td style={{ color: r.kind === 'primary' ? '#0e7c4f' : '#0f3d68', fontWeight: 700 }}>
                          {routeNo[r.id]}
                        </td>
                        <td>{r.label}</td>
                        <td className="n">{m.length.toFixed(1)}m</td>
                        <td className="n">{Math.round(m.walkTime)}초</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="sheet-box">
            <h4>범례</h4>
            <div className="sheet-legend">
              {legend.map((l) => (
                <div key={l.kind}>
                  <LegendMark kind={l.kind as never} />
                  <span>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="sheet-box">
            <h4>우리 집 피난시설</h4>
            <div style={{ fontSize: '7pt' }}>
              <b>
                {era.range} · {era.title}
              </b>
              <div style={{ marginTop: '0.6mm' }}>{era.caution}</div>
            </div>
          </div>

          <div className="sheet-box" style={{ flex: 1 }}>
            <h4>집결지 · 연락</h4>
            <div style={{ fontSize: '7.6pt', fontWeight: 700 }}>{plan.meta.assembly || '집결지 미지정'}</div>
            {plan.meta.contact && (
              <div style={{ fontSize: '6.8pt', marginTop: '0.6mm', whiteSpace: 'pre-wrap' }}>{plan.meta.contact}</div>
            )}
            <div style={{ fontSize: '6.8pt', marginTop: '1mm', color: '#444' }}>
              재실 {plan.meta.occupants.adult}명 · 어린이 {plan.meta.occupants.child}명 · 고령자{' '}
              {plan.meta.occupants.senior}명
            </div>
          </div>
        </aside>

        <footer className="sheet-foot">
          <div style={{ flex: 1 }}>
            <div className="sheet-proc">
              {PROCEDURE.slice(0, 8).map((p) => (
                <div className="p" key={p.no}>
                  <b>
                    {p.no}. {p.title}
                  </b>
                  {p.body}
                </div>
              ))}
            </div>
          </div>
          <div className="call">
            <b>119 신고</b> — 단지명·동·호수·층 → 불이 난 곳과 연기 정도 → 갇힌 위치와 창문 방향 → 대피 못 한
            사람. 먼저 끊지 않는다.
            <div style={{ marginTop: '0.8mm', color: '#444' }}>
              본 안내도의 확산 해석은 교육용 근사 모델이며 성능위주설계 해석을 대체하지 않는다. 또한 법정
              피난안내도를 대체하지 않는다.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
