// The step-by-step vector solutions: every line must survive KaTeX, and the numbers must be the
// textbook's. A single-backslash "\theta" inside a template literal is a TAB and "heta" — it
// rendered as garbage for a whole version and nothing in the suite noticed, so the real renderer
// is run over the real output of every solver here.

import { beforeEach, describe, expect, it } from 'vitest'
import katex from 'katex'
import * as THREE from 'three/webgpu'
import * as VS from '../src/renderer/src/math/vectorSolver'
import { setNotation, type MeasureSettings } from '../src/renderer/src/math/format'
import { fromPolar, toRad } from '../src/renderer/src/math/vec'
import { pickAt } from '../src/renderer/src/render/picking'
import type { Computed, ObjId, SceneObject } from '../src/renderer/src/core/types'

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

beforeEach(() => setNotation({ vector: 'arrow', components: 'ijk', direction: 'standard' }))

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
    ['relative velocity (double subscript)', () => VS.solveSubtraction({ name: 'v_A', v: [3, 0, 0] }, { name: 'v_B', v: [0, 4, 0] }, 'v_{AB}')]
  ]
  for (const [name, make] of cases) {
    it(name, () => {
      const sol = make()
      expect(sol.steps.length).toBeGreaterThan(0)
      expect(sol.answers.length).toBeGreaterThan(0)
      rendersAll(sol, name)
    })
  }

  it('renders in radians, significant figures and column notation too', () => {
    const rad: MeasureSettings = { decimals: 3, precisionMode: 'sf', unit: 'm', unitPerSquare: 1, angleUnit: 'rad' }
    const dp2: MeasureSettings = { ...rad, precisionMode: 'dp', decimals: 2 }
    rendersAll(VS.solveMagnitudeDirection(A, rad), 'rad')
    rendersAll(VS.solveAdditionCosineLaw(A, B, 'R', dp2), 'rad 2 d.p.')
    setNotation({ components: 'column' })
    rendersAll(VS.solveAddition([A, B]), 'column')
    setNotation({ components: 'polar', direction: 'bearing' })
    rendersAll(VS.solveSubtraction(A, B), 'polar + bearing')
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
    expect(sol.steps[1].tex).toContain('B_{x}C_{x} + B_{y}C_{y} + B_{z}C_{z}')
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
      ['magnitude', VS.solveMagnitudeDirection(O)]
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

  it('scene names are ones mathjs can read back', () => {
    expect(VS.sceneName('R')).toBe('R')
    expect(VS.sceneName('−B')).toBe('negB')
    expect(VS.sceneName('-B')).toBe('negB')
    expect(VS.sceneName('â')).toBe('ahat')
    expect(VS.sceneName('v_{AB}')).toBe('v_AB')
    expect(VS.sceneName('v×B')).toBe('vxB')
    expect(VS.sceneName('τ')).toBe('tau')
    expect(VS.sceneName('(-B)')).toBe('B')
    expect(VS.sceneName('2A')).toBe('v2A')
    expect(VS.sceneName('')).toBe('v')
    for (const n of ['negB', 'ahat', 'v_AB', 'vxB', 'tau', 'v2A']) expect(n).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/)
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
    expect(note && note.kind === 'note' && note.text).toMatch(/\|F\| = 1\.6×10\^-19 N — arrow not to scale/)
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
