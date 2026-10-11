// Which chunk the build puts a module in (CW11). The rule lives in electron.vite.config.ts and
// vite.web.config.ts uses the same one; a test cannot run the build, so it runs the rule itself
// against the module ids the build hands it.

import { describe, expect, it } from 'vitest'
import { rendererChunk } from '../electron.vite.config'

const NM = 'C:/my_projects/physics/node_modules'

describe('the mathjs chunk (CW11)', () => {
  it('takes mathjs and every library mathjs depends on, and nothing else of the app', () => {
    // mathjs 15's own dependencies (its package.json), each as the build names a file in it.
    const own = ['mathjs/lib/esm/entry/mainAny.js', 'typed-function/lib/esm/typed-function.mjs', 'decimal.js/decimal.mjs', 'complex.js/dist/complex.mjs', 'fraction.js/dist/fraction.mjs', 'javascript-natural-sort/naturalSort.js', 'escape-latex/dist/index.js', 'seedrandom/index.js', 'tiny-emitter/index.js', '@babel/runtime/helpers/esm/extends.js']
    for (const f of own) expect(rendererChunk(`${NM}/${f}`), f).toBe('mathjs')
    // Windows paths reach the rule with backslashes too.
    expect(rendererChunk(`${NM}/mathjs/lib/esm/core/create.js`.replace(/\//g, '\\'))).toBe('mathjs')
    // The CommonJS helpers go with it: in the main chunk they would make the two chunks import each other.
    expect(rendererChunk('\0commonjsHelpers.js')).toBe('mathjs')
  })

  it('leaves the app, three.js and every other library where the build puts them', () => {
    const others = [
      'C:/my_projects/physics/src/renderer/src/math/expr.ts',
      `${NM}/three/build/three.webgpu.js`,
      `${NM}/react-dom/cjs/react-dom-client.production.js`,
      `${NM}/katex/dist/katex.mjs`,
      `${NM}/dockview-core/dist/package/main.esm.mjs`,
      // A name that only starts like one of mathjs's libraries is not one of them.
      `${NM}/mathjs-extra/index.js`,
      `${NM}/@babel/runtime-corejs3/helpers/extends.js`
    ]
    for (const f of others) expect(rendererChunk(f), f).toBeUndefined()
  })
})

describe('the renderer build is minified (CW11b)', () => {
  // electron-vite leaves the renderer unminified unless asked: index was 8.3 MB of plain source in the installer.
  it('asks for esbuild minification of the renderer', async () => {
    const config = (await import('../electron.vite.config')).default as { renderer?: { build?: { minify?: unknown } } }
    expect(config.renderer?.build?.minify).toBe('esbuild')
  })
})
