// The scene store: undo and redo must bring back not just the objects but everything worked out
// from them (names, values, who depends on whom) and the order they are drawn in; renaming an
// object must reach every formula that mentioned it.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { dependentsOf } from '../src/renderer/src/core/evaluate'
import { blankSceneFile, doomedBy, LABEL_PREFS, sidesOf, useScene } from '../src/renderer/src/core/store'
import type { SceneObject } from '../src/renderer/src/core/types'
import { readSource } from './helpers/repo'

const scene = () => useScene.getState()

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false, color: '#000', showLabel: true })
const point = (id: string, name: string, p: [number, number, number]): SceneObject => ({ ...base(id, name), type: 'point', def: { kind: 'free', p } })
const number = (id: string, name: string, expr: string): SceneObject => ({ ...base(id, name), type: 'number', expr })

/** A, B, the segment a = AB, k = 2a and a vector F = k i + 3 j: a small chain of dependencies. */
function chain(): SceneObject[] {
  return [
    point('pA', 'A', [1, 2, 0]),
    point('pB', 'B', [4, 6, 0]),
    { ...base('sAB', 'a'), type: 'segment', a: 'pA', b: 'pB' },
    number('nK', 'k', '2*a'),
    { ...base('vF', 'F'), type: 'vector', def: { kind: 'expr', expr: 'k*i + 3*j' } }
  ]
}

/** Everything the evaluator worked out, in a shape that can be compared. */
const graph = () => {
  const { ev, objects, order } = scene()
  return {
    order: [...order],
    names: [...ev.names.entries()],
    errors: [...ev.errors.entries()],
    scope: { ...ev.scope },
    dependents: order.map((id) => [id, [...dependentsOf(id, objects)].sort()])
  }
}

beforeEach(() => {
  scene().newScene()
})

describe('undo and redo', () => {
  it('put back the values, the names and the dependency graph after a delete', () => {
    scene().addObjects(chain())
    const before = graph()
    expect(before.scope.k).toBe(10)
    expect(before.dependents.find(([id]) => id === 'pA')![1]).toEqual(['nK', 'sAB', 'vF'])

    scene().removeObjects(['pA'])
    // Deleting A takes everything that needed it.
    expect(scene().order).toEqual(['pB'])
    expect(scene().ev.names.has('k')).toBe(false)

    scene().undo()
    expect(graph()).toEqual(before)

    scene().redo()
    expect(scene().order).toEqual(['pB'])
    // With no object called k, the name goes back to being the unit vector k̂.
    expect(scene().ev.scope.k).toEqual([0, 0, 1])

    scene().undo()
    expect(graph()).toEqual(before)
  })

  it('restore the order objects are drawn in, not just the set of them', () => {
    scene().addObjects(chain())
    const [pA, pB, sAB, nK, vF] = scene().order
    scene().removeObjects(['vF'])
    scene().addObjects([point('pC', 'C', [0, 0, 0])])
    scene().addObjects([chain()[4]])
    expect(scene().order).toEqual([pA, pB, sAB, nK, 'pC', vF])
    scene().undo()
    scene().undo()
    scene().undo()
    expect(scene().order).toEqual([pA, pB, sAB, nK, vF])
    scene().redo()
    scene().redo()
    scene().redo()
    expect(scene().order).toEqual([pA, pB, sAB, nK, 'pC', vF])
  })

  it('an edit that broke a dependent is undone all the way back to a working scene', () => {
    scene().addObjects(chain())
    const before = graph()
    scene().updateObject('nK', (d) => {
      if (d.type === 'number') d.expr = 'nosuchthing * 2'
    })
    expect(scene().ev.errors.has('nK')).toBe(true)
    expect(scene().ev.errors.has('vF')).toBe(true)
    scene().undo()
    expect(graph()).toEqual(before)
    expect(scene().ev.errors.size).toBe(0)
  })

  it('a drag is one undo step however many moves it took, and the values follow', () => {
    scene().addObjects(chain())
    scene().beginGesture()
    for (const x of [2, 3, 4, 5]) scene().updateObject('pA', (d) => {
      if (d.type === 'point' && d.def.kind === 'free') d.def.p = [x, 2, 0]
    })
    scene().endGesture()
    expect(scene().ev.scope.A).toEqual([5, 2, 0])
    expect(scene().past).toHaveLength(2) // add, then the whole drag
    scene().undo()
    expect(scene().ev.scope.A).toEqual([1, 2, 0])
    expect(scene().ev.scope.k).toBe(10)
  })

  it('does nothing at either end of the history', () => {
    scene().undo()
    expect(scene().order).toEqual([])
    scene().addObjects(chain())
    scene().redo()
    expect(scene().order).toHaveLength(5)
  })

  it('a new edit after an undo throws the redo branch away', () => {
    scene().addObjects(chain())
    scene().removeObjects(['vF'])
    scene().undo()
    scene().addObjects([point('pC', 'C', [0, 0, 0])])
    expect(scene().future).toEqual([])
    scene().redo()
    expect(scene().order).toContain('pC')
    expect(scene().order).toContain('vF')
  })
})

describe('renameObject', () => {
  it('renames inside every formula that used the old name, as one undo step', () => {
    scene().addObjects(chain())
    expect(scene().renameObject('nK', 'm')).toBeNull()
    const { objects, ev } = scene()
    expect(objects.nK.name).toBe('m')
    expect(objects.vF.type === 'vector' && objects.vF.def.kind === 'expr' ? objects.vF.def.expr : '').toBe('m*i + 3*j')
    expect(ev.names.get('m')).toBe('nK')
    expect(ev.names.has('k')).toBe(false)
    expect(ev.errors.size).toBe(0)
    expect(ev.scope.F).toEqual([10, 3, 0])
    expect([...dependentsOf('nK', objects)]).toEqual(['vF'])

    scene().undo()
    expect(scene().objects.nK.name).toBe('k')
    expect(scene().ev.scope.F).toEqual([10, 3, 0])
  })

  it('renames a segment used by name, and only whole words', () => {
    scene().addObjects([...chain(), number('nA1', 'a1', '1'), number('nSum', 's', 'a + a1 + 2*a')])
    expect(scene().renameObject('sAB', 'len')).toBeNull()
    const sum = scene().objects.nSum
    expect(sum.type === 'number' ? sum.expr : '').toBe('len + a1 + 2*len')
    const k = scene().objects.nK
    expect(k.type === 'number' ? k.expr : '').toBe('2*len')
    expect(scene().ev.scope.s).toBe(16)
  })

  it('renames inside a graph, its source line included', () => {
    scene().addObjects([number('nM', 'm', '3'), { ...base('g1', 'f'), type: 'graph', kind: 'explicit', source: 'y = m*x + m', exprs: ['m*x + m'] }])
    expect(scene().renameObject('nM', 'slope')).toBeNull()
    const g = scene().objects.g1
    expect(g.type === 'graph' ? g.exprs : []).toEqual(['slope*x + slope'])
    expect(g.type === 'graph' ? g.source : '').toBe('y = slope*x + slope')
  })

  it('renaming an object whose name a later object shadows leaves every formula alone', () => {
    // A loaded file may list two objects called a; the evaluator gives the name to the later
    // one, so b = a + 1 is 3. Renaming the first used to rewrite b to "c + 1" and make it 2.
    scene().addObjects([number('n1', 'a', '1'), number('n2', 'a', '2'), number('n3', 'b', 'a + 1')])
    expect(scene().ev.names.get('a')).toBe('n2')
    expect(scene().ev.scope.b).toBe(3)
    expect(scene().renameObject('n1', 'c')).toBeNull()
    expect(scene().objects.n1.name).toBe('c')
    const b = scene().objects.n3
    expect(b.type === 'number' ? b.expr : '').toBe('a + 1')
    expect(scene().ev.scope.b).toBe(3)
    expect(scene().ev.scope.c).toBe(1)
  })

  it('renaming the object that does own a shared name carries its dependents with it', () => {
    scene().addObjects([number('n1', 'a', '1'), number('n2', 'a', '2'), number('n3', 'b', 'a + 1')])
    expect(scene().renameObject('n2', 'c')).toBeNull()
    const b = scene().objects.n3
    expect(b.type === 'number' ? b.expr : '').toBe('c + 1')
    expect(scene().ev.scope.b).toBe(3)
    // The first a is now the only a.
    expect(scene().ev.names.get('a')).toBe('n1')
  })

  it('refuses a taken name, a reserved name or a name that is not a word, and changes nothing', () => {
    scene().addObjects(chain())
    const before = scene().objects
    expect(scene().renameObject('nK', 'A')).toMatch(/already the name/)
    expect(scene().renameObject('nK', 'x')).toMatch(/not available/)
    expect(scene().renameObject('nK', '2k')).toMatch(/not available/)
    expect(scene().renameObject('nK', 'k')).toBeNull()
    expect(scene().renameObject('nope', 'k')).toMatch(/no longer exists/)
    expect(scene().objects).toBe(before)
  })
  it('is what the Properties panel calls: the only place a student can rename anything', () => {
    // The panel kept a private copy of the old search-and-replace with no owner check, so the
    // shadowed-name fix above never ran in the app: renaming n1 there still rewrote b to "c + 1".
    const panel = readSource('src/renderer/src/panels/Properties.tsx')
    expect(panel).toContain('scene().renameObject(o.id, n.trim())')
    expect(panel).not.toMatch(/function renameObject/)
    expect(panel).not.toContain('exprRefs')
  })
})

describe('angle marks: a viewer preference, not part of the file', () => {
  // The store writes its preferences to localStorage inside a try/catch, so the test runner's
  // lack of one goes unnoticed; a stand-in here lets the test read what would have been saved.
  const stored = new Map<string, string>()
  const fakeStorage = { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => void stored.set(k, v) }
  beforeAll(() => {
    ;(globalThis as { localStorage?: unknown }).localStorage = fakeStorage
  })
  afterAll(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage
    scene().setSettings({ showAngleMarks: true })
  })

  it('is on by default and listed with the label preferences', () => {
    expect(scene().settings.showAngleMarks).toBe(true)
    expect(LABEL_PREFS).toContain('showAngleMarks')
  })

  it('lands in physlab.labelPrefs when switched off', () => {
    scene().setSettings({ showAngleMarks: false })
    expect(scene().settings.showAngleMarks).toBe(false)
    expect(JSON.parse(stored.get('physlab.labelPrefs') ?? '{}').showAngleMarks).toBe(false)
  })

  it('survives opening a file that says otherwise', () => {
    scene().setSettings({ showAngleMarks: false })
    const file = blankSceneFile()
    scene().loadScene({ ...file, settings: { ...file.settings, showAngleMarks: true } })
    expect(scene().settings.showAngleMarks).toBe(false)
  })

  it('no vector carries its own dead switch any more', () => {
    // `VectorObj.showAngle` was set on every vector and read by nothing.
    expect(readSource('src/renderer/src/core/types.ts')).not.toMatch(/showAngle\?: boolean/)
    expect(readSource('src/renderer/src/core/factory.ts')).not.toContain('showAngle:')
  })
})

describe('clearDrawing: delete everything on this drawing', () => {
  const stamped = (o: SceneObject, space: 'shapes' | 'vectors'): SceneObject => ({ ...o, space })

  it('removes what is on the drawing being looked at and leaves the other drawings alone', () => {
    scene().setActiveSpace('shapes')
    scene().addObjects([
      stamped(point('pA', 'A', [1, 2, 0]), 'shapes'),
      stamped(point('pB', 'B', [4, 6, 0]), 'shapes'),
      stamped({ ...base('sAB', 'a'), type: 'segment', a: 'pA', b: 'pB' }, 'shapes'),
      stamped(number('nV', 'v', '7'), 'vectors'),
      // Made where no drawing was active: shown everywhere, so it goes too.
      number('nE', 'e', '1')
    ])
    scene().select(['pA', 'nV'])
    scene().clearDrawing()
    expect(scene().order).toEqual(['nV'])
    expect(scene().ev.scope.v).toBe(7)
    // The selection is trimmed to what is left, not cleared wholesale.
    expect(scene().selection).toEqual(['nV'])
  })

  it('is one undo step, and undo brings everything back', () => {
    scene().setActiveSpace('shapes')
    scene().addObjects(chain().map((o) => stamped(o, 'shapes')))
    const before = graph()
    scene().clearDrawing()
    expect(scene().order).toEqual([])
    scene().undo()
    expect(graph()).toEqual(before)
    // One step: a second undo takes away the objects that were added, not something in between.
    scene().undo()
    expect(scene().order).toEqual([])
  })

  it('does nothing on an empty drawing (no undo step is recorded)', () => {
    scene().setActiveSpace('shapes')
    const past = scene().past.length
    scene().clearDrawing()
    expect(scene().past.length).toBe(past)
  })

  it('refuses where no drawing is active, rather than clearing every drawing at once', () => {
    // The Sandbox and the GPU Lab have no space of their own; there visibleOrder is everything,
    // and the palette's row once wiped all four drawings from a mode that showed none of them.
    scene().setActiveSpace(null)
    scene().addObjects([stamped(point('pA', 'A', [1, 2, 0]), 'shapes'), stamped(number('nV', 'v', '7'), 'vectors'), number('nE', 'e', '1')])
    const past = scene().past.length
    scene().clearDrawing()
    expect(scene().order).toEqual(['pA', 'nV', 'nE'])
    expect(scene().past.length).toBe(past)
    // The menu row is greyed on the same rule, and the palette says so instead of staying silent.
    expect(readSource('src/renderer/src/app/TopBar.tsx')).toMatch(/Delete everything on this drawing…', disabled: spaceOf\(mode\) === null/)
    const actions = readSource('src/renderer/src/app/contextActions.ts')
    expect(actions).toMatch(/if \(!s\(\)\.activeSpace\) \{\s*alert\(NO_DRAWING_TO_CLEAR\)/)
  })

  it('is what the Edit menu, the background menu and the palette call, with a question first', () => {
    for (const f of ['src/renderer/src/app/TopBar.tsx', 'src/renderer/src/app/contextActions.ts', 'src/renderer/src/app/SearchPalette.tsx']) {
      expect(readSource(f)).toContain('confirmClearDrawing')
    }
    const actions = readSource('src/renderer/src/app/contextActions.ts')
    expect(actions).toMatch(/confirm\('Delete every object on this drawing\? Undo brings them back\.'\)/)
  })
})

describe('deleting a shape takes its sides', () => {
  // The owner's report: "when an object is removed its plot stays on screen". The Triangle and
  // Polygon tools draw a shape as a polygon plus one segment per side; the sides depend on the
  // corner points, not on the polygon, so deleting the triangle left its three sides on screen,
  // indistinguishable from the triangle just deleted.
  const seg = (id: string, name: string, a: string, b: string): SceneObject => ({ ...base(id, name), type: 'segment', a, b })
  const poly = (id: string, name: string, points: string[]): SceneObject => ({ ...base(id, name), type: 'polygon', points, fill: true })
  /** A, B, C, the triangle ABC and its sides AB, BC, CA — what the Triangle tool makes, in the order it makes them. */
  const triangle = (): SceneObject[] => [
    point('pA', 'A', [0, 0, 0]),
    point('pB', 'B', [4, 0, 0]),
    point('pC', 'C', [0, 3, 0]),
    poly('tri', 'ABC', ['pA', 'pB', 'pC']),
    seg('sAB', 'a', 'pA', 'pB'),
    seg('sBC', 'b', 'pB', 'pC'),
    // Drawn the other way round: still the side CA.
    seg('sCA', 'c', 'pA', 'pC')
  ]
  const byId = (objs: SceneObject[]) => Object.fromEntries(objs.map((o) => [o.id, o]))
  const orderOf = (objs: SceneObject[]) => objs.map((o) => o.id)
  const sidesIn = (objs: SceneObject[], id: string) => sidesOf(byId(objs)[id] as Extract<SceneObject, { type: 'polygon' }>, byId(objs), orderOf(objs))

  it('finds the sides the tool laid down after the shape, whichever way round each was drawn, and nothing else', () => {
    const objs = [...triangle(), point('pX', 'X', [9, 9, 0]), seg('sAX', 'x', 'pA', 'pX')]
    expect(sidesIn(objs, 'tri')).toEqual(['sAB', 'sBC', 'sCA'])
    // A quadrilateral's diagonal joins two corners that are not consecutive: not a side, and the
    // walk stops there, so a side laid after the diagonal is not reached either.
    const quad = [
      ...triangle().slice(0, 3),
      point('pD', 'D', [4, 3, 0]),
      poly('quad', 'ABCD', ['pA', 'pB', 'pC', 'pD']),
      seg('sAB', 'a', 'pA', 'pB'),
      seg('sBC', 'b', 'pB', 'pC'),
      seg('sAC', 'd', 'pA', 'pC'),
      seg('sCD', 'e', 'pC', 'pD')
    ]
    expect(sidesIn(quad, 'quad')).toEqual(['sAB', 'sBC'])
    // Never more than one segment per side: a fourth matching segment after a triangle's three
    // belongs to whoever drew it next.
    const four = [...triangle(), seg('sAB2', 'd', 'pA', 'pB')]
    expect(sidesIn(four, 'tri')).toEqual(['sAB', 'sBC', 'sCA'])
    // A polygon not in the order (already gone) has no sides to give.
    expect(sidesOf(byId(objs).tri as Extract<SceneObject, { type: 'polygon' }>, byId(objs), [])).toEqual([])
  })

  it('leaves segments the student drew before the shape existed: a recognised loop is only its shading', () => {
    // closeLoopIfAny turns three hand-drawn segments into a polygon with no sides of its own;
    // the segments come earlier in the order. Deleting the shape ("I did not want that shaded
    // thing") must take the shading and nothing the student drew.
    const loop = [...triangle().slice(0, 3), seg('sAB', 'a', 'pA', 'pB'), seg('sBC', 'b', 'pB', 'pC'), seg('sCA', 'c', 'pC', 'pA'), poly('tri', 'ABC', ['pA', 'pB', 'pC'])]
    expect(sidesIn(loop, 'tri')).toEqual([])
    scene().addObjects(loop)
    scene().removeObjects(['tri'])
    expect(scene().order).toEqual(['pA', 'pB', 'pC', 'sAB', 'sBC', 'sCA'])
  })

  it('deleting the triangle removes its sides and keeps the corners, in one undo step', () => {
    scene().addObjects(triangle())
    const before = graph()
    scene().removeObjects(['tri'])
    expect(scene().order).toEqual(['pA', 'pB', 'pC'])
    scene().undo()
    expect(graph()).toEqual(before)
    scene().redo()
    expect(scene().order).toEqual(['pA', 'pB', 'pC'])
  })

  it('does the same for a triangle the real Builder makes', async () => {
    // The rule reads the order the Builder pushes in — polygon first, then one segment per side.
    // If the Builder ever changed that, this is the test that says so.
    const { Builder } = await import('../src/renderer/src/core/factory')
    const b = new Builder()
    const ids = ([[0, 0, 0], [4, 0, 0], [0, 3, 0]] as [number, number, number][]).map((p) => b.point(p).id)
    const tri = b.polygon(ids, { withSides: true })
    b.commit()
    expect(scene().order.length).toBe(7)
    expect(sidesOf(tri, scene().objects, scene().order).length).toBe(3)
    scene().removeObjects([tri.id])
    expect(scene().order).toEqual(ids)
  })

  it('takes what was built on a side too, and leaves a segment that is not a side', () => {
    scene().addObjects([
      ...triangle(),
      { ...base('pM', 'M'), type: 'point', def: { kind: 'midpoint', a: 'pA', b: 'pB' } },
      point('pX', 'X', [9, 9, 0]),
      seg('sAX', 'x', 'pA', 'pX')
    ])
    // The midpoint is built on the points, not the side: it is the student's, so it stays; a
    // point placed *on* the side goes with it.
    scene().addObjects([{ ...base('pOn', 'P'), type: 'point', def: { kind: 'onObject', on: 'sBC', t: 0.5 } }])
    scene().removeObjects(['tri'])
    expect(scene().order).toEqual(['pA', 'pB', 'pC', 'pM', 'pX', 'sAX'])
  })

  it("reaches a second shape doomed through a side, and takes that one's sides too", () => {
    // P sits on side BC of ABC and is a corner of PQR, drawn with the tool. Deleting ABC takes
    // BC, so P, so PQR — and PQR's far side QR must go with it, not stay as a stray segment.
    const objs = [
      ...triangle(),
      { ...base('pP', 'P'), type: 'point', def: { kind: 'onObject', on: 'sBC', t: 0.5 } } as SceneObject,
      point('pQ', 'Q', [8, 8, 0]),
      point('pR', 'R', [8, 1, 0]),
      poly('tri2', 'PQR', ['pP', 'pQ', 'pR']),
      seg('sPQ', 'd', 'pP', 'pQ'),
      seg('sQR', 'e', 'pQ', 'pR'),
      seg('sRP', 'f', 'pR', 'pP')
    ]
    expect([...doomedBy(['tri'], byId(objs), orderOf(objs))].sort()).toEqual(['pP', 'sAB', 'sBC', 'sCA', 'sPQ', 'sQR', 'sRP', 'tri', 'tri2'])
    scene().addObjects(objs)
    scene().removeObjects(['tri'])
    expect(scene().order).toEqual(['pA', 'pB', 'pC', 'pQ', 'pR'])
  })

  it('leaves a neighbouring shape its own side over the same two corners', () => {
    // Two triangles on shared corners B, C: the tool gives each its own BC. Deleting ABC must
    // not open BDC — the decomposition case the owner drew.
    const objs = [
      ...triangle(),
      point('pD', 'D', [4, 3, 0]),
      poly('tri2', 'BDC', ['pB', 'pD', 'pC']),
      seg('sBD', 'd', 'pB', 'pD'),
      seg('sDC', 'e', 'pD', 'pC'),
      seg('sCB', 'f', 'pC', 'pB')
    ]
    scene().addObjects(objs)
    scene().removeObjects(['tri'])
    expect(scene().order).toEqual(['pA', 'pB', 'pC', 'pD', 'tri2', 'sBD', 'sDC', 'sCB'])
    scene().removeObjects(['tri2'])
    expect(scene().order).toEqual(['pA', 'pB', 'pC', 'pD'])
  })

  it('deleting a corner takes the whole shape, every side included, and leaves the other corners', () => {
    // Without a corner there is no triangle, and a triangle goes with its sides; the far side
    // BC would otherwise be left as a stray segment. B and C are the student's points and stay.
    scene().addObjects(triangle())
    scene().removeObjects(['pA'])
    expect(scene().order).toEqual(['pB', 'pC'])
    expect([...doomedBy(['pA'], byId(triangle()), orderOf(triangle()))].sort()).toEqual(['pA', 'sAB', 'sBC', 'sCA', 'tri'])
  })

  it('deleting a side alone leaves the shape, and the shape still knows its other sides', () => {
    scene().addObjects(triangle())
    scene().removeObjects(['sAB'])
    expect(scene().order).toEqual(['pA', 'pB', 'pC', 'tri', 'sBC', 'sCA'])
    scene().removeObjects(['tri'])
    expect(scene().order).toEqual(['pA', 'pB', 'pC'])
  })

  it('a deleted object is no longer hovered or selected', () => {
    scene().addObjects(triangle())
    scene().select(['sAB'])
    scene().setHovered('sAB')
    scene().removeObjects(['tri'])
    expect(scene().selection).toEqual([])
    expect(scene().hovered).toBeNull()
    scene().setHovered('pA')
    scene().removeObjects(['pB'])
    expect(scene().hovered).toBe('pA')
  })

  it('a graph, a point or a segment is gone from the scene the moment it is deleted', () => {
    // Checked in the browser for the same report: a plotted curve deletes cleanly. The three
    // things that make that true are pinned here, because each has been the cause of a stale
    // frame before: the canvas draws on demand and the Invalidator asks for a frame on every
    // scene change; the curve's lines are keyed by object id so React unmounts them; and the
    // line frees its GPU geometry when it goes.
    const graphObj: SceneObject = { ...base('g1', 'f'), type: 'graph', kind: 'explicit', source: 'y = x^2', exprs: ['x^2'] }
    scene().addObjects([graphObj, point('pA', 'A', [1, 1, 0]), point('pB', 'B', [2, 2, 0]), seg('sAB', 'a', 'pA', 'pB')])
    scene().removeObjects(['g1'])
    expect(scene().order).toEqual(['pA', 'pB', 'sAB'])
    scene().removeObjects(['sAB'])
    expect(scene().order).toEqual(['pA', 'pB'])
    const viewport = readSource('src/renderer/src/render/Viewport.tsx')
    expect(viewport).toMatch(/frameloop="demand"/)
    expect(viewport.match(/function Invalidator\(\)[\s\S]*?\n\}/)?.[0]).toMatch(/useScene\.subscribe\(kick\)/)
    expect(readSource('src/renderer/src/render/SceneObjects.tsx')).toMatch(/<GraphView key=\{id\}/)
    const fatLine = readSource('src/renderer/src/render/FatLine.tsx')
    expect(fatLine).toMatch(/obj\.geometry\.dispose\(\)/)
    expect(fatLine).toMatch(/\(obj\.material as THREE\.Material\)\.dispose\(\)/)
  })
})
