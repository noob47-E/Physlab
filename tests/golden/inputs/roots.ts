// The `roots` sweep's inputs (CLEANUP-PLAN.md §2).

export const SLIDER_VALUES = [-2, -1, 0, 1, 2]

export const SLIDER_EQS = [
  'x^2 = a',
  'x^3 - a*x = 0',
  'sin(x) = a',
  'x^2 + a*x + 1 = 0'
]

// 200 seeded polynomials with near-double, repeated and clustered roots.
export const ROOTS_FUZZ = Array.from({ length: 200 }, (_, i) => {
  let seed = i + 1
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  const kind = Math.floor(rand() * 4)
  if (kind === 0) {
    // near-double
    const r = Math.floor(rand() * 10) - 5
    const gap = 10 ** -(Math.floor(rand() * 10) + 2)
    return `(x - ${r})(x - ${r + gap}) = 0`
  } else if (kind === 1) {
    // repeated
    const r = Math.floor(rand() * 10) - 5
    const p = Math.floor(rand() * 4) + 2
    return `(x - ${r})^${p} = 0`
  } else if (kind === 2) {
    // clustered
    const r = Math.floor(rand() * 10) - 5
    const r1 = r + rand() * 0.1
    const r2 = r - rand() * 0.1
    const r3 = r + rand() * 0.01
    return `(x - ${r1})(x - ${r2})(x - ${r3}) = 0`
  } else {
    // complex: the quadratic whose roots are re ± im·i (the bar has no i in an equation in x)
    const re = Math.floor(rand() * 10) - 5
    const im = Math.floor(rand() * 10) + 1
    return `x^2 - ${2 * re}*x + ${re * re + im * im} = 0`
  }
})
