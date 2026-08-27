/**
 * 어린이 화면의 저장·불러오기.
 * 모든 자료는 이용자 기기 안에서만 다룬다. 서버로 보내지 않는다 (CON-2 · CON-8).
 */
import type { SaveFile } from '../types/save';
import { SCHEMA_VERSION, defaultProfile, emptyProgress } from '../types/save';
import { emptyFloorPlan } from '../types/plan';
import { parseSave } from './migrate';

export const KIDS_KEY = 'evac-kids-v1';

export function emptySave(): SaveFile {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    profile: defaultProfile(),
    plan: emptyFloorPlan(),
    routes: {},
    progress: emptyProgress(),
  };
}

export function saveKids(file: SaveFile): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.setItem(KIDS_KEY, JSON.stringify({ ...file, updatedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

export function loadKids(): SaveFile | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const text = window.localStorage.getItem(KIDS_KEY);
    if (!text) return null;
    return parseSave(text);
  } catch {
    return null;
  }
}

export function clearKids(): void {
  try {
    window.localStorage.removeItem(KIDS_KEY);
  } catch {
    /* 시크릿 모드 등 — 지우지 못해도 편집은 이어진다 */
  }
}

export function serializeSave(file: SaveFile): string {
  return JSON.stringify({ ...file, schemaVersion: SCHEMA_VERSION }, null, 2);
}

export function downloadText(text: string, filename: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readSaveFile(file: File): Promise<SaveFile> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        resolve(parseSave(String(r.result)));
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = () => reject(new Error('파일을 읽지 못했다.'));
    r.readAsText(file);
  });
}

/**
 * SVG → PNG. 외부 라이브러리를 쓰지 않는다 (plan2.md §5.6).
 * 인쇄용 SVG 에는 바깥 이미지와 웹폰트를 넣지 않는다 — 캔버스가 더럽혀진다.
 */
export function svgToPng(svg: SVGSVGElement, width: number, height: number): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const text = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('그림판을 만들지 못했다.'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('그림으로 바꾸지 못했다.'))), 'image/png');
    };
    img.onerror = () => reject(new Error('그림으로 바꾸지 못했다.'));
    img.src = url;
  });
}
