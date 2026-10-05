/**
 * Tiny real vectors are answers, not noise (R2-1). The vector solver judged "zero length" and "the
 * forces cancel" by ABSOLUTE thresholds (|A| < 1e-12, |R| < 1e-12), so two forces of 1.6×10⁻¹⁷ N and
 * 2×10⁻¹⁷ N at 60° "cancelled", a 10⁻¹⁹-sized cross product was the null vector, and the working
 * wrote such values through the plain writers, which show anything under 10⁻¹² as 0.
 *
 * The rule now: a vector is zero only when it is exactly zero, and a result is zero only when it is
 * noise RELATIVE to the vectors it came from (isNoise for products, the sum rule for sums). Tiny
 * real values are written with raised powers of ten: never 0, never e-notation, never a caret.
 */
import { describe, expect, it } from 'vitest'
import katex from 'katex'
import * as VS from '../src/renderer/src/math/vectorSolver'
import { shownValue } from '../src/renderer/src/math/format'

const sentences = (sol: VS.Solution): string => [sol.title, ...sol.steps.map((st) => st.text ?? ''), ...sol.answers.map((a) => a.label)].join(' ')
const working = (sol: VS.Solution): string => sol.steps.map((st) => st.tex ?? '').join(' ')
const answer = (sol: VS.Solution, label: string): string => {
  const a = sol.answers.find((x) => x.label === label)
  if (!a) throw new Error(`no answer "${label}" in ${sol.answers.map((x) => x.label).join(', ')}`)
  return a.tex
}

/** The value a student reads off an answer: its size, from the number or the vector's mantissas × 10ⁿ. */
function sizeOf(tex: string): number {
  const power = tex.match(/\\right\)\\times 10\^\{(-?\d+)\}/)
  if (power) {
    const inside = tex.slice(tex.indexOf('\\left(') + 6, tex.indexOf('\\right)'))
    const parts = [...inside.replace(/−/g, '-').matchAll(/-?\s*\d+(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/\s/g, '')))
    return Math.hypot(...parts) * Math.pow(10, Number(power[1]))
  }
  return Math.abs(shownValue(tex))
}

const close = (got: number, want: number): boolean => Math.abs(got - want) <= 0.01 * Math.abs(want)

/** Every piece of LaTeX renders, and no plain text shows a caret or e-notation. */
function clean(sol: VS.Solution, where: string): void {
  for (const tex of [...sol.steps.map((s) => s.tex ?? ''), ...sol.answers.map((a) => a.tex)]) {
    expect(() => katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: 'ignore' }), `${where}: ${tex}`).not.toThrow()
    expect(tex, `${where}: e-notation in ${tex}`).not.toMatch(/\de[+-]?\d/)
  }
  const text = sentences(sol)
  expect(text, `${where}: a caret in plain text`).not.toContain('^')
  expect(text, `${where}: e-notation in plain text`).not.toMatch(/\de[+-]?\d/)
  expect(text, `${where}: a tiny input called zero`).not.toMatch(/zero length/)
  expect(text, `${where}: tiny forces called cancelling`).not.toMatch(/cancel/)
}

/** The answer is the right tiny number, written with a raised power of ten (never 0). */
function tinyAnswer(sol: VS.Solution, label: string, want: number, where: string): void {
  const tex = answer(sol, label)
  expect(tex, `${where}: ${label} has no ×10ⁿ`).toMatch(/\\times 10\^\{-\d+\}/)
  expect(close(sizeOf(tex), want), `${where}: ${label} = ${tex}, want ${want}`).toBe(true)
}

/** No working line writes a tiny input as 0: the given components appear with their powers of ten. */
function writesInputs(sol: VS.Solution, powers: number[], where: string): void {
  const tex = working(sol)
  for (const p of powers) expect(tex, `${where}: no 10^{${p}} in the working`).toContain(`10^{${p}}`)
  expect(tex, `${where}: a tiny value written as (0)(0)`).not.toContain('(0)(0)')
  expect(tex, `${where}: a tiny vector written as the null vector`).not.toContain('\\vec{0}')
}

// 1×10⁻¹⁹ times (3î + 4ĵ) and 1×10⁻¹⁷ times (2î − ĵ): |A| = 5×10⁻¹⁹, |B| = 2.236×10⁻¹⁷.
const A: VS.NamedVec = { name: 'A', v: [3e-19, 4e-19, 0] }
const B: VS.NamedVec = { name: 'B', v: [2e-17, -1e-17, 0] }

describe('tiny vectors (10⁻¹⁹ and 10⁻¹⁷) give their real answers', () => {
  it('cross product: A×B = −1.1×10⁻³⁵ k̂, not the null vector', () => {
    const sol = VS.solveCross(A, B)
    clean(sol, 'cross')
    tinyAnswer(sol, 'A×B', 1.1e-35, 'cross')
    tinyAnswer(sol, '|A×B|', 1.1e-35, 'cross')
    expect(sentences(sol)).not.toMatch(/null vector/)
    writesInputs(sol, [-19, -17, -35], 'cross')
  })

  it('dot product: A·B = 2×10⁻³⁶, at 79.70°', () => {
    const sol = VS.solveDot(A, B)
    clean(sol, 'dot')
    tinyAnswer(sol, 'A·B', 2e-36, 'dot')
    expect(answer(sol, 'θ')).toContain('79.6952')
    writesInputs(sol, [-19, -17, -36], 'dot')
  })

  it('angle between: 79.70°, worked from the real sizes', () => {
    const sol = VS.solveAngleBetween(A, B)
    clean(sol, 'angle')
    expect(answer(sol, 'θ')).toContain('79.6952')
    writesInputs(sol, [-19, -17], 'angle')
  })

  it('projection of B on A: B cos θ = 4×10⁻¹⁸, proj = (2.4î + 3.2ĵ)×10⁻¹⁸', () => {
    const sol = VS.solveProjection(B, A)
    clean(sol, 'projection')
    tinyAnswer(sol, 'B cos θ', 4e-18, 'projection')
    tinyAnswer(sol, 'proj of B on A', 4e-18, 'projection')
    writesInputs(sol, [-19, -36], 'projection')
  })

  it('torque: (2î + ĵ + k̂)×10⁻¹⁹ m × (î + 3ĵ + 2k̂)×10⁻¹⁷ N = (−î − 3ĵ + 5k̂)×10⁻³⁶ N m', () => {
    const sol = VS.solveTorque([2e-19, 1e-19, 1e-19], [1e-17, 3e-17, 2e-17])
    clean(sol, 'torque')
    tinyAnswer(sol, 'τ', Math.sqrt(35) * 1e-36, 'torque')
    tinyAnswer(sol, '|τ|', Math.sqrt(35) * 1e-36, 'torque')
    writesInputs(sol, [-19, -17, -36], 'torque')
  })

  it('work: 1.6×10⁻¹⁷ î N along (3î + 4ĵ)×10⁻¹⁹ m does 4.8×10⁻³⁶ J', () => {
    const sol = VS.solveWork([1.6e-17, 0, 0], [3e-19, 4e-19, 0])
    clean(sol, 'work')
    tinyAnswer(sol, 'W', 4.8e-36, 'work')
    expect(answer(sol, 'θ')).toContain('53.1301')
    writesInputs(sol, [-19, -17, -36], 'work')
  })

  it('law of cosines: 1.6×10⁻¹⁷∠0° + 2×10⁻¹⁷∠60° = 3.124×10⁻¹⁷ at 33.67°', () => {
    const sol = VS.solveAdditionCosineLaw({ name: 'A', v: [1.6e-17, 0, 0] }, { name: 'B', v: [1e-17, 2e-17 * Math.sin(Math.PI / 3), 0] })
    clean(sol, 'cosine law')
    tinyAnswer(sol, 'R', 3.124e-17, 'cosine law')
    expect(answer(sol, 'angle with A')).toContain('33.67')
    writesInputs(sol, [-17, -34], 'cosine law')
  })

  it('law of cosines at 10⁻¹⁹: 1×10⁻¹⁹ î + 1×10⁻¹⁹ ĵ = 1.414×10⁻¹⁹ at 45°', () => {
    const sol = VS.solveAdditionCosineLaw({ name: 'A', v: [1e-19, 0, 0] }, { name: 'B', v: [0, 1e-19, 0] })
    clean(sol, 'cosine law 1e-19')
    tinyAnswer(sol, 'R', 1.414e-19, 'cosine law 1e-19')
    expect(answer(sol, 'angle with A')).toContain('45')
  })

  it('two forces of 1.6×10⁻¹⁷ N and 2×10⁻¹⁷ N at 60° do NOT cancel: R = 3.124×10⁻¹⁷ N at 33.67°', () => {
    const sol = VS.solveTwoForces(1.6e-17, 2e-17, 60)
    clean(sol, 'two forces')
    tinyAnswer(sol, 'R', 3.124e-17, 'two forces')
    expect(answer(sol, 'α')).toContain('33.67')
    writesInputs(sol, [-17, -34], 'two forces')
  })

  it('two forces of 1×10⁻¹⁹ N at 90°: R = 1.414×10⁻¹⁹ N at 45°', () => {
    const sol = VS.solveTwoForces(1e-19, 1e-19, 90)
    clean(sol, 'two forces 1e-19')
    tinyAnswer(sol, 'R', 1.414e-19, 'two forces 1e-19')
    expect(answer(sol, 'α')).toContain('45')
  })
})

describe('what really is zero still reads as zero', () => {
  it('5 N and 5 N at 180° cancel', () => {
    const sol = VS.solveTwoForces(5, 5, 180)
    expect(sentences(sol)).toMatch(/The forces cancel/)
    expect(shownValue(answer(sol, 'R'))).toBe(0)
  })

  it('1.6×10⁻¹⁷ N and 1.6×10⁻¹⁷ N at 180° cancel too: the sum is noise beside its parts', () => {
    const sol = VS.solveTwoForces(1.6e-17, 1.6e-17, 180)
    expect(sentences(sol)).toMatch(/The forces cancel/)
    expect(shownValue(answer(sol, 'R'))).toBe(0)
    expect(answer(sol, 'R')).not.toMatch(/10\^/)
  })

  it('5∠0° + 5∠180° by the law of cosines is 0', () => {
    const sol = VS.solveAdditionCosineLaw({ name: 'A', v: [5, 0, 0] }, { name: 'B', v: [5 * Math.cos(Math.PI), 5 * Math.sin(Math.PI), 0] })
    expect(shownValue(answer(sol, 'R'))).toBe(0)
    expect(answer(sol, 'R')).not.toMatch(/10\^/)
  })

  it('a true zero vector still has zero length in dot, cross, projection and the law of cosines', () => {
    const Z: VS.NamedVec = { name: 'Z', v: [0, 0, 0] }
    expect(sentences(VS.solveDot(Z, A))).toMatch(/Z has zero length/)
    expect(sentences(VS.solveCross(A, Z))).toMatch(/Z has zero length/)
    expect(sentences(VS.solveProjection(A, Z))).toMatch(/Z has zero length/)
    expect(sentences(VS.solveAdditionCosineLaw(Z, A))).toMatch(/Z has zero length/)
  })

  it('a 10⁻¹⁹ pair at 180° is antiparallel with a null cross product, judged beside its own size', () => {
    const sol = VS.solveCross({ name: 'A', v: [1e-19, 0, 0] }, { name: 'B', v: [-2e-19 * 1, 2e-19 * Math.sin(Math.PI), 0] })
    expect(sentences(sol)).toMatch(/antiparallel/)
    expect(answer(sol, 'A×B')).toBe('\\vec{0}')
  })
})

describe('10²⁰⁰-sized forces still behave', () => {
  it('two forces of 10²⁰⁰ N at 60° give 1.732×10²⁰⁰ N, and at 180° cancel', () => {
    const sol = VS.solveTwoForces(1e200, 1e200, 60)
    expect(sentences(sol)).not.toMatch(/cancel/)
    expect(close(sizeOf(answer(sol, 'R')), Math.sqrt(3) * 1e200)).toBe(true)
    expect(answer(sol, 'α')).toContain('30')
    expect(sentences(VS.solveTwoForces(1e200, 1e200, 180))).toMatch(/The forces cancel/)
  })

  it('10²⁰⁰ î × 10²⁰⁰ ĵ is not the null vector, and 10²⁰⁰ î, 10²⁰⁰ ĵ are at 90°', () => {
    const P: VS.NamedVec = { name: 'P', v: [1e200, 0, 0] }
    const Q: VS.NamedVec = { name: 'Q', v: [0, 1e200, 0] }
    expect(answer(VS.solveCross(P, Q), 'P×Q')).not.toBe('\\vec{0}')
    expect(answer(VS.solveAngleBetween(P, Q), 'θ')).toContain('90')
  })
})

describe('everyday vectors keep their answers exactly', () => {
  const E: VS.NamedVec = { name: 'A', v: [3, 4, 0] }
  const F: VS.NamedVec = { name: 'B', v: [2, -1, 0] }
  const answers = (sol: VS.Solution): string[] => sol.answers.map((a) => `${a.label}: ${a.tex}`)

  it('cross, dot, angle, projection, torque, work', () => {
    expect(answers(VS.solveCross(E, F))).toMatchInlineSnapshot(`
      [
        "A×B: -11\\hat{k}",
        "|A×B|: 11",
        "θ: 79.6952^\\circ",
      ]
    `)
    expect(answers(VS.solveDot(E, F))).toMatchInlineSnapshot(`
      [
        "A·B: 2",
        "θ: 79.6952^\\circ",
      ]
    `)
    expect(answers(VS.solveAngleBetween(E, F))).toMatchInlineSnapshot(`
      [
        "θ: 79.6952^\\circ",
      ]
    `)
    expect(answers(VS.solveProjection(F, E))).toMatchInlineSnapshot(`
      [
        "B cos θ: 0.4",
        "proj of B on A: 0.24\\hat{i} + 0.32\\hat{j}",
      ]
    `)
    expect(answers(VS.solveTorque([0.5, 0, 0], [0, 20, 0]))).toMatchInlineSnapshot(`
      [
        "τ: 10\\hat{k}\\,\\text{N m}",
        "|τ|: 10\\,\\text{N m}",
        "θ: 90^\\circ",
      ]
    `)
    expect(answers(VS.solveWork([10, 0, 0], [3, 4, 0]))).toMatchInlineSnapshot(`
      [
        "W: 30\\,\\text{J}",
        "θ: 53.1301^\\circ",
      ]
    `)
  })

  it('law of cosines and the resultant of two forces', () => {
    expect(answers(VS.solveAdditionCosineLaw(E, F))).toMatchInlineSnapshot(`
      [
        "R: 5.831",
        "angle with A: 22.1663^\\circ",
      ]
    `)
    expect(answers(VS.solveTwoForces(3, 4, 90))).toMatchInlineSnapshot(`
      [
        "R: 5\\,\\text{N}",
        "α: 53.1301^\\circ",
      ]
    `)
    expect(answers(VS.solveTwoForces(1, 7.5, 150))).toMatchInlineSnapshot(`
      [
        "R: 6.6528\\,\\text{N}",
        "α: 145.6898^\\circ",
      ]
    `)
    expect(answers(VS.solveTwoForces(5, 5, 60))).toMatchInlineSnapshot(`
      [
        "R: 8.6603\\,\\text{N}",
        "α: 30^\\circ",
      ]
    `)
  })

  it('the everyday working is unchanged too', () => {
    const lines = (sol: VS.Solution): string => sol.steps.map((st) => `${st.text ?? ''} | ${st.tex ?? ''}`).join('\n')
    expect(lines(VS.solveTwoForces(3, 4, 90))).toMatchInlineSnapshot(`
      "Place F₁ along the +x axis and F₂ at θ = 90° to it. | 
      x-component of the resultant: | R_x = F_1\\cos 0^\\circ + F_2\\cos\\theta = 3 + 4\\cos 90^\\circ = 3\\,\\text{N}
      y-component of the resultant: | R_y = F_1\\sin 0^\\circ + F_2\\sin\\theta = 4\\sin 90^\\circ = 4\\,\\text{N}
      Magnitude: | R = \\sqrt{R_x^2 + R_y^2} = \\sqrt{3^2 + 4^2} = \\sqrt{25} = 5\\,\\text{N}
      Same result from the law of cosines: | R = \\sqrt{F_1^2 + F_2^2 + 2F_1F_2\\cos\\theta} = \\sqrt{3^2 + 4^2 + 2\\times 3\\times 4\\cos 90^\\circ} = \\sqrt{25} = 5\\,\\text{N}
      Direction of R measured from F₁: | \\alpha = \\tan^{-1}\\left(\\frac{R_y}{R_x}\\right) = \\tan^{-1}\\left(\\frac{4}{3}\\right) = 53.1301^\\circ"
    `)
    expect(lines(VS.solveDot(E, F))).toMatchInlineSnapshot(`
      "Given: | \\vec{A} = 3\\hat{i} + 4\\hat{j},\\quad \\vec{B} = 2\\hat{i} - 1\\hat{j}
      Scalar product in terms of rectangular components: | \\vec{A}\\cdot\\vec{B} = A_{x}B_{x} + A_{y}B_{y}
       | = (3)(2) + (4)(-1) = 2
      Magnitudes: | A = 5,\\quad B = 2.2361
      Angle between them: | \\cos\\theta = \\frac{\\vec{A}\\cdot\\vec{B}}{A\\,B} = \\frac{2}{5\\times2.23607} = 0.178885
       | \\theta = \\cos^{-1}(0.178885) = 79.6952^\\circ
      Meaning: A·B = |A| × (projection of B on A). | B\\cos\\theta = 2.2361\\cos 79.6952^\\circ = 0.4"
    `)
    expect(lines(VS.solveAdditionCosineLaw(E, F))).toMatchInlineSnapshot(`
      "Sizes and the angle between them: | A = 5,\\quad B = 2.2361,\\quad \\theta = 79.6952^\\circ
      Law of cosines (the angle inside the triangle is 180° − θ, which flips the sign): | R^2 = A^2 + B^2 + 2\\,AB\\cos\\theta = 5^2 + 2.23607^2 + 2\\times 5\\times 2.23607\\cos 79.69515^\\circ = 25 + 5 + 4 = 34
      So the size of the resultant is | R = \\sqrt{34} = 5.831
      Law of sines gives the angle α between R and A: | \\frac{\\sin\\alpha}{B} = \\frac{\\sin\\theta}{R} \\;\\Rightarrow\\; \\sin\\alpha = \\frac{2.236068\\sin 79.695154^\\circ}{5.830952} = 0.3772969
       | \\alpha = \\sin^{-1}(0.3772969) = 22.1663^\\circ
      The component method gives the same answer — use whichever your book prefers. | "
    `)
  })
})

describe('law of cosines when B is almost −A', () => {
  it('1î + (−1 + 10⁻¹⁰)î gives R = 10⁻¹⁰ and never divides by a zero R', () => {
    const sol = VS.solveAdditionCosineLaw({ name: 'A', v: [1, 0, 0] }, { name: 'B', v: [-1 + 1e-10, 0, 0] })
    const r = sol.answers.find((a) => a.label === 'R')?.tex ?? ''
    expect(r).toMatch(/10\^\{-10\}|10\^\{−10\}/)
    for (const st of sol.steps) expect(st.tex ?? '').not.toMatch(/\/\s*0\b|\{0\}\s*\\approx/)
  })

  it('1î + (−1 + 10⁻⁶)î gives 1.0000×10⁻⁶ (the formula lost digits: 9.9993×10⁻⁷)', () => {
    const sol = VS.solveAdditionCosineLaw({ name: 'A', v: [1, 0, 0] }, { name: 'B', v: [-1 + 1e-6, 0, 0] })
    const r = sol.answers.find((a) => a.label === 'R')?.tex ?? ''
    expect(r).not.toMatch(/9\.999/)
  })
})
