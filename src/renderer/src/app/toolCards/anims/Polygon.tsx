// Polygon tool: keep clicking corners, then click the first corner again to close the loop.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

// Two corners already placed before this loop starts, so the picture can show the closing click.
const FIRST: Pt = [50, 30]
const SECOND: Pt = [34, 70]
const NEXT: Pt = [96, 82]

export function Polygon() {
  return (
    <Scene>
      {/* The corners already placed, and the sides already drawn between them. */}
      <path d={`M${FIRST[0]} ${FIRST[1]} L${SECOND[0]} ${SECOND[1]}`} fill="none" stroke="var(--text-dim)" strokeWidth="1.5" opacity="0.6" />
      <circle cx={FIRST[0]} cy={FIRST[1]} r="3" fill="var(--text-dim)" />
      <circle cx={SECOND[0]} cy={SECOND[1]} r="3" fill="var(--text-dim)" />
      <Click at={NEXT} />
      <Click at={FIRST} second />
      <g className="tc-appear tc-late">
        <path d={`M${FIRST[0]} ${FIRST[1]} L${SECOND[0]} ${SECOND[1]} L${NEXT[0]} ${NEXT[1]} L${118} ${28} Z`} fill="none" stroke="var(--good)" strokeWidth="2" />
      </g>
      <Cursor clicks={[NEXT, FIRST]} />
    </Scene>
  )
}
