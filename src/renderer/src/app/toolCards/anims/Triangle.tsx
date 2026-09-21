// Triangle tool: click each corner, and the triangle joining all three appears.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const A: Pt = [40, 80]
const B: Pt = [120, 78]
const C: Pt = [78, 22]

export function Triangle() {
  return (
    <Scene>
      <Click at={A} />
      <Click at={B} second />
      <g className="tc-appear tc-late">
        <path d={`M${A[0]} ${A[1]} L${B[0]} ${B[1]} L${C[0]} ${C[1]} Z`} fill="none" stroke="var(--good)" strokeWidth="2" />
        <circle cx={C[0]} cy={C[1]} r="3" fill="var(--good)" />
      </g>
      <Cursor clicks={[A, B]} />
    </Scene>
  )
}
