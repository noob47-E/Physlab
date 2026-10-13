// SB19: the graph under the cards — energy, position or velocity against time, drawn from the recording, with a
// playhead that follows the scene and a click that takes the scene there. The pure part runs on the real engine and
// recorder in Node; the dock itself is checked as source text (as tests/sandboxShell.test.ts does).

import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import { presetById } from '../src/renderer/src/sim/presets'
import { DEFAULT_WORLD } from '../src/renderer/src/sim/types'
import { REC_FLOATS } from '../src/renderer/src/sim/tape'
import { startRecorder, tapes, type RunTape } from '../src/renderer/src/sim/recorder'
import { massOf } from '../src/renderer/src/sim/store'
import { ledgerAt, type LedgerScene } from '../src/renderer/src/sim/ledger'
import { GRAPH_CHOICES, graphBody, graphLines, nearestStep, playheadX, sampleSteps, tickText } from '../src/renderer/src/sim/graphSeries'
import { readSource } from './helpers/repo'

let stop: (() => void) | null = null
afterEach(() => {
  stop?.()
  stop = null
})
beforeAll(async () => {
  ;(await SimWorld.create()).destroy()
}, 30_000)

async function recorded(id: string, seconds: number): Promise<{ tape: RunTape; scene: LedgerScene }> {
  const built = presetById(id)!.build()
  const world = { ...DEFAULT_WORLD, ...(built.world ?? {}) }
  const w = await SimWorld.create(world)
  w.rebuild(built.bodies, built.links ?? [])
  stop = startRecorder(w)
  for (let i = 0; i < seconds * w.stepRate; i++) w.stepOnce()
  return { tape: tapes.live!, scene: { bodies: built.bodies, links: built.links ?? [], world, massOf } }
}

describe('what each choice draws', () => {
  it('Energy · Position · Velocity, with their axes', () => {
    expect(GRAPH_CHOICES.map((c) => c.label)).toEqual(['Energy', 'Position', 'Velocity'])
    expect(GRAPH_CHOICES.map((c) => c.axis)).toEqual(['E / J', 'x, y / m', 'vₓ, vᵧ / m s⁻¹'])
  })

  it('Position and Velocity are the tape’s own numbers at their steps, at most 600 points, ending at the last step', async () => {
    const { tape, scene } = await recorded('springice', 4)
    const block = scene.bodies.find((b) => b.name === 'M')!
    const i = tape.layout.bodies.indexOf(block.id)
    const steps = sampleSteps(tape.first, tape.last, 600)
    expect(steps.length).toBeLessThanOrEqual(600)
    expect(steps[steps.length - 1]).toBe(tape.last)
    const pos = graphLines(tape, 'position', scene, block.id)
    expect(pos.lines.map((l) => [l.label, l.token, l.dash])).toEqual([
      ['x', '--q-pos', false],
      ['y', '--q-pos', true]
    ])
    const vel = graphLines(tape, 'velocity', scene, block.id)
    expect(vel.lines.map((l) => [l.label, l.token, l.dash])).toEqual([
      ['vₓ', '--q-vel', false],
      ['vᵧ', '--q-vel', true]
    ])
    steps.forEach((s, k) => {
      const rec = tape.record(s)!
      expect(pos.t[k]).toBe(tape.timeOf(s))
      expect(pos.lines[0].values[k]).toBe(rec[i * REC_FLOATS])
      expect(pos.lines[1].values[k]).toBe(rec[i * REC_FLOATS + 1])
      expect(vel.lines[0].values[k]).toBe(rec[i * REC_FLOATS + 7])
      expect(vel.lines[1].values[k]).toBe(rec[i * REC_FLOATS + 8])
    })
  })

  it('Energy is the ledger at each step: kinetic, height, spring, total, heat, in the card’s colours', async () => {
    const { tape, scene } = await recorded('friction', 2)
    const crate = scene.bodies.find((b) => b.name === 'Crate')!
    const e = graphLines(tape, 'energy', scene, crate.id)
    expect(e.lines.map((l) => [l.label, l.token])).toEqual([
      ['kinetic', '--q-vel'],
      ['height', '--q-pos'],
      ['spring', '--q-spring'],
      ['total', '--text-strong'],
      ['heat', '--q-heat']
    ])
    const steps = sampleSteps(tape.first, tape.last, 600)
    for (const k of [0, 100, steps.length - 1]) {
      const L = ledgerAt(tape, steps[k], scene)
      expect(e.lines[0].values[k]).toBe(L.kinetic)
      expect(e.lines[1].values[k]).toBe(L.height)
      expect(e.lines[2].values[k]).toBe(L.spring)
      expect(e.lines[3].values[k]).toBe(L.kinetic + L.height + L.spring)
      expect(e.lines[4].values[k]).toBe(L.heat)
    }
    // The crate stops: its 90 J of motion is heat at the end.
    expect(e.lines[4].values[steps.length - 1]).toBeCloseTo(90, 0)
  })

  it('Spring on ice: kinetic and spring swap while the total stays flat (within 1 %)', async () => {
    const { tape, scene } = await recorded('springice', 3)
    const e = graphLines(tape, 'energy', scene, scene.bodies.find((b) => b.name === 'M')!.id)
    const [ke, , spring, total] = e.lines.map((l) => l.values)
    expect(Math.max(...ke)).toBeGreaterThan(8.9)
    expect(Math.min(...spring)).toBeLessThan(0.1)
    expect(Math.max(...total) - Math.min(...total)).toBeLessThan(13.905 * 0.01 * 2)
  })

  it('the body: the selected one when it moves, else the first that moves', async () => {
    const { scene } = await recorded('atwood', 0)
    const moving = scene.bodies.filter((b) => b.motion === 'dynamic')
    expect(graphBody(scene.bodies, moving[1].id)?.id).toBe(moving[1].id)
    expect(graphBody(scene.bodies, scene.bodies[0].id)?.id).toBe(moving[0].id)
    expect(graphBody(scene.bodies, null)?.id).toBe(moving[0].id)
  })
})

describe('the playhead and a click', () => {
  it('the playhead at step k sits at t = k / rate on the axis', () => {
    const tape = { first: 0, last: 480, rate: 240, timeOf: (s: number) => s / 240, record: () => null }
    expect(playheadX(tape.timeOf(240), 0, 2, 400)).toBe(200)
    expect(playheadX(tape.timeOf(120), 0, 2, 400)).toBe(100)
  })
  it('a click at a time goes to the nearest recorded step, never past either end', () => {
    const tape = { first: 24, last: 480, rate: 240, timeOf: (s: number) => s / 240, record: () => null }
    expect(nearestStep(tape, 1)).toBe(240)
    expect(nearestStep(tape, 1 + 0.4 / 240)).toBe(240)
    expect(nearestStep(tape, 1 + 0.6 / 240)).toBe(241)
    expect(nearestStep(tape, -5)).toBe(24)
    expect(nearestStep(tape, 99)).toBe(480)
  })
})

describe('render/sandbox/GraphDock.tsx', () => {
  const src = readSource('src/renderer/src/render/sandbox/GraphDock.tsx')
  it('draws with uPlot from the stylesheet’s colours, and seeks with scrubTo on a click or a drag', () => {
    expect(src).toMatch(/from 'uplot'/)
    expect(src).toMatch(/themeColor\(/)
    expect(src).toMatch(/scrubTo\(/)
    expect(src).toMatch(/nearestStep\(/)
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })
  it('rebuilds its lines only when the recording or the choice changes, never on a theme switch (the Graphs trap)', () => {
    const memo = src.match(/const data = useMemo\([\s\S]*?\[([^\]]*)\]\)/)
    expect(memo, 'the lines are memoised').not.toBeNull()
    expect(memo![1]).not.toMatch(/theme/)
    expect(memo![1]).toMatch(/choice/)
  })
  it('keeps a fixed height, says how to start before the first step, folds away and remembers (Fix 22)', () => {
    expect(src).toMatch(/h-\[\d+px\]/)
    expect(src).toContain('Press Play and the graph draws itself')
    expect(src).toMatch(/localStorage/)
    expect(src).toMatch(/try \{/)
    expect(src).toMatch(/pointer-events-auto/)
  })
  it('follows the playhead without rebuilding the plot', () => {
    expect(src).toMatch(/useTape\(/)
    expect(src).toMatch(/\.redraw\(/)
  })
})

describe('review fix (gpt-5.4 medium r1): the axis numbers go through the app’s number writer', () => {
  it('tickText writes each tick with fmtLabel: a true minus sign, no float noise', () => {
    expect(tickText([-0.5, 0, 0.30000000000000004, 1.5, 10])).toEqual(['−0.5', '0', '0.3', '1.5', '10'])
  })
  it('both axes hand their ticks to tickText', () => {
    const src = readSource('src/renderer/src/render/sandbox/GraphDock.tsx')
    expect(src.match(/values: \(_u, splits\) => tickText\(splits\)/g)?.length).toBe(2)
  })
})

describe('review fix (Gemini pictures r1): after a pause the graph reaches the end and shows its playhead', () => {
  const src = readSource('src/renderer/src/render/sandbox/GraphDock.tsx')
  it('the lines are rebuilt when play stops (the live values come only ten times a second)', () => {
    expect(src).toMatch(/const playing = useScene\(\(s\) => s\.playing\)/)
    const memo = src.match(/const data = useMemo\([\s\S]*?\[([^\]]*)\]\)/)!
    expect(memo[1]).toMatch(/\bplaying\b/)
  })
  it('live, the playhead is drawn at the last point drawn, so it is never off the end of the plot', () => {
    expect(src).toMatch(/mode === 'live' \? data\.t\[data\.t\.length - 1\]/)
  })
})
