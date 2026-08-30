'use client';

/**
 * 표지와 구역 표시 — 설계서 v1.4 §2.4 · FR-11.8.
 *
 *   나가는 곳   출구 위에 선 녹색 표지판
 *   안전한 곳   집 밖 만나는 곳의 녹색 원
 *   불이 난 곳  발화 칸 둘레의 붉은 테두리
 *
 * **점멸하지 않는다** (작업지침 §9-10). 겁주지 않고 알려 주기만 한다.
 * 글자는 캔버스 텍스처다 — 바깥에서 글꼴을 받아오지 않는다 (FR-11.11).
 */
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Cell, FloorPlan } from '../../types/plan';
import { isPoint } from '../../types/plan';
import { makeDiscTexture, makeLabelTexture } from './labels';

const SAFE = '#22c55e';
const DANGER = '#e0452f';

/** 늘 화면을 마주 보는 글자 판 */
function Label({ text, at, color, background, border, size = 0.62 }: { text: string; at: [number, number, number]; color?: string; background?: string; border?: string; size?: number }) {
  const built = useMemo(() => makeLabelTexture(text, { color, background, border }), [text, color, background, border]);
  useEffect(() => () => built.texture.dispose(), [built]);
  return (
    <sprite position={at} scale={[size * built.aspect, size, 1]} renderOrder={6}>
      <spriteMaterial map={built.texture} transparent depthWrite={false} depthTest={false} />
    </sprite>
  );
}

/** 달리는 사람 기호를 세운 출구 표지판 */
function ExitSign({ cell, label }: { cell: Cell; label: string }) {
  return (
    <group position={[cell.x + 0.5, 0, cell.y + 0.5]}>
      {/* 기둥 두 개와 위에 걸린 판 */}
      <mesh position={[-0.5, 2.2, 0]} castShadow>
        <boxGeometry args={[0.09, 4.4, 0.09]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
      <mesh position={[0.5, 2.2, 0]} castShadow>
        <boxGeometry args={[0.09, 4.4, 0.09]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
      <mesh position={[0, 4.5, 0]}>
        <boxGeometry args={[1.5, 0.62, 0.08]} />
        <meshStandardMaterial color={SAFE} emissive={SAFE} emissiveIntensity={0.7} />
      </mesh>
      <Label text={label} at={[0, 4.5, 0.08]} color="#ffffff" size={0.44} />
    </group>
  );
}

interface Props {
  plan: FloorPlan;
  /** 불이 붙은 칸들 */
  fireCells: Cell[];
  /** 아이가 목표로 삼는 출구 칸들 */
  exitCells: Cell[];
  /** 집 밖 만나는 곳 */
  meetingCell?: Cell;
}

export default function Markers({ plan, fireCells, exitCells, meetingCell }: Props) {
  const discTex = useMemo(() => makeDiscTexture('rgba(34,197,94,0.34)', 'rgba(34,197,94,0.9)'), []);
  useEffect(() => () => discTex.dispose(), [discTex]);

  const discGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(4.6, 4.6);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  useEffect(() => () => discGeo.dispose(), [discGeo]);

  /* 불난 칸을 감싸는 네모 하나 — 칸마다 테두리를 두르면 어지럽다 */
  const fireBounds = useMemo(() => {
    if (fireCells.length === 0) return null;
    const xs = fireCells.map((c) => c.x);
    const ys = fireCells.map((c) => c.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs) + 1;
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys) + 1;
    return { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  }, [fireCells]);

  /* 만나는 곳이 따로 없으면 도면에서 찾는다 */
  const meeting = useMemo(() => {
    if (meetingCell) return meetingCell;
    const b = plan.blocks.find((x) => isPoint(x) && x.subKind === 'meeting_point');
    return b && isPoint(b) ? b.cell : undefined;
  }, [plan, meetingCell]);

  return (
    <group>
      {exitCells.map((c) => (
        <ExitSign key={`exit-${c.x}-${c.y}`} cell={c} label="나가는 곳" />
      ))}

      {meeting && (
        <group position={[meeting.x + 0.5, 0, meeting.y + 0.5]}>
          <mesh geometry={discGeo} position={[0, 0.015, 0]} renderOrder={1}>
            <meshBasicMaterial map={discTex} transparent depthWrite={false} />
          </mesh>
          <Label text="안전한 곳" at={[0, 1.1, 0]} color="#ffffff" background="rgba(13,74,42,0.92)" border={SAFE} size={0.72} />
        </group>
      )}

      {fireBounds && (
        <group>
          {/* 붉은 테두리 — 굵기만 있고 깜빡이지 않는다 */}
          <lineSegments position={[fireBounds.cx, 0.06, fireBounds.cy]} renderOrder={4}>
            <edgesGeometry args={[new THREE.BoxGeometry(fireBounds.w, 0.02, fireBounds.h)]} />
            <lineBasicMaterial color={DANGER} transparent opacity={0.95} depthTest={false} />
          </lineSegments>
          <Label
            text="불이 난 곳"
            at={[fireBounds.cx, 1.5, fireBounds.cy]}
            color="#ffffff"
            background="rgba(96,20,12,0.92)"
            border={DANGER}
            size={0.66}
          />
        </group>
      )}
    </group>
  );
}
