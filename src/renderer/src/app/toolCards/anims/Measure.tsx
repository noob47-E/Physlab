// Measure tool: click two points, and a dimension line spanning them appears.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const A: Pt = [36, 60]
const B: Pt = [124, 44]

export function Measure() {
  return (
    <Scene>
      <Click at={A} />
      <Click at={B} second />
      <g className="tc-appear tc-late">
        <line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke="var(--good)" strokeWidth="1.5" strokeDasharray="4 3" />
        <line x1={A[0]} y1={A[1] - 6} x2={A[0]} y2={A[1] + 6} stroke="var(--good)" strokeWidth="1.5" />
        <line x1={B[0]} y1={B[1] - 6} x2={B[0]} y2={B[1] + 6} stroke="var(--good)" strokeWidth="1.5" />
      </g>
      <Cursor clicks={[A, B]} />
    </Scene>
  )
}
