// Segment tool: click each end, and the segment joining them appears.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const A: Pt = [40, 66]
const B: Pt = [122, 34]

export function Segment() {
  return (
    <Scene>
      <Click at={A} />
      <Click at={B} second />
      <g className="tc-appear tc-late">
        <line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke="var(--good)" strokeWidth="2" />
        <circle cx={A[0]} cy={A[1]} r="3" fill="var(--good)" />
        <circle cx={B[0]} cy={B[1]} r="3" fill="var(--good)" />
      </g>
      <Cursor clicks={[A, B]} />
    </Scene>
  )
}
