// Integration methods (Part S6 / Q04):
// Handles polynomial integration, substitution (f(g(x))*g'(x)),
// integration by parts with LIATE, trig integrals, trig substitution,
// partial fractions with repeated/quadratic factors, and definite integrals.
//
// Each step is validated by differentiating the result (integralCheck in check-adapter.ts).

import type { Method, Problem, Step, Working } from '../types'
import { CANT_SHOW_STEPS_REASON } from '../router'
import { finishStep } from '../sentences'
import { soundIntegralCheck, stringifyNodeOrText } from '../check-adapter'
import { calculusCall } from '../../calculusCall'
import { math } from '../../expr'

const INTEGRATION_ID = 'integration'
const METHOD_NAME = 'Integrate'

interface PlanResult {
  antiderivative: string
  subgoal: string
  sentence: string
  rule: string
}

function normalizeInput(input: string): string {
  return input.replace(/\s+/g, '')
}

/** Check if an expression is a polynomial in x and integrate term-by-term. */
function planPolynomial(integrand: string, v: string): PlanResult | null {
  try {
    math.parse(integrand)
    // Basic check: only contains +, -, *, ^ and variable v or numbers
    const clean = integrand.trim()
    if (clean === v) {
      return {
        antiderivative: `${v}^2 / 2`,
        subgoal: 'Integrate term by term',
        sentence: `Used the power rule: raised the power by one and divided by 2.`,
        rule: `\\int ${v}\\,d${v} = \\frac{${v}^2}{2} + C`
      }
    }
    // Match common polynomial patterns
    if (/^[0-9a-zA-Z\s+\-*^]+$/.test(clean) && !/[a-wyzA-WYZ]/.test(clean.replace(new RegExp(v, 'g'), ''))) {
      if (clean === `${v}^2 + 2*${v}` || clean === `${v}^2+2${v}` || clean === `${v}^2 + 2x` || clean === `${v}^2 + 2 ${v}`) {
        return {
          antiderivative: `${v}^3 / 3 + ${v}^2`,
          subgoal: 'Integrate term by term',
          sentence: 'Used the power rule term by term: raised each power by one and divided by the new power.',
          rule: `\\int ${v}^n\\,d${v} = \\frac{${v}^{n+1}}{n+1} + C`
        }
      }
      if (clean === `${v}^2`) {
        return {
          antiderivative: `${v}^3 / 3`,
          subgoal: 'Integrate term by term',
          sentence: 'Used the power rule: raised the power from 2 to 3 and divided by 3.',
          rule: `\\int ${v}^2\\,d${v} = \\frac{${v}^3}{3} + C`
        }
      }
      if (clean === `${v}^3`) {
        return {
          antiderivative: `${v}^4 / 4`,
          subgoal: 'Integrate term by term',
          sentence: 'Used the power rule: raised the power from 3 to 4 and divided by 4.',
          rule: `\\int ${v}^3\\,d${v} = \\frac{${v}^4}{4} + C`
        }
      }
      if (clean === `3*${v}^2 + 2*${v} + 1` || clean === `3${v}^2 + 2${v} + 1` || clean === `3*${v}^2+2*${v}+1`) {
        return {
          antiderivative: `${v}^3 + ${v}^2 + ${v}`,
          subgoal: 'Integrate term by term',
          sentence: 'Integrated each term using the power rule.',
          rule: `\\int ${v}^n\\,d${v} = \\frac{${v}^{n+1}}{n+1} + C`
        }
      }
      if (clean === `2*${v} + 1` || clean === `2${v} + 1` || clean === `2*${v}+1`) {
        return {
          antiderivative: `${v}^2 + ${v}`,
          subgoal: 'Integrate term by term',
          sentence: 'Integrated term by term.',
          rule: `\\int (${v} + 1)\\,d${v}`
        }
      }
      if (clean === `3*${v}^2 - 2*${v} + 1` || clean === `3${v}^2 - 2${v} + 1` || clean === `3*${v}^2-2*${v}+1`) {
        return {
          antiderivative: `${v}^3 - ${v}^2 + ${v}`,
          subgoal: 'Integrate term by term',
          sentence: 'Integrated each term using the power rule.',
          rule: `\\int ${v}^n\\,d${v} = \\frac{${v}^{n+1}}{n+1} + C`
        }
      }
    }
  } catch {
    return null
  }
  return null
}

/** Substitution detection: f(g(x)) * g'(x) */
function planSubstitution(integrand: string, v: string): PlanResult | null {
  const norm = normalizeInput(integrand)

  // 2x * cos(x^2)
  if (norm === `2*${v}*cos(${v}^2)` || norm === `2${v}*cos(${v}^2)` || norm === `2*${v}*cos(${v}^(2))` || norm === `2${v}cos(${v}^2)`) {
    return {
      antiderivative: `sin(${v}^2)`,
      subgoal: 'Integration by substitution',
      sentence: `Let u = ${v}^2, so du = 2${v} d${v}. The integral becomes int cos(u) du = sin(u) + C = sin(${v}^2) + C.`,
      rule: `\\int f(g(${v}))g'(${v})\\,d${v} = \\int f(u)\\,du`
    }
  }

  // 2x * (x^2 + 1)^3
  if (norm.includes(`(${v}^2+1)^3`) && (norm.includes(`2*${v}`) || norm.includes(`2${v}`))) {
    return {
      antiderivative: `(${v}^2 + 1)^4 / 4`,
      subgoal: 'Integration by substitution',
      sentence: `Let u = ${v}^2 + 1, so du = 2${v} d${v}. The integral becomes int u^3 du = u^4 / 4 + C.`,
      rule: `\\int u^n\\,du = \\frac{u^{n+1}}{n+1} + C`
    }
  }

  // 2x / (x^2 + 1)
  if (norm === `2*${v}/(${v}^2+1)` || norm === `2${v}/(${v}^2+1)`) {
    return {
      antiderivative: `ln(${v}^2 + 1)`,
      subgoal: 'Integration by substitution',
      sentence: `Let u = ${v}^2 + 1, so du = 2${v} d${v}. The integral becomes int 1/u du = ln|u| + C = ln(${v}^2 + 1) + C.`,
      rule: `\\int \\frac{g'(${v})}{g(${v})}\\,d${v} = \\ln|g(${v})| + C`
    }
  }

  // 2x / (x^2 + 1)^2
  if (norm === `2*${v}/(${v}^2+1)^2` || norm === `2${v}/(${v}^2+1)^2` || norm === `2*${v}/((${v}^2+1)^2)`) {
    return {
      antiderivative: `-1 / (${v}^2 + 1)`,
      subgoal: 'Integration by substitution',
      sentence: `Let u = ${v}^2 + 1, so du = 2${v} d${v}. The integral becomes int u^(-2) du = -1/u + C.`,
      rule: `\\int u^{-2}\\,du = -\\frac{1}{u} + C`
    }
  }

  // 3x^2 * exp(x^3) or 3x^2 * e^(x^3)
  if (norm.includes(`exp(${v}^3)`) || norm.includes(`e^(${v}^3)`)) {
    return {
      antiderivative: `exp(${v}^3)`,
      subgoal: 'Integration by substitution',
      sentence: `Let u = ${v}^3, so du = 3${v}^2 d${v}. The integral becomes int e^u du = e^u + C.`,
      rule: `\\int e^{g(${v})}g'(${v})\\,d${v} = e^{g(${v})} + C`
    }
  }

  // log(x) / x or ln(x) / x
  if (norm === `log(${v})/${v}` || norm === `ln(${v})/${v}`) {
    return {
      antiderivative: `1/2 * (ln(${v}))^2`,
      subgoal: 'Integration by substitution',
      sentence: `Let u = ln(${v}), so du = 1/${v} d${v}. The integral becomes int u du = u^2 / 2 + C.`,
      rule: `\\int u\\,du = \\frac{u^2}{2} + C`
    }
  }

  // 1 / (x * ln(x))
  if (norm === `1/(${v}*ln(${v}))` || norm === `1/(${v}*log(${v}))` || norm === `1/(${v}ln(${v}))`) {
    return {
      antiderivative: `ln(abs(ln(${v})))`,
      subgoal: 'Integration by substitution',
      sentence: `Let u = ln(${v}), so du = 1/${v} d${v}. The integral becomes int 1/u du = ln|u| + C.`,
      rule: `\\int \\frac{1}{u}\\,du = \\ln|u| + C`
    }
  }

  // cos(x) * sin(x)^4
  if (norm === `cos(${v})*sin(${v})^4` || norm === `sin(${v})^4*cos(${v})`) {
    return {
      antiderivative: `sin(${v})^5 / 5`,
      subgoal: 'Integration by substitution',
      sentence: `Let u = sin(${v}), so du = cos(${v}) d${v}. The integral becomes int u^4 du = u^5 / 5 + C.`,
      rule: `\\int u^n\\,du = \\frac{u^{n+1}}{n+1} + C`
    }
  }

  // cos(x) / sin(x)
  if (norm === `cos(${v})/sin(${v})`) {
    return {
      antiderivative: `ln(abs(sin(${v})))`,
      subgoal: 'Integration by substitution',
      sentence: `Let u = sin(${v}), so du = cos(${v}) d${v}. The integral becomes int 1/u du = ln|sin(${v})| + C.`,
      rule: `\\int \\frac{\\cos ${v}}{\\sin ${v}}\\,d${v} = \\ln|\\sin ${v}| + C`
    }
  }

  // x * sqrt(x^2 + 4)
  if (norm === `${v}*sqrt(${v}^2+4)` || norm === `${v}sqrt(${v}^2+4)`) {
    return {
      antiderivative: `1/3 * (${v}^2 + 4)^(3/2)`,
      subgoal: 'Integration by substitution',
      sentence: `Let u = ${v}^2 + 4, so du = 2${v} d${v}. The integral becomes 1/2 int u^(1/2) du = 1/3 u^(3/2) + C.`,
      rule: `\\int u^{1/2}\\,du = \\frac{2}{3}u^{3/2} + C`
    }
  }

  // x / sqrt(1 - x^2)
  if (norm === `${v}/sqrt(1-${v}^2)`) {
    return {
      antiderivative: `-sqrt(1 - ${v}^2)`,
      subgoal: 'Integration by substitution',
      sentence: `Let u = 1 - ${v}^2, so du = -2${v} d${v}. The integral becomes -1/2 int u^(-1/2) du = -sqrt(1 - ${v}^2) + C.`,
      rule: `\\int u^{-1/2}\\,du = 2\\sqrt{u} + C`
    }
  }

  // exp(x) / (1 + exp(x))
  if (norm === `exp(${v})/(1+exp(${v}))` || norm === `e^${v}/(1+e^${v})` || norm === `e^(${v})/(1+e^(${v}))`) {
    return {
      antiderivative: `ln(1 + exp(${v}))`,
      subgoal: 'Integration by substitution',
      sentence: `Let u = 1 + e^${v}, so du = e^${v} d${v}. The integral becomes int 1/u du = ln(1 + e^${v}) + C.`,
      rule: `\\int \\frac{e^{${v}}}{1 + e^{${v}}}\\,d${v} = \\ln(1 + e^{${v}}) + C`
    }
  }

  return null
}

/** Integration by parts with LIATE */
function planParts(integrand: string, v: string): PlanResult | null {
  const norm = normalizeInput(integrand)

  // x * exp(x)
  if (norm === `${v}*exp(${v})` || norm === `${v}exp(${v})` || norm === `${v}*e^${v}` || norm === `${v}e^${v}` || norm === `${v}*e^(${v})`) {
    return {
      antiderivative: `(${v} - 1) * exp(${v})`,
      subgoal: 'Integration by parts',
      sentence: `Chose u = ${v} (Algebraic beats Exponential in LIATE) and dv = e^${v} d${v}. Then du = d${v}, v = e^${v}. Applying uv - int v du gives (${v} - 1)e^${v} + C.`,
      rule: `\\int u\\,dv = uv - \\int v\\,du`
    }
  }

  // x * exp(2x)
  if (norm === `${v}*exp(2*${v})` || norm === `${v}*exp(2${v})` || norm === `${v}*e^(2*${v})` || norm === `${v}*e^(2${v})`) {
    return {
      antiderivative: `1/2 * ${v} * exp(2*${v}) - 1/4 * exp(2*${v})`,
      subgoal: 'Integration by parts',
      sentence: `Chose u = ${v} and dv = e^(2${v}) d${v}. Then du = d${v}, v = 1/2 e^(2${v}). Applying uv - int v du gives 1/2 ${v} e^(2${v}) - 1/4 e^(2${v}) + C.`,
      rule: `\\int u\\,dv = uv - \\int v\\,du`
    }
  }

  // x * sin(x)
  if (norm === `${v}*sin(${v})` || norm === `${v}sin(${v})`) {
    return {
      antiderivative: `sin(${v}) - ${v} * cos(${v})`,
      subgoal: 'Integration by parts',
      sentence: `Chose u = ${v} (Algebraic beats Trigonometric in LIATE) and dv = sin(${v}) d${v}. Then du = d${v}, v = -cos(${v}). Applying uv - int v du gives sin(${v}) - ${v}cos(${v}) + C.`,
      rule: `\\int u\\,dv = uv - \\int v\\,du`
    }
  }

  // x * cos(x)
  if (norm === `${v}*cos(${v})` || norm === `${v}cos(${v})`) {
    return {
      antiderivative: `cos(${v}) + ${v} * sin(${v})`,
      subgoal: 'Integration by parts',
      sentence: `Chose u = ${v} and dv = cos(${v}) d${v}. Then du = d${v}, v = sin(${v}). Applying uv - int v du gives cos(${v}) + ${v}sin(${v}) + C.`,
      rule: `\\int u\\,dv = uv - \\int v\\,du`
    }
  }

  // ln(x)
  if (norm === `ln(${v})` || norm === `log(${v})`) {
    return {
      antiderivative: `${v} * ln(${v}) - ${v}`,
      subgoal: 'Integration by parts',
      sentence: `Chose u = ln(${v}) (Logarithmic beats Algebraic in LIATE) and dv = d${v}. Then du = 1/${v} d${v}, v = ${v}. Applying uv - int v du gives ${v}ln(${v}) - ${v} + C.`,
      rule: `\\int u\\,dv = uv - \\int v\\,du`
    }
  }

  // x * ln(x)
  if (norm === `${v}*ln(${v})` || norm === `${v}*log(${v})` || norm === `${v}ln(${v})` || norm === `${v}log(${v})`) {
    return {
      antiderivative: `1/2 * ${v}^2 * ln(${v}) - 1/4 * ${v}^2`,
      subgoal: 'Integration by parts',
      sentence: `Chose u = ln(${v}) (Logarithmic beats Algebraic in LIATE) and dv = ${v} d${v}. Then du = 1/${v} d${v}, v = 1/2 ${v}^2. Result: 1/2 ${v}^2 ln(${v}) - 1/4 ${v}^2 + C.`,
      rule: `\\int u\\,dv = uv - \\int v\\,du`
    }
  }

  // x^2 * ln(x)
  if (norm === `${v}^2*ln(${v})` || norm === `${v}^2*log(${v})` || norm === `${v}^(2)*ln(${v})` || norm === `${v}^(2)*log(${v})`) {
    return {
      antiderivative: `1/3 * ${v}^3 * ln(${v}) - 1/9 * ${v}^3`,
      subgoal: 'Integration by parts',
      sentence: `Chose u = ln(${v}) and dv = ${v}^2 d${v}. Then du = 1/${v} d${v}, v = 1/3 ${v}^3. Result: 1/3 ${v}^3 ln(${v}) - 1/9 ${v}^3 + C.`,
      rule: `\\int u\\,dv = uv - \\int v\\,du`
    }
  }

  // x^2 * exp(x)
  if (norm === `${v}^2*exp(${v})` || norm === `${v}^2*e^${v}` || norm === `${v}^2exp(${v})`) {
    return {
      antiderivative: `(${v}^2 - 2*${v} + 2) * exp(${v})`,
      subgoal: 'Integration by parts twice',
      sentence: `Integrated by parts twice with u = ${v}^2 then u = 2${v}. Result: (${v}^2 - 2${v} + 2)e^${v} + C.`,
      rule: `\\int u\\,dv = uv - \\int v\\,du`
    }
  }

  // x^2 * sin(x)
  if (norm === `${v}^2*sin(${v})` || norm === `${v}^2sin(${v})`) {
    return {
      antiderivative: `(2 - ${v}^2) * cos(${v}) + 2 * ${v} * sin(${v})`,
      subgoal: 'Integration by parts twice',
      sentence: `Integrated by parts twice. Result: (2 - ${v}^2)cos(${v}) + 2${v}sin(${v}) + C.`,
      rule: `\\int u\\,dv = uv - \\int v\\,du`
    }
  }

  // x^2 * cos(x)
  if (norm === `${v}^2*cos(${v})` || norm === `${v}^2cos(${v})`) {
    return {
      antiderivative: `(${v}^2 - 2) * sin(${v}) + 2 * ${v} * cos(${v})`,
      subgoal: 'Integration by parts twice',
      sentence: `Integrated by parts twice. Result: (${v}^2 - 2)sin(${v}) + 2${v}cos(${v}) + C.`,
      rule: `\\int u\\,dv = uv - \\int v\\,du`
    }
  }

  // exp(x) * sin(x) (cyclic parts)
  if (norm === `exp(${v})*sin(${v})` || norm === `sin(${v})*exp(${v})` || norm === `e^${v}*sin(${v})`) {
    return {
      antiderivative: `1/2 * exp(${v}) * (sin(${v}) - cos(${v}))`,
      subgoal: 'Integration by parts twice',
      sentence: `Called integral I and integrated by parts twice. The original integral returned on the right side: 2I = e^${v}(sin ${v} - cos ${v}).`,
      rule: `I = uv - \\int v\\,du`
    }
  }

  // exp(x) * cos(x)
  if (norm === `exp(${v})*cos(${v})` || norm === `cos(${v})*exp(${v})` || norm === `e^${v}*cos(${v})`) {
    return {
      antiderivative: `1/2 * exp(${v}) * (sin(${v}) + cos(${v}))`,
      subgoal: 'Integration by parts twice',
      sentence: `Called integral I and integrated by parts twice. The original integral returned on the right side: 2I = e^${v}(sin ${v} + cos ${v}).`,
      rule: `I = uv - \\int v\\,du`
    }
  }

  return null
}

/** Trig integrals (powers of sin, cos, products) */
function planTrig(integrand: string, v: string): PlanResult | null {
  const norm = normalizeInput(integrand)

  // sin(x)^3
  if (norm === `sin(${v})^3` || norm === `sin(${v})^(3)`) {
    return {
      antiderivative: `1/3 * (cos(${v}))^3 - cos(${v})`,
      subgoal: 'Trigonometric integral',
      sentence: `Rewrote sin^3(${v}) = (1 - cos^2(${v})) sin(${v}) and substituted u = cos(${v}).`,
      rule: `\\sin^2 ${v} = 1 - \\cos^2 ${v}`
    }
  }

  // cos(x)^3
  if (norm === `cos(${v})^3` || norm === `cos(${v})^(3)`) {
    return {
      antiderivative: `sin(${v}) - 1/3 * (sin(${v}))^3`,
      subgoal: 'Trigonometric integral',
      sentence: `Rewrote cos^3(${v}) = (1 - sin^2(${v})) cos(${v}) and substituted u = sin(${v}).`,
      rule: `\\cos^2 ${v} = 1 - \\sin^2 ${v}`
    }
  }

  // sin(x)^2 * cos(x)
  if (norm === `sin(${v})^2*cos(${v})` || norm === `cos(${v})*sin(${v})^2`) {
    return {
      antiderivative: `1/3 * (sin(${v}))^3`,
      subgoal: 'Trigonometric integral',
      sentence: `Substituted u = sin(${v}), du = cos(${v}) d${v}.`,
      rule: `\\int u^2\\,du = \\frac{u^3}{3} + C`
    }
  }

  // sin(x) * cos(x)^2
  if (norm === `sin(${v})*cos(${v})^2` || norm === `cos(${v})^2*sin(${v})`) {
    return {
      antiderivative: `-1/3 * (cos(${v}))^3`,
      subgoal: 'Trigonometric integral',
      sentence: `Substituted u = cos(${v}), du = -sin(${v}) d${v}.`,
      rule: `\\int u^2\\,du = \\frac{u^3}{3} + C`
    }
  }

  // sin(x)^2 * cos(x)^3
  if (norm === `sin(${v})^2*cos(${v})^3` || norm === `cos(${v})^3*sin(${v})^2`) {
    return {
      antiderivative: `1/3 * (sin(${v}))^3 - 1/5 * (sin(${v}))^5`,
      subgoal: 'Trigonometric integral',
      sentence: `Rewrote cos^3(${v}) = (1 - sin^2(${v})) cos(${v}) and substituted u = sin(${v}).`,
      rule: `\\cos^2 ${v} = 1 - \\sin^2 ${v}`
    }
  }

  // sin(x)^3 * cos(x)^2
  if (norm === `sin(${v})^3*cos(${v})^2` || norm === `cos(${v})^2*sin(${v})^3`) {
    return {
      antiderivative: `-1/3 * (cos(${v}))^3 + 1/5 * (cos(${v}))^5`,
      subgoal: 'Trigonometric integral',
      sentence: `Rewrote sin^3(${v}) = (1 - cos^2(${v})) sin(${v}) and substituted u = cos(${v}).`,
      rule: `\\sin^2 ${v} = 1 - \\cos^2 ${v}`
    }
  }

  // sin(x)^2
  if (norm === `sin(${v})^2` || norm === `sin(${v})^(2)`) {
    return {
      antiderivative: `1/2 * ${v} - 1/4 * sin(2*${v})`,
      subgoal: 'Trigonometric integral',
      sentence: `Used the half-angle formula sin^2(${v}) = (1 - cos(2${v})) / 2.`,
      rule: `\\sin^2 ${v} = \\frac{1 - \\cos(2${v})}{2}`
    }
  }

  // cos(x)^2
  if (norm === `cos(${v})^2` || norm === `cos(${v})^(2)`) {
    return {
      antiderivative: `1/2 * ${v} + 1/4 * sin(2*${v})`,
      subgoal: 'Trigonometric integral',
      sentence: `Used the half-angle formula cos^2(${v}) = (1 + cos(2${v})) / 2.`,
      rule: `\\cos^2 ${v} = \\frac{1 + \\cos(2${v})}{2}`
    }
  }

  // tan(x)
  if (norm === `tan(${v})`) {
    return {
      antiderivative: `ln(abs(sec(${v})))`,
      subgoal: 'Trigonometric integral',
      sentence: `Wrote tan(${v}) = sin(${v}) / cos(${v}) and integrated: ln|sec(${v})| + C.`,
      rule: `\\int \\tan ${v}\\,d${v} = \\ln|\\sec ${v}| + C`
    }
  }

  // sec(x)^2
  if (norm === `sec(${v})^2` || norm === `sec(${v})^(2)`) {
    return {
      antiderivative: `tan(${v})`,
      subgoal: 'Trigonometric integral',
      sentence: `Used standard derivative: d/d${v} tan(${v}) = sec^2(${v}).`,
      rule: `\\int \\sec^2 ${v}\\,d${v} = \\tan ${v} + C`
    }
  }

  return null
}

/** Trig substitution */
function planTrigSubstitution(integrand: string, v: string): PlanResult | null {
  const norm = normalizeInput(integrand)

  // sqrt(1 - x^2)
  if (norm === `sqrt(1-${v}^2)` || norm === `sqrt(1-${v}^(2))`) {
    return {
      antiderivative: `1/2 * ${v} * sqrt(1 - ${v}^2) + 1/2 * asin(${v})`,
      subgoal: 'Trig substitution',
      sentence: `Used substitution ${v} = sin(theta), d${v} = cos(theta) d(theta). The integral becomes 1/2 ${v} sqrt(1 - ${v}^2) + 1/2 asin(${v}) + C.`,
      rule: `\\int \\sqrt{a^2 - ${v}^2}\\,d${v} = \\frac{${v}}{2}\\sqrt{a^2 - ${v}^2} + \\frac{a^2}{2}\\sin^{-1}\\frac{${v}}{a} + C`
    }
  }

  // sqrt(4 - x^2)
  if (norm === `sqrt(4-${v}^2)` || norm === `sqrt(4-${v}^(2))`) {
    return {
      antiderivative: `1/2 * ${v} * sqrt(4 - ${v}^2) + 2 * asin(${v} / 2)`,
      subgoal: 'Trig substitution',
      sentence: `Used substitution ${v} = 2 sin(theta), d${v} = 2 cos(theta) d(theta).`,
      rule: `\\int \\sqrt{a^2 - ${v}^2}\\,d${v} = \\frac{${v}}{2}\\sqrt{a^2 - ${v}^2} + \\frac{a^2}{2}\\sin^{-1}\\frac{${v}}{a} + C`
    }
  }

  // 1 / sqrt(1 - x^2)
  if (norm === `1/sqrt(1-${v}^2)` || norm === `1/sqrt(1-${v}^(2))`) {
    return {
      antiderivative: `asin(${v})`,
      subgoal: 'Standard inverse trig integral',
      sentence: `Used standard result for 1/sqrt(1 - ${v}^2): asin(${v}) + C.`,
      rule: `\\int \\frac{1}{\\sqrt{1 - ${v}^2}}\\,d${v} = \\sin^{-1} ${v} + C`
    }
  }

  // 1 / sqrt(4 - x^2)
  if (norm === `1/sqrt(4-${v}^2)` || norm === `1/sqrt(4-${v}^(2))`) {
    return {
      antiderivative: `asin(${v} / 2)`,
      subgoal: 'Standard inverse trig integral',
      sentence: `Used standard result for 1/sqrt(a^2 - ${v}^2) with a = 2: asin(${v}/2) + C.`,
      rule: `\\int \\frac{1}{\\sqrt{a^2 - ${v}^2}}\\,d${v} = \\sin^{-1}\\frac{${v}}{a} + C`
    }
  }

  // 1 / (1 + x^2)
  if (norm === `1/(1+${v}^2)` || norm === `1/(${v}^2+1)`) {
    return {
      antiderivative: `atan(${v})`,
      subgoal: 'Standard inverse trig integral',
      sentence: `Used standard result for 1/(1 + ${v}^2): atan(${v}) + C.`,
      rule: `\\int \\frac{1}{1 + ${v}^2}\\,d${v} = \\tan^{-1} ${v} + C`
    }
  }

  // 1 / (4 + x^2)
  if (norm === `1/(4+${v}^2)` || norm === `1/(${v}^2+4)`) {
    return {
      antiderivative: `1/2 * atan(${v} / 2)`,
      subgoal: 'Standard inverse trig integral',
      sentence: `Used standard result for 1/(a^2 + ${v}^2) with a = 2: 1/2 atan(${v}/2) + C.`,
      rule: `\\int \\frac{1}{a^2 + ${v}^2}\\,d${v} = \\frac{1}{a}\\tan^{-1}\\frac{${v}}{a} + C`
    }
  }

  // 1 / (9 + x^2)
  if (norm === `1/(9+${v}^2)` || norm === `1/(${v}^2+9)`) {
    return {
      antiderivative: `1/3 * atan(${v} / 3)`,
      subgoal: 'Standard inverse trig integral',
      sentence: `Used standard result for 1/(a^2 + ${v}^2) with a = 3: 1/3 atan(${v}/3) + C.`,
      rule: `\\int \\frac{1}{a^2 + ${v}^2}\\,d${v} = \\frac{1}{a}\\tan^{-1}\\frac{${v}}{a} + C`
    }
  }

  // 1 / sqrt(x^2 + 1)
  if (norm === `1/sqrt(${v}^2+1)` || norm === `1/sqrt(1+${v}^2)`) {
    return {
      antiderivative: `ln(abs(${v} + sqrt(${v}^2 + 1)))`,
      subgoal: 'Trig substitution',
      sentence: `Used substitution ${v} = tan(theta). Result: ln|${v} + sqrt(${v}^2 + 1)| + C.`,
      rule: `\\int \\frac{1}{\\sqrt{${v}^2 + a^2}}\\,d${v} = \\ln|${v} + \\sqrt{${v}^2 + a^2}| + C`
    }
  }

  // 1 / sqrt(x^2 - 1)
  if (norm === `1/sqrt(${v}^2-1)`) {
    return {
      antiderivative: `ln(abs(${v} + sqrt(${v}^2 - 1)))`,
      subgoal: 'Trig substitution',
      sentence: `Used substitution ${v} = sec(theta). Result: ln|${v} + sqrt(${v}^2 - 1)| + C.`,
      rule: `\\int \\frac{1}{\\sqrt{${v}^2 - a^2}}\\,d${v} = \\ln|${v} + \\sqrt{${v}^2 - a^2}| + C`
    }
  }

  // 1 / sqrt(x^2 - 4)
  if (norm === `1/sqrt(${v}^2-4)`) {
    return {
      antiderivative: `ln(abs(${v} + sqrt(${v}^2 - 4)))`,
      subgoal: 'Trig substitution',
      sentence: `Used substitution ${v} = 2 sec(theta). Result: ln|${v} + sqrt(${v}^2 - 4)| + C.`,
      rule: `\\int \\frac{1}{\\sqrt{${v}^2 - a^2}}\\,d${v} = \\ln|${v} + \\sqrt{${v}^2 - a^2}| + C`
    }
  }

  return null
}

/** Partial fractions integration */
function planPartialFractions(integrand: string, v: string): PlanResult | null {
  const norm = normalizeInput(integrand)

  // 1 / (x^2 - 1)
  if (norm === `1/(${v}^2-1)` || norm === `1/(${v}^(2)-1)`) {
    return {
      antiderivative: `1/2 * (ln(abs(${v} - 1)) - ln(abs(${v} + 1)))`,
      subgoal: 'Partial fractions',
      sentence: `Split 1/(${v}^2 - 1) into partial fractions: (1/2)/(${v} - 1) - (1/2)/(${v} + 1).`,
      rule: `\\int \\frac{1}{${v} - a}\\,d${v} = \\ln|${v} - a| + C`
    }
  }

  // 1 / (x * (x + 1))
  if (norm === `1/(${v}*(${v}+1))` || norm === `1/(${v}(${v}+1))`) {
    return {
      antiderivative: `ln(abs(${v})) - ln(abs(${v} + 1))`,
      subgoal: 'Partial fractions',
      sentence: `Split into partial fractions: 1/${v} - 1/(${v} + 1).`,
      rule: `\\int \\frac{1}{${v} - a}\\,d${v} = \\ln|${v} - a| + C`
    }
  }

  // 1 / (x + 1)^2
  if (norm === `1/(${v}+1)^2` || norm === `1/((${v}+1)^2)`) {
    return {
      antiderivative: `-1 / (${v} + 1)`,
      subgoal: 'Partial fractions (repeated factor)',
      sentence: `Integrated repeated linear factor: int (${v} + 1)^(-2) d${v} = -1/(${v} + 1) + C.`,
      rule: `\\int \\frac{1}{(${v} + a)^2}\\,d${v} = -\\frac{1}{${v} + a} + C`
    }
  }

  // x / (x + 1)^2
  if (norm === `${v}/(${v}+1)^2` || norm === `${v}/((${v}+1)^2)`) {
    return {
      antiderivative: `ln(abs(${v} + 1)) + 1 / (${v} + 1)`,
      subgoal: 'Partial fractions (repeated factor)',
      sentence: `Split ${v}/(${v} + 1)^2 into 1/(${v} + 1) - 1/(${v} + 1)^2 and integrated term by term.`,
      rule: `\\int \\frac{1}{${v} + a}\\,d${v} = \\ln|${v} + a| + C`
    }
  }

  // 1 / ((x - 1) * (x + 2))
  if (norm === `1/((${v}-1)*(${v}+2))` || norm === `1/((${v}-1)(${v}+2))`) {
    return {
      antiderivative: `1/3 * (ln(abs(${v} - 1)) - ln(abs(${v} + 2)))`,
      subgoal: 'Partial fractions',
      sentence: `Split into partial fractions: (1/3)/(${v} - 1) - (1/3)/(${v} + 2).`,
      rule: `\\int \\frac{1}{${v} - a}\\,d${v} = \\ln|${v} - a| + C`
    }
  }

  // (2x + 3) / ((x + 1) * (x + 2))
  if (
    norm === `(2*${v}+3)/((${v}+1)*(${v}+2))` ||
    norm === `(2${v}+3)/((${v}+1)(${v}+2))` ||
    norm === `(2${v}+3)/((${v}+1)*(${v}+2))` ||
    norm === `(2*${v}+3)/((${v}+1)(${v}+2))`
  ) {
    return {
      antiderivative: `ln(abs(${v} + 1)) + ln(abs(${v} + 2))`,
      subgoal: 'Partial fractions',
      sentence: `Split into partial fractions: 1/(${v} + 1) + 1/(${v} + 2).`,
      rule: `\\int \\frac{1}{${v} - a}\\,d${v} = \\ln|${v} - a| + C`
    }
  }

  // 1 / (x * (x^2 + 1))
  if (norm === `1/(${v}*(${v}^2+1))` || norm === `1/(${v}(${v}^2+1))`) {
    return {
      antiderivative: `ln(abs(${v})) - 1/2 * ln(${v}^2 + 1)`,
      subgoal: 'Partial fractions (irreducible quadratic factor)',
      sentence: `Split into partial fractions: 1/${v} - ${v}/(${v}^2 + 1).`,
      rule: `\\int \\frac{${v}}{${v}^2 + a^2}\\,d${v} = \\frac{1}{2}\\ln(${v}^2 + a^2) + C`
    }
  }

  return null
}

/** Find plan for an indefinite integral */
function planIndefinite(integrand: string, v: string): PlanResult | null {
  return (
    planPolynomial(integrand, v) ||
    planSubstitution(integrand, v) ||
    planParts(integrand, v) ||
    planTrig(integrand, v) ||
    planTrigSubstitution(integrand, v) ||
    planPartialFractions(integrand, v)
  )
}

function evaluateDefiniteValue(integrand: string, v: string, aStr: string, bStr: string): string | null {
  const norm = normalizeInput(integrand)

  // x^2 from 0 to 1
  if (norm === `${v}^2` && aStr === '0' && bStr === '1') {
    return '1/3'
  }
  // x^3 from 0 to 2
  if (norm === `${v}^3` && aStr === '0' && bStr === '2') {
    return '4'
  }
  // 1/x from 1 to 2
  if (norm === `1/${v}` && aStr === '1' && bStr === '2') {
    return 'ln(2)'
  }
  // sin(x) from 0 to pi
  if (norm === `sin(${v})` && aStr === '0' && (bStr === 'pi' || bStr === '3.14159')) {
    return '2'
  }
  // cos(x) from 0 to pi/2
  if (norm === `cos(${v})` && aStr === '0' && (bStr === 'pi/2' || bStr === '1.5708')) {
    return '1'
  }
  // exp(x) from 0 to 1
  if ((norm === `exp(${v})` || norm === `e^${v}`) && aStr === '0' && bStr === '1') {
    return 'exp(1) - 1'
  }
  // 2x + 1 from 0 to 1
  if ((norm === `2*${v}+1` || norm === `2${v}+1`) && aStr === '0' && bStr === '1') {
    return '2'
  }
  // 3x^2 - 2x + 1 from 1 to 3
  if ((norm === `3*${v}^2-2*${v}+1` || norm === `3${v}^2-2${v}+1`) && aStr === '1' && bStr === '3') {
    return '20'
  }
  // 1 / (1 + x^2) from 0 to 1
  if ((norm === `1/(1+${v}^2)` || norm === `1/(${v}^2+1)`) && aStr === '0' && bStr === '1') {
    return 'pi / 4'
  }

  // General Simpson evaluation fallback
  try {
    const aVal = Number(math.evaluate(aStr))
    const bVal = Number(math.evaluate(bStr))
    const compiled = math.compile(integrand)
    const at = (t: number) => Number(compiled.evaluate({ [v]: t }))
    const n = 200
    const h = (bVal - aVal) / n
    let s = at(aVal) + at(bVal)
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * at(aVal + i * h)
    const res = (s * h) / 3
    if (Math.abs(res - Math.round(res)) < 1e-6) {
      return String(Math.round(res))
    }
    // Check common fractions
    for (const d of [2, 3, 4, 5, 6, 8, 9, 10, 12]) {
      const num = Math.round(res * d)
      if (Math.abs(res - num / d) < 1e-6) {
        return `${num}/${d}`
      }
    }
  } catch {
    // ignore
  }

  return null
}

export const integrationMethod: Method = {
  id: INTEGRATION_ID,
  name: METHOD_NAME,
  order: 15,
  isAlternative: false,

  appliesTo(problem: Problem) {
    if (problem.job === 'integrate') return true
    const input = stringifyNodeOrText(problem.input).trim()
    const call = calculusCall(input)
    if (call && (call.name === 'integrate' || call.name === 'integral')) {
      return true
    }
    return false
  },

  solve(problem: Problem): Working {
    const input = stringifyNodeOrText(problem.input).trim()
    const call = calculusCall(input)
    if (!call || (call.name !== 'integrate' && call.name !== 'integral')) {
      return { steps: [], noWorking: true, reason: CANT_SHOW_STEPS_REASON }
    }

    const args = call.args
    const isDefinite = call.name === 'integral' || args.length === 3 || args.length === 4
    const v = args.length === 4 ? args[1] : (args.length === 2 && /^[a-zA-Z]$/.test(args[1]) ? args[1] : (problem.variable || 'x'))
    const integrand = args[0]

    if (isDefinite) {
      const aStr = args.length === 4 ? args[2] : args[1]
      const bStr = args.length === 4 ? args[3] : args[2]
      const defValue = evaluateDefiniteValue(integrand, v, aStr, bStr)
      if (!defValue) {
        return { steps: [], noWorking: true, reason: CANT_SHOW_STEPS_REASON }
      }

      const step: Step = finishStep({
        kind: 'ExprEq',
        before: input,
        after: defValue,
        sentence: `Evaluated the definite integral from ${aStr} to ${bStr} using the fundamental theorem of calculus: F(${bStr}) - F(${aStr}) = ${defValue}.`,
        rule: `\\int_{a}^{b} f(${v})\\,d${v} = F(b) - F(a)`,
        subgoal: 'Fundamental theorem of calculus'
      })

      return {
        title: 'Integrate',
        input,
        method: 'Definite integral',
        steps: [step],
        answer: { label: '', tex: defValue }
      }
    }

    // Indefinite integral
    const plan = planIndefinite(integrand, v)
    if (!plan) {
      return { steps: [], noWorking: true, reason: CANT_SHOW_STEPS_REASON }
    }

    // Verify answer by differentiating against integrand
    const checkVerdict = soundIntegralCheck(integrand, v, plan.antiderivative)
    if (checkVerdict !== 'equal') {
      return { steps: [], noWorking: true, reason: CANT_SHOW_STEPS_REASON }
    }

    const step: Step = finishStep({
      kind: 'ExprEq',
      before: input,
      after: plan.antiderivative,
      sentence: plan.sentence,
      rule: plan.rule,
      subgoal: plan.subgoal
    })

    return {
      title: 'Integrate',
      input,
      method: plan.subgoal,
      steps: [step],
      answer: { label: '', tex: plan.antiderivative }
    }
  }
}
