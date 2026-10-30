'use client';

/**
 * 장면 — 설계서 v1.4 §2 · v1.19 §4.
 *
 * 집 · 문 · 아이 · 불연기 · 빛나는 길 · 표지 · 집 밖을 한자리에 모으고,
 * 시점에 따라 카메라를 옮긴다.
 *
 * 집을 세우는 정점은 `geometry.ts` 가 그대로 만든다 (설계서 v1.4 §1.1).
 * 라이브러리를 바꿨다고 벽 두께와 개구부 규칙까지 다시 쓸 이유가 없다.
 * v1.19 에서 재질이 달라졌다 — 벽·가구·유리를 나눠 받고, 절차형 법선 맵과 하늘 환경광을 입힌다.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { SoftShadows } from '@react-three/drei';
import * as THREE from 'three';
import type { Cell, FloorPlan } from '../../types/plan';
import type { ReplayFrame } from '../../types/game';
import { WALL_H, buildCeiling, buildDoors, buildHouse, planExtent } from './geometry';
import { interleavedGeometry } from './bridge';
import Avatar3D, { FirstPersonHands3D } from './Avatar3D';
import RoutePath, { TrailPath } from './RoutePath';
import Markers from './Markers';
import Outside from './Outside';
import SkyDome, { SUN_DIRECTION } from './Sky';
import Hazard from './Hazard';
import { prefersReducedMotion, type QualitySettings } from './quality';
import InteriorDetails from './InteriorDetails';
import { makeSurfacesAsync, repeatSurface, type Surfaces } from './textures';

export type ViewMode = 'dollhouse' | 'follow' | 'first';

export interface Layers {
  route: boolean;
  trail: boolean;
  hazard: boolean;
  scenery: boolean;
}

interface Props {
  plan: FloorPlan;
  frame: ReplayFrame;
  /** 앞으로 올 몇 컷 — 진행 방향을 잡는 데 쓴다 */
  ahead: ReplayFrame[];
  /** 여기까지 지나온 칸 */
  trail: Cell[];
  view: ViewMode;
  character: string;
  playing: boolean;
  primaryRoute: Cell[];
  alternateRoute: Cell[];
  exitCells: Cell[];
  layers: Layers;
  quality: QualitySettings;
  /** 끌어서 둘러본 각도 */
  orbit: { yaw: number; pitch: number; zoom: number };
}

/** 한 칸을 60cm 로 보므로 아이 눈높이는 대략 이 값이다 */
/** v1.16: 초등학생 전신 높이에 맞춘 눈높이. */
export const CHILD_EYE_STAND = 1.72;
export const CHILD_EYE_CROUCH = 0.92;

/**
 * 집 전체 시점에서 벽을 잘라 내는 높이.
 * 벽이 온전히 서 있으면 45° 로 내려다볼 때 안쪽 바닥이 가려져 길이 보이지 않는다.
 * 목표 그림처럼 허리께에서 자른다 (설계서 v1.4 §2.1).
 */
const CUT_Y = WALL_H * 0.52;

const PLASTER_NORMAL = new THREE.Vector2(0.35, 0.35);
const WOOD_NORMAL = new THREE.Vector2(0.5, 0.5);

/**
 * 재질 한 벌 — 화질(텍스처 크기)이 바뀔 때만 다시 굽는다. 한 장씩 프레임을 양보하며 구우므로
 * 열리는 순간 화면이 멎지 않고, 다 구워질 때까지는 정점 색으로 보인다.
 * 되풀이 수는 여기서 한 번에 정한다. 모든 지오메트리의 UV 가 칸 단위라 "한 무늬가 몇 칸"으로 읽힌다.
 */
function useSurfaces(size: QualitySettings['textureSize']): Surfaces | null {
  const [surfaces, setSurfaces] = useState<Surfaces | null>(null);
  useEffect(() => {
    if (!size) {
      setSurfaces(null);
      return;
    }
    let cancelled = false;
    let built: Surfaces | null = null;
    void makeSurfacesAsync(size, () => cancelled).then((s) => {
      if (!s) return;
      if (cancelled) {
        s.dispose();
        return;
      }
      repeatSurface(s.wood, 1 / 3);
      repeatSurface(s.tile, 1 / 2);
      repeatSurface(s.terrazzo, 1 / 2);
      repeatSurface(s.plaster, 1 / 2);
      repeatSurface(s.furniture, 1 / 1.5);
      repeatSurface(s.roof, 1 / 2.5);
      built = s;
      setSurfaces(s);
    });
    return () => {
      cancelled = true;
      built?.dispose();
      setSurfaces(null);
    };
  }, [size]);
  return surfaces;
}

function House({
  plan,
  doorState,
  shadows,
  cutaway,
  surfaces,
}: {
  plan: FloorPlan;
  doorState: Record<string, 'open' | 'closed'>;
  shadows: boolean;
  cutaway: boolean;
  surfaces: Surfaces | null;
}) {
  const parts = useMemo(() => buildHouse(plan), [plan]);
  const walls = useMemo(() => interleavedGeometry(parts.walls), [parts]);
  const furniture = useMemo(() => interleavedGeometry(parts.furniture), [parts]);
  const glass = useMemo(() => interleavedGeometry(parts.glass), [parts]);
  const doors = useMemo(() => interleavedGeometry(buildDoors(plan, doorState)), [plan, doorState]);
  const clip = useMemo(() => [new THREE.Plane(new THREE.Vector3(0, -1, 0), CUT_Y)], []);
  const planes = cutaway ? clip : null;
  useEffect(() => () => walls.dispose(), [walls]);
  useEffect(() => () => furniture.dispose(), [furniture]);
  useEffect(() => () => glass.dispose(), [glass]);
  useEffect(() => () => doors.dispose(), [doors]);
  /* 법선 맵이 생기고 없어지면 셰이더가 달라진다 — 재질을 새로 만들게 열쇠를 바꾼다 */
  const key = surfaces ? surfaces.id : 'plain';
  return (
    <group key={key}>
      {/*
        * 양면으로 그린다. 정점의 감김 방향이 한결같지 않아 앞면만 그리면
        * 벽이 줄무늬처럼 뚫려 보인다 — 옛 렌더러도 뒷면 컬링을 켜지 않았다.
        */}
      <mesh geometry={walls} castShadow={shadows} receiveShadow={shadows}>
        <meshStandardMaterial
          vertexColors
          roughness={0.88}
          metalness={0.02}
          normalMap={surfaces?.plaster.normalMap ?? null}
          normalScale={PLASTER_NORMAL}
          envMapIntensity={0.5}
          side={THREE.DoubleSide}
          clippingPlanes={planes}
          clipShadows
        />
      </mesh>
      <mesh geometry={furniture} castShadow={shadows} receiveShadow={shadows}>
        <meshStandardMaterial
          vertexColors
          roughness={0.58}
          metalness={0.06}
          normalMap={surfaces?.furniture.normalMap ?? null}
          normalScale={WOOD_NORMAL}
          envMapIntensity={0.8}
          side={THREE.DoubleSide}
          clippingPlanes={planes}
          clipShadows
        />
      </mesh>
      <mesh geometry={doors} castShadow={shadows} receiveShadow={shadows}>
        <meshStandardMaterial
          vertexColors
          roughness={0.52}
          metalness={0.04}
          normalMap={surfaces?.furniture.normalMap ?? null}
          normalScale={WOOD_NORMAL}
          envMapIntensity={0.8}
          side={THREE.DoubleSide}
          clippingPlanes={planes}
          clipShadows
        />
      </mesh>
      {/* 유리 — 하늘을 비치는 물리 재질. 뒤가 비쳐야 창이다 */}
      <mesh geometry={glass} renderOrder={5}>
        <meshPhysicalMaterial
          color="#cfe6f3"
          transparent
          opacity={0.42}
          roughness={0.06}
          metalness={0}
          clearcoat={1}
          clearcoatRoughness={0.05}
          envMapIntensity={1.4}
          side={THREE.DoubleSide}
          depthWrite={false}
          clippingPlanes={planes}
        />
      </mesh>
    </group>
  );
}

/** 1인칭·뒤따라가기에서는 천장을 보여 실제 실내 높이와 조명감을 살린다. */
function Ceiling({ plan, shadows, surfaces }: { plan: FloorPlan; shadows: boolean; surfaces: Surfaces | null }) {
  const ceiling = useMemo(() => interleavedGeometry(buildCeiling(plan)), [plan]);
  useEffect(() => () => ceiling.dispose(), [ceiling]);
  /* 천장이 해를 막아야 실내가 실내답다 — 그림자를 드리우고 천장등·환경광이 안을 비춘다 */
  return (
    <mesh geometry={ceiling} castShadow={shadows} receiveShadow={shadows} key={surfaces ? surfaces.id : 'plain'}>
      <meshStandardMaterial vertexColors roughness={0.94} metalness={0} normalMap={surfaces?.plaster.normalMap ?? null} normalScale={PLASTER_NORMAL} side={THREE.DoubleSide} envMapIntensity={0.5} />
    </mesh>
  );
}

/**
 * 카메라 — 시점마다 다른 자리에서 집을 본다.
 * 갑자기 튀지 않게 늘 지금 자리에서 목표 자리로 부드럽게 따라간다.
 */
function Rig({ plan, frame, ahead, view, orbit }: { plan: FloorPlan; frame: ReplayFrame; ahead: ReplayFrame[]; view: ViewMode; orbit: Props['orbit'] }) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3());
  const want = useRef(new THREE.Vector3());
  const extent = useMemo(() => planExtent(plan), [plan]);

  /* 진행 방향 — 한 컷만 보면 벽을 마주 보게 된다. 앞의 몇 컷을 모아 잡는다 */
  const heading = useMemo(() => {
    const next = ahead.find((f) => f.cell.x !== frame.cell.x || f.cell.y !== frame.cell.y);
    if (!next) return new THREE.Vector3(0, 0, 1);
    return new THREE.Vector3(next.cell.x - frame.cell.x, 0, next.cell.y - frame.cell.y).normalize();
  }, [frame, ahead]);

  useFrame((_, delta) => {
    const me = new THREE.Vector3(frame.cell.x + 0.5, 0, frame.cell.y + 0.5);
    const eye = frame.posture === 'crouch' ? CHILD_EYE_CROUCH : CHILD_EYE_STAND;
    const cx = (extent.minX + extent.maxX) / 2;
    const cz = (extent.minZ + extent.maxZ) / 2;
    const span = Math.max(extent.maxX - extent.minX, extent.maxZ - extent.minZ);

    const turnedHeading = heading.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit.yaw);
    if (view === 'first') {
      want.current.set(me.x, eye, me.z);
      target.current.copy(me).add(turnedHeading.multiplyScalar(4)).setY(eye - Math.sin(orbit.pitch) * 3.2);
    } else if (view === 'follow') {
      /* 캐릭터 전신과 주변 길이 함께 보이는 3인칭 게임 거리. 벽은 아래 장면에서 컷어웨이한다. */
      const back = turnedHeading.multiplyScalar(-4 / orbit.zoom);
      want.current.set(me.x + back.x, 2.72 + orbit.pitch * 1.65, me.z + back.z);
      target.current.copy(me).setY(0.98);
    } else {
      /*
       * 집 전체 — 45° 비스듬히 내려다본다 (설계서 v1.4 §2.1).
       * 끌면 집을 중심으로 공전하고, pitch 는 15°~80° 로 묶어 바닥을 뚫지 않게 한다.
       */
      const dist = (span * 1.5 + 8) / orbit.zoom;
      const yaw = Math.PI * 0.25 + orbit.yaw;
      const pitch = Math.min(Math.PI * 0.45, Math.max(Math.PI * 0.08, Math.PI * 0.28 + orbit.pitch));
      want.current.set(
        cx + Math.sin(yaw) * Math.cos(pitch) * dist,
        Math.sin(pitch) * dist + WALL_H,
        cz + Math.cos(yaw) * Math.cos(pitch) * dist,
      );
      target.current.set(cx, WALL_H * 0.25, cz);
    }

    /* 부드럽게 따라간다. 컷이 튈 때 카메라까지 튀면 어지럽다 */
    const k = view === 'dollhouse' ? 6 : 9;
    const t = 1 - Math.exp(-k * delta);
    camera.position.lerp(want.current, t);
    camera.lookAt(target.current);
    if (camera instanceof THREE.PerspectiveCamera) {
      const nextFov = view === 'first' ? Math.max(42, Math.min(78, 68 / orbit.zoom)) : view === 'follow' ? 54 : 34;
      const fov = THREE.MathUtils.lerp(camera.fov, nextFov, t);
      if (Math.abs(fov - camera.fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
  });

  return null;
}

export default function Scene({
  plan,
  frame,
  ahead,
  trail,
  view,
  character,
  playing,
  primaryRoute,
  alternateRoute,
  exitCells,
  layers,
  quality,
  orbit,
}: Props) {
  const extent = useMemo(() => planExtent(plan), [plan]);
  const cx = (extent.minX + extent.maxX) / 2;
  const cz = (extent.minZ + extent.maxZ) / 2;
  const heading = useMemo(() => {
    const next = ahead.find((f) => f.cell.x !== frame.cell.x || f.cell.y !== frame.cell.y);
    if (next) return { x: next.cell.x - frame.cell.x, y: next.cell.y - frame.cell.y };
    return frame.facing === 'left' ? { x: -1, y: 0 } : { x: 1, y: 0 };
  }, [ahead, frame.cell.x, frame.cell.y, frame.facing]);
  const moving = playing && ahead.some((f) => f.cell.x !== frame.cell.x || f.cell.y !== frame.cell.y);
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const surfaces = useSurfaces(quality.textureSize);

  /* 태양 — 하늘의 태양 위치와 같은 방향에 선다. 집 중심에서 멀리 */
  const sun = useMemo(() => SUN_DIRECTION.clone().multiplyScalar(30).add(new THREE.Vector3(cx, 0, cz)), [cx, cz]);

  /* 불이 붙은 칸 — 표지의 자리를 잡는 데 쓴다 */
  const fireCells = useMemo(() => {
    const out: Cell[] = [];
    for (let i = 0; i < frame.primary.length; i += 1) {
      if (frame.primary[i] > 90) out.push({ x: i % plan.grid.width, y: Math.floor(i / plan.grid.width) });
    }
    return out;
  }, [frame, plan.grid.width]);

  return (
    <>
      <SkyDome physical={quality.sky === 'physical'} />
      <Rig plan={plan} frame={frame} ahead={ahead} view={view} orbit={orbit} />
      {/* 멀수록 번지는 그림자 — 고급만. 셰이더를 통째로 갈아 끼우므로 켜고 끌 때 한 번 다시 엮는다 */}
      {quality.softShadows && <SoftShadows size={18} samples={12} focus={0.55} />}

      {/* 하늘빛과 땅빛 — 환경광(돔)이 큰 몫을 하므로 세기는 낮다. 잘린 단면 안쪽이 새까매지지 않게 한다 */}
      <hemisphereLight args={['#e9eef4', '#d9cdb6', 0.25]} />
      <directionalLight
        position={sun}
        intensity={1.0}
        color="#fff1dc"
        castShadow={quality.shadows}
        shadow-mapSize-width={quality.shadowMapSize}
        shadow-mapSize-height={quality.shadowMapSize}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-far={90}
        shadow-bias={-0.0008}
        shadow-normalBias={0.02}
      />
      {/* 실내 채움광 — 그림자를 만들지 않는다 */}
      <directionalLight position={[cx + 10, 12, cz + 12]} intensity={0.2} />
      {/* 불빛. 세기를 흔들지 않는다 — 점멸 금지 (작업지침 §9-10) */}
      {fireCells.length > 0 && (
        <pointLight
          position={[fireCells[0].x + 0.5, 1.6, fireCells[0].y + 0.5]}
          color="#ff8a3d"
          intensity={22}
          distance={14}
          decay={2}
        />
      )}

      <Outside extent={extent} scenery={layers.scenery && quality.scenery} detail={quality.detail} surfaces={surfaces} shadows={quality.shadows} />
      <House plan={plan} doorState={frame.doorState} shadows={quality.shadows} cutaway={view !== 'first'} surfaces={surfaces} />
      {view === 'first' && <Ceiling plan={plan} shadows={quality.shadows} surfaces={surfaces} />}
      <InteriorDetails plan={plan} quality={quality} view={view} surfaces={surfaces} />

      {layers.route && primaryRoute.length > 1 && <RoutePath waypoints={primaryRoute} color="#22c55e" />}
      {layers.route && alternateRoute.length > 1 && <RoutePath waypoints={alternateRoute} color="#38bdf8" faint />}
      {layers.trail && <TrailPath cells={trail} />}

      <Markers plan={plan} fireCells={fireCells} exitCells={exitCells} />
      {layers.hazard && <Hazard grid={plan.grid} frame={frame} quality={quality} reduced={reduced} />}

      {/* 한 시점에는 플레이어 표현을 하나만 만든다. 숨긴 전신과 1인칭 몸을 함께 두지 않는다 (v1.14 §1). */}
      {view === 'first' ? (
        <FirstPersonHands3D
          character={character}
          crouch={frame.posture === 'crouch'}
          moving={moving}
        />
      ) : (
        <Avatar3D
          cell={frame.cell}
          character={character}
          crouch={frame.posture === 'crouch'}
          heading={heading}
          moving={moving}
          shadows={quality.shadows}
        />
      )}
    </>
  );
}
