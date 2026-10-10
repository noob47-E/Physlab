// Properties' Equation box for a graph (H19) and the slider of a point on an object (H21).
// Both run the real command bar against the real scene store, no DOM: a typed line in, a scene out.
//
// Two things are mocked, as in commands.test.ts: the SymPy worker cannot start here, and the
// stylesheet is not loaded, so colours fall back.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async (op: string) => ({ latex: `\\text{${op}}`, text: `${op}(x)`, numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {} },
  CAS_OPS: []
}))
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { runCommand } from '../src/renderer/src/lang/commands'
import { classifyEdit, GRAPH_DEFINES, GRAPH_KEEPS, pointOnRange, replaceGraphEquation } from '../src/renderer/src/lang/graphEdit'
import { scene } from '../src/renderer/src/core/store'
import { Builder } from '../src/renderer/src/core/factory'
import type { GraphObj, SceneObject } from '../src/renderer/src/core/types'
import { resetGlobals } from './helpers/globals'
import { readSource } from './helpers/repo'

function fresh(): void {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  // Properties only offers a graph's Equation box where the graph is on screen: Graphing.
  scene().setActiveSpace('graphing')
  scene().setViewMode('2d')
}

const graphs = (): GraphObj[] => Object.values(scene().objects).filter((o): o is GraphObj => o.type === 'graph')
const named = (name: string): SceneObject | undefined => {
  const id = scene().ev.names.get(name)
  return id ? scene().objects[id] : undefined
}
/** Makes `y = x^2` (or any graph line) the way the student does and returns the graph. */
async function graphFrom(line: string): Promise<GraphObj> {
  const before = new Set(Object.keys(scene().objects))
  await runCommand(line)
  const made = graphs().filter((g) => !before.has(g.id))
  if (made.length !== 1) throw new Error(`"${line}" made ${made.length} graphs`)
  return made[0]
}
const only = (): GraphObj => {
  const all = graphs()
  expect(all).toHaveLength(1)
  return all[0]
}
/** A refusal's words must be ones a student can read: no parser quoting, no missing values. */
const plain = (reason: string): void => {
  expect(reason).toMatch(/^[A-Z]/)
  expect(reason).not.toMatch(/\(char \d+\)|Syntax|Unexpected|Value expected|undefined|NaN|\bnull\b|\[object/)
}

describe('H19: changing a graph’s equation in Properties', () => {
  beforeEach(fresh)

  // Why the order matters: the Equation box used to remove the graph and then run the line, and the
  // command bar makes nothing for a line it refuses.
  it('premise: a refused line makes nothing, so deleting the old graph first left no graph at all', async () => {
    const g = await graphFrom('y = x^2')
    scene().removeObjects([g.id])
    await runCommand('y = sqrt(-1 - x^2)')
    expect(graphs()).toHaveLength(0)
    expect(scene().log.at(-1)?.kind).toBe('error')
  })

  it('keeps one graph, with the old name and the new source, when the new line draws', async () => {
    const g = await graphFrom('y = x^2')
    const result = await replaceGraphEquation(g.id, 'y = x^3')
    expect(result).toEqual({ ok: true })
    const after = only()
    expect(after.name).toBe(g.name)
    expect(after.source).toBe('y = x^3')
    expect(after.exprs).toEqual(['x^3'])
    expect(after.kind).toBe('explicit')
  })

  it('is the same graph afterwards: id, colour, width and the Roots tick the student chose stay', async () => {
    const g = await graphFrom('y = x^2')
    scene().updateObject(g.id, (d) => {
      if (d.type !== 'graph') return
      d.color = '#123456'
      d.width = 4
      d.showRoots = false
    })
    expect(await replaceGraphEquation(g.id, 'y = x^3')).toEqual({ ok: true })
    const after = only()
    expect(after.id).toBe(g.id)
    expect(after.color).toBe('#123456')
    expect(after.width).toBe(4)
    expect(after.showRoots).toBe(false)
    // The line selected its own copy; the student is still editing this graph.
    expect(scene().selection).toEqual([g.id])
    expect(scene().order).toEqual([g.id])
  })

  it('is one undo step, and redo brings the new equation back', async () => {
    const g = await graphFrom('y = x^2')
    const steps = scene().past.length
    await replaceGraphEquation(g.id, 'y = x^3')
    expect(scene().past.length).toBe(steps + 1)
    scene().undo()
    expect(only().source).toBe('y = x^2')
    expect(only().exprs).toEqual(['x^2'])
    scene().redo()
    expect(only().source).toBe('y = x^3')
  })

  it('moves to a different kind of graph, and back, keeping name and id', async () => {
    const g = await graphFrom('y = x^2')
    expect(await replaceGraphEquation(g.id, 'x^2 + y^2 = 9')).toEqual({ ok: true })
    expect(only()).toMatchObject({ id: g.id, name: g.name, kind: 'implicit', source: 'x^2 + y^2 = 9' })

    expect(await replaceGraphEquation(g.id, 'curve(cos(t), sin(t), 0, 6)')).toEqual({ ok: true })
    expect(only()).toMatchObject({ id: g.id, kind: 'parametric', tMin: 0, tMax: 6 })

    expect(await replaceGraphEquation(g.id, 'y > x')).toEqual({ ok: true })
    expect(only()).toMatchObject({ id: g.id, kind: 'inequality', op: '>' })
    expect(only().tMin).toBeUndefined()

    // Back to y = f(x): nothing of the parametric range or the inequality sign is left behind,
    // and the curve starts from the Roots and Max / min marks a new y = f(x) gets.
    expect(await replaceGraphEquation(g.id, 'y = 2x + 1')).toEqual({ ok: true })
    const back = only()
    expect(back).toMatchObject({ id: g.id, name: g.name, kind: 'explicit', exprs: ['2x + 1'], showRoots: true, showExtrema: true })
    expect(back.tMin).toBeUndefined()
    expect(back.tMax).toBeUndefined()
    expect(back.op).toBeUndefined()
    expect(back.pieces).toBeUndefined()
  })

  it('drops what the old equation carried: the solutions it had worked out are not the new equation’s', async () => {
    const g = await graphFrom('x^2 = 4')
    scene().updateObject(g.id, (d) => void (d.type === 'graph' && Object.assign(d, { solvedXs: { expr: d.exprs[0], xs: [-2, 2] } })))
    expect(await replaceGraphEquation(g.id, 'x^2 = 9')).toEqual({ ok: true })
    expect(only()).toMatchObject({ id: g.id, source: 'x^2 = 9' })
    expect((only() as { solvedXs?: unknown }).solvedXs).toBeUndefined()
  })

  // The edit copies the fields that say what a graph draws and keeps the ones that are the student's.
  // A field a route starts to put on graphs that is in neither list would be kept from the old
  // equation by mistake, so a new one must be sorted into GRAPH_DEFINES or GRAPH_KEEPS first.
  it('knows every field of every graph the command bar makes', async () => {
    const known = new Set<string>([...GRAPH_DEFINES, ...GRAPH_KEEPS])
    const lines = ['y = x^2', 'f(x) = x^2', 'x^2 + y^2 = 9', 'x^2 = 4', 'curve(cos(t), sin(t), 0, 6)', 'r = 2 sin(theta)', 'y > x', 'z = x*y', 'piecewise(x^2 from -3 to 0, x from 0 to 2)', 'between(x^2, x + 2, -1, 2)', 'tangent(x^2, 1)']
    for (const line of lines) {
      fresh()
      await runCommand(line)
      expect(graphs().length, line).toBeGreaterThan(0)
      for (const g of graphs()) for (const key of Object.keys(g)) expect(known.has(key), `${line}: ${key}`).toBe(true)
    }
  })

  it('changes nothing else in the scene', async () => {
    await runCommand('A = (1, 2)')
    await runCommand('k = 3')
    const keep = await graphFrom('y = sin(x)')
    const g = await graphFrom('y = x^2')
    const before = { ...scene().objects }
    expect(await replaceGraphEquation(g.id, 'y = x^3')).toEqual({ ok: true })
    expect(Object.keys(scene().objects).sort()).toEqual(Object.keys(before).sort())
    for (const [id, o] of Object.entries(before)) if (id !== g.id) expect(scene().objects[id]).toBe(o)
    expect(scene().objects[keep.id]).toBe(before[keep.id])
  })

  describe.each(['y = sqrt(-1 - x^2)', 'y = x +', 'y = x^', 'y = ', 'x +', 'y = nothing_here(x)'])('a line the command bar refuses: %s', (line) => {
    it('leaves the old graph and the whole scene as they were, and says why in a sentence', async () => {
      await runCommand('A = (1, 2)')
      const g = await graphFrom('y = x^2')
      const before = { objects: scene().objects, order: scene().order, past: scene().past, future: scene().future, selection: scene().selection }
      const result = await replaceGraphEquation(g.id, line)
      expect(result.ok).toBe(false)
      if (result.ok) return
      plain(result.reason)
      expect(result.reason).toContain('keeps its old equation')
      // The reason is the command bar's own refusal, which is also the last line of the Console.
      const last = scene().log.at(-1)
      expect(last?.kind).toBe('error')
      expect(result.reason).toContain((last?.text ?? '').trim().replace(/[.!?]$/, ''))
      // Not a copy of the scene: the very same objects, with no empty step added to undo.
      expect(scene().objects).toBe(before.objects)
      expect(scene().order).toBe(before.order)
      expect(scene().past).toBe(before.past)
      expect(scene().future).toBe(before.future)
      expect(scene().selection).toBe(before.selection)
      expect(only()).toMatchObject({ id: g.id, source: 'y = x^2' })
    })
  })

  it('refuses an empty box without touching anything', async () => {
    const g = await graphFrom('y = x^2')
    const objects = scene().objects
    for (const line of ['', '   ']) {
      const result = await replaceGraphEquation(g.id, line)
      expect(result.ok).toBe(false)
      if (!result.ok) plain(result.reason)
    }
    expect(scene().objects).toBe(objects)
  })

  describe('a line that is not an equation', () => {
    it('does not leave a new point behind, and does not echo it in the Console', async () => {
      await runCommand('A = (1, 2)')
      const g = await graphFrom('y = x^2')
      const before = { objects: scene().objects, order: scene().order, past: scene().past, future: scene().future, log: scene().log, selection: scene().selection }
      const result = await replaceGraphEquation(g.id, 'B = (5, 5)')
      expect(result.ok).toBe(false)
      if (!result.ok) plain(result.reason)
      expect(named('B')).toBeUndefined()
      expect(scene().objects).toBe(before.objects)
      expect(scene().order).toBe(before.order)
      expect(scene().past).toBe(before.past)
      expect(scene().future).toBe(before.future)
      expect(scene().log).toBe(before.log)
      expect(scene().selection).toBe(before.selection)
      expect(scene().ev.names.has('B')).toBe(false)
    })

    it('does not redefine a point that is already there', async () => {
      await runCommand('A = (1, 2)')
      const g = await graphFrom('y = x^2')
      const a = named('A')
      const result = await replaceGraphEquation(g.id, 'A = (7, 8)')
      expect(result.ok).toBe(false)
      expect(named('A')).toBe(a)
      expect(scene().ev.values.get(a!.id)).toMatchObject({ type: 'point', p: [1, 2, 0] })
    })

    it('does not delete anything, not even by "delete"', async () => {
      await runCommand('A = (1, 2)')
      const g = await graphFrom('y = x^2')
      const objects = scene().objects
      const result = await replaceGraphEquation(g.id, 'delete A')
      expect(result.ok).toBe(false)
      expect(scene().objects).toBe(objects)
      expect(named('A')).toBeDefined()
      expect(only().id).toBe(g.id)
    })

    it('never wipes the file: clear and new are refused before they run', async () => {
      await runCommand('A = (1, 2)')
      const g = await graphFrom('y = x^2')
      const objects = scene().objects
      for (const line of ['clear', 'new', 'CLEAR']) {
        const result = await replaceGraphEquation(g.id, line)
        expect(result.ok).toBe(false)
        if (!result.ok) plain(result.reason)
      }
      expect(scene().objects).toBe(objects)
      expect(scene().past.length).toBeGreaterThan(0)
    })

    it('says so in plain words when the line only calculates', async () => {
      const g = await graphFrom('y = x^2')
      const result = await replaceGraphEquation(g.id, '3 + 4')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        plain(result.reason)
        expect(result.reason).toMatch(/does not draw a graph/)
      }
      expect(only()).toMatchObject({ id: g.id, source: 'y = x^2' })
    })
  })

  describe('a picture of several objects replaces the graph, as the old Equation box did', () => {
    it('between(…) typed into an ordinary graph takes its place', async () => {
      const g = await graphFrom('y = x^2')
      const result = await replaceGraphEquation(g.id, 'between(x^2, x + 2, -1, 2)')
      expect(result).toEqual({ ok: true })
      expect(scene().objects[g.id]).toBeUndefined()
      expect(graphs().filter((x) => x.kind === 'between')).toHaveLength(1)
    })

    it('editing the shaded region re-draws it, with one region and one area label', async () => {
      await runCommand('between(x^2, x + 2, -1, 2)')
      const region = graphs().find((x) => x.kind === 'between')!
      expect(region.source).toBe('between(x^2, x + 2, -1, 2)')
      const result = await replaceGraphEquation(region.id, 'between(x^2, x + 2, 0, 2)')
      expect(result).toEqual({ ok: true })
      const regions = graphs().filter((x) => x.kind === 'between')
      expect(regions).toHaveLength(1)
      expect(regions[0].tMin).toBe(0)
      expect(Object.values(scene().objects).filter((o) => o.type === 'text')).toHaveLength(1)
    })
  })

  it('refuses a graph that is gone, or something that is not a graph, without running the line', async () => {
    await runCommand('A = (1, 2)')
    const a = named('A')!
    const objects = scene().objects
    for (const id of ['nope', a.id]) {
      const result = await replaceGraphEquation(id, 'y = x^2')
      expect(result.ok).toBe(false)
      if (!result.ok) plain(result.reason)
    }
    expect(graphs()).toHaveLength(0)
    expect(scene().objects).toBe(objects)
  })
})

describe('classifyEdit: what a line did to the scene', () => {
  beforeEach(fresh)
  const shape = () => ({ objects: scene().objects, order: scene().order })

  it('nothing, one new graph, a picture, or something that is not a graph', async () => {
    await runCommand('A = (1, 2)')
    const g = await graphFrom('y = x^2')
    let before = shape()
    await runCommand('y = x +')
    expect(classifyEdit(before, shape())).toEqual({ kind: 'nothing' })

    before = shape()
    const h = await graphFrom('y = x^3')
    expect(classifyEdit(before, shape())).toEqual({ kind: 'one-graph', fresh: h.id })

    before = shape()
    await runCommand('between(x^2, x + 2, -1, 2)')
    expect(classifyEdit(before, shape())).toEqual({ kind: 'picture' })

    before = shape()
    await runCommand('B = (3, 3)')
    expect(classifyEdit(before, shape())).toEqual({ kind: 'other' })

    before = shape()
    await runCommand('A = (4, 4)')
    expect(classifyEdit(before, shape())).toEqual({ kind: 'other' })

    before = shape()
    scene().removeObjects([g.id])
    expect(classifyEdit(before, shape())).toEqual({ kind: 'other' })
  })
})

describe('H21: the slider of a point on an object', () => {
  beforeEach(fresh)

  /** A line, ray, segment or circle through the scene's own A and B, made the way the student makes them. */
  async function host(kind: 'Line' | 'Ray' | 'Segment' | 'Circle'): Promise<SceneObject> {
    scene().setActiveSpace('vectors')
    await runCommand('A = (0, 0)')
    await runCommand('B = (4, 0)')
    await runCommand(`f = ${kind}(A, ${kind === 'Circle' ? '4' : 'B'})`)
    return named('f')!
  }
  const pointAt = (on: SceneObject, t: number): SceneObject => {
    const b = new Builder()
    const p = b.point({ kind: 'onObject', on: on.id, t })
    b.commit()
    return p
  }

  it('is 0 to 1 on a segment and on a circle, as before', async () => {
    for (const kind of ['Segment', 'Circle'] as const) {
      fresh()
      const h = await host(kind)
      for (const t of [0, 0.25, 0.5, 1]) expect(pointOnRange(h, t)).toEqual({ min: 0, max: 1, step: 0.001 })
    }
  })

  it('holds a point at t = 2.5 on a line (the bug: the slider stopped at 1 and a touch sent the point back)', async () => {
    const h = await host('Line')
    expect(h.type).toBe('line')
    const p = pointAt(h, 2.5)
    // 2.5 lengths of A to B past A is (10, 0): the point really is beyond B.
    expect(scene().ev.values.get(p.id)).toMatchObject({ type: 'point', p: [10, 0, 0] })
    const r = pointOnRange(h, 2.5)
    expect(r.min).toBeLessThan(0)
    expect(r.max).toBeGreaterThanOrEqual(2.5)
    // The thumb is inside the track, so a small move leaves the point near where it was.
    const at = (2.5 - r.min) / (r.max - r.min)
    expect(at).toBeGreaterThan(0.1)
    expect(at).toBeLessThan(0.9)
    // The slider still starts at "one length before the first point, two past it" for a point between A and B.
    expect(pointOnRange(h, 0.5)).toMatchObject({ min: -1, max: 2 })
  })

  it('holds a point behind the first point of a line, and only forward of it on a ray', async () => {
    const line = await host('Line')
    expect(pointOnRange(line, -3)).toMatchObject({ min: -10, max: 10 })
    expect(pointOnRange(line, 15)).toMatchObject({ min: -100, max: 100 })
    fresh()
    const ray = await host('Ray')
    expect(ray.type).toBe('ray')
    expect(pointOnRange(ray, 0.5)).toMatchObject({ min: 0, max: 2 })
    expect(pointOnRange(ray, 2.5)).toMatchObject({ min: 0, max: 10 })
    expect(pointOnRange(ray, 11)).toMatchObject({ min: 0, max: 100 })
  })

  it('always holds the point, whatever the host and wherever the point is', async () => {
    const hosts: (SceneObject | undefined)[] = [undefined]
    for (const kind of ['Line', 'Ray', 'Segment', 'Circle'] as const) {
      fresh()
      hosts.push(await host(kind))
    }
    for (const h of hosts) {
      for (const t of [-1234.5, -100, -10.5, -3, -1, -0.2, 0, 0.3, 1, 1.0001, 1.9, 2, 2.5, 9.99, 10, 11, 123456, Number.NaN]) {
        const r = pointOnRange(h, t)
        const at = Number.isFinite(t) ? t : 0
        expect(r.min).toBeLessThanOrEqual(at)
        expect(r.max).toBeGreaterThanOrEqual(at)
        expect(r.step).toBeGreaterThan(0)
        expect((r.max - r.min) / r.step).toBeGreaterThanOrEqual(999)
        expect((r.max - r.min) / r.step).toBeLessThanOrEqual(11000)
      }
    }
  })

  it('does not run away from the pointer: the thumb at the far end puts t on that end, which fits the same range', async () => {
    const line = await host('Line')
    for (const t of [-30, -3, 0.5, 2.5, 7, 40]) {
      const r = pointOnRange(line, t)
      expect(pointOnRange(line, r.max)).toEqual(r)
      expect(pointOnRange(line, r.min)).toEqual(r)
    }
    fresh()
    const ray = await host('Ray')
    for (const t of [0.5, 2.5, 7, 40]) {
      const r = pointOnRange(ray, t)
      expect(pointOnRange(ray, r.max)).toEqual(r)
    }
  })

  it('does not change size while t moves inside the range', async () => {
    const line = await host('Line')
    const wide = pointOnRange(line, 2.5)
    for (const t of [2.01, 3, 5, 9.99, 10, -1.01, -5, -10]) expect(pointOnRange(line, t)).toEqual(wide)
    for (const t of [-1, 0, 1, 2]) expect(pointOnRange(line, t)).toEqual({ min: -1, max: 2, step: 0.001 })
  })

  // The panel is a component and there is no DOM here, so what it calls is read off its source:
  // the decision lives in graphEdit.ts, but a panel that went back to its own would pass every
  // test above (the same trap as the rename, which sceneStore.test.ts pins the same way).
  it('is what the Properties panel calls, for the slider and for the Equation box', () => {
    const panel = readSource('src/renderer/src/panels/Properties.tsx')
    expect(panel).toContain('pointOnRange(objects[o.def.on], o.def.t)')
    expect(panel).not.toMatch(/min=\{0\}\s+max=\{1\}/)
    expect(panel).toContain('replaceGraphEquation(o.id, v)')
    expect(panel).not.toMatch(/remove\(\[o\.id\]\)\s*\n\s*runCommand/)
    expect(panel).not.toContain("from '../lang/commands'")
  })
})

