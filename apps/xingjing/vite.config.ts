import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3003,
    strictPort: true,
    host: '127.0.0.1', // 显式绑定 IPv4，确保 Tauri WKWebView 可以通过 127.0.0.1:3003 访问
    open: false,
    hmr: true,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
})
