// Twenty textbook-style problems, with the working written out by hand (S1a). Each expected line is
// what a student would write on paper, in the same form the validators read. A problem passes when the
// method's working shows exactly these lines (spaces ignored), the answers match, and every step is valid.
// The same twenty are then repeated with the letter y and with t: the lines, the answers and the
// validity must come out the same, with the letter changed.

import { describe, it, expect } from 'vitest'
import { createStepRouter } from '../../../src/renderer/src/math/steps/router'
import { S1A_METHODS } from '../../../src/renderer/src/math/steps/methods'
import { validateWorking } from '../../../src/renderer/src/math/steps/validate'
import type { Working } from '../../../src/renderer/src/math/steps/types'

const router = createStepRouter(S1A_METHODS)

interface Problem {
  input: string
  /** Which working to read: the primary method, or its Another way. */
  via: 'primary' | 'another'
  /** The method's name, as the student sees it in the heading. */
  method: string
  /** Each line the student writes after the question, in order. */
  lines: string[]
  /** The answers, as the student writes them. */
  answers: string[]
}

const LINEAR = 'Linear equation in one variable'
const FACTOR = 'Factorising'
const SQUARE = 'Completing the square'
const FORMULA = 'Quadratic formula'

const problems: Problem[] = [
  // Linear equations in one variable
  { input: '2x + 3 = 11', via: 'primary', method: LINEAR, lines: ['2x = 8', 'x = 4'], answers: ['4'] },
  { input: '3(x - 2) = 12', via: 'primary', method: LINEAR, lines: ['3x - 6 = 12', '3x = 18', 'x = 6'], answers: ['6'] },
  { input: 'x/2 + 1/3 = 5', via: 'primary', method: LINEAR, lines: ['3x + 2 = 30', '3x = 28', 'x = \\frac{28}{3}'], answers: ['\\frac{28}{3}'] },
  { input: '0.4x - 1 = 0.2x + 3', via: 'primary', method: LINEAR, lines: ['4x - 10 = 2x + 30', '2x - 10 = 30', '2x = 40', 'x = 20'], answers: ['20'] },
  { input: '5 - x = 2x - 4', via: 'primary', method: LINEAR, lines: ['-3x + 5 = -4', '-3x = -9', 'x = 3'], answers: ['3'] },
  { input: '4 + x = 3(x + 2)', via: 'primary', method: LINEAR, lines: ['4 + x = 3x + 6', '-2x + 4 = 6', '-2x = 2', 'x = -1'], answers: ['-1'] },
  { input: 'x + 3 = x + 8', via: 'primary', method: LINEAR, lines: ['3 = 8', '0 = 8 - 3', '0 = 5', '\\text{no value of x works}'], answers: ['\\text{no value of x works}'] },
  { input: '2(x + 3) + 4 = 9', via: 'primary', method: LINEAR, lines: ['2x + 6 + 4 = 9', '2x + 10 = 9', '2x = -1', 'x = -\\frac{1}{2}'], answers: ['-\\frac{1}{2}'] },

  // Quadratics: factorising
  { input: 'x^2 - 5x + 6 = 0', via: 'primary', method: FACTOR, lines: ['(x - 2)(x - 3) = 0', 'x = 2 \\text{ or } x = 3'], answers: ['2', '3'] },
  { input: 'x^2 = 5x - 6', via: 'primary', method: FACTOR, lines: ['x^2 - 5x + 6 = 0', '(x - 2)(x - 3) = 0', 'x = 2 \\text{ or } x = 3'], answers: ['2', '3'] },
  { input: 'x^2 - 6x + 9 = 0', via: 'primary', method: FACTOR, lines: ['(x - 3)^2 = 0', 'x = 3'], answers: ['3'] },
  { input: '2x^2 + 4x - 6 = 0', via: 'primary', method: FACTOR, lines: ['x^2 + 2x - 3 = 0', '(x + 3)(x - 1) = 0', 'x = -3 \\text{ or } x = 1'], answers: ['-3', '1'] },
  { input: '6x^2 - x - 2 = 0', via: 'primary', method: FACTOR, lines: ['(2x + 1)(3x - 2) = 0', 'x = -\\frac{1}{2} \\text{ or } x = \\frac{2}{3}'], answers: ['-\\frac{1}{2}', '\\frac{2}{3}'] },
  { input: 'x^2 - 4 = 0', via: 'primary', method: FACTOR, lines: ['(x + 2)(x - 2) = 0', 'x = -2 \\text{ or } x = 2'], answers: ['-2', '2'] },
  { input: '-x^2 + 3x + 4 = 0', via: 'primary', method: FACTOR, lines: ['x^2 - 3x - 4 = 0', '(x + 1)(x - 4) = 0', 'x = -1 \\text{ or } x = 4'], answers: ['-1', '4'] },
  { input: 'x^2 + 2x - 8 = 0', via: 'primary', method: FACTOR, lines: ['(x + 4)(x - 2) = 0', 'x = -4 \\text{ or } x = 2'], answers: ['-4', '2'] },

  // Quadratic formula: negative discriminant (the discriminant is its own working, see the sub-working test)
  { input: 'x^2 + 4x + 5 = 0', via: 'primary', method: FORMULA, lines: ['\\text{No real solution}'], answers: ['\\text{No real solution}'] },

  // Completing the square (Another way)
  {
    input: 'x^2 - 5x + 6 = 0',
    via: 'another',
    method: SQUARE,
    lines: [
      '\\left(x - \\frac{5}{2}\\right)^2 - \\frac{1}{4} = 0',
      '\\left(x - \\frac{5}{2} - \\frac{1}{2}\\right)\\left(x - \\frac{5}{2} + \\frac{1}{2}\\right) = 0',
      'x = 2 \\text{ or } x = 3'
    ],
    answers: ['2', '3']
  },
  {
    input: 'x^2 + 6x + 9 = 0',
    via: 'another',
    method: SQUARE,
    lines: ['\\left(x + 3\\right)^2 = 0', 'x = -3'],
    answers: ['-3']
  },
  {
    input: '2x^2 - 8x + 6 = 0',
    via: 'another',
    method: SQUARE,
    lines: [
      'x^2 - 4x + 3 = 0',
      '\\left(x - 2\\right)^2 - 1 = 0',
      '\\left(x - 2 - 1\\right)\\left(x - 2 + 1\\right) = 0',
      'x = 1 \\text{ or } x = 3'
    ],
    answers: ['1', '3']
  }
]

const SPACES = /\s+/g
const same = (a: string, b: string): boolean => a.replace(SPACES, '') === b.replace(SPACES, '')

/** The letter x as the variable only (not the x of \text or \frac): renamed to v. */
function rename(text: string, v: string): string {
  return text.replace(/(?<![A-Za-z\\])x(?![A-Za-z])/g, v)
}

function answersOf(w: Working): string[] {
  return (Array.isArray(w.answer) ? w.answer : w.answer ? [w.answer] : []).map((a) => a.tex)
}

/** The problem's working: the primary one, or its Another way. */
function workingOf(p: Problem, v: string): Working {
  const top = router.solve({ job: 'solve', input: rename(p.input, v), variable: v })
  return (p.via === 'another' ? top.anotherWay : top) as Working
}

describe('twenty textbook problems, with the working written out by hand', () => {
  it.each(problems.map((p) => [p.input, p] as const))('%s', (_input, p) => {
    const w = workingOf(p, 'x')
    expect(w, p.input).toBeDefined()
    expect(w.noWorking, p.input).toBeFalsy()
    expect(w.method, p.input).toBe(p.method)
    expect(validateWorking(w).valid, p.input).toBe(true)

    const lines = w.steps.map((s) => String(s.after))
    expect(lines.length, p.input).toBe(p.lines.length)
    p.lines.forEach((line, i) => expect(same(lines[i], line), `${p.input} line ${i + 1}: ${lines[i]}`).toBe(true))
    expect(answersOf(w), p.input).toEqual(p.answers)
  })

  it('has exactly twenty problems', () => {
    expect(problems).toHaveLength(20)
  })

  it('the factorised quadratic of the discriminant shows -4 for x^2 + 4x + 5 in its own working', () => {
    const w = workingOf(problems[16], 'x')
    expect(String(w.subWorkings?.[0].steps[0].after)).toBe('-4')
  })
})

describe('the same twenty problems in y and in t: the same lines, answers and validity, with the letter changed', () => {
  for (const v of ['y', 't']) {
    it.each(problems.map((p) => [p.input, p] as const))(`${v}: %s`, (_input, p) => {
      const w = workingOf(p, v)
      expect(w.noWorking, rename(p.input, v)).toBeFalsy()
      expect(validateWorking(w).valid, rename(p.input, v)).toBe(true)
      const lines = w.steps.map((s) => String(s.after))
      p.lines.forEach((line, i) => expect(same(lines[i], rename(line, v)), `${rename(p.input, v)} line ${i + 1}`).toBe(true))
      expect(answersOf(w), rename(p.input, v)).toEqual(p.answers.map((a) => rename(a, v)))
    })
  }
})
