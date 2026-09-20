// Tick marks on equal sides and arcs on equal angles: the marks a geometry book puts on two
// congruent triangles. Set by the Compare card, drawn here.

import { create } from 'zustand'
import { FatLine } from './FatLine'
import { useView } from './viewState'
import { themeColor, useTheme } from '../app/theme'
import { add, normalize, scale, sub, type V3 } from '../math/vec'

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
  const theme = useTheme((t) => t.theme)
  if (!marks) return null
  const colour = themeColor('--good', theme === 'light' ? '#1f8a4c' : '#58d68d')
  const lines: V3[][] = []
  for (const t of marks.ticks) {
    const mid = scale(add(t.a, t.b), 0.5)
    const dir = normalize(sub(t.b, t.a))
    const perp: V3 = [-dir[1], dir[0], 0]
    const half = 6 * wpp
    const gap = 5 * wpp
    for (let i = 0; i < t.n; i++) {
      const c = add(mid, scale(dir, (i - (t.n - 1) / 2) * gap))
      lines.push([add(c, scale(perp, half)), sub(c, scale(perp, half))])
    }
  }
  for (const arc of marks.arcs) {
    const u = normalize(sub(arc.a, arc.vertex))
    const v = normalize(sub(arc.b, arc.vertex))
    let a0 = Math.atan2(u[1], u[0])
    let a1 = Math.atan2(v[1], v[0])
    // Sweep the short way round, the inside of the corner.
    let d = a1 - a0
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    if (d < 0) {
      ;[a0, a1] = [a1, a0]
      d = -d
    }
    for (let i = 0; i < arc.n; i++) {
      const r = (22 + i * 5) * wpp
      const pts: V3[] = []
      for (let k = 0; k <= 24; k++) {
        const t = a0 + (d * k) / 24
        pts.push([arc.vertex[0] + r * Math.cos(t), arc.vertex[1] + r * Math.sin(t), arc.vertex[2]])
      }
      lines.push(pts)
    }
  }
  return (
    <>
      {lines.map((pts, i) => (
        <FatLine key={i} points={pts} color={colour} width={2.2} renderOrder={42} />
      ))}
    </>
  )
}
