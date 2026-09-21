// Rod link: click one block, click the other, and a rigid bar appears fixing the gap between them.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const A: Pt = [36, 70]
const B: Pt = [124, 32]

export function Rod() {
  return (
    <Scene>
      {/* The scenery the student already has: two blocks to join. */}
      <rect x={A[0] - 9} y={A[1] - 9} width="18" height="18" rx="2" fill="var(--text-dim)" />
      <rect x={B[0] - 9} y={B[1] - 9} width="18" height="18" rx="2" fill="var(--text-dim)" />
      <Click at={A} />
      <Click at={B} second />
      {/* Thick and dead straight: a rod neither sags nor stretches, so it reads heavier than a string. */}
      <line className="tc-appear tc-late" x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke="var(--good)" strokeWidth="5" strokeLinecap="round" />
      <Cursor clicks={[A, B]} />
    </Scene>
  )
}
