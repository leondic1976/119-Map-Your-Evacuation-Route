'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { campaignScore } from '../core/campaign/score';
import { campaignRecordId, readCampaignRecords, upsertCampaignRecord, type CampaignRecord } from '../platform/campaign';
import { useKids } from '../store/kidsStore';
import { CloseIcon } from './Onboarding';

interface Props { onClose: () => void }

export default function CampaignDashboard({ onClose }: Props) {
  const profile = useKids((state) => state.profile);
  const plan = useKids((state) => state.plan);
  const routes = useKids((state) => state.routes);
  const progress = useKids((state) => state.progress);
  const [records, setRecords] = useState<CampaignRecord[]>([]);
  const [school, setSchool] = useState('전체');
  const [grade, setGrade] = useState('전체');
  const [className, setClassName] = useState('전체');

  useEffect(() => {
    const score = campaignScore(plan, routes, progress);
    if (profile.schoolName && profile.className && profile.studentName) {
      setRecords(upsertCampaignRecord({
        id: campaignRecordId(profile.schoolName, profile.schoolGrade, profile.className, profile.studentName),
        schoolName: profile.schoolName,
        schoolGrade: profile.schoolGrade,
        className: profile.className,
        studentName: profile.studentName,
        updatedAt: new Date().toISOString(),
        score,
      }));
    } else setRecords(readCampaignRecords());
  }, [plan, profile, progress, routes]);

  const schools = unique(records.map((record) => record.schoolName));
  const grades = unique(records.filter((record) => school === '전체' || record.schoolName === school).map((record) => String(record.schoolGrade)));
  const classes = unique(records.filter((record) => (school === '전체' || record.schoolName === school) && (grade === '전체' || String(record.schoolGrade) === grade)).map((record) => record.className));
  const filtered = useMemo(() => records.filter((record) =>
    (school === '전체' || record.schoolName === school)
    && (grade === '전체' || String(record.schoolGrade) === grade)
    && (className === '전체' || record.className === className)), [className, grade, records, school]);
  const complete = filtered.filter((record) => record.score.total >= 80).length;
  const average = filtered.length ? Math.round(filtered.reduce((sum, record) => sum + record.score.total, 0) / filtered.length) : 0;

  return (
    <div className="k-modal-back k-dashboard-back" onClick={onClose} role="presentation">
      <section className="k-dashboard" role="dialog" aria-modal="true" aria-labelledby="k-dashboard-title" onClick={(event) => event.stopPropagation()}>
        <header className="k-dashboard-head">
          <div><p>부평소방서 어린이 화재안전 캠페인</p><h2 id="k-dashboard-title">우리집 대피지도 캠페인 대시보드</h2></div>
          <button type="button" className="k-x" onClick={onClose} aria-label="닫기"><CloseIcon /></button>
        </header>

        <div className="k-dashboard-notice"><b>현재는 이 PC의 자료만 보여 줍니다.</b> 기관 공동관리는 보호자 동의와 기관별 로그인·권한을 갖춘 안전한 서버가 준비된 뒤 연결합니다.</div>

        <div className="k-dashboard-roles">
          <article><i>119</i><div><b>소방서</b><span>참여 현황과 안전 항목 살펴보기</span></div></article>
          <article><i>학교</i><div><b>학교·어린이집</b><span>학년·반별 지도 만들기 돕기</span></div></article>
          <article><i>가족</i><div><b>학부모</b><span>소화기와 만나는 장소 함께 확인하기</span></div></article>
        </div>

        <div className="k-dashboard-summary">
          <article><span>참여 어린이</span><b>{filtered.length}<small>명</small></b></article>
          <article><span>안전지도 완료</span><b>{complete}<small>명</small></b></article>
          <article><span>평균 안전 완성도</span><b>{average}<small>점</small></b></article>
          <article><span>함께 확인할 지도</span><b>{filtered.length - complete}<small>개</small></b></article>
        </div>

        <div className="k-dashboard-filters" aria-label="학교 학년 반 필터">
          <label>학교<select data-dashboard-filter="school" value={school} onChange={(event) => { setSchool(event.target.value); setGrade('전체'); setClassName('전체'); }}><option>전체</option>{schools.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>학년<select data-dashboard-filter="grade" value={grade} onChange={(event) => { setGrade(event.target.value); setClassName('전체'); }}><option>전체</option>{grades.map((value) => <option key={value} value={value}>{value}학년</option>)}</select></label>
          <label>반<select data-dashboard-filter="class" value={className} onChange={(event) => setClassName(event.target.value)}><option>전체</option>{classes.map((value) => <option key={value}>{value}</option>)}</select></label>
          <span className="k-dashboard-score-note">안전 완성도: 구조 20 + 안전 위치 25 + 경로 30 + 연습 25</span>
        </div>

        <div className="k-dashboard-table-wrap">
          <table className="k-dashboard-table">
            <thead><tr><th>학교</th><th>학년·반</th><th>이름</th><th>구조</th><th>안전 위치</th><th>대피경로</th><th>연습</th><th>안전 완성도</th><th>최근 활동</th></tr></thead>
            <tbody>
              {filtered.map((record) => <tr key={record.id}>
                <td>{record.schoolName}</td><td>{record.schoolGrade}학년 {record.className}</td><td><b>{record.studentName}</b></td>
                <td>{record.score.structure}/20</td><td>{record.score.safety}/25</td><td>{record.score.routes}/30</td><td>{record.score.practice}/25</td>
                <td><span className={`k-score${record.score.total >= 80 ? ' done' : ''}`}>{record.score.total}점</span></td>
                <td>{new Date(record.updatedAt).toLocaleDateString('ko-KR')}</td>
              </tr>)}
              {!filtered.length ? <tr><td colSpan={9} className="k-dashboard-empty">조건에 맞는 대피지도가 아직 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function unique(values: string[]): string[] { return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'ko-KR')); }
