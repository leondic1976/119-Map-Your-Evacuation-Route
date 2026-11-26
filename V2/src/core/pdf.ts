/**
 * 그림 한 장을 A4 한 쪽짜리 PDF 로 싼다(대장 #190).
 * 라이브러리 없이 바이트를 직접 쓴다. 글자는 그림 안에 있어 글꼴을 싣지 않는다.
 */

/** A4 세로 — PDF 의 길이 단위(1/72 인치) */
export const A4 = { w: 595.28, h: 841.89 };

const ascii = (text: string): Uint8Array => Uint8Array.from(text, (ch) => ch.charCodeAt(0) & 0xff);

/** 한글 제목은 UTF-16BE 16진 글줄로 적는다 */
const hexText = (text: string): string => {
  let out = 'FEFF';
  for (let i = 0; i < text.length; i++) out += text.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${out}>`;
};

/** JPEG 한 장이 종이를 가득 채우는 PDF. px 는 그림의 가로·세로 점 수다 */
export function jpegPdf(jpeg: Uint8Array, px: { w: number; h: number }, title: string): Uint8Array {
  const draw = `q ${A4.w} 0 0 ${A4.h} 0 0 cm /Im0 Do Q`;
  const objects: (string | [string, Uint8Array])[] = [
    '<< /Type /Catalog /Pages 2 0 R /Lang (ko-KR) >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    [`<< /Type /XObject /Subtype /Image /Width ${px.w} /Height ${px.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg],
    [`<< /Length ${draw.length} >>`, ascii(draw)],
    `<< /Title ${hexText(title)} >>`,
  ];
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const put = (bytes: Uint8Array): void => {
    parts.push(bytes);
    size += bytes.length;
  };
  // 둘째 줄의 높은 바이트 넷은 「글이 아니라 바이트」라는 표시다
  put(ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
  objects.forEach((object, i) => {
    offsets.push(size);
    if (typeof object === 'string') put(ascii(`${i + 1} 0 obj\n${object}\nendobj\n`));
    else {
      put(ascii(`${i + 1} 0 obj\n${object[0]}\nstream\n`));
      put(object[1]);
      put(ascii('\nendstream\nendobj\n'));
    }
  });
  const xref = size;
  const rows = offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`).join('');
  put(ascii(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${rows}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  const out = new Uint8Array(size);
  let at = 0;
  for (const bytes of parts) {
    out.set(bytes, at);
    at += bytes.length;
  }
  return out;
}
