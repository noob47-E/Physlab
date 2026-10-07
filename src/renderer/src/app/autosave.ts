// Crash recovery: unsaved work is copied aside every minute and offered back after a crash.

import { create } from 'zustand'
import { migrate } from '../core/migrate'
import { blankSceneFile, scene, useScene } from '../core/store'
import type { SceneFile } from '../core/types'
import { DEFAULT_WORLD } from '../sim/types'

const INTERVAL_MS = 60_000
const KEY = 'physlab.autosave'

type Bridge = {
  autosaveWrite?: (content: string) => Promise<boolean>
  /** Synchronous, for the moment the window closes: a promise made then never resolves. */
  autosaveWriteSync?: (content: string) => boolean
  setDirty?: (dirty: boolean) => void
  autosaveRead?: () => Promise<string | null>
  autosaveClear?: () => Promise<boolean>
}

const bridge = () => (window as unknown as { physlab?: Bridge }).physlab

export interface Snapshot {
  savedAt: number
  path: string | null
  file: SceneFile
  /** Set on the work a Restore moved aside in this session, so the strip can say so. */
  setAside?: boolean
}

/**
 * What the autosave slot holds. Copies the student has not yet restored or discarded live in
 * `found` (the one the strip shows) and `waiting` (the ones after it); the current session's
 * unsaved work lives in `latest`. The minute-by-minute autosave used to write over the single
 * copy the strip was offering, so ignoring the strip and working on lost the crashed work; and a
 * second close with the strip still ignored would have lost the first copy or the second.
 */
type AutosaveStore = {
  found: Snapshot | null
  waiting?: Snapshot[]
  latest: Snapshot | null
}

/** Copies kept at most; past it the oldest goes, so the slot cannot grow without end. */
export const MAX_COPIES = 5

const isAutosaveStore = (v: unknown): v is AutosaveStore =>
  typeof v === 'object' && v !== null && ('found' in v || 'latest' in v || 'waiting' in v)

/**
 * Whether a file holds anything a student would miss. It is compared with what File ▸ New gives,
 * block by block, so work in a panel added later still counts; only ids are ignored, because every
 * new table, column and body gets a fresh one. The old test, "any objects, tables or a sandbox",
 * would have thrown away a future panel's work without a word.
 */
export function hasWork(file: SceneFile, blank: SceneFile = blankSceneFile()): boolean {
  return fingerprint(asLoaded(file, blank)) !== fingerprint(blank)
}

/**
 * What the recovery strip names inside the brackets: only the parts that differ from File ▸ New,
 * or nothing. It used to count objects and sandbox bodies whatever the student had done, so
 * readings typed into Lab Data came back as "0 objects, a sandbox with 3 things" — the three
 * being the starting scene nobody had touched.
 */
export function describeWork(file: SceneFile, blank: SceneFile = blankSceneFile()): string {
  const parts: string[] = []
  const objects = file.objects.length
  if (objects) parts.push(`${objects} ${objects === 1 ? 'object' : 'objects'}`)
  const lab = file.lab ?? []
  const hasReadings = (t: (typeof lab)[number]): boolean => t.rows.some((row) => row.some((cell) => cell !== null && cell !== undefined))
  const tables = lab.filter(hasReadings).length
  if (tables) parts.push(`${tables} ${tables === 1 ? 'table' : 'tables'} of readings`)
  const emptyTables = lab.filter((t) => !hasReadings(t)).length
  const blankEmpty = (blank.lab ?? []).filter((t) => !hasReadings(t)).length
  const extraEmpty = emptyTables - blankEmpty
  if (extraEmpty > 0) parts.push(`${extraEmpty} empty ${extraEmpty === 1 ? 'table' : 'tables'}`)
  else if (file.lab !== undefined && file.lab.length === 0 && (blank.lab ?? []).length > 0) parts.push('no lab tables')
  const sandbox = asLoaded(file, blank).sandbox
  if (sandbox && blank.sandbox && fingerprint({ ...blank, sandbox }) !== fingerprint(blank)) {
    const same = sandbox.bodies.length === blank.sandbox.bodies.length && !sandbox.links.length
    // Bodies and links the student added are worth naming; a changed gravity alone is not a count.
    parts.push(same ? 'changed sandbox settings' : `a sandbox with ${sandbox.bodies.length} things${sandbox.links.length ? ` and ${sandbox.links.length} ${sandbox.links.length === 1 ? 'connection' : 'connections'}` : ''}`)
  }
  return parts.join(', ')
}

/**
 * The file as `loadScene` would take it in: a missing lab or sandbox block becomes the blank
 * one, and world settings a file predates are filled from the defaults. Compared raw, an
 * autosave from a build without those blocks read as work with "0 objects" in it. An empty
 * question set is no set, as `serialize` leaves it out; one question, even an empty one the
 * teacher has only just added, is work.
 */
function asLoaded(file: SceneFile, blank: SceneFile): SceneFile {
  const sandbox = file.sandbox && blank.sandbox ? { ...blank.sandbox, ...file.sandbox, world: { ...DEFAULT_WORLD, ...file.sandbox.world } } : blank.sandbox
  return { ...file, lab: file.lab?.length ? file.lab : blank.lab, sandbox }
}

/** The file as text with ids replaced by their order of appearance, and the parts that are not work left out. */
function fingerprint(file: SceneFile): string {
  const { app: _app, version: _version, settings: _settings, ...work } = file
  const ids = new Map<string, string>()
  const collect = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(collect)
    else if (v && typeof v === 'object') {
      for (const k of Object.keys(v).sort()) {
        const x = (v as Record<string, unknown>)[k]
        if (k === 'id' && typeof x === 'string' && !ids.has(x)) ids.set(x, `#${ids.size + 1}`)
        collect(x)
      }
    }
  }
  collect(work)
  const rebuild = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(rebuild)
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, rebuild((v as Record<string, unknown>)[k])]))
    return typeof v === 'string' && ids.has(v) ? ids.get(v) : v
  }
  return JSON.stringify(rebuild(work))
}

/**
 * Recovered copies waiting for the student: `found` is on the strip, `waiting` come after it.
 * set(null) takes the shown one away and brings the next forward.
 */
export const useRecovery = create<{ found: Snapshot | null; waiting: Snapshot[]; set: (s: Snapshot | null) => void }>((set) => ({
  found: null,
  waiting: [],
  set: (found) => (found ? set({ found }) : set((st) => ({ found: st.waiting[0] ?? null, waiting: st.waiting.slice(1) })))
}))

/** The current session's unsaved work as a copy, or null when there is nothing unsaved. */
function snapshot(): Snapshot | null {
  const s = scene()
  // Anything unsaved is worth keeping: the old rule ("only if the drawing has objects") left a
  // sandbox-only or lab-only session unprotected.
  if (!s.dirty) return null
  return { savedAt: Date.now(), path: s.filePath, file: s.serialize() }
}

/**
 * Restore the copy on the strip. Work done since start-up is never thrown away: "Restore it"
 * used to replace it without a word. It is set aside as the next copy on the strip instead, so
 * the student can go back to it (Restore) or let it go (Discard).
 */
export function restoreRecovery(): void {
  const r = useRecovery.getState()
  const found = r.found
  if (!found) return
  // Only work worth keeping is set aside: an edit undone leaves the scene unsaved but empty,
  // and the strip would then offer a copy holding nothing.
  const taken = snapshot()
  const mine = taken && hasWork(taken.file) ? taken : null
  scene().loadScene(found.file, found.path ?? null)
  // Restored work is still unsaved work: keep protecting it until the student saves.
  useScene.setState({ dirty: true })
  useRecovery.setState({
    found: mine ? { ...mine, setAside: true } : (r.waiting[0] ?? null),
    waiting: mine ? r.waiting : r.waiting.slice(1)
  })
  void saveNow()
}

/** Throw the copy on the strip away; the next waiting copy, if any, takes its place. */
export function discardRecovery(): void {
  useRecovery.getState().set(null)
  if (scene().dirty || useRecovery.getState().found) void saveNow()
  else void clearAutosave()
}

async function write(text: string) {
  const b = bridge()
  if (b?.autosaveWrite) await b.autosaveWrite(text)
  else {
    try {
      localStorage.setItem(KEY, text)
    } catch {
      // Storage full or blocked: skip this copy.
    }
  }
}

export async function clearAutosave(): Promise<void> {
  const b = bridge()
  if (b?.autosaveClear) await b.autosaveClear()
  else {
    try {
      localStorage.removeItem(KEY)
    } catch {
      // Nothing to clear.
    }
  }
}

async function read(): Promise<string | null> {
  const b = bridge()
  if (b?.autosaveRead) return b.autosaveRead()
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function envelopeText(): string | null {
  const latest = snapshot()
  const { found, waiting } = useRecovery.getState()
  if (!latest && !found && !waiting.length) return null
  return JSON.stringify({ found, waiting, latest } satisfies AutosaveStore)
}

/**
 * False from start-up until the copy left by the last run has been read. Until then the slot is
 * not written or cleared: the strip does not know about that copy yet, so a write would replace
 * it with this session's work alone.
 */
let looked = true

async function saveNow(): Promise<void> {
  if (!looked) return
  const text = envelopeText()
  if (text) await write(text)
}

/** On close there is no time for a promise; the desktop bridge writes the copy synchronously. */
function saveOnLeave(): void {
  if (!looked) return
  const text = envelopeText()
  if (!text) return
  const b = bridge()
  if (b?.autosaveWriteSync) b.autosaveWriteSync(text)
  else void write(text)
}

/**
 * Starts the timer and looks for work left behind by a previous run.
 * A copy is only kept while there are unsaved changes, so finding one means the app
 * closed (or crashed) with work that was never saved.
 */
export function startAutosave(): () => void {
  const timer = setInterval(() => void saveNow(), INTERVAL_MS)
  const onLeave = () => saveOnLeave()
  window.addEventListener('beforeunload', onLeave)

  looked = false
  void (async () => {
    try {
      await recover()
    } finally {
      looked = true
    }
  })()

  async function recover(): Promise<void> {
    const text = await read()
    if (!text) return
    try {
      const parsed = JSON.parse(text) as unknown
      const candidates: Snapshot[] = []
      if (isAutosaveStore(parsed)) {
        // Every copy still waiting, and the last session's own unsaved work, which a single slot
        // would have dropped the moment this session autosaved.
        for (const c of [parsed.found, ...(parsed.waiting ?? []), parsed.latest]) if (c) candidates.push(c)
      } else if (parsed && typeof parsed === 'object' && 'savedAt' in parsed) {
        // Written by an older build as a single snapshot.
        candidates.push(parsed as Snapshot)
      }
      const kept: Snapshot[] = []
      for (const cand of candidates) {
        try {
          // The copy may have been written by an older build; migrate throws if it is not a project at all.
          const file = migrate(cand.file)
          if (hasWork(file)) kept.push({ ...cand, file, setAside: undefined })
        } catch {
          // One unreadable copy must not cost the others.
        }
      }
      // Newest first: it is the one the student most likely wants.
      kept.sort((a, b) => b.savedAt - a.savedAt)
      if (kept.length) useRecovery.setState({ found: kept[0], waiting: kept.slice(1, MAX_COPIES) })
      else await clearAutosave()
    } catch {
      await clearAutosave()
    }
  }

  // Saving the project for real makes the copy unnecessary — unless a recovered copy is still
  // waiting: it must stay untouched until the student restores or dismisses it.
  let wasDirty = scene().dirty
  bridge()?.setDirty?.(wasDirty)
  const unsub = useScene.subscribe((s) => {
    if (wasDirty && !s.dirty && looked) {
      if (useRecovery.getState().found || useRecovery.getState().waiting.length) void saveNow()
      else void clearAutosave()
    }
    if (s.dirty !== wasDirty) bridge()?.setDirty?.(s.dirty)
    wasDirty = s.dirty
  })

  return () => {
    clearInterval(timer)
    unsub()
    window.removeEventListener('beforeunload', onLeave)
  }
}
