// Which history Undo and Redo reach. The keyboard and the Edit menu both ask here, so they cannot
// drift apart again: Ctrl+Shift+Z used to undo a second time in Lab Data, Ctrl+Y redid the drawing
// behind the table, and Edit ▸ Undo/Redo ran the drawing's history in Lab Data.

import { scene } from '../core/store'
import { useLab } from '../lab/labStore'
import { useSandbox } from '../sim/store'
import { refuseEdit } from '../sim/transportActions'

type HistoryStack = 'lab' | 'sandbox' | 'scene'
type HistoryAction = 'undo' | 'redo'
type HistoryInput = { key: string; shift: boolean } | { menu: HistoryAction }

/** The modes that keep a history of their own; every other mode undoes the drawing. */
function stackFor(mode: string): HistoryStack {
  return mode === 'lab' || mode === 'sandbox' ? mode : 'scene'
}

/** Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo; null for any other key. */
export function routeHistory(mode: string, input: HistoryInput): { stack: HistoryStack; action: HistoryAction } | null {
  let action: HistoryAction | null
  if ('menu' in input) action = input.menu
  else {
    const key = input.key.toLowerCase()
    action = key === 'z' ? (input.shift ? 'redo' : 'undo') : key === 'y' ? 'redo' : null
  }
  return action ? { stack: stackFor(mode), action } : null
}

const STACKS: Record<HistoryStack, () => { undo: () => void; redo: () => void }> = {
  lab: () => useLab.getState(),
  sandbox: () => useSandbox.getState(),
  scene: () => scene()
}

/** Runs Undo or Redo on the history the mode owns. False when the input is not Undo or Redo. */
export function runHistory(mode: string, input: HistoryInput): boolean {
  const route = routeHistory(mode, input)
  if (!route) return false
  // Replay is read-only (D5): while a recording is shown the Sandbox's Undo and Redo are edits, so they are refused with the
  // recorder's sentence (shown in the strip) until Branch from here or Back to live. The key is still taken: no other undo runs.
  if (route.stack === 'sandbox' && refuseEdit()) return true
  STACKS[route.stack]()[route.action]()
  return true
}
