'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  DoorOpen,
  GraduationCap,
  Home,
  Info,
  MapPinned,
  Route,
  Search,
  ShieldCheck,
  Users,
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

  if (desktop === false) {
    return (
      <main className="k-pc-only" role="main">
        <div className="k-pc-only-card"><BarChart3 className="d-pc-icon" aria-hidden="true" /><h1>PC에서 대시보드를 열어 주세요</h1><p>지역과 학교 자료를 한눈에 보기 위해 가로 1024px 이상의 PC 화면을 사용해 주세요.</p></div>
      </main>
    );
  }

  return (
    <main className="d-page" data-screen="campaign-dashboard">
      <header className="d-topbar">
        <a className="d-brand" href={`${basePath}/`} aria-label="우리집 대피지도 처음 화면으로">
          <span className="d-brand-mark" aria-hidden="true">119</span>
          <span><b>우리집 대피지도</b><small>함께 만드는 어린이 화재안전 캠페인</small></span>
        </a>
        <nav aria-label="대시보드 주요 메뉴">
          <a href="#overview" className="on">캠페인 현황</a>
          <a href="#students">학생 활동</a>
          <a href="#resources">캠페인 자료</a>
        </nav>
        <a className="d-map-link" href={`${basePath}/`}><ArrowLeft aria-hidden="true" /> 대피지도 그리기</a>
      </header>

      <section className="d-hero" style={{ backgroundImage: `url(${basePath}/images/dashboard-campaign-hero.png)` }} aria-labelledby="d-title">
        <div className="d-hero-copy">
          <p className="d-eyebrow"><ShieldCheck aria-hidden="true" /> 부평소방서 어린이 화재안전 캠페인</p>
          <h1 id="d-title">우리 동네 모두가 아는<br /><em>두 갈래 대피길</em></h1>
          <p>아이들이 직접 그린 우리집 대피지도로 학교와 가족, 소방서가 함께 안전을 준비해요.</p>
          <div className="d-hero-actions">
            <a href="#filters">우리 지역 살펴보기 <ChevronRight aria-hidden="true" /></a>
            <span><Users aria-hidden="true" /><b>{records.length}명</b>의 체험 기록</span>
          </div>
        </div>
      </section>

      <div className="d-content">
        <section className="d-data-notice" aria-label="현재 데이터 안내">
          <Info aria-hidden="true" />
          <p><b>지금은 안전한 체험 화면입니다.</b> 가상 캠페인 자료와 이 PC에서 만든 기록만 보여 주며, 학생 정보나 집 도면을 서버로 보내지 않습니다.</p>
          <span>기관 서버 미연결</span>
        </section>

        <section className="d-filter-panel" id="filters" aria-labelledby="d-filter-title">
          <div className="d-section-title">
            <div><p>보고 싶은 범위를 골라요</p><h2 id="d-filter-title"><MapPinned aria-hidden="true" /> 지역과 학교 찾기</h2></div>
            <button type="button" onClick={() => { setFilters(emptyCampaignFilters()); setPage(1); }}>전체 보기</button>
          </div>
          <div className="d-filter-grid">
            <FilterSelect label="시도" value={filters.sidoCode} options={sidoOptions} onChange={(value) => setFilter('sidoCode', value, { sigunguCode: ALL, eupmyeondongCode: ALL, schoolId: ALL, grade: ALL, className: ALL })} />
            <FilterSelect label="시군구" value={filters.sigunguCode} options={sigunguOptions} onChange={(value) => setFilter('sigunguCode', value, { eupmyeondongCode: ALL, schoolId: ALL, grade: ALL, className: ALL })} />
            <FilterSelect label="읍면동" value={filters.eupmyeondongCode} options={eupOptions} onChange={(value) => setFilter('eupmyeondongCode', value, { schoolId: ALL, grade: ALL, className: ALL })} />
            <FilterSelect label="학교·어린이집" value={filters.schoolId} options={schoolOptions} onChange={(value) => setFilter('schoolId', value, { grade: ALL, className: ALL })} />
            <FilterSelect label="학년·연령" value={filters.grade} options={gradeOptions.map((value) => [value, value])} onChange={(value) => setFilter('grade', value, { className: ALL })} />
            <FilterSelect label="반" value={filters.className} options={classOptions.map((value) => [value, value])} onChange={(value) => setFilter('className', value)} />
          </div>
          <p className="d-scope"><Home aria-hidden="true" /> 현재 범위 <b>{scope}</b></p>
        </section>

        <section id="overview" aria-labelledby="d-overview-title">
          <div className="d-section-title d-overview-heading">
            <div><p>서로 비교하지 않고, 안전 준비만 확인해요</p><h2 id="d-overview-title"><BarChart3 aria-hidden="true" /> 캠페인 안전 현황</h2></div>
            <span>선택 범위 {summary.participants}명</span>
          </div>
          <div className="d-kpis">
            <Kpi icon={<Users />} label="참여 어린이" value={summary.participants} unit="명" tone="navy" />
            <Kpi icon={<Home />} label="지도 완성" value={summary.mapComplete} unit="명" tone="blue" />
            <Kpi icon={<ShieldCheck />} label="소화기 확인" value={summary.extinguisherChecked} unit="명" tone="coral" />
            <Kpi icon={<Route />} label="두 길 준비" value={summary.twoRoutes} unit="명" tone="teal" />
            <Kpi icon={<DoorOpen />} label="대피연습" value={summary.practiced} unit="명" tone="yellow" />
          </div>

          <div className="d-insights">
            <article className="d-card d-progress-card">
              <header><div><p>4가지 안전 약속</p><h3>어디까지 준비했을까요?</h3></div><span>{summary.ready}명 준비 완료</span></header>
              <Progress label="우리집 지도 완성" done={summary.mapComplete} total={summary.participants} tone="blue" />
              <Progress label="실제 소화기 위치 확인" done={summary.extinguisherChecked} total={summary.participants} tone="coral" />
              <Progress label="막혔을 때까지 생각한 두 길" done={summary.twoRoutes} total={summary.participants} tone="teal" />
              <Progress label="몸을 낮춰 대피연습" done={summary.practiced} total={summary.participants} tone="yellow" />
            </article>

            <article className="d-card d-trend-card">
              <header><div><p>최근 6주</p><h3>캠페인 참여 흐름</h3></div><span>누적 참여</span></header>
              <div className="d-chart" aria-label={`최근 6주 참여가 ${trend.join(', ')}명으로 늘었습니다.`}>
                {trend.map((value, index) => {
                  const max = Math.max(...trend, 1);
                  return <div key={index}><b style={{ height: `${Math.max(10, Math.round((value / max) * 100))}%` }}><i>{value}</i></b><span>{index + 1}주</span></div>;
                })}
              </div>
            </article>

            <article className="d-card d-today-card">
              <header><div><p>함께하는 사람</p><h3>오늘의 안전 행동</h3></div></header>
              <Role icon={<Building2 />} title="소방서" text="지역에서 어려워하는 안전 항목을 찾아 교육을 준비해요." />
              <Role icon={<GraduationCap />} title="학교·선생님" text="작성 중인 반을 확인하고 수업 시간을 마련해요." />
              <Role icon={<Home />} title="가족" text="소화기와 밖에서 만나는 곳을 아이와 직접 확인해요." />
            </article>
          </div>
        </section>

        <section className="d-students" id="students" aria-labelledby="d-students-title">
          <div className="d-section-title">
            <div><p>친구와 비교하지 않고 필요한 도움을 찾아요</p><h2 id="d-students-title"><ClipboardCheck aria-hidden="true" /> 학생 활동 살펴보기</h2></div>
            <span>{filtered.length}개 활동</span>
          </div>
          <div className="d-table-tools">
            <label className="d-search"><Search aria-hidden="true" /><span className="sr-only">학생 또는 학교 검색</span><input data-allowed-free-text="dashboard-search" value={filters.query} onChange={(event) => setFilter('query', event.target.value)} placeholder="학생 또는 학교 이름 찾기" /></label>
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
                {!shown.length && <tr><td colSpan={8} className="d-empty"><Search aria-hidden="true" /><b>조건에 맞는 활동이 아직 없어요.</b><span>전체 보기를 누르거나 다른 지역과 상태를 골라 보세요.</span></td></tr>}
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
          <div className="d-section-title"><div><p>지도를 만들고 실제 행동으로 이어 가요</p><h2 id="d-resources-title"><BookOpenCheck aria-hidden="true" /> 캠페인 활동 자료</h2></div></div>
          <div className="d-resource-grid">
            <Resource number="01" title="교실에서 지도 만들기" text="집 외곽부터 소화기, 내 위치, 만나는 곳까지 여섯 단계로 함께 만들어요." tag="교사 40분 활동" />
            <Resource number="02" title="가족과 실제 위치 확인" text="집에 돌아가 소화기와 현관, 막혔을 때 쓸 두 번째 길을 눈으로 확인해요." tag="가정 확인 활동" />
            <Resource number="03" title="2D 대피연습 해 보기" text="몸을 낮추고 문을 확인하며 안전한 밖까지 직접 움직여 연습해요." tag="어린이 게임 활동" />
            <Resource number="04" title="소방서와 안전 이야기" text="학급에서 자주 어려워한 항목을 모아 소방관과 질문하고 배워요." tag="캠페인 연계" />
          </div>
          <aside className="d-privacy-card">
            <CircleAlert aria-hidden="true" />
            <div><h3>기관 공동 운영 전 꼭 준비해야 해요</h3><p>보호자 동의, 기관 로그인과 역할별 권한, 학생 이름·집 도면 분리, 보관·삭제 기간, 조회 기록이 마련된 뒤에만 중앙 자료를 연결합니다.</p></div>
            <span className="d-doc-note">연구보고서는 저장소 문서에서 확인</span>
          </aside>
        </section>
      </div>

      <footer className="d-footer"><span><b>119 우리집 대피지도</b> 어린이 화재안전 캠페인 체험판</span><span>개인 순위 없이, 함께 안전해지는 과정을 기록합니다.</span></footer>
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

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <label><span>{label}</span><select data-dashboard-filter={label} value={value} onChange={(event) => onChange(event.target.value)}><option value={ALL}>전체</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
}

function Kpi({ icon, label, value, unit, tone }: { icon: React.ReactNode; label: string; value: number; unit: string; tone: string }) {
  return <article className={`d-kpi ${tone}`}><i aria-hidden="true">{icon}</i><div><span>{label}</span><b>{value}<small>{unit}</small></b></div></article>;
}

function Progress({ label, done, total, tone }: { label: string; done: number; total: number; tone: string }) {
  const rate = completionRate(done, total);
  return <div className="d-progress"><div><span>{label}</span><b>{rate}% <small>{done}/{total}명</small></b></div><span className="d-progress-track"><i className={tone} style={{ width: `${rate}%` }} /></span></div>;
}

function Role({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="d-role"><i aria-hidden="true">{icon}</i><div><b>{title}</b><span>{text}</span></div><ChevronRight aria-hidden="true" /></div>;
}

function CheckCell({ done }: { done: boolean }) {
  return <td><span className={`d-check ${done ? 'done' : ''}`}>{done ? <CheckCircle2 aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}{done ? '확인' : '필요'}</span></td>;
}

function Resource({ number, title, text, tag }: { number: string; title: string; text: string; tag: string }) {
  return <article><span>{number}</span><h3>{title}</h3><p>{text}</p><small>{tag}</small></article>;
}
