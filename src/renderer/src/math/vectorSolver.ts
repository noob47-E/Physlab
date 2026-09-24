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
import { angleTo, fmt, fmtSci, formatMeasure, sciExponent, shownValue, stepEq, stepPrecision, tex, texIJK, texMeasure, texSci, vecTex, type MeasureSettings } from './format'

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

/** Not zero, but under the 1e-12 noise floor below which fmt writes 0. */
const tinyReal = (n: number): boolean => n !== 0 && Math.abs(n) < 1e-12

/**
 * A number ready to be substituted into a formula: bracketed when negative, so "− (−3)" never
 * reads "− −3", and when in scientific form, so its square is (3.16×10⁻⁷)², not the
 * "3.16\times 10^{-7}^2" KaTeX refuses as a double superscript.
 */
const bracketed = (n: number, text: string): string => ((n < 0 && Math.abs(n) >= 1e-12) || /\\times/.test(text) ? `(${text})` : text)

/**
 * Writers at one precision, and what a calculator is given for a number written that way. A
 * working line writes its operands through these, at the precision `stepPrecision` chose for it.
 */
function writersAt(q: SolverSettings) {
  const num = (n: number) => texMeasure(n, 'number', q)
  const read = (n: number) => shownValue(formatMeasure(n, 'number', q))
  return {
    num,
    numP: (n: number) => bracketed(n, num(n)),
    /**
     * A number a line calculates with that may sit below the noise floor fmt applies: the sum of
     * squares of 1×10⁻⁷ and 3×10⁻⁷ is 1×10⁻¹³, which num writes as 0 ("√0 = 3.16×10⁻⁷").
     */
    sci: (n: number) => (tinyReal(n) ? texSci(n, q) : num(n)),
    readSci: (n: number) => (tinyReal(n) ? shownValue(fmtSci(n, q)) : read(n)),
    /** A vector written at this precision, for a line that calculates with its components. */
    ijk: (v: V3) => texIJK(v, q),
    text: (n: number) => formatMeasure(n, 'number', q),
    ang: (deg: number) => (Number.isNaN(deg) ? '\\text{undefined}' : texMeasure(toRad(deg), 'angle', q)),
    /** The number a student types into a calculator after reading `n` off the screen. */
    read,
    /** An angle read off the screen and typed in the student's angle mode, back in degrees. */
    readAng: (deg: number) => toDeg(angleTo(shownValue(formatMeasure(toRad(deg), 'angle', q)), q.angleUnit))
  }
}

/** The number/angle writers for one solution, bound to the student's settings. */
function writers(s: SolverSettings) {
  const num = (n: number) => texMeasure(n, 'number', s)
  const tiny = (n: number) => n !== 0 && Math.abs(n) < 1e-12
  return {
    /**
     * The writers for one working line's operands (Fix 4): the student's precision when the line
     * already holds as written, else the fewest extra digits that make it hold. `check` gets the
     * writers at a trial precision and says whether a calculator fed those numbers would give the
     * line's result as written. `eq` is the sign to put before the result: = when it holds, ≈ when
     * no number of digits can make it (see stepPrecision in format.ts, the one rule for this).
     */
    guard: (check: (o: ReturnType<typeof writersAt>) => boolean) => {
      const r = stepPrecision(s, (q) => check(writersAt(q)))
      return { ...writersAt(r.q), eq: stepEq(r.holds) }
    },
    /** Two numbers that are written the same at precision q (the student's, unless given). */
    same: (a: number, b: number, q: SolverSettings = s) => formatMeasure(a, 'number', q) === formatMeasure(b, 'number', q),
    /** `same` for values that may be below the noise floor, compared as `sci` writes them. */
    sameSci: (a: number, b: number, q: SolverSettings = s) => writersAt(q).sci(a) === writersAt(q).sci(b),
    /** Two angles, in degrees, that are written the same in the student's angle unit. */
    sameAng: (aDeg: number, bDeg: number) => formatMeasure(toRad(aDeg), 'angle', s) === formatMeasure(toRad(bDeg), 'angle', s),
    /**
     * The precision a result must be written at so the next line can use it (a cos before its
     * cos⁻¹), and the sign that link takes: `holds: false` means no digits made it true, and the
     * link is then written ≈ — an "=" there would be the very falsehood this rule removes.
     */
    resultPrecision: (check: (q: SolverSettings) => boolean) => {
      const r = stepPrecision(s, check)
      return { at: writersAt(r.q), q: r.q, eq: stepEq(r.holds) }
    },
    /** A number in LaTeX. */
    num,
    /**
     * A number that may be far below the noise floor: fmt writes anything under 1e-12 as 0 so
     * a dragged point never shows 3×10⁻¹⁷, but a charge of 1.6×10⁻¹⁹ C is a real number. The
     * split into mantissa and exponent is fmtSci's, which rounds before choosing the power of
     * ten; splitting by hand here wrote 9.99999×10⁻²⁰ as "10×10⁻²⁰".
     */
    sci: (n: number) => (tiny(n) ? texSci(n, s) : num(n)),
    sciText: (n: number) => (tiny(n) ? fmtSci(n, s) : formatMeasure(n, 'number', s)),
    /** A vector whose components are all that tiny, written as (mantissa vector) × 10ⁿ. */
    sciIJK: (v: V3) => {
      const big = Math.max(...v.map(Math.abs))
      if (!tiny(big)) return texIJK(v, s)
      const e = sciExponent(big, s)
      return `\\left(${texIJK(scale(v, Math.pow(10, -e)), s)}\\right)\\times 10^{${e}}`
    },
    /** A number wrapped in brackets when negative or in scientific form, for substituting into a formula. */
    numP: (n: number) => bracketed(n, num(n)),
    /** An angle given in degrees, written in the chosen unit; the zero vector's is undefined. */
    ang: (deg: number) => (Number.isNaN(deg) ? '\\text{undefined}' : texMeasure(toRad(deg), 'angle', s)),
    /** A direction from +x given in degrees, written in the chosen unit or as a bearing. */
    dir: (deg: number) => (Number.isNaN(deg) ? '\\text{undefined}' : texMeasure(toRad(deg), 'direction', s)),
    /** Plain-text versions for sentences. */
    numText: (n: number) => formatMeasure(n, 'number', s),
    angText: (deg: number) => (Number.isNaN(deg) ? 'undefined' : formatMeasure(toRad(deg), 'angle', s)),
    dirText: (deg: number) => (Number.isNaN(deg) ? 'undefined' : formatMeasure(toRad(deg), 'direction', s)),
    ijk: (v: V3) => texIJK(v, s)
  }
}

/** θ measured anticlockwise from +x, 0..360°, or NaN for the zero vector. */
export const directionDeg = (v: V3): number => (Math.abs(v[0]) < 1e-12 && Math.abs(v[1]) < 1e-12 ? NaN : toDeg(heading(v)))

/** Inverse trig in degrees, clamped so a rounded 1.0000001 is still a number. */
const clamp1 = (x: number): number => Math.max(-1, Math.min(1, x))
const acosD = (x: number): number => toDeg(Math.acos(clamp1(x)))
const asinD = (x: number): number => toDeg(Math.asin(clamp1(x)))
const atanD = (x: number): number => toDeg(Math.atan(x))
const cosD = (deg: number): number => Math.cos(toRad(deg))
const sinD = (deg: number): number => Math.sin(toRad(deg))

/**
 * θ measured from +x (0..360°) with a quadrant explanation. The first step says "Direction." in
 * its own sentence: a separate step reading only "Direction :" promised working it never showed.
 */
function directionSteps(name: string, v: V3, steps: Step[], s: SolverSettings): number {
  const w = writers(s)
  const [x, y] = v
  const ref = toDeg(Math.atan(Math.abs(y) / Math.abs(x || 1e-300)))
  let theta: number
  if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) {
    steps.push({ text: 'Direction: the vector has zero length, so its direction is undefined.' })
    return NaN
  }
  if (Math.abs(x) < 1e-12) {
    theta = y > 0 ? 90 : 270
    steps.push({ text: `Direction: ${name}x = 0, so the vector points straight along the ${y > 0 ? '+y' : '−y'} axis.`, tex: `\\theta = ${w.ang(theta)}` })
    return theta
  }
  if (Math.abs(y) < 1e-12) {
    theta = x > 0 ? 0 : 180
    steps.push({ text: `Direction: ${name}y = 0, so the vector points straight along the ${x > 0 ? '+x' : '−x'} axis.`, tex: `\\theta = ${w.ang(theta)}` })
    return theta
  }
  const g = w.guard((o) => w.sameAng(atanD(Math.abs(o.read(y)) / Math.abs(o.read(x))), ref))
  steps.push({
    text: 'Direction. First the reference angle, ignoring the signs:',
    tex: `\\theta_{ref} = \\tan^{-1}\\left(\\frac{|${sub_(name, 'y')}|}{|${sub_(name, 'x')}|}\\right) = \\tan^{-1}\\left(\\frac{${g.num(Math.abs(y))}}{${g.num(Math.abs(x))}}\\right) ${g.eq} ${w.ang(ref)}`
  })
  // "θ = 180° − θref" is worked from θref as written on the line above (in radians, from π as
  // written too), so both are written with the digits that make the subtraction come out right.
  const turn = (base: number, sign: 1 | -1): string => {
    const t = w.guard((o) => w.sameAng(o.readAng(base) + sign * o.readAng(ref), base + sign * ref))
    return `\\theta = ${w.ang(base)} ${sign === 1 ? '+' : '-'} \\theta_{ref} = ${t.ang(base)} ${sign === 1 ? '+' : '-'} ${t.ang(ref)} ${t.eq} ${w.ang(base + sign * ref)}`
  }
  if (x > 0 && y >= 0) {
    theta = ref
    steps.push({ text: `${name}x is + and ${name}y is +, so the vector is in the 1st quadrant.`, tex: `\\theta = \\theta_{ref} = ${w.ang(theta)}` })
  } else if (x < 0 && y >= 0) {
    theta = 180 - ref
    steps.push({ text: `${name}x is − and ${name}y is +, so the vector is in the 2nd quadrant.`, tex: turn(180, -1) })
  } else if (x < 0 && y < 0) {
    theta = 180 + ref
    steps.push({ text: `${name}x is − and ${name}y is −, so the vector is in the 3rd quadrant.`, tex: turn(180, 1) })
  } else {
    theta = 360 - ref
    steps.push({ text: `${name}x is + and ${name}y is −, so the vector is in the 4th quadrant.`, tex: turn(360, -1) })
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
  // 10 cos 30° = 10 × 0.87 = 8.66 was false as written (10 × 0.87 is 8.7): the cosine is written
  // with the digits that make the multiplication give the component, here 0.866.
  const part = (trig: 'cos' | 'sin', value: number, f: (deg: number) => number): string => {
    const g = w.guard((o) => w.same(o.read(magnitude) * o.read(f(thetaDeg)), value) && w.same(o.read(magnitude) * f(o.readAng(thetaDeg)), value))
    return `${sub_(name, trig === 'cos' ? 'x' : 'y')} = ${name}\\${trig}\\theta = ${g.num(magnitude)}\\${trig} ${g.ang(thetaDeg)} = ${g.num(magnitude)}\\times ${g.numP(f(thetaDeg))} ${g.eq} ${w.num(value)}${u}`
  }
  const steps: Step[] = [
    { text: `Given: magnitude ${name} = ${w.numText(magnitude)}${unit ? ' ' + unit : ''} at θ = ${w.angText(thetaDeg)} with the +x axis.` },
    { text: 'x-component:', tex: part('cos', x, cosD) },
    { text: 'y-component:', tex: part('sin', y, sinD) },
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

/**
 * "√(x² + y²) = √(sum) = m", every link true as written: the sum under the root is written with
 * the digits its square root needs, and the components with the digits that make their squares
 * add up to that sum and root to m. √(0.5² + 8.33²) is 8.3450 — 8.34, not the 8.35 it claimed —
 * because the 8.33 had been rounded from 8.3301.
 */
function rootOfSquares(w: ReturnType<typeof writers>, comps: number[], m: number): string {
  const sum = comps.reduce((acc, c) => acc + c * c, 0)
  const r = w.resultPrecision((q) => w.same(Math.sqrt(writersAt(q).readSci(sum)), m))
  const g = w.guard((o) => {
    const back = comps.reduce((acc, c) => acc + o.read(c) ** 2, 0)
    return w.same(Math.sqrt(back), m) && w.sameSci(back, sum, r.q)
  })
  return `\\sqrt{${comps.map((c) => `${g.numP(c)}^2`).join(' + ')}} ${g.eq} \\sqrt{${r.at.sci(sum)}} ${r.eq} ${w.num(m)}`
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
      tex: `${name} = \\sqrt{${sub_(name, 'x')}^2 + ${sub_(name, 'y')}^2 + ${sub_(name, 'z')}^2} = ${rootOfSquares(w, [v[0], v[1], v[2]], m)}`
    })
    const angs = v.map((c) => toDeg(safeAcos(c / m)))
    ;(['x', 'y', 'z'] as const).forEach((ax, i) => {
      const g = ['\\alpha', '\\beta', '\\gamma'][i]
      const o = w.guard((o) => w.sameAng(acosD(o.read(v[i]) / o.read(m)), angs[i]))
      steps.push({ text: `Angle with the ${ax}-axis (direction cosine):`, tex: `${g} = \\cos^{-1}\\left(\\frac{${sub_(name, ax)}}{${name}}\\right) = \\cos^{-1}\\left(\\frac{${o.num(v[i])}}{${o.num(m)}}\\right) ${o.eq} ${w.ang(angs[i])}` })
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
    text: 'Magnitude:',
    tex: `${name} = \\sqrt{${sub_(name, 'x')}^2 + ${sub_(name, 'y')}^2} = ${rootOfSquares(w, [v[0], v[1]], m)}`
  })
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
    // 1.004 + 1.004 is 2.008, which rounds to 2.01 — but written "1 + 1 = 2.01" it is false.
    const g = w.guard((o) => w.same(vs.reduce((acc, x) => acc + o.read(x.v[i]), 0), R[i]))
    steps.push({
      tex: `${sub_(resultName, ax)} = ${vs.map((x) => sub_(x.name, ax)).join(' + ')} = ${vs.map((x) => g.numP(x.v[i])).join(' + ')} ${g.eq} ${w.num(R[i])}`
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
  // Each line is worked from the numbers written in it (Fix 4). R² is written with the digits
  // its square root needs; sin α with the digits its sin⁻¹ needs — sin⁻¹(0.55) is 33.37°, not the
  // 33.43° it used to claim, because the true sine was 0.55099.
  const term = 2 * a * bb * cosD(theta)
  const rR2 = w.resultPrecision((q) => w.same(Math.sqrt(writersAt(q).readSci(r * r)), r))
  const cl = w.guard(
    (o) =>
      w.sameSci(o.read(a) ** 2 + o.read(bb) ** 2 + 2 * o.read(a) * o.read(bb) * cosD(o.readAng(theta)), r * r, rR2.q) &&
      w.sameSci(o.readSci(a * a) + o.readSci(bb * bb) + o.readSci(term), r * r, rR2.q)
  )
  const rSin = w.resultPrecision((q) => w.sameAng(asinD(writersAt(q).read(sinAlpha)), acute))
  const sinAt = rSin.at
  const sl = w.guard((o) => w.same((o.read(bb) * sinD(o.readAng(theta))) / o.read(r), sinAlpha, rSin.q))
  const steps: Step[] = [
    { text: `Sizes and the angle between them:`, tex: `${mag(A.name)} = ${w.num(a)},\\quad ${mag(B.name)} = ${w.num(bb)},\\quad \\theta = ${w.ang(theta)}` },
    {
      text: `Law of cosines (the angle inside the triangle is ${w.angText(180)} − θ, which flips the sign):`,
      tex:
        `${resultName}^2 = ${mag(A.name)}^2 + ${mag(B.name)}^2 + 2\\,${mag(A.name)}${mag(B.name)}\\cos\\theta` +
        ` = ${cl.numP(a)}^2 + ${cl.numP(bb)}^2 + 2\\times ${cl.numP(a)}\\times ${cl.numP(bb)}\\cos ${cl.ang(theta)}` +
        ` ${cl.eq} ${cl.sci(a * a)} + ${cl.sci(bb * bb)} ${term < 0 ? '-' : '+'} ${cl.sci(Math.abs(term))} ${cl.eq} ${rR2.at.sci(r * r)}`
    },
    { text: 'So the size of the resultant is', tex: `${resultName} = \\sqrt{${rR2.at.sci(r * r)}} ${rR2.eq} ${w.num(r)}` },
    {
      text: `Law of sines gives the angle α between ${resultName} and ${A.name}:`,
      tex: `\\frac{\\sin\\alpha}{${mag(B.name)}} = \\frac{\\sin\\theta}{${resultName}} \\;\\Rightarrow\\; \\sin\\alpha = \\frac{${sl.num(bb)}\\sin ${sl.ang(theta)}}{${sl.num(r)}} ${sl.eq} ${sinAt.num(sinAlpha)}`
    }
  ]
  if (obtuse) {
    const t = w.guard((o) => w.sameAng(o.readAng(180) - o.readAng(acute), alpha))
    steps.push({
      text: `sin⁻¹ gives ${w.angText(acute)}, but the sine is the same for ${w.angText(180 - acute)}. ${resultName} leans back past the perpendicular to ${A.name} (${A.name}·${resultName} is negative), so α is the obtuse one:`,
      tex: `\\sin^{-1}(${sinAt.num(sinAlpha)}) ${rSin.eq} ${w.ang(acute)},\\quad \\alpha = ${t.ang(180)} - ${t.ang(acute)} ${t.eq} ${w.ang(alpha)}`
    })
  } else {
    steps.push({ tex: `\\alpha = \\sin^{-1}(${sinAt.num(sinAlpha)}) ${rSin.eq} ${w.ang(alpha)}` })
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
  // The panels number every step themselves, so the sentences carry no "1." of their own: they
  // used to read "1 1. Choose a scale", and the last two steps had no number at all.
  const squares = (L: number): string => {
    const g = w.guard((o) => w.same(o.read(L) / perSquare, L / perSquare))
    // Bracketed in scientific form: "3.16×10⁻⁷ ÷ 2×10⁻⁸" read left to right multiplies by 10⁻⁸.
    return `${g.numP(L)} \\div ${bracketed(perSquare, tex(perSquare, 12))} ${g.eq} ${w.num(L / perSquare)}\\text{ squares}`
  }
  // What a ruler and protractor actually read: a tenth of a square and a whole degree. The old
  // line said "measuring gives R = 8.35, θ = 86.57°", which is the calculation, not a reading.
  const R = len(total)
  const tenths = Math.round((R / perSquare) * 10) / 10
  const protractor = Math.round(directionDeg(total) || 0)
  const steps: Step[] = [
    {
      text: `Choose a scale. Here 1 grid square stands for ${fmt(perSquare, 12)} unit${perSquare === 1 ? '' : 's'}, so the longest vector (${w.numText(longest)}) is ${w.numText(longest / perSquare)} squares and everything fits on the paper.`
    },
    ...vs.map((v, i) => ({
      text: `Draw ${v.name} to scale at ${w.angText(directionDeg(v.v) || 0)} from the +x axis${i === 0 ? '' : `, starting at the head of ${vs[i - 1].name}`}.`,
      tex: `${mag(v.name)} = ${w.num(len(v.v))} \\;\\to\\; ${squares(len(v.v))}`
    })),
    { text: 'Join the tail of the first vector to the head of the last one. That closing arrow is the resultant.' },
    {
      text: 'Measure the closing arrow: read to a tenth of a square with the ruler and to the nearest degree with the protractor, it comes to about',
      tex: `${resultName} \\approx ${tex(tenths, 1)}\\text{ squares} \\times ${tex(perSquare, 12)} = ${w.num(tenths * perSquare)},\\quad \\theta \\approx ${tex(protractor, 0)}^\\circ`
    },
    {
      text: `A drawing is only as accurate as the ruler and protractor. The component method gives ${resultName} = ${w.numText(R)} at θ = ${w.dirText(directionDeg(total) || 0)}.`
    }
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
  const size = len(A.v)
  // "3(1î + 1ĵ) = 3.01î + 3.01ĵ" was false as written (3 × 1 is 3): the components, k and |A| are
  // written with the digits that make every product give the component or size shown after it.
  // One precision serves both lines, so k is the same number wherever it appears.
  const g = w.guard(
    (o) => A.v.every((c, i) => w.same(o.read(k) * o.read(c), R[i])) && w.same(Math.abs(o.read(k)) * o.read(size), Math.abs(k) * size)
  )
  const kA = `${g.num(k)}\\,${b(A.name)}`
  const steps: Step[] = [
    { text: 'Multiply every component by the scalar:', tex: `${kA} = ${g.num(k)}(${g.ijk(A.v)}) ${g.eq} ${w.ijk(R)}` },
    { text: 'The magnitude is multiplied by |k|:', tex: `\\left|${kA}\\right| = |${g.num(k)}|\\times ${g.num(size)} ${g.eq} ${w.num(Math.abs(k) * size)}` },
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
    title: `${resultName} = ${g.text(k)}${A.name}`,
    steps,
    answers: [{ label: resultName, tex: w.ijk(R) }, { label: `|${resultName}|`, tex: w.num(len(R)) }],
    visual: { vectors: [{ name: A.name, v: A.v, role: 'input' }, { name: resultName, v: R, role: 'result' }] }
  })
}

/**
 * √(u₁² + u₂²) = 1 for a unit vector, with the components written to the digits that make the
 * check come out as 1 when a student works it: 0.45² + 0.89² is 0.9946, and its root is 0.997.
 */
function unitCheck(w: ReturnType<typeof writers>, u: number[]): string {
  const size = Math.sqrt(u.reduce((acc, c) => acc + c * c, 0))
  const g = w.guard((o) => w.same(Math.sqrt(u.reduce((acc, c) => acc + o.read(c) ** 2, 0)), size))
  return `\\sqrt{${u.map((c) => `${g.numP(c)}^2`).join(' + ')}} ${g.eq} ${w.num(size)}`
}

export function solveUnitVector(A: NamedVec, s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  const m = len(A.v)
  const u = normalize(A.v)
  const hat = `\\hat{${A.name.toLowerCase()}}`
  // (−0.55î …)/4.4 = −0.12î was false as written (a calculator gives −0.125): each component and
  // the size are written with the digits that make every division give the component shown.
  const g = w.guard((o) => m < 1e-12 || A.v.every((c, i) => w.same(o.read(c) / o.read(m), u[i])))
  const steps: Step[] = [
    { text: 'A unit vector has magnitude 1 and points the same way as the vector.', tex: `${hat} = \\frac{${b(A.name)}}{${mag(A.name)}}` },
    { tex: `${mag(A.name)} = ${w.num(m)}` },
    { tex: `${hat} = \\frac{${g.ijk(A.v)}}{${g.num(m)}} ${g.eq} ${w.ijk(u)}` },
    { text: 'Check: its magnitude is', tex: unitCheck(w, is3D(A.v) ? u : [u[0], u[1]]) }
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
  // A plane pair has no z-terms to write: "+ (0)(0)" added nothing and read as a step of its own.
  const axes = is3D(A.v, B.v) ? [0, 1, 2] : [0, 1]
  const xyz = ['x', 'y', 'z']
  const pr = w.guard((o) => w.same(axes.reduce((acc, i) => acc + o.read(A.v[i]) * o.read(B.v[i]), 0), d))
  // cos θ is written with the digits its cos⁻¹ needs (cos⁻¹(0.39) is 67.05°, not the 66.87° it
  // used to claim), and the division before it with the digits that give that cos θ.
  const rCos = w.resultPrecision((q) => w.sameAng(acosD(writersAt(q).read(cosT)), theta))
  const cosAt = rCos.at
  const dv = w.guard((o) => w.same(o.read(d) / (o.read(mA) * o.read(mB)), cosT, rCos.q))
  steps.push(
    {
      text: 'Scalar product in terms of rectangular components:',
      tex: `${b(A.name)}\\cdot${b(B.name)} = ${axes.map((i) => `${sub_(A.name, xyz[i])}${sub_(B.name, xyz[i])}`).join(' + ')}`
    },
    { tex: `= ${axes.map((i) => `(${pr.num(A.v[i])})(${pr.num(B.v[i])})`).join(' + ')} ${pr.eq} ${w.num(d)}` },
    { text: 'Magnitudes:', tex: `${mag(A.name)} = ${w.num(mA)},\\quad ${mag(B.name)} = ${w.num(mB)}` },
    {
      text: 'Angle between them:',
      tex: `\\cos\\theta = \\frac{${b(A.name)}\\cdot${b(B.name)}}{${mag(A.name)}\\,${mag(B.name)}} = \\frac{${dv.num(d)}}{${dv.num(mA)}\\times${dv.num(mB)}} ${dv.eq} ${cosAt.num(cosT)}`
    },
    { tex: `\\theta = \\cos^{-1}(${cosAt.num(cosT)}) ${rCos.eq} ${w.ang(theta)}` }
  )
  if (Math.abs(d) < 1e-9) steps.push({ text: 'The dot product is zero, so the vectors are perpendicular (θ = 90°).' })
  return { d, mA, mB, cosT, theta, steps }
}

/** Scalar (dot) product and the angle between two vectors. */
export function solveDot(A: NamedVec, B: NamedVec, s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  const { d, mB, cosT, theta, steps } = dotSteps(A, B, s)
  if (!Number.isNaN(theta)) {
    const g = w.guard((o) => w.same(o.read(mB) * cosD(o.readAng(theta)), mB * cosT))
    steps.push({
      text: `Meaning: ${A.name}·${B.name} = |${A.name}| × (projection of ${B.name} on ${A.name}).`,
      tex: `${mag(B.name)}\\cos\\theta = ${g.num(mB)}\\cos ${g.ang(theta)} ${g.eq} ${w.num(mB * cosT)}`
    })
  }
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
  // The determinant's entries are written with the digits that make each bracket, worked by a
  // student, give the component written on the next line.
  const brackets = (o: ReturnType<typeof writersAt>): number[] => {
    const [px, py, pz] = [o.read(ax), o.read(ay), o.read(az)]
    const [qx, qy, qz] = [o.read(bx), o.read(by), o.read(bz)]
    return [py * qz - pz * qy, -(px * qz - pz * qx), px * qy - py * qx]
  }
  const e = w.guard((o) => brackets(o).every((c, i) => w.same(c, C[i])))
  const sizeCheck = w.guard((o) => w.same(o.read(mA) * o.read(mB) * sinD(o.readAng(theta)), mA * mB * sinD(theta)))
  const steps: Step[] = [
    { text: 'Given:', tex: `${b(A.name)} = ${w.ijk(A.v)},\\quad ${b(B.name)} = ${w.ijk(B.v)}` },
    {
      text: 'Write the cross product as a determinant:',
      tex: `${b(A.name)}\\times${b(B.name)} = \\begin{vmatrix} \\hat{i} & \\hat{j} & \\hat{k} \\\\ ${e.num(ax)} & ${e.num(ay)} & ${e.num(az)} \\\\ ${e.num(bx)} & ${e.num(by)} & ${e.num(bz)} \\end{vmatrix}`
    },
    {
      text: 'Expand along the first row:',
      tex: `= \\hat{i}\\,[(${e.num(ay)})(${e.num(bz)}) - (${e.num(az)})(${e.num(by)})] - \\hat{j}\\,[(${e.num(ax)})(${e.num(bz)}) - (${e.num(az)})(${e.num(bx)})] + \\hat{k}\\,[(${e.num(ax)})(${e.num(by)}) - (${e.num(ay)})(${e.num(bx)})]`
    },
    { tex: `${b(resultName)} ${e.eq} ${w.ijk(C)}` },
    { text: 'Magnitude:', tex: `\\left|${b(resultName)}\\right| = ${rootOfSquares(w, [C[0], C[1], C[2]], mC)}` },
    {
      text: `Check with |${A.name}×${B.name}| = ${A.name}${B.name} sin θ:`,
      tex: `${sizeCheck.num(mA)}\\times${sizeCheck.num(mB)}\\times\\sin ${sizeCheck.ang(theta)} ${sizeCheck.eq} ${w.num(mA * mB * sinD(theta))}`
    },
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
  const title = `Projection of ${B.name} on ${A.name}`
  const visual: Solution['visual'] = {
    vectors: [
      { name: A.name, v: A.v, role: 'input' },
      { name: B.name, v: B.v, role: 'input' }
    ],
    mode: 'common-tail'
  }
  // Dividing by |A| = 0 printed "undefined" three times over; a zero vector has no direction to project onto.
  if (mA < 1e-12) {
    return finish({
      title,
      steps: [{ text: `${A.name} has zero length, so there is no direction to project ${B.name} onto.` }],
      answers: [
        { label: `${B.name} cos θ`, tex: '\\text{undefined}' },
        { label: `proj of ${B.name} on ${A.name}`, tex: '\\text{undefined}' }
      ],
      visual
    })
  }
  const sc = d / mA
  const p = scale(A.v, d / (mA * mA))
  // Both divisions are written with the digits that give the next number when worked by hand:
  // −20.22 ÷ 0.76 is −26.61, not the −26.55 the line used to claim from the unrounded values.
  const shown = writersAt(s)
  const g1 = w.guard((o) => w.same(o.read(d) / o.read(mA), sc))
  const g2 = w.guard((o) => A.v.every((c, i) => w.same((o.read(d) / o.read(mA * mA)) * shown.read(c), p[i])))
  const steps: Step[] = [
    {
      text: `Scalar projection of ${B.name} on ${A.name} (${B.name} cos θ):`,
      tex: `${mag(B.name)}\\cos\\theta = \\frac{${b(A.name)}\\cdot${b(B.name)}}{${mag(A.name)}} = \\frac{${g1.num(d)}}{${g1.num(mA)}} ${g1.eq} ${w.num(sc)}`
    },
    {
      text: `Vector projection (the shadow of ${B.name} along ${A.name}):`,
      tex: `\\text{proj}_{${A.name}}${b(B.name)} = \\frac{${b(A.name)}\\cdot${b(B.name)}}{${mag(A.name)}^2}\\,${b(A.name)} = \\frac{${g2.num(d)}}{${g2.num(mA * mA)}}(${w.ijk(A.v)}) ${g2.eq} ${w.ijk(p)}`
    }
  ]
  return finish({
    title,
    steps,
    answers: [
      { label: `${B.name} cos θ`, tex: w.num(sc) },
      { label: `proj of ${B.name} on ${A.name}`, tex: w.ijk(p) }
    ],
    visual: { ...visual, vectors: [...visual.vectors, { name: 'proj', v: p, role: 'result' }] }
  })
}

/**
 * v_AB = v_A − v_B, named from the cards. A card already called v_1 keeps its name — "v_v_1" is
 * a double subscript KaTeX paints red — and gives just its subscript to the answer: v_1 − v_2
 * is v_{12}, as a book writes it, while A − B is v_{A} − v_{B} = v_{AB}.
 */
export function solveRelativeVelocity(A: NamedVec, B: NamedVec, s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const subscript = (n: string) => n.match(/^[A-Za-z][A-Za-z0-9]*_\{?([A-Za-z0-9]+)\}?$/)?.[1]
  const velocity = (n: string) => (subscript(n) ? n : `v_{${n}}`)
  const tag = (n: string) => subscript(n) ?? n
  const sol = solveSubtraction({ name: velocity(A.name), v: A.v }, { name: velocity(B.name), v: B.v }, `v_{${tag(A.name)}${tag(B.name)}}`, s)
  return { ...sol, title: `Velocity of ${plain(A.name)} relative to ${plain(B.name)}` }
}

// ---------------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------------

/**
 * The direction of the resultant from F₁, with the numbers put in. tan⁻¹(R_y/R_x) is only α while
 * R_x is positive: for 1 N and 7.5 N at 150° a calculator gives −34.3°, but R sits at 145.7°, so
 * when R leans back past the perpendicular the working says so and takes the angle from 180°.
 */
function forceDirection(w: ReturnType<typeof writers>, Rx: number, Ry: number, alpha: number): Step[] {
  if (Math.hypot(Rx, Ry) < 1e-12) return [{ text: 'The forces cancel, so the resultant is zero and has no direction.' }]
  if (Math.abs(Rx) < 1e-12) return [{ text: `Rx = 0, so R is at right angles to F₁.`, tex: `\\alpha = ${w.ang(alpha)}` }]
  const frac = (o: ReturnType<typeof writersAt>, abs: boolean): string => `\\frac{${o.num(abs ? Math.abs(Ry) : Ry)}}{${o.num(abs ? Math.abs(Rx) : Rx)}}`
  if (Rx > 0) {
    const g = w.guard((o) => w.sameAng(atanD(o.read(Ry) / o.read(Rx)), alpha))
    return [
      {
        text: 'Direction of R measured from F₁:',
        tex: `\\alpha = \\tan^{-1}\\left(\\frac{R_y}{R_x}\\right) = \\tan^{-1}\\left(${frac(g, false)}\\right) ${g.eq} ${w.ang(alpha)}`
      }
    ]
  }
  const g = w.guard((o) => w.sameAng(o.readAng(180) - atanD(o.read(Math.abs(Ry)) / o.read(Math.abs(Rx))), Math.abs(alpha)))
  const inner = (half: string, nums: string): string => `${half} - \\tan^{-1}\\left(${nums}\\right)`
  const sym = '\\frac{|R_y|}{|R_x|}'
  return [
    Ry >= 0
      ? {
          text: `Rx is negative, so R leans back past the perpendicular to F₁ and α is more than ${w.angText(90)}:`,
          tex: `\\alpha = ${inner(w.ang(180), sym)} = ${inner(g.ang(180), frac(g, true))} ${g.eq} ${w.ang(alpha)}`
        }
      : {
          text: `Rx and Ry are both negative, so R points back and below F₁: α is measured clockwise, and is negative.`,
          tex: `\\alpha = -\\left(${inner(w.ang(180), sym)}\\right) = -\\left(${inner(g.ang(180), frac(g, true))}\\right) ${g.eq} ${w.ang(alpha)}`
        }
  ]
}

/** Resultant of two forces: F1 along +x and F2 at angle θ, by the law of cosines. */
export function solveTwoForces(F1: number, F2: number, thetaDeg: number, unit = 'N', s: SolverSettings = DEFAULT_SETTINGS): Solution {
  const w = writers(s)
  const t = toRad(thetaDeg)
  const Rx = F1 + F2 * Math.cos(t)
  const Ry = F2 * Math.sin(t)
  const R = Math.hypot(Rx, Ry)
  const alpha = toDeg(Math.atan2(Ry, Rx))
  const u = unit ? `\\,\\text{${unit}}` : ''
  // Every line is worked from the numbers written in it (Fix 4): "√(7.56² + 7.09²) = 10.37 N" was
  // false (it is 10.364), and the law-of-cosines and tan⁻¹ lines jumped from the formula to the
  // answer without the numbers put in.
  const gx = w.guard((o) => w.same(o.read(F1) + o.read(F2) * cosD(o.readAng(thetaDeg)), Rx))
  const gy = w.guard((o) => w.same(o.read(F2) * sinD(o.readAng(thetaDeg)), Ry))
  const sum = F1 * F1 + F2 * F2 + 2 * F1 * F2 * Math.cos(t)
  const rSum = w.resultPrecision((q) => w.same(Math.sqrt(writersAt(q).readSci(sum)), R))
  // Both ends of the chain, as rootOfSquares checks them: the numbers put in must give the sum
  // written under the root AND root to R as written. Each "=" could hold on its own while the
  // first segment and the last disagree — √(0.380² + 8.63² + 2×0.380×8.63 cos 245°) is 8.4764,
  // never the 8.47 it ended on.
  const gc = w.guard((o) => {
    const back = o.read(F1) ** 2 + o.read(F2) ** 2 + 2 * o.read(F1) * o.read(F2) * cosD(o.readAng(thetaDeg))
    return w.same(Math.sqrt(Math.max(back, 0)), R) && w.sameSci(back, sum, rSum.q)
  })
  const steps: Step[] = [
    { text: `Place F₁ along the +x axis and F₂ at θ = ${w.angText(thetaDeg)} to it.` },
    {
      text: 'x-component of the resultant:',
      tex: `R_x = F_1\\cos ${w.ang(0)} + F_2\\cos\\theta = ${gx.num(F1)} + ${gx.num(F2)}\\cos ${gx.ang(thetaDeg)} ${gx.eq} ${w.num(Rx)}${u}`
    },
    { text: 'y-component of the resultant:', tex: `R_y = F_1\\sin ${w.ang(0)} + F_2\\sin\\theta = ${gy.num(F2)}\\sin ${gy.ang(thetaDeg)} ${gy.eq} ${w.num(Ry)}${u}` },
    { text: 'Magnitude:', tex: `R = \\sqrt{R_x^2 + R_y^2} = ${rootOfSquares(w, [Rx, Ry], R)}${u}` },
    {
      text: 'Same result from the law of cosines:',
      tex:
        `R = \\sqrt{F_1^2 + F_2^2 + 2F_1F_2\\cos\\theta}` +
        ` = \\sqrt{${gc.numP(F1)}^2 + ${gc.numP(F2)}^2 + 2\\times ${gc.numP(F1)}\\times ${gc.numP(F2)}\\cos ${gc.ang(thetaDeg)}}` +
        ` ${gc.eq} \\sqrt{${rSum.at.sci(sum)}} ${rSum.eq} ${w.num(R)}${u}`
    },
    ...forceDirection(w, Rx, Ry, alpha)
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
  // (−1.6)(… − 2.01ĵ …) = (… + 3.21ĵ …) was false as written: −1.6 × −2.01 is 3.216, so 3.22. q and
  // v × B are written with the digits that make each product give the component shown. A force
  // of order 10⁻¹⁹ is written as (mantissas) × 10ⁿ, so the mantissas are what is compared.
  const big = Math.max(...F.map(Math.abs))
  const perPower = tinyReal(big) ? Math.pow(10, -sciExponent(big, s)) : 1
  const g = w.guard((o) => vxB.every((c, i) => w.same(o.readSci(q) * o.read(c) * perPower, F[i] * perPower)))
  return finish({
    title: 'Magnetic force F = q(v × B)',
    steps: [
      { text: 'The force on a moving charge is F = q(v × B). First find v × B.' },
      ...cr.steps.slice(0, 5),
      {
        text: `Multiply by the charge q = ${w.sciText(q)} C${q < 0 ? ' (negative, so the force points the opposite way to v × B)' : ''}:`,
        tex: `\\vec{F} = ${q < 0 ? `(${g.sci(q)})` : g.sci(q)}\\,(${g.ijk(vxB)}) ${g.eq} ${w.sciIJK(F)}\\,\\text{N}`
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
 * expressions with mathjs, which cannot parse −B, â, v_{AB} or v×B as identifiers. A Greek
 * letter is an identifier to mathjs and a valid scene name, so τ stays τ; it used to be
 * spelled out as "tau", which is what the arrow was then labelled on the drawing.
 *   −B → negB     â → ahat     v_{AB} → v_AB     v×B → vxB     A′ → A_
 * The label a student reads on the picture is the original name (`sceneLabel`).
 */
export function sceneName(name: string): string {
  let s = name.normalize('NFD')
  s = s.replace(/^[−-]/, 'neg').replace(/̂/g, 'hat').replace(/[×⋅·]/g, 'x').replace(/′/g, '_')
  s = s.replace(/[^A-Za-z0-9_Ͱ-Ͽ]/g, '')
  if (!s) return 'v'
  if (!/^[A-Za-zͰ-Ͽ]/.test(s)) s = `v${s}`
  return s
}

/**
 * What the drawing calls the arrow, when that is not its scene name: −B, â and v×B are read by a
 * student on the picture, so they must not appear as "negB", "ahat" and "vxB". A name the
 * scene can hold as it is (R, τ, v_AB once the braces are gone) needs no separate label.
 */
export function sceneLabel(name: string): string | undefined {
  const shown = plain(name)
  return shown === sceneName(name) ? undefined : shown
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
      /** What the drawing shows for the arrow when its scene name is not readable: −B, â, v×B. */
      label?: string
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
    items.push({ kind: 'arrow', name, label: sceneLabel(v.name), tail, comp: v.drawn ?? v.v, role: v.role, auxiliary: v.role === 'helper' || scaled, labelMode: scaled ? 'name' : undefined })
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
