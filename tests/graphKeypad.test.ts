import { describe, expect, it } from 'vitest'
import { applyGraphKey, GRAPH_KEYPAD } from '../src/renderer/src/panels/graphKeypad'

const press = (id: string, v: string, s: number, e = s) => applyGraphKey(id, v, s, e)

describe('graph keypad insertion at the caret', () => {
  it('inserts a letter at the caret, not at the end', () => {
    expect(press('x', 'y = 2', 4)).toEqual({ value: 'y = x2', start: 5, end: 5 })
  })
  it('puts the caret inside the brackets of a function key', () => {
    expect(press('sqrt', 'y = ', 4)).toEqual({ value: 'y = sqrt()', start: 9, end: 9 })
    expect(press('pow', 'y = x', 5)).toEqual({ value: 'y = x^()', start: 7, end: 7 })
  })
  it('wraps a selection in a function key', () => {
    expect(press('sin', 'y = x+1', 4, 7)).toEqual({ value: 'y = sin(x+1)', start: 11, end: 11 })
  })
  it('replaces a selection with a plain key', () => {
    expect(press('1', 'y = abc', 4, 7)).toEqual({ value: 'y = 1', start: 5, end: 5 })
  })
  it('fraction leaves the caret in the numerator', () => {
    expect(press('frac', '', 0)).toEqual({ value: '()/()', start: 1, end: 1 })
  })
  it('moves and deletes at the caret', () => {
    expect(press('left', 'abc', 2)?.start).toBe(1)
    expect(press('left', 'abc', 0)?.start).toBe(0)
    expect(press('right', 'abc', 3)?.start).toBe(3)
    expect(press('del', 'abc', 2)).toEqual({ value: 'ac', start: 1, end: 1 })
    expect(press('del', 'abc', 0)).toEqual({ value: 'abc', start: 0, end: 0 })
    expect(press('del', 'abcd', 1, 3)).toEqual({ value: 'ad', start: 1, end: 1 })
  })
  it('Enter is left to the caller and every key has a hint', () => {
    expect(press('enter', 'y = x', 5)).toBeNull()
    for (const k of GRAPH_KEYPAD.keys) expect(k.hint.length).toBeGreaterThan(0)
  })
})
