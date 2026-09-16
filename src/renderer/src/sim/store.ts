// The sandbox scene as the user edits it: what objects exist and how the world behaves.
// Live positions during a run are not here — they come straight from the engine each frame.

import { create } from 'zustand'
import { materialById } from './materials'
import { DEFAULT_WORLD, type BodyDef, type BodyId, type ContactEvent, type ShapeKind, type WorldSettings } from './types'
import { SimWorld } from './world'

let counter = 0
const nextId = () => `sb${Date.now().toString(36)}${(counter++).toString(36)}`

/** Letters for new objects, so they read like textbook labels. */
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('')

export interface SandboxState {
  bodies: BodyDef[]
  world: WorldSettings
  selection: BodyId | null
  /** Last collisions, newest first, for the log panel. */
  contacts: ContactEvent[]
  /** Set by the viewport so panels can show live values. */
  engineTime: number
  /** Camera flattened to a straight-on side view, so a scene reads like a textbook figure. */
  sideView: boolean

  addBody: (shape: ShapeKind, at?: [number, number, number]) => BodyDef
  updateBody: (id: BodyId, patch: Partial<BodyDef>) => void
  removeBody: (id: BodyId) => void
  select: (id: BodyId | null) => void
  setWorld: (patch: Partial<WorldSettings>) => void
  pushContacts: (c: ContactEvent[]) => void
  clearContacts: () => void
  setScene: (bodies: BodyDef[], world?: Partial<WorldSettings>) => void
  setSideView: (on: boolean) => void
}

/** Sensible starting sizes in metres, so a scene looks like a lab bench, not a galaxy. */
const DEFAULT_SIZE: Record<ShapeKind, [number, number, number]> = {
  box: [0.6, 0.6, 0.6],
  sphere: [0.25, 0.25, 0.25],
  cylinder: [0.25, 0.8, 0.25],
  capsule: [0.2, 0.6, 0.2],
  cone: [0.5, 0.8, 0.5],
  ramp: [3, 1.5, 1.5],
  plank: [3, 0.15, 0.6],
  wall: [0.3, 2, 3],
  ground: [40, 0.4, 40]
}

const DEFAULT_MATERIAL: Record<ShapeKind, string> = {
  box: 'wood',
  sphere: 'steel',
  cylinder: 'wood',
  capsule: 'plastic',
  cone: 'plastic',
  ramp: 'concrete',
  plank: 'wood',
  wall: 'concrete',
  ground: 'concrete'
}

export function makeBody(shape: ShapeKind, name: string, at: [number, number, number] = [0, 1, 0]): BodyDef {
  const material = materialById(DEFAULT_MATERIAL[shape])
  const fixed = shape === 'ramp' || shape === 'wall' || shape === 'ground'
  return {
    id: nextId(),
    name,
    shape,
    size: DEFAULT_SIZE[shape],
    position: at,
    rotation: [0, 0, 0],
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    motion: fixed ? 'static' : 'dynamic',
    material: material.id,
    massMode: 'density',
    mass: 1,
    restitution: material.restitution,
    friction: material.friction,
    linearDamping: 0,
    angularDamping: 0.05,
    color: material.color,
    showArrows: true,
    trace: false
  }
}

/** The scene a new sandbox starts with: a floor and a ball to drop. */
function startingScene(): BodyDef[] {
  const ground = makeBody('ground', 'Floor', [0, -0.2, 0])
  const ball = makeBody('sphere', 'A', [-1.5, 3, 0])
  ball.velocity = [2, 0, 0]
  const crate = makeBody('box', 'B', [1.5, 0.3, 0])
  return [ground, ball, crate]
}

export const useSandbox = create<SandboxState>((set, get) => ({
  bodies: startingScene(),
  world: { ...DEFAULT_WORLD },
  selection: null,
  contacts: [],
  engineTime: 0,
  sideView: true,

  addBody: (shape, at) => {
    const used = new Set(get().bodies.map((b) => b.name))
    const letter = LETTERS.find((l) => !used.has(l)) ?? `X${get().bodies.length}`
    const def = makeBody(shape, shape === 'ground' ? 'Floor' : letter, at)
    set({ bodies: [...get().bodies, def], selection: def.id })
    return def
  },

  updateBody: (id, patch) =>
    set({
      bodies: get().bodies.map((b) => {
        if (b.id !== id) return b
        const next = { ...b, ...patch }
        // Changing the material brings its density, friction and bounciness with it.
        if (patch.material && patch.material !== b.material) {
          const m = materialById(patch.material)
          next.friction = m.friction
          next.restitution = m.restitution
          next.color = m.color
        }
        return next
      })
    }),

  removeBody: (id) => set({ bodies: get().bodies.filter((b) => b.id !== id), selection: get().selection === id ? null : get().selection }),
  select: (selection) => set({ selection }),
  setWorld: (patch) => set({ world: { ...get().world, ...patch } }),
  pushContacts: (c) => (c.length ? set({ contacts: [...c].reverse().concat(get().contacts).slice(0, 60) }) : undefined),
  clearContacts: () => set({ contacts: [] }),
  setScene: (bodies, world) => set({ bodies, world: { ...get().world, ...world }, selection: null, contacts: [] }),
  setSideView: (sideView) => set({ sideView })
}))

/** Mass a body will have, for the panels (the engine works it out the same way). */
export const massOf = (def: BodyDef): number => SimWorld.massOf(def)
