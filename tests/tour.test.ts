// The tutorial's "no errors" check (parts/P-TOUR.md, check 1), run in every `npm test` from now on:
// every place a step points at exists, every mode it opens is one a student can open, every mission
// ticks by exactly the action its hint names (through the real routes, not a hand-set store) and
// never for something the student did not do, and every answer a step promises is the answer the
// app gives. A missing anchor would silently centre the card; here it fails a test instead.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: [],
  warmupCas: () => {},
  warmupCasWhenIdle: () => () => {},
  cancelCas: () => {}
}))

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k)
})

import { AFTER_SANDBOX, MISSIONS, resetMissionBaseline, TOUR } from '../src/renderer/src/app/tour/steps'
import { ALL_DONE_MESSAGE, formatMissionHint, readDone, showWorkingExample, useTour, watchMissions } from '../src/renderer/src/app/tour/Tour'
import { buildItems } from '../src/renderer/src/app/SearchPalette'
import { MODES, readyModes } from '../src/renderer/src/app/modes'
import { runCommand } from '../src/renderer/src/lang/commands'
import { scene } from '../src/renderer/src/core/store'
import { usePure } from '../src/renderer/src/math/pure/store'
import { suggestJob } from '../src/renderer/src/math/pure/run'
import { useSandbox } from '../src/renderer/src/sim/store'
import { usePracticeMission } from '../src/renderer/src/panels/practiceMission'
import { bumpAction, pressAction } from '../src/renderer/src/core/actionSignals'
import { resetGlobals } from './helpers/globals'
import { readSource } from './helpers/repo'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const mission = (id: string) => {
  const m = MISSIONS.find((x) => x.id === id)
  if (!m) throw new Error(`no mission ${id}`)
  return m
}

/** Where each anchor a mission points at must live: the panel or bar the mission's mode shows. */
const ANCHOR_HOME: Record<string, { file: string; mark: string }> = {
  'work-it-out': { file: 'src/renderer/src/panels/Maths.tsx', mark: 'data-tour="work-it-out"' },
  command: { file: 'src/renderer/src/app/CommandBar.tsx', mark: 'data-tour="command"' },
  'tool-sketch': { file: 'src/renderer/src/app/TopBar.tsx', mark: 'data-tour={`tool-${id}`}' },
  play: { file: 'src/renderer/src/panels/Sandbox.tsx', mark: 'data-tour="play"' },
  'start-practice': { file: 'src/renderer/src/panels/Practice.tsx', mark: 'data-tour="start-practice"' }
}

function fresh(): void {
  store.clear()
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  scene().setActiveSpace('vectors')
  scene().setTool('select')
  usePure.setState({ working: null })
  useSandbox.setState({ engineTime: 0 })
  usePracticeMission.getState().reset()
  resetMissionBaseline()
}
beforeEach(fresh)

const doneIds = () => MISSIONS.filter((m) => m.done()).map((m) => m.id)

describe('the six missions point at real things', () => {
  it('there are six, in the order of the design note', () => {
    expect(MISSIONS.map((m) => m.mode)).toEqual(['calculator', 'graphing', 'vectors', 'shapes', 'sandbox', 'problems'])
  })

  it('every anchor is a data-tour name in the file of the screen the mission opens', () => {
    for (const m of MISSIONS) {
      const home = ANCHOR_HOME[m.anchor]
      expect(home, `${m.id}: no known home for anchor ${m.anchor}`).toBeDefined()
      expect(readSource(home.file), `${m.id}: ${home.mark} missing from ${home.file}`).toContain(home.mark)
    }
  })

  it('every anchor sits on a screen its mode really shows', () => {
    const byId = Object.fromEntries(MODES.map((d) => [d.id, d]))
    expect(byId.calculator.centre).toBe('maths') // work-it-out is on the Maths screen
    expect(byId.sandbox.panel).toBe('sandbox') // play is in the Sandbox panel
    expect(byId.problems.panel).toBe('practice') // start-practice is in Practice
    expect(byId.shapes.tools).toContain('sketch') // tool-sketch: the shelf draws a button per tool of the mode
  })

  it('every mode a mission opens is ready and not hidden', () => {
    const ready = readyModes().map((d) => d.id)
    for (const m of MISSIONS) expect(ready, m.id).toContain(m.mode)
  })

  it('every anchor of the spotlight tour exists somewhere in the app', () => {
    const files = ['app/CommandBar.tsx', 'app/TopBar.tsx', 'panels/Measurements.tsx', 'panels/Sandbox.tsx', 'render/Viewport.tsx'].map((f) => readSource(`src/renderer/src/${f}`)).join('\n')
    for (const s of TOUR) if (s.anchor) expect(files, s.anchor).toContain(`data-tour="${s.anchor}"`)
  })
})

describe('every mission ticks by exactly the action its hint names', () => {
  it('1 Show your working: Work it out on 6x^2 + 7x - 3 (exactly as the hint types it) picks Factorise and ticks', () => {
    const m = mission('calc')
    expect(m.hint).toContain('6x^2 + 7x - 3') // the keyboard's minus: what the student really types
    expect(suggestJob('6x^2 + 7x - 3')).toBe('factor') // Work it out chooses Factorise itself
    expect(m.done()).toBe(false)
    usePure.getState().run('factor', '6x^2 + 7x - 3')
    expect(usePure.getState().working?.error).toBeFalsy()
    expect(m.done()).toBe(true)
  })

  it('1 a refusal is not a working: it does not tick', () => {
    usePure.getState().run('factor', 'x +* 2')
    expect(usePure.getState().working).not.toBeNull()
    expect(mission('calc').done()).toBe(false)
  })

  it('1 the Welcome tile\'s worked example is PhysLab\'s run, not the student\'s: it does not tick (B2B-FALSE-01)', () => {
    // Through the app's own watcher, which run() calls inside its set(): the old check read done()
    // only after the tile had finished, so it passed while the browser ticked mission 1.
    const ticked: string[] = []
    const stop = watchMissions((id) => ticked.push(id))
    try {
      showWorkingExample() // the Welcome tile "Show your working"
      expect(usePure.getState().working?.moves.length).toBeGreaterThan(0) // it did show steps
      expect(ticked).not.toContain('calc')
      expect(mission('calc').done()).toBe(false)
      // The student's own Work it out afterwards still ticks, through the same watcher.
      usePure.getState().run('factor', '6x^2 + 7x - 3')
      expect(ticked).toContain('calc')
    } finally {
      stop()
    }
  })

  it('2 Draw a graph: a line typed in Graphing\'s Expressions list counts as typed too (P-GCALC)', () => {
    const src = readSource('src/renderer/src/panels/Expressions.tsx')
    expect(src).toMatch(/const before = graphCount\(\)\s*\n\s*await runCommand\(text\)[\s\S]{0,160}if \(graphCount\(\) > before\) bumpAction\('typedGraphs'\)/)
    // Mission 2's hint still names a control that exists: the command bar stays at the top.
    expect(mission('graph').hint).toContain('in the bar at the top')
    expect(readSource('src/renderer/src/app/App.tsx')).toMatch(/<CommandBar \/>/)
  })

  it('2 Draw a graph: a graph typed in the command bar ticks; one loaded with a file does not', async () => {
    const m = mission('graph')
    await runCommand('y = x^2') // as a file or Examples lesson would put it there
    expect(m.done()).toBe(false)
    // The command bar's own route: it counts a line that made a graph (app/CommandBar.tsx submit).
    const bar = readSource('src/renderer/src/app/CommandBar.tsx')
    expect(bar).toMatch(/const graphsBefore = graphCount\(\)\s*\n\s*await runCommand\(v\)[\s\S]{0,200}if \(graphCount\(\) > graphsBefore\) bumpAction\('typedGraphs'\)/)
    await runCommand('y = x^2 − 4')
    bumpAction('typedGraphs')
    expect(scene().log.filter((l) => l.kind === 'error')).toEqual([])
    expect(m.done()).toBe(true)
  })

  it('3 Draw a vector and drag it: typing or retyping a vector is not enough; a head drag with the Move tool is', async () => {
    const m = mission('vector')
    await runCommand('A = <5, 1>')
    await runCommand('A = <3, 4>') // retyped: the same object, new numbers, no drag
    expect(m.done()).toBe(false)
    expect(pressAction('vector', 'head')).toBe('headDrags') // what Interaction reports for a head drag
    expect(pressAction('vector', 'click')).toBeNull()
    bumpAction('headDrags')
    expect(m.done()).toBe(true)
  })

  it('4 Find the area of a shape: the Sketch tool\'s own selection does not tick; a click or tap with the Move tool does, even on the shape already selected', async () => {
    const m = mission('geometry')
    scene().setActiveSpace('shapes')
    await runCommand('Polygon((0, 0), (4, 0), (4, 3), (0, 3))')
    const poly = Object.values(scene().objects).find((o) => o.type === 'polygon')!
    scene().select([poly.id]) // the Sketch tool selects the shape it has just made
    expect(m.done()).toBe(false)
    // Move tool, then a tap on the same, already selected shape: no new selection, but a click.
    expect(pressAction('polygon', 'click')).toBe('shapeClicks')
    expect(pressAction('circle', 'click')).toBe('shapeClicks')
    expect(pressAction('polygon', 'body')).toBe('shapeClicks') // a tap that drifted into a small drag
    expect(pressAction('segment', 'click')).toBeNull()
    bumpAction('shapeClicks')
    expect(m.done()).toBe(true)
    scene().select([])
    expect(m.done()).toBe(false) // no shape selected, no area on screen
  })

  it('4 Interaction reports both kinds of Move-tool press', () => {
    const src = readSource('src/renderer/src/render/Interaction.tsx')
    expect(src).toContain("signalAction(s, d.hit.id, d.moved ? d.hit.part : 'click')")
    expect(src).toContain("if (dn.hit && Math.hypot(x - dn.x, y - dn.y) < 3) signalAction(s, dn.hit.id, 'click')")
  })

  it('5 Run an experiment: Play, then Reset; a preset load (clock to 0, runNonce up) is not Reset', () => {
    const m = mission('sandbox')
    expect(m.done()).toBe(false)
    useSandbox.setState({ engineTime: 1.5 }) // the run has played
    expect(m.done()).toBe(false)
    useSandbox.setState({ engineTime: 0, runNonce: useSandbox.getState().runNonce + 1 }) // a preset loaded
    expect(m.done()).toBe(false)
    useSandbox.getState().resetRun() // the Reset button
    expect(m.done()).toBe(true)
  })

  it('5 Reset without having played does not tick, and nothing about a run is stored', () => {
    useSandbox.getState().resetRun()
    expect(mission('sandbox').done()).toBe(false)
    // A played run, then Reset: the mission ticks from memory, and the store is written for nothing.
    store.clear()
    useSandbox.setState({ engineTime: 1.5 })
    expect(mission('sandbox').done()).toBe(false) // records the run as played
    useSandbox.getState().resetRun()
    expect(mission('sandbox').done()).toBe(true)
    expect([...store.keys()]).toEqual([])
    // Nor does anything else in the tour's steps: every mission is asked, and the baseline is reset.
    for (const m of MISSIONS) m.done()
    resetMissionBaseline()
    expect([...store.keys()]).toEqual([])
  })

  it('6 Answer a question: checking an answer marks it; a proof-only question ticks when its model proof is shown', () => {
    const src = readSource('src/renderer/src/panels/Practice.tsx')
    expect(src).toMatch(/verdict !== 'empty'\)\) usePracticeMission\.getState\(\)\.mark\(\)/)
    expect(src).toMatch(/if \(unmarked\) usePracticeMission\.getState\(\)\.mark\(\)/)
    expect(mission('practice').done()).toBe(false)
    usePracticeMission.getState().mark()
    expect(mission('practice').done()).toBe(true)
  })
})

describe('progress', () => {
  it('is kept under its own key: old Practice-task ticks (calc, graph, vector) tick nothing', () => {
    store.set('physlab.missionsDone', JSON.stringify(['calc', 'graph', 'vector']))
    expect(readDone()).toEqual([])
    store.set('physlab.startHereDone', JSON.stringify(['graph']))
    expect(readDone()).toEqual(['graph'])
  })

  it('Start over clears every tick, and the next store change does not bring them back', async () => {
    usePure.getState().run('factor', '6x^2 + 7x - 3')
    await runCommand('y = x^2')
    bumpAction('typedGraphs')
    expect(doneIds()).toEqual(['calc', 'graph'])
    useTour.getState().hideChip()
    useTour.getState().startOver()
    expect(useTour.getState().done).toEqual([])
    expect(useTour.getState().chipHidden).toBe(false)
    useSandbox.setState({ engineTime: 0 }) // any store change re-runs the checks
    expect(doneIds()).toEqual([])
  })
})

describe('the words', () => {
  const words = [...MISSIONS.flatMap((m) => [m.label, m.hint]), ALL_DONE_MESSAGE, AFTER_SANDBOX]

  it('are plain English: no LaTeX, no code, every hint a sentence', () => {
    for (const w of words) expect(w, w).not.toMatch(/\\|\$|[{}]|=>|\(\)/)
    for (const m of MISSIONS) expect(m.hint, m.id).toMatch(/\.$/)
  })

  it('never name the removed modes, nor the old Help line', () => {
    for (const w of [...words, ...TOUR.flatMap((s) => [s.title, s.body])]) expect(w).not.toMatch(/Question Author|Class Results|Practice tasks/)
    const rows = buildItems()
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.title, `${r.group}: ${r.title}`).not.toMatch(/Practice tasks/)
      expect(r.hint, `${r.group}: ${r.title}`).not.toMatch(/Practice tasks/)
    }
    expect(readSource('src/renderer/src/app/TopBar.tsx')).not.toMatch(/'Practice tasks'/)
  })

  it('every Help ▸ … a step names is a real Help menu line', () => {
    const help = readSource('src/renderer/src/app/TopBar.tsx')
    const lines = ['Take the tour', 'Start here', 'Keyboard and mouse']
    for (const line of lines) expect(help, line).toContain(`label: '${line}'`)
    for (const w of [...words, ...TOUR.map((s) => s.body)])
      for (const m of w.matchAll(/Help ▸ /g)) {
        const after = w.slice((m.index ?? 0) + 'Help ▸ '.length)
        expect(lines.some((l) => after.startsWith(l)), w).toBe(true)
      }
  })

  it('say where the command bar really is (it is at the top of the window)', () => {
    expect(readSource('src/renderer/src/app/App.tsx')).toMatch(/<ToolShelf \/>\s*<CommandBar \/>\s*<div className="min-h-0 flex-1">/)
    for (const w of words) expect(w).not.toMatch(/bar at the bottom/)
  })

  it('use touch words on a touch screen', () => {
    expect(formatMissionHint(mission('vector').hint, true)).toBe('Type A = <3, 4> and press Enter. Then slide the tip of the arrow with your finger.')
    expect(formatMissionHint(mission('geometry').hint, true)).toBe(
      'Pick the Sketch tool and draw a rough rectangle. Tap the Move tool, then tap the rectangle to see its area and the formula in the Measure panel.'
    )
    expect(formatMissionHint(mission('vector').hint, false)).toBe(mission('vector').hint)
  })

  it('Esc closes the card only from inside it (mission 4 asks for Esc)', () => {
    expect(readSource('src/renderer/src/app/tour/Tour.tsx')).toContain("e.key === 'Escape' && cardRef.current?.contains(document.activeElement)")
  })
})

describe('the answers the missions promise', () => {
  it('6x^2 + 7x − 3 factorises to (2x + 3)(3x − 1)', () => {
    usePure.getState().run('factor', '6x^2 + 7x − 3')
    const tex = (usePure.getState().working?.answers ?? []).map((a) => a.tex.replace(/\\left|\\right|\s+/g, '')).join(' ')
    expect(tex).toMatch(/\(2x\+3\)\(3x-1\)|\(3x-1\)\(2x\+3\)/)
  })

  it('A = <3, 4> is the vector the hint types', async () => {
    await runCommand('A = <3, 4>')
    const a = scene().objects[scene().ev.names.get('A')!]
    expect(a.type === 'vector' && a.def.kind === 'free' ? a.def.comp.slice(0, 2) : null).toEqual([3, 4])
  })
})

describe('af-tb1 — the six missions\' shape and words', () => {
  // P-TOUR TB1 (crew-built, reviewed): the six missions' shape and words. What makes each mission
  // tick — through the real routes, and never for something the student did not do — is in
  // tests/tour.test.ts.

  function filesUnder(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) out.push(...filesUnder(p))
      else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
    }
    return out
  }

  describe('Option B missions: shape and wording', () => {
    it('every mission anchor is a data-tour name in the source (a literal or the tool shelf\'s tool-<id>)', () => {
      const contents = filesUnder(join(__dirname, '../src/renderer/src'))
        .map((f) => readFileSync(f, 'utf8'))
        .join('\n')
      for (const m of MISSIONS) {
        if (/^tool-/.test(m.anchor)) expect(contents).toContain('data-tour={`tool-${id}`}')
        else expect(contents).toContain(`data-tour="${m.anchor}"`)
      }
    })

    it('every hint is plain English with no LaTeX and no code', () => {
      for (const m of MISSIONS) {
        expect(m.hint).toBe(m.hint.trim())
        expect(m.hint).toMatch(/\.$/)
        expect(m.hint).not.toMatch(/\\|\$|\{|}|=>|className=/)
      }
    })
  })
})

describe('af-tb2 — the Start here chip, card and exact words', () => {
  const tourSource = () => readSource('src/renderer/src/app/tour/Tour.tsx')
  const topBarSource = () => readSource('src/renderer/src/app/TopBar.tsx')

  describe('the Start here chip', () => {
    beforeEach(() => {
      useTour.getState().startOver()
    })

    it('keeps count of done missions and exposes its hidden state', () => {
      const state = useTour.getState()
      expect(state.done.length).toBe(0)
      expect(state.chipHidden).toBe(false)

      state.markDone(MISSIONS[0].id)
      expect(useTour.getState().done.length).toBe(1)
      expect(useTour.getState().done).toContain(MISSIONS[0].id)
      expect(useTour.getState().chipHidden).toBe(false)
    })

    it('can be hidden and brought back', () => {
      useTour.getState().setChipHidden(true)
      expect(useTour.getState().chipHidden).toBe(true)

      useTour.getState().setChipHidden(false)
      expect(useTour.getState().chipHidden).toBe(false)

      useTour.getState().hideChip()
      expect(useTour.getState().chipHidden).toBe(true)

      useTour.getState().startOver()
      expect(useTour.getState().chipHidden).toBe(false)
    })

    it('disappears only when all missions are done or the student hides it', () => {
      // The chip's own rule, in its source: hidden, or every mission counted.
      expect(tourSource()).toContain('if (chipHidden || count >= MISSIONS.length) return null')
      for (const m of MISSIONS) useTour.getState().markDone(m.id)
      expect(MISSIONS.every((m) => useTour.getState().done.includes(m.id))).toBe(true)
    })
  })

  describe('the Start here card', () => {
    it('shows the exact all-done sentence word for word', () => {
      expect(ALL_DONE_MESSAGE).toBe('All done. You have used every part of PhysLab you need to start. Help ▸ Start here brings this list back.')
    })

    it('has Hide, Start over and Show me controls', () => {
      const src = tourSource()
      // The words as button text, not as a word in a comment.
      expect(src).toMatch(/>\s*Hide\s*<\/button>/)
      expect(src).toMatch(/>\s*Start over\s*<\/button>/)
      expect(src).toMatch(/>\s*Show me\s*<\/button>/)
    })
  })

  describe('exact words on the screens', () => {
    it('Welcome screen has the third button "Start here (6 missions)"', () => {
      expect(tourSource()).toContain('Start here (6 missions)')
    })

    it('Help menu has the "Start here" line', () => {
      expect(topBarSource()).toMatch(/label:\s*'Start here'/)
    })

    it('top-bar chip says "Start here N of 6"', () => {
      expect(tourSource()).toContain('Start here {count} of {MISSIONS.length}')
    })
  })
})
