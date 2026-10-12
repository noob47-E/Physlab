// G2B: the second half of the randomized differential (2,000 in all with atomsDifferential.test.ts), in a file of its
// own so the two halves run side by side.
import { describe } from 'vitest'
import { differentialBlock } from './elementaryGen'

describe('the randomized differential, derivatives (second half)', () => {
  differentialBlock(20261014, 500)
  differentialBlock(20261015, 500)
})
