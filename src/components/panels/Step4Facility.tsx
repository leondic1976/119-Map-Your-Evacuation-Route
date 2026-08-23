'use client';

/** 04 설비 표기 — 소화기·세대 피난시설·연기감지기 */
import React from 'react';
import { store, useApp } from '../useStore';
import { addFacility } from '../../lib/store';
import { FACILITY_LABEL, FacilityType, planBounds } from '../../lib/types';
import { eraFor } from '../../lib/risk';
import { Callout, Group, KV } from './ui';
import SelectionEditor from './SelectionEditor';
import { LegendMark } from '../Symbols';

const QUICK: { type: FacilityType; hint: string }[] = [
  { type: 'extinguisher', hint: '현관·주방에 각 1개. 가족 모두가 위치를 안다.' },
  { type: 'detector', hint: '거실·침실 천장. 떼어 두지 않는다.' },
  { type: 'refuge', hint: '발코니의 방화문 있는 2㎡ 이상 공간.' },
  { type: 'partition', hint: '세대 경계벽. 두드리면 빈 소리가 난다.' },
  { type: 'downladder', hint: '발코니 바닥 피난구. 덮개 위를 비운다.' },
  { type: 'assembly', hint: '세대 밖 집결지를 도면에 함께 적을 때.' },
];

export default function Step4Facility() {
  const { plan, selection } = useApp();
  const era = eraFor(plan.meta.approvalYear);
  const b = planBounds(plan);

  const place = (type: FacilityType) => {
    store.setTool('facility');
    store.setOptions({ facility: type });
  };

  const addAtCenter = (type: FacilityType) => {
    store.update((p) =>
      addFacility(p, {
        type,
        x: Math.round(b.x + b.w / 2),
        y: Math.round(b.y + b.h / 2),
        rot: 0,
        size: type === 'partition' ? 90 : undefined,
      }),
    );
    store.toast(`${FACILITY_LABEL[type]} 기호를 도면 가운데에 놓았다. 끌어서 옮긴다.`);
  };

  const counts = (t: FacilityType) => plan.facilities.filter((f) => f.type === t).length;

  return (
    <div className="panel">
      <Callout title={`사용승인 ${plan.meta.approvalYear}년 — ${era.title}`}>
        {era.body}
      </Callout>

      <Group title="기호 놓기">
        {QUICK.map((q) => (
          <div key={q.type} className="card" style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
            <div style={{ flex: 'none', marginTop: 2 }}>
              <LegendMark kind={q.type} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <b style={{ fontSize: 12.5 }}>{FACILITY_LABEL[q.type]}</b>
                {counts(q.type) > 0 && <span className="badge pass">{counts(q.type)}</span>}
              </div>
              <div className="note" style={{ margin: '2px 0 6px' }}>
                {q.hint}
              </div>
              <div className="btn-row">
                <button type="button" className="btn sm" onClick={() => place(q.type)}>
                  도면에서 찍기
                </button>
                <button type="button" className="btn sm" onClick={() => addAtCenter(q.type)}>
                  가운데 놓기
                </button>
              </div>
            </div>
          </div>
        ))}
      </Group>

      {selection?.kind === 'facility' && <SelectionEditor />}

      <Group title={`표기 현황 (${plan.facilities.length})`}>
        <KV k="소화기" v={`${counts('extinguisher')}개`} />
        <KV k="연기감지기" v={`${counts('detector')}개`} />
        <KV k="대피공간" v={`${counts('refuge')}개`} />
        <KV k="경량칸막이" v={`${counts('partition')}개`} />
        <KV k="하향식 피난구" v={`${counts('downladder')}개`} />
        {counts('refuge') + counts('partition') + counts('downladder') === 0 && (
          <Callout kind="warn" title="대체 피난수단이 없다">
            현관이 막히면 갈 곳이 없다. 발코니에서 실제 시설을 확인해 표기한다. 아무것도 없다면 외기에 접한
            발코니를 대기 장소로 정하고, 그곳까지의 동선을 대체 동선으로 그린다.
          </Callout>
        )}
      </Group>

      <Group title="확인 요령">
        <p className="note" style={{ marginTop: 0 }}>
          <b>경량칸막이</b> — 발코니 세대 경계벽을 두드려 본다. 속이 빈 소리가 나면 경량칸막이일 가능성이 높다.
          표시 스티커가 붙어 있는 경우가 많다.
        </p>
        <p className="note">
          <b>대피공간</b> — 발코니 한쪽에 방화문으로 막힌 작은 공간이다. 창고로 쓰고 있다면 지금 비운다.
        </p>
        <p className="note">
          <b>하향식 피난구</b> — 발코니 바닥의 사각 덮개다. 덮개 위에 화분·수납장을 올려 두지 않는다.
        </p>
      </Group>
    </div>
  );
}
