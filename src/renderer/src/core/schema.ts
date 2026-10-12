// What a file or a stored setting must look like before PhysLab uses it (CLEANUP-PLAN.md CW5): plain
// checker functions, no library. The doors that use them:
//   - a .phys project: core/migrate.ts (`checkShape`, then the block checks below);
//   - a .pqjson question file: questions/pqjson.ts `parsePQFile`, and questions/shapeChecks.ts;
//   - a Numbas .exam: questions/numbas.ts `fromExam`;
//   - settings kept in storage: core/store.ts (label preferences), app/layout.ts, calc/calcStore.ts.
//     app/theme.ts was checked and needs nothing here: `readTheme` already turns anything unknown into the default.
// questions/results.ts keeps its own copies on purpose: it may import nothing at all (tests/results.test.ts).
// A door accepts exactly what it accepted before these were shared; a stricter check changes which
// files open and waits for the owner (OWNER-APPROVALS.md, CW5-n).

import { STEP_RATES } from '../sim/types'
import { fmtLabel } from '../math/format'

export type Raw = Record<string, unknown>

/** A JSON object: not null, not a list. */
export const isRecord = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)
export const isStr = (v: unknown): v is string => typeof v === 'string'
export const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)
/** A number that is one: not NaN, not ±Infinity. */
export const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

// ---------------------------------------------------------------------------
// Settings kept in storage
// ---------------------------------------------------------------------------

/** The JSON a stored text holds, or null when there is none or it is not JSON. */
export function storedJson(raw: string | null | undefined): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** A stored text that holds a JSON object (the saved panel layout), or null. */
export const storedRecord = (raw: string | null | undefined): Raw | null => {
  const v = storedJson(raw)
  return isRecord(v) ? v : null
}

/** A stored list (the Calculator's history), its first `cap` items; empty for anything else. Items are not checked (CW5-4). */
export function storedList(raw: string | null | undefined, cap: number): unknown[] {
  const v = storedJson(raw)
  return Array.isArray(v) ? v.slice(0, cap) : []
}

// ---------------------------------------------------------------------------
// A .phys project: the blocks, one level down
// ---------------------------------------------------------------------------

const isV3 = (v: unknown): boolean => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number')

// The block checks look one level down, at what the panels read on their first render: a table
// with no columns or a body with no position used to load without a word and then crash the Lab
// panel or the Sandbox viewport, after the old scene was already gone.

/** Lab tables have had id, title, columns, rows and plot since they arrived in 0.3.3. */
export function checkLab(lab: unknown): void {
  if (!Array.isArray(lab)) throw new Error('The lab tables in this file are damaged.')
  lab.forEach((t, i) => {
    const ok =
      isRecord(t) &&
      typeof t.id === 'string' &&
      typeof t.title === 'string' &&
      Array.isArray(t.columns) &&
      t.columns.every((c) => isRecord(c) && typeof c.id === 'string' && typeof c.name === 'string' && (c.label === undefined || typeof c.label === 'string')) &&
      Array.isArray(t.rows) &&
      t.rows.every((r) => Array.isArray(r)) &&
      isRecord(t.plot)
    if (!ok) throw new Error(`Lab table ${i + 1} in this file is damaged.`)
  })
}

/**
 * The sandbox has had the same shape since 0.3.5; `world` and `sideView` may be left out. From format
 * 8 a world's `stepRate`, when it has one, must be a rate PhysLab runs: anything else would quietly
 * run at the default and every number the file's experiment showed would move.
 */
export function checkSandbox(sb: unknown, version = 0): void {
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
  const rate = isRecord(sb.world) ? sb.world.stepRate : undefined
  if (version >= 8 && rate !== undefined && !STEP_RATES.includes(rate as never)) {
    // A number is quoted as the app writes numbers; anything else (text, nothing) is not a rate at all.
    throw new Error(
      typeof rate === 'number' && Number.isFinite(rate)
        ? `This project asks for ${fmtLabel(rate)} steps a second; PhysLab runs 60, 120, 240 or 600.`
        : 'This project asks for a step rate PhysLab cannot read; PhysLab runs 60, 120, 240 or 600 steps a second.'
    )
  }
  if (sb.sideView !== undefined && typeof sb.sideView !== 'boolean') throw new Error('The sandbox view setting in this file is damaged.')
}

/** Each object must at least be something the evaluator can name and look up. */
export function checkObjects(file: Raw): void {
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
