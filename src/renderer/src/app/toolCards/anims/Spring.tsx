// Spring link: click one block, click the other, and a coil appears zig-zagging between them.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const A: Pt = [34, 68]
const B: Pt = [122, 32]

/** A zig-zag from a to b: a straight lead-in and lead-out with a handful of coils between. */
function coilPath(a: Pt, b: Pt, coils = 5): string {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  // Perpendicular to the a→b line, so the coil zig-zags across it rather than along it.
  const px = -uy
  const py = ux
  const lead = 10
  const start: Pt = [a[0] + ux * lead, a[1] + uy * lead]
  const end: Pt = [b[0] - ux * lead, b[1] - uy * lead]
  const span = len - 2 * lead
  const step = span / coils
  const amp = 8
  let d = `M${a[0]} ${a[1]} L${start[0]} ${start[1]}`
  for (let i = 0; i < coils; i++) {
    const cx = start[0] + ux * step * (i + 0.5)
    const cy = start[1] + uy * step * (i + 0.5)
    const side = i % 2 === 0 ? 1 : -1
    d += ` L${cx + px * amp * side} ${cy + py * amp * side}`
  }
  d += ` L${end[0]} ${end[1]} L${b[0]} ${b[1]}`
  return d
}

export function Spring() {
  return (
    <Scene>
      {/* The scenery the student already has: two blocks to join. */}
      <rect x={A[0] - 9} y={A[1] - 9} width="18" height="18" rx="2" fill="var(--text-dim)" />
      <rect x={B[0] - 9} y={B[1] - 9} width="18" height="18" rx="2" fill="var(--text-dim)" />
      <Click at={A} />
      <Click at={B} second />
      <path className="tc-appear tc-late" d={coilPath(A, B)} fill="none" stroke="var(--good)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Cursor clicks={[A, B]} />
    </Scene>
  )
}
