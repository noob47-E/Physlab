// The Sandbox's stage: the lights and the floor's metre grid.

import { useEffect, useMemo } from 'react'
import * as THREE from 'three/webgpu'
import { useSandbox } from '../../sim/store'
import type { BodyDef } from '../../sim/types'
import { niceStep } from '../cameraUtils'
import { themeColor, useThemed } from '../../app/theme'

/** The lights, and the floor's grid. */
export function Stage() {
  const bodies = useSandbox((s) => s.bodies)
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 12, 8]} intensity={1.3} />
      <directionalLight position={[-8, 5, -6]} intensity={0.35} />
      <FloorGrid bodies={bodies} />
    </>
  )
}

/** How far out from the middle the floor's grid is drawn, in metres: the old floor's own edge. */
const GRID_REACH = 100

/**
 * Metre lines on the floor. Without them two balls three metres apart and two balls thirty
 * centimetres apart look the same, and every distance has to be read off the panel instead of
 * seen. Fine lines near the origin, coarser ones out to GRID_REACH; the grid follows the theme.
 */
function FloorGrid({ bodies }: { bodies: BodyDef[] }) {
  // Read once per theme, not on every render: the grid re-renders whenever the bodies change.
  const gridColour = useThemed(() => themeColor('--grid-major'))
  const floor = bodies.find((b) => b.shape === 'ground')
  // Only the floor's footprint and height shape the grid, so a change to anything else about the
  // floor (its material, say) leaves the geometry alone.
  const width = floor?.size[0]
  const thickness = floor?.size[1]
  const y = floor?.position[1]
  const grid = useMemo(() => {
    if (width === undefined || thickness === undefined || y === undefined) return null
    // The grid is for reading distances near the experiment, so it stops at GRID_REACH however
    // big the floor is: drawn out to a floor kilometres wide, its lines would crowd into a band
    // of noise along the horizon.
    const half = Math.min(GRID_REACH, Math.max(4, width / 2))
    const top = y + thickness / 2 + 0.002
    const fine = Math.min(20, half)
    const coarse = niceStep(half / 10)
    const pts: number[] = []
    for (let x = -fine; x <= fine + 1e-9; x += 1) pts.push(x, top, -fine, x, top, fine)
    for (let z = -fine; z <= fine + 1e-9; z += 1) pts.push(-fine, top, z, fine, top, z)
    if (half > fine) {
      for (let x = -half; x <= half + 1e-9; x += coarse) pts.push(x, top, -half, x, top, half)
      for (let z = -half; z <= half + 1e-9; z += coarse) pts.push(-half, top, z, half, top, z)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [width, thickness, y])
  useEffect(() => () => grid?.dispose(), [grid])
  if (!grid) return null
  return (
    <lineSegments geometry={grid} renderOrder={1}>
      <lineBasicMaterial key={gridColour} color={gridColour} transparent opacity={0.85} />
    </lineSegments>
  )
}
