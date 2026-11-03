import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 상대 경로로 내보낸다. 어느 하위 경로에 올려도 그대로 돈다(설계서 §12).
export default defineConfig(({ mode }) => {
  // 오프라인 판은 file:// 에서 열린다. 모듈 파일을 따로 받을 수 없으므로 3D 까지 한 묶음으로 만든다.
  // 묶음을 HTML 안에 넣는 일은 tools/offline.ts 가 한다
  if (mode === 'offline') {
    return {
      base: './',
      plugins: [react()],
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
    plugins: [react()],
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 900,
    },
  };
});
