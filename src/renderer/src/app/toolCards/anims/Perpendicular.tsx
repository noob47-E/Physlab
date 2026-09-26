// Perpendicular tool: click a point and a line, and the line through the point at right angles appears.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const POINT: Pt = [104, 76]
// On the line from (10, 52) to (150, 12), which the numbers below are all worked out from.
const ON_LINE: Pt = [70, 34.9]

export function Perpendicular() {
  return (
    <Scene>
      {/* The line the student already drew. */}
      <line x1="10" y1="52" x2="150" y2="12" stroke="var(--text-dim)" strokeWidth="1.5" opacity="0.6" />
      <circle cx={POINT[0]} cy={POINT[1]} r="3" fill="var(--text-dim)" />
      <Click at={POINT} />
      <Click at={ON_LINE} second />
      <g className="tc-appear tc-late">
        {/* Through the point and the foot (90.6, 29) of the perpendicular from it, on past both. */}
        <line x1="82.9" y1="2.1" x2="110.9" y2="100.2" stroke="var(--good)" strokeWidth="2" />
        <path d="M96.3 27.3 L98 33.1 L92.2 34.8" fill="none" stroke="var(--good)" strokeWidth="1.2" />
      </g>
      <Cursor clicks={[POINT, ON_LINE]} />
    </Scene>
  )
}
