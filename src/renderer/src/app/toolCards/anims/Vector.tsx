// Vector tool: click the tail, click the head, and an arrow joins them.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const TAIL: Pt = [40, 70]
const HEAD: Pt = [122, 28]

export function Vector() {
  return (
    <Scene>
      <Click at={TAIL} />
      <Click at={HEAD} second />
      <g className="tc-appear tc-late">
        <line x1={TAIL[0]} y1={TAIL[1]} x2={HEAD[0]} y2={HEAD[1]} stroke="var(--good)" strokeWidth="2" />
        <path d={`M${HEAD[0]} ${HEAD[1]} L${HEAD[0] - 10} ${HEAD[1] + 3} L${HEAD[0] - 7} ${HEAD[1] + 9} Z`} fill="var(--good)" />
      </g>
      <Cursor clicks={[TAIL, HEAD]} />
    </Scene>
  )
}
