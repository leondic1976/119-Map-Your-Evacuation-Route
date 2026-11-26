import fs from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 판 번호 — 공개되는 판은 저장소 뿌리의 package.json 한 곳에서 정한다. V2 만 따로 떼어 쓸 때는 제 package.json 의 것을 쓴다.
 * 웹 화면과 오프라인 HTML 에 같은 번호를 심어, 올린 뒤에 웹과 프로그램이 같은 판인지 견준다(대장 #184).
 */
function appVersion(): string {
  for (const file of ['../package.json', './package.json']) {
    try {
      const version = (JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8')) as { version?: string }).version;
      if (version) return version;
    } catch {
      /* 다음 파일을 본다 */
    }
  }
  return '0.0.0';
}
const version = appVersion();
const stamp: Plugin = {
  name: 'app-version',
  transformIndexHtml: (html) => html.replace('<title>', `<meta name="app-version" content="${version}" />\n    <title>`),
};
const define = { __APP_VERSION__: JSON.stringify(version) };

// 상대 경로로 내보낸다. 어느 하위 경로에 올려도 그대로 돈다(설계서 §12).
export default defineConfig(({ mode }) => {
  // 오프라인 판은 file:// 에서 열린다. 모듈 파일을 따로 받을 수 없으므로 3D 까지 한 묶음으로 만든다.
  // 묶음을 HTML 안에 넣는 일은 tools/offline.ts 가 한다
  if (mode === 'offline') {
    return {
      base: './',
      plugins: [react(), stamp],
      define,
      publicDir: false,
      build: {
        outDir: '.offline-build',
        emptyOutDir: true,
        assetsInlineLimit: 0,
        modulePreload: false,
        chunkSizeWarningLimit: 4000,
        rollupOptions: { output: { inlineDynamicImports: true } },
      },
    };
  }
  return {
    base: './',
    plugins: [react(), stamp],
    define,
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 900,
    },
  };
});
