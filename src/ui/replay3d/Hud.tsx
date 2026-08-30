'use client';

/**
 * 다시 보기 조작 패널 — 설계서 v1.4 §3.
 *
 * 목표 그림의 유리판 패널을 따르되 한국어로, **계기판 없이** 만든다.
 * `42/50`·`84%` 같은 숫자는 두지 않는다 — 점수·등급·순위를 만들지 않는다(작업지침 §9-9).
 * 시간은 줄어드는 제한이 아니라 **늘어나는 시각**이다(§9-10).
 *
 * 누르는 것은 좁은 화면에서도 48×48 이상이다. 유리판이라고 작게 만들지 않는다.
 */
import React from 'react';
import { ChevronsRight, Eye, Gauge, Pause, Play, RotateCcw, X } from 'lucide-react';
import type { Layers, ViewMode } from './Scene';
import type { Quality } from './quality';

interface Props {
  seconds: number;
  caption: string;
  playing: boolean;
  onPlay: () => void;
  onRestart: () => void;
  onStep: () => void;
  speed: number;
  speeds: number[];
  onSpeed: (v: number) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  layers: Layers;
  onLayer: (k: keyof Layers, v: boolean) => void;
  quality: Quality;
  onQuality: (q: Quality) => void;
  /** 시점을 손대면 되돌리기가 뜬다 */
  moved: boolean;
  onResetView: () => void;
  onClose: () => void;
}

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'dollhouse', label: '집 전체' },
  { id: 'follow', label: '뒤에서' },
  { id: 'first', label: '내 눈으로' },
];

const LAYER_LABELS: { id: keyof Layers; label: string }[] = [
  { id: 'route', label: '내가 그린 길' },
  { id: 'trail', label: '지나온 자취' },
  { id: 'hazard', label: '불과 연기' },
  { id: 'scenery', label: '집 밖 풍경' },
];

/** 켬/끔 하나 — 라벨 전체가 누르는 칸이다 */
function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="k-r-toggle">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="k-r-toggle-track" aria-hidden="true">
        <span className="k-r-toggle-knob" />
      </span>
      <span className="k-r-toggle-label">{label}</span>
    </label>
  );
}

export default function Hud({
  seconds,
  caption,
  playing,
  onPlay,
  onRestart,
  onStep,
  speed,
  speeds,
  onSpeed,
  view,
  onView,
  layers,
  onLayer,
  quality,
  onQuality,
  moved,
  onResetView,
  onClose,
}: Props) {
  return (
    <aside className="k-r-panel" aria-label="다시 보기 조작">
      <header className="k-r-head">
        <h2>다시 보기</h2>
        <button type="button" className="k-x" onClick={onClose} aria-label="닫기">
          <X size={20} strokeWidth={2.6} />
        </button>
      </header>
      <p className="k-r-caption" role="status">
        <b className="num">{seconds}초</b>
        <span>{caption}</span>
      </p>

      <div className="k-r-row" role="group" aria-label="재생">
        <button type="button" className="k-tb primary" data-coach="kids-replay-play" onClick={onPlay} aria-label={playing ? '멈춤' : '재생'}>
          {playing ? <Pause size={20} /> : <Play size={20} />}
          {playing ? '멈춤' : '재생'}
        </button>
        <button type="button" className="k-tb" onClick={onRestart} aria-label="처음으로">
          <RotateCcw size={18} />
          처음
        </button>
        <button type="button" className="k-tb" onClick={onStep} aria-label="한 칸 앞으로">
          <ChevronsRight size={18} />한 칸
        </button>
      </div>

      <div className="k-r-field">
        <span className="k-r-label">
          <Gauge size={16} aria-hidden="true" /> 빠르기
        </span>
        <div className="k-seg dark" role="group" aria-label="빠르기">
          {speeds.map((s) => (
            <button key={s} type="button" aria-pressed={speed === s} onClick={() => onSpeed(s)}>
              {s}배
            </button>
          ))}
        </div>
      </div>

      <div className="k-r-field">
        <span className="k-r-label">
          <Eye size={16} aria-hidden="true" /> 어디서 볼까
        </span>
        <div className="k-seg dark k-r-views" role="group" aria-label="시점">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" aria-pressed={view === v.id} data-view={v.id} onClick={() => onView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="k-r-field column" data-coach="kids-replay-layers">
        <span className="k-r-label">보이기</span>
        {LAYER_LABELS.map((l) => (
          <Toggle key={l.id} label={l.label} on={layers[l.id]} onChange={(v) => onLayer(l.id, v)} />
        ))}
      </div>

      <div className="k-r-field">
        <span className="k-r-label">화질</span>
        <div className="k-seg dark" role="group" aria-label="화질">
          <button type="button" aria-pressed={quality === 'high'} data-quality="high" onClick={() => onQuality('high')}>
            높게
          </button>
          <button type="button" aria-pressed={quality === 'low'} data-quality="low" onClick={() => onQuality('low')}>
            낮게
          </button>
        </div>
      </div>

      {moved && (
        <button type="button" className="k-tb k-r-reset" onClick={onResetView}>
          시점 되돌리기
        </button>
      )}
      <p className="k-r-hint">끌어서 둘러보기 · 휠로 확대·축소</p>
    </aside>
  );
}
