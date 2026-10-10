// P-GCALC GC2: Visualize opens the drawing BESIDE the Maths screen. It used to bring the drawing
// forward as a tab in the Maths screen's own group, so the picture hid the working it was drawing.

import { afterEach, describe, expect, it } from 'vitest'
import { setDockApi, showBeside } from '../src/renderer/src/app/panels'
import { useApp } from '../src/renderer/src/app/modes'
import { scene } from '../src/renderer/src/core/store'
import { runCommand } from '../src/renderer/src/lang/commands'
import { readSource } from './helpers/repo'

interface FakeGroup {
  id: string
}
interface FakePanel {
  id: string
  api: { group: FakeGroup; setActive: () => void; moveTo: (o: { group?: FakeGroup; position?: string }) => void }
}

/** Just enough of dockview: panels in groups, moveTo into a new group, addPanel. */
function fakeDock(width: number, start: Record<string, string>) {
  const groups: Record<string, FakeGroup> = {}
  const group = (id: string) => (groups[id] ??= { id })
  const moves: { id: string; beside: string; position?: string }[] = []
  const added: { id: string; position: unknown }[] = []
  const active: string[] = []
  const panels: FakePanel[] = []
  const make = (id: string, g: FakeGroup): FakePanel => {
    const p: FakePanel = {
      id,
      api: {
        group: g,
        setActive: () => void active.push(id),
        moveTo: (o) => {
          moves.push({ id, beside: o.group!.id, position: o.position })
          p.api.group = group(`${id}-own`)
        }
      }
    }
    panels.push(p)
    return p
  }
  for (const [id, g] of Object.entries(start)) make(id, group(g))
  const api = {
    width,
    height: 800,
    panels,
    getPanel: (id: string) => panels.find((p) => p.id === id),
    addPanel: (o: { id: string; position: unknown }) => {
      added.push({ id: o.id, position: o.position })
      make(o.id, group(`${o.id}-own`))
    }
  }
  setDockApi(api as never)
  return { api, moves, added, active, groupOf: (id: string) => api.getPanel(id)!.api.group.id }
}

describe('showBeside', () => {
  it('takes the drawing out of the Maths screen\'s group and puts it to the right; Maths stays where it is', () => {
    const d = fakeDock(1600, { maths: 'centre', viewport: 'centre' })
    showBeside('viewport', 'maths')
    expect(d.moves).toEqual([{ id: 'viewport', beside: 'centre', position: 'right' }])
    expect(d.groupOf('viewport')).not.toBe(d.groupOf('maths'))
    expect(d.groupOf('maths')).toBe('centre')
    expect(d.active.at(-1)).toBe('viewport')
  })

  it('on a narrow window puts it below instead', () => {
    const d = fakeDock(1000, { maths: 'centre', viewport: 'centre' })
    showBeside('viewport', 'maths')
    expect(d.moves[0].position).toBe('bottom')
  })

  it('already beside: does not move it, only makes it active', () => {
    const d = fakeDock(1600, { maths: 'centre', viewport: 'right' })
    showBeside('viewport', 'maths')
    expect(d.moves).toEqual([])
    expect(d.active).toEqual(['viewport'])
  })

  it('a closed drawing is added to the right of Maths', () => {
    const d = fakeDock(1600, { maths: 'centre' })
    showBeside('viewport', 'maths')
    expect(d.added).toEqual([{ id: 'viewport', position: { referencePanel: 'maths', direction: 'right' } }])
  })
})

describe('who calls it', () => {
  afterEach(() => useApp.setState({ mode: 'vectors' }))

  it('both Visualize routes of the Maths screen open the drawing beside it, and Open in Graphing follows a drawing', () => {
    const src = readSource('src/renderer/src/panels/Maths.tsx')
    expect(src.match(/showBeside\('viewport', 'maths'\)/g)?.length).toBe(2)
    expect(src).not.toContain("showPanel('viewport')")
    expect(src).toMatch(/\{drew && \(\s*<button className="btn" onClick=\{\(\) => enterMode\('graphing'\)\}/)
    expect(src).toContain('Open in Graphing')
  })

  it('a graph typed in the bar while in the Calculator opens the drawing beside the Maths screen', async () => {
    scene().newScene()
    scene().setActiveSpace('graphing')
    useApp.setState({ mode: 'calculator' })
    const d = fakeDock(1600, { maths: 'centre', viewport: 'centre' })
    await runCommand('y = x^2')
    expect(d.moves).toEqual([{ id: 'viewport', beside: 'centre', position: 'right' }])
    expect(d.groupOf('maths')).toBe('centre')
  })

  it('the same line typed in another mode leaves the drawing where it is', async () => {
    scene().newScene()
    scene().setActiveSpace('graphing')
    useApp.setState({ mode: 'graphing' })
    const d = fakeDock(1600, { maths: 'centre', viewport: 'centre' })
    await runCommand('y = x^2')
    expect(d.moves).toEqual([])
    expect(d.groupOf('viewport')).toBe('centre')
  })
})
