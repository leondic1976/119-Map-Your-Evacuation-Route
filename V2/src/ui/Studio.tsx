/** 스케치북 — 위 단계 띠 · 가운데 종이 · 아래 안내 줄 */
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { lineOf } from '../content/lines';
import { isVerified } from '../content/sources';
import {
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
  STEPS,
  undo,
  useApp,
  type StepId,
} from '../store/app';
import { GuideAvatar, IconClose, IconHelp, IconHome, IconMenu, IconNext, IconQuestion, IconSpeaker, IconUndo } from './art';
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
  useEscape(onClose);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="설정">
      <div className="sheet">
        <button type="button" className="x" aria-label="닫기" data-testid="menu-close" onClick={onClose}><IconClose /></button>
        <h2>설정</h2>
        <button type="button" className="tool wide" data-testid="sound-toggle" aria-pressed={soundOn} onClick={() => setSound(!soundOn)}>
          <IconSpeaker on={soundOn} /> 소리 {soundOn ? '켜짐' : '꺼짐'}
        </button>
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
          이 앱은 인터넷으로 아무것도 보내지 않는다. 「검수 대기」 표시가 있는 문장은 아직 소방청 자료와 대조하지 않았다.
          소방청 캐릭터 영이·일구·웅이는 공공누리 제1유형(출처표시)으로 공개된 그림이다.
        </p>
      </div>
    </div>
  );
}

function GuideBar() {
  const lineId = useApp((s) => s.line);
  const step = useApp((s) => s.step);
  const asking = useApp((s) => s.asking);
  const canUndo = useApp((s) => s.past.length > 0);
  const line = lineOf(lineId);
  const isLast = step === 'review' || step === 'drill';

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
            <button type="button" className="btn primary" data-testid="next" onClick={() => nextStep()}>
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
