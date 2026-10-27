// Unit tests for Command Registry: checking store/scene state for every command
import { describe, it, expect, beforeEach } from 'vitest'
import { scene } from '../src/renderer/src/core/store'
import { runCommand } from '../src/renderer/src/lang/commands'
import { registry } from '../src/renderer/src/lang/registry'
import { useSandbox } from '../src/renderer/src/sim/store'
import { useLab } from '../src/renderer/src/lab/labStore'
import { useApp } from '../src/renderer/src/app/modes'
import { useTheme } from '../src/renderer/src/app/theme'
import type { PointObj, NumberObj, VectorObj, GraphObj } from '../src/renderer/src/core/types'

describe('Command Registry & Full AI Control', () => {
  beforeEach(() => {
    scene().newScene()
    useApp.getState().setMode('shapes')
  })

  describe('Registry metadata and lookup', () => {
    it('registers all command entries with examples, args and summary', () => {
      const list = registry.list()
      expect(list.length).toBeGreaterThan(20)
      for (const cmd of list) {
        expect(cmd.name).toBeTruthy()
        expect(cmd.summary).toBeTruthy()
        expect(cmd.examples.length).toBeGreaterThan(0)
        expect(typeof cmd.run).toBe('function')
      }
    })

    it('resolves aliases correctly', () => {
      expect(registry.get('rn')?.name).toBe('rename')
      expect(registry.get('del')?.name).toBe('delete')
      expect(registry.get('colour')?.name).toBe('color')
    })
  })

  describe('Group 1: delete, rename, hide and show', () => {
    it('renames an object and updates store names and object properties', async () => {
      await runCommand('A = (1, 2)')
      const idA = scene().ev.names.get('A')
      expect(idA).toBeTruthy()

      const res = await runCommand('rename A TargetPoint')
      expect(res.ok).toBe(true)
      expect(scene().ev.names.get('A')).toBeUndefined()
      expect(scene().ev.names.get('TargetPoint')).toBe(idA)
      expect(scene().objects[idA!].name).toBe('TargetPoint')
    })

    it('hides and shows objects updating visible property in store', async () => {
      await runCommand('P = (3, 4)')
      const idP = scene().ev.names.get('P')!
      expect(scene().objects[idP].visible).toBe(true)

      const hideRes = await runCommand('hide P')
      expect(hideRes.ok).toBe(true)
      expect(scene().objects[idP].visible).toBe(false)

      const showRes = await runCommand('show P')
      expect(showRes.ok).toBe(true)
      expect(scene().objects[idP].visible).toBe(true)
    })

    it('deletes objects from store', async () => {
      await runCommand('Q = (5, 6)')
      const idQ = scene().ev.names.get('Q')!
      expect(scene().objects[idQ]).toBeDefined()

      const delRes = await runCommand('delete Q')
      expect(delRes.ok).toBe(true)
      expect(scene().objects[idQ]).toBeUndefined()
      expect(scene().ev.names.get('Q')).toBeUndefined()
    })
  })

  describe('Group 2: move, set, color, lock', () => {
    it('moves a free point to new coordinates', async () => {
      await runCommand('Pt = (2, 3)')
      const id = scene().ev.names.get('Pt')!
      const res = await runCommand('move Pt to (10, 20)')
      expect(res.ok).toBe(true)
      const obj = scene().objects[id] as PointObj
      expect(obj.def.kind).toBe('free')
      if (obj.def.kind === 'free') {
        expect(obj.def.p[0]).toBe(10)
        expect(obj.def.p[1]).toBe(20)
      }
    })

    it('sets number and slider values and bounds in store', async () => {
      await runCommand('k = 2')
      const id = scene().ev.names.get('k')!
      expect((scene().objects[id] as NumberObj).expr).toBe('2')

      const setRes = await runCommand('set k = 8')
      expect(setRes.ok).toBe(true)
      expect((scene().objects[id] as NumberObj).expr).toBe('8')

      const boundsRes = await runCommand('set k min -10 max 50 step 2')
      expect(boundsRes.ok).toBe(true)
      const slider = (scene().objects[id] as NumberObj).slider
      expect(slider?.min).toBe(-10)
      expect(slider?.max).toBe(50)
      expect(slider?.step).toBe(2)
    })

    it('updates object color and locked state in store', async () => {
      await runCommand('C = (0, 0)')
      const id = scene().ev.names.get('C')!

      await runCommand('color C #ff0055')
      expect(scene().objects[id].color).toBe('#ff0055')

      await runCommand('lock C')
      expect(scene().objects[id].locked).toBe(true)

      await runCommand('unlock C')
      expect(scene().objects[id].locked).toBe(false)
    })
  })

  describe('Group 3: constructions (midpoint, perp, parallel, bisectors, distance, lego)', () => {
    it('measures distance and connects points with segment', async () => {
      await runCommand('A = (0, 0)')
      await runCommand('B = (3, 4)')
      const res = await runCommand('distance A B')
      expect(res.ok).toBe(true)
      expect(res.message).toContain('5')
      const seg = Object.values(scene().objects).find((o) => o.type === 'segment')
      expect(seg).toBeDefined()
    })

    it('constructs midpoint in store', async () => {
      await runCommand('A = (0, 0)')
      await runCommand('B = (4, 0)')
      const res = await runCommand('midpoint A B')
      expect(res.ok).toBe(true)
      expect(res.created.length).toBe(1)
      const mid = scene().objects[res.created[0]] as PointObj
      expect(mid.type).toBe('point')
      expect(mid.def.kind).toBe('midpoint')
    })

    it('constructs perpendicular and parallel lines', async () => {
      await runCommand('A = (0, 0)')
      await runCommand('B = (4, 0)')
      await runCommand('P = (2, 3)')
      await runCommand('seg = Segment(A, B)')

      const perpRes = await runCommand('perpendicular P seg')
      expect(perpRes.ok).toBe(true)
      expect(perpRes.created.length).toBe(1)

      const parRes = await runCommand('parallel P seg')
      expect(parRes.ok).toBe(true)
      expect(parRes.created.length).toBe(1)
    })

    it('constructs perpendicular and angle bisectors', async () => {
      await runCommand('A = (0, 0)')
      await runCommand('B = (4, 0)')
      await runCommand('C = (0, 3)')

      const pbRes = await runCommand('perpbisector A B')
      expect(pbRes.ok).toBe(true)
      expect(pbRes.created.length).toBe(1)

      const abRes = await runCommand('anglebisector A B C')
      expect(abRes.ok).toBe(true)
      expect(abRes.created.length).toBe(1)
    })
  })

  describe('Group 4: Graphing (plot, domain, roots, extrema, tangent, area, trace)', () => {
    it('plots a curve and sets domain bounds', async () => {
      const plotRes = await runCommand('plot y = x^2 - 4')
      expect(plotRes.ok).toBe(true)
      const graph = Object.values(scene().objects).find((o): o is GraphObj => o.type === 'graph')!
      expect(graph).toBeDefined()

      const domRes = await runCommand(`domain ${graph.name} -10 10`)
      expect(domRes.ok).toBe(true)
      expect((scene().objects[graph.id] as GraphObj).tMin).toBe(-10)
      expect((scene().objects[graph.id] as GraphObj).tMax).toBe(10)
    })

    it('toggles roots and extrema on graph object', async () => {
      await runCommand('plot y = x^3 - 3x')
      const graph = Object.values(scene().objects).find((o): o is GraphObj => o.type === 'graph')!

      await runCommand(`roots ${graph.name}`)
      expect((scene().objects[graph.id] as GraphObj).showRoots).toBe(true)

      await runCommand(`extrema ${graph.name}`)
      expect((scene().objects[graph.id] as GraphObj).showExtrema).toBe(true)
    })

    it('computes tangent line and area under curve', async () => {
      await runCommand('plot y = x^2')
      const tanRes = await runCommand('tangent x^2 at 2')
      expect(tanRes.ok).toBe(true)
      expect(tanRes.message).toContain('slope')

      const areaRes = await runCommand('area x^2 0 3')
      expect(areaRes.ok).toBe(true)
      expect(areaRes.message).toContain('9')
    })
  })

  describe('Group 5: Vectors (resolve, addvector)', () => {
    it('resolves a vector and toggles components flag in store', async () => {
      useApp.getState().setMode('vectors')
      await runCommand('A = <3, 4>')
      const id = scene().ev.names.get('A')!

      const res = await runCommand('resolve A')
      expect(res.ok).toBe(true)
      expect((scene().objects[id] as VectorObj).showComponents).toBe(true)
    })

    it('creates resultant vector with addvector', async () => {
      useApp.getState().setMode('vectors')
      await runCommand('U = <1, 2>')
      await runCommand('V = <3, 1>')
      const res = await runCommand('addvector U V Res')
      expect(res.ok).toBe(true)
      const resId = scene().ev.names.get('Res')
      expect(resId).toBeDefined()
    })
  })

  describe('Group 6: Sandbox (body, link, gravity, reset, step, preset)', () => {
    beforeEach(() => {
      useSandbox.getState().resetRun()
    })

    it('adds simulation sphere and box bodies to sandbox store', async () => {
      const resSphere = await runCommand('body sphere name myBall mass 2.5 pos (0, 5, 0)')
      expect(resSphere.ok).toBe(true)
      const bodies = useSandbox.getState().bodies
      const sphere = bodies.find((b) => b.name === 'myBall')
      expect(sphere).toBeDefined()
      expect(sphere?.mass).toBe(2.5)
      expect(sphere?.position[1]).toBe(5)

      const resBox = await runCommand('body box name myBox mass 4 pos (2, 0, 0)')
      expect(resBox.ok).toBe(true)
      expect(useSandbox.getState().bodies.find((b) => b.name === 'myBox')).toBeDefined()
    })

    it('creates spring link between bodies', async () => {
      await runCommand('body sphere name b1 pos (0, 5, 0)')
      await runCommand('body box name b2 pos (0, 2, 0)')
      const linkRes = await runCommand('link spring b1 b2 stiffness 150')
      expect(linkRes.ok).toBe(true)
      const links = useSandbox.getState().links
      expect(links.length).toBe(1)
      expect(links[0].kind).toBe('spring')
      expect(links[0].stiffness).toBe(150)
    })

    it('sets world gravity in sandbox store', async () => {
      const res = await runCommand('gravity 1.62')
      expect(res.ok).toBe(true)
      expect(useSandbox.getState().world.gravity).toBeCloseTo(1.62)
    })

    it('loads experiment preset into sandbox store', async () => {
      const res = await runCommand('preset projectile')
      expect(res.ok).toBe(true)
      expect(useSandbox.getState().bodies.length).toBeGreaterThan(0)
    })
  })

  describe('Group 7: Lab Data (table, column, row, fit, exportlab)', () => {
    it('creates table, adds columns and rows in lab store', async () => {
      const tabRes = await runCommand('table PendulumLab Time/s, Length/m')
      expect(tabRes.ok).toBe(true)
      const store = useLab.getState()
      const table = store.tables.find((t) => t.title === 'PendulumLab')
      expect(table).toBeDefined()
      expect(table?.columns.length).toBe(2)

      const colRes = await runCommand('column add Period s')
      expect(colRes.ok).toBe(true)

      const rowRes = await runCommand('row add 0.5 1.0 2.0')
      expect(rowRes.ok).toBe(true)
      const updatedTable = useLab.getState().tables.find((t) => t.title === 'PendulumLab')
      expect(updatedTable?.rows.length).toBe(1)
    })

    it('computes linear fit on table data', async () => {
      await runCommand('table FitTest x, y')
      await runCommand('row add 1 2')
      await runCommand('row add 2 4')
      await runCommand('row add 3 6')
      const fitRes = await runCommand('fit linear')
      expect(fitRes.ok).toBe(true)
      expect(fitRes.message).toContain('R² = 1.0000')
    })
  })

  describe('Group 8: App Level (mode, view, theme, grid, axes, snap, unit, precision, angles)', () => {
    it('switches app mode and active space', async () => {
      await runCommand('mode graphing')
      expect(useApp.getState().mode).toBe('graphing')

      await runCommand('mode sandbox')
      expect(useApp.getState().mode).toBe('sandbox')
    })

    it('switches view mode between 2D and 3D', async () => {
      await runCommand('view 3d')
      expect(scene().viewMode).toBe('3d')

      await runCommand('view 2d')
      expect(scene().viewMode).toBe('2d')
    })

    it('sets theme, grid, axes, snap and units', async () => {
      await runCommand('theme moonlight')
      expect(useTheme.getState().theme).toBe('moonlight')

      await runCommand('grid polar')
      expect(scene().settings.gridStyle).toBe('polar')

      await runCommand('axes off')
      expect(scene().settings.showAxes).toBe(false)

      await runCommand('snap off')
      expect(scene().settings.snap).toBe(false)

      await runCommand('unit cm')
      expect(scene().settings.unit).toBe('cm')

      await runCommand('precision 4 sf')
      expect(scene().settings.decimals).toBe(4)
      expect(scene().settings.precisionMode).toBe('sf')

      await runCommand('angles rad')
      expect(scene().settings.angleUnit).toBe('rad')
    })
  })
})
