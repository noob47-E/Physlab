// The sandbox scene as the user edits it: what objects exist and how the world behaves.
// Live positions during a run are not here — they come straight from the engine each frame.

import { create } from 'zustand'
import { materialById } from './materials'
import { groundTopOf } from './energy'
import { DEFAULT_WORLD, type BodyDef, type BodyId, type BodyState, type ContactEvent, type Link, type LinkKind, type ShapeKind, type WorldSettings } from './types'
import { SimWorld } from './world'
import { addSample, type Sample } from './recording'
import type { SandboxFile } from '../core/types'
import { makeLink } from './links'

let counter = 0
const nextId = () => `sb${Date.now().toString(36)}${(counter++).toString(36)}`

/** Letters for new objects, so they read like textbook labels. */
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('')

/**
 * The running engine, for the panels that need to reach it (putting a lost object back, framing
 * the view). The viewport owns its lifetime; nothing else creates or clears it.
 */
export const engine: { world: SimWorld | null } = { world: null }

type Snapshot = { bodies: BodyDef[]; links: Link[] }

export interface SandboxState {
  bodies: BodyDef[]
  world: WorldSettings
  selection: BodyId | null
  /**
   * A second chosen body, to join to the first. Shift-click picks it, in the viewport or the
   * list; the Connections section comes to the front while a pair is chosen.
   */
  partner: BodyId | null
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
  past: Snapshot[]
  future: Snapshot[]
  /**
   * Bumped by Reset and by loading a scene. The viewport rebuilds the engine when it changes.
   * Reset used to hand the viewport a fresh array of the same objects and hope; the viewport
   * compared the objects, found them identical, and did nothing.
   */
  runNonce: number
  /** Bumped by "Clear trails": the trails are drawn from a buffer the store never sees. */
  trailNonce: number

  addBody: (shape: ShapeKind, at?: [number, number, number]) => BodyDef
  updateBody: (id: BodyId, patch: Partial<BodyDef>) => void
  removeBody: (id: BodyId) => void
  select: (id: BodyId | null) => void
  setPartner: (id: BodyId | null) => void
  setWorld: (patch: Partial<WorldSettings>) => void
  pushContacts: (c: ContactEvent[]) => void
  clearContacts: () => void
  setScene: (bodies: BodyDef[], world?: Partial<WorldSettings>, links?: Link[]) => void
  addLink: (a: BodyId, b: BodyId, kind: LinkKind, over?: BodyId) => boolean
  updateLink: (id: string, patch: Partial<Link>) => void
  removeLink: (id: string) => void
  record: (samples: Record<BodyId, Sample>) => void
  clearRecording: () => void
  setSideView: (on: boolean) => void
  /** Step back one edit. The sandbox had no history at all, so a wrong delete was final. */
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  /** Every object back where its definition says, clock at zero, readings cleared. */
  resetRun: () => void
  clearTrails: () => void
  /** What goes into the project file. */
  snapshot: () => SandboxFile
  /** Opening a project, or starting a new one when nothing is given. Not undoable: it is a new history. */
  loadSandbox: (file?: SandboxFile) => void
}

/** Sensible starting sizes in metres, so a scene looks like a lab bench, not a galaxy. */
export const DEFAULT_SIZE: Record<ShapeKind, [number, number, number]> = {
  box: [0.6, 0.6, 0.6],
  sphere: [0.25, 0.25, 0.25],
  cylinder: [0.25, 0.8, 0.25],
  capsule: [0.2, 0.6, 0.2],
  cone: [0.5, 0.8, 0.5],
  ramp: [3, 1.5, 1.5],
  plank: [3, 0.15, 0.6],
  wall: [0.3, 2, 3],
  // A wheel: radius, thickness. It stands with its axis along z, facing the side view.
  pulley: [0.3, 0.15, 0.3],
  // Forty metres looked generous and was not: a ball on ice left it in seconds and fell for ever.
  ground: [200, 0.4, 200]
}

/**
 * What a new object weighs, in kg. Worked out from the material it would be 514 kg for the
 * default steel ball and 151 kg for the wooden crate — real for those sizes, and alien to
 * anyone whose intuition comes from lifting things. The sizes are for seeing; the masses are
 * the ones in the textbook. "From density" is still one click away.
 */
export const DEFAULT_MASS: Record<ShapeKind, number> = {
  box: 2,
  sphere: 1,
  cylinder: 2,
  capsule: 1,
  cone: 1,
  ramp: 10,
  plank: 2,
  wall: 10,
  ground: 10,
  pulley: 1
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
  ground: 'concrete',
  pulley: 'steel'
}

/** Half the height of a body, so it can be rested on the floor rather than dropped through it. */
export function halfHeight(shape: ShapeKind, size: [number, number, number]): number {
  const [a, b] = size
  switch (shape) {
    case 'sphere':
    case 'pulley':
      return a
    case 'capsule':
      return b / 2 + a
    default:
      return b / 2
  }
}

/** Width along x, for placing things side by side. */
const widthOf = (shape: ShapeKind, size: [number, number, number]): number =>
  shape === 'sphere' || shape === 'cylinder' || shape === 'capsule' || shape === 'pulley' ? 2 * size[0] : size[0]

/**
 * A free spot for a new object: beside the last one, resting on the floor. Every Add button used
 * to drop its object at the same point two metres up, so things spawned inside each other and
 * walls arrived floating in mid-air.
 */
export function spawnAt(shape: ShapeKind, bodies: BodyDef[]): [number, number, number] {
  if (shape === 'ground') return [0, -0.2, 0]
  const size = DEFAULT_SIZE[shape]
  // A pulley on the floor is no use to anyone; it hangs above the last object.
  if (shape === 'pulley') {
    const last = bodies.filter((b) => b.shape !== 'ground').pop()
    return [last ? last.position[0] : 0, groundTopOf(bodies) + 3.5, 0]
  }
  const others = bodies.filter((b) => b.shape !== 'ground')
  let x = 0
  if (others.length) {
    const last = others[others.length - 1]
    x = last.position[0] + widthOf(last.shape, last.size) / 2 + widthOf(shape, size) / 2 + 0.3
  }
  return [x, groundTopOf(bodies) + halfHeight(shape, size) + 0.005, 0]
}

export function makeBody(shape: ShapeKind, name: string, at: [number, number, number] = [0, 1, 0]): BodyDef {
  const material = materialById(DEFAULT_MATERIAL[shape])
  const fixed = shape === 'ramp' || shape === 'wall' || shape === 'ground' || shape === 'pulley'
  return {
    id: nextId(),
    name,
    shape,
    size: DEFAULT_SIZE[shape],
    position: at,
    // A pulley is a cylinder stood on its side so the wheel faces the camera.
    rotation: shape === 'pulley' ? [90, 0, 0] : [0, 0, 0],
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    motion: fixed ? 'static' : 'dynamic',
    material: material.id,
    massMode: 'mass',
    mass: DEFAULT_MASS[shape],
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
export function startingScene(): BodyDef[] {
  const ground = makeBody('ground', 'Floor', [0, -0.2, 0])
  const ball = makeBody('sphere', 'A', [-1.5, 3, 0])
  ball.velocity = [2, 0, 0]
  const crate = makeBody('box', 'B', [1.5, 0.3, 0])
  return [ground, ball, crate]
}

/** Drop the readings and live values of objects that no longer exist. */
function prune<T>(map: Record<BodyId, T>, bodies: BodyDef[]): Record<BodyId, T> {
  const keep = new Set(bodies.map((b) => b.id))
  return Object.fromEntries(Object.entries(map).filter(([id]) => keep.has(id)))
}

export const useSandbox = create<SandboxState>((set, get) => ({
  bodies: startingScene(),
  world: { ...DEFAULT_WORLD },
  selection: null,
  partner: null,
  contacts: [],
  engineTime: 0,
  live: {},
  sideView: true,
  links: [],
  recording: {},
  past: [],
  future: [],
  runNonce: 0,
  trailNonce: 0,

  addBody: (shape, at) => {
    remember(set, get, 'add')
    const bodies = get().bodies
    const used = new Set(bodies.map((b) => b.name))
    const letter = LETTERS.find((l) => !used.has(l)) ?? `X${bodies.length}`
    const def = makeBody(shape, shape === 'ground' ? 'Floor' : letter, at ?? spawnAt(shape, bodies))
    set({ bodies: [...bodies, def], selection: def.id })
    return def
  },

  updateBody: (id, patch) => {
    remember(set, get, `edit:${id}:${Object.keys(patch).join(',')}`)
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
    remember(set, get, 'remove')
    // A rod to an object that no longer exists would leave the engine holding a dead reference.
    const bodies = get().bodies.filter((b) => b.id !== id)
    set({
      bodies,
      links: get().links.filter((l) => l.a !== id && l.b !== id),
      selection: get().selection === id ? null : get().selection,
      partner: get().partner === id ? null : get().partner,
      recording: prune(get().recording, bodies),
      live: prune(get().live, bodies)
    })
  },
  // Choosing nothing, or choosing the partner itself, ends the pair.
  select: (selection) => set({ selection, partner: selection === null || selection === get().partner ? null : get().partner }),
  setPartner: (partner) => set({ partner: partner === get().selection ? null : partner }),
  setWorld: (patch) => set({ world: { ...get().world, ...patch } }),
  pushContacts: (c) => (c.length ? set({ contacts: [...c].reverse().concat(get().contacts).slice(0, 60) }) : undefined),
  clearContacts: () => set({ contacts: [] }),
  setScene: (bodies, world, links) => {
    remember(set, get, 'scene')
    // A new scene is a new run: the old readings, live values and clock would describe objects
    // that are no longer there.
    set({
      bodies,
      world: { ...get().world, ...world },
      links: links ?? [],
      selection: null,
      partner: null,
      contacts: [],
      recording: {},
      live: {},
      engineTime: 0,
      runNonce: get().runNonce + 1
    })
  },

  addLink: (a, b, kind, over) => {
    if (a === b) return false
    const bodies = get().bodies
    const one = bodies.find((x) => x.id === a)
    const two = bodies.find((x) => x.id === b)
    if (!one || !two) return false
    // Joining the same pair twice would double the force between them without anything to show it.
    if (get().links.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a))) return false
    // The natural length is however far apart they are right now — where they actually are, if
    // the run has moved them — so making a connection never starts by yanking them together.
    const live = get().live
    const link = makeLink(nextId(), kind, one, two, {
      over: bodies.find((x) => x.id === over),
      posA: live[a]?.position ?? one.position,
      posB: live[b]?.position ?? two.position
    })
    if (!link) return false
    remember(set, get, 'link')
    set({ links: [...get().links, link] })
    return true
  },
  updateLink: (id, patch) => {
    remember(set, get, `link:${id}`)
    set({ links: get().links.map((l) => (l.id === id ? { ...l, ...patch } : l)) })
  },
  removeLink: (id) => {
    remember(set, get, 'unlink')
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
    const { past, future, bodies, links } = get()
    const back = past[past.length - 1]
    if (!back) return
    set({ bodies: back.bodies, links: back.links, past: past.slice(0, -1), future: [...future, { bodies, links }], selection: null, partner: null })
  },
  redo: () => {
    const { past, future, bodies, links } = get()
    const next = future[future.length - 1]
    if (!next) return
    set({ bodies: next.bodies, links: next.links, future: future.slice(0, -1), past: [...past, { bodies, links }], selection: null, partner: null })
  },
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  resetRun: () => set({ runNonce: get().runNonce + 1, engineTime: 0, live: {}, recording: {}, contacts: [] }),
  snapshot: () => ({ bodies: get().bodies, links: get().links, world: get().world, sideView: get().sideView }),
  loadSandbox: (file) =>
    set({
      bodies: file?.bodies ?? startingScene(),
      links: file?.links ?? [],
      world: { ...DEFAULT_WORLD, ...(file?.world ?? {}) },
      sideView: file?.sideView ?? true,
      selection: null,
      partner: null,
      contacts: [],
      recording: {},
      live: {},
      engineTime: 0,
      past: [],
      future: [],
      runNonce: get().runNonce + 1
    }),
  clearTrails: () => set({ trailNonce: get().trailNonce + 1 })
}))

let lastRemembered = 0
let lastTag = ''

/**
 * Keeps the object list as it is now, so the next change can be undone.
 *
 * Changes that arrive in a burst — every keystroke of a new name, every drag of a slider — are
 * folded into one entry, or a student would have to press undo twenty times to take back one
 * word. Only edits to the same thing fold together: a delete straight after a slider drag used to
 * share the slider's snapshot and could not be undone at all.
 */
function remember(set: (p: Partial<SandboxState>) => void, get: () => SandboxState, tag: string): void {
  const now = Date.now()
  const burst = tag === lastTag && now - lastRemembered < 700 && get().past.length > 0
  lastRemembered = now
  lastTag = tag
  if (burst) return
  set({ past: [...get().past, { bodies: get().bodies, links: get().links }].slice(-30), future: [] })
}

/** Mass a body will have, for the panels (the engine works it out the same way). */
export const massOf = (def: BodyDef): number => SimWorld.massOf(def)

// Handy while developing: inspect the sandbox from the browser console.
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __useSandbox?: typeof useSandbox }).__useSandbox = useSandbox
