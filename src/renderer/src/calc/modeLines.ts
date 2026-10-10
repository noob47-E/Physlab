// What a Calculator mode works out from a line the student typed — the Table's f(x) and g(x), the Matrix line, a
// Spreadsheet formula, the typed Units box — kept out of the panel so it can be tested without a screen (B2c).
//
// Every one of these hands the line to mathjs, and mathjs reads sin(30) in the ONE angle mode the whole maths shares
// (math/expr.ts). None of them asked for the screen's unit: they worked in whatever that mode happened to hold, which
// is what the last scene evaluation set (or, until evaluateComp put it back, what the last Numbers line left). A
// Table of sin(x) on a RAD screen was one stray mode away from being read in degrees. Each line therefore takes the
// screen's unit, runs in it, and leaves the shared mode exactly the way it found it (engine.ts withAngle).

import { math } from '../math/expr'
import { keypadToMath, withAngle, type CalcContext } from './engine'
import { evaluateSheet } from './sheet'
import { convertTyped, type UnitAnswer } from './units'

/** The screen's angle unit (Settings → angleUnit), the one the Numbers mode works in. */
type ScreenAngle = CalcContext['angle']

interface TableRow {
  x: number
  /** A number, '' when the f(x) box is empty, 'ERROR' when the line cannot be worked out at this x. */
  f: number | string
  g: number | string
}

interface TableRange {
  start: number
  end: number
  step: number
}

function tableCell(line: string, x: number): number | string {
  if (!line.trim()) return ''
  try {
    return Number(math.evaluate(keypadToMath(line), { x }))
  } catch {
    return 'ERROR'
  }
}

/**
 * x from start to end by step (200 rows at most), with f(x) and g(x) worked out at each one in the screen's unit. The
 * whole table runs inside one switch of the mode, not one per cell.
 */
export function tableRows(fx: string, gx: string, range: TableRange, angle: ScreenAngle): TableRow[] {
  return withAngle(angle, () => {
    const out: TableRow[] = []
    const count = Math.min(200, Math.floor((range.end - range.start) / range.step + 1e-9) + 1)
    for (let i = 0; i < count; i++) {
      const x = range.start + i * range.step
      out.push({ x, f: tableCell(fx, x), g: tableCell(gx, x) })
    }
    return out
  })
}

/**
 * The Matrix mode's line — MatA * MatB, det(MatA), eigs(MatA), inv(MatA) * sin(30) — over the stored matrices, with
 * its angles in the screen's unit. The calculator's own spellings Inv(, Trn( and Idn( are mathjs's inv(, transpose(
 * and identity(. Throws what mathjs throws (the mode is put back first).
 */
export function matrixLine(line: string, matrices: Record<string, number[][]>, angle: ScreenAngle): unknown {
  return withAngle(angle, () =>
    math.evaluate(keypadToMath(line.replace(/\bInv\(/g, 'inv(').replace(/\bTrn\(/g, 'transpose(').replace(/\bIdn\(/g, 'identity(')), { ...matrices })
  )
}

/** The Spreadsheet's value for every cell (see evaluateSheet), with a formula such as =sin(A1) read in the screen's unit. */
export function sheetValues(cells: Record<string, string>, angle: ScreenAngle): Record<string, number | string> {
  return withAngle(angle, () => evaluateSheet(cells))
}

/** The typed Units box (see convertTyped), where a line such as sin(30) × 5 m reads its angle in the screen's unit. */
export function typedUnits(text: string, angle: ScreenAngle): UnitAnswer {
  return withAngle(angle, () => convertTyped(text))
}
