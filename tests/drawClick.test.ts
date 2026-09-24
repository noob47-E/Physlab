// Fix 1 — "a drawn segment gets longer by itself". The click that ends a segment used to take any
// point within the 22 px *picking* reach, while the length tip and the snap ring beside the pointer
// follow the tighter 12 px *snapping* radius. Let go 12–22 px short of an existing point and the
// tip read one length while the segment was built to the point, longer (or shorter) than drawn.

import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { evaluateScene } from '../src/renderer/src/core/evaluate'
import { DEFAULT_SETTINGS } from '../src/renderer/src/core/store'
import type { ObjId, SceneObject } from '../src/renderer/src/core/types'
import { pickAll, pickAt, type Hit, type PickContext } from '../src/renderer/src/render/picking'
import { POINT_REACH_PX } from '../src/renderer/src/render/viewMath'
import { drawingClickHit, joinsPointWithSnapOff, shiftConstrains } from '../src/renderer/src/render/selectMath'
import { createsPointsOnEmpty } from '../src/renderer/src/render/tools'
import { fmtPrecise, formatMeasure, measureValue, unitSuffix } from '../src/renderer/src/math/format'
import { dist, type V3 } from '../src/renderer/src/math/vec'
import { readSource } from './helpers/repo'

const interaction = readSource('src/renderer/src/render/Interaction.tsx')
const SNAP_POINT_PX = Number(/const SNAP_POINT_PX = (\d+)/.exec(interaction)?.[1])

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false, color: '#000', showLabel: true })
const point = (id: string, name: string, p: V3): SceneObject => ({ ...base(id, name), type: 'point', def: { kind: 'free', p } })
const segment = (id: string, name: string, a: ObjId, b: ObjId): SceneObject => ({ ...base(id, name), type: 'segment', a, b })

/** A point A at the origin (where the student's segment starts) and a point P at (4, 0) already on the drawing. */
function ctx(extra: SceneObject[] = []): PickContext {
  // A 1000×800 canvas looking straight down, 50 px to the unit, origin in the middle.
  const camera = new THREE.OrthographicCamera(-500, 500, 400, -400, 0.1, 1000)
  camera.position.set(0, 0, 100)
  camera.zoom = 50
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  const list = [point('pA', 'A', [0, 0, 0]), point('pP', 'P', [4, 0, 0]), ...extra]
  const objects = Object.fromEntries(list.map((o) => [o.id, o]))
  const order = list.map((o) => o.id)
  return { camera, size: { width: 1000, height: 800 }, objects, order, ev: evaluateScene(objects, order, DEFAULT_SETTINGS, 0) }
}
const PX_PER_U = 50
const px = (x: number, y: number) => ({ sx: 500 + x * PX_PER_U, sy: 400 - y * PX_PER_U })
const onlyPoints = (_o: SceneObject, c: { type: string }) => c.type === 'point'
const isPointHit = (c: PickContext) => (h: Hit) => c.ev.values.get(h.id)?.type === 'point'

/** Where the Segment tool's second click lands: an existing point it takes, or null for a new point under the pointer. */
function landsOn(c: PickContext, sx: number, sy: number, accept = onlyPoints, tool = 'segment' as const): ObjId | null {
  return drawingClickHit(pickAll(c, sx, sy, accept), isPointHit(c), createsPointsOnEmpty(tool), SNAP_POINT_PX)?.id ?? null
}

describe('Fix 1: the click that ends a segment lands where the tip said', () => {
  it('reproduces the cause: the picking reach is wider than the snapping radius', () => {
    expect(SNAP_POINT_PX).toBe(12)
    expect(POINT_REACH_PX).toBeGreaterThan(SNAP_POINT_PX)
    // 16 px (0.32 u) short of P: the tip shows a free end 3.68 u from A, yet the old release
    // (pickAt with the tool's filter) took P, so the segment came out 4 u — 0.32 u longer.
    const c = ctx()
    const { sx, sy } = px(4 - 16 / PX_PER_U, 0)
    expect(pickAt(c, sx, sy, onlyPoints)?.id).toBe('pP')
  })

  it('a click 16 px short of a point makes a new end there, so the length is the one the tip showed', () => {
    const c = ctx()
    const at = 4 - 16 / PX_PER_U
    const { sx, sy } = px(at, 0)
    expect(landsOn(c, sx, sy)).toBeNull()
    // The tip, the label and the Measure panel all format the same number through formatMeasure.
    const drawn = dist([0, 0, 0], [at, 0, 0])
    expect(formatMeasure(drawn, 'length', DEFAULT_SETTINGS)).toBe(formatMeasure(3.68, 'length', DEFAULT_SETTINGS))
    expect(formatMeasure(drawn, 'length', DEFAULT_SETTINGS)).not.toBe(formatMeasure(4, 'length', DEFAULT_SETTINGS))
  })

  it('a click inside the snapping radius joins the point, as the snap ring promised', () => {
    const c = ctx()
    const { sx, sy } = px(4 - 10 / PX_PER_U, 0)
    expect(landsOn(c, sx, sy)).toBe('pP')
    const exact = px(4, 0)
    expect(landsOn(c, exact.sx, exact.sy)).toBe('pP')
  })

  it('holds at every zoom: the radius is in screen pixels, not drawing units', () => {
    for (const zoom of [20, 50, 500]) {
      const c = ctx()
      const cam = c.camera as THREE.OrthographicCamera
      // Looking at P, so it stays on the canvas however far in the view is zoomed.
      cam.position.set(4, 0, 100)
      cam.zoom = zoom
      cam.updateProjectionMatrix()
      cam.updateMatrixWorld()
      const at = (d: number) => ({ sx: 500 - d, sy: 400 })
      expect(landsOn(c, at(16).sx, at(16).sy)).toBeNull()
      expect(landsOn(c, at(10).sx, at(10).sy)).toBe('pP')
    }
  })

  it('a tool that takes a whole segment still takes it when a point sits just beyond the snapping radius', () => {
    // Midpoint's first click takes a point or a segment. A point 18 px away used to win over the
    // segment right under the pointer; now the segment is taken, as the preview shows.
    const c = ctx([point('pQ', 'Q', [0, 2, 0]), point('pR', 'R', [2, 2, 0]), segment('sQR', 'q', 'pQ', 'pR')])
    const accept = (_o: SceneObject, v: { type: string }) => v.type === 'point' || v.type === 'segment'
    const { sx, sy } = px(2 - 18 / PX_PER_U, 2)
    expect(pickAt(c, sx, sy, accept)?.id).toBe('pR')
    expect(landsOn(c, sx, sy, accept, 'midpoint' as never)).toBe('sQR')
  })

  it('a tool that never makes points (Perpendicular, Intersect) keeps the wide reach, since it draws no length', () => {
    const c = ctx()
    const { sx, sy } = px(4 - 16 / PX_PER_U, 0)
    expect(drawingClickHit(pickAll(c, sx, sy, onlyPoints), isPointHit(c), createsPointsOnEmpty('perpendicular'), SNAP_POINT_PX)?.id).toBe('pP')
  })

  it('Interaction uses the one rule on release and for the hover highlight', () => {
    // One helper, with the snapping radius, called from the hover (onMove) and the release (onUp).
    expect(interaction).toMatch(/const drawingHit = [\s\S]*?drawingClickHit\(hits, [\s\S]*?, SNAP_POINT_PX\)/)
    const body = (name: string) => interaction.match(new RegExp(`const ${name} = [\\s\\S]*?\\n {4}\\}\\n`))?.[0] ?? ''
    expect(body('onMove')).toContain('drawingHit(x, y)')
    expect(body('onUp')).toContain('drawingHit(x, y)')
    // The release no longer asks pickAt directly: that is the 22 px reach that built the long side.
    expect(body('onUp')).not.toMatch(/pickAt\(pickCtx\(\), x, y, accept\)/)
    // With snapping off (or Alt) a point-making tool's release still joins a point inside the snapping
    // radius, so its tip must name that point too rather than give the length to the pointer.
    expect(body('snapAt')).toMatch(/if \(alt \|\| !s\.settings\.snap\) \{[\s\S]*?const joined = joinsPointWithSnapOff\(createsPointsOnEmpty\(s\.tool\), !!exclude\) \? onPoint\(\) : null/)
  })
})

describe('Fix 1: with snapping off, only the tools that join points anyway join them', () => {
  it('Segment, Polygon and Point join a point under the pointer, so the tip gives the length they build', () => {
    for (const tool of ['segment', 'polygon', 'point', 'circle'] as const) expect(joinsPointWithSnapOff(createsPointsOnEmpty(tool), false)).toBe(true)
  })

  it('a Vector drawn with snapping off keeps free ends, and a Text box goes exactly under the pointer', () => {
    // Vector builds its tail and head from snapAt's point id: joining here bound the vector to the
    // points (kind 'points') with Snap unticked or Alt held, which snapping off never did.
    expect(joinsPointWithSnapOff(createsPointsOnEmpty('vector'), false)).toBe(false)
    expect(joinsPointWithSnapOff(createsPointsOnEmpty('text'), false)).toBe(false)
    expect(joinsPointWithSnapOff(createsPointsOnEmpty('select'), false)).toBe(false)
  })

  it('a drag never joins a point with snapping off', () => {
    expect(joinsPointWithSnapOff(createsPointsOnEmpty('segment'), true)).toBe(false)
  })

  it('snapAt asks this rule in its snap-off branch, for the tool in hand', () => {
    const snapAt = interaction.slice(interaction.indexOf('const snapAt ='), interaction.indexOf('const point = onPoint()'))
    expect(snapAt).toContain('joinsPointWithSnapOff(createsPointsOnEmpty(s.tool), !!exclude)')
  })
})

describe('Fix 1: Shift snaps the angle only where the release does', () => {
  it('a Shift click that lands on an existing point joins the point, and the tip says so too', () => {
    expect(shiftConstrains('segment', true, true, true)).toBe(false)
    expect(shiftConstrains('segment', true, true, false)).toBe(true)
    // A vector's head never joins a point with Shift held (Interaction's onUp), so it keeps the step.
    expect(shiftConstrains('vector', true, true, true)).toBe(true)
    expect(shiftConstrains('segment', false, true, false)).toBe(false)
    // In 3-D there is no screen angle to round to.
    expect(shiftConstrains('segment', true, false, false)).toBe(false)
  })
})

describe('Fix 1: the Measure panel’s Length box reads at the student’s precision', () => {
  it('shows what the tip and the label show, not four decimals', () => {
    // Drawn in the running app: the tip read "length = 4.61 u" and the box 4.6063.
    const length = 4.60634
    expect(formatMeasure(length, 'length', DEFAULT_SETTINGS)).toBe('4.61 u')
    for (const settings of [DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, unit: 'cm' as const, unitPerSquare: 2 }, { ...DEFAULT_SETTINGS, precisionMode: 'sf' as const, decimals: 3 }]) {
      const box = fmtPrecise(measureValue(length, 'length', settings), settings) + unitSuffix('length', settings)
      expect(box).toBe(formatMeasure(length, 'length', settings))
    }
    const panel = readSource('src/renderer/src/panels/Measurements.tsx')
    expect(panel).toMatch(/display=\{k === 'length' \? \(v\) => fmtPrecise\(v, settings\) : undefined\}/)
    expect(panel).toMatch(/const shown = editing \? text : display \? display\(value\) : fmt\(value, 4\)/)
  })
})
