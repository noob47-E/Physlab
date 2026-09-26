// QCa: calculus working from SymPy's rule trees (math/pure/calculusSteps.ts).
//
// The fixtures in tests/fixtures/calculus are the worker's own replies: they were recorded by
// running the Python PRELUDE of workers/cas.worker.ts (SymPy 1.14, the version bundled in
// public/pyodide) on each payload, so a fixture is exactly what the app's worker sends.
//
// Three boundaries are crossed here: the worker's JSON into the formatter, every string the
// formatter writes into the real KaTeX, and every line of working back into numbers — each line
// is read the way a student would check it (through the app's own latexToMath) and its sides must
// agree at several x, up to the constant C where there is an integral.

import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import katex from 'katex'
import { math, setAngleMode } from '../src/renderer/src/math/expr'
import { latexToMath } from '../src/renderer/src/math/latexToMath'
import {
  NO_STEPS,
  NO_VALUE,
  RADIANS_NOTE,
  derivativeWorking,
  integralWorking,
  type DerivTree,
  type IntegralTree
} from '../src/renderer/src/math/pure/calculusSteps'
import type { Working } from '../src/renderer/src/math/pure/work'
import { CAS_OPS } from '../src/renderer/src/math/cas'
import { readSource, repoPath } from './helpers/repo'
import { resetGlobals } from './helpers/globals'

// Calculus is worked in radians whatever the app's angle mode (spec decision 2), so the lines are
// read back in radians too; the app's own inverse trig answers in degrees otherwise.
beforeEach(() => {
  resetGlobals()
  setAngleMode('rad')
})

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

interface Fixture {
  op: 'integral_steps' | 'diff_steps'
  payload: { expr: string; lower?: string; upper?: string; deg?: boolean }
  result: IntegralTree | DerivTree
}

const DIR = repoPath('tests', 'fixtures', 'calculus')
const FIXTURES: Record<string, Fixture> = Object.fromEntries(
  readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as Fixture])
)

const work = (name: string): Working => {
  const f = FIXTURES[name]
  if (!f) throw new Error(`no fixture ${name}`)
  return f.op === 'integral_steps'
    ? integralWorking(f.result as IntegralTree, f.payload.expr)
    : derivativeWorking(f.result as DerivTree, f.payload.expr)
}

// ---------------------------------------------------------------------------------------------
// Reading a displayed line back into numbers
// ---------------------------------------------------------------------------------------------

const WORDS = ['integrate', 'abs', 'integral', 'diff', 'sqrt', 'mag', 'asin', 'acos', 'atan', 'acot', 'sinh', 'cosh', 'tanh', 'sech', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'ln', 'log', 'pi']

/**
 * latexToMath writes x·sin x as "xsin(x)"; mathjs would read one name "xsin", so split it. And a
 * lone letter before a bracket, x(−sin x), is a product here, never a call.
 */
function splitNames(src: string): string {
  return splitRuns(src).replace(/ ([A-Za-z]) \s*\(/g, ' $1 * (')
}
function splitRuns(src: string): string {
  return src.replace(/[A-Za-z]+/g, (run) => {
    const out: string[] = []
    let i = 0
    while (i < run.length) {
      const w = WORDS.find((k) => run.startsWith(k, i))
      out.push(w ?? run[i])
      i += w ? w.length : 1
    }
    return ` ${out.join(' ')} `
  })
}

type Scope = Record<string, number>

const FUNCS = { ln: Math.log, mag: Math.abs }
const H = 1e-5

/** Simpson's rule, used for ∫ in a line: the antiderivative from the scope's base point. */
function simpson(f: (t: number) => number, a: number, b: number, n = 400): number {
  const h = (b - a) / n
  let s = f(a) + f(b)
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h)
  return (s * h) / 3
}

/** Evaluates one side of a displayed line at a scope, with ∫, definite ∫ and d/dx done numerically. */
function evalTex(tex: string, scope: Scope, base: Scope): number {
  const bracket = tex.trim().match(/^\\left\[(.*)\\right\]_\{(.+?)\}\^\{(.+?)\}$/)
  if (bracket) {
    const [, F, a, b] = bracket
    return evalTex(F, { ...scope, x: evalTex(b, scope, base) }, base) - evalTex(F, { ...scope, x: evalTex(a, scope, base) }, base)
  }
  const cleaned = tex
    .replace(/\+\s*C\b/g, '')
    .replace(/^\s*C\s*$/, '0')
    .replace(/\\int d([a-z])/g, '\\int 1\\,d$1')
    // latexToMath reads d/du sin⁻¹ u only with brackets; a book (and the working) leaves them out.
    .replace(/^\\frac\{d\}\{d([a-z])\}(?!\\left)(.*)$/, '\\frac{d}{d$1}\\left($2\\right)')
  const node = math.parse(splitNames(latexToMath(cleaned).replace(/\|([^|]+)\|/g, 'abs($1)')))
  const special: { id: string; fn: string; args: math.MathNode[] }[] = []
  const t = node.transform((n) => {
    if (n.type === 'FunctionNode') {
      const fn = (n as math.FunctionNode).fn.name
      if (fn === 'integrate' || fn === 'integral' || fn === 'diff') {
        const id = `S${special.length}`
        special.push({ id, fn, args: (n as math.FunctionNode).args })
        return new math.SymbolNode(id)
      }
    }
    return n
  })
  const sc: Record<string, unknown> = { ...FUNCS, ...scope }
  for (const s of special) {
    const body = s.args[0].compile()
    const at = (name: string, val: number): number => Number(body.evaluate({ ...FUNCS, ...scope, [name]: val }))
    if (s.fn === 'diff') {
      const v = (s.args[1] as math.SymbolNode).name
      sc[s.id] = (at(v, scope[v] + H) - at(v, scope[v] - H)) / (2 * H)
    } else if (s.fn === 'integrate') {
      const v = (s.args[1] as math.SymbolNode).name
      sc[s.id] = simpson((q) => at(v, q), base[v], scope[v])
    } else {
      const lo = Number(s.args[1].compile().evaluate({ ...FUNCS, ...scope }))
      const hi = Number(s.args[2].compile().evaluate({ ...FUNCS, ...scope }))
      sc[s.id] = simpson((q) => at('x', q), lo, hi)
    }
  }
  const v = t.compile().evaluate(sc)
  return typeof v === 'number' ? v : Number(v)
}

/** Split at a separator that sits outside every brace and bracket. */
function splitTop(s: string, sep: RegExp): string[] {
  const parts: string[] = []
  let depth = 0
  let last = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '{' || c === '(' || c === '[') depth++
    else if (c === '}' || c === ')' || c === ']') depth--
    else if (depth === 0) {
      const m = s.slice(i).match(sep)
      if (m && m.index === 0) {
        parts.push(s.slice(last, i))
        i += m[0].length - 1
        last = i + 1
      }
    }
  }
  parts.push(s.slice(last))
  return parts.map((p) => p.trim()).filter(Boolean)
}

const close = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))

/**
 * Checks every line of a Working the way a student with a calculator would, at the given x
 * values. Letters defined in earlier lines (u = x², f = x², I = ∫…) are carried forward.
 * Returns the claims it could not confirm, as readable strings.
 */
function untrueLines(w: Working, xs: number[]): string[] {
  const defs = new Map<string, string>()
  const bad: string[] = []
  const scopeAt = (x: number): Scope => {
    const sc: Scope = { x }
    const base0: Scope = { x: xs[0] }
    for (const [k, tex] of defs) {
      sc[k] = evalTex(tex, sc, base0)
      base0[k] = evalTex(tex, { ...base0 }, base0)
    }
    return sc
  }
  const baseAt = (): Scope => {
    const b: Scope = { x: xs[0] }
    for (const [k, tex] of defs) b[k] = evalTex(tex, { ...b }, b)
    return b
  }
  const derivOf = (tex: string, x: number): number => {
    const b = baseAt()
    return (evalTex(tex, { ...scopeAt(x + H), x: x + H }, b) - evalTex(tex, { ...scopeAt(x - H), x: x - H }, b)) / (2 * H)
  }
  const one = (claim: string): void => {
    if (claim.includes('\\text')) return
    const sides = splitTop(claim, /=/)
    // An infinite area cannot be sampled; the broken-limits test asserts that line itself.
    if (sides.length < 2 || sides.some((s) => s.includes('\\infty'))) return
    const lhs = sides[0]
    const dLetter = lhs.match(/^d([a-z])$/)
    const ratio = lhs.match(/^\\frac\{d([a-z])\}\{dx\}$/)
    const prime = lhs.match(/^([fg])'$/)
    const named = dLetter ?? ratio ?? prime
    if (named) {
      const letter = named[1]
      if (dLetter?.[1] === 'v') return // dv = … dx only names a piece; v = ∫dv is checked on its own line
      const def = defs.get(letter)
      if (def === undefined) {
        bad.push(`${claim} (no ${letter} defined)`)
        return
      }
      const rhs = sides[sides.length - 1].replace(/\\,dx$/, '').replace(/^dx$/, '1')
      for (const x of xs) {
        if (!close(derivOf(def, x), evalTex(rhs, scopeAt(x), baseAt()))) {
          bad.push(`${claim} at x = ${x}`)
          return
        }
      }
      return
    }
    const integralMode = sides.some((s) => /\\int(?!_)/.test(s) || /(^|\s)C$/.test(s.trim()) || /(?<![A-Za-z])I(?![A-Za-z])/.test(s))
    // A letter names a piece the first time (u = x², I = ∫…). I is named once: "I = … − I" later
    // is an equation about it, not a new name.
    if (/^[a-zA-Z]$/.test(lhs) && !(lhs === 'I' && defs.has('I'))) {
      const rest = sides.slice(1)
      defs.set(lhs, lhs === 'I' ? rest[0] : rest[rest.length - 1])
      if (rest.length < 2) return
      sides.splice(0, 1)
    }
    const [first, ...others] = sides
    for (const other of others) {
      for (const x of integralMode ? xs.slice(1) : xs) {
        const b = baseAt()
        const s1 = scopeAt(x)
        const s0 = scopeAt(xs[0])
        const a = integralMode ? evalTex(first, s1, b) - evalTex(first, s0, b) : evalTex(first, s1, b)
        const c = integralMode ? evalTex(other, s1, b) - evalTex(other, s0, b) : evalTex(other, s1, b)
        if (!close(a, c)) {
          bad.push(`${first} = ${other} at x = ${x} (${a} vs ${c})`)
          break
        }
      }
    }
  }
  for (const m of w.moves) {
    if (!m.tex) continue
    for (const claim of splitTop(m.tex, /,\\qq?uad/)) {
      try {
        one(claim)
      } catch (e) {
        // A line the reader cannot parse is a line a student cannot check either.
        bad.push(`${claim}: unreadable (${String(e)})`)
      }
    }
  }
  return bad
}

/** Every string KaTeX will be handed, and every plain sentence. */
function texOf(w: Working): string[] {
  return [w.input, ...w.moves.flatMap((m) => [m.tex, m.rule]), ...w.answers.map((a) => a.tex)].filter((t): t is string => !!t)
}
function plainOf(w: Working): string[] {
  return [w.title, w.method, w.check, w.reason, w.error, ...w.moves.flatMap((m) => [m.head, m.note, m.subgoal])].filter(
    (t): t is string => !!t
  )
}

/** x values where every fixture's function is defined and smooth between them. */
const POINTS: Record<string, number[]> = {
  'integral-partial': [1.5, 2, 2.5, 3.2],
  'derivative-asin': [0.05, 0.15, 0.3, 0.4],
  default: [0.3, 0.6, 1.1, 1.4]
}

// ---------------------------------------------------------------------------------------------
// The known answers the spec quotes (S-Q §4 QCa)
// ---------------------------------------------------------------------------------------------

const answerAt = (w: Working, x: number): number => evalTex(w.answers[0].tex, { x }, { x })

describe('integrals: the known answers, worked the textbook way', () => {
  it('∫x² dx = x³/3 + C by the power rule', () => {
    const w = work('integral-power')
    expect(w.answers[0].tex).toBe('\\frac{x^{3}}{3} + C')
    expect(w.moves).toHaveLength(1)
    expect(w.moves[0].rule).toContain('\\frac{x^{n+1}}{n+1}')
    expect(w.moves[0].head).toMatch(/power rule/)
    expect(w.checked).toBe('ok')
  })

  it('∫x eˣ dx = (x − 1)eˣ + C by parts, with u = x', () => {
    const w = work('integral-parts')
    expect(w.method).toBe('Integration by parts')
    expect(w.answers[0].tex).toBe('\\left(x - 1\\right) e^{x} + C')
    expect(w.moves.some((m) => m.tex?.startsWith('u = x,\\quad dv = e^{x}\\,dx'))).toBe(true)
    expect(w.moves.some((m) => m.tex?.includes('x e^{x} - \\int e^{x}\\,dx'))).toBe(true)
    expect(w.moves[w.moves.length - 1].head).toBe('Took out the common factor.')
  })

  it('∫2x cos(x²) dx = sin(x²) + C by the substitution u = x², du = 2x dx absorbing the 2', () => {
    const w = work('integral-substitution')
    expect(w.method).toBe('Substitution')
    expect(w.answers[0].tex).toBe('\\sin{\\left(x^{2} \\right)} + C')
    expect(w.moves[0].tex).toBe('u = x^{2},\\quad du = 2 x\\,dx')
    // SymPy took the 2 out and put ½ back in; the book's way has no constants at all.
    expect(w.moves[1].tex).toBe('\\int 2 x \\cos{\\left(x^{2} \\right)}\\,dx = \\int \\cos {u}\\,du')
    expect(w.moves.every((m) => !m.tex?.includes('\\frac{1}{2}'))).toBe(true)
  })

  it('without a constant to absorb, ∫x cos(x²) dx keeps the ½ in the u-integral', () => {
    const w = work('integral-sub-nofold')
    expect(w.answers[0].tex).toBe('\\frac{1}{2} \\sin{\\left(x^{2} \\right)} + C')
    expect(w.moves.some((m) => m.tex?.includes('\\int \\frac{1}{2} \\cos {u}\\,du'))).toBe(true)
  })

  it('∫1/(x² − 1) dx = ½ ln|x − 1| − ½ ln|x + 1| + C by partial fractions, with the bars written', () => {
    const w = work('integral-partial')
    expect(w.method).toBe('Partial fractions')
    expect(w.answers[0].tex).toBe('\\frac{1}{2} \\ln\\left|x - 1\\right| - \\frac{1}{2} \\ln\\left|x + 1\\right| + C')
    expect(w.moves[0].head).toBe('Split the fraction into partial fractions.')
    for (const x of [1.5, 3, -3, 0.5]) {
      expect(answerAt(w, x)).toBeCloseTo(0.5 * Math.log(Math.abs(x - 1)) - 0.5 * Math.log(Math.abs(x + 1)), 10)
    }
  })

  it('∫₀² x² dx = 8/3, with the evaluation line F(2) − F(0) = 8/3 − 0', () => {
    const w = work('integral-definite')
    expect(w.input).toBe('\\int_{0}^{2} x^{2}\\,dx')
    expect(w.answers[0].tex).toBe('\\frac{8}{3}')
    const last = w.moves[w.moves.length - 1]
    expect(last.subgoal).toBe('Put in the limits')
    expect(last.tex).toBe('\\int_{0}^{2} x^{2}\\,dx = \\left[\\frac{x^{3}}{3}\\right]_{0}^{2} = \\frac{8}{3} - 0 = \\frac{8}{3}')
    expect(last.rule).toBe('\\int_{a}^{b} f\\,dx = F(b) - F(a)')
  })

  it('a function that breaks between the limits is not given F(b) − F(a)', () => {
    // ∫ from −1 to 1 of 1/x²: F(1) − F(−1) = −2, while the area is infinite.
    const w = work('integral-broken')
    const last = w.moves[w.moves.length - 1]
    expect(last.head).toMatch(/does not apply/)
    expect(last.head).toMatch(/area under it is infinite/)
    expect(last.head).not.toMatch(/found directly/)
    expect(last.tex).not.toContain('\\left[')
    expect(w.answers).toEqual([{ label: 'Answer', tex: '\\infty' }])
  })

  it('∫₋₁¹ 1/x dx has no value: a plain sentence, never "NaN"', () => {
    const w = work('integral-recip-broken')
    expect(w.error).toBe(NO_VALUE)
    expect(w.answers).toHaveLength(0)
    for (const s of [...texOf(w), ...plainOf(w)]) expect(s).not.toMatch(/nan/i)
  })

  it('∫₀¹ xˣ dx has no formula but still has a value: ≈ 0.7834, never the integral echoed back', () => {
    const w = work('integral-definite-numeric')
    expect(w.error).toBeUndefined()
    expect(w.answers).toEqual([{ label: 'Answer', tex: '\\approx 0.7834' }])
    expect(w.reason).toMatch(/numerically/)
    expect(w.answers[0].tex).not.toContain('\\int')
  })

  it('an exact answer in special functions also gets its decimal: ∫₀¹ e^(−x²) dx = ½√π erf 1 ≈ 0.7468', () => {
    const w = work('integral-special-definite')
    expect(w.answers[0].tex).toContain('\\operatorname{erf}')
    expect(w.answers[1]).toEqual({ label: 'As a decimal', tex: '\\approx 0.7468' })
    // The scene's own precision is used when the caller passes it.
    const f = FIXTURES['integral-special-definite']
    const w6 = integralWorking(f.result as IntegralTree, f.payload.expr, { decimals: 6, precisionMode: 'sf' })
    expect(w6.answers[1].tex).toBe('\\approx 0.746824')
  })

  it('a special value SymPy cannot call finite still gets its decimal: ∫₀¹ sin x/x dx = Si(1) ≈ 0.9461', () => {
    // Si(1).is_finite is None in SymPy 1.14, so the worker must not lean on is_finite.
    const f = FIXTURES['integral-si-definite']
    const def = (f.result as IntegralTree).definite!
    expect(def.value.text).toBe('Si(1)')
    expect(def.numeric?.re).toBeCloseTo(0.946083070367183, 12)
    expect(def.agrees).toBe(true)
    const w = work('integral-si-definite')
    expect(w.error).toBeUndefined()
    expect(w.answers[0].tex).toContain('\\operatorname{Si}')
    expect(w.answers).toHaveLength(2)
    expect(w.answers[1]).toEqual({ label: 'As a decimal', tex: '\\approx 0.9461' })
  })

  it('a plain rational value needs no decimal row: ∫₀² x² dx = 8/3 alone', () => {
    expect(work('integral-definite').answers).toHaveLength(1)
  })

  it('term by term, the constant taken out, the textbook middle line kept: ∫(3x² + 2x + 1) dx', () => {
    const w = work('integral-polynomial')
    expect(w.moves).toHaveLength(1)
    expect(w.moves[0].tex).toBe(
      '\\int \\left(3 x^{2} + 2 x + 1\\right)\\,dx = \\int 3 x^{2}\\,dx + \\int 2 x\\,dx + \\int dx = 3 \\cdot \\frac{x^{3}}{3} + 2 \\cdot \\frac{x^{2}}{2} + x + C = x^{3} + x^{2} + x + C'
    )
  })

  it('∫tan x dx = −ln|cos x| + C: rewritten as sin/cos, then u = cos x', () => {
    const w = work('integral-tan')
    expect(w.answers[0].tex).toBe('- \\ln\\left|\\cos {x}\\right| + C')
    expect(w.moves.some((m) => m.tex === 'u = \\cos {x},\\quad du = - \\sin {x}\\,dx')).toBe(true)
  })

  it('∫1/(x² + 2x + 5) dx = ½ tan⁻¹((x + 1)/2) + C: the square is completed on the student’s own integrand', () => {
    const w = work('integral-complete-square')
    expect(w.answers[0].tex).toBe('\\frac{1}{2} \\tan^{-1}{\\left(\\frac{x + 1}{2} \\right)} + C')
    expect(w.moves[0].subgoal).toBe('Complete the square')
    expect(w.moves[0].tex).toBe('\\int \\frac{1}{x^{2} + 2 x + 5}\\,dx = \\int \\frac{1}{\\left(x + 1\\right)^{2} + 4}\\,dx')
    expect(w.moves[1].tex).toBe('u = x + 1,\\quad du = dx')
    expect(w.moves[2].tex).toBe('\\int \\frac{1}{\\left(x + 1\\right)^{2} + 4}\\,dx = \\int \\frac{1}{u^{2} + 4}\\,du')
    // u never appears inside an integral that is still taken with respect to x.
    for (const m of w.moves) expect(m.tex ?? '').not.toMatch(/\\int [^=]*u[^=]*\\,dx/)
  })

  it('∫ln x dx keeps ln x as written (no bars on a log the student typed)', () => {
    const w = work('integral-ln')
    expect(w.answers[0].tex).toBe('x \\ln x - x + C')
  })

  it('∫eˣ sin x dx: parts twice, the integral comes back, and is solved for', () => {
    const w = work('integral-cyclic')
    expect(w.method).toBe('Integration by parts, twice')
    expect(w.moves.map((m) => m.tex)).toContain('2I = e^{x} \\sin {x} - e^{x} \\cos {x}')
    expect(w.moves[w.moves.length - 1].head).toBe('Divided by 2.')
  })

  it('∫x ln x dx = ¼x²(2 ln x − 1) + C in one integration by parts, not a substitution first', () => {
    // SymPy offers "u = ln x, then parts" first; a book does one integration by parts.
    const w = work('integral-xlnx')
    expect(w.method).toBe('Integration by parts')
    expect(w.answers[0].tex).toBe('\\frac{1}{4} x^{2} \\left(2 \\ln x - 1\\right) + C')
    expect(w.moves.filter((m) => m.head.startsWith('Chose u and dv'))).toHaveLength(1)
    expect(w.moves[0].tex).toBe('u = \\ln x,\\quad dv = x\\,dx')
    expect(w.moves.map((m) => m.tex).join(' ')).toContain('\\frac{x^{2}}{2} \\ln x - \\int \\frac{x}{2}\\,dx')
    expect(w.moves.length).toBeLessThanOrEqual(5)
  })

  it('∫x² cos x dx: parts, whose leftover integral needs parts again', () => {
    const w = work('integral-parts-poly')
    expect(w.answers[0].tex).toBe('x^{2} \\sin {x} + 2 x \\cos {x} - 2 \\sin {x} + C')
    expect(w.moves.filter((m) => m.head.startsWith('Chose u and dv'))).toHaveLength(2)
  })
})

describe('derivatives: the known answers, worked the textbook way', () => {
  it('d/dx x² sin x = 2x sin x + x² cos x by the product rule', () => {
    const w = work('derivative-product')
    expect(w.method).toBe('Product rule')
    expect(w.answers[0].tex).toBe('2 x \\sin {x} + x^{2} \\cos {x}')
    expect(w.moves[0].tex).toBe("f = x^{2},\\quad f' = 2 x,\\qquad g = \\sin {x},\\quad g' = \\cos {x}")
    expect(w.moves[1].rule).toBe("\\frac{d}{dx}(fg) = f'g + fg'")
  })

  it('d/dx sin(3x²) = 6x cos(3x²) by the chain rule', () => {
    const w = work('derivative-chain')
    expect(w.method).toBe('Chain rule')
    expect(w.answers[0].tex).toBe('6 x \\cos{\\left(3 x^{2} \\right)}')
    expect(w.moves[0].tex).toContain('u = 3 x^{2},\\quad \\frac{du}{dx} = 6 x')
    expect(w.moves[1].tex).toBe('\\frac{d}{dx}\\left(\\sin{\\left(3 x^{2} \\right)}\\right) = \\cos{\\left(3 x^{2} \\right)} \\cdot 6 x = 6 x \\cos{\\left(3 x^{2} \\right)}')
  })

  it('d/dx x/(x + 1) = 1/(x + 1)² by the quotient rule', () => {
    const w = work('derivative-quotient')
    expect(w.method).toBe('Quotient rule')
    expect(w.answers[0].tex).toBe('\\frac{1}{\\left(x + 1\\right)^{2}}')
    expect(w.moves[1].tex).toBe(
      '\\frac{d}{dx}\\left(\\frac{x}{x + 1}\\right) = \\frac{\\left(x + 1\\right) \\cdot 1 - x \\cdot 1}{\\left(x + 1\\right)^{2}} = \\frac{1}{\\left(x + 1\\right)^{2}}'
    )
  })

  it('a constant term differentiates to 0 and is dropped, as a book does', () => {
    expect(work('derivative-polynomial').answers[0].tex).toBe('12 x^{3} - 2')
  })

  it('d/dx tan x is written sec² x, not SymPy’s tan² x + 1', () => {
    expect(work('derivative-tan').answers[0].tex).toBe('\\sec^{2} {x}')
  })

  it('d/dx sin(cos x²): each inside of a nested chain has its own letter, u = x² and then w = cos x²', () => {
    const w = work('derivative-nested-chain')
    expect(w.answers[0].tex).toBe('- 2 x \\sin{\\left(x^{2} \\right)} \\cos{\\left(\\cos{\\left(x^{2} \\right)} \\right)}')
    const named = w.moves.map((m) => m.tex ?? '').filter((t) => /^[a-z] = /.test(t))
    expect(named[0]).toMatch(/^u = x\^\{2\},/)
    expect(named[1]).toMatch(/^w = \\cos\{\\left\(x\^\{2\} \\right\)\},/)
    expect(w.moves.some((m) => m.head === 'Called the inside w and differentiated the outside with respect to w.')).toBe(true)
  })

  it('terms that combine are worked out: d/dx(x ln x − x) = ln x, not (1 + ln x) − 1', () => {
    const w = work('derivative-combine')
    expect(w.answers[0].tex).toBe('\\ln x')
    const last = w.moves[w.moves.length - 1]
    expect(last.head).toBe('Tidied the answer.')
    expect(last.tex).toBe('\\left(1 + \\ln x\\right) - 1 = \\ln x')
  })

  it('terms that cancel give 0: d/dx(sin²x + cos²x) = 0', () => {
    const w = work('derivative-cancel')
    expect(w.answers[0].tex).toBe('0')
    expect(w.moves[w.moves.length - 1].tex).toMatch(/ = 0$/)
    expect(w.checked).toBe('ok')
  })
})

describe('answers without steps', () => {
  it('an unsupported derivative gives the answer with the sentence', () => {
    const w = work('derivative-xpowx')
    expect(w.noWorking).toBe(true)
    expect(w.reason).toBe(NO_STEPS)
    expect(NO_STEPS).toBe('PhysLab can give the answer but not the steps for this one.')
    expect(w.answers[0].tex).toBe('x^{x} \\left(\\ln x + 1\\right)')
  })

  it('an integral SymPy has no rule tree for gives its answer with the sentence', () => {
    const w = work('integral-dontknow')
    expect(w.noWorking).toBe(true)
    expect(w.reason).toBe(NO_STEPS)
    expect(w.answers[0].tex).toContain('F_{1}')
    // SymPy could not simplify its own check back: unverified, which is not the same as wrong.
    expect(w.checked).toBeUndefined()
  })

  it('a rule this file cannot put into words (erf) still gives the answer', () => {
    const w = work('integral-special')
    expect(w.noWorking).toBe(true)
    expect(w.reason).toBe(NO_STEPS)
    expect(w.answers[0].tex).toContain('\\operatorname{erf}')
    expect(w.checked).toBe('ok')
  })

  it('an integral with no formula at all says so instead of echoing the integral back', () => {
    const w = work('integral-nonelementary')
    expect(w.error).toMatch(/no formula/)
    expect(w.answers).toHaveLength(0)
  })

  it('a tree marked unsupported is never explained, even if one came with it', () => {
    const f = FIXTURES['integral-power']
    const w = integralWorking({ ...(f.result as IntegralTree), unsupported: true }, 'x^2')
    expect(w.noWorking).toBe(true)
    expect(w.answers[0].tex).toBe('\\frac{x^{3}}{3} + C')
  })

  it('DEG mode is told, once, that calculus is worked in radians', () => {
    const w = work('integral-degrees')
    expect(w.answers[0].tex).toBe('\\sin {x} + C')
    expect(w.moves[0].note).toBe(RADIANS_NOTE)
    expect(w.moves.filter((m) => m.note?.includes('radians'))).toHaveLength(1)
  })
})

describe('every fixture', () => {
  const names = Object.keys(FIXTURES)

  it('there are fixtures for every rule the spec lists', () => {
    expect(names.length).toBeGreaterThanOrEqual(30)
  })

  it('renders in KaTeX, input, every step, rule chip and answer', () => {
    for (const name of names) {
      for (const tex of texOf(work(name))) {
        expect(() => katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: 'ignore' }), `${name}: ${tex}`).not.toThrow()
      }
    }
  })

  it('keeps LaTeX out of the sentences, where the panel would show it as text (or delete \\sin)', () => {
    for (const name of names) for (const s of plainOf(work(name))) expect(s, `${name}: ${s}`).not.toMatch(/\\|\^\{|_\{/)
  })

  it('never names a letter after itself ("u = u", "du = du"): a substitution and parts keep their own letters', () => {
    for (const name of names) {
      for (const tex of texOf(work(name))) expect(tex, `${name}: ${tex}`).not.toMatch(/(^|[^a-z\\])(d?[a-z]) = \2(?![a-z{^_])/)
    }
  })

  it('never gives one chain-rule letter two different meanings in the same working', () => {
    for (const name of names) {
      if (FIXTURES[name].op !== 'diff_steps') continue
      const meaning = new Map<string, string>()
      for (const m of work(name).moves) {
        const def = (m.tex ?? '').match(/^([a-z]) = (.*?),\\quad \\frac\{d\1\}/)
        if (!def) continue
        const [, letter, rhs] = def
        expect(meaning.get(letter) ?? rhs, `${name}: ${letter} = ${rhs}`).toBe(rhs)
        meaning.set(letter, rhs)
      }
    }
  })

  it('never runs two fractions together, which reads as a mixed number', () => {
    for (const name of names) {
      for (const tex of texOf(work(name))) expect(tex, `${name}: ${tex}`).not.toMatch(/\\frac\{[^{}]*\}\{[^{}]*\} \\frac/)
    }
  })

  it('never names SymPy to the student, who does not know what it is', () => {
    for (const name of names) for (const s of plainOf(work(name))) expect(s, `${name}: ${s}`).not.toMatch(/sympy/i)
  })

  it('a negative fraction goes in front of a function as −½ ln|2x + 2|, never as a fraction bar over the log', () => {
    const w = work('integral-negative-half')
    expect(w.answers[0].tex).toBe('- \\frac{1}{2} \\ln\\left|2 x + 2\\right| + C')
  })

  it('never writes "+ −", "− −" or an empty bracket', () => {
    for (const name of names) {
      for (const tex of texOf(work(name))) expect(tex, `${name}`).not.toMatch(/\+\s*-|-\s+-|\\left\(\s*\\right\)/)
    }
  })

  it('every line is true as written: each side agrees at four points (up to C for an integral)', () => {
    for (const name of names) {
      const w = work(name)
      if (w.error || w.noWorking) continue
      expect(untrueLines(w, POINTS[name] ?? POINTS.default), name).toEqual([])
    }
  })

  it('every answer agrees with the worker’s own answer text at four points', () => {
    for (const name of names) {
      const f = FIXTURES[name]
      const w = work(name)
      if (w.error || f.payload.lower !== undefined) continue
      const text = (f.result as IntegralTree).answer_text
      if (/hyper|erf/.test(text)) continue // functions mathjs does not have
      const truth = math.compile(text.replace(/\*\*/g, '^').replace(/\bE\b/g, 'e').replace(/\bAbs\b/g, 'abs').replace(/\blog\b/g, 'ln'))
      for (const x of POINTS[name] ?? POINTS.default) {
        expect(answerAt(w, x), `${name} at ${x}`).toBeCloseTo(Number(truth.evaluate({ ...FUNCS, x })), 8)
      }
    }
  })

  it('the checker itself catches a false line', () => {
    const w = work('integral-power')
    const wrong: Working = { ...w, moves: [{ head: 'x', tex: '\\int x^{2}\\,dx = \\frac{x^{3}}{2} + C' }] }
    expect(untrueLines(wrong, POINTS.default)).toHaveLength(1)
    const d = work('derivative-chain')
    const wrongD: Working = { ...d, moves: [{ head: 'x', tex: 'u = 3 x^{2},\\quad \\frac{du}{dx} = 3 x' }] }
    expect(untrueLines(wrongD, POINTS.default)).toHaveLength(1)
  })
})

describe('the join with the worker', () => {
  it('both ops are in CAS_OPS and have a branch in the worker', () => {
    const worker = readSource('src/renderer/src/workers/cas.worker.ts')
    for (const op of ['integral_steps', 'diff_steps'] as const) {
      expect(CAS_OPS).toContain(op)
      expect(worker).toContain(`if op == '${op}'`)
    }
  })

  it('the bundled SymPy is the 1.14.0 the fixtures were recorded with (spec §5 risk 2)', () => {
    // The formatter picks SymPy's rules by class name (INT_KNOWN) and reads their fields. A newer
    // SymPy that renames or reshapes them would leave every test here green while the app quietly
    // gave answers with no steps.
    const lock = JSON.parse(readSource('src/renderer/public/pyodide/pyodide-lock.json')) as { packages: Record<string, { version: string }> }
    expect(
      lock.packages.sympy.version,
      'SymPy in public/pyodide changed: re-record tests/fixtures/calculus by running the PRELUDE of workers/cas.worker.ts on the new version, and review INT_KNOWN in calculusSteps.ts against its rule names'
    ).toBe('1.14.0')
  })

  it('every fixture was recorded from a payload the worker reads (expr, var, lower, upper, deg)', () => {
    const worker = readSource('src/renderer/src/workers/cas.worker.ts')
    for (const f of Object.values(FIXTURES)) {
      for (const key of Object.keys(f.payload)) expect(worker).toMatch(new RegExp(`p(\\.get\\()?\\[?'${key}'`))
    }
  })

  it('an infinite value never reaches JSON as Infinity, which JSON.parse refuses', () => {
    for (const [name, f] of Object.entries(FIXTURES)) {
      const def = (f.result as IntegralTree).definite
      if (def) expect(def.numeric === null || Number.isFinite(def.numeric.re), name).toBe(true)
    }
    const worker = readSource('src/renderer/src/workers/cas.worker.ts')
    // The guard alone decides: is_finite is None for values such as Si(1), which have a decimal.
    expect(worker).not.toContain('_num(exact) if exact.is_finite else None')
    expect(worker).toContain('all(_math.isfinite(q) for q in numeric.values())')
  })
})
