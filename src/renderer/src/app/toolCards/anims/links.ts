// The cards for the ways two Sandbox objects can be joined, one per entry in sim/links.ts LINK_KINDS.
//
// The title is the plain name before the dash in sim/types.ts LINK_LABELS. Every card here is a real
// animation; Rope is the pattern for a two-click card and AUTHORING.md explains it. KindCard in
// panels/Sandbox.tsx (the Connect flow) asks for them by `link:<kind>`, and nothing else does: the
// cards only ever open on the flow's last step, after both objects are chosen, so each sentence
// says what the choice does to the pair. They used to open with "Click one object, then another"
// over a prompt that had already had both clicks.

import type { ToolCardDef, ToolCardKey } from '../types'
import { Hinge } from './Hinge'
import { PulleyLink } from './PulleyLink'
import { Rod } from './Rod'
import { Rope } from './Rope'
import { Spring } from './Spring'
import { StringLink } from './String'
import { Weld } from './Weld'

export const LINK_GROUP: Record<Extract<ToolCardKey, `link:${string}`>, ToolCardDef> = {
  'link:string': { title: 'String', sentence: 'Ties the two you chose with a string that pulls taut but goes slack when they come closer.', Animation: StringLink },
  'link:rod': { title: 'Rod', sentence: 'Joins the two you chose with a rigid rod that holds a fixed distance and pushes as well as pulls.', Animation: Rod },
  'link:spring': { title: 'Spring', sentence: 'Joins the two you chose with a spring that stretches and squashes between them.', Animation: Spring },
  'link:rope': { title: 'Rope', sentence: 'Hangs a rope between the two you chose: it bends, swings and goes slack.', Animation: Rope },
  'link:pulley': { title: 'Rope over a pulley', sentence: 'Runs a rope from each of the two you chose up and over a wheel that sits above both; pick the wheel below.', Animation: PulleyLink },
  'link:hinge': { title: 'Hinge', sentence: 'Hinges the two you chose so the first swings about the centre of the second.', Animation: Hinge },
  'link:weld': { title: 'Weld', sentence: 'Welds the two you chose together, so from then on they move as one piece.', Animation: Weld }
}
