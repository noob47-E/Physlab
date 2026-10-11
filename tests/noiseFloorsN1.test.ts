// CW9-N1 (the noise rule in the drawing files, CLEANUP-PLAN.md CW9): what each 1e-12 in the batch does
// today, pinned on both sides of the floor where a test can reach it, so moving or naming a line
// changes nothing unnoticed. A line whose move would change what a student sees is it.fails and waits
// for the owner (OWNER-APPROVALS.md, CW9-N1-n). The rest of the batch's lines sit in components a
// test cannot render here; each says in place what it compares.

import { beforeEach, describe, expect, it } from 'vitest'
import { useScene } from '../src/renderer/src/core/store'
import type { SceneObject } from '../src/renderer/src/core/types'
import { rowsFor } from '../src/renderer/src/panels/Measurements'
import { snapToGrid } from '../src/renderer/src/render/gridMath'
import { orbitOf, positionOf, stepTurn } from '../src/renderer/src/render/viewMath'

const sc = () => useScene.getState()
const base = (id: string, name: string) => ({ id, name, visible: true, locked: false, color: '#000', showLabel: true, space: 'vectors' as const })
const rowsOf = (o: SceneObject) => {
  sc().addObjects([o], { record: false })
  return rowsFor(o, (id) => sc().ev.values.get(id), sc().objects)[0].rows
}
const labels = (o: SceneObject) => rowsOf(o).map((r) => r.label)

beforeEach(() => {
  sc().newScene()
  sc().setActiveSpace('vectors')
})

describe('panels/Measurements.tsx', () => {
  it('a point shows its z row only above the writer’s display floor (10⁻¹², written as 0 below it)', () => {
    expect(labels({ ...base('p1', 'A'), type: 'point', def: { kind: 'free', p: [1, 2, 9.99e-13] } })).not.toContain('z')
    expect(labels({ ...base('p2', 'B'), type: 'point', def: { kind: 'free', p: [1, 2, 1e-11] } })).toContain('z')
  })

  it('a vector shows its z row only above the same floor', () => {
    const vec = (id: string, z: number): SceneObject => ({ ...base(id, id.toUpperCase()), type: 'vector', def: { kind: 'free', tail: [0, 0, 0], comp: [3, 4, z] } })
    expect(labels(vec('v1', 9.99e-13)).some((l) => l.includes('z-component'))).toBe(false)
    expect(labels(vec('v2', 1e-11)).some((l) => l.includes('z-component'))).toBe(true)
  })

  it('an exactly zero vector has no direction', () => {
    const rows = rowsOf({ ...base('v0', 'Z'), type: 'vector', def: { kind: 'free', tail: [0, 0, 0], comp: [0, 0, 0] } })
    expect(rows.find((r) => r.label === 'θ with +x axis')?.value).toBe('undefined — a zero vector has no direction')
  })

  // CW9-N1-1: the floor on a length is absolute, so a force typed as <3×10⁻¹⁹, 4×10⁻¹⁹> N (a real
  // size in SI units) is told it is the zero vector with no direction; its direction is 53.13°.
  it.fails('CW9-N1-1: a tiny but real vector has a direction', () => {
    const rows = rowsOf({ ...base('vt', 'F'), type: 'vector', def: { kind: 'free', tail: [0, 0, 0], comp: [3e-19, 4e-19, 0] } })
    expect(rows.find((r) => r.label === 'θ with +x axis')?.value).not.toBe('undefined — a zero vector has no direction')
  })
})

describe('render/gridMath.ts snapToGrid, polar', () => {
  it('a point snapped onto an axis sits on it exactly; elsewhere the snap is the plain cos and sin', () => {
    for (const r of [0.5, 1, 7, 1e-6, 1e6]) {
      for (let k = -12; k <= 12; k++) {
        const t = (k * Math.PI) / 12
        const [x, y] = snapToGrid('polar', [r * Math.cos(t), r * Math.sin(t), 0], r, r)
        const onX = k % 12 === 0
        const onY = Math.abs(k) === 6
        if (onY) expect(x).toBe(0)
        else expect(Math.abs(x)).toBeGreaterThan(1e-3 * r)
        if (onX) expect(y).toBe(0)
        else expect(Math.abs(y)).toBeGreaterThan(1e-3 * r)
      }
    }
  })
})

describe('render/viewMath.ts stepTurn: an elevation in radians', () => {
  const target: [number, number, number] = [0, 0, 0]
  it('a turn that the elevation limit stops is dropped; a step too small to come out short is never stopped (the old 10⁻¹² guard decided nothing)', () => {
    const top = positionOf({ ...orbitOf([9, -12, 9], target), elevation: (89 * Math.PI) / 180 }, target)
    expect(stepTurn(top, target, { az: 0, el: 0.2 }, 1).pending.el).toBe(0)
    // A frame so short that this step of a 0.01 rad turn is under 10⁻¹² rad: never called stopped, so
    // the rest of the turn is kept; a frame of 1 s at the limit is stopped and the turn dropped.
    expect(stepTurn(top, target, { az: 0, el: 0.01 }, 1e-12).pending.el).toBeGreaterThan(0.0099)
    expect(stepTurn(top, target, { az: 0, el: 0.01 }, 1).pending.el).toBe(0)
  })
})

describe('the batch’s leads (CLEANUP-PLAN.md CW9-N1)', () => {
  // CW9-N1-3: a drag that moves nothing — a dependent point, which only its parents move — still
  // takes an Undo step (beginGesture records one; endGesture keeps it), so the next Ctrl+Z seems to do nothing.
  it.fails('CW9-N1-3: a drag that changes nothing leaves no Undo step', () => {
    sc().addObjects([{ ...base('pA', 'A'), type: 'point', def: { kind: 'free', p: [1, 1, 0] } }], { record: false })
    const before = sc().past.length
    sc().beginGesture()
    sc().endGesture()
    expect(sc().past.length).toBe(before)
  })
})
