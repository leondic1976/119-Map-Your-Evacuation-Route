/**
 * 평면도 → 그래프 — docs/DESIGN-v1.0.md §5.2.
 *
 * 시나리오마다 그래프를 새로 만들지 않는다. 하나의 그래프에 다섯 벌의
 * 통행 가능성을 함께 담아 두고, 탭을 바꾸면 조회 키만 바뀐다.
 */
import type {
  BlockId,
  Cell,
  ExitKind,
  FloorPlan,
  OpeningBlock,
  PointBlock,
  RoomBlock,
  ScenarioKey,
  Side,
} from '../../types/plan';
import { isExitKind, isOpening, isRoom } from '../../types/plan';
import type { EdgeVia, GraphEdge, GraphNode, PlanGraph } from '../../types/graph';
import { CONDITION_KEY, DEFAULT_PASSABILITY, VN } from '../../types/graph';
import { i } from '../josa';
import type { UserProfile } from '../../types/save';
import { buildOccupancy, roomIdAt, rooms } from '../grid/occupancy';
import { cellKey, cellsOf, rectCentroid, rectsOverlap, step } from '../grid/geometry';

/** 방 종류별 기본 이름 — 이용자가 이름을 안 붙였을 때 쓴다 */
export const ROOM_LABEL: Record<RoomBlock['roomKind'], string> = {
  bedroom: '방',
  living: '거실',
  kitchen: '주방(부엌)',
  bath: '욕실',
  entry: '현관',
  balcony: '발코니',
  utility: '다용도실',
  closet: '옷방',
  other: '기타실',
  corridor: '복도',
  stair: '계단',
  refuge_lobby: '피난전실',
  elevator_hall: '승강기 앞',
};

export const VIRTUAL_LABEL: Record<string, string> = {
  [VN.outdoor]: '집 밖',
  [VN.neighbor]: '옆집',
  [VN.below]: '아래층',
  [VN.upstairs]: '위층',
};

/** 피난설비가 만드는 특수 엣지 */
const SAFETY_EDGE: Record<string, { to: string; via: EdgeVia }> = {
  light_partition: { to: VN.neighbor, via: 'light_partition' },
  descending_hatch: { to: VN.below, via: 'descending_hatch' },
  descent_device: { to: VN.below, via: 'descent_device' },
};

export function roomLabel(r: RoomBlock): string {
  return r.label.trim() || ROOM_LABEL[r.roomKind];
}

export function buildGraph(plan: FloorPlan): PlanGraph {
  const occ = buildOccupancy(plan);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const warnings: string[] = [];
  let seq = 0;
  const eid = (): string => {
    seq += 1;
    return `e${seq}`;
  };

  const roomList = rooms(plan);
  const points = plan.blocks.filter((b): b is PointBlock => b.kind !== 'room' && b.kind !== 'opening');
  const openings = plan.blocks.filter(isOpening);

  /* 1) 방 노드 */
  for (const r of roomList) {
    const cells = cellsOf(r.rect);
    const inside = new Set(cells.map(cellKey));
    /* 가스불은 아이가 찾는 갈래는 가구지만 안전 판정에서는 계속 위험원이다. */
    const hazards = points.filter((p) => (p.kind === 'hazard' || p.subKind === 'gas_range') && inside.has(cellKey(p.cell))).map((p) => p.subKind);
    const hasWindow = openings.some(
      (o) => inside.has(cellKey(o.cell)) && (o.openingKind === 'window' || o.openingKind === 'sliding_window' || o.openingKind === 'balcony_window'),
    );
    nodes.push({
      id: r.id,
      kind: r.roomKind === 'stair' ? 'stair' : r.roomKind === 'elevator_hall' ? 'elevator' : 'room',
      label: roomLabel(r),
      layer: r.layer,
      roomBlockId: r.id,
      roomKind: r.roomKind,
      cells,
      centroid: rectCentroid(r.rect),
      hazards,
      hasWindow,
      reachesGround: false,
    });
  }

  /* 대피공간은 방과 별개의 노드로 세운다 — 목표가 될 수 있어야 하기 때문이다 */
  for (const p of points) {
    if (p.subKind !== 'refuge_area') continue;
    nodes.push({
      id: `refuge_${p.id}`,
      kind: 'refuge',
      label: '대피공간',
      layer: p.layer,
      cells: [p.cell],
      centroid: p.cell,
      hazards: [],
      hasWindow: false,
    });
  }

  /* 2) 가상 노드 — 셀이 없다 */
  const virtual: [string, 'outdoor' | 'neighbor' | 'below' | 'upstairs'][] = [
    [VN.outdoor, 'outdoor'],
    [VN.neighbor, 'neighbor'],
    [VN.below, 'below'],
    [VN.upstairs, 'upstairs'],
  ];
  for (const [id, vid] of virtual) {
    nodes.push({ id, kind: 'virtual', virtualId: vid, label: VIRTUAL_LABEL[id], hazards: [], hasWindow: false });
  }

  const push = (a: string, b: string, via: EdgeVia, anchorCell?: Cell, cost = 1): void => {
    edges.push({
      id: eid(),
      a,
      b,
      via,
      cost,
      passability: DEFAULT_PASSABILITY[via],
      anchorCell,
      conditionKey: CONDITION_KEY[via],
    });
  };

  /* 3) 개구부 엣지 */
  for (const o of openings) {
    const a = roomIdAt(occ, o.cell);
    const nb = step(o.cell, o.side);
    const b = roomIdAt(occ, nb) ?? VN.outdoor;
    if (!a) {
      warnings.push(`${i(openingName(o))} 어느 방에도 붙어 있지 않다.`);
      continue;
    }
    if (a === b) {
      warnings.push(`${i(openingName(o))} 같은 방 안쪽에 놓여 있다.`);
      continue;
    }
    push(a, b, o.openingKind, o.cell);
  }

  /* 4) 피난설비 특수 엣지 */
  for (const p of points) {
    const host = roomIdAt(occ, p.cell);
    if (p.subKind === 'refuge_area') {
      if (!host) {
        warnings.push('대피공간이 방 안에 놓여 있지 않다.');
        continue;
      }
      // 대피공간으로 드나드는 문은 방화문이므로 두 시나리오 모두 열려 있다
      push(host, `refuge_${p.id}`, 'door', p.cell);
      continue;
    }
    const spec = SAFETY_EDGE[p.subKind];
    if (!spec) continue;
    if (!host) {
      warnings.push('피난설비가 방 안에 놓여 있지 않다.');
      continue;
    }
    push(host, spec.to, spec.via, p.cell);
  }

  /* 계단은 늘 위층으로 이어진다 — 침수 때 올라가는 길이다 */
  for (const n of nodes) {
    if (n.kind === 'stair') push(n.id, VN.upstairs, 'stair_up', n.centroid);
  }

  /* 5) 인접(벽) 엣지 — 통행용이 아니라 "여기는 벽이야" 안내와 RULE-C-05 에 쓴다 */
  const hasOpeningBetween = (a: RoomBlock, b: RoomBlock): boolean =>
    openings.some((o) => {
      const inA = roomIdAt(occ, o.cell) === a.id;
      const across = roomIdAt(occ, step(o.cell, o.side));
      return inA && across === b.id;
    }) ||
    openings.some((o) => {
      const inB = roomIdAt(occ, o.cell) === b.id;
      const across = roomIdAt(occ, step(o.cell, o.side));
      return inB && across === a.id;
    });

  for (let i = 0; i < roomList.length; i += 1) {
    for (let j = i + 1; j < roomList.length; j += 1) {
      const a = roomList[i];
      const b = roomList[j];
      if (!touching(a, b)) continue;
      if (hasOpeningBetween(a, b)) continue;
      push(a.id, b.id, 'adjacent');
    }
  }

  /* 6) 색인 */
  const nodeById: Record<string, GraphNode> = {};
  for (const n of nodes) nodeById[n.id] = n;
  const adjacency: Record<string, GraphEdge[]> = {};
  for (const n of nodes) adjacency[n.id] = [];
  for (const e of edges) {
    if (adjacency[e.a]) adjacency[e.a].push(e);
    if (adjacency[e.b]) adjacency[e.b].push(e);
  }

  /*
   * 계단이 밖에 닿는가 — 엣지를 다 세운 뒤에야 알 수 있다.
   * 밖으로 나가는 곳은 세 갈래다(1층·옥상·지하). 셋 다 "도달할 수 있는 끝"이고,
   * 어느 쪽이 옳은지는 규칙(RULE-F-08·F-09)이 판단한다 (설계서 v1.2 §3.1).
   */
  const exits = points.filter((p) => isExitKind(p.subKind));
  for (const n of nodes) {
    if (n.kind !== 'stair') continue;
    const marker = exits.find((g) => n.cells?.some((c) => c.x === g.cell.x && c.y === g.cell.y));
    if (marker) n.exitKind = marker.subKind as ExitKind;
    const toOutdoor = adjacency[n.id].some((e) => e.b === VN.outdoor || e.a === VN.outdoor);
    n.reachesGround = Boolean(marker) || toOutdoor;
  }

  return { nodes, edges, nodeById, adjacency, warnings };
}

function touching(a: RoomBlock, b: RoomBlock): boolean {
  const grow = { x: a.rect.x - 1, y: a.rect.y - 1, w: a.rect.w + 2, h: a.rect.h + 2 };
  return rectsOverlap(grow, b.rect) && !rectsOverlap(a.rect, b.rect);
}

function openingName(o: OpeningBlock): string {
  const n: Record<string, string> = {
    door: '여닫이문',
    sliding_door: '미닫이문',
    front_door: '현관문',
    inner_door: '중문',
    open_passage: '트인 통로',
    window: '창문',
    sliding_window: '미닫이창',
    balcony_window: '발코니 창',
    emergency_exit: '비상구',
  };
  return n[o.openingKind] ?? '개구부';
}

/**
 * 도달 목표 집합 — docs/DESIGN-v1.0.md §4.3 의 표를 구현한 단 하나의 함수.
 *
 * 규칙도 경로탐색도 여기만 본다. 목표를 여러 곳에서 따로 정하면
 * 서로 반대 결론을 내어 아이가 어떤 경로를 그려도 위반이 남는다(P3 위반).
 */
export function goalNodeIds(g: PlanGraph, key: ScenarioKey, profile: UserProfile): string[] {
  const ground = (): string[] => [
    VN.outdoor,
    ...g.nodes.filter((n) => n.kind === 'stair' && n.reachesGround).map((n) => n.id),
  ];
  switch (key) {
    case 'fire_exit_blocked': {
      const refuges = g.nodes.filter((n) => n.kind === 'refuge').map((n) => n.id);
      const hasAlt = g.edges.some((e) =>
        e.via === 'light_partition' || e.via === 'descending_hatch' || e.via === 'descent_device',
      );
      if (refuges.length || hasAlt) return [...refuges, VN.neighbor, VN.below];
      /*
       * 대체 피난설비가 하나도 없는 집이 있다. 단독주택이 그렇다.
       * 이때 목표를 비워 두면 아이가 무엇을 그리든 종점 규칙이 통과하지 못해
       * 막다른 골목에 빠진다(P3 위반). §6.1 지침대로 욕실을 마지막 기댈 곳으로 삼고,
       * 욕실조차 없으면 밖으로 나가는 길을 목표로 둔다.
       */
      const baths = g.nodes.filter((n) => n.roomKind === 'bath').map((n) => n.id);
      return baths.length ? baths : ground();
    }
    case 'flood': {
      /*
       * 1층·반지하는 위층이 목표다. 그런데 계단을 그리지 않은 집이라면 위층으로 가는
       * 엣지가 없어 어떤 길도 맞을 수 없다(P3 위반). 그때는 밖으로 나가는 길을 목표로 두고,
       * RULE-W-01 은 계단이 없으면 평가하지 않는다.
       */
      const hasStair = g.nodes.some((n) => n.kind === 'stair');
      return profile.lowFloor && hasStair ? [VN.upstairs] : ground();
    }
    case 'fire_exit_available':
    case 'earthquake':
    case 'gas':
    default:
      return ground();
  }
}

/** 어떤 방에서 출발하는가 — '내 자리' 표시가 있으면 그 방, 없으면 첫 침실 */
export function startNodeId(plan: FloorPlan, g: PlanGraph): string | null {
  const occ = buildOccupancy(plan);
  const spot = plan.blocks.find((b): b is PointBlock => b.kind === 'marker' && b.subKind === 'my_spot');
  if (spot) {
    const host = roomIdAt(occ, spot.cell);
    if (host) return host;
  }
  const bed = plan.blocks.find((b) => isRoom(b) && b.roomKind === 'bedroom');
  if (bed) return bed.id;
  const first = plan.blocks.find(isRoom);
  return first ? first.id : null;
}

/** 그 (셀, 면)에 개구부가 있는가 — RULE-C-05 의 벽 통과 검사에 쓴다 */
export function openingBetween(plan: FloorPlan, a: Cell, side: Side): BlockId | null {
  const opp = side === 'N' ? 'S' : side === 'S' ? 'N' : side === 'E' ? 'W' : 'E';
  const nb = step(a, side);
  const hit = plan.blocks.find(
    (b) =>
      isOpening(b) &&
      ((b.cell.x === a.x && b.cell.y === a.y && b.side === side) ||
        (b.cell.x === nb.x && b.cell.y === nb.y && b.side === opp)),
  );
  return hit ? hit.id : null;
}
