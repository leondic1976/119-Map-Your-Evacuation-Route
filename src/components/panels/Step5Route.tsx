'use client';

/** 05 피난동선 — 자동 생성 · 구간별 거리와 소요시간 */
import React from 'react';
import { store, useApp, useModel } from '../useStore';
import { generateRoutes, routeMetric, RECOGNITION_TIME } from '../../lib/routing';
import { WALKER_LABEL, WALK_SPEED, WalkerKind } from '../../lib/types';
import { setMeta } from '../../lib/store';
import { Callout, Group, KV, Metric } from './ui';
import { fmtSec } from './ui';
import SelectionEditor from './SelectionEditor';
import { IconRefresh, IconRoute, IconTrash } from '../Icons';

const WALKERS: WalkerKind[] = ['adult', 'child', 'senior'];

export default function Step5Route() {
  const app = useApp();
  const { plan, selection } = app;
  const { grid } = useModel(plan);

  const gen = (target: 'entrance' | 'facility') => {
    const routes = generateRoutes(plan, grid, { target });
    if (routes.length === 0) {
      store.toast(
        target === 'entrance'
          ? '현관문이 없거나 이어지는 길이 없다. 개구부 단계를 확인한다.'
          : '피난설비가 표기되지 않았다. 설비 단계에서 먼저 표기한다.',
        'warn',
      );
      return;
    }
    store.update((p) => ({
      ...p,
      routes: p.routes.filter((r) => (target === 'entrance' ? r.kind !== 'primary' : r.kind !== 'alt')).concat(routes),
    }));
    store.toast(`${target === 'entrance' ? '주' : '대체'} 동선 ${routes.length}개를 생성했다.`);
  };

  const clear = () => {
    store.update((p) => ({ ...p, routes: [] }));
    store.select(null);
  };

  const metrics = plan.routes.map((r) => ({ route: r, m: routeMetric(r, plan.meta.walker) }));
  const longest = metrics.reduce((a, b) => (b.m.length > a ? b.m.length : a), 0);
  const totalTime = metrics.length ? Math.max(...metrics.map((x) => x.m.walkTime)) : 0;

  return (
    <div className="panel">
      <Group title="자동 생성">
        <div className="btn-row grow">
          <button type="button" className="btn pri" onClick={() => gen('entrance')}>
            <IconRoute size={15} /> 주 동선
          </button>
          <button type="button" className="btn" onClick={() => gen('facility')}>
            대체 동선
          </button>
        </div>
        <div className="btn-row grow" style={{ marginTop: 6 }}>
          <button type="button" className="btn" onClick={() => store.setTool('route')}>
            직접 그리기
          </button>
          <button type="button" className="btn" onClick={clear} disabled={plan.routes.length === 0}>
            <IconTrash size={14} /> 모두 지우기
          </button>
        </div>
        <p className="note">
          각 실 가운데에서 가장 가까운 종점까지, 벽에서 떨어진 통로 중앙을 따라 직각으로 잇는다. 마음에 들지
          않으면 직접 그린 뒤 자동으로 직각 정리된다.
        </p>
      </Group>

      <Group title="보행 기준">
        <div className="seg">
          {WALKERS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={plan.meta.walker === k}
              onClick={() => store.update((p) => setMeta(p, { walker: k }))}
            >
              {WALKER_LABEL[k]}
            </button>
          ))}
        </div>
        <p className="note">
          {WALKER_LABEL[plan.meta.walker]} {WALK_SPEED[plan.meta.walker]}m/s 기준. 소요시간에 인지 시간{' '}
          {RECOGNITION_TIME}초를 더한 값이 RSET(피난 필요시간)이다.
        </p>
      </Group>

      {plan.routes.length > 0 && (
        <>
          <div className="metrics">
            <Metric v={plan.routes.length} l="동선 수" />
            <Metric v={`${longest.toFixed(1)}m`} l="최장 보행거리" />
            <Metric v={fmtSec(totalTime + RECOGNITION_TIME)} l="최대 RSET" />
          </div>

          <Group title="동선별 지표">
            <table className="tbl">
              <thead>
                <tr>
                  <th>동선</th>
                  <th className="n">거리</th>
                  <th className="n">보행</th>
                  <th className="n">꺾임</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map(({ route, m }, i) => (
                  <tr
                    key={route.id}
                    className={selection?.id === route.id ? 'hi' : undefined}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      store.setTool('select');
                      store.select({ kind: 'route', id: route.id });
                    }}
                  >
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 16,
                          fontWeight: 700,
                          color: route.kind === 'primary' ? 'var(--safe-600)' : 'var(--accent-700)',
                        }}
                      >
                        {i + 1}
                      </span>
                      {route.label}
                    </td>
                    <td className="n">{m.length.toFixed(1)}m</td>
                    <td className="n">{Math.round(m.walkTime)}초</td>
                    <td className="n">{m.turns}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Group>
        </>
      )}

      {selection?.kind === 'route' && <SelectionEditor />}

      {selection?.kind === 'route' && (
        <Group title="구간별 상세">
          {(() => {
            const r = plan.routes.find((x) => x.id === selection.id);
            if (!r) return null;
            const m = routeMetric(r, plan.meta.walker);
            return (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>구간</th>
                    <th>방향</th>
                    <th className="n">거리</th>
                    <th className="n">시간</th>
                  </tr>
                </thead>
                <tbody>
                  {m.segments.map((s, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{s.dir}</td>
                      <td className="n">{s.length.toFixed(1)}m</td>
                      <td className="n">{s.time.toFixed(1)}초</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </Group>
      )}

      {plan.routes.length === 0 && (
        <Callout title="동선이 없다">
          자동 생성을 누르면 주요 실에서 현관까지의 동선이 한꺼번에 만들어진다. 현관문이 없으면 먼저 개구부
          단계로 돌아간다.
        </Callout>
      )}

      <Group title="동선을 볼 때">
        <p className="note" style={{ marginTop: 0 }}>
          거리보다 <b>지나는 실</b>이 중요하다. 주방을 지나야만 현관에 닿는 구조라면, 주방에서 불이 났을 때
          쓸 수 있는 대체 동선이 반드시 있어야 한다. 다음 단계에서 확인한다.
        </p>
        <KV k="주 동선" v={`${plan.routes.filter((r) => r.kind === 'primary').length}개`} />
        <KV k="대체 동선" v={`${plan.routes.filter((r) => r.kind === 'alt').length}개`} />
      </Group>
    </div>
  );
}
