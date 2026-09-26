// String link: click one ball, click the other, and a taut straight string appears between them.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const A: Pt = [36, 70]
const B: Pt = [124, 32]
const R = 9
// The string runs rim to rim along the line of centres, so it leaves each ball towards the other.
const U = ((): Pt => {
  const len = Math.hypot(B[0] - A[0], B[1] - A[1])
  return [(B[0] - A[0]) / len, (B[1] - A[1]) / len]
})()

export function StringLink() {
  return (
    <Scene>
      {/* The scenery the student already has: two balls to join. */}
      <circle cx={A[0]} cy={A[1]} r={R} fill="var(--text-dim)" />
      <circle cx={B[0]} cy={B[1]} r={R} fill="var(--text-dim)" />
      <Click at={A} />
      <Click at={B} second />
      {/* Dead straight and taut, which is how a string tells itself from a rope's sag. */}
      <line className="tc-appear tc-late" x1={A[0] + R * U[0]} y1={A[1] + R * U[1]} x2={B[0] - R * U[0]} y2={B[1] - R * U[1]} stroke="var(--good)" strokeWidth="2" strokeLinecap="round" />
      <Cursor clicks={[A, B]} />
    </Scene>
  )
}
