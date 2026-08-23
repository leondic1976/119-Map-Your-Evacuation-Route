'use client';

/** 선택한 요소의 속성 편집 — 여러 단계에서 공용으로 쓴다 */
import React from 'react';
import { store, useApp } from '../useStore';
import {
  DOOR_KIND_LABEL,
  DoorKind,
  FACILITY_LABEL,
  FacilityType,
  ROOM_KIND_LABEL,
  RoomKind,
  roomArea,
} from '../../lib/types';
import {
  removeSelection,
  updateDoor,
  updateFacility,
  updateNote,
  updateRoom,
  updateRoute,
  updateWindow,
} from '../../lib/store';
import { Field, Group, KV, NumField } from './ui';
import { IconBack, IconTrash } from '../Icons';
import { routeMetric } from '../../lib/routing';
import { fmtSec } from './ui';

const ROOM_KINDS: RoomKind[] = [
  'room',
  'living',
  'kitchen',
  'bath',
  'entry',
  'hall',
  'balcony',
  'utility',
  'dress',
  'store',
];
const DOOR_KINDS: DoorKind[] = ['entrance', 'room', 'sliding', 'folding'];
const FACILITY_KINDS: FacilityType[] = [
  'extinguisher',
  'refuge',
  'partition',
  'downladder',
  'assembly',
];

export default function SelectionEditor() {
  const { plan, selection } = useApp();
  if (!selection) return null;

  const del = () => {
    store.update((p) => removeSelection(p, selection));
    store.select(null);
  };

  /**
   * 세부 설정에 들어오면 나가는 길이 보여야 한다.
   * '뒤로'가 없으면 목록으로 돌아갈 방법을 찾지 못한다.
   */
  const header = (title: string) => (
    <>
      <button type="button" className="insp-back" onClick={() => store.select(null)}>
        <IconBack size={14} /> 뒤로 (목록으로)
      </button>
      <h3>
        {title}
        <button type="button" className="btn sm danger" onClick={del} title="지우기 (Delete)">
          <IconTrash size={14} /> 지우기
        </button>
      </h3>
    </>
  );

  if (selection.kind === 'room') {
    const r = plan.rooms.find((x) => x.id === selection.id);
    if (!r) return null;
    return (
      <section className="group">
        {header('선택한 실')}
        <Field label="이름">
          <input type="text" value={r.name} onChange={(e) => store.update((p) => updateRoom(p, r.id, { name: e.target.value }))} />
        </Field>
        <Field label="용도">
          <select
            value={r.kind}
            onChange={(e) => store.update((p) => updateRoom(p, r.id, { kind: e.target.value as RoomKind }))}
          >
            {ROOM_KINDS.map((k) => (
              <option key={k} value={k}>
                {ROOM_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <NumField label="가로" value={r.w} min={40} step={5} suffix="cm" onChange={(v) => store.update((p) => updateRoom(p, r.id, { w: Math.max(40, v) }))} />
        <NumField label="세로" value={r.h} min={40} step={5} suffix="cm" onChange={(v) => store.update((p) => updateRoom(p, r.id, { h: Math.max(40, v) }))} />
        <NumField label="X" value={r.x} step={5} suffix="cm" onChange={(v) => store.update((p) => updateRoom(p, r.id, { x: v }))} />
        <NumField label="Y" value={r.y} step={5} suffix="cm" onChange={(v) => store.update((p) => updateRoom(p, r.id, { y: v }))} />
        <KV k="면적" v={`${roomArea(r).toFixed(2)}㎡ (${(roomArea(r) * 0.3025).toFixed(1)}평)`} />
      </section>
    );
  }

  if (selection.kind === 'door') {
    const d = plan.doors.find((x) => x.id === selection.id);
    if (!d) return null;
    const swings = d.kind === 'entrance' || d.kind === 'room';
    return (
      <section className="group">
        {header('선택한 개구부')}
        <Field label="종류">
          <select
            value={d.kind}
            onChange={(e) => {
              const kind = e.target.value as DoorKind;
              store.update((p) => updateDoor(p, d.id, { kind, alwaysOpen: kind === 'sliding' ? true : d.alwaysOpen }));
            }}
          >
            {DOOR_KINDS.map((k) => (
              <option key={k} value={k}>
                {DOOR_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <NumField
          label="유효 폭"
          value={d.width}
          min={50}
          max={300}
          step={5}
          suffix="cm"
          onChange={(v) => store.update((p) => updateDoor(p, d.id, { width: Math.max(50, v) }))}
        />
        {swings && (
          <>
            <Field label="열림 방향">
              <div className="seg">
                <button type="button" aria-pressed={d.swing === -1} onClick={() => store.update((p) => updateDoor(p, d.id, { swing: -1 }))}>
                  {d.dir === 'h' ? '위쪽' : '왼쪽'}
                </button>
                <button type="button" aria-pressed={d.swing === 1} onClick={() => store.update((p) => updateDoor(p, d.id, { swing: 1 }))}>
                  {d.dir === 'h' ? '아래쪽' : '오른쪽'}
                </button>
              </div>
            </Field>
            <Field label="경첩">
              <div className="seg">
                <button type="button" aria-pressed={d.hinge === -1} onClick={() => store.update((p) => updateDoor(p, d.id, { hinge: -1 }))}>
                  {d.dir === 'h' ? '왼쪽' : '위쪽'}
                </button>
                <button type="button" aria-pressed={d.hinge === 1} onClick={() => store.update((p) => updateDoor(p, d.id, { hinge: 1 }))}>
                  {d.dir === 'h' ? '오른쪽' : '아래쪽'}
                </button>
              </div>
            </Field>
          </>
        )}
        <label className="chk">
          <input
            type="checkbox"
            checked={d.alwaysOpen}
            onChange={(e) => store.update((p) => updateDoor(p, d.id, { alwaysOpen: e.target.checked }))}
          />
          상시 개방 (연기 확산 지연 없음)
        </label>
        <p className="note">
          닫힌 문은 연기 확산을 약 {Math.round(80)}초 늦춘다. 평소 열어 두는 문이면 상시 개방으로 표시한다.
        </p>
      </section>
    );
  }

  if (selection.kind === 'window') {
    const w = plan.windows.find((x) => x.id === selection.id);
    if (!w) return null;
    return (
      <section className="group">
        {header('선택한 창호')}
        <NumField
          label="폭"
          value={w.width}
          min={40}
          max={400}
          step={5}
          suffix="cm"
          onChange={(v) => store.update((p) => updateWindow(p, w.id, { width: Math.max(40, v) }))}
        />
        <p className="note">창은 피난 종점이 아니다. 다만 연기가 들어오지 않는 쪽 창은 대기 중 공기 확보에 쓴다.</p>
      </section>
    );
  }

  if (selection.kind === 'facility') {
    const f = plan.facilities.find((x) => x.id === selection.id);
    if (!f) return null;
    return (
      <section className="group">
        {header('선택한 설비')}
        <Field label="종류">
          <select
            value={f.type}
            onChange={(e) => store.update((p) => updateFacility(p, f.id, { type: e.target.value as FacilityType }))}
          >
            {FACILITY_KINDS.map((k) => (
              <option key={k} value={k}>
                {FACILITY_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        {f.type === 'partition' && (
          <NumField
            label="길이"
            value={f.size ?? 90}
            min={40}
            max={400}
            step={10}
            suffix="cm"
            onChange={(v) => store.update((p) => updateFacility(p, f.id, { size: v }))}
          />
        )}
        <NumField
          label="회전"
          value={f.rot}
          min={0}
          max={359}
          step={15}
          suffix="도"
          onChange={(v) => store.update((p) => updateFacility(p, f.id, { rot: v }))}
        />
        <Field label="메모" wide>
          <input
            type="text"
            value={f.note ?? ''}
            placeholder="예) 2019년 교체, 압력 정상"
            onChange={(e) => store.update((p) => updateFacility(p, f.id, { note: e.target.value }))}
          />
        </Field>
      </section>
    );
  }

  if (selection.kind === 'route') {
    const r = plan.routes.find((x) => x.id === selection.id);
    if (!r) return null;
    const m = routeMetric(r, plan.meta.walker);
    return (
      <section className="group">
        {header('선택한 동선')}
        <Field label="이름" wide>
          <input type="text" value={r.label} onChange={(e) => store.update((p) => updateRoute(p, r.id, { label: e.target.value }))} />
        </Field>
        <Field label="종류">
          <div className="seg">
            <button type="button" aria-pressed={r.kind === 'primary'} onClick={() => store.update((p) => updateRoute(p, r.id, { kind: 'primary' }))}>
              주 동선
            </button>
            <button type="button" aria-pressed={r.kind === 'alt'} onClick={() => store.update((p) => updateRoute(p, r.id, { kind: 'alt' }))}>
              대체 동선
            </button>
          </div>
        </Field>
        <KV k="보행거리" v={`${m.length.toFixed(1)}m`} />
        <KV k="소요시간" v={fmtSec(m.walkTime)} />
        <KV k="꺾임" v={`${m.turns}회`} />
        <KV k="구간" v={`${m.segments.length}개`} />
      </section>
    );
  }

  if (selection.kind === 'note') {
    const n = plan.notes.find((x) => x.id === selection.id);
    if (!n) return null;
    return (
      <section className="group">
        {header('선택한 주기')}
        <Field label="내용" wide>
          <textarea rows={3} value={n.text} onChange={(e) => store.update((p) => updateNote(p, n.id, { text: e.target.value }))} />
        </Field>
        <NumField label="글자 크기" value={n.size} min={10} max={80} step={2} onChange={(v) => store.update((p) => updateNote(p, n.id, { size: v }))} />
      </section>
    );
  }

  return <Group>{null}</Group>;
}
