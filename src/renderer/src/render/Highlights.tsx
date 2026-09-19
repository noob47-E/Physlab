// Hover highlights from the side panels: light-grey hatch over a region, glowing sides, dashed heights.

import { useMemo } from 'react'
import { create } from 'zustand'
import { FatLine } from './FatLine'
import { useView } from './viewState'
import type { Highlight } from '../math/shapeFormulas'
import type { V3 } from '../math/vec'

export const useHighlight = create<{ h: Highlight | null; set: (h: Highlight | null) => void }>((set) => ({
  h: null,
  set: (h) => set({ h })
}))

/** Horizontal hatch lines clipped to a polygon (scanline intersections). */
export function hatchSegments(region: V3[], spacing: number): V3[] {
  if (region.length < 3 || spacing <= 0) return []
  const ys = region.map((p) => p[1])
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  if ((yMax - yMin) / spacing > 1500) spacing = (yMax - yMin) / 1500
  const out: V3[] = []
  const z = region[0][2]
  for (let y = Math.ceil(yMin / spacing) * spacing; y <= yMax; y += spacing) {
    const xs: number[] = []
    for (let i = 0; i < region.length; i++) {
      const a = region[i]
      const b = region[(i + 1) % region.length]
      if (a[1] > y !== b[1] > y) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]))
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) out.push([xs[k], y, z], [xs[k + 1], y, z])
  }
  return out
}

export function Highlights() {
  const h = useHighlight((s) => s.h)
  const wpp = useView((s) => s.wpp)
  const hatch = useMemo(() => (h?.region ? hatchSegments(h.region, 7 * wpp) : []), [h, wpp])
  if (!h) return null
  return (
    <>
      {hatch.length > 1 && <FatLine points={hatch} segments color="#c9ced6" width={1.1} renderOrder={40} />}
      {h.segments?.map((s, i) => (
        <FatLine key={`s${i}`} points={s} color="#ffd43b" width={5} renderOrder={41} />
      ))}
      {h.dashed?.map((s, i) => (
        <FatLine key={`d${i}`} points={s} color="#ffd43b" width={2.2} dashed dashSize={7 * wpp} gapSize={5 * wpp} renderOrder={41} />
      ))}
    </>
  )
}
