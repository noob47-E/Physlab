// The label in front of an answer — "x_1 =", "theta_2 =" — as the student reads it (polish item P2).
//
// math/pure/complex.ts names a quadratic's roots "x_1 =" and "x_2 =" in a plain string, and the command
// bar's label() (lang/commands.ts) turns that underscore into TeX, so the string itself must not change.
// The Working panel used to show the string as it came, so the student read "x_1 =" and Copy put "x_1" on
// the clipboard; Equations mode wrote "x1 =". What each place must show is decided in calc/labels.ts
// (labelTex for the panel, labelText for Copy) and in calc/roots.ts (Equations mode), and checked here:
//   - the panel draws a symbol label as maths, KaTeX's own drawing of it read back from its MathML;
//   - a word label (Answer, Quotient, HCF =) stays a word;
//   - Copy and Equations mode write Unicode subscripts: x₁ =, θ₂ =, x₁₀ =.
// Tests marked "guard" pass before the fix as well: they keep the fix from breaking what already works.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import katex from 'katex'
import { describe, expect, it } from 'vitest'
import { answerCopyLine, labelTex, labelText } from '../src/renderer/src/calc/labels'
import { polynomialRootRows } from '../src/renderer/src/calc/roots'
import { runPure } from '../src/renderer/src/math/pure/run'

/**
 * KaTeX's drawing of some TeX as MathML, so it can be read back. It throws on TeX it cannot draw,
 * where the app's <Tex> would show the raw string in red. The TeX source KaTeX quotes inside
 * <annotation> is cut out: only what was drawn counts.
 */
const drawnMathML = (tex: string): string =>
  katex.renderToString(tex, { throwOnError: true, strict: 'ignore', output: 'mathml' }).replace(/<annotation[\s\S]*?<\/annotation>/, '')

const textOf = (mathml: string): string => mathml.replace(/<[^>]+>/g, '')

interface Drawn {
  /** The letters under the first subscript ("x", "θ", "speed"). */
  base: string
  /** The subscript's digits ("1", "10"). */
  sub: string
  /** Whether an = is drawn after the subscript. */
  equals: boolean
}

/** What a label's TeX draws. */
function drawn(tex: string): Drawn {
  const ml = drawnMathML(tex)
  const m = /<msub>([\s\S]*?)<mn>(\d+)<\/mn><\/msub>/.exec(ml)
  const equalsIn = (s: string): boolean => /<mo[^>]*>=<\/mo>/.test(s)
  if (m) return { base: textOf(m[1]), sub: m[2], equals: equalsIn(ml.slice(m.index + m[0].length)) }
  // No subscript: what stands before the = is the base ("x =" draws x, then =).
  const eq = /<mo[^>]*>=<\/mo>/.exec(ml)
  return { base: textOf(eq ? ml.slice(0, eq.index) : ml), sub: '', equals: eq !== null }
}

/** What the panel draws for a label, or null when it keeps the label as plain text. */
const panelDraws = (label: string): Drawn | null => {
  const tex = labelTex(label)
  return tex === null ? null : drawn(tex)
}

/** The names for which `ok` is false or throws, so one failing line says which of many went wrong. */
const namesFailing = (names: string[], ok: (name: string) => boolean): string[] =>
  names.filter((name) => {
    try {
      return !ok(name)
    } catch {
      return true
    }
  })

/** The Greek names the expression parser spells out (θ → theta); lang/commands.ts keeps the same list for the bar. */
const GREEK_NAMES = [
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi',
  'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega'
]

/** The labels the pure engine really writes as words (math/pure/*.ts); none of them is a symbol. */
const WORD_LABELS = ['Answer', 'Quotient', 'Remainder', 'Altogether', 'HCF =', 'LCM =', 'Modulus', 'Argument', 'Conjugate', 'As a decimal', 'True', 'Proved']

/** Unicode subscript digits, written out here so the expected text never comes from the code under test. */
const SUB_DIGITS = '₀₁₂₃₄₅₆₇₈₉'
const subscripted = (n: number): string => [...String(n)].map((d) => SUB_DIGITS[Number(d)]).join('')

describe('the label the Working holds is not changed', () => {
  it('guard: a quadratic still names its roots "x_1 =" and "x_2 =", a Greek unknown "theta_1 =" and "theta_2 =" (the command bar reads this format)', () => {
    expect(runPure('solve', 'x^2 - 5x + 6 = 0').answers.map((a) => a.label)).toEqual(['x_1 =', 'x_2 ='])
    expect(runPure('solve', 'theta^2 - 5theta + 6 = 0').answers.map((a) => a.label)).toEqual(['theta_1 =', 'theta_2 ='])
  })
})

describe('the Working panel draws a symbol label as maths', () => {
  const symbols: [label: string, base: string, sub: string][] = [
    ['x_1 =', 'x', '1'],
    ['x_2 =', 'x', '2'],
    ['X_1 =', 'X', '1'],
    ['speed_1 =', 'speed', '1'], // an unknown named with a word still gets a subscript, not "speed_1"
    // KaTeX reads x_10 as x with a 1 under it and a 0 after it: the digits have to travel together.
    ['x_10 =', 'x', '10']
  ]
  it.each(symbols)('%s is drawn as %s with subscript %s, then =', (label, base, sub) => {
    const tex = labelTex(label)
    expect(tex, `"${label}" is a symbol label: it must come back as TeX, not null`).not.toBeNull()
    expect(drawn(tex!)).toEqual({ base, sub, equals: true })
  })

  it.each([
    ['theta_1 =', '1'],
    ['theta_2 =', '2']
  ])('%s is drawn as the letter θ with subscript %s, not as t h e t a₂', (label, sub) => {
    const tex = labelTex(label)
    expect(tex, `"${label}" is a symbol label: it must come back as TeX, not null`).not.toBeNull()
    expect(drawn(tex!)).toEqual({ base: textOf(drawnMathML('\\theta')), sub, equals: true })
  })

  it('every Greek name the parser spells out is drawn as its letter with a subscript, not a common few', () => {
    expect(
      namesFailing(GREEK_NAMES, (name) => {
        const tex = labelTex(`${name}_1 =`)
        return tex !== null && JSON.stringify(drawn(tex)) === JSON.stringify({ base: textOf(drawnMathML(`\\${name}`)), sub: '1', equals: true })
      })
    ).toEqual([])
  })

  it('guard: a word label stays a word, plain text and not maths (Answer is not the product A·n·s·w·e·r)', () => {
    expect(WORD_LABELS.filter((label) => labelTex(label) !== null)).toEqual([])
  })

  it('a bare letter is maths too, as the command bar draws it: "x =" is x then =, "z" is z, "theta =" is θ then =', () => {
    const theta = textOf(drawnMathML('\\theta'))
    expect(['x =', 'X =', 'z', 'theta =', 'x=', ' x = '].map(panelDraws)).toEqual([
      { base: 'x', sub: '', equals: true },
      { base: 'X', sub: '', equals: true },
      { base: 'z', sub: '', equals: false },
      { base: theta, sub: '', equals: true },
      { base: 'x', sub: '', equals: true },
      { base: 'x', sub: '', equals: true }
    ])
  })

  it('draws what the command bar draws for the same label: its label() in lang/commands.ts, pinned in commands.test.ts', () => {
    // What the bar writes in front of an answer for each label. "x_1 =" reaches it as "x_1 = ", "theta_1 =" as
    // "\theta_1 = ", a word-named unknown as "\text{speed}_1 = ", and a bare letter as the letter.
    const bar: [label: string, barTex: string][] = [
      ['x_1 =', 'x_1 = '],
      ['x_2 =', 'x_2 = '],
      ['theta_1 =', '\\theta_1 = '],
      ['theta_2 =', '\\theta_2 = '],
      ['speed_1 =', '\\text{speed}_1 = '],
      ['x =', 'x = '],
      ['theta =', '\\theta = ']
    ]
    expect(
      bar
        .filter(([label, barTex]) => {
          const tex = labelTex(label)
          return tex === null || drawnMathML(tex) !== drawnMathML(barTex)
        })
        .map(([label]) => label)
    ).toEqual([])
  })

  it('guard: a label already written with Unicode, a number and a probability stay plain text, nothing is converted twice', () => {
    // "x₁", "z₂" are what the inverse-normal job writes; "12 =" is a prime factorisation; P(...) is a normal-table question.
    const plain = ['x₁', 'x₂ =', 'z₁', 'θ₂ =', '12 =', '7', 'P(Z < 1.96)', 'P(1 < X < 2)']
    expect(plain.filter((label) => labelTex(label) !== null)).toEqual([])
  })

  it('a name that is also a property every JavaScript object has is just a name: constructor_1 is a word with a subscript, toString a word', () => {
    // Looked up in a plain object, "constructor" and "toString" would be taken for Greek names and handed to KaTeX as \constructor.
    expect(panelDraws('constructor_1 =')).toEqual({ base: 'constructor', sub: '1', equals: true })
    expect(panelDraws('toString =')).toBeNull()
  })
})

describe('Copy writes the label with Unicode subscripts, never "x_1"', () => {
  it.each([
    ['x_1 =', 'x₁ ='],
    ['x_2 =', 'x₂ ='],
    ['X_1 =', 'X₁ ='],
    ['theta_1 =', 'θ₁ ='],
    ['theta_2 =', 'θ₂ ='],
    ['speed_2 =', 'speed₂ ='],
    ['x_10 =', 'x₁₀ =']
  ])('%s is copied as %s', (label, text) => {
    expect(labelText(label)).toBe(text)
  })

  it('Greek names are copied as their letters', () => {
    const letters: Record<string, string> = { alpha: 'α', beta: 'β', lambda: 'λ', mu: 'μ', sigma: 'σ', tau: 'τ', omega: 'ω' }
    const copied = Object.fromEntries(Object.keys(letters).map((name) => [name, labelText(`${name}_1 =`)]))
    expect(copied).toEqual(Object.fromEntries(Object.entries(letters).map(([name, letter]) => [name, `${letter}₁ =`])))
  })

  it('every Greek name the parser spells out is copied as one Greek letter and a subscript, never as the word', () => {
    expect(namesFailing(GREEK_NAMES, (name) => /^[Ͱ-Ͽ]₂ =$/.test(labelText(`${name}_2 =`)))).toEqual([])
  })

  it('guard: a word, a number, a bare letter and a label already written with a subscript are copied as they stand', () => {
    // "x₁", "z₂" and the plain "x" / "z" are what the inverse-normal job writes (math/pure/zscore.ts); "12 =" is a prime factorisation.
    const asTheyStand = [...WORD_LABELS, '12 =', '7', 'x =', 'x', 'z', 'x₁', 'x₂', 'z₁', 'z₂', 'x₁ =', 'θ₂ =']
    expect(asTheyStand.filter((label) => labelText(label) !== label)).toEqual([])
  })

  it('a bare Greek name is copied as its letter, as the panel draws it: "theta =" is "θ ="', () => {
    expect(['theta =', 'sigma', 'omega ='].map(labelText)).toEqual(['θ =', 'σ', 'ω ='])
  })

  it('guard: a label that is more than a symbol — a probability, a sum — is copied as it stands', () => {
    const asTheyStand = ['P(Z < 1.96)', 'P(1 < X < 2)', 'x_1 + x_2 =', 'x_1 y =', 'x_1 = 3', 'toString =', 'constructor =']
    expect(asTheyStand.filter((label) => labelText(label) !== label)).toEqual([])
  })

  it('a name that is also a property every JavaScript object has is just a name: "constructor_1 =" is "constructor₁ ="', () => {
    expect(labelText('constructor_1 =')).toBe('constructor₁ =')
  })

  it('the label need not be tidy: no space before the =, or spaces round the whole label, give the same text', () => {
    expect(['x_1=', ' x_1 = ', 'x_1  ='].map(labelText)).toEqual(['x₁ =', 'x₁ =', 'x₁ ='])
  })
})

describe('a real answer, from the typed line to the screen and the clipboard', () => {
  it('"x² − 5x + 6 = 0": the panel draws x with subscript 1, then x with subscript 2', () => {
    const w = runPure('solve', 'x^2 - 5x + 6 = 0')
    const shown = w.answers.map((a) => {
      const tex = labelTex(a.label)
      return tex === null ? null : drawn(tex)
    })
    expect(shown).toEqual([
      { base: 'x', sub: '1', equals: true },
      { base: 'x', sub: '2', equals: true }
    ])
  })

  it.each(['x^2 - 5x + 6 = 0', 'x^2 + 4 = 0', 'x^2 - 2 = 0'])('"%s": Copy writes "x₁ = …" and "x₂ = …" and no underscore', (src) => {
    const lines = runPure('solve', src).answers.map(answerCopyLine)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^x₁ = \S/)
    expect(lines[1]).toMatch(/^x₂ = \S/)
    expect(lines.join('\n')).not.toMatch(/x_[12]/)
  })

  it('a Greek unknown is copied as θ₁ and θ₂', () => {
    const lines = runPure('solve', 'theta^2 - 5theta + 6 = 0').answers.map(answerCopyLine)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^θ₁ = \S/)
    expect(lines[1]).toMatch(/^θ₂ = \S/)
    expect(lines.join('\n')).not.toMatch(/theta/)
  })

  it('guard: a repeated root keeps its one plain label ("x = 2"), and a word label is copied as the word', () => {
    expect(runPure('solve', 'x^2 - 4x + 4 = 0').answers.map(answerCopyLine)).toEqual(['x = 2'])
    expect(answerCopyLine({ label: 'Answer', tex: 'x^{2} + 1' })).toBe('Answer x^{2} + 1')
  })

  it('"x² − 4x + 4 = 0": the one repeated root is labelled "x =", drawn as the letter x then =', () => {
    expect(runPure('solve', 'x^2 - 4x + 4 = 0').answers.map((a) => panelDraws(a.label))).toEqual([{ base: 'x', sub: '', equals: true }])
  })

  it('a first-degree equation in a Greek letter: the panel draws θ then =, Copy writes "θ = 3"', () => {
    const w = runPure('solve', '2theta + 1 = 7')
    expect(w.answers.map((a) => a.label)).toEqual(['theta ='])
    expect(w.answers.map((a) => panelDraws(a.label))).toEqual([{ base: textOf(drawnMathML('\\theta')), sub: '', equals: true }])
    expect(w.answers.map(answerCopyLine)).toEqual(['θ = 3'])
  })
})

describe('Equations mode labels its rows x₁, x₂, …', () => {
  it('x² − 5x + 6 = 0 has the rows "x₁ =" and "x₂ ="', () => {
    expect(polynomialRootRows([1, -5, 6]).map((r) => r.label)).toEqual(['x₁ =', 'x₂ ='])
  })

  it('a cubic goes on to x₃', () => {
    expect(polynomialRootRows([1, -6, 11, -6]).map((r) => r.label)).toEqual(['x₁ =', 'x₂ =', 'x₃ ='])
  })

  it('ten roots read x₁ … x₁₀: both digits of 10 are subscripts (the buttons stop at degree 6, the function does not)', () => {
    const ten = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1] // x¹⁰ − 1
    expect(polynomialRootRows(ten).map((r) => r.label)).toEqual(Array.from({ length: 10 }, (_, k) => `x${subscripted(k + 1)} =`))
  })
})

describe('the Working panel is wired to the label helpers', () => {
  it('guard: WorkingView draws the label with labelTex and copies it through calc/labels, never as `${a.label} ${a.tex}`', () => {
    const panel = readFileSync(join(__dirname, '../src/renderer/src/panels/WorkingView.tsx'), 'utf8')
    expect(panel).toMatch(/from '\.\.\/calc\/labels'/)
    expect(panel).toMatch(/\blabelTex\(/)
    expect(panel).toMatch(/\b(?:answerCopyLine|labelText)\b/)
    // The raw label followed by its answer is the template that put "x_1" on the clipboard.
    expect(panel).not.toMatch(/\$\{a\.label\}\s+\$\{a\.tex\}/)
  })
})
