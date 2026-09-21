// Add Cone: the cursor clicks the button and a cone stands on the ground.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const GROUND_Y = 80
const APEX: Pt = [80, GROUND_Y - 26]
const AT: Pt = [80, GROUND_Y - 12]

export function Cone() {
  return (
    <Scene>
      <line x1="10" y1={GROUND_Y} x2="150" y2={GROUND_Y} stroke="var(--text-dim)" strokeWidth="2" />
      <Click at={AT} />
      <g className="tc-appear">
        <path d={`M${APEX[0]} ${APEX[1]} L${APEX[0] - 15} ${GROUND_Y} L${APEX[0] + 15} ${GROUND_Y} Z`} fill="var(--good)" />
      </g>
      <Cursor clicks={[AT]} />
    </Scene>
  )
}
