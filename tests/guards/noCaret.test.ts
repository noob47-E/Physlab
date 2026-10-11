// Guard (CLEANUP-PLAN.md CW1): no caret and no e-notation in what a golden sweep recorded a
// student seeing. A raw `^` or `1e-7` on screen means a number skipped the number writer
// (math/format.ts), which writes 10⁻⁷ and x².
//
// Each answer in tests/golden/out is split into its pieces (" | ", " || ", "⏎"); a piece that is
// LaTeX (a \command, ^{…}, or a tex/exact/rule field) is left alone, since KaTeX draws its ^ as a
// power. What is left must have no ^ and no e-notation, except the pieces listed in
// tests/guards/caret-baseline.txt: today's, each to leave the list in the part that fixes it (the
// guard fails until it is taken out, so the list only ever shrinks). Rewrite the list with
// PHYSLAB_CARET_UPDATE=1 (its own flag: refreshing the golden files must not grow it quietly), in a
// commit that says why it changed.

import fs from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../helpers/repo'

const OUT = join(REPO_ROOT, 'tests', 'golden', 'out')
const BASELINE = join(REPO_ROOT, 'tests', 'guards', 'caret-baseline.txt')

/** Sweeps that record data, not a screen: each with the reason it is not judged. */
const NOT_A_SCREEN: Record<string, string> = {
  cas: "the algebra worker's raw reply; the app writes its numbers through its own writer",
  'cas-full': "the algebra worker's raw reply, as for cas",
  files: 'the saved project file itself (JSON), which no student reads',
  reader: 'the text each route hands mathjs before anything is worked out (CW6a), which no student reads'
}

/** A piece that is data inside a judged sweep: a Numbas author's own formula (name = "…"), as the bank holds it, or exported JME part JSON. */
const isAuthorFormula = (sweep: string, piece: string): boolean => sweep === 'numbas' && (piece.includes(' = "') || piece.startsWith('{"type":'))

// A field name must end at a colon or a space: "text: x^2" is plain text, not a tex field.
const isTex = (piece: string): boolean => /\\[a-zA-Z]|\^\{|^\s*(tex|TEX|ANS|exact|RULE)(:|\s)/.test(piece)
const isRaw = (piece: string): boolean => piece.includes('^') || /(?<![A-Za-z_#])\d(?:\.\d+)?e[-+]?\d/.test(piece)

/** Every plain-text piece with a caret or e-notation, as "sweep<TAB>piece", in file order, once each. */
function rawPieces(): string[] {
  const found = new Set<string>()
  for (const file of fs.readdirSync(OUT).filter((f) => f.endsWith('.txt')).sort()) {
    const sweep = file.replace(/\.txt$/, '')
    if (sweep in NOT_A_SCREEN) continue
    for (const line of fs.readFileSync(join(OUT, file), 'utf8').split(/\r?\n/)) {
      const at = line.indexOf('  =>  ')
      const seen = at >= 0 ? line.slice(at + 6) : line
      for (const piece of seen.split(/ \|\| | \| | ⏎ /)) {
        const p = piece.trim()
        if (p && !isTex(p) && !isAuthorFormula(sweep, p) && isRaw(p)) found.add(`${sweep}\t${p}`)
      }
    }
  }
  return [...found]
}

describe('guard: no caret or e-notation on screen', () => {
  const now = rawPieces()
  if (process.env.PHYSLAB_CARET_UPDATE === '1') fs.writeFileSync(BASELINE, now.join('\n') + '\n')
  const listed = new Set(fs.readFileSync(BASELINE, 'utf8').split(/\r?\n/).filter(Boolean))

  it('no new piece has a caret or e-notation', () => {
    expect(now.filter((p) => !listed.has(p))).toEqual([])
  })

  it('a fixed piece leaves the list (the list only shrinks)', () => {
    const seen = new Set(now)
    expect([...listed].filter((p) => !seen.has(p))).toEqual([])
  })

  it('judges LaTeX as LaTeX and plain text as plain text', () => {
    expect(isTex('\\theta = 53.13^\\circ')).toBe(true)
    expect(isTex('tex: x^{2}')).toBe(true)
    expect(isTex('text: For A^b, A must be 2 dimensional')).toBe(false)
    expect(isTex('exact 1\\times 10^{100}')).toBe(true)
    expect(isRaw('5.000049995×10^9')).toBe(true)
    expect(isRaw('vel=[1.773e-6, 0]')).toBe(true)
    expect(isRaw('#1e3a5f')).toBe(false)
    expect(isRaw('10⁻⁶ m')).toBe(false)
  })
})
