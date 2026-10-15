// Angle tool in 3-D (3D-3B): click a line, then a plane, and the angle between them is marked.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const LINE: Pt = [96, 34]
const PLANE: Pt = [44, 74]

export function Angle3D() {
  return (
    <Scene grid={false}>
      <path d="M14 84 L124 84 L146 64 L36 64 Z" fill="var(--text-dim)" fillOpacity="0.12" stroke="var(--text-dim)" strokeWidth="1.2" />
      <path d="M70 74 L118 18" stroke="var(--text-dim)" strokeWidth="1.5" />
      <Click at={LINE} />
      <Click at={PLANE} second />
      <g className="tc-appear tc-late">
        <path d="M70 74 L118 18" stroke="var(--good)" strokeWidth="2" />
        <path d="M70 74 L128 74" stroke="var(--good)" strokeWidth="1.2" strokeDasharray="3 3" />
        <path d="M94 74 A24 24 0 0 0 86 56" fill="none" stroke="var(--good)" strokeWidth="2" />
      </g>
      <Cursor clicks={[LINE, PLANE]} />
    </Scene>
  )
}
