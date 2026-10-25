// 网页构建配置：Pages 子路径由构建命令传入，日常开发使用根路径。
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 900 },
});
