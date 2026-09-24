// Normal-distribution questions, worked the way a student works them with the table in the book.
//
//   P(Z < z), P(Z > z), P(a < Z < b) — any signs — and the inverse (the z, or x, with a given
//   area below, above or in the middle), for Z itself or for X ~ N(μ, σ²) standardised first.
//
// The route is the table route: standardise, round z to the table's two places, read the cell
// (using the curve's symmetry when z is negative, because the table lists only z ≥ 0), then
// combine the four-place readings. Every later line is computed from the four-place values the
// earlier lines *show*, so each line is true as written: P(X > 65) = 1 − 0.9332 = 0.0668, never
// 1 − 0.9332 = 0.06681 from an unrounded Φ. The formula route (normal.ts) is used once, in the
// check line, to confirm the table route landed within the table's own rounding.

import { phi, pdf, upperTail } from './normal'
import { cell, padded, paddedTex, readInverse, rowCol, tablePhi, toPlaces, Z_MAX, PLACES } from './table'
import { failed, Steps, type Working } from './work'
import { fmtPrecise, texPrecise } from '../format'

export interface NormalDist {
  mean: number
  /** The standard deviation σ (always positive). */
  sd: number
  /** How the spread was given: N(50, 10²) gives σ, N(50, 100) gives the variance σ². */
  given: 'sd' | 'variance'
  /** The number as written, for the "σ = √100 = 10" line. */
  spread: number
}

export type Tail = 'below' | 'above' | 'central'

export type NormalQuery =
  | { kind: 'below'; x: number; dist?: NormalDist }
  | { kind: 'above'; x: number; dist?: NormalDist }
  | { kind: 'between'; a: number; b: number; dist?: NormalDist }
  | {
      kind: 'inverse'
      p: number
      tail: Tail
      dist?: NormalDist
      /**
       * A middle area asked as P(x₁ < X < x₂) = p: two values symmetric about the mean, answered
       * as x₁ and x₂. Without it a middle area is P(−z < Z < z) = p (or −x < X < x when μ = 0),
       * answered as ±z.
       */
      pair?: true
    }

// ---------------------------------------------------------------------------------------------
// Reading the student's words
// ---------------------------------------------------------------------------------------------

const NUM = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`

// "x_1" as typed, "x_(1)" or "x1" as a MathLive field's x_{1} arrives through latexToMath and tidy.
const SUB1 = String.raw`_?\(?1\)?`
const SUB2 = String.raw`_?\(?2\)?`
// Any middle-area inverse, well formed or not, for normalRefusal to say what is wrong with it:
// the minus, the two letters and their subscripts, the variable and the area.
const CENTRAL_ANY = new RegExp(String.raw`^P\((-)?([a-z])(_?\(?[0-9]\)?)?<([ZX])<\+?([a-z])(_?\(?[0-9]\)?)?\)=(${NUM})$`, 'i')

/**
 * The student's text with typography folded to ASCII: the proper minus, ≤ and ≥ (a continuous
 * distribution gives the same area either way), σ², Φ and spaces.
 */
function tidy(text: string): string {
  return text
    .replace(/[−–]/g, '-')
    .replace(/≤|<=/g, '<')
    .replace(/≥|>=/g, '>')
    .replace(/²/g, '^2')
    .replace(/Φ/g, 'phi')
    // x₁ and x₂ as the refusal and the working print them, typed back.
    .replace(/₁/g, '_1')
    .replace(/₂/g, '_2')
    // Raw LaTeX typed into the bar: "10^{2}" is 10^(2), "X \sim N(...)" is X sim N(...).
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
    .replace(/\s+/g, '')
}

// The distribution clause, which must be the whole of the end of the line: "X ~ N(50, 10²)" (or
// "X sim N(...)", or plain "N(...)"), or "mean 50, sd 10" / "μ = 50, σ = 10" in either order,
// after an optional "," / ";" / "where". The exponent on σ² arrives as "^2" when typed straight
// into the command bar, but as "^(2)" once a MathLive field's own LaTeX (N(50, 10^{2})) has been
// through latexToMath, which always brackets an exponent. Both read the same distribution.
const SEP = String.raw`(?:,|;|where)?`
const N_CLAUSE = new RegExp(String.raw`^(.+?)${SEP}(?:X(?:~|\\?sim))?N\((${NUM}),(${NUM})(\^\(?2\)?)?\)$`, 'i')
const MEAN = String.raw`(?:mean|μ|mu)=?(${NUM})`
const SD = String.raw`(?:sd|σ|sigma|standarddeviation)=?(${NUM})`
const WORDS_MEAN_FIRST = new RegExp(String.raw`^(.+?)${SEP}${MEAN}[,;]?(?:and)?${SD}$`, 'i')
const WORDS_SD_FIRST = new RegExp(String.raw`^(.+?)${SEP}${SD}[,;]?(?:and)?${MEAN}$`, 'i')

/**
 * The line split into the question and its distribution: `rest` is everything before the
 * distribution clause (the whole line when there is none). 'bad' when the clause gives no spread.
 */
function splitDist(t: string): { rest: string; dist?: NormalDist } | 'bad' {
  let m = N_CLAUSE.exec(t)
  if (m) {
    const mean = Number(m[2])
    const spread = Number(m[3])
    if (!(spread > 0)) return 'bad'
    return { rest: m[1], dist: m[4] ? { mean, sd: spread, given: 'sd', spread } : { mean, sd: Math.sqrt(spread), given: 'variance', spread } }
  }
  let mean: number | undefined
  let sd: number | undefined
  if ((m = WORDS_MEAN_FIRST.exec(t))) [mean, sd] = [Number(m[2]), Number(m[3])]
  else if ((m = WORDS_SD_FIRST.exec(t))) [sd, mean] = [Number(m[2]), Number(m[3])]
  if (m && mean !== undefined && sd !== undefined) {
    if (!(sd > 0)) return 'bad'
    return { rest: m[1], dist: { mean, sd, given: 'sd', spread: sd } }
  }
  return { rest: t }
}

/**
 * The question in the student's words, or null when the text is not one normal-distribution
 * question and nothing else. The question must be the whole line (bar its distribution clause):
 * `1 - P(Z < 1.96)` or `2*P(Z > 1.96)` is arithmetic on a probability, which this does not do,
 * so it is not read as P(Z < 1.96) with the rest dropped. `p(2)` with a function p of the
 * student's own is not ours either: it has no Z or X and no comparison inside the brackets.
 */
export function parseNormalQuery(text: string): NormalQuery | null {
  const split = splitDist(tidy(text))
  if (split === 'bad') return null
  const { rest: t, dist } = split
  const v = String.raw`([ZX])`
  // A textbook sometimes writes the forward question as "P(Z < 1.96) = ?".
  const ask = String.raw`(?:=\?)?`
  let m: RegExpExecArray | null

  // Inverse forms first: they contain a P(...) too.
  if ((m = new RegExp(String.raw`^(?:invnorm|invnormal|phi\^-1|phiinv)\((${NUM})\)$`, 'i').exec(t))) return inv(Number(m[1]), 'below', dist)
  if ((m = new RegExp(String.raw`^P\(${v}([<>])([a-z])\)=(${NUM})$`, 'i').exec(t))) {
    if (!varFits(m[1], dist)) return null
    return inv(Number(m[4]), m[2] === '<' ? 'below' : 'above', dist)
  }
  // A middle area: the same letter either side with the minus on the lower one, P(−z < Z < z) —
  // anything else ("P(a < Z < b)", two letters; "P(z < Z < z)", no width) is a different question,
  // refused in words by normalRefusal. −x < X < x is symmetric about 0, so it is the middle area
  // only when μ = 0; otherwise the middle is asked as P(x₁ < X < x₂) = p.
  if ((m = new RegExp(String.raw`^P\(-([a-z])<${v}<\+?\1\)=(${NUM})$`, 'i').exec(t))) {
    if (!varFits(m[2], dist) || (dist && dist.mean !== 0)) return null
    return inv(Number(m[3]), 'central', dist)
  }
  if ((m = new RegExp(String.raw`^P\(([a-z])${SUB1}<${v}<\1${SUB2}\)=(${NUM})$`, 'i').exec(t))) {
    if (!varFits(m[2], dist)) return null
    return { kind: 'inverse', p: Number(m[3]), tail: 'central', dist, pair: true }
  }

  if ((m = new RegExp(String.raw`^P\((${NUM})<${v}<(${NUM})\)${ask}$`, 'i').exec(t))) {
    if (!varFits(m[2], dist)) return null
    return { kind: 'between', a: Number(m[1]), b: Number(m[3]), dist }
  }
  if ((m = new RegExp(String.raw`^P\(${v}([<>])(${NUM})\)${ask}$`, 'i').exec(t))) {
    if (!varFits(m[1], dist)) return null
    return { kind: m[2] === '<' ? 'below' : 'above', x: Number(m[3]), dist }
  }
  // "P(1.96 > Z)" reads the other way round.
  if ((m = new RegExp(String.raw`^P\((${NUM})([<>])${v}\)${ask}$`, 'i').exec(t))) {
    if (!varFits(m[3], dist)) return null
    return { kind: m[2] === '<' ? 'above' : 'below', x: Number(m[1]), dist }
  }
  if (!dist && (m = new RegExp(String.raw`^phi\((${NUM})\)$`, 'i').exec(t))) return { kind: 'below', x: Number(m[1]) }
  return null
}

/**
 * Why a line that holds a normal-distribution question was still not read as one, in words — or
 * null when the line has no such question in it (so the command bar can hand it to the
 * calculator, and a student's own function p stays theirs). A line that does arithmetic on a
 * probability, or holds two of them, is refused rather than answered with part of it dropped.
 */
export function normalRefusal(text: string): string | null {
  if (parseNormalQuery(text)) return null
  const t = tidy(text)
  const split = splitDist(t)
  const rest = split === 'bad' ? t : split.rest
  const dist = split === 'bad' ? undefined : split.dist
  // "phi(2)" may be a student's own function phi; the glyph Φ(2) is only ever the normal area.
  const glyph = /Φ/.test(text)
  const calls = [...rest.matchAll(/(?:invnormal|invnorm|phiinv|phi\^-1|(?<![a-z])phi|(?<![a-z])P)\(([^()]*)\)/gi)].filter(
    (c) =>
      /^(?:inv|phiinv|phi\^)/i.test(c[0]) ||
      (/^phi\(/i.test(c[0]) ? glyph : /[<>]/.test(c[1]) && /(?:^|[^a-z])[ZX](?:[^a-z]|$)/i.test(c[1]))
  )
  if (calls.length === 0) return null
  // N(50, 0): with no spread there is no curve. (This was once told "Write the distribution last".)
  if (split === 'bad') return 'The standard deviation (or the variance) in N(μ, σ²) must be greater than 0: with no spread there is no bell curve to find an area under.'
  const first = calls[0][0]
  const stated = new RegExp(String.raw`^=(${NUM})$`).exec(rest.replace(first, ''))
  const left = rest.replace(first, '').replace(new RegExp(String.raw`^=(?:${NUM}|\?)`), '')
  const bare = calls.length === 1 && stated ? parseNormalQuery(t.replace(first + stated[0], first)) : null
  if (bare && stated && bare.kind !== 'inverse') {
    // "P(Z < 1.96) = 0.975": a forward question that already states an answer. Answering it would
    // pass over the stated value, right or wrong, so the student is shown the two lines that exist.
    const v = bare.dist ? 'X' : 'Z'
    // A middle area for X is asked with x₁ and x₂: −a < X < a is symmetric about 0, not the mean.
    const ask = bare.kind === 'between' ? (bare.dist ? 'P(x₁ < X < x₂)' : 'P(−a < Z < a)') : `P(${v} ${bare.kind === 'below' ? '<' : '>'} a)`
    const tail = bare.dist ? `, ${distText(bare.dist)}` : ''
    return `${shownCall(first, dist)} is worked out for you: type it without "= ${stated[1]}". To find the ${bare.dist ? 'x' : 'z'} that gives an area of ${stated[1]}, put a letter in its place: ${ask} = ${stated[1]}${tail}.`
  }
  if (calls.length === 1 && left === '') {
    // One question and nothing else, still not read: say what is wrong with it, rather than let the
    // calculator answer '"X" does not exist yet' or 'Unexpected operator ,'.
    const central = CENTRAL_ANY.exec(rest)
    const body = calls[0][1]
    const letter = (/(?<![a-z])[ZX](?![a-z])/.exec(body) ?? /(?<![a-z])[zx](?![a-z])/i.exec(body))?.[0].toUpperCase()
    const typed = `${shownCall(first, undefined)}${stated ? ` = ${stated[1]}` : ''}`
    if (letter === 'X' && !dist)
      return `X needs its distribution after the probability, as in ${typed}, X ~ N(50, 10²) for a mean of 50 and a standard deviation of 10. For the standard curve itself, use Z.`
    if (letter === 'Z' && dist) {
      const asX = central
        ? `P(x₁ < X < x₂) = ${central[7]}`
        : typed.replace(/Z/g, 'X').replace(/(?<![a-zA-Z])z(?![a-zA-Z])/g, 'x')
      return `Z is already standard, with mean 0 and standard deviation 1, so it takes no distribution. For a value from ${distText(dist)} use X, as in ${asX}, ${distText(dist)}, or leave the distribution off.`
    }
    return central ? centralRefusal(central, dist) : null
  }
  if (calls.length === 1 && /N\(|mean|sd|σ|μ/i.test(left))
    return 'Write the distribution last, as X ~ N(50, 10^2), with nothing after its closing bracket.'
  return `Work one probability at a time: find ${shownCall(first, dist)} on its own line, then do the arithmetic with the answer it gives.`
}

/**
 * Why a middle-area inverse was not read, when its variable and distribution fit: the question as
 * written is not the middle area, so it is refused with the line that is.
 */
function centralRefusal(m: RegExpExecArray, dist: NormalDist | undefined): string {
  const [, minus, a, subA, v, b, subB, p] = m
  const V = v.toUpperCase()
  const tail = dist ? `, ${distText(dist)}` : ''
  const middle = dist ? `P(x₁ < X < x₂) = ${p}${tail}` : `P(−z < Z < z) = ${p}`
  // x₁ is not on a keyboard: the bar and the Maths field both take x_1 for it.
  const how = dist ? ' Type x₁ as x_1 and x₂ as x_2.' : ''
  if (dist && minus && a.toLowerCase() === b.toLowerCase() && !subA && !subB)
    // "P(−x < X < x) = 0.95" for N(50, 10²): symmetric about 0, not about the mean.
    return `The middle ${p} of ${distText(dist)} sits either side of the mean ${givenText(dist.mean)}, not either side of 0, so its ends are not −${a} and ${a}. Ask for ${middle} instead.${how}`
  if (!minus && a === b && !subA && !subB)
    return `P(${a} < ${V} < ${b}) runs from a value to itself, so its area is 0. For the middle ${p}, write ${middle}.${how}`
  return `An area of ${p} between two unknown ends does not fix them: many pairs of ends give it. For the middle ${p}, symmetric about ${dist ? 'the mean' : '0'}, write ${middle}.${how}`
}

/**
 * A call as the refusal names it, ready to type back into the bar: "P(Z<1.96)" as
 * "P(Z < 1.96)", "phi(1.96)" as "Φ(1.96)", and an X question with its distribution after it.
 */
function shownCall(call: string, dist: NormalDist | undefined): string {
  const shown = call.replace(/\s*([<>])\s*/g, ' $1 ').replace(/^phi\(/i, 'Φ(').replace(/^p\(/, 'P(')
  return dist && /X/i.test(shown) ? `${shown}, ${distText(dist)}` : shown
}

/** X needs its N(μ, σ²); Z must not have one (a Z with a mean of 50 is a contradiction). */
const varFits = (letter: string, dist: NormalDist | undefined): boolean => (letter.toUpperCase() === 'X') === (dist !== undefined)

const inv = (p: number, tail: Tail, dist?: NormalDist): NormalQuery => ({ kind: 'inverse', p, tail, dist })

// ---------------------------------------------------------------------------------------------
// Numbers as the working prints them
// ---------------------------------------------------------------------------------------------

/** A number the student typed, shown as typed (up to six places, no padding). */
const given = (v: number): string => texPrecise(v, { decimals: 6, precisionMode: 'dp' })
const givenText = (v: number): string => fmtPrecise(v, { decimals: 6, precisionMode: 'dp' })
/**
 * An area the student typed, or one worked from it, to its last digit: 0.9999999 must not read
 * as 1 (Φ(z) = 1 has no z) nor 0.0000001 as 0. Float noise from 1 − p is cleaned off first, and
 * a very small area is written 1×10^-7, as the rest of the app writes one.
 */
const clean = (v: number): number => toPlaces(v, 15)
const areaText = (v: number): string => fmtPrecise(clean(v), { decimals: 12, precisionMode: 'dp' })
const areaTex = (v: number): string => texPrecise(clean(v), { decimals: 12, precisionMode: 'dp' })
/** The places an area was given to, never fewer than the table's four: 0.975 → 4, 0.9999999 → 7. */
const placesOf = (v: number): number => Math.max(PLACES, /\.(\d+)$/.exec(String(clean(v)))?.[1].length ?? 0)
/** A four-place probability, zeros kept: 0.9500. */
const prob = (v: number): string => paddedTex(v, PLACES)
const probText = (v: number): string => padded(v, PLACES)
/** A table z: two places kept (1.50), or three when it has a third (1.645). */
const zPlaces = (v: number): number => (Math.round(Math.abs(v) * 1000) % 10 === 0 ? 2 : 3)
const zs = (v: number): string => paddedTex(v, zPlaces(v))
const zText = (v: number): string => padded(v, zPlaces(v))
/** A z read backwards from the table, three places kept: 1.960. */
const z3 = (v: number): string => paddedTex(v, 3)
/** A value in brackets when negative, as a textbook substitutes it: 50 − (−3). */
const br = (v: number): string => (v < 0 ? `\\left(${given(v)}\\right)` : given(v))

const same = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9

/** "P(X < 65)" in LaTeX and in words. */
function probTex(q: NormalQuery, letter: string): string {
  switch (q.kind) {
    case 'below':
      return `P(${letter} < ${given(q.x)})`
    case 'above':
      return `P(${letter} > ${given(q.x)})`
    case 'between':
      return `P(${given(q.a)} < ${letter} < ${given(q.b)})`
    case 'inverse':
      return ''
  }
}

const distTex = (d: NormalDist): string =>
  `X \\sim N\\left(${given(d.mean)},\\ ${d.given === 'sd' ? `${given(d.sd)}^2` : given(d.spread)}\\right)`
const distText = (d: NormalDist): string =>
  `X ~ N(${givenText(d.mean)}, ${d.given === 'sd' ? `${givenText(d.sd)}²` : givenText(d.spread)})`

// ---------------------------------------------------------------------------------------------
// The steps
// ---------------------------------------------------------------------------------------------

interface Ctx {
  s: Steps
  /** Whether the Φ(z) = P(Z < z) chip has been shown yet: once is enough. */
  ruled: boolean
}

/** "σ = √100 = 10" when the spread came as a variance. */
function sigmaStep(c: Ctx, d: NormalDist): void {
  if (d.given !== 'variance') return
  const exact = same(d.sd, toPlaces(d.sd, 4))
  c.s.goal('Find the standard deviation')
  c.s.add(
    'Took the square root of the variance to get the standard deviation.',
    `\\sigma = \\sqrt{${given(d.spread)}} ${exact ? '=' : '\\approx'} ${texPrecise(d.sd, { decimals: 4, precisionMode: 'dp' })}`,
    '\\sigma = \\sqrt{\\sigma^2}',
    'N(μ, σ²) gives the variance as its second number, not the standard deviation.'
  )
}

/**
 * Standardise one value and round z to three places: two for the table's row and column, and a
 * third read between two columns. Returns the z the rest of the working reads the table with.
 */
function standardise(c: Ctx, x: number, d: NormalDist | undefined, label: string): number {
  if (!d) {
    const r = toPlaces(x, 3)
    if (!same(r, x))
      c.s.add(`Rounded ${givenText(x)} to three places: two for the table and one to read between its columns.`, `${label} = ${given(x)} \\approx ${zs(r)}`)
    return r
  }
  const zExact = (x - d.mean) / d.sd
  const r = toPlaces(zExact, 3)
  // σ shown as the working shows it: the square root line printed it at four places.
  const sdShown = d.given === 'variance' ? texPrecise(d.sd, { decimals: 4, precisionMode: 'dp' }) : given(d.sd)
  const sub = `\\dfrac{${given(x)} - ${br(d.mean)}}{${sdShown}}`
  const eq = same(zExact, r) ? `= ${given(r)}` : `\\approx ${zs(r)}`
  c.s.add(
    `Standardised ${givenText(x)}: took away the mean and divided by the standard deviation.`,
    `${label} = ${sub} ${eq}`,
    'z = \\dfrac{x - \\mu}{\\sigma}',
    same(zExact, r) ? undefined : 'z was rounded to three places: two for the table and one to read between its columns.'
  )
  return r
}

/**
 * Φ(z) from the table for a z of either sign with up to three places, adding the reading (the
 * in-between reading for a third place, and the symmetry step for a negative z). Returns the
 * four-place value the student now has — the same number tablePhi gives.
 */
function readPhi(c: Ctx, z: number): number {
  const a = Math.abs(z)
  let v: number
  const rule = c.ruled ? undefined : '\\Phi(z) = P(Z < z)'
  c.ruled = true
  const h = Math.round(a * 1000)
  if (a > Z_MAX + 1e-9) {
    v = tablePhi(a)
    c.s.add(
      `${zText(a)} is past the end of the table (it stops at 3.49), so the value is worked straight from the bell curve instead.`,
      `\\Phi(${zs(a)}) = ${prob(v)}`,
      rule
    )
  } else if (h % 10 === 0) {
    v = tablePhi(a)
    const { row, col } = rowCol(a)
    c.s.add(`Read row ${row}, column ${col} of the table.`, `\\Phi(${zs(a)}) = ${prob(v)}`, rule)
  } else {
    const zlo = Math.floor(h / 10) / 100
    const zhi = toPlaces(zlo + 0.01, 2)
    const lo = cell(zlo)
    const hi = cell(zhi)
    const tenths = h % 10
    v = tablePhi(a)
    const { row, col } = rowCol(zlo)
    const hlo = Math.floor(h / 10)
    // Reading between two cells is an estimate of Φ, so the first sign is ≈; the arithmetic after
    // it is exact unless the result had to be rounded to four places.
    const exact = same(lo + (tenths / 10) * (hi - lo), v)
    const where =
      hlo % 10 === 9
        ? // 1.695 sits between the last column of row 1.6 and the first of row 1.7.
          `between ${padded(zlo, 2)} (row ${row}, column ${col}) and ${padded(zhi, 2)} (the next row, column 0.00)`
        : `between columns ${col} and ${padded(((hlo % 10) + 1) / 100, 2)} of row ${row}`
    c.s.add(
      `${padded(a, 3)} lies ${where}, so went ${tenths} tenths of the way from one cell to the next.`,
      `\\Phi(${zs(a)}) \\approx ${prob(lo)} + 0.${tenths} \\times (${prob(hi)} - ${prob(lo)}) ${exact ? '=' : '\\approx'} ${prob(v)}`,
      rule
    )
  }
  if (z >= 0 || a === 0) return v
  const w = toPlaces(1 - v)
  c.s.add(
    'The table lists only positive z, so used the symmetry of the bell curve: the area left of −z equals the area right of z.',
    `\\Phi(${zs(z)}) = 1 - \\Phi(${zs(a)}) = 1 - ${prob(v)} = ${prob(w)}`,
    '\\Phi(-z) = 1 - \\Phi(z)'
  )
  return w
}

/** P(Z > z) from Φ(z): 1 − Φ(z), or straight from the table by symmetry when z < 0. */
function readAbove(c: Ctx, z: number): number {
  if (z < 0) {
    const a = Math.abs(z)
    c.s.add(
      `By symmetry, the area to the right of ${zText(z)} equals the area to the left of ${zText(a)}.`,
      `P(Z > ${zs(z)}) = P(Z < ${zs(a)}) = \\Phi(${zs(a)})`,
      'P(Z > -z) = \\Phi(z)'
    )
    return readPhi(c, a)
  }
  const v = readPhi(c, z)
  const w = toPlaces(1 - v)
  c.s.add(
    'The whole area under the curve is 1, so took away the area to the left.',
    `P(Z > ${zs(z)}) = 1 - \\Phi(${zs(z)}) = 1 - ${prob(v)} = ${prob(w)}`,
    'P(Z > z) = 1 - \\Phi(z)'
  )
  return w
}

export interface ZOptions {
  /** Places for a found x in an inverse question (the z always has three). */
  xDecimals?: number
}

/** The worked answer for one normal-distribution question. */
export function zscoreWorking(q: NormalQuery, opts: ZOptions = {}): Working {
  const letter = q.dist ? 'X' : 'Z'
  if (q.kind === 'inverse') return inverseWorking(q, opts)
  const input = q.dist ? `${probTex(q, letter)},\\quad ${distTex(q.dist)}` : probTex(q, letter)
  const plainTitle = `Find ${plainProb(q, letter)}${q.dist ? ` for ${distText(q.dist)}` : ''}`
  if (q.kind === 'between' && !(q.a < q.b))
    return failed(plainTitle, input, `The first number has to be below the second: ${givenText(q.a)} is not below ${givenText(q.b)}, so there is no area between them in that order.`)

  const c: Ctx = { s: new Steps(), ruled: false }
  if (q.dist) sigmaStep(c, q.dist)
  let answer: number
  let formula: number
  if (q.kind === 'below' || q.kind === 'above') {
    c.s.goal(q.dist ? 'Change x into z' : 'Get z ready for the table')
    const z = standardise(c, q.x, q.dist, 'z')
    if (q.dist) c.s.add('The area for X is the same as the area for Z at the matching point.', `${probTex(q, 'X')} = P(Z ${q.kind === 'below' ? '<' : '>'} ${zs(z)})`)
    c.s.goal('Read the table')
    answer = q.kind === 'below' ? readPhi(c, z) : readAbove(c, z)
    // An upper tail straight from Q, not 1 − Φ: P(Z > 5) = 2.86652×10⁻⁷ keeps its digits.
    formula = q.kind === 'below' ? phi(z) : upperTail(z)
  } else {
    c.s.goal(q.dist ? 'Change both ends into z' : 'Get z ready for the table')
    const za = standardise(c, q.a, q.dist, 'z_1')
    const zb = standardise(c, q.b, q.dist, 'z_2')
    if (q.dist) c.s.add('The area for X is the area for Z between the matching points.', `${probTex(q, 'X')} = P(${zs(za)} < Z < ${zs(zb)})`)
    c.s.goal('Read the table')
    const vb = readPhi(c, zb)
    const va = readPhi(c, za)
    answer = toPlaces(vb - va)
    c.s.goal('Take the smaller area from the larger')
    c.s.add(
      'The area between two points is the area left of the upper one minus the area left of the lower one.',
      `P(${zs(za)} < Z < ${zs(zb)}) = \\Phi(${zs(zb)}) - \\Phi(${zs(za)}) = ${prob(vb)} - ${prob(va)} = ${prob(answer)}`,
      'P(a < Z < b) = \\Phi(b) - \\Phi(a)'
    )
    // Two right-hand tails subtract without losing the small digits the way 1 − Φ would.
    formula = za >= 0 ? upperTail(za) - upperTail(zb) : phi(zb) - phi(za)
  }
  // Each printed cell carries up to ±0.00005 of rounding, a reading between two cells or a
  // difference of two readings is rounded once more, so the table route and the formula may
  // differ by one unit in the fourth place (1.5 at worst, measured over every z in the tests)
  // and both still be right.
  const ok = Math.abs(answer - formula) <= 1.5e-4
  // P(−1 < Z < 1): the table route gives 0.8413 − 0.1587 = 0.6826, a calculator 0.6827. Both are
  // said, so a student checking on an fx-991EX sees why the last digit differs.
  const calc = toPlaces(formula, PLACES)
  const also = ok && !same(calc, answer) ? ` To four places that is ${probText(calc)}, the value a calculator shows; the table route gives ${probText(answer)} because each reading was rounded to four places first.` : ''
  return {
    title: plainTitle,
    input,
    method: 'Standard normal table',
    moves: c.s.moves,
    answers: [{ label: plainProb(q, letter), tex: prob(answer) }],
    check: ok
      ? `The area worked straight from the bell curve, without the table, is ${padded(formula, 6)}, which agrees with ${probText(answer)} within the table's four-place rounding.${also}`
      : `The area worked straight from the bell curve, without the table, is ${padded(formula, 6)}, which does not agree with ${probText(answer)}.`,
    checked: ok ? 'ok' : 'failed'
  }
}

function plainProb(q: NormalQuery, letter: string): string {
  switch (q.kind) {
    case 'below':
      return `P(${letter} < ${givenText(q.x)})`
    case 'above':
      return `P(${letter} > ${givenText(q.x)})`
    case 'between':
      return `P(${givenText(q.a)} < ${letter} < ${givenText(q.b)})`
    case 'inverse':
      return q.dist ? 'x' : 'z'
  }
}

function inverseWorking(q: Extract<NormalQuery, { kind: 'inverse' }>, opts: ZOptions): Working {
  const letter = q.dist ? 'X' : 'Z'
  const unknown = q.dist ? 'x' : 'z'
  const pTex = areaTex(q.p)
  const pText = areaText(q.p)
  const central = q.tail === 'central'
  // A middle area asked as P(x₁ < X < x₂) = p: the two ends sit symmetrically about the mean, and
  // the working says so, because the line alone fits any interval with that area. (The −x < X < x
  // form is only accepted when the mean is 0, where it is the same question.)
  const pair = central && q.pair === true
  const mean = q.dist ? q.dist.mean : 0
  const ask =
    q.tail === 'below'
      ? `P(${letter} < ${unknown}) = ${pTex}`
      : q.tail === 'above'
        ? `P(${letter} > ${unknown}) = ${pTex}`
        : pair
          ? `P(${unknown}_1 < ${letter} < ${unknown}_2) = ${pTex}\\ \\text{symmetric about the mean } ${given(mean)}`
          : `P(-${unknown} < ${letter} < ${unknown}) = ${pTex}`
  // The title is built in words, never by stripping backslashes from the LaTeX (which once
  // gave "1times 10^{-7}").
  const askPlain =
    q.tail === 'below'
      ? `P(${letter} < ${unknown}) = ${pText}`
      : q.tail === 'above'
        ? `P(${letter} > ${unknown}) = ${pText}`
        : pair
          ? `P(${unknown}₁ < ${letter} < ${unknown}₂) = ${pText}, symmetric about the mean ${givenText(mean)}`
          : `P(−${unknown} < ${letter} < ${unknown}) = ${pText}`
  const input = q.dist ? `${ask},\\quad ${distTex(q.dist)}` : ask
  const found = pair ? `${unknown}₁ and ${unknown}₂` : unknown
  const title = `Find ${found} when ${askPlain}${q.dist ? `${pair ? ',' : ''} for ${distText(q.dist)}` : ''}`
  if (!(q.p > 0 && q.p < 1)) return failed(title, input, `An area under the bell curve is between 0 and 1, so no ${unknown} gives an area of ${pText}.`)

  const c: Ctx = { s: new Steps(), ruled: true }
  if (q.dist) sigmaStep(c, q.dist)

  // 1. The area to the left, which is what the table lists.
  let left = q.p
  c.s.goal('Find the area to the left')
  if (q.tail === 'above') {
    left = clean(1 - q.p)
    c.s.add(
      `The area to the right is ${pText}, so the area to the left is what is left of the whole area 1.`,
      `\\Phi(z) = 1 - ${pTex} = ${areaTex(left)}`,
      'P(Z > z) = 1 - \\Phi(z)'
    )
  } else if (central) {
    left = clean((1 + q.p) / 2)
    c.s.add(
      `The middle ${pText} leaves ${areaText((1 - q.p) / 2)} in each tail, so the area to the left of the upper z is`,
      `\\Phi(z) = ${pTex} + \\dfrac{1 - ${pTex}}{2} = ${areaTex(left)}`,
      'P(-z < Z < z) = 2\\Phi(z) - 1'
    )
  } else {
    c.s.add('The table lists the area to the left of z, which is the area given.', `\\Phi(z) = ${pTex}`, '\\Phi(z) = P(Z < z)')
  }

  // 2. Read the table backwards (for an area below one half, via symmetry).
  c.s.goal('Read the table backwards')
  const negative = left < 0.5
  const look = negative ? clean(1 - left) : left
  if (negative)
    c.s.add(
      `An area to the left below 0.5 means z is below the middle, so z is negative. Looked up 1 − ${areaText(left)} instead and will put a minus sign on the answer.`,
      `\\Phi(-z) = 1 - ${areaTex(left)} = ${areaTex(look)}`,
      '\\Phi(-z) = 1 - \\Phi(z)'
    )
  // What the lookup finds is −z when z is negative; naming it so keeps "z = 1.881" and
  // "z = −1.881" from both appearing as if they were the same unknown.
  const zName = negative ? '-z' : 'z'
  let zPos: number
  if (look === 0.5) {
    zPos = 0
    c.s.add('An area of exactly one half is the middle of the curve.', `z = 0`)
  } else {
    const r = readInverse(look)
    zPos = r.z
    if (r.how === 'cell' && r.lo) {
      const { row, col } = rowCol(r.lo.z)
      c.s.add(`Found ${probText(look)} in the table at row ${row}, column ${col}.`, `${zName} = ${z3(zPos)}`)
    } else if (r.how === 'between' && r.lo && r.hi) {
      c.s.add(
        `${probText(look)} is not printed in the table; it lies between ${probText(r.lo.cell)} (z = ${padded(r.lo.z, 2)}) and ${probText(r.hi.cell)} (z = ${padded(r.hi.z, 2)}), so z lies between those two. To three places it is`,
        `${zName} = ${z3(zPos)}`,
        undefined,
        'The third place comes from the exact inverse of the curve, which is what reading between the two columns estimates.'
      )
    } else {
      c.s.add(`The area ${areaText(look)} is past the end of the table (3.49), so z is worked straight from the bell curve instead.`, `${zName} = ${z3(zPos)}`)
    }
  }
  const z = negative ? -zPos : zPos
  if (negative) c.s.add('Put the minus sign back.', `z = ${z3(z)}`)

  // 3. Back to x.
  const answers: { label: string; tex: string }[] = []
  const xd = opts.xDecimals ?? 2
  // The TeX label (x_1) goes in the line; the heading is a plain sentence, so it names x₁, never x_1.
  const toX = (zz: number, label: string, plain = label): number => {
    const d = q.dist!
    const exact = d.mean + zz * d.sd
    const shown = toPlaces(exact, xd)
    const sdShown = d.given === 'variance' ? texPrecise(d.sd, { decimals: 4, precisionMode: 'dp' }) : given(d.sd)
    c.s.add(
      `Turned z back into ${plain}: the mean plus z standard deviations.`,
      `${label} = ${given(d.mean)} + ${zz < 0 ? `\\left(${z3(zz)}\\right)` : z3(zz)} \\times ${sdShown} ${same(exact, shown) ? '=' : '\\approx'} ${given(shown)}`,
      'x = \\mu + z\\sigma'
    )
    return shown
  }
  if (q.dist) {
    c.s.goal('Change z back into x')
    if (pair) {
      const lo = toX(-zPos, 'x_1', 'x₁')
      const hi = toX(zPos, 'x_2', 'x₂')
      answers.push({ label: 'x₁', tex: given(lo) }, { label: 'x₂', tex: given(hi) })
    } else if (central) {
      // −x < X < x with a mean of 0: x is the upper end, and the lower one is its negative.
      answers.push({ label: 'x', tex: `\\pm ${given(toX(zPos, 'x'))}` })
    } else answers.push({ label: 'x', tex: given(toX(z, 'x')) })
  } else if (pair) answers.push({ label: 'z₁', tex: z3(-zPos) }, { label: 'z₂', tex: z3(zPos) })
  else if (central) answers.push({ label: 'z', tex: `\\pm ${z3(zPos)}` })
  else answers.push({ label: 'z', tex: z3(z) })

  // Check: the area at the three-place z, which can differ from the asked area by at most
  // φ(z) × 0.0005 because z itself was rounded to three places.
  const back = phi(zPos)
  const ok = Math.abs(back - look) <= pdf(zPos) * 0.0005 + 1e-9
  return {
    title,
    input,
    method: 'Standard normal table, read backwards',
    moves: c.s.moves,
    answers,
    check: `Φ(${padded(zPos, 3)}) = ${padded(back, placesOf(look))}, the area ${padded(look, placesOf(look))} looked up${ok ? '' : ' — it does not match'}.`,
    checked: ok ? 'ok' : 'failed'
  }
}
