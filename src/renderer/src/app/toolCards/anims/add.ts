// The cards for the Sandbox ADD buttons, one per shape in panels/Sandbox.tsx ADD.
//
// The title is the button's label ("Ball" for a sphere, "Crate" for a box). These buttons have no
// shortcut. The Sandbox panel itself is wired to these after P4 lands (it owns that file).

import type { ToolCardDef, ToolCardKey } from '../types'
import { Ball } from './Ball'
import { Crate } from './Crate'
import { Cylinder } from './Cylinder'
import { Capsule } from './Capsule'
import { Cone } from './Cone'
import { Ramp } from './Ramp'
import { Plank } from './Plank'
import { Wall } from './Wall'
import { Pulley } from './Pulley'

export const ADD_GROUP: Record<Extract<ToolCardKey, `add:${string}`>, ToolCardDef> = {
  'add:sphere': { title: 'Ball', sentence: 'Click to add a ball that rolls and bounces; set its size and mass in the panel.', Animation: Ball },
  'add:box': { title: 'Crate', sentence: 'Click to add a crate that slides and tips over but never rolls.', Animation: Crate },
  'add:cylinder': { title: 'Cylinder', sentence: 'Click to add a cylinder that rolls on its side and stands upright on its end.', Animation: Cylinder },
  'add:capsule': { title: 'Capsule', sentence: 'Click to add a capsule, a rounded rod that rolls sideways like a pencil.', Animation: Capsule },
  'add:cone': { title: 'Cone', sentence: 'Click to add a cone, which tips onto its side and rolls round in a circle.', Animation: Cone },
  'add:ramp': { title: 'Ramp', sentence: 'Click to add a fixed slope for other objects to slide or roll down.', Animation: Ramp },
  'add:plank': { title: 'Plank', sentence: 'Click to add a long flat board, free to fall and tip or fixed in place.', Animation: Plank },
  'add:wall': { title: 'Wall', sentence: 'Click to add a fixed upright wall for things to bounce off.', Animation: Wall },
  'add:pulley': { title: 'Pulley', sentence: 'Click to add a wheel for a rope to run over; place it above both ends of the rope.', Animation: Pulley }
}
