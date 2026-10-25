// 3D-2: the 'Try one' tiles. Each of the twelve gallery graphs is typed as real lines (its slider, then the graph), every
// line is accepted by the command bar as the kind the gallery says, and each typed formula gives the gallery's own numbers.

import { beforeEach, describe, expect, it } from 'vitest'
import { runCommand } from '../src/renderer/src/lang/commands'
import { scene } from '../src/renderer/src/core/store'
import type { GraphObj } from '../src/renderer/src/core/types'
import { compileScalar, sceneNames } from '../src/renderer/src/math/expr'
import { graph3dGallery } from '../src/renderer/src/math/graph3dGallery'
import { CHEMISTRY_TILES_3D, TILES_3D, tileLines } from '../src/renderer/src/math/graph3dTiles'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  scene().setActiveSpace('graphing')
})

const graphs = (): GraphObj[] => Object.values(scene().objects).filter((o): o is GraphObj => o.type === 'graph')
const KIND = { surface: 'surface', curve: 'curve3d', parametricSurface: 'psurface' } as const

describe('the twelve tiles', () => {
  it('are the gallery’s twelve graphs, each with a title, a caption, a slider and its lines', () => {
    expect(TILES_3D).toHaveLength(12)
    for (const t of TILES_3D) {
      expect(t.lines.length, t.id).toBeGreaterThan(0)
      expect(t.caption.length, t.id).toBeGreaterThan(20)
      expect(tileLines(t)[0]).toBe(`${t.slider!.name} = ${t.slider!.default}`)
    }
  })

  it.each(graph3dGallery.map((g) => [g.id, g] as const))('%s: typed, drawn as its kind, and the same numbers as the gallery', async (_id, g) => {
    const tile = TILES_3D.find((t) => t.id === g.id)!
    for (const line of tileLines(tile)) await runCommand(line)
    const made = graphs()
    expect(made.length, scene().log.map((l) => l.text).join(' | ')).toBeGreaterThan(0)
    const first = made[0]
    expect(first.kind).toBe(KIND[g.kind])
    const params = { [g.slider.name]: g.slider.default }
    const scope = () => ({ ...scene().ev.scope })
    const at = (expr: string, vars: string[]) => compileScalar(expr, vars, scope, sceneNames())
    const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 9)
    if (g.kind === 'surface') {
      const f = at(first.exprs[0], ['x', 'y'])
      for (const [x, y] of [[0.3, -1.2], [2, 1.5], [-3.1, 0.7]]) near(f({ x, y }), g.expressions!.z(x, y, params))
    } else if (g.kind === 'curve') {
      const [fx, fy, fz] = first.exprs.map((e) => at(e, ['t']))
      const c = g.parametricCurve!
      for (const t of [0.5, 3, 9.4]) {
        near(fx({ t }), c.x(t, params))
        near(fy({ t }), c.y(t, params))
        near(fz({ t }), c.z(t, params))
      }
      expect(first.tMax).toBeCloseTo(g.rangeT!.max, 9)
    } else {
      const [fx, fy, fz] = first.exprs.map((e) => at(e, ['u', 'v']))
      const s = g.parametricSurface!
      for (const [u, v] of [[0.4, 0.3], [2.5, -0.6], [5.9, 0.9]]) {
        near(fx({ u, v }), s.x(u, v, params))
        near(fy({ u, v }), s.y(u, v, params))
        near(fz({ u, v }), s.z(u, v, params))
      }
      expect([first.tMin, first.tMax]).toEqual([g.rangeU!.min, expect.closeTo(g.rangeU!.max, 9)])
      expect(first.vMin).toBeCloseTo(g.rangeV!.min, 9)
      expect(first.vMax).toBeCloseTo(g.rangeV!.max, 9)
    }
  })

  it('the tangent plane touches the hill at P: the same height there and the same slope along x', async () => {
    const tile = TILES_3D.find((t) => t.id === 'tangent-plane-on-hill')!
    for (const line of tileLines(tile)) await runCommand(line)
    const [hill, plane] = graphs()
    const scope = () => ({ ...scene().ev.scope })
    const h = compileScalar(hill.exprs[0], ['x', 'y'], scope, sceneNames())
    const p = compileScalar(plane.exprs[0], ['x', 'y'], scope, sceneNames())
    const a = tile.slider!.default
    expect(p({ x: a, y: 0 })).toBeCloseTo(h({ x: a, y: 0 }), 12)
    const dx = 1e-5
    expect((p({ x: a + dx, y: 0 }) - p({ x: a - dx, y: 0 })) / (2 * dx)).toBeCloseTo((h({ x: a + dx, y: 0 }) - h({ x: a - dx, y: 0 })) / (2 * dx), 6)
  })
})

describe('a tile in the panel', () => {
  it('types its lines, gives the slider the gallery range, and the next tile replaces it (the student’s own lines stay)', async () => {
    const { playTile } = await import('../src/renderer/src/panels/tiles3d')
    await runCommand('y = x^2')
    const own = graphs().map((g) => g.id)
    const saddle = TILES_3D.find((t) => t.id === 'saddle-surface')!
    await playTile(saddle)
    const a = scene().objects[scene().ev.names.get('a')!]
    expect(a.type === 'number' && a.slider).toEqual({ min: -2, max: 2, step: 0.1 })
    expect(graphs().map((g) => g.kind)).toEqual(['explicit', 'surface'])
    // Drawn over the gallery's own square, ±4.
    expect(graphs().filter((g) => g.kind === 'surface').map((g) => [g.tMin, g.tMax])).toEqual([[-4, 4]])
    await playTile(TILES_3D.find((t) => t.id === '3d-helix-spring')!)
    expect(graphs().map((g) => g.kind)).toEqual(['explicit', 'curve3d'])
    expect(graphs().some((g) => own.includes(g.id))).toBe(true)
    expect(scene().ev.names.get('a')).toBeUndefined()
    expect(scene().ev.names.get('c')).toBeDefined()
  })
  it('leaves nothing selected: a selected graph is drawn under its highlight, which hid the helix line behind a thick halo', async () => {
    const { playTile } = await import('../src/renderer/src/panels/tiles3d')
    await playTile(TILES_3D.find((t) => t.id === '3d-helix-spring')!)
    expect(scene().selection).toEqual([])
  })
  it('the tile shown is the one whose graph is on the drawing: none once its lines are deleted', async () => {
    const { playTile, shownTile } = await import('../src/renderer/src/panels/tiles3d')
    const added = await playTile(TILES_3D.find((t) => t.id === 'gaussian-bell')!)
    expect(shownTile()).toBe('gaussian-bell')
    scene().removeObjects(added)
    expect(shownTile()).toBeNull()
  })

  describe('Chemistry & DNA 3D tiles in the Expressions demo tab', () => {
    it('has 5 3D molecular and biological structures', () => {
      expect(CHEMISTRY_TILES_3D).toHaveLength(5)
      const ids = CHEMISTRY_TILES_3D.map((t) => t.id)
      expect(ids).toContain('dna-double-helix')
      expect(ids).toContain('water-molecule')
      expect(ids).toContain('methane-molecule')
      expect(ids).toContain('benzene-ring')
      expect(ids).toContain('bohr-atom')
    })

    it('DNA Double Helix sets view to 3D and plots 3D tubular strands with base-pair rungs', async () => {
      const { playTile } = await import('../src/renderer/src/panels/tiles3d')
      const dna = CHEMISTRY_TILES_3D.find((t) => t.id === 'dna-double-helix')!
      scene().setViewMode('2d')
      await playTile(dna)
      expect(scene().viewMode).toBe('3d')
      const psurfaceCount = graphs().filter((o) => o.kind === 'psurface').length
      expect(psurfaceCount).toBe(2)
      const rungCount = graphs().filter((o) => o.kind === 'curve3d').length
      expect(rungCount).toBe(19)
    })

    it('Water Molecule (H2O) sets view to 3D and plots atom spheres, bonds and points', async () => {
      const { playTile } = await import('../src/renderer/src/panels/tiles3d')
      const water = CHEMISTRY_TILES_3D.find((t) => t.id === 'water-molecule')!
      await playTile(water)
      expect(scene().viewMode).toBe('3d')
      const atomSpheres = graphs().filter((o) => o.kind === 'psurface').length
      expect(atomSpheres).toBe(3)
      const bonds = graphs().filter((o) => o.kind === 'curve3d').length
      expect(bonds).toBe(2)
      expect(scene().ev.names.get('O')).toBeDefined()
      expect(scene().ev.names.get('H1')).toBeDefined()
      expect(scene().ev.names.get('H2')).toBeDefined()
    })

    it('Methane Molecule (CH4) sets view to 3D with 5 atom spheres and 4 tetrahedral bonds', async () => {
      const { playTile } = await import('../src/renderer/src/panels/tiles3d')
      const methane = CHEMISTRY_TILES_3D.find((t) => t.id === 'methane-molecule')!
      await playTile(methane)
      expect(scene().viewMode).toBe('3d')
      const atomSpheres = graphs().filter((o) => o.kind === 'psurface').length
      expect(atomSpheres).toBe(5)
      const bonds = graphs().filter((o) => o.kind === 'curve3d').length
      expect(bonds).toBe(4)
      expect(scene().ev.names.get('C')).toBeDefined()
    })

    it('Bohr Atom sets view to 3D with nucleus sphere and 3 inclined electron shells', async () => {
      const { playTile } = await import('../src/renderer/src/panels/tiles3d')
      const bohr = CHEMISTRY_TILES_3D.find((t) => t.id === 'bohr-atom')!
      await playTile(bohr)
      expect(scene().viewMode).toBe('3d')
      const nucleusSpheres = graphs().filter((o) => o.kind === 'psurface').length
      expect(nucleusSpheres).toBe(1)
      const shells = graphs().filter((o) => o.kind === 'curve3d').length
      expect(shells).toBe(3)
      expect(scene().ev.names.get('Nucleus')).toBeDefined()
    })
  })
})
