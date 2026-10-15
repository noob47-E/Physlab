// 3D-3B: the row of picture tiles the 3D shapes tool opens under the tool shelf - the seven solids of Geometry's 3-D view. A
// tile puts its solid on the floor (panels/solids3d.ts); the rest of the solids are in the Measure panel's Shapes gallery.

import { useState, type ReactNode } from 'react'
import { Box, Cone, Cylinder, Globe, Pyramid, Triangle, X } from 'lucide-react'
import { BASIC_SOLIDS, SOLID_NAMES, type SolidKind } from '../math/solidShape'
import { addSolid } from './solids3d'
import { solidFromCorners } from './shapeSolids'
import { useScene } from '../core/store'

const ICON: Partial<Record<SolidKind, ReactNode>> = {
  cube: <Box size={18} />,
  cuboid: <Box size={18} className="scale-x-125" />,
  prism: <Triangle size={18} />,
  pyramid: <Pyramid size={18} />,
  sphere: <Globe size={18} />,
  cylinder: <Cylinder size={18} />,
  cone: <Cone size={18} />
}

/** The short name on a tile ("Prism", "Pyramid"); the full one is its title. */
const SHORT: Partial<Record<SolidKind, string>> = { prism: 'Prism', pyramid: 'Pyramid' }

export function SolidsRow() {
  const setTool = useScene((s) => s.setTool)
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('(0, 0, 0), (2, 0, 0), (0, 2, 0), (0, 0, 2)')
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-[color:var(--line)] bg-[var(--bg-2)] px-2 py-1" data-solids-row="" role="toolbar" aria-label="3D shapes">
      {BASIC_SOLIDS.map((k) => (
        <button key={k} type="button" className="btn flex min-h-[32px] items-center gap-1.5 px-2 text-small pointer-coarse:min-h-[44px]" title={`${SOLID_NAMES[k]}: put it on the floor`} onClick={() => addSolid(k)}>
          {ICON[k]}
          <span>{SHORT[k] ?? SOLID_NAMES[k]}</span>
        </button>
      ))}
      <button type="button" className="btn flex min-h-[32px] items-center gap-1.5 px-2 text-small pointer-coarse:min-h-[44px]" title="A polyhedron from typed corners like (0,0,0), (2,0,0), ..." aria-pressed={typing} onClick={() => setTyping(!typing)}>
        <span>From corners</span>
      </button>
      {typing && (
        <div className="flex w-full flex-wrap items-center gap-1" data-from-corners="">
          <input className="field min-w-[16rem] flex-1 pointer-coarse:min-h-[44px]" aria-label="Corners" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setErr(solidFromCorners(text))} />
          <button type="button" className="btn primary px-2 text-small pointer-coarse:min-h-[44px]" onClick={() => setErr(solidFromCorners(text))}>
            Make solid
          </button>
          {err && <p className="w-full text-small text-[color:var(--bad)]">{err}</p>}
        </div>
      )}
      <div className="flex-1" />
      <button type="button" className="btn flex min-h-[32px] items-center px-2 pointer-coarse:min-h-[44px]" title="Close the shapes row (back to Move)" aria-label="Close the shapes row" onClick={() => setTool('select')}>
        <X size={15} />
      </button>
    </div>
  )
}
