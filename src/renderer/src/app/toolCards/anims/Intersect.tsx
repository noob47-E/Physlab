// Intersect tool: click two lines or circles, and a point marks where they cross.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const ON_A: Pt = [40, 26]
const ON_B: Pt = [40, 74]
const CROSS: Pt = [82, 50]

export function Intersect() {
  return (
    <Scene>
      {/* The two lines the student already drew, crossing partway across the box. */}
      <line x1="14" y1="12" x2="150" y2="88" stroke="var(--text-dim)" strokeWidth="1.5" opacity="0.6" />
      <line x1="14" y1="88" x2="150" y2="12" stroke="var(--text-dim)" strokeWidth="1.5" opacity="0.6" />
      <Click at={ON_A} />
      <Click at={ON_B} second />
      <g className="tc-appear tc-late">
        <circle cx={CROSS[0]} cy={CROSS[1]} r="4" fill="var(--good)" />
        <circle cx={CROSS[0]} cy={CROSS[1]} r="7" fill="none" stroke="var(--good)" strokeWidth="1" opacity="0.5" />
      </g>
      <Cursor clicks={[ON_A, ON_B]} />
    </Scene>
  )
}
