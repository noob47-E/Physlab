// Whether the space bar is down right now. With the Move tool a left-drag on empty space draws a
// selection box, so panning moved to Space + drag (right-drag and the middle button still pan);
// the viewport asks here before it starts a box. Space is also play/pause, which therefore fires
// on the key-up and only when the key was not used to pan: on the key-down, a student holding
// Space to drag the view used to start the timeline every time. Kept apart from the shortcuts so
// the rule can be tested without a window.

let spaceHeld = false
let spaceUsed = false

export const isSpaceHeld = (): boolean => spaceHeld

/** The key went down (or is repeating). */
export const pressSpace = (): void => {
  spaceHeld = true
}

/** The viewport says so when a drag started while Space was down, so releasing it is not a play/pause. */
export const markSpaceUsed = (): void => {
  spaceUsed = spaceHeld
}

/** The key came up. Returns true when that should toggle play: a tap, not a pan. */
export function releaseSpace(): boolean {
  const toggles = spaceHeld && !spaceUsed
  spaceHeld = false
  spaceUsed = false
  return toggles
}

/** The window lost focus: the key-up will never arrive. */
export const resetSpace = (): void => {
  spaceHeld = false
  spaceUsed = false
}
