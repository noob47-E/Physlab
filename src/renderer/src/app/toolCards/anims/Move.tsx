// Move (Select) tool: click a point, drag it, and it lands where the cursor let go.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const FROM: Pt = [48, 68]
const TO: Pt = [118, 30]

export function Move() {
  return (
    <Scene>
      {/* The point as it starts, and the path it will be dragged along. */}
      <line x1={FROM[0]} y1={FROM[1]} x2={TO[0]} y2={TO[1]} stroke="var(--text-dim)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
      <circle cx={FROM[0]} cy={FROM[1]} r="4" fill="var(--text-dim)" />
      <Click at={FROM} />
      <Click at={TO} second />
      <g className="tc-appear tc-late">
        <circle cx={TO[0]} cy={TO[1]} r="4" fill="var(--good)" />
      </g>
      <Cursor clicks={[FROM, TO]} />
    </Scene>
  )
}
