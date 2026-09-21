// Mixing two colours the way the eye does, not the way the bytes do.
//
// A resultant arrow takes the colour between its two parents. Averaging red and blue byte by byte
// gives a dull purple-grey; averaging them in Oklch (the polar form of Björn Ottosson's Oklab)
// keeps the mix as bright and as strong as its parents and lets the chroma be nudged up so the
// answer reads a little bolder than the inputs. Colours come in and go out as CSS strings — this module holds no colour
// of its own, and reads whatever the theme's tokens turn out to be at run time.

export type RGB = [number, number, number]
export type Lab = [number, number, number]

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

/**
 * A CSS colour string as three 0–1 sRGB channels: `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(r, g, b)`
 * or `rgba(r, g, b, a)` with the channels as 0–255 numbers or percentages, and the modern
 * space-separated form `rgb(r g b / a)`. Alpha is read past and dropped: an arrow is opaque.
 * Anything else is null, so a caller can fall back rather than draw a guess.
 */
export function parseColour(css: string): RGB | null {
  const s = css.trim()
  const hex = /^#([0-9a-f]{3,8})$/i.exec(s)
  if (hex) {
    const h = hex[1]
    if (h.length === 3 || h.length === 4) return [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16) / 255) as RGB
    if (h.length === 6 || h.length === 8) return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB
    return null
  }
  const fn = /^rgba?\(\s*([^)]*)\)$/i.exec(s)
  if (!fn) return null
  const parts = fn[1]
    .split('/')[0]
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 3)
  if (parts.length !== 3) return null
  const chans = parts.map((p) => (p.endsWith('%') ? Number(p.slice(0, -1)) / 100 : Number(p) / 255))
  return chans.every((c) => Number.isFinite(c)) ? (chans.map(clamp01) as RGB) : null
}

/** Three 0–1 channels as `#rrggbb`, which every consumer (WebGPU, CSS, the colour picker) reads. */
export function formatColour(rgb: RGB): string {
  return `#${rgb.map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, '0')).join('')}`
}

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

/** sRGB (gamma-encoded, 0–1) → Oklab, by Ottosson's two matrices and the cube root between them. */
export function srgbToOklab([r8, g8, b8]: RGB): Lab {
  const r = toLinear(r8)
  const g = toLinear(g8)
  const b = toLinear(b8)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ]
}

/** Oklab → sRGB (gamma-encoded, 0–1), clipped to the gamut channel by channel. */
export function oklabToSrgb([L, a, b]: Lab): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return [toGamma(clamp01(r)), toGamma(clamp01(g)), toGamma(clamp01(bl))]
}

/**
 * The colour between some colours, in Oklch, as `#rrggbb`: the mean lightness, the hue halfway
 * round the wheel the short way (averaged on unit vectors, so opposite hues do not cancel), and
 * the mean chroma scaled by `chromaBoost`. A plain Oklab mean of a and b was tried first and
 * turned the blue + red the palette hands out first into a pale mauve at a third of either
 * parent's chroma: opposite hues sit on opposite sides of the grey axis, and their average is
 * grey. Taking the chroma separately keeps the answer at least as strong as its parents.
 * A colour that cannot be read is left out; if none can be, the first string comes back as it
 * was, so a broken token never turns an arrow grey.
 */
export function mixOklabMany(colours: string[], chromaBoost = 1.15): string {
  const labs = colours.map(parseColour).filter((c): c is RGB => c !== null).map(srgbToOklab)
  if (!labs.length) return colours[0] ?? ''
  const n = labs.length
  let L = 0
  let chroma = 0
  let hx = 0
  let hy = 0
  for (const [l, a, b] of labs) {
    const c = Math.hypot(a, b)
    L += l / n
    chroma += c / n
    // A grey has no hue to vote with; letting it vote would pull every mix towards red (0°).
    if (c > 1e-6) {
      hx += a / c
      hy += b / c
    }
  }
  const hl = Math.hypot(hx, hy)
  // Every parent grey, or hues exactly opposite: no hue to be had, so the mix is a grey.
  if (hl < 1e-9) return formatColour(oklabToSrgb([L, 0, 0]))
  const C = chroma * chromaBoost
  return formatColour(oklabToSrgb([L, (hx / hl) * C, (hy / hl) * C]))
}

/** The colour halfway between two colours in Oklch, a little bolder than either by default. */
export function mixOklab(a: string, b: string, chromaBoost = 1.15): string {
  return mixOklabMany([a, b], chromaBoost)
}

/**
 * Which arrows an answer's colour is mixed from, by object id. The scene bridge fills this in
 * when it draws a solution and the vector view reads it every render, so the resultant follows
 * its parents when one of them is recoloured and the mix is redone when the theme flips. It is
 * not saved: after a reload the arrow keeps the mixed colour it was given when it was drawn.
 */
export const mixParents = new Map<string, string[]>()
