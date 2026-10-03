import { describe, expect, it } from 'vitest'
import { keepBefore, nextTimelineMax, sliderLabel, sliderPlayClick } from '../src/renderer/src/panels/shellLogic'

describe('H10 graph history on rewind', () => {
  it('keeps the samples before the scrubbed time', () => {
    const d = [[0, 1, 2, 3, 4, 5, 6, 7, 8], [0, 1, 2, 3, 4, 5, 6, 7, 8]]
    const r = keepBefore(d, 4)
    expect(r[0]).toEqual([0, 1, 2, 3])
    expect(r[1]).toEqual([0, 1, 2, 3])
  })
})
describe('H11 slider play button', () => {
  it('resumes a paused sweep instead of turning it off', () => {
    expect(sliderPlayClick(true, false)).toEqual({ animate: true, playing: true })
  })
  it('starts and stops as before', () => {
    expect(sliderPlayClick(false, false)).toEqual({ animate: true, playing: true })
    expect(sliderPlayClick(true, true).animate).toBe(false)
  })
})
describe('H12 timeline scale', () => {
  it('stays 20 s when scrubbed back across 10 s, returns to 10 at t = 0', () => {
    const max = nextTimelineMax(10, 15)
    expect(max).toBe(20)
    expect(nextTimelineMax(max, 9)).toBe(20)
    expect(nextTimelineMax(max, 0)).toBe(10)
  })
})
describe('H13 slider label precision', () => {
  it('shows the step 0.001 at 4 d.p., and follows s.f.', () => {
    expect(sliderLabel(0.123, 0.001, { decimals: 4, precisionMode: 'dp' })).toBe('0.123')
    expect(sliderLabel(0.123456, 0.001, { decimals: 2, precisionMode: 'dp' })).toBe('0.123')
    expect(sliderLabel(0.123456, 0.001, { decimals: 3, precisionMode: 'sf' })).toBe('0.123')
  })
  it('raises a power of ten instead of showing a caret', () => {
    expect(sliderLabel(1e12, 1, { decimals: 3, precisionMode: 'sf' })).toBe('1.00 × 10¹²')
    expect(sliderLabel(-2.5e-8, 1, { decimals: 2, precisionMode: 'sf' })).toBe('−2.5 × 10⁻⁸')
  })
  it('never reads 0 for a value a few tiny steps from zero', () => {
    // String(1e-7) is "1e-7", so sliderLabel counts no step places; the label still reads 3 × 10⁻⁷
    // because fmt writes a tiny value as a power of ten. Guards that against a later change.
    expect(sliderLabel(3e-7, 1e-7, { decimals: 2, precisionMode: 'dp' })).not.toBe('0')
    expect(sliderLabel(3e-7, 1e-7, { decimals: 2, precisionMode: 'dp' })).toMatch(/3/)
    expect(sliderLabel(5e-7, 2.5e-7, { decimals: 2, precisionMode: 'dp' })).toMatch(/5/)
  })
})
