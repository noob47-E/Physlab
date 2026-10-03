// Tick marks on equal sides and arcs on equal angles: the marks a geometry book puts on two
// congruent triangles. Set by the Compare card, drawn here.

import { create } from 'zustand'
import { FatLine } from './FatLine'
import { useView } from './viewState'
import { useScene } from '../core/store'
import { themeColor, useThemed } from '../app/theme'
import type { V3 } from '../math/vec'
import { arcLines, tickLines, tickNormal } from './markGeometry'

export interface Marks {
  /** A side, and how many ticks it gets (sides with the same count are equal). */
  ticks: { a: V3; b: V3; n: number }[]
  /** An angle at a vertex between two arms, and how many arcs it gets. */
  arcs: { vertex: V3; a: V3; b: V3; n: number }[]
}

export const useMarks = create<{ marks: Marks | null; set: (m: Marks | null) => void }>((set) => ({ marks: null, set: (marks) => set({ marks }) }))

export function MarksView() {
  const marks = useMarks((s) => s.marks)
  const wpp = useView((s) => s.wpp)
  // The equal-angle arcs are angle marks too; the ticks on equal sides are not.
  const showArcs = useScene((s) => s.settings.showAngleMarks)
  // Re-read on a theme switch: the demand-driven canvas only repaints when something renders.
  const colour = useThemed(() => themeColor('--good'))
  if (!marks) return null
  const lines: V3[][] = []
  // Marks lie in the plane of the shape they mark, so they read right when the triangle stands upright in 3-D.
  for (const t of marks.ticks) lines.push(...tickLines(t, tickNormal(t, marks.ticks, marks.arcs), 6 * wpp, 5 * wpp))
  for (const arc of showArcs ? marks.arcs : []) lines.push(...arcLines(arc, 22 * wpp, 5 * wpp))
  return (
    <>
      {lines.map((pts, i) => (
        <FatLine key={i} points={pts} color={colour} width={2.2} renderOrder={42} />
      ))}
    </>
  )
}
