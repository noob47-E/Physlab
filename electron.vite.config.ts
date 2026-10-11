import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'

/**
 * mathjs and the libraries only it uses load as a chunk of their own (CW11). math/expr.ts imports
 * mathjs at start, so the same bytes still load at start; the main chunk is 2 MB smaller and the
 * two files load side by side. @babel/runtime (mathjs's helper, also drei's) and the CommonJS
 * helpers go with them: left in the main chunk, the two chunks would import each other, and the
 * mathjs chunk would run before the helpers it calls had been set up. vite.web.config.ts uses
 * this same rule, so the browser build splits the same way.
 */
const MATHJS = /[\\/]node_modules[\\/](mathjs|typed-function|decimal\.js|complex\.js|fraction\.js|javascript-natural-sort|escape-latex|seedrandom|tiny-emitter|@babel[\\/]runtime)[\\/]/

export function rendererChunk(id: string): string | undefined {
  if (MATHJS.test(id) || id === '\0commonjsHelpers.js') return 'mathjs'
  return undefined
}

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), tailwindcss()],
    worker: { format: 'es' },
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    optimizeDeps: { exclude: ['pyodide'] },
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
      }
    },
    // Minified (CW11b): electron-vite leaves the renderer as plain source unless asked. Nothing at run time reads a
    // function's own name (mathjs functions are registered by key, formula names are parsed identifiers).
    build: { target: 'esnext', minify: 'esbuild', rollupOptions: { output: { manualChunks: rendererChunk } } }
  }
})
