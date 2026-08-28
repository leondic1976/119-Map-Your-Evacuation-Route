'use client';

/**
 * 3D 리플레이 — 설계서 v1.2 §8.
 *
 * 게임을 대신하지 않는다. 이미 끝난 판을 다시 보는 화면이다.
 * 기록된 칸을 그대로 따라가고(FR-11.3), 그때의 불·연기를 함께 재생한다(FR-11.4).
 * WebGL2 를 못 쓰면 2D 리플레이로 조용히 내려간다(FR-11.7).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReplayFrame } from '../../types/game';
import type { FloorPlan } from '../../types/plan';
import type { PlayerCharacter } from '../../types/guide';
import { PLAYER_NAME } from '../Avatar';
import { CS, PlanSvg } from '../PlanSvg';
import { CloseIcon } from '../Onboarding';
import { WALL_H, buildDoors, buildHouse, buildPerson, planExtent } from './geometry';
import { buildHazardQuads, SMOKE_STRIDE } from './smoke';
import { compile, disposeMesh, lookAt, makeMesh, mat4, multiply, perspective, updateMesh, type Mesh } from './gl';

const SOLID_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
uniform mat4 uViewProj;
out vec3 vNormal;
out vec3 vColor;
out vec3 vPos;
void main(){
  vNormal = aNormal;
  vColor = aColor;
  vPos = aPos;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

const SOLID_FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vColor;
in vec3 vPos;
uniform vec3 uLight;
uniform vec3 uFire;
uniform float uFireStrength;
out vec4 outColor;
void main(){
  vec3 n = normalize(vNormal);
  float d = max(dot(n, normalize(uLight)), 0.0);
  /* 불에서 나오는 점광 — 가까울수록 따뜻해진다 */
  vec3 toFire = uFire - vPos;
  float dist = length(toFire);
  float fire = uFireStrength / (1.0 + dist * dist * 0.5);
  vec3 warm = vec3(1.0, 0.55, 0.2) * fire;
  /* 하늘빛(찬 기운)을 조금 섞어 전부 주황으로 물들지 않게 한다 */
  vec3 sky = vec3(0.5, 0.58, 0.7) * 0.13;
  vec3 lit = vColor * (0.66 + 0.4 * d) + sky + warm;
  outColor = vec4(lit, 1.0);
}`;

const QUAD_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aColor;
layout(location=2) in float aAlpha;
uniform mat4 uViewProj;
out vec3 vColor;
out float vAlpha;
void main(){
  vColor = aColor;
  vAlpha = aAlpha;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

const QUAD_FS = `#version 300 es
precision highp float;
in vec3 vColor;
in float vAlpha;
out vec4 outColor;
void main(){
  outColor = vec4(vColor, vAlpha);
}`;

export type ViewMode = 'follow' | 'top';

interface Props {
  plan: FloorPlan;
  frames: ReplayFrame[];
  character: PlayerCharacter;
  tickSeconds: number;
  outcome: 'success' | 'failed';
  onClose: () => void;
}

const SPEEDS = [0.5, 1, 2];
const TONE: Record<PlayerCharacter, number[]> = {
  ilgu: [0.77, 0.54, 0.37],
  yeongi: [0.78, 0.06, 0.18],
  ungi: [0.06, 0.24, 0.41],
  firefighter: [0.94, 0.71, 0.16],
};

export default function Replay3D({ plan, frames, character, tickSeconds, outcome, onClose }: Props) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [view, setView] = useState<ViewMode>('follow');
  const [gone, setGone] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<Ctx | null>(null);
  const frame = frames[Math.min(i, frames.length - 1)];

  /* 재생 */
  useEffect(() => {
    if (!playing) return;
    const step = Math.max(60, (tickSeconds * 1000) / speed / 4);
    const t = setInterval(() => {
      setI((v) => {
        if (v + 1 >= frames.length) {
          setPlaying(false);
          return frames.length - 1;
        }
        return v + 1;
      });
    }, step);
    return () => clearInterval(t);
  }, [playing, speed, frames.length, tickSeconds]);

  /* WebGL 준비 — 안 되면 2D 로 내려간다 */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = setup(canvas, plan);
    if (!ctx) {
      setGone(true);
      return;
    }
    glRef.current = ctx;
    return () => {
      dispose(ctx);
      glRef.current = null;
    };
  }, [plan]);

  /* 한 컷 그리기 */
  useEffect(() => {
    const ctx = glRef.current;
    if (!ctx || !frame) return;
    draw(ctx, plan, frame, view, TONE[character] ?? TONE.ilgu);
  }, [frame, view, plan, character]);

  const seconds = Math.round((frame?.tick ?? 0) * tickSeconds);
  const caption = useMemo(() => captionOf(frame, outcome, i === frames.length - 1), [frame, outcome, i, frames.length]);

  const jump = useCallback((v: number) => {
    setPlaying(false);
    setI(v);
  }, []);

  return (
    <div className="k-replay" role="dialog" aria-modal="true" aria-label="3D 로 다시 보기" data-coach="kids-replay3d">
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
          <canvas ref={canvasRef} className="k-replay-canvas" />
        )}
        <div className="k-replay-caption" role="status">
          <b className="num">{seconds}초</b>
          <span>{caption}</span>
        </div>
        <button type="button" className="k-x k-replay-close" onClick={onClose} aria-label="닫기">
          <CloseIcon />
        </button>
      </div>

      <div className="k-replay-bar">
        <button type="button" className="k-tb primary" data-coach="kids-replay-play" onClick={() => setPlaying((v) => !v)}>
          {playing ? '멈춤' : '재생'}
        </button>
        <button type="button" className="k-tb" onClick={() => jump(0)}>
          처음으로
        </button>
        <input
          className="k-replay-range"
          type="range"
          min={0}
          max={Math.max(0, frames.length - 1)}
          value={i}
          aria-label="시간"
          onChange={(e) => jump(Number(e.target.value))}
        />
        <div className="k-seg dark" role="group" aria-label="빠르기">
          {SPEEDS.map((s) => (
            <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>
              {s}배
            </button>
          ))}
        </div>
        <div className="k-seg dark" role="group" aria-label="시점">
          <button type="button" aria-pressed={view === 'follow'} data-view="follow" onClick={() => setView('follow')}>
            따라가기
          </button>
          <button type="button" aria-pressed={view === 'top'} data-view="top" onClick={() => setView('top')}>
            위에서
          </button>
        </div>
        <span className="k-spacer" />
        <button type="button" className="k-tb" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}

/** 자막 — 그때 무슨 일이 있었는지 (FR-11.6) */
function captionOf(frame: ReplayFrame | undefined, outcome: 'success' | 'failed', last: boolean): string {
  if (!frame) return '';
  if (frame.events.includes('reachedGoal')) return '밖으로 나왔다!';
  if (frame.events.includes('closedDoor')) return '문을 닫고 지나갔다.';
  if (frame.events.includes('touchedHotDoor')) return '문이 뜨거웠다. 열지 않았다.';
  if (frame.posture === 'crouch') return '몸을 낮춰 연기를 피했다.';
  if (last) return outcome === 'success' ? '무사히 나왔다.' : '여기서 멈췄다. 다시 해 보자.';
  if (frame.tick === 0) return '불이 났다. 여기서 출발한다.';
  return '나가는 길을 따라가는 중이다.';
}

/** 2D 로 내려갈 때 쓰는 위험장 — 기록한 바이트를 되돌린다 */
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

/* ------------------------------------------------------------------ */
/* WebGL                                                               */
/* ------------------------------------------------------------------ */

interface Ctx {
  gl: WebGL2RenderingContext;
  solid: WebGLProgram;
  quad: WebGLProgram;
  house: Mesh;
  doors: Mesh;
  person: Mesh;
  haze: { vao: WebGLVertexArrayObject | null; buffer: WebGLBuffer | null; count: number };
  canvas: HTMLCanvasElement;
}

function setup(canvas: HTMLCanvasElement, plan: FloorPlan): Ctx | null {
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
  } catch {
    return null;
  }
  if (!gl) return null;
  const solid = compile(gl, SOLID_VS, SOLID_FS);
  const quad = compile(gl, QUAD_VS, QUAD_FS);
  if (!solid || !quad) return null;

  const house = makeMesh(gl, buildHouse(plan));
  const doors = makeMesh(gl, new Float32Array(0));
  const person = makeMesh(gl, new Float32Array(0));

  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const b = SMOKE_STRIDE * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, b, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, b, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, b, 24);
  gl.bindVertexArray(null);

  return { gl, solid, quad, house, doors, person, haze: { vao, buffer, count: 0 }, canvas };
}

function dispose(ctx: Ctx): void {
  const { gl } = ctx;
  disposeMesh(gl, ctx.house);
  disposeMesh(gl, ctx.doors);
  disposeMesh(gl, ctx.person);
  if (ctx.haze.vao) gl.deleteVertexArray(ctx.haze.vao);
  if (ctx.haze.buffer) gl.deleteBuffer(ctx.haze.buffer);
  gl.deleteProgram(ctx.solid);
  gl.deleteProgram(ctx.quad);
}

function draw(ctx: Ctx, plan: FloorPlan, frame: ReplayFrame, view: ViewMode, tone: number[]): void {
  const { gl, canvas } = ctx;
  /* 해상도 — 리플레이는 실시간 입력이 없으므로 화질을 택한다 (설계서 v1.2 §8.4) */
  const dpr = Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  gl.viewport(0, 0, w, h);
  gl.clearColor(0.06, 0.08, 0.12, 1);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const ext = planExtent(plan);
  const cx = (ext.minX + ext.maxX) / 2;
  const cz = (ext.minZ + ext.maxZ) / 2;
  const span = Math.max(ext.maxX - ext.minX, ext.maxZ - ext.minZ);

  const px = frame.cell.x + 0.5;
  const pz = frame.cell.y + 0.5;
  /* 위에서 보기는 집 전체가 들어와야 하고, 따라가기는 벽 위로 넘겨다본다 */
  const eye =
    view === 'top'
      ? [cx, span * 1.55, cz + span * 0.82]
      : [px - 3.6, 13.5, pz + 7.4];
  const at = view === 'top' ? [cx, 0, cz] : [px, 0.8, pz];
  const proj = perspective(view === 'top' ? 40 : 46, w / h, 0.3, 200);
  const viewM = lookAt(eye, at, [0, 1, 0]);
  const vp = multiply(proj, viewM);

  /* 불의 위치 — 가장 센 칸을 점광으로 삼는다 */
  let fireI = -1;
  let fireV = 0;
  for (let k = 0; k < frame.primary.length; k += 1) {
    if (frame.primary[k] > fireV) {
      fireV = frame.primary[k];
      fireI = k;
    }
  }
  const fire = fireI >= 0 ? [(fireI % plan.grid.width) + 0.5, 1.2, Math.floor(fireI / plan.grid.width) + 0.5] : [0, -50, 0];

  /* 1) 불투명 — 집·문·사람 */
  gl.useProgram(ctx.solid);
  gl.uniformMatrix4fv(gl.getUniformLocation(ctx.solid, 'uViewProj'), false, vp);
  gl.uniform3f(gl.getUniformLocation(ctx.solid, 'uLight'), 0.38, 0.9, 0.22);
  gl.uniform3f(gl.getUniformLocation(ctx.solid, 'uFire'), fire[0], fire[1], fire[2]);
  gl.uniform1f(gl.getUniformLocation(ctx.solid, 'uFireStrength'), (fireV / 255) * 0.9);

  drawMesh(gl, ctx.house);
  updateMesh(gl, ctx.doors, buildDoors(plan, frame.doorState));
  drawMesh(gl, ctx.doors);
  updateMesh(gl, ctx.person, buildPerson(frame.cell, frame.posture === 'crouch', tone));
  drawMesh(gl, ctx.person);

  /* 2) 반투명 — 연기·불. 뒤에서 앞으로 그리지 않고 깊이 쓰기를 끈다 */
  const right = [viewM[0], viewM[4], viewM[8]];
  const up = [viewM[1], viewM[5], viewM[9]];
  const quads = buildHazardQuads(plan.grid, frame, right, up);
  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.haze.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, quads, gl.DYNAMIC_DRAW);
  ctx.haze.count = quads.length / SMOKE_STRIDE;

  gl.useProgram(ctx.quad);
  gl.uniformMatrix4fv(gl.getUniformLocation(ctx.quad, 'uViewProj'), false, vp);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.bindVertexArray(ctx.haze.vao);
  gl.drawArrays(gl.TRIANGLES, 0, ctx.haze.count);
  gl.bindVertexArray(null);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

function drawMesh(gl: WebGL2RenderingContext, mesh: Mesh): void {
  if (mesh.count === 0) return;
  gl.bindVertexArray(mesh.vao);
  gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  gl.bindVertexArray(null);
}

export { WALL_H, CS, mat4 };
