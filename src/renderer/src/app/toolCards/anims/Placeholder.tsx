// A pulsing dot for a card whose real animation has not been drawn yet.
//
// Every entry in the registry must have an Animation so the card can always open; this one keeps
// the pattern honest until an author replaces it. It reuses the click ripple, so it needs no
// keyframe of its own. Replace it, never redesign it: a card should never ship with it for long.

import { Scene } from './parts'

export function Placeholder() {
  return (
    <Scene grid={false}>
      <circle cx="80" cy="50" r="4" fill="var(--text-dim)" />
      <circle className="tc-ripple" cx="80" cy="50" r="9" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" />
      <circle className="tc-ripple tc-late" cx="80" cy="50" r="9" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" />
    </Scene>
  )
}
