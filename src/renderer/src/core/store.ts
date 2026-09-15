import { create } from 'zustand'
import { produce, type Draft } from 'immer'
import { dependentsOf, evaluateScene } from './evaluate'
import type { EvalResult, ObjId, SceneFile, SceneObject, SceneSettings, ToolId, ViewMode } from './types'
import type { Solution } from '../math/vectorSolver'

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
  loadScene: (file: SceneFile, path?: string | null) => void
  serialize: () => SceneFile
  markSaved: (path: string) => void
}

export const DEFAULT_SETTINGS: SceneSettings = {
  angleUnit: 'deg',
  showGrid: true,
  showAxes: true,
  snap: true,
  decimals: 2,
  precisionMode: 'dp',
  unit: 'unit',
  unitPerSquare: 1,
  labelShow: 'hover',
  measureLabels: 'measure',
  pointLetters: true
}

/** Label preferences belong to the person using the app, so they survive restarts and opening files. */
const LABEL_PREFS = ['labelShow', 'measureLabels', 'pointLetters'] as const
const PREFS_KEY = 'physlab.labelPrefs'

function loadLabelPrefs(): Partial<SceneSettings> {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<SceneSettings>
    return migrateLabels(saved)
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

/** Older files used measureLabels: 'off' for hidden labels. */
function migrateLabels(s: Partial<SceneSettings>): Partial<SceneSettings> {
  if ((s.measureLabels as string) === 'off') return { ...s, measureLabels: 'measure', labelShow: s.labelShow ?? 'never' }
  return s
}

const INITIAL_SETTINGS: SceneSettings = { ...DEFAULT_SETTINGS, ...loadLabelPrefs() }

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
    loadScene: (file, path = null) => {
      const objects: Record<ObjId, SceneObject> = {}
      for (const o of file.objects) objects[o.id] = o
      const order = file.objects.map((o) => o.id)
      // Units and precision come from the file; label preferences stay the viewer's own.
      const current = get().settings
      const settings: SceneSettings = {
        ...DEFAULT_SETTINGS,
        ...migrateLabels(file.settings ?? {}),
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
      return { app: 'PhysLab', version: 1, objects: order.map((id) => objects[id]), settings }
    },
    markSaved: (path) => set({ filePath: path, dirty: false })
  }
})

/** Convenience: read the current state outside React. */
export const scene = () => useScene.getState()
