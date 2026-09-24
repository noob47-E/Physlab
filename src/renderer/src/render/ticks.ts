// Where an axis puts its numbers, kept pure so it can be tested without a canvas.
//
// `extendedTicks` is Talbot, Lin & Hanrahan's "extended Wilkinson" search (IEEE InfoVis 2010,
// Algorithm 1), scored exactly as the authors' own R package `labeling` scores it, with legibility
// held at 1. A straight JavaScript port gets one thing wrong: R's `%%` never returns a negative
// remainder and JavaScript's `%` does, so on an axis that starts below zero the "labels include 0"
// bonus was never paid — [-7.3, 1.2] could be labelled -7, -5, -3, -1, 1 and skip the origin.
//
// `axisTicks` is what the grid asks for: labels about 80 px apart, never closer than 60 px, and
// always on a line the grid actually draws.

/** Talbot's nice numbers, most preferred first. */
export const TALBOT_Q = [1, 5, 2, 2.5, 4, 3]

/** Weights of simplicity, coverage, density and legibility (the paper's and R's defaults). */
export const TALBOT_W: [number, number, number, number] = [0.25, 0.2, 0.5, 0.05]

const EPS = Number.EPSILON * 100

export interface TalbotTicks {
  /** Distance between neighbouring labels: j·q·10^z. */
  step: number
  /** How many of the base step q·10^z one label step skips; callers must never assume 1. */
  j: number
  q: number
  z: number
  /** The labels from the first to the last, as exact as a double can hold them. */
  ticks: number[]
}

/**
 * The winning labelling of [dmin, dmax] with about `m` labels. `accept(step, base)` can rule out
 * candidates before they are scored (base = q·10^z, step = j·base); ruling some out keeps every
 * bound of the search valid, because a bound only ever says a candidate cannot beat the best so
 * far. Null when the input is not finite or nothing is acceptable.
 */
export function extendedTicks(
  dmin: number,
  dmax: number,
  m: number,
  Q: number[] = TALBOT_Q,
  w: [number, number, number, number] = TALBOT_W,
  accept?: (step: number, base: number) => boolean
): TalbotTicks | null {
  if (!Number.isFinite(dmin) || !Number.isFinite(dmax) || !Number.isFinite(m) || Q.length === 0) return null
  if (dmin > dmax) [dmin, dmax] = [dmax, dmin]
  if (dmax - dmin < EPS) return { step: 0, j: 1, q: 1, z: 0, ticks: [dmin] }
  // The density score divides by m − 1.
  m = Math.max(2, Math.round(m))
  const n = Q.length
  const range = dmax - dmin
  // A range past the largest double makes every step infinite and the search would never end.
  if (!Number.isFinite(range)) return null
  let best: { j: number; q: number; z: number; start: number; k: number } | null = null
  let bestScore = -2

  for (let j = 1; ; j++) {
    let anyQ = false
    for (let qi = 0; qi < n; qi++) {
      const q = Q[qi]
      // Simplicity at its most: the "includes 0" bonus paid in full.
      const sm = n === 1 ? 2 - j : 1 - qi / (n - 1) - j + 1
      if (w[0] * sm + w[1] + w[2] + w[3] < bestScore) break
      anyQ = true
      for (let k = 2; ; k++) {
        const dm = k >= m ? 2 - (k - 1) / (m - 1) : 1
        if (w[0] * sm + w[1] + w[2] * dm + w[3] < bestScore) break
        const delta = range / (k + 1) / j / q
        for (let z = Math.ceil(Math.log10(delta)); ; z++) {
          const base = z < 0 ? q / 10 ** -z : q * 10 ** z
          const step = j * base
          const span = step * (k - 1)
          const cm = span > range ? 1 - ((span - range) / 2) ** 2 / (0.1 * range) ** 2 : 1
          if (w[0] * sm + w[1] * cm + w[2] * dm + w[3] < bestScore) break
          if (accept && !accept(step, base)) continue
          const minStart = Math.floor(dmax / step) * j - (k - 1) * j
          const maxStart = Math.ceil(dmin / step) * j
          for (let start = minStart; start <= maxStart; start++) {
            const lmin = start * base
            const lmax = lmin + span
            // R's %% — the remainder fix. JavaScript's % keeps the sign of lmin, so a negative
            // lmin gave a negative remainder that neither test below could ever see as zero.
            let mod = lmin % step
            if (mod < 0) mod += step
            const v = (mod < EPS || step - mod < EPS) && lmin <= 0 && lmax >= 0 ? 1 : 0
            const s = 1 - qi / Math.max(1, n - 1) - j + v
            const c = 1 - (0.5 * ((dmax - lmax) ** 2 + (dmin - lmin) ** 2)) / (0.1 * range) ** 2
            const r = (k - 1) / (lmax - lmin)
            const rt = (m - 1) / (Math.max(lmax, dmax) - Math.min(dmin, lmin))
            const g = 2 - Math.max(r / rt, rt / r)
            const score = w[0] * s + w[1] * c + w[2] * g + w[3]
            if (score > bestScore) {
              bestScore = score
              best = { j, q, z, start, k }
            }
          }
        }
      }
    }
    // No q could still win at this j, and every larger j scores lower still.
    if (!anyQ) break
  }
  if (!best) return null
  const { j, q, z, start, k } = best
  const ticks = Array.from({ length: k }, (_, i) => multiple(start + i * j, q, z))
  return { step: multiple(j, q, z), j, q, z, ticks }
}

/** n·q·10^z, dividing by a power of ten rather than multiplying by its inexact reciprocal: 3·0.1 is 0.30000000000000004, 3/10 is 0.3. */
function multiple(n: number, q: number, z: number): number {
  const v = z < 0 ? (n * q) / 10 ** -z : n * q * 10 ** z
  // −0 would be written "−0" by some formatters.
  return v === 0 ? 0 : v
}

/** Whether a is a whole, positive number of b. */
export function isMultipleOf(a: number, b: number): boolean {
  if (!(a > 0) || !(b > 0)) return false
  const r = a / b
  return Math.round(r) >= 1 && Math.abs(r - Math.round(r)) < 1e-9 * Math.max(1, r)
}

/** The spacing the grid aims for between two labels, and the least it ever allows. */
export const LABEL_PX = 80
export const MIN_LABEL_PX = 60
/** The stretch of axis the label step is chosen for: ten labels' worth. */
const CANON_PX = 10 * LABEL_PX

/**
 * The values to label along an axis showing [dmin, dmax] across `pxLength` pixels. Every value is
 * a whole number of `minorStep`, so it sits on a line the grid draws; given `majorStep`, the label
 * step also divides the major step or is a whole number of it, so the numbers keep the rhythm of
 * the heavy lines instead of reading 0, 3, 6 beside heavy lines at 5 and 10.
 *
 * The step depends on the scale alone: the search labels a standard stretch of `CANON_PX` pixels
 * at this scale, starting at 0, and the labels are the multiples of its step inside the view. A
 * search on the view's own ends would change the step and the offset as the student pans, so the
 * numbers would jump about under a steady zoom; a search on the view's own length would number a
 * wide x axis and a short y axis of the same square paper in different steps. This way panning or
 * resizing only slides the labels, both axes agree, and 0 is labelled whenever it is in view.
 */
export function axisTicks(dmin: number, dmax: number, pxLength: number, minorStep: number, majorStep?: number): number[] {
  if (!Number.isFinite(dmin) || !Number.isFinite(dmax) || !(dmax > dmin) || !(pxLength > 0) || !(minorStep > 0)) return []
  const pxPerUnit = pxLength / (dmax - dmin)
  const keepsRhythm = (step: number) => majorStep === undefined || !(majorStep > 0) || isMultipleOf(majorStep, step) || isMultipleOf(step, majorStep)
  const r = extendedTicks(0, CANON_PX / pxPerUnit, CANON_PX / LABEL_PX + 1, TALBOT_Q, TALBOT_W, (step, base) => step * pxPerUnit >= MIN_LABEL_PX * (1 - 1e-9) && isMultipleOf(base, minorStep) && keepsRhythm(step))
  if (!r || !(r.step > 0)) return []
  const unit = r.j // labels are n·j·q·10^z
  const out: number[] = []
  const first = Math.ceil(dmin / r.step - 1e-9)
  const last = Math.floor(dmax / r.step + 1e-9)
  for (let i = first; i <= last; i++) out.push(multiple(i * unit, r.q, r.z))
  return out
}
