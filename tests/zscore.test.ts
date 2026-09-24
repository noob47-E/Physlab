// The normal-distribution engine: Φ and its inverse against an independent reference, the printed
// table cell by cell, the four question kinds with X ~ N(μ, σ²), the parser, and the distractors.

import { describe, expect, it } from 'vitest'
import katex from 'katex'
import { pdf, phi, phiInv, upperTail } from '../src/renderer/src/math/pure/normal'
import { cell, readInverse, toPlaces } from '../src/renderer/src/math/pure/table'
import { normalRefusal, parseNormalQuery, zscoreWorking, type NormalQuery } from '../src/renderer/src/math/pure/zscore'
import { zAnswer, zscoreDistractors, Z_WHY } from '../src/renderer/src/math/pure/zscoreDistractors'
import { erfcFraction, erfSeries, phiExact, phiInvExact, upperTailExact } from './helpers/zscoreReference'
import type { Working } from '../src/renderer/src/math/pure/work'
import { generateChoices } from '../src/renderer/src/questions/distractors'
import type { DistractorRule, PQPart } from '../src/renderer/src/questions/pqjson'

const q = (text: string): NormalQuery => {
  const r = parseNormalQuery(text)
  if (!r) throw new Error(`not parsed: ${text}`)
  return r
}
const answerOf = (w: Working, i = 0): string => w.answers[i].tex

/** Every LaTeX string in a Working renders in KaTeX without an error. */
function renders(w: Working): void {
  const texes = [w.input, ...w.answers.map((a) => a.tex), ...w.moves.flatMap((m) => [m.tex, m.rule])].filter((t): t is string => !!t)
  for (const t of texes) expect(() => katex.renderToString(t, { throwOnError: true }), t).not.toThrow()
  for (const t of texes) expect(t, t).not.toMatch(/NaN|Infinity|undefined/)
}

describe('the reference Φ owes nothing to normal.ts and agrees with itself', () => {
  it('the erf series and the erfc continued fraction agree where they overlap', () => {
    for (const x of [2, 2.5, 3, 3.5, 4]) expect(Math.abs(1 - erfSeries(x) - erfcFraction(x))).toBeLessThan(1e-14)
  })
  it('matches published values of Φ', () => {
    // Φ(1) = 0.841344746068543, Φ(1.96) = 0.975002104851780, Φ(3) = 0.998650101968370 (NIST DLMF 7.2 via erf).
    expect(phiExact(1)).toBeCloseTo(0.841344746068543, 14)
    expect(phiExact(1.96)).toBeCloseTo(0.97500210485178, 14)
    expect(phiExact(3)).toBeCloseTo(0.99865010196837, 14)
  })
})

describe('Φ by Abramowitz–Stegun 26.2.17', () => {
  it('is within 7.5×10⁻⁸ of the reference from −8 to 8', () => {
    let worst = 0
    for (let i = -8000; i <= 8000; i++) worst = Math.max(worst, Math.abs(phi(i / 1000) - phiExact(i / 1000)))
    expect(worst).toBeLessThan(7.5e-8)
  })
  it('is exactly symmetric and exactly one half at 0', () => {
    expect(phi(0)).toBe(0.5)
    for (const z of [0.1, 1, 1.96, 2.5, 4]) expect(phi(-z) + phi(z)).toBe(1)
  })
  it('handles the ends and nonsense', () => {
    expect(phi(Infinity)).toBe(1)
    expect(phi(-Infinity)).toBe(0)
    expect(phi(NaN)).toBeNaN()
    expect(phi(40)).toBe(1)
    expect(phi(-40)).toBeGreaterThanOrEqual(0)
  })
  it('keeps small upper tails within the fit’s 7.5×10⁻⁸ absolute', () => {
    for (const z of [3, 4, 5]) expect(Math.abs(1 - phi(z) - upperTailExact(z))).toBeLessThan(7.5e-8)
  })
  it('past |z| = 3 a tail area keeps its own digits, not the fit’s 7.5×10⁻⁸ (once Q(5) read 2.87105×10⁻⁷)', () => {
    // Q(5) = 2.866515718…×10⁻⁷ (Python statistics.NormalDist().cdf(-5)); A&S alone gave 2.87105×10⁻⁷.
    expect(upperTail(5)).toBeCloseTo(2.8665157187e-7, 16)
    expect(phi(-5)).toBe(upperTail(5))
    for (let i = 3001; i <= 9000; i += 7) {
      const z = i / 1000
      const exact = upperTailExact(z)
      expect(Math.abs(upperTail(z) - exact) / exact, `z = ${z}`).toBeLessThan(1e-12)
      expect(Math.abs(phi(-z) - exact) / exact, `z = ${z}`).toBeLessThan(1e-12)
    }
    // The hand-over at 3 is seamless to the fit’s own tolerance, and the ends still behave.
    expect(Math.abs(upperTail(3) - upperTail(3.000001))).toBeLessThan(1e-7)
    expect(upperTail(-5)).toBe(1 - upperTail(5))
    expect(upperTail(Infinity)).toBe(0)
    // Q(−∞) = 1: past −3 it is 1 − Q(∞), and Q(∞) once came out of the Lentz step as ∞ × 0 = NaN.
    expect(upperTail(-Infinity)).toBe(1)
    expect(phi(-Infinity)).toBe(0)
    expect(upperTail(0)).toBe(0.5)
  })
})

describe('the four-place table', () => {
  it('every one of the 350 cells z = 0.00 … 3.49 is within 0.0001 of the reference', () => {
    let worst = 0
    for (let h = 0; h < 350; h++) worst = Math.max(worst, Math.abs(cell(h / 100) - phiExact(h / 100)))
    // Rounding to four places alone costs up to 0.00005; the fit adds at most 7.5×10⁻⁸.
    expect(worst).toBeLessThanOrEqual(0.0000501)
  })
  it('every cell prints exactly the four digits a table made from the exact Φ prints', () => {
    const differ: number[] = []
    for (let h = 0; h < 350; h++) if (cell(h / 100) !== toPlaces(phiExact(h / 100))) differ.push(h / 100)
    expect(differ).toEqual([])
  })
  it('spot cells from the printed table in the book', () => {
    const book: [number, number][] = [
      [0, 0.5], [0.5, 0.6915], [1, 0.8413], [1.23, 0.8907], [1.5, 0.9332], [1.64, 0.9495], [1.65, 0.9505],
      [1.96, 0.975], [2, 0.9772], [2.33, 0.9901], [2.58, 0.9951], [3, 0.9987], [3.49, 0.9998]
    ]
    for (const [z, v] of book) expect(cell(z), `z = ${z}`).toBe(v)
  })
})

describe('Φ⁻¹ by Acklam plus one Newton step', () => {
  it('is within 10⁻⁴ of the exact inverse for p = 0.0001 … 0.9999 (the fit’s 7.5×10⁻⁸ divided by the curve’s height)', () => {
    let worst = 0
    for (let i = 1; i < 10000; i++) worst = Math.max(worst, Math.abs(phiInv(i / 10000) - phiInvExact(i / 10000)))
    expect(worst).toBeLessThan(1e-4)
  })
  it('rounds to the same three places as the exact inverse for every p = 0.001 … 0.999', () => {
    const differ: number[] = []
    for (let i = 1; i < 1000; i++) {
      const p = i / 1000
      if (toPlaces(phiInv(p), 3) !== toPlaces(phiInvExact(p), 3)) differ.push(p)
    }
    expect(differ).toEqual([])
  })
  it('the textbook critical values', () => {
    expect(toPlaces(phiInv(0.975), 3)).toBe(1.96)
    expect(toPlaces(phiInv(0.95), 3)).toBe(1.645)
    expect(toPlaces(phiInv(0.9), 3)).toBe(1.282)
    expect(toPlaces(phiInv(0.995), 3)).toBe(2.576)
    expect(toPlaces(phiInv(0.99), 3)).toBe(2.326)
    expect(phiInv(0.5)).toBe(0)
    expect(phiInv(0.05)).toBeCloseTo(-phiInv(0.95), 12)
  })
  it('inverts Φ to 1e-11 and refuses areas outside (0, 1)', () => {
    for (const p of [0.001, 0.02, 0.3, 0.7, 0.98, 0.999]) expect(Math.abs(phi(phiInv(p)) - p)).toBeLessThan(1e-11)
    expect(phiInv(1.2)).toBeNaN()
    expect(phiInv(-0.1)).toBeNaN()
    expect(phiInv(0)).toBe(-Infinity)
    expect(phiInv(1)).toBe(Infinity)
  })
  it('readInverse brackets z between two cells that really bracket p (the first pass got 3.11 for 0.999)', () => {
    expect(readInverse(0.999).z).toBe(3.09)
    for (let i = 500; i < 999; i++) {
      const p = i / 1000
      const r = readInverse(p)
      expect(r.z).toBe(toPlaces(phiInvExact(p), 3))
      if (r.how === 'between') {
        expect(r.lo!.cell).toBeLessThanOrEqual(p)
        expect(r.hi!.cell).toBeGreaterThanOrEqual(p)
        expect(r.lo!.z).toBeLessThanOrEqual(r.z)
        expect(r.hi!.z).toBeGreaterThanOrEqual(r.z)
      }
    }
  })
  it('far tails: readInverse(1 − p) is the exact z to three places for p = m×10⁻ᵉ, e = 2 … 9', () => {
    // Once the Newton step leaned on the A&S fit even out here: invnorm(0.999999) read 4.754
    // (true 4.753424), invnorm(0.9999999) 5.200 (5.199338), and 9 of 40 such areas were wrong.
    // The z values are Python's statistics.NormalDist().inv_cdf, an independent algorithm (AS241).
    const python: [number, number][] = [
      [1e-2, 2.326348], [2e-2, 2.053749], [3e-2, 1.880794], [5e-2, 1.644854], [7e-2, 1.475791],
      [1e-3, 3.090232], [2e-3, 2.878162], [3e-3, 2.747781], [5e-3, 2.575829], [7e-3, 2.457263],
      [1e-4, 3.719016], [2e-4, 3.540084], [3e-4, 3.431614], [5e-4, 3.290527], [7e-4, 3.194651],
      [1e-5, 4.264891], [2e-5, 4.10748], [3e-5, 4.012811], [5e-5, 3.890592], [7e-5, 3.808168],
      [1e-6, 4.753424], [2e-6, 4.611382], [3e-6, 4.526389], [5e-6, 4.417173], [7e-6, 4.343861],
      [1e-7, 5.199338], [2e-7, 5.068958], [3e-7, 4.991217], [5e-7, 4.891638], [7e-7, 4.825005],
      [1e-8, 5.612001], [2e-8, 5.490852], [3e-8, 5.418801], [5e-8, 5.326724], [7e-8, 5.265248],
      [1e-9, 5.997807], [2e-9, 5.884193], [3e-9, 5.816758], [5e-9, 5.730729], [7e-9, 5.673389]
    ]
    for (const [p, z] of python) {
      expect(readInverse(1 - p).z, `1 − ${p}`).toBe(toPlaces(z, 3))
      expect(toPlaces(-phiInvExact(p), 3), `reference at ${p}`).toBe(toPlaces(z, 3))
      // Past |z| = 3 the tail is exact; inside it the Newton step inverts the A&S fit, whose
      // 7.5×10⁻⁸ becomes at most 7.5×10⁻⁸ / φ(z) in z — never enough to move the third place above.
      const bound = z > 3 ? 2e-9 : 7.5e-8 / pdf(z)
      expect(Math.abs(phiInv(p) + z), `Φ⁻¹(${p})`).toBeLessThan(bound + 1e-6)
    }
  })
  it('pdf is the bell curve', () => {
    expect(pdf(0)).toBeCloseTo(0.3989422804, 10)
  })
})

describe('reading the question', () => {
  it('the Z forms', () => {
    expect(q('P(Z < 1.96)')).toEqual({ kind: 'below', x: 1.96, dist: undefined })
    expect(q('P(Z ≥ 1.645)')).toEqual({ kind: 'above', x: 1.645, dist: undefined })
    expect(q('P(−1 < Z < 1)')).toEqual({ kind: 'between', a: -1, b: 1, dist: undefined })
    expect(q('P(1.96 > Z)')).toEqual({ kind: 'below', x: 1.96, dist: undefined })
    expect(q('Φ(1.2)')).toEqual({ kind: 'below', x: 1.2 })
  })
  it('the X forms with σ or σ²', () => {
    expect(q('P(X < 65), X ~ N(50, 10²)')).toMatchObject({ kind: 'below', x: 65, dist: { mean: 50, sd: 10, given: 'sd' } })
    expect(q('P(X > 65) where X ~ N(50, 100)')).toMatchObject({ kind: 'above', dist: { mean: 50, sd: 10, given: 'variance', spread: 100 } })
    expect(q('P(45 < X < 60) mean 50 sd 5')).toMatchObject({ kind: 'between', a: 45, b: 60, dist: { mean: 50, sd: 5 } })
  })
  it('reads the exponent bracketed the way latexToMath writes a MathLive field back to linear syntax', () => {
    // A student who types "X ~ N(50, 10^2)" into the Working panel's MathLive box gets it back as
    // "X~N(50,10^(2))" (latexToMath always brackets an exponent), not the bare "10^2" of a typed
    // command-bar line or a hand-written test — both must read the same distribution.
    expect(q('P(X < 65),X~N(50,10^(2))')).toMatchObject({ kind: 'below', x: 65, dist: { mean: 50, sd: 10, given: 'sd' } })
  })
  it('the inverse forms', () => {
    expect(q('invnorm(0.975)')).toMatchObject({ kind: 'inverse', p: 0.975, tail: 'below' })
    expect(q('P(Z > z) = 0.05')).toMatchObject({ kind: 'inverse', p: 0.05, tail: 'above' })
    expect(q('P(−z < Z < z) = 0.95')).toMatchObject({ kind: 'inverse', p: 0.95, tail: 'central' })
    expect(q('P(X < x) = 0.9, X ~ N(50, 10^2)')).toMatchObject({ kind: 'inverse', p: 0.9, tail: 'below', dist: { sd: 10 } })
  })
  it('is not fooled by things that are not normal-distribution questions', () => {
    expect(parseNormalQuery('p(2)')).toBeNull()
    expect(parseNormalQuery('p(x) = x^2')).toBeNull()
    expect(parseNormalQuery('P(A < 3)')).toBeNull()
    expect(parseNormalQuery('P(X < 65)')).toBeNull() // X without its N(μ, σ²)
    expect(parseNormalQuery('P(Z < 1), X ~ N(50, 10^2)')).toBeNull() // a Z with a mean
    expect(parseNormalQuery('P(X < 65), X ~ N(50, 0)')).toBeNull() // no spread
  })
  it('reads the other ways of giving the distribution, and a "= ?" on a forward question', () => {
    expect(q('P(X > 65); X ~ N(50, 100)')).toMatchObject({ kind: 'above', dist: { sd: 10, given: 'variance' } })
    expect(q('P(X < 65), sd = 10, mean = 50')).toMatchObject({ kind: 'below', dist: { mean: 50, sd: 10 } })
    expect(q('P(X < 65), μ = 50, σ = 10')).toMatchObject({ kind: 'below', dist: { mean: 50, sd: 10 } })
    expect(q('P(Z < 1.96) = ?')).toMatchObject({ kind: 'below', x: 1.96 })
  })
  it('never answers part of a line: arithmetic around P(...) is refused, not dropped', () => {
    // Each of these once gave 0.9750, 0.0250, 1.282 or a variance-of-10 answer with a passed check.
    const probes = ['1 - P(Z < 1.96)', '2*P(Z > 1.96)', 'P(Z < 1.96) - P(Z < 1)', 'P(Z<1.96)*100', 'invnorm(0.9)+3', 'P(X<60), X~N(50,10)^2']
    for (const p of probes) {
      expect(parseNormalQuery(p), p).toBeNull()
      expect(normalRefusal(p), p).toMatch(/one probability at a time|distribution last/)
    }
    expect(normalRefusal('P(X<60), X~N(50,10)^2')).toMatch(/nothing after its closing bracket/)
    // Lines that are not normal questions at all stay with the rest of the bar.
    for (const p of ['p(2)', 'p(x) = x^2', 'phi(2) + 1', '2 + 3', 'P(A < 3)']) expect(normalRefusal(p), p).toBeNull()
    expect(normalRefusal('P(Z < 1.96)')).toBeNull()
  })
  it("names the student's own probability in a refusal, never a fixed P(Z > 1.96)", () => {
    expect(normalRefusal('invnorm(0.9)+3')).toMatch(/find invnorm\(0\.9\) on its own line/)
    expect(normalRefusal('P(Z<1.96)*100')).toMatch(/find P\(Z < 1\.96\) on its own line/)
    expect(normalRefusal('1 - P(Z < 1.96)')).not.toMatch(/Z > 1\.96/)
    expect(normalRefusal('P(X<60)*2, X~N(50,10^2)')).toMatch(/find P\(X < 60\), X ~ N\(50, 10²\) on its own line/)
    expect(normalRefusal('phi^-1(0.9)+3')).toMatch(/find phi\^-1\(0\.9\) on its own line/)
  })
  it('refuses the near-miss lines in words instead of passing them on', () => {
    // A forward question that states its own answer: neither answered over nor handed on.
    const stated = normalRefusal('P(Z<1.96)=0.975')
    expect(parseNormalQuery('P(Z<1.96)=0.975')).toBeNull()
    expect(stated).toMatch(/P\(Z < 1\.96\) is worked out for you: type it without "= 0\.975"/)
    expect(stated).toMatch(/P\(Z < a\) = 0\.975\.$/)
    // The suggested inverse line is one the bar reads.
    expect(parseNormalQuery('P(Z < a) = 0.975')).toMatchObject({ kind: 'inverse', p: 0.975, tail: 'below' })
    expect(normalRefusal('P(1.96 > Z) = 0.975')).toMatch(/P\(Z < a\) = 0\.975/)
    expect(normalRefusal('P(-1 < Z < 1) = 0.68')).toMatch(/P\(−a < Z < a\) = 0\.68\.$/)
    expect(parseNormalQuery('P(−a < Z < a) = 0.68')).toMatchObject({ kind: 'inverse', tail: 'central' })
    // For X the middle is asked with x₁ and x₂ (−a < X < a is symmetric about 0, not the mean).
    expect(normalRefusal('P(45 < X < 55) = 0.38, X ~ N(50, 5^2)')).toMatch(/put a letter in its place: P\(x₁ < X < x₂\) = 0\.38, X ~ N\(50, 5²\)\.$/)
    expect(parseNormalQuery('P(x₁ < X < x₂) = 0.38, X ~ N(50, 5²)')).toMatchObject({ kind: 'inverse', tail: 'central', pair: true })
    const x = normalRefusal('P(X > 65) = 0.07, X ~ N(50, 100)')
    expect(x).toMatch(/find the x that gives an area of 0\.07, put a letter in its place: P\(X > a\) = 0\.07, X ~ N\(50, 100\)\.$/)
    expect(parseNormalQuery('P(X > a) = 0.07, X ~ N(50, 100)')).toMatchObject({ kind: 'inverse', tail: 'above' })
    // The glyph Φ is only ever the normal area, so arithmetic on it is refused; a plain phi may be
    // the student's own function and stays with the calculator.
    expect(normalRefusal('Φ(1.96)+1')).toMatch(/find Φ\(1\.96\) on its own line/)
    expect(normalRefusal('phi(1.96)+1')).toBeNull()
    // Raw LaTeX braces typed into the bar read like the ^(2) MathLive sends.
    expect(parseNormalQuery('P(X<60),X~N(50,10^{2})')).toMatchObject({ kind: 'below', x: 60, dist: { mean: 50, sd: 10, given: 'sd' } })
    expect(parseNormalQuery('P(X<60), X \\sim N(50, 10^{2})')).toMatchObject({ kind: 'below', dist: { sd: 10 } })
    expect(normalRefusal('P(X<60),X~N(50,10^{2})')).toBeNull()
  })
  it('a lone question that cannot be read says why, instead of falling to the calculator’s errors', () => {
    // These once reached the calculator: '"X" does not exist yet … X = <1, 2>', 'Unexpected
    // operator , (char 9)', and for N(50, 0) the wrong reason "Write the distribution last".
    expect(normalRefusal('P(X < 65)')).toBe(
      'X needs its distribution after the probability, as in P(X < 65), X ~ N(50, 10²) for a mean of 50 and a standard deviation of 10. For the standard curve itself, use Z.'
    )
    expect(normalRefusal('P(X > x) = 0.1')).toMatch(/^X needs its distribution after the probability, as in P\(X > x\) = 0\.1, X ~ N\(50, 10²\)/)
    // The line it suggests is one the bar reads.
    expect(parseNormalQuery('P(X < 65), X ~ N(50, 10²)')).toMatchObject({ kind: 'below', x: 65 })
    expect(normalRefusal('P(Z < 1), X ~ N(50, 10^2)')).toBe(
      'Z is already standard, with mean 0 and standard deviation 1, so it takes no distribution. For a value from X ~ N(50, 10²) use X, as in P(X < 1), X ~ N(50, 10²), or leave the distribution off.'
    )
    expect(normalRefusal('P(Z > z) = 0.05, X ~ N(50, 10^2)')).toMatch(/use X, as in P\(X > x\) = 0\.05, X ~ N\(50, 10²\),/)
    expect(normalRefusal('P(-z < Z < z) = 0.9, X ~ N(50, 10^2)')).toMatch(/use X, as in P\(x₁ < X < x₂\) = 0\.9, X ~ N\(50, 10²\),/)
    expect(normalRefusal('P(-x < X < x) = 0.9')).toMatch(/^X needs its distribution/)
    for (const line of ['P(X<60), X~N(50,0)', 'P(X<60), X~N(50,-4)', 'P(X < 60), mean 50, sd 0']) {
      expect(parseNormalQuery(line), line).toBeNull()
      expect(normalRefusal(line), line).toMatch(/^The standard deviation \(or the variance\) in N\(μ, σ²\) must be greater than 0/)
    }
  })
})

describe('the worked answers', () => {
  it('P(Z < 1.96) = 0.9750, Φ(1) = 0.8413', () => {
    const w = zscoreWorking(q('P(Z < 1.96)'))
    expect(answerOf(w)).toBe('0.9750')
    expect(w.checked).toBe('ok')
    expect(w.moves.some((m) => /row 1\.9, column 0\.06/.test(m.head))).toBe(true)
    expect(answerOf(zscoreWorking(q('P(Z < 1)')))).toBe('0.8413')
    renders(w)
  })
  it('P(−1 < Z < 1) = 0.6826 by the table (0.6827 by the formula) — both said', () => {
    const w = zscoreWorking(q('P(-1 < Z < 1)'))
    // Table route: 0.8413 − 0.1587 = 0.6826; the formula gives 0.682689, which rounds to 0.6827.
    // The check line says they agree within the table's rounding, which is the honest statement.
    expect(answerOf(w)).toBe('0.6826')
    expect(w.moves.some((m) => m.tex === 'P(-1.00 < Z < 1.00) = \\Phi(1.00) - \\Phi(-1.00) = 0.8413 - 0.1587 = 0.6826')).toBe(true)
    expect(w.check).toMatch(/0\.682689/)
    // S-Q.md lists 0.6827 (the formula, and an fx-991EX): the check line names it beside the table's 0.6826.
    expect(w.check).toMatch(/0\.6827, the value a calculator shows/)
    expect(zscoreWorking(q('P(Z < 1.96)')).check).not.toMatch(/calculator shows/)
    expect(w.checked).toBe('ok')
    renders(w)
  })
  it('P(Z > 1.645) = 1 − 0.9500 = 0.0500, the third place read between two columns', () => {
    const w = zscoreWorking(q('P(Z > 1.645)'))
    expect(w.moves.some((m) => m.tex === '\\Phi(1.645) \\approx 0.9495 + 0.5 \\times (0.9505 - 0.9495) = 0.9500')).toBe(true)
    expect(w.moves.some((m) => /between columns 0\.04 and 0\.05 of row 1\.6/.test(m.head))).toBe(true)
    expect(answerOf(w)).toBe('0.0500')
    expect(w.checked).toBe('ok')
    renders(w)
  })
  it('a z with more than three places is rounded to three, and said so', () => {
    const w = zscoreWorking(q('P(X < 60), X ~ N(50, 3^2)'))
    expect(w.moves[0].tex).toBe('z = \\dfrac{60 - 50}{3} \\approx 3.333')
    expect(w.moves[0].note).toMatch(/three places/)
    expect(w.checked).toBe('ok')
  })
  it('X ~ N(50, 10²): P(X < 65) → z = 1.5 → 0.9332', () => {
    const w = zscoreWorking(q('P(X < 65), X ~ N(50, 10²)'))
    expect(w.moves[0].tex).toBe('z = \\dfrac{65 - 50}{10} = 1.5')
    expect(w.moves[0].rule).toBe('z = \\dfrac{x - \\mu}{\\sigma}')
    expect(answerOf(w)).toBe('0.9332')
    expect(w.answers[0].label).toBe('P(X < 65)')
    renders(w)
  })
  it('P(X > 65) = 1 − 0.9332 = 0.0668, computed from the shown table value', () => {
    const w = zscoreWorking(q('P(X > 65), X ~ N(50, 10²)'))
    expect(w.moves.some((m) => m.tex === 'P(Z > 1.50) = 1 - \\Phi(1.50) = 1 - 0.9332 = 0.0668')).toBe(true)
    expect(answerOf(w)).toBe('0.0668')
    renders(w)
  })
  it('a variance is square-rooted first: N(50, 100)', () => {
    const w = zscoreWorking(q('P(X > 65), X ~ N(50, 100)'))
    expect(w.moves[0].tex).toBe('\\sigma = \\sqrt{100} = 10')
    expect(w.moves[0].subgoal).toBe('Find the standard deviation')
    expect(answerOf(w)).toBe('0.0668')
  })
  it('a negative z uses the symmetry, and every number in that line is the one shown', () => {
    const w = zscoreWorking(q('P(X < 40), X ~ N(50, 10²)'))
    expect(w.moves.some((m) => m.tex === '\\Phi(-1.00) = 1 - \\Phi(1.00) = 1 - 0.8413 = 0.1587')).toBe(true)
    expect(w.moves[0].tex).toBe('z = \\dfrac{40 - 50}{10} = -1')
    expect(answerOf(w)).toBe('0.1587')
    const above = zscoreWorking(q('P(Z > -1)'))
    expect(answerOf(above)).toBe('0.8413')
    expect(above.moves.some((m) => /By symmetry/.test(m.head))).toBe(true)
  })
  it('a negative mean is bracketed in the substitution', () => {
    const w = zscoreWorking(q('P(X < 2), X ~ N(-3, 4^2)'))
    expect(w.moves[0].tex).toBe('z = \\dfrac{2 - \\left(-3\\right)}{4} = 1.25')
    renders(w)
  })
  it('past the end of the table the formula is used and the sentence says so', () => {
    const w = zscoreWorking(q('P(Z < 3.8)'))
    expect(answerOf(w)).toBe('0.9999')
    expect(w.moves.some((m) => /past the end of the table/.test(m.head))).toBe(true)
  })
  it('the check line for P(Z > 5) gives the true tail 2.866516×10^-7, not the fit’s 2.87105×10^-7', () => {
    const w = zscoreWorking(q('P(Z > 5)'))
    expect(w.check).toMatch(/is 2\.866516×10\^-7/)
    expect(w.check).not.toMatch(/2\.87105/)
    expect(w.checked).toBe('ok')
    // Q(5) − Q(6) = 2.856650×10⁻⁷ (Python statistics.NormalDist).
    expect(zscoreWorking(q('P(5 < Z < 6)')).check).toMatch(/is 2\.85665×10\^-7/)
  })
  it('an overflowing bound still gets a check that agrees: P(Z > −1e999) is 1.0000, not "undefined"', () => {
    const w = zscoreWorking(q('P(Z>-1e999)'))
    expect(answerOf(w)).toBe('1.0000')
    expect(w.check).not.toMatch(/undefined|NaN|does not agree/)
    expect(w.checked).toBe('ok')
  })
  it('refuses an empty interval and an impossible area with a sentence', () => {
    expect(zscoreWorking(q('P(2 < Z < 1)')).error).toMatch(/2 is not below 1/)
    expect(zscoreWorking({ kind: 'inverse', p: 1.2, tail: 'below' }).error).toMatch(/between 0 and 1/)
  })
  it('every table cell used in a working agrees with the formula check (all z = −3.49 … 3.49)', () => {
    for (let h = -349; h <= 349; h += 7) {
      const w = zscoreWorking({ kind: 'below', x: h / 100 })
      expect(w.checked, `z = ${h / 100}`).toBe('ok')
      expect(Math.abs(Number(answerOf(w)) - phiExact(h / 100))).toBeLessThanOrEqual(0.0000501)
    }
  })
})

describe('the inverse, worked', () => {
  it('0.975 → 1.960, 0.95 → 1.645, 0.90 → 1.282', () => {
    expect(answerOf(zscoreWorking(q('invnorm(0.975)')))).toBe('1.960')
    expect(answerOf(zscoreWorking(q('invnorm(0.95)')))).toBe('1.645')
    expect(answerOf(zscoreWorking(q('invnorm(0.90)')))).toBe('1.282')
  })
  it('an area very close to 1 or 0 is shown to its last digit: never Φ(z) = 1, never LaTeX in the title', () => {
    // At six places 0.9999999 printed as 1 ("Φ(z) = 1", which no finite z satisfies), and the
    // title stripped backslashes from "1 \times 10^{-7}" into "1times 10^{-7}".
    const hi = zscoreWorking(q('invnorm(0.9999999)'))
    expect(hi.title).toBe('Find z when P(Z < z) = 0.9999999')
    expect(hi.moves.some((m) => m.tex === '\\Phi(z) = 0.9999999')).toBe(true)
    const lo = zscoreWorking(q('invnorm(0.0000001)'))
    expect(lo.title).toBe('Find z when P(Z < z) = 1×10^-7')
    expect(lo.moves.some((m) => m.tex === '\\Phi(-z) = 1 - 1\\times 10^{-7} = 0.9999999')).toBe(true)
    for (const w of [hi, lo]) {
      expect(w.title).not.toMatch(/\\|times|\{/)
      for (const m of w.moves) expect(m.tex ?? '', m.tex).not.toMatch(/\\Phi\((?:-)?z\) = 1$|= 0$/)
      expect(w.check).not.toMatch(/= 1\.0000,/)
      expect(w.checked).toBe('ok')
      renders(w)
    }
    // Φ⁻¹(1 − 10⁻⁷) = 5.199338: once 5.200, when the A–S fit's 7.5×10⁻⁸ error reached this far out.
    expect(answerOf(hi)).toBe('5.199')
    expect(answerOf(lo)).toBe('-5.199')
    // The central title writes the proper minus, as every other plain string does.
    expect(zscoreWorking(q('P(−z < Z < z) = 0.95')).title).toBe('Find z when P(−z < Z < z) = 0.95')
  })
  it('0.975 is found in a cell; 0.95 lies between 0.9495 and 0.9505', () => {
    const a = zscoreWorking(q('invnorm(0.975)'))
    expect(a.moves.some((m) => /Found 0\.9750 in the table at row 1\.9, column 0\.06/.test(m.head))).toBe(true)
    const b = zscoreWorking(q('invnorm(0.95)'))
    expect(b.moves.some((m) => /between 0\.9495 \(z = 1\.64\) and 0\.9505 \(z = 1\.65\)/.test(m.head))).toBe(true)
    renders(a)
    renders(b)
  })
  it('an upper tail of 0.05 → z = 1.645; a lower area of 0.05 → z = −1.645', () => {
    const up = zscoreWorking(q('P(Z > z) = 0.05'))
    expect(answerOf(up)).toBe('1.645')
    expect(up.moves[0].tex).toBe('\\Phi(z) = 1 - 0.05 = 0.95')
    const low = zscoreWorking(q('invnorm(0.05)'))
    expect(answerOf(low)).toBe('-1.645')
    expect(low.moves.some((m) => /Put the minus sign back/.test(m.head))).toBe(true)
    renders(low)
  })
  it('the middle 95 % → z = ±1.960', () => {
    const w = zscoreWorking(q('P(-z < Z < z) = 0.95'))
    expect(answerOf(w)).toBe('\\pm 1.960')
    expect(w.moves[0].tex).toBe('\\Phi(z) = 0.95 + \\dfrac{1 - 0.95}{2} = 0.975')
    renders(w)
  })
  it('X ~ N(50, 10²): the top 10 % starts at x = 62.82', () => {
    const w = zscoreWorking(q('P(X > x) = 0.1, X ~ N(50, 10²)'))
    expect(answerOf(w)).toBe('62.82')
    expect(w.moves.some((m) => m.tex === 'x = 50 + 1.282 \\times 10 = 62.82')).toBe(true)
    renders(w)
  })
  it('X ~ N(50, 10²): the middle 95 %, asked as P(x₁ < X < x₂) = 0.95, runs from 30.4 to 69.6', () => {
    for (const line of ['P(x_1 < X < x_2) = 0.95, X ~ N(50, 10^2)', 'P(x₁ < X < x₂) = 0.95, X ~ N(50, 10²)', 'P(x_(1)<X<x_(2))=0.95,X~N(50,10^(2))']) {
      const w = zscoreWorking(q(line))
      expect(w.answers.map((a) => [a.label, a.tex]), line).toEqual([['x₁', '30.4'], ['x₂', '69.6']])
      // The question is restated truthfully: the line alone fits any interval with that area.
      expect(w.title).toBe('Find x₁ and x₂ when P(x₁ < X < x₂) = 0.95, symmetric about the mean 50, for X ~ N(50, 10²)')
      expect(w.input).toBe('P(x_1 < X < x_2) = 0.95\\ \\text{symmetric about the mean } 50,\\quad X \\sim N\\left(50,\\ 10^2\\right)')
      renders(w)
    }
  })
  it('no step heading shows TeX to the student: x₁, never x_1 (the heading once read "Turned z back into x_1")', () => {
    const lines = [
      'P(x_1 < X < x_2) = 0.95, X ~ N(50, 10^2)', 'P(z_1 < Z < z_2) = 0.9', 'P(-z < Z < z) = 0.95', 'P(X > x) = 0.1, X ~ N(50, 100)',
      'P(45 < X < 60), X ~ N(50, 5^2)', 'P(-1 < Z < 1)', 'invnorm(0.05)', 'P(X < 65), X ~ N(50, 10²)'
    ]
    for (const line of lines)
      for (const m of zscoreWorking(q(line)).moves) expect(m.head, `${line}: ${m.head}`).not.toMatch(/[_\\{}^]/)
    const w = zscoreWorking(q('P(x_1 < X < x_2) = 0.95, X ~ N(50, 10^2)'))
    expect(w.moves.map((m) => m.head)).toEqual(expect.arrayContaining(['Turned z back into x₁: the mean plus z standard deviations.']))
  })
  it('P(−x < X < x) = 0.95 is symmetric about 0, so it is refused for a mean of 50 (once answered 30.4 and 69.6, whose P is 0.975)', () => {
    const line = 'P(-x < X < x) = 0.95, X ~ N(50, 10^2)'
    expect(parseNormalQuery(line)).toBeNull()
    const why = normalRefusal(line)
    expect(why).toMatch(/middle 0\.95 of X ~ N\(50, 10²\) sits either side of the mean 50, not either side of 0/)
    expect(why).toMatch(/Ask for P\(x₁ < X < x₂\) = 0\.95, X ~ N\(50, 10²\) instead\. Type x₁ as x_1 and x₂ as x_2\.$/)
    // The line the refusal offers is one the bar reads.
    expect(q('P(x₁ < X < x₂) = 0.95, X ~ N(50, 10²)')).toMatchObject({ kind: 'inverse', tail: 'central', pair: true })
    // With a mean of 0 the two questions are the same one, and it is answered as ±x.
    const w = zscoreWorking(q('P(-x < X < x) = 0.95, X ~ N(0, 10^2)'))
    expect(w.answers.map((a) => [a.label, a.tex])).toEqual([['x', '\\pm 19.6']])
    expect(w.title).toBe('Find x when P(−x < X < x) = 0.95 for X ~ N(0, 10²)')
    renders(w)
  })
  it('a middle area for Z needs one letter either side with the minus: two letters or no width are refused in words', () => {
    // Both were once read as ±z for the middle 0.9, silently changing the question.
    for (const line of ['P(a < Z < b) = 0.9', 'P(z < Z < z) = 0.9', 'P(-a < Z < b) = 0.9', 'P(z_1 < Z < z_1) = 0.9']) {
      expect(parseNormalQuery(line), line).toBeNull()
      expect(normalRefusal(line), line).toMatch(/For the middle 0\.9, (?:symmetric about 0, )?write P\(−z < Z < z\) = 0\.9\.$/)
    }
    expect(normalRefusal('P(a < Z < b) = 0.9')).toMatch(/does not fix them/)
    expect(normalRefusal('P(z < Z < z) = 0.9')).toMatch(/P\(z < Z < z\) runs from a value to itself, so its area is 0/)
    expect(normalRefusal('P(a < X < b) = 0.9, X ~ N(50, 10^2)')).toMatch(/symmetric about the mean, write P\(x₁ < X < x₂\) = 0\.9, X ~ N\(50, 10²\)\. Type x₁ as x_1/)
    // The well-formed ones still read, including a pair for Z.
    expect(q('P(−a < Z < a) = 0.9')).toMatchObject({ kind: 'inverse', tail: 'central', p: 0.9 })
    const pair = zscoreWorking(q('P(z_1 < Z < z_2) = 0.9'))
    expect(pair.answers.map((a) => [a.label, a.tex])).toEqual([['z₁', '-1.645'], ['z₂', '1.645']])
    renders(pair)
  })
  it('every inverse check passes for p = 0.001 … 0.999', () => {
    for (let i = 1; i < 1000; i += 3) expect(zscoreWorking({ kind: 'inverse', p: i / 1000, tail: 'below' }).checked, `p = ${i / 1000}`).toBe('ok')
  })
})

describe('distractors: each a named misconception', () => {
  const cases = [
    'P(Z < 1.96)', 'P(Z > 1.645)', 'P(-1 < Z < 1)', 'P(-0.5 < Z < 2)', 'P(X < 65), X ~ N(50, 10²)',
    'P(X > 65), X ~ N(50, 100)', 'P(X < 40), X ~ N(50, 10²)', 'P(45 < X < 60), X ~ N(50, 5^2)',
    'invnorm(0.975)', 'P(Z > z) = 0.05', 'P(-z < Z < z) = 0.9', 'P(X > x) = 0.1, X ~ N(50, 10²)'
  ]
  for (const text of cases) {
    it(text, () => {
      const qq = q(text)
      const ds = zscoreDistractors(qq)
      const ans = zAnswer(qq)
      expect(ds.length).toBeGreaterThanOrEqual(2)
      const values = [ans, ...ds.map((d) => d.value)]
      expect(new Set(values).size).toBe(values.length)
      for (const d of ds) {
        expect(d.why).toBe(Z_WHY[d.rule])
        expect(d.why.length).toBeGreaterThan(20)
        expect(Number.isFinite(d.value)).toBe(true)
        if (qq.kind !== 'inverse') expect(d.value).toBeGreaterThanOrEqual(0)
        if (qq.kind !== 'inverse') expect(d.value).toBeLessThanOrEqual(1)
      }
    })
  }
  it('the named values are the ones each slip gives', () => {
    const byRule = (text: string) => Object.fromEntries(zscoreDistractors(q(text), 9).map((d) => [d.rule, d.value]))
    expect(byRule('P(X > 65), X ~ N(50, 10²)')).toMatchObject({ 'z-one-minus': 0.9332, 'z-variance-for-sd': toPlaces(1 - cell(0.15)), 'z-no-standardise': 0 })
    expect(byRule('P(-1 < Z < 1)')).toMatchObject({ 'z-sign': 0, 'z-one-minus': 0.3174 })
    expect(byRule('P(-z < Z < z) = 0.9')).toMatchObject({ 'z-tail-for-central': 1.282, 'z-sign': -1.645 })
    expect(byRule('P(Z > z) = 0.05')).toMatchObject({ 'z-one-minus': -1.645 })
  })
  it('the answer the distractors keep apart from is the Working\'s answer', () => {
    for (const text of ['P(X > 65), X ~ N(50, 10²)', 'P(-1 < Z < 1)', 'invnorm(0.95)']) {
      expect(String(zAnswer(q(text)))).toBe(String(Number(answerOf(zscoreWorking(q(text))))))
    }
  })
})

describe('the four z-* rules in an authored choice part (questions/distractors.ts)', () => {
  type ChoicePart = Extract<PQPart, { type: 'choice' }>
  const PHI_X = '0.5*(1+erf((x-mean)/(sd*sqrt(2))))'
  const PHI_Z = '0.5*(1+erf(z/sqrt(2)))'
  const PRECISION = { decimals: 4, precisionMode: 'dp' as const }
  const part = (correct: string, rules: DistractorRule[]): ChoicePart => ({
    type: 'choice', prompt: 'Pick P(X < 65).', choices: [], shuffle: false, marks: 1,
    distractors: { correct, unit: 'none', rules }
  })
  /** The one wrong option a single rule offers, as a number, or null when the rule is skipped. */
  const wrongOf = (correct: string, rule: DistractorRule, values: Record<string, number>): number | null => {
    const choices = generateChoices(part(correct, [rule]), values, PRECISION)
    expect(choices[0].correct).toBe(true)
    const wrong = choices.filter((c) => !c.correct)
    if (wrong.length === 0) return null
    expect(wrong).toHaveLength(1)
    return Number(wrong[0].text.replace('−', '-'))
  }
  const X = { x: 65, mean: 50, sd: 10 }

  it('gives the right answer first: Φ(1.5) = 0.9332', () => {
    expect(generateChoices(part(PHI_X, ['z-one-minus']), X, PRECISION)[0].text).toBe('0.9332')
  })

  it('z-one-minus offers the other side, 1 − 0.9332 = 0.0668', () => {
    expect(wrongOf(PHI_X, 'z-one-minus', X)).toBe(0.0668)
  })

  it('z-sign mirrors x about the mean (x = 35) and gives Φ(−1.5) = 0.0668, or flips z itself', () => {
    expect(wrongOf(PHI_X, 'z-sign', X)).toBe(0.0668)
    expect(wrongOf(PHI_Z, 'z-sign', { z: -1.2 })).toBe(0.8849)
  })

  it('z-variance-for-sd divides by σ² = 100: Φ(0.15) ≈ 0.5596', () => {
    expect(wrongOf(PHI_X, 'z-variance-for-sd', X)).toBe(toPlaces(phi(0.15)))
    expect(wrongOf(PHI_X, 'z-variance-for-sd', X)).toBe(0.5596)
  })

  it('z-no-standardise looks 65 up as if it were z: Φ(65) ≈ 1', () => {
    expect(wrongOf(PHI_X, 'z-no-standardise', X)).toBeCloseTo(1, 4)
  })

  it('skips a rule, saying nothing, when its variables are not named z, x, mean and sd', () => {
    // A part authored with mu/sigma instead of mean/sd: three rules have nothing to change.
    const other = '0.5*(1+erf((x-mu)/(sigma*sqrt(2))))'
    const values = { x: 65, mu: 50, sigma: 10 }
    expect(wrongOf(other, 'z-sign', values)).toBeNull()
    expect(wrongOf(other, 'z-no-standardise', values)).toBeNull()
    expect(wrongOf(other, 'z-variance-for-sd', values)).toBeNull()
    // Only mean missing: z-sign cannot mirror x and z-no-standardise cannot zero the mean.
    expect(wrongOf(PHI_X.replace('mean', '50'), 'z-sign', { x: 65, sd: 10 })).toBeNull()
    expect(wrongOf(PHI_X.replace('mean', '50'), 'z-no-standardise', { x: 65, sd: 10 })).toBeNull()
    // z-one-minus needs only an answer between 0 and 1: a z-value answer gets nothing from it.
    expect(wrongOf('z', 'z-one-minus', { z: 1.645 })).toBeNull()
  })

  it('all four together give distinct options, the duplicate 0.0668 offered once', () => {
    const choices = generateChoices(part(PHI_X, ['z-one-minus', 'z-sign', 'z-variance-for-sd', 'z-no-standardise']), X, PRECISION)
    const texts = choices.map((c) => c.text)
    expect(new Set(texts).size).toBe(texts.length)
    expect(texts).toEqual(['0.9332', '0.0668', '0.5596', '1'])
  })
})
