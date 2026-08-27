/**
 * 저장 스키마 이행 — plan2-1.md §7.4.
 *
 * 서버가 없다. 이용자 파일을 뒤늦게 고쳐 줄 방법이 없으므로,
 * 이행에 실패하면 조용히 덮어쓰지 않고 원본을 그대로 돌려준다.
 */
import type { SaveFile } from '../types/save';
import { SCHEMA_VERSION, defaultProfile, emptyProgress } from '../types/save';
import { emptyFloorPlan } from '../types/plan';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

const migrations: Record<number, (data: Raw) => Raw> = {
  /**
   * 1 → 2 (plan2-1.md §7.4)
   * v1 의 다섯 키(fire_exit_available/blocked/earthquake/flood/gas) 경로를
   * 재난별 주·보조 쌍으로 옮기고, 진행 기록을 새 모양으로 바꾼다.
   */
  1: (d) => {
    const old = d.routes ?? {};
    const withKey = (r: Raw | undefined, key: string): Raw | undefined => (r ? { ...r, key } : undefined);
    const routes: Raw = {};
    const firePrimary = withKey(old.fire_exit_available, 'fire_exit_available');
    const fireAlt = withKey(old.fire_exit_blocked, 'fire_exit_blocked');
    if (firePrimary || fireAlt) routes.fire = { primary: firePrimary, alternate: fireAlt };
    for (const k of ['earthquake', 'flood', 'gas']) {
      const r = withKey(old[k], k);
      if (r) routes[k] = { primary: r };
    }
    return {
      ...d,
      schemaVersion: 2,
      routes,
      profile: { ...(d.profile ?? {}), playerCharacter: d.profile?.playerCharacter ?? 'ilgu' },
      progress: {
        attempts: 0,
        successes: 0,
        earnedGoodIds: [],
        pendingFixIds: [],
        guardianMissions: d.progress?.guardianMissions ?? [],
        completedSteps: d.progress?.completedSteps ?? [],
      },
    };
  },
};

export class SaveIncompatibleError extends Error {
  constructor(
    readonly foundVersion: number,
    readonly rawText: string,
  ) {
    super(`지원하지 않는 저장 형식이다 (v${foundVersion})`);
    this.name = 'SaveIncompatibleError';
  }
}

export function migrate(raw: unknown, rawText: string): SaveFile {
  const d0 = raw as Raw;
  if (!d0 || typeof d0.schemaVersion !== 'number') throw new SaveIncompatibleError(-1, rawText);
  // 미래 판 파일을 조용히 통과시키지 않는다
  if (d0.schemaVersion > SCHEMA_VERSION) throw new SaveIncompatibleError(d0.schemaVersion, rawText);
  let d: Raw = d0;
  while (d.schemaVersion < SCHEMA_VERSION) {
    const fn = migrations[d.schemaVersion];
    if (!fn) throw new SaveIncompatibleError(d.schemaVersion, rawText);
    d = fn(d);
  }
  return fillDefaults(d);
}

/** 빠진 필드를 기본값으로 채운다 — 이행과는 다른 일이다 */
function fillDefaults(d: Raw): SaveFile {
  const now = new Date().toISOString();
  const base = emptyProgress();
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: typeof d.createdAt === 'string' ? d.createdAt : now,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : now,
    profile: { ...defaultProfile(), ...(d.profile ?? {}) },
    plan: d.plan && Array.isArray(d.plan.blocks) ? d.plan : emptyFloorPlan(),
    routes: d.routes && typeof d.routes === 'object' ? d.routes : {},
    progress: {
      attempts: Number(d.progress?.attempts ?? base.attempts),
      successes: Number(d.progress?.successes ?? base.successes),
      earnedGoodIds: Array.isArray(d.progress?.earnedGoodIds) ? d.progress.earnedGoodIds : [],
      pendingFixIds: Array.isArray(d.progress?.pendingFixIds) ? d.progress.pendingFixIds : [],
      guardianMissions: Array.isArray(d.progress?.guardianMissions) ? d.progress.guardianMissions : [],
      completedSteps: Array.isArray(d.progress?.completedSteps) ? d.progress.completedSteps : [],
    },
  };
}

export function parseSave(text: string): SaveFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SaveIncompatibleError(-1, text);
  }
  return migrate(raw, text);
}
