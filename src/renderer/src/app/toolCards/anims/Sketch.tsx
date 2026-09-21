// Sketch tool: a rough scribble under the cursor's path becomes a neat square.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const START: Pt = [46, 62]
const END: Pt = [110, 26]

export function Sketch() {
  return (
    <Scene>
      {/* The wobbly stroke the mouse actually drew, from the first click to the second. */}
      <path d={`M${START[0]} ${START[1]} Q 60 40 70 58 T 90 30 T ${END[0]} ${END[1]}`} fill="none" stroke="var(--text-dim)" strokeWidth="1.2" opacity="0.55" />
      <Click at={START} />
      <Click at={END} second />
      <rect className="tc-appear tc-late" x="58" y="30" width="40" height="30" fill="none" stroke="var(--good)" strokeWidth="2" />
      <Cursor clicks={[START, END]} />
    </Scene>
  )
}
