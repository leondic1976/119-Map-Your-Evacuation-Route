'use client';

/**
 * 실내 밀도 — 설계서 v1.10 §5.1 · v1.19 §4.3.
 * 코드로 만든 바닥 재질(색·법선·거칠기)·걸레받이·러그·천장등. 외부 모델은 없다.
 */
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { FloorPlan, RoomBlock, RoomKind } from '../../types/plan';
import { WALL_H } from './geometry';
import type { QualitySettings } from './quality';
import type { ViewMode } from './Scene';
import type { Surface, Surfaces } from './textures';

type FloorKind = 'wood' | 'tile' | 'terrazzo';

const SURFACE_BY_ROOM: Partial<Record<RoomKind, FloorKind>> = {
  bedroom: 'wood',
  living: 'wood',
  corridor: 'wood',
  closet: 'wood',
  kitchen: 'tile',
  bath: 'tile',
  entry: 'tile',
  balcony: 'tile',
  utility: 'tile',
  stair: 'terrazzo',
  refuge_lobby: 'terrazzo',
  elevator_hall: 'terrazzo',
  other: 'terrazzo',
};

const FLOOR_NORMAL: Record<FloorKind, THREE.Vector2> = {
  wood: new THREE.Vector2(0.55, 0.55),
  tile: new THREE.Vector2(0.7, 0.7),
  terrazzo: new THREE.Vector2(0.35, 0.35),
};

/** UV 가 칸 단위인 바닥판 — 큰 방이라고 널빤지가 늘어나지 않는다 */
function floorGeometry(w: number, h: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  return g;
}

function Floor({ room, surface, kind, shadows }: { room: RoomBlock; surface: Surface; kind: FloorKind; shadows: boolean }) {
  const w = Math.max(0.05, room.rect.w - 0.06);
  const h = Math.max(0.05, room.rect.h - 0.06);
  const geo = useMemo(() => floorGeometry(w, h), [w, h]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} position={[room.rect.x + room.rect.w / 2, 0.018, room.rect.y + room.rect.h / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadows}>
      <meshStandardMaterial
        map={surface.map}
        normalMap={surface.normalMap}
        normalScale={FLOOR_NORMAL[kind]}
        roughnessMap={surface.roughnessMap}
        roughness={1}
        metalness={0.02}
        envMapIntensity={kind === 'tile' ? 0.9 : 0.5}
      />
    </mesh>
  );
}

function Baseboards({ room }: { room: RoomBlock }) {
  if (room.wallMode === 'zone') return null;
  const { x, y, w, h } = room.rect;
  const color = '#e7e0d3';
  return (
    <group>
      <mesh position={[x + w / 2, 0.13, y + 0.045]} castShadow><boxGeometry args={[Math.max(0.05, w - 0.08), 0.22, 0.07]} /><meshStandardMaterial color={color} roughness={0.7} /></mesh>
      <mesh position={[x + w / 2, 0.13, y + h - 0.045]} castShadow><boxGeometry args={[Math.max(0.05, w - 0.08), 0.22, 0.07]} /><meshStandardMaterial color={color} roughness={0.7} /></mesh>
      <mesh position={[x + 0.045, 0.13, y + h / 2]} castShadow><boxGeometry args={[0.07, 0.22, Math.max(0.05, h - 0.08)]} /><meshStandardMaterial color={color} roughness={0.7} /></mesh>
      <mesh position={[x + w - 0.045, 0.13, y + h / 2]} castShadow><boxGeometry args={[0.07, 0.22, Math.max(0.05, h - 0.08)]} /><meshStandardMaterial color={color} roughness={0.7} /></mesh>
    </group>
  );
}

/** 러그 — 직조 결이 있는 재질에 방마다 다른 색을 입힌다 */
function Rug({ room, surface }: { room: RoomBlock; surface: Surface | null }) {
  if (room.roomKind !== 'living' && room.roomKind !== 'bedroom') return null;
  const { x, y, w, h } = room.rect;
  const rw = Math.max(0.75, Math.min(w * 0.55, 3.8));
  const rh = Math.max(0.75, Math.min(h * 0.42, 2.8));
  const color = room.roomKind === 'living' ? '#3f6f88' : '#9a6478';
  return (
    <mesh position={[x + w / 2, 0.035, y + h / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[rw, rh]} />
      {surface ? (
        <meshStandardMaterial color={color} map={surface.map} normalMap={surface.normalMap} normalScale={[0.5, 0.5]} roughnessMap={surface.roughnessMap} roughness={1} />
      ) : (
        <meshStandardMaterial color={color} roughness={0.98} />
      )}
    </mesh>
  );
}

function CeilingLight({ room, fixture }: { room: RoomBlock; fixture: boolean }) {
  const { x, y, w, h } = room.rect;
  const major = w * h >= 4;
  if (!major) return null;
  const cx = x + w / 2;
  const cz = y + h / 2;
  return (
    <group>
      {fixture && (
        <>
          <mesh position={[cx, WALL_H - 0.08, cz]} receiveShadow>
            <cylinderGeometry args={[0.32, 0.36, 0.09, 24]} />
            <meshStandardMaterial color="#f8f4e9" emissive="#ffdca0" emissiveIntensity={0.28} roughness={0.35} />
          </mesh>
          <mesh position={[cx, WALL_H - 0.14, cz]}>
            <cylinderGeometry args={[0.22, 0.3, 0.05, 24]} />
            <meshBasicMaterial color="#fff4cf" toneMapped={false} />
          </mesh>
        </>
      )}
      <pointLight position={[cx, WALL_H - 0.5, cz]} color="#ffe7bd" intensity={5.5} distance={7} decay={2} />
    </group>
  );
}

interface Props {
  plan: FloorPlan;
  quality: QualitySettings;
  view: ViewMode;
  surfaces: Surfaces | null;
}

export default function InteriorDetails({ plan, quality, view, surfaces }: Props) {
  const rooms = useMemo(() => plan.blocks.filter((block): block is RoomBlock => block.kind === 'room'), [plan]);
  const litRooms = quality.interiorLights ? rooms.filter((room) => room.rect.w * room.rect.h >= 4).slice(0, quality.detail === 'full' ? 8 : 5) : [];

  return (
    <group key={surfaces ? surfaces.id : 'plain'}>
      {surfaces && rooms.map((room) => {
        const kind = SURFACE_BY_ROOM[room.roomKind] ?? 'terrazzo';
        return <Floor key={`floor-${room.id}`} room={room} surface={surfaces[kind]} kind={kind} shadows={quality.shadows} />;
      })}
      {quality.detail !== 'minimal' && rooms.map((room) => <Baseboards key={`base-${room.id}`} room={room} />)}
      {quality.detail === 'full' && rooms.map((room) => <Rug key={`rug-${room.id}`} room={room} surface={surfaces?.rug ?? null} />)}
      {litRooms.map((room) => <CeilingLight key={`light-${room.id}`} room={room} fixture={view === 'first'} />)}
    </group>
  );
}
