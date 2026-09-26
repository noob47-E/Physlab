/**
 * GLM audit findings #7, #8, #27 and #28 (C:/my_projects/PhysLab-research/09/glm-audit/CONFIRMED.md),
 * each reproduced on phase-0.9 before it was fixed:
 *  #7  a Space-held pan in the 3-D drawing left the Sandbox's left drag panning instead of turning;
 *  #8  the Sandbox clock's reserved width grew mid-run at 8–12 decimal places;
 *  #27 the 3-D grid never wrote the 0 at the origin that its axis labels leave out for it;
 *  #28 batched arrows painted every shaft before every head, so crossing arrows stacked the other
 *      way round from the per-arrow renderer they replace.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { drag3D, HOME_3D } from '../src/renderer/src/render/viewMath'
import { floorLabels } from '../src/renderer/src/render/Grid'
import { niceStep, toScreen } from '../src/renderer/src/render/cameraUtils'
import type { V3 } from '../src/renderer/src/math/vec'
import { arrowBatchMaterial, syncBatch, type BatchLive } from '../src/renderer/src/render/ArrowBatch'
import { instanceColor } from 'three/tsl'
import { arrowMatrices, arrowRGB, type BatchEntry } from '../src/renderer/src/render/arrowBatchMath'
import { releaseLeftDrag, setLeftDrag } from '../src/renderer/src/render/Interaction'
import { DEFAULT_SETTINGS } from '../src/renderer/src/core/store'
import type { SceneSettings } from '../src/renderer/src/core/types'
import { clockText, widestClockText } from '../src/renderer/src/sim/transport'
import { readSource } from './helpers/repo'
import { resetGlobals } from './helpers/globals'

beforeEach(() => resetGlobals())

describe('#7 the 3-D drawing leaves the left button turning when the Sandbox takes over', () => {
  it('a Space-held pan in the drawing is handed back as a turn once the drawing’s listeners go', () => {
    // CameraRig's button map: made once, handed to OrbitControls by reference, and kept across a
    // switch to the Sandbox, where Interaction (the only thing that sets LEFT per press) is not mounted.
    const buttons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }
    const press = drag3D({ button: 0, tool: 'select', onObject: false, spaceHeld: true })
    expect(press).toBe('pan')
    setLeftDrag(buttons, 'pan')
    expect(buttons.LEFT).toBe(THREE.MOUSE.PAN)
    releaseLeftDrag(buttons)
    // The Sandbox's own rule for a left drag on empty space, which OrbitControls then acts on.
    expect(drag3D({ button: 0, tool: 'select', onObject: false })).toBe('turn')
    expect(buttons.LEFT).toBe(THREE.MOUSE.ROTATE)
    releaseLeftDrag(null)
  })

  it('Interaction sets the button through setLeftDrag and releases it when its listeners are removed', () => {
    const src = readSource('src/renderer/src/render/Interaction.tsx')
    expect(src).toMatch(/setLeftDrag\(c\.mouseButtons, act\)/)
    expect(src).not.toMatch(/c\.mouseButtons\.LEFT = /)
    // The cleanup that removes the pointerdown listener is the one that hands the button back.
    const cleanup = src.slice(src.indexOf("host.removeEventListener('pointerdown', onDown"))
    expect(cleanup.slice(0, cleanup.indexOf('\n    }\n'))).toMatch(/releaseLeftDrag\(leftButtons\)/)
  })
})

describe('#8 the Sandbox clock keeps the same room for a whole run at every precision the menu offers', () => {
  const settingsFor = (precisionMode: 'dp' | 'sf', decimals: number): SceneSettings => ({ ...DEFAULT_SETTINGS, precisionMode, decimals })
  // The measure menu offers 0–12 decimal places and 1–12 significant figures (app/TopBar.tsx).
  const EVERY = [...Array.from({ length: 13 }, (_, d) => settingsFor('dp', d)), ...Array.from({ length: 12 }, (_, d) => settingsFor('sf', d + 1))]

  it('never needs more room than it reserved at t = 0, frame by frame on the sim’s own running clock', () => {
    for (const s of EVERY) {
      const room = widestClockText(0, s)
      // The sim's clock is a running sum of 1/60, so it reads 1.9999999999999978 where frame/60 reads 2.
      let t = 0
      for (let frame = 0; frame < 60_000; frame++, t += 1 / 60) {
        const text = clockText(t, s)
        if (text.length > room.length) expect.fail(`${s.precisionMode} ${s.decimals} at frame ${frame}: “${text}” is wider than the room kept, “${room}”`)
        if (frame % 97 === 0) expect(widestClockText(t, s)).toBe(room)
      }
    }
  })

  it('reserves the width a three-digit run time needs at 8 and 12 decimal places', () => {
    // 100.01666667 s is frame 6001 at 8 places: 18 characters, where the room kept used to be 17.
    expect(clockText(6001 / 60, settingsFor('dp', 8))).toBe('t = 100.01666667 s')
    expect(widestClockText(0, settingsFor('dp', 8)).length).toBe('t = 100.01666667 s'.length)
    expect(widestClockText(0, settingsFor('dp', 12)).length).toBe('t = 100.016666666667 s'.length)
  })
})

describe('#27 the 3-D grid writes 0 where its axes cross', () => {
  const SIZE = { width: 1280, height: 800 }
  /** The 3-D drawing's own camera at its home view (render/viewMath.ts HOME_3D, CameraRig's fov and up). */
  function home3D(): THREE.PerspectiveCamera {
    const c = new THREE.PerspectiveCamera(45, SIZE.width / SIZE.height, 0.01, 5000)
    c.up.set(0, 0, 1)
    c.position.set(...HOME_3D.position)
    c.lookAt(...HOME_3D.target)
    c.updateProjectionMatrix()
    c.updateMatrixWorld(true)
    return c
  }

  it('numbers the axes around one shared 0 at the origin, as the 2-D grid does', () => {
    const camera = home3D()
    const screenOf = (p: V3) => toScreen(camera, SIZE, p)
    // Grid3D's own extent for this camera distance: step = niceStep(distance / 12), ten steps each way.
    const step = niceStep(camera.position.length() / 12)
    const labels = floorLabels(screenOf, SIZE, step * 10, step, DEFAULT_SETTINGS)
    // Home view: every 4 units along x, y and z, as the app shows it.
    expect(labels.filter((l) => l.text === '4')).toHaveLength(3)
    const zeros = labels.filter((l) => l.text === '0')
    // One 0, not three, and exactly where the three coloured axis lines meet.
    expect(zeros).toHaveLength(1)
    const o = screenOf([0, 0, 0])
    expect(zeros[0].x).toBeCloseTo(o.x, 6)
    expect(zeros[0].y).toBeCloseTo(o.y, 6)
  })

  it('writes no 0 when the origin is off screen', () => {
    const camera = home3D()
    camera.position.set(40, 40, 3)
    camera.lookAt(60, 60, 0)
    camera.updateMatrixWorld(true)
    const screenOf = (p: V3) => toScreen(camera, SIZE, p)
    const o = screenOf([0, 0, 0])
    expect(o.visible && o.x >= 0 && o.x <= SIZE.width && o.y >= 0 && o.y <= SIZE.height).toBe(false)
    expect(floorLabels(screenOf, SIZE, 20, 2, DEFAULT_SETTINGS).some((l) => l.text === '0')).toBe(false)
  })
})

describe('#28 batched arrows stack at a crossing the way the per-arrow renderer stacked them', () => {
  // three's WebGPU render list (node_modules/three/src/renderers/common/RenderList.js,
  // painterSortStable): with depth testing off, items draw by render order, then view depth, then
  // Object3D id. Every 2-D arrow lies at z = 0 under a camera looking straight down z, so the depth
  // ties and the id (creation order) decides; inside one instanced mesh, instances draw in order.
  const paintOrder = (items: THREE.Object3D[]): THREE.Object3D[] => [...items].sort((a, b) => a.renderOrder - b.renderOrder || a.id - b.id)

  const WPP = 0.02
  const entry = (tail: V3, comp: V3, css: string, renderOrder = 12): BatchEntry => ({ tail, comp, thick: 1.7, renderOrder, css, rgb: arrowRGB(css) })
  // A and B cross at the origin, so does C over A's head; D sits in a later render order.
  const ARROWS: BatchEntry[] = [
    entry([-2, 0, 0], [3, 0, 0], '#ff0000'),
    entry([0, -2, 0], [0, 4, 0], '#00ff00'),
    entry([1, -1, 0], [0, 2, 0], '#0000ff'),
    entry([-1, -1, 0], [2, 2, 0], '#ffff00', 14)
  ]

  /** What each drawn instance is — which arrow, which part — in the order the GPU paints them. */
  function batchPaintSequence(entries: BatchEntry[]): string[] {
    const g = new THREE.Group()
    const live: BatchLive = { orders: new Map(), slabs: new Map(), need: new Map() }
    const reg = new Map(entries.map((e, i) => [`a${i}`, e]))
    syncBatch(g, live, reg, () => WPP, new THREE.MeshBasicMaterial())
    const expected = entries.map((e) => {
      const shaft = new THREE.Matrix4()
      const head = new THREE.Matrix4()
      arrowMatrices(e.tail, e.comp, WPP, e.thick, shaft, head, e.headPx, e.tipPx)
      return { shaft: shaft.elements, head: head.elements }
    })
    const same = (a: ArrayLike<number>, at: number, b: number[]) => b.every((v, i) => Math.abs(a[at + i] - v) < 1e-6)
    const out: string[] = []
    for (const o of paintOrder(g.children.filter((c) => c.visible))) {
      const m = o as THREE.InstancedMesh
      for (let k = 0; k < m.count; k++) {
        const i = expected.findIndex((x) => same(m.instanceMatrix.array, k * 16, x.shaft) || same(m.instanceMatrix.array, k * 16, x.head))
        expect(i, `instance ${k} of a render-order-${m.renderOrder} mesh matches no arrow`).toBeGreaterThanOrEqual(0)
        const part = same(m.instanceMatrix.array, k * 16, expected[i].shaft) ? 'shaft' : 'head'
        // Each instance wears its own arrow's colour.
        const c = m.instanceColor!.array
        expect([c[k * 3], c[k * 3 + 1], c[k * 3 + 2]]).toEqual([...entries[i].rgb].map((v) => Math.fround(v)))
        out.push(`${i < 4 ? 'ABCD'[i] : i}.${part}`)
      }
    }
    return out
  }

  it('the per-arrow renderer paints each arrow whole, shaft then head, in the order the arrows mounted', () => {
    // MeshArrow mounts <mesh shaft/> then <mesh head/> for each arrow; ids follow creation.
    const meshes = ARROWS.flatMap((e, i) =>
      (['shaft', 'head'] as const).map((part) => Object.assign(new THREE.Mesh(), { renderOrder: e.renderOrder, name: `${'ABCD'[i]}.${part}` }))
    )
    expect(paintOrder(meshes).map((m) => m.name)).toEqual(['A.shaft', 'A.head', 'B.shaft', 'B.head', 'C.shaft', 'C.head', 'D.shaft', 'D.head'])
  })

  it('the batch paints in that same order, so the later arrow’s shaft still covers the earlier one’s head', () => {
    expect(batchPaintSequence(ARROWS)).toEqual(['A.shaft', 'A.head', 'B.shaft', 'B.head', 'C.shaft', 'C.head', 'D.shaft', 'D.head'])
  })

  it('keeps that order when a render order outgrows its meshes and they are rebuilt bigger', () => {
    const many = Array.from({ length: 70 }, (_, i) => entry([i * 0.1, 0, 0], [0.05, 1, 0], i % 2 ? '#ff0000' : '#0000ff'))
    const seq = batchPaintSequence(many)
    expect(seq).toHaveLength(140)
    // Shaft then head of the same arrow, arrow after arrow, in the order they joined.
    const name = (i: number) => (i < 4 ? 'ABCD'[i] : String(i))
    expect(seq).toEqual(many.flatMap((_, i) => [`${name(i)}.shaft`, `${name(i)}.head`]))
  })

  it('the real batch material wires instanceColor into colorNode, so a NodeMaterial paints each arrow’s own colour instead of white', () => {
    // MeshBasicMaterial multiplies by instanceColor automatically; MeshBasicNodeMaterial (the real
    // batch material, needed for the shaft/head fold above) does not — its colorNode defaults to
    // null, so a batch would draw flat white without this wired in.
    const mat = arrowBatchMaterial()
    expect(mat.colorNode).toBe(instanceColor)
  })
})
