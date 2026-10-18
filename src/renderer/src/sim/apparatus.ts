// Pure apparatus builders (SB59): metre rule, triangular knife-edge pivot, slotted-mass
// hangers, retort stand, pulley bracket. BodyDef groups with clean physics and no ghost contacts.

import type { BodyDef, Link } from './types'
import type { V3 } from '../math/vec'
import { localToCom } from './links'
import { makeBody } from './store'
import { fmt } from '../math/format'
import { materialById } from './materials'

/** Discs on a slotted mass hanger: 0.5 kg per disc. */
export const discCountOf = (mass: number): number => Math.max(1, Math.round(mass / 0.5))

/** Whether a body is a metre rule or lever beam. */
export function isMetreRule(def: BodyDef): boolean {
  const name = def.name.toLowerCase()
  return name === 'beam' || name === 'metre rule' || def.id === 'rule' || def.id.endsWith('_rule') || def.id.includes('lever_beam')
}

/** Whether a body is a slotted mass hanger. */
export function isHangerBody(def: BodyDef): boolean {
  const name = def.name.toLowerCase()
  return name.includes('hanger') || def.id.includes('hanger') || name === 'm₁' || name === 'm₂'
}

/** A 1 m metre-rule beam (horizontal) or measuring rule (vertical). Light wood, 3 cm × 0.6 cm. */
export function buildMetreRule(
  id: string,
  name: string,
  pos: V3,
  opts: { orientation?: 'horizontal' | 'vertical'; mass?: number; motion?: 'dynamic' | 'static' } = {}
): BodyDef {
  const isVert = opts.orientation === 'vertical'
  const size: V3 = isVert ? [0.03, 1.0, 0.006] : [1.0, 0.03, 0.006]
  return {
    ...makeBody(isVert ? 'box' : 'plank', name, pos),
    id,
    size,
    mass: opts.mass ?? 0.15,
    massMode: 'mass',
    material: 'wood', color: materialById('wood').color,
    motion: opts.motion ?? (isVert ? 'static' : 'dynamic')
  }
}

/**
 * A triangular knife-edge pivot on a heavy base. The wedge tip stays 2 cm under the beam so the
 * engine holds the beam through the hinge alone with no contact friction, exactly as the cone did.
 */
export function buildKnifeEdge(
  prefix: string,
  pos: V3,
  height: number = 0.5
): {
  base: BodyDef
  wedge: BodyDef
  pivot: V3
  hingeLink: (beam: BodyDef) => Link
} {
  const base: BodyDef = {
    ...makeBody('box', 'Stand base', [pos[0], 0.02, pos[2]]),
    id: `${prefix}_base`,
    size: [0.18, 0.04, 0.12],
    motion: 'static',
    material: 'lead',
    color: materialById('lead').color
  }

  // A wedge (ramp) reaching up toward the pivot point. Height leaves 2.5 cm under the pivot.
  const wedgeHeight = Math.max(0.1, height - 0.04 - 0.025)
  const wedge: BodyDef = {
    ...makeBody('ramp', 'Knife edge', [pos[0], 0.04 + wedgeHeight / 2, pos[2]]),
    id: `${prefix}_wedge`,
    size: [0.12, wedgeHeight, 0.08],
    motion: 'static',
    material: 'steel',
    color: materialById('steel').color
  }

  const pivot: V3 = [pos[0], height, pos[2]]

  return {
    base,
    wedge,
    pivot,
    hingeLink: (beam: BodyDef): Link => ({
      id: `${prefix}_hinge`,
      kind: 'hinge',
      a: beam.id,
      b: wedge.id,
      length: 0.1,
      stiffness: 0,
      damping: 0.05,
      pivotA: [0, 0, 0],
      pivotB: localToCom(wedge, pivot)
    })
  }
}

/**
 * A slotted-mass hanger: stem and stacked slotted discs, 0.5 kg per disc.
 * Sits below `hookPos` on a short string link.
 */
export function buildSlottedHanger(
  id: string,
  name: string,
  hookPos: V3,
  mass: number,
  stringLength: number = 0.15
): {
  hanger: BodyDef
  stringLink: (beam: BodyDef) => Link
} {
  const discs = discCountOf(mass)
  // Height scales with disc count: base plate + discs
  const height = 0.02 + 0.015 * discs
  const hangerPos: V3 = [hookPos[0], hookPos[1] - stringLength, hookPos[2]]

  const hanger: BodyDef = {
    ...makeBody('cylinder', name, hangerPos),
    id,
    size: [0.03, height, 0.03],
    motion: 'dynamic',
    massMode: 'mass',
    mass,
    material: 'steel', color: materialById('steel').color,
    restitution: 0.2,
    friction: 0.4
  }

  return {
    hanger,
    stringLink: (beam: BodyDef): Link => ({
      id: `link_${id}`,
      kind: 'string',
      a: beam.id,
      b: hanger.id,
      length: stringLength,
      stiffness: 0,
      damping: 0.2,
      pivotA: [hookPos[0] - beam.position[0], 0, 0],
      pivotB: [0, 0, 0]
    })
  }
}

/**
 * A retort stand: heavy rectangular base on floor, 1.6 m vertical steel rod, boss-head clamp,
 * and a horizontal arm reaching forward to z = 0. Placed at z < 0 so it never touches moving masses.
 */
export function buildRetortStand(
  pos: V3 = [0, 0, -0.18],
  rodHeight: number = 1.6
): {
  base: BodyDef
  rod: BodyDef
  clamp: BodyDef
  arm: BodyDef
  armEnd: V3
} {
  const base: BodyDef = {
    ...makeBody('box', 'Retort base', [pos[0], 0.02, pos[2]]),
    id: 'retort_base',
    size: [0.35, 0.04, 0.24],
    motion: 'static',
    material: 'steel', color: materialById('steel').color
  }

  const rod: BodyDef = {
    ...makeBody('cylinder', 'Retort rod', [pos[0], rodHeight / 2, pos[2]]),
    id: 'retort_rod',
    size: [0.01, rodHeight, 0.01],
    motion: 'static',
    material: 'steel', color: materialById('steel').color
  }

  const clampY = rodHeight - 0.05
  const clamp: BodyDef = {
    ...makeBody('box', 'Boss head', [pos[0], clampY, pos[2]]),
    id: 'retort_clamp',
    size: [0.045, 0.045, 0.045],
    motion: 'static',
    material: 'steel', color: materialById('steel').color
  }

  const armLen = Math.abs(pos[2])
  const arm: BodyDef = {
    ...makeBody('cylinder', 'Clamp arm', [pos[0], clampY, pos[2] / 2]),
    id: 'retort_arm',
    size: [0.008, armLen, 0.008],
    rotation: [90, 0, 0],
    motion: 'static',
    material: 'steel', color: materialById('steel').color
  }

  const armEnd: V3 = [pos[0], clampY, 0]

  return { base, rod, clamp, arm, armEnd }
}

/** A spoked pulley: wheel, axle, and fork bracket hanging from a clamp. */
export function buildSpokedPulley(id: string, name: string, pos: V3): BodyDef {
  return {
    ...makeBody('pulley', name, pos),
    id,
    size: [0.1, 0.04, 0.1],
    motion: 'static',
    material: 'steel', color: materialById('steel').color
  }
}

/** A fork bracket hanging from the retort arm to hold the pulley axle. */
export function buildPulleyBracket(armEnd: V3, pulleyPos: V3): BodyDef {
  const bracketHeight = Math.max(0.04, armEnd[1] - pulleyPos[1])
  return {
    ...makeBody('box', 'Pulley bracket', [pulleyPos[0], pulleyPos[1] + bracketHeight / 2, pulleyPos[2]]),
    id: 'pulley_bracket',
    size: [0.035, bracketHeight, 0.035],
    motion: 'static',
    material: 'steel', color: materialById('steel').color
  }
}

/**
 * Helper to slide a hanger along the beam: snaps to 1 cm marks, clamps within the beam length,
 * and updates both the hook pivot and the hanger position.
 */
export function slideHanger(
  beam: BodyDef,
  hanger: BodyDef,
  link: Link,
  targetX: number
): { hanger: BodyDef; link: Link } {
  const relX = targetX - beam.position[0]
  const halfBeam = beam.size[0] / 2 - 0.02 // 2 cm margin from ends
  const snapped = Math.round(relX * 100) / 100
  const clamped = Math.max(-halfBeam, Math.min(halfBeam, snapped))
  const updatedLink: Link = {
    ...link,
    pivotA: [clamped, 0, 0]
  }
  const updatedHanger: BodyDef = {
    ...hanger,
    position: [beam.position[0] + clamped, beam.position[1] - link.length, hanger.position[2]]
  }
  return { hanger: updatedHanger, link: updatedLink }
}

/**
 * Calculates moments about the beam's pivot for hanging masses.
 * Formats left F·d, right F·d, and returns balance status.
 */
export function leverMoments(
  beam: BodyDef,
  hangers: { mass: number; x: number }[],
  pivotX: number = beam.position[0],
  g: number = 9.81
): {
  leftFd: number
  rightFd: number
  status: 'balanced' | 'turns anticlockwise' | 'turns clockwise'
  text: string
} {
  let leftFd = 0
  let rightFd = 0

  for (const h of hangers) {
    const d = h.x - pivotX
    const F = h.mass * g
    if (d < -1e-4) {
      leftFd += F * Math.abs(d)
    } else if (d > 1e-4) {
      rightFd += F * d
    }
  }

  const diff = Math.abs(leftFd - rightFd)
  let status: 'balanced' | 'turns anticlockwise' | 'turns clockwise' = 'balanced'
  if (diff >= 0.02) {
    status = leftFd > rightFd ? 'turns anticlockwise' : 'turns clockwise'
  }

  const leftStr = `${fmt(leftFd)} N m`
  const rightStr = `${fmt(rightFd)} N m`
  const text = `Turning effect: ${status} (left moment ${leftStr}, right moment ${rightStr})`

  return { leftFd, rightFd, status, text }
}
