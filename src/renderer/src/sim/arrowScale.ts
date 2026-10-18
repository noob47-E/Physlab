// How long the Sandbox's arrows are drawn (render/sandbox/Arrows.tsx), kept here so it can be tested without a renderer.

/** The longest a velocity arrow is drawn, in metres. */
export const VELOCITY_ARROW_MAX = 2.5

/**
 * Metres of arrow per m/s: half a metre for every metre per second (a ball at 4 m/s has a 2 m arrow, longer than the ramp it
 * has just left), up to VELOCITY_ARROW_MAX. Uncapped, a ball dropped from a height or a fast collision grew an arrow of 7 m and
 * more that shot up through the formula cards, the graph dock and the top bar (S3, report 8.3); a force arrow was already
 * capped at 3 m. Past 5 m/s the arrow keeps its direction and stops growing.
 */
export const velocityArrowScale = (speed: number): number => (speed > 0 ? Math.min(0.5, VELOCITY_ARROW_MAX / speed) : 0.5)

/** Metres of arrow per newton for a push: a metre for every 20 N, never longer than 3 m so a large force stays on screen. */
export const pushArrowScale = (size: number): number => (size > 0 ? Math.min(1 / 20, 3 / size) : 1 / 20)
