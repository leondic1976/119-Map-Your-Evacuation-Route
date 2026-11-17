/**
 * 방 넣기 — 방을 골라 지도에 놓고, 놓은 방을 끌어 옮기고 크기를 바꾼다(대장 #175 · #176).
 * 점을 이어 벽을 긋는 일이 어려운 아이도 방을 차례로 붙여 집을 만든다. 안 써도 지도를 끝까지 그린다.
 *
 * 놓은 방은 「다 됐어」를 누르기 전까지 고치는 중이다. 그동안에는 놓기 전 지도에서 매번 다시 지어서
 * 옮기고 줄여도 지나간 자리에 벽이 남지 않고, 되돌리기 한 번에 통째로 사라진다.
 */
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { ARROW, type ArrowDir } from '../core/path';
import { findRoomSpot, inRoom, moveRoom, resizeRoom, roomSize, roomStep, sameRoom, stampRoom, type RoomRect, type RoomSide } from '../core/rooms';
import type { Plan, Pt } from '../core/types';
import { crayonsFor, type Crayon } from '../content/names';
import { canOpenSide, roomBaseSize } from '../content/rooms';
import { commit, currentBand, getApp, undo } from '../store/app';
import { IconClose } from './art';
import { useArrowKeys } from './ArrowPad';
import { CursorGhost } from './CursorGhost';
import { MOVE_KEYS, MoveKey } from './Layers';
import { unitOf } from './PlanView';

interface Draft {
  /** 이 방을 놓기 전의 지도 */
  base: Plan;
  rect: RoomRect;
  crayon: Crayon;
  open: RoomSide | null;
}

const FILL: Record<Crayon['kind'], string> = { room: '#ffe3a3', pass: '#c6e8f8' };

const SIDE_KEYS: { id: RoomSide; label: string; d: string }[] = [
  { id: 'top', label: '위', d: 'M12 19V5M6 11l6-6 6 6' },
  { id: 'bottom', label: '아래', d: 'M12 5v14M6 13l6 6 6-6' },
  { id: 'left', label: '왼쪽', d: 'M19 12H5M11 6l-6 6 6 6' },
  { id: 'right', label: '오른쪽', d: 'M5 12h14M13 6l6 6-6 6' },
];

/** 방 모양 — 가로세로 비율이 그대로 보인다 */
function RoomThumb({ crayon, w, h, size = 52 }: { crayon: Crayon; w: number; h: number; size?: number }) {
  const long = Math.max(w, h);
  return (
    <svg viewBox={`${-long / 2 - 0.2} ${-long / 2 - 0.2} ${long + 0.4} ${long + 0.4}`} width={size} height={size} aria-hidden="true">
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={0.12} fill={FILL[crayon.kind]} stroke="#33363b" strokeWidth={long * 0.07} strokeLinejoin="round" />
    </svg>
  );
}

/** `onBusy` 는 방 넣기를 열 때 불린다 — 가구 판처럼 함께 쓸 수 없는 것을 닫게 한다 */
export function useRooms(plan: Plan, onBusy?: () => void) {
  const [open, setOpen] = useState(false);
  const [placing, setPlacing] = useState<Crayon | null>(null);
  const [kept, setDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // 끌어다 놓는 중 — 지도 밖에 놓으면 고른 채로 남는다
  const [carrying, setCarrying] = useState(false);
  const groups = crayonsFor(currentBand());

  // 우리가 지은 지도. 되돌리기나 다른 도구로 지도가 달라지면 고치던 방을 놓는다
  const made = useRef<Plan | null>(null);
  const draft = kept && plan === made.current ? kept : null;
  useEffect(() => {
    if (kept && plan !== made.current) setDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  // 놓은 방은 끌어서 옮긴다
  const grab = useRef<{ from: Pt; rect: RoomRect } | null>(null);
  const [held, setHeld] = useState(false);
  const finish = () => {
    grab.current = null;
    setHeld(false);
    made.current = null;
    setDraft(null);
    setNote(null);
  };
  const stop = () => {
    setOpen(false);
    setPlacing(null);
    setCarrying(false);
    finish();
  };

  /** 방을 짓는다. 안 되면 까닭을 알리고 그대로 둔다 */
  const apply = (base: Plan, rect: RoomRect, crayon: Crayon, side: RoomSide | null, merge: boolean): boolean => {
    const res = stampRoom(base, { rect, tag: { kind: crayon.kind, name: crayon.name }, open: side });
    if (!res.ok) {
      setNote(res.why === 'wall' ? '거기에는 벽이 있어. 벽이 없는 자리로 옮겨 봐.' : '종이 밖으로는 못 가.');
      return false;
    }
    made.current = res.plan;
    commit(res.plan, { merge });
    setDraft({ base, rect, crayon, open: side });
    setNote(null);
    return true;
  };

  /** 지도를 누른 자리에 방을 놓는다. 자리가 좁으면 들어가는 크기로 줄여 놓는다 */
  const place = (crayon: Crayon, at: Pt) => {
    const rect = findRoomSpot(plan, roomSize(plan, roomBaseSize(crayon.id)), at);
    if (!rect) {
      setNote('여기는 자리가 없어. 벽이 없는 넓은 자리를 눌러 봐.');
      return;
    }
    if (apply(plan, rect, crayon, null, false)) setPlacing(null);
  };

  /** 지도 위의 손길을 먼저 받는다. 방을 놓거나 옮기는 중이면 true 를 돌려준다 */
  const pointer = (kind: 'down' | 'move' | 'up' | 'cancel', p: Pt): boolean => {
    if (placing) {
      if (kind === 'up') place(placing, p);
      return true;
    }
    if (!draft) return false;
    if (kind === 'down') {
      if (inRoom(draft.rect, p)) {
        grab.current = { from: p, rect: draft.rect };
        setHeld(true);
        return true;
      }
      // 방 밖을 누르면 다 고친 것이다. 그 손길은 그대로 그리기가 된다
      finish();
      return false;
    }
    const start = grab.current;
    if (!start) return false;
    if (kind === 'move') {
      const next = moveRoom(plan, start.rect, Math.round(p.x - start.from.x), Math.round(p.y - start.from.y));
      if (!sameRoom(next, draft.rect)) apply(draft.base, next, draft.crayon, draft.open, true);
      return true;
    }
    grab.current = null;
    setHeld(false);
    return true;
  };

  /** 방 고르기 — 고른 뒤 지도를 누르면 놓인다 */
  const pick = (crayon: Crayon) => {
    finish();
    setPlacing(crayon);
    setOpen(false);
  };

  /** 마우스로 방을 잡아 지도까지 끌어다 놓는다. 손을 뗀 자리가 지도면 지도가 받아서 놓는다 */
  const startCarry = (crayon: Crayon, e: RPointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const from = { x: e.clientX, y: e.clientY };
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      if (moved || Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < 10) return;
      moved = true;
      pick(crayon);
      setCarrying(true);
    };
    const end = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      setCarrying(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  useEffect(() => {
    if (!open && !placing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      setPlacing(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, placing]);

  const fixing = draft !== null && !placing && !open;
  const nudge = (dir: ArrowDir) => {
    if (!draft) return;
    const step = roomStep(plan);
    const next = moveRoom(plan, draft.rect, ARROW[dir].x * step, ARROW[dir].y * step);
    if (sameRoom(next, draft.rect)) setNote('종이 밖으로는 못 가.');
    else apply(draft.base, next, draft.crayon, draft.open, true);
  };
  const resize = (axis: 'w' | 'h', dir: 1 | -1) => {
    if (!draft) return;
    const next = resizeRoom(plan, draft.rect, axis, dir);
    if (next) apply(draft.base, next, draft.crayon, draft.open, true);
  };
  const setSide = (side: RoomSide | null) => {
    if (draft) apply(draft.base, draft.rect, draft.crayon, side, true);
  };
  /** 놓은 방을 치운다 — 놓기 전 지도로 돌아간다 */
  const remove = () => {
    if (!draft) return;
    const app = getApp();
    const base = draft.base;
    finish();
    if (app.past[app.past.length - 1] === base) undo();
    else commit(base, { merge: true });
  };
  // 고치는 동안에는 키보드 방향키도 방을 옮긴다
  useArrowKeys(nudge, fixing);
  useEffect(() => {
    if (!fixing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fixing]);

  const chip = (c: Crayon) => {
    const [w, h] = roomBaseSize(c.id);
    return (
      <button type="button" key={c.id} className={placing?.id === c.id ? 'layer-card on' : 'layer-card'} data-testid={`room-${c.id}`} onPointerDown={(e) => startCarry(c, e)} onClick={() => pick(c)}>
        <RoomThumb crayon={c} w={w} h={h} size={44} />
        <b>{c.label}</b>
      </button>
    );
  };

  const button = (
    <>
      <button type="button" className={open || placing || draft ? 'tool on' : 'tool'} data-testid="layer-rooms" aria-expanded={open} onClick={() => { onBusy?.(); finish(); setPlacing(null); setOpen(!open); }}>
        방 넣기
      </button>
      {placing && (
        <button type="button" className="tool" data-testid="room-stop" onClick={() => setPlacing(null)}>
          {placing.label} 그만
        </button>
      )}
    </>
  );

  const panel = open && (
    <div className="layer" role="dialog" aria-label="방 넣기" data-testid="layer-rooms-panel">
      <button type="button" className="x" aria-label="닫기" data-testid="rooms-close" onClick={() => setOpen(false)}><IconClose /></button>
      <h3>방 넣기</h3>
      <p className="layer-note">방을 고르고 지도를 눌러 놓아. 마우스로 끌어다 놓아도 돼. 놓은 다음에 크기를 바꿔. 안 써도 돼.</p>
      <h4>노란색 칸</h4>
      <div className="layer-grid rooms">{groups.room.map(chip)}</div>
      <h4>파란색 칸</h4>
      <div className="layer-grid rooms">{groups.pass.map(chip)}</div>
    </div>
  );

  const u = unitOf(plan);
  const placingSize = placing ? roomSize(plan, roomBaseSize(placing.id)) : null;
  /** 놓는 동안 손 아래에 따라다니는 방 그림 — 지도에 놓일 크기 그대로다 */
  const ghost = placing && placingSize && (
    <CursorGhost name={`room-${placing.id}`}>
      <rect x={(-placingSize.w * u) / 2} y={(-placingSize.h * u) / 2} width={placingSize.w * u} height={placingSize.h * u} rx={8} fill={FILL[placing.kind]} stroke="#33363b" strokeWidth={7} strokeLinejoin="round" />
      <text className="ghost-word" x={0} y={0} style={{ fontSize: Math.min(30, (placingSize.w * u) / Math.max(2, placing.label.length) / 1.1) }}>{placing.label}</text>
    </CursorGhost>
  );

  const banner = placing ? (
    <p className="map-note" data-testid="room-note" role="status">
      {note ?? (carrying ? `${placing.label}: 지도 위에서 손을 떼면 놓여.` : `${placing.label}: 놓을 자리를 눌러 봐.`)}
    </p>
  ) : note ? (
    <p className="map-note" data-testid="room-note" role="status">{note}</p>
  ) : null;

  /** 고치는 방 둘레의 점선 — 지도 그림 안에 넣는다 */
  const ring = draft && !placing && (
    <rect className={held ? 'room-ring held' : 'room-ring'} data-testid="room-ring" x={draft.rect.x * u - 7} y={draft.rect.y * u - 7} width={draft.rect.w * u + 14} height={draft.rect.h * u + 14} rx={12} pointerEvents="none" />
  );

  /**
   * 방 고치기 판 — 옮기고, 가로와 세로를 따로 키우고 줄이고, 부엌이면 트인 쪽을 고른다.
   * 방을 가리지 않게 방이 있는 쪽의 반대편에 뜬다.
   */
  const bar = fixing && draft && (
    <div
      className={draft.rect.x + draft.rect.w / 2 > plan.cols / 2 ? 'item-pad room-pad left' : 'item-pad room-pad'}
      role="dialog"
      aria-label={`${draft.crayon.label} 고치기`}
      data-testid="room-bar"
      data-room={draft.crayon.id}
      data-rect={`${draft.rect.x},${draft.rect.y},${draft.rect.w},${draft.rect.h}`}
      data-open={draft.open ?? ''}
    >
      <button type="button" className="x" aria-label="닫기" data-testid="room-close" onClick={finish}><IconClose /></button>
      <h3>{draft.crayon.label} 고치기</h3>
      <div className="item-keys">
        <button type="button" className="tool" style={{ gridArea: 'tl' }} data-testid="room-narrower" disabled={!resizeRoom(plan, draft.rect, 'w', -1)} onClick={() => resize('w', -1)}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M3 12h7M21 12h-7M7 8l4 4-4 4M17 8l-4 4 4 4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          가로 작게
        </button>
        <button type="button" className="tool" style={{ gridArea: 'tr' }} data-testid="room-wider" disabled={!resizeRoom(plan, draft.rect, 'w', 1)} onClick={() => resize('w', 1)}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          가로 크게
        </button>
        {MOVE_KEYS.map((key) => <MoveKey key={key.dir} {...key} onMove={nudge} prefix="room" />)}
        <span className="item-face room-face" style={{ gridArea: 'face' }} data-testid="room-size">
          <RoomThumb crayon={draft.crayon} w={draft.rect.w} h={draft.rect.h} size={34} />
          <small>{draft.rect.w}×{draft.rect.h}칸</small>
        </span>
        <button type="button" className="tool" style={{ gridArea: 'sm' }} data-testid="room-shorter" disabled={!resizeRoom(plan, draft.rect, 'h', -1)} onClick={() => resize('h', -1)}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 3v7M12 21v-7M8 7l4 4 4-4M8 17l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          세로 작게
        </button>
        <button type="button" className="tool" style={{ gridArea: 'bg' }} data-testid="room-taller" disabled={!resizeRoom(plan, draft.rect, 'h', 1)} onClick={() => resize('h', 1)}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          세로 크게
        </button>
      </div>
      {canOpenSide(draft.crayon.id) && (
        <div className="room-open" role="group" aria-label="트인 쪽">
          <h4>트인 쪽 — 문 없이 뚫린 곳</h4>
          <div className="room-sides">
            {SIDE_KEYS.map((s) => (
              <button type="button" key={s.id} className={draft.open === s.id ? 'tool on' : 'tool'} data-testid={`room-open-${s.id}`} aria-label={`${s.label}쪽 트기`} aria-pressed={draft.open === s.id} onClick={() => setSide(draft.open === s.id ? null : s.id)}>
                <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d={s.d} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            ))}
            <button type="button" className={draft.open === null ? 'tool on' : 'tool'} data-testid="room-open-none" aria-pressed={draft.open === null} onClick={() => setSide(null)}>없음</button>
          </div>
        </div>
      )}
      <p className="item-hint">방을 끌어도 옮겨져. 「다 됐어」 뒤에는 연필과 지우개로 고쳐.</p>
      <div className="tool-row across">
        <button type="button" className="tool" data-testid="room-delete" onClick={remove}>치우기</button>
        <button type="button" className="tool on" data-testid="room-ok" onClick={finish}>다 됐어</button>
      </div>
    </div>
  );

  return { button, panel, ghost, banner, bar, ring, pointer, stop, placing: placing !== null, fixing: draft !== null, held, busy: open || placing !== null || draft !== null };
}
