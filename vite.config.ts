import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/upload': 'http://localhost:3001',
      '/list': 'http://localhost:3001',
      '/delete': 'http://localhost:3001',
      '/metadata': 'http://localhost:3001',
    },
  },
})
