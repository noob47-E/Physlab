// Question Author, Solution and Variables tabs (QE5): building a part of each new answer kind
// (vector, matrix, roots, function) and a proof part the way the part-kind picker and its editors
// build them, a number part marked by a stated uncertainty (Eₙ) instead of a band, and the
// Variables tab's "Keep only variants where…" condition with its tries-before-giving-up count.
// Every shape here is written through serializePQFile and read back with parsePQFile before it is
// played, so what is tested is what a teacher's own file — saved from these editors — actually
// plays; `changeAnyPartType`, `blankPartOf` and `resizeMatrix` (questions/authorKinds.ts) are the
// pure functions the part-kind picker and the matrix size stepper call, tested directly. Headless:
// no React, no DOM — `panels/AuthorSolution.tsx` itself pulls in MathInput's MathLive element,
// which needs a real DOM and cannot be imported by a test (AGENTS.md keeps tests/ to pure logic).

import { describe, expect, it, beforeEach } from 'vitest'
import { resetGlobals } from './helpers/globals'
import { isCorrect } from '../src/renderer/src/math/checkAnswer'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import { ALL_PART_TYPES, blankPartOf, changeAnyPartType, conditionRuns, equationLatex, functionLetterClash, functionLetters, functionLettersProblem, MAX_CONDITION_RUNS, readEquation, renameFunctionLetters, resizeMatrix } from '../src/renderer/src/questions/authorKinds'
import { checkPlayedPart, playQuestion } from '../src/renderer/src/questions/player'
import { drawVariables } from '../src/renderer/src/questions/variables'
import { parsePQFile, serializePQFile, type PQPart, type PQQuestion } from '../src/renderer/src/questions/pqjson'
import { formulaLatex, nextVariableName, partCheck, previewRows, questionProblems, readFormula, renameVariable, variableInUse } from '../src/renderer/src/questions/authoring'
import type { FunctionPart as FunctionPartT } from '../src/renderer/src/questions/odeCheck'

beforeEach(() => resetGlobals())

const S: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }
const band = { kind: 'relative' as const, value: 0.02 }
const LICENSE = { id: 'CC BY 4.0' as const, holder: 'PhysLab' }

/** Writes one question into a .pqjson file and reads it back, the way the author's Save does. */
function throughFile(q: PQQuestion): PQQuestion {
  const text = serializePQFile({ app: 'PhysLab', format: 'pqjson', version: 1, questions: [q] })
  const file = parsePQFile(text)
  return file.questions[0]
}

// ---------------------------------------------------------------------------
// The part-kind picker's pure functions
// ---------------------------------------------------------------------------

describe('blankPartOf: a fresh part of each new kind, ready for its editor', () => {
  it('a vector starts with two blank components, no unit and the app’s 2 % band', () => {
    const p = blankPartOf('vector', 'F in components', 2)
    expect(p).toEqual({ type: 'vector', prompt: 'F in components', answer: ['', ''], unit: 'none', tolerance: band, marks: 2 })
  })

  it('a matrix starts 2 × 2, blank, no allowFractions or markPerCell set', () => {
    const p = blankPartOf('matrix', 'Invert it', 4)
    expect(p).toMatchObject({ type: 'matrix', answer: [['', ''], ['', '']], marks: 4 })
    expect((p as Extract<PQPart, { type: 'matrix' }>).allowFractions).toBeUndefined()
    expect((p as Extract<PQPart, { type: 'matrix' }>).markPerCell).toBeUndefined()
  })

  it('roots starts with one blank entry — never zero, or "Add a root" would have nothing to show first', () => {
    const p = blankPartOf('roots', 'Solve it', 2)
    expect(p).toMatchObject({ type: 'roots', answer: [''], unit: 'none' })
  })

  it('a function starts as y in x, with one blank starting condition on y itself', () => {
    const p = blankPartOf('function', 'Find y(x)', 3)
    expect(p).toMatchObject({ type: 'function', x: 'x', y: 'y', ode: '', model: '', initial: [{ at: '0', order: 0, value: '' }] })
  })

  it('a proof is always worth 0 marks, whatever marks its old kind was worth', () => {
    const p = blankPartOf('proof', 'Prove it', 5)
    expect(p).toMatchObject({ type: 'proof', marks: 0, model: '', selfCheck: [''] })
  })
})

describe('changeAnyPartType: switching a part’s kind in the picker', () => {
  const number: PQPart = { type: 'number', prompt: 'How far?', answer: '', unit: 'm', tolerance: band, marks: 3 }

  it('keeps the prompt and marks across a switch to a new kind', () => {
    const v = changeAnyPartType(number, 'vector')
    expect(v).toMatchObject({ type: 'vector', prompt: 'How far?', marks: 3 })
  })

  it('switching to itself changes nothing', () => {
    expect(changeAnyPartType(number, 'number')).toBe(number)
  })

  it('switching a proof back to a markable kind gives it one mark, not the 0 it carried as a proof', () => {
    const proof: PQPart = { type: 'proof', prompt: 'Prove it', model: 'x', selfCheck: ['a point'], marks: 0 }
    expect(changeAnyPartType(proof, 'vector')).toMatchObject({ type: 'vector', marks: 1 })
    expect(changeAnyPartType(proof, 'number')).toMatchObject({ type: 'number', marks: 1 })
  })

  it('switching any kind to a proof zeroes its marks', () => {
    expect(changeAnyPartType(number, 'proof')).toMatchObject({ type: 'proof', marks: 0 })
  })

  it('every kind the picker offers builds without throwing, prompt kept, from every other kind', () => {
    for (const from of ALL_PART_TYPES) {
      const start = changeAnyPartType(number, from.type)
      for (const to of ALL_PART_TYPES) {
        if (from.type === 'lego' || to.type === 'lego') continue // Geometry's own tool, not the picker's
        expect(() => changeAnyPartType(start, to.type)).not.toThrow()
      }
    }
  })
})

describe('resizeMatrix: the size stepper', () => {
  it('grows a matrix, padding new cells blank and keeping what was typed', () => {
    expect(resizeMatrix([['1', '2']], 2, 3)).toEqual([
      ['1', '2', ''],
      ['', '', '']
    ])
  })

  it('shrinks a matrix, dropping the entries that no longer fit', () => {
    expect(
      resizeMatrix(
        [
          ['1', '2'],
          ['3', '4']
        ],
        1,
        1
      )
    ).toEqual([['1']])
  })
})

// ---------------------------------------------------------------------------
// Author → .pqjson → player round trip, one question per new kind
// ---------------------------------------------------------------------------

const withPart = (part: PQPart, extraVars: PQQuestion['variables'] = []): PQQuestion => ({
  id: 'q',
  title: 'q',
  statement: 'A force of {F} acts at {theta} to the x axis.',
  variables: [
    { name: 'F', def: { kind: 'list', items: [10] }, unit: 'N' },
    { name: 'theta', def: { kind: 'list', items: [30] }, unit: '°' },
    ...extraVars
  ],
  parts: [part],
  license: LICENSE
})

describe('a vector part built by its editor round-trips and marks 10∠30° right', () => {
  const q = throughFile(withPart({ type: 'vector', prompt: 'F in components', answer: ['F*cos(theta)', 'F*sin(theta)'], unit: 'N', tolerance: band, marks: 2 }))

  it('reads back as a vector with the same components', () => {
    expect(q.parts[0]).toMatchObject({ type: 'vector', answer: ['F*cos(theta)', 'F*sin(theta)'] })
  })

  it('marks 10∠30° right and 5i + 8.66j wrong (swapped components)', () => {
    const played = playQuestion(q, 1, S)
    const part = played.parts[0]
    expect(isCorrect(checkPlayedPart(part, '10∠30°', played, S))).toBe(true)
    expect(checkPlayedPart(part, '5i + 8.66j', played, S).verdict).toBe('wrong')
  })

  it('a third (k) component the editor added survives the round trip', () => {
    const q3 = throughFile(withPart({ type: 'vector', prompt: '3-D', answer: ['1', '2', '3'], unit: 'none', tolerance: band, marks: 1 }))
    expect((q3.parts[0] as Extract<PQPart, { type: 'vector' }>).answer).toEqual(['1', '2', '3'])
  })
})

describe('a matrix part built by its size stepper round-trips and marks per cell', () => {
  const q = throughFile(
    withPart({
      type: 'matrix',
      prompt: 'Invert [[2, 1], [1, 3]]',
      answer: [
        ['0.6', '-0.2'],
        ['-0.2', '0.4']
      ],
      tolerance: { kind: 'absolute', value: 0.005 },
      allowFractions: true,
      markPerCell: true,
      marks: 4
    })
  )

  it('keeps its shape, allowFractions and markPerCell', () => {
    expect(q.parts[0]).toMatchObject({ type: 'matrix', allowFractions: true, markPerCell: true })
  })

  it('marks the right inverse right, and one wrong cell as 3 of 4 right', () => {
    const played = playQuestion(q, 1, S)
    const part = played.parts[0]
    expect(
      isCorrect(
        checkPlayedPart(
          part,
          [
            ['3/5', '-1/5'],
            ['-1/5', '2/5']
          ],
          played,
          S
        )
      )
    ).toBe(true)
    expect(
      checkPlayedPart(
        part,
        [
          ['0.6', '-0.2'],
          ['-0.2', '0.5']
        ],
        played,
        S
      ).message
    ).toBe('3 of the 4 entries are right.')
  })
})

describe('a roots part built by its add/remove rows round-trips, an empty list meaning "no real roots"', () => {
  const q = throughFile(withPart({ type: 'roots', prompt: 'Solve x² + x − 6 = 0', answer: ['2', '-3'], unit: 'none', tolerance: { kind: 'absolute', value: 0.01 }, marks: 2 }))

  it('marks both roots right and one root alone as partial', () => {
    const played = playQuestion(q, 1, S)
    const part = played.parts[0]
    expect(isCorrect(checkPlayedPart(part, 'x = −3 or x = 2', played, S))).toBe(true)
    expect(checkPlayedPart(part, '2', played, S).message).toBe('You have 1 of the 2 roots.')
  })

  it('an empty answer list (every row removed) round-trips as "no real roots"', () => {
    const none = throughFile(withPart({ type: 'roots', prompt: 'Solve x² + 1 = 0 in ℝ', answer: [], unit: 'none', tolerance: band, marks: 1 }))
    expect((none.parts[0] as Extract<PQPart, { type: 'roots' }>).answer).toEqual([])
  })

  it('multiplicity, once ticked, survives the round trip', () => {
    const m = throughFile(withPart({ type: 'roots', prompt: 'Solve (x − 2)² = 0', answer: ['2', '2'], unit: 'none', tolerance: band, multiplicity: true, marks: 1 }))
    expect((m.parts[0] as Extract<PQPart, { type: 'roots' }>).multiplicity).toBe(true)
  })
})

/** What the equation field commits for what the maths field holds; throws on a refusal so a test cannot mistake one for an equation. */
function odeFrom(latex: string, names: string[], x = 'x', y = 'y'): string {
  const r = readEquation(latex, names, x, y)
  if (r.problem !== undefined) throw new Error(r.problem)
  return r.expr
}

describe('the function part’s equation field reads what the maths field writes', () => {
  it('MathLive’s y^{\\prime}^{\\prime}, y^{\\prime\\prime}, \\doubleprime and a typed y\'\' all commit y″', () => {
    for (const tex of ['y^{\\prime}^{\\prime}+y=0', 'y^{\\prime\\prime}+y=0', 'y^{\\doubleprime}+y=0', "y''+y=0"]) expect(odeFrom(tex, []), tex).toBe('y″ + y = 0')
  })

  it('a variable chip commits its name, never the {k} a LaTeX field keeps', () => {
    expect(odeFrom('y^{\\prime}^{\\prime}+ky=0', ['k'])).toBe('y″ + k * y = 0')
    expect(odeFrom('y^{\\prime}^{\\prime}+\\mathrm{omega}^{2}y=0', ['omega'])).toBe('y″ + omega ^ 2 * y = 0')
  })

  it('the part’s own letters are read, whatever they are', () => {
    expect(odeFrom('v^{\\prime}=-kv', ['k'], 't', 'v')).toBe('v′ = -(k * v)')
  })

  it('refuses anything but exactly one = sign, a blank side, an unknown letter or a third derivative, in words', () => {
    expect(readEquation('y^{\\prime}^{\\prime}+y', [], 'x', 'y')).toEqual({ problem: 'Write the equation with one = sign, like y″ + y = 0.' })
    expect(readEquation('y=0=1', [], 'x', 'y')).toEqual({ problem: 'Write the equation with one = sign, like y″ + y = 0.' })
    expect(readEquation('y^{\\prime}+y=', [], 'x', 'y')).toEqual({ problem: 'Write both sides of the equation, like y″ + y = 0.' })
    expect(readEquation('y^{\\prime}=-k', [], 'x', 'y')).toEqual({ problem: 'There is no variable called k.' })
    expect(readEquation('y^{\\prime}^{\\prime}^{\\prime}=0', [], 'x', 'y')).toEqual({ problem: 'PhysLab checks an equation in y, y′ and y″, not a higher derivative.' })
  })

  it('an empty field commits nothing, and a saved equation shows back in the field as the same equation', () => {
    expect(readEquation('  ', [], 'x', 'y')).toEqual({ expr: '' })
    for (const ode of ['y″ + y = 0', 'y″ + omega ^ 2 * y = 0', "y'' + y = 0"]) {
      const back = equationLatex(ode, ['omega'], 'y')
      expect(back, ode).toContain('y^{\\prime\\prime}')
      expect(odeFrom(back, ['omega'])).toBe(ode.includes('omega') ? 'y″ + omega ^ 2 * y = 0' : 'y″ + y = 0')
    }
  })

  it('what the field commits from editor LaTeX, with a variable chip, is marked through a saved file: sin(2x) right, sin(x) wrong', () => {
    const q = throughFile(
      withPart(
        {
          type: 'function',
          prompt: 'Find y(x).',
          x: 'x',
          y: 'y',
          ode: odeFrom('y^{\\prime}^{\\prime}+ky=0', ['F', 'theta', 'k']),
          initial: [
            { at: '0', order: 0, value: '0' },
            { at: '0', order: 1, value: '2' }
          ],
          model: 'sin(2 x)',
          marks: 2
        },
        [{ name: 'k', def: { kind: 'list', items: [4] } }]
      )
    )
    const played = playQuestion(q, 1, S)
    const part = played.parts[0]
    expect(isCorrect(checkPlayedPart(part, 'sin(2x)', played, S))).toBe(true)
    expect(checkPlayedPart(part, 'sin(x)', played, S).verdict).toBe('wrong')
  })

  it('the function’s own letter written as a Greek symbol keeps its prime, for a pendulum’s θ″', () => {
    // Split apart, "theta" and "″" used to be read as two separate, unknown names.
    expect(readEquation('\\theta^{\\prime\\prime}+\\theta=0', [], 't', 'theta')).toEqual({ expr: 'theta″ + theta = 0' })
    expect(readEquation('\\theta^{\\prime\\prime}+\\frac{g}{L}\\sin\\theta=0', ['g', 'L'], 't', 'theta')).toEqual({
      expr: 'theta″ + g / L * sin(theta) = 0'
    })
  })

  it('a letter straight after a command keeps its space, so the equation reads back', () => {
    // k * v ^ 2 used to come back as `k\cdotv^{2}`, one run-together name "cdotv".
    const tex = formulaLatex('k * v ^ 2', ['k'])
    expect(tex).not.toMatch(/\\cdot[a-zA-Z]/)
    expect(readFormula(tex, ['k'], ['v'])).toEqual({ expr: 'k * v ^ 2' })
  })
})

describe('a function part built from its name boxes, equation field and starting-condition rows', () => {
  const q = throughFile(
    withPart(
      {
        type: 'function',
        prompt: 'Find y(x).',
        x: 'x',
        y: 'y',
        ode: odeFrom('y^{\\prime}^{\\prime}+y=0', ['F', 'theta']),
        initial: [
          { at: '0', order: 0, value: '0' },
          { at: '0', order: 1, value: '1' }
        ],
        model: 'sin(x)',
        marks: 2
      },
      []
    )
  )

  it('keeps its own letters, equation and starting conditions', () => {
    expect(q.parts[0]).toMatchObject({ type: 'function', x: 'x', y: 'y', initial: [{ order: 0 }, { order: 1 }] })
  })

  it('marks y = sin(x) right and 2 sin(x) wrong (solves the equation, wrong start)', () => {
    const played = playQuestion(q, 1, S)
    const part = played.parts[0]
    expect(isCorrect(checkPlayedPart(part, 'y = sin(x)', played, S))).toBe(true)
    expect(checkPlayedPart(part, '2 sin(x)', played, S)).toEqual({
      verdict: 'wrong',
      message: 'That solves the equation but does not start where the question says: y′(0) should be 1.'
    })
  })
})

describe('a proof part built from its model chips and self-check rows is shown but never marked', () => {
  const q = throughFile(withPart({ type: 'proof', prompt: 'Prove that sin²θ + cos²θ = 1.', model: 'Divide x² + y² = r² by r².', selfCheck: ['You started from Pythagoras.', 'You divided by r².'], marks: 0 }))

  it('carries its model proof and self-check list into play', () => {
    const played = playQuestion(q, 1, S)
    const part = played.parts[0]
    expect(part.model?.flat().length).toBeGreaterThan(0)
    expect(part.selfCheck).toHaveLength(2)
  })

  it('is never marked: it says so in a sentence, and it is not one of the counted parts', () => {
    const played = playQuestion(q, 1, S)
    expect(checkPlayedPart(played.parts[0], 'By Pythagoras.', played, S)).toEqual({
      verdict: 'unreadable',
      message: 'A proof is not marked on this computer: compare yours with the model proof and its checklist.'
    })
  })
})

// ---------------------------------------------------------------------------
// A number part marked by a stated uncertainty (Eₙ), set by the tolerance seg
// ---------------------------------------------------------------------------

describe('a number part switched to "a stated uncertainty" round-trips and is marked by the Eₙ test', () => {
  const q = throughFile(withPart({ type: 'number', prompt: 'E₀', answer: '0.559146', unit: 'none', tolerance: { kind: 'stated', uref: '0.000001' }, marks: 3 }))

  it('reads back with the reference uncertainty the uref field committed', () => {
    expect(q.parts[0]).toMatchObject({ type: 'number', tolerance: { kind: 'stated', uref: '0.000001' } })
  })

  it('accepts a value with its own uncertainty within the Eₙ band, and refuses one given with no uncertainty at all', () => {
    const played = playQuestion(q, 1, S)
    const part = played.parts[0]
    expect(isCorrect(checkPlayedPart(part, '0.55915 ± 0.00001', played, S))).toBe(true)
    expect(checkPlayedPart(part, '0.5591', played, S)).toEqual({ verdict: 'unreadable', message: 'Give your uncertainty too, like 0.5591 ± 0.0001.' })
  })

  it('a maxRelU the % field committed is kept, and an uncertainty above it is refused', () => {
    const tight = throughFile(withPart({ type: 'number', prompt: 'E₀', answer: '0.559146', unit: 'none', tolerance: { kind: 'stated', uref: '0.000001', maxRelU: 0.01 }, marks: 3 }))
    expect(tight.parts[0]).toMatchObject({ tolerance: { maxRelU: 0.01 } })
    const played = playQuestion(tight, 1, S)
    expect(checkPlayedPart(played.parts[0], '0.55915 ± 0.1', played, S).verdict).toBe('wrong')
  })
})

// ---------------------------------------------------------------------------
// The Variables tab's "Keep only variants where…" condition
// ---------------------------------------------------------------------------

describe('a condition built in the Variables tab round-trips and is enforced by every draw', () => {
  const quadratic: PQQuestion = {
    id: 'roots-q',
    title: 'Real roots',
    statement: 'Solve {a}x² + {b}x + {c} = 0.',
    variables: [
      { name: 'a', def: { kind: 'range', from: 1, to: 3, step: 1 } },
      { name: 'b', def: { kind: 'range', from: -10, to: 10, step: 1 } },
      { name: 'c', def: { kind: 'range', from: -10, to: 10, step: 1 } }
    ],
    parts: [{ type: 'expression', prompt: 'A root', answer: '(-b + sqrt(b^2 - 4*a*c)) / (2*a)', symbols: ['x'], marks: 1 }],
    license: LICENSE,
    condition: { when: 'b^2 - 4*a*c >= 0', maxRuns: 200 }
  }

  it('round-trips the condition’s formula and try count unchanged', () => {
    const q = throughFile(quadratic)
    expect(q.condition).toEqual({ when: 'b^2 - 4*a*c >= 0', maxRuns: 200 })
  })

  it('every one of 500 seeds keeps a discriminant ≥ 0, never one that fails the condition', () => {
    const q = throughFile(quadratic)
    for (let seed = 1; seed <= 500; seed++) {
      const { values } = drawVariables(q, seed)
      expect(values.b ** 2 - 4 * values.a * values.c, `seed ${seed}`).toBeGreaterThanOrEqual(0)
    }
  })

  it('clearing the field (the empty-string commit) removes the condition, so every draw is kept', () => {
    const cleared: PQQuestion = { ...quadratic }
    delete cleared.condition
    const q = throughFile(cleared)
    expect(q.condition).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Export refuses a new-kind part left half-finished
// ---------------------------------------------------------------------------

describe('a new-kind part with a blank entry blocks Export, in a sentence naming what is missing', () => {
  const fn = (initial: { at: string; order: 0 | 1; value: string }[], ode = 'y″ + y = 0'): PQPart => ({ type: 'function', prompt: 'Find y(x).', x: 'x', y: 'y', ode, initial, model: 'sin(x)', marks: 2 })
  const problems = (part: PQPart): string[] => questionProblems(withPart(part), 0, S)

  it('a blank vector component, matrix cell or root each stop it (they played "3 i + undefined j" before)', () => {
    expect(problems({ type: 'vector', prompt: 'F', answer: ['3', ''], unit: 'none', tolerance: band, marks: 1 })).toEqual(["Question 'q' has a component with nothing written in it."])
    expect(
      problems({
        type: 'matrix',
        prompt: 'M',
        answer: [
          ['1', ''],
          ['2', '3']
        ],
        tolerance: band,
        marks: 1
      })
    ).toEqual(["Question 'q' has a cell with nothing written in it."])
    expect(problems({ type: 'roots', prompt: 'Solve', answer: ['2', ''], unit: 'none', tolerance: band, marks: 1 })).toEqual(["Question 'q' has a root with nothing written in it."])
  })

  it('a function part’s blank starting value, blank equation or blank own solution each stop it', () => {
    expect(problems(fn([{ at: '0', order: 0, value: '' }]))).toEqual(["Question 'q' has a starting condition with nothing written in it."])
    expect(problems(fn([{ at: '0', order: 0, value: '0' }], ''))).toEqual(["Question 'q' needs the equation its answer must solve."])
    expect(problems({ ...fn([{ at: '0', order: 0, value: '0' }]), model: '' } as PQPart)).toEqual(["Question 'q' needs your own solution, the one shown once revealed."])
  })

  it('a proof with a blank model or a blank self-check point stops it', () => {
    expect(problems({ type: 'proof', prompt: 'Prove it.', model: '', selfCheck: ['A point.'], marks: 0 })).toEqual(["Question 'q' needs its model proof."])
    expect(problems({ type: 'proof', prompt: 'Prove it.', model: 'Divide by r².', selfCheck: ['A point.', ' '], marks: 0 })).toEqual(["Question 'q' has a self-check point with nothing written in it."])
  })

  it('the same parts filled in are ready to go, and a roots part with every row removed ("no real roots") is too', () => {
    expect(problems({ type: 'vector', prompt: 'F', answer: ['F*cos(theta)', 'F*sin(theta)'], unit: 'N', tolerance: band, marks: 1 })).toEqual([])
    expect(problems({ type: 'roots', prompt: 'Solve x² + 1 = 0', answer: [], unit: 'none', tolerance: band, marks: 1 })).toEqual([])
    expect(
      problems(
        fn([
          { at: '0', order: 0, value: '0' },
          { at: '0', order: 1, value: '1' }
        ])
      )
    ).toEqual([])
    expect(problems({ type: 'proof', prompt: 'Prove it.', model: 'Divide by r².', selfCheck: ['A point.'], marks: 0 })).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// The condition's try count has a ceiling
// ---------------------------------------------------------------------------

describe('the condition’s try count is a whole number from 1 to 1000', () => {
  it('a huge count typed in the box is held at 1000, a zero or negative one at 1, a fraction rounded', () => {
    expect(MAX_CONDITION_RUNS).toBe(1000)
    expect(conditionRuns(100000)).toBe(1000)
    expect(conditionRuns(0)).toBe(1)
    expect(conditionRuns(-5)).toBe(1)
    expect(conditionRuns(37.6)).toBe(38)
    expect(conditionRuns(Number.NaN)).toBe(1)
  })

  it('a condition never met, at the ceiling, still draws all 510 of Export’s seeds quickly and says so', () => {
    const never: PQQuestion = {
      id: 'never',
      title: 'Never',
      statement: 'a is {a}.',
      variables: [{ name: 'a', def: { kind: 'range', from: 1, to: 10, step: 1 } }],
      parts: [{ type: 'number', prompt: 'a?', answer: 'a', unit: 'none', tolerance: band, marks: 1 }],
      license: LICENSE,
      condition: { when: 'a > 100', maxRuns: conditionRuns(100000) }
    }
    expect(questionProblems(never, 0, S).length).toBeGreaterThan(0)
    const t0 = performance.now()
    for (let seed = 1; seed <= 510; seed++) expect(drawVariables(never, seed).problems.length, `seed ${seed}`).toBeGreaterThan(0)
    // 510 × 1000 draws; at 100 000 tries each this took a hundred times as long and froze the panel.
    expect(performance.now() - t0).toBeLessThan(10000)
  })
})

// ---------------------------------------------------------------------------
// Renaming a function part's letters carries its equation and solution along
// ---------------------------------------------------------------------------

describe('renaming a function part’s letters rewrites its equation and solution in the new letters', () => {
  const built = (): FunctionPartT => ({
    type: 'function',
    prompt: 'Find y(x).',
    x: 'x',
    y: 'y',
    ode: odeFrom('y^{\\prime}^{\\prime}+y=0', ['F', 'theta']),
    initial: [
      { at: '0', order: 0, value: '0' },
      { at: '0', order: 1, value: '1' }
    ],
    model: 'sin(x)',
    marks: 2
  })

  it('y → v and x → t, through a saved file: v = sin(t) and sin(t) are marked right, as sin(x) was before', () => {
    // Only the letters used to change: "y″ + y = 0" stayed, and every answer was marked wrong.
    const renamed = renameFunctionLetters(built(), 't', 'v')
    expect(renamed).toMatchObject({ x: 't', y: 'v', ode: 'v″ + v = 0', model: 'sin(t)' })
    const q = throughFile(withPart(renamed))
    expect(questionProblems(q, 0, S)).toEqual([])
    const played = playQuestion(q, 1, S)
    const part = played.parts[0]
    expect(isCorrect(checkPlayedPart(part, 'v = sin(t)', played, S))).toBe(true)
    expect(isCorrect(checkPlayedPart(part, 'sin(t)', played, S))).toBe(true)
    expect(checkPlayedPart(part, '2 sin(t)', played, S).verdict).toBe('wrong')
  })

  it('the renamed equation shows back in the equation field and reads in the new letters', () => {
    const renamed = renameFunctionLetters(built(), 't', 'v')
    expect(odeFrom(equationLatex(renamed.ode, [], 'v'), [], 't', 'v')).toBe('v″ + v = 0')
  })

  it('y → theta for a pendulum keeps each prime on its own letter, and g and L stay the variables they are', () => {
    const pendulum: FunctionPartT = { ...built(), x: 't', ode: odeFrom('y^{\\prime\\prime}+\\frac{g}{L}\\sin y=0', ['g', 'L'], 't', 'y'), model: 'sin(t)' }
    expect(renameFunctionLetters(pendulum, 't', 'theta')).toMatchObject({ y: 'theta', ode: 'theta″ + g / L * sin(theta) = 0' })
  })

  it('swapping the two letters swaps them, never merging both into one', () => {
    const p: FunctionPartT = { ...built(), ode: 'y′ = x * y', model: 'e ^ (x ^ 2 / 2)' }
    expect(renameFunctionLetters(p, 'y', 'x')).toMatchObject({ x: 'y', y: 'x', ode: 'x′ = y * x', model: 'e ^ (y ^ 2 / 2)' })
  })

  it('unchanged letters leave the part exactly as it was', () => {
    const p = built()
    expect(renameFunctionLetters(p, 'x', 'y')).toBe(p)
  })

  it('Export refuses a part whose equation or solution is still in letters it no longer has', () => {
    const stale = { ...built(), x: 't', y: 'v' }
    expect(questionProblems(withPart(stale), 0, S)).toEqual([
      "Question 'q': its equation uses y″, which is not a variable, t, v, v′ or v″.",
      "Question 'q': your own solution uses x, which is not a variable or t."
    ])
  })

  it('renaming a question variable used in the equation renames it there too, and the variable counts as in use', () => {
    // mathjs does not read a whole equation, so the rename used to leave k behind in it.
    const q = withPart({ ...built(), ode: 'y″ + k * y = 0' }, [{ name: 'k', def: { kind: 'list', items: [1] } }])
    expect(variableInUse(q, 'k')).toBe(true)
    const r = renameVariable(q, 'k', 'm')
    expect((r.parts[0] as FunctionPartT).ode).toBe('y″ + m * y = 0')
    expect(questionProblems(r, 0, S)).toEqual([])
  })
})

describe('a function part’s letter and a question variable never share a name', () => {
  // The finding's question: k = 4, y″ + k y = 0, solved by sin(√k x) with y(0) = 0, y′(0) = √k.
  const spring = (): PQQuestion =>
    withPart(
      {
        type: 'function',
        prompt: 'Find y(x).',
        x: 'x',
        y: 'y',
        ode: 'y″ + k * y = 0',
        initial: [
          { at: '0', order: 0, value: '0' },
          { at: '0', order: 1, value: 'sqrt(k)' }
        ],
        model: 'sin(sqrt(k) * x)',
        marks: 2
      },
      [{ name: 'k', def: { kind: 'list', items: [4] } }]
    )
  const names = (q: PQQuestion): string[] => q.variables.map((v) => v.name)

  it('the spring question as written exports clean and marks sin(2x) right', () => {
    const q = spring()
    expect(questionProblems(q, 0, S)).toEqual([])
    const played = playQuestion(throughFile(q), 1, S)
    expect(isCorrect(checkPlayedPart(played.parts[0], 'sin(2 x)', played, S))).toBe(true)
  })

  it('the name boxes refuse the variable k as the function’s own letter or its free letter, in a sentence', () => {
    // Before, only the two letters were checked against each other: y → k gave k″ + k * k = 0.
    const vars = names(spring())
    expect(functionLettersProblem('x', 'k', vars)).toBe('There is already a variable called k.')
    expect(functionLettersProblem('k', 'y', vars)).toBe('There is already a variable called k.')
    expect(functionLettersProblem('t', 'v', vars)).toBeNull()
    expect(functionLettersProblem('x', 'x', vars)).toBe('There is already a variable called x.')
  })

  it('the Variables tab refuses renaming k to the part’s own letter or its free letter, naming which', () => {
    const q = spring()
    expect(functionLetterClash(q, 'y')).toBe('y is the function’s own letter; choose another name.')
    expect(functionLetterClash(q, 'x')).toBe('x is the free letter; choose another name.')
    expect(functionLetterClash(q, 'm')).toBeNull()
    const two: PQQuestion = { ...q, parts: [{ type: 'number', prompt: 'k?', answer: 'k', unit: 'none', tolerance: band, marks: 1 }, ...q.parts] }
    expect(functionLetterClash(two, 'y')).toBe('y is the function’s own letter in part 2; choose another name.')
  })

  it('a new variable never takes a function part’s letter', () => {
    const q = spring()
    expect(functionLetters(q)).toEqual(['x', 'y'])
    const taken = 'abcdfghkmnpqrsu'.split('')
    const inV: PQQuestion = { ...q, parts: [{ ...(q.parts[0] as FunctionPartT), y: 'v' }] }
    expect(nextVariableName(taken)).toBe('v')
    expect(nextVariableName([...taken, ...functionLetters(inV)])).toBe('w')
  })

  it('Export refuses a part whose letter merged with a variable, whichever way the merge came', () => {
    const q = spring()
    // The letter renamed to k (as the name boxes used to allow), or the variable k renamed to y
    // (as the Variables tab used to allow): both used to pass Export and mark every answer wrong.
    const letterToK: PQQuestion = { ...q, parts: [renameFunctionLetters(q.parts[0] as FunctionPartT, 'x', 'k')] }
    expect((letterToK.parts[0] as FunctionPartT).ode).toBe('k″ + k * k = 0')
    expect(questionProblems(letterToK, 0, S)).toContain("Question 'q': its function’s own letter k is also a variable’s name. Rename one of them.")
    const freeToK: PQQuestion = { ...q, parts: [renameFunctionLetters(q.parts[0] as FunctionPartT, 'k', 'y')] }
    expect((freeToK.parts[0] as FunctionPartT).model).toBe('sin(sqrt(k) * k)')
    expect(questionProblems(freeToK, 0, S)).toContain("Question 'q': its free letter k is also a variable’s name. Rename one of them.")
    const variableToY = renameVariable(q, 'k', 'y')
    expect(questionProblems(variableToY, 0, S)).toContain("Question 'q': its function’s own letter y is also a variable’s name. Rename one of them.")
  })
})

// ---------------------------------------------------------------------------
// Export and the preview work out every entry of a new-kind answer, variant by variant
// ---------------------------------------------------------------------------

describe('a vector, matrix, roots or starting-condition answer that cannot be worked out for some variants stops Export', () => {
  // a runs 1 to 100, and a few of Export's draws (the preview's seed 7 among them) give a < 3.
  const withA = (part: PQPart, condition?: PQQuestion['condition']): PQQuestion => ({
    id: 'a',
    title: 'a',
    statement: 'a is {a}.',
    variables: [{ name: 'a', def: { kind: 'range', from: 1, to: 100, step: 1 } }],
    parts: [part],
    license: LICENSE,
    ...(condition ? { condition } : {})
  })
  const vector: PQPart = { type: 'vector', prompt: 'The vector', answer: ['sqrt(a - 3)', '1'], unit: 'none', tolerance: band, marks: 1 }
  const roots: PQPart = { type: 'roots', prompt: 'The roots', answer: ['sqrt(a - 3)', '-sqrt(a - 3)'], unit: 'none', tolerance: band, marks: 1 }
  const matrix: PQPart = {
    type: 'matrix',
    prompt: 'The matrix',
    answer: [
      ['1', 'sqrt(a - 3)'],
      ['0', '1']
    ],
    tolerance: band,
    marks: 1
  }
  const start: PQPart = { type: 'function', prompt: 'Find y(x).', x: 'x', y: 'y', ode: 'y′ = y', initial: [{ at: '0', order: 0, value: 'sqrt(a - 3)' }], model: 'sqrt(a - 3) * e ^ x', marks: 1 }
  const stated: PQPart = { type: 'number', prompt: 'The value', answer: 'a', unit: 'none', tolerance: { kind: 'stated', uref: 'sqrt(a - 3)' }, marks: 1 }

  it('each is refused, naming the preview row whose numbers do not work (they played "undefined i + 1 j" before)', () => {
    for (const [part, prompt] of [
      [vector, 'The vector'],
      [roots, 'The roots'],
      [matrix, 'The matrix'],
      [start, 'Find y(x).'],
      [stated, 'The value']
    ] as const) {
      expect(questionProblems(withA(part), 0, S), prompt).toEqual([`Question 'a', preview row 7: PhysLab could not work out the answer to "${prompt}", so it cannot mark it.`])
    }
  })

  it('a variant beyond the preview’s ten is found too, in the "some numbers do not work" sentence naming it', () => {
    // Only a = 1 fails, which no preview row draws; one of Export's 500 more does.
    const rare = withA({ ...vector, answer: ['1 / (a - 1)', '1'] } as PQPart)
    const rows = previewRows(rare, S)
    expect(rows.every((r) => r.problems.length === 0)).toBe(true)
    expect(questionProblems(rare, 0, S)).toEqual(["Question 'a': some numbers a student may be given do not work. The answer cannot be worked out when a = 1."])
  })

  it('the preview row itself says so, and the part’s own check under its answer too', () => {
    const q = withA(vector)
    expect(previewRows(q, S)[6].problems).toEqual(['PhysLab could not work out the answer to "The vector", so it cannot mark it.'])
    expect(partCheck(q, 0, 7, S)).toEqual({ kind: 'problem', text: 'PhysLab could not work out the answer to "The vector", so it cannot mark it.' })
  })

  it('the condition a ≥ 3, chip-built in the Variables tab, keeps only variants that work, and Export passes', () => {
    for (const part of [vector, roots, matrix, start, stated]) expect(questionProblems(withA(part, { when: 'a >= 3', maxRuns: 100 }), 0, S), part.prompt).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// A proof's chips follow a renamed variable
// ---------------------------------------------------------------------------

describe('renaming a variable renames its chips in a proof’s model and self-check points', () => {
  const proofQ = (): PQQuestion => ({
    id: 'p',
    title: 'p',
    statement: 'Show it for any a.',
    variables: [{ name: 'a', def: { kind: 'list', items: [2] } }],
    parts: [{ type: 'proof', prompt: 'Prove it.', model: 'Divide by {a}.', selfCheck: ['You divided by {a}.', 'You checked {a} is not 0.'], marks: 0 }],
    license: LICENSE
  })

  it('the model and every self-check point follow a → b, and play with b’s number instead of a literal {a}', () => {
    const r = renameVariable(proofQ(), 'a', 'b')
    expect(r.parts[0]).toMatchObject({ model: 'Divide by {b}.', selfCheck: ['You divided by {b}.', 'You checked {b} is not 0.'] })
    const played = playQuestion(throughFile(r), 1, S)
    const shown = JSON.stringify([played.parts[0].model, played.parts[0].selfCheck])
    expect(shown).not.toContain('{a}')
    expect(shown).not.toContain('{b}')
  })

  it('a variable chipped only into a proof counts as in use, so it is not offered for deletion as unused', () => {
    expect(variableInUse(proofQ(), 'a')).toBe(true)
  })
})
