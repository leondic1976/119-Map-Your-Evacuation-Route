/**
 * 레이어 — 아파트 형태와 가구는 필요할 때만 여는 판에 있다. 고르지 않아도 지도를 끝까지 만들 수 있다.
 * 왼쪽 패널에는 여는 단추만 둔다.
 */
import { useEffect, useState } from 'react';
import { placeItem, removeItemAt } from '../core/items';
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
import { ItemShape } from './PlanView';

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

export function useLayers(plan: Plan, layout: Layout) {
  const [open, setOpen] = useState<LayerId | null>(null);
  const [placing, setPlacing] = useState<Placing>(null);
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

  const buttons = (
    <>
      <button type="button" className={open === 'home' ? 'tool on' : 'tool'} data-testid="layer-home" aria-expanded={open === 'home'} onClick={() => { setPlacing(null); setOpen(open === 'home' ? null : 'home'); }}>
        {LAYER_NAME.home}
      </button>
      <button type="button" className={open === 'items' || placing ? 'tool on' : 'tool'} data-testid="layer-items" aria-expanded={open === 'items'} onClick={() => setOpen(open === 'items' ? null : 'items')}>
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
                  <button type="button" key={kind} className={placing === kind ? 'layer-card on' : 'layer-card'} data-testid={`item-${kind}`} onClick={() => { setPlacing(kind); setOpen(null); }}>
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

  return { buttons, panel, placing, tapMap, banner, isOpen: open !== null };
}
