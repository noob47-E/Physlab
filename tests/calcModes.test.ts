// Two numbers the Calculator's modes show that were wrong, checked through the same pure functions
// the panel now calls (calc/stats.ts, calc/sheet.ts):
//
//  - Statistics: "ŷ at x = …" for a log fit was worked out from the fitted line with ln turned into
//    log, and the shared maths instance reads log(x) as base 10 — so the b·ln x term came out
//    ln 10 (2.3 times) too small, while the curve drawn from the same line was right.
//  - Spreadsheet: a cell that points back at itself (A1 → A1, or A1 → B1 → A1) showed 0, because the
//    "CIRC" mark the evaluator gave back was read by the caller as 0.
//
// And one that was waiting to happen (B2c): the Table's f(x), the Matrix line, a Spreadsheet formula and the typed
// Units box all hand the line to mathjs, which reads sin(30) in the one shared angle mode. They never asked for the
// screen's unit: they worked in whatever the last Numbers line had left, until evaluateComp started putting the mode
// back. Each now takes the screen's unit (calc/modeLines.ts) and runs in it.

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { statistics, type RegressionType } from '../src/renderer/src/calc/engine'
import { matrixLine, sheetValues, tableRows, typedUnits } from '../src/renderer/src/calc/modeLines'
import { evaluateSheet, SHEET_COLS, SHEET_ROWS } from '../src/renderer/src/calc/sheet'
import { predictY } from '../src/renderer/src/calc/stats'
import { compileScalar, getAngleMode, math, setAngleMode } from '../src/renderer/src/math/expr'
import { readSource } from './helpers/repo'
import { convertListed } from '../src/renderer/src/calc/units'
import { superscriptPowers } from '../src/renderer/src/math/format'
import fs from 'fs'
import path from 'path'
import { beyondTheReals } from '../src/renderer/src/calc/roots'
import { exactQuadraticOf } from '../src/renderer/src/calc/exactComplex'
import { setCalcPrecisionSource } from '../src/renderer/src/calc/format'
import { errorSentence } from '../src/renderer/src/calc/errors'

const X = [1, 2, 3, 4, 5, 6]
const fit = (type: RegressionType, f: (x: number) => number, xs: number[] = X) => statistics(xs, xs.map(f), null, type)

describe('Statistics: ŷ for a fitted line', () => {
  it('reads a log fit as the natural log: y = 2 + 3 ln x gives 2 + 3 ln 10 at x = 10, not 2 + 3 log₁₀ 10 = 5', () => {
    const res = fit('log', (x) => 2 + 3 * Math.log(x), [1, 2, 3, 4, 5])
    expect(res.coef!.a).toBeCloseTo(2, 9)
    expect(res.coef!.b).toBeCloseTo(3, 9)
    const y = predictY(res, 10)
    expect(y).toBeCloseTo(8.9078, 4)
    expect(y).toBeCloseTo(2 + 3 * Math.log(10), 9)
    expect(y).not.toBeCloseTo(5, 1)
  })

  it('gives the same number the drawn curve has at that x, for every kind of fit', () => {
    const kinds: [RegressionType, (x: number) => number][] = [
      ['linear', (x) => 1 + 2 * x],
      ['quadratic', (x) => 1 + 2 * x + 3 * x * x],
      ['log', (x) => 2 + 3 * Math.log(x)],
      ['exp', (x) => 2 * Math.exp(0.3 * x)],
      ['abExp', (x) => 2 * 1.5 ** x],
      ['power', (x) => 2 * x ** 1.5],
      ['inverse', (x) => 1 + 4 / x]
    ]
    for (const [type, truth] of kinds) {
      const res = fit(type, truth)
      // The curve is res.expr compiled the way the viewport compiles it; the model is what the data came from.
      const curve = compileScalar(res.expr!, ['x'], () => ({}))
      for (const x of [0.5, 1.5, 6, 7.5, 10]) {
        expect(predictY(res, x), `${type} at x = ${x}`).toBeCloseTo(truth(x), 6)
        expect(predictY(res, x), `${type} at x = ${x} against the curve`).toBe(curve({ x }))
      }
    }
  })

  it('leaves a straight line and a parabola as they were', () => {
    expect(predictY(fit('linear', (x) => 1 + 2 * x), 7)).toBeCloseTo(15, 9)
    expect(predictY(fit('quadratic', (x) => 1 + 2 * x + 3 * x * x), 6)).toBeCloseTo(121, 6)
    // a falling line is written with a negative slope: "a + -b*x"
    expect(predictY(fit('linear', (x) => 10 - 2 * x), 8)).toBeCloseTo(-6, 9)
  })

  it('reads a line whose numbers are written with an exponent (tiny readings)', () => {
    const res = fit('linear', (x) => 3e-9 + 2e-9 * x)
    expect(res.expr).toMatch(/e-9/)
    expect(predictY(res, 10)).toBeCloseTo(2.3e-8, 20)
  })

  it('has no value where the log has none, and none for a one-variable table', () => {
    const logFit = fit('log', (x) => 2 + 3 * Math.log(x))
    expect(predictY(logFit, -1)).toBeNaN()
    expect(predictY(logFit, Number.NaN)).toBeNaN()
    expect(predictY(statistics([1, 2, 3], null, null, 'single'), 4)).toBeNaN()
  })

  it('has no value, instead of failing, when the fit itself has none (every x the same)', () => {
    const res = statistics([2, 2, 2], [1, 2, 3], null, 'linear')
    expect(predictY(res, 5)).toBeNaN()
  })
})

describe('Spreadsheet: the value of every cell', () => {
  const defaults = { A1: '1', A2: '2', A3: '3', B1: '=A1^2', B2: '=A2^2', B3: '=A3^2', C1: '=sum(B1:B3)' }

  it('keeps the example sheet: squares in B and their sum 14 in C1', () => {
    const v = evaluateSheet(defaults)
    expect([v.A1, v.A2, v.A3]).toEqual([1, 2, 3])
    expect([v.B1, v.B2, v.B3]).toEqual([1, 4, 9])
    expect(v.C1).toBe(14)
  })

  it('has a value for every cell of the grid, empty ones blank', () => {
    const v = evaluateSheet(defaults)
    expect(Object.keys(v)).toHaveLength(SHEET_COLS.length * SHEET_ROWS)
    expect(v.D7).toBe('')
    expect(v.E15).toBe('')
  })

  it('reads numbers, words and blanks as typed when there is no formula', () => {
    const v = evaluateSheet({ A1: '5', B2: 'hello', C3: '-2.5', D4: '1e3', E5: '' })
    expect(v).toMatchObject({ A1: 5, B2: 'hello', C3: -2.5, D4: 1000, E5: '' })
  })

  it('works ordinary formulas out as before: ranges, functions, × and ÷', () => {
    const v = evaluateSheet({
      A1: '10', A2: '20', A3: '30',
      B1: '=mean(A1:A3)', B2: '=A1×A2', B3: '=A3÷4',
      C1: '=B1+B2+B3', D1: '=sum(A1:B3)'
    })
    expect([v.B1, v.B2, v.B3]).toEqual([20, 200, 7.5])
    expect(v.C1).toBe(227.5)
    expect(v.D1).toBe(287.5)
  })

  it('a cell that is read by two others is not a circle', () => {
    const v = evaluateSheet({ A1: '1', B1: '=A1+1', C1: '=A1+2', D1: '=B1+C1' })
    expect(v.D1).toBe(5)
  })

  it('a long chain that never comes back keeps its numbers', () => {
    // 75 cells, each one the next plus 1, the last one 0: the first is 74. A depth limit of 50 called the
    // top of such a chain a circle (and then read that as 0).
    const ids = Array.from({ length: SHEET_ROWS }, (_, r) => SHEET_COLS.map((c) => `${c}${r + 1}`)).flat()
    const cells: Record<string, string> = {}
    ids.forEach((id, i) => (cells[id] = i === ids.length - 1 ? '0' : `=${ids[i + 1]}+1`))
    const v = evaluateSheet(cells)
    ids.forEach((id, i) => expect(v[id], id).toBe(ids.length - 1 - i))
  })

  describe('a formula that points back at itself', () => {
    it('shows CIRC in a cell that reads itself', () => {
      expect(evaluateSheet({ A1: '=A1' }).A1).toBe('CIRC')
      expect(evaluateSheet({ A1: '=A1+1' }).A1).toBe('CIRC')
    })

    it('shows CIRC in both cells when two read each other', () => {
      const v = evaluateSheet({ A1: '=B1', B1: '=A1' })
      expect(v.A1).toBe('CIRC')
      expect(v.B1).toBe('CIRC')
    })

    it('shows CIRC in every cell of a longer circle', () => {
      const v = evaluateSheet({ A1: '=B1', B1: '=C1', C1: '=A1' })
      expect([v.A1, v.B1, v.C1]).toEqual(['CIRC', 'CIRC', 'CIRC'])
    })

    it('shows CIRC in a cell that only reads a circle', () => {
      const v = evaluateSheet({ A1: '=B1', B1: '=A1', C1: '=A1+1' })
      expect(v.C1).toBe('CIRC')
    })

    it('does not depend on which cell the sheet is read from first', () => {
      // A1 only depends on the circle B1 ↔ C1, and the sheet is read A1 first.
      const v = evaluateSheet({ A1: '=C1+1', B1: '=C1', C1: '=B1' })
      expect([v.A1, v.B1, v.C1]).toEqual(['CIRC', 'CIRC', 'CIRC'])
      // …and with the circle first and the dependent after it.
      const w = evaluateSheet({ A1: '=B1', B1: '=A1', E15: '=A1*2' })
      expect([w.A1, w.B1, w.E15]).toEqual(['CIRC', 'CIRC', 'CIRC'])
    })

    it('shows CIRC when a range takes in its own cell', () => {
      const v = evaluateSheet({ A1: '1', A2: '2', A3: '=sum(A1:A3)' })
      expect([v.A1, v.A2, v.A3]).toEqual([1, 2, 'CIRC'])
    })

    it('leaves cells beside the circle alone', () => {
      const v = evaluateSheet({ A1: '=B1', B1: '=A1', C1: '5', D1: '=C1*2', E1: '=sum(C1:D1)' })
      expect([v.C1, v.D1, v.E1]).toEqual([5, 10, 15])
    })

    it('is worked out afresh each time: mending the circle brings the numbers back', () => {
      expect(evaluateSheet({ A1: '=B1', B1: '=A1' }).A1).toBe('CIRC')
      const v = evaluateSheet({ A1: '=B1', B1: '4' })
      expect([v.A1, v.B1]).toEqual([4, 4])
    })

    it('treats the word CIRC typed into a cell as only a word', () => {
      const v = evaluateSheet({ A1: 'CIRC', B1: '=A1+1' })
      expect(v.A1).toBe('CIRC')
      expect(v.B1).toBe(1)
    })
  })

  describe('a formula that cannot be worked out', () => {
    it('shows ERROR for it, and for a formula that reads it, instead of a number made with a silent 0', () => {
      const v = evaluateSheet({ A1: '=1/0', B1: '=A1+1', C1: '=sum(A1:A2)' })
      expect([v.A1, v.B1, v.C1]).toEqual(['ERROR', 'ERROR', 'ERROR'])
      const w = evaluateSheet({ A1: '=2*', B1: '=A1+1' })
      expect([w.A1, w.B1]).toEqual(['ERROR', 'ERROR'])
    })

    it('says CIRC rather than ERROR when a formula reads both', () => {
      const v = evaluateSheet({ A1: '=A1', B1: '=1/0', C1: '=A1+B1', D1: '=B1+A1' })
      expect([v.C1, v.D1]).toEqual(['CIRC', 'CIRC'])
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------
// B2c: the line a student types into a mode is worked out in the screen's angle unit

describe("Mode lines work in the screen's angle unit, whatever the shared mode was left at", () => {
  // The mode is one global (math/expr.ts) and every test in this file shares it: leave it as the app starts.
  afterEach(() => setAngleMode('deg'))

  type Unit = 'deg' | 'rad'
  /** The same angle, 30° = π/6, in each unit: its sine is 0.5, and in the other unit it is nothing like 0.5. */
  const HALF: { unit: Unit; at: number; typed: string }[] = [
    { unit: 'deg', at: 30, typed: '30' },
    { unit: 'rad', at: Math.PI / 6, typed: 'pi/6' }
  ]
  const STARTS: Unit[] = ['deg', 'rad']
  const plain = (v: unknown): unknown => (v as { toArray?: () => unknown }).toArray?.() ?? v

  /** `check` for each screen unit against each mode the global could have been left at — and the mode must come back. */
  const everyStart = (check: (h: (typeof HALF)[number], before: Unit) => void) => {
    for (const h of HALF)
      for (const before of STARTS) {
        setAngleMode(before)
        check(h, before)
        expect(getAngleMode(), `a ${h.unit} screen must leave the shared mode at ${before}`).toBe(before)
      }
  }

  describe('Table', () => {
    it('f(x) = sin(x) is 0.5 at x = 30 on a DEG screen and at x = π/6 on a RAD one, in either shared mode', () => {
      everyStart(({ unit, at }, before) => {
        const rows = tableRows('sin(x)', '', { start: at, end: at, step: 1 }, unit)
        expect(rows, `${unit} screen, mode was ${before}`).toHaveLength(1)
        expect(rows[0].f, `${unit} screen, mode was ${before}`).toBeCloseTo(0.5, 12)
      })
    })

    it('g(x) works in the same unit: sin 60° and cos 60°, sin π/3 and cos π/3', () => {
      const sixty: Record<Unit, number> = { deg: 60, rad: Math.PI / 3 }
      for (const unit of STARTS)
        for (const before of STARTS) {
          setAngleMode(before)
          const [row] = tableRows('sin(x)', 'cos(x)', { start: sixty[unit], end: sixty[unit], step: 1 }, unit)
          expect(row.f, `f on a ${unit} screen, mode was ${before}`).toBeCloseTo(Math.sqrt(3) / 2, 12)
          expect(row.g, `g on a ${unit} screen, mode was ${before}`).toBeCloseTo(0.5, 12)
        }
    })

    it("an inverse function answers in the screen's unit too: asin(0.5) is 30 on a DEG screen and π/6 on a RAD one", () => {
      everyStart(({ unit, at }, before) => {
        const [row] = tableRows('asin(x)', '', { start: 0.5, end: 0.5, step: 1 }, unit)
        expect(row.f, `${unit} screen, mode was ${before}`).toBeCloseTo(at, 12)
      })
    })

    it('keeps the ordinary table: x from start by step, x² − 2x, an empty g(x) left empty', () => {
      const rows = tableRows('x^2 - 2x', '', { start: -3, end: 3, step: 0.5 }, 'deg')
      expect(rows.map((r) => r.x)).toEqual([-3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3])
      expect(rows.map((r) => r.f)).toEqual([15, 11.25, 8, 5.25, 3, 1.25, 0, -0.75, -1, -0.75, 0, 1.25, 3])
      expect(rows.every((r) => r.g === '')).toBe(true)
    })

    it('says ERROR for a line it cannot work out, nothing for an empty box, stops at 200 rows, and leaves the mode alone', () => {
      setAngleMode('rad')
      expect(tableRows('x +', 'foo(x)', { start: 0, end: 1, step: 1 }, 'deg')).toEqual([
        { x: 0, f: 'ERROR', g: 'ERROR' },
        { x: 1, f: 'ERROR', g: 'ERROR' }
      ])
      expect(tableRows('', '  ', { start: 0, end: 1, step: 1 }, 'deg').map((r) => [r.f, r.g])).toEqual([['', ''], ['', '']])
      expect(tableRows('x', '', { start: 0, end: 1000, step: 1 }, 'deg')).toHaveLength(200)
      expect(tableRows('x', '', { start: 3, end: -3, step: 1 }, 'deg')).toEqual([])
      expect(getAngleMode()).toBe('rad')
    })
  })

  describe('Matrix line', () => {
    const identity = { MatA: [[1, 0], [0, 1]] }

    it('det(MatA) × sin(30) is 0.5 on a DEG screen and × sin(π/6) on a RAD one, in either shared mode', () => {
      everyStart(({ unit, typed }, before) => {
        const v = matrixLine(`det(MatA) * sin(${typed})`, identity, unit)
        expect(Number(v), `${unit} screen, mode was ${before}`).toBeCloseTo(0.5, 12)
      })
    })

    it('a matrix answer too: MatA × sin(30) scales every entry, in a RAD shared mode on a DEG screen', () => {
      setAngleMode('rad')
      const v = plain(matrixLine('MatA * sin(30)', { MatA: [[2, 4], [6, 8]] }, 'deg')) as number[][]
      v.flat().forEach((n, i) => expect(n).toBeCloseTo([1, 2, 3, 4][i], 12))
    })

    it('a line mathjs cannot read still throws, and the shared mode still comes back', () => {
      for (const before of STARTS) {
        const other: Unit = before === 'deg' ? 'rad' : 'deg'
        setAngleMode(before)
        expect(() => matrixLine('MatA * (', identity, other)).toThrow()
        expect(() => matrixLine('MatA + Nothing', identity, other)).toThrow()
        expect(getAngleMode()).toBe(before)
      }
    })

    it('still reads Inv(, Trn( and Idn(, and eigs( still gives its values', () => {
      expect(Number(matrixLine('det(Inv(MatA))', { MatA: [[2, 0], [0, 2]] }, 'deg'))).toBeCloseTo(0.25, 12)
      expect(Number(matrixLine('det(Idn(3))', {}, 'deg'))).toBe(1)
      expect(plain(matrixLine('Trn(MatA)', { MatA: [[1, 2], [3, 4]] }, 'deg'))).toEqual([[1, 3], [2, 4]])
      const e = matrixLine('eigs(MatA)', { MatA: [[2, 0], [0, 3]] }, 'rad') as { values: unknown }
      expect(plain(e.values)).toEqual([2, 3])
    })
  })

  describe('Spreadsheet formula', () => {
    it('=sin(A1) is 0.5 for A1 = 30 on a DEG screen and for A1 = π/6 on a RAD one, in either shared mode', () => {
      everyStart(({ unit, at }, before) => {
        expect(sheetValues({ A1: String(at), B1: '=sin(A1)' }, unit).B1, `${unit} screen, mode was ${before}`).toBeCloseTo(0.5, 12)
      })
    })

    it('gives every other cell exactly what evaluateSheet gives', () => {
      const cells = { A1: '1', A2: '2', A3: '3', B1: '=A1^2', B2: '=A2^2', B3: '=A3^2', C1: '=sum(B1:B3)', D1: '=D1', E1: '=1/0', E2: 'hello' }
      expect(sheetValues(cells, 'rad')).toEqual(evaluateSheet(cells))
    })
  })

  describe('Typed Units line', () => {
    it('sin(30) is 0.5 on a DEG screen and sin(π/6) on a RAD one, in either shared mode', () => {
      everyStart(({ unit, typed }, before) => {
        expect(typedUnits(`sin(${typed})`, unit), `${unit} screen, mode was ${before}`).toEqual({ text: '0.5', refused: false })
      })
    })

    it('a line that carries its own unit does not depend on the screen: 180 deg to rad is π either way', () => {
      const inDeg = typedUnits('180 deg to rad', 'deg')
      expect(inDeg.text).toMatch(/^3\.14159/)
      expect(typedUnits('180 deg to rad', 'rad')).toEqual(inDeg)
      expect(typedUnits('5 N m to J', 'rad').refused).toBe(false)
    })
  })
})

// The pure functions above are only half of it: the panel has to be the one calling them. No DOM here, so these read
// the panel's source — a failure names the line to put back (and never prints the whole file).
describe('The Calculator panel never works a typed line out itself', () => {
  const panel = readSource('src/renderer/src/panels/calcModes.tsx')

  it('has no direct call into the maths engine, the sheet or the Units box: every typed line goes through calc/modeLines.ts', () => {
    expect(panel.match(/\b(?:math\.(?:evaluate|compile)|evaluateSheet|convertTyped)\(/g) ?? []).toEqual([])
  })

  it("hands each of those four functions the screen's angle unit", () => {
    const calls = [...panel.matchAll(/\b(tableRows|matrixLine|sheetValues|typedUnits)\(([^()\n]*)\)/g)]
    expect([...new Set(calls.map((c) => c[1]))].sort()).toEqual(['matrixLine', 'sheetValues', 'tableRows', 'typedUnits'])
    for (const [text, , args] of calls) expect(args, text).toMatch(/\bangleUnit\b/)
  })

  it('takes that unit from the scene settings, as the Maths screen does, and from nowhere else', () => {
    const declared = [...panel.matchAll(/\bconst angleUnit = ([^\n]*)/g)].map((m) => m[1])
    expect(declared.length, 'no `const angleUnit = …` in the panel').toBeGreaterThanOrEqual(4)
    for (const d of declared) expect(d).toBe('useScene((s) => s.settings.angleUnit)')
  })

  it('works the Table and the Spreadsheet out again when the screen switches its unit', () => {
    const memos = [...panel.matchAll(/useMemo\(\(\) => (tableRows|sheetValues)\([^\n]*\), \[([^\]\n]*)\]\)/g)]
    expect(memos.map((m) => m[1]).sort(), 'the Table and the Spreadsheet each compute inside one useMemo line').toEqual(['sheetValues', 'tableRows'])
    for (const [text, , deps] of memos) expect(deps, text).toMatch(/\bangleUnit\b/)
  })
})

// H17: three spots on the Maths screen that did not follow the screen. A variable's value typed under Variables was
// worked out in whatever angle mode the maths last held (VarField.commit called math.evaluate itself); the Matrix
// mode's error line showed the engine's own text; Vectors mode solved in degrees at 4 d.p. whatever the student chose.
describe('H17 — the Variables box, the Matrix error line and Vectors mode follow the screen', () => {
  const maths = readSource('src/renderer/src/panels/Maths.tsx')
  const modes = readSource('src/renderer/src/panels/calcModes.tsx')
  const block = (src: string, start: string): string => {
    const at = src.indexOf(start)
    const next = src.indexOf('\nfunction ', at + start.length)
    return src.slice(at, next < 0 ? undefined : next)
  }

  it('a typed variable value is read by the with-values reader, in the screen unit', () => {
    const varField = block(maths, 'function VarField(')
    expect(varField).not.toMatch(/math\.evaluate\(/)
    expect(varField).toMatch(/readValueBoxes\(/)
  })

  it('the Matrix error line is a sentence, never String() of the engine error', () => {
    const matrix = block(modes, 'function MatrixMode(')
    expect(matrix).not.toMatch(/setErr\(String\(/)
    expect(matrix).toMatch(/errorSentence\(/)
  })

  it('every Vectors-mode solution is written with the student settings', () => {
    // Since CW16 every one comes from the Vector Calculator's table of operations, through one call
    // that hands it the student's settings; no solver is called straight from here.
    const vectors = block(modes, 'function VectorMode(')
    expect(vectors).toMatch(/OPERATIONS\[id\]\.solve\(\[nv\(a\), nv\(b\)\], settings\)/)
    expect(vectors).not.toMatch(/VS\.solve\w+\(/)
    expect([...vectors.matchAll(/sol: two\('/g)]).toHaveLength(7)
    expect(vectors.match(/\.solve\(/g)).toHaveLength(1)
  })
})

describe('fixb-f5-units-screen — the Units screen writes powers with superscripts', () => {
  describe('F5: Units screen superscript format', () => {
    it('superscriptPowers formats lightyear output with superscripts instead of ^', () => {
      // 1 lightyear to m is ~9.46×10^15 m
      const raw = convertListed(1, 'lightyear', 'm').text
      expect(raw).toContain('^')
      const formatted = superscriptPowers(raw)
      expect(formatted).not.toContain('^')
      expect(formatted).toContain('¹⁵')
      expect(formatted).toMatch(/9\.46073047\d*\u00a0×\u00a010¹⁵ m/)
    })

    it('Units screen in calcModes.tsx wraps output in superscriptPowers', () => {
      const target = path.resolve(__dirname, '../src/renderer/src/panels/calcModes.tsx')
      const code = fs.readFileSync(target, 'utf8')
      expect(code).toContain('superscriptPowers(result.text)')
    })
  })
})

describe('fixb-f7-poly-roots-agreed — Equations > Polynomial agrees with the Numbers screen on complex roots', () => {
  // Its own file set 2 dp at the top level; here that would load with the file and change every
  // calcModes test, so it is held to this block and the calculator's default 10 s.f. put back after.
  beforeAll(() => setCalcPrecisionSource(() => ({ decimals: 2, precisionMode: 'dp' })))
  afterAll(() => setCalcPrecisionSource(() => ({ decimals: 10, precisionMode: 'sf' })))
  describe('F7: Equations > Polynomial agrees with Numbers screen on complex roots', () => {
    it('beyondTheReals with no exact coefficients gives the decimal pair "x = −0.5 ± 0.87i"', () => {
      const res = beyondTheReals([1, 1, 1], 0)
      expect(res).not.toBeNull()
      expect('sentence' in res!).toBe(true)
      if (res && 'sentence' in res) {
        expect(res.sentence).toBe('No real solution. In complex numbers: x = −0.5 ± 0.87i')
      }
    })

    // The Equations > Polynomial screen passes the coefficients it was typed, so x² + x + 1 = 0 says the exact pair the = card says.
    it('the Numbers screen with its typed coefficients says the exact pair: x² + x + 1 = 0 is −1/2 ± (√3/2)i', () => {
      const c = [1, 1, 1]
      expect(beyondTheReals(c, 0, exactQuadraticOf(c))).toEqual({ sentence: 'No real solution. In complex numbers: x = −1/2 ± (√3/2)i' })
    })

    it('calcModes.tsx Equations > Polynomial uses beyondTheReals to show the sentence rather than only separate rows', () => {
      const target = path.resolve(__dirname, '../src/renderer/src/panels/calcModes.tsx')
      const code = fs.readFileSync(target, 'utf8')
      // The name followed by a bracket: the call itself. The import line has the bare name, never a bracket after it.
      expect(code).toMatch(/\bbeyondTheReals\(/)
    })

    it('calcModes.tsx hands the typed coefficients to beyondTheReals as exact fractions', () => {
      const target = path.resolve(__dirname, '../src/renderer/src/panels/calcModes.tsx')
      const code = fs.readFileSync(target, 'utf8')
      expect(code).toMatch(/beyondTheReals\(c, 0, exactQuadraticOf\(c\)\)/)
    })
  })
})

describe('fixb-f8-sin-matrix — sin of a matrix is refused in plain words', () => {
  // F8 (browser check CALC-06): sin(MatA) on the Matrices screen said only "I can't work that out.";
  // it must say why, in plain words.

  describe('F8: sin(MatA) refusal message', () => {
    it('says in plain words that the function takes a number, not a matrix', () => {
      let caught: unknown = null
      try {
        math.evaluate('sin(MatA)', { MatA: math.matrix([[1, 0], [0, 1]]) })
      } catch (e) {
        caught = e
      }
      expect(caught).not.toBeNull()
      expect(errorSentence(caught).sentence).toBe('That function takes a number, not a matrix.')
    })

    it('leaves the other sentences as they were', () => {
      expect(errorSentence(new Error('Unexpected end of expression')).sentence).toBe("I can't read that — check the brackets, and that every operator has a number on each side.")
    })
  })
})
