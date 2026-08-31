'use client';

/**
 * 팔레트 — 자주 쓰는 7종 + 더보기 = 8칸 (FR-7.8).
 * 단추를 누르면 장전되고, 도면을 누르면 표준 크기로 놓인다 (FR-7.1).
 * 캐릭터가 가리키는 항목은 밝게 표시된다 (FR-7.10).
 */
import React, { useEffect, useState } from 'react';
import { BLOCKS, PALETTE_BASIC, REQUIRED_BLOCKS, type BlockCategory, type BlockDef } from '../content';
import { checklist } from '../core/checklist';
import { useKids, type KidsTool } from '../store/kidsStore';
import { OpeningArt, PointArt } from './BlockArt';

const CATS: { key: BlockCategory; easy: string; normal: string }[] = [
  { key: 'room', easy: '방', normal: '실' },
  { key: 'opening', easy: '문·창', normal: '개구부' },
  { key: 'safety', easy: '안전', normal: '피난설비' },
  { key: 'furniture', easy: '가구', normal: '가구' },
  { key: 'hazard', easy: '조심', normal: '위험원' },
  { key: 'marker', easy: '표시', normal: '표시' },
];

const ROOM_SWATCH: Record<string, string> = {
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
  /*
   * "길 그리기"는 무슨 길인지가 빠져 있었다. 이 앱이 그리는 것은 불이 났을 때
   * 밖으로 나가는 길이다. 쉬움은 아이가 쓰는 말로, 보통은 소방 용어로 적는다.
   */
  { key: 'route', easy: '나가는 길', normal: '피난경로', hint: '불났을 때 나갈 길이다. 출발할 칸부터 끌어서 잇는다.' },
  { key: 'erase', easy: '지우개', normal: '삭제', hint: '눌러서 지운다.' },
];

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
  const [more, setMore] = useState(false);
  const [cat, setCat] = useState<BlockCategory>('safety');
  const easy = gradeMode === 'easy';
  const disabled = mode !== 'edit';
  const adjustOnly = step === 'structure';
  const stageCats: BlockCategory[] | null = adjustOnly
    ? []
    : step === 'spaces'
      ? ['room', 'opening']
      : step === 'furniture'
        ? ['furniture', 'hazard']
        : step === 'safety'
          ? ['safety']
        : null;

  /* 캐릭터가 가리킨 항목이 더보기 안에 있으면 그때 한 번 펼쳐 준다. 그 뒤로는 아이가 고르는 대로다 */
  useEffect(() => {
    if (!paletteHl) return;
    const def = BLOCKS.find((b) => b.id === paletteHl);
    if (!def || PALETTE_BASIC.includes(def.id)) return;
    setMore(true);
    setCat(def.category);
  }, [paletteHl]);
  useEffect(() => {
    if (step === 'spaces') setCat('room');
    else if (step === 'furniture') setCat('furniture');
    else if (step === 'safety') setCat('safety');
  }, [step]);
  const showMore = adjustOnly ? false : stageCats ? true : more;
  const activeCat = stageCats?.includes(cat) ? cat : (stageCats?.[0] ?? cat);

  const basics = PALETTE_BASIC
    .map((id) => BLOCKS.find((b) => b.id === id))
    .filter((b): b is BlockDef => b !== undefined && (!stageCats || stageCats.includes(b.category)) && (step !== 'safety' || b.id === 'extinguisher'));
  const moreItems = adjustOnly ? [] : BLOCKS.filter((b) => b.category === activeCat && !PALETTE_BASIC.includes(b.id) && (step !== 'safety' || b.id === 'extinguisher'));
  const categories = stageCats ? CATS.filter((item) => stageCats.includes(item.key)) : CATS;
  /* 필수 물건이 도면에 있는지 — 팔레트에 채움 표시로 보인다 (설계서 v1.2 §1.4) */
  const done = new Set(checklist(plan, REQUIRED_BLOCKS).filter((i) => i.present).map((i) => i.id));

  const pick = (b: BlockDef) => {
    const on = armed?.id === b.id && armed.roomMode !== 'zone';
    arm(on ? null : { category: b.category, id: b.id });
  };

  return (
    <aside className={`k-palette${disabled ? ' k-disabled' : ''}`} aria-label="블록 팔레트" data-coach="kids-palette">
      <div className="k-tools">
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

      {adjustOnly && <div className="k-adjust-note"><b>방·문·창을 눌러 조정해요</b><span>방은 끌어서 옮기고 모서리 점으로 크기를 바꿔요. 문과 창은 위쪽에서 너비를 골라요.</span></div>}

      <div className="k-blocks k-basic" role="group" aria-label="기본 블록">
        {basics.map((b) => (
          <PaletteButton key={b.id} def={b} on={armed?.id === b.id && armed.roomMode !== 'zone'} hl={paletteHl === b.id} style={style} easy={easy} disabled={disabled} onPick={pick} placed={done.has(b.id)} />
        ))}
        {!stageCats && (
          <button type="button" className={`k-block k-more${showMore ? ' on' : ''}`} aria-expanded={showMore} disabled={disabled} data-block-id="more" onClick={() => setMore((v) => !v)}>
            <span className="k-block-art">
              <svg viewBox="0 0 40 40" width="36" height="36" aria-hidden="true">
                <circle cx={12} cy={20} r={3.2} fill="#2a3038" />
                <circle cx={20} cy={20} r={3.2} fill="#2a3038" />
                <circle cx={28} cy={20} r={3.2} fill="#2a3038" />
              </svg>
            </span>
            <span className="k-block-name">{showMore ? '접기' : '더보기'}</span>
          </button>
        )}
      </div>

      {showMore && (
        <div className="k-more-panel">
          <div className="k-cats" role="tablist" aria-label="블록 갈래">
            {categories.map((c) => (
              <button key={c.key} type="button" role="tab" aria-selected={activeCat === c.key} className={`k-cat${activeCat === c.key ? ' on' : ''}`} onClick={() => setCat(c.key)}>
                {easy ? c.easy : c.normal}
              </button>
            ))}
          </div>
          <div className="k-more-scroll" role="tabpanel">
            {[true, false].map((req) => {
              const items = moreItems.filter((b) => b.required === req);
              if (items.length === 0) return null;
              return (
                <section key={String(req)} className="k-block-group">
                  <h3>{req ? (easy ? '꼭 있어야 하는 것' : '필수') : easy ? '있을 수 있는 것' : '선택'}</h3>
                  <div className="k-blocks">
                    {items.map((b) => (
                      <PaletteButton key={b.id} def={b} on={armed?.id === b.id && armed.roomMode !== 'zone'} hl={paletteHl === b.id} style={style} easy={easy} disabled={disabled} onPick={pick} placed={done.has(b.id)} common={b.tags.includes('common') && layer !== 'common'} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {armed && (
        <div className="k-armed" role="status">
          {armed.category === 'room' ? armed.roomMode === 'zone' ? '빈 바닥에서 끌어 트인 주방(부엌) 범위를 그려. 다시 그리면 자리와 크기가 바뀌어.' : '도면을 누르면 방이 놓여. 끌면 크기를 정할 수 있어.' : armed.category === 'opening' ? '방의 벽을 눌러 놓자.' : '놓을 칸을 누르자.'}
          {' '}
          <b>한 번에 하나씩 놓여.</b> 또 놓으려면 여기서 다시 고르자.
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
}) {
  return (
    <button
      type="button"
      className={`k-block${on ? ' on' : ''}${hl ? ' k-hl' : ''}${def.required ? ' k-req' : ''}`}
      aria-pressed={on}
      data-block-id={def.id}
      data-required={def.required ? (placed ? 'done' : 'todo') : undefined}
      title={def.required ? `${hintFor(def, easy)} 꼭 있어야 하는 것이다.${placed ? ' 이미 놓았다.' : ''}` : hintFor(def, easy)}
      disabled={disabled}
      onClick={() => onPick(def)}
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
        {easy ? def.easy : def.label}
        {common && <small> (집 밖)</small>}
      </span>
    </button>
  );
}

function hintFor(b: BlockDef, easy: boolean): string {
  if (b.id === 'kitchen') return easy ? '벽과 문이 있는 주방(부엌)이야. 대부분의 집은 위쪽 트인 주방(부엌)을 골라.' : '벽과 문으로 나뉜 주방(부엌)입니다. 개방형은 빠른 추가에서 범위를 지정합니다.';
  if (b.category === 'room') return easy ? '도면을 누르면 방이 놓인다.' : '클릭하면 표준 크기로 놓이고, 드래그하면 그 크기로 놓인다.';
  if (b.id === 'door') return easy ? '앞뒤로 여는 문이다. 방의 벽을 누르자.' : '경첩으로 여는 방문이다. 방 경계선에 놓는다.';
  if (b.id === 'sliding_door') return easy ? '옆으로 미는 문이다. 방의 벽을 누르자.' : '옆으로 미는 방문이다. 방 경계선에 놓는다.';
  if (b.id === 'window') return easy ? '앞뒤로 여는 창이다. 바깥 벽을 누르자.' : '경첩으로 여는 창이다. 외벽에 놓는다.';
  if (b.id === 'sliding_window') return easy ? '옆으로 미는 창이다. 바깥 벽을 누르자.' : '옆으로 미는 창이다. 외벽에 놓는다.';
  if (b.category === 'opening') return easy ? '방의 벽을 눌러 놓는다.' : '방 경계선(벽면)에만 놓인다.';
  if (b.tags.includes('adult')) return '어른과 함께 쓰는 설비다.';
  return easy ? '놓을 칸을 누른다.' : '셀 중심에 놓인다.';
}

function BlockPreview({ def, style }: { def: BlockDef; style: 'kid' | 'blueprint' }) {
  if (def.category === 'room') {
    return (
      <svg viewBox="0 0 40 40" width="36" height="36" aria-hidden="true">
        <rect x={4} y={6} width={32} height={28} fill={style === 'kid' ? (ROOM_SWATCH[def.id] ?? '#fff') : '#fff'} stroke="#2a3038" strokeWidth={3} />
      </svg>
    );
  }
  if (def.category === 'opening') {
    return (
      <svg viewBox="0 0 40 40" width="36" height="36" aria-hidden="true">
        <path d="M2 14 H38" stroke="#2a3038" strokeWidth={3} />
        <g transform="translate(20 14)">
          <OpeningArt kind={def.id} len={26} style={style} />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" width="36" height="36" aria-hidden="true">
      <PointArt subKind={def.id} w={40} h={40} style={style} />
    </svg>
  );
}

function ToolIcon({ k }: { k: KidsTool }) {
  const p = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
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
