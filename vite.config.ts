import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 1420,
  },
  build: {
    outDir: 'dist',
    // Electron 生产模式下使用相对路径
    base: './',
  },
})
