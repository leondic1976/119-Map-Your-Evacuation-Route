'use client';

/**
 * 어린이 화면 골격 — docs/DESIGN-v1.1-changes.md §4.6.
 *
 *   상단바   이름 · 쉬움/보통 · 그림/도면 · 연습/도전 · 되돌리기
 *   가운데   팔레트 | 도면(편집·게임 공용) + 캐릭터 말풍선 덮개 | (리포트)
 *   하단바   [이제 뭘 해야 해?] [대피 연습 시작!] [뽑기] …  진행률
 *
 * 재난 탭은 프리셋 수만큼 생긴다. 기본판은 화재 1종이므로 탭이 없다 (FR-2.1 개정).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BLOCKS, HAZARD_PRESETS, REQUIRED_BLOCKS, blockName } from '../content';
import { checklist, missingOf } from '../core/checklist';
import { i } from '../core/josa';
import { isOpening } from '../types/plan';
import { RULES } from '../core/rules/definitions';
import { hasCritical, severityOf, titleOf } from '../core/rules/engine';
import { firstIssue, ruleReportsFor, useKids } from '../store/kidsStore';
import { SaveIncompatibleError } from '../store/migrate';
import { downloadBlob, downloadText, readSaveFile, serializeSave } from '../store/storage';
import { svgToPng } from '../platform/raster';
import KidsCanvas from './KidsCanvas';
import GuideBubble from './GuideBubble';
import GameView from './GameView';
import ReportView from './ReportView';
import Palette from './Palette';
import HowTo from './HowTo';
import Onboarding, { CloseIcon } from './Onboarding';
import KidsPrint, { SHEET_H, SHEET_W } from './KidsPrint';
import { SLOT_STYLE } from './PlanSvg';
import { PLAYER_NAME } from './Avatar';
import { KIDS, KidPortrait } from './KidCharacters';
import { PLAYER_CHARACTERS } from '../types/guide';
import { playDoor, playTap, stopSpeaking, unlockAudio } from './sound';

export default function KidsShell() {
  const ready = useKids((s) => s.ready);
  const step = useKids((s) => s.step);
  const mode = useKids((s) => s.mode);
  const profile = useKids((s) => s.profile);
  const plan = useKids((s) => s.plan);
  const routes = useKids((s) => s.routes);
  const hazardId = useKids((s) => s.hazardId);
  const routeSlot = useKids((s) => s.routeSlot);
  const seenCardIds = useKids((s) => s.seenCardIds);
  const past = useKids((s) => s.past);
  const future = useKids((s) => s.future);
  const toast = useKids((s) => s.toast);
  const savedAt = useKids((s) => s.savedAt);
  const saveError = useKids((s) => s.saveError);
  const selection = useKids((s) => s.selection);
  const layer = useKids((s) => s.layer);
  const timed = useKids((s) => s.timed);
  const ops = useKids((s) => s.ops);
  const startedAt = useKids((s) => s.startedAt);
  const lastOpAt = useKids((s) => s.lastOpAt);
  const progress = useKids((s) => s.progress);

  const [onboard, setOnboard] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [gray, setGray] = useState(false);
  const [help, setHelp] = useState(false);
  const [dev, setDev] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [badFile, setBadFile] = useState<{ version: number; raw: string } | null>(null);
  /** 필수가 빠졌을 때 시작 직전에 한 번만 묻는다 (설계서 v1.2 §1.4) */
  const [askMissing, setAskMissing] = useState<string[] | null>(null);
  const [pickChar, setPickChar] = useState(false);
  /** 좁은 화면에서 상단바 단추를 모아 두는 시트 */
  const [sheet, setSheet] = useState(false);
  const sheetRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* 시작 */
  useEffect(() => {
    /* 소리 켬/끔은 boot() 안에서 저장을 읽자마자 맞춘다 (설계서 v1.6 §3) */
    useKids.getState().boot();
    document.body.classList.add('kids-mode');
    const style = document.createElement('style');
    style.id = 'k-page';
    style.textContent = '@page { size: A4 portrait; margin: 10mm; }';
    document.head.appendChild(style);
    setDev(window.location.search.includes('dev'));
    /* 자동 재생 제한 — 처음 누른 뒤에야 소리를 낼 수 있다 (설계서 v1.2 §7.2) */
    const once = () => unlockAudio();
    window.addEventListener('pointerdown', once, { once: true });
    window.addEventListener('keydown', once, { once: true });
    return () => {
      document.body.classList.remove('kids-mode');
      style.remove();
      window.removeEventListener('pointerdown', once);
      window.removeEventListener('keydown', once);
      stopSpeaking();
    };
  }, []);

  /* 온보딩 1·2단계는 모달로 */
  useEffect(() => {
    if (!ready) return;
    setOnboard(step === 'template');
  }, [ready, step]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useKids.getState().clearToast(), 3400);
    return () => clearTimeout(t);
  }, [toast]);

  /* 조작 없이 가만히 있으면 캐릭터가 말을 건다 (idle 트리거) · 경과 시간 */
  useEffect(() => {
    const t = setInterval(() => {
      const s = useKids.getState();
      if (!s.ready || s.mode === 'game') return;
      const idle = Math.floor((Date.now() - s.lastOpAt) / 1000);
      if (idle >= 20 && !s.bubble) s.fire({ on: 'idle', seconds: idle });
      setElapsed(Math.floor((Date.now() - s.startedAt) / 1000));
    }, 5000);
    return () => clearInterval(t);
  }, []);

  /* 단축키 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      const s = useKids.getState();
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveFile();
        return;
      }
      if (meta && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        window.print();
        return;
      }
      if (meta) return;
      if (s.mode === 'game') return;
      if (e.key === 'Escape') {
        if (s.drafting) s.endRoute();
        s.select(null);
        s.arm(null);
        /* 덮개는 모두 Esc 로 닫힌다 (작업지침 §5). 닫는 쪽은 어느 것도 되돌릴 수 없는 일을 하지 않는다 */
        setPreview(false);
        setHelp(false);
        setSheet(false);
        setPickChar(false);
        setConfirmReset(false);
        setAskMissing(null);
        setBadFile(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && s.selection) {
        e.preventDefault();
        s.removeBlock(s.selection);
        return;
      }
      if (e.key === '?') setHelp(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reports = useMemo(() => ruleReportsFor({ plan, routes, hazardId, profile, seenCardIds }), [plan, routes, hazardId, profile, seenCardIds]);
  const issue = firstIssue(reports);
  const critical = reports.some((r) => hasCritical(RULES, r));
  const pair = routes[hazardId] ?? {};
  const drawn = (pair.primary ? 1 : 0) + (pair.alternate ? 1 : 0);
  const completeness = reports.length ? reports.reduce((s, r) => s + r.completeness, 0) / reports.length : 0;
  const pct = Math.round((drawn / 2) * 0.5 * 100 + completeness * 50);
  const easy = profile.gradeMode === 'easy';
  const editing = mode === 'edit';
  const selectedBlock = selection ? plan.blocks.find((b) => b.id === selection) : undefined;
  const selectedOpening = selectedBlock && isOpening(selectedBlock) ? selectedBlock : null;
  const onboardingOnCanvas = step === 'mySpot' || step === 'meeting';
  const required = useMemo(() => checklist(plan, REQUIRED_BLOCKS), [plan]);
  const missing = missingOf(required);

  /** 시작 — 필수가 빠졌으면 막지 않고 한 번 물어본다 (D5) */
  const startGame = useCallback(() => {
    const gaps = missingOf(checklist(useKids.getState().plan, REQUIRED_BLOCKS));
    if (gaps.length > 0) {
      setAskMissing(gaps);
      return;
    }
    useKids.getState().startGameNow();
  }, []);

  const saveFile = useCallback(() => {
    const s = useKids.getState();
    downloadText(serializeSave(s.toSaveFile()), `우리집-대피지도-${new Date().toISOString().slice(0, 10)}.json`);
    s.notify('파일로 저장했다.');
  }, []);

  const exportPng = useCallback(async () => {
    const svg = sheetRef.current;
    if (!svg) return;
    try {
      const blob = await svgToPng(svg, SHEET_W, SHEET_H);
      downloadBlob(blob, `우리집-대피지도-${new Date().toISOString().slice(0, 10)}.png`);
      useKids.getState().notify('그림(PNG)으로 저장했다.');
    } catch (e) {
      useKids.getState().notify(e instanceof Error ? e.message : '그림으로 바꾸지 못했다.', 'warn');
    }
  }, []);

  const onOpenFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const file = await readSaveFile(f);
      useKids.getState().replace(file);
    } catch (e) {
      if (e instanceof SaveIncompatibleError) setBadFile({ version: e.foundVersion, raw: e.rawText });
      else useKids.getState().notify('파일을 읽지 못했다.', 'warn');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const saved = savedAt ? new Date(savedAt).toLocaleTimeString('ko-KR', { hour12: false }) : null;
  const preset = HAZARD_PRESETS.find((p) => p.id === hazardId);

  return (
    <>
      <div className={`k-app mode-${mode}`} data-level="kids" data-step={step}>
        {/* 상단바 */}
        <header className="k-top">
          <div className="k-brand">
            <BrandMark />
            <span>
              우리집 대피지도 <small>{easy ? '초등학생' : '초등 고학년'}</small>
            </span>
          </div>

          {/* 재난 탭 — 프리셋이 둘 이상일 때만 (FR-2.1 개정) */}
          {HAZARD_PRESETS.length > 1 && (
            <nav className="k-tabs" aria-label="재난 종류">
              {HAZARD_PRESETS.map((p) => (
                <button key={p.id} type="button" className={`k-tab${hazardId === p.id ? ' on' : ''}`} aria-pressed={hazardId === p.id} onClick={() => useKids.setState({ hazardId: p.id })}>
                  {p.label}
                </button>
              ))}
            </nav>
          )}

          <span className="k-spacer" />

          <div className="k-seg k-hide-sm" role="group" aria-label="이용 수준" data-coach="kids-grade">
            <button type="button" aria-pressed={easy} onClick={() => useKids.getState().setProfile({ gradeMode: 'easy' })}>
              쉬움
            </button>
            <button type="button" aria-pressed={!easy} onClick={() => useKids.getState().setProfile({ gradeMode: 'normal' })}>
              보통
            </button>
          </div>
          <div className="k-seg k-hide-sm" role="group" aria-label="게임 방식" data-coach="kids-timed">
            <button type="button" aria-pressed={!timed} onClick={() => useKids.getState().setTimed(false)} title="시간제한 없음 — 기본값">
              연습
            </button>
            <button type="button" aria-pressed={timed} onClick={() => useKids.getState().setTimed(true)} title="시간 게이지가 줄어든다">
              도전
            </button>
          </div>
          <div className="k-seg k-hide-sm" role="group" aria-label="블록 외형">
            <button type="button" aria-pressed={profile.blockStyle === 'kid'} onClick={() => useKids.getState().setProfile({ blockStyle: 'kid' })}>
              그림
            </button>
            <button type="button" aria-pressed={profile.blockStyle === 'blueprint'} onClick={() => useKids.getState().setProfile({ blockStyle: 'blueprint' })}>
              도면
            </button>
          </div>

          <button type="button" className="k-tb" onClick={() => useKids.getState().undo()} disabled={!past.length || !editing} title="되돌리기 (Ctrl+Z)">
            <UndoIcon /> 되돌리기
          </button>
          <button type="button" className="k-tb k-hide-sm" onClick={() => useKids.getState().redo()} disabled={!future.length || !editing} title="다시 하기 (Ctrl+Shift+Z)">
            <RedoIcon /> 다시
          </button>
          <button type="button" className="k-tb k-hide-sm" onClick={() => setOnboard(true)} disabled={!editing} title="다른 집 모양을 고른다" data-coach="kids-template">
            집 모양
          </button>
          <button type="button" className="k-tb k-hide-sm" onClick={() => setConfirmReset(true)} disabled={!editing} title="그린 것을 모두 지우고 처음부터">
            처음부터
          </button>
          <button type="button" className="k-tb k-hide-sm" onClick={() => setPickChar(true)} title="게임에서 내가 될 캐릭터를 고른다" data-coach="kids-character">
            <span className="k-char-chip" aria-hidden="true">
              <KidPortrait id={profile.playerCharacter} size={26} />
            </span>
            내 캐릭터
          </button>
          <button
            type="button"
            className="k-tb"
            aria-pressed={profile.soundOn}
            data-coach="kids-sound"
            title={profile.soundOn ? '소리를 끈다' : '소리를 켠다'}
            onClick={() => {
              const next = !profile.soundOn;
              if (next) unlockAudio();
              /* 알리는 것도 저장하는 것도 setProfile 한 곳에서 한다 */
              useKids.getState().setProfile({ soundOn: next });
              if (next) playTap(true);
            }}
          >
            <SoundIcon on={profile.soundOn} /> {profile.soundOn ? '소리 켬' : '소리 끔'}
          </button>
          <button type="button" className="k-tb k-only-sm" onClick={() => setSheet(true)} aria-haspopup="dialog" data-coach="kids-more">
            <MoreIcon /> 더보기
          </button>
          <button type="button" className="k-tb k-hide-sm" onClick={() => setHelp(true)} title="사용법 (?)">
            사용법
          </button>
        </header>

        {/* 가운데 */}
        <div className="k-work">
          <Palette />
          <main className="k-center">
            {editing && (
              <div className="k-canvas-bar">
                <div className="k-seg dark" role="group" aria-label="경로" data-coach="kids-route-slot">
                  {(['primary', 'alternate'] as const).map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      aria-pressed={routeSlot === slot}
                      data-slot={slot}
                      style={{ ['--tab' as string]: SLOT_STYLE[slot].color, ['--tab-ink' as string]: SLOT_STYLE[slot].ink }}
                      onClick={() => useKids.getState().setStep(slot === 'primary' ? 'route' : 'routeAlt')}
                    >
                      <i className="k-tab-no">{SLOT_STYLE[slot].no}</i> {SLOT_STYLE[slot].short}
                      {pair[slot] && <i className="k-tab-done" aria-label="그렸다" />}
                    </button>
                  ))}
                </div>
                {pair[routeSlot] && (
                  <button type="button" className="k-tb sm" onClick={() => useKids.getState().clearRoute()} title="이 경로만 지운다" data-coach="kids-clear-route">
                    {easy ? '이 길 지우기' : '이 경로 지우기'}
                  </button>
                )}
                <span className="k-spacer" />
                <label className="k-chk" title="계산으로 찾은 가장 짧은 길을 회색 점선으로 보여 준다">
                  <input type="checkbox" checked={showHint} onChange={(e) => setShowHint(e.target.checked)} />
                  {easy ? '힌트 길' : '최단경로'}
                </label>
                <label className="k-chk" title="집 밖 복도·계단까지 그린다 (FR-1.9)">
                  <input type="checkbox" checked={layer === 'common'} onChange={(e) => useKids.setState({ layer: e.target.checked ? 'common' : 'home' })} />
                  {easy ? '집 밖도 그리기' : '공용부'}
                </label>
                <label className="k-chk" title="흑백 인쇄에서도 읽히는지 미리 본다 (P4)">
                  <input type="checkbox" checked={gray} onChange={(e) => setGray(e.target.checked)} />
                  흑백
                </label>
              </div>
            )}

            <div className="k-canvas-wrap">
              {mode === 'report' ? (
                <ReportView onPrint={() => setPreview(true)} />
              ) : (
                <>
                  <KidsCanvas showHint={showHint} grayscale={gray} />
                  {mode === 'game' && <GameView />}
                  {editing && plan.blocks.length === 0 && step !== 'template' && (
                    <div className="k-empty">
                      <p>{easy ? '아직 아무것도 없어. 왼쪽에서 “방”을 고르고 도면을 눌러 보자.' : '도면이 비어 있다. 팔레트에서 방을 골라 도면을 누른다.'}</p>
                      <button type="button" className="k-big" onClick={() => setOnboard(true)}>
                        {easy ? '집 모양 고르기' : '평면 고르기'}
                      </button>
                    </div>
                  )}
                  {editing && onboardingOnCanvas && (
                    <div className="k-selbar" role="status" data-coach="kids-onboard-hint">
                      {step === 'mySpot' ? (easy ? '네 방을 눌러 줘.' : '잠자는 방을 누른다.') : easy ? '집 밖 빈 곳을 눌러 만나는 곳을 놓자.' : '도면 밖 빈 곳을 눌러 만나는 곳을 놓는다.'}
                      {step === 'meeting' && (
                        <button type="button" className="k-link" data-coach="kids-meeting-later" onClick={() => useKids.getState().pickMeeting(null)}>
                          {easy ? '나중에 정할래' : '나중에'}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 말풍선은 도면 아래 칸이다 — 지도를 가리지 않는다 (설계서 v1.2 §6.1) */}
            <GuideBubble />

            {/* 점검 한 줄 — 자세한 것은 리포트와 캐릭터가 한다 */}
            {editing && reports.length > 0 && (
              <div className={`k-report${critical ? ' warn' : ''}`} data-coach="kids-report-bar">
                <b>{easy ? '점검' : '규칙 점검'}</b>
                {!issue ? (
                  <span>{pair.primary ? (easy ? '고칠 곳이 없어!' : '위반 없음') : easy ? '길을 그리면 더 자세히 점검해 줄게.' : '경로를 그리면 경로 규칙도 평가한다.'}</span>
                ) : (
                  <span>
                    {easy ? '먼저 볼 것: ' : '첫 지적: '}
                    {titleOf(RULES, issue.ruleId)}
                    <small className={`k-sev ${severityOf(RULES, issue.ruleId)}`}>{sevLabel(severityOf(RULES, issue.ruleId), easy)}</small>
                  </span>
                )}
                <button type="button" className="k-link" onClick={() => useKids.getState().runChecks(true)}>
                  {easy ? '봐 줘' : '지적 보기'}
                </button>
                <span className="k-spacer" />
                <span className="k-req-count" data-coach="kids-required" title={missing.length ? `아직 없는 것: ${missing.map((m) => blockName(m, easy ? 'easy' : 'normal')).join(', ')}` : '꼭 있어야 하는 것을 다 놓았다'}>
                  {easy ? '있어야 하는 것' : '필수'} <b className="num">{required.length - missing.length}/{required.length}</b>
                </span>
              </div>
            )}
          </main>
          <HowTo />
        </div>

        {/* 하단바 */}
        <footer className="k-bottom">
          <button type="button" className="k-tb accent" onClick={() => useKids.getState().help()} data-coach="kids-help">
            이제 뭘 해야 해?
          </button>
          {editing && (
            <button
              type="button"
              className="k-tb primary"
              disabled={plan.blocks.length === 0 || !preset}
              onClick={startGame}
              data-coach="kids-start-game"
              title="지도가 완벽하지 않아도 시작할 수 있다. 결과가 부족한 곳을 알려 준다"
            >
              <PlayIcon /> {easy ? '대피 연습 시작!' : '대피 연습 시작'}
            </button>
          )}
          <button type="button" className="k-tb" onClick={() => setPreview(true)} data-coach="kids-print">
            <PrintIcon /> {easy ? '뽑기' : '인쇄'}
          </button>
          <button type="button" className="k-tb k-hide-sm" onClick={saveFile} title="파일로 저장 (Ctrl+S)">
            파일 저장
          </button>
          <button type="button" className="k-tb k-hide-sm" onClick={() => fileRef.current?.click()} disabled={!editing}>
            불러오기
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onOpenFile(e.target.files?.[0])} />
          <span className={`k-save k-hide-sm${saveError ? ' err' : ''}`}>{saveError ? '자동 저장 불가' : saved ? `자동 저장 ${saved}` : '자동 저장 대기'}</span>
          <span className="k-spacer" />
          {dev && (
            <span className="k-dev" title="조작 횟수 · 경과 시간 (FR-7.11)" data-coach="kids-dev">
              조작 {ops}회 · {Math.floor(elapsed / 60)}분 {elapsed % 60}초 · 시도 {progress.attempts} · 성공 {progress.successes}
              {startedAt && lastOpAt ? '' : ''}
            </span>
          )}
          <span className="k-progress" title="그린 길과 규칙 통과율">
            <span className="k-progress-bar">
              <i style={{ width: `${pct}%` }} />
            </span>
            {pct}%
          </span>
        </footer>
      </div>

      {/* 인쇄 시트 — 화면에서는 숨기고 인쇄할 때 나온다 */}
      <div className="k-print-root" aria-hidden={!preview}>
        <KidsPrint svgRef={sheetRef} />
      </div>

      {toast && <div className={`k-toast${toast.kind === 'warn' ? ' warn' : ''}`}>{toast.text}</div>}

      <Onboarding open={onboard} onClose={() => setOnboard(false)} />

      {preview && (
        <div className="k-modal-back" onClick={() => setPreview(false)} role="presentation">
          <div className="k-modal k-preview" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>{easy ? '이렇게 뽑혀' : 'A4 미리보기'}</h2>
              <label className="k-chk">
                <input type="checkbox" checked={gray} onChange={(e) => setGray(e.target.checked)} /> 흑백으로 보기
              </label>
              <button type="button" className="k-x" onClick={() => setPreview(false)} aria-label="닫기">
                <CloseIcon />
              </button>
            </header>
            <div className="k-preview-body">
              <div className="k-preview-sheet">
                <KidsPrint grayscale={gray} />
              </div>
            </div>
            <footer>
              <button type="button" className="k-tb" onClick={() => setPreview(false)}>
                닫기
              </button>
              <button type="button" className="k-tb" onClick={exportPng}>
                그림으로 저장
              </button>
              <button type="button" className="k-tb primary" onClick={() => window.print()}>
                <PrintIcon /> {easy ? '뽑기' : '인쇄'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {sheet && (
        <div className="k-modal-back" onClick={() => setSheet(false)} role="presentation">
          <div className="k-modal k-optsheet" role="dialog" aria-modal="true" aria-labelledby="k-optsheet-title" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2 id="k-optsheet-title">{easy ? '더 할 수 있는 것' : '설정과 도구'}</h2>
              <button type="button" className="k-x" onClick={() => setSheet(false)} aria-label="닫기">
                <CloseIcon />
              </button>
            </header>
            <div className="k-optsheet-rows">
              <div className="k-optsheet-row">
                <b>{easy ? '말 고르기' : '이용 수준'}</b>
                <div className="k-seg light" role="group" aria-label="이용 수준">
                  <button type="button" aria-pressed={easy} onClick={() => useKids.getState().setProfile({ gradeMode: 'easy' })}>
                    쉬움
                  </button>
                  <button type="button" aria-pressed={!easy} onClick={() => useKids.getState().setProfile({ gradeMode: 'normal' })}>
                    보통
                  </button>
                </div>
              </div>
              <div className="k-optsheet-row">
                <b>{easy ? '놀이 방법' : '게임 방식'}</b>
                <div className="k-seg light" role="group" aria-label="게임 방식">
                  <button type="button" aria-pressed={!timed} onClick={() => useKids.getState().setTimed(false)}>
                    연습
                  </button>
                  <button type="button" aria-pressed={timed} onClick={() => useKids.getState().setTimed(true)}>
                    도전
                  </button>
                </div>
              </div>
              <div className="k-optsheet-row">
                <b>{easy ? '보이는 모양' : '블록 외형'}</b>
                <div className="k-seg light" role="group" aria-label="블록 외형">
                  <button type="button" aria-pressed={profile.blockStyle === 'kid'} onClick={() => useKids.getState().setProfile({ blockStyle: 'kid' })}>
                    그림
                  </button>
                  <button type="button" aria-pressed={profile.blockStyle === 'blueprint'} onClick={() => useKids.getState().setProfile({ blockStyle: 'blueprint' })}>
                    도면
                  </button>
                </div>
              </div>
            </div>
            <div className="k-optsheet-grid">
              <button type="button" className="k-tb" disabled={!past.length || !editing} onClick={() => useKids.getState().undo()}>
                되돌리기
              </button>
              <button type="button" className="k-tb" disabled={!future.length || !editing} onClick={() => useKids.getState().redo()}>
                다시
              </button>
              <button
                type="button"
                className="k-tb"
                disabled={!editing}
                onClick={() => {
                  setSheet(false);
                  setOnboard(true);
                }}
              >
                집 모양
              </button>
              <button
                type="button"
                className="k-tb"
                onClick={() => {
                  setSheet(false);
                  setPickChar(true);
                }}
              >
                내 캐릭터
              </button>
              <button type="button" className="k-tb" onClick={saveFile}>
                파일 저장
              </button>
              <button type="button" className="k-tb" disabled={!editing} onClick={() => fileRef.current?.click()}>
                불러오기
              </button>
              <button
                type="button"
                className="k-tb"
                onClick={() => {
                  setSheet(false);
                  setHelp(true);
                }}
              >
                사용법
              </button>
              <button
                type="button"
                className="k-tb"
                disabled={!editing}
                onClick={() => {
                  setSheet(false);
                  setConfirmReset(true);
                }}
              >
                처음부터
              </button>
            </div>
          </div>
        </div>
      )}

      {pickChar && (
        <div className="k-modal-back" onClick={() => setPickChar(false)} role="presentation">
          <div className="k-modal" role="dialog" aria-modal="true" aria-labelledby="k-char-title" style={{ width: 760 }} onClick={(e) => e.stopPropagation()}>
            <header>
              <h2 id="k-char-title">{easy ? '누구로 할래?' : '내 캐릭터 고르기'}</h2>
              <button type="button" className="k-x" onClick={() => setPickChar(false)} aria-label="닫기">
                <CloseIcon />
              </button>
            </header>
            <p className="k-note">{easy ? '대피 연습에서 네가 될 친구야. 언제든 바꿀 수 있어.' : '게임에서 조작하는 캐릭터다. 3D 리플레이의 옷 색도 함께 바뀐다.'}</p>
            <div className="k-char-grid">
              {KIDS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`k-char${profile.playerCharacter === c.id ? ' on' : ''}`}
                  aria-pressed={profile.playerCharacter === c.id}
                  data-character={c.id}
                  title={c.note}
                  onClick={() => {
                    useKids.getState().setProfile({ playerCharacter: c.id });
                    playTap(profile.soundOn);
                    setPickChar(false);
                  }}
                >
                  <KidPortrait id={c.id} size={86} />
                  <b>{c.name}</b>
                  <small>{c.note}</small>
                </button>
              ))}
            </div>
            <footer>
              <button type="button" className="k-tb" onClick={() => setPickChar(false)}>
                닫기
              </button>
            </footer>
          </div>
        </div>
      )}

      {askMissing && (
        <div className="k-modal-back" onClick={() => setAskMissing(null)} role="presentation">
          <div className="k-modal" role="dialog" aria-modal="true" aria-labelledby="k-missing-title" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
            <header>
              <h2 id="k-missing-title">{easy ? '아직 없는 게 있어' : '필수 항목이 빠졌다'}</h2>
              <button type="button" className="k-x" onClick={() => setAskMissing(null)} aria-label="닫기">
                <CloseIcon />
              </button>
            </header>
            <p className="k-note">
              {i(askMissing.map((m) => blockName(m, easy ? 'easy' : 'normal')).join(' · '))} 아직 도면에 없다.{' '}
              {easy ? '그냥 해 봐도 되고, 놓고 와도 돼. 결과에서도 알려 줄게.' : '없이 시작해도 된다. 리포트가 다시 짚어 준다.'}
            </p>
            <footer>
              <button
                type="button"
                className="k-tb primary"
                data-coach="kids-start-anyway"
                autoFocus
                onClick={() => {
                  setAskMissing(null);
                  useKids.getState().startGameNow();
                }}
              >
                {easy ? '그냥 해 볼래' : '그대로 시작'}
              </button>
              <button
                type="button"
                className="k-tb"
                onClick={() => {
                  const first = askMissing[0];
                  const def = BLOCKS.find((b) => b.id === first);
                  setAskMissing(null);
                  if (def) {
                    useKids.getState().arm({ category: def.category, id: def.id });
                    useKids.setState({ highlight: { paletteItem: def.id } });
                  }
                }}
              >
                {easy ? '놓고 올래' : '놓으러 가기'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {confirmReset && (
        <div className="k-modal-back" onClick={() => setConfirmReset(false)} role="presentation">
          <div className="k-modal" role="dialog" aria-modal="true" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>처음부터 다시 할까?</h2>
            </header>
            <p className="k-note">그린 것이 모두 지워진다. 실수로 눌렀다면 지운 뒤에도 되돌리기로 살릴 수 있다.</p>
            <footer>
              <button type="button" className="k-tb" onClick={() => setConfirmReset(false)}>
                그만두기
              </button>
              <button
                type="button"
                className="k-tb danger"
                onClick={() => {
                  useKids.getState().resetAll();
                  setConfirmReset(false);
                  setOnboard(true);
                }}
              >
                모두 지우고 다시
              </button>
            </footer>
          </div>
        </div>
      )}

      {badFile && (
        <div className="k-modal-back" onClick={() => setBadFile(null)} role="presentation">
          <div className="k-modal" role="dialog" aria-modal="true" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>이 파일은 열 수 없다</h2>
            </header>
            <p className="k-note">
              {badFile.version < 0 ? '우리집 대피지도 파일이 아니거나 깨진 파일이다.' : `지원하지 않는 저장 형식이다 (v${badFile.version}).`} 지금 그리던 것은 그대로 두었다. 원본은 아래에서 다시 내려받을 수 있다.
            </p>
            <footer>
              <button type="button" className="k-tb" onClick={() => downloadText(badFile.raw, '원본-파일.json')}>
                원본 내려받기
              </button>
              <button type="button" className="k-tb primary" onClick={() => setBadFile(null)}>
                닫기
              </button>
            </footer>
          </div>
        </div>
      )}

      {help && <HelpModal easy={easy} onClose={() => setHelp(false)} />}
    </>
  );
}

function sevLabel(sev: 'critical' | 'important' | 'tip', easy: boolean): string {
  if (sev === 'critical') return easy ? '꼭' : '필수';
  if (sev === 'important') return '중요';
  return easy ? '참고' : '권장';
}

function HelpModal({ easy, onClose }: { easy: boolean; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const rows: [string, string][] = easy
    ? [
        ['1. 집 모양', '우리 집과 비슷한 것을 고른다. 백지에서 시작하지 않아도 된다.'],
        ['2. 내 방', '캐릭터가 물으면 네가 자는 방을 누른다.'],
        ['3. 방 고치기', '방을 끌어 옮기고, 모서리를 끌어 크기를 바꾼다. 맞댄 벽에 “문?”이 보이면 한 번 눌러 문을 놓는다.'],
        ['4. 나가는 길', '“나가는 길”을 누르고 내 방부터 현관까지 끌어서 잇는다. 못 나갈 때 갈 길도 그려 두면 좋다.'],
        ['5. 대피 연습', '“대피 연습 시작!”을 누르면 불이 난다. 화살표로 움직이고, 연기가 오면 “낮게!”'],
        ['6. 결과', '잘한 점과 고칠 점을 본다. “다시 해보기”나 “지도 고치기”를 누른다.'],
        ['7. 뽑기', '한 장으로 뽑아 잘 보이는 곳에 붙인다.'],
        ['마우스가 없어도', 'Tab 을 눌러 도면으로 들어가고, 방향키로 칸을 옮긴 다음 Enter 를 누르면 된다.'],
      ]
    : [
        ['평면', '집 모양(템플릿)에서 시작해 방을 옮기고 크기를 바꾼다. 방은 직사각형만 된다. 팔레트 클릭 → 도면 클릭이면 표준 크기로 놓인다.'],
        ['문', '두 방이 맞닿으면 문 후보가 반투명으로 보인다. 한 번 누르면 문이 놓인다.'],
        ['피난경로', '주 경로(현관)와 보조 경로(못 나갈 때)를 각각 끌어서 잇는다. 뒤로 되짚으면 지워진다.'],
        ['게임', '발화점은 매번 다르다. 방향키로 이동, 스페이스로 자세, T 문 만져보기, C 문 닫기, P 멈춤. 연습 모드가 기본이다.'],
        ['리포트', '규칙 엔진(정적)과 플레이 로그(동적)를 합쳐 잘한 점·고칠 점으로 정리한다. [왜?]를 누르면 학습 카드가 펼쳐진다.'],
        ['인쇄', 'A4 세로 1장. 흑백에서도 경로가 번호·선종류로 구분된다.'],
        ['키보드', 'Tab 으로 도면에 초점을 준 뒤 방향키로 칸을 옮기고 Enter 로 누른다. 마우스 없이도 전 과정이 된다.'],
      ];
  return (
    <div className="k-modal-back" onClick={onClose} role="presentation">
      <div className="k-modal" role="dialog" aria-modal="true" style={{ width: 600 }} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{easy ? '이렇게 하면 돼' : '사용법'}</h2>
          <button type="button" className="k-x" onClick={onClose} aria-label="닫기">
            <CloseIcon />
          </button>
        </header>
        <table className="k-tbl">
          <tbody>
            {rows.map(([a, b]) => (
              <tr key={a}>
                <th>{a}</th>
                <td>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="k-note">
          <span className="k-kbd">Ctrl</span>+<span className="k-kbd">Z</span> 되돌리기 · <span className="k-kbd">Delete</span> 지우기 · <span className="k-kbd">Esc</span> 그만 ·{' '}
          <span className="k-kbd">Ctrl</span>+<span className="k-kbd">P</span> 인쇄
        </p>
        <p className="k-note">
          이 앱은 인터넷에 아무것도 보내지 않는다. 이름·연락처는 저장하지 않고 종이에 손으로 적는다. 캐릭터의 말은 미리 적어 둔 문장이며, “검수 대기” 표시가 있는 문장은 아직 소방청 1차 자료와 대조하지 않았다.
        </p>
        <footer>
          <button type="button" className="k-tb primary" onClick={onClose}>
            닫기
          </button>
        </footer>
      </div>
    </div>
  );
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="2.1" />
      <circle cx="12" cy="12" r="2.1" />
      <circle cx="19" cy="12" r="2.1" />
    </svg>
  );
}

function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 9v6h4l5 4V5L9 9z" />
      {on ? <path d="M17 9a4 4 0 0 1 0 6" /> : <path d="M17 10l4 4M21 10l-4 4" />}
    </svg>
  );
}

function BrandMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1.5" y="1.5" width="29" height="29" rx="7" fill="#ffffff" fillOpacity={0.14} stroke="#ffffff" strokeOpacity={0.6} />
      <path d="M6 17 L16 8 L26 17" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M9 16v9h14v-9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M13 25v-5h6v5" fill="none" stroke="#7ee2b8" strokeWidth="2.4" strokeLinejoin="round" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H9a5 5 0 0 0 0 10h3" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9V3h12v6" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M6 14h12v7H6z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 4l12 8-12 8z" />
    </svg>
  );
}
