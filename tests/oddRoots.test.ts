// The owner's rule: an odd root of a negative number is the real root, (−8)^(1/3) = −2, everywhere
// (09\CLEANUP-PLAN.md, the owner's settled decisions, 2026-10-08). calc/engine.ts
// `evaluateWithRealRoots` is the rule. The Calculator and the ∛, cbrt and nthRoot forms always
// followed it; the bar's own powers and the numbers it makes follow it since CW7a; a graph's formula
// waits for CW6a's merge (math/expr.ts).

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The algebra engine's exact form for a few lines, as the real SymPy worker answers them (recorded with
// Pyodide, 2026-10-10): it reads an odd root of a negative number as its principal value. Any other
// request gets the bar sweep's stand-in. Inside the factory, because vi.mock runs before the file's own lines.
vi.mock('../src/renderer/src/math/engine/sympy/worker', () => {
  const exact: Record<string, { latex: string; text: string; numeric: { re: number; im?: number } }> = {
    '(-8)^(-1/3)': { latex: '\\frac{1}{4} - \\frac{\\sqrt{3} i}{4}', text: '1/4 - sqrt(3)*I/4', numeric: { re: 0.25, im: -0.4330127018922193 } },
    '(-2)^(1/3)': { latex: '\\frac{\\sqrt[3]{2} \\left(1 + \\sqrt{3} i\\right)}{2}', text: '2**(1/3)*(1 + sqrt(3)*I)/2', numeric: { re: 0.6299605249474366, im: 1.0911236359717214 } },
    'cbrt(-10)': { latex: '\\frac{\\sqrt[3]{10} \\left(1 + \\sqrt{3} i\\right)}{2}', text: '10**(1/3)*(1 + sqrt(3)*I)/2', numeric: { re: 1.077217345015942, im: 1.865795172362064 } },
    'cbrt(-8)/3': { latex: '\\frac{1}{3} + \\frac{\\sqrt{3} i}{3}', text: '1/3 + sqrt(3)*I/3', numeric: { re: 0.3333333333333333, im: 0.5773502691896257 } },
    'sqrt(2)': { latex: '\\sqrt{2}', text: 'sqrt(2)', numeric: { re: 1.4142135623730951 } }
  }
  return {
    cas: vi.fn(async (op: string, payload: { expr?: string } = {}) =>
      (op === 'exact' && payload.expr !== undefined && exact[payload.expr]) || { latex: `\\text{${op}}`, text: `${op}(x)`, numeric: null }
    ),
    useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {} },
    CAS_OPS: []
  }
})
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { evaluateWithRealRoots } from '../src/renderer/src/calc/engine'
import { compileScalar, math } from '../src/renderer/src/math/expr'
import { runCommand } from '../src/renderer/src/lang/commands'
import { scene } from '../src/renderer/src/core/store'
import { solutionsInX } from '../src/renderer/src/core/visualize'
import { resetGlobals } from './helpers/globals'

beforeEach(resetGlobals)

/** What the bar's log says for one line, as the `bar` sweep records it. */
async function bar(line: string): Promise<string> {
  scene().newScene()
  scene().clearLog()
  await runCommand(line)
  // The engine's exact form lands a moment after the answer, as in the bar sweep.
  await new Promise((r) => setTimeout(r, 0))
  return scene()
    .log.map((l) => [l.kind, l.text ? `text: ${l.text}` : '', l.tex ? `tex: ${l.tex}` : ''].filter(Boolean).join(' | '))
    .join(' || ')
}

describe('(−8)^(1/3) = −2 (owner): the routes that already follow it', () => {
  it('evaluateWithRealRoots, the rule itself: the real root, with the principal value in its note', () => {
    const run = evaluateWithRealRoots(math.parse('(-8)^(1/3)'), {})
    expect(run.value).toBe(-2)
    expect(run.roots).toEqual(['real root — principal value 1 + 1.732050808i'])
    expect(evaluateWithRealRoots(math.parse('(-8)^(2/3)'), {}).value).toBe(4)
  })

  it('the bar already answers ∛, cbrt and nthRoot with the real root', async () => {
    expect(await bar('∛-8')).toBe('result | text: = −2')
    expect(await bar('cbrt(-8)')).toBe('result | text: = −2')
    expect(await bar('nthRoot(-8, 3)')).toBe('result | text: = −2')
  })
})

describe('(−8)^(1/3) = −2 (owner): the bar and its numbers, since CW7a', () => {
  it('the bar answers a fractional power of a negative number with its real root', async () => {
    expect(await bar('(-8)^(1/3)')).toBe('result | text: = −2')
    expect(await bar('(-8)^(2/3)')).toBe('result | text: = 4')
    expect(await bar('(-32)^(1/5)')).toBe('result | text: = −2')
  })
  it('an even root of a negative number is still imaginary', async () => {
    expect(await bar('(-8)^(1/2)')).toBe('result | text: = 2.828427125i')
  })
  it('an exact form is shown only when it is the number beside it: the engine’s principal value never stands beside a real root', async () => {
    expect(await bar('(-8)^(-1/3)')).toBe('result | text: = −0.5')
    expect(await bar('(-2)^(1/3)')).toBe('result | text: = −1.26')
    // ∛ of a negative number was real on the bar all along (mathjs), but a line holding one whose answer is not
    // whole asked the engine for an exact form, which came back as the principal value: before CW7a the bar wrote
    // ∛(−10) as "∛10(1 + √3 i)/2 ≈ −2.15" and ∛−8/3, a whole cube, as "1/3 + (√3/3)i ≈ −0.67".
    expect(await bar('∛-10')).toBe('result | text: = −2.15')
    expect(await bar('cbrt(-10)')).toBe('result | text: = −2.15')
    expect(await bar('∛-8/3')).toBe('result | text: = −0.67')
    // A real exact form is still shown, and a complex answer is written as before.
    expect(await bar('sqrt(2)')).toBe('result | tex: = \\sqrt{2} \\approx 1.41')
    expect(await bar('sqrt(-4)')).toBe('result | text: = 2i')
  })
  it('n = (−8)^(1/3) makes the number n = −2 (it was refused as "not a number")', async () => {
    await bar('n = (-8)^(1/3)')
    const n = Object.values(scene().objects).find((o) => o.name === 'n')
    expect(n && scene().ev.values.get(n.id)).toEqual({ type: 'number', value: -2 })
  })
})

// Waits for CW6a's merge (the wave head applies it in the next part that holds math/expr.ts; the owner
// has already chosen the rule, so this is not a question for the owner). A graph's formula
// (math/expr.ts compileScalar) and the bar's solutions in x read x^(1/3) as mathjs does, so
// y = x^(1/3) has no curve left of 0 and x^(1/3) = −2 has no solution.
describe('(−8)^(1/3) = −2 (owner): the graph route, after CW6a', () => {
  it('evidence: x^(1/3) has no value at x = −8, and x^(1/3) = −2 is said to have no real x', () => {
    expect(compileScalar('x^(1/3)', ['x'], () => ({}))({ x: -8 })).toBeNaN()
    expect(solutionsInX('x^(1/3) + 2', ['x^(1/3)', '-2'], {})).toEqual({ kind: 'none', complex: [] })
  })
  it.fails('y = x^(1/3) is −2 at x = −8, and x^(1/3) = −2 is solved as x = −8', () => {
    expect(compileScalar('x^(1/3)', ['x'], () => ({}))({ x: -8 })).toBeCloseTo(-2, 12)
    expect(solutionsInX('x^(1/3) + 2', ['x^(1/3)', '-2'], {})).toEqual({ kind: 'real', xs: [-8] })
  })
})
