// A question's steps into the Working panel's shape. If these pass, every line of LaTeX a
// templated step produces survives the real KaTeX (the pureRender rule), the numbers in the
// steps are the numbers in the statement, engine-made steps splice in where the author asked,
// fading removes exactly what it should and the level moves the way §5 says.

import { beforeEach, describe, expect, it } from 'vitest'
import katex from 'katex'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import type { Move, Working } from '../src/renderer/src/math/pure/work'
import { UNIT_IDS, type FadingLevel, type PQQuestion } from '../src/renderer/src/questions/pqjson'
import { fromExam } from '../src/renderer/src/questions/numbas'
import {
  FILL_IN_NOTE,
  VECTOR_SOLVER_NAMES,
  fadeMoves,
  nextLevel,
  readSolverArg,
  stepsToWorking,
  texText,
  type StepMove
} from '../src/renderer/src/questions/steps'
import { texQuantity } from '../src/renderer/src/questions/units'
import { drawVariables } from '../src/renderer/src/questions/variables'
import { resetGlobals } from './helpers/globals'

beforeEach(resetGlobals)

const SETTINGS: MeasureSettings = { decimals: 4, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }

const renders = (tex: string, where: string): void => {
  expect(() => katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: 'ignore' }), `${where}: ${tex}`).not.toThrow()
}

/** Everything in one piece of working that will be handed to KaTeX. */
function rendersAll(w: Working, where: string): void {
  if (w.input) renders(w.input, `${where} input`)
  w.moves.forEach((m, i) => {
    if (m.tex) renders(m.tex, `${where} move ${i + 1} tex`)
    if (m.rule) renders(m.rule, `${where} move ${i + 1} rule`)
  })
  w.answers.forEach((a) => renders(a.tex, `${where} answer "${a.label}"`))
}

const CC = { id: 'CC BY 4.0' as const, holder: 'PhysLab' }

/** The braking-train reference question with every kind of part and a step of each kind. */
const TRAIN: PQQuestion = {
  id: 'train',
  title: 'Braking train',
  statement: 'A train moving at {u} slows at {a} for {t}.\n$$v = {u} - {a} \\times {t}$$',
  variables: [
    { name: 'u', def: { kind: 'range', from: 20, to: 40, step: 5 }, unit: 'm/s' },
    { name: 'a', def: { kind: 'range', from: 0.5, to: 2, step: 0.5 }, unit: 'm/s²' },
    { name: 't', def: { kind: 'range', from: 2, to: 8, step: 1 }, unit: 's' },
    { name: 'vend', def: { kind: 'expr', expr: 'u - a * t' }, unit: 'm/s' },
    { name: 'neg', def: { kind: 'expr', expr: '-a' }, unit: 'm/s²' },
    { name: 'charge', def: { kind: 'expr', expr: '1.6e-19' }, unit: 'C' },
    { name: 'theta', def: { kind: 'list', items: [30, 45, 60] }, unit: '°' }
  ],
  parts: [
    { type: 'number', prompt: 'Speed after {t}?', answer: 'vend', unit: 'm/s', tolerance: { kind: 'relative', value: 0.02 }, marks: 2 },
    { type: 'number', prompt: 'The charge?', answer: 'charge', unit: 'C', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 },
    { type: 'expression', prompt: 'Speed as a function of time s.', answer: 'u - a * s', symbols: ['s'], marks: 1 },
    {
      type: 'choice',
      prompt: 'Speeding up or slowing down?',
      choices: [
        { text: 'Speeding up by 5%', correct: false },
        { text: 'Slowing down at {a} & braking', correct: true }
      ],
      shuffle: false,
      marks: 1
    }
  ],
  steps: {
    level: 'worked',
    items: [
      { head: 'Write down v = u + at with a = {neg}.', tex: 'v = {u} + {neg} \\times {t}', rule: 'v = u + at', blank: true },
      { head: 'So the final speed is {vend}.', tex: 'v = {vend}', note: 'The train had {u} to start with.', blank: false },
      { head: 'The angle {theta} and the charge {charge} come along too.', tex: '\\theta = {theta}, q = {charge}', blank: true }
    ]
  },
  license: CC
}

describe('stepsToWorking', () => {
  it('fills the chips with the drawn numbers and every line survives KaTeX', () => {
    const variant = drawVariables(TRAIN, 3)
    expect(variant.problems).toEqual([])
    const w = stepsToWorking(TRAIN, variant, SETTINGS)
    rendersAll(w, 'train')
    expect(w.title).toBe('Braking train')
    expect(w.checked).toBe('ok')
    expect(w.error).toBeUndefined()
    // The display line of the statement is the input, with the same numbers as the chips.
    const { u, a, t, vend } = variant.values
    expect(w.input).toBe(`v = ${u}\\,\\mathrm{m/s} - ${a}\\,\\mathrm{m/s^{2}} \\times ${t}\\,\\mathrm{s}`)
    expect(w.moves).toHaveLength(3)
    expect(w.moves[0].subgoal).toBe('Working')
    expect(w.moves[0].head).toBe(`Write down v = u + at with a = −${a} m/s².`)
    // A negative value in maths is bracketed, so the line is not read as a subtraction.
    expect(w.moves[0].tex).toBe(`v = ${u}\\,\\mathrm{m/s} + \\left(-${a}\\,\\mathrm{m/s^{2}}\\right) \\times ${t}\\,\\mathrm{s}`)
    expect(w.moves[0].rule).toBe('v = u + at')
    expect(w.moves[1].note).toBe(`The train had ${u} m/s to start with.`)
    // A degree sits against its number; a tiny known value is scientific, never 0.
    expect(w.moves[2].tex).toBe(`\\theta = ${variant.values.theta}^{\\circ}, q = 1.6\\times 10^{-19}\\,\\mathrm{C}`)
    expect(w.moves[2].head).toContain('1.6×10^-19 C')
    // One answer per part, from the same numbers.
    expect(w.answers.map((x) => x.label)).toEqual([`Speed after ${t} s?`, 'The charge?', 'Speed as a function of time s.', 'Speeding up or slowing down?'])
    expect(w.answers[0].tex).toBe(`${vend}\\,\\mathrm{m/s}`)
    expect(w.answers[1].tex).toBe('1.6\\times 10^{-19}\\,\\mathrm{C}')
    expect(w.answers[2].tex).toContain('s')
    expect(w.answers[2].tex).not.toContain('u')
    expect(w.answers[3].tex).toBe(`\\text{Slowing down at ${a} m/s² \\& braking}`)
  })

  it('renders for every unit a variable may carry and every seed of the sample', () => {
    for (const unit of UNIT_IDS) renders(texQuantity(-2.5, unit, SETTINGS), unit)
    for (const unit of UNIT_IDS) renders(texQuantity(1.6e-19, unit, { decimals: 3, precisionMode: 'sf' }), `${unit} sf`)
    for (let seed = 1; seed <= 10; seed++) {
      const variant = drawVariables(TRAIN, seed)
      for (const level of ['worked', 'half', 'solo'] as const) rendersAll(stepsToWorking(TRAIN, variant, SETTINGS, level), `seed ${seed} ${level}`)
    }
    renders(`\\text{${texText('100% of $5 & #1 {x} \\ a_b ^ ~')}}`, 'texText')
  })

  it('gives the answers even when there are no steps, and says ? for an answer it cannot work out', () => {
    const bare: PQQuestion = { ...TRAIN, steps: undefined, parts: [{ ...TRAIN.parts[0], answer: 'sqrt(-1) * )' } as PQQuestion['parts'][0]] }
    const w = stepsToWorking(bare, drawVariables(bare, 1), SETTINGS)
    expect(w.moves).toEqual([])
    expect(w.answers[0].tex).toBe('\\text{?}')
    expect(w.checked).toBe('ok')
    rendersAll(w, 'bare')
  })

  it('brackets a negative value in an expression answer, and a unit under a power', () => {
    const q: PQQuestion = {
      ...TRAIN,
      variables: [
        { name: 'a', def: { kind: 'list', items: [-2] } },
        { name: 't', def: { kind: 'list', items: [5] }, unit: 's' },
        { name: 'th', def: { kind: 'list', items: [30] }, unit: '°' },
        { name: 'n', def: { kind: 'list', items: [3] } }
      ],
      parts: [
        { type: 'expression', prompt: 'f(x)?', answer: 'x - a + a^2 * x', symbols: ['x'], marks: 1 },
        { type: 'expression', prompt: 'g(x)?', answer: 'x - n', symbols: ['x'], marks: 1 }
      ],
      steps: {
        level: 'worked',
        items: [
          { head: 'Square the time.', tex: 'h = \\frac{1}{2} g {t}^2 + {th}^2 + {n}^2 + {t} ^{2}', blank: false }
        ]
      }
    }
    const w = stepsToWorking(q, drawVariables(q, 1), SETTINGS)
    rendersAll(w, 'brackets')
    // x - (-2), not x--2; (-2)^2, not {-2}^{2}, which a student reads as -(2^2).
    expect(w.answers[0].tex.trim()).toBe('x-\\left(-2\\right)+{\\left(-2\\right)}^{2}\\cdot x')
    expect(w.answers[1].tex.trim()).toBe('x-3')
    // (5 s)^2, not 5 s^2; a bare number needs no bracket, and a chip that is not raised none either.
    expect(w.moves[0].tex).toBe(
      'h = \\frac{1}{2} g \\left(5\\,\\mathrm{s}\\right)^2 + \\left(30^{\\circ}\\right)^2 + 3^2 + \\left(5\\,\\mathrm{s}\\right) ^{2}'
    )
  })

  it('splices in the Pure Math engine for an auto step and says so when it cannot', () => {
    const q: PQQuestion = {
      ...TRAIN,
      variables: [
        { name: 'b', def: { kind: 'list', items: [5] } },
        { name: 'c', def: { kind: 'list', items: [6] } }
      ],
      parts: [{ type: 'number', prompt: 'Root?', answer: '-2', unit: 'none', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }],
      steps: {
        level: 'worked',
        items: [
          { head: 'Factorise the quadratic.' },
          { head: '', auto: { engine: 'pure', job: 'factor', input: 'x^2 + {b}x + {c}' } },
          { head: '', auto: { engine: 'pure', job: 'nosuchjob', input: 'x' } },
          { head: '', auto: { engine: 'pure', job: 'primes', input: 'x + 1' } },
          { head: 'Done.' }
        ]
      }
    }
    const w = stepsToWorking(q, drawVariables(q, 1), SETTINGS)
    rendersAll(w, 'auto pure')
    const heads = w.moves.map((m) => m.head)
    expect(heads[0]).toBe('Factorise the quadratic.')
    expect(heads[heads.length - 1]).toBe('Done.')
    expect(w.moves.length).toBeGreaterThan(5)
    const all = w.moves.map((m) => `${m.tex ?? ''} ${m.head}`).join(' ')
    expect(all).toContain('x + 2')
    expect(all).toContain('x + 3')
    const stuck = w.moves.filter((m) => m.head === 'PhysLab could not work this step out.')
    expect(stuck).toHaveLength(2)
    expect(stuck[0].note).toBeUndefined()
    expect(stuck[1].note).toBe('Prime factors need a whole number, like 360.')
    // The answers still come first (rule 3).
    expect(w.answers[0].tex).toBe('-2')
  })

  it('splices in a vector solver for an auto step, reading its inputs from the filled-in text', () => {
    const q: PQQuestion = {
      ...TRAIN,
      variables: [
        { name: 'F', def: { kind: 'list', items: [50] }, unit: 'N' },
        { name: 'th', def: { kind: 'list', items: [30] }, unit: '°' },
        { name: 'q', def: { kind: 'list', items: [1.6e-19] }, unit: 'C' }
      ],
      parts: [{ type: 'number', prompt: 'Fx?', answer: 'F * cos(th)', unit: 'N', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }],
      steps: {
        level: 'worked',
        items: [
          { head: '', auto: { engine: 'vectors', solver: 'solveComponents', args: ['F', '{F}', '{th}', 'N'] } },
          { head: '', auto: { engine: 'vectors', solver: 'solveDot', args: ['A: <1, 2, 3>', 'B = (4, 5, 6)'] } },
          { head: '', auto: { engine: 'vectors', solver: 'solveAddition', args: ['A: <1, 0>; B: <0, 1>', 'R'] } },
          { head: '', auto: { engine: 'vectors', solver: 'solveNothing', args: [] } },
          { head: '', auto: { engine: 'vectors', solver: 'solveDot', args: ['A: <1, 2', 'B'] } },
          // The charge chip prints as 1.6×10^-19, which the solver must get as a number, not a word.
          { head: '', auto: { engine: 'vectors', solver: 'solveMagneticForce', args: ['{q}', '<1e5, 0, 0>', '<0, 0.5, 0>'] } }
        ]
      }
    }
    const w = stepsToWorking(q, drawVariables(q, 1), SETTINGS)
    rendersAll(w, 'auto vectors')
    expect(w.moves.some((m) => m.tex?.includes('50') && m.tex.includes('30'))).toBe(true)
    expect(w.moves.some((m) => m.tex?.includes('32'))).toBe(true) // 1·4 + 2·5 + 3·6
    expect(w.moves.filter((m) => m.head === 'PhysLab could not work this step out.')).toHaveLength(2)
    expect(w.answers[0].tex).toBe('43.3013\\,\\mathrm{N}')
    // Every solver the table names exists under that name, so an author's choice never dangles.
    expect(VECTOR_SOLVER_NAMES.length).toBe(19)
    expect(readSolverArg('−3.5', {})).toBe(-3.5)
    expect(readSolverArg('F = (7, 2)', {})).toEqual({ name: 'F', v: [7, 2, 0] })
    expect(readSolverArg('F = (Fx * 2, 2)', { Fx: 7 })).toEqual({ name: 'F', v: [14, 2, 0] })
    expect(readSolverArg('<1, 2, 3>', {})).toEqual([1, 2, 3])
    expect(readSolverArg('N', {})).toBe('N')
    // A chip in scientific form, or a small sum, is a number; a unit with a digit in it and a name are still words.
    expect(readSolverArg('1.6×10^-19', {})).toBe(1.6e-19)
    expect(readSolverArg('1.5×10^-3', {})).toBe(0.0015)
    expect(readSolverArg('2 * 3', {})).toBe(6)
    expect(readSolverArg('m/s^2', {})).toBe('m/s^2')
    expect(readSolverArg('F1', {})).toBe('F1')
    expect(w.moves.some((m) => m.tex?.includes('10^{-19}') || m.tex?.includes('10^{-15}'))).toBe(true)
  })

  it('hands a vector solver the drawn values themselves, not their rounded text', () => {
    // F = 10.1249 N shows as 10.12 at 2 dp; handed over as that text, its x-component came out
    // 8.76 while the part's own answer, from the real F, is 8.77.
    const q: PQQuestion = {
      ...TRAIN,
      variables: [
        { name: 'F', def: { kind: 'list', items: [10.1249] }, unit: 'N' },
        { name: 'th', def: { kind: 'list', items: [30] }, unit: '°' }
      ],
      parts: [{ type: 'number', prompt: 'Fx?', answer: 'F * cos(th)', unit: 'N', tolerance: { kind: 'relative', value: 0.001 }, marks: 1 }],
      steps: { level: 'worked', items: [{ head: '', auto: { engine: 'vectors', solver: 'solveComponents', args: ['F', '{F}', '{th}', 'N'] } }] }
    }
    const at2: MeasureSettings = { ...SETTINGS, decimals: 2 }
    const w = stepsToWorking(q, drawVariables(q, 1), at2)
    rendersAll(w, 'exact solver inputs')
    expect(w.answers[0].tex).toBe('8.77\\,\\mathrm{N}')
    const all = w.moves.map((m) => m.tex ?? '').join('\n')
    expect(all).toContain('8.77')
    expect(all).not.toContain('8.76')
  })

  it('reads a Numbas question through the importer and shows its steps: the boundary the bank crosses', () => {
    const exam = JSON.stringify({
      name: 'x',
      question_groups: [
        {
          questions: [
            {
              name: 'Fall',
              statement: '<p>A stone falls for {t} s.</p><p>\\[h = \\frac{1}{2} g t^2\\]</p>',
              advice: '<p>Use \\(h = \\frac{1}{2}gt^2\\) with \\(g = 9.8\\).</p><p>\\[h = \\frac{1}{2} \\times 9.8 \\times \\var{t}^2\\]</p>',
              variables: { t: { name: 't', definition: 'random(1..5)' }, h: { name: 'h', definition: 'precround(0.5*9.8*t^2, 2)' } },
              parts: [{ type: 'numberentry', marks: 1, prompt: '<p>How far does it fall, in m?</p>', minValue: 'h - 0.01', maxValue: 'h + 0.01' }],
              metadata: { licence: 'Creative Commons Attribution 4.0 International' },
              contributors: [{ name: 'Someone' }]
            }
          ]
        }
      ]
    })
    const { file, report } = fromExam(exam)
    expect(report).toEqual([])
    const q = file.questions[0]
    const variant = drawVariables(q, 2)
    const w = stepsToWorking(q, variant, SETTINGS)
    rendersAll(w, 'imported')
    expect(w.input).toBe('h = \\frac{1}{2} g t^2')
    expect(w.moves[0].head).toBe('Use h = 1/2gt² with g = 9.8.')
    expect(w.moves[0].tex).toBe(`h = \\frac{1}{2} \\times 9.8 \\times ${variant.values.t}^2`)
    expect(w.answers[0]).toEqual({ label: 'How far does it fall, in m?', tex: `${variant.values.h}\\,\\mathrm{m}` })
  })
})

describe('fading', () => {
  const moves: StepMove[] = [
    { head: 'First', tex: 'a = 1', rule: 'r', subgoal: 'Working', blank: true },
    { head: 'Second', tex: 'b = 2', note: 'careful', blank: false },
    { head: 'Third', tex: 'c = 3', blank: true }
  ]

  it('worked shows everything, half blanks the marked maths, solo keeps only the heads', () => {
    const worked = fadeMoves(moves, 'worked')
    expect(worked).toEqual([
      { head: 'First', tex: 'a = 1', rule: 'r', subgoal: 'Working' },
      { head: 'Second', tex: 'b = 2', note: 'careful' },
      { head: 'Third', tex: 'c = 3' }
    ])
    expect(worked.some((m) => 'blank' in m)).toBe(false)

    const half = fadeMoves(moves, 'half')
    expect(half).toEqual([
      { head: 'First', rule: 'r', subgoal: 'Working', note: FILL_IN_NOTE },
      { head: 'Second', tex: 'b = 2', note: 'careful' },
      { head: 'Third', note: FILL_IN_NOTE }
    ])

    const solo: Move[] = fadeMoves(moves, 'solo')
    expect(solo).toEqual([{ head: 'First', subgoal: 'Working' }, { head: 'Second' }, { head: 'Third' }])
  })

  it('is applied by stepsToWorking at the saved level or the level asked for', () => {
    const variant = drawVariables(TRAIN, 1)
    expect(stepsToWorking(TRAIN, variant, SETTINGS).moves.every((m) => m.tex !== undefined)).toBe(true)
    const half = stepsToWorking(TRAIN, variant, SETTINGS, 'half').moves
    expect(half.map((m) => m.tex === undefined)).toEqual([true, false, true])
    expect(half[0].note).toBe(FILL_IN_NOTE)
    const saved: PQQuestion = { ...TRAIN, steps: { level: 'solo', items: TRAIN.steps!.items } }
    expect(stepsToWorking(saved, variant, SETTINGS).moves.every((m) => m.tex === undefined && m.note === undefined)).toBe(true)
  })

  it('moves a level further every second right answer in a row and back one on a wrong answer', () => {
    expect(nextLevel('worked', 1)).toBe('worked')
    expect(nextLevel('worked', 2)).toBe('half')
    expect(nextLevel('half', 3)).toBe('half')
    expect(nextLevel('half', 4)).toBe('solo')
    expect(nextLevel('solo', 6)).toBe('solo')
    expect(nextLevel('solo', 0)).toBe('half')
    expect(nextLevel('half', 0)).toBe('worked')
    expect(nextLevel('worked', 0)).toBe('worked')
    // A whole session: right, right, right, right, wrong, right, right.
    let level: FadingLevel = 'worked'
    let streak = 0
    const path: string[] = []
    for (const right of [true, true, true, true, false, true, true]) {
      streak = right ? streak + 1 : 0
      level = nextLevel(level, streak)
      path.push(level)
    }
    expect(path).toEqual(['worked', 'half', 'half', 'solo', 'half', 'half', 'solo'])
  })
})

describe('words with maths in them', () => {
  it('speaks the inline maths of a heading, a note and an answer\'s label, as a prompt\'s is', () => {
    const q: PQQuestion = {
      ...TRAIN,
      parts: [{ ...TRAIN.parts[0], prompt: 'Find \\(v_{\\mathrm{end}}\\) after {t}.' }],
      steps: { level: 'worked', items: [{ head: 'Use \\(v_{0} = {u}\\).', note: 'Then \\(a = {a}\\).', tex: 'v = {vend}' }] }
    }
    const variant = drawVariables(q, 2)
    const w = stepsToWorking(q, variant, SETTINGS)
    for (const text of [w.moves[0].head, w.moves[0].note!, w.answers[0].label]) {
      expect(text).not.toMatch(/\\\(|\\\)|\\mathrm|[{}]/)
    }
    expect(w.moves[0].head).toContain(`${variant.values.u}`)
    expect(w.moves[0].head.startsWith('Use v')).toBe(true)
  })
})
