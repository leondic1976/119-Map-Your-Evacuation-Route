'use client';

/**
 * 하늘과 환경광 — 설계서 v1.19 §4.1.
 *
 *   물리 하늘   three 의 Sky(Preetham 산란). 태양 위치가 방향광과 같아 그림자 방향과 하늘 밝기가 맞는다.
 *   환경광     같은 하늘을 PMREM 으로 구워 scene.environment 에 건다. 금속·유리·바닥에 하늘빛이 비친다.
 *   안개       멀리는 지수 안개로 흐려져 깊이가 생긴다.
 *
 * 전부 코드로 만든다 — HDRI 를 받아오지 않는다 (v1.4 §1.2 · NFR-1).
 * 가벼움 화질은 두 색 하늘을 쓰되 환경광은 같다 (한 번만 굽고 비용이 없다).
 */
import React, { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

/** 태양 방향 — 위·앞·왼쪽. Scene 의 방향광이 같은 방향에 선다 */
export const SUN_DIRECTION = new THREE.Vector3(-14, 22, -10).normalize();

function tuneSky(sky: Sky, sun: THREE.Vector3): void {
  const u = sky.material.uniforms;
  u.turbidity.value = 3.4;
  u.rayleigh.value = 1.5;
  u.mieCoefficient.value = 0.0045;
  u.mieDirectionalG.value = 0.8;
  (u.sunPosition.value as THREE.Vector3).copy(sun);
}

/**
 * 환경광 — 하늘·지평선·땅 세 색의 돔과 작은 태양 원반을 PMREM 으로 굽는다.
 * 산란 하늘을 그대로 구우면 태양 둘레의 큰 값이 번져 벽이 통째로 하늘색으로 물든다.
 * 값을 아는 돔을 쓰면 위는 옅은 하늘빛, 아래는 따뜻한 땅빛, 반짝임은 태양 원반이 맡는다.
 */
function useSkyEnvironment(sun: THREE.Vector3, intensity: number): void {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envScene = new THREE.Scene();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(50, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color(0.52, 0.66, 0.82) },
          horizon: { value: new THREE.Color(0.8, 0.82, 0.84) },
          ground: { value: new THREE.Color(0.42, 0.4, 0.34) },
        },
        vertexShader: 'varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; varying float vY;
          void main(){ vec3 c = vY >= 0.0 ? mix(horizon, top, pow(vY, 0.6)) : mix(horizon, ground, pow(-vY, 0.5)); gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    envScene.add(dome);
    /* 태양 원반 — 유리·금속의 반짝임과 바닥의 하이라이트가 여기서 나온다. PMREM 카메라 far(100) 안 */
    const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 13, 11.5) }));
    sunDisc.position.copy(sun).multiplyScalar(40);
    envScene.add(sunDisc);
    const target = pmrem.fromScene(envScene, 0.02);
    scene.environment = target.texture;
    scene.environmentIntensity = intensity;
    return () => {
      if (scene.environment === target.texture) scene.environment = null;
      target.dispose();
      pmrem.dispose();
      dome.geometry.dispose();
      dome.material.dispose();
      sunDisc.geometry.dispose();
      sunDisc.material.dispose();
    };
  }, [gl, scene, sun, intensity]);
}

/** 두 색 하늘 — 가벼움 화질. 지평선이 검게 끊기지 않게 큰 구 안쪽을 칠한다 */
function GradientSky() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { top: { value: new THREE.Color('#5f9ed0') }, bottom: { value: new THREE.Color('#eef2ef') } },
        vertexShader: `varying float vY; void main(){vY=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `uniform vec3 top;uniform vec3 bottom;varying float vY;void main(){gl_FragColor=vec4(mix(bottom,top,clamp(vY*.5+.5,0.,1.)),1.);}`,
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh material={mat} renderOrder={-1}>
      <sphereGeometry args={[150, 32, 20]} />
    </mesh>
  );
}

interface Props {
  physical: boolean;
}

export default function SkyDome({ physical }: Props) {
  const { scene } = useThree();
  const sun = SUN_DIRECTION;
  useSkyEnvironment(sun, physical ? 1 : 0.9);

  const sky = useMemo(() => {
    const s = new Sky();
    s.scale.setScalar(300);
    tuneSky(s, sun);
    return s;
  }, [sun]);
  useEffect(
    () => () => {
      sky.material.dispose();
      sky.geometry.dispose();
    },
    [sky],
  );

  /* 안개 — 집에는 거의 닿지 않고 먼 풍경만 흐려진다 */
  useEffect(() => {
    scene.fog = physical ? new THREE.FogExp2('#d6e0e9', 0.0055) : null;
    return () => {
      scene.fog = null;
    };
  }, [scene, physical]);

  return physical ? <primitive object={sky} /> : <GradientSky />;
}
