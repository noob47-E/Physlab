// The rung 1 "first look" set (QD1): tap a picture, count the dots, say which arrow is longer —
// no formula, no algebra, every answer read straight off the drawing. Headless: no DOM.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The stylesheet is not loaded here, so the drawing's colours fall back, as questionPlayer.test.ts does.
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { resetGlobals } from './helpers/globals'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import { math, preprocess } from '../src/renderer/src/math/expr'
import { scene } from '../src/renderer/src/core/store'
import { loadBundled } from '../src/renderer/src/questions/bank'
import { bandOf } from '../src/renderer/src/questions/pqjson'
import { checkPlayedPart, picturePlan, playQuestion, showPicture } from '../src/renderer/src/questions/player'

beforeEach(() => resetGlobals())

const SETTINGS: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }

/** Only this track's own questions — the bank also holds the sample set and whatever else lands beside it. */
const firstLook = () => loadBundled().questions.filter((q) => q.id.startsWith('physlab-firstlook-'))

describe('the rung 1 "first look" set', () => {
  it('has 12 questions, every one on rung 1, CC BY 4.0 from PhysLab', () => {
    const qs = firstLook()
    expect(qs).toHaveLength(12)
    for (const q of qs) {
      expect(q.rung, q.id).toBe(1)
      expect(q.license, q.id).toMatchObject({ id: 'CC BY 4.0', holder: 'PhysLab' })
    }
  })

  it('gives every question a picture: curves, dots or vectors, split evenly four and four and four', () => {
    const qs = firstLook()
    for (const q of qs) {
      expect(q.picture, q.id).toBeDefined()
      expect(['curves', 'dots', 'vectors'], q.id).toContain(q.picture!.kind)
    }
    for (const kind of ['curves', 'dots', 'vectors'] as const) {
      expect(qs.filter((q) => q.picture!.kind === kind), kind).toHaveLength(4)
    }
  })

  it('puts no formula text in any statement: no display maths, no LaTeX command, no equals sign', () => {
    for (const q of firstLook()) {
      expect(q.statement, q.id).not.toMatch(/\$\$/)
      expect(q.statement, q.id).not.toMatch(/\\[A-Za-z]/)
      expect(q.statement, q.id).not.toMatch(/=/)
    }
  })

  it('marks every number part exactly: tolerance 0', () => {
    for (const q of firstLook()) {
      for (const p of q.parts) {
        if (p.type !== 'number') continue
        expect(bandOf(p.tolerance).value, `${q.id} ${p.prompt}`).toBe(0)
      }
    }
  })

  it('gives every choice part at least 3 options, all with distinct text and exactly one right', () => {
    for (const q of firstLook()) {
      for (const p of q.parts) {
        if (p.type !== 'choice') continue
        expect(p.choices.length, q.id).toBeGreaterThanOrEqual(3)
        expect(new Set(p.choices.map((c) => c.text)).size, q.id).toBe(p.choices.length)
        expect(p.choices.filter((c) => c.correct).length, q.id).toBe(1)
      }
    }
  })

  it('draws every picture with no problem, on several seeds', () => {
    scene().newScene()
    for (const q of firstLook()) {
      for (const seed of [1, 2, 3, 11, 25]) {
        const played = playQuestion(q, seed, SETTINGS)
        expect(played.problems, `${q.id} seed ${seed}`).toEqual([])
        const plan = picturePlan(q.picture!, played, SETTINGS)
        expect(() => showPicture(plan, SETTINGS), `${q.id} seed ${seed}`).not.toThrow()
      }
    }
  })

  it('always answers "which stops further away" / "which arrow is longer" the way its own picture draws it, over many seeds', () => {
    scene().newScene()
    const choiceQs = firstLook().filter((q) => q.parts[0].type === 'choice')
    expect(choiceQs).toHaveLength(8)
    for (const q of choiceQs) {
      for (let seed = 1; seed <= 30; seed++) {
        const played = playQuestion(q, seed, SETTINGS)
        const p = played.parts[0]
        const rightIndices = p.choices!.flatMap((c, i) => (c.correct ? [i] : []))
        expect(rightIndices, `${q.id} seed ${seed}`).toHaveLength(1)
        expect(checkPlayedPart(p, rightIndices, played, SETTINGS).verdict, `${q.id} seed ${seed}`).toBe('right')
        // Every other single choice is marked wrong — a student who taps the other one, or "the same", never scrapes by.
        for (let i = 0; i < p.choices!.length; i++) {
          if (i === rightIndices[0]) continue
          expect(checkPlayedPart(p, [i], played, SETTINGS).verdict, `${q.id} seed ${seed} choice ${i}`).not.toBe('right')
        }
      }
    }
  })

  it('counts its dots exactly, over many seeds, and never accepts one dot off', () => {
    scene().newScene()
    const dotQs = firstLook().filter((q) => q.picture!.kind === 'dots')
    expect(dotQs).toHaveLength(4)
    for (const q of dotQs) {
      for (let seed = 1; seed <= 30; seed++) {
        const played = playQuestion(q, seed, SETTINGS)
        const p = played.parts[0]
        const plan = picturePlan(q.picture!, played, SETTINGS)
        if (plan.kind !== 'dots') throw new Error('expected a dots picture')
        expect(p.field!.value, `${q.id} seed ${seed}`).toBe(plan.count)
        expect(checkPlayedPart(p, String(plan.count), played, SETTINGS).verdict, `${q.id} seed ${seed}`).toBe('right')
        expect(checkPlayedPart(p, String(plan.count - 1), played, SETTINGS).verdict, `${q.id} seed ${seed} minus one`).not.toBe('right')
        expect(checkPlayedPart(p, String(plan.count + 1), played, SETTINGS).verdict, `${q.id} seed ${seed} plus one`).not.toBe('right')
      }
    }
  })

  it('never lets the dots picture give its count away: every count needs two rows or more, and neither a number in the note nor any dot position equals it', () => {
    const dotQs = firstLook().filter((q) => q.picture!.kind === 'dots')
    expect(dotQs).toHaveLength(4)
    for (const q of dotQs) {
      // Every value the count can take, straight from the variable's definition, not only the ones some seeds happen to draw.
      const def = q.variables.find((v) => v.name === 'n')!.def
      const counts =
        def.kind === 'range' ? Array.from({ length: Math.round((Number(def.to) - Number(def.from)) / Number(def.step ?? 1)) + 1 }, (_, i) => Number(def.from) + i * Number(def.step ?? 1))
        : def.kind === 'list' ? def.items.map(Number)
        : []
      expect(counts.length, q.id).toBeGreaterThan(1)
      const perRow = q.picture!.kind === 'dots' ? Number(q.picture!.perRow) : NaN
      // One row only (count <= perRow) puts the last dot over the tick numbered count, and "rows of 5" for 5 dots is the answer.
      for (const c of counts) expect(c, `${q.id} count ${c}`).toBeGreaterThan(perRow)
      for (let seed = 1; seed <= 40; seed++) {
        scene().newScene()
        const played = playQuestion(q, seed, SETTINGS)
        const plan = picturePlan(q.picture!, played, SETTINGS)
        if (plan.kind !== 'dots') throw new Error('expected a dots picture')
        expect(plan.count, `${q.id} seed ${seed}`).toBeGreaterThan(plan.perRow)
        const { note } = showPicture(plan, SETTINGS)
        const shown = (note ?? '').match(/\d+(?:\.\d+)?/g)?.map(Number) ?? []
        expect(shown, `${q.id} seed ${seed} note: ${note}`).not.toContain(plan.count)
        const dots = scene().order.map((id) => scene().objects[id]).filter((o) => o.type === 'point') as unknown as { def: { p: number[] } }[]
        expect(dots, `${q.id} seed ${seed}`).toHaveLength(plan.count)
        for (const d of dots) {
          expect(d.def.p[0], `${q.id} seed ${seed} dot x`).not.toBe(plan.count)
          expect(d.def.p[1], `${q.id} seed ${seed} dot y`).not.toBe(plan.count)
        }
      }
    }
  })

  it('draws its two "which is longer" pictures so the correct choice is always the longer one, over many seeds', () => {
    scene().newScene()
    const trains = firstLook().filter((q) => q.picture!.kind === 'curves')
    for (const q of trains) {
      for (const seed of [1, 5, 12, 20]) {
        const played = playQuestion(q, seed, SETTINGS)
        const plan = picturePlan(q.picture!, played, SETTINGS)
        if (plan.kind !== 'curves') throw new Error('expected a curves picture')
        // The area under each line is a triangle: half its own base (where it meets zero) times its own height (its value at x = 0).
        const heightAt0 = (expr: string): number => Number(math.evaluate(preprocess(expr), { x: 0 }))
        const areas = plan.items.map((it) => 0.5 * ((it.to ?? 0) - (it.from ?? 0)) * heightAt0(it.expr))
        expect(areas[0]).not.toBeCloseTo(areas[1], 6)
        const bigger = areas[0] > areas[1] ? 0 : 1
        const rightIndex = played.parts[0].choices!.findIndex((c) => c.correct)
        const rightLabel = played.parts[0].choices![rightIndex].text
        expect(rightLabel, `${q.id} seed ${seed}`).toBe(plan.items[bigger].label)
      }
    }

    const arrows = firstLook().filter((q) => q.picture!.kind === 'vectors')
    for (const q of arrows) {
      for (const seed of [1, 5, 12, 20]) {
        const played = playQuestion(q, seed, SETTINGS)
        const plan = picturePlan(q.picture!, played, SETTINGS)
        if (plan.kind !== 'vectors') throw new Error('expected a vectors picture')
        const lengths = plan.items.map((it) => Math.hypot(it.v[0], it.v[1], it.v[2]))
        const longer = lengths[0] > lengths[1] ? 0 : 1
        expect(lengths[0]).not.toBe(lengths[1])
        const rightIndex = played.parts[0].choices!.findIndex((c) => c.correct)
        const rightLabel = played.parts[0].choices![rightIndex].text
        expect(rightLabel, `${q.id} seed ${seed}`).toBe(`Arrow ${plan.items[longer].name}`)
      }
    }
  })

  it('explains "which arrow is longer" by length, never by height: no "further up", no "different heights", no "slanted" for a flat arrow', () => {
    for (const q of firstLook().filter((q) => q.picture!.kind === 'vectors')) {
      const words = [q.title, q.statement, ...q.parts.flatMap((p) => (p.type === 'choice' ? p.choices.map((c) => c.why ?? '') : []))].join(' ')
      expect(words, q.id).not.toMatch(/further up|height|points further/i)
      // A statement that calls both arrows slanted may not draw one of them flat along a grid line.
      if (/two slanted/i.test(q.statement) && q.picture!.kind === 'vectors') {
        expect(q.picture!.items.every((it) => it.v.every((c) => c.trim() !== '0')), q.id).toBe(true)
      }
      // The title asks the same question the prompt does: which is longer.
      expect(q.title, q.id).toMatch(/longer/i)
    }
  })

  it('tells the student every braking line is speed against time, from the same starting speed, and explains "further" by the space under the line', () => {
    const braking = firstLook().filter((q) => q.picture!.kind === 'curves')
    expect(braking).toHaveLength(4)
    for (const q of braking) {
      expect(q.statement, q.id).toMatch(/how fast .* going as time goes by/)
      expect(q.statement, q.id).toMatch(/same speed/)
      const wrongWhys = q.parts.flatMap((p) => (p.type === 'choice' ? p.choices.filter((c) => !c.correct).map((c) => c.why ?? '') : []))
      expect(wrongWhys.length, q.id).toBe(2)
      for (const why of wrongWhys) expect(why, q.id).toMatch(/space under/)
    }
  })

  it('does not always make "A" the right answer: within each picture kind with choices, both A and B are right somewhere', () => {
    for (const kind of ['curves', 'vectors'] as const) {
      const rightLetters = firstLook()
        .filter((q) => q.picture!.kind === kind)
        .map((q) => {
          const p = q.parts[0]
          if (p.type !== 'choice') throw new Error(`${q.id}: expected a choice part`)
          return p.choices.find((c) => c.correct)!.text.trim().slice(-1)
        })
      expect(rightLetters.filter((l) => l === 'A').length, kind).toBe(2)
      expect(rightLetters.filter((l) => l === 'B').length, kind).toBe(2)
    }
  })

  it('starts both arrows at one point off both axes, so no arrow lies along an axis line, over many seeds', () => {
    scene().newScene()
    for (const q of firstLook().filter((q) => q.picture!.kind === 'vectors')) {
      for (let seed = 1; seed <= 20; seed++) {
        const played = playQuestion(q, seed, SETTINGS)
        const plan = picturePlan(q.picture!, played, SETTINGS)
        if (plan.kind !== 'vectors') throw new Error('expected a vectors picture')
        const [first, ...rest] = plan.items
        for (const it of plan.items) {
          const tail = it.tail ?? [0, 0, 0]
          expect(tail, `${q.id} seed ${seed} ${it.name}`).toEqual(first.tail)
          const head = [tail[0] + it.v[0], tail[1] + it.v[1]]
          // An arrow lies along the x-axis when both its ends have y = 0, along the y-axis when both have x = 0.
          expect(tail[1] === 0 && head[1] === 0, `${q.id} seed ${seed} ${it.name} on the x-axis`).toBe(false)
          expect(tail[0] === 0 && head[0] === 0, `${q.id} seed ${seed} ${it.name} on the y-axis`).toBe(false)
        }
        expect(rest.length, q.id).toBe(1)
      }
    }
  })
})
