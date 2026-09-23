// Saving and opening: the round trip through a .phys file, the steps that bring an older file up
// to date, and the promise that a bad file is refused before anything in the app is touched.

import { beforeEach, describe, expect, it } from 'vitest'
import { FILE_VERSION, migrate, migrateLabelSettings, parseSceneFile, spacesForV1 } from '../src/renderer/src/core/migrate'
import { blankSceneFile, DEFAULT_SETTINGS, useScene } from '../src/renderer/src/core/store'
import type { SceneFile, SceneObject } from '../src/renderer/src/core/types'
import { describeWork, hasWork } from '../src/renderer/src/app/autosave'
import { openFailureText, saveFailureText } from '../src/renderer/src/core/fileErrors'
import { readSource } from './helpers/repo'
import { emptyTable, setCell, useLab } from '../src/renderer/src/lab/labStore'
import { startingScene, useSandbox } from '../src/renderer/src/sim/store'
import { DEFAULT_WORLD, type WorldSettings } from '../src/renderer/src/sim/types'

const scene = () => useScene.getState()

const point = (id: string, name: string, p: [number, number, number], extra: Partial<SceneObject> = {}): SceneObject => ({
  id,
  name,
  type: 'point',
  def: { kind: 'free', p },
  visible: true,
  locked: false,
  color: '#000',
  showLabel: true,
  ...extra
} as SceneObject)

const objectsOfAScene = (): SceneObject[] => [
  point('pA', 'A', [1, 2, 0], { space: 'shapes' }),
  point('pB', 'B', [4, 6, 0], { space: 'shapes' }),
  { id: 'sAB', name: 'a', type: 'segment', a: 'pA', b: 'pB', visible: true, locked: false, color: '#000', showLabel: true, space: 'shapes' },
  { id: 'nK', name: 'k', type: 'number', expr: '2*a', visible: true, locked: false, color: '#000', showLabel: true, space: 'shapes' },
  { id: 'vF', name: 'F', type: 'vector', def: { kind: 'expr', expr: 'k*i + 3*j' }, visible: true, locked: false, color: '#000', showLabel: true, space: 'vectors' }
]

/** A whole project with something in every block. */
function fullFile(): SceneFile {
  const readings = setCell(setCell(emptyTable('Bounce'), 0, 0, 0.5), 0, 1, 1.2)
  const bodies = startingScene()
  const [floor, ball] = bodies
  return {
    app: 'PhysLab',
    version: FILE_VERSION,
    objects: objectsOfAScene(),
    settings: { ...DEFAULT_SETTINGS, unit: 'cm', unitPerSquare: 5, decimals: 3 },
    lab: [readings],
    sandbox: {
      bodies,
      links: [{ id: 'l1', kind: 'string', a: floor.id, b: ball.id, length: 2, stiffness: 0, damping: 0 }],
      world: { ...DEFAULT_WORLD, gravity: 1.62 },
      sideView: false
    }
  }
}

/** The same drawing as a build before 0.3.6 would have written it: format 1, no spaces, 'off' labels. */
function v1File(): unknown {
  return {
    app: 'PhysLab',
    version: 1,
    objects: objectsOfAScene().map((o) => {
      const { space: _space, ...rest } = o
      return rest
    }),
    settings: { angleUnit: 'rad', showGrid: false, snap: true, measureLabels: 'off' }
  }
}

beforeEach(() => {
  scene().newScene()
})

describe('serialize → loadScene', () => {
  it('brings back the objects, their order, the lab readings and the sandbox', () => {
    const file = fullFile()
    scene().loadScene(file, 'C:/work/bounce.phys')
    const again = scene().serialize()
    expect(again.version).toBe(FILE_VERSION)
    expect(again.objects).toEqual(file.objects)
    expect(again.objects.map((o) => o.id)).toEqual(['pA', 'pB', 'sAB', 'nK', 'vF'])
    expect(again.lab).toEqual(file.lab)
    expect(again.sandbox).toEqual(file.sandbox)
    expect(again.settings.unit).toBe('cm')
    expect(again.settings.unitPerSquare).toBe(5)
    expect(again.settings.decimals).toBe(3)
    expect(scene().filePath).toBe('C:/work/bounce.phys')
    expect(scene().dirty).toBe(false)
  })

  it('survives being written out as text and read back, and the dependents still evaluate', () => {
    scene().loadScene(fullFile())
    const text = JSON.stringify(scene().serialize(), null, 1)
    scene().newScene()
    expect(scene().order).toEqual([])
    scene().loadScene(parseSceneFile(text))
    const { ev } = scene()
    expect(ev.errors.size).toBe(0)
    expect(ev.scope.a).toBe(5)
    expect(ev.scope.k).toBe(10)
    expect(ev.scope.F).toEqual([10, 3, 0])
    expect(useLab.getState().tables[0].rows[0]).toEqual([0.5, 1.2])
    expect(useSandbox.getState().links).toHaveLength(1)
    expect(useSandbox.getState().world.gravity).toBe(1.62)
  })

  it('carries the grid style with the drawing, and an older file without one draws lines', () => {
    const file = fullFile()
    file.settings = { ...file.settings, gridStyle: 'dots' }
    scene().loadScene(file)
    expect(scene().settings.gridStyle).toBe('dots')
    expect(scene().serialize().settings.gridStyle).toBe('dots')
    // A format-2 file saved before grid styles existed: one setting short, and a step behind.
    const { gridStyle: _g, ...older } = fullFile().settings
    scene().loadScene({ ...fullFile(), version: 2, settings: older })
    expect(scene().settings.gridStyle).toBe('lines')
    expect(FILE_VERSION).toBe(3)
  })

  it('keeps the label preferences of whoever is opening the file', () => {
    scene().setSettings({ labelShow: 'always', vectorNotation: 'bold' })
    const file = fullFile()
    file.settings = { ...file.settings, labelShow: 'never', vectorNotation: 'underline' }
    scene().loadScene(file)
    expect(scene().settings.labelShow).toBe('always')
    expect(scene().settings.vectorNotation).toBe('bold')
    scene().setSettings({ labelShow: 'hover', vectorNotation: 'arrow' })
  })
})

describe('migrate', () => {
  it('leaves a current file alone apart from making a copy', () => {
    const file = fullFile()
    const out = migrate(file)
    expect(out).toEqual(file)
    expect(out).not.toBe(file)
  })

  it('steps a format-1 file up: version, labels and a drawing for each object', () => {
    const raw = v1File()
    const out = migrate(raw)
    expect(out.version).toBe(FILE_VERSION)
    // The input is not changed under the caller's feet.
    expect((raw as { version: number }).version).toBe(1)
    expect(out.settings.measureLabels).toBe('measure')
    expect(out.settings.labelShow).toBe('never')
    expect(out.settings.angleUnit).toBe('rad')
    const space = Object.fromEntries(out.objects.map((o) => [o.name, o.space]))
    // k = 2a is only used by the vector F, so it goes where F is looked at.
    expect(space).toEqual({ A: 'shapes', B: 'shapes', a: 'shapes', k: 'vectors', F: 'vectors' })
  })

  it('steps a format-2 file without lego up to format 3 and changes nothing else', () => {
    const v2 = { ...fullFile(), version: 2 as const }
    const out = migrate(v2)
    expect(out.version).toBe(3)
    expect({ ...out, version: 2 }).toEqual(v2)
    expect((v2 as { version: number }).version).toBe(2)
    scene().loadScene(v2)
    expect(scene().ev.errors.size).toBe(0)
    expect(scene().serialize().version).toBe(3)
  })

  it("keeps a piece's lego record through save and open, and drops a damaged one without a word", () => {
    const lego = { sourceId: 'poly0', sourceSignature: '3,90;4,90;3,90;4,90', pieceIndex: 1, originalColor: '#000' }
    const corners = [point('q1', 'P', [0, 0, 0], { space: 'shapes', visible: false, auxiliary: true }), point('q2', 'Q', [4, 0, 0], { space: 'shapes', visible: false, auxiliary: true }), point('q3', 'R', [4, 3, 0], { space: 'shapes', visible: false, auxiliary: true })]
    const piece: SceneObject = { id: 'pc1', name: 'poly2', type: 'polygon', points: ['q1', 'q2', 'q3'], fill: true, visible: true, locked: false, color: '#000', showLabel: true, space: 'shapes', lego }
    const file: SceneFile = { ...fullFile(), objects: [...corners, piece] }
    scene().loadScene(parseSceneFile(JSON.stringify(file)))
    const saved = scene().serialize()
    expect(saved.version).toBe(3)
    const back = saved.objects.find((o) => o.id === 'pc1')
    expect(back?.type === 'polygon' && back.lego).toEqual(lego)
    expect(parseSceneFile(JSON.stringify(saved)).objects.find((o) => o.id === 'pc1')).toEqual(piece)
    // A record missing its colour, or not a record at all, is dropped and the polygon opens as an ordinary one.
    for (const bad of [{ sourceId: 'poly0', pieceIndex: 1 }, 'poly0', null, 7]) {
      const out = migrate({ ...file, version: 2, objects: [...corners, { ...piece, lego: bad }] })
      const o = out.objects.find((x) => x.id === 'pc1')
      expect(o?.type === 'polygon' && 'lego' in o, JSON.stringify(bad)).toBe(false)
    }
    // A record from a build that wrote no signature still counts as a piece; only "original" is lost.
    const { sourceSignature: _s, ...unsigned } = lego
    const out = migrate({ ...file, version: 2, objects: [...corners, { ...piece, lego: unsigned }] })
    const o = out.objects.find((x) => x.id === 'pc1')
    expect(o?.type === 'polygon' && o.lego).toEqual({ ...unsigned, sourceSignature: '' })
  })

  it('checks the lego record of a file already in format 3, so letting go of a dragged shape cannot throw', () => {
    // Only the step up from format 2 used to look at the record: a format-3 file carrying
    // lego: { junk: 1 } opened as a piece, and releasing a drag reached cleanPolygon(undefined).
    const corners = [point('q1', 'P', [0, 0, 0], { space: 'shapes' }), point('q2', 'Q', [4, 0, 0], { space: 'shapes' }), point('q3', 'R', [4, 3, 0], { space: 'shapes' })]
    const poly = { id: 'pc1', name: 'poly2', type: 'polygon', points: ['q1', 'q2', 'q3'], fill: true, visible: true, locked: false, color: '#000', showLabel: true, space: 'shapes', lego: { junk: 1 } }
    const opened = parseSceneFile(JSON.stringify({ ...fullFile(), version: 3, objects: [...corners, poly] }))
    const o = opened.objects.find((x) => x.id === 'pc1')
    expect(o?.type === 'polygon' && 'lego' in o).toBe(false)
    const unsigned = parseSceneFile(JSON.stringify({ ...fullFile(), version: 3, objects: [...corners, { ...poly, lego: { sourceId: 'p', pieceIndex: 0, originalColor: '#000' } }] }))
    expect(unsigned.objects.find((x) => x.id === 'pc1')).toMatchObject({ lego: { sourceSignature: '' } })
    scene().loadScene(opened)
    expect(() => {
      scene().beginGesture()
      for (const id of ['q1', 'q2', 'q3']) {
        scene().updateObject(id, (d) => {
          if (d.type === 'point' && d.def.kind === 'free') d.def.p = [d.def.p[0] + 1, d.def.p[1], 0]
        }, false)
      }
      scene().endGesture()
    }).not.toThrow()
  })

  it('a format-1 file opens in the store with every dependent working', () => {
    scene().loadScene(v1File())
    expect(scene().ev.errors.size).toBe(0)
    expect(scene().ev.scope.k).toBe(10)
    expect(scene().settings.showGrid).toBe(false)
    // Whatever the file did not say comes from the defaults, not from undefined.
    expect(scene().settings.unit).toBe(DEFAULT_SETTINGS.unit)
    expect(scene().settings.precisionMode).toBe(DEFAULT_SETTINGS.precisionMode)
  })

  it('a format-1 file with no settings, lab or sandbox still opens', () => {
    const out = migrate({ app: 'PhysLab', version: 1, objects: [] })
    expect(out.version).toBe(FILE_VERSION)
    expect(out.objects).toEqual([])
    scene().loadScene(out)
    expect(useLab.getState().tables).toHaveLength(1)
    expect(useSandbox.getState().bodies.length).toBeGreaterThan(0)
  })

  it('labels: "off" becomes measure + never, and a chosen labelShow wins', () => {
    expect(migrateLabelSettings({ measureLabels: 'off' as never })).toEqual({ measureLabels: 'measure', labelShow: 'never' })
    expect(migrateLabelSettings({ measureLabels: 'off' as never, labelShow: 'hover' })).toEqual({ measureLabels: 'measure', labelShow: 'hover' })
    const fine = { measureLabels: 'full' as const }
    expect(migrateLabelSettings(fine)).toBe(fine)
  })

  it('spaces: graphs, vectors and shapes tell by type; points follow what uses them; loners show everywhere', () => {
    const objects: SceneObject[] = [
      point('p1', 'P', [0, 0, 0]),
      point('p2', 'Q', [1, 0, 0]),
      point('p3', 'R', [0, 1, 0]),
      { id: 'v1', name: 'v', type: 'vector', def: { kind: 'points', a: 'p1', b: 'p2' }, visible: true, locked: false, color: '#000', showLabel: true },
      point('p4', 'S', [2, 2, 0]),
      { id: 's1', name: 's', type: 'segment', a: 'p3', b: 'p4', visible: true, locked: false, color: '#000', showLabel: true },
      { id: 'n1', name: 'm', type: 'number', expr: '3', visible: true, locked: false, color: '#000', showLabel: true },
      { id: 'g1', name: 'f', type: 'graph', kind: 'explicit', source: 'y = m*x', exprs: ['m*x'], visible: true, locked: false, color: '#000', showLabel: true },
      point('p5', 'T', [5, 5, 0]),
      { id: 't1', name: 'text1', type: 'text', p: [0, 0, 0], text: 'hello', visible: true, locked: false, color: '#000', showLabel: true }
    ]
    const spaces = spacesForV1(objects)
    expect(spaces.get('v1')).toBe('vectors')
    expect(spaces.get('p1')).toBe('vectors')
    expect(spaces.get('p2')).toBe('vectors')
    expect(spaces.get('s1')).toBe('shapes')
    expect(spaces.get('p3')).toBe('shapes')
    expect(spaces.get('p4')).toBe('shapes')
    expect(spaces.get('g1')).toBe('graphing')
    expect(spaces.get('n1')).toBe('graphing')
    expect(spaces.has('p5')).toBe(false)
    expect(spaces.has('t1')).toBe(false)
  })

  it('spaces: a point two steps below a shape still gets the shape\'s drawing', () => {
    const objects: SceneObject[] = [
      point('p1', 'A', [0, 0, 0]),
      point('p2', 'B', [1, 0, 0]),
      { id: 'm1', name: 'M', type: 'point', def: { kind: 'midpoint', a: 'p1', b: 'p2' }, visible: true, locked: false, color: '#000', showLabel: true },
      { id: 'c1', name: 'c1', type: 'circle', def: { kind: 'centerRadius', c: 'm1', r: '2' }, visible: true, locked: false, color: '#000', showLabel: true }
    ]
    const spaces = spacesForV1(objects)
    expect(spaces.get('p1')).toBe('shapes')
    expect(spaces.get('p2')).toBe('shapes')
    expect(spaces.get('m1')).toBe('shapes')
  })

  it('a 0.3.10 save (format 1, spaces, lab and sandbox) comes through unchanged apart from the version', () => {
    // Every build through 0.3.10 wrote version 1; the space tags, the lab block and the sandbox
    // block were all added without a bump. This is the most common file in the wild.
    const { version: _v, ...rest } = fullFile()
    const raw = { ...rest, version: 1 }
    const out = migrate(raw)
    expect(out).toEqual({ ...rest, version: FILE_VERSION })
    expect((raw as { version: number }).version).toBe(1)
  })

  it('a format-1 file with any stamped object leaves its spaceless objects alone: they were made that way', () => {
    // In 0.3.6–0.3.10 a vector typed in the Sandbox (no drawing active) got no space and showed
    // everywhere. Stamping it 'vectors' now would take it out of the views it was seen in.
    const raw = {
      app: 'PhysLab',
      version: 1,
      objects: [
        point('p1', 'A', [0, 0, 0], { space: 'lab' }),
        { id: 'v1', name: 'v', type: 'vector', def: { kind: 'free', comp: [1, 0, 0], tail: [0, 0, 0] }, visible: true, locked: false, color: '#000', showLabel: true },
        { id: 'v2', name: 'w', type: 'vector', def: { kind: 'free', comp: [0, 1, 0], tail: [0, 0, 0] }, visible: true, locked: false, color: '#000', showLabel: true, space: 'vectors' }
      ]
    }
    const space = Object.fromEntries(migrate(raw).objects.map((o) => [o.name, o.space]))
    expect(space).toEqual({ A: 'lab', v: undefined, w: 'vectors' })
    expect('space' in migrate(raw).objects[1]).toBe(false)
  })

  it('a format-1 file with no stamped object at all is stamped by type: it predates spaces', () => {
    const raw = {
      app: 'PhysLab',
      version: 1,
      objects: [{ id: 'v1', name: 'v', type: 'vector', def: { kind: 'free', comp: [1, 0, 0], tail: [0, 0, 0] }, visible: true, locked: false, color: '#000', showLabel: true }]
    }
    expect(migrate(raw).objects[0].space).toBe('vectors')
  })
})

describe('a bad file', () => {
  const cases: [string, unknown, RegExp][] = [
    ['plain text', 'hello', /not a PhysLab project/],
    ['null', null, /not a PhysLab project/],
    ['a list', [1, 2], /not a PhysLab project/],
    ['another app', { app: 'NotPhysLab', version: 1, objects: [] }, /not saved by PhysLab/],
    ['no version', { app: 'PhysLab', objects: [] }, /which PhysLab format/],
    ['a version that is not a number', { app: 'PhysLab', version: 'two', objects: [] }, /which PhysLab format/],
    ['a version from the future', { app: 'PhysLab', version: FILE_VERSION + 1, objects: [] }, /newer PhysLab/],
    ['no objects', { app: 'PhysLab', version: 1 }, /no objects/],
    ['objects that are not a list', { app: 'PhysLab', version: 2, objects: {} }, /no objects/],
    ['a damaged object', { app: 'PhysLab', version: 2, objects: [{ id: 'x' }] }, /Object 1 .* damaged/],
    ['a damaged object in a format-1 file', { app: 'PhysLab', version: 1, objects: [null] }, /Object 1 .* damaged/],
    ['the same object twice', { app: 'PhysLab', version: 2, objects: [point('p', 'A', [0, 0, 0]), point('p', 'B', [0, 0, 0])] }, /twice/],
    ['damaged settings', { app: 'PhysLab', version: 2, objects: [], settings: 'dark' }, /settings .* damaged/],
    ['damaged lab tables', { app: 'PhysLab', version: 2, objects: [], lab: { rows: [] } }, /lab tables .* damaged/],
    ['a lab table that is null', { app: 'PhysLab', version: 2, objects: [], lab: [null] }, /Lab table 1 .* damaged/],
    ['a lab table with no columns', { app: 'PhysLab', version: 2, objects: [], lab: [{ id: 't', title: 'x', rows: [] }] }, /Lab table 1 .* damaged/],
    ['a lab table whose rows are not lists', { app: 'PhysLab', version: 1, objects: [], lab: [{ ...emptyTable('x'), rows: [1, 2] }] }, /Lab table 1 .* damaged/],
    ['a lab table with a nameless column', { app: 'PhysLab', version: 2, objects: [], lab: [{ ...emptyTable('x'), columns: [{ id: 'c' }] }] }, /Lab table 1 .* damaged/],
    ['a second lab table without a plot', { app: 'PhysLab', version: 2, objects: [], lab: [emptyTable('ok'), { ...emptyTable('x'), plot: undefined }] }, /Lab table 2 .* damaged/],
    ['a damaged sandbox', { app: 'PhysLab', version: 2, objects: [], sandbox: { links: [] } }, /sandbox .* damaged/],
    ['a body with no shape or position', { app: 'PhysLab', version: 2, objects: [], sandbox: { bodies: [{ id: 'b' }] } }, /Body 1 .* damaged/],
    ['a second body with a two-number position', { app: 'PhysLab', version: 1, objects: [], sandbox: { bodies: [startingScene()[0], { ...startingScene()[1], position: [0, 1] }] } }, /Body 2 .* damaged/],
    ['connections that are not a list', { app: 'PhysLab', version: 2, objects: [], sandbox: { bodies: [], links: 'oops' } }, /connections .* damaged/],
    ['a connection with no ends', { app: 'PhysLab', version: 2, objects: [], sandbox: { bodies: [], links: [{ id: 'l', kind: 'rod' }] } }, /Connection 1 .* damaged/],
    ['world settings that are a number', { app: 'PhysLab', version: 2, objects: [], sandbox: { bodies: [], world: 5 } }, /world settings .* damaged/],
    ['a side view that is a word', { app: 'PhysLab', version: 2, objects: [], sandbox: { bodies: [], sideView: 'yes' } }, /view setting .* damaged/]
  ]

  it.each(cases)('%s is refused with a readable reason', (_what, raw, reason) => {
    expect(() => migrate(raw)).toThrow(reason)
  })

  it('truncated JSON is refused with a readable reason', () => {
    const text = JSON.stringify(fullFile())
    expect(() => parseSceneFile(text.slice(0, text.length / 2))).toThrow(/cannot be read/)
    expect(() => parseSceneFile('')).toThrow(/cannot be read/)
  })

  it('leaves every store exactly as it was', () => {
    scene().loadScene(fullFile(), 'C:/work/bounce.phys')
    scene().addObjects([point('pX', 'X', [9, 9, 0])])
    useLab.getState().update(useLab.getState().tables[0].id, (t) => setCell(t, 1, 0, 7))
    useSandbox.getState().addBody('sphere')
    const before = { scene: useScene.getState(), lab: useLab.getState(), sandbox: useSandbox.getState() }

    for (const [, raw] of cases) expect(() => scene().loadScene(raw)).toThrow()
    expect(() => scene().loadScene(parseSceneFile('{"app": "PhysLab", "vers'))).toThrow()

    const after = { scene: useScene.getState(), lab: useLab.getState(), sandbox: useSandbox.getState() }
    expect(after.scene.objects).toBe(before.scene.objects)
    expect(after.scene.order).toBe(before.scene.order)
    expect(after.scene.past).toBe(before.scene.past)
    expect(after.scene.settings).toBe(before.scene.settings)
    expect(after.scene.filePath).toBe('C:/work/bounce.phys')
    expect(after.lab.tables).toBe(before.lab.tables)
    expect(after.lab.past).toBe(before.lab.past)
    expect(after.sandbox.bodies).toBe(before.sandbox.bodies)
    expect(after.sandbox.links).toBe(before.sandbox.links)
    expect(after.sandbox.runNonce).toBe(before.sandbox.runNonce)
  })
})

describe('hasWork (what the autosave offers back)', () => {
  it('a fresh File ▸ New has nothing worth recovering, whatever ids it was given', () => {
    scene().newScene()
    expect(hasWork(scene().serialize())).toBe(false)
    // Every call to blankSceneFile makes new ids; that must not look like work.
    expect(hasWork(blankSceneFile(), blankSceneFile())).toBe(false)
  })

  it('an object, a reading, a body, a connection or a world setting is work', () => {
    const blank = blankSceneFile()
    expect(hasWork({ ...blank, objects: [point('p', 'A', [0, 0, 0])] })).toBe(true)
    expect(hasWork({ ...blank, lab: [setCell(emptyTable('Experiment'), 0, 0, 1)] })).toBe(true)
    expect(hasWork({ ...blank, lab: [emptyTable('Experiment'), emptyTable('Experiment 2')] })).toBe(true)
    const sandbox = blank.sandbox!
    expect(hasWork({ ...blank, sandbox: { ...sandbox, bodies: [...sandbox.bodies, ...startingScene().slice(1, 2)] } })).toBe(true)
    expect(hasWork({ ...blank, sandbox: { ...sandbox, world: { ...sandbox.world, gravity: 0 } } })).toBe(true)
    expect(hasWork({ ...blank, sandbox: { ...sandbox, sideView: false } })).toBe(true)
  })

  it('a block this build does not know about still counts as work', () => {
    const blank = blankSceneFile()
    expect(hasWork({ ...blank, circuits: [{ id: 'c1', parts: 3 }] } as SceneFile)).toBe(true)
  })

  it('settings are not work', () => {
    const blank = blankSceneFile()
    expect(hasWork({ ...blank, settings: { ...blank.settings, unit: 'km' } })).toBe(false)
  })

  it('a file from before the lab and sandbox blocks, with nothing in it, is not work', () => {
    // loadScene turns a missing block into the blank one; the comparison has to do the same, or a
    // crash on a first run offered back "unsaved work (0 objects)".
    expect(hasWork(migrate({ app: 'PhysLab', version: 1, objects: [], settings: {} }))).toBe(false)
    expect(hasWork(migrate({ app: 'PhysLab', version: 1, objects: [], lab: [] }))).toBe(false)
  })

  it('a world setting the file predates is filled from the defaults, not counted as work', () => {
    const blank = blankSceneFile()
    const { timeScale: _t, ...olderWorld } = blank.sandbox!.world
    expect(hasWork({ ...blank, sandbox: { ...blank.sandbox!, world: olderWorld as WorldSettings } })).toBe(false)
    // But a value that differs from the default still is.
    expect(hasWork({ ...blank, sandbox: { ...blank.sandbox!, world: { ...olderWorld, gravity: 1.62 } as WorldSettings } })).toBe(true)
  })

  it('the round trip through the store and text still reads as no work', () => {
    scene().newScene()
    const text = JSON.stringify(scene().serialize())
    expect(hasWork(parseSceneFile(text))).toBe(false)
  })
})

describe('describeWork (what the recovery strip names)', () => {
  it('names only what differs from a new file: readings alone are readings, not "0 objects" and a sandbox', () => {
    const blank = blankSceneFile()
    expect(describeWork(blank)).toBe('')
    expect(describeWork({ ...blank, lab: [setCell(emptyTable('Experiment'), 0, 0, 1)] })).toBe('1 table of readings')
    expect(describeWork({ ...blank, lab: [setCell(emptyTable('A'), 0, 0, 1), setCell(emptyTable('B'), 1, 1, 2), emptyTable('C')] })).toBe('2 tables of readings')
    expect(describeWork({ ...blank, objects: [point('p', 'A', [0, 0, 0])] })).toBe('1 object')
  })

  it('counts the sandbox only once it differs from the starting scene', () => {
    const blank = blankSceneFile()
    const sandbox = blank.sandbox!
    expect(describeWork({ ...blank, sandbox: { ...sandbox, bodies: [...sandbox.bodies, ...startingScene().slice(1, 2)] } })).toBe('a sandbox with 4 things')
    const [floor, ball] = sandbox.bodies
    const link = { id: 'l1', kind: 'string' as const, a: floor.id, b: ball.id, length: 2, stiffness: 0, damping: 0 }
    expect(describeWork({ ...blank, sandbox: { ...sandbox, links: [link] } })).toBe('a sandbox with 3 things and 1 connection')
    expect(describeWork({ ...blank, sandbox: { ...sandbox, world: { ...sandbox.world, gravity: 0 } } })).toBe('changed sandbox settings')
    // Everything at once, in the order a student would look for it.
    expect(describeWork({ ...fullFile(), sandbox: { ...sandbox, sideView: false } })).toBe('5 objects, 1 table of readings, changed sandbox settings')
  })
})

describe('what the console says when a file cannot be opened or saved', () => {
  it('names the file and the reason, never the parser', () => {
    // File ▸ Open used to do its own JSON.parse and report "Could not open: SyntaxError:
    // Unexpected end of JSON input" for a half-copied .phys.
    const halfCopied = (() => {
      try {
        parseSceneFile('{"app": "PhysLab", "vers')
      } catch (e) {
        return e
      }
    })()
    expect(openFailureText(String.raw`C:\work\bounce.phys`, halfCopied)).toBe('Could not open bounce.phys: This file cannot be read: it is not complete, or it is not a PhysLab project.')
    expect(openFailureText('/home/s/notes.phys', new Error('This file was not saved by PhysLab.'))).toBe('Could not open notes.phys: This file was not saved by PhysLab.')
    // The app goes through parseSceneFile, which is where those sentences live.
    const files = readSource('src/renderer/src/app/files.ts')
    expect(files).toContain('parseSceneFile(content)')
    expect(files).not.toContain('JSON.parse')
  })

  it('a failed save is reported, with the sentence from the main process and not the IPC wrapper', () => {
    // Electron wraps a rejection as "Error invoking remote method 'file:save': Error: …".
    const e = new Error("Error invoking remote method 'file:save': Error: PhysLab is not allowed to write in that folder.")
    expect(saveFailureText(e)).toBe('Could not save: PhysLab is not allowed to write in that folder. Your work is still here — try Save As to another folder.')
    expect(saveFailureText('disk full')).toBe('Could not save: disk full Your work is still here — try Save As to another folder.')
    // saveProject has to catch the rejection: it used to be unhandled, and the title kept its
    // unsaved mark while the student believed Ctrl+S had worked.
    expect(readSource('src/renderer/src/app/files.ts')).toMatch(/try \{\s*path = await bridge\.saveFile\([^)]*\)\s*\} catch \(e\) \{\s*s\.pushLog\(\{ input: 'save', kind: 'error', text: saveFailureText\(e\) \}\)/)
    // And the main process turns Node's EACCES/ENOSPC into a sentence before it rethrows.
    const main = readSource('src/main/index.ts')
    expect(main).toContain('throw new Error(writeFailureText(e)')
    for (const code of ['EACCES', 'ENOSPC', 'ENOENT']) expect(main).toContain(`case '${code}':`)
  })
})
