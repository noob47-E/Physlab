// V5 (owner's report, Vectors mode, 2 d.p.): with A = 6∠0° and B = 6∠120° drawn head-to-tail, an
// angle measured at the arrows' joints read α = 60.15° where the geometry gives exactly 60°;
// switching the layout took away the points and the angle built on the answer R; and a point label
// showing only its letter had a stray "⌈" before it (⌈E, ⌈C).
//
// The causes, found in the code:
// 1. render/Interaction.tsx `snapAt` tries an existing point, a crossing, the grid, a side or a
//    circle, an axis, else a free point tidied to step/20 — never an arrow's head. A click at a lone
//    tip (no other arrow ends there, nothing crosses there) lands a grid or free point beside it,
//    and an angle measured on that point is off: (2.99, 5.21) beside (3, 3√3) reads 60.15°.
// 2. panels/vectorCalcStore.ts `drawAnswer` first removes everything the last Draw on graph added,
//    R among it, and makes a new R; removeObjects takes R's dependents (a point on its head, an
//    angle on that point) with it.
// 3. render/Labels.tsx draws a label that shows only a point's letter as a chip (`obj-label chip`),
//    whose 3 px left border in the point's colour reads as a "⌈" beside a lone letter.
//
// The snap decision moves into two pure functions beside SnapInfo in render/tools.ts, and the label
// decision into one in render/Labels.tsx (the drawing has no DOM in vitest). Until the fixer adds
// them their imports are undefined and the tests that call them fail with "is not a function".

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useScene } from '../src/renderer/src/core/store'
import { Builder } from '../src/renderer/src/core/factory'
import { dependentsOf } from '../src/renderer/src/core/evaluate'
import type { ObjId, PointObj, SceneObject, SceneSettings, VectorObj } from '../src/renderer/src/core/types'
import { formatMeasure } from '../src/renderer/src/math/format'
import type { V3 } from '../src/renderer/src/math/vec'
import type * as VS from '../src/renderer/src/math/vectorSolver'
import { niceStep } from '../src/renderer/src/render/cameraUtils'
import { minorStepOf, snapStep, snapToGrid } from '../src/renderer/src/render/gridMath'
import { headSnapTargets, pointOrHeadSnap, stillInDrag, type SnapInfo } from '../src/renderer/src/render/tools'
import { plainLetter } from '../src/renderer/src/render/Labels'
import { cardValues, drawAnswer, evalNumber, setResultOnly, solveOperation, startCardSync, useVC, type Card } from '../src/renderer/src/panels/vectorCalcStore'
import { readSource } from './helpers/repo'

const SQ3 = Math.sqrt(3)
const O3: V3 = [0, 0, 0]
/** A's head: A = 6∠0° from the origin in every layout. */
const A_HEAD: V3 = [6, 0, 0]
/** A + B = (3, 3√3): R's head in every layout, and B's head when B is drawn from A's head. */
const TOP: V3 = [3, 3 * SQ3, 0]
/** B's head when B is drawn from the origin (From origin, Parallelogram). */
const B_FROM_ORIGIN: V3 = [-3, 3 * SQ3, 0]

/** Equal but for the last bits cos and sin leave. */
const near = (a: readonly number[] | undefined, b: readonly number[]) => !!a && a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-9)

/** The angle at `v` between the arms to `a` and `b`, in degrees, worked out here and not by the app. */
const angleDeg = (a: V3, v: V3, b: V3): number => {
  const u = [a[0] - v[0], a[1] - v[1]]
  const w = [b[0] - v[0], b[1] - v[1]]
  return (Math.abs(Math.atan2(u[0] * w[1] - u[1] * w[0], u[0] * w[0] + u[1] * w[1])) * 180) / Math.PI
}

// ── The stores, set up as tests/vectorCalc.test.ts "an answer and its picture follow their cards" does ──

const scene = () => useScene.getState()
const vectors = () => Object.values(scene().objects).filter((o): o is VectorObj => o.type === 'vector')
const card = (id: number, name: string, extra: Partial<Card> = {}): Card => ({ id, name, entry: 'comp', latex: '', mag: '1', angle: '0', sceneId: '', ...extra })
const tailOf = (id: ObjId) => {
  const c = scene().ev.values.get(id)
  return c?.type === 'vector' ? c.tail : undefined
}
const headOf = (id: ObjId): V3 | undefined => {
  const c = scene().ev.values.get(id)
  return c?.type === 'vector' ? [c.tail[0] + c.comp[0], c.tail[1] + c.comp[1], c.tail[2] + c.comp[2]] : undefined
}
const pointOf = (id: ObjId): V3 | undefined => {
  const c = scene().ev.values.get(id)
  return c?.type === 'point' ? c.p : undefined
}
/** An angle object's value as worked out by the scene, in degrees. */
const angleOf = (id: ObjId): number => {
  const c = scene().ev.values.get(id)
  if (c?.type !== 'angle') throw new Error(`${scene().objects[id]?.name ?? id} is not an angle on the drawing`)
  return (c.value * 180) / Math.PI
}
/** What the angle's label says, at the settings reset() gives (2 d.p., degrees). */
const reads = (id: ObjId) => {
  const c = scene().ev.values.get(id)
  return c?.type === 'angle' ? formatMeasure(c.value, 'angle', scene().settings) : ''
}
const arrowOf = (name: string) => useVC.getState().cards.find((c) => c.name === name)!.sceneId
/** The answer arrow R on the drawing now. */
const answerArrow = () => vectors().find((o) => o.name === 'R')!.id
const result = () => useVC.getState().result!
/** A card's field changed, as the panel's updateCard does it: one new cards array. */
const edit = (name: string, patch: Partial<Card>) => useVC.setState({ cards: useVC.getState().cards.map((c) => (c.name === name ? { ...c, ...patch } : c)) })

/** "Add all", pressed exactly as VectorCalc.tsx `run` makes its answer (vectorCalc.test.ts `press`). */
const pressAddAll = () => {
  const st = useVC.getState()
  const values = cardValues(st.cards, scene().ev)
  const vs = st.cards.map((c, i) => {
    const v = values[i]
    if (typeof v === 'string') throw new Error(`Card ${c.name} cannot be read: ${v}`)
    return { name: c.name, v }
  })
  const q = evalNumber(st.q)
  const solve = (named: VS.NamedVec[], now: SceneSettings) => solveOperation('sum', named, now, 0, q)
  const sol = solve(vs, scene().settings)
  if (!sol) throw new Error('Add all gave no answer')
  useVC.setState({ result: { sol, label: 'Add all', from: { cards: st.cards.map((c) => ({ id: c.id, name: c.name })), solve } } })
}
/** "Draw on graph" under the answer card: drawAnswer(st.result!.sol, st.style). */
const drawShown = () => drawAnswer(useVC.getState().result!.sol, useVC.getState().style)
type Style = NonNullable<Parameters<typeof drawAnswer>[1]>
/** A layout chip under a drawn answer, as VectorCalc.tsx's onClick: set({ style: k }), then drawAnswer(st.result!.sol, k). */
const chip = (k: Style) => {
  useVC.setState({ style: k })
  drawAnswer(result().sol, k)
}

const reset = () => {
  useVC.setState({ cards: [], result: null, highlight: 0, style: null, k: '2', q: '1.6\\times10^{-19}' })
  scene().newScene()
  scene().setActiveSpace('vectors')
  // Two decimal places, degrees: what the owner had.
  scene().setSettings({ decimals: 2, precisionMode: 'dp', angleUnit: 'deg', unit: 'unit' })
  startCardSync()
}

/** The owner's picture: A = 6∠0° and B = 6∠120° typed as size∠angle cards, Add all, Draw on graph (head-to-tail, the sum's own layout). */
const drawOwnersPicture = () => {
  useVC.setState({ cards: [card(981, 'A', { entry: 'polar', mag: '6', angle: '0' }), card(982, 'B', { entry: 'polar', mag: '6', angle: '120' })] })
  pressAddAll()
  drawShown()
}

/**
 * The points the Angle tool makes once heads snap (pointAt → { kind: 'vectorHead', vector }): P on
 * B's head, Q on A's head, H on R's head; O a free point at the origin; α with arms O and P at the
 * vertex Q (the triangle's corner at A's head), β with arms Q and H at the vertex O (between A and R).
 */
const buildPoints = () => {
  const b = new Builder()
  const P = b.point({ kind: 'vectorHead', vector: arrowOf('B') })
  const Q = b.point({ kind: 'vectorHead', vector: arrowOf('A') })
  const O = b.point([0, 0, 0])
  const H = b.point({ kind: 'vectorHead', vector: answerArrow() })
  const alpha = b.angle(O.id, Q.id, P.id)
  const beta = b.angle(Q.id, O.id, H.id)
  scene().addObjects(b.created)
  return { P: P.id, Q: Q.id, O: O.id, H: H.id, alpha: alpha.id, beta: beta.id }
}

/** The three layout chips, each with where B's head is in it. */
const LAYOUTS: [Style, V3][] = [
  ['common-tail', B_FROM_ORIGIN],
  ['parallelogram', B_FROM_ORIGIN],
  ['head-to-tail', TOP]
]

// ── A. The snap decision ──────────────────────────────────────────────────────────────────────────

/** A head as snapAt hands it over: the arrow, its head in the drawing, and where that is on the canvas. */
const head = (id: ObjId, p: V3, x: number, y: number, visible = true) => ({ id, head: p, screen: { x, y, visible } })

describe('A. a click near an arrow’s head lands on the head (pointOrHeadSnap, render/tools.ts)', () => {
  // R's lone tip in the From-origin layout, at 100 px per unit with the origin at (0, 0) on the canvas.
  const tip = head('vR', TOP, 300, -100 * TOP[1])

  it('a click within the radius lands exactly on the head, as a vectorHead snap naming the arrow', () => {
    // The click that made (2.99, 5.21): 1 px left of the tip and 1.4 px above it.
    const sn = pointOrHeadSnap(null, [tip], 299, -521, 12)
    expect(sn).toMatchObject({ kind: 'vectorHead', vectorId: 'vR' })
    expect(sn!.p).toEqual(TOP)
  })

  it('of two heads within the radius the nearer one wins, whichever is listed first', () => {
    const a = head('vA', [1, 0, 0], 105, 0)
    const b = head('vB', [0, 1, 0], 92, 0)
    expect(pointOrHeadSnap(null, [a, b], 100, 0, 12)).toMatchObject({ kind: 'vectorHead', vectorId: 'vA', p: [1, 0, 0] })
    expect(pointOrHeadSnap(null, [b, a], 100, 0, 12)).toMatchObject({ kind: 'vectorHead', vectorId: 'vA', p: [1, 0, 0] })
  })

  it('the radius counts as it does for a point (hit.dist <= SNAP_POINT_PX); nothing beyond it, and no head behind the camera', () => {
    const h = head('vA', [1, 1, 0], 103, 4) // exactly 5 px from (100, 0)
    expect(pointOrHeadSnap(null, [h], 100, 0, 5)).toMatchObject({ kind: 'vectorHead', vectorId: 'vA' })
    expect(pointOrHeadSnap(null, [h], 100, 0, 4.99)).toBeNull()
    expect(pointOrHeadSnap(null, [head('vA', [1, 1, 0], 100, 0, false)], 100, 0, 12)).toBeNull()
    expect(pointOrHeadSnap(null, [], 100, 0, 12)).toBeNull()
  })

  it('an existing point under the cursor still wins, even over a nearer head', () => {
    const point: SnapInfo = { p: [3, 5.2, 0], kind: 'point', pointId: 'E', label: 'E' }
    expect(pointOrHeadSnap(point, [tip], 300, -100 * TOP[1], 12)).toBe(point)
  })

  it('there is no tail target: a click on a tail with no head near snaps as it does today (null here)', () => {
    // B drawn head-to-tail: tail (6, 0) at (600, 0), head (3, 3√3) far away.
    expect(pointOrHeadSnap(null, [head('vB', TOP, 300, -100 * TOP[1])], 600, 0, 12)).toBeNull()
  })
})

describe('A. which arrows’ heads are targets (headSnapTargets, render/tools.ts)', () => {
  beforeEach(reset)

  it('only arrows drawn and visible in the space being looked at — never a hidden one, one of another drawing, or one that moves with a drag', () => {
    const b = new Builder()
    const shown = b.vector({ kind: 'free', tail: [0, 0, 0], comp: [3, 4, 0] })
    const hidden = b.vector({ kind: 'free', tail: [1, 0, 0], comp: [1, 1, 0] }, { visible: false })
    const hiddenHelper = b.vector({ kind: 'free', tail: [2, 0, 0], comp: [1, 1, 0] }, { auxiliary: true, visible: false })
    // A −B or a stand-in copy Draw on graph adds: auxiliary, but drawn, so its head is a target.
    const shownHelper = b.vector({ kind: 'free', tail: [6, 0, 0], comp: [-3, 3 * SQ3, 0] }, { auxiliary: true })
    const dragged = b.vector({ kind: 'free', tail: [0, 1, 0], comp: [2, 0, 0] })
    b.point([5, 5, 0])
    scene().addObjects(b.created)
    // One drawn in Geometry, and one made where no drawing is active (shown everywhere).
    scene().setActiveSpace('shapes')
    const g = new Builder()
    const geometry = g.vector({ kind: 'free', tail: [0, 0, 0], comp: [0, 2, 0] })
    scene().addObjects(g.created)
    scene().setActiveSpace(null)
    const n = new Builder()
    const everywhere = n.vector({ kind: 'free', tail: [0, 0, 0], comp: [-2, 0, 0] })
    scene().addObjects(n.created)
    scene().setActiveSpace('vectors')
    expect(hidden.space).toBe('vectors')
    expect(hiddenHelper.space).toBe('vectors')
    expect(geometry.space).toBe('shapes')
    expect(everywhere.space).toBeUndefined()

    const s = scene()
    // A drag passes snapAt its `exclude` set: the dragged arrow and everything that moves with it.
    const targets = headSnapTargets(s.objects, s.order, s.ev, 'vectors', new Set([dragged.id]))
    expect(targets.map((t) => t.id).sort()).toEqual([shown.id, shownHelper.id, everywhere.id].sort())
    // The head, never the tail: tail + components.
    expect(targets.find((t) => t.id === shown.id)?.head).toEqual([3, 4, 0])
    expect(near(targets.find((t) => t.id === shownHelper.id)?.head, TOP)).toBe(true)
    // Not excluded, the dragged arrow is an ordinary target.
    expect(headSnapTargets(s.objects, s.order, s.ev, 'vectors').map((t) => t.id)).toContain(dragged.id)
    // Looking at Geometry: its own arrow and the one shown everywhere.
    expect(headSnapTargets(s.objects, s.order, s.ev, 'shapes').map((t) => t.id).sort()).toEqual([geometry.id, everywhere.id].sort())
  })

  it('Resultant only: the hidden A and B are not targets, the answer R is', () => {
    drawOwnersPicture()
    setResultOnly(true)
    const s = scene()
    expect(headSnapTargets(s.objects, s.order, s.ev, s.activeSpace).map((t) => t.id)).toEqual([answerArrow()])
  })
})

/** Every call of `name` in `src`, each with its whole argument list however it is wrapped. */
const callsOf = (src: string, name: string): string[] => {
  const out: string[] = []
  for (let at = src.indexOf(`${name}(`); at >= 0; at = src.indexOf(`${name}(`, at + 1)) {
    let depth = 0
    let end = at + name.length
    for (; end < src.length; end++) {
      if (src[end] === '(') depth++
      else if (src[end] === ')' && --depth === 0) break
    }
    out.push(src.slice(at, end + 1))
  }
  return out
}

// Read as text, with a one-line message on failure rather than the whole file.
describe('A. snapAt and pointAt use it as the wave head granted (render/Interaction.tsx, render/tools.ts)', () => {
  const src = readSource('src/renderer/src/render/Interaction.tsx')
  const snapAt = src.slice(src.indexOf('const snapAt ='), src.indexOf('const crossingNear ='))

  it('snapAt asks for a head straight after the existing point, with the points’ radius, before crossings and the grid', () => {
    const at = snapAt.indexOf('pointOrHeadSnap(')
    expect(at, 'snapAt calls pointOrHeadSnap').toBeGreaterThan(-1)
    expect(at < snapAt.indexOf('crossingNear(') && at < snapAt.indexOf('snapToGrid('), 'the head is tried before a crossing and the grid').toBe(true)
    expect(/\bSNAP_POINT_PX\b/.test(callsOf(snapAt, 'pointOrHeadSnap')[0] ?? ''), 'with the points’ radius, SNAP_POINT_PX').toBe(true)
  })

  it('the targets come from headSnapTargets, for the space on screen and without what a drag moves', () => {
    const calls = callsOf(src, 'headSnapTargets')
    expect(calls.length, 'Interaction.tsx calls headSnapTargets').toBeGreaterThan(0)
    expect(calls.every((c) => /\bactiveSpace\b/.test(c)), 'for the active space').toBe(true)
    expect(calls.every((c) => /\bexclude\b/.test(c)), 'leaving out what a drag moves (exclude)').toBe(true)
  })

  it('pointAt makes a point on the head: { kind: ‘vectorHead’, vector }', () => {
    const pointAt = src.slice(src.indexOf('const pointAt ='), src.indexOf('const onDown ='))
    expect(/kind: 'vectorHead', vector: sn\.vectorId\b/.test(pointAt), "pointAt builds { kind: 'vectorHead', vector: sn.vectorId }").toBe(true)
  })

  it('SnapInfo has the vectorHead kind and the arrow it names, and no tail kind; the hint, the ring and its colour know it', () => {
    const tools = readSource('src/renderer/src/render/tools.ts')
    const from = tools.indexOf('export interface SnapInfo')
    const info = tools.slice(from, tools.indexOf('\n}', from))
    expect(/'vectorTail'|'tail'/.test(info), 'SnapInfo has no tail kind').toBe(false)
    const note = src.slice(src.indexOf('const snapNote ='), src.indexOf('const pointAt ='))
    expect(note.includes("'vectorHead'"), 'snapNote (the tip) names a head snap').toBe(true)
    const markerAt = src.indexOf('function SnapMarker')
    expect(src.slice(markerAt, src.indexOf('\n}', markerAt)).includes("'vectorHead'"), 'SnapMarker sizes the ring for a head snap').toBe(true)
    const colours = src.slice(src.indexOf('function usePreviewColors'), src.indexOf('function ToolPreview'))
    expect(/\bvectorHead:/.test(colours), 'usePreviewColors gives a head snap its colour').toBe(true)
  })
})

// ── B. V5 end to end, through the real stores ─────────────────────────────────────────────────────

describe('B. points on the arrows’ heads keep their place through a retype and every layout', () => {
  beforeEach(reset)

  it('head-to-tail: α at A’s head between the origin and B’s head reads exactly 60° (guard)', () => {
    drawOwnersPicture()
    // The owner's picture: A (0,0)→(6,0), B (6,0)→(3, 3√3), R (0,0)→(3, 3√3) — an equilateral triangle.
    expect(near(tailOf(arrowOf('A')), O3)).toBe(true)
    expect(near(tailOf(arrowOf('B')), A_HEAD)).toBe(true)
    expect(near(tailOf(answerArrow()), O3)).toBe(true)
    expect(near(headOf(answerArrow()), TOP)).toBe(true)
    const ids = buildPoints()
    expect(near(pointOf(ids.P), TOP)).toBe(true)
    expect(near(pointOf(ids.Q), A_HEAD)).toBe(true)
    expect(angleOf(ids.alpha)).toBeCloseTo(angleDeg(O3, A_HEAD, TOP), 9)
    expect(angleOf(ids.alpha)).toBeCloseTo(60, 9)
    expect(reads(ids.alpha)).toBe('60°')
  })

  it('B retyped as 6∠90°: P follows B’s head and α reads 90°; the point on R’s head follows R (guard)', () => {
    drawOwnersPicture()
    const ids = buildPoints()
    edit('B', { angle: '90' })
    expect(near(headOf(arrowOf('B')), [6, 6, 0])).toBe(true)
    expect(near(pointOf(ids.P), [6, 6, 0])).toBe(true)
    expect(angleOf(ids.alpha)).toBeCloseTo(angleDeg(O3, A_HEAD, [6, 6, 0]), 9)
    expect(reads(ids.alpha)).toBe('90°')
    expect(near(pointOf(ids.H), [6, 6, 0])).toBe(true)
    expect(angleOf(ids.beta)).toBeCloseTo(45, 9)
  })

  it('B set back, then every layout chip: P, Q, O and α keep their ids, P sits on B’s head and α reads what the geometry gives (guard)', () => {
    drawOwnersPicture()
    const ids = buildPoints()
    edit('B', { angle: '90' })
    edit('B', { angle: '120' })
    expect(angleOf(ids.alpha)).toBeCloseTo(60, 9)
    for (const [style, bHead] of LAYOUTS) {
      chip(style)
      for (const id of [ids.P, ids.Q, ids.O, ids.alpha]) expect(scene().objects[id], `${style}: ${id}`).toBeDefined()
      // The layout is the textbook one: B drawn from A's head, or from the origin.
      expect(near(headOf(arrowOf('B')), bHead), `${style}: B's head`).toBe(true)
      expect(near(pointOf(ids.P), bHead), `${style}: P on B's head`).toBe(true)
      expect(near(pointOf(ids.Q), A_HEAD), `${style}: Q on A's head`).toBe(true)
      expect(angleOf(ids.alpha), `${style}: α`).toBeCloseTo(angleDeg(O3, A_HEAD, bHead), 9)
    }
    expect(reads(ids.alpha)).toBe('60°')
  })

  it('a point on R’s head, and the angle built on it, outlive every layout chip and stay on R’s head (fails today: drawAnswer removes R and makes a new one)', () => {
    drawOwnersPicture()
    const ids = buildPoints()
    expect(angleOf(ids.beta)).toBeCloseTo(60, 9)
    for (const [style] of LAYOUTS) {
      chip(style)
      const H = scene().objects[ids.H] as PointObj | undefined
      expect(H, `${style}: the point on R's head is still there`).toBeDefined()
      expect(H!.def, `${style}: on the R drawn now`).toEqual({ kind: 'vectorHead', vector: answerArrow() })
      expect(near(pointOf(ids.H), TOP), `${style}: on R's head`).toBe(true)
      expect(scene().objects[ids.beta], `${style}: the angle on it is still there`).toBeDefined()
      expect(angleOf(ids.beta), `${style}: β`).toBeCloseTo(angleDeg(A_HEAD, O3, TOP), 9)
      expect(reads(ids.beta)).toBe('60°')
    }
  })

  it('D: the click that reads 60.15° today beside R’s lone tip (From origin) lands on R’s head once heads snap, and the angle reads 60° (fails today)', () => {
    drawOwnersPicture()
    chip('common-tail')
    const R = answerArrow()
    expect(near(headOf(R), TOP)).toBe(true)
    // A 2-D view at 100 px per unit with the origin at (0, 0) on the canvas (y down).
    const ppu = 100
    const toCanvas = (p: V3) => ({ x: p[0] * ppu, y: -p[1] * ppu, visible: true })
    const s = scene()
    const heads = headSnapTargets(s.objects, s.order, s.ev, s.activeSpace).map((h) => ({ ...h, screen: toCanvas(h.head) }))
    const click = toCanvas([2.99, 5.21, 0])
    const sn = pointOrHeadSnap(null, heads, click.x, click.y, 12)
    expect(sn).toMatchObject({ kind: 'vectorHead', vectorId: R })
    // The point pointAt makes for it, and the angle between A and R at the origin.
    const b = new Builder()
    const P = b.point({ kind: 'vectorHead', vector: R })
    const Q = b.point({ kind: 'vectorHead', vector: arrowOf('A') })
    const O = b.point([0, 0, 0])
    const alpha = b.angle(Q.id, O.id, P.id)
    scene().addObjects(b.created)
    expect(angleOf(alpha.id)).toBeCloseTo(60, 9)
    expect(reads(alpha.id)).toBe('60°')
  })
})

// ── C. A label that shows only a point's letter is a plain letter ─────────────────────────────────

describe('C. a point’s letter alone is a plain letter, not a chip (plainLetter, render/Labels.tsx)', () => {
  const base = { visible: true, locked: false, color: '#f1f3f5', showLabel: true }
  const point = { ...base, id: 'p1', name: 'E', type: 'point', def: { kind: 'free', p: [3, 5.2, 0] } } as SceneObject
  const vector = { ...base, id: 'v1', name: 'A', type: 'vector', def: { kind: 'free', tail: [0, 0, 0], comp: [6, 0, 0] } } as SceneObject
  const segment = { ...base, id: 's1', name: 'f', type: 'segment', a: 'p1', b: 'p2' } as SceneObject

  it('a point showing only its letter (Always show point letters) is plain; with its coordinates it is a chip', () => {
    expect(plainLetter(point, true, '')).toBe(true)
    expect(plainLetter(point, true, '(3, 5.2)')).toBe(false)
    expect(plainLetter(point, false, '(3, 5.2)')).toBe(false)
  })

  it('a vector and a segment stay chips, with or without a measurement', () => {
    expect(plainLetter(vector, true, '')).toBe(false)
    expect(plainLetter(vector, true, '6 u ∠ 0°')).toBe(false)
    expect(plainLetter(segment, true, '')).toBe(false)
    expect(plainLetter(segment, true, '6 u')).toBe(false)
  })

  it('LabelLayer asks plainLetter and leaves the chip class off a plain letter', () => {
    const src = readSource('src/renderer/src/render/Labels.tsx')
    const layer = src.slice(src.indexOf('export function LabelLayer'), src.indexOf('export function LabelProjector'))
    expect(/plainLetter\(\s*o\s*,\s*showName\s*,\s*text\s*\)/.test(layer), 'LabelLayer calls plainLetter(o, showName, text)').toBe(true)
    // The chip class was on every label, unconditionally. Either the class list now asks the
    // decision (plain ? '…' : '… chip …', or !plain ? '… chip …' : '…'), or a plain letter has
    // returned before the chip is built.
    const named = layer.match(/const (\w+) = plainLetter\(/)?.[1]
    const decision = named ? `(?:plainLetter\\([^)]*\\)|\\b${named}\\b)` : 'plainLetter\\([^)]*\\)'
    const noChip = "'(?:(?!chip)[^'])*'"
    const withChip = "'[^']*\\bchip\\b[^']*'"
    const ternary =
      new RegExp(`${decision}\\s*\\?\\s*${noChip}\\s*:\\s*${withChip}`).test(layer) || new RegExp(`!\\s*${decision}\\s*\\?\\s*${withChip}\\s*:\\s*${noChip}`).test(layer)
    const chipClass = layer.search(/obj-label[^'"`]*\bchip\b/)
    const early = layer.search(new RegExp(`if \\(\\s*${decision}\\s*\\)\\s*(?:\\{\\s*)?return`))
    expect(ternary || (early >= 0 && early < chipClass), 'the chip class is added only when plainLetter is false').toBe(true)
  })
})

// ── D. Where 60.15° comes from ────────────────────────────────────────────────────────────────────

describe('D. evidence: 60.15° is α for a point beside R’s lone tip, not on it', () => {
  const settings = { ...useScene.getState().settings, decimals: 2, precisionMode: 'dp', angleUnit: 'deg' } as SceneSettings
  /** α(A's head, origin, p) as the label prints it. */
  const alpha = (p: V3) => formatMeasure((angleDeg(A_HEAD, O3, p) * Math.PI) / 180, 'angle', settings)
  /**
   * Where snapAt (render/Interaction.tsx ~149–207) puts a click (dx, dy) px from R's lone tip in the
   * From-origin layout today, in a 2-D view at `ppu` px per unit with the default 'lines' grid: no
   * point is there, no two curves cross there (only R passes), a vector is not a side or a circle,
   * and both axes are hundreds of pixels away — so the grid crossing when it is within
   * SNAP_GRID_PX = 9 px, else a free point tidied to step/20; with snapping off (Alt held, Snap
   * unticked) always the tidied free point.
   */
  const land = (dx: number, dy: number, ppu: number, snap: boolean): { kind: string; p: V3 } => {
    const major = niceStep(100 / ppu)
    const minor = minorStepOf(major)
    const step = snapStep(minor, 'lines')
    const w: V3 = [TOP[0] + dx / ppu, TOP[1] - dy / ppu, 0]
    const tidy = (v: number) => Math.round(v / (step / 20)) * (step / 20)
    const free: V3 = [tidy(w[0]), tidy(w[1]), 0]
    if (!snap) return { kind: 'free', p: free }
    const g = snapToGrid('lines', w, major, minor)
    return Math.hypot(g[0] - w[0], g[1] - w[1]) * ppu <= 9 ? { kind: 'grid', p: g } : { kind: 'free', p: free }
  }
  const at2 = (p: V3) => p.slice(0, 2).map((v) => Math.round(v * 1e4) / 1e4)

  it('the tip reads 60°; the points a click beside it lands read 60.02° (grid) or, some of them, 60.15° (free)', () => {
    expect(alpha(TOP)).toBe('60°')
    // Snapping off, 100 px per unit: a click 1 px left of and 1 px above the tip lands the part
    // head's (2.99, 5.21), and α = atan2(5.21, 2.99) = 60.1486°.
    const off = land(-1, -1, 100, false)
    expect(at2(off.p)).toEqual([2.99, 5.21])
    expect(alpha(off.p)).toBe('60.15°')
    // Snapping on, 120 px per unit (major 1, minor 0.2): most clicks within SNAP_POINT_PX = 12 px of
    // the tip land the grid crossing (3, 5.2), 60.02°; three land a free point reading 60.15°.
    const clicks: { dx: number; dy: number; kind: string; p: number[]; reads: string }[] = []
    for (let dx = -12; dx <= 12; dx++)
      for (let dy = -12; dy <= 12; dy++) {
        if (Math.hypot(dx, dy) > 12) continue
        const l = land(dx, dy, 120, true)
        clicks.push({ dx, dy, kind: l.kind, p: at2(l.p), reads: alpha(l.p) })
      }
    const grid = clicks.filter((c) => c.kind === 'grid')
    expect(new Set(grid.map((c) => `${c.p} ${c.reads}`))).toEqual(new Set(['3,5.2 60.02°']))
    expect(grid.length / clicks.length).toBeGreaterThan(0.5)
    expect(clicks.filter((c) => c.reads === '60.15°').map((c) => `(${c.dx}, ${c.dy}) → ${c.kind} (${c.p.join(', ')})`)).toEqual([
      '(-6, 7) → free (2.95, 5.14)',
      '(3, -10) → free (3.03, 5.28)',
      '(4, -10) → free (3.03, 5.28)'
    ])
  })
})

// ── E. Guards added with the fix ──────────────────────────────────────────────────────────────────

describe('E. guards: a drag never lands on what moves with it; a layout chip is one undo step', () => {
  beforeEach(reset)

  /** What snapAt offers during a drag that leaves out `exclude` (render/Interaction.tsx). */
  const dragTargets = (exclude: Set<ObjId>, point: ObjId) => {
    const s = scene()
    const still = stillInDrag(s.baseline, exclude, s.objects)
    return {
      heads: headSnapTargets(s.objects, s.order, s.ev, s.activeSpace, exclude)
        .filter((h) => still(h.id, h.head))
        .map((h) => h.id),
      point: still(point, pointOf(point)!)
    }
  }

  it('dragging B’s head: R’s head and a point on it move with the drag, so neither is a target; A’s head still is (stillInDrag)', () => {
    drawOwnersPicture()
    const ids = buildPoints()
    const B = arrowOf('B')
    // What startDrag leaves out for B: B and everything built on it — P, not H, which hangs on R.
    const exclude = new Set<ObjId>([B, ...dependentsOf(B, scene().objects)])
    expect(exclude.has(ids.P) && !exclude.has(ids.H)).toBe(true)
    scene().beginGesture()
    // Before it moves, R's head (and H) sit on B's own old head: landing there held B's head still.
    expect(dragTargets(exclude, ids.H)).toEqual({ heads: [arrowOf('A')], point: false })
    // B's head dragged to (6, 6): the Vector Calculator lays R out again, and R's head comes along.
    scene().updateObject(B, (d) => void (d.type === 'vector' && d.def.kind === 'free' && (d.def.comp = [0, 6, 0])), false)
    expect(near(headOf(answerArrow()), [6, 6, 0])).toBe(true)
    expect(dragTargets(exclude, ids.H)).toEqual({ heads: [arrowOf('A')], point: false })
    scene().endGesture()
    // No drag: every head is a target again.
    const s = scene()
    expect(headSnapTargets(s.objects, s.order, s.ev, s.activeSpace).map((h) => h.id)).toEqual([arrowOf('A'), B, answerArrow()])
  })

  it('dragging the start of an arrow drawn between two points leaves its end point a target: only a free arrow’s own head is left out', () => {
    const b = new Builder()
    const P = b.point([0, 0, 0])
    const Q = b.point([2, 0, 0])
    const V = b.vector({ kind: 'points', a: P.id, b: Q.id })
    scene().addObjects(b.created)
    const exclude = new Set<ObjId>([P.id, ...dependentsOf(P.id, scene().objects)])
    expect(exclude.has(V.id)).toBe(true)
    scene().beginGesture()
    expect(dragTargets(exclude, Q.id).point).toBe(true)
    scene().endGesture()
    // With no drag under way nothing is left out.
    expect(stillInDrag(null, exclude, scene().objects)(Q.id, [5, 5, 0])).toBe(true)
  })

  it('a layout chip is one undo step and the chip already shown none; undo brings the old layout back on the same arrows', () => {
    drawOwnersPicture()
    const ids = buildPoints()
    const R = answerArrow()
    const segments = () => Object.values(scene().objects).filter((o) => o.type === 'segment').length
    const steps = scene().past.length
    chip('head-to-tail')
    expect(scene().past.length, 'the layout already shown').toBe(steps)
    chip('parallelogram')
    expect(scene().past.length).toBe(steps + 1)
    expect(segments(), 'its far sides').toBe(2)
    chip('common-tail')
    expect(scene().past.length).toBe(steps + 2)
    expect(segments(), 'far sides taken away').toBe(0)
    scene().undo()
    expect(segments()).toBe(2)
    expect(near(headOf(arrowOf('B')), B_FROM_ORIGIN)).toBe(true)
    scene().undo()
    expect(segments()).toBe(0)
    expect(near(headOf(arrowOf('B')), TOP)).toBe(true)
    expect(answerArrow()).toBe(R)
    expect(near(pointOf(ids.H), TOP)).toBe(true)
    // A different answer still replaces the picture whole: the point on the old R goes with it.
    drawAnswer(solveOperation('sum', [{ name: 'A', v: [6, 0, 0] }, { name: 'B', v: [0, 6, 0] }], scene().settings, 0, 1)!, 'head-to-tail')
    expect(scene().objects[R]).toBeUndefined()
    expect(scene().objects[ids.H]).toBeUndefined()
  })
})

// ── F. Round 2 (an independent checker's FAIL): a plain point is never left out by the old-head rule ──

// stillInDrag left out every target sitting where a dragged free arrow's head was when the drag began,
// plain points included, for the whole drag. In the checker's picture a point F at (1.35, 0.85) has a
// Vector-tool arrow from the origin onto it; Move-dragging the arrow by its body so its tail goes onto F
// said "• grid" and landed on a grid crossing, where before V5 it said "• on F". The rule is for what
// moves WITH an arrow — another arrow's head, and a point defined by a head (kind vectorHead). A plain
// point does not move with the drag, so it stays a target.
describe('F. round 2: a plain point where a dragged free arrow’s head began is still a target (stillInDrag)', () => {
  beforeEach(reset)
  // A gesture left open by a failing assertion would make the next test's beginGesture a no-op, and
  // that test would be judged against this one's baseline.
  afterEach(() => scene().endGesture())

  /** F, the point in the checker's picture, and the spot the Vector tool's arrow ends on. */
  const F_AT: V3 = [1.35, 0.85, 0]

  /** What a Move drag of `arrow` by its body begins: what it leaves out, and the test snapAt applies to every target. */
  const beginDrag = (arrow: ObjId) => {
    const exclude = new Set<ObjId>([arrow, ...dependentsOf(arrow, scene().objects)])
    scene().beginGesture()
    const s = scene()
    return { exclude, still: stillInDrag(s.baseline, exclude, s.objects) }
  }
  /** The arrows whose heads snapAt still offers during that drag. */
  const heads = (exclude: Set<ObjId>, still: (id: ObjId, p: V3) => boolean) => {
    const s = scene()
    return headSnapTargets(s.objects, s.order, s.ev, s.activeSpace, exclude)
      .filter((h) => still(h.id, h.head))
      .map((h) => h.id)
  }

  it('the checker’s picture: F at (1.35, 0.85) and a free arrow from the origin onto it — dragging the arrow by its body leaves F a target, before and after it moves', () => {
    const b = new Builder()
    const F = b.point(F_AT)
    const V = b.vector({ kind: 'free', tail: O3, comp: F_AT })
    scene().addObjects(b.created)
    const { still } = beginDrag(V.id)
    // F sits where the arrow's head was when the drag began, but F does not move with the arrow.
    expect(still(F.id, pointOf(F.id)!), 'F at the start').toBe(true)
    // The arrow is dragged so its tail goes onto F: its head goes to F + (1.35, 0.85).
    scene().updateObject(V.id, (d) => void (d.type === 'vector' && d.def.kind === 'free' && (d.def.tail = [1.35, 0.85, 0])), false)
    expect(near(tailOf(V.id), F_AT)).toBe(true)
    expect(still(F.id, pointOf(F.id)!), 'F with the arrow’s tail on it').toBe(true)
  })

  it('every kind of plain point at that spot stays a target: free, midpoint, on a segment, an intersection', () => {
    const b = new Builder()
    const free = b.point(F_AT)
    const lo = b.point([0.7, 0.45, 0])
    const hi = b.point([2, 1.25, 0])
    const mid = b.point({ kind: 'midpoint', a: lo.id, b: hi.id })
    const left = b.point([0, 0.85, 0])
    const right = b.point([3, 0.85, 0])
    const along = b.segment(left.id, right.id)
    const onSeg = b.point({ kind: 'onObject', on: along.id, t: 0.45 })
    const bottom = b.point([1.35, 0, 0])
    const top = b.point([1.35, 3, 0])
    const upright = b.segment(bottom.id, top.id)
    const crossing = b.point({ kind: 'intersection', a: along.id, b: upright.id, index: 0 })
    const V = b.vector({ kind: 'free', tail: O3, comp: F_AT })
    scene().addObjects(b.created)
    const { still } = beginDrag(V.id)
    for (const [name, id] of [['free', free.id], ['midpoint', mid.id], ['on a segment', onSeg.id], ['intersection', crossing.id]] as [string, ObjId][]) {
      expect(near(pointOf(id), F_AT), `the ${name} point is at F`).toBe(true)
      expect(still(id, pointOf(id)!), `the ${name} point`).toBe(true)
    }
  })

  it('what moves with an arrow is still left out there: another arrow’s head, and a point defined by a head (vectorHead)', () => {
    const b = new Builder()
    const V = b.vector({ kind: 'free', tail: O3, comp: F_AT })
    // Another free arrow that ends at the same spot (the answer R beside a dragged B), and a point on its head.
    const W = b.vector({ kind: 'free', tail: [3, 0, 0], comp: [-1.65, 0.85, 0] })
    const onHead = b.point({ kind: 'vectorHead', vector: W.id })
    const plain = b.point(F_AT)
    scene().addObjects(b.created)
    const { exclude, still } = beginDrag(V.id)
    expect(near(headOf(W.id), F_AT) && near(pointOf(onHead.id), F_AT)).toBe(true)
    expect(heads(exclude, still), 'no arrow’s head is offered at the old head').toEqual([])
    expect(still(onHead.id, pointOf(onHead.id)!), 'the point on that head').toBe(false)
    expect(still(plain.id, pointOf(plain.id)!), 'the plain point beside them').toBe(true)
  })

  it('guards: a target elsewhere is still one, a plain point that has moved since the drag began is still left out, and with no drag nothing is', () => {
    const b = new Builder()
    const F = b.point(F_AT)
    const elsewhere = b.point([4, 4, 0])
    const V = b.vector({ kind: 'free', tail: O3, comp: F_AT })
    const W = b.vector({ kind: 'free', tail: [1, 1, 0], comp: [2, 0, 0] })
    scene().addObjects(b.created)
    const { exclude, still } = beginDrag(V.id)
    expect(still(elsewhere.id, pointOf(elsewhere.id)!)).toBe(true)
    expect(heads(exclude, still), 'an arrow ending elsewhere keeps its head').toEqual([W.id])
    // F carried off by something while the drag runs: it is no longer where the drag found it.
    scene().updateObject(F.id, (d) => void (d.type === 'point' && d.def.kind === 'free' && (d.def.p = [5, 5, 0])), false)
    expect(still(F.id, pointOf(F.id)!)).toBe(false)
    expect(stillInDrag(null, exclude, scene().objects)(F.id, F_AT)).toBe(true)
  })
})
