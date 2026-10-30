'use client';

/**
 * 어린이 화면 골격 — docs/DESIGN-v1.1-changes.md §4.6.
 *
 *   상단바   이름 · 쉬움/보통 · 그림/도면 · 연습/도전 · 되돌리기
 *   가운데   팔레트 | 도면(편집·게임 공용) + 캐릭터 해설 고정 칸 | (리포트)
 *   하단바   [이제 뭘 해야 해?] [대피 연습 시작!] [뽑기] …  진행률
 *
 * 재난 탭은 프리셋 수만큼 생긴다. 기본판은 화재 1종이므로 탭이 없다 (FR-2.1 개정).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BLOCKS, HAZARD_PRESETS, REQUIRED_BLOCKS, blockDef, blockName } from '../content';
import { checklist, missingOf } from '../core/checklist';
import { doorlessRooms } from '../core/grid/doors';
import { eul, i } from '../core/josa';
import { hasDrawableRoute, isOpening, isPoint, isRoom, pointFootprint, type OpeningBlock, type OpeningSpan, type PointBlock, type RoomBlock, type RoomKind } from '../types/plan';
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
import HelpPanel from './HelpPanel';
import CoachTour from './CoachTour';
import { GUARDIAN_INTRO, STEP_HELP } from '../content/blockHelp';
import Onboarding, { CloseIcon } from './Onboarding';
import KidsPrint, { SHEET_H, SHEET_W } from './KidsPrint';
import { SLOT_STYLE } from './PlanSvg';
import { PLAYER_NAME } from './Avatar';
import { KIDS, KidPortrait } from './KidCharacters';
import { PLAYER_CHARACTERS } from '../types/guide';
import { playDoor, playTap, replayLastGuideVoice, stopSpeaking, unlockAudio } from './sound';
import type { StudentInfo } from './ProfileSetup';
import SafetyNotebook from './SafetyNotebook';
import { displayName, gradeModeForGrade } from '../types/save';
import { host } from '../platform/host';
import { ZOOM_MAX, zoomPercent } from '../core/zoom';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '';
/* 오프라인 HTML·데스크톱 앱에서는 설치 안내로 가는 길이 없다 (설계서 v1.18 §6) */
const installAvailable = process.env.NEXT_PUBLIC_OFFLINE !== '1';

/* 큰 흐름 세 칸 — 집 만들기 → 나가는 길 → 대피 연습 (설계서 v2.0 §2.1) */
const FLOW = [
  { key: 'build', label: '집 만들기' },
  { key: 'route', label: '나가는 길' },
  { key: 'drill', label: '대피 연습' },
] as const;

const BUILD_STEPS = [
  ['template', '집 모양'],
  ['spaces', '실·문·창·크기'],
  ['furniture', '가구 배치'],
  ['safety', '소화기'],
  ['mySpot', '내 방·위치'],
  ['meeting', '모이는 곳'],
] as const;

const CLOSED_ROOM_KINDS: { id: RoomKind; label: string }[] = [
  { id: 'bedroom', label: '침실' },
  { id: 'bath', label: '욕실' },
  { id: 'entry', label: '현관실' },
  { id: 'closet', label: '옷방' },
  { id: 'other', label: '기타실' },
  { id: 'refuge_lobby', label: '피난전실' },
  { id: 'utility', label: '알파룸' },
];

const OPEN_ZONE_KINDS: { id: RoomKind; label: string }[] = [
  { id: 'living', label: '거실' },
  { id: 'kitchen', label: '트인 주방(부엌)' },
  { id: 'entry', label: '현관' },
  { id: 'corridor', label: '복도' },
  { id: 'balcony', label: '베란다' },
];


export default function KidsShell({ studentInfo, onHome }: { studentInfo?: StudentInfo; onHome?: () => void }) {
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
  const armed = useKids((s) => s.armed);
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
  /* 전체 화면 — 브라우저 API 는 platform 만 만진다 (설계서 v1.19 §2.2) */
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  useEffect(() => {
    const screen = host().screen;
    setCanFullscreen(screen.canFullscreen());
    setFullscreen(screen.isFullscreen());
    return screen.onChange(setFullscreen);
  }, []);
  const [dev, setDev] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [badFile, setBadFile] = useState<{ version: number; raw: string } | null>(null);
  /** 필수가 빠졌을 때 시작 직전에 한 번만 묻는다 (설계서 v1.2 §1.4) */
  const [askMissing, setAskMissing] = useState<string[] | null>(null);
  const [pickChar, setPickChar] = useState(false);
  const [showNotebook, setShowNotebook] = useState(false);
  /* 상단 설정 · 하단 저장 메뉴 · 어른 안내 (설계서 v2.0 §2.1) */
  const [settings, setSettings] = useState(false);
  const [fileMenu, setFileMenu] = useState(false);
  const [guardian, setGuardian] = useState(false);
  /* 처음 안내 투어 — 편집 화면에 처음 들어왔을 때 한 번, 그 뒤로는 설정·사용법에서 (설계서 v2.0 §9) */
  const [tour, setTour] = useState(false);
  const closeTour = useCallback(() => {
    setTour(false);
    if (!useKids.getState().profile.tourSeen) useKids.getState().setProfile({ tourSeen: true });
  }, []);
  useEffect(() => {
    if (ready && mode === 'edit' && !onboard && step !== 'template' && !profile.tourSeen) setTour(true);
  }, [ready, mode, onboard, step, profile.tourSeen]);
  const sheetRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const doorlessNoticeRef = useRef(false);
  /* 방을 골라 들었으면 막대의 안내가 그 방을 어디에 놓는지로 바뀐다 */
  const armedRoomName = armed?.category === 'room'
    ? armed.roomMode === 'zone' && armed.id === 'kitchen' ? '트인 주방(부엌)' : blockName(armed.id, profile.gradeMode)
    : null;

  /** 경로 없는 빈 지도가 출력되지 않게 모든 출력 진입점을 한곳에서 지킨다. */
  const withPrintableRoute = useCallback((action: () => void): boolean => {
    const state = useKids.getState();
    if (!hasDrawableRoute(state.routes[state.hazardId])) {
      state.notify('먼저 나가는 길을 그려야 지도를 뽑을 수 있어.', 'warn');
      state.setStep('route');
      return false;
    }
    action();
    return true;
  }, []);

  /* 시작 */
  useEffect(() => {
    /* 소리 켬/끔은 boot() 안에서 저장을 읽자마자 맞춘다 (설계서 v1.6 §3) */
    useKids.getState().boot();
    if (studentInfo) {
      /*
       * 이름표는 매번 새로 쓴다. 이용 수준은 처음 올 때만 학년이 정하고,
       * 그리던 지도가 있으면 아이가 골라 둔 수준을 그대로 둔다 (설계서 v1.18 §3).
       */
      const hadSave = useKids.getState().onboarded;
      useKids.getState().setProfile(hadSave ? studentInfo : { ...studentInfo, gradeMode: gradeModeForGrade(studentInfo.schoolGrade) });
    }
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
        withPrintableRoute(() => window.print());
        return;
      }
      if (meta) return;
      /* 도면 확대 — 단추·Ctrl+휠과 같은 일 (설계서 v1.19 §2.1). 리포트에는 도면이 없다 */
      if (s.mode !== 'report' && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_' || e.key === '0')) {
        e.preventDefault();
        s.zoomCanvas(e.key === '0' ? 'fit' : e.key === '-' || e.key === '_' ? 'out' : 'in');
        return;
      }
      if (s.mode === 'game') return;
      if (e.key === 'Escape') {
        if (s.drafting) s.endRoute();
        s.select(null);
        s.arm(null);
        /* 덮개는 모두 Esc 로 닫힌다 (작업지침 §5). 닫는 쪽은 어느 것도 되돌릴 수 없는 일을 하지 않는다 */
        setPreview(false);
        setHelp(false);
        setPickChar(false);
        setConfirmReset(false);
        setAskMissing(null);
        setBadFile(null);
        setShowNotebook(false);
        setSettings(false);
        setFileMenu(false);
        setGuardian(false);
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
  }, [withPrintableRoute]);

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
  const guidedStep = step === 'spaces' || step === 'structure' || step === 'furniture' || step === 'mySpot' || step === 'meeting' || step === 'safety';
  const onboardingOnCanvas = guidedStep;
  const selectedClosedRoom = selectedBlock && isRoom(selectedBlock) && selectedBlock.wallMode !== 'zone' ? selectedBlock : null;
  const selectedOpenZone = selectedBlock && isRoom(selectedBlock) && selectedBlock.wallMode === 'zone' ? selectedBlock : null;
  const selectedRoom = selectedBlock && isRoom(selectedBlock) ? selectedBlock : null;
  const selectedFurniture = selectedBlock && isPoint(selectedBlock) && selectedBlock.kind === 'furniture' ? selectedBlock : null;
  const required = useMemo(() => checklist(plan, REQUIRED_BLOCKS), [plan]);
  const missing = missingOf(required);
  const roomsWithoutDoor = useMemo(() => doorlessRooms(plan), [plan]);
  const doorlessKey = roomsWithoutDoor.map((room) => room.id).sort().join('|');

  /* 도면 위 후보 대신 캐릭터가 문 없는 방을 이름으로 알려 주고 실제 문 도구를 가리킨다 (v1.6 §6). */
  useEffect(() => {
    const state = useKids.getState();
    if (!doorlessKey) {
      if (doorlessNoticeRef.current) {
        if (state.bubble?.ruleId === 'fail.RULE-C-03') {
          state.dismissBubble();
          stopSpeaking();
        }
        if (state.highlight?.paletteItem === 'door') state.setHighlight(null);
        doorlessNoticeRef.current = false;
      }
      return;
    }
    if (!ready || !editing || onboardingOnCanvas) return;
    const roomName = roomsWithoutDoor
      .map((room) => room.label.trim() || blockName(room.roomKind, profile.gradeMode))
      .join(', ');
    if (state.fire({ on: 'ruleFail', ruleId: 'RULE-C-03' }, { roomName }, true)) {
      state.setHighlight({ paletteItem: 'door', blockIds: roomsWithoutDoor.map((room) => room.id) });
      doorlessNoticeRef.current = true;
    }
  }, [doorlessKey, editing, onboardingOnCanvas, profile.gradeMode, ready, roomsWithoutDoor]);

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
    if (!hasDrawableRoute(useKids.getState().routes[useKids.getState().hazardId])) {
      useKids.getState().notify('먼저 나가는 길을 그려야 지도를 그림으로 저장할 수 있어.', 'warn');
      setPreview(false);
      useKids.getState().setStep('route');
      return;
    }
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
      <div className={`k-app mode-${mode}`} data-level="kids" data-step={step} data-grade-mode={profile.gradeMode}>
        {/* 상단바 */}
        <header className="k-top">
          {/* 로고를 누르면 첫 화면으로 — 그리던 지도는 자동 저장돼 있다 */}
          <button type="button" className="k-brand" data-coach="kids-home" title="첫 화면으로 (그린 지도는 저장돼 있다)" onClick={() => onHome?.()}>
            <BrandMark />
            <span>
              우리집 대피지도 <small data-coach="kids-name-tag">{`${profile.schoolGrade}학년 ${displayName(profile)}`}</small>
            </span>
          </button>

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

          {/* 큰 흐름 — 아이가 지금 어디쯤인지 한눈에 (설계서 v2.0 §2.1) */}
          <ol className="k-flow" aria-label="진행 순서" data-coach="kids-flow">
            {FLOW.map((f, idx) => {
              const state = flowState(idx, step, mode, Boolean(pair.primary));
              return (
                <li key={f.key} className={state} aria-current={state === 'on' ? 'step' : undefined} data-flow={f.key}>
                  <i>{state === 'done' ? <CheckIcon /> : idx + 1}</i>
                  <span>{f.label}</span>
                </li>
              );
            })}
          </ol>

          <span className="k-spacer" />

          <div className="k-top-group" role="group" aria-label="되돌리기와 다시">
            <button type="button" className="k-ib" onClick={() => useKids.getState().undo()} disabled={!past.length || !editing} title="되돌리기 (Ctrl+Z)" data-coach="kids-undo">
              <UndoIcon />
              <span>되돌리기</span>
            </button>
            <button type="button" className="k-ib" onClick={() => useKids.getState().redo()} disabled={!future.length || !editing} title="다시 하기 (Ctrl+Shift+Z)" data-coach="kids-redo">
              <RedoIcon />
              <span>다시</span>
            </button>
          </div>
          <button type="button" className="k-ib" onClick={() => setPickChar(true)} title="대피 연습에서 내가 될 캐릭터를 고른다" data-coach="kids-character">
            <span className="k-char-chip" aria-hidden="true">
              <KidPortrait id={profile.playerCharacter} size={28} />
            </span>
            <span>내 캐릭터</span>
          </button>
          <button
            type="button"
            className="k-ib"
            aria-pressed={profile.soundOn}
            data-coach="kids-sound"
            title={profile.soundOn ? '소리를 끈다' : '소리를 켠다'}
            onClick={() => {
              const next = !profile.soundOn;
              /* 알리는 것도 저장하는 것도 setProfile 한 곳에서 한다 */
              useKids.getState().setProfile({ soundOn: next });
              useKids.getState().notify(next ? '소리를 켰다.' : '소리를 껐다.');
              if (next) {
                /* 활성화 뒤, 이 사용자 클릭 안에서 잠금을 풀고 최신 MP3를 직접 재생한다. */
                unlockAudio();
                replayLastGuideVoice();
                playTap();
              }
            }}
          >
            <SoundIcon on={profile.soundOn} />
            <span>{profile.soundOn ? '소리 켜짐' : '소리 꺼짐'}</span>
          </button>
          <button type="button" className="k-ib" onClick={() => setHelp(true)} title="사용법 (?)" data-coach="kids-usage">
            <HelpIcon />
            <span>사용법</span>
          </button>
          {canFullscreen && (
            <button
              type="button"
              className="k-ib"
              aria-pressed={fullscreen}
              data-coach="kids-fullscreen"
              title={fullscreen ? '창 크기로 돌아간다' : '브라우저 틀을 숨기고 화면 전체를 쓴다'}
              onClick={() => void host().screen.toggleFullscreen()}
            >
              <FullscreenIcon on={fullscreen} />
              <span>{fullscreen ? '창으로' : '전체 화면'}</span>
            </button>
          )}
          <div className="k-menu-wrap">
            <button type="button" className={`k-ib${settings ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={settings} data-coach="kids-settings" title="글 수준·게임 방식·도면 모양·집 모양 바꾸기·처음부터" onClick={() => { setSettings((v) => !v); setFileMenu(false); }}>
              <GearIcon />
              <span>설정</span>
            </button>
            {settings && (
              <>
                <div className="k-menu-back" onClick={() => setSettings(false)} role="presentation" />
                <div className="k-menu k-settings" role="dialog" aria-label="설정" data-coach="kids-settings-menu">
                  <h3>설정</h3>
                  <div className="k-menu-row">
                    <span>글 수준</span>
                    <div className="k-seg" role="group" aria-label="이용 수준" data-coach="kids-grade">
                      <button type="button" aria-pressed={easy} onClick={() => useKids.getState().setProfile({ gradeMode: 'easy' })}>
                        쉬움
                      </button>
                      <button type="button" aria-pressed={!easy} onClick={() => useKids.getState().setProfile({ gradeMode: 'normal' })}>
                        보통
                      </button>
                    </div>
                    <small>쉬움은 아이 말, 보통은 소방 용어로 적는다</small>
                  </div>
                  <div className="k-menu-row">
                    <span>게임 방식</span>
                    <div className="k-seg" role="group" aria-label="게임 방식" data-coach="kids-timed">
                      <button type="button" aria-pressed={!timed} onClick={() => useKids.getState().setTimed(false)} title="시간제한 없음 — 기본값">
                        연습
                      </button>
                      <button type="button" aria-pressed={timed} onClick={() => useKids.getState().setTimed(true)} title="시간 게이지가 줄어든다">
                        도전
                      </button>
                    </div>
                    <small>연습이 기본이다. 도전은 시간이 줄어든다</small>
                  </div>
                  <div className="k-menu-row">
                    <span>도면 보기</span>
                    <div className="k-menu-checks">
                      <label className="k-chk" title="집 밖 복도·계단까지 그린다 (FR-1.9)">
                        <input type="checkbox" checked={layer === 'common'} onChange={(e) => useKids.setState({ layer: e.target.checked ? 'common' : 'home' })} />
                        {easy ? '집 밖도 그리기' : '공용부'}
                      </label>
                      <label className="k-chk" title="흑백 인쇄에서도 읽히는지 미리 본다 (P4)">
                        <input type="checkbox" checked={gray} onChange={(e) => setGray(e.target.checked)} />
                        흑백
                      </label>
                    </div>
                    <small>아파트 복도·계단까지 그리거나, 흑백 인쇄 모양을 미리 본다</small>
                  </div>
                  <div className="k-menu-row">
                    <span>도면 모양</span>
                    <div className="k-seg" role="group" aria-label="블록 외형">
                      <button type="button" aria-pressed={profile.blockStyle === 'kid'} onClick={() => useKids.getState().setProfile({ blockStyle: 'kid' })}>
                        그림
                      </button>
                      <button type="button" aria-pressed={profile.blockStyle === 'blueprint'} onClick={() => useKids.getState().setProfile({ blockStyle: 'blueprint' })}>
                        도면
                      </button>
                    </div>
                    <small>그림은 색이 있고, 도면은 흑백 건축 도면처럼 보인다</small>
                  </div>
                  <hr />
                  <button type="button" className="k-menu-item" onClick={() => { setSettings(false); setOnboard(true); }} disabled={!editing} data-coach="kids-template">
                    <HouseIcon /> 집 모양 바꾸기
                  </button>
                  <button type="button" className="k-menu-item" onClick={() => { setSettings(false); setGuardian(true); }} data-coach="kids-guardian">
                    <HelpIcon /> 선생님·보호자 안내
                  </button>
                  <button type="button" className="k-menu-item" onClick={() => { setSettings(false); setTour(true); }} disabled={!editing} data-coach="kids-tour-again">
                    <TourIcon /> 처음 안내 다시 보기
                  </button>
                  <button type="button" className="k-menu-item danger" onClick={() => { setSettings(false); setConfirmReset(true); }} disabled={!editing} data-coach="kids-reset">
                    처음부터 다시
                  </button>
                  {installAvailable && (
                    <button
                      type="button"
                      className="k-menu-item"
                      data-coach="kids-check-update"
                      onClick={async () => {
                        setSettings(false);
                        const result = await host().installer.checkUpdate();
                        useKids.getState().notify(result === 'ready' ? '새 판을 받았어. 아래 「다시 열기」를 누르면 바뀐 것이 보여.' : result === 'none' ? `지금 판 ${APP_VERSION} 이 가장 새 판이야.` : '여기서는 새 판을 확인할 수 없어. 설치 안내 페이지에서 받아 줘.');
                      }}
                    >
                      <RefreshIcon /> 새 판 확인 <small>지금 {APP_VERSION}</small>
                    </button>
                  )}
                  <small className="k-menu-note">우리집 대피지도 {APP_VERSION} · 이 PC 안에만 저장된다</small>
                </div>
              </>
            )}
          </div>
        </header>

        {/* 가운데 */}
        <div className="k-work">
          <Palette />
          <main className="k-center">
            {editing && guidedStep ? (
              <div className="k-build-bar" data-build-step={step}>
                {/* 한 줄 — 단계 점(눌러서 오간다) · 지금 할 일 · 앞/다음 (설계서 v2.0 §11) */}
                <div className="k-build-main">
                  <ol className="k-build-steps" aria-label="우리 집 만들기 순서">
                    {BUILD_STEPS.map(([id, label], index) => {
                      const current = BUILD_STEPS.findIndex(([candidate]) => candidate === step);
                      return (
                        <li key={id} className={index === current ? 'on' : index < current ? 'done' : ''} aria-current={index === current ? 'step' : undefined}>
                          <button type="button" data-build-jump={id} title={`${index + 1}. ${label}`} aria-label={`${index + 1}단계 ${label}로 가기`} onClick={() => jumpBuildStep(id, setOnboard)}>
                            <i>{index < current ? <CheckIcon /> : index + 1}</i>
                            {index === current && <span>{label}</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="k-build-copy">
                    <b>{buildTitle(step, easy)}</b>
                    <span>{armedRoomName ? armed?.roomMode === 'zone' ? `${eul(armedRoomName)} 골랐어. 빈 바닥에서 끌어 주방(부엌) 크기를 그려 줘.` : `${eul(armedRoomName)} 골랐어. 이제 도면의 빈 곳을 눌러 놓아 줘.` : buildHelp(step, easy, Boolean(step === 'spaces' ? selectedRoom || selectedOpening : step === 'structure' ? selectedClosedRoom || selectedOpening : true), selectedOpenZone?.roomKind)}</span>
                  </div>
                  {step === 'safety' && (
                    <div className={`k-safety-check${plan.blocks.some((block) => block.kind === 'safety' && block.subKind === 'extinguisher') ? ' done' : ''}`} role="status">
                      <b>{plan.blocks.some((block) => block.kind === 'safety' && block.subKind === 'extinguisher') ? '소화기 위치를 확인했어' : '소화기 위치를 찾아 놓아 보자'}</b>
                      <span>모르면 부모님이나 선생님께 물어봐도 돼.</span>
                    </div>
                  )}
                  <div className="k-build-nav">
                    <button type="button" className="k-tb sm" data-build-back onClick={() => backBuildStep(step, setOnboard)}>{step === 'spaces' ? '집 모양 다시' : '앞 단계'}</button>
                    {step === 'meeting' ? (
                      <button type="button" className="k-tb primary sm" data-coach="kids-meeting-later" onClick={() => useKids.getState().pickMeeting(null)}>{easy ? '나중에 정할래' : '나중에'}</button>
                    ) : step !== 'mySpot' ? (
                      <button type="button" className="k-tb primary sm" data-build-next onClick={() => nextBuildStep(step)}>{step === 'safety' ? '내 방과 위치 정하기' : step === 'furniture' ? '소화기 위치 확인하기' : '다음 단계'}</button>
                    ) : null}
                  </div>
                </div>
                {/* 고른 것을 바꾸는 줄 — 자리는 늘 잡아 두어 도면이 출렁이지 않는다. 고르기 전에는 안내 한 줄 */}
                <div className={`k-build-context${selectedBlock ? '' : ' empty'}`} role="toolbar" aria-label="고른 것 바꾸기" data-coach="kids-selection-bar">
                  {!selectedBlock && (
                    <span className="k-build-context-hint">{easy ? '도면에서 방·문·가구를 누르면 여기서 종류·크기를 바꾸거나 지울 수 있어.' : '블록을 선택하면 여기서 종류·크기를 바꾸거나 삭제한다.'}</span>
                  )}
                  {selectedBlock && (<>
                    {step === 'spaces' && selectedClosedRoom && (
                      <div className="k-build-choices" role="group" aria-label="고른 독립실의 종류">
                        {CLOSED_ROOM_KINDS.map((item) => (
                          <button key={item.id} type="button" aria-pressed={selectedClosedRoom.roomKind === item.id} data-room-kind={item.id} onClick={() => useKids.getState().setRoomKind(selectedClosedRoom.id, item.id)}>{item.label}</button>
                        ))}
                      </div>
                    )}
                    {step === 'spaces' && selectedOpenZone && (
                      <div className="k-build-choices" role="group" aria-label="고른 열린 공간의 종류">
                        {OPEN_ZONE_KINDS.map((item) => (
                          <button key={item.id} type="button" aria-pressed={selectedOpenZone.roomKind === item.id} data-zone-kind={item.id} onClick={() => useKids.getState().setRoomKind(selectedOpenZone.id, item.id)}>{item.label}</button>
                        ))}
                      </div>
                    )}
                    {(step === 'spaces' || step === 'structure') && selectedRoom?.roomKind === 'kitchen' && <KitchenWallsToggle room={selectedRoom} />}
                    {step === 'furniture' && selectedRoom && (
                      <label className="k-build-name">
                        <span>공간 이름</span>
                        <input
                          key={selectedRoom.id}
                          defaultValue={selectedRoom.label}
                          maxLength={16}
                          data-allowed-free-text="room-name"
                          aria-label="고른 공간 이름"
                          placeholder={blockName(selectedRoom.roomKind, easy ? 'easy' : 'normal')}
                          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                          onBlur={(event) => useKids.getState().renameRoom(selectedRoom.id, event.currentTarget.value.trim())}
                        />
                      </label>
                    )}
                    {step === 'furniture' && selectedFurniture && <FurnitureSizeControl furniture={selectedFurniture} easy={easy} />}
                    {(step === 'spaces' || step === 'structure') && selectedOpening && !selectedOpening.hideInPlan && (
                      <OpeningSizeControl opening={selectedOpening} />
                    )}
                    <span className="k-spacer" />
                    <button
                      type="button"
                      className="k-delete-selected"
                      data-delete-selected
                      aria-label={isRoom(selectedBlock) && selectedBlock.wallMode === 'zone' ? '공간 용도 삭제하기' : '선택한 것 삭제하기'}
                      title="화면 버튼이나 Delete 키로 지울 수 있어요"
                      onClick={() => useKids.getState().removeBlock(selectedBlock.id)}
                    >삭제하기</button>
                  </>)}
                </div>
              </div>
            ) : editing ? (
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
                {selectedBlock && (
                  <button
                    type="button"
                    className="k-delete-selected"
                    data-delete-selected
                    aria-label={isRoom(selectedBlock) && selectedBlock.wallMode === 'zone' ? '공간 용도 삭제하기' : '선택한 것 삭제하기'}
                    title="화면 버튼이나 Delete 키로 지울 수 있어요"
                    onClick={() => useKids.getState().removeBlock(selectedBlock.id)}
                  >삭제하기</button>
                )}
                {selectedOpening && !selectedOpening.hideInPlan && <OpeningSizeControl opening={selectedOpening} />}
                {selectedFurniture && <FurnitureSizeControl furniture={selectedFurniture} easy={easy} />}
                {selectedRoom?.roomKind === 'kitchen' && <KitchenWallsToggle room={selectedRoom} />}
                <span className="k-spacer" />
                <label className="k-chk" title="계산으로 찾은 가장 짧은 길을 회색 점선으로 보여 준다">
                  <input type="checkbox" checked={showHint} onChange={(e) => setShowHint(e.target.checked)} />
                  {easy ? '힌트 길' : '최단경로'}
                </label>
              </div>
            ) : null}

            <div className="k-canvas-wrap">
              {mode === 'report' ? (
                <ReportView onPrint={() => withPrintableRoute(() => setPreview(true))} />
              ) : (
                <>
                  <KidsCanvas showHint={showHint} grayscale={gray} />
                  {mode === 'game' && <GameView />}
                  <ZoomControls />
                  {editing && plan.blocks.length === 0 && step !== 'template' && (
                    <div className="k-empty">
                      <p>{easy ? '아직 아무것도 없어. 왼쪽에서 “방”을 고르고 도면을 눌러 보자.' : '도면이 비어 있다. 팔레트에서 방을 골라 도면을 누른다.'}</p>
                      <button type="button" className="k-big" onClick={() => setOnboard(true)}>
                        {easy ? '집 모양 고르기' : '평면 고르기'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/*
             * 도면 크기가 말할 때마다 바뀌지 않도록 빈 때도 같은 높이를 남긴다 (설계서 v1.6 §9).
             * 긴 해설은 이 칸 안에서만 스크롤하고 도면 행을 밀지 않는다.
             */}
            <div className="k-guide-slot" data-coach="kids-guide-slot">
              <GuideBubble />
            </div>

            {/* 점검 한 줄 — 자세한 것은 리포트와 캐릭터가 한다 */}
            {editing && !guidedStep && reports.length > 0 && (
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
          <HelpPanel onGuardian={() => setGuardian(true)} />
        </div>

        {/* 하단바 */}
        <footer className="k-bottom">
          <button type="button" className="k-tb accent k-ask" onClick={() => useKids.getState().help()} data-coach="kids-help" title="캐릭터가 지금 할 일을 말해 준다">
            <AskIcon /> {easy ? '뭘 해야 해?' : '다음 할 일'}
          </button>
          {editing && !guidedStep && (
            <button
              type="button"
              className="k-tb primary k-cta"
              disabled={plan.blocks.length === 0 || !preset}
              onClick={startGame}
              data-coach="kids-start-game"
              title="지도가 완벽하지 않아도 시작할 수 있다. 결과가 부족한 곳을 알려 준다"
            >
              <PlayIcon /> {easy ? '대피 연습 시작!' : '대피 연습 시작'}
            </button>
          )}
          <button type="button" className="k-tb" onClick={() => withPrintableRoute(() => setPreview(true))} data-coach="kids-print" title="A4 한 장으로 뽑는다">
            <PrintIcon /> {easy ? '뽑기' : '인쇄'}
          </button>
          <button type="button" className="k-tb k-notebook-open" onClick={() => setShowNotebook(true)} title="4주 안전 약속표와 모은 배지를 본다" data-coach="kids-notebook-open">
            <NotebookIcon /> 안전 수첩
          </button>
          <div className="k-menu-wrap k-menu-up">
            <button type="button" className={`k-tb${fileMenu ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={fileMenu} data-coach="kids-file-menu" title="파일로 저장하거나 불러온다" onClick={() => { setFileMenu((v) => !v); setSettings(false); }}>
              <SaveIcon /> 저장·열기
            </button>
            {fileMenu && (
              <>
                <div className="k-menu-back" onClick={() => setFileMenu(false)} role="presentation" />
                <div className="k-menu" role="dialog" aria-label="저장과 열기" data-coach="kids-file-menu-panel">
                  <h3>저장과 열기</h3>
                  <p className={`k-menu-note${saveError ? ' err' : ''}`} data-coach="kids-save-state">
                    {saveError ? '자동 저장이 되지 않는다 — 파일로 저장해 두자.' : saved ? `자동 저장됨 ${saved}. 이 PC 의 브라우저 안에만 저장된다.` : '자동 저장 대기. 그리면 바로 저장된다.'}
                  </p>
                  <button type="button" className="k-menu-item" onClick={() => { setFileMenu(false); saveFile(); }} data-coach="kids-save-file">
                    <SaveIcon /> 파일로 저장 <small>Ctrl+S</small>
                  </button>
                  <button type="button" className="k-menu-item" onClick={() => { setFileMenu(false); fileRef.current?.click(); }} disabled={!editing} data-coach="kids-load-file">
                    <FolderIcon /> 파일 불러오기
                  </button>
                  <small className="k-menu-note">다른 PC 로 옮길 때 파일로 저장해서 가져간다.</small>
                </div>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onOpenFile(e.target.files?.[0])} />
          <span className={`k-save${saveError ? ' err' : ''}`} aria-live="polite">{saveError ? '자동 저장 불가' : saved ? `자동 저장 ${saved}` : '자동 저장 대기'}</span>
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
              <button type="button" className="k-tb primary" onClick={() => withPrintableRoute(() => window.print())}>
                <PrintIcon /> {easy ? '뽑기' : '인쇄'}
              </button>
            </footer>
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
                    playTap();
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

      {help && <HelpModal easy={easy} onClose={() => setHelp(false)} onTour={editing ? () => { setHelp(false); setTour(true); } : undefined} />}
      {tour && editing && <CoachTour easy={easy} onClose={closeTour} />}
      {guardian && <GuardianModal step={step} onClose={() => setGuardian(false)} />}
      {showNotebook && <SafetyNotebook progress={progress} easy={easy} onClose={() => setShowNotebook(false)} />}
    </>
  );
}

function NotebookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <path d="M8 4v16M11 9h5M11 13h5" />
    </svg>
  );
}

function FurnitureSizeControl({ furniture, easy }: { furniture: PointBlock; easy: boolean }) {
  const def = blockDef(furniture.subKind);
  if (!def || def.category !== 'furniture') return null;
  const footprint = pointFootprint(furniture);
  const turned = furniture.rotation === 90 || furniture.rotation === 270;
  const minBase = def.minSize ?? { w: 1, h: 1 };
  const maxBase = def.maxSize ?? def.size;
  const min = turned ? { w: minBase.h, h: minBase.w } : minBase;
  const max = turned ? { w: maxBase.h, h: maxBase.w } : maxBase;
  const resize = (axis: 'w' | 'h', delta: -1 | 1) => {
    useKids.getState().resizePoint(furniture.id, { ...footprint, [axis]: footprint[axis] + delta });
  };
  return (
    <div className="k-size-controls k-furniture-size" data-furniture-size-controls data-furniture-kind={furniture.subKind}>
      <span>{easy ? def.easy : def.label} 크기</span>
      <DimensionControl label="가로" value={footprint.w} min={min.w} max={max.w} dataName="furniture-width" onChange={(delta) => resize('w', delta)} />
      <DimensionControl label="세로" value={footprint.h} min={min.h} max={max.h} dataName="furniture-height" onChange={(delta) => resize('h', delta)} />
    </div>
  );
}

function DimensionControl({
  label,
  value,
  min,
  max,
  dataName,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  dataName: string;
  onChange: (delta: -1 | 1) => void;
}) {
  return (
    <div className="k-dimension" role="group" aria-label={`${label} 크기 조절`}>
      <small>{label}</small>
      <button type="button" disabled={value <= min} data-size-control={`${dataName}-decrease`} aria-label={`${label} 줄이기`} onClick={() => onChange(-1)}>−</button>
      <output data-size-value={dataName} aria-live="polite">{value}칸</output>
      <button type="button" disabled={value >= max} data-size-control={`${dataName}-increase`} aria-label={`${label} 늘리기`} onClick={() => onChange(1)}>＋</button>
    </div>
  );
}

function OpeningSizeControl({ opening }: { opening: OpeningBlock }) {
  const span = opening.span ?? 1;
  const sliding = opening.openingKind === 'sliding_door' || opening.openingKind === 'sliding_window';
  const swingDoor = opening.openingKind === 'door' || opening.openingKind === 'front_door' || opening.openingKind === 'inner_door' || opening.openingKind === 'emergency_exit';
  const max = sliding ? 6 : 3;
  const name = opening.openingKind === 'front_door'
    ? '현관문 너비'
    : opening.openingKind === 'sliding_door'
      ? '미닫이문 길이'
      : opening.openingKind === 'sliding_window'
        ? '미닫이창 길이'
        : opening.openingKind === 'window' || opening.openingKind === 'balcony_window'
          ? '창문 너비'
          : '여닫이문 너비';
  return (
    <div className="k-opening-controls" data-opening-controls>
      <div className="k-opening-size k-opening-length" role="group" aria-label={`${name} 조절`}>
        <span>{name}</span>
        <button
          type="button"
          disabled={span <= 1}
          data-opening-resize="decrease"
          aria-label={`${name} 줄이기`}
          onClick={() => useKids.getState().resizeOpening(opening.id, Math.max(1, span - 1) as OpeningSpan)}
        ><b aria-hidden="true">−</b><small>줄이기</small></button>
        <output data-opening-length aria-live="polite">{span}칸</output>
        <button
          type="button"
          disabled={span >= max}
          data-opening-resize="increase"
          aria-label={`${name} 늘리기`}
          onClick={() => useKids.getState().resizeOpening(opening.id, Math.min(max, span + 1) as OpeningSpan)}
        ><b aria-hidden="true">＋</b><small>늘리기</small></button>
      </div>
      {swingDoor && (
        <div className="k-opening-size k-opening-swing" role="group" aria-label="문이 열리는 방향">
          <span>열리는 쪽</span>
          <button type="button" aria-pressed={(opening.swing ?? 'inward') === 'inward'} data-opening-swing="inward" onClick={() => useKids.getState().setOpeningSwing(opening.id, 'inward')}>방 안으로</button>
          <button type="button" aria-pressed={opening.swing === 'outward'} data-opening-swing="outward" onClick={() => useKids.getState().setOpeningSwing(opening.id, 'outward')}>방 밖으로</button>
        </div>
      )}
      {opening.openingKind !== 'open_passage' && (
        <button type="button" className="k-opening-state" data-opening-state onClick={() => useKids.getState().toggleOpening(opening.id)}>
          {opening.closedByDefault ? '평소 닫힘' : '평소 열림'}
        </button>
      )}
    </div>
  );
}

function sevLabel(sev: 'critical' | 'important' | 'tip', easy: boolean): string {
  if (sev === 'critical') return easy ? '꼭' : '필수';
  if (sev === 'important') return '중요';
  return easy ? '참고' : '권장';
}

function HelpModal({ easy, onClose, onTour }: { easy: boolean; onClose: () => void; onTour?: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const rows: [string, string][] = easy
    ? [
        ['1. 쉬운 시작', '질문에 답하거나 집 모양을 고른다. 방만 먼저 놓고 시작해도 된다.'],
        ['2. 내 방', '캐릭터가 물으면 네가 자는 방을 누른다.'],
        ['3. 방 고치기', '방을 끌어 옮기고, 모서리를 끌어 크기를 바꾼다. 문이 없는 방은 캐릭터가 알려 준다. 왼쪽에서 “문”을 고르고 방의 벽을 누른다.'],
        ['4. 나가는 길', '“나가는 길”을 누르고 내 방부터 현관까지 끌어서 잇는다. 못 나갈 때 갈 길도 그려 두면 좋다.'],
        ['5. 대피 연습', '“대피 연습 시작!”을 누르면 불이 난다. 화살표로 움직이고, 연기가 오면 “낮게!”'],
        ['6. 결과', '잘한 점과 고칠 점, 참 잘했어요 도장과 새 배지를 본다. “같은 상황 다시”나 “새로운 상황”으로 또 연습할 수 있다.'],
        ['7. 뽑기', '한 장으로 뽑아 잘 보이는 곳에 붙인다.'],
        ['마우스가 없어도', 'Tab 을 눌러 도면으로 들어가고, 방향키로 칸을 옮긴 다음 Enter 를 누르면 된다.'],
        ['크게 보기', '도면 오른쪽 아래 + − 단추나 Ctrl+휠로 도면을 키운다. 위쪽 “전체 화면”을 누르면 화면을 다 쓴다.'],
        ['모르는 게 있으면', '왼쪽 칸에 마우스를 올리면 오른쪽 “도움”이 그게 뭔지, 왜 그리는지, 어떻게 놓는지 알려 준다. 아래 “뭘 해야 해?”는 캐릭터가 말로 알려 준다.'],
        ['설정', '위쪽 톱니(설정)에서 글 수준·게임 방식·도면 모양을 바꾸고, 집 모양을 다시 고르거나 처음부터 할 수 있다.'],
      ]
    : [
        ['평면', '질문으로 추천받거나 집 모양에서 시작해 방을 옮기고 크기를 바꾼다. 방만 먼저 놓은 뒤 문과 가구를 붙여도 된다.'],
        ['문', '문이 없는 방은 캐릭터가 알려 준다. 팔레트에서 문을 고르고 원하는 방의 벽을 누르면 놓인다.'],
        ['피난경로', '주 경로(현관)와 보조 경로(못 나갈 때)를 각각 끌어서 잇는다. 뒤로 되짚으면 지워진다.'],
        ['게임', '발화점은 매번 다르다. 방향키로 이동, 스페이스로 자세, T 문 만져보기, C 문 닫기, P 멈춤. 연습 모드가 기본이다.'],
        ['리포트', '규칙 엔진(정적)과 플레이 로그(동적)를 합쳐 잘한 점·고칠 점으로 정리한다. [왜?]를 누르면 학습 카드가 펼쳐진다.'],
        ['인쇄', 'A4 세로 1장. 흑백에서도 경로가 번호·선종류로 구분된다.'],
        ['키보드', 'Tab 으로 도면에 초점을 준 뒤 방향키로 칸을 옮기고 Enter 로 누른다. 마우스 없이도 전 과정이 된다.'],
        ['확대·전체 화면', '도면 오른쪽 아래의 확대·축소·맞춤 단추, Ctrl+휠, + − 0 키로 도면을 키운다. 상단 “전체 화면”은 브라우저 틀을 숨긴다.'],
        ['도움 패널', '팔레트 항목에 마우스를 올리거나 도면의 블록을 선택하면 오른쪽 패널이 정의·이유·방법을 설명한다. “어른과 함께” 줄은 지도 포인트다.'],
        ['설정', '상단 설정에서 이용 수준·게임 방식·블록 외형을 바꾸고 평면을 다시 고르거나 초기화한다.'],
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
          이 앱은 인터넷에 아무것도 보내지 않는다. 이름표와 지도는 이 PC 안에만 저장된다. 캐릭터의 말은 미리 적어 둔 문장이며, “검수 대기” 표시가 있는 문장은 아직 소방청 1차 자료와 대조하지 않았다.
        </p>
        <footer>
          <span className="k-version" data-coach="kids-version">우리집 대피지도 {APP_VERSION}</span>
          {onTour && (
            <button type="button" className="k-tb" onClick={onTour} data-coach="kids-help-tour">
              <TourIcon /> 처음 안내 다시 보기
            </button>
          )}
          {installAvailable && (
            <a className="k-tb" href={`${basePath}/download/`} data-coach="kids-help-install">
              PC에 설치하기
            </a>
          )}
          <button type="button" className="k-tb primary" onClick={onClose}>
            닫기
          </button>
        </footer>
      </div>
    </div>
  );
}

/** 큰 흐름의 상태 — 집 만들기 · 나가는 길 · 대피 연습 */
function flowState(index: number, step: string, mode: string, hasPrimary: boolean): 'done' | 'on' | '' {
  const current = mode === 'game' || mode === 'report' ? 2 : step === 'route' || step === 'routeAlt' ? 1 : 0;
  if (index < current) return 'done';
  if (index === current) return 'on';
  if (index === 1 && hasPrimary) return 'done';
  return '';
}

/** 주방의 벽 — 있는 집도, 거실과 트인 집도 있다. 고른 주방에서 바로 바꾼다 (설계서 v2.0 §2.4) */
function KitchenWallsToggle({ room }: { room: RoomBlock }) {
  const open = room.wallMode === 'zone';
  return (
    <div className="k-walls" role="group" aria-label="주방 벽" data-room-walls-control>
      <span>주방 벽</span>
      <button type="button" aria-pressed={!open} data-room-walls="closed" title="벽과 문으로 나뉜 주방으로 바꾼다" onClick={() => useKids.getState().setRoomWalls(room.id, 'closed')}>
        벽과 문이 있어
      </button>
      <button type="button" aria-pressed={open} data-room-walls="zone" title="거실과 벽 없이 이어진 트인 주방으로 바꾼다" onClick={() => useKids.getState().setRoomWalls(room.id, 'zone')}>
        거실과 트여 있어
      </button>
    </div>
  );
}

/** 선생님·보호자 안내 — 지도감독 포인트를 단계별로 (설계서 v2.0 §3.3) */
function GuardianModal({ step, onClose }: { step: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const order = ['template', 'spaces', 'furniture', 'safety', 'mySpot', 'meeting', 'route', 'routeAlt'];
  return (
    <div className="k-modal-back" onClick={onClose} role="presentation">
      <div className="k-modal k-guardian" role="dialog" aria-modal="true" aria-labelledby="k-guardian-title" style={{ width: 680 }} onClick={(e) => e.stopPropagation()} data-coach="kids-guardian-modal">
        <header>
          <h2 id="k-guardian-title">선생님·보호자 안내</h2>
          <button type="button" className="k-x" onClick={onClose} aria-label="닫기">
            <CloseIcon />
          </button>
        </header>
        <div className="k-guardian-body">
          {GUARDIAN_INTRO.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <ol>
            {order.map((key) => (
              <li key={key} className={key === step ? 'on' : ''}>
                <b>{STEP_HELP[key].title.normal}</b>
                <span>{STEP_HELP[key].guardian}</span>
              </li>
            ))}
          </ol>
        </div>
        <footer>
          <button type="button" className="k-tb primary" onClick={onClose}>
            닫기
          </button>
        </footer>
      </div>
    </div>
  );
}

function buildTitle(step: string, easy: boolean): string {
  if (step === 'spaces') return easy ? '방과 문·창을 놓아 보자' : '실·개구부 배치';
  if (step === 'structure') return easy ? '방 자리와 크기 맞추기' : '실 크기·위치 조정';
  if (step === 'furniture') return easy ? '가구와 가전을 놓아 보자' : '가구·가전 배치';
  if (step === 'safety') return easy ? '우리 집 소화기는 어디 있지?' : '소화기 위치 확인';
  if (step === 'mySpot') return easy ? '내가 자는 곳을 눌러 줘' : '내 위치 지정';
  if (step === 'meeting') return easy ? '가족이 모일 집 밖 장소를 눌러 줘' : '집결지 지정';
  return '';
}

/** 막대의 한 줄 안내 — 짧게. 자세한 설명은 오른쪽 도움 패널이 맡는다 */
function buildHelp(step: string, easy: boolean, selected: boolean, openZone?: RoomKind): string {
  if (step === 'spaces' && openZone === 'kitchen') return easy ? '테두리 점을 끌어 주방 범위를 바꿔. 위에서 벽을 세울 수도 있어.' : '손잡이로 범위를 바꾸고, 위에서 벽 유무를 바꾼다.';
  if (step === 'spaces' && openZone) return easy ? '벽 없는 바닥이야. 위에서 종류를 바꿀 수 있어.' : '열린 바닥이다. 위에서 용도를 바꾼다.';
  if (step === 'spaces' || step === 'structure') return selected
    ? (easy ? '안쪽을 끌면 옮겨지고, 테두리 점을 끌면 크기가 바뀌어.' : '내부를 끌어 이동, 손잡이로 크기 조정.')
    : (easy ? '왼쪽에서 방을 골라 눌러 놓고, 벽에 문·창을 붙여.' : '팔레트에서 실을 놓고 경계에 개구부를 붙인다.');
  if (step === 'furniture') return easy ? '침대·소파·냉장고처럼 진짜 있는 것을 방 안에 놓아.' : '실제 가구·가전을 배치한다.';
  if (step === 'safety') return easy ? '모르면 부모님이나 선생님과 같이 찾아보자.' : '보호자·교사와 실제 위치를 확인한다.';
  if (step === 'mySpot') return easy ? '침대 위여도 괜찮아. 나중에 옮길 수 있어.' : '취침 위치의 칸을 클릭한다.';
  if (step === 'meeting') return easy ? '놀이터처럼 찾기 쉬운 곳이 좋아. 나중에 정해도 돼.' : '식별하기 쉬운 옥외 칸을 클릭한다.';
  return '';
}

/** 단계 점을 누르면 그 단계로 바로 간다 — 순서는 권하지만 막지 않는다 (설계서 v2.0 §11) */
function jumpBuildStep(id: string, openOnboarding: (open: boolean) => void): void {
  if (id === 'template') {
    openOnboarding(true);
    return;
  }
  useKids.getState().setStep(id as Parameters<ReturnType<typeof useKids.getState>['setStep']>[0]);
}

function nextBuildStep(step: string): void {
  const next = step === 'spaces' || step === 'structure' ? 'furniture' : step === 'furniture' ? 'safety' : step === 'safety' ? 'mySpot' : null;
  if (next) useKids.getState().setStep(next);
}

function backBuildStep(step: string, openOnboarding: (open: boolean) => void): void {
  if (step === 'spaces') {
    openOnboarding(true);
    return;
  }
  const previous = step === 'structure' || step === 'furniture' ? 'spaces' : step === 'safety' ? 'furniture' : step === 'mySpot' ? 'safety' : step === 'meeting' ? 'mySpot' : null;
  if (previous) useKids.getState().setStep(previous);
}

/** 도면 확대·축소·맞춤 — 도면 위에 떠 있는 작은 묶음 (설계서 v1.19 §2.1) */
function ZoomControls() {
  const zoom = useKids((s) => s.canvasZoom);
  const zoomCanvas = useKids((s) => s.zoomCanvas);
  return (
    <div className="k-zoom" role="group" aria-label="도면 확대" data-coach="kids-zoom">
      <button type="button" data-zoom="in" onClick={() => zoomCanvas('in')} disabled={zoom >= ZOOM_MAX} aria-label="도면 확대" title="확대 (Ctrl+휠 · +)">
        <ZoomIcon kind="in" />
      </button>
      <b className="num" aria-live="polite">{zoomPercent(zoom)}%</b>
      <button type="button" data-zoom="out" onClick={() => zoomCanvas('out')} disabled={zoom <= 1} aria-label="도면 축소" title="축소 (Ctrl+휠 · -)">
        <ZoomIcon kind="out" />
      </button>
      <button type="button" data-zoom="fit" onClick={() => zoomCanvas('fit')} disabled={zoom === 1} aria-label="도면 맞춤" title="칸에 맞춤 (0)">
        맞춤
      </button>
    </div>
  );
}

function ZoomIcon({ kind }: { kind: 'in' | 'out' }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 20 20" />
      <path d="M7.5 10.5h6" />
      {kind === 'in' && <path d="M10.5 7.5v6" />}
    </svg>
  );
}

function FullscreenIcon({ on }: { on: boolean }) {
  return on ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4v5H4" />
      <path d="M15 4v5h5" />
      <path d="M9 20v-5H4" />
      <path d="M15 20v-5h5" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
      <path d="M4 15v5h5" />
      <path d="M20 15v5h-5" />
    </svg>
  );
}

function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9.5a2.7 2.7 0 1 1 3.9 2.4c-.8.4-1.2 1-1.2 1.8" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function AskIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M10 9.2a2 2 0 1 1 2.9 1.8c-.6.3-.9.7-.9 1.3" />
      <path d="M12 14.2h.01" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M8 4v5h7V4M8 20v-6h8v6" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h6l2 2h10v11H3z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v5h-5" />
    </svg>
  );
}

function TourIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v.01M11 12h1v4h1" />
    </svg>
  );
}

function HouseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v10h12V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
