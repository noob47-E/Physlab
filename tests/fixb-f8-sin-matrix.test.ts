// F8 (browser check CALC-06): sin(MatA) on the Matrices screen said only "I can't work that out.";
// it must say why, in plain words.

import { describe, expect, it } from 'vitest'
import { errorSentence } from '../src/renderer/src/calc/errors'
import { math } from '../src/renderer/src/math/expr'

describe('F8: sin(MatA) refusal message', () => {
  it('says in plain words that the function takes a number, not a matrix', () => {
    let caught: unknown = null
    try {
      math.evaluate('sin(MatA)', { MatA: math.matrix([[1, 0], [0, 1]]) })
    } catch (e) {
      caught = e
    }
    expect(caught).not.toBeNull()
    expect(errorSentence(caught).sentence).toBe('That function takes a number, not a matrix.')
  })

  it('leaves the other sentences as they were', () => {
    expect(errorSentence(new Error('Unexpected end of expression')).sentence).toBe("I can't read that — check the brackets, and that every operator has a number on each side.")
  })
})
