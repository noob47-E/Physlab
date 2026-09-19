// One way in to every Pure Math tool.
//
// The panel renders its buttons straight from JOBS, so adding a tool means adding an entry here
// and nothing else. Everything below is pure: given the same text it always produces the same
// working, which is what makes it all testable without a browser.

import { splitArgs } from '../expr'
import { NotPolynomial, exprTex, isConstant, parseExpr, varsOf } from './mono'
import { factoriseNumberWorking, hcfWorking, lcmWorking } from './integers'
import { hcfAlgebraWorking, lcmAlgebraWorking } from './algebraHcf'
import { factoriseWorking } from './factor'
import { divideWorking } from './divide'
import { partialFractionsWorking } from './partial'
import { complexWorking, factoriseComplexWorking, solveQuadraticWorking } from './complex'
import { failed, type Working } from './work'

export type JobId =
  | 'factor'
  | 'expand'
  | 'divide'
  | 'partial'
  | 'hcf'
  | 'lcm'
  | 'primes'
  | 'complex'
  | 'solve'
  | 'factorComplex'

export interface JobDef {
  id: JobId
  label: string
  /** One line under the button, in plain words. */
  about: string
  /** Shown in the input box before anything is typed. */
  placeholder: string
  /** A worked example the student can load with one tap. */
  example: string
  /** True when this job takes a list: "12, 18". */
  list?: boolean
}

export const JOBS: JobDef[] = [
  {
    id: 'factor',
    label: 'Factorise',
    about: 'Break an expression into brackets, or a number into primes.',
    placeholder: '6x^2 + 7x - 3',
    example: '6x^2 + 7x - 3'
  },
  {
    id: 'expand',
    label: 'Expand',
    about: 'Multiply the brackets out and collect like terms.',
    placeholder: '(2x + 3)(3x - 1)',
    example: '(2x + 3)(3x - 1)'
  },
  {
    id: 'divide',
    label: 'Divide',
    about: 'Long division of one expression by another.',
    placeholder: '(x^3 - 6x^2 + 11x - 6)/(x - 1)',
    example: '(x^3 - 6x^2 + 11x - 6)/(x - 1)'
  },
  {
    id: 'partial',
    label: 'Partial fractions',
    about: 'Split one fraction into the A/(x−1) + B/(x+2) pieces.',
    placeholder: '(3x + 5)/((x + 1)(x + 2))',
    example: '(3x + 5)/((x + 1)(x + 2))'
  },
  {
    id: 'hcf',
    label: 'HCF',
    about: 'Highest common factor of numbers or expressions.',
    placeholder: '12, 18',
    example: '12, 18, 30',
    list: true
  },
  {
    id: 'lcm',
    label: 'LCM',
    about: 'Lowest common multiple of numbers or expressions.',
    placeholder: '12, 18',
    example: '12, 18, 30',
    list: true
  },
  {
    id: 'primes',
    label: 'Prime factors',
    about: 'Split a whole number into its primes, with the division ladder.',
    placeholder: '360',
    example: '360'
  },
  {
    id: 'complex',
    label: 'Complex',
    about: 'Add, multiply or divide complex numbers, using i² = −1.',
    placeholder: '(2 + 3i)/(1 - i)',
    example: '(2 + 3i)/(1 - i)'
  },
  {
    id: 'solve',
    label: 'Solve',
    about: 'Solve a quadratic, real roots or complex ones.',
    placeholder: 'x^2 + 4x + 13 = 0',
    example: 'x^2 + 4x + 13 = 0'
  },
  {
    id: 'factorComplex',
    label: 'Factorise with i',
    about: 'Factorise all the way down by allowing complex numbers.',
    placeholder: 'x^2 + 4',
    example: 'x^4 - 16'
  }
]

export const jobById = (id: JobId): JobDef => JOBS.find((j) => j.id === id) ?? JOBS[0]

const WHOLE = /^-?\d+$/

/** Split "12, 18" into parts, respecting brackets so (x+1)(x+2) stays whole. */
const asList = (src: string): string[] =>
  splitArgs(src)
    .map((p) => p.trim())
    .filter(Boolean)

function expandWorking(src: string): Working {
  const title = 'Expand'
  try {
    const e = parseExpr(src)
    const out = exprTex(e)
    return {
      title,
      input: src.trim(),
      moves: [
        {
          head: 'Multiply every term in the first bracket by every term in the second.',
          rule: '\\text{each} \\times \\text{each}',
          tex: out
        },
        {
          head: 'Then collect the like terms together, highest power first.',
          tex: `= ${out}`
        }
      ],
      answers: [{ label: 'Answer', tex: out }],
      check: 'Factorise this result to get back to where you started.'
    }
  } catch (err) {
    return failed(title, src, err instanceof NotPolynomial ? err.message : 'I could not read that.')
  }
}

export function runPure(job: JobId, input: string): Working {
  const src = input.trim()
  if (!src) return failed(jobById(job).label, '', 'Type something to work on first.')

  switch (job) {
    case 'primes':
      return WHOLE.test(src)
        ? factoriseNumberWorking(BigInt(src))
        : failed('Prime factors', src, 'Prime factors need a whole number, like 360.')

    case 'factor': {
      // A bare number means primes; anything with a letter means brackets.
      if (WHOLE.test(src)) return factoriseNumberWorking(BigInt(src))
      try {
        const e = parseExpr(src)
        if (isConstant(e)) {
          const v = e[0]?.c
          if (v && v.d === 1n) return factoriseNumberWorking(v.n)
        }
        if (varsOf(e).includes('i')) return factoriseComplexWorking(src)
      } catch {
        // Fall through: factoriseWorking reports the reason properly.
      }
      return factoriseWorking(src)
    }

    case 'expand':
      return expandWorking(src)

    case 'divide':
      return divideWorking(src)

    case 'partial':
      return partialFractionsWorking(src)

    case 'hcf': {
      const parts = asList(src)
      if (parts.length >= 2 && parts.every((p) => WHOLE.test(p))) return hcfWorking(parts.map((p) => BigInt(p)))
      return hcfAlgebraWorking(parts)
    }

    case 'lcm': {
      const parts = asList(src)
      if (parts.length >= 2 && parts.every((p) => WHOLE.test(p))) return lcmWorking(parts.map((p) => BigInt(p)))
      return lcmAlgebraWorking(parts)
    }

    case 'complex':
      return complexWorking(src)

    case 'solve':
      return solveQuadraticWorking(src)

    case 'factorComplex':
      return factoriseComplexWorking(src)

    default:
      return failed('Pure Math', src, 'I do not know that job.')
  }
}

/**
 * The job that best fits what has been typed, so one button can do the obvious thing.
 * Deliberately simple and predictable — a student should be able to guess what it will pick.
 */
export function suggestJob(src: string): JobId {
  const s = src.trim()
  if (!s) return 'factor'
  if (WHOLE.test(s)) return 'primes'
  if (s.includes(',')) return 'hcf'
  if (/(^|[^a-zA-Z])i([^a-zA-Z]|$)/.test(s)) return 'complex'
  if (s.includes('=')) return 'solve'
  // A fraction whose bottom is a product or has a square in it is a partial-fractions question;
  // anything else over a single bracket is ordinary division.
  if (s.includes('/')) {
    const bottom = s.slice(s.indexOf('/') + 1)
    return /\)\s*\(/.test(bottom) || /\^\s*2/.test(bottom) ? 'partial' : 'divide'
  }
  return 'factor'
}
