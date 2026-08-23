'use client';

/** 도구 막대와 컨텍스트 옵션 막대 */
import React from 'react';
import { TOOLS, ToolKey, store } from '../lib/store';
import { useApp } from './useStore';
import {
  IconDoor,
  IconFacility,
  IconHand,
  IconRoom,
  IconRoute,
  IconRuler,
  IconSelect,
  IconSketch,
  IconText,
  IconWindow,
} from './Icons';
import {
  DOOR_KIND_LABEL,
  DoorKind,
  FACILITY_LABEL,
  FacilityType,
  ROOM_KIND_LABEL,
  RoomKind,
} from '../lib/types';

const ICONS: Record<ToolKey, React.ComponentType<{ size?: number }>> = {
  select: IconSelect,
  sketch: IconSketch,
  room: IconRoom,
  door: IconDoor,
  window: IconWindow,
  facility: IconFacility,
  route: IconRoute,
  note: IconText,
  measure: IconRuler,
  pan: IconHand,
};

export function ToolRail() {
  const { tool } = useApp();
  return (
    <div className="rail" role="toolbar" aria-label="도구 막대" aria-orientation="vertical">
      {TOOLS.map((t, i) => {
        const Icon = ICONS[t.key];
        return (
          <React.Fragment key={t.key}>
            {(i === 1 || i === 6 || i === 8) && <hr />}
            <button
              type="button"
              aria-pressed={tool === t.key}
              aria-label={`${t.label} (단축키 ${t.shortcut})`}
              title={`${t.label}  ·  ${t.shortcut}\n${t.hint}`}
              onClick={() => store.setTool(t.key)}
            >
              <Icon size={20} />
              <span className="sc" aria-hidden="true">
                {t.shortcut}
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

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

const FACILITIES: FacilityType[] = [
  'extinguisher',
  'detector',
  'refuge',
  'partition',
  'downladder',
  'assembly',
];

export function OptionBar() {
  const { tool, options, snap, snapSize } = useApp();
  const def = TOOLS.find((t) => t.key === tool);

  return (
    <div className="optbar" role="group" aria-label="도구 옵션">
      <span className="lbl">{def?.label}</span>
      <span className="hint">{def?.hint}</span>
      <span className="sep" />

      {tool === 'sketch' && (
        <>
          <span className="lbl">해석</span>
          <div className="seg" style={{ width: 250 }}>
            <button
              type="button"
              aria-pressed={options.sketchMode === 'auto'}
              title="그린 모양을 보고 알아서 판단한다"
              onClick={() => store.setOptions({ sketchMode: 'auto' })}
            >
              자동
            </button>
            <button
              type="button"
              aria-pressed={options.sketchMode === 'room'}
              title="닫힌 모양으로 보고 방을 만든다"
              onClick={() => store.setOptions({ sketchMode: 'room' })}
            >
              방
            </button>
            <button
              type="button"
              aria-pressed={options.sketchMode === 'wall'}
              title="방을 가로지르는 벽으로 본다"
              onClick={() => store.setOptions({ sketchMode: 'wall' })}
            >
              벽
            </button>
            <button
              type="button"
              aria-pressed={options.sketchMode === 'opening'}
              title="벽 위에 그은 문·창으로 본다"
              onClick={() => store.setOptions({ sketchMode: 'opening' })}
            >
              문·창
            </button>
          </div>
          <span className="sep" />
          <span className="lbl">방 용도</span>
          <select
            aria-label="새로 그릴 실의 용도"
            value={options.roomKind}
            onChange={(e) => store.setOptions({ roomKind: e.target.value as RoomKind })}
            style={{ width: 108, height: 26 }}
          >
            {ROOM_KINDS.map((k) => (
              <option key={k} value={k}>
                {ROOM_KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <span className="lbl">개구부</span>
          <div className="seg" style={{ width: 96 }}>
            <button
              type="button"
              aria-pressed={options.sketchOpening === 'door'}
              onClick={() => store.setOptions({ sketchOpening: 'door' })}
            >
              문
            </button>
            <button
              type="button"
              aria-pressed={options.sketchOpening === 'window'}
              onClick={() => store.setOptions({ sketchOpening: 'window' })}
            >
              창
            </button>
          </div>
        </>
      )}

      {tool === 'room' && (
        <>
          <span className="lbl">용도</span>
          <select
            aria-label="실 용도"
            value={options.roomKind}
            onChange={(e) => store.setOptions({ roomKind: e.target.value as RoomKind })}
            style={{ width: 120, height: 26 }}
          >
            {ROOM_KINDS.map((k) => (
              <option key={k} value={k}>
                {ROOM_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </>
      )}

      {tool === 'door' && (
        <>
          <span className="lbl">종류</span>
          <select
            aria-label="문 종류"
            value={options.doorKind}
            onChange={(e) => store.setOptions({ doorKind: e.target.value as DoorKind })}
            style={{ width: 130, height: 26 }}
          >
            {DOOR_KINDS.map((k) => (
              <option key={k} value={k}>
                {DOOR_KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <span className="lbl">유효 폭</span>
          <input
            type="number"
            aria-label="문 유효 폭(cm)"
            value={options.doorWidth}
            min={60}
            max={280}
            step={5}
            onChange={(e) => store.setOptions({ doorWidth: Number(e.target.value) || 90 })}
            style={{ width: 78, height: 26 }}
          />
          <span className="hint">cm</span>
        </>
      )}

      {tool === 'window' && (
        <>
          <span className="lbl">폭</span>
          <input
            type="number"
            aria-label="창 폭(cm)"
            value={options.windowWidth}
            min={40}
            max={400}
            step={10}
            onChange={(e) => store.setOptions({ windowWidth: Number(e.target.value) || 150 })}
            style={{ width: 78, height: 26 }}
          />
          <span className="hint">cm</span>
        </>
      )}

      {tool === 'facility' && (
        <>
          <span className="lbl">기호</span>
          <select
            aria-label="설비 기호"
            value={options.facility}
            onChange={(e) => store.setOptions({ facility: e.target.value as FacilityType })}
            style={{ width: 150, height: 26 }}
          >
            {FACILITIES.map((k) => (
              <option key={k} value={k}>
                {FACILITY_LABEL[k]}
              </option>
            ))}
          </select>
        </>
      )}

      {tool === 'route' && (
        <>
          <span className="lbl">동선</span>
          <div className="seg" style={{ width: 160 }}>
            <button
              type="button"
              aria-pressed={options.routeKind === 'primary'}
              onClick={() => store.setOptions({ routeKind: 'primary' })}
            >
              주 동선
            </button>
            <button
              type="button"
              aria-pressed={options.routeKind === 'alt'}
              onClick={() => store.setOptions({ routeKind: 'alt' })}
            >
              대체 동선
            </button>
          </div>
          <span className="hint">클릭으로 점을 찍고, 더블클릭 또는 Enter로 끝낸다.</span>
        </>
      )}

      {tool === 'note' && (
        <>
          <span className="lbl">글자 크기</span>
          <input
            type="number"
            aria-label="주기 글자 크기"
            value={options.noteSize}
            min={10}
            max={80}
            step={2}
            onChange={(e) => store.setOptions({ noteSize: Number(e.target.value) || 22 })}
            style={{ width: 70, height: 26 }}
          />
        </>
      )}

      <span className="topbar-spacer" style={{ flex: 1 }} />

      <label className="chk">
        <input type="checkbox" checked={snap} onChange={(e) => store.setSnap(e.target.checked)} />
        스냅
      </label>
      <select
        aria-label="스냅 간격"
        value={snapSize}
        onChange={(e) => store.setSnap(snap, Number(e.target.value))}
        style={{ width: 82, height: 26 }}
        disabled={!snap}
      >
        <option value={1}>1cm</option>
        <option value={5}>5cm</option>
        <option value={10}>10cm</option>
        <option value={25}>25cm</option>
      </select>
    </div>
  );
}
