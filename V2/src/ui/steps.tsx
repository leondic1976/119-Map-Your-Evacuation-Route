/** 그리기 다섯 단계 — 칸 나누기 · 문 달기 · 표시하기 · 나가는 길 · 집 그리기 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { analyze, cellIdAt, dotsBetween, edgeEnds, edgeKeys, unreachableCells } from '../core/grid';
import { outsideOf, setOutside } from '../core/items';
import { addExtinguisher, placeMark, paintCell, eraseWall, addStroke, arrowRoute, routeCandidates, routeCells, resizeDoor, toggleOpening, turnDoor, type RouteTap } from '../core/edit';
import { nextDoorSize } from '../core/doors';
import { extinguishers, markDone, MAX_EXTINGUISHERS } from '../core/marks';
import { hasOtherRoute } from '../core/auto';
import { routeCursor, squareStep, type ArrowDir } from '../core/path';
import { DRAG_RADIUS, dragDots, dragMove, extendStroke, nearestDot, nearestEdge, sameDot, startDrag, type DragStroke } from '../core/stroke';
import { OUT, type MarkId, type OpeningKind, type OutsideSide, type Pt } from '../core/types';
import { BANDS } from '../content/bands';
import { cellLabel, crayonsFor, MARK_HINT, MARK_NAME, type Crayon } from '../content/names';
import { NO_EXTINGUISHER } from '../content/report';
import { clearRoute, commit, currentBand, getApp, say, setGrid, tellNoExtinguisher, useApp } from '../store/app';
import { getHandUnit } from './handUnit';
import { useLayers } from './Layers';
import { useRooms } from './Rooms';
import { CursorGhost } from './CursorGhost';
import { IconCheck, IconDoor, IconDot, IconEraser, IconHand, IconPencil, IconPointer, IconUndo, IconWindow, KidGlyph, MarkGlyph } from './art';
import { ArrowPad, useArrowKeys } from './ArrowPad';
import { PlanView, unitOf } from './PlanView';
import { Unverified } from './ReviewStep';
import { ZoomControls } from './ZoomControls';

const usePlan = () => {
  const plan = useApp((s) => s.plan);
  const layout = useMemo(() => analyze(plan), [plan]);
  return { plan, layout };
};
const useLook = () => useApp((s) => s.profile?.look ?? 'a');

const SIDES: { id: OutsideSide; label: string; d: string }[] = [
  { id: 'top', label: '위', d: 'M12 19V5M6 11l6-6 6 6' },
  { id: 'bottom', label: '아래', d: 'M12 5v14M6 13l6 6 6-6' },
  { id: 'left', label: '왼쪽', d: 'M19 12H5M11 6l-6 6 6 6' },
  { id: 'right', label: '오른쪽', d: 'M5 12h14M13 6l6 6-6 6' },
];

/** 점 개수 고르기 — 하나씩 늘리고 줄인다. 지금 고른 것이 없으면 가장 가까운 것부터 잰다 */
function DotStepper({ cols, rows, grids }: { cols: number; rows: number; grids: [number, number][] }) {
  const dots = (c: number, r: number): number => (c + 1) * (r + 1);
  const count = dots(cols, rows);
  let at = 0;
  grids.forEach(([c, r], i) => {
    if (Math.abs(dots(c, r) - count) < Math.abs(dots(grids[at]![0], grids[at]![1]) - count)) at = i;
  });
  return (
    <div className="stepper" role="group" aria-label="점 개수">
      <button type="button" className="tool" data-testid="dots-less" aria-label="점 줄이기" disabled={at === 0} onClick={() => setGrid(grids[at - 1]![0], grids[at - 1]![1])}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /></svg>
      </button>
      <button type="button" className="tool" data-testid="dots-more" aria-label="점 늘리기" disabled={at === grids.length - 1} onClick={() => setGrid(grids[at + 1]![0], grids[at + 1]![1])}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12h14M12 5v14" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /></svg>
      </button>
      <span className="stepper-count" data-testid="dots-count">{count}개</span>
    </div>
  );
}

/** 잡아 둔 파란 점을 놓기까지 기다리는 시간 */
const ARMED_MS = 15000;
const NO_STROKE: Pt[] = [];

/* ───────────── 1. 집 그리기 ───────────── */
export function DrawStep() {
  const { plan, layout } = usePlan();
  const band = currentBand();
  const info = BANDS[band];
  const [tool, setTool] = useState<'pencil' | 'hand' | 'eraser'>('pencil');
  const [stroke, setStroke] = useState<Pt[]>([]);
  const [armed, setArmed] = useState<Pt | null>(null);
  const drawing = useRef(false);
  const erasing = useRef(false);
  // 손이 지나온 자리 — 곧게 그으려던 것인지 모서리를 돌던 것인지 가른다
  const live = useRef<DragStroke | null>(null);
  const hadCell = useRef(layout.cells.length > 0);
  // 방 넣기와 가구 판은 함께 쓰지 않는다. 하나를 열면 다른 하나를 닫는다
  const roomsStop = useRef<() => void>(() => undefined);
  const layers = useLayers(plan, layout, () => roomsStop.current());
  const rooms = useRooms(plan, layers.stop);
  roomsStop.current = rooms.stop;
  // 파란 점에서 손 아래 점까지 — 눌렀을 때 생길 선을 미리 보인다
  const [aim, setAim] = useState<Pt | null>(null);
  const pastLength = useApp((s) => s.past.length);
  const lastPast = useRef(pastLength);
  const armedTold = useRef(false);

  // 되돌렸거나 판을 열었으면 잡아 둔 점을 놓는다. 안 그러면 다음 누름이 또 벽이 된다
  useEffect(() => {
    if (pastLength < lastPast.current) setArmed(null);
    lastPast.current = pastLength;
  }, [pastLength]);
  useEffect(() => {
    if (layers.isOpen || layers.placing || rooms.busy) setArmed(null);
  }, [layers.isOpen, layers.placing, rooms.busy]);
  // 잡아 둔 점을 잊고 한참 뒤에 다른 곳을 누르면 엉뚱한 선이 생긴다(대장 #174). 오래 두면 놓는다
  useEffect(() => {
    setAim(null);
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(null), ARMED_MS);
    return () => window.clearTimeout(timer);
  }, [armed]);

  useEffect(() => {
    // 집 모양을 닫으면 이어서 방을 만들자고 한다
    // 방을 넣어 생긴 칸이면 「안에 선을 그어 방을 만들자」는 말은 맞지 않는다
    if (layout.cells.length > 0 && !hadCell.current) say('draw-first-cell', rooms.busy ? undefined : 'draw-make-rooms');
    hadCell.current = layout.cells.length > 0;
  }, [layout.cells.length]);

  const onPointer = (kind: 'down' | 'move' | 'up' | 'cancel', p: Pt) => {
    // 방을 놓거나 옮기는 중이면 벽을 긋지 않는다
    if (rooms.pointer(kind, p)) return;
    if (layers.placing) {
      if (kind === 'up') layers.tapMap(p);
      return;
    }
    if (tool === 'eraser') {
      if (kind === 'down') erasing.current = true;
      if (kind === 'up' || kind === 'cancel') {
        erasing.current = false;
        return;
      }
      if (!erasing.current) return;
      const app = getApp();
      const edge = nearestEdge(edgeKeys(analyze(app.plan)), p, 0.42 * getHandUnit(app.plan));
      // 긴 벽의 가운데를 한 칸만 지우면 문 없는 입구가 되고, 이어서 옆까지 지우면 벽이 사라진다
      if (edge) commit(eraseWall(app.plan, edge), { merge: kind === 'move' });
      return;
    }
    // 고르기(대장 #164) — 가구만 잡는다. 넉넉하게 잡히고 벽은 그어지지 않는다
    if (tool === 'hand') {
      const held = layers.pointer(kind, p, 0.4);
      if (!held && kind === 'up') layers.select(null);
      return;
    }
    // 놓은 가구를 잡았으면 벽을 긋지 않고 가구를 옮긴다
    if (layers.pointer(kind, p)) return;
    if (kind === 'down') {
      layers.select(null);
      // 점이 촘촘하면 손가락이 점 사이에 닿아도 가까운 점을 잡는다
      const dot = nearestDot(plan, p, getHandUnit(plan) > 1 ? 0.75 : undefined);
      if (!dot) return;
      drawing.current = true;
      live.current = startDrag(dot);
      setStroke([dot]);
    } else if (kind === 'move') {
      if (!drawing.current || !live.current) {
        // 누르지 않고 움직이는 손 — 파란 점이 있으면 이을 점을 미리 보인다
        const near = armed ? nearestDot(plan, p, getHandUnit(plan) > 1 ? 0.75 : undefined) : null;
        setAim((was) => (near && armed && !sameDot(near, armed) ? (was && sameDot(was, near) ? was : near) : null));
        return;
      }
      const unit = getHandUnit(plan);
      live.current = dragMove(live.current, p, nearestDot(plan, p, Math.min(0.75, DRAG_RADIUS * unit)), unit);
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
          // 이미 벽이 닿아 있는 점에 이으면 그 선은 끝난 것이다. 파란 점을 놓아 다음 누름이 또 선이 되지 않게 한다(대장 #174)
          const joined = plan.walls.some((wall) => edgeEnds(wall).some((end) => sameDot(end, dot)));
          commit(addStroke(plan, extendStroke([armed], dot)));
          setArmed(joined ? null : dot);
        } else {
          setArmed(dot);
          if (!armedTold.current) {
            armedTold.current = true;
            say('draw-armed');
          }
        }
      }
      setStroke([]);
    } else {
      drawing.current = false;
      live.current = null;
      setStroke([]);
    }
  };

  const hint = armed && aim && !rooms.busy && !layers.placing && tool === 'pencil' ? dotsBetween(armed, aim) : NO_STROKE;

  return (
    <>
      <aside className="tools" aria-label="그리기 도구">
        <div className="tool-row">
          <button type="button" className={tool === 'pencil' ? 'tool on' : 'tool'} data-testid="tool-pencil" aria-pressed={tool === 'pencil'} onClick={() => { rooms.stop(); setTool('pencil'); }}>
            <IconPencil /> 연필
          </button>
          <button type="button" className={tool === 'hand' ? 'tool on' : 'tool'} data-testid="tool-hand" aria-pressed={tool === 'hand'} onClick={() => { rooms.stop(); setTool('hand'); setArmed(null); }}>
            <IconHand /> 고르기
          </button>
          <button type="button" className={tool === 'eraser' ? 'tool on' : 'tool'} data-testid="tool-eraser" aria-pressed={tool === 'eraser'} onClick={() => { rooms.stop(); setTool('eraser'); setArmed(null); }}>
            <IconEraser /> 지우개
          </button>
        </div>
        {/* 낮은 창에서는 머리글을 감춰 도구 단추와 한 묶음으로 두 줄에 든다 */}
        <h3 className="tools-head pick-head">골라 넣기</h3>
        {rooms.button}
        {layers.buttons}
        <h3 className="tools-head">점 개수</h3>
        <DotStepper cols={plan.cols} rows={plan.rows} grids={info.grids} />
        <h3 className="tools-head">집 밖은 어느 쪽?</h3>
        <div className="side-pick" role="group" aria-label="집 밖 자리">
          {SIDES.map((s) => (
            <button type="button" key={s.id} className={outsideOf(plan) === s.id ? 'tool on' : 'tool'} data-testid={`outside-${s.id}`} aria-label={`집 밖 ${s.label}`} aria-pressed={outsideOf(plan) === s.id} onClick={() => commit(setOutside(plan, s.id))}>
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d={s.d} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          ))}
        </div>
        {(plan.items?.length ?? 0) > 0 && <p className="tool-note" data-testid="item-move-note">놓은 가구는 「고르기」를 누르고 끌어서 옮겨. 누르면 돌리거나 크기를 바꿔.</p>}
        {tool === 'hand' && <p className="tool-note" data-testid="hand-note">{(plan.items?.length ?? 0) > 0 ? '가구만 잡혀. 벽은 연필로 그려.' : '아직 가구가 없어. 가구에서 골라 넣자.'}</p>}
        <p className="tool-note" data-testid="cell-count">칸 {layout.cells.length}개</p>
        {tool === 'eraser' && <p className="tool-note" data-testid="eraser-note">벽을 한 칸만 지우면 문 없는 입구가 돼.</p>}
      </aside>
      <section className="paper">
        <PlanView
          plan={layers.shown}
          layout={layout}
          showDots
          stroke={stroke.length > 1 ? stroke : hint}
          strokeHint={stroke.length <= 1}
          armed={armed}
          showLabels={layout.cells.some((c) => c.kind)}
          className={rooms.placing || layers.ghost ? 'cursor-none' : rooms.fixing ? (rooms.held ? 'cursor-held' : 'cursor-hand') : layers.placing ? 'cursor-tap' : tool === 'eraser' ? 'cursor-erase' : tool === 'hand' ? (layers.dragging ? 'cursor-held' : 'cursor-hand') : 'cursor-draw'}
          onPointer={onPointer}
          zoomable
          edgePan
          ariaLabel="점을 이어 집을 그리는 모눈 종이"
        >
          {layers.ring}
          {rooms.ring}
        </PlanView>
        <ZoomControls plan={plan} focus={armed} />
        {layers.ghost}
        {rooms.ghost}
        {layers.bar}
        {rooms.bar}
        {armed && !layers.placing && !rooms.busy && (
          <p className="map-note" data-testid="armed-note" role="status">파란 점에서 이어져. 잘못 눌렀으면 파란 점을 다시 눌러.</p>
        )}
        {layers.banner}
        {rooms.banner}
        {layers.panel}
        {rooms.panel}
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
        <h3 className="tools-head">노란색 칸</h3>
        <div className="crayons">{groups.room.map(chip)}</div>
        <h3 className="tools-head">파란색 칸</h3>
        <div className="crayons">{groups.pass.map(chip)}</div>
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
  // 'fix' 는 다는 것이 아니라 달린 문을 골라 방향과 크기를 고치는 도구다(대장 #168 · #170)
  const [kind, setKind] = useState<OpeningKind | 'fix'>('door');
  const [hover, setHover] = useState<string | null>(null);
  const [missed, setMissed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const doors = useMemo(() => Object.keys(plan.openings).filter((e) => plan.openings[e] === 'door'), [plan]);
  // 되돌리거나 벽이 바뀌어 문이 없어졌으면 고른 것을 놓는다
  const chosen = kind === 'fix' && picked && plan.openings[picked] === 'door' ? picked : null;

  const stuck = useMemo(() => unreachableCells(layout).map((c) => c.id), [layout]);
  const hasExit = layout.links.some((l) => l.b === OUT);

  const onPointer = (type: 'down' | 'move' | 'up' | 'cancel', p: Pt) => {
    if (kind === 'fix') {
      // 문만 잡는다. 벽보다 넉넉하게 잡아 문짝 그림을 눌러도 된다
      const door = nearestEdge(doors, p, 0.6 * getHandUnit(plan));
      if (type === 'move') setHover(door);
      if (type !== 'up') return;
      setPicked(door);
      setMissed(!door);
      return;
    }
    const edge = nearestEdge(edgeKeys(layout), p, 0.42 * getHandUnit(plan));
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
          <button type="button" className={kind === 'gap' ? 'tool on' : 'tool'} data-testid="tool-gap" aria-pressed={kind === 'gap'} onClick={() => setKind('gap')}>
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M3 12h4M17 12h4M7 7v10M17 7v10" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /><path d="M10 12h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 3" /></svg>
            트인 곳
          </button>
          <button type="button" className={kind === 'fix' ? 'tool on' : 'tool'} data-testid="tool-fix" aria-pressed={kind === 'fix'} onClick={() => { setKind('fix'); setMissed(false); setPicked(doors.length === 1 ? doors[0]! : null); }}>
            <IconPointer /> 문 고치기
          </button>
        </div>
        {kind === 'fix' && (
          <div className="tool-box" data-testid="door-fix" data-picked={chosen ?? ''}>
            <p className="tool-note" data-testid="fix-note" role="status">
              {doors.length === 0 ? '아직 문이 없어. 먼저 문을 달자.' : chosen ? '파란 문을 고치는 중이야.' : missed ? '문을 눌러야 해. 문짝이 그려진 곳을 눌러 봐.' : '고칠 문을 눌러.'}
            </p>
            <button type="button" className="tool small" data-testid="door-turn" disabled={!chosen} onClick={() => chosen && commit(turnDoor(plan, chosen))}>
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 11a8 8 0 0 1 14-4M20 13a8 8 0 0 1-14 4M18 2v5h-5M6 22v-5h5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              방향 바꾸기
            </button>
            <button type="button" className="tool small" data-testid="door-smaller" disabled={!chosen || nextDoorSize(plan, layout, chosen, -1) === null} onClick={() => chosen && commit(resizeDoor(plan, layout, chosen, -1))}>
              작게
            </button>
            <button type="button" className="tool small" data-testid="door-bigger" disabled={!chosen || nextDoorSize(plan, layout, chosen, 1) === null} onClick={() => chosen && commit(resizeDoor(plan, layout, chosen, 1))}>
              크게
            </button>
          </div>
        )}
        {kind === 'gap' && <p className="tool-note" data-testid="gap-note">문짝 없이 뚫린 입구야. 그냥 지나가.</p>}
        {layout.openEdges.length > 0 && <p className="tool-note" data-testid="open-note">거실과 부엌처럼 트인 칸끼리는 점선이야. 문이 없어도 지나가.</p>}
        <ul className="checks">
          <li className={hasExit ? 'done' : ''} data-testid="check-exit">
            {hasExit ? <IconCheck /> : <IconDot />} 나가는 문
          </li>
          <li className={stuck.length === 0 && layout.cells.length > 0 ? 'done' : ''} data-testid="check-linked">
            {stuck.length === 0 ? <IconCheck /> : <IconDot />} 모두 이어짐
          </li>
        </ul>
        {kind !== 'fix' && <p className="tool-note">다시 누르면 떼어져.</p>}
        {(!hasExit || stuck.length > 0) && (
          <button type="button" className="link-btn" data-testid="door-hint" onClick={onHint}>뭐가 빠졌어?</button>
        )}
      </aside>
      <section className="paper">
        <PlanView plan={plan} layout={layout} look={look} warn={stuck} hotEdge={chosen ?? hover} onPointer={onPointer} zoomable className="cursor-tap" ariaLabel="벽을 눌러 문을 다는 지도" />
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
  const firstEmpty = info.marks.find((m) => !markDone(plan, m)) ?? info.marks[0]!;
  const [tool, setTool] = useState<MarkId>(firstEmpty);
  // 소화기는 여럿일 수 있다(대장 #169). 「하나 더 놓기」를 누른 다음 한 번만 더 놓는다
  const [adding, setAdding] = useState(false);
  const [full, setFull] = useState(false);
  const count = extinguishers(plan).length;
  const none = plan.noExtinguisher === true;
  const extStatus = none
    ? '없다고 적었어. 있으면 지도를 눌러 놓아.'
    : full
      ? `소화기는 ${MAX_EXTINGUISHERS}개까지 놓아.`
      : adding
        ? '하나 더 놓을 자리를 눌러.'
        : count === 0
          ? '소화기가 있는 자리를 눌러. 없으면 아래를 눌러.'
          : `소화기 ${count}개. 놓은 것을 다시 누르면 치워져.`;
  const layers = useLayers(plan, layout);
  const hasItems = (plan.items?.length ?? 0) > 0;

  const onPointer = (kind: 'down' | 'move' | 'up' | 'cancel', p: Pt) => {
    // 놓은 가구는 끌어서 옮기고, 누르면 고치는 판이 뜬다
    if (layers.pointer(kind, p)) return;
    if (kind !== 'up') return;
    if (layers.tapMap(p)) return;
    // 고친 뒤 빈 자리를 누르면 고르기가 풀린다
    if (layers.selected !== null) {
      layers.select(null);
      return;
    }
    const res = tool === 'extinguisher' && adding ? addExtinguisher(plan, layout, p) : placeMark(plan, layout, tool, p);
    if (!res.ok) {
      if (res.why === 'full') setFull(true);
      else say(res.why === 'need-outside' ? 'mark-need-outside' : 'mark-need-inside');
      return;
    }
    commit(res.plan);
    setAdding(false);
    setFull(false);
    // 놓고 나면 아직 없는 다음 표시로 넘어가 다시 고르지 않아도 된다
    const next = info.marks.find((m) => !markDone(res.plan, m));
    if (next) setTool(next);
  };

  return (
    <>
      <aside className="tools" aria-label="표시">
        <div className="marks-list">
          {info.marks.map((m) => (
            <button key={m} type="button" className={tool === m ? 'mark-chip on' : 'mark-chip'} data-testid={`mark-${m}`} aria-pressed={tool === m} onClick={() => { setTool(m); setAdding(false); setFull(false); }}>
              <svg viewBox="-36 -36 72 76" width="44" height="44" aria-hidden="true"><MarkGlyph id={m} look={look} /></svg>
              <span className="mark-text" title={MARK_HINT[m]}>
                <b>{MARK_NAME[m]}</b>
              </span>
              {markDone(plan, m) && <span className="mark-done"><IconCheck size={20} /></span>}
            </button>
          ))}
        </div>
        {tool === 'extinguisher' && (
          <div className="tool-box" data-testid="ext-box" data-count={count}>
            <p className="tool-note" data-testid="ext-status" role="status">{extStatus}</p>
            <button type="button" className={adding ? 'tool small on' : 'tool small'} data-testid="ext-more" aria-pressed={adding} disabled={count === 0 || count >= MAX_EXTINGUISHERS} onClick={() => { setAdding(!adding); setFull(false); }}>
              하나 더 놓기
            </button>
            <button type="button" className={none ? 'tool small on' : 'tool small'} data-testid="ext-none" aria-pressed={none} onClick={() => { setAdding(false); setFull(false); tellNoExtinguisher(!none); }}>
              우리 집에 없어
            </button>
            {none && (
              <p className="tool-note advice" data-testid="ext-advice">
                {NO_EXTINGUISHER.short} <Unverified sourceIds={NO_EXTINGUISHER.sourceIds} />
              </p>
            )}
          </div>
        )}
        <h3 className="tools-head">골라 넣기</h3>
        {layers.buttons}
        {hasItems && <p className="tool-note" data-testid="item-move-note">놓은 가구는 끌어서 옮기고, 누르면 돌리거나 크기를 바꿔.</p>}
      </aside>
      <section className="paper">
        <PlanView plan={layers.shown} layout={layout} look={look} onPointer={onPointer} zoomable className={layers.placing === 'remove' || layers.selected !== null ? 'cursor-tap' : 'cursor-none'} ariaLabel="표시를 놓는 지도">
          {layers.ring}
        </PlanView>
        <ZoomControls plan={plan} />
        {layers.ghost}
        {!layers.placing && layers.selected === null && !layers.dragging && (
          <CursorGhost name={`mark-${tool}`}><MarkGlyph id={tool} look={look} /></CursorGhost>
        )}
        {layers.bar}
        {layers.banner}
        {layers.panel}
      </section>
    </>
  );
}

/* ───────────── 5. 나가는 길 ───────────── */
/** 방향키 판과 사용법에 적는 곳 이름 */
const DIR_LABEL: Record<ArrowDir, string> = { up: '위', down: '아래', left: '왼쪽', right: '오른쪽' };

export function RouteStep() {
  const { plan, layout } = usePlan();
  const look = useLook();
  const band = currentBand();
  const info = BANDS[band];
  const [which, setWhich] = useState<'route' | 'route2'>('route');
  // 지도를 누르면 방향키 판을 흔들어 여기를 쓰라고 알린다
  const [nudge, setNudge] = useState(0);
  // 방향키 판이 있는 쪽 — 지도는 반대쪽으로 붙는다
  const [padLeft, setPadLeft] = useState(false);

  const route = plan[which];
  const done = route[route.length - 1] === OUT;
  const candidates = useMemo(() => routeCandidates(plan, layout, which), [plan, layout, which]);
  const hasStart = Boolean(plan.marks.me);
  const firstDone = plan.route[plan.route.length - 1] === OUT;
  const otherWay = useMemo(() => hasOtherRoute(plan), [plan]);
  // 더 갈 곳이 없으면 돌아갈 칸을 반짝여 막다른 길에 남겨 두지 않는다
  const deadEnd = !done && candidates.length === 0 && route.length > 1;
  const backCell = deadEnd ? layout.cellAt.get(route[route.length - 2]!) : undefined;
  const glow = backCell ? [backCell] : candidates;
  const cellsOf = (steps: string[]): string => routeCells(layout, steps).join('|');
  // 지금 서 있는 자리 — 길의 끝이다
  const cursor = useMemo(() => routeCursor(plan, layout, route), [plan, layout, route]);

  /** 길이 바뀐 뒤에 할 말 */
  const announce = (res: RouteTap, before: string) => {
    if (res.result === 'done') {
      if (which === 'route' && info.secondRoute) {
        if (hasOtherRoute(res.plan)) say('route-second');
        else say('route-no-second', 'route-next');
      } else say('route-done', 'route-next');
    } else if (res.result === 'added' && cellsOf(res.plan[which]) !== before && routeCandidates(res.plan, layout, which).length === 0) {
      // 막다른 칸에 막 들어섰다
      say('route-dead-end');
    }
  };

  // 방향키 — 누른 쪽으로 모눈 한 칸 간다. 벽은 막히고 문과 트인 곳으로 지나간다(대장 #160).
  // 화면의 방향키 판과 키보드가 같은 일을 한다. 지도를 누르거나 끌어서는 길이 그려지지 않는다
  const onArrow = (dir: ArrowDir) => {
    if (!plan.marks.me) {
      say('help-fill');
      return;
    }
    if (done) return;
    const res = arrowRoute(plan, layout, which, dir);
    if (res.result === 'no-way') say('route-no-way');
    else if (res.result === 'no-start') say('help-fill');
    else if (which === 'route2' && res.result === 'done' && cellsOf(res.plan.route2) === cellsOf(plan.route)) say('route-same');
    else {
      commit(res.plan);
      announce(res, cellsOf(route));
    }
  };
  useArrowKeys(onArrow);
  const stepBack = () => {
    if (route.length > 1) commit({ ...plan, [which]: route.slice(0, -1) });
  };
  // 키보드의 지우기 키도 한 칸 뒤로 간다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace' || getApp().howTo || document.querySelector('.overlay')) return;
      e.preventDefault();
      const app = getApp();
      const now = app.plan[which];
      if (now.length > 1) commit({ ...app.plan, [which]: now.slice(0, -1) });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [which]);

  const placeName = (to: string): string => {
    if (to === OUT) return '집 밖';
    const cell = layout.byId.get(to);
    return (cell && cellLabel(cell.kind, cell.name)) || '옆 칸';
  };
  // 갈 수 있는 쪽과 그쪽에 있는 곳
  const targets = useMemo(() => {
    const out: Partial<Record<ArrowDir, string>> = {};
    if (!cursor) return out;
    const here = layout.cellAt.get(cursor.piece);
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      const step = squareStep(plan, layout, cursor.piece, dir);
      if (step.kind === 'walk') out[dir] = here ? placeName(here) : '옆 칸';
      else if (step.kind === 'cross') out[dir] = placeName(step.to);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, layout, cursor]);
  const openDirs = (Object.keys(targets) as ArrowDir[]).map((dir) => DIR_LABEL[dir]);

  const stepsText = route.length
    ? `${routeCells(layout, route).filter((s) => s !== OUT).length}칸 지남${done ? ', 도착' : ''}`
    : '아직 고르지 않음';
  const u = unitOf(plan);

  return (
    <>
      <aside className="tools" aria-label="나가는 길">
        {info.secondRoute && (
          <div className="tool-row">
            <button type="button" className={which === 'route' ? 'tool on' : 'tool'} data-testid="route-first" aria-pressed={which === 'route'} onClick={() => setWhich('route')}>첫째 길</button>
            <button type="button" className={which === 'route2' ? 'tool on' : 'tool'} data-testid="route-second" aria-pressed={which === 'route2'} disabled={!firstDone || !otherWay} onClick={() => setWhich('route2')}>둘째 길</button>
          </div>
        )}
        {info.secondRoute && firstDone && !otherWay && <p className="tool-note" data-testid="route-no-other">다른 길이 없어. 문을 더 달면 찾을 수 있어.</p>}
        <p className="tool-note" data-testid="route-status">{stepsText}</p>
        <p className="tool-note" data-testid="route-drag-note">방향키로만 그려. 누른 쪽으로 한 칸씩 가. 벽은 못 지나가고 문으로 지나가.</p>
        {hasStart && layout.links.length === 0 && <p className="tool-note">문이 없어. 도와줘를 눌러 봐.</p>}
        {hasStart && layout.links.length > 0 && route.length <= 1 && candidates.length === 0 && <p className="tool-note" data-testid="route-no-door">내 자리 칸에 문이 없어. 도와줘를 눌러 봐.</p>}
        {!hasStart && <p className="tool-note">내 자리가 없어. 도와줘를 눌러 봐.</p>}
        <button type="button" className="link-btn" data-testid="route-clear" disabled={route.length === 0} onClick={() => clearRoute(which)}>다시 고르기</button>
      </aside>
      <section className="paper">
        <PlanView
          plan={plan}
          layout={layout}
          look={look}
          showRoute
          glow={glow}
          onPointer={(kind) => {
            if (kind === 'up') setNudge((n) => n + 1);
          }}
          zoomable
          className="cursor-keys"
          padSide={padLeft ? 'left' : 'right'}
          ariaLabel="방향키로 나가는 길을 그리는 지도"
        >
          {cursor && route.length > 1 && (
            <g className="route-cursor" data-testid="route-cursor" data-piece={cursor.piece} transform={`translate(${cursor.pt.x * u} ${cursor.pt.y * u})`} pointerEvents="none">
              <circle className="route-cursor-ring" r="34" />
              <g transform="scale(.8)"><KidGlyph look={look} /></g>
            </g>
          )}
        </PlanView>
        <ZoomControls plan={plan} />
        {nudge > 0 && !done && (
          <p key={nudge} className="map-note fade" data-testid="route-keys-note" role="status">지도는 누르지 않아. 방향키로 가 보자.</p>
        )}
        <ArrowPad
          targets={targets}
          onArrow={onArrow}
          nudge={nudge}
          left={padLeft}
          onSide={setPadLeft}
          label="방향키로 나가는 길 그리기"
          title={done ? '밖까지 갔어!' : openDirs.length ? `${openDirs.join(' · ')}로 갈 수 있어` : '방향키로 그려'}
          center={{ testid: 'pad-back', label: '한 칸 뒤로', icon: <IconUndo size={24} />, onClick: stepBack, disabled: route.length <= 1 }}
        />
      </section>
    </>
  );
}
