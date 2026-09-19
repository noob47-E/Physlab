// Algebraic formulas for shape measurements: general formula → substitution → answer (with units),
// plus what to highlight in the drawing when the student hovers a formula or a symbol.

import { add, dist, mid, normalize, scale, sub, type V3 } from './vec'
import { footOfPerpendicular, polygonArea, centroid } from './geometry'
import { classifyPolygon, type ShapeClass } from './shapes'
import { measureValue, texMeasure, fmtPrecise, type MeasureKind, type MeasureSettings } from './format'
import { exactForm } from '../calc/engine'

export interface Highlight {
  /** Region to shade with hatch lines. */
  region?: V3[]
  /** Lines to highlight (sides, diagonals). */
  segments?: [V3, V3][]
  /** Dashed helper lines (heights, apothems). */
  dashed?: [V3, V3][]
}

export interface FormulaSymbol {
  sym: string
  /** e.g. "AB" */
  label: string
  value: number
  kind: MeasureKind
  highlight: Highlight
}

export interface FormulaRow {
  title: string
  general: string
  symbols: FormulaSymbol[]
  substitution: string
  value: number
  kind: MeasureKind
  highlight: Highlight
}

export interface ShapeReport {
  name: string
  cls?: ShapeClass
  rows: FormulaRow[]
  note?: string
}

const circlePolygon = (c: V3, r: number, n = 96): V3[] => Array.from({ length: n }, (_, k) => [c[0] + r * Math.cos((2 * Math.PI * k) / n), c[1] + r * Math.sin((2 * Math.PI * k) / n), c[2]])

/** Number in the chosen real unit, without the unit (for substitutions). */
function num(v: number, kind: MeasureKind, s: MeasureSettings): string {
  return fmtPrecise(measureValue(v, kind, s), s).replace('−', '-')
}

/** Answer with units, plus the exact form (fraction, √, π) when it is a clean number. */
export function answerTex(v: number, kind: MeasureKind, s: MeasureSettings, piFactor = false): string {
  const real = measureValue(v, kind, s)
  const withUnit = texMeasure(v, kind, s)
  const unit = withUnit.replace(/^[^\\]*?(\\,.*)?$/, '$1')
  if (piFactor) {
    const k = real / Math.PI
    const ex = exactForm(k)
    if (ex && !/sqrt|pi/.test(ex)) return `${ex === '1' ? '' : ex}\\pi${unit} \\approx ${withUnit}`
  }
  // Exact forms only help when the decimal is rounded (⅓, √2, π); 5.5 stays 5.5.
  const roundedExactly = Math.abs(real - Number(real.toFixed(Math.min(s.decimals, 10)))) < 1e-9
  if (roundedExactly) return withUnit
  const ex = exactForm(real)
  if (ex && ex !== fmtPrecise(real, s) && !/^-?\d+$/.test(ex) && ex.length < 24) return `${ex}${unit} \\approx ${withUnit}`
  return withUnit
}

const seg = (a: V3, b: V3): [V3, V3] => [a, b]

export function polygonReport(input: V3[], names: string[], s: MeasureSettings): ShapeReport {
  const pts = input
  const n = pts.length
  const cls = classifyPolygon(pts)
  const L = (i: number, j: number) => dist(pts[i], pts[j])
  const nm = (i: number, j: number) => `${names[i] ?? '?'}${names[j] ?? '?'}`
  const region = pts
  const sym = (symName: string, i: number, j: number): FormulaSymbol => ({ sym: symName, label: nm(i, j), value: L(i, j), kind: 'length', highlight: { segments: [seg(pts[i], pts[j])] } })
  const area = polygonArea(pts)
  const perimeter = pts.reduce((acc, p, i) => acc + dist(p, pts[(i + 1) % n]), 0)
  const rows: FormulaRow[] = []
  const allSides: [V3, V3][] = pts.map((p, i) => seg(p, pts[(i + 1) % n]))
  const perimeterRow = (general: string, symbols: FormulaSymbol[], substitution: string): FormulaRow => ({
    title: 'Perimeter',
    general,
    symbols,
    substitution,
    value: perimeter,
    kind: 'length',
    highlight: { segments: allSides }
  })

  switch (cls.kind) {
    case 'square': {
      const sSym = sym('s', 0, 1)
      rows.push({ title: 'Area', general: 'A = s^2', symbols: [sSym], substitution: `A = (${num(sSym.value, 'length', s)})^2`, value: area, kind: 'area', highlight: { region } })
      rows.push(perimeterRow('P = 4s', [sSym], `P = 4 \\times ${num(sSym.value, 'length', s)}`))
      const d = { sym: 'd', label: nm(0, 2), value: L(0, 2), kind: 'length' as const, highlight: { segments: [seg(pts[0], pts[2])] } }
      rows.push({ title: 'Diagonal', general: 'd = s\\sqrt{2}', symbols: [sSym, d], substitution: `d = ${num(sSym.value, 'length', s)}\\sqrt{2}`, value: d.value, kind: 'length', highlight: d.highlight })
      break
    }
    case 'rectangle': {
      const l = sym('l', 0, 1)
      const w = sym('w', 1, 2)
      rows.push({ title: 'Area', general: 'A = l \\times w', symbols: [l, w], substitution: `A = ${num(l.value, 'length', s)} \\times ${num(w.value, 'length', s)}`, value: area, kind: 'area', highlight: { region } })
      rows.push(perimeterRow('P = 2(l + w)', [l, w], `P = 2(${num(l.value, 'length', s)} + ${num(w.value, 'length', s)})`))
      const d = { sym: 'd', label: nm(0, 2), value: L(0, 2), kind: 'length' as const, highlight: { segments: [seg(pts[0], pts[2])] } }
      rows.push({ title: 'Diagonal', general: 'd = \\sqrt{l^2 + w^2}', symbols: [l, w, d], substitution: `d = \\sqrt{${num(l.value, 'length', s)}^2 + ${num(w.value, 'length', s)}^2}`, value: d.value, kind: 'length', highlight: d.highlight })
      break
    }
    case 'parallelogram':
    case 'rhombus': {
      const b = sym('b', 0, 1)
      const foot = footOfPerpendicular(pts[3], { kind: 'line', p: pts[0], d: sub(pts[1], pts[0]) })
      const h: FormulaSymbol = { sym: 'h', label: 'height', value: dist(pts[3], foot), kind: 'length', highlight: { dashed: [seg(pts[3], foot)] } }
      rows.push({ title: 'Area', general: 'A = b \\times h', symbols: [b, h], substitution: `A = ${num(b.value, 'length', s)} \\times ${num(h.value, 'length', s)}`, value: area, kind: 'area', highlight: { region, dashed: h.highlight.dashed } })
      if (cls.kind === 'rhombus') {
        const d1: FormulaSymbol = { sym: 'd_1', label: nm(0, 2), value: L(0, 2), kind: 'length', highlight: { segments: [seg(pts[0], pts[2])] } }
        const d2: FormulaSymbol = { sym: 'd_2', label: nm(1, 3), value: L(1, 3), kind: 'length', highlight: { segments: [seg(pts[1], pts[3])] } }
        rows.push({ title: 'Area (diagonals)', general: 'A = \\tfrac{1}{2} d_1 d_2', symbols: [d1, d2], substitution: `A = \\tfrac{1}{2} \\times ${num(d1.value, 'length', s)} \\times ${num(d2.value, 'length', s)}`, value: area, kind: 'area', highlight: { region, segments: [seg(pts[0], pts[2]), seg(pts[1], pts[3])] } })
        rows.push(perimeterRow('P = 4a', [sym('a', 0, 1)], `P = 4 \\times ${num(b.value, 'length', s)}`))
      } else {
        const a2 = sym('a', 1, 2)
        rows.push(perimeterRow('P = 2(a + b)', [a2, b], `P = 2(${num(a2.value, 'length', s)} + ${num(b.value, 'length', s)})`))
      }
      break
    }
    case 'trapezium':
    case 'isosceles-trapezium': {
      const [i, j] = cls.parallelSides ?? [0, 2]
      const a = sym('a', i, (i + 1) % 4)
      const b = sym('b', j, (j + 1) % 4)
      const foot = footOfPerpendicular(pts[j], { kind: 'line', p: pts[i], d: sub(pts[(i + 1) % 4], pts[i]) })
      const h: FormulaSymbol = { sym: 'h', label: 'height', value: dist(pts[j], foot), kind: 'length', highlight: { dashed: [seg(pts[j], foot)] } }
      rows.push({
        title: 'Area',
        general: 'A = \\tfrac{1}{2}(a + b)\\,h',
        symbols: [a, b, h],
        substitution: `A = \\tfrac{1}{2}(${num(a.value, 'length', s)} + ${num(b.value, 'length', s)}) \\times ${num(h.value, 'length', s)}`,
        value: area,
        kind: 'area',
        highlight: { region, dashed: h.highlight.dashed }
      })
      rows.push(perimeterRow('P = a + b + c + d', [], `P = ${pts.map((_, k) => num(L(k, (k + 1) % 4), 'length', s)).join(' + ')}`))
      break
    }
    case 'kite': {
      const d1: FormulaSymbol = { sym: 'd_1', label: nm(0, 2), value: L(0, 2), kind: 'length', highlight: { segments: [seg(pts[0], pts[2])] } }
      const d2: FormulaSymbol = { sym: 'd_2', label: nm(1, 3), value: L(1, 3), kind: 'length', highlight: { segments: [seg(pts[1], pts[3])] } }
      rows.push({ title: 'Area', general: 'A = \\tfrac{1}{2} d_1 d_2', symbols: [d1, d2], substitution: `A = \\tfrac{1}{2} \\times ${num(d1.value, 'length', s)} \\times ${num(d2.value, 'length', s)}`, value: area, kind: 'area', highlight: { region, segments: [seg(pts[0], pts[2]), seg(pts[1], pts[3])] } })
      rows.push(perimeterRow('P = 2(a + b)', [sym('a', 0, 1), sym('b', 1, 2)], `P = 2(${num(L(0, 1), 'length', s)} + ${num(L(1, 2), 'length', s)})`))
      break
    }
    case 'equilateral-triangle':
    case 'right-isosceles-triangle':
    case 'right-triangle':
    case 'isosceles-triangle':
    case 'scalene-triangle': {
      const angles = [0, 1, 2].map((k) => {
        const p = pts[k]
        const u = normalize(sub(pts[(k + 2) % 3], p))
        const v = normalize(sub(pts[(k + 1) % 3], p))
        return Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])))
      })
      const right = angles.findIndex((x) => Math.abs(x - Math.PI / 2) < 1e-3)
      if (cls.kind === 'equilateral-triangle') {
        const a = sym('a', 0, 1)
        rows.push({ title: 'Area', general: 'A = \\frac{\\sqrt{3}}{4}a^2', symbols: [a], substitution: `A = \\frac{\\sqrt{3}}{4} \\times ${num(a.value, 'length', s)}^2`, value: area, kind: 'area', highlight: { region } })
      } else if (right >= 0) {
        const b = sym('b', right, (right + 1) % 3)
        const p = { ...sym('p', right, (right + 2) % 3) }
        rows.push({ title: 'Area', general: 'A = \\tfrac{1}{2} \\times b \\times p', symbols: [b, p], substitution: `A = \\tfrac{1}{2} \\times ${num(b.value, 'length', s)} \\times ${num(p.value, 'length', s)}`, value: area, kind: 'area', highlight: { region } })
        const hyp = sym('c', (right + 1) % 3, (right + 2) % 3)
        rows.push({ title: 'Hypotenuse (Pythagoras)', general: 'c = \\sqrt{b^2 + p^2}', symbols: [b, p, hyp], substitution: `c = \\sqrt{${num(b.value, 'length', s)}^2 + ${num(p.value, 'length', s)}^2}`, value: hyp.value, kind: 'length', highlight: hyp.highlight })
      } else {
        const b = sym('b', 0, 1)
        const foot = footOfPerpendicular(pts[2], { kind: 'line', p: pts[0], d: sub(pts[1], pts[0]) })
        const h: FormulaSymbol = { sym: 'h', label: 'height', value: dist(pts[2], foot), kind: 'length', highlight: { dashed: [seg(pts[2], foot)] } }
        rows.push({ title: 'Area', general: 'A = \\tfrac{1}{2} \\times b \\times h', symbols: [b, h], substitution: `A = \\tfrac{1}{2} \\times ${num(b.value, 'length', s)} \\times ${num(h.value, 'length', s)}`, value: area, kind: 'area', highlight: { region, dashed: h.highlight.dashed } })
      }
      const [a, b, c] = [sym('a', 1, 2), sym('b', 2, 0), sym('c', 0, 1)]
      const semi = (a.value + b.value + c.value) / 2
      const S: FormulaSymbol = { sym: 's', label: 'half perimeter', value: semi, kind: 'length', highlight: { segments: allSides } }
      rows.push({
        title: "Area (Heron's formula)",
        general: 'A = \\sqrt{s(s-a)(s-b)(s-c)}',
        symbols: [a, b, c, S],
        substitution: `A = \\sqrt{${num(semi, 'length', s)}(${num(semi - a.value, 'length', s)})(${num(semi - b.value, 'length', s)})(${num(semi - c.value, 'length', s)})}`,
        value: area,
        kind: 'area',
        highlight: { region }
      })
      rows.push(perimeterRow('P = a + b + c', [a, b, c], `P = ${num(a.value, 'length', s)} + ${num(b.value, 'length', s)} + ${num(c.value, 'length', s)}`))
      break
    }
    case 'regular-polygon': {
      const c = centroid(pts)
      const side = sym('s', 0, 1)
      const m = mid(pts[0], pts[1])
      const ap: FormulaSymbol = { sym: 'a', label: 'apothem', value: dist(c, m), kind: 'length', highlight: { dashed: [seg(c, m)] } }
      rows.push({
        title: 'Area',
        general: 'A = \\tfrac{1}{2} \\times n \\times s \\times a',
        symbols: [side, ap],
        substitution: `A = \\tfrac{1}{2} \\times ${n} \\times ${num(side.value, 'length', s)} \\times ${num(ap.value, 'length', s)}`,
        value: area,
        kind: 'area',
        highlight: { region, dashed: ap.highlight.dashed }
      })
      rows.push(perimeterRow('P = n \\times s', [side], `P = ${n} \\times ${num(side.value, 'length', s)}`))
      break
    }
    default: {
      rows.push({
        title: 'Area (shoelace formula)',
        general: 'A = \\tfrac{1}{2}\\left|\\sum_{i} (x_i y_{i+1} - x_{i+1} y_i)\\right|',
        symbols: [],
        substitution: `A = \\tfrac{1}{2}\\left|${pts.map((p, i) => `(${num(p[0], 'length', s)})(${num(pts[(i + 1) % n][1], 'length', s)}) - (${num(pts[(i + 1) % n][0], 'length', s)})(${num(p[1], 'length', s)})`).slice(0, 6).join(' + ')}${n > 6 ? ' + \\dots' : ''}\\right|`,
        value: area,
        kind: 'area',
        highlight: { region }
      })
      rows.push(perimeterRow('P = \\text{sum of all sides}', [], `P = ${pts.map((_, k) => num(L(k, (k + 1) % n), 'length', s)).join(' + ')}`))
    }
  }

  const simple = cls.kind !== 'polygon'
  return {
    name: cls.name,
    cls,
    rows,
    note: !simple || n >= 5 ? 'Press Decompose to split this shape into simple shapes and add their areas.' : undefined
  }
}

export function circleReport(c: V3, r: number, centerName: string, s: MeasureSettings): ShapeReport {
  const region = circlePolygon(c, r)
  const edge = add(c, scale([1, 0, 0], r))
  const rSym: FormulaSymbol = { sym: 'r', label: `${centerName} to circle`, value: r, kind: 'length', highlight: { segments: [[c, edge]] } }
  const rows: FormulaRow[] = [
    { title: 'Area', general: 'A = \\pi r^2', symbols: [rSym], substitution: `A = \\pi \\times ${num(r, 'length', s)}^2`, value: Math.PI * r * r, kind: 'area', highlight: { region } },
    { title: 'Circumference', general: 'C = 2\\pi r', symbols: [rSym], substitution: `C = 2\\pi \\times ${num(r, 'length', s)}`, value: 2 * Math.PI * r, kind: 'length', highlight: { segments: region.map((p, i) => [p, region[(i + 1) % region.length]] as [V3, V3]) } },
    { title: 'Diameter', general: 'd = 2r', symbols: [rSym], substitution: `d = 2 \\times ${num(r, 'length', s)}`, value: 2 * r, kind: 'length', highlight: { segments: [[add(c, [-r, 0, 0]), edge]] } }
  ]
  return { name: 'Circle', rows }
}
