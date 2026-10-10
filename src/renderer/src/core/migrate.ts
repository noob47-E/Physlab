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
//   5  from 0.9: the file may carry `questions`, the question set a teacher was writing in Question
//      Author. Question Author has since been taken out of PhysLab: a set in any file is left out
//      when it opens (`migrate`), never checked or refused, and the rest of the file opens as it was.
//   6  from 0.9: a question in the set may use the question-file format 2 — vector, matrix, roots,
//      function, proof and Lego parts, a number marked against the student's stated uncertainty,
//      error carried forward, a part shown only under a condition, a rung and a "Go deeper" link.
//      A format-5 PhysLab would call such a question damaged; format 6 makes it say "saved by a
//      newer PhysLab" instead. A format-5 file comes through as it was.

import { directDependents } from './evaluate'
import { OLD_ARROW_COLOURS, PALETTE, vectorToken } from './naming'
import type { ObjId, ObjType, SceneFile, SceneObject, SceneSettings } from './types'
import type { Space } from './visibility'
import { checkLab, checkObjects, checkSandbox, isRecord, type Raw } from './schema'

/** The format `serialize` writes. Bump it when the file's shape changes and add the step below. */
export const FILE_VERSION: SceneFile['version'] = 7

/**
 * Turns the text of a .phys file into a scene in the current format, or throws an Error whose
 * message says in plain words what is wrong with it.
 */
export function parseSceneFile(text: string): SceneFile {
  return migrate(parseProjectText(text))
}

/**
 * The text of a .phys file as its raw JSON, with the same sentence for a half-copied file.
 * Exported apart because `loadScene` reads what a file held before it was migrated — a Question
 * Author set, which `migrate` leaves out — so the open path hands `loadScene` the raw object and
 * its own `migrate` does the converting, where the check still sees the set (browser check SHELL-02, F2).
 */
export function parseProjectText(text: string): unknown {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('This file cannot be read: it is not complete, or it is not a PhysLab project.')
  }
  return raw
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
  const out: Raw = { ...file, objects: (file.objects as Raw[]).map(checkLego) }
  // A question set from Question Author (formats 5–7), which this PhysLab no longer has, is left out.
  delete out.questions
  return out as unknown as SceneFile
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

// ---------------------------------------------------------------------------
// The steps. STEPS[n] takes a format-n file and returns a format-(n+1) file.
// ---------------------------------------------------------------------------

const STEPS: Record<number, (file: Raw) => Raw> = {
  1: v1ToV2,
  2: v2ToV3,
  3: v3ToV4,
  4: v4ToV5,
  5: v5ToV6,
  6: v6ToV7
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

/** Format 5 only added the optional question set (left out on opening now), so the step is the bump. */
function v4ToV5(file: Raw): Raw {
  return { ...file, version: 5 }
}

/** Format 6 only let the question set hold format-2 questions, so the step is the bump. */
function v5ToV6(file: Raw): Raw {
  return { ...file, version: 6 }
}

/**
 * Format 7 lets a Lab Data cell keep the text it was typed with (`reads`, so 0.200 stays 0.200) and a
 * column keep a caption with spaces (`label`). Both are optional and a format-6 table shows exactly
 * as before, so nothing changes here; the number tells an older PhysLab that the file is newer
 * than it, instead of letting it open the file and drop those texts on its next save.
 */
function v6ToV7(file: Raw): Raw {
  return { ...file, version: 7 }
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
