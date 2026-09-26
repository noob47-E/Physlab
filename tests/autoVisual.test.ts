// Fix 21: a picture for every practice question. The new picture kinds (a normal curve, arrows,
// dots, compared curves, a number line) go from a question file through the player's plan into
// real scene objects; autoVisual reads a question's numbers and words and infers a picture where
// the author gave none; and nothing inferred shows the answer before the student has earned it.
// Every test crosses a boundary — a file into a plan, a plan into the drawing, a question's
// words into the picture a student sees.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The stylesheet is not loaded here, so the drawing's colours fall back.
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { resetGlobals } from './helpers/globals'
import { fmtPrecise, type MeasureSettings } from '../src/renderer/src/math/format'
import { scene } from '../src/renderer/src/core/store'
import type { GraphObj, SceneObject, TextObj } from '../src/renderer/src/core/types'
import { POINT_PX } from '../src/renderer/src/render/viewMath'
import type { PQPicture, PQQuestion, UnitId } from '../src/renderer/src/questions/pqjson'
import { parsePQFile, questionFormat, serializePQFile } from '../src/renderer/src/questions/pqjson'
import { HELD_BACK, hasVisual, INFERRED_NOTE, MAX_DOTS, picturePlan, playQuestion, showPicture, showVisual, visualMode, visualPlanFor, visualState } from '../src/renderer/src/questions/player'
import { fromExam } from '../src/renderer/src/questions/numbas'
import { useLab } from '../src/renderer/src/lab/labStore'
import { inferVisual, solveSuvat, visualOf } from '../src/renderer/src/questions/autoVisual'
import { loadBundled } from '../src/renderer/src/questions/bank'
import { motionAt, motionPieces, motionTable } from '../src/renderer/src/questions/motion'
import { drawVariables, type Variant } from '../src/renderer/src/questions/variables'
import { evaluateInVariables } from '../src/renderer/src/questions/parts'
import { UNITS } from '../src/renderer/src/questions/units'

const fnAt = (expr: string, x: number): number => Number(evaluateInVariables(expr, { x }).toPrecision(12))

beforeEach(() => {
  resetGlobals()
  scene().newScene()
})

const SETTINGS: MeasureSettings = { decimals: 4, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }

/** A one-part question with whatever the test names; the licence and ids are filler. */
function question(over: Partial<PQQuestion> = {}): PQQuestion {
  return {
    id: 'q',
    title: 'A question',
    statement: 'Answer it.',
    variables: [],
    parts: [{ type: 'number', prompt: 'How much?', answer: '1', unit: 'none', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }],
    license: { id: 'CC BY 4.0', holder: 'PhysLab', source: 'PhysLab' },
    ...over
  }
}

const objects = (): SceneObject[] => scene().order.map((id) => scene().objects[id])
const graphs = (): GraphObj[] => objects().filter((o): o is GraphObj => o.type === 'graph')
const texts = (): string[] => objects().filter((o): o is TextObj => o.type === 'text').map((t) => t.text)

/** The picture with a question's numbers in, drawn, and what the note said. */
function draw(pic: PQPicture, q: PQQuestion, hide = false) {
  const played = playQuestion({ ...q, picture: pic }, 1, SETTINGS)
  return showPicture(picturePlan(pic, played, SETTINGS), SETTINGS, hide)
}

// ---------------------------------------------------------------------------
// The new picture kinds
// ---------------------------------------------------------------------------

describe('the new picture kinds', () => {
  const mu = question({
    variables: [
      { name: 'mu', def: { kind: 'list', items: [50] } },
      { name: 'sigma', def: { kind: 'list', items: [10] } },
      { name: 'x1', def: { kind: 'list', items: [65] } }
    ]
  })

  it('a normal picture shades P(X < 65) for N(50, 10²) on the z scale, with the area 0.9332 once shown', () => {
    const shown = draw({ kind: 'normal', mean: 'mu', sd: 'sigma', to: 'x1' }, mu)
    expect(shown.value).toBeCloseTo(0.93319, 4)
    expect(shown.note).toContain('mean 50 and standard deviation 10')
    expect(shown.note).toContain('below 65')
    expect(shown.note).toContain('0.9332')
    const region = graphs().find((g) => g.kind === 'between')!
    // z = (65 − 50) ÷ 10 = 1.5.
    expect(region.tMax).toBeCloseTo(1.5, 12)
    // The shading is drawn over the bell's own 4σ; the probability still counts the tail to 6σ.
    expect(region.tMin).toBe(-4)
    // The drawing's own labels are in the scene's precision, as every area label is.
    expect(texts()).toEqual(expect.arrayContaining(['mean 50', '65', 'probability = 0.93']))
  })

  it('a normal picture held back draws the shading but writes no area anywhere', () => {
    const shown = draw({ kind: 'normal', mean: 'mu', sd: 'sigma', to: 'x1' }, mu, true)
    expect(shown.value).toBeUndefined()
    expect(shown.note).not.toMatch(/0\.93/)
    expect(texts().some((t) => t.includes('probability'))).toBe(false)
    expect(graphs().some((g) => g.kind === 'between')).toBe(true)
  })

  it('P(40 < X < 60) is 0.6827 and P(X > 65) is 0.0668', () => {
    const q = question({ variables: [{ name: 'a', def: { kind: 'list', items: [40] } }, { name: 'b', def: { kind: 'list', items: [60] } }] })
    expect(draw({ kind: 'normal', mean: '50', sd: '10', from: 'a', to: 'b' }, q).value).toBeCloseTo(0.68269, 4)
    expect(draw({ kind: 'normal', mean: '50', sd: '10', from: '65' }, q).value).toBeCloseTo(0.06681, 4)
  })

  it('a normal picture with no spread is refused in a sentence', () => {
    const played = playQuestion(mu, 1, SETTINGS)
    expect(() => picturePlan({ kind: 'normal', mean: '50', sd: '0' }, played, SETTINGS)).toThrow('standard deviation above 0')
  })

  it('arrows from a file: components worked out, the result in its role, drawn from one point', () => {
    const q = question({ variables: [{ name: 'F', def: { kind: 'list', items: [25] } }, { name: 'W', def: { kind: 'list', items: [49.05] } }] })
    const pic: PQPicture = { kind: 'vectors', items: [{ name: 'F', v: ['F', '0'] }, { name: 'mg', v: ['0', '-W'] }, { name: 'R', v: ['F', '-W'], role: 'result' }] }
    const plan = picturePlan(pic, playQuestion({ ...q, picture: pic }, 1, SETTINGS), SETTINGS)
    expect(plan).toEqual({
      kind: 'vectors',
      items: [
        { name: 'F', v: [25, 0, 0], tail: undefined, role: 'input' },
        { name: 'mg', v: [0, -49.05, 0], tail: undefined, role: 'input' },
        { name: 'R', v: [25, -49.05, 0], tail: undefined, role: 'result' }
      ]
    })
    const shown = showPicture(plan, SETTINGS)
    expect(shown.note).toBe('Drawn: the arrows F, mg and R.')
    const arrows = objects().filter((o) => o.type === 'vector')
    expect(arrows.map((a) => a.name)).toEqual(['F', 'mg', 'R'])
  })

  it('dots: exactly `count` points, in rows, with no labels that would count them', () => {
    const q = question({ variables: [{ name: 'n', def: { kind: 'list', items: [23] } }] })
    const shown = draw({ kind: 'dots', count: 'n', perRow: 5 }, q)
    const dots = objects().filter((o) => o.type === 'point')
    expect(dots).toHaveLength(23)
    expect(dots.every((d) => d.showLabel === false)).toBe(true)
    expect(shown.note).not.toContain('23')
    // Five to a row, each in the middle of a grid square: the 23rd dot is the third of the fifth row.
    const last = dots[22] as { def: { kind: string; p: number[] } }
    expect(last.def.p.slice(0, 2)).toEqual([2.5, 4.5])
  })

  it('dots refuse a count that is not a whole number, or too many to count', () => {
    const q = question({ variables: [{ name: 'n', def: { kind: 'list', items: [2.5] } }] })
    const played = playQuestion(q, 1, SETTINGS)
    expect(() => picturePlan({ kind: 'dots', count: 'n' }, played, SETTINGS)).toThrow('whole numbers')
    expect(() => picturePlan({ kind: 'dots', count: String(MAX_DOTS + 1) }, played, SETTINGS)).toThrow('too many to count')
  })

  it('compared curves keep their labels and their own stretches', () => {
    const q = question({ variables: [{ name: 'u', def: { kind: 'list', items: [20] } }] })
    const shown = draw({ kind: 'curves', items: [{ expr: 'u - 2*x', label: 'Train A', from: '0', to: 'u/2' }, { expr: 'u - 4*x', label: 'Train B', from: '0', to: 'u/4' }] }, q)
    const gs = graphs()
    expect(gs.map((g) => g.label)).toEqual(['Train A', 'Train B'])
    expect(gs.map((g) => g.exprs[0])).toEqual(['20 - 2 * x', '20 - 4 * x'])
    // Each drawn only over its own stretch (an explicit graph runs across the whole view).
    expect(gs.map((g) => g.pieces)).toEqual([[{ expr: '20 - 2 * x', from: 0, to: 10 }], [{ expr: '20 - 4 * x', from: 0, to: 5 }]])
    expect(texts()).toEqual(['Train A', 'Train B'])
    expect(shown.note).toBe('Drawn: Train A, Train B.')
  })

  it('a number line marks each quantity with its label, the line running from 0 past the largest', () => {
    const q = question({ variables: [{ name: 'v', def: { kind: 'list', items: [24] }, unit: 'm/s' }, { name: 't', def: { kind: 'list', items: [8] }, unit: 's' }] })
    const shown = draw({ kind: 'numberline', items: [{ label: 'v = {v}', value: 'v' }, { label: 't = {t}', value: 't' }] }, q)
    expect(texts()).toEqual(['t = 8 s', 'v = 24 m/s'])
    const marks = objects().filter((o) => o.type === 'point' && o.visible && o.name.startsWith('mark')) as unknown as { def: { p: number[] } }[]
    expect(marks.map((m) => m.def.p[0]).sort((a, b) => a - b)).toEqual([8, 24])
    expect(shown.note).toBe('Drawn on one number line: v = 24 m/s, t = 8 s.')
  })

  it('a number line holds back a signed answer that shares a given’s magnitude with the opposite sign', () => {
    // F = 5 N is given (positive, as the statement writes it); the answer is −5 N, the opposite
    // way. fresh() used to compare by size, so it treated −5 as the same value as the given +5
    // and let the number line show it straight away — the answer, before it was earned.
    const q = question({
      statement: 'A force of {F} N pulls one way; take that direction as positive.',
      variables: [{ name: 'F', def: { kind: 'list', items: [5] } }],
      parts: [{ type: 'number', prompt: 'What is the force pulling the other way, signed?', answer: '-5', unit: 'N', tolerance: { kind: 'absolute', value: 0.01 }, marks: 1 }],
      picture: { kind: 'numberline', items: [{ label: 'the other force', value: '-5' }] }
    })
    const played = playQuestion(q, 1, SETTINGS)
    const plan = visualPlanFor(played)
    expect(plan.source).toBe('authored')
    expect(visualState(plan, false)).toBe('after-answer')
    expect(() => showVisual(plan, played, SETTINGS, false)).toThrow(HELD_BACK)
    // Once earned, the same picture draws normally.
    expect(showVisual(plan, played, SETTINGS, true)).toContain('other force')
  })

  it('holds back a tiny signed answer too, where the value test alone is absolute', () => {
    // Below about 5×10⁻⁷ two values within 10⁻⁶ of each other count as the same, so a given of
    // +1×10⁻⁷ C used to hide a drawn −1×10⁻⁷ C as "already given". The sign is checked first now.
    const q = question({
      statement: 'A charge of {Q} C sits on one plate; take that plate as positive.',
      variables: [{ name: 'Q', def: { kind: 'list', items: [1e-7] } }],
      parts: [{ type: 'number', prompt: 'What is the charge on the other plate, signed?', answer: '-1e-7', unit: 'C', tolerance: { kind: 'absolute', value: 1e-9 }, marks: 1 }],
      picture: { kind: 'numberline', items: [{ label: 'the other plate', value: '-1e-7' }] }
    })
    const played = playQuestion(q, 1, SETTINGS)
    const plan = visualPlanFor(played)
    expect(visualState(plan, false)).toBe('after-answer')
    expect(() => showVisual(plan, played, SETTINGS, false)).toThrow(HELD_BACK)
  })

  it('a picture of a new kind makes the file format 2 and survives a save and a reopen', () => {
    const q = question({ picture: { kind: 'normal', mean: '50', sd: '10', to: '65' } })
    expect(questionFormat(q)).toBe(2)
    const back = parsePQFile(serializePQFile({ app: 'PhysLab', format: 'pqjson', version: 1, questions: [q] }))
    expect(back.version).toBe(2)
    expect(back.questions[0].picture).toEqual(q.picture)
  })
})

// ---------------------------------------------------------------------------
// The dots picture: no dot on a numbered axis or a grid crossing, and every dot bigger than an
// ordinary point (QD1's review findings — a dot at x = 0 or y = 0 sits on the axis's own tick
// label, so a learner reading that label counts the dots one short; a point-sized dot on a
// crossing looks like a grid intersection and sits over a tick number that can be read off).
// ---------------------------------------------------------------------------

describe('the dots picture stays off the axes and the grid crossings', () => {
  it('puts every dot in the middle of a grid square in the first quadrant: no dot on a whole-number x or y', () => {
    for (const [count, perRow] of [[1, 5], [2, 1], [4, 3], [5, 5], [8, 5], [9, 4], [23, 5], [40, 7]] as const) {
      const q = question({ variables: [{ name: 'n', def: { kind: 'list', items: [count] } }] })
      draw({ kind: 'dots', count: 'n', perRow }, q)
      const dots = objects().filter((o) => o.type === 'point') as unknown as { def: { p: number[] } }[]
      expect(dots).toHaveLength(count)
      for (const d of dots) {
        const [x, y] = d.def.p
        expect(x).toBeGreaterThan(0)
        expect(y).toBeGreaterThan(0)
        expect(Number.isInteger(x)).toBe(false)
        expect(Number.isInteger(y)).toBe(false)
        expect(x % 1).toBeCloseTo(0.5, 12)
        expect(y % 1).toBeCloseTo(0.5, 12)
      }
    }
  })

  it('draws every dot clearly larger than an ordinary point', () => {
    const q = question({ variables: [{ name: 'n', def: { kind: 'list', items: [8] } }] })
    draw({ kind: 'dots', count: 'n', perRow: 5 }, q)
    const dots = objects().filter((o) => o.type === 'point') as unknown as { size?: number }[]
    expect(dots).toHaveLength(8)
    for (const d of dots) expect(d.size ?? 0).toBeGreaterThanOrEqual(2 * POINT_PX.free)
  })
})

// ---------------------------------------------------------------------------
// Inference: motion
// ---------------------------------------------------------------------------

const sample = (id: string): PQQuestion => loadBundled().questions.find((q) => q.id === id)!
const variant = (values: Record<string, number>): Variant => ({ seed: 0, values, problems: [] })

describe('inferring a motion', () => {
  it('the braking train at v = 24, t = 8 is one accelerate segment from 24 to 0 over 8 s whose table ends at 96 m', () => {
    const auto = inferVisual(sample('physlab-sample-braking-train'), variant({ v: 24, t: 8 }))!
    expect(auto.rule).toBe('suvat')
    const m = auto.visual.motion!
    expect(m.v0).toBe('24')
    expect(m.segments).toEqual([{ kind: 'accelerate', duration: '8', a: '-3' }])
    expect(m.plots).toEqual(['v-t', 'x-t'])
    const pieces = motionPieces(m, {})
    expect(pieces.problems).toEqual([])
    expect(motionAt(pieces.stretches, 8).v).toBeCloseTo(0, 12)
    const table = motionTable(pieces, Number(m.sampleEvery), 'train')
    expect(table.rows[0]).toEqual([0, 0, 24])
    expect(table.rows[table.rows.length - 1]).toEqual([8, 96, 0])
    // The distance is the answer: the x–t curve ends on it and the table holds it, so before the
    // answer only the v–t line is drawn, and no readings.
    expect(auto.revealsAnswer).toBe(true)
    expect(auto.early).toEqual({ motion: { v0: '24', segments: m.segments, plots: ['v-t'] } })
  })

  it('reads the braking train at every drawn variant, always ending at the answer distance', () => {
    const q = sample('physlab-sample-braking-train')
    for (let seed = 1; seed <= 20; seed++) {
      const vr = drawVariables(q, seed)
      const auto = inferVisual(q, vr)!
      const pieces = motionPieces(auto.visual.motion!, {})
      expect(pieces.x[0].to).toBeCloseTo(vr.values.t, 9)
      expect(motionAt(pieces.stretches, vr.values.t).x).toBeCloseTo((vr.values.v * vr.values.t) / 2, 9)
    }
  })

  it('"from rest" is a start at 0; braking words make a given acceleration a deceleration; km/h is read in m/s', () => {
    const car = question({ statement: 'A car sets off from rest and speeds up evenly at 2 m/s² for 5 s.', parts: [{ type: 'number', prompt: 'How fast is it going?', answer: '10', unit: 'm/s', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }] })
    const k = inferVisual(car, variant({}))!
    expect(k.visual.motion).toMatchObject({ v0: '0', segments: [{ kind: 'accelerate', duration: '5', a: '2' }] })
    // The final speed is the answer: the v–t line ends on it, the x–t curve does not.
    expect(k.early?.motion?.plots).toEqual(['x-t'])
    const brake = question({ statement: 'A lorry moving at 72 km/h brakes at 4 m/s².', parts: [{ type: 'number', prompt: 'How far does it go before it stops?', answer: '50', unit: 'm', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }] })
    const b = inferVisual(brake, variant({}))!
    expect(b.visual.motion).toMatchObject({ v0: '20', segments: [{ kind: 'accelerate', duration: '5', a: '-4' }] })
  })

  it('a braking body given a time past its stop brakes to rest and then stands still, never reversing (the 50 m trap)', () => {
    // One 8 s stretch ran v from 20 to −12 m/s and x back from 50 m to 32 m, the trap answer.
    const q = question({ statement: 'A car moving at 20 m/s brakes at 4 m/s².', parts: [{ type: 'number', prompt: 'How far does it travel in 8 s?', answer: '50', unit: 'm', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }] })
    const auto = inferVisual(q, variant({}))!
    expect(auto.rule).toBe('suvat')
    const m = auto.visual.motion!
    expect(m.v0).toBe('20')
    expect(m.segments).toEqual([{ kind: 'accelerate', duration: '5', a: '-4' }, { kind: 'rest', duration: '3' }])
    const pieces = motionPieces(m, {})
    expect(pieces.problems).toEqual([])
    const table = motionTable(pieces, Number(m.sampleEvery), 'car')
    expect(table.rows[table.rows.length - 1]).toEqual([8, 50, 0])
    expect(Math.min(...table.rows.map((r) => Number(r[2])))).toBe(0)
    // The stop distance u² ÷ 2|a| = 50 m is the answer: only the v–t line (20 down to 0 at 5 s, then flat) comes first.
    expect(auto.revealsAnswer).toBe(true)
    expect(auto.early).toEqual({ motion: { v0: '20', segments: m.segments, plots: ['v-t'] } })
    expect(auto.why).toBe('PhysLab read this as steady braking until it stops, then standing still: from 20 m/s, slowing at 4 m/s², for 8 s.')
    // Asked when it stops (5 s), the v–t line holds that too, and nothing comes before the answer.
    const when = inferVisual(question({ statement: 'A car moving at 20 m/s brakes at 4 m/s². Watch it for 8 s.', parts: [{ type: 'number', prompt: 'When does it stop?', answer: '5', unit: 's', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }] }), variant({}))!
    expect(when.visual.motion!.segments).toEqual(m.segments)
    expect(when.early).toBeUndefined()
  })

  it('"slowly" or "slower" is not braking, and a body from rest is never turned round', () => {
    // Read as braking, this drew a car from rest running backwards to −25 m at −10 m/s.
    const slowly = inferVisual(question({ statement: 'A car starts from rest and moves slowly, accelerating at 2 m/s² for 5 s.' }), variant({}))!
    expect(slowly.visual.motion).toMatchObject({ v0: '0', segments: [{ kind: 'accelerate', duration: '5', a: '2' }] })
    expect(slowly.why).toBe('PhysLab read this as one stretch of steady acceleration: from rest, at 2 m/s², for 5 s.')
    const slower = inferVisual(question({ statement: 'A slower van moving at 10 m/s speeds up at 1 m/s² for 4 s.' }), variant({}))!
    expect(slower.visual.motion).toMatchObject({ v0: '10', segments: [{ kind: 'accelerate', duration: '4', a: '1' }] })
    // A verb of slowing still turns a given acceleration round: "slows down", "decelerates", "braking".
    for (const words of ['A van moving at 10 m/s slows down at 2 m/s² for 3 s.', 'A van moving at 10 m/s decelerates at 2 m/s² for 3 s.', 'A van moving at 10 m/s is braking at 2 m/s² for 3 s.']) {
      expect(inferVisual(question({ statement: words }), variant({}))!.visual.motion, words).toMatchObject({ v0: '10', segments: [{ kind: 'accelerate', duration: '3', a: '-2' }] })
    }
  })

  it('a throw up from a height falls past the hand to the ground: s = −20 m, t = 3.28 s, starting at x = 20 m', () => {
    const q = question({ statement: 'A ball is thrown upward at 10 m/s from a height of 20 m above the ground.', parts: [{ type: 'number', prompt: 'How long is it in the air?', answer: '(10 + sqrt(100 + 2 * 9.81 * 20)) / 9.81', unit: 's', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }] })
    const auto = inferVisual(q, variant({}))!
    expect(auto.rule).toBe('vertical')
    const m = auto.visual.motion!
    expect(m.x0).toBe('20')
    expect(m.v0).toBe('10')
    const seg = m.segments[0]
    expect(seg.kind).toBe('accelerate')
    // −20 = 10t − 4.905t² → t = (10 + √492.4) ÷ 9.81 = 3.28135 s.
    expect(Number(seg.duration)).toBeCloseTo(3.281355, 5)
    const pieces = motionPieces(m, {})
    expect(motionAt(pieces.stretches, Number(seg.duration)).x).toBeCloseTo(0, 9)
    // The time is the answer and both plots run for exactly that long.
    expect(auto.early).toBeUndefined()
    expect(auto.why).toContain('from 20 m above the ground')
  })

  it('a throw up from a height with a time past its landing ends on the ground, never below it (probe A2)', () => {
    // Run on for the 5 s given, x went from 20 m down to −52.5 m, 52.5 m under the ground.
    const q = question({ statement: 'A ball is thrown upward at 10 m/s from a height of 20 m above the ground. Take g = 9.8 m/s².', parts: [{ type: 'number', prompt: 'Where is it after 5 s?', answer: '0', unit: 'm', tolerance: { kind: 'absolute', value: 0.1 }, marks: 1 }] })
    const auto = inferVisual(q, variant({}))!
    const m = auto.visual.motion!
    expect(m).toMatchObject({ x0: '20', v0: '10' })
    // −20 = 10t − 4.9t² → t = (10 + √492) ÷ 9.8 = 3.28378 s.
    const landing = (10 + Math.sqrt(492)) / 9.8
    expect(Number(m.segments[0].duration)).toBeCloseTo(landing, 9)
    const pieces = motionPieces(m, {})
    expect(motionAt(pieces.stretches, landing).x).toBeCloseTo(0, 9)
    expect(Math.min(...motionTable(pieces, Number(m.sampleEvery), 'ball').rows.map((r) => Number(r[1])))).toBeGreaterThanOrEqual(-1e-9)
    expect(auto.why).toContain('drawn to the ground')
    // A time before the landing still ends at that time.
    const early = inferVisual(question({ statement: 'A ball is thrown upward at 10 m/s from a height of 20 m above the ground. Take g = 9.8 m/s². Where is it after 2 s?' }), variant({}))!
    expect(early.visual.motion!.segments).toEqual([{ kind: 'accelerate', duration: '2', a: '-9.8' }])
    expect(early.why).not.toContain('drawn to the ground')
  })

  it('an answer the author rounded (3.28 s, 19.8 m/s) is caught as the drawn 3.2838 s and 19.799 m/s its part marks right', () => {
    const num = (prompt: string, answer: string, unit: UnitId) => [{ type: 'number' as const, prompt, answer, unit, tolerance: { kind: 'relative' as const, value: 0.02 }, marks: 1 }]
    const flight = inferVisual(question({ statement: 'A ball is thrown upward at 10 m/s from a height of 20 m above the ground. Take g = 9.8 m/s².', parts: num('How long is it in the air?', '3.28', 's') }), variant({}))!
    expect(Number(flight.visual.motion!.segments[0].duration)).toBeCloseTo(3.28378, 4)
    expect(flight.revealsAnswer).toBe(true)
    // Both plots run for exactly the flight time, and the table holds it: nothing before the answer.
    expect(flight.early).toBeUndefined()
    const impact = inferVisual(question({ statement: 'A stone is dropped from a height of 20 m. Take g = 9.8 m/s².', parts: num('How fast is it going when it hits the ground?', '19.8', 'm/s') }), variant({}))!
    expect(impact.revealsAnswer).toBe(true)
    expect(impact.early?.motion?.plots ?? []).not.toContain('v-t')
    expect(impact.early?.motion?.sampleEvery).toBeUndefined()
    // An absolute band narrower than the author's own rounding still catches it: 3.28 written to
    // two places is anything that rounds to it, and 3.2838 does.
    const tight = inferVisual(question({ statement: 'A ball is thrown upward at 10 m/s from a height of 20 m above the ground. Take g = 9.8 m/s².', parts: [{ ...num('How long is it in the air?', '3.28', 's')[0], tolerance: { kind: 'absolute', value: 0.001 } }] }), variant({}))!
    expect(tight.revealsAnswer).toBe(true)
  })

  it('an answer in a middle row or at the turn is held back: a drop "after 2 s" ends at 2 s, and "stop rising" is the top', () => {
    const num = (prompt: string, answer: string, unit: UnitId) => [{ type: 'number' as const, prompt, answer, unit, tolerance: { kind: 'relative' as const, value: 0.02 }, marks: 1 }]
    // Drawn as the whole 3 s fall, its table had the row [2, 25, −20] before the answer.
    const after = inferVisual(question({ statement: 'A ball is dropped from a height of 45 m. Take g = 10 m/s².', parts: num('How fast is it going after 2 s?', '20', 'm/s') }), variant({}))!
    expect(after.visual.motion).toMatchObject({ x0: '45', v0: '0', segments: [{ kind: 'accelerate', duration: '2', a: '-10' }] })
    expect(after.revealsAnswer).toBe(true)
    expect(after.early).toBeUndefined()
    // A time past the landing is the fall to the ground.
    const late = inferVisual(question({ statement: 'A ball is dropped from a height of 45 m. Take g = 10 m/s². Where is it after 5 s?' }), variant({}))!
    expect(late.visual.motion!.segments).toEqual([{ kind: 'accelerate', duration: '3', a: '-10' }])
    // The whole 4 s flight: the v–t line crosses zero, the x–t curve peaks and a table row reads
    // [2, 20, 0] at the answer.
    const rising = inferVisual(question({ statement: 'A ball is thrown straight up at 20 m/s. Take g = 10 m/s².', parts: num('How long does it take to stop rising?', '2', 's') }), variant({}))!
    expect(rising.visual.motion!.segments).toEqual([{ kind: 'accelerate', duration: '4', a: '-10' }])
    expect(rising.revealsAnswer).toBe(true)
    expect(rising.early).toBeUndefined()
    // The top height (14² ÷ 20 = 9.8 m) peaks the x–t curve: only the v–t line comes first, with no readings.
    const top = inferVisual(question({ statement: 'A ball is thrown straight up at 14 m/s. Take g = 10 m/s².', parts: num('How far above the hand does it rise?', '9.8', 'm') }), variant({}))!
    expect(top.early).toEqual({ motion: { v0: '14', segments: top.visual.motion!.segments, plots: ['v-t'] } })
    // A middle reading alone: from rest at 2 m/s² for 5 s, "how far in the first 3 s" (9 m) is the
    // table's row at t = 3; the plots end at 25 m and 10 m/s and stay.
    const first3 = inferVisual(question({ statement: 'A cart starts from rest and speeds up at 2 m/s² for 5 s.', parts: num('How far does it go in the first three seconds?', '9', 'm') }), variant({}))!
    expect(first3.revealsAnswer).toBe(true)
    expect(first3.early).toEqual({ motion: { v0: '0', segments: first3.visual.motion!.segments, plots: ['v-t', 'x-t'] } })
  })

  it('the "why" sentence names only what the question gave, never a solved value that is the answer', () => {
    // The review's probe: the why read "from 0 m/s to 20 m/s in 10 s", and 20 m/s is the answer.
    const q = question({ statement: 'A car starts from rest and accelerates at 2 m/s² over 100 m.', parts: [{ type: 'number', prompt: 'Find its final speed.', answer: '20', unit: 'm/s', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }] })
    const auto = inferVisual(q, variant({}))!
    expect(auto.rule).toBe('suvat')
    expect(auto.why).toBe('PhysLab read this as one stretch of steady acceleration: from rest, at 2 m/s², over 100 m.')
    expect(auto.why).not.toMatch(/\b(20|10)\b/)
    const brake = question({ statement: 'A lorry moving at 72 km/h brakes at 4 m/s².', parts: [{ type: 'number', prompt: 'How far does it go before it stops?', answer: '50', unit: 'm', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }] })
    expect(inferVisual(brake, variant({}))!.why).toBe('PhysLab read this as one stretch of steady acceleration: from 20 m/s, to rest, slowing at 4 m/s².')
  })

  it('a journey in three stretches is not read as one, and four givens that disagree draw nothing', () => {
    expect(inferVisual(sample('physlab-sample-cyclist-journey'), variant({ a: 1, t1: 5, t2: 10, t3: 4, vmax: 5 }))?.rule).not.toBe('suvat')
    const clash = question({ statement: 'A cart speeds up from 2 m/s to 10 m/s in 4 s over 100 m.' })
    expect(inferVisual(clash, variant({}))).toBeNull()
    expect(solveSuvat({ u: 2, v: 10, t: 4, s: 24 })).toEqual({ u: 2, v: 10, a: 2, t: 4, s: 24 })
  })

  it('a journey in two stretches of equal times or lengths is not read as one (probe E)', () => {
    // Merged as one 5 s, it drew a stretch ending at 25 m where the journey goes 75 m.
    const probe = question({ statement: 'A car starts from rest and accelerates at 2 m/s² for 5 s, then continues at a steady speed for 5 s.', parts: [{ type: 'number', prompt: 'How far does it go in total?', answer: '75', unit: 'm', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }] })
    expect(inferVisual(probe, variant({}))?.rule).not.toBe('suvat')
    for (const words of ['A cart speeds up from rest at 1 m/s² over 50 m and then slows to rest over 50 m.', 'A runner starts from rest at 2 m/s² for 3 s and keeps that speed for a further 3 s.', 'A car starts from rest and accelerates at 2 m/s² for 5 s, followed by 5 s at a steady speed.']) {
      expect(inferVisual(question({ statement: words }), variant({}))?.rule, words).not.toBe('suvat')
    }
    // One number said twice in one stretch is still one quantity: the braking train says 24 m/s twice.
    const twice = inferVisual(question({ statement: 'A car moving at 24 m/s brakes to rest in 8 s. It was moving at 24 m/s.' }), variant({}))!
    expect(twice.visual.motion).toMatchObject({ v0: '24', segments: [{ kind: 'accelerate', duration: '8', a: '-3' }] })
  })

  it('the ball thrown up is a flight under a = −9.8 m/s² (the g the question gives) whose height curve is the answer', () => {
    const q = sample('physlab-sample-thrown-ball')
    const auto = inferVisual(q, variant({ u: 14.7 }))!
    expect(auto.rule).toBe('vertical')
    const m = auto.visual.motion!
    expect(m.v0).toBe('14.7')
    // Up to the top and back to the hand: t = 2u/g = 3 s.
    expect(m.segments).toEqual([{ kind: 'accelerate', duration: '3', a: '-9.8' }])
    expect(auto.revealsAnswer).toBe(true)
    // h = ut − 4.9t² is the x–t curve itself, so only the v–t line comes before the answer.
    expect(auto.early?.motion?.plots).toEqual(['v-t'])
    expect(auto.why).toContain('a = −9.8 m/s²')
  })

  it('"maximum height" stops the throw at the top; a drop falls from its height to the ground', () => {
    const top = question({ statement: 'A stone is thrown straight up at 19.6 m/s. Take g = 9.8 m/s².', parts: [{ type: 'number', prompt: 'What is its maximum height?', answer: '19.6', unit: 'm', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }] })
    const t = inferVisual(top, variant({}))!
    expect(t.visual.motion!.segments).toEqual([{ kind: 'accelerate', duration: '2', a: '-9.8' }])
    const drop = question({ statement: 'A ball is dropped from a height of 45 m. Take g = 10 m/s².', parts: [{ type: 'number', prompt: 'How long does it take to land?', answer: '3', unit: 's', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }] })
    const d = inferVisual(drop, variant({}))!
    expect(d.visual.motion).toMatchObject({ x0: '45', v0: '0', segments: [{ kind: 'accelerate', duration: '3', a: '-10' }] })
    // The time is the answer and both plots run for exactly that long: nothing before the answer.
    expect(d.early).toBeUndefined()
  })

  it('a speed given in a fall is read by its words: downwards is a start down, a landing speed is the end, a rising balloon a start up', () => {
    const num = (prompt: string, answer: string, unit: UnitId) => [{ type: 'number' as const, prompt, answer, unit, tolerance: { kind: 'relative' as const, value: 0.02 }, marks: 1 }]
    // Probe D: drawn as v0 = +5 it rose first and fell for 2.56 s; −20 = −5t − 5t² lands at t = (√17 − 1) ÷ 2 = 1.5616 s.
    const downward = inferVisual(question({ statement: 'A stone is released from a height of 20 m with a downward speed of 5 m/s. Take g = 10 m/s².', parts: num('How fast is it going after 1 s?', '15', 'm/s') }), variant({}))!
    expect(downward.rule).toBe('vertical')
    expect(downward.visual.motion).toMatchObject({ x0: '20', v0: '-5' })
    expect(downward.why).toBe('PhysLab read this as a fall from 20 m, starting at 5 m/s downwards, with a = −10 m/s² (up is positive), for 1 s.')
    const land = inferVisual(question({ statement: 'A stone is released from a height of 20 m with a downward speed of 5 m/s. Take g = 10 m/s².', parts: num('Where is it after 5 s?', '0', 'm') }), variant({}))!
    expect(Number(land.visual.motion!.segments[0].duration)).toBeCloseTo((Math.sqrt(17) - 1) / 2, 9)
    expect(motionAt(motionPieces(land.visual.motion!, {}).stretches, (Math.sqrt(17) - 1) / 2).x).toBeCloseTo(0, 9)
    // Probe C: the landing speed was drawn as a throw up at 19.8 m/s to 40 m, for 4.88 s.
    const hits = inferVisual(question({ statement: 'A stone is dropped from a height of 20 m and hits the ground at 19.8 m/s.', parts: num('How long does the fall take?', '2.02', 's') }), variant({}))!
    expect(hits.visual.motion).toMatchObject({ x0: '20', v0: '0' })
    expect(Number(hits.visual.motion!.segments[0].duration)).toBeCloseTo(Math.sqrt(40 / 9.81), 9)
    expect(hits.why).toContain('starting from rest')
    // A landing speed the fall from rest cannot reach means a start the words did not give: no picture.
    expect(inferVisual(question({ statement: 'A stone falls from a height of 20 m and lands at 25 m/s.' }), variant({}))?.rule).not.toBe('vertical')
    // A stone let go from a rising balloon starts upwards.
    const balloon = inferVisual(question({ statement: 'A sandbag is released from a balloon rising at 5 m/s at a height of 30 m. Take g = 10 m/s².' }), variant({}))!
    expect(balloon.visual.motion).toMatchObject({ x0: '30', v0: '5' })
    expect(balloon.why).toContain('starting at 5 m/s upwards')
    // "Thrown vertically downwards" was read as a throw up; with no cue at all the speed is not guessed.
    for (const words of ['A stone is thrown vertically downwards at 5 m/s from a height of 20 m. Take g = 10 m/s².', 'A stone is thrown downwards at 5 m/s from a height of 20 m. Take g = 10 m/s².']) {
      expect(inferVisual(question({ statement: words }), variant({}))!.visual.motion, words).toMatchObject({ x0: '20', v0: '-5' })
    }
    expect(inferVisual(question({ statement: 'A stone falls from a height of 20 m at 5 m/s.' }), variant({}))?.rule).not.toBe('vertical')
  })

  it('a body released on a ramp with its own acceleration is a stretch at that acceleration, never a fall under g (round-2 probe)', () => {
    const num = (prompt: string, answer: string, unit: UnitId) => [{ type: 'number' as const, prompt, answer, unit, tolerance: { kind: 'relative' as const, value: 0.02 }, marks: 1 }]
    // The review's probe: read as a fall it dropped from 2 m at −9.81 m/s² for 0.6386 s, ignoring
    // the 3 m/s² and the 2 s the question gives. On the ramp the 2 m is a height, not the distance
    // along it: s = ½ × 3 × 2² = 6 m.
    const ramp = inferVisual(question({ statement: 'A trolley is released from rest at a height of 2 m on a ramp and accelerates at 3 m/s² for 2 s.', parts: num('How far does it go?', '6', 'm') }), variant({}))!
    expect(ramp.rule).toBe('suvat')
    expect(ramp.visual.motion).toMatchObject({ v0: '0', segments: [{ kind: 'accelerate', duration: '2', a: '3' }] })
    expect(ramp.visual.motion!.x0).toBeUndefined()
    expect(ramp.why).toBe('PhysLab read this as one stretch of steady acceleration: from rest, at 3 m/s², for 2 s.')
    // The x–t curve ends at the answer 6 m and the v–t line at 6 m/s, the same number: nothing before it.
    expect(ramp.early).toBeUndefined()
    expect(ramp.revealsAnswer).toBe(true)
    // A block let go from the top of a slope slides at its own acceleration too.
    const slope = inferVisual(question({ statement: 'A block is released from rest at the top of a slope and slides down at 2 m/s² for 3 s.', parts: num('How far does it slide?', '9', 'm') }), variant({}))!
    expect(slope.rule).toBe('suvat')
    expect(slope.visual.motion).toMatchObject({ v0: '0', segments: [{ kind: 'accelerate', duration: '3', a: '2' }] })
    // Released with no speed given is from rest: "from rest" need not be said.
    const released = inferVisual(question({ statement: 'A trolley is released at a height of 2 m on a ramp and accelerates at 3 m/s² for 2 s.' }), variant({}))!
    expect(released.visual.motion).toMatchObject({ v0: '0', segments: [{ kind: 'accelerate', duration: '2', a: '3' }] })
    expect(released.why).toContain('from rest')
    // A released body whose given acceleration is not g is never drawn as a fall under g, and no
    // start speed is made up for it (20 m in 2 s at 3 m/s² from rest cannot happen: no picture).
    for (const words of ['A stone is released from a height of 20 m and accelerates at 3 m/s² for 2 s.', 'A crate is released from rest at a height of 5 m on an inclined plane.']) {
      expect(inferVisual(question({ statement: words }), variant({}))?.rule, words).not.toBe('vertical')
    }
    expect(inferVisual(question({ statement: 'A stone is released from a height of 20 m and accelerates at 3 m/s² for 2 s.' }), variant({}))?.rule).not.toBe('suvat')
    // An acceleration that is g, said without "g =", is still a fall, at the g it gives.
    const g = inferVisual(question({ statement: 'A stone is dropped from a height of 20 m and accelerates at 10 m/s².' }), variant({}))!
    expect(g.rule).toBe('vertical')
    expect(g.visual.motion).toMatchObject({ x0: '20', v0: '0', segments: [{ kind: 'accelerate', duration: '2', a: '-10' }] })
  })

  const num = (prompt: string, answer: string, unit: UnitId) => [{ type: 'number' as const, prompt, answer, unit, tolerance: { kind: 'relative' as const, value: 0.02 }, marks: 1 }]

  it('a launch at an angle is a projectile, never drawn as a throw straight up at its whole speed (review round 4)', () => {
    // Drawn straight up at 20 m/s it rose to 20 m in 2 s, where the true greatest height is 5 m;
    // the football's flight is 1.97 s, not the 3.06 s of a vertical throw at 15 m/s.
    const projected = question({ statement: 'A ball is projected upwards at 20 m/s at an angle of 30° to the horizontal. Take g = 10 m/s².', parts: num('Find the greatest height.', '5', 'm') })
    expect(inferVisual(projected, variant({}))?.rule).not.toBe('vertical')
    const kicked = question({ statement: 'A football is kicked up at 15 m/s at 40° above the horizontal.', parts: num('How long is it in the air?', '1.97', 's') })
    expect(inferVisual(kicked, variant({}))?.rule).not.toBe('vertical')
    // Neither is a stretch of steady acceleration either.
    expect(inferVisual(projected, variant({}))?.rule).not.toBe('suvat')
    expect(inferVisual(kicked, variant({}))?.rule).not.toBe('suvat')
    // A launch said horizontally, or with a horizontal speed, is a projectile too.
    for (const words of [
      'A stone is thrown horizontally at 15 m/s from a cliff 20 m high. Take g = 10 m/s².',
      'A ball is dropped with a horizontal velocity of 5 m/s from a height of 20 m. Take g = 10 m/s².',
      'A stone is thrown up at 20 m/s at 60° elevation. Take g = 10 m/s².'
    ]) {
      expect(inferVisual(question({ statement: words }), variant({}))?.rule, words).not.toBe('vertical')
    }
  })

  it('"horizontal ground" is where a fall ends, not a launch at an angle (review round 5)', () => {
    // Every "horizontal" once read as an angle, so this plain fall drew nothing: 20 m in 2 s at g = 10.
    const fall = inferVisual(question({ statement: 'A stone is dropped from a height of 20 m onto horizontal ground. Take g = 10 m/s².' }), variant({}))!
    expect(fall.rule).toBe('vertical')
    expect(fall.visual.motion!.segments).toEqual([{ kind: 'accelerate', duration: '2', a: '-10' }])
    const up = inferVisual(question({ statement: 'A ball is thrown upward at 20 m/s from a horizontal floor. Take g = 10 m/s².' }), variant({}))!
    expect(up.rule).toBe('vertical')
    expect(up.visual.motion!.v0).toBe('20')
  })

  it('a lone end speed is v, never the start: "reaching 16 m/s" solves u = 8, and a landing speed is no throw speed (review round 4)', () => {
    // Read as the start it drew v0 = 16 climbing to 24 m/s, the question turned round.
    const reach = inferVisual(question({ statement: 'A car accelerates uniformly at 2 m/s² for 4 s, reaching a speed of 16 m/s.', parts: num('Find its initial speed.', '8', 'm/s') }), variant({}))!
    expect(reach.rule).toBe('suvat')
    expect(reach.visual.motion).toMatchObject({ v0: '8', segments: [{ kind: 'accelerate', duration: '4', a: '2' }] })
    expect(motionAt(motionPieces(reach.visual.motion!, {}).stretches, 4).v).toBeCloseTo(16, 9)
    expect(reach.why).toBe('PhysLab read this as one stretch of steady acceleration: to 16 m/s, at 2 m/s², for 4 s.')
    // The start speed is the answer, so the v–t line (and the table) waits for it.
    expect(reach.revealsAnswer).toBe(true)
    expect(reach.early?.motion?.plots).toEqual(['x-t'])
    for (const words of ['A cyclist accelerates at 0.5 m/s² for 10 s to 8 m/s.', 'A car accelerates at 2 m/s² for 4 s. Its final speed is 16 m/s.']) {
      expect(Number(inferVisual(question({ statement: words }), variant({}))!.visual.motion!.v0), words).toBeCloseTo(words.includes('cyclist') ? 3 : 8, 9)
    }
    // A speed with no end cue is still the start.
    expect(inferVisual(question({ statement: 'A car travelling at 10 m/s accelerates at 2 m/s² for 4 s.' }), variant({}))!.visual.motion!.v0).toBe('10')
    // Thrown up from a cliff and landing at 25 m/s: the 25 m/s is not the throw.
    const cliff = question({ statement: 'A ball is thrown upward from a cliff 20 m high and lands at 25 m/s. Take g = 10 m/s².', parts: num('Find the speed it was thrown at.', '15', 'm/s') })
    expect(inferVisual(cliff, variant({}))?.rule).not.toBe('vertical')
    // A ball hit upwards at its speed is still a throw at that speed.
    expect(inferVisual(question({ statement: 'A ball is hit upwards at 20 m/s. Take g = 10 m/s².' }), variant({}))!.visual.motion!.v0).toBe('20')
  })

  it('"how high after 0.5 s" ends the flight at 0.5 s, not at the top; "maximum height" is still the top (review round 4)', () => {
    const then = inferVisual(question({ statement: 'A ball is thrown upward at 10 m/s. Take g = 9.8 m/s².', parts: num('How high is it after 0.5 s?', '3.775', 'm') }), variant({}))!
    expect(then.rule).toBe('vertical')
    expect(then.visual.motion!.segments).toEqual([{ kind: 'accelerate', duration: '0.5', a: '-9.8' }])
    // The x–t curve ends on the answer 3.775 m, so it waits.
    expect(then.revealsAnswer).toBe(true)
    expect(then.early?.motion?.plots).toEqual(['v-t'])
    const high = inferVisual(question({ statement: 'A ball is thrown upward at 9.8 m/s. Take g = 9.8 m/s².', parts: num('How high does it rise?', '4.9', 'm') }), variant({}))!
    expect(high.visual.motion!.segments).toEqual([{ kind: 'accelerate', duration: '1', a: '-9.8' }])
    const top = inferVisual(question({ statement: 'A ball is thrown upward at 19.6 m/s. Take g = 9.8 m/s².', parts: [...num('What is its maximum height?', '19.6', 'm'), ...num('How fast is it after 1 s?', '9.8', 'm/s')] }), variant({}))!
    expect(top.visual.motion!.segments).toEqual([{ kind: 'accelerate', duration: '2', a: '-9.8' }])
  })

  it('two bodies in one question are never merged into one motion (review round 4)', () => {
    // Drawn as one fall from 30 m starting at 5 m/s downwards: neither ball.
    const two = question({ statement: 'A ball is dropped from a height of 30 m. At the same moment a second ball is thrown downward at 5 m/s from the same height.', parts: num('How much sooner does the second ball land?', '0.38', 's') })
    expect(['vertical', 'suvat']).not.toContain(inferVisual(two, variant({}))?.rule)
    for (const words of [
      'A stone is dropped from the top of a tower 45 m high. Another stone is thrown down at 10 m/s one second later.',
      'Two cars start from rest. One accelerates at 2 m/s² for 5 s.',
      'A car accelerates from rest at 2 m/s² for 5 s. Another car passes it at 10 m/s.',
      // Plurals that are not the name plus "s" (review round 5): "bodies", "lorries", "people".
      'Two bodies are dropped from a height of 20 m. Take g = 10 m/s².',
      'Both bodies fall from a height of 45 m. Take g = 10 m/s².',
      'Two lorries start from rest. One accelerates at 2 m/s² for 5 s.',
      'Two people run from rest at 2 m/s² for 5 s.'
    ]) {
      expect(['vertical', 'suvat'], words).not.toContain(inferVisual(question({ statement: words }), variant({}))?.rule)
    }
    // "Second" as a time is not a second body.
    expect(inferVisual(question({ statement: 'A ball is dropped from a height of 45 m. Take g = 10 m/s².', parts: num('How far does it fall in the second second?', '15', 'm') }), variant({}))!.rule).toBe('vertical')
  })
})

// ---------------------------------------------------------------------------
// Inference: forces
// ---------------------------------------------------------------------------

describe('inferring a free-body diagram', () => {
  const arrows = (auto: ReturnType<typeof inferVisual>) => {
    const pic = auto!.visual.picture!
    if (pic.kind !== 'vectors') throw new Error(pic.kind)
    return pic.items.map((it) => [it.name, it.v.map(Number)])
  }

  it('the pulled crate draws its force, its weight mg and the normal reaction N (no friction: the force is the resultant)', () => {
    const auto = inferVisual(sample('physlab-sample-crate-acceleration'), variant({ m: 5, F: 30 }))!
    expect(auto.rule).toBe('freebody')
    expect(arrows(auto)).toEqual([['F', [30, 0]], ['mg', [0, -49.05]], ['N', [0, 49.05]]])
    // The answer is a = F/m = 6 m/s², which no arrow holds.
    expect(auto.revealsAnswer).toBe(false)
    expect(auto.early).toEqual(auto.visual)
  })

  it('a crate with a coefficient of friction draws F, μmg, mg and N, with g as the question gives it', () => {
    const auto = inferVisual(sample('physlab-sample-pushed-crate'), variant({ m: 5, mu: 0.4, g: 9.81, F: 25 }))!
    expect(arrows(auto)).toEqual([['F', [25, 0]], ['μmg', [-19.62, 0]], ['mg', [0, -49.05]], ['N', [0, 49.05]]])
  })

  it('a force at an angle to the horizontal is drawn at that angle and lightens the normal reaction', () => {
    const q = question({ statement: 'A 10 kg box on a rough floor is pulled by a 50 N force at 30° to the horizontal. The coefficient of friction is 0.2. Take g = 10 m/s².' })
    const got = arrows(inferVisual(q, variant({})))
    expect(got[0][0]).toBe('F')
    expect(got[0][1][0]).toBeCloseTo(43.30127, 4)
    expect(got[0][1][1]).toBeCloseTo(25, 9)
    // N = mg − F sin 30° = 100 − 25 = 75 N; friction μN = 15 N, so the arrow is named μN — μmg
    // would be 20 N, not the 15 N it is drawn at (review r1).
    expect(got[1]).toEqual(['μN', [-15, 0]])
    expect(got[3]).toEqual(['N', [0, 75]])
  })

  it('a force below the horizontal, to the vertical, or with its angle said twice is drawn the way the words say (review round 4)', () => {
    const at = (words: string) => arrows(inferVisual(question({ statement: `A 10 kg box rests on a horizontal floor. ${words} Take g = 9.8 m/s².` }), variant({})))
    const normal = (got: ReturnType<typeof at>) => got.find(([name]) => name === 'N')![1] as number[]
    const force = (got: ReturnType<typeof at>) => got.find(([name]) => name === 'F')![1] as number[]
    // Pulled at 30° above the horizontal, with the angle said again in the prompt: N = 98 − 25 = 73 N.
    const twice = arrows(inferVisual(question({ statement: 'A 10 kg box rests on a horizontal floor. It is pulled by a 50 N force at 30° to the horizontal. Take g = 9.8 m/s².', parts: [{ type: 'number', prompt: 'The force acts at 30°. Find the normal reaction.', answer: '73', unit: 'N', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }] }), variant({})))
    expect(normal(twice)[1]).toBeCloseTo(73, 9)
    expect(force(twice)[1]).toBeCloseTo(25, 9)
    // Pushed at 30° below the horizontal: Fy = −25 N, N = 98 + 25 = 123 N.
    const below = at('It is pushed by a 50 N force at 30° below the horizontal.')
    expect(force(below)[0]).toBeCloseTo(43.30127, 4)
    expect(force(below)[1]).toBeCloseTo(-25, 9)
    expect(normal(below)[1]).toBeCloseTo(123, 9)
    // At 60° to the vertical is 30° above the level: N = 73 N.
    const vertical = at('It is pulled by a 50 N force at 60° to the vertical.')
    expect(force(vertical)[0]).toBeCloseTo(43.30127, 4)
    expect(force(vertical)[1]).toBeCloseTo(25, 9)
    expect(normal(vertical)[1]).toBeCloseTo(73, 9)
    // An angle measured from nothing the words name is not guessed, and never drawn level.
    expect(inferVisual(question({ statement: 'A 10 kg box rests on a horizontal floor. It is pulled by a 50 N force at 30°.' }), variant({}))?.rule).not.toBe('freebody')
  })

  it('a coefficient of friction written as μ is read: F, μmg, mg and N (review round 4)', () => {
    for (const words of ['The coefficient of friction μ = 0.2.', 'The coefficient of friction (μ) is 0.2.', 'Take μ = 0.2.', 'μ = 0.2 between the box and the floor.']) {
      const got = arrows(inferVisual(question({ statement: `A 10 kg box on a horizontal floor is pulled by a 50 N force. ${words} Take g = 9.8 m/s².` }), variant({})))
      expect(got, words).toEqual([['F', [50, 0]], ['μmg', [-19.6, 0]], ['mg', [0, -98]], ['N', [0, 98]]])
    }
  })

  it('a block on a slope gets no level-ground diagram: its normal reaction is mg cos θ, not mg − F sin θ', () => {
    // The review's probe: drawn by the level rule, N stood straight up at 98.1 − 20 = 78.1 N, where
    // the true normal reaction is mg cos 30° = 84.96 N, perpendicular to the slope.
    const slope = question({ statement: 'A 10 kg block on a slope inclined at 30° to the horizontal is pulled up the slope by a 40 N force.' })
    expect(inferVisual(slope, variant({}))?.rule).not.toBe('freebody')
    const ramp = question({ statement: 'A 5 kg box rests on a rough ramp. A 20 N force pushes it along the surface.' })
    expect(inferVisual(ramp, variant({}))?.rule).not.toBe('freebody')
    const plane = question({ statement: 'A 2 kg crate on an inclined plane is held by a 9 N force along the surface.' })
    expect(inferVisual(plane, variant({}))?.rule).not.toBe('freebody')
  })

  it('an arrow whose size is the answer is kept back until the answer is earned', () => {
    const q = question({
      statement: 'A 4 kg block rests on a table. Take g = 9.8 m/s². A 12 N force pulls it along the table.',
      parts: [{ type: 'number', prompt: 'What is the normal reaction on the block?', answer: '39.2', unit: 'N', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }]
    })
    const auto = inferVisual(q, variant({}))!
    expect(auto.revealsAnswer).toBe(true)
    const early = auto.early!.picture!
    expect(early.kind === 'vectors' && early.items.map((it) => it.name)).toEqual(['F'])
  })
})

// ---------------------------------------------------------------------------
// Inference: functions, the normal distribution, vector and roots answers
// ---------------------------------------------------------------------------

describe('inferring a curve from the maths', () => {
  const numbasStyle = (statement: string, prompt: string, answer = 'x'): PQQuestion =>
    question({ statement, parts: [{ type: 'expression', prompt, answer, symbols: ['x'], marks: 1 }] })

  it('$$ f(x) = x^3 - 2x $$ with "differentiate" is the curve before the answer and its tangent once earned', () => {
    const auto = inferVisual(numbasStyle('Let\n$$f(x) = x^3 - 2x$$', 'Differentiate f(x).', '3x^2 - 2'), variant({}))!
    expect(auto.rule).toBe('function')
    const early = auto.early!.picture!
    expect(early.kind).toBe('curve')
    const full = auto.visual.picture!
    expect(full.kind).toBe('tangent')
    if (full.kind !== 'tangent' || early.kind !== 'curve') return
    expect(fnAt(early.expr, 2)).toBe(4)
    expect(full.at).toBe('1')
    expect(auto.revealsAnswer).toBe(true)
  })

  it('a turning-point question draws the curve with its turns marked, never a tangent at x = 1 (review round 4)', () => {
    // The tangent at the default x = 1 had slope 1 on x³ − 2x and −2 on x² − 4x + 1: nothing the question asks.
    for (const [statement, answer] of [
      ['Find the turning point of the curve.\n$$ f(x) = x^3 - 2x $$', 'sqrt(2/3)'],
      ['$$ y = x^{2} - 4x + 1 $$', '2'],
      ['Find the stationary points of\n$$ f(x) = x^3 - 2x $$', 'sqrt(2/3)']
    ]) {
      const q = question({ statement, parts: [{ type: 'number', prompt: statement.startsWith('$$') ? 'Find the x-coordinate of the turning point.' : 'Give the positive x.', answer, unit: 'none', tolerance: { kind: 'absolute', value: 1e-4 }, marks: 1 }] })
      const auto = inferVisual(q, variant({}))!
      expect(auto.rule, statement).toBe('function')
      expect(auto.visual.picture!.kind, statement).toBe('curve')
      expect(auto.why, statement).not.toContain('tangent')
      // The turn is the answer and the curve marks it: nothing before the answer.
      expect(auto.revealsAnswer, statement).toBe(true)
      expect(auto.early, statement).toBeUndefined()
    }
    // A turning-point question that names its x still gets the tangent there.
    const named = inferVisual(numbasStyle('$$ y = x^{2} - 4x + 1 $$', 'Show that the curve has a stationary point at x = 2.'), variant({}))!
    expect(named.visual.picture).toMatchObject({ kind: 'tangent', at: '2' })
  })

  it('the tangent goes where the question says, "at x = 2"', () => {
    const auto = inferVisual(numbasStyle('$$ y = x^{2} + 1 $$', 'Find the gradient of the curve at x = 2.'), variant({}))!
    const full = auto.visual.picture!
    expect(full.kind === 'tangent' && full.at).toBe('2')
  })

  it('an integral with limits shades its region, the area held back until earned', () => {
    const q = question({ statement: 'Evaluate\n$$ \\int_{0}^{2} x^{2}\\,dx $$', parts: [{ type: 'number', prompt: 'The value', answer: '8/3', unit: 'none', tolerance: { kind: 'relative', value: 0.01 }, marks: 1 }] })
    const auto = inferVisual(q, variant({}))!
    const pic = auto.visual.picture!
    expect(pic).toMatchObject({ kind: 'between', lower: '0', from: '0', to: '2' })
    expect(pic.kind === 'between' && fnAt(pic.upper, 3)).toBe(9)
    expect(auto.revealsAnswer).toBe(true)
    expect(auto.early).toEqual(auto.visual)
  })

  it('a chip in the maths line is drawn with its number in', () => {
    const q = numbasStyle('$$ f(x) = {k}x^{2} $$', 'Differentiate.')
    q.variables = [{ name: 'k', def: { kind: 'list', items: [3] } }]
    const pic = inferVisual(q, variant({ k: 3 }))!.early!.picture!
    expect(pic.kind === 'curve' && fnAt(pic.expr, 2)).toBe(12)
  })

  it('a curve whose root is the answer waits for the answer', () => {
    const q = question({ statement: '$$ f(x) = x^{2} - 9 $$', parts: [{ type: 'number', prompt: 'Find the positive root of f.', answer: '3', unit: 'none', tolerance: { kind: 'relative', value: 0.01 }, marks: 1 }] })
    const auto = inferVisual(q, variant({}))!
    expect(auto.revealsAnswer).toBe(true)
    expect(auto.early).toBeUndefined()
  })

  it('a turning point between the sample points is found where it is: 3x² − 2x at 1/3, x³ − 2x at ±√(2/3)', () => {
    // A band as tight as the author likes: the drawing marks the true turn, not the grid point beside it.
    const tight = (statement: string, prompt: string, answer: string) =>
      question({ statement, parts: [{ type: 'number', prompt, answer, unit: 'none', tolerance: { kind: 'absolute', value: 1e-6 }, marks: 1 }] })
    for (const [statement, prompt, answer] of [
      ['$$ f(x) = 3x^{2} - 2x $$', 'Find the minimum value of f.', '-1/3'],
      ['$$ f(x) = 3x^{2} - 2x $$', 'At what x is f smallest?', '1/3'],
      ['$$ f(x) = x^{3} - 2x $$', 'At what x does f have its local minimum?', 'sqrt(2/3)'],
      ['$$ f(x) = x^{3} - 2x $$', 'What is the local maximum value of f?', '(4/3) * sqrt(2/3)']
    ]) {
      const auto = inferVisual(tight(statement, prompt, answer), variant({}))!
      expect(auto.rule, prompt).toBe('function')
      expect(auto.revealsAnswer, `${statement} ${prompt}`).toBe(true)
      expect(auto.early, `${statement} ${prompt}`).toBeUndefined()
    }
    // A number that is no mark of the curve leaves it drawn from the start.
    const other = inferVisual(tight('$$ f(x) = 3x^{2} - 2x $$', 'What is f(5)?', '65'), variant({}))!
    expect(other.revealsAnswer).toBe(false)
    expect(other.early).toEqual(other.visual)
  })
})

describe('inferring a normal distribution', () => {
  const normalQ = (prompt: string, answer: string) =>
    question({
      statement: 'The masses of apples are normally distributed with mean {mu} and standard deviation {sd}.',
      variables: [{ name: 'mu', def: { kind: 'list', items: [50] }, unit: 'g' }, { name: 'sd', def: { kind: 'list', items: [10] }, unit: 'g' }],
      parts: [{ type: 'number', prompt, answer, unit: 'none', tolerance: { kind: 'absolute', value: 0.0005 }, marks: 1 }]
    })

  it('"normally distributed with mean 50 and standard deviation 10" shades the asked region below 65', () => {
    const auto = inferVisual(normalQ('Find the probability that an apple weighs less than 65 g.', '0.9332'), variant({ mu: 50, sd: 10 }))!
    expect(auto.rule).toBe('normal')
    expect(auto.visual.picture).toEqual({ kind: 'normal', mean: '50', sd: '10', to: '65' })
    // The shaded area is the answer: drawn before it with the value held back, the label after.
    expect(auto.revealsAnswer).toBe(true)
    expect(auto.early).toEqual(auto.visual)
  })

  it('P(X > 65), "between 40 and 60" and N(50, 10²) are read too', () => {
    expect(inferVisual(normalQ('Find P(X > 65).', '0.0668'), variant({ mu: 50, sd: 10 }))!.visual.picture).toMatchObject({ from: '65' })
    expect(inferVisual(normalQ('What fraction weigh between 40 and 60 g?', '0.6827'), variant({ mu: 50, sd: 10 }))!.visual.picture).toMatchObject({ from: '40', to: '60' })
    const tenSquared = question({ statement: 'X ~ N(50, 10²).', parts: [{ type: 'number', prompt: 'Find P(X < 65).', answer: '0.9332', unit: 'none', tolerance: { kind: 'absolute', value: 0.0005 }, marks: 1 }] })
    expect(inferVisual(tenSquared, variant({}))!.visual.picture).toEqual({ kind: 'normal', mean: '50', sd: '10', to: '65' })
    const variance = question({ statement: 'X ~ N(50, 100).', parts: [{ type: 'number', prompt: 'Find P(X < 65).', answer: '0.9332', unit: 'none', tolerance: { kind: 'absolute', value: 0.0005 }, marks: 1 }] })
    expect(inferVisual(variance, variant({}))!.visual.picture).toMatchObject({ sd: '10' })
  })

  it('P(40 ≤ X ≤ 60) and P(60 > X > 40) shade 40 to 60, never the whole bell, and the earned area is 0.6827 (review round 4)', () => {
    for (const prompt of ['Find P(40 ≤ X ≤ 60).', 'Find P(40 <= X <= 60).', 'Find P(40 < X ≤ 60).', 'Find P(60 > X > 40).', 'Find P(60 ≥ X ≥ 40).']) {
      expect(inferVisual(normalQ(prompt, '0.6827'), variant({ mu: 50, sd: 10 }))!.visual.picture, prompt).toEqual({ kind: 'normal', mean: '50', sd: '10', from: '40', to: '60' })
    }
    const q = normalQ('Find P(40 ≤ X ≤ 60).', '0.6827')
    const auto = inferVisual(q, variant({ mu: 50, sd: 10 }))!
    expect(auto.revealsAnswer).toBe(true)
    expect(auto.why).toContain('shaded where the question asks')
    const shown = draw(auto.visual.picture!, q)
    expect(shown.value).toBeCloseTo(0.6827, 4)
  })

  it('a tail past 6σ draws the bell with nothing shaded and probability 0; a reversed "between" is read in order', () => {
    // The review's probe: P(X > 120) for N(50, 10²) is 7σ out, and the picture threw "The shaded
    // region needs its start below its end." for a valid question.
    const far = question({ statement: 'Heights are normally distributed with mean 50 and standard deviation 10.', parts: [{ type: 'number', prompt: 'Find P(X > 120).', answer: '0', unit: 'none', tolerance: { kind: 'absolute', value: 0.0005 }, marks: 1 }] })
    const played = playQuestion(far, 1, SETTINGS)
    const plan = visualPlanFor(played)
    expect(plan.source).toBe('inferred')
    expect(() => showVisual(plan, played, SETTINGS, false)).not.toThrow()
    expect(graphs().some((g) => g.name === 'normal')).toBe(true)
    expect(graphs().some((g) => g.kind === 'between')).toBe(false)
    scene().newScene()
    const shown = draw({ kind: 'normal', mean: '50', sd: '10', from: '120' }, far)
    expect(shown.value).toBe(0)
    // Between 60 and 40 is the stretch from 40 to 60.
    const reversed = question({ statement: 'Masses are normally distributed with mean 50 g and standard deviation 10 g.', parts: [{ type: 'number', prompt: 'What fraction weigh between 60 and 40 g?', answer: '0.6827', unit: 'none', tolerance: { kind: 'absolute', value: 0.0005 }, marks: 1 }] })
    const auto = inferVisual(reversed, variant({}))!
    expect(auto.visual.picture).toMatchObject({ from: '40', to: '60' })
    expect(auto.revealsAnswer).toBe(true)
    // An author's picture whose ends are the wrong way round is refused in words about the question.
    expect(() => picturePlan({ kind: 'normal', mean: '50', sd: '10', from: '60', to: '40' }, played, SETTINGS)).toThrow('this question has it from 60 to 40')
  })
})

describe('inferring from vector and roots answers', () => {
  it("a vector part's answer is its arrow, in the answer colour, only once earned", () => {
    const q = question({
      statement: 'A force of 10 N acts at 30° above the x-axis.',
      parts: [{ type: 'vector', prompt: 'Write F in components.', answer: ['10 * cos(30 deg)', '10 * sin(30 deg)'], unit: 'N', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }]
    })
    const auto = inferVisual(q, variant({}))!
    expect(auto.rule).toBe('vector')
    const pic = auto.visual.picture!
    expect(pic.kind === 'vectors' && pic.items[0].name).toBe('F')
    expect(pic.kind === 'vectors' && pic.items[0].role).toBe('result')
    expect(pic.kind === 'vectors' && Number(pic.items[0].v[0])).toBeCloseTo(8.660254, 5)
    expect(auto.revealsAnswer).toBe(true)
    expect(auto.early).toBeUndefined()
    // The article opening a sentence is no name: this arrow was called A.
    const article = inferVisual({ ...q, parts: [{ ...q.parts[0], prompt: 'A force of 3i + 4j acts with it. Find the resultant.' }] }, variant({}))!
    const ap = article.visual.picture!
    expect(ap.kind === 'vectors' && ap.items[0].name).toBe('R')
  })

  it("a roots part draws its equation's curve once earned; without an equation, one through the roots", () => {
    const roots = (statement: string) =>
      question({ statement, parts: [{ type: 'roots', prompt: 'Solve.', answer: ['2', '-3'], unit: 'none', tolerance: { kind: 'absolute', value: 0.001 }, marks: 1 }] })
    const withEq = inferVisual(roots('Solve\n$$ x^{2} + x - 6 = 0 $$'), variant({}))!
    expect(withEq.rule).toBe('roots')
    const pic = withEq.visual.picture!
    expect(pic.kind === 'curve' && [fnAt(pic.expr, 2), fnAt(pic.expr, -3), fnAt(pic.expr, 0)]).toEqual([0, 0, -6])
    expect(withEq.early).toBeUndefined()
    const bare = inferVisual(roots('A quadratic has two roots.'), variant({}))!
    const p2 = bare.visual.picture!
    expect(p2.kind === 'curve' && [fnAt(p2.expr, 2), fnAt(p2.expr, -3)]).toEqual([0, 0])
  })
})

// ---------------------------------------------------------------------------
// The fallback and the one entry point
// ---------------------------------------------------------------------------

describe('a visual for every question', () => {
  it('a pure-arithmetic question gets its given numbers on a number line, never the answer', () => {
    const q = question({
      statement: 'What is {a} + {b}?',
      variables: [{ name: 'a', def: { kind: 'list', items: [3] } }, { name: 'b', def: { kind: 'list', items: [4] } }],
      parts: [{ type: 'number', prompt: 'The sum', answer: 'a + b', unit: 'none', tolerance: { kind: 'absolute', value: 0 }, marks: 1 }]
    })
    const plan = visualOf(q, variant({ a: 3, b: 4 }))
    expect(plan.source).toBe('fallback')
    if (plan.source === 'authored') return
    expect(plan.auto.rule).toBe('numberline')
    expect(plan.auto.visual.picture).toEqual({ kind: 'numberline', items: [{ label: 'a = {a}', value: '3' }, { label: 'b = {b}', value: '4' }] })
    // With no variables, the numbers in its words; one equal to the answer is left off.
    const literal = question({ statement: 'What is 12 ÷ 4 + 3?', parts: [{ type: 'number', prompt: 'Work it out.', answer: '6', unit: 'none', tolerance: { kind: 'absolute', value: 0 }, marks: 1 }] })
    const lp = visualOf(literal, variant({}))
    // A bare number carries no label of its own: the drawing writes its value through format.ts.
    expect(lp.source === 'fallback' && lp.auto.visual.picture).toEqual({ kind: 'numberline', items: [{ label: '', value: '12' }, { label: '', value: '4' }, { label: '', value: '3' }] })
    const coincide = question({ statement: 'What is 3 + 3?', parts: [{ type: 'number', prompt: 'Sum', answer: '6', unit: 'none', tolerance: { kind: 'absolute', value: 0 }, marks: 1 }] })
    const cp = visualOf({ ...coincide, statement: 'Double 3 and add 0. What is 6 − 0?' }, variant({}))
    expect(cp.source === 'fallback' && cp.auto.visual.picture?.kind === 'numberline' && cp.auto.visual.picture.items.map((it) => it.value)).toEqual(['3', '0'])
    // Numbers given only in a part's prompt, as imported questions often do: the line was empty.
    const inPrompt = visualOf(question({ statement: 'Answer it.', parts: [{ type: 'number', prompt: 'What is 12 + 4?', answer: '16', unit: 'none', tolerance: { kind: 'absolute', value: 0 }, marks: 1 }] }), variant({}))
    expect(inPrompt.source === 'fallback' && inPrompt.auto.visual.picture).toEqual({ kind: 'numberline', items: [{ label: '', value: '12' }, { label: '', value: '4' }] })
    expect(hasVisual(inPrompt)).toBe(true)
    // A number said in the statement and again in a prompt is one mark.
    const twice = visualOf(question({ statement: 'A box holds 12 apples.', parts: [{ type: 'number', prompt: 'How many are left when 4 of the 12 are eaten?', answer: '8', unit: 'none', tolerance: { kind: 'absolute', value: 0 }, marks: 1 }] }), variant({}))
    expect(twice.source === 'fallback' && twice.auto.visual.picture?.kind === 'numberline' && twice.auto.visual.picture.items.map((it) => it.value)).toEqual(['12', '4'])
  })

  it('a question with no numbers to mark has no visual: its state is "none", never a ready button that only throws', () => {
    const words = question({
      statement: 'Which of these is a vector?',
      parts: [{ type: 'choice', prompt: 'Pick one.', choices: [{ text: 'velocity', correct: true }, { text: 'speed', correct: false }], shuffle: false, marks: 1 }]
    })
    const plan = visualPlanFor(playQuestion(words, 1, SETTINGS))
    expect(plan.source).toBe('fallback')
    expect(hasVisual(plan)).toBe(false)
    expect(visualState(plan, false)).toBe('none')
    expect(visualState(plan, true)).toBe('none')
    // Its only given number is its answer, so the line would be empty too.
    const echo = question({ statement: 'Write 7 in words, then as a number.', parts: [{ type: 'number', prompt: 'The number', answer: '7', unit: 'none', tolerance: { kind: 'absolute', value: 0 }, marks: 1 }] })
    expect(visualState(visualPlanFor(playQuestion(echo, 1, SETTINGS)), false)).toBe('none')
    // A question with numbers still has its line.
    const sum = question({ statement: 'What is 12 ÷ 4 + 3?', parts: [{ type: 'number', prompt: 'Work it out.', answer: '6', unit: 'none', tolerance: { kind: 'absolute', value: 0 }, marks: 1 }] })
    expect(visualState(visualPlanFor(playQuestion(sum, 1, SETTINGS)), false)).toBe('ready')
  })

  it('a bare number on the line is written through format.ts: 0.00000015 reads 1.5×10^-7, never "1.5e-7"', () => {
    const q = question({ statement: 'Add 0.00000015 and 2500000000000000000000.', parts: [{ type: 'number', prompt: 'The sum', answer: '2', unit: 'none', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }] })
    const played = playQuestion(q, 1, SETTINGS)
    const plan = visualPlanFor(played)
    expect(plan.source).toBe('fallback')
    const note = showVisual(plan, played, SETTINGS, false)
    const small = fmtPrecise(1.5e-7, SETTINGS)
    expect(small.startsWith('1.5×10')).toBe(true)
    expect(texts()).toContain(small)
    expect(note).toContain(small)
    expect(texts()).toContain(fmtPrecise(2.5e21, SETTINGS))
    for (const s of [note, ...texts()]) expect(s).not.toMatch(/\de[+-]?\d/)
  })

  it("an author's identifier (len_ab, w_1) is not shown as a label; a one-letter name is", () => {
    const q = question({
      statement: 'A rectangle is {len_ab} by {w_1}, and a square has side {s}.',
      variables: [{ name: 'len_ab', unit: 'm', def: { kind: 'list', items: [3] } }, { name: 'w_1', unit: 'm', def: { kind: 'list', items: [2] } }, { name: 's', def: { kind: 'list', items: [5] } }],
      parts: [{ type: 'number', prompt: 'Its area', answer: 'len_ab * w_1', unit: 'm²', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }]
    })
    const played = playQuestion(q, 1, SETTINGS)
    const plan = visualPlanFor(played)
    expect(plan.source).toBe('fallback')
    showVisual(plan, played, SETTINGS, false)
    const labels = texts()
    expect(labels.some((t) => t.includes('len_ab') || t.includes('w_1'))).toBe(false)
    expect(labels).toContain('s = 5')
    expect(labels.some((t) => /^3\s?m$/.test(t))).toBe(true)
  })

  it('all six bundled samples have an authored or a non-fallback inferred visual at every one of 20 seeds (Fix 21: was 3 of 6)', () => {
    const qs = loadBundled().questions.filter((q) => q.id.startsWith('physlab-sample-'))
    expect(qs).toHaveLength(6)
    const authored = qs.filter((q) => q.picture || q.motion || q.sandbox).length
    let inferred = 0
    for (const q of qs) {
      for (let seed = 1; seed <= 20; seed++) {
        const plan = visualOf(q, drawVariables(q, seed))
        expect(plan.source, `${q.title} at seed ${seed}`).not.toBe('fallback')
        if (seed === 1 && plan.source === 'inferred') inferred++
      }
    }
    expect(authored + inferred).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// Playing it: nothing inferred shows the answer before it is earned
// ---------------------------------------------------------------------------

/** Every number the drawing and its note carry: text labels, the note's numbers, each curve's value at its ends, each arrow's size and components. */
function numbersOnScreen(note: string, tablesFrom = Infinity): number[] {
  const out: number[] = []
  const read = (s: string) => {
    for (const m of s.replace(/−/g, '-').matchAll(/-?\d+(?:\.\d+)?/g)) out.push(Number(m[0]))
  }
  read(note)
  // Every reading in a Lab Data table the drawing made: a middle row can hold the answer too.
  for (const t of useLab.getState().tables.slice(tablesFrom)) for (const row of t.rows) out.push(...row.filter((c): c is number => typeof c === 'number'))
  for (const t of texts()) read(t)
  for (const o of objects()) {
    if (o.type === 'graph') {
      const g = o as GraphObj
      const ends: { expr: string; from?: number; to?: number }[] = g.pieces ?? g.exprs.map((e) => ({ expr: e, from: g.tMin, to: g.tMax }))
      for (const p of ends) {
        for (const x of [p.from, p.to]) {
          if (x === undefined) continue
          out.push(x)
          const y = fnAt(p.expr, x)
          if (Number.isFinite(y)) out.push(y)
        }
      }
    } else if (o.type === 'vector') {
      const c = (o as unknown as { def: { comp?: number[] } }).def.comp
      if (c) out.push(...c, Math.hypot(...c))
    }
  }
  return out
}

const sameAt = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))
/** Whether a value on screen would be marked right for an answer: every case here has the 2 % band. */
const marksRight = (shown: number, answer: number): boolean => Math.abs(Math.abs(shown) - Math.abs(answer)) <= 0.02 * Math.abs(answer) || sameAt(Math.abs(shown), Math.abs(answer))

describe('showing an inferred visual through the player', () => {
  /** Questions with no authored visual, each played at a seed: the six rules and the fallback. */
  const cases = (): { name: string; q: PQQuestion; seed: number }[] => {
    const out: { name: string; q: PQQuestion; seed: number }[] = []
    for (const id of ['physlab-sample-braking-train', 'physlab-sample-thrown-ball', 'physlab-sample-crate-acceleration']) {
      for (let seed = 1; seed <= 10; seed++) out.push({ name: `${id} #${seed}`, q: sample(id), seed })
    }
    const num = (prompt: string, answer: string, unit: UnitId = 'none') =>
      ({ type: 'number' as const, prompt, answer, unit, tolerance: { kind: 'relative' as const, value: 0.02 }, marks: 1 })
    out.push(
      { name: 'car speed', q: question({ statement: 'A car sets off from rest and speeds up evenly at 2 m/s² for 5 s.', parts: [num('How fast is it going?', '10', 'm/s')] }), seed: 1 },
      { name: 'drop time', q: question({ statement: 'A ball is dropped from a height of 45 m. Take g = 10 m/s².', parts: [num('How long does it take to land?', '3', 's')] }), seed: 1 },
      { name: 'normal reaction', q: question({ statement: 'A 4 kg block rests on a table. Take g = 9.8 m/s². A 12 N force pulls it along the table.', parts: [num('What is the normal reaction?', '39.2', 'N')] }), seed: 1 },
      { name: 'normal', q: question({ statement: 'Heights are normally distributed with mean 50 and standard deviation 10.', parts: [num('Find the probability that a height is less than 65.', '0.9332')] }), seed: 1 },
      { name: 'integral', q: question({ statement: 'Evaluate\n$$ \\int_{0}^{2} x^{2}\\,dx $$', parts: [num('The value', '8/3')] }), seed: 1 },
      { name: 'gradient', q: question({ statement: '$$ y = x^{2} + 1 $$', parts: [num('Find the gradient of the curve at x = 2.', '4')] }), seed: 1 },
      // A size asked for, drawn signed: the impact speed ends the v–t line at −19.8 (review r1).
      { name: 'impact speed', q: question({ statement: 'A stone is dropped from a height of 20 m. Take g = 9.8 m/s².', parts: [num('How fast is it going when it hits the ground?', 'sqrt(2 * 9.8 * 20)', 'm/s')] }), seed: 1 },
      // An answer in km/h, drawn in m/s: 72 km/h is the v–t line's start at 20 m/s (review r1).
      { name: 'speed in km/h', q: question({ statement: 'A car travelling at 72 km/h brakes to rest in 5 s.', parts: [num('How fast was it going, in km/h?', '72', 'km/h')] }), seed: 1 },
      // Rounded by the author: 3.28 s and 19.8 m/s are marked right against the drawn 3.2838 and
      // 19.799, so a picture showing those gives the answer away just the same (review r1, 0.9 pass).
      { name: 'rounded flight time', q: question({ statement: 'A ball is thrown upward at 10 m/s from a height of 20 m above the ground. Take g = 9.8 m/s².', parts: [num('How long is it in the air?', '3.28', 's')] }), seed: 1 },
      { name: 'rounded impact speed', q: question({ statement: 'A stone is dropped from a height of 20 m. Take g = 9.8 m/s².', parts: [num('How fast is it going when it hits the ground?', '19.8', 'm/s')] }), seed: 1 },
      // A middle moment: the whole fall or flight was drawn, and a table row or the turn held the answer.
      { name: 'speed after 2 s', q: question({ statement: 'A ball is dropped from a height of 45 m. Take g = 10 m/s².', parts: [num('How fast is it going after 2 s?', '20', 'm/s')] }), seed: 1 },
      { name: 'stop rising', q: question({ statement: 'A ball is thrown straight up at 20 m/s. Take g = 10 m/s².', parts: [num('How long does it take to stop rising?', '2', 's')] }), seed: 1 },
      { name: 'first 3 s', q: question({ statement: 'A cart starts from rest and speeds up at 2 m/s² for 5 s.', parts: [num('How far does it go in the first three seconds?', '9', 'm')] }), seed: 1 },
      { name: 'sum', q: question({ statement: 'What is {a} + {b}?', variables: [{ name: 'a', def: { kind: 'range', from: 1, to: 9, step: 1 } }, { name: 'b', def: { kind: 'range', from: 1, to: 9, step: 1 } }], parts: [num('The sum', 'a + b')] }), seed: 3 }
    )
    return out
  }

  it('no inferred picture holds the answer — its value or its curve — before it is earned, and the whole picture draws once it is', () => {
    let drawnEarly = 0
    for (const { name, q, seed } of cases()) {
      scene().newScene()
      // Its own id, so each case's Lab Data readings are a new table, never an earlier case's.
      const played = playQuestion({ ...q, id: `${q.id}:${name}` }, seed, SETTINGS)
      const tablesFrom = useLab.getState().tables.length
      const plan = visualPlanFor(played)
      expect(plan.source, name).not.toBe('authored')
      if (plan.source === 'authored') continue
      const answers = played.parts.flatMap((p) => (p.field ? [p.field.value] : p.choices ? p.choices.filter((c) => c.correct).map((c) => Number(c.text.replace(/[^\d.−-]/g, '').replace('−', '-'))) : []))
      // The drawing is in SI and signed: an answer counts as shown in its own unit or in SI, by size.
      for (const p of played.parts) {
        const unit = 'unit' in p.part ? UNITS[p.part.unit] : undefined
        if (p.field && unit && unit.toSI !== 1) answers.push(p.field.value * unit.toSI)
      }
      const curves = played.parts.flatMap((p) => (p.part.type === 'expression' ? [p.part] : []))
      if (visualState(plan, false) === 'after-answer') {
        expect(() => showVisual(plan, played, SETTINGS, false), name).toThrow(HELD_BACK)
      } else {
        drawnEarly++
        const note = showVisual(plan, played, SETTINGS, false)
        const shown = numbersOnScreen(note, tablesFrom)
        for (const a of answers) expect(shown.filter((s) => marksRight(s, a)), `${name}: ${a} is on screen before it is earned`).toEqual([])
        // An expression answer (the ball's height formula) must not be a drawn curve either.
        for (const part of curves) {
          const sym = part.symbols[0]
          for (const o of objects()) {
            if (o.type !== 'graph') continue
            const g = o as GraphObj
            for (const p of g.pieces ?? g.exprs.map((e) => ({ expr: e, from: g.tMin ?? 0, to: g.tMax ?? 1 }))) {
              const xs = [0.3, 0.6, 0.9].map((k) => p.from + (p.to - p.from) * k)
              const isAnswer = xs.every((x) => sameAt(fnAt(p.expr, x), evaluateInVariables(part.answer, { ...played.variant.values, [sym]: x })))
              expect(isAnswer, `${name}: the answer curve is drawn before it is earned`).toBe(false)
            }
          }
        }
      }
      scene().newScene()
      expect(() => showVisual(plan, played, SETTINGS, true), name).not.toThrow()
      expect(objects().length, name).toBeGreaterThan(0)
    }
    expect(drawnEarly).toBeGreaterThan(20)
  })

  it('the braking train: v–t alone before the answer; v–t, x–t and a Lab Data table ending at the distance once earned', () => {
    const q = sample('physlab-sample-braking-train')
    const played = playQuestion(q, 1, SETTINGS)
    const { v, t } = played.variant.values
    const plan = visualPlanFor(played)
    expect(plan.source).toBe('inferred')
    expect(visualState(plan, false)).toBe('ready')
    const before = useLab.getState().tables.length
    expect(showVisual(plan, played, SETTINGS, false)).toContain('Drawn: speed against time')
    expect(graphs().map((g) => g.name)).toEqual(['vt'])
    expect(useLab.getState().tables.length).toBe(before)
    const note = showVisual(plan, played, SETTINGS, true)
    expect(note).toContain('position')
    expect(graphs().map((g) => g.name).sort()).toEqual(['vt', 'xt'])
    const table = useLab.getState().tables[useLab.getState().tables.length - 1]
    expect(table.rows[table.rows.length - 1][1]).toBeCloseTo((v * t) / 2, 6)
  })

  it('an author picture is always ready and keeps its value label back until earned, as in 0.7.0', () => {
    const q = sample('physlab-sample-area-between')
    const played = playQuestion(q, 1, SETTINGS)
    const plan = visualPlanFor(played)
    expect(plan.source).toBe('authored')
    expect(visualState(plan, false)).toBe('ready')
    expect(visualMode(plan)).toBe('graphing')
    expect(showVisual(plan, played, SETTINGS, false)).toContain('the one whose area you are finding')
    expect(texts().some((x) => x.startsWith('area ='))).toBe(false)
    expect(visualMode(visualPlanFor(playQuestion(sample('physlab-sample-pushed-crate'), 1, SETTINGS)))).toBe('sandbox')
    expect(INFERRED_NOTE).toBe("PhysLab drew this from the question's numbers.")
  })
})

// ---------------------------------------------------------------------------
// A teacher's Numbas file
// ---------------------------------------------------------------------------

describe('an imported Numbas .exam', () => {
  const CC_BY = 'Creative Commons Attribution 4.0 International'
  const v = (name: string, definition: string) => ({ name, group: 'Ungrouped variables', definition, description: '', templateType: 'anything', can_override: false })
  const nq = (name: string, statement: string, parts: unknown[], variables: Record<string, unknown> = {}) => ({
    name, statement, advice: '', rulesets: {}, extensions: [], variables, ungrouped_variables: Object.keys(variables), variable_groups: [], functions: {},
    preamble: { js: '', css: '' }, parts, tags: [], metadata: { description: '', licence: CC_BY }, contributors: [{ name: 'Ada Lovelace', profile_url: '' }], type: 'question'
  })
  const jme = (prompt: string, answer: string) => ({ type: 'jme', marks: 1, prompt, answer, vsetRange: [0, 1], checkingType: 'absdiff', notation: 'basic', enabledFunctions: [], disabledFunctions: [], functionSets: [] })
  const numberEntry = (prompt: string, answer: string) => ({ type: 'numberentry', marks: 1, prompt, minValue: answer, maxValue: answer, precisionType: 'none' })
  const EXAM = `// Numbas version: finer_feedback_settings\n${JSON.stringify({
    name: 'Teacher set', metadata: { description: '', licence: '' }, duration: 0, percentPass: 0, contributors: [], extensions: [], custom_part_types: [], resources: [],
    question_groups: [{ name: 'Group', pickingStrategy: 'all-ordered', questions: [
      nq('Braking train', '<p>A train moving at {u} m/s slows at {a} m/s² for {t} s.</p>', [numberEntry('<p>What is its speed after {t} s? Give your answer in m/s.</p>', 'u - a*t')], { u: v('u', 'random(20..40#5)'), a: v('a', 'random(0.5..2#0.5)'), t: v('t', 'random(2..8)') }),
      nq('Differentiate', '<p>Let</p><p>\\[f(x) = x^3 - 2x\\]</p>', [jme('<p>Differentiate f.</p>', '3x^2-2')]),
      nq('Add', '<p>What is {a} + {b}?</p>', [numberEntry('<p>Answer</p>', 'a+b')], { a: v('a', 'random(1..9)'), b: v('b', 'random(1..9)') }),
      nq('Apples', '<p>The masses of apples are normally distributed with mean 150 g and standard deviation 20 g.</p>', [numberEntry('<p>What proportion weigh more than 180 g?</p>', '0.0668')])
    ] }]
  })}`

  it('carries no authored visual (Fix 21: 0 of 4), and every question now gets one — three inferred, the sum on a number line', () => {
    const { file, report } = fromExam(EXAM)
    expect(report).toEqual([])
    expect(file.questions).toHaveLength(4)
    expect(file.questions.filter((q) => q.picture || q.motion || q.sandbox)).toHaveLength(0)
    const rules = file.questions.map((q) => {
      const plan = visualOf(q, drawVariables(q, 7))
      return plan.source === 'authored' ? 'authored' : `${plan.source}:${plan.auto.rule}`
    })
    expect(rules).toEqual(['inferred:suvat', 'inferred:function', 'fallback:numberline', 'inferred:normal'])
    // And each one draws, before and after the answer, without a sentence of refusal.
    for (const q of file.questions) {
      for (const earned of [false, true]) {
        const played = playQuestion(q, 7, SETTINGS)
        const plan = visualPlanFor(played)
        if (visualState(plan, earned) === 'ready') expect(() => showVisual(plan, played, SETTINGS, earned), `${q.title} earned=${earned}`).not.toThrow()
      }
    }
  })
})
