// The cards for the Sandbox ADD buttons, one per shape in panels/Sandbox.tsx ADD.
//
// The title is the button's label ("Ball" for a sphere, "Crate" for a box). These buttons have no
// shortcut. AddButton in panels/Sandbox.tsx asks for them by `add:<shape>`.

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
  // It stands: makeBody gives it no tilt and its centre of mass sits low over a wide base.
  'add:cone': { title: 'Cone', sentence: 'Click to add a cone; it stands on its base, and knocked onto its side it rolls round in a circle.', Animation: Cone },
  'add:ramp': { title: 'Ramp', sentence: 'Click to add a fixed slope for other objects to slide or roll down.', Animation: Ramp },
  'add:plank': { title: 'Plank', sentence: 'Click to add a long flat board, free to fall and tip or fixed in place.', Animation: Plank },
  'add:wall': { title: 'Wall', sentence: 'Click to add a fixed upright wall for things to bounce off.', Animation: Wall },
  'add:pulley': { title: 'Pulley', sentence: 'Click to add a wheel for a rope to run over; place it above both ends of the rope.', Animation: Pulley }
}
