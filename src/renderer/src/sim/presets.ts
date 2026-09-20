// Experiments a student can start from.
//
// The Sandbox used to open on a floor, a ball and a crate, every single time. That is not a
// starting point for someone who has never used a physics simulator — it is a blank page. Each
// preset here sets up one classic experiment, and its description says what to measure and what
// the textbook says the answer should be, so the first thing a student does is watch something
// happen and then check it.

import { makeBody } from './store'
import { makeLink } from './links'
import { DEFAULT_WORLD, type BodyDef, type Link, type LinkKind, type WorldSettings } from './types'

export interface Preset {
  id: string
  label: string
  /** What the experiment shows, in the words a teacher would use, with the number to check. */
  about: string
  /** Where it belongs in the list. */
  topic: 'Motion' | 'Forces' | 'Energy' | 'Momentum' | 'Oscillation'
  build: () => { bodies: BodyDef[]; world?: Partial<WorldSettings>; links?: Link[] }
}

let linkCount = 0

/** A connection between two bodies of a preset, sized from where they stand. */
function join(kind: LinkKind, a: BodyDef, b: BodyDef, over?: BodyDef, patch: Partial<Link> = {}): Link {
  const l = makeLink(`pl${++linkCount}`, kind, a, b, { over })
  if (!l) throw new Error(`preset link ${kind} needs a wheel`)
  return { ...l, damping: 0.4, ...patch }
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

const ball = (name: string, at: [number, number, number], over: Partial<BodyDef> = {}) =>
  put('sphere', name, at, { size: [0.2, 0.2, 0.2], massMode: 'mass', mass: 1, material: 'steel', trace: true, ...over })

const VACUUM = { airDensity: 0 }

/**
 * The experiment "Start here" loads: one ball, one floor, nothing to set up. A student who has
 * never seen a simulator presses Play and something happens; every other preset is a step up.
 */
export const START_PRESET_ID = 'fall'

export const PRESETS: Preset[] = [
  // ---------------------------------------------------------------- motion
  {
    id: START_PRESET_ID,
    label: 'Drop a ball',
    topic: 'Motion',
    about: 'A 1 kg ball let go from 5 m. Press Play: it lands after √(2h/g) = 1.01 s at √(2gh) = 9.9 m/s. Read t off the clock.',
    build: () => ({
      bodies: [floor(), ball('A', [0, 5, 0], { size: [0.25, 0.25, 0.25], restitution: 0.3 })],
      world: VACUUM
    })
  },
  {
    id: 'projectile',
    label: 'Projectile',
    topic: 'Motion',
    about: 'A ball launched at 14 m/s and 30°. Range v² sin 2θ / g = 17.3 m; greatest height 2.5 m. Read both off the trail.',
    build: () => ({
      bodies: [floor(), ball('P', [-8, 0.3, 0], { size: [0.3, 0.3, 0.3], mass: 0.5, velocity: launchVelocity(14, 30), restitution: 0.3 })],
      world: VACUUM
    })
  },
  {
    id: 'cliff',
    label: 'Off a cliff',
    topic: 'Motion',
    about: 'Rolls off a 4 m ledge at 3 m/s. It falls for √(2h/g) = 0.90 s, so it lands 2.7 m out — however fast it was going.',
    build: () => ({
      bodies: [floor(), put('box', 'Ledge', [-6, 2, 0], { size: [4, 4, 2], motion: 'static', material: 'concrete' }), ball('P', [-4.6, 4.2, 0], { velocity: [3, 0, 0], restitution: 0.2 })],
      world: VACUUM
    })
  },
  {
    id: 'drop',
    label: 'Free fall',
    topic: 'Motion',
    about: 'A 5 kg ball and a 0.5 kg ball, dropped together from 6 m. In a vacuum they land together after √(2h/g) = 1.11 s — switch the air back on and see what changes.',
    build: () => ({
      bodies: [floor(), ball('Heavy', [-1, 6, 0], { size: [0.25, 0.25, 0.25], mass: 5, material: 'lead' }), ball('Light', [1, 6, 0], { size: [0.25, 0.25, 0.25], mass: 0.5, material: 'foam' })],
      world: VACUUM
    })
  },
  {
    id: 'moon',
    label: 'Drop on the Moon',
    topic: 'Motion',
    about: 'The same drop with g = 1.62 m/s². From 5 m it takes √(2h/g) = 2.48 s instead of 1.01 s.',
    build: () => ({
      bodies: [floor(), ball('A', [0, 5, 0])],
      world: { ...VACUUM, gravity: 1.62 }
    })
  },
  {
    id: 'terminal',
    label: 'Terminal velocity',
    topic: 'Motion',
    about: 'A 0.8 kg foam ball falls 30 m through air. Watch the speed stop rising near √(2mg / ρ C_d A) ≈ 20 m/s.',
    build: () => ({
      bodies: [floor(), ball('Foam', [0, 30, 0], { size: [0.15, 0.15, 0.15], mass: 0.8, material: 'foam' })],
      world: { airDensity: 1.225 }
    })
  },
  // ---------------------------------------------------------------- forces
  {
    id: 'ramp',
    label: 'Down a slope',
    topic: 'Forces',
    about: 'Potential energy becomes kinetic on the way down. Watch the energy bar tip over as it rolls.',
    build: () => ({
      bodies: [floor(), put('ramp', 'Slope', [-2, 0.75, 0], { size: [5, 1.5, 1.5] }), ball('A', [-4, 1.9, 0], { size: [0.25, 0.25, 0.25] })]
    })
  },
  {
    id: 'rollslide',
    label: 'Rolling against sliding',
    topic: 'Forces',
    about: 'A ball rolls down one side, a block slides down the other on ice. The block wins: the ball spends two sevenths of its energy on spinning, v = √(10gh/7) against √(2gh).',
    build: () => ({
      bodies: [
        floor(),
        put('ramp', 'Slope', [-2, 1.5, 0], { size: [8, 3, 3], friction: 0.9 }),
        ball('Ball', [-5.2, 3.5, 0.9], { size: [0.25, 0.25, 0.25], friction: 0.9 }),
        put('box', 'Block', [-5.2, 3.45, -0.9], { size: [0.4, 0.4, 0.4], massMode: 'mass', mass: 1, material: 'plastic', friction: 0.02, trace: true })
      ],
      world: { ...VACUUM, twoD: false }
    })
  },
  {
    id: 'friction',
    label: 'Sliding to a stop',
    topic: 'Forces',
    about: 'A crate shoved along at 6 m/s with μ = 0.4 stops after v² / 2μg = 4.6 m. Check the distance on the floor grid.',
    build: () => ({
      bodies: [floor(), put('box', 'Crate', [-4, 0.3, 0], { size: [0.6, 0.6, 0.6], massMode: 'mass', mass: 5, material: 'wood', friction: 0.4, velocity: [6, 0, 0], trace: true })],
      world: VACUUM
    })
  },
  {
    id: 'seesaw',
    label: 'Seesaw',
    topic: 'Forces',
    about: 'A plank on a hinge. 3 kg at 1 m against 1 kg at 1.5 m: moments 3 against 1.5, so the heavy side goes down. Drag the light ball out to 3 m to balance it.',
    build: () => {
      const stand = put('box', 'Stand', [0, 0.35, 0], { size: [0.2, 0.7, 0.4], motion: 'static', material: 'steel' })
      const plank = put('plank', 'Plank', [0, 0.78, 0], { size: [4, 0.1, 0.5], massMode: 'mass', mass: 2, material: 'wood' })
      return {
        bodies: [floor(), stand, plank, ball('Heavy', [-1, 1.03, 0], { mass: 3, material: 'lead' }), ball('Light', [1.5, 1.03, 0], { mass: 1, material: 'wood' })],
        world: VACUUM,
        links: [join('hinge', plank, stand)]
      }
    }
  },
  {
    id: 'atwood',
    label: 'Atwood machine',
    topic: 'Forces',
    about: '1 kg and 2 kg on a rope over a pulley. Both accelerate at (m₂ − m₁) g / (m₁ + m₂) = 3.27 m/s², a third of free fall.',
    build: () => {
      const wheel = put('pulley', 'Pulley', [0, 5, 0], { size: [0.3, 0.15, 0.3] })
      const light = put('box', 'm₁', [-0.3, 2.5, 0], { size: [0.3, 0.3, 0.3], massMode: 'mass', mass: 1, material: 'wood', trace: true })
      const heavy = put('box', 'm₂', [0.3, 2.5, 0], { size: [0.3, 0.3, 0.3], massMode: 'mass', mass: 2, material: 'steel', trace: true })
      return { bodies: [floor(), wheel, light, heavy], world: VACUUM, links: [join('pulley', light, heavy, wheel)] }
    }
  },
  {
    id: 'lift',
    label: 'Lifting with a pulley',
    topic: 'Forces',
    about: 'A 4 kg weight lifts a 3 kg crate off the floor. The pair accelerates at (4 − 3) g / 7 = 1.4 m/s²; the rope carries 3 × (g + a) = 33.6 N.',
    build: () => {
      const wheel = put('pulley', 'Pulley', [0, 4.5, 0], { size: [0.3, 0.15, 0.3] })
      const crate = put('box', 'Crate', [-0.3, 0.3, 0], { size: [0.6, 0.6, 0.6], massMode: 'mass', mass: 3, material: 'wood', trace: true })
      const weight = put('box', 'Weight', [0.3, 3, 0], { size: [0.35, 0.35, 0.35], massMode: 'mass', mass: 4, material: 'lead', trace: true })
      return { bodies: [floor(), wheel, crate, weight], world: VACUUM, links: [join('pulley', crate, weight, wheel)] }
    }
  },
  // ---------------------------------------------------------------- energy
  {
    id: 'bounce',
    label: 'Bouncing ball',
    topic: 'Energy',
    about: 'A rubber ball with e = 0.8 dropped from 3 m comes back to e² × 3 = 1.92 m, then 1.23 m, then 0.79 m.',
    build: () => ({
      bodies: [floor(), ball('Ball', [0, 3, 0], { material: 'rubber', restitution: 0.8, mass: 0.5 })],
      world: VACUUM
    })
  },
  {
    id: 'galileo',
    label: "Galileo's ramps",
    topic: 'Energy',
    about: 'Down one slope and up the other. With no friction it climbs back to the height it started from, whatever the second slope looks like.',
    build: () => ({
      bodies: [
        floor('ice'),
        put('ramp', 'Down', [-4, 1, 0], { size: [6, 2, 1.5], friction: 0.02 }),
        put('ramp', 'Up', [5, 1.25, 0], { size: [8, 2.5, 1.5], rotation: [0, 180, 0], friction: 0.02 }),
        ball('A', [-6.5, 2.4, 0], { friction: 0.02, rolling: 0 })
      ],
      world: VACUUM
    })
  },
  {
    id: 'stack',
    label: 'Knock it over',
    topic: 'Energy',
    about: 'A tower and a ball. Nothing to measure — somewhere to start.',
    build: () => ({
      bodies: [
        floor(),
        put('box', 'A', [2, 0.3, 0], { size: [0.6, 0.6, 0.6], massMode: 'mass', mass: 2 }),
        put('box', 'B', [2, 0.9, 0], { size: [0.6, 0.6, 0.6], massMode: 'mass', mass: 2 }),
        put('box', 'C', [2, 1.5, 0], { size: [0.6, 0.6, 0.6], massMode: 'mass', mass: 2 }),
        ball('Ball', [-4, 1, 0], { size: [0.3, 0.3, 0.3], mass: 2, velocity: [9, 1, 0], trace: false })
      ]
    })
  },
  // ---------------------------------------------------------------- momentum
  {
    id: 'collision',
    label: 'Head-on collision',
    topic: 'Momentum',
    about: 'A 1 kg ball at 5 m/s into a 3 kg ball at rest, e = 0.9. Momentum before (5) equals momentum after, whatever the bounce does to the energy.',
    build: () => ({
      bodies: [
        floor('ice'),
        ball('A', [-4, 0.3, 0], { size: [0.3, 0.3, 0.3], velocity: [5, 0, 0], restitution: 0.9, material: 'rubber' }),
        ball('B', [1, 0.3, 0], { size: [0.3, 0.3, 0.3], mass: 3, restitution: 0.9, material: 'steel' })
      ],
      world: VACUUM
    })
  },
  {
    id: 'sticky',
    label: 'Sticky collision',
    topic: 'Momentum',
    about: '1 kg at 4 m/s hits 3 kg at rest and they move off together: 4 = (1 + 3) v, so v = 1 m/s. Three quarters of the kinetic energy is gone.',
    build: () => ({
      bodies: [
        floor('ice'),
        ball('A', [-4, 0.3, 0], { size: [0.3, 0.3, 0.3], velocity: [4, 0, 0], restitution: 0, material: 'rubber' }),
        ball('B', [1, 0.3, 0], { size: [0.3, 0.3, 0.3], mass: 3, restitution: 0, material: 'rubber' })
      ],
      world: VACUUM
    })
  },
  {
    id: 'recoil',
    label: 'Recoil',
    topic: 'Momentum',
    about: 'A 10 kg block fires a 0.5 kg ball. They leave with equal and opposite momentum, 25 kg m/s each way, so the small one goes twenty times faster.',
    build: () => ({
      bodies: [
        floor('ice'),
        put('box', 'Gun', [0, 0.35, 0], { size: [1.2, 0.6, 0.6], massMode: 'mass', mass: 10, velocity: [-2.5, 0, 0], material: 'wood', trace: true }),
        put('sphere', 'Bullet', [1.2, 0.35, 0], { size: [0.12, 0.12, 0.12], massMode: 'mass', mass: 0.5, velocity: [50, 0, 0], material: 'lead', trace: true })
      ],
      world: { ...VACUUM, timeScale: 0.1 }
    })
  },
  {
    id: 'crash',
    label: 'Into a wall',
    topic: 'Momentum',
    about: 'A 5 kg crate at 8 m/s hits a wall: 40 kg m/s of momentum gone in a few milliseconds. Watch the kinetic energy vanish in the Energy bar.',
    build: () => ({
      bodies: [floor(), put('wall', 'Wall', [3, 1, 0]), put('box', 'Crate', [-4, 0.35, 0], { size: [0.8, 0.7, 0.7], massMode: 'mass', mass: 5, material: 'wood', velocity: [8, 0, 0], restitution: 0.1, trace: true })],
      world: VACUUM
    })
  },
  {
    id: 'cradle',
    label: "Newton's cradle",
    topic: 'Momentum',
    about: 'Five steel balls on strings. One in, one out: momentum and energy both pass straight through the middle three.',
    build: () => {
      const bodies: BodyDef[] = [floor()]
      const links: Link[] = []
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 0.3
        const pivot = put('box', `P${i + 1}`, [x, 3.5, 0], { size: [0.06, 0.06, 0.06], motion: 'static', material: 'steel' })
        const b = ball(`B${i + 1}`, [x, 1.5, 0], { size: [0.15, 0.15, 0.15], material: 'steel', restitution: 0.98, friction: 0, trace: i === 0 || i === 4, velocity: i === 0 ? [-2, 0, 0] : [0, 0, 0] })
        bodies.push(pivot, b)
        links.push(join('string', pivot, b))
      }
      return { bodies, world: VACUUM, links }
    }
  },
  {
    id: 'trolleys',
    label: 'Two trolleys and a rod',
    topic: 'Momentum',
    about: 'Two crates joined by a rod on ice, hit by a ball. They move off together: the rod carries the push from one to the other.',
    build: () => {
      const a = put('box', 'A', [0, 0.25, 0], { size: [0.5, 0.5, 0.5], massMode: 'mass', mass: 2, material: 'wood' })
      const b = put('box', 'B', [1.5, 0.25, 0], { size: [0.5, 0.5, 0.5], massMode: 'mass', mass: 2, material: 'wood' })
      return {
        bodies: [floor('ice'), a, b, ball('Ball', [-3, 0.25, 0], { velocity: [6, 0, 0], restitution: 0.5 })],
        world: VACUUM,
        links: [join('rod', a, b)]
      }
    }
  },
  // ---------------------------------------------------------------- oscillation
  {
    id: 'pendulum',
    label: 'Pendulum',
    topic: 'Oscillation',
    about: 'A bob on a 2 m string. Time ten swings: T = 2π√(L/g) = 2.84 s, whatever the mass.',
    build: () => {
      const pivot = put('box', 'Pivot', [0, 4, 0], { size: [0.12, 0.12, 0.12], motion: 'static', material: 'steel' })
      const bob = put('sphere', 'Bob', [1.6, 2.8, 0], { size: [0.15, 0.15, 0.15], material: 'lead', massMode: 'mass', mass: 1, trace: true, angularDamping: 0 })
      return { bodies: [floor(), pivot, bob], world: VACUUM, links: [join('string', pivot, bob, undefined, { length: 2 })] }
    }
  },
  {
    id: 'ropeswing',
    label: 'Rope swing',
    topic: 'Oscillation',
    about: 'A 2 kg bob on a real rope that bends and hangs. Let go from the side and the rope goes slack at the top of a big swing — a string could not show that.',
    build: () => {
      const pivot = put('box', 'Beam', [0, 5, 0], { size: [0.15, 0.15, 0.15], motion: 'static', material: 'steel' })
      const bob = ball('Bob', [2.6, 3.8, 0], { mass: 2, material: 'lead', size: [0.18, 0.18, 0.18] })
      return { bodies: [floor(), pivot, bob], world: VACUUM, links: [join('rope', pivot, bob)] }
    }
  },
  {
    id: 'spring',
    label: 'Mass on a spring',
    topic: 'Oscillation',
    about: 'Pull it down and let go. The period is T = 2π√(m/k) = 0.63 s for 2 kg on 200 N/m — check it against the clock.',
    build: () => {
      const hook = put('box', 'Hook', [0, 4, 0], { size: [0.12, 0.12, 0.12], motion: 'static', material: 'steel' })
      const mass = put('box', 'M', [0, 2.2, 0], { size: [0.35, 0.35, 0.35], material: 'steel', massMode: 'mass', mass: 2, trace: true })
      return { bodies: [floor(), hook, mass], world: VACUUM, links: [join('spring', hook, mass, undefined, { length: 1.4, stiffness: 200 })] }
    }
  },
  {
    id: 'springice',
    label: 'Spring on ice',
    topic: 'Oscillation',
    about: 'A 2 kg block on ice, on a 50 N/m spring stretched by 0.6 m. It oscillates with T = 2π√(m/k) = 1.26 s, and the energy swaps between spring and motion.',
    build: () => {
      const wall = put('wall', 'Wall', [-3, 1, 0])
      const block = put('box', 'M', [0.6, 0.25, 0], { size: [0.5, 0.5, 0.5], massMode: 'mass', mass: 2, material: 'steel', friction: 0.01, trace: true })
      return { bodies: [floor('ice'), wall, block], world: VACUUM, links: [join('spring', wall, block, undefined, { length: 3, stiffness: 50, damping: 0 })] }
    }
  }
]

export const presetById = (id: string): Preset | undefined => PRESETS.find((p) => p.id === id)

/** The preset behind the "Start here" button. */
export const startPreset = (): Preset => presetById(START_PRESET_ID) ?? PRESETS[0]

/** The world a preset wants, on top of the defaults, so one experiment cannot leave the next in slow motion. */
export const worldFor = (p: Preset): WorldSettings => ({ ...DEFAULT_WORLD, ...(p.build().world ?? {}) })

export const PRESET_TOPICS: Preset['topic'][] = ['Motion', 'Forces', 'Energy', 'Momentum', 'Oscillation']
