// Midpoint tool: click two points, or a segment, and the point halfway between them appears.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const A: Pt = [36, 74]
const B: Pt = [126, 34]
const MID: Pt = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]

export function Midpoint() {
  return (
    <Scene>
      {/* The segment the student already drew. */}
      <line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke="var(--text-dim)" strokeWidth="1.5" opacity="0.6" />
      <circle cx={A[0]} cy={A[1]} r="3" fill="var(--text-dim)" />
      <circle cx={B[0]} cy={B[1]} r="3" fill="var(--text-dim)" />
      <Click at={A} />
      <Click at={B} second />
      <g className="tc-appear tc-late">
        <circle cx={MID[0]} cy={MID[1]} r="4" fill="var(--good)" />
        <circle cx={MID[0]} cy={MID[1]} r="7" fill="none" stroke="var(--good)" strokeWidth="1" opacity="0.5" />
      </g>
      <Cursor clicks={[A, B]} />
    </Scene>
  )
}
