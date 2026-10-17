// Tests for Part L1: One mode = one layout
// Entering a mode closes every dock panel that does not belong to it
// (the leftover Vector Calculator / Examples / Console / Practice / Measure / Expressions / Sandbox / Lab Data panels).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enterMode } from '../src/renderer/src/app/layout'
import { setDockApi } from '../src/renderer/src/app/panels'
import { useApp } from '../src/renderer/src/app/modes'
import { useSandboxView } from '../src/renderer/src/sim/sandboxView'

// Stub Worker for node environment when enterMode('calculator') warms up CAS
class FakeWorker {
  postMessage() {}
  addEventListener() {}
  removeEventListener() {}
  terminate() {}
}

interface FakePanel {
  id: string
  api: {
    group: { id: string }
    setActive: () => void
    moveTo: () => void
  }
}

function fakeDock(openIds: string[]) {
  const group = { id: 'main' }
  const panels: FakePanel[] = []
  const add = (id: string) => panels.push({ id, api: { group, setActive: () => {}, moveTo: () => {} } })
  openIds.forEach(add)
  const added: string[] = []

  setDockApi({
    width: 1366,
    height: 768,
    panels,
    getPanel: (id: string) => panels.find((p) => p.id === id),
    removePanel: (p: FakePanel) => {
      const idx = panels.indexOf(p)
      if (idx >= 0) panels.splice(idx, 1)
    },
    addPanel: (o: { id: string }) => {
      add(o.id)
      added.push(o.id)
    }
  } as never)

  return {
    ids: () => panels.map((p) => p.id),
    added
  }
}

describe('Part L1: One mode = one layout', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', FakeWorker)
    useApp.setState({ mode: 'vectors' })
    useSandboxView.setState({ view: 'simple' })
  })

  afterEach(() => {
    setDockApi(null)
    useApp.setState({ mode: 'vectors' })
    vi.unstubAllGlobals()
  })

  it('entering Geometry closes leftover Vector Calculator and keeps Examples', () => {
    const dock = fakeDock(['viewport', 'examples', 'vectorcalc'])
    enterMode('shapes')
    expect(dock.ids()).not.toContain('vectorcalc')
    expect(dock.ids()).toContain('viewport')
    expect(dock.ids()).toContain('examples')
  })

  it('entering Vectors closes leftover Practice and Measure', () => {
    useApp.setState({ mode: 'problems' })
    const dock = fakeDock(['viewport', 'practice', 'measure'])
    enterMode('vectors')
    expect(dock.ids()).not.toContain('practice')
    expect(dock.ids()).not.toContain('measure')
  })

  it('entering Sandbox closes leftover Examples, Practice, Measure, and Expressions', () => {
    const dock = fakeDock(['viewport', 'examples', 'practice', 'measure', 'expressions'])
    enterMode('sandbox')
    expect(dock.ids()).not.toContain('examples')
    expect(dock.ids()).not.toContain('practice')
    expect(dock.ids()).not.toContain('measure')
    expect(dock.ids()).not.toContain('expressions')
    expect(dock.ids()).toContain('viewport')
  })

  it('entering Problem Sets closes leftover Examples and Sandbox', () => {
    const dock = fakeDock(['viewport', 'examples', 'sandbox'])
    enterMode('problems')
    expect(dock.ids()).not.toContain('examples')
    expect(dock.ids()).not.toContain('sandbox')
    expect(dock.ids()).toContain('viewport')
  })

  it('entering Lab Data closes leftover Examples, Expressions, and Vector Calculator', () => {
    const dock = fakeDock(['viewport', 'examples', 'expressions', 'vectorcalc'])
    enterMode('lab')
    expect(dock.ids()).not.toContain('examples')
    expect(dock.ids()).not.toContain('expressions')
    expect(dock.ids()).not.toContain('vectorcalc')
    expect(dock.ids()).toContain('viewport')
  })

  it('entering any mode closes leftover Console', () => {
    const dock = fakeDock(['viewport', 'console', 'vectorcalc'])
    enterMode('shapes')
    expect(dock.ids()).not.toContain('console')
  })

  it('entering Calculator closes side panels (Vector Calculator, Practice, Measure, Examples)', () => {
    const dock = fakeDock(['viewport', 'examples', 'vectorcalc', 'practice', 'measure'])
    enterMode('calculator')
    expect(dock.ids()).not.toContain('vectorcalc')
    expect(dock.ids()).not.toContain('practice')
    expect(dock.ids()).not.toContain('measure')
    expect(dock.ids()).not.toContain('examples')
  })
})
