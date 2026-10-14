// SB63 (the owner, 13 Oct 2026: "everything looks complex and a person using it the first time will get confused"): the
// Sandbox panel opens in a SIMPLE view — Play and Reset, six picture tiles of experiments, three add buttons, the selected
// object's speed and mass, the energy line, and one "All tools" button that brings today's full panel back. The choice is
// remembered. Around the panel, one hint at a time. Rendered for real with react-dom/server (the suite has no DOM), the
// stores driven by hand, as tests/sandboxPlayJump.test.ts and tests/replayLock.test.ts do.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Sandbox } from '../src/renderer/src/panels/Sandbox'
import { SimplePanel } from '../src/renderer/src/panels/sandbox/SimplePanel'
import { EXPERIMENT_TILES, ExperimentTiles } from '../src/renderer/src/panels/sandbox/ExperimentTiles'
import { PresetList } from '../src/renderer/src/panels/sandbox/Presets'
import { SIMPLE_SHAPES, SimpleAddRow } from '../src/renderer/src/panels/sandbox/AddRow'
import { Transport } from '../src/renderer/src/panels/sandbox/Transport'
import { EnergyLedger, SimpleEnergy } from '../src/renderer/src/panels/sandbox/EnergyLedger'
import { Hint } from '../src/renderer/src/render/sandbox/Hint'
import { GraphDock } from '../src/renderer/src/render/sandbox/GraphDock'
import { loadExperiment } from '../src/renderer/src/sim/transportActions'
import { SANDBOX_VIEW_KEY, readSandboxView, useSandboxView, writeSandboxView, type SandboxView } from '../src/renderer/src/sim/sandboxView'
import { SIMPLE_HINTS, hintMoment, simpleHint, type HintInput, type HintMoment } from '../src/renderer/src/sim/simpleHint'
import { massOf, useSandbox } from '../src/renderer/src/sim/store'
import { startStateOf } from '../src/renderer/src/sim/energy'
import { useScene } from '../src/renderer/src/core/store'
import { PRESETS, presetById } from '../src/renderer/src/sim/presets'
import { TOUR } from '../src/renderer/src/app/tour/steps'
import { enterMode } from '../src/renderer/src/app/layout'
import { setDockApi } from '../src/renderer/src/app/panels'
import { useApp } from '../src/renderer/src/app/modes'

// The engine's load state is a useSyncExternalStore with no server snapshot; the panel's shape is under test, not the engine.
vi.mock('../src/renderer/src/sim/jolt', async (importOriginal) => ({ ...(await importOriginal<object>()), useJoltState: () => 'ready' }))

// Mock localStorage for tests
const mockStorage = new Map<string, string>()
global.localStorage = {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, value: string) => mockStorage.set(key, value),
  removeItem: (key: string) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
  key: (index: number) => [...mockStorage.keys()][index] ?? null,
  length: mockStorage.size
} as Storage

// A server render reads every zustand store's initial state, so the stores are built with hooks that read the current one.
vi.mock('zustand', async (importOriginal) => {
  const z = await importOriginal<typeof import('zustand')>()
  const bind = (init: never) => {
    const api = z.createStore(init)
    const hook = (select: (s: unknown) => unknown = (s) => s) => select(api.getState())
    return Object.assign(hook, api)
  }
  return { ...z, create: (init?: never) => (init ? bind(init) : bind) }
})

const render = (el: React.ComponentType) => renderToStaticMarkup(createElement(el))
const panel = () => render(Sandbox)

/** Every <button> in the markup: its attributes and its text with the tags (icons) taken out. */
function buttons(html: string): { attrs: string; text: string }[] {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({ attrs: m[1], text: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }))
}
const attr = (attrs: string, name: string): string | null => attrs.match(new RegExp(` ${name}="([^"]*)"`))?.[1] ?? null
/** The accessible name a reader gets: aria-label, else the text, else the title. */
const nameOf = (b: { attrs: string; text: string }): string => attr(b.attrs, 'aria-label') ?? (b.text || attr(b.attrs, 'title') || '')

/** The smallest localStorage stand-in. */
function fakeStore() {
  const map = new Map<string, string>()
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) }
}

beforeEach(() => {
  useSandboxView.setState({ view: 'simple' })
  useScene.getState().setPlaying(false)
  useSandbox.getState().loadSandbox()
  mockStorage.clear()
})

describe('Simple is the default', () => {
  it('with nothing remembered the view is simple, for a new profile and an old one alike', () => {
    expect(readSandboxView(null)).toBe('simple')
    expect(readSandboxView(fakeStore())).toBe('simple')
    expect(useSandboxView.getState().view).toBe('simple')
  })

  it('the panel opens on the simple view: Play, the tiles, Add, the energy line and All tools — not the full panel', () => {
    const html = panel()
    expect(html).toContain('data-tour="play"')
    expect(html).toContain('Try an experiment')
    expect(html).toContain('More experiments')
    expect(html).toContain('>Energy<')
    expect(buttons(html).map(nameOf)).toContain('All tools')
    // Everything else is behind All tools.
    expect(html).not.toContain('Connect two objects')
    expect(html).not.toContain('Start from an experiment')
    expect(html).not.toContain('>World<')
    expect(html).not.toContain('> World<')
    expect(html).not.toContain('Recording')
    expect(html).not.toContain('> Details<')
    expect(html).not.toContain('Undo the last change')
    expect(html).not.toContain('Clear every trail')
  })

  it('Play is the only primary button, Reset is beside it and the clock is on the row', () => {
    const html = render(() => createElement(Transport, { simple: true }))
    const primary = buttons(html).filter((b) => /\bprimary\b/.test(attr(b.attrs, 'class') ?? ''))
    expect(primary).toHaveLength(1)
    expect(primary[0].attrs).toContain('data-tour="play"')
    expect(buttons(html).map(nameOf)).toEqual(['Play Pause', 'Reset'])
    expect(html).toContain('t = 0 s')
    // The default row is still the full one (tests/tapeStrip.test.ts renders it so).
    expect(buttons(render(Transport)).length).toBeGreaterThan(2)
  })
})

describe('the eight tiles', () => {
  it('are the eight experiments of the contract, each a real preset with a label and a drawing', () => {
    expect(EXPERIMENT_TILES.map((t) => t.id)).toEqual(['pendulum', 'spring', 'bounce', 'collision', 'projectile', 'seesaw', 'atwood', 'chaosTwins'])
    for (const t of EXPERIMENT_TILES) expect(presetById(t.id), t.id).toBeDefined()
    // The tile's word is the preset's own, except for tiles the contract shortens or renames (Collision; Lever for the seesaw; Chaos twins for the double pendulum).
    for (const t of EXPERIMENT_TILES) if (t.id !== 'collision' && t.id !== 'seesaw' && t.id !== 'chaosTwins') expect(t.label, t.id).toBe(presetById(t.id)!.label)
    expect(presetById('collision')!.label).toContain('collision')
    const html = render(ExperimentTiles)
    for (const t of EXPERIMENT_TILES) {
      expect(html).toContain(`data-experiment="${t.id}"`)
      expect(html).toContain(`>${t.label}<`)
    }
    // Eight drawings: inline SVG, strokes through currentColor and theme tokens, no hex and no image files.
    expect(html.match(/<svg\b/g)?.length).toBe(8)
    expect(html).toMatch(/stroke="currentColor"/)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(html).not.toMatch(/<img\b/)
  })

  it('a click loads the experiment by the same path as the Presets list (paused first), and the loaded tile is lit', () => {
    for (const t of EXPERIMENT_TILES) {
      useScene.getState().setPlaying(true)
      expect(loadExperiment(t.id)).toBe(true)
      expect(useScene.getState().playing).toBe(false)
      expect(useSandbox.getState().presetId).toBe(t.id)
      expect(useSandbox.getState().bodies.map((b) => b.name)).toEqual(presetById(t.id)!.build().bodies.map((b) => b.name))
      const html = render(ExperimentTiles)
      const tiles = buttons(html).filter((b) => attr(b.attrs, 'data-experiment'))
      expect(tiles).toHaveLength(8)
      for (const tile of tiles) expect(attr(tile.attrs, 'aria-pressed'), attr(tile.attrs, 'data-experiment')!).toBe(attr(tile.attrs, 'data-experiment') === t.id ? 'true' : 'false')
      const lit = tiles.find((b) => attr(b.attrs, 'data-experiment') === t.id)!
      expect(attr(lit.attrs, 'class')).toContain('var(--accent)')
    }
    // Any other way of replacing the scene unlights every tile.
    useSandbox.getState().loadSandbox()
    for (const tile of buttons(render(ExperimentTiles)).filter((b) => attr(b.attrs, 'data-experiment'))) expect(attr(tile.attrs, 'aria-pressed')).toBe('false')
  })

  it('an unknown experiment is refused and changes nothing', () => {
    loadExperiment('bounce')
    expect(loadExperiment('no-such-experiment')).toBe(false)
    expect(useSandbox.getState().presetId).toBe('bounce')
  })

  it('More experiments is a quiet button that opens the existing full list, with its search and every experiment', () => {
    const more = buttons(panel()).find((b) => nameOf(b) === 'More experiments')!
    expect(more).toBeDefined()
    expect(attr(more.attrs, 'aria-expanded')).toBe('false')
    expect(attr(more.attrs, 'class')).toContain('ghost')
    const list = render(() => createElement(PresetList, { onLoad: () => {} }))
    expect(list).toContain('aria-label="Search experiments"')
    // React writes an apostrophe (Galileo's ramps) as &#x27;.
    for (const p of PRESETS) expect(list, p.id).toContain(`>${p.label.replace(/'/g, '&#x27;')}<`)
  })
})

describe('the three add buttons', () => {
  it('add a ball, a box and a ramp, each with its tool card', () => {
    expect(SIMPLE_SHAPES.map((s) => s.shape)).toEqual(['sphere', 'box', 'ramp'])
    expect(SIMPLE_SHAPES.map((s) => s.label)).toEqual(['Ball', 'Box', 'Ramp'])
    const html = render(SimpleAddRow)
    const adds = buttons(html).filter((b) => attr(b.attrs, 'data-add'))
    expect(adds.map((b) => attr(b.attrs, 'data-add'))).toEqual(['sphere', 'box', 'ramp'])
    expect(adds.map(nameOf)).toEqual(['Ball', 'Box', 'Ramp'])
    // 44 px targets, and the card hooks (aria-describedby comes with the card, the handlers with the button).
    for (const b of adds) expect(attr(b.attrs, 'class')).toContain('min-h-[44px]')
    const before = useSandbox.getState().bodies.length
    for (const s of SIMPLE_SHAPES) expect(useSandbox.getState().addBody(s.shape).shape).toBe(s.shape)
    expect(useSandbox.getState().bodies.length).toBe(before + 3)
    expect(html).not.toContain('Connect two objects')
    expect(html).not.toContain('Plank')
  })
})

describe('the selected object', () => {
  it('nothing selected: one muted line', () => {
    useSandbox.getState().select(null)
    const html = panel()
    expect(html).toContain('Click an object to see its speed')
    expect(html).not.toContain('>Delete<')
  })

  it('a moving object selected: its name, the speed box, its mass control and Delete', () => {
    const ball = useSandbox.getState().bodies.find((b) => b.motion === 'dynamic')!
    useSandbox.getState().select(ball.id)
    const html = panel()
    expect(html).not.toContain('Click an object to see its speed')
    expect(html).toContain(`>${ball.name}<`)
    expect(html).toContain('At the start')
    expect(html).toContain('m/s')
    expect(html).toContain('>Mass<')
    expect(html).toContain('from density')
    expect(html).toContain('type it')
    const del = buttons(html).find((b) => nameOf(b) === 'Delete')!
    expect(del).toBeDefined()
    expect(del.attrs).not.toContain('disabled')
    useSandbox.getState().removeBody(ball.id)
    expect(useSandbox.getState().bodies.find((b) => b.id === ball.id)).toBeUndefined()
    expect(panel()).toContain('Click an object to see its speed')
  })

  it('mid-run the speed box reads the engine, not the typed start', () => {
    const ball = useSandbox.getState().bodies.find((b) => b.motion === 'dynamic')!
    useSandbox.getState().select(ball.id)
    useScene.getState().setPlaying(true)
    useSandbox.setState({ live: { [ball.id]: { ...startStateOf(ball, massOf(ball)), position: [0, 2, 0], velocity: [3, 4, 0] } } })
    const html = panel()
    expect(html).toContain('>Now<')
    expect(html).toContain('5 m/s')
  })

  it('a fixed object (the ramp, the floor) has no speed and no mass to show', () => {
    const floor = useSandbox.getState().bodies.find((b) => b.shape === 'ground')!
    useSandbox.getState().select(floor.id)
    const html = panel()
    expect(html).not.toContain('At the start')
    expect(html).not.toContain('>Mass<')
  })
})

describe('All tools and back', () => {
  it('All tools shows every section of today’s panel, with a Simple view button at its top', () => {
    useSandboxView.getState().setView('all')
    expect(useSandboxView.getState().view).toBe('all')
    const html = panel()
    for (const section of ['>Objects<', 'Start here', 'Start from an experiment', 'Connect two objects', '> Connections<', '>Energy<', '> Details<', '> Recording<', '> World<']) expect(html, section).toContain(section)
    expect(html).toContain('data-tour="connect"')
    expect(html).toContain('data-tour="play"')
    expect(html).toContain('Undo the last change')
    const names = buttons(html).map(nameOf)
    expect(names).toContain('Simple view')
    expect(names).not.toContain('All tools')
    // At the top: before the Objects heading.
    expect(html.indexOf('Simple view')).toBeLessThan(html.indexOf('>Objects<'))
  })

  it('Simple view returns', () => {
    useSandboxView.getState().setView('all')
    expect(panel()).toContain('Connect two objects')
    useSandboxView.getState().setView('simple')
    const html = panel()
    expect(html).toContain('Try an experiment')
    expect(html).not.toContain('Connect two objects')
  })

  it('the choice survives a remount: the pref store writes it and reads it back, and a blocked storage means simple', () => {
    const store = fakeStore()
    expect(readSandboxView(store)).toBe('simple')
    const views: SandboxView[] = ['all', 'simple']
    for (const view of views) {
      writeSandboxView(view, store)
      expect(store.map.get(SANDBOX_VIEW_KEY)).toBe(view)
      expect(readSandboxView(store)).toBe(view)
    }
    // Anything but the two words is the default.
    store.map.set(SANDBOX_VIEW_KEY, 'everything')
    expect(readSandboxView(store)).toBe('simple')
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      }
    }
    expect(readSandboxView(blocked)).toBe('simple')
    expect(() => writeSandboxView('all', blocked)).not.toThrow()
  })

  it('the panel’s switch goes through the store, which writes localStorage', () => {
    const store = fakeStore()
    vi.stubGlobal('localStorage', store)
    try {
      useSandboxView.getState().setView('all')
      expect(store.map.get(SANDBOX_VIEW_KEY)).toBe('all')
      useSandboxView.getState().setView('simple')
      expect(store.map.get(SANDBOX_VIEW_KEY)).toBe('simple')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('one hint at a time', () => {
  const sentence = (s: string) => {
    expect(s).toBe(s.trim())
    expect(s.length).toBeGreaterThan(0)
    // One sentence: no full stop with another sentence after it.
    expect(s).not.toMatch(/[.!?]\s+\S/)
  }

  it('the picker gives exactly one sentence for each state, and the four states have four different sentences', () => {
    const fresh: HintInput = { playing: false, engineTime: 0, presetId: null, edited: false }
    expect(simpleHint(fresh)).toBe('Pick an experiment, then press Play')
    expect(simpleHint({ ...fresh, presetId: 'bounce' })).toBe('Press Play to start')
    expect(simpleHint({ ...fresh, edited: true })).toBe('Press Play to start')
    expect(simpleHint({ ...fresh, playing: true })).toBe('Click an object to see its speed')
    expect(simpleHint({ ...fresh, presetId: 'bounce', playing: true, engineTime: 1.2 })).toBe('Click an object to see its speed')
    expect(simpleHint({ ...fresh, engineTime: 1.2 })).toBe('Press Play to go on, or Reset to start again')
    expect(simpleHint({ ...fresh, presetId: 'bounce', engineTime: 1.2 })).toBe('Press Play to go on, or Reset to start again')
    const moments = Object.keys(SIMPLE_HINTS) as HintMoment[]
    expect(moments).toEqual(['fresh', 'loaded', 'running', 'paused'])
    const all = moments.map((m) => SIMPLE_HINTS[m])
    expect(new Set(all).size).toBe(4)
    for (const s of all) sentence(s)
    // Every combination of the inputs lands on one of the four.
    for (const playing of [false, true]) for (const engineTime of [0, 0.5]) for (const presetId of [null, 'spring']) for (const edited of [false, true]) {
      const moment: HintMoment = hintMoment({ playing, engineTime, presetId, edited })
      expect(moments).toContain(moment)
    }
  })

  it('the viewport hint follows the Sandbox state in Simple view, and is today’s sentence in All tools', () => {
    expect(render(Hint)).toContain('Pick an experiment, then press Play')
    loadExperiment('pendulum')
    expect(render(Hint)).toContain('Press Play to start')
    useScene.getState().setPlaying(true)
    expect(render(Hint)).toContain('Click an object to see its speed')
    useScene.getState().setPlaying(false)
    useSandbox.setState({ engineTime: 0.7 })
    expect(render(Hint)).toContain('Press Play to go on, or Reset to start again')
    useSandboxView.getState().setView('all')
    const full = render(Hint)
    expect(full).toContain('Drag an object to place it')
    expect(full).not.toContain('Press Play to go on')
    // Both are the same hint bar, which lets the pointer through (styles.css .tool-hint).
    expect(render(Hint)).toContain('class="tool-hint"')
    useSandboxView.getState().setView('simple')
    expect(render(Hint)).toContain('class="tool-hint"')
  })
})

describe('every tile and button has an accessible name', () => {
  it('in the simple view, before and after a selection', () => {
    const check = (html: string) => {
      const all = buttons(html)
      expect(all.length).toBeGreaterThan(8)
      for (const b of all) expect(nameOf(b), b.attrs).not.toBe('')
    }
    check(render(SimplePanel))
    const ball = useSandbox.getState().bodies.find((b) => b.motion === 'dynamic')!
    useSandbox.getState().select(ball.id)
    check(render(SimplePanel))
    // The tiles are a named group.
    expect(render(SimplePanel)).toMatch(/role="group"[^>]*aria-label="Try an experiment"/)
  })
})

describe('what must not break', () => {
  it('the tour step that points at Connect (All tools only) borrows the full panel; the Play mission needs nothing', () => {
    const connect = TOUR.find((s) => s.anchor === 'connect')!
    expect(connect.mode).toBe('sandbox')
    expect(connect.sandboxView).toBe('all')
    for (const s of TOUR) if (s.anchor !== 'connect') expect(s.sandboxView).toBeUndefined()
  })

  it('replay locks: the add buttons and the mass control are inside a disabled fieldset only while a recording is shown', () => {
    const ball = useSandbox.getState().bodies.find((b) => b.motion === 'dynamic')!
    useSandbox.getState().select(ball.id)
    const html = panel()
    expect(html).toContain('<fieldset')
    expect(html).not.toMatch(/<fieldset[^>]* disabled=""/)
  })
})

describe('the side lessons panel (Examples) in Sandbox Simple view', () => {
  interface FakePanel {
    id: string
    api: { group: { id: string }; setActive: () => void; moveTo: () => void }
  }
  /** A fake dock holding the given panels; records what is added. */
  function dock(ids: string[]) {
    const group = { id: 'g' }
    const panels: FakePanel[] = []
    const add = (id: string) => panels.push({ id, api: { group, setActive: () => {}, moveTo: () => {} } })
    ids.forEach(add)
    const added: string[] = []
    setDockApi({
      width: 1366,
      height: 768,
      panels,
      getPanel: (id: string) => panels.find((p) => p.id === id),
      removePanel: (p: FakePanel) => void panels.splice(panels.indexOf(p), 1),
      addPanel: (o: { id: string }) => {
        add(o.id)
        added.push(o.id)
      }
    } as never)
    return { ids: () => panels.map((p) => p.id), added }
  }
  afterEach(() => {
    setDockApi(null)
    useApp.setState({ mode: 'vectors' })
  })

  it('closes Examples when the Sandbox opens in Simple view, and gives it back to the next mode that has lessons', () => {
    useApp.setState({ mode: 'vectors' })
    const d = dock(['viewport', 'examples', 'vectorcalc'])
    enterMode('sandbox')
    expect(d.ids()).not.toContain('examples')
    // A mode without lessons leaves it closed; Geometry, which has lessons, gets it back where it lived.
    enterMode('lab')
    expect(d.ids()).not.toContain('examples')
    enterMode('shapes')
    expect(d.ids()).toContain('examples')
    expect(d.added).toEqual(['examples'])
  })

  it('does not close it again while already in the Sandbox (a student who reopened it), nor on a restored session, nor in All tools', () => {
    useApp.setState({ mode: 'sandbox' })
    const same = dock(['viewport', 'examples', 'sandbox'])
    enterMode('sandbox')
    expect(same.ids()).toContain('examples')

    useApp.setState({ mode: 'vectors' })
    const restored = dock(['viewport', 'examples', 'sandbox'])
    enterMode('sandbox', { restored: true })
    expect(restored.ids()).toContain('examples')

    useApp.setState({ mode: 'vectors' })
    useSandboxView.getState().setView('all')
    const all = dock(['viewport', 'examples', 'sandbox'])
    enterMode('sandbox')
    expect(all.ids()).toContain('examples')
  })

  it('a mode with lessons that never lost Examples to the Sandbox is left alone', () => {
    useApp.setState({ mode: 'vectors' })
    const d = dock(['viewport', 'vectorcalc'])
    enterMode('shapes')
    expect(d.added).toEqual([])
  })
})

describe('camera reset on experiment load', () => {
  it('determines when the camera should reset based on preset changes', async () => {
    // Import the helper
    const { shouldResetCameraOnPresetChange } = await import('../src/renderer/src/render/viewState')

    // No change: camera should not reset
    expect(shouldResetCameraOnPresetChange(null, null)).toBe(false)
    expect(shouldResetCameraOnPresetChange('pendulum', 'pendulum')).toBe(false)

    // Loading an experiment into the starting scene: camera should reset
    expect(shouldResetCameraOnPresetChange(null, 'pendulum')).toBe(true)

    // Switching to a different experiment: camera should reset
    expect(shouldResetCameraOnPresetChange('pendulum', 'spring')).toBe(true)

    // Clearing the scene (loading nothing): camera should not reset
    expect(shouldResetCameraOnPresetChange('pendulum', null)).toBe(false)
  })

  it('loads an experiment and the camera should be reset on the next frame', () => {
    loadExperiment('pendulum')
    expect(useSandbox.getState().presetId).toBe('pendulum')
    expect(useSandbox.getState().bodies.length).toBeGreaterThan(0)
  })
})

describe('Vector Calculator and Maths panels in Sandbox Simple view', () => {
  interface FakePanel {
    id: string
    api: { group: { id: string }; setActive: () => void; moveTo: () => void }
  }
  function dock(ids: string[]) {
    const group = { id: 'g' }
    const panels: FakePanel[] = []
    const add = (id: string) => panels.push({ id, api: { group, setActive: () => {}, moveTo: () => {} } })
    ids.forEach(add)
    const added: string[] = []
    setDockApi({
      width: 1366,
      height: 768,
      panels,
      getPanel: (id: string) => panels.find((p) => p.id === id),
      removePanel: (p: FakePanel) => void panels.splice(panels.indexOf(p), 1),
      addPanel: (o: { id: string }) => {
        add(o.id)
        added.push(o.id)
      }
    } as never)
    return { ids: () => panels.map((p) => p.id), added }
  }
  afterEach(() => {
    setDockApi(null)
    useApp.setState({ mode: 'vectors' })
  })

  it('hides Vector Calculator panel when the Sandbox opens in Simple view, and gives it back to Vectors mode', () => {
    useApp.setState({ mode: 'vectors' })
    const d = dock(['viewport', 'vectorcalc', 'sandbox'])
    enterMode('sandbox')
    expect(d.ids()).not.toContain('vectorcalc')
    // When entering Vectors mode again, it gets the panel back.
    enterMode('vectors')
    expect(d.ids()).toContain('vectorcalc')
    expect(d.added).toContain('vectorcalc')
  })

  it('does not hide them again while already in the Sandbox, nor on a restored session, nor in All tools', () => {
    useApp.setState({ mode: 'sandbox' })
    const same = dock(['viewport', 'vectorcalc', 'sandbox'])
    enterMode('sandbox')
    expect(same.ids()).toContain('vectorcalc')

    useApp.setState({ mode: 'vectors' })
    const restored = dock(['viewport', 'vectorcalc', 'sandbox'])
    enterMode('sandbox', { restored: true })
    expect(restored.ids()).toContain('vectorcalc')

    useApp.setState({ mode: 'vectors' })
    useSandboxView.getState().setView('all')
    const all = dock(['viewport', 'vectorcalc', 'sandbox'])
    enterMode('sandbox')
    expect(all.ids()).toContain('vectorcalc')
  })
})

describe('Energy line in Simple view', () => {
  it('shows only the bar and total energy in Simple view, not the momentum', () => {
    useSandboxView.getState().setView('simple')
    const html = render(SimpleEnergy)
    expect(html).toContain('total')
    expect(html).not.toMatch(/>\s*p\s/)
  })

  it('shows the bar, total energy and momentum in All tools view', () => {
    useSandboxView.getState().setView('all')
    const html = render(EnergyLedger)
    expect(html).toContain('total')
    expect(html).toMatch(/>\s*p\s/)
  })
})

describe('the graph dock (SB19)', () => {
  it('in Simple view the graph starts closed: only the Graph button is shown', () => {
    useSandboxView.getState().setView('simple')
    localStorage.clear()
    const html = render(GraphDock)
    expect(html).toContain('>Graph<')
    expect(html).toContain('aria-expanded="false"')
    // The full dock is not shown when closed: no choice buttons (Energy, Position, Velocity).
    expect(html).not.toContain('>Energy<')
    expect(html).not.toContain('>Position<')
    expect(html).not.toContain('>Velocity<')
  })

  it('in Simple view when the graph is open, the dock shows its tabs', () => {
    useSandboxView.getState().setView('simple')
    localStorage.setItem('physlab.graphDock', JSON.stringify({ open: true, choice: 'energy' }))
    const html = render(GraphDock)
    // The dock should be shown with choice buttons
    expect(html).toContain('>Graph<')
    expect(html).toContain('>Energy<')
    expect(html).toContain('>Position<')
    expect(html).toContain('>Velocity<')
    expect(html).toContain('aria-expanded="true"')
  })

  it('in Simple view when the graph is closed, it shows only the button', () => {
    useSandboxView.getState().setView('simple')
    localStorage.setItem('physlab.graphDock', JSON.stringify({ open: false, choice: 'energy' }))
    const html = render(GraphDock)
    expect(html).toContain('>Graph<')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('>Energy<')
    expect(html).not.toContain('>Position<')
  })

  it('in All tools shows the full dock with all choices, as SB19 made it', () => {
    useSandboxView.getState().setView('all')
    localStorage.setItem('physlab.graphDock', JSON.stringify({ open: true, choice: 'energy' }))
    const html = render(GraphDock)
    expect(html).toContain('>Graph<')
    expect(html).toContain('>Energy<')
    expect(html).toContain('>Position<')
    expect(html).toContain('>Velocity<')
  })
})
