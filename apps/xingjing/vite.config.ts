import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    open: false,
    hmr: true,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
})
