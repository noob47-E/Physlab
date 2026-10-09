import { describe, expect, it } from 'vitest'
import { evaluateVectorLine } from '../src/renderer/src/panels/vectorCalcStore'
import fs from 'fs'
import path from 'path'

describe('F9: Vector card maths field dropped typed spaces', () => {
  it('evaluateVectorLine fails on "10Nm\\angle30^{\\circ}" with missing vector Nm error', () => {
    expect(() => evaluateVectorLine('10Nm\\angle30^{\\circ}', {})).toThrow(/Nm/)
  })

  it('evaluateVectorLine succeeds on "10\\;N\\;m\\angle30^{\\circ}" with magnitude 10 and angle 30°', () => {
    const res = evaluateVectorLine('10\\;N\\;m\\angle30^{\\circ}', {})
    expect(res.out).toEqual([expect.closeTo(8.66, 1), expect.closeTo(5, 1), 0])
  })

  it('MathInput.tsx configures mathModeSpace so MathLive inserts space on spacebar', () => {
    const target = process.env.TEST_PATCHED_MATHINPUT
      ? path.resolve(__dirname, '../patch2/MathInput.tsx')
      : path.resolve(__dirname, '../src/renderer/src/ui/MathInput.tsx')
    const code = fs.readFileSync(target, 'utf8')
    expect(code).toContain('mathModeSpace')
  })
})
