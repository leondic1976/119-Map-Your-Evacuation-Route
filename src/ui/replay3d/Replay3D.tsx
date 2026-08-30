'use client';

/**
 * 3D 리플레이 — 설계서 v1.2 §8 · v1.4 §2·§3.
 *
 * 게임을 대신하지 않는다. 이미 끝난 판을 다시 보는 화면이다.
 * 기록된 칸을 그대로 따라가고(FR-11.3), 그때의 불·연기를 함께 재생한다(FR-11.4).
 * WebGL 을 못 쓰면 2D 리플레이로 조용히 내려간다.
 *
 * 이 파일은 껍데기다 — 상태와 조작만 갖고, 그림은 `Scene.tsx` 가 그린다.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom, N8AO } from '@react-three/postprocessing';
import type { ReplayFrame } from '../../types/game';
import type { Cell, FloorPlan, RoutePair } from '../../types/plan';
import type { PlayerCharacter } from '../../types/guide';
import { PlanSvg } from '../PlanSvg';
import Scene, { type Layers, type ViewMode } from './Scene';
import { avatar3dIdentity } from './Avatar3D';
import Hud from './Hud';
import EndingScene from './EndingScene';
import { FrameWatch, guessQuality, settingsFor, type Quality } from './quality';
import { smokeAt } from './Hazard';

interface Props {
  plan: FloorPlan;
  frames: ReplayFrame[];
  character: PlayerCharacter;
  tickSeconds: number;
  outcome: 'success' | 'failed';
  /** 아이가 그린 길 — 바닥에 빛나는 띠로 깐다 (FR-11.7) */
  routes?: RoutePair;
  /** 자기 최고 기록(틱). 마지막 장면에서 견준다 */
  bestTicks?: number;
  onClose: () => void;
}

const SPEEDS = [0.5, 1, 2];

/** WebGL 을 아예 못 쓰는 기기인지 미리 본다 */
function webglMissing(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return !(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return true;
  }
}

/** 화질을 재다가 느리면 한 번 내려간다 */
function Watchdog({ onSlow }: { onSlow: () => void }) {
  const watch = useRef(new FrameWatch());
  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      if (watch.current.tick(t)) onSlow();
      else raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [onSlow]);
  return null;
}

export default function Replay3D({ plan, frames, character, tickSeconds, outcome, routes, bestTicks, onClose }: Props) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  /* 대피하는 느낌을 먼저 주되, 길을 잃으면 집 전체 시점으로 곧바로 바꿀 수 있다. */
  const [view, setView] = useState<ViewMode>('first');
  const [gone, setGone] = useState(false);
  const [ending, setEnding] = useState(false);
  const [quality, setQuality] = useState<Quality>('high');
  const [autoLowered, setAutoLowered] = useState(false);
  const [layers, setLayers] = useState<Layers>({ route: true, trail: true, hazard: true, scenery: true });
  /** 멈춘 뒤 끌어서 둘러보기 — 좌우(yaw)·상하(pitch)와 거리(zoom) */
  const [orbit, setOrbit] = useState({ yaw: 0, pitch: 0, zoom: 1 });
  const frame = frames[Math.min(i, frames.length - 1)];
  const avatar = useMemo(() => avatar3dIdentity(character), [character]);

  /* 기기를 보고 첫 화질을 고른다 */
  useEffect(() => {
    setQuality(guessQuality());
    if (webglMissing()) setGone(true);
  }, []);

  /* 재생 */
  useEffect(() => {
    if (!playing) return;
    const step = Math.max(60, (tickSeconds * 1000) / speed / 4);
    const t = setInterval(() => {
      setI((v) => {
        if (v + 1 >= frames.length) {
          setPlaying(false);
          if (outcome === 'success') setEnding(true);
          return frames.length - 1;
        }
        return v + 1;
      });
    }, step);
    return () => clearInterval(t);
  }, [playing, speed, frames.length, tickSeconds, outcome]);

  /* 시점을 바꾸면 둘러보기를 처음으로 되돌린다 */
  useEffect(() => {
    setOrbit({ yaw: 0, pitch: 0, zoom: 1 });
  }, [view]);

  /* 덮개에는 닫기와 Esc 를 둔다 (작업지침 §5) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const settings = useMemo(() => settingsFor(quality), [quality]);
  const seconds = Math.round((frame?.tick ?? 0) * tickSeconds);
  const ahead = useMemo(() => frames.slice(i + 1, i + 6), [frames, i]);
  const trail = useMemo(() => frames.slice(0, i + 1).map((f) => f.cell), [frames, i]);
  const primaryRoute = routes?.primary?.waypoints ?? [];
  const alternateRoute = routes?.alternate?.waypoints ?? [];

  /* 아이가 그린 길의 끝이 곧 나가는 곳이다 */
  const exitCells = useMemo(() => {
    const out: Cell[] = [];
    for (const r of [routes?.primary, routes?.alternate]) {
      const last = r?.waypoints?.[r.waypoints.length - 1];
      if (last && !out.some((c) => c.x === last.x && c.y === last.y)) out.push(last);
    }
    return out;
  }, [routes]);

  const caption = useMemo(() => captionOf(frame, outcome, i === frames.length - 1, plan, frames[i]), [frame, outcome, i, frames, plan]);

  const jump = useCallback((v: number) => {
    setPlaying(false);
    setI(v);
  }, []);

  const onSlow = useCallback(() => {
    setAutoLowered(true);
    setQuality((q) => (q === 'high' ? 'low' : q));
  }, []);

  const setLayer = useCallback((k: keyof Layers, v: boolean) => {
    setLayers((s) => ({ ...s, [k]: v }));
  }, []);

  /*
   * 끌어서 둘러보기.
   * setPointerCapture 를 쓰지 않는다 — 놓아 주지 못한 채 남으면 그 뒤로 모든 누름이
   * 그 칸으로 빨려 들어가 조작 패널이 먹통이 된다. 끄는 동안만 창에 귀를 붙인다.
   */
  const startDrag = useCallback((e: React.PointerEvent) => {
    let last = { x: e.clientX, y: e.clientY };
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - last.x;
      const dy = ev.clientY - last.y;
      last = { x: ev.clientX, y: ev.clientY };
      setOrbit((o) => ({
        ...o,
        yaw: o.yaw + dx * 0.006,
        pitch: Math.max(-0.6, Math.min(0.9, o.pitch + dy * 0.005)),
      }));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }, []);

  const moved = orbit.yaw !== 0 || orbit.pitch !== 0 || orbit.zoom !== 1;

  if (ending) {
    return (
      <EndingScene
        character={character}
        seconds={Math.round((frames[frames.length - 1]?.tick ?? 0) * tickSeconds)}
        bestSeconds={bestTicks === undefined ? undefined : Math.round(bestTicks * tickSeconds)}
        onReplay={() => {
          setEnding(false);
          setI(0);
          setPlaying(true);
        }}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="k-replay" role="dialog" aria-modal="true" aria-label={`${avatar.name} 캐릭터의 3D 다시 보기`} data-coach="kids-replay3d">
      <div className="k-replay-stage">
        {gone ? (
          <div className="k-replay-2d" data-fallback="2d">
            <PlanSvg
              plan={plan}
              showSlots={[]}
              style="kid"
              gradeMode="easy"
              game={{
                field: fieldFromFrame(frame),
                origin: frame.cell,
                player: { cell: frame.cell, posture: frame.posture, facing: frame.facing, character },
                doorState: frame.doorState,
                goalCells: [],
                visionRadius: 99,
                fog: false,
              }}
            />
          </div>
        ) : (
          <div
            className="k-replay-canvas"
            data-render-quality={quality}
            data-character={character}
            data-character-style={avatar.style}
            onPointerDown={startDrag}
            onWheel={(e) => {
              setOrbit((o) => ({ ...o, zoom: Math.max(0.45, Math.min(2.6, o.zoom * (e.deltaY > 0 ? 0.89 : 1.12))) }));
            }}
          >
            <Canvas
              shadows={settings.shadows}
              dpr={settings.dpr}
              camera={{ fov: 34, near: 0.1, far: 400, position: [18, 18, 22] }}
              gl={{ antialias: quality === 'high', powerPreference: 'high-performance' }}
              onCreated={({ gl }) => {
                gl.setClearColor('#0b1118');
                /* 집 전체 시점에서 벽을 허리께로 자르려면 켜야 한다 (설계서 v1.4 §2.1) */
                gl.localClippingEnabled = true;
              }}
              fallback={<div className="k-replay-2d">그림을 그릴 수 없다.</div>}
            >
              {!autoLowered && <Watchdog onSlow={onSlow} />}
              <Scene
                plan={plan}
                frame={frame}
                ahead={ahead}
                trail={trail}
                view={view}
                character={character}
                playing={playing}
                primaryRoute={primaryRoute}
                alternateRoute={alternateRoute}
                exitCells={exitCells}
                layers={layers}
                quality={settings}
                orbit={orbit}
              />
              {settings.postprocessing && (
                <EffectComposer enableNormalPass>
                  <N8AO intensity={1.4} aoRadius={1.6} distanceFalloff={1} />
                  <Bloom intensity={0.75} luminanceThreshold={0.62} luminanceSmoothing={0.25} mipmapBlur />
                </EffectComposer>
              )}
            </Canvas>
          </div>
        )}
      </div>

      <Hud
        seconds={seconds}
        caption={caption}
        playing={playing}
        onPlay={() => setPlaying((v) => !v)}
        onRestart={() => jump(0)}
        onStep={() => jump(Math.min(frames.length - 1, i + 1))}
        speed={speed}
        speeds={SPEEDS}
        onSpeed={setSpeed}
        view={view}
        onView={setView}
        layers={layers}
        onLayer={setLayer}
        quality={quality}
        onQuality={(q) => {
          setAutoLowered(true);
          setQuality(q);
        }}
        moved={moved}
        onResetView={() => setOrbit({ yaw: 0, pitch: 0, zoom: 1 })}
        onClose={onClose}
      />

      <input
        className="k-replay-range"
        type="range"
        min={0}
        max={Math.max(0, frames.length - 1)}
        value={i}
        aria-label="시간"
        onChange={(e) => jump(Number(e.target.value))}
      />
    </div>
  );
}

/** 자막 — 그때 무슨 일이 있었는지 (FR-11.6) */
function captionOf(
  frame: ReplayFrame | undefined,
  outcome: 'success' | 'failed',
  last: boolean,
  plan: FloorPlan,
  now: ReplayFrame | undefined,
): string {
  if (!frame) return '';
  if (frame.events.includes('reachedGoal')) return '밖으로 나왔다!';
  if (frame.events.includes('closedDoor')) return '지나온 문을 닫았다. 잘했다.';
  if (frame.events.includes('doorHot')) return '문이 뜨거웠다. 다른 길로 돌아섰다.';
  if (frame.posture === 'crouch') return '몸을 낮추고 지나간다.';
  if (now && smokeAt(plan.grid, now, frame.cell.x, frame.cell.y) > 0.35) return '연기가 짙다. 몸을 낮추자.';
  if (last) return outcome === 'success' ? '무사히 나왔다.' : '여기서 멈췄다. 다시 해 보자.';
  return '나가는 길을 따라가는 중이다.';
}

/** 2D 로 내려갔을 때 쓸 위험장 — 리플레이 컷을 게임 화면 형식으로 바꾼다 */
function fieldFromFrame(frame: ReplayFrame) {
  return Array.from(frame.primary, (v, k) => ({
    primary: v / 255,
    secondaryHigh: frame.secondary[k] / 255,
    secondaryLow: 0,
    fuel: 1,
    state: (frame.spent[k] ? 'spent' : v > 0 ? 'active' : 'intact') as 'intact' | 'active' | 'spent',
    isWall: false,
  }));
}
