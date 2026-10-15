// Plane tool (3D-3B): click two points, then a third, and a tilted sheet through all three appears.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const A: Pt = [44, 70]
const B: Pt = [116, 66]
const C: Pt = [92, 30]

export function Plane3D() {
  return (
    <Scene>
      <circle cx={C[0]} cy={C[1]} r="2.5" fill="var(--text-dim)" />
      <Click at={A} />
      <Click at={B} second />
      <g className="tc-appear tc-late">
        <path d="M22 80 L132 74 L120 22 L36 28 Z" fill="var(--good)" fillOpacity="0.18" stroke="var(--good)" strokeWidth="1.5" />
        {[A, B, C].map(([x, y]) => (
          <circle key={`${x},${y}`} cx={x} cy={y} r="3" fill="var(--good)" />
        ))}
      </g>
      <Cursor clicks={[A, B]} />
    </Scene>
  )
}
