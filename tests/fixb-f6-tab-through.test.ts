// F6 review: the Properties boxes show the screen's decimals now, so tabbing through a box must not
// write the rounded number back into the object.

import { describe, expect, it } from 'vitest'
import { committedValue } from '../src/renderer/src/ui/fields'
import { readSource } from './helpers/repo'

describe('NumField commits only what the student edited', () => {
  it('nothing for a box only tabbed through; the typed value for an edited one', () => {
    expect(committedValue('1.23', false)).toBeNull() // shows 1.2345 rounded: must not become 1.23
    expect(committedValue('1.23', true)).toBe(1.23)
    expect(committedValue('2*3', true)).toBe(6)
  })

  it('the field marks itself edited only when its text changes', () => {
    const src = readSource('src/renderer/src/ui/fields.tsx')
    expect(src).toMatch(/onChange=\{\(e\) => \{\s*setText\(e\.target\.value\)\s*setEdited\(true\)/)
    expect(src).toContain('const v = committedValue(text, edited)')
  })
})
