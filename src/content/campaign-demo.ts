import type { CampaignDashboardRecord, CampaignRegion, CampaignSchool } from '../core/campaign/dashboard';
import type { CampaignScore } from '../core/campaign/score';

interface DemoSchool {
  region: CampaignRegion;
  school: CampaignSchool;
  grades: string[];
}

const SCHOOLS: DemoSchool[] = [
  {
    region: { sidoCode: '28', sidoName: '인천광역시', sigunguCode: '28237', sigunguName: '부평구', eupmyeondongCode: '28237101', eupmyeondongName: '부평동' },
    school: { id: 'demo-bupyeong-es', name: '부평안전체험초등학교', kind: 'elementary' }, grades: ['2학년', '3학년', '4학년'],
  },
  {
    region: { sidoCode: '28', sidoName: '인천광역시', sigunguCode: '28237', sigunguName: '부평구', eupmyeondongCode: '28237105', eupmyeondongName: '산곡동' },
    school: { id: 'demo-sangok-es', name: '산곡푸른초등학교', kind: 'elementary' }, grades: ['1학년', '3학년', '5학년'],
  },
  {
    region: { sidoCode: '28', sidoName: '인천광역시', sigunguCode: '28237', sigunguName: '부평구', eupmyeondongCode: '28237107', eupmyeondongName: '삼산동' },
    school: { id: 'demo-samsan-kids', name: '삼산해맑은어린이집', kind: 'kindergarten' }, grades: ['5세반', '6세반', '7세반'],
  },
  {
    region: { sidoCode: '11', sidoName: '서울특별시', sigunguCode: '11500', sigunguName: '강서구', eupmyeondongCode: '11500103', eupmyeondongName: '화곡동' },
    school: { id: 'demo-hwagok-es', name: '화곡안전초등학교', kind: 'elementary' }, grades: ['2학년', '4학년', '6학년'],
  },
  {
    region: { sidoCode: '41', sidoName: '경기도', sigunguCode: '41190', sigunguName: '부천시', eupmyeondongCode: '41190108', eupmyeondongName: '중동' },
    school: { id: 'demo-jungdong-es', name: '중동꿈나무초등학교', kind: 'elementary' }, grades: ['1학년', '3학년', '5학년'],
  },
];

const NAMES = ['김하준', '이서윤', '박도윤', '최지아', '정시우', '한유나', '윤민준', '장하린', '오은우', '임수아', '강지호', '문다은'];
const CLASSES = ['1반', '2반', '3반'];

function scoreFor(index: number): { score: CampaignScore; checks: CampaignDashboardRecord['checks'] } {
  const checks = {
    mapComplete: index % 7 !== 0,
    extinguisherChecked: index % 4 !== 0,
    twoRoutes: index % 3 !== 0,
    practiced: index % 2 === 0 || index % 5 === 0,
  };
  const score = {
    structure: checks.mapComplete ? 20 : 8,
    safety: checks.extinguisherChecked ? 25 : 10,
    routes: checks.twoRoutes ? 30 : index % 3 === 0 ? 15 : 0,
    practice: checks.practiced ? 25 : 0,
    total: 0,
  };
  score.total = score.structure + score.safety + score.routes + score.practice;
  return { score, checks };
}

export const CAMPAIGN_DEMO_RECORDS: CampaignDashboardRecord[] = SCHOOLS.flatMap((entry, schoolIndex) =>
  Array.from({ length: 12 }, (_, index) => {
    const serial = schoolIndex * 12 + index;
    const grade = entry.grades[index % entry.grades.length];
    const className = CLASSES[(index + schoolIndex) % CLASSES.length];
    const { score, checks } = scoreFor(serial);
    const day = String(12 + (serial % 19)).padStart(2, '0');
    return {
      id: `demo-${schoolIndex}-${index}`,
      source: 'demo' as const,
      region: entry.region,
      school: entry.school,
      grade,
      className,
      studentName: NAMES[(index + schoolIndex * 3) % NAMES.length],
      updatedAt: `2026-08-${day}T0${serial % 9}:20:00.000Z`,
      activityWeek: Math.min(5, Math.floor(serial / 10)),
      score,
      checks,
    };
  })
);

export const DEFAULT_LOCAL_REGION: CampaignRegion = SCHOOLS[0].region;
