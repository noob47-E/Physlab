// The cards for the ways two Sandbox objects can be joined, one per entry in sim/links.ts LINK_KINDS.
//
// The title is the plain name before the dash in sim/types.ts LINK_LABELS. Replace `Placeholder`
// with a real animation one card at a time; Rope is the pattern for a two-click card and
// AUTHORING.md explains it. The Connect flow's kind cards are wired to these after P4 lands.

import type { ToolCardDef, ToolCardKey } from '../types'
import { Placeholder } from './Placeholder'
import { Rope } from './Rope'

export const LINK_GROUP: Record<Extract<ToolCardKey, `link:${string}`>, ToolCardDef> = {
  'link:string': { title: 'String', sentence: 'Keeps two objects no further apart than its length; it goes slack when they come closer.', Animation: Placeholder },
  'link:rod': { title: 'Rod', sentence: 'Holds two objects a fixed distance apart; it pushes as well as pulls.', Animation: Placeholder },
  'link:spring': { title: 'Spring', sentence: 'Joins two objects with a spring that stretches and squashes; set how stiff it is.', Animation: Placeholder },
  'link:rope': { title: 'Rope', sentence: 'Hangs a rope between two objects; it bends, swings and goes slack.', Animation: Rope },
  'link:pulley': { title: 'Rope over a pulley', sentence: 'Runs a rope from one object over a wheel to another; the wheel must sit above both.', Animation: Placeholder },
  'link:hinge': { title: 'Hinge', sentence: 'Lets one object swing about the centre of the other, like a door on its frame.', Animation: Placeholder },
  'link:weld': { title: 'Weld', sentence: 'Fixes two objects together so they move as one.', Animation: Placeholder }
}
