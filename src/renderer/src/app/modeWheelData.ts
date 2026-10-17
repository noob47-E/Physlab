// Mode Wheel data and geometry helpers (Part L2: The Esc Mode Wheel)
//
// The wheel contains exactly 7 modes arranged clockwise starting with Calculator at the top (12 o'clock).
// Each mode has its id, label, short description, color token, and 1-based index (for keys 1-7).

import type { ModeId } from './modes'

interface WheelModeItem {
  id: ModeId
  index: number // 1 to 7
  label: string
  shortDesc: string
  colorToken: string
  colorVar: string
}

export const WHEEL_MODES: WheelModeItem[] = [
  {
    id: 'calculator',
    index: 1,
    label: 'Calculator',
    shortDesc: 'Calculations, algebra, calculus and units',
    colorToken: 'var(--mode-calculator)',
    colorVar: '--mode-calculator'
  },
  {
    id: 'graphing',
    index: 2,
    label: 'Graphing',
    shortDesc: 'Plot functions, curves, families and intersections',
    colorToken: 'var(--mode-graphing)',
    colorVar: '--mode-graphing'
  },
  {
    id: 'shapes',
    index: 3,
    label: 'Geometry',
    shortDesc: 'Constructions, measurements, shapes and theorems',
    colorToken: 'var(--mode-geometry)',
    colorVar: '--mode-geometry'
  },
  {
    id: 'vectors',
    index: 4,
    label: 'Vectors',
    shortDesc: 'Vector arithmetic, components, dot and cross products',
    colorToken: 'var(--mode-vectors)',
    colorVar: '--mode-vectors'
  },
  {
    id: 'sandbox',
    index: 5,
    label: 'Sandbox',
    shortDesc: 'Interactive 3D rigid-body physics simulation',
    colorToken: 'var(--mode-sandbox)',
    colorVar: '--mode-sandbox'
  },
  {
    id: 'problems',
    index: 6,
    label: 'Problem Sets',
    shortDesc: 'Curated practice questions and step-by-step hints',
    colorToken: 'var(--mode-problems)',
    colorVar: '--mode-problems'
  },
  {
    id: 'lab',
    index: 7,
    label: 'Lab Data',
    shortDesc: 'Data tables, regression curves, charts and error bars',
    colorToken: 'var(--mode-lab)',
    colorVar: '--mode-lab'
  }
]

/** Get mode by 1-based index (for key shortcuts 1-7). */
export function getWheelModeByIndex(index: number): WheelModeItem | undefined {
  if (index < 1 || index > WHEEL_MODES.length) return undefined
  return WHEEL_MODES[index - 1]
}

/** Get wheel index (0 to 6) for a given mode id. */
export function getWheelIndexByModeId(modeId: ModeId): number {
  const idx = WHEEL_MODES.findIndex((m) => m.id === modeId)
  return idx >= 0 ? idx : 0
}

/**
 * Angles for the 7 segments.
 * Calculator is at 12 o'clock (-90°).
 * Each slice spans 360 / 7 ≈ 51.42857°.
 */
const SEGMENT_SPAN = 360 / WHEEL_MODES.length
const SEGMENT_GAP = 2.5 // degrees gap between segments

export function getSegmentAngles(index: number): { startAngle: number; endAngle: number; midAngle: number } {
  const midAngle = -90 + index * SEGMENT_SPAN
  const halfSpan = (SEGMENT_SPAN - SEGMENT_GAP) / 2
  return {
    startAngle: midAngle - halfSpan,
    endAngle: midAngle + halfSpan,
    midAngle
  }
}

/** Convert polar (radius, angleInDegrees) to cartesian (x, y) relative to center. */
export function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180.0
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians)
  }
}

/**
 * Generate SVG path description for an annular ring sector.
 */
export function describeAnnularSector(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number
): string {
  const p1 = polarToCartesian(cx, cy, outerR, startAngle)
  const p2 = polarToCartesian(cx, cy, outerR, endAngle)
  const p3 = polarToCartesian(cx, cy, innerR, endAngle)
  const p4 = polarToCartesian(cx, cy, innerR, startAngle)

  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1

  return [
    `M ${p1.x} ${p1.y}`,
    `A ${outerR} ${outerR} 0 ${largeArcFlag} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${innerR} ${innerR} 0 ${largeArcFlag} 0 ${p4.x} ${p4.y}`,
    'Z'
  ].join(' ')
}
