// Planted wrong steps for the S1c product methods (expanding and factorising). Each mutant is a real working with one
// step made wrong, and it must be rejected three ways: the step itself does not validate, the working does not validate,
// and the rendered page shows none of its moves. A mutant is accepted when any of the three says otherwise.
//
// The kinds (named for the mistake a student would make):
//   wrong-common-factor  the highest common factor taken out is off by a factor of 2
//   wrong-number         a coefficient in the new line is off by one
//   dropped-term         a term is missing from the new line
//   sign-flip            the sign of a term in the new line is wrong
//   wrong-pair           the two numbers of a split (or a group, or a binomial) do not multiply and add as claimed
//   wrong-cube-sign      the sum or difference of cubes is labelled with the wrong sign
//   wrong-cube-formula   the middle term of the second cube factor has the wrong sign
//   wrong-root           the root claimed for a linear factor is off by one
//   mislabel             the step names a different move from the one it makes
//   wrong-answer         the answer is an earlier line, not the last one validated
//   false-irreducible    a reducible factor is said to be irreducible

import type { ExprOp, Step, Working } from '../../../src/renderer/src/math/steps/types'
import { productStep } from '../../../src/renderer/src/math/steps/methods/productState'
import { collectTerms, sumText, tryParsePoly, type ProductData } from '../../../src/renderer/src/math/steps/check-adapter'
import type { Term } from '../../../src/renderer/src/math/pure/mono'
import { rAdd, rat, rNeg } from '../../../src/renderer/src/math/pure/rat'

interface PlantedMutant {
  kind: string
  /** The step made wrong (a new step, built from the mutant's own before and after); null when only the answer is wrong. */
  step: Step | null
  /** The whole working, with the wrong step in place of the right one. */
  working: Working
}

function withStep(w: Working, k: number, step: Step): Working {
  const steps = w.steps.slice()
  steps[k] = step
  return { ...w, steps }
}

/** The op with another move's name, the same numbers where the new move takes them. */
function relabel(op: ExprOp): ExprOp {
  switch (op.kind) {
    case 'take-out-hcf':
      return { kind: 'irreducible' }
    case 'irreducible':
      return { kind: 'take-out-hcf' }
    case 'difference-of-squares':
      return { kind: 'perfect-square', a: op.a, b: op.b, sign: '-' }
    case 'perfect-square':
      return { kind: 'difference-of-squares', a: op.a, b: op.b }
    case 'cube-factor':
      return { kind: 'difference-of-squares', a: op.a, b: op.b }
    case 'split-middle':
      return { kind: 'linear-factor', root: '0' }
    case 'group-pairs':
      return { kind: 'common-binomial', m1: op.m1, m2: op.m2, common: op.common, sign: op.sign }
    case 'common-binomial':
      return { kind: 'group-pairs', m1: op.m1, m2: op.m2, common: op.common, sign: op.sign }
    case 'linear-factor':
      return { kind: 'take-out-hcf' }
    case 'expand-factors':
      return { kind: 'collect-factor' }
    case 'collect-factor':
      return { kind: 'expand-factors' }
    default:
      return op
  }
}

/** The factor text with one of its coefficients changed by a function, collected and in order. */
function editTerms(text: string, edit: (t: Term[]) => Term[] | null): string | null {
  const t = tryParsePoly(text)
  if (!t) return null
  const next = edit(t.map((x) => ({ c: x.c, v: { ...x.v } })))
  return next ? sumText(collectTerms(next)) : null
}

/** Every planted mutant of one step of a working (none when the step is not a product step). */
function mutantsOfStep(base: Working, k: number): PlantedMutant[] {
  const step = base.steps[k]
  if (!step.op || step.kind !== 'ExprEq') return []
  const op = step.op as ExprOp
  const d = step.data as unknown as ProductData
  const out: PlantedMutant[] = []
  const add = (kind: string, before: string[], after: string[], newOp: ExprOp): void => {
    const s = productStep(before, after, d.index, d.width, newOp, d.variable)
    out.push({ kind, step: s, working: withStep(base, k, s) })
  }
  const at = d.index
  const target = d.factorsAfter[at]

  if (op.kind === 'take-out-hcf') {
    const doubled = editTerms(target, (t) => t.map((x) => ({ c: rAdd(x.c, x.c), v: x.v })))
    if (doubled) add('wrong-common-factor', d.factorsBefore, replaceAt(d.factorsAfter, at, doubled), op)
  }
  const numberNudged = editTerms(target, (t) => {
    if (t.length === 0) return null
    t[0] = { c: rAdd(t[0].c, rat(1n)), v: t[0].v }
    return t
  })
  if (numberNudged && !['take-out-hcf'].includes(op.kind)) {
    add('wrong-number', d.factorsBefore, replaceAt(d.factorsAfter, at, numberNudged), op)
  }
  const dropped = editTerms(target, (t) => (t.length >= 2 ? t.slice(0, -1) : null))
  if (dropped) add('dropped-term', d.factorsBefore, replaceAt(d.factorsAfter, at, dropped), op)
  const flipped = editTerms(target, (t) => {
    if (t.length < 2) return null
    const last = t[t.length - 1]
    t[t.length - 1] = { c: rNeg(last.c), v: last.v }
    return t
  })
  if (flipped) add('sign-flip', d.factorsBefore, replaceAt(d.factorsAfter, at, flipped), op)
  add('mislabel', d.factorsBefore, d.factorsAfter, relabel(op))

  if (op.kind === 'split-middle') {
    const p = Number(op.p)
    const q = Number(op.q)
    if (Number.isInteger(p) && Number.isInteger(q)) {
      add('wrong-pair', d.factorsBefore, d.factorsAfter, { kind: 'split-middle', p: String(p + 1), q: String(q - 1) })
    }
  }
  if (op.kind === 'group-pairs' || op.kind === 'common-binomial') {
    add('wrong-pair', d.factorsBefore, d.factorsAfter, { ...op, sign: op.sign === '+' ? '-' : '+' })
  }
  if (op.kind === 'cube-factor') {
    add('wrong-cube-sign', d.factorsBefore, d.factorsAfter, { ...op, sign: op.sign === '+' ? '-' : '+' })
    const second = d.factorsAfter[at + 1]
    const bad = second === undefined ? null : editTerms(second, (t) => {
      const mid = t.findIndex((x) => x.v.x === 1)
      if (mid < 0) return null
      t[mid] = { c: rNeg(t[mid].c), v: t[mid].v }
      return t
    })
    if (bad) add('wrong-cube-formula', d.factorsBefore, replaceAt(d.factorsAfter, at + 1, bad), op)
  }
  if (op.kind === 'perfect-square') {
    add('sign-flip', d.factorsBefore, d.factorsAfter, { ...op, sign: op.sign === '+' ? '-' : '+' })
  }
  if (op.kind === 'linear-factor') {
    const r = Number(op.root)
    if (Number.isInteger(r)) add('wrong-root', d.factorsBefore, d.factorsAfter, { kind: 'linear-factor', root: String(r + 1) })
  }
  return out
}

function replaceAt(list: string[], at: number, text: string): string[] {
  const out = list.slice()
  out[at] = text
  return out
}

/** Every planted mutant of a working: one per step (the step kinds above) and one with a wrong answer. */
export function plantProductMutants(base: Working): PlantedMutant[] {
  const out: PlantedMutant[] = []
  for (let k = 0; k < base.steps.length; k++) out.push(...mutantsOfStep(base, k))
  const first = base.steps[0]
  const last = base.steps[base.steps.length - 1]
  if (base.steps.length > 1 && String(first.after) !== String(last.after)) {
    const wrong: Working = { ...base, answer: { label: 'x', tex: String(first.after) } }
    out.push({ kind: 'wrong-answer', step: null, working: wrong })
  }
  return out
}

/** A single-step working claiming a reducible factor is irreducible: the claim must be rejected. */
export function falseIrreducibleClaim(factor: string): PlantedMutant {
  const s = productStep([factor], [factor], 0, 1, { kind: 'irreducible' }, 'x')
  const working: Working = {
    title: `Factorise ${factor}`,
    input: factor,
    method: 'Factorise',
    steps: [s],
    answer: { label: 'x', tex: factor }
  }
  return { kind: 'false-irreducible', step: s, working }
}
