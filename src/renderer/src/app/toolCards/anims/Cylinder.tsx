// Add Cylinder: the cursor clicks the button and a cylinder lands on its side.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const GROUND_Y = 80
const W = 36
const H = 18
const AT: Pt = [80, GROUND_Y - H / 2]

export function Cylinder() {
  return (
    <Scene>
      <line x1="10" y1={GROUND_Y} x2="150" y2={GROUND_Y} stroke="var(--text-dim)" strokeWidth="2" />
      <Click at={AT} />
      <g className="tc-appear">
        {/* Square-ended, unlike the capsule, with the flat round face showing at one end. */}
        <rect x={AT[0] - W / 2} y={AT[1] - H / 2} width={W} height={H} rx="1.5" fill="var(--good)" />
        <ellipse cx={AT[0] + W / 2} cy={AT[1]} rx="4" ry={H / 2} fill="var(--good)" stroke="var(--text-dim)" strokeWidth="1" opacity="0.8" />
      </g>
      <Cursor clicks={[AT]} />
    </Scene>
  )
}
