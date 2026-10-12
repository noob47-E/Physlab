// Part 7 of 9 of the full re-verification of Rubi section 1 (see rubi-verify.ts). It runs only with PHYSLAB_RUBI_FULL=1
// (npm run test:rubi-full); the default run checks a sample in rubi-section1.test.ts. The verifier is loaded only when
// this part runs, so the default run does not pay for mathjs here.
import { describe, it, expect } from 'vitest'

describe.skipIf(process.env.PHYSLAB_RUBI_FULL !== '1')('Rubi section 1, full re-verification, part 7 of 9', () => {
  it('every kept item in part 7 re-verifies at 40 digits', async () => {
    const { checkPart } = await import('./rubi-verify')
    expect(checkPart(7, 9)).toEqual([])
  }, 120_000)
})
