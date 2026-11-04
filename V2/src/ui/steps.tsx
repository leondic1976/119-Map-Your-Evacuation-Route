/** 그리기 다섯 단계 — 칸 나누기 · 문 달기 · 표시하기 · 나가는 길 · 집 그리기 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { analyze, cellIdAt, edgeEnds, edgeKeys, pieceKeyAt, reachableFrom, unreachableCells } from '../core/grid';
import { placeMark, paintCell, removeWall, addStroke, routeCandidates, tapRoute, toggleOpening } from '../core/edit';
import { findSecondRoute } from '../core/auto';
import { pickByArrow, routePoints, type ArrowDir } from '../core/path';
import { DRAG_RADIUS, dragDots, dragMove, extendStroke, nearestDot, nearestEdge, sameDot, startDrag, type DragStroke } from '../core/stroke';
import { OUT, type MarkId, type OpeningKind, type Pt } from '../core/types';
import { BANDS } from '../content/bands';
import { crayonsFor, MARK_HINT, MARK_NAME, type Crayon } from '../content/names';
import { segEdges, templateById, templatesFor } from '../content/templates';
import { chooseTemplate, clearRoute, commit, currentBand, getApp, say, useApp } from '../store/app';
import { IconCheck, IconDoor, IconDot, IconEraser, IconPencil, IconWindow, MarkGlyph } from './art';
import { PlanView } from './PlanView';
import { ZoomControls } from './ZoomControls';

/** 화살표 키를 받는다. 사용법 카드나 설정이 떠 있으면 받지 않는다 */
export function useArrowKeys(onArrow: (dir: ArrowDir) => void): void {
  const latest = useRef(onArrow);
  latest.current = onArrow;
  useEffect(() => {
    const names: Record<string, ArrowDir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    const onKey = (e: KeyboardEvent) => {
      const dir = names[e.key];
      if (!dir || getApp().howTo || document.querySelector('.overlay')) return;
      e.preventDefault();
      latest.current(dir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

const usePlan = () => {
  const plan = useApp((s) => s.plan);
  const layout = useMemo(() => analyze(plan), [plan]);
  return { plan, layout };
};
const useLook = () => useApp((s) => s.profile?.look ?? 'a');

function HouseThumb({ id }: { id: string }) {
  const t = templateById(id);
  if (!t) return null;
  const band = BANDS[t.band];
  const lines = [...segEdges(t.outer), ...segEdges(t.inner)];
  return (
    <svg viewBox={`-1 -1 ${band.cols + 2} ${band.rows + 2}`} width="72" height="54" aria-hidden="true">
      {lines.map((k) => {
        const [a, b] = edgeEnds(k);
        return <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#33363b" strokeWidth=".5" strokeLinecap="round" />;
      })}
    </svg>
  );
}

/* ───────────── 1. 집 그리기 ───────────── */
export function DrawStep() {
  const { plan, layout } = usePlan();
  const band = currentBand();
  const info = BANDS[band];
  const templateId = useApp((s) => s.templateId);
  const [tool, setTool] = useState<'pencil' | 'eraser'>('pencil');
  const [stroke, setStroke] = useState<Pt[]>([]);
  const [armed, setArmed] = useState<Pt | null>(null);
  const drawing = useRef(false);
  const erasing = useRef(false);
  // 손이 지나온 자리 — 곧게 그으려던 것인지 모서리를 돌던 것인지 가른다
  const live = useRef<DragStroke | null>(null);
  const hadCell = useRef(layout.cells.length > 0);

  const guide = useMemo(() => {
    const t = templateById(templateId);
    if (!t) return [];
    return info.guide === 'full' ? [...segEdges(t.outer), ...segEdges(t.inner)] : segEdges(t.outer);
  }, [templateId, info.guide]);

  useEffect(() => {
    if (layout.cells.length > 0 && !hadCell.current) say('draw-first-cell');
    hadCell.current = layout.cells.length > 0;
  }, [layout.cells.length]);

  const onPointer = (kind: 'down' | 'move' | 'up' | 'cancel', p: Pt) => {
    if (tool === 'eraser') {
      if (kind === 'down') erasing.current = true;
      if (kind === 'up' || kind === 'cancel') {
        erasing.current = false;
        return;
      }
      if (!erasing.current) return;
      const app = getApp();
      const edge = nearestEdge(edgeKeys(analyze(app.plan)), p);
      if (edge) commit(removeWall(app.plan, edge), { merge: kind === 'move' });
      return;
    }
    if (kind === 'down') {
      const dot = nearestDot(plan, p);
      if (!dot) return;
      drawing.current = true;
      live.current = startDrag(dot);
      setStroke([dot]);
    } else if (kind === 'move') {
      if (!drawing.current || !live.current) return;
      live.current = dragMove(live.current, p, nearestDot(plan, p, DRAG_RADIUS));
      setStroke(dragDots(live.current));
    } else if (kind === 'up') {
      if (!drawing.current) return;
      drawing.current = false;
      const done = live.current ? dragDots(live.current) : [];
      live.current = null;
      if (done.length > 1) {
        commit(addStroke(plan, done));
        setArmed(null);
      } else if (done[0]) {
        const dot = done[0];
        if (armed && sameDot(armed, dot)) setArmed(null);
        else if (armed) {
          commit(addStroke(plan, extendStroke([armed], dot)));
          setArmed(dot);
        } else setArmed(dot);
      }
      setStroke([]);
    } else {
      drawing.current = false;
      live.current = null;
      setStroke([]);
    }
  };

  return (
    <>
      <aside className="tools" aria-label="그리기 도구">
        <div className="tool-row">
          <button type="button" className={tool === 'pencil' ? 'tool on' : 'tool'} data-testid="tool-pencil" aria-pressed={tool === 'pencil'} onClick={() => setTool('pencil')}>
            <IconPencil /> 연필
          </button>
          <button type="button" className={tool === 'eraser' ? 'tool on' : 'tool'} data-testid="tool-eraser" aria-pressed={tool === 'eraser'} onClick={() => { setTool('eraser'); setArmed(null); }}>
            <IconEraser /> 지우개
          </button>
        </div>
        <h3 className="tools-head">집 모양 본</h3>
        <div className="thumbs">
          {templatesFor(band).map((t) => (
            <button key={t.id} type="button" className={templateId === t.id ? 'thumb on' : 'thumb'} data-testid={`tpl-${t.id}`} aria-pressed={templateId === t.id} onClick={() => chooseTemplate(t.id)}>
              <HouseThumb id={t.id} />
              <span>{t.name}</span>
            </button>
          ))}
          {info.guide === 'none' && (
            <button type="button" className={!templateId ? 'thumb on' : 'thumb'} data-testid="tpl-none" aria-pressed={!templateId} onClick={() => chooseTemplate(null)}>
              <span className="thumb-blank" aria-hidden="true" />
              <span>본 없이</span>
            </button>
          )}
        </div>
        <p className="tool-note" data-testid="cell-count">칸 {layout.cells.length}개</p>
        <p className="tool-note">점이 작아 어려우면 돋보기를 눌러 크게 보고 그려 보자.</p>
      </aside>
      <section className="paper">
        <PlanView
          plan={plan}
          layout={layout}
          showDots
          guide={guide}
          stroke={stroke}
          armed={armed}
          showLabels={false}
          className={tool === 'eraser' ? 'cursor-erase' : 'cursor-draw'}
          onPointer={onPointer}
          zoomable
          edgePan
          ariaLabel="점을 이어 집을 그리는 모눈 종이"
        />
        <ZoomControls plan={plan} focus={armed} />
      </section>
    </>
  );
}

/* ───────────── 2. 칸 나누기 ───────────── */
export function SortStep() {
  const { plan, layout } = usePlan();
  const look = useLook();
  const band = currentBand();
  const groups = crayonsFor(band);
  const [crayon, setCrayon] = useState<Crayon>(groups.room[0]!);
  const untagged = layout.cells.filter((c) => !c.kind).length;
  const hadUntagged = useRef(untagged > 0);

  // 다 칠하면 왜 나누는지 알려 준다
  useEffect(() => {
    if (untagged === 0 && hadUntagged.current) say('sort-why');
    hadUntagged.current = untagged > 0;
  }, [untagged]);

  const onPointer = (kind: 'down' | 'move' | 'up' | 'cancel', p: Pt) => {
    if (kind !== 'up') return;
    const id = cellIdAt(layout, p);
    if (!id) return;
    commit(paintCell(plan, layout, id, { kind: crayon.kind, name: crayon.name }));
  };

  const chip = (c: Crayon) => (
    <button key={c.id} type="button" className={`crayon ${c.kind} ${crayon.id === c.id ? 'on' : ''}`} data-testid={`crayon-${c.id}`} aria-pressed={crayon.id === c.id} onClick={() => setCrayon(c)}>
      <span className="crayon-tip" aria-hidden="true" />
      {c.label}
    </button>
  );

  return (
    <>
      <aside className="tools" aria-label="크레용">
        <h3 className="tools-head">머무는 칸</h3>
        <div className="crayons">{groups.room.map(chip)}</div>
        <p className="tool-note">문을 닫으면 불과 연기를 막아 줘.</p>
        <h3 className="tools-head">걸어가는 칸</h3>
        <div className="crayons">{groups.pass.map(chip)}</div>
        <p className="tool-note">밖으로 나갈 때 지나가는 길이야.</p>
        <button type="button" className="link-btn" data-testid="sort-why" onClick={() => say('sort-why')}>왜 나눌까?</button>
      </aside>
      <section className="paper">
        <PlanView plan={plan} layout={layout} look={look} onPointer={onPointer} zoomable className="cursor-tap" ariaLabel="칸을 칠하는 지도" />
        <ZoomControls plan={plan} />
      </section>
    </>
  );
}

/* ───────────── 3. 문 달기 ───────────── */
export function DoorStep() {
  const { plan, layout } = usePlan();
  const look = useLook();
  const band = currentBand();
  const info = BANDS[band];
  const [kind, setKind] = useState<OpeningKind>('door');
  const [hover, setHover] = useState<string | null>(null);

  const stuck = useMemo(() => unreachableCells(layout).map((c) => c.id), [layout]);
  const hasExit = layout.links.some((l) => l.b === OUT);

  const onPointer = (type: 'down' | 'move' | 'up' | 'cancel', p: Pt) => {
    const edge = nearestEdge(edgeKeys(layout), p);
    if (type === 'move') setHover(edge);
    if (type !== 'up' || !edge) return;
    const res = toggleOpening(plan, layout, edge, kind);
    if (res.ok) commit(res.plan);
    else if (res.why === 'window-inside') say('door-window-inside');
  };

  const onHint = () => {
    if (!hasExit) say('door-no-exit');
    else if (stuck.length) say('door-stuck');
  };

  return (
    <>
      <aside className="tools" aria-label="문과 창">
        <div className="tool-row">
          <button type="button" className={kind === 'door' ? 'tool on' : 'tool'} data-testid="tool-door" aria-pressed={kind === 'door'} onClick={() => setKind('door')}>
            <IconDoor /> 문
          </button>
          {info.windows && (
            <button type="button" className={kind === 'window' ? 'tool on' : 'tool'} data-testid="tool-window" aria-pressed={kind === 'window'} onClick={() => setKind('window')}>
              <IconWindow /> 창문
            </button>
          )}
        </div>
        <ul className="checks">
          <li className={hasExit ? 'done' : ''} data-testid="check-exit">
            {hasExit ? <IconCheck /> : <IconDot />} 밖으로 나가는 문
          </li>
          <li className={stuck.length === 0 && layout.cells.length > 0 ? 'done' : ''} data-testid="check-linked">
            {stuck.length === 0 ? <IconCheck /> : <IconDot />} 모든 칸이 밖까지 이어짐
          </li>
        </ul>
        <p className="tool-note">초록 문은 밖으로 나가는 문이야. 다시 누르면 떼어져.</p>
        {(!hasExit || stuck.length > 0) && (
          <button type="button" className="link-btn" data-testid="door-hint" onClick={onHint}>무엇이 빠졌어?</button>
        )}
      </aside>
      <section className="paper">
        <PlanView plan={plan} layout={layout} look={look} warn={stuck} hotEdge={hover} onPointer={onPointer} zoomable className="cursor-tap" ariaLabel="벽을 눌러 문을 다는 지도" />
        <ZoomControls plan={plan} />
      </section>
    </>
  );
}

/* ───────────── 4. 표시하기 ───────────── */
export function MarkStep() {
  const { plan, layout } = usePlan();
  const look = useLook();
  const band = currentBand();
  const info = BANDS[band];
  const firstEmpty = info.marks.find((m) => !plan.marks[m]) ?? info.marks[0]!;
  const [tool, setTool] = useState<MarkId>(firstEmpty);

  const onPointer = (kind: 'down' | 'move' | 'up' | 'cancel', p: Pt) => {
    if (kind !== 'up') return;
    const res = placeMark(plan, layout, tool, p);
    if (!res.ok) {
      say(res.why === 'need-outside' ? 'mark-need-outside' : 'mark-need-inside');
      return;
    }
    commit(res.plan);
    // 놓고 나면 아직 없는 다음 표시로 넘어가 다시 고르지 않아도 된다
    const next = info.marks.find((m) => !res.plan.marks[m]);
    if (next) setTool(next);
  };

  return (
    <>
      <aside className="tools" aria-label="표시">
        <div className="marks-list">
          {info.marks.map((m) => (
            <button key={m} type="button" className={tool === m ? 'mark-chip on' : 'mark-chip'} data-testid={`mark-${m}`} aria-pressed={tool === m} onClick={() => setTool(m)}>
              <svg viewBox="-36 -36 72 76" width="44" height="44" aria-hidden="true"><MarkGlyph id={m} look={look} /></svg>
              <span className="mark-text">
                <b>{MARK_NAME[m]}</b>
                <small>{MARK_HINT[m]}</small>
              </span>
              {plan.marks[m] && <span className="mark-done"><IconCheck size={20} /></span>}
            </button>
          ))}
        </div>
      </aside>
      <section className="paper">
        <PlanView plan={plan} layout={layout} look={look} onPointer={onPointer} zoomable className="cursor-tap" ariaLabel="표시를 놓는 지도" />
        <ZoomControls plan={plan} />
      </section>
    </>
  );
}

/* ───────────── 5. 나가는 길 ───────────── */
export function RouteStep() {
  const { plan, layout } = usePlan();
  const look = useLook();
  const band = currentBand();
  const info = BANDS[band];
  const [which, setWhich] = useState<'route' | 'route2'>('route');

  const route = plan[which];
  const done = route[route.length - 1] === OUT;
  const candidates = useMemo(() => routeCandidates(plan, layout, which), [plan, layout, which]);
  const hasStart = Boolean(plan.marks.me);
  const firstDone = plan.route[plan.route.length - 1] === OUT;

  const choose = (target: string) => {
    const res = tapRoute(plan, layout, which, target);
    if (res.result === 'no-way') say('route-no-way');
    else if (res.result === 'no-start') say('help-fill');
    else {
      commit(res.plan);
      if (res.result === 'done') {
        if (which === 'route' && info.secondRoute) {
          say(findSecondRoute(res.plan) ? 'route-second' : 'route-no-second');
        } else say('route-done');
      }
    }
  };

  const onPointer = (kind: 'down' | 'move' | 'up' | 'cancel', p: Pt) => {
    if (kind !== 'up') return;
    const piece = pieceKeyAt(layout, p);
    choose(layout.cellAt.has(piece) ? piece : OUT);
  };

  // 화살표 키 — 지금 자리에서 그 방향에 있는 문으로 간다
  const onArrow = (dir: ArrowDir) => {
    if (!plan.marks.me || done) return;
    const steps = route.length ? route : [pieceKeyAt(layout, plan.marks.me)];
    const here = layout.cellAt.get(steps[steps.length - 1]!);
    if (!here) return;
    const points = routePoints(plan, layout, steps);
    const from = points[points.length - 1] ?? plan.marks.me;
    const pick = pickByArrow(from, reachableFrom(layout, here), dir);
    if (pick) choose(pick.to);
    else say('route-no-way');
  };
  useArrowKeys(onArrow);

  const stepsText = route.length
    ? `${route.filter((s) => s !== OUT).length}칸 지남${done ? ', 밖까지 도착' : ''}`
    : '아직 고르지 않음';

  return (
    <>
      <aside className="tools" aria-label="나가는 길">
        {info.secondRoute && (
          <div className="tool-row">
            <button type="button" className={which === 'route' ? 'tool on' : 'tool'} data-testid="route-first" aria-pressed={which === 'route'} onClick={() => setWhich('route')}>첫째 길</button>
            <button type="button" className={which === 'route2' ? 'tool on' : 'tool'} data-testid="route-second" aria-pressed={which === 'route2'} disabled={!firstDone} onClick={() => setWhich('route2')}>둘째 길</button>
          </div>
        )}
        <p className="tool-note" data-testid="route-status">{stepsText}</p>
        {hasStart && layout.links.length === 0 && <p className="tool-note">문이 없어서 길을 고를 수 없어. 도와줘를 눌러 보자.</p>}
        {!hasStart && <p className="tool-note">내 자리가 아직 없어. 도와줘를 눌러 보자.</p>}
        <button type="button" className="link-btn" data-testid="route-clear" disabled={route.length === 0} onClick={() => clearRoute(which)}>이 길 다시 고르기</button>
        <p className="tool-note">반짝이는 칸을 누르면 길이 이어져. 화살표 키로도 갈 수 있어.</p>
        <p className="tool-note">지나온 칸을 다시 누르면 거기까지 되돌아가.</p>
      </aside>
      <section className="paper">
        <PlanView plan={plan} layout={layout} look={look} showRoute glow={candidates} hints={candidates} onPointer={onPointer} zoomable className="cursor-tap" ariaLabel="칸을 차례로 눌러 나가는 길을 고르는 지도" />
        <ZoomControls plan={plan} />
      </section>
    </>
  );
}
