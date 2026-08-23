'use client';

/** 03 개구부 — 현관문·실문·창호 배치와 속성 */
import React from 'react';
import { store, useApp } from '../useStore';
import { DOOR_KIND_LABEL } from '../../lib/types';
import { Callout, Group, KV } from './ui';
import SelectionEditor from './SelectionEditor';

export default function Step3Opening() {
  const { plan, selection } = useApp();
  const entrance = plan.doors.filter((d) => d.kind === 'entrance');
  const closed = plan.doors.filter((d) => !d.alwaysOpen);

  return (
    <div className="panel">
      {selection && (selection.kind === 'door' || selection.kind === 'window') ? (
        <SelectionEditor />
      ) : (
        <Callout title="배치 방법">
          왼쪽 도구 막대에서 <b>개구부(D)</b> 또는 <b>창호(W)</b> 를 고르고 벽을 누른다. 벽 구간 안쪽으로 자동
          정렬되며, 놓은 뒤 선택하면 폭·열림 방향을 고칠 수 있다.
        </Callout>
      )}

      <Group title="현황">
        <KV k="현관문" v={`${entrance.length}개소`} />
        <KV k="실문·미닫이" v={`${plan.doors.length - entrance.length}개소`} />
        <KV k="창호" v={`${plan.windows.length}개소`} />
        <KV k="닫힌 문(지연 효과 있음)" v={`${closed.length}개소`} />
        {entrance.length === 0 && (
          <Callout kind="danger" title="현관문이 없다">
            현관문은 주 피난동선의 종점이다. 개구부 도구에서 종류를 <b>현관문</b> 으로 두고 외벽을 눌러 놓는다.
          </Callout>
        )}
      </Group>

      <Group title={`개구부 목록 (${plan.doors.length})`}>
        {plan.doors.length === 0 ? (
          <p className="note">아직 개구부가 없다.</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>종류</th>
                <th className="n">폭</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {plan.doors.map((d) => (
                <tr
                  key={d.id}
                  className={selection?.id === d.id ? 'hi' : undefined}
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    store.setTool('select');
                    store.select({ kind: 'door', id: d.id });
                  }}
                >
                  <td>{DOOR_KIND_LABEL[d.kind]}</td>
                  <td className="n">{d.width}cm</td>
                  <td>
                    <span className={`badge ${d.alwaysOpen ? 'warn' : 'pass'}`}>
                      {d.alwaysOpen ? '상시 개방' : '닫힘'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Group>

      <Group title="문 하나의 값어치">
        <p className="note" style={{ marginTop: 0 }}>
          닫힌 문은 연기가 넘어오는 데 약 80초를 벌어 준다. 상시 개방으로 표시한 문은 지연이 없다. 평소 열어
          두는 문이 어디인지 정확히 표시해야 해석이 현실과 가까워진다.
        </p>
        <p className="note">
          현관문 유효 폭은 문틀 안쪽 실제 통과 폭이다. 신발장·우산꽂이로 좁아졌다면 실제 값을 넣는다.
        </p>
      </Group>
    </div>
  );
}
