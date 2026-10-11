// T7 proof for audit bug 14 [C4]: "Significant figures mode fails on superscript notation
// (panels/calcModes.tsx:984)".
//
// Verdict REAL. The Significant figures box reads the value it was given with
// `Number(num.replace(/[×x]\s*10\^?/i, 'e'))`, a reader that only knows the caret form. PhysLab
// itself writes "3 × 10⁴" with a raised power, and the panel then shows the scientific-notation
// line as "—" because the reader produced NaN (measured below).
//
// The reader is inline in the panel's JSX, so this is a source pin: it fails while that expression
// is there and passes once the box reads a raised power like every other reader in the app.
import { describe, expect, it } from 'vitest'
import { readSource } from './helpers/repo'

const SRC = readSource('src/renderer/src/panels/calcModes.tsx')
/** The old reader: "3 × 10⁴" → "3e⁴" → Number(...) → NaN. */
const OLD_READER = String.raw`replace(/[×x]\s*10\^?/i, 'e')`

describe('G14: the significant-figures box cannot read a raised power', () => {
  it('why it matters: the old reader turns "3 × 10⁴" into NaN', () => {
    expect(Number('3 × 10⁴'.replace(/[×x]\s*10\^?/i, 'e'))).toBeNaN()
  })

  it('the box no longer reads its own value with the caret-only reader', () => {
    expect(SRC).not.toContain(OLD_READER)
  })
})
