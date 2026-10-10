// CW6c, one list of names and Greek: every reader and writer of a name or a Greek letter in the
// CW6c files, pinned over one shared corpus (tests/nameCorpus.ts) — Pure Maths' letter splitter
// (writeTimes) and its maths and unknowns, the calculus route's spelling and its letter, the answer
// labels, and a name in a scene formula. tests/fixtures/nameLists.txt holds what each gave on
// phase-0.9 4f9d651, before their lists moved into math/names.ts; the move must leave every line as
// it is. A change that is meant is approved by the owner first (OWNER-APPROVALS.md, CW6c-…) and
// rewritten in a commit of its own that names it:
// PHYSLAB_GOLDEN_UPDATE=1 npx vitest run tests/nameList.test.ts

import fs from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({ tryCas: () => null, runCas: () => null }))

import katex from 'katex'
import { CONSTANT_NAMES, GREEK_LETTERS, GREEK_NAMES } from '../src/renderer/src/math/names'
import { factoriseComplexWorking } from '../src/renderer/src/math/pure/complex'
import { factoriseWorking } from '../src/renderer/src/math/pure/factor'
import { texToPlain, type Working } from '../src/renderer/src/math/pure/work'
import { exprTex, parseExpr, varsOf, writeTimes } from '../src/renderer/src/math/pure/mono'
import { calculusVariable, engineRequestFor, gluedFunctionsApart, spelledOut } from '../src/renderer/src/math/pure/store'
import { labelTex, labelText } from '../src/renderer/src/calc/labels'
import { isValidName } from '../src/renderer/src/core/naming'
import { renameInObjects } from '../src/renderer/src/core/rename'
import type { SceneObject } from '../src/renderer/src/core/types'
import { resetGlobals } from './helpers/globals'
import { REPO_ROOT } from './helpers/repo'
import { CORPUS } from './nameCorpus'

beforeEach(resetGlobals)

const PINNED = join(REPO_ROOT, 'tests', 'fixtures', 'nameLists.txt')

const said = (run: () => unknown): string => {
  try {
    return JSON.stringify(run()) ?? 'undefined'
  } catch (e) {
    return `THROWS ${e instanceof Error ? e.message : String(e)}`
  }
}

const num = (id: string, name: string, expr: string) => ({ id, type: 'number', name, expr }) as unknown as SceneObject

/** The formula of `of` after the object `id` is renamed `next`. */
function renamed(objects: SceneObject[], id: string, next: string, of: string): string {
  const all = Object.fromEntries(objects.map((o) => [o.id, o]))
  const changed = renameInObjects(all, id, next).find((o) => o.id === of) ?? all[of]
  return changed.type === 'number' ? changed.expr : ''
}

/** Each reader by the name its line carries, so a changed line says which place reads a name differently. */
const READERS: [string, (t: string) => string][] = [
  ['writeTimes', (t) => said(() => writeTimes(t))],
  ['pure maths', (t) => said(() => exprTex(parseExpr(t)))],
  ['pure unknowns', (t) => said(() => varsOf(parseExpr(t)))],
  ['spelledOut', (t) => said(() => spelledOut(t))],
  ['gluedFunctionsApart', (t) => said(() => gluedFunctionsApart(t))],
  ['calculusVariable', (t) => said(() => calculusVariable(t))],
  ['integrate request', (t) => said(() => engineRequestFor('integrate', t, false))],
  ['differentiate by it', (t) => said(() => engineRequestFor('differentiate', `x^2, ${t}`, false))],
  ['labelTex', (t) => said(() => labelTex(t))],
  ['labelText', (t) => said(() => labelText(t))],
  ['isValidName', (t) => said(() => isValidName(t))],
  ['rename A to Q', (t) => said(() => renamed([num('a', 'A', '1'), num('k', 'k', `A${t} + ${t}A + A + 2A + ${t}`)], 'a', 'Q', 'k'))],
  ['rename it to Q', (t) => said(() => renamed([num('n', t, '1'), num('k', 'k', `${t} + 2${t} + ${t}′ + B${t} + ${t}α`)], 'n', 'Q', 'k'))]
]

function readings(): string[] {
  return CORPUS.flatMap((t) => READERS.map(([name, read]) => `${JSON.stringify(t)}  ${name}  =>  ${read(t)}`))
}

describe('CW6c: every name and Greek reader over one corpus', () => {
  it('reads every corpus line exactly as phase-0.9 4f9d651 did (tests/fixtures/nameLists.txt)', () => {
    const lines = readings()
    if (process.env.PHYSLAB_GOLDEN_UPDATE === '1') fs.writeFileSync(PINNED, lines.join('\n') + '\n')
    const old = fs.readFileSync(PINNED, 'utf8').replace(/\r\n/g, '\n').split('\n')
    if (old.at(-1) === '') old.pop()
    const changed: string[] = []
    for (let i = 0; i < Math.max(old.length, lines.length); i++) {
      if (old[i] !== lines[i]) changed.push(`line ${i + 1}:\n  - ${old[i] ?? '(none)'}\n  + ${lines[i] ?? '(none)'}`)
    }
    expect(changed.slice(0, 40).join('\n'), `${changed.length} line(s) changed`).toBe('')
  })

  it('the corpus has no line twice, so a changed line names one input', () => {
    expect(new Set(CORPUS).size).toBe(CORPUS.length)
  })
})

describe('math/names.ts, the one list', () => {
  it('holds the 24 lowercase Greek letters in order, each spelt name a KaTeX command that draws its letter (ϵ and ϕ in TeX’s forms)', () => {
    expect(GREEK_LETTERS.map((g) => g.letter).join('')).toBe('αβγδεζηθικλμνξοπρστυφχψω')
    const drawnAs: Record<string, string> = { epsilon: 'ϵ', phi: 'ϕ' }
    for (const g of GREEK_LETTERS) {
      expect(katex.renderToString(`\\${g.name}`, { throwOnError: true }), g.name).toContain(drawnAs[g.name] ?? g.letter)
    }
    expect(GREEK_NAMES.size).toBe(24)
  })

  it('names a number, never an unknown: e, E, pi, i and Infinity', () => {
    expect([...CONSTANT_NAMES]).toEqual(['e', 'E', 'pi', 'i', 'Infinity'])
  })
})

// [answer may change] items, proved here and NOT applied: each it.fails passes while the app still
// writes what it writes today, and fails (so the line must move to an ordinary `it`) once the owner's
// approved change lands. OWNER-APPROVALS.md has one row per item.
describe('CW6c, parked for the owner', () => {
  const said = (w: Working): string[] => [...w.moves.map((m) => texToPlain(m.head)), texToPlain(w.check ?? '')]

  // CW6c-1: Factorise works in a Greek unknown with the spelt name ("theta") and drops the letter
  // wherever the name went through LaTeX into a sentence, because texToPlain does not know \theta.
  // Its twin with i allowed (factoriseComplexWorking) already writes θ (spellUnknown, complex.ts).
  it('CW6c-1 evidence: what a student reads today when factorising θ² + 5θ + 6 and θ² − 1', () => {
    expect(said(factoriseWorking('θ^2 + 5θ + 6'))).toEqual([
      'Multiply the first and last coefficients: 1 × 6 = 6. Now find two numbers that multiply to 6 and add to 5.',
      'Write the middle term as 2theta + 3theta.',
      'Put the four terms into two pairs and take the common factor out of each pair.',
      'Both pieces now share ( + 2), so take that out as well.',
      'Multiplying back out gives ² + 5 + 6 — the original.'
    ])
    expect(said(factoriseWorking('θ^2 - 1'))[0]).toBe('Two terms, and it is one square take away another: squared minus 1 squared.')
    expect(said(factoriseComplexWorking('θ^2 + 4')).join(' ')).toContain('subtract each root from θ')
  })
  it.fails('CW6c-1: factorising θ² + 5θ + 6 writes θ in every sentence — "2θ + 3θ", "(θ + 2)", "θ² + 5θ + 6"', () => {
    const lines = said(factoriseWorking('θ^2 + 5θ + 6'))
    expect(lines).toContain('Write the middle term as 2θ + 3θ.')
    expect(lines).toContain('Both pieces now share (θ + 2), so take that out as well.')
    expect(lines.at(-1)).toBe('Multiplying back out gives θ² + 5θ + 6 — the original.')
  })
  it.fails('CW6c-1: factorising θ² − 1 says "θ squared minus 1 squared"', () => {
    expect(said(factoriseWorking('θ^2 - 1'))[0]).toBe('Two terms, and it is one square take away another: θ squared minus 1 squared.')
  })

  // CW6c-2: omicron is the one Greek letter (apart from pi, a number) the answer labels do not
  // know, although KaTeX draws \omicron: a Solve in an unknown spelt omicron writes "omicron" in its
  // sentences where every other Greek unknown is written as its letter.
  it.fails('CW6c-2: the answer labels write the unknown omicron as ο, as they write theta as θ', () => {
    expect(labelText('omicron =')).toBe('ο =')
    expect(labelTex('omicron')).toBe('\\omicron')
  })
  it('CW6c-2 evidence: today omicron stays a word while theta becomes its letter', () => {
    expect(labelText('omicron =')).toBe('omicron =')
    expect(labelTex('omicron')).toBeNull()
    expect(labelText('theta =')).toBe('θ =')
  })
})
