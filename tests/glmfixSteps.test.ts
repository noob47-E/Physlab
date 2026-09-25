/**
 * GLM audit findings #5, #6, #11, #22–#26 (glm-audit/CONFIRMED.md): step-working lines that were
 * false or misleading although the final answer was right. Each test fails on phase-0.9 as it was
 * and holds the fix. The Pure Math inputs are also in tests/stepTruth.test.ts's PURE_SPREAD, so the
 * sweep's texFaults/chainFaults keep guarding them (its helpers are not imported here: importing a
 * test file runs its tests a second time).
 *
 * The calculus findings live in the worker's Python, so those tests run it: the PRELUDE of
 * workers/cas.worker.ts in the app's own bundled Pyodide and SymPy (public/pyodide), answering the
 * app's own `cas()` calls. A typed line goes through the Working panel's store or the command bar,
 * into the real worker code, and back into the working a student reads.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { pathToFileURL } from 'node:url'
import katex from 'katex'
import { runPure } from '../src/renderer/src/math/pure/run'
import { resetGlobals } from './helpers/globals'
import { readSource, repoPath } from './helpers/repo'

/** The worker's cas_run, loaded once in beforeAll below. */
const live = vi.hoisted(() => ({ run: null as null | ((op: string, payload: string) => string) }))

vi.mock('../src/renderer/src/math/cas', async (orig) => {
  const real = await orig<typeof import('../src/renderer/src/math/cas')>()
  return {
    ...real,
    cas: vi.fn(async (op: string, payload: Record<string, unknown> = {}) => {
      if (!live.run) throw new Error('the worker is not loaded')
      return JSON.parse(live.run(op, JSON.stringify(payload)))
    })
  }
})
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { scene } from '../src/renderer/src/core/store'
import { runCommand } from '../src/renderer/src/lang/commands'
import { WORKING_IT_OUT, casRequestFor, usePure } from '../src/renderer/src/math/pure/store'
import type { Working } from '../src/renderer/src/math/pure/work'

beforeEach(() => resetGlobals())

const texes = (job: Parameters<typeof runPure>[0], src: string): string[] => runPure(job, src).moves.map((m) => m.tex ?? '')

describe('#5 partial fractions: the cleared line keeps each piece’s own sign', () => {
  it('1/((x + 1)(2 − x)): "1 = −A(x + 1) − B(x − 2)", not "+ −B"', () => {
    const w = runPure('partial', '1/((x + 1)(2 - x))')
    const cleared = w.moves.find((m) => m.head.startsWith('Multiply every term by the bottom'))
    expect(cleared?.tex).toBe(String.raw`1 = -A\left(x + 1\right) - B\left(x - 2\right)`)
    expect(cleared?.tex).not.toMatch(/\+\s*-/)
    expect(w.checked).toBe('ok')
  })

  it('a negative constant other than −1 keeps its size on every piece and its sign written once', () => {
    // 3/((x + 1)(4 − 2x)): the bottom is −2(x − 2)(x + 1), so each piece is −2 times its letter.
    const w = runPure('partial', '3/((x + 1)(4 - 2x))')
    const cleared = w.moves.find((m) => m.head.startsWith('Multiply every term by the bottom'))
    expect(cleared?.tex).toBe(String.raw`3 = -2A\left(x + 1\right) - 2B\left(x - 2\right)`)
    expect(w.checked).toBe('ok')
  })

  it('a positive constant is unchanged: "3x + 5 = A(x + 2) + B(x − 1)"', () => {
    expect(texes('partial', '(3x + 5)/((x - 1)(x + 2))')).toContain(String.raw`3x + 5 = A\left(x + 2\right) + B\left(x - 1\right)`)
  })
})

describe('#6 factorise: the grouping line is worth the whole question', () => {
  it('2x³ + 2x² + 2x + 2: the 2 taken out first stays on the grouping line', () => {
    const w = runPure('factor', '2x^3 + 2x^2 + 2x + 2')
    expect(w.moves.map((m) => m.tex)).toContain(String.raw`2\left[x^{2}\left(x + 1\right) + 1\left(x + 1\right)\right]`)
    expect(w.checked).toBe('ok')
  })

  it('a grouping with nothing taken out first reads as before', () => {
    expect(texes('factor', 'x^3 + x^2 + x + 1')).toContain(String.raw`x^{2}\left(x + 1\right) + 1\left(x + 1\right)`)
  })
})

describe('#11 / #26 trig: a false identity’s sentence never contradicts itself', () => {
  it('tan(x/100) = sin(x/100): the two values quoted are different numbers', () => {
    const w = runPure('trigidentity', 'tan(x/100) = sin(x/100)')
    const said = w.error ?? ''
    expect(said).toMatch(/^Those two sides are not equal/)
    const [, a, b] = said.match(/= (-?[\d.]+) but .* = (-?[\d.]+)\.$/) ?? []
    expect(a).toBeDefined()
    expect(a).not.toBe(b)
    // At x = 10 rad: tan 0.1 = 0.100335, sin 0.1 = 0.0998334, so four places show the difference.
    expect(said).toBe('Those two sides are not equal, so there is nothing to prove, though they differ only from the 4th decimal place: at x = 10 rad, tan 0.01x = 0.1003 but sin 0.01x = 0.0998.')
  })

  it('every false identity quotes two values that read differently', () => {
    for (const src of ['tan(x/100) = sin(x/100)', 'sin(x/1000) = tan(x/1000)', 'cos(x/100) = 1', 'sin(A/100 + B/100) = sin(A/100)', 'sin 2x = 2 sin x', 'cos(pi) = 1']) {
      const said = runPure('trigidentity', src).error ?? ''
      const [, a, b] = said.match(/= (\S+) but .* = (\S+)\.$/) ?? []
      expect(a, `${src}: ${said}`).toBeDefined()
      expect(a, `${src}: ${said}`).not.toBe(b)
    }
  })

  it('sin(x/1000) = tan(x/1000): two values either side of a rounding edge are not a difference', () => {
    // At x = 0.5 the sides differ by 4×10⁻¹¹ yet round to 0 and 0.001, which would say sin is 0.
    // At x = 10: sin 0.01 = 0.00999983, tan 0.01 = 0.01000033.
    expect(runPure('trigidentity', 'sin(x/1000) = tan(x/1000)').error).toBe(
      'Those two sides are not equal, so there is nothing to prove, though they differ only from the 7th decimal place: at x = 10 rad, sin 0.001x = 0.0099998 but tan 0.001x = 0.0100003.'
    )
  })

  it('a false identity that differs at three places keeps its sentence as before', () => {
    expect(runPure('trigidentity', 'sin 2x = 2 sin x').error).toBe('Those two sides are not equal, so there is nothing to prove: at x = 1 rad, sin 2x = 0.909 but 2 sin x = 1.683.')
  })

  it('cos(π) = 1: no dangling "at ," when neither side has a letter', () => {
    const said = runPure('trigidentity', 'cos(pi) = 1').error ?? ''
    expect(said).not.toMatch(/at\s*,/)
    expect(said).toBe('Those two sides are not equal, so there is nothing to prove: cos π = −1 but 1 = 1.')
  })
})

describe('calculus working, from the worker’s own SymPy', () => {
  beforeAll(async () => {
    const src = readSource('src/renderer/src/workers/cas.worker.ts')
    const tag = 'const PRELUDE = String.raw`'
    const at = src.indexOf(tag) + tag.length
    const base = `${repoPath('src', 'renderer', 'public', 'pyodide')}/`
    const mod = (await import(/* @vite-ignore */ pathToFileURL(`${base}pyodide.mjs`).href)) as {
      loadPyodide: (o: object) => Promise<{ loadPackage: (p: string[]) => Promise<void>; runPython: (s: string) => void; globals: { get: (n: string) => unknown } }>
    }
    const py = await mod.loadPyodide({ indexURL: base })
    await py.loadPackage(['mpmath', 'sympy'])
    py.runPython(src.slice(at, src.indexOf('\n`\n', at)))
    live.run = py.globals.get('cas_run') as (op: string, payload: string) => string
  }, 240_000)

  beforeEach(() => {
    scene().newScene()
    scene().clearLog()
  })

  const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
  }

  /** The Working panel's answer to a typed line, as the student sees it. */
  async function worked(job: 'differentiate' | 'integrate', src: string): Promise<Working> {
    usePure.getState().run(job, src)
    for (let i = 0; i < 20 && usePure.getState().working?.method?.startsWith(WORKING_IT_OUT); i++) await settle()
    return usePure.getState().working!
  }

  const texOf = (w: Working): string[] => [w.input, ...w.moves.flatMap((m) => [m.tex, m.rule]), ...w.answers.map((a) => a.tex)].filter((t): t is string => !!t)
  const rendersAll = (w: Working, where: string): void => {
    for (const tex of texOf(w)) expect(() => katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: 'ignore' }), `${where}: ${tex}`).not.toThrow()
  }

  describe('#22 all seven chain letters in use', () => {
    it('u w v s p q r x: the answer p q r s u v w, not a false "could not read that"', async () => {
      const w = await worked('differentiate', 'u w v s p q r x')
      expect(w.error).toBeUndefined()
      expect(w.answers[0].tex).toBe('p q r s u v w')
    })

    it('u w v s p q r sin(x²): the inside takes a letter the question does not use', async () => {
      const w = await worked('differentiate', 'u w v s p q r sin(x^2)')
      expect(w.error).toBeUndefined()
      // d/dx sin(x²) = 2x cos(x²), times the constant p q r s u v w.
      expect(w.answers[0].tex).toBe(String.raw`2 p q r s u v w x \cos{\left(x^{2} \right)}`)
      const called = w.moves.map((m) => m.head.match(/^Called the inside (\S+) /)?.[1]).filter(Boolean)
      expect(called).toEqual(['h'])
      expect(w.checked).toBe('ok')
      rendersAll(w, 'seven letters')
    })
  })

  describe('#23 the product and quotient rules never reuse a letter of the question', () => {
    const named = (w: Working): string | undefined => w.moves.map((m) => m.head).find((h) => h.startsWith('Named the'))

    it('f x sin x: f is the question’s constant, so the factors are u and v', async () => {
      const w = await worked('differentiate', 'f x sin(x)')
      expect(named(w)).toBe('Named the two factors u and v and differentiated each.')
      expect(w.moves.map((m) => m.tex)).toContain(String.raw`u = x,\quad u' = 1,\qquad v = \sin {x},\quad v' = \cos {x}`)
      expect(w.moves.map((m) => m.rule)).toContain(String.raw`\frac{d}{dx}(uv) = u'v + uv'`)
      // d/dx(f x sin x) = f(sin x + x cos x).
      expect(w.answers[0].tex).toBe(String.raw`f \left(x \cos {x} + \sin {x}\right)`)
      rendersAll(w, 'f x sin x')
    })

    it('g² sin g by g: "g = sin g" beside the variable g is gone', async () => {
      const w = await worked('differentiate', 'g^2 sin(g), g')
      expect(named(w)).toBe('Named the two factors u and v and differentiated each.')
      expect(w.moves.some((m) => /(^|[^a-z\\])g = /.test(m.tex ?? ''))).toBe(false)
      // d/dg(g² sin g) = 2g sin g + g² cos g.
      expect(w.answers[0].tex).toBe(String.raw`2 g \sin {g} + g^{2} \cos {g}`)
    })

    it('(x + f)/(x + g): the top and the bottom are u and v, not "f = f + x"', async () => {
      const w = await worked('differentiate', '(x + f)/(x + g)')
      expect(named(w)).toBe('Named the top u and the bottom v and differentiated each.')
      expect(w.moves.map((m) => m.rule)).toContain(String.raw`\frac{d}{dx}\left(\frac{u}{v}\right) = \frac{vu' - uv'}{v^{2}}`)
      // ((x + g) − (x + f))/(x + g)² = (g − f)/(x + g)².
      expect(w.answers[0].tex).toBe(String.raw`\frac{g - f}{\left(g + x\right)^{2}}`)
      rendersAll(w, 'quotient')
    })

    it('f x sin(x²): u is the chain rule’s inside, so the factors are p and q', async () => {
      const w = await worked('differentiate', 'f x sin(x^2)')
      expect(named(w)).toBe('Named the two factors p and q and differentiated each.')
      expect(w.moves.some((m) => m.head.startsWith('Called the inside u'))).toBe(true)
    })

    it('x² sin x, with no f or g in it, keeps f and g', async () => {
      const w = await worked('differentiate', 'x^2 sin(x)')
      expect(named(w)).toBe('Named the two factors f and g and differentiated each.')
    })
  })

  describe('#25 a Greek letter named for Differentiate or Integrate', () => {
    const GREEK = ['theta', 'alpha', 'beta', 'gamma', 'phi', 'omega', 'lambda', 'mu', 'tau', 'sigma', 'rho', 'psi']

    it('is taken as the letter, not refused with "Differentiate takes…"', () => {
      for (const n of GREEK) {
        expect(casRequestFor('differentiate', `${n}^2, ${n}`, false), n).not.toBeNull()
        expect(casRequestFor('integrate', `${n}^2, ${n}, 0, 1`, false), n).not.toBeNull()
      }
      // Two letters are still not a letter.
      expect(casRequestFor('differentiate', 'x^2, xy', false)).toBeNull()
    })

    it('d/dα(α³) = 3α² and ∫ α² dα = α³/3 + C, for every Greek letter, written as that letter', async () => {
      for (const n of GREEK) {
        const tex = `\\${n}`
        const d = await worked('differentiate', `${n}^3, ${n}`)
        expect(d.error, n).toBeUndefined()
        expect(d.answers[0].tex, n).toBe(`3 ${tex}^{2}`)
        expect(d.input, n).toContain(`\\frac{d}{d${tex}}`)
        rendersAll(d, `d/d${n}`)
        const i = await worked('integrate', `${n}^2, ${n}`)
        expect(i.error, n).toBeUndefined()
        expect(i.answers[0].tex, n).toBe(`\\frac{${tex}^{3}}{3} + C`)
        expect(i.input, n).toContain(`\\,d${tex}`)
        rendersAll(i, `∫ d${n}`)
        // The letter is never spelt out in the maths: "dalpha", "dlamda".
        for (const t of [...texOf(d), ...texOf(i)]) expect(t, n).not.toMatch(/d(?:theta|alpha|beta|gamma|phi|omega|lamb?da|mu|tau|sigma|rho|psi)/)
      }
    })

    it('typed as the symbol: d/dω(ω² sin ω) = 2ω sin ω + ω² cos ω', async () => {
      const w = await worked('differentiate', 'ω^2 sin(ω)')
      expect(w.answers[0].tex).toBe(String.raw`2 \omega \sin {\omega} + \omega^{2} \cos {\omega}`)
      expect(w.input).toBe(String.raw`\frac{d}{d\omega}\left(\omega^{2} \sin {\omega}\right)`)
    })
  })

  describe('#24 the command bar names the order of the derivative', () => {
    const last = () => scene().log.at(-1)!

    it('diff(x^3, x, 2) = 6x reads d²/dx², not the false d/dx(x³) = 6x', async () => {
      await runCommand('diff(x^3, x, 2)')
      expect(last().tex).toBe(String.raw`\frac{d^{2}}{dx^{2}}\left(x^3\right) = 6 x`)
    })

    it('a third derivative, a named letter and the first derivative', async () => {
      await runCommand('diff(x^5, x, 3)')
      // d³/dx³ x⁵ = 5 · 4 · 3 x² = 60x².
      expect(last().tex).toBe(String.raw`\frac{d^{3}}{dx^{3}}\left(x^5\right) = 60 x^{2}`)
      await runCommand('diff(t^4, t, 2)')
      expect(last().tex).toBe(String.raw`\frac{d^{2}}{dt^{2}}\left(t^4\right) = 12 t^{2}`)
      await runCommand('diff(x^3, x, 1)')
      expect(last().tex).toBe(String.raw`\frac{d}{dx}\left(x^3\right) = 3 x^{2}`)
      await runCommand('diff(x^3, x)')
      expect(last().tex).toBe(String.raw`\frac{d}{dx}\left(x^3\right) = 3 x^{2}`)
      for (const e of scene().log.filter((l) => l.kind === 'result')) {
        expect(() => katex.renderToString(e.tex!, { displayMode: true, throwOnError: true, strict: 'ignore' }), e.tex).not.toThrow()
      }
    })

    it('an order it cannot write truthfully gets no label: diff(x^3, x, 0) is x³ itself', async () => {
      await runCommand('diff(x^3, x, 0)')
      expect(last().tex).toBe('x^{3}')
    })
  })
})
