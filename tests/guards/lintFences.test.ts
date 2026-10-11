// Guard (CLEANUP-PLAN.md CW1): the lint fences in eslint.config.js work. Reaching for
// toFixed/toPrecision/toExponential, or a 1e-12 however it is spelt, in an app file not on the
// allow-list is an error; the number writer and the noise rule may have both; and the interim
// allow-list never takes a new file or a wider allowance (it only shrinks, part by part).

import { join } from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../helpers/repo'
// @ts-expect-error -- the lint config is plain JavaScript with no type declarations
import { FENCE_ALLOWED } from '../../eslint.config.js'

const eslint = new ESLint({ cwd: REPO_ROOT })
const fenceErrors = async (code: string, file: string): Promise<string[]> => {
  const [r] = await eslint.lintText(code, { filePath: join(REPO_ROOT, file) })
  return r.messages.filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => m.message)
}

type Allow = 'toFixed' | 'noise' | 'both'
const FINAL = ['src/renderer/src/math/format.ts', 'src/renderer/src/math/noise.ts']
/** The interim list when the fences went in (2026-10-09). A file may leave or narrow; none may join or widen. */
const INTERIM_AT_START: Record<string, Allow> = {
  'calc/engine.ts': 'noise',
  'calc/format.ts': 'noise',
  'calc/roots.ts': 'noise',
  'core/evaluate.ts': 'noise',
  'core/visualize.ts': 'noise',
  'lab/fit.ts': 'noise',
  'lang/commands.ts': 'noise',
  'math/checkAnswer.ts': 'noise',
  'math/expr.ts': 'noise',
  'math/geometry.ts': 'noise',
  'math/graphs.ts': 'noise',
  'math/lego.ts': 'noise',
  'math/pure/complex.ts': 'noise',
  'math/pure/table.ts': 'noise',
  'math/pure/trigIdentity.ts': 'both',
  'math/shapeFormulas.ts': 'toFixed',
  'math/shapes.ts': 'noise',
  'math/vec.ts': 'noise',
  'math/vectorSolver.ts': 'noise',
  'panels/Measurements.tsx': 'noise',
  'panels/Properties.tsx': 'noise',
  'panels/vectorCalcStore.ts': 'both',
  'questions/autoVisual.ts': 'both',
  'questions/legoPart.ts': 'noise',
  'render/Interaction.tsx': 'noise',
  'render/Labels.tsx': 'noise',
  'render/gridMath.ts': 'noise',
  'render/pieceLabels.ts': 'noise',
  'render/viewMath.ts': 'noise'
}

describe('guard: the lint fences', () => {
  it('an app file may not reach for toFixed, toPrecision or toExponential, however it is written', async () => {
    const code = [
      'export const a = (x: number) => x.toFixed(2)',
      'export const b = (x: number) => x.toPrecision(3)',
      'export const c = (x?: number) => x?.toFixed(2)',
      "export const d = (x: number) => x['toFixed'](2)",
      'export const e = (x: number) => Number.prototype.toFixed.call(x, 2)',
      'export const f = (x: number) => x.toExponential(2)'
    ].join('\n')
    const found = await fenceErrors(code, 'src/renderer/src/panels/NewPanel.ts')
    expect(found).toHaveLength(6)
    expect(found.every((m) => /math\/format\.ts/.test(m))).toBe(true)
  }, 60_000)

  it('nor pick a 1e-12, however it is spelt', async () => {
    const code = ['export const a = 1e-12', 'export const b = 1E-12', 'export const c = -1e-12', 'export const d = 1.0e-12', 'export const e = 0.000000000001'].join('\n')
    const found = await fenceErrors(code, 'src/renderer/src/panels/NewPanel.ts')
    expect(found).toHaveLength(5)
    expect(found.every((m) => /math\/noise\.ts/.test(m))).toBe(true)
    expect(await fenceErrors('export const ok = 1e-9\nexport const ok2 = 1e-120\n', 'src/renderer/src/panels/NewPanel.ts')).toEqual([])
  }, 60_000)

  it('the number writer and the noise rule may', async () => {
    expect(await fenceErrors('export const a = (x: number) => x.toFixed(2)\nexport const c = 1e-12\n', 'src/renderer/src/math/format.ts')).toEqual([])
    expect(await fenceErrors('export const c = 1e-12\n', 'src/renderer/src/math/noise.ts')).toEqual([])
  }, 60_000)

  it('the interim list is empty after CW9: a former interim file is fenced for both again', async () => {
    // calc/roots.ts was listed for its 1e-12 floors until CW9-N2; render/Labels.tsx until CW9-N1.
    expect(await fenceErrors('export const a = (x: number) => x.toFixed(2)\n', 'src/renderer/src/calc/roots.ts')).toHaveLength(1)
    expect(await fenceErrors('export const c = 1e-12\n', 'src/renderer/src/calc/roots.ts')).toHaveLength(1)
    expect(await fenceErrors('export const c = 1e-12\n', 'src/renderer/src/render/Labels.tsx')).toHaveLength(1)
  }, 60_000)

  it('a file that has left the interim list is fenced again: a new 1e-12 there needs its own reason (CW3b)', async () => {
    expect(await fenceErrors('export const c = 1e-12\n', 'src/renderer/src/calc/engine.ts')).toHaveLength(1)
    expect(await fenceErrors('export const a = (x: number) => x.toPrecision(12)\n', 'src/renderer/src/panels/vectorCalcStore.ts')).toHaveLength(1)
  }, 60_000)

  it('the allow-list only shrinks: no new file, no wider allowance', () => {
    const widens = (now: Allow, then: Allow | undefined): boolean => then === undefined || (then !== 'both' && now !== then)
    const wrong: string[] = []
    for (const { files, allow } of FENCE_ALLOWED as { files: string[]; allow: Allow }[]) {
      for (const f of files) {
        if (FINAL.includes(f)) continue
        const short = f.replace('src/renderer/src/', '')
        if (widens(allow, INTERIM_AT_START[short])) wrong.push(`${short}: ${allow}`)
      }
    }
    expect(wrong).toEqual([])
  })
})
