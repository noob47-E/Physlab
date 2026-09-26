// Angle tool: click a point on each arm with the vertex in between, and the arc appears.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

// The first arm and its clicked point are already there; the loop shows the last two clicks.
const ARM1: Pt = [30, 26]
const VERTEX: Pt = [40, 80]
const ARM2: Pt = [124, 62]

export function Angle() {
  return (
    <Scene>
      <line x1={VERTEX[0]} y1={VERTEX[1]} x2={ARM1[0]} y2={ARM1[1]} stroke="var(--text-dim)" strokeWidth="1.5" opacity="0.6" />
      <circle cx={ARM1[0]} cy={ARM1[1]} r="3" fill="var(--text-dim)" />
      <Click at={VERTEX} />
      <Click at={ARM2} second />
      <g className="tc-appear tc-late">
        <line x1={VERTEX[0]} y1={VERTEX[1]} x2={ARM2[0]} y2={ARM2[1]} stroke="var(--good)" strokeWidth="2" />
        {/* An arc of radius 16 about the vertex, from a point on the first arm to a point on the second. */}
        <path d="M37.1 64.3 A 16 16 0 0 1 55.6 76.6" fill="none" stroke="var(--good)" strokeWidth="1.5" />
      </g>
      <Cursor clicks={[VERTEX, ARM2]} />
    </Scene>
  )
}
