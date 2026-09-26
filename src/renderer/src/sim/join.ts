// Joining two objects, step by step. The Connections fold has always been able to tie anything
// to anything, but a student had to know to select one object, Shift+click a second and then
// find the fold; "there are no ropes" was the report. This is the guided way: press Connect,
// click one, click the other, pick a kind from a card that says what it does. The decisions
// live here, away from React, so the rules can be tested.

import type { BodyDef, BodyId, Link, LinkKind } from './types'

export type JoinStep = 'first' | 'second' | 'kind'

export interface JoinMode {
  step: JoinStep
  a?: BodyId
  b?: BodyId
}

export const START_JOIN: JoinMode = { step: 'first' }

/** One card per kind: what the student gets, in one line. */
export const LINK_CARDS: { kind: LinkKind; title: string; line: string }[] = [
  { kind: 'string', title: 'String', line: 'Pulls when it is taut and never pushes — closer than its length, it hangs slack.' },
  { kind: 'rod', title: 'Rod', line: 'Keeps them exactly this far apart: it pushes as well as pulls.' },
  { kind: 'spring', title: 'Spring', line: 'Stretches and squashes with F = kx; set k in N/m.' },
  { kind: 'rope', title: 'Rope', line: 'A real rope: it hangs, bends and goes slack.' },
  { kind: 'pulley', title: 'Rope over a pulley', line: 'The rope runs over a wheel, which must sit above both.' },
  { kind: 'hinge', title: 'Hinge', line: "Turns about the second object's centre, like a door on its post." },
  { kind: 'weld', title: 'Weld', line: 'Glued together: they move as one.' }
]

export const linkCard = (kind: LinkKind) => LINK_CARDS.find((c) => c.kind === kind) ?? LINK_CARDS[0]

const nameOf = (bodies: BodyDef[], id: BodyId): string => bodies.find((b) => b.id === id)?.name ?? '?'

/**
 * What a click on a body does in join mode: the next step, or the same step with a sentence
 * saying why the click did nothing. The floor is never a partner — nothing can be tied to it,
 * and it is the easiest thing in the world to click by mistake.
 */
export function joinPick(mode: JoinMode, id: BodyId, bodies: BodyDef[]): { mode: JoinMode; why?: string } {
  const body = bodies.find((b) => b.id === id)
  if (!body) return { mode }
  if (body.shape === 'ground') return { mode, why: 'The floor cannot be tied to anything — click an object instead.' }
  if (mode.step === 'first') return { mode: { step: 'second', a: id } }
  if (id === mode.a) return { mode, why: `That is ${body.name} again — click a different object.` }
  // In the last step a click swaps the second object, so a wrong click costs nothing.
  return { mode: { step: 'kind', a: mode.a, b: id } }
}

/** The line above the cards, saying what to do next. */
export function joinPrompt(mode: JoinMode, bodies: BodyDef[]): string {
  switch (mode.step) {
    case 'first':
      return 'Click the first object.'
    case 'second':
      return `Now click the object to join ${nameOf(bodies, mode.a!)} to.`
    default:
      return `Join ${nameOf(bodies, mode.a!)} and ${nameOf(bodies, mode.b!)} with…`
  }
}

/** Wheels a rope between a and b could run over: pulleys sitting above both of them. */
export function wheelsAbove(bodies: BodyDef[], a: BodyId, b: BodyId): BodyDef[] {
  const one = bodies.find((x) => x.id === a)
  const two = bodies.find((x) => x.id === b)
  if (!one || !two) return []
  const top = Math.max(one.position[1], two.position[1])
  return bodies.filter((w) => w.shape === 'pulley' && w.position[1] > top)
}

/** What the pulley card says when no wheel could carry the rope. */
export const noWheelNote = (bodies: BodyDef[], a: BodyId, b: BodyId): string =>
  bodies.some((w) => w.shape === 'pulley')
    ? `No pulley sits above both ${nameOf(bodies, a)} and ${nameOf(bodies, b)} — drag one up there.`
    : `No pulley yet — add one and put it above both ${nameOf(bodies, a)} and ${nameOf(bodies, b)}.`

/**
 * Why a and b cannot be joined this way, in a sentence — or null when they can. The store
 * used to refuse silently, so a Join that did nothing looked like a bug rather than a rule.
 */
export function linkRefusal(bodies: BodyDef[], links: Link[], a: BodyId, b: BodyId, kind: LinkKind, over?: BodyId): string | null {
  if (a === b) return 'Choose two different objects.'
  const one = bodies.find((x) => x.id === a)
  const two = bodies.find((x) => x.id === b)
  if (!one || !two) return 'One of those objects is no longer here.'
  const floor = [one, two].find((x) => x.shape === 'ground')
  if (floor) return `${floor.name} is the floor — nothing can be tied to it.`
  // Joining the same pair twice would double the force between them without anything to show it.
  if (links.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a))) return `${one.name} and ${two.name} are already joined — remove that connection first.`
  if (kind === 'pulley') {
    const wheel = bodies.find((x) => x.id === over)
    if (!wheel || wheel.shape !== 'pulley') return 'A rope over a pulley needs a Pulley object — add one and put it above both.'
    if (!wheelsAbove(bodies, a, b).some((w) => w.id === wheel.id)) return `${wheel.name} must sit above both ${one.name} and ${two.name} — drag it up.`
  }
  return null
}
