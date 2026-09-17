// Serves the renderer alone in a browser (http://localhost:5199) for quick testing.
// PORT overrides the port, so a second session can preview at the same time.
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  optimizeDeps: { exclude: ['pyodide'] },
  server: {
    port: Number(process.env.PORT) || 5199,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  build: { target: 'esnext' }
})
