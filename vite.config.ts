import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      // app.html es el entry del bundle React
      // index.html (vanilla JS) se copia al dist/ en el deploy script
      input: {
        app: 'app.html',
      },
    },
  },
})
