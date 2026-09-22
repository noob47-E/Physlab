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

import { directDependents } from './evaluate'
import type { ObjId, ObjType, SceneFile, SceneObject, SceneSettings } from './types'
import type { Space } from './visibility'

/** The format `serialize` writes. Bump it when the file's shape changes and add the step below. */
export const FILE_VERSION: SceneFile['version'] = 3

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
  return file as unknown as SceneFile
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
  2: v2ToV3
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

/**
 * Format 3 only adds the Lego record a piece carries. A format-2 file never has one, but a file
 * edited by hand or written by a build in between might carry something under that name: a
 * record that is not `{ sourceId, pieceIndex, originalColor }` in the right types is dropped
 * without a word, and the polygon opens as an ordinary polygon, rather than the whole file being
 * refused over a field that only affects the Fuse button.
 */
function v2ToV3(file: Raw): Raw {
  const objects = file.objects as Raw[]
  return {
    ...file,
    version: 3,
    objects: objects.map((o) => {
      if (o.type !== 'polygon' || o.lego === undefined) return o
      // The signature is only what lets the pieces be recognised as the original shape; without
      // it they still move, turn and fuse into "a new shape".
      if (isLegoRecord(o.lego)) return typeof o.lego.sourceSignature === 'string' ? o : { ...o, lego: { ...o.lego, sourceSignature: '' } }
      const { lego: _dropped, ...rest } = o
      void _dropped
      return rest
    })
  }
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
