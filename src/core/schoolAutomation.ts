import type { UserProfile } from '../types/save';

export type SchoolAutomationProfile = Pick<UserProfile, 'schoolName' | 'schoolGrade' | 'className' | 'studentName'>;

export const SCHOOL_AUTOMATION_PROFILE: SchoolAutomationProfile = {
  schoolName: '부평초등학교',
  schoolGrade: 1,
  className: '119반',
  studentName: '자동화',
};

export const SCHOOL_AUTOMATION_DURATION_MS = 40_000;

/** 정해진 수업 시연용 프로필과 네 항목이 모두 정확히 같을 때만 자동화를 켠다. */
export function isSchoolAutomationProfile(profile: SchoolAutomationProfile | undefined): boolean {
  if (!profile) return false;
  return profile.schoolName === SCHOOL_AUTOMATION_PROFILE.schoolName
    && profile.schoolGrade === SCHOOL_AUTOMATION_PROFILE.schoolGrade
    && profile.className === SCHOOL_AUTOMATION_PROFILE.className
    && profile.studentName === SCHOOL_AUTOMATION_PROFILE.studentName;
}
