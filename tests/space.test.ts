// Every object remembers the drawing it was made in (core/visibility.ts). Vectors, Geometry,
// Graphing and Lab Data share one scene store, and before the tag a triangle drawn in Geometry
// turned up behind the vectors. These tests pin the rule from both ends: the pure filter, and the
// store stamping objects as the command bar creates them.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The command bar reaches the SymPy worker and the stylesheet; neither exists here.
vi.mock('../src/renderer/src/math/cas', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null, error: 'no algebra engine in tests' })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {} },
  CAS_OPS: []
}))
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { modeOfSpace, spaceOf, SPACE_LABELS, visibleIn, visibleOrder, type Space } from '../src/renderer/src/core/visibility'
import { MODES, useApp, type ModeId } from '../src/renderer/src/app/modes'
import type { ObjId, SceneObject } from '../src/renderer/src/core/types'
import { scene } from '../src/renderer/src/core/store'
import { runCommand } from '../src/renderer/src/lang/commands'

const SPACES: Space[] = ['vectors', 'shapes', 'graphing', 'lab']
// One list each, used by both tests below: written twice, a new mode added to only one of them
// would have failed the completeness guard or silently missed the null check.
const WITH_DRAWING: ModeId[] = ['vectors', 'calculator', 'problems', 'shapes', 'graphing', 'lab', 'author']
const NO_DRAWING: ModeId[] = ['gpu', 'sandbox', 'proofs', 'mechanics', 'instruments', 'electricity', 'optics', 'waves', 'heat', 'nuclear']

const obj = (name: string, space?: Space): SceneObject =>
  ({ id: name, name, type: 'point', def: [0, 0, 0], color: '#fff', visible: true, locked: false, showLabel: true, space }) as unknown as SceneObject

describe('which drawing a mode looks at', () => {
  it('sends the calculator, the vectors and the practice problems to one drawing', () => {
    expect(spaceOf('vectors')).toBe('vectors')
    expect(spaceOf('calculator')).toBe('vectors')
    expect(spaceOf('problems')).toBe('vectors')
    expect(spaceOf('shapes')).toBe('shapes')
    expect(spaceOf('graphing')).toBe('graphing')
    // Question Author's "Show it" draws in Graphing, and the teacher sees it beside the question.
    expect(spaceOf('author')).toBe('graphing')
    expect(spaceOf('lab')).toBe('lab')
  })

  it('gives a mode without a drawing of its own the whole scene', () => {
    for (const m of NO_DRAWING) expect(spaceOf(m), m).toBeNull()
  })

  it('has placed every mode there is in one list or the other', () => {
    // spaceOf answers null for anything it was not told about, so a new mode would pass the
    // test above by default; it has to be placed here on purpose.
    expect(MODES.map((m) => m.id).sort()).toEqual([...WITH_DRAWING, ...NO_DRAWING].sort())
  })

  it('can send every space back to a mode that shows it, with a label in words', () => {
    for (const sp of SPACES) {
      expect(spaceOf(modeOfSpace[sp]), sp).toBe(sp)
      expect(SPACE_LABELS[sp]).toMatch(/^[A-Z][A-Za-z ]+$/)
    }
  })
})

describe('the visibility filter', () => {
  it('shows a tagged object in its own space and hides it in every other', () => {
    for (const own of SPACES) {
      const o = obj('A', own)
      for (const shown of SPACES) expect(visibleIn(o, shown), `${own} object in ${shown}`).toBe(shown === own)
    }
  })

  it('shows an untagged object from an older file everywhere, as it always was', () => {
    const legacy = obj('A')
    for (const shown of SPACES) expect(visibleIn(legacy, shown), shown).toBe(true)
    expect(visibleIn(legacy, null)).toBe(true)
  })

  it('hides every tagged object from a mode with no drawing of its own', () => {
    // The Sandbox and the GPU Lab have a null space, and null once meant "show all": the points
    // drawn in Geometry were rendered, labelled and pickable over the Sandbox's falling ball.
    for (const own of SPACES) expect(visibleIn(obj('A', own), null), own).toBe(false)
  })

  it('never shows an object that does not exist', () => {
    expect(visibleIn(undefined, 'vectors')).toBe(false)
    expect(visibleIn(undefined, null)).toBe(false)
  })

  it('keeps scene order and drops only the objects of other spaces', () => {
    const objects: Record<ObjId, SceneObject> = {
      v1: obj('v1', 'vectors'),
      t1: obj('t1', 'shapes'),
      old: obj('old'),
      v2: obj('v2', 'vectors'),
      g1: obj('g1', 'graphing')
    }
    const order: ObjId[] = ['v1', 't1', 'old', 'v2', 'g1']
    expect(visibleOrder(order, objects, 'vectors')).toEqual(['v1', 'old', 'v2'])
    expect(visibleOrder(order, objects, 'shapes')).toEqual(['t1', 'old'])
    expect(visibleOrder(order, objects, 'lab')).toEqual(['old'])
    // No drawing active: only the objects that belong to no drawing.
    expect(visibleOrder(order, objects, null)).toEqual(['old'])
  })
})

describe('objects made through the command bar carry the drawing they were made in', () => {
  beforeEach(() => {
    scene().newScene()
    scene().clearLog()
    scene().setActiveSpace('vectors')
  })

  const named = (name: string): SceneObject => {
    const id = scene().ev.names.get(name)
    expect(id, `${name} exists`).toBeDefined()
    return scene().objects[id!]
  }
  const visibleNames = (space: Space | null): string[] => visibleOrder(scene().order, scene().objects, space).map((id) => scene().objects[id].name)

  it('stamps a vector with the vectors drawing and a triangle with the geometry one', async () => {
    await runCommand('A = <3, 4>')
    scene().setActiveSpace('shapes')
    await runCommand('Triangle((0,0), (4,0), (0,3))')
    expect(named('A').space).toBe('vectors')
    expect(named('poly1').space).toBe('shapes')
    expect(visibleNames('vectors')).toEqual(['A'])
    expect(visibleNames('shapes')).not.toContain('A')
    expect(visibleNames('shapes')).toContain('poly1')
  })

  it('puts a graph in Graphing wherever it was asked for, and takes the student there to see it', async () => {
    scene().setActiveSpace('vectors')
    useApp.getState().setMode('vectors')
    await runCommand('y = sin(x)')
    const graph = Object.values(scene().objects).find((o) => o.type === 'graph')
    expect(graph?.space).toBe('graphing')
    expect(visibleNames('vectors')).toEqual([])
    expect(visibleNames('graphing')).toEqual([graph!.name])
    // Typed in Vectors, the curve used to land in a drawing the student was not looking at: the
    // bar cleared, the Console logged "Graph created", and the viewport showed nothing.
    expect(useApp.getState().mode).toBe('graphing')
    expect(scene().activeSpace).toBe('graphing')
    expect(scene().log.at(-1)?.text).toContain('Switched to Graphing')
    // Already in Graphing: no switch, and no sentence saying there was one.
    await runCommand('x^2 + y^2 = 9')
    expect(scene().log.at(-1)?.text).toBe('Implicit curve created.')
  })

  it('stays put when the curve is refused, so an unknown name does not move the student', async () => {
    scene().setActiveSpace('vectors')
    useApp.getState().setMode('vectors')
    await runCommand('y = k x^2')
    expect(scene().log.at(-1)?.kind).toBe('error')
    expect(useApp.getState().mode).toBe('vectors')
    expect(scene().activeSpace).toBe('vectors')
  })

  it('keeps a legacy object without a space visible from every mode, and still lets it be used', async () => {
    await runCommand('A = <3, 4>')
    const id = scene().ev.names.get('A')!
    // A file saved before 0.3.6 has no space on its objects.
    scene().addObjects([{ ...scene().objects[id], space: undefined } as SceneObject], { select: false })
    expect(named('A').space).toBeUndefined()
    for (const sp of SPACES) expect(visibleNames(sp), sp).toContain('A')
    // Evaluation never filters on space: R = A + B works from the geometry drawing.
    scene().setActiveSpace('shapes')
    await runCommand('B = <1, 1>')
    await runCommand('R = A + B')
    expect(scene().log.filter((l) => l.kind === 'error')).toEqual([])
    expect(named('R').space).toBe('shapes')
  })

  it('finds a name from another drawing, because naming and evaluation never filter', async () => {
    await runCommand('P = (1, 2)')
    scene().setActiveSpace('shapes')
    await runCommand('Q = (4, 6)')
    await runCommand('Segment(P, Q)')
    expect(scene().log.filter((l) => l.kind === 'error')).toEqual([])
    expect(scene().log.at(-1)?.tex).toContain('length } 5')
  })
})
