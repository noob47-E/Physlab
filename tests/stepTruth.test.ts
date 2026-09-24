// Fix 4: every line of step-by-step working is true as written, and set out the textbook way.
//
// A student copies working into a notebook and checks it on a calculator, typing each number
// exactly as the screen shows it. The tests here do the same: they read each displayed line,
// recompute it from the numbers written in it, and insist it gives the number written after the
// "=" to the precision shown there. They also read the working for the rough writing the tester
// found ("− −1(2x + 1)", "+ −7/8", "3/10x", a fraction inside a fraction, "1 − 2i = 1 − 2i",
// "1 1. Choose a scale", "Direction :").

import { beforeEach, describe, expect, it } from 'vitest'
import { STEP_GUARD_MAX, morePrecise, shownValue, stepEq, stepPrecision, fmtPrecise, type MeasureSettings } from '../src/renderer/src/math/format'
import { math } from '../src/renderer/src/math/expr'
import * as VS from '../src/renderer/src/math/vectorSolver'
import { fromPolar, toRad, type V3 } from '../src/renderer/src/math/vec'
import { resetGlobals } from './helpers/globals'
import { runPure, type JobId } from '../src/renderer/src/math/pure/run'
import { texToPlain, type Working } from '../src/renderer/src/math/pure/work'
import { latexToMath } from '../src/renderer/src/math/latexToMath'
import { writeTimes } from '../src/renderer/src/math/pure/mono'
import { derivativeWorking, integralWorking, type DerivTree, type IntegralTree } from '../src/renderer/src/math/pure/calculusSteps'
import { readFileSync, readdirSync } from 'node:fs'
import { repoPath } from './helpers/repo'

beforeEach(resetGlobals)

// ---------------------------------------------------------------------------
// Reading a displayed line the way a student with a calculator reads it
// ---------------------------------------------------------------------------

/** The text inside the brace group that opens at `open`, and the index just past its close. */
function group(s: string, open: number): [string, number] {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}' && --depth === 0) return [s.slice(open + 1, i), i + 1]
  }
  return [s.slice(open + 1), s.length]
}

/** \frac{a}{b} → ((a)/(b)) and \sqrt{a} → sqrt(a), innermost first, braces matched properly. */
function unbrace(s: string): string {
  let out = s
  for (let guard = 0; guard < 50; guard++) {
    const f = out.search(/\\d?frac\{/)
    const r = out.search(/\\sqrt\{/)
    if (f < 0 && r < 0) break
    if (f >= 0 && (r < 0 || f < r)) {
      const start = out.indexOf('{', f)
      const [a, i] = group(out, start)
      const [b, j] = group(out, i)
      out = `${out.slice(0, f)}((${a})/(${b}))${out.slice(j)}`
    } else {
      const start = out.indexOf('{', r)
      const [a, i] = group(out, start)
      out = `${out.slice(0, r)}sqrt(${a})${out.slice(i)}`
    }
  }
  return out
}

/** Split at a separator that is not inside braces or brackets. */
export function splitTop(s: string, sep: RegExp): string[] {
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

const PLAIN = /^(-?\d+(?:\.\d+)?)(?:\\times10\^\{(-?\d+)\})?(\^\\circ|\\text\{rad\})?$/

/** A segment that is a single number as written, with the decimals it shows. */
function plainNumber(seg: string): { value: number; decimals: number } | null {
  const m = seg.replace(/\s|\\,|\\!|\\;/g, '').match(PLAIN)
  if (!m) return null
  const decimals = (m[1].split('.')[1] ?? '').length - (m[2] ? Number(m[2]) : 0)
  return { value: Number(m[1]) * (m[2] ? Math.pow(10, Number(m[2])) : 1), decimals }
}

/**
 * A segment as an expression mathjs can evaluate, or null when it has letters in it (a symbolic
 * form such as "A\cos\theta" is not something to recompute). Angles in degrees become mathjs
 * degree units, so cos 30° is worked out in degrees exactly as a calculator in DEG mode does.
 */
export function numeric(seg: string, degrees: boolean): string | null {
  let s = seg
    .replace(/\\left|\\right|\\,|\\;|\\!|\\quad|\\displaystyle/g, ' ')
    .replace(/\^\\circ/g, ' deg ')
    .replace(/\\text\{\s*rad\s*\}/g, ' ')
  if (/\\text|\\hat|\\vec|\\mathbf|\\begin/.test(s)) return null
  s = unbrace(s)
  const inv = degrees ? 'D' : ''
  s = s
    .replace(/\\(sin|cos|tan)\^\{-1\}/g, (_m, f: string) => ` a${f}${inv}`)
    .replace(/\\times|\\cdot/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\(sin|cos|tan)\s*(-?\d+(?:\.\d+)?(?:\s*deg)?)/g, ' $1($2)')
    .replace(/\\(sin|cos|tan)/g, ' $1')
    .replace(/\|([^|]+)\|/g, 'abs($1)')
    .replace(/\^\{([^{}]*)\}/g, '^($1)')
    .replace(/−/g, '-')
  const words = s.match(/[A-Za-z_]+/g) ?? []
  const allowed = new Set(['sqrt', 'sin', 'cos', 'tan', 'asinD', 'acosD', 'atanD', 'asin', 'acos', 'atan', 'abs', 'deg', 'e'])
  if (words.some((w) => !allowed.has(w)) || /\\/.test(s)) return null
  return s
}

/** A trig argument as a calculator takes it: "30°" in degrees, a bare number in radians. */
const angleArg = (x: unknown): number =>
  typeof x === 'number' ? x : (x as { toNumber: (u: string) => number }).toNumber('rad')

// The app's own mathjs follows the global angle mode; a student's calculator here follows the
// line: sin 30° is in degrees, sin 0.52 rad in radians. So the reader brings its own trig.
const scope = {
  sin: (x: unknown) => Math.sin(angleArg(x)),
  cos: (x: unknown) => Math.cos(angleArg(x)),
  tan: (x: unknown) => Math.tan(angleArg(x)),
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  asinD: (x: number) => (Math.asin(x) * 180) / Math.PI,
  acosD: (x: number) => (Math.acos(x) * 180) / Math.PI,
  atanD: (x: number) => (Math.atan(x) * 180) / Math.PI
}

function evaluate(expr: string, degrees: boolean): number | null {
  try {
    const v = math.evaluate(expr, { ...scope }) as unknown
    if (typeof v === 'number') return v
    const u = v as { toNumber?: (unit: string) => number }
    if (u && typeof u.toNumber === 'function') return u.toNumber(degrees ? 'deg' : 'rad')
    return null
  } catch {
    return null
  }
}

/** The statements of a line: "A = 5,\quad B = 5" is two, "x ⇒ y" is two, "a \approx b" claims nothing. */
export const statements = (tex: string): string[] =>
  splitTop(tex, /^(,\s*\\quad|\\qquad|\\quad|\\;\\Rightarrow\\;|\\Rightarrow|\\to|\\approx|\\text\{\s*(and|or)\s*\}|,\\\s)/)

export interface Falsehood {
  line: string
  claim: string
  got: number
}

/**
 * A trailing unit ("10.37\,\text{N}", "16.7\text{ squares}") is not something a calculator is
 * given: it comes off before the number is read. Without this every line ending in a unit was
 * skipped without a word, and a false "√(7.56² + 7.09²) = 10.37 N" passed.
 */
export const stripUnit = (seg: string): string => seg.replace(/(?<=[\d}])\s*(?:\\,)?\\text\{[^{}]*\}\s*$/, '').trim()

const IJK_NUM = String.raw`\d+(?:\.\d+)?(?:\\times\s*10\^\{-?\d+\})?`
/** One run of unit-vector terms, "4.01\hat{i} - 2.01\hat{j} + 0.41\hat{k}". */
const IJK_SPAN = new RegExp(String.raw`-?\s*${IJK_NUM}\\hat\{[ijk]\}(?:\s*[+-]\s*${IJK_NUM}\\hat\{[ijk]\})*`, 'g')
const IJK_TERM = /([+-]?)\s*(\d+(?:\.\d+)?)(?:\\times\s*10\^\{(-?\d+)\})?\\hat\{([ijk])\}/g

interface VectorSeg {
  /** The segment with its vector replaced by one component: "3(1\hat{i} + 1\hat{j})" → "3((1))" for x. */
  component: (axis: number) => string
  /** The components as written, when the segment is nothing but a vector (a line's result). */
  result: { value: number; decimals: number; text: string }[] | null
}

/**
 * A segment holding one vector in unit-vector form, read a component at a time, so a line such
 * as "3(1î + 1ĵ) = 3.01î + 3.01ĵ" is three claims a calculator can check: 3 × 1 = 3.01 is false.
 * "(…)/4.4" and "(−1.6)(…)" and "(…)×10⁻¹⁹" all come apart the same way.
 */
export function vectorSeg(seg: string): VectorSeg | null {
  const spans = [...seg.matchAll(IJK_SPAN)]
  if (spans.length !== 1) return null
  const span = spans[0]
  const comps = [0, 1, 2].map(() => ({ text: '0', value: 0, decimals: NaN, mant: '0.' }))
  for (const t of span[0].matchAll(IJK_TERM)) {
    const axis = 'ijk'.indexOf(t[4])
    const e = t[3] ? Number(t[3]) : 0
    const sign = t[1] === '-' ? '-' : ''
    comps[axis] = { text: `${sign}${t[2]}${t[3] ? `\\times 10^{${e}}` : ''}`, value: Number(sign + t[2]) * Math.pow(10, e), decimals: (t[2].split('.')[1] ?? '').length - e, mant: t[2] }
  }
  const before = seg.slice(0, span.index)
  const after = seg.slice((span.index ?? 0) + span[0].length)
  const whole = seg.replace(/\s+/g, '')
  const bare = span[0].replace(/\s+/g, '')
  const scaled = whole.match(/^\\left\((.*)\\right\)\\times10\^\{(-?\d+)\}$/)
  const outer = whole === bare ? 0 : scaled && scaled[1] === bare ? Number(scaled[2]) : null
  let result: VectorSeg['result'] = null
  if (outer !== null) {
    // A component left out of the vector is 0, to the places its neighbours are written to.
    const places = Math.max(...comps.filter((c) => !Number.isNaN(c.decimals)).map((c) => c.decimals))
    result = comps.map((c) => ({
      value: c.value * Math.pow(10, outer),
      decimals: (Number.isNaN(c.decimals) ? places : c.decimals) - outer,
      text: c.mant
    }))
  }
  return { component: (axis) => `${before}(${comps[axis].text})${after}`, result }
}

/**
 * Every false claim in one displayed line. A claim is "this segment equals the number written
 * later in the same chain, to the places shown there"; two neighbouring segments written the same
 * are a step that changes nothing, and count as false too.
 */
export function falseClaims(tex: string, sf?: number): Falsehood[] {
  // Half a unit in the last place shown. At 3 significant figures "1300" means 1295 to 1305: its
  // trailing zeros are not places the student was shown, so they widen the allowance.
  const allowance = (n: { value: number; decimals: number }, text: string): number => {
    let places = n.decimals
    if (sf && places === 0 && !/\./.test(text)) places = Math.min(0, sf - (Math.floor(Math.log10(Math.abs(n.value) || 1)) + 1))
    return 0.5 * Math.pow(10, -places) * (1 + 1e-9) + 1e-12 * Math.abs(n.value)
  }
  const out: Falsehood[] = []
  for (const st of statements(tex)) {
    const segs = splitTop(st, /^=/).map(stripUnit)
    const degrees = segs.some((g) => /\^\\circ/.test(g))
    for (let i = 1; i < segs.length; i++) {
      const norm = (g: string) => g.replace(/\\dfrac/g, '\\frac').replace(/\s+/g, '')
      if (norm(segs[i]) === norm(segs[i - 1])) out.push({ line: tex, claim: `${segs[i - 1]} = ${segs[i]} changes nothing`, got: NaN })
    }
    // A vector result is a claim per component, against every vector written before it.
    const vecs = segs.map(vectorSeg)
    for (let j = 1; j < segs.length; j++) {
      const res = vecs[j]?.result
      if (!res) continue
      for (let i = 0; i < j; i++) {
        const src = vecs[i]
        if (!src) continue
        res.forEach((n, axis) => {
          const e = numeric(src.component(axis), degrees)
          const v = e === null ? null : evaluate(e, degrees)
          if (v === null) return
          if (Math.abs(v - n.value) > allowance(n, n.text)) out.push({ line: tex, claim: `${src.component(axis)} = ${n.value} (component ${'xyz'[axis]} of ${segs[j]})`, got: v })
        })
      }
    }
    for (let j = 1; j < segs.length; j++) {
      const n = plainNumber(segs[j])
      if (!n) continue
      const tol = allowance(n, segs[j])
      for (let i = 0; i < j; i++) {
        const e = numeric(segs[i], degrees)
        if (e === null) continue
        const v = evaluate(e, degrees)
        if (v === null) continue
        if (Math.abs(v - n.value) > tol) out.push({ line: tex, claim: `${segs[i]} = ${segs[j]}`, got: v })
      }
    }
    // √(0.5² + 8.33²) = √69.64: the sum under the root is a claim of its own.
    for (let i = 1; i < segs.length; i++) {
      const a = segs[i - 1].trim().match(/^\\sqrt\{(.*)\}$/)
      const b = segs[i].trim().match(/^\\sqrt\{(.*)\}$/)
      const n = b && plainNumber(b[1])
      if (!a || !n) continue
      const e = numeric(a[1], degrees)
      const v = e === null ? null : evaluate(e, degrees)
      if (v === null) continue
      if (Math.abs(v - n.value) > allowance(n, b[1])) out.push({ line: tex, claim: `√(${a[1]}) = √${b[1]}`, got: v })
    }
  }
  return out
}

/** Every false claim across a vector solution. */
const solutionFalsehoods = (sol: VS.Solution, s: MeasureSettings): Falsehood[] =>
  sol.steps.flatMap((st) => (st.tex ? falseClaims(st.tex, s.precisionMode === 'sf' ? s.decimals : undefined) : []))

/** Rough writing in a vector solution's sentences: numbering, colons, a heading with nothing under it. */
function vectorWritingFaults(sol: VS.Solution): string[] {
  const out: string[] = []
  sol.steps.forEach((s, i) => {
    const t = s.text ?? ''
    // The panels number every step already; a step's own "1." read as "1 1. Choose a scale".
    if (/^\d+\.\s/.test(t)) out.push(`step ${i + 1} numbers itself: "${t}"`)
    if (/\s:/.test(t)) out.push(`step ${i + 1} has a space before a colon: "${t}"`)
    if (/:\s*$/.test(t) && !s.tex) out.push(`step ${i + 1} promises maths and shows none: "${t}"`)
  })
  return out
}

const SETTINGS: [string, MeasureSettings][] = [
  ['2 d.p., degrees', { decimals: 2, precisionMode: 'dp', unit: 'unit', unitPerSquare: 1, angleUnit: 'deg' }],
  ['4 d.p., degrees', { decimals: 4, precisionMode: 'dp', unit: 'unit', unitPerSquare: 1, angleUnit: 'deg' }],
  ['0 d.p., degrees', { decimals: 0, precisionMode: 'dp', unit: 'unit', unitPerSquare: 1, angleUnit: 'deg' }],
  ['3 s.f., degrees', { decimals: 3, precisionMode: 'sf', unit: 'unit', unitPerSquare: 1, angleUnit: 'deg' }],
  ['2 d.p., radians', { decimals: 2, precisionMode: 'dp', unit: 'unit', unitPerSquare: 1, angleUnit: 'rad' }]
]

/** A fixed spread of vectors: whole numbers, decimals, every quadrant, polar ones with awkward angles. */
function vectorSpread(): V3[] {
  let seed = 7
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const out: V3[] = [
    [3, 4, 0],
    fromPolar(5, toRad(120)),
    fromPolar(10, toRad(30)),
    [-3, 4, 0],
    [2, -1, 0],
    [-2.5, -6.1, 0],
    [0.3, 0.7, 0],
    [1.004, 1.004, 0]
  ]
  for (let i = 0; i < 16; i++) out.push(fromPolar(Math.round(rnd() * 400) / 10 + 0.5, toRad(Math.round(rnd() * 36000) / 100)))
  for (let i = 0; i < 8; i++) out.push([Math.round((rnd() - 0.5) * 200) / 10, Math.round((rnd() - 0.5) * 200) / 10, 0])
  return out
}
const SPREAD = vectorSpread()
const SPREAD_3D: V3[] = [
  [3, 4, 5],
  [-1, 2, 2],
  [1.5, -2.25, 0.8],
  [0.2, 0.3, -0.9]
]

/**
 * Sizes far from 1: a sum of squares of 10⁻⁷ is 10⁻¹³, which a decimal-places writer shows as 0
 * ("√0 = 3.16×10⁻⁷"), and a size in scientific form squared must not read "3.16×10⁻⁷^2".
 */
const FAR_SIZES: Record<string, [V3, V3]> = {
  tiny: [
    [1e-7, 3e-7, 0],
    [2e-7, -1e-7, 0]
  ],
  huge: [
    [3e10, 4e10, 0],
    [-2e10, 5e10, 0]
  ]
}

/** The review's counterexamples: each was a false line the reader could not see. */
const COUNTEREXAMPLES: [string, (s: MeasureSettings) => VS.Solution][] = [
  ['scalar multiple 3(1î + 1ĵ) = 3.01î + 3.01ĵ', (s) => VS.solveScalarMultiply(3, { name: 'A', v: [1.004, 1.004, 0] }, 'R', s)],
  // v × B = 4.0125î − 2.0081ĵ + 0.4064k̂: (−1.6)(−2.01) is 3.216, so 3.22, never the 3.21 of −1.6 × −2.0081.
  ['magnetic force (−1.6)(4.01î − 2.01ĵ + 0.41k̂)', (s) => VS.solveMagneticForce(-1.6, [2.0081, 4.0125, 0], [0, 0.4064 / 2.0081, 1], s)],
  ['two forces 5.12 N and 7.5 N at 71°', (s) => VS.solveTwoForces(5.12, 7.5, 71, 'N', s)],
  ['two forces 1.2 N and 4.6 N at 88°', (s) => VS.solveTwoForces(1.2, 4.6, 88, 'N', s)],
  ['two forces whose resultant leans back past F₂', (s) => VS.solveTwoForces(1, 7.5, 150, 'N', s)],
  ['two forces whose resultant points below F₁', (s) => VS.solveTwoForces(3, 4, 250, 'N', s)],
  ['two forces whose resultant points back and below F₁', (s) => VS.solveTwoForces(1, 7.5, 210, 'N', s)],
  // At 3 s.f. each "=" of the law-of-cosines line held, but √(8.05² + 4.09² + 2×8.05×4.09 cos 155°)
  // is 4.6745, never the 4.68 the line ended on; likewise √(5.54² + 4.49² + … cos 184°) is 1.106, not 1.10.
  ['two forces 8.05 N and 4.09 N at 154.9°', (s) => VS.solveTwoForces(8.05, 4.09, 154.9, 'N', s)],
  ['two forces 5.54 N and 4.49 N at 183.9°', (s) => VS.solveTwoForces(5.54, 4.49, 183.9, 'N', s)]
]

/** Two forces, 2-d.p. sizes and a 1-d.p. angle, each seeded run the same: the spread above never reached these. */
function twoForcesSpread(n: number): [number, number, number][] {
  let seed = 12345
  const rnd = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  return Array.from({ length: n }, () => [Math.round(rnd() * 1000) / 100, Math.round(rnd() * 1000) / 100, Math.round(rnd() * 3600) / 10])
}

/** Every vector solver, on one pair of vectors (or one vector, for the one-vector solvers). */
function allSolutions(a: V3, b: V3, s: MeasureSettings): [string, VS.Solution][] {
  const A = { name: 'A', v: a }
  const B = { name: 'B', v: b }
  const mag = Math.hypot(a[0], a[1], a[2])
  const deg = (Math.atan2(a[1], a[0]) * 180) / Math.PI
  return [
    ['components', VS.solveComponents('F', Math.round(mag * 100) / 100, Math.round(deg * 100) / 100, '', s)],
    ['magnitude and direction', VS.solveMagnitudeDirection(A, s)],
    ['resolve', VS.solveResolve(A, s)],
    ['add', VS.solveAddition([A, B], 'R', s)],
    ['law of cosines', VS.solveAdditionCosineLaw(A, B, 'R', s)],
    ['drawing', VS.solveAdditionGraphical([A, B], 'R', s)],
    ['subtract', VS.solveSubtraction(A, B, 'R', s)],
    ['scalar multiple', VS.solveScalarMultiply(-1.5, A, 'R', s)],
    ['unit vector', VS.solveUnitVector(A, s)],
    ['dot', VS.solveDot(A, B, s)],
    ['angle between', VS.solveAngleBetween(A, B, s)],
    ['cross', VS.solveCross(A, B, 'C', s)],
    ['projection', VS.solveProjection(B, A, s)],
    ['two forces', VS.solveTwoForces(Math.round(mag * 10) / 10, 7.5, Math.round(Math.abs(deg)), 'N', s)],
    ['equilibrium', VS.solveEquilibrium([A, B], s)],
    ['work', VS.solveWork(a, b, s)],
    ['torque', VS.solveTorque(a, b, s)],
    ['magnetic force', VS.solveMagneticForce(-1.6, a, b, s)],
    ['relative velocity', VS.solveRelativeVelocity(A, B, s)]
  ]
}

describe('vector working: every line is true as written (Fix 4)', () => {
  for (const [label, s] of SETTINGS) {
    it(`every solver, a spread of vectors, ${label}`, () => {
      const faults: string[] = []
      for (let i = 0; i < SPREAD.length; i++) {
        const a = SPREAD[i]
        const b = SPREAD[(i * 7 + 3) % SPREAD.length]
        for (const [name, sol] of allSolutions(a, b, s)) {
          for (const f of solutionFalsehoods(sol, s)) faults.push(`${name} [${a.map((c) => c.toFixed(3)).join(', ')}]: ${f.claim} (a calculator gives ${f.got})`)
        }
      }
      for (let i = 0; i < SPREAD_3D.length; i++) {
        for (const [name, sol] of allSolutions(SPREAD_3D[i], SPREAD_3D[(i + 1) % SPREAD_3D.length], s)) {
          for (const f of solutionFalsehoods(sol, s)) faults.push(`${name} 3D #${i}: ${f.claim} (a calculator gives ${f.got})`)
        }
      }
      for (const [label, [a, b]] of Object.entries(FAR_SIZES)) {
        for (const [name, sol] of allSolutions(a, b, s)) {
          for (const f of solutionFalsehoods(sol, s)) faults.push(`${name} ${label}: ${f.claim} (a calculator gives ${f.got})`)
        }
      }
      for (const [name, make] of COUNTEREXAMPLES) {
        for (const f of solutionFalsehoods(make(s), s)) faults.push(`${name}: ${f.claim} (a calculator gives ${f.got})`)
      }
      expect(faults.slice(0, 12), `${faults.length} false lines`).toEqual([])
    })
  }

  it('two forces: every line true across a seeded spread, at every setting and at 2 s.f.', () => {
    const settings: [string, MeasureSettings][] = [
      ...SETTINGS,
      ['2 s.f., degrees', { decimals: 2, precisionMode: 'sf', unit: 'unit', unitPerSquare: 1, angleUnit: 'deg' }]
    ]
    const faults: string[] = []
    for (const [label, s] of settings) {
      for (const [F1, F2, th] of twoForcesSpread(400)) {
        for (const f of solutionFalsehoods(VS.solveTwoForces(F1, F2, th, 'N', s), s)) faults.push(`${label} ${F1}, ${F2}, ${th}°: ${f.claim} (a calculator gives ${f.got})`)
      }
    }
    expect(faults.slice(0, 12), `${faults.length} false lines`).toEqual([])
  })

  it('every solver writes its sentences the textbook way', () => {
    const faults = SPREAD.slice(0, 6).flatMap((a, i) => allSolutions(a, SPREAD[i + 1], SETTINGS[0][1]).flatMap(([name, sol]) => vectorWritingFaults(sol).map((f) => `${name}: ${f}`)))
    expect(faults).toEqual([])
  })
})

describe('vector working: the record examples, as a textbook writes them (Fix 4)', () => {
  const S2 = SETTINGS[0][1]
  const A = { name: 'A', v: [3, 4, 0] as V3 }
  const B = { name: 'B', v: fromPolar(5, toRad(120)) }
  const texOf = (sol: VS.Solution): string[] => sol.steps.map((s) => s.tex ?? '')
  const textOf = (sol: VS.Solution): string[] => sol.steps.map((s) => s.text ?? '')

  it('Components of F = 10∠30°: 10 × 0.866 = 8.66, not 10 × 0.87 = 8.66', () => {
    const lines = texOf(VS.solveComponents('F', 10, 30, '', S2))
    expect(lines).toContain('F_{x} = F\\cos\\theta = 10\\cos 30^\\circ = 10\\times 0.866 = 8.66')
    expect(lines).toContain('F_{y} = F\\sin\\theta = 10\\sin 30^\\circ = 10\\times 0.5 = 5')
  })

  it('Dot of 3i + 4j and 5∠120°: cos θ = 0.3928, θ = cos⁻¹(0.3928) = 66.87°', () => {
    const lines = texOf(VS.solveDot(A, B, S2))
    expect(lines).toContain('= (3)(-2.5) + (4)(4.33) = 9.82')
    expect(lines).toContain('\\cos\\theta = \\frac{\\vec{A}\\cdot\\vec{B}}{A\\,B} = \\frac{9.82}{5\\times5} = 0.3928')
    expect(lines).toContain('\\theta = \\cos^{-1}(0.3928) = 66.87^\\circ')
  })

  it('Law of cosines: sin α is written with the digits its sin⁻¹ needs, not 0.55', () => {
    const lines = texOf(VS.solveAdditionCosineLaw(A, B, 'R', S2))
    expect(lines).toContain('\\alpha = \\sin^{-1}(0.55099) = 33.43^\\circ')
    expect(lines.some((l) => l.includes('= 25 + 25 + 19.64 = 69.64'))).toBe(true)
    expect(lines).toContain('R = \\sqrt{69.64} = 8.35')
  })

  it('Vector-valued lines (review, round 1): each product and division gives the component written after it', () => {
    expect(texOf(VS.solveScalarMultiply(3, { name: 'A', v: [1.004, 1.004, 0] }, 'R', S2))[0]).toBe(
      '3\\,\\vec{A} = 3(1.004\\hat{i} + 1.004\\hat{j}) = 3.01\\hat{i} + 3.01\\hat{j}'
    )
    expect(texOf(VS.solveMagneticForce(-1.6e-19, [2.0081, 4.0125, 0], [0, 0.4064 / 2.0081, 1], S2))).toContain(
      '\\vec{F} = (-1.6\\times 10^{-19})\\,(4.013\\hat{i} - 2.008\\hat{j} + 0.406\\hat{k}) = \\left(-6.42\\hat{i} + 3.21\\hat{j} - 0.65\\hat{k}\\right)\\times 10^{-19}\\,\\text{N}'
    )
    const forces = texOf(VS.solveTwoForces(5.12, 7.5, 71, 'N', S2))
    expect(forces).toContain('R = \\sqrt{R_x^2 + R_y^2} = \\sqrt{7.562^2 + 7.091^2} = \\sqrt{107.47} = 10.37\\,\\text{N}')
    expect(forces).toContain(
      'R = \\sqrt{F_1^2 + F_2^2 + 2F_1F_2\\cos\\theta} = \\sqrt{5.12^2 + 7.5^2 + 2\\times 5.12\\times 7.5\\cos 71^\\circ} = \\sqrt{107.47} = 10.37\\,\\text{N}'
    )
    expect(forces).toContain('\\alpha = \\tan^{-1}\\left(\\frac{R_y}{R_x}\\right) = \\tan^{-1}\\left(\\frac{7.09}{7.56}\\right) = 43.16^\\circ')
    // A tiny vector's sum of squares is written, not rounded away to "√0".
    expect(texOf(VS.solveMagnitudeDirection({ name: 'A', v: [1e-7, 3e-7, 0] }, S2))).toContain(
      'A = \\sqrt{A_{x}^2 + A_{y}^2} = \\sqrt{(1\\times 10^{-7})^2 + (3\\times 10^{-7})^2} = \\sqrt{1\\times 10^{-13}} = 3.16\\times 10^{-7}'
    )
  })

  it('Drawing: no "1 1." numbering, every step numbered by the panel, a ruler reading not the calculation', () => {
    const sol = VS.solveAdditionGraphical([A, B], 'R', S2)
    const text = textOf(sol)
    expect(text[0]).toMatch(/^Choose a scale\./)
    expect(text.some((t) => /^\d+\./.test(t))).toBe(false)
    expect(texOf(sol)).toContain('R \\approx 16.7\\text{ squares} \\times 0.5 = 8.35,\\quad \\theta \\approx 87^\\circ')
  })

  it('Add all: no "Direction :" heading with nothing under it, no space before a colon', () => {
    const sol = VS.solveAddition([A, B], 'R', S2)
    const text = textOf(sol)
    expect(text).not.toContain('Direction :')
    expect(text.some((t) => /\s:/.test(t))).toBe(false)
    expect(text).toContain('Direction. First the reference angle, ignoring the signs:')
    expect(texOf(sol)).toContain('R = \\sqrt{R_{x}^2 + R_{y}^2} = \\sqrt{0.5^2 + 8.3301^2} = \\sqrt{69.64} = 8.35')
  })
})

describe('the one rule for working lines (format.ts)', () => {
  it('reads a number the way a calculator is given it', () => {
    expect(shownValue('8.66')).toBe(8.66)
    expect(shownValue('−2.5')).toBe(-2.5)
    expect(shownValue('66.87°')).toBe(66.87)
    expect(shownValue('1.6×10^-19')).toBeCloseTo(1.6e-19, 30)
    expect(shownValue('1.6\\times 10^{-19}')).toBeCloseTo(1.6e-19, 30)
  })

  it('adds digits in the same mode as the student chose', () => {
    expect(morePrecise({ decimals: 2, precisionMode: 'dp' as const }, 1)).toEqual({ decimals: 3, precisionMode: 'dp' })
    expect(morePrecise({ decimals: 3, precisionMode: 'sf' as const }, 2)).toEqual({ decimals: 5, precisionMode: 'sf' })
  })

  it('keeps the student precision when the line already holds', () => {
    const s = { decimals: 2, precisionMode: 'dp' as const }
    const { q, holds } = stepPrecision(s, () => true)
    expect(q).toEqual(s)
    expect(holds).toBe(true)
  })

  it('adds only the digits the line needs: 10 × cos 30° needs 0.866, not 0.87', () => {
    const s = { decimals: 2, precisionMode: 'dp' as const }
    const want = fmtPrecise(10 * Math.cos(Math.PI / 6), s)
    const { q, holds } = stepPrecision(s, (q) => fmtPrecise(10 * shownValue(fmtPrecise(Math.cos(Math.PI / 6), q)), s) === want)
    expect(holds).toBe(true)
    expect(fmtPrecise(Math.cos(Math.PI / 6), q)).toBe('0.866')
  })

  it('gives up with ≈ rather than claim a line it cannot make true', () => {
    const s = { decimals: 2, precisionMode: 'dp' as const }
    const { q, holds } = stepPrecision(s, () => false)
    expect(holds).toBe(false)
    expect(q.decimals).toBe(2 + STEP_GUARD_MAX)
    expect(stepEq(false)).toBe('\\approx')
    expect(stepEq(true)).toBe('=')
  })
})

describe('the line reader itself', () => {
  it('catches the three false lines in the record and passes their textbook versions', () => {
    expect(falseClaims('F_{x} = F\\cos\\theta = 10\\cos 30^\\circ = 10\\times 0.87 = 8.66')).toHaveLength(1)
    expect(falseClaims('F_{x} = F\\cos\\theta = 10\\cos 30^\\circ = 10\\times 0.866 = 8.66')).toHaveLength(0)
    expect(falseClaims('\\theta = \\cos^{-1}(0.39) = 66.87^\\circ')).toHaveLength(1)
    expect(falseClaims('\\theta = \\cos^{-1}(0.3928) = 66.87^\\circ')).toHaveLength(0)
    expect(falseClaims('\\alpha = \\sin^{-1}(0.55) = 33.43^\\circ')).toHaveLength(1)
    expect(falseClaims('\\alpha = \\sin^{-1}(0.55099) = 33.43^\\circ')).toHaveLength(0)
  })

  it('catches a step that changes nothing, and a wrong sum under a root', () => {
    expect(falseClaims('1 - 2i = 1 - 2i')).toHaveLength(1)
    expect(falseClaims('R = \\sqrt{0.5^2 + 8.33^2} = \\sqrt{69.64} = 8.35')).toHaveLength(1)
    expect(falseClaims('R = \\sqrt{0.5^2 + 8.3301^2} = \\sqrt{69.64} = 8.35')).toHaveLength(0)
  })

  it('reads vector results a component at a time, and a result that ends in a unit', () => {
    // The review's counterexamples, as the branch wrote them before this round.
    expect(falseClaims('3\\,\\vec{A} = 3(1\\hat{i} + 1\\hat{j}) = 3.01\\hat{i} + 3.01\\hat{j}')).toHaveLength(2)
    expect(falseClaims('3\\,\\vec{A} = 3(1.004\\hat{i} + 1.004\\hat{j}) = 3.01\\hat{i} + 3.01\\hat{j}')).toHaveLength(0)
    expect(falseClaims('\\hat{a} = \\frac{-0.56\\hat{i} + 4.36\\hat{j}}{4.4} = -0.12\\hat{i} + 0.99\\hat{j}')).toHaveLength(1)
    expect(
      falseClaims('\\vec{F} = (-1.6)\\,(4.01\\hat{i} - 2.01\\hat{j} + 0.41\\hat{k}) = -6.42\\hat{i} + 3.21\\hat{j} - 0.65\\hat{k}\\,\\text{N}')
    ).toHaveLength(2)
    expect(falseClaims('\\vec{F} = (1.6\\times 10^{-19})\\,(1\\hat{k}) = \\left(1.6\\hat{k}\\right)\\times 10^{-19}\\,\\text{N}')).toHaveLength(0)
    expect(falseClaims('\\vec{F} = (1.6\\times 10^{-19})\\,(1\\hat{k}) = \\left(1.7\\hat{k}\\right)\\times 10^{-19}\\,\\text{N}')).toHaveLength(1)
    expect(falseClaims('R = \\sqrt{R_x^2 + R_y^2} = \\sqrt{7.56^2 + 7.09^2} = 10.37\\,\\text{N}')).toHaveLength(1)
    expect(falseClaims('R = \\sqrt{R_x^2 + R_y^2} = \\sqrt{7.5618^2 + 7.0913^2} = 10.37\\,\\text{N}')).toHaveLength(0)
    // A missing component is a claim that it is 0.
    expect(falseClaims('2(1\\hat{i} + 1\\hat{j}) = 2\\hat{i}')).toHaveLength(1)
  })

  it('leaves symbolic segments alone', () => {
    expect(falseClaims('\\vec{A}\\cdot\\vec{B} = A_{x}B_{x} + A_{y}B_{y}')).toHaveLength(0)
    expect(falseClaims('A = 5,\\quad B = 5,\\quad \\theta = 66.87^\\circ')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Calculator working: every line equal to the one before it, set out the textbook way
// ---------------------------------------------------------------------------

type Cx = [number, number]

/** A LaTeX segment as a function of x (complex-valued, so a + bi lines are read too), or null when it is not plain algebra. */
export function algebra(seg: string): ((x: number) => Cx) | null {
  if (/\\text|\\begin|\\Rightarrow|\\overline|\\pm|\\mid|\\ne|\\in|\\sum|\\prod|[<>|]|\\ldots/.test(seg) || !seg.trim()) return null
  let src: string
  try {
    src = latexToMath(seg.replace(/\\left\[/g, '\\left(').replace(/\\right\]/g, '\\right)').replace(/\\div/g, '/'))
  } catch {
    return null
  }
  const words = src.match(/[A-Za-z]+/g) ?? []
  if (words.some((w) => !['x', 'i', 'sqrt'].includes(w))) return null
  let code: { evaluate: (scope: object) => unknown }
  try {
    // "5x(4x − 1)" is a product, not a call to a function named x: the app's own reader says so.
    code = math.compile(writeTimes(src))
  } catch {
    return null
  }
  const f = (x: number): Cx => {
    try {
      const v = code.evaluate({ x }) as unknown
      if (typeof v === 'number') return [v, 0]
      const c = v as { re?: number; im?: number }
      return typeof c.re === 'number' && typeof c.im === 'number' ? [c.re, c.im] : [NaN, NaN]
    } catch {
      return [NaN, NaN]
    }
  }
  // A segment that cannot be worked out at all is not read, rather than read as agreeing.
  return XS.some((x) => f(x).some(Number.isNaN)) ? null : f
}

const XS = [1.37, -0.61, 2.3]
const close = (a: Cx, b: Cx): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-7 * Math.max(1, Math.hypot(...a), Math.hypot(...b))
const sameFn = (f: (x: number) => Cx, g: (x: number) => Cx): boolean => XS.every((x) => close(f(x), g(x)) || f(x).some(Number.isNaN) || g(x).some(Number.isNaN))

/** The {…} group at `open` in a TeX string. */
const braceAt = (s: string, open: number): [string, number] => group(s, open)

/** Every \frac{num}{den} in a TeX string. */
function fractions(tex: string): { num: string; den: string }[] {
  const out: { num: string; den: string }[] = []
  const re = /\\d?frac\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tex))) {
    const [num, i] = braceAt(tex, m.index + m[0].length - 1)
    const [den] = braceAt(tex, i)
    out.push({ num, den })
  }
  return out
}

/** Rough writing in one piece of LaTeX: a doubled sign, a fraction in a fraction, a bracket as a whole denominator. */
export function texFaults(tex: string): string[] {
  const out: string[] = []
  const flat = tex.replace(/\\left|\\right|\\,|\\!/g, '')
  if (/[+-]\s*-(?!\s*&)/.test(flat.replace(/&\s*-/g, '&'))) out.push(`a doubled sign: ${tex}`)
  for (const f of fractions(tex)) {
    if (/\\d?frac/.test(f.num) || /\\d?frac/.test(f.den)) out.push(`a fraction inside a fraction: ${tex}`)
    if (/^\\left\((?:(?!\\right\)).)*\\right\)$/.test(f.den.trim())) out.push(`a whole denominator in brackets: ${tex}`)
  }
  return out
}

/** Rough writing in a sentence: numbering, a space before a colon, "3/10x". */
export function sentenceFaults(text: string): string[] {
  const out: string[] = []
  if (/^\d+\.\s/.test(text)) out.push(`numbers itself: ${text}`)
  if (/\s:/.test(text)) out.push(`a space before a colon: ${text}`)
  if (/\d\/\d+[a-z(]/.test(text)) out.push(`a fraction that reads as dividing by the letter: ${text}`)
  if (/[-−]\s*[-−]\d/.test(text) || /\+\s*[-−]\d/.test(text)) out.push(`a doubled sign: ${text}`)
  return out
}

/** Every false or rough line in a piece of Calculator working. */
export function workingFaults(w: Working): string[] {
  const out: string[] = []
  if (w.error) return [`error: ${w.error}`]
  for (const [k, m] of w.moves.entries()) {
    out.push(...sentenceFaults(m.head).map((f) => `move ${k + 1}: ${f}`))
    if (!m.tex) continue
    out.push(...texFaults(m.tex).map((f) => `move ${k + 1}: ${f}`))
    for (const st of statements(m.tex)) {
      const segs = splitTop(st, /^=/)
      for (let i = 1; i < segs.length; i++) {
        if (segs[i].replace(/\\dfrac/g, '\\frac').replace(/\s+/g, '') === segs[i - 1].replace(/\\dfrac/g, '\\frac').replace(/\s+/g, '')) {
          out.push(`move ${k + 1}: a step that changes nothing: ${st}`)
        }
      }
      const fs = segs.map(algebra)
      // "3x + 4 = 10" and "x = 6/3 = 2" are equations: a side with x in it is not claimed to equal
      // a number for every x. Only sides of the same kind are held to be equal.
      const hasX = segs.map((g) => /x/.test(g.replace(/\\[a-zA-Z]+/g, '')))
      for (let i = 1; i < segs.length; i++) {
        const f = fs[i]
        const g = fs.slice(0, i).find((h, j) => h && hasX[j] === hasX[i])
        if (f && g && !sameFn(f, g)) out.push(`move ${k + 1}: not equal to what is before it: ${segs[i]}  (in ${st})`)
      }
    }
  }
  for (const a of w.answers) out.push(...texFaults(a.tex).map((f) => `answer ${a.label}: ${f}`))
  if (w.check) out.push(...sentenceFaults(texToPlain(w.check)).map((f) => `check: ${f}`))
  return out
}

/** Lines that stand for the whole expression (no "=") must still be worth the question. */
export function chainFaults(w: Working, question: string): string[] {
  const q = algebra(question)
  if (!q) return [`could not read the question ${question}`]
  const out: string[] = []
  w.moves.forEach((m, k) => {
    if (!m.tex || /=/.test(m.tex)) return
    const f = algebra(m.tex)
    if (f && !sameFn(f, q)) out.push(`move ${k + 1} is not worth the question: ${m.tex}`)
  })
  return out
}

// Integrate and Differentiate are worked by SymPy, not runPure: their lines are held to the same
// rules below, from the worker's recorded replies ('the calculus jobs' describe).
const PURE_SPREAD: Record<Exclude<JobId, 'integrate' | 'differentiate'>, string[]> = {
  factor: [
    '2x^2 + 0.3x - 0.2',
    '6x^2 + 7x - 3',
    '-x^2 + 5x - 6',
    '4x^2 - 9',
    '0.5x^2 - 2',
    'x^3 - 6x^2 + 11x - 6',
    '2x^3 - x^2 - 8x + 4',
    'x^2 + 6x + 9',
    'x^3 + 8',
    '3x^2 - 12x',
    '0.2x^2 - 0.2x - 2.4',
    'x^4 - 5x^2 + 4',
    'x^4 + 4'
  ],
  expand: ['(2x + 3)(3x - 1)', '(x - 2)^3', '(0.5x + 1)(2x - 4)', '-(x - 1)(x + 3)', '(x + 1)(x^2 - x + 1)'],
  divide: [
    '(2x^3 + 3x^2 - x + 5)/(2x + 1)',
    '(x^3 - 1)/(2x - 1)',
    '(x^3 - 6x^2 + 11x - 6)/(x - 1)',
    '(x^4 + 1)/(x^2 + 1)',
    '(3x^2 + 2)/(3x - 1)',
    '(x^2 - 5x + 6)/(x + 2)',
    '(x^3 + 2x - 7)/(x - 3)'
  ],
  partial: [
    '(3x + 5)/((x - 1)(x + 2))',
    '1/(x^2(x + 1))',
    '(2x + 1)/((x + 1)^2)',
    '(x^2 + 1)/((x - 1)(x^2 + 4))',
    '5/((x - 2)(x + 3))',
    'x^3/((x - 1)(x + 1))',
    '1/((x - 1)(x - 2)(x - 3))',
    '(x + 3)/(x^2(x - 1)^2)',
    '(4x - 1)/((2x + 1)(x - 3))'
  ],
  complex: ['(3 + 4i)/(1 - 2i)', '(2 + i)(3 - 2i)', '(1 + i)^2', '5/(2 - i)', '(4 - 3i) - (1 + 2i)', '(1 + 2i)/(3 + 4i)', '(2 - 3i)/i'],
  solve: ['x^2 + 4x + 13 = 0', '2x^2 - 3x - 2 = 0', 'x^2 - 5 = 0', '3x + 4 = 10', 'x^2 + 2x + 1 = 0', 'x^2 - x + 1 = 0'],
  hcf: ['12, 18, 30', '84, 126', '7, 13', '6, 9'],
  lcm: ['12, 18, 30', '84, 126', '4, 6', '7, 7', '1, 1'],
  primes: ['360', '1001', '97'],
  factorComplex: ['x^4 - 16', 'x^2 + 4', 'x^2 + 2x + 5', 'x^3 + 1', 'x^4 + 1'],
  normal: [
    'P(Z < 1.96)',
    'P(Z > 1.645)',
    'P(-1 < Z < 1)',
    'P(Z < -2.33)',
    'invnorm(0.975)',
    'invnorm(0.05)',
    'P(Z > z) = 0.05',
    'P(-z < Z < z) = 0.9',
    'P(X < 65), X ~ N(50, 10^2)',
    'P(X > 65), X ~ N(50, 100)',
    'P(45 < X < 60), X ~ N(50, 5^2)',
    'P(X > x) = 0.1, X ~ N(50, 10^2)'
  ],
  // Trig lines are not read as numbers here (tests/trigSteps.test.ts checks every line at five
  // angles); what this list holds them to is the writing: no doubled sign, no fraction inside a
  // fraction, no bracketed whole denominator, no step that changes nothing.
  trigidentity: [
    'sec(x) - cos(x) = sin(x)tan(x)',
    '1/(1 + sin x) + 1/(1 - sin x) = 2 sec^2 x',
    '(1 - sin x)/(1 + sin x) = (sec x - tan x)^2',
    '(1 - cos x)/sin x = tan(x/2)',
    'cos 3x = 4 cos^3 x - 3 cos x',
    'sin x/(1 + cos x) + (1 + cos x)/sin x = 2 cosec x',
    '(sin 5x + sin 3x)/(cos 5x + cos 3x) = tan 4x',
    'cot x + tan x = sec x cosec x',
    '(1 - cos 2x)/sin 2x = tan x'
  ]
}

describe('Calculator working: every line equal to the last, set out the textbook way (Fix 4)', () => {
  for (const job of Object.keys(PURE_SPREAD) as (keyof typeof PURE_SPREAD)[]) {
    it(`${job}: a spread of questions`, () => {
      const faults: string[] = []
      for (const src of PURE_SPREAD[job]) {
        const w = runPure(job, src)
        faults.push(...workingFaults(w).map((f) => `${src}: ${f}`))
        if (job === 'factor' || job === 'expand') faults.push(...chainFaults(w, w.input).map((f) => `${src}: ${f}`))
      }
      expect(faults).toEqual([])
    })
  }
})

describe('Calculator working: the record examples, as a textbook writes them (Fix 4)', () => {
  const texes = (w: Working): string[] => w.moves.map((m) => m.tex ?? '')

  it('Factorise 2x² + 0.3x − 0.2: the 1/10 stays on every line', () => {
    const w = runPure('factor', '2x^2 + 0.3x - 0.2')
    const t = texes(w)
    expect(t).toContain(String.raw`\frac{1}{10}\left(20x^{2} - 5x + 8x - 2\right)`)
    expect(t).toContain(String.raw`\frac{1}{10}\left[5x\left(4x - 1\right) + 2\left(4x - 1\right)\right]`)
    expect(t).toContain(String.raw`\frac{1}{10}\left(4x - 1\right)\left(5x + 2\right)`)
    expect(w.moves[1].head).toContain('20 × (-2) = -40')
    // The check reads (3/10)x, which is not 3 ÷ 10x.
    expect(texToPlain(w.check ?? '')).toContain('2x² + (3/10)x - 1/5')
  })

  it('Factorise with i: no second copy of the split, and the sentence only promises a number when there is one (review, round 1)', () => {
    const one = runPure('factorComplex', 'x^2 + 2x + 5')
    const eqs = one.moves.map((m) => m.tex ?? '').filter((t) => t.includes('2i'))
    // The factorised form appears once in the working (plus the check, which multiplies back).
    expect(eqs.filter((t) => /= \\left\(x \+ 1 - 2i\\right\)\\left\(x \+ 1 \+ 2i\\right\)$/.test(t))).toHaveLength(1)
    expect(one.moves.some((m) => /number at the front/.test(m.head))).toBe(false)
    const quartic = runPure('factorComplex', 'x^4 - 16')
    expect(quartic.moves.map((m) => m.head)).toContain('Put the factors together.')
    const scaled = runPure('factorComplex', '2x^2 + 8')
    expect(scaled.moves.map((m) => m.head)).toContain('Put the factors together, with the number at the front.')
  })

  it('HCF(6, 9) and LCM(7, 7): the one prime kept is the answer, with no "3 = 3" after it (review, round 1)', () => {
    const hcf = runPure('hcf', '6, 9')
    const last = hcf.moves[hcf.moves.length - 1]
    expect(last.tex).toBe(String.raw`\text{HCF} = 3`)
    expect(last.head).toBe('That one prime is the HCF.')
    expect(runPure('lcm', '7, 7').moves.map((m) => m.tex)).toContain(String.raw`\text{LCM} = 7`)
    // A product with more than one factor is still worked out.
    expect(runPure('hcf', '12, 18').moves.map((m) => m.tex)).toContain(String.raw`\text{HCF} = 2 \times 3 = 6`)
  })

  it('Divide (2x³ + 3x² − x + 5) by (2x + 1): − (−1)(2x + 1), not − −1(2x + 1)', () => {
    const t = texes(runPure('divide', '(2x^3 + 3x^2 - x + 5)/(2x + 1)'))
    expect(t).toContain(String.raw`\left(-2x + 5\right) - \left(-1\right)\left(2x + 1\right) = 6`)
  })

  it('Divide (x³ − 1) by (2x − 1): − 7/8 not + −7/8, and one fraction, not a fraction in a fraction', () => {
    const w = runPure('divide', '(x^3 - 1)/(2x - 1)')
    const t = texes(w)
    expect(t).toContain(String.raw`\frac{1}{2}x^{2} \div 2x = \frac{1}{4}x`)
    expect(t).toContain(String.raw`\left(x^{3} - 1\right) = \left(2x - 1\right)\left(\frac{1}{2}x^{2} + \frac{1}{4}x + \frac{1}{8}\right) - \frac{7}{8}`)
    expect(w.answers.find((a) => a.label === 'Altogether')?.tex).toBe(String.raw`\frac{1}{2}x^{2} + \frac{1}{4}x + \frac{1}{8} - \dfrac{7}{8\left(2x - 1\right)}`)
    expect(texToPlain(w.check ?? '')).toBe('x³ - 1/8 - 7/8 = x³ - 1')
  })

  it('Partial fractions (3x + 5)/((x − 1)(x + 2)): the substitution is shown and no fraction sits in a fraction', () => {
    const w = runPure('partial', '(3x + 5)/((x - 1)(x + 2))')
    const t = texes(w)
    expect(t).toContain(String.raw`3\left(1\right) + 5 = A\left(1 + 2\right) \;\Rightarrow\; 8 = 3A \;\Rightarrow\; A = \frac{8}{3}`)
    expect(t).toContain(String.raw`3\left(-2\right) + 5 = B\left(-2 - 1\right) \;\Rightarrow\; -1 = -3B \;\Rightarrow\; B = \frac{1}{3}`)
    expect(t).toContain(String.raw`3x + 5 = A\left(x + 2\right) + B\left(x - 1\right)`)
    expect(w.answers[0].tex).toBe(String.raw`\dfrac{8}{3\left(x - 1\right)} + \dfrac{1}{3\left(x + 2\right)}`)
  })

  it('Partial fractions 1/(x²(x + 1)): a repeated factor gets one fraction for each power, as the sentence says', () => {
    const w = runPure('partial', '1/(x^2(x + 1))')
    expect(texes(w)).toContain(String.raw`\dfrac{1}{x^{3} + x^{2}} = \dfrac{A}{x} + \dfrac{B}{x^{2}} + \dfrac{C}{x + 1}`)
    expect(w.answers[0].tex).toBe(String.raw`-\dfrac{1}{x} + \dfrac{1}{x^{2}} + \dfrac{1}{x + 1}`)
    expect(w.checked).toBe('ok')
  })

  it('Complex (3 + 4i)/(1 − 2i): no "1 − 2i = 1 − 2i", and the top is multiplied out in full', () => {
    const w = runPure('complex', '(3 + 4i)/(1 - 2i)')
    const t = texes(w)
    expect(t.some((x) => x.startsWith('1 - 2i = '))).toBe(false)
    expect(t).toContain(String.raw`\left(3 + 4i\right)\left(1 + 2i\right) = 3 + 6i + 4i + 8i^{2} = 3 + 10i - 8 = -5 + 10i`)
    expect(t).toContain(String.raw`\dfrac{-5 + 10i}{5} = -1 + 2i`)
    expect(t).toContain(String.raw`|z| = \sqrt{\left(-1\right)^2 + 2^2} = \sqrt{1 + 4} = \sqrt{5}`)
  })
})

describe('the Calculator line reader itself', () => {
  const working = (tex: string, head = 'A step.'): Working => ({ title: 't', input: 'x', moves: [{ head, tex }], answers: [] })

  it('catches every rough line in the record', () => {
    expect(workingFaults(working(String.raw`\left(-2x + 5\right) - -1\left(2x + 1\right) = 6`))).not.toEqual([])
    expect(workingFaults(working(String.raw`\left(x^{3} - 1\right) = \left(2x - 1\right)\left(\frac{1}{2}x^{2}\right) + -\frac{7}{8}`))).not.toEqual([])
    expect(workingFaults(working(String.raw`\dfrac{\frac{8}{3}}{\left(x - 1\right)}`))).not.toEqual([])
    expect(workingFaults(working(String.raw`A = \dfrac{8}{3} = \frac{8}{3}`))).not.toEqual([])
    expect(workingFaults(working('1 - 2i = 1 - 2i'))).not.toEqual([])
    expect(workingFaults(working('x', '1. Choose a scale.'))).not.toEqual([])
    expect(workingFaults(working('x', 'Magnitude :'))).not.toEqual([])
    expect(sentenceFaults('Multiplying back out gives 2x² + 3/10x - 1/5')).not.toEqual([])
  })

  it('catches a line that is ten times the one before it', () => {
    const w: Working = {
      title: 'Factorise',
      input: String.raw`2x^{2} + \frac{3}{10}x - \frac{1}{5}`,
      moves: [
        { head: 'a', tex: String.raw`\frac{1}{10}\left(20x^{2} - 5x + 8x - 2\right)` },
        { head: 'b', tex: String.raw`5x\left(4x - 1\right) + 2\left(4x - 1\right)` }
      ],
      answers: []
    }
    expect(chainFaults(w, w.input)).toHaveLength(1)
  })

  it('passes the textbook versions', () => {
    expect(workingFaults(working(String.raw`\left(-2x + 5\right) - \left(-1\right)\left(2x + 1\right) = 6`))).toEqual([])
    expect(workingFaults(working(String.raw`x = \dfrac{6}{3} = 2`))).toEqual([])
    expect(workingFaults(working(String.raw`\left(3 + 4i\right)\left(1 + 2i\right) = 3 + 6i + 4i + 8i^{2} = -5 + 10i`))).toEqual([])
    expect(workingFaults(working(String.raw`\left(3 + 4i\right)\left(1 + 2i\right) = -5 + 11i`))).not.toEqual([])
  })
})

describe('Calculator working: the calculus jobs, from the worker’s recorded replies (Fix 4)', () => {
  // Integrate and Differentiate are worked by SymPy, so their lines come from tests/fixtures/calculus
  // (math/pure/calculusSteps.ts sets them out) rather than runPure; the same rules hold them.
  const dir = repoPath('tests', 'fixtures', 'calculus')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    it(file.replace(/\.json$/, ''), () => {
      const f = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')) as { op: string; payload: { expr: string }; result: unknown }
      const w = f.op === 'integral_steps' ? integralWorking(f.result as IntegralTree, f.payload.expr) : derivativeWorking(f.result as DerivTree, f.payload.expr)
      // A refusal (∫ xˣ dx has no formula; ∫₋₁¹ 1/x dx has no value) is a sentence, not working to check.
      expect(w.error ? [] : workingFaults(w)).toEqual([])
    })
  }
})
