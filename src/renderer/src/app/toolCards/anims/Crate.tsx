// Add Crate: the cursor clicks the button and a crate lands on the ground.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const GROUND_Y = 80
const H = 22
const AT: Pt = [80, GROUND_Y - H / 2]

export function Crate() {
  return (
    <Scene>
      <line x1="10" y1={GROUND_Y} x2="150" y2={GROUND_Y} stroke="var(--text-dim)" strokeWidth="2" />
      <Click at={AT} />
      <g className="tc-appear">
        <rect x={AT[0] - H / 2} y={AT[1] - H / 2} width={H} height={H} rx="2" fill="var(--good)" />
      </g>
      <Cursor clicks={[AT]} />
    </Scene>
  )
}
