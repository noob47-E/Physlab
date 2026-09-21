// One decision, made in one place: does the algebra engine read sin, cos and tan in degrees?
//
// The command bar used to send SymPy the degree flag only when the expression had no x, y or t
// in it, so in DEG mode diff(sin(x)) went out in radians while the calculator's own ddx(sin(x), 30)
// worked in degrees (calc/engine.ts, lambdaOf). The same expression meant two things on one
// screen. The calculator follows the angle mode the way the fx-991EX does, so the algebra engine
// now follows it too, letters or not.

import type { AngleUnit } from '../math/format'

/** True when the CAS should treat every trigonometric argument as degrees. */
export function casInDegrees(angleUnit: AngleUnit): boolean {
  return angleUnit === 'deg'
}
