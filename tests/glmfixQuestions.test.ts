// GLM-5.3 audit findings on question marking, the equation checker, variables, Numbas export and
// authoring (PhysLab-research/09/glm-audit/CONFIRMED.md #1 #2 #4 #9 #10 #12 #13 #14 #15 #20 #21).
// Each test holds the finding's own input and the right result, and failed on phase-0.9 before
// its fix. Every test crosses a boundary: a typed line into a verdict, a file into migrate, a
// question into Numbas and back, an author's edit into the preview the teacher sees.

import { beforeEach, describe, expect, it } from 'vitest'
import { resetGlobals } from './helpers/globals'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import { checkRootsPart, checkStated, enTest } from '../src/renderer/src/questions/answerKinds'
import { blankQuestion, parsePQFile, serializePQFile, type PQFile, type PQPart, type PQQuestion, type VariableDef } from '../src/renderer/src/questions/pqjson'
import { fromExam, toExam } from '../src/renderer/src/questions/numbas'
import { checkFunctionPart, primed, ROUNDING_MESSAGE, type FunctionPart } from '../src/renderer/src/questions/odeCheck'
import { conditionHolds, drawVariables, type Variant } from '../src/renderer/src/questions/variables'
import { partCheck, previewRows, suggestFix } from '../src/renderer/src/questions/authoring'
import { getAngleMode, math, setAngleMode } from '../src/renderer/src/math/expr'
import { FILE_VERSION, parseSceneFile } from '../src/renderer/src/core/migrate'
import { loadBundled } from '../src/renderer/src/questions/bank'

type RootsPart = Extract<PQPart, { type: 'roots' }>

beforeEach(() => resetGlobals())

const S: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }

describe('#1 a stated answer of exactly 0 against a reference of exactly 0', () => {
  it('0 ± 0.05 N against a net force of 0 ± 0.05 N is right, with Eₙ = 0', () => {
    const c = checkStated('0 ± 0.05 N', { x: 0, u: 0.05, unit: 'N' }, S)
    expect(c.verdict).toBe('right')
    expect(c.message).toBe('Agrees with the reference value within the two uncertainties: Eₙ = 0, and 1 or less agrees.')
  })

  it('0 ± 0 against 0 ± 0 is right too', () => {
    expect(checkStated('0 ± 0', { x: 0, u: 0, unit: 'none' }, S).verdict).toBe('right')
  })

  it('a 0 against a reference that is not 0 is still refused in words, without the reference in it', () => {
    const c = checkStated('0 ± 0.05', { x: 0.01, u: 0.05, unit: 'none' }, S)
    expect(c).toMatchObject({ verdict: 'wrong', message: 'Your value is 0, so your uncertainty cannot be judged against it. Check your value.' })
  })
})

describe('#10 two values with no uncertainty that differ only in the 17th digit', () => {
  // The reference worked out as 0.1 + 0.2 = 0.30000000000000004 with uref = 0; the student types 0.3 ± 0.
  const ref = { x: 0.1 + 0.2, u: 0, unit: 'none' as const }

  it('agree with Eₙ = 0, never "Eₙ = ∞, and 1 or less agrees"', () => {
    expect(enTest(0.3, 0, 0.1 + 0.2, 0)).toEqual({ en: 0, ok: true })
    const c = checkStated('0.3 ± 0', ref, S)
    expect(c.verdict).toBe('right')
    expect(c.message).toBe('Agrees with the reference value within the two uncertainties: Eₙ = 0, and 1 or less agrees.')
  })

  it('while a real gap with no allowance is still further apart, and says no Eₙ', () => {
    expect(enTest(0.31, 0, 0.3, 0)).toEqual({ en: Infinity, ok: false })
    const c = checkStated('0.31 ± 0', { x: 0.3, u: 0, unit: 'none' }, S)
    expect(c.verdict).toBe('wrong')
    expect(c.message).not.toContain('Eₙ')
  })

  it('and an Eₙ that agrees is never shown as ∞ for any pair of values a hair apart', () => {
    for (const [a, b] of [[0.7, 0.1 * 7], [1.1, 0.1 * 11], [3.3, 1.1 * 3], [1e-8, 1e-8 * (1 + Number.EPSILON)]]) {
      const c = checkStated(`${a} ± 0`, { x: b, u: 0, unit: 'none' }, S)
      if (c.verdict === 'right') expect(c.message, `${a} vs ${b}`).not.toContain('∞')
    }
  })
})

describe('#9 the band round each root is its own, not the largest value in the set', () => {
  // Roots 2 and 10⁹ with a 2 % band: 2's band is 0.04, not 0.04 + 10⁻⁹ × 10⁹ = 1.04.
  const part: RootsPart = { type: 'roots', prompt: 'Solve it.', answer: ['2', '1000000000'], unit: 'none', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }

  it('"3, 1000000000" has one of the two roots, not both', () => {
    expect(checkRootsPart('3, 1000000000', part, {}, S)).toEqual({ verdict: 'wrong', message: 'You have 1 of the 2 roots, but 1 of your values is not a root.' })
  })

  it('values inside each root\'s own 2 % are still right', () => {
    for (const t of ['2, 1000000000', '2.03, 1000000000', '1.97, 1019000000', '1000000000, 2']) {
      expect(checkRootsPart(t, part, {}, S).verdict, t).toBe('right')
    }
    expect(checkRootsPart('2, 1021000000', part, {}, S).verdict).toBe('wrong')
  })

  it('a root of exactly 0 keeps its floor of 10⁻⁹, however large the other root', () => {
    const zero: RootsPart = { ...part, answer: ['0', '1000000000'] }
    expect(checkRootsPart('0, 1000000000', zero, {}, S).verdict).toBe('right')
    expect(checkRootsPart('0.5, 1000000000', zero, {}, S).verdict).toBe('wrong')
  })
})

// ---------------------------------------------------------------------------
// The equation checker (odeCheck.ts)
// ---------------------------------------------------------------------------

const fnPart = (ode: string, initial: FunctionPart['initial']): FunctionPart => ({
  type: 'function',
  prompt: 'Find y.',
  x: 'x',
  y: 'y',
  ode,
  initial,
  model: '',
  marks: 1
})

describe('#2 a starting condition that names a variable drawn in degrees', () => {
  // θ = 30° enters y″ + w²y = 0 as 0.5235987756 rad; y(0) = θ must be the same 0.5235987756.
  const part = fnPart("y'' + w^2 y = 0", [{ at: '0', order: 0, value: 'theta' }])
  const values = { theta: 30, w: 2 }
  const units = { theta: '°' as const }

  it('y = θ cos(w x) starts where the question says, and so do π/6 cos 2x and a rounded 0.5236 cos 2x', () => {
    expect(checkFunctionPart('theta * cos(w x)', part, values, units)).toEqual({ verdict: 'right' })
    expect(checkFunctionPart('(pi/6) cos(2x)', part, values, units)).toEqual({ verdict: 'right' })
    expect(checkFunctionPart('0.5236 cos(2x)', part, values, units)).toEqual({ verdict: 'right', message: ROUNDING_MESSAGE })
  })

  it('30 cos 2x, the degree number read as radians, does not', () => {
    expect(checkFunctionPart('30 cos(2x)', part, values, units)).toEqual({
      verdict: 'wrong',
      message: 'That solves the equation but does not start where the question says: y(0) should be 0.5236.'
    })
  })

  it('a condition with a trig function in it is worked the way the equation is: y(0) = sin θ is 0.5', () => {
    const sinPart = fnPart("y'' + w^2 y = 0", [{ at: '0', order: 0, value: 'sin(theta)' }])
    expect(checkFunctionPart('sin(theta) cos(w x)', sinPart, values, units)).toEqual({ verdict: 'right' })
    expect(checkFunctionPart('0.5 cos(2x)', sinPart, values, units)).toEqual({ verdict: 'right' })
  })

  it('and sin 1 in a condition is the sine of 1 radian, as in the equation (0.8414709848), even with the calculator in degrees', () => {
    setAngleMode('deg')
    const one = fnPart("y'' + y = 0", [{ at: '0', order: 0, value: 'sin(1)' }])
    expect(checkFunctionPart('sin(1) cos(x)', one, {})).toEqual({ verdict: 'right' })
    expect(checkFunctionPart('0.8414709848 cos(x)', one, {})).toEqual({ verdict: 'right' })
    expect(getAngleMode()).toBe('deg')
  })
})

describe('#12 an equation typed with a curly and a straight prime together', () => {
  it("y′' and y'′ are the second derivative, the one name ″ the checker puts in scope", () => {
    expect(primed("y′' + y = 0")).toBe('y″ + y = 0')
    expect(primed("y'′ + y = 0")).toBe('y″ + y = 0')
    expect(primed("y'' + y′′ + y' = 0")).toBe('y″ + y″ + y′ = 0')
  })

  it('so sin x is marked right against it, not "no value at most points"', () => {
    for (const ode of ["y′' + y = 0", "y'′ + y = 0"]) {
      expect(checkFunctionPart('sin(x)', fnPart(ode, [{ at: '0', order: 0, value: '0' }]), {}), ode).toEqual({ verdict: 'right' })
    }
  })
})

describe('#14 the wrong-letter check needs a formula with values to check', () => {
  // v′ = −v in t, v(0) = 1. √(−1 − x²) has no real value anywhere, in x or in t.
  const inT: FunctionPart = { ...fnPart("v' = -v", [{ at: '0', order: 0, value: '1' }]), x: 't', y: 'v' }

  it('√(−1 − x²) is not "the right function in the wrong letter"', () => {
    expect(checkFunctionPart('sqrt(-1 - x^2)', inT, {})).toEqual({
      verdict: 'wrong',
      message: 'Your answer still has x in it: use the starting condition to find its value.'
    })
  })

  it('while e^(−x) still is', () => {
    expect(checkFunctionPart('e^(-x)', inT, {})).toEqual({ verdict: 'wrong', message: 'Write it in t: your answer uses x.' })
  })
})

// ---------------------------------------------------------------------------
// Drawing the variables (variables.ts)
// ---------------------------------------------------------------------------

describe('#13 a variable that could not be drawn never meets a condition', () => {
  it('d = NaN does not satisfy d != 5, not (d == 5), or an "or" that names it', () => {
    expect(math.evaluate('d != 5', { d: NaN })).toBe(true) // mathjs's own answer, which kept the draw
    expect(conditionHolds('d != 5', { d: NaN })).toBe(false)
    expect(conditionHolds('not (d == 5)', { d: NaN })).toBe(false)
    expect(conditionHolds('d > 0 or a > 0', { d: NaN, a: 1 })).toBe(false)
  })

  it('a condition that does not name it, or a drawn value, is judged as before', () => {
    expect(conditionHolds('a > 0', { d: NaN, a: 1 })).toBe(true)
    expect(conditionHolds('d != 5', { d: 4 })).toBe(true)
    expect(conditionHolds('d != 5', { d: 5 })).toBe(false)
    expect(conditionHolds('dd != 5', { d: 4 })).toBeNull()
  })

  it('so a question with d = √b and "d != 5" keeps drawing past every negative b', () => {
    const q: PQQuestion = {
      ...blankQuestion(),
      title: 'Root',
      variables: [
        { name: 'b', def: { kind: 'range', from: -4, to: 4, step: 1 } },
        { name: 'd', def: { kind: 'expr', expr: 'sqrt(b)' } }
      ],
      condition: { when: 'd != 5', maxRuns: 100 }
    }
    let negatives = 0
    for (let seed = 1; seed <= 40; seed++) {
      if (drawVariables({ ...q, condition: undefined }, seed).values.b < 0) negatives++
      const v = drawVariables(q, seed)
      expect(Number.isFinite(v.values.d), `seed ${seed}`).toBe(true)
      expect(v.problems, `seed ${seed}`).toEqual([])
    }
    expect(negatives).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Numbas export (numbas.ts writeCarried)
// ---------------------------------------------------------------------------

describe('#15 error carried forward from a part that is not a number, sent to Numbas', () => {
  // A loadable PhysLab question: (a) the force as a vector, (b) its size, marked with (a) through a.
  const band = { kind: 'relative' as const, value: 0.02 }
  const force: PQQuestion = {
    ...blankQuestion(),
    id: 'force',
    title: 'A force in pieces',
    statement: 'A force has pieces {a} and {b}.',
    license: { id: 'CC BY 4.0', holder: 'Ms Khan' },
    variables: [
      { name: 'a', def: { kind: 'list', items: [3] }, unit: 'N' },
      { name: 'b', def: { kind: 'list', items: [4] }, unit: 'N' }
    ],
    parts: [
      { type: 'vector', prompt: 'Write the force.', answer: ['a', 'b'], unit: 'N', tolerance: band, marks: 1 },
      { type: 'number', prompt: 'How big is it?', answer: 'sqrt(a^2 + b^2)', unit: 'N', tolerance: band, marks: 1, ecf: { uses: [{ part: 0, variable: 'a' }], strategy: 'originalfirst', penalty: 0 } }
    ]
  }
  const file: PQFile = { app: 'PhysLab', format: 'pqjson', version: 2, questions: [force] }
  const exam = (text: string): Record<string, unknown> =>
    (JSON.parse(text.replace(/^[^\n]*\n/, '')) as { question_groups: { questions: Record<string, unknown>[] }[] }).question_groups[0].questions[0]

  it('is a question PhysLab itself opens', () => {
    expect(parsePQFile(serializePQFile(file)).questions).toHaveLength(1)
  })

  it('is not written as adaptive marking on the vector, and the description says why', () => {
    const out = toExam(file)
    const q = exam(out)
    const parts = q.parts as Record<string, unknown>[]
    expect(parts[1].variableReplacements).toEqual([])
    expect((q.metadata as { description: string }).description).toContain(
      'PhysLab marks part 2 with the answer to part 1, which is not a single number Numbas can carry forward, so Numbas marks it without.'
    )
  })

  it('so Export to Numbas and Import back keeps the question instead of dropping it without a word', () => {
    const { file: back, report } = fromExam(toExam(file))
    expect(back.questions.map((q) => q.title)).toEqual(['A force in pieces'])
    // Numbas holds the vector as a gap-fill of two number boxes, which come back as number parts.
    expect(back.questions[0].parts.every((p) => p.ecf === undefined)).toBe(true)
    expect(report.join(' ')).not.toContain('skipped')
  })
})

// ---------------------------------------------------------------------------
// A question in a hand-edited .phys file (core/migrate.ts checkQuestions)
// ---------------------------------------------------------------------------

describe('#4 a hand-edited question whose picture, motion, sandbox, steps or distractors are damaged', () => {
  const band = { kind: 'relative', value: 0.02 }
  const base = {
    id: 'q1',
    title: 'Hand edited',
    statement: 'A cart moves at {v}.',
    variables: [{ name: 'v', def: { kind: 'list', items: [3] }, unit: 'm/s' }],
    parts: [{ type: 'number', prompt: 'How far in 2 s?', answer: '2*v', unit: 'm', tolerance: band, marks: 1 }],
    license: { id: 'CC BY 4.0', holder: 'Ms Khan' }
  }
  const choice = (distractors: unknown) => ({ type: 'choice', prompt: 'Pick one.', choices: [], shuffle: true, distractors, marks: 1 })
  const open = (q: unknown) => parseSceneFile(JSON.stringify({ app: 'PhysLab', version: FILE_VERSION, objects: [], settings: {}, questions: [q] }))

  it('refuses each one in words, naming the question, instead of letting the Author panel crash on it', () => {
    const damaged: Record<string, unknown>[] = [
      // The finding's own: a piecewise picture with no pieces crashed at pic.pieces.map.
      { picture: { kind: 'piecewise' } },
      { picture: { kind: 'piecewise', pieces: [{ expr: 'x', from: 0, to: '2' }] } },
      { picture: { kind: 'curve' } },
      { picture: { kind: 'curve', expr: 'x^2', xMin: 0 } },
      { picture: { kind: 'between', upper: 'x', lower: 'x^2', from: '0' } },
      { picture: { kind: 'tangent', expr: 'x^2' } },
      { picture: { kind: 'normal', mean: '0' } },
      { picture: { kind: 'vectors', items: [{ name: 'F', v: '3, 4' }] } },
      { picture: { kind: 'vectors', items: [{ name: 'F', v: ['3', '4'], role: 'answer' }] } },
      { picture: { kind: 'dots', count: 12, perRow: 5 } },
      { picture: { kind: 'curves', items: [{ expr: 'x' }] } },
      { picture: { kind: 'numberline', items: 'none' } },
      { picture: { kind: 'hologram' } },
      { picture: 'curve' },
      { picture: null },
      // m.segments.map
      { motion: { plots: ['x-t'] } },
      { motion: { segments: [{ kind: 'uniform', duration: '2' }], plots: ['x-t'] } },
      { motion: { segments: [{ kind: 'teleport', duration: '2' }], plots: ['x-t'] } },
      { motion: { segments: [{ kind: 'rest', duration: '2' }], plots: ['speed-time'] } },
      { motion: { segments: [{ kind: 'rest', duration: '2' }] } },
      { motion: { segments: [{ kind: 'rest', duration: '2' }], plots: ['x-t'], x0: 0 } },
      // sb.actuators.map
      { sandbox: { preset: 'ramp' } },
      { sandbox: { preset: 'ramp', actuators: [{ body: 'Crate', force: ['3', '0'] }] } },
      { sandbox: { preset: 'ramp', actuators: [{ body: 'Crate', force: ['3', '0', '0'], from: 1 }] } },
      { sandbox: { actuators: [] } },
      { sandbox: { preset: 'ramp', actuators: [], record: 7 } },
      // LEVELS.find(...)!.about
      { steps: { level: 'fast', items: [] } },
      { steps: { items: [] } },
      // input.trim() on an undefined auto input
      { steps: { level: 'worked', items: [{ head: '', auto: { engine: 'pure', job: 'factor' } }] } },
      { steps: { level: 'worked', items: [{ head: '', auto: { engine: 'vectors', solver: 'resultant', args: '3, 4' } }] } },
      { steps: { level: 'worked', items: [{ head: '', auto: { engine: 'guess' } }] } },
      { steps: { level: 'worked', items: [{ head: 'Add.', tex: 3 }] } },
      { steps: { level: 'half', items: [{ head: 'Add.', blank: 'yes' }] } },
      // p.distractors!.rules.includes(rule)
      { parts: [choice({ correct: 'v' })] },
      { parts: [choice({ correct: 'v', unit: 'm/s', rules: 'sign' })] },
      { parts: [choice({ unit: 'm/s', rules: ['sign'] })] },
      { parts: [choice({ correct: 'v', rules: ['sign'] })] },
      { parts: [choice('sign')] }
    ]
    for (const d of damaged) {
      expect(() => open({ ...base, ...d }), JSON.stringify(d)).toThrow("Question 'Hand edited' in this file is damaged.")
    }
  })

  it('still opens every well-formed one unchanged: each picture kind, each stretch of motion, a sandbox, both kinds of worked step, generated choices', () => {
    const good: Record<string, unknown>[] = [
      { picture: { kind: 'curve', expr: 'x^2' } },
      { picture: { kind: 'curve', expr: 'x^2', xMin: '0', xMax: 'v' } },
      { picture: { kind: 'piecewise', pieces: [{ expr: 'x', from: '0', to: '2' }] } },
      { picture: { kind: 'between', upper: 'x', lower: 'x^2', from: '0', to: '1', label: 'A' } },
      { picture: { kind: 'tangent', expr: 'x^2', at: '1' } },
      { picture: { kind: 'normal', mean: '0', sd: '1', to: '1.5' } },
      { picture: { kind: 'vectors', items: [{ name: 'F', v: ['3', '4'] }, { name: 'R', v: ['1', '2', '3'], tail: ['0', '0', '0'], role: 'result' }] } },
      { picture: { kind: 'dots', count: 'v', perRow: 5 } },
      { picture: { kind: 'curves', items: [{ expr: 'x', label: 'Train A', from: '0', to: '4' }] } },
      { picture: { kind: 'numberline', items: [{ label: '', value: 'v' }] } },
      {
        motion: {
          x0: '0',
          v0: 'v',
          segments: [
            { kind: 'rest', duration: '1' },
            { kind: 'uniform', duration: '2', v: 'v' },
            { kind: 'accelerate', duration: '2', a: '-1' }
          ],
          plots: ['x-t', 'v-t', 'a-t'],
          sampleEvery: '0.5'
        }
      },
      { sandbox: { preset: 'ramp', actuators: [{ body: 'Crate', force: ['3', '0', '0'], from: '0', until: '1' }], record: 'Crate' } },
      { sandbox: { preset: 'ramp', actuators: [] } },
      {
        steps: {
          level: 'half',
          items: [
            { head: 'Distance is speed times time.', tex: 's = {v} \\times 2', rule: 's = vt', note: 'n', blank: true },
            { head: '', auto: { engine: 'pure', job: 'factor', input: 'x^2 - 1' } },
            { head: '', auto: { engine: 'vectors', solver: 'resultant', args: ['3', '4'] } }
          ]
        }
      },
      { steps: { level: 'solo', items: [] } },
      { parts: [choice({ correct: 'v', unit: 'm/s', rules: ['sign', 'half-double'] })] }
    ]
    for (const g of good) {
      const q = { ...base, ...g }
      expect(open(q).questions, JSON.stringify(g)).toEqual([q])
    }
  })

  it('every bundled question, saved in a project, opens again', () => {
    const qs = loadBundled().questions
    expect(qs.length).toBeGreaterThan(10)
    expect(parseSceneFile(JSON.stringify({ app: 'PhysLab', version: FILE_VERSION, objects: [], settings: {}, questions: qs })).questions).toEqual(qs)
  })
})

// ---------------------------------------------------------------------------
// The offered zero-fix (authoring.ts suggestFix)
// ---------------------------------------------------------------------------

describe('#20 the offered zero-fix never pushes a range end past its other end', () => {
  it('t from 0 to 0.5 step 1 (only 0 is ever drawn) offers no fix at all, not from: 1 (past the 0.5 end)', () => {
    const q: PQQuestion = { ...blankQuestion(), variables: [{ name: 't', def: { kind: 'range', from: 0, to: 0.5, step: 1 } }] }
    const v: Variant = { seed: 1, values: { t: 0 }, problems: [] }
    // Excluding 0 here would leave nothing to draw either (variables.ts then refuses "t could
    // not avoid the excluded values" for every seed) — the same dead end in a different message,
    // so suggestFix must not offer it: there is no one-line fix for a range that can only be 0.
    const fix = suggestFix(q, v, ["a = u/t could not be worked out: t = 0."])
    expect(fix).toBeNull()
  })

  it('the mirror to: 0 case (only 0 is ever drawn) is protected the same way', () => {
    const q: PQQuestion = { ...blankQuestion(), variables: [{ name: 't', def: { kind: 'range', from: -0.5, to: 0, step: 1 } }] }
    const v: Variant = { seed: 1, values: { t: 0 }, problems: [] }
    const fix = suggestFix(q, v, ["t = 0"])
    expect(fix).toBeNull()
  })

  it('while a range with room to spare still gets the start-at / end-at fix', () => {
    const wide: PQQuestion = { ...blankQuestion(), variables: [{ name: 't', def: { kind: 'range', from: 0, to: 10, step: 1 } }] }
    const wv: Variant = { seed: 1, values: { t: 0 }, problems: [] }
    const wideFix = suggestFix(wide, wv, ["t = 0"])
    expect(wideFix?.text).toBe('t can be 0 — start it at 1?')
    expect((wideFix!.apply(wide).variables[0].def as Extract<VariableDef, { kind: 'range' }>).from).toBe(1)

    const wide2: PQQuestion = { ...blankQuestion(), variables: [{ name: 't', def: { kind: 'range', from: -10, to: 0, step: 1 } }] }
    const w2v: Variant = { seed: 1, values: { t: 0 }, problems: [] }
    const wide2Fix = suggestFix(wide2, w2v, ["t = 0"])
    expect(wide2Fix?.text).toBe('t can be 0 — end it at −1?')
  })

  it('a range with 0 strictly inside it (not at either end) still gets the exclude fix, with values left over', () => {
    const q: PQQuestion = { ...blankQuestion(), variables: [{ name: 't', def: { kind: 'range', from: -5, to: 5, step: 1 } }] }
    const v: Variant = { seed: 1, values: { t: 0 }, problems: [] }
    const fix = suggestFix(q, v, ["t = 0"])
    expect(fix?.text).toBe('t can be 0 — never draw 0?')
    const applied = fix!.apply(q)
    const def = applied.variables[0].def as Extract<VariableDef, { kind: 'range' }>
    expect(def.exclude).toEqual([0])
    expect(def.from).toBe(-5)
    expect(def.to).toBe(5)
  })

  // Review round 1: the count guard ignored the range's own exclude list.
  it('t from −1 to 1 step 1 with −1 and 1 already excluded (only 0 is left) offers no fix, not exclude: [−1, 1, 0]', () => {
    const q: PQQuestion = { ...blankQuestion(), variables: [{ name: 't', def: { kind: 'range', from: -1, to: 1, step: 1, exclude: [-1, 1] } }] }
    const v: Variant = { seed: 1, values: { t: 0 }, problems: [] }
    expect(suggestFix(q, v, ['t = 0'])).toBeNull()
  })

  it('a fix that is offered always leaves variables.ts something to draw, for every seed', () => {
    const cases: Extract<VariableDef, { kind: 'range' }>[] = [
      { kind: 'range', from: -1, to: 1, step: 1, exclude: [1] },
      { kind: 'range', from: 0, to: 2, step: 1, exclude: [1, 2] },
      { kind: 'range', from: 0, to: 3, step: 1, exclude: [1] },
      { kind: 'range', from: -2, to: 0, step: 1, exclude: [-1, -2] }
    ]
    for (const def of cases) {
      const q: PQQuestion = { ...blankQuestion(), variables: [{ name: 't', def }] }
      const fix = suggestFix(q, { seed: 1, values: { t: 0 }, problems: [] }, ['t = 0'])
      if (fix === null) continue
      const fixed = fix.apply(q)
      for (let seed = 1; seed <= 20; seed++) {
        const drawn = drawVariables(fixed, seed)
        expect(drawn.problems).toEqual([])
        expect(drawn.values.t).not.toBe(0)
      }
    }
    // Only 0 is left in the second and fourth once their own excludes are out: no fix there.
    const only0 = [cases[1], cases[3]].map((def) => suggestFix({ ...blankQuestion(), variables: [{ name: 't', def }] }, { seed: 1, values: { t: 0 }, problems: [] }, ['t = 0']))
    expect(only0).toEqual([null, null])
    // The first leaves −1 once 0 is out; the third starts at 1 and still draws 2 and 3.
    const first: PQQuestion = { ...blankQuestion(), variables: [{ name: 't', def: cases[0] }] }
    expect(suggestFix(first, { seed: 1, values: { t: 0 }, problems: [] }, ['t = 0'])?.text).toBe('t can be 0 — never draw 0?')
    const third: PQQuestion = { ...blankQuestion(), variables: [{ name: 't', def: cases[2] }] }
    expect(suggestFix(third, { seed: 1, values: { t: 0 }, problems: [] }, ['t = 0'])?.text).toBe('t can be 0 — start it at 1?')
  })
})

// ---------------------------------------------------------------------------
// The authoring preview's own answer box (authoring.ts partCheck)
// ---------------------------------------------------------------------------

describe('#21 partCheck looks a showIf-hidden part up by its author index, not array position', () => {
  const q: PQQuestion = {
    ...blankQuestion(),
    title: 'Two parts, one hidden',
    variables: [{ name: 'x', def: { kind: 'list', items: [3] } }],
    parts: [
      { type: 'number', prompt: 'A (never shown)', answer: 'x', unit: 'none', tolerance: { kind: 'relative', value: 0.02 }, marks: 1, showIf: 'x > 10' },
      { type: 'number', prompt: 'B (always shown)', answer: 'x + 1', unit: 'none', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }
    ]
  }

  it("part B's own box shows its own answer, not nothing", () => {
    const check = partCheck(q, 1, 1, S)
    expect(check?.kind).toBe('answer')
    expect(check?.text).toContain('4')
  })

  it("the hidden part A's box shows no answer at all — never part B's, mis-attributed", () => {
    const check = partCheck(q, 0, 1, S)
    expect(check).toBeNull()
  })
})

// Review round 1: previewRows had #21's positional lookup, and its played question holds only
// the parts with an answer written, so a PlayedPart's .index counts those, not the author's parts.
describe('#21 (preview rows) each Variables-tab answer belongs to its own part', () => {
  const B: PQPart = { type: 'number', prompt: 'B (always shown)', answer: 'x + 1', unit: 'none', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }
  const hidden: PQPart = { type: 'number', prompt: 'A (never shown)', answer: 'x', unit: 'none', tolerance: { kind: 'relative', value: 0.02 }, marks: 1, showIf: 'x > 10' }
  const blank: PQPart = { type: 'number', prompt: 'Not written yet', answer: '', unit: 'none', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }
  const base = { ...blankQuestion(), title: 'Preview', variables: [{ name: 'x', def: { kind: 'list' as const, items: [3] } }] }

  it('a showIf-hidden part shows no answer and the part after it shows its own', () => {
    const [row] = previewRows({ ...base, parts: [hidden, B] }, S, 1)
    expect(row.answers[0]).toBeNull()
    expect(row.answers[1]?.text).toContain('4')
  })

  it('with an unwritten part first, the author index — not the played index — picks the row', () => {
    const [row] = previewRows({ ...base, parts: [blank, hidden, B] }, S, 1)
    expect(row.answers[0]).toBeNull()
    expect(row.answers[1]).toBeNull()
    expect(row.answers[2]?.text).toContain('4')
    const [row2] = previewRows({ ...base, parts: [blank, B, hidden] }, S, 1)
    expect(row2.answers[1]?.text).toContain('4')
    expect(row2.answers[2]).toBeNull()
  })
})
