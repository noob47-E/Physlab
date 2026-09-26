// Text tool: click where the note should go, and a text box opens there ready to type.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const AT: Pt = [70, 54]

export function Text() {
  return (
    <Scene>
      <Click at={AT} />
      <g className="tc-appear">
        <rect x={AT[0]} y={AT[1] - 10} width="46" height="20" rx="2" fill="none" stroke="var(--good)" strokeWidth="1.5" />
        <line x1={AT[0] + 8} y1={AT[1]} x2={AT[0] + 38} y2={AT[1]} stroke="var(--good)" strokeWidth="1.5" />
        <line x1={AT[0] + 8} y1={AT[1] + 5} x2={AT[0] + 26} y2={AT[1] + 5} stroke="var(--good)" strokeWidth="1.5" />
      </g>
      <Cursor clicks={[AT]} />
    </Scene>
  )
}
