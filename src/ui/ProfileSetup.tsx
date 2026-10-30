'use client';

/**
 * 이름표 — 소개 뒤, 지도 만들기 전에 한 번 (설계서 v1.18 §3).
 *
 * 묻는 것은 둘뿐이다. 이름은 비워도 되고, 학년은 이용 수준의 무난한 기본값을 정한다.
 * 학교·반은 묻지 않는다 — 이 앱은 한 아이의 학습 도구이지 기관의 명부가 아니다.
 * 적은 것은 이 기기 안의 저장 자료에만 남는다 (CON-2 · CON-8).
 */
import React, { useEffect, useState } from 'react';
import type { SchoolGrade, UserProfile } from '../types/save';
import { loadKids } from '../store/storage';

export type StudentInfo = Pick<UserProfile, 'schoolGrade' | 'studentName'>;

interface Props {
  onComplete: (info: StudentInfo) => void;
  /** 첫 화면으로 */
  onHome?: () => void;
}

const GRADES: SchoolGrade[] = [1, 2, 3, 4, 5, 6];
/** 학년을 고르지 않고 시작하면 가운데 학년으로 본다 — 막지 않는다 (작업지침 §4) */
const FALLBACK_GRADE: SchoolGrade = 3;
const NAME_MAX = 12;

export default function ProfileSetup({ onComplete, onHome }: Props) {
  const [studentName, setStudentName] = useState('');
  const [grade, setGrade] = useState<SchoolGrade | null>(null);
  const [returning, setReturning] = useState(false);

  /* 지난번 이름표가 있으면 미리 채운다. 수화 뒤에 읽어야 서버 HTML 과 어긋나지 않는다 */
  useEffect(() => {
    const saved = loadKids();
    if (!saved) return;
    setStudentName(saved.profile.studentName);
    setGrade(saved.profile.schoolGrade);
    setReturning(saved.plan.blocks.length > 0);
  }, []);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onComplete({ studentName: studentName.trim().slice(0, NAME_MAX), schoolGrade: grade ?? FALLBACK_GRADE });
  };

  return (
    <main className="k-profile" data-screen="profile" aria-labelledby="k-profile-title">
      {onHome && (
        <button type="button" className="k-profile-home" data-coach="kids-home" onClick={onHome} title="첫 화면으로">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 11l8-7 8 7" />
            <path d="M6 10v10h12V10" />
          </svg>
          첫 화면
        </button>
      )}
      <section className="k-profile-card">
        <header>
          <span aria-hidden="true">
            <svg viewBox="0 0 48 48">
              <rect x="6" y="12" width="36" height="26" rx="5" />
              <path d="M14 22h10M14 29h20" />
              <circle cx="33" cy="21" r="3.2" />
            </svg>
          </span>
          <div>
            <p>{returning ? '다시 왔구나! 그리던 지도를 이어서 열게.' : '대피지도에 이름표를 붙여 볼까?'}</p>
            <h1 id="k-profile-title">내 이름표를 만들자</h1>
          </div>
        </header>
        <p className="k-profile-lead">이름은 적어도 되고 비워도 돼. 학년을 고르면 네 눈높이에 맞는 말로 시작할게.</p>
        <form onSubmit={submit} noValidate>
          <label className="k-profile-name">
            <span>이름</span>
            <input
              data-profile="name"
              data-allowed-free-text="student-profile"
              value={studentName}
              onChange={(event) => setStudentName(event.target.value.slice(0, NAME_MAX))}
              maxLength={NAME_MAX}
              placeholder="내 이름 (비워도 돼)"
              autoComplete="off"
              autoFocus
            />
          </label>
          <fieldset className="k-profile-grades" data-profile="grade">
            <legend>학년</legend>
            <div role="group" aria-label="학년 고르기">
              {GRADES.map((value) => (
                <button
                  key={value}
                  type="button"
                  data-grade={value}
                  aria-pressed={grade === value}
                  className={grade === value ? 'on' : ''}
                  onClick={() => setGrade(value)}
                >
                  {value}학년
                </button>
              ))}
            </div>
            <small>{grade === null ? '모르겠으면 안 골라도 돼. 3학년 눈높이로 시작할게.' : grade <= 3 ? '쉬운 말로 알려 줄게. 위쪽에서 언제든 바꿀 수 있어.' : '조금 더 자세한 말로 알려 줄게. 위쪽에서 언제든 바꿀 수 있어.'}</small>
          </fieldset>
          <p className="k-profile-privacy">
            <b>안심해도 돼!</b> 적은 이름은 인터넷으로 보내지 않고, 이 PC 안의 대피지도에만 써.
          </p>
          <button type="submit" className="k-profile-start" data-coach="kids-profile-start">
            {returning ? '그리던 지도 이어서 하기' : '우리집 대피지도 그리기'} <span aria-hidden="true">→</span>
          </button>
        </form>
        <small>혼자 하기 어렵다면 부모님이나 선생님과 같이 해도 좋아.</small>
      </section>
    </main>
  );
}
