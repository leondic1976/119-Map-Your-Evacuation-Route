import type { CampaignScore } from '../core/campaign/score';

const KEY = 'evac-campaign-v1';

export interface CampaignRecord {
  id: string;
  schoolName: string;
  schoolGrade: number;
  className: string;
  studentName: string;
  updatedAt: string;
  score: CampaignScore;
}

export function readCampaignRecords(): CampaignRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter(validRecord) : [];
  } catch {
    return [];
  }
}

export function upsertCampaignRecord(record: CampaignRecord): CampaignRecord[] {
  const records = readCampaignRecords().filter((item) => item.id !== record.id);
  const next = records.concat(record).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 저장 공간이 막혀도 현재 화면의 자료는 보여 줄 수 있다. */
  }
  return next;
}

export function campaignRecordId(schoolName: string, grade: number, className: string, studentName: string): string {
  return [schoolName, grade, className, studentName].map((value) => String(value).trim().toLocaleLowerCase('ko-KR')).join('|');
}

function validRecord(value: unknown): value is CampaignRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CampaignRecord>;
  return typeof item.id === 'string' && typeof item.schoolName === 'string' && typeof item.studentName === 'string' && typeof item.score?.total === 'number';
}
