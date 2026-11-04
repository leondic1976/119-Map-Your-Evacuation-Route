/** 첫 화면과 이름표 */
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { bandOfGrade, BANDS } from '../content/bands';
import { GRADES, LOOKS, type LookId } from '../content/names';
import { host } from '../platform/host';
import { saveProfile, startApp, startOver, useApp } from '../store/app';
import { IconNext, KidFace } from './art';
import { WelcomeScene } from './WelcomeScene';

/** 연필이 집을 그리고, 칸이 칠해지고, 빨간 길을 따라 아이가 나가는 그림. 되풀이한다 */
function CoverDrawing() {
  return (
    <svg className="cover-art" viewBox="0 0 640 440" role="img" aria-label="점을 이어 그린 집과 빨간 나가는 길">
      <defs>
        <pattern id="cv-room" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
          <rect width="22" height="22" fill="#ffe3a3" />
          <path d="M0 6h22M0 16h22" stroke="#fcc75f" strokeWidth="3.5" opacity=".7" />
        </pattern>
        <pattern id="cv-pass" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(-32)">
          <rect width="22" height="22" fill="#c6e8f8" />
          <path d="M0 6h22M0 16h22" stroke="#8cccec" strokeWidth="3.5" opacity=".7" />
        </pattern>
      </defs>
      <g className="cv-all">
      <g className="cv-fills">
        <rect className="cv-fill f1" x="120" y="60" width="190" height="150" fill="url(#cv-room)" />
        <rect className="cv-fill f2" x="310" y="60" width="210" height="150" fill="url(#cv-room)" />
        <rect className="cv-fill f3" x="120" y="210" width="400" height="130" fill="url(#cv-pass)" />
      </g>
      <g fill="#a9b7bd">
        {Array.from({ length: 6 }, (_, y) =>
          Array.from({ length: 8 }, (_, x) => <circle key={`${x}-${y}`} cx={50 + x * 76} cy={40 + y * 70} r="4.5" />),
        )}
      </g>
      <path className="cv-line l1" d="M120 60H520V340H120Z" />
      <path className="cv-line l2" d="M310 60V210" />
      <path className="cv-line l3" d="M120 210H520" />
      <path className="cv-route" d="M215 135V275H340V378" />
      <path className="cv-arrow" d="M322 366 340 396 358 366z" />
      <g className="cv-word">
        <text x="215" y="110">방</text>
        <text x="415" y="110">방</text>
        <text x="420" y="282">지나가는 곳</text>
      </g>
      <g className="cv-walker">
        <circle cy="-30" r="13" fill="#f6d3b0" stroke="#33363b" strokeWidth="3" />
        <path d="M-13-32A13 13 0 0 1 13-32Z" fill="#2b211b" />
        <rect x="-11" y="-17" width="22" height="22" rx="8" fill="#2f7fbf" stroke="#33363b" strokeWidth="3" />
      </g>
      </g>
    </svg>
  );
}

export function Welcome() {
  const hasProfile = useApp((s) => Boolean(s.profile));
  const installGuide = host.installGuide();
  const main = useRef<HTMLElement>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirm(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm]);
  // 손을 따라 배경이 조금씩 움직인다. 화면을 다시 그리지 않고 CSS 값만 바꾼다
  const onMove = (e: RPointerEvent<HTMLElement>) => {
    const el = main.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
    el.style.setProperty('--py', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
  };
  return (
    <main ref={main} className="welcome" onPointerMove={onMove}>
      <WelcomeScene />
      <header className="welcome-top">
        <img src="./art/incheon-fire-symbol.png" alt="인천소방본부 심벌" />
        <span>
          <b>인천소방본부</b>
          <small>어린이 화재안전교육</small>
        </span>
        {installGuide && (
          <a className="install-link" href={installGuide} data-testid="install-link">
            인터넷 없이 쓰기
          </a>
        )}
      </header>
      <div className="welcome-body">
        <div className="welcome-text">
          <h1>
            <span>우리집</span> 대피지도
          </h1>
          <p className="welcome-lead">점을 이어 우리 집을 그리고, 불이 나면 어디로 나갈지 미리 찾아보자.</p>
          <ol className="welcome-steps">
            <li><b>1</b> 점을 이어 집 그리기</li>
            <li><b>2</b> 칸을 눌러 나가는 길 찾기</li>
            <li><b>3</b> 화재 대피 연습하기</li>
          </ol>
          {confirm ? (
            <div className="welcome-confirm" role="group" aria-label="처음부터 다시 하기">
              <p>지금 그린 지도가 지워져. 정말 처음부터 그릴까?</p>
              <div className="welcome-actions">
                <button type="button" className="btn primary" data-testid="start-over-yes" autoFocus onClick={startOver}>처음부터 그리기</button>
                <button type="button" className="btn" data-testid="start-over-no" onClick={() => setConfirm(false)}>그대로 두기</button>
              </div>
            </div>
          ) : (
            <div className="welcome-actions">
              <button type="button" className="big-start" data-testid="start" onClick={startApp}>
                {hasProfile ? '이어서 그리기' : '시작하기'} <IconNext size={30} />
              </button>
              {hasProfile && (
                <button type="button" className="btn" data-testid="start-over" onClick={() => setConfirm(true)}>처음부터 다시 하기</button>
              )}
            </div>
          )}
        </div>
        <div className="welcome-art">
          <CoverDrawing />
          <div className="welcome-chars" aria-hidden="true">
            <img src="./art/yeongi_happy.webp" alt="" />
            <img src="./art/ilgu_happy.webp" alt="" />
            <img src="./art/ungi_happy.webp" alt="" />
          </div>
        </div>
      </div>
      <p className="welcome-foot">
        <b>소방청 친구들 영이, 일구, 웅이와 함께 우리 가족의 대피 길을 미리 찾아보자!</b>
      </p>
    </main>
  );
}

export function NameTag() {
  const profile = useApp((s) => s.profile);
  const [name, setName] = useState(profile?.name ?? '');
  const [grade, setGrade] = useState<number | null>(profile?.grade ?? null);
  const [look, setLook] = useState<LookId>(profile?.look ?? LOOKS[0].id);

  const ready = grade !== null;
  const bandLabel = grade ? BANDS[bandOfGrade(grade)].label : null;
  const willReset = profile && grade && bandOfGrade(profile.grade) !== bandOfGrade(grade);

  return (
    <main className="nametag-wrap">
      <form
        className="nametag"
        onSubmit={(e) => {
          e.preventDefault();
          if (grade !== null) saveProfile({ name: name.trim(), grade, look });
        }}
      >
        <h1>내 이름표</h1>

        <fieldset>
          <legend>몇 학년이야?</legend>
          <div className="grade-row">
            {GRADES.map((g) => (
              <button key={g} type="button" className={grade === g ? 'grade on' : 'grade'} data-testid={`grade-${g}`} aria-pressed={grade === g} onClick={() => setGrade(g)}>
                {g}<small>학년</small>
              </button>
            ))}
          </div>
          {bandLabel && <p className="field-note" data-testid="band-label">{bandLabel}에 맞춰 준비할게.</p>}
          {willReset && <p className="field-note warn">학년 단계가 바뀌면 새 종이에서 다시 그리게 돼.</p>}
        </fieldset>

        <fieldset>
          <legend>내 모습을 골라 보자</legend>
          <div className="look-row">
            {LOOKS.map((l) => (
              <button key={l.id} type="button" className={look === l.id ? 'look on' : 'look'} data-testid={`look-${l.id}`} aria-pressed={look === l.id} aria-label={`모습 ${l.id}`} onClick={() => setLook(l.id)}>
                <KidFace look={l.id} size={64} />
              </button>
            ))}
          </div>
        </fieldset>

        <label className="name-field">
          <span>이름 (안 적어도 돼)</span>
          <input data-testid="name" value={name} maxLength={8} autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </label>

        <button type="submit" className="big-start" data-testid="tag-done" disabled={!ready}>
          지도 그리러 가기 <IconNext size={30} />
        </button>
      </form>
    </main>
  );
}
