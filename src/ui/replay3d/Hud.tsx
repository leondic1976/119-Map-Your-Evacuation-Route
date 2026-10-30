'use client';

/** 3D 다시 보기의 상단 카메라 바와 보조 설정 패널 — 설계서 v1.10. */
import React from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronsRight,
  Eye,
  Footprints,
  Gauge,
  House,
  LocateFixed,
  PanelRightClose,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Layers, ViewMode } from './Scene';
import type { Quality } from './quality';

export type LookDirection = 'up' | 'down' | 'left' | 'right';

const VIEWS: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  { id: 'first', label: '내 눈으로', icon: <Eye size={20} /> },
  { id: 'follow', label: '뒤에서', icon: <Footprints size={20} /> },
  { id: 'dollhouse', label: '집 전체', icon: <House size={20} /> },
];

const LOOKS: { id: LookDirection; label: string; icon: React.ReactNode }[] = [
  { id: 'left', label: '왼쪽 보기', icon: <ArrowLeft size={22} /> },
  { id: 'up', label: '위 보기', icon: <ArrowUp size={22} /> },
  { id: 'down', label: '아래 보기', icon: <ArrowDown size={22} /> },
  { id: 'right', label: '오른쪽 보기', icon: <ArrowRight size={22} /> },
];

interface CameraToolbarProps {
  seconds: number;
  view: ViewMode;
  onView: (view: ViewMode) => void;
  onLook: (direction: LookDirection) => void;
  /** 가까이·멀리 — 휠과 같은 값을 바꾼다 (설계서 v1.19 §2.3) */
  onZoom: (direction: 'in' | 'out') => void;
  moved: boolean;
  onReset: () => void;
  onClose: () => void;
}

/** 가장 중요한 시점 조작은 캔버스 위를 가리지 않는 독립된 첫 줄에 둔다. */
export function CameraToolbar({ seconds, view, onView, onLook, onZoom, moved, onReset, onClose }: CameraToolbarProps) {
  return (
    <header className="k-r-topbar" aria-label="3D 시점 조작">
      <div className="k-r-top-title">
        <span className="k-r-live" aria-hidden="true" />
        <span>3D 대피 리플레이</span>
        <b className="num">{seconds}초</b>
      </div>
      <div className="k-r-camera-group" role="group" aria-label="어디서 볼까">
        <span className="k-r-top-label">어디서 볼까</span>
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="k-r-view-button"
            aria-pressed={view === item.id}
            data-view={item.id}
            onClick={() => onView(item.id)}
          >
            {item.icon}<span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="k-r-look-group" role="group" aria-label="보는 방향">
        <span className="k-r-top-label">보는 방향</span>
        {LOOKS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="k-r-look-button"
            data-look-direction={item.id}
            onClick={() => onLook(item.id)}
            aria-label={item.label}
            title={item.label}
          >
            {item.icon}
          </button>
        ))}
        <button
          type="button"
          className="k-r-look-button reset"
          data-look-reset
          onClick={onReset}
          disabled={!moved}
          aria-label="시점 정면으로"
          title="시점 정면으로"
        >
          <LocateFixed size={22} />
        </button>
        <button type="button" className="k-r-look-button" data-look-zoom="in" onClick={() => onZoom('in')} aria-label="가까이 보기" title="가까이 보기 (휠 · +)">
          <ZoomIn size={22} />
        </button>
        <button type="button" className="k-r-look-button" data-look-zoom="out" onClick={() => onZoom('out')} aria-label="멀리 보기" title="멀리 보기 (휠 · -)">
          <ZoomOut size={22} />
        </button>
      </div>
      <button type="button" className="k-x" onClick={onClose} aria-label="3D 다시 보기 닫기">
        <X size={24} strokeWidth={2.6} />
      </button>
    </header>
  );
}

interface Props {
  playing: boolean;
  onPlay: () => void;
  onRestart: () => void;
  onStep: () => void;
  speed: number;
  speeds: number[];
  onSpeed: (v: number) => void;
  layers: Layers;
  onLayer: (k: keyof Layers, v: boolean) => void;
  quality: Quality;
  onQuality: (q: Quality) => void;
  /** 패널이 펴져 있는가. 접으면 작은 「설정」 단추만 남는다 */
  open: boolean;
  onToggle: () => void;
}

const LAYER_LABELS: { id: keyof Layers; label: string }[] = [
  { id: 'route', label: '내가 그린 길' },
  { id: 'trail', label: '지나온 자취' },
  { id: 'hazard', label: '불과 연기' },
  { id: 'scenery', label: '집 밖 풍경' },
];

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="k-r-toggle">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="k-r-toggle-track" aria-hidden="true"><span className="k-r-toggle-knob" /></span>
      <span className="k-r-toggle-label">{label}</span>
    </label>
  );
}

/** 재생·레이어·화질처럼 덜 자주 쓰는 기능만 오른쪽 보조 패널에 둔다. */
export default function Hud({ playing, onPlay, onRestart, onStep, speed, speeds, onSpeed, layers, onLayer, quality, onQuality, open, onToggle }: Props) {
  if (!open) {
    return (
      <button type="button" className="k-r-panel-open" data-coach="kids-replay-panel-toggle" onClick={onToggle} aria-expanded={false} aria-label="화면 설정 펴기" title="화면 설정">
        <Settings2 size={20} aria-hidden="true" /> 설정
      </button>
    );
  }
  return (
    <aside className="k-r-panel" aria-label="3D 화면 설정">
      <header className="k-r-head">
        <Settings2 size={20} aria-hidden="true" />
        <h2>화면 설정</h2>
        <button type="button" className="k-r-fold" data-coach="kids-replay-panel-toggle" onClick={onToggle} aria-expanded aria-label="화면 설정 접기" title="접기 — 장면이 끝까지 보인다">
          <PanelRightClose size={20} aria-hidden="true" />
        </button>
      </header>

      <div className="k-r-row" role="group" aria-label="재생">
        <button type="button" className="k-tb primary" data-coach="kids-replay-play" onClick={onPlay} aria-label={playing ? '멈춤' : '재생'}>
          {playing ? <Pause size={20} /> : <Play size={20} />}{playing ? '멈춤' : '재생'}
        </button>
        <button type="button" className="k-tb" onClick={onRestart} aria-label="처음으로"><RotateCcw size={18} />처음</button>
        <button type="button" className="k-tb" onClick={onStep} aria-label="한 칸 앞으로"><ChevronsRight size={18} />한 칸</button>
      </div>

      <div className="k-r-field">
        <span className="k-r-label"><Gauge size={16} aria-hidden="true" /> 빠르기</span>
        <div className="k-seg dark" role="group" aria-label="빠르기">
          {speeds.map((s) => <button key={s} type="button" aria-pressed={speed === s} onClick={() => onSpeed(s)}>{s}배</button>)}
        </div>
      </div>

      <div className="k-r-field column" data-coach="kids-replay-layers">
        <span className="k-r-label">보이기</span>
        {LAYER_LABELS.map((item) => <Toggle key={item.id} label={item.label} on={layers[item.id]} onChange={(v) => onLayer(item.id, v)} />)}
      </div>

      <div className="k-r-field column">
        <span className="k-r-label">화질</span>
        <div className="k-seg dark" role="group" aria-label="화질">
          <button type="button" aria-pressed={quality === 'ultra'} data-quality="ultra" onClick={() => onQuality('ultra')}>고급</button>
          <button type="button" aria-pressed={quality === 'high'} data-quality="high" onClick={() => onQuality('high')}>높음</button>
          <button type="button" aria-pressed={quality === 'low'} data-quality="low" onClick={() => onQuality('low')}>가벼움</button>
        </div>
      </div>
      <p className="k-r-hint">마우스로 끌거나 방향키로 둘러보자. 두 번 누르면 정면으로 돌아온다.</p>
    </aside>
  );
}
