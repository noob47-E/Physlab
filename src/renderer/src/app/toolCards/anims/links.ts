// The cards for the ways two Sandbox objects can be joined, one per entry in sim/links.ts LINK_KINDS.
//
// The title is the plain name before the dash in sim/types.ts LINK_LABELS. Every card here is a real
// animation; Rope is the pattern for a two-click card and AUTHORING.md explains it. KindCard in
// panels/Sandbox.tsx (the Connect flow) asks for them by `link:<kind>`.

import type { ToolCardDef, ToolCardKey } from '../types'
import { Hinge } from './Hinge'
import { PulleyLink } from './PulleyLink'
import { Rod } from './Rod'
import { Rope } from './Rope'
import { Spring } from './Spring'
import { StringLink } from './String'
import { Weld } from './Weld'

export const LINK_GROUP: Record<Extract<ToolCardKey, `link:${string}`>, ToolCardDef> = {
  'link:string': { title: 'String', sentence: 'Click one object, then another, to link them with a length that pulls taut but goes slack when they come closer.', Animation: StringLink },
  'link:rod': { title: 'Rod', sentence: 'Click one object, then another, to join them with a rigid rod that holds a fixed distance and pushes as well as pulls.', Animation: Rod },
  'link:spring': { title: 'Spring', sentence: 'Click one object, then another, to join them with a spring that stretches and squashes between them.', Animation: Spring },
  'link:rope': { title: 'Rope', sentence: 'Click one object, then another, to hang a rope between them that bends, swings and goes slack.', Animation: Rope },
  'link:pulley': { title: 'Rope over a pulley', sentence: 'Click one object, then another, to run a rope between them over the wheel; put the wheel above both.', Animation: PulleyLink },
  'link:hinge': { title: 'Hinge', sentence: 'Click one object, then another, to hinge them so the first swings about the centre of the second.', Animation: Hinge },
  'link:weld': { title: 'Weld', sentence: 'Click one object, then another, to weld them together so they move from then on as one piece.', Animation: Weld }
}
