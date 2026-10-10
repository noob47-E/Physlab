// Which mode a saved session opens. Two routes decide it: savedMode() in app/layout.ts reads the saved
// layout and hands on a mode this build hides or does not have exactly as it was saved, and App.tsx
// then opens `openableMode(savedMode() ?? 'vectors')`, which turns those into Problem Sets. This file
// pins what each one returns for every kind of saved layout (CW8a): savedMode's own values stay as
// they were (the settings golden sweep depends on them), and the App expression is the one that opens
// Problem Sets. It also pins the Calculator rows of the Ctrl+K palette, which are built from the
// calculator's own mode names.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { savedMode } from '../src/renderer/src/app/layout'
import { HIDDEN_MODES, MODES, openableMode, type ModeId } from '../src/renderer/src/app/modes'

/** The mode App.tsx opens for a given saved layout (the expression is copied from App.tsx:118). */
function appOpens(raw: string | null): ModeId {
  vi.mocked(localStorage.getItem).mockReturnValue(raw)
  return openableMode(savedMode() ?? 'vectors')
}

/** What savedMode() itself returns for a given saved layout. */
function savedAs(raw: string | null): unknown {
  vi.mocked(localStorage.getItem).mockReturnValue(raw)
  return savedMode()
}

const layout = (mode: unknown) => JSON.stringify({ v: 1, app: '0.9.0', w: 1000, h: 800, layout: {}, mode })

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(),
    setItem: vi.fn()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('which mode a saved session opens', () => {
  it('a ready mode is reopened as it was left, for every ready mode', () => {
    for (const m of MODES.filter((d) => d.ready)) {
      expect(savedAs(layout(m.id)), m.id).toBe(m.id)
      expect(appOpens(layout(m.id)), m.id).toBe(m.id)
    }
  })

  it('a saved graphing session reopens Graphing', () => {
    expect(savedAs(layout('graphing'))).toBe('graphing')
    expect(appOpens(layout('graphing'))).toBe('graphing')
  })

  it('a mode in HIDDEN_MODES opens Problem Sets (none is hidden in this build, so the set is put in for this test)', () => {
    // HIDDEN_MODES is a Set at run time, typed read-only. It is restored in the finally block.
    const hidden = HIDDEN_MODES as Set<ModeId>
    hidden.add('graphing')
    try {
      // savedMode hands a hidden mode on as it was saved; App's openableMode is what opens Problem Sets.
      expect(savedAs(layout('graphing'))).toBe('graphing')
      expect(appOpens(layout('graphing'))).toBe('problems')
    } finally {
      hidden.delete('graphing')
    }
  })

  it('a mode this build does not have (Class Results, a made-up id) opens Problem Sets', () => {
    // savedMode hands these on as saved ('classresults-old', 'nonsense'); App's openableMode opens Problem Sets.
    expect(savedAs(layout('classresults-old'))).toBe('classresults-old')
    expect(appOpens(layout('classresults-old'))).toBe('problems')
    expect(savedAs(layout('nonsense'))).toBe('nonsense')
    expect(appOpens(layout('nonsense'))).toBe('problems')
  })

  it('a mode in MODES that is not ready (coming soon) opens Vectors, not the mode itself', () => {
    expect(MODES.find((d) => d.id === 'mechanics')?.ready).toBe(false)
    expect(savedAs(layout('mechanics'))).toBeNull()
    expect(appOpens(layout('mechanics'))).toBe('vectors')
  })

  it('a coming-soon mode that is also hidden still opens Vectors (the coming-soon check comes first)', () => {
    const hidden = HIDDEN_MODES as Set<ModeId>
    hidden.add('mechanics')
    try {
      expect(savedAs(layout('mechanics'))).toBeNull()
      expect(appOpens(layout('mechanics'))).toBe('vectors')
    } finally {
      hidden.delete('mechanics')
    }
  })

  it('no saved layout at all opens Vectors', () => {
    expect(savedAs(null)).toBeNull()
    expect(appOpens(null)).toBe('vectors')
  })

  it('damaged JSON opens Vectors', () => {
    expect(savedAs('{mode:"graphing"}')).toBeNull()
    expect(appOpens('{mode:"graphing"}')).toBe('vectors')
  })

  it('a mode that is a number (damaged file) opens Problem Sets', () => {
    // savedMode hands the number on as saved (123); App's openableMode opens Problem Sets.
    expect(savedAs('{"mode": 123}')).toBe(123)
    expect(appOpens('{"mode": 123}')).toBe('problems')
  })

  it('a saved layout with no mode field opens Vectors', () => {
    const noMode = '{"v":1,"app":"0.9.0","w":1000,"h":800,"layout":{}}'
    expect(savedAs(noMode)).toBeNull()
    expect(appOpens(noMode)).toBe('vectors')
  })

  it('JSON that is not an object (null, an array) opens Vectors', () => {
    expect(savedAs('null')).toBeNull()
    expect(appOpens('null')).toBe('vectors')
    expect(savedAs('[]')).toBeNull()
    expect(appOpens('[]')).toBe('vectors')
  })
})

describe('the Calculator rows of the Ctrl+K palette', () => {
  let palette: typeof import('../src/renderer/src/app/SearchPalette')

  beforeAll(async () => {
    palette = await import('../src/renderer/src/app/SearchPalette')
  }, 120_000)

  it('lists the fifteen calculator modes, in order, with the words the Maths screen uses', () => {
    const rows = palette.buildItems().filter((r) => r.group === 'Calculator').map((r) => [r.title, r.hint])
    expect(rows).toEqual([
      ['Calculator: Numbers', 'Everyday calculating: fractions, roots, powers, trigonometry, calculus'],
      ['Calculator: Complex', 'Complex numbers, with modulus, argument and conjugate'],
      ['Calculator: Bases', 'Binary, octal and hexadecimal'],
      ['Calculator: Matrices', 'Matrices'],
      ['Calculator: Vectors', 'Vectors'],
      ['Calculator: Statistics', 'Statistics and regression'],
      ['Calculator: Distributions', 'Probability distributions'],
      ['Calculator: Table', 'A table of values for a function'],
      ['Calculator: Equations', 'Simultaneous and polynomial equations'],
      ['Calculator: Inequalities', 'Polynomial inequalities'],
      ['Calculator: Ratio', 'Proportions'],
      ['Calculator: Sheet', 'A small spreadsheet'],
      ['Calculator: Units', 'Unit conversion'],
      ['Calculator: Constants', 'Physical constants'],
      ['Calculator: Measure', 'Significant figures and uncertainty']
    ])
  })
})
