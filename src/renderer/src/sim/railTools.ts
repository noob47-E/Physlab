export type RailToolId = 'select' | 'ball' | 'crate' | 'ramp' | 'plank' | 'connect' | 'forces' | 'more' | 'cylinder' | 'capsule' | 'cone' | 'wall' | 'pulley' | 'floor';

export interface RailTool {
  id: RailToolId;
  label: string;
  help: string;
  key?: string;
}

export const RAIL: RailTool[] = [
  { id: 'select', label: 'Select', help: 'Choose an object to change its properties or drag a box to grab several at once.' },
  { id: 'ball', label: 'Ball', help: 'Add a ball, drag it to place it, then press Play to see it fall, roll and bounce.' },
  { id: 'crate', label: 'Crate', help: 'Drop a heavy crate that can slide on ramps or stack into tall towers.' },
  { id: 'ramp', label: 'Ramp', help: 'Place a sloping ramp to accelerate rolling or sliding objects down its surface.' },
  { id: 'plank', label: 'Plank', help: 'Add a long plank to build bridges and see-saws.' },
  { id: 'connect', label: 'Connect', help: 'Join two objects with a string, rod, spring, rope, pulley, hinge or weld by clicking one, then the other.' },
  { id: 'forces', label: 'Forces', help: 'Show the forces on the chosen object, drawn from what the engine did, with their sizes.' },
  { id: 'more', label: 'More', help: 'Open the extra tools menu to find more shapes and components.' }
];

export const MORE: RailTool[] = [
  { id: 'cylinder', label: 'Cylinder', help: 'Place a cylinder that rolls smoothly along its side.' },
  { id: 'capsule', label: 'Capsule', help: 'Add a pill-shaped capsule to the scene.' },
  { id: 'cone', label: 'Cone', help: 'Drop a cone that rolls in circles.' },
  { id: 'wall', label: 'Wall', help: 'Build a static wall to block moving objects.' },
  { id: 'pulley', label: 'Pulley', help: 'Mount a pulley wheel to change the direction of forces along a rope.' },
  { id: 'floor', label: 'Floor', help: 'Create a flat ground surface to catch falling objects.' }
];

export interface SceneState {
  bodies: number;
  moving: number;
  playing: boolean;
  replaying: boolean;
  hasRun: boolean;
  atBounceMark: boolean;
  selected: boolean;
  hasCards: boolean;
}

export interface Hint {
  id: string;
  text: string;
  when: (s: SceneState) => boolean;
  priority: number;
}

export const HINTS: Hint[] = [
  {
    id: 'no-moving',
    text: 'Add a ball from the rail, or open an experiment.',
    when: (s) => s.moving === 0 && !s.hasRun,
    priority: 80
  },
  {
    id: 'never-played',
    text: 'Press Play to start the experiment.',
    when: (s) => s.moving > 0 && !s.hasRun && !s.playing,
    priority: 70
  },
  {
    id: 'paused-after-run',
    text: 'Drag the tape under the scene to go back in time.',
    when: (s) => s.hasRun && !s.playing && !s.replaying && !s.selected,
    priority: 60
  },
  {
    id: 'replaying',
    text: 'Press Branch from here to change something at this moment.',
    when: (s) => s.replaying && !s.playing,
    priority: 50
  },
  {
    id: 'bounce-mark',
    text: 'Read the bounce on the card: speed in, speed out and e.',
    when: (s) => s.atBounceMark,
    priority: 90
  },
  {
    id: 'body-selected',
    text: 'Change its mass or bounciness, then press Play.',
    when: (s) => s.selected && !s.playing,
    priority: 65
  },
  {
    id: 'has-cards',
    text: 'Tap a letter on the card to light it up in the scene.',
    when: (s) => s.hasCards,
    priority: 40
  },
  {
    id: 'playing',
    text: 'Watch the experiment run and see how the objects interact.',
    when: (s) => s.playing,
    priority: 10
  }
];

export function pickHint(s: SceneState, dismissed: string[]): Hint | null {
  let best: Hint | null = null;
  for (const hint of HINTS) {
    if (dismissed.includes(hint.id)) continue;
    if (hint.when(s)) {
      if (!best || hint.priority > best.priority) {
        best = hint;
      }
    }
  }
  return best;
}
