// Question pictures as the student meets them from Problem Sets: where their objects land, what
// their arrows are called, how the camera frames a motion, and what a picture may show before the
// question is answered.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The stylesheet is not loaded here, so the drawing's colours fall back (as in autoVisual.test.ts).
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))
import { resetGlobals } from './helpers/globals'
import { scene } from '../src/renderer/src/core/store'
import { spaceOf } from '../src/renderer/src/core/visibility'
import { Builder } from '../src/renderer/src/core/factory'
import { componentTexts, displayName, vectorAmount } from '../src/renderer/src/core/naming'
import type { SceneObject, VectorObj } from '../src/renderer/src/core/types'
import { fmtPrecise, type MeasureSettings } from '../src/renderer/src/math/format'
import type { V3 } from '../src/renderer/src/math/vec'
import { unitOfComponents, unitsCompatible, UNITS } from '../src/renderer/src/questions/units'
import type { UnitId } from '../src/renderer/src/questions/pqjson'
import { loadBundled } from '../src/renderer/src/questions/bank'
import { authoredEarly } from '../src/renderer/src/questions/autoVisual'
import { parsePQFile } from '../src/renderer/src/questions/pqjson'
import { drawVariables } from '../src/renderer/src/questions/variables'
import { math } from '../src/renderer/src/math/expr'
import { checkPlayedPart, countedParts, HELD_BACK, playQuestion, plotScale, showVisual, visualMode, visualPlanFor, visualState } from '../src/renderer/src/questions/player'
import { graphBox } from '../src/renderer/src/core/visualize'
import { motionPieces } from '../src/renderer/src/questions/motion'

const S: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'unit', unitPerSquare: 1, angleUnit: 'deg' }

beforeEach(() => {
  resetGlobals()
  scene().newScene()
})

/** What one call added to the scene. */
const added = (run: () => void): SceneObject[] => {
  const before = new Set(scene().order)
  run()
  return scene()
    .order.filter((id) => !before.has(id))
    .map((id) => scene().objects[id])
}

describe('a question picture lands in the space Practice switches to', () => {
  it('Rotation’s arrows r and v, shown from Problem Sets on a fresh start, are in Graphing', () => {
    const q = loadBundled().questions.find((x) => x.id === 'physlab-fields-angular-velocity')!
    // A fresh start is in Vectors; Problem Sets keeps that drawing space.
    scene().setActiveSpace(spaceOf('problems'))
    const played = playQuestion(q, 1, S)
    const plan = visualPlanFor(played)
    expect(visualMode(plan)).toBe('graphing')
    const objs = added(() => showVisual(plan, played, S, true))
    expect(objs.filter((o) => o.type === 'vector').length).toBe(2)
    for (const o of objs) expect(o.space, `${o.type} ${o.name}`).toBe(spaceOf(visualMode(plan)))
  })

  it('every bundled question’s drawn visual, early and earned, is in the space of the mode it switches to', () => {
    let drawn = 0
    for (const q of loadBundled().questions) {
      const played = playQuestion(q, 3, S)
      const plan = visualPlanFor(played)
      const mode = visualMode(plan)
      if (mode !== 'graphing') continue
      for (const earned of [false, true]) {
        scene().setActiveSpace(spaceOf('problems'))
        let objs: SceneObject[]
        try {
          objs = added(() => showVisual(plan, played, S, earned))
        } catch {
          continue // held back until the answer: nothing drawn
        }
        for (const o of objs) expect(o.space, `${q.id} (${earned ? 'earned' : 'early'}): ${o.type} ${o.name}`).toBe(spaceOf(mode))
        drawn += objs.length
      }
    }
    expect(drawn).toBeGreaterThan(100)
  })
})

describe('arrow pictures read with the author’s names and the arrows’ own units', () => {
  const arrowsOf = (id: string, seed = 1) => {
    const q = loadBundled().questions.find((x) => x.id === id)!
    const played = playQuestion(q, seed, S)
    scene().setActiveSpace(spaceOf('problems'))
    const objs = added(() => showVisual(visualPlanFor(played), played, S, true))
    return { played, arrows: objs.filter((o): o is VectorObj => o.type === 'vector') }
  }
  const compOf = (o: VectorObj): V3 => (o.def.kind === 'free' ? o.def.comp : [0, 0, 0])
  const tailOf = (o: VectorObj): V3 => (o.def.kind === 'free' ? (o.def.tail as V3) : [0, 0, 0])

  it('two masses over a pulley: m₂g is labelled m₂g in N — never "mg1x = 0 u"', () => {
    const { played, arrows } = arrowsOf('physlab-mechanics-atwood-machine')
    expect(arrows.map((o) => o.label ?? o.name)).toEqual(['m₁g', 'm₂g'])
    const all = arrows.flatMap((o) => [displayName(o, scene().objects), ...componentTexts(o, compOf(o), S), vectorAmount(1, o, S)])
    for (const text of all) {
      expect(text).not.toMatch(/mg1/)
      expect(text).not.toMatch(/ u$/)
    }
    const m2g = arrows[1]
    const { m2, g } = played.variant.values
    expect(componentTexts(m2g, compOf(m2g), S)).toEqual(['m₂gx = 0 N', `m₂gy = ${fmtPrecise(-m2 * g, S)} N`])
  })

  it('two masses over a pulley: the tails are at least one arrow length apart, so the labels do not collide', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { arrows } = arrowsOf('physlab-mechanics-atwood-machine', seed)
      const longest = Math.max(...arrows.map((o) => Math.hypot(...compOf(o))))
      expect(Math.abs(tailOf(arrows[1])[0] - tailOf(arrows[0])[0]), `seed ${seed}`).toBeGreaterThanOrEqual(longest)
    }
  })

  it('a collision’s u₂ is labelled u₂ in m/s, not the scene’s u1', () => {
    const { arrows } = arrowsOf('physlab-mechanics-two-body-collision')
    expect(arrows.map((o) => o.label ?? o.name)).toEqual(['u₁', 'u₂'])
    const [ux] = componentTexts(arrows[1], compOf(arrows[1]), S)
    expect(ux).toMatch(/^u₂x = −\d+(\.\d+)? m\/s$/)
  })

  it('an arrow the student already has a name for keeps its author’s name on the drawing', () => {
    // A student's own F takes the name first; the question's F is stored as F1 but reads F.
    scene().setActiveSpace('graphing')
    const q = loadBundled().questions.find((x) => x.id === 'physlab-mechanics-connected-blocks')!
    const played = playQuestion(q, 1, S)
    const mine = new Builder()
    mine.vector({ kind: 'free', tail: [0, 0, 0], comp: [1, 1, 0] }, { name: 'F' })
    mine.commit()
    const objs = added(() => showVisual(visualPlanFor(played), played, S, true))
    const F = objs.find((o): o is VectorObj => o.type === 'vector')!
    expect(F.name).not.toBe('F')
    expect(displayName(F, scene().objects)).toBe('F')
    expect(F.unit).toBe('N')
  })
})

describe('unitOfComponents', () => {
  it('works a unit out of the formulas and the variables’ units', () => {
    expect(unitOfComponents(['0', '-m2*g'], { m2: 'kg', g: 'm/s²' })).toBe('N')
    expect(unitOfComponents(['u1', '0'], { u1: 'm/s' })).toBe('m/s')
    expect(unitOfComponents(['-u2', '0'], { u2: 'm/s' })).toBe('m/s')
    expect(unitOfComponents(['r', '0'], { r: 'm' })).toBe('m')
    expect(unitOfComponents(['F*cos(th)', 'F*sin(th)'], { F: 'N', th: '°' })).toBe('N')
    expect(unitOfComponents(['0.5*m*v^2', '0'], { m: 'kg', v: 'm/s' })).toBe('J')
    expect(unitOfComponents(['m*v', '0'], { m: 'kg', v: 'm/s' })).toBe('kg·m/s')
    expect(unitOfComponents(['sqrt(2*g*h)', '0'], { g: 'm/s²', h: 'm' })).toBe('m/s')
  })

  it('a variable declared with no unit is a pure number, and an arrow that is one variable reads in its own unit', () => {
    // Friction pull: μ is declared without a unit, so −μmg is a force in N.
    expect(unitOfComponents(['-mu*m*g', '0'], { mu: undefined, m: 'kg', g: 'm/s²' })).toBe('N')
    expect(unitOfComponents(['-mu*m*g', '0'], { mu: 'none', m: 'kg', g: 'm/s²' })).toBe('N')
    // Torque: r = (d, 0) with d in cm reads in cm, its numbers being d's own.
    expect(unitOfComponents(['d', '0'], { d: 'cm' })).toBe('cm')
    expect(unitOfComponents(['-(d)', '0'], { d: 'cm' })).toBe('cm')
    expect(unitOfComponents(['m', '0'], { m: 'g' })).toBe('g')
    expect(unitOfComponents(['a', 'b'], { a: 'cm', b: 'm' })).toBeNull()
  })

  it('every bundled arrow picture has a unit on each arrow, or on none of them', () => {
    let pictures = 0
    for (const q of loadBundled().questions) {
      if (q.picture?.kind !== 'vectors') continue
      pictures++
      const units = Object.fromEntries(q.variables.map((v) => [v.name, v.unit])) as Record<string, UnitId | undefined>
      const found = q.picture.items.map((it) => unitOfComponents(it.v, units))
      expect(found.every((u) => u !== null) || found.every((u) => u === null), `${q.id}: ${found.join(', ')}`).toBe(true)
    }
    expect(pictures).toBeGreaterThanOrEqual(12)
    const unitsIn = (id: string) => {
      const q = loadBundled().questions.find((x) => x.id === id)!
      const units = Object.fromEntries(q.variables.map((v) => [v.name, v.unit])) as Record<string, UnitId | undefined>
      return q.picture?.kind === 'vectors' ? q.picture.items.map((it) => unitOfComponents(it.v, units)) : []
    }
    // The three the browser walk read in grid units beside arrows in N.
    expect(unitsIn('physlab-mechanics-newtons-second-law')).toEqual(['N', 'N', 'N'])
    expect(unitsIn('physlab-fields-torque')).toEqual(['cm', 'N'])
    expect(unitsIn('physlab-mechanics-friction-pull').every((u) => u === 'N')).toBe(true)
  })

  it('says nothing when it cannot tell, or the components disagree', () => {
    expect(unitOfComponents(['3', '4'], {})).toBeNull()
    expect(unitOfComponents(['x', 'y'], {})).toBeNull()
    expect(unitOfComponents(['m', 't'], { m: 'kg', t: 's' })).toBeNull()
    // m × g with m in grams would need its scale carried: no label rather than a wrong one.
    expect(unitOfComponents(['m*g', '0'], { m: 'g', g: 'm/s²' })).toBeNull()
    // An undeclared symbol is not taken for a pure number.
    expect(unitOfComponents(['mu*m*g', '0'], { m: 'kg', g: 'm/s²' })).toBeNull()
    expect(unitOfComponents(['v + t', '0'], { v: 'm/s', t: 's' })).toBeNull()
    // 9.8 is g with its unit left off: m × 9.8 is a weight, not a mass in kg.
    expect(unitOfComponents(['0', '-m*9.8'], { m: 'kg' })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Before the answer: nothing drawn, and nothing in the note, marks right
// ---------------------------------------------------------------------------

const numbersIn = (text: string): number[] => [...text.replace(/−/g, '-').matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))

/** A graph's formula in x, as the scene draws it. */
const graphAt = (expr: string) => {
  const f = math.compile(expr)
  return (x: number): number => {
    try {
      return Number(f.evaluate({ x }))
    } catch {
      return NaN
    }
  }
}

/** Ends, crossings and turns of a curve on [a, b], found by sampling it as the viewport does. */
function readCurve(f: (x: number) => number, a: number, b: number): { ends: number[]; marks: number[]; heights: number[] } {
  const ends = [a, b, f(a), f(b)]
  const marks: number[] = []
  const heights = [f(a), f(b)]
  const n = 600
  for (let i = 1; i < n; i++) {
    const [x0, x1, x2] = [a + ((b - a) * (i - 1)) / n, a + ((b - a) * i) / n, a + ((b - a) * (i + 1)) / n]
    const [y0, y1, y2] = [f(x0), f(x1), f(x2)]
    if ((y1 - y0) * (y2 - y1) < 0) {
      marks.push(x1, y1)
      heights.push(y1)
    }
    if (y0 * y1 < 0) marks.push(x1)
  }
  return { ends: ends.filter(Number.isFinite), marks: marks.filter(Number.isFinite), heights: heights.filter(Number.isFinite) }
}

/** Every number the drawing puts on screen: curve ends (which a labelled scale may multiply) and everything else. */
function numbersDrawn(objs: SceneObject[]): { ends: number[]; marks: number[]; heights: number[] } {
  const ends: number[] = []
  const marks: number[] = []
  const heights: number[] = []
  for (const o of objs) {
    if (o.type === 'graph') {
      // A curve with no stretch of its own runs off the edge of the view: it has no ends to read.
      const open = !o.pieces && (o.tMin === undefined || o.tMax === undefined)
      const pieces = o.pieces ?? o.exprs.map((expr) => ({ expr, from: o.tMin ?? -10, to: o.tMax ?? 10 }))
      for (const p of pieces) {
        const r = readCurve(graphAt(p.expr), p.from, p.to)
        if (!open) ends.push(...r.ends)
        marks.push(...r.marks)
        // A motion plot drawn in tens or hundreds of its unit is written "(…) / 10": read back at that scale.
        const scale = Number(/\) \/ (\d+)$/.exec(p.expr)?.[1] ?? NaN)
        if (Number.isFinite(scale)) heights.push(...r.heights.map((y) => y * scale))
      }
    } else if (o.type === 'vector' && o.def.kind === 'free') {
      const c = o.def.comp
      const turn = (Math.atan2(c[1], c[0]) * 180) / Math.PI
      marks.push(c[0], c[1], Math.hypot(...c), turn, (turn + 360) % 360)
    } else if (o.type === 'text') marks.push(...numbersIn(o.text))
    else if (o.type === 'point' && o.def.kind === 'free' && o.visible) marks.push(o.def.p[0], o.def.p[1])
  }
  return { ends, marks, heights }
}

describe('a picture shown before the answer holds none of it', () => {
  it('every bundled question, ten seeds: neither the early picture nor its note shows a number any part marks right', () => {
    const TEN = [1e-6, 1e-5, 1e-4, 1e-3, 0.01, 0.1, 10, 100, 1000, 1e4, 1e5, 1e6]
    let drawnEarly = 0
    let held = 0
    for (const q of loadBundled().questions) {
      const text = [q.statement, ...q.parts.map((p) => p.prompt)].join('\n')
      for (let seed = 1; seed <= 10; seed++) {
        const played = playQuestion(q, seed, S)
        const plan = visualPlanFor(played)
        if (visualMode(plan) !== 'graphing') continue
        const state = visualState(plan, false)
        if (state === 'none') continue
        if (state === 'after-answer') {
          expect(() => showVisual(plan, played, S, false), q.id).toThrow(HELD_BACK)
          held++
          continue
        }
        let note = ''
        const objs = added(() => {
          note = showVisual(plan, played, S, false)
        })
        drawnEarly++
        // A number the question itself writes is no secret, whatever it happens to equal.
        const given = q.variables.filter((v) => text.includes(`{${v.name}}`)).map((v) => played.variant.values[v.name])
        const isGiven = (x: number): boolean => given.some((g) => Math.abs(Math.abs(g) - Math.abs(x)) <= 1e-9 * Math.max(1, Math.abs(g)))
        const drawn = numbersDrawn(objs)
        // A zero is the origin or a start from rest, never a reading of an answer.
        const plain = [...drawn.ends, ...drawn.marks, ...numbersIn(note)].filter((x) => x !== 0 && !isGiven(x))
        // A list of curves is drawn to the scale its labels name ("tenths of an amp", "litres").
        const scaled = plan.source === 'authored' && plan.picture?.kind === 'curves' ? TEN.flatMap((k) => drawn.ends.filter((x) => Math.abs(x) !== 1).map((x) => x * k)) : []
        // A motion plot may be drawn in tens or hundreds of its unit; its heights are read back at that scale.
        if (plan.source === 'authored' && plan.motion) scaled.push(...drawn.heights.filter((y) => y !== 0 && !isGiven(y)))
        for (const p of countedParts(played)) {
          if (p.part.type !== 'number' || !p.field) continue
          const want = Math.abs(p.field.value)
          // Only a number near the answer can be marked right; the marker has the last word on those.
          const near = [...plain, ...scaled].filter((x) => Math.abs(Math.abs(x) - want) <= 0.1 * want + 1e-9)
          for (const x of near) {
            for (const typed of [x, Math.abs(x)]) {
              expect(checkPlayedPart(p, String(typed), played, S).verdict, `${q.id} seed ${seed}: ${typed} shown before "${p.prompt}" is answered (note: ${note})`).not.toBe('right')
            }
          }
        }
      }
    }
    expect(drawnEarly).toBeGreaterThan(150)
    expect(held).toBeGreaterThan(50)
  }, 60_000)

  it('a motion drawn before the answer: a given excuses a number only in its own role (a height is not a speed)', () => {
    // Falling energy at h = 19.6 m, g = 9.8: the impact speed is 19.6 m/s too. The v–t line
    // ending there hands the speed over, though 19.6 was given — as a height.
    const roleUnit: Record<string, UnitId> = { xt: 'm', vt: 'm/s', at: 'm/s²' }
    let checked = 0
    for (const q of loadBundled().questions) {
      if (!q.motion) continue
      const text = [q.statement, ...q.parts.map((p) => p.prompt)].join('\n')
      for (let seed = 1; seed <= 40; seed++) {
        const played = playQuestion(q, seed, S)
        const plan = visualPlanFor(played)
        if (visualState(plan, false) !== 'ready') continue
        const objs = added(() => showVisual(plan, played, S, false))
        const givenIn = (unit: UnitId): number[] =>
          q.variables.filter((v) => v.unit !== undefined && unitsCompatible(v.unit, unit) && text.includes(`{${v.name}}`)).map((v) => played.variant.values[v.name] * UNITS[v.unit!].toSI)
        const isOne = (x: number, of: number[]) => x === 0 || of.some((g) => Math.abs(Math.abs(g) - Math.abs(x)) <= 1e-9 * Math.max(1, Math.abs(g)))
        const shown: number[] = []
        for (const o of objs) {
          if (o.type !== 'graph' || !o.pieces) continue
          for (const p of o.pieces) {
            const scale = Number(/\) \/ (\d+)$/.exec(p.expr)?.[1] ?? 1)
            const r = readCurve(graphAt(p.expr), p.from, p.to)
            shown.push(...[p.from, p.to].filter((t) => !isOne(t, givenIn('s'))))
            shown.push(...r.heights.map((y) => y * scale).filter((y) => !isOne(y, givenIn(roleUnit[o.name]))))
          }
        }
        for (const p of countedParts(played)) {
          if (p.part.type !== 'number' || !p.field) continue
          const want = Math.abs(p.field.value)
          for (const x of shown.filter((y) => Math.abs(Math.abs(y) - want) <= 0.1 * want)) {
            expect(checkPlayedPart(p, String(Math.abs(x)), played, S).verdict, `${q.id} seed ${seed}: ${x} on the early motion`).not.toBe('right')
          }
        }
        checked++
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('the checker’s cases: the answer is held back, or its plot dropped', () => {
    const early = (id: string, seed = 1) => {
      const q = loadBundled().questions.find((x) => x.id === id)!
      const plan = visualPlanFor(playQuestion(q, seed, S))
      if (plan.source !== 'authored') throw new Error(`${id} has no authored visual`)
      return { plan, state: visualState(plan, false) }
    }
    // "How long?" at a steady speed: the time axis runs to the answer — nothing to show yet.
    expect(early('physlab-mechanics-steady-speed').state).toBe('after-answer')
    // Thrown up: the v–t line crosses zero at the time asked for, the x–t curve peaks at the height.
    expect(early('physlab-mechanics-ball-thrown-up').state).toBe('after-answer')
    // Braking car: the x–t curve ends on the distance; the v–t line only on givens.
    expect(early('physlab-mechanics-braking-car').plan.early.motion?.plots).toEqual(['v-t'])
    // Sliding to rest in a distance: the v–t slope is the deceleration, over a time the question never gave.
    expect(early('physlab-mechanics-friction-from-sliding').plan.early.motion?.plots).toEqual(['x-t'])
    // Charles's law: the "warmed" line ends on the new volume (in litres); the line up to T₁ stays.
    const charles = early('physlab-fields-charles-law').plan.early.picture
    expect(charles?.kind === 'curves' && charles.items.map((it) => it.label)).toEqual(['Litres against tens of kelvin, back to absolute zero'])
    // Series circuit, divider, echo and period of rotation: every curve ends on the answer.
    for (const id of ['physlab-fields-series-resistors', 'physlab-fields-potential-divider', 'physlab-fields-echo-distance', 'physlab-fields-period-of-rotation']) {
      expect(early(id).state, id).toBe('after-answer')
    }
    // Once earned, everything is there again.
    expect(visualState(early('physlab-mechanics-steady-speed').plan, true)).toBe('ready')
  })

  it('a teacher’s held-back picture with an experiment beside it: the first button waits, and never opens the experiment instead', () => {
    const q = parsePQFile(
      JSON.stringify({
        app: 'PhysLab',
        format: 'pqjson',
        version: 2,
        questions: [
          {
            id: 't',
            title: 'T',
            license: { id: 'CC BY 4.0', holder: 'Teacher' },
            statement: 'The line y = {m}x + 2{m} is drawn.',
            variables: [{ name: 'm', def: { kind: 'list', items: [3] } }],
            parts: [{ type: 'number', prompt: 'Where does it cut the y-axis?', answer: '2*m', unit: 'none', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }],
            picture: { kind: 'curve', expr: 'm*x + 2*m', xMin: '-1', xMax: '1' },
            sandbox: { preset: 'friction' }
          }
        ]
      })
    ).questions[0]
    const played = playQuestion(q, 1, S)
    const plan = visualPlanFor(played)
    expect(visualMode(plan)).toBe('graphing')
    expect(visualState(plan, false)).toBe('after-answer')
    expect(() => showVisual(plan, played, S, false)).toThrow(HELD_BACK)
    expect(visualState(plan, true)).toBe('ready')
  })

  it('a played question’s plan is worked out once: Practice asks on every keystroke', () => {
    const q = loadBundled().questions.find((x) => x.id === 'physlab-mechanics-braking-car')!
    const played = playQuestion(q, 1, S)
    expect(visualPlanFor(played)).toBe(visualPlanFor(played))
    // Another variant is another plan.
    expect(visualPlanFor(playQuestion(q, 2, S))).not.toBe(visualPlanFor(played))
  })

  it('a teacher’s own question: a worked-out y-intercept asked for holds the curve back; an answer of 0 holds nothing back', () => {
    const one = (q: object) => parsePQFile(JSON.stringify({ app: 'PhysLab', format: 'pqjson', version: 2, questions: [{ id: 't', title: 'T', license: { id: 'CC BY 4.0', holder: 'Teacher' }, ...q }] })).questions[0]
    const number = (answer: string, unit = 'none') => ({ type: 'number', prompt: 'What is it?', answer, unit, tolerance: { kind: 'relative', value: 0.02 }, marks: 1 })
    // The curve crosses x = 0 at 2m = 6 — neither end, root nor turn, but the number asked for.
    const worked = one({
      statement: 'The line y = {m}x + 2{m} is drawn.',
      variables: [{ name: 'm', def: { kind: 'list', items: [3] } }],
      parts: [{ ...number('2*m'), prompt: 'Where does it cut the y-axis?' }],
      picture: { kind: 'curve', expr: 'm*x + 2*m', xMin: '-1', xMax: '1' }
    })
    expect(authoredEarly(worked, drawVariables(worked, 1)).picture).toBeUndefined()
    // Thrown up at 12 m/s: "its speed at the top?" is 0, and every motion starts on a zero.
    const top = one({
      statement: 'A ball is thrown straight up at {u}.',
      variables: [{ name: 'u', def: { kind: 'list', items: [12] }, unit: 'm/s' }],
      parts: [{ ...number('0', 'm/s'), prompt: 'What is its speed at the very top?' }],
      motion: { v0: 'u', segments: [{ kind: 'accelerate', duration: '2*u/9.81', a: '-9.81' }], plots: ['v-t', 'x-t'] }
    })
    expect(authoredEarly(top, drawVariables(top, 1)).motion?.plots).toEqual(['v-t', 'x-t'])
  })

  it('the motion note leaves the time out until the answer is earned', () => {
    const q = loadBundled().questions.find((x) => x.id === 'physlab-mechanics-braking-car')!
    const drawn = playQuestion(q, 1, S)
    // 20 m/s to rest in 7 s, the checker's numbers.
    const played = { ...drawn, variant: { ...drawn.variant, values: { v: 20, t: 7 } } }
    const plan = visualPlanFor(played)
    expect(showVisual(plan, played, S, false)).toBe('Drawn: speed against time (time runs along x).')
    expect(showVisual(plan, played, S, true)).toMatch(/^Drawn: speed and position( in tens of metres)? against time for \d+ s \(time runs along x\)\./)
  })
})

describe('a motion is framed on its own time, not squeezed against the y-axis', () => {
  /** The box the camera is fitted to: every graph the picture drew, with the origin. */
  const framed = (objs: SceneObject[]) => {
    const boxes = objs.flatMap((o) => (o.type === 'graph' ? [graphBox(o)] : [])).filter((b) => b !== null)
    return {
      xMin: Math.min(0, ...boxes.map((b) => b.min[0])),
      xMax: Math.max(0, ...boxes.map((b) => b.max[0])),
      yMin: Math.min(0, ...boxes.map((b) => b.min[1])),
      yMax: Math.max(0, ...boxes.map((b) => b.max[1]))
    }
  }

  it('a car braking from 20 m/s to rest in 7 s: 7 s across, and nothing taller than about 3 × that', () => {
    const q = loadBundled().questions.find((x) => x.id === 'physlab-mechanics-braking-car')!
    const played = playQuestion(q, 1, S)
    const at = { ...played, variant: { ...played.variant, values: { v: 20, t: 7 } } }
    let note = ''
    const box = framed(added(() => (note = showVisual(visualPlanFor(at), at, S, true))))
    expect(box.xMax - box.xMin).toBeCloseTo(7, 6)
    // The x–t curve reaches 70 m; drawn in tens of metres it stands 7 high, beside the 20 m/s line.
    expect(box.yMax - box.yMin).toBeLessThanOrEqual(21)
    expect(note).toBe('Drawn: speed and position in tens of metres against time for 7 s (time runs along x).')
  })

  it('every bundled motion: the framed width is the motion’s whole time, and no plot stands more than √10 × taller', () => {
    let checked = 0
    for (const q of loadBundled().questions) {
      if (!q.motion) continue
      for (let seed = 1; seed <= 6; seed++) {
        const played = playQuestion(q, seed, S)
        const total = motionPieces(q.motion, played.variant.values).total
        const box = framed(added(() => showVisual(visualPlanFor(played), played, S, true)))
        expect(box.xMax - box.xMin, `${q.id} seed ${seed}`).toBeCloseTo(total, 6)
        expect(Math.max(box.yMax, -box.yMin), `${q.id} seed ${seed}`).toBeLessThanOrEqual(Math.sqrt(10) * total + 1e-9)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(40)
  })

  it('plotScale divides by a power of ten only, and never blows a small plot up', () => {
    expect(plotScale([{ expr: '20 * x - 1/7 * 10 * x^2', from: 0, to: 7 }], 7)).toBe(10)
    expect(plotScale([{ expr: '20 + (-2.857) * x', from: 0, to: 7 }], 7)).toBe(1)
    expect(plotScale([{ expr: '5', from: 0, to: 40 }], 40)).toBe(1)
    expect(plotScale([{ expr: '200 * x', from: 0, to: 10 }], 10)).toBe(100)
  })
})
