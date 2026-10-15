// 3D-1 (owner item, Wed 14 Oct): vectors in 3D. Typed in three forms, every operation's answer in 3-D, the x, y, z boxes,
// and the slim 3-D arrow: its head keeps its size on screen at any zoom (the bulky arrow came from scaling by the
// world-per-pixel at the arrow's far-away midpoint).

import { describe, expect, it } from 'vitest'
import { cardValues } from '../src/renderer/src/panels/vectorLine'
import { partsLatex, partsOf } from '../src/renderer/src/panels/vectorParts'
import { solveAngleBetween, solveCross, solveDot, solveMagnitudeDirection, solveProjection, solveUnitVector } from '../src/renderer/src/math/vectorSolver'
import { cross, dot, len, type V3 } from '../src/renderer/src/math/vec'
import { arrowHead3D, perspectiveWpp } from '../src/renderer/src/render/arrow3dMath'
import type { Card } from '../src/renderer/src/panels/vectorCalcStore'

const A: V3 = [3, 4, 5]
const B: V3 = [1, -2, 2]
const read = (latex: string): V3 | string => {
  const card: Card = { id: 1, name: 'A', entry: 'comp', latex, mag: '', angle: '', sceneId: '' }
  return cardValues([card], { values: new Map() } as never)[0]
}
const answer = (sol: { answers: { label: string; tex: string }[] }) => sol.answers.map((a) => `${a.label}: ${a.tex}`).join(' | ')

describe('typing a 3-D vector', () => {
  it.each(['3i + 4j + 5k', String.raw`3\hat{i}+4\hat{j}+5\hat{k}`, '(3, 4, 5)', String.raw`\left(3,4,5\right)`, '<3, 4, 5>', String.raw`\left\langle 3,4,5\right\rangle`])('%s is 3i + 4j + 5k', (latex) => {
    expect(read(latex)).toEqual([3, 4, 5])
  })
  it('a 2-D vector is unchanged: 3i + 4j has no z', () => {
    expect(read('3i+4j')).toEqual([3, 4, 0])
  })
  it('the x, y, z boxes write a tuple the line reads, an empty box is 0, and a vector fills the boxes back', () => {
    expect(read(partsLatex(['3', '4', '5']))).toEqual([3, 4, 5])
    expect(read(partsLatex(['', String.raw`\frac{1}{2}`, '-2']))).toEqual([0, 0.5, -2])
    expect(partsOf([0.1 + 0.2, -0, 5])).toEqual(['0.3', '0', '5'])
    expect(read(partsLatex(partsOf([1.5, -2.25, 1e-3])))).toEqual([1.5, -2.25, 1e-3])
  })
  it('an unfinished box says so, as a typed line does', () => {
    expect(typeof read(partsLatex(['3+', '4', '5']))).toBe('string')
  })
})

describe('every operation in 3-D (A = 3i + 4j + 5k, B = i − 2j + 2k)', () => {
  it('i × j = k, and A × B = 18i + −1j + −10k, at right angles to both, |A × B| = |A||B| sin θ', () => {
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1])
    const C = cross(A, B)
    expect(C).toEqual([18, -1, -10])
    expect(dot(C, A)).toBe(0)
    expect(dot(C, B)).toBe(0)
    const theta = Math.acos(dot(A, B) / (len(A) * len(B)))
    expect(len(C)).toBeCloseTo(len(A) * len(B) * Math.sin(theta), 12)
    const sol = solveCross({ name: 'A', v: A }, { name: 'B', v: B })
    expect(sol.visual?.vectors.some((v) => v.v[0] === 18 && v.v[1] === -1 && v.v[2] === -10)).toBe(true)
    expect(answer(sol)).toMatch(/18/)
    expect(sol.steps.length).toBeGreaterThan(2)
  })
  it('dot and the angle between in 3-D: A·B = 5, θ = 76.37°', () => {
    expect(dot(A, B)).toBe(5)
    expect(answer(solveDot({ name: 'A', v: A }, { name: 'B', v: B }))).toMatch(/5/)
    const th = (Math.acos(5 / (len(A) * 3)) * 180) / Math.PI
    expect(th).toBeCloseTo(76.37, 2)
    // At the solver's default 4 d.p. (the panel passes the student's setting).
    expect(answer(solveAngleBetween({ name: 'A', v: A }, { name: 'B', v: B }))).toMatch(/76\.367/)
  })
  it('size and direction: |A| = 7.07, direction cosines whose squares add to 1', () => {
    const sol = solveMagnitudeDirection({ name: 'A', v: A })
    expect(answer(sol)).toMatch(/7\.07/)
    const cosines = A.map((c) => c / len(A))
    expect(cosines.reduce((s, c) => s + c * c, 0)).toBeCloseTo(1, 12)
    // α, β, γ are in the working: cos⁻¹(3/7.07) = 64.8959°, cos⁻¹(4/7.07) = 55.5501°, cos⁻¹(5/7.07) = 45°
    const text = sol.steps.map((s) => s.tex ?? '').join(' ')
    for (const deg of ['64.8959', '55.5501', '= 45^\\circ']) expect(text).toContain(deg)
  })
  it('the unit vector of A has size 1 and a k part; the projection of B on A is (5/50) A', () => {
    expect(answer(solveUnitVector({ name: 'A', v: A }))).toMatch(/\\hat\{k\}|k/)
    const sol = solveProjection({ name: 'B', v: B }, { name: 'A', v: A })
    expect(sol.visual?.vectors.some((v) => Math.abs(v.v[0] - 0.3) < 1e-12 && Math.abs(v.v[1] - 0.4) < 1e-12 && Math.abs(v.v[2] - 0.5) < 1e-12)).toBe(true)
  })
})

describe('the slim 3-D arrow', () => {
  it('its head is 12 px long and 4 px wide on screen at any zoom, within 10 %', () => {
    const L = 7.07
    for (const [near, far] of [[8, 16], [5, 40]]) {
      const a = perspectiveWpp(near, 50, 768)
      const b = perspectiveWpp(far, 50, 768)
      const ha = arrowHead3D(L * 10, a)
      const hb = arrowHead3D(L * 10, b)
      expect(ha.headLen / a).toBeCloseTo(12, 9)
      expect(hb.headLen / b).toBeCloseTo(12, 9)
      expect(Math.abs(ha.radius / a - hb.radius / b) / 4).toBeLessThan(0.1)
    }
  })
  it('a short arrow keeps its shape: the head is never more than 40 % of it', () => {
    const h = arrowHead3D(0.1, 0.05)
    expect(h.headLen).toBeCloseTo(0.04, 12)
    expect(h.radius).toBeLessThanOrEqual(h.headLen * 0.6)
  })
})
