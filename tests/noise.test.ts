import { describe, expect, it } from 'vitest'
import { isNoise, sameNumber } from '../src/renderer/src/math/noise'
import { noiseFloor } from '../src/renderer/src/math/format'

describe('noise rules', () => {
  it('boundary table', () => {
    // exact 0
    expect(isNoise(0)).toBe(true)
    expect(isNoise(0, 1, 2)).toBe(true)
    expect(sameNumber(0, 0)).toBe(true)

    // ±1e-300
    expect(isNoise(1e-300)).toBe(false)
    expect(isNoise(-1e-300)).toBe(false)
    expect(isNoise(1e-300, 1)).toBe(true)
    expect(sameNumber(1e-300, -1e-300)).toBe(false)
    expect(sameNumber(1e-300, -1e-300, 1)).toBe(true)

    // 1e300
    expect(isNoise(1e300)).toBe(false)
    expect(sameNumber(1e300, 1e300)).toBe(true)
    expect(sameNumber(1e300, 1e300 + 1e284)).toBe(true)

    // NaN
    expect(isNoise(NaN)).toBe(false)
    expect(isNoise(NaN, 1)).toBe(false)
    expect(isNoise(1, NaN)).toBe(false)
    expect(sameNumber(NaN, NaN)).toBe(false)
    expect(sameNumber(1, NaN)).toBe(false)
    expect(sameNumber(NaN, 1)).toBe(false)

    // ±Infinity
    expect(isNoise(Infinity)).toBe(false)
    expect(isNoise(-Infinity)).toBe(false)
    expect(isNoise(1, Infinity)).toBe(false)
    expect(sameNumber(Infinity, Infinity)).toBe(true)
    expect(sameNumber(-Infinity, -Infinity)).toBe(true)
    expect(sameNumber(Infinity, -Infinity)).toBe(false)
    expect(sameNumber(Infinity, 1)).toBe(false)

    // sums that cancel to 1e-17 such as 0.1+0.2-0.3 with inputs 0.1, 0.2, 0.3
    const cancel = 0.1 + 0.2 - 0.3
    expect(isNoise(cancel, 0.1, 0.2, 0.3)).toBe(true)
    expect(sameNumber(0.1 + 0.2, 0.3, 0.1, 0.2, 0.3)).toBe(true)

    // values a hair either side of the floor
    expect(isNoise(1e-15, 1)).toBe(true)
    expect(isNoise(1.000001e-15, 1)).toBe(false)
    expect(isNoise(0.999999e-15, 1)).toBe(true)
  })

  it('property-based agreement over 100000 seeded pseudo-random cases', () => {
    let seed = 123456789
    function random() {
      seed |= 0
      seed = seed + 0x6D2B79F5 | 0
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
      return ((t ^ t >>> 14) >>> 0) / 4294967296
    }

    function randomValue() {
      const r = random()
      if (r < 0.05) return 0
      if (r < 0.1) return NaN
      if (r < 0.15) return Infinity
      if (r < 0.2) return -Infinity
      const sign = random() < 0.5 ? 1 : -1
      const exp = (random() * 600) - 300
      return sign * random() * Math.pow(10, exp)
    }

    const disagreements: string[] = []

    for (let i = 0; i < 100000; i++) {
      const v = randomValue()
      const inputs = [randomValue(), randomValue(), randomValue()]
      
      let largest = Math.abs(v)
      for (const x of inputs) {
        largest = Math.max(largest, Math.abs(x))
      }
      
      const floor = noiseFloor(v, largest)
      const ref = Math.abs(v) <= floor

      const actual = isNoise(v, ...inputs)

      if (ref !== actual) {
        disagreements.push(`v=${v}, inputs=[${inputs.join(', ')}], ref=${ref}, actual=${actual}, largest=${largest}, floor=${floor}`)
      }
    }

    if (disagreements.length > 0) {
      console.error('Disagreements:', disagreements.slice(0, 10))
    }
    expect(disagreements).toEqual([])
  })

  // The two Vectors rules CW9 will move onto math/noise.ts, copied here as they stand (both are
  // private): the solver's, for A·B and A×B (math/vectorSolver.ts isNoise), and the panel's, for a
  // typed line (panels/vectorLine.ts withoutNoise, the floor taken from the line's scale and
  // every number the line gives). Both call noise anything within 10⁻¹² of the scale, where isNoise
  // and noiseFloor stop at 10⁻¹⁵: they disagree on a value between the two, and nowhere else, as long
  // as a product is judged dividing first, isNoise(p / |A|, |B|) — |A||B| overflows for vectors of
  // 10¹⁵⁵. This counts that band for CW9 (which decides the one number) and fails on any
  // disagreement outside it.
  const solverIsNoise = (product: number, mA: number, mB: number): boolean => {
    const p = Math.abs(product)
    return p === 0 || p / mA <= 1e-12 * mB
  }
  /** withoutNoise for one number x of a line whose numbers are `all` (x among them). */
  const lineIsNoise = (x: number, scale: number, all: number[]): boolean => Math.abs(x) < 1e-12 * Math.max(scale, ...all.map(Math.abs))

  it('agrees with the Vectors rules except between 10⁻¹⁵ and 10⁻¹² of the scale (listed for CW9)', () => {
    let seed = 987654321
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    /** A size from 10⁻³⁰⁰ to 10³⁰⁰ (so products overflow and underflow), and a ratio 0 to 20 orders below 1. */
    const size = (): number => 10 ** (random() * 600 - 300) * (1 + random())
    const ratio = (): number => (random() < 0.5 ? -1 : 1) * 10 ** -(random() * 20)
    const inBand = (r: number): boolean => Math.abs(r) > 1e-15 * 0.999 && Math.abs(r) <= 1e-12 * 1.001

    let band = 0
    let products = 0
    const outside: string[] = []
    for (let i = 0; i < 100000; i++) {
      // A product of two vectors' sizes, as the solver judges it: p = r |A||B|, made without forming |A||B|.
      const mA = size()
      const mB = size()
      const r = ratio()
      const p = r * mA * mB
      if (Number.isFinite(p) && p !== 0) {
        products++
        const old = solverIsNoise(p, mA, mB)
        const now = isNoise(p / mA, mB)
        if (old !== now) {
          if (inBand(r)) band++
          else outside.push(`product ${p} of sizes ${mA}, ${mB}: solver ${old}, isNoise ${now}`)
        }
      }
      // A number on a typed line, against the line's scale and the line's other numbers.
      const s = size()
      const x = ratio() * s
      const all = [x, ratio() * s, ratio() * s]
      const top = Math.max(s, ...all.map(Math.abs))
      const old = lineIsNoise(x, s, all)
      const now = isNoise(x, s, ...all)
      if (old !== now) {
        if (inBand(x / top)) band++
        else outside.push(`line value ${x} at scale ${s}: line rule ${old}, isNoise ${now}`)
      }
    }
    console.info(`noise rules: ${band} of ${products + 100000} cases fall between 10⁻¹⁵ and 10⁻¹² of the scale, where the Vectors rules call noise and isNoise does not (for CW9)`)
    expect(products).toBeGreaterThan(50000)
    expect(band).toBeGreaterThan(0)
    expect(outside.slice(0, 10)).toEqual([])
  })

  it('the floors, a hair either side, and where the rules differ in kind (for CW9)', () => {
    // isNoise at 10⁻¹⁵ of the scale; noiseFloor's own edge can land one rounding step away
    // (10⁻⁹ × 10⁻⁶ × L and 10⁻¹⁵ × L round apart), which is why the property test never sits on it.
    expect(isNoise(1e-15 * 7, 7)).toBe(true)
    expect(isNoise(1.000001e-15 * 7, 7)).toBe(false)
    // The solver's 10⁻¹², inclusive, and the line rule's, strict.
    expect(solverIsNoise(0.999999e-12, 1, 1)).toBe(true)
    expect(solverIsNoise(1e-12, 1, 1)).toBe(true)
    expect(solverIsNoise(1.000001e-12, 1, 1)).toBe(false)
    expect(lineIsNoise(1e-12, 1, [1e-12])).toBe(false)
    expect(lineIsNoise(0.999999e-12, 1, [0.999999e-12])).toBe(true)
    // Overflow: the solver divides first, so 10²⁰⁰ î · (a hair off 10²⁰⁰ ĵ) is still noise; multiplying first would not be.
    expect(solverIsNoise(6e292, 1e200, 1e200)).toBe(true)
    expect(isNoise(6e292 / 1e200, 1e200)).toBe(true)
    expect(isNoise(6e292, 1e200 * 1e200)).toBe(false)
    // A line of scale 0 (nothing added or multiplied): the line rule judges against the numbers alone.
    expect(lineIsNoise(1e-20, 0, [1e-20, 5])).toBe(true)
    expect(isNoise(1e-20, 0, 1e-20, 5)).toBe(true)
  })
})
