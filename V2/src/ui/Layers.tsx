/**
 * 레이어 — 아파트 형태와 가구는 필요할 때만 여는 판에 있다. 고르지 않아도 지도를 끝까지 만들 수 있다.
 * 왼쪽 패널에는 여는 단추만 둔다.
 */
import { useEffect, useRef, useState } from 'react';
import { ITEM_SIZES, itemHitAt, itemSize, moveItem, placeItem, removeItem, removeItemAt, resizeItem, turnItem } from '../core/items';
import { ARROW, type ArrowDir } from '../core/path';
import type { ItemKind, Layout, Plan, Pt } from '../core/types';
import { BANDS } from '../content/bands';
import { HOMES, type Home } from '../content/homes';
import { ITEM_GROUPS, ITEMS } from '../content/items';
import { templatesFor } from '../content/templates';
import { segEdges } from '../content/templates';
import { applyHome, applyTemplate, commit, currentBand, say } from '../store/app';
import { edgeEnds } from '../core/grid';
import { buildHome } from '../content/homes';
import { IconClose } from './art';
import { useArrowKeys, useHold } from './ArrowPad';
import { CursorGhost } from './CursorGhost';
import { ItemShape, unitOf } from './PlanView';

export type LayerId = 'home' | 'items';

export const LAYER_NAME: Record<LayerId, string> = { home: '아파트 모양', items: '가구' };

function HomeThumb({ home }: { home: Home }) {
  const { walls } = buildHome(home, 12, 8);
  return (
    <svg viewBox="-1 -1 14 10" width="84" height="60" aria-hidden="true">
      {walls.map((k) => {
        const [a, b] = edgeEnds(k);
        return <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#33363b" strokeWidth=".45" strokeLinecap="round" />;
      })}
    </svg>
  );
}

function LineThumb({ lines, cols, rows }: { lines: string[]; cols: number; rows: number }) {
  return (
    <svg viewBox={`-1 -1 ${cols + 2} ${rows + 2}`} width="84" height="60" aria-hidden="true">
      {lines.map((k) => {
        const [a, b] = edgeEnds(k);
        return <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#33363b" strokeWidth=".45" strokeLinecap="round" />;
      })}
    </svg>
  );
}

/** 지금 놓는 중인 것. `remove` 는 치우는 중이다 */
export type Placing = ItemKind | 'remove' | null;

export const MOVE_KEYS: { dir: ArrowDir; label: string; d: string }[] = [
  { dir: 'up', label: '위로 옮기기', d: 'M14 23V5M6 13l8-8 8 8' },
  { dir: 'left', label: '왼쪽으로 옮기기', d: 'M23 14H5M13 6l-8 8 8 8' },
  { dir: 'right', label: '오른쪽으로 옮기기', d: 'M5 14h18M15 6l8 8-8 8' },
  { dir: 'down', label: '아래로 옮기기', d: 'M14 5v18M6 15l8 8 8-8' },
];

/** 가구를 한 걸음 옮기는 단추. 누르고 있으면 이어서 옮긴다 */
export function MoveKey({ dir, label, d, onMove, prefix = 'item' }: { dir: ArrowDir; label: string; d: string; onMove: (dir: ArrowDir) => void; prefix?: string }) {
  const hold = useHold(() => onMove(dir));
  return (
    <button type="button" className="pad-btn go" style={{ gridArea: dir }} data-testid={`${prefix}-move-${dir}`} aria-label={label} {...hold}>
      <svg viewBox="0 0 28 28" width="30" height="30" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );
}

/** `onBusy` 는 판을 열거나 가구를 고를 때 불린다 — 방 넣기처럼 함께 쓸 수 없는 것을 닫게 한다 */
export function useLayers(plan: Plan, layout: Layout, onBusy?: () => void) {
  const [open, setOpen] = useState<LayerId | null>(null);
  const [placing, setPlacing] = useState<Placing>(null);
  // 고쳐 볼 가구 — 막 놓았거나 눌러 고른 것이다. 돌리고 크기를 바꾸고 치운다
  const [selected, setSelected] = useState<number | null>(null);
  const picked = selected !== null ? plan.items?.[selected] : undefined;
  useEffect(() => {
    if (selected !== null && !plan.items?.[selected]) setSelected(null);
  }, [plan.items, selected]);
  // 지금 그린 선이 지워지므로 한 번 묻는다
  const [asking, setAsking] = useState<{ id: string; name: string; apply: (id: string) => void } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(null);
        setAsking(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  /** 지도를 눌렀을 때 — 가구를 놓는 중이면 true 를 돌려준다 */
  const tapMap = (p: Pt): boolean => {
    if (!placing) return false;
    if (placing === 'remove') {
      commit(removeItemAt(plan, p, Math.max(1, plan.density ?? 1) * 0.6));
      return true;
    }
    const res = placeItem(plan, layout, placing, p);
    if (res.ok) {
      commit(res.plan);
      // 하나 놓으면 끝난다. 고른 것을 잊어도 다음 손길이 그대로 그리기가 된다
      setPlacing(null);
      // 막 놓은 가구는 바로 돌리고 크기를 바꿀 수 있다
      setSelected((res.plan.items?.length ?? 1) - 1);
    } else say(res.why === 'door' ? 'item-door' : 'mark-need-inside');
    return true;
  };

  /** 아파트 모양 고르기 — 그린 선이 있으면 먼저 묻는다 */
  const pickShape = (id: string, name: string, apply: (id: string) => void) => {
    if (plan.walls.length === 0) {
      apply(id);
      setOpen(null);
    } else setAsking({ id, name, apply });
  };

  // 놓은 가구는 끌어서 옮긴다(대장 #158). 그림 어디를 잡아도 잡히고, 움직이지 않고 떼면 고른 것이다
  const grab = useRef<{ index: number; from: Pt; off: Pt; moved: boolean } | null>(null);
  const [dragTo, setDragTo] = useState<Pt | null>(null);
  /** 지도 위의 손길을 먼저 받는다. 가구를 잡았거나 끄는 중이면 true 를 돌려준다. reach 는 가구 둘레로 더 잡아 주는 폭(칸)이다 */
  const pointer = (kind: 'down' | 'move' | 'up' | 'cancel', p: Pt, reach = 0.12): boolean => {
    if (placing) return false;
    const k = Math.max(1, plan.density ?? 1);
    if (kind === 'down') {
      const index = itemHitAt(plan, p, (item) => ITEMS[item], reach * k);
      const item = plan.items?.[index];
      grab.current = item ? { index, from: p, off: { x: item.x - p.x, y: item.y - p.y }, moved: false } : null;
      return Boolean(item);
    }
    const held = grab.current;
    if (!held) return false;
    const to = { x: p.x + held.off.x, y: p.y + held.off.y };
    if (kind === 'move') {
      if (held.moved || Math.hypot(p.x - held.from.x, p.y - held.from.y) > 0.2 * k) {
        held.moved = true;
        setDragTo(to);
      }
      return true;
    }
    grab.current = null;
    setDragTo(null);
    if (kind === 'cancel') return true;
    if (held.moved) {
      const res = moveItem(plan, layout, held.index, to);
      if (res.ok) commit(res.plan);
      else say(res.why === 'door' ? 'item-door' : 'mark-need-inside');
    }
    setSelected(held.index);
    return true;
  };
  /** 끄는 동안 보이는 지도 — 잡은 가구가 손을 따라온다 */
  const dragged = grab.current;
  const shown: Plan = dragged && dragTo ? { ...plan, items: (plan.items ?? []).map((it, i) => (i === dragged.index ? { ...it, x: dragTo.x, y: dragTo.y } : it)) } : plan;

  const buttons = (
    <>
      <button type="button" className={open === 'home' ? 'tool on' : 'tool'} data-testid="layer-home" aria-expanded={open === 'home'} onClick={() => { onBusy?.(); setPlacing(null); setSelected(null); setOpen(open === 'home' ? null : 'home'); }}>
        {LAYER_NAME.home}
      </button>
      <button type="button" className={open === 'items' || placing ? 'tool on' : 'tool'} data-testid="layer-items" aria-expanded={open === 'items'} onClick={() => { onBusy?.(); setOpen(open === 'items' ? null : 'items'); }}>
        {LAYER_NAME.items}
      </button>
      {placing && (
        <button type="button" className="tool" data-testid="placing-stop" onClick={() => setPlacing(null)}>
          {placing === 'remove' ? '치우기 끝' : `${ITEMS[placing].label} 그만`}
        </button>
      )}
    </>
  );

  const panel = open && (
    <div className="layer" role="dialog" aria-label={LAYER_NAME[open]} data-testid={`layer-${open}-panel`}>
      <button type="button" className="x" aria-label="닫기" data-testid="layer-close" onClick={() => { setOpen(null); setAsking(null); }}><IconClose /></button>
      <h3>{LAYER_NAME[open]}</h3>
      <p className="layer-note">{open === 'home' ? '고르면 벽과 칸 이름이 깔려. 안 골라도 돼.' : '고른 뒤 지도를 눌러 놓아. 안 놓아도 돼.'}</p>
      {open === 'home' && asking && (
        <div className="layer-ask" role="group" aria-label="아파트 모양 깔기" data-testid="shape-ask">
          <p>지금 그린 선이 지워져. 「{asking.name}」을 깔까?</p>
          <div className="tool-row across">
            <button type="button" className="tool" data-testid="shape-yes" onClick={() => { asking.apply(asking.id); setAsking(null); setOpen(null); }}>깔기</button>
            <button type="button" className="tool" data-testid="shape-no" onClick={() => setAsking(null)}>그대로 두기</button>
          </div>
        </div>
      )}
      {open === 'home' ? (
        <>
          <div className="layer-grid">
            {HOMES.map((home) => (
              <button type="button" key={home.id} className="layer-card" data-testid={`home-${home.id}`} onClick={() => pickShape(home.id, home.name, applyHome)}>
                <HomeThumb home={home} />
                <b>{home.name}</b>
                <small>{home.note}</small>
              </button>
            ))}
          </div>
          <h4>다른 모양</h4>
          <div className="layer-grid">
            {templatesFor(currentBand()).map((tpl) => (
              <button type="button" key={tpl.id} className="layer-card" data-testid={`tpl-${tpl.id}`} onClick={() => pickShape(tpl.id, tpl.name, applyTemplate)}>
                <LineThumb lines={[...segEdges(tpl.outer), ...segEdges(tpl.inner)]} cols={BANDS[currentBand()].cols} rows={BANDS[currentBand()].rows} />
                <b>{tpl.name}</b>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {(plan.items?.length ?? 0) > 0 && (
            <button type="button" className="tool wide" data-testid="item-remove" onClick={() => { setPlacing('remove'); setOpen(null); }}>놓은 것 치우기</button>
          )}
          {ITEM_GROUPS.map((group) => (
            <section key={group.label}>
              <h4>{group.label}</h4>
              <div className="layer-grid items">
                {group.items.map((kind) => (
                  <button type="button" key={kind} className={placing === kind ? 'layer-card on' : 'layer-card'} data-testid={`item-${kind}`} onClick={() => { setPlacing(kind); setSelected(null); setOpen(null); }}>
                    <svg viewBox="-60 -60 120 120" width="44" height="44" aria-hidden="true"><ItemShape kind={kind} /></svg>
                    <b>{ITEMS[kind].label}</b>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );

  const banner = placing && (
    <p className="map-note" data-testid="placing-note" role="status">
      {placing === 'remove' ? '치울 가구를 눌러 봐.' : `${ITEMS[placing].label}: 놓을 자리를 눌러 봐.`}
    </p>
  );

  const sizeAt = picked ? ITEM_SIZES.reduce((best, s, i) => (Math.abs(s - itemSize(picked)) < Math.abs(ITEM_SIZES[best]! - itemSize(picked)) ? i : best), 0) : 0;
  const u = unitOf(plan);

  /** 고른 가구를 한 걸음 옮긴다 — 처음 네모 반 칸씩이다. 칸 밖이나 문 앞으로는 가지 않는다 */
  const nudge = (dir: ArrowDir) => {
    if (selected === null || !picked) return;
    const k = Math.max(1, plan.density ?? 1);
    const res = moveItem(plan, layout, selected, { x: picked.x + ARROW[dir].x * 0.5 * k, y: picked.y + ARROW[dir].y * 0.5 * k });
    if (res.ok) commit(res.plan);
    else say(res.why === 'door' ? 'item-door' : 'mark-need-inside');
  };
  const fixing = Boolean(picked) && selected !== null && !placing && !open;
  // 판이 떠 있는 동안에는 키보드 방향키도 가구를 옮긴다
  useArrowKeys(nudge, fixing);
  useEffect(() => {
    if (!fixing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fixing]);

  /**
   * 가구 고치기 판 — 고른 가구 옆에 떠서 옮기고, 동서남북으로 돌리고, 키우고 줄이고, 치운다(대장 #157 · #158).
   * 가구를 가리지 않게 가구가 있는 쪽의 반대편에 뜬다.
   */
  const bar = fixing && picked && selected !== null && (
    <div className={picked.x > plan.cols / 2 ? 'item-pad left' : 'item-pad'} role="dialog" aria-label={`${ITEMS[picked.kind].label} 고치기`} data-testid="item-bar" data-kind={picked.kind}>
      <button type="button" className="x" aria-label="닫기" data-testid="item-close" onClick={() => setSelected(null)}><IconClose /></button>
      <h3>{ITEMS[picked.kind].label} 고치기</h3>
      <div className="item-keys">
        <button type="button" className="tool" style={{ gridArea: 'tl' }} data-testid="item-turn-left" aria-label="왼쪽으로 돌리기" onClick={() => commit(turnItem(plan, selected, -1))}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M19 12a7 7 0 1 0-3 5.7M19 12V6M19 12h-6" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          왼쪽으로
        </button>
        <button type="button" className="tool" style={{ gridArea: 'tr' }} data-testid="item-turn" aria-label="오른쪽으로 돌리기" onClick={() => commit(turnItem(plan, selected))}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M5 12a7 7 0 1 1 3 5.7M5 12V6M5 12h6" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          오른쪽으로
        </button>
        {MOVE_KEYS.map((key) => <MoveKey key={key.dir} {...key} onMove={nudge} />)}
        <span className="item-face" style={{ gridArea: 'face' }} aria-hidden="true">
          <svg viewBox="-70 -70 140 140" width="52" height="52"><g transform={`rotate(${picked.angle})`}><ItemShape kind={picked.kind} /></g></svg>
        </span>
        <button type="button" className="tool" style={{ gridArea: 'sm' }} data-testid="item-smaller" disabled={sizeAt === 0} onClick={() => commit(resizeItem(plan, selected, -1))}>작게</button>
        <button type="button" className="tool" style={{ gridArea: 'bg' }} data-testid="item-bigger" disabled={sizeAt === ITEM_SIZES.length - 1} onClick={() => commit(resizeItem(plan, selected, 1))}>크게</button>
      </div>
      <p className="item-hint">가구를 끌어도 옮겨져.</p>
      <div className="tool-row across">
        <button type="button" className="tool" data-testid="item-delete" onClick={() => { commit(removeItem(plan, selected)); setSelected(null); }}>치우기</button>
        <button type="button" className="tool on" data-testid="item-ok" onClick={() => setSelected(null)}>다 됐어</button>
      </div>
    </div>
  );

  /** 고른 가구 둘레의 점선 — 지도 그림 안에 넣는다 */
  const ring = picked && !placing && !dragTo && (
    <circle className="item-ring" data-testid="item-ring" cx={picked.x * u} cy={picked.y * u} r={Math.max(ITEMS[picked.kind].w, ITEMS[picked.kind].d) * 62 * itemSize(picked) + 8} pointerEvents="none" />
  );

  /** 놓는 동안 손 아래에 따라다니는 가구 그림 */
  const ghost = placing && placing !== 'remove' && (
    <CursorGhost name={placing}><ItemShape kind={placing} /></CursorGhost>
  );

  /** 열린 판과 고른 것을 모두 놓는다 */
  const stop = () => {
    setOpen(null);
    setAsking(null);
    setPlacing(null);
    setSelected(null);
  };

  return { buttons, panel, placing, tapMap, banner, bar, ring, ghost, selected, select: setSelected, isOpen: open !== null, pointer, shown, dragging: dragTo !== null, stop };
}
