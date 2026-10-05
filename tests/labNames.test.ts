// P-LAB P11: one rule for a column name, whether it is pasted as a caption or typed in the name box.
import { describe, expect, it } from 'vitest'
import { emptyTable, setColumn } from '../src/renderer/src/lab/labStore'
import { headerOf, resolveValues, typedColumnName } from '../src/renderer/src/lab/values'

const two = () => {
  const t = emptyTable()
  return { t, a: t.columns[0], b: t.columns[1] }
}

describe('typedColumnName', () => {
  it('"Drop height" keeps the words as a label and gives formulas Drop_height', () => {
    const { t, a } = two()
    expect(typedColumnName(t, a.id, 'Drop height')).toEqual({ name: 'Drop_height', label: 'Drop height' })
  })

  it('a plain name "t" is the name, with no label', () => {
    const { t, a } = two()
    expect(typedColumnName(t, a.id, ' t ')).toEqual({ name: 't', label: undefined })
  })

  it('a name another column already uses is made unique and the typed text stays as the label', () => {
    const { t, a, b } = two()
    const p = typedColumnName(t, a.id, b.name)
    expect(p?.name).not.toBe(b.name)
    expect(p?.label).toBe(b.name)
  })

  it('a caption that already gives its own name is not renamed against itself', () => {
    const { t, a } = two()
    const named = setColumn(t, a.id, { name: 'Drop_height', label: 'Drop height' })
    expect(typedColumnName(named, a.id, 'Drop height')).toEqual({ name: 'Drop_height', label: 'Drop height' })
  })

  it('empty text changes nothing', () => {
    const { t, a } = two()
    expect(typedColumnName(t, a.id, '   ')).toBeNull()
  })

  it('applied with setColumn, the header reads the typed words and a formula can use the derived name', () => {
    const { t, a, b } = two()
    let next = setColumn(t, a.id, { ...typedColumnName(t, a.id, 'Drop height')!, unit: 'm' })
    next = setColumn(next, b.id, { formula: 'Drop_height*2' })
    next = { ...next, rows: [[3, null]] }
    expect(headerOf(next.columns[0])).toBe('Drop height / m')
    expect(resolveValues(next).values[0][1]).toBe(6)
  })

  it('typing a plain name over a caption drops the label', () => {
    const { t, a } = two()
    const named = setColumn(t, a.id, { name: 'Drop_height', label: 'Drop height' })
    const renamed = setColumn(named, a.id, typedColumnName(named, a.id, 'h')!)
    expect(renamed.columns[0].name).toBe('h')
    expect(renamed.columns[0].label).toBeUndefined()
  })
})
