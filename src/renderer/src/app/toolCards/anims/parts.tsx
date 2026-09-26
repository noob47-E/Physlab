// The pieces every card animation is built from: the scene, the cursor and the click ripple.
//
// An author composes these and adds their own object with the `tc-appear` class (see
// AUTHORING.md). Nothing here carries a colour of its own: the cursor and its ripple are the
// accent, scenery is the dim text colour and a result the student made is `--good`, so the
// picture follows the theme like everything else on screen.

import type { ReactNode } from 'react'
import { VIEW_BOX, cursorStops, type Pt } from '../animMath'

/** The drawing surface: a 160×100 view box with a faint dot grid so a click has somewhere to land. */
export function Scene({ children, grid = true }: { children: ReactNode; grid?: boolean }) {
  return (
    <svg className="tc-scene" viewBox={VIEW_BOX} aria-hidden="true" focusable="false">
      {grid && (
        <g fill="var(--text-dim)" opacity="0.35">
          {GRID.map(([x, y]) => (
            <circle key={`${x},${y}`} cx={x} cy={y} r="0.8" />
          ))}
        </g>
      )}
      {children}
    </svg>
  )
}

const GRID: Pt[] = []
for (let y = 10; y < 100; y += 20) for (let x = 10; x < 160; x += 20) GRID.push([x, y])

/**
 * The mouse pointer. It rests at `home` (top-left by default), glides to the first click, and on
 * to the second when the tool needs one; the timing is the shared tc-cursor keyframe.
 */
export function Cursor({ clicks, home }: { clicks: [Pt] | [Pt, Pt]; home?: Pt }) {
  return (
    <g className="tc-cursor" style={cursorStops(clicks, home)}>
      {/* Tip at the origin, so a translate puts the tip on the click point. */}
      <path d="M0 0 L0 13 L3.2 10.2 L5.6 15.4 L7.8 14.4 L5.5 9.3 L9.5 9 Z" fill="var(--accent)" />
    </g>
  )
}

/** The ring that spreads from a click. `second` ties it to the second click of a two-click tool. */
export function Click({ at, second = false }: { at: Pt; second?: boolean }) {
  return <circle className={second ? 'tc-ripple tc-late' : 'tc-ripple'} cx={at[0]} cy={at[1]} r="9" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
}
