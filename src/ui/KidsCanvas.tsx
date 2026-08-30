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
import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { Cell, Rect, RoomKind, Side } from '../types/plan';
import { isOpening, isPoint, isRoom } from '../types/plan';
import type { Direction } from '../types/game';
import { roomAt, canPlaceRoom } from '../core/grid/occupancy';
import { boundarySlots, lineCells, nearestSlot, rectFromDrag, sameCell, slotCenter } from '../core/grid/geometry';
import { blocksInRect } from '../core/grid/occupancy';
import { suggestedRoute, useKids } from '../store/kidsStore';
import { CS, PlanSvg, type GameLayer } from './PlanSvg';

type Handle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

type Drag =
  | { kind: 'room'; start: Cell; moved: boolean }
  | { kind: 'band'; start: Cell; add: boolean }
  | { kind: 'multiMove'; start: Cell }
  | { kind: 'move'; id: string; start: Cell }
  | { kind: 'roomMove'; id: string; start: Cell }
  | { kind: 'resize'; id: string; handle: Handle; start: Cell; base: Rect }
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

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<Rect | null>(null);
  const [ghost, setGhost] = useState<{ cell: Cell; side: Side } | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [movePreview, setMovePreview] = useState<{ id: string; cell: Cell } | null>(null);
  const [roomShift, setRoomShift] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [resizePreview, setResizePreview] = useState<Rect | null>(null);
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
  const suggested = useMemo(
    () => (showHint && !inGame ? suggestedRoute({ plan, hazardId, routeSlot, profile, routes }) : null),
    [showHint, inGame, plan, hazardId, routeSlot, profile, routes],
  );
  const slots = useMemo(() => plan.blocks.filter(isRoom).flatMap((r) => boundarySlots(r.rect)), [plan]);

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

  /** 무엇을 눌렀나 — 물건 > 문·창 > 방 */
  const hitTest = useCallback(
    (p: { x: number; y: number }): string | null => {
      const c = toCell(p);
      const pt = plan.blocks.find((b) => isPoint(b) && sameCell(b.cell, c));
      if (pt) return pt.id;
      for (const b of plan.blocks) {
        if (!isOpening(b)) continue;
        const sc = slotCenter(b.cell, b.side);
        /* 문·창을 고르는 판을 넓혔다 — 작아서 잘 안 눌린다는 지적을 받았다 */
        if ((sc.x - p.x) ** 2 + (sc.y - p.y) ** 2 < 0.3) return b.id;
      }
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
    const handle = target.getAttribute?.('data-handle') as Handle | null;
    if (tool === 'select' && handle && selection) {
      const room = plan.blocks.find((b) => b.id === selection);
      if (room && isRoom(room)) {
        dragRef.current = { kind: 'resize', id: room.id, handle, start: c, base: room.rect };
        setResizePreview(room.rect);
        svgRef.current?.setPointerCapture(e.pointerId);
        return;
      }
    }

    if (tool === 'place' && armed) {
      if (armed.category === 'room') {
        dragRef.current = { kind: 'room', start: c, moved: false };
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
      const id = hitTest(p);
      const add = e.ctrlKey || e.metaKey;

      /* Ctrl+누르기 — 골라 둔 것에 더하거나 뺀다 (설계서 v1.5 §1) */
      if (add) {
        if (id) s.toggleSelect(id);
        else dragRef.current = { kind: 'band', start: c, add: true };
        return;
      }

      /* 여럿을 골라 둔 채 그중 하나를 끌면 다 같이 간다 */
      if (id && s.multi.length > 1 && s.multi.includes(id)) {
        dragRef.current = { kind: 'multiMove', start: c };
        setMultiShift({ dx: 0, dy: 0 });
        svgRef.current?.setPointerCapture(e.pointerId);
        return;
      }

      s.select(id);
      if (id) {
        const b = plan.blocks.find((x) => x.id === id);
        /* 문·창은 누를 때마다 열리고 닫힌다. 두 번 걸치는 조작을 만들지 않는다 (FR-7 우선) */
        if (b && isOpening(b)) s.toggleOpening(b.id);
        else if (b && isPoint(b)) dragRef.current = { kind: 'move', id, start: c };
        else if (b && isRoom(b)) dragRef.current = { kind: 'roomMove', id, start: c };
      } else {
        /* 빈 곳에서 끌면 네모로 두른다 */
        dragRef.current = { kind: 'band', start: c, add: false };
      }
    } else if (tool === 'route') {
      s.startRoute(c);
      dragRef.current = { kind: 'route', last: c };
    } else if (tool === 'erase') {
      const id = hitTest(p);
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
        if (s.placeRoom(armed.id as RoomKind, c)) disarm();
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
      if (b && isOpening(b)) s.toggleOpening(b.id);
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
        setPreview(rectFromDrag(d.start, c));
        break;
      case 'move':
        setMovePreview({ id: d.id, cell: c });
        break;
      case 'roomMove':
        setRoomShift({ id: d.id, dx: c.x - d.start.x, dy: c.y - d.start.y });
        break;
      case 'band':
        setBand(rectFromDrag(d.start, c, 1));
        break;
      case 'multiMove':
        setMultiShift({ dx: c.x - d.start.x, dy: c.y - d.start.y });
        break;
      case 'resize':
        setResizePreview(applyHandle(d.base, d.handle, c.x - d.start.x, c.y - d.start.y));
        break;
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
        if (armed && s.placeRoom(armed.id as RoomKind, d.start, d.moved && preview ? preview : undefined)) disarm();
        setPreview(null);
        break;
      case 'move':
        if (movePreview && !sameCell(movePreview.cell, d.start)) s.moveBlock(d.id, movePreview.cell);
        setMovePreview(null);
        break;
      case 'roomMove':
        if (roomShift && (roomShift.dx || roomShift.dy)) s.moveRoom(d.id, roomShift.dx, roomShift.dy);
        setRoomShift(null);
        break;
      case 'band': {
        const r = band;
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
        if (multiShift && (multiShift.dx || multiShift.dy)) s.moveSelection(multiShift.dx, multiShift.dy);
        setMultiShift(null);
        break;
      case 'resize':
        if (resizePreview) s.resizeRoom(d.id, resizePreview);
        setResizePreview(null);
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

  const selectedRoom = selection ? plan.blocks.find((b) => b.id === selection && isRoom(b)) : undefined;
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
    <div className={`k-canvas${grayscale ? ' k-gray' : ''}`} data-tool={tool} data-mode={mode} style={{ cursor }}>
      <div className="k-canvas-inner" style={{ aspectRatio: `${W} / ${H}` }}>
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
              fill={canPlaceRoom(plan, preview) ? '#7ea6ce' : '#d92142'}
              fillOpacity={0.3}
              stroke={canPlaceRoom(plan, preview) ? '#0f3d68' : '#c8102e'}
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
            <RoomGhost plan={plan} at={hover} kind={armed.id} />
          )}
          {hover && !preview && !ghost && !inGame && (tool === 'route' || step === 'mySpot' || step === 'meeting' || (tool === 'place' && armed && armed.category !== 'room' && armed.category !== 'opening')) && (
            <rect x={hover.x * CS + 2} y={hover.y * CS + 2} width={CS - 4} height={CS - 4} rx={5} fill="#0f3d68" fillOpacity={0.12} stroke="#0f3d68" strokeWidth={2} strokeDasharray="4 3" style={{ pointerEvents: 'none' }} />
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
            <rect x={movePreview.cell.x * CS + 2} y={movePreview.cell.y * CS + 2} width={CS - 4} height={CS - 4} rx={5} fill="#0f3d68" fillOpacity={0.2} stroke="#0f3d68" strokeWidth={2} style={{ pointerEvents: 'none' }} />
          )}
          {roomShift && selectedRoom && isRoom(selectedRoom) && (
            <rect
              x={(selectedRoom.rect.x + roomShift.dx) * CS}
              y={(selectedRoom.rect.y + roomShift.dy) * CS}
              width={selectedRoom.rect.w * CS}
              height={selectedRoom.rect.h * CS}
              fill="#7ea6ce"
              fillOpacity={0.25}
              stroke="#0f3d68"
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
              stroke={canPlaceRoom(plan, resizePreview, selection ?? undefined) ? '#0f3d68' : '#c8102e'}
              strokeWidth={3}
              strokeDasharray="6 4"
              style={{ pointerEvents: 'none' }}
            />
          )}
          {!inGame && tool === 'select' && selectedRoom && isRoom(selectedRoom) && !roomShift && <ResizeHandles rect={selectedRoom.rect} />}
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
function RoomGhost({ plan, at, kind }: { plan: Parameters<typeof canPlaceRoom>[0]; at: Cell; kind: string }) {
  const size = { bedroom: { w: 4, h: 4 }, living: { w: 6, h: 5 }, kitchen: { w: 4, h: 4 }, bath: { w: 3, h: 3 }, entry: { w: 3, h: 3 }, balcony: { w: 6, h: 2 }, utility: { w: 3, h: 2 }, corridor: { w: 5, h: 2 }, stair: { w: 3, h: 4 }, elevator_hall: { w: 3, h: 3 } }[kind] ?? { w: 4, h: 4 };
  const r = {
    x: Math.max(0, Math.min(plan.grid.width - size.w, at.x)),
    y: Math.max(0, Math.min(plan.grid.height - size.h, at.y)),
    w: size.w,
    h: size.h,
  };
  const ok = canPlaceRoom(plan, r);
  return (
    <rect
      x={r.x * CS}
      y={r.y * CS}
      width={r.w * CS}
      height={r.h * CS}
      fill={ok ? '#7ea6ce' : '#d92142'}
      fillOpacity={0.22}
      stroke={ok ? '#0f3d68' : '#c8102e'}
      strokeWidth={2.5}
      strokeDasharray="6 4"
      style={{ pointerEvents: 'none' }}
    />
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
