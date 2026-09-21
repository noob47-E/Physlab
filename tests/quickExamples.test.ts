// The starters an empty drawing offers must work in that empty drawing, one after another.

import { describe, expect, it } from 'vitest'
import { definedName, QUICK_EXAMPLES, referencedNames } from '../src/renderer/src/ui/quickExamples'

describe('the quick examples', () => {
  it('reads names out of an example', () => {
    expect(definedName('R = A + B')).toBe('R')
    expect(definedName('A × B')).toBeUndefined()
    expect(referencedNames('R = A + B')).toEqual(['A', 'B'])
    expect(referencedNames('A × B')).toEqual(['A', 'B'])
    expect(referencedNames('Triangle((0,0), (4,0), (0,3))')).toEqual([])
    expect(referencedNames('y = sin(x)')).toEqual([])
  })

  it('never refers to a name that an earlier example has not defined', () => {
    // "R = A + B" was once the second suggestion, before anything called A or B existed, and the
    // student's second click was an error.
    const defined = new Set<string>()
    for (const e of QUICK_EXAMPLES) {
      for (const n of referencedNames(e.insert)) expect(defined.has(n), `${e.insert} needs ${n} before it is defined`).toBe(true)
      const d = definedName(e.insert)
      if (d) defined.add(d)
    }
  })

  it('offers an empty drawing only things that draw, and says what each one makes in words', () => {
    const drawn = QUICK_EXAMPLES.filter((e) => e.draws)
    expect(drawn.length).toBeGreaterThanOrEqual(4)
    // A capital to start and no brackets, operators or camelCase: words, not a second line of syntax.
    for (const e of QUICK_EXAMPLES) expect(e.desc, e.insert).toMatch(/^[A-Z][A-Za-z ,]+$/)
  })
})
