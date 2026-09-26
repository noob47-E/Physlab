// QP1: the PhysLab physics set (motion, forces, energy, momentum) — 20 questions of PhysLab's
// own, written because Numbas has almost no physics content (S-Q §2). Every question is CC BY
// 4.0 from PhysLab, sits on rung 2 or 3, carries at least one named trap, worked steps and an
// authored visual (a motion picture or a picture field, never the auto-inferred fallback), and
// has a known answer worked by hand here from the numbers a pinned seed draws. Every variable is
// drawn afresh on each play (only g stays put), so a student who plays the set again meets new
// numbers; the answers are checked on 25 draws against textbook formulas written here, apart from
// the file, so a wrong formula in the bank shows up as a mismatch, not as the test copying the bug.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The stylesheet is not loaded here, so the drawing's colours fall back (as in autoVisual.test.ts).
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))
import katex from 'katex'
import { resetGlobals } from './helpers/globals'
import { readSource } from './helpers/repo'
import { isCorrect } from '../src/renderer/src/math/checkAnswer'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import { parsePQFile, type PQFile, type PQQuestion } from '../src/renderer/src/questions/pqjson'
import { drawVariables } from '../src/renderer/src/questions/variables'
import { evaluateInVariables } from '../src/renderer/src/questions/parts'
import { checkPlayedPart, HELD_BACK, playQuestion, showVisual, visualPlanFor, visualState, type PartAnswer, type PlayedPart } from '../src/renderer/src/questions/player'

const SETTINGS: MeasureSettings = { decimals: 4, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }

const renders = (tex: string, where: string): void => {
  expect(() => katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: 'ignore' }), `${where}: ${tex}`).not.toThrow()
}

let file: PQFile
beforeEach(() => {
  resetGlobals()
  file = parsePQFile(readSource('src/renderer/src/questions/bank/physics-mechanics.pqjson'))
})

const byId = (id: string): PQQuestion => file.questions.find((q) => q.id === id)!

/** Every part in this bank is a plain number part, so its right answer is just its field's value. */
const rightAnswer = (p: PlayedPart): PartAnswer => String(p.field!.value)

describe('the physics set parses and every question is fit to ship', () => {
  it('holds all 20 questions, every one CC BY 4.0 from PhysLab, on rung 2 or 3', () => {
    expect(file.questions).toHaveLength(20)
    for (const q of file.questions) {
      expect(q.license, q.title).toMatchObject({ id: 'CC BY 4.0', holder: 'PhysLab' })
      expect([2, 3], q.title).toContain(q.rung)
    }
    const ids = new Set(file.questions.map((q) => q.id))
    expect(ids.size).toBe(20)
  })

  it('tags each question by what it is about, one set per topic: motion, forces, energy, momentum (and friction)', () => {
    // Every tag two questions share becomes a Practice set (bank.ts bundledSets); "kinematics" on
    // the motion questions made a "Kinematics" set that repeated "Motion" almost question for question.
    const tags = new Set(file.questions.flatMap((q) => q.tags ?? []))
    expect([...tags].sort()).toEqual(['energy', 'forces', 'friction', 'momentum', 'motion'])
  })

  it('gives every question at least one named trap, on some part', () => {
    for (const q of file.questions) {
      const traps = q.parts.flatMap((p) => (p.type === 'number' ? (p.traps ?? []) : []))
      expect(traps.length, q.title).toBeGreaterThan(0)
    }
  })

  it('gives every question worked steps', () => {
    for (const q of file.questions) {
      expect(q.steps, q.title).toBeDefined()
      expect(q.steps!.items.length, q.title).toBeGreaterThan(0)
    }
  })

  it('gives every question an authored visual — never the auto-inferred fallback', () => {
    for (const q of file.questions) {
      expect(q.picture !== undefined || q.motion !== undefined, `${q.title} has neither a picture nor a motion field`).toBe(true)
      const played = playQuestion(q, 1, SETTINGS)
      const plan = visualPlanFor(played)
      expect(plan.source, q.title).toBe('authored')
    }
  })

  it('draws a picture of the physics, never a number line of the given numbers (the fallback, typed out by hand)', () => {
    // A number line with m = 2 kg and v = 10 m/s on one axis suggests the two can be compared;
    // it is what autoVisual draws when it can read nothing, so an author's picture must say more.
    for (const q of file.questions) {
      expect(q.picture?.kind, q.title).not.toBe('numberline')
      for (let seed = 1; seed <= 5; seed++) {
        const played = playQuestion(q, seed, SETTINGS)
        const plan = visualPlanFor(played)
        expect(showVisual(plan, played, SETTINGS, true), `${q.id} seed ${seed}`).toMatch(/\S/)
        // Before the answer, whatever holds none of it — or, when all of it does, a held-back sentence.
        if (visualState(plan, false) === 'ready') expect(showVisual(plan, played, SETTINGS, false), `${q.id} seed ${seed}`).toMatch(/\S/)
        else expect(() => showVisual(plan, played, SETTINGS, false), `${q.id} seed ${seed}`).toThrow(HELD_BACK)
      }
    }
  })

  it('plays every question on many seeds with no problem, every right answer marked right, every step and prompt through KaTeX', () => {
    for (const q of file.questions) {
      for (let seed = 1; seed <= 10; seed++) {
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
          for (const p of played.parts) {
            expect(isCorrect(checkPlayedPart(p, rightAnswer(p), played, SETTINGS)), `${q.id} ${seed} ${p.prompt}`).toBe(true)
          }
        }
      }
    }
  })
})

describe('no programming syntax in anything the student reads', () => {
  it('writes m₁g and u₁, never m1 g, u1 or v_f, in titles, statements, prompts, traps, step headings and picture labels', () => {
    for (const q of file.questions) {
      const words: string[] = [q.title, q.statement]
      for (const p of q.parts) {
        words.push(p.prompt)
        if (p.type === 'number') for (const t of p.traps ?? []) words.push(t.why)
      }
      for (const s of q.steps?.items ?? []) words.push(s.head)
      if (q.picture?.kind === 'vectors') words.push(...q.picture.items.map((it) => it.name))
      if (q.picture?.kind === 'curves') words.push(...q.picture.items.map((it) => it.label))
      for (const w of words) {
        // A chip ({m1}) becomes a number and its unit, so it is not what the student reads.
        const shown = w.replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, '')
        expect(shown, `${q.id}: ${w}`).not.toMatch(/_|\*|\^|\b[A-Za-z]+\d+\b/)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Steps as the student reads them, with the numbers in
// ---------------------------------------------------------------------------

/** Every step line of a question as played, numbers and units in (the worked level shows all of them). */
const playedSteps = (q: PQQuestion, seed: number): string[] =>
  playQuestion(q, seed, SETTINGS, 'worked')
    .working.moves.map((m) => m.tex)
    .filter((t): t is string => t !== undefined)

/** The `\mathrm{…}` groups of a LaTeX line with what stands between them, braces balanced. */
const mathrmRuns = (tex: string): { unit: string; start: number; end: number }[] => {
  const out: { unit: string; start: number; end: number }[] = []
  let at = tex.indexOf('\\mathrm{')
  while (at >= 0) {
    let depth = 0
    let i = at + '\\mathrm'.length
    for (; i < tex.length; i++) {
      if (tex[i] === '{') depth++
      else if (tex[i] === '}' && --depth === 0) break
    }
    out.push({ unit: tex.slice(at + '\\mathrm{'.length, i), start: at, end: i + 1 })
    at = tex.indexOf('\\mathrm{', i)
  }
  return out
}

describe('every step reads right once the numbers are in', () => {
  it('never puts a number where a fraction or a command wants a symbol: no {name} straight after a closing brace', () => {
    // substituteTex fills every {name} that is a variable. "\frac{a}{g}" played as
    // "\frac{a}9.8\,\mathrm{m/s^{2}}" — a over 9, then ".8 m/s²" — and KaTeX still renders it,
    // so only a look at the source catches it. "{{g}}" (a number on purpose) is fine.
    for (const q of file.questions) {
      const names = q.variables.map((v) => v.name).join('|')
      const loose = new RegExp(`\\}\\{(${names})\\}`)
      for (const s of q.steps?.items ?? []) {
        if (s.tex !== undefined) expect(s.tex, `${q.id}: ${s.tex}`).not.toMatch(loose)
        if (s.rule !== undefined) expect(s.rule, `${q.id} rule: ${s.rule}`).not.toMatch(loose)
      }
    }
  })

  it('never writes a unit twice in a row (a chip already brings its own)', () => {
    for (const q of file.questions) {
      for (const tex of playedSteps(q, 1)) {
        const runs = mathrmRuns(tex)
        for (let k = 1; k < runs.length; k++) {
          const between = tex.slice(runs[k - 1].end, runs[k].start).replace(/\\[ ,;!]|\s/g, '')
          expect(between === '' && runs[k].unit === runs[k - 1].unit, `${q.id}: ${tex}`).toBe(false)
        }
      }
    }
  })

  it('never sets two numbers side by side with only a space between them — "2 24 N" reads as 224', () => {
    for (const q of file.questions) {
      for (const tex of playedSteps(q, 1)) expect(tex, q.id).not.toMatch(/\d\s*(\\[ ,;])+\s*\d/)
    }
  })
})

// ---------------------------------------------------------------------------
// Known answers, worked by hand from the textbook formula (not from the file)
// ---------------------------------------------------------------------------

/** A part's answer formula, worked out in these values. */
const answer = (q: PQQuestion, part: number, v: Record<string, number>): number => evaluateInVariables((q.parts[part] as { answer: string }).answer, v)

/**
 * The values a pinned seed draws. Every variable is drawn from a range or a list, so a student
 * playing the set again meets new numbers; the seed below is the one that draws the textbook
 * numbers, and the test says so before it checks the answer worked by hand from them.
 */
const pinned = (q: PQQuestion, seed: number, want: Record<string, number>): Record<string, number> => {
  const drawn = drawVariables(q, seed)
  expect(drawn.problems, q.id).toEqual([])
  // The drawn numbers; a result the steps work out (I = V ÷ R) rides along as a formula variable.
  const drawnOnly = Object.fromEntries(Object.entries(drawn.values).filter(([k]) => k in want || q.variables.find((v) => v.name === k)?.def.kind !== 'expr'))
  expect(drawnOnly, q.id).toEqual(want)
  return drawn.values
}

describe('known answers — motion', () => {
  it('a car braking from 24 m/s to rest in 8 s travels 96 m, decelerating at 3 m/s²', () => {
    const q = byId('physlab-mechanics-braking-car')
    const v = pinned(q, 102, { v: 24, t: 8 })
    expect(answer(q, 0, v)).toBeCloseTo(96, 9)
    expect(answer(q, 1, v)).toBeCloseTo(-3, 9)
  })

  it('braking from 20 m/s in 12 s: 1 for the 120 m gets the plain message, 1.67 still gets the deceleration trap', () => {
    const q = byId('physlab-mechanics-braking-car')
    const played = playQuestion(q, 1, SETTINGS)
    const at = { ...played, variant: { ...played.variant, values: { v: 20, t: 12 } } }
    const distance = played.parts[0]
    expect(checkPlayedPart(distance, '120', at, SETTINGS).verdict).toBe('right')
    expect(checkPlayedPart(distance, '1', at, SETTINGS).message).toBe('Not quite. Press Hint to see the next step.')
    expect(checkPlayedPart(distance, '1.67', at, SETTINGS).message).toBe('That is the size of the deceleration, in m/s², not a distance.')
  })

  it('100 m at a steady 5 m/s takes 20 s', () => {
    const q = byId('physlab-mechanics-steady-speed')
    expect(answer(q, 0, pinned(q, 68, { v: 5, d: 100 }))).toBeCloseTo(20, 9)
  })

  it('a ball thrown up at 19.6 m/s (g = 9.8) takes 2 s to the top and rises 19.6 m', () => {
    const q = byId('physlab-mechanics-ball-thrown-up')
    const v = pinned(q, 13, { u: 19.6, g: 9.8 })
    expect(answer(q, 0, v)).toBeCloseTo(2, 9)
    expect(answer(q, 1, v)).toBeCloseTo(19.6, 9)
  })

  it('from rest at 2 m/s² for 5 s reaches 10 m/s and covers 25 m', () => {
    const q = byId('physlab-mechanics-from-rest')
    const v = pinned(q, 68, { a: 2, t: 5 })
    expect(answer(q, 0, v)).toBeCloseTo(10, 9)
    expect(answer(q, 1, v)).toBeCloseTo(25, 9)
  })

  it('a stone dropped from 44.1 m (g = 9.8) takes 3 s and lands at 29.4 m/s', () => {
    const q = byId('physlab-mechanics-stone-dropped')
    const v = pinned(q, 8, { h: 44.1, g: 9.8 })
    expect(answer(q, 0, v)).toBeCloseTo(3, 9)
    expect(answer(q, 1, v)).toBeCloseTo(29.4, 9)
  })
})

describe('known answers — forces', () => {
  it('F = 20 N on 4 kg gives 5 m/s²', () => {
    const q = byId('physlab-mechanics-newtons-second-law')
    expect(answer(q, 0, pinned(q, 15, { F: 20, m: 4, g: 9.8 }))).toBeCloseTo(5, 9)
  })

  it('an Atwood machine of 3 kg and 2 kg (g = 9.81) accelerates at 1.962 m/s² with a tension of 23.544 N', () => {
    const q = byId('physlab-mechanics-atwood-machine')
    const v = pinned(q, 19, { m1: 3, m2: 2, g: 9.81 })
    const a = answer(q, 0, v)
    const T = answer(q, 1, v)
    expect(a).toBeCloseTo(1.962, 9)
    expect(T).toBeCloseTo(23.544, 9)
    // Checked the other way too: Newton's second law for either block alone.
    expect(v.m1 * v.g - T).toBeCloseTo(v.m1 * a, 9)
    expect(T - v.m2 * v.g).toBeCloseTo(v.m2 * a, 9)
  })

  it('pulling a 10 kg crate with 50 N against μ = 0.3 (g = 9.8) gives 29.4 N of friction and 2.06 m/s²', () => {
    const q = byId('physlab-mechanics-friction-pull')
    const v = pinned(q, 152, { m: 10, F: 50, mu: 0.3, g: 9.8 })
    expect(answer(q, 0, v)).toBeCloseTo(29.4, 9)
    expect(answer(q, 1, v)).toBeCloseTo(2.06, 9)
  })

  it('a 25 N pull on a 2 kg front block + 3 kg back block accelerates at 5 m/s² with 15 N in the string', () => {
    const q = byId('physlab-mechanics-connected-blocks')
    const v = pinned(q, 253, { m1: 2, m2: 3, F: 25 })
    const a = answer(q, 0, v)
    const T = answer(q, 1, v)
    expect(a).toBeCloseTo(5, 9)
    // Only the string acts on the frictionless back block, so its tension is m2 · a — checked
    // the other way too, straight from Newton's second law on the back block alone.
    expect(T).toBeCloseTo(15, 9)
    expect(T).toBeCloseTo(v.m2 * a, 9)
  })

  it('sliding at 14 m/s and stopping in 20 m (g = 9.8) gives 4.9 m/s² and μ = 0.5', () => {
    const q = byId('physlab-mechanics-friction-from-sliding')
    const v = pinned(q, 13, { v: 14, s: 20, g: 9.8 })
    expect(answer(q, 0, v)).toBeCloseTo(4.9, 9)
    expect(answer(q, 1, v)).toBeCloseTo(0.5, 9)
  })
})

describe('known answers — energy', () => {
  it('2 kg at 10 m/s has 100 J of kinetic energy', () => {
    const q = byId('physlab-mechanics-kinetic-energy')
    expect(answer(q, 0, pinned(q, 117, { m: 2, v: 10 }))).toBeCloseTo(100, 9)
  })

  it('1 kg falling 4.9 m (g = 9.8) loses 48.02 J of potential energy and lands at 9.8 m/s', () => {
    const q = byId('physlab-mechanics-falling-energy')
    const v = pinned(q, 12, { m: 1, h: 4.9, g: 9.8 })
    expect(answer(q, 0, v)).toBeCloseTo(48.02, 9)
    expect(answer(q, 1, v)).toBeCloseTo(9.8, 9)
  })

  it('24 N over 4 m on a 3 kg block does 96 J of work and reaches 8 m/s', () => {
    const q = byId('physlab-mechanics-work-energy-theorem')
    const v = pinned(q, 556, { F: 24, m: 3, d: 4 })
    expect(answer(q, 0, v)).toBeCloseTo(96, 9)
    expect(answer(q, 1, v)).toBeCloseTo(8, 9)
  })

  it('500 J in 25 s is 20 W', () => {
    const q = byId('physlab-mechanics-power')
    expect(answer(q, 0, pinned(q, 14, { W: 500, t: 25 }))).toBeCloseTo(20, 9)
  })

  it('a spring of k = 200 N/m stretched 0.3 m stores 9 J', () => {
    const q = byId('physlab-mechanics-spring-energy')
    expect(answer(q, 0, pinned(q, 84, { k: 200, x: 0.3 }))).toBeCloseTo(9, 9)
  })
})

describe('known answers — momentum', () => {
  it('a 1500 kg car at 20 m/s has 30 000 kg·m/s of momentum', () => {
    const q = byId('physlab-mechanics-momentum')
    expect(answer(q, 0, pinned(q, 145, { m: 1500, v: 20 }))).toBeCloseTo(30000, 9)
  })

  it('2 kg at 6 m/s sticking to a stationary 3 kg gives a common speed of 2.4 m/s', () => {
    const q = byId('physlab-mechanics-inelastic-collision')
    expect(answer(q, 0, pinned(q, 93, { m1: 2, u1: 6, m2: 3 }))).toBeCloseTo(2.4, 9)
  })

  it('50 N for 0.4 s on a 10 kg trolley from rest reaches 2 m/s', () => {
    const q = byId('physlab-mechanics-impulse')
    expect(answer(q, 0, pinned(q, 201, { m: 10, F: 50, t: 0.4 }))).toBeCloseTo(2, 9)
  })

  it('a 0.02 kg dart at 400 m/s recoils a 5 kg gun at 1.6 m/s', () => {
    const q = byId('physlab-mechanics-recoil')
    expect(answer(q, 0, pinned(q, 381, { M: 5, m: 0.02, v: 400 }))).toBeCloseTo(1.6, 9)
  })

  it('4 kg at 5 m/s meeting 6 kg at 3 m/s the other way gives a common velocity of 0.2 m/s', () => {
    const q = byId('physlab-mechanics-two-body-collision')
    expect(answer(q, 0, pinned(q, 1085, { m1: 4, u1: 5, m2: 6, u2: 3 }))).toBeCloseTo(0.2, 9)
  })
})

// ---------------------------------------------------------------------------
// Fresh numbers every time, and every one of them still right
// ---------------------------------------------------------------------------

type V = Record<string, number>

/**
 * Each part's answer from the textbook formula, written here in plain TypeScript so a slip in the
 * file's mathjs shows up as a mismatch on some draw.
 */
const TEXTBOOK: Record<string, ((v: V) => number)[]> = {
  'braking-car': [(v) => (v.v / 2) * v.t, (v) => (0 - v.v) / v.t],
  'steady-speed': [(v) => v.d / v.v],
  'ball-thrown-up': [(v) => v.u / v.g, (v) => (v.u * v.u) / (2 * v.g)],
  'from-rest': [(v) => v.a * v.t, (v) => 0.5 * v.a * v.t * v.t],
  'stone-dropped': [(v) => Math.sqrt((2 * v.h) / v.g), (v) => Math.sqrt(2 * v.g * v.h)],
  'newtons-second-law': [(v) => v.F / v.m],
  'atwood-machine': [(v) => ((v.m1 - v.m2) * v.g) / (v.m1 + v.m2), (v) => v.m2 * (v.g + ((v.m1 - v.m2) * v.g) / (v.m1 + v.m2))],
  'friction-pull': [(v) => v.mu * v.m * v.g, (v) => (v.F - v.mu * v.m * v.g) / v.m],
  'connected-blocks': [(v) => v.F / (v.m1 + v.m2), (v) => (v.m2 * v.F) / (v.m1 + v.m2)],
  'friction-from-sliding': [(v) => (v.v * v.v) / (2 * v.s), (v) => (v.v * v.v) / (2 * v.s) / v.g],
  'kinetic-energy': [(v) => 0.5 * v.m * v.v * v.v],
  'falling-energy': [(v) => v.m * v.g * v.h, (v) => Math.sqrt((2 * v.m * v.g * v.h) / v.m)],
  'work-energy-theorem': [(v) => v.F * v.d, (v) => Math.sqrt((2 * v.F * v.d) / v.m)],
  power: [(v) => v.W / v.t],
  'spring-energy': [(v) => 0.5 * v.k * v.x * v.x],
  momentum: [(v) => v.m * v.v],
  'inelastic-collision': [(v) => (v.m1 * v.u1) / (v.m1 + v.m2)],
  impulse: [(v) => (v.F * v.t) / v.m],
  recoil: [(v) => (v.m * v.v) / v.M],
  'two-body-collision': [(v) => (v.m1 * v.u1 - v.m2 * v.u2) / (v.m1 + v.m2)]
}

const SEEDS = Array.from({ length: 25 }, (_, k) => k + 1)

describe('every play draws new numbers, and every answer is still the textbook one', () => {
  it('has a textbook formula here for every part of every question', () => {
    for (const q of file.questions) expect(TEXTBOOK[q.id.replace('physlab-mechanics-', '')]?.length, q.id).toBe(q.parts.length)
  })

  it('draws more than one set of numbers for every question, and varies every variable but g', () => {
    for (const q of file.questions) {
      const draws = SEEDS.map((seed) => drawVariables(q, seed).values)
      expect(new Set(draws.map((v) => JSON.stringify(v))).size, q.id).toBeGreaterThanOrEqual(3)
      for (const { name } of q.variables) {
        if (name === 'g') continue
        expect(new Set(draws.map((v) => v[name])).size, `${q.id} ${name}`).toBeGreaterThan(1)
      }
    }
  })

  it('gives the thrown ball and the dropped stone many launch speeds and heights, not a handful', () => {
    // g stays put, so each has one variable only: a short list made a replay meet the same
    // numbers again and again (seeds 1, 2 and 3 all threw at 24.5 m/s and dropped from 122.5 m).
    const seen = (id: string, name: string, seeds: number[]): number =>
      new Set(seeds.map((seed) => drawVariables(byId(id), seed).values[name])).size
    const many = Array.from({ length: 200 }, (_, k) => k + 1)
    expect(seen('physlab-mechanics-ball-thrown-up', 'u', many)).toBeGreaterThanOrEqual(20)
    expect(seen('physlab-mechanics-stone-dropped', 'h', many)).toBeGreaterThanOrEqual(15)
    expect(seen('physlab-mechanics-ball-thrown-up', 'u', SEEDS)).toBeGreaterThanOrEqual(10)
    expect(seen('physlab-mechanics-stone-dropped', 'h', SEEDS)).toBeGreaterThanOrEqual(10)
    expect(seen('physlab-mechanics-ball-thrown-up', 'u', [1, 2, 3])).toBe(3)
  })

  it('keeps every named trap well clear of the answer for every launch speed and height in the lists', () => {
    // A stone dropped from 19.6 m lands after 2 s, and h / g is 2 as well: that trap would be marked
    // right. Every item is checked, not only the ones seeds 1–25 happen to draw.
    for (const id of ['physlab-mechanics-ball-thrown-up', 'physlab-mechanics-stone-dropped']) {
      const q = byId(id)
      const own = q.variables.find((v) => v.name !== 'g')!
      const g = q.variables.find((v) => v.name === 'g')!
      if (own.def.kind !== 'list' || g.def.kind !== 'list') throw new Error(`${id}: expected lists`)
      for (const item of own.def.items) {
        const values = { [own.name]: Number(item), g: Number(g.def.items[0]) }
        q.parts.forEach((p, k) => {
          if (p.type !== 'number') return
          const want = answer(q, k, values)
          for (const trap of p.traps ?? []) {
            const off = Math.abs(evaluateInVariables(trap.value, values) - want) / Math.abs(want)
            expect(off, `${id} ${own.name} = ${item}: trap ${trap.value}`).toBeGreaterThan(0.1)
          }
        })
      }
    }
  })

  it('keeps g fixed at the value the question states', () => {
    for (const q of file.questions) {
      const g = q.variables.find((v) => v.name === 'g')
      if (g) expect(g.def.kind === 'list' && g.def.items.length === 1, q.id).toBe(true)
    }
  })

  it('works out every part on seeds 1–25 to the textbook formula', () => {
    for (const q of file.questions) {
      const formulas = TEXTBOOK[q.id.replace('physlab-mechanics-', '')]
      for (const seed of SEEDS) {
        const drawn = drawVariables(q, seed)
        expect(drawn.problems, `${q.id} seed ${seed}`).toEqual([])
        formulas.forEach((f, k) => {
          const want = f(drawn.values)
          expect(Number.isFinite(want) && want !== 0, `${q.id} seed ${seed} part ${k}`).toBe(true)
          expect(Math.abs(answer(q, k, drawn.values) - want), `${q.id} seed ${seed} part ${k}`).toBeLessThan(1e-9 * Math.max(1, Math.abs(want)))
        })
      }
    }
  })

  it('keeps the physics sensible on every draw: a heavier side that falls, a pull that beats friction, μ between 0.1 and 0.8', () => {
    for (const seed of SEEDS) {
      const at = byId('physlab-mechanics-atwood-machine')
      const a = drawVariables(at, seed).values
      expect(a.m1, `Atwood seed ${seed}`).toBeGreaterThan(a.m2)
      const p = drawVariables(byId('physlab-mechanics-friction-pull'), seed).values
      expect(p.F - p.mu * p.m * p.g, `pull seed ${seed}`).toBeGreaterThanOrEqual(5)
      const s = drawVariables(byId('physlab-mechanics-friction-from-sliding'), seed).values
      const mu = (s.v * s.v) / (2 * s.s * s.g)
      expect(mu >= 0.1 && mu <= 0.8, `sliding seed ${seed}: μ = ${mu}`).toBe(true)
      const c = drawVariables(byId('physlab-mechanics-inelastic-collision'), seed).values
      expect(c.m1, `stick seed ${seed}`).not.toBe(c.m2)
    }
  })

  it('marks every named trap wrong on every one of those draws, not only the first', () => {
    for (const q of file.questions) {
      for (const seed of SEEDS) {
        const played = playQuestion(q, seed, SETTINGS)
        for (const p of played.parts) {
          if (p.part.type !== 'number') continue
          for (const trap of p.part.traps ?? []) {
            const value = evaluateInVariables(trap.value, played.variant.values)
            expect(isCorrect(checkPlayedPart(p, String(value), played, SETTINGS)), `${q.id} seed ${seed} trap ${trap.value} = ${value}`).toBe(false)
          }
        }
      }
    }
  })

  it('lets the trolleys move off either way, and names a dropped or flipped sign with its own reason', () => {
    const q = byId('physlab-mechanics-two-body-collision')
    const signs = new Set<number>()
    for (const seed of SEEDS) {
      const played = playQuestion(q, seed, SETTINGS)
      const want = TEXTBOOK['two-body-collision'][0](played.variant.values)
      signs.add(Math.sign(want))
      // The same size the other way: never the answer (the momenta differ by at least 2), and
      // marked wrong with the trolleys' own "which way" reason, not the general sentence.
      const c = checkPlayedPart(played.parts[0], String(-want), played, SETTINGS)
      expect(isCorrect(c), `seed ${seed}: ${-want}`).toBe(false)
      expect(c.message, `seed ${seed}`).toMatch(/points the wrong way/)
    }
    expect([...signs].sort(), 'both directions are drawn on seeds 1–25').toEqual([-1, 1])
    // Seed 1 draws 6 kg at 2 m/s meeting 5 kg at 6 m/s the other way: v = (12 − 30) / 11 = −1.636 m/s.
    const one = pinned(q, 1, { m1: 6, u1: 2, m2: 5, u2: 6 })
    expect(answer(q, 0, one)).toBeCloseTo(-18 / 11, 9)
  })

  it('reads every step right on every one of those draws', () => {
    for (const q of file.questions) {
      for (const seed of SEEDS) {
        for (const tex of playedSteps(q, seed)) {
          expect(tex, `${q.id} seed ${seed}`).not.toMatch(/\d\s*(\\[ ,;])+\s*\d/)
          renders(tex, `${q.id} seed ${seed}`)
        }
      }
    }
  })
})

// ===========================================================================
// QP2: the second PhysLab physics set — circuits, gases, waves, rotation.
// Same discipline as QP1 above (CC BY 4.0, rung 2 or 3, a trap, worked steps,
// an authored visual, a fixed-seed known answer, and a textbook formula checked
// on 25 fresh draws), in its own describe blocks against the second bank file.
// ===========================================================================

import { conditionHolds } from '../src/renderer/src/questions/variables'
import { formatQuantity } from '../src/renderer/src/questions/units'
import { picturePlan, type Played } from '../src/renderer/src/questions/player'
import { compileScalar } from '../src/renderer/src/math/expr'
import { planDrawing } from '../src/renderer/src/math/vectorSolver'
import type { VariableDef } from '../src/renderer/src/questions/pqjson'

let file2: PQFile
beforeEach(() => {
  file2 = parsePQFile(readSource('src/renderer/src/questions/bank/physics-fields.pqjson'))
})

const byId2 = (id: string): PQQuestion => file2.questions.find((q) => q.id === id)!

/** Every value one variable can be drawn as: a range walked step by step (less what it excludes), or its list. */
const choicesOf = (def: VariableDef): number[] => {
  if (def.kind === 'list') return [...def.items]
  if (def.kind !== 'range') throw new Error('this set draws every variable from a range or a list')
  const out: number[] = []
  const n = Math.round((def.to - def.from) / def.step)
  for (let k = 0; k <= n; k++) {
    const v = Number((def.from + k * def.step).toPrecision(12))
    if (!(def.exclude ?? []).some((x) => Math.abs(x - v) < 1e-9)) out.push(v)
  }
  return out
}

/**
 * Every set of numbers a student can meet: every combination of every variable's values that
 * passes the question's condition. A few hundred at most, so the checks below walk all of them
 * rather than trusting 25 seeds to find the one bad draw (a trap equal to the answer at R = V).
 * A formula variable (the spanner's distance in metres, from its centimetres) is worked out from
 * the ones drawn before it, as the player does.
 */
const everyDraw = (q: PQQuestion): Record<string, number>[] => {
  let rows: Record<string, number>[] = [{}]
  for (const v of q.variables) {
    const def = v.def
    rows =
      def.kind === 'expr'
        ? rows.map((r) => ({ ...r, [v.name]: evaluateInVariables(def.expr, r) }))
        : rows.flatMap((r) => choicesOf(def).map((x) => ({ ...r, [v.name]: x })))
  }
  const c = q.condition
  return c === undefined ? rows : rows.filter((r) => conditionHolds(c.when, r) === true)
}

/** A played question with exactly these numbers, for the parts of the player that read only the question and its values. */
const playedWith = (q: PQQuestion, values: Record<string, number>): Played => ({ question: q, variant: { seed: 0, values, problems: [] } }) as unknown as Played

/** The app's own default precision (store.ts): two decimal places. */
const TWO_DP: MeasureSettings = { ...SETTINGS, decimals: 2 }

describe('QP2 — the second physics set parses and every question is fit to ship', () => {
  it('holds all 20 questions, every one CC BY 4.0 from PhysLab, on rung 2 or 3', () => {
    expect(file2.questions).toHaveLength(20)
    for (const q of file2.questions) {
      expect(q.license, q.title).toMatchObject({ id: 'CC BY 4.0', holder: 'PhysLab' })
      expect([2, 3], q.title).toContain(q.rung)
    }
    const ids = new Set(file2.questions.map((q) => q.id))
    expect(ids.size).toBe(20)
  })

  it('tags each question by what it is about, one set per topic: circuits, gases, waves, rotation', () => {
    const tags = new Set(file2.questions.flatMap((q) => q.tags ?? []))
    expect([...tags].sort()).toEqual(['circuits', 'gases', 'rotation', 'waves'])
    for (const topic of ['circuits', 'gases', 'waves', 'rotation']) {
      expect(file2.questions.filter((q) => q.tags?.includes(topic)), topic).toHaveLength(5)
    }
  })

  it('gives every question at least one named trap, on some part', () => {
    for (const q of file2.questions) {
      const traps = q.parts.flatMap((p) => (p.type === 'number' ? (p.traps ?? []) : []))
      expect(traps.length, q.title).toBeGreaterThan(0)
    }
  })

  it('gives every question worked steps', () => {
    for (const q of file2.questions) {
      expect(q.steps, q.title).toBeDefined()
      expect(q.steps!.items.length, q.title).toBeGreaterThan(0)
    }
  })

  it('gives every question an authored visual — never the auto-inferred fallback', () => {
    for (const q of file2.questions) {
      expect(q.picture !== undefined || q.motion !== undefined, `${q.title} has neither a picture nor a motion field`).toBe(true)
      const played = playQuestion(q, 1, SETTINGS)
      const plan = visualPlanFor(played)
      expect(plan.source, q.title).toBe('authored')
    }
  })

  it('draws a picture of the physics, never a number line of the given numbers, and shows something on five seeds', () => {
    for (const q of file2.questions) {
      expect(q.picture?.kind, q.title).not.toBe('numberline')
      for (let seed = 1; seed <= 5; seed++) {
        const played = playQuestion(q, seed, SETTINGS)
        const plan = visualPlanFor(played)
        expect(showVisual(plan, played, SETTINGS, true), `${q.id} seed ${seed}`).toMatch(/\S/)
        // Before the answer, whatever holds none of it — or, when all of it does, a held-back sentence.
        if (visualState(plan, false) === 'ready') expect(showVisual(plan, played, SETTINGS, false), `${q.id} seed ${seed}`).toMatch(/\S/)
        else expect(() => showVisual(plan, played, SETTINGS, false), `${q.id} seed ${seed}`).toThrow(HELD_BACK)
      }
    }
  })

  it('plays every question on many seeds with no problem, every right answer marked right, every step and prompt through KaTeX', () => {
    for (const q of file2.questions) {
      for (let seed = 1; seed <= 10; seed++) {
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
          for (const p of played.parts) {
            expect(isCorrect(checkPlayedPart(p, rightAnswer(p), played, SETTINGS)), `${q.id} ${seed} ${p.prompt}`).toBe(true)
          }
        }
      }
    }
  })
})

describe('QP2 — no programming syntax in anything the student reads', () => {
  it('writes plain words, never R1, V2 or lam, in titles, statements, prompts, traps, step headings and picture labels', () => {
    for (const q of file2.questions) {
      const words: string[] = [q.title, q.statement]
      for (const p of q.parts) {
        words.push(p.prompt)
        if (p.type === 'number') for (const t of p.traps ?? []) words.push(t.why)
      }
      for (const s of q.steps?.items ?? []) words.push(s.head)
      if (q.picture?.kind === 'vectors') words.push(...q.picture.items.map((it) => it.name))
      if (q.picture?.kind === 'curves') words.push(...q.picture.items.map((it) => it.label))
      if (q.picture?.kind === 'between' && q.picture.label) words.push(q.picture.label)
      for (const w of words) {
        const shown = w.replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, '')
        expect(shown, `${q.id}: ${w}`).not.toMatch(/_|\*|\^|\b[A-Za-z]+\d+\b/)
      }
    }
  })
})

describe('QP2 — every given number reads true at the precision a student actually has', () => {
  // The app starts at 2 d.p. At that precision a volume of 0.005 m³ used to print as "0.01 m³"
  // (so a student worked Boyle's law from the wrong volume and was marked wrong), and 0.004 m³
  // went scientific as "4×10^-3", a caret in a sentence.
  const PRECISIONS: MeasureSettings[] = [TWO_DP, { ...SETTINGS, decimals: 3, precisionMode: 'sf' }]

  it('prints every value every variable can be drawn as plainly and exactly, at 2 d.p. and at 3 s.f.', () => {
    for (const s of PRECISIONS) {
      for (const q of file2.questions) {
        const read = [q.statement, ...q.parts.map((p) => p.prompt)].join(' ')
        for (const v of q.variables) {
          // A result the steps work out (I = 12 V ÷ 7 Ω = 1.71 A) is rounded like any result; only
          // a number the question gives the student must read exactly.
          if (v.def.kind === 'expr' && !read.includes(`{${v.name}}`)) continue
          const values = new Set(everyDraw(q).map((row) => row[v.name]))
          for (const x of values) {
            const text = formatQuantity(x, v.unit ?? 'none', s)
            const num = text.split(' ')[0]
            expect(num, `${q.id} ${v.name} = ${x} at ${s.decimals} ${s.precisionMode}: ${text}`).toMatch(/^−?\d+(\.\d+)?$/)
            expect(Number(num.replace('−', '-')), `${q.id} ${v.name} at ${s.decimals} ${s.precisionMode}: ${text}`).toBe(x)
          }
        }
      }
    }
  })

  it('writes no caret or power of ten into a statement or a picture label, on any draw, at 2 d.p.', () => {
    for (const q of file2.questions) {
      for (const seed of SEEDS) {
        const played = playQuestion(q, seed, TWO_DP)
        for (const line of played.statement) {
          for (const seg of line) if ('text' in seg) expect(seg.text, `${q.id} seed ${seed}`).not.toMatch(/\^|×\s*10/)
        }
      }
      for (const values of everyDraw(q)) {
        const plan = picturePlan(q.picture!, playedWith(q, values), TWO_DP)
        const labels = plan.kind === 'curves' ? plan.items.map((it) => it.label) : plan.kind === 'between' && plan.label ? [plan.label] : []
        for (const l of labels) expect(l, `${q.id} ${JSON.stringify(values)}`).not.toMatch(/\^|×\s*10/)
      }
    }
  })
})

describe('QP2 — every picture draws the physics its label describes', () => {
  /** The picture's curves, bound to these numbers, as functions of x (radians, as the drawing works). */
  const curvesOf = (q: PQQuestion, values: Record<string, number>): { f: (x: number) => number; from: number; to: number }[] => {
    const plan = picturePlan(q.picture!, playedWith(q, values), SETTINGS)
    if (plan.kind !== 'curves') throw new Error(`${q.id} is not drawn as curves`)
    return plan.items.map((it) => {
      const f = compileScalar(it.expr, ['x'], () => ({}))
      return { f: (x: number) => f({ x }), from: it.from!, to: it.to! }
    })
  }

  it('the ideal gas: an isotherm through the gas’s own pressure and volume, never a shaded area that is not the answer', () => {
    // A shaded P × V rectangle came with "the shaded region is the one whose area you are
    // finding", but the part asks for moles, not P·V in joules.
    const q = byId2('physlab-fields-ideal-gas-moles')
    expect(q.picture?.kind).toBe('curves')
    for (const v of everyDraw(q)) {
      const [c] = curvesOf(q, v)
      const litres = 1000 * v.V
      expect(c.from < litres && litres < c.to, JSON.stringify(v)).toBe(true)
      // Pressure in tens of kilopascals at the gas's own volume in litres is its own pressure.
      expect(c.f(litres), JSON.stringify(v)).toBeCloseTo(v.P / 1e4, 9)
      // Boyle's law along it: pressure × volume is the same everywhere, n·R·T.
      for (const x of [c.from, (c.from + c.to) / 2, c.to]) expect((c.f(x) * 1e4 * x) / 1000, JSON.stringify(v)).toBeCloseTo(answer(q, 0, v) * 8.314 * v.T, 6)
    }
    const played = playQuestion(q, 1, SETTINGS)
    const note = showVisual(visualPlanFor(played), played, SETTINGS, false)
    expect(note).not.toMatch(/area/)
    expect(note).toMatch(/kept at \d+ K/)
  })

  it('reads each answer off its picture, in the scale the label names, on every draw', () => {
    // The pictures are drawn in scaled units so both axes can be read (tenths of an amp, litres,
    // tens of kilopascals, tens of kelvin, hundreds of metres); a wrong factor of 10 in a formula
    // would still draw a tidy picture, so each is checked against the question's own answer.
    const planOf = (id: string, v: Record<string, number>) => picturePlan(byId2(`physlab-fields-${id}`).picture!, playedWith(byId2(`physlab-fields-${id}`), v), SETTINGS)
    const endOf = (id: string, v: Record<string, number>, item = 0): { x: number; y: number } => {
      const c = curvesOf(byId2(`physlab-fields-${id}`), v)[item]
      return { x: c.to, y: c.f(c.to) }
    }
    const each = (id: string, check: (v: Record<string, number>, ans: (part: number) => number) => void): void => {
      const q = byId2(`physlab-fields-${id}`)
      const draws = everyDraw(q)
      expect(draws.length, id).toBeGreaterThan(0)
      for (const v of draws) check(v, (part) => answer(q, part, v))
    }
    const close = (got: number, want: number, where: string): void => {
      expect(Math.abs(got - want), `${where}: ${got} against ${want}`).toBeLessThan(1e-9 * Math.max(1, Math.abs(want)))
    }
    for (const id of ['series-resistors', 'parallel-resistors']) {
      each(id, (v, ans) => {
        close(endOf(id, v).x / 10, ans(1), `${id} current`)
        close(endOf(id, v).y, v.V, `${id} voltage`)
      })
    }
    each('ohms-law-power', (v, ans) => {
      close(endOf('ohms-law-power', v).x / 10, ans(0), 'current')
      close(endOf('ohms-law-power', v).y, v.V, 'voltage')
    })
    for (const id of ['joule-heating', 'work-done-by-gas']) {
      each(id, (v, ans) => {
        const plan = planOf(id, v)
        if (plan.kind !== 'between') throw new Error(`${id} is not a shaded region`)
        const height = compileScalar(plan.upper, ['x'], () => ({}))({ x: 0 })
        close(height * (plan.to - plan.from), ans(0), `${id} area in joules`)
      })
    }
    each('boyles-law', (v) => close(endOf('boyles-law', v).y * 1e4, v.P1, 'starting pressure'))
    each('boyles-law', (v, ans) => close(curvesOf(byId2('physlab-fields-boyles-law'), v)[0].f(1000 * v.V2) * 1e4, ans(0), 'squeezed pressure'))
    each('charles-law', (v, ans) => close(endOf('charles-law', v, 1).y / 1000, ans(0), 'warmed volume'))
    each('charles-law', (v) => close(endOf('charles-law', v, 1).x * 10, v.T2, 'final temperature'))
    each('pressure-law', (v, ans) => close(endOf('pressure-law', v, 1).y * 1e4, ans(0), 'heated pressure'))
    each('period-frequency', (v, ans) => close(endOf('period-frequency', v).x / 4, ans(0), 'four periods'))
    each('echo-distance', (v, ans) => close(endOf('echo-distance', v, 0).y * 100, ans(0), 'distance to the cliff'))
    each('echo-distance', (v) => close(endOf('echo-distance', v, 1).y, 0, 'the echo is back'))
    each('beat-frequency', (v, ans) => {
      const [c] = curvesOf(byId2('physlab-fields-beat-frequency'), v)
      // Two beats: loud at 0, silent at half a beat period, loud again after one, and at the end.
      close(c.to * ans(0), 2, 'two beats drawn')
      close(c.f(1 / ans(0)), c.f(0), 'loud again after one beat')
      expect(c.f(0.5 / ans(0)), 'silent halfway through a beat').toBeLessThan(1e-9)
    })
    each('period-of-rotation', (v, ans) => {
      close(endOf('period-of-rotation', v).x, ans(0), 'one period')
      close(endOf('period-of-rotation', v).y, 1, 'one whole lap')
    })
    const arrow = (id: string, v: Record<string, number>, name: string): number[] => {
      const plan = planOf(id, v)
      if (plan.kind !== 'vectors') throw new Error(`${id} is not drawn in arrows`)
      return [...plan.items.find((it) => it.name === name)!.v]
    }
    each('angular-velocity', (v, ans) => close(arrow('angular-velocity', v, 'v')[1] / arrow('angular-velocity', v, 'r')[0], ans(0), 'v ÷ r'))
  })

  it('draws the rotation arrows from what the question gives, never an answer arrow the student could read the answer off', () => {
    // An authored picture can be opened before the part is answered, and the player holds back
    // only a shaded area's and a tangent's values (S-Q decision 12). The torque picture was a line
    // ending at τ, and the centripetal pictures had an a or F arrow labelled with its size — the
    // answer. A result arrow drawn beside two inputs also took a colour mixed from them, as if a
    // were built from r and v the way a vector sum is. Every arrow is now a given quantity.
    const gives = (q: PQQuestion, values: Record<string, number>): number[] => q.variables.filter((x) => x.def.kind !== 'expr').map((x) => values[x.name])
    const len = (c: readonly number[]): number => Math.hypot(c[0], c[1], c[2])
    for (const q of file2.questions) {
      if (q.picture?.kind !== 'vectors') continue
      for (const values of everyDraw(q)) {
        const plan = picturePlan(q.picture, playedWith(q, values), SETTINGS)
        if (plan.kind !== 'vectors') throw new Error(`${q.id} is not drawn in arrows`)
        // Drawn exactly as the player draws it: no result arrow, so nothing is coloured as a mix.
        const drawing = planDrawing({ vectors: plan.items.map((it) => ({ name: it.name, v: it.v, tail: it.tail, role: it.role })), mode: 'common-tail' })
        for (const it of drawing.items) if (it.kind === 'arrow') expect(it.role, `${q.id}: ${it.name}`).toBe('input')
        for (const it of plan.items) {
          const size = len(it.v)
          expect(
            gives(q, values).some((g) => Math.abs(g - size) < 1e-9),
            `${q.id} ${JSON.stringify(values)}: ${it.name} is ${size} long, which the question does not give`
          ).toBe(true)
        }
      }
    }
    // The centripetal pictures: −r runs from the object to the centre, the way a and F point, and v is along the circle.
    for (const id of ['centripetal-acceleration', 'centripetal-force']) {
      const q = byId2(`physlab-fields-${id}`)
      for (const values of everyDraw(q)) {
        const plan = picturePlan(q.picture!, playedWith(q, values), SETTINGS)
        if (plan.kind !== 'vectors') throw new Error(`${id} is not drawn in arrows`)
        const inward = plan.items.find((it) => it.name === '−r')!
        const along = plan.items.find((it) => it.name === 'v')!
        expect(inward.tail, id).toEqual([values.r, 0, 0])
        expect(inward.tail![0] + inward.v[0], `${id}: −r ends at the centre`).toBe(0)
        expect(along.tail, id).toEqual(inward.tail)
        expect(inward.v[0] * along.v[0] + inward.v[1] * along.v[1], `${id}: v is at right angles to the radius`).toBe(0)
        expect(plan.items.map((it) => it.name).sort(), id).toEqual(['v', '−r'])
      }
    }
    // The spanner: r out from the bolt in centimetres, as the question gives it, and F pushing at right angles at its end.
    const spanner = byId2('physlab-fields-torque')
    for (const values of everyDraw(spanner)) {
      const plan = picturePlan(spanner.picture!, playedWith(spanner, values), SETTINGS)
      if (plan.kind !== 'vectors') throw new Error('the torque picture is not drawn in arrows')
      const [r, F] = plan.items
      expect([r.name, F.name]).toEqual(['r', 'F'])
      expect(r.v, JSON.stringify(values)).toEqual([values.d, 0, 0])
      expect(F.tail, JSON.stringify(values)).toEqual([values.d, 0, 0])
      expect(F.v, JSON.stringify(values)).toEqual([0, -values.F, 0])
      // Neither arrow is the torque, in newton metres or in newton centimetres.
      for (const it of plan.items) {
        expect(Math.abs(len(it.v) - values.F * values.r), JSON.stringify(values)).toBeGreaterThan(1e-9)
        expect(Math.abs(len(it.v) - values.F * values.d), JSON.stringify(values)).toBeGreaterThan(1e-9)
      }
    }
  })

  it('the spanner: its distance is given in centimetres and worked in metres, and the centimetre slip is a named trap', () => {
    const q = byId2('physlab-fields-torque')
    for (const values of everyDraw(q)) {
      expect(values.r, JSON.stringify(values)).toBe(values.d / 100)
      expect(answer(q, 0, values), JSON.stringify(values)).toBeCloseTo(values.F * (values.d / 100), 12)
    }
    const traps = (q.parts[0] as { traps?: { value: string }[] }).traps!.map((t) => t.value)
    expect(traps).toContain('F * d')
    const played = playQuestion(q, 1, SETTINGS, 'worked')
    const texts = played.working.moves.map((m) => m.tex ?? '').join(' ')
    // r = 30 cm = 0.3 m, with the drawn numbers in.
    const v = played.variant.values
    expect(texts).toContain(formatQuantity(v.d, 'cm', SETTINGS).split(' ')[0])
    expect(texts).toContain(formatQuantity(v.r, 'm', SETTINGS).split(' ')[0])
  })

  it('the potential divider: the voltage across the second resistor bends over as that resistor grows, ending on the answer', () => {
    // V₂ = Vin·x/(R₁ + x). The picture used to hold the bottom at the final R₁ + R₂, a straight
    // line that agreed only at its two ends and taught a relationship that is not true.
    const q = byId2('physlab-fields-potential-divider')
    for (const v of everyDraw(q)) {
      const [c] = curvesOf(q, v)
      expect(c.from).toBe(0)
      expect(c.to).toBe(v.R2)
      expect(c.f(0)).toBe(0)
      expect(c.f(v.R2), JSON.stringify(v)).toBeCloseTo(answer(q, 0, v), 9)
      // Concave: halfway along, the curve is above the straight chord from (0, 0) to (R₂, V₂).
      expect(c.f(v.R2 / 2), JSON.stringify(v)).toBeGreaterThan(answer(q, 0, v) / 2 + 1e-9)
      expect(c.f(v.R2 / 2), JSON.stringify(v)).toBeCloseTo((v.Vin * v.R2) / 2 / (v.R1 + v.R2 / 2), 9)
    }
  })
})

describe('QP2 — every picture can be read at the size the camera frames it', () => {
  // frameGraphs (core/visualize.ts) frames a question's graphs with the origin; a picture of
  // arrows is framed on its arrows, and each one here starts at the origin or is joined to it by
  // the radius. CameraRig then picks one zoom for both axes, never below 2 px a unit. Pictures
  // that mixed scales collapsed under that one zoom: Boyle's law was an empty grid with its curve
  // on the y-axis, the echo a 1 px sliver, the beats 25 cycles in 10 px. Each picture is now in
  // quantities scaled so its width and height (with the origin) are within 10× of each other.
  // The reviewer's canvas, and a shorter one: the Console docked under the viewport leaves
  // about 600 × 380 px, where a region 150 kPa tall overflowed under the 2 px floor.
  const CANVASES = [
    { w: 716, h: 554 },
    { w: 600, h: 380 }
  ]

  const boxOf = (q: PQQuestion, values: Record<string, number>): { w: number; h: number } => {
    const plan = picturePlan(q.picture!, playedWith(q, values), SETTINGS)
    const xs = [0]
    const ys = [0]
    const sample = (expr: string, a: number, b: number): void => {
      const f = compileScalar(expr, ['x'], () => ({}))
      for (let i = 0; i <= 64; i++) {
        const x = a + ((b - a) * i) / 64
        const y = f({ x })
        if (!Number.isFinite(y) || Math.abs(y) > 1e9) continue
        xs.push(x)
        ys.push(y)
      }
    }
    if (plan.kind === 'curves') {
      for (const it of plan.items) {
        // A curve with no ends runs for ever and frames nothing (graphBox), so every one has both.
        expect(it.from !== undefined && it.to !== undefined, `${q.id}: ${it.label}`).toBe(true)
        sample(it.expr, it.from!, it.to!)
      }
    } else if (plan.kind === 'between') {
      sample(plan.upper, plan.from, plan.to)
      sample(plan.lower, plan.from, plan.to)
    } else if (plan.kind === 'vectors') {
      for (const it of plan.items) {
        const t = it.tail ?? [0, 0, 0]
        xs.push(t[0], t[0] + it.v[0])
        ys.push(t[1], t[1] + it.v[1])
      }
    } else {
      throw new Error(`${q.id}: a ${plan.kind} picture is not measured here`)
    }
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
  }

  it('frames every picture on every drawable set of numbers with both sides at least 40 px and within 10× of each other', () => {
    const bad: string[] = []
    for (const q of file2.questions) {
      const draws = everyDraw(q)
      const fails = draws.flatMap((values) => {
        const { w, h } = boxOf(q, values)
        return CANVASES.flatMap((canvas) => {
          // CameraRig's 2-D fit: the zoom that fits the box with a margin, floored at 2 px a unit.
          const fit = Math.min(canvas.w / (Math.max(w, 1) * 1.35), canvas.h / (Math.max(h, 1) * 1.45), 400)
          const zoom = Math.max(2, fit)
          const why = [
            fit < 2 ? 'too big to fit' : '',
            w / h > 10 || w / h < 0.1 ? `width ÷ height = ${(w / h).toPrecision(3)}` : '',
            w * zoom < 40 ? `${(w * zoom).toFixed(0)} px wide` : '',
            h * zoom < 40 ? `${(h * zoom).toFixed(0)} px tall` : ''
          ].filter(Boolean)
          return why.length ? [`${JSON.stringify(values)} on ${canvas.w} × ${canvas.h}: ${why.join(', ')}`] : []
        })
      })
      if (fails.length) bad.push(`${q.id}: ${fails.length}/${draws.length}, e.g. ${fails[0]}`)
    }
    expect(bad).toEqual([])
  })

  it('keeps every label short enough to sit on the drawing, where a curve’s label is written along the curve', () => {
    // A 130-character label naming both scales ran off both sides of the viewport in the browser.
    for (const q of file2.questions) {
      for (const values of everyDraw(q)) {
        const plan = picturePlan(q.picture!, playedWith(q, values), TWO_DP)
        const labels = plan.kind === 'curves' ? plan.items.map((it) => it.label) : plan.kind === 'between' && plan.label ? [plan.label] : []
        for (const l of labels) expect(l.length, `${q.id}: ${l}`).toBeLessThanOrEqual(70)
      }
    }
  })
})

describe('QP2 — every step reads right once the numbers are in', () => {
  const playedSteps2 = (q: PQQuestion, seed: number): string[] =>
    playQuestion(q, seed, SETTINGS, 'worked')
      .working.moves.map((m) => m.tex)
      .filter((t): t is string => t !== undefined)

  it('never puts a number where a fraction or a command wants a symbol: no {name} straight after a closing brace', () => {
    for (const q of file2.questions) {
      const names = q.variables.map((v) => v.name).join('|')
      const loose = new RegExp(`\\}\\{(${names})\\}`)
      for (const s of q.steps?.items ?? []) {
        if (s.tex !== undefined) expect(s.tex, `${q.id}: ${s.tex}`).not.toMatch(loose)
        if (s.rule !== undefined) expect(s.rule, `${q.id} rule: ${s.rule}`).not.toMatch(loose)
      }
    }
  })

  it('never sets two numbers side by side with only a space between them', () => {
    for (const q of file2.questions) {
      for (const seed of [1, 2, 3]) {
        for (const tex of playedSteps2(q, seed)) expect(tex, q.id).not.toMatch(/\d\s*(\\[ ,;])+\s*\d/)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Known answers, worked by hand from the numbers a pinned seed draws
// ---------------------------------------------------------------------------

describe('QP2 — known answers, from a pinned seed', () => {
  it('two 10 Ω resistors in series across 24 V: 20 Ω total, 1.2 A', () => {
    const q = byId2('physlab-fields-series-resistors')
    const v = pinned(q, 7, { R1: 10, R2: 10, V: 24 })
    expect(answer(q, 0, v)).toBeCloseTo(20, 9)
    expect(answer(q, 1, v)).toBeCloseTo(1.2, 9)
  })

  it('two 10 Ω resistors side by side across 24 V: 5 Ω combined, 4.8 A total', () => {
    const q = byId2('physlab-fields-parallel-resistors')
    const v = pinned(q, 7, { R1: 10, R2: 10, V: 24 })
    expect(answer(q, 0, v)).toBeCloseTo(5, 9)
    expect(answer(q, 1, v)).toBeCloseTo(4.8, 9)
  })

  it('a 30 Ω resistor across 6 V draws 0.2 A and dissipates 1.2 W', () => {
    const q = byId2('physlab-fields-ohms-law-power')
    const v = pinned(q, 6, { R: 30, V: 6 })
    expect(answer(q, 0, v)).toBeCloseTo(0.2, 9)
    expect(answer(q, 1, v)).toBeCloseTo(1.2, 9)
  })

  it('15 V split between a 5 Ω and a 20 Ω resistor in series gives 12 V across the second one', () => {
    const q = byId2('physlab-fields-potential-divider')
    const v = pinned(q, 367, { Vin: 15, R1: 5, R2: 20 })
    expect(answer(q, 0, v)).toBeCloseTo(12, 9)
  })

  it('2 A through 10 Ω for 30 s generates 1200 J of heat', () => {
    const q = byId2('physlab-fields-joule-heating')
    const v = pinned(q, 8, { R: 10, I: 2, t: 30 })
    expect(answer(q, 0, v)).toBeCloseTo(1200, 9)
  })

  it('a gas at 100 kPa in 60 L squeezed to 20 L rises to 300 kPa', () => {
    const q = byId2('physlab-fields-boyles-law')
    const v = pinned(q, 39, { P1: 100000, V1: 0.06, V2: 0.02 })
    expect(answer(q, 0, v)).toBeCloseTo(300000, 6)
  })

  it('a gas at 10 L and 250 K warmed to 400 K expands to 16 L', () => {
    const q = byId2('physlab-fields-charles-law')
    const v = pinned(q, 7, { V1: 0.01, T1: 250, T2: 400 })
    expect(answer(q, 0, v)).toBeCloseTo(0.016, 9)
  })

  it('a sealed gas at 100 kPa and 250 K heated to 400 K reaches 160 kPa', () => {
    const q = byId2('physlab-fields-pressure-law')
    const v = pinned(q, 7, { P1: 100000, T1: 250, T2: 400 })
    expect(answer(q, 0, v)).toBeCloseTo(160000, 6)
  })

  it('the moles worked out from PV = nRT satisfy the equation itself, at 200 kPa, 10 L, 300 K', () => {
    const q = byId2('physlab-fields-ideal-gas-moles')
    const v = pinned(q, 6, { P: 200000, V: 0.01, T: 300 })
    const n = answer(q, 0, v)
    // Checked the defining equation itself, not a re-typed decimal: n·R·T must equal P·V.
    expect(n * 8.314 * v.T).toBeCloseTo(v.P * v.V, 6)
  })

  it('a gas at 120 kPa expanding from 10 L to 40 L does 3600 J of work', () => {
    const q = byId2('physlab-fields-work-done-by-gas')
    const v = pinned(q, 2, { P: 120000, V1: 0.01, V2: 0.04 })
    expect(answer(q, 0, v)).toBeCloseTo(3600, 9)
  })

  it('a 200 Hz wave with a 0.5 m wavelength travels at 100 m/s', () => {
    const q = byId2('physlab-fields-wave-speed')
    const v = pinned(q, 4, { f: 200, lam: 0.5 })
    expect(answer(q, 0, v)).toBeCloseTo(100, 9)
  })

  it('a 20 Hz oscillation has a period of 0.05 s', () => {
    const q = byId2('physlab-fields-period-frequency')
    expect(answer(q, 0, pinned(q, 4, { f: 20 }))).toBeCloseTo(0.05, 9)
  })

  it('sound at 350 m/s with a 2 s echo puts the cliff 350 m away', () => {
    const q = byId2('physlab-fields-echo-distance')
    const v = pinned(q, 4, { v: 350, t: 2 })
    expect(answer(q, 0, v)).toBeCloseTo(350, 9)
  })

  it('444 Hz and 440 Hz played together beat 4 times a second', () => {
    const q = byId2('physlab-fields-beat-frequency')
    const v = pinned(q, 1523, { f1: 444, f2: 440 })
    expect(answer(q, 0, v)).toBeCloseTo(4, 9)
  })

  it('a 0.2 m pipe closed at one end resonates at 425 Hz in 340 m/s sound', () => {
    const q = byId2('physlab-fields-closed-pipe-resonance')
    const v = pinned(q, 6, { v: 340, L: 0.2 })
    expect(answer(q, 0, v)).toBeCloseTo(425, 9)
  })

  it('10 m/s around a 2 m circle gives an angular velocity of 5 rad/s', () => {
    const q = byId2('physlab-fields-angular-velocity')
    const v = pinned(q, 4, { v: 10, r: 2 })
    expect(answer(q, 0, v)).toBeCloseTo(5, 9)
  })

  it('10 m/s around a 2 m circle needs a centripetal acceleration of 50 m/s²', () => {
    const q = byId2('physlab-fields-centripetal-acceleration')
    const v = pinned(q, 4, { v: 10, r: 2 })
    expect(answer(q, 0, v)).toBeCloseTo(50, 9)
  })

  it('a 1.5 kg mass at 2 m/s on a 1.5 m circle needs 4 N', () => {
    const q = byId2('physlab-fields-centripetal-force')
    const v = pinned(q, 4, { m: 1.5, v: 2, r: 1.5 })
    expect(answer(q, 0, v)).toBeCloseTo(4, 9)
  })

  it('40 N applied 30 cm from the bolt gives a torque of 12 N·m', () => {
    const q = byId2('physlab-fields-torque')
    const v = pinned(q, 4, { F: 40, d: 30, r: 0.3 })
    expect(answer(q, 0, v)).toBeCloseTo(12, 9)
  })

  it('20 m/s around a 1 m circle takes 2π/20 s for one lap', () => {
    const q = byId2('physlab-fields-period-of-rotation')
    const v = pinned(q, 4, { v: 20, r: 1 })
    expect(answer(q, 0, v)).toBeCloseTo((2 * Math.PI) / 20, 9)
  })
})

// ---------------------------------------------------------------------------
// Fresh numbers every time, and every one of them still right — QP2
// ---------------------------------------------------------------------------

const TEXTBOOK2: Record<string, ((v: V) => number)[]> = {
  'series-resistors': [(v) => v.R1 + v.R2, (v) => v.V / (v.R1 + v.R2)],
  'parallel-resistors': [(v) => (v.R1 * v.R2) / (v.R1 + v.R2), (v) => (v.V * (v.R1 + v.R2)) / (v.R1 * v.R2)],
  'ohms-law-power': [(v) => v.V / v.R, (v) => v.V * (v.V / v.R)],
  'potential-divider': [(v) => (v.Vin * v.R2) / (v.R1 + v.R2)],
  'joule-heating': [(v) => v.I * v.I * v.R * v.t],
  'boyles-law': [(v) => (v.P1 * v.V1) / v.V2],
  'charles-law': [(v) => (v.V1 * v.T2) / v.T1],
  'pressure-law': [(v) => (v.P1 * v.T2) / v.T1],
  'ideal-gas-moles': [(v) => (v.P * v.V) / (8.314 * v.T)],
  'work-done-by-gas': [(v) => v.P * (v.V2 - v.V1)],
  'wave-speed': [(v) => v.f * v.lam],
  'period-frequency': [(v) => 1 / v.f],
  'echo-distance': [(v) => (v.v * v.t) / 2],
  'beat-frequency': [(v) => v.f1 - v.f2],
  'closed-pipe-resonance': [(v) => v.v / (4 * v.L)],
  'angular-velocity': [(v) => v.v / v.r],
  'centripetal-acceleration': [(v) => (v.v * v.v) / v.r],
  'centripetal-force': [(v) => (v.m * v.v * v.v) / v.r],
  torque: [(v) => v.F * v.r],
  'period-of-rotation': [(v) => (2 * Math.PI * v.r) / v.v]
}

describe('QP2 — every play draws new numbers, and every answer is still the textbook one', () => {
  it('has a textbook formula here for every part of every question', () => {
    for (const q of file2.questions) expect(TEXTBOOK2[q.id.replace('physlab-fields-', '')]?.length, q.id).toBe(q.parts.length)
  })

  it('draws more than one set of numbers for every question', () => {
    for (const q of file2.questions) {
      const draws = SEEDS.map((seed) => drawVariables(q, seed).values)
      expect(new Set(draws.map((v) => JSON.stringify(v))).size, q.id).toBeGreaterThanOrEqual(3)
    }
  })

  it('works out every part on seeds 1–25 to the textbook formula', () => {
    for (const q of file2.questions) {
      const formulas = TEXTBOOK2[q.id.replace('physlab-fields-', '')]
      for (const seed of SEEDS) {
        const drawn = drawVariables(q, seed)
        expect(drawn.problems, `${q.id} seed ${seed}`).toEqual([])
        formulas.forEach((f, k) => {
          const want = f(drawn.values)
          expect(Number.isFinite(want) && want !== 0, `${q.id} seed ${seed} part ${k}`).toBe(true)
          expect(Math.abs(answer(q, k, drawn.values) - want), `${q.id} seed ${seed} part ${k}`).toBeLessThan(1e-9 * Math.max(1, Math.abs(want)))
        })
      }
    }
  })

  it('marks every named trap wrong on every set of numbers a student can draw, not only on a few seeds', () => {
    // 25 seeds missed R = V = 15 (where R ÷ V is the answer V ÷ R) and P·V within 0.5 % of 8.314·T
    // (where the upside-down ideal gas equation lands inside the 2 % tolerance).
    for (const q of file2.questions) {
      for (const values of everyDraw(q)) {
        const played = playedWith(q, values)
        q.parts.forEach((part) => {
          if (part.type !== 'number') return
          for (const trap of part.traps ?? []) {
            const value = evaluateInVariables(trap.value, values)
            const p = { part } as PlayedPart
            expect(isCorrect(checkPlayedPart(p, String(value), played, SETTINGS)), `${q.id} ${JSON.stringify(values)} trap ${trap.value} = ${value}`).toBe(false)
          }
        })
      }
    }
  })

  it('keeps the physics sensible on every draw there is: the compressed volume stays smaller, the warmed gas stays hotter, the two notes stay close enough to beat', () => {
    for (const v of everyDraw(byId2('physlab-fields-boyles-law'))) expect(v.V2, `boyle ${JSON.stringify(v)}`).toBeLessThan(v.V1)
    for (const v of everyDraw(byId2('physlab-fields-charles-law'))) expect(v.T2, `charles ${JSON.stringify(v)}`).toBeGreaterThan(v.T1)
    for (const v of everyDraw(byId2('physlab-fields-work-done-by-gas'))) expect(v.V2, `work ${JSON.stringify(v)}`).toBeGreaterThan(v.V1)
    // "Slightly lower" and "two notes close in pitch" must be true: a gap past 15-20 Hz is heard
    // as roughness, not as beats, and the set once drew notes up to 220 Hz apart.
    const beats = everyDraw(byId2('physlab-fields-beat-frequency'))
    expect(beats.length).toBeGreaterThan(20)
    for (const v of beats) {
      expect(v.f1 - v.f2, `beat ${JSON.stringify(v)}`).toBeGreaterThanOrEqual(2)
      expect(v.f1 - v.f2, `beat ${JSON.stringify(v)}`).toBeLessThanOrEqual(10)
    }
    // And the seeds a student is actually given all meet the condition, never its fallback draw.
    for (const seed of SEEDS) expect(drawVariables(byId2('physlab-fields-beat-frequency'), seed).problems, `beat seed ${seed}`).toEqual([])
  })

  it('walks every drawable set of numbers, and every seed draws one of them', () => {
    for (const q of file2.questions) {
      const all = new Set(everyDraw(q).map((v) => JSON.stringify(v)))
      for (let seed = 1; seed <= 200; seed++) {
        const drawn = drawVariables(q, seed)
        expect(drawn.problems, `${q.id} seed ${seed}`).toEqual([])
        expect(all.has(JSON.stringify(drawn.values)), `${q.id} seed ${seed}: ${JSON.stringify(drawn.values)}`).toBe(true)
      }
    }
  })

  it('reads every step right on every one of those draws', () => {
    const playedSteps2 = (q: PQQuestion, seed: number): string[] =>
      playQuestion(q, seed, SETTINGS, 'worked')
        .working.moves.map((m) => m.tex)
        .filter((t): t is string => t !== undefined)
    for (const q of file2.questions) {
      for (const seed of SEEDS) {
        for (const tex of playedSteps2(q, seed)) {
          expect(tex, `${q.id} seed ${seed}`).not.toMatch(/\d\s*(\\[ ,;])+\s*\d/)
          renders(tex, `${q.id} seed ${seed}`)
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// A worked line can be checked from its own numbers
// ---------------------------------------------------------------------------

/**
 * What is left of a worked line's last part once its numbers, units and layout are taken out:
 * the symbols a student would still have to know a value for. "P = 12 V × I" leaves I — a result
 * an earlier line worked out, but never gave a value — so the line cannot be checked on a
 * calculator from what it shows.
 */
function symbolsLeft(tex: string): { hasNumber: boolean; symbols: string[] } {
  const last = tex.split(/(?<![<>\\])=/).pop() ?? ''
  const bare = last
    .replace(/\\(?:mathrm|text|operatorname)\{(?:[^{}]|\{[^{}]*\})*\}/g, ' ')
    // Units written as symbols (Ω, °) are units, not unknowns.
    .replace(/\\(?:Omega|circ)\b/g, ' ')
    .replace(/\\(?:frac|tfrac|dfrac|times|div|cdot|left|right|sqrt|approx|quad|qquad|Rightarrow|implies)\b/g, ' ')
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/\\pi\b/g, '1')
  const symbols = [...bare.matchAll(/\\[A-Za-z]+|(?<![A-Za-z])[A-Za-z](?![A-Za-z])/g)].map((m) => m[0])
  return { hasNumber: /\d/.test(bare), symbols }
}

describe('every worked line can be checked from its own numbers', () => {
  it('no line puts a number beside a symbol an earlier line worked out: each result is given its value and used as that number', () => {
    const questions = [...file.questions, ...file2.questions]
    expect(questions).toHaveLength(40)
    for (const q of questions) {
      for (const seed of [1, 2, 3]) {
        // What earlier lines worked out: the symbol a line starts "X =" with, and the unknown a
        // line with numbers in solves for ("0 = 12² − 2a × 30" works out a).
        const worked = new Set<string>()
        for (const m of playQuestion(q, seed, SETTINGS, 'worked').full.moves) {
          if (m.tex === undefined) continue
          const { hasNumber, symbols } = symbolsLeft(m.tex)
          if (hasNumber) expect(symbols.filter((x) => worked.has(x)), `${q.id} seed ${seed}: ${m.tex}`).toEqual([])
          const lhs = /^\s*(\\[A-Za-z]+|[A-Za-z])(?:_\{[^=]*?\}|_[A-Za-z0-9])?(?:\^\{?\d\}?)?\s*=/.exec(m.tex)
          if (lhs) worked.add(lhs[1])
          if (hasNumber) symbols.forEach((x) => worked.add(x))
        }
      }
    }
  })

  it('the checker’s lines now carry their numbers: I, P and a have values before they are used', () => {
    const ohm = byId2('physlab-fields-ohms-law-power')
    // A 5 Ω resistor on 12 V: I = 12 V ÷ 5 Ω = 2.4 A, then P = 12 V × 2.4 A.
    const seedFor = (q: PQQuestion, want: Record<string, number>): number => {
      for (let seed = 1; seed <= 500; seed++) {
        const v = drawVariables(q, seed).values
        if (Object.entries(want).every(([k, x]) => v[k] === x)) return seed
      }
      throw new Error(`no seed draws ${JSON.stringify(want)}`)
    }
    const lines = playQuestion(ohm, seedFor(ohm, { R: 5, V: 12 }), SETTINGS, 'worked').full.moves.map((m) => m.tex ?? '')
    expect(lines[0]).toContain('= 2.4\\,\\mathrm{A}')
    expect(lines[1]).toContain('12\\,\\mathrm{V} \\times 2.4\\,\\mathrm{A}')
  })
})
