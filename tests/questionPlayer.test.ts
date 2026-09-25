// The question player: a question from the bank or a teacher's file becomes the Problem the
// Practice panel already knows how to play, its pictures become graph objects, its motion becomes
// x–t and v–t curves and a Lab Data table, and its experiment becomes a preset with a push on a
// named body. Every test crosses a boundary — a file into questions, a typed line into a verdict,
// a formula into the drawing's numbers.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The stylesheet is not loaded here, so the drawing's colours fall back.
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { resetGlobals } from './helpers/globals'
import { readSource } from './helpers/repo'
import { math, preprocess } from '../src/renderer/src/math/expr'
import { checkAnswer, isCorrect } from '../src/renderer/src/math/checkAnswer'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import { integrate } from '../src/renderer/src/calc/engine'
import { scene } from '../src/renderer/src/core/store'
import type { GraphObj } from '../src/renderer/src/core/types'
import { useLab } from '../src/renderer/src/lab/labStore'
import { useSandbox } from '../src/renderer/src/sim/store'
import type { PQMotion, PQQuestion } from '../src/renderer/src/questions/pqjson'
import { motionAt, motionPieces, motionTable } from '../src/renderer/src/questions/motion'
import { bundledSets, loadBundled, loadTeacherFile } from '../src/renderer/src/questions/bank'
import { serializePQFile } from '../src/renderer/src/questions/pqjson'
import { fromExam, toExam } from '../src/renderer/src/questions/numbas'
import { UNITS } from '../src/renderer/src/questions/units'
import { graphBox } from '../src/renderer/src/core/visualize'
import { useCameraCommand } from '../src/renderer/src/render/viewState'
import { evaluateInVariables, lettersBeforeBrackets, withoutNameEquals } from '../src/renderer/src/questions/parts'
import katex from 'katex'
import {
  bindValues,
  checkPlayedPart,
  describePush,
  picturePlan,
  plainFormula,
  playQuestion,
  sandboxPlan,
  sendSandboxReadings,
  showMotion,
  showPicture,
  showSandbox,
  spokenOf,
  type Played,
  type PlayedPart
} from '../src/renderer/src/questions/player'

beforeEach(() => resetGlobals())

const SETTINGS: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }

/** The braking train: the reference question every binding hangs off. */
function train(over: Partial<PQQuestion> = {}): PQQuestion {
  return {
    id: 'train',
    title: 'A braking train',
    statement: 'A train moving at {v} brakes evenly and stops in {t}.\n$$ s = \\tfrac{1}{2} v t $$',
    variables: [
      { name: 'v', def: { kind: 'range', from: 10, to: 30, step: 2 }, unit: 'm/s' },
      { name: 't', def: { kind: 'range', from: 20, to: 40, step: 5 }, unit: 's' }
    ],
    parts: [
      {
        type: 'number',
        prompt: 'How far does it go while braking?',
        answer: 'v * t / 2',
        unit: 'm',
        tolerance: { kind: 'relative', value: 0.02 },
        traps: [{ value: 'v * t', why: 'That is v × t, the distance at full speed; braking evenly covers half of it.' }],
        marks: 2
      },
      { type: 'expression', prompt: 'Write its speed after s seconds of braking.', answer: 'v - v / t * s', symbols: ['s'], sampleRange: [0, 10], marks: 1 },
      {
        type: 'choice',
        prompt: 'What is its deceleration?',
        choices: [],
        shuffle: true,
        distractors: { correct: 'v / t', unit: 'm/s²', rules: ['reciprocal', 'half-double', 'power-of-ten'] },
        marks: 1
      }
    ],
    steps: {
      level: 'worked',
      items: [
        { head: 'Speed falls evenly from {v} to 0, so the average speed is half of it.', tex: '\\bar v = \\tfrac{1}{2}({v})', blank: true },
        { head: 'Distance is average speed times time.', tex: 's = \\bar v \\times {t}', blank: true }
      ]
    },
    license: { id: 'CC BY 4.0', holder: 'PhysLab' },
    ...over
  }
}

// ---------------------------------------------------------------------------
// A question into the Problem the panel plays
// ---------------------------------------------------------------------------

describe('playQuestion', () => {
  it('turns a number part into a box that checkAnswer marks right, from the numbers in the statement', () => {
    const played = playQuestion(train(), 7, SETTINGS)
    const { v, t } = played.variant.values
    expect(spokenOf(played.statement[0])).toBe(`A train moving at ${v} m/s brakes evenly and stops in ${t} s.`)
    expect(played.statement[1]).toEqual([{ tex: expect.stringContaining('\\tfrac{1}{2}'), display: true }])
    const [field] = played.problem.fields
    expect(field.value).toBe((v * t) / 2)
    expect(field.unit).toBe('m')
    expect(checkAnswer(String((v * t) / 2), field, SETTINGS).verdict).toBe('right')
    // The named trap reaches the student through the same box.
    const trap = checkAnswer(String(v * t), field, SETTINGS)
    expect(trap.verdict).toBe('wrong')
    expect(trap.message).toContain('half of it')
    // Same seed, same question.
    expect(playQuestion(train(), 7, SETTINGS).problem).toEqual(played.problem)
  })

  it('reads a unit typed in the box and converts it before marking', () => {
    const played = playQuestion(train(), 3, SETTINGS)
    const part = played.parts[0]
    const metres = played.problem.fields[0].value
    expect(checkPlayedPart(part, `${metres / 1000} km`, played, SETTINGS).verdict).toBe('right')
    const wrongKind = checkPlayedPart(part, `${metres} s`, played, SETTINGS)
    expect(wrongKind.verdict).toBe('wrong')
    expect(wrongKind.message).toBe('That is in seconds; this box wants metres.')
  })

  // INT-Wave1 review round 1: isCorrect counts only "right", and an expression 0.01 % out came
  // back "close" — a red cross over the words "Right up to rounding". Inside the 2 % rule it is
  // ticked with the sentence as an amber note; 1 % out is still wrong for an expression.
  it('ticks an expression right up to rounding, with its note, and never crosses that sentence', () => {
    const played = playQuestion(train(), 11, SETTINGS)
    const expr = played.parts[1]
    const { v, t } = played.variant.values
    const nearly = checkPlayedPart(expr, `${v * (1 + 1e-4)}*(1 - s/${t})`, played, SETTINGS)
    expect(nearly.verdict).toBe('right')
    expect(nearly.message).toMatch(/^Right up to rounding/)
    expect(isCorrect(nearly)).toBe(true)
    const off = checkPlayedPart(expr, `${v * 1.01}*(1 - s/${t})`, played, SETTINGS)
    expect(isCorrect(off)).toBe(false)
    expect(off.message ?? '').not.toMatch(/up to rounding/)
    const exact = checkPlayedPart(expr, `${v}*(1 - s/${t})`, played, SETTINGS)
    expect(exact.verdict).toBe('right')
    expect(exact.message).toBeUndefined()
  })

  it('marks an expression part and a generated choice part, naming the mistake behind a wrong pick', () => {
    const played = playQuestion(train(), 11, SETTINGS)
    const [, expr, choice] = played.parts
    expect(isCorrect(checkPlayedPart(expr, 'v*(1 - s/t)'.replace('v', String(played.variant.values.v)).replace('t', String(played.variant.values.t)), played, SETTINGS))).toBe(true)
    expect(checkPlayedPart(expr, 'x + 1', played, SETTINGS).message).toBe('The answer should only use s.')

    expect(choice.choices!.length).toBe(4)
    const right = choice.choices!.findIndex((c) => c.correct)
    expect(checkPlayedPart(choice, [right], played, SETTINGS).verdict).toBe('right')
    const wrong = choice.choices!.findIndex((c) => !c.correct)
    const verdict = checkPlayedPart(choice, [wrong], played, SETTINGS)
    expect(verdict.verdict).toBe('wrong')
    expect(verdict.message).toBe(choice.choices![wrong].why)
    // Every option reads differently: two identical texts, one right and one wrong, is no question.
    expect(new Set(choice.choices!.map((c) => c.text)).size).toBe(4)
  })

  it('plays a question whose generated options cannot be worked out, saying so instead of crashing', () => {
    const q = train({ variables: [] })
    const played = playQuestion(q, 1, SETTINGS)
    expect(played.parts[2].choices).toEqual([])
    expect(played.problems).toContain('PhysLab could not work out the options for "What is its deceleration?".')
  })

  it('makes the steps the hints, faded to the level asked for, and the answers the steps\' answers', () => {
    const worked = playQuestion(train(), 5, SETTINGS)
    expect(worked.problem.solution.steps).toHaveLength(2)
    expect(worked.working.moves[0].tex).toContain(`${worked.variant.values.v}`)
    const half = playQuestion(train(), 5, SETTINGS, 'half')
    expect(half.level).toBe('half')
    expect(half.working.moves.every((m) => m.tex === undefined && m.note === 'Fill this line in yourself, then reveal it.')).toBe(true)
    // The full solution is never faded: the lines left for the student are there to check against.
    expect(half.full.moves).toEqual(worked.working.moves)
    const solo = playQuestion(train(), 5, SETTINGS, 'solo')
    expect(solo.working.moves.map((m) => m.head)).toEqual(worked.working.moves.map((m) => m.head))
    expect(worked.problem.solution.answers).toHaveLength(3)
    expect(worked.parts[0].answerText).toBe(`${(worked.variant.values.v * worked.variant.values.t) / 2} m`)
  })
})

// ---------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------

const graphs = (): GraphObj[] => Object.values(scene().objects).filter((o): o is GraphObj => o.type === 'graph')

describe('picture bindings', () => {
  beforeEach(() => scene().newScene())

  it('writes the drawn numbers into the formula, bracketing a negative one and keeping x', () => {
    expect(bindValues('a*x^2 + b', { a: 2, b: -3, x: 99 })).toBe('2 * x ^ 2 + (-3)')
    expect(bindValues('x^k', { k: -2 })).toBe('x ^ (-2)')
  })

  it('says what it drew as a student writes it, and the graph\'s equation reads back the same curve', () => {
    expect(plainFormula('3 * x ^ 2')).toBe('3x²')
    expect(plainFormula('2 * x ^ 2 + (-3)')).toBe('2x² + (−3)')
    expect(plainFormula('x ^ 4 - 2 * x')).toBe('x^4 − 2x')
    expect(plainFormula('x ^ (-1) + sin(x) / x')).toBe('x⁻¹ + sin(x) / x')
    expect(plainFormula('x * sqrt(x)')).toBe('x × sqrt(x)')
    const q = train({ variables: [...train().variables, { name: 'a', def: { kind: 'list', items: [3] } }], picture: { kind: 'curve', expr: 'a*x^2 - 2x' } })
    const { note } = showPicture(picturePlan(q.picture!, playQuestion(q, 1, SETTINGS), SETTINGS), SETTINGS)
    expect(note).toBe('Drawn: y = 3x² − 2x.')
    expect(note).not.toMatch(/\*|\s\^\s/)
    const curve = graphs().find((g) => g.kind === 'explicit')!
    expect(curve.source).toBe('y = 3x² − 2x')
    // What the student reads is the same curve the graph draws.
    const shown = 'y = 3x² − 2x'.slice(4)
    for (const x of [-2, 0.5, 3]) expect(math.evaluate(preprocess(shown), { x })).toBeCloseTo(3 * x * x - 2 * x, 12)
  })

  it('shades the region between two curves with the area the calculator integrates', () => {
    const q = train({ variables: [...train().variables, { name: 'k', def: { kind: 'list', items: [3] } }], picture: { kind: 'between', upper: 'x^2', lower: '0', from: '0', to: 'k', label: 'Area under y = x² to {k}' } })
    const played = playQuestion(q, 1, SETTINGS)
    const plan = picturePlan(q.picture!, played, SETTINGS)
    expect(plan).toEqual({ kind: 'between', upper: 'x ^ 2', lower: '0', from: 0, to: 3, label: 'Area under y = x² to 3' })
    const { note, value } = showPicture(plan, SETTINGS)
    const engine = integrate((x) => x * x, 0, 3)
    expect(engine).toBeCloseTo(9, 9)
    // The area the drawing shades is the calculator's own integral, not only its 2 dp wording.
    expect(value).toBeCloseTo(engine, 6)
    expect(note).toBe('The shaded region between x = 0 and x = 3 has area 9.')
    const region = graphs().find((g) => g.kind === 'between')!
    expect(region.label).toBe('Area under y = x² to 3')
    expect(region.tMin).toBe(0)
    expect(region.tMax).toBe(3)
  })

  it('draws a piecewise picture as one piecewise graph and a tangent with its slope', () => {
    const q = train({
      variables: [...train().variables, { name: 'c', def: { kind: 'list', items: [2] } }],
      picture: { kind: 'piecewise', pieces: [{ expr: 'x^2', from: '-c', to: '0' }, { expr: 'c*x', from: '0', to: 'c' }] }
    })
    const played = playQuestion(q, 1, SETTINGS)
    showPicture(picturePlan(q.picture!, played, SETTINGS), SETTINGS)
    const pw = graphs().filter((g) => g.kind === 'piecewise')
    expect(pw).toHaveLength(1)
    expect(pw[0].pieces).toEqual([{ expr: 'x ^ 2', from: -2, to: 0 }, { expr: '2 * x', from: 0, to: 2 }])

    const tq = train({ variables: [...train().variables, { name: 'a', def: { kind: 'list', items: [1] } }], picture: { kind: 'tangent', expr: 'x^3', at: 'a' } })
    const { note } = showPicture(picturePlan(tq.picture!, playQuestion(tq, 1, SETTINGS), SETTINGS), SETTINGS)
    expect(note).toBe('The tangent at x = 1 has slope 3.')
  })
})

// ---------------------------------------------------------------------------
// Motion into the scene and Lab Data
// ---------------------------------------------------------------------------

describe('motion binding', () => {
  beforeEach(() => scene().newScene())

  const motion: PQMotion = {
    segments: [
      { kind: 'uniform', duration: '5', v: 'v' },
      { kind: 'accelerate', duration: 't', a: '-v / t' }
    ],
    plots: ['x-t', 'v-t'],
    sampleEvery: '1'
  }

  it('draws x–t and v–t as piecewise curves and adds a table without touching the student\'s own', () => {
    const q = train({ motion })
    const played = playQuestion(q, 2, SETTINGS)
    const mine = { id: 'mine', title: 'My readings', columns: [], rows: [], plot: { x: '', y: '', fit: 'linear' as const } }
    useLab.getState().setTables([mine])
    const shown = showMotion(motion, played, SETTINGS)
    const pw = graphs().filter((g) => g.kind === 'piecewise')
    expect(pw).toHaveLength(2)
    const tables = useLab.getState().tables
    expect(tables[0].id).toBe('mine')
    expect(tables).toHaveLength(2)
    expect(tables[1].rows.length).toBe(shown.rows)
    expect(shown.note).toContain('readings are in a new Lab Data table')
    // The braking distance on the table is the part's answer.
    const { v, t } = played.variant.values
    const last = tables[1].rows[tables[1].rows.length - 1]
    expect(last[1]).toBeCloseTo(v * 5 + (v * t) / 2, 2)

    // A second Show it replaces the curves rather than stacking a second pair, and shows the
    // table it already made instead of appending an identical one.
    const again = showMotion(motion, played, SETTINGS)
    expect(graphs().filter((g) => g.kind === 'piecewise')).toHaveLength(2)
    expect(useLab.getState().tables).toHaveLength(2)
    expect(useLab.getState().currentId).toBe(tables[1].id)
    expect(again.rows).toBe(0)
    expect(again.note).toContain(`already in Lab Data, in "${tables[1].title}"`)
    // Once the student has deleted it, the next press makes it again.
    useLab.getState().removeTable(tables[1].id)
    expect(showMotion(motion, played, SETTINGS).rows).toBe(shown.rows)
    expect(useLab.getState().tables).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------

describe('sandbox binding', () => {
  const pushed = train({
    variables: [...train().variables, { name: 'F', def: { kind: 'list', items: [30] }, unit: 'N' }],
    sandbox: { preset: 'friction', actuators: [{ body: 'Crate', force: ['F', '0', '0'], until: '2' }] }
  })

  it('loads the experiment by id and pushes the body it names, resolved after the fresh ids are made', () => {
    const played = playQuestion(pushed, 1, SETTINGS)
    const plan = sandboxPlan(pushed.sandbox!, played)
    expect(plan.pushes[0].force(0.5)).toEqual([30, 0, 0])
    expect(plan.pushes[0].until).toBe(2)
    const note = showSandbox(plan)
    expect(note).toBe('Loaded the experiment with a push on Crate. Press Play and watch the readings.')
    const { bodies, actuators, selection } = useSandbox.getState()
    const crate = bodies.find((b) => b.name === 'Crate')!
    expect(actuators).toHaveLength(1)
    expect(actuators[0].bodyId).toBe(crate.id)
    expect(actuators[0].force(1)).toEqual([30, 0, 0])
    expect(selection).toBe(crate.id)
    // Loading it again makes new ids; the push follows the new crate, not the old id.
    showSandbox(plan)
    const again = useSandbox.getState()
    expect(again.actuators[0].bodyId).toBe(again.bodies.find((b) => b.name === 'Crate')!.id)
  })

  it('says in words when the experiment or the body does not exist', () => {
    const played = playQuestion(pushed, 1, SETTINGS)
    expect(() => showSandbox({ ...sandboxPlan(pushed.sandbox!, played), preset: 'nothing' })).toThrow("This question's experiment, 'nothing', is not in this PhysLab.")
    const noBody = { ...pushed.sandbox!, actuators: [{ body: 'Truck', force: ['1', '0', '0'] as [string, string, string] }] }
    expect(() => showSandbox(sandboxPlan(noBody, played))).toThrow('The experiment has no body called Truck, so PhysLab cannot push it.')
  })

  it('a push that has no value at some moment pushes with nothing then, never NaN', () => {
    const played = playQuestion(pushed, 1, SETTINGS)
    const plan = sandboxPlan({ preset: 'friction', actuators: [{ body: 'Crate', force: ['F / (t - 1)', '0', '0'] }] }, played)
    expect(plan.pushes[0].force(1)).toEqual([0, 0, 0])
    expect(plan.pushes[0].force(2)).toEqual([30, 0, 0])
  })
})

/** A piece's formula at time t, the way the graph evaluates it (x stands for t on the drawing). */
const at = (expr: string, t: number): number => Number(math.evaluate(expr, { x: t }))

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

describe('motion pieces', () => {
  // A train that waits, pulls away, cruises and brakes: every kind of stretch, one after another.
  const train: PQMotion = {
    x0: 'x0',
    segments: [
      { kind: 'rest', duration: '2' },
      { kind: 'accelerate', duration: 't1', a: 'a1' },
      { kind: 'uniform', duration: '5', v: 'a1 * t1' },
      { kind: 'accelerate', duration: 'tb', a: '-a1 * t1 / tb' }
    ],
    plots: ['x-t', 'v-t'],
    sampleEvery: '0.5'
  }
  const values = { x0: -3, t1: 4, a1: 1.5, tb: 3 }

  it('is continuous in position at every join, and in speed where nothing jumps', () => {
    const m = motionPieces(train, values)
    expect(m.problems).toEqual([])
    expect(m.x).toHaveLength(4)
    expect(m.total).toBe(2 + 4 + 5 + 3)
    for (let i = 1; i < m.x.length; i++) {
      const join = m.x[i].from
      expect(m.x[i - 1].to).toBe(join)
      expect(at(m.x[i].expr, join)).toBeCloseTo(at(m.x[i - 1].expr, join), 9)
      expect(at(m.v[i].expr, join)).toBeCloseTo(at(m.v[i - 1].expr, join), 9)
    }
    // It starts where the author said, and the brakes bring it to rest.
    expect(at(m.x[0].expr, 0)).toBe(-3)
    expect(at(m.v[3].expr, m.total)).toBeCloseTo(0, 12)
    // x = x0 + ½·a·t1² + v·5 + ½·v·tb, the areas under the v–t graph.
    const v = 1.5 * 4
    expect(at(m.x[3].expr, m.total)).toBeCloseTo(-3 + 0.5 * 1.5 * 16 + v * 5 + 0.5 * v * 3, 9)
    expect(m.a.map((p) => at(p.expr, p.from))).toEqual([0, 1.5, 0, -2])
  })

  it('agrees with motionAt, which the Lab Data table reads', () => {
    const m = motionPieces(train, values)
    for (let t = 0; t <= m.total; t += 0.37) {
      const piece = m.x.find((p) => t >= p.from && t < p.to) ?? m.x[m.x.length - 1]
      expect(motionAt(m.stretches, t).x).toBeCloseTo(at(piece.expr, t), 9)
    }
  })

  it('fills a t, x, v table every half second, ending exactly where the motion ends', () => {
    const m = motionPieces(train, values)
    const table = motionTable(m, 0.5, 'Train')
    expect(table.columns.map((c) => `${c.name} ${c.unit}`)).toEqual(['t s', 'x m', 'v m/s'])
    expect(table.rows).toHaveLength(14 / 0.5 + 1)
    expect(table.rows[0]).toEqual([0, -3, 0])
    const last = table.rows[table.rows.length - 1]
    expect(last[0]).toBe(14)
    expect(last[2]).toBeCloseTo(0, 9)
    // A step that does not divide the time still gets a last row at the end.
    const odd = motionTable(m, 3, 'Train')
    expect(odd.rows.map((r) => r[0])).toEqual([0, 3, 6, 9, 12, 14])
  })

  it('says in words when a stretch lasts no time, and leaves it out', () => {
    const m = motionPieces({ segments: [{ kind: 'uniform', duration: 'd', v: '2' }, { kind: 'rest', duration: '1' }], plots: ['x-t'] }, { d: 0 })
    expect(m.problems).toEqual(['Stretch 1 of the motion lasts 0 s; each stretch must last some time.'])
    expect(m.x).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// The bank: the bundled sample set and a teacher's file
// ---------------------------------------------------------------------------

/** The answer a student who got it right would give: a number with its unit typed after it, a formula, the right options, or a matrix's own entries. */
function rightAnswer(p: PlayedPart, played: Played): string | number[] | string[][] {
  if (p.part.type === 'choice') return p.choices!.flatMap((c, i) => (c.correct ? [i] : []))
  if (p.part.type === 'expression') return bindValues(p.part.answer, played.variant.values, p.part.symbols)
  // QN2's bundled Numbas matrix questions (Matrix addition and the like) are the first bundled
  // content to use this kind: each entry typed back as the plain decimal `checkMatrixPart` reads.
  if (p.part.type === 'matrix') return p.part.answer.map((row) => row.map((e) => String(evaluateInVariables(e, played.variant.values))))
  if (p.part.type !== 'number') throw new Error(`the sample set has no ${p.part.type} part`)
  return p.part.unit === 'none' ? String(p.field!.value) : `${p.field!.value} ${UNITS[p.part.unit].label}`
}

const renders = (tex: string, where: string): void => {
  expect(() => katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: 'ignore' }), `${where}: ${tex}`).not.toThrow()
}

describe('the bundled sample set', () => {
  const bank = loadBundled()
  const byId = (id: string) => bank.questions.find((q) => q.id === id)!
  // The bundle now also carries other tracks' own bank files (physics-mechanics.pqjson among
  // them), each tested in its own file; this describe block is about sample.pqjson specifically,
  // so its two exact-count checks read only the questions whose id it gave them.
  const samples = { ...bank, questions: bank.questions.filter((q) => q.id.startsWith('physlab-sample-')) }

  it('holds the braking train and one question for every binding, all CC BY 4.0 from PhysLab', () => {
    expect(samples.questions).toHaveLength(6)
    expect(samples.questions[0].title).toBe('A braking train')
    for (const q of samples.questions) expect(q.license).toMatchObject({ id: 'CC BY 4.0', holder: 'PhysLab' })
    const kinds = samples.questions.flatMap((q) => q.parts.map((p) => p.type))
    expect(kinds).toContain('expression')
    expect(samples.questions.some((q) => q.parts.some((p) => p.type === 'choice' && p.distractors))).toBe(true)
    expect(samples.questions.some((q) => q.parts.some((p) => p.type === 'number' && p.unit !== 'none'))).toBe(true)
    expect(samples.questions.filter((q) => q.picture?.kind === 'between')).toHaveLength(1)
    expect(samples.questions.filter((q) => q.motion?.sampleEvery)).toHaveLength(1)
    expect(samples.questions.filter((q) => q.sandbox?.actuators.length)).toHaveLength(1)
  })

  it('offers every question together first, then one set per tag two or more questions share', () => {
    const sets = bundledSets(samples)
    expect(sets[0].questions).toHaveLength(6)
    expect(sets.map((s) => s.title)).toEqual(['Every sample question', 'Forces', 'Graphs', 'Motion'])
    const motion = sets.find((s) => s.title === 'Motion')!
    expect(motion.questions.map((q) => q.id)).toContain('physlab-sample-braking-train')
  })

  // The bundle now also carries other tracks' own bank files, so this loop covers more
  // questions than when it was written; a generous timeout keeps it from flaking under load.
  it('plays every question on many seeds with no problem, every right answer marked right and every step through KaTeX', () => {
    for (const q of bank.questions) {
      for (let seed = 1; seed <= 25; seed++) {
        for (const level of ['worked', 'half', 'solo'] as const) {
          const played = playQuestion(q, seed, SETTINGS, level)
          expect(played.problems, `${q.id} seed ${seed}`).toEqual([])
          for (const m of played.working.moves) {
            if (m.tex) renders(m.tex, `${q.id} ${seed}`)
            if (m.rule) renders(m.rule, `${q.id} ${seed} rule`)
          }
          for (const line of [...played.statement, ...played.parts.flatMap((p) => p.promptLines)]) {
            for (const seg of line) if ('tex' in seg) renders(seg.tex, `${q.id} statement`)
          }
          for (const a of played.working.answers) renders(a.tex, `${q.id} answer`)
          for (const p of played.parts.filter((x) => x.choices)) {
            expect(p.choices!.length).toBeGreaterThanOrEqual(3)
            expect(new Set(p.choices!.map((c) => c.text)).size).toBe(p.choices!.length)
          }
          // Every right answer is marked right the way the panel marks it: through checkPlayedPart.
          for (const p of played.parts) {
            expect(isCorrect(checkPlayedPart(p, rightAnswer(p, played), played, SETTINGS)), `${q.id} ${seed} ${p.prompt}`).toBe(true)
          }
          // No "{" chip survives into what the student reads.
          expect(played.statement.map(spokenOf).join(' ')).not.toMatch(/\{[A-Za-z]/)
        }
      }
    }
  }, 30000)

  it('never puts a variable where LaTeX wants a symbol: \\bar{v} with v drawn would print \\bar{20 m/s}', () => {
    for (const q of bank.questions) {
      const names = q.variables.map((v) => v.name).join('|')
      const trap = new RegExp(`\\\\[A-Za-z]+\\{(${names})\\}`)
      for (const s of q.steps?.items ?? []) {
        expect(s.tex ?? '', `${q.id}: ${s.tex}`).not.toMatch(trap)
        expect(s.rule ?? '', `${q.id}: ${s.rule}`).not.toMatch(trap)
      }
    }
  })

  it('draws its between-curves picture with the area the number part asks for', () => {
    scene().newScene()
    const q = byId('physlab-sample-area-between')
    const played = playQuestion(q, 4, SETTINGS)
    const { note } = showPicture(picturePlan(q.picture!, played, SETTINGS), SETTINGS)
    const k = played.variant.values.k
    expect(note).toContain(`has area ${Number((k ** 3 / 6).toFixed(2))}`)
    expect(graphs().find((g) => g.kind === 'between')!.label).toBe(`between y = ${k}x and y = x²`)
  })

  it('ends its motion at the distance its number part asks for', () => {
    scene().newScene()
    const q = byId('physlab-sample-cyclist-journey')
    const played = playQuestion(q, 9, SETTINGS)
    const shown = showMotion(q.motion!, played, SETTINGS)
    const distance = played.problem.fields[1].value
    expect(motionAt(shown.pieces.stretches, shown.pieces.total).x).toBeCloseTo(distance, 9)
    expect(motionAt(shown.pieces.stretches, shown.pieces.total).v).toBeCloseTo(0, 9)
  })

  it('loads its experiment and pushes the crate with the drawn force until 2 s', () => {
    const q = byId('physlab-sample-pushed-crate')
    const played = playQuestion(q, 2, SETTINGS)
    const note = showSandbox(sandboxPlan(q.sandbox!, played))
    // Its readings reach Lab Data through the question's own button, and the note says which.
    expect(note).toBe(
      'Loaded the experiment with a push on Crate. Press Play and watch Crate on the Recording chart; when it has run, Send the readings to Lab Data here puts them in a table.'
    )
    const { actuators, bodies } = useSandbox.getState()
    const crate = bodies.find((b) => b.name === 'Crate')!
    // The question's m and μ are the preset's own, or the answer would not match the run.
    expect(crate.mass).toBe(played.variant.values.m)
    expect(crate.friction).toBe(played.variant.values.mu)
    expect(actuators[0]).toMatchObject({ bodyId: crate.id, from: 0, until: 2 })
    expect(actuators[0].force(1)[0]).toBe(played.variant.values.F)
    // The Sandbox panel says what is pushing the crate, and the student can take it off.
    expect(actuators[0].label).toBe(`Push from the question: ${played.variant.values.F} N on Crate, 0–2 s`)
    const panel = readSource('src/renderer/src/panels/Sandbox.tsx')
    expect(panel).toMatch(/<Pushes \/>/)
    expect(panel).toMatch(/onClick=\{\(\) => removeActuator\(i\)\}/)
    expect(readSource('src/renderer/src/render/SandboxView.tsx')).toMatch(/\{ready && <PushArrows sim=\{sim\} \/>\}/)
    useSandbox.getState().removeActuator(0)
    expect(useSandbox.getState().actuators).toEqual([])
    useSandbox.getState().undo()
    expect(useSandbox.getState().actuators[0].label).toBe(actuators[0].label)
  })

  it('describes a push that changes with time, and one that never stops, in words', () => {
    const grows = { body: 'Rocket', force: (t: number): [number, number, number] => [0, 4 * t, 0], from: 1, until: Infinity }
    expect(describePush(grows)).toBe('Push from the question: a force that changes with time on Rocket, from 1 s on')
    const steady = { body: 'Cart', force: (): [number, number, number] => [3, 4, 0], from: 0.5, until: 1.25 }
    expect(describePush(steady)).toBe('Push from the question: 5 N on Cart, 0.5–1.25 s')
  })

  it('lands the recorded crate\'s run in Lab Data as one new table, keeping the student\'s own', () => {
    const q = byId('physlab-sample-pushed-crate')
    const played = playQuestion(q, 2, SETTINGS)
    const mine = { id: 'mine', title: 'My readings', columns: [{ id: 'c0', name: 'x', unit: 'm' }], rows: [[1]], plot: { x: 'c0', y: 'c0', fit: 'linear' as const } }
    useLab.getState().setTables([mine])
    showSandbox(sandboxPlan(q.sandbox!, played))
    // Nothing has run yet: a sentence, not an empty table.
    expect(() => sendSandboxReadings(q.sandbox!, played)).toThrow('There are no readings of Crate yet. Press Play in the Sandbox, let it run, then send them.')
    const crate = useSandbox.getState().bodies.find((b) => b.name === 'Crate')!
    for (let k = 0; k <= 20; k++) {
      const t = k / 10
      useSandbox.getState().record({ [crate.id]: { t, x: t * t, y: 0, v: 2 * t, ke: 0, pe: 0, p: 0 } })
    }
    const sent = sendSandboxReadings(q.sandbox!, played)
    expect(sent.rows).toBe(21)
    const tables = useLab.getState().tables
    expect(tables).toHaveLength(2)
    expect(tables[0]).toEqual(mine)
    expect(tables[1].title).toBe(`Crate — ${played.problem.title}`)
    expect(tables[1].rows[20][0]).toBe(2)
    expect(useLab.getState().currentId).toBe(tables[1].id)
    // The same run sent twice is the same table, shown again, not copied.
    expect(sendSandboxReadings(q.sandbox!, played).note).toBe(`These readings are already in Lab Data, in "${tables[1].title}".`)
    expect(useLab.getState().tables).toHaveLength(2)
  })

  it('checks every body name before replacing the student\'s scene, and pauses the run first', () => {
    const q = byId('physlab-sample-pushed-crate')
    const played = playQuestion(q, 2, SETTINGS)
    useSandbox.getState().loadPreset('friction')
    const before = useSandbox.getState().bodies
    const misspelt = { ...q.sandbox!, actuators: [{ ...q.sandbox!.actuators[0], body: 'Crat' }] }
    expect(() => showSandbox(sandboxPlan(misspelt, played))).toThrow('The experiment has no body called Crat, so PhysLab cannot push it.')
    expect(() => showSandbox(sandboxPlan({ ...q.sandbox!, record: 'Box' }, played))).toThrow('The experiment has no body called Box, so PhysLab cannot record it.')
    // The scene the student had is untouched: the same bodies, not a fresh copy of the preset.
    expect(useSandbox.getState().bodies).toBe(before)
    scene().setPlaying(true)
    showSandbox(sandboxPlan(q.sandbox!, played))
    expect(scene().playing).toBe(false)
  })

  it('keeps the area off the picture until the question is answered, then writes it', () => {
    scene().newScene()
    const q = byId('physlab-sample-area-between')
    const played = playQuestion(q, 4, SETTINGS)
    const k = played.variant.values.k
    const area = String(Number((k ** 3 / 6).toFixed(2)))
    const texts = () => Object.values(scene().objects).filter((o) => o.type === 'text').map((o) => (o.type === 'text' ? o.text : ''))
    const hidden = showPicture(picturePlan(q.picture!, played, SETTINGS), SETTINGS, true)
    expect(hidden.value).toBeUndefined()
    expect(hidden.note).not.toContain(area)
    expect(hidden.note).toContain('the one whose area you are finding')
    expect(texts().some((t) => t.startsWith('area ='))).toBe(false)
    expect(graphs().filter((g) => g.kind === 'between')).toHaveLength(1)
    // Answered: the same button writes the number on the drawing and in the note.
    const shown = showPicture(picturePlan(q.picture!, played, SETTINGS), SETTINGS)
    expect(shown.note).toContain(`has area ${area}`)
    expect(texts()).toContain(`area = ${area}`)
    expect(graphs().filter((g) => g.kind === 'between')).toHaveLength(1)
  })

  it("replaces the last question's picture with the next one's and frames the camera on it", () => {
    scene().newScene()
    vi.useFakeTimers()
    try {
      const area = byId('physlab-sample-area-between')
      showPicture(picturePlan(area.picture!, playQuestion(area, 4, SETTINGS), SETTINGS), SETTINGS)
      vi.runAllTimers()
      const k = playQuestion(area, 4, SETTINGS).variant.values.k
      // The region runs to y = k², far above the default view: the camera is sent to it.
      const regionBox = useCameraCommand.getState().box!
      expect(regionBox.max[0]).toBeCloseTo(k, 6)
      expect(regionBox.max[1]).toBeCloseTo(k * k, 6)

      const cyclist = byId('physlab-sample-cyclist-journey')
      const played = playQuestion(cyclist, 9, SETTINGS)
      const shown = showMotion(cyclist.motion!, played, SETTINGS)
      vi.runAllTimers()
      // Question 4's region and its label are gone from under question 5's motion.
      expect(graphs().some((g) => g.kind === 'between' || g.kind === 'explicit')).toBe(false)
      expect(Object.values(scene().objects).some((o) => o.type === 'text')).toBe(false)
      const box = useCameraCommand.getState().box!
      expect(box.max[0]).toBeCloseTo(shown.pieces.total, 6)
      expect(box.max[1]).toBeGreaterThanOrEqual(played.problem.fields[1].value - 1e-6)
      // Fit everything in view reads the same box off the x–t graph, which it used to skip.
      const xt = graphs().find((g) => g.name === 'xt')!
      expect(graphBox(xt)!.max[1]).toBeCloseTo(played.problem.fields[1].value, 6)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('a teacher\'s file', () => {
  it('opens a .pqjson as a set named after the file', () => {
    const text = serializePQFile({ app: 'PhysLab', format: 'pqjson', version: 1, questions: [train()] })
    const set = loadTeacherFile(text, 'C:\\Class 11\\braking.pqjson')
    expect(set).toMatchObject({ id: 'teacher:braking.pqjson', title: 'braking', source: 'teacher', report: [] })
    expect(set.questions[0].title).toBe('A braking train')
  })

  it('opens a Numbas .exam through the Numbas reader', () => {
    const exam = toExam({ app: 'PhysLab', format: 'pqjson', version: 1, questions: [train({ parts: [train().parts[0]], steps: undefined })] })
    const set = loadTeacherFile(exam, 'braking.exam')
    expect(set.title).toBe('braking')
    expect(set.questions).toHaveLength(1)
    const played = playQuestion(set.questions[0], 1, SETTINGS)
    const f = played.problem.fields[0]
    expect(checkAnswer(String(f.value), f, SETTINGS).verdict).toBe('right')
  })

  it('refuses a file that is not a question file in one plain sentence', () => {
    expect(() => loadTeacherFile('{"hello": 1}', 'notes.pqjson')).toThrow('This is not a PhysLab question file.')
    expect(() => loadTeacherFile('{"app":"PhysLab","format":"pqjson","version":1,"questions":[]}', 'empty.pqjson')).toThrow('empty.pqjson has no questions in it.')
  })

  // A Numbas question as the editor exports it: inline maths in the statement and the prompt, and
  // two display equations. fromExam keeps inline maths as \(…\) and each display line as $$…$$.
  const cart = {
    name: 'Rolling cart',
    statement:
      '<p>A cart rolls at {u} m/s, so \\(v = \\var{u}\\) at the start.</p><p>\\[s = \\var{u}\\,t\\]</p><p>\\[t = \\frac{s}{\\var{u}}\\]</p>',
    advice: '',
    rulesets: {},
    extensions: [],
    variables: { u: { name: 'u', group: 'Ungrouped variables', definition: 'random(2..6)', description: '', templateType: 'anything', can_override: false } },
    ungrouped_variables: ['u'],
    variable_groups: [],
    functions: {},
    preamble: { js: '', css: '' },
    parts: [{ type: 'numberentry', marks: 1, prompt: '<p>How far does it go in \\(t = 2\\) s?</p>', minValue: '2*u - 0.1', maxValue: '2*u + 0.1', precisionType: 'none' }],
    tags: [],
    metadata: { description: '', licence: 'Creative Commons Attribution 4.0 International' },
    contributors: [{ name: 'Ada Lovelace', profile_url: '' }],
    type: 'question'
  }
  const cartExam = `// Numbas version: finer_feedback_settings\n${JSON.stringify({
    name: 'Carts',
    metadata: { description: '', licence: '' },
    duration: 0,
    percentPass: 0,
    question_groups: [{ name: 'Group', pickingStrategy: 'all-ordered', questions: [cart] }],
    contributors: [],
    extensions: [],
    custom_part_types: [],
    resources: []
  })}`

  it('sets a Numbas file\'s inline maths through KaTeX and keeps every display line, in order', () => {
    expect(fromExam(cartExam).report).toEqual([])
    const set = loadTeacherFile(cartExam, 'carts.exam')
    const played = playQuestion(set.questions[0], 3, SETTINGS)
    const u = played.variant.values.u
    // Nothing a student reads as words holds LaTeX.
    const plain = [...played.statement.map(spokenOf), ...played.parts.map((p) => p.prompt), played.problem.prompt, ...played.problem.fields.map((f) => f.label)]
    for (const line of plain) expect(line, line).not.toMatch(/\\[([a-z]|\$\$/)
    // The inline maths is a KaTeX span with the number in, beside the words.
    const first = played.statement[0]
    expect(first.some((s) => 'text' in s && s.text.includes(`${u} m/s`))).toBe(true)
    expect(first.find((s) => 'tex' in s)).toEqual({ tex: `v = ${u}`, display: false })
    expect(played.parts[0].promptLines[0].some((s) => 'tex' in s && s.tex === 't = 2')).toBe(true)
    // Both display equations, in the order written, each through KaTeX.
    const displays = played.statement.filter((l) => l.length === 1 && 'tex' in l[0] && l[0].display).map((l) => ('tex' in l[0] ? l[0].tex : ''))
    expect(displays).toHaveLength(2)
    expect(displays[0]).toContain(`s = ${u}`)
    expect(displays[1]).toContain('\\frac{s}')
    for (const line of played.statement) for (const s of line) if ('tex' in s) renders(s.tex, 'cart')
    // And the part is still marked.
    expect(isCorrect(checkPlayedPart(played.parts[0], String(2 * u), played, SETTINGS))).toBe(true)
  })

  it('marks an answer when one of a teacher\'s traps cannot be worked out, and says so instead of throwing', () => {
    const q = train({ parts: [{ ...(train().parts[0] as Extract<PQQuestion['parts'][number], { type: 'number' }>), traps: [{ value: 'zz * 2', why: 'Doubled.' }, { value: 'v * t', why: 'That is {v} × {t}.' }] }] })
    const played = playQuestion(q, 4, SETTINGS)
    const { v, t } = played.variant.values
    expect(played.problems).toContain('PhysLab could not work out one of the mistakes "How far does it go while braking?" watches for, so it will not name that one.')
    const p = played.parts[0]
    expect(checkPlayedPart(p, String((v * t) / 2), played, SETTINGS).verdict).toBe('right')
    // The trap that can be worked out still names the mistake, with the numbers in its reason.
    expect(checkPlayedPart(p, String(v * t), played, SETTINGS).message).toBe(`That is ${v} m/s × ${t} s.`)
  })

  it('says it cannot mark a part whose own answer cannot be worked out, rather than doing nothing', () => {
    const q = train({ parts: [{ ...(train().parts[0] as Extract<PQQuestion['parts'][number], { type: 'number' }>), answer: 'zz / 2', traps: [] }] })
    const played = playQuestion(q, 4, SETTINGS)
    expect(played.problems).toContain('PhysLab could not work out the answer to "How far does it go while braking?", so it cannot mark it.')
    expect(checkPlayedPart(played.parts[0], '12', played, SETTINGS)).toEqual({
      verdict: 'wrong',
      message: 'PhysLab could not work out the answer to this part, so it cannot mark it.'
    })
  })
})

describe('a letter before a bracket', () => {
  it('is a product for the part\'s own letters and the question\'s variables, and a function otherwise', () => {
    expect(lettersBeforeBrackets('x(x+1)', ['x'])).toBe('x * (x + 1)')
    expect(lettersBeforeBrackets('sin(x)', ['x'])).toBe('sin(x)')
    expect(lettersBeforeBrackets('x^2 + x', ['x'])).toBe('x^2 + x')
    expect(lettersBeforeBrackets('t(1 + t(2))', ['t'])).toBe('t * (1 + t * (2))')
  })

  it('marks the thrown ball\'s factorised height t(u − 4.9t) right on every seed', () => {
    const q = loadBundled().questions.find((x) => x.id === 'physlab-sample-thrown-ball')!
    for (let seed = 1; seed <= 25; seed++) {
      const played = playQuestion(q, seed, SETTINGS)
      const p = played.parts.find((x) => x.part.type === 'expression')!
      const u = played.variant.values.u
      expect(checkPlayedPart(p, `t(${u} - 4.9t)`, played, SETTINGS).verdict, `seed ${seed}`).toBe('right')
      expect(checkPlayedPart(p, `t(${u} - 9.8t)`, played, SETTINGS).verdict, `seed ${seed}`).toBe('wrong')
    }
  })

  it('reads "h = 17t − 4.9t²" as the formula after h =, and still refuses a letter the part does not use', () => {
    const q = loadBundled().questions.find((x) => x.id === 'physlab-sample-thrown-ball')!
    const played = playQuestion(q, 3, SETTINGS)
    const p = played.parts.find((x) => x.part.type === 'expression')!
    const u = played.variant.values.u
    expect(checkPlayedPart(p, `h = ${u}t - 4.9t^2`, played, SETTINGS).verdict).toBe('right')
    expect(checkPlayedPart(p, `h(t) = ${u}t - 4.9t^2`, played, SETTINGS).verdict).toBe('right')
    expect(checkPlayedPart(p, `h = ${u}t - 9.8t^2`, played, SETTINGS).verdict).toBe('wrong')
    expect(checkPlayedPart(p, `${u}t - 4.9t^2 + h`, played, SETTINGS).message).toBe('The answer should only use t.')
    expect(withoutNameEquals('t = 3t', ['t'])).toBe('t = 3t')
    expect(withoutNameEquals('h == 3t', ['t'])).toBe('h == 3t')
    expect(withoutNameEquals('h = ', ['t'])).toBe('h = ')
  })

  it('needs no rewrite from the player: the marker reads the product itself', () => {
    const q = loadBundled().questions.find((x) => x.id === 'physlab-sample-thrown-ball')!
    const played = playQuestion(q, 3, SETTINGS)
    const p = played.parts.find((x) => x.part.type === 'expression')!
    expect(readSource('src/renderer/src/questions/player.ts')).not.toMatch(/lettersBeforeBrackets/)
    expect(checkPlayedPart(p, `t(${played.variant.values.u} - 4.9t)`, played, SETTINGS).verdict).toBe('right')
  })
})

describe('the author\'s fading level', () => {
  it('is what a question plays at until the student has answered one', () => {
    const q = train({ steps: { ...train().steps!, level: 'half' } })
    expect(playQuestion(q, 1, SETTINGS).level).toBe('half')
    expect(playQuestion(q, 1, SETTINGS, 'solo').level).toBe('solo')
    // The panel hands over no level until the student has answered a question, then moves on
    // from the level the question was actually played at.
    const panel = readSource('src/renderer/src/panels/Practice.tsx')
    expect(panel).toMatch(/level: null,/)
    expect(panel).toMatch(/session\.questionLevel \?\? undefined/)
    expect(panel).toMatch(/nextLevel\(played\?\.level \?\? s\.level \?\? 'worked', streak\)/)
  })
})

describe('a number part\'s tolerance', () => {
  it('is the author\'s: 48.99 on 50 at 2 % is not right, though the rounding sentence stays', () => {
    const q = train({ parts: [{ type: 'number', prompt: 'How far?', answer: '50', unit: 'm', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }] })
    const played = playQuestion(q, 1, SETTINGS)
    const p = played.parts[0]
    expect(isCorrect(checkPlayedPart(p, '49', played, SETTINGS))).toBe(true)
    const c = checkPlayedPart(p, '48.99', played, SETTINGS)
    expect(isCorrect(c)).toBe(false)
    expect(c).toMatchObject({ verdict: 'wrong', message: 'Right method — just rounded a little early. Keep four digits until the last line.' })
    // A Numbas min/max range is not widened fourfold either.
    expect(isCorrect(checkPlayedPart(p, '47', played, SETTINGS))).toBe(false)
  })
})
