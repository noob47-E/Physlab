// Step-by-step vector solutions in standard notation, the way every textbook writes them:
// A_x = A cos θ, A = √(A_x² + A_y²), A·B = AB cos θ, A×B = AB sin θ n̂ …
//
// Every LaTeX string here is a template literal with DOUBLE backslashes (`\\theta`). A single
// backslash is a JavaScript escape: `\theta` became a TAB followed by "heta" and `\frac` a
// form-feed and "rac", and the law-of-cosines working rendered as garbage for a whole version.
// tests/vectorSolver.test.ts renders every step of every solver through KaTeX to keep it so.
//
// Numbers and angles go through texMeasure / formatMeasure with the student's own settings
// (decimals, significant figures, degrees or radians), never a fixed 4 d.p.

import { add, angleBetween, cross, dot, heading, len, neg, normalize, safeAcos, scale, toDeg, toRad, type V3 } from './vec'
import { formatMeasure, texIJK, texMeasure, vecTex, type MeasureSettings } from './format'

export interface Step {
  /** Plain explanation sentence. */
  text?: string
  /** LaTeX display math. */
  tex?: string
}

export interface VisualVector {
  name: string
  v: V3
  tail?: V3
  role?: 'input' | 'result' | 'helper'
  /**
   * What to draw when the true vector would be invisible beside the inputs (a magnetic force of
   * 1.6×10⁻¹⁹ N next to a 1 m/s velocity). The label still gives the true value in `note`.
   */
  drawn?: V3
  note?: string
}

export interface Solution {
  title: string
  steps: Step[]
  answers: { label: string; tex: string }[]
  visual?: { vectors: VisualVector[]; mode?: 'head-to-tail' | 'parallelogram' | 'common-tail' }
}

export interface NamedVec {
  name: string
  v: V3
}

/** Precision and angle unit for the working; callers without a scene pass nothing and get 4 d.p. in degrees. */
export type SolverSettings = MeasureSettings

export const DEFAULT_SETTINGS: SolverSettings = { decimals: 4, precisionMode: 'dp', unit: 'unit', unitPerSquare: 1, angleUnit: 'deg' }

// ---------------------------------------------------------------------------
// Notation helpers
// ---------------------------------------------------------------------------

const b = (name: string) => vecTex(name)

/** |A| for a one-letter name is just A, as books write it; longer names keep the bars. */
const mag = (name: string) => (name.length === 1 ? name : `\\left|${vecTex(name)}\\right|`)

/**
 * A component subscript that survives a name which already has one: v_{AB} becomes v_{AB,x}
 * and F_1 becomes F_{1x}. Writing `${name}_{x}` gave v_{AB}_{x}, a double subscript KaTeX
 * refuses and paints red.
 */
export function sub_(name: string, axis: string): string {
  const braced = name.match(/^(.*?)_\{([^{}]+)\}$/)
  if (braced) return `${braced[1]}_{${braced[2]},${axis}}`
  const bare = name.match(/^(.*?)_([A-Za-z0-9]+)$/)
  if (bare) return `${bare[1]}_{${bare[2]},${axis}}`
  const numbered = name.match(/^([A-Za-z])(\d+)$/)
  if (numbered) return `${numbered[1]}_{${numbered[2]}${axis}}`
  return `${name}_{${axis}}`
}

/** A name written for a sentence: v_{AB} reads as v_AB once the braces that KaTeX needs are gone. */
const plain = (name: string): string => name.replace(/[{}]/g, '')

/** Titles, sentences and answer labels are plain text, so LaTeX braces in a name come out. */
function finish(sol: Solution): Solution {
  return {
    ...sol,
    title: plain(sol.title),
    steps: sol.steps.map((st) => (st.text ? { ...st, text: plain(st.text) } : st)),
    answers: sol.answers.map((a) => ({ ...a, label: plain(a.label) }))
  }
}

const is3D = (...vs: V3[]) => vs.some((v) => Math.abs(v[2]) > 1e-12)

/** The number/angle writers for one solution, bound to the student's settings. */
function writers(s: SolverSettings) {
  const num = (n: number) => texMeasure(n, 'number', s)
  const parts = (n: number) => {
    const e = Math.floor(Math.log10(Math.abs(n)))
    return { e, m: n / Math.pow(10, e) }
  }
  const tiny = (n: number) => n !== 0 && Math.abs(n) < 1e-12
  return {
    /** A number in LaTeX. */
    num,
    /**
     * A number that may be far below the noise floor: fmt writes anything under 1e-12 as 0 so
     * a dragged point never shows 3×10⁻¹⁷, but a charge of 1.6×10⁻¹⁹ C is a real number.
     */
    sci: (n: number) => (tiny(n) ? `${num(parts(n).m)}\\times 10^{${parts(n).e}}` : num(n)),
    sciText: (n: number) => (tiny(n) ? `${formatMeasure(parts(n).m, 'number', s)}×10^${parts(n).e}` : formatMeasure(n, 'number', s)),
    /** A vector whose components are all that tiny, written as (mantissa vector) × 10ⁿ. */
    sciIJK: (v: V3) => {
      const big = Math.max(...v.map(Math.abs))
      if (!tiny(big)) return texIJK(v, s)
      const { e } = parts(big)
      return `\\left(${texIJK(scale(v, Math.pow(10, -e)), s)}\\right)\\times 10^{${e}}`
    },
    /** A number wrapped in brackets when negative, for substituting into a formula. */
    numP: (n: number) => (n < 0 && Math.abs(n) >= 1e-12 ? `(${num(n)})` : num(n)),
    /** An angle given in degrees, written in the chosen unit; the zero vector's is undefined. */
    ang: (deg: number) => (Number.isNaN(deg) ? '\\text{undefined}' : texMeasure(toRad(deg), 'angle', s)),
    /** A direction from +x given in degrees, written in the chosen unit or as a bearing. */
    dir: (deg: number) => (Number.isNaN(deg) ? '\\text{undefined}' : texMeasure(toRad(deg), 'direction', s)),
    /** Plain-text versions for sentences. */
    numText: (n: number) => formatMeasure(n, 'number', s),
    angText: (deg: number) => (Number.isNaN(deg) ? 'undefined' : formatMeasure(toRad(deg), 'angle', s)),
    ijk: (v: V3) => texIJK(v, s)
  }
}

/** θ measured anticlockwise from +x, 0..360°, or NaN for the zero vector. */
export const directionDeg = (v: V3): number => (Math.abs(v[0]) < 1e-12 && Math.abs(v[1]) < 1e-12 ? NaN : toDeg(heading(v)))

/** θ measured from +x (0..360°) with a quadrant explanation. */
function directionSteps(name: string, v: V3, steps: Step[], s: SolverSettings): number {
  const w = writers(s)
  const [x, y] = v
  const ref = toDeg(Math.atan(Math.abs(y) / Math.abs(x || 1e-300)))
  let theta: number
  if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) {
    steps.push({ text: 'The vector has zero length, so its direction is undefined.' })
    return NaN
  }
  if (Math.abs(x) < 1e-12) {
    theta = y > 0 ? 90 : 270
    steps.push({ text: `${name}x = 0, so the vector points straight along the ${y > 0 ? '+y' : '−y'} axis.`, tex: `\\theta = ${w.ang(theta)}` })
    return theta
  }
  if (Math.abs(y) < 1e-12) {
    theta = x > 0 ? 0 : 180
    steps.push({ text: `${name}y = 0, so the vector points straight along the ${x > 0 ? '+x' : '−x'} axis.`, tex: `\\theta = ${w.ang(theta)}` })
    return theta
  }
  steps.push({
    text: 'Reference angle (ignore signs first):',
    tex: `\\theta_{ref} = \\tan^{-1}\\left(\\frac{|${sub_(name, 'y')}|}{|${sub_(name, 'x')}|}\\right) = \\tan^{-1}\\left(\\frac{${w.num(Math.abs(y))}}{${w.num(Math.abs(x))}}\\right) = ${w.ang(ref)}`
  })
  if (x > 0 && y >= 0) {
    theta = ref
    steps.push({ text: `${name}x is + and ${name}y is +, so the vector is in the 1st quadrant.`, tex: `\\theta = \\theta_{ref} = ${w.ang(theta)}` })
  } else if (x < 0 && y >= 0) {
    theta = 180 - ref
    steps.push({ text: `${name}x is − and ${name}y is +, so the vector is in the 2nd quadrant.`, tex: `\\theta = ${w.ang(180)} - \\theta_{ref} = ${w.ang(theta)}` })
  } else if (x < 0 && y < 0) {
    theta = 180 + ref
    steps.push({ text: `${name}x is − and ${name}y is −, so the vector is in the 3rd quadrant.`, tex: `\\theta = ${w.ang(180)} + \\theta_{ref} = ${w.ang(theta)}` })
  } else {
    theta = 360 - ref
    steps.push({ text: `${name}x is + and ${name}y is −, so the vector is in the 4th quadrant.`, tex: `\\theta = ${w.ang(360)} - \\theta_{ref} = ${w.ang(theta)}` })
  }
  return theta
}

// ---------------------------------------------------------------------------
// Components, magnitude, direction
// ---------------------------------------------------------------------------

/** Rectangular components from magnitude and angle. */
export function solveComponents(name: string, magnitude: number, thetaDeg: number, unit = '', s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  const t = toRad(thetaDeg)
  const x = magnitude * Math.cos(t)
  const y = magnitude * Math.sin(t)
  const u = unit ? `\\,\\text{${unit}}` : ''
  const steps: Step[] = [
    { text: `Given: magnitude ${name} = ${w.numText(magnitude)}${unit ? ' ' + unit : ''} at θ = ${w.angText(thetaDeg)} with the +x axis.` },
    { text: 'x-component:', tex: `${sub_(name, 'x')} = ${name}\\cos\\theta = ${w.num(magnitude)}\\cos ${w.ang(thetaDeg)} = ${w.num(magnitude)}\\times ${w.numP(Math.cos(t))} = ${w.num(x)}${u}` },
    { text: 'y-component:', tex: `${sub_(name, 'y')} = ${name}\\sin\\theta = ${w.num(magnitude)}\\sin ${w.ang(thetaDeg)} = ${w.num(magnitude)}\\times ${w.numP(Math.sin(t))} = ${w.num(y)}${u}` },
    { text: 'Written with unit vectors:', tex: `${b(name)} = ${w.ijk([x, y, 0])}` }
  ]
  return finish({
    title: `Resolve ${name} into rectangular components`,
    steps,
    answers: [
      { label: `${name}x`, tex: `${w.num(x)}${u}` },
      { label: `${name}y`, tex: `${w.num(y)}${u}` }
    ],
    visual: {
      vectors: [
        { name, v: [x, y, 0], role: 'input' },
        { name: `${name}x`, v: [x, 0, 0], role: 'helper' },
        { name: `${name}y`, v: [0, y, 0], tail: [x, 0, 0], role: 'helper' }
      ],
      mode: 'common-tail'
    }
  })
}

/** Magnitude and direction from components. */
export function solveMagnitudeDirection(A: NamedVec, s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  const { name, v } = A
  const m = len(v)
  const steps: Step[] = [{ text: 'Given components:', tex: `${b(name)} = ${w.ijk(v)}` }]
  if (is3D(v)) {
    steps.push({
      text: 'Magnitude (Pythagorean theorem in 3D):',
      tex: `${name} = \\sqrt{${sub_(name, 'x')}^2 + ${sub_(name, 'y')}^2 + ${sub_(name, 'z')}^2} = \\sqrt{${w.numP(v[0])}^2 + ${w.numP(v[1])}^2 + ${w.numP(v[2])}^2} = \\sqrt{${w.num(dot(v, v))}} = ${w.num(m)}`
    })
    const angs = v.map((c) => toDeg(safeAcos(c / m)))
    ;(['x', 'y', 'z'] as const).forEach((ax, i) => {
      const g = ['\\alpha', '\\beta', '\\gamma'][i]
      steps.push({ text: `Angle with the ${ax}-axis (direction cosine):`, tex: `${g} = \\cos^{-1}\\left(\\frac{${sub_(name, ax)}}{${name}}\\right) = \\cos^{-1}\\left(\\frac{${w.num(v[i])}}{${w.num(m)}}\\right) = ${w.ang(angs[i])}` })
    })
    return finish({
      title: `Magnitude and direction of ${name}`,
      steps,
      answers: [
        { label: `|${name}|`, tex: w.num(m) },
        { label: 'α, β, γ', tex: angs.map((a) => w.ang(a)).join(',\\ ') }
      ],
      visual: { vectors: [{ name, v, role: 'input' }] }
    })
  }
  steps.push({
    text: 'Magnitude :',
    tex: `${name} = \\sqrt{${sub_(name, 'x')}^2 + ${sub_(name, 'y')}^2} = \\sqrt{${w.numP(v[0])}^2 + ${w.numP(v[1])}^2} = \\sqrt{${w.num(dot(v, v))}} = ${w.num(m)}`
  })
  steps.push({ text: 'Direction :' })
  const theta = directionSteps(name, v, steps, s)
  return finish({
    title: `Magnitude and direction of ${name}`,
    steps,
    answers: [
      { label: `|${name}|`, tex: w.num(m) },
      { label: 'θ', tex: w.dir(theta) }
    ],
    visual: { vectors: [{ name, v, role: 'input' }] }
  })
}

/**
 * "Components" for a vector the student already has: in the plane it is resolved from its size
 * and angle, the textbook way; in 3D the components are read straight off the unit-vector form
 * (3î + 4ĵ + 5k̂ has components 3, 4, 5 — resolving its length at its heading gave 4.24 and 5.66).
 */
export function solveResolve(A: NamedVec, s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  if (!is3D(A.v)) return solveComponents(A.name, len(A.v), directionDeg(A.v) || 0, '', s)
  const md = solveMagnitudeDirection(A, s)
  const axes = ['x', 'y', 'z'] as const
  return finish({
    title: `Components of ${A.name}`,
    steps: [
      md.steps[0],
      { text: 'Read each component off the unit-vector form:', tex: axes.map((ax, i) => `${sub_(A.name, ax)} = ${w.num(A.v[i])}`).join(',\\quad ') },
      ...md.steps.slice(1)
    ],
    answers: [...axes.map((ax, i) => ({ label: `${A.name}${ax}`, tex: w.num(A.v[i]) })), ...md.answers],
    visual: {
      vectors: [
        { name: A.name, v: A.v, role: 'input' },
        { name: `${A.name}x`, v: [A.v[0], 0, 0], role: 'helper' },
        { name: `${A.name}y`, v: [0, A.v[1], 0], tail: [A.v[0], 0, 0], role: 'helper' },
        { name: `${A.name}z`, v: [0, 0, A.v[2]], tail: [A.v[0], A.v[1], 0], role: 'helper' }
      ],
      mode: 'common-tail'
    }
  })
}

// ---------------------------------------------------------------------------
// Addition and subtraction
// ---------------------------------------------------------------------------

/** Addition of any number of vectors by rectangular components. */
export function solveAddition(vs: NamedVec[], resultName = 'R', s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  const R = vs.reduce<V3>((acc, x) => add(acc, x.v), [0, 0, 0])
  const threeD = is3D(...vs.map((x) => x.v))
  const axes = threeD ? (['x', 'y', 'z'] as const) : (['x', 'y'] as const)
  const steps: Step[] = [
    { text: 'Write every vector in component form:', tex: vs.map((x) => `${b(x.name)} = ${w.ijk(x.v)}`).join(',\\quad ') },
    { text: 'Add the x-components together, the y-components together' + (threeD ? ' and the z-components together.' : '.') }
  ]
  axes.forEach((ax, i) => {
    steps.push({
      tex: `${sub_(resultName, ax)} = ${vs.map((x) => sub_(x.name, ax)).join(' + ')} = ${vs.map((x) => w.numP(x.v[i])).join(' + ')} = ${w.num(R[i])}`
    })
  })
  steps.push({ text: 'Resultant vector:', tex: `${b(resultName)} = ${w.ijk(R)}` })
  const mSol = solveMagnitudeDirection({ name: resultName, v: R }, s)
  steps.push(...mSol.steps.slice(1))
  return finish({
    title: `Resultant ${resultName} = ${vs.map((x) => x.name).join(' + ')}`,
    steps,
    answers: [{ label: resultName, tex: w.ijk(R) }, ...mSol.answers],
    visual: {
      vectors: [...vs.map((x) => ({ name: x.name, v: x.v, role: 'input' as const })), { name: resultName, v: R, role: 'result' as const }],
      mode: 'head-to-tail'
    }
  })
}

/** Same sum, done the way books do it without components: law of cosines, then law of sines. */
export function solveAdditionCosineLaw(A: NamedVec, B: NamedVec, resultName = 'R', s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  const a = len(A.v)
  const bb = len(B.v)
  const theta = toDeg(angleBetween(A.v, B.v))
  const Rv = add(A.v, B.v)
  const r = Math.sqrt(a * a + bb * bb + 2 * a * bb * Math.cos(toRad(theta)))
  // The angle between R and A is a geometric fact, not the arcsine: arcsine only ever gives an
  // acute angle, so for A = 1∠0°, B = 5∠120° it said 70.89° when R actually sits at 109.11°.
  const alpha = r < 1e-12 ? 0 : toDeg(angleBetween(A.v, Rv))
  const sinAlpha = r < 1e-12 ? 0 : Math.max(-1, Math.min(1, (bb * Math.sin(toRad(theta))) / r))
  const acute = toDeg(Math.asin(sinAlpha))
  const obtuse = alpha > 90 + 1e-9
  if (a < 1e-12 || bb < 1e-12) {
    // The law of cosines needs a triangle; with a zero vector there is none, and every line
    // below would read "undefined".
    const zero = a < 1e-12 ? A : B
    const other = a < 1e-12 ? B : A
    return finish({
      title: `${A.name} + ${B.name} by the law of cosines`,
      steps: [
        { text: `${zero.name} has zero length, so there is no triangle to solve: the sum is just ${other.name}.`, tex: `${b(resultName)} = ${b(other.name)} = ${w.ijk(Rv)}` },
        { tex: `${resultName} = ${w.num(r)}` }
      ],
      answers: [
        { label: resultName, tex: w.num(r) },
        { label: 'angle with ' + A.name, tex: w.ang(0) }
      ],
      visual: { vectors: [{ name: A.name, v: A.v, role: 'input' }, { name: B.name, v: B.v, role: 'input' }, { name: resultName, v: Rv, role: 'result' }], mode: 'common-tail' }
    })
  }
  const steps: Step[] = [
    { text: `Sizes and the angle between them:`, tex: `${mag(A.name)} = ${w.num(a)},\\quad ${mag(B.name)} = ${w.num(bb)},\\quad \\theta = ${w.ang(theta)}` },
    {
      text: `Law of cosines (the angle inside the triangle is ${w.angText(180)} − θ, which flips the sign):`,
      tex: `${resultName}^2 = ${mag(A.name)}^2 + ${mag(B.name)}^2 + 2\\,${mag(A.name)}${mag(B.name)}\\cos\\theta = ${w.num(a * a)} + ${w.num(bb * bb)} + ${w.numP(2 * a * bb * Math.cos(toRad(theta)))}`
    },
    { text: 'So the size of the resultant is', tex: `${resultName} = \\sqrt{${w.num(r * r)}} = ${w.num(r)}` },
    {
      text: `Law of sines gives the angle α between ${resultName} and ${A.name}:`,
      tex: `\\frac{\\sin\\alpha}{${mag(B.name)}} = \\frac{\\sin\\theta}{${resultName}} \\;\\Rightarrow\\; \\sin\\alpha = \\frac{${w.num(bb)}\\sin ${w.ang(theta)}}{${w.num(r)}} = ${w.num(sinAlpha)}`
    }
  ]
  if (obtuse) {
    steps.push({
      text: `sin⁻¹ gives ${w.angText(acute)}, but the sine is the same for ${w.angText(180 - acute)}. ${resultName} leans back past the perpendicular to ${A.name} (${A.name}·${resultName} is negative), so α is the obtuse one:`,
      tex: `\\alpha = ${w.ang(180)} - ${w.ang(acute)} = ${w.ang(alpha)}`
    })
  } else {
    steps.push({ tex: `\\alpha = \\sin^{-1}(${w.num(sinAlpha)}) = ${w.ang(alpha)}` })
  }
  steps.push({ text: 'The component method gives the same answer — use whichever your book prefers.' })
  return finish({
    title: `${A.name} + ${B.name} by the law of cosines`,
    steps,
    answers: [
      { label: resultName, tex: w.num(r) },
      { label: 'angle with ' + A.name, tex: w.ang(alpha) }
    ],
    visual: {
      vectors: [
        { name: A.name, v: A.v, role: 'input' },
        { name: B.name, v: B.v, role: 'input' },
        { name: resultName, v: Rv, role: 'result' }
      ],
      mode: 'parallelogram'
    }
  })
}

/**
 * A drawing scale in the 1, 2, 5 × 10ⁿ family (the same family the grid uses) so the longest
 * vector spans about ten squares. Mirrors niceStep in render/cameraUtils, which cannot be
 * imported here without pulling three.js into the maths.
 */
export function drawingScale(longest: number): number {
  const raw = Math.max(longest, 1e-9) / 10
  const exp = Math.floor(Math.log10(raw))
  const base = raw / Math.pow(10, exp)
  const nice = base < 1.5 ? 1 : base < 3.5 ? 2 : base < 7.5 ? 5 : 10
  return nice * Math.pow(10, exp)
}

/** The drawing method: choose a scale, draw head-to-tail, then measure the closing vector. */
export function solveAdditionGraphical(vs: NamedVec[], resultName = 'R', s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  const total = vs.reduce((acc, v) => add(acc, v.v), [0, 0, 0] as V3)
  const longest = Math.max(...vs.map((v) => len(v.v)))
  const perSquare = drawingScale(longest)
  const steps: Step[] = [
    {
      text: `1. Choose a scale. Here 1 grid square stands for ${w.numText(perSquare)} unit${perSquare === 1 ? '' : 's'}, so the longest vector (${w.numText(longest)}) is ${w.numText(longest / perSquare)} squares and everything fits on the paper.`
    },
    ...vs.map((v, i) => ({
      text: `${i + 2}. Draw ${v.name} to scale at ${w.angText(directionDeg(v.v) || 0)} from the +x axis${i === 0 ? '' : `, starting at the head of ${vs[i - 1].name}`}.`,
      tex: `${mag(v.name)} = ${w.num(len(v.v))} \\;\\to\\; ${w.num(len(v.v) / perSquare)}\\text{ squares}`
    })),
    { text: `${vs.length + 2}. Join the tail of the first vector to the head of the last one. That closing arrow is the resultant.` },
    {
      text: 'Measuring it with a ruler and protractor gives',
      tex: `${resultName} = ${w.num(len(total))},\\quad \\theta = ${w.dir(directionDeg(total) || 0)}`
    },
    { text: 'A drawing is only as accurate as the ruler; the component method gives the exact value.' }
  ]
  return finish({
    title: `${vs.map((v) => v.name).join(' + ')} by drawing (head-to-tail)`,
    steps,
    answers: [{ label: resultName, tex: w.ijk(total) }],
    visual: { vectors: [...vs.map((v) => ({ name: v.name, v: v.v, role: 'input' as const })), { name: resultName, v: total, role: 'result' as const }], mode: 'head-to-tail' }
  })
}

export function solveSubtraction(A: NamedVec, B: NamedVec, resultName = 'R', s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  const R = add(A.v, neg(B.v))
  const steps: Step[] = [
    { text: 'Subtracting a vector means adding its negative (same magnitude, opposite direction):', tex: `${b(A.name)} - ${b(B.name)} = ${b(A.name)} + (-${b(B.name)})` },
    { tex: `-${b(B.name)} = ${w.ijk(neg(B.v))}` }
  ]
  const sum = solveAddition([A, { name: `(-${B.name})`, v: neg(B.v) }], resultName, s)
  steps.push(...sum.steps.slice(1))
  return finish({
    title: `${resultName} = ${A.name} − ${B.name}`,
    steps,
    answers: sum.answers,
    visual: {
      vectors: [
        { name: A.name, v: A.v, role: 'input' },
        { name: B.name, v: B.v, role: 'input' },
        { name: `−${B.name}`, v: neg(B.v), tail: A.v, role: 'helper' },
        { name: resultName, v: R, role: 'result' }
      ],
      mode: 'common-tail'
    }
  })
}

export function solveScalarMultiply(k: number, A: NamedVec, resultName = 'R', s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  const R = scale(A.v, k)
  const steps: Step[] = [
    { text: 'Multiply every component by the scalar:', tex: `${w.num(k)}\\,${b(A.name)} = ${w.num(k)}(${w.ijk(A.v)}) = ${w.ijk(R)}` },
    { text: 'The magnitude is multiplied by |k|:', tex: `\\left|${w.num(k)}\\,${b(A.name)}\\right| = |${w.num(k)}|\\times ${w.num(len(A.v))} = ${w.num(len(R))}` },
    {
      text:
        Math.abs(k) < 1e-12
          ? 'k is zero, so every component is zero: the result is the null vector, which has no direction.'
          : k > 0
            ? 'k is positive, so the direction does not change.'
            : `k is negative, so the direction is reversed (turned through ${w.angText(180)}).`
    }
  ]
  return finish({
    title: `${resultName} = ${w.numText(k)}${A.name}`,
    steps,
    answers: [{ label: resultName, tex: w.ijk(R) }, { label: `|${resultName}|`, tex: w.num(len(R)) }],
    visual: { vectors: [{ name: A.name, v: A.v, role: 'input' }, { name: resultName, v: R, role: 'result' }] }
  })
}

export function solveUnitVector(A: NamedVec, s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  const m = len(A.v)
  const u = normalize(A.v)
  const hat = `\\hat{${A.name.toLowerCase()}}`
  const steps: Step[] = [
    { text: 'A unit vector has magnitude 1 and points the same way as the vector.', tex: `${hat} = \\frac{${b(A.name)}}{${mag(A.name)}}` },
    { tex: `${mag(A.name)} = ${w.num(m)}` },
    { tex: `${hat} = \\frac{${w.ijk(A.v)}}{${w.num(m)}} = ${w.ijk(u)}` },
    { text: 'Check: its magnitude is', tex: `\\sqrt{${u.map((c) => `${w.numP(c)}^2`).join(' + ')}} = ${w.num(len(u))}` }
  ]
  return finish({
    title: `Unit vector along ${A.name}`,
    steps,
    answers: [{ label: 'unit vector', tex: w.ijk(u) }],
    visual: { vectors: [{ name: A.name, v: A.v, role: 'input' }, { name: `${A.name.toLowerCase()}̂`, v: u, role: 'result' }] }
  })
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/** The dot-product working shared by the scalar product, the angle between and work done. */
function dotSteps(A: NamedVec, B: NamedVec, s: SolverSettings) {
  const w = writers(s)
  const d = dot(A.v, B.v)
  const mA = len(A.v)
  const mB = len(B.v)
  const cosT = d / (mA * mB)
  const theta = toDeg(angleBetween(A.v, B.v))
  const steps: Step[] = [
    { text: 'Given:', tex: `${b(A.name)} = ${w.ijk(A.v)},\\quad ${b(B.name)} = ${w.ijk(B.v)}` }
  ]
  if (mA < 1e-12 || mB < 1e-12) {
    // cos θ = A·B / (|A||B|) divides by zero: say so in one sentence instead of printing
    // "undefined" three times and then calling the vectors perpendicular.
    const zero = mA < 1e-12 ? A.name : B.name
    steps.push({ text: `${zero} has zero length, so ${A.name}·${B.name} = 0 and there is no angle between them.`, tex: `${b(A.name)}\\cdot${b(B.name)} = 0` })
    return { d: 0, mA, mB, cosT: NaN, theta: NaN, steps }
  }
  steps.push(
    {
      text: 'Scalar product in terms of rectangular components :',
      tex: `${b(A.name)}\\cdot${b(B.name)} = ${sub_(A.name, 'x')}${sub_(B.name, 'x')} + ${sub_(A.name, 'y')}${sub_(B.name, 'y')} + ${sub_(A.name, 'z')}${sub_(B.name, 'z')}`
    },
    { tex: `= (${w.num(A.v[0])})(${w.num(B.v[0])}) + (${w.num(A.v[1])})(${w.num(B.v[1])}) + (${w.num(A.v[2])})(${w.num(B.v[2])}) = ${w.num(d)}` },
    { text: 'Magnitudes:', tex: `${mag(A.name)} = ${w.num(mA)},\\quad ${mag(B.name)} = ${w.num(mB)}` },
    { text: 'Angle between them :', tex: `\\cos\\theta = \\frac{${b(A.name)}\\cdot${b(B.name)}}{${mag(A.name)}\\,${mag(B.name)}} = \\frac{${w.num(d)}}{${w.num(mA)}\\times${w.num(mB)}} = ${w.num(cosT)}` },
    { tex: `\\theta = \\cos^{-1}(${w.num(cosT)}) = ${w.ang(theta)}` }
  )
  if (Math.abs(d) < 1e-9) steps.push({ text: 'The dot product is zero, so the vectors are perpendicular (θ = 90°).' })
  return { d, mA, mB, cosT, theta, steps }
}

/** Scalar (dot) product and the angle between two vectors. */
export function solveDot(A: NamedVec, B: NamedVec, s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  const { d, mB, cosT, theta, steps } = dotSteps(A, B, s)
  if (!Number.isNaN(theta)) steps.push({ text: `Meaning: ${A.name}·${B.name} = |${A.name}| × (projection of ${B.name} on ${A.name}).`, tex: `${mag(B.name)}\\cos\\theta = ${w.num(mB * cosT)}` })
  return finish({
    title: `Scalar product ${A.name}·${B.name}`,
    steps,
    answers: [{ label: `${A.name}·${B.name}`, tex: w.num(d) }, { label: 'θ', tex: w.ang(theta) }],
    visual: { vectors: [{ name: A.name, v: A.v, role: 'input' }, { name: B.name, v: B.v, role: 'input' }], mode: 'common-tail' }
  })
}

/** The angle between two vectors, from cos θ = A·B / AB — its own question, not the dot product's. */
export function solveAngleBetween(A: NamedVec, B: NamedVec, s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  const { theta, steps } = dotSteps(A, B, s)
  const cr = len(cross(A.v, B.v))
  if (cr < 1e-9 && Math.abs(theta) < 1e-6) steps.push({ text: 'The vectors point the same way (θ = 0°): they are parallel.' })
  if (cr < 1e-9 && Math.abs(theta - 180) < 1e-6) steps.push({ text: 'The vectors point opposite ways (θ = 180°): they are antiparallel.' })
  return finish({
    title: `Angle between ${A.name} and ${B.name}`,
    steps,
    answers: [{ label: 'θ', tex: w.ang(theta) }],
    visual: { vectors: [{ name: A.name, v: A.v, role: 'input' }, { name: B.name, v: B.v, role: 'input' }], mode: 'common-tail' }
  })
}

/** Vector (cross) product via determinant expansion. */
export function solveCross(A: NamedVec, B: NamedVec, resultName = 'C', s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  const [ax, ay, az] = A.v
  const [bx, by, bz] = B.v
  const C = cross(A.v, B.v)
  const mA = len(A.v)
  const mB = len(B.v)
  const mC = len(C)
  const theta = toDeg(angleBetween(A.v, B.v))
  const steps: Step[] = [
    { text: 'Given:', tex: `${b(A.name)} = ${w.ijk(A.v)},\\quad ${b(B.name)} = ${w.ijk(B.v)}` },
    {
      text: 'Write the cross product as a determinant:',
      tex: `${b(A.name)}\\times${b(B.name)} = \\begin{vmatrix} \\hat{i} & \\hat{j} & \\hat{k} \\\\ ${w.num(ax)} & ${w.num(ay)} & ${w.num(az)} \\\\ ${w.num(bx)} & ${w.num(by)} & ${w.num(bz)} \\end{vmatrix}`
    },
    {
      text: 'Expand along the first row:',
      tex: `= \\hat{i}\\,[(${w.num(ay)})(${w.num(bz)}) - (${w.num(az)})(${w.num(by)})] - \\hat{j}\\,[(${w.num(ax)})(${w.num(bz)}) - (${w.num(az)})(${w.num(bx)})] + \\hat{k}\\,[(${w.num(ax)})(${w.num(by)}) - (${w.num(ay)})(${w.num(bx)})]`
    },
    { tex: `${b(resultName)} = ${w.ijk(C)}` },
    { text: 'Magnitude:', tex: `\\left|${b(resultName)}\\right| = \\sqrt{${C.map((c) => `${w.numP(c)}^2`).join(' + ')}} = ${w.num(mC)}` },
    { text: `Check with |${A.name}×${B.name}| = ${A.name}${B.name} sin θ:`, tex: `${w.num(mA)}\\times${w.num(mB)}\\times\\sin ${w.ang(theta)} = ${w.num(mA * mB * Math.sin(toRad(theta)))}` },
    { text: `|${A.name}×${B.name}| is also the area of the parallelogram with sides ${A.name} and ${B.name}.`, tex: `\\text{Area} = ${w.num(mC)}` },
    {
      text: `The direction is perpendicular to the plane of ${A.name} and ${B.name} (right-hand rule). The order matters:`,
      tex: `${b(B.name)}\\times${b(A.name)} = -${b(A.name)}\\times${b(B.name)} = ${w.ijk(neg(C))}`
    }
  ]
  if (mC < 1e-9) steps.push({ text: 'The cross product is the null vector, so the vectors are parallel or antiparallel (θ = 0° or 180°).' })
  return finish({
    title: `Vector product ${A.name}×${B.name}`,
    steps,
    answers: [
      { label: `${A.name}×${B.name}`, tex: w.ijk(C) },
      { label: `|${A.name}×${B.name}|`, tex: w.num(mC) },
      { label: 'θ', tex: w.ang(theta) }
    ],
    visual: {
      vectors: [
        { name: A.name, v: A.v, role: 'input' },
        { name: B.name, v: B.v, role: 'input' },
        { name: resultName, v: C, role: 'result' }
      ],
      mode: 'parallelogram'
    }
  })
}

export function solveProjection(B: NamedVec, A: NamedVec, s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  const d = dot(A.v, B.v)
  const mA = len(A.v)
  const sc = d / mA
  const p = scale(A.v, d / (mA * mA))
  const steps: Step[] = [
    {
      text: `Scalar projection of ${B.name} on ${A.name} (${B.name} cos θ):`,
      tex: `${mag(B.name)}\\cos\\theta = \\frac{${b(A.name)}\\cdot${b(B.name)}}{${mag(A.name)}} = \\frac{${w.num(d)}}{${w.num(mA)}} = ${w.num(sc)}`
    },
    {
      text: `Vector projection (the shadow of ${B.name} along ${A.name}):`,
      tex: `\\text{proj}_{${A.name}}${b(B.name)} = \\frac{${b(A.name)}\\cdot${b(B.name)}}{${mag(A.name)}^2}\\,${b(A.name)} = \\frac{${w.num(d)}}{${w.num(mA * mA)}}(${w.ijk(A.v)}) = ${w.ijk(p)}`
    }
  ]
  return finish({
    title: `Projection of ${B.name} on ${A.name}`,
    steps,
    answers: [
      { label: `${B.name} cos θ`, tex: w.num(sc) },
      { label: `proj of ${B.name} on ${A.name}`, tex: w.ijk(p) }
    ],
    visual: {
      vectors: [
        { name: A.name, v: A.v, role: 'input' },
        { name: B.name, v: B.v, role: 'input' },
        { name: 'proj', v: p, role: 'result' }
      ],
      mode: 'common-tail'
    }
  })
}

// ---------------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------------

/** Resultant of two forces: F1 along +x and F2 at angle θ, by the law of cosines. */
export function solveTwoForces(F1: number, F2: number, thetaDeg: number, unit = 'N', s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  const t = toRad(thetaDeg)
  const Rx = F1 + F2 * Math.cos(t)
  const Ry = F2 * Math.sin(t)
  const R = Math.hypot(Rx, Ry)
  const alpha = toDeg(Math.atan2(Ry, Rx))
  const u = unit ? `\\,\\text{${unit}}` : ''
  const steps: Step[] = [
    { text: `Place F₁ along the +x axis and F₂ at θ = ${w.angText(thetaDeg)} to it.` },
    { text: 'x-component of the resultant:', tex: `R_x = F_1\\cos ${w.ang(0)} + F_2\\cos\\theta = ${w.num(F1)} + ${w.num(F2)}\\cos ${w.ang(thetaDeg)} = ${w.num(Rx)}${u}` },
    { text: 'y-component of the resultant:', tex: `R_y = F_1\\sin ${w.ang(0)} + F_2\\sin\\theta = ${w.num(F2)}\\sin ${w.ang(thetaDeg)} = ${w.num(Ry)}${u}` },
    { text: 'Magnitude:', tex: `R = \\sqrt{R_x^2 + R_y^2} = \\sqrt{${w.numP(Rx)}^2 + ${w.numP(Ry)}^2} = ${w.num(R)}${u}` },
    { text: 'Same result from the law of cosines:', tex: `R = \\sqrt{F_1^2 + F_2^2 + 2F_1F_2\\cos\\theta} = ${w.num(Math.sqrt(F1 * F1 + F2 * F2 + 2 * F1 * F2 * Math.cos(t)))}${u}` },
    { text: 'Direction of R measured from F₁:', tex: `\\alpha = \\tan^{-1}\\left(\\frac{R_y}{R_x}\\right) = ${w.ang(alpha)}` }
  ]
  return finish({
    title: 'Resultant of two forces',
    steps,
    answers: [{ label: 'R', tex: `${w.num(R)}${u}` }, { label: 'α', tex: w.ang(alpha) }],
    visual: {
      vectors: [
        { name: 'F1', v: [F1, 0, 0], role: 'input' },
        { name: 'F2', v: [F2 * Math.cos(t), F2 * Math.sin(t), 0], role: 'input' },
        { name: 'R', v: [Rx, Ry, 0], role: 'result' }
      ],
      mode: 'parallelogram'
    }
  })
}

export function solveEquilibrium(vs: NamedVec[], s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  const sum = solveAddition(vs, 'R', s)
  const R = vs.reduce<V3>((acc, x) => add(acc, x.v), [0, 0, 0])
  const E = neg(R)
  const steps: Step[] = [
    ...sum.steps,
    { text: 'For equilibrium the net force must be zero, so the balancing force (equilibrant) is equal and opposite to R:', tex: `\\vec{E} = -\\vec{R} = ${w.ijk(E)}` },
    { tex: `\\left|\\vec{E}\\right| = ${w.num(len(E))}` }
  ]
  return finish({
    title: 'Force needed for equilibrium',
    steps,
    answers: [{ label: 'E', tex: w.ijk(E) }, { label: '|E|', tex: w.num(len(E)) }],
    visual: { vectors: [...vs.map((x) => ({ name: x.name, v: x.v, role: 'input' as const })), { name: 'E', v: E, role: 'result' }], mode: 'head-to-tail' }
  })
}

export function solveTorque(r: V3, F: V3, s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  const cr = solveCross({ name: 'r', v: r }, { name: 'F', v: F }, 'τ', s)
  const tau = cross(r, F)
  const unit = '\\,\\text{N m}'
  return finish({
    ...cr,
    title: 'Torque τ = r × F',
    steps: [{ text: 'Torque is the vector product of the position vector r and the force F.', tex: '\\vec{\\tau} = \\vec{r}\\times\\vec{F}' }, ...cr.steps],
    answers: [
      { label: 'τ', tex: `${w.ijk(tau)}${unit}` },
      { label: '|τ|', tex: `${w.num(len(tau))}${unit}` },
      cr.answers[2]
    ]
  })
}

/**
 * The arrow to draw for a result whose true size is nothing like its inputs: a magnetic force of
 * 1.6×10⁻¹⁹ N beside a 1 m/s velocity is shorter than the arrow gate can show, so it is drawn at
 * the reference length in its true direction and the label carries the real value. A result
 * within a sensible ratio of the reference is drawn as it is.
 */
export function displayVector(v: V3, reference: number): V3 {
  const L = len(v)
  if (L < 1e-300 || reference < 1e-300) return v
  const ratio = L / reference
  if (ratio >= 0.05 && ratio <= 20) return v
  return scale(v, reference / L)
}

export function solveMagneticForce(q: number, v: V3, B: V3, s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  const vxB = cross(v, B)
  const F = scale(vxB, q)
  const cr = solveCross({ name: 'v', v }, { name: 'B', v: B }, 'v×B', s)
  const ref = Math.max(len(v), len(B))
  const drawn = displayVector(F, ref)
  const toScale = drawn === F
  return finish({
    title: 'Magnetic force F = q(v × B)',
    steps: [
      { text: 'The force on a moving charge is F = q(v × B). First find v × B:' },
      ...cr.steps.slice(0, 5),
      {
        text: `Multiply by the charge q = ${w.sciText(q)} C${q < 0 ? ' (negative, so the force points the opposite way to v × B)' : ''}:`,
        tex: `\\vec{F} = ${q < 0 ? `(${w.sci(q)})` : w.sci(q)}\\,(${w.ijk(vxB)}) = ${w.sciIJK(F)}\\,\\text{N}`
      },
      { tex: `\\left|\\vec{F}\\right| = ${w.sci(len(F))}\\,\\text{N}` }
    ],
    answers: [
      { label: 'F', tex: `${w.sciIJK(F)}\\,\\text{N}` },
      { label: '|F|', tex: `${w.sci(len(F))}\\,\\text{N}` }
    ],
    visual: {
      vectors: [
        { name: 'v', v, role: 'input' },
        { name: 'B', v: B, role: 'input' },
        { name: 'F', v: F, role: 'result', drawn, note: toScale ? undefined : `|F| = ${w.sciText(len(F))} N — arrow not to scale` }
      ],
      mode: 'common-tail'
    }
  })
}

export function solveWork(F: V3, d: V3, s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  const { theta, steps } = dotSteps({ name: 'F', v: F }, { name: 'd', v: d }, s)
  const W = dot(F, d)
  return finish({
    title: 'Work done W = F · d',
    steps: [{ text: 'Work is the scalar product of force and displacement: W = F·d = Fd cos θ.' }, ...steps, { tex: `W = ${w.num(W)}\\,\\text{J}` }],
    answers: [
      { label: 'W', tex: `${w.num(W)}\\,\\text{J}` },
      { label: 'θ', tex: w.ang(theta) }
    ],
    visual: { vectors: [{ name: 'F', v: F, role: 'input' }, { name: 'd', v: d, role: 'input' }], mode: 'common-tail' }
  })
}

// ---------------------------------------------------------------------------
// Names: what a card may be called, and what a drawn answer is called in the scene
// ---------------------------------------------------------------------------

/** Names the expression scope already owns; a card called i would shadow the unit vector. */
const CARD_RESERVED = new Set(['i', 'j', 'k', 'e', 'pi', 'x', 'y', 'z'])

/**
 * The name a vector card may take: letters and digits, starting with a letter, with at most one
 * subscript after a single "_" (v_A, F_1), at most four characters, not a reserved word and not
 * another card's name. Anything else keeps the current name, so a stray keystroke never silently
 * renames a card to something unusable — "A_" alone is \vec{A_}, which KaTeX paints red, and
 * "v__A" is a double subscript.
 */
export function safeCardName(typed: string, current: string, others: string[]): string {
  const cleaned = typed.replace(/[^A-Za-z0-9_]/g, '').slice(0, 4)
  if (!/^[A-Za-z][A-Za-z0-9]*(_[A-Za-z0-9]+)?$/.test(cleaned)) return current
  if (CARD_RESERVED.has(cleaned) || others.includes(cleaned)) return current
  return cleaned
}

/**
 * A solution's vector name written so the scene can read it back: the drawing evaluates
 * expressions with mathjs, which cannot parse −B, â, v_{AB} or v×B as identifiers.
 *   −B → negB     â → ahat     v_{AB} → v_AB     v×B → vxB     τ → tau     A′ → A_
 */
export function sceneName(name: string): string {
  const GREEK: Record<string, string> = { τ: 'tau', θ: 'theta', α: 'alpha', β: 'beta', ω: 'omega', λ: 'lambda', μ: 'mu' }
  let s = name.normalize('NFD')
  s = s.replace(/^[−-]/, 'neg').replace(/̂/g, 'hat').replace(/[×⋅·]/g, 'x').replace(/′/g, '_')
  s = s.replace(/[τθαβωλμ]/g, (g) => GREEK[g])
  s = s.replace(/[^A-Za-z0-9_]/g, '')
  if (!s) return 'v'
  if (!/^[A-Za-z]/.test(s)) s = `v${s}`
  return s
}

// ---------------------------------------------------------------------------
// Drawing the angle θ of a vector
// ---------------------------------------------------------------------------

/**
 * Where the θ arc of a vector at heading `theta` (radians, 0..2π) is drawn: from the +x axis
 * the short way round. Past 180° the arc used to sweep anticlockwise all the way, drawing a
 * 300° arc for a vector pointing down-right, with the label stranded on the far side.
 */
export function headingArc(theta: number): { from: number; to: number; mid: number } {
  const t = theta > Math.PI ? theta - 2 * Math.PI : theta
  return { from: Math.min(0, t), to: Math.max(0, t), mid: t / 2 }
}

// ---------------------------------------------------------------------------
// Laying out a solution's drawing
// ---------------------------------------------------------------------------

export type DrawStyle = 'head-to-tail' | 'parallelogram' | 'common-tail'

/** One thing to put on the drawing for a solution. */
export type DrawItem =
  | {
      kind: 'arrow'
      name: string
      tail: V3
      comp: V3
      role: VisualVector['role']
      /** Helpers, and an arrow drawn at a stand-in length, are never measured as if they were the answer. */
      auxiliary: boolean
      /** An arrow that is not to scale shows its name only, never a size that is not the true one. */
      labelMode?: 'name'
    }
  /** The dashed far side of a parallelogram: a copy of one input placed at the head of the other. */
  | { kind: 'ghost'; name: string; of: string; atHeadOf: string }
  /** A sentence at a point of the drawing, such as the true size of an arrow drawn to a stand-in length. */
  | { kind: 'note'; name: string; at: V3; text: string }

export interface DrawPlan {
  items: DrawItem[]
  /** The arrow to leave selected: the answer, when it is drawn at its true size. */
  select?: string
  is3D: boolean
}

/** Whether a vector is drawn at a stand-in length rather than its own. */
const standIn = (v: VisualVector): boolean => v.drawn !== undefined && v.drawn.some((c, i) => Math.abs(c - v.v[i]) > 1e-12)

/**
 * Where every arrow of a solution goes, as pure data the scene bridge only has to follow.
 * `style` overrides the solution's own picture only when the student chose a layout. Every
 * vector that is not an input is drawn from its own components. A vector whose drawn length is
 * a stand-in (a 1.6×10⁻¹⁹ N force beside a 1 m/s velocity) goes down as a helper with its true
 * value written at its head, so neither the arrow's label nor the Measurements panel ever
 * reports the stand-in length as |F|.
 */
export function planDrawing(vis: NonNullable<Solution['visual']>, style?: DrawStyle): DrawPlan {
  const inputs = vis.vectors.filter((v) => v.role === 'input')
  const others = vis.vectors.filter((v) => v.role !== 'input')
  let mode: DrawStyle = style ?? vis.mode ?? 'common-tail'
  if (mode === 'parallelogram' && inputs.length !== 2) mode = 'head-to-tail'
  const items: DrawItem[] = []
  let select: string | undefined
  const arrow = (v: VisualVector, tail: V3): string => {
    const name = sceneName(v.name)
    const scaled = standIn(v)
    items.push({ kind: 'arrow', name, tail, comp: v.drawn ?? v.v, role: v.role, auxiliary: v.role === 'helper' || scaled, labelMode: scaled ? 'name' : undefined })
    if (scaled && v.note) items.push({ kind: 'note', name: `${name}note`, at: add(tail, v.drawn!), text: v.note })
    if (v.role !== 'helper' && !scaled) select = name
    return name
  }

  if (mode === 'head-to-tail') {
    let cursor: V3 = [0, 0, 0]
    for (const v of inputs) {
      arrow(v, cursor)
      cursor = add(cursor, v.v)
    }
    for (const v of others) arrow(v, v.tail ?? [0, 0, 0])
  } else if (mode === 'parallelogram') {
    const [p, q] = inputs
    const a = arrow(p, [0, 0, 0])
    const bName = arrow(q, [0, 0, 0])
    items.push({ kind: 'ghost', name: `${bName}_`, of: bName, atHeadOf: a })
    items.push({ kind: 'ghost', name: `${a}_`, of: a, atHeadOf: bName })
    for (const v of others) arrow(v, v.tail ?? [0, 0, 0])
  } else {
    for (const v of vis.vectors) arrow(v, v.tail ?? [0, 0, 0])
  }
  return { items, select, is3D: vis.vectors.some((v) => Math.abs((v.drawn ?? v.v)[2]) > 1e-9) }
}
