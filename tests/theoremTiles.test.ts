// 3D-3B: the Theorems tiles in Geometry's 3-D view. Each of the ten sets up its solids or planes as real lines with its slider
// (the data's range and default), shows the data's live numbers at the slider's value, and the next tile replaces the last.

import { beforeEach, describe, expect, it } from 'vitest'
import { scene } from '../src/renderer/src/core/store'
import { theorems3D } from '../src/renderer/src/math/theorems3d'
import { liveNumbers, playTheorem, shownTheorem, syncTheorem, THEOREM_SCENES } from '../src/renderer/src/panels/theoremScenes'
import { measure3D } from '../src/renderer/src/math/measure3d'
import { itemOf } from '../src/renderer/src/panels/measure3dItems'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  scene().setActiveSpace('shapes')
})

const named = (n: string) => scene().objects[scene().ev.names.get(n)!]
const val = (n: string) => scene().ev.values.get(scene().ev.names.get(n)!)

describe('every theorem', () => {
  it.each(theorems3D.map((t) => [t.id] as const))('%s: sets up without an error, with its slider', async (id) => {
    const t = theorems3D.find((x) => x.id === id)!
    expect(THEOREM_SCENES[id]).toBeDefined()
    await playTheorem(t)
    const errors = [...scene().ev.errors.entries()].map(([k, e]) => `${scene().objects[k]?.name}: ${e}`)
    expect(errors).toEqual([])
    const slider = named(THEOREM_SCENES[id].slider)
    expect(slider?.type === 'number' && slider.slider).toMatchObject({ min: t.parameter.min, max: t.parameter.max, step: t.parameter.step })
    expect(shownTheorem()).toBe(id)
    expect(liveNumbers(t).length).toBe(t.quantities.length)
  })
})

describe('the scenes are the theorems', () => {
  it('Archimedes: the sphere fits the cylinder, V = 2/3 of it, as r moves', async () => {
    await playTheorem(theorems3D.find((t) => t.id === 'archimedes-sphere-cylinder')!)
    const s = val('S')
    const c = val('T')
    expect(s?.type === 'solid' && c?.type === 'solid' && s.shape.volume / c.shape.volume).toBeCloseTo(2 / 3, 12)
  })
  it('a line and a plane: the line is at 45° to the floor wherever B turns', async () => {
    await playTheorem(theorems3D.find((t) => t.id === 'line-plane-angle')!)
    const ids = [scene().ev.names.get('f')!, Object.values(scene().objects).find((o) => o.type === 'plane')!.id]
    const items = ids.map((id) => itemOf(scene().objects[id], scene().ev.values.get(id), scene().objects, scene().ev)!)
    expect((measure3D(items, scene().settings)!.rows[0].value * 180) / Math.PI).toBeCloseTo(45, 9)
  })
  it('a point and a plane: the shortest distance is 20/3 and F is on the plane', async () => {
    await playTheorem(theorems3D.find((t) => t.id === 'point-plane-distance')!)
    const plane = Object.values(scene().objects).find((o) => o.type === 'plane')!
    const items = [named('P'), plane].map((o) => itemOf(o, scene().ev.values.get(o.id), scene().objects, scene().ev)!)
    expect(measure3D(items, scene().settings)!.rows[0].value).toBeCloseTo(20 / 3, 12)
    const F = val('F')
    expect(F?.type === 'point' && F.p[0] + 2 * F.p[1] + 2 * F.p[2]).toBeCloseTo(6, 12)
    // The data's own foot is that point (it said (2, 1, 2), which is not on the plane).
    expect(liveNumbers(theorems3D.find((t) => t.id === 'point-plane-distance')!).find((q) => q.name.startsWith('Perpendicular foot'))?.value).toBe('(16/9, 5/9, 14/9)')
  })
  it('Euler: the slider picks the solid', async () => {
    const t = theorems3D.find((x) => x.id === 'euler-polyhedron')!
    await playTheorem(t)
    expect(named('T')).toMatchObject({ kind: 'cube' })
    syncTheorem(t, 6)
    expect(named('T')).toMatchObject({ kind: 'icosahedron' })
  })
  it('review: every slider moves its scene - the cylinder fills cone by cone, the discs shear, the net opens', async () => {
    const volumeOf = (n: string) => {
      const c = val(n)
      return c?.type === 'solid' ? c.shape.volume : Number.NaN
    }
    const setSlider = (n: string, v: number) => scene().updateObject(scene().ev.names.get(n)!, (d) => void (d.type === 'number' && (d.expr = String(v))))
    const cone = theorems3D.find((t) => t.id === 'cone-vs-cylinder')!
    await playTheorem(cone)
    setSlider('f', 2)
    // Two cones poured: two thirds of the cylinder.
    expect(volumeOf('W') / volumeOf('T')).toBeCloseTo(2 / 3, 2)
    const cav = theorems3D.find((t) => t.id === 'cavalieri-principle')!
    await playTheorem(cav)
    setSlider('s', 2)
    syncTheorem(cav, 2)
    const top = val('U4')
    const bottom = val('U1')
    expect(top?.type === 'solid' && bottom?.type === 'solid' && top.shape.base[0] - bottom.shape.base[0]).toBeCloseTo(1.5, 9)
    expect(['U1', 'U2', 'U3', 'U4'].reduce((a, n) => a + volumeOf(n), 0)).toBeCloseTo(volumeOf('T'), 9)
    const nets = theorems3D.find((t) => t.id === 'nets-unfold')!
    await playTheorem(nets)
    const heights = () => Object.values(scene().objects).filter((o) => o.type === 'polygon').flatMap((o) => { const c = scene().ev.values.get(o.id); return c?.type === 'polygon' ? c.pts.map((p) => p[2]) : [] })
    expect(Math.max(...heights())).toBeCloseTo(4, 9)
    setSlider('u', 100)
    expect(Math.max(...heights().map(Math.abs))).toBeCloseTo(0, 9)
  })

  it('the next tile takes the last one’s objects away', async () => {
    await playTheorem(theorems3D[0])
    const before = Object.keys(scene().objects).length
    await playTheorem(theorems3D[2])
    expect(scene().ev.names.get('n')).toBeUndefined()
    expect(Object.keys(scene().objects).length).toBeLessThanOrEqual(before + 3)
  })
})
