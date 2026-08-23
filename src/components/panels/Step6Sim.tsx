'use client';

/** 06 확산 해석 — 타임라인 · 차단 면적 곡선 · 동선별 ASET/RSET */
import React, { useEffect, useMemo, useRef } from 'react';
import { store, useApp } from '../useStore';
import { Grid } from '../../lib/grid';
import {
  CurvePoint,
  FIRE_CAUSES,
  SmokeField,
  areaCurve,
  describeField,
  getCause,
  routeASET,
  safetyMargin,
} from '../../lib/firesim';
import { rset } from '../../lib/routing';
import { ignitionCandidates } from '../../lib/firesim';
import { Callout, Group, KV, Metric, fmtSec } from './ui';
import { IconFire, IconPause, IconPlay } from '../Icons';
import { DISCLAIMER } from '../../lib/risk';

interface Props {
  field: SmokeField | null;
  grid: Grid;
  pickMode: boolean;
  setPickMode: (v: boolean) => void;
}

export default function Step6Sim({ field, grid, pickMode, setPickMode }: Props) {
  const { plan, sim } = useApp();
  const raf = useRef<number | null>(null);
  const last = useRef<number>(0);

  /* 재생 */
  useEffect(() => {
    if (!sim.playing) {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
      return;
    }
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - last.current) / 1000;
      last.current = now;
      const next = store.getState().sim.time + dt * store.getState().sim.speed;
      if (next >= sim.tMax) {
        store.setSim({ time: sim.tMax, playing: false });
        return;
      }
      store.setSim({ time: next });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [sim.playing, sim.speed, sim.tMax]);

  const curve = useMemo(() => (field ? areaCurve(field, grid, sim.tMax, 5) : []), [field, grid, sim.tMax]);

  const asets = useMemo(() => {
    if (!field) return [];
    return plan.routes.map((r) => {
      const a = routeASET(field, grid, r);
      return { route: r, m: safetyMargin(a, rset(r, plan.meta.walker)) };
    });
  }, [field, grid, plan.routes, plan.meta.walker]);

  const cause = getCause(sim.cause);
  const now = curve.find((c) => c.t >= sim.time) ?? curve[curve.length - 1];

  const candidates = useMemo(() => ignitionCandidates(plan), [plan]);

  return (
    <div className="panel">
      <Group title="발화 설정">
        <div className="btn-row grow">
          <button
            type="button"
            className={`btn ${pickMode ? 'danger' : 'pri'}`}
            onClick={() => setPickMode(!pickMode)}
          >
            <IconFire size={15} /> {pickMode ? '지점 고르는 중… (취소)' : '도면에서 발화 지점 찍기'}
          </button>
        </div>
        <div style={{ height: 6 }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {candidates.map((c) => (
            <button
              key={c.roomId}
              type="button"
              className="btn sm"
              onClick={() => {
                store.setSim({ origin: { x: c.x, y: c.y } });
                setPickMode(false);
              }}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div style={{ height: 10 }} />
        <label className="lbl" style={{ fontSize: 11.5, color: 'var(--n6)', fontWeight: 600 }}>
          발화 원인
        </label>
        <select value={sim.cause} onChange={(e) => store.setSim({ cause: e.target.value })} style={{ marginTop: 4 }}>
          {FIRE_CAUSES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label} (성장 ×{c.growth})
            </option>
          ))}
        </select>
        <p className="note">{cause.note}</p>
      </Group>

      {!field && (
        <Callout kind="warn" title="발화 지점을 먼저 정한다">
          위 버튼으로 도면에서 지점을 찍거나, 실 이름 단추를 눌러 그 실 가운데를 발화점으로 삼는다.
        </Callout>
      )}

      {field && (
        <>
          <Group title="타임라인">
            <div className="timeline">
              <button
                type="button"
                className="play"
                aria-label={sim.playing ? '일시정지' : '재생'}
                onClick={() => store.setSim({ playing: !sim.playing, time: sim.time >= sim.tMax ? 0 : sim.time })}
              >
                {sim.playing ? <IconPause size={16} /> : <IconPlay size={16} />}
              </button>
              <input
                type="range"
                min={0}
                max={sim.tMax}
                step={1}
                value={Math.round(sim.time)}
                aria-label="경과 시간"
                onChange={(e) => store.setSim({ time: Number(e.target.value), playing: false })}
              />
              <span className="t">{fmtSec(sim.time)}</span>
            </div>
            <div className="btn-row" style={{ marginBottom: 8 }}>
              {[0, 30, 60, 120, 180, 300].map((t) => (
                <button
                  key={t}
                  type="button"
                  className="btn sm"
                  onClick={() => store.setSim({ time: Math.min(t, sim.tMax), playing: false })}
                >
                  {t}초
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className="note" style={{ margin: 0 }}>
                재생 속도
              </span>
              <div className="seg" style={{ flex: 1 }}>
                {[1, 2, 4, 8].map((s) => (
                  <button key={s} type="button" aria-pressed={sim.speed === s} onClick={() => store.setSim({ speed: s })}>
                    ×{s}
                  </button>
                ))}
              </div>
            </div>
          </Group>

          <div className="metrics">
            <Metric v={`${(now?.reachedArea ?? 0).toFixed(1)}㎡`} l="연기 도달" />
            <Metric v={`${(now?.blockedArea ?? 0).toFixed(1)}㎡`} l="통행 불가" />
            <Metric v={`${Math.round((now?.ratio ?? 0) * 100)}%`} l="차단 비율" />
          </div>

          <Group title="차단 면적 곡선">
            <AreaChart curve={curve} t={sim.time} tMax={sim.tMax} total={field.totalArea} />
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--n6)', marginTop: 4 }}>
              <ChartKey color="#98a4b3" dashed label="연기 도달" />
              <ChartKey color="#3a424d" label="통행 불가" />
              <ChartKey color="#c8102e" label="화염" />
            </div>
            <p className="note">{describeField(field, grid)}</p>
          </Group>

          <Group title="동선별 ASET · RSET">
            {asets.length === 0 ? (
              <p className="note">동선이 없다. 05단계에서 먼저 동선을 만든다.</p>
            ) : (
              <>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>동선</th>
                      <th className="n">ASET</th>
                      <th className="n">RSET</th>
                      <th className="n">여유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asets.map(({ route, m }) => (
                      <tr key={route.id}>
                        <td>{route.label}</td>
                        <td className="n">{isFinite(m.aset) ? `${Math.round(m.aset)}초` : '미차단'}</td>
                        <td className="n">{Math.round(m.rset)}초</td>
                        <td className="n">
                          <span className={`badge ${m.verdict === 'safe' ? 'pass' : m.verdict === 'tight' ? 'warn' : 'fail'}`}>
                            {m.verdict === 'fail'
                              ? `${Math.round(-m.margin)}초 부족`
                              : isFinite(m.margin)
                                ? `+${Math.round(m.margin)}초`
                                : '충분'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="note">
                  ASET은 그 동선 위 어느 한 곳이라도 연기 때문에 지나갈 수 없게 되는 시각, RSET은 인지 10초에
                  보행 시간을 더한 값이다. 여유가 음수인 동선은 이 발화 조건에서 쓸 수 없다.
                </p>
              </>
            )}
          </Group>

          <Group title="해석 조건">
            <KV k="발화 원인" v={cause.label} />
            <KV k="성장 배수" v={`×${field.growth}`} />
            <KV k="연기 선단 속도" v="0.9 m/s" />
            <KV k="차단 판정" v="도달 후 30초 (농도 0.5)" />
            <KV k="닫힌 문 지연" v="약 80초" />
            <KV k="통행 총면적" v={`${field.totalArea.toFixed(1)}㎡`} />
          </Group>

          <Callout kind="warn" title="이 결과를 어떻게 볼 것인가">
            {DISCLAIMER}
          </Callout>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ChartKey({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <i
        style={{
          display: 'inline-block',
          width: 15,
          borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
        }}
      />
      {label}
    </span>
  );
}

function AreaChart({ curve, t, tMax, total }: { curve: CurvePoint[]; t: number; tMax: number; total: number }) {
  const W = 340;
  const H = 128;
  const pad = { l: 32, r: 8, t: 8, b: 20 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (s: number) => pad.l + (s / tMax) * iw;
  const y = (a: number) => pad.t + ih - (a / Math.max(1, total)) * ih;
  const line = (key: 'reachedArea' | 'blockedArea' | 'flameArea') =>
    curve.map((c, i) => `${i === 0 ? 'M' : 'L'} ${x(c.t).toFixed(1)} ${y(c[key]).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="시간에 따른 연기 도달 면적">
      <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="#fbfcfd" stroke="var(--n3)" />
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={pad.l} y1={y(total * f)} x2={pad.l + iw} y2={y(total * f)} stroke="var(--n3)" strokeDasharray="3 3" />
          <text x={pad.l - 4} y={y(total * f) + 3} textAnchor="end" fontSize={8.5} fill="var(--n6)">
            {Math.round(total * f)}
          </text>
        </g>
      ))}
      <path d={`${line('reachedArea')} L ${x(tMax)} ${y(0)} L ${x(0)} ${y(0)} Z`} fill="rgba(90,100,112,0.13)" />
      <path d={line('reachedArea')} fill="none" stroke="#98a4b3" strokeWidth={1.6} strokeDasharray="4 3" />
      <path d={`${line('blockedArea')} L ${x(tMax)} ${y(0)} L ${x(0)} ${y(0)} Z`} fill="rgba(58,66,77,0.2)" />
      <path d={line('blockedArea')} fill="none" stroke="#3a424d" strokeWidth={2} />
      <path d={line('flameArea')} fill="none" stroke="var(--danger-600)" strokeWidth={1.8} />
      <line x1={x(t)} y1={pad.t} x2={x(t)} y2={pad.t + ih} stroke="var(--accent-700)" strokeWidth={1.6} />
      {[0, tMax / 2, tMax].map((s) => (
        <text key={s} x={x(s)} y={H - 6} textAnchor="middle" fontSize={8.5} fill="var(--n6)">
          {Math.round(s)}초
        </text>
      ))}
      <text x={pad.l + 4} y={pad.t + 10} fontSize={8.5} fill="var(--n6)">
        ㎡
      </text>
    </svg>
  );
}
