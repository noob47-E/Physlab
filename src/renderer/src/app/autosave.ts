// Crash recovery: unsaved work is copied aside every minute and offered back after a crash.

import { create } from 'zustand'
import { scene, useScene } from '../core/store'
import type { SceneFile } from '../core/types'

const INTERVAL_MS = 60_000
const KEY = 'physlab.autosave'

type Bridge = {
  autosaveWrite?: (content: string) => Promise<boolean>
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

async function saveNow(): Promise<void> {
  const s = scene()
  if (!s.dirty || s.order.length === 0) return
  const snap: Snapshot = { savedAt: Date.now(), path: s.filePath, file: s.serialize() }
  await write(JSON.stringify(snap))
}

/**
 * Starts the timer and looks for work left behind by a previous run.
 * A copy is only kept while there are unsaved changes, so finding one means the app
 * closed (or crashed) with work that was never saved.
 */
export function startAutosave(): () => void {
  const timer = setInterval(() => void saveNow(), INTERVAL_MS)
  const onLeave = () => void saveNow()
  window.addEventListener('beforeunload', onLeave)

  void (async () => {
    const text = await read()
    if (!text) return
    try {
      const snap = JSON.parse(text) as Snapshot
      if (snap?.file?.objects?.length) useRecovery.getState().set(snap)
      else await clearAutosave()
    } catch {
      await clearAutosave()
    }
  })()

  // Saving the project for real makes the copy unnecessary.
  let wasDirty = scene().dirty
  const unsub = useScene.subscribe((s) => {
    if (wasDirty && !s.dirty) void clearAutosave()
    wasDirty = s.dirty
  })

  return () => {
    clearInterval(timer)
    unsub()
    window.removeEventListener('beforeunload', onLeave)
  }
}
