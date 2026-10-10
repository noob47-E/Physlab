// Trig-identity proofs, set out the way a textbook sets them out: start from the left-hand side,
// change it one named step at a time, and arrive at the right-hand side.
//
//   LHS = … = RHS, each line with the rule that licensed it, in plain words.
//
// How: both sides are read into a small canonical form (a sum of terms, each a coefficient times
// powers of sin/cos/tan/cot/sec/cosec of a linear angle, or of bracketed sums), and a
// bidirectional breadth-first search looks for a chain of rewrites that joins them — from the
// left forwards and from the right backwards until the two frontiers meet, to a combined depth
// of 6. The rewrites are the ones a student is allowed: tan/cot/sec/cosec ↔ sin/cos, the three
// Pythagorean pairs both ways, double, half and compound angles both ways, sum ↔ product, and
// the algebra — common denominator, split a fraction, take out a common factor, expand brackets,
// multiply top and bottom by the conjugate. The canonical form does the "obvious" tidying a
// student does without calling it a step: collecting like terms, cancelling a factor that is
// on the top and the bottom, sin(−u) = −sin u.
//
// Every rewrite is checked numerically at three points before the search may use it: a rule
// that is wrong throws, loudly, instead of producing a "proof" of something false.
//
// Headless and dependency-free (no mathjs: a tree of our own is quicker to keep honest here).
//
// The parts live in math/pure/trig/: canonical.ts (the form), write.ts (printing), read.ts (reading),
// rules.ts (the rewrites) and search.ts (the search). This file keeps the Working and is the door.

import { failed, Steps, type Working } from './work'
import { parseIdentity } from './trig/read'
import { agrees } from './trig/rules'
import { FIVE_POINTS, notEqualSentence, proveIdentity, type ProveOptions } from './trig/search'
export { evaluate } from './trig/canonical'
export { sumPrint } from './trig/write'
export { parseIdentity, parseSide } from './trig/read'
export { rewrites } from './trig/rules'
export { proveIdentity } from './trig/search'

// ---------------------------------------------------------------------------------------------
// The Working, for the Working panel (job "trigidentity")
// ---------------------------------------------------------------------------------------------


/**
 * True when the text is a trig identity: it reads as one and its two sides agree. Auto uses this
 * to pick the proof over Solve; an equation such as sin x = 0.5 fails the agreement and stays with
 * Solve, whose algebra-engine fallback still answers it.
 */
export function isTrigIdentity(text: string): boolean {
  if (!/=/.test(text) || !/\b(sin|cos|tan|cot|sec|csc|cosec)\b/i.test(text.replace(/[^A-Za-z]+/g, ' '))) return false
  try {
    const { lhs, rhs } = parseIdentity(text)
    return agrees(lhs, rhs)
  } catch {
    return false
  }
}

/** "Prove sin 2x = 2 sin x cos x", worked from the left-hand side to the right-hand side. */
export function trigWorking(text: string, opts: ProveOptions = {}): Working {
  let id: ReturnType<typeof parseIdentity>
  try {
    id = parseIdentity(text)
  } catch (e) {
    return failed('Prove an identity', text, e instanceof Error ? e.message : String(e))
  }
  // The two sides as the student wrote them (their order, their brackets), not the sorted form.
  const lhs = id.lhsShown
  const rhs = id.rhsShown
  const title = `Prove ${lhs.text} = ${rhs.text}`
  const input = `${lhs.tex} = ${rhs.tex}`
  let proof: ReturnType<typeof proveIdentity>
  try {
    proof = proveIdentity(id.lhs, id.rhs, opts)
  } catch {
    // Nothing inside the search may cost the student the answer: whatever went wrong there, the
    // two sides are still compared, and "True" or "not equal" is said.
    proof = { refused: agrees(id.lhs, id.rhs, FIVE_POINTS) ? 'not-found' : 'not-equal' }
  }
  if ('refused' in proof) {
    if (proof.refused === 'not-equal') return failed(title, input, notEqualSentence(lhs.text, rhs.text, id.lhs, id.rhs))
    // The two sides are equal (checked at five points) but no chain of at most six school steps
    // was found: the answer still comes first — it is true — and the reason is given.
    return {
      title,
      input,
      moves: [],
      answers: [{ label: 'True', tex: input }],
      noWorking: true,
      reason: 'The two sides agree at every point PhysLab tried, but it found no short chain of textbook steps from one to the other in the time it had.',
      check: 'Both sides agree at five points, so the identity is true.',
      checked: 'ok'
    }
  }
  const s = new Steps()
  s.goal('Start from the left-hand side')
  // The first and last lines are the same expressions as the two sides, so they are shown as typed.
  const lines = proof.lines.map((l, i, all) => (i === 0 ? { ...l, ...lhs } : i === all.length - 1 ? { ...l, ...rhs } : l))
  s.add('Started from the left-hand side.', lines[0].tex)
  s.goal('Work towards the right-hand side')
  for (const l of lines.slice(1)) s.add(l.rule, `= ${l.tex}`, l.chip || undefined)
  // Sides that differ only in the order of their terms or factors need that said in one line.
  if (lines.length === 1 && lhs.text !== rhs.text) s.add('Wrote the terms and factors in the order of the right-hand side.', `= ${rhs.tex}`)
  return {
    title,
    input,
    method: 'Changed the left-hand side one step at a time',
    moves: s.moves,
    answers: [{ label: 'Proved', tex: input }],
    check: 'Each line was checked against the one before it at three angles, and the two sides agree at five.',
    checked: 'ok'
  }
}
