// Crash recovery: unsaved work is copied aside every minute and offered back after a crash.

import { create } from 'zustand'
import { scene, useScene } from '../core/store'
import type { SceneFile } from '../core/types'

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
      const f = snap?.file
      if (f && (f.objects?.length || f.lab?.length || f.sandbox)) useRecovery.getState().set(snap)
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
