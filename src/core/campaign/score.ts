/** 경쟁 순위가 아닌 대피지도의 안전 완성도 계산. UI·저장소에 의존하지 않는다. */
import type { FloorPlan, RouteSet } from '../../types/plan';
import type { SaveProgress } from '../../types/save';
import { isOpening, isPoint, isRoom } from '../../types/plan';

export interface CampaignScore {
  structure: number;
  safety: number;
  routes: number;
  practice: number;
  total: number;
}

export function campaignScore(plan: FloorPlan, routes: RouteSet, progress: SaveProgress): CampaignScore {
  const rooms = plan.blocks.filter(isRoom);
  const openings = plan.blocks.filter(isOpening);
  const points = plan.blocks.filter(isPoint);
  const has = (kind: string) => points.some((point) => point.subKind === kind);
  const fireRoutes = routes.fire ?? {};
  const structure = (rooms.length > 0 ? 8 : 0)
    + (openings.some((opening) => opening.openingKind === 'front_door') ? 6 : 0)
    + (openings.some((opening) => opening.openingKind === 'door' || opening.openingKind === 'sliding_door') ? 6 : 0);
  const safety = (has('extinguisher') ? 8 : 0) + (has('detector') ? 7 : 0) + (has('my_spot') ? 4 : 0) + (has('meeting_point') ? 6 : 0);
  const routeScore = (fireRoutes.primary ? 15 : 0) + (fireRoutes.alternate ? 15 : 0);
  const practice = (progress.attempts > 0 ? 10 : 0) + (progress.successes > 0 ? 15 : 0);
  return { structure, safety, routes: routeScore, practice, total: structure + safety + routeScore + practice };
}
