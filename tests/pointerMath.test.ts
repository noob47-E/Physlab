// P-FIX-VIEW VA, the Move tool's pointer decisions (render/pointerMath.ts, called by Interaction.tsx):
// W3  a press on a locked object switched the camera controls off for good — no drag could start,
//     so the release that turns them back on never came. A press that cannot drag leaves them alone.
// W22 dragging a point that cannot move (a crossing, a point on an arrow head) showed "move (…)"
//     and left an empty undo step. Such a press is no drag at all.
// W4  a 3-D drag measured the pointer against where it met the floor (z = 0) at the press but
//     against the object's own drag plane afterwards, so the object leapt on the first move.
// W5  a click on one member of a multi-selection left all of them selected.
// W20 the pointer tips wrote powers of ten as "×10^9", programming syntax, not "× 10⁹".

import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { DEFAULT_SETTINGS } from '../src/renderer/src/core/store'
import type { ObjId, SceneObject } from '../src/renderer/src/core/types'
import { screenToPlane, toScreen } from '../src/renderer/src/render/cameraUtils'
import { canDrag, dragFrom, selectionAfterClick, tipAngle, tipLength, tipNumber } from '../src/renderer/src/render/pointerMath'
import { dist, sub, type V3 } from '../src/renderer/src/math/vec'

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false, color: '#000', showLabel: true })
const free = (id: string, p: V3): SceneObject => ({ ...base(id, id), type: 'point', def: { kind: 'free', p } })

function drawing(): Record<ObjId, SceneObject> {
  const list: SceneObject[] = [
    free('A', [0, 0, 0]),
    free('B', [4, 0, 0]),
    { ...free('L', [1, 1, 0]), locked: true },
    { ...base('sAB', 'a'), type: 'segment', a: 'A', b: 'B' },
    { ...base('M', 'M'), type: 'point', def: { kind: 'midpoint', a: 'A', b: 'B' } },
    { ...base('N', 'N'), type: 'point', def: { kind: 'midpoint', a: 'A', b: 'L' } },
    { ...base('sMN', 'b'), type: 'segment', a: 'M', b: 'N' },
    { ...base('X', 'X'), type: 'point', def: { kind: 'intersection', a: 'sAB', b: 'sMN', index: 0 } },
    { ...base('v', 'v'), type: 'vector', def: { kind: 'free', tail: [0, 0, 0], comp: [1, 2, 0] } },
    { ...base('H', 'H'), type: 'point', def: { kind: 'vectorHead', vector: 'v' } },
    { ...base('O', 'O'), type: 'point', def: { kind: 'onObject', on: 'sAB', t: 0.5 } },
    { ...base('lockedSide', 'c'), type: 'segment', a: 'A', b: 'B', locked: true }
  ]
  return Object.fromEntries(list.map((o) => [o.id, o]))
}

describe('W3 / W22: whether a Move-tool press starts a drag', () => {
  const objects = drawing()
  const can = (id: ObjId) => canDrag(objects[id], objects)

  it('a locked object is not dragged, so the press keeps the camera controls', () => {
    expect(can('L')).toBe(false)
    expect(can('lockedSide')).toBe(false)
  })

  it('a point that cannot move (crossing, midpoint, arrow-head point) is not dragged', () => {
    expect(can('X')).toBe(false)
    expect(can('M')).toBe(false)
    expect(can('H')).toBe(false)
    // A side between two points that cannot move has nothing to move either.
    // (A dependent point never moves its parents, so this side has no point a drag could move.)
    expect(can('sMN')).toBe(false)
  })

  it('what can move still drags: a free point, a point on a side, a side, a free arrow', () => {
    expect(can('A')).toBe(true)
    expect(can('O')).toBe(true)
    expect(can('sAB')).toBe(true)
    expect(can('v')).toBe(true)
  })
})

describe('W4: a 3-D drag starts from the grabbed point on its own drag plane', () => {
  const size = { width: 1000, height: 800 }
  const cam = (pos: V3) => {
    const c = new THREE.PerspectiveCamera(50, size.width / size.height, 0.1, 1000)
    c.position.set(...pos)
    c.up.set(0, 0, 1)
    c.lookAt(0, 0, 0)
    c.updateMatrixWorld()
    return c
  }

  it('grabbing the shaft of an arrow whose tail is at z = 2: no jump before the pointer moves', () => {
    const camera = cam([9, -12, 9])
    const grabbed: V3 = [1.5, 0, 2]
    const at = toScreen(camera, size, grabbed)
    const { plane, startWorld } = dragFrom(camera, size, at.x, at.y, '3d', [0, 0, 2])
    expect(dist(startWorld, grabbed)).toBeLessThan(1e-6)
    const now = screenToPlane(camera, size, at.x, at.y, plane)!
    expect(Math.hypot(...sub(now, startWorld))).toBeLessThan(1e-9)
  })

  it('a camera turned nearly level drags on a vertical plane, and starts on it', () => {
    const camera = cam([20, -0.5, 1])
    const grabbed: V3 = [0, 3, 0]
    const at = toScreen(camera, size, grabbed)
    const { plane, startWorld } = dragFrom(camera, size, at.x, at.y, '3d', [0, 0, 0])
    expect(Math.abs(plane.normal.z)).toBeLessThan(1e-9)
    expect(Math.abs(plane.distanceToPoint(new THREE.Vector3(...startWorld)))).toBeLessThan(1e-9)
  })

  it('in 2-D the drag plane is the floor', () => {
    const camera = new THREE.OrthographicCamera(-500, 500, 400, -400, 0.1, 1000)
    camera.position.set(0, 0, 100)
    camera.zoom = 50
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    const { plane, startWorld } = dragFrom(camera, size, 600, 300, '2d', [0, 0, 0])
    expect(plane.normal.z).toBe(1)
    expect(dist(startWorld, [2, 2, 0])).toBeLessThan(1e-9)
  })
})

describe('W5: a plain click on one member of a multi-selection leaves only that one', () => {
  it('click without moving narrows the selection', () => {
    expect(selectionAfterClick(['A', 'B', 'C'], 'B', false, false)).toEqual(['B'])
  })
  it('a drag, or a Shift-click, leaves the selection as the press made it', () => {
    expect(selectionAfterClick(['A', 'B', 'C'], 'B', false, true)).toBeNull()
    expect(selectionAfterClick(['A', 'C'], 'B', true, false)).toBeNull()
    expect(selectionAfterClick(['B'], 'B', false, false)).toBeNull()
  })
})

describe('W20: pointer tips raise powers of ten', () => {
  const s = DEFAULT_SETTINGS
  it('a huge length, angle-free coordinate and a tiny one read with raised powers, no caret', () => {
    for (const t of [tipLength(1.5e10, s), tipNumber(1.5e10, s), tipNumber(-2e-9, s)]) {
      expect(t).not.toContain('^')
      expect(t).toMatch(/×\u00a010[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+/)
    }
    expect(tipLength(1.5e10, s)).toMatch(/ u$/)
    expect(tipNumber(1.5e10, s)).not.toMatch(/ u$/)
  })
  it('ordinary values read as before', () => {
    expect(tipLength(3, s)).toBe('3 u')
    expect(tipNumber(-2.5, s)).toBe('−2.5')
    expect(tipAngle(Math.PI / 2, s)).toBe('90°')
  })
})
