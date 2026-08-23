'use client';

/** 08 자가 진단 — 도면 기준 자동 점검 · 위험요소 자료실 · 행동 절차 */
import React, { useMemo, useState } from 'react';
import { useApp } from '../useStore';
import { Grid } from '../../lib/grid';
import { CALL_119_SCRIPT, HAZARDS, LAWS, PROCEDURE, diagnose } from '../../lib/risk';
import { Callout, Group, Metric } from './ui';
import { IconCheck, IconWarn } from '../Icons';

interface Props {
  grid: Grid;
}

export default function Step8Check({ grid }: Props) {
  const { plan } = useApp();
  const [tab, setTab] = useState<'check' | 'hazard' | 'action'>('check');
  const d = useMemo(() => diagnose(plan, grid), [plan, grid]);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="panel">
      <div className="seg" style={{ marginBottom: 12 }}>
        <button type="button" aria-pressed={tab === 'check'} onClick={() => setTab('check')}>
          자동 점검
        </button>
        <button type="button" aria-pressed={tab === 'hazard'} onClick={() => setTab('hazard')}>
          위험요소
        </button>
        <button type="button" aria-pressed={tab === 'action'} onClick={() => setTab('action')}>
          행동 절차
        </button>
      </div>

      {tab === 'check' && (
        <>
          <div className="score-ring">
            <div className={`g ${d.grade}`}>{d.grade}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>종합 {d.score}점</div>
              <div className="note" style={{ margin: 0 }}>
                적합 {d.passed} · 확인 {d.warned} · 시정 {d.failed}
              </div>
              <div className="bar" style={{ marginTop: 6 }}>
                <i style={{ width: `${d.score}%` }} />
              </div>
            </div>
          </div>

          <Group title="점검 결과">
            {d.checks.map((c) => (
              <div key={c.id} className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span className={`badge ${c.status}`}>
                    {c.status === 'pass' ? <IconCheck size={11} /> : <IconWarn size={11} />}
                    {c.status === 'pass' ? '적합' : c.status === 'warn' ? '확인' : '시정'}
                  </span>
                  <b style={{ fontSize: 12.5 }}>{c.label}</b>
                  <span className="note" style={{ margin: 0, marginLeft: 'auto' }}>
                    {c.weight}점
                  </span>
                </div>
                <div style={{ fontSize: 12 }}>{c.detail}</div>
                {c.status !== 'pass' && (
                  <div className="note" style={{ marginTop: 4, color: 'var(--accent-700)' }}>
                    → {c.fix}
                  </div>
                )}
              </div>
            ))}
          </Group>

          <Group title="근거 법령">
            {LAWS.map((l) => (
              <div key={l.title} className="card">
                <b style={{ fontSize: 12.5 }}>{l.title}</b>
                <div className="note" style={{ marginTop: 2 }}>
                  {l.body}
                </div>
              </div>
            ))}
          </Group>
        </>
      )}

      {tab === 'hazard' && (
        <>
          <div className="metrics">
            <Metric v={HAZARDS.length} l="점검 항목" />
            <Metric v={HAZARDS.filter((h) => h.severity === 'high').length} l="중대 위험" />
            <Metric v={HAZARDS.filter((h) => h.severity === 'mid').length} l="일반" />
          </div>
          <p className="note" style={{ marginTop: 0 }}>
            도면으로는 알 수 없는 것들이다. 오늘 집을 한 바퀴 돌며 눈으로 확인한다.
          </p>
          {HAZARDS.map((h) => (
            <div key={h.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setOpen(open === h.id ? null : h.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`badge ${h.severity === 'high' ? 'fail' : 'warn'}`}>
                  {h.severity === 'high' ? '중대' : '일반'}
                </span>
                <b style={{ fontSize: 12.5 }}>{h.title}</b>
              </div>
              <div className="note" style={{ margin: '3px 0 0' }}>
                {h.where}
              </div>
              {open === h.id && (
                <div style={{ marginTop: 7, fontSize: 12 }}>
                  <div style={{ marginBottom: 5 }}>{h.why}</div>
                  <div style={{ color: 'var(--safe-700)' }}>
                    <b>조치</b> {h.fix}
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {tab === 'action' && (
        <>
          <Group title="화재 시 행동 절차">
            {PROCEDURE.map((p) => (
              <div key={p.no} className="card" style={{ display: 'flex', gap: 9 }}>
                <div
                  style={{
                    flex: 'none',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'var(--danger-600)',
                    color: '#fff',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  {p.no}
                </div>
                <div>
                  <b style={{ fontSize: 12.5 }}>{p.title}</b>
                  <div className="note" style={{ margin: '2px 0 0' }}>
                    {p.body}
                  </div>
                </div>
              </div>
            ))}
          </Group>

          <Group title="119 신고 문안">
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
              {CALL_119_SCRIPT.map((l, i) => (
                <li key={i} style={{ marginBottom: 3 }}>
                  {l}
                </li>
              ))}
            </ol>
            <Callout kind="warn" title="꼭 기억할 것">
              승강기는 타지 않는다. 되돌아가지 않는다. 대피 후에는 다시 들어가지 않는다.
            </Callout>
          </Group>
        </>
      )}
    </div>
  );
}
