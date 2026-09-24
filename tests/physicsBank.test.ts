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
import { checkPlayedPart, playQuestion, showVisual, visualPlanFor, type PartAnswer, type PlayedPart } from '../src/renderer/src/questions/player'

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
        expect(showVisual(visualPlanFor(played), played, SETTINGS, false), `${q.id} seed ${seed}`).toMatch(/\S/)
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
  expect(drawn.values, q.id).toEqual(want)
  return drawn.values
}

describe('known answers — motion', () => {
  it('a car braking from 24 m/s to rest in 8 s travels 96 m, decelerating at 3 m/s²', () => {
    const q = byId('physlab-mechanics-braking-car')
    const v = pinned(q, 102, { v: 24, t: 8 })
    expect(answer(q, 0, v)).toBeCloseTo(96, 9)
    expect(answer(q, 1, v)).toBeCloseTo(-3, 9)
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
    expect(answer(q, 0, pinned(q, 15, { F: 20, m: 4 }))).toBeCloseTo(5, 9)
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
