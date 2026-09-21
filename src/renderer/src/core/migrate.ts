// One door for every saved file. A .phys file records the format it was written in (`version`),
// and `migrate` walks it up to the format this build uses one version at a time, so a file from any
// earlier PhysLab still opens. Every step is a plain function of a plain object: nothing here
// touches a store, which is what lets `loadScene` refuse a bad file before anything is lost.
//
// The formats so far:
//   1  0.3.0 – 0.3.5: objects and settings; lab tables and the sandbox arrived as optional blocks
//      without a version bump, and `measureLabels: 'off'` once meant "hide the labels".
//   2  0.3.6 onwards: every object carries the drawing (`space`) it belongs to.

import { directDependents } from './evaluate'
import type { ObjId, ObjType, SceneFile, SceneObject, SceneSettings } from './types'
import type { Space } from './visibility'

/** The format `serialize` writes. Bump it when the file's shape changes and add the step below. */
export const FILE_VERSION: SceneFile['version'] = 2

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
  let version = file.version as number
  while (version < FILE_VERSION) {
    const step = STEPS[version]
    if (!step) throw new Error(`PhysLab does not know how to read format ${version} of a project file.`)
    file = step(file)
    version = file.version as number
  }
  checkObjects(file)
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
  if (raw.lab !== undefined && !Array.isArray(raw.lab)) throw new Error('The lab tables in this file are damaged.')
  if (raw.sandbox !== undefined && !(isRecord(raw.sandbox) && Array.isArray(raw.sandbox.bodies))) throw new Error('The sandbox in this file is damaged.')
  return { ...raw }
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
  1: v1ToV2
}

function v1ToV2(file: Raw): Raw {
  const objects = file.objects as SceneObject[]
  const spaces = spacesForV1(objects)
  return {
    ...file,
    version: 2,
    settings: migrateLabelSettings((file.settings ?? {}) as Partial<SceneSettings>),
    objects: objects.map((o) => (o.space || !spaces.has(o.id) ? o : { ...o, space: spaces.get(o.id) }))
  }
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
 * Which drawing each object of a format-1 file belongs to. Before 0.3.6 there was one drawing, so
 * the file cannot say; a graph, a vector or a shape tells by its type, and a point, number or text
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
