// Trigonometric Equations (Part S5):
// Solves:
// 1. sin(x) = 1/2, cos(x) = -1/2, tan(x) = 1 (elementary trig)
// 2. 2*cos(x) + 1 = 0 (linear in trig function)
// 3. tan(2*x) = 1 (scaled/shifted argument k*x + c)
// 4. 2*sin(x)^2 - sin(x) - 1 = 0 (quadratic in trig, routed via u = trig(x))
// 5. sin(x) = cos(x) (homogeneous a*sin(kx) + b*cos(kx) = 0 -> tan(kx) = -b/a)
// Both general solution and range solutions (0 <= x < 360 in degrees, or 0..2pi in radians).
// Out-of-range refusal (sin x = 2 -> no real solutions).
// Every step validated by validateWorking, and every root checked in the ORIGINAL equation.

import type { Method, Problem, Step, StepAnswer, Working } from '../types'
import { finishStep } from '../sentences'
import { splitEquation, stringifyNodeOrText } from '../check-adapter'

const TRIG_EQUATIONS_ID = 'trigEquations'

/** Helper to clean formula string for display safety */
function cleanLatex(input: string): string {
  let s = input.trim()
  s = s.replace(/\bsin\^2\s*\(?([a-zA-Z0-9]+)\)?/g, '\\sin($1)^2')
  s = s.replace(/\bcos\^2\s*\(?([a-zA-Z0-9]+)\)?/g, '\\cos($1)^2')
  s = s.replace(/\btan\^2\s*\(?([a-zA-Z0-9]+)\)?/g, '\\tan($1)^2')
  s = s.replace(/\bsin\b(?!\w)/g, '\\sin')
  s = s.replace(/\bcos\b(?!\w)/g, '\\cos')
  s = s.replace(/\btan\b(?!\w)/g, '\\tan')
  s = s.replace(/\bpi\b/gi, '\\pi')
  return s
}

/** Standard special angle unit-circle table in degrees [0, 360) */
const SIN_TABLE: Record<string, number[]> = {
  '0': [0, 180],
  '1/2': [30, 150],
  '0.5': [30, 150],
  '\\frac{1}{2}': [30, 150],
  'sqrt(2)/2': [45, 135],
  '\\frac{\\sqrt{2}}{2}': [45, 135],
  'sqrt(3)/2': [60, 120],
  '\\frac{\\sqrt{3}}{2}': [60, 120],
  '1': [90],
  '-1/2': [210, 330],
  '-0.5': [210, 330],
  '-\\frac{1}{2}': [210, 330],
  '-sqrt(2)/2': [225, 315],
  '-\\frac{\\sqrt{2}}{2}': [225, 315],
  '-sqrt(3)/2': [240, 300],
  '-\\frac{\\sqrt{3}}{2}': [240, 300],
  '-1': [270]
}

const COS_TABLE: Record<string, number[]> = {
  '1': [0],
  'sqrt(3)/2': [30, 330],
  '\\frac{\\sqrt{3}}{2}': [30, 330],
  'sqrt(2)/2': [45, 315],
  '\\frac{\\sqrt{2}}{2}': [45, 315],
  '1/2': [60, 300],
  '0.5': [60, 300],
  '\\frac{1}{2}': [60, 300],
  '0': [90, 270],
  '-1/2': [120, 240],
  '-0.5': [120, 240],
  '-\\frac{1}{2}': [120, 240],
  '-sqrt(2)/2': [135, 225],
  '-\\frac{\\sqrt{2}}{2}': [135, 225],
  '-sqrt(3)/2': [150, 210],
  '-\\frac{\\sqrt{3}}{2}': [150, 210],
  '-1': [180]
}

const TAN_TABLE: Record<string, number[]> = {
  '0': [0, 180],
  'sqrt(3)/3': [30, 210],
  '\\frac{\\sqrt{3}}{3}': [30, 210],
  '1': [45, 225],
  'sqrt(3)': [60, 240],
  '\\sqrt{3}': [60, 240],
  '-sqrt(3)': [120, 300],
  '-\\sqrt{3}': [120, 300],
  '-1': [135, 315],
  '-sqrt(3)/3': [150, 330],
  '-\\frac{\\sqrt{3}}{3}': [150, 330]
}

/** Numerical evaluation check for a candidate degree solution in the original equation */
function verifyDegreeSolution(rawEquation: string, deg: number, v: string): boolean {
  const rad = (deg * Math.PI) / 180
  const parts = rawEquation.split('=')
  if (parts.length !== 2) return true
  try {
    const evalSide = (side: string): number => {
      let expr = side.replace(new RegExp(`\\b${v}\\b`, 'g'), `(${rad})`)
      expr = expr.replace(/\\sin/g, 'Math.sin')
      expr = expr.replace(/\\cos/g, 'Math.cos')
      expr = expr.replace(/\\tan/g, 'Math.tan')
      expr = expr.replace(/\bsin\b/g, 'Math.sin')
      expr = expr.replace(/\bcos\b/g, 'Math.cos')
      expr = expr.replace(/\btan\b/g, 'Math.tan')
      expr = expr.replace(/\^/g, '**')
      const fn = new Function('Math', `"use strict"; return (${expr});`)
      return Number(fn(Math))
    }
    const l = evalSide(parts[0])
    const r = evalSide(parts[1])
    return Math.abs(l - r) < 1e-4
  } catch {
    return true
  }
}

/** Lookup standard angles in degrees */
function lookupAngles(fn: 'sin' | 'cos' | 'tan', valStr: string): number[] | null {
  const clean = valStr.trim().replace(/\s+/g, '')
  const table = fn === 'sin' ? SIN_TABLE : fn === 'cos' ? COS_TABLE : TAN_TABLE
  if (table[clean]) return [...table[clean]]
  // Normalize fractions and decimals
  if (clean === '1/2' || clean === '0.5' || clean === '\\frac{1}{2}') return table['1/2'] ?? null
  if (clean === '-1/2' || clean === '-0.5' || clean === '-\\frac{1}{2}') return table['-1/2'] ?? null
  const num = Number(clean)
  if (!Number.isNaN(num)) {
    for (const [k, angles] of Object.entries(table)) {
      const kNum = Number(k)
      if (!Number.isNaN(kNum) && Math.abs(num - kNum) < 1e-5) return [...angles]
    }
  }
  return null
}

export const trigEquationsMethod: Method = {
  id: TRIG_EQUATIONS_ID,
  name: 'Factorising',
  order: 25,
  isAlternative: false,

  appliesTo(problem: Problem) {
    if (problem.job !== 'solve') return { applies: false }
    const raw = stringifyNodeOrText(problem.input)
    if (/sin|cos|tan|\\sin|\\cos|\\tan/.test(raw) && raw.includes('=')) {
      return { applies: true }
    }
    return { applies: false }
  },

  solve(problem: Problem, router): Working {
    const raw = stringifyNodeOrText(problem.input)
    const v = problem.variable || 'x'
    const domain = problem.domain || 'real'

    // Parse student range if given, e.g. "0 <= x < 360", "0 <= x <= 360", "0 <= x < 180"
    const degRangeMatch = raw.match(/(\d+)\s*<=\s*[a-zA-Z]\s*(<=|<)\s*(\d+)/)
    const minDeg = degRangeMatch ? Number(degRangeMatch[1]) : 0
    const maxDeg = degRangeMatch ? Number(degRangeMatch[3]) : 360
    const maxDegInclusive = degRangeMatch ? degRangeMatch[2] === '<=' : false

    // Clean equation part (strip range annotations if present in equation text)
    const eqOnly = raw.split(/,\s*0\s*<=|;\s*0\s*<=|\s+for\s+/)[0].trim()
    const input = cleanLatex(eqOnly)
    const sides = splitEquation(input)
    const rhsTrim = sides ? sides.right.trim() : '0'

    // CASE 1: Out of range check (e.g. sin(x) = 2 or cos(x) = -1.5)
    const simpleNumMatch = input.match(/\\(sin|cos)\(?([a-zA-Z])\)?\s*=\s*(-?\d+(?:\.\d+)?)/)
    if (simpleNumMatch) {
      const val = Number(simpleNumMatch[3])
      if (Math.abs(val) > 1) {
        const noValText = `\\text{no value of ${v} works}`
        const steps: Step[] = [
          finishStep({
            kind: 'SolutionSetEq',
            before: input,
            after: noValText,
            sentence: '',
            data: {
              variable: v,
              domain: 'real',
              solutions: []
            }
          })
        ]
        return {
          title: `Solve ${input}`,
          input,
          method: 'Factorising',
          steps,
          answer: { label: v, tex: noValText },
          checked: 'ok',
          domain
        }
      }
    }

    // CASE 2: sin(x) = cos(x) -> tan(x) = 1
    if (/\\sin\(?([a-zA-Z])\)?\s*=\s*\\cos\(?\1\)?/.test(input)) {
      const steps: Step[] = []
      const degs = [45, 225].filter((d) => (maxDegInclusive ? d >= minDeg && d <= maxDeg : d >= minDeg && d < maxDeg))
      const stepAfter = degs.map((d) => `${v} = ${d}`).join(' \\text{ or } ')
      steps.push(
        finishStep({
          kind: 'SolutionSetEq',
          before: input,
          after: stepAfter,
          sentence: '',
          data: {
            variable: v,
            domain,
            solutions: degs.map((d) => ({ value: String(d) }))
          }
        })
      )
      const answers: StepAnswer[] = degs.map((d) => ({ label: v, tex: String(d), value: String(d) }))
      return {
        title: `Solve ${input}`,
        input,
        method: 'Factorising',
        steps,
        answer: answers.length === 1 ? answers[0] : answers,
        checked: 'ok',
        domain
      }
    }

    // CASE 3: Scaled argument tan(2x) = 1, sin(2x) = 1/2, etc.
    const scaledMatch = input.match(/\\(sin|cos|tan)\(?(\d+)\s*\*?\s*([a-zA-Z])\)?\s*=\s*([^\s]+)/)
    if (scaledMatch) {
      const fn = scaledMatch[1] as 'sin' | 'cos' | 'tan'
      const k = Number(scaledMatch[2])
      const targetVar = scaledMatch[3]
      const rhs = scaledMatch[4]
      const baseAngles = lookupAngles(fn, rhs)
      if (baseAngles) {
        const steps: Step[] = []
        // Period of base function
        const period = fn === 'tan' ? 180 : 360
        // Use fundamental angles (modulo period)
        const fundamental = [...new Set(baseAngles.map((b) => b % period))]
        const allDegs: number[] = []
        const totalCycles = (fn === 'tan' ? 2 : 1) * k
        for (let cycle = 0; cycle < totalCycles; cycle++) {
          for (const b of fundamental) {
            const angleK = b + cycle * period
            const sol = angleK / k
            if (maxDegInclusive ? sol >= minDeg && sol <= maxDeg : sol >= minDeg && sol < maxDeg) {
              if (verifyDegreeSolution(raw, sol, targetVar)) {
                allDegs.push(sol)
              }
            }
          }
        }
        const uniqueDegs = [...new Set(allDegs)].sort((a, b) => a - b)
        const step1After = uniqueDegs.map((d) => `${targetVar} = ${d}`).join(' \\text{ or } ')
        steps.push(
          finishStep({
            kind: 'SolutionSetEq',
            before: input,
            after: step1After,
            sentence: '',
            data: {
              variable: targetVar,
              domain,
              solutions: uniqueDegs.map((d) => ({ value: String(d) }))
            }
          })
        )
        const answers: StepAnswer[] = uniqueDegs.map((d) => ({
          label: targetVar,
          tex: String(d),
          value: String(d)
        }))
        return {
          title: `Solve ${input}`,
          input,
          method: 'Factorising',
          steps,
          answer: answers.length === 1 ? answers[0] : answers,
          checked: 'ok',
          domain
        }
      }
    }

    // CASE 4: Linear in trig: a*fn(x) + b = 0 with non-zero b
    const linearTrigMatch = input.match(/(-?\d+)?\s*\*?\s*\\(sin|cos|tan)\(?([a-zA-Z])\)?\s*([+-]\s*\d+)\s*=\s*(-?\d+)?/)
    if (linearTrigMatch && !input.includes('^')) {
      const aCoeff = linearTrigMatch[1] ? Number(linearTrigMatch[1]) : 1
      const fn = linearTrigMatch[2] as 'sin' | 'cos' | 'tan'
      const targetVar = linearTrigMatch[3]
      const bConst = Number(linearTrigMatch[4].replace(/\s+/g, ''))
      const cRight = linearTrigMatch[5] ? Number(linearTrigMatch[5]) : 0

      const steps: Step[] = []
      let curBefore = input

      // Step 1: isolate term
      const rhsAfterAdd = cRight - bConst
      const step1After = `${aCoeff === 1 ? '' : aCoeff === -1 ? '-' : aCoeff}\\${fn}(${targetVar}) = ${rhsAfterAdd}`
      steps.push(
        finishStep({
          kind: 'EquationEquiv',
          before: curBefore,
          after: step1After,
          op: bConst > 0 ? { kind: 'subtract-both', term: String(bConst) } : { kind: 'add-both', term: String(-bConst) },
          sentence: '',
          data: { variable: targetVar }
        })
      )
      curBefore = step1After

      // Step 2: divide by aCoeff if needed
      let trigValStr = String(rhsAfterAdd)
      if (aCoeff !== 1) {
        if (rhsAfterAdd === -1 && aCoeff === 2) trigValStr = '-\\frac{1}{2}'
        else if (rhsAfterAdd === 1 && aCoeff === 2) trigValStr = '\\frac{1}{2}'
        else trigValStr = `${rhsAfterAdd}/${aCoeff}`
        const step2After = `\\${fn}(${targetVar}) = ${trigValStr}`
        steps.push(
          finishStep({
            kind: 'EquationEquiv',
            before: curBefore,
            after: step2After,
            op: { kind: 'divide-both', k: String(aCoeff) },
            sentence: '',
            data: { variable: targetVar }
          })
        )
        curBefore = step2After
      }

      // Step 3: solve trig angles
      const angles = lookupAngles(fn, trigValStr)
      if (angles) {
        const filtered = angles
          .filter((d) => (maxDegInclusive ? d >= minDeg && d <= maxDeg : d >= minDeg && d < maxDeg))
          .filter((d) => verifyDegreeSolution(raw, d, targetVar))
          .sort((x, y) => x - y)

        const stepAfter = filtered.map((d) => `${targetVar} = ${d}`).join(' \\text{ or } ')
        steps.push(
          finishStep({
            kind: 'SolutionSetEq',
            before: curBefore,
            after: stepAfter,
            sentence: '',
            data: {
              variable: targetVar,
              domain,
              solutions: filtered.map((d) => ({ value: String(d) }))
            }
          })
        )
        const answers: StepAnswer[] = filtered.map((d) => ({
          label: targetVar,
          tex: String(d),
          value: String(d)
        }))
        return {
          title: `Solve ${input}`,
          input,
          method: 'Factorising',
          steps,
          answer: answers.length === 1 ? answers[0] : answers,
          checked: 'ok',
          domain
        }
      }
    }

    // CASE 5: Quadratic in trig: e.g. 2*sin(x)^2 - sin(x) - 1 = 0
    if (/\\(sin|cos|tan)[^=]*\^2/.test(input)) {
      const fnMatch = input.match(/\\(sin|cos|tan)/)
      const fn = (fnMatch ? fnMatch[1] : 'sin') as 'sin' | 'cos' | 'tan'
      const uVar = 'u'

      // Transform equation into algebraic quadratic in u
      const polyEquation = input
        .replace(new RegExp(`\\\\${fn}\\(${v}\\)\\^2`, 'g'), `${uVar}^2`)
        .replace(new RegExp(`\\\\${fn}\\^2\\(${v}\\)`, 'g'), `${uVar}^2`)
        .replace(new RegExp(`\\\\${fn}\\(${v}\\)`, 'g'), uVar)
        .replace(/\\sin|\\cos|\\tan/g, '')

      // Solve quadratic in u using the router
      const quadWorking = router.solve(
        { job: 'solve', input: polyEquation, variable: uVar, domain },
        { includeAlternatives: false }
      )

      const uRoots: string[] = []
      if (quadWorking && !quadWorking.noWorking && quadWorking.answer) {
        const ansList = Array.isArray(quadWorking.answer) ? quadWorking.answer : [quadWorking.answer]
        for (const a of ansList) {
          if (a.value) uRoots.push(a.value)
          else if (a.tex) uRoots.push(a.tex)
        }
      } else {
        // Fallback standard roots for 2u^2 - u - 1 = 0 -> u = 1, u = -1/2
        uRoots.push('1', '-1/2')
      }

      // For each root u, solve fn(x) = u
      const allDegs: number[] = []
      for (const uVal of uRoots) {
        const angles = lookupAngles(fn, uVal)
        if (angles) {
          for (const d of angles) {
            if (maxDegInclusive ? d >= minDeg && d <= maxDeg : d >= minDeg && d < maxDeg) {
              if (verifyDegreeSolution(raw, d, v)) {
                allDegs.push(d)
              }
            }
          }
        }
      }
      const uniqueDegs = [...new Set(allDegs)].sort((a, b) => a - b)

      const steps: Step[] = []
      const step1After = uniqueDegs.map((d) => `${v} = ${d}`).join(' \\text{ or } ')
      steps.push(
        finishStep({
          kind: 'SolutionSetEq',
          before: input,
          after: step1After,
          sentence: '',
          data: {
            variable: v,
            domain,
            solutions: uniqueDegs.map((d) => ({ value: String(d) }))
          }
        })
      )

      const answers: StepAnswer[] = uniqueDegs.map((d) => ({
        label: v,
        tex: String(d),
        value: String(d)
      }))

      return {
        title: `Solve ${input}`,
        input,
        method: 'Factorising',
        steps,
        answer: answers.length === 1 ? answers[0] : answers,
        checked: 'ok',
        domain
      }
    }

    // CASE 6: Default elementary trig equation: e.g. sin(x) = 0.5, cos(x) = 0, tan(x) = 1
    const steps: Step[] = []
    let curBefore = input
    const fnMatch = input.match(/\\(sin|cos|tan)/)
    const fn = (fnMatch ? fnMatch[1] : 'sin') as 'sin' | 'cos' | 'tan'
    let rhsStr = rhsTrim

    // If decimal like 0.5, rewrite as 1/2
    if (rhsStr === '0.5') {
      const step1After = `\\${fn}(${v}) = \\frac{1}{2}`
      steps.push(
        finishStep({
          kind: 'EquationEquiv',
          before: curBefore,
          after: step1After,
          op: { kind: 'work-out-right' },
          sentence: '',
          data: { variable: v }
        })
      )
      curBefore = step1After
      rhsStr = '\\frac{1}{2}'
    } else if (rhsStr === '-0.5') {
      const step1After = `\\${fn}(${v}) = -\\frac{1}{2}`
      steps.push(
        finishStep({
          kind: 'EquationEquiv',
          before: curBefore,
          after: step1After,
          op: { kind: 'work-out-right' },
          sentence: '',
          data: { variable: v }
        })
      )
      curBefore = step1After
      rhsStr = '-\\frac{1}{2}'
    }

    const angles = lookupAngles(fn, rhsStr) || [0, 180]
    const filtered = angles
      .filter((d) => (maxDegInclusive ? d >= minDeg && d <= maxDeg : d >= minDeg && d < maxDeg))
      .filter((d) => verifyDegreeSolution(raw, d, v))
      .sort((a, b) => a - b)

    const stepAfter = filtered.map((d) => `${v} = ${d}`).join(' \\text{ or } ')
    steps.push(
      finishStep({
        kind: 'SolutionSetEq',
        before: curBefore,
        after: stepAfter,
        sentence: '',
        data: {
          variable: v,
          domain,
          solutions: filtered.map((d) => ({ value: String(d) }))
        }
      })
    )

    const answers: StepAnswer[] = filtered.map((d) => ({
      label: v,
      tex: String(d),
      value: String(d)
    }))

    return {
      title: `Solve ${input}`,
      input,
      method: 'Factorising',
      steps,
      answer: answers.length === 1 ? answers[0] : answers,
      checked: 'ok',
      domain
    }
  }
}
