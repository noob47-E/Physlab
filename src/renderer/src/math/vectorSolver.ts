// Step-by-step vector solutions in standard notation, the way every textbook writes them:
// A_x = A cos θ, A = √(A_x² + A_y²), A·B = AB cos θ, A×B = AB sin θ n̂ …

import { add, angleBetween, cross, dot, len, neg, normalize, safeAcos, scale, toDeg, toRad, type V3 } from './vec'
import { tex, texIJK, texP, vecTex } from './format'

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
  color?: string
  role?: 'input' | 'result' | 'helper'
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

const D = 4 // decimals shown in working
const b = (name: string) => vecTex(name)
const mag = (name: string) => name.length === 1 ? name : `|\\vec{${name}}|`
const sub_ = (name: string, axis: string) => `${name}_{${axis}}`
const is3D = (...vs: V3[]) => vs.some((v) => Math.abs(v[2]) > 1e-12)

/** θ measured from +x (0..360°) with a quadrant explanation. */
function directionSteps(name: string, v: V3, steps: Step[]): number {
  const [x, y] = v
  const ref = toDeg(Math.atan(Math.abs(y) / Math.abs(x || 1e-300)))
  let theta: number
  if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) {
    steps.push({ text: 'The vector has zero length, so its direction is undefined.' })
    return NaN
  }
  if (Math.abs(x) < 1e-12) {
    theta = y > 0 ? 90 : 270
    steps.push({ text: `${sub_(name, 'x')} = 0, so the vector points straight along the ${y > 0 ? '+y' : '−y'} axis.`, tex: `\\theta = ${theta}^\\circ` })
    return theta
  }
  steps.push({
    text: 'Reference angle (ignore signs first):',
    tex: `\\theta_{ref} = \\tan^{-1}\\left(\\frac{|${sub_(name, 'y')}|}{|${sub_(name, 'x')}|}\\right) = \\tan^{-1}\\left(\\frac{${tex(Math.abs(y), D)}}{${tex(Math.abs(x), D)}}\\right) = ${tex(ref, D)}^\\circ`
  })
  if (x > 0 && y >= 0) {
    theta = ref
    steps.push({ text: `${sub_(name, 'x')} is + and ${sub_(name, 'y')} is +, so the vector is in the 1st quadrant.`, tex: `\\theta = \\theta_{ref} = ${tex(theta, D)}^\\circ` })
  } else if (x < 0 && y >= 0) {
    theta = 180 - ref
    steps.push({ text: `${sub_(name, 'x')} is − and ${sub_(name, 'y')} is +, so the vector is in the 2nd quadrant.`, tex: `\\theta = 180^\\circ - \\theta_{ref} = ${tex(theta, D)}^\\circ` })
  } else if (x < 0 && y < 0) {
    theta = 180 + ref
    steps.push({ text: `${sub_(name, 'x')} is − and ${sub_(name, 'y')} is −, so the vector is in the 3rd quadrant.`, tex: `\\theta = 180^\\circ + \\theta_{ref} = ${tex(theta, D)}^\\circ` })
  } else {
    theta = 360 - ref
    steps.push({ text: `${sub_(name, 'x')} is + and ${sub_(name, 'y')} is −, so the vector is in the 4th quadrant.`, tex: `\\theta = 360^\\circ - \\theta_{ref} = ${tex(theta, D)}^\\circ` })
  }
  return theta
}

/** Rectangular components from magnitude and angle. */
export function solveComponents(name: string, magnitude: number, thetaDeg: number, unit = ''): Solution {
  const t = toRad(thetaDeg)
  const x = magnitude * Math.cos(t)
  const y = magnitude * Math.sin(t)
  const u = unit ? `\\,\\text{${unit}}` : ''
  const steps: Step[] = [
    { text: `Given: magnitude ${name} = ${tex(magnitude)}${unit ? ' ' + unit : ''} at θ = ${tex(thetaDeg)}° with the +x axis.` },
    { text: 'x-component:', tex: `${sub_(name, 'x')} = ${name}\\cos\\theta = ${tex(magnitude)}\\cos ${tex(thetaDeg)}^\\circ = ${tex(magnitude)}\\times ${texP(Math.cos(t), D)} = ${tex(x, D)}${u}` },
    { text: 'y-component:', tex: `${sub_(name, 'y')} = ${name}\\sin\\theta = ${tex(magnitude)}\\sin ${tex(thetaDeg)}^\\circ = ${tex(magnitude)}\\times ${texP(Math.sin(t), D)} = ${tex(y, D)}${u}` },
    { text: 'Written with unit vectors:', tex: `${b(name)} = ${texIJK([x, y, 0], D)}` }
  ]
  return {
    title: `Resolve ${name} into rectangular components`,
    steps,
    answers: [
      { label: `${name}x`, tex: `${tex(x, D)}${u}` },
      { label: `${name}y`, tex: `${tex(y, D)}${u}` }
    ],
    visual: {
      vectors: [
        { name, v: [x, y, 0], role: 'input' },
        { name: `${name}x`, v: [x, 0, 0], role: 'helper', color: '#ff6b6b' },
        { name: `${name}y`, v: [0, y, 0], tail: [x, 0, 0], role: 'helper', color: '#51cf66' }
      ],
      mode: 'common-tail'
    }
  }
}

/** Magnitude and direction from components. */
export function solveMagnitudeDirection(A: NamedVec): Solution {
  const { name, v } = A
  const m = len(v)
  const steps: Step[] = [{ text: 'Given components:', tex: `${b(name)} = ${texIJK(v, D)}` }]
  if (is3D(v)) {
    steps.push({
      text: 'Magnitude (Pythagorean theorem in 3D):',
      tex: `${name} = \\sqrt{${sub_(name, 'x')}^2 + ${sub_(name, 'y')}^2 + ${sub_(name, 'z')}^2} = \\sqrt{${texP(v[0])}^2 + ${texP(v[1])}^2 + ${texP(v[2])}^2} = \\sqrt{${tex(dot(v, v), D)}} = ${tex(m, D)}`
    })
    const angs = v.map((c) => toDeg(safeAcos(c / m)))
    ;(['x', 'y', 'z'] as const).forEach((ax, i) => {
      const g = ['\\alpha', '\\beta', '\\gamma'][i]
      steps.push({ text: `Angle with the ${ax}-axis (direction cosine):`, tex: `${g} = \\cos^{-1}\\left(\\frac{${sub_(name, ax)}}{${name}}\\right) = \\cos^{-1}\\left(\\frac{${tex(v[i])}}{${tex(m, D)}}\\right) = ${tex(angs[i], D)}^\\circ` })
    })
    return {
      title: `Magnitude and direction of ${name}`,
      steps,
      answers: [
        { label: `|${name}|`, tex: tex(m, D) },
        { label: 'α, β, γ', tex: angs.map((a) => `${tex(a, 2)}^\\circ`).join(',\\ ') }
      ],
      visual: { vectors: [{ name, v, role: 'input' }] }
    }
  }
  steps.push({
    text: 'Magnitude :',
    tex: `${name} = \\sqrt{${sub_(name, 'x')}^2 + ${sub_(name, 'y')}^2} = \\sqrt{${texP(v[0])}^2 + ${texP(v[1])}^2} = \\sqrt{${tex(dot(v, v), D)}} = ${tex(m, D)}`
  })
  steps.push({ text: 'Direction :' })
  const theta = directionSteps(name, v, steps)
  return {
    title: `Magnitude and direction of ${name}`,
    steps,
    answers: [
      { label: `|${name}|`, tex: tex(m, D) },
      { label: 'θ', tex: `${tex(theta, 2)}^\\circ` }
    ],
    visual: { vectors: [{ name, v, role: 'input' }] }
  }
}

/** Addition of any number of vectors by rectangular components. */
export function solveAddition(vs: NamedVec[], resultName = 'R'): Solution {
  const R = vs.reduce<V3>((acc, x) => add(acc, x.v), [0, 0, 0])
  const threeD = is3D(...vs.map((x) => x.v))
  const axes = threeD ? (['x', 'y', 'z'] as const) : (['x', 'y'] as const)
  const steps: Step[] = [
    { text: 'Write every vector in component form:', tex: vs.map((x) => `${b(x.name)} = ${texIJK(x.v, D)}`).join(',\\quad ') },
    { text: 'Add the x-components together, the y-components together' + (threeD ? ' and the z-components together.' : '.') }
  ]
  axes.forEach((ax, i) => {
    steps.push({
      tex: `${sub_(resultName, ax)} = ${vs.map((x) => sub_(x.name, ax)).join(' + ')} = ${vs.map((x) => texP(x.v[i], D)).join(' + ')} = ${tex(R[i], D)}`
    })
  })
  steps.push({ text: 'Resultant vector:', tex: `${b(resultName)} = ${texIJK(R, D)}` })
  const mSol = solveMagnitudeDirection({ name: resultName, v: R })
  steps.push(...mSol.steps.slice(1))
  return {
    title: `Resultant ${resultName} = ${vs.map((x) => x.name).join(' + ')}`,
    steps,
    answers: [{ label: resultName, tex: texIJK(R, D) }, ...mSol.answers],
    visual: {
      vectors: [...vs.map((x) => ({ name: x.name, v: x.v, role: 'input' as const })), { name: resultName, v: R, role: 'result' as const, color: '#ffd43b' }],
      mode: 'head-to-tail'
    }
  }
}

/** Same sum, done the way books do it without components: law of cosines, then law of sines. */
export function solveAdditionCosineLaw(A: NamedVec, B: NamedVec, resultName = 'R'): Solution {
  const a = len(A.v)
  const bb = len(B.v)
  const theta = toDeg(angleBetween(A.v, B.v))
  const r = Math.sqrt(a * a + bb * bb + 2 * a * bb * Math.cos(toRad(theta)))
  const alpha = r < 1e-12 ? 0 : toDeg(Math.asin(Math.max(-1, Math.min(1, (bb * Math.sin(toRad(theta))) / r))))
  const steps: Step[] = [
    { text: `Sizes and the angle between them:`, tex: `${mag(A.name)} = ${tex(a, D)},\quad ${mag(B.name)} = ${tex(bb, D)},\quad \theta = ${tex(theta, D)}^\circ` },
    {
      text: 'Law of cosines (the angle inside the triangle is 180° − θ, which flips the sign):',
      tex: `${resultName}^2 = ${mag(A.name)}^2 + ${mag(B.name)}^2 + 2\,${mag(A.name)}${mag(B.name)}\cos\theta = ${tex(a * a, D)} + ${tex(bb * bb, D)} + ${tex(2 * a * bb * Math.cos(toRad(theta)), D)}`
    },
    { text: 'So the size of the resultant is', tex: `${resultName} = \sqrt{${tex(r * r, D)}} = ${tex(r, D)}` },
    {
      text: `Law of sines gives the angle between ${resultName} and ${A.name}:`,
      tex: `\frac{\sin\alpha}{${mag(B.name)}} = \frac{\sin\theta}{${resultName}} \;\Rightarrow\; \alpha = \sin^{-1}\left(\frac{${tex(bb, D)}\sin ${tex(theta, 2)}^\circ}{${tex(r, D)}}\right) = ${tex(alpha, D)}^\circ`
    },
    { text: 'The component method gives the same answer — use whichever your book prefers.' }
  ]
  return {
    title: `${A.name} + ${B.name} by the law of cosines`,
    steps,
    answers: [
      { label: resultName, tex: tex(r, D) },
      { label: 'angle with ' + A.name, tex: `${tex(alpha, D)}^\circ` }
    ],
    visual: { vectors: [
      { name: A.name, v: A.v, role: 'input' },
      { name: B.name, v: B.v, role: 'input' },
      { name: resultName, v: add(A.v, B.v), role: 'result' }
    ], mode: 'parallelogram' }
  }
}

/** The drawing method: choose a scale, draw head-to-tail, then measure the closing vector. */
export function solveAdditionGraphical(vs: NamedVec[], resultName = 'R'): Solution {
  const total = vs.reduce((acc, v) => add(acc, v.v), [0, 0, 0] as V3)
  const biggest = Math.max(...vs.map((v) => len(v.v)), 1)
  const scale1 = biggest > 10 ? 1 : biggest > 1 ? 1 : 0.1
  const steps: Step[] = [
    { text: `1. Choose a scale. Here 1 grid square stands for ${tex(scale1, 2)} unit${scale1 === 1 ? '' : 's'}, so every vector fits on the paper.` },
    ...vs.map((v, i) => ({
      text: `${i + 2}. Draw ${v.name} to scale at ${tex(toDeg(Math.atan2(v.v[1], v.v[0])), 2)}° from the +x axis${i === 0 ? '' : `, starting at the head of ${vs[i - 1].name}`}.`,
      tex: `${mag(v.name)} = ${tex(len(v.v), D)}`
    })),
    { text: `${vs.length + 2}. Join the tail of the first vector to the head of the last one. That closing arrow is the resultant.` },
    {
      text: 'Measuring it with a ruler and protractor gives',
      tex: `${resultName} = ${tex(len(total), D)},\quad \theta = ${tex((toDeg(Math.atan2(total[1], total[0])) + 360) % 360, D)}^\circ`
    },
    { text: 'A drawing is only as accurate as the ruler; the component method gives the exact value.' }
  ]
  return {
    title: `${vs.map((v) => v.name).join(' + ')} by drawing (head-to-tail)`,
    steps,
    answers: [{ label: resultName, tex: texIJK(total, D) }],
    visual: { vectors: [...vs.map((v) => ({ name: v.name, v: v.v, role: 'input' as const })), { name: resultName, v: total, role: 'result' as const }], mode: 'head-to-tail' }
  }
}

export function solveSubtraction(A: NamedVec, B: NamedVec, resultName = 'R'): Solution {
  const R = add(A.v, neg(B.v))
  const steps: Step[] = [
    { text: 'Subtracting a vector means adding its negative (same magnitude, opposite direction):', tex: `${b(A.name)} - ${b(B.name)} = ${b(A.name)} + (-${b(B.name)})` },
    { tex: `-${b(B.name)} = ${texIJK(neg(B.v), D)}` }
  ]
  const sum = solveAddition([A, { name: `(-${B.name})`, v: neg(B.v) }], resultName)
  steps.push(...sum.steps.slice(1))
  return {
    title: `${resultName} = ${A.name} − ${B.name}`,
    steps,
    answers: sum.answers,
    visual: {
      vectors: [
        { name: A.name, v: A.v, role: 'input' },
        { name: B.name, v: B.v, role: 'input' },
        { name: `−${B.name}`, v: neg(B.v), tail: A.v, role: 'helper', color: '#868e96' },
        { name: resultName, v: R, role: 'result', color: '#ffd43b' }
      ],
      mode: 'common-tail'
    }
  }
}

export function solveScalarMultiply(k: number, A: NamedVec, resultName = 'R'): Solution {
  const R = scale(A.v, k)
  const steps: Step[] = [
    { text: 'Multiply every component by the scalar:', tex: `${tex(k)}\\,${b(A.name)} = ${tex(k)}(${texIJK(A.v, D)}) = ${texIJK(R, D)}` },
    { text: 'The magnitude is multiplied by |k|:', tex: `|${tex(k)}\\,${b(A.name)}| = |${tex(k)}|\\times ${tex(len(A.v), D)} = ${tex(len(R), D)}` },
    { text: k >= 0 ? 'k is positive, so the direction does not change.' : 'k is negative, so the direction is reversed (turned through 180°).' }
  ]
  return {
    title: `${resultName} = ${tex(k)}${A.name}`,
    steps,
    answers: [{ label: resultName, tex: texIJK(R, D) }, { label: `|${resultName}|`, tex: tex(len(R), D) }],
    visual: { vectors: [{ name: A.name, v: A.v, role: 'input' }, { name: resultName, v: R, role: 'result', color: '#ffd43b' }] }
  }
}

export function solveUnitVector(A: NamedVec): Solution {
  const m = len(A.v)
  const u = normalize(A.v)
  const steps: Step[] = [
    { text: 'A unit vector has magnitude 1 and points the same way as the vector.', tex: `\\hat{${A.name.toLowerCase()}} = \\frac{${b(A.name)}}{${mag(A.name)}}` },
    { tex: `${mag(A.name)} = ${tex(m, D)}` },
    { tex: `\\hat{${A.name.toLowerCase()}} = \\frac{${texIJK(A.v, D)}}{${tex(m, D)}} = ${texIJK(u, D)}` },
    { text: 'Check: its magnitude is', tex: `\\sqrt{${u.map((c) => `${texP(c, D)}^2`).join(' + ')}} = ${tex(len(u), 6)}` }
  ]
  return {
    title: `Unit vector along ${A.name}`,
    steps,
    answers: [{ label: 'unit vector', tex: texIJK(u, D) }],
    visual: { vectors: [{ name: A.name, v: A.v, role: 'input' }, { name: `${A.name.toLowerCase()}̂`, v: u, role: 'result', color: '#ffd43b' }] }
  }
}

/** Scalar (dot) product and the angle between two vectors. */
export function solveDot(A: NamedVec, B: NamedVec): Solution {
  const d = dot(A.v, B.v)
  const mA = len(A.v)
  const mB = len(B.v)
  const cosT = d / (mA * mB)
  const theta = toDeg(angleBetween(A.v, B.v))
  const steps: Step[] = [
    { text: 'Given:', tex: `${b(A.name)} = ${texIJK(A.v, D)},\\quad ${b(B.name)} = ${texIJK(B.v, D)}` },
    {
      text: 'Scalar product in terms of rectangular components :',
      tex: `${b(A.name)}\\cdot${b(B.name)} = ${A.name}_xB_x + ${A.name}_yB_y + ${A.name}_zB_z`.replace(/B_/g, `${B.name}_`)
    },
    { tex: `= (${tex(A.v[0])})(${tex(B.v[0])}) + (${tex(A.v[1])})(${tex(B.v[1])}) + (${tex(A.v[2])})(${tex(B.v[2])}) = ${tex(d, D)}` },
    { text: 'Magnitudes:', tex: `${mag(A.name)} = ${tex(mA, D)},\\quad ${mag(B.name)} = ${tex(mB, D)}` },
    { text: 'Angle between them :', tex: `\\cos\\theta = \\frac{${b(A.name)}\\cdot${b(B.name)}}{${mag(A.name)}\\,${mag(B.name)}} = \\frac{${tex(d, D)}}{${tex(mA, D)}\\times${tex(mB, D)}} = ${tex(cosT, D)}` },
    { tex: `\\theta = \\cos^{-1}(${tex(cosT, D)}) = ${tex(theta, D)}^\\circ` }
  ]
  if (Math.abs(d) < 1e-9) steps.push({ text: 'The dot product is zero, so the vectors are perpendicular (θ = 90°).' })
  steps.push({ text: 'Meaning: A·B = A × (projection of B on A).', tex: `B\\cos\\theta = ${tex(mB * cosT, D)}` })
  return {
    title: `Scalar product ${A.name}·${B.name}`,
    steps,
    answers: [{ label: `${A.name}·${B.name}`, tex: tex(d, D) }, { label: 'θ', tex: `${tex(theta, 2)}^\\circ` }],
    visual: { vectors: [{ name: A.name, v: A.v, role: 'input' }, { name: B.name, v: B.v, role: 'input' }], mode: 'common-tail' }
  }
}

/** Vector (cross) product via determinant expansion. */
export function solveCross(A: NamedVec, B: NamedVec, resultName = 'C'): Solution {
  const [ax, ay, az] = A.v
  const [bx, by, bz] = B.v
  const C = cross(A.v, B.v)
  const mA = len(A.v)
  const mB = len(B.v)
  const mC = len(C)
  const theta = toDeg(angleBetween(A.v, B.v))
  const steps: Step[] = [
    { text: 'Given:', tex: `${b(A.name)} = ${texIJK(A.v, D)},\\quad ${b(B.name)} = ${texIJK(B.v, D)}` },
    {
      text: 'Write the cross product as a determinant:',
      tex: `${b(A.name)}\\times${b(B.name)} = \\begin{vmatrix} \\hat{i} & \\hat{j} & \\hat{k} \\\\ ${tex(ax)} & ${tex(ay)} & ${tex(az)} \\\\ ${tex(bx)} & ${tex(by)} & ${tex(bz)} \\end{vmatrix}`
    },
    {
      text: 'Expand along the first row:',
      tex: `= \\hat{i}\\,[(${tex(ay)})(${tex(bz)}) - (${tex(az)})(${tex(by)})] - \\hat{j}\\,[(${tex(ax)})(${tex(bz)}) - (${tex(az)})(${tex(bx)})] + \\hat{k}\\,[(${tex(ax)})(${tex(by)}) - (${tex(ay)})(${tex(bx)})]`
    },
    { tex: `${b(resultName)} = ${texIJK(C, D)}` },
    { text: 'Magnitude:', tex: `|${b(resultName)}| = \\sqrt{${C.map((c) => `${texP(c, D)}^2`).join(' + ')}} = ${tex(mC, D)}` },
    { text: `Check with |${A.name}×${B.name}| = ${A.name}${B.name} sin θ:`, tex: `${tex(mA, D)}\\times${tex(mB, D)}\\times\\sin ${tex(theta, 2)}^\\circ = ${tex(mA * mB * Math.sin(toRad(theta)), D)}` },
    { text: `|${A.name}×${B.name}| is also the area of the parallelogram with sides ${A.name} and ${B.name}.`, tex: `\\text{Area} = ${tex(mC, D)}` },
    { text: 'The direction is perpendicular to the plane of A and B (right-hand rule). The order matters:', tex: `${b(B.name)}\\times${b(A.name)} = -${b(A.name)}\\times${b(B.name)} = ${texIJK(neg(C), D)}` }
  ]
  if (mC < 1e-9) steps.push({ text: 'The cross product is the null vector, so the vectors are parallel or antiparallel (θ = 0° or 180°).' })
  return {
    title: `Vector product ${A.name}×${B.name}`,
    steps,
    answers: [
      { label: `${A.name}×${B.name}`, tex: texIJK(C, D) },
      { label: `|${A.name}×${B.name}|`, tex: tex(mC, D) },
      { label: 'θ', tex: `${tex(theta, 2)}^\\circ` }
    ],
    visual: {
      vectors: [
        { name: A.name, v: A.v, role: 'input' },
        { name: B.name, v: B.v, role: 'input' },
        { name: resultName, v: C, role: 'result', color: '#e64980' }
      ],
      mode: 'parallelogram'
    }
  }
}

export function solveProjection(B: NamedVec, A: NamedVec): Solution {
  const d = dot(A.v, B.v)
  const mA = len(A.v)
  const s = d / mA
  const p = scale(A.v, d / (mA * mA))
  const steps: Step[] = [
    { text: `Scalar projection of ${B.name} on ${A.name} (B cos θ):`, tex: `B\\cos\\theta = \\frac{${b(A.name)}\\cdot${b(B.name)}}{${mag(A.name)}} = \\frac{${tex(d, D)}}{${tex(mA, D)}} = ${tex(s, D)}` },
    { text: 'Vector projection (the shadow of B along A):', tex: `\\text{proj}_{${A.name}}${b(B.name)} = \\frac{${b(A.name)}\\cdot${b(B.name)}}{${mag(A.name)}^2}\\,${b(A.name)} = \\frac{${tex(d, D)}}{${tex(mA * mA, D)}}(${texIJK(A.v, D)}) = ${texIJK(p, D)}` }
  ]
  return {
    title: `Projection of ${B.name} on ${A.name}`,
    steps,
    answers: [{ label: 'B cos θ', tex: tex(s, D) }, { label: 'projection', tex: texIJK(p, D) }],
    visual: {
      vectors: [
        { name: A.name, v: A.v, role: 'input' },
        { name: B.name, v: B.v, role: 'input' },
        { name: 'proj', v: p, role: 'result', color: '#ffd43b' }
      ],
      mode: 'common-tail'
    }
  }
}

/** Resultant of two forces: F1 along +x and F2 at angle θ, by the law of cosines. */
export function solveTwoForces(F1: number, F2: number, thetaDeg: number, unit = 'N'): Solution {
  const t = toRad(thetaDeg)
  const Rx = F1 + F2 * Math.cos(t)
  const Ry = F2 * Math.sin(t)
  const R = Math.hypot(Rx, Ry)
  const alpha = toDeg(Math.atan2(Ry, Rx))
  const u = unit ? `\\,\\text{${unit}}` : ''
  const steps: Step[] = [
    { text: `Place F₁ along the +x axis and F₂ at θ = ${tex(thetaDeg)}° to it.` },
    { text: 'x-component of the resultant:', tex: `R_x = F_1\\cos 0^\\circ + F_2\\cos\\theta = ${tex(F1)} + ${tex(F2)}\\cos ${tex(thetaDeg)}^\\circ = ${tex(Rx, D)}${u}` },
    { text: 'y-component of the resultant:', tex: `R_y = F_1\\sin 0^\\circ + F_2\\sin\\theta = ${tex(F2)}\\sin ${tex(thetaDeg)}^\\circ = ${tex(Ry, D)}${u}` },
    { text: 'Magnitude:', tex: `R = \\sqrt{R_x^2 + R_y^2} = \\sqrt{${texP(Rx, D)}^2 + ${texP(Ry, D)}^2} = ${tex(R, D)}${u}` },
    { text: 'Same result from the law of cosines:', tex: `R = \\sqrt{F_1^2 + F_2^2 + 2F_1F_2\\cos\\theta} = ${tex(Math.sqrt(F1 * F1 + F2 * F2 + 2 * F1 * F2 * Math.cos(t)), D)}${u}` },
    { text: 'Direction of R measured from F₁:', tex: `\\alpha = \\tan^{-1}\\left(\\frac{R_y}{R_x}\\right) = ${tex(alpha, D)}^\\circ` }
  ]
  return {
    title: 'Resultant of two forces',
    steps,
    answers: [{ label: 'R', tex: `${tex(R, D)}${u}` }, { label: 'α', tex: `${tex(alpha, 2)}^\\circ` }],
    visual: {
      vectors: [
        { name: 'F1', v: [F1, 0, 0], role: 'input' },
        { name: 'F2', v: [F2 * Math.cos(t), F2 * Math.sin(t), 0], role: 'input' },
        { name: 'R', v: [Rx, Ry, 0], role: 'result', color: '#ffd43b' }
      ],
      mode: 'parallelogram'
    }
  }
}

export function solveEquilibrium(vs: NamedVec[]): Solution {
  const sum = solveAddition(vs, 'R')
  const R = vs.reduce<V3>((acc, x) => add(acc, x.v), [0, 0, 0])
  const E = neg(R)
  const steps: Step[] = [
    ...sum.steps,
    { text: 'For equilibrium the net force must be zero, so the balancing force (equilibrant) is equal and opposite to R:', tex: `\\vec{E} = -\\vec{R} = ${texIJK(E, D)}` },
    { tex: `|\\vec{E}| = ${tex(len(E), D)}` }
  ]
  return {
    title: 'Force needed for equilibrium',
    steps,
    answers: [{ label: 'E', tex: texIJK(E, D) }, { label: '|E|', tex: tex(len(E), D) }],
    visual: { vectors: [...vs.map((x) => ({ name: x.name, v: x.v, role: 'input' as const })), { name: 'E', v: E, role: 'result', color: '#20c997' }], mode: 'head-to-tail' }
  }
}

export function solveTorque(r: V3, F: V3): Solution {
  const s = solveCross({ name: 'r', v: r }, { name: 'F', v: F }, 'τ')
  return {
    ...s,
    title: 'Torque τ = r × F',
    steps: [{ text: 'Torque is the vector product of the position vector r and the force F.', tex: '\\vec{\\tau} = \\vec{r}\\times\\vec{F}' }, ...s.steps],
    answers: s.answers.map((a, i) => (i === 0 ? { label: 'τ', tex: `${a.tex}\\,\\text{N m}` } : a))
  }
}

export function solveMagneticForce(q: number, v: V3, B: V3): Solution {
  const vxB = cross(v, B)
  const F = scale(vxB, q)
  const s = solveCross({ name: 'v', v }, { name: 'B', v: B }, 'v×B')
  return {
    title: 'Magnetic force F = q(v × B)',
    steps: [
      { text: 'The force on a moving charge is F = q(v × B). First find v × B:' },
      ...s.steps.slice(0, 5),
      { text: `Multiply by the charge q = ${tex(q)} C:`, tex: `\\vec{F} = ${tex(q)}\\,(${texIJK(vxB, D)}) = ${texIJK(F, D)}\\,\\text{N}` },
      { tex: `|\\vec{F}| = ${tex(len(F), D)}\\,\\text{N}` }
    ],
    answers: [{ label: 'F', tex: `${texIJK(F, D)}\\,\\text{N}` }, { label: '|F|', tex: `${tex(len(F), D)}\\,\\text{N}` }],
    visual: { vectors: [{ name: 'v', v, role: 'input' }, { name: 'B', v: B, role: 'input', color: '#4dabf7' }, { name: 'F', v: F, role: 'result', color: '#e64980' }], mode: 'common-tail' }
  }
}

export function solveWork(F: V3, d: V3): Solution {
  const s = solveDot({ name: 'F', v: F }, { name: 'd', v: d })
  const W = dot(F, d)
  return {
    title: 'Work done W = F · d',
    steps: [{ text: 'Work is the scalar product of force and displacement: W = F·d = Fd cos θ.' }, ...s.steps],
    answers: [{ label: 'W', tex: `${tex(W, D)}\\,\\text{J}` }, s.answers[1]],
    visual: s.visual
  }
}
