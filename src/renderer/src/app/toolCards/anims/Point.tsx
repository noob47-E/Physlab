// Point tool: the cursor glides in, clicks, and a point appears where it clicked.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const AT: Pt = [84, 54]

export function Point() {
  return (
    <Scene>
      <Click at={AT} />
      <g className="tc-appear">
        <circle cx={AT[0]} cy={AT[1]} r="4" fill="var(--good)" />
        <circle cx={AT[0]} cy={AT[1]} r="7" fill="none" stroke="var(--good)" strokeWidth="1" opacity="0.5" />
      </g>
      <Cursor clicks={[AT]} />
    </Scene>
  )
}
