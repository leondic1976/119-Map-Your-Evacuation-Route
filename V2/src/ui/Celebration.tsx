/**
 * 대피 성공 축하 — 가족을 만나면 화면 가득 불꽃놀이가 벌어진다(대장 #137).
 *
 * 폭죽이 아래에서 솟아올라 터지고, 불씨가 꼬리를 끌며 떨어진다. 둥근 꽃 · 고리 · 버들 · 두 겹 꽃 · 반짝이가 섞여 나오고,
 * 양쪽 아래에서는 불꽃 분수가 솟는다. 그 위로 색종이가 내리고 「대피 성공!」이 햇살 무늬와 함께 뜬다.
 * 그림은 전부 코드로 그린다(캔버스와 SVG). 바깥 자산이 없다.
 *
 * 화면 전체를 번쩍이지 않는다. 밝아지는 것은 작은 불씨뿐이고 배경은 천천히 어두워졌다가 그대로 머문다.
 * 움직임을 줄이도록 설정한 기기에서는 다 터진 그림 한 장으로 멈춘다. 소리는 `host.cheer()` 가 낸다.
 */
import { useEffect, useRef } from 'react';

const COLORS = ['#ffb347', '#6fe08f', '#6cc3ff', '#ffe066', '#ff7fbf', '#b99cff', '#5fe3e0', '#ffffff'];
const PAPER = ['#f59a23', '#3e9d5d', '#2f7fbf', '#e3a62a', '#d9558c', '#8a5fc4', '#4fb7c9'];

/** 같은 그림이 나오도록 정해 둔 난수 — 색종이와 멈춘 그림에 쓴다 */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 남은 삶(초)과 처음 삶 */
  life: number;
  span: number;
  color: string;
  size: number;
  /** 공기에 밀려 느려지는 정도와 떨어지는 힘 */
  drag: number;
  fall: number;
  /** 끝에 가서 반짝인다 */
  twinkle: boolean;
}

interface Rocket {
  x: number;
  y: number;
  vy: number;
  vx: number;
  top: number;
  color: string;
  kind: number;
}

/** 멈춘 그림에 쓰는 터진 꽃 자리 */
const STILL = [
  { x: 0.17, y: 0.25, r: 0.15 },
  { x: 0.83, y: 0.22, r: 0.17 },
  { x: 0.5, y: 0.16, r: 0.2 },
  { x: 0.3, y: 0.42, r: 0.11 },
  { x: 0.71, y: 0.44, r: 0.12 },
  { x: 0.08, y: 0.55, r: 0.09 },
  { x: 0.93, y: 0.56, r: 0.1 },
];

function runFireworks(canvas: HTMLCanvasElement, reduced: boolean): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;
  let w = 0;
  let h = 0;
  let ratio = 1;
  const resize = () => {
    ratio = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * ratio));
    canvas.height = Math.max(1, Math.round(h * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  resize();

  const sparks: Spark[] = [];
  const rockets: Rocket[] = [];
  let bursts = 0;
  const pick = (): string => COLORS[Math.floor(Math.random() * COLORS.length)]!;

  /** 한 송이가 터진다. kind 에 따라 모양이 다르다 */
  const burst = (x: number, y: number, color: string, kind: number, scale = 1) => {
    bursts += 1;
    canvas.dataset.bursts = String(bursts);
    const base = Math.min(w, h) * 0.34 * scale;
    const second = pick();
    const add = (angle: number, speed: number, c: string, opts: Partial<Spark> = {}) => {
      if (sparks.length > 1500) return;
      const span = 1.1 + Math.random() * 0.7;
      sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: span, span, color: c, size: 2.2, drag: 1.7, fall: 70, twinkle: false, ...opts });
    };
    if (kind === 1) {
      // 고리 — 가지런한 동그라미 둘
      for (let i = 0; i < 46; i++) add((i / 46) * Math.PI * 2, base * 1.05, color, { drag: 1.5 });
      for (let i = 0; i < 26; i++) add((i / 26) * Math.PI * 2, base * 0.55, second, { drag: 1.5, size: 2 });
    } else if (kind === 2) {
      // 버들 — 길게 늘어져 떨어진다
      for (let i = 0; i < 70; i++) add(Math.random() * Math.PI * 2, base * (0.35 + Math.random() * 0.75), '#ffd98a', { span: 2.2 + Math.random(), life: 2.2 + Math.random(), drag: 1.25, fall: 150, size: 1.8 });
    } else if (kind === 3) {
      // 반짝이 — 흩어져 깜박이며 사라진다
      for (let i = 0; i < 90; i++) add(Math.random() * Math.PI * 2, base * Math.random() * 1.05, i % 3 ? color : '#ffffff', { twinkle: true, size: 1.9, drag: 2.1 });
    } else {
      // 둥근 꽃 — 두 겹
      for (let i = 0; i < 84; i++) add(Math.random() * Math.PI * 2, base * (0.82 + Math.random() * 0.28), color);
      for (let i = 0; i < 40; i++) add(Math.random() * Math.PI * 2, base * (0.3 + Math.random() * 0.25), second, { size: 2.6 });
    }
  };

  const launch = () => {
    const x = w * (0.1 + Math.random() * 0.8);
    rockets.push({ x, y: h + 10, vx: (Math.random() - 0.5) * 40, vy: -(h * (0.75 + Math.random() * 0.25)), top: h * (0.12 + Math.random() * 0.34), color: pick(), kind: Math.floor(Math.random() * 4) });
  };

  /** 양쪽 아래에서 솟는 불꽃 분수 */
  const fountain = (side: number) => {
    const x = side < 0 ? w * 0.06 : w * 0.94;
    for (let i = 0; i < 3; i++) {
      const angle = -Math.PI / 2 + side * -0.28 + (Math.random() - 0.5) * 0.5;
      const speed = h * (0.5 + Math.random() * 0.35);
      const span = 0.9 + Math.random() * 0.5;
      sparks.push({ x, y: h, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: span, span, color: i ? '#ffe066' : '#ffffff', size: 1.8, drag: 0.9, fall: h * 0.9, twinkle: false });
    }
  };

  const draw = (dt: number) => {
    // 지나간 자리를 조금씩 지워 꼬리를 남긴다
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]!;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.vy += h * 0.55 * dt;
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath();
      ctx.arc(r.x, r.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
      if (r.y <= r.top || r.vy >= -30) {
        burst(r.x, r.y, r.color, r.kind);
        rockets.splice(i, 1);
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]!;
      s.life -= dt;
      if (s.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      const slow = Math.exp(-s.drag * dt);
      s.vx *= slow;
      s.vy = s.vy * slow + s.fall * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const left = s.life / s.span;
      const shine = s.twinkle ? (Math.sin(s.life * 34 + s.x) > 0 ? 1 : 0.25) : 1;
      ctx.globalAlpha = Math.min(1, left * 1.6) * shine;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * (0.5 + left * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  if (reduced) {
    // 멈춘 그림 — 다 터진 꽃을 한 번 그려 둔다
    const random = seeded(7);
    ctx.globalCompositeOperation = 'lighter';
    STILL.forEach((b, i) => {
      const color = COLORS[i % COLORS.length]!;
      const r = Math.min(w, h) * b.r * 1.5;
      for (let n = 0; n < 90; n++) {
        const angle = random() * Math.PI * 2;
        const far = r * (0.25 + random() * 0.75);
        ctx.globalAlpha = 0.35 + random() * 0.6;
        ctx.fillStyle = n % 4 ? color : '#ffffff';
        ctx.beginPath();
        ctx.arc(w * b.x + Math.cos(angle) * far, h * b.y + Math.sin(angle) * far + far * 0.12, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
    canvas.dataset.bursts = String(STILL.length);
    return () => undefined;
  }

  let raf = 0;
  let last = performance.now();
  let clock = 0;
  let nextRocket = 0;
  let nextFountain = 0.4;
  // 시작하자마자 가운데에서 세 송이가 한꺼번에 터진다
  burst(w * 0.5, h * 0.3, '#ffe066', 0, 1.25);
  burst(w * 0.24, h * 0.36, pick(), 1);
  burst(w * 0.76, h * 0.36, pick(), 3);
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    // 처음 여덟 초는 쉴 새 없이, 그 뒤로는 드문드문 이어진다
    const gap = clock < 8 ? 0.28 : 0.95;
    if (clock >= nextRocket) {
      launch();
      if (clock < 8 && Math.random() < 0.45) launch();
      nextRocket = clock + gap * (0.6 + Math.random() * 0.8);
    }
    if (clock >= nextFountain && (clock % 5 < 2.6 || clock < 4)) {
      fountain(-1);
      fountain(1);
      nextFountain = clock + 0.03;
    }
    draw(dt);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  window.addEventListener('resize', resize);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
}

export function Celebration({ title = '대피 성공!' }: { title?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    return runFireworks(canvas.current, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  const random = seeded(119);
  const confetti = Array.from({ length: 90 }, (_, i) => ({
    x: random() * 100,
    w: 9 + random() * 11,
    h: 14 + random() * 16,
    color: PAPER[i % PAPER.length]!,
    delay: random() * 4,
    dur: 3.2 + random() * 3,
    spin: (random() - 0.5) * 900,
    sway: (random() - 0.5) * 160,
    round: i % 5 === 0,
  }));
  return (
    <div className="celebrate" data-testid="celebrate" aria-hidden="true">
      <div className="celebrate-night" />
      <canvas ref={canvas} className="celebrate-fire" data-testid="celebrate-fire" />
      <div className="celebrate-confetti">
        {confetti.map((c, i) => (
          <i key={i} style={{ left: `${c.x}%`, width: c.w, height: c.round ? c.w : c.h, borderRadius: c.round ? '50%' : 3, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, ['--spin' as string]: `${c.spin}deg`, ['--sway' as string]: `${c.sway}px` }} />
        ))}
      </div>
      <div className="celebrate-banner">
        <svg className="celebrate-rays" viewBox="-100 -100 200 200" focusable="false">
          {Array.from({ length: 16 }, (_, i) => (
            <path key={i} transform={`rotate(${i * 22.5})`} d="M0 0L-9-100H9Z" fill={i % 2 ? '#ffe08a' : '#ffd15c'} />
          ))}
        </svg>
        <span className="celebrate-stars">
          {[0, 1, 2].map((i) => (
            <svg key={i} viewBox="-12 -12 24 24" width="38" height="38" style={{ animationDelay: `${0.5 + i * 0.18}s` }} focusable="false">
              <path d="M0-11 3.2-3.6 11-3.4 4.9 1.6 7 9.2 0 4.8-7 9.2-4.9 1.6-11-3.4-3.2-3.6Z" fill="#ffd15c" stroke="#33363b" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          ))}
        </span>
        <b>{title}</b>
      </div>
      <div className="celebrate-friends">
        <img src="./art/yeongi_happy.webp" alt="" />
        <img src="./art/ilgu_happy.webp" alt="" />
        <img src="./art/ungi_happy.webp" alt="" />
      </div>
    </div>
  );
}
