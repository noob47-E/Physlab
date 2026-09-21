import { create } from 'zustand'
import { produce, type Draft } from 'immer'
import { dependentsOf, evaluateScene } from './evaluate'
import { setNotation } from '../math/format'
import type { EvalResult, ObjId, SceneFile, SceneObject, SceneSettings, ToolId, ViewMode } from './types'
import type { Solution } from '../math/vectorSolver'
import { emptyTable, useLab } from '../lab/labStore'
import { startingScene, useSandbox } from '../sim/store'
import { DEFAULT_WORLD } from '../sim/types'
import { FILE_VERSION, migrate, migrateLabelSettings } from './migrate'
import { renameInObjects, renameProblem } from './rename'
import { visibleOrder, type Space } from './visibility'

export interface LogEntry {
  id: number
  input: string
  kind: 'result' | 'error' | 'info'
  /** Plain text output. */
  text?: string
  /** LaTeX output. */
  tex?: string
  /** Offer a "Show steps" button. */
  solution?: Solution
  /** Offer a "Visualize" button. */
  visualize?: () => void
  /** Offer a "Working" button, which reopens the step-by-step working for this line. */
  working?: () => void
}

interface Snapshot {
  objects: Record<ObjId, SceneObject>
  order: ObjId[]
}

export interface SceneState {
  objects: Record<ObjId, SceneObject>
  order: ObjId[]
  settings: SceneSettings
  ev: EvalResult
  /** Values at the start of the current drag, for Δ measurements. */
  baseline: EvalResult['values'] | null

  selection: ObjId[]
  hovered: ObjId | null
  tool: ToolId
  viewMode: ViewMode

  time: number
  playing: boolean
  speed: number

  past: Snapshot[]
  future: Snapshot[]
  gesture: boolean

  filePath: string | null
  dirty: boolean
  /** The drawing the current mode looks at. Objects are stamped with it when made and shown only there. */
  activeSpace: Space | null
  setActiveSpace: (space: Space | null) => void

  log: LogEntry[]
  solution: Solution | null
  /** Bumped to ask panels to focus (e.g. the Solver tab). */
  focusPanel: { id: string; nonce: number } | null

  addObjects: (objs: SceneObject[], opts?: { select?: boolean; record?: boolean }) => void
  updateObject: (id: ObjId, recipe: (draft: Draft<SceneObject>) => void, record?: boolean) => void
  removeObjects: (ids: ObjId[]) => void
  beginGesture: () => void
  endGesture: () => void
  undo: () => void
  redo: () => void
  /** Gives an object a new name, inside every formula that used the old one. Returns a sentence when it cannot. */
  renameObject: (id: ObjId, next: string) => string | null

  /** Removes every object on the drawing being looked at, as one undo step; the other drawings keep theirs. */
  clearDrawing: () => void

  select: (ids: ObjId[], additive?: boolean) => void
  setHovered: (id: ObjId | null) => void
  setTool: (tool: ToolId) => void
  setViewMode: (m: ViewMode) => void
  setSettings: (patch: Partial<SceneSettings>) => void

  setPlaying: (p: boolean) => void
  setTime: (t: number) => void
  setSpeed: (s: number) => void
  tick: (dt: number) => void

  pushLog: (e: Omit<LogEntry, 'id'>) => number
  updateLog: (id: number, patch: Partial<LogEntry>) => void
  clearLog: () => void
  showSolution: (s: Solution) => void
  requestFocus: (panelId: string) => void

  newScene: () => void
  /** Opens a parsed .phys file of any format. Throws, with a readable message, before touching any store. */
  loadScene: (file: unknown, path?: string | null) => void
  serialize: () => SceneFile
  markSaved: (path: string) => void
}

export const DEFAULT_SETTINGS: SceneSettings = {
  angleUnit: 'deg',
  showGrid: true,
  gridStyle: 'lines',
  showAxes: true,
  snap: true,
  decimals: 2,
  precisionMode: 'dp',
  unit: 'unit',
  unitPerSquare: 1,
  labelShow: 'hover',
  measureLabels: 'measure',
  pointLetters: true,
  showAngleMarks: true,
  vectorNotation: 'arrow',
  componentForm: 'ijk',
  directionStyle: 'standard'
}

/** Label preferences belong to the person using the app, so they survive restarts and opening files. */
export const LABEL_PREFS = ['labelShow', 'measureLabels', 'pointLetters', 'showAngleMarks', 'vectorNotation', 'componentForm', 'directionStyle'] as const
const PREFS_KEY = 'physlab.labelPrefs'

function loadLabelPrefs(): Partial<SceneSettings> {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<SceneSettings>
    return migrateLabelSettings(saved)
  } catch {
    return {}
  }
}

function saveLabelPrefs(s: SceneSettings) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(Object.fromEntries(LABEL_PREFS.map((k) => [k, s[k]]))))
  } catch {
    // Storage unavailable: preferences just last for this session.
  }
}

const INITIAL_SETTINGS: SceneSettings = { ...DEFAULT_SETTINGS, ...loadLabelPrefs() }
applyNotation(INITIAL_SETTINGS)

/** Keep the formatter in step with the chosen notation. */
function applyNotation(s: SceneSettings) {
  setNotation({ vector: s.vectorNotation, components: s.componentForm, direction: s.directionStyle })
}

const HISTORY_LIMIT = 200
let logCounter = 0

const evalOf = (objects: Record<ObjId, SceneObject>, order: ObjId[], settings: SceneSettings, time: number) =>
  evaluateScene(objects, order, settings, time)

export const useScene = create<SceneState>()((set, get) => {
  const record = () => {
    const { objects, order, past } = get()
    const next = [...past, { objects, order }]
    if (next.length > HISTORY_LIMIT) next.shift()
    return { past: next, future: [] as Snapshot[] }
  }

  const commit = (objects: Record<ObjId, SceneObject>, order: ObjId[], extra: Partial<SceneState> = {}) => {
    const { settings, time } = get()
    set({ objects, order, ev: evalOf(objects, order, settings, time), dirty: true, ...extra })
  }

  return {
    objects: {},
    order: [],
    settings: INITIAL_SETTINGS,
    ev: evalOf({}, [], INITIAL_SETTINGS, 0),
    baseline: null,

    selection: [],
    hovered: null,
    tool: 'select',
    viewMode: '2d',

    time: 0,
    playing: false,
    speed: 1,

    past: [],
    future: [],
    gesture: false,

    filePath: null,
    dirty: false,
    activeSpace: 'vectors',
    setActiveSpace: (activeSpace) => {
      if (get().activeSpace === activeSpace) return
      // What was selected may no longer be on screen.
      set({ activeSpace, selection: [], hovered: null })
    },

    log: [],
    solution: null,
    focusPanel: null,

    addObjects: (objs, opts = {}) => {
      const { objects, order } = get()
      const history = opts.record === false || get().gesture ? {} : record()
      const nextObjects = { ...objects }
      const nextOrder = [...order]
      for (const o of objs) {
        nextObjects[o.id] = o
        if (!nextOrder.includes(o.id)) nextOrder.push(o.id)
      }
      commit(nextObjects, nextOrder, {
        ...history,
        ...(opts.select ? { selection: objs.filter((o) => !o.auxiliary).map((o) => o.id).slice(-1) } : {})
      })
    },

    updateObject: (id, recipe, rec = true) => {
      const { objects, order, gesture } = get()
      if (!objects[id]) return
      const history = rec && !gesture ? record() : {}
      const updated = produce(objects[id], recipe)
      commit({ ...objects, [id]: updated }, order, history)
    },

    removeObjects: (ids) => {
      const { objects, order, selection } = get()
      const doomed = new Set<ObjId>()
      for (const id of ids) {
        doomed.add(id)
        for (const d of dependentsOf(id, objects)) doomed.add(d)
      }
      if (doomed.size === 0) return
      const history = record()
      const nextObjects = { ...objects }
      for (const id of doomed) delete nextObjects[id]
      commit(
        nextObjects,
        order.filter((id) => !doomed.has(id)),
        { ...history, selection: selection.filter((id) => !doomed.has(id)) }
      )
    },

    clearDrawing: () => {
      const { order, objects, activeSpace } = get()
      // "This drawing" needs a drawing. With none active (the Sandbox, the GPU Lab) visibleOrder
      // was once every object in every drawing, and the command wiped all four from a mode where
      // none of them was even on screen — and where Ctrl+Z went to the sandbox's own history.
      if (!activeSpace) return
      get().removeObjects(visibleOrder(order, objects, activeSpace))
    },

    beginGesture: () => {
      if (get().gesture) return
      set({ ...record(), gesture: true, baseline: get().ev.values })
    },
    endGesture: () => set({ gesture: false, baseline: null }),

    undo: () => {
      const { past, future, objects, order } = get()
      const prev = past[past.length - 1]
      if (!prev) return
      commit(prev.objects, prev.order, { past: past.slice(0, -1), future: [...future, { objects, order }] })
    },
    redo: () => {
      const { past, future, objects, order } = get()
      const next = future[future.length - 1]
      if (!next) return
      commit(next.objects, next.order, { past: [...past, { objects, order }], future: future.slice(0, -1) })
    },

    renameObject: (id, next) => {
      const { objects, ev } = get()
      const obj = objects[id]
      if (!obj) return 'That object no longer exists.'
      if (obj.name === next) return null
      const problem = renameProblem(next, ev.names.keys())
      if (problem) return problem
      get().addObjects(renameInObjects(objects, id, next))
      return null
    },

    select: (ids, additive = false) => {
      if (!additive) return set({ selection: ids })
      const cur = new Set(get().selection)
      for (const id of ids) {
        if (cur.has(id)) cur.delete(id)
        else cur.add(id)
      }
      set({ selection: [...cur] })
    },
    setHovered: (id) => {
      if (get().hovered !== id) set({ hovered: id })
    },
    setTool: (tool) => set({ tool }),
    setViewMode: (viewMode) => set({ viewMode }),
    setSettings: (patch) => {
      const settings = { ...get().settings, ...patch }
      if (LABEL_PREFS.some((k) => k in patch)) {
        saveLabelPrefs(settings)
        applyNotation(settings)
        // Labels are drawn from settings alone; no need to re-evaluate the scene.
        if (Object.keys(patch).every((k) => (LABEL_PREFS as readonly string[]).includes(k))) return set({ settings })
      }
      const { objects, order, time } = get()
      set({ settings, ev: evalOf(objects, order, settings, time) })
    },

    setPlaying: (playing) => set({ playing }),
    setTime: (time) => {
      const { objects, order, settings } = get()
      set({ time, ev: evalOf(objects, order, settings, time) })
    },
    setSpeed: (speed) => set({ speed }),
    tick: (dt) => {
      const { playing, time, speed } = get()
      if (!playing) return
      get().setTime(time + dt * speed)
    },

    pushLog: (e) => {
      const id = ++logCounter
      set({ log: [...get().log.slice(-300), { ...e, id }] })
      return id
    },
    updateLog: (id, patch) => set({ log: get().log.map((l) => (l.id === id ? { ...l, ...patch } : l)) }),
    clearLog: () => set({ log: [] }),
    showSolution: (solution) => set({ solution, focusPanel: { id: 'solver', nonce: Date.now() } }),
    requestFocus: (id) => set({ focusPanel: { id, nonce: Date.now() } }),

    newScene: () => {
      useLab.getState().setTables([])
      useSandbox.getState().loadSandbox()
      set({
        objects: {},
        order: [],
        ev: evalOf({}, [], get().settings, 0),
        selection: [],
        past: [],
        future: [],
        time: 0,
        playing: false,
        filePath: null,
        dirty: false,
        solution: null
      })
    },
    loadScene: (raw, path = null) => {
      // Check and convert before touching anything: a bad file used to wipe the lab tables and then throw.
      const file = migrate(raw)
      useLab.getState().setTables(file.lab ?? [])
      useSandbox.getState().loadSandbox(file.sandbox)
      const objects: Record<ObjId, SceneObject> = {}
      for (const o of file.objects) objects[o.id] = o
      const order = file.objects.map((o) => o.id)
      // Units and precision come from the file; label preferences stay the viewer's own.
      const current = get().settings
      const settings: SceneSettings = {
        ...DEFAULT_SETTINGS,
        ...file.settings,
        ...Object.fromEntries(LABEL_PREFS.map((k) => [k, current[k]]))
      }
      set({
        objects,
        order,
        settings,
        ev: evalOf(objects, order, settings, 0),
        selection: [],
        past: [],
        future: [],
        time: 0,
        playing: false,
        filePath: path,
        dirty: false
      })
    },
    serialize: () => {
      const { objects, order, settings } = get()
      return { app: 'PhysLab', version: FILE_VERSION, objects: order.map((id) => objects[id]), settings, lab: useLab.getState().tables, sandbox: useSandbox.getState().snapshot() }
    },
    markSaved: (path) => set({ filePath: path, dirty: false })
  }
})

/** Convenience: read the current state outside React. */
export const scene = () => useScene.getState()

/**
 * What `serialize` gives straight after File ▸ New: the yardstick for "is there any work here?".
 * Built from the same pieces `newScene` uses, so a panel added later is measured too.
 */
export const blankSceneFile = (): SceneFile => ({
  app: 'PhysLab',
  version: FILE_VERSION,
  objects: [],
  settings: DEFAULT_SETTINGS,
  lab: [emptyTable()],
  sandbox: { bodies: startingScene(), links: [], world: DEFAULT_WORLD, sideView: true }
})

// Typing readings into a lab table changes the project as much as moving a point does, so Ctrl+S
// and the autosave have to notice. newScene and loadScene set dirty back to false afterwards.
useLab.subscribe(() => useScene.setState({ dirty: true }))
// The same for the Sandbox, which was never saved at all: only the parts that go into the file,
// not the live values published every tenth of a second.
useSandbox.subscribe((s, prev) => {
  if (s.bodies !== prev.bodies || s.links !== prev.links || s.world !== prev.world || s.sideView !== prev.sideView) useScene.setState({ dirty: true })
})

// Handy while developing: inspect the drawing from the browser console.
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __useScene?: typeof useScene }).__useScene = useScene
