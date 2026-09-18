// The sandbox scene as the user edits it: what objects exist and how the world behaves.
// Live positions during a run are not here — they come straight from the engine each frame.

import { create } from 'zustand'
import { materialById } from './materials'
import { DEFAULT_WORLD, type BodyDef, type BodyId, type BodyState, type ContactEvent, type Link, type LinkKind, type ShapeKind, type WorldSettings } from './types'
import { SimWorld } from './world'
import { addSample, type Sample } from './recording'

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
  /** Live state per body, published by the viewport about ten times a second so the panel can
   *  show energy and momentum without re-rendering on every frame. */
  live: Record<BodyId, BodyState>
  /** Camera flattened to a straight-on side view, so a scene reads like a textbook figure. */
  sideView: boolean
  links: Link[]
  /** Readings taken while the run plays, per body: the raw material of a graph or a table. */
  recording: Record<BodyId, Sample[]>
  /** Previous versions of the object list, newest last. Live positions are not in here: undo
   *  puts the objects back as they were defined, which is what Reset does too. */
  past: { bodies: BodyDef[]; links: Link[] }[]

  addBody: (shape: ShapeKind, at?: [number, number, number]) => BodyDef
  updateBody: (id: BodyId, patch: Partial<BodyDef>) => void
  removeBody: (id: BodyId) => void
  select: (id: BodyId | null) => void
  setWorld: (patch: Partial<WorldSettings>) => void
  pushContacts: (c: ContactEvent[]) => void
  clearContacts: () => void
  setScene: (bodies: BodyDef[], world?: Partial<WorldSettings>, links?: Link[]) => void
  addLink: (a: BodyId, b: BodyId, kind: LinkKind) => void
  updateLink: (id: string, patch: Partial<Link>) => void
  removeLink: (id: string) => void
  record: (samples: Record<BodyId, Sample>) => void
  clearRecording: () => void
  setSideView: (on: boolean) => void
  /** Step back one edit. The sandbox had no history at all, so a wrong delete was final. */
  undo: () => void
  canUndo: () => boolean
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
  live: {},
  sideView: true,
  links: [],
  recording: {},
  past: [],

  addBody: (shape, at) => {
    remember(set, get)
    const used = new Set(get().bodies.map((b) => b.name))
    const letter = LETTERS.find((l) => !used.has(l)) ?? `X${get().bodies.length}`
    const def = makeBody(shape, shape === 'ground' ? 'Floor' : letter, at)
    set({ bodies: [...get().bodies, def], selection: def.id })
    return def
  },

  updateBody: (id, patch) => {
    remember(set, get)
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
    })
  },

  removeBody: (id) => {
    remember(set, get)
    // A rod to an object that no longer exists would leave the engine holding a dead reference.
    set({
      bodies: get().bodies.filter((b) => b.id !== id),
      links: get().links.filter((l) => l.a !== id && l.b !== id),
      selection: get().selection === id ? null : get().selection
    })
  },
  select: (selection) => set({ selection }),
  setWorld: (patch) => set({ world: { ...get().world, ...patch } }),
  pushContacts: (c) => (c.length ? set({ contacts: [...c].reverse().concat(get().contacts).slice(0, 60) }) : undefined),
  clearContacts: () => set({ contacts: [] }),
  setScene: (bodies, world, links) => {
    remember(set, get)
    set({ bodies, world: { ...get().world, ...world }, links: links ?? [], selection: null, contacts: [] })
  },

  addLink: (a, b, kind) => {
    if (a === b) return
    const bodies = get().bodies
    const one = bodies.find((x) => x.id === a)
    const two = bodies.find((x) => x.id === b)
    if (!one || !two) return
    remember(set, get)
    // The natural length is however far apart they are right now, so making a connection never
    // starts by yanking the two objects together.
    const gap = Math.hypot(one.position[0] - two.position[0], one.position[1] - two.position[1], one.position[2] - two.position[2])
    const link: Link = { id: nextId(), kind, a, b, length: Math.max(0.05, gap), stiffness: 200, damping: 0.5 }
    set({ links: [...get().links, link] })
  },
  updateLink: (id, patch) => {
    remember(set, get)
    set({ links: get().links.map((l) => (l.id === id ? { ...l, ...patch } : l)) })
  },
  removeLink: (id) => {
    remember(set, get)
    set({ links: get().links.filter((l) => l.id !== id) })
  },
  record: (samples) => {
    const before = get().recording
    const next: Record<BodyId, Sample[]> = { ...before }
    for (const [id, s] of Object.entries(samples)) next[id] = addSample(before[id] ?? [], s)
    set({ recording: next })
  },
  clearRecording: () => set({ recording: {} }),
  setSideView: (sideView) => set({ sideView }),

  undo: () => {
    const past = get().past
    if (!past.length) return
    const back = past[past.length - 1]
    set({ bodies: back.bodies, links: back.links, past: past.slice(0, -1), selection: null })
  },
  canUndo: () => get().past.length > 0
}))

let lastRemembered = 0

/**
 * Keeps the object list as it is now, so the next change can be undone.
 *
 * Changes that arrive in a burst — every keystroke of a new name, every drag of a slider — are
 * folded into one entry, or a student would have to press undo twenty times to take back one
 * word.
 */
function remember(set: (p: Partial<SandboxState>) => void, get: () => SandboxState): void {
  const now = Date.now()
  const burst = now - lastRemembered < 700 && get().past.length > 0
  lastRemembered = now
  if (burst) return
  set({ past: [...get().past, { bodies: get().bodies, links: get().links }].slice(-30) })
}

/** Mass a body will have, for the panels (the engine works it out the same way). */
export const massOf = (def: BodyDef): number => SimWorld.massOf(def)
