// Renaming an object means renaming it inside every formula that mentions it, or a number defined
// as "2*A" would go on pointing at a name that no longer exists. Pure, so it can be tested; the
// store's `renameObject` applies the result and records it as one undo step.

import { exprRefs } from './evaluate'
import { isValidName } from './naming'
import type { ObjId, SceneObject } from './types'

// The characters a name may start with and go on with. Copied from `isValidName`
// (core/naming.ts), which owns them; keep the two in step. Ͱ-Ͽ is the Greek block.
const NAME = "[A-Za-z\\u0370-\\u03FF][A-Za-z0-9_\\u0370-\\u03FF'′″‴⁗]*"
// A number (3, 2.5, .5, 1e-3) or a name. Numbers are matched so that their digits and an
// exponent's e are never read as the start of a name.
const TOKEN = new RegExp(`(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?|${NAME}`, 'g')

/** Why a name cannot be used, in a sentence for the student, or null when it can. */
export function renameProblem(next: string, taken: Iterable<string>): string | null {
  if (!isValidName(next)) return `"${next}" is not available as a name.`
  for (const t of taken) if (t === next) return `"${next}" is already the name of something else.`
  return null
}

/**
 * The objects that change when `id` is called `next`: the object itself, and every object whose
 * formulas mention the old name as a whole name (A but not A1, AB, A′, Aα or tan's a).
 *
 * Two objects can share a name (a loaded file may say so), and the evaluator gives the name to
 * the later one. Renaming the other must not touch anyone's formulas: "b = a + 1" never used it,
 * and rewriting b to "c + 1" quietly changed b's value.
 */
export function renameInObjects(objects: Record<ObjId, SceneObject>, id: ObjId, next: string): SceneObject[] {
  const obj = objects[id]
  if (!obj || obj.name === next) return []
  // Last one wins, the same way `directDependents` and the evaluator resolve a name.
  const owner = new Map(Object.values(objects).map((o) => [o.name, o.id])).get(obj.name)
  // A student who renames the arrow chose its name; the working's label (−B) no longer applies.
  if (owner !== id) return [{ ...obj, name: next, label: undefined }]
  const old = obj.name
  // Read the formula as the parser does: whole numbers and whole names, left to right. A name
  // ends only where a name character stops, so A′, A″, Aα and θ′ stay whole (not A + ′), and a
  // number is taken first, so 2A is 2 times A while B2A stays one name.
  const swap = (e: string) => e.replace(TOKEN, (t) => (t === old ? next : t))
  const uses = (e: string) => e.match(TOKEN)?.includes(old) ?? false
  const changed: SceneObject[] = [{ ...obj, name: next, label: undefined }]
  for (const o of Object.values(objects)) {
    if (o.id === id || !exprRefs(o).some(uses)) continue
    const copy = JSON.parse(JSON.stringify(o)) as SceneObject
    if (copy.type === 'point' && copy.def.kind === 'expr') copy.def.expr = swap(copy.def.expr)
    if (copy.type === 'vector' && copy.def.kind === 'expr') copy.def.expr = swap(copy.def.expr)
    if (copy.type === 'circle' && copy.def.kind === 'centerRadius') copy.def.r = swap(copy.def.r)
    if (copy.type === 'number') copy.expr = swap(copy.expr)
    if (copy.type === 'graph') {
      copy.exprs = copy.exprs.map(swap)
      // The source is what the Outliner shows and what editing starts from, so it renames too.
      copy.source = swap(copy.source)
    }
    changed.push(copy)
  }
  return changed
}
