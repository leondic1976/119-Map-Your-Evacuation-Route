/**
 * 평면 렌더러.
 *
 * 편집 화면과 A4 인쇄가 같은 코드를 쓴다. 좌표계는 도면과 같은 cm.
 * 여기서는 상호작용을 다루지 않는다(선택 핸들 등은 Canvas 가 덧그린다).
 */
import React from 'react';
import {
  DOOR_KIND_LABEL,
  Plan,
  Pt,
  Room,
  RoomKind,
  Selection,
  roomArea,
  planBounds,
} from '../lib/types';
import { DoorGeom, WallModel, WinGeom } from '../lib/walls';
import { Layers } from '../lib/store';
import { C_ACCENT, C_DANGER, C_SAFE, FacilitySymbol, NorthArrow, ScaleBar, SymIgnition } from './Symbols';
import { FACILITY_CAPTION } from '../lib/words';

/** 실 바탕 — 저채도 8색 (건축 도면 관례) */
export const ROOM_FILL: Record<RoomKind, string> = {
  living: '#eaf1f8',
  room: '#f5f1e8',
  kitchen: '#e9f3ec',
  bath: '#e6eff4',
  entry: '#f2eef4',
  hall: '#f1f3f5',
  balcony: '#f8fafb',
  utility: '#eef2e9',
  dress: '#f7f0ee',
  store: '#eff1f4',
};

const WALL_INT = '#2a3038';
const WALL_EXT = '#1b2027';
const DIM_INK = '#7c8794';

export interface PlanViewProps {
  plan: Plan;
  model: WallModel;
  layers: Layers;
  selection?: Selection | null;
  /** 발화 지점 */
  ignition?: Pt | null;
  /** 훈련 이동 궤적 */
  drillPath?: Pt[] | null;
  drillPos?: Pt | null;
  /** 동선 위 차단 지점 */
  blocked?: { x: number; y: number; label: string }[];
  /** 동선 번호 (범례·표와 맞춤) */
  routeNo?: Record<string, number>;
  showNorth?: boolean;
  showScaleBar?: boolean;
  /** 인쇄용 — 실 이름을 조금 크게 */
  print?: boolean;
  /** 연기 오버레이가 켜져 있으면 실 바탕을 흐리게 해 오버레이가 비쳐 보이게 한다 */
  dimRooms?: boolean;
  /** 초등 — 기호 밑에 무슨 뜻인지 쉬운 말로 적어 준다 */
  easy?: boolean;
}

function fmtArea(r: Room): string {
  return `${roomArea(r).toFixed(1)}㎡`;
}

/* ------------------------------------------------------------------ */

function RoomFills({ plan, layers, dim }: { plan: Plan; layers: Layers; dim?: boolean }) {
  if (!layers.rooms) return null;
  return (
    <g opacity={dim ? 0.42 : 1}>
      {plan.rooms.map((r) => (
        <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} fill={ROOM_FILL[r.kind]} stroke="none" />
      ))}
    </g>
  );
}

/**
 * 실 이름표. 동선·연기 위에 얹고 흰 테두리(paint-order)를 둘러
 * 무엇이 겹쳐도 읽히게 한다.
 */
function RoomLabels({ plan, layers, print }: { plan: Plan; layers: Layers; print?: boolean }) {
  if (!layers.labels) return null;
  const nameSize = print ? 26 : 24;
  return (
    <g pointerEvents="none" style={{ paintOrder: 'stroke' }}>
      {plan.rooms.map((r) => {
        if (r.w < 90 || r.h < 70) return null;
        return (
          <g key={r.id}>
            <text
              x={r.x + r.w / 2}
              y={r.y + r.h / 2}
              textAnchor="middle"
              fontSize={nameSize}
              fontWeight={600}
              fill="#2b333d"
              stroke="#ffffff"
              strokeWidth={6}
              strokeLinejoin="round"
            >
              {r.name}
            </text>
            <text
              x={r.x + r.w / 2}
              y={r.y + r.h / 2 + nameSize * 0.95}
              textAnchor="middle"
              fontSize={nameSize * 0.72}
              fill={DIM_INK}
              stroke="#ffffff"
              strokeWidth={5}
              strokeLinejoin="round"
            >
              {fmtArea(r)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Walls({ model }: { model: WallModel }) {
  return (
    <g>
      {model.walls.map((w, i) => (
        <rect
          key={i}
          x={w.x}
          y={w.y}
          width={w.w}
          height={w.h}
          fill={w.kind === 'ext' ? WALL_EXT : WALL_INT}
        />
      ))}
    </g>
  );
}

function DoorGlyph({ g }: { g: DoorGeom }) {
  const t = g.thickness;
  const half = g.width / 2;
  const open = g.door.alwaysOpen;
  // 개구부 바닥선 (문지방)
  const sill =
    g.dir === 'h' ? (
      <rect x={g.cx - half} y={g.cy - t / 2} width={g.width} height={t} fill="#ffffff" />
    ) : (
      <rect x={g.cx - t / 2} y={g.cy - half} width={t} height={g.width} fill="#ffffff" />
    );
  return (
    <g>
      {sill}
      {g.jambs.map((j, i) => (
        <rect key={i} x={j.x} y={j.y} width={j.w} height={j.h} fill={WALL_INT} />
      ))}
      {g.arc && (
        <path
          d={describeArc(g.arc.cx, g.arc.cy, g.arc.r, g.arc.a0, g.arc.a1)}
          fill="none"
          stroke="#8f99a5"
          strokeWidth={1.6}
          strokeDasharray="6 5"
        />
      )}
      {g.leaf && (
        <line
          x1={g.leaf.x1}
          y1={g.leaf.y1}
          x2={g.leaf.x2}
          y2={g.leaf.y2}
          stroke={g.door.kind === 'entrance' ? C_DANGER : '#4a5561'}
          strokeWidth={g.door.kind === 'entrance' ? 6 : 4.5}
          strokeLinecap="butt"
        />
      )}
      {open && !g.arc && (
        <g stroke="#8f99a5" strokeWidth={1.6} strokeDasharray="5 4">
          {g.dir === 'h' ? (
            <line x1={g.cx - half} y1={g.cy} x2={g.cx + half} y2={g.cy} />
          ) : (
            <line x1={g.cx} y1={g.cy - half} x2={g.cx} y2={g.cy + half} />
          )}
        </g>
      )}
    </g>
  );
}

function WindowGlyph({ g }: { g: WinGeom }) {
  const t = g.thickness;
  const half = g.width / 2;
  const inset = t * 0.28;
  if (g.dir === 'h') {
    return (
      <g>
        <rect x={g.cx - half} y={g.cy - t / 2} width={g.width} height={t} fill="#ffffff" />
        <line x1={g.cx - half} y1={g.cy - t / 2} x2={g.cx + half} y2={g.cy - t / 2} stroke={WALL_INT} strokeWidth={1.6} />
        <line x1={g.cx - half} y1={g.cy + t / 2} x2={g.cx + half} y2={g.cy + t / 2} stroke={WALL_INT} strokeWidth={1.6} />
        <line x1={g.cx - half} y1={g.cy - inset} x2={g.cx + half} y2={g.cy - inset} stroke="#6b7887" strokeWidth={1.4} />
        <line x1={g.cx - half} y1={g.cy + inset} x2={g.cx + half} y2={g.cy + inset} stroke="#6b7887" strokeWidth={1.4} />
      </g>
    );
  }
  return (
    <g>
      <rect x={g.cx - t / 2} y={g.cy - half} width={t} height={g.width} fill="#ffffff" />
      <line x1={g.cx - t / 2} y1={g.cy - half} x2={g.cx - t / 2} y2={g.cy + half} stroke={WALL_INT} strokeWidth={1.6} />
      <line x1={g.cx + t / 2} y1={g.cy - half} x2={g.cx + t / 2} y2={g.cy + half} stroke={WALL_INT} strokeWidth={1.6} />
      <line x1={g.cx - inset} y1={g.cy - half} x2={g.cx - inset} y2={g.cy + half} stroke="#6b7887" strokeWidth={1.4} />
      <line x1={g.cx + inset} y1={g.cy - half} x2={g.cx + inset} y2={g.cy + half} stroke="#6b7887" strokeWidth={1.4} />
    </g>
  );
}

function polar(cx: number, cy: number, r: number, deg: number): Pt {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function describeArc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const s = polar(cx, cy, r, a0);
  const e = polar(cx, cy, r, a1);
  let delta = a1 - a0;
  while (delta <= -180) delta += 360;
  while (delta > 180) delta -= 360;
  const largeArc = Math.abs(delta) > 180 ? 1 : 0;
  const sweep = delta > 0 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${e.x} ${e.y}`;
}

/* 동선 ------------------------------------------------------------- */

function pathD(pts: Pt[]): string {
  if (pts.length === 0) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

function Arrow({ from, to, color, size = 26 }: { from: Pt; to: Pt; color: string; size?: number }) {
  const ang = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  return (
    <g transform={`translate(${to.x} ${to.y}) rotate(${ang})`}>
      <path d={`M 0 0 L ${-size} ${size * 0.46} L ${-size * 0.68} 0 L ${-size} ${-size * 0.46} Z`} fill={color} />
    </g>
  );
}

function Routes({
  plan,
  routeNo,
  print,
}: {
  plan: Plan;
  routeNo?: Record<string, number>;
  print?: boolean;
}) {
  return (
    <g>
      {plan.routes.map((r) => {
        if (r.points.length < 2) return null;
        const color = r.kind === 'primary' ? C_SAFE : C_ACCENT;
        const d = pathD(r.points);
        const last = r.points[r.points.length - 1];
        const prev = r.points[r.points.length - 2];
        const start = r.points[0];
        const no = routeNo?.[r.id];
        return (
          <g key={r.id}>
            <path d={d} fill="none" stroke="#ffffff" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
            <path
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={8}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={r.kind === 'alt' ? '26 16' : undefined}
            />
            <Arrow from={prev} to={last} color={color} />
            <circle cx={start.x} cy={start.y} r={11} fill="#fff" stroke={color} strokeWidth={4} />
            {no !== undefined && (
              <text
                x={start.x}
                y={start.y + (print ? 5 : 5)}
                textAnchor="middle"
                fontSize={15}
                fontWeight={700}
                fill={color}
              >
                {no}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

/* 치수 ------------------------------------------------------------- */

function Dimensions({ plan }: { plan: Plan }) {
  const b = planBounds(plan);
  const off = 62;
  const tick = 12;
  const line = (x1: number, y1: number, x2: number, y2: number) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={DIM_INK} strokeWidth={1.4} />
  );
  return (
    <g pointerEvents="none">
      {line(b.x, b.y - off, b.x + b.w, b.y - off)}
      {line(b.x, b.y - off - tick, b.x, b.y - off + tick)}
      {line(b.x + b.w, b.y - off - tick, b.x + b.w, b.y - off + tick)}
      <text x={b.x + b.w / 2} y={b.y - off - 10} textAnchor="middle" fontSize={22} fill={DIM_INK}>
        {(b.w / 100).toFixed(2)}m
      </text>
      {line(b.x - off, b.y, b.x - off, b.y + b.h)}
      {line(b.x - off - tick, b.y, b.x - off + tick, b.y)}
      {line(b.x - off - tick, b.y + b.h, b.x - off + tick, b.y + b.h)}
      <text
        x={b.x - off - 10}
        y={b.y + b.h / 2}
        textAnchor="middle"
        fontSize={22}
        fill={DIM_INK}
        transform={`rotate(-90 ${b.x - off - 10} ${b.y + b.h / 2})`}
      >
        {(b.h / 100).toFixed(2)}m
      </text>
      {plan.rooms.map((r) =>
        r.w >= 140 && r.h >= 110 ? (
          <text
            key={r.id}
            x={r.x + r.w / 2}
            y={r.y + r.h - 12}
            textAnchor="middle"
            fontSize={17}
            fill={DIM_INK}
          >
            {(r.w / 100).toFixed(2)} × {(r.h / 100).toFixed(2)}
          </text>
        ) : null,
      )}
    </g>
  );
}

/* ------------------------------------------------------------------ */

export default function PlanView(props: PlanViewProps) {
  const {
    plan,
    model,
    layers,
    ignition,
    drillPath,
    drillPos,
    blocked,
    routeNo,
    showNorth,
    showScaleBar,
    print,
    dimRooms,
    easy,
  } = props;
  const b = planBounds(plan);

  return (
    <g>
      {layers.background && plan.background && plan.background.visible && (
        <image
          href={plan.background.src}
          x={plan.background.x}
          y={plan.background.y}
          width={plan.background.w}
          height={plan.background.h}
          opacity={plan.background.opacity}
          preserveAspectRatio="none"
        />
      )}

      {layers.trace && plan.traceLines.length > 0 && (
        <g stroke="#c26bb0" strokeWidth={2.5} opacity={0.75}>
          {plan.traceLines.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
          ))}
        </g>
      )}

      <RoomFills plan={plan} layers={layers} dim={dimRooms} />

      {layers.walls && <Walls model={model} />}

      {layers.doors && model.doors.map((g) => <DoorGlyph key={g.id} g={g} />)}
      {layers.windows && model.windows.map((g) => <WindowGlyph key={g.id} g={g} />)}

      {layers.dims && <Dimensions plan={plan} />}

      {layers.facilities && (
        <g>
          {plan.facilities.map((f) => (
            <g key={f.id}>
              <g transform={`translate(${f.x} ${f.y}) rotate(${f.rot})`}>
                <FacilitySymbol type={f.type} size={f.size} />
              </g>
              {easy && (
                <text
                  x={f.x}
                  y={f.y + (f.type === 'partition' ? 22 : (f.size ?? 46) / 2 + 20)}
                  textAnchor="middle"
                  fontSize={17}
                  fontWeight={700}
                  fill="#2b333d"
                  stroke="#ffffff"
                  strokeWidth={5}
                  strokeLinejoin="round"
                  style={{ paintOrder: 'stroke' }}
                >
                  {FACILITY_CAPTION[f.type]}
                </text>
              )}
            </g>
          ))}
          {plan.doors
            .filter((d) => d.kind === 'entrance')
            .map((d) => (
              <g
                key={`exit-${d.id}`}
                transform={`translate(${d.dir === 'h' ? d.x : d.x + d.swing * 46}, ${
                  d.dir === 'h' ? d.y + d.swing * 32 : d.y
                })`}
              >
                <FacilitySymbol type="exit" size={40} />
              </g>
            ))}
        </g>
      )}

      {layers.routes && <Routes plan={plan} routeNo={routeNo} print={print} />}

      <RoomLabels plan={plan} layers={layers} print={print} />

      {drillPath && drillPath.length > 1 && (
        <g>
          <path
            d={pathD(drillPath)}
            fill="none"
            stroke="#ffffff"
            strokeWidth={15}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.8}
          />
          <path
            d={pathD(drillPath)}
            fill="none"
            stroke="#c98a12"
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="18 12"
          />
        </g>
      )}

      {drillPos && (
        <g transform={`translate(${drillPos.x} ${drillPos.y})`}>
          <circle r={22} fill="#fff" stroke="#c98a12" strokeWidth={5} />
          <circle r={9} fill="#c98a12" />
        </g>
      )}

      {blocked?.map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y})`}>
          <circle r={17} fill="#fff" stroke={C_DANGER} strokeWidth={4} />
          <path d="M-8 -8L8 8M8 -8L-8 8" stroke={C_DANGER} strokeWidth={4.5} strokeLinecap="round" />
        </g>
      ))}

      {ignition && (
        <g transform={`translate(${ignition.x} ${ignition.y})`}>
          <SymIgnition size={56} />
        </g>
      )}

      {layers.notes &&
        plan.notes.map((n) => (
          <text key={n.id} x={n.x} y={n.y} fontSize={n.size} fill="#39424d" fontWeight={500}>
            {n.text}
          </text>
        ))}

      {showNorth && (
        <g transform={`translate(${b.x + b.w + 90} ${b.y + 60})`}>
          <NorthArrow size={86} />
        </g>
      )}

      {showScaleBar && (
        <g transform={`translate(${b.x} ${b.y + b.h + 76})`}>
          <ScaleBar meters={3} />
        </g>
      )}
    </g>
  );
}

/** 도면 기호 범례 항목 (화면·인쇄 공통) */
export function legendItems(plan: Plan): { kind: string; label: string }[] {
  const out: { kind: string; label: string }[] = [];
  const has = (t: string) => plan.facilities.some((f) => f.type === t);
  if (plan.routes.some((r) => r.kind === 'primary')) out.push({ kind: 'primary', label: '주 피난동선' });
  if (plan.routes.some((r) => r.kind === 'alt')) out.push({ kind: 'alt', label: '대체 피난동선' });
  if (plan.doors.some((d) => d.kind === 'entrance')) out.push({ kind: 'exit', label: '현관(피난 종점)' });
  if (has('extinguisher')) out.push({ kind: 'extinguisher', label: '소화기' });
  if (has('refuge')) out.push({ kind: 'refuge', label: '대피공간' });
  if (has('partition')) out.push({ kind: 'partition', label: '경량칸막이' });
  if (has('downladder')) out.push({ kind: 'downladder', label: '하향식 피난구' });
  if (has('assembly')) out.push({ kind: 'assembly', label: '집결지' });
  return out;
}

export { DOOR_KIND_LABEL };
