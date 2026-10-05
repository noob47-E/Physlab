import { describe, it, expect } from 'vitest'
import { decideKey, recall, type KeyState } from '../src/renderer/src/app/commandBarKeys'

const base: KeyState = {
  key: 'Enter', open: true, text: '', suggestions: 5, active: 0, chosen: false, historyLength: 3, histIdx: -1
}
const k = (o: Partial<KeyState>) => decideKey({ ...base, ...o })

describe('command bar keys', () => {
  it('K1: Enter takes the suggestion the arrows highlighted', () => {
    expect(k({ key: 'Enter', text: 'sol', active: 2, chosen: true })).toEqual({ kind: 'take', index: 2 })
  })
  it('K1: Enter runs the typed line when nothing was highlighted', () => {
    expect(k({ key: 'Enter', text: '2+2', active: 0, chosen: false })).toEqual({ kind: 'run' })
  })
  it('K1: Enter on an empty line with nothing highlighted does nothing', () => {
    expect(k({ key: 'Enter', text: '  ', chosen: false })).toEqual({ kind: 'none' })
  })
  it('K2: arrows walk the visible suggestions while the list is open, even on an empty line', () => {
    expect(k({ key: 'ArrowDown', text: '', active: 0 })).toEqual({ kind: 'move', active: 1 })
    expect(k({ key: 'ArrowDown', text: 'x', active: 4 })).toEqual({ kind: 'move', active: 4 })
    expect(k({ key: 'ArrowUp', text: 'x', active: 3 })).toEqual({ kind: 'move', active: 2 })
    expect(k({ key: 'ArrowUp', text: 'x', active: 0 })).toEqual({ kind: 'move', active: 0 })
  })
  it('K3: Tab leaves the bar when nothing was highlighted', () => {
    expect(k({ key: 'Tab', text: 'so' })).toEqual({ kind: 'default' })
  })
  it('K3: Tab completes a suggestion the arrows highlighted', () => {
    expect(k({ key: 'Tab', text: 'so', active: 1, chosen: true })).toEqual({ kind: 'take', index: 1 })
  })
  it('history walk is unchanged with the list closed', () => {
    expect(k({ key: 'ArrowUp', open: false, histIdx: -1 })).toEqual({ kind: 'history', histIdx: 0 })
    expect(k({ key: 'ArrowUp', open: false, histIdx: 2 })).toEqual({ kind: 'history', histIdx: 2 })
    expect(k({ key: 'ArrowDown', open: false, histIdx: 1 })).toEqual({ kind: 'history', histIdx: 0 })
    expect(k({ key: 'ArrowDown', open: false, histIdx: -1 })).toEqual({ kind: 'history', histIdx: -1 })
  })
  it('history walk is used when there are no suggestions', () => {
    expect(k({ key: 'ArrowUp', suggestions: 0, histIdx: 0 })).toEqual({ kind: 'history', histIdx: 1 })
  })
  it('Escape closes the list', () => {
    expect(k({ key: 'Escape' })).toEqual({ kind: 'close' })
  })
})

describe('checker follow-ups: a typed line is never lost, a stale pick is never taken', () => {
  it('typed abc (no suggestions), ArrowUp, ArrowDown: the bar reads abc again', () => {
    const history = ['x^2 = 4', 'sin(30)']
    const up = recall(history, -1, 0, 'abc', '')
    expect(up.text).toBe('x^2 = 4')
    const down = recall(history, 0, -1, up.text, up.draft)
    expect(down.text).toBe('abc')
  })

  it('walking up twice and back keeps the draft through every step', () => {
    const history = ['a', 'b', 'c']
    let r = recall(history, -1, 0, 'half', '')
    r = recall(history, 0, 1, r.text, r.draft)
    expect(r.text).toBe('b')
    r = recall(history, 1, 0, r.text, r.draft)
    r = recall(history, 0, -1, r.text, r.draft)
    expect(r.text).toBe('half')
  })

  it('a pick past the end of a shorter list is not taken: Enter runs the line, Tab moves on', () => {
    expect(k({ key: 'Enter', text: 'solve(x', suggestions: 3, active: 13, chosen: true })).toEqual({ kind: 'run' })
    expect(k({ key: 'Tab', text: 'solve(x', suggestions: 3, active: 13, chosen: true })).toEqual({ kind: 'default' })
  })
})
