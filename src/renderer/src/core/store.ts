import { create } from 'zustand'
import { produce, type Draft } from 'immer'
import { dependentsOf, evaluateScene } from './evaluate'
import { setNotation } from '../math/format'
import type { EvalResult, ObjId, PointObj, PolygonObj, SceneFile, SceneObject, SceneSettings, SegmentObj, ToolId, ViewMode } from './types'
import type { Solution } from '../math/vectorSolver'
import { emptyTable, useLab } from '../lab/labStore'
import { startingScene, useSandbox } from '../sim/store'
import { useAuthor } from '../questions/authorStore'
import { DEFAULT_WORLD } from '../sim/types'
import { FILE_VERSION, migrate, migrateLabelSettings } from './migrate'
import { renameInObjects, renameProblem } from './rename'
import { visibleOrder, type Space } from './visibility'
import { newId, nextName } from './naming'
import { themeColor } from '../app/theme'
import { formatMeasure } from '../math/format'
import { flipPiece as flipCorners, fusePlan, legoParts, legoStatus, ONE_PIECE_SENTENCE, signatureOf, snapToCorners, snapTolerance, tintPiece, turnPiece as turnCorners } from '../math/lego'
import type { V3 } from '../math/vec'
import { classifyPolygon } from '../math/shapes'

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
  /** Bumped to ask panels to focus (e.g. the Solver tab). */
  focusPanel: { id: string; nonce: number } | null

  addObjects: (objs: SceneObject[], opts?: { select?: boolean; record?: boolean }) => void
  updateObject: (id: ObjId, recipe: (draft: Draft<SceneObject>) => void, record?: boolean) => void
  /**
   * `record: false` removes without an undo step of its own: the Vector Calculator takes away a
   * drawn answer whose vectors were removed, and the undo that brings them back brings it back.
   */
  removeObjects: (ids: ObjId[], opts?: { record?: boolean }) => void
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

/**
 * A shape's own sides: the segments the tool laid down with it. `Builder.polygon` pushes the
 * polygon and then one segment per side, so they are the segments that follow the polygon in
 * `order`, each joining two consecutive corners, up to one per side. A segment the student drew
 * before the shape existed (a loop `closeLoopIfAny` recognised) comes earlier in `order` and is
 * theirs to keep; a side a neighbouring shape laid over the same two corners follows *that*
 * shape and is not this one's. A quadrilateral's diagonal joins corners that are not consecutive
 * and is never a side.
 */
export function sidesOf(poly: PolygonObj, objects: Record<ObjId, SceneObject>, order: ObjId[]): ObjId[] {
  const n = poly.points.length
  const pairs = new Set<string>()
  for (let i = 0; i < n; i++) {
    const a = poly.points[i]
    const b = poly.points[(i + 1) % n]
    pairs.add(`${a}|${b}`)
    pairs.add(`${b}|${a}`)
  }
  const start = order.indexOf(poly.id)
  if (start < 0) return []
  const sides: ObjId[] = []
  for (let i = start + 1; i < order.length && sides.length < n; i++) {
    const o = objects[order[i]]
    if (o?.type !== 'segment' || !pairs.has(`${o.a}|${o.b}`)) break
    sides.push(o.id)
  }
  return sides
}

/**
 * Everything a delete takes: the objects named, whatever was built on them, and a shape's sides.
 * The Triangle and Polygon tools draw a shape as a polygon plus one segment per side, and the
 * sides depend on the corner points, not on the polygon — so deleting the triangle used to leave
 * its three sides on screen, indistinguishable from the triangle just deleted. The corners stay:
 * they are the student's points, and other objects may be built on them.
 */
export function doomedBy(ids: ObjId[], objects: Record<ObjId, SceneObject>, order: ObjId[]): Set<ObjId> {
  const doomed = new Set<ObjId>()
  const take = (id: ObjId) => {
    if (doomed.has(id)) return
    doomed.add(id)
    for (const d of dependentsOf(id, objects)) doomed.add(d)
  }
  for (const id of ids) take(id)
  // A side's dependents can doom a second shape (a point placed on side BC is a corner of PQR),
  // so the walk must reach shapes doomed along the way; a snapshot taken before the loop left
  // PQR's far side on screen — the same stray outline one level down.
  for (const id of doomed) {
    const o = objects[id]
    if (o?.type === 'polygon') for (const side of sidesOf(o, objects, order)) take(side)
  }
  // A caption goes with what it describes; it is not a dependency, since nothing in it is computed from its owner.
  for (const o of Object.values(objects)) if (o.type === 'text' && o.owner && doomed.has(o.owner)) doomed.add(o.id)
  return doomed
}

// ---------------------------------------------------------------------------
// REGION L: Geometry Lego — the scene-side helpers behind breakApart and fusePieces.
// ---------------------------------------------------------------------------

/** A polygon that is a piece of a broken-apart shape. */
type Piece = PolygonObj & { lego: NonNullable<PolygonObj['lego']> }
const isPiece = (o: SceneObject | undefined): o is Piece => o?.type === 'polygon' && !!o.lego

/** The corners of a polygon as evaluated, or null when it cannot be drawn. */
function cornersOf(id: ObjId, ev: EvalResult): V3[] | null {
  const c = ev.values.get(id)
  return c?.type === 'polygon' && c.pts.length >= 3 ? c.pts : null
}

/**
 * The corner points of `polygons` that nothing outside `doomed` uses, added to `doomed`. The
 * Polygon tool's own rule ("drop a corner nothing else needs", private to render/tools.ts),
 * applied here after the shape and its sides are already on the list: a corner that is also a
 * corner of a neighbouring triangle, or carries a student's own segment, stays. Repeats until
 * nothing changes, because a corner defined from another corner (a midpoint, say) frees that
 * one only once it is gone itself.
 */
function dropUnusedCorners(polygons: PolygonObj[], objects: Record<ObjId, SceneObject>, doomed: Set<ObjId>): void {
  for (;;) {
    let changed = false
    for (const poly of polygons) {
      for (const pid of poly.points) {
        if (doomed.has(pid) || !objects[pid]) continue
        if ([...dependentsOf(pid, objects)].every((d) => doomed.has(d))) {
          doomed.add(pid)
          changed = true
        }
      }
    }
    if (!changed) return
  }
}

/**
 * A deleted piece takes its corners with it. `doomedBy` keeps a shape's corners because they are
 * the student's points; a piece's corners are not — Break apart made them for the piece — and
 * left behind they sat in the scene (hidden, in a 0.7.0 file), were written into the file and
 * counted as unsaved work. A corner goes only when everything built on it is going too (a
 * segment a student drew between two of them keeps both).
 */
function dropPieceCorners(doomed: Set<ObjId>, objects: Record<ObjId, SceneObject>): void {
  const pieces = [...doomed].map((id) => objects[id]).filter(isPiece)
  if (pieces.length > 0) dropUnusedCorners(pieces, objects, doomed)
}

/**
 * The rest of a shape's outline, added to `doomed`: segments joining two consecutive corners
 * that are not the shape's `sidesOf`. A shape drawn side by side with the Segment tool is
 * recognised (`closeLoopIfAny`) only after its four segments exist, so they come *before* it in
 * `order` and sidesOf rightly leaves them to a Delete. Break apart and Fuse turn the shape into
 * something else, though, and left behind those segments were the "old frame" still drawn round
 * the pieces (Fix 17). A segment stays when another shape that is staying runs along it too, or
 * when something that is staying is built on it.
 */
function dropFrame(polys: PolygonObj[], objects: Record<ObjId, SceneObject>, order: ObjId[], doomed: Set<ObjId>): void {
  const key = (a: ObjId, b: ObjId) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  const edges = (p: PolygonObj) => p.points.map((a, i) => key(a, p.points[(i + 1) % p.points.length]))
  const going = new Set(polys.flatMap(edges))
  // An edge a staying shape needs drawn: only a shape with no sides of its own (one recognised
  // from loose segments) is drawn by whatever segment runs there. A Triangle-tool shape on the
  // same two corners draws that edge with its own side, and the going shape's copy is surplus.
  const kept = new Set<string>()
  const ownSides = new Set<ObjId>()
  for (const o of Object.values(objects)) {
    if (o.type !== 'polygon' || doomed.has(o.id)) continue
    const sides = sidesOf(o, objects, order)
    if (sides.length === 0) for (const e of edges(o)) kept.add(e)
    for (const sid of sides) ownSides.add(sid)
  }
  for (const o of Object.values(objects)) {
    if (o.type !== 'segment' || doomed.has(o.id) || ownSides.has(o.id)) continue
    const k = key(o.a, o.b)
    if (!going.has(k) || kept.has(k)) continue
    if ([...dependentsOf(o.id, objects)].every((d) => doomed.has(d))) doomed.add(o.id)
  }
}

/**
 * Everything that goes when shapes are broken apart or fused: each shape, whatever was built on
 * it, its sides, the rest of its frame, and its corners once nothing staying needs them.
 */
function consumeShapes(ids: ObjId[], objects: Record<ObjId, SceneObject>, order: ObjId[]): Set<ObjId> {
  const doomed = doomedBy(ids, objects, order)
  const polys = ids.map((k) => objects[k]).filter((o): o is PolygonObj => o?.type === 'polygon')
  dropFrame(polys, objects, order, doomed)
  dropUnusedCorners(polys, objects, doomed)
  return doomed
}

/**
 * Objects a piece or a fused shape is made of: corner points, the polygon and its sides. A piece
 * (`piece`) has letters of its own like any shape, but its corners and sides are locked: dragging
 * one would bend it, and a piece moves only as one brick. `reserved` names are not handed out —
 * the letters of the shape just broken, so the pieces read as new shapes rather than as the old
 * one's corners come back.
 */
function makePolygon(
  pts: V3[],
  opts: { color: string; themed?: string; space: Space | undefined; lego?: PolygonObj['lego']; piece: boolean; decomposed?: boolean; label?: string; reserved?: string[] },
  pool: Record<ObjId, SceneObject>
): SceneObject[] {
  const out: SceneObject[] = []
  const take = <T extends SceneObject>(o: T): T => {
    out.push(o)
    pool[o.id] = o
    return o
  }
  const base = { visible: true, locked: false, showLabel: true, space: opts.space, ...(opts.themed ? { themed: opts.themed } : {}) }
  const polyName = nextName('polygon', pool)
  const polyId = newId()
  const corners = pts.map((p) =>
    take<PointObj>({
      ...base,
      id: newId(),
      // Every piece is lettered like any other shape (Fix 17): the hidden helpers named poly2_1
      // that 0.7.0 gave a piece left it with no letters at all, so a student could not say
      // "triangle EFG" or compare two pieces by their corners.
      name: nextName('point', pool, opts.reserved),
      type: 'point',
      def: { kind: 'free', p },
      color: opts.color,
      locked: opts.piece
    })
  )
  const ids = corners.map((c) => c.id)
  take<PolygonObj>({
    ...base,
    id: polyId,
    name: polyName,
    type: 'polygon',
    points: ids,
    fill: true,
    showAngles: false,
    color: opts.color,
    decomposed: opts.decomposed,
    // What the piece was cut as ("Right-angled triangle"); the chip adds its letters.
    label: opts.label,
    lego: opts.lego
  })
  // Sides follow the polygon in `order`, one per side, which is how sidesOf finds them again.
  // A piece's sides are locked: dragging a side moves only its two corners, and a piece must
  // move as one brick or not at all.
  ids.forEach((a, k) =>
    take<SegmentObj>({
      ...base,
      id: newId(),
      name: nextName('segment', pool),
      type: 'segment',
      a,
      b: ids[(k + 1) % ids.length],
      color: opts.color,
      locked: opts.piece
    })
  )
  return out
}

/** The colour of a shape fused into a new outline, from the theme; a test has no stylesheet and keeps the piece's colour. */
const legoNewColor = (fallback: string): string => (typeof document === 'undefined' ? fallback : themeColor('--lego-new', fallback))

/** Pieces of a shape whose corners changed place between two states of the scene: what the student just dragged. */
function movedPieces(before: Record<ObjId, SceneObject>, after: Record<ObjId, SceneObject>): Piece[] {
  const out: Piece[] = []
  for (const o of Object.values(after)) {
    if (!isPiece(o) || before[o.id] !== o) continue
    const moved = o.points.some((pid) => {
      const a = before[pid]
      const b = after[pid]
      return a?.type === 'point' && b?.type === 'point' && a.def.kind === 'free' && b.def.kind === 'free' && (a.def.p[0] !== b.def.p[0] || a.def.p[1] !== b.def.p[1])
    })
    if (moved) out.push(o)
  }
  return out
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
      const pieceIds: ObjId[] = []
      parts.forEach((part, i) => {
        const made = makePolygon(
          part.pts,
          {
            color: tintPiece(parent.color, i, parts.length),
            space: parent.space,
            lego: { sourceId: parent.id, sourceSignature: signature, pieceIndex: i, originalColor: parent.color },
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
      get().removeObjects(visibleOrder(order, objects, activeSpace))
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
    showSolution: (solution) => set({ solution, focusPanel: { id: 'solver', nonce: Date.now() } }),
    requestFocus: (id) => set({ focusPanel: { id, nonce: Date.now() } }),

    newScene: () => {
      useLab.getState().setTables([])
      useSandbox.getState().loadSandbox()
      useAuthor.getState().setQuestions([])
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
      useAuthor.getState().setQuestions(file.questions ?? [])
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
      // An empty question set is left out, so a project with none is the same file it was in format 4.
      const questions = useAuthor.getState().questions
      return { app: 'PhysLab', version: FILE_VERSION, objects: order.map((id) => objects[id]), settings, lab: useLab.getState().tables, sandbox: useSandbox.getState().snapshot(), ...(questions.length ? { questions } : {}) }
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

// A question written in Question Author is work too; moving between questions is not.
useAuthor.subscribe((s, prev) => {
  if (s.questions !== prev.questions) useScene.setState({ dirty: true })
})

// Handy while developing: inspect the drawing from the browser console.
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __useScene?: typeof useScene }).__useScene = useScene
