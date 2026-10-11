// T7 proof for audit bug 3 [C1]: "Unconstrained term explosion in step-by-step simplification
// (math/pure/run.ts:312)".
//
// Verdict REAL, with the mechanism corrected: `expandWorking`'s own multiplication loop
// (math/pure/run.ts:312-313) builds products with bare `mulTerm` and never applies the exact
// working's own size limits, while the same product through `eMul` (math/pure/mono.ts:100-104)
// is refused with "more than 2000 terms". So `(x+y)^45 (a+b)^45` — a product of 2116 terms — is
// refused when the parser meets it as a power and printed in full when it meets it as two brackets.
// It is not the exponential blow-up the audit described: many linear factors stay degree+1 terms.
import { describe, expect, it } from 'vitest'
import { eMul, parseExpr } from '../src/renderer/src/math/pure/mono'
import { runPure } from '../src/renderer/src/math/pure/run'

const PRODUCT = '(x+y)^45*(a+b)^45'

describe('G3: the Expand path ignores the exact-working term limit', () => {
  it('eMul refuses the product: the limit exists and says so', () => {
    expect(() => eMul(parseExpr('(x+y)^45'), parseExpr('(a+b)^45'))).toThrow(/more than 2000 terms/)
  })

  it('Expand refuses the same product instead of printing 2116 terms', () => {
    const res = runPure('expand', PRODUCT)
    expect(res.error).toMatch(/more than 2000 terms|too many terms/i)
  })
})
