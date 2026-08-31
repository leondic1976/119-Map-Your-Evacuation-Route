import type { CampaignScore } from './score';

export type CampaignSource = 'demo' | 'local';
export type CampaignStatus = 'help' | 'progress' | 'confirm' | 'ready';

export interface CampaignRegion {
  sidoCode: string;
  sidoName: string;
  sigunguCode: string;
  sigunguName: string;
  eupmyeondongCode: string;
  eupmyeondongName: string;
}

export interface CampaignSchool {
  id: string;
  name: string;
  kind: 'elementary' | 'kindergarten';
}

export interface CampaignChecks {
  mapComplete: boolean;
  extinguisherChecked: boolean;
  twoRoutes: boolean;
  practiced: boolean;
}

export interface CampaignDashboardRecord {
  id: string;
  source: CampaignSource;
  region: CampaignRegion;
  school: CampaignSchool;
  grade: string;
  className: string;
  studentName: string;
  updatedAt: string;
  /** 체험판의 최근 6주 흐름을 위한 0~5 주차. 로컬 자료는 마지막 주차로 들어간다. */
  activityWeek: number;
  score: CampaignScore;
  checks: CampaignChecks;
}

export interface CampaignFilters {
  sidoCode: string;
  sigunguCode: string;
  eupmyeondongCode: string;
  schoolId: string;
  grade: string;
  className: string;
  status: 'all' | CampaignStatus;
  query: string;
}

export interface CampaignSummary {
  participants: number;
  mapComplete: number;
  extinguisherChecked: number;
  twoRoutes: number;
  practiced: number;
  ready: number;
  average: number;
}

export const ALL = 'all';

export function emptyCampaignFilters(): CampaignFilters {
  return {
    sidoCode: ALL,
    sigunguCode: ALL,
    eupmyeondongCode: ALL,
    schoolId: ALL,
    grade: ALL,
    className: ALL,
    status: 'all',
    query: '',
  };
}

export function campaignStatus(checks: CampaignChecks): CampaignStatus {
  const count = Object.values(checks).filter(Boolean).length;
  if (count === 4) return 'ready';
  if (count === 3) return 'confirm';
  if (count > 0) return 'progress';
  return 'help';
}

export function filterCampaignRecords(records: CampaignDashboardRecord[], filters: CampaignFilters): CampaignDashboardRecord[] {
  const query = filters.query.trim().toLocaleLowerCase('ko-KR');
  return records.filter((record) =>
    (filters.sidoCode === ALL || record.region.sidoCode === filters.sidoCode)
    && (filters.sigunguCode === ALL || record.region.sigunguCode === filters.sigunguCode)
    && (filters.eupmyeondongCode === ALL || record.region.eupmyeondongCode === filters.eupmyeondongCode)
    && (filters.schoolId === ALL || record.school.id === filters.schoolId)
    && (filters.grade === ALL || record.grade === filters.grade)
    && (filters.className === ALL || record.className === filters.className)
    && (filters.status === 'all' || campaignStatus(record.checks) === filters.status)
    && (!query || `${record.studentName} ${record.school.name} ${record.grade} ${record.className}`.toLocaleLowerCase('ko-KR').includes(query))
  );
}

export function summarizeCampaign(records: CampaignDashboardRecord[]): CampaignSummary {
  const count = (key: keyof CampaignChecks) => records.filter((record) => record.checks[key]).length;
  return {
    participants: records.length,
    mapComplete: count('mapComplete'),
    extinguisherChecked: count('extinguisherChecked'),
    twoRoutes: count('twoRoutes'),
    practiced: count('practiced'),
    ready: records.filter((record) => campaignStatus(record.checks) === 'ready').length,
    average: records.length ? Math.round(records.reduce((sum, record) => sum + record.score.total, 0) / records.length) : 0,
  };
}

export function campaignTrend(records: CampaignDashboardRecord[]): number[] {
  return Array.from({ length: 6 }, (_, week) => records.filter((record) => record.activityWeek <= week).length);
}

export function uniqueCampaignValues<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'ko-KR'));
}

export function completionRate(done: number, total: number): number {
  return total ? Math.round((done / total) * 100) : 0;
}
