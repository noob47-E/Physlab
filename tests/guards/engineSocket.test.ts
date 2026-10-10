// Guard (CLEANUP-PLAN.md CW15): the engine socket holds. No app file outside the socket
// (math/engine/), the SymPy worker (workers/cas.worker.ts) and the bundled engine files (public/)
// names SymPy, Pyodide, mpmath or Python, and none imports an adapter's own files — everything asks
// through math/engine. So another engine (Giac, Rubi) plugs in by writing an adapter, passing
// tests/engine/conformance.ts and pointing its jobs at it in math/engine/index.ts.

import fs from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../helpers/repo'
import { ENGINE_FOR } from '../../src/renderer/src/math/engine'
import { ENGINE_JOBS } from '../../src/renderer/src/math/engine/types'

const SRC = join(REPO_ROOT, 'src')
const ADAPTERS = ['src/renderer/src/math/engine/', 'src/renderer/src/workers/cas.worker.ts', 'src/renderer/public/']

function appFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) appFiles(p, out)
    else if (/\.(ts|tsx|mjs|cjs|js)$/.test(e.name)) out.push(relative(REPO_ROOT, p).replace(/\\/g, '/'))
  }
  return out
}

const outside = appFiles(SRC).filter((f) => !ADAPTERS.some((a) => f.startsWith(a)))

describe('guard: the engine socket', () => {
  it('no app file outside the socket names the engine', () => {
    const named = outside.flatMap((f) =>
      fs
        .readFileSync(join(REPO_ROOT, f), 'utf8')
        .split('\n')
        .map((line, i) => (/sympy|mpmath|pyodide|python/i.test(line) ? `${f}:${i + 1}: ${line.trim().slice(0, 100)}` : ''))
        .filter(Boolean)
    )
    expect(named).toEqual([])
  })

  it('nothing outside the socket imports an adapter', () => {
    const reaching = outside.filter((f) => /from\s+['"][^'"]*math\/engine\/(sympy|dummy)/.test(fs.readFileSync(join(REPO_ROOT, f), 'utf8')))
    expect(reaching).toEqual([])
  })

  it('every job has an engine to answer it', () => {
    expect(Object.keys(ENGINE_FOR).sort()).toEqual([...ENGINE_JOBS].sort())
  })

  it('looks at the app (and would see a name)', () => {
    expect(outside.length).toBeGreaterThan(200)
    expect(/sympy|mpmath|pyodide|python/i.test('the SymPy worker')).toBe(true)
  })
})
