/**
 * 정적 내보내기 미리보기 서버.
 * 외부 패키지 없이 out/ 을 그대로 띄운다 (오프라인 환경 대비).
 *
 *   npm run build && npm start
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const dir = path.join(process.cwd(), 'out');
const port = Number(process.env.PORT) || 4173;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

if (!fs.existsSync(path.join(dir, 'index.html'))) {
  process.stderr.write('\n  out/index.html 이 없다. 먼저 npm run build 를 실행한다.\n\n');
  process.exit(1);
}

http
  .createServer((req, res) => {
    const raw = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.join(dir, raw);
    if (raw.endsWith('/')) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      const alt = `${file}.html`;
      if (fs.existsSync(alt)) file = alt;
      else {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('찾을 수 없다');
        return;
      }
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => {
    process.stdout.write(`\n  http://localhost:${port} 에서 미리보기\n\n`);
  });
