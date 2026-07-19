import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    // Чтобы избежать ошибки в браузере global is undefined
    global: {},
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
      '@assets': '/assets',
    },
  },
})
