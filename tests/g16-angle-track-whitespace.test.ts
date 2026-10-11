// T7 proof for audit bug 16 [C4]: "Evaluation crash on angle expressions with whitespace
// (panels/Graphs.tsx:102, 110)".
//
// Verdict REAL: the track box rewrites a typed "angle(...)" to "angleBetween(...)" with
// `/^angle\(/`, which does not match "angle (A, B)" — and mathjs has no `angle` function, so the
// track the student added never produces a value. The transform is inline in the JSX, so this is a
// source pin; the mechanism is shown with the real evaluator below.
import { describe, expect, it } from 'vitest'
import { math } from '../src/renderer/src/math/expr'
import { readSource } from './helpers/repo'

const SRC = readSource('src/renderer/src/panels/Graphs.tsx')
const SCOPE = { A: [1, 0, 0], B: [0, 1, 0] }

describe('G16: a track typed "angle (A, B)" is not rewritten and cannot be evaluated', () => {
  it('why it matters: mathjs has no angle() of its own', () => {
    expect(() => math.evaluate('angle (A, B)', SCOPE)).toThrow(/angle/)
  })

  it('the rewritten name is what the graph understands', () => {
    expect(math.evaluate('angleBetween(A, B)', SCOPE)).toBeCloseTo(90, 6)
  })

  it('the track box accepts whitespace before the bracket', () => {
    expect(SRC).not.toContain(String.raw`/^angle\(/`)
  })
})
