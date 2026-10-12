// Planted wrong steps on the surd and complex workings (S1b). Every quadratic with a surd root (real domain) or a complex
// pair (complex domain) is worked by the formula and, for real surds, by completing the square. Each working is then
// damaged in one planted way. A damaged working must be rejected by the validators (accepted = 0) and must show nothing
// on the rendered page (hidden = every one).
//
// The planted kinds:
//   wrong-surd            the radicand is changed (√7 written as √8)
//   wrong-simplification  the coefficient and the radicand are swapped (2√3 written as 3√2)
//   unsimplified-root     a root written in a form that is not simplest (2√3 written as √12)
//   sign-slip             the first root's ± sign is flipped, so both roots name the same value
//   conjugate-swapped     one root's imaginary sign is flipped (a+bi written as a−bi); the pair is then wrong
//   mislabel              the ± step is labelled as a swap of the sides
//   domain-flipped        the step's data names the other domain (the problem's domain is the working's own)
// Reordering a conjugate pair is not planted: the set of roots does not change, so the working is still correct.

import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import { createStepRouter } from '../../../src/renderer/src/math/steps/router'
import { S1A_METHODS } from '../../../src/renderer/src/math/steps/methods'
import { validateWorking } from '../../../src/renderer/src/math/steps/validate'
import { renderWorkingToDoc } from '../../../src/renderer/src/math/steps/render'
import { finishStep } from '../../../src/renderer/src/math/steps/sentences'
import type { Method, Step, Working } from '../../../src/renderer/src/math/steps/types'

type Domain = 'real' | 'complex'
interface Item { input: string; domain: Domain }
interface Base { input: string; domain: Domain; working: Working }
interface Mutant { kind: string; input: string; working: Working }

const KINDS = ['wrong-surd', 'wrong-simplification', 'unsimplified-root', 'sign-slip', 'conjugate-swapped', 'mislabel', 'domain-flipped']
const OR = ' \\text{ or } '

const router = createStepRouter(S1A_METHODS)
const squareRouter = createStepRouter(S1A_METHODS.filter((m) => m.name !== 'Quadratic formula'))

function clone(w: Working): Working {
  return JSON.parse(JSON.stringify(w)) as Working
}

function answersOf(w: Working): Array<{ label: string; tex: string; value?: string }> {
  return Array.isArray(w.answer) ? w.answer : w.answer ? [w.answer] : []
}

function isSquare(n: number): boolean {
  const r = Math.round(Math.sqrt(n))
  return r * r === n
}

/** Quadratics a x² + b x + c = 0 whose roots are surds (D positive, not a square) or complex (D negative). */
function items(): Item[] {
  const out: Item[] = []
  for (let a = 1; a <= 3; a++) {
    for (let b = -8; b <= 8; b++) {
      for (let c = -8; c <= 8; c++) {
        if (b === 0 || c === 0) continue
        const d = b * b - 4 * a * c
        if (d === 0 || (d > 0 && isSquare(d))) continue
        const lead = a === 1 ? '' : String(a)
        const mid = `${b < 0 ? '-' : '+'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}x`
        const end = `${c < 0 ? '-' : '+'} ${Math.abs(c)}`
        out.push({ input: `${lead}x^2 ${mid} ${end} = 0`, domain: d > 0 ? 'real' : 'complex' })
      }
    }
  }
  return out
}

/** The workings of one quadratic: the formula, and completing the square (real surds only). */
function basesOf(item: Item): Base[] {
  const seen = new Set<string>()
  const out: Base[] = []
  const add = (w: Working | undefined): void => {
    if (!w || w.noWorking) return
    const key = JSON.stringify(w)
    if (seen.has(key)) return
    seen.add(key)
    out.push({ input: item.input, domain: item.domain, working: w })
  }
  const formula = router.solve({ job: 'solve', input: item.input, variable: 'x', domain: item.domain })
  add(formula)
  add(formula.anotherWay)
  const square = squareRouter.solve({ job: 'solve', input: item.input, variable: 'x', domain: item.domain })
  add(square)
  add(square.anotherWay)
  return out
}

/** Every surd and every imaginary coefficient in the line and the answers is changed by the same function. */
function mapAll(w: Working, tex: (s: string) => string, plain: (s: string) => string): void {
  const last = w.steps[w.steps.length - 1]
  last.after = tex(String(last.after))
  w.answer = answersOf(w).map((a) => ({ ...a, tex: tex(a.tex), value: a.value === undefined ? undefined : plain(a.value) }))
}

/** Only the first root (the first match in the line, and the first answer) is changed. */
function mapFirst(w: Working, tex: (s: string) => string, plain: (s: string) => string): void {
  const last = w.steps[w.steps.length - 1]
  last.after = tex(String(last.after))
  const answers = answersOf(w)
  if (answers.length > 0) {
    const a = answers[0]
    answers[0] = { ...a, tex: tex(a.tex), value: a.value === undefined ? undefined : plain(a.value) }
  }
  w.answer = answers
}

// The displayed forms: LaTeX (\sqrt{d}, with an optional i in front) and the plain G2-readable form (sqrt(d), with 2*i*sqrt(2)).
const wrongSurdTex = (s: string): string => s.replace(/\\sqrt\{(\d+)\}/g, (_m, d: string) => `\\sqrt{${Number(d) + 1}}`)
const wrongSurdPlain = (s: string): string => s.replace(/sqrt\((\d+)\)/g, (_m, d: string) => `sqrt(${Number(d) + 1})`)
const swapTex = (s: string): string =>
  s.replace(/(\d+)(i?)\\sqrt\{(\d+)\}/g, (m, c: string, i: string, d: string) => (Number(c) === Number(d) ? m : `${d}${i}\\sqrt{${c}}`))
const swapPlain = (s: string): string =>
  s.replace(/(\d+)(\*i)?\*sqrt\((\d+)\)/g, (m, c: string, i: string | undefined, d: string) =>
    Number(c) === Number(d) ? m : `${d}${i ?? ''}*sqrt(${c})`
  )
const unsimplifiedTex = (s: string): string =>
  s.replace(/(\d+)(i?)\\sqrt\{(\d+)\}/g, (_m, c: string, i: string, d: string) => `${i}\\sqrt{${Number(c) * Number(c) * Number(d)}}`)
const unsimplifiedPlain = (s: string): string =>
  s.replace(/(\d+)(\*i)?\*sqrt\((\d+)\)/g, (_m, c: string, i: string | undefined, d: string) =>
    `${i ? 'i*' : ''}sqrt(${Number(c) * Number(c) * Number(d)})`
  )
const flipSurdTex = (s: string): string => s.replace(/([+-])(\d*)\\sqrt/, (_m, sign: string, c: string) => `${sign === '+' ? '-' : '+'}${c}\\sqrt`)
const flipSurdPlain = (s: string): string =>
  s.replace(/([+-])( ?)(\d*\*?)sqrt\(/, (_m, sign: string, sp: string, c: string) => `${sign === '+' ? '-' : '+'}${sp}${c}sqrt(`)
const flipImagTex = (s: string): string => s.replace(/([+-])(\d*)i/, (_m, sign: string, c: string) => `${sign === '+' ? '-' : '+'}${c}i`)
const flipImagPlain = (s: string): string =>
  s.replace(/([+-])( ?)(\d*\*?)i(?![a-z])/, (_m, sign: string, sp: string, c: string) => `${sign === '+' ? '-' : '+'}${sp}${c}i`)

function mutantsOf(base: Base): Mutant[] {
  const out: Mutant[] = []
  const w = base.working
  const last = w.steps[w.steps.length - 1]
  if (last.kind !== 'SolutionSetEq' || String(last.after).split(OR).length !== 2) return out
  const push = (kind: string, edit: (m: Working) => void): void => {
    const m = clone(w)
    edit(m)
    if (JSON.stringify(m) !== JSON.stringify(w)) out.push({ kind, input: base.input, working: m })
  }
  push('wrong-surd', (m) => mapAll(m, wrongSurdTex, wrongSurdPlain))
  push('wrong-simplification', (m) => mapAll(m, swapTex, swapPlain))
  push('unsimplified-root', (m) => mapAll(m, unsimplifiedTex, unsimplifiedPlain))
  push('sign-slip', (m) => mapFirst(m, flipSurdTex, flipSurdPlain))
  if (base.domain === 'complex') push('conjugate-swapped', (m) => mapFirst(m, flipImagTex, flipImagPlain))
  push('domain-flipped', (m) => {
    const s = m.steps[m.steps.length - 1] as unknown as { data: Record<string, unknown> }
    s.data = { ...s.data, domain: base.domain === 'complex' ? 'real' : 'complex' }
  })
  const k = w.steps.findIndex((s: Step) => s.kind === 'EquationEquiv' && (s.op as { kind?: string }).kind === 'square-root-pm')
  if (k >= 0) {
    push('mislabel', (m) => {
      const s = m.steps[k]
      m.steps[k] = finishStep({
        kind: 'EquationEquiv',
        op: { kind: 'swap' },
        before: String(s.before),
        after: String(s.after),
        sentence: '',
        data: { variable: 'x' }
      })
    })
  }
  return out
}

/** Accepted: the validators pass it. Hidden: the rendered page shows no move, no answer and no check. */
function judge(m: Mutant): { accepted: boolean; hidden: boolean } {
  const accepted = validateWorking(m.working).valid
  const doc = renderWorkingToDoc(m.working)
  const hidden = doc.noWorking === true && doc.moves.length === 0 && doc.answers.length === 0 && !doc.check
  return { accepted, hidden }
}

describe('planted wrong steps on the surd and complex workings', () => {
  it('no planted working is accepted, and none shows anything on the rendered page', () => {
    const bases = items().flatMap(basesOf)
    // Control: the unplanted workings are accepted and shown, so "hidden" below means the planted change did it.
    const unplanted = bases.filter((b) => {
      const r = judge({ kind: 'control', input: b.input, working: b.working })
      return !r.accepted || r.hidden
    })
    expect(unplanted.map((b) => b.input)).toEqual([])
    const mutants = bases.flatMap(mutantsOf)
    const counts: Record<string, { made: number; accepted: number; hidden: number }> = {}
    const accepted: string[] = []
    const shown: string[] = []
    for (const m of mutants) {
      const r = judge(m)
      const c = (counts[m.kind] ??= { made: 0, accepted: 0, hidden: 0 })
      c.made++
      if (r.accepted) {
        c.accepted++
        accepted.push(`${m.kind}: ${m.input}`)
      }
      if (r.hidden) c.hidden++
      else shown.push(`${m.kind}: ${m.input}`)
    }
    if (process.env.S1B_PLANTED_OUT) {
      writeFileSync(
        process.env.S1B_PLANTED_OUT,
        JSON.stringify({ items: items().length, workings: bases.length, mutants: mutants.length, counts, accepted, shown }, null, 2)
      )
    }
    expect(shown).toEqual([])
    expect(accepted).toEqual([])
    expect(mutants.length).toBeGreaterThan(500)
    for (const kind of KINDS) expect(counts[kind]?.made ?? 0, kind).toBeGreaterThan(0)
  }, 900000)
})

// The two cases the round-1 review found (S1b): a step's own domain claim, and a root listed twice.
const formulaOnly = createStepRouter(S1A_METHODS.filter((m) => m.name === 'Quadratic formula'))

describe('a step cannot change the problem domain, and cannot list a double root twice', () => {
  it('the complex pair as the answer to the real problem x^2 + 2x + 5 = 0 is invalid, whatever the step says about its domain', () => {
    const real = router.solve({ job: 'solve', input: 'x^2 + 2x + 5 = 0', variable: 'x', domain: 'real' })
    expect(validateWorking(real).valid).toBe(true)
    const last = real.steps[real.steps.length - 1]
    const pair = finishStep({
      kind: 'SolutionSetEq',
      before: String(last.before),
      after: 'x = -1-2i \\text{ or } x = -1+2i',
      sentence: '',
      data: { variable: 'x', solutions: [{ value: '-1-2*i' }, { value: '-1+2*i' }], domain: 'complex' }
    } as never)
    const claimed = clone(real)
    claimed.steps[claimed.steps.length - 1] = pair
    claimed.answer = [
      { label: 'x', tex: '-1-2i', value: '-1-2*i' },
      { label: 'x', tex: '-1+2i', value: '-1+2*i' }
    ]
    expect(validateWorking(claimed).valid).toBe(false)
    expect(renderWorkingToDoc(claimed).moves).toHaveLength(0)
    // The same pair with the real domain stated: G2 refuses complex roots in the real domain.
    const stated = finishStep({ ...pair, data: { variable: 'x', solutions: [{ value: '-1-2*i' }, { value: '-1+2*i' }], domain: 'real' } } as never)
    const realClaim = clone(claimed)
    realClaim.steps[realClaim.steps.length - 1] = stated
    expect(validateWorking(realClaim).valid).toBe(false)
  })

  it('a double root written twice ("x = 3 or x = 3") is invalid, and the once-written double root is valid', () => {
    const dbl = formulaOnly.solve({ job: 'solve', input: 'x^2 - 6x + 9 = 0', variable: 'x', domain: 'real' })
    expect(validateWorking(dbl).valid).toBe(true)
    const last = dbl.steps[dbl.steps.length - 1]
    const twice = finishStep({
      kind: 'SolutionSetEq',
      before: String(last.before),
      after: 'x = 3 \\text{ or } x = 3',
      sentence: '',
      data: { variable: 'x', solutions: [{ value: '3' }, { value: '3' }] }
    } as never)
    const claimed = clone(dbl)
    claimed.steps[claimed.steps.length - 1] = twice
    claimed.answer = [
      { label: 'x', tex: '3', value: '3' },
      { label: 'x', tex: '3', value: '3' }
    ]
    expect(validateWorking(claimed).valid).toBe(false)
    expect(renderWorkingToDoc(claimed).moves).toHaveLength(0)
  })

  it('a working rewritten in both domain copies is valid alone, and refused against the real problem domain (review round 2)', () => {
    const real = router.solve({ job: 'solve', input: 'x^2 + 2x + 5 = 0', variable: 'x', domain: 'real' })
    const last = real.steps[real.steps.length - 1]
    const pair = finishStep({
      kind: 'SolutionSetEq',
      before: String(last.before),
      after: 'x = -1-2i \\text{ or } x = -1+2i',
      sentence: '',
      data: { variable: 'x', solutions: [{ value: '-1-2*i' }, { value: '-1+2*i' }], domain: 'complex' }
    } as never)
    const both = clone(real)
    both.steps[both.steps.length - 1] = pair
    both.domain = 'complex'
    both.answer = [
      { label: 'x', tex: '-1-2i', value: '-1-2*i' },
      { label: 'x', tex: '-1+2i', value: '-1+2*i' }
    ]
    // The real working's own Another way is a real-domain working: it is dropped here so the test is about this working.
    delete both.anotherWay
    // Alone, the rewritten working agrees with itself. Judged against the real problem's domain it is refused.
    expect(validateWorking(both).valid).toBe(true)
    expect(validateWorking(both, undefined, 'real').valid).toBe(false)
  })

  it('the same rewritten working is hidden on the page and refused by the router, not only by the validator (round 3)', () => {
    const problem = { job: 'solve', input: 'x^2 + 2x + 5 = 0', variable: 'x', domain: 'real' as const }
    const real = router.solve(problem)
    const last = real.steps[real.steps.length - 1]
    const pair = finishStep({
      kind: 'SolutionSetEq',
      before: String(last.before),
      after: 'x = -1-2i \\text{ or } x = -1+2i',
      sentence: '',
      data: { variable: 'x', solutions: [{ value: '-1-2*i' }, { value: '-1+2*i' }], domain: 'complex' }
    } as never)
    const forged = clone(real)
    forged.steps[forged.steps.length - 1] = pair
    forged.domain = 'complex'
    forged.answer = [
      { label: 'x', tex: '-1-2i', value: '-1-2*i' },
      { label: 'x', tex: '-1+2i', value: '-1+2*i' }
    ]
    delete forged.anotherWay
    // The page path: the problem is passed, so the rewritten working shows nothing.
    const doc = renderWorkingToDoc(forged, problem)
    expect(doc.moves).toHaveLength(0)
    expect(doc.answers).toHaveLength(0)
    // The router: a method that hands back the forged working is refused, and nothing is chosen.
    const forgedMethod: Method = { id: 'test.forged', name: 'Forged working', order: 1, appliesTo: () => true, solve: () => forged }
    const chosen = createStepRouter([forgedMethod]).solve(problem)
    expect(chosen.noWorking).toBe(true)
    expect(chosen.answer).toBeUndefined()
    // As an Another way: the real method stays the primary, and the forged way is not attached to it.
    const withAlt = createStepRouter([...S1A_METHODS, { ...forgedMethod, order: 100 }]).solve(problem)
    expect(withAlt.anotherWay?.method).not.toBe('Forged working')
    expect(JSON.stringify(withAlt)).not.toMatch(/-1-2i|-1\+2i/)
  })

  it('a surd zero-product step whose data names other solutions is refused, though its sentence matches the data', () => {
    const square = squareRouter.solve({ job: 'solve', input: 'x^2 - 2x - 1 = 0', variable: 'x', domain: 'real' })
    const w = square.noWorking ? (square.anotherWay as Working) : square
    expect(validateWorking(w).valid).toBe(true)
    const last = w.steps[w.steps.length - 1]
    const data = last.data as unknown as { zeroProduct: { shift: string; root: string } }
    const forged = finishStep({
      kind: 'SolutionSetEq',
      before: String(last.before),
      after: String(last.after),
      sentence: '',
      data: { variable: 'x', solutions: [{ value: '0' }, { value: '0' }], zeroProduct: data.zeroProduct, domain: 'real' }
    } as never)
    const claimed = clone(w)
    claimed.steps[claimed.steps.length - 1] = forged
    expect(validateWorking(claimed).valid).toBe(false)
    expect(renderWorkingToDoc(claimed).moves).toHaveLength(0)
  })
})
