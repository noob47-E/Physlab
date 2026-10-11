// The first methods of the step engine (S1a): linear equations in one variable, and quadratics three
// ways. Each is an ordinary Method, so a router tries them by order and attaches "Another way".

import type { Method } from '../types'
import { linearOneVarMethod } from './linearOneVar'
import { quadraticFactoriseMethod } from './quadraticFactorise'
import { quadraticFormulaMethod } from './quadraticFormula'
import { quadraticSquareMethod } from './quadraticSquare'

/** Every S1a method, in the order a router should consider them. */
export const S1A_METHODS: Method[] = [
  linearOneVarMethod,
  quadraticFactoriseMethod,
  quadraticFormulaMethod,
  quadraticSquareMethod
]
