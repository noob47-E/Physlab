// Ray tool: click the start, click a point it passes through, and it runs on past it.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const START: Pt = [40, 78]
const THROUGH: Pt = [92, 46]

export function Ray() {
  return (
    <Scene>
      <Click at={START} />
      <Click at={THROUGH} second />
      <g className="tc-appear tc-late">
        <line x1={START[0]} y1={START[1]} x2="150" y2="10" stroke="var(--good)" strokeWidth="2" />
        <circle cx={START[0]} cy={START[1]} r="3" fill="var(--good)" />
        <circle cx={THROUGH[0]} cy={THROUGH[1]} r="3" fill="var(--good)" />
      </g>
      <Cursor clicks={[START, THROUGH]} />
    </Scene>
  )
}
