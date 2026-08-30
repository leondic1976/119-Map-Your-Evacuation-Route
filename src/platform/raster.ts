/**
 * SVG → PNG. 외부 라이브러리를 쓰지 않는다 (설계서 v1.0 §5.6).
 *
 * 인쇄용 SVG 에는 바깥 이미지와 웹폰트를 넣지 않는다 — 캔버스가 더럽혀져
 * `toBlob` 이 막힌다.
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
