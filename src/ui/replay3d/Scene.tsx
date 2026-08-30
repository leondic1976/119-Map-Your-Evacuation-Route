'use client';

/**
 * 장면 — 설계서 v1.4 §2.
 *
 * 집 · 문 · 아이 · 불연기 · 빛나는 길 · 표지 · 집 밖을 한자리에 모으고,
 * 시점에 따라 카메라를 옮긴다.
 *
 * 집을 세우는 정점은 `geometry.ts` 가 그대로 만든다 (설계서 v1.4 §1.1).
 * 라이브러리를 바꿨다고 벽 두께와 개구부 규칙까지 다시 쓸 이유가 없다.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Cell, FloorPlan } from '../../types/plan';
import type { ReplayFrame } from '../../types/game';
import { WALL_H, buildDoors, buildHouse, planExtent } from './geometry';
import { interleavedGeometry } from './bridge';
import Avatar3D, { FirstPersonHands3D } from './Avatar3D';
import RoutePath, { TrailPath } from './RoutePath';
import Markers from './Markers';
import Outside, { Sky } from './Outside';
import Hazard from './Hazard';
import type { QualitySettings } from './quality';

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
const EYE_STAND = 2.1;
const EYE_CROUCH = 1.1;

/**
 * 집 지오메트리 — 도면이 바뀔 때만 다시 만든다.
 * 문은 여닫힘에 따라 달라지므로 따로 둔다.
 */
/**
 * 집 전체 시점에서 벽을 잘라 내는 높이.
 * 벽이 온전히 서 있으면 45° 로 내려다볼 때 안쪽 바닥이 가려져 길이 보이지 않는다.
 * 목표 그림처럼 허리께에서 자른다 (설계서 v1.4 §2.1).
 */
const CUT_Y = WALL_H * 0.52;

function House({
  plan,
  doorState,
  shadows,
  cutaway,
}: {
  plan: FloorPlan;
  doorState: Record<string, 'open' | 'closed'>;
  shadows: boolean;
  cutaway: boolean;
}) {
  const house = useMemo(() => interleavedGeometry(buildHouse(plan)), [plan]);
  const doors = useMemo(() => interleavedGeometry(buildDoors(plan, doorState)), [plan, doorState]);
  const clip = useMemo(() => [new THREE.Plane(new THREE.Vector3(0, -1, 0), CUT_Y)], []);
  const planes = cutaway ? clip : null;
  useEffect(() => () => house.dispose(), [house]);
  useEffect(() => () => doors.dispose(), [doors]);
  return (
    <group>
      {/*
        * 양면으로 그린다. 정점의 감김 방향이 한결같지 않아 앞면만 그리면
        * 벽이 줄무늬처럼 뚫려 보인다 — 옛 렌더러도 뒷면 컬링을 켜지 않았다.
        */}
      <mesh geometry={house} castShadow={shadows} receiveShadow={shadows}>
        <meshStandardMaterial
          vertexColors
          roughness={0.82}
          metalness={0.02}
          side={THREE.DoubleSide}
          clippingPlanes={planes}
          clipShadows
        />
      </mesh>
      <mesh geometry={doors} castShadow={shadows} receiveShadow={shadows}>
        <meshStandardMaterial
          vertexColors
          roughness={0.7}
          metalness={0.02}
          side={THREE.DoubleSide}
          clippingPlanes={planes}
          clipShadows
        />
      </mesh>
    </group>
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
    const eye = frame.posture === 'crouch' ? EYE_CROUCH : EYE_STAND;
    const cx = (extent.minX + extent.maxX) / 2;
    const cz = (extent.minZ + extent.maxZ) / 2;
    const span = Math.max(extent.maxX - extent.minX, extent.maxZ - extent.minZ);

    if (view === 'first') {
      want.current.set(me.x, eye, me.z);
      target.current.copy(me).add(heading.clone().multiplyScalar(3)).setY(eye * 0.82);
    } else if (view === 'follow') {
      /* 지나온 길 안쪽에 카메라를 둔다. 멀리 빼면 벽 밖으로 나가 화면이 벽으로 가득 찬다. */
      const back = heading.clone().multiplyScalar(-1.15);
      want.current.set(me.x + back.x, 2.2, me.z + back.z);
      target.current.copy(me).setY(0.9);
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
      const nextFov = view === 'first' ? 62 : view === 'follow' ? 65 : 34;
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
      <Sky />
      <Rig plan={plan} frame={frame} ahead={ahead} view={view} orbit={orbit} />

      {/* 하늘빛과 땅빛 — 잘린 단면 안쪽이 새까매지지 않게 한다 */}
      <hemisphereLight args={['#cfe3f3', '#d8d2c4', 0.55]} />
      <directionalLight
        position={[cx - 14, 22, cz - 10]}
        intensity={1.3}
        castShadow={quality.shadows}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-far={70}
        shadow-bias={-0.0012}
      />
      {/* 실내 채움광 — 그림자를 만들지 않는다 */}
      <directionalLight position={[cx + 10, 12, cz + 12]} intensity={0.25} />
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

      <Outside extent={extent} scenery={layers.scenery && quality.scenery} />
      <House plan={plan} doorState={frame.doorState} shadows={quality.shadows} cutaway={view === 'dollhouse'} />

      {layers.route && primaryRoute.length > 1 && <RoutePath waypoints={primaryRoute} color="#22c55e" />}
      {layers.route && alternateRoute.length > 1 && <RoutePath waypoints={alternateRoute} color="#38bdf8" faint />}
      {layers.trail && <TrailPath cells={trail} />}

      <Markers plan={plan} fireCells={fireCells} exitCells={exitCells} />
      {layers.hazard && <Hazard grid={plan.grid} frame={frame} />}

      <Avatar3D
        cell={frame.cell}
        character={character}
        crouch={frame.posture === 'crouch'}
        heading={heading}
        moving={moving}
        shadows={quality.shadows}
        visible={view !== 'first'}
      />
      {view === 'first' && (
        <FirstPersonHands3D
          character={character}
          crouch={frame.posture === 'crouch'}
          moving={moving}
        />
      )}
    </>
  );
}
