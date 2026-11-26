/**
 * 인쇄 한 장을 PDF 파일로 만든다(대장 #190) — 선생님께 낼 수 있게.
 * 인쇄물과 같은 내용을 그림 한 장에 그리고 `core/pdf.ts` 가 A4 한 쪽으로 싼다. 아무것도 밖으로 보내지 않는다.
 */
import { A4, jpegPdf } from '../core/pdf';
import { NO_EXTINGUISHER, PROMISES } from '../content/report';
import { isVerified } from '../content/sources';
import { STAMPS } from '../content/stamps';

/** 종이의 점 수 — 1인치에 200점 */
const W = 1654;
const H = Math.round((W * A4.h) / A4.w);
const PT = W / A4.w;
const MARGIN = 34;
const BODY = 13;
const LINE = 1.4;
const MAP_MAX = 334;
const INK = '#000';

/** 지도 그림에 그대로 옮겨 적는 모양. 그림으로 바꾸면 화면의 CSS 가 닿지 않는다 */
const KEEP = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'paint-order', 'visibility'];

export interface SheetData {
  title: string;
  stamps: string[];
  secondRoute: boolean;
  noExtinguisher: boolean;
}

/** 지도를 CSS 없이도 같은 모양인 그림으로 바꾼다. 글자는 빼고 `mapWords` 가 화면의 글꼴로 따로 쓴다 — 그림 안에서는 앱의 글꼴이 닿지 않는다 */
function mapImage(svg: SVGSVGElement, w: number, h: number): Promise<HTMLImageElement> {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const from = [svg, ...Array.from(svg.querySelectorAll('*'))];
  const to = [copy, ...Array.from(copy.querySelectorAll('*'))];
  from.forEach((el, i) => {
    const style = window.getComputedStyle(el);
    const target = to[i]!;
    target.removeAttribute('class');
    if (style.display === 'none' && el !== svg) {
      target.setAttribute('style', 'display:none');
      return;
    }
    let css = '';
    for (const name of KEEP) {
      const value = style.getPropertyValue(name);
      // 무늬 주소는 그림 안의 것만 가리키게 한다
      if (value) css += `${name}:${value.replace(/url\("?[^#")]*#([^")]*)"?\)/g, 'url(#$1)')};`;
    }
    target.setAttribute('style', css);
  });
  copy.querySelectorAll('text').forEach((el) => el.remove());
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', String(w));
  copy.setAttribute('height', String(h));
  copy.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const xml = new XMLSerializer().serializeToString(copy);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('map'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  });
}

/** 지도의 글자를 그림 위 같은 자리에 쓴다. 상자는 지도 그림이 놓인 자리다 */
function mapWords(ctx: CanvasRenderingContext2D, svg: SVGSVGElement, box: { x: number; y: number; w: number; h: number }, family: string): void {
  const view = svg.viewBox.baseVal;
  const scale = Math.min(box.w / view.width, box.h / view.height);
  for (const el of Array.from(svg.querySelectorAll('text'))) {
    // 바깥 묶음부터 차례로 옮김을 곱한다. 숨긴 묶음의 글자는 쓰지 않는다
    let matrix = new DOMMatrix();
    let hidden = false;
    const chain: Element[] = [];
    for (let node: Element | null = el; node && node !== svg; node = node.parentElement) chain.unshift(node);
    for (const node of chain) {
      if (window.getComputedStyle(node).display === 'none') hidden = true;
      const list = (node as SVGGraphicsElement).transform?.baseVal;
      for (let i = 0; list && i < list.numberOfItems; i++) matrix = matrix.multiply(DOMMatrix.fromMatrix(list.getItem(i).matrix));
    }
    const text = el.textContent ?? '';
    if (hidden || !text) continue;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden') continue;
    const x = Number(el.getAttribute('x') ?? 0);
    const y = Number(el.getAttribute('y') ?? 0);
    ctx.save();
    ctx.translate(box.x + (box.w - view.width * scale) / 2, box.y + (box.h - view.height * scale) / 2);
    ctx.scale(scale, scale);
    ctx.translate(-view.x, -view.y);
    ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
    ctx.font = `${style.fontSize} ${family}`;
    ctx.textAlign = style.textAnchor === 'middle' ? 'center' : style.textAnchor === 'end' ? 'right' : 'left';
    ctx.textBaseline = /middle|central/.test(style.dominantBaseline) ? 'middle' : 'alphabetic';
    ctx.globalAlpha = Number(style.opacity) || 1;
    if (style.stroke && style.stroke !== 'none') {
      ctx.lineJoin = 'round';
      ctx.lineWidth = parseFloat(style.strokeWidth) || 1;
      ctx.strokeStyle = style.stroke;
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = style.fill;
    ctx.fillText(text, x, y);
    ctx.restore();
  }
}

/** 낱말 한가운데서 끊지 않고 줄을 나눈다 */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const waiting = (sourceIds: string[]): string => (isVerified(sourceIds) ? '' : ' (검수 대기)');

/** 인쇄 한 장과 같은 내용의 PDF. `sheet` 는 화면에 숨겨 둔 인쇄 한 장이다 */
export async function sheetPdf(sheet: HTMLElement, data: SheetData): Promise<Blob> {
  const svg = sheet.querySelector<SVGSVGElement>('svg.plan');
  if (!svg) throw new Error('map');
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  const family = window.getComputedStyle(document.body).fontFamily;
  // 글꼴은 쓰는 글자의 조각만 받는다. 이 장에 쓸 글자의 조각을 먼저 받아 둔다
  const words = `${data.title}${sheet.textContent ?? ''}${Object.values(STAMPS).map((s) => s.label).join('')}0123456789().·—`;
  await document.fonts?.load(`20px ${family}`, words).catch(() => undefined);
  const p = (n: number): number => n * PT;
  const font = (size: number): void => {
    ctx.font = `${Math.round(p(size))}px ${family}`;
  };
  const left = p(MARGIN);
  const wide = W - left * 2;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'top';

  // 지도 아래에 올 글의 높이를 먼저 잰다. 남는 자리를 지도가 가진다
  font(BODY);
  const promises = PROMISES.map((item, i) => wrap(ctx, `${i + 1}. ${item.text}${waiting(item.sourceIds)}`, wide - p(4)));
  const task = data.noExtinguisher ? wrap(ctx, `어른과 할 일 — ${NO_EXTINGUISHER.print}${waiting(NO_EXTINGUISHER.sourceIds)}`, wide - p(20)) : [];
  const lineH = BODY * LINE;
  const headH = 10 + 17 * 1.3 + 4;
  const titleH = 24 * 1.3 + 8;
  const legendH = 6 + lineH;
  const stampsH = data.stamps.length ? headH + 30 + 4 + 11 * 1.3 + 4 : 0;
  const promisesH = headH + promises.reduce((n, lines) => n + lines.length, 0) * lineH;
  const taskH = task.length ? 8 + task.length * lineH + 10 : 0;
  const footH = 8 + 10 * 1.3;
  const mapH = Math.min(MAP_MAX, A4.h - MARGIN * 2 - titleH - legendH - stampsH - promisesH - taskH - footH);
  if (mapH < 120) throw new Error('room');

  let y = MARGIN;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  font(24);
  ctx.fillText(data.title, W / 2, p(y));
  y += titleH;

  const pad = p(4);
  const map = await mapImage(svg, Math.round(wide - pad * 2), Math.round(p(mapH) - pad * 2));
  ctx.drawImage(map, left + pad, p(y) + pad);
  mapWords(ctx, svg, { x: left + pad, y: p(y) + pad, w: map.width, h: map.height }, family);
  ctx.textBaseline = 'top';
  ctx.lineWidth = p(1.5);
  ctx.strokeStyle = INK;
  ctx.strokeRect(left, p(y), wide, p(mapH));
  y += mapH + 6;

  // 색 풀이
  font(BODY);
  ctx.textAlign = 'left';
  const legend: [string, string][] = [['#ffe3a3', '방'], ['#c6e8f8', '지나가는 곳'], ['#d6402f', '나가는 길']];
  if (data.secondRoute) legend.push(['#c97a12', '둘째 길']);
  const widths = legend.map(([, label]) => p(16 + 4) + ctx.measureText(label).width);
  let x = (W - widths.reduce((a, b) => a + b, 0) - p(16) * (legend.length - 1)) / 2;
  legend.forEach(([color, label], i) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, p(y + 2.5), p(16), p(12));
    ctx.lineWidth = p(1);
    ctx.strokeRect(x, p(y + 2.5), p(16), p(12));
    ctx.fillStyle = INK;
    ctx.fillText(label, x + p(20), p(y + (lineH - BODY) / 2));
    x += widths[i]! + p(16);
  });
  y += lineH;

  const head = (text: string): void => {
    y += 10;
    font(17);
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    ctx.fillText(text, left, p(y));
    y += 17 * 1.3 + 4;
  };

  if (data.stamps.length) {
    head('대피 연습에서 받은 칭찬 도장');
    const glyphs = Array.from(sheet.querySelectorAll('.stamp-face path')).map((el) => el.getAttribute('d') ?? '');
    font(11);
    ctx.textAlign = 'center';
    data.stamps.forEach((id, i) => {
      const cx = left + p(32 + i * 68);
      const cy = p(y + 15);
      ctx.beginPath();
      ctx.arc(cx, cy, p(14), 0, Math.PI * 2);
      ctx.fillStyle = '#e4f4e6';
      ctx.fill();
      ctx.lineWidth = p(2);
      ctx.strokeStyle = '#2f7d4f';
      ctx.stroke();
      // 도장 그림은 24 칸짜리 선 그림이다
      ctx.save();
      ctx.translate(cx - p(9), cy - p(9));
      ctx.scale(p(18) / 24, p(18) / 24);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (glyphs[i]) ctx.stroke(new Path2D(glyphs[i]));
      ctx.restore();
      ctx.fillStyle = INK;
      ctx.fillText(STAMPS[id as keyof typeof STAMPS]?.label ?? '', cx, p(y + 34));
    });
    y += 30 + 4 + 11 * 1.3 + 4;
  }

  head('우리 집 약속');
  font(BODY);
  for (const lines of promises) {
    lines.forEach((line, i) => {
      ctx.fillText(line, left + p(i ? 16 : 4), p(y + (lineH - BODY) / 2));
      y += lineH;
    });
  }

  if (task.length) {
    y += 8;
    ctx.setLineDash([p(4), p(3)]);
    ctx.lineWidth = p(1.5);
    ctx.strokeStyle = INK;
    ctx.strokeRect(left, p(y), wide, p(task.length * lineH + 6));
    ctx.setLineDash([]);
    y += 3;
    for (const line of task) {
      ctx.fillText(line, left + p(8), p(y + (lineH - BODY) / 2));
      y += lineH;
    }
    y += 7;
  }

  y += 8;
  font(10);
  ctx.fillStyle = '#333';
  ctx.fillText('불이 나면 119 · 소방청 캐릭터 영이·일구·웅이(공공누리 제1유형)', left, p(y));

  const jpeg = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('jpeg'))), 'image/jpeg', 0.92);
  });
  const bytes = jpegPdf(new Uint8Array(await jpeg.arrayBuffer()), { w: W, h: H }, data.title);
  return new Blob([bytes], { type: 'application/pdf' });
}

/** 파일 이름에 쓸 수 없는 글자를 뺀다 */
export const sheetFileName = (title: string): string => `${title.replace(/[\\/:*?"<>|]/g, '').trim()}.pdf`;
