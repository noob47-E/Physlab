// T7 proof for audit bug 20 [C6]: "Hardcoded hex colours in construction tool objects
// (render/tools.ts:182)".
//
// Verdict REAL (the cited line is a type field; the colours are at 384, 418, 434 and 443). The
// Segment, Angle bisector, Perpendicular bisector and Parallel/Perpendicular tools pass literal
// hex colours to the Builder, so the object's colour never follows the theme — and
// tests/colours.test.ts scans only .tsx, so a hex in a .ts slips past the guard. Measured today:
//   #74c0fc (distance), #ffa94d (angle bisector and perpendicular bisector), #e599f7, #66d9e8.
import { describe, expect, it } from 'vitest'
import { readSource } from './helpers/repo'

const SRC = readSource('src/renderer/src/render/tools.ts')

describe('G20: construction tools use hardcoded colours', () => {
  it('no literal hex colour is passed to the Builder', () => {
    expect([...SRC.matchAll(/['"]#[0-9a-fA-F]{3,8}['"]/g)].map((m) => m[0])).toEqual([])
  })
})
