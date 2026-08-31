'use client';

import React, { useState } from 'react';
import type { UserProfile } from '../types/save';

export type StudentInfo = Pick<UserProfile, 'schoolName' | 'schoolGrade' | 'className' | 'studentName'>;

interface Props {
  onComplete: (info: StudentInfo) => void;
}

export default function ProfileSetup({ onComplete }: Props) {
  const [schoolName, setSchoolName] = useState('');
  const [schoolGrade, setSchoolGrade] = useState<UserProfile['schoolGrade']>(1);
  const [className, setClassName] = useState('');
  const [studentName, setStudentName] = useState('');
  const [error, setError] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const info = {
      schoolName: schoolName.trim(),
      schoolGrade,
      className: className.trim(),
      studentName: studentName.trim(),
    };
    if (!info.schoolName || !info.className || !info.studentName) {
      setError('학교, 학년, 반, 이름을 모두 적어 줘. 모르면 선생님께 물어봐도 돼.');
      return;
    }
    setError('');
    onComplete(info);
  };

  return (
    <main className="k-profile" data-screen="profile" aria-labelledby="k-profile-title">
      <section className="k-profile-card">
        <header>
          <span aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M8 42V15h32v27M5 15 24 5l19 10M18 42V30h12v12M13 21h6m10 0h6" /></svg></span>
          <div>
            <p>대피지도에 이름표를 붙여 볼까?</p>
            <h1 id="k-profile-title">학교 정보를 알려 줘</h1>
          </div>
        </header>
        <p className="k-profile-lead">선생님과 함께 쓰는 지도라면 학교·학년·반·이름을 적어 줘.</p>
        <form onSubmit={submit} noValidate>
          <label className="k-profile-school">
            <span>학교</span>
            <input data-profile="school" data-allowed-free-text="student-profile" value={schoolName} onChange={(event) => setSchoolName(event.target.value)} maxLength={40} placeholder="예: 부평초등학교" autoComplete="organization" autoFocus />
          </label>
          <label>
            <span>학년</span>
            <select data-profile="grade" value={schoolGrade} onChange={(event) => setSchoolGrade(Number(event.target.value) as UserProfile['schoolGrade'])}>
              {[1, 2, 3, 4, 5, 6].map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}
            </select>
          </label>
          <label>
            <span>반</span>
            <input data-profile="class" data-allowed-free-text="student-profile" value={className} onChange={(event) => setClassName(event.target.value)} maxLength={10} placeholder="예: 3반" autoComplete="off" />
          </label>
          <label>
            <span>이름</span>
            <input data-profile="name" data-allowed-free-text="student-profile" value={studentName} onChange={(event) => setStudentName(event.target.value)} maxLength={20} placeholder="내 이름" autoComplete="name" />
          </label>
          {error ? <p className="k-profile-error" role="alert">{error}</p> : null}
          <p className="k-profile-privacy"><b>안심해도 돼!</b> 적은 정보는 인터넷으로 보내지 않고, 이 PC의 대피지도에만 사용해.</p>
          <button type="submit" className="k-profile-start" data-coach="kids-profile-start">우리집 대피지도 그리기 <span aria-hidden="true">→</span></button>
        </form>
        <small>혼자 적기 어렵다면 부모님이나 선생님께 도움을 요청해도 좋아.</small>
      </section>
    </main>
  );
}
