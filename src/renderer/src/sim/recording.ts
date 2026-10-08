// Turning a run into readings.
//
// A simulation you cannot get numbers out of is a demonstration, not an experiment. These are the
// samples taken while it plays, and the table they become — the same kind of table Lab Data
// already knows how to plot, fit and read a gradient from, so a student can go from "watch it
// fall" to "find g" without typing a single reading.

import type { BodyDef, BodyId, BodyState } from './types'
import type { LabTable } from '../lab/types'
import { energyOf, momentumSize } from './energy'

export interface Sample {
  /** Simulated time in seconds. */
  t: number
  x: number
  y: number
  /** Speed, m/s. */
  v: number
  ke: number
  pe: number
  p: number
}

/** About a minute at ten samples a second, which is plenty to fit a line through. */
export const MAX_SAMPLES = 600

export const QUANTITIES = [
  { key: 'y', label: 'Height', unit: 'm' },
  { key: 'x', label: 'Distance along', unit: 'm' },
  { key: 'v', label: 'Speed', unit: 'm/s' },
  { key: 'ke', label: 'Kinetic energy', unit: 'J' },
  { key: 'pe', label: 'Potential energy', unit: 'J' },
  { key: 'p', label: 'Momentum', unit: 'kg m/s' }
] as const

export type QuantityKey = (typeof QUANTITIES)[number]['key']

export const quantity = (key: QuantityKey) => QUANTITIES.find((q) => q.key === key) ?? QUANTITIES[0]

/** One reading of one body at one moment. */
export function sampleOf(def: BodyDef, state: BodyState, t: number, gravity: number, datumY: number): Sample {
  const e = energyOf(def, state, gravity, datumY)
  return {
    t,
    x: state.position[0],
    y: state.position[1] - datumY,
    v: Math.hypot(state.velocity[0], state.velocity[1], state.velocity[2]),
    ke: e.kinetic,
    pe: e.potential,
    p: momentumSize(state)
  }
}

/** Adds a sample, dropping the oldest once the run is long enough. */
export function addSample(list: Sample[], s: Sample): Sample[] {
  const next = [...list, s]
  return next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next
}

/** A recorded value to five figures, as text: 1.2 is "1.2000", the precision it was recorded to. */
const fiveFigures = (v: number): string => v.toPrecision(5)

/**
 * The samples as texts for a Lab Data table, keeping the trailing zeros of their precision (Lab
 * Data shows a cell's text only where it reads back as the cell's number, so an exponent form such
 * as "3.0000e-7" falls back to the number itself).
 */
export function readsFor(samples: Sample[]): (string | null)[][] {
  return samples.map((s) => [s.t, s.x, s.y, s.v, s.ke, s.pe, s.p].map(fiveFigures))
}

/**
 * The samples as rows for a Lab Data table. Values are rounded to five figures: a simulation can
 * print seventeen, and no measurement in a school lab has more than three or four.
 */
export function rowsFor(samples: Sample[]): (number | null)[][] {
  // From the same text as readsFor, so a cell and its text always agree; a tiny value such as 3e-7
  // stays a number (the measurement formatter writes it with a raised power, which is no number).
  const round = (v: number) => Number(fiveFigures(v))
  return samples.map((s) => [s.t, s.x, s.y, s.v, s.ke, s.pe, s.p].map(round))
}

/**
 * The columns those rows fill, named and with their units, the way the table headers read. PE and
 * momentum were plotted in the panel but left out of what Send to Lab Data sent (H30).
 */
export const RECORDING_COLUMNS: { name: string; unit: string }[] = [
  { name: 't', unit: 's' },
  { name: 'x', unit: 'm' },
  { name: 'y', unit: 'm' },
  { name: 'v', unit: 'm/s' },
  { name: 'KE', unit: 'J' },
  { name: 'PE', unit: 'J' },
  { name: 'p', unit: 'kg m/s' }
]

/**
 * The samples as a Lab Data table, with the columns named and carrying their units. A pure
 * function rather than a line in the Send button, so a test can check what the button sends.
 */
export function tableFrom(name: string, samples: Sample[]): LabTable {
  const columns = RECORDING_COLUMNS.map((c, i) => ({ id: `rc${i}`, name: c.name, unit: c.unit }))
  return {
    id: `rec${Date.now().toString(36)}`,
    title: `${name} — from the Sandbox`,
    columns,
    rows: rowsFor(samples),
    reads: readsFor(samples),
    // Height against time to begin with; the student picks the pair they actually want.
    plot: { x: columns[0].id, y: columns[2].id, fit: 'quadratic' }
  }
}

export const bodyKey = (id: BodyId): string => id
