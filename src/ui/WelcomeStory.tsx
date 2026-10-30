'use client';

/**
 * 첫 화면 그림 이야기 — 설계서 v2.0 §10 (요청 대장 #105·#106).
 *
 * 3D 를 쓰지 않는다. 모눈종이 한 장 위에서 자막 한 줄마다 장면 하나가 움직인다.
 *
 *   1 우리 집을 그린다            연필이 바깥벽 → 안쪽 벽을 긋고, 문·이름·가구가 차례로 놓인다
 *   2 나가는 길을 그린다          빨간 펜이 내 자리에서 현관을 지나 만나는 곳까지 점선을 긋는다. 범례가 붙는다
 *   3 불이 나면 몸을 낮추고 그 길로  주방에 불, 연기가 번진다. 아이가 몸을 낮추고 그 점선을 따라 나간다
 *   4 밖에서 가족과 만난다         만나는 곳에서 가족이 기다린다. 아이가 일어나 손을 든다
 *
 * 장면이 바뀔 때마다 종이가 조금 다가가거나 돌아서고(카메라), 빛이 한 번 스치고, 자막과 진행 막대가 새로 선다.
 * 움직이는 것은 시계 하나(초당 30번)가 그린다. 다른 탭이면 브라우저가 멈추고, 돌아오면 이어서 그린다.
 * 움직임 줄이기 설정이면 시계를 돌리지 않고 장면마다 다 그려진 그림만 바꿔 보인다.
 */
import React, { useEffect, useRef, useState } from 'react';

export type StoryScene = 0 | 1 | 2 | 3 | 4;

interface Props {
  /** 카드의 세 단계가 같은 박자로 켜지도록 알린다 (1·2·3, 넷째 장면은 3) */
  onPhase?: (phase: 0 | 1 | 2 | 3) => void;
}

/* ------------------------------------------------------------ 시간표 (ms) */
const BLANK = 500;
const S1 = BLANK;
const S2 = S1 + 6000;
const S3 = S2 + 5200;
const S4 = S3 + 8000;
const ERASE = S4 + 4800;
const LOOP = ERASE + 1100;

const WALL_DRAW = 2700; /* 연필이 벽을 다 긋는 데 걸리는 시간 */
const ROUTE_FROM = 600;
const ROUTE_DRAW = 2600;
const CROUCH_AT = 1200; /* 불이 나고 이만큼 뒤에 몸을 낮춘다 */
const WALK_FROM = 1500;
const WALK_DUR = 5600;
const FPS_MS = 1000 / 30;

const CAPTIONS: Record<Exclude<StoryScene, 0>, string> = {
  1: '우리 집을 그린다',
  2: '나가는 길을 그린다',
  3: '불이 나면 몸을 낮추고 그 길로',
  4: '밖에서 가족과 만난다',
};
const SCENE_MS: Record<Exclude<StoryScene, 0>, number> = { 1: S2 - S1, 2: S3 - S2, 3: S4 - S3, 4: ERASE - S4 };

function sceneAt(t: number): StoryScene {
  if (t < S1 || t >= ERASE) return 0;
  if (t < S2) return 1;
  if (t < S3) return 2;
  if (t < S4) return 3;
  return 4;
}

/* ------------------------------------------------------------ 도면 (종이 800 × 560) */

/* 바깥벽 한 획 — 현관(오른쪽 240~300)만 비워 둔다. 그다음 안쪽 벽은 연필이 가까운 것부터 */
const WALLS: { d: string; w: number }[] = [
  { d: 'M620 240 V80 H100 V440 H620 V300', w: 8 },
  { d: 'M300 80 V240', w: 5 },
  { d: 'M460 80 V240', w: 5 },
  { d: 'M620 240 H560', w: 5 },
  { d: 'M520 240 H420', w: 5 },
  { d: 'M380 240 H270', w: 5 },
  { d: 'M230 240 H100', w: 5 },
  { d: 'M260 300 H420', w: 5 },
  { d: 'M500 300 H620', w: 5 },
  { d: 'M260 360 V440', w: 5 },
];

const WINDOWS = 'M140 80 H200 M360 80 H420 M520 80 H580 M100 120 V180 M100 330 V400 M330 440 H420 M500 440 H580';
const ROUTE_D = 'M150 212 H250 V270 H700 V418';
const START = { x: 150, y: 212 };
const MEET = { x: 705, y: 462 };
const FIRE = { x: 128, y: 362 };

/* 연기 덩이 — 주방에서 나와 복도를 따라 번진다. [가는 곳 x, y, 반지름, 시작(불 난 뒤 ms)] */
const PUFFS: [number, number, number, number][] = [
  [150, 350, 62, 700],
  [205, 405, 58, 1000],
  [190, 320, 54, 1400],
  [235, 278, 48, 1900],
  [300, 268, 52, 2400],
  [330, 372, 60, 2700],
  [372, 276, 52, 3000],
  [445, 268, 54, 3600],
  [420, 400, 58, 3800],
  [515, 276, 50, 4300],
  [168, 200, 44, 4500],
  [570, 270, 44, 5000],
  [270, 175, 40, 5200],
  [530, 380, 52, 5400],
];

const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const easeOut = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : 1 - Math.pow(1 - k, 3));
const clamp01 = (k: number) => (k < 0 ? 0 : k > 1 ? 1 : k);

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* 움직임 줄이기 — 장면마다 보여 줄 한 순간 */
const STILLS: number[] = [S2 - 10, S3 - 10, S3 + WALK_FROM + WALK_DUR * 0.55, ERASE - 10];

export default function WelcomeStory({ onPhase }: Props) {
  const [scene, setScene] = useState<StoryScene>(0);
  const sceneRef = useRef<StoryScene>(0);

  const walls = useRef<(SVGPathElement | null)[]>([]);
  const pencil = useRef<SVGGElement>(null);
  const marker = useRef<SVGGElement>(null);
  const routeMask = useRef<SVGPathElement>(null);
  const routeProbe = useRef<SVGPathElement>(null);
  const arrow = useRef<SVGGElement>(null);
  const kid = useRef<SVGGElement>(null);
  const kidStand = useRef<SVGGElement>(null);
  const kidLow = useRef<SVGGElement>(null);
  const kidJoy = useRef<SVGGElement>(null);
  const legsA = useRef<SVGGElement>(null);
  const legsB = useRef<SVGGElement>(null);
  const puffs = useRef<(SVGCircleElement | null)[]>([]);
  const onPhaseRef = useRef(onPhase);
  onPhaseRef.current = onPhase;

  useEffect(() => {
    const wallEls = walls.current.filter((w): w is SVGPathElement => Boolean(w));
    const lens = wallEls.map((w) => w.getTotalLength());
    const total = lens.reduce((a, b) => a + b, 0);
    const route = routeProbe.current;
    const routeLen = route ? route.getTotalLength() : 1;
    wallEls.forEach((w, i) => w.setAttribute('stroke-dasharray', `${lens[i]} ${lens[i] + 1}`));
    routeMask.current?.setAttribute('stroke-dasharray', `${routeLen} ${routeLen + 1}`);

    const setScene1 = (s: StoryScene) => {
      if (s === sceneRef.current) return;
      sceneRef.current = s;
      setScene(s);
      onPhaseRef.current?.(s === 4 ? 3 : s);
    };

    const show = (el: Element | null, on: boolean) => {
      if (el) el.setAttribute('opacity', on ? '1' : '0');
    };

    /** t 하나로 모든 움직임을 정한다 — 되감아도, 건너뛰어도 같은 그림이 나온다 */
    const draw = (t: number) => {
      const sc0 = sceneAt(t);
      setScene1(sc0);
      /* 지우는 동안은 마지막 그림을 그대로 두고 CSS 가 한꺼번에 흐리게 지운다 */
      const sc: StoryScene = t >= ERASE ? 4 : sc0;

      /* 1 — 연필이 벽을 긋는다 */
      const wallU = clamp01((t - S1 - 250) / WALL_DRAW);
      const drawn = ease(wallU) * total;
      let acc = 0;
      let tip: DOMPoint | null = null;
      wallEls.forEach((w, i) => {
        const part = Math.max(0, Math.min(lens[i], drawn - acc));
        w.setAttribute('stroke-dashoffset', String(lens[i] - part));
        if (!tip && part < lens[i] && drawn > acc) tip = w.getPointAtLength(part);
        acc += lens[i];
      });
      const pencilOn = t >= S1 && t < S1 + 250 + WALL_DRAW + 400;
      if (pencil.current) {
        const end = wallEls[wallEls.length - 1]?.getPointAtLength(lens[lens.length - 1]);
        const p = (tip as DOMPoint | null) ?? (wallU <= 0 ? wallEls[0]?.getPointAtLength(0) : end);
        const lift = t > S1 + 250 + WALL_DRAW ? clamp01((t - S1 - 250 - WALL_DRAW) / 400) : 0;
        if (p) pencil.current.setAttribute('transform', `translate(${p.x + lift * 40} ${p.y - lift * 50})`);
        pencil.current.setAttribute('opacity', pencilOn ? String(1 - lift) : '0');
      }

      /* 2 — 빨간 펜이 나가는 길을 긋는다 */
      const routeU = t >= S2 ? clamp01((t - S2 - ROUTE_FROM) / ROUTE_DRAW) : t >= S3 ? 1 : 0;
      const routeK = sc >= 2 ? ease(routeU) : 0;
      routeMask.current?.setAttribute('stroke-dashoffset', String(routeLen * (1 - routeK)));
      if (marker.current && route) {
        const on = t >= S2 + 200 && t < S2 + ROUTE_FROM + ROUTE_DRAW + 400;
        const p = route.getPointAtLength(routeLen * routeK);
        const lift = t > S2 + ROUTE_FROM + ROUTE_DRAW ? clamp01((t - S2 - ROUTE_FROM - ROUTE_DRAW) / 400) : 0;
        marker.current.setAttribute('transform', `translate(${p.x + lift * 40} ${p.y - lift * 50})`);
        marker.current.setAttribute('opacity', on ? String(1 - lift) : '0');
      }
      show(arrow.current, sc >= 2 && routeU >= 1);

      /* 3 — 아이가 몸을 낮추고 그 길로 */
      if (kid.current && route) {
        let x = START.x;
        let y = START.y;
        let pose: 'stand' | 'low' | 'joy' = 'stand';
        let stepping = false;
        if (sc === 3) {
          const local = t - S3;
          const walkK = clamp01((local - WALK_FROM) / WALK_DUR);
          const p = route.getPointAtLength(routeLen * ease(walkK));
          x = p.x;
          y = p.y;
          pose = local >= CROUCH_AT ? 'low' : 'stand';
          stepping = walkK > 0 && walkK < 1;
        } else if (sc === 4) {
          const k = easeOut(clamp01((Math.min(t, ERASE) - S4) / 700));
          const end = route.getPointAtLength(routeLen);
          x = end.x + (MEET.x - 16 - end.x) * k;
          y = end.y + (MEET.y + 20 - end.y) * k;
          pose = t - S4 > 700 ? 'joy' : 'low';
        }
        const bob = stepping ? -Math.abs(Math.sin(t / 140)) * 2.2 : 0;
        kid.current.setAttribute('transform', `translate(${x.toFixed(1)} ${(y + bob).toFixed(1)})`);
        kid.current.setAttribute('opacity', sc === 3 || sc === 4 ? '1' : '0');
        show(kidStand.current, pose === 'stand');
        show(kidLow.current, pose === 'low');
        show(kidJoy.current, pose === 'joy');
        const flip = stepping && Math.floor(t / 170) % 2 === 1;
        show(legsA.current, !flip);
        show(legsB.current, flip);
      }

      /* 연기 — 불이 난 뒤부터 번진다. 넷째 장면에서도 남아 있다 */
      const since = sc === 3 || sc === 4 ? t - S3 : -1;
      puffs.current.forEach((c, i) => {
        if (!c) return;
        const [tx, ty, r, start] = PUFFS[i];
        const k = since < 0 ? 0 : easeOut(clamp01((since - start) / 2600));
        const wob = Math.sin(t / 900 + i * 1.7) * 4 * k;
        c.setAttribute('cx', (FIRE.x + (tx - FIRE.x) * k + wob).toFixed(1));
        c.setAttribute('cy', (FIRE.y + (ty - FIRE.y) * k - wob * 0.6).toFixed(1));
        c.setAttribute('r', (8 + (r - 8) * k).toFixed(1));
        c.setAttribute('opacity', (k * (sc === 4 ? 0.62 : 0.78)).toFixed(3));
      });
    };

    if (prefersReducedMotion()) {
      let i = 0;
      draw(STILLS[0]);
      const id = window.setInterval(() => {
        i = (i + 1) % STILLS.length;
        draw(STILLS[i]);
      }, 6500);
      return () => window.clearInterval(id);
    }

    let raf = 0;
    let last = 0;
    let painted = 0;
    let t = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!last) last = now;
      /* 다른 탭에서 돌아오면 건너뛰지 않고 멈춘 곳에서 잇는다 */
      t = (t + Math.min(100, now - last)) % LOOP;
      last = now;
      if (now - painted < FPS_MS) return;
      painted = now;
      draw(t);
    };
    draw(0);
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const caption = scene === 0 ? null : CAPTIONS[scene];

  return (
    <div className="k-story" data-scene={scene} aria-hidden="true">
      <div className="k-story-stage">
        <div className="k-story-paper">
          <svg viewBox="0 0 800 560" className="k-story-svg" preserveAspectRatio="xMidYMid meet">
            <defs>
              <pattern id="kst-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M20 0H0V20" fill="none" stroke="#b9d3ea" strokeWidth="0.8" />
              </pattern>
              <pattern id="kst-grid-major" width="100" height="100" patternUnits="userSpaceOnUse">
                <path d="M100 0H0V100" fill="none" stroke="#8fb6da" strokeWidth="1.3" />
              </pattern>
              <radialGradient id="kst-smoke">
                <stop offset="0" stopColor="#4c5560" stopOpacity="0.85" />
                <stop offset="0.55" stopColor="#5d6670" stopOpacity="0.5" />
                <stop offset="1" stopColor="#6d7680" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="kst-glow">
                <stop offset="0" stopColor="#ffb347" stopOpacity="0.75" />
                <stop offset="0.5" stopColor="#ff6a2b" stopOpacity="0.3" />
                <stop offset="1" stopColor="#ff4b1f" stopOpacity="0" />
              </radialGradient>
              <mask id="kst-route-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="800" height="560">
                <path ref={routeMask} d={ROUTE_D} fill="none" stroke="#fff" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
              </mask>
            </defs>

            {/* 종이 */}
            <rect width="800" height="560" fill="#fbf8f0" />
            <rect width="800" height="560" fill="url(#kst-grid)" />
            <rect width="800" height="560" fill="url(#kst-grid-major)" />

            <g className="kst-content">
            {/* 제목과 범례 — 지도에는 늘 이름과 범례가 붙는다 */}
            <g className="kst-pop" style={{ ['--d' as string]: '0.1s' }}>
              <text x="100" y="54" className="kst-title">우리집 대피지도</text>
              <path d="M100 64 H262" stroke="#c8102e" strokeWidth="3" strokeLinecap="round" />
            </g>
            <g className="kst-legend">
              <rect x="640" y="26" width="146" height="104" rx="10" fill="#ffffff" stroke="#9db7cf" strokeWidth="1.5" />
              <g transform="translate(662 54)">
                <path d="M0 -9 L2.6 -2.8 L9.3 -2.8 L3.9 1.2 L5.9 7.6 L0 3.8 L-5.9 7.6 L-3.9 1.2 L-9.3 -2.8 L-2.6 -2.8Z" fill="#ffb81c" stroke="#9a6400" strokeWidth="1.2" />
                <text x="20" y="5" className="kst-legend-text">내 자리</text>
              </g>
              <g transform="translate(652 80)">
                <path d="M0 0 H22" stroke="#e5312c" strokeWidth="5" strokeDasharray="7 5" strokeLinecap="round" />
                <text x="30" y="5" className="kst-legend-text">나가는 길</text>
              </g>
              <g transform="translate(662 106)">
                <circle r="8" fill="none" stroke="#0e9f5d" strokeWidth="3.5" />
                <text x="20" y="5" className="kst-legend-text">만나는 곳</text>
              </g>
            </g>


            {/* 1 — 벽: 연필이 긋는다 */}
            <g className="kst-walls" stroke="#1f3448" fill="none" strokeLinecap="square" strokeLinejoin="miter">
              {WALLS.map((w, i) => (
                <path
                  key={w.d}
                  ref={(el) => {
                    walls.current[i] = el;
                  }}
                  d={w.d}
                  strokeWidth={w.w}
                />
              ))}
            </g>

            {/* 창 — 벽을 하얗게 끊고 하늘색 선 한 줄 */}
            <g className="kst-pop kst-windows" style={{ ['--d' as string]: '3.0s' }}>
              <path className="glass" d={WINDOWS} />
              <path className="pane" d={WINDOWS} />
            </g>

            {/* 문 — 열리는 쪽을 호로 */}
            <g className="kst-pop kst-doors" style={{ ['--d' as string]: '2.9s' }}>
              <path d="M230 240 V200 M270 240 A40 40 0 0 0 230 200" />
              <path d="M380 240 V200 M420 240 A40 40 0 0 0 380 200" />
              <path d="M520 240 V200 M560 240 A40 40 0 0 0 520 200" />
              <path d="M620 300 H672 M620 248 A52 52 0 0 1 672 300" />
            </g>

            {/* 가구 — 위에서 내려다본 모양 */}
            <g className="kst-furniture">
              <g className="kst-pop" style={{ ['--d' as string]: '3.2s' }}>
                <rect x="114" y="94" width="58" height="92" rx="6" />
                <rect x="120" y="100" width="46" height="20" rx="5" className="soft" />
              </g>
              <g className="kst-pop" style={{ ['--d' as string]: '3.35s' }}>
                <rect x="232" y="94" width="56" height="34" rx="3" />
                <circle cx="260" cy="146" r="10" className="soft" />
              </g>
              <g className="kst-pop" style={{ ['--d' as string]: '3.5s' }}>
                <rect x="322" y="94" width="96" height="84" rx="6" />
                <rect x="328" y="100" width="40" height="18" rx="5" className="soft" />
                <rect x="372" y="100" width="40" height="18" rx="5" className="soft" />
              </g>
              <g className="kst-pop" style={{ ['--d' as string]: '3.65s' }}>
                <rect x="540" y="94" width="68" height="96" rx="12" />
                <ellipse cx="490" cy="112" rx="14" ry="18" className="soft" />
                <rect x="476" y="160" width="30" height="22" rx="4" className="soft" />
              </g>
              <g className="kst-pop" style={{ ['--d' as string]: '3.8s' }}>
                <rect x="108" y="308" width="34" height="124" rx="3" />
                <circle cx="125" cy="345" r="9" className="ring" />
                <circle cx="125" cy="378" r="9" className="ring" />
                <rect x="176" y="362" width="58" height="46" rx="4" className="soft" />
              </g>
              <g className="kst-pop" style={{ ['--d' as string]: '3.95s' }}>
                <rect x="300" y="398" width="150" height="32" rx="8" />
                <rect x="300" y="398" width="150" height="10" rx="4" className="soft" />
                <rect x="336" y="346" width="78" height="34" rx="5" className="soft" />
                <rect x="300" y="306" width="96" height="9" rx="2" />
                <circle cx="596" cy="420" r="11" className="plant" />
              </g>
            </g>

            {/* 이름 — 쉬운 말로 */}
            <g className="kst-labels">
              <text x="203" y="168" className="kst-pop" style={{ ['--d' as string]: '3.3s' }}>내 방</text>
              <text x="380" y="214" className="kst-pop" style={{ ['--d' as string]: '3.45s' }}>안방</text>
              <text x="540" y="222" className="kst-pop" style={{ ['--d' as string]: '3.6s' }}>화장실</text>
              <text x="200" y="345" className="kst-pop" style={{ ['--d' as string]: '3.75s' }}>주방</text>
              <text x="520" y="350" className="kst-pop" style={{ ['--d' as string]: '3.9s' }}>거실</text>
              <text x="584" y="259" className="kst-pop kst-small" style={{ ['--d' as string]: '4.05s' }}>현관</text>
            </g>

            {/* 3 — 불이 나면: 어둑해지고, 주방에 불, 연기가 번진다 */}
            <rect className="kst-dim" width="800" height="560" />
            <g className="kst-fire">
              <circle cx={FIRE.x} cy={FIRE.y} r="92" fill="url(#kst-glow)" className="kst-glow" />
              <Flame x={FIRE.x} y={FIRE.y + 14} s={1} />
              <Flame x={FIRE.x + 34} y={FIRE.y + 46} s={0.72} late />
            </g>
            <g className="kst-smoke">
              {PUFFS.map((_, i) => (
                <circle
                  key={i}
                  ref={(el) => {
                    puffs.current[i] = el;
                  }}
                  cx={FIRE.x}
                  cy={FIRE.y}
                  r="0"
                  fill="url(#kst-smoke)"
                  opacity="0"
                />
              ))}
            </g>

            {/* 2 — 나가는 길: 내 자리 → 현관 → 만나는 곳 */}
            <g className="kst-route">
              <path ref={routeProbe} d={ROUTE_D} fill="none" stroke="none" />
              <path
                d={ROUTE_D}
                mask="url(#kst-route-mask)"
                fill="none"
                stroke="#e5312c"
                strokeWidth="7"
                strokeDasharray="15 10"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="kst-route-line"
              />
              <g ref={arrow} opacity="0" transform="translate(700 414)">
                <path d="M-13 -6 L13 -6 L0 14Z" fill="#e5312c" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
              </g>
            </g>
            <g className="kst-star" transform={`translate(${START.x} ${START.y})`}>
              <circle r="20" className="kst-star-ring" />
              <path d="M0 -13 L3.8 -4 L13.4 -4 L5.6 1.8 L8.5 11 L0 5.5 L-8.5 11 L-5.6 1.8 L-13.4 -4 L-3.8 -4Z" fill="#ffb81c" stroke="#9a6400" strokeWidth="1.6" strokeLinejoin="round" />
            </g>

            {/* 만나는 곳 — 깃발과 둥근 자리 */}
            <g className="kst-meet" transform={`translate(${MEET.x} ${MEET.y})`}>
              <circle r="44" className="kst-meet-ring" />
              <circle r="44" className="kst-meet-pulse" />
              <g className="kst-flag" transform="translate(-50 8)">
                <path d="M0 0 V-58" stroke="#28485f" strokeWidth="3.5" strokeLinecap="round" />
                <path className="kst-flag-cloth" d="M2 -58 L34 -47 L2 -36Z" fill="#0e9f5d" />
              </g>
              <text y="72" className="kst-meet-label">만나는 곳</text>
            </g>

            {/* 4 — 기다리던 가족 */}
            <g className="kst-family" transform={`translate(${MEET.x} ${MEET.y + 20})`}>
              <g className="kst-person" transform="translate(28 0)">
                <circle cx="0" cy="-54" r="8.5" />
                <path d="M0 -44 V-20 M0 -20 L-7 0 M0 -20 L7 0 M0 -38 L-10 -26 M0 -38 L11 -50" />
              </g>
              <g className="kst-person" transform="translate(52 0)">
                <circle cx="0" cy="-51" r="8" />
                <path d="M0 -42 V-19 M0 -19 L-7 0 M0 -19 L7 0 M0 -36 L-10 -25 M0 -36 L10 -25" />
              </g>
            </g>

            {/* 아이 — 옆모습 그림 기호. 서 있다 → 몸을 낮춘다 → 만나서 손을 든다 */}
            <g ref={kid} className="kst-kid" opacity="0">
              <g transform="scale(1.3)">
              <ellipse cx="0" cy="1" rx="17" ry="5" className="kst-kid-shadow" />
              <g ref={kidStand}>
                <circle cx="2" cy="-40" r="7.5" />
                <path d="M1 -31 L0 -16 M1 -28 L-6 -19 M1 -28 L8 -20 M0 -16 L-5 0 M0 -16 L6 0" />
              </g>
              <g ref={kidLow} opacity="0">
                <circle cx="13" cy="-22" r="7.5" />
                <path d="M7 -17 L-6 -12 M5 -16 L12 -13 L16 -17 M2 -14 L8 -5" />
                <g ref={legsA}>
                  <path d="M-6 -12 L2 -6 L1 0 M-6 -12 L-10 -5 L-15 0" />
                </g>
                <g ref={legsB} opacity="0">
                  <path d="M-6 -12 L-2 -5 L-6 0 M-6 -12 L-6 -5 L-1 0" />
                </g>
              </g>
              <g ref={kidJoy} opacity="0">
                <circle cx="0" cy="-40" r="7.5" />
                <path d="M0 -31 V-16 M0 -28 L-9 -40 M0 -28 L9 -40 M0 -16 L-5 0 M0 -16 L5 0" />
              </g>
              </g>
            </g>

            {/* 도구 — 연필과 빨간 펜. 끝이 (0,0) */}
            <g ref={pencil} className="kst-tool" opacity="0">
              <g transform="rotate(-38)">
                <path d="M0 0 L14 -7 L14 7Z" fill="#e9c79c" />
                <path d="M0 0 L5 -2.5 L5 2.5Z" fill="#2c3440" />
                <rect x="14" y="-7" width="92" height="14" fill="#f7c63d" />
                <rect x="14" y="-2" width="92" height="4" fill="#e3ad1f" />
                <rect x="106" y="-7.5" width="10" height="15" fill="#c9d0d8" />
                <rect x="116" y="-7" width="13" height="14" rx="3" fill="#f39aa7" />
              </g>
            </g>
            <g ref={marker} className="kst-tool" opacity="0">
              <g transform="rotate(-38)">
                <path d="M0 0 L12 -6 L12 6Z" fill="#e5312c" />
                <rect x="12" y="-8" width="16" height="16" rx="2" fill="#3a4350" />
                <rect x="28" y="-9" width="76" height="18" rx="5" fill="#f4f6f8" />
                <rect x="40" y="-9" width="34" height="18" fill="#e5312c" />
                <rect x="104" y="-9.5" width="26" height="19" rx="6" fill="#c8102e" />
              </g>
            </g>
            </g>
          </svg>
          {/* 장면이 바뀔 때 종이 위를 한 번 스치는 빛 */}
          <span key={`sweep-${scene}`} className="k-story-sweep" />
        </div>
      </div>

      <div className="k-story-caption" data-caption-step={scene}>
        {caption && (
          <React.Fragment key={`cap-${scene}`}>
            <span className="k-story-num">
              {scene === 4 ? (
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <path d="M5 12.5 10 17 19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                scene
              )}
            </span>
            <b>{caption}</b>
            <span className="k-story-progress">
              <i style={{ animationDuration: `${SCENE_MS[scene as 1 | 2 | 3 | 4]}ms` }} />
            </span>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

function Flame({ x, y, s, late }: { x: number; y: number; s: number; late?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className={`kst-flame${late ? ' late' : ''}`}>
        <path d="M0 0 C-26 -6 -30 -34 -12 -54 C-12 -40 -4 -36 0 -40 C-4 -58 8 -74 18 -82 C14 -62 34 -50 30 -26 C28 -8 16 0 0 0Z" fill="#ff5a1f" />
        <path d="M0 -2 C-16 -6 -18 -24 -6 -36 C-4 -26 4 -26 6 -32 C6 -44 14 -52 18 -56 C18 -42 28 -32 22 -16 C18 -6 10 -2 0 -2Z" fill="#ff9d22" />
        <path d="M2 -4 C-6 -6 -8 -16 -2 -22 C0 -16 6 -18 8 -24 C12 -18 16 -12 12 -6 C10 -4 6 -4 2 -4Z" fill="#ffe27a" />
      </g>
    </g>
  );
}
