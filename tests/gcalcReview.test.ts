// P-GCALC: the checker's findings, each pinned — a picture lesson opens Graphing before it makes its
// slider, the Maths screen goes back behind the drawing when the Calculator is left, Expressions
// closes when Graphing is left, a reorder is one undo step, and "Draw only from … to …" can be read
// back, cleared and refused in words.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

import { EXAMPLES, runExample } from '../src/renderer/src/panels/Examples'
import { EXPRESSION_WORDS, rangeEdit, rangeOf } from '../src/renderer/src/panels/expressionRows'
import { regroupWithViewport, setDockApi } from '../src/renderer/src/app/panels'
import { buildLayout, enterMode } from '../src/renderer/src/app/layout'
import { useApp } from '../src/renderer/src/app/modes'
import { runCommand } from '../src/renderer/src/lang/commands'
import { replaceGraphEquation } from '../src/renderer/src/lang/graphEdit'
import { scene } from '../src/renderer/src/core/store'
import { visibleIn } from '../src/renderer/src/core/visibility'
import { visualizeGraph } from '../src/renderer/src/core/visualize'
import { resetGlobals } from './helpers/globals'
import { readSource } from './helpers/repo'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
})

describe('picture lessons open Graphing first', () => {
  it('every Graphs & functions lesson and the projectile graph say mode: graphing, and runExample opens it before the commands', async () => {
    for (const ex of EXAMPLES.filter((e) => e.area === 'Graphs & functions' || e.title === 'Projectile path graph')) expect(ex.mode, ex.title).toBe('graphing')
    // A command stamps what it makes with the drawing active at that moment. Had runExample entered
    // Graphing after its commands, the lesson's objects would carry the Vectors drawing set here.
    scene().setActiveSpace('vectors')
    await runExample(EXAMPLES.find((e) => e.title === 'Waves that move')!)
    const made = Object.values(scene().objects)
    expect(made.length).toBeGreaterThan(0)
    expect([...new Set(made.map((o) => o.space))]).toEqual(['graphing'])
  })

  it('the Geometry lessons with commands open Geometry first too (their shapes were left in the Vectors drawing)', () => {
    for (const title of ['Circle: area and circumference', 'Area of a composite shape']) expect(EXAMPLES.find((e) => e.title === title)!.mode, title).toBe('shapes')
  })

  it('the range boxes follow the line (a range typed in the equation, an edit that drops it, Undo)', () => {
    expect(readSource('src/renderer/src/panels/Expressions.tsx')).toMatch(/useEffect\(\(\) => \{\s*setFrom\(range \? fmt\(range\.from, 10\) : ''\)\s*setTo\(range \? fmt\(range\.to, 10\) : ''\)[\s\S]{0,80}\}, \[range\?\.from, range\?\.to, row\.source\]\)/)
  })

  it('so the slider k of "Waves that move" is in the Graphing drawing, where its Slider dock looks', async () => {
    const ex = EXAMPLES.find((e) => e.title === 'Waves that move')!
    scene().setActiveSpace('graphing') // what enterMode('graphing') sets before the commands
    for (const c of ex.commands) await runCommand(c)
    const k = scene().objects[scene().ev.names.get('k')!]
    expect(visibleIn(k, 'graphing')).toBe(true)
  })

  it('says the smaller wave moves half as fast (0.5 sin(2x − k) moves k/2 while sin(x − k) moves k)', () => {
    expect(EXAMPLES.find((e) => e.title === 'Waves that move')!.tryThis).toContain('the smaller one half as fast')
  })
})

describe('the Maths screen and Expressions do not follow the student into other modes', () => {
  it('regroupWithViewport puts a split-off Maths screen back into the drawing\'s group', () => {
    const groups = { centre: { id: 'centre' }, own: { id: 'own' } }
    const moves: unknown[] = []
    const active: string[] = []
    const panel = (id: string, g: { id: string }) => ({
      id,
      api: { group: g, setActive: () => void active.push(id), moveTo: (o: unknown) => void moves.push([id, o]) }
    })
    const panels = [panel('maths', groups.own), panel('viewport', groups.centre)]
    setDockApi({ width: 1600, height: 900, panels, getPanel: (id: string) => panels.find((p) => p.id === id) } as never)
    regroupWithViewport('maths')
    expect(moves).toEqual([['maths', { group: groups.centre, position: 'center' }]])
    expect(active).toEqual(['viewport'])
    moves.length = 0
    panels[0].api.group = groups.centre
    regroupWithViewport('maths')
    expect(moves).toEqual([]) // already together: nothing moves
  })

  it('enterMode closes Maths for modes without a centre panel, and closes Expressions outside Graphing', () => {
    // A fresh fake dock for each case: the drawing, Maths split off into its own group, and Expressions open beside it.
    interface FakePanel {
      id: string
      api: { group: { id: string }; setActive: () => void; moveTo: (o: { group: { id: string } }) => void }
    }
    const dock = () => {
      const centre = { id: 'centre' }
      const own = { id: 'own' }
      const panels: FakePanel[] = []
      const add = (id: string, group: { id: string }) => {
        const p: FakePanel = { id, api: { group, setActive: () => {}, moveTo: (o) => (p.api.group = o.group) } }
        panels.push(p)
      }
      add('viewport', centre)
      add('maths', own)
      add('expressions', own)
      setDockApi({
        width: 1600,
        height: 900,
        panels,
        getPanel: (id: string) => panels.find((p) => p.id === id),
        removePanel: (p: FakePanel) => void panels.splice(panels.indexOf(p), 1)
      } as never)
      return { centre, panels, group: (id: string) => panels.find((p) => p.id === id)!.api.group }
    }
    // Graphing has no centre panel: Maths does not follow the student (One Mode = One Layout), and Expressions stays.
    // The student leaves the Calculator, where Visualize split Maths off beside the drawing.
    useApp.setState({ mode: 'calculator' })
    const g = dock()
    enterMode('graphing')
    expect(g.panels.map((p) => p.id)).not.toContain('maths')
    expect(g.panels.map((p) => p.id)).toContain('expressions')
    // Geometry has no centre panel either: Maths is closed, and Expressions is closed.
    useApp.setState({ mode: 'calculator' })
    const s = dock()
    enterMode('shapes')
    expect(s.panels.map((p) => p.id)).not.toContain('maths')
    expect(s.panels.map((p) => p.id)).not.toContain('expressions')
  })

  it('a second left panel is a tab beside the first, not a second column', () => {
    interface Added {
      id: string
      position?: { referencePanel?: string; direction?: string }
    }
    const added: Added[] = []
    buildLayout(
      {
        width: 1600,
        height: 900,
        clear: () => {},
        addPanel: (o: Added) => void added.push(o),
        getPanel: () => ({ api: { setActive: () => {} } })
      } as never,
      'graphing'
    )
    expect(added.map((a) => a.id)).toEqual(['viewport', 'examples', 'expressions'])
    // Examples is the first left panel; Expressions joins it as a tab, so only one panel opens to the left.
    expect(added.filter((a) => a.position?.direction === 'left')).toHaveLength(1)
    expect(added[2].position).toEqual({ referencePanel: 'examples', direction: 'within' })
  })
})

describe('reordering is one undo step', () => {
  it('setOrder records history; undo puts the order back', async () => {
    scene().setActiveSpace('graphing')
    await runCommand('y = x^2')
    await runCommand('y = sin(x)')
    const before = [...scene().order]
    const swapped = [...before].reverse()
    scene().setOrder(swapped)
    expect(scene().order).toEqual(swapped)
    expect(scene().dirty).toBe(true)
    scene().undo()
    expect(scene().order).toEqual(before)
  })

  it('refuses anything that is not a reordering of the same objects', async () => {
    scene().setActiveSpace('graphing')
    await runCommand('y = x^2')
    const before = [...scene().order]
    scene().setOrder([...before, 'nope'])
    scene().setOrder(before.slice(1))
    expect(scene().order).toEqual(before)
  })
})

describe('Draw only from … to …', () => {
  it('reads the range back from a drawn piecewise line, and empties back to the whole line', async () => {
    scene().setActiveSpace('graphing')
    await runCommand('y = x^2')
    const id = Object.values(scene().objects).find((o) => o.type === 'graph')!.id
    const set = rangeEdit('y = x^2', null, '0', '2')
    expect(set).toEqual({ line: 'piecewise(x^2 from 0 to 2)', note: null })
    expect(await replaceGraphEquation(id, set.line!)).toEqual({ ok: true })
    const range = rangeOf(scene().objects[id])
    expect(range).toMatchObject({ from: 0, to: 2 })
    const cleared = rangeEdit(scene().objects[id].type === 'graph' ? (scene().objects[id] as { source: string }).source : '', range, '', '')
    expect(cleared.line).toMatch(/^y = /)
    expect(await replaceGraphEquation(id, cleared.line!)).toEqual({ ok: true })
    expect(rangeOf(scene().objects[id])).toBeNull()
  })

  it('refuses in words: one end, an end that is not a number, a line that is not y = …', () => {
    expect(rangeEdit('y = x^2', null, '1', '')).toEqual({ line: null, note: EXPRESSION_WORDS.oneEnd })
    expect(rangeEdit('y = x^2', null, 'pi', '2')).toEqual({ line: null, note: EXPRESSION_WORDS.notANumber })
    expect(rangeEdit('tangent at x = 1', null, '0', '2')).toEqual({ line: null, note: EXPRESSION_WORDS.cannotRange })
    expect(rangeEdit('y = x^2', null, '−1.5', '2').line).toBe('piecewise(x^2 from −1.5 to 2)')
  })
})

describe('the answer line\'s Visualize shows the drawing it draws on', () => {
  it('draws, then brings the drawing into view (beside the Maths screen in the Calculator)', () => {
    const src = readSource('src/renderer/src/app/AnswerLine.tsx')
    expect(src).toMatch(/last\.visualize!\(\)\s*\n\s*showDrawing\(\)/)
    expect(src).toContain("useApp.getState().mode === 'calculator' ? showBeside('viewport', 'maths') : showPanel('viewport')")
  })
})

describe('Visualize on a line that is already drawn shows that graph instead of drawing it again', () => {
  const graphs = () => Object.values(scene().objects).filter((o) => o.type === 'graph')

  it('the same line twice gives one graph, selected and shown; a changed line draws its own', () => {
    scene().setActiveSpace('graphing')
    expect(visualizeGraph('y = x^2', ['x^2'], 'explicit', { reuse: true })).toBe(true)
    const id = graphs()[0].id
    scene().select([])
    scene().updateObject(id, (d) => {
      d.visible = false
    })
    expect(visualizeGraph('y = x^2', ['x^2'], 'explicit', { reuse: true })).toBe(false)
    expect(graphs()).toHaveLength(1)
    expect(scene().selection).toEqual([id])
    expect(scene().objects[id].visible).toBe(true)
    expect(visualizeGraph('y = x^2 + 1', ['x^2 + 1'], 'explicit', { reuse: true })).toBe(true)
    expect(graphs()).toHaveLength(2)
  })

  it('without reuse (a line typed in the bar) each call still draws', () => {
    scene().setActiveSpace('graphing')
    visualizeGraph('y = x^2', ['x^2'])
    visualizeGraph('y = x^2', ['x^2'])
    expect(graphs()).toHaveLength(2)
  })

  it('the answer line\'s solve Visualize marks the roots only when it drew the graph, so a second press adds nothing', () => {
    // solve() answers through the algebra engine, which these tests mock, so the wiring is read from the source.
    expect(readSource('src/renderer/src/lang/commands/solve.ts')).toMatch(/if \(visualizeGraph\(`y = \$\{l\} - \(\$\{rr\}\)`, \[`\(\$\{l\}\) - \(\$\{rr\}\)`\], 'explicit', \{ reuse: true \}\)\) roots\.forEach/)
  })

  it('every Visualize button of the Calculator asks for it, and the selected graph\'s Expressions row is marked', () => {
    const reuse = /visualizeGraph\([^\n]*\{ reuse: true \}\)/g
    expect(readSource('src/renderer/src/panels/Maths.tsx').match(reuse)).toHaveLength(4)
    expect(readSource('src/renderer/src/lang/commands/solve.ts').match(reuse)).toHaveLength(2)
    expect(readSource('src/renderer/src/panels/calcModes.tsx').match(reuse)).toHaveLength(1)
    expect(readSource('src/renderer/src/panels/Expressions.tsx')).toMatch(/const selected = useScene\(\(s\) => s\.selection\.includes\(row\.id\)\)/)
  })
})

describe('Draw only from … to …: Enter applies the range, as leaving the box does', () => {
  it('both boxes apply on Enter and on leaving, so the note is updated either way', () => {
    const boxes = readSource('src/renderer/src/panels/Expressions.tsx').match(/<input className="field w-14" value=\{(from|to)\}[^\n]*\/>/g) ?? []
    expect(boxes).toHaveLength(2)
    for (const b of boxes) {
      expect(b).toContain('onBlur={() => applyRange(from, to)}')
      expect(b).toContain("onKeyDown={(e) => e.key === 'Enter' && applyRange(from, to)}")
    }
  })
})
