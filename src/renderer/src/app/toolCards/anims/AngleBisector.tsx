// Angle bisector tool: click a point on each arm with the vertex in between, and the halving line appears.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

// The first arm and its clicked point are already there; the loop shows the last two clicks.
const ARM1: Pt = [28, 24]
const VERTEX: Pt = [40, 80]
const ARM2: Pt = [126, 66]

export function AngleBisector() {
  return (
    <Scene>
      <line x1={VERTEX[0]} y1={VERTEX[1]} x2={ARM1[0]} y2={ARM1[1]} stroke="var(--text-dim)" strokeWidth="1.5" opacity="0.6" />
      <circle cx={ARM1[0]} cy={ARM1[1]} r="3" fill="var(--text-dim)" />
      <Click at={VERTEX} />
      <Click at={ARM2} second />
      <g className="tc-appear tc-late">
        <line x1={VERTEX[0]} y1={VERTEX[1]} x2={ARM2[0]} y2={ARM2[1]} stroke="var(--text-dim)" strokeWidth="1.5" opacity="0.6" />
        {/* Halfway between the two arm directions, so it really does halve the angle. */}
        <line x1={VERTEX[0]} y1={VERTEX[1]} x2="87.8" y2="10" stroke="var(--good)" strokeWidth="2" />
      </g>
      <Cursor clicks={[VERTEX, ARM2]} />
    </Scene>
  )
}
