// B8 (R4.9): mathjs adds a number to every component of a vector, so 3 + <4, 0> was <7, 3> — an answer
// no physics or maths course gives. A number plus or minus a vector is refused in plain words on every
// route that reads typed maths; a vector plus a vector, a number plus a number and a whole matrix (the
// Calculator's MatA + 2) read as before.
import { describe, expect, it } from 'vitest'
import { math, preprocess } from '../src/renderer/src/math/expr'

const value = (s: string): unknown => math.evaluate(preprocess(s))
const SENTENCE = /A number and a vector cannot be added or taken away/

describe('B8 — a number and a vector are never added', () => {
  it('refuses 3 + <4, 0>, <4, 0> - 3 and 2 + (1, 2) in words', () => {
    for (const line of ['3 + <4, 0>', '<4, 0> - 3', '2 + (1, 2)', '<1, 2, 3> + 1']) expect(() => value(line), line).toThrow(SENTENCE)
  })

  it('guard: vector + vector, number + number, a scaled vector and a matrix with a number read as before', () => {
    expect(value('<1, 2> + <3, 4>')).toEqual([4, 6, 0])
    expect(value('3 + 4')).toBe(7)
    expect(value('2 × <1, 2> + <1, 1>')).toEqual([3, 5, 0])
    expect((math.evaluate('[[1, 2], [3, 4]] + 2') as { toArray: () => number[][] }).toArray()).toEqual([
      [3, 4],
      [5, 6]
    ])
  })
})
