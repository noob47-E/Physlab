// Perp. bisector tool: click two points, or a segment, and the line that cuts it in half at right angles appears.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const A: Pt = [34, 76]
const B: Pt = [122, 40]

export function PerpBisector() {
  return (
    <Scene>
      {/* The segment the student already drew. */}
      <line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke="var(--text-dim)" strokeWidth="1.5" opacity="0.6" />
      <circle cx={A[0]} cy={A[1]} r="3" fill="var(--text-dim)" />
      <circle cx={B[0]} cy={B[1]} r="3" fill="var(--text-dim)" />
      <Click at={A} />
      <Click at={B} second />
      <g className="tc-appear tc-late">
        {/* Through the midpoint (78, 58), at right angles to AB, out past both edges. */}
        <line x1="57.2" y1="7.1" x2="96.9" y2="104.3" stroke="var(--good)" strokeWidth="2" />
        <path d="M83.6 55.7 L85.8 61.3 L80.3 63.6" fill="none" stroke="var(--good)" strokeWidth="1.2" />
      </g>
      <Cursor clicks={[A, B]} />
    </Scene>
  )
}
