// Hinge link: click the plank, click the post, and the plank fixes to swing about the post's centre.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const PLANK: Pt = [56, 66]
const POST: Pt = [116, 66]

export function Hinge() {
  return (
    <Scene>
      {/* The scenery the student already has: a plank whose end rests on the post it will pivot on. */}
      <rect x="30" y={PLANK[1] - 6} width={POST[0] - 30} height="12" rx="2" fill="var(--text-dim)" />
      <circle cx={POST[0]} cy={POST[1]} r="9" fill="var(--text-dim)" />
      <Click at={PLANK} />
      <Click at={POST} second />
      {/* The pin the plank now turns about, right at the post's own centre. */}
      <circle className="tc-appear tc-late" cx={POST[0]} cy={POST[1]} r="3" fill="var(--good)" />
      <circle className="tc-appear tc-late" cx={POST[0]} cy={POST[1]} r="6" fill="none" stroke="var(--good)" strokeWidth="1" opacity="0.6" />
      <Cursor clicks={[PLANK, POST]} />
    </Scene>
  )
}
