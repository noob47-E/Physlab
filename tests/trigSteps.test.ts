// Trig-identity proofs (math/pure/trigIdentity.ts, the Working job "trigidentity"): the 21 school
// identities, each line true, each step named, short enough to read, and a false identity refused
// in a sentence. Also the two ways in — the Working field's LaTeX through latexToMath, and the
// command bar's prove(…) — because the engine reading its own spelling proves nothing about them.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import katex from 'katex'
import { evaluate, isTrigIdentity, parseIdentity, parseSide, proveIdentity, rewrites, sumPrint, trigWorking } from '../src/renderer/src/math/pure/trigIdentity'
import { JOBS, runPure, suggestJob } from '../src/renderer/src/math/pure/run'
import { latexToMath } from '../src/renderer/src/math/latexToMath'
import { texToPlain } from '../src/renderer/src/math/pure/work'
import { runCommand } from '../src/renderer/src/lang/commands'
import { scene } from '../src/renderer/src/core/store'
import { usePure } from '../src/renderer/src/math/pure/store'
import { cas } from '../src/renderer/src/math/cas'
import { resetGlobals } from './helpers/globals'

// The command-bar tests below run real lines through runCommand; SymPy cannot start here, so it
// records what it is asked (a proof must never ask it anything), and the stylesheet is not loaded.
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

// The 21 school identities both halves of the trig spike were run on (the SymPy half's
// identities.py): 16 named in the brief, then five board exercises. Written the way a student
// types them, so the parser is tested on real input too.
const IDENTITIES: { n: number; text: string; source: string }[] = [
  { n: 1, text: '1 - sin^2 x = cos^2 x', source: 'brief' },
  { n: 2, text: 'tan x = sin x / cos x', source: 'brief' },
  { n: 3, text: 'sec^2 x - tan^2 x = 1', source: 'brief' },
  { n: 4, text: '1 + cot^2 x = cosec^2 x', source: 'brief' },
  { n: 5, text: 'sin 2x = 2 sin x cos x', source: 'brief' },
  { n: 6, text: 'cos 2x = 2 cos^2 x - 1', source: 'brief' },
  { n: 7, text: 'tan 2x = 2 tan x / (1 - tan^2 x)', source: 'brief' },
  { n: 8, text: '(1 - cos 2x)/sin 2x = tan x', source: 'brief' },
  { n: 9, text: 'sin(A + B) = sin A cos B + cos A sin B', source: 'brief' },
  { n: 10, text: 'cos(A - B) = cos A cos B + sin A sin B', source: 'brief' },
  { n: 11, text: 'sin A + sin B = 2 sin((A + B)/2) cos((A - B)/2)', source: 'brief' },
  { n: 12, text: '(1 - cos x)/sin x = tan(x/2)', source: 'brief' },
  { n: 13, text: 'sec x - cos x = sin x tan x', source: 'brief' },
  { n: 14, text: '(sin x + cos x)^2 = 1 + sin 2x', source: 'brief' },
  { n: 15, text: 'cot x + tan x = sec x cosec x', source: 'brief' },
  { n: 16, text: '1/(1 + sin x) + 1/(1 - sin x) = 2 sec^2 x', source: 'brief' },
  { n: 17, text: '(sin 5x + sin 3x)/(cos 5x + cos 3x) = tan 4x', source: 'NCERT 11 Ex 3.3 Q17' },
  { n: 18, text: 'cos 4x = 1 - 8 sin^2 x cos^2 x', source: 'NCERT 11 Ex 3.3 Q24' },
  { n: 19, text: 'cos 3x = 4 cos^3 x - 3 cos x', source: 'NCERT 11 / PCTB 11 Ch 10' },
  { n: 20, text: 'sin x/(1 + cos x) + (1 + cos x)/sin x = 2 cosec x', source: 'PCTB 11 Ch 10' },
  { n: 21, text: '(1 - sin x)/(1 + sin x) = (sec x - tan x)^2', source: 'PCTB 11 Ch 10' }
]

// Five random radian points (fixed seed), away from the check points the search itself uses.
function points(): Record<string, number>[] {
  let s = 20260924
  const r = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2.8 + 0.15
  return Array.from({ length: 5 }, () => ({ x: r(), A: r(), B: r(), θ: r(), t: r() }))
}
const PTS = points()

const renders = (tex: string): void => {
  katex.renderToString(tex, { throwOnError: true })
}

describe('reading identities', () => {
  it('reads the way a student types', () => {
    expect(sumPrint(parseSide('sin^2 x')).text).toBe('sin²x')
    expect(sumPrint(parseSide('sin²x + cos²x')).text).toBe('sin²x + cos²x')
    expect(sumPrint(parseSide('2 sin x cos x')).text).toBe('2 sin x cos x')
    expect(sumPrint(parseSide('cosec x')).text).toBe('cosec x')
    expect(sumPrint(parseSide('(1 - cos 2x)/sin 2x')).text).toBe('(1 − cos 2x)/sin 2x')
    expect(sumPrint(parseSide('sin((A + B)/2)')).text).toBe('sin((A + B)/2)')
    expect(sumPrint(parseSide('tan(x/2)')).text).toBe('tan(x/2)')
    expect(sumPrint(parseSide('sin(-x)')).text).toBe('−sin x')
    expect(sumPrint(parseSide('cos(-x)')).text).toBe('cos x')
    expect(sumPrint(parseSide('sin theta cos theta')).text).toBe('sin θ cos θ')
  })

  it('refuses what is not a trig identity, in words', () => {
    expect(() => parseSide('x + sin x')).toThrow(/on its own/)
    expect(() => parseIdentity('sin x')).toThrow(/one “=”/)
    expect(() => parseSide('sin(x^2)')).toThrow(/angle/)
  })

  it('reads what the Working field sends: its LaTeX through latexToMath', () => {
    // latexToMath brackets every power (sin(x)^(2)) and every angle (sin(2x)); the spike's reader
    // took "^(2)" for a power that is not a whole number and refused all of these.
    const cases: [string, string][] = [
      [String.raw`\sin^2x+\cos^2x=1`, 'Prove sin²x + cos²x = 1'],
      [String.raw`\frac{1-\cos2x}{\sin2x}=\tan x`, 'Prove (1 − cos 2x)/sin 2x = tan x'],
      [String.raw`1+\cot^2x=\csc^2x`, 'Prove 1 + cot²x = cosec²x'],
      [String.raw`1+\cot^2x=\operatorname{cosec}^2x`, 'Prove 1 + cot²x = cosec²x'],
      [String.raw`\sin^{2}\theta+\cos^{2}\theta=1`, 'Prove sin²θ + cos²θ = 1'],
      [String.raw`\tan\left(\frac{x}{2}\right)=\frac{1-\cos x}{\sin x}`, 'Prove tan(x/2) = (1 − cos x)/sin x'],
      [String.raw`\left(\sin x+\cos x\right)^2=1+\sin2x`, 'Prove (sin x + cos x)² = 1 + sin 2x'],
      [String.raw`\sin\left(A+B\right)=\sin A\cos B+\cos A\sin B`, 'Prove sin(A + B) = sin A cos B + cos A sin B']
    ]
    for (const [latex, title] of cases) {
      const w = runPure('trigidentity', latexToMath(latex))
      expect(w.error, latex).toBeUndefined()
      expect(w.title, latex).toBe(title)
      expect(w.checked, latex).toBe('ok')
      expect(w.moves.length, latex).toBeGreaterThan(1)
    }
  })

  it('the proof\'s own input LaTeX reads back to the same identity (the field is re-run from it)', () => {
    // trigWorking's input is exactly these two printed sides; reading them back needs no proof search.
    const printed = (text: string): string => {
      const { lhs, rhs } = parseIdentity(text)
      return `${sumPrint(lhs).text} = ${sumPrint(rhs).text}`
    }
    for (const { text } of IDENTITIES) {
      const { lhs, rhs } = parseIdentity(text)
      const input = `${sumPrint(lhs).tex} = ${sumPrint(rhs).tex}`
      expect(printed(latexToMath(input)), input).toBe(printed(text))
    }
    expect(trigWorking(IDENTITIES[20].text).input).toBe(String.raw`\dfrac{1 - \sin x}{1 + \sin x} = \left(\sec x - \tan x\right)^{2}`)
  })
})

describe('the identity is shown as the student typed it', () => {
  it('keeps the order of terms and factors and the signs inside brackets', () => {
    const text = '(cos x - cos 3x)(sin 8x + sin 2x) = (sin 5x - sin x)(cos 4x - cos 6x)'
    const w = trigWorking(text)
    expect(w.title).toBe('Prove (cos x − cos 3x) (sin 8x + sin 2x) = (sin 5x − sin x) (cos 4x − cos 6x)')
    expect(w.input).toBe(String.raw`\left(\cos x - \cos 3x\right) \left(\sin 8x + \sin 2x\right) = \left(\sin 5x - \sin x\right) \left(\cos 4x - \cos 6x\right)`)
    if (w.answers[0]?.label === 'Proved') {
      expect(w.moves[0].tex).toBe(String.raw`\left(\cos x - \cos 3x\right) \left(\sin 8x + \sin 2x\right)`)
      expect(w.moves.at(-1)?.tex).toBe(String.raw`= \left(\sin 5x - \sin x\right) \left(\cos 4x - \cos 6x\right)`)
    }
    expect(trigWorking('sin^8 x - cos^8 x = (sin^2 x - cos^2 x)(1 - 2 sin^2 x cos^2 x)').title).toBe(
      'Prove sin⁸x − cos⁸x = (sin²x − cos²x) (1 − 2 sin²x cos²x)'
    )
    expect(trigWorking('sin 3x + sin 5x + sin 7x = sin 5x (1 + 2 cos 2x)').title).toMatch(/^Prove sin 3x \+ sin 5x \+ sin 7x = /)
    expect(trigWorking('cos 5x = 16 cos^5 x - 20 cos^3 x + 5 cos x').title).toBe('Prove cos 5x = 16 cos⁵x − 20 cos³x + 5 cos x')
    // The field is re-run from the input LaTeX: it reads back to the same title.
    expect(trigWorking(latexToMath(w.input)).title).toBe(w.title)
  }, 30_000)

  it('sides that differ only in order still end at the right-hand side as typed', () => {
    const w = trigWorking('sin x cos x = cos x sin x')
    expect(w.answers[0]?.label).toBe('Proved')
    expect(w.moves.at(-1)?.tex).toBe(String.raw`= \cos x \sin x`)
  })
})

describe('allied angles, with π in the angle', () => {
  it('sin(π/2 − x) = cos x and its family are proved from the compound angle formulas', () => {
    const cases: [string, string][] = [
      ['sin(pi/2 - x) = cos x', 'Prove sin(π/2 − x) = cos x'],
      ['cos(π/2 - x) = sin x', 'Prove cos(π/2 − x) = sin x'],
      ['cos(pi + x) = -cos x', 'Prove cos(π + x) = −cos x'],
      ['tan(pi - x) = -tan x', 'Prove tan(π − x) = −tan x'],
      ['sin(3pi/2 + x) = -cos x', 'Prove sin(3π/2 + x) = −cos x'],
      ['tan(pi/2 - x) = cot x', 'Prove tan(π/2 − x) = cot x']
    ]
    for (const [text, title] of cases) {
      const w = trigWorking(text)
      expect(w.error, text).toBeUndefined()
      expect(w.title, text).toBe(title)
      expect(w.answers[0]?.label, text).toBe('Proved')
      expect(w.moves.some((m) => /compound angle/.test(m.head ?? '')), text).toBe(true)
      for (const t of [w.input, ...w.moves.map((m) => m.tex)].filter((x): x is string => !!x)) expect(() => renders(t), t).not.toThrow()
      // The field is re-run from the input LaTeX.
      expect(trigWorking(latexToMath(w.input)).title, text).toBe(title)
    }
    // An angle of π alone reads as a textbook writes it, cos π, and the words name it so.
    expect(trigWorking('cos(pi + x) = -cos x').moves[1].head).toContain('cos x cos π − sin x sin π')
  })

  it('a false one is refused with π read as the number', () => {
    expect(trigWorking('sin(pi/2 - x) = sin x').error).toBe(
      'Those two sides are not equal, so there is nothing to prove: at x = 1 rad, sin(π/2 − x) = 0.54 but sin x = 0.841.'
    )
  })

  it('a number of degrees in an angle is refused truthfully, pointing to π', () => {
    const e = trigWorking('sin(90 - x) = cos x').error ?? ''
    expect(e).toMatch(/cannot yet work with a plain number inside an angle/)
    expect(e).toContain('π/2')
  })
})

describe('every rewrite is checked before use', () => {
  it('no rule changes the value of any expression met while proving the 21 (a wrong rule would throw)', () => {
    for (const { text } of IDENTITIES) {
      const { lhs, rhs } = parseIdentity(text)
      expect(() => rewrites(lhs, new Set())).not.toThrow()
      expect(() => rewrites(rhs, new Set())).not.toThrow()
    }
  })

  it('a letter the check points do not name still gets values of its own', () => {
    // The check points named x, A, B, θ and t, and any other letter was read as 0: sin 2y and
    // 2 sin y were both 0 everywhere, so a false identity was "true" and no rule on y was checked.
    const w = trigWorking('sin 2y = 2 sin y')
    expect(w.error).toMatch(/^Those two sides are not equal/)
    expect(w.error).toContain('y = 1 rad')
    expect(trigWorking('sin 2y = 2 sin y cos y').checked).toBe('ok')
    expect(trigWorking('sin 2y = 2 sin y cos y').error).toBeUndefined()
    const { lhs, rhs } = parseIdentity('sin 2y = 2 sin y')
    expect(evaluate(lhs, PTS[0])).not.toBeCloseTo(evaluate(rhs, PTS[0]), 3)
  })
})

describe('the 21 identities', () => {
  const results = IDENTITIES.map((id) => {
    const { lhs, rhs } = parseIdentity(id.text)
    const t0 = performance.now()
    const proof = proveIdentity(lhs, rhs, { strict: true, budgetMs: 20_000 })
    return { id, lhs, rhs, proof, ms: performance.now() - t0 }
  })

  it('at least 20 of 21 are proved', () => {
    const proved = results.filter((r) => !('refused' in r.proof)).length
    expect(proved).toBeGreaterThanOrEqual(20)
  })

  for (const r of results) {
    it(`${r.id.n}. ${r.id.text}`, () => {
      if ('refused' in r.proof) {
        // Allowed for at most one identity (the test above); it must still not be "not equal".
        expect(r.proof.refused).toBe('not-found')
        return
      }
      const { lines } = r.proof
      // At most 8 lines: the left-hand side and seven steps.
      expect(lines.length).toBeLessThanOrEqual(8)
      // Starts at the left, ends at the right.
      expect(lines[0].text).toBe(sumPrint(r.lhs).text)
      expect(lines[lines.length - 1].text).toBe(sumPrint(r.rhs).text)
      // Every line equals the left-hand side at five random points (read back from its own text).
      for (const l of lines) {
        const back = parseSide(l.text.replace(/−/g, '-'))
        for (const p of PTS) {
          const a = evaluate(r.lhs, p)
          const b = evaluate(back, p)
          if (Math.abs(a) > 1e6 || !Number.isFinite(a)) continue
          expect(Math.abs(a - b), `${l.text} at ${JSON.stringify(p)}`).toBeLessThan(1e-9 * Math.max(1, Math.abs(a)))
        }
      }
      // Every step names its rule; the first line has none.
      expect(lines[0].rule).toBe('')
      for (const l of lines.slice(1)) {
        expect(l.rule.length).toBeGreaterThan(8)
        expect(l.rule).not.toMatch(/TR\d|undefined|NaN/)
      }
      // Fast enough to run as the student presses Enter.
      expect(r.ms).toBeLessThan(4000)
    })
  }

  it('the Working is KaTeX-clean, checked, and its sentences are plain', () => {
    for (const { text } of IDENTITIES) {
      const w = trigWorking(text)
      expect(w.error).toBeUndefined()
      expect(w.checked).toBe('ok')
      expect(w.answers.length, text).toBeGreaterThan(0)
      for (const t of [w.input, ...w.moves.flatMap((m) => [m.tex, m.rule]), ...w.answers.map((a) => a.tex)].filter((x): x is string => !!x)) {
        expect(() => renders(t), t).not.toThrow()
      }
      // Heads, notes and the check are read as plain sentences (the panel runs texToPlain).
      for (const s of [...w.moves.flatMap((m) => [m.head, m.note, m.subgoal]), w.check].filter((x): x is string => !!x)) {
        expect(s, s).not.toMatch(/\\|[{}]|undefined|NaN/)
        expect(texToPlain(s)).toBe(s)
      }
    }
  }, 30_000)

  it('every line of the Working is the next line of the proof, "= …" after the first', () => {
    const w = trigWorking('sec x - cos x = sin x tan x')
    expect(w.moves.map((m) => m.tex)).toEqual([
      String.raw`\sec x - \cos x`,
      String.raw`= \dfrac{1}{\cos x} - \cos x`,
      String.raw`= \dfrac{1 - \cos^{2} x}{\cos x}`,
      String.raw`= \dfrac{\sin^{2} x}{\cos x}`,
      String.raw`= \sin x \tan x`
    ])
    expect(w.moves.map((m) => m.head)).toEqual([
      'Started from the left-hand side.',
      'Wrote sec x as 1/cos x.',
      'Put the fractions over a common denominator.',
      'Used 1 − cos²x = sin²x.',
      'Wrote sin x/cos x as tan x.'
    ])
  })

  it('the chip beside each step is the law that step used, and it is true', () => {
    const more = ['sin 3x = 3 sin x - 4 sin^3 x', 'cos^4 x - sin^4 x = cos 2x', 'sin^2 A - sin^2 B = sin(A + B) sin(A - B)', '(1 + tan^2 x)/(1 + cot^2 x) = tan^2 x']
    const chipsOf = (text: string): { rule: string; chip: string }[] => {
      const { lhs, rhs } = parseIdentity(text)
      const p = proveIdentity(lhs, rhs, { strict: true, budgetMs: 20_000 })
      return 'refused' in p ? [] : p.lines.slice(1).map((l) => ({ rule: l.rule, chip: l.chip }))
    }
    let read = 0
    for (const text of [...IDENTITIES.map((i) => i.text), ...more]) {
      for (const { rule, chip } of chipsOf(text)) {
        expect(chip.length, `${text}: ${rule}`).toBeGreaterThan(0)
        // Each formula in a chip that PhysLab can read back must itself be an identity.
        for (const one of chip.split(',\\ ')) {
          if (/\b[abcd]\b/.test(one.replace(/\\[a-zA-Z]+/g, ' '))) continue
          let src: string
          try {
            src = latexToMath(one)
            parseIdentity(src)
          } catch {
            continue
          }
          read++
          expect(isTrigIdentity(src), `${text}: ${rule} — chip ${one}`).toBe(true)
        }
      }
    }
    expect(read).toBeGreaterThan(20)
    // The ones that used to show the wrong law.
    const at = (text: string, rule: RegExp): string => chipsOf(text).find((c) => rule.test(c.rule))?.chip ?? ''
    expect(at('cos(A - B) = cos A cos B + sin A sin B', /compound/)).toBe(String.raw`\cos(A - B) = \cos A\cos B + \sin A\sin B`)
    expect(at('sin^2 A - sin^2 B = sin(A + B) sin(A - B)', /double angle/)).toBe(String.raw`\cos 2\theta = 1 - 2\sin^2\theta`)
    expect(at('sin^2 A - sin^2 B = sin(A + B) sin(A - B)', /sum-to-product/)).toBe(String.raw`2\sin A\sin B = \cos(A - B) - \cos(A + B)`)
    expect(at('sin x/(1 + cos x) + (1 + cos x)/sin x = 2 cosec x', /as cosec x/)).toBe(String.raw`\operatorname{cosec}\theta = \dfrac{1}{\sin\theta}`)
    expect(at('(1 - sin x)/(1 + sin x) = (sec x - tan x)^2', /Split/)).toBe(String.raw`\dfrac{a + b}{c} = \dfrac{a}{c} + \dfrac{b}{c}`)
    expect(at('cos 3x = 4 cos^3 x - 3 cos x', /Expanded/)).toBe('a(b + c) = ab + ac')
    // A cube is expanded by the cube law, not beside (a + b)².
    expect(at('sin^6 x + cos^6 x = 1 - 3 sin^2 x cos^2 x', /Expanded/)).toBe('(a + b)^3 = a^3 + 3a^2b + 3ab^2 + b^3')
    expect(at('(sin x + cos x)^2 = 1 + sin 2x', /Expanded/)).toBe('(a + b)^2 = a^2 + 2ab + b^2')
    // Read backwards, squaring out is writing a perfect square back as one.
    expect(at('1 + sin 2x = (sin x + cos x)^2', /Factorised/)).toBe('a^2 + 2ab + b^2 = (a + b)^2')
  }, 30_000)

  it('a line of only negative terms is turned round the way a textbook writes it', () => {
    const w = trigWorking('cos 3x = 4 cos^3 x - 3 cos x')
    expect(w.moves.map((m) => m.tex)).toContain(String.raw`= \cos x \left(2 \cos^{2} x - 1\right) - 2 \cos x \left(1 - \cos^{2} x\right)`)
  })

  it('a half angle under a fraction bar is written on one line, not as a fraction in a fraction', () => {
    const w = trigWorking('(1 - cos x)/sin x = tan(x/2)')
    const texes = w.moves.map((m) => m.tex ?? '')
    expect(texes).toContain(String.raw`= \dfrac{\sin\left(x/2\right)}{\cos\left(x/2\right)}`)
    // …and on its own, as a textbook sets it.
    expect(texes.at(-1)).toBe(String.raw`= \tan\left(\frac{x}{2}\right)`)
  })

  it('a bracketed sum alone over or under the bar loses its brackets', () => {
    const w = trigWorking('1/(1 + sin x) + 1/(1 - sin x) = 2 sec^2 x')
    for (const m of w.moves) expect(m.tex ?? '', m.tex).not.toMatch(/\\dfrac\{[^{}]*\}\{\\left\((?:(?!\\right\)).)*\\right\)\}/)
    expect(w.moves.map((m) => m.tex)).toContain(String.raw`= \dfrac{2}{1 - \sin^{2} x}`)
  })
})

describe('a true identity always gets its answer, promptly', () => {
  it('a step whose coefficients are tiny powers of 1/2 is not taken for a wrong rule', () => {
    // clean() rounded to 9 decimal places: 1/65536 became 0.000015259, and the double angle step
    // "changed the value", which threw a developer message at the student.
    const text = '(1 + sin 2x + cos 2x)/(1 + sin 2x - cos 2x) = cot x'
    const w = trigWorking(text)
    expect(w.error).toBeUndefined()
    expect(w.checked).toBe('ok')
    expect(['Proved', 'True']).toContain(w.answers[0]?.label)
    // Strict, every rewrite the search meets is checked and none is a false alarm now.
    const { lhs, rhs } = parseIdentity(text)
    expect(() => proveIdentity(lhs, rhs, { strict: true, budgetMs: 3000 })).not.toThrow()
  }, 20_000)

  it('the search keeps to its time budget and still says the identity is true', () => {
    // NCERT 11 Ex 3.3: this took 8.5 s with the renderer frozen.
    const t0 = performance.now()
    const w = trigWorking('(sin 3x + sin x) sin x + (cos 3x - cos x) cos x = 0', { budgetMs: 800 })
    expect(performance.now() - t0).toBeLessThan(800 + 1500)
    expect(w.error).toBeUndefined()
    expect(['Proved', 'True']).toContain(w.answers[0]?.label)
    const { lhs, rhs } = parseIdentity('(sin x - sin 3x)/(sin^2 x - cos^2 x) = 2 sin x')
    const t1 = performance.now()
    proveIdentity(lhs, rhs, { budgetMs: 300 })
    expect(performance.now() - t1).toBeLessThan(300 + 1500)
  }, 20_000)
})

describe('a false identity', () => {
  it('sin 2x = 2 sin x is refused, quoting both sides at x = 1 radian', () => {
    const w = trigWorking('sin 2x = 2 sin x')
    expect(w.error).toBe('Those two sides are not equal, so there is nothing to prove: at x = 1 rad, sin 2x = 0.909 but 2 sin x = 1.683.')
  })

  it('cos(A + B) = cos A + cos B is refused, at a point where the difference shows', () => {
    const e = trigWorking('cos(A + B) = cos A + cos B').error ?? ''
    expect(e).toMatch(/^Those two sides are not equal/)
    expect(e).toContain('A = 1 rad, B = 0.3 rad')
    const [, l, r] = /= (-?[\d.]+) but .* = (-?[\d.]+)\.$/.exec(e) ?? []
    expect(l).not.toBe(r)
  })

  it('the sides are quoted as PhysLab reads them, not as latexToMath spells them', () => {
    const w = runPure('trigidentity', latexToMath(String.raw`\sin2x=2\sin x`))
    expect(w.error).toContain('sin 2x = 0.909 but 2 sin x = 1.683')
  })
})

describe('the Working job and Auto', () => {
  it('is offered in the panel with an example that proves', () => {
    const job = JOBS.find((j) => j.id === 'trigidentity')
    expect(job?.label).toBe('Prove identity')
    const w = runPure('trigidentity', job!.example)
    expect(w.error).toBeUndefined()
    expect(w.checked).toBe('ok')
    expect(latexToMath(job!.exampleLatex).replace(/\s+/g, '')).toBe(job!.example.replace(/\s+/g, ''))
  })

  it('Auto picks the proof for an identity, and leaves an equation with Solve', () => {
    expect(suggestJob('sin(x)^(2)+cos(x)^(2)=1')).toBe('trigidentity')
    expect(suggestJob('sin(2x)=2sin(x)cos(x)')).toBe('trigidentity')
    // An equation to solve: its SymPy fallback still answers it under Solve.
    expect(suggestJob('sin(x)=0.5')).toBe('solve')
    expect(suggestJob('x^2 + 4x + 13 = 0')).toBe('solve')
    expect(isTrigIdentity('sin 2x = 2 sin x')).toBe(false)
  })
})

describe('from the command bar', () => {
  beforeEach(() => {
    resetGlobals()
    scene().newScene()
    scene().clearLog()
    vi.mocked(cas).mockClear()
  })

  it('prove(…) and identity(…) show the proof in the Working and log the answer', async () => {
    for (const line of ['prove(cot x + tan x = sec x cosec x)', 'identity(1 - sin^2 x = cos^2 x)', 'prove(sin theta/cos theta = tan theta)']) {
      scene().clearLog()
      await runCommand(line)
      const last = scene().log.at(-1)
      expect(last?.kind, line).toBe('result')
      expect(last?.tex, line).toMatch(/^\\text\{Proved\}/)
      expect(() => renders(last?.tex ?? ''), line).not.toThrow()
      const { working, inputLatex } = usePure.getState()
      expect(working?.checked, line).toBe('ok')
      // The field gets LaTeX that reads back to the same identity, not mathjs's sin(2)·x.
      expect(trigWorking(latexToMath(inputLatex)).title, line).toBe(working?.title)
    }
    expect(vi.mocked(cas).mock.calls).toHaveLength(0)
  })

  it('a false identity from the bar is an error sentence, not a proof', async () => {
    await runCommand('prove(sin 2x = 2 sin x)')
    const last = scene().log.at(-1)
    expect(last?.kind).toBe('error')
    expect(last?.text).toContain('sin 2x = 0.909 but 2 sin x = 1.683')
  })

  it('identity(3) is still the identity matrix: a calculation is not taken over', async () => {
    await runCommand('identity(3)')
    const last = scene().log.at(-1)
    expect(last?.kind).not.toBe('error')
  })
})
