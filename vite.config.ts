import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
// @ts-ignore
import eslint from 'vite-plugin-eslint'

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    // Чтобы избежать ошибки в браузере global is undefined
    global: {},
  },
  plugins: [react(), eslint()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
