'use client';

/** 07 대피 훈련 — 상황 설정 → 행동 선택 → 등급 평가 */
import React, { useMemo } from 'react';
import { store, useApp } from '../useStore';
import { Grid } from '../../lib/grid';
import { FIRE_CAUSES, getCause } from '../../lib/firesim';
import {
  ACTIONS,
  ActionKey,
  actionDef,
  applyAction,
  availableActions,
  evaluate,
  recognitionDelay,
  startScenario,
} from '../../lib/scenario';
import { WALKER_LABEL, WalkerKind, roomCenter } from '../../lib/types';
import { Callout, Group, KV, Metric, fmtSec } from './ui';
import { IconRefresh, IconShield } from '../Icons';

interface Props {
  grid: Grid;
}

const GROUP_ORDER = ['인지', '보호', '이동', '종료'] as const;

export default function Step7Drill({ grid }: Props) {
  const { plan, drill, sim } = useApp();
  const s = drill.state;

  const rooms = plan.rooms.filter((r) => r.kind !== 'balcony');

  const start = (startRoom: string, night: boolean, walker: WalkerKind) => {
    const origin = sim.origin ?? (rooms.find((r) => r.kind === 'kitchen') ? roomCenter(rooms.find((r) => r.kind === 'kitchen')!) : roomCenter(rooms[0]));
    const setup = { origin, cause: sim.cause, startRoom, walker, night };
    const st = startScenario(plan, grid, setup);
    store.setDrill({ setup, state: st });
  };

  const act = (key: ActionKey) => {
    if (!s) return;
    const next = applyAction(plan, grid, s, key);
    store.setDrill({ state: next });
  };

  const actions = useMemo(() => (s ? availableActions(plan, s) : []), [plan, s]);
  const ev = s && s.outcome !== 'ongoing' ? evaluate(s) : null;

  if (plan.rooms.length === 0) {
    return (
      <div className="panel">
        <Callout kind="warn" title="평면이 먼저다">
          훈련은 작성한 평면 위에서 진행한다. 01단계에서 평면을 먼저 만든다.
        </Callout>
      </div>
    );
  }

  if (!s) {
    return (
      <div className="panel">
        <Group title="상황 설정">
          <p className="note" style={{ marginTop: 0 }}>
            발화 지점은 06단계에서 정한 곳을 쓴다{sim.origin ? '' : ' (아직 없으면 주방)'}. 발화 원인은{' '}
            <b>{getCause(sim.cause).label}</b> 이다.
          </p>
          <label className="lbl" style={{ fontSize: 11.5, color: 'var(--n6)', fontWeight: 600 }}>
            발화 원인 바꾸기
          </label>
          <select value={sim.cause} onChange={(e) => store.setSim({ cause: e.target.value })} style={{ marginTop: 4 }}>
            {FIRE_CAUSES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </Group>

        <Group title="어디에 있었는가">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {rooms.map((r) => (
              <React.Fragment key={r.id}>
                <button type="button" className="btn sm" onClick={() => start(r.id, true, plan.meta.walker)}>
                  {r.name} · 야간
                </button>
              </React.Fragment>
            ))}
          </div>
          <div style={{ height: 8 }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {rooms.map((r) => (
              <button key={r.id} type="button" className="btn sm" onClick={() => start(r.id, false, plan.meta.walker)}>
                {r.name} · 주간
              </button>
            ))}
          </div>
          <p className="note">
            야간에는 인지가 {recognitionDelay({ night: true } as never)}초까지 늦는다. 공동주택 화재 사망의 61.6%가
            야간(19–07시)에 일어난다. 보행 기준은 {WALKER_LABEL[plan.meta.walker]}이다.
          </p>
        </Group>

        <Callout title="훈련하는 법">
          행동을 하나 고를 때마다 시간이 흐르고, 그 시각의 연기 농도만큼 노출이 쌓인다. 정답을 맞히는 놀이가
          아니라, <b>무엇을 먼저 하느냐</b>가 얼마나 큰 차이를 만드는지 보는 것이 목적이다.
        </Callout>
      </div>
    );
  }

  const hpColor = s.hp > 65 ? 'var(--safe-600)' : s.hp > 30 ? 'var(--warn-500)' : 'var(--danger-600)';

  return (
    <div className="panel">
      <Group title="현재 상태">
        <div className="metrics">
          <Metric v={fmtSec(s.t)} l="경과 시간" />
          <Metric v={<span style={{ color: hpColor }}>{Math.round(s.hp)}</span>} l="신체 상태" />
          <Metric v={s.dose.toFixed(1)} l="누적 노출" />
        </div>
        <div className="bar" style={{ marginBottom: 8 }}>
          <i style={{ width: `${s.hp}%`, background: hpColor }} />
        </div>
        <Callout kind={s.outcome === 'ongoing' ? 'info' : s.outcome === 'escaped' || s.outcome === 'sheltered' ? 'info' : 'danger'}>
          {s.message}
        </Callout>
        <KV k="자세" v={s.low ? '낮춤' : '선 자세'} />
        <KV k="호흡 보호" v={s.covered ? '함' : '안 함'} />
        <KV k="닫은 문" v={`${s.closedDoors.length}개`} />
      </Group>

      {s.outcome === 'ongoing' && (
        <Group title="무엇을 하겠는가">
          {GROUP_ORDER.map((g) => {
            const keys = actions.filter((k) => actionDef(k).group === g);
            if (keys.length === 0) return null;
            return (
              <div key={g} style={{ marginBottom: 10 }}>
                <div className="note" style={{ margin: '0 0 4px', fontWeight: 700, color: 'var(--n7)' }}>
                  {g}
                </div>
                {keys.map((k) => {
                  const d = actionDef(k);
                  return (
                    <button key={k} type="button" className="action-btn" onClick={() => act(k)}>
                      {d.seconds > 0 && <span className="t">{d.seconds}초</span>}
                      <b>{d.label}</b>
                      <span>{d.detail}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </Group>
      )}

      {ev && (
        <Group title="평가">
          <div className="score-ring">
            <div className={`g ${ev.grade}`}>{ev.grade}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{ev.outcomeLabel}</div>
              <div className="note" style={{ margin: 0 }}>
                종합 {ev.score}점 · 경과 {fmtSec(s.t)}
              </div>
            </div>
          </div>
          <KV k="신체 상태" v={`${ev.hpScore}점`} />
          <KV k="시간" v={`${ev.timeScore}점`} />
          <KV k="판단" v={`${ev.decisionScore}점`} />

          {ev.highlights.length > 0 && (
            <>
              <div className="note" style={{ fontWeight: 700, color: 'var(--safe-700)', marginTop: 10 }}>
                잘한 점
              </div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 12 }}>
                {ev.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </>
          )}
          {ev.reviews.length > 0 && (
            <>
              <div className="note" style={{ fontWeight: 700, color: 'var(--danger-700)', marginTop: 10 }}>
                검토할 점
              </div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 12 }}>
                {ev.reviews.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </>
          )}
        </Group>
      )}

      <Group title="판단 이력">
        <div className="log">
          <ul>
            {s.log.map((l, i) => (
              <li key={i}>
                <span className="t">{l.t}초</span>
                <b>{l.label}</b>
                <div style={{ color: 'var(--n6)' }}>{l.note}</div>
              </li>
            ))}
            {s.log.length === 0 && <li style={{ color: 'var(--n5)' }}>아직 선택한 행동이 없다.</li>}
          </ul>
        </div>
      </Group>

      <div className="btn-row grow">
        <button type="button" className="btn" onClick={() => store.setDrill({ setup: null, state: null })}>
          <IconRefresh size={15} /> 다시 하기
        </button>
        {s.outcome !== 'ongoing' && (
          <button type="button" className="btn pri" onClick={() => store.setStep(7)}>
            <IconShield size={15} /> 자가 진단으로
          </button>
        )}
      </div>

      <p className="note">
        훈련에 쓰인 행동 {ACTIONS.length}가지의 효과는 모두 교육용 근사값이다. 실제 상황에서는 그 자리의 조건이
        먼저다.
      </p>
    </div>
  );
}
