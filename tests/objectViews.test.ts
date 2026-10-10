// The pixel decisions behind the object views: an arrow head that stays 12 px at every zoom, a
// point drawn smaller than 0.6.0 drew it, and a letter that never sits on its own point or on a
// neighbour's.

import { describe, expect, it } from 'vitest'
import { HALO_TIP_PX, HEAD_HALF_ANGLE_DEG, HEAD_PX, LABEL_BOX, POINT_PX, POINT_REACH_PX, arrowHead, pickLabelOffset, pointHalo, pointRadius } from '../src/renderer/src/render/viewMath'
import { readSource } from './helpers/repo'
import { RESULT_HEAD_GAP_PX, isResultArrow, mixParents } from '../src/renderer/src/render/colourMix'
import { PALETTE, RESULT_COLOUR } from '../src/renderer/src/core/naming'
import { cssColor, tokenOf } from '../src/renderer/src/app/theme'
import { SWATCHES } from '../src/renderer/src/ui/swatches'
import * as THREE from 'three/webgpu'
import { placeArrow } from '../src/renderer/src/render/ObjectViews'
import { evaluateScene } from '../src/renderer/src/core/evaluate'
import { DEFAULT_SETTINGS } from '../src/renderer/src/core/store'
import type { SceneObject } from '../src/renderer/src/core/types'
import { pickAll, type PickContext } from '../src/renderer/src/render/picking'
import type { V3 } from '../src/renderer/src/math/vec'

describe('flat arrow heads', () => {
  it('are 12 px long with a 25° half-angle at any zoom', () => {
    expect(HEAD_PX).toBe(12)
    expect(HEAD_HALF_ANGLE_DEG).toBe(25)
    for (const wpp of [0.01, 0.1, 1, 7.5]) {
      const h = arrowHead(1000 * wpp, wpp)
      expect(h.headLen / wpp).toBeCloseTo(12, 9)
      expect(h.halfWidth / wpp).toBeCloseTo(12 * Math.tan((25 * Math.PI) / 180), 9)
      expect(h.halfWidth / wpp).toBeCloseTo(5.6, 1)
      expect(h.shaftLen / wpp).toBeCloseTo(988, 9)
    }
  })

  it('give most of a very short arrow to the shaft, and never a zero shaft', () => {
    const h = arrowHead(10, 1)
    expect(h.headLen).toBeCloseTo(4.5, 9)
    expect(h.shaftLen).toBeCloseTo(5.5, 9)
    expect(arrowHead(0, 1).shaftLen).toBeGreaterThan(0)
  })

  it('take another length for the halo and the components, at the same angle', () => {
    const big = arrowHead(100, 1, 15)
    const small = arrowHead(100, 1, 10)
    expect(big.headLen).toBe(15)
    expect(small.headLen).toBe(10)
    expect(big.halfWidth / big.headLen).toBeCloseTo(small.halfWidth / small.headLen, 12)
  })

  it('are drawn as a flat triangle in 2-D and the cone only in 3-D', () => {
    const src = readSource('src/renderer/src/render/ObjectViews.tsx')
    expect(src).toMatch(/geometry=\{is3D \? coneGeo : flatHeadGeo\}/)
    // A triangle with its base on the x axis and its apex at +y: three vertices, no more.
    expect(src).toMatch(/flatHeadGeo = new THREE\.BufferGeometry\(\)\.setAttribute\('position', new THREE\.Float32BufferAttribute\(\[-1, 0, 0, 1, 0, 0, 0, 1, 0\], 3\)\)/)
    // The head and the shaft share one material and one render order, so they never disagree.
    expect(src).toMatch(/<mesh ref=\{shaft\} geometry=\{cylGeo\} material=\{mat\} renderOrder=\{renderOrder\} \/>\n\s*<mesh ref=\{head\} geometry=\{is3D \? coneGeo : flatHeadGeo\} material=\{mat\} renderOrder=\{renderOrder\} \/>/)
  })

  it('place a 2-D head 12 px long and a 3-D cone 15 px long, measured from the drawn length', () => {
    const wpp = 0.1
    const comp: V3 = [30, 40, 0] // 50 units long
    const shaft = new THREE.Mesh()
    const head = new THREE.Mesh()
    placeArrow(shaft, head, [0, 0, 0], comp, wpp, 1.7, false)
    expect(head.scale.y).toBeCloseTo(arrowHead(50, wpp, HEAD_PX).headLen, 12)
    placeArrow(shaft, head, [0, 0, 0], comp, wpp, 1.7, true)
    expect(head.scale.y).toBeCloseTo(arrowHead(50, wpp, 15).headLen, 12)
    // The two lengths differ, so the check tells them apart.
    expect(arrowHead(50, wpp, 15).headLen).not.toBeCloseTo(arrowHead(50, wpp, HEAD_PX).headLen, 6)
  })

  it('are laid out from the projected direction in 2-D, so a vector with a z part keeps a square head', () => {
    // Seen from above, (3, 4, 5) is (3, 4): the head points along that and lies in the screen plane.
    const shaft = new THREE.Mesh()
    const head = new THREE.Mesh()
    placeArrow(shaft, head, [0, 0, 0], [3, 4, 5], 1, 1.7, false)
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(head.quaternion)
    expect(dir.x).toBeCloseTo(0.6, 9)
    expect(dir.y).toBeCloseTo(0.8, 9)
    expect(dir.z).toBeCloseTo(0, 9)
    // The head is sized from the projected length 5, not from 5√2.
    expect(head.scale.x).toBeCloseTo(arrowHead(5, 1, HEAD_PX).halfWidth, 9)
    // In 3-D nothing is flattened: the head points along (3, 4, 5) itself.
    placeArrow(shaft, head, [0, 0, 0], [3, 4, 5], 1, 1.7, true)
    const dir3 = new THREE.Vector3(0, 1, 0).applyQuaternion(head.quaternion)
    expect(dir3.x).toBeCloseTo(3 / Math.sqrt(50), 9)
    expect(dir3.y).toBeCloseTo(4 / Math.sqrt(50), 9)
    expect(dir3.z).toBeCloseTo(5 / Math.sqrt(50), 9)
  })

  it('give the selection halo an outline of one width all round, head included', () => {
    // 1.1 px a side beside the shaft; the same 1.1 px outside the 25° edges needs 1.1 / sin 25°.
    expect(HALO_TIP_PX).toBeCloseTo(1.1 / Math.sin((25 * Math.PI) / 180), 9)
    expect(HALO_TIP_PX).toBeCloseTo(2.6, 1)
    const src = readSource('src/renderer/src/render/ObjectViews.tsx')
    expect(src).toMatch(/thick=\{thick \+ 2\.2\} renderOrder=\{11\} headPx=\{15\} headRadPx=\{8\.5\} tipPx=\{HALO_TIP_PX\}/)
  })

  it('measure the halo head from the tip pushed out by HALO_TIP_PX, so the outline is one width all round', () => {
    const shaft = new THREE.Mesh()
    const head = new THREE.Mesh()
    placeArrow(shaft, head, [0, 0, 0], [0, 10, 0], 1, 2.4, false, 15, 8.5, HALO_TIP_PX)
    expect(head.scale.y).toBeCloseTo(arrowHead(10 + HALO_TIP_PX, 1, 15).headLen, 9)
    // Without the push the head would be the shorter one: the check tells the two apart.
    expect(arrowHead(10, 1, 15).headLen).not.toBeCloseTo(head.scale.y, 6)
  })
})

describe('the resultant reads as clearly as its parents, not heavier (Fix 2)', () => {
  it('knows a resultant by its token, by the command bar’s old gold, or by the parents it was drawn from', () => {
    expect(isResultArrow({ id: 'r1', color: RESULT_COLOUR })).toBe(true)
    expect(isResultArrow({ id: 'r2', color: '#123456', themed: '--vec-result' })).toBe(true)
    // R = A + B typed in the bar is stored as #ffd43b; an old file keeps it.
    expect(isResultArrow({ id: 'r3', color: '#ffd43b' })).toBe(true)
    mixParents.set('r4', ['a', 'b'])
    expect(isResultArrow({ id: 'r4', color: '#0cdefd' })).toBe(true)
    // Its label and Outliner swatch read the same token as its arrow; they kept the stored mix.
    expect(tokenOf({ id: 'r4', type: 'vector', color: '#cd7af2' })).toBe('--vec-result')
    expect(cssColor({ id: 'r4', type: 'vector', color: '#cd7af2' })).toBe('var(--vec-result, #cd7af2)')
    mixParents.delete('r4')
    expect(tokenOf({ id: 'r4', type: 'vector', color: '#cd7af2' })).toBeUndefined()
    // The label and the swatch hand the object itself, id and all, to cssColor.
    expect(readSource('src/renderer/src/render/Labels.tsx')).toMatch(/cssColor\(o\)/)
    expect(readSource('src/renderer/src/panels/Outliner.tsx')).toMatch(/cssColor\(o\)/)
    // A parent, and an arrow in a colour the student picked, are not.
    expect(isResultArrow({ id: 'a', color: PALETTE.vector[0] })).toBe(false)
    expect(isResultArrow({ id: 'b', color: '#123456' })).toBe(false)
  })

  it('draws every arrow in its theme token; a picked colour stays the student’s, the old swatches included', () => {
    expect(tokenOf({ type: 'vector', color: PALETTE.vector[1] })).toBe('--vec-2')
    expect(tokenOf({ type: 'vector', color: '#123456' })).toBeUndefined()
    // The Properties swatches still offer the eight 0.6.1 colours. Picked, each is shown as picked:
    // cyan used to show as the blue token and pink and red as one orange. Old files' arrows in
    // these colours were given their tokens when the file was read (core/migrate.ts, format 4).
    for (const c of SWATCHES) expect(tokenOf({ type: 'vector', color: c }), c).toBeUndefined()
    expect(cssColor({ type: 'vector', color: '#22b8cf' })).toBe('#22b8cf')
    // An old file's arrow carries its token in `themed`, which Properties clears when a colour is picked.
    expect(tokenOf({ type: 'vector', color: '#4dabf7', themed: '--vec-1' })).toBe('--vec-1')
    expect(readSource('src/renderer/src/panels/Properties.tsx')).toMatch(/delete d\.themed/)
    // Not every blue thing is an arrow: a graph in the same hex keeps it.
    expect(tokenOf({ type: 'graph', color: '#4dabf7' })).toBeUndefined()
    expect(cssColor({ type: 'vector', color: PALETTE.vector[0] })).toBe(`var(--vec-1, ${PALETTE.vector[0]})`)
  })

  it('gives R its parents’ weight and a second head, and drops the colour mix that sat beside a parent', () => {
    const view = readSource('src/renderer/src/render/ObjectViews.tsx')
    expect(view).not.toMatch(/mixOklabMany/)
    expect(view).toMatch(/const result = isResultArrow\(obj\)/)
    expect(view).toMatch(/result \? colors\.result : shownColor\(obj\)/)
    // One thickness for every arrow; only selection or hover changes it.
    expect(view).toMatch(/const thick = selected \? 2\.4 : hovered \? 2\.1 : 1\.7\n/)
    expect(view).toMatch(/\{result && L \/ wpp > 4 \* RESULT_HEAD_GAP_PX && <Arrow tail=\{tail\} comp=\{comp\} color=\{color\} is3D=\{is3D\} thick=\{thick\} tipPx=\{-RESULT_HEAD_GAP_PX\} \/>\}/)
    // The second head sits clear of the first: a whole 12 px head and a gap back.
    expect(RESULT_HEAD_GAP_PX).toBeGreaterThan(HEAD_PX)
    // The components have their own pair of tokens.
    expect(view).toMatch(/xComp: themeColor\('--vec-x'\)/)
    expect(view).toMatch(/yComp: themeColor\('--vec-y'\)/)
  })
})

describe('smaller points', () => {
  it('draw a free point at about two thirds of the 5 px of 0.6.0, and a derived one smaller', () => {
    expect(POINT_PX.free / 5).toBeGreaterThanOrEqual(0.6)
    expect(POINT_PX.free / 5).toBeLessThanOrEqual(0.7)
    expect(POINT_PX.derived / 4).toBeGreaterThanOrEqual(0.6)
    expect(POINT_PX.derived / 4).toBeLessThanOrEqual(0.7)
    expect(pointRadius(undefined, true, false)).toBe(POINT_PX.free)
    expect(pointRadius(undefined, false, false)).toBe(POINT_PX.derived)
    expect(pointRadius(undefined, true, true)).toBeGreaterThan(POINT_PX.free)
  })

  it('keep a size the student set', () => {
    expect(pointRadius(8, true, false)).toBe(8)
  })

  it('keep the halo in proportion, as 0.6.0 had it at 6.6 for 5, but never under a pixel wide', () => {
    expect(pointHalo(5)).toBeCloseTo(6.6, 9)
    expect(pointHalo(POINT_PX.free) / POINT_PX.free).toBeCloseTo(1.32, 9)
    expect(pointHalo(POINT_PX.free)).toBeLessThan(6.6)
    expect(pointHalo(POINT_PX.derived) - POINT_PX.derived).toBeGreaterThanOrEqual(1)
    expect(pointHalo(1) - 1).toBeGreaterThanOrEqual(1)
  })

  it('are picked from a 44 px target, whatever size the dot is drawn at', () => {
    expect(POINT_REACH_PX * 2).toBeGreaterThanOrEqual(44)
    // Snapping a new point onto an old one keeps its own, tighter radius.
    expect(readSource('src/renderer/src/render/Interaction.tsx')).toMatch(/const SNAP_POINT_PX = 12/)
  })

  it('a point beside a segment at the same spot is picked first, within POINT_REACH_PX', () => {
    // A 1000 × 800 canvas looking straight down, 50 px to the unit. P at (4, 0) sits on the segment A–B.
    const camera = new THREE.OrthographicCamera(-500, 500, 400, -400, 0.1, 1000)
    camera.position.set(0, 0, 100)
    camera.zoom = 50
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    const base = (id: string, name: string) => ({ id, name, visible: true, locked: false, color: '#000', showLabel: true })
    const point = (id: string, name: string, p: V3): SceneObject => ({ ...base(id, name), type: 'point', def: { kind: 'free', p } })
    const list: SceneObject[] = [point('pA', 'A', [0, 0, 0]), point('pP', 'P', [4, 0, 0]), point('pB', 'B', [8, 0, 0]), { ...base('sAB', 'AB'), type: 'segment', a: 'pA', b: 'pB' }]
    const objects = Object.fromEntries(list.map((o) => [o.id, o]))
    const order = list.map((o) => o.id)
    const ctx: PickContext = { camera, size: { width: 1000, height: 800 }, objects, order, ev: evaluateScene(objects, order, DEFAULT_SETTINGS, 0) }
    const xP = 500 + 4 * 50
    // Just inside the reach to the left of P, on the segment too: the point's body wins.
    const near = pickAll(ctx, xP - (POINT_REACH_PX - 0.5), 400)
    expect(near[0]).toMatchObject({ id: 'pP', part: 'body' })
    expect(near.map((h) => h.id)).toContain('sAB')
    // Just past the reach the point is not offered, and the segment is what is picked.
    const far = pickAll(ctx, xP - (POINT_REACH_PX + 0.5), 400)
    expect(far.map((h) => h.id)).not.toContain('pP')
    expect(far[0]?.id).toBe('sAB')
  })

  it('are drawn through the pure helpers', () => {
    const src = readSource('src/renderer/src/render/ObjectViews.tsx')
    expect(src).toMatch(/const r = pointRadius\(obj\.size, free, hovered\)/)
    expect(src).toMatch(/<circleGeometry args=\{\[pointHalo\(r\), 28\]\} \/>/)
    expect(src).toMatch(/labelAnchors\.set\(obj\.id, \{ p: pos, \.\.\.pickLabelOffset\(\{ x: me\.x, y: me\.y, r \}, near\) \}\)/)
  })

  it('project every point once a frame for the labels, and only the points of the drawing on screen', () => {
    const src = readSource('src/renderer/src/render/ObjectViews.tsx')
    // One shared projection per frame, keyed on the clock R3F advances before any useFrame runs.
    expect(src).toMatch(/projectPoints\(camera, size, clock\.elapsedTime\)/)
    expect(src).toMatch(/if \(cache\.at === at && cache\.w === size\.width && cache\.h === size\.height\) return cache\.pts/)
    // The same visibility rule SceneObjects draws by, so a hidden drawing's point moves no letter.
    expect(src).toMatch(/!visibleIn\(o, activeSpace\) \|\| oc\?\.type !== 'point'/)
  })
})

describe('where a point label goes', () => {
  const P = { x: 100, y: 100, r: 3.4 }
  /** Whether the label box centred at the offset covers a point of radius r. */
  const covers = (o: { dx: number; dy: number }, n: { x: number; y: number }, r = P.r) => {
    const left = P.x + o.dx - LABEL_BOX.w / 2
    const top = P.y + o.dy - LABEL_BOX.h / 2
    const cx = Math.max(left, Math.min(n.x, left + LABEL_BOX.w))
    const cy = Math.max(top, Math.min(n.y, top + LABEL_BOX.h))
    return Math.hypot(n.x - cx, n.y - cy) < r
  }

  it('is up and to the right by default, clear of the point', () => {
    const o = pickLabelOffset(P, [])
    expect(o.dx).toBeGreaterThan(0)
    expect(o.dy).toBeLessThan(0)
    expect(covers(o, P)).toBe(false)
  })

  it('moves to another corner when a neighbour sits up-right, and never covers either point', () => {
    const n = { x: 112, y: 88 }
    const o = pickLabelOffset(P, [n])
    expect(o.dx < 0 || o.dy > 0).toBe(true)
    expect(covers(o, P)).toBe(false)
    expect(covers(o, n)).toBe(false)
  })

  it('finds a free side when every corner is taken', () => {
    const corners = [
      { x: 116, y: 84 },
      { x: 84, y: 84 },
      { x: 116, y: 116 },
      { x: 84, y: 116 }
    ]
    const o = pickLabelOffset(P, corners)
    // A side slot: the corners are all taken.
    expect(o.dx === 0 || o.dy === 0).toBe(true)
    expect(covers(o, P)).toBe(false)
    for (const n of corners) expect(covers(o, n)).toBe(false)
  })

  it('still answers, with the least overlap, when the point is surrounded', () => {
    const ring = Array.from({ length: 16 }, (_, i) => ({ x: 100 + 9 * Math.cos((i * Math.PI) / 8), y: 100 + 9 * Math.sin((i * Math.PI) / 8) }))
    const o = pickLabelOffset(P, ring)
    expect(Number.isFinite(o.dx) && Number.isFinite(o.dy)).toBe(true)
    expect(covers(o, P)).toBe(false)
  })

  it('clears a bigger point too', () => {
    const big = { x: 50, y: 50, r: 9 }
    const o = pickLabelOffset(big, [])
    const left = big.x + o.dx - LABEL_BOX.w / 2
    const top = big.y + o.dy - LABEL_BOX.h / 2
    const cx = Math.max(left, Math.min(big.x, left + LABEL_BOX.w))
    const cy = Math.max(top, Math.min(big.y, top + LABEL_BOX.h))
    expect(Math.hypot(big.x - cx, big.y - cy)).toBeGreaterThanOrEqual(big.r)
  })
})
