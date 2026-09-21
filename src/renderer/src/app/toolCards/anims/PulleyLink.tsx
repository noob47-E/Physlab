// Rope-over-pulley link: click one ball, click the other, and a rope runs from each up and over the wheel.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const WHEEL: Pt = [80, 22]
const WHEEL_R = 10
const A: Pt = [34, 74]
const B: Pt = [126, 68]

export function PulleyLink() {
  return (
    <Scene>
      {/* The scenery the student already has: the wheel above, and a ball on each side. */}
      <circle cx={WHEEL[0]} cy={WHEEL[1]} r={WHEEL_R} fill="none" stroke="var(--text-dim)" strokeWidth="2" />
      <circle cx={WHEEL[0]} cy={WHEEL[1]} r="2" fill="var(--text-dim)" />
      <circle cx={A[0]} cy={A[1]} r="9" fill="var(--text-dim)" />
      <circle cx={B[0]} cy={B[1]} r="9" fill="var(--text-dim)" />
      <Click at={A} />
      <Click at={B} second />
      {/* One rope: up from the first ball, over the top of the wheel, down to the second. */}
      <path
        className="tc-appear tc-late"
        d={`M${A[0]} ${A[1] - 9} L${WHEEL[0] - WHEEL_R} ${WHEEL[1]} A ${WHEEL_R} ${WHEEL_R} 0 0 1 ${WHEEL[0] + WHEEL_R} ${WHEEL[1]} L${B[0]} ${B[1] - 9}`}
        fill="none"
        stroke="var(--good)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <Cursor clicks={[A, B]} />
    </Scene>
  )
}
