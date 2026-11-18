import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

export default defineConfig({
  plugins: [
    react(),
    // index.html (vanilla JS) no pasa por el build: en `npm run dev` se reemplaza su marcador
    // de versión al servirlo; en producción lo hace deploy.sh sobre dist/index.html
    {
      name: 'squadly-app-version',
      apply: 'serve',
      // 'pre': antes de que Vite extraiga el <script type="module"> inline a un módulo aparte
      transformIndexHtml: { order: 'pre', handler: html => html.replaceAll('__APP_VERSION__', pkg.version) },
    },
  ],
  // Versión visible en la app (pie del lobby y la sala). Fuente única: package.json
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      // app.html es el entry del bundle React
      // index.html (vanilla JS) se copia al dist/ en el deploy script
      input: {
        app: 'app.html',
        authStart: 'auth-start.html',
      },
    },
  },
})
