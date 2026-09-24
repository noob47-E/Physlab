// One door for every saved file. A .phys file records the format it was written in (`version`),
// and `migrate` walks it up to the format this build uses one version at a time, so a file from any
// earlier PhysLab still opens. Every step is a plain function of a plain object: nothing here
// touches a store, which is what lets `loadScene` refuse a bad file before anything is lost.
//
// The formats so far:
//   1  every build through 0.3.10. Objects and settings from the start; lab tables (0.3.3), the
//      sandbox (0.3.5) and each object's drawing (`space`, 0.3.6) were all added without a bump,
//      so a format-1 file may or may not carry them, and `measureLabels: 'off'` once meant "hide
//      the labels". A format-1 object with no `space` therefore means one of two things: the file
//      is older than 0.3.6 and nothing was ever stamped, or it is newer and the object was made
//      where no drawing was active (the Sandbox, say) and was meant to show everywhere. Whether
//      any object in the file is stamped tells the two apart.
//   2  0.3.11 to 0.6.1: written by a PhysLab that knows about spaces, so a missing `space` is
//      always deliberate and is left alone.
//   3  from 0.7: a polygon may carry `lego`, the record of the shape it was broken off from
//      (Geometry Lego). Nothing else changed; a format-2 file has no `lego` and comes through as
//      it was.
//   4  from 0.9: arrows are drawn in theme tokens (--vec-1 … --vec-6). An arrow in one of the eight
//      colours 0.6.1–0.7 handed out gets the token that took its colour's place, in `themed`, so it
//      follows the theme; a colour the student picked stays theirs because it is read as a hex.
//   5  from 0.9: the file may carry `questions`, the question set a teacher is writing in Question
//      Author. A format-4 file has none and comes through as it was; a question anywhere is
//      checked for its licence and its shape by `checkQuestions`, whatever the format says.

import { LICENSE_IDS } from '../questions/pqjson'
import { directDependents } from './evaluate'
import { OLD_ARROW_COLOURS, PALETTE, vectorToken } from './naming'
import type { ObjId, ObjType, SceneFile, SceneObject, SceneSettings } from './types'
import type { Space } from './visibility'

/** The format `serialize` writes. Bump it when the file's shape changes and add the step below. */
export const FILE_VERSION: SceneFile['version'] = 5

type Raw = Record<string, unknown>

const isRecord = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Turns the text of a .phys file into a scene in the current format, or throws an Error whose
 * message says in plain words what is wrong with it.
 */
export function parseSceneFile(text: string): SceneFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('This file cannot be read: it is not complete, or it is not a PhysLab project.')
  }
  return migrate(raw)
}

/**
 * Checks a parsed file and brings it up to `FILE_VERSION`. The input is never changed; the result
 * is a new object. Throws an Error with a readable message for anything that is not a project file.
 */
export function migrate(raw: unknown): SceneFile {
  let file = checkShape(raw)
  // Before the steps, not after: a step reads each object's id and type, and a null in the list
  // used to come out as a raw TypeError instead of a sentence.
  checkObjects(file)
  let version = file.version as number
  while (version < FILE_VERSION) {
    const step = STEPS[version]
    if (!step) throw new Error(`PhysLab does not know how to read format ${version} of a project file.`)
    file = step(file)
    version = file.version as number
  }
  return { ...file, objects: (file.objects as Raw[]).map(checkLego) } as unknown as SceneFile
}

/** The things every format has had: what makes a file a PhysLab project at all. */
function checkShape(raw: unknown): Raw {
  if (!isRecord(raw)) throw new Error('This is not a PhysLab project file.')
  if (raw.app !== 'PhysLab') throw new Error('This file was not saved by PhysLab.')
  const v = raw.version
  if (!Number.isInteger(v) || (v as number) < 1) throw new Error('This file does not say which PhysLab format it uses, so it cannot be opened.')
  if ((v as number) > FILE_VERSION) {
    throw new Error(`This file was saved by a newer PhysLab (format ${v}); this one reads up to format ${FILE_VERSION}. Please update PhysLab.`)
  }
  if (!Array.isArray(raw.objects)) throw new Error('This is not a PhysLab project: it has no objects in it.')
  if (raw.settings !== undefined && !isRecord(raw.settings)) throw new Error('The settings in this file are damaged.')
  if (raw.lab !== undefined) checkLab(raw.lab)
  if (raw.sandbox !== undefined) checkSandbox(raw.sandbox)
  if (raw.questions !== undefined) checkQuestions(raw.questions)
  return { ...raw }
}

const isV3 = (v: unknown): boolean => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number')

// The block checks look one level down, at what the panels read on their first render: a table
// with no columns or a body with no position used to load without a word and then crash the Lab
// panel or the Sandbox viewport, after the old scene was already gone.

/** Lab tables have had id, title, columns, rows and plot since they arrived in 0.3.3. */
function checkLab(lab: unknown): void {
  if (!Array.isArray(lab)) throw new Error('The lab tables in this file are damaged.')
  lab.forEach((t, i) => {
    const ok =
      isRecord(t) &&
      typeof t.id === 'string' &&
      typeof t.title === 'string' &&
      Array.isArray(t.columns) &&
      t.columns.every((c) => isRecord(c) && typeof c.id === 'string' && typeof c.name === 'string') &&
      Array.isArray(t.rows) &&
      t.rows.every((r) => Array.isArray(r)) &&
      isRecord(t.plot)
    if (!ok) throw new Error(`Lab table ${i + 1} in this file is damaged.`)
  })
}

/** The sandbox has had the same shape since 0.3.5; `world` and `sideView` may be left out. */
function checkSandbox(sb: unknown): void {
  if (!isRecord(sb) || !Array.isArray(sb.bodies)) throw new Error('The sandbox in this file is damaged.')
  sb.bodies.forEach((b, i) => {
    if (!isRecord(b) || typeof b.id !== 'string' || typeof b.shape !== 'string' || !isV3(b.size) || !isV3(b.position)) {
      throw new Error(`Body ${i + 1} in the sandbox is damaged.`)
    }
  })
  if (sb.links !== undefined) {
    if (!Array.isArray(sb.links)) throw new Error('The connections in the sandbox are damaged.')
    sb.links.forEach((l, i) => {
      if (!isRecord(l) || typeof l.id !== 'string' || typeof l.kind !== 'string' || typeof l.a !== 'string' || typeof l.b !== 'string') {
        throw new Error(`Connection ${i + 1} in the sandbox is damaged.`)
      }
    })
  }
  if (sb.world !== undefined && !isRecord(sb.world)) throw new Error('The world settings in the sandbox are damaged.')
  if (sb.sideView !== undefined && typeof sb.sideView !== 'boolean') throw new Error('The sandbox view setting in this file is damaged.')
}

const isStrings = (v: unknown): boolean => Array.isArray(v) && v.every((x) => typeof x === 'string')

/**
 * The question set Question Author writes (format 5), checked on every file whatever its format:
 * a lego record checked only on the way up from an older format let a damaged one through in a
 * file of the current format. Two things are checked, and only two, because a question in a
 * project is allowed to be half-written (a range still being typed, a part with no answer yet):
 *
 * - its licence: nothing may be used without one of the three PhysLab may carry, and the holder
 *   must at least be a string, though it may still be empty while the teacher writes;
 * - its shape: what the Author panel reads on its first render, down to each variable's rule and
 *   each part's fields. A question with no list of parts, a list variable with no items or a
 *   number part with no tolerance crashed the panel after the old scene was already gone, as a
 *   lab table with no columns once did.
 *
 * A file failing either is refused with a sentence naming the question, like any damaged block.
 */
const isNum = (v: unknown): v is number => typeof v === 'number'

/**
 * A variable's rule, down to what its row in the Variables tab reads: a list with no items or a
 * range with no ends passed a check on `kind` alone and then crashed the tab.
 */
function variableDefOk(d: unknown): boolean {
  if (!isRecord(d)) return false
  if (d.kind === 'range') return isNum(d.from) && isNum(d.to) && isNum(d.step) && (d.exclude === undefined || (Array.isArray(d.exclude) && d.exclude.every(isNum)))
  if (d.kind === 'list') return Array.isArray(d.items) && d.items.every(isNum)
  if (d.kind === 'expr') return typeof d.expr === 'string'
  return false
}

/** A part, down to what its card in the Solution tab reads (a number part's tolerance, a choice's options). */
function partOk(p: unknown): boolean {
  if (!isRecord(p) || typeof p.prompt !== 'string') return false
  if (p.type === 'number') {
    const t = p.tolerance
    return (
      typeof p.answer === 'string' &&
      typeof p.unit === 'string' &&
      isRecord(t) &&
      typeof t.kind === 'string' &&
      isNum(t.value) &&
      (p.traps === undefined || (Array.isArray(p.traps) && p.traps.every((x) => isRecord(x) && typeof x.value === 'string' && typeof x.why === 'string')))
    )
  }
  if (p.type === 'expression') return typeof p.answer === 'string' && isStrings(p.symbols)
  if (p.type === 'choice') return Array.isArray(p.choices) && p.choices.every((c) => isRecord(c) && typeof c.text === 'string' && typeof c.correct === 'boolean')
  return false
}

function checkQuestions(qs: unknown): void {
  if (!Array.isArray(qs)) throw new Error('The question set in this file is damaged.')
  qs.forEach((q, i) => {
    const who = isRecord(q) && typeof q.title === 'string' && q.title.trim() !== '' ? `Question '${q.title}'` : `Question ${i + 1}`
    if (!isRecord(q)) throw new Error(`${who} in this file is damaged.`)
    const l = q.license
    if (!isRecord(l) || typeof l.id !== 'string' || l.id.trim() === '') throw new Error(`${who} in this file says nothing about its licence, so PhysLab cannot use it.`)
    if (!(LICENSE_IDS as readonly string[]).includes(l.id)) throw new Error(`${who} in this file is licensed '${l.id}', which PhysLab may not use.`)
    if (typeof l.holder !== 'string') throw new Error(`${who} in this file does not say who holds its licence.`)
    const ok =
      typeof q.id === 'string' &&
      typeof q.title === 'string' &&
      typeof q.statement === 'string' &&
      Array.isArray(q.variables) &&
      q.variables.every((v) => isRecord(v) && typeof v.name === 'string' && variableDefOk(v.def)) &&
      Array.isArray(q.parts) &&
      q.parts.every(partOk) &&
      (q.steps === undefined || (isRecord(q.steps) && Array.isArray(q.steps.items) && q.steps.items.every((st) => isRecord(st) && typeof st.head === 'string'))) &&
      (q.tags === undefined || isStrings(q.tags))
    if (!ok) throw new Error(`${who} in this file is damaged.`)
  })
}

/** Each object must at least be something the evaluator can name and look up. */
function checkObjects(file: Raw): void {
  const objects = file.objects as unknown[]
  objects.forEach((o, i) => {
    if (!isRecord(o) || typeof o.id !== 'string' || typeof o.type !== 'string' || typeof o.name !== 'string') {
      throw new Error(`Object ${i + 1} in this file is damaged: it has no id, type or name.`)
    }
  })
  const seen = new Set<string>()
  for (const o of objects as Raw[]) {
    if (seen.has(o.id as string)) throw new Error(`This file lists the object "${o.name}" twice.`)
    seen.add(o.id as string)
  }
}

// ---------------------------------------------------------------------------
// The steps. STEPS[n] takes a format-n file and returns a format-(n+1) file.
// ---------------------------------------------------------------------------

const STEPS: Record<number, (file: Raw) => Raw> = {
  1: v1ToV2,
  2: v2ToV3,
  3: v3ToV4,
  4: v4ToV5
}

function v1ToV2(file: Raw): Raw {
  const objects = file.objects as SceneObject[]
  // A file with even one stamped object came from 0.3.6 or later, where an object left without a
  // space was made where no drawing was active and is meant to show everywhere; stamping it by
  // type would move a vector out of the Geometry and Graphing views a student used to see it in,
  // with no way to move it back. Only a file that never heard of spaces gets them worked out.
  const spaces = objects.some((o) => o.space) ? new Map<ObjId, Space>() : spacesForV1(objects)
  return {
    ...file,
    version: 2,
    settings: migrateLabelSettings((file.settings ?? {}) as Partial<SceneSettings>),
    objects: objects.map((o) => (spaces.has(o.id) ? { ...o, space: spaces.get(o.id) } : o))
  }
}

/** Format 3 only adds the Lego record a piece carries, which `checkLego` looks after for every format. */
function v2ToV3(file: Raw): Raw {
  return { ...file, version: 3 }
}

/**
 * Arrows in the colours 0.6.1–0.7 handed out are given the theme token that took each colour's place,
 * once, here: turning them into tokens every time a colour was read also turned a swatch the
 * student picked in Properties (the same eight hexes) into a token, so cyan showed as blue.
 *
 * There are six tokens for eight old colours (eight could not all stay apart for colour-blind
 * eyes). The first six map one to one. The seventh and eighth take the first tokens no other arrow
 * in the file uses, so a drawing that had them beside the first and second arrows does not show two
 * pairs in one colour; only a file already using all six falls back to the first and second, as a
 * new drawing's seventh and eighth arrows do. The command bar's gold sum is left as it is: it is
 * read as the resultant's token while drawing and is a student's own arrow, not a drawn answer.
 */
function v3ToV4(file: Raw): Raw {
  const objects = file.objects as Raw[]
  const isArrow = (o: Raw) => o.type === 'vector' && typeof o.color === 'string' && typeof o.themed !== 'string'
  const oldIndex = (o: Raw) => (isArrow(o) ? OLD_ARROW_COLOURS.indexOf((o.color as string).trim().toLowerCase()) : -1)
  const tokens = PALETTE.vector.map((_, i) => `--vec-${i + 1}`)
  const used = new Set<string>()
  for (const o of objects) {
    if (o.type !== 'vector') continue
    const i = oldIndex(o)
    const t = typeof o.themed === 'string' ? o.themed : i >= 0 && i < tokens.length ? tokens[i] : typeof o.color === 'string' ? vectorToken(o.color) : undefined
    if (t) used.add(t)
  }
  const extra = new Map<number, string>()
  for (let i = tokens.length; i < OLD_ARROW_COLOURS.length; i++) {
    if (!objects.some((o) => oldIndex(o) === i)) continue
    const free = tokens.find((t) => !used.has(t)) ?? tokens[i % tokens.length]
    extra.set(i, free)
    used.add(free)
  }
  return {
    ...file,
    version: 4,
    objects: objects.map((o) => {
      const i = oldIndex(o)
      if (i < 0) return o
      return { ...o, themed: i < tokens.length ? tokens[i] : extra.get(i) }
    })
  }
}

/**
 * Format 5 only adds the optional question set. A format-4 file never had one, and any that a
 * hand-edited file carries has already been through `checkQuestions`, so the step is the bump.
 */
function v4ToV5(file: Raw): Raw {
  return { ...file, version: 5 }
}

/**
 * A polygon's Lego record, checked on every file whatever its format. A format-2 file never has
 * one, but a file edited by hand or written by a build in between might carry something under that
 * name: a record that is not `{ sourceId, pieceIndex, originalColor }` in the right types is dropped
 * without a word, and the polygon opens as an ordinary polygon, rather than the whole file being
 * refused over a field that only affects the Fuse button. Checked only on the way up from format 2,
 * a bad record in a format-3 file opened as a piece, and letting go of it after a drag threw.
 */
function checkLego(o: Raw): Raw {
  if (o.type !== 'polygon' || o.lego === undefined) return o
  // The signature is only what lets the pieces be recognised as the original shape; without
  // it they still move, turn and fuse into "a new shape".
  if (isLegoRecord(o.lego)) return typeof o.lego.sourceSignature === 'string' ? o : { ...o, lego: { ...o.lego, sourceSignature: '' } }
  const { lego: _dropped, ...rest } = o
  void _dropped
  return rest
}

function isLegoRecord(v: unknown): v is Raw {
  return isRecord(v) && typeof v.sourceId === 'string' && typeof v.pieceIndex === 'number' && typeof v.originalColor === 'string'
}

/**
 * The first builds hid labels with `measureLabels: 'off'`; now `labelShow: 'never'` says when
 * and `measureLabels` only says what. Shared with the saved label preferences, which have no
 * version of their own.
 */
export function migrateLabelSettings(s: Partial<SceneSettings>): Partial<SceneSettings> {
  if ((s.measureLabels as string) === 'off') return { ...s, measureLabels: 'measure', labelShow: s.labelShow ?? 'never' }
  return s
}

/** Types whose drawing is never in doubt. */
const SPACE_BY_TYPE: Partial<Record<ObjType, Space>> = {
  graph: 'graphing',
  vector: 'vectors',
  segment: 'shapes',
  ray: 'shapes',
  line: 'shapes',
  circle: 'shapes',
  polygon: 'shapes',
  angle: 'shapes'
}

/**
 * Which drawing each object of a pre-0.3.6 file belongs to. There was one drawing then, so the
 * file cannot say; a graph, a vector or a shape tells by its type, and a point, number or text
 * goes with the first thing that uses it. Something nothing uses is left unstamped and shows in
 * every drawing, which is what a spaceless object means today too.
 */
export function spacesForV1(objects: SceneObject[]): Map<ObjId, Space> {
  const byId: Record<ObjId, SceneObject> = {}
  for (const o of objects) byId[o.id] = o
  const out = new Map<ObjId, Space>()
  for (const o of objects) {
    const s = SPACE_BY_TYPE[o.type]
    if (s) out.set(o.id, s)
  }
  const children = directDependents(byId)
  // A point used by a segment that is used by a polygon needs two passes; one pass per object is
  // always enough, and usually one or two in all.
  for (let pass = 0; pass < objects.length; pass++) {
    let changed = false
    for (const o of objects) {
      if (out.has(o.id)) continue
      const users = [...(children.get(o.id) ?? [])].sort((a, b) => objects.findIndex((x) => x.id === a) - objects.findIndex((x) => x.id === b))
      const first = users.find((c) => out.has(c))
      if (first) {
        out.set(o.id, out.get(first)!)
        changed = true
      }
    }
    if (!changed) break
  }
  return out
}
