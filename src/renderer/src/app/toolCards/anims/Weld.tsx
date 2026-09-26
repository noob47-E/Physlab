// Weld link: click one block, click the other, and a seam fixes them to move as a single piece.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const A: Pt = [62, 50]
const B: Pt = [98, 50]
const HALF = 14
// The blocks stand a narrow gap apart, and the seam is exactly that gap: from A's right face to B's left.
const GAP_L = A[0] + HALF
const GAP_R = B[0] - HALF

export function Weld() {
  return (
    <Scene>
      {/* The scenery the student already has: two blocks, side by side, still two pieces. */}
      <rect x={A[0] - HALF} y={A[1] - HALF} width={2 * HALF} height={2 * HALF} rx="2" fill="var(--text-dim)" />
      <rect x={B[0] - HALF} y={B[1] - HALF} width={2 * HALF} height={2 * HALF} rx="2" fill="var(--text-dim)" />
      <Click at={A} />
      <Click at={B} second />
      {/* The seam that joins them, drawn right across the gap where the two blocks meet. */}
      <rect className="tc-appear tc-late" x={GAP_L} y={A[1] - HALF} width={GAP_R - GAP_L} height={2 * HALF} fill="var(--good)" />
      <Cursor clicks={[A, B]} />
    </Scene>
  )
}
