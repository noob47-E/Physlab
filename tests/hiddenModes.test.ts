// Question Author and Class Results were kept out of every student's reach from 2026-10-01 and taken
// out of the app in 0.9 (owner, 2026-10-06; archived at the tag archive/question-author-0.9). Each
// test below is a way a student could have got to either of them, so a door left by accident fails
// here. ONE switch, HIDDEN_MODES in app/modes.ts, still hides a mode that is not ready; it is empty
// today, and the last group shows it still works as one switch.
//
// Pure, no DOM: pages are read as text, the dock is a plain object with the few members panels.ts
// uses, and the Ctrl+K rows are built and pressed for real with only enterMode stood in for.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DockviewApi } from 'dockview-react'
import {
  HIDDEN_MODES,
  MODES,
  comingSoonModes,
  hiddenPanels,
  isModeHidden,
  modeById,
  openableMode,
  readyModes,
  useApp,
  type ModeId
} from '../src/renderer/src/app/modes'
import { PANEL_LIST, PANEL_TITLES, dropHiddenPanels, isPanelHidden, panelList, setDockApi, showPanel, togglePanel, useOpenPanels } from '../src/renderer/src/app/panels'
import { scene } from '../src/renderer/src/core/store'
import type { SceneObject } from '../src/renderer/src/core/types'
import { modeOfSpace } from '../src/renderer/src/core/visibility'
import { RESULT_FORMAT, buildResultFile, serializeResultFile } from '../src/renderer/src/questions/results'
import { TOOLS } from '../src/renderer/src/render/tools'
import { RENDERER_SRC, readSource, repoPath } from './helpers/repo'

// Every mode change from a Ctrl+K row goes through layout.ts's enterMode, which wakes the renderer
// and the CAS. Standing it in for records which mode a row asked for, and nothing else is faked.
const { entered } = vi.hoisted(() => ({ entered: [] as string[] }))
vi.mock('../src/renderer/src/app/layout', () => ({ enterMode: (id: string) => void entered.push(id) }))

/** The requirement itself: the two modes and the two panels they owned, which this build no longer has. */
const HIDDEN_MODE_IDS: string[] = ['author', 'results']
const HIDDEN_PANEL_IDS = ['author', 'classresults']
const REFUSAL = 'Class results are not part of PhysLab.'

/** The few parts of dockview that panels.ts touches, as a plain object a node test can hold. */
function fakeDock(open: string[]) {
  const activated: string[] = []
  const panels: { id: string; api: { setActive: () => void } }[] = []
  const make = (id: string) => ({ id, api: { setActive: () => void activated.push(id) } })
  for (const id of open) panels.push(make(id))
  const api = {
    panels,
    width: 1600,
    height: 900,
    getPanel: (id: string) => panels.find((p) => p.id === id),
    addPanel: (opts: { id: string }) => {
      const p = make(opts.id)
      panels.push(p)
      return p
    },
    removePanel: (p: { id: string }) => {
      const i = panels.findIndex((x) => x.id === p.id)
      if (i >= 0) panels.splice(i, 1)
    }
  }
  return { api: api as unknown as DockviewApi, activated, ids: () => panels.map((p) => p.id) }
}

/** A yes/no about a page's text, so a failure names the check instead of printing the whole file. */
const has = (text: string, re: RegExp): boolean => re.test(text)

/** app/files.ts reads the desktop bridge off `window` as it loads; a node test has none, so it gets an empty one. */
async function importFiles(): Promise<typeof import('../src/renderer/src/app/files')> {
  vi.stubGlobal('window', globalThis)
  try {
    return await import('../src/renderer/src/app/files')
  } finally {
    vi.unstubAllGlobals()
  }
}

/** Every .ts/.tsx file of the renderer, as { path from the renderer's src folder with / slashes, text }. */
function rendererSources(): { rel: string; text: string }[] {
  const out: { rel: string; text: string }[] = []
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(e.name)) out.push({ rel: relative(RENDERER_SRC, p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') })
    }
  }
  walk(RENDERER_SRC)
  return out
}

const point = (id: string, name: string, p: [number, number, number]): SceneObject => ({ id, name, visible: true, locked: false, color: '#000', showLabel: true, type: 'point', def: { kind: 'free', p } })

beforeEach(() => {
  scene().newScene()
  scene().clearLog()
  entered.length = 0
})

afterEach(() => {
  setDockApi(null)
  useApp.setState({ mode: 'vectors' })
})

// ---------------------------------------------------------------------------------------------
// M1 — no entry point leads to either mode
// ---------------------------------------------------------------------------------------------

describe('a student cannot reach Question Author or Class Results', () => {
  // M1a
  describe('from the top bar', () => {
    it('sees no tab for either mode', () => {
      const ids = readyModes().map((m) => m.id)
      for (const id of HIDDEN_MODE_IDS) expect(ids, id).not.toContain(id)
      // …and every mode a student does use is still a tab.
      expect(ids).toEqual(expect.arrayContaining(['calculator', 'vectors', 'shapes', 'graphing', 'sandbox', 'gpu', 'lab', 'problems']))
    })

    it('sees neither under More modes, not even as a "(coming soon)" row', () => {
      const ids = comingSoonModes().map((m) => m.id)
      for (const id of HIDDEN_MODE_IDS) expect(ids, id).not.toContain(id)
      // The announced modes are exactly the ones that are not ready: nothing else was dropped.
      expect(ids).toEqual(MODES.filter((m) => !m.ready).map((m) => m.id))
    })

    it('has a bar that builds its tabs and its coming-soon rows only from the lists that leave them out', () => {
      const bar = readSource('src/renderer/src/app/TopBar.tsx')
      expect(has(bar, /const ready = readyModes\(\)/), 'TopBar builds `ready` from readyModes()').toBe(true)
      expect(has(bar, /const later = comingSoonModes\(\)/), 'TopBar builds `later` from comingSoonModes()').toBe(true)
      expect(has(bar, /MODES\.filter\(/), 'TopBar filters MODES itself').toBe(false)
    })
  })

  // M1b
  describe('from the View menu', () => {
    it('sees no row for the Author or the Class Results panel', () => {
      const ids = PANEL_LIST.map((p) => p.id)
      for (const id of HIDDEN_PANEL_IDS) expect(ids, id).not.toContain(id)
      expect(ids).toEqual(expect.arrayContaining(['viewport', 'practice', 'sandbox', 'labdata']))
    })

    it('has menus that list panels from PANEL_LIST, never from the full table of titles', () => {
      expect(has(readSource('src/renderer/src/app/TopBar.tsx'), /PANEL_TITLES/), 'TopBar lists panels from PANEL_TITLES').toBe(false)
      expect(has(readSource('src/renderer/src/app/SearchPalette.tsx'), /PANEL_TITLES/), 'SearchPalette lists panels from PANEL_TITLES').toBe(false)
    })

    it('opens neither panel when something asks for it, and brings nothing forward', () => {
      const dock = fakeDock(['viewport', 'practice'])
      setDockApi(dock.api)
      showPanel('author')
      showPanel('classresults')
      expect(dock.ids()).toEqual(['viewport', 'practice'])
      expect(dock.activated).toEqual([])
      // The View menu's row and Ctrl+K's Panels row both end here: still nothing.
      togglePanel('author')
      togglePanel('classresults')
      expect(dock.ids()).toEqual(['viewport', 'practice'])
      expect(dock.activated).toEqual([])
    })

    it('does not even bring forward a copy a saved layout left behind', () => {
      const dock = fakeDock(['viewport', 'author', 'classresults'])
      setDockApi(dock.api)
      showPanel('author')
      showPanel('classresults')
      expect(dock.activated).toEqual([])
    })

    it('still opens every other panel the same way, Practice for one', () => {
      const dock = fakeDock(['viewport'])
      setDockApi(dock.api)
      showPanel('practice')
      expect(dock.ids()).toEqual(['viewport', 'practice'])
      expect(dock.activated).toEqual(['practice'])
    })
  })

  // M1c
  describe('from Ctrl+K', () => {
    let palette: typeof import('../src/renderer/src/app/SearchPalette')
    // Built in each test, not once in beforeAll: a missing export then fails every test by name
    // instead of failing the hook and skipping them.
    const rows = () => palette.buildItems()

    beforeAll(async () => {
      palette = await import('../src/renderer/src/app/SearchPalette')
    }, 120_000)

    it('has no row called Question Author, Class Results or Author', () => {
      const names = ['Question Author', 'Class Results', 'Author']
      for (const r of rows()) expect(names, `${r.group}: ${r.title}`).not.toContain(r.title)
    })

    it('finds nothing that mentions them, in a title or a hint', () => {
      for (const r of rows()) {
        expect(r.title, `${r.group}: ${r.title}`).not.toMatch(/question author|class results/i)
        expect(r.hint, `${r.group}: ${r.title}`).not.toMatch(/question author|class results/i)
      }
    })

    it('lists under Modes exactly the modes the top bar shows, and each row opens its own mode', () => {
      const modeRows = rows().filter((r) => r.group === 'Modes')
      expect(modeRows.map((r) => r.title)).toEqual(readyModes().map((m) => m.label))
      readyModes().forEach((m, i) => {
        entered.length = 0
        modeRows[i].run()
        expect(entered, m.label).toEqual([m.id])
      })
    })

    it('lists under Panels exactly the View menu panels', () => {
      expect(rows().filter((r) => r.group === 'Panels').map((r) => r.title)).toEqual(PANEL_LIST.map((p) => p.title))
    })

    it('has a Tools row that switches to the first mode a student can open with that tool', () => {
      const src = readSource('src/renderer/src/app/SearchPalette.tsx')
      // SC: the pick moved into modeForTool, which still searches readyModes() and skips centre-panel modes.
      expect(has(src, /return readyModes\(\)\.find\(shows\)/), 'the Tools row picks its mode from readyModes()').toBe(true)
      expect(has(src, /MODES\.find\(\(m\) => m\.ready/), 'the Tools row picks its mode from all of MODES').toBe(false)
      for (const t of TOOLS) {
        const first = readyModes().find((m) => m.tools.includes(t.id))
        if (first) expect(HIDDEN_MODE_IDS, `${t.label} would open ${first.label}`).not.toContain(first.id)
      }
      // The same pick, run: from every mode, each tool gives null (the mode already shows it, or no ready
      // mode does) or a ready mode with no centre panel, not hidden, that shows the tool.
      for (const from of MODES.map((m) => m.id)) {
        for (const t of TOOLS) {
          const got = palette.modeForTool(t.id, from)
          if (got === null) {
            const here = modeById(from)
            const hereShows = !here.centre && (here.tools as string[]).includes(t.id)
            const anyShows = readyModes().some((m) => !m.centre && (m.tools as string[]).includes(t.id))
            expect(hereShows || !anyShows, `${t.label} from ${from}: null though a mode shows it`).toBe(true)
            continue
          }
          expect(readyModes().map((m) => m.id), `${t.label} from ${from}: ${got}`).toContain(got)
          expect(isModeHidden(got), `${t.label} from ${from}: ${got}`).toBe(false)
          expect(modeById(got).centre, `${t.label} from ${from}: ${got} has a centre panel`).toBeUndefined()
          expect(modeById(got).tools as string[], `${t.label} from ${from}: ${got}`).toContain(t.id)
        }
      }
    })

    it('never sends a Tools row to a hidden mode when it is pressed', () => {
      // From the Sandbox, whose shelf holds only Select, every other tool has to go somewhere.
      useApp.setState({ mode: 'sandbox' })
      const toolRows = rows().filter((r) => r.group === 'Tools')
      expect(toolRows).toHaveLength(TOOLS.length)
      const everywhere: string[] = []
      for (const r of toolRows) {
        entered.length = 0
        r.run()
        for (const id of entered) expect(HIDDEN_MODE_IDS, `${r.title} opened ${id}`).not.toContain(id)
        everywhere.push(...entered)
      }
      expect(everywhere.length).toBeGreaterThan(0)
    })
  })

  // M1d
  describe('from the keyboard', () => {
    it('has no key that switches mode at all', () => {
      const keys = readSource('src/renderer/src/app/shortcuts.ts')
      expect(has(keys, /enterMode\(/), 'a shortcut calls enterMode(').toBe(false)
      expect(has(keys, /\.setMode\(/), 'a shortcut calls .setMode(').toBe(false)
    })
  })

  // M1e
  describe('from a button, an example, a link or the command bar', () => {
    it('finds no place in the app that opens either mode or either panel by name', () => {
      // Their own panels, and the two files that define the modes and panels, may name them.
      const own = (rel: string) => /^panels\/Author[^/]*\.tsx$/.test(rel) || rel === 'panels/ClassResults.tsx' || rel === 'app/modes.ts' || rel === 'app/panels.ts'
      const opens = /\b(?:enterMode|setMode|requestFocus|showPanel|togglePanel|focusPanel)\(\s*['"`](?:author|results|classresults)['"`]/
      const sets = /\bmode:\s*['"`](?:author|results)['"`]/
      const files = rendererSources()
      expect(files.length).toBeGreaterThan(100)
      const leaks = files.filter((f) => !own(f.rel) && (opens.test(f.text) || sets.test(f.text))).map((f) => f.rel)
      expect(leaks).toEqual([])
    })

    it('has Outliner "go to" buttons that lead only to the drawings a student can open', () => {
      for (const id of Object.values(modeOfSpace)) expect(HIDDEN_MODE_IDS, id).not.toContain(id)
    })
  })

  // M1f
  describe('from the welcome screen and the tour', () => {
    let steps: typeof import('../src/renderer/src/app/tour/steps')

    beforeAll(async () => {
      steps = await import('../src/renderer/src/app/tour/steps')
    }, 120_000)

    it('only goes to modes a student can open', () => {
      // Tour.tsx's own mode literals (the Welcome tiles) stay a text check.
      const file = 'src/renderer/src/app/tour/Tour.tsx'
      const literals = [...readSource(file).matchAll(/\bmode:\s*'(\w+)'/g)].map((m) => m[1])
      expect(literals.length, file).toBeGreaterThan(0)
      for (const id of literals) {
        expect(MODES.some((m) => m.id === id), `${file}: ${id}`).toBe(true)
        expect(HIDDEN_MODE_IDS, `${file}: ${id}`).not.toContain(id)
      }
      // steps.ts: every `mode:` literal in it sits in TOUR (two steps) or MISSIONS (six), so these are all of them.
      const carried = [...steps.TOUR, ...steps.MISSIONS].map((s) => s.mode).filter((m): m is ModeId => m !== undefined)
      expect(carried.length).toBeGreaterThan(0)
      for (const id of carried) {
        expect(readyModes().map((m) => m.id), `steps.ts: ${id}`).toContain(id)
        expect(isModeHidden(id), `steps.ts: ${id}`).toBe(false)
        expect(HIDDEN_MODE_IDS, `steps.ts: ${id}`).not.toContain(id)
      }
    })
  })

  // M1g
  describe('from a file', () => {
    let files: typeof import('../src/renderer/src/app/files')

    beforeAll(async () => {
      files = await importFiles()
    }, 120_000)

    const resultText = () => serializeResultFile(buildResultFile({ setId: 'physics-mechanics', setTitle: 'Mechanics', student: 'Aisha', items: [] }))

    it('is told "not part of PhysLab" when the file is a class-results file by name, in any letter case', () => {
      for (const name of ['class.pqresult', 'CLASS.PQRESULT', 'Set 1.PqResult', 'C:\\Users\\Aisha\\Desktop\\set1.pqresult', '/home/aisha/set1.pqresult']) {
        expect(files.classResultsFileText(name, ''), name).toBe(REFUSAL)
      }
    })

    it('is told the same when the file is a class-results file by what is inside, whatever it is called', () => {
      for (const name of ['results.json', 'results.txt', 'results', 'lesson.phys', 'forces.pqjson']) {
        expect(files.classResultsFileText(name, resultText()), name).toBe(REFUSAL)
      }
      expect(files.classResultsFileText('r.txt', '{"app":"PhysLab","format":"pqresult","version":1}')).toBe(REFUSAL)
      expect(RESULT_FORMAT).toBe('pqresult')
    })

    it('is not stopped when the file is a project, a question file or a Numbas exam', () => {
      const project = JSON.stringify(scene().serialize())
      const questions = readFileSync(repoPath('src', 'renderer', 'src', 'questions', 'bank', 'sample.pqjson'), 'utf8')
      const exam = '// Numbas version: exam_results_page_options\n{"name":"Forces","questions":[]}'
      expect(files.classResultsFileText('lesson.phys', project)).toBeNull()
      expect(files.classResultsFileText('sample.pqjson', questions)).toBeNull()
      expect(files.classResultsFileText('forces.exam', exam)).toBeNull()
    })

    it('is not stopped by text that only looks a little like a result file', () => {
      for (const text of ['{"app":"PhysLab","format":"pqjson","version":1,"questions":[]}', '{"app":"Other","format":"pqresult"}', '{"format":"pqresult"}', '[]', 'null', '{"app":', '']) {
        expect(files.classResultsFileText('notes.json', text), text).toBeNull()
      }
    })

    it('sees a class-results file opened as a project say so in the console and load nothing', () => {
      scene().addObjects([point('mP', 'P', [1, 2, 0])])
      useApp.setState({ mode: 'graphing' })
      const before = { order: [...scene().order], filePath: scene().filePath, dirty: scene().dirty }
      scene().clearLog()
      files.loadProjectText(resultText(), 'class.pqresult')
      expect(scene().log).toHaveLength(1)
      expect(scene().log[0]).toMatchObject({ input: 'open', kind: 'error', text: REFUSAL })
      expect({ order: scene().order, filePath: scene().filePath, dirty: scene().dirty }).toEqual(before)
      expect(useApp.getState().mode).toBe('graphing')
    })

    it('still opens a project, and still explains a broken one, as before', () => {
      scene().addObjects([point('mP', 'P', [1, 2, 0])])
      const text = JSON.stringify(scene().serialize())
      scene().newScene()
      scene().clearLog()
      files.loadProjectText(text, 'lesson.phys')
      expect(scene().order).toEqual(['mP'])
      expect(scene().filePath).toBe('lesson.phys')
      expect(scene().log.map((l) => [l.kind, l.text])).toEqual([['info', 'Opened lesson.phys']])
      scene().clearLog()
      files.loadProjectText('{"app":', 'broken.phys')
      expect(scene().log[0]).toMatchObject({ kind: 'error', text: 'Could not open broken.phys: This file cannot be read: it is not complete, or it is not a PhysLab project.' })
    })

    it('has both ways of picking a project go through that check', () => {
      const src = readSource('src/renderer/src/app/files.ts')
      // The desktop dialog and the browser's file input both end in loadProjectText; the old
      // private `load` is gone, so no call can skip the check.
      expect(src.match(/(?<![\w.])load\(/g) ?? [], 'a call that skips loadProjectText').toEqual([])
      expect(src.match(/\bloadProjectText\(/g)?.length).toBeGreaterThanOrEqual(3)
    })

    it('is refused in a sentence, and not read as a question set, when picked as a question file in Problem Sets', () => {
      const src = readSource('src/renderer/src/panels/Practice.tsx')
      // From the function's first line to its own closing brace, the first one indented two spaces.
      const open = src.match(/const openFile = async \(\) => \{[\s\S]*?\n {2}\}\n/)?.[0] ?? ''
      expect(open, 'Practice.tsx openFile was not found').toContain('loadTeacherFile(')
      expect(open, 'openFile never asks classResultsFileText').toContain('classResultsFileText(')
      expect(open.indexOf('classResultsFileText('), 'the refusal must come before the file is read as a set').toBeLessThan(open.indexOf('loadTeacherFile('))
      expect(has(open, /useTeacherSets\.setState\(\{ error: refused, report: \[\] \}\)/), 'the refusal is shown as the panel error').toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------------------------
// M2 — a layout or a session saved while they could be opened
// ---------------------------------------------------------------------------------------------

describe('a session saved in Question Author or Class Results', () => {
  it('opens in Problem Sets, the visible mode nearest to both', () => {
    expect(openableMode('author')).toBe('problems')
    expect(openableMode('results')).toBe('problems')
    expect(readyModes().map((m) => m.id)).toContain(openableMode('author'))
  })

  it('opens every other saved mode as it was', () => {
    for (const m of MODES) {
      if (!HIDDEN_MODE_IDS.includes(m.id)) expect(openableMode(m.id), m.id).toBe(m.id)
    }
  })

  it('has both panels taken out of the saved layout, and the window still has its other panels', () => {
    const dock = fakeDock(['viewport', 'classresults', 'author'])
    setDockApi(dock.api)
    expect(dropHiddenPanels()).toBe(true)
    expect(dock.ids()).toEqual(['viewport'])
    // The View menu reads this list, so it follows what the layout really holds.
    expect(useOpenPanels.getState().open).toEqual(['viewport'])
  })

  it('leaves a layout that never held them exactly as it was', () => {
    const dock = fakeDock(['viewport', 'practice', 'sandbox'])
    setDockApi(dock.api)
    expect(dropHiddenPanels()).toBe(true)
    expect(dock.ids()).toEqual(['viewport', 'practice', 'sandbox'])
  })

  it('says the layout is empty when only those two were in it, so the app builds a fresh one', () => {
    const dock = fakeDock(['author', 'classresults'])
    setDockApi(dock.api)
    expect(dropHiddenPanels()).toBe(false)
    expect(dock.ids()).toEqual([])
    expect(useOpenPanels.getState().open).toEqual([])
  })

  it('has the app start through both, in that order', () => {
    const app = readSource('src/renderer/src/app/App.tsx')
    const ready = app.match(/onReady=\{[\s\S]*?refreshOpenPanels\(\)/)?.[0] ?? ''
    expect(ready, 'App.tsx onReady block was not found').toContain('restoreLayout(')
    expect(has(ready, /openableMode\(savedMode\(\)/), 'the saved mode goes through openableMode').toBe(true)
    expect(has(ready, /const restored = !bench && restoreLayout\(e\.api\) && dropHiddenPanels\(\)/), 'hidden panels are dropped right after the layout is restored').toBe(true)
    expect(ready.indexOf('dropHiddenPanels('), 'dropHiddenPanels runs after restoreLayout').toBeGreaterThan(ready.indexOf('restoreLayout('))
    // A layout left empty by that is rebuilt for the mode, not shown as an empty window.
    expect(has(ready, /if \(!restored\) buildLayout\(e\.api, mode\)/), 'an emptied layout is rebuilt').toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------
// M3 — the modes, panels and files are gone; Problem Sets saves no result file
// ---------------------------------------------------------------------------------------------

describe('Question Author and Class Results are out of the app', () => {
  it('have no mode, no panel and no registered view', () => {
    for (const id of HIDDEN_MODE_IDS) expect(MODES.some((m) => m.id === id), id).toBe(false)
    for (const id of HIDDEN_PANEL_IDS) expect(PANEL_TITLES[id], id).toBeUndefined()
    const app = readSource('src/renderer/src/app/App.tsx')
    expect(has(app, /panels\/Author|panels\/ClassResults/), 'App.tsx still imports a removed panel').toBe(false)
  })

  it('have no files left in the renderer', () => {
    const rels = rendererSources().map((f) => f.rel)
    for (const f of ['panels/Author.tsx', 'panels/AuthorScene.tsx', 'panels/AuthorSolution.tsx', 'panels/AuthorVariables.tsx', 'panels/ClassResults.tsx', 'questions/authoring.ts', 'questions/authorKinds.ts', 'questions/authorStore.ts']) {
      expect(rels, f).not.toContain(f)
    }
  })

  it('leave Problem Sets with no "Save my results for my teacher" card', () => {
    const src = readSource('src/renderer/src/panels/Practice.tsx')
    expect(src).not.toContain('Save my results for my teacher')
    expect(src).not.toContain('saveForTeacher')
  })
})

// ---------------------------------------------------------------------------------------------
// M4 — the one switch still works, shown on a mode that exists
// ---------------------------------------------------------------------------------------------

describe('the one switch', () => {
  const none = new Set<ModeId>()
  const some = new Set<ModeId>(['sandbox'])

  it('is a single set, declared once in app/modes.ts, and empty today', () => {
    expect([...HIDDEN_MODES]).toEqual([])
    const declared = rendererSources()
      .filter((f) => /\b(?:const|let|var)\s+HIDDEN_MODES\b/.test(f.text))
      .map((f) => f.rel)
    expect(declared).toEqual(['app/modes.ts'])
  })

  it('hides a mode put in it: no tab, no More modes row, no panel, and a saved session opens Problem Sets', () => {
    expect(readyModes(some).map((m) => m.id)).not.toContain('sandbox')
    expect(readyModes(none).map((m) => m.id)).toContain('sandbox')
    expect(hiddenPanels(some)).toEqual(['sandbox'])
    expect(isPanelHidden('sandbox', some)).toBe(true)
    expect(panelList(some).map((p) => p.id)).not.toContain('sandbox')
    expect(isModeHidden('sandbox', some)).toBe(true)
    expect(openableMode('sandbox', some)).toBe('problems')
    expect(openableMode('sandbox', none)).toBe('sandbox')
    expect(comingSoonModes(none).map((m) => m.id)).toEqual(MODES.filter((m) => !m.ready).map((m) => m.id))
  })

  it('is what every helper uses when it is given nothing, so editing the set is the whole switch', () => {
    expect(readyModes()).toEqual(readyModes(HIDDEN_MODES))
    expect(comingSoonModes()).toEqual(comingSoonModes(HIDDEN_MODES))
    expect(hiddenPanels()).toEqual([])
    expect(panelList()).toEqual(panelList(HIDDEN_MODES))
    expect(PANEL_LIST).toEqual(panelList(HIDDEN_MODES))
    expect(PANEL_LIST.map((p) => p.id)).toEqual(Object.keys(PANEL_TITLES))
    for (const id of Object.keys(PANEL_TITLES)) expect(isPanelHidden(id), id).toBe(false)
    for (const m of MODES) {
      expect(isModeHidden(m.id), m.id).toBe(false)
      expect(openableMode(m.id), m.id).toBe(m.id)
    }
  })

  it('keeps refusing class-results files whatever the set holds, and the result format stays known', async () => {
    const { classResultsFileText } = await importFiles()
    const text = serializeResultFile(buildResultFile({ setId: 's', setTitle: 'S', items: [] }))
    expect(classResultsFileText('class.pqresult', text)).toBe(REFUSAL)
    expect(RESULT_FORMAT).toBe('pqresult')
    expect(modeById('problems').panel).toBe('practice')
  })
})
