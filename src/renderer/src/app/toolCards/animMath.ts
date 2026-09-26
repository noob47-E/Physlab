// The numbers behind a tool-card animation, kept apart from the SVG so they can be tested.
//
// Every animation shares four keyframes in styles.css (tc-cursor, tc-ripple, tc-appear, tc-vanish)
// and one 2.5 s loop. What differs per card is only *where* the cursor goes, and that travels as CSS
// custom properties on the cursor element: --tc-a is where it rests, --tc-b the first click,
// --tc-c the second click (when there is one). The keyframes read them with var(), so one rule
// serves every card and an author never touches the timing.

import type { CSSProperties } from 'react'

/** A position in the 160×100 view box of a card animation. */
export type Pt = [number, number]

/** How long one loop of every card animation takes; styles.css uses the same figure. */
export const LOOP_SECONDS = 2.5

/** The view box every animation draws in. Wider than tall, like the card it sits in. */
export const VIEW_BOX = '0 0 160 100'

/** Where the cursor starts each loop when the author does not say: just inside the top-left. */
export const CURSOR_HOME: Pt = [14, 10]

/** Where in the loop each event happens, as a fraction of LOOP_SECONDS; the keyframes match. */
export const BEATS = { firstClick: 0.3, secondClick: 0.62, fade: 0.9 } as const

/** The frame the animation is frozen on under "reduce motion": the result showing, the ripples spent, the cursor at rest. */
export const REDUCED_MOTION_FRAME = 0.84

const px = ([x, y]: Pt): string => `${x}px ${y}px`

/**
 * The custom properties that steer the cursor: its home, its first click and, when the tool needs
 * two, its second. A one-click tool leaves --tc-c unset and the keyframes fall back to --tc-b, so
 * the cursor simply rests on the click until the loop ends.
 */
export function cursorStops(clicks: [Pt] | [Pt, Pt], home: Pt = CURSOR_HOME): CSSProperties {
  const style: Record<string, string> = { '--tc-a': px(home), '--tc-b': px(clicks[0]) }
  if (clicks[1]) style['--tc-c'] = px(clicks[1])
  return style as CSSProperties
}

/** A ripple or an object that belongs to the second click carries `tc-late` beside its class. */
export const appearClass = (second = false): string => (second ? 'tc-appear tc-late' : 'tc-appear')

/** The time a reduced-motion viewer is shown, as the negative delay that freezes the loop there. */
export const reducedMotionDelay = (): string => `-${Number((LOOP_SECONDS * REDUCED_MOTION_FRAME).toFixed(2))}s`
