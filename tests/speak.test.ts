// LaTeX spoken as plain characters (questions/speak.ts, CW4): what speakTex writes today, pinned,
// so a later change to the one reader shows every sentence it changes.

import { describe, expect, it } from 'vitest'
import { speakTex } from '../src/renderer/src/questions/speak'

describe('speakTex', () => {
  it.each([
    [String.raw`\frac{1}{2}`, '1/2'],
    [String.raw`A \cap B`, 'A ∩ B'],
    [String.raw`x^{2}`, 'x²'],
    [String.raw`x^{n+1}`, 'x^(n+1)'],
    [String.raw`\sqrt{x}`, '√x'],
    [String.raw`\mu R`, 'μR'],
    [String.raw`\alpha + \beta`, 'α + β'],
    [String.raw`x \le 3`, 'x ≤ 3'],
    [String.raw`\binom{5}{2}`, 'C(5, 2)'],
    [String.raw`\vec{v}`, 'v⃗'],
    [String.raw`\sin\theta`, 'sin θ'],
    [String.raw`\not\in`, '∉'],
    [String.raw`\{1, 2\}`, '{1, 2}'],
    [String.raw`y_{n-1}`, 'y_(n-1)'],
    // Today a power of ten keeps a caret in the plain sentence (recorded in reports/P-CW4-REPORT.md).
    [String.raw`3\times 10^{-4}`, '3× 10^-4']
  ])('%s → %s', (tex, plain) => {
    expect(speakTex(tex, new Set())).toBe(plain)
  })

  it("keeps a chip of one of the question's variables whole, and reads any other {name} as grouping", () => {
    expect(speakTex('{a} + {b}', new Set(['a']))).toBe('{a} + b')
  })
})
