/**
 * 외부 패키지 없는 ZIP 쓰기·읽기 (설계서 v1.18 §5.2).
 *
 * 오프라인 꾸러미 하나를 만들기 위해 압축 라이브러리를 들이지 않는다.
 * `node:zlib` 의 deflateRaw 와 crc32 만으로 PKZIP 2.0 형식을 쓴다.
 *   - 파일명은 UTF-8 깃발(비트 11)을 세워 한글 폴더 이름이 어디서나 읽히게 한다
 *   - 글·HTML 은 deflate, MP3 처럼 이미 압축된 것은 그대로 담는다(store)
 *   - 4GB·65,535개 한도의 ZIP64 는 쓰지 않는다 — 꾸러미는 20MB 남짓이다
 *
 * `unzipBuffer` 는 검증용이다. 만든 꾸러미를 다시 풀어 내용이 같은지 tools/logic-tests.ts 가 본다.
 */
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  /** 꾸러미 안 경로. 구분자는 `/` */
  name: string;
  data: Buffer;
  /** true 면 압축하지 않고 그대로 담는다 */
  store?: boolean;
  mtime?: Date;
}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const FLAG_UTF8 = 0x0800;
const VERSION = 20;

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export function zipBuffer(entries: ZipEntry[]): Buffer {
  if (entries.length > 0xffff) throw new Error(`ZIP 항목이 너무 많다: ${entries.length}`);
  const seen = new Set<string>();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    if (seen.has(entry.name)) throw new Error(`ZIP 항목 이름이 겹친다: ${entry.name}`);
    seen.add(entry.name);
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data) >>> 0;
    const method = entry.store ? 0 : 8;
    const body = entry.store ? entry.data : deflateRawSync(entry.data, { level: 9 });
    if (body.length > 0xffffffff || entry.data.length > 0xffffffff) throw new Error(`ZIP64 가 필요한 크기다: ${entry.name}`);
    const { time, date } = dosDateTime(entry.mtime ?? new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(VERSION, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIG, 0);
    central.writeUInt16LE(VERSION, 4);
    central.writeUInt16LE(VERSION, 6);
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }
  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, eocd]);
}

export interface UnzippedEntry {
  name: string;
  data: Buffer;
  method: 0 | 8;
}

/** 검증용 되읽기 — 중앙 목록을 따라 항목을 풀고 CRC 를 맞춰 본다 */
export function unzipBuffer(zip: Buffer): UnzippedEntry[] {
  let eocdAt = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i -= 1) {
    if (zip.readUInt32LE(i) === EOCD_SIG) {
      eocdAt = i;
      break;
    }
  }
  if (eocdAt < 0) throw new Error('ZIP 끝 기록이 없다');
  const count = zip.readUInt16LE(eocdAt + 10);
  let at = zip.readUInt32LE(eocdAt + 16);
  const out: UnzippedEntry[] = [];
  for (let n = 0; n < count; n += 1) {
    if (zip.readUInt32LE(at) !== CENTRAL_SIG) throw new Error(`중앙 목록 서명이 다르다 (${n})`);
    const method = zip.readUInt16LE(at + 10) as 0 | 8;
    const crc = zip.readUInt32LE(at + 16);
    const compressed = zip.readUInt32LE(at + 20);
    const size = zip.readUInt32LE(at + 24);
    const nameLen = zip.readUInt16LE(at + 28);
    const extraLen = zip.readUInt16LE(at + 30);
    const commentLen = zip.readUInt16LE(at + 32);
    const localAt = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLen).toString('utf8');
    if (zip.readUInt32LE(localAt) !== LOCAL_SIG) throw new Error(`항목 서명이 다르다: ${name}`);
    const localNameLen = zip.readUInt16LE(localAt + 26);
    const localExtraLen = zip.readUInt16LE(localAt + 28);
    const bodyAt = localAt + 30 + localNameLen + localExtraLen;
    const body = zip.subarray(bodyAt, bodyAt + compressed);
    const data = method === 0 ? Buffer.from(body) : inflateRawSync(body);
    if (data.length !== size) throw new Error(`푼 크기가 다르다: ${name}`);
    if ((crc32(data) >>> 0) !== crc) throw new Error(`CRC 가 다르다: ${name}`);
    out.push({ name, data, method });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
