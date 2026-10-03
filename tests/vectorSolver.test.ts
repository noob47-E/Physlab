// The step-by-step vector solutions: every line must survive KaTeX, and the numbers must be the
// textbook's. A single-backslash "\theta" inside a template literal is a TAB and "heta" — it
// rendered as garbage for a whole version and nothing in the suite noticed, so the real renderer
// is run over the real output of every solver here.

import { beforeEach, describe, expect, it } from 'vitest'
import katex from 'katex'
import * as THREE from 'three/webgpu'
import * as VS from '../src/renderer/src/math/vectorSolver'
import { fmtIJK, setNotation, shownValue, type MeasureSettings } from '../src/renderer/src/math/format'
import { fromPolar, toRad } from '../src/renderer/src/math/vec'
import { pickAt } from '../src/renderer/src/render/picking'
import type { Computed, ObjId, SceneObject } from '../src/renderer/src/core/types'
import { isValidName } from '../src/renderer/src/core/naming'
import { math } from '../src/renderer/src/math/expr'
import { resetGlobals } from './helpers/globals'

const renders = (tex: string, where: string): void => {
  expect(() => katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: 'ignore' }), `${where}: ${tex}`).not.toThrow()
}

/** Every piece of LaTeX in one solution. */
function rendersAll(sol: VS.Solution, where: string): void {
  sol.steps.forEach((s, i) => {
    if (s.tex) renders(s.tex, `${where} step ${i + 1}`)
    // A backslash escape that went wrong leaves a control character behind.
    expect(s.tex ?? '', `${where} step ${i + 1} has a control character`).not.toMatch(/[\t\f\b\v]/)
    expect(s.text ?? '', `${where} step ${i + 1} text leaks LaTeX`).not.toMatch(/\\[a-z]+\{|_\{/)
  })
  sol.answers.forEach((a) => renders(a.tex, `${where} answer "${a.label}"`))
}

/** Every number written in a solution, as plain magnitudes. */
function numbersIn(sol: VS.Solution): number[] {
  const out: number[] = []
  const all = [...sol.steps.map((s) => s.tex ?? ''), ...sol.answers.map((a) => a.tex)].join(' ')
  for (const m of all.replace(/−/g, '-').matchAll(/\d+(?:\.\d+)?/g)) out.push(Number(m[0]))
  return out
}
const shows = (sol: VS.Solution, n: number, tol = 0.01) => numbersIn(sol).some((x) => Math.abs(x - n) <= tol)

const A: VS.NamedVec = { name: 'A', v: [3, 4, 0] }
const B: VS.NamedVec = { name: 'B', v: [2, -1, 0] }
const A3: VS.NamedVec = { name: 'A', v: [3, 4, 5] }
const B3: VS.NamedVec = { name: 'B', v: [-1, 2, 2] }
const vAB: VS.NamedVec = { name: 'v_{AB}', v: [1, 2, 0] }

beforeEach(resetGlobals)

describe('every solver renders through KaTeX', () => {
  const cases: [string, () => VS.Solution][] = [
    ['components', () => VS.solveComponents('F', 10, 30, 'N')],
    ['components, no unit, negative angle', () => VS.solveComponents('A', 5, -120)],
    ['magnitude & direction 2D', () => VS.solveMagnitudeDirection(A)],
    ['magnitude & direction 2D, 2nd quadrant', () => VS.solveMagnitudeDirection({ name: 'A', v: [-3, 4, 0] })],
    ['magnitude & direction 2D, on the y axis', () => VS.solveMagnitudeDirection({ name: 'A', v: [0, -2, 0] })],
    ['magnitude & direction 2D, zero vector', () => VS.solveMagnitudeDirection({ name: 'A', v: [0, 0, 0] })],
    ['magnitude & direction 3D', () => VS.solveMagnitudeDirection(A3)],
    ['resolve 2D', () => VS.solveResolve(A)],
    ['resolve 3D', () => VS.solveResolve(A3)],
    ['addition', () => VS.solveAddition([A, B, { name: 'C', v: [-1, -1, 0] }])],
    ['addition 3D', () => VS.solveAddition([A3, B3])],
    ['addition by the law of cosines', () => VS.solveAdditionCosineLaw(A, B)],
    ['addition by the law of cosines, obtuse', () => VS.solveAdditionCosineLaw({ name: 'A', v: [1, 0, 0] }, { name: 'B', v: fromPolar(5, toRad(120)) })],
    ['addition by drawing', () => VS.solveAdditionGraphical([A, B])],
    ['addition by drawing, big numbers', () => VS.solveAdditionGraphical([{ name: 'F1', v: [300, 400, 0] }, { name: 'F2', v: [-200, 100, 0] }])],
    ['subtraction', () => VS.solveSubtraction(A, B)],
    ['scalar multiply', () => VS.solveScalarMultiply(-2.5, A)],
    ['unit vector', () => VS.solveUnitVector(A3)],
    ['dot', () => VS.solveDot(A, B)],
    ['dot with a card named B and a subscripted card', () => VS.solveDot({ name: 'B', v: [1, 2, 0] }, vAB)],
    ['angle between', () => VS.solveAngleBetween(A3, B3)],
    ['angle between parallel', () => VS.solveAngleBetween(A, { name: 'B', v: [6, 8, 0] })],
    ['cross', () => VS.solveCross(A3, B3)],
    ['projection', () => VS.solveProjection(B, A)],
    ['two forces', () => VS.solveTwoForces(5, 5, 120)],
    ['equilibrium', () => VS.solveEquilibrium([A, B])],
    ['torque', () => VS.solveTorque([0.5, 0, 0], [0, 20, 0])],
    ['magnetic force', () => VS.solveMagneticForce(1.6e-19, [1, 0, 0], [0, 0, 1])],
    ['magnetic force on an electron', () => VS.solveMagneticForce(-1.6e-19, [2e6, 0, 0], [0, 0.5, 0])],
    ['work', () => VS.solveWork(fromPolar(20, toRad(30)), [5, 0, 0])],
    ['relative velocity (double subscript)', () => VS.solveSubtraction({ name: 'v_A', v: [3, 0, 0] }, { name: 'v_B', v: [0, 4, 0] }, 'v_{AB}')],
    ['relative velocity of cards A and B', () => VS.solveRelativeVelocity(A, B)],
    ['relative velocity of cards v_1 and v_2', () => VS.solveRelativeVelocity({ name: 'v_1', v: [3, 0, 0] }, { name: 'v_2', v: [0, 4, 0] })],
    ['relative velocity of a four-letter card', () => VS.solveRelativeVelocity({ name: 'Boat', v: [3, 0, 0] }, { name: 'v_r', v: [0, 4, 0] })],
    ['projection onto a zero vector', () => VS.solveProjection(B, { name: 'O', v: [0, 0, 0] })],
    // The edge cases below have their own tests further down; here they only have to render.
    ['unit vector of the zero vector', () => VS.solveUnitVector({ name: 'A', v: [0, 0, 0] })],
    ['unit vector of a tiny vector', () => VS.solveUnitVector({ name: 'A', v: [1e-20, 0, 0] })],
    ['scalar multiply by a tiny k', () => VS.solveScalarMultiply(1.6e-19, A)],
    ['dot of a small pair at 45°', () => VS.solveDot({ name: 'A', v: [1e-5, 0, 0] }, { name: 'B', v: fromPolar(1e-5, toRad(45)) })],
    ['cross of a small perpendicular pair', () => VS.solveCross({ name: 'A', v: [1e-5, 0, 0] }, { name: 'B', v: [0, 1e-5, 0] })],
    ['cross with a zero vector', () => VS.solveCross({ name: 'O', v: [0, 0, 0] }, A)],
    // Round 2: a tiny REAL answer is written in scientific form, and every line of it must still render.
    ['dot of a tiny real pair (A·B = 7×10⁻¹⁵)', () => VS.solveDot({ name: 'A', v: [1e-7, 0, 0] }, { name: 'B', v: fromPolar(1e-7, toRad(45)) })],
    ['work of a tiny real pair (W = 1×10⁻¹⁹ J)', () => VS.solveWork([1e-9, 0, 0], [1e-10, 0, 0])],
    ['projection of a tiny real pair', () => VS.solveProjection({ name: 'B', v: fromPolar(1e-7, toRad(45)) }, { name: 'A', v: [1e-7, 0, 0] })],
    ['projection of a perpendicular pair, 10⁶ long', () => VS.solveProjection({ name: 'B', v: fromPolar(1e6, toRad(120)) }, { name: 'A', v: fromPolar(1e6, toRad(30)) })],
    ['magnitude & direction of 1.6×10⁻¹⁹ î', () => VS.solveMagnitudeDirection({ name: 'A', v: [1.6e-19, 0, 0] })],
    ['magnitude & direction of a tiny 3D vector', () => VS.solveMagnitudeDirection({ name: 'A', v: [1e-19, 2e-19, 2e-19] })],
    ['scalar multiply by −1.6×10⁻¹⁹', () => VS.solveScalarMultiply(-1.6e-19, A)],
    ['components of 1.6×10⁻¹⁹ N at 30°', () => VS.solveComponents('F', 1.6e-19, 30, 'N')],
    ['resolve of a tiny plane vector', () => VS.solveResolve({ name: 'A', v: fromPolar(1.6e-19, toRad(30)) })],
    ['resolve of a tiny 3D vector', () => VS.solveResolve({ name: 'A', v: [1e-19, 2e-19, 2e-19] })]
  ]
  for (const [name, make] of cases) {
    it(name, () => {
      const sol = make()
      expect(sol.steps.length).toBeGreaterThan(0)
      expect(sol.answers.length).toBeGreaterThan(0)
      rendersAll(sol, name)
    })
  }

  it('renders every step for a tiny and a huge pair of vectors (a number in scientific form is bracketed before it is squared)', () => {
    // "3.16\times 10^{-7}^2" is a double superscript KaTeX refuses; it came from squaring a size
    // written in scientific form without brackets.
    const settings: MeasureSettings[] = [
      { decimals: 2, precisionMode: 'dp', unit: 'unit', unitPerSquare: 1, angleUnit: 'deg' },
      { decimals: 3, precisionMode: 'sf', unit: 'unit', unitPerSquare: 1, angleUnit: 'rad' }
    ]
    const pairs: [string, number[], number[]][] = [
      ['tiny', [1e-7, 3e-7, 0], [2e-7, -1e-7, 0]],
      ['huge', [3e10, 4e10, 0], [-2e10, 5e10, 0]],
      ['tiny 3D', [1e-7, 3e-7, 2e-7], [2e-7, -1e-7, 1e-7]]
    ]
    for (const s of settings) {
      for (const [label, a, b] of pairs) {
        const A = { name: 'A', v: a as [number, number, number] }
        const B = { name: 'B', v: b as [number, number, number] }
        const m = Math.hypot(a[0], a[1], a[2])
        const sols: [string, VS.Solution][] = [
          ['magnitude', VS.solveMagnitudeDirection(A, s)],
          ['add', VS.solveAddition([A, B], 'R', s)],
          ['law of cosines', VS.solveAdditionCosineLaw(A, B, 'R', s)],
          ['drawing', VS.solveAdditionGraphical([A, B], 'R', s)],
          ['scalar', VS.solveScalarMultiply(-1.5, A, 'R', s)],
          ['unit', VS.solveUnitVector(A, s)],
          ['dot', VS.solveDot(A, B, s)],
          ['cross', VS.solveCross(A, B, 'C', s)],
          ['projection', VS.solveProjection(B, A, s)],
          ['two forces', VS.solveTwoForces(m, m / 2, 71, 'N', s)],
          ['magnetic', VS.solveMagneticForce(-1.6e-19, A.v, B.v, s)]
        ]
        for (const [name, sol] of sols) rendersAll(sol, `${label} ${name} (${s.precisionMode})`)
      }
    }
  })

  it('renders in radians, significant figures and column notation too', () => {
    const rad: MeasureSettings = { decimals: 3, precisionMode: 'sf', unit: 'm', unitPerSquare: 1, angleUnit: 'rad' }
    const dp2: MeasureSettings = { ...rad, precisionMode: 'dp', decimals: 2 }
    rendersAll(VS.solveMagnitudeDirection(A, rad), 'rad')
    rendersAll(VS.solveAdditionCosineLaw(A, B, 'R', dp2), 'rad 2 d.p.')
    setNotation({ components: 'column' })
    rendersAll(VS.solveAddition([A, B]), 'column')
    setNotation({ components: 'polar', direction: 'bearing' })
    rendersAll(VS.solveSubtraction(A, B), 'polar + bearing')
    // The direction in polar notation follows the scene's unit and precision like everything
    // else: in radians at 3 s.f. the answer card read "5.66 ∠ 45°" directly above "θ = 0.785 rad".
    setNotation({ components: 'polar', direction: 'standard' })
    const polar = VS.solveAddition([{ name: 'A', v: [4, 0, 0] }, { name: 'B', v: [0, 4, 0] }], 'R', rad)
    expect(polar.answers[0].tex).toBe('5.66\\,\\angle\\,0.785\\,\\text{rad}')
    expect(VS.solveAddition([{ name: 'A', v: [4, 0, 0] }, { name: 'B', v: [0, 4, 0] }], 'R', dp2).answers[0].tex).toBe('5.66\\,\\angle\\,0.79\\,\\text{rad}')
    const deg3: MeasureSettings = { ...rad, angleUnit: 'deg' }
    expect(VS.solveAddition([{ name: 'A', v: [4, 0, 0] }, { name: 'B', v: [0, 4, 0] }], 'R', deg3).answers[0].tex).toBe('5.66\\,\\angle\\,45.0^\\circ')
    setNotation({ direction: 'bearing' })
    expect(VS.solveAddition([{ name: 'A', v: [4, 0, 0] }, { name: 'B', v: [0, 4.001, 0] }], 'R', deg3).answers[0].tex).toBe('5.66\\,\\angle\\,\\text{N 45.0° E}')
    expect(fmtIJK([4, 4.001, 0], deg3)).toBe('5.66 ∠ N 45.0° E')
    // Bearings are degrees; a scene in radians writes the direction in radians.
    expect(fmtIJK([4, 4, 0], rad)).toBe('5.66 ∠ 0.785 rad')
    // The Measurements panel's bare number of decimals still means degrees.
    setNotation({ direction: 'standard' })
    expect(fmtIJK([4, 4, 0], 2)).toBe('5.66 ∠ 45°')
  })
})

describe('textbook values', () => {
  it('law of cosines: A = 1∠0°, B = 5∠120° gives R = √21 at 109.11° from A, not the arcsine 70.89°', () => {
    const sol = VS.solveAdditionCosineLaw({ name: 'A', v: [1, 0, 0] }, { name: 'B', v: fromPolar(5, toRad(120)) })
    expect(sol.answers[0].tex).toBe('4.5826')
    expect(sol.answers[1].tex).toBe('109.1066^\\circ')
    // The working shows why the arcsine is not the answer.
    expect(sol.steps.some((s) => /obtuse/.test(s.text ?? ''))).toBe(true)
  })

  it('law of cosines keeps the acute answer when it is right', () => {
    const sol = VS.solveAdditionCosineLaw({ name: 'A', v: [4, 0, 0] }, { name: 'B', v: [0, 3, 0] })
    expect(sol.answers[0].tex).toBe('5')
    expect(sol.answers[1].tex).toBe('36.8699^\\circ')
  })

  it('3î + 4ĵ + 5k̂ has components 3, 4, 5 and magnitude √50', () => {
    const sol = VS.solveResolve(A3)
    expect(sol.answers.slice(0, 3).map((a) => [a.label, a.tex])).toEqual([
      ['Ax', '3'],
      ['Ay', '4'],
      ['Az', '5']
    ])
    expect(sol.answers.find((a) => a.label === '|A|')?.tex).toBe('7.0711')
    expect(shows(sol, 4.24)).toBe(false)
  })

  it('a plane vector is still resolved from its size and angle', () => {
    const sol = VS.solveResolve(A)
    expect(sol.answers.map((a) => a.tex)).toEqual(['3', '4'])
    expect(shows(sol, 53.13)).toBe(true)
  })

  it('magnitude and direction: 3î + 4ĵ is 5 at 53.13°; −3î + 4ĵ is in the 2nd quadrant', () => {
    expect(VS.solveMagnitudeDirection(A).answers.map((a) => a.tex)).toEqual(['5', '53.1301^\\circ'])
    const q2 = VS.solveMagnitudeDirection({ name: 'A', v: [-3, 4, 0] })
    expect(q2.answers[1].tex).toBe('126.8699^\\circ')
    expect(q2.steps.some((s) => /2nd quadrant/.test(s.text ?? ''))).toBe(true)
  })

  it('the angle between two vectors is its own solution', () => {
    const sol = VS.solveAngleBetween({ name: 'A', v: [1, 0, 0] }, { name: 'B', v: [0, 1, 0] })
    expect(sol.title).toBe('Angle between A and B')
    expect(sol.answers).toEqual([{ label: 'θ', tex: '90^\\circ' }])
    expect(sol.steps.some((s) => /perpendicular/.test(s.text ?? ''))).toBe(true)
  })

  it('dot product spells the components with the real names, whatever the cards are called', () => {
    const sol = VS.solveDot({ name: 'B', v: [1, 2, 0] }, { name: 'C', v: [3, 4, 0] })
    // A plane pair writes no z-terms: "+ (0)(0)" added nothing to the working (Fix 4).
    expect(sol.steps[1].tex).toMatch(/B_\{x\}C_\{x\} \+ B_\{y\}C_\{y\}$/)
    expect(sol.steps[2].tex).toBe('= (1)(3) + (2)(4) = 11')
    const solid = VS.solveDot({ name: 'B', v: [1, 2, 2] }, { name: 'C', v: [3, 4, 1] })
    expect(solid.steps[1].tex).toContain('B_{x}C_{x} + B_{y}C_{y} + B_{z}C_{z}')
    expect(sol.answers[0].tex).toBe('11')
    expect(sol.steps.some((s) => (s.text ?? '').includes('projection of C on B'))).toBe(true)
  })

  it('torque answers carry N m', () => {
    const sol = VS.solveTorque([0.5, 0, 0], [0, 20, 0])
    expect(sol.answers[0].tex).toMatch(/10\\hat\{k\}\\,\\text\{N m\}$/)
    expect(sol.answers[1].tex).toBe('10\\,\\text{N m}')
  })

  it('a negative charge turns the magnetic force round, and the drawn arrow is scaled with the true size noted', () => {
    const sol = VS.solveMagneticForce(-1.6e-19, [1, 0, 0], [0, 1, 0])
    const F = sol.visual!.vectors.find((v) => v.name === 'F')!
    expect(F.v[2]).toBeCloseTo(-1.6e-19, 25)
    expect(F.drawn![2]).toBeCloseTo(-1, 9)
    expect(F.note).toMatch(/not to scale/)
    expect(sol.answers[0].tex).toBe('\\left(-1.6\\hat{k}\\right)\\times 10^{-19}\\,\\text{N}')
    expect(sol.answers[1].tex).toBe('1.6\\times 10^{-19}\\,\\text{N}')
    // A force the same size as its inputs is drawn as it is.
    const plain = VS.solveMagneticForce(1, [1, 0, 0], [0, 1, 0])
    expect(plain.visual!.vectors.find((v) => v.name === 'F')!.note).toBeUndefined()
  })

  it('a tiny force whose mantissa rounds up is 1×10⁻¹⁸, never 10×10⁻¹⁹', () => {
    const sol = VS.solveMagneticForce(9.99999e-20, [10, 0, 0], [0, 1, 0])
    expect(sol.answers[0].tex).toBe('\\left(1\\hat{k}\\right)\\times 10^{-18}\\,\\text{N}')
    expect(sol.answers[1].tex).toBe('1\\times 10^{-18}\\,\\text{N}')
    expect(sol.visual!.vectors.find((v) => v.name === 'F')!.note).toContain('|F| = 1\u00a0×\u00a010⁻¹⁸ N')
    const sf: MeasureSettings = { decimals: 3, precisionMode: 'sf', unit: 'unit', unitPerSquare: 1, angleUnit: 'deg' }
    expect(VS.solveMagneticForce(9.99999e-20, [10, 0, 0], [0, 1, 0], sf).answers[1].tex).toBe('1.00\\times 10^{-18}\\,\\text{N}')
    // The charge in the sentence takes the same form.
    expect(VS.solveMagneticForce(9.99999e-20, [10, 0, 0], [0, 1, 0]).steps.map((s) => s.text ?? '').join(' ')).toContain('q = 1\u00a0×\u00a010⁻¹⁹ C')
  })

  it('the drawing method picks a 1-2-5 scale so the longest vector is about ten squares', () => {
    expect(VS.drawingScale(5)).toBe(0.5)
    expect(VS.drawingScale(50)).toBe(5)
    expect(VS.drawingScale(1)).toBe(0.1)
    expect(VS.drawingScale(700)).toBe(50)
    const sol = VS.solveAdditionGraphical([{ name: 'F1', v: [300, 400, 0] }, { name: 'F2', v: [-200, 100, 0] }])
    expect(sol.steps[0].text).toContain('1 grid square stands for 50 units')
    expect(sol.steps[0].text).toContain('is 10 squares')
  })

  it('honours the precision and angle settings of the scene', () => {
    const s: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'unit', unitPerSquare: 1, angleUnit: 'rad' }
    const sol = VS.solveMagnitudeDirection(A, s)
    expect(sol.answers[1].tex).toBe('0.93\\,\\text{rad}')
    const sf: MeasureSettings = { ...s, precisionMode: 'sf', decimals: 3, angleUnit: 'deg' }
    expect(VS.solveMagnitudeDirection({ name: 'A', v: [1, 1, 0] }, sf).answers).toEqual([
      { label: '|A|', tex: '1.41' },
      { label: 'θ', tex: '45.0^\\circ' }
    ])
    // Components follow the same precision as the magnitudes: 3 s.f., not 3 d.p.
    expect(VS.solveAddition([{ name: 'A', v: [1.23456, 0, 0] }, { name: 'B', v: [0, 2.5, 0] }], 'R', sf).answers[0].tex).toBe('1.23\\hat{i} + 2.50\\hat{j}')
    // Sentences about 180° follow the angle unit too.
    const cos = VS.solveAdditionCosineLaw({ name: 'A', v: [1, 0, 0] }, { name: 'B', v: fromPolar(5, toRad(120)) }, 'R', s)
    expect(cos.steps[1].text).toContain('3.14 rad − θ')
    expect(VS.solveScalarMultiply(-2, A, 'R', s).steps[2].text).toContain('turned through 3.14 rad')
    // Bearings apply to the direction of the answer, never to the angle between two vectors.
    setNotation({ direction: 'bearing' })
    expect(VS.solveMagnitudeDirection(A, { ...s, angleUnit: 'deg' }).answers[1].tex).toBe('\\text{N 36.87° E}')
    expect(VS.solveDot(A, { name: 'B', v: [4, -3, 0] }, { ...s, angleUnit: 'deg' }).answers[1].tex).toBe('90^\\circ')
  })

  it('a vector on an axis is said to lie on it, not in a quadrant', () => {
    const left = VS.solveMagnitudeDirection({ name: 'A', v: [-3, 0, 0] })
    expect(left.steps.map((st) => st.text ?? '').join(' ')).toContain('straight along the −x axis')
    expect(left.steps.map((st) => st.text ?? '').join(' ')).not.toContain('quadrant')
    expect(left.answers[1].tex).toBe('180^\\circ')
    expect(VS.solveMagnitudeDirection({ name: 'A', v: [3, 0, 0] }).answers[1].tex).toBe('0^\\circ')
  })

  it('a zero vector is said plainly instead of printing "undefined"', () => {
    const O: VS.NamedVec = { name: 'O', v: [0, 0, 0] }
    for (const [name, sol] of [
      ['dot', VS.solveDot(A, O)],
      ['angle', VS.solveAngleBetween(O, A)],
      ['work', VS.solveWork([0, 0, 0], [1, 2, 0])],
      ['cosine law', VS.solveAdditionCosineLaw(A, O)],
      ['scale by 0', VS.solveScalarMultiply(0, A)],
      ['magnitude', VS.solveMagnitudeDirection(O)],
      ['projection', VS.solveProjection(A, O)]
    ] as [string, VS.Solution][]) {
      rendersAll(sol, name)
      const text = sol.steps.map((st) => st.text ?? '').join(' ')
      const tex = [...sol.steps.map((st) => st.tex ?? ''), ...sol.answers.map((a) => a.tex)].join(' ')
      // "its direction is undefined" is a sentence; "cos⁻¹(undefined) = undefined°" is not.
      expect(text, name).not.toMatch(/undefined[°(]|= undefined|\(undefined\)/)
      expect(tex, name).not.toMatch(/undefined\^|\(\text\{undefined\}\)|[0-9]\s*\times\s*\text\{undefined\}/)
      expect(text, name).not.toContain('perpendicular')
    }
    expect(VS.solveDot(A, O).steps.map((st) => st.text).join(' ')).toContain('O has zero length')
    expect(VS.solveDot(A, O).answers[1].tex).toBe('\\text{undefined}')
    expect(VS.solveScalarMultiply(0, A).steps[2].text).toContain('k is zero')
    // Projecting onto the zero vector divided by |O| = 0 and printed "undefined" three times.
    const proj = VS.solveProjection(A, O)
    expect(proj.steps[0].text).toBe('O has zero length, so there is no direction to project A onto.')
    expect(proj.answers.map((a) => a.tex)).toEqual(['\\text{undefined}', '\\text{undefined}'])
    expect(JSON.stringify(proj)).not.toMatch(/[^{]undefined/)
    expect(VS.solveProjection(A, B).answers[0].tex).toBe('0.8944')
    setNotation({ direction: 'bearing' })
    expect(VS.solveMagnitudeDirection(O).answers[1].tex).toBe('\\text{undefined}')
    setNotation({ direction: 'standard' })
  })

  it('the equilibrant is equal and opposite to the resultant', () => {
    const sol = VS.solveEquilibrium([A, B])
    expect(sol.answers[0].tex).toBe('-5\\hat{i} - 3\\hat{j}')
  })
})

describe('names', () => {
  it('sub_ puts a component subscript inside an existing one', () => {
    expect(VS.sub_('A', 'x')).toBe('A_{x}')
    expect(VS.sub_('v_{AB}', 'x')).toBe('v_{AB,x}')
    expect(VS.sub_('v_A', 'y')).toBe('v_{A,y}')
    expect(VS.sub_('F1', 'x')).toBe('F_{1x}')
    renders(VS.sub_('v_{AB}', 'x'), 'subscript')
  })

  it('relative velocity names the velocities from the cards without a double subscript', () => {
    const plainCards = VS.solveRelativeVelocity(A, B)
    expect(plainCards.title).toBe('Velocity of A relative to B')
    expect(plainCards.steps[0].tex).toContain('\\vec{v_{A}} - \\vec{v_{B}}')
    expect(plainCards.visual!.vectors.find((v) => v.role === 'result')!.name).toBe('v_{AB}')
    // Cards already called v_1 and v_2 gave \vec{v_v_1}, a double subscript KaTeX paints red.
    const numbered = VS.solveRelativeVelocity({ name: 'v_1', v: [3, 0, 0] }, { name: 'v_2', v: [0, 4, 0] })
    expect(numbered.steps[0].tex).toContain('\\vec{v_1} - \\vec{v_2}')
    expect(numbered.visual!.vectors.find((v) => v.role === 'result')!.name).toBe('v_{12}')
    expect(numbered.title).toBe('Velocity of v_1 relative to v_2')
    // A longer card name is braced, or KaTeX subscripts its first letter only.
    expect(VS.solveRelativeVelocity({ name: 'Boat', v: [3, 0, 0] }, { name: 'v_r', v: [0, 4, 0] }).steps[0].tex).toContain('\\vec{v_{Boat}} - \\vec{v_r}')
  })

  it('scene names are ones mathjs can read back', () => {
    expect(VS.sceneName('R')).toBe('R')
    expect(VS.sceneName('−B')).toBe('negB')
    expect(VS.sceneName('-B')).toBe('negB')
    expect(VS.sceneName('â')).toBe('ahat')
    expect(VS.sceneName('v_{AB}')).toBe('v_AB')
    expect(VS.sceneName('v×B')).toBe('vxB')
    // A Greek letter is an identifier to mathjs and a valid scene name; it used to be "tau".
    expect(VS.sceneName('τ')).toBe('τ')
    expect(VS.sceneName('θ_1')).toBe('θ_1')
    expect(VS.sceneName('(-B)')).toBe('B')
    expect(VS.sceneName('2A')).toBe('v2A')
    expect(VS.sceneName('')).toBe('v')
    for (const n of ['negB', 'ahat', 'v_AB', 'vxB', 'τ', 'v2A']) {
      expect(isValidName(n), n).toBe(true)
      expect(math.evaluate(`${n} + 1`, { [n]: 2 }), n).toBe(3)
    }
  })

  it('the drawing labels an arrow by the name in the working, not its scene name', () => {
    expect(VS.sceneLabel('−B')).toBe('−B')
    expect(VS.sceneLabel('â')).toBe('â')
    expect(VS.sceneLabel('v×B')).toBe('v×B')
    // Names the scene can hold as they are need no separate label.
    expect(VS.sceneLabel('R')).toBeUndefined()
    expect(VS.sceneLabel('τ')).toBeUndefined()
    expect(VS.sceneLabel('v_{AB}')).toBeUndefined()
    const torque = VS.planDrawing(VS.solveTorque([0.5, 0, 0], [0, 20, 0]).visual!)
    const tau = torque.items.find((it) => it.kind === 'arrow' && it.role === 'result')
    expect(tau && tau.kind === 'arrow' && tau.name).toBe('τ')
    expect(tau && tau.kind === 'arrow' && tau.label).toBeUndefined()
    const sub = VS.planDrawing(VS.solveSubtraction(A, B).visual!)
    const helper = sub.items.find((it) => it.kind === 'arrow' && it.name === 'negB')
    expect(helper && helper.kind === 'arrow' && helper.label).toBe('−B')
    const unit = VS.planDrawing(VS.solveUnitVector(A).visual!)
    // The solver writes â as a plus a combining hat, and that is what the label carries.
    expect(unit.items.map((it) => (it.kind === 'arrow' ? it.label : undefined))).toContain('â')
  })

  it('a card cannot be renamed to i, j, k, an empty name or another card’s name', () => {
    expect(VS.safeCardName('C', 'A', ['B'])).toBe('C')
    expect(VS.safeCardName('i', 'A', ['B'])).toBe('A')
    expect(VS.safeCardName('k', 'A', ['B'])).toBe('A')
    expect(VS.safeCardName('B', 'A', ['B'])).toBe('A')
    expect(VS.safeCardName('', 'A', ['B'])).toBe('A')
    expect(VS.safeCardName('2', 'A', ['B'])).toBe('A')
    expect(VS.safeCardName('v−1!', 'A', [])).toBe('v1')
    expect(VS.safeCardName('Force', 'A', [])).toBe('Forc')
    // One subscript is fine; a trailing or doubled underscore is \vec{A_}, which KaTeX paints red.
    expect(VS.safeCardName('v_A', 'A', [])).toBe('v_A')
    expect(VS.safeCardName('F_1', 'A', [])).toBe('F_1')
    expect(VS.safeCardName('A_', 'A', [])).toBe('A')
    expect(VS.safeCardName('v__A', 'A', [])).toBe('A')
    expect(VS.safeCardName('v_A_', 'v_A', [])).toBe('v_A')
    for (const n of ['v_A', 'F_1']) rendersAll(VS.solveAddition([{ name: n, v: [1, 2, 0] }, B]), n)
  })
})

describe('laying out a drawing', () => {
  it('a force drawn to a stand-in length is a helper with its true size written at its head', () => {
    const sol = VS.solveMagneticForce(-1.6e-19, [1, 0, 0], [0, 1, 0])
    const plan = VS.planDrawing(sol.visual!)
    const F = plan.items.find((it) => it.kind === 'arrow' && it.name === 'F')
    expect(F && F.kind === 'arrow' && F.auxiliary).toBe(true)
    expect(F && F.kind === 'arrow' && F.labelMode).toBe('name')
    expect(F && F.kind === 'arrow' && F.comp.map((c) => c + 0)).toEqual([0, 0, -1])
    const note = plan.items.find((it) => it.kind === 'note')
    expect(note && note.kind === 'note' && note.text).toMatch(/\|F\| = 1\.6\u00a0×\u00a010⁻¹⁹ N — arrow not to scale/)
    expect(note && note.kind === 'note' && note.at.map((c) => c + 0)).toEqual([0, 0, -1])
    // Nothing drawn to a stand-in length is left selected as if it were the answer.
    expect(plan.select).toBe('B')
    expect(plan.is3D).toBe(true)
    // A force the size of its inputs is an ordinary answer arrow.
    const plain = VS.planDrawing(VS.solveMagneticForce(1, [1, 0, 0], [0, 1, 0]).visual!)
    expect(plain.items.filter((it) => it.kind === 'note')).toHaveLength(0)
    expect(plain.select).toBe('F')
  })

  it('draws every non-input vector from its own components, in the solution’s own layout', () => {
    const sub = VS.planDrawing(VS.solveSubtraction(A, B).visual!)
    const R = sub.items.find((it) => it.kind === 'arrow' && it.name === 'R')
    expect(R && R.kind === 'arrow' && R.comp).toEqual([1, 5, 0])
    expect(R && R.kind === 'arrow' && R.auxiliary).toBe(false)
    const helper = sub.items.find((it) => it.kind === 'arrow' && it.name === 'negB')
    expect(helper && helper.kind === 'arrow' && helper.auxiliary).toBe(true)
    expect(helper && helper.kind === 'arrow' && helper.tail).toEqual([3, 4, 0])
    expect(sub.select).toBe('R')
    // The head-to-tail layout chains the inputs; a chosen style overrides the solution's own.
    const chain = VS.planDrawing(VS.solveSubtraction(A, B).visual!, 'head-to-tail')
    const Bh = chain.items.find((it) => it.kind === 'arrow' && it.name === 'B')
    expect(Bh && Bh.kind === 'arrow' && Bh.tail).toEqual([3, 4, 0])
    // The parallelogram adds the two dashed sides and falls back when there are not two inputs.
    const para = VS.planDrawing(VS.solveAddition([A, B]).visual!, 'parallelogram')
    expect(para.items.filter((it) => it.kind === 'ghost').map((it) => it.kind === 'ghost' && [it.of, it.atHeadOf])).toEqual([['B', 'A'], ['A', 'B']])
    const three = VS.planDrawing(VS.solveAddition([A, B, { name: 'C', v: [0, 1, 0] }]).visual!, 'parallelogram')
    expect(three.items.some((it) => it.kind === 'ghost')).toBe(false)
  })
})

describe('drawing the angle of a vector', () => {
  it('sweeps the short way round from the +x axis', () => {
    const q1 = VS.headingArc(toRad(60))
    expect(q1.from).toBe(0)
    expect(q1.to).toBeCloseTo(toRad(60))
    expect(q1.mid).toBeCloseTo(toRad(30))
    const q4 = VS.headingArc(toRad(300))
    expect(q4.from).toBeCloseTo(-toRad(60))
    expect(q4.to).toBe(0)
    expect(q4.mid).toBeCloseTo(-toRad(30))
    expect(VS.headingArc(Math.PI).to).toBeCloseTo(Math.PI)
  })

  it('a result far smaller or larger than its inputs is drawn at the reference length', () => {
    expect(VS.displayVector([0, 0, 1.6e-19], 1)).toEqual([0, 0, 1])
    expect(VS.displayVector([3, 4, 0], 1)).toEqual([3, 4, 0])
    expect(VS.displayVector([0, 0, 0], 1)).toEqual([0, 0, 0])
    const big = VS.displayVector([3000, 4000, 0], 5)
    expect(big[0]).toBeCloseTo(3)
    expect(big[1]).toBeCloseTo(4)
  })
})

describe('picking a vector by its ends', () => {
  /** A 200 px square view of the region −10..10, so 1 unit is 10 px and the origin is at (100, 100). */
  function view(comp: [number, number, number] = [6, 0, 0]) {
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -100, 100)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    const id = 'v1' as ObjId
    const obj = { id, type: 'vector', name: 'A', visible: true, locked: false, color: '', showLabel: true, def: { kind: 'free', tail: [0, 0, 0], comp } } as unknown as SceneObject
    const c = { type: 'vector', tail: [0, 0, 0], comp } as unknown as Computed
    return { camera, size: { width: 200, height: 200 }, objects: { [id]: obj }, order: [id], ev: { values: new Map([[id, c]]) } as never }
  }

  it('the nearer end wins on a short arrow', () => {
    const ctx = view()
    // A 60 px arrow from (100,100) to (160,100).
    expect(pickAt(ctx, 103, 100)?.part).toBe('tail')
    expect(pickAt(ctx, 157, 100)?.part).toBe('head')
    expect(pickAt(ctx, 130, 100)?.part).toBe('body')
    // A 20 px arrow: 9 px from the tail and 11 px from the head, both within reach, the tail is nearer.
    const short = view([2, 0, 0])
    expect(pickAt(short, 109, 100)?.part).toBe('tail')
    expect(pickAt(short, 111, 100)?.part).toBe('head')
  })
})

/** The numerator and denominator of every \frac in a line, read with their braces balanced. */
function fractions(tex: string): [string, string][] {
  const group = (open: number): [string, number] => {
    let depth = 0
    for (let i = open; i < tex.length; i++) {
      if (tex[i] === '{') depth++
      else if (tex[i] === '}' && --depth === 0) return [tex.slice(open + 1, i), i + 1]
    }
    return [tex.slice(open + 1), tex.length]
  }
  const out: [string, string][] = []
  for (let at = tex.indexOf('\\frac{'); at >= 0; at = tex.indexOf('\\frac{', at + 1)) {
    const [num, next] = group(at + 5)
    if (tex[next] === '{') out.push([num, group(next)[0]])
  }
  return out
}

/** A part of a fraction a student reads as 0 ("0", "\vec{0}"); a symbol such as \vec{A} is no number at all. */
const readsZero = (t: string): boolean => shownValue(t) === 0
const sentences = (sol: VS.Solution): string => sol.steps.map((st) => st.text ?? '').join(' ')
const working = (sol: VS.Solution): string => sol.steps.map((st) => st.tex ?? '').join(' ')
const thetaOf = (sol: VS.Solution): string | undefined => sol.answers.find((a) => a.label === 'θ')?.tex

// solveUnitVector has no zero-vector branch: normalize() in vec.ts hands back [0, 0, 0] for any
// size under 1e-12, the digit guard skips its check when |A| < 1e-12, and every line is written
// anyway, so the zero vector was divided by its own size and a 1×10⁻²⁰ vector lost its direction.
describe('the unit vector of the zero vector and of a tiny vector (H3)', () => {
  const zero: VS.NamedVec = { name: 'A', v: [0, 0, 0] }

  it('the zero vector: no line divides by |A| = 0, and none checks the size of a unit vector it does not have', () => {
    const sol = VS.solveUnitVector(zero)
    rendersAll(sol, 'zero unit vector')
    const byZero = sol.steps.flatMap((st) => fractions(st.tex ?? '').filter(([, den]) => readsZero(den)).map(([num, den]) => `\\frac{${num}}{${den}}`))
    expect(byZero, 'a fraction with 0 underneath').toEqual([])
    // "Check: its magnitude is √(0² + 0²) = 0" checks a unit vector that cannot exist.
    expect(sentences(sol)).not.toContain('Check: its magnitude')
  })

  it('the zero vector: a sentence says it has no direction and so no unit vector, and the answer says so instead of 0', () => {
    const sol = VS.solveUnitVector(zero)
    expect(sentences(sol)).toMatch(/no direction/)
    expect(sentences(sol)).toMatch(/no unit vector/)
    // Answers are mandatory: the answer is that sentence, not a zero vector.
    expect(sol.answers.length).toBeGreaterThan(0)
    expect(sol.answers.map((a) => a.tex)).not.toContain('\\vec{0}')
    expect(sol.answers.map((a) => a.tex).join(' ')).toMatch(/no (?:unit vector|direction)/)
  })

  it('the zero vector: no unit-vector arrow is drawn', () => {
    const sol = VS.solveUnitVector(zero)
    expect((sol.visual?.vectors ?? []).filter((v) => v.role === 'result')).toEqual([])
  })

  it('a tiny vector, 1×10⁻²⁰ î, is a real vector: |A| = 1×10⁻²⁰ and its unit vector is î, never 0/0', () => {
    // The solver writes a tiny known value in scientific form (writers().sci) because a typed
    // 1.6×10⁻¹⁹ is a real number, not drag noise; 1×10⁻²⁰ î points along +x like any other.
    const sol = VS.solveUnitVector({ name: 'A', v: [1e-20, 0, 0] })
    rendersAll(sol, 'tiny unit vector')
    expect(sol.answers[0].tex).toBe('1\\hat{i}')
    expect(working(sol)).toContain('A = 1\\times 10^{-20}')
    const zeroParts = sol.steps.flatMap((st) =>
      fractions(st.tex ?? '')
        .filter(([num, den]) => readsZero(num) || readsZero(den))
        .map(([num, den]) => `\\frac{${num}}{${den}}`)
    )
    expect(zeroParts, 'a fraction with 0 above or below').toEqual([])
    const arrow = sol.visual!.vectors.find((v) => v.role === 'result')!
    expect(arrow.v[0]).toBeCloseTo(1, 12)
    expect(Math.hypot(arrow.v[1], arrow.v[2])).toBe(0)
  })
})

// num, ijk and text go through fmt's 1e-12 noise floor, so k = 1.6×10⁻¹⁹ was written "0" in the
// title, the working and the answers, and the third line called it zero. writers().sci, sciText
// and sciIJK already exist for exactly this (solveMagneticForce uses them).
describe('scalar × vector with a tiny k (H4)', () => {
  const k = 1.6e-19
  /** k(3î + 4ĵ), as one power of ten (the file's sciIJK form) or component by component. */
  const R_TINY = ['\\left(4.8\\hat{i} + 6.4\\hat{j}\\right)\\times 10^{-19}', '4.8\\times 10^{-19}\\hat{i} + 6.4\\times 10^{-19}\\hat{j}']

  it('k = 1.6×10⁻¹⁹ times 3î + 4ĵ answers R = (4.8î + 6.4ĵ)×10⁻¹⁹ and |R| = 8×10⁻¹⁹, never 0', () => {
    const sol = VS.solveScalarMultiply(k, A)
    rendersAll(sol, 'tiny k')
    expect(R_TINY, 'R').toContain(sol.answers[0].tex)
    expect(sol.answers[1].tex, '|R|').toBe('8\\times 10^{-19}')
  })

  it('k reads 1.6×10⁻¹⁹ in the title and in both working lines, and those lines reach the same R and |R| as the answers', () => {
    const sol = VS.solveScalarMultiply(k, A)
    expect(sol.title).toContain('1.6\u00a0×\u00a010⁻¹⁹')
    const [times, size] = sol.steps.map((st) => st.tex ?? '')
    expect(times).toContain('1.6\\times 10^{-19}')
    expect(R_TINY.some((r) => times.includes(r)), times).toBe(true)
    expect(size).toContain('1.6\\times 10^{-19}')
    expect(size).toContain('8\\times 10^{-19}')
  })

  it('a tiny but nonzero k is not "zero": a positive one keeps the direction, a negative one turns it round', () => {
    const says = (kk: number): string => sentences(VS.solveScalarMultiply(kk, A)).match(/k is [^.:,]*/)?.[0] ?? ''
    expect(says(k)).toBe('k is positive')
    expect(says(-k)).toBe('k is negative')
  })

  it('guard: an ordinary k keeps true lengths in the picture; only an R under the noise floor gets a stand-in arrow', () => {
    // displayVector's own window (under 0.05 or over 20 times |A|) drew R = 25A at A's length, on top of A.
    const R25 = VS.solveScalarMultiply(25, A).visual!.vectors.find((v) => v.role === 'result')!
    expect(R25.v).toEqual([75, 100, 0])
    expect(R25.drawn).toBeUndefined()
    expect(R25.note).toBeUndefined()
    const tiny = VS.solveScalarMultiply(k, A).visual!.vectors.find((v) => v.role === 'result')!
    // Half of |A| = 5, not |A|: a stand-in |A| long lay exactly on top of A and hid it (H4 picture, below).
    expect(Math.hypot(...tiny.drawn!)).toBeCloseTo(2.5, 9)
    expect(tiny.note).toBe('|R| = 8\u00a0×\u00a010⁻¹⁹ — arrow not to scale')
  })
})

// dotSteps called a pair perpendicular whenever |A·B| < 1e-9 and solveCross called it parallel
// whenever |A×B| < 1e-9, but both products grow as |A||B|: two 10⁻⁵-long vectors have products
// near 10⁻¹⁰ at every angle, and 10⁶-long ones keep a rounding remainder far above 10⁻⁹.
describe('perpendicular and parallel are judged by the angle, whatever the size (H5)', () => {
  /** Not "parallelogram", which every cross product's working mentions. */
  const PARALLEL = /\b(?:anti)?parallel\b/
  const small: VS.NamedVec = { name: 'A', v: [1e-5, 0, 0] }
  const small45: VS.NamedVec = { name: 'B', v: fromPolar(1e-5, toRad(45)) }
  const O: VS.NamedVec = { name: 'O', v: [0, 0, 0] }

  it('1×10⁻⁵ î and 1×10⁻⁵ at 45° are not called perpendicular (dot, angle between, work)', () => {
    for (const [name, sol] of [
      ['dot', VS.solveDot(small, small45)],
      ['angle between', VS.solveAngleBetween(small, small45)],
      ['work', VS.solveWork(small.v, small45.v)]
    ] as [string, VS.Solution][]) {
      rendersAll(sol, name)
      expect(thetaOf(sol), name).toBe('45^\\circ')
      expect(sentences(sol), name).not.toContain('perpendicular')
    }
  })

  it('1×10⁻⁵ î × 1×10⁻⁵ ĵ (θ = 90°) is not called parallel or antiparallel, nor its 1×10⁻¹⁰ k̂ a null vector', () => {
    const sol = VS.solveCross(small, { name: 'B', v: [0, 1e-5, 0] })
    rendersAll(sol, 'small cross')
    expect(thetaOf(sol)).toBe('90^\\circ')
    expect(sol.answers[0].tex).toBe('1\\times 10^{-10}\\hat{k}')
    expect(sentences(sol)).not.toMatch(PARALLEL)
    expect(sentences(sol)).not.toContain('null vector')
  })

  it('a cross product with the zero vector is never called parallel; like the dot product it says O has zero length and there is no angle', () => {
    const sol = VS.solveCross(O, A)
    rendersAll(sol, 'zero cross')
    expect(sentences(sol)).not.toMatch(PARALLEL)
    // dotSteps' sentence for the same pair: "O has zero length, so O·A = 0 and there is no angle between them."
    expect(sentences(sol)).toContain('O has zero length')
    expect(sentences(sol)).toContain('no angle between them')
  })

  it('a cross product with the zero vector does not work "sin undefined = undefined"', () => {
    // The θ answer may say undefined, as the dot product's does; a line of working may not.
    expect(working(VS.solveCross(O, A))).not.toMatch(/undefined/)
  })

  it('same cause, in solveAngleBetween: a 10⁶-long antiparallel pair at exactly 180° is still called antiparallel', () => {
    // Rounding leaves |A×B| = 2×10⁻⁴ for these, so "cr < 1e-9" dropped the sentence while θ read 180°.
    const sol = VS.solveAngleBetween({ name: 'A', v: fromPolar(1e6, toRad(30)) }, { name: 'B', v: fromPolar(1e6, toRad(210)) })
    expect(thetaOf(sol)).toBe('180^\\circ')
    expect(sentences(sol)).toContain('antiparallel')
  })

  it('guard (passes today): 3î and 4ĵ are called perpendicular; 2î and 5î parallel, 2î and −5î antiparallel', () => {
    const i3: VS.NamedVec = { name: 'A', v: [3, 0, 0] }
    const j4: VS.NamedVec = { name: 'B', v: [0, 4, 0] }
    const i2: VS.NamedVec = { name: 'A', v: [2, 0, 0] }
    const i5: VS.NamedVec = { name: 'B', v: [5, 0, 0] }
    const back5: VS.NamedVec = { name: 'B', v: [-5, 0, 0] }
    expect(sentences(VS.solveDot(i3, j4))).toContain('perpendicular')
    expect(sentences(VS.solveAngleBetween(i3, j4))).toContain('perpendicular')
    expect(sentences(VS.solveCross(i2, i5))).toMatch(PARALLEL)
    expect(sentences(VS.solveCross(i2, back5))).toMatch(PARALLEL)
    expect(sentences(VS.solveAngleBetween(i2, i5))).toContain('they are parallel')
    expect(sentences(VS.solveAngleBetween(i2, back5))).toContain('antiparallel')
  })

  it('guard (passes today): a 10⁶-long pair at exactly 90° or 180° never says "zero" beside a nonzero printed A·B or A×B', () => {
    // Rounding left A·B = 0.0001 and A×B = −0.0002k̂ on these cards until the noise rule set them
    // to zero. Whatever the rule, a card that calls them perpendicular / parallel must not do it
    // beside a nonzero number: the sentence and the value printed on the same card have to agree.
    const a: VS.NamedVec = { name: 'A', v: fromPolar(1e6, toRad(30)) }
    const dot = VS.solveDot(a, { name: 'B', v: fromPolar(1e6, toRad(120)) })
    const cross = VS.solveCross(a, { name: 'B', v: fromPolar(1e6, toRad(210)) })
    expect(thetaOf(dot)).toBe('90^\\circ')
    expect(thetaOf(cross)).toBe('180^\\circ')
    const dotAgrees = !/dot product is zero/.test(sentences(dot)) || dot.answers[0].tex === '0'
    const crossAgrees = !/null vector/.test(sentences(cross)) || cross.answers[0].tex === '\\vec{0}'
    expect(dotAgrees, `${sentences(dot)} | A·B = ${dot.answers[0].tex}`).toBe(true)
    expect(crossAgrees, `${sentences(cross)} | A×B = ${cross.answers[0].tex}`).toBe(true)
  })

  it('guard: a null A×B (parallel cards, or a zero vector) is said to have no direction, never sent along a right-hand rule', () => {
    // "The direction is perpendicular to the plane of A and B (right-hand rule)" was written under
    // A×B = 0⃗ too, where parallel vectors make no plane and the null vector has no direction.
    for (const [name, sol] of [
      ['parallel', VS.solveCross({ name: 'A', v: [2, 0, 0] }, { name: 'B', v: [5, 0, 0] })],
      ['antiparallel', VS.solveCross({ name: 'A', v: [2, 0, 0] }, { name: 'B', v: [-5, 0, 0] })],
      ['zero vector', VS.solveCross(O, A)]
    ] as [string, VS.Solution][]) {
      rendersAll(sol, name)
      expect(sentences(sol), name).not.toMatch(/right-hand rule|plane of/)
      expect(sentences(sol), name).toMatch(/null vector[^.]*no direction/)
    }
    // A cross product that is not null keeps its right-hand rule.
    expect(sentences(VS.solveCross(A3, B3))).toContain('perpendicular to the plane of A and B (right-hand rule)')
  })

  it('a nonzero A×B under the noise floor (two 10⁻⁷-long vectors at 98°) is written in scientific form, never called the null vector', () => {
    // A×B = −7×10⁻¹⁴ k̂ was written 0⃗ by fmt's floor, with |A×B| = 0, "√(0² + 0² + 0²) = 0" and
    // "the null vector, which has no direction" beside θ = 98.13°.
    const sol = VS.solveCross({ name: 'A', v: [1e-7, 3e-7, 0] }, { name: 'B', v: [2e-7, -1e-7, 0] })
    rendersAll(sol, 'tiny cross')
    expect(thetaOf(sol)).toBe('98.1301^\\circ')
    expect(sol.answers[0].tex).toBe('\\left(-7\\hat{k}\\right)\\times 10^{-14}')
    expect(sol.answers[1].tex).toBe('7\\times 10^{-14}')
    expect(working(sol)).toContain('\\vec{C} = \\left(-7\\hat{k}\\right)\\times 10^{-14}')
    expect(working(sol)).toContain('\\sqrt{0^2 + 0^2 + (-7\\times 10^{-14})^2} = \\sqrt{4.9\\times 10^{-27}} = 7\\times 10^{-14}')
    expect(sentences(sol)).not.toContain('null vector')
    expect(sentences(sol)).toContain('right-hand rule')
  })

  it('rounding noise in A·B and A×B is set to zero by a scale-free rule: 10⁶∠30° · 10⁶∠120° is 0, 10⁶∠0°\u00a0×\u00a010⁶∠180° the null vector', () => {
    // cos 90° and sin 180°, stored to 16 digits, left A·B = 0.0001 and A×B = 0.0001k̂ on these cards.
    const dot = VS.solveDot({ name: 'A', v: fromPolar(1e6, toRad(30)) }, { name: 'B', v: fromPolar(1e6, toRad(120)) })
    rendersAll(dot, 'noise dot')
    expect(dot.answers[0].tex).toBe('0')
    expect(sentences(dot)).toContain('The dot product is zero, so the vectors are perpendicular')
    const cross = VS.solveCross({ name: 'A', v: [1e6, 0, 0] }, { name: 'B', v: fromPolar(1e6, toRad(180)) })
    rendersAll(cross, 'noise cross')
    expect(cross.answers.map((a) => a.tex)).toEqual(['\\vec{0}', '0', '180^\\circ'])
    expect(sentences(cross)).toMatch(/null vector[^.]*no direction/)
    expect(sentences(cross)).not.toContain('right-hand rule')
    expect(sentences(cross)).toContain('antiparallel')
    // Work and torque answer with the same products their working writes.
    expect(VS.solveWork(fromPolar(1e6, toRad(30)), fromPolar(1e6, toRad(120))).answers[0].tex).toBe('0\\,\\text{J}')
    expect(VS.solveTorque([1e6, 0, 0], fromPolar(1e6, toRad(180))).answers[0].tex).toBe('\\vec{0}\\,\\text{N m}')
    // Small vectors are not noise: the rule scales with |A||B|.
    expect(VS.solveCross({ name: 'A', v: [1e-5, 0, 0] }, { name: 'B', v: [0, 1e-5, 0] }).answers[0].tex).toBe('1\\times 10^{-10}\\hat{k}')
  })
})

// ---------------------------------------------------------------------------------------------
// Round 2, after an independent checker: the picture of a scalar multiple (H4), a tiny real A·B
// and W (H5), the projection of a perpendicular pair (H10) and the size and angle of a tiny
// vector (H14). Each of these was written through fmt's 1e-12 noise floor as 0.
// ---------------------------------------------------------------------------------------------

/** The numbers of a LaTeX line with their powers of ten read: 1\times 10^{-7} is 1e-7. */
const numbersOf = (t: string): number[] => [...t.matchAll(/(\d+(?:\.\d+)?)(?:\\times\s*10\^\{(-?\d+)\})?/g)].map((m) => Number(`${m[1]}e${m[2] ?? 0}`))
/** "(1×10⁻⁷)(7.0711×10⁻⁸)" or "1×10⁻⁷×1×10⁻⁷": the product of every number in it. */
const productOf = (t: string): number => numbersOf(t).reduce((acc, n) => acc * n, 1)
const within = (a: number, b: number, rel: number): boolean => Math.abs(a - b) <= rel * Math.abs(b)
const stepsTex = (sol: VS.Solution, start: string): string => sol.steps.find((st) => st.tex?.startsWith(start))?.tex ?? ''
/** The last fraction of a working line, as a number, and the number written after the line's last "=" or "≈". */
function lastFraction(line: string): { num: string; den: string; value: number; written: number; sign: string } {
  const fr = fractions(line)
  const [num, den] = fr[fr.length - 1]
  const eq = line.lastIndexOf('=')
  const ap = line.lastIndexOf('\\approx')
  const sign = ap > eq ? '\\approx' : '='
  return { num, den, value: productOf(num) / productOf(den), written: shownValue(line.slice(Math.max(eq, ap) + sign.length)), sign }
}

describe('the picture of a scalar multiple keeps A visible (H4, round 2)', () => {
  const k = 1.6e-19
  const resultOf = (kk: number): VS.VisualVector => VS.solveScalarMultiply(kk, A).visual!.vectors.find((v) => v.role === 'result')!
  const closeTo = (got: readonly number[], want: readonly number[]): void => want.forEach((x, i) => expect(got[i]).toBeCloseTo(x, 9))

  it('k = 1.6×10⁻¹⁹ times 3î + 4ĵ: R is drawn at half of |A| along A, so A’s own head shows beyond it, and the note gives the true |R|', () => {
    const R = resultOf(k)
    expect(R.drawn, 'a stand-in').toBeDefined()
    closeTo(R.drawn!, [1.5, 2, 0])
    expect(R.note).toBe('|R| = 8\u00a0×\u00a010⁻¹⁹ — arrow not to scale')
    // R is still the true vector: only the picture stands in.
    expect(R.v[0]).toBeCloseTo(4.8e-19, 30)
    expect(R.v[1]).toBeCloseTo(6.4e-19, 30)
  })

  it('k = −1.6×10⁻¹⁹: the stand-in is half of |A| the other way, from the tail', () => {
    const R = resultOf(-k)
    closeTo(R.drawn!, [-1.5, -2, 0])
    expect(R.note).toBe('|R| = 8\u00a0×\u00a010⁻¹⁹ — arrow not to scale')
  })

  it('k = 25 still draws the true (75, 100, 0), with no stand-in and no note', () => {
    const R = resultOf(25)
    expect(R.v).toEqual([75, 100, 0])
    expect(R.drawn).toBeUndefined()
    expect(R.note).toBeUndefined()
  })

  it('the drawing lays the stand-in from the tail as a helper shorter than A, with the note at its head', () => {
    const plan = VS.planDrawing(VS.solveScalarMultiply(k, A).visual!)
    const arrows = plan.items.flatMap((it) => (it.kind === 'arrow' ? [it] : []))
    const input = arrows.find((a) => a.role === 'input')!
    const result = arrows.find((a) => a.role === 'result')!
    expect(result.auxiliary).toBe(true)
    expect(result.tail).toEqual([0, 0, 0])
    closeTo(result.comp, [1.5, 2, 0])
    expect(Math.hypot(...result.comp)).toBeLessThan(Math.hypot(...input.comp))
    const note = plan.items.find((it) => it.kind === 'note')
    expect(note && note.kind === 'note' && note.text).toBe('|R| = 8\u00a0×\u00a010⁻¹⁹ — arrow not to scale')
  })
})

describe('a tiny real A·B and W are written as they are, never as 0 (H5, round 2)', () => {
  const tinyA: VS.NamedVec = { name: 'A', v: [1e-7, 0, 0] }
  const tinyB: VS.NamedVec = { name: 'B', v: fromPolar(1e-7, toRad(45)) }

  it('Dot of 1×10⁻⁷ î and 1×10⁻⁷∠45°: A·B = 7.0711×10⁻¹⁵ beside θ = 45°', () => {
    const sol = VS.solveDot(tinyA, tinyB)
    rendersAll(sol, 'tiny dot')
    expect(sol.answers.map((a) => a.tex)).toEqual(['7.0711\\times 10^{-15}', '45^\\circ'])
  })

  it('every working line holds as written: the products add up to that A·B, and the cos line divides it to cos θ (dot and angle between)', () => {
    for (const [name, sol] of [
      ['dot', VS.solveDot(tinyA, tinyB)],
      ['angle between', VS.solveAngleBetween(tinyA, tinyB)]
    ] as [string, VS.Solution][]) {
      rendersAll(sol, `tiny ${name}`)
      const products = stepsTex(sol, '= (')
      const [terms, result] = products.replace(/^=\s*/, '').split(/ (?:=|\\approx) /)
      expect(products, `${name}: products line`).not.toContain('\\approx')
      expect(result, `${name}: A·B on the products line`).toBe('7.0711\\times 10^{-15}')
      expect(within(terms.split(' + ').map(productOf).reduce((a, c) => a + c, 0), productOf(result), 1e-4), `${name}: ${products}`).toBe(true)
      const cos = stepsTex(sol, '\\cos\\theta')
      const f = lastFraction(cos)
      // The numerator is that A·B, written with the digits the division needs (the file's one rule for working lines).
      expect(within(productOf(f.num), 7.0710678e-15, 1e-4), `${name}: the numerator of cos θ is A·B, not 0: ${cos}`).toBe(true)
      expect(f.sign, `${name}: ${cos}`).toBe('=')
      expect(within(f.value, f.written, 1e-4), `${name}: ${cos}`).toBe(true)
      expect(cos).not.toMatch(/\\frac\{0\}/)
    }
  })

  it('Work of F = 1×10⁻⁹ î N through d = 1×10⁻¹⁰ î m: W = 1×10⁻¹⁹ J on every line, never 0 J', () => {
    const sol = VS.solveWork([1e-9, 0, 0], [1e-10, 0, 0])
    rendersAll(sol, 'tiny work')
    expect(sol.answers.map((a) => a.tex)).toEqual(['1\\times 10^{-19}\\,\\text{J}', '0^\\circ'])
    expect(sol.steps[sol.steps.length - 1].tex).toBe('W = 1\\times 10^{-19}\\,\\text{J}')
    expect(stepsTex(sol, '= (')).toBe('= (1\\times 10^{-9})(1\\times 10^{-10}) + (0)(0) = 1\\times 10^{-19}')
    const cos = stepsTex(sol, '\\cos\\theta')
    const f = lastFraction(cos)
    expect(f.num).toBe('1\\times 10^{-19}')
    expect(f.sign).toBe('=')
    expect(within(f.value, f.written, 1e-4), cos).toBe(true)
  })

  it('guard: an ordinary pair is written as before', () => {
    expect(VS.solveDot({ name: 'A', v: [3, 0, 0] }, { name: 'B', v: [2, -1, 0] }).answers[0].tex).toBe('6')
    expect(VS.solveWork([2, 0, 0], [3, 0, 0]).answers[0].tex).toBe('6\\,\\text{J}')
  })
})

describe('the projection of a perpendicular pair follows the noise rule, as Dot does (H10, round 2)', () => {
  const a = fromPolar(1e6, toRad(30))
  const b = fromPolar(1e6, toRad(120))

  it('1×10⁶∠30° and 1×10⁶∠120°: B cos θ is 0 beside Dot’s A·B = 0, not 1.22×10⁻¹⁰', () => {
    expect(VS.solveDot({ name: 'A', v: a }, { name: 'B', v: b }).answers[0].tex).toBe('0')
    const proj = VS.solveProjection({ name: 'B', v: b }, { name: 'A', v: a })
    rendersAll(proj, 'noise projection')
    expect(proj.answers.map((x) => x.tex)).toEqual(['0', '\\vec{0}'])
    expect(working(proj)).not.toMatch(/10\^\{-10\}/)
  })

  it('a tiny REAL projection is not written 0: 1×10⁻⁷ î and 1×10⁻⁷∠45° give B cos θ = 7.0711×10⁻⁸ on every line', () => {
    const proj = VS.solveProjection({ name: 'B', v: fromPolar(1e-7, toRad(45)) }, { name: 'A', v: [1e-7, 0, 0] })
    rendersAll(proj, 'tiny projection')
    expect(proj.answers.map((x) => x.tex)).toEqual(['7.0711\\times 10^{-8}', '7.0711\\times 10^{-8}\\hat{i}'])
    for (const st of proj.steps.filter((s) => s.tex)) {
      const f = lastFraction(st.tex!)
      expect(st.tex, 'a number over 0 or 0 over a number').not.toMatch(/\\frac\{0\}|\}\{0\}/)
      expect(f.sign, st.tex).toBe('=')
      expect(f.num, st.tex).toBe('7.0711\\times 10^{-15}')
    }
  })

  it('guard: an ordinary projection is unchanged', () => {
    expect(VS.solveProjection(A, B).answers[0].tex).toBe('0.8944')
  })
})

describe('the size and angle of a tiny real vector (H14, round 2)', () => {
  it('A = 1.6×10⁻¹⁹ î: |A| = 1.6×10⁻¹⁹ and θ = 0°, not 0 and undefined', () => {
    const sol = VS.solveMagnitudeDirection({ name: 'A', v: [1.6e-19, 0, 0] })
    rendersAll(sol, 'tiny î')
    expect(sol.answers.map((x) => x.tex)).toEqual(['1.6\\times 10^{-19}', '0^\\circ'])
    expect(sol.steps[0].tex).toBe('\\vec{A} = \\left(1.6\\hat{i}\\right)\\times 10^{-19}')
    expect(sol.steps[1].tex).toBe('A = \\sqrt{A_{x}^2 + A_{y}^2} = \\sqrt{(1.6\\times 10^{-19})^2 + 0^2} = \\sqrt{2.56\\times 10^{-38}} = 1.6\\times 10^{-19}')
    expect(sentences(sol)).toContain('straight along the +x axis')
    expect(sentences(sol)).not.toMatch(/zero length|undefined/)
  })

  it('a tiny vector off the axes has its own quadrant and angle: −1.6×10⁻¹⁹ î + 1.2×10⁻¹⁹ ĵ is 2×10⁻¹⁹ at 143.1301°', () => {
    const sol = VS.solveMagnitudeDirection({ name: 'A', v: [-1.6e-19, 1.2e-19, 0] })
    rendersAll(sol, 'tiny 2nd quadrant')
    expect(sol.answers.map((x) => x.tex)).toEqual(['2\\times 10^{-19}', '143.1301^\\circ'])
    expect(sentences(sol)).toContain('2nd quadrant')
    expect(working(sol)).toContain('\\frac{1.2\\times 10^{-19}}{1.6\\times 10^{-19}}')
  })

  it('a tiny vector along −y is on that axis, and a tiny 3D vector keeps its z part', () => {
    const down = VS.solveMagnitudeDirection({ name: 'A', v: [0, -2e-19, 0] })
    rendersAll(down, 'tiny −y')
    expect(down.answers.map((x) => x.tex)).toEqual(['2\\times 10^{-19}', '270^\\circ'])
    const solid = VS.solveMagnitudeDirection({ name: 'A', v: [1e-19, 2e-19, 2e-19] })
    rendersAll(solid, 'tiny 3D')
    expect(solid.answers[0].tex).toBe('3\\times 10^{-19}')
    expect(solid.answers[1].tex).toBe('70.5288^\\circ,\\ 48.1897^\\circ,\\ 48.1897^\\circ')
  })

  it('guard: ordinary and zero vectors are unchanged', () => {
    expect(VS.solveMagnitudeDirection(A).answers.map((x) => x.tex)).toEqual(['5', '53.1301^\\circ'])
    expect(VS.solveMagnitudeDirection({ name: 'A', v: [0, 0, 0] }).answers[1].tex).toBe('\\text{undefined}')
    expect(sentences(VS.solveMagnitudeDirection({ name: 'A', v: [0, 0, 0] }))).toContain('zero length')
  })
})

// H16: Components of a tiny real vector. solveComponents wrote its magnitude, both components, the
// unit-vector line and the answers through num, so 1.6×10⁻¹⁹ at 30° read Ax = 0 and Ay = 0; and
// solveResolve found no direction for anything under 1e-12 (directionDeg) and resolved it at 0°.
describe('the components of a tiny real vector (H16)', () => {
  const answersOf = (sol: VS.Solution): string[] => sol.answers.map((a) => a.tex)

  it('Components of 1.6×10⁻¹⁹ at 30°: Ax = 1.3856×10⁻¹⁹ and Ay = 8×10⁻²⁰, never 0, and every line holds as written', () => {
    const sol = VS.solveComponents('A', 1.6e-19, 30)
    rendersAll(sol, 'tiny components')
    expect(sol.answers).toEqual([
      { label: 'Ax', tex: '1.3856\\times 10^{-19}' },
      { label: 'Ay', tex: '8\\times 10^{-20}' }
    ])
    expect(sol.steps[0].text).toBe('Given: magnitude A = 1.6\u00a0×\u00a010⁻¹⁹ at θ = 30° with the +x axis.')
    expect(sol.steps[1].tex).toBe('A_{x} = A\\cos\\theta = 1.6\\times 10^{-19}\\cos 30^\\circ = 1.6\\times 10^{-19}\\times 0.866 = 1.3856\\times 10^{-19}')
    expect(sol.steps[2].tex).toBe('A_{y} = A\\sin\\theta = 1.6\\times 10^{-19}\\sin 30^\\circ = 1.6\\times 10^{-19}\\times 0.5 = 8\\times 10^{-20}')
    expect(sol.steps[3].tex).toBe('\\vec{A} = \\left(1.3856\\hat{i} + 0.8\\hat{j}\\right)\\times 10^{-19}')
    // The product on each component line gives the number after its =, worked as a calculator would.
    for (const i of [1, 2]) {
      const parts = sol.steps[i].tex!.split(' = ')
      expect(within(productOf(parts[3]), productOf(parts[4]), 1e-4), sol.steps[i].tex).toBe(true)
    }
  })

  it('a unit goes after each component and the sentence: 1.6×10⁻¹⁹ N at 30°', () => {
    const sol = VS.solveComponents('F', 1.6e-19, 30, 'N')
    rendersAll(sol, 'tiny components with a unit')
    expect(sol.steps[0].text).toBe('Given: magnitude F = 1.6\u00a0×\u00a010⁻¹⁹ N at θ = 30° with the +x axis.')
    expect(answersOf(sol)).toEqual(['1.3856\\times 10^{-19}\\,\\text{N}', '8\\times 10^{-20}\\,\\text{N}'])
  })

  it('Resolve of the vector 1.6×10⁻¹⁹ ∠ 30° resolves it at its own heading, not at 0°', () => {
    const sol = VS.solveResolve({ name: 'A', v: fromPolar(1.6e-19, toRad(30)) })
    rendersAll(sol, 'tiny resolve')
    expect(answersOf(sol)).toEqual(['1.3856\\times 10^{-19}', '8\\times 10^{-20}'])
    expect(sol.steps[0].text).toBe('Given: magnitude A = 1.6\u00a0×\u00a010⁻¹⁹ at θ = 30° with the +x axis.')
  })

  it('a component that is only rounding noise beside the magnitude is 0: 1.6×10⁻¹⁹ at 90° has Ax = 0, not 9.8×10⁻³⁶', () => {
    const sol = VS.solveComponents('A', 1.6e-19, 90)
    rendersAll(sol, 'tiny at 90°')
    expect(answersOf(sol)).toEqual(['0', '1.6\\times 10^{-19}'])
    expect(sol.steps[1].tex).toBe('A_{x} = A\\cos\\theta = 1.6\\times 10^{-19}\\cos 90^\\circ = 1.6\\times 10^{-19}\\times 0 = 0')
    expect(sol.steps[3].tex).toBe('\\vec{A} = \\left(1.6\\hat{j}\\right)\\times 10^{-19}')
    expect(working(sol)).not.toMatch(/10\^\{-3\d\}/)
  })

  it('a negative component keeps its sign and is bracketed in the product: 1.6×10⁻¹⁹ at 150°', () => {
    const sol = VS.solveComponents('A', 1.6e-19, 150)
    rendersAll(sol, 'tiny at 150°')
    expect(answersOf(sol)).toEqual(['-1.3856\\times 10^{-19}', '8\\times 10^{-20}'])
    expect(sol.steps[1].tex).toContain('1.6\\times 10^{-19}\\times (-0.866) = -1.3856\\times 10^{-19}')
  })

  it('a tiny 3D vector is read off in scientific form, with its z part: Components of (1, 2, 2)×10⁻¹⁹', () => {
    const sol = VS.solveResolve({ name: 'A', v: [1e-19, 2e-19, 2e-19] })
    rendersAll(sol, 'tiny 3D resolve')
    expect(answersOf(sol).slice(0, 4)).toEqual(['1\\times 10^{-19}', '2\\times 10^{-19}', '2\\times 10^{-19}', '3\\times 10^{-19}'])
    expect(working(sol)).toContain('A_{x} = 1\\times 10^{-19},\\quad A_{y} = 2\\times 10^{-19},\\quad A_{z} = 2\\times 10^{-19}')
  })

  it('guard: an ordinary vector is written as before, a rounding-noise component still reads 0 (components, resolve, magnitude and direction)', () => {
    expect(answersOf(VS.solveComponents('F', 10, 30, 'N'))).toEqual(['8.6603\\,\\text{N}', '5\\,\\text{N}'])
    // 5 cos 90° is 3×10⁻¹⁶: noise, written 0 as it always was.
    expect(answersOf(VS.solveComponents('A', 5, 90))).toEqual(['0', '5'])
    expect(VS.solveComponents('A', 5, 90).steps[1].tex).toBe('A_{x} = A\\cos\\theta = 5\\cos 90^\\circ = 5\\times 0 = 0')
    // A 3D vector with a 1×10⁻¹⁷ part: the angle line still reads 0/5, not a number from the noise.
    const noisy = VS.solveMagnitudeDirection({ name: 'A', v: [3, 1e-17, 4] })
    rendersAll(noisy, 'noisy 3D')
    expect(working(noisy)).not.toMatch(/10\^\{-17\}/)
    expect(working(noisy)).toContain('\\frac{0}{')
    expect(answersOf(noisy)[0]).toBe('5')
    expect(working(VS.solveResolve({ name: 'A', v: [3, 1e-17, 4] }))).not.toMatch(/10\^\{-17\}/)
  })
})


// ---------------------------------------------------------------------------------------------
// P-VEC: two reviewers read the solver diff and left five leads. Each is shown here by the line a
// student would read. L1 (magnetic force), L2 (sums), L4 (huge vectors) and L5 (the band just under
// the 1e-12 floor) were real; L3 (the dot product's products line) was not, and its test pins the
// line that was already right.
// ---------------------------------------------------------------------------------------------
describe('the reviewers’ leads on the solver (P-VEC)', () => {
  const answersOf = (sol: VS.Solution): string[] => sol.answers.map((a) => a.tex)
  const polar = (m: number, deg: number): VS.NamedVec['v'] => fromPolar(m, toRad(deg))

  describe('L1: the magnetic force line writes v × B as it is', () => {
    it('q = 1.6×10⁻¹⁹ C, v = 1×10⁻⁷ î, B = 1×10⁻⁷ ĵ: v × B is (1k̂)×10⁻¹⁴ on the F line, never 0⃗, and the line holds with =', () => {
      const sol = VS.solveMagneticForce(1.6e-19, [1e-7, 0, 0], [0, 1e-7, 0])
      rendersAll(sol, 'tiny magnetic force')
      // The borrowed cross-product working wrote it right; this line wrote (0⃗) and ≈.
      expect(stepsTex(sol, '\\vec{F}')).toBe('\\vec{F} = 1.6\\times 10^{-19}\\,(\\left(1\\hat{k}\\right)\\times 10^{-14}) = \\left(1.6\\hat{k}\\right)\\times 10^{-33}\\,\\text{N}')
      expect(stepsTex(sol, '\\left|\\vec{F}\\right|')).toBe('\\left|\\vec{F}\\right| = 1.6\\times 10^{-33}\\,\\text{N}')
      expect(answersOf(sol)).toEqual(['\\left(1.6\\hat{k}\\right)\\times 10^{-33}\\,\\text{N}', '1.6\\times 10^{-33}\\,\\text{N}'])
    })

    it('a negative charge, and a v × B whose digits matter: (1.6)(1.69) is 2.704', () => {
      expect(stepsTex(VS.solveMagneticForce(-1.6e-19, [1e-7, 0, 0], [0, 1e-7, 0]), '\\vec{F}')).toBe(
        '\\vec{F} = (-1.6\\times 10^{-19})\\,(\\left(1\\hat{k}\\right)\\times 10^{-14}) = \\left(-1.6\\hat{k}\\right)\\times 10^{-33}\\,\\text{N}'
      )
      expect(stepsTex(VS.solveMagneticForce(1.6e-19, [1.3e-7, 0, 0], [0, 1.3e-7, 0]), '\\vec{F}')).toBe(
        '\\vec{F} = 1.6\\times 10^{-19}\\,(\\left(1.69\\hat{k}\\right)\\times 10^{-14}) = \\left(2.704\\hat{k}\\right)\\times 10^{-33}\\,\\text{N}'
      )
    })

    it('guard: an ordinary v × B is written as before', () => {
      expect(stepsTex(VS.solveMagneticForce(-1.6e-19, [2e6, 0, 0], [0, 0.5, 0]), '\\vec{F}')).toBe(
        '\\vec{F} = (-1.6\\times 10^{-19})\\,(1000000\\hat{k}) = \\left(-1.6\\hat{k}\\right)\\times 10^{-13}\\,\\text{N}'
      )
    })
  })

  describe('L2: a sum of tiny vectors is written as it is, beside its own |R|', () => {
    const tinyA: VS.NamedVec = { name: 'A', v: [1.6e-19, 0, 0] }
    const tinyB: VS.NamedVec = { name: 'B', v: [0, 1.6e-19, 0] }

    it('Add 1.6×10⁻¹⁹ î and 1.6×10⁻¹⁹ ĵ: the cards, both component sums and R are in scientific form, not 0⃗', () => {
      const sol = VS.solveAddition([tinyA, tinyB])
      rendersAll(sol, 'tiny sum')
      expect(sol.steps[0].tex).toBe('\\vec{A} = \\left(1.6\\hat{i}\\right)\\times 10^{-19},\\quad \\vec{B} = \\left(1.6\\hat{j}\\right)\\times 10^{-19}')
      expect(sol.steps[2].tex).toBe('R_{x} = A_{x} + B_{x} = 1.6\\times 10^{-19} + 0 = 1.6\\times 10^{-19}')
      expect(sol.steps[3].tex).toBe('R_{y} = A_{y} + B_{y} = 0 + 1.6\\times 10^{-19} = 1.6\\times 10^{-19}')
      expect(sol.steps[4].tex).toBe('\\vec{R} = \\left(1.6\\hat{i} + 1.6\\hat{j}\\right)\\times 10^{-19}')
      expect(answersOf(sol)).toEqual(['\\left(1.6\\hat{i} + 1.6\\hat{j}\\right)\\times 10^{-19}', '2.2627\\times 10^{-19}', '45^\\circ'])
      expect(working(sol)).not.toContain('\\vec{0}')
    })

    it('a negative part is bracketed, and a tiny z part gets its own line: no 3D vector is summed in 2D', () => {
      const neg = VS.solveAddition([tinyA, { name: 'B', v: [-3e-19, 1.6e-19, 0] }])
      rendersAll(neg, 'tiny negative sum')
      expect(neg.steps[2].tex).toBe('R_{x} = A_{x} + B_{x} = 1.6\\times 10^{-19} + (-3\\times 10^{-19}) = -1.4\\times 10^{-19}')
      const solid = VS.solveAddition([tinyA, { name: 'B', v: [0, 1.6e-19, 2e-19] }])
      rendersAll(solid, 'tiny 3D sum')
      expect(sentences(solid)).toContain('z-components')
      expect(stepsTex(solid, 'R_{z}')).toBe('R_{z} = A_{z} + B_{z} = 0 + 2\\times 10^{-19} = 2\\times 10^{-19}')
      expect(answersOf(solid)[0]).toBe('\\left(1.6\\hat{i} + 1.6\\hat{j} + 2\\hat{k}\\right)\\times 10^{-19}')
    })

    it('Subtract and Equilibrium of tiny cards agree with the sum they borrow', () => {
      const sub = VS.solveSubtraction(tinyA, tinyB)
      rendersAll(sub, 'tiny difference')
      expect(sub.steps[1].tex).toBe('-\\vec{B} = \\left(-1.6\\hat{j}\\right)\\times 10^{-19}')
      expect(answersOf(sub)[0]).toBe('\\left(1.6\\hat{i} - 1.6\\hat{j}\\right)\\times 10^{-19}')
      const eq = VS.solveEquilibrium([tinyA, tinyB])
      rendersAll(eq, 'tiny equilibrium')
      expect(answersOf(eq)).toEqual(['\\left(-1.6\\hat{i} - 1.6\\hat{j}\\right)\\times 10^{-19}', '2.2627\\times 10^{-19}'])
      expect(working(eq)).not.toContain('\\vec{0}')
    })

    it('a sum that cancels to rounding noise is the null vector, on every line: 1∠0° + 1∠120° + 1∠240° and 0.1 + 0.2 − 0.3', () => {
      const trio = [
        { name: 'A', v: polar(1, 0) },
        { name: 'B', v: polar(1, 120) },
        { name: 'C', v: polar(1, 240) }
      ]
      const sum = VS.solveAddition(trio)
      rendersAll(sum, 'trio')
      // The sum is 2×10⁻¹⁶ in floating point: it used to be written 0⃗ and then worked on as a real 3×10⁻¹⁶ vector at 135°.
      expect(answersOf(sum)).toEqual(['\\vec{0}', '0', '\\text{undefined}'])
      expect(working(sum)).not.toMatch(/10\^\{-16\}/)
      expect(sentences(sum)).toContain('zero length')
      const eq = VS.solveEquilibrium(trio)
      rendersAll(eq, 'trio equilibrium')
      expect(answersOf(eq)).toEqual(['\\vec{0}', '0'])
      expect(working(eq)).not.toMatch(/10\^\{-16\}/)
      const decimals = VS.solveAddition([{ name: 'A', v: [0.1, 0, 0] }, { name: 'B', v: [0.2, 0, 0] }, { name: 'C', v: [-0.3, 0, 0] }])
      expect(answersOf(decimals)).toEqual(['\\vec{0}', '0', '\\text{undefined}'])
    })

    it('guard: ordinary sums, and a sum that is small but real, are written as before', () => {
      const sol = VS.solveAddition([A, B])
      expect(sol.steps[2].tex).toBe('R_{x} = A_{x} + B_{x} = 3 + 2 = 5')
      expect(sol.steps[3].tex).toBe('R_{y} = A_{y} + B_{y} = 4 + (-1) = 3')
      expect(answersOf(sol)).toEqual(['5\\hat{i} + 3\\hat{j}', '5.831', '30.9638^\\circ'])
      // 1 + (−0.9999) is 1×10⁻⁴ beside inputs of size 1: nothing like noise, and written as the number it is.
      expect(answersOf(VS.solveAddition([{ name: 'A', v: [1, 0, 0] }, { name: 'B', v: [-0.9999, 0, 0] }]))[1]).toBe('1\\times 10^{-4}')
    })
  })

  describe('L3: the products line of the scalar product', () => {
    it('A = 1×10⁻⁷ î + 1×10⁻⁷ ĵ and B = 2×10⁻⁷ î: every component is written as it is — the (0) is B_y itself (the lead is wrong)', () => {
      const sol = VS.solveDot({ name: 'A', v: [1e-7, 1e-7, 0] }, { name: 'B', v: [2e-7, 0, 0] })
      rendersAll(sol, 'tiny products')
      expect(stepsTex(sol, '= (')).toBe('= (1\\times 10^{-7})(2\\times 10^{-7}) + (1\\times 10^{-7})(0) = 2\\times 10^{-14}')
      expect(answersOf(sol)).toEqual(['2\\times 10^{-14}', '45^\\circ'])
    })
  })

  describe('L4: vectors so big that |A||B| overflows are not rounding noise', () => {
    const huge = (v: VS.NamedVec['v'], name = 'A'): VS.NamedVec => ({ name, v })

    it('A = B = 1×10²⁰⁰ î: parallel, never "perpendicular" with A·B = 0', () => {
      const sol = VS.solveDot(huge([1e200, 0, 0]), huge([1e200, 0, 0], 'B'))
      rendersAll(sol, 'huge parallel dot')
      expect(sentences(sol)).not.toContain('perpendicular')
      expect(answersOf(sol)[0]).not.toBe('0')
      expect(answersOf(sol)[1]).toBe('0^\\circ')
    })

    it('A = 1×10²⁰⁰ î and B = 1×10²⁰⁰ ĵ: perpendicular, so A×B is not "the null vector" and the vectors are not "parallel"', () => {
      const sol = VS.solveCross(huge([1e200, 0, 0]), huge([0, 1e200, 0], 'B'))
      rendersAll(sol, 'huge perpendicular cross')
      expect(sentences(sol)).not.toMatch(/null vector|the vectors are (?:anti)?parallel/)
      expect(answersOf(sol)[0]).not.toBe('\\vec{0}')
      expect(answersOf(sol)[2]).toBe('90^\\circ')
      const dot = VS.solveDot(huge([1e200, 0, 0]), huge([0, 1e200, 0], 'B'))
      expect(answersOf(dot)[1]).toBe('90^\\circ')
    })

    it('A = 1×10²⁰⁰ î and B = 1×10²⁰⁰ î + 1×10²⁰⁰ ĵ are 45° apart, not 90°', () => {
      const sol = VS.solveAngleBetween(huge([1e200, 0, 0]), huge([1e200, 1e200, 0], 'B'))
      rendersAll(sol, 'huge 45°')
      expect(answersOf(sol)).toEqual(['45^\\circ'])
      expect(sentences(sol)).not.toContain('perpendicular')
    })
  })

  describe('L5: a vector with every part just under 1×10⁻¹²', () => {
    it('Components of 9×10⁻¹³ î + 9×10⁻¹³ ĵ gives its own angle, 45°, and its own parts, not 0° (and not 0 and 0 beside the vector line)', () => {
      const sol = VS.solveResolve({ name: 'A', v: [9e-13, 9e-13, 0] })
      rendersAll(sol, 'band resolve')
      expect(sol.steps[0].text).toBe('Given: magnitude A = 1.2728\u00a0×\u00a010⁻¹² at θ = 45° with the +x axis.')
      expect(answersOf(sol)).toEqual(['9\\times 10^{-13}', '9\\times 10^{-13}'])
      expect(sol.steps[3].tex).toBe('\\vec{A} = \\left(9\\hat{i} + 9\\hat{j}\\right)\\times 10^{-13}')
    })

    it('a magnitude just over the floor at 45° has both parts under it: Components of 1.2×10⁻¹² at 45° is 8.4853×10⁻¹³ twice, as its vector line says', () => {
      const sol = VS.solveComponents('A', 1.2e-12, 45)
      rendersAll(sol, 'band components')
      expect(answersOf(sol)).toEqual(['8.4853\\times 10^{-13}', '8.4853\\times 10^{-13}'])
      expect(sol.steps[3].tex).toBe('\\vec{A} = \\left(8.4853\\hat{i} + 8.4853\\hat{j}\\right)\\times 10^{-13}')
    })

    it('guard: the zero vector is still resolved at 0°, even with negative zeros', () => {
      expect(VS.solveResolve({ name: 'A', v: [0, 0, 0] }).steps[0].text).toContain('at θ = 0°')
      expect(VS.solveResolve({ name: 'A', v: [-0, -0, 0] }).steps[0].text).toContain('at θ = 0°')
    })
  })
})

// V6 (P-VEC): a caret is programming syntax, and no screen of PhysLab shows one. fmt writes a power of
// ten "1.6×10^-19" because shownValue and sciExponent read that form back, so what a student reads —
// the title, the sentences, the answer labels and the note drawn beside a stand-in arrow — is
// rewritten once, in finish(), to "1.6\u00a0×\u00a010⁻¹⁹". The LaTeX keeps its \times 10^{-19}, which is typeset raised.
describe('plain text writes a power of ten raised, never with a caret (V6)', () => {
  /** Every plain-text string a solution carries: title, sentences, answer labels and the notes beside stand-in arrows. */
  const plainTextOf = (sol: VS.Solution): string[] => [
    sol.title,
    ...sol.steps.flatMap((st) => (st.text === undefined ? [] : [st.text])),
    ...sol.answers.map((a) => a.label),
    ...(sol.visual?.vectors.flatMap((v) => (v.note === undefined ? [] : [v.note])) ?? [])
  ]
  const noCaret = (sol: VS.Solution, where: string): void => {
    for (const t of plainTextOf(sol)) expect(t, `${where}: "${t}"`).not.toContain('^')
  }
  const textOf = (sol: VS.Solution): string => sol.steps.map((st) => st.text ?? '').join(' ')

  it('Scalar × with k = 1.6×10⁻¹⁹, Components and Resolve of 1.6×10⁻¹⁹ ∠ 30°, and Magnetic force with q = 1.6×10⁻¹⁹ read 1.6\u00a0×\u00a010⁻¹⁹', () => {
    const scalar = VS.solveScalarMultiply(1.6e-19, A)
    noCaret(scalar, 'Scalar ×')
    expect(scalar.title).toBe('R = (1.6\u00a0×\u00a010⁻¹⁹)A')
    expect(scalar.visual!.vectors.find((v) => v.role === 'result')!.note).toBe('|R| = 8\u00a0×\u00a010⁻¹⁹ — arrow not to scale')

    const parts = VS.solveComponents('A', 1.6e-19, 30)
    noCaret(parts, 'Components')
    expect(parts.steps[0].text).toBe('Given: magnitude A = 1.6\u00a0×\u00a010⁻¹⁹ at θ = 30° with the +x axis.')
    const resolved = VS.solveResolve({ name: 'A', v: fromPolar(1.6e-19, toRad(30)) })
    noCaret(resolved, 'Resolve')
    expect(resolved.steps[0].text).toBe('Given: magnitude A = 1.6\u00a0×\u00a010⁻¹⁹ at θ = 30° with the +x axis.')

    const force = VS.solveMagneticForce(1.6e-19, [1, 0, 0], [0, 1, 0])
    noCaret(force, 'Magnetic force')
    expect(textOf(force)).toContain('Multiply by the charge q = 1.6\u00a0×\u00a010⁻¹⁹ C:')
    expect(force.visual!.vectors.find((v) => v.name === 'F')!.note).toBe('|F| = 1.6\u00a0×\u00a010⁻¹⁹ N — arrow not to scale')
  })

  it('the drawing method’s scale sentence and its comparison line raise their powers, for huge vectors and tiny ones', () => {
    const big = VS.solveAdditionGraphical([
      { name: 'A', v: [3e10, 4e10, 0] },
      { name: 'B', v: [1e10, -2e10, 0] }
    ])
    noCaret(big, 'huge')
    expect(textOf(big)).toContain('1 grid square stands for 5\u00a0×\u00a010⁹ units, so the longest vector (5\u00a0×\u00a010¹⁰) is 10 squares')
    expect(textOf(big)).toContain('The component method gives R = 4.4721\u00a0×\u00a010¹⁰ at θ = 26.5651°.')
    const small = VS.solveAdditionGraphical([
      { name: 'A', v: [3e-10, 4e-10, 0] },
      { name: 'B', v: [1e-10, -2e-10, 0] }
    ])
    noCaret(small, 'tiny')
    expect(textOf(small)).toContain('1 grid square stands for 1\u00a0×\u00a010⁻¹⁰ units, so the longest vector (5\u00a0×\u00a010⁻¹⁰) is 5 squares')
    expect(textOf(small)).toContain('The component method gives R = 4.4721\u00a0×\u00a010⁻¹⁰ at θ = 26.5651°.')
  })

  it('at 3 significant figures the kept zero stays (1.60\u00a0×\u00a010⁻¹⁹), and the LaTeX keeps its braced exponent', () => {
    const sf: MeasureSettings = { decimals: 3, precisionMode: 'sf', unit: 'unit', unitPerSquare: 1, angleUnit: 'deg' }
    const sol = VS.solveScalarMultiply(1.6e-19, A, 'R', sf)
    noCaret(sol, 'Scalar × at 3 s.f.')
    expect(sol.title).toBe('R = (1.60\u00a0×\u00a010⁻¹⁹)A')
    const tex = [...sol.steps.map((st) => st.tex ?? ''), ...sol.answers.map((a) => a.tex)].join(' ')
    expect(tex).toContain('\\times 10^{-19}')
    expect(tex, 'a raised digit in LaTeX would be drawn as a stray character').not.toMatch(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/)
    rendersAll(sol, 'Scalar × at 3 s.f.')
  })
})
