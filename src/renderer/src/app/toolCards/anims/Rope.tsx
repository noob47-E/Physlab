// Rope link: click the ball, click the beam, and a rope hangs between them with a little slack.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const BALL: Pt = [44, 66]
const BEAM: Pt = [124, 18]

export function Rope() {
  return (
    <Scene>
      {/* The scenery the student already has: a beam to hang from and a ball to hang. */}
      <rect x="98" y="12" width="52" height="10" rx="2" fill="var(--text-dim)" />
      <circle cx={BALL[0]} cy={BALL[1]} r="9" fill="var(--text-dim)" />
      <Click at={BALL} />
      <Click at={BEAM} second />
      {/* The rope sags a touch below the straight line, which is how a rope tells itself from a rod. */}
      <path className="tc-appear tc-late" d={`M${BALL[0]} ${BALL[1] - 9} Q 86 50 ${BEAM[0]} 22`} fill="none" stroke="var(--good)" strokeWidth="2" strokeLinecap="round" />
      <Cursor clicks={[BALL, BEAM]} />
    </Scene>
  )
}
