// Tests for the three quadratic methods (S1a): factorising (primary when the roots are rational),
// completing the square (always "Another way") and the quadratic formula (primary when the roots are
// not rational, "Another way" when factorising was primary).

import { describe, it, expect, vi } from 'vitest'
import { createStepRouter } from '../../../src/renderer/src/math/steps/router'
import { S1A_METHODS } from '../../../src/renderer/src/math/steps/methods'
import { quadraticFormulaMethod } from '../../../src/renderer/src/math/steps/methods/quadraticFormula'
import { validateWorking } from '../../../src/renderer/src/math/steps/validate'
import { renderWorkingToDoc } from '../../../src/renderer/src/math/steps/render'
import type { Step, Working } from '../../../src/renderer/src/math/steps/types'
import { rTex } from '../../../src/renderer/src/math/pure/rat'
import { irrationalItem, mulberry32, negativeDiscItem, rationalQuadItem, type QuadItem } from './seeded'
import { judge, plantMutants } from './planted'

const router = createStepRouter(S1A_METHODS)

// Each planted mutant is rendered twice; the seeded runs need more than vitest's default 5 seconds.
vi.setConfig({ testTimeout: 180000 })

function solve(input: string, domain?: 'real' | 'complex', v = 'x'): Working {
  return router.solve({ job: 'solve', input, variable: v, domain })
}

function answersOf(w: Working): string[] {
  const list = Array.isArray(w.answer) ? w.answer : w.answer ? [w.answer] : []
  return list.map((a) => a.tex)
}

function afters(w: Working): string[] {
  return w.steps.map((s) => String(s.after))
}

function rootTexes(item: QuadItem): string[] {
  return item.roots.map((r) => rTex(r))
}

/** A copy of the working with one displayed line changed. */
function withAfter(w: Working, index: number, after: string): Working {
  const copy = JSON.parse(JSON.stringify(w)) as Working
  copy.steps[index].after = after
  return copy
}

/** A copy of the working with one step (of its own list) changed. */
function editStep(w: Working, index: number, change: (step: Step) => void): Working {
  const copy = JSON.parse(JSON.stringify(w)) as Working
  change(copy.steps[index])
  return copy
}

/** A copy of the working with one displayed line of one of its sub-workings changed. */
function withSubAfter(w: Working, subIndex: number, stepIndex: number, after: string): Working {
  const copy = JSON.parse(JSON.stringify(w)) as Working
  ;(copy.subWorkings?.[subIndex] as Working).steps[stepIndex].after = after
  return copy
}

/** The planted line must be rejected by the validators AND show nothing on the page. */
function expectHidden(w: Working, label: string): void {
  expect(validateWorking(w).valid, `${label}: validators must reject`).toBe(false)
  const doc = renderWorkingToDoc(w)
  expect(doc.noWorking, `${label}: the bridge must report noWorking`).toBe(true)
  expect(doc.moves, `${label}: the bridge must show no moves`).toHaveLength(0)
}

/** Whether a number is odd. */
const isOdd = (n: bigint): boolean => (n < 0n ? -n : n) % 2n !== 0n

/** The highest common factor of three whole numbers, as a positive number. */
function gcd3(a: bigint, b: bigint, c: bigint): bigint {
  const gcd = (x: bigint, y: bigint): bigint => (y === 0n ? (x < 0n ? -x : x) : gcd(y, x % y))
  return gcd(gcd(a, b), c)
}

describe('factorising: 300 seeded quadratics with rational roots', () => {
  const rng = mulberry32(0x7e5)
  const items = Array.from({ length: 300 }, () => rationalQuadItem(rng))

  it('is primary, gets the built roots, and every step validates', () => {
    for (const item of items) {
      const w = solve(item.input)
      expect(w.noWorking, item.input).toBeFalsy()
      expect(w.method, item.input).toBe('Factorising')
      expect(validateWorking(w).valid, item.input).toBe(true)
      expect(answersOf(w), item.input).toEqual(rootTexes(item))
      expect(w.checked, item.input).toBe('ok')
    }
  })

  it('shows the factor form as an exact factorise step, then the zero-product split', () => {
    for (const item of items) {
      const w = solve(item.input)
      expect(w.steps.some((s) => s.kind === 'EquationEquiv' && s.rule === 'Factorise'), item.input).toBe(true)
      expect(w.steps.at(-1)?.kind, item.input).toBe('CaseSplitComplete')
      expect(w.subWorkings?.length ?? 0, item.input).toBe(item.roots.length)
    }
  })

  it('says a double root once: one case, one sub-working', () => {
    const doubles = items.filter((i) => i.double)
    expect(doubles.length).toBeGreaterThan(0)
    for (const item of doubles) {
      const w = solve(item.input)
      expect(answersOf(w), item.input).toHaveLength(1)
      expect(w.subWorkings?.length, item.input).toBe(1)
      expect(w.steps.at(-1)?.sentence, item.input).toMatch(/Both factors are the same, so there is one case/)
    }
  })

  it('brings the terms to one side first when the input is rearranged, and clears fractions when a coefficient is odd', () => {
    for (const item of items) {
      const w = solve(item.input)
      const rules = w.steps.map((s) => s.rule)
      if (item.style === 'rearrange') expect(rules[0], item.input).toBe('Move terms to one side')
      const [A, B, C, D] = item.factors
      const odd = [A * C, A * D + B * C, B * D].some(isOdd)
      // A halved input has a denominator (a fraction, or a decimal) exactly when a coefficient is odd.
      const clears = rules.includes('Clear the fractions') || rules.includes('Clear the decimals')
      if (item.style === 'halved') expect(clears, item.input).toBe(odd)
    }
  })

  it('has "Another way" = completing the square, valid and with the same roots', () => {
    for (const item of items) {
      const w = solve(item.input)
      expect(w.anotherWay?.method, item.input).toBe('Completing the square')
      expect(validateWorking(w.anotherWay as Working).valid, item.input).toBe(true)
      expect(answersOf(w.anotherWay as Working), item.input).toEqual(rootTexes(item))
    }
  })

  it('writes every sentence in plain words: no raw ^, no *, no LaTeX braces or backslashes', () => {
    for (const item of items) {
      const w = solve(item.input)
      const sentences: string[] = []
      const collect = (node: Working): void => {
        for (const s of node.steps) sentences.push(s.sentence)
        for (const sub of node.subWorkings ?? []) collect(sub)
      }
      collect(w)
      if (w.anotherWay) collect(w.anotherWay)
      for (const sentence of sentences) expect(sentence, item.input).not.toMatch(/[\^*{}\\]/)
    }
  })
})

describe('completing the square: the same roots, its own steps', () => {
  const rng = mulberry32(0x7e5)
  const items = Array.from({ length: 300 }, () => rationalQuadItem(rng))

  it('writes the completed square, takes the square root with ±, and gets the same roots', () => {
    for (const item of items) {
      const w = solve(item.input).anotherWay as Working
      expect(w, item.input).toBeDefined()
      // The completing step is written only when there is an x-term to complete: with b = 0 the square is (x)^2 + k already.
      const [A, B, C, D] = item.factors
      expect(w.steps.some((s) => s.rule === 'Complete the square'), item.input).toBe(A * D + B * C !== 0n)
      // A double root has no ± step: the square is 0, so there is one case.
      expect(w.steps.some((s) => s.rule === 'Square root with ±'), item.input).toBe(!item.double)
      expect(answersOf(w), item.input).toEqual(rootTexes(item))
      expect(w.checked, item.input).toBe('ok')
    }
  })
})

describe('quadratic formula: negative discriminant in the real domain', () => {
  const rng = mulberry32(0x3d1)
  const items = Array.from({ length: 100 }, () => negativeDiscItem(rng))

  it('is primary, shows the discriminant as its own working, and ends with no real solutions', () => {
    for (const item of items) {
      const w = solve(item.input)
      // The method divides out a common factor first, so the discriminant is of the reduced equation.
      const g = gcd3(item.a, item.b, item.c)
      const disc = (item.b / g) * (item.b / g) - 4n * (item.a / g) * (item.c / g)
      expect(w.noWorking, item.input).toBeFalsy()
      expect(w.method, item.input).toBe('Quadratic formula')
      expect(validateWorking(w).valid, item.input).toBe(true)
      expect(afters(w).at(-1), item.input).toBe('\\text{No real solution}')
      expect(String(w.subWorkings?.[0].steps[0].after), item.input).toBe(String(disc))
      expect(w.answer, item.input).toEqual({ label: 'x', tex: '\\text{No real solution}' })
      expect(w.steps.at(-1)?.sentence, item.input).toMatch(/no real solutions/)
    }
  })

  it('has "Another way" = completing the square, with the same ending', () => {
    for (const item of items) {
      const w = solve(item.input)
      expect(w.anotherWay?.method, item.input).toBe('Completing the square')
      expect(validateWorking(w.anotherWay as Working).valid, item.input).toBe(true)
      expect(w.anotherWay?.answer, item.input).toEqual({ label: 'x', tex: '\\text{No real solution}' })
    }
  })
})

describe('quadratic formula: irrational roots are never shown until a checker proves surds', () => {
  const rng = mulberry32(0x5e9)
  const items = Array.from({ length: 100 }, () => irrationalItem(rng))

  it('hides the whole working (Rule 0.2) and the bridge shows no moves', () => {
    for (const item of items) {
      const w = solve(item.input)
      expect(w.noWorking, item.input).toBe(true)
      const doc = renderWorkingToDoc(w)
      expect(doc.noWorking, item.input).toBe(true)
      expect(doc.moves, item.input).toHaveLength(0)
      expect(w.anotherWay, item.input).toBeUndefined()
    }
  })

  it('shows no unchecked surd answer either: the answer is left out with the hidden working', () => {
    for (const item of items) {
      expect(solve(item.input).answer, item.input).toBeUndefined()
    }
  })

  it.todo('needs G2: the quadratic formula steps with √ (surd checks), so irrational roots can be shown')
  it.todo('needs G2: the roots in simplest surd form, −b ± √d over 2a with √d simplified')
})

describe('endings in each domain', () => {
  it('a double root is said once, both by factorising and by completing the square', () => {
    const w = solve('x^2 - 6x + 9 = 0')
    expect(w.method).toBe('Factorising')
    expect(answersOf(w)).toEqual(['3'])
    expect(w.anotherWay?.method).toBe('Completing the square')
    expect(answersOf(w.anotherWay as Working)).toEqual(['3'])
    expect(w.anotherWay?.subWorkings).toHaveLength(1)
  })

  it('a negative discriminant in the real domain: no real solutions, with the discriminant shown', () => {
    const w = solve('x^2 + 2x + 5 = 0')
    expect(afters(w)).toEqual(['\\text{No real solution}'])
    expect(String(w.subWorkings?.[0].steps[0].after)).toBe('-16')
    expect(w.steps[0].sentence).toMatch(/below zero, so there are no real solutions/)
    expect(w.answer).toEqual({ label: 'x', tex: '\\text{No real solution}' })
  })

  it('a negative discriminant in the complex domain is not shown as real roots (hidden until G2)', () => {
    const w = solve('x^2 + 2x + 5 = 0', 'complex')
    expect(w.noWorking).toBe(true)
    expect(renderWorkingToDoc(w).moves).toHaveLength(0)
  })

  it.todo('needs G2: the complex domain gives the pair a ± b·i for a negative discriminant, shown and checked')
  it.todo('needs G2: the quadratic formula is the "Another way" for rational roots (its √ steps)')
  it.todo('needs G2: the double root by the formula, with √0 written as 0')
  it.todo('needs G2: completing the square for an irrational root gives the ± split with surds')

  it('"Another way" is present when the primary method is shown, and absent when the working is hidden', () => {
    expect(solve('x^2 - 5x + 6 = 0').anotherWay).toBeDefined()
    expect(solve('x^2 + 2x + 5 = 0').anotherWay).toBeDefined()
    expect(solve('x^2 - 2x - 1 = 0').anotherWay).toBeUndefined()
  })
})

describe('homogeneous quadratics (no constant term) are not exempt', () => {
  it('x^2 = 5x: the wrong moved line 2x^2 - 10x = 0 for x^2 - 5x = 0 is rejected and shows nothing', () => {
    const w = solve('x^2 = 5x')
    expect(afters(w)[0]).toBe('x^2 - 5x = 0')
    expectHidden(withAfter(w, 0, '2x^2 - 10x = 0'), 'x^2 = 5x → 2x^2 - 10x = 0')
  })
})

describe('the methods speak the letter of the problem (y and t, not x)', () => {
  const base = [
    'x^2 - 5x + 6 = 0',
    'x^2 = 5x - 6',
    'x^2 - 6x + 9 = 0',
    '2x^2 + 4x - 6 = 0',
    '-x^2 + 3x + 4 = 0',
    'x^2 - 4 = 0',
    'x^2 + 2x + 5 = 0',
    '2x^2 - 8x + 6 = 0',
    'x^2 + 6x + 9 = 0'
  ]
  for (const v of ['y', 't']) {
    it(`uses ${v} in every sentence, rule, line and answer, and never an x`, () => {
      for (const b of base) {
        const input = b.replace(/x/g, v)
        const w = solve(input, undefined, v)
        expect(w.noWorking, input).toBeFalsy()
        const texts: string[] = []
        const collect = (node: Working): void => {
          for (const s of node.steps) texts.push(s.sentence, String(s.after), s.rule ?? '')
          for (const a of node.answer ? (Array.isArray(node.answer) ? node.answer : [node.answer]) : []) texts.push(a.tex)
          if (node.check) texts.push(node.check)
          for (const sub of node.subWorkings ?? []) collect(sub)
        }
        collect(w)
        if (w.anotherWay) collect(w.anotherWay)
        // "x" as a letter only: the x inside \text is not the variable.
        for (const t of texts) expect(t, input).not.toMatch(/(?<![A-Za-z\\])x(?![A-Za-z])/)
        expect(texts.some((t) => t.includes(v)), input).toBe(true)
      }
    })
  }
})

describe('quadratic planted wrong steps are never shown', () => {
  it('every planted mutant over 60 seeded rational quadratics is rejected and hidden, with none accepted', () => {
    const rng = mulberry32(0x1f3)
    let total = 0
    let accepted = 0
    for (let i = 0; i < 60; i++) {
      const item = rationalQuadItem(rng)
      for (const m of plantMutants(solve(item.input))) {
        const r = judge(m)
        total++
        if (r.accepted) accepted++
        expect(r.accepted, `${item.input} ${m.kind}`).toBe(false)
        expect(r.hidden, `${item.input} ${m.kind}`).toBe(true)
      }
    }
    expect(total).toBeGreaterThanOrEqual(45)
    expect(accepted).toBe(0)
  })

  it('every planted mutant over 40 seeded negative discriminants is rejected and hidden, with none accepted', () => {
    const rng = mulberry32(0x2a7)
    let total = 0
    let accepted = 0
    for (let i = 0; i < 40; i++) {
      const item = negativeDiscItem(rng)
      for (const m of plantMutants(solve(item.input))) {
        const r = judge(m)
        total++
        if (r.accepted) accepted++
        expect(r.accepted, `${item.input} ${m.kind}`).toBe(false)
        expect(r.hidden, `${item.input} ${m.kind}`).toBe(true)
      }
    }
    expect(total).toBeGreaterThanOrEqual(15)
    expect(accepted).toBe(0)
  })

  // Named mistakes: each takes a real working and makes one thing wrong in a way a student meets.
  const factor = (): Working => solve('x^2 - 5x + 6 = 0')
  const square = (): Working => solve('x^2 - 5x + 6 = 0').anotherWay as Working
  const formula = (): Working => solve('x^2 - 2x + 5 = 0')
  const subOf = (w: Working, i: number): Working => w.subWorkings?.[i] as Working

  it('wrong factor pair: (x - 2)(x + 3) = 0 for x^2 - 5x + 6 = 0', () => {
    expectHidden(withAfter(factor(), 0, '(x - 2)(x + 3) = 0'), 'wrong factor pair')
  })

  it('wrong sign of the middle term: (x + 2)(x - 3) = 0', () => {
    expectHidden(withAfter(factor(), 0, '(x + 2)(x - 3) = 0'), 'wrong sign')
  })

  it('dropped ±: only one case kept in the zero-product split', () => {
    expectHidden(
      editStep(factor(), 1, (s) => {
        ;(s.data as { cases: unknown[] }).cases = (s.data as { cases: unknown[] }).cases.slice(0, 1)
      }),
      'dropped case'
    )
  })

  it('wrong root in the split: x - 4 = 0 for the case x - 3 = 0', () => {
    expectHidden(
      editStep(factor(), 1, (s) => {
        ;(s.data as { cases: string[] }).cases[1] = 'x - 4 = 0'
      }),
      'wrong case'
    )
  })

  it('wrong displayed result: x = 2 or x = 4 under the cases x - 2 = 0 and x - 3 = 0', () => {
    expectHidden(withAfter(factor(), 1, 'x = 2 \\text{ or } x = 4'), 'wrong displayed split')
  })

  it('wrong normalising step: x^2 + 2x + 3 = 0 for x^2 + 2x - 3 = 0', () => {
    expectHidden(withAfter(solve('2x^2 + 4x - 6 = 0'), 0, 'x^2 + 2x + 3 = 0'), 'wrong normalising step')
  })

  it('wrong step in a case: x = 4 where x - 3 = 0 gives 3', () => {
    expectHidden(withSubAfter(factor(), 1, 0, 'x = 4'), 'wrong step in a case')
  })

  it('wrong shift in the completed square: (x + 5/2)^2 for (x - 5/2)^2', () => {
    expectHidden(withAfter(square(), 0, '\\left(x + \\frac{5}{2}\\right)^2 - \\frac{1}{4} = 0'), 'wrong shift')
  })

  it('wrong constant in the completed square: + 1/4 for - 1/4', () => {
    expectHidden(withAfter(square(), 0, '\\left(x - \\frac{5}{2}\\right)^2 + \\frac{1}{4} = 0'), 'wrong constant')
  })

  it('dropped ± in the square root: only one case in the split', () => {
    expectHidden(
      editStep(square(), 2, (s) => {
        ;(s.data as { cases: unknown[] }).cases = (s.data as { cases: unknown[] }).cases.slice(0, 1)
      }),
      'dropped ± case'
    )
  })

  it('wrong square root in the difference of squares: 1/3 for 1/2', () => {
    expectHidden(
      withAfter(square(), 1, '\\left(x - \\frac{5}{2} - \\frac{1}{3}\\right)\\left(x - \\frac{5}{2} + \\frac{1}{2}\\right) = 0'),
      'wrong square root'
    )
  })

  it('wrong displayed root in the completed square: x = 2 or x = 4', () => {
    expectHidden(withAfter(square(), 2, 'x = 2 \\text{ or } x = 4'), 'wrong displayed root')
  })

  it('wrong discriminant: 16 for -16 (x^2 - 2x + 5)', () => {
    expectHidden(withSubAfter(formula(), 0, 0, '16'), 'wrong discriminant 16')
  })

  it('wrong discriminant: -14 for -16 (x^2 - 2x + 5)', () => {
    expectHidden(withSubAfter(formula(), 0, 0, '-14'), 'wrong discriminant -14')
  })

  it('wrong substitution: the substituted line for b² - 4ac is changed', () => {
    const copy = JSON.parse(JSON.stringify(formula())) as Working
    subOf(copy, 0).steps[0].before = '(-2)^2 + 4 \\cdot 1 \\cdot (5)'
    expectHidden(copy, 'wrong substitution')
  })

  it('a positive discriminant claimed as no real solutions is rejected', () => {
    const w = quadraticFormulaMethod.solve({ job: 'solve', input: 'x^2 - 5x + 6 = 0', variable: 'x' }, router)
    const claim: Working = {
      ...w,
      steps: [
        {
          kind: 'SolutionSetEq',
          before: 'x^2 - 5x + 6 = 0',
          after: '\\text{No real solution}',
          sentence: 'No real solutions',
          data: { variable: 'x', solutions: [] }
        }
      ],
      subWorkings: undefined,
      answer: undefined,
      anotherWay: undefined
    }
    expectHidden(claim, 'positive discriminant claimed as none')
  })
})
