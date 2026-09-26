// The two mutable globals the maths keeps: the notation (math/format.ts) and the angle mode
// (math/expr.ts). A test that sets either and does not put it back changes what every later test
// in the same file sees, and a file that only works because an earlier test happened to leave
// degrees behind is a test that breaks when it is reordered. Call this from a beforeEach.

import { setAngleMode } from '../../src/renderer/src/math/expr'
import { setNotation } from '../../src/renderer/src/math/format'

/** Degrees, arrow vectors, i j k components, standard direction: what the app starts with. */
export function resetGlobals(): void {
  setAngleMode('deg')
  setNotation({ vector: 'arrow', components: 'ijk', direction: 'standard' })
}
