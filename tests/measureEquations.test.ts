// The Measure panel's Equation rows, in the form a teacher writes on the board. They used to be
// printed from the raw numbers: "(x − −4)² + (y − −1)² = 4" for a circle about (−4, −1), and
// "0x − 4y = −24" for the level segment from (−5, 6) to (−1, 6). Typed lines go through the real
// command bar and scene store into the panel's own rows.

import { beforeEach, describe, expect, it } from 'vitest'
import { useScene } from '../src/renderer/src/core/store'
import type { SceneObject } from '../src/renderer/src/core/types'
import { rowsFor } from '../src/renderer/src/panels/Measurements'
import { runCommand } from '../src/renderer/src/lang/commands'
import { circleEquationText, lineEquation, lineEquationText } from '../src/renderer/src/math/geometry'

const sc = () => useScene.getState()
const byName = (name: string): SceneObject => Object.values(sc().objects).find((o) => o.name === name)!
const equationOf = (name: string) => {
  const o = byName(name)
  const row = rowsFor(o, (id) => sc().ev.values.get(id), sc().objects)[0].rows.find((r) => r.label === 'Equation')
  return row?.value
}

describe('Measure panel equations in textbook form', () => {
  beforeEach(() => sc().newScene())

  it('writes a circle about a negative centre with plus signs: (x + 4)² + (y + 1)² = 4', async () => {
    await runCommand('k = Circle((-4, -1), 2)')
    expect(equationOf('k')).toBe('(x + 4)² + (y + 1)² = 4')
  })

  it('writes a circle about the origin as x² + y² = r², and one on an axis with one bracket', async () => {
    await runCommand('k = Circle((0, 0), 3)')
    expect(equationOf('k')).toBe('x² + y² = 9')
    await runCommand('m = Circle((2, 0), 1.5)')
    expect(equationOf('m')).toBe('(x − 2)² + y² = 2.25')
  })

  it('writes the level segment from (−5, 6) to (−1, 6) as y = 6', async () => {
    await runCommand('P = (-5, 6)')
    await runCommand('Q = (-1, 6)')
    await runCommand('s = Segment(P, Q)')
    expect(equationOf('s')).toBe('y = 6')
  })

  it('writes an upright segment as x = c', async () => {
    await runCommand('P = (-2, 1)')
    await runCommand('Q = (-2, 7)')
    await runCommand('s = Segment(P, Q)')
    expect(equationOf('s')).toBe('x = −2')
  })

  it('writes a slanted line with the x coefficient positive, no 1 before a letter and no "− −"', async () => {
    await runCommand('P = (0, 0)')
    await runCommand('Q = (2, 4)')
    await runCommand('s = Segment(P, Q)')
    // Raw: a = 4, b = −2, c = 0 → "4x + −2y = 0"; cut down by 2.
    expect(equationOf('s')).toBe('2x − y = 0')
  })
})

describe('lineEquationText and circleEquationText', () => {
  it('turns a negative leading coefficient positive and cuts down whole numbers by their common factor', () => {
    expect(lineEquationText({ a: -6, b: 3, c: -9 })).toBe('2x − y = 3')
    expect(lineEquationText(lineEquation([0, 3, 0], [3, 0, 0]))).toBe('x + y = 3')
  })

  it('keeps decimals as they are and never writes a zero term', () => {
    expect(lineEquationText({ a: 0.5, b: 1.25, c: 2 })).toBe('0.5x + 1.25y = 2')
    expect(lineEquationText({ a: 0, b: -4, c: -24 })).toBe('y = 6')
    expect(lineEquationText({ a: 3, b: 0, c: 0 })).toBe('x = 0')
  })

  it('leaves out a term that would print as 0 on a dragged, almost level or upright line', () => {
    // a = 0.0004 is not 0, but fmt writes it "0": the row read "0x − 3y = 0".
    expect(lineEquationText(lineEquation([0, 0, 0], [3, 0.0004, 0]))).toBe('y = 0')
    expect(lineEquationText(lineEquation([1, 2, 0], [5, 2.0003, 0]))).toBe('y = 2')
    expect(lineEquationText(lineEquation([2, 0, 0], [2.0002, 4, 0]))).toBe('x = 2')
    for (const p of [[0.0001, 0.0002, 0], [0.0003, -0.0001, 0]] as const) {
      // A very short segment keeps both terms rather than printing "0x + 0y".
      const text = lineEquationText(lineEquation([0, 0, 0], [...p]))
      expect(text).not.toMatch(/(^|[^.\d])0[xy]/)
      expect(text).toMatch(/x/)
      expect(text).toMatch(/y/)
    }
  })

  it('folds the sign of the centre into the bracket', () => {
    expect(circleEquationText([-4, -1, 0], 2)).toBe('(x + 4)² + (y + 1)² = 4')
    expect(circleEquationText([0, -2.5, 0], 1)).toBe('x² + (y + 2.5)² = 1')
  })
})
