import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 상대 경로로 내보낸다. 어느 하위 경로에 올려도 그대로 돈다(설계서 §12).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
  },
});
