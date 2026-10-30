'use client';

/**
 * 어린이 도면 편집기 — PlanSvg 위에 조작을 얹는다.
 *
 * 그리기 편의가 최우선이다 (docs/DESIGN-v1.1-changes.md §2).
 *   D2  팔레트 클릭 → 도면 클릭이면 표준 크기로 놓인다. 끌기는 선택
 *   D3  문은 팔레트에서 고르고 원하는 방 벽을 한 번 눌러 놓는다
 *   D4  겹치는 배치는 시도부터 막는다
 *   FR-7.9 화면은 늘 내용에 맞춰 들어온다. 줌 조작이 없다
 * 게임 중에는 같은 SVG 위에 위험장을 그리고, 칸을 누르면 그 방향으로 한 칸 간다.
 *
 * 마우스가 없어도 다 된다 (설계서 v1.0 §7.4). 도면에 Tab 으로 들어와 방향키로 칸을 옮기고
 * Enter 로 누른다 — 누르는 것과 똑같은 자리로 들어가므로 두 벌을 만들지 않는다.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Cell, OpeningBlock, OpeningSpan, Rect, RoomKind, Side } from '../types/plan';
import { isOpening, isPoint, isRoom, pointFootprint } from '../types/plan';
import type { Direction } from '../types/game';
import { roomAt, canPlaceOpening, canPlaceRoom } from '../core/grid/occupancy';
import { boundarySlots, lineCells, nearestSlot, rectFromDrag, sameCell, slotCenter } from '../core/grid/geometry';
import { blocksInRect } from '../core/grid/occupancy';
import { canDefineShellZone, canInsertShellRoom, canReflowShellRoom } from '../core/plan/reflow';
import { suggestedRoute, useKids } from '../store/kidsStore';
import { CS, PlanSvg, type GameLayer } from './PlanSvg';
import { blockDef } from '../content';

type Handle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

type Drag =
  | { kind: 'room'; start: Cell; moved: boolean; preview: Rect | null }
  | { kind: 'band'; start: Cell; add: boolean; rect: Rect | null }
  | { kind: 'multiMove'; start: Cell; dx: number; dy: number }
  | { kind: 'move'; id: string; start: Cell; cell: Cell; offset: Cell }
  | { kind: 'openingMove'; id: string; start: { cell: Cell; side: Side }; slot: { cell: Cell; side: Side }; moved: boolean }
  | { kind: 'roomMove'; id: string; start: Cell; dx: number; dy: number }
  /* 거실 같은 열린 바닥은 끌어도 옮겨지지 않는다 — 한 번만 말해 준다 */
  | { kind: 'zoneHint'; start: Cell; told: boolean }
  | { kind: 'resize'; id: string; handle: Handle; start: Cell; base: Rect; rect: Rect }
  /* 고른 문·창의 끝 손잡이를 벽을 따라 끌어 너비를 바꾼다 */
  | { kind: 'openingSpan'; id: string; base: OpeningBlock; span: number }
  | { kind: 'route'; last: Cell };

interface Props {
  showHint: boolean;
  grayscale: boolean;
}

export default function KidsCanvas({ showHint, grayscale }: Props) {
  const plan = useKids((s) => s.plan);
  const routes = useKids((s) => s.routes);
  const hazardId = useKids((s) => s.hazardId);
  const routeSlot = useKids((s) => s.routeSlot);
  const tool = useKids((s) => s.tool);
  const armed = useKids((s) => s.armed);
  const selection = useKids((s) => s.selection);
  const multi = useKids((s) => s.multi);
  const drafting = useKids((s) => s.drafting);
  const highlight = useKids((s) => s.highlight);
  const profile = useKids((s) => s.profile);
  const step = useKids((s) => s.step);
  const mode = useKids((s) => s.mode);
  const game = useKids((s) => s.game);
  const canvasZoom = useKids((s) => s.canvasZoom);
  const canvasRef = useRef<HTMLDivElement>(null);

  /*
   * Ctrl+휠(트랙패드 오므리기 포함)은 브라우저가 아니라 도면을 키운다 (설계서 v1.19 §2.1).
   * React 의 onWheel 은 passive 라 preventDefault 가 듣지 않아 직접 단다.
   */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      useKids.getState().zoomCanvas(e.deltaY < 0 ? 'in' : 'out');
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /** 가운데 단추로 끌면 확대한 도면을 움직인다. 왼쪽 단추는 도면 조작 그대로다 */
  const onPanStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 1) return;
    const el = canvasRef.current;
    if (!el) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    const move = (ev: PointerEvent) => {
      el.scrollLeft = start.left - (ev.clientX - start.x);
      el.scrollTop = start.top - (ev.clientY - start.y);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }, []);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<Rect | null>(null);
  const [ghost, setGhost] = useState<{ cell: Cell; side: Side } | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [movePreview, setMovePreview] = useState<{ id: string; cell: Cell } | null>(null);
  const [openingPreview, setOpeningPreview] = useState<{ id: string; cell: Cell; side: Side; allowed: boolean } | null>(null);
  const [roomShift, setRoomShift] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [resizePreview, setResizePreview] = useState<Rect | null>(null);
  const [spanPreview, setSpanPreview] = useState<OpeningBlock | null>(null);
  /** 끌어서 두르는 네모 */
  const [band, setBand] = useState<Rect | null>(null);
  /** 여럿을 함께 옮기는 중의 치우침 */
  const [multiShift, setMultiShift] = useState<{ dx: number; dy: number } | null>(null);
  /** 키보드 커서. 도면에 초점이 있을 때만 보인다 */
  const [caret, setCaret] = useState<Cell | null>(null);
  /**
   * 초점이 누름 때문에 온 것인지 표시해 둔다.
   * 도면을 누르면 SVG 가 초점을 받는데, 그때마다 키보드 커서를 도면 한가운데에
   * 띄우면 누른 자리와 상관없는 노란 네모가 튀어나온다. 키보드로 들어왔을 때만 띄운다.
   */
  const pointerFocus = useRef(false);

  const pair = routes[hazardId];
  const inGame = mode === 'game' && game;
  /* 방은 고르면 언제나 옮기고 크기를 바꿀 수 있다 — 내 자리·만나는 곳 고르는 두 단계만 뺀다 (설계서 v2.0 §10) */
  const canAdjustRooms = step !== 'mySpot' && step !== 'meeting' && step !== 'template';
  const suggested = useMemo(
    () => (showHint && !inGame ? suggestedRoute({ plan, hazardId, routeSlot, profile, routes }) : null),
    [showHint, inGame, plan, hazardId, routeSlot, profile, routes],
  );
  const slots = useMemo(() => {
    const roomWalls = plan.blocks.filter(isRoom).filter((room) => room.wallMode !== 'zone').flatMap((room) => boundarySlots(room.rect));
    if (!plan.shell) return roomWalls;
    const inside = new Set(plan.shell.cells.map((cell) => `${cell.x},${cell.y}`));
    const shellWalls = plan.shell.cells.flatMap((cell) => ([
      ['N', { x: cell.x, y: cell.y - 1 }],
      ['E', { x: cell.x + 1, y: cell.y }],
      ['S', { x: cell.x, y: cell.y + 1 }],
      ['W', { x: cell.x - 1, y: cell.y }],
    ] as [Side, Cell][]).filter(([, other]) => !inside.has(`${other.x},${other.y}`)).map(([side]) => ({ cell, side })));
    const unique = new Map(roomWalls.concat(shellWalls).map((slot) => [`${slot.cell.x},${slot.cell.y},${slot.side}`, slot]));
    return [...unique.values()];
  }, [plan]);

  /* 화면 좌표 → 셀 좌표(실수) */
  const toPoint = useCallback((e: React.PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x / CS, y: p.y / CS };
  }, []);

  const toCell = useCallback(
    (p: { x: number; y: number }): Cell => ({
      x: Math.max(0, Math.min(plan.grid.width - 1, Math.floor(p.x))),
      y: Math.max(0, Math.min(plan.grid.height - 1, Math.floor(p.y))),
    }),
    [plan.grid.width, plan.grid.height],
  );

  /** 무엇을 눌렀나 — 벽의 가는 문·창 > 물건 > 방. 문선 밖에서는 큰 가구를 그대로 잡는다. */
  const hitTest = useCallback(
    (p: { x: number; y: number }): string | null => {
      const c = toCell(p);
      for (const b of plan.blocks) {
        if (!isOpening(b) || b.hideInPlan) continue;
        const span = b.span ?? 1;
        const anchor = slotCenter(b.cell, b.side);
        const sc = b.side === 'N' || b.side === 'S'
          ? { x: anchor.x + (span - 1) / 2, y: anchor.y }
          : { x: anchor.x, y: anchor.y + (span - 1) / 2 };
        /* 문·창을 고르는 판을 넓혔다 — 작아서 잘 안 눌린다는 지적을 받았다 */
        const along = b.side === 'N' || b.side === 'S' ? Math.abs(sc.x - p.x) : Math.abs(sc.y - p.y);
        const across = b.side === 'N' || b.side === 'S' ? Math.abs(sc.y - p.y) : Math.abs(sc.x - p.x);
        if (along <= span / 2 + 0.12 && across < 0.34) return b.id;
      }
      /* 뒤에 그린 물건이 화면 위에 있다. 좌표만 쓸 때도 보이는 순서의 맨 위를 고른다. */
      const pt = plan.blocks.slice().reverse().find((b) => {
        if (!isPoint(b)) return false;
        const size = pointFootprint({ ...b, size: b.size ?? blockDef(b.subKind)?.size });
        return c.x >= b.cell.x && c.x < b.cell.x + size.w && c.y >= b.cell.y && c.y < b.cell.y + size.h;
      });
      if (pt) return pt.id;
      return roomAt(plan, c)?.id ?? null;
    },
    [plan, toCell],
  );

  /**
   * 하나 놓으면 팔레트에서 손을 뗀다 (설계서 v1.5 §4).
   * 장전한 채로 두면 도면을 누를 때마다 같은 것이 계속 놓여, 고르려다 실수로
   * 침대를 넷 놓는 일이 생긴다. 한 번에 하나씩 놓고 다시 고르게 한다.
   */
  const disarm = () => useKids.getState().arm(null);

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== undefined && e.button !== 0) return;
    pointerFocus.current = true;
    setCaret(null);
    const s = useKids.getState();
    const p = toPoint(e);
    const c = toCell(p);

    /* 게임 — 누른 칸 쪽으로 한 칸 */
    if (inGame && game) {
      const pc = game.state.player.cell;
      const dx = c.x - pc.x;
      const dy = c.y - pc.y;
      if (dx === 0 && dy === 0) return;
      const d: Direction = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      s.gameMove(d);
      return;
    }
    if (mode !== 'edit') return;

    /* 온보딩 — 방 누르기, 만나는 곳 누르기 */
    if (step === 'mySpot') {
      s.pickMyRoom(c);
      return;
    }
    if (step === 'meeting') {
      s.pickMeeting(c);
      return;
    }

    const target = e.target as Element;
    const exactId = target.closest?.('[data-block]')?.getAttribute('data-block') ?? null;
    const geometricId = hitTest(p);
    const geometricBlock = geometricId ? plan.blocks.find((block) => block.id === geometricId) : undefined;
    /* 큰 가구가 문 위까지 덮여도 가는 문선 가까이를 누르면 문·창을 고른다. */
    const hitId = geometricBlock && isOpening(geometricBlock) ? geometricId : exactId ?? geometricId;
    const handle = target.closest?.('[data-handle]')?.getAttribute('data-handle') as Handle | null;
    /* 문·창 끝 손잡이 — 방 손잡이보다 먼저 본다 */
    if (tool === 'select' && canAdjustRooms && selection && s.multi.length <= 1 && target.closest?.('[data-opening-grip]')) {
      const opening = plan.blocks.find((b) => b.id === selection);
      if (opening && isOpening(opening)) {
        dragRef.current = { kind: 'openingSpan', id: opening.id, base: opening, span: opening.span ?? 1 };
        setSpanPreview(opening);
        svgRef.current?.setPointerCapture(e.pointerId);
        return;
      }
    }
    /* 크기 손잡이는 한 방만 골랐을 때만 작동해, 여러 블록의 전체 이동을 가로채지 않는다. */
    if (tool === 'select' && canAdjustRooms && handle && selection && s.multi.length <= 1) {
      const room = plan.blocks.find((b) => b.id === selection);
      /* 트인 주방 같은 구역도 손잡이로 범위를 바꾼다. 거실은 남는 바닥이라 손잡이가 없다 */
      if (room && isRoom(room) && !(room.wallMode === 'zone' && room.roomKind === 'living')) {
        dragRef.current = { kind: 'resize', id: room.id, handle, start: c, base: room.rect, rect: room.rect };
        setResizePreview(room.rect);
        svgRef.current?.setPointerCapture(e.pointerId);
        return;
      }
    }

    if (tool === 'place' && armed) {
      if (armed.category === 'room') {
        dragRef.current = { kind: 'room', start: c, moved: false, preview: null };
        setPreview(null);
      } else if (armed.category === 'opening') {
        const slot = nearestSlot(slots, p);
        if (slot) {
          const sc = slotCenter(slot.cell, slot.side);
          if ((sc.x - p.x) ** 2 + (sc.y - p.y) ** 2 < 0.5) {
            s.placeOpening(armed.id as never, slot.cell, slot.side);
            disarm();
          } else s.notify('문·창은 방의 벽 위에 놓는다. 벽 가까이를 눌러 보자.', 'warn');
        } else {
          s.notify('먼저 방을 만들어야 문·창을 놓을 수 있다.', 'warn');
        }
      } else if (s.placePoint(armed.category, armed.id as never, c)) {
        disarm();
      }
    } else if (tool === 'select') {
      /* 같은 칸에 침대와 내 위치가 겹쳐도 실제로 누른 SVG 블록을 먼저 고른다. */
      const id = hitId;
      const add = e.ctrlKey || e.metaKey;

      /* Ctrl+누르기 — 골라 둔 것에 더하거나 뺀다 (설계서 v1.5 §1) */
      if (add) {
        if (id) s.toggleSelect(id);
        else dragRef.current = { kind: 'band', start: c, add: true, rect: null };
        return;
      }

      /* 여럿을 골라 둔 채 그중 하나를 끌면 다 같이 간다 */
      if (id && s.multi.length > 1 && s.multi.includes(id)) {
        dragRef.current = { kind: 'multiMove', start: c, dx: 0, dy: 0 };
        setMultiShift({ dx: 0, dy: 0 });
        svgRef.current?.setPointerCapture(e.pointerId);
        return;
      }

      s.select(id);
      if (id) {
        const b = plan.blocks.find((x) => x.id === id);
        /* 문·창도 가구처럼 선택한 뒤 벽을 따라 끌어서 옮긴다. 상태·방향은 위 조작부에서 바꾼다. */
        if (b && isOpening(b)) {
          dragRef.current = { kind: 'openingMove', id, start: { cell: b.cell, side: b.side }, slot: { cell: b.cell, side: b.side }, moved: false };
          setOpeningPreview({ id, cell: b.cell, side: b.side, allowed: true });
        }
        else if (b && isPoint(b)) dragRef.current = { kind: 'move', id, start: b.cell, cell: b.cell, offset: { x: c.x - b.cell.x, y: c.y - b.cell.y } };
        else if (b && isRoom(b) && canAdjustRooms) {
          if (b.wallMode === 'zone') dragRef.current = { kind: 'zoneHint', start: c, told: false };
          else dragRef.current = { kind: 'roomMove', id, start: c, dx: 0, dy: 0 };
        }
      } else {
        /* 빈 곳에서 끌면 네모로 두른다 */
        dragRef.current = { kind: 'band', start: c, add: false, rect: null };
      }
    } else if (tool === 'route') {
      s.startRoute(c);
      dragRef.current = { kind: 'route', last: c };
    } else if (tool === 'erase') {
      const exactId = target.closest?.('[data-block]')?.getAttribute('data-block') ?? null;
      const id = exactId ?? hitTest(p);
      if (id) s.removeBlock(id);
    }
    if (dragRef.current) svgRef.current?.setPointerCapture(e.pointerId);
  };

  /**
   * 키보드로 한 칸을 "누른다". onDown 의 칸 단위 갈래를 그대로 따르되,
   * 점 하나가 아니라 칸을 받으므로 문·창은 그 칸에서 가장 가까운 벽자리에 놓는다.
   */
  const activate = (c: Cell) => {
    const s = useKids.getState();
    if (inGame && game) {
      const pc = game.state.player.cell;
      const dx = c.x - pc.x;
      const dy = c.y - pc.y;
      if (dx === 0 && dy === 0) return;
      s.gameMove(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
      return;
    }
    if (mode !== 'edit') return;
    if (step === 'mySpot') {
      s.pickMyRoom(c);
      return;
    }
    if (step === 'meeting') {
      s.pickMeeting(c);
      return;
    }
    const mid = { x: c.x + 0.5, y: c.y + 0.5 };
    if (tool === 'place' && armed) {
      if (armed.category === 'room') {
        const placed = armed.roomMode === 'zone'
          ? s.placeZone(armed.id as RoomKind, c)
          : s.placeRoom(armed.id as RoomKind, c);
        if (placed) disarm();
      }
      else if (armed.category === 'opening') {
        const slot = nearestSlot(slots, mid);
        if (slot) {
          s.placeOpening(armed.id as never, slot.cell, slot.side);
          disarm();
        }
        else s.notify('먼저 방을 만들어야 문·창을 놓을 수 있다.', 'warn');
      } else if (s.placePoint(armed.category, armed.id as never, c)) disarm();
    } else if (tool === 'select') {
      const id = hitTest(mid);
      s.select(id);
      const b = id ? plan.blocks.find((x) => x.id === id) : undefined;
      /* Enter는 고르기만 한다. 문 상태와 열림 방향은 선택 조작부에서 바꾼다. */
    } else if (tool === 'route') {
      if (drafting) s.extendRoute(c);
      else s.startRoute(c);
    } else if (tool === 'erase') {
      const id = hitTest(mid);
      if (id) s.removeBlock(id);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    // 게임 중에는 방향키가 곧 이동이다. 가로채지 않고 그대로 흘려 보낸다
    if (inGame) return;
    const DIR: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = DIR[e.key];
    if (d) {
      e.preventDefault();
      const from = caret ?? { x: Math.floor(plan.grid.width / 2), y: Math.floor(plan.grid.height / 2) };
      setCaret({
        x: Math.max(0, Math.min(plan.grid.width - 1, from.x + d[0])),
        y: Math.max(0, Math.min(plan.grid.height - 1, from.y + d[1])),
      });
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate(caret ?? { x: Math.floor(plan.grid.width / 2), y: Math.floor(plan.grid.height / 2) });
    }
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (inGame) return;
    const p = toPoint(e);
    const c = toCell(p);
    if (!hover || !sameCell(hover, c)) setHover(c);

    if (tool === 'place' && armed?.category === 'opening') {
      const slot = nearestSlot(slots, p);
      if (slot) {
        const sc = slotCenter(slot.cell, slot.side);
        setGhost((sc.x - p.x) ** 2 + (sc.y - p.y) ** 2 < 0.5 ? slot : null);
      } else setGhost(null);
    } else if (ghost) setGhost(null);

    const d = dragRef.current;
    if (!d) return;
    const s = useKids.getState();
    switch (d.kind) {
      case 'room':
        if (!sameCell(d.start, c)) d.moved = true;
        d.preview = rectFromDrag(d.start, c);
        setPreview(d.preview);
        break;
      case 'move':
        d.cell = { x: c.x - d.offset.x, y: c.y - d.offset.y };
        setMovePreview({ id: d.id, cell: d.cell });
        break;
      case 'openingMove': {
        const slot = nearestSlot(slots, p);
        if (!slot) break;
        const target = plan.blocks.find((block) => block.id === d.id);
        if (!target || !isOpening(target)) break;
        d.slot = slot;
        d.moved = slot.side !== d.start.side || !sameCell(slot.cell, d.start.cell);
        setOpeningPreview({ id: d.id, ...slot, allowed: canPlaceOpening(plan, { ...target, ...slot }) });
        break;
      }
      case 'roomMove':
        d.dx = c.x - d.start.x;
        d.dy = c.y - d.start.y;
        setRoomShift({ id: d.id, dx: d.dx, dy: d.dy });
        break;
      case 'zoneHint':
        if (!d.told && !sameCell(c, d.start)) {
          d.told = true;
          s.notify('거실 같은 열린 바닥은 끌어 옮기지 않아. 방을 옮기거나 테두리 점으로 크기를 바꾸면 남는 바닥이 저절로 따라와.', 'warn');
        }
        break;
      case 'band':
        d.rect = rectFromDrag(d.start, c, 1);
        setBand(d.rect);
        break;
      case 'multiMove':
        d.dx = c.x - d.start.x;
        d.dy = c.y - d.start.y;
        setMultiShift({ dx: d.dx, dy: d.dy });
        break;
      case 'resize':
        d.rect = applyHandle(d.base, d.handle, c.x - d.start.x, c.y - d.start.y);
        setResizePreview(d.rect);
        break;
      case 'openingSpan': {
        const along = d.base.side === 'N' || d.base.side === 'S' ? c.x - d.base.cell.x : c.y - d.base.cell.y;
        const span = Math.max(1, Math.min(openingMaxSpan(d.base), along + 1));
        if (span !== d.span) {
          d.span = span;
          setSpanPreview({ ...d.base, span: span as OpeningSpan });
        }
        break;
      }
      case 'route':
        if (!sameCell(d.last, c)) {
          for (const stepCell of lineCells(d.last, c)) s.extendRoute(stepCell);
          d.last = c;
        }
        break;
      default:
        break;
    }
  };

  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* 이미 풀렸다 */
    }
    if (!d) return;
    const s = useKids.getState();
    switch (d.kind) {
      case 'room':
        /* 그냥 눌렀으면 표준 크기, 끌었으면 그 크기 (FR-7.1) */
        if (armed) {
          const placed = armed.roomMode === 'zone'
            ? s.placeZone(armed.id as RoomKind, d.start, d.moved && d.preview ? d.preview : undefined)
            : s.placeRoom(armed.id as RoomKind, d.start, d.moved && d.preview ? d.preview : undefined);
          if (placed) disarm();
        }
        setPreview(null);
        break;
      case 'move':
        if (!sameCell(d.cell, d.start)) s.moveBlock(d.id, d.cell);
        setMovePreview(null);
        break;
      case 'openingMove':
        if (d.moved) s.moveOpening(d.id, d.slot.cell, d.slot.side);
        setOpeningPreview(null);
        break;
      case 'roomMove':
        if (d.dx || d.dy) s.moveRoom(d.id, d.dx, d.dy);
        setRoomShift(null);
        break;
      case 'band': {
        const r = d.rect;
        setBand(null);
        /* 한 칸도 못 두르고 그냥 눌렀으면 고른 것을 푼다 */
        if (!r || (r.w <= 1 && r.h <= 1)) {
          if (!d.add) s.select(null);
          break;
        }
        const inside = blocksInRect(plan, r);
        s.selectMany(d.add ? Array.from(new Set(s.multi.concat(inside))) : inside);
        break;
      }
      case 'multiMove':
        if (d.dx || d.dy) s.moveSelection(d.dx, d.dy);
        setMultiShift(null);
        break;
      case 'resize':
        s.resizeRoom(d.id, d.rect);
        setResizePreview(null);
        break;
      case 'openingSpan':
        if (d.span !== (d.base.span ?? 1)) s.resizeOpening(d.id, d.span as OpeningSpan, 'start');
        setSpanPreview(null);
        break;
      case 'route':
        s.endRoute();
        break;
      default:
        break;
    }
  };

  const onLeave = () => {
    setHover(null);
    setGhost(null);
  };

  /* 끝 손잡이를 보이는 문·창 — 한 개만 골랐고 도면에 보이는 것 */
  const selectedOpeningBlock = selection && multi.length <= 1 ? plan.blocks.find((b) => b.id === selection && isOpening(b) && !b.hideInPlan && b.openingKind !== 'open_passage') : undefined;
  const spanAllowed = spanPreview ? canPlaceOpening(plan, spanPreview) : false;

  /* 손잡이를 보이는 방 — 닫힌 방과 트인 구역. 거실은 남는 바닥이라 뺀다 */
  const selectedRoom = selection ? plan.blocks.find((b) => b.id === selection && isRoom(b) && !(b.wallMode === 'zone' && b.roomKind === 'living')) : undefined;
  const resizeAllowed = resizePreview && selection
    ? (plan.shell ? canReflowShellRoom(plan, selection, resizePreview) : canPlaceRoom(plan, resizePreview, selection))
    : false;
  const roomShiftAllowed = roomShift && selectedRoom && isRoom(selectedRoom)
    ? (plan.shell
        ? canReflowShellRoom(plan, selectedRoom.id, { ...selectedRoom.rect, x: selectedRoom.rect.x + roomShift.dx, y: selectedRoom.rect.y + roomShift.dy })
        : canPlaceRoom(plan, { ...selectedRoom.rect, x: selectedRoom.rect.x + roomShift.dx, y: selectedRoom.rect.y + roomShift.dy }, selectedRoom.id))
    : false;
  const previewAllowed = preview
    ? (armed?.roomMode === 'zone'
        ? canDefineShellZone(plan, preview)
        : (plan.shell ? canInsertShellRoom(plan, preview) : canPlaceRoom(plan, preview)))
    : false;
  const cursor = inGame
    ? 'pointer'
    : step === 'mySpot' || step === 'meeting'
      ? 'pointer'
      : tool === 'route'
        ? 'crosshair'
        : tool === 'erase'
          ? 'not-allowed'
          : tool === 'place'
            ? 'copy'
            : 'default';

  const W = plan.grid.width * CS;
  const H = plan.grid.height * CS;

  const gameLayer: GameLayer | null =
    inGame && game
      ? {
          field: game.state.field,
          origin: game.state.origin,
          player: { ...game.state.player, character: profile.playerCharacter },
          doorState: game.state.doorState,
          goalCells: game.goalCells.map((g) => g.cell),
          visionRadius: game.state.player.visionRadius,
          fog: true,
        }
      : null;

  return (
    <div ref={canvasRef} className={`k-canvas${grayscale ? ' k-gray' : ''}`} data-tool={tool} data-mode={mode} style={{ cursor }} onPointerDown={onPanStart}>
      {/* 맞춤 크기는 CSS 컨테이너 단위가 재고, 배율만 여기서 준다 (설계서 v1.19 §3) */}
      <div
        className="k-canvas-inner"
        data-zoom={canvasZoom}
        style={{ aspectRatio: `${W} / ${H}`, ['--plan-ratio' as string]: String(W / H), ['--k-zoom' as string]: String(canvasZoom) }}
      >
        <PlanSvg
          svgRef={svgRef}
          plan={plan}
          routePair={pair}
          showSlots={inGame ? ['primary'] : ['primary', 'alternate']}
          ghostRoutes={Boolean(inGame)}
          drafting={drafting}
          draftSlot={routeSlot}
          suggested={suggested}
          highlight={inGame ? null : highlight}
          selection={inGame ? null : selection}
          selected={inGame ? undefined : multi}
          playerCharacter={profile.playerCharacter}
          shift={inGame ? undefined : multiShift ? { ids: multi, ...multiShift } : undefined}
          style={profile.blockStyle}
          gradeMode={profile.gradeMode}
          game={gameLayer}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onLeave}
          onKeyDown={onKeyDown}
          onFocus={() => {
            /* 눌러서 들어왔으면 커서를 띄우지 않는다 — 누른 자리와 딴 곳에 네모가 뜬다 */
            if (pointerFocus.current) {
              pointerFocus.current = false;
              return;
            }
            setCaret((c) => c ?? { x: Math.floor(plan.grid.width / 2), y: Math.floor(plan.grid.height / 2) });
          }}
          onBlur={() => {
            pointerFocus.current = false;
            setCaret(null);
          }}
          focusable
          ariaLabel={`우리집 평면도 — 방향키로 칸을 옮기고 Enter 로 누른다. ${keyHint(step, tool, armed?.category)}`}
          className="k-stage"
        >
          {preview && (
            <rect
              x={preview.x * CS}
              y={preview.y * CS}
              width={preview.w * CS}
              height={preview.h * CS}
              fill={previewAllowed ? (armed?.roomMode === 'zone' ? '#f2a46f' : '#7ea6ce') : '#d92142'}
              fillOpacity={0.3}
              stroke={previewAllowed ? (armed?.roomMode === 'zone' ? '#a94816' : '#0f3d68') : '#c8102e'}
              strokeWidth={3}
              strokeDasharray="6 4"
              style={{ pointerEvents: 'none' }}
            />
          )}
          {ghost && (
            <g
              transform={`translate(${slotCenter(ghost.cell, ghost.side).x * CS} ${slotCenter(ghost.cell, ghost.side).y * CS}) rotate(${
                ghost.side === 'N' ? 0 : ghost.side === 'S' ? 180 : ghost.side === 'W' ? -90 : 90
              })`}
              style={{ pointerEvents: 'none' }}
            >
              <rect x={-CS * 0.43} y={-6} width={CS * 0.86} height={12} rx={3} fill="#ffd166" fillOpacity={0.8} stroke="#e0a100" strokeWidth={2} />
            </g>
          )}
          {/* 표준 크기 미리보기 — 방을 장전하고 도면 위에 있을 때 */}
          {hover && !preview && !inGame && tool === 'place' && armed?.category === 'room' && (
            <RoomGhost plan={plan} at={hover} kind={armed.id} mode={armed.roomMode} />
          )}
          {hover && !preview && !ghost && !inGame && (tool === 'route' || step === 'mySpot' || step === 'meeting' || (tool === 'place' && armed && armed.category !== 'room' && armed.category !== 'opening')) && (
            (() => {
              const size = tool === 'place' && armed ? blockDef(armed.id)?.size ?? { w: 1, h: 1 } : { w: 1, h: 1 };
              const x = Math.max(0, Math.min(plan.grid.width - size.w, hover.x));
              const y = Math.max(0, Math.min(plan.grid.height - size.h, hover.y));
              return <rect x={x * CS + 2} y={y * CS + 2} width={size.w * CS - 4} height={size.h * CS - 4} rx={5} fill="#0f3d68" fillOpacity={0.12} stroke="#0f3d68" strokeWidth={2} strokeDasharray="4 3" style={{ pointerEvents: 'none' }} />;
            })()
          )}
          {band && (
            <rect
              x={band.x * CS}
              y={band.y * CS}
              width={band.w * CS}
              height={band.h * CS}
              fill="#0f3d68"
              fillOpacity={0.1}
              stroke="#0f3d68"
              strokeWidth={2}
              strokeDasharray="6 4"
              style={{ pointerEvents: 'none' }}
            />
          )}
          {movePreview && (
            (() => {
              const point = plan.blocks.find((block) => block.id === movePreview.id);
              const size = point && isPoint(point) ? pointFootprint({ ...point, size: point.size ?? blockDef(point.subKind)?.size }) : { w: 1, h: 1 };
              return <rect x={movePreview.cell.x * CS + 2} y={movePreview.cell.y * CS + 2} width={size.w * CS - 4} height={size.h * CS - 4} rx={5} fill="#0f3d68" fillOpacity={0.2} stroke="#0f3d68" strokeWidth={2} style={{ pointerEvents: 'none' }} />;
            })()
          )}
          {openingPreview && (
            (() => {
              const opening = plan.blocks.find((block) => block.id === openingPreview.id);
              const span = opening && isOpening(opening) ? opening.span ?? 1 : 1;
              const center = slotCenter(openingPreview.cell, openingPreview.side);
              const x = (center.x + (openingPreview.side === 'N' || openingPreview.side === 'S' ? (span - 1) / 2 : 0)) * CS;
              const y = (center.y + (openingPreview.side === 'E' || openingPreview.side === 'W' ? (span - 1) / 2 : 0)) * CS;
              const horizontal = openingPreview.side === 'N' || openingPreview.side === 'S';
              return <rect x={x - (horizontal ? span * CS / 2 : 7)} y={y - (horizontal ? 7 : span * CS / 2)} width={horizontal ? span * CS : 14} height={horizontal ? 14 : span * CS} rx={5} fill={openingPreview.allowed ? '#2b8a6e' : '#c8102e'} fillOpacity={0.28} stroke={openingPreview.allowed ? '#0f6f59' : '#c8102e'} strokeWidth={2.5} style={{ pointerEvents: 'none' }} />;
            })()
          )}
          {roomShift && selectedRoom && isRoom(selectedRoom) && (
            <rect
              x={(selectedRoom.rect.x + roomShift.dx) * CS}
              y={(selectedRoom.rect.y + roomShift.dy) * CS}
              width={selectedRoom.rect.w * CS}
              height={selectedRoom.rect.h * CS}
              fill={roomShiftAllowed ? '#7ea6ce' : '#d92142'}
              fillOpacity={0.25}
              stroke={roomShiftAllowed ? '#0f3d68' : '#c8102e'}
              strokeWidth={3}
              strokeDasharray="6 4"
              style={{ pointerEvents: 'none' }}
            />
          )}
          {resizePreview && (
            <rect
              x={resizePreview.x * CS}
              y={resizePreview.y * CS}
              width={resizePreview.w * CS}
              height={resizePreview.h * CS}
              fill="none"
              stroke={resizeAllowed ? '#0f3d68' : '#c8102e'}
              strokeWidth={3}
              strokeDasharray="6 4"
              style={{ pointerEvents: 'none' }}
            />
          )}
          {!inGame && canAdjustRooms && tool === 'select' && selectedRoom && isRoom(selectedRoom) && !roomShift && <ResizeHandles rect={selectedRoom.rect} />}
          {spanPreview && <OpeningSpanPreview opening={spanPreview} ok={spanAllowed} />}
          {!inGame && canAdjustRooms && tool === 'select' && selectedOpeningBlock && isOpening(selectedOpeningBlock) && (
            <OpeningGrip opening={spanPreview ?? selectedOpeningBlock} />
          )}
          {caret && (
            <rect
              data-caret
              x={caret.x * CS + 1}
              y={caret.y * CS + 1}
              width={CS - 2}
              height={CS - 2}
              rx={5}
              fill="#ffd166"
              fillOpacity={0.25}
              stroke="#0f3d68"
              strokeWidth={3}
              style={{ pointerEvents: 'none' }}
            />
          )}
        </PlanSvg>
      </div>
    </div>
  );
}

/** 지금 Enter 를 누르면 무슨 일이 나는지 — 화면을 못 보는 이용자에게 읽어 준다 */
function keyHint(step: string, tool: string, armed?: string): string {
  if (step === 'mySpot') return '지금은 네가 자는 방을 고르는 중이다.';
  if (step === 'meeting') return '지금은 만나는 곳을 놓는 중이다.';
  if (tool === 'place' && armed) return '지금은 고른 것을 놓는 중이다.';
  if (tool === 'route') return '지금은 길을 잇는 중이다.';
  if (tool === 'erase') return '지금은 지우는 중이다.';
  return '지금은 고르는 중이다.';
}

/** 방을 놓기 전 표준 크기 미리보기 — 겹치면 붉게 (D4) */
function RoomGhost({ plan, at, kind, mode }: { plan: Parameters<typeof canPlaceRoom>[0]; at: Cell; kind: string; mode?: 'closed' | 'zone' }) {
  const size = { bedroom: { w: 4, h: 4 }, living: { w: 6, h: 5 }, kitchen: { w: 4, h: 4 }, bath: { w: 3, h: 3 }, entry: { w: 3, h: 3 }, balcony: { w: 6, h: 2 }, utility: { w: 3, h: 2 }, corridor: { w: 5, h: 2 }, stair: { w: 3, h: 4 }, elevator_hall: { w: 3, h: 3 } }[kind] ?? { w: 4, h: 4 };
  const r = {
    x: Math.max(0, Math.min(plan.grid.width - size.w, at.x)),
    y: Math.max(0, Math.min(plan.grid.height - size.h, at.y)),
    w: size.w,
    h: size.h,
  };
  const ok = mode === 'zone' ? canDefineShellZone(plan, r) : plan.shell ? canInsertShellRoom(plan, r) : canPlaceRoom(plan, r);
  const fill = mode === 'zone' ? '#f2a46f' : '#7ea6ce';
  const stroke = mode === 'zone' ? '#a94816' : '#0f3d68';
  return (
    <rect
      x={r.x * CS}
      y={r.y * CS}
      width={r.w * CS}
      height={r.h * CS}
      fill={ok ? fill : '#d92142'}
      fillOpacity={0.22}
      stroke={ok ? stroke : '#c8102e'}
      strokeWidth={2.5}
      strokeDasharray="6 4"
      style={{ pointerEvents: 'none' }}
    />
  );
}

/** 문·창이 놓일 수 있는 가장 긴 칸 수 — 미닫이는 길게, 나머지는 세 칸까지 (너비 단추와 같다) */
function openingMaxSpan(opening: OpeningBlock): number {
  return opening.openingKind === 'sliding_door' || opening.openingKind === 'sliding_window' ? 6 : 3;
}

/** 문·창이 놓인 벽 선의 시작과 끝 (도면 좌표) */
function openingEnds(opening: OpeningBlock): { x0: number; y0: number; x1: number; y1: number; horizontal: boolean } {
  const span = opening.span ?? 1;
  const { x, y } = opening.cell;
  switch (opening.side) {
    case 'N':
      return { x0: x * CS, y0: y * CS, x1: (x + span) * CS, y1: y * CS, horizontal: true };
    case 'S':
      return { x0: x * CS, y0: (y + 1) * CS, x1: (x + span) * CS, y1: (y + 1) * CS, horizontal: true };
    case 'W':
      return { x0: x * CS, y0: y * CS, x1: x * CS, y1: (y + span) * CS, horizontal: false };
    default:
      return { x0: (x + 1) * CS, y0: y * CS, x1: (x + 1) * CS, y1: (y + span) * CS, horizontal: false };
  }
}

/** 끌고 있는 너비 — 놓일 수 있으면 파랑, 안 되면 빨강 */
function OpeningSpanPreview({ opening, ok }: { opening: OpeningBlock; ok: boolean }) {
  const e = openingEnds(opening);
  return (
    <line
      x1={e.x0}
      y1={e.y0}
      x2={e.x1}
      y2={e.y1}
      stroke={ok ? '#2f7fd0' : '#c8102e'}
      strokeOpacity={0.55}
      strokeWidth={12}
      strokeLinecap="round"
      style={{ pointerEvents: 'none' }}
    />
  );
}

/** 고른 문·창의 끝 손잡이 — 벽을 따라 끌면 너비가 바뀐다 */
function OpeningGrip({ opening }: { opening: OpeningBlock }) {
  const e = openingEnds(opening);
  const cursor = e.horizontal ? 'ew-resize' : 'ns-resize';
  return (
    <g data-opening-grip transform={`translate(${e.x1} ${e.y1})`} style={{ cursor }}>
      <title>끌어서 너비 바꾸기</title>
      <circle r={18} fill="transparent" />
      <circle r={10} fill="#ffffff" stroke="#0f3d68" strokeWidth={2.5} />
      <path
        d={e.horizontal ? 'M-5 0 H5 M-5 0 L-2.5 -2.5 M-5 0 L-2.5 2.5 M5 0 L2.5 -2.5 M5 0 L2.5 2.5' : 'M0 -5 V5 M0 -5 L-2.5 -2.5 M0 -5 L2.5 -2.5 M0 5 L-2.5 2.5 M0 5 L2.5 2.5'}
        stroke="#0f3d68"
        strokeWidth={1.8}
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

function ResizeHandles({ rect }: { rect: Rect }) {
  const x0 = rect.x * CS;
  const y0 = rect.y * CS;
  const x1 = (rect.x + rect.w) * CS;
  const y1 = (rect.y + rect.h) * CS;
  const xm = (x0 + x1) / 2;
  const ym = (y0 + y1) / 2;
  const hs: { h: Handle; x: number; y: number; cursor: string }[] = [
    { h: 'nw', x: x0, y: y0, cursor: 'nwse-resize' },
    { h: 'n', x: xm, y: y0, cursor: 'ns-resize' },
    { h: 'ne', x: x1, y: y0, cursor: 'nesw-resize' },
    { h: 'e', x: x1, y: ym, cursor: 'ew-resize' },
    { h: 'se', x: x1, y: y1, cursor: 'nwse-resize' },
    { h: 's', x: xm, y: y1, cursor: 'ns-resize' },
    { h: 'sw', x: x0, y: y1, cursor: 'nesw-resize' },
    { h: 'w', x: x0, y: ym, cursor: 'ew-resize' },
  ];
  const r = 8;
  return (
    <g>
      {hs.map((h) => (
        <rect key={h.h} data-handle={h.h} x={h.x - r} y={h.y - r} width={r * 2} height={r * 2} rx={2} fill="#ffffff" stroke="#0f3d68" strokeWidth={2} style={{ cursor: h.cursor }} />
      ))}
    </g>
  );
}

function applyHandle(base: Rect, handle: Handle, dx: number, dy: number): Rect {
  let { x, y, w, h } = base;
  if (handle.includes('n')) {
    const ny = Math.min(y + dy, y + h - 2);
    h += y - ny;
    y = ny;
  }
  if (handle.includes('s')) h = Math.max(2, h + dy);
  if (handle.includes('w')) {
    const nx = Math.min(x + dx, x + w - 2);
    w += x - nx;
    x = nx;
  }
  if (handle.includes('e')) w = Math.max(2, w + dx);
  return { x, y, w, h };
}
