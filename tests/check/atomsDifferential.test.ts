// G2B: the randomized differential. Seeded random elementary expressions (elementaryGen.ts) and their derivatives by
// the textbook rules, written out as text with no code shared with atoms.ts, go through derivativeCheck: a right one
// may be 'equal' or 'unknown', never 'different'. Each derivative is also perturbed (a dropped chain factor, a sign
// flip, cos for sin, a coefficient ± 1, a missing term, u/u′ for u′/u), and a perturbation that doubles show clearly
// wrong on f's domain must never be 'equal'. The same for antiderivatives, through integralCheck.

import { describe, expect, it } from 'vitest'
import { integralCheck } from '../../src/renderer/src/math/check/checkers'
import { int, seeded } from './gen'
import { add, clearlyDifferent, deriv, differentialBlock, num, perturb, PERTURBATIONS, randomExpr, text } from './elementaryGen'

describe('the randomized differential, derivatives', () => {
  differentialBlock(20261012, 500)
  differentialBlock(20261013, 500)
})

describe('the randomized differential, antiderivatives', () => {
  it('300 random antiderivatives with a constant: right never different; a perturbed one never equal', () => {
    const rand = seeded(20261016)
    let rightEqual = 0
    let wrongTried = 0
    const falseEqual: string[] = []
    const falseDifferent: string[] = []
    for (let i = 0; i < 300; i++) {
      const F = randomExpr(rand, int(rand, 1, 3))
      const f = deriv(F)
      const Fc = add(F, num(int(rand, -9, 9)))
      const v = integralCheck(text(f, i), 'x', text(Fc, i + 1))
      if (v === 'equal') rightEqual++
      if (v === 'different') falseDifferent.push(`∫ ${text(f)} = ${text(Fc)}`)
      // A perturbed antiderivative: its derivative is then a perturbed integrand, so it is wrong where it is clearly so.
      const kind = PERTURBATIONS[i % PERTURBATIONS.length]
      const W = perturb(F, kind, rand)
      if (!W || !clearlyDifferent(deriv(W), f, F, rand)) continue
      wrongTried++
      if (integralCheck(text(f, i), 'x', text(W, i)) === 'equal') falseEqual.push(`${kind}: ∫ ${text(f)} ≠ ${text(W)}`)
    }
    console.log(`antiderivatives: right equal ${rightEqual}/300; wrong ${wrongTried}`)
    expect(falseEqual).toEqual([])
    expect(falseDifferent).toEqual([])
    expect(rightEqual).toBeGreaterThan(300 * 0.85)
  }, 600_000)
})
