// The rung 4–5 starter set (QD2): ten questions a first-year university student or a strong
// school leaver meets — braking against the air with error carried forward, a speed found as a
// function of distance, a damped spring, eigenvalues, normal modes, a matrix inverse, torque as a
// cross product, the anharmonic oscillator's ground-state energy stated with an uncertainty (Eₙ),
// two labs compared by Eₙ, and a proof. Every known answer here is worked from the textbook
// formula (or, for E₀, from an in-test diagonalisation), never read back from the file; then the
// file's own answer is checked against it and marked through the player the way Practice marks it.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The stylesheet is not loaded here, so the drawing's colours fall back, as questionPlayer.test.ts does.
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
import { scene } from '../src/renderer/src/core/store'
import { loadBundled } from '../src/renderer/src/questions/bank'
import { rederive } from '../src/renderer/src/questions/ecf'
import { evaluateInVariables } from '../src/renderer/src/questions/parts'
import { formatVersionOf, parsePQFile, type PQFile, type PQPart, type PQQuestion, type VariableDef } from '../src/renderer/src/questions/pqjson'
import { conditionHolds, drawVariables } from '../src/renderer/src/questions/variables'
import {
  checkPlayedPart,
  countedParts,
  HELD_BACK,
  markPlayed,
  picturePlan,
  playQuestion,
  resolveDeeper,
  showVisual,
  visualPlanFor,
  visualState,
  type PartAnswer,
  type Played,
  type PlayedPart
} from '../src/renderer/src/questions/player'

// Several checks play ten questions on 25 seeds at three fading levels, or walk every draw a
// question can make; alone they take a few seconds, and beside other agents' suites on this PC
// the default 5 s ran out (seen once), so the whole file gets a generous timeout.
vi.setConfig({ testTimeout: 60000 })

const SETTINGS: MeasureSettings = { decimals: 4, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }

const renders = (tex: string, where: string): void => {
  expect(() => katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: 'ignore' }), `${where}: ${tex}`).not.toThrow()
}

let file: PQFile
beforeEach(() => {
  resetGlobals()
  file = parsePQFile(readSource('src/renderer/src/questions/bank/university.pqjson'))
})

const byId = (id: string): PQQuestion => {
  const q = file.questions.find((x) => x.id === id)
  if (!q) throw new Error(`no question ${id}`)
  return q
}

/** Every value a drawn variable can take, straight from its definition. */
const choicesOf = (def: VariableDef): number[] => {
  if (def.kind === 'list') return def.items
  if (def.kind === 'range') {
    const n = Math.round((def.to - def.from) / def.step)
    return Array.from({ length: n + 1 }, (_, i) => Number((def.from + i * def.step).toFixed(10))).filter((v) => !(def.exclude ?? []).includes(v))
  }
  return []
}

/** Every combination of drawn values a question can meet, with its formula variables worked out, keeping only those its condition allows. */
const everyDraw = (q: PQQuestion): Record<string, number>[] => {
  const drawn = q.variables.filter((v) => v.def.kind !== 'expr')
  let combos: Record<string, number>[] = [{}]
  for (const v of drawn) combos = combos.flatMap((c) => choicesOf(v.def).map((x) => ({ ...c, [v.name]: x })))
  const all = combos.map((c) => rederive(q, { seed: 0, values: {}, problems: [] } as never, c))
  return all.filter((v) => q.condition === undefined || conditionHolds(q.condition.when, v) === true)
}

/** The seed that draws exactly these values (drawn variables only); the test says so before it relies on it. */
const seedFor = (q: PQQuestion, want: Record<string, number>): number => {
  for (let seed = 1; seed <= 5000; seed++) {
    const v = drawVariables(q, seed).values
    if (Object.entries(want).every(([k, x]) => Math.abs(v[k] - x) < 1e-9)) return seed
  }
  throw new Error(`${q.id}: no seed up to 5000 draws ${JSON.stringify(want)}`)
}

const played = (q: PQQuestion, want: Record<string, number>): Played => {
  scene().newScene()
  const p = playQuestion(q, seedFor(q, want), SETTINGS)
  expect(p.problems, q.id).toEqual([])
  return p
}

const part = (p: Played, index: number): PlayedPart => {
  const found = p.parts.find((x) => x.index === index)
  if (!found) throw new Error(`part ${index} is not shown`)
  return found
}

const mark = (p: Played, index: number, answer: PartAnswer) => checkPlayedPart(part(p, index), answer, p, SETTINGS)

const values = (p: Played) => p.variant.values
const ev = (expr: string, v: Record<string, number>): number => evaluateInVariables(expr, v)

/**
 * What a student who has it exactly right types, part by part: the value of a number part, a
 * stated value with the reference's own uncertainty, a vector's components, the roots, the
 * inverse's entries, the author's own function, the right options.
 */
function modelAnswer(p: PlayedPart, pl: Played): PartAnswer {
  const v = values(pl)
  const part: PQPart = p.part
  switch (part.type) {
    case 'number':
      if (part.tolerance.kind === 'stated') return `${ev(part.answer, v)} ± ${ev(part.tolerance.uref, v)}`
      return String(p.field!.value)
    case 'vector':
      return `(${part.answer.map((c) => ev(c, v)).join(', ')})`
    case 'roots':
      return part.answer.map((c) => ev(c, v)).join(', ')
    case 'matrix':
      return part.answer.map((row) => row.map((c) => String(ev(c, v))))
    case 'function':
      return part.model
    case 'choice':
      return p.choices!.flatMap((c, i) => (c.correct ? [i] : []))
    default:
      throw new Error(`${part.type} is never marked`)
  }
}

const SEEDS = Array.from({ length: 25 }, (_, k) => k + 1)

// ---------------------------------------------------------------------------
// The set as a whole
// ---------------------------------------------------------------------------

describe('the university set parses and every question is fit to ship', () => {
  it('holds ten questions, every one CC BY 4.0 from PhysLab, on rung 4 or 5, and is written as a format-2 file', () => {
    expect(file.questions).toHaveLength(10)
    expect(file.version).toBe(2)
    expect(formatVersionOf(file)).toBe(2)
    expect(new Set(file.questions.map((q) => q.id)).size).toBe(10)
    for (const q of file.questions) {
      expect(q.id, q.id).toMatch(/^physlab-uni-/)
      expect(q.license, q.id).toMatchObject({ id: 'CC BY 4.0', holder: 'PhysLab' })
      expect([4, 5], q.id).toContain(q.rung)
    }
    expect(file.questions.filter((q) => q.rung === 5).length).toBeGreaterThanOrEqual(2)
  })

  it('ships with the rest of the bank: loadBundled carries all ten', () => {
    const ids = loadBundled().questions.filter((q) => q.id.startsWith('physlab-uni-')).map((q) => q.id)
    expect(ids.sort()).toEqual(file.questions.map((q) => q.id).sort())
  })

  it('holds every deep-rung kind the design lists: error carried forward, function, roots, matrix, vector, a stated uncertainty, a proof, a part shown only under a condition', () => {
    const parts = file.questions.flatMap((q) => q.parts)
    expect(parts.some((p) => p.ecf !== undefined)).toBe(true)
    for (const kind of ['function', 'roots', 'matrix', 'vector', 'proof'] as const) expect(parts.some((p) => p.type === kind), kind).toBe(true)
    expect(parts.some((p) => p.type === 'number' && p.tolerance.kind === 'stated')).toBe(true)
    expect(parts.some((p) => p.showIf !== undefined)).toBe(true)
    // The braking question is the one in three parts with error carried forward.
    const braking = byId('physlab-uni-dragster-braking')
    expect(braking.parts).toHaveLength(3)
    expect(braking.parts[2].ecf).toEqual({ uses: [{ part: 1, variable: 's' }], strategy: 'originalfirst', penalty: 0 })
  })

  it('gives the proof a model proof of several lines and a self-check list, never marked', () => {
    const proof = byId('physlab-uni-drag-shortens-stop').parts.find((p) => p.type === 'proof')
    if (proof?.type !== 'proof') throw new Error('expected a proof part')
    expect(proof.marks).toBe(0)
    expect(proof.model.split('\n').length).toBeGreaterThanOrEqual(3)
    expect(proof.selfCheck.length).toBeGreaterThanOrEqual(4)
    const pl = playQuestion(byId('physlab-uni-drag-shortens-stop'), 1, SETTINGS)
    expect(countedParts(pl).map((p) => p.part.type)).toEqual(['number'])
  })

  it('gives every question worked steps and a "Go deeper" link that leads to a question in the set', () => {
    for (const q of file.questions) {
      expect(q.steps?.items.length ?? 0, q.id).toBeGreaterThan(0)
      if (q.deeper === undefined) continue
      const found = resolveDeeper(q, file.questions)
      expect(found && 'question' in found, `${q.id} → ${q.deeper}`).toBe(true)
    }
    expect(file.questions.filter((q) => q.deeper !== undefined).length).toBeGreaterThanOrEqual(4)
  })

  it('gives every question an authored picture of the physics (never the number-line fallback) that draws on many seeds, before and after the answer', () => {
    for (const q of file.questions) {
      expect(q.picture, q.id).toBeDefined()
      expect(q.picture!.kind, q.id).not.toBe('numberline')
      for (const seed of [1, 2, 3, 7, 11]) {
        scene().newScene()
        const pl = playQuestion(q, seed, SETTINGS)
        const plan = visualPlanFor(pl)
        expect(plan.source, q.id).toBe('authored')
        expect(showVisual(plan, pl, SETTINGS, true), `${q.id} seed ${seed}`).toMatch(/\S/)
        if (visualState(plan, false) === 'ready') expect(showVisual(plan, pl, SETTINGS, false), `${q.id} seed ${seed}`).toMatch(/\S/)
        else expect(() => showVisual(plan, pl, SETTINGS, false), `${q.id} seed ${seed}`).toThrow(HELD_BACK)
      }
    }
  })

  it('plays every question on 25 seeds at every fading level with no problem, and every maths string goes through KaTeX', () => {
    for (const q of file.questions) {
      for (const seed of SEEDS) {
        for (const level of ['worked', 'half', 'solo'] as const) {
          const pl = playQuestion(q, seed, SETTINGS, level)
          expect(pl.problems, `${q.id} seed ${seed}`).toEqual([])
          for (const m of pl.working.moves) {
            if (m.tex) renders(m.tex, `${q.id} ${seed}`)
            if (m.rule) renders(m.rule, `${q.id} ${seed} rule`)
          }
          const lines = [...pl.statement, ...pl.parts.flatMap((p) => [...p.promptLines, ...(p.model ?? []), ...(p.selfCheck ?? [])])]
          for (const line of lines) for (const seg of line) if ('tex' in seg) renders(seg.tex, `${q.id} text`)
          for (const a of pl.working.answers) renders(a.tex, `${q.id} answer`)
        }
      }
    }
  })

  it('marks every counted part’s own model answer right, on 25 seeds', () => {
    for (const q of file.questions) {
      for (const seed of SEEDS) {
        const pl = playQuestion(q, seed, SETTINGS)
        for (const p of countedParts(pl)) {
          const c = checkPlayedPart(p, modelAnswer(p, pl), pl, SETTINGS)
          expect(isCorrect(c), `${q.id} seed ${seed} ${p.key}: ${c.message ?? ''}`).toBe(true)
        }
      }
    }
  })

  it('marks every named trap wrong, on every draw the question can make, and never lets a trap sit inside the answer’s band', () => {
    for (const q of file.questions) {
      for (const v of everyDraw(q)) {
        for (const p of q.parts) {
          if (p.type !== 'number' || p.tolerance.kind === 'stated') continue
          const ans = ev(p.answer, v)
          const band = p.tolerance.kind === 'relative' ? Math.abs(ans) * p.tolerance.value : p.tolerance.value
          for (const t of p.traps ?? []) {
            const x = ev(t.value, v)
            // A trap equal to the answer only when the answer is 0 (two labs with one value) cannot mislead: 0 is right.
            if (Math.abs(ans) < 1e-12 && Math.abs(x) < 1e-12) continue
            expect(Math.abs(x - ans), `${q.id} ${p.prompt} trap ${t.value} at ${JSON.stringify(v)}`).toBeGreaterThan(band)
          }
        }
      }
    }
  })

  it('always meets its own condition within the allowed runs, on 1000 seeds', () => {
    for (const q of file.questions.filter((x) => x.condition !== undefined)) {
      for (let seed = 1; seed <= 1000; seed++) {
        const d = drawVariables(q, seed)
        expect(d.problems, `${q.id} seed ${seed}`).toEqual([])
        expect(conditionHolds(q.condition!.when, d.values), `${q.id} seed ${seed}`).toBe(true)
      }
    }
  })
})

describe('no programming syntax in anything the student reads', () => {
  it('writes F₀ and uA in words and symbols, never F0, u_A, * or ^, outside the maths', () => {
    for (const q of file.questions) {
      const words: string[] = [q.title, q.statement]
      for (const p of q.parts) {
        words.push(p.prompt)
        if (p.type === 'number') for (const t of p.traps ?? []) words.push(t.why)
        if (p.type === 'choice') for (const c of p.choices) words.push(c.text, c.why ?? '')
        if (p.type === 'proof') words.push(p.model, ...p.selfCheck)
      }
      for (const s of q.steps?.items ?? []) words.push(s.head, s.note ?? '')
      if (q.picture?.kind === 'curves') words.push(...q.picture.items.map((it) => it.label))
      if (q.picture?.kind === 'vectors') words.push(...q.picture.items.map((it) => it.name))
      for (const w of words) {
        // Chips become numbers with units; display lines and \( \) maths go through KaTeX.
        const shown = w
          .replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, '')
          .replace(/\\\([\s\S]*?\\\)/g, '')
          .split('\n')
          .filter((l) => !l.trim().startsWith('$$'))
          .join('\n')
        expect(shown, `${q.id}: ${w}`).not.toMatch(/_|\*|\^|\b[A-Za-z]+\d+\b|\\[A-Za-z]/)
      }
    }
  })

  it('never lets a symbol in a formula be taken for a number: no {name} straight after a closing brace in any step', () => {
    for (const q of file.questions) {
      const names = q.variables.map((v) => v.name).join('|')
      const loose = new RegExp(`\\}\\{(${names})\\}`)
      // \frac{z} with z drawn is left alone by the player but reads as the variable to any author; write \frac{ z }.
      const argument = new RegExp(`\\\\[A-Za-z]+\\{(${names})\\}`)
      for (const s of q.steps?.items ?? []) {
        for (const tex of [s.tex, s.rule]) {
          if (tex === undefined) continue
          expect(tex, `${q.id}: ${tex}`).not.toMatch(loose)
          expect(tex, `${q.id}: ${tex}`).not.toMatch(argument)
        }
      }
    }
  })

  it('offers at least three options in every choice part, all different', () => {
    for (const q of file.questions) {
      for (const p of q.parts) {
        if (p.type !== 'choice') continue
        expect(p.choices.length, q.id).toBeGreaterThanOrEqual(3)
        expect(new Set(p.choices.map((c) => c.text)).size, q.id).toBe(p.choices.length)
      }
    }
  })

  it('never sets two numbers side by side with only a space between them, on every seed', () => {
    for (const q of file.questions) {
      for (const seed of SEEDS) {
        for (const m of playQuestion(q, seed, SETTINGS).working.moves) if (m.tex) expect(m.tex, `${q.id} seed ${seed}`).not.toMatch(/\d\s*(\\[ ,;])+\s*\d/)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Known answers, worked by hand
// ---------------------------------------------------------------------------

describe('a dragster braking against the air (F₀ + kv²), three parts with error carried forward', () => {
  const stop = (m: number, F0: number, k: number, u: number): number => (m / (2 * k)) * Math.log(1 + (k * u * u) / F0)

  it('the stopping distance s = (m/2k) ln(1 + ku²/F₀) is ½ ln 5 = 0.8047 at m = F₀ = k = 1, u = 2, and tends to mu²/2F₀ = 2 as k → 0', () => {
    const q = byId('physlab-uni-dragster-braking')
    const s = (v: Record<string, number>) => ev((q.parts[1] as { answer: string }).answer, rederive(q, { seed: 0, values: {}, problems: [] } as never, v))
    expect(s({ m: 1, F0: 1, k: 1, u: 2 })).toBeCloseTo(0.5 * Math.log(5), 12)
    expect(s({ m: 1, F0: 1, k: 1, u: 2 })).toBeCloseTo(0.8047, 4)
    expect(s({ m: 1, F0: 1, k: 1e-6, u: 2 })).toBeCloseTo(2.0, 4)
  })

  it('m = 1000 kg, u = 100 m/s, F₀ = 8000 N, k = 1 kg/m: a₀ = 18 m/s², s = 1000 ln 1.5 = 405.47 m, the brakes take 3.2437 × 10⁶ J', () => {
    const q = byId('physlab-uni-dragster-braking')
    const pl = played(q, { m: 1000, u: 100, F0: 8000, k: 1 })
    expect(part(pl, 0).field!.value).toBeCloseTo((8000 + 1 * 100 ** 2) / 1000, 9)
    expect(part(pl, 0).field!.value).toBe(18)
    expect(part(pl, 1).field!.value).toBeCloseTo(1000 * Math.log(1.5), 9)
    expect(part(pl, 1).field!.value).toBeCloseTo(405.4651, 4)
    expect(part(pl, 2).field!.value).toBeCloseTo(8000 * 1000 * Math.log(1.5), 3)
    // The rest of the ½mu² = 5 × 10⁶ J goes into the air.
    expect(0.5 * 1000 * 100 ** 2 - part(pl, 2).field!.value).toBeCloseTo(1_756_279, 0)
    expect(isCorrect(mark(pl, 0, '18 m/s²'))).toBe(true)
    expect(isCorrect(mark(pl, 1, '405 m'))).toBe(true)
    // Brakes alone (mu²/2F₀ = 625 m) and the starting force held constant (m u² / 2(F₀ + ku²) = 277.8 m) are named.
    expect(mark(pl, 1, '625').message).toMatch(/brakes alone/)
    expect(mark(pl, 1, '277.8').message).toMatch(/stayed the same/)
    expect(mark(pl, 0, '8').message).toMatch(/brakes alone/)
  })

  it('carries a wrong stopping distance forward: (b) 450 m then (c) 8000 × 450 = 3.6 × 10⁶ J is right with the note; the true value stays right; the trap stays wrong', () => {
    const q = byId('physlab-uni-dragster-braking')
    const pl = played(q, { m: 1000, u: 100, F0: 8000, k: 1 })
    const marked = markPlayed(pl, { p0: '18', p1: '450', p2: '3600000' }, SETTINGS)
    expect(marked.p1.verdict).toBe('wrong')
    expect(marked.p2.verdict).toBe('right')
    expect(marked.p2.ecfNote).toMatch(/^Marked using your answer to part \(b\): 450/)
    expect(marked.p2.marks).toBe(1)
    // The true brakes' energy after the same wrong (b) is still right, with no note: originalfirst.
    const truth = markPlayed(pl, { p0: '18', p1: '450', p2: String(8000 * 1000 * Math.log(1.5)) }, SETTINGS)
    expect(truth.p2.verdict).toBe('right')
    expect(truth.p2.ecfNote).toBeUndefined()
    // All the kinetic energy (5 × 10⁶ J) is neither the true answer nor 8000 × 450.
    expect(markPlayed(pl, { p0: '18', p1: '450', p2: '5000000' }, SETTINGS).p2.verdict).toBe('wrong')
    // A (b) inside its own 2 % band is not an error to carry: (c) is marked against the true s, with no note.
    const rounded = markPlayed(pl, { p0: '18', p1: '406', p2: String(8000 * 406) }, SETTINGS)
    expect(rounded.p2.verdict).toBe('right')
    expect(rounded.p2.ecfNote).toBeUndefined()
  })

  it('stops shorter with the air than with the brakes alone, on every draw', () => {
    const q = byId('physlab-uni-dragster-braking')
    const draws = everyDraw(q)
    expect(draws.length).toBeGreaterThan(50)
    for (const v of draws) {
      expect(v.s, JSON.stringify(v)).toBeCloseTo(stop(v.m, v.F0, v.k, v.u), 9)
      expect(v.s).toBeLessThan((v.m * v.u ** 2) / (2 * v.F0))
    }
  })
})

describe('the dragster’s speed as a function of distance (an ODE answer)', () => {
  it('m = 1000 kg, u = 100 m/s, F₀ = 8000 N, k = 1 kg/m: v = √(18000 e^(−s/500) − 8000) solves m v v′ = −(F₀ + kv²) with v(0) = 100', () => {
    const q = byId('physlab-uni-dragster-speed')
    const pl = played(q, { m: 1000, u: 100, F0: 8000, k: 1, d: 100 })
    expect(mark(pl, 0, 'v = sqrt(18000 e^(-s/500) - 8000)').verdict).toBe('right')
    expect(mark(pl, 0, 'sqrt((u^2 + F0/k) e^(-2 k s/m) - F0/k)').verdict).toBe('right')
    // Brakes alone: v² = u² − 2F₀s/m does not solve the equation with the air in it.
    expect(mark(pl, 0, 'sqrt(10000 - 16 s)').message).toMatch(/does not solve/)
    // The right family, the wrong start: v(0) = √12000.
    expect(mark(pl, 0, 'sqrt(20000 e^(-s/500) - 8000)').message).toMatch(/does not start where the question says: v\(0\) should be 100/)
    // v(100) = √(18000 e^(−0.2) − 8000) = 82.08 m/s.
    const v100 = Math.sqrt(18000 * Math.exp(-0.2) - 8000)
    expect(v100).toBeCloseTo(82.0804, 3)
    expect(part(pl, 1).field!.value).toBeCloseTo(v100, 9)
    expect(isCorrect(mark(pl, 1, '82.08 m/s'))).toBe(true)
    expect(mark(pl, 1, String(Math.sqrt(100 ** 2 - (2 * 8000 * 100) / 1000))).message).toMatch(/brakes alone/)
  })

  it('always asks for the speed at a distance short of the stop, and checks the equation inside it', () => {
    const q = byId('physlab-uni-dragster-speed')
    const fn = q.parts[0]
    if (fn.type !== 'function') throw new Error('expected a function part')
    for (const v of everyDraw(q)) {
      const stop = (v.m / (2 * v.k)) * Math.log(1 + (v.k * v.u ** 2) / v.F0)
      expect(v.d, JSON.stringify(v)).toBeLessThan(stop)
      expect(fn.sampleRange![1]).toBeLessThan(stop)
      expect(Number.isFinite(v.vd) && v.vd > 0).toBe(true)
    }
  })
})

describe('a damped spring (an ODE answer with two starting conditions)', () => {
  it('x″ + 2x′ + 5x = 0, x(0) = 0, x′(0) = 4 m/s: x = 2e^(−t) sin 2t, swings every π s', () => {
    const q = byId('physlab-uni-damped-spring')
    const pl = played(q, { b: 2, wd: 2, v0: 4 })
    expect(values(pl).q).toBe(5)
    expect(mark(pl, 0, 'x = 2 e^(-t) sin(2t)').verdict).toBe('right')
    expect(mark(pl, 0, '2 sin(2t)').message).toMatch(/does not solve/)
    expect(mark(pl, 0, '2 e^(-t) cos(2t)').message).toMatch(/does not start where the question says: x\(0\) should be 0/)
    expect(mark(pl, 0, '4 e^(-t) sin(2t)').message).toMatch(/x′\(0\) should be 4/)
    expect(part(pl, 1).field!.value).toBeCloseTo(Math.PI, 12)
    expect(isCorrect(mark(pl, 1, '3.14 s'))).toBe(true)
    expect(mark(pl, 1, String((2 * Math.PI) / Math.sqrt(5))).message).toMatch(/no damper/)
  })

  it('draws a real swing every time: the roots of r² + br + q are −b/2 ± ω_d i, never a repeated or real pair', () => {
    for (const v of everyDraw(byId('physlab-uni-damped-spring'))) {
      const disc = v.b ** 2 - 4 * v.q
      expect(disc).toBeLessThan(0)
      expect(Math.sqrt(-disc) / 2).toBeCloseTo(v.wd, 12)
    }
  })
})

describe('eigenvalues of a 2 × 2 matrix (a roots answer)', () => {
  const eig = (a: number, b: number, c: number, d: number): number[] => {
    const tr = a + d
    const det = a * d - b * c
    const r = Math.sqrt(tr * tr - 4 * det)
    return [(tr - r) / 2, (tr + r) / 2]
  }

  it('[[3, 1], [2, 4]] has eigenvalues 2 and 5', () => {
    const q = byId('physlab-uni-eigenvalues')
    const pl = played(q, { l1: 2, l2: 5, n: 1 })
    expect([values(pl).a, values(pl).b, values(pl).c, values(pl).d]).toEqual([3, 1, 2, 4])
    expect(eig(3, 1, 2, 4)).toEqual([2, 5])
    expect(mark(pl, 0, '2, 5').verdict).toBe('right')
    expect(mark(pl, 0, '5; 2').verdict).toBe('right')
    expect(mark(pl, 0, '5').message).toMatch(/1 of the 2/)
    expect(mark(pl, 0, '-2, -5').verdict).toBe('wrong')
  })

  it('hides exactly the eigenvalues it asks for, on every draw: two different real roots, never a triangular matrix', () => {
    const draws = everyDraw(byId('physlab-uni-eigenvalues'))
    expect(draws.length).toBeGreaterThan(40)
    for (const v of draws) {
      const [lo, hi] = eig(v.a, v.b, v.c, v.d)
      expect(lo, JSON.stringify(v)).toBeCloseTo(Math.min(v.l1, v.l2), 9)
      expect(hi, JSON.stringify(v)).toBeCloseTo(Math.max(v.l1, v.l2), 9)
      expect(v.l1).not.toBe(v.l2)
      expect(v.c).not.toBe(0)
    }
  })
})

describe('two pendulums joined by a spring (normal modes as roots)', () => {
  it('L = 1 m, m = 1 kg, k = 4 N/m, g = 9.8: ω = √9.8 = 3.1305 and √17.8 = 4.2190 rad/s', () => {
    const q = byId('physlab-uni-normal-modes')
    const pl = played(q, { L: 1, m: 1, k: 4, g: 9.8 })
    expect(values(pl).w1).toBeCloseTo(Math.sqrt(9.8), 12)
    expect(values(pl).w2).toBeCloseTo(Math.sqrt(9.8 + 8), 12)
    expect(values(pl).w1).toBeCloseTo(3.1305, 4)
    expect(values(pl).w2).toBeCloseTo(4.219, 4)
    expect(mark(pl, 0, '3.13, 4.22').verdict).toBe('right')
    expect(mark(pl, 0, '4.22').message).toMatch(/1 of the 2/)
  })

  it('takes its frequencies from the matrix’s eigenvalues on every draw, and keeps them more than 2 % apart', () => {
    for (const v of everyDraw(byId('physlab-uni-normal-modes'))) {
      const diag = v.g / v.L + v.k / v.m
      const off = -v.k / v.m
      // A symmetric [[p, q], [q, p]] has eigenvalues p ± q.
      expect(v.w1 ** 2).toBeCloseTo(diag + off, 9)
      expect(v.w2 ** 2).toBeCloseTo(diag - off, 9)
      expect(v.w2 / v.w1).toBeGreaterThan(1.04)
    }
  })
})

describe('the inverse of a 2 × 2 matrix (a matrix answer)', () => {
  it('[[2, 1], [1, 3]] has inverse [[0.6, −0.2], [−0.2, 0.4]]; fractions are accepted; one wrong entry earns 3 of 4', () => {
    const q = byId('physlab-uni-matrix-inverse')
    const pl = played(q, { a: 2, b: 1, c: 1, d: 3 })
    expect(values(pl).D).toBe(5)
    expect(mark(pl, 0, [['0.6', '-0.2'], ['-0.2', '0.4']]).verdict).toBe('right')
    expect(mark(pl, 0, [['3/5', '-1/5'], ['-1/5', '2/5']]).verdict).toBe('right')
    const one = markPlayed(pl, { p0: [['0.6', '-0.2'], ['0.2', '0.4']] }, SETTINGS).p0
    expect(one.verdict).toBe('wrong')
    expect(one.marks).toBe(3)
    expect(one.outOf).toBe(4)
  })

  it('gives an inverse that multiplies back to the identity on every draw, with a determinant of ±1, ±2, ±4 or ±5', () => {
    const draws = everyDraw(byId('physlab-uni-matrix-inverse'))
    expect(draws.length).toBeGreaterThan(20)
    for (const v of draws) {
      expect([1, 2, 4, 5]).toContain(Math.abs(v.D))
      const A = [[v.a, v.b], [v.c, v.d]]
      const B = [[v.i11, v.i12], [v.i21, v.i22]]
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) expect(A[i][0] * B[0][j] + A[i][1] * B[1][j]).toBeCloseTo(i === j ? 1 : 0, 12)
    }
  })
})

describe('torque as a cross product (a 3-D vector answer)', () => {
  it('r = (2, −1, 1) m, F = (3, 2, −2) N: τ = (0, 7, 7) N·m, |τ| = 7√2 = 9.8995 N·m', () => {
    const q = byId('physlab-uni-torque-vector')
    const pl = played(q, { rx: 2, ry: -1, rz: 1, Fx: 3, Fy: 2, Fz: -2 })
    expect([values(pl).tx, values(pl).ty, values(pl).tz]).toEqual([0, 7, 7])
    expect(mark(pl, 0, '7j + 7k').verdict).toBe('right')
    expect(mark(pl, 0, '(0, 7, 7) N·m').verdict).toBe('right')
    // F × r is the same size, pointing the opposite way.
    expect(mark(pl, 0, '(0, -7, -7)').message).toMatch(/opposite way/)
    expect(mark(pl, 0, '(7, 0, 7)').message).toMatch(/swapped/)
    expect(part(pl, 1).field!.value).toBeCloseTo(7 * Math.SQRT2, 12)
    expect(isCorrect(mark(pl, 1, '9.9 N·m'))).toBe(true)
    // The arrows are labelled in their own units, never the grid's bare "u".
    const plan = picturePlan(q.picture!, pl, SETTINGS)
    if (plan.kind !== 'vectors') throw new Error('expected a vectors picture')
    expect(plan.items.map((it) => [it.name, it.unit])).toEqual([['r', 'm'], ['F', 'N']])
  })

  it('is at right angles to both r and F on every draw, with a z part that is never 0', () => {
    for (const v of everyDraw(byId('physlab-uni-torque-vector'))) {
      expect(v.tx * v.rx + v.ty * v.ry + v.tz * v.rz).toBe(0)
      expect(v.tx * v.Fx + v.ty * v.Fy + v.tz * v.Fz).toBe(0)
      expect(v.tz).not.toBe(0)
    }
  })
})

describe('the anharmonic oscillator’s ground state, stated with an uncertainty (Eₙ)', () => {
  /** Lowest eigenvalue of a symmetric matrix by Jacobi rotations. */
  const lowestEigenvalue = (M: number[][]): number => {
    const n = M.length
    const A = M.map((r) => r.slice())
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] ** 2
      if (off < 1e-28) break
      for (let p = 0; p < n; p++) {
        for (let q = p + 1; q < n; q++) {
          if (A[p][q] === 0) continue
          const th = (A[q][q] - A[p][p]) / (2 * A[p][q])
          const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1))
          const c = 1 / Math.sqrt(t * t + 1)
          const s = t * c
          for (let k = 0; k < n; k++) {
            const akp = A[k][p]
            const akq = A[k][q]
            A[k][p] = c * akp - s * akq
            A[k][q] = s * akp + c * akq
          }
          for (let k = 0; k < n; k++) {
            const apk = A[p][k]
            const aqk = A[q][k]
            A[p][k] = c * apk - s * aqk
            A[q][k] = s * apk + c * aqk
          }
        }
      }
    }
    return Math.min(...A.map((r, i) => r[i]))
  }

  /** H = ½p² + ½x² + λx⁴ in the first N harmonic-oscillator states: x has ⟨n|x|n+1⟩ = √((n+1)/2); x⁴ is taken from a larger x so no entry is cut short. */
  const hamiltonian = (N: number, lam: number): number[][] => {
    const M = N + 4
    const X = Array.from({ length: M }, () => new Array<number>(M).fill(0))
    for (let i = 0; i + 1 < M; i++) X[i][i + 1] = X[i + 1][i] = Math.sqrt((i + 1) / 2)
    const mul = (A: number[][], B: number[][]) => A.map((row) => B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0)))
    const X2 = mul(X, X)
    const X4 = mul(X2, X2)
    return Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => (i === j ? i + 0.5 : 0) + lam * X4[i][j]))
  }

  it('E₀ at λ = 0.1 is 0.559146 from a diagonalisation in 40 states, settled to 10⁻⁹ (30 states give the same), and it is the part’s own answer', () => {
    const q = byId('physlab-uni-anharmonic-ground-state')
    const pl = playQuestion(q, 1, SETTINGS)
    expect(values(pl).lam).toBe(0.1)
    const e40 = lowestEigenvalue(hamiltonian(40, 0.1))
    expect(e40).toBeCloseTo(0.559146, 6)
    expect(Math.abs(lowestEigenvalue(hamiltonian(30, 0.1)) - e40)).toBeLessThan(1e-9)
    // λ = 0 is the harmonic oscillator exactly.
    expect(lowestEigenvalue(hamiltonian(40, 0))).toBeCloseTo(0.5, 12)
    const stated = q.parts[1]
    if (stated.type !== 'number' || stated.tolerance.kind !== 'stated') throw new Error('expected a stated part')
    expect(Math.abs(ev(stated.answer, values(pl)) - e40)).toBeLessThanOrEqual(ev(stated.tolerance.uref, values(pl)))
  })

  it('the series’ partial sums ½ + ¾λ − (21/8)λ² + (333/16)λ³ − (30885/128)λ⁴ give 0.575, 0.549, 0.570, 0.545, and each “± 0.002” is marked wrong', () => {
    const q = byId('physlab-uni-anharmonic-ground-state')
    const pl = playQuestion(q, 1, SETTINGS)
    const coeffs = [1 / 2, 3 / 4, -21 / 8, 333 / 16, -30885 / 128]
    const sums: number[] = []
    coeffs.reduce((acc, c, i) => {
      const next = acc + c * 0.1 ** i
      if (i > 0) sums.push(next)
      return next
    }, 0)
    expect(sums.map((s) => Number(s.toFixed(3)))).toEqual([0.575, 0.549, 0.57, 0.545])
    // The file's own partial sums, used in its steps, are the same numbers.
    expect([values(pl).S1, values(pl).S2, values(pl).S3, values(pl).S4].map((s) => Number(s.toFixed(9)))).toEqual(sums.map((s) => Number(s.toFixed(9))))
    for (const s of ['0.575', '0.549', '0.570', '0.545']) expect(mark(pl, 1, `${s} ± 0.002`).verdict, s).toBe('wrong')
  })

  it('marks the stated E₀ by the Eₙ test: 0.55915 ± 0.00001 right; the bell-curve bound 0.5603 ± 0.0012 right but ± 0.001 wrong; a bare number asks for its uncertainty; ± 0.1 is refused', () => {
    const q = byId('physlab-uni-anharmonic-ground-state')
    const pl = playQuestion(q, 1, SETTINGS)
    expect(mark(pl, 1, '0.55915 ± 0.00001').verdict).toBe('right')
    expect(mark(pl, 1, '0.5603 ± 0.0012').verdict).toBe('right')
    expect(mark(pl, 1, '0.5603 ± 0.001').verdict).toBe('wrong')
    const bare = mark(pl, 1, '0.5591')
    expect(bare.verdict).not.toBe('right')
    expect(bare.message).toMatch(/uncertainty|±/)
    expect(mark(pl, 1, '0.6 ± 0.1').message).toMatch(/at most 10 %/)
  })

  it('the bell-curve (Gaussian) variational bound: α³ − α − 6λ = 0 gives α = 1.2212 and E = 0.560307, above E₀ as a bound must be', () => {
    const q = byId('physlab-uni-anharmonic-ground-state')
    const v = values(playQuestion(q, 1, SETTINGS))
    const E = (a: number) => a / 4 + 1 / (4 * a) + (3 * 0.1) / (4 * a * a)
    // Golden-section search for the smallest E(α), independent of the file's closed form.
    let lo = 0.5
    let hi = 3
    const g = (Math.sqrt(5) - 1) / 2
    for (let i = 0; i < 200; i++) {
      const a = hi - g * (hi - lo)
      const b = lo + g * (hi - lo)
      if (E(a) < E(b)) hi = b
      else lo = a
    }
    expect(v.alpha).toBeCloseTo((lo + hi) / 2, 6)
    expect(v.alpha).toBeCloseTo(1.2212, 4)
    expect(v.Evar).toBeCloseTo(E((lo + hi) / 2), 10)
    expect(v.Evar).toBeCloseTo(0.560307, 6)
    expect(v.Evar).toBeGreaterThan(lowestEigenvalue(hamiltonian(40, 0.1)))
  })

  it('first order gives ½ + ¾(0.1) = 0.575; ⟨x⁴⟩ taken as 1 (0.6) is named', () => {
    const pl = playQuestion(byId('physlab-uni-anharmonic-ground-state'), 1, SETTINGS)
    expect(part(pl, 0).field!.value).toBeCloseTo(0.575, 12)
    expect(isCorrect(mark(pl, 0, '0.575'))).toBe(true)
    expect(mark(pl, 0, '0.6').message).toMatch(/⟨x⁴⟩ as 1/)
  })
})

describe('two labs compared by Eₙ (a showIf pair of choices)', () => {
  it('9.81 ± 0.02 against 9.76 ± 0.01 m/s²: Eₙ = 0.05/√0.0005 = 2.2361, so they disagree, and only the “disagree” part is shown', () => {
    const q = byId('physlab-uni-two-labs-agree')
    const pl = played(q, { gA: 9.81, uA: 0.02, gB: 9.76, uB: 0.01 })
    expect(values(pl).En).toBeCloseTo(0.05 / Math.sqrt(0.02 ** 2 + 0.01 ** 2), 9)
    expect(values(pl).En).toBeCloseTo(2.2361, 4)
    expect(pl.parts.map((p) => p.index)).toEqual([0, 2])
    expect(isCorrect(mark(pl, 0, '2.24'))).toBe(true)
    expect(mark(pl, 0, String(0.05 / 0.03)).message).toMatch(/quadrature/)
    const disagree = part(pl, 2).choices!.findIndex((c) => /disagree/.test(c.text))
    expect(mark(pl, 2, [disagree]).verdict).toBe('right')
    for (let i = 0; i < part(pl, 2).choices!.length; i++) if (i !== disagree) expect(mark(pl, 2, [i]).verdict, `choice ${i}`).toBe('wrong')
  })

  it('9.82 ± 0.01 against 9.81 ± 0.04: Eₙ = 0.2425, they agree, and only the “agree” part is shown', () => {
    const q = byId('physlab-uni-two-labs-agree')
    const pl = played(q, { gA: 9.82, uA: 0.01, gB: 9.81, uB: 0.04 })
    expect(values(pl).En).toBeCloseTo(0.01 / Math.sqrt(0.0017), 6)
    expect(pl.parts.map((p) => p.index)).toEqual([0, 1])
    const agree = part(pl, 1).choices!.findIndex((c) => /^Yes/.test(c.text))
    expect(mark(pl, 1, [agree]).verdict).toBe('right')
  })

  it('shows exactly one of the two choice parts on every seed, the one whose right answer matches Eₙ, and keeps Eₙ clear of 1', () => {
    const q = byId('physlab-uni-two-labs-agree')
    let agree = 0
    let disagree = 0
    for (let seed = 1; seed <= 200; seed++) {
      const pl = playQuestion(q, seed, SETTINGS)
      const choices = pl.parts.filter((p) => p.part.type === 'choice')
      expect(choices, `seed ${seed}`).toHaveLength(1)
      const right = choices[0].choices!.find((c) => c.correct)!.text
      const En = values(pl).En
      expect(Math.abs(En - 1)).toBeGreaterThanOrEqual(0.15)
      if (En <= 1) {
        expect(right).toMatch(/^Yes/)
        agree++
      } else {
        expect(right).toMatch(/disagree/)
        disagree++
      }
    }
    // Both verdicts come up, so the answer is never the same every time.
    expect(agree).toBeGreaterThan(20)
    expect(disagree).toBeGreaterThan(20)
  })
})

describe('the proof that the air always shortens the stop', () => {
  it('ln(1 + z) < z for every z the question draws and on a fine sweep, so the ratio ln(1 + z)/z is below 1; at z = 1 it is ln 2 = 0.6931', () => {
    const q = byId('physlab-uni-drag-shortens-stop')
    for (let z = 0.001; z < 50; z *= 1.1) expect(Math.log(1 + z)).toBeLessThan(z)
    for (const v of everyDraw(q)) expect(v.ratio).toBeLessThan(1)
    const pl = played(q, { z: 1 })
    expect(part(pl, 1).field!.value).toBeCloseTo(Math.LN2, 12)
    expect(isCorrect(mark(pl, 1, '0.693'))).toBe(true)
    expect(mark(pl, 1, String(Math.log10(2))).message).toMatch(/base 10/)
    expect(mark(pl, 1, '0.5').message).toMatch(/start of the series/)
  })
})
