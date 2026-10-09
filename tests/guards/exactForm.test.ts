// Guard (CLEANUP-PLAN.md CW1): P-GEO's exact-form sweep (`09-P-GEO\.crew\h1-sweep`) made permanent.
// Every string the shape formula report writes, for 15 settings × 18 polygons and 5 circles, and
// answerTex called directly for every kind of measure: KaTeX reads it, no power is misread (KaTeX
// raises one token after ^, so 10^-7 raises the minus alone), no e-notation, and an answer's exact
// form (n, \frac{n}{d}, with \pi or \sqrt{r}) is the true value to within 10⁻¹⁵ — an "exact" fraction
// that is only close once read 2.79×10¹⁰ as \frac{…}{…} (P-GEO H1, INBOX N37). All clean on
// 2026-10-09. (The crew sweep's grad setting is left out: the app has no grads any more.)

import katex from 'katex'
import { describe, expect, it } from 'vitest'
import { answerTex, circleReport, polygonReport } from '../../src/renderer/src/math/shapeFormulas'
import { measureValue, setNotation, texMeasure, texUnit, type MeasureKind, type MeasureSettings } from '../../src/renderer/src/math/format'

interface Row {
  key: string
  tex: string
  /** Answers only: the true value in the student's unit, its TeX unit and the decimal answer. */
  real?: number
  unit?: string
  shown?: string
}

type P3 = [number, number, number]
const P = (...xy: number[]): P3[] => {
  const out: P3[] = []
  for (let i = 0; i < xy.length; i += 2) out.push([xy[i], xy[i + 1], 0])
  return out
}
const regular = (n: number, r: number): P3[] => Array.from({ length: n }, (_, k) => [r * Math.cos((2 * Math.PI * k) / n), r * Math.sin((2 * Math.PI * k) / n), 0] as P3)
const NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

const base: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'cm', unitPerSquare: 1, angleUnit: 'deg' }
/** Ordinary settings first, then "1 square =" scales that push numbers into powers of ten. */
const SETTINGS: [string, MeasureSettings][] = [
  ['dp2', base],
  ['dp0', { ...base, decimals: 0 }],
  ['dp4', { ...base, decimals: 4 }],
  ['sf3', { ...base, precisionMode: 'sf', decimals: 3 }],
  ['sf2', { ...base, precisionMode: 'sf', decimals: 2 }],
  ['m-half', { ...base, unit: 'm', unitPerSquare: 0.5 }],
  ['mm-10', { ...base, unit: 'mm', unitPerSquare: 10 }],
  ['rad', { ...base, angleUnit: 'rad' }],
  ['km-1000-dp2', { ...base, unit: 'km', unitPerSquare: 1000 }],
  ['ups-1e4-sf3', { ...base, precisionMode: 'sf', decimals: 3, unitPerSquare: 1e4 }],
  ['ups-1e9-sf3', { ...base, precisionMode: 'sf', decimals: 3, unitPerSquare: 1e9 }],
  ['ups-1e9-dp2', { ...base, unitPerSquare: 1e9 }],
  ['ups-1e12-sf3', { ...base, precisionMode: 'sf', decimals: 3, unitPerSquare: 1e12 }],
  ['ups-1e-7-sf3', { ...base, precisionMode: 'sf', decimals: 3, unitPerSquare: 1e-7 }],
  ['ups-1e-5-dp2', { ...base, unitPerSquare: 1e-5 }]
]
const SHAPES: [string, P3[]][] = [
  ['square', P(0, 0, 4, 0, 4, 4, 0, 4)],
  ['rectangle', P(0, 0, 4, 0, 4, 3, 0, 3)],
  ['parallelogram', P(0, 0, 4, 0, 5, 2, 1, 2)],
  ['rhombus', P(0, 0, 5, 0, 8, 4, 3, 4)],
  ['trapezium', P(0, 0, 6, 0, 4, 2, 1, 2)],
  ['iso-trapezium', P(0, 0, 6, 0, 5, 2, 1, 2)],
  ['kite', P(0, 0, 2, -1, 5, 0, 2, 1)],
  ['equilateral', P(0, 0, 4, 0, 2, 2 * Math.sqrt(3))],
  ['equilateral-odd', P(0, 0, 3, 0, 1.5, 1.5 * Math.sqrt(3))],
  ['right-isosceles', P(0, 0, 3, 0, 0, 3)],
  ['right', P(0, 0, 4, 0, 0, 3)],
  ['isosceles', P(0, 0, 4, 0, 2, 5)],
  ['scalene', P(0, 0, 4, 0, 1, 3)],
  ['pentagon', regular(5, 2)],
  ['hexagon', regular(6, 3)],
  ['L-shape', P(0, 0, 4, 0, 4, 2, 2, 2, 2, 4, 0, 4)],
  ['quad', P(0, 0, 5, 1, 4, 4, 1, 3)],
  ['neg-coords', P(-3, -2, 2, -1, 3, 2, -1, 4, -4, 1)]
]
const RADII = [2, 1.5, Math.SQRT2, 1 / 3, 7]
const KINDS: MeasureKind[] = ['length', 'area', 'volume', 'angle', 'direction', 'number']
/** World values for the direct answerTex calls (an angle's world value is in radians). */
const VALUES = [5.5, 3 * Math.SQRT2, 1 / 3, 2 / 3, Math.PI, 4 * Math.PI, 0.1, 12, 0, 100 / 3, (100 / 3) * (Math.PI / 180), Math.PI / 3, 1e-3 / 3]

function sweep(): Row[] {
  const rows: Row[] = []
  const answer = (key: string, v: number, kind: MeasureKind, s: MeasureSettings, piFactor = false): void => {
    rows.push({ key, tex: answerTex(v, kind, s, piFactor), real: measureValue(v, kind, s), unit: texUnit(kind, s), shown: texMeasure(v, kind, s) })
  }
  try {
    for (const [sn, s] of SETTINGS) {
      for (const [shn, pts] of SHAPES) {
        const r = polygonReport(pts, NAMES.slice(0, pts.length), s)
        for (const row of r.rows) {
          rows.push({ key: `${sn}|${shn}|${row.title}|general`, tex: row.general })
          rows.push({ key: `${sn}|${shn}|${row.title}|sub`, tex: row.substitution })
          answer(`${sn}|${shn}|${row.title}|answer`, row.value, row.kind, s)
          for (const y of row.symbols) answer(`${sn}|${shn}|${row.title}|sym ${y.sym}`, y.value, y.kind, s)
        }
      }
      for (const r of RADII) {
        const c = circleReport([0, 0, 0], r, 'O', s)
        for (const row of c.rows) {
          rows.push({ key: `${sn}|circle r=${r}|${row.title}|sub`, tex: row.substitution })
          // ShapeInfo asks for a circle's rows with their π factor.
          answer(`${sn}|circle r=${r}|${row.title}|answer`, row.value, row.kind, s, true)
          for (const y of row.symbols) answer(`${sn}|circle r=${r}|${row.title}|sym ${y.sym}`, y.value, y.kind, s)
        }
      }
      for (const kind of KINDS) {
        for (const v of VALUES) {
          answer(`${sn}|answerTex ${kind} ${v}`, v, kind, s)
          answer(`${sn}|answerTex ${kind} ${v} pi`, v, kind, s, true)
        }
      }
      // A bearing is words; its "real" is the angle from east the exact form would be of.
      setNotation({ direction: 'bearing' })
      for (const v of [Math.PI / 6, (100 / 3) * (Math.PI / 180), 1]) answer(`${sn}|bearing ${v}`, v, 'direction', s)
      setNotation({ direction: 'standard' })
    }
  } finally {
    setNotation({ direction: 'standard' })
  }
  return rows
}

/** KaTeX raises only the one token after ^: 10^-7 raises the minus, 10^12 the 1; 10^9^2 is a double superscript. */
const MISREAD_POWER = /\^(?:-|\d{2}|\d\^|\{[^}]*\}\^)/
const E_NOTATION = /\de[+-]?\d/
/** Further from the true value than this, relatively, an exact form is false. */
const FALSE_EXACT = 1e-15

/** The value of an exact form as exactForm / answerTex write it (n, \frac{n}{d}, with \pi or \sqrt{r}), else null. */
function exactValue(t: string): number | null {
  const times = (v: number, inner: string | undefined, root: string | undefined, outer: string | undefined): number => {
    if (inner === '\\pi') v *= Math.PI
    else if (inner) v *= Math.sqrt(Number(root))
    return outer ? v * Math.PI : v
  }
  let m = /^(-)?\\frac\{(\d*)(\\pi|\\sqrt\{(\d+)\})?\}\{(\d+)\}(\\pi)?$/.exec(t)
  if (m && (m[2] || m[3])) return (m[1] ? -1 : 1) * times((m[2] ? Number(m[2]) : 1) / Number(m[5]), m[3], m[4], m[6])
  m = /^(-)?(\d+(?:\.\d+)?(?:e[+-]\d+)?)?(\\pi|\\sqrt\{(\d+)\})?(\\pi)?$/.exec(t)
  if (m && (m[2] || m[3])) return (m[1] ? -1 : 1) * times(m[2] ? Number(m[2]) : 1, m[3], m[4], m[5])
  return null
}

/** What is wrong with one string, in the sweep's words; empty when nothing is. */
function problemsOf(row: Row): string[] {
  const problems: string[] = []
  try {
    katex.renderToString(row.tex, { throwOnError: true, strict: 'ignore' })
  } catch (e) {
    problems.push(`KaTeX cannot read it: ${String((e as Error).message).split('\n')[0].slice(0, 80)}`)
  }
  if (MISREAD_POWER.test(row.tex)) problems.push('a power KaTeX misreads')
  if (E_NOTATION.test(row.tex)) problems.push('e-notation')
  if (row.unit === undefined) return problems
  const sides = row.tex.split(' \\approx ')
  if (sides.length > 2) problems.push('more than one ≈')
  else if (sides[sides.length - 1] !== row.shown) problems.push('the last side is not the decimal answer')
  else if (sides.length === 2) {
    const left = sides[0]
    const u = row.unit
    if (u && left.indexOf(u) !== left.length - u.length) problems.push('the unit is missing, repeated or not at the end of the exact form')
    else {
      const core = u ? left.slice(0, left.length - u.length) : left
      const v = exactValue(core)
      if (v === null) problems.push(`the exact form does not parse: ${core}`)
      else {
        const rel = Math.abs(v - (row.real as number)) / Math.max(Math.abs(row.real as number), 1e-300)
        if (rel > FALSE_EXACT) problems.push(`a false exact form, ${rel.toExponential(2)} out: ${core} for ${row.real}`)
      }
    }
  }
  return problems
}

describe('guard: the shape report writes true exact forms KaTeX can read', () => {
  const rows = sweep()

  it('covers the whole grid', () => {
    expect(rows.length).toBeGreaterThan(6500)
    expect(rows.filter((r) => r.unit !== undefined && r.tex.includes(' \\approx ')).length).toBeGreaterThan(1000)
  })

  it('every string is clean', () => {
    const found = rows.flatMap((r) => problemsOf(r).map((p) => `${r.key}: ${p} — ${r.tex}`))
    expect(found.slice(0, 20)).toEqual([])
  })

  it('catches what it is for', () => {
    expect(problemsOf({ key: 'k', tex: '10^-7' })).toContain('a power KaTeX misreads')
    expect(problemsOf({ key: 'k', tex: '1e-7' })).toContain('e-notation')
    const close = { key: 'k', tex: '\\frac{1}{3}\\,\\text{cm} \\approx 0.33\\,\\text{cm}', real: 0.3333334, unit: '\\,\\text{cm}', shown: '0.33\\,\\text{cm}' }
    expect(problemsOf(close).join()).toMatch(/false exact form/)
  })
})
