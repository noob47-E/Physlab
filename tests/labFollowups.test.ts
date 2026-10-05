// P-LAB: the checker's findings on the autofix batch and P9 — each test failed before its fix.
import { describe, expect, it } from 'vitest'
import { applyPaste, parseTable, toCsv } from '../src/renderer/src/lab/csv'
import { fitOf } from '../src/renderer/src/lab/fit'
import { emptyTable, setColumn } from '../src/renderer/src/lab/labStore'
import { formulaName, headerOf, readTyped, resolveValues } from '../src/renderer/src/lab/values'
import { FILE_VERSION, parseSceneFile } from '../src/renderer/src/core/migrate'

describe('CSV: a caption with escaped quotes keeps every character', () => {
  it('"say ""hi""" reads as say "hi"', () => {
    const p = parseTable('"say ""hi""",b\n1,2')
    expect(p.header?.[0].name).toBe('say "hi"')
  })

  it('a caption ending in a quote survives a round trip through toCsv', () => {
    const t = emptyTable()
    const named = setColumn(t, t.columns[0].id, { name: 'a', label: 'a "b"' })
    const csv = toCsv(named, resolveValues(named))
    expect(parseTable(csv).header?.[0].name).toBe('a "b"')
  })
})

describe('a rename replaces a pasted caption', () => {
  it('renaming the "Drop height" column to h shows h on the header', () => {
    const t = emptyTable()
    const pasted = setColumn(t, t.columns[0].id, { name: 'Drop_height', label: 'Drop height', unit: 'm' })
    expect(headerOf(pasted.columns[0])).toBe('Drop height / m')
    const renamed = setColumn(pasted, t.columns[0].id, { name: 'h' })
    expect(renamed.columns[0].label).toBeUndefined()
    expect(headerOf(renamed.columns[0])).toBe('h / m')
  })

  it('changing only the unit keeps the caption', () => {
    const t = emptyTable()
    const pasted = setColumn(t, t.columns[0].id, { name: 'Drop_height', label: 'Drop height' })
    expect(setColumn(pasted, t.columns[0].id, { unit: 'cm' }).columns[0].label).toBe('Drop height')
  })
})

describe('formula names keep what they can', () => {
  it('"2nd try" keeps its 2; a name with no letters still gets one', () => {
    expect(formulaName('2nd try', new Set())).toBe('x2nd_try')
    expect(formulaName('Drop height', new Set())).toBe('Drop_height')
    expect(formulaName('π', new Set())).toBe('x')
  })
})

describe('one reading typed with a decimal comma', () => {
  it('"1,2" in a cell is 1.2 and keeps its figures', () => {
    expect(readTyped('1,2')).toEqual({ value: 1.2, text: '1.2' })
    expect(readTyped('-0,50')).toEqual({ value: -0.5, text: '-0.50' })
  })

  it('"12,000" and "1,234" are not read as 12 and 1.234 (a thousands separator is just as likely)', () => {
    expect(readTyped('12,000')?.value).not.toBe(12)
    expect(readTyped('1,234')?.value).not.toBe(1.234)
  })

  it('a caption written """x""" in CSV is "x" with its quotes', () => {
    expect(parseTable('"""x""",b\n1,2').header?.[0].name).toBe('"x"')
  })
})

describe('r²: a real spread is fitted at any size', () => {
  it('readings of 1000000.000, .001, .0021 are not a perfect line', () => {
    const fit = fitOf([0, 1, 2], [1e6, 1e6 + 0.001, 1e6 + 0.0021], 'linear')!
    expect(fit.r2).toBeLessThan(1)
    expect(fit.r2).toBeGreaterThan(0.99)
  })

  it('all-equal readings on the line are still a perfect fit, and tiny scatter is not', () => {
    expect(fitOf([0, 1, 2], [0, 0, 0], 'linear')!.r2).toBe(1)
    expect(fitOf([0, 1, 2, 3], [1e-7, 3e-7, 2e-7, 4e-7], 'linear')!.r2).toBeLessThan(1)
  })
})

describe('files: format 7, and a damaged caption is caught', () => {
  it('a format-6 file opens and is brought up to format 7 unchanged', () => {
    const t = emptyTable()
    const out = parseSceneFile(JSON.stringify({ app: 'PhysLab', version: 6, objects: [], lab: [t] }))
    expect(FILE_VERSION).toBe(7)
    expect(out.version).toBe(7)
    expect(out.lab?.[0].rows).toEqual(t.rows)
  })

  it('a column caption that is not text says the table is damaged instead of crashing later', () => {
    const t = emptyTable()
    const bad = { ...t, columns: [{ ...t.columns[0], label: 42 }, ...t.columns.slice(1)] }
    expect(() => parseSceneFile(JSON.stringify({ app: 'PhysLab', version: 7, objects: [], lab: [bad] }))).toThrow(/damaged/)
  })
})

describe('captions pasted into an empty table never duplicate a kept column name', () => {
  it('pasting a caption "B" over column A of an empty table with A and B gives B_2, not two B columns', () => {
    const t = emptyTable()
    const names = t.columns.map((c) => c.name)
    const out = applyPaste(t, parseTable(`${names[1]}\n1`))
    const after = out.columns.map((c) => c.name)
    expect(new Set(after).size).toBe(after.length)
  })
})
