// What the selected-body inspector shows at first sight, and what it folds away. The panel used
// to show about twenty-five controls for one body; a student looking for the mass had to find
// it between a damping slider and a drag coefficient. These decisions live here, away from
// React, so they can be tested.

import type { BodyDef, BodyId } from './types'

/** The rows a body always shows, in this order; everything else sits under a fold. */
export const ALWAYS_SHOWN = ['name', 'material', 'mass', 'position', 'velocity'] as const

export type FoldId = 'launcher' | 'pendulum' | 'connections' | 'appearance' | 'physics' | 'advanced' | 'world-more' | 'collisions'

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

type FoldedKey = keyof typeof FOLD_OF
/** Every control the inspector has a row for. */
export type ControlKey = (typeof ALWAYS_SHOWN)[number] | FoldedKey

/** The folds a body's controls are spread over, top to bottom. */
export const BODY_FOLDS = ['appearance', 'physics', 'advanced'] as const satisfies readonly FoldId[]

/** The controls that sit under one fold, in the order the table gives them. */
export const controlsIn = (fold: FoldId): FoldedKey[] => (Object.keys(FOLD_OF) as FoldedKey[]).filter((k) => FOLD_OF[k] === fold)

export const FOLD_TITLES: Record<FoldId, string> = {
  launcher: 'Launcher',
  pendulum: 'Pendulum',
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

/** One size box of a body: what it is called, the letter on the box, and the size it gives. */
interface SizeField {
  label: string
  letter: string
  value: number
  set: (v: number) => [number, number, number]
}

/**
 * The size boxes a shape really uses, named for what they do (H26). A cone's depth and a pulley's
 * depth did nothing; a pulley's radius was called its width; a capsule's height was its straight
 * middle only, the round ends not counted.
 */
export function sizeFields(shape: BodyDef['shape'], size: [number, number, number]): SizeField[] {
  const [a, b, c] = size
  switch (shape) {
    case 'sphere':
      return [{ label: 'radius', letter: 'r', value: a, set: (r) => [r, r, r] }]
    case 'cylinder':
      return [
        { label: 'radius', letter: 'r', value: a, set: (r) => [r, b, r] },
        { label: 'height', letter: 'h', value: b, set: (h) => [a, h, a] }
      ]
    case 'capsule':
      // Its whole height, round ends and all: the size keeps the straight middle, b = height − 2r.
      return [
        { label: 'radius', letter: 'r', value: a, set: (r) => [r, b, r] },
        { label: 'height', letter: 'h', value: b + 2 * a, set: (h) => [a, Math.max(0.01, h - 2 * a), a] }
      ]
    case 'pulley':
      return [
        { label: 'radius', letter: 'r', value: a, set: (r) => [r, b, r] },
        { label: 'thickness', letter: 't', value: b, set: (t) => [a, t, a] }
      ]
    case 'cone':
      return [
        { label: 'base width', letter: 'w', value: a, set: (w) => [w, b, w] },
        { label: 'height', letter: 'h', value: b, set: (h) => [a, h, a] }
      ]
    default:
      return [
        { label: 'width', letter: 'w', value: a, set: (w) => [w, b, c] },
        { label: 'height', letter: 'h', value: b, set: (h) => [a, h, c] },
        { label: 'depth', letter: 'd', value: c, set: (d) => [a, b, d] }
      ]
  }
}

/** A fixed object never moves, so it has no velocity arrow or trail to show (H27). */
export const showsMotionAids = (def: BodyDef): boolean => def.motion === 'dynamic'

/**
 * Whether the inspector shows the engine's live values: while the run plays, and while it is
 * paused part-way (H24) — paused at 2.3 s it showed the typed start, not where the body was.
 */
export const showsLive = (playing: boolean, engineTime: number): boolean => playing || engineTime > 0

/**
 * Whether dragging a body sets where it starts. Before the run it does; paused part-way through,
 * a moving body is only put somewhere for the run to go on from (H18) — the drag used to rewrite
 * its start, so Reset sent it back to the drag's end, not where the run began.
 */
export const dragSetsStart = (engineTime: number, def: BodyDef): boolean => engineTime === 0 || def.motion !== 'dynamic'

/**
 * What pressing on a body in the drawing does: nothing to the body, arrange it (put it where the
 * cursor goes), or pull it with the hand while the run plays.
 *
 * The floor is never moved (owner, 2026-10-09): every fixed body was arranged by a drag, the floor
 * included, so turning the view by dragging across the ground slid the whole floor out from under
 * the experiment. A press on the floor is a press on empty space. Other fixed bodies — a wall, a
 * ramp, a post — are still arranged, which is how a student builds an experiment.
 */
export function grabAction(def: BodyDef, playing: boolean): 'none' | 'place' | 'pull' {
  if (def.shape === 'ground') return 'none'
  return playing && def.motion === 'dynamic' ? 'pull' : 'place'
}

/** How two surfaces in contact combine what each says (H29), under the friction and bounce sliders. */
export const CONTACT_HINT = 'Where two objects touch, friction is √(μ₁ × μ₂) of the two and the bounce is the larger e.'
