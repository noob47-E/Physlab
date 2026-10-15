// 3D shapes tool (3D-3B): pick a tile in the shapes row, and a solid stands on the floor.

import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const TILE: Pt = [28, 18]

export function Solids3D() {
  return (
    <Scene grid={false}>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={14 + i * 26} y={8} width={22} height={20} rx="3" fill="none" stroke="var(--text-dim)" strokeWidth="1" />
      ))}
      <Click at={TILE} />
      <g className="tc-appear">
        {/* A pyramid on a floor seen from above and to the side. */}
        <path d="M40 86 L120 86 L136 72 L56 72 Z" fill="none" stroke="var(--text-dim)" strokeWidth="1" strokeDasharray="3 3" />
        <path d="M58 84 L114 84 L126 74 L70 74 Z" fill="var(--good)" fillOpacity="0.18" stroke="var(--good)" strokeWidth="1.5" />
        <path d="M58 84 L92 36 L114 84 M92 36 L126 74 M92 36 L70 74" fill="none" stroke="var(--good)" strokeWidth="1.5" />
      </g>
      <Cursor clicks={[TILE]} />
    </Scene>
  )
}
