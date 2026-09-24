// The practice problems and the answer checker. If these pass, a student is never marked wrong
// for a right answer, and the number they are checked against is the number PhysLab's own
// step-by-step solution works out.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generate, generateSet, TOPICS, type AnswerField } from '../src/renderer/src/math/problems'
import { checkAnswer, expectedText, isCorrect, parseAnswer } from '../src/renderer/src/math/checkAnswer'
import { getAngleMode, setAngleMode } from '../src/renderer/src/math/expr'
import { resetGlobals } from './helpers/globals'
import { hasVisual, INFERRED_NOTE, visualOf } from '../src/renderer/src/questions/autoVisual'
import { loadBundled } from '../src/renderer/src/questions/bank'
import { drawVariables } from '../src/renderer/src/questions/variables'
import { planDrawing, solveTorque } from '../src/renderer/src/math/vectorSolver'

beforeEach(resetGlobals)

/** Every number written anywhere in a worked solution, as plain magnitudes. */
function numbersIn(text: string): number[] {
  const out: number[] = []
  for (const m of text.replace(/−/g, '-').matchAll(/\d+(?:\.\d+)?/g)) out.push(Number(m[0]))
  return out
}

const field = (over: Partial<AnswerField> = {}): AnswerField => ({ key: 'a', label: 'A', value: 12.5, tol: 0.125, ...over })

describe('practice problems', () => {
  it('gives the same problem for the same seed, and different ones for different seeds', () => {
    const a = generate('add', 4242)
    const b = generate('add', 4242)
    const c = generate('add', 99)
    expect(a.prompt).toBe(b.prompt)
    expect(a.fields.map((f) => f.value)).toEqual(b.fields.map((f) => f.value))
    expect(a.prompt).not.toBe(c.prompt)
  })

  it('every topic makes a usable question at every seed', () => {
    for (const topic of TOPICS) {
      for (let seed = 1; seed <= 40; seed++) {
        const p = generate(topic.id, seed * 7919)
        expect(p.prompt.length, `${topic.id} prompt`).toBeGreaterThan(10)
        expect(p.fields.length, `${topic.id} fields`).toBeGreaterThan(0)
        expect(p.solution.steps.length, `${topic.id} steps`).toBeGreaterThan(0)
        expect(p.solution.answers.length, `${topic.id} answers`).toBeGreaterThan(0)
        for (const f of p.fields) {
          expect(Number.isFinite(f.value), `${topic.id}.${f.key} value`).toBe(true)
          expect(f.tol, `${topic.id}.${f.key} tolerance`).toBeGreaterThan(0)
          for (const trap of f.traps ?? []) expect(Number.isFinite(trap.value), `${topic.id}.${f.key} trap`).toBe(true)
        }
      }
    }
  })

  it('marks against the number its own worked solution arrives at', () => {
    for (const topic of TOPICS) {
      for (let seed = 1; seed <= 25; seed++) {
        const p = generate(topic.id, seed * 104729)
        // Signs are compared loosely: LaTeX writes "3 - 4\hat{j}", so the minus is not part of the number.
        const shown = numbersIn([...p.solution.answers.map((a) => a.tex), ...p.solution.steps.map((s) => s.tex ?? '')].join(' '))
        for (const f of p.fields) {
          const want = Math.abs(f.value)
          const tol = Math.max(f.tol, want * 0.01, 0.01)
          expect(shown.some((n) => Math.abs(n - want) <= tol), `${topic.id}.${f.key}: ${want} is never shown in the solution`).toBe(true)
        }
      }
    }
  })

  it('accepts the answer it says is right, for every field of every topic', () => {
    for (const topic of TOPICS) {
      const p = generate(topic.id, 20260916)
      for (const f of p.fields) {
        expect(isCorrect(checkAnswer(String(f.value), f)), `${topic.id}.${f.key}`).toBe(true)
      }
    }
  })

  it('reveals the answer in the student’s own precision', () => {
    expect(expectedText(field({ value: 12.3456789, unit: 'N' }))).toBe('12.3457 N')
    expect(expectedText(field({ value: 12.3456789, unit: 'N' }), { decimals: 2, precisionMode: 'dp' })).toBe('12.35 N')
    expect(expectedText(field({ value: 12.3456789 }), { decimals: 3, precisionMode: 'sf' })).toBe('12.3')
  })

  it('spreads a set over the chosen topics', () => {
    const set = generateSet(['dot', 'cross'], 6, 7)
    expect(set).toHaveLength(6)
    expect(new Set(set.map((p) => p.topic))).toEqual(new Set(['dot', 'cross']))
    expect(new Set(set.map((p) => p.id)).size).toBe(6)
  })
})

describe('reading what the student typed', () => {
  it('takes numbers, expressions and units', () => {
    expect(parseAnswer('12.5')).toBeCloseTo(12.5)
    expect(parseAnswer('12.5 N')).toBeCloseTo(12.5)
    expect(parseAnswer('37°')).toBeCloseTo(37)
    expect(parseAnswer('−3.4')).toBeCloseTo(-3.4)
    expect(parseAnswer('5*sqrt(2)')).toBeCloseTo(7.0711, 3)
    expect(parseAnswer('3/4')).toBeCloseTo(0.75)
    expect(parseAnswer('2 m/s')).toBeCloseTo(2)
  })

  it('does not eat the maths', () => {
    expect(parseAnswer('sin(30)')).toBeCloseTo(0.5)
    // Thousands separators go; a comma anywhere else is not silently dropped.
    expect(parseAnswer('1,234.5')).toBeCloseTo(1234.5)
    expect(parseAnswer('12,345,678')).toBe(12345678)
    expect(parseAnswer('1,5')).toBeNull()
    // The question is set in degrees whatever mode the calculator was left in.
    setAngleMode('rad')
    expect(parseAnswer('sin(30)')).toBeCloseTo(0.5)
    expect(getAngleMode()).toBe('rad')
    setAngleMode('deg')
    expect(parseAnswer('')).toBeNull()
    expect(parseAnswer('no idea')).toBeNull()
  })
})

describe('checking an answer', () => {
  it('accepts what is right and flags what is not', () => {
    const f = field()
    expect(checkAnswer('12.5', f).verdict).toBe('right')
    expect(checkAnswer('12.55', f).verdict).toBe('right')
    expect(checkAnswer('12.8', f).verdict).toBe('close')
    expect(checkAnswer('40', f).verdict).toBe('wrong')
    expect(checkAnswer('', f).verdict).toBe('empty')
    expect(checkAnswer('banana', f).verdict).toBe('unreadable')
  })

  it('names the mistake instead of just saying no', () => {
    const swapped = field({ value: 8.66, tol: 0.09, traps: [{ value: 5, why: 'That is F sin θ.' }] })
    expect(checkAnswer('5', swapped).message).toContain('F sin θ')

    const signed = field({ value: 7, tol: 0.07 })
    expect(checkAnswer('-7', signed).message).toMatch(/wrong sign/i)

    const tenfold = field({ value: 7, tol: 0.07 })
    expect(checkAnswer('70', tenfold).message).toMatch(/power of ten/i)
  })

  it('understands directions', () => {
    // 233.13° is which way a vector points, so it is a 'direction': an angle between two vectors
    // has no quadrants and no full turns.
    const th = field({ value: 233.13, tol: 0.6, kind: 'direction' })
    // The same direction written as a negative angle is still the same direction.
    expect(checkAnswer('-126.87', th).verdict).toBe('right')
    // The reference angle from tan⁻¹ without looking at the signs.
    expect(checkAnswer('53.13', th).message).toMatch(/quadrant/i)
    // Calculator left in radians.
    expect(checkAnswer('4.0691', field({ value: 233.13, tol: 0.6, kind: 'direction' })).message).toMatch(/radians/i)
    expect(checkAnswer('4.0691', field({ value: 233.13, tol: 0.6, kind: 'angle' })).message).toMatch(/radians/i)
  })

  it('names a close answer but does not count it: one 2 % rule for the whole app (docs/ACCURACY.md)', () => {
    // 12.8 on 12.5 is 2.4 % out. It used to be ticked as "close"; the policy accepts nothing more
    // than the tolerance, and the sentence about rounding early stays, under a cross.
    const f = field({ value: 12.5, tol: 0.125 })
    expect(checkAnswer('12.8', f).verdict).toBe('close')
    expect(isCorrect(checkAnswer('12.8', f))).toBe(false)
    expect(isCorrect(checkAnswer('12.6', f))).toBe(true)
    expect(isCorrect(checkAnswer('14', f))).toBe(false)
  })
})

// Fix 21 in Practice (QV2): "Show the picture" is offered for every question and every vector
// topic — an authored picture/motion/experiment, or, failing that, a picture PhysLab could infer
// (never the empty fallback, which is only ever allowed for a teacher's or an imported file).
describe('Fix 21: a visual for every practice question and vector topic', () => {
  it('every bundled question has an authored or non-fallback visual', () => {
    const bundled = loadBundled()
    expect(bundled.questions.length).toBeGreaterThan(0)
    for (const q of bundled.questions) {
      for (let seed = 1; seed <= 3; seed++) {
        const variant = drawVariables(q, seed)
        const plan = visualOf(q, variant)
        expect(plan.source, `${q.id} #${seed}`).not.toBe('fallback')
        expect(hasVisual(plan), `${q.id} #${seed}`).toBe(true)
      }
    }
  })

  it('an author\'s question with a picture and an experiment (or a motion) offers each of them', async () => {
    // The panel module reads the desktop bridge off window when it loads; a node test has none.
    vi.stubGlobal('window', globalThis)
    const { visualButtons } = await import('../src/renderer/src/panels/Practice')
    vi.unstubAllGlobals()
    const bundled = loadBundled().questions
    const withPicture = bundled.find((q) => q.picture)!
    const withMotion = bundled.find((q) => q.motion)!
    const withSandbox = bundled.find((q) => q.sandbox)!
    const plan = (q: typeof withPicture) => visualOf(q, drawVariables(q, 1))
    // One visual: one button.
    expect(visualButtons(plan(withPicture))).toEqual(['first'])
    expect(visualButtons(plan(withMotion))).toEqual(['first'])
    expect(visualButtons(plan(withSandbox))).toEqual(['first'])
    // Picture + experiment: "Show the picture" and "Open the experiment" (one button lost the experiment).
    expect(visualButtons(plan({ ...withPicture, sandbox: withSandbox.sandbox }))).toEqual(['first', 'experiment'])
    // Picture + motion: "Show the picture" and "Draw the motion".
    expect(visualButtons(plan({ ...withPicture, motion: withMotion.motion }))).toEqual(['first', 'motion'])
    // Motion + experiment: the motion is drawn first, the experiment keeps its own button.
    expect(visualButtons(plan({ ...withMotion, sandbox: withSandbox.sandbox }))).toEqual(['first', 'experiment'])
    // All three: every one the author gave it.
    expect(visualButtons(plan({ ...withPicture, motion: withMotion.motion, sandbox: withSandbox.sandbox }))).toEqual(['first', 'motion', 'experiment'])
  })

  it('says "PhysLab drew this from the question\'s numbers" under a fallback number line as under an inferred picture', async () => {
    vi.stubGlobal('window', globalThis)
    const { drawnNote } = await import('../src/renderer/src/panels/Practice')
    vi.unstubAllGlobals()
    const bundled = loadBundled().questions
    const plan = (q: (typeof bundled)[number]) => visualOf(q, drawVariables(q, 1))
    // A teacher's arithmetic question: nothing to infer, so its given numbers on a number line.
    const sum = {
      ...bundled[0],
      picture: undefined,
      motion: undefined,
      sandbox: undefined,
      statement: 'What is {a} + {b}?',
      variables: [{ name: 'a', def: { kind: 'list' as const, items: [3] } }, { name: 'b', def: { kind: 'list' as const, items: [4] } }],
      parts: [{ type: 'number' as const, prompt: 'The sum', answer: 'a + b', unit: 'none' as const, tolerance: { kind: 'absolute' as const, value: 0 }, marks: 1 }]
    }
    const fallback = plan(sum)
    expect(fallback.source).toBe('fallback')
    expect(drawnNote(fallback, 'ready')).toBe(INFERRED_NOTE)
    const inferred = plan(bundled.find((q) => !q.picture && !q.motion && !q.sandbox && plan(q).source === 'inferred')!)
    expect(drawnNote(inferred, 'ready')).toBe(INFERRED_NOTE)
    // Not while it waits for the answer, and never under the author's own picture.
    expect(drawnNote(inferred, 'after-answer')).toBeUndefined()
    expect(drawnNote(plan(bundled.find((q) => q.picture)!), 'ready')).toBeUndefined()
  })

  it('torque draws r and F from one pivot, with no parallelogram sides', () => {
    // solveCross's parallelogram pictures |A×B| as an area; for a lever arm it is meaningless.
    const torque = solveTorque([0.5, 0, 0], [0, 20, 0])
    expect(torque.visual!.mode).toBe('common-tail')
    const drawing = planDrawing(torque.visual!)
    expect(drawing.items.some((it) => it.kind === 'ghost')).toBe(false)
    const arrows = drawing.items.filter((it) => it.kind === 'arrow')
    expect(arrows.length).toBeGreaterThanOrEqual(3)
    for (const a of arrows) if (a.kind === 'arrow') expect(a.tail, a.name).toEqual([0, 0, 0])
  })

  it('a vector topic\'s buttons, Show in scene among them, are 44 px targets', () => {
    // The root font is 13 px, so min-h-11 would be 36 px: the target is min-h-[44px].
    const panel = readFileSync(join(__dirname, '../src/renderer/src/panels/Practice.tsx'), 'utf8')
    const row = panel.slice(panel.indexOf('const vp = item.problem'))
    for (const label of ['<Check size={13} /> Check my answer', "{hints === 0 ? 'Hint' : 'Next hint'}", 'Show the full solution', '<Eye size={13} /> Show in scene']) {
      const at = row.indexOf(label)
      expect(at, label).toBeGreaterThan(0)
      expect(row.slice(row.lastIndexOf('<button', at), at), label).toContain('min-h-[44px]')
    }
  })

  it('every TOPICS entry\'s problem has solution.visual over 20 seeds', () => {
    for (const topic of TOPICS) {
      for (let seed = 1; seed <= 20; seed++) {
        const p = generate(topic.id, seed * 65599)
        expect(p.solution.visual, `${topic.id} #${seed}`).toBeDefined()
        expect(p.solution.visual!.vectors.length, `${topic.id} #${seed}`).toBeGreaterThan(0)
      }
    }
  })
})
