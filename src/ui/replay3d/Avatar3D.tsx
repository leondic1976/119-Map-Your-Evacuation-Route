'use client';

/**
 * 3D 리플레이의 주인공.
 *
 * 외부 모델 파일을 내려받지 않고 `KidSpec` 한 벌로 열 명을 다시 조립한다.
 * 그래서 캐릭터 선택 화면의 피부·머리·옷·소품이 3D 에서도 그대로 이어지고,
 * 오프라인 단일 HTML 배포의 용량 제한도 건드리지 않는다.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Cell } from '../../types/plan';
import { kidOf, type KidSpec } from '../KidCharacters';
import { prefersReducedMotion } from './quality';

interface Props {
  cell: Cell;
  character: string;
  crouch: boolean;
  heading: { x: number; y: number };
  moving: boolean;
  shadows: boolean;
  visible?: boolean;
}

interface FirstPersonProps {
  character: string;
  crouch: boolean;
  moving: boolean;
}

/** 테스트와 화면이 같은 정본을 읽는지 확인할 수 있는 작은 직렬화 값 */
export function avatar3dIdentity(character: string): Pick<KidSpec, 'id' | 'name' | 'skin' | 'hair' | 'style' | 'top' | 'bottom' | 'glasses' | 'accent'> {
  const k = kidOf(character);
  return {
    id: k.id,
    name: k.name,
    skin: k.skin,
    hair: k.hair,
    style: k.style,
    top: k.top,
    bottom: k.bottom,
    glasses: k.glasses,
    accent: k.accent,
  };
}

function HairCap({ color, shade }: { color: string; shade: string }) {
  return (
    <>
      <mesh position={[0, 2.075, -0.015]} scale={[1.04, 0.94, 1.04]} castShadow>
        <sphereGeometry args={[0.305, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.56]} />
        <meshStandardMaterial color={color} roughness={0.78} />
      </mesh>
      <mesh position={[-0.14, 2.16, 0.09]} scale={[0.72, 0.28, 0.7]} castShadow>
        <sphereGeometry args={[0.17, 12, 7]} />
        <meshStandardMaterial color={shade} roughness={0.8} />
      </mesh>
    </>
  );
}

function Hair({ k }: { k: KidSpec }) {
  const cap = <HairCap color={k.hair} shade={k.hairShade} />;
  if (k.style === 'cap') {
    return (
      <>
        {cap}
        <mesh position={[0, 2.135, 0]} scale={[1.05, 0.62, 1.03]} castShadow>
          <sphereGeometry args={[0.31, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.53]} />
          <meshStandardMaterial color={k.top} roughness={0.72} />
        </mesh>
        <mesh position={[0, 2.105, 0.29]} scale={[1.25, 0.22, 0.72]} castShadow>
          <sphereGeometry args={[0.2, 12, 7]} />
          <meshStandardMaterial color={k.topShade} roughness={0.7} />
        </mesh>
        <mesh position={[0, 2.39, 0]} castShadow>
          <sphereGeometry args={[0.045, 10, 8]} />
          <meshStandardMaterial color={k.accent ?? '#fff'} roughness={0.55} />
        </mesh>
      </>
    );
  }
  if (k.style === 'beanie') {
    return (
      <>
        {cap}
        <mesh position={[0, 2.14, 0]} scale={[1.03, 0.86, 1.03]} castShadow>
          <sphereGeometry args={[0.31, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
          <meshStandardMaterial color={k.top} roughness={0.9} />
        </mesh>
        <mesh position={[0, 2.07, 0.06]} scale={[1, 0.32, 1]} castShadow>
          <torusGeometry args={[0.27, 0.055, 6, 18]} />
          <meshStandardMaterial color={k.topShade} roughness={0.9} />
        </mesh>
        <mesh position={[0, 2.42, 0]} castShadow>
          <sphereGeometry args={[0.075, 12, 8]} />
          <meshStandardMaterial color={k.accent ?? '#fff'} roughness={0.8} />
        </mesh>
      </>
    );
  }
  if (k.style === 'curly') {
    const curls: [number, number, number][] = [
      [-0.22, 2.16, 0], [-0.08, 2.25, 0.02], [0.08, 2.25, 0.02], [0.22, 2.16, 0],
      [-0.27, 2.03, -0.02], [0.27, 2.03, -0.02], [0, 2.17, -0.15],
    ];
    return (
      <>
        {curls.map((p, i) => (
          <mesh key={i} position={p} castShadow>
            <sphereGeometry args={[i === 6 ? 0.18 : 0.145, 11, 8]} />
            <meshStandardMaterial color={i % 3 === 1 ? k.hairShade : k.hair} roughness={0.86} />
          </mesh>
        ))}
      </>
    );
  }
  if (k.style === 'twin') {
    return (
      <>
        {cap}
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.35, 1.96, -0.02]}>
            <mesh castShadow>
              <sphereGeometry args={[0.15, 12, 8]} />
              <meshStandardMaterial color={k.hair} roughness={0.82} />
            </mesh>
            <mesh position={[0, -0.15, 0]} scale={[0.8, 1.3, 0.8]} castShadow>
              <sphereGeometry args={[0.115, 10, 7]} />
              <meshStandardMaterial color={k.hairShade} roughness={0.84} />
            </mesh>
            <mesh position={[0, 0.13, 0]} castShadow>
              <torusGeometry args={[0.09, 0.022, 5, 12]} />
              <meshStandardMaterial color={k.accent ?? '#ffd166'} roughness={0.55} />
            </mesh>
          </group>
        ))}
      </>
    );
  }
  if (k.style === 'bob') {
    return (
      <>
        {cap}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.255, 1.91, -0.035]} scale={[0.82, 1.3, 0.85]} castShadow>
            <capsuleGeometry args={[0.105, 0.23, 5, 10]} />
            <meshStandardMaterial color={side < 0 ? k.hairShade : k.hair} roughness={0.82} />
          </mesh>
        ))}
      </>
    );
  }
  if (k.style === 'braid') {
    return (
      <>
        {cap}
        {[-1, 1].map((side) => (
          <group key={side}>
            {[0, 1, 2].map((part) => (
              <mesh key={part} position={[side * (0.285 + part * 0.015), 1.89 - part * 0.16, -0.025]} castShadow>
                <sphereGeometry args={[0.09 - part * 0.008, 10, 7]} />
                <meshStandardMaterial color={part % 2 ? k.hairShade : k.hair} roughness={0.86} />
              </mesh>
            ))}
            <mesh position={[side * 0.32, 1.55, -0.025]} castShadow>
              <sphereGeometry args={[0.035, 8, 6]} />
              <meshStandardMaterial color={k.accent ?? '#f6efe0'} roughness={0.6} />
            </mesh>
          </group>
        ))}
      </>
    );
  }
  if (k.style === 'pony') {
    return (
      <>
        {cap}
        <group position={[0.25, 2.02, -0.25]} rotation={[0.15, 0, -0.35]}>
          <mesh castShadow>
            <sphereGeometry args={[0.14, 12, 8]} />
            <meshStandardMaterial color={k.hair} roughness={0.82} />
          </mesh>
          <mesh position={[0.07, -0.17, -0.02]} scale={[0.78, 1.5, 0.8]} castShadow>
            <sphereGeometry args={[0.11, 10, 7]} />
            <meshStandardMaterial color={k.hairShade} roughness={0.84} />
          </mesh>
        </group>
      </>
    );
  }
  if (k.style === 'band') {
    return (
      <>
        {cap}
        <mesh position={[0, 2.09, 0.11]} rotation={[0, 0, 0]} castShadow>
          <torusGeometry args={[0.292, 0.027, 6, 20, Math.PI]} />
          <meshStandardMaterial color={k.accent ?? '#ffe08a'} roughness={0.58} metalness={0.05} />
        </mesh>
        <mesh position={[-0.27, 2.1, 0.13]} rotation={[0, 0, 0.4]} castShadow>
          <octahedronGeometry args={[0.065, 0]} />
          <meshStandardMaterial color={k.accent ?? '#ffe08a'} roughness={0.48} />
        </mesh>
      </>
    );
  }
  return (
    <>
      {cap}
      {k.style === 'crop' && (
        <mesh position={[0.06, 2.22, 0.12]} rotation={[0.2, 0, -0.35]} castShadow>
          <coneGeometry args={[0.1, 0.22, 7]} />
          <meshStandardMaterial color={k.hairShade} roughness={0.82} />
        </mesh>
      )}
    </>
  );
}

function Face({ k }: { k: KidSpec }) {
  return (
    <group>
      <mesh position={[0, 2.015, 0]} castShadow>
        <sphereGeometry args={[0.3, 18, 12]} />
        <meshStandardMaterial color={k.skin} roughness={0.72} />
      </mesh>
      <mesh position={[-0.265, 2.01, 0]} castShadow>
        <sphereGeometry args={[0.065, 10, 7]} />
        <meshStandardMaterial color={k.skinShade} roughness={0.72} />
      </mesh>
      <mesh position={[0.265, 2.01, 0]} castShadow>
        <sphereGeometry args={[0.065, 10, 7]} />
        <meshStandardMaterial color={k.skin} roughness={0.72} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.105, 2.04, 0.278]}>
            <sphereGeometry args={[0.043, 10, 8]} />
            <meshPhysicalMaterial color="#17202a" roughness={0.22} clearcoat={0.8} />
          </mesh>
          <mesh position={[side * 0.09, 2.055, 0.312]}>
            <sphereGeometry args={[0.012, 7, 6]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh position={[side * 0.16, 1.965, 0.275]} scale={[1.4, 0.65, 0.35]}>
            <sphereGeometry args={[0.04, 9, 6]} />
            <meshStandardMaterial color="#e58a7a" transparent opacity={0.34} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.915, 0.291]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.065, 0.012, 5, 12, Math.PI]} />
        <meshStandardMaterial color="#5b2525" roughness={0.55} />
      </mesh>
      {k.glasses && (
        <group position={[0, 2.035, 0.303]}>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.108, 0, 0]} scale={[1.15, 1, 1]}>
              <torusGeometry args={[0.075, 0.012, 6, 16]} />
              <meshStandardMaterial color="#283643" roughness={0.35} metalness={0.25} />
            </mesh>
          ))}
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.075, 0.015, 0.014]} />
            <meshStandardMaterial color="#283643" roughness={0.35} metalness={0.25} />
          </mesh>
        </group>
      )}
      <Hair k={k} />
    </group>
  );
}

function Arm({ side, k, limbRef, shadows }: { side: -1 | 1; k: KidSpec; limbRef: React.RefObject<THREE.Group | null>; shadows: boolean }) {
  return (
    <group ref={limbRef} position={[side * 0.32, 1.55, 0]} rotation={[0, 0, side * -0.08]}>
      <mesh position={[0, -0.27, 0]} castShadow={shadows}>
        <capsuleGeometry args={[0.085, 0.38, 5, 9]} />
        <meshStandardMaterial color={side < 0 ? k.topShade : k.top} roughness={0.7} />
      </mesh>
      <mesh position={[0, -0.53, 0.01]} castShadow={shadows}>
        <sphereGeometry args={[0.095, 11, 8]} />
        <meshStandardMaterial color={k.skin} roughness={0.7} />
      </mesh>
    </group>
  );
}

function Leg({ side, k, limbRef, shadows }: { side: -1 | 1; k: KidSpec; limbRef: React.RefObject<THREE.Group | null>; shadows: boolean }) {
  return (
    <group ref={limbRef} position={[side * 0.14, 0.89, 0]}>
      <mesh position={[0, -0.31, 0]} castShadow={shadows}>
        <capsuleGeometry args={[0.105, 0.42, 5, 9]} />
        <meshStandardMaterial color={side < 0 ? k.bottom : k.bottom} roughness={0.78} />
      </mesh>
      <mesh position={[0, -0.64, 0.075]} scale={[1, 0.72, 1.65]} castShadow={shadows}>
        <capsuleGeometry args={[0.11, 0.11, 4, 9]} />
        <meshStandardMaterial color="#172230" roughness={0.64} />
      </mesh>
      <mesh position={[0, -0.69, 0.155]} scale={[0.8, 0.35, 1.15]}>
        <boxGeometry args={[0.23, 0.08, 0.3]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.48} />
      </mesh>
    </group>
  );
}

/**
 * 1인칭에서도 고른 캐릭터가 사라지지 않게 카메라 아래에 소매와 손을 붙인다.
 * 깊이 검사를 끄므로 좁은 문을 지날 때 벽 속으로 깜빡이지 않는다.
 */
export function FirstPersonHands3D({ character, crouch, moving }: FirstPersonProps) {
  const k = useMemo(() => kidOf(character), [character]);
  const root = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const offset = useRef(new THREE.Vector3());
  const reduced = useMemo(() => prefersReducedMotion(), []);

  useFrame(({ camera, clock }, delta) => {
    if (!root.current) return;
    root.current.quaternion.copy(camera.quaternion);
    /* 손 전체가 시야 아래 1/3에 들어오도록 카메라 바로 앞에 둔다. */
    offset.current.set(0, crouch ? -0.36 : -0.3, -0.78).applyQuaternion(camera.quaternion);
    root.current.position.copy(camera.position).add(offset.current);
    const phase = moving && !reduced ? Math.sin(clock.elapsedTime * 9) : 0;
    const settle = 1 - Math.exp(-12 * delta);
    if (left.current) left.current.rotation.x = THREE.MathUtils.lerp(left.current.rotation.x, -0.72 + phase * 0.09, settle);
    if (right.current) right.current.rotation.x = THREE.MathUtils.lerp(right.current.rotation.x, -0.72 - phase * 0.09, settle);
  });

  const arm = (side: -1 | 1, ref: React.RefObject<THREE.Group | null>) => (
    <group ref={ref} position={[side * 0.31, 0.08, 0]} rotation={[-0.5, 0, side * -0.24]}>
      {/* 소매는 화면 아래, 손은 진행 방향 쪽에 보여 1인칭 팔처럼 읽히게 한다. */}
      <mesh position={[0, -0.2, 0]} renderOrder={100}>
        <capsuleGeometry args={[0.09, 0.34, 5, 10]} />
        <meshStandardMaterial color={side < 0 ? k.topShade : k.top} roughness={0.6} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.06, -0.015]} scale={[1, 1.12, 0.9]} renderOrder={101}>
        <capsuleGeometry args={[0.1, 0.08, 5, 10]} />
        <meshStandardMaterial color={k.skin} roughness={0.68} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh position={[0, -0.075, 0.078]} renderOrder={102}>
        <boxGeometry args={[0.14, 0.035, 0.025]} />
        <meshStandardMaterial
          color={k.accent ?? '#e7f8ef'}
          emissive={k.accent ?? '#9ce5c4'}
          emissiveIntensity={0.2}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );

  return (
    <group ref={root} name={`first-person-${k.id}`} scale={0.46}>
      {arm(-1, left)}
      {arm(1, right)}
    </group>
  );
}

export default function Avatar3D({ cell, character, crouch, heading, moving, shadows, visible = true }: Props) {
  const k = useMemo(() => kidOf(character), [character]);
  const root = useRef<THREE.Group>(null);
  const pose = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const first = useRef(true);
  const target = useRef(new THREE.Vector3());
  const targetRotation = useRef(new THREE.Quaternion());
  const reduced = useMemo(() => prefersReducedMotion(), []);

  useFrame(({ clock }, delta) => {
    if (!root.current || !pose.current) return;
    target.current.set(cell.x + 0.5, 0, cell.y + 0.5);
    const yaw = Math.atan2(heading.x, heading.y);
    targetRotation.current.setFromEuler(new THREE.Euler(0, yaw, 0));
    if (first.current) {
      root.current.position.copy(target.current);
      root.current.quaternion.copy(targetRotation.current);
      first.current = false;
    } else {
      const follow = 1 - Math.exp(-12 * delta);
      root.current.position.lerp(target.current, follow);
      root.current.quaternion.slerp(targetRotation.current, follow);
    }

    const active = moving && !reduced;
    const phase = clock.elapsedTime * 9;
    const swing = active ? Math.sin(phase) * 0.58 : 0;
    const bounce = active ? Math.abs(Math.sin(phase)) * 0.045 : 0;
    const settle = 1 - Math.exp(-10 * delta);
    const setX = (ref: React.RefObject<THREE.Group | null>, value: number) => {
      if (ref.current) ref.current.rotation.x = THREE.MathUtils.lerp(ref.current.rotation.x, value, settle);
    };
    setX(leftArm, swing);
    setX(rightArm, -swing);
    setX(leftLeg, -swing * 0.72 + (crouch ? -0.42 : 0));
    setX(rightLeg, swing * 0.72 + (crouch ? -0.42 : 0));
    pose.current.position.y = THREE.MathUtils.lerp(pose.current.position.y, (crouch ? -0.24 : 0) + bounce, settle);
    pose.current.scale.y = THREE.MathUtils.lerp(pose.current.scale.y, crouch ? 0.78 : 1, settle);
    pose.current.rotation.x = THREE.MathUtils.lerp(pose.current.rotation.x, crouch ? -0.18 : 0, settle);
    if (torso.current) torso.current.rotation.z = active ? Math.sin(phase * 0.5) * 0.025 : 0;
  });

  return (
    <group ref={root} visible={visible} name={`player-${k.id}`} userData={{ character: k.id, style: k.style }}>
      {/* 주인공을 놓치지 않게 하는 고정형 안내 링. 점멸하지 않는다. */}
      <mesh position={[0, 0.035, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.46, 0.035, 7, 28]} />
        <meshStandardMaterial color="#38f0a2" emissive="#0c6b47" emissiveIntensity={1.5} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.42, 28]} />
        <meshBasicMaterial color="#07130f" transparent opacity={0.28} depthWrite={false} />
      </mesh>

      <group ref={pose}>
        <Leg side={-1} k={k} limbRef={leftLeg} shadows={shadows} />
        <Leg side={1} k={k} limbRef={rightLeg} shadows={shadows} />

        <group ref={torso}>
          <mesh position={[0, 1.3, 0]} scale={[1, 1.15, 0.72]} castShadow={shadows}>
            <capsuleGeometry args={[0.275, 0.42, 6, 12]} />
            <meshStandardMaterial color={k.top} roughness={0.63} />
          </mesh>
          {/* 옷의 그늘과 반사 띠가 작은 화면에서도 실루엣을 또렷하게 만든다. */}
          <mesh position={[-0.235, 1.3, -0.025]} scale={[0.25, 0.9, 0.6]} castShadow={shadows}>
            <capsuleGeometry args={[0.12, 0.35, 5, 9]} />
            <meshStandardMaterial color={k.topShade} roughness={0.7} />
          </mesh>
          <mesh position={[0, 1.23, 0.224]}>
            <boxGeometry args={[0.43, 0.045, 0.025]} />
            <meshStandardMaterial color={k.accent ?? '#e7f8ef'} emissive={k.accent ?? '#9ce5c4'} emissiveIntensity={0.22} roughness={0.48} />
          </mesh>
          <mesh position={[0, 1.48, 0.23]} rotation={[0, 0, Math.PI / 4]}>
            <octahedronGeometry args={[0.075, 0]} />
            <meshStandardMaterial color={k.accent ?? '#ffffff'} roughness={0.42} metalness={0.06} />
          </mesh>
        </group>

        <Arm side={-1} k={k} limbRef={leftArm} shadows={shadows} />
        <Arm side={1} k={k} limbRef={rightArm} shadows={shadows} />

        <mesh position={[0, 1.73, 0]} castShadow={shadows}>
          <cylinderGeometry args={[0.09, 0.105, 0.18, 10]} />
          <meshStandardMaterial color={k.skinShade} roughness={0.72} />
        </mesh>
        <Face k={k} />
      </group>

      <mesh position={[0, 2.72, 0]} rotation={[0, Math.PI / 4, 0]}>
        <octahedronGeometry args={[0.105, 0]} />
        <meshStandardMaterial color="#7fffd0" emissive="#20b878" emissiveIntensity={1.25} roughness={0.25} />
      </mesh>
    </group>
  );
}
