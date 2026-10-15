// Measure tool in 3-D (3D-3B): click a solid, and its volume is worked out beside it.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const SOLID: Pt = [62, 62]

export function Measure3D() {
  return (
    <Scene grid={false}>
      <path d="M30 80 L90 80 L102 68 L42 68 Z" fill="var(--text-dim)" fillOpacity="0.12" stroke="var(--text-dim)" strokeWidth="1.2" />
      <path d="M30 80 L66 26 L90 80 M66 26 L102 68 M66 26 L42 68" fill="none" stroke="var(--text-dim)" strokeWidth="1.2" />
      <Click at={SOLID} />
      <g className="tc-appear">
        <path d="M30 80 L90 80 L102 68 L42 68 Z" fill="var(--good)" fillOpacity="0.2" stroke="var(--good)" strokeWidth="1.5" />
        <path d="M30 80 L66 26 L90 80 M66 26 L102 68 M66 26 L42 68" fill="none" stroke="var(--good)" strokeWidth="1.5" />
        <rect x="104" y="20" width="50" height="22" rx="4" fill="none" stroke="var(--good)" strokeWidth="1.2" />
        <path d="M110 31 h38" stroke="var(--good)" strokeWidth="2" strokeDasharray="6 3" />
      </g>
      <Cursor clicks={[SOLID]} />
    </Scene>
  )
}
