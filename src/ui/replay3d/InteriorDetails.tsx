'use client';

/** 코드로 만든 바닥 무늬·걸레받이·러그·천장등 — 외부 모델 없이 실내 밀도를 높인다. */
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { FloorPlan, RoomBlock, RoomKind } from '../../types/plan';
import { WALL_H } from './geometry';
import type { QualitySettings } from './quality';
import type { ViewMode } from './Scene';

type Surface = 'wood' | 'tile' | 'terrazzo';

const SURFACE_BY_ROOM: Partial<Record<RoomKind, Surface>> = {
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

function makePattern(kind: Surface, size: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  if (kind === 'wood') {
    ctx.fillStyle = '#b98d5e';
    ctx.fillRect(0, 0, size, size);
    const plank = Math.max(18, Math.floor(size / 9));
    ctx.lineWidth = Math.max(1, size / 256);
    for (let y = 0; y <= size; y += plank) {
      ctx.strokeStyle = 'rgba(72,43,24,.30)';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
      const offset = Math.floor(y / plank) % 2 ? size * 0.42 : size * 0.18;
      ctx.beginPath(); ctx.moveTo(offset, y); ctx.lineTo(offset, Math.min(size, y + plank)); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,235,204,.20)';
      ctx.beginPath(); ctx.moveTo(0, y + 2); ctx.lineTo(size, y + 2); ctx.stroke();
    }
  } else if (kind === 'tile') {
    ctx.fillStyle = '#d6d2c6';
    ctx.fillRect(0, 0, size, size);
    const tile = Math.max(28, Math.floor(size / 6));
    ctx.strokeStyle = 'rgba(80,91,98,.28)';
    ctx.lineWidth = Math.max(2, size / 170);
    for (let x = 0; x <= size; x += tile) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke(); }
    for (let y = 0; y <= size; y += tile) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke(); }
  } else {
    ctx.fillStyle = '#aaa9a4';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < Math.floor(size * 1.8); i += 1) {
      const x = (i * 73) % size;
      const y = (i * 151 + 17) % size;
      const c = i % 3 === 0 ? '#e8e2d8' : i % 3 === 1 ? '#777d82' : '#c58c72';
      ctx.fillStyle = c;
      ctx.fillRect(x, y, Math.max(1, size / 180), Math.max(1, size / 180));
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.5, 3.5);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
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

function Rug({ room }: { room: RoomBlock }) {
  if (room.roomKind !== 'living' && room.roomKind !== 'bedroom') return null;
  const { x, y, w, h } = room.rect;
  const rw = Math.max(0.75, Math.min(w * 0.55, 3.8));
  const rh = Math.max(0.75, Math.min(h * 0.42, 2.8));
  const color = room.roomKind === 'living' ? '#315f77' : '#8e596a';
  return (
    <mesh position={[x + w / 2, 0.035, y + h / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[rw, rh]} />
      <meshStandardMaterial color={color} roughness={0.98} />
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
}

export default function InteriorDetails({ plan, quality, view }: Props) {
  const rooms = useMemo(() => plan.blocks.filter((block): block is RoomBlock => block.kind === 'room'), [plan]);
  const textures = useMemo(() => {
    if (!quality.textureSize) return null;
    return {
      wood: makePattern('wood', quality.textureSize),
      tile: makePattern('tile', quality.textureSize),
      terrazzo: makePattern('terrazzo', quality.textureSize),
    };
  }, [quality.textureSize]);

  useEffect(() => () => {
    if (!textures) return;
    Object.values(textures).forEach((texture) => texture.dispose());
  }, [textures]);

  const litRooms = quality.interiorLights ? rooms.filter((room) => room.rect.w * room.rect.h >= 4).slice(0, quality.detail === 'full' ? 8 : 5) : [];

  return (
    <group>
      {textures && rooms.map((room) => {
        const surface = SURFACE_BY_ROOM[room.roomKind] ?? 'terrazzo';
        return (
          <mesh
            key={`floor-${room.id}`}
            position={[room.rect.x + room.rect.w / 2, 0.018, room.rect.y + room.rect.h / 2]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow={quality.shadows}
          >
            <planeGeometry args={[Math.max(0.05, room.rect.w - 0.06), Math.max(0.05, room.rect.h - 0.06)]} />
            <meshStandardMaterial map={textures[surface]} roughness={surface === 'wood' ? 0.68 : 0.88} metalness={0.01} />
          </mesh>
        );
      })}
      {quality.detail !== 'minimal' && rooms.map((room) => <Baseboards key={`base-${room.id}`} room={room} />)}
      {quality.detail === 'full' && rooms.map((room) => <Rug key={`rug-${room.id}`} room={room} />)}
      {litRooms.map((room) => <CeilingLight key={`light-${room.id}`} room={room} fixture={view === 'first'} />)}
    </group>
  );
}
