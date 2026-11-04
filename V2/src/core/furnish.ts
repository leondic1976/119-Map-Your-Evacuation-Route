/**
 * 가구 자리 찾기 — 칸이 어떤 모양이든 벽을 뚫지 않고 들어가는 자리와 방향과 크기를 찾는다.
 *
 * 칸 안에 가운데가 있고 어느 벽과도 닿지 않는 네모는 통째로 칸 안에 있다. 그래서 벽과 겹치는지만 재면 된다.
 * 가구의 등을 벽에 대는 자리를 먼저 찾아 비스듬한 벽에는 비스듬히 붙는다. 들어가지 않으면 줄인다.
 */
import { cellIdAt, clipSegment, edgeSides } from './grid';
import type { Cell, Layout, Plan, Pt } from './types';

export interface Footprint {
  /** 등을 댄 벽을 따라가는 폭 */
  w: number;
  /** 벽에서 안쪽으로 나오는 깊이 */
  d: number;
}

export interface Placement {
  x: number;
  y: number;
  /** 가구의 앞(깊이 쪽)이 향하는 방향 */
  front: Pt;
  scale: number;
  /** 등이 아니라 옆구리를 벽에 댔다 */
  sideways: boolean;
}

/** 벽 두께의 절반에 틈을 조금 더한 거리 */
const WALL_GAP = 0.07;
/** 지나는 길에서 비우는 거리 */
const PATH_GAP = 0.16;
/** 문 앞에서 비우는 거리 */
const DOOR_GAP = 0.32;

/** 네모(가운데 c, 방향 f, 절반 크기 hw·hd)에 선분이 닿는가 */
function touches(c: Pt, f: Pt, hw: number, hd: number, a: Pt, b: Pt): boolean {
  const local = (p: Pt): Pt => {
    const vx = p.x - c.x;
    const vy = p.y - c.y;
    return { x: vx * f.y - vy * f.x, y: vx * f.x + vy * f.y };
  };
  return clipSegment(local(a), local(b), -hw, -hd, hw, hd) !== null;
}

export interface FitOptions {
  /** 비워 둘 꺾은선들 — 지나는 길 */
  keepClear?: Pt[][];
  /** 줄여 볼 크기들 */
  scales?: number[];
  /** 가구 크기와 띄울 거리가 지금 점 몇 칸인가(점 간격) */
  unit?: number;
}

/** 가구 하나의 자리. 어떤 크기로도 들어가지 않으면 null */
export function fitFurniture(plan: Plan, layout: Layout, cell: Cell, footprint: Footprint, options: FitOptions = {}): Placement | null {
  const edges = [...layout.edges.values()];
  const doors = edges.filter((e) => plan.openings[e.key] === 'door');
  const paths = options.keepClear ?? [];
  const scales = options.scales ?? [1, 0.85, 0.7, 0.55, 0.45];
  const unit = options.unit ?? 1;
  const wallGap = WALL_GAP * unit;
  const size = { w: footprint.w * unit, d: footprint.d * unit };
  const runLength = (key: string): number => {
    const run = layout.runOf.get(key);
    return run ? Math.hypot(run.b.x - run.a.x, run.b.y - run.a.y) : 0;
  };

  const fits = (c: Pt, f: Pt, hw: number, hd: number): boolean => {
    if (cellIdAt(layout, c) !== cell.id) return false;
    const pw = hw + wallGap;
    const pd = hd + wallGap;
    if (edges.some((e) => !e.hidden && touches(c, f, pw, pd, e.a, e.b))) return false;
    if (doors.some((e) => touches(c, f, hw + DOOR_GAP * unit, hd + DOOR_GAP * unit, e.mid, e.mid))) return false;
    return paths.every((line) => line.every((p, i) => i === 0 || !touches(c, f, hw + PATH_GAP * unit, hd + PATH_GAP * unit, line[i - 1]!, p)));
  };

  // 이 칸을 두른 벽들 — 문과 창이 없는 긴 벽부터 쓴다
  const borders = edges
    .filter((e) => !e.hidden && edgeSides(layout, e.key).some((s) => layout.cellAt.get(s) === cell.id))
    .sort((p, q) => {
      const free = Number(Boolean(plan.openings[p.key])) - Number(Boolean(plan.openings[q.key]));
      if (free) return free;
      return runLength(q.key) - runLength(p.key) || (p.key < q.key ? -1 : 1);
    });

  for (const scale of scales) {
    for (const sideways of [false, true]) {
      const hw = ((sideways ? size.d : size.w) * scale) / 2;
      const hd = ((sideways ? size.w : size.d) * scale) / 2;
      for (const e of borders) {
        const len = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
        const along = { x: (e.b.x - e.a.x) / len, y: (e.b.y - e.a.y) / len };
        const [p] = edgeSides(layout, e.key);
        const inward = cellSideNormal(along, layout.cellAt.get(p) === cell.id);
        for (const t of [0.5, 0.3, 0.7, 0.15, 0.85]) {
          const off = hd + wallGap + 0.005;
          const c = { x: e.a.x + (e.b.x - e.a.x) * t + inward.x * off, y: e.a.y + (e.b.y - e.a.y) * t + inward.y * off };
          // 네모의 앞 방향이 안쪽이다. 옆으로 놓으면 가구를 90도 돌려 놓은 셈이 된다
          if (fits(c, inward, hw, hd)) return finish(c, inward, scale, sideways);
        }
      }
    }
    // 벽에 대지 못하면 조각 가운데에 곧게 놓는다
    for (const s of [...cell.squares].sort((p, q) => q.area - p.area)) {
      for (const front of [{ x: 0, y: 1 }, { x: 1, y: 0 }]) {
        if (fits(s.center, front, (size.w * scale) / 2, (size.d * scale) / 2)) return finish(s.center, front, scale, false);
      }
    }
  }
  return null;
}

/** 벽 방향 along 에 수직인 방향 가운데 칸 쪽. p 쪽이 칸이면 q 반대다 */
function cellSideNormal(along: Pt, cellIsP: boolean): Pt {
  // along 은 왼쪽 끝에서 오른쪽 끝(세로 벽은 위에서 아래)으로 간다
  const vertical = Math.abs(along.x) < 1e-9;
  const towardQ = vertical ? { x: 1, y: 0 } : { x: -along.y, y: along.x };
  return cellIsP ? { x: -towardQ.x, y: -towardQ.y } : towardQ;
}

const finish = (c: Pt, front: Pt, scale: number, sideways: boolean): Placement => ({ x: c.x, y: c.y, front, scale, sideways });
