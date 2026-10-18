import { create } from 'zustand'
import { produce, type Draft } from 'immer'
import { evaluateScene } from './evaluate'
import { setNotation } from '../math/format'
import type { EvalResult, ObjId, PolygonObj, SceneFile, SceneObject, SceneSettings, ToolId, ViewMode } from './types'
import type { Solution } from '../math/vectorSolver'
import { emptyTable, useLab } from '../lab/labStore'
import { startingScene, useSandbox } from '../sim/store'
import { DEFAULT_WORLD } from '../sim/types'
import { FILE_VERSION, migrate, migrateLabelSettings } from './migrate'
import { renameInObjects, renameProblem } from './rename'
import type { Space } from './visibility'
import { formatMeasure } from '../math/format'
import { flipPiece as flipCorners, fusePlan, legoParts, legoStatus, ONE_PIECE_SENTENCE, signatureOf, snapToCorners, snapTolerance, tintPiece, turnPiece as turnCorners } from '../math/lego'
import type { V3 } from '../math/vec'
import { classifyPolygon } from '../math/shapes'
import { storedJson } from './schema'
import { doomedBy } from './doomed'
import { consumeShapes, cornersOf, dropPieceCorners, isPiece, legoNewColor, makePolygon, movedPieces, restoreCornerNames, type Piece } from './legoScene'

export interface LogEntry {
  id: number
  /** What was typed into the bar; empty for a line a button wrote. */
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
  /** Bumped to ask panels to focus (e.g. the Vector Calculator tab). */
  focusPanel: { id: string; nonce: number } | null

  addObjects: (objs: SceneObject[], opts?: { select?: boolean; record?: boolean }) => void
  updateObject: (id: ObjId, recipe: (draft: Draft<SceneObject>) => void, record?: boolean) => void
  /**
   * `record: false` removes without an undo step of its own: the Vector Calculator takes away a
   * drawn answer whose vectors were removed, and the undo that brings them back brings it back.
   */
  removeObjects: (ids: ObjId[], opts?: { record?: boolean }) => void
  /** The objects in a new order (the Expressions list's Move up / Move down), as one undo step. */
  setOrder: (order: ObjId[]) => void
  /**
   * Geometry Lego. `breakApart` turns a decomposed polygon into one free polygon per part, each
   * a rigid piece the student slides, turns and flips; `fusePieces` joins touching shapes —
   * pieces of one shape, of several, or shapes the student drew — into one polygon and returns
   * the sentence that says why it could not, or null when it did. Each is one undo step.
   */
  breakApart: (id: ObjId) => void
  fusePieces: (ids: ObjId[]) => string | null
  turnPiece: (id: ObjId, deg: number) => void
  flipPiece: (id: ObjId) => void
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

export { doomedBy, sidesOf } from './doomed'

export const DEFAULT_SETTINGS: SceneSettings = {
  angleUnit: 'deg',
  showGrid: true,
  gridStyle: 'lines',
  showAxes: true,
  showAxisNumbers: true,
  grid3d: 'floor',
  workZ: 0,
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
    return migrateLabelSettings((storedJson(localStorage.getItem(PREFS_KEY)) ?? {}) as Partial<SceneSettings>)
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

  // REGION L: Geometry Lego.
  /** Puts a piece's free corners where `place` says, as one undo step (none when `rec` is false). */
  const moveCorners = (id: ObjId, place: (pts: V3[]) => V3[], rec = true) => {
    const { objects, order, ev, gesture } = get()
    const piece = objects[id]
    const pts = cornersOf(id, ev)
    if (piece?.type !== 'polygon' || !pts) return
    const next = place(pts)
    const history = rec && !gesture ? record() : {}
    const nextObjects = { ...objects }
    piece.points.forEach((pid, k) => {
      const pt = nextObjects[pid]
      if (pt?.type === 'point' && pt.def.kind === 'free') nextObjects[pid] = { ...pt, def: { kind: 'free', p: next[k] } }
    })
    commit(nextObjects, order, history)
  }

  /** A piece just let go: pull it corner to corner against its siblings, then fuse if they make the original shape again. */
  const settlePiece = (piece: Piece) => {
    const { objects, ev } = get()
    const siblings = Object.values(objects).filter((o): o is Piece => isPiece(o) && o.id !== piece.id && o.lego.sourceId === piece.lego.sourceId)
    const own = cornersOf(piece.id, ev)
    if (!own || siblings.length === 0) return
    const targets = siblings.flatMap((s) => cornersOf(s.id, ev) ?? [])
    const snap = snapToCorners(own, [0, 0, 0], targets, snapTolerance(own))
    if (snap.snapped) moveCorners(piece.id, (pts) => pts.map((p) => [p[0] + snap.delta[0], p[1] + snap.delta[1], 0] as V3), false)
    const after = get().ev
    const all = [piece, ...siblings].map((p) => cornersOf(p.id, after))
    if (all.some((c) => !c)) return
    // Only the shape they came from fuses by itself. A new outline is somewhere on the way for a
    // student still arranging the pieces: an L's foot lifted by one unit turned at once into a
    // "Concave octagon" nobody asked for. The Measure panel offers Fuse for that instead.
    if (legoStatus(all as V3[][], piece.lego.sourceSignature).kind === 'original') get().fusePieces([piece, ...siblings].map((p) => p.id))
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

    setOrder: (next) => {
      const { objects, order } = get()
      // Only a reordering of the same objects: anything else is not this action's to do.
      if (next.length !== order.length || next.some((id) => !objects[id]) || next.every((id, i) => id === order[i])) return
      commit(objects, next, record())
    },

    removeObjects: (ids, opts = {}) => {
      const { objects, order, selection, hovered } = get()
      const doomed = doomedBy(ids, objects, order)
      if (doomed.size === 0) return
      dropPieceCorners(doomed, objects) // REGION L: a Lego piece's corners go with it
      const history = opts.record === false ? {} : record()
      const nextObjects = { ...objects }
      for (const id of doomed) delete nextObjects[id]
      commit(
        nextObjects,
        order.filter((id) => !doomed.has(id)),
        // A deleted object cannot stay hovered: nothing would ever send the mouse-leave.
        { ...history, selection: selection.filter((id) => !doomed.has(id)), hovered: hovered && doomed.has(hovered) ? null : hovered }
      )
    },

    // ---- REGION L: Geometry Lego ----
    breakApart: (id) => {
      const { objects, order, ev, selection, hovered } = get()
      const parent = objects[id]
      const pts = cornersOf(id, ev)
      if (parent?.type !== 'polygon' || !pts) return
      // Pieces are flat shapes on the page: one off it would be pressed flat onto z = 0 (an upright
      // triangle was "already a simple shape", a tilted one fell to the floor in pieces).
      if (pts.some((p) => p[2] !== 0)) {
        get().pushLog({ input: '', kind: 'info', text: 'Only a shape lying flat on the page (every corner at z = 0) can be broken apart into pieces.' })
        return
      }
      // A simple shape (a rectangle, a triangle) is cut in two rather than refused.
      const parts = legoParts(pts, parent.decomposeGoal ?? 'basic', parent.decomposeIndex ?? 0)
      if (parts.length < 2) {
        get().pushLog({ input: '', kind: 'info', text: 'This is already a simple shape: there is nothing to break apart.' })
        return
      }
      const doomed = consumeShapes([id], objects, order)
      const history = record()
      const nextObjects: Record<ObjId, SceneObject> = {}
      for (const [k, o] of Object.entries(objects)) if (!doomed.has(k)) nextObjects[k] = o
      const nextOrder = order.filter((k) => !doomed.has(k))
      const signature = signatureOf(pts)
      const retired = [...doomed].map((k) => objects[k].name)
      // Where each corner stood and what it was called, carried by every piece, so the shape fused
      // back into its outline gets its own letters again instead of the next free ones.
      const originalCorners = parent.points.map((k, i) => ({ p: [...pts[i]] as V3, name: objects[k]?.name ?? '' }))
      const pieceIds: ObjId[] = []
      parts.forEach((part, i) => {
        const made = makePolygon(
          part.pts,
          {
            color: tintPiece(parent.color, i, parts.length),
            space: parent.space,
            lego: { sourceId: parent.id, sourceSignature: signature, pieceIndex: i, originalColor: parent.color, originalCorners },
            piece: true,
            label: part.cls.name,
            reserved: retired
          },
          nextObjects
        )
        for (const o of made) nextOrder.push(o.id)
        pieceIds.push(made.find((o) => o.type === 'polygon')!.id)
      })
      commit(nextObjects, nextOrder, {
        ...history,
        selection: [...selection.filter((k) => !doomed.has(k)), ...pieceIds],
        hovered: hovered && doomed.has(hovered) ? null : hovered
      })
      // Named as the student sees it (Rectangle DCBA); "poly1 is now 2 pieces" read like code.
      const called = `${classifyPolygon(pts).name} ${parent.points.map((k) => objects[k]?.name ?? '').join('')}`
      get().pushLog({ input: '', kind: 'info', text: `${called} is now ${parts.length} pieces. Slide, turn and flip them; put back together, they fuse on their own.` })
    },

    fusePieces: (ids) => {
      const { objects, order, ev, settings, selection, hovered } = get()
      const shapes = [...new Set(ids)].map((k) => objects[k]).filter((o): o is PolygonObj => o?.type === 'polygon')
      const say = (text: string): string => {
        get().pushLog({ input: '', kind: 'info', text })
        return text
      }
      if (shapes.length < 2) return say(ONE_PIECE_SENTENCE)
      const corners = shapes.map((p) => cornersOf(p.id, ev))
      if (corners.some((c) => !c)) return say('One of the shapes cannot be drawn, so they cannot be fused.')
      // Only some of one shape's pieces: the result is a bigger piece of the same shape, not a
      // new shape. Said as "same area" it was false (12 u² against the original's 20 u²), and
      // made a plain shape it left the pieces still apart with no sibling to fuse back into.
      const inFuse = new Set(shapes.map((p) => p.id))
      const source = shapes[0].lego
      const othersLeft = !!source && Object.values(objects).some((o) => isPiece(o) && o.lego.sourceId === source.sourceId && !inFuse.has(o.id))
      const plan = fusePlan(
        shapes.map((p, k) => ({ pts: corners[k]!, lego: p.lego })),
        othersLeft
      )
      if (!plan.ok) return say(plan.sentence)
      const doomed = consumeShapes(
        shapes.map((p) => p.id),
        objects,
        order
      )
      const history = record()
      const nextObjects: Record<ObjId, SceneObject> = {}
      for (const [k, o] of Object.entries(objects)) if (!doomed.has(k)) nextObjects[k] = o
      const nextOrder = order.filter((k) => !doomed.has(k))
      const space = shapes[0].space
      const made = makePolygon(
        plan.outline,
        plan.kind === 'partial' && plan.source
          ? {
              color: shapes[0].color,
              space,
              piece: true,
              label: plan.name,
              lego: { ...plan.source, pieceIndex: Math.min(...shapes.map((p) => p.lego?.pieceIndex ?? 0)) }
            }
          : plan.kind === 'original' && plan.source
            ? // The shape again, as it was drawn: its own colour, filled whole. Given `decomposed`
              // it was drawn in the first part colour instead — the owner's purple rectangle came
              // back blue (Fix 18).
              { color: plan.source.originalColor, space, piece: false, decomposed: false }
            : // A new shape is drawn in the theme's own new-shape colour, looked up at draw time
              // so it follows a theme switch, and whole: the I/II split drawn over it hid the fill.
              { color: legoNewColor(shapes[0].color), themed: '--lego-new', space, piece: false, decomposed: false },
        nextObjects
      )
      // The shape again keeps the letters it had before Break apart; any other result is lettered fresh.
      if (plan.kind === 'original') restoreCornerNames(made, shapes.find((p) => p.lego?.originalCorners)?.lego?.originalCorners ?? [], nextObjects)
      for (const o of made) nextOrder.push(o.id)
      const poly = made.find((o) => o.type === 'polygon')!
      commit(nextObjects, nextOrder, {
        ...history,
        selection: [...selection.filter((k) => !doomed.has(k)), poly.id],
        hovered: hovered && doomed.has(hovered) ? null : hovered
      })
      const measures = `area ${formatMeasure(plan.area, 'area', settings)}, perimeter ${formatMeasure(plan.perimeter, 'length', settings)}`
      const oneShape = shapes.every((p) => p.lego && p.lego.sourceId === source?.sourceId)
      get().pushLog({
        input: '',
        kind: 'info',
        text:
          plan.kind === 'original'
            ? 'Back to the original shape.'
            : plan.kind === 'partial'
              ? `These pieces make a ${plan.name}: ${measures}.`
              : oneShape
                ? `A new shape — same area, different outline: ${plan.name}, ${measures}.`
                : `Fused into one new shape: ${plan.name}, ${measures}.`
      })
      return null
    },

    turnPiece: (id, deg) => moveCorners(id, (pts) => turnCorners(pts, deg)),
    flipPiece: (id) => moveCorners(id, flipCorners),

    clearDrawing: () => {
      const { order, objects, activeSpace } = get()
      // "This drawing" needs a drawing. With none active (the Sandbox, the GPU Lab) visibleOrder
      // was once every object in every drawing, and the command wiped all four from a mode where
      // none of them was even on screen — and where Ctrl+Z went to the sandbox's own history.
      if (!activeSpace) return
      get().removeObjects(order.filter((id) => objects[id]?.space === activeSpace))
    },

    beginGesture: () => {
      if (get().gesture) return
      set({ ...record(), gesture: true, baseline: get().ev.values })
    },
    endGesture: () => {
      const { gesture, past, objects } = get()
      set({ gesture: false, baseline: null })
      // REGION L: a piece let go near its neighbours is pulled corner to corner, and pieces
      // that now make one shape fuse on their own. Only a single piece dragged as a whole counts;
      // the snap folds into the drag's own undo step, the fuse is a step of its own.
      const before = past[past.length - 1]
      if (!gesture || !before) return
      const moved = movedPieces(before.objects, objects)
      if (moved.length === 1) settlePiece(moved[0])
    },

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
    showSolution: (solution) => set({ solution, focusPanel: { id: 'vectorcalc', nonce: Date.now() } }),
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
      // Question Author was taken out of PhysLab: a file saved with a teacher's question set opens
      // without it, and says so once.
      const droppedSet = typeof raw === 'object' && raw !== null && Array.isArray((raw as { questions?: unknown }).questions) && (raw as { questions: unknown[] }).questions.length > 0
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
      if (droppedSet) get().pushLog({ input: 'open', kind: 'info', text: QUESTION_SET_LEFT_OUT })
    },
    serialize: () => {
      const { objects, order, settings } = get()
      return { app: 'PhysLab', version: FILE_VERSION, objects: order.map((id) => objects[id]), settings, lab: useLab.getState().tables, sandbox: useSandbox.getState().snapshot() }
    },
    markSaved: (path) => set({ filePath: path, dirty: false })
  }
})

/** Said once when a file from before 0.9 carries a question set written in Question Author. */
export const QUESTION_SET_LEFT_OUT = 'This file also holds a question set written in Question Author, which is no longer part of PhysLab. Everything else in it has opened; the question set was left out.'

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
