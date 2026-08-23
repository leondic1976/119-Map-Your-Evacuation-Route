'use client';

/** 02 세대 정보 — 준공 시기별 세대 피난시설 안내 */
import React from 'react';
import { store, useApp } from '../useStore';
import { setMeta } from '../../lib/store';
import { ERA_GUIDES, FACTS, eraFor } from '../../lib/risk';
import { WALKER_LABEL, WALK_SPEED, WalkerKind, planArea } from '../../lib/types';
import { Callout, Field, Group, KV, NumField, TextField } from './ui';

const WALKERS: WalkerKind[] = ['adult', 'child', 'senior'];

export default function Step2Meta() {
  const { plan } = useApp();
  const m = plan.meta;
  const era = eraFor(m.approvalYear);
  const set = (patch: Partial<typeof m>) => store.update((p) => setMeta(p, patch));

  return (
    <div className="panel">
      <Group title="세대 정보">
        <TextField label="단지명" value={m.complex} placeholder="예) 한빛아파트" onChange={(v) => set({ complex: v })} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <Field label="동" wide>
            <input type="text" value={m.dong} onChange={(e) => set({ dong: e.target.value })} />
          </Field>
          <Field label="호" wide>
            <input type="text" value={m.ho} onChange={(e) => set({ ho: e.target.value })} />
          </Field>
          <Field label="층" wide>
            <input
              type="number"
              value={m.floor}
              min={1}
              max={80}
              onChange={(e) => set({ floor: Number(e.target.value) || 1 })}
            />
          </Field>
        </div>
        <NumField label="전용면적" value={m.area} min={20} max={250} step={1} suffix="㎡" onChange={(v) => set({ area: v })} />
        <KV k="작도한 실 합계" v={`${planArea(plan).toFixed(1)}㎡`} />
      </Group>

      <Group title="사용승인 연도">
        <Field label="연도">
          <input
            type="number"
            value={m.approvalYear}
            min={1960}
            max={2035}
            onChange={(e) => set({ approvalYear: Number(e.target.value) || 2000 })}
          />
        </Field>
        <Field label="빠른 선택" wide>
          <div className="seg">
            {ERA_GUIDES.map((g, i) => (
              <button
                key={g.key}
                type="button"
                aria-pressed={era.key === g.key}
                onClick={() => set({ approvalYear: [1985, 1998, 2007, 2018][i] })}
              >
                {g.range}
              </button>
            ))}
          </div>
        </Field>

        <Callout title={`${era.range} — ${era.title}`}>
          {era.body}
          <div style={{ height: 6 }} />
          <b style={{ color: 'var(--danger-700)' }}>확인할 점</b>
          {era.caution}
        </Callout>

        <p className="note">
          준공 시기에 따른 <b>추정</b>이다. 세대마다 다르므로 발코니에서 실제 시설을 눈으로 확인한다.
          관리사무소에 물어보면 확실하다.
        </p>
      </Group>

      <Group title="재실 구성 · 보행 기준">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {WALKERS.map((k) => (
            <Field key={k} label={WALKER_LABEL[k]} wide>
              <input
                type="number"
                min={0}
                max={20}
                value={m.occupants[k]}
                onChange={(e) => set({ occupants: { ...m.occupants, [k]: Number(e.target.value) || 0 } })}
              />
            </Field>
          ))}
        </div>
        <Field label="대표 기준" wide>
          <div className="seg">
            {WALKERS.map((k) => (
              <button key={k} type="button" aria-pressed={m.walker === k} onClick={() => set({ walker: k })}>
                {WALKER_LABEL[k]} {WALK_SPEED[k]}m/s
              </button>
            ))}
          </div>
        </Field>
        <p className="note">
          동선 소요시간은 이 기준으로 계산한다. 어린이·고령자가 있으면 느린 쪽에 맞춰 계획을 세운다.
        </p>
      </Group>

      <Group title="집결지 · 연락">
        <Field label="집결지" wide>
          <input
            type="text"
            value={m.assembly}
            placeholder="예) 단지 내 놀이터 미끄럼틀 앞"
            onChange={(e) => set({ assembly: e.target.value })}
          />
        </Field>
        <Field label="비상 연락 메모" wide>
          <textarea
            rows={2}
            value={m.contact}
            placeholder="예) 관리사무소 02-000-0000 / 이웃 김OO"
            onChange={(e) => set({ contact: e.target.value })}
          />
        </Field>
      </Group>

      <Group title="왜 세대별 계획이 필요한가">
        {FACTS.map((f) => (
          <div key={f.label} className="card">
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--danger-600)', lineHeight: 1.2 }}>{f.value}</div>
            <div style={{ fontSize: 12 }}>{f.label}</div>
            <div className="note" style={{ marginTop: 3 }}>
              {f.source}
            </div>
          </div>
        ))}
      </Group>
    </div>
  );
}
