// Add Ramp: the cursor clicks the button and a fixed slope appears on the ground.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const GROUND_Y = 80
const AT: Pt = [86, 66]

export function Ramp() {
  return (
    <Scene>
      <line x1="10" y1={GROUND_Y} x2="150" y2={GROUND_Y} stroke="var(--text-dim)" strokeWidth="2" />
      <Click at={AT} />
      <g className="tc-appear">
        <path d={`M22 40 L22 ${GROUND_Y} L140 ${GROUND_Y} Z`} fill="var(--good)" />
      </g>
      <Cursor clicks={[AT]} />
    </Scene>
  )
}
