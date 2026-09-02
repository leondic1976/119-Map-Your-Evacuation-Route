'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpenCheck,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  DoorOpen,
  FileText,
  GraduationCap,
  HeartHandshake,
  Home,
  Info,
  Layers3,
  LayoutDashboard,
  LineChart,
  MapPinned,
  MonitorCheck,
  Network,
  PlayCircle,
  Radio,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  UsersRound,
} from 'lucide-react';
import { CAMPAIGN_DEMO_RECORDS, DEFAULT_LOCAL_REGION } from '../content/campaign-demo';
import {
  ALL,
  campaignStatus,
  campaignTrend,
  completionRate,
  emptyCampaignFilters,
  filterCampaignRecords,
  summarizeCampaign,
  uniqueCampaignValues,
  type CampaignDashboardRecord,
  type CampaignFilters,
  type CampaignStatus,
} from '../core/campaign/dashboard';
import { campaignScore } from '../core/campaign/score';
import { campaignRecordId, readCampaignRecords, upsertCampaignRecord, type CampaignRecord } from '../platform/campaign';
import { loadKids } from '../store/storage';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const PAGE_SIZE = 10;

const STATUS_LABEL: Record<CampaignStatus, string> = {
  help: '도움 필요',
  progress: '작성 중',
  confirm: '함께 확인',
  ready: '준비됨',
};

function localView(record: CampaignRecord): CampaignDashboardRecord {
  return {
    id: `local-${record.id}`,
    source: 'local',
    region: DEFAULT_LOCAL_REGION,
    school: { id: `local-school-${record.schoolName}`, name: record.schoolName, kind: 'elementary' },
    grade: `${record.schoolGrade}학년`,
    className: record.className,
    studentName: record.studentName,
    updatedAt: record.updatedAt,
    activityWeek: 5,
    score: record.score,
    checks: {
      mapComplete: record.score.structure >= 20,
      extinguisherChecked: record.score.safety >= 8,
      twoRoutes: record.score.routes >= 30,
      practiced: record.score.practice > 0,
    },
  };
}

export default function CampaignDashboardPage() {
  const [desktop, setDesktop] = useState<boolean | null>(null);
  const [records, setRecords] = useState<CampaignDashboardRecord[]>(CAMPAIGN_DEMO_RECORDS);
  const [filters, setFilters] = useState<CampaignFilters>(emptyCampaignFilters);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener('change', update);

    const save = loadKids();
    let localRecords = readCampaignRecords();
    if (save?.profile.schoolName && save.profile.className && save.profile.studentName) {
      const score = campaignScore(save.plan, save.routes, save.progress);
      localRecords = upsertCampaignRecord({
        id: campaignRecordId(save.profile.schoolName, save.profile.schoolGrade, save.profile.className, save.profile.studentName),
        schoolName: save.profile.schoolName,
        schoolGrade: save.profile.schoolGrade,
        className: save.profile.className,
        studentName: save.profile.studentName,
        updatedAt: save.updatedAt,
        score,
      });
    }
    setRecords([...CAMPAIGN_DEMO_RECORDS, ...localRecords.map(localView)]);
    document.body.classList.add('campaign-mode');
    return () => {
      query.removeEventListener('change', update);
      document.body.classList.remove('campaign-mode');
    };
  }, []);

  const setFilter = <K extends keyof CampaignFilters>(key: K, value: CampaignFilters[K], reset: Partial<CampaignFilters> = {}) => {
    setFilters((current) => ({ ...current, [key]: value, ...reset }));
    setPage(1);
  };

  const sidoOptions = useMemo(() => uniqueBy(records, (record) => record.region.sidoCode, (record) => record.region.sidoName), [records]);
  const sigunguBase = records.filter((record) => filters.sidoCode === ALL || record.region.sidoCode === filters.sidoCode);
  const sigunguOptions = uniqueBy(sigunguBase, (record) => record.region.sigunguCode, (record) => record.region.sigunguName);
  const eupBase = sigunguBase.filter((record) => filters.sigunguCode === ALL || record.region.sigunguCode === filters.sigunguCode);
  const eupOptions = uniqueBy(eupBase, (record) => record.region.eupmyeondongCode, (record) => record.region.eupmyeondongName);
  const schoolBase = eupBase.filter((record) => filters.eupmyeondongCode === ALL || record.region.eupmyeondongCode === filters.eupmyeondongCode);
  const schoolOptions = uniqueBy(schoolBase, (record) => record.school.id, (record) => record.school.name);
  const gradeBase = schoolBase.filter((record) => filters.schoolId === ALL || record.school.id === filters.schoolId);
  const gradeOptions = uniqueCampaignValues(gradeBase.map((record) => record.grade));
  const classBase = gradeBase.filter((record) => filters.grade === ALL || record.grade === filters.grade);
  const classOptions = uniqueCampaignValues(classBase.map((record) => record.className));

  const filtered = useMemo(() => filterCampaignRecords(records, filters), [filters, records]);
  const summary = useMemo(() => summarizeCampaign(filtered), [filtered]);
  const trend = useMemo(() => campaignTrend(filtered), [filtered]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const scope = selectedScope(filters, records);
  const schoolCount = new Set(filtered.map((record) => record.school.id)).size;
  const classCount = new Set(filtered.map((record) => `${record.school.id}-${record.grade}-${record.className}`)).size;
  const statusCounts = (['ready', 'confirm', 'progress', 'help'] as CampaignStatus[]).map((status) => ({
    status,
    count: filtered.filter((record) => campaignStatus(record.checks) === status).length,
  }));
  const safetyItems = [
    { label: '우리집 지도 완성', short: '지도', done: summary.mapComplete, tone: 'blue' },
    { label: '실제 소화기 위치 확인', short: '소화기', done: summary.extinguisherChecked, tone: 'coral' },
    { label: '막혔을 때를 생각한 두 길', short: '두 길', done: summary.twoRoutes, tone: 'teal' },
    { label: '몸을 낮춘 대피연습', short: '연습', done: summary.practiced, tone: 'yellow' },
  ];
  const priorityItem = [...safetyItems].sort((a, b) => completionRate(a.done, summary.participants) - completionRate(b.done, summary.participants))[0];

  if (desktop === false) {
    return (
      <main className="k-pc-only" role="main">
        <div className="k-pc-only-card"><BarChart3 className="d-pc-icon" aria-hidden="true" /><h1>PC에서 대시보드를 열어야 한다</h1><p>지역과 학교 자료를 한눈에 보려면 가로 1024px 이상의 PC 화면이 필요하다.</p></div>
      </main>
    );
  }

  return (
    <main className="d-page" data-screen="campaign-dashboard">
      <header className="d-topbar">
        <a className="d-brand" href={`${basePath}/`} aria-label="우리집 대피지도 처음 화면으로">
          <span className="d-brand-mark" aria-hidden="true">119</span>
          <span><b>어린이 소방안전 통합포털</b><small>우리집 대피지도 교육 운영체계</small></span>
        </a>
        <nav aria-label="대시보드 주요 메뉴">
          <a href="#overview" className="on"><LayoutDashboard aria-hidden="true" /> 통합 현황</a>
          <a href="#collaboration"><Network aria-hidden="true" /> 협업 체계</a>
          <a href="#learning"><BookOpenCheck aria-hidden="true" /> 교육 운영</a>
          <a href="#students"><ClipboardCheck aria-hidden="true" /> 학생 활동</a>
          <a href="#resources"><FileText aria-hidden="true" /> 자료실</a>
        </nav>
        <div className="d-top-actions">
          <span className="d-system-status"><i aria-hidden="true" /> 체험 운영 중</span>
          <a className="d-map-link" href={`${basePath}/`}><ArrowLeft aria-hidden="true" /> 대피지도 만들기</a>
        </div>
      </header>

      <section className="d-hero" style={{ backgroundImage: `url(${basePath}/images/dashboard-campaign-hero.png)` }} aria-labelledby="d-title">
        <div className="d-hero-copy">
          <p className="d-eyebrow"><Sparkles aria-hidden="true" /> 부평소방서 어린이 화재안전 통합 캠페인</p>
          <h1 id="d-title">한 아이의 안전을<br /><em>세 곳이 함께 완성한다</em></h1>
          <p>소방기관이 전문성을 더하고, 교육기관이 배움을 이끌며, 가정이 실제 행동으로 완성하는 하나의 소방안전교육 체계다.</p>
          <div className="d-hero-actions">
            <a href="#overview">통합 현황 바로 보기 <ArrowRight aria-hidden="true" /></a>
            <span><Radio aria-hidden="true" /><b>{records.length}명</b>의 체험 기록 연결</span>
          </div>
          <div className="d-hero-roles" aria-label="통합 참여 주체">
            <span><Building2 aria-hidden="true" /><b>소방기관</b> 교육 지원</span>
            <span><GraduationCap aria-hidden="true" /><b>교육기관</b> 수업 운영</span>
            <span><Home aria-hidden="true" /><b>가정</b> 생활 실천</span>
          </div>
        </div>
      </section>

      <div className="d-content">
        <section className="d-data-notice" aria-label="현재 데이터 안내">
          <Info aria-hidden="true" />
          <p><b>현재 화면은 개인정보를 보호하는 체험 운영판이다.</b> 가상 캠페인 자료와 이 PC에서 만든 기록만 표시하며 학생 정보와 집 도면은 서버로 보내지 않는다.</p>
          <span><MonitorCheck aria-hidden="true" /> 기관 서버 미연결</span>
        </section>

        <section className="d-filter-panel" id="filters" aria-labelledby="d-filter-title">
          <div className="d-section-title d-filter-title">
            <div><p>통합 관제 범위 설정</p><h2 id="d-filter-title"><MapPinned aria-hidden="true" /> 지역·학교·학급 선택</h2></div>
            <div className="d-filter-summary"><span>{schoolCount}개 기관</span><span>{classCount}개 학급</span><button type="button" onClick={() => { setFilters(emptyCampaignFilters()); setPage(1); }}>전체 범위로 초기화</button></div>
          </div>
          <div className="d-filter-grid">
            <FilterSelect label="시도" value={filters.sidoCode} options={sidoOptions} onChange={(value) => setFilter('sidoCode', value, { sigunguCode: ALL, eupmyeondongCode: ALL, schoolId: ALL, grade: ALL, className: ALL })} />
            <FilterSelect label="시군구" value={filters.sigunguCode} options={sigunguOptions} onChange={(value) => setFilter('sigunguCode', value, { eupmyeondongCode: ALL, schoolId: ALL, grade: ALL, className: ALL })} />
            <FilterSelect label="읍면동" value={filters.eupmyeondongCode} options={eupOptions} onChange={(value) => setFilter('eupmyeondongCode', value, { schoolId: ALL, grade: ALL, className: ALL })} />
            <FilterSelect label="학교·어린이집" value={filters.schoolId} options={schoolOptions} onChange={(value) => setFilter('schoolId', value, { grade: ALL, className: ALL })} />
            <FilterSelect label="학년·연령" value={filters.grade} options={gradeOptions.map((value) => [value, value])} onChange={(value) => setFilter('grade', value, { className: ALL })} />
            <FilterSelect label="반" value={filters.className} options={classOptions.map((value) => [value, value])} onChange={(value) => setFilter('className', value)} />
          </div>
          <p className="d-scope"><Target aria-hidden="true" /> 현재 모니터링 범위 <b>{scope}</b></p>
        </section>

        <section id="overview" aria-labelledby="d-overview-title">
          <SectionTitle eyebrow="한눈에 보는 교육 성과" title="통합 안전 관제센터" icon={<Activity />} detail={`선택 범위 ${summary.participants}명`} id="d-overview-title" />
          <div className="d-kpis">
            <Kpi icon={<Users />} label="참여 어린이" value={summary.participants} unit="명" detail={`${schoolCount}개 기관 연결`} tone="navy" />
            <Kpi icon={<Home />} label="지도 완성" value={summary.mapComplete} unit="명" detail={`${completionRate(summary.mapComplete, summary.participants)}% 진행`} tone="blue" />
            <Kpi icon={<ShieldCheck />} label="소화기 확인" value={summary.extinguisherChecked} unit="명" detail={`${completionRate(summary.extinguisherChecked, summary.participants)}% 확인`} tone="coral" />
            <Kpi icon={<Route />} label="두 길 준비" value={summary.twoRoutes} unit="명" detail={`${completionRate(summary.twoRoutes, summary.participants)}% 준비`} tone="teal" />
            <Kpi icon={<DoorOpen />} label="대피연습" value={summary.practiced} unit="명" detail={`${completionRate(summary.practiced, summary.participants)}% 실천`} tone="yellow" />
          </div>

          <div className="d-monitor-grid">
            <article className="d-card d-progress-card">
              <header><div><p>4대 안전 약속</p><h3>교육과 생활 실천 진행률</h3></div><span><CheckCircle2 aria-hidden="true" /> {summary.ready}명 전체 준비</span></header>
              {safetyItems.map((item) => <Progress key={item.label} label={item.label} done={item.done} total={summary.participants} tone={item.tone} />)}
            </article>

            <article className="d-card d-trend-card">
              <header><div><p>최근 6주</p><h3>캠페인 참여 흐름</h3></div><span><LineChart aria-hidden="true" /> 누적 참여</span></header>
              <div className="d-chart" aria-label={`최근 6주 참여가 ${trend.join(', ')}명으로 늘었다.`}>
                {trend.map((value, index) => {
                  const max = Math.max(...trend, 1);
                  return <div key={index}><b style={{ height: `${Math.max(10, Math.round((value / max) * 100))}%` }}><i>{value}</i></b><span>{index + 1}주</span></div>;
                })}
              </div>
            </article>

            <article className="d-card d-focus-card">
              <header><div><p>지원 우선 항목</p><h3>지금 함께 살필 부분</h3></div><Bell aria-hidden="true" /></header>
              <div className="d-focus-main">
                <span>{priorityItem.short}</span>
                <b>{completionRate(priorityItem.done, summary.participants)}%</b>
                <p>{summary.participants - priorityItem.done}명의 활동에 확인과 지원이 필요하다.</p>
              </div>
              <div className="d-status-stack">
                {statusCounts.map(({ status, count }) => <div key={status}><span className={`d-status ${status}`}>{STATUS_LABEL[status]}</span><b>{count}명</b></div>)}
              </div>
            </article>
          </div>
        </section>

        <section id="collaboration" className="d-collaboration" aria-labelledby="d-collaboration-title">
          <SectionTitle eyebrow="세 역할, 하나의 안전망" title="기관·학교·가정 협업 체계" icon={<Network />} detail="역할은 분명하게, 정보는 끊김 없이" id="d-collaboration-title" />
          <div className="d-role-network">
            <RoleHub tone="fire" icon={<Building2 />} eyebrow="전문 지원" title="소방기관" subtitle="지역 안전교육 허브" description="지역의 취약 안전 항목을 분석하고 학교 맞춤형 교육과 현장 체험을 지원한다." metric={`${summary.participants - priorityItem.done}명`} metricLabel={`${priorityItem.short} 지원 대상`} actions={['교육 수요 분석', '소방관 수업 지원', '안전자료 검수']} />
            <span className="d-role-connector" aria-hidden="true"><ArrowRight /></span>
            <RoleHub tone="school" icon={<GraduationCap />} eyebrow="배움 운영" title="교육기관" subtitle="학교·선생님 교육 허브" description="학급 수업에서 지도를 만들고 학생별 진행 상태를 살피며 필요한 도움을 연결한다." metric={`${classCount}개`} metricLabel="운영 학급" actions={['교실 지도 만들기', '활동 상태 확인', '가정 연계 안내']} />
            <span className="d-role-connector" aria-hidden="true"><ArrowRight /></span>
            <RoleHub tone="home" icon={<Home />} eyebrow="생활 실천" title="가정" subtitle="보호자 안전실천 허브" description="아이와 실제 소화기 위치와 두 번째 대피길을 확인하고 반복해서 대피를 연습한다." metric={`${summary.practiced}명`} metricLabel="가정 연계 연습" actions={['실제 위치 확인', '가족 집결지 약속', '반복 대피연습']} />
          </div>

          <div className="d-system-flow" aria-label="통합 소방안전교육 순환">
            <FlowStep number="01" icon={<Target />} role="소방기관" title="교육 설계" text="지역 현황으로 교육 주제를 정한다." />
            <FlowStep number="02" icon={<BookOpenCheck />} role="교육기관" title="교실 학습" text="아이 스스로 우리집 지도를 만든다." />
            <FlowStep number="03" icon={<HeartHandshake />} role="가정" title="생활 실천" text="실제 위치를 확인하고 함께 연습한다." />
            <FlowStep number="04" icon={<MonitorCheck />} role="세 역할 공동" title="결과 환류" text="진행을 살피고 다음 교육에 반영한다." />
          </div>
        </section>

        <section id="learning" className="d-learning" aria-labelledby="d-learning-title">
          <SectionTitle eyebrow="오늘 바로 움직이는 포털" title="교육과정·주간 운영" icon={<Layers3 />} detail="교육부터 가정 실천까지 한 흐름으로 관리" id="d-learning-title" />
          <div className="d-operations-grid">
            <article className="d-operation-card d-learning-card">
              <header><div><span>표준 교육과정</span><h3>우리집 대피지도 4단계</h3></div><b>{completionRate(summary.practiced, summary.participants)}% 실천</b></header>
              <div className="d-learning-track">
                <LearningStep state="done" number="1" role="교육기관" title="우리집 구조 이해" text="방·문·창과 현재 위치를 지도에 표시한다." />
                <LearningStep state="done" number="2" role="소방기관" title="화재안전 원리 학습" text="연기, 문 확인, 몸 낮추기 행동을 익힌다." />
                <LearningStep state="current" number="3" role="가정" title="두 갈래 대피길 확인" text="실제 집에서 첫째 길과 둘째 길을 확인한다." />
                <LearningStep state="next" number="4" role="세 역할 공동" title="반복 연습과 환류" text="연습 결과를 살피고 다음 활동을 정한다." />
              </div>
            </article>

            <article className="d-operation-card d-action-board">
              <header><div><span>역할별 할 일</span><h3>오늘의 공동 운영</h3></div><Clock3 aria-hidden="true" /></header>
              <ActionItem icon={<Building2 />} tone="fire" role="소방기관" title={`${priorityItem.short} 교육안 확인`} meta={`지원 필요 ${summary.participants - priorityItem.done}명`} />
              <ActionItem icon={<GraduationCap />} tone="school" role="교육기관" title="작성 중 활동 살피기" meta={`${statusCounts.find((item) => item.status === 'progress')?.count ?? 0}명 진행 중`} />
              <ActionItem icon={<Home />} tone="home" role="가정" title="소화기·집결지 확인" meta={`${summary.extinguisherChecked}명 확인 완료`} />
              <a className="d-board-link" href="#students">학생 활동에서 자세히 확인 <ArrowRight aria-hidden="true" /></a>
            </article>

            <article className="d-operation-card d-calendar-card">
              <header><div><span>이번 주 연계 일정</span><h3>안전교육 캘린더</h3></div><CalendarDays aria-hidden="true" /></header>
              <Schedule day="월" title="학급 대피지도 수업" meta="3학년 2반 · 2교시" tone="school" />
              <Schedule day="수" title="소방관 온라인 안전수업" meta="전체 학급 · 10:30" tone="fire" />
              <Schedule day="금" title="가족 대피연습 주간" meta="가정 확인표 연계" tone="home" />
              <div className="d-calendar-note"><Info aria-hidden="true" /> 체험 운영판의 예시 일정이다.</div>
            </article>
          </div>
        </section>

        <section className="d-students" id="students" aria-labelledby="d-students-title">
          <SectionTitle eyebrow="비교가 아닌 맞춤 지원" title="학생 활동 모니터링" icon={<ClipboardCheck />} detail={`${filtered.length}개 활동`} id="d-students-title" />
          <div className="d-table-tools">
            <label className="d-search"><Search aria-hidden="true" /><span className="sr-only">학생 또는 학교 검색</span><input data-allowed-free-text="dashboard-search" value={filters.query} onChange={(event) => setFilter('query', event.target.value)} placeholder="학생 또는 학교 이름 검색" /></label>
            <div className="d-status-tabs" role="group" aria-label="활동 상태">
              {([['all', '전체'], ['ready', '준비됨'], ['confirm', '함께 확인'], ['progress', '작성 중'], ['help', '도움 필요']] as const).map(([id, label]) => <button key={id} type="button" className={filters.status === id ? 'on' : ''} aria-pressed={filters.status === id} onClick={() => setFilter('status', id)}>{label}</button>)}
            </div>
          </div>
          <div className="d-table-wrap">
            <table>
              <caption className="sr-only">선택한 지역과 학교의 우리집 대피지도 활동 목록</caption>
              <thead><tr><th>학교·반</th><th>학생</th><th>지도</th><th>소화기</th><th>두 길</th><th>연습</th><th>현재 상태</th><th>최근 활동</th></tr></thead>
              <tbody>
                {shown.map((record) => {
                  const status = campaignStatus(record.checks);
                  return <tr key={record.id}>
                    <td><b>{record.school.name}</b><span>{record.grade} {record.className}</span></td>
                    <td><b>{record.studentName}</b><small className={`d-source ${record.source}`}>{record.source === 'local' ? '이 PC' : '데모'}</small></td>
                    <CheckCell done={record.checks.mapComplete} />
                    <CheckCell done={record.checks.extinguisherChecked} />
                    <CheckCell done={record.checks.twoRoutes} />
                    <CheckCell done={record.checks.practiced} />
                    <td><span className={`d-status ${status}`}>{STATUS_LABEL[status]}</span></td>
                    <td>{new Date(record.updatedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</td>
                  </tr>;
                })}
                {!shown.length && <tr><td colSpan={8} className="d-empty"><Search aria-hidden="true" /><b>조건에 맞는 활동이 아직 없다.</b><span>전체 범위로 초기화하거나 다른 지역과 상태를 선택한다.</span></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="d-pagination" aria-label="학생 활동 페이지">
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}><ChevronLeft aria-hidden="true" /> 이전</button>
            <span><b>{page}</b> / {pages}</span>
            <button type="button" onClick={() => setPage((value) => Math.min(pages, value + 1))} disabled={page === pages}>다음 <ChevronRight aria-hidden="true" /></button>
          </div>
        </section>

        <section className="d-resources" id="resources" aria-labelledby="d-resources-title">
          <SectionTitle eyebrow="역할별로 바로 쓰는 콘텐츠" title="통합 교육자료실" icon={<BookOpenCheck />} detail="수업·현장교육·가정활동 자료" id="d-resources-title" />
          <div className="d-resource-grid">
            <Resource icon={<Building2 />} role="소방기관" tone="fire" title="찾아가는 소방안전 수업안" text="학급에서 어려워한 항목을 중심으로 40분 교육을 구성한다." tag="현장교육" />
            <Resource icon={<GraduationCap />} role="교육기관" tone="school" title="교실 대피지도 활동지" text="집 외곽부터 소화기와 두 갈래 길까지 단계별로 함께 만든다." tag="교사 수업" />
            <Resource icon={<Home />} role="가정" tone="home" title="우리집 안전 확인표" text="소화기, 현관, 둘째 길, 가족 집결지를 아이와 직접 확인한다." tag="가정 연계" />
            <Resource icon={<PlayCircle />} role="어린이" tone="child" title="2D 대피연습" text="몸을 낮추고 문을 확인하며 안전한 밖까지 직접 움직여 본다." tag="체험 활동" />
            <Resource icon={<UsersRound />} role="공동 운영" tone="joint" title="학급·가정 안내문" text="수업 목적과 가정에서 함께할 일을 한 장으로 안내한다." tag="운영 자료" />
            <Resource icon={<BarChart3 />} role="담당자" tone="data" title="캠페인 운영 점검표" text="개인 순위 없이 교육 진행과 도움이 필요한 항목만 살핀다." tag="모니터링" />
          </div>
          <aside className="d-privacy-card">
            <CircleAlert aria-hidden="true" />
            <div><h3>기관 공동 운영 전 개인정보 보호체계를 먼저 갖춰야 한다</h3><p>보호자 동의, 기관 로그인과 역할별 권한, 학생 이름·집 도면 분리, 보관·삭제 기간, 조회 기록이 마련된 뒤에만 중앙 자료를 연결한다.</p></div>
            <span className="d-doc-note">현재는 체험 자료만 사용</span>
          </aside>
        </section>
      </div>

      <footer className="d-footer">
        <div><span className="d-brand-mark" aria-hidden="true">119</span><span><b>어린이 소방안전 통합포털</b><small>우리집 대피지도 교육 운영체계</small></span></div>
        <p>소방기관·교육기관·가정이 함께 만드는 어린이 화재안전 교육</p>
        <span>개인 순위 없이 안전한 성장을 기록한다.</span>
      </footer>
    </main>
  );
}

function uniqueBy(records: CampaignDashboardRecord[], value: (record: CampaignDashboardRecord) => string, label: (record: CampaignDashboardRecord) => string): [string, string][] {
  const map = new Map<string, string>();
  records.forEach((record) => map.set(value(record), label(record)));
  return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ko-KR'));
}

function selectedScope(filters: CampaignFilters, records: CampaignDashboardRecord[]): string {
  const names = [
    records.find((record) => record.region.sidoCode === filters.sidoCode)?.region.sidoName,
    records.find((record) => record.region.sigunguCode === filters.sigunguCode)?.region.sigunguName,
    records.find((record) => record.region.eupmyeondongCode === filters.eupmyeondongCode)?.region.eupmyeondongName,
    records.find((record) => record.school.id === filters.schoolId)?.school.name,
    filters.grade !== ALL ? filters.grade : undefined,
    filters.className !== ALL ? filters.className : undefined,
  ].filter(Boolean);
  return names.length ? names.join(' · ') : '전체 캠페인';
}

function SectionTitle({ eyebrow, title, icon, detail, id }: { eyebrow: string; title: string; icon: React.ReactNode; detail: string; id: string }) {
  return <div className="d-section-title"><div><p>{eyebrow}</p><h2 id={id}>{icon}{title}</h2></div><span>{detail}</span></div>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <label><span>{label}</span><select data-dashboard-filter={label} value={value} onChange={(event) => onChange(event.target.value)}><option value={ALL}>전체</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
}

function Kpi({ icon, label, value, unit, detail, tone }: { icon: React.ReactNode; label: string; value: number; unit: string; detail: string; tone: string }) {
  return <article className={`d-kpi ${tone}`}><i aria-hidden="true">{icon}</i><div><span>{label}</span><b>{value}<small>{unit}</small></b><em>{detail}</em></div></article>;
}

function Progress({ label, done, total, tone }: { label: string; done: number; total: number; tone: string }) {
  const rate = completionRate(done, total);
  return <div className="d-progress"><div><span>{label}</span><b>{rate}% <small>{done}/{total}명</small></b></div><span className="d-progress-track"><i className={tone} style={{ width: `${rate}%` }} /></span></div>;
}

function RoleHub({ tone, icon, eyebrow, title, subtitle, description, metric, metricLabel, actions }: { tone: string; icon: React.ReactNode; eyebrow: string; title: string; subtitle: string; description: string; metric: string; metricLabel: string; actions: string[] }) {
  return <article className={`d-role-hub ${tone}`} data-role-hub={title}>
    <header><i aria-hidden="true">{icon}</i><div><span>{eyebrow}</span><h3>{title}</h3><small>{subtitle}</small></div></header>
    <p>{description}</p>
    <div className="d-role-metric"><b>{metric}</b><span>{metricLabel}</span></div>
    <ul>{actions.map((action) => <li key={action}><Check aria-hidden="true" /> {action}</li>)}</ul>
  </article>;
}

function FlowStep({ number, icon, role, title, text }: { number: string; icon: React.ReactNode; role: string; title: string; text: string }) {
  return <article className="d-system-flow-item"><span>{number}</span><i aria-hidden="true">{icon}</i><div><small>{role}</small><h3>{title}</h3><p>{text}</p></div><ArrowRight aria-hidden="true" /></article>;
}

function LearningStep({ state, number, role, title, text }: { state: string; number: string; role: string; title: string; text: string }) {
  return <div className={`d-learning-step ${state}`}><i>{state === 'done' ? <Check aria-hidden="true" /> : number}</i><div><span>{role}</span><b>{title}</b><p>{text}</p></div><small>{state === 'done' ? '학습' : state === 'current' ? '실천 중' : '다음 단계'}</small></div>;
}

function ActionItem({ icon, tone, role, title, meta }: { icon: React.ReactNode; tone: string; role: string; title: string; meta: string }) {
  return <div className={`d-action-item ${tone}`}><i aria-hidden="true">{icon}</i><div><span>{role}</span><b>{title}</b></div><small>{meta}</small></div>;
}

function Schedule({ day, title, meta, tone }: { day: string; title: string; meta: string; tone: string }) {
  return <div className={`d-schedule ${tone}`}><b>{day}</b><div><span>{title}</span><small>{meta}</small></div></div>;
}

function CheckCell({ done }: { done: boolean }) {
  return <td><span className={`d-check ${done ? 'done' : ''}`}>{done ? <CheckCircle2 aria-hidden="true" /> : <Clock3 aria-hidden="true" />}{done ? '완료' : '확인'}</span></td>;
}

function Resource({ icon, role, tone, title, text, tag }: { icon: React.ReactNode; role: string; tone: string; title: string; text: string; tag: string }) {
  return <article className={`d-resource ${tone}`}><header><i aria-hidden="true">{icon}</i><span>{role}</span></header><h3>{title}</h3><p>{text}</p><small>{tag}</small></article>;
}
