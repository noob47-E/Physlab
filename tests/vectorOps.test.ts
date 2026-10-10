// CW16 (CLEANUP-PLAN.md "CW7d One table of vector operations"): the vector operations live in one
// table in panels/vectorCalcStore.ts, read by the Vector Calculator, the Vector Solver and the
// Calculator's VECTOR screen. This pins what every operation works out, so the table changes no answer.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/renderer/src/core/store'
import type { SceneSettings } from '../src/renderer/src/core/types'
import { OPERATIONS, solveOperation } from '../src/renderer/src/panels/vectorCalcStore'

const settings: SceneSettings = { ...DEFAULT_SETTINGS }
const A = { name: 'A', v: [3, 4, 0] as [number, number, number] }
const B = { name: 'B', v: [1, -2, 2] as [number, number, number] }
const C = { name: 'C', v: [-1, 0.5, 0] as [number, number, number] }

/** Every operation the panel offers, with today's answer in full (title, steps, result). */
const worked = (): Record<string, unknown> =>
  Object.fromEntries(
    Object.keys(OPERATIONS).map((id) => {
      const vs = OPERATIONS[id].need === 'all' ? [A, B, C] : [A, B].slice(0, OPERATIONS[id].need as number)
      return [id, JSON.parse(JSON.stringify(solveOperation(id, vs, settings, 2.5, 1.6e-19)))]
    })
  )

describe('CW16: the vector operations', () => {
  it('the panel offers these fifteen, by these names', () => {
    expect(Object.entries(OPERATIONS).map(([id, r]) => `${id}:${r.label}:${r.need}:${r.field ?? ''}`)).toMatchInlineSnapshot(`
      [
        "sum:Add all:all:",
        "sub:Subtract:2:",
        "dot:Dot:2:",
        "cross:Cross:2:",
        "mag:Size & angle:1:",
        "resolve:Components:1:",
        "scale:Scalar ×:1:k",
        "unit:Unit vector:1:",
        "angle:Angle between:2:",
        "proj:Projection:2:",
        "equil:Equilibrium:all:",
        "torque:Torque:2:",
        "work:Work:2:",
        "lorentz:Magnetic force:2:q",
        "relvel:Relative velocity:2:",
      ]
    `)
  })

  it('each works out the same answer as before the table', () => {
    expect(worked()).toMatchSnapshot()
  })

  it('an operation that is not one gives nothing', () => {
    expect(solveOperation('nope', [A], settings)).toBeNull()
  })
})
