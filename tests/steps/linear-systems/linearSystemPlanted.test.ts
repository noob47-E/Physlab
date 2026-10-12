// Planted wrong steps for simultaneous linear equations (S1d). Each mutant is a real working with one thing made wrong.
// It must be rejected three ways: the step does not validate on its own, the working does not validate, and the rendered
// page shows none of its moves. A mutant is accepted when any of the three says otherwise.
//
//   wrong-scale            a scale claims a different number from the one the line shows
//   arithmetic-slip        one coefficient in the line after the move is off by one
//   add-for-subtract       a subtraction is claimed as an addition (and an addition as a subtraction)
//   wrong-back-substitution  the number put in from the solved equation is off by one
//   mislabel               the move is named as a different move from the one it makes
//   wrong-answer           an answer value is off by one (the last line still shows the right one)
//   wrong-check            the system as typed is not the one the answer was checked against

import { describe, it, expect } from 'vitest'
import { createStepRouter } from '../../../src/renderer/src/math/steps/router'
import {
  linearSystemEliminationMethod,
  linearSystemSubstitutionMethod
} from '../../../src/renderer/src/math/steps/methods/linearSystem'
import { validateStep, validateWorking } from '../../../src/renderer/src/math/steps/validate'
import { renderWorkingToDoc } from '../../../src/renderer/src/math/steps/render'
import { finishStep } from '../../../src/renderer/src/math/steps/sentences'
import {
  lettersOfSystem,
  ratOfText,
  ratText,
  readSystem,
  systemText,
  type LinEq
} from '../../../src/renderer/src/math/steps/check-adapter'
import type { Step, SystemOp, Working } from '../../../src/renderer/src/math/steps/types'
import { mulberry32 } from '../methods/seeded'
import { endingOf, systemOfRows, textbookSystems } from './harness'
import { rat } from '../../../src/renderer/src/math/pure/rat'

const router = createStepRouter([linearSystemEliminationMethod, linearSystemSubstitutionMethod])

interface Mutant {
  kind: string
  /** The step made wrong, or null when the mistake is in the answer or the typed system. */
  step: Step | null
  working: Working
}

function withStep(w: Working, k: number, step: Step): Working {
  const steps = w.steps.slice()
  steps[k] = step
  return { ...w, steps }
}

/** A copy of a step with a new op (and its sentence and rule rebuilt from that op) and, optionally, a new after. */
function rebuilt(step: Step, op: SystemOp, after?: string): Step {
  return finishStep({ ...step, op, after: after ?? step.after, sentence: '', rule: undefined } as Step)
}

/** The equations of a step's after, with one coefficient or number changed. */
function changedAfter(step: Step, edit: (eqs: LinEq[]) => void): string | null {
  const eqs = readSystem(String(step.after))
  const vars = (step.data as { vars?: string[] } | undefined)?.vars
  if (!eqs || !vars) return null
  edit(eqs)
  return systemText(eqs, vars)
}

function mutantsOfStep(base: Working, k: number): Mutant[] {
  const step = base.steps[k]
  if (step.kind !== 'SystemEq' || !step.op) return []
  const op = step.op as SystemOp
  const out: Mutant[] = []
  const add = (kind: string, mutant: Step): void => {
    out.push({ kind, step: mutant, working: withStep(base, k, mutant) })
  }
  const vars = (step.data as { vars?: string[] } | undefined)?.vars ?? []
  if (op.kind === 'scale-equation') {
    const k0 = ratOfText(op.k)
    if (k0) {
      let k1 = rat(k0.n + k0.d, k0.d)
      if (k1.n === 0n || (k1.n === k1.d && k1.d === 1n)) k1 = rat(k0.n + 2n * k0.d, k0.d)
      add('wrong-scale', rebuilt(step, { kind: 'scale-equation', i: op.i, k: ratText(k1) }))
    }
    add('mislabel', rebuilt(step, { kind: 'subtract-equations', i: op.i, j: op.i === 0 ? 1 : 0 }))
  }
  if (op.kind === 'subtract-equations') {
    add('add-for-subtract', rebuilt(step, { kind: 'add-equations', i: op.i, j: op.j }))
    add('mislabel', rebuilt(step, { kind: 'scale-equation', i: op.i, k: '2' }))
  }
  if (op.kind === 'add-equations') {
    add('add-for-subtract', rebuilt(step, { kind: 'subtract-equations', i: op.i, j: op.j }))
    add('mislabel', rebuilt(step, { kind: 'scale-equation', i: op.i, k: '2' }))
  }
  if (op.kind === 'substitute' || op.kind === 'back-substitute') {
    const after = changedAfter(step, (eqs) => {
      const r = eqs[op.j].R
      r.c = rat(r.c.n + r.c.d, r.c.d)
    })
    if (after !== null) add('wrong-back-substitution', rebuilt(step, op, after))
  }
  if (op.kind === 'scale-equation' || op.kind === 'add-equations' || op.kind === 'subtract-equations') {
    const after = changedAfter(step, (eqs) => {
      const f = eqs[op.i].L
      const name = Object.keys(f.v)[0] ?? vars[0]
      f.v[name] = rat((f.v[name]?.n ?? 0n) + (f.v[name]?.d ?? 1n), f.v[name]?.d ?? 1n)
    })
    if (after !== null) add('arithmetic-slip', rebuilt(step, op, after))
  }
  return out
}

/** Every planted mutant of a working: the step kinds above, the answer, and the typed system. */
function plantMutants(base: Working): Mutant[] {
  const out: Mutant[] = []
  for (let k = 0; k < base.steps.length; k++) out.push(...mutantsOfStep(base, k))
  const answers = Array.isArray(base.answer) ? base.answer : base.answer ? [base.answer] : []
  if (answers.length > 0 && answers.every((a) => a.label !== '')) {
    const wrong = answers.map((a, i) => (i === 0 ? { ...a, tex: ratText(rat((ratOfText(a.tex)?.n ?? 0n) + 1n, ratOfText(a.tex)?.d ?? 1n)) } : a))
    out.push({ kind: 'wrong-answer', step: null, working: { ...base, answer: wrong } })
  }
  if (answers.length === 1 && answers[0].label === '') {
    out.push({ kind: 'wrong-answer', step: null, working: { ...base, answer: { label: '', tex: 'the equations have a common solution' } } })
  }
  // An ending's answer carries no letter: a letter on it is a wrong line.
  const last = base.steps[base.steps.length - 1]
  if (last && last.kind === 'SystemEq' && answers.length === 1 && answers[0].label === '') {
    out.push({ kind: 'wrong-label', step: null, working: { ...base, answer: { label: 'x', tex: answers[0].tex } } })
  }
  // A step that names fewer letters than the system has: the claim is wrong, whatever the step's own arithmetic.
  for (let k = 0; k < base.steps.length; k++) {
    const step = base.steps[k]
    const named = (step.data as { vars?: string[] } | undefined)?.vars
    if (step.kind === 'SystemEq' && named && named.length > 1) {
      const fewer = finishStep({ ...step, data: { vars: named.slice(0, -1) }, sentence: '', rule: undefined } as Step)
      out.push({ kind: 'foreign-letter', step: null, working: withStep(base, k, fewer) })
    }
  }
  const typed = readSystem(base.input ?? '')
  if (typed && typed.length >= 2 && answers.length > 0) {
    const vars = lettersOfSystem(typed)
    typed[0].R.c = rat(typed[0].R.c.n + typed[0].R.c.d, typed[0].R.c.d)
    out.push({ kind: 'wrong-check', step: null, working: { ...base, input: systemText(typed, vars) } })
  }
  return out
}

function judge(m: Mutant): { accepted: boolean; hidden: boolean } {
  const stepOk = m.step !== null && validateStep(m.step).verdict === 'valid'
  const workingOk = validateWorking(m.working).valid
  const shown = renderWorkingToDoc(m.working).moves.length > 0
  return { accepted: stepOk || workingOk || shown, hidden: !shown }
}

describe('linear systems: planted wrong steps are rejected and never shown', () => {
  it('every planted mutant over the textbook, seeded and scoreboard systems is rejected, hidden on the page, and none is accepted', () => {
    const rng = mulberry32(20260922)
    const bases: Working[] = []
    for (const t of textbookSystems()) bases.push(router.solve({ job: 'solve', input: t.input, variable: 'x' }))
    for (let n = 0; n < 15; n++) {
      bases.push(router.solve({ job: 'solve', input: systemOfRows(rng, 2).input, variable: 'x' }))
      bases.push(router.solve({ job: 'solve', input: systemOfRows(rng, 3).input, variable: 'x' }))
    }
    const mutants = bases.flatMap((base) => plantMutants(base))
    const byKind: Record<string, number> = {}
    const accepted: string[] = []
    let hidden = 0
    for (const m of mutants) {
      byKind[m.kind] = (byKind[m.kind] ?? 0) + 1
      const r = judge(m)
      if (r.hidden) hidden++
      if (r.accepted) accepted.push(`${m.kind}: ${String(m.working.input)}`)
    }
    console.log(`linear systems planted: ${mutants.length} mutants over ${bases.length} workings, ${hidden} hidden, ${accepted.length} accepted`)
    console.log(JSON.stringify(byKind))
    expect(accepted).toEqual([])
    expect(hidden).toBe(mutants.length)
    for (const [kind, min] of [
      ['wrong-scale', 20],
      ['arithmetic-slip', 20],
      ['add-for-subtract', 5],
      ['wrong-back-substitution', 10],
      ['mislabel', 20],
      ['wrong-answer', 20],
      ['wrong-check', 20],
      ['wrong-label', 4],
      ['foreign-letter', 20]
    ] as const) {
      expect(byKind[kind] ?? 0, kind).toBeGreaterThanOrEqual(min)
    }
  }, 60000)
})

describe('linear systems: the mutants are real (the unmutated workings are valid)', () => {
  it('every base working is valid before any mutation', () => {
    for (const t of textbookSystems()) {
      const w = router.solve({ job: 'solve', input: t.input, variable: 'x' })
      expect(validateWorking(w).valid, t.input).toBe(true)
    }
    expect(endingOf(router.solve({ job: 'solve', input: 'x + y = 2, 2x + 2y = 4', variable: 'x' }))).toBe('infinitely-many')
  })
})
