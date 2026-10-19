// Trigonometric equations (Part S5c): the working for an equation with one trig function of c·v in the letter v.
//
// It covers:
// - sin x = cos x: divide by cos x, so tan x = 1, then the general solution;
// - a·f(c·v) + b = r with f one of sin, cos, tan and c a whole number: isolate, the reference angle, the general solution;
// - a quadratic in f(c·v): substitute u, factorise when the roots are rational, substitute back, the general solution;
// - sin x = 2 and the like: no value works (|value| > 1 for a sine or a cosine).
// The method proposes each line from the equation it reads. Every line is then checked by numbers (trigRoots.ts, through
// check-adapter.ts), so a line that is wrong is refused there and no working is shown. Anything this cannot do soundly gives
// no working, and the answer the Calculator already had stays.
//
// Angles are exact: the answers are multiples of π in radians and decimal degrees in degrees, never a rounded decimal.

import type { Domain, EquationOp, Method, Problem, Step, StepAnswer, Working } from '../types'
import { finishStep } from '../sentences'
import { coefficientOf, solutionProofOf, stringifyNodeOrText, tryParsePoly } from '../check-adapter'
import { eSub, exprDegree, varsOf, type Expr } from '../../pure/mono'
import { R1, rat, rAdd, rCmp, rDiv, rEq, rIsNeg, rIsZero, rMul, rNeg, rNum, rSqrt, rStr, rSub, rTex, type Rat } from '../../pure/rat'
import { casInDegrees } from '../../../calc/angle'
import { scene } from '../../../core/store'
import {
  angleLitTex,
  angleValueTex,
  familiesOf,
  familyText,
  membersIn,
  multipleOf,
  periodQuad,
  principalOf,
  quadrantText,
  referenceAngleOf,
  type AngleUnit,
  type Family,
  type TrigFn,
  type TrigRange
} from '../trigRoots'

const TRIG_EQUATIONS_ID = 'trigEquations'
const CANT_SHOW = "I can't show the steps for this one yet"
const R45 = rat(45n)

/** Helper to clean formula string for display safety */
function cleanLatex(input: string): string {
  let s = input.trim()
  s = s.replace(/\\left|\\right/g, '')
  s = s.replace(/\*/g, '')
  s = s.replace(/(?<![\\a-zA-Z])(sin|cos|tan)\^2\s*\(?([a-zA-Z0-9]+)\)?/gi, '\\$1($2)^2')
  s = s.replace(/\\(sin|cos|tan)\^2\s*\(?([a-zA-Z0-9]+)\)?/gi, '\\$1($2)^2')
  s = s.replace(/(?<![\\a-zA-Z])(sin|cos|tan)(?![a-zA-Z])/gi, '\\$1')
  s = s.replace(/\\(sin|cos|tan)\s+([a-zA-Z0-9]+)\b/g, '\\$1($2)')
  s = s.replace(/(?<![\\a-zA-Z])pi(?![a-zA-Z])/gi, '\\pi')
  return s
}

/** A fraction written \frac{a}{b} with whole numbers, as (a/b), so that the polynomial reader takes it. */
function fracAsSlash(text: string): string {
  return text.replace(/\\frac\{(-?\d+)\}\{(\d+)\}/g, '($1/$2)')
}

/**
 * The equation as the method reads it: one trig function f(c·v) of the letter v, the two sides as polynomials in u (the
 * function's value), and the degree of L − R in u (1 for a linear equation, 2 for a quadratic).
 */
interface Form {
  fn: TrigFn
  /** The whole-number multiple of v in the argument: 1 for sin x, 2 for sin 2x. */
  c: number
  L: Expr
  R: Expr
  degree: 1 | 2
}

/** The equation read as a trig equation in u, or null when it is not one this method covers. */
function parseForm(eq: string, v: string): Form | null {
  const terms = [...eq.matchAll(/\\?(sin|cos|tan)\s*\(\s*([^()]*?)\s*\)/g)]
  if (terms.length === 0) return null
  const keys = new Set(terms.map((m) => `${m[1]}(${m[2].replace(/\s+/g, '')})`))
  if (keys.size !== 1) return null
  const fn = terms[0][1] as TrigFn
  const c = multipleOf(terms[0][2].replace(/\s+/g, ''), v)
  if (c === null) return null
  const replaced = eq.replace(/\\?(sin|cos|tan)\s*\(\s*([^()]*?)\s*\)(\^\{?2\}?)?/g, (_m, _f, _a, sq) => (sq ? 'u^2' : 'u'))
  if (/\\?(sin|cos|tan)/.test(replaced)) return null
  const sides = replaced.split('=')
  if (sides.length !== 2) return null
  const L = tryParsePoly(fracAsSlash(sides[0]))
  const R = tryParsePoly(fracAsSlash(sides[1]))
  if (!L || !R) return null
  if (!varsOf(L).every((n) => n === 'u') || !varsOf(R).every((n) => n === 'u')) return null
  const degree = exprDegree(eSub(L, R))
  if (degree !== 1 && degree !== 2) return null
  // A linear equation has its u only on the left, and a quadratic has no other letter: anything else is not read here.
  if (degree === 1 && (!rIsZero(coefficientOf(L, 'u', 2)) || !rIsZero(coefficientOf(R, 'u', 1)) || !rIsZero(coefficientOf(R, 'u', 2)))) {
    return null
  }
  return { fn, c, L, R, degree }
}

/** The text of a·u² + b·u + c = 0, with the signs written as a student writes them. */
function polyTex(a2: Rat, a1: Rat, a0: Rat): string {
  const terms: Array<[Rat, string]> = [
    [a2, 'u^2'],
    [a1, 'u'],
    [a0, '']
  ]
  let out = ''
  for (const [c, mono] of terms) {
    if (rIsZero(c)) continue
    const neg = rIsNeg(c)
    const mag = neg ? rNeg(c) : c
    const coef = mono !== '' && rEq(mag, R1) ? '' : rTex(mag)
    const body = `${coef}${mono}`
    out = out === '' ? (neg ? `-${body}` : body) : `${out} ${neg ? '-' : '+'} ${body}`
  }
  return `${out} = 0`
}

/** One factor (q·u − p) as the student writes it: (2u + 1), (u - 1), (u). */
function factorTex(q: bigint, p: bigint): string {
  const lead = q === 1n ? 'u' : `${q}u`
  if (p === 0n) return `(${lead})`
  return p < 0n ? `(${lead} + ${-p})` : `(${lead} - ${p})`
}

/** A root of the quadratic in u: its value, and its exact rational value when it has one. */
interface Root {
  value: number
  exact: Rat | null
}

/** The real roots of a·u² + b·u + c in ascending order (none when the discriminant is negative). */
function quadraticRoots(a2: Rat, a1: Rat, a0: Rat): Root[] {
  const disc = rSub(rMul(a1, a1), rMul(rat(4n), rMul(a2, a0)))
  if (rIsNeg(disc)) return []
  const twoA = rMul(rat(2n), a2)
  const s = rSqrt(disc)
  if (s !== null) {
    const r1 = rDiv(rSub(rNeg(a1), s), twoA)
    const r2 = rDiv(rAdd(rNeg(a1), s), twoA)
    const pair = rCmp(r1, r2) <= 0 ? [r1, r2] : [r2, r1]
    const distinct = rEq(pair[0], pair[1]) ? [pair[0]] : pair
    return distinct.map((r) => ({ value: rNum(r), exact: r }))
  }
  const root = Math.sqrt(rNum(disc))
  const a2n = rNum(a2)
  const a1n = rNum(a1)
  return [(-a1n - root) / (2 * a2n), (-a1n + root) / (2 * a2n)]
    .sort((x, y) => x - y)
    .map((value) => ({ value, exact: null }))
}

/**
 * The factorised form (2u + 1)(u - 1) = 0 of a·u² + b·u + c = 0 when the roots are rational and the factors multiply back
 * to the very same equation (the leading number is the product of the two denominators). Null otherwise.
 */
function factorisation(a2: Rat, a1: Rat, a0: Rat, roots: Root[]): string | null {
  const first = roots[0]?.exact
  const second = roots[roots.length - 1]?.exact
  if (!first || !second) return null
  const q1 = first.d
  const p1 = first.n
  const q2 = second.d
  const p2 = second.n
  const holds = rEq(a2, rat(q1 * q2)) && rEq(a1, rat(-(q1 * p2 + q2 * p1))) && rEq(a0, rat(p1 * p2))
  return holds ? `${factorTex(q1, p1)}${factorTex(q2, p2)} = 0` : null
}

/** The working's own record of one step: the claim, the rule and the sentence come from the step's own data. */
function step(kind: 'EquationEquiv', before: string, after: string, op: EquationOp, v: string): Step {
  return finishStep({ kind, before, after, op, sentence: '', data: { variable: v } })
}

/** The "x" of a solution list's entries and the trig argument: "2x" for c = 2, "x" for c = 1. */
function argumentOf(form: Form, v: string): string {
  return form.c === 1 ? v : `${form.c}${v}`
}

/**
 * The general solution's line, its check line and the answers in the range. Null when the range holds no answer, or the
 * families cannot be written exactly in the unit.
 */
function generalAndAnswers(
  steps: Step[],
  before: string,
  families: Family[],
  v: string,
  unit: AngleUnit,
  range: TrigRange,
  domain: Domain
): StepAnswer[] | null {
  const members = membersIn(families, range)
  if (members.length === 0) return null
  const general = familyText(v, families, unit)
  const values = members.map((m) => angleValueTex(m, unit))
  if (general === null || values.some((t) => t === null)) return null
  const texts = values as string[]
  steps.push(step('EquationEquiv', before, general, { kind: 'trig-general' }, v))
  steps.push(
    finishStep({
      kind: 'SolutionSetEq',
      before: general,
      after: texts.map((t) => `${v} = ${t}`).join(' \\text{ or } '),
      sentence: '',
      data: {
        variable: v,
        domain,
        solutions: texts.map((t) => ({ value: t })),
        role: 'trig',
        range
      }
    })
  )
  return texts.map((t) => ({ label: v, tex: t, value: t }))
}

/** Context shared by the cases: the typed input, the unit, the range and the way of building the working. */
interface Ctx {
  input: string
  eqToInspect: string
  v: string
  unit: AngleUnit
  range: TrigRange
  domain: Domain
  declined: () => Working
  finish: (steps: Step[], answers: StepAnswer[], method: string) => Working
}

/** sin x = cos x: divide by cos x (tan x = 1), its reference angle, then the general solution. */
function sinCosCase(ctx: Ctx): Working {
  const { v, unit } = ctx
  const tanEq = `\\tan(${v}) = 1`
  const refAngle = angleLitTex(R45, unit)
  if (refAngle === null) return ctx.declined()
  const steps: Step[] = [
    step('EquationEquiv', ctx.input, tanEq, { kind: 'divide-cos' }, v),
    step('EquationEquiv', tanEq, tanEq, { kind: 'trig-ref-angle', angle: refAngle, quad: periodQuad(unit) }, v)
  ]
  const answers = generalAndAnswers(steps, tanEq, [{ a: R45, p: rat(180n) }], v, unit, ctx.range, ctx.domain)
  return answers === null ? ctx.declined() : ctx.finish(steps, answers, 'Trigonometric equation')
}

/** a·f(c·v) + b = r: isolate the function, then its reference angle, the general solution and the answers. */
function linearCase(ctx: Ctx, form: Form): Working {
  const { v, unit, input } = ctx
  const aL = coefficientOf(form.L, 'u', 1)
  const bL = coefficientOf(form.L, 'u', 0)
  const rR = coefficientOf(form.R, 'u', 0)
  if (rIsZero(aL)) return ctx.declined()
  // aL·u + bL = rR, so u = (rR − bL)/aL.
  const u0 = rDiv(rSub(rR, bL), aL)
  const value = rNum(u0)
  const trig = `\\${form.fn}(${argumentOf(form, v)})`

  // A sine or cosine is never more than 1 in size: "sin x = 2" has no solution, and the statement says so only when the
  // solution-set proof of the typed equation agrees.
  if (form.fn !== 'tan' && Math.abs(value) > 1) {
    const proof = solutionProofOf(input, v)
    if (!proof || proof.kind !== 'none') return ctx.declined()
    const noValue = `\\text{no value of ${v} works}`
    const steps = [
      finishStep({
        kind: 'SolutionSetEq',
        before: input,
        after: noValue,
        sentence: '',
        data: { variable: v, domain: 'real', solutions: [] }
      })
    ]
    return {
      title: `Solve ${input}`,
      input,
      method: 'Trigonometric equation',
      steps,
      answer: { label: v, tex: noValue },
      checked: 'ok',
      domain: ctx.domain
    }
  }

  const steps: Step[] = []
  let cur = input
  if (!rIsZero(bL)) {
    // Take the constant off the left: subtract it from both sides, or add its opposite.
    const lead = rEq(aL, R1) ? '' : rEq(aL, rNeg(R1)) ? '-' : rTex(aL)
    const after = `${lead}${trig} = ${rTex(rSub(rR, bL))}`
    const op: EquationOp = rIsNeg(bL) ? { kind: 'add-both', term: rStr(rNeg(bL)) } : { kind: 'subtract-both', term: rStr(bL) }
    steps.push(step('EquationEquiv', cur, after, op, v))
    cur = after
  }
  const isolated = `${trig} = ${rTex(u0)}`
  if (!rEq(aL, R1)) {
    steps.push(step('EquationEquiv', cur, isolated, { kind: 'divide-both', k: rStr(aL) }, v))
    cur = isolated
  } else if (rIsZero(bL) && (ctx.eqToInspect.split('=')[1] ?? '').includes('.')) {
    // A decimal right side (0.5) is written as the fraction the table lists.
    steps.push(step('EquationEquiv', cur, isolated, { kind: 'work-out-right' }, v))
    cur = isolated
  }

  // The reference angle: the acute angle whose function has the size of the value.
  const refAngle = referenceAngleOf(form.fn, value)
  const refTex = refAngle === null ? null : angleLitTex(refAngle, unit)
  if (refTex === null) return ctx.declined()
  const quad = form.fn === 'tan' ? periodQuad(unit) : quadrantText(form.fn, value < 0)
  steps.push(step('EquationEquiv', cur, isolated, { kind: 'trig-ref-angle', angle: refTex, quad }, v))
  cur = isolated

  const families = familiesOf(form.fn, form.c, value)
  if (families === null) return ctx.declined()
  const answers = generalAndAnswers(steps, cur, families, v, unit, ctx.range, ctx.domain)
  return answers === null ? ctx.declined() : ctx.finish(steps, answers, 'Trigonometric equation')
}

/** a·f(c·v)² + b·f(c·v) + d = 0: substitute u, factorise when the roots are rational, substitute back, the general solution. */
function quadraticCase(ctx: Ctx, form: Form): Working {
  const { v, unit } = ctx
  const P = eSub(form.L, form.R)
  const a2 = coefficientOf(P, 'u', 2)
  const a1 = coefficientOf(P, 'u', 1)
  const a0 = coefficientOf(P, 'u', 0)
  const roots = quadraticRoots(a2, a1, a0)
  if (roots.length === 0) return ctx.declined()
  // A sine or cosine is never bigger than 1 in size, so a root u outside -1 to 1 gives no angle. It stays in the factorised
  // equation, is named in the back substitution and is left out there, and the working says so in words. A root that is
  // not an exact rational cannot be named exactly, so the working is declined rather than shown with it.
  const inRange = (r: Root): boolean => form.fn === 'tan' || Math.abs(r.value) <= 1 + 1e-9
  const kept = roots.filter(inRange)
  if (kept.length === 0) return ctx.declined()
  const rejected: string[] = []
  for (const r of roots) {
    if (inRange(r)) continue
    if (r.exact === null) return ctx.declined()
    rejected.push(rTex(r.exact))
  }

  const rootTexts: string[] = []
  const families: Family[] = []
  for (const r of kept) {
    const tex = r.exact !== null ? rTex(r.exact) : (principalOf(form.fn, r.value)?.tex ?? null)
    const own = familiesOf(form.fn, form.c, r.value)
    if (tex === null || own === null) return ctx.declined()
    rootTexts.push(tex)
    for (const f of own) if (!families.some((g) => rEq(g.a, f.a))) families.push(f)
  }
  families.sort((x, y) => rCmp(x.a, y.a))

  const steps: Step[] = []
  let cur = ctx.input
  const substituted = polyTex(a2, a1, a0)
  steps.push(step('EquationEquiv', cur, substituted, { kind: 'trig-substitute' }, v))
  cur = substituted
  const factored = factorisation(a2, a1, a0, roots)
  if (factored !== null) {
    steps.push(step('EquationEquiv', cur, factored, { kind: 'factorise' }, 'u'))
    cur = factored
  }
  const trig = `\\${form.fn}(${argumentOf(form, v)})`
  const back = kept.map((_r, i) => `${trig} = ${rootTexts[i]}`).join(' \\text{ or } ')
  const backOp: EquationOp = rejected.length > 0 ? { kind: 'trig-back-substitute', rejected } : { kind: 'trig-back-substitute' }
  steps.push(step('EquationEquiv', cur, back, backOp, v))
  cur = back

  const answers = generalAndAnswers(steps, cur, families, v, unit, ctx.range, ctx.domain)
  return answers === null ? ctx.declined() : ctx.finish(steps, answers, 'Factorising')
}

export const trigEquationsMethod: Method = {
  id: TRIG_EQUATIONS_ID,
  name: 'Trigonometric equation',
  order: 25,
  isAlternative: false,

  appliesTo(problem: Problem) {
    if (problem.job !== 'solve') return { applies: false }
    const raw = stringifyNodeOrText(problem.input)
    const rawIn = problem.rawInput ? String(problem.rawInput) : ''
    const combined = `${raw} ${rawIn}`
    if (/sin|cos|tan|\\sin|\\cos|\\tan/.test(combined) && (raw.includes('=') || rawIn.includes('='))) {
      return { applies: true }
    }
    return { applies: false }
  },

  solve(problem: Problem): Working {
    const raw = stringifyNodeOrText(problem.input)
    const rawIn = problem.rawInput ? String(problem.rawInput) : ''
    const v = problem.variable || 'x'
    const domain = problem.domain || 'real'

    // The angle unit: the problem's own, else the scene's.
    let inDeg = problem.angleUnit ? problem.angleUnit === 'deg' : true
    if (!problem.angleUnit) {
      try {
        inDeg = casInDegrees(scene().settings.angleUnit)
      } catch {
        inDeg = true
      }
    }
    const unit: AngleUnit = inDeg ? 'deg' : 'rad'

    const eqOnly = raw.split(/,\s*\d+\s*<=|;\s*\d+\s*<=|\s+for\s+/)[0].trim()
    const input = cleanLatex(eqOnly)
    const eqToInspect = cleanLatex(rawIn ? String(rawIn).split(/,\s*\d+\s*<=|;\s*\d+\s*<=|\s+for\s+/)[0].trim() : eqOnly)

    const declined = (): Working => ({ title: `Solve ${input}`, input, steps: [], noWorking: true, reason: CANT_SHOW })
    const finish = (steps: Step[], answers: StepAnswer[], method: string): Working => ({
      title: `Solve ${input}`,
      input,
      method,
      steps,
      answer: answers.length === 1 ? answers[0] : answers,
      checked: 'ok',
      domain
    })

    // The range the student asked for, in degrees (in radians a range is not whole degrees, so it is declined).
    const rangeMatch = raw.match(/(\d+(?:\.\d+)?)\s*<=\s*[a-zA-Z]\s*(<=|<)\s*(\d+(?:\.\d+)?)/)
    let range: TrigRange = { min: 0, max: 360, inclusive: false }
    if (rangeMatch) {
      if (!inDeg || rangeMatch[1].includes('.') || rangeMatch[3].includes('.')) return declined()
      range = { min: Number(rangeMatch[1]), max: Number(rangeMatch[3]), inclusive: rangeMatch[2] === '<=' }
    }

    const ctx: Ctx = { input, eqToInspect, v, unit, range, domain, declined, finish }
    const compact = eqToInspect.replace(/[\s\\]+/g, '')
    if (compact === `sin(${v})=cos(${v})`) return sinCosCase(ctx)

    const form = parseForm(eqToInspect, v)
    if (form === null) return declined()
    return form.degree === 1 ? linearCase(ctx, form) : quadraticCase(ctx, form)
  }
}
