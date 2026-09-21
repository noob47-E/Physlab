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

interface Snapshot {
  savedAt: number
  path: string | null
  file: SceneFile
}

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
 * The file as `loadScene` would take it in: a missing lab or sandbox block becomes the blank
 * one, and world settings a file predates are filled from the defaults. Compared raw, an
 * autosave from a build without those blocks read as work with "0 objects" in it.
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

/** A recovered snapshot waiting for the user to accept or discard it. */
export const useRecovery = create<{ found: Snapshot | null; set: (s: Snapshot | null) => void }>((set) => ({
  found: null,
  set: (found) => set({ found })
}))

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

function snapshotText(): string | null {
  const s = scene()
  // Anything unsaved is worth keeping: the old rule ("only if the drawing has objects") left a
  // sandbox-only or lab-only session unprotected.
  if (!s.dirty) return null
  const snap: Snapshot = { savedAt: Date.now(), path: s.filePath, file: s.serialize() }
  return JSON.stringify(snap)
}

async function saveNow(): Promise<void> {
  const text = snapshotText()
  if (text) await write(text)
}

/** On close there is no time for a promise; the desktop bridge writes the copy synchronously. */
function saveOnLeave(): void {
  const text = snapshotText()
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

  void (async () => {
    const text = await read()
    if (!text) return
    try {
      const snap = JSON.parse(text) as Snapshot
      // The copy may have been written by an older build; migrate throws if it is not a project at all.
      const file = migrate(snap?.file)
      if (hasWork(file)) useRecovery.getState().set({ ...snap, file })
      else await clearAutosave()
    } catch {
      await clearAutosave()
    }
  })()

  // Saving the project for real makes the copy unnecessary.
  let wasDirty = scene().dirty
  bridge()?.setDirty?.(wasDirty)
  const unsub = useScene.subscribe((s) => {
    if (wasDirty && !s.dirty) void clearAutosave()
    if (s.dirty !== wasDirty) bridge()?.setDirty?.(s.dirty)
    wasDirty = s.dirty
  })

  return () => {
    clearInterval(timer)
    unsub()
    window.removeEventListener('beforeunload', onLeave)
  }
}
