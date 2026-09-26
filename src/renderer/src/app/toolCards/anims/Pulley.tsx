// Add Pulley: the cursor clicks the button and a wheel appears, hung ready for a rope.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const AT: Pt = [80, 46]

export function Pulley() {
  return (
    <Scene>
      <rect x="60" y="18" width="40" height="6" rx="2" fill="var(--text-dim)" />
      <Click at={AT} />
      <g className="tc-appear">
        <line x1={AT[0]} y1="24" x2={AT[0]} y2={AT[1] - 10} stroke="var(--good)" strokeWidth="2" />
        <circle cx={AT[0]} cy={AT[1]} r="10" fill="none" stroke="var(--good)" strokeWidth="2" />
        <circle cx={AT[0]} cy={AT[1]} r="2" fill="var(--good)" />
      </g>
      <Cursor clicks={[AT]} />
    </Scene>
  )
}
