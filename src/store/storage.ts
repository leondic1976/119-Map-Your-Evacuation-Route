/**
 * 저장·불러오기.
 * 모든 자료는 이용자 기기 안에서만 다룬다. 서버로 보내지 않는다 (CON-2 · CON-8).
 *
 * 저장소와 파일을 직접 만지지 않고 `platform/host` 를 거친다 — Electron 으로
 * 옮겨도 이 파일은 그대로다.
 */
import type { SaveFile } from '../types/save';
import { SCHEMA_VERSION, defaultProfile, emptyProgress } from '../types/save';
import { emptyFloorPlan } from '../types/plan';
import { host } from '../platform/host';
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
  return host().write(KIDS_KEY, JSON.stringify({ ...file, updatedAt: new Date().toISOString() }));
}

export function loadKids(): SaveFile | null {
  const text = host().read(KIDS_KEY);
  if (!text) return null;
  try {
    return parseSave(text);
  } catch {
    return null;
  }
}

export function clearKids(): void {
  host().remove(KIDS_KEY);
}

export function serializeSave(file: SaveFile): string {
  return JSON.stringify({ ...file, schemaVersion: SCHEMA_VERSION }, null, 2);
}

export function downloadText(text: string, filename: string, mime = 'application/json'): void {
  void host().exportFile(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

export function downloadBlob(blob: Blob, filename: string): void {
  void host().exportFile(blob, filename);
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
