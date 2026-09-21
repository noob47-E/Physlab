// The cards for the Sandbox ADD buttons, one per shape in panels/Sandbox.tsx ADD.
//
// The title is the button's label ("Ball" for a sphere, "Crate" for a box). These buttons have no
// shortcut. Replace `Placeholder` with a real animation one card at a time; AUTHORING.md has the
// pattern. The Sandbox panel itself is wired to these after P4 lands (it owns that file).

import type { ToolCardDef, ToolCardKey } from '../types'
import { Placeholder } from './Placeholder'

export const ADD_GROUP: Record<Extract<ToolCardKey, `add:${string}`>, ToolCardDef> = {
  'add:sphere': { title: 'Ball', sentence: 'Adds a ball that rolls and bounces. Set its size and mass in the panel.', Animation: Placeholder },
  'add:box': { title: 'Crate', sentence: 'Adds a crate that slides and tips over but does not roll.', Animation: Placeholder },
  'add:cylinder': { title: 'Cylinder', sentence: 'Adds a cylinder that rolls on its side and stands on its end.', Animation: Placeholder },
  'add:capsule': { title: 'Capsule', sentence: 'Adds a capsule, a rounded rod that rolls sideways.', Animation: Placeholder },
  'add:cone': { title: 'Cone', sentence: 'Adds a cone, which tips over and rolls round in a circle.', Animation: Placeholder },
  'add:ramp': { title: 'Ramp', sentence: 'Adds a fixed slope for things to slide or roll down.', Animation: Placeholder },
  'add:plank': { title: 'Plank', sentence: 'Adds a long flat board. Fix it in place, or let it fall and tip.', Animation: Placeholder },
  'add:wall': { title: 'Wall', sentence: 'Adds a fixed upright wall for things to bounce off.', Animation: Placeholder },
  'add:pulley': { title: 'Pulley', sentence: 'Adds a wheel a rope can run over. It must sit above both ends of the rope.', Animation: Placeholder }
}
