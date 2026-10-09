// F9 review: the maths field now keeps a typed space as \; — after a function's name that space must
// still read as "the function of what follows" (sin 30 = 0.5), on the Maths screen and a vector card.

import { beforeEach, describe, expect, it } from 'vitest'
import { latexToMath } from '../src/renderer/src/math/latexToMath'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { resetGlobals } from './helpers/globals'

beforeEach(resetGlobals)
const opts = { vars: {}, ans: 0, angle: 'deg' as const }

describe('a space after a function name', () => {
  it('reads as the function of what follows', () => {
    expect(latexToMath('\\sin\\;30')).toBe(latexToMath('\\sin 30'))
    expect(latexToMath('\\cos\\,60')).toBe(latexToMath('\\cos 60'))
    expect(latexToMath('\\ln\\;\\;2')).toBe(latexToMath('\\ln 2'))
    expect(latexToMath('\\sin^{2}\\;x')).toBe(latexToMath('\\sin^{2}x'))
    // After a log's base, and before d/dx's body (second checker pass).
    expect(latexToMath('\\log_{2}\\;8')).toBe(latexToMath('\\log_{2}8'))
    expect(latexToMath('\\frac{d}{dx}\\;x^{2}')).toBe(latexToMath('\\frac{d}{dx}x^{2}'))
  })

  it('log₂ 8 = 3 with a typed space after the base', () => {
    expect(evaluateInput('COMP', '\\log_{2}\\;8', opts)!.main).toBe('3')
  })

  it('gives the answer on the Maths screen: sin 30 = 0.5', () => {
    expect(evaluateInput('COMP', '\\sin\\;30', opts)!.main).toBe('0.5')
  })

  it('keeps the spaces that separate words: 10 N m ∠ 30°', () => {
    expect(latexToMath('10\\;N\\;m\\angle30^{\\circ}')).toMatch(/10 N m/)
  })
})
