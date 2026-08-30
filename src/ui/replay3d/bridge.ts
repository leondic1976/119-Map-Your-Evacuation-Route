'use client';

/**
 * 손으로 만든 정점 배열을 three 의 지오메트리로 잇는다 — 설계서 v1.4 §1.1.
 *
 * `geometry.ts` 는 그대로 둔다. 집을 세우는 규칙(벽 두께·개구부 절개·가구)은
 * 라이브러리를 바꿨다고 달라질 것이 없고, 이미 검증된 코드다.
 * 여기서는 그 배열(위치3·법선3·색3)을 three 가 읽을 수 있게 감싸기만 한다.
 */
import * as THREE from 'three';
import { STRIDE } from './geometry';

/**
 * 위치·법선·색이 한 줄에 섞여 있는 배열을 그대로 GPU 에 올린다.
 * 셋으로 나눠 담지 않는다 — 복사가 한 번 더 일어나고, 큰 집에서 눈에 띈다.
 */
export function interleavedGeometry(data: Float32Array): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const buf = new THREE.InterleavedBuffer(data, STRIDE);
  g.setAttribute('position', new THREE.InterleavedBufferAttribute(buf, 3, 0));
  g.setAttribute('normal', new THREE.InterleavedBufferAttribute(buf, 3, 3));
  g.setAttribute('color', new THREE.InterleavedBufferAttribute(buf, 3, 6));
  g.computeBoundingSphere();
  return g;
}

/** 쓰고 버린다. R2F 는 지오메트리를 저절로 치워 주지 않는다 */
export function disposeGeometry(g: THREE.BufferGeometry | null | undefined): void {
  g?.dispose();
}
