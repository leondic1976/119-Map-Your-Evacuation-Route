/** 스케치북 — 위 단계 띠 · 가운데 종이 · 아래 안내 줄 */
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { lineOf } from '../content/lines';
import { isVerified } from '../content/sources';
import {
  announceDone,
  cancelAsk,
  enterStep,
  goHome,
  goto,
  helpStep,
  nextStep,
  openHowTo,
  repeatLine,
  resetPlan,
  setSound,
  STEP_LABEL,
  stepReady,
  STEPS,
  undo,
  useApp,
  type StepId,
} from '../store/app';
import { host } from '../platform/host';
import { GuideAvatar, IconClose, IconFill, IconHelp, IconHome, IconMenu, IconNext, IconQuestion, IconSpeaker, IconUndo } from './art';
import { DrillStep } from './DrillStep';
import { HowToCard } from './HowToCard';
import { PrintSheet } from './PrintSheet';
import { ReviewStep } from './ReviewStep';
import { DoorStep, DrawStep, MarkStep, RouteStep, SortStep } from './steps';

const VIEW: Record<StepId, ComponentType> = {
  draw: DrawStep,
  sort: SortStep,
  door: DoorStep,
  mark: MarkStep,
  route: RouteStep,
  drill: DrillStep,
  review: ReviewStep,
};

const HAS_HELP = new Set<StepId>(['draw', 'sort', 'door', 'mark', 'route']);

function Ribbon() {
  const step = useApp((s) => s.step);
  return (
    <ol className="ribbon" aria-label="단계">
      {STEPS.map((id, i) => (
        <li key={id}>
          <button
            type="button"
            className={id === step ? 'rib on' : 'rib'}
            data-testid={`step-${id}`}
            aria-current={id === step ? 'step' : undefined}
            onClick={() => enterStep(id)}
          >
            <b>{i + 1}</b>
            <span>{STEP_LABEL[id]}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function useEscape(fn: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fn();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fn]);
}

function SettingsMenu({ onClose }: { onClose: () => void }) {
  const soundOn = useApp((s) => s.soundOn);
  const [confirm, setConfirm] = useState(false);
  // 태블릿 브라우저의 주소 줄을 걷어 종이를 키운다. 할 수 없는 기기에서는 단추를 보이지 않는다
  const filled = host.isFilled();
  useEscape(onClose);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="설정">
      <div className="sheet">
        <button type="button" className="x" aria-label="닫기" data-testid="menu-close" onClick={onClose}><IconClose /></button>
        <h2>설정</h2>
        <button type="button" className="tool wide" data-testid="sound-toggle" aria-pressed={soundOn} onClick={() => setSound(!soundOn)}>
          <IconSpeaker on={soundOn} /> 소리 {soundOn ? '켜짐' : '꺼짐'}
        </button>
        {host.canFill() && (
          <button type="button" className="tool wide" data-testid="fill-screen" aria-pressed={filled} onClick={() => { host.setFilled(!filled); onClose(); }}>
            <IconFill /> {filled ? '화면 가득 채우기 끄기' : '화면 가득 채우기'}
          </button>
        )}
        <button type="button" className="tool wide" data-testid="edit-tag" onClick={() => goto('nametag')}>이름표 바꾸기</button>
        <button type="button" className="tool wide" data-testid="menu-home" onClick={goHome}><IconHome /> 처음 화면으로</button>
        {!confirm ? (
          <button type="button" className="tool wide" data-testid="reset" onClick={() => setConfirm(true)}>처음부터 다시 그리기</button>
        ) : (
          <div className="confirm">
            <p>지금 그린 지도가 지워져. 정말 새로 그릴까?</p>
            <div className="tool-row">
              <button type="button" className="tool" data-testid="reset-yes" onClick={() => { resetPlan(); onClose(); }}>새로 그리기</button>
              <button type="button" className="tool" data-testid="reset-no" onClick={() => setConfirm(false)}>그대로 두기</button>
            </div>
          </div>
        )}
        <p className="sheet-note">
          이 앱은 인터넷으로 아무것도 보내지 않는다. 안전 문장은 국민안전24의 화재 행동요령과 소방청 등이 낸 아파트 입주자 화재 안내 원문에 맞췄다.
          소방청 캐릭터 영이·일구·웅이는 공공누리 제1유형(출처표시)으로 공개된 그림이다.
        </p>
        <p className="sheet-note" data-testid="app-version">우리집 대피지도 {__APP_VERSION__}</p>
      </div>
    </div>
  );
}

/** 스크롤하는 칸 — 아래에 더 있으면 `data-more` 를 붙여 알린다. 태블릿에는 스크롤 막대가 보이지 않는다(대장 #183) */
const SCROLL_BOXES = '.tools, .review-notes, .layer, .sheet, .item-pad.room-pad';

function useScrollCue(): void {
  useEffect(() => {
    let frame = 0;
    const mark = () => {
      frame = 0;
      for (const box of document.querySelectorAll<HTMLElement>(SCROLL_BOXES)) {
        if (box.scrollHeight - box.scrollTop - box.clientHeight > 8) box.dataset.more = '1';
        else delete box.dataset.more;
      }
    };
    const ask = () => {
      if (!frame) frame = requestAnimationFrame(mark);
    };
    const root = document.querySelector('.studio');
    const seen = new MutationObserver(ask);
    if (root) seen.observe(root, { childList: true, subtree: true });
    window.addEventListener('resize', ask);
    document.addEventListener('scroll', ask, true);
    void document.fonts?.ready.then(ask);
    ask();
    return () => {
      cancelAnimationFrame(frame);
      seen.disconnect();
      window.removeEventListener('resize', ask);
      document.removeEventListener('scroll', ask, true);
    };
  }, []);
}

function GuideBar() {
  const lineId = useApp((s) => s.line);
  const step = useApp((s) => s.step);
  const asking = useApp((s) => s.asking);
  const canUndo = useApp((s) => s.past.length > 0);
  const line = lineOf(lineId);
  const isLast = step === 'review' || step === 'drill';
  const plan = useApp((s) => s.plan);
  const ready = useMemo(() => stepReady(step, plan), [step, plan]);

  // 할 일을 막 끝내면 다음에 무엇을 할지 알려 준다. 끝난 단계에 다시 들어왔을 때는 말하지 않는다
  const before = useRef({ step, ready });
  useEffect(() => {
    const was = before.current;
    before.current = { step, ready };
    if (was.step === step && !was.ready && ready) announceDone(step);
  }, [step, ready]);

  return (
    <footer className="guide-bar">
      <button type="button" className="guide-who" data-testid="repeat" aria-label="다시 듣기" onClick={repeatLine}>
        <GuideAvatar speaker={line.speaker} emotion={line.emotion} />
      </button>
      <div className="bubble" data-testid="bubble" data-line={lineId} aria-live="polite">
        <p>{line.text}</p>
        {!isVerified(line.sourceIds) && <small className="unverified">검수 대기</small>}
      </div>

      {asking ? (
        <div className="ask" data-testid="ask">
          <button type="button" className="btn primary" data-testid="ask-fill" onClick={() => { helpStep(asking); nextStep(true); }}>
            <IconHelp /> 채워 줘
          </button>
          <button type="button" className="btn" data-testid="ask-skip" onClick={() => nextStep(true)}>이대로 갈래</button>
          <button type="button" className="btn" data-testid="ask-stay" onClick={cancelAsk}>더 할래</button>
        </div>
      ) : (
        <div className="guide-actions">
          {step !== 'review' && (
            <button type="button" className="btn" data-testid="how" onClick={openHowTo}>
              <IconQuestion /> 어떻게 해?
            </button>
          )}
          {HAS_HELP.has(step) && (
            <>
              <button type="button" className="btn" data-testid="undo" disabled={!canUndo} onClick={undo}>
                <IconUndo /> 되돌리기
              </button>
              <button type="button" className="btn help" data-testid="help" onClick={() => helpStep()}>
                <IconHelp /> 도와줘
              </button>
            </>
          )}
          {!isLast && (
            <button type="button" className={ready ? 'btn primary ready' : 'btn primary'} data-testid="next" data-ready={ready ? '1' : '0'} onClick={() => nextStep()}>
              다음 <IconNext />
            </button>
          )}
        </div>
      )}
    </footer>
  );
}

export function Studio() {
  const step = useApp((s) => s.step);
  const profile = useApp((s) => s.profile);
  const howTo = useApp((s) => s.howTo);
  const [menu, setMenu] = useState(false);
  const closeMenu = useRef(() => setMenu(false)).current;
  useScrollCue();
  const View = VIEW[step];

  return (
    <div className="studio" data-step={step}>
      <header className="top">
        <div className="spiral" aria-hidden="true" />
        <button type="button" className="icon-btn home-btn" aria-label="처음 화면으로" title="처음 화면으로" data-testid="home" onClick={goHome}>
          <IconHome />
        </button>
        <Ribbon />
        <button type="button" className="icon-btn" aria-label="설정" data-testid="menu" onClick={() => setMenu(true)}>
          <IconMenu />
        </button>
      </header>
      <main className="stage" data-name={profile?.name ?? ''}>
        <View key={step} />
      </main>
      <GuideBar />
      {menu && <SettingsMenu onClose={closeMenu} />}
      {howTo && <HowToCard step={howTo} />}
      <PrintSheet />
    </div>
  );
}
