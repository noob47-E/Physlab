// Experiments a student can start from.
//
// The Sandbox used to open on a floor, a ball and a crate, every single time. That is not a
// starting point for someone who has never used a physics simulator — it is a blank page. Each
// preset here sets up one classic experiment, so the first thing a student does is watch
// something happen and then take it apart.

import { makeBody } from './store'
import { DEFAULT_WORLD, type BodyDef, type Link, type LinkKind, type WorldSettings } from './types'

export interface Preset {
  id: string
  label: string
  /** What the experiment shows, in the words a teacher would use. */
  about: string
  build: () => { bodies: BodyDef[]; world?: Partial<WorldSettings>; links?: Link[] }
}

let linkCount = 0

/** A rod, string or spring between two bodies of a preset. */
function link(a: BodyDef, b: BodyDef, kind: LinkKind, length: number, stiffness = 200): Link {
  return { id: `pl${++linkCount}`, kind, a: a.id, b: b.id, length, stiffness, damping: 0.4 }
}

/** Velocity components of a launch: the calculation a projectile question starts with. */
export function launchVelocity(speed: number, angleDeg: number): [number, number, number] {
  const a = (angleDeg * Math.PI) / 180
  return [speed * Math.cos(a), speed * Math.sin(a), 0]
}

const floor = (material = 'concrete'): BodyDef => {
  const g = makeBody('ground', 'Floor', [0, -0.2, 0])
  g.material = material
  return g
}

/** A body built and adjusted in one expression, so a preset reads like a setup, not a program. */
function put(shape: Parameters<typeof makeBody>[0], name: string, at: [number, number, number], over: Partial<BodyDef> = {}): BodyDef {
  return { ...makeBody(shape, name, at), ...over }
}

export const PRESETS: Preset[] = [
  {
    id: 'projectile',
    label: 'Projectile',
    about: 'A ball launched at 30° leaves a parabola. Read the range and the greatest height off the trail.',
    build: () => ({
      bodies: [
        floor(),
        put('sphere', 'P', [-8, 0.3, 0], { size: [0.3, 0.3, 0.3], massMode: 'mass', mass: 0.5, velocity: launchVelocity(14, 30), trace: true, restitution: 0.3 })
      ],
      world: { airDensity: 0 }
    })
  },
  {
    id: 'collision',
    label: 'Head-on collision',
    about: 'A 1 kg ball into a 3 kg ball. Momentum before equals momentum after, whatever the bounce does to the energy.',
    build: () => ({
      bodies: [
        floor('ice'),
        put('sphere', 'A', [-4, 0.3, 0], { size: [0.3, 0.3, 0.3], massMode: 'mass', mass: 1, velocity: [5, 0, 0], restitution: 0.9, material: 'rubber', trace: true }),
        put('sphere', 'B', [1, 0.3, 0], { size: [0.3, 0.3, 0.3], massMode: 'mass', mass: 3, velocity: [0, 0, 0], restitution: 0.9, material: 'steel', trace: true })
      ],
      world: { airDensity: 0 }
    })
  },
  {
    id: 'recoil',
    label: 'Recoil',
    about: 'A heavy block fires a light one. They leave with equal and opposite momentum, so the small one goes far faster.',
    build: () => ({
      bodies: [
        floor('ice'),
        put('box', 'Gun', [0, 0.35, 0], { size: [1.2, 0.6, 0.6], massMode: 'mass', mass: 40, velocity: [-2.5, 0, 0], material: 'wood', trace: true }),
        put('sphere', 'Bullet', [1.2, 0.35, 0], { size: [0.12, 0.12, 0.12], massMode: 'mass', mass: 0.5, velocity: [200, 0, 0], material: 'lead', trace: true })
      ],
      world: { airDensity: 0, timeScale: 0.1 }
    })
  },
  {
    id: 'ramp',
    label: 'Down a slope',
    about: 'Potential energy becomes kinetic on the way down. Watch the energy bar tip over as it rolls.',
    build: () => ({
      bodies: [
        floor(),
        put('ramp', 'Slope', [-2, 0.75, 0], { size: [5, 1.5, 1.5] }),
        put('sphere', 'A', [-4, 1.9, 0], { size: [0.25, 0.25, 0.25], material: 'steel', massMode: 'mass', mass: 1, trace: true })
      ]
    })
  },
  {
    id: 'drop',
    label: 'Free fall',
    about: 'Two very different masses, dropped together. In a vacuum they land together — switch the air back on and see what changes.',
    build: () => ({
      bodies: [
        floor(),
        put('sphere', 'Heavy', [-1, 6, 0], { size: [0.25, 0.25, 0.25], material: 'lead', trace: true }),
        put('sphere', 'Light', [1, 6, 0], { size: [0.25, 0.25, 0.25], material: 'foam', trace: true })
      ],
      world: { airDensity: 0 }
    })
  },
  {
    id: 'stack',
    label: 'Knock it over',
    about: 'A tower and a ball. Nothing to measure — somewhere to start.',
    build: () => ({
      bodies: [
        floor(),
        put('box', 'A', [2, 0.3, 0], { size: [0.6, 0.6, 0.6] }),
        put('box', 'B', [2, 0.9, 0], { size: [0.6, 0.6, 0.6] }),
        put('box', 'C', [2, 1.5, 0], { size: [0.6, 0.6, 0.6] }),
        put('sphere', 'Ball', [-4, 1, 0], { size: [0.3, 0.3, 0.3], material: 'steel', velocity: [9, 1, 0] })
      ]
    })
  },
  {
    id: 'pendulum',
    label: 'Pendulum',
    about: 'A bob on a string. Time ten swings, then find g from T = 2π√(L/g).',
    build: () => {
      const pivot = put('box', 'Pivot', [0, 4, 0], { size: [0.12, 0.12, 0.12], motion: 'static', material: 'steel' })
      const bob = put('sphere', 'Bob', [1.6, 2.8, 0], { size: [0.15, 0.15, 0.15], material: 'lead', massMode: 'mass', mass: 1, trace: true, angularDamping: 0 })
      return { bodies: [floor(), pivot, bob], world: { airDensity: 0 }, links: [link(pivot, bob, 'string', 2)] }
    }
  },
  {
    id: 'spring',
    label: 'Mass on a spring',
    about: 'Pull it down and let go. The period is T = 2π√(m/k) — check it against the clock.',
    build: () => {
      const hook = put('box', 'Hook', [0, 4, 0], { size: [0.12, 0.12, 0.12], motion: 'static', material: 'steel' })
      const mass = put('box', 'M', [0, 2.2, 0], { size: [0.35, 0.35, 0.35], material: 'steel', massMode: 'mass', mass: 2, trace: true })
      return { bodies: [floor(), hook, mass], world: { airDensity: 0 }, links: [link(hook, mass, 'spring', 1.4, 200)] }
    }
  }
]

export const presetById = (id: string): Preset | undefined => PRESETS.find((p) => p.id === id)

/** The world a preset wants, on top of the defaults, so one experiment cannot leave the next in slow motion. */
export const worldFor = (p: Preset): WorldSettings => ({ ...DEFAULT_WORLD, ...(p.build().world ?? {}) })
