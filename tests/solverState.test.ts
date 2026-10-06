// The vector problem solver's choices that are not drawing: which vectors a problem keeps when it
// is chosen and which it reads when solved (Q17, Q18), and which tab Practice brings forward (Q36).
import { describe, expect, it } from 'vitest'
import { newVec, panelToFront, vectorsOnChoose, vectorsToSolve } from '../src/renderer/src/panels/solverState'

describe('Q18: choosing a problem keeps the vectors already typed', () => {
  it('from one vector to "Add vectors" keeps A as typed and adds B', () => {
    const a = newVec('A', [5, 12, 0])
    const got = vectorsOnChoose([a], -1, ['A', 'B', 'C'])
    expect(got.map((v) => [v.name, v.comp])).toEqual([
      ['A', [5, 12, 0]],
      ['B', [2, -1, 0]]
    ])
  })

  it('keeps two or more vectors untouched for "Add vectors", and renames for a fixed count', () => {
    const two = [newVec('A', [1, 2, 0]), newVec('B', [3, 4, 0]), newVec('C', [5, 6, 0])]
    expect(vectorsOnChoose(two, -1, ['A', 'B', 'C'])).toBe(two)
    expect(vectorsOnChoose(two, 2, ['r', 'F']).map((v) => [v.name, v.comp])).toEqual([
      ['r', [1, 2, 0]],
      ['F', [3, 4, 0]]
    ])
  })

  it('leaves the list alone for a problem with no vectors', () => {
    const one = [newVec('A', [5, 12, 0])]
    expect(vectorsOnChoose(one, 0, ['A'])).toBe(one)
  })
})

describe('Q17: solving reads only the vectors the problem uses', () => {
  it('a problem with no vectors reads none — a left-over unpicked scene vector cannot stop it', () => {
    const unpicked = { ...newVec('A'), mode: 'scene' as const, sceneId: '' }
    expect(vectorsToSolve([unpicked, newVec('B')], 0)).toEqual([])
  })

  it('a fixed count reads that many, and "any number" reads all', () => {
    const three = [newVec('A'), newVec('B'), newVec('C')]
    expect(vectorsToSolve(three, 1)).toHaveLength(1)
    expect(vectorsToSolve(three, 2)).toHaveLength(2)
    expect(vectorsToSolve(three, -1)).toHaveLength(3)
  })
})

describe('Q36: "Show it" brings the tab it switched to forward', () => {
  it('the Sandbox and Lab Data come to the front; Graphing has its own view', () => {
    expect(panelToFront('sandbox')).toBe('sandbox')
    expect(panelToFront('lab')).toBe('labdata')
    expect(panelToFront('graphing')).toBeNull()
  })
})
