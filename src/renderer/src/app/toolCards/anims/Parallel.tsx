// Parallel tool: click a point and a line, and the line through the point that never meets it appears.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const POINT: Pt = [96, 70]
// On the line from (8, 46) to (150, 10); the new line below has the same slope through POINT.
const ON_LINE: Pt = [70, 30.3]

export function Parallel() {
  return (
    <Scene>
      {/* The line the student already drew. */}
      <line x1="8" y1="46" x2="150" y2="10" stroke="var(--text-dim)" strokeWidth="1.5" opacity="0.6" />
      <circle cx={POINT[0]} cy={POINT[1]} r="3" fill="var(--text-dim)" />
      <Click at={POINT} />
      <Click at={ON_LINE} second />
      <g className="tc-appear tc-late">
        <line x1="14" y1="90.8" x2="150" y2="56.3" stroke="var(--good)" strokeWidth="2" />
      </g>
      <Cursor clicks={[POINT, ON_LINE]} />
    </Scene>
  )
}
