import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

const appVersion = pkg.version

export default defineConfig(() => ({
  plugins: [
    react(),
    {
      name: 'inject-app-version',
      transformIndexHtml(html) {
        return html.replace(/SPC-MONITOR v[\d.]+/, `SPC-MONITOR v${appVersion}`)
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:18080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
}))
