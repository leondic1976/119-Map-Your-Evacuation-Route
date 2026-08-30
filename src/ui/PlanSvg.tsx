'use client';

/**
 * 평면도 SVG — 에디터·게임·인쇄가 같은 컴포넌트를 쓴다 (docs/DESIGN-v1.1-changes.md §3.9 · §8.2).
 *
 * 순수 표시만 한다. 조작은 KidsCanvas 가 이 위에 얹는다.
 * P4: 색만으로 정보를 주지 않는다. 경로는 색 + 선종류 + 번호,
 * 위험은 색 + 무늬(화염 사선·연기 점), 인쇄에서는 방 채움을 해칭으로 바꾼다.
 */
import React, { useId } from 'react';
import type { Cell, FloorPlan, OpeningBlock, PointBlock, RoomBlock, RoutePair, RouteSlot } from '../types/plan';
import { isOpening, isPoint, isRoom } from '../types/plan';
import type { HazardField } from '../types/hazard';
import type { Posture } from '../types/game';
import type { PlayerCharacter } from '../types/guide';
import { PLAYER_CHARACTERS } from '../types/guide';
import { KidToken } from './KidCharacters';
import { roomLabel } from '../core/graph/build';
import { slotCenter } from '../core/grid/geometry';
import { blockName } from '../content';
import { OpeningArt, PointArt } from './BlockArt';
import { PlayerSprite } from './Avatar';
import type { Highlight } from '../store/kidsStore';

/** 셀 한 변(SVG 단위) */
export const CS = 36;

export interface RouteStyle {
  /** 선 색. 굵은 선이므로 3:1 이면 된다 */
  color: string;
  /** 같은 색 계열의 글자 색. 작은 글자는 4.5:1 이 필요해 선보다 어둡다 (NFR-10) */
  ink: string;
  dash: string;
  no: string;
  label: string;
  short: string;
}

/** 주·보조 경로 — 색·선종류·번호를 함께 쓴다 (P4, FR-2.6 개정) */
export const SLOT_STYLE: Record<RouteSlot, RouteStyle> = {
  primary: { color: '#c8102e', ink: '#c8102e', dash: '', no: '1', label: '주 경로 — 평소 나가는 길', short: '주 경로' },
  alternate: { color: '#e07b00', ink: '#9f5700', dash: '9 6', no: '2', label: '보조 경로 — 현관으로 못 나갈 때', short: '보조 경로' },
};

const ROOM_FILL: Record<RoomBlock['roomKind'], string> = {
  bedroom: '#fff3d6',
  living: '#e8f4e2',
  kitchen: '#ffe4d1',
  bath: '#dcefff',
  entry: '#efe9f7',
  balcony: '#e6f7f4',
  utility: '#f0f0f0',
  corridor: '#f6f6ee',
  stair: '#e0e7ef',
  refuge_lobby: '#dfe9e0',
  elevator_hall: '#f3e2e2',
};

const INK = '#2a3038';

export interface GameLayer {
  field: HazardField;
  origin: Cell;
  player: { cell: Cell; posture: Posture; facing: 'left' | 'right'; character: PlayerCharacter };
  doorState: Record<string, 'open' | 'closed'>;
  goalCells: Cell[];
  visionRadius: number;
  /** 시야 밖을 가린다 */
  fog: boolean;
}

export interface PlanSvgProps {
  plan: FloorPlan;
  routePair?: RoutePair;
  /** 그릴 경로 자리. 비우면 하나도 그리지 않는다 */
  showSlots?: RouteSlot[];
  drafting?: Cell[] | null;
  draftSlot?: RouteSlot;
  /** 최단경로 힌트 */
  suggested?: Cell[] | null;
  highlight?: Highlight | null;
  selection?: string | null;
  /** 고른 것 전부 — 여럿 고르기 (설계서 v1.5 §1) */
  selected?: string[];
  /** 함께 옮기는 중의 미리보기 치우침 */
  shift?: { ids: string[]; dx: number; dy: number };
  /** 「내 자리」를 이 캐릭터 모습으로 그린다 (설계서 v1.5 §2) */
  playerCharacter?: PlayerCharacter;
  style: 'kid' | 'blueprint';
  gradeMode: 'easy' | 'normal';
  printMode?: boolean;
  showGrid?: boolean;
  /** 게임 층 */
  game?: GameLayer | null;
  /** 게임 중 그린 길을 옅게 보여 준다 */
  ghostRoutes?: boolean;
  /** 다른 SVG 안에 끼워 넣을 때의 자리. 없으면 부모를 가득 채운다 */
  frame?: { x: number; y: number; width: number; height: number };
  children?: React.ReactNode;
  svgRef?: React.Ref<SVGSVGElement>;
  onPointerDown?: React.PointerEventHandler<SVGSVGElement>;
  onPointerMove?: React.PointerEventHandler<SVGSVGElement>;
  onPointerUp?: React.PointerEventHandler<SVGSVGElement>;
  onPointerLeave?: React.PointerEventHandler<SVGSVGElement>;
  /** 키보드로 다룰 때 — 초점을 받고 방향키·Enter 를 처리한다 (설계서 v1.0 §7.4) */
  onKeyDown?: React.KeyboardEventHandler<SVGSVGElement>;
  onFocus?: React.FocusEventHandler<SVGSVGElement>;
  onBlur?: React.FocusEventHandler<SVGSVGElement>;
  focusable?: boolean;
  ariaLabel?: string;
  className?: string;
}

/** 형·동생을 어떤 캐릭터로 그릴지 — 내 캐릭터와 겹치지 않게 고른다 (설계서 v1.5 §3) */
export function siblingCharacter(subKind: string, mine: PlayerCharacter | undefined): PlayerCharacter {
  const pool = PLAYER_CHARACTERS.filter((c) => c !== mine);
  const i = subKind === 'sibling_older' ? 0 : 1;
  return pool[i % pool.length] ?? PLAYER_CHARACTERS[i];
}

export function PlanSvg(props: PlanSvgProps) {
  const {
    plan,
    routePair,
    showSlots = [],
    drafting,
    draftSlot = 'primary',
    suggested,
    highlight,
    selection,
    selected,
    shift,
    playerCharacter,
    style,
    gradeMode,
    printMode = false,
    showGrid = true,
    game,
    ghostRoutes,
    children,
    frame,
    svgRef,
    focusable,
    ariaLabel,
    className,
  } = props;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const W = plan.grid.width * CS;
  const H = plan.grid.height * CS;
  const rooms = plan.blocks.filter(isRoom);
  const roomsForDrawing = rooms.slice().sort((a, b) => Number(a.wallMode !== 'zone') - Number(b.wallMode !== 'zone'));
  const openings = plan.blocks.filter(isOpening);
  const points = plan.blocks.filter(isPoint);

  /* 고른 것 판정 — 하나만 골랐을 때도 selected 에 들어 있다 */
  const chosen = new Set(selected && selected.length ? selected : selection ? [selection] : []);
  const isChosen = (id: string): boolean => chosen.has(id);
  /** 함께 옮기는 중이면 그만큼 밀어 그린다 */
  const nudge = (id: string): string =>
    shift && shift.ids.includes(id) && (shift.dx || shift.dy) ? `translate(${shift.dx * CS} ${shift.dy * CS})` : '';
  const hl = highlight ?? null;

  const matchesHl = (b: RoomBlock | OpeningBlock | PointBlock): boolean => {
    if (!hl?.blockIds?.length) return false;
    const keys: string[] = [b.id];
    if (isRoom(b)) keys.push(b.roomKind);
    else if (isOpening(b)) keys.push(b.openingKind);
    else keys.push(b.subKind);
    return hl.blockIds.some((k) => keys.includes(k));
  };

  return (
    <svg
      ref={svgRef}
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      x={frame?.x}
      y={frame?.y}
      width={frame ? frame.width : '100%'}
      height={frame ? frame.height : '100%'}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerLeave={props.onPointerLeave}
      onKeyDown={props.onKeyDown}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      tabIndex={focusable ? 0 : undefined}
      style={{ touchAction: 'none', userSelect: 'none', display: 'block' }}
      role={focusable ? 'application' : 'img'}
      aria-label={ariaLabel ?? '우리집 평면도'}
    >
      <defs>
        {/* 인쇄용 해칭 — 색 없이도 방을 구분한다 (P4) */}
        <pattern id={`h1${uid}`} width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 8 L8 0" stroke="#999" strokeWidth="0.8" />
        </pattern>
        <pattern id={`h2${uid}`} width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 0 L8 8" stroke="#999" strokeWidth="0.8" />
        </pattern>
        <pattern id={`h3${uid}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="0.9" fill="#999" />
        </pattern>
        <pattern id={`h4${uid}`} width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 4 H8" stroke="#aaa" strokeWidth="0.8" />
        </pattern>
        <pattern id={`h5${uid}`} width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M4 0 V8" stroke="#aaa" strokeWidth="0.8" />
        </pattern>
        {/* 위험 무늬 — 화염은 사선, 연기는 점 (P4, FR-8.14) */}
        <pattern id={`flame${uid}`} width="7" height="7" patternUnits="userSpaceOnUse">
          <path d="M0 7 L7 0" stroke="#7a1a00" strokeWidth="1.4" />
        </pattern>
        <pattern id={`smoke${uid}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.1" fill="#2b333d" />
        </pattern>
        {Object.entries(SLOT_STYLE).map(([k, s]) => (
          <marker key={k} id={`arrow-${k}-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill={s.color} />
          </marker>
        ))}
        {game?.fog && (
          <mask id={`fog${uid}`}>
            <rect x={0} y={0} width={W} height={H} fill="#fff" />
            <radialGradient id={`fogg${uid}`}>
              <stop offset="70%" stopColor="#000" />
              <stop offset="100%" stopColor="#fff" />
            </radialGradient>
            <circle
              cx={(game.player.cell.x + 0.5) * CS}
              cy={(game.player.cell.y + 0.5) * CS}
              r={game.visionRadius * CS}
              fill={`url(#fogg${uid})`}
            />
          </mask>
        )}
      </defs>

      {/* 바탕 */}
      <rect x={0} y={0} width={W} height={H} fill={printMode ? '#ffffff' : '#fbfbf7'} />

      {/* 격자 */}
      {showGrid && !printMode && (
        <g stroke="#e3e5e0" strokeWidth={1}>
          {Array.from({ length: plan.grid.width + 1 }, (_, i) => (
            <line key={`v${i}`} x1={i * CS} y1={0} x2={i * CS} y2={H} />
          ))}
          {Array.from({ length: plan.grid.height + 1 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i * CS} x2={W} y2={i * CS} />
          ))}
        </g>
      )}

      {/* 방 — 외벽은 저절로 생긴다 (FR-7.2) */}
      <g>
        {roomsForDrawing.map((r, i) => {
          const { x, y, w, h } = r.rect;
          const fill = printMode ? `url(#h${(i % 5) + 1}${uid})` : style === 'kid' ? ROOM_FILL[r.roomKind] : '#ffffff';
          const name = r.label.trim() || (gradeMode === 'easy' ? blockName(r.roomKind, 'easy') : roomLabel(r));
          const sel = isChosen(r.id);
          const isHl = matchesHl(r);
          const isPublicZone = Boolean(plan.shell && r.wallMode === 'zone');
          return (
            <g key={r.id} data-block={r.id} data-kind="room" transform={nudge(r.id)}>
              <rect
                x={x * CS}
                y={y * CS}
                width={w * CS}
                height={h * CS}
                fill={fill}
                stroke={isPublicZone ? 'none' : INK}
                strokeWidth={isPublicZone ? 0 : printMode ? 3 : 4}
                strokeLinejoin="miter"
                data-wall-mode={r.wallMode ?? 'legacy'}
              />
              {r.layer === 'common' && (
                <rect x={x * CS + 3} y={y * CS + 3} width={w * CS - 6} height={h * CS - 6} fill="none" stroke={INK} strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
              )}
              {r.showLabel !== false ? (
                <text
                  x={(x + w / 2) * CS}
                  y={(y + h / 2) * CS}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={printMode ? 12 : 13}
                  fontWeight={700}
                  fill={INK}
                  style={{ pointerEvents: 'none' }}
                >
                  {name}
                </text>
              ) : null}
              {(sel || isHl) && (
                <rect
                  x={x * CS + 2}
                  y={y * CS + 2}
                  width={w * CS - 4}
                  height={h * CS - 4}
                  fill={isHl ? '#ffd166' : 'none'}
                  fillOpacity={isHl ? 0.25 : 0}
                  stroke={isHl ? '#e0a100' : '#0f3d68'}
                  strokeWidth={3}
                  strokeDasharray={sel ? '6 4' : undefined}
                  className={isHl ? 'kids-hl' : undefined}
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </g>
          );
        })}
      </g>

      {/* 외곽 우선 평면은 방 사각형이 아니라 집 칸의 합집합 바깥쪽만 한 번 그린다. */}
      {plan.shell ? (
        <path
          d={shellOutlinePath(plan.shell.cells)}
          fill="none"
          stroke={INK}
          strokeWidth={printMode ? 4 : 5}
          strokeLinecap="square"
          strokeLinejoin="miter"
          data-house-shell="true"
          style={{ pointerEvents: 'none' }}
        />
      ) : null}

      {/* 개구부 */}
      <g>
        {openings.map((o) => {
          const c = slotCenter(o.cell, o.side);
          const rot = o.side === 'N' ? 0 : o.side === 'S' ? 180 : o.side === 'W' ? -90 : 90;
          const sel = isChosen(o.id);
          const isHl = matchesHl(o);
          /* 게임 중이면 지금 상태, 편집 중이면 평소 상태를 보인다 (설계서 v1.2 §2.3) */
          const open = o.openingKind === 'open_passage' || (game ? game.doorState[o.id] !== 'closed' : !o.closedByDefault);
          return (
            <g key={o.id} data-block={o.id} data-kind="opening" data-opening-kind={o.openingKind} data-opening-state={open ? 'open' : 'closed'} data-plan-hidden={o.hideInPlan ? 'true' : undefined} transform={`${nudge(o.id)} translate(${c.x * CS} ${c.y * CS}) rotate(${rot})`}>
              {/* 공용 구역 경계는 실제 벽이 아니므로 지우개 모양조차 그리지 않는다. */}
              {!o.hideInPlan ? <OpeningArt kind={o.openingKind} len={o.openingKind === 'open_passage' ? CS + 4 : CS * 0.86} style={style} open={open} /> : null}
              {(sel || isHl) && (
                <circle r={CS * 0.42} fill={isHl ? '#ffd166' : 'none'} fillOpacity={0.3} stroke={isHl ? '#e0a100' : '#0f3d68'} strokeWidth={2.5} className={isHl ? 'kids-hl' : undefined} />
              )}
            </g>
          );
        })}
      </g>

      {/* 물건·설비·표시 */}
      <g>
        {points.map((p) => {
          const sel = isChosen(p.id);
          const isHl = matchesHl(p);
          const caption =
            !printMode && style === 'kid' && gradeMode === 'easy' && (p.kind === 'safety' || p.kind === 'marker')
              ? blockName(p.subKind, 'easy')
              : null;
          return (
            <g key={p.id} data-block={p.id} data-kind={p.kind} transform={`${nudge(p.id)} translate(${p.cell.x * CS} ${p.cell.y * CS})`}>
              <g transform={`rotate(${p.rotation} ${CS / 2} ${CS / 2})`}>
                {/*
                  * 내 자리와 형·동생은 사람이다. 기호 대신 캐릭터로 그린다 (설계서 v1.5 §2 · §3).
                  * 내 자리는 내가 고른 캐릭터를 그대로 쓴다 — 게임에서 조작할 그 아이다.
                  */}
                {p.subKind === 'my_spot' && playerCharacter ? (
                  <KidToken id={playerCharacter} size={CS} posture="stand" facing="right" />
                ) : p.subKind === 'sibling_older' || p.subKind === 'sibling_younger' ? (
                  <KidToken id={siblingCharacter(p.subKind, playerCharacter)} size={CS} posture="stand" facing={p.subKind === 'sibling_older' ? 'left' : 'right'} />
                ) : (
                  <PointArt subKind={p.subKind} w={CS} h={CS} style={style} />
                )}
              </g>
              {/* 이름표는 절대 돌리지 않는다. 8px 이라 안 보인다는 지적을 받아 11.5px 굵게 올렸다 */}
              {caption && (
                <text
                  x={CS / 2}
                  y={CS + 10}
                  textAnchor="middle"
                  fontSize={11.5}
                  fontWeight={700}
                  fill={INK}
                  style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3.5 }}
                >
                  {caption}
                </text>
              )}
              {(sel || isHl) && (
                <rect x={1} y={1} width={CS - 2} height={CS - 2} rx={5} fill={isHl ? '#ffd166' : 'none'} fillOpacity={0.3} stroke={isHl ? '#e0a100' : '#0f3d68'} strokeWidth={2.5} strokeDasharray={sel ? '5 3' : undefined} className={isHl ? 'kids-hl' : undefined} />
              )}
            </g>
          );
        })}
      </g>

      {/* 강조 셀 */}
      {hl?.cells?.map((c, i) => (
        <rect key={`hlc${i}`} x={c.x * CS + 2} y={c.y * CS + 2} width={CS - 4} height={CS - 4} rx={4} fill="#ffd166" fillOpacity={0.35} stroke="#e0a100" strokeWidth={2} className="kids-hl" style={{ pointerEvents: 'none' }} />
      ))}

      {/* 힌트 길 */}
      {suggested && suggested.length > 1 && (
        <polyline
          points={suggested.map((c) => `${(c.x + 0.5) * CS},${(c.y + 0.5) * CS}`).join(' ')}
          fill="none"
          stroke="#6c757d"
          strokeWidth={3}
          strokeDasharray="4 6"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.8}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* 경로 */}
      {showSlots.map((slot) => {
        const r = routePair?.[slot];
        if (!r) return null;
        return <RoutePath key={slot} slot={slot} cells={r.waypoints} uid={uid} printMode={printMode} ghost={Boolean(ghostRoutes)} />;
      })}
      {drafting && drafting.length > 0 && <RoutePath slot={draftSlot} cells={drafting} uid={uid} printMode={false} draft />}

      {/* 게임 층 */}
      {game && <HazardLayer game={game} plan={plan} uid={uid} />}

      {children}
    </svg>
  );
}

/** 집 안 칸과 바깥 칸이 만나는 변만 SVG 선으로 만든다. */
function shellOutlinePath(cells: Cell[]): string {
  const inside = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
  const has = (x: number, y: number): boolean => inside.has(`${x},${y}`);
  const commands: string[] = [];
  for (const cell of cells) {
    const x = cell.x * CS;
    const y = cell.y * CS;
    if (!has(cell.x, cell.y - 1)) commands.push(`M${x} ${y}H${x + CS}`);
    if (!has(cell.x + 1, cell.y)) commands.push(`M${x + CS} ${y}V${y + CS}`);
    if (!has(cell.x, cell.y + 1)) commands.push(`M${x + CS} ${y + CS}H${x}`);
    if (!has(cell.x - 1, cell.y)) commands.push(`M${x} ${y + CS}V${y}`);
  }
  return commands.join(' ');
}

function RoutePath({
  slot,
  cells,
  uid,
  printMode,
  draft,
  ghost,
}: {
  slot: RouteSlot;
  cells: Cell[];
  uid: string;
  printMode: boolean;
  draft?: boolean;
  ghost?: boolean;
}) {
  const s = SLOT_STYLE[slot];
  const pts = cells.map((c) => ({ x: (c.x + 0.5) * CS, y: (c.y + 0.5) * CS }));
  const first = pts[0];
  const last = pts[pts.length - 1];
  return (
    <g style={{ pointerEvents: 'none' }} opacity={draft ? 0.6 : ghost ? 0.35 : 1} data-route={slot}>
      {pts.length > 1 && (
        <>
          <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#ffffff" strokeWidth={printMode ? 7 : 9} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
          <polyline
            points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={s.color}
            strokeWidth={printMode ? 4 : 5}
            strokeDasharray={s.dash || undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd={`url(#arrow-${slot}-${uid})`}
          />
        </>
      )}
      {first && (
        <g transform={`translate(${first.x} ${first.y})`}>
          <circle r={printMode ? 9 : 11} fill="#ffffff" stroke={s.color} strokeWidth={2.5} />
          <text textAnchor="middle" dominantBaseline="central" fontSize={printMode ? 10 : 12} fontWeight={800} fill={s.color}>
            {s.no}
          </text>
        </g>
      )}
      {last && pts.length > 1 && <circle cx={last.x} cy={last.y} r={printMode ? 5 : 6} fill={s.color} stroke="#fff" strokeWidth={2} />}
    </g>
  );
}

/** 연기 3단계 — 옅음 → 짙음 → 꽉 참 */
const SMOKE_BAND = ['#9aa3ad', '#6b7480', '#454c55'];

/** 불 3단계 — 그을린 기 → 붉은 기 → 불꽃 */
const FIRE_BAND = ['#e8a25f', '#f4762a', '#e23b16'];

/** 위험장·목표·플레이어·시야 — 게임에서만 */
function HazardLayer({ game, plan, uid }: { game: GameLayer; plan: FloorPlan; uid: string }) {
  const W = plan.grid.width;
  const cells: React.ReactNode[] = [];
  for (let i = 0; i < game.field.length; i += 1) {
    const c = game.field[i];
    if (c.isWall) continue;
    const x = (i % W) * CS;
    const y = Math.floor(i / W) * CS;
    /*
     * 번져 나가는 앞머리가 보이게 단계로 나눈다 (설계서 v1.2 §5.1).
     * 연기 3단계(옅음·짙음·꽉 참) · 불 4단계(그을음·붉은 기·불꽃·다 탐).
     */
    const smoke = Math.max(c.secondaryHigh * 0.55, c.secondaryLow * 0.8);
    if (smoke > 0.04) {
      const band = smoke < 0.25 ? 0 : smoke < 0.55 ? 1 : 2;
      cells.push(<rect key={`s${i}`} x={x} y={y} width={CS} height={CS} fill={SMOKE_BAND[band]} opacity={Math.min(0.88, 0.22 + smoke * 0.7)} />);
      if (band >= 1) {
        cells.push(<rect key={`se${i}`} x={x + 1} y={y + 1} width={CS - 2} height={CS - 2} rx={CS * 0.3} fill={SMOKE_BAND[band]} opacity={0.25} />);
      }
      if (c.secondaryLow > 0.2) cells.push(<rect key={`sd${i}`} x={x} y={y} width={CS} height={CS} fill={`url(#smoke${uid})`} opacity={Math.min(0.7, c.secondaryLow)} />);
    }
    if (c.primary > 0.06) {
      const band = c.primary < 0.25 ? 0 : c.primary < 0.55 ? 1 : 2;
      cells.push(<rect key={`f${i}`} x={x} y={y} width={CS} height={CS} fill={FIRE_BAND[band]} opacity={Math.min(0.92, 0.3 + c.primary * 0.7)} />);
      cells.push(<rect key={`fh${i}`} x={x} y={y} width={CS} height={CS} fill={`url(#flame${uid})`} opacity={Math.min(0.8, c.primary)} />);
      /* 불꽃 혀 — 세기에 따라 자란다 */
      if (band >= 1) {
        const h = CS * (0.24 + c.primary * 0.4);
        cells.push(
          <path
            key={`fl${i}`}
            className="k-flame"
            d={`M${x + CS / 2} ${y + CS - 3} c${-h * 0.5} ${-h * 0.5} ${-h * 0.16} ${-h} 0 ${-h} c${h * 0.16} ${h * 0.3} ${h * 0.5} ${h * 0.4} 0 ${h}z`}
            fill="#ffd166"
            opacity={0.85}
          />,
        );
      }
    }
    if (c.state === 'spent') cells.push(<rect key={`b${i}`} x={x} y={y} width={CS} height={CS} fill="#2f2f2f" opacity={0.66} />);
  }
  const p = game.player;
  return (
    <g style={{ pointerEvents: 'none' }} data-game-layer="1">
      <g>{cells}</g>
      {/* 발원지 */}
      <g transform={`translate(${(game.origin.x + 0.5) * CS} ${(game.origin.y + 0.5) * CS})`}>
        <circle r={CS * 0.42} fill="#ffd166" opacity={0.9} />
        <path d="M0 -12c0 0 8 6 8 13a8 8 0 0 1-16 0c0-3 1.5-5 1.5-5s1 2.4 2.7 2.4c-1.4-4.1-1.7-7.6 3.8-10.4z" fill="#c8102e" />
      </g>
      {/* 목표 칸 */}
      {game.goalCells.map((c, i) => (
        <g key={`g${i}`} transform={`translate(${(c.x + 0.5) * CS} ${(c.y + 0.5) * CS})`} className="kids-hl">
          <circle r={CS * 0.36} fill="#0e7c4f" fillOpacity={0.25} stroke="#0e7c4f" strokeWidth={2.5} />
          <path d="M-6 0 l4 4 8 -8" fill="none" stroke="#0e7c4f" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}
      {/* 플레이어 */}
      <g transform={`translate(${p.cell.x * CS} ${p.cell.y * CS})`} data-player="1">
        <PlayerSprite speaker={p.character} posture={p.posture} facing={p.facing} size={CS} />
      </g>
      {/* 시야 밖 */}
      {game.fog && <rect x={0} y={0} width={plan.grid.width * CS} height={plan.grid.height * CS} fill="#1b2027" opacity={0.72} mask={`url(#fog${uid})`} />}
    </g>
  );
}
