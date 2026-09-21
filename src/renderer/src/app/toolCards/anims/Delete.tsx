// Delete tool: click an object and it goes; Undo is what brings it back.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const AT: Pt = [80, 50]

export function Delete() {
  return (
    <Scene>
      {/* The object as it stood before the click. */}
      <circle cx={AT[0]} cy={AT[1]} r="10" fill="var(--text-dim)" />
      <Click at={AT} />
      {/* What is left once it is gone: a faint outline, since Undo can still bring it back. */}
      <circle className="tc-appear" cx={AT[0]} cy={AT[1]} r="10" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.4" />
      <Cursor clicks={[AT]} />
    </Scene>
  )
}
