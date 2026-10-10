// R2-2: a unit typed in a vector is dropped (the rule stays), and the panel says so in one line.

import { describe, expect, it } from 'vitest'
import { droppedUnits, droppedUnitsSentence, evaluateVectorLine } from '../src/renderer/src/panels/vectorCalcStore'

describe('droppedUnits: which typed units a vector line leaves out', () => {
  it('finds the unit in a component form', () => {
    expect(droppedUnits('<3 m, 4 m>')).toEqual(['m'])
    expect(droppedUnits('(3 m)\\hat{i}+(4 m)\\hat{j}')).toEqual(['m'])
  })

  it('finds the unit in size ∠ angle', () => {
    expect(droppedUnits('10 N∠30°')).toEqual(['N'])
  })

  it('finds every unit of a power or a quotient, once each', () => {
    expect(droppedUnits('3 m/s^2')).toEqual(['m', 's'])
    expect(droppedUnits('3 m/s^{2}')).toEqual(['m', 's'])
    expect(droppedUnits('3 m/s²')).toEqual(['m', 's'])
    expect(droppedUnits('3 m s⁻²')).toEqual(['ms'])
  })

  it('says nothing about plain numbers', () => {
    expect(droppedUnits('3\\hat{i}+4\\hat{j}')).toBeNull()
    expect(droppedUnits('10∠30°')).toBeNull()
    expect(droppedUnits('<3, 4>')).toBeNull()
    expect(droppedUnits('1.5×10^{-5}\\hat{k}')).toBeNull()
    expect(droppedUnits('')).toBeNull()
  })

  it('does not take another card’s name for a unit (B is a byte to mathjs)', () => {
    expect(droppedUnits('A+2B', ['A', 'B'])).toBeNull()
    expect(droppedUnits('2B', ['A', 'B'])).toBeNull()
    expect(droppedUnits('A×B', ['A', 'B'])).toBeNull()
  })

  it('does not take i, j, k, the angle sign or degrees for units', () => {
    expect(droppedUnits('3i+4j-2k')).toBeNull()
    expect(droppedUnits('5∠90°')).toBeNull()
    expect(droppedUnits('5∠1.5 rad')).toBeNull()
  })

  it('does not fail on a line that cannot be read', () => {
    expect(droppedUnits('3 +')).toBeNull()
  })
})

describe('droppedUnitsSentence', () => {
  it('is one plain line that never names a unit (typed spaces vanish, so "m s" is read as ms)', () => {
    expect(droppedUnitsSentence(['m'])).toBe('Units are left out in Vectors: the unit you typed is ignored, and only the numbers are used.')
    expect(droppedUnitsSentence(['ms'])).not.toMatch(/\bms\b/)
    expect(droppedUnitsSentence(['m', 's'])).toBe('Units are left out in Vectors: the units you typed are ignored, and only the numbers are used.')
  })
})

// CW3b: one rule for which typed name is a unit. The note (droppedUnits) and the reader (unknownNames,
// through evaluateVectorLine) ask it the same way; the reader also wants the unit straight after a
// number. Pinned on lines that read and lines that are refused, before the rule was shared.
describe('which typed name is a unit: the note and the reader agree', () => {
  const SCOPE = { i: [1, 0, 0], j: [0, 1, 0], k: [0, 0, 1], A: [3, 4, 0] }
  const read = (line: string): string => {
    try {
      return JSON.stringify(evaluateVectorLine(line, { ...SCOPE }, ['B']).out)
    } catch (e) {
      return `refused: ${e instanceof Error ? e.message : String(e)}`
    }
  }
  const LINES = [
    '<3 m, 4 m>',
    String.raw`10\ kg\ m/s\angle30^{\circ}`,
    '3 m/s^2',
    '3 m s⁻²',
    String.raw`5\times N\hat{i}`,
    String.raw`(5)\ N\hat{i}`,
    String.raw`5\ N\cdot m\hat{i}`,
    'A+m',
    String.raw`k\ A`,
    String.raw`3\ m\hat{i}`,
    '2B',
    'A+2B',
    String.raw`30\ deg\hat{i}`,
    String.raw`5\angle1.5\ rad`,
    String.raw`10\ N\angle30^{\circ}`
  ]

  it('says the same as it did for each line, and the reader reads or refuses it as before', () => {
    expect(LINES.map((l) => [l, droppedUnits(l, ['A', 'B']), read(l)])).toMatchInlineSnapshot(`
      [
        [
          "<3 m, 4 m>",
          [
            "m",
          ],
          "[3,4,0]",
        ],
        [
          "10\\ kg\\ m/s\\angle30^{\\circ}",
          [
            "kg",
            "m",
            "s",
          ],
          "[8.660254037844387,4.999999999999999,0]",
        ],
        [
          "3 m/s^2",
          [
            "m",
            "s",
          ],
          "refused: There is no vector called s. Use a card's name (the letter on its left), or the unit vectors i, j and k.",
        ],
        [
          "3 m s⁻²",
          [
            "ms",
          ],
          "refused: Syntax error in part "⁻^(2)" (char 4)",
        ],
        [
          "5\\times N\\hat{i}",
          null,
          "refused: There is no vector called Ni. Use a card's name (the letter on its left), or the unit vectors i, j and k.",
        ],
        [
          "(5)\\ N\\hat{i}",
          null,
          "refused: There is no vector called Ni. Use a card's name (the letter on its left), or the unit vectors i, j and k.",
        ],
        [
          "5\\ N\\cdot m\\hat{i}",
          [
            "N",
            "mi",
          ],
          "refused: There is no vector called mi. Use a card's name (the letter on its left), or the unit vectors i, j and k.",
        ],
        [
          "A+m",
          [
            "m",
          ],
          "refused: There is no vector called m. Use a card's name (the letter on its left), or the unit vectors i, j and k.",
        ],
        [
          "k\\ A",
          null,
          "0",
        ],
        [
          "3\\ m\\hat{i}",
          [
            "mi",
          ],
          "{"mathjs":"Unit","value":3,"unit":"mi","fixPrefix":false,"skipSimp":true}",
        ],
        [
          "2B",
          null,
          "refused: B is a card further down. A card can only use the vectors above it, so type B's value here or use a card higher up.",
        ],
        [
          "A+2B",
          null,
          "refused: B is a card further down. A card can only use the vectors above it, so type B's value here or use a card higher up.",
        ],
        [
          "30\\ deg\\hat{i}",
          null,
          "refused: There is no vector called degi. Use a card's name (the letter on its left), or the unit vectors i, j and k.",
        ],
        [
          "5\\angle1.5\\ rad",
          null,
          "[{"mathjs":"Unit","value":4.998286624877786,"unit":"rad","fixPrefix":false,"skipSimp":true},{"mathjs":"Unit","value":0.13088474153936575,"unit":"rad","fixPrefix":false,"skipSimp":true},{"mathjs":"Unit","value":0,"unit":"rad","fixPrefix":false,"skipSimp":true}]",
        ],
        [
          "10\\ N\\angle30^{\\circ}",
          [
            "N",
          ],
          "[8.660254037844387,4.999999999999999,0]",
        ],
      ]
    `)
  })
})
