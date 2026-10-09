import { describe, expect, it } from 'vitest'
import { convertListed } from '../src/renderer/src/calc/units'
import { superscriptPowers } from '../src/renderer/src/math/format'
import fs from 'fs'
import path from 'path'

describe('F5: Units screen superscript format', () => {
  it('superscriptPowers formats lightyear output with superscripts instead of ^', () => {
    // 1 lightyear to m is ~9.46×10^15 m
    const raw = convertListed(1, 'lightyear', 'm').text
    expect(raw).toContain('^')
    const formatted = superscriptPowers(raw)
    expect(formatted).not.toContain('^')
    expect(formatted).toContain('¹⁵')
    expect(formatted).toMatch(/9\.46073047\d*\u00a0×\u00a010¹⁵ m/)
  })

  it('Units screen in calcModes.tsx wraps output in superscriptPowers', () => {
    const target = process.env.TEST_PATCHED_CALCMODES
      ? path.resolve(__dirname, '../patch2/calcModes.tsx')
      : path.resolve(__dirname, '../src/renderer/src/panels/calcModes.tsx')
    const code = fs.readFileSync(target, 'utf8')
    expect(code).toContain('superscriptPowers(result.text)')
  })
})
