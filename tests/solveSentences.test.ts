// H18: the command bar's own sentences about solutions — solve() of a linear or quadratic line, an
// equation in x alone, its complex solutions — wrote a power of ten with a caret ("x = 1×10^-8").
// Every other sentence in the app raises it (math/format.ts superscriptPowers): "x = 1 × 10⁻⁸".
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/cas', () => ({
  cas: vi.fn(async (op: string) => ({ latex: `\\text{${op}}`, text: `${op}(x)`, numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {} },
  CAS_OPS: []
}))
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { runCommand } from '../src/renderer/src/lang/commands'
import { scene } from '../src/renderer/src/core/store'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  scene().setViewMode('2d')
})

/** Every sentence a line leaves in the log, as the student reads it. */
async function said(line: string): Promise<string> {
  await runCommand(line)
  return scene()
    .log.map((l) => l.text ?? '')
    .join(' | ')
}

describe('H18 — a power of ten in a sentence about solutions is raised, never a caret', () => {
  // An equation in x alone: its real solutions, the repeat of a periodic one, and its complex solutions.
  for (const line of ['x^2 = 1e-16', 'x^2 + 1e-16 = 0', 'sin(x) = 1e-9']) {
    it(line, async () => {
      const text = await said(line)
      expect(text, text).not.toMatch(/\^|×10/)
      expect(text, text).toMatch(/10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+/)
    })
  }

  // solve() answers in exact LaTeX (\frac{1}{100000000}), which never had a caret: a guard.
  it('solve(x^2 = 1e-16) answers in LaTeX with no caret', async () => {
    await runCommand('solve(x^2 = 1e-16)')
    const tex = scene().log.at(-1)?.tex ?? ''
    expect(tex).toMatch(/frac/)
    expect(tex).not.toMatch(/×10\^/)
  })
})
