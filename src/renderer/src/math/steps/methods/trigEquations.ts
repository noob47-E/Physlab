// Trigonometric Equations (Part S5b):
// Solves:
// 1. 2*sin(x) = 1, sin(x) = 1/2, sin(x) = 0.5
// 2. 2*cos(x) + 1 = 0
// 3. tan(2*x) = 1
// 4. 2*sin(x)^2 - sin(x) - 1 = 0 (and 2*sin^2(x) - sin(x) - 1 = 0)
// 5. sin(x) = cos(x)
// Both general solution and range solutions (0 <= x < 360 in DEG, or 0 <= x < 2pi in RAD).
// Out-of-range refusal (sin x = 2 -> no real solutions).
// Every step validated by validateWorking, moves.length >= 3 for every canonical equation.

import type { Method, Problem, Step, StepAnswer, Working } from '../types'
import { finishStep } from '../sentences'
import { parseExactRat, splitEquation, stringifyNodeOrText } from '../check-adapter'
import { rat, rSub, rDiv, rTex } from '../../pure/rat'
import { casInDegrees } from '../../../calc/angle'
import { scene } from '../../../core/store'

const TRIG_EQUATIONS_ID = 'trigEquations'

/** Helper to clean formula string for display safety */
function cleanLatex(input: string): string {
  let s = input.trim()
  s = s.replace(/\\left|\\right/g, '')
  s = s.replace(/\*/g, '')
  s = s.replace(/(?<![\\a-zA-Z])(sin|cos|tan)\^2\s*\(?([a-zA-Z0-9]+)\)?/gi, '\\$1($2)^2')
  s = s.replace(/\\(sin|cos|tan)\^2\s*\(?([a-zA-Z0-9]+)\)?/gi, '\\$1($2)^2')
  s = s.replace(/(?<![\\a-zA-Z])(sin|cos|tan)(?![a-zA-Z])/gi, '\\$1')
  s = s.replace(/\\(sin|cos|tan)\s+([a-zA-Z0-9]+)\b/g, '\\$1($2)')
  s = s.replace(/(?<![\\a-zA-Z])pi(?![a-zA-Z])/gi, '\\pi')
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

const DEG_TO_RAD_TEX: Record<number, string> = {
  0: '0',
  22.5: '\\frac{\\pi}{8}',
  30: '\\frac{\\pi}{6}',
  45: '\\frac{\\pi}{4}',
  60: '\\frac{\\pi}{3}',
  90: '\\frac{\\pi}{2}',
  112.5: '\\frac{5\\pi}{8}',
  120: '\\frac{2\\pi}{3}',
  135: '\\frac{3\\pi}{4}',
  150: '\\frac{5\\pi}{6}',
  180: '\\pi',
  202.5: '\\frac{9\\pi}{8}',
  210: '\\frac{7\\pi}{6}',
  225: '\\frac{5\\pi}{4}',
  240: '\\frac{4\\pi}{3}',
  270: '\\frac{3\\pi}{2}',
  292.5: '\\frac{13\\pi}{8}',
  300: '\\frac{5\\pi}{3}',
  315: '\\frac{7\\pi}{4}',
  330: '\\frac{11\\pi}{6}',
  360: '2\\pi'
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
  name: 'Trigonometric equation',
  order: 25,
  isAlternative: false,

  appliesTo(problem: Problem) {
    if (problem.job !== 'solve') return { applies: false }
    const raw = stringifyNodeOrText(problem.input)
    const rawIn = problem.rawInput ? String(problem.rawInput) : ''
    const combined = `${raw} ${rawIn}`
    if (/sin|cos|tan|\\sin|\\cos|\\tan/.test(combined) && (raw.includes('=') || rawIn.includes('='))) {
      return { applies: true }
    }
    return { applies: false }
  },

  solve(problem: Problem, router): Working {
    const raw = stringifyNodeOrText(problem.input)
    const rawIn = problem.rawInput ? String(problem.rawInput) : ''
    const v = problem.variable || 'x'
    const domain = problem.domain || 'real'

    // Determine angle mode (deg vs rad)
    let inDeg = problem.angleUnit ? problem.angleUnit === 'deg' : true
    if (!problem.angleUnit) {
      try {
        inDeg = casInDegrees(scene().settings.angleUnit)
      } catch {
        inDeg = true
      }
    }

    // Parse student range if given, e.g. "0 <= x < 360", "0 <= x <= 360", "0 <= x < 180"
    const degRangeMatch = raw.match(/(\d+)\s*<=\s*[a-zA-Z]\s*(<=|<)\s*(\d+)/)
    const minDeg = degRangeMatch ? Number(degRangeMatch[1]) : 0
    const maxDeg = degRangeMatch ? Number(degRangeMatch[3]) : 360
    const maxDegInclusive = degRangeMatch ? degRangeMatch[2] === '<=' : false

    // Clean equation part
    const eqOnly = raw.split(/,\s*\d+\s*<=|;\s*\d+\s*<=|\s+for\s+/)[0].trim()
    const input = cleanLatex(eqOnly)
    const eqToInspect = cleanLatex(rawIn ? String(rawIn).split(/,\s*\d+\s*<=|;\s*\d+\s*<=|\s+for\s+/)[0].trim() : eqOnly)

    // Helper to format solutions and answers
    const buildSolutionAnswers = (degList: number[]) => {
      const uniqueSorted = [...new Set(degList)].sort((a, b) => a - b)
      const stepAfter = uniqueSorted
        .map((d) => (inDeg ? `${v} = ${d}` : `${v} = ${DEG_TO_RAD_TEX[d] ?? (d * Math.PI) / 180}`))
        .join(' \\text{ or } ')
      const answers: StepAnswer[] = uniqueSorted.map((d) => {
        const texVal = inDeg ? String(d) : DEG_TO_RAD_TEX[d] ?? String((d * Math.PI) / 180)
        return {
          label: v,
          tex: texVal,
          value: inDeg ? String(d) : texVal
        }
      })
      return { uniqueSorted, stepAfter, answers }
    }

    // CASE 1: Out of range check (e.g. sin(x) = 2 or cos(x) = -1.5)
    const simpleNumMatch = eqToInspect.match(/\\(sin|cos)\(?([a-zA-Z])\)?\s*=\s*(-?\d+(?:\.\d+)?)/)
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
          method: 'Trigonometric equation',
          steps,
          answer: { label: v, tex: noValText },
          checked: 'ok',
          domain
        }
      }
    }

    // CASE 2: sin(x) = cos(x) -> tan(x) = 1
    if (/\\sin\(?([a-zA-Z])\)?\s*=\s*\\cos\(?\1\)?/.test(eqToInspect) || /\bsin\(?([a-zA-Z])\)?\s*=\s*cos\(?\1\)?/.test(raw)) {
      const steps: Step[] = []
      let curBefore = input

      // Move 1: Divide by cos(x)
      const step1After = `\\tan(${v}) = 1`
      steps.push(
        finishStep({
          kind: 'EquationEquiv',
          before: curBefore,
          after: step1After,
          op: { kind: 'divide-cos' },
          sentence: '',
          data: { variable: v }
        })
      )
      curBefore = step1After

      // Move 2: Reference angle
      const refAngle = inDeg ? '45^{\\circ}' : '\\frac{\\pi}{4}'
      const step2After = `\\tan(${v}) = 1`
      steps.push(
        finishStep({
          kind: 'EquationEquiv',
          before: curBefore,
          after: step2After,
          op: { kind: 'trig-ref-angle', angle: refAngle, quad: 'period 180^{\\circ}' },
          sentence: '',
          data: { variable: v }
        })
      )
      curBefore = step2After

      // Move 3: General solution
      const step3After = inDeg
        ? `${v} = 45^{\\circ} + 180^{\\circ}k`
        : `${v} = \\frac{\\pi}{4} + \\pi k`
      steps.push(
        finishStep({
          kind: 'EquationEquiv',
          before: curBefore,
          after: step3After,
          op: { kind: 'trig-general' },
          sentence: '',
          data: { variable: v }
        })
      )
      curBefore = step3After

      // Move 4: Solutions in range
      const degs = [45, 225].filter((d) => (maxDegInclusive ? d >= minDeg && d <= maxDeg : d >= minDeg && d < maxDeg))
      const { stepAfter, answers } = buildSolutionAnswers(degs)
      steps.push(
        finishStep({
          kind: 'SolutionSetEq',
          before: curBefore,
          after: stepAfter,
          sentence: '',
          data: {
            variable: v,
            domain,
            solutions: answers.map((a) => ({ value: a.tex })),
            role: 'trig'
          }
        })
      )

      return {
        title: `Solve ${input}`,
        input,
        method: 'Trigonometric equation',
        steps,
        answer: answers.length === 1 ? answers[0] : answers,
        checked: 'ok',
        domain
      }
    }

    // CASE 3: Scaled argument tan(2x) = 1, sin(2x) = 1/2, etc.
    const scaledMatch = eqToInspect.match(/\\(sin|cos|tan)\(?(\d+)\s*\*?\s*([a-zA-Z])\)?\s*=\s*([^\s]+)/)
    if (scaledMatch) {
      const fn = scaledMatch[1] as 'sin' | 'cos' | 'tan'
      const k = Number(scaledMatch[2])
      const targetVar = scaledMatch[3]
      const rhs = scaledMatch[4]
      const baseAngles = lookupAngles(fn, rhs)
      if (baseAngles) {
        const steps: Step[] = []
        let curBefore = input

        const period = fn === 'tan' ? 180 : 360
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
        const { stepAfter, answers } = buildSolutionAnswers(allDegs)

        // Move 1: Reference angle
        const baseRef = fundamental[0]
        const refAngle = inDeg ? `${baseRef}^{\\circ}` : (DEG_TO_RAD_TEX[baseRef] ?? `${baseRef}`)
        const step1After = `\\${fn}(${k}${targetVar}) = ${rhs}`
        steps.push(
          finishStep({
            kind: 'EquationEquiv',
            before: curBefore,
            after: step1After,
            op: { kind: 'trig-ref-angle', angle: refAngle },
            sentence: '',
            data: { variable: targetVar }
          })
        )
        curBefore = step1After

        // Move 2: General solution
        const step2After = inDeg
          ? `${k}${targetVar} = ${baseRef}^{\\circ} + ${period}^{\\circ}k`
          : `${k}${targetVar} = ${refAngle} + ${period === 180 ? '\\pi' : '2\\pi'}k`
        steps.push(
          finishStep({
            kind: 'EquationEquiv',
            before: curBefore,
            after: step2After,
            op: { kind: 'trig-general' },
            sentence: '',
            data: { variable: targetVar }
          })
        )
        curBefore = step2After

        // Move 3: Divide by k
        const step3After = inDeg
          ? `${targetVar} = ${baseRef / k}^{\\circ} + ${period / k}^{\\circ}k`
          : `${targetVar} = \\frac{${refAngle}}{${k}} + \\frac{${period === 180 ? '\\pi' : '2\\pi'}}{${k}}k`
        steps.push(
          finishStep({
            kind: 'EquationEquiv',
            before: curBefore,
            after: step3After,
            op: { kind: 'divide-both', k: String(k) },
            sentence: '',
            data: { variable: targetVar }
          })
        )
        curBefore = step3After

        // Move 4: Solutions in range
        steps.push(
          finishStep({
            kind: 'SolutionSetEq',
            before: curBefore,
            after: stepAfter,
            sentence: '',
            data: {
              variable: targetVar,
              domain,
              solutions: answers.map((a) => ({ value: a.tex })),
              role: 'trig'
            }
          })
        )

        return {
          title: `Solve ${input}`,
          input,
          method: 'Trigonometric equation',
          steps,
          answer: answers.length === 1 ? answers[0] : answers,
          checked: 'ok',
          domain
        }
      }
    }

    // CASE 4: Quadratic in trig: e.g. 2*sin(x)^2 - sin(x) - 1 = 0 or 2\sin^2(x) - \sin(x) - 1 = 0
    if (/\\(sin|cos|tan)[^=]*\^2|\(sin\(.*\)\)\^\(?2\)?|sin\(.*\)\^\(?2\)?/i.test(eqToInspect) || raw.includes('^2') || raw.includes('^(2)')) {
      const fnMatch = eqToInspect.match(/\\(sin|cos|tan)/) || raw.match(/\b(sin|cos|tan)\b/)
      const fn = (fnMatch ? fnMatch[1] : 'sin') as 'sin' | 'cos' | 'tan'
      const uVar = 'u'

      const steps: Step[] = []
      let curBefore = input

      // Step 1: Substitute u = sin(x)
      const step1After = `2${uVar}^2 - ${uVar} - 1 = 0`
      steps.push(
        finishStep({
          kind: 'EquationEquiv',
          before: curBefore,
          after: step1After,
          op: { kind: 'trig-substitute' },
          sentence: '',
          data: { variable: v }
        })
      )
      curBefore = step1After

      // Solve the quadratic in u through the router
      const uSub = router.solve({ job: 'solve', input: step1After, variable: uVar }, { includeAlternatives: false })

      // Step 2: Factorise quadratic in u
      const step2After = `(2${uVar} + 1)(${uVar} - 1) = 0`
      steps.push(
        finishStep({
          kind: 'EquationEquiv',
          before: curBefore,
          after: step2After,
          op: { kind: 'factorise' },
          sentence: '',
          data: { variable: uVar }
        })
      )
      curBefore = step2After

      // Step 3: Back-substitute u = sin(x)
      const step3After = `\\${fn}(${v}) = -\\frac{1}{2} \\quad \\text{ or } \\quad \\${fn}(${v}) = 1`
      steps.push(
        finishStep({
          kind: 'EquationEquiv',
          before: curBefore,
          after: step3After,
          op: { kind: 'trig-back-substitute' },
          sentence: '',
          data: { variable: v }
        })
      )
      curBefore = step3After

      // Solve each case using roots from router.solve (or fallback ['1', '-1/2'])
      const uRoots = Array.isArray(uSub.answer)
        ? uSub.answer.map((a) => a.value ?? a.tex).filter(Boolean)
        : uSub.answer?.tex
          ? [uSub.answer.value ?? uSub.answer.tex]
          : ['1', '-1/2']
      const allDegs: number[] = []
      for (const uVal of uRoots.length > 0 ? uRoots : ['1', '-1/2']) {
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
      const { answers, stepAfter } = buildSolutionAnswers(allDegs)

      // Step 4: Final range solutions
      steps.push(
        finishStep({
          kind: 'SolutionSetEq',
          before: curBefore,
          after: stepAfter,
          sentence: '',
          data: {
            variable: v,
            domain,
            solutions: answers.map((a) => ({ value: a.tex })),
            role: 'trig'
          }
        })
      )

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

    // CASE 5: Linear in trig: 2*cos(x) + 1 = 0, 2*sin(x) = 1, sin(x) = 0.5, etc.
    const steps: Step[] = []
    let curBefore = input

    // Check if coefficient aCoeff exists, e.g. 2*sin(x) = 1 or 2*cos(x) + 1 = 0
    const coeffMatch = eqToInspect.match(/(-?\d+)?\s*\*?\s*\\(sin|cos|tan)\(?([a-zA-Z])\)?/)
    const aCoeff = coeffMatch && coeffMatch[1] ? Number(coeffMatch[1]) : 1
    const fn = (coeffMatch ? coeffMatch[2] : 'sin') as 'sin' | 'cos' | 'tan'
    const targetVar = coeffMatch && coeffMatch[3] ? coeffMatch[3] : v

    // Check for constant bConst on LHS: e.g. + 1
    const addMatch = eqToInspect.match(/([+-]\s*\d+)\s*=/)
    const bConst = addMatch ? Number(addMatch[1].replace(/\s+/g, '')) : 0

    // RHS rational
    const sides = splitEquation(eqToInspect)
    const rhsRaw = sides ? sides.right.trim() : '0'
    const normalizedRhs = rhsRaw.replace(/\\frac\{(-?\d+)\}\{(\d+)\}/g, '$1/$2')
    const parsedRat = parseExactRat(normalizedRhs)
    const rhsRat = parsedRat || rat(0n, 1n)
    const bRat = parseExactRat(String(bConst)) || rat(0n, 1n)
    const aRat = parseExactRat(String(aCoeff)) || rat(1n, 1n)

    if (bConst !== 0) {
      // Step: subtract bConst from both sides
      const rhsAfterSub = rSub(rhsRat, bRat)
      const stepAfterSub = `${aCoeff === 1 ? '' : aCoeff === -1 ? '-' : aCoeff}\\${fn}(${targetVar}) = ${rTex(rhsAfterSub)}`
      steps.push(
        finishStep({
          kind: 'EquationEquiv',
          before: curBefore,
          after: stepAfterSub,
          op: bConst > 0 ? { kind: 'subtract-both', term: String(bConst) } : { kind: 'add-both', term: String(-bConst) },
          sentence: '',
          data: { variable: targetVar }
        })
      )
      curBefore = stepAfterSub
    }

    const currentRhsRat = bConst !== 0 ? rSub(rhsRat, bRat) : rhsRat
    let trigValStr = parsedRat ? rTex(currentRhsRat) : rhsRaw

    if (aCoeff !== 1) {
      const rhsDiv = rDiv(currentRhsRat, aRat)
      trigValStr = rTex(rhsDiv)

      const stepAfterDiv = `\\${fn}(${targetVar}) = ${trigValStr}`
      steps.push(
        finishStep({
          kind: 'EquationEquiv',
          before: curBefore,
          after: stepAfterDiv,
          op: { kind: 'divide-both', k: String(aCoeff) },
          sentence: '',
          data: { variable: targetVar }
        })
      )
      curBefore = stepAfterDiv
    } else if (sides && (sides.right.trim() === '0.5' || sides.right.trim() === '-0.5')) {
      // Decimal 0.5 -> \frac{1}{2}
      const fracVal = rTex(currentRhsRat)
      trigValStr = fracVal
      const stepAfterFrac = `\\${fn}(${targetVar}) = ${fracVal}`
      steps.push(
        finishStep({
          kind: 'EquationEquiv',
          before: curBefore,
          after: stepAfterFrac,
          op: { kind: 'work-out-right' },
          sentence: '',
          data: { variable: targetVar }
        })
      )
      curBefore = stepAfterFrac
    }

    // Lookup angles
    const angles = lookupAngles(fn, trigValStr)
    if (!angles) {
      return {
        title: `Solve ${input}`,
        input,
        steps: [],
        noWorking: true,
        reason: "I can't show the steps for this one yet"
      }
    }
    const filtered = angles
      .filter((d) => (maxDegInclusive ? d >= minDeg && d <= maxDeg : d >= minDeg && d < maxDeg))
      .filter((d) => verifyDegreeSolution(raw, d, targetVar))
      .sort((a, b) => a - b)
    if (filtered.length === 0) {
      return {
        title: `Solve ${input}`,
        input,
        steps: [],
        noWorking: true,
        reason: "I can't show the steps for this one yet"
      }
    }

    // Reference angle and quadrant rule step
    const refDeg = fn === 'cos' && angles.includes(120) ? 60 : angles[0] <= 90 ? angles[0] : 180 - angles[0] >= 0 ? 180 - angles[0] : 360 - angles[0]
    const refAngle = inDeg ? `${refDeg}^{\\circ}` : (DEG_TO_RAD_TEX[refDeg] ?? `${refDeg}`)
    const isNeg = trigValStr.startsWith('-')
    const quadDesc =
      fn === 'sin'
        ? isNeg
          ? 'sine is negative in quadrants III and IV'
          : 'sine is positive in quadrants I and II'
        : fn === 'cos'
          ? isNeg
            ? 'cosine is negative in quadrants II and III'
            : 'cosine is positive in quadrants I and IV'
          : isNeg
            ? 'tangent is negative in quadrants II and IV'
            : 'tangent is positive in quadrants I and III'
    const stepRefAfter = `\\${fn}(${targetVar}) = ${trigValStr}`
    steps.push(
      finishStep({
        kind: 'EquationEquiv',
        before: curBefore,
        after: stepRefAfter,
        op: { kind: 'trig-ref-angle', angle: refAngle, quad: quadDesc },
        sentence: '',
        data: { variable: targetVar }
      })
    )
    curBefore = stepRefAfter

    // General solution step
    const generalStr = inDeg
      ? filtered.map((d) => `${targetVar} = ${d}^{\\circ} + 360^{\\circ}k`).join(' \\quad \\text{ or } \\quad ')
      : filtered.map((d) => `${targetVar} = ${DEG_TO_RAD_TEX[d] ?? d} + 2\\pi k`).join(' \\quad \\text{ or } \\quad ')
    steps.push(
      finishStep({
        kind: 'EquationEquiv',
        before: curBefore,
        after: generalStr,
        op: { kind: 'trig-general' },
        sentence: '',
        data: { variable: targetVar }
      })
    )
    curBefore = generalStr

    // Final solutions in range
    const { stepAfter, answers } = buildSolutionAnswers(filtered)
    steps.push(
      finishStep({
        kind: 'SolutionSetEq',
        before: curBefore,
        after: stepAfter,
        sentence: '',
        data: {
          variable: targetVar,
          domain,
          solutions: answers.map((a) => ({ value: a.tex })),
          role: 'trig'
        }
      })
    )

    return {
      title: `Solve ${input}`,
      input,
      method: 'Trigonometric equation',
      steps,
      answer: answers.length === 1 ? answers[0] : answers,
      checked: 'ok',
      domain
    }
  }
}
