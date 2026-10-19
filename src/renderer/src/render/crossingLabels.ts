import type { KeyPoint } from '../math/graphs'

export interface ScreenPoint {
  x: number
  y: number
}

/**
 * Filter intersection labels to show based on pointer position and selection.
 * Returns only the nearest intersection (within ~24 px) or the selected one.
 * Non-intersection labels (roots, max, min, y-intercepts) are passed through unchanged.
 */
export function crossingLabelsToShow(
  keys: KeyPoint[],
  screenPoints: ScreenPoint[],
  pointer: ScreenPoint | null,
  selectedKey: number | null
): number[] {
  // Separate intersection from non-intersection key points
  const nonIntersectionIndices: number[] = []
  const intersectionIndices: number[] = []

  keys.forEach((k, i) => {
    if (k.kind === 'intersection') {
      intersectionIndices.push(i)
    } else {
      nonIntersectionIndices.push(i)
    }
  })

  // Always show non-intersection labels
  const result = [...nonIntersectionIndices]

  // Handle intersection labels
  if (intersectionIndices.length === 0) {
    return result
  }

  // If pointer is available, find the nearest intersection (within ~24px)
  if (pointer !== null) {
    let nearestIdx = -1
    let nearestDist = 24

    for (const idx of intersectionIndices) {
      const sp = screenPoints[idx]
      if (!sp || !Number.isFinite(sp.x) || !Number.isFinite(sp.y)) continue

      const dist = Math.hypot(sp.x - pointer.x, sp.y - pointer.y)
      if (dist < nearestDist) {
        nearestDist = dist
        nearestIdx = idx
      }
    }

    // Add the nearest intersection if one was found
    if (nearestIdx >= 0) {
      result.push(nearestIdx)
      return result
    }
  }

  // If a specific intersection is selected, show it
  if (selectedKey !== null && intersectionIndices.includes(selectedKey)) {
    result.push(selectedKey)
  }

  return result
}
