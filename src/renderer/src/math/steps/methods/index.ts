// The first methods of the step engine (S1a): linear equations in one variable, and quadratics three
// ways. Each is an ordinary Method, so a router tries them by order and attaches "Another way".

import type { Method } from '../types'
import { linearOneVarMethod } from './linearOneVar'
import { quadraticFactoriseMethod } from './quadraticFactorise'
import { quadraticFormulaMethod } from './quadraticFormula'
import { quadraticSquareMethod } from './quadraticSquare'
import { linearSystemEliminationMethod, linearSystemSubstitutionMethod } from './linearSystem'
import { expandMethod } from './expand'
import { factoriseMethod } from './factorise'
import { expLogMethod } from './expLog'
import { cubicQuarticMethod } from './cubicQuartic'
import { radicalMethod } from './radical'
import { rationalEquationMethod } from './rational'
import { trigEquationsMethod } from './trigEquations'

export {
  linearOneVarMethod,
  quadraticFactoriseMethod,
  quadraticFormulaMethod,
  quadraticSquareMethod,
  linearSystemEliminationMethod,
  linearSystemSubstitutionMethod,
  expandMethod,
  factoriseMethod,
  cubicQuarticMethod,
  radicalMethod,
  rationalEquationMethod,
  trigEquationsMethod,
  expLogMethod
}

/** Every S1a method, in the order a router should consider them. */
export const S1A_METHODS: Method[] = [
  linearOneVarMethod,
  quadraticFactoriseMethod,
  quadraticFormulaMethod,
  quadraticSquareMethod
]

/** All checked step methods built in the step engine. */
export const ALL_STEP_METHODS: Method[] = [
  linearOneVarMethod,
  quadraticFactoriseMethod,
  quadraticFormulaMethod,
  quadraticSquareMethod,
  cubicQuarticMethod,
  trigEquationsMethod,
  linearSystemEliminationMethod,
  linearSystemSubstitutionMethod,
  expandMethod,
  factoriseMethod,
  rationalEquationMethod,
  radicalMethod,
  expLogMethod
]
