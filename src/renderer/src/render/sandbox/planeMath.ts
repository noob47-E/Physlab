import { MeasureSettings, formatMeasure } from '../../math/format'
import { axisLabels } from '../gridLabels'

export interface Rect {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export interface PlaneGrid {
  minorStep: number
  majorStep: number
  minorX: number[]
  minorY: number[]
  majorX: number[]
  majorY: number[]
}

function computeSteps(pixelsPerMetre: number, ladderMultipliers: number[] = [1, 2, 5]): { minorStep: number; majorStep: number } {
  // Find the smallest step such that it's at least 24 pixels wide
  // We check powers of 10 times the ladder multipliers
  let minorStep = 1
  let found = false
  for (let exponent = -10; exponent <= 10; exponent++) {
    const power = Math.pow(10, exponent)
    for (const mult of ladderMultipliers) {
      const testStep = mult * power
      if (testStep * pixelsPerMetre >= 24) {
        minorStep = testStep
        found = true
        break
      }
    }
    if (found) break
  }

  // Derive majorStep from minorStep
  // To avoid floating point issues we determine the first digit
  // e.g., 0.1 -> 1, 0.2 -> 2, 0.5 -> 5
  // If minor starts with 1 -> major is 5 * minor
  // If minor starts with 2 -> major is 10 * (minor/2) = 5 * minor
  // If minor starts with 5 -> major is 10 * (minor/5) = 2 * minor
  
  // A robust way to check:
  // Convert minorStep to standard form.
  let majorStep: number
  const norm = minorStep / Math.pow(10, Math.floor(Math.log10(minorStep + 1e-9)))
  if (Math.abs(norm - 2) < 1e-5) majorStep = minorStep * 5
  else if (Math.abs(norm - 5) < 1e-5) majorStep = minorStep * 2
  else majorStep = minorStep * 5 // for 1

  return { minorStep, majorStep }
}

function getGridLines(min: number, max: number, step: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max || step <= 0) return []
  const first = Math.ceil(min / step - 1e-9)
  const last = Math.floor(max / step + 1e-9)
  const lines: number[] = []
  for (let i = first; i <= last; i++) {
    let val = i * step
    if (val === 0) val = 0 // handle -0
    lines.push(val)
  }
  return lines
}

export function planeGrid(view: Rect, widthPx: number, heightPx: number): PlaneGrid {
  if (!Number.isFinite(view.xMin) || !Number.isFinite(view.xMax) || !Number.isFinite(view.yMin) || !Number.isFinite(view.yMax)) {
    return { minorStep: 1, majorStep: 5, minorX: [], minorY: [], majorX: [], majorY: [] }
  }
  
  if (view.xMax <= view.xMin || view.yMax <= view.yMin || widthPx <= 0 || heightPx <= 0) {
    return { minorStep: 1, majorStep: 5, minorX: [], minorY: [], majorX: [], majorY: [] }
  }

  const pixelsPerMetre = widthPx / (view.xMax - view.xMin)
  
  let { minorStep, majorStep } = computeSteps(pixelsPerMetre)
  
  let minorX = getGridLines(view.xMin, view.xMax, minorStep)
  let minorY = getGridLines(view.yMin, view.yMax, minorStep)

  if (minorX.length > 300 || minorY.length > 300) {
    // If one axis would have more than 300 lines, double the minorStep along the 1-2-5 ladder and recompute.
    // However, the rule is to double the step, which means we shift to the next in the ladder
    // e.g. 1 -> 2 -> 5 -> 10
    // Actually, we can just do computeSteps with a higher threshold, e.g. 48 pixels
    // or just find the current multiplier and pick the next one.
    // The prompt says: "double the minorStep along the 1-2-5 ladder and recompute".
    // 1 -> 2, 2 -> 5, 5 -> 10.
    const exponent = Math.floor(Math.log10(minorStep + 1e-9))
    const norm = minorStep / Math.pow(10, exponent)
    
    if (Math.abs(norm - 1) < 1e-5) minorStep = 2 * Math.pow(10, exponent)
    else if (Math.abs(norm - 2) < 1e-5) minorStep = 5 * Math.pow(10, exponent)
    else minorStep = 10 * Math.pow(10, exponent)

    if (Math.abs(minorStep / Math.pow(10, Math.floor(Math.log10(minorStep + 1e-9))) - 2) < 1e-5) majorStep = minorStep * 5
    else if (Math.abs(minorStep / Math.pow(10, Math.floor(Math.log10(minorStep + 1e-9))) - 5) < 1e-5) majorStep = minorStep * 2
    else majorStep = minorStep * 5

    minorX = getGridLines(view.xMin, view.xMax, minorStep)
    minorY = getGridLines(view.yMin, view.yMax, minorStep)
  }

  const majorX = getGridLines(view.xMin, view.xMax, majorStep)
  const majorY = getGridLines(view.yMin, view.yMax, majorStep)

  return { minorStep, majorStep, minorX, minorY, majorX, majorY }
}

export function gridLabels(
  view: Rect,
  widthPx: number,
  heightPx: number,
  s: MeasureSettings
): { x: { value: number; text: string }[]; y: { value: number; text: string }[] } {
  const grid = planeGrid(view, widthPx, heightPx)
  
  if (grid.minorX.length === 0) return { x: [], y: [] }

  const xLabels = axisLabels(view.xMin, view.xMax, widthPx, grid.majorStep, grid.minorStep, s)
  const yLabels = axisLabels(view.yMin, view.yMax, heightPx, grid.majorStep, grid.minorStep, s)

  return { x: xLabels, y: yLabels }
}

export function scaleBar(
  pixelsPerMetre: number,
  s: MeasureSettings,
  maxPx: number = 160
): { metres: number; px: number; label: string } {
  const ladderMultipliers = [1, 2, 5]
  const maxMetres = maxPx / pixelsPerMetre
  
  let bestMetres = 0
  for (let exponent = 10; exponent >= -10; exponent--) {
    const power = Math.pow(10, exponent)
    for (let i = ladderMultipliers.length - 1; i >= 0; i--) {
      const testStep = ladderMultipliers[i] * power
      if (testStep <= maxMetres + 1e-9) {
        bestMetres = testStep
        break
      }
    }
    if (bestMetres > 0) break
  }

  return {
    metres: bestMetres,
    px: bestMetres * pixelsPerMetre,
    label: formatMeasure(bestMetres, 'length', s)
  }
}

export function fitOrtho(
  box: { min: [number, number]; max: [number, number] },
  widthPx: number,
  heightPx: number,
  opts?: { margin?: number; minSpan?: number }
): { centre: [number, number]; pixelsPerMetre: number } {
  const margin = opts?.margin ?? 0.18
  const minSpan = opts?.minSpan ?? 2

  const boxWidth = box.max[0] - box.min[0]
  const boxHeight = box.max[1] - box.min[1]

  const viewWidth = boxWidth / (1 - 2 * margin)
  const viewHeight = boxHeight / (1 - 2 * margin)

  const pxPerMetreX = widthPx / viewWidth
  const pxPerMetreY = heightPx / viewHeight

  let pixelsPerMetre = Math.min(pxPerMetreX, pxPerMetreY)

  // never zoomed in past minSpan metres across the shorter side
  const shorterScreenSide = Math.min(widthPx, heightPx)
  const maxPixelsPerMetre = shorterScreenSide / minSpan

  if (pixelsPerMetre > maxPixelsPerMetre) {
    pixelsPerMetre = maxPixelsPerMetre
  }

  const centreX = (box.min[0] + box.max[0]) / 2
  const centreY = (box.min[1] + box.max[1]) / 2

  return { centre: [centreX, centreY], pixelsPerMetre }
}

export interface MassPoint {
  mass: number
  position: [number, number, number]
  velocity: [number, number, number]
}

export function centreOfMass(list: MassPoint[]): {
  mass: number
  position: [number, number, number]
  velocity: [number, number, number]
  momentum: [number, number, number]
} | null {
  let totalMass = 0
  let px = 0, py = 0, pz = 0
  let mx = 0, my = 0, mz = 0

  for (const point of list) {
    totalMass += point.mass
    px += point.mass * point.position[0]
    py += point.mass * point.position[1]
    pz += point.mass * point.position[2]
    
    mx += point.mass * point.velocity[0]
    my += point.mass * point.velocity[1]
    mz += point.mass * point.velocity[2]
  }

  if (totalMass <= 0) return null

  return {
    mass: totalMass,
    position: [px / totalMass, py / totalMass, pz / totalMass],
    velocity: [mx / totalMass, my / totalMass, mz / totalMass],
    momentum: [mx, my, mz]
  }
}
