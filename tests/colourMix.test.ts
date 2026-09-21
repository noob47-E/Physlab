// Colour mixing in Oklch: the resultant arrow's colour sits between its parents' the way the eye
// sees it, as strong as either of them, and the maths round-trips through Ottosson's published values.

import { describe, expect, it } from 'vitest'
import { formatColour, mixOklab, mixOklabMany, oklabToSrgb, parseColour, srgbToOklab, type Lab, type RGB } from '../src/renderer/src/render/colourMix'
import { readSource } from './helpers/repo'

const near = (got: number[], want: number[], tol: number) => got.forEach((g, i) => expect(Math.abs(g - want[i]), `channel ${i}: ${g} vs ${want[i]}`).toBeLessThan(tol))
const chroma = (css: string): number => {
  const [, a, b] = srgbToOklab(parseColour(css)!)
  return Math.hypot(a, b)
}

describe('reading and writing CSS colours', () => {
  it('reads hex in every length and rgb() in both grammars', () => {
    expect(parseColour('#fff')).toEqual([1, 1, 1])
    expect(parseColour('#000000')).toEqual([0, 0, 0])
    expect(parseColour('#ff000080')).toEqual([1, 0, 0])
    expect(parseColour('rgb(255, 0, 0)')).toEqual([1, 0, 0])
    expect(parseColour('rgba(0, 255, 0, 0.5)')).toEqual([0, 1, 0])
    expect(parseColour('rgb(0 0 255 / 40%)')).toEqual([0, 0, 1])
    expect(parseColour('rgb(100%, 50%, 0%)')).toEqual([1, 0.5, 0])
    expect(parseColour('  #ABCDEF ')).toEqual(parseColour('#abcdef'))
  })

  it('refuses what it cannot read rather than guessing', () => {
    expect(parseColour('')).toBeNull()
    expect(parseColour('var(--warn)')).toBeNull()
    expect(parseColour('#12345')).toBeNull()
    expect(parseColour('rgb(1, 2)')).toBeNull()
    expect(parseColour('hsl(10, 50%, 50%)')).toBeNull()
  })

  it('writes #rrggbb, which the colour picker and WebGPU both take', () => {
    expect(formatColour([1, 0, 0])).toBe('#ff0000')
    expect(formatColour([0, 0.5, 1])).toBe('#0080ff')
    expect(formatColour([2, -1, 0.5])).toBe('#ff0080')
  })
})

describe('Oklab', () => {
  // Ottosson's own table (bottom of "A perceptual color space for image processing").
  const known: [RGB, Lab][] = [
    [[1, 1, 1], [1, 0, 0]],
    [[1, 0, 0], [0.627955, 0.224863, 0.125846]],
    [[0, 1, 0], [0.86644, -0.233888, 0.179498]],
    [[0, 0, 1], [0.452014, -0.032457, -0.311528]]
  ]

  it('matches the published values for white, red, green and blue', () => {
    for (const [rgb, lab] of known) near(srgbToOklab(rgb), lab, 1e-4)
  })

  it('round-trips every corner and a few in-between colours', () => {
    for (const rgb of [[1, 1, 1], [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.3, 0.6, 0.9], [0.9, 0.2, 0.4], [0.5, 0.5, 0.5]] as RGB[]) {
      near(oklabToSrgb(srgbToOklab(rgb)), rgb, 1e-6)
    }
  })

  it('puts black at L = 0 and greys on the L axis', () => {
    near(srgbToOklab([0, 0, 0]), [0, 0, 0], 1e-9)
    const [, a, b] = srgbToOklab([0.5, 0.5, 0.5])
    expect(Math.hypot(a, b)).toBeLessThan(1e-6)
  })
})

describe('mixOklab', () => {
  it('leaves a colour mixed with itself unchanged (with no boost)', () => {
    for (const c of ['#4dabf7', '#ff6b6b', '#51cf66', '#000000', '#ffffff']) expect(mixOklab(c, c, 1)).toBe(c)
  })

  it('mixes black and white to a mid grey by lightness, not by bytes', () => {
    const mid = parseColour(mixOklab('#000000', '#ffffff'))!
    expect(mid[0]).toBe(mid[1])
    expect(mid[1]).toBe(mid[2])
    // Oklab L = 0.5 is a good deal darker than byte 128: perceptual mid-grey is around #636363.
    expect(mid[0] * 255).toBeGreaterThan(90)
    expect(mid[0] * 255).toBeLessThan(110)
    const [L] = srgbToOklab(mid)
    expect(Math.abs(L - 0.5)).toBeLessThan(1e-3)
  })

  it('raises the chroma with the boost and leaves it alone without', () => {
    const a = '#4dabf7'
    const b = '#ff6b6b'
    const plain = mixOklab(a, b, 1)
    const bold = mixOklab(a, b, 1.15)
    expect(chroma(bold)).toBeGreaterThan(chroma(plain))
    // The chroma is the mean of the parents' own, scaled: the mix of this pair stays inside the
    // gamut, so the boost lands exactly where it should.
    const want = (chroma(a) + chroma(b)) / 2
    expect(Math.abs(chroma(plain) - want)).toBeLessThan(2e-3)
    expect(Math.abs(chroma(bold) - want * 1.15)).toBeLessThan(2e-3)
  })

  it('keeps the answer as strong as its parents: opposite hues do not cancel to grey', () => {
    // Blue and red are the first two colours a student's A and B get. Their Oklab a, b are on
    // opposite sides of the grey axis, and the old mean of a and b gave #be93b8 at chroma 0.072.
    const mix = mixOklab('#4dabf7', '#ff6b6b')
    expect(chroma(mix)).toBeGreaterThanOrEqual(Math.min(chroma('#4dabf7'), chroma('#ff6b6b')))
    // The hue is halfway round the short way: between blue (−114°) and red (+23°) sits violet.
    const [, ma, mb] = srgbToOklab(parseColour(mix)!)
    const hue = (Math.atan2(mb, ma) * 180) / Math.PI
    expect(hue).toBeGreaterThan(-60)
    expect(hue).toBeLessThan(-30)
    // Every pair of the vector palette: a mix may lose a little to the gamut clip, never most of it.
    const palette = ['#4dabf7', '#ff6b6b', '#51cf66', '#fcc419', '#cc5de8', '#ff922b', '#22b8cf', '#f06595']
    for (const x of palette) for (const y of palette) if (x < y) expect(chroma(mixOklab(x, y)), `${x} + ${y}`).toBeGreaterThanOrEqual(0.8 * Math.min(chroma(x), chroma(y)))
  })

  it('has a lightness halfway between its parents', () => {
    const [La] = srgbToOklab(parseColour('#4dabf7')!)
    const [Lb] = srgbToOklab(parseColour('#ff6b6b')!)
    const [Lm] = srgbToOklab(parseColour(mixOklab('#4dabf7', '#ff6b6b'))!)
    expect(Math.abs(Lm - (La + Lb) / 2)).toBeLessThan(2e-3)
  })

  it('lets a grey parent vote on lightness but not on hue', () => {
    // Red + mid-grey: the mix keeps red's hue at half its chroma, not a hue dragged towards 0°.
    const mix = mixOklab('#ff6b6b', '#808080', 1)
    const [, ra, rb] = srgbToOklab(parseColour('#ff6b6b')!)
    const [, ma, mb] = srgbToOklab(parseColour(mix)!)
    expect(Math.abs(Math.atan2(mb, ma) - Math.atan2(rb, ra))).toBeLessThan(0.02)
    expect(Math.abs(chroma(mix) - chroma('#ff6b6b') / 2)).toBeLessThan(2e-3)
  })

  it('is the same colour whichever parent comes first', () => {
    expect(mixOklab('#4dabf7', '#ff6b6b')).toBe(mixOklab('#ff6b6b', '#4dabf7'))
  })

  it('reads rgb() tokens the way a stylesheet hands them over', () => {
    expect(mixOklab('rgb(77, 171, 247)', 'rgb(255, 107, 107)')).toBe(mixOklab('#4dabf7', '#ff6b6b'))
  })

  it('averages more than two parents, and falls back to the first string when none can be read', () => {
    expect(mixOklabMany(['#ff0000', '#ff0000', '#ff0000'], 1)).toBe('#ff0000')
    expect(mixOklabMany(['var(--warn)', 'var(--good)'])).toBe('var(--warn)')
    // One unreadable parent is skipped, not turned into black.
    expect(mixOklabMany(['#ff6b6b', 'var(--nope)'], 1)).toBe('#ff6b6b')
  })

  it('never writes a colour of its own: every literal in the module is a matrix entry', () => {
    // The colours guard scans .tsx only; this keeps the .ts maths module to the same rule.
    const src = readSource('src/renderer/src/render/colourMix.ts')
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(src).not.toMatch(/\brgba?\(\s*\d/)
  })
})
