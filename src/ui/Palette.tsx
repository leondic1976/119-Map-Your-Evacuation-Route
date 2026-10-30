'use client';

/**
 * 팔레트 — 놓을 수 있는 것이 전부 보인다 (설계서 v2.0 §2.2).
 *
 * 「더보기」와 갈래 탭을 없앴다. 방 · 문과 창 · 가구와 가전 · 안전 · 조심할 것 · 사람과 장소 여섯 묶음이
 * 머리글과 함께 한 줄로 늘어서고, 아이는 스크롤해서 고른다. 어른이 못 찾던 소파·책상·냉장고가 바로 보인다.
 * 단추를 누르면 장전되고, 도면을 누르면 표준 크기로 놓인다 (FR-7.1). 캐릭터가 가리키는 항목은 밝게 표시되고
 * 보이는 자리로 스크롤된다 (FR-7.10). 칸에 올리면 오른쪽 도움 패널이 그 물건을 설명한다.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { BLOCKS, REQUIRED_BLOCKS, type BlockCategory, type BlockDef } from '../content';
import { blockHelp } from '../content/blockHelp';
import { checklist } from '../core/checklist';
import { useKids, type KidsTool } from '../store/kidsStore';
import { OpeningArt, PointArt } from './BlockArt';

/** 묶음 순서 — 아이가 집을 만드는 순서와 같다 */
const GROUPS: { key: BlockCategory; easy: string; normal: string; note: string }[] = [
  { key: 'room', easy: '방', normal: '실', note: '놓은 뒤 끌어서 옮기고 테두리 점으로 크기를 바꿔' },
  { key: 'opening', easy: '문과 창', normal: '개구부', note: '방의 벽을 눌러 붙여' },
  { key: 'furniture', easy: '가구와 가전', normal: '가구·가전', note: '진짜 있는 것을 방 안에 놓아' },
  { key: 'safety', easy: '안전', normal: '피난설비', note: '진짜 자리를 어른과 확인해' },
  { key: 'hazard', easy: '조심할 것', normal: '위험원', note: '불이 날 수 있는 것' },
  { key: 'marker', easy: '사람과 장소', normal: '표시', note: '누가 어디 있는지' },
];

export const ROOM_SWATCH: Record<string, string> = {
  bedroom: '#fff3d6',
  living: '#e8f4e2',
  kitchen: '#ffe4d1',
  bath: '#dcefff',
  entry: '#efe9f7',
  balcony: '#e6f7f4',
  utility: '#f0f0f0',
  closet: '#eee5d9',
  other: '#f1ebf4',
  corridor: '#f6f6ee',
  stair: '#e0e7ef',
  refuge_lobby: '#dfe9e0',
  elevator_hall: '#f3e2e2',
};

const TOOLS: { key: KidsTool; easy: string; normal: string; hint: string }[] = [
  { key: 'select', easy: '고르기', normal: '선택', hint: '눌러서 고르고, 끌어서 옮긴다.' },
  { key: 'route', easy: '나가는 길', normal: '피난경로', hint: '불났을 때 나갈 길이다. 출발할 칸부터 끌어서 잇는다.' },
  { key: 'erase', easy: '지우개', normal: '삭제', hint: '눌러서 지운다.' },
];

/** 트인 주방 — 블록 목록에는 없는 팔레트 전용 칸. 주방을 벽 없는 구역으로 장전한다 */
const KITCHEN_OPEN: BlockDef = {
  ...(BLOCKS.find((b) => b.id === 'kitchen') as BlockDef),
  id: 'kitchen_open',
  label: '트인 주방(부엌)',
  easy: '트인 주방',
  required: false,
};

export default function Palette() {
  const tool = useKids((s) => s.tool);
  const armed = useKids((s) => s.armed);
  const gradeMode = useKids((s) => s.profile.gradeMode);
  const style = useKids((s) => s.profile.blockStyle);
  const layer = useKids((s) => s.layer);
  const mode = useKids((s) => s.mode);
  const step = useKids((s) => s.step);
  const paletteHl = useKids((s) => s.highlight?.paletteItem ?? null);
  const plan = useKids((s) => s.plan);
  const setTool = useKids((s) => s.setTool);
  const arm = useKids((s) => s.arm);
  const setPeek = useKids((s) => s.setPeek);
  const easy = gradeMode === 'easy';
  const disabled = mode !== 'edit';
  const adjustOnly = step === 'structure';
  /* 만들기 단계에서는 그 단계에 맞는 묶음만 보인다 — 한 번에 한 가지씩 (v1.9 §15) */
  const stageCats: BlockCategory[] | null = adjustOnly
    ? []
    : step === 'spaces'
      ? ['room', 'opening']
      : step === 'furniture'
        ? ['furniture', 'hazard']
        : step === 'safety'
          ? ['safety']
          : null;

  /* 캐릭터가 가리킨 칸이 보이는 자리로 온다 */
  useEffect(() => {
    if (!paletteHl) return;
    const el = document.querySelector(`[data-coach="kids-palette"] [data-block-id="${paletteHl}"]`);
    if (el instanceof HTMLElement) el.scrollIntoView({ block: 'nearest' });
  }, [paletteHl]);

  const done = new Set(checklist(plan, REQUIRED_BLOCKS).filter((i) => i.present).map((i) => i.id));
  const groups = (stageCats ? GROUPS.filter((g) => stageCats.includes(g.key)) : GROUPS).map((g) => {
    let items = BLOCKS.filter((b) => b.category === g.key);
    if (step === 'safety') items = items.filter((b) => b.id === 'extinguisher');
    if (g.key === 'room') {
      const at = items.findIndex((b) => b.id === 'kitchen');
      items = [...items.slice(0, at + 1), KITCHEN_OPEN, ...items.slice(at + 1)];
    }
    /* 순서는 콘텐츠 그대로 — 여닫이문·미닫이문처럼 짝이 나란히 있어야 한다. 꼭 있어야 하는 것은 표시로 구분한다 */
    return { ...g, items };
  });
  /*
   * 키보드 — 팔레트 전체가 Tab 한 번이고, 안에서는 방향키로 옮긴다 (설계서 v2.0 §9).
   * 칸이 50개가 넘어 하나씩 Tab 으로 지나가면 도면까지 못 간다.
   */
  const flat = groups.flatMap((g) => g.items.map((b) => b.id));
  const [cursor, setCursor] = useState(0);
  const cursorId = flat[Math.min(cursor, Math.max(0, flat.length - 1))];
  const moveCursor = useCallback((delta: number) => {
    const at = flat.indexOf(cursorId);
    const next = Math.min(flat.length - 1, Math.max(0, (at < 0 ? 0 : at) + delta));
    setCursor(next);
    const el = document.querySelector(`[data-coach="kids-palette"] [data-block-id="${flat[next]}"]`);
    if (el instanceof HTMLElement) el.focus();
  }, [flat, cursorId]);
  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') moveCursor(1);
    else if (e.key === 'ArrowLeft') moveCursor(-1);
    else if (e.key === 'ArrowDown') moveCursor(3);
    else if (e.key === 'ArrowUp') moveCursor(-3);
    else if (e.key === 'Home') moveCursor(-flat.length);
    else if (e.key === 'End') moveCursor(flat.length);
    else return;
    e.preventDefault();
  };

  const isOn = (b: BlockDef): boolean => {
    if (!armed) return false;
    if (b.id === 'kitchen_open') return armed.id === 'kitchen' && armed.roomMode === 'zone';
    return armed.id === b.id && armed.roomMode !== 'zone';
  };
  const pick = (b: BlockDef) => {
    if (isOn(b)) {
      arm(null);
      return;
    }
    if (b.id === 'kitchen_open') arm({ category: 'room', id: 'kitchen', roomMode: 'zone' });
    else arm({ category: b.category, id: b.id });
  };
  const armedDef = armed ? (armed.roomMode === 'zone' && armed.id === 'kitchen' ? KITCHEN_OPEN : BLOCKS.find((b) => b.id === armed.id)) : undefined;

  return (
    <aside className={`k-palette${disabled ? ' k-disabled' : ''}`} aria-label="놓을 것 팔레트" data-coach="kids-palette">
      <div className="k-tools" role="group" aria-label="도구">
        {TOOLS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`k-tool${tool === t.key && !armed ? ' on' : ''}`}
            aria-pressed={tool === t.key && !armed}
            title={t.hint}
            disabled={disabled}
            data-coach={`kids-tool-${t.key}`}
            onClick={() => {
              arm(null);
              setTool(t.key);
            }}
          >
            <ToolIcon k={t.key} />
            <span>{easy ? t.easy : t.normal}</span>
          </button>
        ))}
      </div>

      {adjustOnly ? (
        <div className="k-adjust-note">
          <b>방·문·창을 눌러 조정해요</b>
          <span>방은 끌어서 옮기고 모서리 점으로 크기를 바꿔요. 문과 창은 위쪽에서 너비를 골라요.</span>
        </div>
      ) : (
        <div className="k-pal-scroll" data-coach="kids-palette-list" onKeyDown={onListKey}>
          {groups.map((g) => (
            <section key={g.key} className="k-pal-group" data-palette-group={g.key} aria-labelledby={`k-pal-${g.key}`}>
              <h3 id={`k-pal-${g.key}`}>
                <span>{easy ? g.easy : g.normal}</span>
                <small>{g.note}</small>
              </h3>
              <div className="k-blocks">
                {g.items.map((b) => (
                  <PaletteButton
                    key={b.id}
                    def={b}
                    on={isOn(b)}
                    hl={paletteHl === b.id}
                    style={style}
                    easy={easy}
                    disabled={disabled}
                    onPick={pick}
                    onPeek={setPeek}
                    placed={done.has(b.id)}
                    common={b.tags.includes('common') && layer !== 'common'}
                    tabStop={b.id === cursorId}
                    onFocusTile={() => setCursor(flat.indexOf(b.id))}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {armed && armedDef && (
        <div className="k-armed" role="status" data-coach="kids-armed">
          <b>{easy ? armedDef.easy : armedDef.label}</b>
          <span>{blockHelp(armedDef.id, armedDef.category).how[easy ? 'easy' : 'normal']}</span>
          <button type="button" className="k-link" onClick={() => arm(null)}>
            그만
          </button>
        </div>
      )}
    </aside>
  );
}

function PaletteButton({
  def,
  on,
  hl,
  style,
  easy,
  disabled,
  common,
  placed,
  onPick,
  onPeek,
  tabStop,
  onFocusTile,
}: {
  def: BlockDef;
  on: boolean;
  hl: boolean;
  style: 'kid' | 'blueprint';
  easy: boolean;
  disabled: boolean;
  common?: boolean;
  /** 필수 항목이 이미 도면에 있는가 */
  placed?: boolean;
  onPick: (b: BlockDef) => void;
  onPeek: (id: string | null) => void;
  /** 팔레트 전체에서 Tab 이 멈추는 한 칸인가 */
  tabStop: boolean;
  onFocusTile: () => void;
}) {
  const help = blockHelp(def.id, def.category);
  const name = easy ? def.easy : def.label;
  return (
    <button
      type="button"
      className={`k-block${on ? ' on' : ''}${hl ? ' k-hl' : ''}${def.required ? ' k-req' : ''}`}
      aria-pressed={on}
      data-block-id={def.id}
      data-block-category={def.category}
      data-required={def.required ? (placed ? 'done' : 'todo') : undefined}
      title={`${name} — ${help.what[easy ? 'easy' : 'normal']}${def.required ? (placed ? ' 이미 놓았다.' : ' 꼭 있어야 하는 것이다.') : ''}`}
      disabled={disabled}
      tabIndex={tabStop ? 0 : -1}
      onClick={() => onPick(def)}
      onPointerEnter={() => onPeek(def.id)}
      onPointerLeave={() => onPeek(null)}
      onFocus={() => {
        onPeek(def.id);
        onFocusTile();
      }}
      onBlur={() => onPeek(null)}
    >
      {def.required && (
        <span className="k-req-mark" aria-hidden="true">
          {placed ? (
            <svg viewBox="0 0 12 12" width="12" height="12">
              <circle cx={6} cy={6} r={5} fill="#0e7c4f" />
              <path d="M3.4 6.2l1.9 1.9 3.4-3.8" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12" width="12" height="12">
              <circle cx={6} cy={6} r={5} fill="#fff" stroke="#8f620d" strokeWidth={1.6} strokeDasharray="2.4 1.8" />
            </svg>
          )}
        </span>
      )}
      <span className="k-block-art">
        <BlockPreview def={def} style={style} />
      </span>
      <span className="k-block-name">
        {name}
        {common && <small> (집 밖)</small>}
      </span>
    </button>
  );
}

export function BlockPreview({ def, style, size = 40 }: { def: BlockDef; style: 'kid' | 'blueprint'; size?: number }) {
  if (def.id === 'kitchen_open') {
    return (
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
        <rect x={4} y={6} width={32} height={28} fill={style === 'kid' ? ROOM_SWATCH.kitchen : '#fff'} />
        <path d="M4 6h32v28H4" fill="none" stroke="#2a3038" strokeWidth={3} />
        <path d="M4 10v20" stroke="#2a3038" strokeWidth={2} strokeDasharray="3 3" />
      </svg>
    );
  }
  if (def.category === 'room') {
    return (
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
        <rect x={4} y={6} width={32} height={28} fill={style === 'kid' ? (ROOM_SWATCH[def.id] ?? '#fff') : '#fff'} stroke="#2a3038" strokeWidth={3} />
      </svg>
    );
  }
  if (def.category === 'opening') {
    return (
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
        <path d="M2 14 H38" stroke="#2a3038" strokeWidth={3} />
        <g transform="translate(20 14)">
          <OpeningArt kind={def.id} len={26} style={style} />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <PointArt subKind={def.id} w={40} h={40} style={style} />
    </svg>
  );
}

function ToolIcon({ k }: { k: KidsTool }) {
  const p = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (k) {
    case 'select':
      return (
        <svg {...p}>
          <path d="M5 3l14 8-6 2-2 6z" />
        </svg>
      );
    case 'route':
      return (
        <svg {...p}>
          <path d="M4 18 H10 V10 H16 V5" />
          <path d="M13 5l3-3 3 3" />
          <circle cx={4} cy={18} r={2} />
        </svg>
      );
    case 'erase':
      return (
        <svg {...p}>
          <path d="M4 15l9-9 6 6-6 6H7z" />
          <path d="M9 21h11" />
        </svg>
      );
    default:
      return null;
  }
}
