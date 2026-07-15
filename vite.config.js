import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发时 Vite 跑在 5173，Cloudflare Worker 跑在 8787。
// 浏览器始终请求同源 /api，生产与本地不需要两套地址。
export default defineConfig({
  plugins: [react()],
  server: {
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  build: {
    outDir: 'dist',
    // 单页小应用，先不做手动分包；后续体积大了再按 view 拆。
    chunkSizeWarningLimit: 1500,
  },
});
