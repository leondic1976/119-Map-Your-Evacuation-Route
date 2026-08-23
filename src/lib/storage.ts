/**
 * 저장·불러오기.
 *
 * 모든 데이터는 이용자 기기 안에서만 처리한다(서버 미전송).
 * 자동 저장은 브라우저 localStorage, 영구 보관은 JSON 파일 내려받기를 쓴다.
 */
import { PLAN_VERSION, Plan, emptyPlan, emptyMeta } from './types';

export const STORAGE_KEY = 'evac-plan-v1';

export function serialize(plan: Plan): string {
  return JSON.stringify({ ...plan, version: PLAN_VERSION }, null, 2);
}

/** 구버전 파일 이행 — 없는 필드를 기본값으로 채운다 */
export function migrate(raw: unknown): Plan {
  const base = emptyPlan();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<Plan> & { version?: number };
  const meta = { ...emptyMeta(), ...(o.meta ?? {}) };
  if (!meta.occupants) meta.occupants = emptyMeta().occupants;
  if (!meta.walker) meta.walker = 'adult';
  return {
    version: PLAN_VERSION,
    meta,
    rooms: Array.isArray(o.rooms) ? o.rooms : [],
    doors: Array.isArray(o.doors)
      ? o.doors.map((d) => ({ ...d, alwaysOpen: Boolean(d.alwaysOpen), hinge: d.hinge ?? -1, swing: d.swing ?? 1 }))
      : [],
    windows: Array.isArray(o.windows) ? o.windows : [],
    facilities: Array.isArray(o.facilities) ? o.facilities.map((f) => ({ ...f, rot: f.rot ?? 0 })) : [],
    routes: Array.isArray(o.routes) ? o.routes : [],
    notes: Array.isArray(o.notes) ? o.notes : [],
    background: o.background ?? null,
    traceLines: Array.isArray(o.traceLines) ? o.traceLines : [],
  };
}

export function parsePlan(text: string): Plan {
  const raw = JSON.parse(text) as unknown;
  return migrate(raw);
}

/* ------------------------------------------------------------------ */
/* 브라우저 저장                                                       */
/* ------------------------------------------------------------------ */

export function hasStorage(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const k = '__evac_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/** 저장 실패(시크릿 모드 등)해도 편집은 중단되지 않는다 */
export function saveLocal(plan: Plan): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    return true;
  } catch {
    return false;
  }
}

export function loadLocal(): Plan | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (!text) return null;
    return migrate(JSON.parse(text));
  } catch {
    return null;
  }
}

export function clearLocal(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 무시 */
  }
}

/* ------------------------------------------------------------------ */
/* 파일 입출력                                                         */
/* ------------------------------------------------------------------ */

export function planFilename(plan: Plan, ext: string): string {
  const parts = ['피난안내도'];
  if (plan.meta.dong) parts.push(`${plan.meta.dong}동`);
  if (plan.meta.ho) parts.push(`${plan.meta.ho}호`);
  return `${parts.join('_')}.${ext}`;
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

export function downloadPlan(plan: Plan): void {
  downloadBlob(new Blob([serialize(plan)], { type: 'application/json;charset=utf-8' }), planFilename(plan, 'json'));
}

export function readPlanFile(file: File): Promise<Plan> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('파일을 읽지 못했다.'));
    fr.onload = () => {
      try {
        resolve(parsePlan(String(fr.result)));
      } catch (e) {
        reject(new Error('피난계획 파일 형식이 아니다.'));
      }
    };
    fr.readAsText(file, 'utf-8');
  });
}

export function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('이미지를 읽지 못했다.'));
    fr.onload = () => resolve(String(fr.result));
    fr.readAsDataURL(file);
  });
}

/** dataURL → ImageData (자동 인식 입력) */
export function imageDataFromSrc(src: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('이미지를 해석하지 못했다.'));
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (!ctx) {
        reject(new Error('캔버스를 만들 수 없다.'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, c.width, c.height));
    };
    img.src = src;
  });
}

/* ------------------------------------------------------------------ */
/* PNG 내보내기                                                        */
/* ------------------------------------------------------------------ */

/** SVG 요소를 PNG Blob 으로 변환 (배율 지정) */
export function svgToPng(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const vb = svg.viewBox.baseVal;
    const w = vb && vb.width ? vb.width : svg.clientWidth;
    const h = vb && vb.height ? vb.height : svg.clientHeight;
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent =
      'text{font-family:Pretendard,"Noto Sans KR","Malgun Gothic",sans-serif;} *{shape-rendering:geometricPrecision;}';
    clone.insertBefore(style, clone.firstChild);
    // 배경 흰색
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', String(vb ? vb.x : 0));
    bg.setAttribute('y', String(vb ? vb.y : 0));
    bg.setAttribute('width', String(w));
    bg.setAttribute('height', String(h));
    bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);

    const xml = new XMLSerializer().serializeToString(clone);
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    const img = new Image();
    img.onerror = () => reject(new Error('도면을 이미지로 변환하지 못했다.'));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('캔버스를 만들 수 없다.'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('PNG 변환에 실패했다.'));
      }, 'image/png');
    };
    img.src = src;
  });
}
