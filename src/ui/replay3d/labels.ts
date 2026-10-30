'use client';

/**
 * 3D 안의 글자 — 설계서 v1.4 §2.4 · FR-11.11.
 *
 * drei 의 `<Text>`(troika)를 쓰지 않는다. 그것은 글꼴 파일을 CDN 에서 받아오므로
 * 인터넷이 끊긴 교실에서 글자가 통째로 사라진다 (NFR-1 · 작업지침 §9-13).
 *
 * 대신 2D 캔버스에 시스템 글꼴로 한 번 그려 텍스처로 굽는다. 받아오는 것이 없고,
 * 한글이 제대로 나오며, 스프라이트로 얹으므로 늘 화면을 마주 본다.
 */
import * as THREE from 'three';

export interface LabelStyle {
  /** 글자색 */
  color?: string;
  /** 판 색. 없으면 글자만 */
  background?: string;
  /** 테두리 색 */
  border?: string;
  /** 글자 크기(픽셀). 텍스처 해상도 기준 */
  size?: number;
  bold?: boolean;
}

/** 화면이 촘촘해도 글자가 뭉개지지 않게 두 배로 굽는다 */
const SCALE = 2;
const PAD_X = 18;
const PAD_Y = 10;

/**
 * 글자 한 줄을 텍스처로 굽는다.
 * 돌려주는 것에 `aspect`(가로/세로)가 붙어 있다 — 스프라이트 크기를 정할 때 쓴다.
 */
export function makeLabelTexture(text: string, style: LabelStyle = {}): { texture: THREE.CanvasTexture; aspect: number } {
  const size = (style.size ?? 34) * SCALE;
  const padX = PAD_X * SCALE;
  const padY = PAD_Y * SCALE;
  const font = `${style.bold === false ? 600 : 800} ${size}px "Pretendard Variable", Pretendard, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;

  /* 폭을 재려면 캔버스가 한 번 필요하다 */
  const probe = document.createElement('canvas').getContext('2d');
  if (probe) probe.font = font;
  const textW = probe ? probe.measureText(text).width : text.length * size * 0.6;

  const w = Math.ceil(textW + padX * 2);
  const h = Math.ceil(size * 1.45 + padY * 2);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, w, h);
    if (style.background) {
      const r = Math.min(h / 2, 16 * SCALE);
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, r);
      ctx.fillStyle = style.background;
      ctx.fill();
      if (style.border) {
        ctx.lineWidth = 3 * SCALE;
        ctx.strokeStyle = style.border;
        ctx.stroke();
      }
    }
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = style.color ?? '#ffffff';
    ctx.fillText(text, w / 2, h / 2 + size * 0.04);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return { texture, aspect: w / h };
}

/**
 * 바닥에 눕혀 놓을 둥근 표시 — 안전한 곳 원처럼.
 * 글자와 달리 눕히므로 스프라이트가 아니라 평면에 입힌다.
 */
export function makeDiscTexture(color: string, ring: string): THREE.CanvasTexture {
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s / 2);
    g.addColorStop(0, color);
    g.addColorStop(0.72, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.45, 0, Math.PI * 2);
    ctx.lineWidth = 8;
    ctx.strokeStyle = ring;
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 빛나는 길 위의 화살표 — 흐르게 하려고 세로로 반복해 쓴다 */
export function makeArrowTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    /* 두 겹 갈매기 — 하나는 위, 하나는 아래 */
    for (const cy of [h * 0.3, h * 0.75]) {
      ctx.beginPath();
      ctx.moveTo(w * 0.22, cy + h * 0.09);
      ctx.lineTo(w * 0.5, cy - h * 0.07);
      ctx.lineTo(w * 0.78, cy + h * 0.09);
      ctx.stroke();
    }
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}
