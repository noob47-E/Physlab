// T7 proof for audit bug 19 [C5]: "Incoherent explanation for projection onto zero vector
// (panels/Measurements.tsx:43, 270)".
//
// Verdict REAL. The Projection row reuses NO_DIRECTION, the sentence written for the Angle row.
// Measured today, with A = 0 and B = 3i + 4j:
//   Projection of B on A = "undefined — a zero vector has no direction"
// The projection is a scalar, so "has no direction" is not the reason it has no value; the reason
// is that it is divided by |A| = 0. (The Angle row's use of the same sentence is right.)
import { describe, expect, it } from 'vitest'
import { pairRows } from '../src/renderer/src/panels/Measurements'

const obj = (id: string, name: string, type: string) => ({ id, name, type, visible: true, locked: false, color: '#000', showLabel: true })
const zero = { ...obj('vA', 'A', 'vector'), def: { kind: 'free', tail: [0, 0, 0], comp: [0, 0, 0] } }
const four = { ...obj('vB', 'B', 'vector'), def: { kind: 'free', tail: [0, 0, 0], comp: [3, 4, 0] } }
const get = (id: string) => (id === 'vA' ? { type: 'vector', comp: [0, 0, 0] } : { type: 'vector', comp: [3, 4, 0] })

const rows = () => pairRows(zero as never, four as never, get as never)!.rows
const row = (label: string) => rows().find((r) => r.label === label)!

describe('G19: the zero-vector projection is explained with a direction sentence', () => {
  it('the projection row does not say the reason is a missing direction', () => {
    expect(String(row('Projection of B on A').value)).not.toContain('no direction')
  })

  it('the angle row keeps its own sentence', () => {
    expect(String(row('Angle between').value)).toContain('no direction')
  })

  it('a projection onto a real vector is still a length', () => {
    const swap = pairRows(four as never, zero as never, get as never)!.rows
    expect(swap.find((r) => r.label === 'Projection of A on B')!.value).toBeCloseTo(0, 12)
  })
})
