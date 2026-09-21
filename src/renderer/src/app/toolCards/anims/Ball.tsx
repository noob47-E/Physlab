// Add Ball: the cursor clicks the button and a ball drops onto the ground.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const GROUND_Y = 80
const R = 12
const AT: Pt = [80, GROUND_Y - R]

export function Ball() {
  return (
    <Scene>
      <line x1="10" y1={GROUND_Y} x2="150" y2={GROUND_Y} stroke="var(--text-dim)" strokeWidth="2" />
      <Click at={AT} />
      <g className="tc-appear">
        <circle cx={AT[0]} cy={AT[1]} r={R} fill="var(--good)" />
      </g>
      <Cursor clicks={[AT]} />
    </Scene>
  )
}
