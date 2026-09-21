// Circle tool: click the centre, click a point on the rim, and the circle appears.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const CENTRE: Pt = [70, 52]
const RIM: Pt = [110, 52]

export function Circle() {
  return (
    <Scene>
      <Click at={CENTRE} />
      <Click at={RIM} second />
      <g className="tc-appear tc-late">
        <circle cx={CENTRE[0]} cy={CENTRE[1]} r="40" fill="none" stroke="var(--good)" strokeWidth="2" />
        <circle cx={CENTRE[0]} cy={CENTRE[1]} r="2.5" fill="var(--good)" />
        <circle cx={RIM[0]} cy={RIM[1]} r="2.5" fill="var(--good)" />
      </g>
      <Cursor clicks={[CENTRE, RIM]} />
    </Scene>
  )
}
