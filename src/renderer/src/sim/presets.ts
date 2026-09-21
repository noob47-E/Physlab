// Experiments a student can start from.
//
// The Sandbox used to open on a floor, a ball and a crate, every single time. That is not a
// starting point for someone who has never used a physics simulator — it is a blank page. Each
// preset here sets up one classic experiment, and its description says what to measure and what
// the textbook says the answer should be, so the first thing a student does is watch something
// happen and then check it.

import { makeBody } from './store'
import { makeLink, ropeSegments } from './links'
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
    about: 'A 1 kg ball let go with its underside 5 m up. Press Play: it lands after √(2h/g) = 1.01 s at √(2gh) = 9.9 m/s. Read t off the clock.',
    build: () => ({
      // The ball's underside, not its centre, is what lands: a 25 cm ball sits 25 cm higher.
      bodies: [floor(), ball('A', [0, 5.25, 0], { size: [0.25, 0.25, 0.25], restitution: 0.3 })],
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
    about: 'Slides off a 4 m ledge at 3 m/s. It falls for √(2h/g) = 0.90 s, so it lands 2.7 m out from the edge, at x ≈ −1.3 — however fast it was going.',
    build: () => ({
      // Frictionless, so it leaves the edge at the 3 m/s in the sentence: with friction the
      // ledge spun it up to a roll at 5/7 of that and it landed at x = −2.1.
      bodies: [floor(), put('box', 'Ledge', [-6, 2, 0], { size: [4, 4, 2], motion: 'static', material: 'concrete' }), ball('P', [-4.6, 4.2, 0], { velocity: [3, 0, 0], restitution: 0.2, friction: 0 })],
      world: VACUUM
    })
  },
  {
    id: 'drop',
    label: 'Free fall',
    topic: 'Motion',
    about: 'A 5 kg ball and a 0.5 kg ball, dropped together with their undersides 6 m up. In a vacuum they land together after √(2h/g) = 1.11 s — switch the air back on and see what changes.',
    build: () => ({
      bodies: [floor(), ball('Heavy', [-1, 6.25, 0], { size: [0.25, 0.25, 0.25], mass: 5, material: 'lead' }), ball('Light', [1, 6.25, 0], { size: [0.25, 0.25, 0.25], mass: 0.5, material: 'foam' })],
      world: VACUUM
    })
  },
  {
    id: 'moon',
    label: 'Drop on the Moon',
    topic: 'Motion',
    about: 'The same drop with g = 1.62 m/s². With its underside 5 m up it takes √(2h/g) = 2.48 s instead of 1.01 s.',
    build: () => ({
      bodies: [floor(), ball('A', [0, 5.2, 0])],
      world: { ...VACUUM, gravity: 1.62 }
    })
  },
  {
    id: 'terminal',
    label: 'Terminal velocity',
    topic: 'Motion',
    about: 'A 0.8 kg foam ball falls 45 m through air. Watch the speed stop rising near √(2mg / ρ C_d A) ≈ 20 m/s: it reaches 95 % of that by the floor, where a 30 m drop only got to 88 %.',
    build: () => ({
      // 45 m, not 30: the speed reaches 95 % of terminal on the way down, so the plateau shows.
      bodies: [floor(), ball('Foam', [0, 45.15, 0], { size: [0.15, 0.15, 0.15], mass: 0.8, material: 'foam' })],
      world: { airDensity: 1.225 }
    })
  },
  // ---------------------------------------------------------------- forces
  {
    id: 'ramp',
    label: 'Down a slope',
    topic: 'Forces',
    about: 'Potential energy becomes kinetic on the way down: a 1.5 m drop gives a rolling ball √(10gh/7) = 4.6 m/s at the bottom, not √(2gh) = 5.4 m/s, because two sevenths of the energy goes into the spin. Watch the energy bar tip over.',
    build: () => ({
      // The ball rests on the slope with its centre 1.5 m above where it ends up on the floor,
      // so the drop in the sentence is the drop it makes. A steel slope: concrete's rolling
      // resistance took 3 % off the speed over five metres.
      bodies: [floor(), put('ramp', 'Slope', [-2, 0.75, 0], { size: [5, 1.5, 1.5], material: 'steel' }), ball('A', [-4.4, 1.75, 0], { size: [0.25, 0.25, 0.25] })],
      world: VACUUM
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
      // The engine takes the friction between two surfaces as √(μ₁ μ₂), so the floor has to be
      // 0.4 as well: against concrete's 0.8 the crate stopped after 3.2 m, not 4.6.
      bodies: [{ ...floor(), friction: 0.4 }, put('box', 'Crate', [-4, 0.3, 0], { size: [0.6, 0.6, 0.6], massMode: 'mass', mass: 5, material: 'wood', friction: 0.4, velocity: [6, 0, 0], trace: true })],
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
      // Long enough for the instruction in `about`: a 4 m plank ended at 2 m, so a ball dragged
      // out to 3 m fell off the end instead of balancing.
      const plank = put('plank', 'Plank', [0, 0.78, 0], { size: [7, 0.1, 0.5], massMode: 'mass', mass: 2, material: 'wood' })
      return {
        bodies: [floor(), stand, plank, ball('Heavy', [-1, 1.03, 0], { mass: 3, material: 'lead' }), ball('Light', [1.5, 1.03, 0], { mass: 1, material: 'wood' })],
        world: VACUUM,
        // The hinge axis runs through the plank's own centre, at plank height. A hinge at the
        // stand's centre put the axis 0.43 m below the plank's weight, which is a plank balanced
        // on a point: it tipped over whatever sat on it, and no arrangement of balls could hold.
        links: [join('hinge', plank, stand, undefined, { pivotA: [0, 0, 0], pivotB: [0, plank.position[1] - stand.position[1], 0] })]
      }
    }
  },
  {
    id: 'atwood',
    label: 'Atwood machine',
    topic: 'Forces',
    about: '1 kg and 2 kg on a rope over a pulley. Both accelerate at (m₂ − m₁) g / (m₁ + m₂) = 3.27 m/s², a third of free fall. Watch m₂: it falls ½at² = 0.41 m in the first 0.5 s, and m₁ rises the same.',
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
    about: 'A 4 kg weight lifts a 3 kg crate off the floor. The pair accelerates at (4 − 3) g / 7 = 1.4 m/s²; the rope carries 3 × (g + a) = 33.6 N. Watch the crate leave the floor at once, and how slowly it gains speed compared with a drop.',
    build: () => {
      const wheel = put('pulley', 'Pulley', [0, 4.5, 0], { size: [0.3, 0.15, 0.3] })
      const crate = put('box', 'Crate', [-0.3, 0.3, 0], { size: [0.6, 0.6, 0.6], massMode: 'mass', mass: 3, material: 'wood', trace: true })
      const weight = put('box', 'Weight', [0.3, 3, 0], { size: [0.35, 0.35, 0.35], massMode: 'mass', mass: 4, material: 'lead', trace: true })
      return { bodies: [floor(), wheel, crate, weight], world: VACUUM, links: [join('pulley', crate, weight, wheel)] }
    }
  },
  {
    id: 'balance',
    label: 'Balanced pulley',
    topic: 'Forces',
    about: 'Equal 2 kg masses on a rope over a pulley: nothing moves, because the rope pulls both up with the same 19.6 N. Drag one down 1 m and the other rises 1 m — that is all a pulley does: it turns the pull round.',
    build: () => {
      const wheel = put('pulley', 'Pulley', [0, 4.5, 0], { size: [0.3, 0.15, 0.3] })
      const left = put('box', 'A', [-0.3, 2, 0], { size: [0.3, 0.3, 0.3], massMode: 'mass', mass: 2, material: 'wood', trace: true })
      const right = put('box', 'B', [0.3, 2, 0], { size: [0.3, 0.3, 0.3], massMode: 'mass', mass: 2, material: 'wood', trace: true })
      return { bodies: [floor(), wheel, left, right], world: VACUUM, links: [join('pulley', left, right, wheel)] }
    }
  },
  {
    id: 'crane',
    label: 'Crane',
    topic: 'Forces',
    about: 'A 3 kg crate hangs from a beam on a 2.5 m rope. At rest the rope carries the whole weight, mg = 29.4 N. Shorten L in Connections and the crate lifts; lengthen it and the crate is lowered.',
    build: () => {
      const beam = put('box', 'Beam', [0, 5, 0], { size: [0.15, 0.15, 0.15], motion: 'static', material: 'steel' })
      // 5 − 0.075 (beam) − 2.5 (rope) − 0.25 (half the crate): the rope is exactly 2.5 m.
      const crate = put('box', 'Crate', [0, 2.175, 0], { size: [0.5, 0.5, 0.5], massMode: 'mass', mass: 3, material: 'wood', trace: true })
      return { bodies: [floor(), beam, crate], world: VACUUM, links: [join('rope', beam, crate, undefined, { length: 2.5, segments: ropeSegments(2.5) })] }
    }
  },
  // ---------------------------------------------------------------- energy
  {
    id: 'bounce',
    label: 'Bouncing ball',
    topic: 'Energy',
    about: 'A rubber ball with e = 0.8 dropped from 3 m comes back to e² × 3 = 1.92 m, then 1.23 m, then 0.79 m.',
    build: () => ({
      // The underside is what drops 3 m: a 20 cm ball whose centre was at 3.0 fell 2.8 and came
      // back to 1.79, not 1.92.
      bodies: [floor(), ball('Ball', [0, 3.2, 0], { material: 'rubber', restitution: 0.8, mass: 0.5 })],
      world: VACUUM
    })
  },
  {
    id: 'galileo',
    label: "Galileo's ramps",
    topic: 'Energy',
    about: 'Down one slope and up the other. Rolling, it climbs back to nearly the height it started from — about 0.95 m of the 1.1 m — whatever the second slope looks like. The little it loses goes at the two corners where slope meets floor.',
    build: () => ({
      // Steel slopes and a rolling ball: a ball with μ = 0.02 slid, and sliding friction over
      // fifteen metres ate half its energy. The Up slope sits 3 cm into the floor so its bottom
      // edge is buried: rolling into the exposed edge cost 17 % of the energy in one hit.
      bodies: [
        floor('ice'),
        put('ramp', 'Down', [-4, 0.6, 0], { size: [6, 1.2, 1.5], material: 'steel' }),
        put('ramp', 'Up', [5, 0.72, 0], { size: [8, 1.5, 1.5], rotation: [0, 180, 0], material: 'steel' }),
        // Resting on the slope at x = −6.5: the surface is 1.1 m up there, plus r / cos θ.
        ball('A', [-6.5, 1.306, 0], { restitution: 0.1, rolling: 0 })
      ],
      world: VACUUM
    })
  },
  {
    id: 'stack',
    label: 'Knock it over',
    topic: 'Energy',
    about: 'A 2 kg ball at 9 m/s into a tower of three 2 kg crates. It brings 18 kg m/s and ½mv² = 81 J — watch the Energy bar to see how much survives the crash, and where the momentum goes.',
    build: () => ({
      bodies: [
        floor(),
        put('box', 'A', [2, 0.3, 0], { size: [0.6, 0.6, 0.6], massMode: 'mass', mass: 2 }),
        put('box', 'B', [2, 0.9, 0], { size: [0.6, 0.6, 0.6], massMode: 'mass', mass: 2 }),
        put('box', 'C', [2, 1.5, 0], { size: [0.6, 0.6, 0.6], massMode: 'mass', mass: 2 }),
        ball('Ball', [-4, 1, 0], { size: [0.3, 0.3, 0.3], mass: 2, velocity: [9, 0, 0], trace: false })
      ],
      world: VACUUM
    })
  },
  // ---------------------------------------------------------------- momentum
  {
    id: 'collision',
    label: 'Head-on collision',
    topic: 'Momentum',
    about: 'A 1 kg ball at 5 m/s into a 3 kg ball at rest, e = 0.9. Momentum before (5 kg m/s) equals momentum after, whatever the bounce does to the energy: A comes back at 2.1 m/s and B goes on at 2.4 m/s.',
    build: () => ({
      // Frictionless balls: with friction the floor spun A up on the way in and it arrived at
      // 3.6 m/s, not 5, so no after-speed matched the sentence.
      bodies: [
        floor('ice'),
        ball('A', [-4, 0.3, 0], { size: [0.3, 0.3, 0.3], velocity: [5, 0, 0], restitution: 0.9, material: 'rubber', friction: 0 }),
        ball('B', [1, 0.3, 0], { size: [0.3, 0.3, 0.3], mass: 3, restitution: 0.9, material: 'steel', friction: 0 })
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
        ball('A', [-4, 0.3, 0], { size: [0.3, 0.3, 0.3], velocity: [4, 0, 0], restitution: 0, material: 'rubber', friction: 0 }),
        ball('B', [1, 0.3, 0], { size: [0.3, 0.3, 0.3], mass: 3, restitution: 0, material: 'rubber', friction: 0 })
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
    about: 'Five steel balls on strings. One in, one out: momentum and energy both pass straight through the middle three, and the last ball leaves with nearly all of the speed the first one arrived with.',
    build: () => {
      const bodies: BodyDef[] = [floor()]
      const links: Link[] = []
      for (let i = 0; i < 5; i++) {
        // 6 mm between the balls, and "exact" accuracy below: touching balls are solved as one
        // lump and the last one left with 40 % of the speed. With a gap and eight sub-steps
        // each hit is its own collision, the way the real toy works.
        const x = (i - 2) * 0.306
        const pivot = put('box', `P${i + 1}`, [x, 3.5, 0], { size: [0.06, 0.06, 0.06], motion: 'static', material: 'steel' })
        const b = ball(`B${i + 1}`, [x, 1.5, 0], { size: [0.15, 0.15, 0.15], material: 'steel', restitution: 0.98, friction: 0, trace: i === 0 || i === 4, velocity: i === 0 ? [-2, 0, 0] : [0, 0, 0] })
        bodies.push(pivot, b)
        links.push(join('string', pivot, b))
      }
      return { bodies, world: { ...VACUUM, collisionSteps: 8 }, links }
    }
  },
  {
    id: 'trolleys',
    label: 'Two trolleys and a rod',
    topic: 'Momentum',
    about: 'Two 2 kg crates joined by a rod on ice, hit by a 1 kg ball at 6 m/s that sticks. They move off together: the rod carries the push from one to the other, and 6 kg m/s shared by 5 kg is 1.2 m/s for everything.',
    build: () => {
      // Nothing here has friction or bounce: on the old ice the crates stopped in a second and
      // the ball came back, and there was no number to check.
      const a = put('box', 'A', [0, 0.25, 0], { size: [0.5, 0.5, 0.5], massMode: 'mass', mass: 2, material: 'wood', friction: 0, restitution: 0 })
      const b = put('box', 'B', [1.5, 0.25, 0], { size: [0.5, 0.5, 0.5], massMode: 'mass', mass: 2, material: 'wood', friction: 0, restitution: 0 })
      return {
        bodies: [floor('ice'), a, b, ball('Ball', [-3, 0.25, 0], { velocity: [6, 0, 0], restitution: 0, friction: 0 })],
        world: VACUUM,
        links: [join('rod', a, b)]
      }
    }
  },
  {
    id: 'tug',
    label: 'Tug on a slack rope',
    topic: 'Momentum',
    about: 'A 4 kg crate sliding away at 3 m/s on ice, tied to a 2 kg crate by a rope with half a metre of slack. The rope snaps taut and yanks: the 12 kg m/s it had is shared by 6 kg, so the pair runs on at about 2 m/s — watch p in the Energy section stay at 12.',
    build: () => {
      // Tall crates, so the rope is tied high enough to hang in a sag without reaching the ice.
      const crate = put('box', 'Crate', [-1.7, 0.6, 0], { size: [0.5, 1.2, 0.5], massMode: 'mass', mass: 2, material: 'wood', friction: 0, restitution: 0, trace: true })
      const puller = put('box', 'Puller', [0, 0.6, 0], { size: [0.5, 1.2, 0.5], massMode: 'mass', mass: 4, material: 'wood', friction: 0, restitution: 0, velocity: [3, 0, 0], trace: true })
      // 1.2 m between the facing sides, 1.7 m of rope: half a metre of slack, taken up in 0.17 s.
      // Any more and the sag reached the ice.
      return { bodies: [floor('ice'), crate, puller], world: VACUUM, links: [join('rope', crate, puller, undefined, { length: 1.7, segments: ropeSegments(1.7) })] }
    }
  },
  // ---------------------------------------------------------------- oscillation
  {
    id: 'pendulum',
    label: 'Pendulum',
    topic: 'Oscillation',
    about: 'A bob on a 2 m string, let go from 15°. Time ten swings: T = 2π√(L/g) = 2.84 s, whatever the mass. Drag it out to 53° and a swing takes 3.0 s — the formula is for small swings.',
    build: () => {
      const pivot = put('box', 'Pivot', [0, 4, 0], { size: [0.12, 0.12, 0.12], motion: 'static', material: 'steel' })
      // 15° from the vertical (2 sin 15°, 4 − 2 cos 15°): from the old 53° a swing took 3.0 s.
      const bob = put('sphere', 'Bob', [0.518, 2.068, 0], { size: [0.15, 0.15, 0.15], material: 'lead', massMode: 'mass', mass: 1, trace: true, angularDamping: 0 })
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
    id: 'swingbridge',
    label: 'Bob on two strings',
    topic: 'Oscillation',
    about: 'A bob hung from two beams on two 2.5 m strings, making a V. It swings across the V like a pendulum of its vertical drop h = 2 m: T = 2π√(h/g) = 2.84 s, not 3.17 s for 2.5 m. In the side view the two strings line up; switch to 3D to see the V.',
    build: () => {
      // The beams stand either side of the swing, along z, so the swing itself is across the
      // side view. Two strings in the x–y plane would have held the bob still in 2D. Strings,
      // not ropes: a rope weighs a tenth of its bob and swung 4 % quick for the formula.
      const left = put('box', 'Beam 1', [0, 5, -1.5], { size: [0.15, 0.15, 0.15], motion: 'static', material: 'steel' })
      const right = put('box', 'Beam 2', [0, 5, 1.5], { size: [0.15, 0.15, 0.15], motion: 'static', material: 'steel' })
      const bob = ball('Bob', [0, 3, 0], { size: [0.15, 0.15, 0.15], material: 'lead', velocity: [1.5, 0, 0], angularDamping: 0 })
      return { bodies: [floor(), left, right, bob], world: { ...VACUUM, twoD: false }, links: [join('string', left, bob, undefined, { length: 2.5 }), join('string', right, bob, undefined, { length: 2.5 })] }
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
      // The post's centre is at the block's height, so the spring is level. It used to run from
      // the middle of a 2 m wall down to the block: tilted, 0.68 m stretched instead of 0.6, and
      // pressing the block into the floor, so the period came out at 1.4 s.
      const post = put('box', 'Post', [-3, 0.25, 0], { size: [0.3, 0.5, 0.5], motion: 'static', material: 'concrete' })
      const block = put('box', 'M', [0.6, 0.25, 0], { size: [0.5, 0.5, 0.5], massMode: 'mass', mass: 2, material: 'steel', friction: 0, trace: true })
      return { bodies: [floor('ice'), post, block], world: VACUUM, links: [join('spring', post, block, undefined, { length: 3, stiffness: 50, damping: 0 })] }
    }
  }
]

export const presetById = (id: string): Preset | undefined => PRESETS.find((p) => p.id === id)

/** The preset behind the "Start here" button. */
export const startPreset = (): Preset => presetById(START_PRESET_ID) ?? PRESETS[0]

/** The world a preset wants, on top of the defaults, so one experiment cannot leave the next in slow motion. */
export const worldFor = (p: Preset): WorldSettings => ({ ...DEFAULT_WORLD, ...(p.build().world ?? {}) })

export const PRESET_TOPICS: Preset['topic'][] = ['Motion', 'Forces', 'Energy', 'Momentum', 'Oscillation']

/** The list as the panel shows it: one group per topic, in topic order, every preset once. */
export const groupedPresets = (): { topic: Preset['topic']; presets: Preset[] }[] => PRESET_TOPICS.map((topic) => ({ topic, presets: PRESETS.filter((p) => p.topic === topic) }))

/**
 * What a preset joins things with — "rope", "pulley", "spring" — so a student looking for a
 * rope can see which experiments have one without opening each.
 */
export const presetBadges = (p: Preset): LinkKind[] => Array.from(new Set((p.build().links ?? []).map((l) => l.kind)))
