// 本地代表区域样片；共用候选快照位于同级设计资料中。
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: ['..'] }, watch: { usePolling: true, interval: 1000 } },
  build: { chunkSizeWarningLimit: 900 },
});
