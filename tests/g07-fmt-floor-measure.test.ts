// T7 proof for audit bug 7 [C2]: "Silent truncation of electron-scale measurements to 0".
//
// Verdict REAL, on the route the wave head asked for. The floor itself (math/format.ts:313, 418,
// 465) is deliberate and pinned by tests/format.test.ts:738 ("so a dragged point shows no power"),
// so the defect is a caller that sends a KNOWN value through the floored writer rather than the
// scientific one. Measured on today's code:
//   rowText({ value: 1.6e-19, kind: 'length', unit: 'N' }, settings) === '0 N'
//   rowText({ value: 1.6e-19, kind: 'length' },              settings) === '0 u'
// The Measure panel is where a vector's own unit is read (panels/Measurements.tsx:338-340), so a
// force vector of 1.6×10⁻¹⁹ N shows the student "0 N". panels/LabData.tsx:174,324 (computed cells,
// fitted coefficients) and core/visualize.ts:272,381 (area and probability labels) use the same
// floored writer for computed values.
import { beforeEach, describe, expect, it } from 'vitest'
import { useScene } from '../src/renderer/src/core/store'
import { rowText } from '../src/renderer/src/panels/Measurements'
import type { SceneSettings } from '../src/renderer/src/core/types'

const settings = (): SceneSettings => useScene.getState().settings

beforeEach(() => useScene.getState().newScene())

describe('G7: a measured value below 10⁻¹² reads "0" in the Measure panel', () => {
  it('an electron-scale force keeps its power instead of reading "0 N"', () => {
    expect(rowText({ label: 'F', value: 1.6e-19, kind: 'length', unit: 'N' }, settings())).not.toBe('0 N')
  })

  it('the same value read in the drawing unit is not "0 u" either', () => {
    expect(rowText({ label: 'F', value: 1.6e-19, kind: 'length' }, settings())).not.toBe('0 u')
  })

  it('ordinary values are unchanged', () => {
    expect(rowText({ label: 'F', value: 5, kind: 'length', unit: 'N' }, settings())).toBe('5 N')
    expect(rowText({ label: 'x', value: 12.5, kind: 'length' }, settings())).toBe('12.5 u')
  })
})
