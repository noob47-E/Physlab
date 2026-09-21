// Add Capsule: the cursor clicks the button and a capsule lands on its side.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const GROUND_Y = 80
const W = 44
const H = 13
const AT: Pt = [80, GROUND_Y - H / 2]

export function Capsule() {
  return (
    <Scene>
      <line x1="10" y1={GROUND_Y} x2="150" y2={GROUND_Y} stroke="var(--text-dim)" strokeWidth="2" />
      <Click at={AT} />
      <g className="tc-appear">
        <rect x={AT[0] - W / 2} y={AT[1] - H / 2} width={W} height={H} rx={H / 2} fill="var(--good)" />
      </g>
      <Cursor clicks={[AT]} />
    </Scene>
  )
}
