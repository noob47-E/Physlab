// Line tool: click two points, and a line runs through both, edge to edge.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const A: Pt = [56, 74]
const B: Pt = [104, 40]
// The ends are A and B carried on past the box in both directions, so the line is genuinely the
// one through the two clicks; the SVG clips whatever falls outside.
const DX = B[0] - A[0]
const DY = B[1] - A[1]

export function Line() {
  return (
    <Scene>
      <Click at={A} />
      <Click at={B} second />
      <g className="tc-appear tc-late">
        <line x1={A[0] - 2 * DX} y1={A[1] - 2 * DY} x2={A[0] + 3 * DX} y2={A[1] + 3 * DY} stroke="var(--good)" strokeWidth="2" />
        <circle cx={A[0]} cy={A[1]} r="3" fill="var(--good)" />
        <circle cx={B[0]} cy={B[1]} r="3" fill="var(--good)" />
      </g>
      <Cursor clicks={[A, B]} />
    </Scene>
  )
}
