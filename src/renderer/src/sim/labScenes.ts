// SB51, the Collision Lab: three experiments a student changes with sliders - two carts on an air track, two pucks on an air
// table, Newton's cradle - built from their parameters by `buildScene`. Every body is frictionless and undamped, its mass
// typed, its bounciness the slider's e on BOTH bodies (Jolt takes the larger of two), at 600 steps a second, never asleep, in
// a vacuum, in the plane. The formulas they are checked against are sim/collisionMath.ts's.

import type { BodyDef, Link, WorldSettings } from './types'
import { makeLink } from './links'
import { ball, floor, put, type Preset } from './presets'
import { obliqueSetup } from './collisionMath'

export type LabId = 'lab1d' | 'lab2d' | 'labcradle'
export const LAB_IDS: readonly LabId[] = ['lab1d', 'lab2d', 'labcradle']
export const isLab = (id: string | null | undefined): id is LabId => !!id && (LAB_IDS as readonly string[]).includes(id)

export interface LabParams {
  /** Bounciness, 0 (they stick) to 1 (perfectly elastic). */
  e: number
  mA: number
  mB: number
  uA: number
  uB: number
  /** lab2d: the angle between A's path and the line of centres at contact, degrees. */
  phi: number
  /** labcradle: how many balls are lifted, 1 to 3, and whether they hang from strings. */
  n: number
  strings: boolean
}

export const LAB_DEFAULTS: Record<LabId, LabParams> = {
  lab1d: { e: 1, mA: 1, mB: 2, uA: 3, uB: 0, phi: 30, n: 1, strings: true },
  lab2d: { e: 1, mA: 1, mB: 1, uA: 3, uB: 0, phi: 30, n: 1, strings: true },
  labcradle: { e: 1, mA: 1, mB: 1, uA: 2, uB: 0, phi: 30, n: 1, strings: true }
}

/** Everything a lab body shares: no friction, no damping, its mass typed, traced, its arrows on. */
const labBody = (over: Partial<BodyDef>): Partial<BodyDef> => ({
  friction: 0,
  linearDamping: 0,
  angularDamping: 0,
  massMode: 'mass',
  trace: true,
  showArrows: true,
  ...over
})

const LAB_WORLD: Partial<WorldSettings> = {
  stepRate: 600,
  allowSleeping: false,
  airDensity: 0,
  twoD: true
}

let labLinks = 0

interface LabBuild {
  bodies: BodyDef[]
  world: Partial<WorldSettings>
  links: Link[]
}

/**
 * How high the pucks and the cradle's balls are above the floor every experiment stands on: the free ones float there with
 * gravity 0, the hung ones hang there.
 */
const TABLE = 1.5

/** The scene for a lab's parameters. Deterministic: the same parameters give the same build (names, places, numbers). */
export function buildScene(id: LabId, p: LabParams): LabBuild {
  switch (id) {
    case 'lab1d': {
      // The ice is only a rail for the eye, the experiments' own ice floor: gravity 0, and the carts float 5 cm above it.
      const rail = floor('ice')
      const cart = (name: string, x: number, m: number, u: number) =>
        put(
          'box',
          name,
          [x, 0.2, 0],
          labBody({
            size: [0.6, 0.3, 0.3],
            lock: 'x',
            mass: m,
            velocity: [u, 0, 0],
            restitution: p.e,
            material: 'aluminium'
          })
        )
      return {
        bodies: [rail, cart('A', -2, p.mA, p.uA), cart('B', 0.5, p.mB, p.uB)],
        world: { ...LAB_WORLD, gravity: 0 },
        links: []
      }
    }
    case 'lab2d': {
      const s = obliqueSetup(0.15, 0.15, p.phi, 2.5)
      const puck = (name: string, at: [number, number], m: number, v: number) =>
        ball(
          name,
          [at[0], at[1] + TABLE, 0],
          labBody({
            size: [0.15, 0.15, 0.15],
            mass: m,
            velocity: [v, 0, 0],
            restitution: p.e,
            material: 'steel'
          })
        )
      return {
        bodies: [floor(), puck('A', s.aStart, p.mA, p.uA), puck('B', s.bStart, p.mB, 0)],
        world: { ...LAB_WORLD, gravity: 0 },
        links: []
      }
    }
    case 'labcradle': {
      const bodies: BodyDef[] = [floor()]
      const links: Link[] = []
      const n = Math.max(1, Math.min(3, Math.round(p.n)))
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 0.306
        // The lifted balls come in from the left at the speed asked for; with strings, from where the cradle hangs.
        const b = ball(
          `B${i + 1}`,
          [x, TABLE, 0],
          labBody({
            size: [0.15, 0.15, 0.15],
            mass: 1,
            material: 'steel',
            restitution: p.e,
            trace: i === 0 || i === 4,
            velocity: i < n ? [p.uA, 0, 0] : [0, 0, 0]
          })
        )
        bodies.push(b)
        if (p.strings) {
          const pivot = put('box', `P${i + 1}`, [x, 3.5, 0], {
            size: [0.06, 0.06, 0.06],
            motion: 'static',
            material: 'steel'
          })
          bodies.push(pivot)
          const l = makeLink(`lab${++labLinks}`, 'string', pivot, b)
          if (l) links.push({ ...l, damping: 0.4 })
        }
      }
      return {
        bodies,
        world: {
          ...LAB_WORLD,
          gravity: p.strings ? 9.81 : 0,
          collisionSteps: 8
        },
        links
      }
    }
  }
}

/**
 * The three as experiments in the list (sim/presets.ts spreads them in), each built from its defaults. A function, not a
 * constant: presets.ts and this file import each other, and a function declaration is ready before either has run.
 */
export function labPresets(): Preset[] {
  return [
    {
      id: 'lab1d',
      label: 'Collision Lab: two carts',
      topic: 'Momentum',
      tags: ['collision', 'momentum', 'bounce', 'elastic', 'carts'],
      about:
        'A 1 kg cart at 3 m/s runs into a 2 kg cart at rest on an air track. Move the bounciness e from 1 to 0: momentum stays 3 kg m/s every time, and the energy lost grows from 0 to 3 J.',
      build: () => buildScene('lab1d', LAB_DEFAULTS.lab1d)
    },
    {
      id: 'lab2d',
      label: 'Collision Lab: pucks on an air table',
      topic: 'Momentum',
      tags: ['collision', 'momentum', 'glancing', 'angle', 'pucks'],
      about:
        'A 1 kg puck at 3 m/s strikes a 1 kg puck at rest at 30°. With e = 1 they leave at right angles, at 1.5 m/s and 2.6 m/s, and the momentum keeps its size and direction.',
      build: () => buildScene('lab2d', LAB_DEFAULTS.lab2d)
    },
    {
      id: 'labcradle',
      label: "Collision Lab: Newton's cradle",
      topic: 'Momentum',
      tags: ['collision', 'momentum', 'cradle', 'swing', 'string'],
      about:
        'Five 1 kg balls hang in a row; one swings in at 2 m/s and one leaves the far end at 2 m/s. Lift two and two leave: momentum and energy pass straight through.',
      build: () => buildScene('labcradle', LAB_DEFAULTS.labcradle)
    }
  ]
}
