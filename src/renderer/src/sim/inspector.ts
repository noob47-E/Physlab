// What the selected-body inspector shows at first sight, and what it folds away. The panel used
// to show about twenty-five controls for one body; a student looking for the mass had to find
// it between a damping slider and a drag coefficient. These decisions live here, away from
// React, so they can be tested.

import type { BodyDef, BodyId } from './types'

/** The rows a body always shows, in this order; everything else sits under a fold. */
export const ALWAYS_SHOWN = ['name', 'material', 'mass', 'position', 'velocity'] as const

export type FoldId = 'launcher' | 'connections' | 'appearance' | 'physics' | 'advanced' | 'world-more' | 'collisions'

/**
 * Which fold each of the other controls belongs to, in the order they appear. The panel renders
 * each fold from this table (`controlsIn`), so moving a control means editing one line here, and
 * the type of `ControlKey` makes the panel supply a row for every key named.
 */
export const FOLD_OF = {
  color: 'appearance',
  show: 'appearance',
  size: 'physics',
  rotation: 'physics',
  motion: 'physics',
  restitution: 'physics',
  friction: 'physics',
  angularVelocity: 'advanced',
  lock: 'advanced',
  dragCd: 'advanced',
  linearDamping: 'advanced',
  rolling: 'advanced'
} as const satisfies Record<string, FoldId>

export type FoldedKey = keyof typeof FOLD_OF
/** Every control the inspector has a row for. */
export type ControlKey = (typeof ALWAYS_SHOWN)[number] | FoldedKey

/** The folds a body's controls are spread over, top to bottom. */
export const BODY_FOLDS = ['appearance', 'physics', 'advanced'] as const satisfies readonly FoldId[]

/** The controls that sit under one fold, in the order the table gives them. */
export const controlsIn = (fold: FoldId): FoldedKey[] => (Object.keys(FOLD_OF) as FoldedKey[]).filter((k) => FOLD_OF[k] === fold)

export const FOLD_TITLES: Record<FoldId, string> = {
  launcher: 'Launcher',
  connections: 'Connections',
  appearance: 'Appearance',
  physics: 'Physics',
  advanced: 'Advanced',
  'world-more': 'More about the world',
  collisions: 'Collisions'
}

/** The smallest thing that can stand in for localStorage, so the rule can be tested without a browser. */
export interface FoldStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const KEY = 'physlab.sandbox.fold.'

/** Whether a fold is open: what the student last chose, or the given default. */
export function readFold(id: string, fallback: boolean, store: FoldStore | null): boolean {
  try {
    const v = store?.getItem(KEY + id)
    return v === null || v === undefined ? fallback : v === '1'
  } catch {
    // A blocked or full storage is not a reason to hide anything.
    return fallback
  }
}

export function writeFold(id: string, open: boolean, store: FoldStore | null): void {
  try {
    store?.setItem(KEY + id, open ? '1' : '0')
  } catch {
    // Not remembered, but the fold still opens.
  }
}

/**
 * Connections come to the front when two bodies are chosen: that is the only moment a student
 * needs them, and the section was buried between the sliders before.
 */
export const connectionsProminent = (selection: BodyId | null, partner: BodyId | null): boolean => selection !== null && partner !== null && selection !== partner

/** The bodies a selected one can be joined to: not itself, not the floor. */
export const joinCandidates = (bodies: BodyDef[], selection: BodyId | null): BodyDef[] => bodies.filter((b) => b.id !== selection && b.shape !== 'ground')
